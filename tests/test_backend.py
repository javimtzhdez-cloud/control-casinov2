import json
from copy import deepcopy
from datetime import date,timedelta
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import pytest
from pypdf import PdfReader
from backend import *
from storage import MemoryStore,Conflict
from printing import envelope_pdf


def fixture_state(): return demo_data()

def test_demo_validates_and_uses_all_casinos():
    s=fixture_state();assert len(s['personnel'])==40 and len(s['events'])==8
    assert {p['casino'] for p in s['personnel']}==set(CASINOS)
    assert validate(s)==s

@pytest.mark.parametrize('start,end,extra',[('18:00','23:00',0),('19:00','00:00',1),('22:00','03:00',1)])
def test_schedule(start,end,extra):
    d,t=schedule('2026-12-31',start);assert t==end and d==str(date(2026,12,31)+timedelta(days=extra))

@pytest.mark.parametrize('start',['22:01','23:59','24:00','wrong'])
def test_reject_late_times(start):
    with pytest.raises(ValueError):schedule('2026-11-28',start)

def test_prices_extras_and_exact_cents():
    d={'personas':'200','precioPersona':'300.15','carne':MEATS[3],'carne2':MEATS[4],'combinar':True,'extraGuarnicion':True}
    p=pricing(d);assert p['total']==6503000 and p['extra']==500000
    d['combinar']=False;d['carne']='Lomo natural';assert pricing(d)['total']==6203000
    with pytest.raises(ValueError):pricing(dict(d,precioPersona='1.999'))
    with pytest.raises(ValueError):pricing(dict(d,combinar=True,personas='199'))

def test_server_recomputes_tampered_total():
    s=fixture_state();s['events'][0]['totalCents']=1
    assert validate(s)['events'][0]['totalCents']==2500000

def test_client_payments_cannot_exceed_balance():
    s=fixture_state();e=s['events'][0]
    e['payments']=[{'id':uid(),'date':str(today()),'concept':'Apartado','amount':10000,'method':'Efectivo','note':''}]
    e['payments'].append({'id':uid(),'date':str(today()),'concept':'Abono','amount':e['totalCents'],'method':'Tarjeta','note':''})
    with pytest.raises(ValueError): validate(s)

def test_payroll_never_uses_customer_collections():
    s=fixture_state();f=today()+timedelta(days=(4-today().weekday())%7)
    before=sum(e['amount'] for e in envelopes(s,str(f)))
    s['events'][0]['payments']=[{'id':uid(),'date':str(today()),'concept':'Apartado','amount':100000,'method':'Tarjeta','note':''}]
    assert sum(e['amount'] for e in envelopes(validate(s),str(f)))==before

def test_duplicate_person_same_day_is_rejected():
    s=fixture_state();a=deepcopy(s['assignments'][0]);a['id']=uid();s['assignments'].append(a)
    with pytest.raises(ValueError,match='dos eventos'):validate(s)

def test_auto_assign_base_and_no_partial_insufficiency():
    s=empty_state();day=today()+timedelta(days=(5-today().weekday())%7 or 7);end,hour=schedule(str(day),'20:00')
    for i,casino in enumerate(CASINOS):s['personnel'].append({'id':uid(),'name':f'Test {i}','role':'Mesero','casino':casino})
    e={'id':uid(),'casinoId':2,'name':'Prueba','type':'Boda','startDate':str(day),'startTime':'20:00','endDate':end,'endTime':hour,'details':{},'payments':[],'completed':False}
    s['events'].append(e);s=validate(s)
    assigned=assign_auto(s,e['id'],'Mesero',1,50000);p=next(p for p in assigned['personnel'] if p['id']==assigned['assignments'][0]['personId']);assert p['casino']=='Sophia'
    before=deepcopy(s)
    with pytest.raises(ValueError): assign_auto(s,e['id'],'Mesero',8,50000)
    assert s==before

def test_advance_reduces_envelope_and_overpay_is_rejected():
    s=fixture_state();f=today()+timedelta(days=(4-today().weekday())%7)
    reference=s['events'][0]['startDate'];s['staffPayments'][0]['date']=reference
    row=next(r for r in envelopes(s,reference) if r['person']['id']==s['assignments'][0]['personId'])
    assert row['amount']==40000
    s['staffPayments'].append({'id':uid(),'assignmentId':s['assignments'][0]['id'],'date':str(today()),'amount':40001,'method':'Efectivo'})
    with pytest.raises(ValueError,match='supera'):validate(s)

def test_store_rollback_revision_and_idempotency():
    store=MemoryStore();s,rev=store.read();s['personnel'].append({'id':uid(),'name':'Ana','role':'DJ','casino':'Regina'})
    saved,new_rev=store.save(s,rev,'one');assert new_rev==1
    assert store.save(s,rev,'one')[1]==1
    with pytest.raises(Conflict):store.save(s,0,'two')
    bad=deepcopy(saved);bad['personnel'][0]['casino']='Unknown'
    with pytest.raises(ValueError):store.save(bad,1,'bad')
    assert store.read()[1]==1

def test_two_sessions_cannot_overwrite_each_other():
    store=MemoryStore();a,_=store.read();b,_=store.read()
    a['personnel'].append({'id':uid(),'name':'Ana','role':'DJ','casino':'Regina'})
    b['personnel'].append({'id':uid(),'name':'Beto','role':'Barra','casino':'Anakai'})
    def save(item):
        data,key=item
        try:store.save(data,0,key);return 1
        except Conflict:return 0
    with ThreadPoolExecutor(max_workers=2) as pool:assert sum(pool.map(save,[(a,'a'),(b,'b')]))==1
    assert len(store.read()[0]['personnel'])==1

def test_pdf_40_labels_and_backup_roundtrip():
    s=fixture_state();f=today()+timedelta(days=(4-today().weekday())%7)
    pdf=envelope_pdf(s,str(f));reader=PdfReader(BytesIO(pdf));assert len(reader.pages)>=4
    assert tuple(float(x) for x in reader.pages[0].mediabox)==(0,0,612,792)
    content=''.join(p.extract_text() for p in reader.pages)
    for p in s['personnel']:assert p['name'] in content
    assert validate(json.loads(json.dumps(s)))==s

def test_week_is_monday_to_sunday():
    assert week_window('2026-12-31')==(date(2026,12,28),date(2027,1,4),date(2027,1,11))
    assert len(envelopes(fixture_state(),'2026-11-24'))==40


def event_on(day,start='20:00',casino=1,name='Evento'):
    end,hour=schedule(day,start)
    return dict(id=uid(),casinoId=casino,name=name,type='Boda',startDate=day,startTime=start,endDate=end,endTime=hour,details={},payments=[],completed=False,staffing=[])

@pytest.mark.parametrize('second,allowed',[('08:59',False),('09:00',True),('09:01',True)])
def test_cleaning_gap_across_midnight(second,allowed):
    s=empty_state();s['events']=[event_on('2026-12-31','22:00'),event_on('2027-01-01',second)]
    if allowed: assert len(validate(s)['events'])==2
    else:
        with pytest.raises(ValueError,match='6 horas'):validate(s)

@pytest.mark.parametrize('second,allowed',[('16:59',False),('17:00',True)])
def test_cleaning_gap_same_day(second,allowed):
    s=empty_state();s['events']=[event_on('2027-01-01','06:00'),event_on('2027-01-01',second)]
    if allowed:validate(s)
    else:
        with pytest.raises(ValueError,match='6 horas'):validate(s)

def test_different_casinos_do_not_require_gap():
    s=empty_state();s['events']=[event_on('2027-01-01'),event_on('2027-01-01',casino=2)];validate(s)

def weekly_fixture():
    s=empty_state();s['personnel']=[dict(id='ana',name='Ana',role='Mesero',casino='Esmeralda')]
    for day in ['2026-11-10','2026-11-17','2026-11-20','2026-11-24','2026-12-01']:
        e=event_on(day);e['completed']=day<'2026-11-19';s['events'].append(e)
        s['assignments'].append(dict(id=uid(),eventId=e['id'],personId='ana',payCents=50000))
    s['staffPayments']=[dict(id=uid(),assignmentId=s['assignments'][1]['id'],date='2026-11-18',amount=12500,method='Efectivo')]
    return validate(s)

def test_weekly_envelope_projects_all_current_week_and_all_next_week():
    s=weekly_fixture();row=envelopes(s,'2026-11-19')[0]
    assert row['amount']==87500
    assert [j['event']['startDate'] for j in row['jobs']]==['2026-11-17','2026-11-20']
    assert [e['startDate'] for e in row['upcoming']]==['2026-11-24']
    assert row['delivery']=='2026-11-21'

def test_weekly_preparation_is_idempotent_and_excludes_current_week():
    s=weekly_fixture();s['assignments']=[];s['staffPayments']=[]
    for e in s['events']:e['staffing']=[dict(role='Mesero',count=1,payCents=60000)]
    before=deepcopy(s);changed=prepare_week(s,'2026-11-19')
    assert s==before and len(changed['assignments'])==1
    assert changed['assignments'][0]['eventId']==s['events'][3]['id']
    assert prepare_week(changed,'2026-11-19')==changed

def test_weekly_preparation_rolls_back_if_second_event_lacks_staff():
    s=empty_state();s['personnel']=[dict(id='ana',name='Ana',role='Mesero',casino='Esmeralda')]
    for cid in [1,2]:
        e=event_on('2026-11-24',casino=cid);e['staffing']=[dict(role='Mesero',count=1,payCents=50000)];s['events'].append(e)
    before=deepcopy(s)
    with pytest.raises(ValueError,match='ningún cambio semanal'):prepare_week(s,'2026-11-19')
    assert s==before

def test_archived_people_keep_balances_and_are_not_auto_assigned():
    s=weekly_fixture();s['personnel'][0]['active']=False
    assert envelopes(validate(s),'2026-11-19')[0]['amount']==87500
    s['assignments']=s['assignments'][:2]
    with pytest.raises(ValueError,match='Faltan'):assign_auto(s,s['events'][3]['id'],'Mesero',1,50000)
    s['personnel']=[]
    with pytest.raises(ValueError,match='inexistente'):validate(s)

def test_edit_role_preserves_original_shift_role_and_pay():
    s=weekly_fixture();s['personnel'][0].update(name='Ana editada',role='DJ',casino='Regina')
    changed=validate(s)
    assert changed['assignments'][0]['role']=='Mesero' and changed['assignments'][0]['payCents']==50000
    assert changed['personnel'][0]['name']=='Ana editada'

def test_contract_contains_saved_event_deposit_and_terms():
    from printing import contract_pdf
    s=fixture_state();e=s['events'][0];e['details']['contratante']='Cliente de prueba';e['details']['proveedor']='Prestador de prueba'
    e['payments']=[dict(id=uid(),date=str(today()),concept='Apartado',amount=100000,method='Efectivo',note='Recibo 1')]
    content=''.join(page.extract_text() for page in PdfReader(BytesIO(contract_pdf(validate(s),e['id']))).pages)
    for expected in ['Cliente de prueba','Esmeralda','Boda',e['startDate'],'8:00 p. m.','1:00 a. m.','Apartado recibido','$1,000.00','Cancelación','BORRADOR']:
        assert expected.casefold() in content.casefold()


def test_weekly_plan_updates_future_rate_but_preserves_paid_history():
    s=weekly_fixture();e=s['events'][3];e['staffing']=[dict(role='Mesero',count=1,payCents=70000)]
    out=prepare_week(s,'2026-11-19')
    assert out['assignments'][1]['payCents']==50000
    assert next(a for a in out['assignments'] if a['eventId']==e['id'])['payCents']==70000
    e['staffing'][0]['count']=0
    assert not any(a['eventId']==e['id'] for a in prepare_week(s,'2026-11-19')['assignments'])


def test_casino_handoff_uses_last_shift_not_base_and_no_duplicate_envelope():
    s=weekly_fixture();person=s['personnel'][0];person['casino']='Regina'
    s['assignments']=[a for a in s['assignments'] if a['eventId']!=s['events'][2]['id']]
    event=event_on('2026-11-18',casino=2);event['completed']=True;s['events'].append(event)
    s['assignments'].append(dict(id=uid(),eventId=event['id'],personId='ana',payCents=45000))
    s['personnel'].append(dict(id='mc',name='Maestro Sophia',role='Maestro de ceremonias',casino='Sophia'))
    s['assignments'].append(dict(id=uid(),eventId=event['id'],personId='mc',payCents=10000))
    groups=envelope_groups(validate(s),'2026-11-19')
    assert [g['name'] for g in groups]==CASINOS
    rows=[(g['id'],r) for g in groups for r in g['envelopes'] if r['person']['id']=='ana']
    assert len(rows)==1 and rows[0][0]==2
    row=rows[0][1];assert row['amount']==82500 and row['masters']==['Maestro Sophia']
    assert row['upcoming'][0]['startDate']=='2026-11-24'


def test_casino_lists_omit_paid_people_and_next_week_only_workers():
    s=weekly_fixture();job=s['assignments'][1]
    s['staffPayments'].append(dict(id=uid(),assignmentId=job['id'],date='2026-11-19',amount=37500,method='Efectivo'))
    groups=envelope_groups(validate(s),'2026-11-19')
    assert len(groups)==4
    assert sum(r['amount'] for g in groups for r in g['envelopes'])==50000
    assert any(g['events'] for g in groups)
    assert not any(g['events'] for g in envelope_groups(empty_state(),'2026-11-19'))


def test_prepare_button_on_tuesday_projects_weekend_and_compares_next_week():
    s=empty_state();s['personnel']=[dict(id='ana',name='Ana',role='Mesero',casino='Esmeralda'),dict(id='beto',name='Beto',role='DJ',casino='Sophia')]
    for day,role,cid in [('2026-11-20','Mesero',1),('2026-11-21','Mesero',1),('2026-11-27','Mesero',1),('2026-11-28','DJ',2)]:
        e=event_on(day,casino=cid);e['staffing']=[dict(role=role,count=1,payCents=50000)];s['events'].append(e)
    before=deepcopy(s);prepared=prepare_envelopes(s,'2026-11-17')
    assert s==before and len(prepared['assignments'])==4
    assert prepared['staffPayments']==[] and not any(e['completed'] for e in prepared['events'])
    ana=next(r for r in envelopes(prepared,'2026-11-17') if r['person']['id']=='ana')
    assert ana['amount']==100000 and len(ana['jobs'])==2 and len(ana['upcoming'])==1
    assert ana['deliveryEvent']['startDate']=='2026-11-21'
    assert [r['person']['id'] for r in weekly_notices(prepared,'2026-11-17')]==['beto']
    assert prepare_envelopes(prepared,'2026-11-17')==prepared
    assert sum(len(g['envelopes']) for g in envelope_groups(prepared,'2026-11-17'))==1


def test_prepare_button_keeps_name_only_when_no_next_week_work():
    s=weekly_fixture();s['assignments']=[a for a in s['assignments'] if a['eventId']!=s['events'][3]['id']]
    row=next(r for g in envelope_groups(s,'2026-11-17') for r in g['envelopes'])
    assert row['upcoming']==[] and row['amount']==100000


def test_rotation_ignores_history_older_than_two_weeks():
    s=empty_state();s['personnel']=[dict(id='ana',name='Ana',role='Mesero',casino='Esmeralda'),dict(id='beto',name='Beto',role='Mesero',casino='Esmeralda')]
    for day,pid in [('2026-10-10','ana'),('2026-10-17','ana'),('2026-11-20','beto')]:
        e=event_on(day);s['events'].append(e);s['assignments'].append(dict(id=uid(),eventId=e['id'],personId=pid,payCents=50000))
    event=event_on('2026-11-27');s['events'].append(event)
    assigned=assign_auto(validate(s),event['id'],'Mesero',1,50000)
    assert assigned['assignments'][-1]['personId']=='ana'


def test_preparing_current_and_next_week_is_atomic_when_next_week_fails():
    s=empty_state();s['personnel']=[dict(id='ana',name='Ana',role='Mesero',casino='Esmeralda')]
    for day,role in [('2026-11-20','Mesero'),('2026-11-27','DJ')]:
        e=event_on(day);e['staffing']=[dict(role=role,count=1,payCents=50000)];s['events'].append(e)
    before=deepcopy(s)
    with pytest.raises(ValueError):prepare_envelopes(s,'2026-11-17')
    assert s==before
