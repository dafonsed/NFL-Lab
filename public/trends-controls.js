import {icon} from './ui-icons.js';

// Keep the existing selects and their data handlers as the source of truth.
const enhanced=new WeakSet();
const controlSync=new WeakMap();
const selectors='#td-week,#td-league,#td-game,#td-sort,#td-venue';
const labels={'td-week':'NFL week','td-league':'League','td-game':'Matchup','td-sort':'Sort players','td-venue':'Game venue'};
const symbols={'td-week':'calendar','td-league':'soccer','td-game':'calendar','td-sort':'settings','td-venue':'filter'};
const captions={'ev-reference-date':'Starts','ev-reference-max-odds':'Max Odds'};
let active;
let sequence=0;

// Programmatic value changes do not emit change or a DOM mutation.
export function syncTrendControl(select) { controlSync.get(select)?.(); }
if(typeof document!=='undefined') {
  document.body.classList.add('tool-dropdowns');
  if(!document.querySelector('link[data-tool-dropdowns]')) {
    const style=document.createElement('link');style.rel='stylesheet';style.href='/tool-dropdowns.css?v=1';style.dataset.toolDropdowns='true';document.head.append(style);
  }
}

export function enhanceTrendControls(root=document,selector=selectors) {
  const selects=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
  for(const select of selects) {
    if(enhanced.has(select)||select.multiple||select.size>1)continue;
    enhanced.add(select);
    if(!select.id)select.id='ui-select-'+(++sequence);
    const label=labels[select.id]||select.getAttribute('aria-label')||[...select.labels||[]].map(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('select,input,button,small,.field-help,.field-hint').forEach(child=>child.remove());return copy.textContent.trim();}).find(Boolean)||'Select option';
    if(select.parentElement.tagName==='LABEL')select.parentElement.classList.add('choice-field');
    const wrap=document.createElement('div');wrap.className='td-choice ui-choice';wrap.dataset.control=select.id;
    if(select.classList.contains('filter-desktop-control')&&!['sort','td-sort'].includes(select.id))wrap.classList.add('filter-desktop-control');
    select.before(wrap);wrap.append(select);select.dataset.choiceNative='true';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='td-choice-trigger';
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const menu=document.createElement('div');menu.className='td-choice-menu';menu.id=select.id+'-choices';menu.hidden=true;
    menu.popover='manual';trigger.setAttribute('aria-controls',menu.id);
    const sync=()=>{
      wrap.hidden=select.hidden;
      if(active?.wrap===wrap&&(select.disabled||select.hidden))active.close();
      const value=select.selectedOptions[0]?.textContent||'Select';
      trigger.innerHTML=(symbols[select.id]?icon(symbols[select.id]):'')+`<span class="choice-trigger-copy"><span class="choice-trigger-label"></span><strong></strong></span>`+icon('chevron');
      trigger.querySelector('.choice-trigger-label').textContent=captions[select.id]||label.replace(/^Filter by /,'');
      trigger.querySelector('strong').textContent=value;
      // Compact filter chips show only the label while a select is on an "all" default.
      trigger.dataset.empty=String(['','all','0'].includes(select.value));
      trigger.setAttribute('aria-label',label+': '+value);trigger.disabled=select.disabled;
    };
    const close=(focus=false)=>{if(menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(active?.wrap===wrap)active=null;if(focus&&trigger.isConnected)trigger.focus();};
    const open=()=>{
      if(select.disabled||select.hidden)return;
      active?.close();menu.replaceChildren();
      const heading=document.createElement('div');heading.className='choice-heading';heading.textContent=label;menu.append(heading);
      let search;
      if(select.options.length>7){
        const field=document.createElement('label');field.className='choice-search';field.innerHTML=icon('search');
        search=document.createElement('input');search.type='search';search.placeholder='Search…';search.setAttribute('aria-label','Search '+label.toLowerCase());field.append(search);menu.append(field);
      }
      const list=document.createElement('div');list.className='choice-options';list.setAttribute('role','listbox');list.setAttribute('aria-label',label);menu.append(list);
      for(const option of select.options){
        if(option.hidden||option.parentElement.hidden)continue;
        const item=document.createElement('button');item.type='button';item.className='td-choice-option';item.tabIndex=-1;
        item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled||option.parentElement.matches('optgroup:disabled');
        const text=document.createElement('span');text.className='choice-option-copy';text.textContent=option.textContent;item.append(text);item.insertAdjacentHTML('beforeend',icon('check'));
        if(option.dataset.description){const detail=document.createElement('small');detail.textContent=option.dataset.description;text.append(detail);}
        item.addEventListener('click',()=>{select.value=option.value;close(true);sync();select.dispatchEvent(new Event('change',{bubbles:true}));});
        list.append(item);
      }
      const empty=document.createElement('div');empty.className='choice-empty';empty.textContent='No matches';empty.hidden=true;menu.append(empty);
      search?.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();for(const item of list.children)item.hidden=!item.textContent.toLowerCase().includes(q);empty.hidden=[...list.children].some(item=>!item.hidden);});
      menu.hidden=false;trigger.setAttribute('aria-expanded','true');active={wrap,close};
      menu.showPopover();
      // A list row can host its menu: with --choice-anchor:row in CSS the menu opens flush under the whole row, at its width.
      const row=getComputedStyle(wrap).getPropertyValue('--choice-anchor').trim()==='row'?wrap.parentElement:null;
      if(active?.wrap===wrap)active.row=row;
      const bounds=(row||trigger).getBoundingClientRect(),below=innerHeight-bounds.bottom-12,above=bounds.top-12;
      const opensAbove=below<180&&above>below;
      menu.style.setProperty('max-height',Math.max(100,Math.min(520,opensAbove?above:below))+'px','important');
      menu.style.setProperty('width',Math.min(row?bounds.width:Math.max(bounds.width,300),420,innerWidth-24)+'px','important');menu.style.setProperty('min-width','0','important');
      const box=menu.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(bounds.left,innerWidth-box.width-12))+'px';menu.style.top=(opensAbove?Math.max(12,bounds.top-box.height-6):bounds.bottom+6)+'px';
      const selected=menu.querySelector('[aria-selected=true]:not(:disabled)');
      (search||selected||menu.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
      if(selected&&!search)list.scrollTop=Math.max(0,selected.offsetTop-list.offsetTop-list.clientHeight/2);
    };
    trigger.addEventListener('click',()=>menu.hidden?open():close());
    // A row that hosts its menu (--choice-anchor:row) is clickable anywhere, not only on the value.
    // Pressing the row must not move focus to the page first: that would close an open menu, and the click would reopen it.
    wrap.parentElement?.addEventListener('mousedown',e=>{
      if(getComputedStyle(wrap).getPropertyValue('--choice-anchor').trim()!=='row')return;
      if(menu.contains(e.target)||e.target.closest('input,textarea,select,a'))return;
      e.preventDefault();
    });
    wrap.parentElement?.addEventListener('click',e=>{
      if(getComputedStyle(wrap).getPropertyValue('--choice-anchor').trim()!=='row')return;
      if(trigger.contains(e.target)||menu.contains(e.target)||e.target===select||e.target.closest('input,textarea,a'))return;
      e.preventDefault();menu.hidden?open():close();
    });
    trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}});
    menu.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
      if(e.key==='Tab'){close(true);return;}
      if(e.target.matches('input')&&!['ArrowDown','ArrowUp'].includes(e.key))return;
      const items=[...menu.querySelectorAll('button:not(:disabled):not([hidden])')],index=items.indexOf(document.activeElement);
      let next=e.key==='ArrowDown'?(index+1)%items.length:e.key==='ArrowUp'?(index<0?items.length-1:(index-1+items.length)%items.length):e.key==='Home'?0:e.key==='End'?items.length-1:-1;
      if(next<0&&e.key.length===1){const ordered=[...items.slice(index+1),...items.slice(0,index+1)];next=items.indexOf(ordered.find(item=>item.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase())));}
      if(next>=0){e.preventDefault();items[next]?.focus();}
    });
    wrap.append(trigger,menu);controlSync.set(select,sync);select.addEventListener('change',sync);
    select.addEventListener('input',sync);
    select.addEventListener('invalid',e=>{e.preventDefault();trigger.focus();open();});
    select.form?.addEventListener('reset',()=>queueMicrotask(sync));
    new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','hidden']});sync();
  }
}

if(typeof document!=='undefined') {
  document.addEventListener('click',e=>{if(active&&!(active.row||active.wrap).contains(e.target))active.close();});
  document.addEventListener('focusin',e=>{if(active&&!(active.row||active.wrap).contains(e.target))active.close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();active.close(true);}});
  window.addEventListener('resize',()=>active?.close());
  document.addEventListener('scroll',e=>{if(active&&!active.wrap.contains(e.target))active.close();},true);

  // Include selectors in every tool and any controls added by filters or dialogs.
  const enhanceAll=root=>enhanceTrendControls(root,'select:not([multiple])');
  queueMicrotask(()=>enhanceAll(document));
  new MutationObserver(records=>{
    if(active&&!active.wrap.isConnected)active.close();
    for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)enhanceAll(node);
  }).observe(document.body,{childList:true,subtree:true});
}
