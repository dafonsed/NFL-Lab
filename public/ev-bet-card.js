import { platformAsset, platformLabel } from './platform-catalog.js';
import { leagueMark, teamMark } from './sports-identity.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const price = value => typeof value === 'number' ? Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value}` : '—' : String(value ?? '—');
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';

function bookMark(book) {
  const asset = platformAsset(book);
  return `<span class="wager-book-mark" aria-hidden="true">${asset ? `<img src="${esc(asset)}" alt="" width="36" height="36" loading="lazy">` : `<span>${esc(String(book || '').slice(0,2))}</span>`}</span>`;
}

function matchup(event, sport) {
  const codes = /^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})$/.exec(String(event || ''));
  if (!codes) return esc(event);
  return `${teamMark({sport:String(sport).toLowerCase(),team:codes[1]})}<span>${esc(codes[1])} ${esc(codes[2])} ${esc(codes[3])}</span>${teamMark({sport:String(sport).toLowerCase(),team:codes[3]})}`;
}

/** All data fields are escaped. Markup slots and action attributes are internal templates only. */
export function wagerCard({id='',className='',metric='',metricLabel='',market='',selection='',book='',odds,event='',sport='',time='',reference=null,facts=[],actions='',detailAttrs='',footerActions='',body=''} = {}) {
  const interactive = Boolean(detailAttrs);
  const quoteTag = interactive ? 'button' : 'div';
  const quoteAttrs = interactive ? `type="button" ${detailAttrs} ${/\baria-label\s*=/.test(detailAttrs) ? '' : `aria-label="Compare ${esc(book)} ${esc(price(odds))}: ${esc(selection)}"`}` : '';
  const selectionTag = interactive ? 'button' : 'h3';
  const selectionAttrs = interactive ? `type="button" ${detailAttrs}` : '';
  const hasQuote = book || odds != null;
  const hasMetric = metric !== '' && metric != null;
  const referencePrice = reference && (reference.odds != null || reference.label || reference.book);
  const hasFooter = facts.length || referencePrice || footerActions || actions;
  return `<article class="wager-card wager-research-card ${esc(className)}"${id ? ` data-wager-id="${esc(id)}"` : ''}>
    <header class="wager-card-head"><div class="wager-heading"><div class="wager-market-line"><span class="wager-market">${esc(market)}</span>${sport ? `<span class="wager-league">${leagueMark(String(sport).toLowerCase())}<span>${esc(sport)}</span></span>` : ''}</div><div class="wager-context">${event ? `<div class="wager-event">${matchup(event,sport)}</div>` : ''}${time ? `<div class="wager-meta"><span>${esc(time)}</span></div>` : ''}</div></div>
      <div class="wager-selection-group"><span class="wager-field-label">Selection</span><${selectionTag} class="wager-selection" ${selectionAttrs}>${esc(selection || market)}</${selectionTag}></div>
      ${hasQuote ? `<${quoteTag} class="wager-quote" ${quoteAttrs} title="${esc(book ? platformLabel(book) || book : 'Price')}"><span class="wager-quote-label">${esc(book ? platformLabel(book) || book : 'Price')}</span>${book ? bookMark(book) : ''}<strong>${esc(price(odds))}</strong>${interactive ? arrow : ''}</${quoteTag}>` : ''}
      ${hasMetric ? `<span class="wager-metric"><strong>${esc(metric)}</strong>${metricLabel ? `<small>${esc(metricLabel)}</small>` : ''}</span>` : ''}
    </header>
    ${body ? `<div class="wager-body">${body}</div>` : ''}
    ${hasFooter ? `<footer class="wager-card-foot">${facts.length ? `<dl class="wager-facts">${facts.map(({label,value}) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
      <div class="wager-card-actions">${referencePrice ? `<span class="wager-reference" title="${esc(reference.label || reference.book || 'Reference price')}">${reference.book ? bookMark(reference.book) : ''}${reference.label ? `<small>${esc(reference.label)}</small>` : ''}${reference.odds != null ? `<strong>${esc(price(reference.odds))}</strong>` : ''}</span>` : ''}${footerActions}${actions}</div>
    </footer>` : ''}
  </article>`;
}
