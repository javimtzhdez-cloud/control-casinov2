"""Adaptador de pruebas: ejecuta las mismas reglas Python que recibe la interfaz."""
import json
import sys
from backend import validate,assign_auto,envelopes,prepare_week
from printing import envelope_pdf,contract_pdf
import base64
req=json.load(sys.stdin);
if req.get('today'):
    import backend
    from datetime import date
    backend.today=lambda:date.fromisoformat(req['today'])
state=req['state'];rev=req['revision'];cmd=req['command']
try:
    if cmd['revision']!=rev:raise ValueError('Conflicto de revisión')
    if cmd['type']=='save':state=validate(cmd['snapshot']);rev+=1
    elif cmd['type']=='auto_assign':state=assign_auto(state,cmd['eventId'],cmd['role'],cmd['count'],cmd['payCents']);rev+=1
    elif cmd['type']=='prepare_week':state=prepare_week(state);rev+=1
    elif cmd['type']=='contract':
        pdf=contract_pdf(state,cmd['eventId'])
        print(json.dumps({'state':state,'revision':rev,'reply':{'id':cmd['id'],'ok':True,'contractPdf':base64.b64encode(pdf).decode(),'filename':'contrato.pdf'}}));sys.exit()
    elif cmd['type']=='pdf':
        pdf=envelope_pdf(state)
        print(json.dumps({'state':state,'revision':rev,'reply':{'id':cmd['id'],'ok':True,'pdf':base64.b64encode(pdf).decode(),'filename':'sobres.pdf'}}));sys.exit()
    print(json.dumps({'state':state,'revision':rev,'reply':{'id':cmd['id'],'ok':True,'message':'Guardado'}}))
except (ValueError,TypeError,KeyError) as e:
    print(json.dumps({'state':state,'revision':rev,'reply':{'id':cmd['id'],'ok':False,'message':str(e)}}))
