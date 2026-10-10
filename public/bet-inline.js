import {comparisonIcon,bindComparison} from './bet-comparison.js?v=7-source';
import {platformAsset} from './platform-catalog.js';
import {leagueMark,teamMark} from './sports-identity.js';
import {expandedBetCard,bindExpandedComparison} from './bet-expanded.js?v=3-source';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,label,extra='',className='')=>`<button type="button" class="bet-inline-icon ${className}" data-comparison-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${comparisonIcon(action)}</button>`;
export function inlineBookMark(name){const asset=platformAsset(name);return asset?`<img src="${asset}" alt="${esc(name)}" width="34" height="34">`:'';}
// Every comparison card is the expanded card (the standalone Positive EV reference card is gone: its
// mount was never rendered).
export function inlineBetCard(model){return expandedBetCard(model);}
export function bindInlineComparison(root,model,handlers={}){return bindExpandedComparison(root,model,handlers);}
