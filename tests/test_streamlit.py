from pathlib import Path
from streamlit.testing.v1 import AppTest
from backend import uid

ROOT=Path(__file__).resolve().parents[1]

def test_app_boots_and_saves_component_request():
    at=AppTest.from_file(str(ROOT/'app.py'),default_timeout=30).run()
    assert not at.exception and len(at.get('bidi_component'))==1
    store=at.session_state['test_store'];snapshot,rev=store.read()
    assert len(snapshot['personnel'])==40
    snapshot['personnel'].append({'id':uid(),'name':'Alta de prueba','role':'DJ','casino':'Regina'})
    key='calderon-ui-pruebas-pruebas-0'
    at.session_state[key]={'command':{'id':uid(),'revision':rev,'type':'save','snapshot':snapshot,'label':'Agregar personal'}}
    at.run()
    assert not at.exception
    saved,revision=at.session_state['test_store'].read()
    assert len(saved['personnel'])==41 and revision==1
    assert at.session_state['reply']['ok'] is True

def test_app_rejects_invalid_component_request():
    at=AppTest.from_file(str(ROOT/'app.py'),default_timeout=30).run()
    snapshot,rev=at.session_state['test_store'].read();snapshot['personnel'][0]['casino']='Inventado'
    at.session_state['calderon-ui-pruebas-pruebas-0']={'command':{'id':uid(),'revision':rev,'type':'save','snapshot':snapshot}}
    at.run();assert not at.exception
    assert at.session_state['test_store'].read()[1]==0
    assert at.session_state['reply']['ok'] is False


def test_app_weekly_assignment_and_contract_download_commands():
    from backend import empty_state,week_window,schedule
    from storage import MemoryStore
    s=empty_state();s['personnel']=[dict(id='dj',name='DJ de prueba',role='DJ',casino='Regina')]
    day=str(week_window()[1]);end,hour=schedule(day,'20:00')
    s['events']=[dict(id='fiesta',casinoId=4,name='Fiesta de prueba',type='Boda',startDate=day,startTime='20:00',endDate=end,endTime=hour,details=dict(contratante='Cliente de prueba',personas='100',precioPersona='250'),payments=[],completed=False,staffing=[dict(role='DJ',count=1,payCents=60000)])]
    at=AppTest.from_file(str(ROOT/'app.py'),default_timeout=30).run();at.session_state['test_store']=MemoryStore(s)
    key='calderon-ui-pruebas-pruebas-0'
    at.session_state[key]={'command':dict(id=uid(),revision=0,type='prepare_envelopes')};at.run()
    assert not at.exception and at.session_state['reply']['ok']
    saved,revision=at.session_state['test_store'].read();assert len(saved['assignments'])==1
    at.session_state[key]={'command':dict(id=uid(),revision=revision,type='contract',eventId='fiesta')};at.run()
    assert not at.exception and at.session_state['reply'].get('contractPdf','').startswith('JVBER'),at.session_state['reply']


def test_app_boots_with_stale_backend_cached_in_python(monkeypatch):
    import sys
    from types import ModuleType
    stale=ModuleType('backend')
    stale.today=lambda:None
    monkeypatch.setitem(sys.modules,'backend',stale)
    at=AppTest.from_file(str(ROOT/'app.py'),default_timeout=30).run()
    assert not at.exception
    assert len(at.session_state['test_store'].read()[0]['personnel'])==40
