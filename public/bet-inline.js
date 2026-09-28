import {comparisonIcon,bindComparison} from './bet-comparison.js?v=5';
import {platformAsset} from './platform-catalog.js';
import {leagueMark,teamMark} from './sports-identity.js';
import {expandedBetCard,bindExpandedComparison} from './bet-expanded.js?v=2';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,extra='',className='')=>`<button type="button" class="bet-inline-icon ${className}" data-comparison-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${comparisonIcon(action)}</button>`;
export function inlineBookMark(name){const asset=platformAsset(name);return asset?`<img src="${asset}" alt="${esc(name)}" width="34" height="34">`:'';}
export function inlineBetCard(model){
  if(!model.standalone)return expandedBetCard(model);
  const books=(model.columns||[]).map(book=>({...book,mark:inlineBookMark(book.name)||book.mark}));
  const fairMark=model.fairMark!==undefined?model.fairMark:inlineBookMark(model.book)||books[0]?.mark||'';
  const sport=String(model.sport||'').toLowerCase(),hasLeague=['nfl','mlb','nba','wnba','nhl','soccer'].includes(sport);
  const eventCodes=hasLeague&&/^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})$/.exec(String(model.event||''));
  const event=eventCodes?`${teamMark({sport,team:eventCodes[1]})}<span>${esc(model.event)}</span>${teamMark({sport,team:eventCodes[3]})}`:esc(model.event||'Event not entered');
  return `<article class="bet-comparison-card bet-inline-card${model.standalone?' ev-selection-card ev-reference-card':''}"${model.standalone?` data-wager-id="${esc(model.id)}" data-open-quote="${esc(model.id)}"`:''} aria-label="${esc(model.market)} ${esc(model.selection)} comparison">
    <header class="bet-inline-summary">
      ${button('pin','Pin this bet','aria-pressed="false"')}
      <div class="bet-inline-market"><h3>${esc(model.market)}${model.sport?`<small class="bet-inline-league">${hasLeague?leagueMark(sport):''}<span>${esc(model.sport)}</span></small>`:''}</h3><p class="bet-inline-event">${event}</p>${model.time?`<small>${esc(model.time)}</small>`:''}</div>
      <div class="bet-inline-selection"><button type="button" class="bet-open-detail" data-detail="${esc(model.id)}" aria-label="Open ${esc(model.selection)} bet details"><strong>${model.teamMark||''}<span>${esc(model.selection)}</span></strong></button><small>Selection</small></div>
      <div class="bet-inline-fair"><strong>${fairMark}<span>${esc(model.fairOdds??'—')}</span></strong><small>${esc(model.fairLabel||'Fair value')}</small></div>
      <div class="bet-inline-probability"><strong>${esc(model.probability||'—')}</strong><small>${esc(model.probabilityLabel||'Est. probability')}</small></div>
    </header>
    ${model.metrics?.length?`<dl class="bet-inline-metrics">${model.metrics.map(item=>`<div><dt>${esc(item.label)}</dt><dd>${esc(item.value??'—')}</dd></div>`).join('')}</dl>`:''}
    <div class="bet-comparison-calculator" hidden></div><p class="bet-comparison-feedback" role="status" hidden></p>
    <div class="bet-comparison-data"></div>
    <span class="sr-only" data-comparison-saved></span>
  </article>`;
}
export function bindInlineComparison(root,model,handlers={}){
  if(!model.standalone)return bindExpandedComparison(root,model,handlers);
  return bindComparison(root,{...model,inlineHistory:false},handlers);
}
