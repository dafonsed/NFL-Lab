import { decimal, implied, expectedReturn, money, percent, signed, oddsLabel, probabilityToAmerican, fairProbability, fresh, groups, marketKey, evRows, fractionalKellyStake, holdRows, arbitrage, arbitrageRows, middleRows, promoConversion, parlay, fantasySlip, closingLineValue, gradedBet, pearson, sharpMatches, alertMatches, validateWorkspace } from './ev-core.js?v=2';
import { exampleWorkspace } from './ev-demo.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const STORE = 'sportslab-ev-workbench-v1';
const TOOLS = [
  ['Markets', 'odds', 'Odds comparison', 'Compare every entered sportsbook price, consensus fair probability and recorded movement.'],
  ['Markets', 'ev-pre', 'Positive EV · pregame', 'Compare each offered price against no-vig consensus from other complete books.'],
  ['Markets', 'ev-live', 'Positive EV · live', 'The same calculation for in-game quotes that are less than 90 seconds old.'],
  ['Markets', 'arb-pre', 'Arbitrage · pregame', 'Find opposing best prices whose combined implied probabilities are below 100%.'],
  ['Markets', 'arb-live', 'Arbitrage · live', 'Calculate stakes from fresh opposing in-game quotes. Recheck the prices before acting.'],
  ['Markets', 'middles', 'Middles', 'Find spread and total line pairs, including live markets, with an interval where both bets win.'],
  ['Markets', 'holds', 'Low holds', 'Compare the best opposing prices and their combined market margin.'],
  ['Builders', 'promo', 'Promo / bonus converter', 'Balance a promotional side with a cash hedge and inspect each outcome.'],
  ['Builders', 'parlay', 'Parlay builder', 'Combine independent legs from one book using consensus estimates for each leg.'],
  ['Research', 'sharp', 'Sharp money / Pro', 'Inspect exchange liquidity, opposing sportsbook prices and price history.'],
  ['Fantasy', 'fantasy', 'Fantasy lines', 'Compare DFS player lines and entered hit probabilities across apps.'],
  ['Fantasy', 'optimizer', 'Fantasy optimizer', 'Rank two-pick combinations using each app’s saved payout rules.'],
  ['Fantasy', 'slip', 'Fantasy slip builder', 'Calculate exact hit-count probabilities and projected payout for your selected slip.'],
  ['Fantasy', 'fantasy-alerts', 'Fantasy alerts', 'Watch for newly entered props and their estimated hit rates.'],
  ['Records', 'prediction', 'Prediction traders', 'Track bid, ask, order book snapshots, traders, positions and trades.'],
  ['Records', 'tracker', 'Bet tracker & CLV', 'Grade entered bets and compare booked odds with the closing price.'],
  ['Records', 'trends', 'Player prop trends', 'Review entered game results, recent hit rates and paired-game correlations.'],
  ['Records', 'line-alerts', 'Movement & price alerts', 'Review price snapshots and manage local threshold alerts.']
];
const toolMeta = Object.fromEntries(TOOLS.map(row => [row[1], row]));
const arrays = ['quotes', 'history', 'dfs', 'contracts', 'contractHistory', 'traders', 'trades', 'bets', 'results', 'alerts', 'notifications', 'slips'];
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE));
    if (parsed?.version === 1) return normalize(parsed);
  } catch { /* Browser storage can be disabled. */ }
  return normalize({ version: 1, example: false });
}
function normalize(data) {
  for (const key of arrays) if (!Array.isArray(data[key])) data[key] = [];
  for (const key of ['dfs','contracts','bets','results']) for (const item of data[key]) if (item.source === 'example' && !item.sport) item.sport = 'NFL';
  const quoteIds = new Set(data.quotes.map(x => x.id)), contractIds = new Set(data.contracts.map(x => x.id));
  data.history = data.history.filter(x => quoteIds.has(x.quoteId));
  data.contractHistory = data.contractHistory.filter(x => contractIds.has(x.contractId));
  if (!data.paytables || typeof data.paytables !== 'object' || Array.isArray(data.paytables)) data.paytables = {};
  return data;
}
let state = load();
let active = toolMeta[location.hash.slice(1)] ? location.hash.slice(1) : 'ev-pre';
let search = '';
let bookmaker = '', marketType = '', showAllBooks = false, bankroll = 5000, kelly = .25, flatMultiplier = 1, evSort = 'ev', detailQuoteId = '';
let evLeague = '', evDateRange = 'today', evMaxOdds = '200';
let expandedOddsKey = '', expandedArbKey = '', expandedSharpKey = '';
const sportsbookNames = ['bet365','DraftKings','FanDuel','BetMGM','Caesars','BetRivers','Fanatics','Hard Rock Bet','theScore Bet','Bally Bet','Desert Diamond Sports'];
const fantasyNames = ['PrizePicks','Underdog Fantasy','Sleeper Picks','ParlayPlay','Dabble','Chalkboard','DraftKings Fantasy','FanDuel Fantasy','Betr Picks','OwnersBox','Boom Fantasy','Vivid Picks'];
try {
  const saved = JSON.parse(localStorage.getItem('sportslab-ev-display-v1'));
  if (Number(saved?.bankroll) > 0) bankroll = Number(saved.bankroll);
  if (Number(saved?.kelly) >= 0 && Number(saved?.kelly) <= 1) kelly = Number(saved.kelly);
  if (Number(saved?.flatMultiplier) > 0 && Number(saved?.flatMultiplier) <= 10) flatMultiplier = Number(saved.flatMultiplier);
} catch { /* Keep usable defaults when storage is unavailable. */ }
const initialSport = new URLSearchParams(location.search).get('sport')?.toUpperCase();
let sport = initialSport === 'ALL' ? '' : ['NFL','MLB','NBA','WNBA','NHL','SOCCER'].includes(initialSport) ? initialSport === 'SOCCER' ? 'Soccer' : initialSport : 'NFL';
let parlayIds = [], fantasyIds = [], fantasyApp = '', stake = 100, fantasyStake = 10;
let promoInput = { stake: 100, promoOdds: 150, hedgeOdds: -130, kind: 'bonus', boost: 0 };
let trendA = '', trendB = '', traderName = '';
let editing = null;
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const origin = x => x.source === 'example' ? '<span class="ev-status example">Example</span>' : '<span class="ev-status">Manual</span>';
const age = ts => { const n = Date.parse(ts); if (!Number.isFinite(n)) return 'Unknown time'; const s = Math.max(0, Math.floor((Date.now() - n) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const qName = q => `${q.event} · ${q.market}${q.line !== '' && q.line != null ? ' ' + q.line : ''} · ${q.side}`;
const qStatus = q => q.live ? `<span class="ev-status${fresh(q) ? '' : ' stale'}">${fresh(q) ? 'Live entry' : 'Stale live'} · ${age(q.ts)}</span>` : `<span class="ev-caption">Pregame · ${age(q.ts)}</span>`;
const filterText = value => String(value ?? '').toLowerCase().includes(search);
const visible = (item, fields) => (!sport || !item.sport || item.sport === sport) && (!search || fields.some(key => filterText(item[key])));
const quotes = () => state.quotes.filter(q => visible(q, ['event', 'market', 'book', 'side', 'sport']));
const dfs = () => state.dfs.filter(q => visible(q, ['player', 'market', 'app', 'side']));
const fmtLine = line => line === '' || line == null ? '—' : esc(line);
const oddsCell = q => `<strong>${oddsLabel(q.odds)}</strong><small>${esc(q.book)}</small>`;
const button = (label, attributes = '') => `<button type="button" ${attributes}>${label}</button>`;
const empty = (title, body) => `<div class="ev-empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;
const table = (headings, rows) => rows.length ? `<div class="ev-table-wrap"><table class="ev-table"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
const metric = (label, value, cls = '') => `<div class="ev-metric ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); $('#ev-notice').textContent = state.example ? 'Example market data. Add or import your own prices; no live feed is connected.' : 'Manual workspace saved in this browser. No market feed is connected.'; }
  catch { $('#ev-notice').textContent = 'Browser storage is unavailable. Export your work before leaving this page.'; }
}
function snapshotQuote(q) { state.history.push({ id: uid(), quoteId: q.id, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: q.source }); }
function evaluateAlerts() {
  for (const rule of state.alerts) {
    if (rule.enabled === false) continue;
    const matched = alertMatches(rule, state);
    const seen = new Set(rule.seen || []);
    for (const match of matched) if (!seen.has(match.id)) {
      state.notifications.unshift({ id: uid(), ruleId: rule.id, message: `${rule.kind === 'fantasy-new' ? 'New fantasy prop' : rule.kind === 'ev' ? 'EV threshold' : rule.kind === 'movement' ? 'Line movement' : 'Price threshold'}: ${match.label}`, ts: now(), read: false });
      seen.add(match.id);
    }
    rule.seen = [...seen];
  }
  state.notifications = state.notifications.slice(0, 300);
}
function commit() { evaluateAlerts(); persist(); render(); }
function renderNav() {
  let category = '';
  $('#ev-tool-nav').innerHTML = TOOLS.map(([group, key, label]) => {
    const heading = group !== category ? `<div class="ev-nav-heading">${group}</div>` : '';
    category = group;
    return heading + `<button type="button" data-tool="${key}" ${key === active ? 'aria-current="page"' : ''}>${esc(label)}</button>`;
  }).join('');
  $('#ev-tool-select').innerHTML = TOOLS.map(([group, key, label]) => `<option value="${key}">${group} / ${label}</option>`).join('');
  $('#ev-tool-select').value = active;
  document.querySelectorAll('.ev-quick-tools [data-tool]').forEach(button => button.setAttribute('aria-current', button.dataset.tool === active ? 'page' : 'false'));
}
function setTool(key) { if (!toolMeta[key]) return; active = key; bookmaker = ''; marketType = ''; showAllBooks = false; $('.ev-tool-details').open = false; history.replaceState(null, '', location.pathname + location.search + '#' + key); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function action(label, type, extra = '') { return button(label, `data-add="${type}" ${extra}`); }
function render() {
  renderNav();
  const titles = { odds:'Odds Screen', 'ev-pre':'Positive EV', 'ev-live':'Live EV', fantasy:'DFS Props', 'arb-pre':'Arbitrage', 'arb-live':'Live Arbitrage', sharp:'Smart Money', tracker:'Bet Tracker' };
  const pageTitle = titles[active] || toolMeta[active][2];
  $('#ev-page-title').textContent = pageTitle;
  $('#ev-top-title').textContent = pageTitle;
  document.title = pageTitle + ' · SportsLab';
  document.body.dataset.evScreen = active;
  document.querySelectorAll('[data-ev-nav]').forEach(link => {
    const target = new URL(link.href).hash.slice(1);
    const selected = target === active || target === 'ev-pre' && active === 'ev-live' || target === 'arb-pre' && active === 'arb-live';
    if (selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  $('#ev-sport').value = sport;
  $('#ev-search').value = search;
  const options = active === 'fantasy'
    ? [['','All props'],...[...new Set(state.dfs.map(item => item.market))].sort().map(value => [value,value])]
    : [['','All markets'],['total','Totals'],['spread','Spreads'],['prop','Player props'],['alternate','Alternates'],['future','Futures'],['three-way','Three-way']];
  $('#ev-market-type').innerHTML = options.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if (!options.some(([value]) => value === marketType)) marketType = '';
  $('#ev-market-type').value = marketType;
  $('#ev-reference-sport').value = sport;
  $('#ev-reference-market').innerHTML = options.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  $('#ev-reference-market').value = marketType;
  const leagues = [...new Set(state.quotes.map(q => q.league || q.sport).filter(Boolean))].sort();
  $('#ev-reference-league').innerHTML = '<option value="">All leagues</option>' + leagues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (!leagues.includes(evLeague)) evLeague = '';
  $('#ev-reference-league').value = evLeague;
  $('#ev-reference-date').value = evDateRange;
  $('#ev-reference-max-odds').value = evMaxOdds;
  $('#ev-sort-mode').value = evSort;
  $('#ev-sharp-filter').hidden = active !== 'sharp';
  $('#ev-sharp-min').value = localStorage.getItem('sportslab-ev-sharp-min') || 1000;
  $('#ev-ev-bankroll').value = bankroll;
  const usesKelly = ['ev-pre','ev-live'].includes(active);
  const usesFlat = ['arb-pre','arb-live'].includes(active);
  $('#ev-kelly').value = usesKelly ? kelly : flatMultiplier.toFixed(2);
  $('#ev-data-kind').textContent = state.example ? 'Example prices' : 'Manual prices';
  $('#ev-top-badge').textContent = state.example ? 'Example prices' : 'Manual prices';
  $('#ev-multiplier-label').textContent = usesKelly ? 'Kelly multiplier' : 'Flat multiplier';
  $('#ev-kelly').disabled = !usesKelly && !usesFlat;
  $('#ev-kelly').min = usesKelly ? '0' : '0.05';
  $('#ev-kelly').max = usesKelly ? '1' : '10';
  $('#ev-kelly').title = $('#ev-kelly').disabled ? 'Multiplier applies to Positive EV and Arbitrage only' : '';
  $('#ev-odds-tabs').hidden = active !== 'odds';
  document.querySelectorAll('[data-odds-tab]').forEach(tab => tab.setAttribute('aria-pressed',String(tab.dataset.oddsTab === marketType)));
  renderBooks();
  $('#ev-record-count').textContent = `${state.quotes.length} prices · ${state.dfs.length} DFS props · ${state.contracts.length} contracts`;
  $('#ev-title').textContent = pageTitle;
  $('#ev-description').textContent = toolMeta[active][3];
  const viewActions = {
    odds: state.example ? button('Remove examples', 'data-remove-examples') : button('Load examples', 'data-load-examples'), 'ev-pre': state.example ? button('Remove examples', 'data-remove-examples') : button('Load examples', 'data-load-examples'), 'ev-live': state.example ? button('Replay live examples', 'data-replay-live') : '',
    'arb-pre': '', 'arb-live': state.example ? button('Replay live examples', 'data-replay-live') : '', middles: action('Add price', 'quote') + (state.example ? button('Replay live examples', 'data-replay-live') : ''), holds: action('Add price', 'quote'),
    sharp: state.example ? button('Replay live examples', 'data-replay-live') : '', fantasy: '', optimizer: action('Add DFS prop', 'dfs'), slip: action('Add DFS prop', 'dfs'),
    'fantasy-alerts': action('New alert', 'alert', 'data-kind="fantasy-new"'), prediction: action('Add contract', 'contract'), tracker: action('Add bet', 'bet'), trends: action('Add result', 'result'), 'line-alerts': action('New alert', 'alert')
  };
  $('#ev-view-actions').innerHTML = viewActions[active] || '';
  const primaryScreen = ['odds','ev-pre','ev-live','arb-pre','arb-live','sharp','fantasy'].includes(active);
  const positiveScreen = ['ev-pre','ev-live'].includes(active);
  (positiveScreen ? $('#ev-menu-actions') : $('.ev-header')).append($('.ev-header-actions'));
  (primaryScreen ? $('.ev-header-actions') : $('.ev-view-side')).append($('#ev-view-actions'));
  if (primaryScreen) $('.ev-header-actions').append($('.ev-sidebar'));
  const views = { odds: renderOdds, 'ev-pre': () => renderEv(false), 'ev-live': () => renderEv(true), 'arb-pre': () => renderArb(false), 'arb-live': () => renderArb(true), middles: renderMiddles, holds: renderHolds, promo: renderPromo, parlay: renderParlay, sharp: renderSharp, fantasy: renderFantasy, optimizer: renderOptimizer, slip: renderSlip, 'fantasy-alerts': renderFantasyAlerts, prediction: renderPrediction, tracker: renderTracker, trends: renderTrends, 'line-alerts': renderLineAlerts };
  $('#ev-view').innerHTML = views[active]();
}

function renderBooks() {
  const fantasyMode = ['fantasy','optimizer','slip','fantasy-alerts'].includes(active);
  const entered = fantasyMode ? state.dfs.map(item => item.app) : state.quotes.filter(q => !sport || q.sport === sport).map(q => q.book);
  const supported = fantasyMode ? fantasyNames : sportsbookNames;
  const books = [...new Set([...supported, ...entered])];
  const visibleCount = fantasyMode ? 6 : ['ev-pre','ev-live'].includes(active) ? 11 : 11;
  const shown = showAllBooks ? books : books.slice(0, visibleCount);
  const bookmakerMarks = {
    DraftKings: '/assets/sportsbooks/draftkings.svg',
    FanDuel: '/assets/sportsbooks/fanduel.png',
    BetMGM: '/assets/brands/betmgm.png',
    Caesars: '/assets/brands/caesars.png',
    BetRivers: '/assets/brands/betrivers.png',
    Fanatics: '/assets/brands/fanatics.png',
    'Hard Rock Bet': '/assets/brands/hardrock.png',
    'theScore Bet': '/assets/brands/thescore.png',
    'Desert Diamond Sports': '/assets/brands/desertdiamond.png'
  };
  $('#ev-books').innerHTML = `<button type="button" class="ev-book-all" data-book="" aria-pressed="${!bookmaker}">All</button>` + shown.map(book => `<button type="button" data-book="${esc(book)}" aria-pressed="${bookmaker === book}" title="Filter ${esc(book)}"><span class="ev-book-symbol">${bookmakerMarks[book] ? `<img src="${bookmakerMarks[book]}" alt="" class="ev-book-logo">` : esc(book === 'bet365' ? 'bet365' : book === 'Bally Bet' ? 'B' : book.slice(0,3))}</span><span class="ev-book-name">${esc(book)}</span></button>`).join('');
  $('#ev-books-more').hidden = books.length <= visibleCount;
  $('#ev-books-more').textContent = showAllBooks ? '−' : ['ev-pre','ev-live'].includes(active) ? `+${books.length - shown.length}` : `+${books.length - shown.length} more`;
  $('#ev-books-more').setAttribute('aria-label', showAllBooks ? 'Show fewer bookmakers' : `Show ${books.length - shown.length} more bookmakers`);
  $('#ev-books-more').setAttribute('aria-expanded', String(showAllBooks));
  const relevant = ['ev-pre','ev-live','odds','arb-pre','arb-live','sharp','fantasy'].includes(active);
  $('.ev-bookbar').hidden = !relevant;
  $('.ev-control-grid').hidden = !relevant;
  const labels = { odds:'Compare lines', 'ev-pre':'Find bets', 'ev-live':'Find bets', fantasy:'Find props', 'arb-pre':'Find arbs', 'arb-live':'Find arbs', sharp:'Find opportunities' };
  $('#ev-find').firstChild.textContent = (labels[active] || 'View results') + ' ';
  $('#ev-add-quote').textContent = active === 'fantasy' ? 'Add DFS prop' : active === 'sharp' ? 'Add exchange price' : 'Add price';
}

function renderOdds() {
  const all = quotes().filter(q => (!marketType || q.type === marketType) && (!bookmaker || q.book === bookmaker));
  const sets = groups(all), books = [...new Set(all.map(q => q.book))].sort((a,b) => a.localeCompare(b));
  const displayBooks = books.slice(0,8);
  const rows = sets.flatMap(group => {
    const first = group[0], key = marketKey(first), sides = [...new Set(group.map(q => q.side))];
    const best = new Map(sides.map(side => [side, group.filter(q => q.side === side && fresh(q)).sort((a,b) => decimal(b.odds)-decimal(a.odds))[0]]));
    const eventCell = `<strong>${esc(first.event)}</strong><small>${esc(first.sport || 'Sport not entered')} · ${first.live ? 'Live entry' : 'Pregame'} · ${age(first.ts)}</small>`;
    const bookCells = displayBooks.map(book => `<td class="ev-odds-prices">${sides.map(side => {
      const q = group.filter(item => item.book === book && item.side === side).sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts))[0];
      return q ? `<button type="button" data-edit="quote" data-id="${esc(q.id)}" class="${best.get(side)?.id === q.id ? 'is-best' : ''}" title="Edit ${esc(book)} ${esc(side)} price"><span>${esc(side)} ${fmtLine(q.line)}</span><b>${oddsLabel(q.odds)}</b></button>` : `<span class="ev-odds-missing">—</span>`;
    }).join('')}</td>`).join('');
    const open = expandedOddsKey === key;
    const primary = `<tr><td class="ev-odds-event">${eventCell}</td><td class="ev-odds-market"><strong>${esc(first.market)}</strong><small>${esc(first.type)} · ${fmtLine(first.line)}</small></td>${bookCells}<td><button type="button" class="ev-expand-button" data-odds-expand="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(first.event)} ${esc(first.market)}">${open ? '⌃' : '⌄'}</button></td></tr>`;
    if (!open) return [primary];
    const histories = group.flatMap(q => state.history.filter(h => h.quoteId === q.id).map(h => ({...h, current:q.odds}))).sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts)).slice(0,12);
    const detail = `<tr class="ev-expanded-row"><td colspan="${displayBooks.length + 3}"><div class="ev-expanded-grid"><section><h3>Line movement · ${esc(first.market)}</h3><p>${histories.length > 1 ? 'Recorded price snapshots for this market' : 'More snapshots appear here after a price is edited.'}</p><div class="ev-movement-list">${histories.map(h => `<span>${esc(h.book)} <b>${oddsLabel(h.odds)}</b><small>${age(h.ts)}</small></span>`).join('') || '<span>No snapshots recorded</span>'}</div></section><section><h3>Bookmaker prices</h3><div class="ev-mini-ledger">${group.slice(0,12).map(q => `<div><span>${esc(q.book)}</span><span>${esc(q.side)} ${fmtLine(q.line)}</span><strong class="${best.get(q.side)?.id === q.id ? 'ev-positive' : ''}">${oddsLabel(q.odds)}</strong></div>`).join('')}</div></section><section><h3>Market details</h3><dl><div><dt>Market</dt><dd>${esc(first.market)}</dd></div><div><dt>Status</dt><dd>${first.live ? fresh(first) ? 'Live entry' : 'Stale live entry' : 'Pregame entry'}</dd></div><div><dt>Source</dt><dd>${state.example ? 'Manual and example entries' : 'Manual entries'}</dd></div></dl></section></div></td></tr>`;
    return [primary, detail];
  });
  return `<div class="ev-stack ev-odds-screen">${rows.length ? '<p class="ev-swipe-hint">Scroll sideways to compare bookmakers →</p>' + table(['Event','Market',...displayBooks.map(esc),''], rows) : empty('No prices to compare', 'Add or import prices for the selected sport and market. This workspace has no connected live odds feed.')}<p class="ev-caption ev-method-note">${all.length} entered prices · ${sets.length} markets. Highlighted cells are the best entered price for each side. Check capture time and availability before using any price.</p></div>`;
}

function renderEv(live) {
  const today = new Date().toDateString(), weekAgo = Date.now() - 7 * 86_400_000;
  const pool = state.quotes.filter(q => (!sport || q.sport === sport) && (!evLeague || (q.league || q.sport) === evLeague) && (evDateRange === 'all' || evDateRange === 'today' && new Date(q.ts).toDateString() === today || evDateRange === 'week' && Date.parse(q.ts) >= weekAgo));
  const all = evRows(pool, live);
  const rows = all.filter(({quote:q,ev}) => ev > 0 && (evMaxOdds === 'all' || Number(q.odds) <= Number(evMaxOdds)) && (!bookmaker || q.book === bookmaker) && (!marketType || q.type === marketType) && (!search || [q.event,q.market,q.book,q.side,q.sport].some(value => filterText(value))));
  if (evSort === 'event') rows.sort((a,b) => a.quote.event.localeCompare(b.quote.event) || b.ev - a.ev);
  else if (evSort === 'odds') rows.sort((a,b) => decimal(b.quote.odds) - decimal(a.quote.odds));
  else rows.sort((a,b) => b.ev - a.ev);
  const heading = (label,key) => `<button type="button" class="ev-sort" data-sort="${key}" aria-label="Sort by ${label}" ${evSort === key ? 'aria-current="true"' : ''}>${label}${evSort === key ? ' ↓' : ''}</button>`;
  const body = rows.map(({quote:q,fair,ev}) => `<tr><td class="ev-value">${(ev * 100).toFixed(2)}%<span class="ev-value-help" title="Estimated positive expected value">?</span></td><td class="ev-event"><strong>${esc(q.event)}</strong><small>${esc(q.sport)} · ${q.live ? 'Live entry' : 'Pregame'}</small><small>Observed ${age(q.ts)}</small></td><td><span>${esc(q.market)}</span><small>${esc(q.type)}${q.line !== '' && q.line != null ? ' · ' + fmtLine(q.line) : ''}</small></td><td><span class="ev-book-cell"><span class="ev-book-mark" aria-hidden="true">${q.book === 'DraftKings' ? '<img src="/assets/sportsbooks/draftkings.svg" alt="">' : q.book === 'FanDuel' ? '<img src="/assets/sportsbooks/fanduel.png" alt="">' : esc(q.book.startsWith('Book ') ? 'B' + q.book.slice(5,6) : q.book.replace(/[^\p{L}\p{N}]/gu,'').slice(0,3))}</span>${esc(q.book)}</span></td><td><strong>${esc(q.side)}${q.line !== '' && q.line != null ? ' ' + fmtLine(q.line) : ''}</strong></td><td>${oddsLabel(q.odds)}</td><td>${percent(fair)}</td><td>${money(fractionalKellyStake(bankroll,kelly,fair,q.odds))}</td><td class="ev-actions"><button type="button" class="ev-action-primary" data-detail="${esc(q.id)}">View</button><span class="ev-action-separator" aria-hidden="true"></span><button type="button" class="ev-icon-action" data-edit="quote" data-id="${esc(q.id)}" aria-label="Edit ${esc(q.event)} price" title="Edit price"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 15 1-4 5-5 3 3-5 5-4 1Z"/></svg></button><button type="button" class="ev-icon-action" data-detail="${esc(q.id)}" aria-label="View ${esc(q.event)} comparison chart" title="View comparison chart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19v-4m5 4V9m5 10V5m5 14v-8"/></svg></button><details class="ev-row-more"><summary aria-label="More actions for ${esc(q.event)}">⋯</summary><div><button type="button" data-detail="${esc(q.id)}">View details</button><button type="button" data-edit="quote" data-id="${esc(q.id)}">Edit price</button>${live ? '' : `<button type="button" data-parlay="${esc(q.id)}">Add to parlay</button>`}</div></details></td></tr>`);
  const emptyTitle = !pool.length ? 'No prices for this sport yet' : 'No positive EV selections match these filters';
  const emptyBody = !pool.length ? 'Add or import prices to compare. You can also load clearly labeled examples.' : 'Add complete opposing prices from at least two books, or clear a filter. No price feed is connected.';
  const displayRows = body.length ? body : [`<tr class="ev-empty-row"><td colspan="9">${empty(emptyTitle,emptyBody)}</td></tr>`];
  return `<div class="ev-stack ev-positive-screen"><p class="ev-swipe-hint">Scroll sideways to view odds, probability and actions →</p>${table([heading('EV','ev'),heading('Event','event'),'Market','Bookmaker','Selection',heading('Odds','odds'),'Probability <span title="No-vig consensus estimate">ⓘ</span>','Rec. Bet <span title="Fractional Kelly estimate">ⓘ</span>','Actions'],displayRows)}<div class="ev-results-context"><div><strong>${rows.length} positive ${rows.length === 1 ? 'selection' : 'selections'}</strong><span> from ${all.length} comparable prices</span></div><span>${live ? 'Live entries expire after 90 seconds' : state.example ? 'Pregame · manual and example prices' : 'Pregame · manual prices'}</span></div><p class="ev-caption ev-method-note">Fair probability averages no-vig pairs from other complete books at the same line. EV = fair probability × decimal payout − 1. Recommended bet uses the selected fractional Kelly multiplier and is an estimate, not an instruction to wager. Confirm price, limits and freshness independently.</p></div>`;
}

function openDetail(id) {
  const quote = state.quotes.find(q => q.id === id);
  if (!quote) return;
  detailQuoteId = id;
  const peers = groups(state.quotes).find(rows => rows.some(q => q.id === id)) || [quote];
  const fair = fairProbability(quote, peers), estimate = expectedReturn(fair, quote.odds);
  $('#ev-detail-title').textContent = quote.market;
  const sameSide = peers.filter(q => q.side === quote.side).sort((a,b) => decimal(b.odds) - decimal(a.odds));
  const otherSide = peers.filter(q => q.side !== quote.side).sort((a,b) => decimal(b.odds) - decimal(a.odds));
  const priceRows = (list) => list.length ? list.map(q => `<tr><th scope="row">${esc(q.book)}${q.id === quote.id ? ' <span class="ev-detail-selected">Selected</span>' : ''}</th><td>${oddsLabel(q.odds)}</td><td>${percent(implied(q.odds))}</td><td>${origin(q)}</td></tr>`).join('') : '<tr><td colspan="4">No opposing price entered</td></tr>';
  $('#ev-detail-body').innerHTML = `<div class="ev-detail-summary"><div><span>Estimated EV</span><strong class="${estimate > 0 ? 'ev-positive' : 'ev-negative'}">${signed(estimate)}</strong></div><div><span>Selection</span><strong>${esc(quote.side)} ${fmtLine(quote.line)}</strong></div><div><span>Fair probability</span><strong>${percent(fair)}</strong></div></div><p class="ev-detail-event">${esc(quote.event)} · ${esc(quote.sport)} · ${quote.live ? 'Live entry' : 'Pregame'}</p><div class="ev-detail-comparison"><h3>Implied probability by book</h3><div class="ev-detail-bars">${sameSide.map(q => `<div><span>${esc(q.book)}</span><div class="ev-bar-track"><i style="width:${Math.max(0,Math.min(100,implied(q.odds)*100))}%"></i></div><strong>${oddsLabel(q.odds)}</strong></div>`).join('')}</div></div><div class="ev-detail-tables"><section><h3>${esc(quote.side)}${quote.line !== '' && quote.line != null ? ' ' + fmtLine(quote.line) : ''}</h3><table><thead><tr><th>Book</th><th>Odds</th><th>Implied</th><th>Source</th></tr></thead><tbody>${priceRows(sameSide)}</tbody></table></section><section><h3>Opposing side</h3><table><thead><tr><th>Book</th><th>Odds</th><th>Implied</th><th>Source</th></tr></thead><tbody>${priceRows(otherSide)}</tbody></table></section></div><p class="ev-detail-note">Selected price entered ${age(quote.ts)}. ${quote.live && !fresh(quote) ? 'This live entry is stale. ' : ''}This is a calculation from entered prices, not a live sportsbook quote.</p>`;
  if (!$('#ev-detail').open) $('#ev-detail').showModal();
}

function renderArb(live) {
  const opportunities = arbitrageRows(quotes(), live).filter(x => (!marketType || x.best[0].type === marketType) && (!bookmaker || x.best.some(q => q.book === bookmaker)));
  if (!expandedArbKey && opportunities.length) expandedArbKey = marketKey(opportunities[0].best[0]);
  const totalStake = Math.min(Number(stake) * flatMultiplier, bankroll);
  const rows = opportunities.flatMap(x => {
    const [a,b] = x.best, key = marketKey(a), result = arbitrage(x.best, totalStake), open = expandedArbKey === key;
    const edge = result.margin;
    const main = `<tr><td class="ev-value">${signed(edge)}</td><td><strong>${esc(a.event)}</strong><small>${esc(a.sport)} · ${a.live ? 'Live entries' : 'Pregame'} · ${age(a.ts)}</small></td><td><strong>${esc(a.market)}</strong><small>${fmtLine(a.line)}</small></td><td><div class="ev-price-box"><strong>${esc(a.side)} ${fmtLine(a.line)}</strong><span>${esc(a.book)} · ${oddsLabel(a.odds)}</span></div></td><td><div class="ev-price-box"><strong>${esc(b.side)} ${fmtLine(b.line)}</strong><span>${esc(b.book)} · ${oddsLabel(b.odds)}</span></div></td><td>${money(result.stakes[0])} / ${money(result.stakes[1])}<small>Total ${money(totalStake)}</small></td><td class="ev-positive"><strong>${money(result.profit)}</strong><small>${signed(edge)} ROI</small></td><td><button type="button" class="ev-expand-button" data-arb-expand="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(a.event)} arbitrage">${open ? '⌃' : '⌄'}</button></td></tr>`;
    if (!open) return [main];
    const historyLine = q => state.history.filter(h => h.quoteId === q.id).slice(-4).map(h => oddsLabel(h.odds)).join(' → ') || oddsLabel(q.odds);
    const expanded = `<tr class="ev-expanded-row"><td colspan="8"><div class="ev-expanded-grid ev-arb-detail">
      <section><h3>Side A · ${esc(a.side)}</h3><div class="ev-price-box"><strong>${esc(a.book)}</strong><span>${oddsLabel(a.odds)}</span></div><label>Stake (USD)<input id="ev-bankroll" type="number" min="1" max="${bankroll}" step="0.01" value="${esc(stake)}"></label><p>Allocated ${money(result.stakes[0])} · Return ${money(result.stakes[0] * decimal(a.odds))}</p></section>
      <section><h3>Side B · ${esc(b.side)}</h3><div class="ev-price-box"><strong>${esc(b.book)}</strong><span>${oddsLabel(b.odds)}</span></div><p>Allocated ${money(result.stakes[1])} · Return ${money(result.stakes[1] * decimal(b.odds))}</p></section>
      <section class="ev-arb-profit"><h3>Calculated arbitrage</h3><span>Equalized profit</span><strong>${money(result.profit)}</strong><span>${signed(edge)} ROI · ${money(totalStake)} total stake</span><p>Assumes both prices accept the full stake and settle as a two-outcome market.</p></section>
    </div><div class="ev-arb-history"><strong>Recorded price movement</strong><span>${esc(a.side)} (${esc(a.book)}) <b>${historyLine(a)}</b></span><span>${esc(b.side)} (${esc(b.book)}) <b>${historyLine(b)}</b></span><small>Edits add timestamped snapshots; these are entered prices, not a live feed.</small></div><p class="ev-caption">${live ? 'Only live entries under 90 seconds old are included. ' : ''}Confirm both quotes and limits before acting.</p></td></tr>`;
    return [main, expanded];
  });
  return `<div class="ev-stack ev-arb-screen">${rows.length ? '<p class="ev-swipe-hint">Scroll sideways to inspect both sides and stake split →</p>' + table(['Edge','Event','Market','Side A (book / odds)','Side B (book / odds)','Stake split (A / B)','Calculated profit',''],rows) : empty('No arbitrage in these entries', 'Add opposing prices at different books with a combined implied probability below 100%.')}<p class="ev-caption ev-method-note">Stake split equalizes the return from either side. Amounts are calculations from entered prices; they are not verified offers.</p></div>`;
}

function renderMiddles() {
  const rows = [false, true].flatMap(mode => middleRows(quotes(), mode));
  return `<div class="ev-stack"><div class="ev-calculator"><label>Total outlay<input id="ev-bankroll" type="number" min="1" step="0.01" value="${esc(stake)}"></label><div class="ev-result">Stake split equalizes the one-win outcomes. The middle payoff assumes both bets win; exact settlement depends on integer and push rules.</div></div>${rows.length ? table(['Market / window', 'Side A', 'Side B', 'Outcomes'], rows.map(x => { const plan = arbitrage([x.over,x.under], Number(stake)); return `<tr><td><strong>${esc(x.over.event)}</strong><small>${esc(x.over.market)} · ${x.over.live ? 'Live' : 'Pregame'} · ${esc(x.window)}</small></td><td>${esc(x.over.side)} ${fmtLine(x.over.line)} ${oddsCell(x.over)}<small>Stake ${money(plan.stakes[0])}</small></td><td>${esc(x.under.side)} ${fmtLine(x.under.line)} ${oddsCell(x.under)}<small>Stake ${money(plan.stakes[1])}</small></td><td>One wins: <strong class="${plan.profit >= 0 ? 'ev-positive' : 'ev-negative'}">${money(plan.profit)}</strong><small>Both win: ${money(plan.stakes[0] * (decimal(x.over.odds) - 1) + plan.stakes[1] * (decimal(x.under.odds) - 1))}</small></td></tr>`; })) : empty('No middles', 'Add a lower Over and higher Under total, or opposing spread lines with a winning margin window.')}</div>`;
}

function renderHolds() {
  const rows = [false, true].flatMap(mode => holdRows(quotes(), mode));
  return `<div class="ev-stack">${rows.length ? table(['Market', 'Best side A', 'Best side B', 'Hold'], rows.map(x => `<tr><td><strong>${esc(x.best[0].event)}</strong><small>${esc(x.best[0].market)} · ${fmtLine(x.best[0].line)} · ${x.best[0].live ? 'Live' : 'Pregame'}</small></td>${x.best.map(q => `<td>${esc(q.side)} ${oddsCell(q)}</td>`).join('')}<td data-num class="${x.hold < 0 ? 'ev-positive' : ''}">${signed(x.hold)}</td></tr>`)) : empty('No two-sided markets', 'Enter both sides of a market to measure its hold.')}<p class="ev-caption">Hold = implied probability of best side A + implied probability of best side B − 100%. Negative hold is a potential arbitrage before execution constraints.</p></div>`;
}

function renderPromo() {
  const outcome = promoConversion(promoInput);
  const paired = groups(quotes()).flatMap(rows => rows.length >= 2 ? rows.filter(fresh).map(q => ({ q, opposite: rows.filter(x => x.side !== q.side && x.book !== q.book && fresh(x)).sort((a,b) => decimal(b.odds)-decimal(a.odds))[0] })).filter(x => x.opposite) : []).slice(0, 12);
  return `<div class="ev-stack"><div class="ev-calculator"><label>Promotion type<select data-promo="kind"><option value="bonus" ${promoInput.kind === 'bonus' ? 'selected' : ''}>Bonus bet (stake not returned)</option><option value="boost" ${promoInput.kind === 'boost' ? 'selected' : ''}>Odds boost (cash stake)</option></select></label><label>Promo value / cash stake<input data-promo="stake" type="number" min="0.01" step="0.01" value="${esc(promoInput.stake)}"></label><label>Profit boost %<input data-promo="boost" type="number" min="0" step="0.1" value="${esc(promoInput.boost)}"></label><label>Promotion odds (American)<input data-promo="promoOdds" type="number" step="1" value="${esc(promoInput.promoOdds)}"></label><label>Hedge odds (American)<input data-promo="hedgeOdds" type="number" step="1" value="${esc(promoInput.hedgeOdds)}"></label><div class="ev-result">${outcome ? `Hedge <strong>${money(outcome.hedge)}</strong> · Promo side wins: <strong>${money(outcome.ifPromoWins)}</strong> · Hedge side wins: <strong>${money(outcome.ifHedgeWins)}</strong>${promoInput.kind === 'bonus' ? ` · Bonus conversion: <strong>${percent(outcome.conversion)}</strong>` : ''}` : 'Enter a positive stake and valid American odds.'}</div></div><h3 class="ev-section-title">Use entered market prices</h3>${paired.length ? table(['Promotion side', 'Hedge side', 'Use'], paired.map(({q,opposite}) => `<tr><td>${esc(qName(q))}<small>${esc(q.book)} ${oddsLabel(q.odds)}</small></td><td>${esc(opposite.side)}<small>${esc(opposite.book)} ${oddsLabel(opposite.odds)}</small></td><td>${button('Load prices', `data-promo-pair="${esc(q.id)}" data-hedge="${esc(opposite.id)}"`)}</td></tr>`)) : empty('No paired prices', 'Enter both sides of a market to load a hedge.')}</div>`;
}

function renderParlay() {
  const selected = parlayIds.map(id => state.quotes.find(q => q.id === id)).filter(Boolean);
  const legs = selected.map(q => ({ ...q, probability: fairProbability(q, groups(state.quotes).find(g => g.some(x => x.id === q.id)) || []) }));
  const result = parlay(legs);
  const options = evRows(quotes(), false);
  return `<div class="ev-stack"><div class="ev-card"><h3>Selected legs</h3>${selected.length ? `<div class="ev-list">${legs.map(q => `<div class="ev-list-item"><div><strong>${esc(qName(q))}</strong><span> ${esc(q.book)} ${oddsLabel(q.odds)} · Fair ${percent(q.probability)} · Leg EV ${signed(expectedReturn(q.probability, q.odds))}</span></div>${button('Remove', `data-parlay-remove="${esc(q.id)}"`)}</div>`).join('')}</div>` : '<p>Choose legs below. Use one sportsbook and different events for an actionable parlay estimate.</p>'}<div class="ev-card-footer">${result && Number.isFinite(result.ev) && new Set(selected.map(q => q.book)).size === 1 ? `<span class="ev-chip">Combined decimal ${result.payout.toFixed(2)}</span><span class="ev-chip">Fair chance ${percent(result.probability)}</span><span class="ev-chip">EV ${signed(result.ev)}</span>` : '<span class="ev-warning">A total requires complete market pairs, one book and different events.</span>'}</div></div>${options.length ? table(['Available leg', 'Book', 'Fair chance', 'Leg EV', ''], options.map(({quote:q,fair,ev}) => `<tr><td>${esc(qName(q))}</td><td>${esc(q.book)} ${oddsLabel(q.odds)}</td><td data-num>${percent(fair)}</td><td data-num class="${ev > 0 ? 'ev-positive' : ''}">${signed(ev)}</td><td class="ev-actions">${button(parlayIds.includes(q.id) ? 'Remove' : 'Add leg', `data-parlay="${esc(q.id)}"`)}</td></tr>`)) : empty('No eligible legs', 'Enter pregame prices on both sides at two books.') }<p class="ev-caption">Multiplying probabilities assumes independent legs. Same-event combinations are excluded; book parlay rules and repricing can change the actual offer.</p></div>`;
}

function renderSharp() {
  const threshold = Number(localStorage.getItem('sportslab-ev-sharp-min') || 1000);
  const matches = sharpMatches(quotes(), threshold).filter(x => (!marketType || x.exchange.type === marketType) && (!bookmaker || [x.exchange.book,x.sportsbook.book].includes(bookmaker)));
  if (!expandedSharpKey && matches.length) expandedSharpKey = matches[0].exchange.id;
  const rows = matches.flatMap(x => {
    const q = x.exchange, key = q.id, peers = groups(state.quotes).find(g => g.some(item => item.id === q.id)) || [];
    const comparisons = peers.filter(item => !item.exchange && item.side === x.sportsbook.side);
    const average = comparisons.length ? probabilityToAmerican(comparisons.reduce((sum,item)=>sum+implied(item.odds),0)/comparisons.length) : NaN;
    const open = expandedSharpKey === key;
    const main = `<tr><td class="ev-value">${money(x.liquidity)}</td><td><strong>${esc(q.market)}</strong><small>${fmtLine(q.line)}</small></td><td><strong>${esc(q.event)}</strong><small>${esc(q.sport)} · ${age(q.ts)}</small></td><td><strong>${esc(q.side)} ${fmtLine(q.line)}</strong><small>${esc(q.book)} · exchange entry</small></td><td>${oddsLabel(q.odds)}</td><td>${comparisons.length ? comparisons.map(item=>oddsLabel(item.odds)).join(' · ') : '—'}</td><td>${Number.isFinite(average) ? oddsLabel(average) : '—'}</td><td class="ev-positive"><strong>${oddsLabel(x.sportsbook.odds)}</strong><small>${esc(x.sportsbook.book)}</small></td><td><button type="button" class="ev-expand-button" data-sharp-expand="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(q.event)} market details">${open ? '⌃' : '⌄'}</button></td></tr>`;
    if (!open) return [main];
    const snapshotCount = state.history.filter(h => h.quoteId === q.id).length;
    const detail = `<tr class="ev-expanded-row"><td colspan="9"><div class="ev-expanded-grid ev-sharp-detail"><section><h3>Market details</h3><div class="ev-detail-facts"><div><strong>${esc(q.side)} ${fmtLine(q.line)}</strong><span>Exchange offer · ${oddsLabel(q.odds)}</span></div><div><strong>${esc(x.sportsbook.side)} ${fmtLine(x.sportsbook.line)}</strong><span>Best entered book · ${oddsLabel(x.sportsbook.odds)}</span></div></div></section><section><h3>Bookmaker prices</h3><div class="ev-mini-ledger">${peers.slice(0,12).map(item=>`<div><span>${esc(item.book)}</span><span>${esc(item.side)}</span><strong>${oddsLabel(item.odds)}</strong></div>`).join('')}</div></section><section><h3>Liquidity</h3><div class="ev-liquidity-bar"><span style="width:100%"></span></div><p>Entered exchange liquidity <strong>${money(x.liquidity)}</strong></p><p>${snapshotCount} recorded ${snapshotCount === 1 ? 'snapshot' : 'snapshots'} · ${age(q.ts)}</p><p>${Number.isFinite(x.improvement) ? 'Opposite book payout is ' + percent(x.improvement) + ' above the exchange comparison.' : 'No exchange benchmark available.'}</p></section></div></td></tr>`;
    return [main,detail];
  });
  return `<div class="ev-stack ev-sharp-screen">${rows.length ? '<p class="ev-swipe-hint">Scroll sideways to compare exchange and sportsbook prices →</p>' + table(['Opp. liquidity','Market','Event','Exchange offering','Exchange odds','Comparison odds','Avg. price','Best price',''],rows) : empty('No matching exchange and book prices', 'Enter an exchange offer with liquidity and a better opposite sportsbook price at the same line.')}<p class="ev-caption ev-method-note">This view compares entered liquidity and prices. It does not identify verified sharp action or stream live market activity.</p></div>`;
}

function renderFantasy() {
  const entries = dfs().filter(item => (!bookmaker || item.app === bookmaker) && (!marketType || item.market === marketType));
  const platformNames = [...new Set(entries.map(item => item.app))];
  const platforms = [...new Set([...platformNames, 'PrizePicks','Underdog Fantasy','Sleeper Picks'])].slice(0,4);
  const grouped = new Map();
  for (const item of entries) {
    const key = [item.player,item.market,item.event,item.side].join('|');
    if (!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(item);
  }
  const rows = [...grouped.values()].sort((a,b)=>a[0].player.localeCompare(b[0].player)).map(group => {
    const first = group[0], pick = group.reduce((best,item)=>Number(item.probability)>Number(best.probability)?item:best,first);
    const bestLine = first.side === 'Under' ? Math.max(...group.map(item=>Number(item.line))) : Math.min(...group.map(item=>Number(item.line)));
    const appCells = platforms.map(app => {
      const item = group.filter(entry => entry.app === app).sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts))[0];
      return `<td>${item ? `<button type="button" class="ev-dfs-line ${Number(item.line) === bestLine ? 'is-best' : ''}" data-edit="dfs" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.app)} ${esc(item.player)} prop"><strong>${esc(item.side)} ${fmtLine(item.line)}</strong><small>${percent(Number(item.probability))} estimated</small></button>` : '<span class="ev-odds-missing">—</span>'}</td>`;
    }).join('');
    return `<tr><td class="ev-value">${percent(Number(pick.probability))}</td><td><strong>${esc(first.player)}</strong><small>${esc(first.sport || 'Sport not entered')} · ${age(first.ts)}</small></td><td><strong>${esc(first.event || 'Matchup not entered')}</strong></td><td><strong>${esc(first.market)}</strong></td><td>${esc(first.side)} ${fmtLine(first.line)}</td>${appCells}<td class="ev-actions"><button type="button" data-fantasy="${esc(pick.id)}">Add to slip</button><button type="button" data-edit="dfs" data-id="${esc(pick.id)}">Edit</button></td></tr>`;
  });
  return `<div class="ev-stack ev-dfs-screen">${rows.length ? '<p class="ev-swipe-hint">Scroll sideways to compare DFS platforms →</p>' + table(['Est. hit','Player','Matchup','Prop','Pick',...platforms.map(esc),'Actions'],rows) : empty('No DFS props entered', 'Add a player prop, pick, platform and estimated hit probability to compare lines.')}<p class="ev-caption ev-method-note">Hit rates are entered estimates, not verified projections or expected value. A highlighted line is the most favorable entered line for the selected Over or Under; payout rules live in the slip builder.</p></div>`;
}

function renderOptimizer() {
  const rows = dfs();
  const combos = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].app !== rows[j].app || rows[i].player === rows[j].player) continue;
    const rules = state.paytables[rows[i].app]?.['2'];
    if (!Array.isArray(rules) || rules.length !== 3) continue;
    const result = fantasySlip([rows[i],rows[j]], rules);
    if (result) combos.push({ a: rows[i], b: rows[j], ...result });
  }
  combos.sort((a,b) => b.ev-a.ev);
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Eligible combinations', combos.length)}${metric('Best projected EV', combos.length ? signed(combos[0].ev) : '—', combos[0]?.ev > 0 ? 'positive' : '')}${metric('Apps', new Set(rows.map(x => x.app)).size)}${metric('Model', 'Independent')}</div>${combos.length ? table(['App', 'Pick 1', 'Pick 2', 'Full-hit chance', 'Projected EV', ''], combos.map(x => `<tr><td>${esc(x.a.app)}</td><td>${esc(x.a.player)} ${esc(x.a.side)} ${fmtLine(x.a.line)}<small>${percent(x.a.probability)}</small></td><td>${esc(x.b.player)} ${esc(x.b.side)} ${fmtLine(x.b.line)}<small>${percent(x.b.probability)}</small></td><td data-num>${percent(x.dist[2])}</td><td data-num class="${x.ev > 0 ? 'ev-positive' : 'ev-negative'}">${signed(x.ev)}</td><td>${button('Build slip', `data-optimize="${esc(x.a.id)},${esc(x.b.id)}"`)}</td></tr>`)) : empty('No eligible combinations', 'Add at least two picks from the same app and set its two-pick payout rule.') }<p class="ev-caption">Rankings use the saved exact-hit payout table and assume independent picks. They exclude platform limits and fees.</p></div>`;
}

function renderSlip() {
  const apps = [...new Set(dfs().map(x => x.app))];
  if (!fantasyApp || !apps.includes(fantasyApp)) fantasyApp = apps[0] || '';
  const options = dfs().filter(x => x.app === fantasyApp);
  fantasyIds = fantasyIds.filter(id => options.some(x => x.id === id));
  const selected = fantasyIds.map(id => options.find(x => x.id === id)).filter(Boolean);
  const rules = state.paytables[fantasyApp]?.[String(selected.length)] || [];
  const result = selected.length >= 2 && rules.length === selected.length + 1 ? fantasySlip(selected, rules, Number(fantasyStake)) : null;
  return `<div class="ev-stack"><div class="ev-calculator"><label>Fantasy app<select id="ev-fantasy-app">${apps.map(app => `<option value="${esc(app)}" ${app === fantasyApp ? 'selected' : ''}>${esc(app)}</option>`).join('')}</select></label><label>Entry amount<input id="ev-fantasy-stake" type="number" min="0.01" step="0.01" value="${esc(fantasyStake)}"></label><div class="ev-result">${result ? `Expected return <strong>${money(result.payout * fantasyStake)}</strong> · Expected profit <strong>${money(result.expectedProfit)}</strong> · EV <strong>${signed(result.ev)}</strong>` : selected.length < 2 ? 'Select at least two picks from one app to calculate a slip.' : 'Set and save this entry size’s payout rules to calculate a slip.'}</div></div><div class="ev-card"><h3>Selected picks (${selected.length})</h3><div class="ev-chip-row">${selected.map(x => `<span class="ev-chip">${esc(x.player)} ${esc(x.side)} ${fmtLine(x.line)} · ${percent(x.probability)} ${button('×', `data-fantasy="${esc(x.id)}" aria-label="Remove ${esc(x.player)}"`)}</span>`).join('') || '<p>Select picks below.</p>'}</div></div>${selected.length >= 2 ? `<div class="ev-card"><h3>Payout rules · exact hits</h3><p>Enter the total return multiplier for each exact hit count, including returned stake. Zero means no payout.</p><div class="ev-fields">${Array.from({length:selected.length+1},(_,hits) => `<label>${hits} of ${selected.length} hits<input data-pay-hits="${hits}" type="number" min="0" step="0.01" value="${Number(rules[hits] || 0)}"></label>`).join('')}</div><div class="ev-card-footer">${button('Save payout rules', 'id="ev-save-paytable"')}</div>${result ? `<div class="ev-chip-row">${result.dist.map((p,i) => `<span class="ev-chip">${i} hits ${percent(p)} · ${Number(rules[i] || 0)}×</span>`).join('')}</div>` : ''}</div>` : ''}${options.length ? table(['Player', 'Prop', 'Estimate', ''], options.map(x => `<tr><td>${esc(x.player)}</td><td>${esc(x.side)} ${fmtLine(x.line)} ${esc(x.market)}</td><td data-num>${percent(x.probability)}</td><td>${button(fantasyIds.includes(x.id) ? 'Remove' : 'Add pick', `data-fantasy="${esc(x.id)}"`)}</td></tr>`)) : empty('No props at this app', 'Add DFS props to build a slip.')}<p class="ev-caption">The payout distribution uses independent Bernoulli picks. Pushes, ties, correlated picks and app-specific settlement exceptions require manual adjustment to the payout rules.</p></div>`;
}

function renderFantasyAlerts() {
  const rules = state.alerts.filter(x => x.kind === 'fantasy-new');
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack"><div class="ev-card"><h3>New prop watches</h3><p>Newly entered DFS props trigger a local alert when their market and minimum hit rate match.</p>${rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${esc(r.market || 'Any market')}</strong><span> Minimum hit rate ${r.threshold || 0}% · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : '<p>No DFS alert rules yet.</p>'}</div><h3 class="ev-section-title">Alert activity</h3>${renderNotifications(notes)}</div>`;
}

function renderNotifications(notes) {
  return notes.length ? `<div class="ev-list">${notes.map(x => `<div class="ev-list-item"><div><strong>${esc(x.message)}</strong><span> ${new Date(x.ts).toLocaleString()} ${x.read ? '· Read' : '· New'}</span></div>${button('Dismiss', `data-notification-dismiss="${esc(x.id)}"`)}</div>`).join('')}</div>` : empty('No alerts fired', 'Matching new entries will appear here after you add or update data.');
}

function renderPrediction() {
  const contracts = state.contracts.filter(x => visible(x, ['event', 'platform']));
  const contractIds = new Set(contracts.map(x => x.id));
  const names = [...new Set([...state.traders.filter(x => contractIds.has(x.contractId)).map(x => x.name), ...state.trades.filter(x => contractIds.has(x.contractId)).map(x => x.trader)])];
  if (!traderName || !names.includes(traderName)) traderName = names[0] || '';
  const positions = state.traders.filter(x => x.name === traderName && contractIds.has(x.contractId));
  const trades = state.trades.filter(x => x.trader === traderName && contractIds.has(x.contractId));
  return `<div class="ev-stack"><div class="ev-card"><h3>Prediction contracts</h3><p>Bid and ask are cents per $1 of settlement. Each contract edit records an order book snapshot.</p><div class="ev-card-footer">${action('Add contract', 'contract')}${action('Add position', 'trader')}${action('Add trade', 'trade')}</div></div>${contracts.length ? table(['Platform / contract', 'Bid', 'Ask', 'Spread', 'Depth', 'History', ''], contracts.map(c => { const snapshots = state.contractHistory.filter(h => h.contractId === c.id); return `<tr><td><strong>${esc(c.event)}</strong><small>${esc(c.platform)} · ${origin(c)}</small></td><td data-num>${Number(c.bid).toFixed(0)}¢</td><td data-num>${Number(c.ask).toFixed(0)}¢</td><td data-num>${(Number(c.ask)-Number(c.bid)).toFixed(0)}¢</td><td data-num>${Number(c.volume).toLocaleString()} contracts</td><td>${snapshots.length} snapshots<small>${age(c.ts)}</small></td><td class="ev-actions">${button('Edit', `data-edit="contract" data-id="${esc(c.id)}"`)}</td></tr>`; })) : empty('No prediction contracts', 'Add bids, asks and available depth for a market.')}<h3 class="ev-section-title">Order book history</h3>${state.contractHistory.length ? table(['Observed', 'Contract', 'Bid', 'Ask', 'Depth'], state.contractHistory.slice().reverse().slice(0,100).map(h => `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c => c.id === h.contractId)?.event || 'Contract missing')}</td><td data-num>${Number(h.bid)}¢</td><td data-num>${Number(h.ask)}¢</td><td data-num>${Number(h.volume).toLocaleString()}</td></tr>`)) : empty('No order book snapshots', 'Editing a contract will record its bid, ask and depth.')}<div class="ev-calculator"><label>Trader<select id="ev-trader-filter">${names.map(name => `<option value="${esc(name)}" ${name === traderName ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><div class="ev-result">Position mark uses the current executable bid for a Yes holding and 100 − ask for a No holding. It excludes fees and partial fills.</div></div><h3 class="ev-section-title">Positions</h3>${positions.length ? table(['Contract', 'Side', 'Quantity', 'Entry', 'Mark / unrealized P&L', ''], positions.map(p => { const c = state.contracts.find(x => x.id === p.contractId); const mark = c ? p.side === 'No' ? 100 - Number(c.ask) : Number(c.bid) : NaN; const profit = Number.isFinite(mark) ? (mark - Number(p.entry)) * Number(p.quantity) / 100 : NaN; return `<tr><td>${esc(c?.event || 'Contract missing')}</td><td>${esc(p.side)}</td><td data-num>${Number(p.quantity)}</td><td data-num>${Number(p.entry)}¢</td><td data-num class="${profit >= 0 ? 'ev-positive' : 'ev-negative'}">${Number.isFinite(mark) ? mark + '¢' : '—'}<small>${money(profit)}</small></td><td class="ev-actions">${button('Edit', `data-edit="trader" data-id="${esc(p.id)}"`)}</td></tr>`; })) : empty('No positions for this trader', 'Add a position to track mark-to-market value.')}<h3 class="ev-section-title">Trade history</h3>${trades.length ? table(['Time', 'Contract', 'Side', 'Quantity', 'Price', ''], trades.map(t => `<tr><td>${new Date(t.ts).toLocaleString()}</td><td>${esc(state.contracts.find(x => x.id === t.contractId)?.event || 'Contract missing')}</td><td>${esc(t.side)}</td><td data-num>${Number(t.quantity)}</td><td data-num>${Number(t.price)}¢</td><td class="ev-actions">${button('Edit', `data-edit="trade" data-id="${esc(t.id)}"`)}</td></tr>`)) : empty('No trades for this trader', 'Record buys and sells to keep a trade history.')}</div>`;
}

function renderTracker() {
  const rows = state.bets.filter(x => visible(x, ['selection', 'book']));
  const graded = rows.map(gradedBet).filter(Number.isFinite);
  const net = graded.reduce((a,b) => a+b,0);
  const risked = rows.filter(x => Number.isFinite(gradedBet(x))).reduce((a,x) => a+Number(x.stake),0);
  const clvs = rows.map(x => closingLineValue(x.odds,x.closeOdds)).filter(Number.isFinite);
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Tracked bets', rows.length)}${metric('Settled P&L', money(net), net > 0 ? 'positive' : '')}${metric('ROI', risked ? signed(net/risked) : '—')}${metric('Avg. CLV', clvs.length ? signed(clvs.reduce((a,b)=>a+b,0)/clvs.length) : '—')}</div>${rows.length ? table(['Date / selection', 'Book', 'Stake', 'Booked → close', 'CLV', 'Result / P&L', ''], rows.map(b => { const clv = closingLineValue(b.odds,b.closeOdds), profit = gradedBet(b); return `<tr><td><strong>${esc(b.selection)}</strong><small>${esc(b.date)}</small></td><td>${esc(b.book)}</td><td data-num>${money(Number(b.stake))}</td><td>${oddsLabel(b.odds)} → ${b.closeOdds ? oddsLabel(b.closeOdds) : '—'}</td><td data-num class="${clv > 0 ? 'ev-positive' : ''}">${signed(clv)}</td><td>${esc(b.result)}<small>${money(profit)}</small></td><td class="ev-actions">${button('Edit', `data-edit="bet" data-id="${esc(b.id)}"`)}</td></tr>`; })) : empty('No bets tracked here', 'Add a bet and enter its closing price and final result to measure CLV and P&L.')}<p class="ev-caption">CLV = booked decimal odds ÷ closing decimal odds − 1. Compare only the same side, line and settlement rules. Open bets do not count toward ROI.</p></div>`;
}

function renderTrends() {
  const rows = state.results.filter(x => visible(x, ['player', 'market', 'game']));
  const profiles = [...new Set(rows.map(x => `${x.player}|${x.market}|${x.line}`))];
  const options = [...new Set(rows.map(x => x.player + '|' + x.market))];
  if (!options.includes(trendA)) trendA = options[0] || '';
  if (!options.includes(trendB)) trendB = options[1] || '';
  const left = rows.filter(x => x.player + '|' + x.market === trendA);
  const right = rows.filter(x => x.player + '|' + x.market === trendB);
  const paired = left.flatMap(a => right.filter(b => b.game === a.game).map(b => [Number(a.result),Number(b.result)]));
  const correlation = pearson(paired);
  return `<div class="ev-stack">${profiles.length ? table(['Player / prop', 'Last 5', 'Last 10', 'All recorded', 'Results'], profiles.map(key => { const [player,market,line] = key.split('|'); const games = rows.filter(x => `${x.player}|${x.market}|${x.line}` === key).sort((a,b) => b.date.localeCompare(a.date)); const rate = n => percent(games.slice(0,n).filter(x => Number(x.result) > Number(x.line)).length / Math.min(n,games.length)); return `<tr><td><strong>${esc(player)}</strong><small>${esc(market)} · Over ${esc(line)}</small></td><td data-num>${rate(5)}<small>${Math.min(5,games.length)} games</small></td><td data-num>${rate(10)}<small>${Math.min(10,games.length)} games</small></td><td data-num>${rate(games.length)}<small>${games.length} games</small></td><td><div class="ev-mini-bars" aria-label="Recent results">${games.slice(0,10).reverse().map(g => `<i title="${esc(g.game)}: ${esc(g.result)}" style="height:${Math.max(5, Math.min(100, Number(g.result)/Number(g.line)*65))}%"></i>`).join('')}</div></td></tr>`; })) : empty('No player results', 'Add game results to calculate recent hit rates and correlations.')}<div class="ev-card"><h3>Paired-game correlation</h3><div class="ev-fields"><label>First prop<select id="ev-trend-a">${options.map(x => `<option value="${esc(x)}" ${x === trendA ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><label>Second prop<select id="ev-trend-b">${options.map(x => `<option value="${esc(x)}" ${x === trendB ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><div class="ev-result">${Number.isFinite(correlation) ? `Pearson r <strong>${correlation.toFixed(2)}</strong> across ${paired.length} matching game IDs` : `Need at least three matching game IDs with variation in both results. Currently ${paired.length}.`}</div></div></div><p class="ev-caption">Recent hit rates describe entered historical games. They do not estimate a future hit probability; correlation is descriptive and needs aligned game IDs.</p></div>`;
}

function renderLineAlerts() {
  const all = state.history.filter(h => !search || ['event','market','book','side'].some(k => filterText(h[k]))).sort((a,b) => b.ts.localeCompare(a.ts));
  const rules = state.alerts.filter(x => x.kind !== 'fantasy-new');
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack"><div class="ev-card"><h3>Price and EV watches</h3><p>Alerts fire in this browser when a newly saved or imported record meets a threshold. They do not poll sportsbooks.</p><div class="ev-card-footer">${action('New price, EV or movement alert', 'alert')}</div>${rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${r.kind === 'ev' ? 'EV at least ' + r.threshold + '%' : r.kind === 'movement' ? 'Line change at least ' + r.threshold : 'American price at least ' + oddsLabel(r.threshold)}</strong><span> ${esc(r.sport || 'All sports')} · ${esc(r.event || 'Any event')} · ${esc(r.market || 'Any market')} · ${r.liveOnly ? 'Live only' : 'All'} · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : '<p>No price watches saved.</p>'}</div><h3 class="ev-section-title">Alert activity</h3>${renderNotifications(notes)}<h3 class="ev-section-title">Recorded line movement</h3>${all.length ? table(['Time', 'Market', 'Book', 'Side', 'Line', 'Price', 'Change'], all.slice(0,200).map(h => { const sequence = state.history.filter(x => x.quoteId === h.quoteId), index = sequence.findIndex(x => x.id === h.id), prior = sequence[index-1]; return `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(h.event)}<small>${esc(h.market)}</small></td><td>${esc(h.book)}</td><td>${esc(h.side)}</td><td data-num>${fmtLine(h.line)}</td><td data-num>${oddsLabel(h.odds)}</td><td>${prior ? `${oddsLabel(prior.odds)} → ${oddsLabel(h.odds)}${String(prior.line) !== String(h.line) ? ` · line ${fmtLine(prior.line)} → ${fmtLine(h.line)}` : ''}` : 'First entry'}</td></tr>`; })) : empty('No movement recorded', 'Saving a new or edited price creates a timestamped snapshot.')}</div>`;
}

const FIELDS = {
  quote: [
    ['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']], ['event','Event / game','text',true], ['market','Market name','text',true],
    ['type','Market type','select',true,[['game','Two-way game line'],['three-way','Three-way game line'],['spread','Spread'],['total','Total'],['prop','Player prop'],['alternate','Alternate line'],['future','Future']]], ['outcomes','Exhaustive outcomes (multiway)','number',false], ['line','Line','text',false], ['side','Side / selection','text',true],
    ['book','Sportsbook / exchange','text',true], ['odds','American odds','number',true], ['live','In game quote','checkbox',false],
    ['exchange','Exchange offer','checkbox',false], ['liquidity','Available liquidity ($)','number',false], ['ts','Observed at','datetime-local',true]
  ],
  dfs: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['event','Event / game','text',false],['player','Player','text',true],['market','Prop market','text',true],['line','Line','number',true],['side','Pick','select',true,['Over','Under']],['app','Fantasy app','text',true],['probability','Estimated hit probability (0–1)','number',true]],
  contract: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['platform','Platform','text',true],['event','Contract / event','text',true],['bid','Best Yes bid (¢)','number',true],['ask','Best Yes ask (¢)','number',true],['last','Last price (¢)','number',false],['volume','Available depth (contracts)','number',true]],
  trader: [['name','Trader name','text',true],['platform','Platform','text',true],['contractId','Contract','contract',true],['side','Position side','select',true,['Yes','No']],['quantity','Contracts held','number',true],['entry','Entry price (¢)','number',true]],
  trade: [['trader','Trader name','text',true],['contractId','Contract','contract',true],['side','Trade side','select',true,['Buy Yes','Sell Yes','Buy No','Sell No']],['quantity','Quantity','number',true],['price','Price (¢)','number',true],['ts','Executed at','datetime-local',true]],
  bet: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['date','Date placed','date',true],['selection','Selection / exact line','text',true],['book','Sportsbook','text',true],['stake','Stake ($)','number',true],['odds','Booked American odds','number',true],['closeOdds','Closing American odds','number',false],['result','Result','select',true,['open','win','loss','push','void']]],
  result: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['date','Game date','date',true],['game','Game ID / matchup','text',true],['player','Player','text',true],['market','Prop market','text',true],['line','Prop line','number',true],['result','Recorded result','number',true]],
  alert: [['sport','Sport','select',false,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['kind','Alert type','select',true,[['price','Price at or better'],['ev','Estimated EV at or above'],['movement','Line move at least'],['fantasy-new','New fantasy prop']]],['event','Event contains','text',false],['market','Market contains','text',false],['threshold','Threshold (odds, line points or %)','number',true],['liveOnly','Live quotes only','checkbox',false]]
};
const formTitles = { quote:'market price', dfs:'fantasy prop', contract:'prediction contract', trader:'trader position', trade:'trade', bet:'tracked bet', result:'player result', alert:'alert rule' };
const collection = { quote:'quotes', dfs:'dfs', contract:'contracts', trader:'traders', trade:'trades', bet:'bets', result:'results', alert:'alerts' };
function dateInput(value) { const d = value ? new Date(value) : new Date(); return Number.isFinite(d.getTime()) ? new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16) : ''; }
function fieldMarkup(field, item) {
  const [name,label,type,required,options] = field;
  const value = item[name] ?? '';
  if (type === 'checkbox') return `<label><input name="${name}" type="checkbox" ${value ? 'checked' : ''}>${esc(label)}</label>`;
  if (type === 'select' || type === 'contract') {
    const values = type === 'contract' ? state.contracts.map(c => [c.id, `${c.platform}: ${c.event}`]) : options.map(x => Array.isArray(x) ? x : [x,x]);
    return `<label>${esc(label)}<select name="${name}" ${required ? 'required' : ''}><option value="">${name === 'sport' && !required ? 'All sports' : 'Choose…'}</option>${values.map(([key,text]) => `<option value="${esc(key)}" ${String(value) === String(key) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  }
  const adjusted = type === 'datetime-local' ? dateInput(value) : value;
  const attributes = type === 'number' ? `step="${['odds','closeOdds','threshold'].includes(name) ? '1' : 'any'}"` : '';
  return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(adjusted)}" ${required ? 'required' : ''} ${attributes} ${type === 'text' ? 'maxlength="180"' : ''}></label>`;
}
function openForm(type, id = null, presets = {}) {
  const old = id ? state[collection[type]].find(x => x.id === id) : null;
  const item = { sport: sport || 'NFL', type:'game', side:'Over', live:false, exchange:false, liquidity:0, probability:.5, date:new Date().toISOString().slice(0,10), result:'open', kind:'price', threshold:0, enabled:true, ...old, ts:now(), ...presets };
  editing = { type, id };
  $('#ev-dialog-title').textContent = `${old ? 'Edit' : 'Add'} ${formTitles[type]}`;
  $('#ev-form-fields').innerHTML = `<div class="ev-fields">${FIELDS[type].map(field => fieldMarkup(field,item)).join('')}</div>`;
  $('#ev-form-error').hidden = true;
  $('#ev-delete').hidden = !old;
  $('#ev-dialog').showModal();
  $('#ev-form-fields').querySelector('input:not([type=checkbox]),select')?.focus();
}
function failForm(message) { const node = $('#ev-form-error'); node.textContent = message; node.hidden = false; node.focus(); }
function parseForm() {
  const form = $('#ev-form');
  if (!form.checkValidity()) { form.reportValidity(); return null; }
  const item = {};
  for (const [name,,type] of FIELDS[editing.type]) {
    const field = form.elements[name];
    item[name] = type === 'checkbox' ? field.checked : type === 'number' ? (field.value === '' ? '' : Number(field.value)) : type === 'datetime-local' ? new Date(field.value).toISOString() : field.value.trim();
  }
  if (editing.type === 'quote' && !Number.isFinite(decimal(item.odds))) return failForm('Enter valid American odds: +100 or higher, or −100 or lower.'), null;
  if (editing.type === 'quote' && item.outcomes !== '' && !(Number.isInteger(item.outcomes) && item.outcomes >= 2 && item.outcomes <= 64)) return failForm('Exhaustive outcome count must be a whole number from 2 to 64.'), null;
  if (editing.type === 'quote' && item.exchange && !(Number(item.liquidity) >= 0)) return failForm('Exchange liquidity must be zero or higher.'), null;
  if (editing.type === 'dfs' && !(item.probability >= 0 && item.probability <= 1)) return failForm('Hit probability must be between 0 and 1.'), null;
  if (editing.type === 'contract' && !(item.bid >= 0 && item.ask <= 100 && item.bid <= item.ask && item.volume >= 0)) return failForm('Bid and ask must be between 0 and 100 cents, with bid no higher than ask.'), null;
  if (['trader','trade'].includes(editing.type) && (!(item.quantity > 0) || !((item.entry ?? item.price) >= 0 && (item.entry ?? item.price) <= 100))) return failForm('Enter a positive quantity and a price between 0 and 100 cents.'), null;
  if (editing.type === 'bet' && (!(item.stake > 0) || !Number.isFinite(decimal(item.odds)) || (item.closeOdds !== '' && !Number.isFinite(decimal(item.closeOdds))))) return failForm('Enter a positive stake and valid American odds.'), null;
  if (editing.type === 'alert' && ((item.kind === 'price' && !Number.isFinite(decimal(item.threshold))) || (item.kind === 'movement' && !(item.threshold > 0)) || (['ev','fantasy-new'].includes(item.kind) && !(item.threshold >= 0 && item.threshold <= 100)))) return failForm('Enter valid American odds, a positive line change, or a percentage from 0 to 100.'), null;
  return item;
}
function saveForm(event) {
  event.preventDefault();
  if (!editing) return;
  const item = parseForm();
  if (!item) return;
  const {type,id} = editing, key = collection[type], previous = id ? state[key].find(x => x.id === id) : null;
  const record = { ...previous, ...item, id: id || uid(), source:'manual' };
  if (type === 'dfs' || type === 'contract') record.ts = now();
  if (type === 'alert') {
    record.enabled = previous?.enabled ?? true;
    record.seen = previous?.seen || alertMatches(record, state).map(x => x.id);
  }
  if (id) state[key] = state[key].map(x => x.id === id ? record : x);
  else state[key].push(record);
  if (type === 'quote') snapshotQuote(record);
  if (type === 'contract') state.contractHistory.push({ id:uid(), contractId:record.id, bid:record.bid, ask:record.ask, volume:record.volume, ts:record.ts });
  $('#ev-dialog').close(); editing = null; commit();
}
function deleteRecord() {
  if (!editing?.id || !confirm(`Delete this ${formTitles[editing.type]}?`)) return;
  const {type,id} = editing;
  state[collection[type]] = state[collection[type]].filter(x => x.id !== id);
  if (type === 'quote') state.history = state.history.filter(x => x.quoteId !== id);
  if (type === 'contract') state.contractHistory = state.contractHistory.filter(x => x.contractId !== id);
  $('#ev-dialog').close(); editing = null; commit();
}

$('#ev-tool-nav').addEventListener('click', event => { const key = event.target.closest('[data-tool]')?.dataset.tool; if (key) setTool(key); });
$('#ev-tool-select').addEventListener('change', event => setTool(event.target.value));
$('.ev-quick-tools').addEventListener('click', event => { const key = event.target.closest('[data-tool]')?.dataset.tool; if (key) setTool(key); });
$('#ev-books').addEventListener('click', event => { const target = event.target.closest('[data-book]'); if (target) { bookmaker = target.dataset.book; render(); } });
$('#ev-books-more').addEventListener('click', () => { showAllBooks = !showAllBooks; renderBooks(); });
$('#ev-find').addEventListener('click', () => $('#ev-view').scrollIntoView({ behavior:'smooth', block:'start' }));
document.querySelector('[data-ev-focus-search]')?.addEventListener('click', () => { document.body.classList.toggle('ev-search-open'); $('#ev-search').focus(); });
$('#ev-search').addEventListener('keydown', event => { if (event.key === 'Escape') { document.body.classList.remove('ev-search-open'); document.querySelector('[data-ev-focus-search]')?.focus(); } });
$('#ev-odds-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-odds-tab]'); if (tab) { marketType = tab.dataset.oddsTab; render(); } });
$('#ev-reset-filters').addEventListener('click', () => { bookmaker = ''; marketType = ''; search = ''; evLeague = ''; evDateRange = 'today'; evMaxOdds = '200'; evSort = 'ev'; if (sport !== '') { sport = ''; history.replaceState(null, '', location.pathname + '?sport=all' + location.hash); } render(); });
$('#ev-market-type').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-market').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-league').addEventListener('change', event => { evLeague = event.target.value; render(); });
$('#ev-reference-date').addEventListener('change', event => { evDateRange = event.target.value; render(); });
$('#ev-reference-max-odds').addEventListener('change', event => { evMaxOdds = event.target.value; render(); });
$('#ev-sort-mode').addEventListener('change', event => { evSort = event.target.value; render(); });
$('#ev-sharp-min').addEventListener('change', event => { localStorage.setItem('sportslab-ev-sharp-min', String(Math.max(0,Number(event.target.value)||0))); render(); });
const saveEvDisplay = () => { try { localStorage.setItem('sportslab-ev-display-v1', JSON.stringify({bankroll,kelly,flatMultiplier})); } catch { /* Display settings stay usable this session. */ } };
$('#ev-ev-bankroll').addEventListener('change', event => { bankroll = Math.max(1, Number(event.target.value) || 5000); saveEvDisplay(); render(); });
$('#ev-kelly').addEventListener('change', event => { if (['arb-pre','arb-live'].includes(active)) flatMultiplier = Math.max(.05, Math.min(10, Number(event.target.value) || 1)); else kelly = Math.max(0, Math.min(1, Number(event.target.value) || 0)); saveEvDisplay(); render(); });
$('#ev-detail-close').addEventListener('click', () => $('#ev-detail').close());
$('#ev-sport').addEventListener('change', event => {
  sport = event.target.value;
  location.assign(`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
});
$('#ev-reference-sport').addEventListener('change', event => {
  sport = event.target.value;
  location.assign(`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
});
$('#ev-search').addEventListener('input', event => { search = event.target.value.toLowerCase().trim(); render(); });
$('#ev-add-quote').addEventListener('click', () => active === 'fantasy' ? openForm('dfs') : openForm('quote', null, active === 'sharp' ? { exchange:true } : ['ev-live','arb-live'].includes(active) ? { live:true } : {}));
$('#ev-view-actions').addEventListener('click', event => { const target = event.target.closest('[data-add]'); if (target) openForm(target.dataset.add, null, { live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true', kind:target.dataset.kind || 'price' }); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-remove-examples]')) return; for (const key of arrays) state[key] = state[key].filter(x => x.source !== 'example'); state.example = false; parlayIds = []; fantasyIds = []; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-load-examples]')) return; const demo = exampleWorkspace(); for (const key of arrays) state[key].push(...demo[key]); state.paytables = { ...demo.paytables, ...state.paytables }; state.example = true; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-replay-live]')) return; for (const quote of state.quotes.filter(q => q.live && q.source === 'example')) { quote.ts = now(); snapshotQuote(quote); } commit(); });
$('#ev-view').addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.sort) { evSort = target.dataset.sort; return render(); }
  if (target.dataset.detail) return openDetail(target.dataset.detail);
  if (target.dataset.oddsExpand) { expandedOddsKey = expandedOddsKey === target.dataset.oddsExpand ? '__closed__' : target.dataset.oddsExpand; return render(); }
  if (target.dataset.arbExpand) { expandedArbKey = expandedArbKey === target.dataset.arbExpand ? '__closed__' : target.dataset.arbExpand; return render(); }
  if (target.dataset.sharpExpand) { expandedSharpKey = expandedSharpKey === target.dataset.sharpExpand ? '__closed__' : target.dataset.sharpExpand; return render(); }
  if (target.dataset.tool) return setTool(target.dataset.tool);
  if (target.dataset.add) return openForm(target.dataset.add, null, { kind:target.dataset.kind || 'price' });
  if (target.dataset.edit) return openForm(target.dataset.edit, target.dataset.id);
  if (target.dataset.parlay || target.dataset.parlayRemove) { const id = target.dataset.parlay || target.dataset.parlayRemove; parlayIds = parlayIds.includes(id) ? parlayIds.filter(x => x !== id) : [...parlayIds,id]; return setTool('parlay'); }
  if (target.dataset.fantasy) { const id = target.dataset.fantasy; const item = state.dfs.find(x => x.id === id); if (item && item.app !== fantasyApp) { fantasyApp = item.app; fantasyIds = []; } fantasyIds = fantasyIds.includes(id) ? fantasyIds.filter(x => x !== id) : [...fantasyIds,id]; return setTool('slip'); }
  if (target.dataset.optimize) { fantasyIds = target.dataset.optimize.split(','); fantasyApp = state.dfs.find(x => x.id === fantasyIds[0])?.app || ''; return setTool('slip'); }
  if (target.dataset.promoPair) { const a = state.quotes.find(x => x.id === target.dataset.promoPair), b = state.quotes.find(x => x.id === target.dataset.hedge); if (a && b) { promoInput.promoOdds = a.odds; promoInput.hedgeOdds = b.odds; render(); } return; }
  if (target.dataset.alertToggle) { const rule = state.alerts.find(x => x.id === target.dataset.alertToggle); if (rule) { rule.enabled = rule.enabled === false; commit(); } return; }
  if (target.dataset.notificationDismiss) { state.notifications = state.notifications.filter(x => x.id !== target.dataset.notificationDismiss); return commit(); }
  if (target.id === 'ev-save-paytable') { const inputs = [...$('#ev-view').querySelectorAll('[data-pay-hits]')]; if (!state.paytables[fantasyApp]) state.paytables[fantasyApp] = {}; state.paytables[fantasyApp][String(fantasyIds.length)] = inputs.map(x => Math.max(0, Number(x.value) || 0)); return commit(); }
});
$('#ev-view').addEventListener('change', event => {
  const t = event.target;
  if (t.id === 'ev-bankroll') { stake = Math.max(.01,Number(t.value)||100); render(); }
  else if (t.dataset.promo) { promoInput[t.dataset.promo] = t.dataset.promo === 'kind' ? t.value : Number(t.value); render(); }
  else if (t.id === 'ev-fantasy-app') { fantasyApp = t.value; fantasyIds = []; render(); }
  else if (t.id === 'ev-fantasy-stake') { fantasyStake = Math.max(.01,Number(t.value)||10); render(); }
  else if (t.id === 'ev-trader-filter') { traderName = t.value; render(); }
  else if (t.id === 'ev-trend-a') { trendA = t.value; render(); }
  else if (t.id === 'ev-trend-b') { trendB = t.value; render(); }
});
$('#ev-form').addEventListener('submit', saveForm);
$('#ev-close').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-cancel').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-delete').addEventListener('click', deleteRecord);
$('#ev-dialog').addEventListener('close', () => { editing = null; });

$('#ev-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `sportslab-ev-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#ev-import').addEventListener('click', () => { $('#ev-file').value = ''; $('#ev-import-error').textContent = ''; $('#ev-import-dialog').showModal(); });
$('#ev-import-close').addEventListener('click', () => $('#ev-import-dialog').close());
$('#ev-import-cancel').addEventListener('click', () => $('#ev-import-dialog').close());
$('#ev-import-apply').addEventListener('click', async () => {
  const file = $('#ev-file').files[0];
  if (!file) return $('#ev-import-error').textContent = 'Choose a JSON file first.';
  if (file.size > 5_000_000) return $('#ev-import-error').textContent = 'The file must be under 5 MB.';
  try {
    const data = JSON.parse(await file.text());
    validateWorkspace(data);
    state = normalize(data); evaluateAlerts(); persist(); $('#ev-import-dialog').close(); render();
  } catch (error) { $('#ev-import-error').textContent = error.message; }
});
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (toolMeta[key]) { active = key; bookmaker = ''; marketType = ''; showAllBooks = false; render(); } });
setInterval(() => { if (['ev-live','arb-live','odds','sharp','line-alerts'].includes(active) && !document.querySelector('dialog[open]')) render(); }, 15_000);
$('.ev-header-actions').append($('.ev-sidebar'));
$('#main').append($('#ev-notice'));
persist(); render();
