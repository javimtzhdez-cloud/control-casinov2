"""Organización Calderón. Punto de entrada para Streamlit Cloud."""
from pathlib import Path
from copy import deepcopy
from datetime import timedelta, datetime
from zoneinfo import ZoneInfo
import base64
import hashlib
import hmac
import json
import threading
import time
import streamlit as st
from calderon_runtime import load_runtime

ROOT=Path(__file__).resolve().parent
runtime=load_runtime(ROOT)
rules=runtime.backend
today,empty_state,demo_data,validate,assign_auto,prepare_week,prepare_envelopes,week_window,text=(
    getattr(rules,name) for name in ('today','empty_state','demo_data','validate','assign_auto','prepare_week','prepare_envelopes','week_window','text'))
MemoryStore,PostgresStore,Conflict=runtime.storage.MemoryStore,runtime.storage.PostgresStore,runtime.storage.Conflict
envelope_pdf,contract_pdf=runtime.printing.envelope_pdf,runtime.printing.contract_pdf
st.set_page_config(page_title='Organización Calderón',page_icon='🎟️',layout='wide',initial_sidebar_state='collapsed')
st.markdown('<style>.block-container{max-width:1100px;padding:0.8rem 0.6rem 1rem} [data-testid="stHeader"]{background:transparent} [data-testid="stToolbar"]{opacity:.5}</style>',unsafe_allow_html=True)

@st.cache_resource
def login_attempts(): return {},threading.Lock()

def login(users):
    token=st.session_state.get('login',{})
    user=users.get(token.get('user'),{})
    key=hashlib.sha256(str(user.get('clave','')).encode()).hexdigest()
    if user and time.time()-token.get('at',0)<8*3600 and hmac.compare_digest(key,token.get('key','')): return token['user']
    with st.form('login'):
        st.subheader('Organización Calderón · Acceso')
        name=st.text_input('Usuario').strip().lower();password=st.text_input('Contraseña',type='password')
        submitted=st.form_submit_button('Entrar')
    if submitted:
        attempts,lock=login_attempts();now=time.time();bucket=name if name in users else '__otro__'
        with lock:
            recent=[t for t in attempts.get(bucket,[]) if t>now-60]
            allowed=len(recent)<5;attempts[bucket]=recent+[now]
        candidate=users.get(name,{})
        if allowed and candidate and hmac.compare_digest(password.encode(),str(candidate.get('clave','')).encode()):
            st.session_state['login']={'user':name,'at':now,'key':hashlib.sha256(candidate['clave'].encode()).hexdigest()};st.rerun()
        st.error('Datos incorrectos. Después de cinco intentos, espera un minuto.')
    st.stop()

@st.cache_resource
def shared_store(config,runtime_version):
    result=PostgresStore(config);result.initialize();return result

try: settings=dict(st.secrets)
except (FileNotFoundError,st.errors.StreamlitSecretNotFoundError): settings={}
mode=settings.get('app',{}).get('modo','pruebas')
if mode not in ['pruebas','compartido']:
    st.error('app.modo debe ser "pruebas" o "compartido".');st.stop()
if mode=='compartido':
    users=settings.get('usuarios',{})
    if not users or any(len(str(v.get('clave','')))<12 or str(v.get('clave','')).startswith('CAMBIA_') for v in users.values()):
        st.info('Completa usuarios y contraseñas de al menos 12 caracteres en Settings → Secrets. Usa secrets-compartido.ejemplo.toml como guía.');st.stop()
    actor=login(users)
    try: store=shared_store(dict(settings['database']),runtime.version)
    except Exception:
        st.error('No se pudo conectar. Revisa host, user, password y que Supabase esté activo. No se cambió a modo pruebas.');st.stop()
    c1,c2=st.columns([5,1]);c1.caption('Modo compartido · '+actor)
    if c2.button('Cerrar sesión'):
        st.session_state.clear();st.rerun()
else:
    actor='pruebas'
    st.info('MODO PRUEBAS · 40 empleados y eventos ficticios. Los datos viven en esta sesión: descarga un respaldo antes de cerrar. No uses información real aquí.')
    if 'test_store' not in st.session_state: st.session_state['test_store']=MemoryStore(demo_data())
    store=st.session_state['test_store']

try: snapshot,revision=store.read()
except Exception:
    st.error('La base no está disponible. Recarga cuando se restablezca; no se borraron registros.');st.stop()

@st.cache_resource
def ui_component(ui_version):
    return st.components.v2.component('calderon_v2_'+ui_version[:12],html=(ROOT/'ui.html').read_text(),css=(ROOT/'ui.css').read_text(),js=(ROOT/'ui.js').read_text(),isolate_styles=True)

ui_version=hashlib.sha256(b'\0'.join((ROOT/name).read_bytes() for name in ['ui.html','ui.css','ui.js'])).hexdigest()
result=ui_component(ui_version)(key='calderon-ui-'+mode+'-'+actor+'-'+str(st.session_state.get('ui_epoch',0)),data={'snapshot':snapshot,'revision':revision,'today':str(today()),'now':datetime.now(ZoneInfo('America/Mexico_City')).strftime('%Y-%m-%dT%H:%M:%S'),'mode':mode,'reply':st.session_state.get('reply')},on_command_change=lambda:None,height='content')
command=result.command
if command and command.get('id')!=st.session_state.get('last_request'):
    request_id=command.get('id','');reply={'id':request_id,'ok':False}
    try:
        kind=command.get('type');base=command.get('revision')
        if kind=='save':
            snapshot,revision=store.save(command.get('snapshot'),base,request_id,actor)
            reply.update(ok=True,message='Guardado')
        elif kind=='auto_assign':
            current,current_rev=store.read()
            if base!=current_rev: raise Conflict('Otra persona actualizó los datos. Revisa la asignación actual y vuelve a intentarlo.')
            changed=assign_auto(current,command.get('eventId'),command.get('role'),command.get('count'),command.get('payCents'))
            snapshot,revision=store.save(changed,base,request_id,actor)
            reply.update(ok=True,message='Personal asignado y guardado')
        elif kind=='refresh': reply.update(ok=True,message='Datos actualizados',refresh=True)
        elif kind in ['prepare_week','prepare_envelopes']:
            current,current_rev=store.read()
            if base!=current_rev: raise Conflict('Otra persona actualizó los datos. Pulsa Actualizar y vuelve a entrar a Sobres.')
            changed=prepare_envelopes(current)
            if changed!=current: snapshot,revision=store.save(changed,base,request_id,actor)
            missing=[e for e in changed['events'] if str(week_window()[0] if kind=='prepare_envelopes' else week_window()[1])<=e['startDate']<str(week_window()[2]) and not e['completed'] and not e.get('staffing')]
            reply.update(ok=True,message=('Sobres de esta semana preparados. Próximos turnos actualizados.' if kind=='prepare_envelopes' else 'Asignación semanal actualizada.')+(' Hay eventos sin necesidades de personal: configúralas en Equipo necesario.' if missing else ''))
        elif kind=='pdf':
            if base!=revision: raise Conflict('Actualiza los datos antes de preparar el PDF.')
            pdf=envelope_pdf(snapshot)
            reply.update(ok=True,message='PDF preparado. Pulsa Descargar PDF preparado.',pdf=base64.b64encode(pdf).decode(),filename='sobres_semana_'+str(week_window()[0])+'.pdf')
        elif kind=='contract':
            if base!=revision: raise Conflict('Actualiza la ficha antes de descargar el contrato.')
            pdf=contract_pdf(snapshot,command.get('eventId'))
            reply.update(ok=True,message='Contrato preparado con los datos guardados.',contractPdf=base64.b64encode(pdf).decode(),filename='contrato_'+str(command.get('eventId'))+'.pdf')
        else: raise ValueError('Operación no reconocida.')
    except (ValueError,TypeError,KeyError) as error:
        reply['message']=str(error)
    except Conflict as error: reply['message']=str(error)
    except Exception: reply['message']='No se pudo confirmar el guardado. Pulsa Actualizar y verifica los datos antes de repetir.'
    st.session_state['reply']=reply;st.session_state['last_request']=request_id;st.rerun()

last_pdf=st.session_state.get('reply',{})
if last_pdf.get('pdf'):
    st.download_button('Descargar etiquetas PDF',base64.b64decode(last_pdf['pdf']),file_name=last_pdf['filename'],mime='application/pdf')
if last_pdf.get('contractPdf'):
    st.download_button('Descargar contrato PDF',base64.b64decode(last_pdf['contractPdf']),file_name=last_pdf['filename'],mime='application/pdf')

with st.expander('Respaldo y pruebas'):
    st.download_button('Descargar respaldo JSON',json.dumps(snapshot,ensure_ascii=False,indent=2),file_name='calderon-respaldo.json',mime='application/json')
    uploaded=st.file_uploader('Importar respaldo Calderón 2 a una base vacía',type=['json'])
    if uploaded is not None and st.button('Importar respaldo'):
        try:
            if any(snapshot[k] for k in ['events','personnel','assignments','staffPayments']):raise ValueError('Sólo se importa a una base vacía. En pruebas, vacía primero la sesión con el control de abajo.')
            current,new_revision=store.save(json.loads(uploaded.getvalue()),revision,'restore_'+hashlib.sha256(uploaded.getvalue()).hexdigest(),actor)
            st.session_state['ui_epoch']=st.session_state.get('ui_epoch',0)+1;st.rerun()
        except Exception as error: st.error(str(error) if isinstance(error,ValueError) else 'No se pudo confirmar la importación.')
    if mode=='pruebas':
        confirm=st.checkbox('Confirmo que quiero vaciar sólo esta sesión de pruebas')
        if st.button('Vaciar pruebas',disabled=not confirm):
            st.session_state['ui_epoch']=st.session_state.get('ui_epoch',0)+1;st.session_state['test_store']=MemoryStore(empty_state());st.session_state.pop('reply',None);st.session_state.pop('last_request',None);st.rerun()
        st.caption('Para volver a la demostración inicial abre una sesión nueva de Streamlit. El modo compartido usa otra base y no se modifica desde estos controles.')
