export default function({parentElement,data,setTriggerValue}) {
const root=parentElement.querySelector('#calderon-design');
  if(root.__calderon){root.__calderon.receive(data,setTriggerValue);return;}
  const bridge={data,emit:setTriggerValue,today:data.today,revision:data.revision,pending:null};
  const assignments=[];const staffPayments=[];
  function nextKey(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);}
  const syncbar=document.createElement('div');syncbar.className='oc-syncbar';
  syncbar.innerHTML='<span id="oc-sync-status" role="status">Datos cargados</span><button type="button" class="cursor-interaction">Actualizar</button>';
  root.prepend(syncbar);
  function status(message,error=false){const node=root.querySelector('#oc-sync-status');node.textContent=message;node.classList.toggle('oc-sync-error',error);}
  function snapshot(){return {version:2,personnel:JSON.parse(JSON.stringify(personnel)),events:states.flatMap(s=>s.events.map(e=>({...e,casinoId:s.id}))),assignments:JSON.parse(JSON.stringify(assignments)),staffPayments:JSON.parse(JSON.stringify(staffPayments))};}
  function command(type,extra={}){
    if(bridge.pending)return;
    const id=nextKey();bridge.pending=id;status('Guardando…');root.setAttribute('aria-busy','true');
    root.querySelectorAll('main, .oc-header').forEach(el=>{el.inert=true;});
    bridge.emit('command',{id,revision:bridge.revision,type,...extra});
  }
  function commit(label){command('save',{snapshot:snapshot(),label});}
  syncbar.querySelector('button').addEventListener('click',()=>command('refresh'));
  function hydrate(saved){
    const old=new Map(states.flatMap(s=>s.events).map(e=>[String(e.id),e]));
    states.forEach(state=>{state.events=saved.events.filter(e=>e.casinoId===state.id).map(e=>{
      const prior=old.get(String(e.id));return prior?Object.assign(prior,e):JSON.parse(JSON.stringify(e));
    });});
    personnel.splice(0,personnel.length,...saved.personnel.map(p=>({...p})));
    assignments.splice(0,assignments.length,...saved.assignments.map(a=>({...a})));
    staffPayments.splice(0,staffPayments.length,...saved.staffPayments.map(p=>({...p})));
    if(currentEvent){const found=states.flatMap(s=>s.events).find(e=>String(e.id)===String(currentEvent.id));currentEvent=found||null;}
  }
  function receive(update,emit){
    bridge.emit=emit;bridge.today=update.today;bridge.revision=update.revision;bridge.data=update;
    const reply=update.reply;
    if(!reply||reply.id!==bridge.pending)return;
    bridge.pending=null;root.removeAttribute('aria-busy');root.querySelectorAll('main, .oc-header').forEach(el=>{el.inert=false;});
    hydrate(update.snapshot);
    states.forEach(state=>{renderMonth(state);if(state.selected)showDay(state,state.selected);});
    renderPersonnel();
    if(!currentEvent&&!root.querySelector('[data-oc-panel=configurar]').hidden)openPage('eventos');
    if(currentEvent&&root.querySelector('[data-oc-panel=configurar]').hidden===false){
      if(!reply.ok||reply.refresh)openEvent(currentEventState,currentEvent);
      else if(root.querySelector('#oc-staff-assigned'))renderStaff();
    }
    if(!root.querySelector('[data-oc-panel=pagos]').hidden)renderEnvelopes();
    root.querySelector('#oc-ready-pdf').hidden=true;
    if(reply.pdf){
      const a=root.querySelector('#oc-ready-pdf');a.href='data:application/pdf;base64,'+reply.pdf;a.download=reply.filename;a.hidden=false;
    }
    status(reply.ok?(reply.message||'Guardado'):reply.message,true===!reply.ok);
  }
  root.__calderon={receive};

  let calendarMode='disponibilidad';
  const panels=Array.from(root.querySelectorAll('[data-oc-panel]'));
  const menu=root.querySelector('.oc-nav');
  const routes=[['disponibilidad','Verificar disponibilidad'],['eventos','Lista de eventos'],['personal','Personal'],['pagos','Sobres']];
  function openPage(page){
    if(root.querySelector('.oc-day-popover'))hideDayPopover();
    panels.forEach(panel=>{panel.hidden=panel.dataset.ocPanel!==page;});
    const activeRoute=page==='configurar'?'eventos':page;
    if(page==='pagos')renderEnvelopes();
    if(page==='disponibilidad'||page==='eventos'){
      calendarMode=page;
      const mount=root.querySelector(page==='eventos'?'#oc-events-calendar-mount':'#oc-availability-calendar-mount');
      mount.append(root.querySelector('#oc-calendar-module'));
      states.forEach(state=>{if(state.selected)showDay(state,state.selected);});
    }
    menu.replaceChildren();
    routes.forEach(([key,label])=>{
      const button=document.createElement('button');
      button.type='button';button.className='cursor-interaction';
      button.dataset.ocPage=key===activeRoute?'inicio':key;
      button.textContent=key===activeRoute?'Inicio':label;
      menu.append(button);
    });
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-oc-page]');
    if(button&&root.contains(button))openPage(button.dataset.ocPage);
  });
  const popover=document.createElement('div');
  popover.id='oc-minimal-day-info';popover.className='oc-day-popover';
  popover.setAttribute('role','tooltip');popover.hidden=true;root.append(popover);
  let hoverAnchor=null;
  function hideDayPopover(){
    if(hoverAnchor)hoverAnchor.removeAttribute('aria-describedby');
    hoverAnchor=null;popover.hidden=true;
  }
  function showDayPopover(anchor,date,events){
    hideDayPopover();hoverAnchor=anchor;
    const [y,m,d]=date.split('-').map(Number);
    const day=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(new Date(y,m-1,d,12));
    popover.innerHTML='<p class="oc-popover-date">'+safe(day)+'</p>'+(events.length?events.map(e=>
      '<div class="oc-popover-event"><p class="oc-popover-title">'+safe(e.name.replace(/\s*· ejemplo$/,''))+'</p>'+
      '<div class="oc-popover-hours"><div><span>Inicio</span><p>'+hourLabel(e.startTime)+'</p></div><div><span>Fin</span><p>'+hourLabel(e.endTime)+'</p></div></div></div>'
    ).join(''):'<p class="oc-popover-free">Disponible</p>');
    popover.hidden=false;
    const a=anchor.getBoundingClientRect(),r=root.getBoundingClientRect();
    const left=Math.max(12,Math.min(a.left-r.left+a.width/2-popover.offsetWidth/2,r.width-popover.offsetWidth-12));
    let top=a.top-r.top-popover.offsetHeight-10;
    if(top<12)top=a.bottom-r.top+10;
    popover.style.left=left+'px';popover.style.top=top+'px';
    anchor.setAttribute('aria-describedby',popover.id);
  }
  root.addEventListener('keydown',event=>{if(event.key==='Escape')hideDayPopover();});

  function eventSchedule(startTime){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))throw new Error('Selecciona una hora de inicio válida.');
    const [hours,minutes]=startTime.split(':').map(Number);
    const startMinutes=hours*60+minutes;
    if(startMinutes>22*60)throw new Error('La hora de inicio máxima es 10:00 p. m. para terminar a más tardar a las 3:00 a. m.');
    const endMinutes=startMinutes+5*60;
    return {endTime:String(Math.floor(endMinutes/60)%24).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0'),nextDay:endMinutes>=24*60};
  }

  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const weekdays=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
  const states=Array.from({length:4},(_,i)=>({id:i+1,name:['Esmeralda','Sophia','Anakai','Regina'][i],year:Number(bridge.today.slice(0,4)),month:Number(bridge.today.slice(5,7))-1,selected:null,events:[]}));
  let nextId=100;
  function isoDate(y,m,d){const v=new Date(y,m,d,12);return String(v.getFullYear()).padStart(4,'0')+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');}
  function nextDay(iso){const [y,m,d]=iso.split('-').map(Number);return isoDate(y,m-1,d+1);}
  function dateLabel(iso){const [y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d,12));}
  function fullLabel(iso){const [y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d,12));}
  function safe(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function onDate(state,iso){return state.events.filter(e=>e.startDate<=iso&&(e.endDate>iso||(e.endDate===iso&&e.endTime>'00:00'))).sort((a,b)=>(a.startDate+'T'+a.startTime).localeCompare(b.startDate+'T'+b.startTime));}
  function hourLabel(value){const [h,m]=value.split(':').map(Number);return String(h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' a. m.':' p. m.');}
  function timing(e){return 'Inicio: '+dateLabel(e.startDate)+', '+hourLabel(e.startTime)+' · Fin: '+dateLabel(e.endDate)+', '+hourLabel(e.endTime);}
  const grid=root.querySelector('#oc-calendars');
  states.forEach(state=>{
    const article=document.createElement('article');article.className='oc-casino';article.id='oc-casino-'+state.id;
    article.innerHTML='<div class="oc-casino-heading"><h3>'+state.name+'</h3><span class="oc-casino-code">CALENDARIO</span></div>'+
      '<div class="oc-calendar-nav"><button type="button" class="oc-arrow cursor-interaction" data-shift="-1" aria-label="Mes anterior de '+state.name+'"><span aria-hidden="true">‹</span></button>'+
      '<label><span class="oc-visually-hidden">Mes de '+state.name+'</span><select class="oc-month">'+months.map((m,i)=>'<option value="'+i+'">'+m+'</option>').join('')+'</select></label>'+
      '<label><span class="oc-visually-hidden">Año de '+state.name+'</span><input class="oc-year" type="number" min="1900" max="9999" step="1" value="2026" aria-label="Año de '+state.name+'"></label>'+
      '<button type="button" class="oc-arrow cursor-interaction" data-shift="1" aria-label="Mes siguiente de '+state.name+'"><span aria-hidden="true">›</span></button></div>'+
      '<div class="oc-weekdays" aria-hidden="true">'+weekdays.map(w=>'<span>'+w+'</span>').join('')+'</div>'+
      '<div class="oc-days" role="group" aria-label="Días de '+state.name+'"></div>'+
      '<p class="oc-calendar-hint">Pasa el cursor o toca un día para ver sus horarios.</p><div class="oc-selection" data-empty="true" aria-live="polite"><span>Selecciona una fecha en el calendario.</span></div>';
    grid.append(article);state.element=article;
    const select=article.querySelector('.oc-month');
    const year=article.querySelector('.oc-year');
    select.addEventListener('change',()=>{state.month=Number(select.value);renderMonth(state);});
    year.addEventListener('change',()=>{
      const value=Number(year.value);
      if(!Number.isInteger(value)||value<1900||value>9999){year.value=state.year;return;}
      state.year=value;renderMonth(state);
    });
    article.querySelectorAll('[data-shift]').forEach(b=>b.addEventListener('click',()=>{
      const dt=new Date(state.year,state.month+Number(b.dataset.shift),1,12);
      if(dt.getFullYear()<1900||dt.getFullYear()>9999)return;
      state.year=dt.getFullYear();state.month=dt.getMonth();renderMonth(state);
    }));
    renderMonth(state);
  });
  function renderMonth(state){
    const article=state.element;
    hideDayPopover();
    if(state.selected&&!state.selected.startsWith(isoDate(state.year,state.month,1).slice(0,7))){
      state.selected=null;article.querySelector('.oc-selection').textContent='Selecciona una fecha en el calendario.';article.querySelector('.oc-selection').dataset.empty='true';
    }
    article.querySelector('.oc-month').value=String(state.month);
    article.querySelector('.oc-year').value=String(state.year);
    const days=article.querySelector('.oc-days');days.replaceChildren();
    const first=(new Date(state.year,state.month,1,12).getDay()+6)%7;
    const count=new Date(state.year,state.month+1,0,12).getDate();
    const cells=Math.ceil((first+count)/7)*7;
    for(let i=0;i<cells;i++){
      const day=i-first+1;
      if(day<1||day>count){const gap=document.createElement('span');gap.setAttribute('aria-hidden','true');days.append(gap);continue;}
      const date=isoDate(state.year,state.month,day);
      const events=onDate(state,date);
      const tooltip=fullLabel(date)+' · '+(events.length?events.map(e=>e.name+' · '+timing(e)).join(' | '):'Disponible · sin eventos registrados');
      const b=document.createElement('button');b.type='button';b.className='oc-day cursor-interaction'+(events.length?' is-busy':'')+(date===bridge.today?' is-today':'');
      b.dataset.date=date;b.setAttribute('aria-label',tooltip);
      b.addEventListener('mouseenter',()=>showDayPopover(b,date,events));
      b.addEventListener('mouseleave',hideDayPopover);
      b.addEventListener('focus',()=>showDayPopover(b,date,events));
      b.addEventListener('blur',hideDayPopover);
      b.setAttribute('aria-pressed',String(state.selected===date));
      b.innerHTML='<span>'+day+'</span><span class="oc-day-marker" aria-hidden="true"></span>';
      b.addEventListener('click',()=>{
        hideDayPopover();
        state.selected=date;
        days.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));
        showDay(state,date);
      });
      days.append(b);
    }
  }
  function showDay(state,date){
    const area=state.element.querySelector('.oc-selection');
    area.dataset.empty='false';
    const events=onDate(state,date);
    area.innerHTML='<p class="oc-selected-date">'+safe(fullLabel(date))+'</p>';
    if(calendarMode==='eventos'){
      if(!events.length)area.insertAdjacentHTML('beforeend','<p class="oc-config-help">No hay eventos para esta fecha.</p>');
      events.forEach(event=>{
        const button=document.createElement('button');button.type='button';button.className='oc-event-result cursor-interaction';
        button.innerHTML='<span class="oc-event-link">'+safe(event.name.replace(/\s*· ejemplo$/,''))+' ↗</span><span>'+hourLabel(event.startTime)+' — '+hourLabel(event.endTime)+(event.endDate!==event.startDate?' del día siguiente':'')+'</span>';
        button.addEventListener('click',()=>openEvent(state,event));area.append(button);
      });
      return;
    }
    if(!events.length){area.insertAdjacentHTML('beforeend','<p class="oc-available">Disponible · no hay eventos registrados.</p>');}
    events.forEach(e=>{
      const entry=document.createElement('div');entry.className='oc-event-snippet';
      entry.innerHTML='<p class="oc-event-name">'+safe(e.name)+'</p><p class="oc-event-time">Inicio: '+safe(dateLabel(e.startDate))+' · '+hourLabel(e.startTime)+'<br>Fin: '+safe(dateLabel(e.endDate))+' · '+hourLabel(e.endTime)+'</p><button type="button" class="oc-text-button cursor-interaction">Consultar evento</button><div class="oc-inset-detail" hidden></div>';
      const button=entry.querySelector('button');const detail=entry.querySelector('.oc-inset-detail');button.setAttribute('aria-expanded','false');
      detail.textContent=state.name+' · '+e.type+'. '+timing(e)+'. Evento de esta vista previa.';
      button.addEventListener('click',()=>openEvent(state,e));
      area.append(entry);
    });
    const add=document.createElement('button');add.type='button';add.className='oc-primary oc-small-primary cursor-interaction';
    add.textContent=events.length?'Consultar otro horario de este día':'Agendar este día';
    add.addEventListener('click',()=>showBooking(state,date,area,add));area.append(add);
  }
  function showBooking(state,date,area,trigger){
    trigger.hidden=true;
    const form=document.createElement('form');form.className='oc-booking';
    form.innerHTML='<label>Nombre del evento<input name="name" type="text" maxlength="120" required placeholder="Nombre del evento"></label>'+
      '<div class="oc-booking-times"><label>Hora de inicio<input name="start" type="time" value="18:00" max="22:00" required></label><label>Hora de fin<input name="end" type="time" value="23:00" readonly required></label></div>'+
      '<label class="oc-nextday"><input name="nextday" type="checkbox" disabled>Termina al día siguiente</label>'+
      '<p class="oc-calendar-hint" style="margin:0">Duración: 5 horas · Cierre máximo: 3:00 a. m.</p><p class="oc-booking-error" role="alert" hidden></p><div class="oc-booking-actions"><button class="oc-primary oc-small-primary cursor-interaction" type="submit">Guardar evento</button><button class="oc-text-button cursor-interaction" type="button">Cancelar</button></div>';
    const startField=form.querySelector('input[name=start]');
    const endField=form.querySelector('input[name=end]');
    const nextDayField=form.querySelector('input[name=nextday]');
    function updateEndTime(){
      const error=form.querySelector('.oc-booking-error');
      startField.setCustomValidity('');error.hidden=true;
      if(!startField.value){endField.value='';nextDayField.checked=false;return;}
      try{
        const schedule=eventSchedule(startField.value);
        endField.value=schedule.endTime;nextDayField.checked=schedule.nextDay;
      }catch(exc){
        endField.value='';nextDayField.checked=false;
        startField.setCustomValidity(exc.message);error.textContent=exc.message;error.hidden=false;
      }
    }
    startField.addEventListener('input',updateEndTime);
    startField.addEventListener('change',updateEndTime);
    updateEndTime();
    form.querySelector('button[type=button]').addEventListener('click',()=>{form.remove();trigger.hidden=false;});
    form.addEventListener('submit',event=>{
      event.preventDefault();const data=new FormData(form);
      const name=String(data.get('name')||'').trim();const startTime=startField.value;
      const error=form.querySelector('.oc-booking-error');
      let schedule;
      try{schedule=eventSchedule(startTime);}catch(exc){error.textContent=exc.message;error.hidden=false;return;}
      const endTime=schedule.endTime;const endDate=schedule.nextDay?nextDay(date):date;
      const start=date+'T'+startTime;const end=endDate+'T'+endTime;
      let message='';
      if(!name)message='Escribe el nombre del evento.';
      else if(end>nextDay(date)+'T03:00')message='El evento debe terminar a más tardar a las 3:00 a. m.';
      else if(state.events.some(e=>start<e.endDate+'T'+e.endTime&&end>e.startDate+'T'+e.startTime))message='Este horario se cruza con un evento. Elige otro horario.';
      if(message){error.textContent=message;error.hidden=false;return;}
      state.events.push({id:nextKey(),name,type:'Evento',startDate:date,startTime,endDate,endTime});
      renderMonth(state);showDay(state,date);commit('Registrar evento');
    });
    area.append(form);
  }
  const mobilePicker=root.querySelector('.oc-mobile-casinos');
  function selectMobileCasino(id){
    hideDayPopover();
    states.forEach(state=>state.element.classList.toggle('oc-mobile-off',state.id!==id));
    mobilePicker.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.casinoId)===id)));
  }
  states.forEach(state=>{
    const button=document.createElement('button');button.type='button';button.className='cursor-interaction';
    button.textContent=state.name;button.dataset.casinoId=String(state.id);
    button.setAttribute('aria-controls',state.element.id);button.setAttribute('aria-pressed',String(state.id===1));
    button.addEventListener('click',()=>selectMobileCasino(state.id));mobilePicker.append(button);
  });
  selectMobileCasino(1);
  window.addEventListener('resize',hideDayPopover);
  let currentEvent=null;
  let currentEventState=null;
  let configTab='datos';
  const menuOptions={
    carne:['Lomo natural','Lomo mechado','Pastel de carne','Pollo Florentina (+$15.00 extra)','Pollo con vegetales (+$15.00 extra)'],
    salsa:['Greiby de champiñón','Crema de almendras','Crema de poblano','Salsa de almendras','Salsa chipotle','Salsa Teriyaki'],
    espagueti:['Blanco','Verde','Rojo'],
    guarnicion:['Verduras al vapor','Puré de papa','Ensalada española','Ensalada mediterránea'],
    mesa:['Redonda','Cuadrada'],silla:['Acojinada','Tiffany'],
    cubremantel:['Encaje','Morado','Beige','Dorado con negro'],
    cubresilla:['Blanco','Negro'],plato:['Madera','Acero inox.'],centro:['1','2','3']
  };
  function currency(value){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(value/100);}
  function toCents(value){
    const text=String(value).trim();
    if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('Escribe un importe no negativo, con máximo dos decimales.');
    const [whole,fraction='']=text.split('.');const number=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(number)||number>100000000000)throw new Error('El importe es demasiado grande.');
    return number;
  }
  function pricingFor(data){
    const count=Number(data.personas);
    if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Indica el número de personas para calcular el total.');
    if(String(data.precioPersona??'').trim()==='')throw new Error('Indica el precio por persona para calcular el total.');
    const unit=toCents(data.precioPersona);
    const premium=new Set(['Pollo Florentina (+$15.00 extra)','Pollo con vegetales (+$15.00 extra)']);
    const chosen=[data.carne];if(data.combinar&&count>=200)chosen.push(data.carne2);
    const extras=[];
    if(chosen.some(option=>premium.has(option)))extras.push({name:'Pollo con costo extra',unit:1500});
    if(data.extraGuarnicion)extras.push({name:'Guarnición extra',unit:1000});
    const extraUnit=extras.reduce((sum,item)=>sum+item.unit,0);
    const base=unit*count,extra=extraUnit*count,total=base+extra;
    if(!Number.isSafeInteger(total)||total>100000000000)throw new Error('El total calculado es demasiado grande.');
    return {count,unit,extras,extraUnit,base,extra,total};
  }

  function paidTotal(event){return (event.payments||[]).reduce((sum,p)=>sum+p.amount,0);}
  function inputField(label,name,type,value,attrs=''){
    return '<label>'+safe(label)+'<input name="'+name+'" type="'+type+'" value="'+safe(value??'')+'" '+attrs+'></label>';
  }
  function selectField(label,name,options,value){
    return '<label>'+safe(label)+'<select name="'+name+'"><option value="">Por definir</option>'+options.map(option=>'<option'+(option===value?' selected':'')+'>'+safe(option)+'</option>').join('')+'</select></label>';
  }
  function titleHeader(){
    root.querySelector('#oc-event-heading').textContent=currentEvent.name.replace(/\s*· ejemplo$/,'');
    root.querySelector('#oc-event-venue').textContent=currentEventState.name;
    root.querySelector('#oc-event-when').textContent=dateLabel(currentEvent.startDate)+' · '+hourLabel(currentEvent.startTime)+' — '+hourLabel(currentEvent.endTime)+(currentEvent.endDate!==currentEvent.startDate?' del día siguiente':'');
  }
  function setConfigTab(tab){
    configTab=tab;
    root.querySelectorAll('[data-config-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.configTab===tab)));
    root.querySelectorAll('[data-config-pane]').forEach(pane=>{pane.hidden=pane.dataset.configPane!==tab;});
    const bottom=root.querySelector('.oc-contract-actions');if(bottom)bottom.hidden=!['datos','menu','mobiliario'].includes(tab);
    if(tab==='resumen')renderContractSummary();
  }
  root.querySelectorAll('[data-config-tab]').forEach(b=>b.addEventListener('click',()=>setConfigTab(b.dataset.configTab)));
  function openEvent(state,event){
    currentEventState=state;currentEvent=event;event.details=event.details||{};event.payments=event.payments||[];event.totalCents=event.totalCents||0;
    const d=event.details;
    const content=root.querySelector('#oc-event-config-content');
    content.innerHTML='<form id="oc-contract" novalidate>'+ 
      '<div data-config-pane="datos"><div class="oc-config-grid">'+
        inputField('Título del evento','titulo','text',event.name.replace(/\s*· ejemplo$/,''),'maxlength="120" required')+
        inputField('Nombre del contratante','contratante','text',d.contratante,'maxlength="120"')+
        inputField('Fecha del evento','fecha','date',event.startDate,'required')+
        inputField('Número de personas','personas','number',d.personas,'min="1" max="10000" step="1" required')+
        inputField('Precio por persona (MXN)','precioPersona','number',d.precioPersona,'min="0" step="0.01" required')+
        inputField('Total acordado del evento · automático','totalCalculado','number',(event.totalCents/100).toFixed(2),'readonly id="oc-config-total"')+
        inputField('Hora de inicio','inicio','time',event.startTime,'max="22:00" required')+
        inputField('Hora de fin · automática','fin','time',event.endTime,'readonly')+
      '</div><p class="oc-config-help" id="oc-live-price" role="status"></p><p class="oc-config-help" id="oc-config-schedule">Duración: 5 horas. Inicio máximo: 10:00 p. m.; fin máximo: 3:00 a. m.</p></div>'+
      '<div data-config-pane="menu" hidden><div class="oc-config-grid">'+
        selectField('Carne','carne',menuOptions.carne,d.carne)+selectField('Greiby / salsa','salsa',menuOptions.salsa,d.salsa)+
        selectField('Espagueti','espagueti',menuOptions.espagueti,d.espagueti)+selectField('Guarnición','guarnicion',menuOptions.guarnicion,d.guarnicion)+
      '</div><div class="oc-config-note oc-config-help">Los pollos con costo extra suman $15.00 por persona. La guarnición extra suma $10.00 por persona. Se incluyen automáticamente en el total.</div>'+
      '<div class="oc-config-note oc-config-help">Se puede combinar carne y greiby a partir de 200 personas. Si la combinación incluye pollo con costo extra, el suplemento de $15.00 por persona se aplica una sola vez.</div>'+
      '<div class="oc-config-note"><label class="oc-nextday"><input name="combinar" type="checkbox"'+(d.combinar?' checked':'')+'>Combinar dos carnes y dos salsas</label></div>'+
      '<div class="oc-config-grid" id="oc-combination" hidden>'+selectField('Segunda carne','carne2',menuOptions.carne,d.carne2)+selectField('Segunda salsa','salsa2',menuOptions.salsa,d.salsa2)+'</div>'+
      '<div class="oc-config-note"><label class="oc-nextday"><input name="extraGuarnicion" type="checkbox"'+(d.extraGuarnicion?' checked':'')+'>Guarnición extra · $10.00 por persona</label></div>'+
      '<div class="oc-config-grid" id="oc-extra-garnish" hidden>'+selectField('Guarnición adicional','guarnicion2',menuOptions.guarnicion,d.guarnicion2)+'</div>'+
      '<div class="oc-config-grid" style="margin-top:16px"><label class="oc-wide-field">Otros<input name="otros" type="text" maxlength="300" value="'+safe(d.otros||'')+'"></label></div></div>'+
      '<div data-config-pane="mobiliario" hidden><div class="oc-config-grid">'+
        selectField('Mesa','mesa',menuOptions.mesa,d.mesa)+selectField('Silla','silla',menuOptions.silla,d.silla)+
        inputField('Color del mantel','mantel','text',d.mantel,'maxlength="80"')+selectField('Cubre mantel','cubremantel',menuOptions.cubremantel,d.cubremantel)+
        inputField('Color de caminos','caminos','text',d.caminos,'maxlength="80"')+selectField('Cubre silla','cubresilla',menuOptions.cubresilla,d.cubresilla)+
        inputField('Banda de silla','banda','text',d.banda,'maxlength="80"')+inputField('Servilletas','servilletas','text',d.servilletas,'maxlength="80"')+
        selectField('Plato base','plato',menuOptions.plato,d.plato)+selectField('Centro de mesa','centro',menuOptions.centro,d.centro)+
        '<label class="oc-wide-field">Sugerencias<textarea name="sugerencias" maxlength="1500">'+safe(d.sugerencias||'')+'</textarea></label></div></div>'+
      '<div class="oc-config-bottom oc-contract-actions"><div class="oc-config-bottom-inner"><button type="submit" class="oc-primary oc-small-primary cursor-interaction">Guardar cambios de la ficha</button></div><p class="oc-config-message" id="oc-contract-status" role="status"></p></div></form>'+
      '<div data-config-pane="cobros" hidden><div class="oc-config-grid">'+inputField('Total acordado del evento (MXN)','total','number',(event.totalCents/100).toFixed(2),'readonly id="oc-event-total"')+'</div><div id="oc-price-breakdown" class="oc-config-help" aria-live="polite"></div>'+
      '<div class="oc-payment-summary"><div><span>Total</span><strong id="oc-total-value"></strong></div><div><span>Pagado</span><strong id="oc-paid-value"></strong></div><div><span>Saldo pendiente</span><strong id="oc-balance-value"></strong></div></div>'+
      '<p class="oc-payment-caption" id="oc-deposit-value"></p><h3 class="oc-payment-heading">Registrar pago</h3>'+
      '<form id="oc-event-payment"><div class="oc-config-grid">'+inputField('Fecha de pago','fechaPago','date',bridge.today,'required max="'+bridge.today+'"')+
        selectField('Concepto','concepto',['Apartado','Abono','Liquidación'],event.payments.length?'Abono':'Apartado')+
        inputField('Importe (MXN)','importe','number','','min="0.01" step="0.01" required')+selectField('Método','metodo',['Efectivo','Transferencia','Tarjeta'],'Efectivo')+
        inputField('Referencia o nota (opcional)','nota','text','','maxlength="200"')+'</div><div class="oc-config-bottom"><button type="submit" class="oc-primary oc-small-primary cursor-interaction">Guardar cobro</button><p class="oc-config-message" id="oc-payment-status" role="status"></p></div></form>'+
      '<h3 class="oc-payment-heading">Historial de pagos</h3><ul class="oc-payment-list" id="oc-payment-history"></ul></div>'+
      '<div data-config-pane="resumen" hidden><div id="oc-contract-summary"></div></div>';
    const form=root.querySelector('#oc-contract');
    const get=name=>form.elements.namedItem(name);
    let activePricing=null;
    function pricingData(){
      const data=Object.fromEntries(new FormData(form).entries());
      data.combinar=get('combinar').checked&&!get('combinar').disabled;
      data.extraGuarnicion=get('extraGuarnicion').checked;
      return data;
    }
    function syncPricing(){
      activePricing=null;
      const live=root.querySelector('#oc-live-price');const breakdown=root.querySelector('#oc-price-breakdown');
      const totalField=root.querySelector('#oc-event-total');const configTotal=root.querySelector('#oc-config-total');
      try{
        const data=pricingData();const price=pricingFor(data);activePricing=price;
        totalField.value=(price.total/100).toFixed(2);configTotal.value=totalField.value;
        let html='<div>'+price.count+' personas × '+currency(price.unit)+' = '+currency(price.base)+'</div>';
        price.extras.forEach(extra=>{html+='<div>'+safe(extra.name)+': '+price.count+' × '+currency(extra.unit)+' = '+currency(extra.unit*price.count)+'</div>';});
        if(!price.extras.length)html+='<div>Sin extras seleccionados.</div>';
        html+='<div><strong>Total calculado: '+currency(price.total)+'</strong></div>';
        breakdown.innerHTML=html;
        if(price.total<paidTotal(event))throw new Error('El nuevo total es menor que lo pagado. Ajusta el número de personas, el precio o los extras antes de guardar.');
        event.totalCents=price.total;event.pricing=price;
        ['personas','precioPersona','carne','carne2','salsa','salsa2','guarnicion','guarnicion2','combinar','extraGuarnicion'].forEach(key=>event.details[key]=data[key]??'');
        event.pricingValid=true;live.classList.remove('oc-price-error');
        live.textContent='Base: '+currency(price.base)+' · Extras: '+currency(price.extra)+' · Total: '+currency(price.total);
        root.querySelector('#oc-event-payment button[type=submit]').disabled=price.total===paidTotal(event);
      }catch(error){
        event.pricingValid=false;live.textContent=error.message;live.classList.add('oc-price-error');
        root.querySelector('#oc-event-payment button[type=submit]').disabled=true;
        if(!activePricing){totalField.value='';configTotal.value='';breakdown.textContent=error.message;}
      }
      renderPayments();
    }
    function syncContractTimes(){
      const note=root.querySelector('#oc-config-schedule');
      try{const schedule=eventSchedule(get('inicio').value);get('fin').value=schedule.endTime;note.textContent='Fin automático: '+hourLabel(schedule.endTime)+(schedule.nextDay?' del día siguiente':'')+' · Duración: 5 horas.';note.style.color='';}
      catch(error){get('fin').value='';note.textContent=error.message;note.style.color='#a13e30';}
    }
    get('inicio').addEventListener('input',syncContractTimes);get('inicio').addEventListener('change',syncContractTimes);
    function menuConditions(){
      const enough=Number(get('personas').value)>=200;
      get('combinar').disabled=!enough;
      if(!enough)get('combinar').checked=false;
      root.querySelector('#oc-combination').hidden=!get('combinar').checked;
      root.querySelector('#oc-extra-garnish').hidden=!get('extraGuarnicion').checked;
      syncPricing();
    }
    ['personas','combinar','extraGuarnicion'].forEach(name=>get(name).addEventListener('change',menuConditions));
    get('personas').addEventListener('input',menuConditions);
    get('precioPersona').addEventListener('input',()=>{activePricing=null;syncPricing();});
    ['precioPersona','carne','carne2','guarnicion','guarnicion2','salsa','salsa2'].forEach(name=>get(name).addEventListener('change',()=>{activePricing=null;syncPricing();}));
    menuConditions();
    form.addEventListener('submit',evt=>{
      evt.preventDefault();const status=root.querySelector('#oc-contract-status');
      try{
        const draft=Object.fromEntries(new FormData(form).entries());
        const count=Number(draft.personas);
        if(!String(draft.titulo||'').trim())throw new Error('Escribe el título del evento.');
        if(!Number.isInteger(count)||count<1||count>10000)throw new Error('Indica el número de personas, entre 1 y 10,000.');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.fecha||''))throw new Error('Selecciona la fecha del evento.');
        const parts=draft.fecha.split('-').map(Number);
        if(parts[0]<1900||parts[0]>9999||isoDate(parts[0],parts[1]-1,parts[2])!==draft.fecha)throw new Error('La fecha no es válida.');
        const schedule=eventSchedule(draft.inicio);const endDate=schedule.nextDay?nextDay(draft.fecha):draft.fecha;
        const start=draft.fecha+'T'+draft.inicio;const end=endDate+'T'+schedule.endTime;
        if(currentEventState.events.some(e=>e!==event&&start<e.endDate+'T'+e.endTime&&end>e.startDate+'T'+e.startTime))throw new Error('El horario coincide con otro evento de este casino.');
        if(draft.combinar&&(!draft.carne||!draft.carne2||!draft.salsa||!draft.salsa2||count<200))throw new Error('Para combinar platillos, registra al menos 200 personas y elige las dos carnes y salsas.');
        if(draft.extraGuarnicion&&!draft.guarnicion2)throw new Error('Selecciona la guarnición extra.');
        const price=pricingFor(pricingData());
        if(price.total<paidTotal(event))throw new Error('El total no puede ser menor que lo ya pagado.');
        event.name=String(draft.titulo).trim();event.startDate=draft.fecha;event.startTime=draft.inicio;event.endDate=endDate;event.endTime=schedule.endTime;
        draft.combinar=!!get('combinar').checked;draft.extraGuarnicion=!!get('extraGuarnicion').checked;
        if(!draft.combinar){draft.carne2='';draft.salsa2='';}
        if(!draft.extraGuarnicion)draft.guarnicion2='';
        event.details=draft;event.totalCents=price.total;event.pricing=price;syncPricing();titleHeader();renderMonth(state);
        status.classList.remove('is-error');status.textContent='Cambios enviados para guardar.';commit('Actualizar ficha de evento');
      }catch(error){status.classList.add('is-error');status.textContent=error.message;}
    });
    root.querySelector('#oc-event-payment').addEventListener('submit',evt=>{
      evt.preventDefault();const paymentForm=evt.currentTarget;const status=root.querySelector('#oc-payment-status');
      try{
        const data=Object.fromEntries(new FormData(paymentForm).entries());
        const price=pricingFor(pricingData());
        if(!event.pricingValid||price.total<paidTotal(event))throw new Error('Revisa el cálculo del evento antes de registrar un pago.');
        const total=price.total;const amount=toCents(data.importe);const paid=paidTotal(event);const balance=total-paid;
        if(total<=0)throw new Error('Primero indica el total acordado del evento.');
        if(amount<=0||amount>balance)throw new Error('El importe debe ser mayor a cero y no superar el saldo.');
        if(!['Apartado','Abono','Liquidación'].includes(data.concepto)||!['Efectivo','Transferencia','Tarjeta'].includes(data.metodo))throw new Error('Selecciona concepto y método de pago.');
        if(data.concepto==='Apartado'&&event.payments.some(p=>p.concept==='Apartado'))throw new Error('El apartado ya se registró. Usa Abono para los siguientes pagos.');
        if(data.concepto==='Liquidación'&&amount!==balance)throw new Error('La liquidación debe cubrir exactamente el saldo pendiente.');
        if(!data.fechaPago||data.fechaPago>bridge.today)throw new Error('Selecciona una fecha de pago válida, sin fechas futuras.');
        event.totalCents=total;event.payments.push({id:nextKey(),date:data.fechaPago,concept:data.concepto,amount,method:data.metodo,note:data.nota.trim()});
        paymentForm.elements.importe.value='';paymentForm.elements.concepto.value='Abono';paymentForm.elements.nota.value='';
        status.classList.remove('is-error');status.textContent='Pago enviado para guardar.';syncPricing();commit('Registrar cobro de cliente');
      }catch(error){status.classList.add('is-error');status.textContent=error.message;}
    });
    titleHeader();renderPayments();mountStaff();mountDelete();setConfigTab('datos');openPage('configurar');
  }
  function renderPayments(){
    const event=currentEvent;const paid=paidTotal(event);
    let price=null;try{price=pricingFor(Object.fromEntries(new FormData(root.querySelector('#oc-contract')).entries()));}catch{}
    const total=price?price.total:0;const balance=total-paid;
    root.querySelector('#oc-total-value').textContent=price?currency(total):'Por definir';
    root.querySelector('#oc-paid-value').textContent=currency(paid);
    root.querySelector('#oc-balance-value').textContent=price?currency(balance):'—';
    const deposit=event.payments.filter(p=>p.concept==='Apartado').reduce((s,p)=>s+p.amount,0);
    root.querySelector('#oc-deposit-value').textContent='Apartado: '+currency(deposit)+' · '+(total===0?'Total por definir':balance===0?'Liquidado':paid===0?'Pendiente':'Pago parcial');
    const list=root.querySelector('#oc-payment-history');list.innerHTML='';
    if(!event.payments.length){const empty=document.createElement('li');empty.className='oc-config-help';empty.textContent='Aún no hay pagos registrados.';list.append(empty);}
    event.payments.forEach(p=>{
      const li=document.createElement('li');li.className='oc-payment-row';
      li.innerHTML='<div><strong>'+safe(p.concept)+'</strong><span>'+safe(dateLabel(p.date))+' · '+safe(p.method)+'</span>'+(p.note?'<br><span>'+safe(p.note)+'</span>':'')+'</div><span class="oc-payment-money">'+currency(p.amount)+'</span>';
      list.append(li);
    });
  }
  function renderContractSummary(){
    if(!currentEvent)return;
    const form=root.querySelector('#oc-contract');const d=Object.fromEntries(new FormData(form).entries());
    function line(label,value){return '<div class="oc-summary-line"><dt>'+safe(label)+'</dt><dd>'+safe(value||'Por definir')+'</dd></div>';}
    let unitText='';try{if(String(d.precioPersona??'')!=='')unitText=currency(toCents(d.precioPersona));}catch{}
    let html='<h3 class="oc-summary-heading">Ficha del evento</h3><dl class="oc-contract-summary">'+line('Evento',d.titulo)+line('Salón',currentEventState.name)+line('Contratante',d.contratante)+line('Fecha',d.fecha?dateLabel(d.fecha):'')+line('Personas',d.personas)+line('Precio por persona',unitText)+line('Horario',d.inicio&&d.fin?hourLabel(d.inicio)+' — '+hourLabel(d.fin):'')+'</dl>';
    html+='<h3 class="oc-summary-heading">Menú</h3><dl class="oc-contract-summary">'+line('Carne',[d.carne,d.combinar?d.carne2:''].filter(Boolean).join(' / '))+line('Greiby / salsa',[d.salsa,d.combinar?d.salsa2:''].filter(Boolean).join(' / '))+line('Espagueti',d.espagueti)+line('Guarnición',d.guarnicion)+(d.extraGuarnicion?line('Guarnición extra',d.guarnicion2+' · $10.00 por persona'):'')+line('Otros',d.otros)+'</dl>';
    html+='<h3 class="oc-summary-heading">Mobiliario</h3><dl class="oc-contract-summary">';
    [['Mesa','mesa'],['Silla','silla'],['Mantel','mantel'],['Cubre mantel','cubremantel'],['Caminos','caminos'],['Cubre silla','cubresilla'],['Banda de silla','banda'],['Servilletas','servilletas'],['Plato base','plato'],['Centro de mesa','centro'],['Sugerencias','sugerencias']].forEach(([label,key])=>html+=line(label,d[key]));
    let summaryPrice=null;try{summaryPrice=pricingFor(d);}catch{}
    html+='</dl><h3 class="oc-summary-heading">Pagos del evento</h3><dl class="oc-contract-summary">'+line('Costo base',summaryPrice?currency(summaryPrice.base):'')+line('Extras',summaryPrice?currency(summaryPrice.extra):'')+line('Total',summaryPrice?currency(summaryPrice.total):'')+line('Pagado',currency(paidTotal(currentEvent)))+line('Saldo',summaryPrice?currency(summaryPrice.total-paidTotal(currentEvent)):'')+'</dl>';
    root.querySelector('#oc-contract-summary').innerHTML=html;
  }

  const personnel=[];
  const personnelRoles=['Mesero','Maestro de ceremonias','DJ','Cocina','Baños','Poli','Puerta','Barra'];
  const personnelForm=root.querySelector('#oc-personnel-form');
  const personnelArea=root.querySelector('#oc-personnel-form-area');
  const addPersonnel=root.querySelector('#oc-add-personnel');
  const personnelError=root.querySelector('#oc-personnel-error');
  personnelRoles.forEach(role=>{const option=document.createElement('option');option.value=role;option.textContent=role;personnelForm.elements.namedItem('rol').append(option);});
  states.forEach(state=>{const option=document.createElement('option');option.value=state.name;option.textContent=state.name;personnelForm.elements.namedItem('casino').append(option);});
  function togglePersonnelForm(show){
    personnelArea.hidden=!show;addPersonnel.setAttribute('aria-expanded',String(show));
    personnelError.hidden=true;
    if(show){root.querySelector('#oc-personnel-status').textContent='';root.querySelector('#oc-person-name').focus();}
    else{personnelForm.reset();addPersonnel.focus();}
  }
  addPersonnel.addEventListener('click',()=>togglePersonnelForm(personnelArea.hidden));
  root.querySelector('#oc-cancel-personnel').addEventListener('click',()=>togglePersonnelForm(false));
  function renderPersonnel(){
    const rows=root.querySelector('#oc-personnel-rows');rows.replaceChildren();
    [...personnel].sort((a,b)=>a.name.localeCompare(b.name,'es')).forEach(person=>{
      const tr=document.createElement('tr');
      [[person.name,'Nombre'],[person.role,'Rol'],[person.casino,'Casino habitual']].forEach(([text,label])=>{
        const td=document.createElement('td');td.textContent=text;td.dataset.label=label;tr.append(td);
      });rows.append(tr);
    });
    root.querySelector('#oc-personnel-count').textContent=personnel.length+(personnel.length===1?' persona':' personas');
    root.querySelector('#oc-personnel-empty').hidden=personnel.length>0;
    root.querySelector('#oc-personnel-table').hidden=personnel.length===0;
  }
  personnelForm.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(personnelForm);
    const name=String(data.get('nombre')||'').trim().replace(/\s+/g,' ');
    const role=String(data.get('rol')||'');const casino=String(data.get('casino')||'');
    let error='';
    if(!name||name.length>100)error='Escribe un nombre de hasta 100 caracteres.';
    else if(!personnelRoles.includes(role))error='Selecciona uno de los roles de la lista.';
    else if(!states.some(state=>state.name===casino))error='Selecciona el casino habitual.';
    else if(personnel.some(person=>person.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es')&&person.role===role&&person.casino===casino))error='Esta persona ya está registrada con ese rol y casino.';
    if(error){personnelError.textContent=error;personnelError.hidden=false;return;}
    personnel.push({id:nextKey(),name,role,casino});
    renderPersonnel();togglePersonnelForm(false);commit('Agregar personal');
    root.querySelector('#oc-personnel-status').textContent=name+' se agregó al equipo de '+casino+'.';
  });
  renderPersonnel();

  function eventById(id){return states.flatMap(s=>s.events).find(e=>String(e.id)===String(id));}
  function staffPaid(id,cutoff=bridge.today){return staffPayments.filter(p=>String(p.assignmentId)===String(id)&&p.date<=cutoff).reduce((sum,p)=>sum+p.amount,0);}
  function renderStaff(){
    const host=root.querySelector('#oc-staff-assigned');if(!host||!currentEvent)return;
    host.replaceChildren();
    const rows=assignments.filter(a=>String(a.eventId)===String(currentEvent.id));
    if(!rows.length){const p=document.createElement('p');p.className='oc-config-help';p.textContent='Aún no hay personal asignado a este evento.';host.append(p);}
    rows.forEach(a=>{
      const person=personnel.find(p=>String(p.id)===String(a.personId));const row=document.createElement('div');row.className='oc-payment-row';
      row.innerHTML='<div><strong>'+safe(person.name)+'</strong><span>'+safe(person.role)+' · '+safe(person.casino)+'</span></div><span>'+currency(a.payCents)+'</span>';host.append(row);
      const remaining=a.payCents-staffPaid(a.id);
      if(remaining>0){const pay=document.createElement('button');pay.type='button';pay.className='oc-text-button cursor-interaction';pay.textContent=currentEvent.completed?'Registrar pago al personal':'Registrar anticipo al personal';pay.addEventListener('click',()=>showStaffPayment({jobs:[{assignment:a,event:currentEvent,balance:remaining}]},row));row.append(pay);}

    });
    const done=root.querySelector('#oc-mark-completed');done.disabled=currentEvent.completed||currentEvent.endDate>=bridge.today;
    done.textContent=currentEvent.completed?'Evento realizado':'Confirmar evento realizado';
  }
  function mountStaff(){
    const tabs=root.querySelector('.oc-config-tabs');
    if(!tabs.querySelector('[data-config-tab=equipo]')){
      const b=document.createElement('button');b.type='button';b.dataset.configTab='equipo';b.className='cursor-interaction';b.textContent='Personal';b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>setConfigTab('equipo'));tabs.insertBefore(b,tabs.querySelector('[data-config-tab=cobros]'));
    }
    const parent=root.querySelector('#oc-event-config-content');const section=document.createElement('div');section.dataset.configPane='equipo';section.hidden=true;
    section.innerHTML='<p class="oc-config-help">La asignación usa el casino habitual y evita dos turnos para la misma persona en una fecha. Anakai rota al equipo con menos turnos históricos allí.</p><form id="oc-auto-staff"><div class="oc-config-grid"><label>Rol<select name="rol" required>'+personnelRoles.map(r=>'<option>'+safe(r)+'</option>').join('')+'</select></label><label>Cantidad<input type="number" name="cantidad" min="1" max="100" value="1" required></label><label>Pago por persona y turno (MXN)<input type="number" name="importe" min="0" step="0.01" value="500" required></label></div><div class="oc-config-bottom"><button type="submit" class="oc-primary oc-small-primary cursor-interaction">Asignar automáticamente</button><p id="oc-staff-error" class="oc-config-message is-error" role="alert"></p></div></form><div id="oc-staff-assigned"></div><button type="button" id="oc-mark-completed" class="oc-text-button cursor-interaction">Confirmar evento realizado</button><p class="oc-config-help">Confirma el evento después de trabajarlo para que sus turnos pendientes aparezcan en los sobres.</p>';
    parent.append(section);
    section.querySelector('form').addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(e.currentTarget);const error=section.querySelector('#oc-staff-error');
      try{if(currentEvent.completed)throw new Error('El evento ya está realizado.');const count=Number(f.get('cantidad'));if(!Number.isInteger(count)||count<1||count>100)throw new Error('Cantidad inválida.');
        command('auto_assign',{eventId:currentEvent.id,role:f.get('rol'),count,payCents:toCents(f.get('importe'))});
      }catch(err){error.textContent=err.message;}
    });
    section.querySelector('#oc-mark-completed').addEventListener('click',()=>{currentEvent.completed=true;commit('Confirmar evento realizado');});
    renderStaff();
  }
  function nextFriday(){const [y,m,d]=bridge.today.split('-').map(Number);const day=new Date(y,m-1,d,12);return isoDate(y,m-1,d+(5-day.getDay()+7)%7);}
  function envelopeRows(friday){
    return [...personnel].sort((a,b)=>a.casino.localeCompare(b.casino)||a.name.localeCompare(b.name,'es')).map(person=>{
      const jobs=[],future=[];
      assignments.filter(a=>String(a.personId)===String(person.id)).forEach(a=>{
        const event=eventById(a.eventId);const balance=a.payCents-staffPaid(a.id,friday);
        if(event.completed&&event.startDate<friday&&balance>0)jobs.push({assignment:a,event,balance});
        if(!event.completed&&event.startDate>=friday)future.push(event);
      });
      future.sort((a,b)=>(a.startDate+'T'+a.startTime).localeCompare(b.startDate+'T'+b.startTime));
      return {person,amount:jobs.reduce((s,j)=>s+j.balance,0),jobs,next:future[0]||null};
    });
  }
  function renderEnvelopes(){
    const friday=root.querySelector('#oc-pay-friday').value;
    const [y,m,d]=friday.split('-').map(Number);
    const valid=friday&&new Date(y,m-1,d,12).getDay()===5;
    root.querySelector('#oc-payday-error').textContent=valid?'':'Selecciona un viernes de entrega.';
    const rows=root.querySelector('#oc-envelopes-rows');rows.replaceChildren();if(!valid)return;
    const envelopes=envelopeRows(friday);
    envelopes.forEach(e=>{
      const tr=document.createElement('tr');const columns=['Nombre','Monto a pagar','Próximo evento','Horario','Casino'];
      const cells=columns.map(label=>{const td=document.createElement('td');td.dataset.label=label;tr.append(td);return td;});
      cells[0].textContent=e.person.name;cells[1].className='oc-envelope-money';cells[1].textContent=currency(e.amount);
      if(e.jobs.length&&friday>=bridge.today){const b=document.createElement('button');b.className='oc-text-button cursor-interaction';b.type='button';b.textContent='Registrar pago';b.addEventListener('click',()=>showStaffPayment(e,cells[1]));cells[1].append(document.createElement('br'),b);}
      if(e.next){const b=document.createElement('button');b.className='oc-envelope-event cursor-interaction';b.type='button';b.textContent=e.next.name;b.addEventListener('click',()=>openEvent(states.find(s=>s.id===e.next.casinoId),e.next));cells[2].append(b);const day=document.createElement('span');day.className='oc-envelope-date';day.textContent=dateLabel(e.next.startDate);cells[2].append(day);cells[3].textContent=hourLabel(e.next.startTime)+' — '+hourLabel(e.next.endTime)+(e.next.endDate!==e.next.startDate?' (+1 día)':'');cells[4].textContent=states[e.next.casinoId-1].name;}
      else{cells[2].textContent='Sin próximo evento asignado';cells[3].textContent='—';cells[4].textContent='—';}
      rows.append(tr);
    });
    root.querySelector('#oc-envelopes-demo').hidden=true;
    root.querySelector('#oc-envelopes-count').textContent=envelopes.length+' personas';root.querySelector('#oc-envelopes-total').textContent='Total a pagar: '+currency(envelopes.reduce((sum,e)=>sum+e.amount,0));
    root.querySelector('#oc-envelopes-empty').hidden=envelopes.length>0;root.querySelector('#oc-envelopes-table').hidden=envelopes.length===0;
    root.querySelector('#oc-envelopes-note').textContent='Los importes corresponden a turnos realizados antes del viernes y descuentan pagos al personal hasta esa fecha. Descargar etiquetas no registra pagos.';
  }
  function showStaffPayment(row,cell){
    cell.querySelector('form')?.remove();const form=document.createElement('form');form.className='oc-booking';
    form.innerHTML='<label>Turno<select name="turno">'+row.jobs.map(j=>'<option value="'+safe(j.assignment.id)+'">'+safe(j.event.name)+' · '+currency(j.balance)+'</option>').join('')+'</select></label><label>Importe (MXN)<input type="number" name="importe" min="0.01" step="0.01" required></label><label>Método<select name="metodo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label><button type="submit" class="oc-primary oc-small-primary cursor-interaction">Guardar pago</button><p class="oc-booking-error" role="alert"></p>';
    form.addEventListener('submit',e=>{
      e.preventDefault();const f=new FormData(form);
      try{const id=String(f.get('turno'));const job=row.jobs.find(j=>String(j.assignment.id)===id);const amount=toCents(f.get('importe'));if(amount<=0||amount>job.assignment.payCents-staffPaid(id))throw new Error('El importe supera el saldo actual del turno.');
        staffPayments.push({id:nextKey(),assignmentId:id,date:bridge.today,amount,method:f.get('metodo')});commit('Registrar pago al personal');
      }catch(error){form.querySelector('p').textContent=error.message;}
    });cell.append(form);
  }

  function mountDelete(){
    const pane=root.querySelector('[data-config-pane=datos]');const button=document.createElement('button');button.type='button';button.className='oc-text-button';button.textContent='Eliminar evento capturado por error';
    button.addEventListener('click',()=>{
      const ids=assignments.filter(a=>String(a.eventId)===String(currentEvent.id)).map(a=>String(a.id));
      if(currentEvent.payments.length||staffPayments.some(p=>ids.includes(String(p.assignmentId)))){status('Este evento tiene pagos registrados y no puede eliminarse.',true);return;}
      if(!window.confirm('¿Eliminar este evento y sus asignaciones?'))return;
      const id=currentEvent.id;currentEventState.events=currentEventState.events.filter(e=>e.id!==id);
      for(let i=assignments.length-1;i>=0;i--)if(String(assignments[i].eventId)===String(id))assignments.splice(i,1);
      currentEvent=null;openPage('eventos');commit('Eliminar evento erróneo');
    });pane.append(button);
  }

  root.querySelector('#oc-pay-friday').value=nextFriday();
  root.querySelector('#oc-pay-friday').addEventListener('change',()=>{root.querySelector('#oc-ready-pdf').hidden=true;renderEnvelopes();});
  root.querySelector('#oc-export-labels').addEventListener('click',()=>command('pdf',{friday:root.querySelector('#oc-pay-friday').value}));
  hydrate(data.snapshot);states.forEach(renderMonth);renderPersonnel();
  openPage('inicio');

  
}
