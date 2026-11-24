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
    const id=nextKey();bridge.pending=id;bridge.pendingType=type;bridge.pendingLabel=extra.label;status('Guardando…');root.setAttribute('aria-busy','true');
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
      else renderStaff();
    }
    if(!root.querySelector('[data-oc-panel=pagos]').hidden)renderEnvelopes();
    root.querySelector('#oc-ready-pdf').hidden=true;
    root.querySelector('#oc-ready-contract')?.setAttribute('hidden','');
    if(reply.pdf){
      const a=root.querySelector('#oc-ready-pdf');a.href='data:application/pdf;base64,'+reply.pdf;a.download=reply.filename;a.hidden=false;
    }
    if(reply.contractPdf){const a=root.querySelector('#oc-ready-contract');if(a){a.href='data:application/pdf;base64,'+reply.contractPdf;a.download=reply.filename;a.hidden=false;}}
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
      else if(state.events.some(e=>spacingConflict(e,start,end)))message='Debe haber al menos 6 horas libres entre el fin de un evento y el inicio del siguiente.';
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
        inputField('Tipo de evento','tipoEvento','text',event.type,'maxlength="80" required')+inputField('Nombre del contratante','contratante','text',d.contratante,'maxlength="120"')+
        inputField('Domicilio del contratante','domicilioCliente','text',d.domicilioCliente)+inputField('Contacto del contratante','contactoCliente','text',d.contactoCliente)+inputField('Prestador: nombre o razón social','proveedor','text',d.proveedor)+inputField('Domicilio del prestador','domicilioProveedor','text',d.domicilioProveedor)+inputField('Contacto para aclaraciones','contactoProveedor','text',d.contactoProveedor)+inputField('Domicilio del salón','domicilioSalon','text',d.domicilioSalon)+inputField('Condiciones adicionales acordadas','condiciones','text',d.condiciones,'maxlength="1500"')+inputField('Fecha del evento','fecha','date',event.startDate,'required')+
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
        if(currentEventState.events.some(e=>e!==event&&spacingConflict(e,start,end)))throw new Error('Debe haber al menos 6 horas para limpieza y montaje entre eventos de este casino.');
        if(draft.combinar&&(!draft.carne||!draft.carne2||!draft.salsa||!draft.salsa2||count<200))throw new Error('Para combinar platillos, registra al menos 200 personas y elige las dos carnes y salsas.');
        if(draft.extraGuarnicion&&!draft.guarnicion2)throw new Error('Selecciona la guarnición extra.');
        const price=pricingFor(pricingData());
        if(price.total<paidTotal(event))throw new Error('El total no puede ser menor que lo ya pagado.');
        event.type=String(draft.tipoEvento).trim();event.name=String(draft.titulo).trim();event.startDate=draft.fecha;event.startTime=draft.inicio;event.endDate=endDate;event.endTime=schedule.endTime;
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
  const personnelForm=root.querySelector('#oc-personnel-form'),personnelArea=root.querySelector('#oc-personnel-form-area'),addPersonnel=root.querySelector('#oc-add-personnel'),personnelError=root.querySelector('#oc-personnel-error');
  let editingPerson=null;
  personnelRoles.forEach(role=>{const option=document.createElement('option');option.value=role;option.textContent=role;personnelForm.elements.namedItem('rol').append(option);});
  states.forEach(state=>{const option=document.createElement('option');option.value=state.name;option.textContent=state.name;personnelForm.elements.namedItem('casino').append(option);});
  function togglePersonnelForm(show){personnelArea.hidden=!show;addPersonnel.setAttribute('aria-expanded',String(show));personnelError.hidden=true;if(show){root.querySelector('#oc-personnel-status').textContent='';root.querySelector('#oc-person-name').focus();}else{editingPerson=null;personnelForm.reset();addPersonnel.focus();}}
  addPersonnel.addEventListener('click',()=>{editingPerson=null;personnelForm.reset();personnelArea.querySelector('h3').textContent='Agregar personal';togglePersonnelForm(personnelArea.hidden);});
  root.querySelector('#oc-cancel-personnel').addEventListener('click',()=>togglePersonnelForm(false));
  function renderPersonnel(){
    const rows=root.querySelector('#oc-personnel-rows');rows.replaceChildren();const active=personnel.filter(p=>p.active!==false);
    [...active].sort((a,b)=>a.name.localeCompare(b.name,'es')).forEach(person=>{
      const tr=document.createElement('tr');tr.dataset.personId=person.id;
      [[person.name,'Nombre'],[person.role,'Rol'],[person.casino,'Casino habitual']].forEach(([text,label])=>{const td=document.createElement('td');td.textContent=text;td.dataset.label=label;tr.append(td);});
      const actions=document.createElement('td');actions.dataset.label='Acciones';
      const edit=document.createElement('button');edit.type='button';edit.className='oc-text-button';edit.textContent='Editar';edit.dataset.action='edit';edit.addEventListener('click',()=>{editingPerson=person.id;personnelArea.querySelector('h3').textContent='Editar personal';personnelForm.elements.nombre.value=person.name;personnelForm.elements.rol.value=person.role;personnelForm.elements.casino.value=person.casino;togglePersonnelForm(true);});
      const remove=document.createElement('button');remove.type='button';remove.className='oc-text-button';remove.textContent='Eliminar';remove.dataset.action='delete';remove.addEventListener('click',()=>{
        const linked=assignments.filter(a=>String(a.personId)===String(person.id));
        if(!window.confirm('¿Eliminar a '+person.name+' del personal activo? Se conservarán sus turnos y pagos anteriores. Las asignaciones futuras pendientes se liberarán.'))return;
        // Retain worked history; release future unpaid turns so weekly preparation can replace them.
        for(let i=assignments.length-1;i>=0;i--){const a=assignments[i],event=eventById(a.eventId);if(String(a.personId)===String(person.id)&&!event.completed&&event.startDate>=bridge.today&&!staffPayments.some(p=>String(p.assignmentId)===String(a.id)))assignments.splice(i,1);}
        const hasHistory=assignments.some(a=>String(a.personId)===String(person.id));
        if(hasHistory)person.active=false;else personnel.splice(personnel.indexOf(person),1);
        togglePersonnelForm(false);commit('Eliminar personal');
      });
      actions.append(edit,document.createTextNode(' · '),remove);tr.append(actions);rows.append(tr);
    });
    root.querySelector('#oc-personnel-count').textContent=active.length+(active.length===1?' persona':' personas');root.querySelector('#oc-personnel-empty').hidden=active.length>0;root.querySelector('#oc-personnel-table').hidden=active.length===0;
  }
  personnelForm.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(personnelForm);const name=String(data.get('nombre')||'').trim().replace(/\s+/g,' '),role=String(data.get('rol')||''),casino=String(data.get('casino')||'');let error='';
    if(!name||name.length>100)error='Escribe un nombre de hasta 100 caracteres.';else if(!personnelRoles.includes(role)||!states.some(s=>s.name===casino))error='Selecciona un rol y casino válidos.';else if(personnel.some(p=>p.active!==false&&p.id!==editingPerson&&p.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es')&&p.role===role&&p.casino===casino))error='Esta persona ya está registrada.';
    if(error){personnelError.textContent=error;personnelError.hidden=false;return;}
    if(editingPerson){const person=personnel.find(p=>p.id===editingPerson);Object.assign(person,{name,role,casino});}else personnel.push({id:nextKey(),name,role,casino,active:true});
    renderPersonnel();togglePersonnelForm(false);commit('Guardar personal');
  });
  renderPersonnel();
  function eventById(id){return states.flatMap(s=>s.events).find(e=>String(e.id)===String(id));}
  function staffPaid(id,cutoff=bridge.today){return staffPayments.filter(p=>String(p.assignmentId)===String(id)&&p.date<=cutoff).reduce((sum,p)=>sum+p.amount,0);}
  function weekDates(){const [y,m,d]=bridge.today.split('-').map(Number);const day=new Date(y,m-1,d,12);const monday=d-(day.getDay()+6)%7;return {start:isoDate(y,m-1,monday),next:isoDate(y,m-1,monday+7),end:isoDate(y,m-1,monday+14)};}
  function spacingConflict(e,start,end){const gap=6*3600000;return new Date(start).getTime()<new Date(e.endDate+'T'+e.endTime).getTime()+gap&&new Date(end).getTime()+gap>new Date(e.startDate+'T'+e.startTime).getTime();}
  function renderStaff(){const done=root.querySelector('#oc-mark-completed');if(!done||!currentEvent)return;done.disabled=currentEvent.completed||(currentEvent.endDate+'T'+currentEvent.endTime)>(bridge.data.now||bridge.today+'T00:00');done.textContent=currentEvent.completed?'Evento realizado':'Confirmar evento realizado';}
  function mountStaff(){
    const pane=root.querySelector('[data-config-pane=datos]');
    const box=document.createElement('div');box.className='oc-config-note';
    box.innerHTML='<button type="button" id="oc-download-contract" class="oc-primary oc-small-primary">Descargar contrato PDF</button> <a id="oc-ready-contract" hidden class="oc-text-button">Descargar contrato preparado</a><p class="oc-config-help">El PDF usa la ficha guardada, el menú, mobiliario, total y apartado registrados. Guarda los cambios antes de descargarlo. Incluye condiciones para revisar y completar antes de firmar.</p><button type="button" id="oc-mark-completed" class="oc-text-button">Confirmar evento realizado</button><p class="oc-config-help">Confirma la realización cuando termine el evento. Los sobres pueden prepararse antes con los turnos programados.</p>';
    const staffingInfo=document.createElement('p');staffingInfo.id='oc-required-staff';staffingInfo.className='oc-config-help';const guestsField=root.querySelector('#oc-contract').elements.personas;
    function updateStaffingInfo(){const req=requiredStaff({details:{personas:guestsField.value}});staffingInfo.textContent=Number(guestsField.value)>0?'Equipo obligatorio: 1 Baños · 2 Barra · 1 Maestro de ceremonias · 1 Poli · 1 Puerta · 2 Cocina · '+req.Mesero+' meseros para '+req.tables+' mesas de hasta 10 personas. Ningún mesero atenderá más de 3 mesas.':'Captura el número de personas para calcular los meseros. Cada evento requiere además 1 Baños, 2 Barra, 1 Maestro de ceremonias, 1 Poli, 1 Puerta y 2 Cocina.';}
    guestsField.addEventListener('input',updateStaffingInfo);updateStaffingInfo();pane.append(staffingInfo);
    pane.append(box);box.querySelector('#oc-download-contract').addEventListener('click',()=>command('contract',{eventId:currentEvent.id}));
    box.querySelector('#oc-mark-completed').addEventListener('click',()=>{currentEvent.completed=true;commit('Confirmar evento realizado');});renderStaff();
  }
  function envelopeRows(){
    const week=weekDates();return [...personnel].sort((a,b)=>a.casino.localeCompare(b.casino)||a.name.localeCompare(b.name,'es')).map(person=>{
      const jobs=[],future=[],thisWeek=[];
      assignments.filter(a=>String(a.personId)===String(person.id)).forEach(a=>{
        const event=eventById(a.eventId),balance=a.payCents-staffPaid(a.id);
        if(event.startDate>=week.start&&event.startDate<week.next){thisWeek.push(event);if(balance>0)jobs.push({assignment:a,event,balance});}
        if(!event.completed&&event.startDate>=week.next&&event.startDate<week.end)future.push(event);
      });
      future.sort((a,b)=>(a.startDate+'T'+a.startTime).localeCompare(b.startDate+'T'+b.startTime));
      thisWeek.sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime));const deliveryEvent=thisWeek.at(-1);
      return {person,amount:jobs.reduce((s,j)=>s+j.balance,0),jobs,future,next:future[0]||null,delivery:deliveryEvent?.endDate,deliveryEvent,deliveryCasinoId:deliveryEvent?.casinoId};
    }).filter(e=>e.person.active!==false||e.jobs.length||e.future.length);
  }
  function requiredStaff(event){const people=Number(event.details?.personas)||0;const tables=Math.ceil(people/10);return {tables,Mesero:people?Math.max(1,Math.floor(people/20),Math.ceil(tables/3)):0,'Baños':1,'Barra':2,'Maestro de ceremonias':1,'Poli':1,'Puerta':1,'Cocina':2};}
  function renderWeeklyPlans(){
    const host=root.querySelector('#oc-weekly-plans');host.replaceChildren();const week=weekDates();
    const upcoming=states.flatMap(s=>s.events).filter(e=>e.startDate>=week.start&&e.startDate<week.end&&!e.completed).sort((a,b)=>(a.startDate+a.startTime).localeCompare(b.startDate+b.startTime));
    if(!upcoming.length){host.textContent='No hay eventos pendientes de esta semana ni de la siguiente.';return;}
    const help=document.createElement('p');help.className='oc-config-help';help.textContent='Cada evento exige 1 de Baños, 2 de Barra, 1 Maestro de ceremonias, 1 Poli, 1 de Puerta y 2 de Cocina. Los meseros se calculan con mesas de 10: un mesero por cada 20 personas, redondeando hacia abajo; las mesas sobrantes se reparten hasta un máximo de 3 por mesero. Si faltan meseros se permite ese mismo máximo. Ajusta la paga por turno; puedes agregar refuerzos en otros roles. Guarda las necesidades y pulsa Preparar sobres de esta semana el día que decidan; abrir esta sección no hace asignaciones. Si falta personal, se conserva todo sin cambios.';host.append(help);
    upcoming.forEach(event=>{
      const details=document.createElement('details');const title=document.createElement('summary');title.textContent=(event.startDate<week.next?'Esta semana · ':'Próxima semana · ')+event.name+' · '+states[event.casinoId-1].name+' · '+dateLabel(event.startDate)+(event.details?.personas?' · '+requiredStaff(event).tables+' mesas':' · Falta número de personas');details.append(title);const assigned=assignments.filter(a=>String(a.eventId)===String(event.id)&&a.role==='Mesero').length;const note=document.createElement('p');note.className='oc-config-help';note.textContent='Meseros asignados: '+assigned+' · Objetivo normal: '+requiredStaff(event).Mesero+'. La preparación exige cubrir todos los eventos sin exceder 3 mesas por mesero.';details.append(note);
      const form=document.createElement('form');form.className='oc-booking';
      form.innerHTML=personnelRoles.map((role,i)=>{const required=requiredStaff(event);const need=event.staffing?.find(n=>n.role===role);const existing=assignments.filter(a=>String(a.eventId)===String(event.id)&&(a.role||personnel.find(p=>String(p.id)===String(a.personId))?.role)===role);return '<div class="oc-plan-row"><strong>'+safe(role)+'</strong><label>Personas<input type="number" min="'+(required[role]||0)+'" max="1000" name="count'+i+'" value="'+(role==='Mesero'?required.Mesero:Math.max(required[role]||0,need?.count??existing.length))+'" '+(role==='Mesero'?'readonly':'')+' required></label><label>Pago por turno (MXN)<input type="number" min="0" step="0.01" name="pay'+i+'" value="'+((need?.payCents??existing[0]?.payCents??50000)/100).toFixed(2)+'" required></label></div>';}).join('')+'<button class="oc-primary oc-small-primary" type="submit">Guardar necesidades de este evento</button><p role="alert"></p>';
      form.addEventListener('submit',e=>{e.preventDefault();try{const plan=personnelRoles.map((role,i)=>{const count=Number(form.elements['count'+i].value);if(!Number.isInteger(count)||count<0||count>1000)throw new Error('Cantidad inválida.');return {role,count,payCents:toCents(form.elements['pay'+i].value)};});event.staffing=plan;commit('Guardar necesidades de personal');}catch(err){form.querySelector('p').textContent=err.message;}});
      details.append(form);host.append(details);
    });
  }
  function renderEnvelopes(){
    const week=weekDates();root.querySelector('#oc-week-range').textContent='Trabajo de esta semana: '+dateLabel(week.start)+' a '+dateLabel(isoDate(Number(week.next.slice(0,4)),Number(week.next.slice(5,7))-1,Number(week.next.slice(8,10))-1))+'. Próximos eventos: semana del '+dateLabel(week.next)+'.';
    const host=root.querySelector('#oc-casino-envelopes');
    const opened=new Set([...host.querySelectorAll('details[data-envelope-casino][open]')].map(d=>d.dataset.envelopeCasino));const first=!host.children.length;host.replaceChildren();
    const envelopes=envelopeRows().filter(e=>e.deliveryEvent);
    states.forEach(state=>{
      const group=envelopes.filter(e=>e.deliveryCasinoId===state.id);const weekEvents=state.events.filter(e=>e.startDate>=week.start&&e.startDate<week.next);const subtotal=group.reduce((sum,e)=>sum+e.amount,0);
      const section=document.createElement('details');section.className='oc-casino-envelopes';section.dataset.envelopeCasino=String(state.id);section.open=opened.has(String(state.id))||(first&&group.length>0);
      const summary=document.createElement('summary');const name=document.createElement('strong');name.textContent=state.name;const count=document.createElement('span');count.textContent=group.length+' '+(group.length===1?'sobre':'sobres')+' · '+currency(subtotal);summary.append(name,count);section.append(summary);
      if(!group.length){const empty=document.createElement('p');empty.className='oc-casino-envelope-empty';empty.textContent=weekEvents.length?'No hay personal asignado para recibir sobres en este casino.':'No hay eventos esta semana en este casino.';section.append(empty);}
      else{
        const handoff=document.createElement('p');handoff.className='oc-casino-envelope-help';handoff.textContent='Preparar estos sobres para los maestros de ceremonias de '+state.name+'. Ellos los entregan a cada empleado al finalizar su último turno de la semana.';section.append(handoff);
        const table=document.createElement('table');table.className='oc-envelopes-table';table.innerHTML='<caption class="oc-visually-hidden">Sobres para entregar en '+safe(state.name)+'</caption><thead><tr><th scope="col">Nombre del empleado</th><th scope="col">Próximos eventos · escribir en el sobre</th><th scope="col">Dinero por entregar</th></tr></thead>';
        const body=document.createElement('tbody');body.className='oc-casino-envelope-rows';
        group.forEach(e=>{
          const tr=document.createElement('tr');tr.dataset.envelopePerson=e.person.id;
          const name=document.createElement('td');name.dataset.label='Nombre del empleado';const title=document.createElement('strong');title.textContent=e.person.name;name.append(title);
          const delivery=document.createElement('span');delivery.className='oc-envelope-date';delivery.textContent='Último turno: '+dateLabel(e.deliveryEvent.startDate)+' · '+e.deliveryEvent.name;name.append(delivery);
          const masters=assignments.filter(a=>String(a.eventId)===String(e.deliveryEvent.id)&&(a.role||personnel.find(p=>String(p.id)===String(a.personId))?.role)==='Maestro de ceremonias').map(a=>personnel.find(p=>String(p.id)===String(a.personId))?.name).filter(Boolean);
          const mc=document.createElement('span');mc.className='oc-envelope-date';mc.textContent=masters.length?'Entregar al maestro: '+masters.join(', '):'Maestro de ceremonias por asignar';name.append(mc);
          const future=document.createElement('td');future.dataset.label='Próximos eventos';
          e.future.forEach(n=>{const item=document.createElement('div');item.className='oc-envelope-next';const b=document.createElement('button');b.className='oc-envelope-event';b.type='button';b.textContent=n.name;b.addEventListener('click',()=>openEvent(states.find(s=>s.id===n.casinoId),n));const when=document.createElement('span');when.className='oc-envelope-date';when.textContent=dateLabel(n.startDate)+' · '+hourLabel(n.startTime)+' — '+hourLabel(n.endTime)+(n.endDate!==n.startDate?' (+1 día)':'')+' · '+states[n.casinoId-1].name;item.append(b,when);future.append(item);});
          if(!e.future.length){future.textContent='';future.setAttribute('aria-label','Sin próximos eventos; dejar el sobre sólo con el nombre');}
          const amount=document.createElement('td');amount.dataset.label='Dinero por entregar';amount.className='oc-envelope-money';const value=document.createElement('strong');value.textContent=currency(e.amount);amount.append(value);
          const breakdown=document.createElement('details');breakdown.className='oc-envelope-breakdown';const label=document.createElement('summary');label.textContent='Ver turnos de esta semana';breakdown.append(label);e.jobs.forEach(j=>{const line=document.createElement('p');line.textContent=dateLabel(j.event.startDate)+' · '+states[j.event.casinoId-1].name+' · '+j.event.name+': '+currency(j.balance);breakdown.append(line);});amount.append(breakdown);
          const pay=document.createElement('button');pay.type='button';pay.className='oc-text-button oc-register-envelope-payment';pay.textContent=e.jobs.length?'Registrar pago al empleado':'Pagos cubiertos';pay.disabled=!e.jobs.length;pay.addEventListener('click',()=>showStaffPayment(e,amount));amount.append(pay);tr.append(name,future,amount);body.append(tr);
        });table.append(body);section.append(table);
      }host.append(section);
    });
    root.querySelector('#oc-envelopes-demo').hidden=true;root.querySelector('#oc-envelopes-count').textContent=envelopes.length+' sobres por preparar';root.querySelector('#oc-envelopes-total').textContent='Dinero pendiente de esta semana: '+currency(envelopes.reduce((sum,e)=>sum+e.amount,0));root.querySelector('#oc-envelopes-empty').hidden=envelopes.length>0;
    root.querySelector('#oc-envelopes-note').textContent='Pulsa Preparar sobres de esta semana el martes, jueves o cualquier día que decidan. El monto es el total previsto por TODOS sus turnos programados de lunes a domingo, menos anticipos y pagos. Actualiza si cambian los eventos. Un sobre por persona, en el casino de su último turno. Si no trabaja la siguiente semana, escribe sólo su nombre. Preparar o pasar sobres al maestro no registra pagos; regístralos al entregar el dinero al empleado.';
    const notices=root.querySelector('#oc-notify-list');notices.replaceChildren();const toNotify=envelopeRows().filter(e=>!e.deliveryEvent&&e.future.length);root.querySelector('#oc-notify-panel').querySelector('summary').textContent='Personal por avisar · '+toNotify.length+' personas';
    if(!toNotify.length){notices.textContent='No hay personal adicional por avisar.';}
    else{const help=document.createElement('p');help.className='oc-config-help';help.textContent='Omar: estas personas no trabajan esta semana y no recibirán sobre. Avísales por mensaje sus turnos de la próxima semana.';notices.append(help);toNotify.forEach(e=>{const row=document.createElement('div');row.className='oc-payment-row';const name=document.createElement('strong');name.textContent=e.person.name;row.append(name);e.future.forEach(n=>{const when=document.createElement('p');when.textContent=n.name+' · '+dateLabel(n.startDate)+' · '+hourLabel(n.startTime)+' — '+hourLabel(n.endTime)+(n.endDate!==n.startDate?' (+1 día)':'')+' · '+states[n.casinoId-1].name;row.append(when);});notices.append(row);});}
    renderWeeklyPlans();renderOlderBalances();
  }
  function renderOlderBalances(){
    const host=root.querySelector('#oc-older-balances');host.replaceChildren();const week=weekDates();
    personnel.forEach(person=>{const jobs=assignments.filter(a=>String(a.personId)===String(person.id)).map(a=>({assignment:a,event:eventById(a.eventId),balance:a.payCents-staffPaid(a.id)})).filter(j=>j.event.completed&&j.event.startDate<week.start&&j.balance>0);if(!jobs.length)return;const row=document.createElement('div');row.className='oc-payment-row';const label=document.createElement('span');label.textContent=person.name+' · '+currency(jobs.reduce((s,j)=>s+j.balance,0));const b=document.createElement('button');b.className='oc-text-button';b.type='button';b.textContent='Registrar pago anterior';b.addEventListener('click',()=>showStaffPayment({jobs},row));row.append(label,b);host.append(row);});
    if(!host.children.length)host.textContent='Sin saldos anteriores pendientes.';
  }
  function showStaffPayment(row,cell){
    cell.querySelector('form')?.remove();const form=document.createElement('form');form.className='oc-booking';
    form.innerHTML='<label>Turno<select name="turno">'+row.jobs.map(j=>'<option value="'+safe(j.assignment.id)+'">'+safe(j.event.name)+' · '+safe(j.event.startDate)+' · '+currency(j.balance)+'</option>').join('')+'</select></label><label>Importe (MXN)<input type="number" name="importe" min="0.01" step="0.01" required></label><label>Método<select name="metodo"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option></select></label><button type="submit" class="oc-primary oc-small-primary">Guardar pago</button><p class="oc-booking-error" role="alert"></p>';
    form.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form);try{const id=String(f.get('turno'));const job=row.jobs.find(j=>String(j.assignment.id)===id);const amount=toCents(f.get('importe'));if(amount<=0||amount>job.assignment.payCents-staffPaid(id))throw new Error('El importe supera el saldo actual del turno.');staffPayments.push({id:nextKey(),assignmentId:id,date:bridge.today,amount,method:f.get('metodo')});commit('Registrar pago al personal');}catch(error){form.querySelector('p').textContent=error.message;}});cell.append(form);
  }
  function mountDelete(){
    const pane=root.querySelector('[data-config-pane=datos]');const button=document.createElement('button');button.type='button';button.className='oc-text-button';button.textContent='Eliminar evento capturado por error';
    button.addEventListener('click',()=>{const ids=assignments.filter(a=>String(a.eventId)===String(currentEvent.id)).map(a=>String(a.id));if(currentEvent.payments.length||staffPayments.some(p=>ids.includes(String(p.assignmentId)))){status('Este evento tiene pagos registrados y no puede eliminarse.',true);return;}if(!window.confirm('¿Eliminar este evento y sus asignaciones?'))return;const id=currentEvent.id;currentEventState.events=currentEventState.events.filter(e=>e.id!==id);for(let i=assignments.length-1;i>=0;i--)if(String(assignments[i].eventId)===String(id))assignments.splice(i,1);currentEvent=null;openPage('eventos');commit('Eliminar evento erróneo');});pane.append(button);
  }

  root.querySelector('#oc-export-labels').addEventListener('click',()=>command('pdf'));
  root.querySelector('#oc-prepare-week').addEventListener('click',()=>command('prepare_envelopes'));
  hydrate(data.snapshot);states.forEach(renderMonth);renderPersonnel();
  openPage('inicio');

  
}
