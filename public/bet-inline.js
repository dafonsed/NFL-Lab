import {comparisonIcon,bindComparison} from './bet-comparison.js?v=5';
import {platformAsset} from './platform-catalog.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,extra='')=>`<button type="button" class="bet-inline-icon" data-comparison-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${comparisonIcon(action)}</button>`;
export function inlineBookMark(name){const asset=platformAsset(name);return asset?`<img src="${asset}" alt="${esc(name)}" width="34" height="34">`:'';}
export function inlineBetCard(model){
  const books=model.columns||[], rows=model.rows||[{selection:'Line',prices:books.map(book=>({value:book.line}))},{selection:'Odds',prices:books.map(book=>({value:book.odds}))}];
  for(const book of books)book.mark=inlineBookMark(book.name)||book.mark;
  model.fairMark=inlineBookMark(model.book)||model.fairMark||books[0]?.mark||'';
  const price=(row,index)=>{const item=rows[row]?.prices?.[index];return `<div class="bet-inline-price"><button type="button" data-book-history="${esc(books[index].name)}" data-history-side="${esc(rows[row]?.side||'')}" title="${esc(books[index].name)} recorded price history"><strong>${esc(item?.value??'—')}</strong><span aria-hidden="true">↗</span></button><small>${esc(item?.liquidity||'\u00a0')}</small></div>`;};
  return `<article class="bet-comparison-card bet-inline-card" aria-label="${esc(model.market)} ${esc(model.selection)} comparison">
    <header class="bet-inline-summary">
      ${button('pin','Pin this bet','aria-pressed="false"')}
      <div class="bet-inline-market"><h3>${esc(model.market)}</h3><p>${esc(model.event||'Event not entered')}</p><small>${esc(model.time||'')} ${model.sport?'· '+esc(model.sport):''}</small></div>
      <div class="bet-inline-selection"><strong>${model.teamMark||''}${esc(model.selection)}</strong><small>Selection</small></div>
      <div class="bet-inline-fair"><strong>${model.fairMark||''}<span>${esc(model.fairOdds??'—')}</span></strong><small>${esc(model.fairLabel||'Fair value')}</small></div>
      <div class="bet-inline-probability"><strong>${esc(model.probability||'—')}</strong><small>${esc(model.probabilityLabel||'Est. probability')}</small></div>
      <div class="bet-inline-toggles">${button('hide','Hide comparison prices','aria-pressed="false"')}<button type="button" data-inline-collapse class="bet-inline-collapse" aria-label="Collapse bet details" aria-expanded="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 15 6-6 6 6"/></svg></button></div>
    </header>
    <div class="bet-inline-toolbar"><span>${esc(model.context?.startsWith('Example')?'Example sportsbook prices':model.context?.startsWith('Entered')?'Entered platform lines':'Saved sportsbook prices')} <b>${books.length} ${books.length===1?'book':'books'}</b></span><div>${button('chart','Line history')}${button('refresh','Refresh saved prices')}<details class="bet-inline-more"><summary aria-label="More bet actions" title="More bet actions">⋯</summary><div>${button('calculator','Stake calculator',Number.isFinite(model.rawOdds)?'':'disabled')}${button('swap','Switch selection',model.canSwap?'':'disabled')}${button('table','Show comparison prices')}${button('track',model.trackLabel||'Add to bet tracker',model.canTrack?'':'disabled')}${button('flag','Flag for review','aria-pressed="false"')}${model.canEdit?button('edit','Edit saved price'):''}</div></details></div></div>
    <div class="bet-comparison-calculator" hidden></div><p class="bet-comparison-feedback" role="status" hidden></p>
    <div class="bet-comparison-data"><div class="bet-inline-scroll" role="region" tabindex="0" aria-label="Sportsbook price comparison; scroll for more books"><div class="bet-inline-prices" style="--book-count:${Math.max(1,books.length)}"><div class="bet-inline-row-labels"><span>${model.rows?'Book / no-vig':'Platform'}</span><span>${esc(rows[0]?.selection||'Selection')}</span><span>${esc(rows[1]?.selection||'Opposing selection')}</span></div>${books.map((book,index)=>`<section class="bet-inline-book" aria-label="${esc(book.name)} prices" title="${esc(book.name)}"><div class="bet-inline-brand">${book.mark||'<span class="bet-inline-unavailable">'+esc(book.name)+'</span>'}<span>${esc(book.name)}</span>${model.rows?`<small title="No-vig probability from this book’s two recorded sides">${esc(book.probability||'—')}</small>`:''}</div>${price(0,index)}${price(1,index)}</section>`).join('')}</div></div></div>
    <footer class="bet-inline-footer"><span data-comparison-saved></span>${model.note?`<details><summary>Calculation details</summary><p>${esc(model.note)}</p></details>`:''}</footer>
  </article>`;
}
export function bindInlineComparison(root,model,handlers={}){
  bindComparison(root,model,handlers);
  root.querySelector('[data-inline-collapse]')?.addEventListener('click',()=>handlers.onCollapse?.());
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){event.preventDefault();handlers.onCollapse?.();}});
}
