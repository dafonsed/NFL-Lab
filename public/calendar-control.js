import {icon} from './ui-icons.js';

const calendars=new Set();
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parse=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):null;
let sequence=0;

// Retain the form input, its constraints and its existing change handlers.
export function enhanceCalendars(root=document) {
  enhanceMonths(root);
  for(const input of [...(root.matches?.('input[type=date]')?[root]:[]),...root.querySelectorAll('input[type=date]')]) {
    if(input.dataset.calendarReady)continue;
    input.dataset.calendarReady='true';input.classList.add('calendar-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
    const wrap=document.createElement('div');wrap.className='ui-calendar';input.before(wrap);wrap.append(input);
    const trigger=document.createElement('button');trigger.type='button';trigger.className='calendar-trigger';
    trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    const popup=document.createElement('div');popup.className='calendar-popover';popup.id='calendar-'+(++sequence);popup.popover='auto';
    popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Choose date');trigger.setAttribute('aria-controls',popup.id);
    const label=input.getAttribute('aria-label')||[...input.labels||[]].map(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('input,button').forEach(child=>child.remove());return copy.textContent.trim();}).find(Boolean)||'Date';
    let month,focusDate;
    const allowed=value=>value===''?!input.required:(!input.min||value>=input.min)&&(!input.max||value<=input.max);
    const sync=()=>{
      const date=parse(input.value),text=date?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Choose date';
      if(trigger.dataset.value!==input.value){trigger.innerHTML=icon('calendar')+'<span></span>'+icon('chevron');trigger.querySelector('span').textContent=text;trigger.dataset.value=input.value;}
      trigger.setAttribute('aria-label',`${label}: ${text}`);trigger.disabled=input.disabled;
    };
    const close=()=>{if(popup.matches(':popover-open'))popup.hidePopover();trigger.focus();};
    const choose=value=>{if(!allowed(value))return;input.value=value;sync();close();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    const position=()=>{
      const rect=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect();
      popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';
      popup.style.top=Math.max(8,Math.min(rect.bottom+8,innerHeight-box.height-8))+'px';
    };
    const render=(focus=false)=>{
      const first=new Date(month.getFullYear(),month.getMonth(),1,12),start=new Date(first);start.setDate(1-first.getDay());
      const current=iso(new Date()),active=input.value;
      popup.innerHTML=`<div class="calendar-heading"><strong aria-live="polite">${month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</strong><div><button type="button" class="icon-button" data-month="-1" aria-label="Previous month">${icon('chevron','calendar-prev')}</button><button type="button" class="icon-button" data-month="1" aria-label="Next month">${icon('chevron')}</button></div></div><div class="calendar-weekdays" aria-hidden="true">${['S','M','T','W','T','F','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="Dates"></div><div class="calendar-shortcuts"><button type="button" data-quick="-1">Yesterday</button><button type="button" data-quick="0">Today</button><button type="button" data-quick="1">Tomorrow</button></div>${input.required?'':'<button type="button" class="calendar-clear" data-clear-date>Clear date</button>'}`;
      for(let i=0;i<42;i++){
        const d=new Date(start);d.setDate(start.getDate()+i);const value=iso(d),button=document.createElement('button');
        button.type='button';button.className='calendar-day';button.dataset.day=value;button.textContent=d.getDate();button.disabled=!allowed(value);
        button.setAttribute('aria-label',d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
        button.setAttribute('aria-pressed',String(value===active));button.tabIndex=value===iso(focusDate)?0:-1;
        button.classList.toggle('outside-month',d.getMonth()!==month.getMonth());if(value===current)button.setAttribute('aria-current','date');
        popup.querySelector('.calendar-days').append(button);
      }
      for(const button of popup.querySelectorAll('[data-quick]')){const d=new Date();d.setDate(d.getDate()+Number(button.dataset.quick));button.disabled=!allowed(iso(d));}
      if(focus)popup.querySelector(`[data-day="${iso(focusDate)}"]:not(:disabled)`)?.focus();
      if(popup.matches(':popover-open'))position();
    };
    trigger.addEventListener('click',()=>{
      if(popup.matches(':popover-open')){close();return;}
      focusDate=parse(input.value)||new Date();if(!allowed(iso(focusDate)))focusDate=parse(input.min)||parse(input.max)||focusDate;
      month=new Date(focusDate.getFullYear(),focusDate.getMonth(),1,12);render();popup.showPopover();position();popup.querySelector('[tabindex="0"]')?.focus();
    });
    popup.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(popup.matches(':popover-open'))));
    popup.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;e.preventDefault();
      if(b.dataset.day)choose(b.dataset.day);
      if(b.dataset.month){month.setMonth(month.getMonth()+Number(b.dataset.month));focusDate=new Date(month);render();popup.querySelector(`[data-month="${b.dataset.month}"]`)?.focus();}
      if(b.dataset.quick!==undefined){const d=new Date();d.setDate(d.getDate()+Number(b.dataset.quick));choose(iso(d));}
      if(b.hasAttribute('data-clear-date'))choose('');
    });
    popup.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
      const day=e.target.closest('[data-day]');if(!day)return;
      const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};const d=parse(day.dataset.day);
      if(e.key in delta)d.setDate(d.getDate()+delta[e.key]);
      else if(e.key==='Home')d.setDate(d.getDate()-d.getDay());
      else if(e.key==='End')d.setDate(d.getDate()+6-d.getDay());
      else if(['PageUp','PageDown'].includes(e.key)){const n=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+(e.key==='PageUp'?-1:1));d.setDate(Math.min(n,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}
      else return;
      e.preventDefault();if(!allowed(iso(d)))return;focusDate=d;month=new Date(d.getFullYear(),d.getMonth(),1,12);render(true);
    });
    popup.addEventListener('focusout',e=>{if(e.relatedTarget&&!wrap.contains(e.relatedTarget)&&popup.matches(':popover-open'))popup.hidePopover();});
    input.addEventListener('invalid',e=>{e.preventDefault();trigger.click();});
    input.addEventListener('change',sync);input.addEventListener('input',sync);input.form?.addEventListener('reset',()=>queueMicrotask(sync));
    wrap.append(trigger,popup);calendars.add({input,sync,popup,position});sync();
  }
}

// Month selection uses the same popover family as game dates, including in tickets.
function enhanceMonths(root) {
  for(const input of [...(root.matches?.('input[type=month]')?[root]:[]),...root.querySelectorAll('input[type=month]')]) {
    if(input.dataset.calendarReady)continue;
    input.dataset.calendarReady='true';input.classList.add('calendar-native');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
    const wrap=document.createElement('div');wrap.className='ui-calendar';input.before(wrap);wrap.append(input);
    const trigger=document.createElement('button');trigger.type='button';trigger.className='calendar-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    const popup=document.createElement('div');popup.className='calendar-popover month-popover';popup.id='calendar-'+(++sequence);popup.popover='auto';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Choose month');trigger.setAttribute('aria-controls',popup.id);
    const format=(year,month)=>year+'-'+String(month+1).padStart(2,'0');
    const allowed=value=>(!input.min||value>=input.min)&&(!input.max||value<=input.max);
    let year,focused;
    const sync=()=>{const date=parse(input.value+'-01'),label=date?date.toLocaleDateString('en-US',{month:'long',year:'numeric'}):'Choose month';if(trigger.dataset.value!==input.value){trigger.innerHTML=icon('calendar')+'<span></span>'+icon('chevron');trigger.querySelector('span').textContent=label;trigger.dataset.value=input.value;}trigger.disabled=input.disabled;trigger.setAttribute('aria-label',(input.getAttribute('aria-label')||'Month')+': '+label);};
    const position=()=>{const rect=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';popup.style.top=Math.max(8,Math.min(rect.bottom+8,innerHeight-box.height-8))+'px';};
    const choose=value=>{if(!allowed(value))return;input.value=value;sync();popup.hidePopover();trigger.focus();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
    const render=(focus=false)=>{
      popup.innerHTML=`<div class="calendar-heading"><strong aria-live="polite">${year}</strong><div><button type="button" class="icon-button" data-year="-1" aria-label="Previous year"${input.min&&year<=Number(input.min.slice(0,4))?' disabled':''}>${icon('chevron','calendar-prev')}</button><button type="button" class="icon-button" data-year="1" aria-label="Next year"${input.max&&year>=Number(input.max.slice(0,4))?' disabled':''}>${icon('chevron')}</button></div></div><div class="calendar-months" role="group" aria-label="Months in ${year}">${Array.from({length:12},(_,index)=>{const value=format(year,index),label=new Date(year,index,1).toLocaleDateString('en-US',{month:'short'});return `<button type="button" data-select-month="${value}" tabindex="${value===focused?0:-1}" aria-pressed="${value===input.value}"${allowed(value)?'':' disabled'}>${label}</button>`;}).join('')}</div><div class="calendar-shortcuts"><button type="button" data-month-today>This month</button></div>`;
      const current=iso(new Date()).slice(0,7);popup.querySelector('[data-month-today]').disabled=!allowed(current);
      if(focus)popup.querySelector(`[data-select-month="${focused}"]:not(:disabled)`)?.focus();if(popup.matches(':popover-open'))position();
    };
    trigger.addEventListener('click',()=>{if(popup.matches(':popover-open')){popup.hidePopover();return;}focused=input.value||iso(new Date()).slice(0,7);if(!allowed(focused))focused=input.min||input.max;year=Number(focused.slice(0,4));render();popup.showPopover();position();popup.querySelector('[tabindex="0"]')?.focus();});
    popup.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;event.preventDefault();if(button.dataset.selectMonth)choose(button.dataset.selectMonth);if(button.dataset.year){year+=Number(button.dataset.year);focused=format(year,0);render();popup.querySelector(`[data-year="${button.dataset.year}"]`)?.focus();}if(button.hasAttribute('data-month-today'))choose(iso(new Date()).slice(0,7));});
    popup.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();popup.hidePopover();trigger.focus();return;}
      const month=event.target.dataset.selectMonth;if(!month)return;const d=parse(month+'-01'),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-3,ArrowDown:3,PageUp:-12,PageDown:12};
      if(event.key in delta)d.setMonth(d.getMonth()+delta[event.key]);else if(event.key==='Home')d.setMonth(0);else if(event.key==='End')d.setMonth(11);else return;
      event.preventDefault();const value=iso(d).slice(0,7);if(!allowed(value))return;focused=value;year=d.getFullYear();render(true);
    });
    popup.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(popup.matches(':popover-open'))));
    popup.addEventListener('focusout',event=>{if(event.relatedTarget&&!wrap.contains(event.relatedTarget)&&popup.matches(':popover-open'))popup.hidePopover();});
    input.addEventListener('input',sync);input.addEventListener('change',sync);input.addEventListener('invalid',event=>{event.preventDefault();trigger.click();});
    input.form?.addEventListener('reset',()=>queueMicrotask(sync));wrap.append(trigger,popup);calendars.add({input,sync,popup,position});sync();
  }
}
export function syncCalendars(){for(const item of calendars){if(!item.input.isConnected){calendars.delete(item);continue;}item.sync();}}
window.addEventListener('resize',()=>{for(const c of calendars)if(c.popup.matches(':popover-open'))c.position();});
