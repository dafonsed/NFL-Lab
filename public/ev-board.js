// Positive EV board: one dense, sortable row per opportunity with an inline
// book-by-book price grid. Rendering only; ev.js supplies data and handlers.
import { platformAsset } from './platform-catalog.js';
import { leagueMark } from './sports-identity.js';
import { probabilityToAmerican, money, percent } from './ev-core.js?v=3';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  track:'<path d="M20 7 10 17l-5-5"/><path d="M17 3v6M14 6h6"/>',
  parlay:'<path d="M12 5v14M5 12h14"/>',
  hide:'<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.4 3.4M6.6 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  link:'<path d="M7 17 17 7M9 7h8v8"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>',
  history:'<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>',
  expand:'<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
  pin:'<path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 16v5"/>',
  calculator:'<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h3.5"/>',
  swap:'<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  trackCircle:'<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  sparkle:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
export const boardIcon = (name, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;

export const bookLogo = (name, size = 28) => {
  const asset = platformAsset(name);
  return asset ? `<img src="${asset}" alt="" width="${size}" height="${size}" loading="lazy">` : `<span class="evb-book-initials" aria-hidden="true">${esc(String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())}</span>`;
};

export function startLabel(quote) {
  const at = Date.parse(quote.startTime);
  if (!Number.isFinite(at)) return quote.live ? 'Live now' : quote.displayTime || 'Start time not entered';
  const date = new Date(at), today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  const day = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : date.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' });
  return `${quote.live ? 'Live · ' : ''}${day} at ${time}`;
}

const lineText = quote => quote.line === '' || quote.line == null ? '' : ` ${quote.type === 'spread' && Number(quote.line) > 0 ? '+' : ''}${quote.line}`;
export const selectionText = quote => `${quote.player ? quote.player + ' ' : ''}${quote.side}${lineText(quote)}`;

const sortHeader = (label, key, sort, extra = '') => `<th scope="col" ${extra} aria-sort="${sort === key ? 'descending' : 'none'}"><button type="button" data-sort="${key}" class="evb-sort${sort === key ? ' is-active' : ''}">${label}<span aria-hidden="true">${sort === key ? '↓' : '↕'}</span></button></th>`;

// ctx: { rows:[{quote,fair,ev}], total, live, sort, openId, oddsLabel, stake(fair,odds), flags, kellyLabel, detail(quote) }
export function renderEvBoard(ctx) {
  const { rows, sort, openId, oddsLabel } = ctx;
  const maxEv = Math.max(...rows.map(row => row.ev).filter(Number.isFinite), 0.0001);
  const body = rows.map(({quote:q, fair, ev}) => {
    const open = openId === q.id, flags = ctx.flags(q.id), stake = ctx.stake(fair, q.odds);
    const width = Math.max(6, Math.min(100, ev / maxEv * 100));
    const tier = ev >= .05 ? 'high' : ev >= .02 ? 'mid' : 'low';
    const sportKey = String(q.sport || '').toLowerCase();
    const market = q.displayMarket || (q.player ? String(q.market).replace(q.player, '').trim() : q.market);
    const fairOdds = Number.isFinite(fair) ? oddsLabel(probabilityToAmerican(fair)) : '—';
    return `<tr class="evb-row${open ? ' is-open' : ''}${flags.pin ? ' is-pinned' : ''}" data-evb-row="${esc(q.id)}" data-wager-id="${esc(q.id)}">
      <td class="evb-ev" data-tier="${tier}"><strong>${(ev * 100).toFixed(2)}%</strong><span class="evb-ev-bar" aria-hidden="true"><i style="width:${width.toFixed(1)}%"></i></span>${flags.pin ? `<small class="evb-pin">${boardIcon('pin', 12)}Pinned</small>` : ''}</td>
      <td class="evb-event"><small>${esc(startLabel(q))}</small><strong>${esc(q.displayEvent || q.event)}</strong><span class="evb-league">${leagueMark(sportKey) || ''}<span>${esc(q.sport)}${q.league && q.league !== q.sport ? ` · ${esc(q.league)}` : ''}</span></span></td>
      <td class="evb-market"><span>${esc(market)}</span>${q.live ? '<small class="evb-live-dot">Live</small>' : ''}</td>
      <td class="evb-bet"><span class="evb-book-logo">${bookLogo(q.book, 30)}</span><span><strong>${esc(selectionText(q))}</strong><small class="evb-bet-market">${esc(market)}</small><small>${esc(q.book)}${Number(q.liquidity) > 0 ? ` · ${money(Number(q.liquidity))} avail.` : ''}</small></span></td>
      <td class="evb-odds"><span class="evb-price">${esc(oddsLabel(q.odds))}</span><small>Fair ${esc(fairOdds)}</small></td>
      <td class="evb-prob"><strong>${Number.isFinite(fair) ? percent(fair) : '—'}</strong><small>No-vig</small></td>
      <td class="evb-stake"><strong>${money(stake)}</strong><small>${esc(ctx.kellyLabel)}</small></td>
      <td class="evb-actions"><div>
        <button type="button" class="evb-link" data-suite-action="link" data-id="${esc(q.id)}" aria-label="Open ${esc(q.book)} bet link">Bet${boardIcon('link', 13)}</button>
        <button type="button" class="evb-icon" data-suite-action="track" data-id="${esc(q.id)}" data-tool="${ctx.live ? 'ev-live' : 'ev-pre'}" aria-label="Track this bet" title="Track bet">${boardIcon('track')}</button>
        ${q.live ? '' : `<button type="button" class="evb-icon" data-parlay="${esc(q.id)}" aria-label="Add to parlay" title="Add to parlay">${boardIcon('parlay')}</button>`}
        <button type="button" class="evb-icon evb-toggle" data-evb-toggle="${esc(q.id)}" aria-expanded="${open}" aria-controls="evb-detail-${esc(q.id)}" aria-label="${open ? 'Hide' : 'Compare'} prices for ${esc(selectionText(q))}" title="Compare books">${boardIcon('chevron')}</button>
      </div></td>
    </tr>${open ? renderEvBoardDetail(ctx, q, fair, ev) : ''}`;
  }).join('');
  return `<div class="evb-table-wrap"><table class="evb-table" aria-label="${ctx.live ? 'Live' : 'Pregame'} positive EV bets"><thead><tr>${sortHeader('+EV%', 'ev', sort, 'class="evb-col-ev"')}${sortHeader('Event', 'event', sort)}<th scope="col">Market</th><th scope="col">Bet &amp; book</th>${sortHeader('Odds', 'odds', sort)}<th scope="col" title="Consensus no-vig probability from the other books">Probability</th><th scope="col" title="Uses your bankroll and Kelly multiplier">Rec. bet</th><th scope="col" class="evb-col-actions"><span class="sr-only">Actions</span></th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// Expanded bet panel shared by Positive EV, DFS and Arbitrage: boost inputs and
// round tools above a borderless Selection / Average / Best / per-book grid.
// opts: { id, colspan, label, boosts:[{book, attrs, result}], tools:[{icon, label, attrs, pressed}],
//         books:[name], rows:[{label, selected, average, best:{book, value}, cells:[{value, sub, best}]}],
//         heads:{average, best}, addAttrs, note }
export function renderBetPanel(opts) {
  const heads = { average:'Average', best:'Best', ...opts.heads };
  const boosts = (opts.boosts || []).map(boost => `<label class="evd-boost"><span class="evd-boost-logo">${bookLogo(boost.book, 22)}</span><input type="number" inputmode="decimal" step="1" min="0" placeholder="Boost" aria-label="Profit boost % at ${esc(boost.book)}" ${boost.attrs || ''}><output class="evd-boost-result" aria-live="polite">${boost.result || ''}</output></label>`).join('');
  const tools = (opts.tools || []).map(tool => `<button type="button" class="evd-tool" aria-label="${esc(tool.label)}" title="${esc(tool.label)}"${tool.pressed != null ? ` aria-pressed="${Boolean(tool.pressed)}"` : ''} ${tool.attrs || ''}>${boardIcon(tool.icon, 17)}</button>`).join('');
  const bookHeads = opts.books.map(book => `<th scope="col" title="${esc(book)}"><span class="evd-logo">${bookLogo(book, 26)}</span><span class="sr-only">${esc(book)}</span></th>`).join('');
  const add = opts.addAttrs ? `<td class="evd-add-cell" rowspan="${opts.rows.length}"><button type="button" class="evd-add" aria-label="Add a price" title="Add a price" ${opts.addAttrs}>${boardIcon('plus', 18)}</button></td>` : '';
  const missing = value => value === '—' || value == null || value === '';
  const body = opts.rows.map((row, index) => `<tr class="${row.selected ? 'is-selected' : ''}"><th scope="row">${esc(row.label)}</th><td class="evd-average">${esc(row.average ?? '—')}</td><td class="evd-best">${row.best ? `<span class="evd-logo">${bookLogo(row.best.book, 22)}</span><strong>${esc(row.best.value)}</strong>` : '—'}</td>${row.cells.map(cell => `<td class="${cell.best ? 'is-best' : ''}${missing(cell.value) ? ' is-missing' : ''}"><strong>${missing(cell.value) ? '-' : esc(cell.value)}</strong>${cell.sub ? `<small>${esc(cell.sub)}</small>` : ''}</td>`).join('')}${index === 0 ? add : ''}</tr>`).join('');
  return `<tr class="evb-detail-row evd-row" id="${esc(opts.id)}"><td colspan="${opts.colspan}"><section class="evb-detail evd-panel" aria-label="${esc(opts.label)}">
    <div class="evd-toolbar">${boosts ? `<div class="evd-boosts"><span class="evd-spark" aria-hidden="true">${boardIcon('sparkle', 15)}</span>${boosts}</div>` : '<span></span>'}<div class="evd-tools" role="toolbar" aria-label="Bet actions">${tools}</div></div>
    <div class="evd-scroll" tabindex="0" role="region" aria-label="Prices at every book. Scroll horizontally to see more books."><table class="evd-grid"><thead><tr><th scope="col" class="evd-selection">Selection</th><th scope="col">${esc(heads.average)}</th><th scope="col">${esc(heads.best)}</th>${bookHeads}${opts.addAttrs ? '<th scope="col" class="evd-add-head"><span class="sr-only">Add</span></th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>
    ${opts.note ? `<p class="evd-note">${opts.note}</p>` : ''}
  </section></td></tr>`;
}

// Boosted American price and EV for a profit boost in percent.
export function boostedOffer(odds, fair, boostPercent) {
  const american = Number(odds), boost = Number(boostPercent);
  const decimal = american >= 100 ? 1 + american / 100 : american <= -100 ? 1 - 100 / american : NaN;
  if (!(boost > 0) || !Number.isFinite(decimal)) return null;
  const boosted = 1 + (decimal - 1) * (1 + boost / 100);
  return { decimal:boosted, american:boosted >= 2 ? (boosted - 1) * 100 : -100 / (boosted - 1), ev:Number.isFinite(fair) ? fair * boosted - 1 : NaN };
}

export function renderEvBoardDetail(ctx, quote, fair) {
  const model = ctx.detail(quote), id = quote.id, tool = ctx.live ? 'ev-live' : 'ev-pre';
  const flags = ctx.flags(id), player = quote.player ? quote.player + ' ' : '';
  const rows = model.rows.map(row => {
    const bestIndex = row.prices.findIndex(price => price.best);
    return { label:player + row.selection, selected:row.side === quote.side, average:row.average,
      best:bestIndex >= 0 ? { book:model.columns[bestIndex].name, value:row.prices[bestIndex].value } : null,
      cells:row.prices.map(price => ({ value:price.value, sub:price.liquidity, best:price.best })) };
  });
  return renderBetPanel({ id:`evb-detail-${id}`, colspan:8, label:`Price comparison for ${selectionText(quote)}`,
    boosts:[{ book:quote.book, attrs:`data-evb-boost="${esc(id)}" data-odds="${esc(quote.odds)}" data-fair="${esc(fair)}"` }],
    tools:[
      { icon:'calculator', label:'Full analysis and calculator', attrs:`data-evb-analysis="${esc(id)}"` },
      { icon:'history', label:'Line history', attrs:`data-line-history="${esc(id)}" aria-haspopup="dialog"` },
      { icon:'hide', label:'Hide bet', attrs:`data-suite-action="hide" data-id="${esc(id)}"` },
      { icon:'trackCircle', label:'Track bet', attrs:`data-suite-action="track" data-id="${esc(id)}" data-tool="${tool}"` },
      { icon:'pin', label:flags.pin ? 'Unpin bet' : 'Pin bet', pressed:Boolean(flags.pin), attrs:`data-suite-action="pin" data-id="${esc(id)}"` },
      { icon:'flag', label:'Report a problem', attrs:`data-suite-action="report" data-id="${esc(id)}"` },
      { icon:'refresh', label:'Refresh prices', attrs:`data-evb-refresh="${esc(id)}"` }
    ],
    books:model.columns.map(column => column.name), rows,
    addAttrs:`data-add="quote" data-live="${Boolean(quote.live)}"` });
}
