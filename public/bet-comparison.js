import { accountStorage as localStorage, accountReady } from './account-sync.js';
await accountReady;
import { bindHistory } from './bet-history.js?v=2';
import { decimal as americanDecimal, boostDecimal, decimalToAmerican } from './betting-math.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={calculator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2"/>',swap:'<path d="M8 20V4m-4 4 4-4 4 4m4-4v16m-4-4 4 4 4-4"/>',table:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',chart:'<path d="M4 3v17h17M7 14l4-5 4 3 5-6"/>',hide:'<path d="m3 3 18 18M10 5a11 11 0 0 1 11 7 13 13 0 0 1-3 4M6 6a15 15 0 0 0-3 6s3 7 9 7a11 11 0 0 0 4-1M10 10a3 3 0 0 0 4 4"/>',track:'<path d="M20 10a8 8 0 1 0-8 10M8 11l3 3 8-9m-1 9v7m-3-3h6"/>',pin:'<path d="M9 3h6l-1 6 4 5v2H6v-2l4-5-1-6Zm3 13v6"/>',flag:'<path d="M5 22V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',refresh:'<path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/>',edit:'<path d="m4 16 12-12 4 4L8 20H4v-4Zm9-9 4 4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
export const comparisonIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.table}</svg>`;
const action=(name,label,extra='')=>`<button type="button" class="bet-comparison-action" data-comparison-action="${name}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${comparisonIcon(name)}</button>`;
const mark=column=>column.mark || `<span class="bet-comparison-fallback">${esc(String(column.name||'?').slice(0,2))}</span>`;
export function betComparisonCard(model) {
  const columns=model.columns || [], hasQuote=Number.isFinite(model.rawOdds), price=model.fairOdds ?? '—';
  const rows=model.rows?.length ? model.rows : [{selection:'Line',prices:columns.map(column=>({value:column.line??'—',difference:column.difference}))},{selection:'Odds',prices:columns.map(column=>({value:column.odds??'—'}))}];
  return `<article class="bet-comparison-card ${hasQuote?'has-offer':''}" aria-label="${esc(model.market)} ${esc(model.selection)} comparison">
    <div class="bet-comparison-summary"><span class="bet-comparison-ring" aria-hidden="true"></span>
      <div class="bet-comparison-market"><h3>${esc(model.market)} <small>${esc(model.sport||'')}</small></h3><p>${esc(model.event||'Event not entered')} <span>${esc(model.time||'')}</span></p></div>
      <div class="bet-comparison-selection"><strong>${esc(model.selection)}</strong><span>Selection</span></div>
      ${hasQuote?`<div class="bet-comparison-offer"><strong>${model.fairMark||''}<b data-offer-price>${esc(model.offerOdds)}</b><span class="bet-comparison-price-arrow" aria-hidden="true">↗</span></strong><span>${esc(model.book||'Sportsbook')}</span></div>`:''}
      <div class="bet-comparison-value"><strong>${hasQuote?'':model.fairMark||''}${esc(price)}${model.vig?` <span>· ${esc(model.vig)}</span>`:''}</strong><span>${esc(model.fairLabel||(hasQuote?'FV · Vig':'Fair value'))}</span></div>
      ${hasQuote?`<div class="bet-comparison-stake"><strong>${esc(model.recommended||'—')}</strong><span>Rec Bet</span></div>`:''}
      <div class="bet-comparison-prob ${hasQuote&&parseFloat(model.ev)<0?'is-negative':''}"><strong data-offer-ev>${esc(hasQuote?model.ev||'—':model.probability||'—')}</strong><span>${esc(hasQuote?'EV%':model.probabilityLabel||'True prob')} <span title="${esc(hasQuote?'Estimated expected value from saved prices':'Estimated probability')}">ⓘ</span></span></div></div>
    <div class="bet-comparison-toolbar"><div class="bet-comparison-boost">${hasQuote?`${model.fairMark||''}<label><span class="sr-only">Profit boost percentage</span><input data-profit-boost type="number" min="0" max="1000" step="1" placeholder="Boost %" aria-label="Profit boost percentage" title="Preview a profit boost on the selected price"></label>`:`<span>${esc(model.context||'Saved price comparison')}</span>`}</div><div class="bet-comparison-tools">${action('calculator','Stake calculator',hasQuote?'':'disabled')}${action('swap','Switch selection',model.canSwap?'':'disabled')}<div class="bet-comparison-view-switch">${action('table','Price comparison table','aria-pressed="true"')}${action('chart','Line history','aria-pressed="false"')}</div>${action('hide','Hide comparison prices','aria-pressed="false"')}${action('track',model.trackLabel||'Add to bet tracker',model.canTrack?'':'disabled')}${action('pin','Pin this bet','aria-pressed="false"')}${action('flag','Flag for review','aria-pressed="false"')}${action('refresh','Refresh saved prices')}${model.canEdit?action('edit','Edit saved price'):''}</div></div>
    <div class="bet-comparison-calculator" hidden></div><p class="bet-comparison-feedback" role="status" hidden></p>
    <div class="bet-comparison-data"><div class="bet-comparison-scroll" role="region" tabindex="0" aria-label="Sportsbook prices; scroll horizontally for more books"><table class="bet-comparison-table" style="--comparison-columns:${columns.length};--comparison-summary-width:${model.rows ? 315 : 145}px"><thead><tr><th scope="col">${model.rows?'Selection':'Metric'}</th>${model.rows?'<th scope="col">Average</th><th scope="col">Best</th>':''}${columns.map(column=>`<th scope="col" class="${column.exchange?'is-exchange':''}"><span class="bet-comparison-book" title="${esc(column.name)}${column.source?` · ${column.source}`:''}">${mark(column)}${column.source?`<span class="source-tag" data-source="${esc(column.source)}" title="Feed source">${esc(column.source)}</span>`:''}<span class="sr-only">${esc(column.name)}</span><button type="button" data-book-history="${esc(column.name)}" aria-label="${esc(column.name)} line history" title="${esc(column.name)} line history">${comparisonIcon('calculator')}</button></span></th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${esc(row.selection)}</th>${model.rows?`<td>${esc(row.average??'—')}</td><td class="bet-comparison-best">${row.bestMark||''}<strong>${esc(row.best??'—')}</strong></td>`:''}${columns.map((column,index)=>{const value=row.prices?.[index]||{};return `<td class="${column.exchange?'is-exchange':''} ${value.best?'is-best':''}"><strong>${esc(value.value??'—')}</strong>${value.difference?`<em>${esc(value.difference)}</em>`:''}${value.liquidity?`<small>${esc(value.liquidity)}</small>`:''}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></div>
    ${model.inlineHistory?'<div class="bet-comparison-history" hidden></div>':''}
    <div class="bet-comparison-footer"><span>${esc(model.context||'Saved prices')}</span><span data-comparison-saved></span>${model.note?`<details><summary>Calculation details</summary><p>${esc(model.note)}</p></details>`:''}</div></article>`;
}
const annotationsKey='sportslab-bet-annotations-v1';
export function comparisonAnnotations(id) { try{return JSON.parse(localStorage.getItem(annotationsKey)||'{}')[id] || {};}catch{return {};}}
export function bindComparison(root, model, handlers={}) {
  const card=root.querySelector('.bet-comparison-card');if(!card)return;
  let boost=0,calculatorOpen=false,view='table',dataHidden=false,historyReady=false,historyCleanup=null;
  const data=card.querySelector('.bet-comparison-data');
  let historyPanel=card.querySelector('.bet-comparison-history');
  if(model.inlineHistory&&!historyPanel){historyPanel=document.createElement('div');historyPanel.className='bet-comparison-history';historyPanel.hidden=true;data.insertAdjacentElement('afterend',historyPanel);}
  const syncView=()=>{
    data.hidden=dataHidden||view==='chart';
    if(historyPanel)historyPanel.hidden=dataHidden||view!=='chart';
    for(const name of ['table','chart'])for(const button of card.querySelectorAll(`[data-comparison-action="${name}"]`))button.setAttribute('aria-pressed',String(view===name));
    for(const button of card.querySelectorAll('[data-comparison-action="hide"]')){
      const label=`${dataHidden?'Show':'Hide'} ${view==='chart'?'recorded history':'comparison prices'}`;
      button.setAttribute('aria-pressed',String(dataHidden));button.setAttribute('aria-label',label);button.setAttribute('title',label);
    }
  };
  const message=text=>{const area=card.querySelector('.bet-comparison-feedback');area.textContent=text;area.hidden=!text;};
  const updateAnnotations=()=>{const saved=comparisonAnnotations(model.id);for(const type of ['pin','flag'])for(const button of card.querySelectorAll(`[data-comparison-action="${type}"]`))button.setAttribute('aria-pressed',String(Boolean(saved[type])));card.querySelector('[data-comparison-saved]').textContent=[saved.pin?'Pinned':'',saved.flag?'Flagged for review':''].filter(Boolean).join(' · ');};
  const boostedDecimal=()=>boostDecimal(americanDecimal(model.rawOdds),boost);
  const updateCalculator=()=>{const stake=Number(card.querySelector('[data-calculator-stake]')?.value)||0,decimal=boostedDecimal();const money=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD'});const total=card.querySelector('[data-calculator-return]'),profit=card.querySelector('[data-calculator-profit]');if(total)total.textContent=money(stake*decimal);if(profit)profit.textContent=money(stake*(decimal-1));const note=card.querySelector('.bet-comparison-calculator small');if(note)note.textContent=boost?'Calculated at the boosted preview. No bet is placed.':'Calculated at the saved price. No bet is placed.';};
  const renderCalculator=()=>{const panel=card.querySelector('.bet-comparison-calculator');panel.hidden=!calculatorOpen;if(!calculatorOpen)return;panel.innerHTML=`<label>Stake (USD)<input data-calculator-stake type="number" min="0" step="0.01" value="${(Math.round((Number(model.rawStake)||100)*100)/100).toFixed(2)}"></label><div><span>Potential return</span><strong data-calculator-return></strong></div><div><span>Potential profit</span><strong data-calculator-profit></strong></div><small>Calculated at ${boost?'the boosted preview':'the saved price'}. No bet is placed.</small>`;updateCalculator();};
  const openHistory=(book,side,forceDialog=false)=>{
    const historyModel=side&&model.historyBySide?.[side]?{...model,history:model.historyBySide[side],selection:model.rows?.find(row=>row.side===side)?.selection||model.selection}:model;
    const options={metric:model.historyMetric,selected:book?[book]:undefined};
    if(model.inlineHistory&&!forceDialog){
      if(!historyReady||book||side){historyCleanup?.();historyCleanup=bindHistory(historyPanel,historyModel,{...options,inline:true,onExpand:()=>openHistory(book,side,true)});historyReady=true;}
      view='chart';dataHidden=false;syncView();return;
    }
    const dialog=document.createElement('dialog');dialog.className='bet-line-history-dialog';dialog.setAttribute('aria-label','Recorded price history');
    dialog.innerHTML=`<button type="button" class="bet-history-fullscreen" aria-pressed="false">Expand chart</button><button class="bet-history-close" type="button" aria-label="Close price history">${comparisonIcon('close')}</button><div class="bet-history-root"></div>`;
    document.body.append(dialog);const disposeHistory=bindHistory(dialog.querySelector('.bet-history-root'),historyModel,options);
    for(const button of card.querySelectorAll('[data-comparison-action="chart"]'))button.setAttribute('aria-pressed','true');
    for(const button of card.querySelectorAll('[data-comparison-action="table"]'))button.setAttribute('aria-pressed','false');
    dialog.querySelector('.bet-history-fullscreen').addEventListener('click',event=>{const expanded=dialog.classList.toggle('is-fullscreen');event.currentTarget.setAttribute('aria-pressed',String(expanded));event.currentTarget.textContent=expanded?'Exit fullscreen':'Expand chart';});
    dialog.querySelector('.bet-history-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('pointerdown',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
    dialog.addEventListener('close',()=>{disposeHistory?.();dialog.remove();syncView();card.querySelector('[data-comparison-action="chart"]')?.focus();},{once:true});
    dialog.showModal();dialog.querySelector('.bet-history-close').focus();
  };
  card.addEventListener('input',event=>{if(event.target.matches('[data-calculator-stake]'))updateCalculator();if(event.target.matches('[data-profit-boost]')){boost=Math.max(0,Math.min(1000,Number(event.target.value)||0));const d=boostedDecimal(),american=decimalToAmerican(d),price=american>0?'+'+american:String(american);card.querySelector('[data-offer-price]').textContent=price;const ev=Number.isFinite(model.rawFair)?((model.rawFair*d-1)*100).toFixed(2)+'%':model.ev;card.querySelector('[data-offer-ev]').textContent=ev||'—';card.querySelector('.bet-comparison-prob').classList.toggle('is-negative',parseFloat(ev)<0);message(boost?`${boost}% profit boost preview. Comparison prices and recommended stake retain the saved price.`:'');updateCalculator();}});
  card.addEventListener('click',event=>{
    const history=event.target.closest('[data-book-history]');if(history)return openHistory(history.dataset.bookHistory,history.dataset.historySide);
    const button=event.target.closest('[data-comparison-action]');if(!button)return;
    const action=button.dataset.comparisonAction;
    if(action==='chart')return openHistory();
    if(action==='calculator'){calculatorOpen=!calculatorOpen;renderCalculator();button.setAttribute('aria-pressed',String(calculatorOpen));button.closest('details')?.removeAttribute('open');if(calculatorOpen)card.querySelector('[data-calculator-stake]')?.focus({preventScroll:true});return;}
    if(action==='table'){view='table';dataHidden=false;syncView();return;}
    if(action==='hide'){dataHidden=!dataHidden;syncView();return;}
    if(action==='pin'||action==='flag'){try{const saved=JSON.parse(localStorage.getItem(annotationsKey)||'{}');saved[model.id]={...saved[model.id],[action]:!saved[model.id]?.[action],label:model.selection};localStorage.setItem(annotationsKey,JSON.stringify(saved));updateAnnotations();handlers.onAnnotation?.();}catch{message('Browser storage is unavailable. This marker could not be saved.');}return;}
    if(action==='refresh'){handlers.onRefresh?.();message('Comparison refreshed from saved prices.');return;}
    if(action==='swap')handlers.onSwap?.();
    if(action==='track')handlers.onTrack?.();
    if(action==='edit')handlers.onEdit?.();
  });updateAnnotations();syncView();
}
