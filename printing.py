"""Etiquetas carta 2 x 5; continuación automática sin recortar texto."""
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
import reportlab
_FONT_DIR=Path(reportlab.__file__).parent/'fonts'
for _suffix,_file in [('', 'Vera.ttf'),('-Bold','VeraBd.ttf'),('-Italic','VeraIt.ttf'),('-BoldItalic','VeraBI.ttf')]:
    pdfmetrics.registerFont(TTFont('OCSans'+_suffix,str(_FONT_DIR/_file)))
pdfmetrics.registerFontFamily('OCSans',normal='OCSans',bold='OCSans-Bold',italic='OCSans-Italic',boldItalic='OCSans-BoldItalic')
def money(value): return f"${int(value)/100:,.2f} MXN"


def make_pdf(envelopes, rows=5, margin_x=11.25, margin_y=36, gap_x=13.5, gap_y=0, guides=True):
    if not 2 <= rows <= 8: raise ValueError('Filas fuera de rango.')
    w, h = letter
    cell_w = (w-2*margin_x-gap_x)/2
    cell_h = (h-2*margin_y-(rows-1)*gap_y)/rows
    if cell_w < 150 or cell_h < 65: raise ValueError('La configuración deja etiquetas demasiado pequeñas.')
    style = ParagraphStyle('text', fontName='OCSans', fontSize=8, leading=10, spaceAfter=3, textColor=HexColor('#162c44'))
    def para(text): return Paragraph(text, style)
    slots=[]
    for e in envelopes:
        header = f"<b>{escape(e['casino'])} · Entrega {e['viernes']}</b><br/><b>{escape(e['nombre'])}</b> · {escape(e['puesto'])}"
        blocks=[para(f"<b>MONTO A ENTREGAR: {money(e['total'])}</b>"), para('<b>Eventos trabajados · saldo tras anticipos</b>')]
        for j in e['trabajos']:
            blocks.append(para(f"{j['fecha']} · {escape(j['casino'])} · {escape(j['nombre'])}<br/>{escape(j['puesto'])}: turno {money(j['pago_centavos'])}; pendiente <b>{money(j['pendiente'])}</b>"))
        if not e['trabajos']: blocks.append(para('Sin pago pendiente en el período.'))
        blocks.append(para('<b>Próximo evento asignado</b>'))
        for j in e['proximos']:
            blocks.append(para(f"{j['fecha']} · {escape(j['casino'])} · {escape(j['nombre'])} · {escape(j['tipo'])}<br/>Puesto: {escape(j['puesto'])}"))
        if not e['proximos']: blocks.append(para('Sin próximo evento asignado.'))
        pending=blocks[:]; segment=0
        while pending:
            head=para(header + ('<br/><b>CONTINUACIÓN · no es otro pago</b>' if segment else ''))
            _, head_h=head.wrap(cell_w-16,cell_h)
            remaining=cell_h-16-head_h-5
            content=[]
            while pending:
                block=pending[0]; _, bh=block.wrap(cell_w-16,remaining)
                if bh+3 <= remaining:
                    content.append(block); pending.pop(0); remaining-=bh+3
                else:
                    parts=block.split(cell_w-16,remaining-3)
                    if parts:
                        content.append(parts[0]); pending[0:1]=parts[1:]
                    break
            if not content: raise ValueError('Etiqueta demasiado pequeña para el nombre. Aumenta su altura o reduce los márgenes.')
            slots.append((head,content)); segment+=1
    buffer=BytesIO(); c=canvas.Canvas(buffer,pagesize=letter)
    c.setTitle('Control de casinos · sobres de pago')
    for i,(head,blocks) in enumerate(slots):
        if i and i % (rows*2)==0: c.showPage()
        index=i%(rows*2); col=index%2; row=index//2
        x=margin_x+col*(cell_w+gap_x); y=h-margin_y-row*(cell_h+gap_y)
        if guides:
            c.setStrokeColor(HexColor('#b9c6d4')); c.setLineWidth(.3)
            c.rect(x,y-cell_h,cell_w,cell_h)
        cursor=y-8
        for p in [head]+blocks:
            _, ph=p.wrap(cell_w-16,cell_h)
            p.drawOn(c,x+8,cursor-ph); cursor-=ph+3
    if not slots:
        c.setFont('OCSans',9);c.drawString(36, h-50, 'Sin etiquetas para este corte.')
    c.save(); return buffer.getvalue()


def hour_label(value):
    h,m=map(int,value.split(':'));return f"{h%12 or 12}:{m:02d} "+('a. m.' if h<12 else 'p. m.')

def envelope_pdf(data, reference=None):
    from backend import envelopes, CASINOS
    labels=[]
    for row in envelopes(data,reference):
        p=row['person']; next_events=row['upcoming']
        labels.append(dict(nombre=p['name'],puesto=p['role'],casino=p['casino'],viernes=row['delivery'] or 'sin turno esta semana',total=row['amount'],
          trabajos=[dict(fecha=j['event']['startDate'],casino=CASINOS[j['event']['casinoId']-1],nombre=j['event']['name'],puesto=j['assignment'].get('role',p['role']),pago_centavos=j['assignment']['payCents'],pendiente=j['balance']) for j in row['jobs']],
          proximos=[dict(fecha=nxt['startDate'],casino=CASINOS[nxt['casinoId']-1],nombre=nxt['name']+' · '+hour_label(nxt['startTime'])+' a '+hour_label(nxt['endTime'])+(' · día siguiente' if nxt['endDate']!=nxt['startDate'] else ''),tipo=nxt['type'],puesto=p['role']) for nxt in next_events]))
    return make_pdf(labels)


def contract_pdf(data,event_id):
    """Borrador operativo para completar y revisar; no acredita registro legal."""
    from backend import CASINOS, pricing, today
    from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    event=next((e for e in data['events'] if str(e['id'])==str(event_id)),None)
    if not event: raise ValueError('El evento ya no existe.')
    d=event['details'];price=pricing(d)
    if not price or not d.get('contratante'): raise ValueError('Guarda primero el contratante, número de personas y precio por persona.')
    stream=BytesIO();styles=getSampleStyleSheet()
    styles['Normal'].fontName='OCSans';styles['Normal'].fontSize=9;styles['Normal'].leading=13
    styles['Title'].fontName='OCSans-Bold';styles['Title'].textColor=HexColor('#39332a');styles['Title'].fontSize=21
    styles['Heading2'].fontName='OCSans-Bold';styles['Heading2'].fontSize=12;styles['Heading2'].textColor=HexColor('#695d48')
    story=[]
    def p(value,style='Normal'): return Paragraph(escape(str(value)).replace('\n','<br/>'),styles[style])
    def section(title):story.extend([Spacer(1,9),p(title,'Heading2')])
    def fields(items):
        if not items:
            story.append(p('Sin conceptos adicionales especificados.'));return
        table=Table([[p(label),p(value or 'POR COMPLETAR')] for label,value in items],colWidths=[154,350],hAlign='LEFT')
        table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(0,-1),HexColor('#f4f2ed')),('BOX',(0,0),(-1,-1),.3,HexColor('#dfdbd3')),('INNERGRID',(0,0),(-1,-1),.25,HexColor('#dfdbd3')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]));story.append(table)
    story.extend([p('Organización Calderón','Title'),p('Contrato de prestación de servicios para evento','Heading2'),p('BORRADOR PARA REVISIÓN Y FIRMA · No acredita registro ante Profeco.'),p('Folio: '+event['id']+' · Emitido: '+str(today()))])
    section('1. Partes y evento')
    fields([('Prestador / razón social',d.get('proveedor')),('Domicilio del prestador',d.get('domicilioProveedor')),('Contacto y aclaraciones',d.get('contactoProveedor')),('Contratante',d.get('contratante')),('Domicilio / contacto del cliente',(d.get('domicilioCliente','')+' / '+d.get('contactoCliente','')).strip(' /')),('Evento / tipo',event['name']+' / '+event['type']),('Salón',CASINOS[event['casinoId']-1]),('Domicilio del salón',d.get('domicilioSalon')),('Inicio',event['startDate']+' · '+hour_label(event['startTime'])),('Fin',event['endDate']+' · '+hour_label(event['endTime'])),('Duración / asistentes','5 horas / '+str(price['count'])+' personas')])
    section('2. Precio y pagos registrados')
    paid=sum(x['amount'] for x in event['payments']);deposit=sum(x['amount'] for x in event['payments'] if x['concept']=='Apartado')
    fields([('Precio base por persona',money(price['unit'])),('Extras por persona',money(price['extraUnit'])),('Base / extras totales',money(price['base'])+' / '+money(price['extra'])),('TOTAL ACORDADO',money(price['total'])),('Apartado recibido',money(deposit)),('Total recibido / saldo',money(paid)+' / '+money(price['total']-paid))])
    for payment in event['payments']:
        story.append(p(payment['date']+' · '+payment['concept']+' · '+money(payment['amount'])+' · '+payment['method']+(' · '+payment['note'] if payment['note'] else '')))
    section('3. Servicios y mobiliario incluidos')
    labels=[('Carne','carne'),('Segunda carne','carne2'),('Greiby / salsa','salsa'),('Segunda salsa','salsa2'),('Espagueti','espagueti'),('Guarnición','guarnicion'),('Guarnición extra','guarnicion2'),('Mesa','mesa'),('Silla','silla'),('Mantel','mantel'),('Cubre mantel','cubremantel'),('Caminos','caminos'),('Cubre silla','cubresilla'),('Banda de silla','banda'),('Servilletas','servilletas'),('Plato base','plato'),('Centro de mesa','centro'),('Otros','otros'),('Sugerencias','sugerencias')]
    fields([(label,d[key]) for label,key in labels if d.get(key)])
    section('4. Condiciones para revisión de las partes')
    clauses=[
      'Objeto y obligaciones. El prestador proporcionará el salón y los servicios descritos en las fechas y horarios indicados. El contratante respetará el aforo y las reglas de uso comunicadas por escrito.',
      'Precio. El total comprende los conceptos desglosados. Impuestos incluidos o desglose fiscal: POR COMPLETAR. No se autorizan cargos adicionales sin acuerdo escrito de ambas partes.',
      'Pagos. El apartado se abona al total. Calendario de abonos y fecha de liquidación: POR COMPLETAR. Se entregará comprobante por cada importe recibido.',
      'Cambios y cancelación. Se documentarán por escrito, con sus plazos, devoluciones y, cuando procedan, penas equitativas: POR COMPLETAR. Este borrador no establece pérdida automática del apartado.',
      'Caso fortuito o fuerza mayor. Las partes documentarán las alternativas de reprogramación, suspensión o terminación, respetando los derechos que correspondan.',
      'Aclaraciones e incumplimiento. Contacto, domicilio y horario de atención: POR COMPLETAR. Se conservan los derechos de reclamación ante Profeco y las autoridades competentes.',
    ]
    for clause in clauses:story.extend([p(clause),Spacer(1,6)])
    if d.get('condiciones'):story.extend([p('Condiciones adicionales acordadas: '+d['condiciones']),Spacer(1,8)])
    story.append(p('Antes de usar este documento con clientes, completar los campos pendientes y revisar su contenido y registro aplicable. No se presenta como contrato de adhesión registrado.'))
    story.append(KeepTogether([Spacer(1,22),p('Lugar y fecha de firma: _________________________________________________'),Spacer(1,24),Table([[p('____________________________'),p('____________________________')],[p('Prestador / representante'),p('Contratante')]],colWidths=[252,252])]))
    def footer(c,doc):
        c.saveState();c.setFont('OCSans',8);c.setFillColor(colors.grey);c.drawString(54,30,'Organización Calderón · Borrador para revisión y firma');c.drawRightString(558,30,str(doc.page));c.restoreState()
    SimpleDocTemplate(stream,pagesize=letter,rightMargin=54,leftMargin=54,topMargin=40,bottomMargin=48,title='Contrato - '+event['name'],author='Organización Calderón').build(story,onFirstPage=footer,onLaterPages=footer)
    return stream.getvalue()
