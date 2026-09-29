import {comparisonIcon,bindComparison} from './bet-comparison.js?v=6';
import {bindReferenceHistory} from './bet-reference-history.js?v=3';
import {teamMark,leagueMark} from './sports-identity.js';
import {platformAsset} from './platform-catalog.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const movement='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 16 6-6 4 4 8-10m-6 0h6v6M4 5l3 3m7 8 7 5m-1-6 1 6-6-1"/></svg>';
const swap='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/></svg>';
const button=(action,label,extra='')=>`<button type="button" class="bet-expanded-icon" data-comparison-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${action==='movement'?movement:action==='swap'?swap:comparisonIcon(action)}</button>`;
function inlineBookMark(name){const asset=platformAsset(name);return asset?`<img src="${asset}" alt="${esc(name)}" width="34" height="34">`:'';}
function matchup(model){
  const sport=String(model.sport||'').toLowerCase(),match=/^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})$/i.exec(model.event||'');
  if(!match)return esc(model.event||'Event not entered');
  return `${teamMark({sport,team:match[1]})}<span>${esc(match[1])} ${esc(match[2])} ${esc(match[3])}</span>${teamMark({sport,team:match[3]})}`;
}
export function expandedBetCard(model){
  const books=(model.columns||[]).map(book=>({...book}));
  model={...model,columns:books};
  for(const book of books)book.mark=inlineBookMark(book.name)||book.mark;
  const fairMark=model.fairBook?inlineBookMark(model.fairBook):model.fairMark||'';
  const sport=String(model.sport||'').toLowerCase(),hasLeague=['nfl','mlb','nba','wnba','nhl','soccer'].includes(sport);
  return `<article class="bet-comparison-card bet-expanded-card" aria-label="${esc(model.market)} ${esc(model.selection)} comparison">
    <header class="bet-expanded-summary">
      <button type="button" data-inline-collapse class="bet-expanded-collapse" aria-label="Collapse bet details" aria-expanded="true">${comparisonIcon('close')}</button>
      <div class="bet-expanded-market"><h3>${esc(model.market)} <span class="bet-expanded-league">${hasLeague?leagueMark(sport):''}${esc(model.sport||'')}</span></h3><p><span class="bet-expanded-matchup">${matchup(model)}</span><span class="bet-expanded-time">${esc(model.time||'')}</span></p></div>
      <div class="bet-expanded-selection"><strong>${esc(model.selection)}</strong><small>Selection</small></div>
      <div class="bet-expanded-fair"><strong>${fairMark}<span>${esc(model.fairOdds??'—')}</span></strong><small>${esc(model.fairLabel||'Fair value')}</small></div>
      <div class="bet-expanded-probability"><strong>${esc(model.probability||'—')}</strong><small>${esc(model.probabilityLabel||'True Prob')}</small></div>
    </header>
    <div class="bet-expanded-toolbar"><div class="bet-expanded-tools" role="group" aria-label="Bet comparison controls">
      ${button('swap','Switch selection',model.canSwap?'':'disabled')}
      <div class="bet-expanded-view-switch" role="group" aria-label="Comparison view">${button('table','Sportsbook comparison','aria-pressed="true"')}${button('chart','Odds history','aria-pressed="false"')}${button('movement','Line movement','aria-pressed="false"')}</div>
      ${button('hide','Hide comparison','aria-pressed="false"')}${button('track',model.trackLabel||'Add to bet tracker',model.canTrack?'':'disabled')}${button('pin','Pin this bet','aria-pressed="false"')}${button('flag','Flag for review','aria-pressed="false"')}${button('refresh','Refresh saved prices')}
      ${Number.isFinite(model.rawOdds)||model.canEdit?`<details class="bet-expanded-more"><summary aria-label="More bet actions" title="More bet actions"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></summary><div>${Number.isFinite(model.rawOdds)?button('calculator','Stake calculator'):''}${model.canEdit?button('edit','Edit saved price'):''}</div></details>`:''}
    </div></div>
    <div class="bet-comparison-calculator" hidden></div><p class="bet-comparison-feedback" role="status" hidden></p>
    <div class="bet-comparison-data"><div class="bet-expanded-table-panel"><div class="bet-expanded-scroll" role="region" tabindex="0" aria-label="Sportsbook price comparison; scroll for more books"><table class="bet-expanded-table" style="--book-count:${Math.max(1,books.length)}"><thead><tr><th scope="col"><span class="sr-only">Price type</span></th>${books.map(book=>`<th scope="col"><span class="bet-expanded-brand" title="${esc(book.name)}">${book.mark||`<span>${esc(book.name)}</span>`}${book.probability?`<small title="No-vig probability from this book’s two recorded sides">${esc(book.probability)}</small>`:''}</span><span class="sr-only">${esc(book.name)}</span></th>`).join('')}</tr></thead><tbody><tr><th scope="row">Line</th>${books.map(book=>`<td><span>${esc(book.line??'—')}</span>${book.difference?`<em>${esc(book.difference)}</em>`:''}</td>`).join('')}</tr><tr><th scope="row">Odds</th>${books.map(book=>`<td><button type="button" data-book-history="${esc(book.name)}" title="${esc(book.name)} recorded odds history">${esc(book.odds??'—')}</button></td>`).join('')}</tr></tbody></table></div></div><div class="bet-expanded-history" hidden></div></div>
    <footer class="bet-expanded-footer"><span>${esc(model.context?.startsWith('Example')?'Example prices':model.context?.startsWith('Entered')?'Entered prices':'Saved prices')}</span><span data-comparison-saved></span>${model.note?`<details><summary>Calculation details</summary><p>${esc(model.note)}</p></details>`:''}</footer>
  </article>`;
}
export function bindExpandedComparison(root,model,handlers={}){
  const card=root.querySelector('.bet-expanded-card');
  const wrap=root.closest('.ev-table-wrap');
  if(wrap){const resize=()=>card.style.setProperty('--bet-panel-width',Math.max(240,wrap.clientWidth-16)+'px');resize();const observer=new ResizeObserver(resize);observer.observe(wrap);const removal=new MutationObserver(()=>{if(!card.isConnected){observer.disconnect();removal.disconnect();}});const mount=root.closest('.bet-inline-mount');if(mount?.parentElement)removal.observe(mount.parentElement,{childList:true});}
  let view='table',historyCleanup;
  const setView=(next,book)=>{
    view=next;
    const data=card.querySelector('.bet-comparison-data'),history=card.querySelector('.bet-expanded-history');
    data.hidden=false;card.querySelector('.bet-expanded-table-panel').hidden=next!=='table';history.hidden=next==='table';
    card.querySelector('[data-comparison-action="hide"]').setAttribute('aria-pressed','false');
    card.querySelector('[data-comparison-action="hide"]').setAttribute('aria-label','Hide comparison');
    for(const name of ['table','chart','movement'])card.querySelector(`[data-comparison-action="${name}"]`).setAttribute('aria-pressed',String(name===next));
    card.dataset.comparisonView=next;
    historyCleanup?.();historyCleanup=null;
    if(next!=='table')historyCleanup=bindReferenceHistory(history,model,{metric:next==='movement'?'line':'odds',book});
  };
  card.addEventListener('click',event=>{
    const history=event.target.closest('[data-book-history]'),action=event.target.closest('[data-comparison-action]')?.dataset.comparisonAction;
    if(history||['table','chart','movement','hide'].includes(action)){
      event.stopImmediatePropagation();
      if(action==='hide'){const data=card.querySelector('.bet-comparison-data');data.hidden=!data.hidden;const control=card.querySelector('[data-comparison-action="hide"]');control.setAttribute('aria-pressed',String(data.hidden));control.setAttribute('aria-label',data.hidden?'Show comparison':'Hide comparison');}
      else {setView(history?'chart':action,history?.dataset.bookHistory);if(history)card.querySelector('[data-comparison-action="chart"]')?.focus({preventScroll:true});}
    }
  },true);
  bindComparison(root,{...model,inlineHistory:false},{...handlers,onRefresh:()=>{handlers.onRefresh?.();const next=root.isConnected?root:document.querySelector('#expanded-bet-comparison');if(view!=='table')next?.querySelector(`[data-comparison-action="${view}"]`)?.click();}});
  root.querySelector('[data-inline-collapse]')?.addEventListener('click',()=>{historyCleanup?.();handlers.onCollapse?.();});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();historyCleanup?.();handlers.onCollapse?.();}});
}
