"""Reglas verificadas en servidor. Importes en centavos, horarios en México."""
from __future__ import annotations
from copy import deepcopy
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo
from uuid import uuid4
import json
import re

CASINOS=['Esmeralda','Sophia','Anakai','Regina']
ROLES=['Mesero','Maestro de ceremonias','DJ','Cocina','Baños','Poli','Puerta','Barra']
MEATS=['Lomo natural','Lomo mechado','Pastel de carne','Pollo Florentina (+$15.00 extra)','Pollo con vegetales (+$15.00 extra)']
SALSA=['Greiby de champiñón','Crema de almendras','Crema de poblano','Salsa de almendras','Salsa chipotle','Salsa Teriyaki']
PREMIUM=set(MEATS[3:])
METHODS=['Efectivo','Transferencia','Tarjeta']
FIELDS={'carne':MEATS,'carne2':MEATS,'salsa':SALSA,'salsa2':SALSA,'espagueti':['Blanco','Verde','Rojo'],
 'guarnicion':['Verduras al vapor','Puré de papa','Ensalada española','Ensalada mediterránea'],
 'guarnicion2':['Verduras al vapor','Puré de papa','Ensalada española','Ensalada mediterránea'],
 'mesa':['Redonda','Cuadrada'],'silla':['Acojinada','Tiffany'],'cubremantel':['Encaje','Morado','Beige','Dorado con negro'],
 'cubresilla':['Blanco','Negro'],'plato':['Madera','Acero inox.'],'centro':['1','2','3']}

def today(): return datetime.now(ZoneInfo('America/Mexico_City')).date()
def uid(): return uuid4().hex

def text(value, maximum=1500):
    if not isinstance(value,str) or len(value)>maximum: raise ValueError('Texto inválido o demasiado largo.')
    return value.strip()

def identifier(value):
    if not isinstance(value,(int,str)) or isinstance(value,bool): raise ValueError('Identificador inválido.')
    result=str(value)
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',result): raise ValueError('Identificador inválido.')
    return result

def integer(value,low=0,high=100000000000):
    if isinstance(value,bool): raise ValueError('Importe o cantidad inválida.')
    try: d=Decimal(str(value))
    except InvalidOperation: raise ValueError('Importe o cantidad inválida.')
    if not d.is_finite() or d!=d.to_integral_value() or not low<=d<=high: raise ValueError('Importe o cantidad fuera de rango.')
    return int(d)

def cents(value):
    if not re.fullmatch(r'\d+(?:\.\d{1,2})?',str(value)): raise ValueError('Usa pesos con un máximo de dos decimales.')
    return integer(Decimal(str(value))*100)

def iso(value):
    s=text(value,10)
    if date.fromisoformat(s).isoformat()!=s: raise ValueError('Fecha inválida.')
    return s

def schedule(day,start):
    day=iso(day)
    if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',str(start)): raise ValueError('Hora inválida.')
    if start>'22:00': raise ValueError('El evento debe comenzar como máximo a las 10:00 p. m.')
    begin=datetime.fromisoformat(day+'T'+start);end=begin+timedelta(hours=5)
    return end.date().isoformat(),end.strftime('%H:%M')

def pricing(details):
    if not details.get('personas') or str(details.get('precioPersona',''))=='': return None
    count=integer(details['personas'],1,10000);unit=cents(details['precioPersona'])
    combine=bool(details.get('combinar'))
    if combine and count<200: raise ValueError('Combinar platillos requiere al menos 200 personas.')
    meat=[details.get('carne')]+([details.get('carne2')] if combine else [])
    extra=(1500 if any(m in PREMIUM for m in meat) else 0)+(1000 if details.get('extraGuarnicion') else 0)
    return {'count':count,'unit':unit,'base':integer(count*unit),'extraUnit':extra,'extra':integer(count*extra),'total':integer(count*(unit+extra))}

def empty_state(): return {'version':2,'personnel':[],'events':[],'assignments':[],'staffPayments':[]}

def validate(raw, now=None):
    supplied_now=now
    now=now or today()
    clock=datetime.combine(now,datetime.max.time()) if supplied_now else datetime.now(ZoneInfo('America/Mexico_City')).replace(tzinfo=None)
    if not isinstance(raw,dict) or raw.get('version')!=2: raise ValueError('Respaldo incompatible: se necesita la versión Calderón 2.')
    if len(json.dumps(raw,ensure_ascii=False))>8_000_000: raise ValueError('Datos demasiado grandes.')
    out=empty_state();seen=set()
    def take_id(row):
        i=identifier(row.get('id'))
        if i in seen: raise ValueError('Hay identificadores duplicados.')
        seen.add(i);return i
    for collection in ['personnel','events','assignments','staffPayments']:
        if not isinstance(raw.get(collection),list) or len(raw[collection])>20000: raise ValueError('Colección inválida: '+collection)
    for p in raw['personnel']:
        if not isinstance(p,dict): raise ValueError('Personal inválido.')
        name=text(p.get('name'),100)
        if not name or p.get('role') not in ROLES or p.get('casino') not in CASINOS: raise ValueError('Nombre, rol o casino de personal inválido.')
        if not isinstance(p.get('active',True),bool): raise ValueError('Estatus de personal inválido.')
        out['personnel'].append({'id':take_id(p),'name':name,'role':p['role'],'casino':p['casino'],'active':p.get('active',True)})
    people={p['id']:p for p in out['personnel']}
    for e in raw['events']:
        if not isinstance(e,dict): raise ValueError('Evento inválido.')
        eid=take_id(e);name=text(e.get('name'),120);casino=integer(e.get('casinoId'),1,4)
        if not name: raise ValueError('El evento necesita un nombre.')
        day=iso(e.get('startDate'));start=text(e.get('startTime'),5);end_day,end_time=schedule(day,start)
        if e.get('endDate')!=end_day or e.get('endTime')!=end_time: raise ValueError('La duración debe ser de cinco horas.')
        details=e.get('details') or {}
        if not isinstance(details,dict): raise ValueError('Ficha inválida.')
        d={}
        for k,v in details.items():
            if k in ['combinar','extraGuarnicion']:
                if not isinstance(v,bool): raise ValueError('Opción inválida: '+k)
                d[k]=v
            elif k in FIELDS:
                val=text(v,120)
                if val and val not in FIELDS[k]: raise ValueError('Opción no reconocida: '+k)
                d[k]=val
            elif k in ['personas','precioPersona','titulo','contratante','fecha','inicio','fin','totalCalculado','otros','mantel','caminos','banda','servilletas','sugerencias','proveedor','domicilioProveedor','contactoProveedor','domicilioCliente','contactoCliente','domicilioSalon','condiciones']:
                d[k]=text(str(v),1500)
        if d.get('personas'): integer(d['personas'],1,10000)
        if d.get('precioPersona') not in [None,'']: cents(d['precioPersona'])
        price=pricing(d);total=price['total'] if price else 0
        payments=[];deposit=False
        for p in e.get('payments',[]):
            amount=integer(p.get('amount'),1);pay_day=iso(p.get('date'));concept=p.get('concept');method=p.get('method')
            if pay_day>str(now) or concept not in ['Apartado','Abono','Liquidación'] or method not in METHODS: raise ValueError('Fecha, concepto o método de cobro inválido.')
            if concept=='Apartado':
                if deposit: raise ValueError('El apartado del cliente ya está registrado.')
                deposit=True
            remaining=total-sum(x['amount'] for x in payments)
            if amount>remaining: raise ValueError('El cobro supera el saldo del evento.')
            if concept=='Liquidación' and amount!=remaining: raise ValueError('La liquidación debe cubrir el saldo exacto.')
            payments.append({'id':take_id(p),'date':pay_day,'concept':concept,'amount':amount,'method':method,'note':text(p.get('note',''),200)})
        completed=e.get('completed',False)
        if not isinstance(completed,bool): raise ValueError('Estatus de evento inválido.')
        if completed and datetime.fromisoformat(end_day+'T'+end_time)>clock: raise ValueError('No puedes confirmar un evento futuro como realizado.')
        plan=e.get('staffing',[])
        if not isinstance(plan,list) or len(plan)>len(ROLES): raise ValueError('Plan de personal inválido.')
        staffing=[];roles=set()
        for need in plan:
            role=need.get('role')
            if role not in ROLES or role in roles: raise ValueError('Rol duplicado o inválido en el plan.')
            roles.add(role);staffing.append({'role':role,'count':integer(need.get('count'),0,100),'payCents':integer(need.get('payCents'),0)})
        out['events'].append({'id':eid,'casinoId':casino,'name':name,'type':text(e.get('type','Evento'),80),
            'startDate':day,'startTime':start,'endDate':end_day,'endTime':end_time,'details':d,
            'totalCents':total,'payments':payments,'completed':completed,'staffing':staffing})
    events={e['id']:e for e in out['events']}
    for cid in range(1,5):
        ordered=sorted([e for e in out['events'] if e['casinoId']==cid],key=lambda e:e['startDate']+'T'+e['startTime'])
        for a,b in zip(ordered,ordered[1:]):
            end=datetime.fromisoformat(a['endDate']+'T'+a['endTime'])
            start=datetime.fromisoformat(b['startDate']+'T'+b['startTime'])
            if start<end+timedelta(hours=6): raise ValueError('Deja al menos 6 horas entre el fin de un evento y el inicio del siguiente en el mismo casino.')
    assigned=set()
    for a in raw['assignments']:
        aid=take_id(a);pid=identifier(a.get('personId'));eid=identifier(a.get('eventId'))
        if pid not in people or eid not in events: raise ValueError('Asignación con personal o evento inexistente.')
        key=(pid,events[eid]['startDate'])
        if key in assigned: raise ValueError('Una persona no puede trabajar en dos eventos el mismo día.')
        assigned.add(key)
        role=a.get('role',people[pid]['role'])
        if role not in ROLES: raise ValueError('Rol de turno inválido.')
        out['assignments'].append({'id':aid,'personId':pid,'eventId':eid,'payCents':integer(a.get('payCents'),0),'role':role})
    for pid in people:
        shifts=sorted([events[a['eventId']] for a in out['assignments'] if a['personId']==pid],key=lambda e:e['startDate']+'T'+e['startTime'])
        for first,second in zip(shifts,shifts[1:]):
            if first['endDate']+'T'+first['endTime']>second['startDate']+'T'+second['startTime']: raise ValueError('Los turnos de una persona se cruzan durante la madrugada.')
    assignments={a['id']:a for a in out['assignments']};paid={} 
    for p in raw['staffPayments']:
        sid=take_id(p);aid=identifier(p.get('assignmentId'));pay_day=iso(p.get('date'));amount=integer(p.get('amount'),1)
        if aid not in assignments or pay_day>str(now) or p.get('method') not in METHODS: raise ValueError('Pago al personal inválido.')
        paid[aid]=paid.get(aid,0)+amount
        if paid[aid]>assignments[aid]['payCents']: raise ValueError('El pago al trabajador supera el importe de su turno.')
        out['staffPayments'].append({'id':sid,'assignmentId':aid,'date':pay_day,'amount':amount,'method':p['method']})
    return out

def assign_auto(snapshot,event_id,role,count,pay):
    data=deepcopy(snapshot);count=integer(count,1,100);pay=integer(pay)
    event=next((e for e in data['events'] if str(e['id'])==str(event_id)),None)
    if not event or event.get('completed'): raise ValueError('Selecciona un evento programado.')
    if role not in ROLES: raise ValueError('Rol inválido.')
    event_map={str(e['id']):e for e in data['events']}
    busy={str(a['personId']) for a in data['assignments'] if event_map[str(a['eventId'])]['startDate']==event['startDate']}
    def rank(person):
        cutoff=str(date.fromisoformat(event['startDate'])-timedelta(days=14))
        history=[event_map[str(a['eventId'])] for a in data['assignments'] if str(a['personId'])==str(person['id']) and cutoff<=event_map[str(a['eventId'])]['startDate']<event['startDate']]
        if event['casinoId']==3:
            return (person['casino']=='Anakai',sum(e['casinoId']==3 for e in history),len(history),person['name'].casefold())
        return (person['casino']!=CASINOS[event['casinoId']-1],len(history),person['name'].casefold())
    begin=datetime.fromisoformat(event['startDate']+'T'+event['startTime']);end=datetime.fromisoformat(event['endDate']+'T'+event['endTime'])
    for a in data['assignments']:
        shift=event_map[str(a['eventId'])]
        if begin<datetime.fromisoformat(shift['endDate']+'T'+shift['endTime']) and end>datetime.fromisoformat(shift['startDate']+'T'+shift['startTime']): busy.add(str(a['personId']))
    available=sorted([p for p in data['personnel'] if p.get('active',True) and p['role']==role and str(p['id']) not in busy],key=rank)
    if len(available)<count: raise ValueError(f'Faltan {count-len(available)} personas disponibles para {role}. No se asignó nadie.')
    for p in available[:count]: data['assignments'].append({'id':uid(),'personId':str(p['id']),'eventId':str(event_id),'payCents':pay,'role':role})
    return validate(data)

def week_window(reference=None):
    reference=date.fromisoformat(reference) if isinstance(reference,str) else reference or today()
    monday=reference-timedelta(days=reference.weekday())
    return monday,monday+timedelta(days=7),monday+timedelta(days=14)

def prepare_week(snapshot,reference=None,week_offset=1):
    """Completa planes de la próxima semana sin duplicar; todo o ningún cambio."""
    data=deepcopy(snapshot);monday,_,_=week_window(reference)
    start=monday+timedelta(days=7*week_offset);end=start+timedelta(days=7)
    events=sorted([e for e in data['events'] if str(start)<=e['startDate']<str(end) and not e['completed']],key=lambda e:(e['startDate'],e['startTime'],e['casinoId']))
    for event in events:
        assigned=[a for a in data['assignments'] if str(a['eventId'])==str(event['id'])]
        people={str(p['id']):p for p in data['personnel']}
        for need in event.get('staffing',[]):
            matching=[a for a in data['assignments'] if str(a['eventId'])==str(event['id']) and a.get('role',people[str(a['personId'])]['role'])==need['role']]
            def paid(a): return sum(p['amount'] for p in data['staffPayments'] if str(p['assignmentId'])==str(a['id']))
            excess=len(matching)-need['count']
            if excess>0:
                removable=[a for a in reversed(matching) if not paid(a)]
                if len(removable)<excess: raise ValueError(f"{event['name']}: hay turnos con anticipos; no se pueden quitar. No se guardó ningún cambio semanal.")
                remove={a['id'] for a in removable[:excess]}
                data['assignments']=[a for a in data['assignments'] if a['id'] not in remove]
                matching=[a for a in matching if a['id'] not in remove]
            for assignment in matching:
                if need['payCents']<paid(assignment): raise ValueError('La nueva paga sería menor que los anticipos entregados. No se guardó ningún cambio semanal.')
                assignment['payCents']=need['payCents']
            missing=need['count']-len(matching)
            if missing>0:
                try: data=assign_auto(data,event['id'],need['role'],missing,need['payCents'])
                except ValueError as error: raise ValueError(f"{event['name']} ({event['startDate']}): {error} No se guardó ningún cambio semanal.") from error
    return validate(data)

def prepare_envelopes(snapshot,reference=None):
    # Ambos acomodos se guardan en una sola transacción por el llamador.
    current=prepare_week(snapshot,reference,week_offset=0)
    return prepare_week(current,reference)

def weekly_notices(data,reference=None):
    return [row for row in envelopes(data,reference) if row['deliveryEvent'] is None and row['upcoming']]

def envelopes(data,reference=None):
    reference=date.fromisoformat(reference) if isinstance(reference,str) else reference or today()
    start,next_start,next_end=week_window(reference)
    events={str(e['id']):e for e in data['events']};result=[]
    for person in sorted(data['personnel'],key=lambda p:(CASINOS.index(p['casino']),p['name'].casefold())):
        jobs=[];upcoming=[];this_week=[]
        for a in data['assignments']:
            if str(a['personId'])!=str(person['id']): continue
            e=events[str(a['eventId'])]
            paid=sum(p['amount'] for p in data['staffPayments'] if str(p['assignmentId'])==str(a['id']) and p['date']<=str(reference))
            if str(start)<=e['startDate']<str(next_start):
                this_week.append(e)
                if a['payCents']>paid: jobs.append({'assignment':a,'event':e,'balance':a['payCents']-paid})
            if not e['completed'] and str(next_start)<=e['startDate']<str(next_end): upcoming.append(e)
        upcoming.sort(key=lambda e:e['startDate']+'T'+e['startTime'])
        last=max(this_week,key=lambda e:(e['startDate'],e['startTime']),default=None)
        masters=[]
        if last:
            for shift in data['assignments']:
                if str(shift['eventId'])!=str(last['id']): continue
                worker=next(p for p in data['personnel'] if str(p['id'])==str(shift['personId']))
                if shift.get('role',worker['role'])=='Maestro de ceremonias': masters.append(worker['name'])
        if person.get('active',True) or jobs or upcoming:
            result.append({'person':person,'amount':sum(j['balance'] for j in jobs),'jobs':jobs,'next':upcoming[0] if upcoming else None,'upcoming':upcoming,'delivery':last['endDate'] if last else None,'deliveryEvent':last,'deliveryCasinoId':last['casinoId'] if last else None,'masters':masters})
    return result

def envelope_groups(data,reference=None):
    """Un solo sobre por persona: último salón donde trabaja esta semana."""
    start,end,_=week_window(reference)
    rows=envelopes(data,reference)
    return [{'id':cid,'name':name,'events':[e for e in data['events'] if e['casinoId']==cid and str(start)<=e['startDate']<str(end)],'envelopes':[row for row in rows if row['deliveryEvent'] is not None and row['deliveryCasinoId']==cid]} for cid,name in enumerate(CASINOS,1)]

def demo_data(now=None):
    now=now or today();data=empty_state()
    for i in range(40):
        data['personnel'].append({'id':uid(),'name':f'Personal de prueba {i+1:02d}','role':ROLES[i%8],'casino':CASINOS[(i//8)%4]})
    past=now-timedelta(days=8+(now.weekday()-5)%7)
    future=now+timedelta(days=(5-now.weekday())%7 or 7)
    for when,done in [(past,False),(future,False)]:
        for cid in range(1,5):
            end_day,end_time=schedule(str(when),'20:00')
            details={'personas':'100','precioPersona':'250.00','carne':'Lomo natural','salsa':'Salsa chipotle','espagueti':'Blanco','guarnicion':'Puré de papa','combinar':False,'extraGuarnicion':False}
            eid=uid()
            data['events'].append({'id':eid,'casinoId':cid,'name':'Evento de prueba · '+CASINOS[cid-1], 'type':'Boda', 'startDate':str(when),'startTime':'20:00','endDate':end_day,'endTime':end_time,'details':details,'payments':[],'completed':False,'staffing':[{'role':r,'count':1,'payCents':50000} for r in ROLES]})
            # Selección determinista y sin dobles turnos para esta fecha.
            for role in ROLES:
                busy={a['personId'] for a in data['assignments'] if next(e for e in data['events'] if e['id']==a['eventId'])['startDate']==str(when)}
                p=next(p for p in data['personnel'] if p['role']==role and p['id'] not in busy)
                data['assignments'].append({'id':uid(),'personId':p['id'],'eventId':eid,'payCents':50000})
            if when==past: data['events'][-1]['completed']=True
    data['staffPayments'].append({'id':uid(),'assignmentId':data['assignments'][0]['id'],'date':str(now),'amount':10000,'method':'Efectivo'})
    return validate(data,now)
