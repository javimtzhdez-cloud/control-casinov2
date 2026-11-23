"""Etiquetas carta 2 x 5; continuación automática sin recortar texto."""
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.colors import HexColor
def money(value): return f"${int(value)/100:,.2f} MXN"


def make_pdf(envelopes, rows=5, margin_x=11.25, margin_y=36, gap_x=13.5, gap_y=0, guides=True):
    if not 2 <= rows <= 8: raise ValueError('Filas fuera de rango.')
    w, h = letter
    cell_w = (w-2*margin_x-gap_x)/2
    cell_h = (h-2*margin_y-(rows-1)*gap_y)/rows
    if cell_w < 150 or cell_h < 65: raise ValueError('La configuración deja etiquetas demasiado pequeñas.')
    style = ParagraphStyle('text', fontName='Helvetica', fontSize=8, leading=10, spaceAfter=3, textColor=HexColor('#162c44'))
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
        c.drawString(36, h-50, 'Sin etiquetas para este corte.')
    c.save(); return buffer.getvalue()


def hour_label(value):
    h,m=map(int,value.split(':'));return f"{h%12 or 12}:{m:02d} "+('a. m.' if h<12 else 'p. m.')

def envelope_pdf(data, friday):
    from backend import envelopes, CASINOS
    labels=[]
    for row in envelopes(data,friday):
        p=row['person']; nxt=row['next']
        labels.append(dict(nombre=p['name'],puesto=p['role'],casino=p['casino'],viernes=friday,total=row['amount'],
          trabajos=[dict(fecha=j['event']['startDate'],casino=CASINOS[j['event']['casinoId']-1],nombre=j['event']['name'],puesto=p['role'],pago_centavos=j['assignment']['payCents'],pendiente=j['balance']) for j in row['jobs']],
          proximos=[dict(fecha=nxt['startDate'],casino=CASINOS[nxt['casinoId']-1],nombre=nxt['name']+' · '+hour_label(nxt['startTime'])+' a '+hour_label(nxt['endTime'])+(' · día siguiente' if nxt['endDate']!=nxt['startDate'] else ''),tipo=nxt['type'],puesto=p['role'])] if nxt else []))
    return make_pdf(labels)
