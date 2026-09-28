import { EV_DEMO_MODE, EV_DEMO_STORE, permanentDemoWorkspace, refreshDemoObservations } from './ev-preview.js?v=twelve-books-2';
import { secondaryShell, toolPanel, toolEmpty, toolStats, toolNote, toolReceipt } from './ev-secondary-views.js';
import { SECONDARY_TOOLS } from './ev-tool-catalog.js';
import { createQuoteFeedControls, toolDataLabel } from './ev-feed.js?v=1';
import { SITE_PLATFORMS, SPORTSBOOK_PLATFORMS, PREDICTION_PLATFORMS, EXCHANGE_PLATFORMS, canonicalPlatform, platformAsset, platformLabel, platformOptions, isContestPlatform } from './platform-catalog.js';
import { betTrackerUrl, legacyBetTrackerUrl } from './navigation.js?v=tracker-1';
import { decimal, implied, expectedReturn, money, percent, signed, oddsLabel, probabilityToAmerican, fairProbability, fresh, groups, marketKey, evRows, fractionalKellyStake, holdRows, arbitrage, arbitrageRows, middleRows, promoConversion, parlay, fantasySlip, closingLineValue, gradedBet, pearson, sharpMatches, alertMatches, validateWorkspace } from './ev-core.js?v=3';
import { exampleWorkspace, smartMoneyDemoQuotes } from './ev-demo.js?v=6';
import { teamMark, leagueMark } from './sports-identity.js';
import { comparisonAnnotations } from './bet-comparison.js?v=4';
import { inlineBetCard as betComparisonCard, bindInlineComparison as bindComparison } from './bet-inline.js?v=card-click-3';
import { openArbCalculator } from './arb-calculator.js?v=2';
import { arbitrageWorkspaceQuotes, isArbitrageDemo } from './arbitrage-demo.js';
import { createDfsWorkspace, DFS_PLATFORMS, isDfsPlatform } from './dfs-workspace.js?v=6';
import { createOddsScreen } from './odds-screen.js?v=3';
import { ODDS_DEMO_ENABLED, oddsWorkspaceQuotes, oddsDemoHistory } from './odds-demo.js?v=1';

import {readSportsbookState, saveSportsbookState, sportsbookAvailable, availableSportsbookQuotes, STATE_CHANGE_EVENT} from './sportsbook-availability.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const STORE = EV_DEMO_MODE ? EV_DEMO_STORE : 'sportslab-ev-workbench-v1';
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
  if (EV_DEMO_MODE) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE)); } catch {}
    return normalize(permanentDemoWorkspace(saved));
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE));
    if (parsed?.version === 1) {
      const saved = normalize(parsed);
      if (saved.example && saved.quotes.some(q => q.source === 'example' && (/^Book [ABC]$/.test(q.book) || q.book === 'Exchange X'))) {
        const demo = exampleWorkspace();
        for (const key of arrays) saved[key] = [...saved[key].filter(item => item.source !== 'example'), ...demo[key]];
        saved.paytables = { ...demo.paytables, ...saved.paytables };
        localStorage.setItem(STORE, JSON.stringify(saved));
      }
      return saved;
    }
  } catch { /* Browser storage can be disabled. */ }
  return normalize(exampleWorkspace());
}
function normalize(data) {
  for (const key of arrays) if (!Array.isArray(data[key])) data[key] = [];
  for (const key of ['dfs','contracts','bets','results']) for (const item of data[key]) if (item.source === 'example' && !item.sport) item.sport = 'NFL';
  const quoteIds = new Set(data.quotes.map(x => x.id)), contractIds = new Set(data.contracts.map(x => x.id));
  data.history = data.history.filter(x => quoteIds.has(x.quoteId));
  data.contractHistory = data.contractHistory.filter(x => contractIds.has(x.contractId));
  if (!data.paytables || typeof data.paytables !== 'object' || Array.isArray(data.paytables)) data.paytables = {};
  for (const [collection,field] of [['quotes','book'],['history','book'],['dfs','app'],['contracts','platform'],['traders','platform']]) {
    for (const item of data[collection]) if (item[field]) {
      const example = /\s*\(example\)$/i.test(item[field]);
      item[field] = canonicalPlatform(item[field]) + (example ? ' (example)' : '');
    }
  }
  // Keep saved payout rules attached when an older app alias is normalized.
  // Existing rules under the canonical name take precedence over alias rules.
  for (const [name,rules] of Object.entries(data.paytables)) {
    const canonical = canonicalPlatform(name) + (/\s*\(example\)$/i.test(name) ? ' (example)' : '');
    if (canonical !== name) data.paytables = {...data.paytables,[canonical]:{...rules,...(Object.hasOwn(data.paytables,canonical) ? data.paytables[canonical] : {})}};
  }
  return data;
}
let state = load();
let feedControls = null;
const hasApiSnapshot = () => Boolean(state.apiSyncedAt) || state.quotes.some(q => q.source === 'local-api');
const oddsDemoActive = () => ODDS_DEMO_ENABLED && !hasApiSnapshot();
const oddsQuotes = () => oddsWorkspaceQuotes(state.quotes, new Date(), oddsDemoActive());
let active = toolMeta[location.hash.slice(1)] ? location.hash.slice(1) : 'ev-pre';
let search = '';
let bookmaker = '', marketType = '', showAllBooks = false, selectedSportsbooks = null, bookMenuOpen = false, bankroll = 5000, kelly = .25, flatMultiplier = 1, evSort = 'ev', detailQuoteId = '';
let evLeague = '', evDateRange = 'week', evMaxOdds = '200';
let designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' };
let designSort = 'recommended';
let expandedSharpKey = '';
let sharpFiltersOpen = true, sharpSelectedBook = '';
const sportsbookNames = SPORTSBOOK_PLATFORMS;
const fantasyNames = DFS_PLATFORMS;
const brandMarks = Object.fromEntries([...SITE_PLATFORMS.map(item => item.name),'DraftKings Pick6','Pinnacle'].map(name => [name,platformAsset(name)]));
const brandMark = (name, cls = '') => platformAsset(name)
  ? `<img class="ev-brand-mark ${cls}" src="${platformAsset(name)}" alt="">`
  : `<span class="ev-brand-fallback ${cls}" aria-hidden="true">${esc(name.replace(/\s*\(example\)$/, '').slice(0,2))}</span>`;
let sportsbookState = readSportsbookState();
const bookAvailable = name => EV_DEMO_MODE || sportsbookAvailable(name, sportsbookState);
const eligibleQuotes = records => EV_DEMO_MODE ? records : availableSportsbookQuotes(records, sportsbookState);
const sportsbookSelected = name => bookAvailable(name) && (selectedSportsbooks === null || selectedSportsbooks.has(name));
const sportsbookOptions = () => [...new Set([...(active === 'sharp' ? ['Pinnacle'] : []), ...sportsbookNames, ...state.quotes.map(quote => quote.book).filter(Boolean)])].filter(bookAvailable);
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
let trendA = '', trendB = '', traderName = '', predictionPlatform = '';
let editing = null;
const dfsWorkspace = createDfsWorkspace({getState:()=>({...state,quotes:eligibleQuotes(state.quotes)}),redraw:()=>render(),onSave:slip=>{state.slips.push(slip);commit();},onConfigure:picks=>{fantasyIds=picks.map(item=>item.id);fantasyApp=picks[0].app;setTool('slip');}});
const oddsScreen = createOddsScreen({getQuotes:()=>eligibleQuotes(oddsQuotes()),getSportsbookState:()=>sportsbookState,onAllSportsbooks:()=>{const saved=saveSportsbookState('');document.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT,{detail:{state:'',saved}}));},brandMark,redraw:()=>render(),onSport:value=>{sport=value;history.replaceState(null,'',`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}#odds`);}});
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const origin = x => x.source === 'example' ? '<span class="ev-status example">Example</span>' : x.source === 'local-api' ? '<span class="ev-status">API</span>' : '<span class="ev-status">Manual</span>';
const age = ts => { const n = Date.parse(ts); if (!Number.isFinite(n)) return 'Unknown time'; const s = Math.max(0, Math.floor((Date.now() - n) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const qName = q => `${q.event} · ${q.market}${q.line !== '' && q.line != null ? ' ' + q.line : ''} · ${q.side}`;
const qStatus = q => q.live ? `<span class="ev-status${fresh(q) ? '' : ' stale'}">${fresh(q) ? 'Live entry' : 'Stale live'} · ${age(q.ts)}</span>` : `<span class="ev-caption">Pregame · ${age(q.ts)}</span>`;
const filterText = value => String(value ?? '').toLowerCase().includes(search);
const visible = (item, fields) => (!sport || !item.sport || item.sport === sport) && (!search || fields.some(key => filterText(item[key])));
const inDateRange = ts => designFilters.date === 'all' || (Number.isFinite(Date.parse(ts)) && (designFilters.date === 'today' ? new Date(ts).toDateString() === new Date().toDateString() : Date.parse(ts) >= Date.now() - 7 * 86_400_000));
const quotePassesDesign = q => !['odds','arb-pre','arb-live','sharp'].includes(active) || ((!designFilters.league || (q.league || q.sport) === designFilters.league) && inDateRange(q.ts) && (designFilters.period === 'all' || (designFilters.period === 'live') === Boolean(q.live)) && (designFilters.maxOdds === 'all' || Number(q.odds) <= Number(designFilters.maxOdds)));
const quoteSource = () => EV_DEMO_MODE ? state.quotes : hasApiSnapshot() ? state.quotes.filter(q => q.source !== 'example') : ['arb-pre','arb-live'].includes(active) ? arbitrageWorkspaceQuotes(state.quotes) : state.quotes;
const quotes = () => quoteSource().filter(q => visible(q, ['event', 'market', 'book', 'side', 'sport']) && quotePassesDesign(q));
const dfs = () => state.dfs.filter(q => visible(q, ['player', 'market', 'app', 'side']) && (active !== 'fantasy' || ((!designFilters.league || (q.league || q.sport) === designFilters.league) && inDateRange(q.ts) && (!designFilters.side || q.side === designFilters.side))));
const fmtLine = line => line === '' || line == null ? '—' : esc(line);
const oddsCell = q => `<button type="button" data-detail="${esc(q.id)}" aria-label="Compare ${esc(q.side)} at ${esc(q.book)}"><strong>${oddsLabel(q.odds)}</strong><small>${esc(q.book)}</small></button>`;
const button = (label, attributes = '') => `<button type="button" ${attributes}>${label}</button>`;
const empty = (title, body) => `<div class="ev-empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;
const table = (headings, rows) => rows.length ? `<div class="ev-table-wrap"><table class="ev-table"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
const metric = (label, value, cls = '') => `<div class="ev-metric ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    const apiCount = state.quotes.filter(q => q.source === 'local-api').length;
    $('#ev-notice').textContent = state.apiSyncedAt || apiCount ? `${apiCount} API quotes saved. Use Sync API or auto-refresh to update prices.` : state.example ? 'Example market data. Add or import your own prices, or connect a quote feed.' : 'Workspace saved in this browser. Add prices, import records, or connect a quote feed.';
    return true;
  } catch {
    $('#ev-notice').textContent = 'Browser storage is unavailable. Export your work before leaving this page.';
    return false;
  }
}
function snapshotQuote(q) { state.history.push({ id: uid(), quoteId: q.id, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: q.source }); }
function normalizeApiQuote(raw) {
  const value = key => typeof raw?.[key] === 'string' ? raw[key].trim() : '';
  const id = value('id') || (Number.isSafeInteger(raw?.id) ? String(raw.id) : '');
  const odds = Number(raw?.odds), timestamp = value('ts'), observed = Date.parse(timestamp);
  if (!id || !value('sport') || !value('event') || !value('market') || !value('side') || !value('book') || !Number.isFinite(decimal(odds)) || !Number.isFinite(observed) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return null;
  const threeWay = value('market').toLowerCase() === '1x2';
  const outcomes = raw.outcomes == null || raw.outcomes === '' ? (threeWay ? 3 : '') : Number(raw.outcomes);
  if (outcomes !== '' && (!Number.isInteger(outcomes) || outcomes < 2 || outcomes > 64)) return null;
  const line = raw.line == null || raw.line === '' ? '' : Number(raw.line);
  if (line !== '' && !Number.isFinite(line)) return null;
  if (raw.line != null && typeof raw.line !== 'number' && typeof raw.line !== 'string') return null;
  if (raw.live != null && typeof raw.live !== 'boolean' || raw.exchange != null && typeof raw.exchange !== 'boolean') return null;
  if (['spread','total','alternate'].includes(value('type').toLowerCase()) && line === '') return null;
  const league = value('sport').toUpperCase();
  const normalizedSport = league === 'SOCCER' ? 'Soccer' : ['NFL','MLB','NBA','WNBA','NHL'].includes(league) ? league : value('sport');
  const liquidity = Number(raw.liquidity);
  return {
    id: `local-api:${id}`, sport: normalizedSport, event: value('event'), market: value('market'),
    eventId: value('eventId'), marketId: value('marketId'), playerId: value('playerId'),
    player: value('player'), period: value('period') || 'full', league: value('league'), startTime: value('startTime'),
    type: threeWay ? 'three-way' : value('type').toLowerCase() || 'prop', line, side: value('side'), book: canonicalPlatform(value('book')),
    odds, outcomes, live: raw.live === true, exchange: raw.exchange === true,
    liquidity: Number.isFinite(liquidity) ? Math.max(0, liquidity) : 0,
    ts: new Date(observed).toISOString(), source: 'local-api'
  };
}
async function syncLocalApi() {
  if (EV_DEMO_MODE) throw Object.assign(Error('Demo prices are enabled for this design preview.'), { retryable:false });
  const workspace = state;
  const response = await fetch('/api/ev/quotes', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  let payload;
  try { payload = await response.json(); }
  catch { throw Object.assign(Error('The quote server returned an unreadable response. Saved prices were kept.'), { retryable: response.status === 429 || response.status >= 500 }); }
  if (!response.ok) {
    const failure = Error(typeof payload?.error === 'string' ? payload.error : typeof payload?.detail === 'string' ? payload.detail : 'The EV API is unavailable. Saved prices were kept.');
    failure.retryable = payload?.retryable !== false && ![400,401,403,404,405,422].includes(response.status);
    const retry = response.headers.get('Retry-After');
    if (retry) failure.retryAfterMs = Math.min(86_400_000, Math.max(0, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()));
    throw failure;
  }
  const invalid = message => Object.assign(Error(message + ' Saved prices were kept.'), { retryable: false });
  const records = Array.isArray(payload) ? payload : payload?.quotes;
  if (!Array.isArray(records)) throw invalid('The EV API did not return a quotes array.');
  if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) throw invalid('Quote sync needs a complete snapshot; this response is partial or paginated.');
  const normalized = records.map(normalizeApiQuote);
  const invalidIndex = normalized.findIndex(quote => !quote);
  if (invalidIndex !== -1) throw invalid(`Quote ${invalidIndex + 1} is incomplete or invalid. Required fields: id, sport, event, market, side, book, American odds and observed ts with timezone.`);
  const feed = new Map(normalized.map(quote => [quote.id, quote]));
  if (feed.size !== records.length) throw invalid('The quote response contains duplicate IDs. Each selection and sportsbook needs a unique quote ID.');
  if (state !== workspace) throw invalid('The workspace changed during sync. Try again after your import.');
  const existing = new Map(state.quotes.filter(quote => quote.source === 'local-api').map(quote => [quote.id, quote]));
  state.quotes = [...state.quotes.filter(quote => !['local-api','example'].includes(quote.source) && !feed.has(quote.id)), ...feed.values()];
  const retainedIds = new Set(state.quotes.map(quote => quote.id));
  state.history = state.history.filter(item => retainedIds.has(item.quoteId));
  for (const quote of feed.values()) {
    const prior = existing.get(quote.id);
    if (!prior || prior.odds !== quote.odds || prior.line !== quote.line) snapshotQuote(quote);
  }
  const apiHistory = state.history.filter(item => item.source === 'local-api').slice(-5_000);
  state.history = [...state.history.filter(item => item.source !== 'local-api'), ...apiHistory];
  state.apiSyncedAt = now();
  const saved = commit();
  return { count: feed.size, saved };
}
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
function commit() { evaluateAlerts(); const saved = persist(); render(); return saved; }
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
function setTool(key) { if (key === 'tracker') return location.assign(betTrackerUrl(sport.toLowerCase())); if (!toolMeta[key]) return; active = key; bookmaker = ''; marketType = ''; showAllBooks = false; bookMenuOpen = false; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; $('.ev-tool-details').open = false; history.replaceState(null, '', location.pathname + location.search + '#' + key); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function action(label, type, extra = '') { return button(label, `data-add="${type}" ${extra}`); }
const filterIcons = {
  sport:'◉', platform:'▱', league:'♜', market:'▥', date:'▣', period:'◷', side:'↕', odds:'☷', liquidity:'≋', edge:'↗', stake:'$'
};
const arbIcon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const arbFilterIcons = {
  sport:arbIcon('<circle cx="12" cy="12" r="8"/><path d="M12 4c-2.5 2-4 4.8-4 8s1.5 6 4 8m0-16c2.5 2 4 4.8 4 8s-1.5 6-4 8M4 12h16"/>'),
  market:arbIcon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 4v16M4 10h16"/>'),
  edge:arbIcon('<path d="m4 17 6-6 4 3 6-7m-5 0h5v5"/>'),
  stake:arbIcon('<circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8c-.8-.8-1.8-1-3-1-1.8 0-3 1-3 2.2 0 3 6 1.2 6 4.2 0 1.1-1.2 2.6-3 2.6-1.2 0-2.2-.2-3-1"/>'),
  date:arbIcon('<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v4m8-4v4M4 10h16m-11 4h2"/>'),
  period:arbIcon('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>')
};
const designFilterIcon = kind => ['arb-pre','arb-live'].includes(active) ? (arbFilterIcons[kind] || filterIcons[kind]) : filterIcons[kind];
function designSelect(kind, title, options, value, prefix = '') {
  const choices = options.map(([option,label]) => `<option value="${esc(option)}" ${String(option) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  return `<label class="ev-design-filter"><span class="ev-design-icon" aria-hidden="true">${designFilterIcon(kind)}</span>${prefix ? `<span class="ev-design-prefix">${esc(prefix)}</span>` : ''}<select data-filter="${kind}" aria-label="${esc(title)}">${choices}</select></label>`;
}
function renderDesignFilters() {
  const fantasy = active === 'fantasy', odds = active === 'odds', arb = ['arb-pre','arb-live'].includes(active), sharp = active === 'sharp';
  let container = $('#ev-design-filters');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ev-design-filters';
    container.className = 'ev-design-filters';
    container.setAttribute('aria-label', 'Workspace filters');
    $('.ev-reference-filters').after(container);
  }
  if (!fantasy && !odds && !arb && !sharp) { container.innerHTML = ''; return; }
  const records = fantasy ? state.dfs : quoteSource();
  const leagues = [...new Set(records.map(item => item.league || item.sport).filter(Boolean))].sort();
  const sports = [...new Set(records.map(item => item.sport).filter(Boolean))].sort();
  const marketNames = [...new Set(records.map(item => fantasy ? item.market : item.type).filter(Boolean))].sort();
  const availableBooks = [...new Set(records.map(item => fantasy ? canonicalPlatform(item.app) : item.book).filter(Boolean))].sort();
  const sportControl = designSelect('sport','Sports', [['',arb ? 'All sports' : 'Sports'],...sports.map(value => [value,value])],sport,arb ? 'Sport' : '');
  const leagueControl = designSelect('league','Leagues', [['','Leagues'],...leagues.map(value => [value,value])],designFilters.league,sharp ? 'Leagues' : '');
  const marketControl = designSelect('market',fantasy ? 'Stat' : 'Markets', [['',fantasy ? 'Stat' : arb ? 'All markets' : 'Markets'],...marketNames.map(value => [value,value])],marketType,arb ? 'Market' : sharp ? 'Markets' : '');
  const dateControl = designSelect('date','Date range', [['all','Any'],['today','Today'],['week','7 days']],designFilters.date,arb ? 'Date range' : 'Date Range');
  const bookControl = designSelect('platform',fantasy ? 'Platforms' : 'Sportsbooks', [['',fantasy ? 'Platforms' : 'Sportsbooks'],...availableBooks.map(value => [value,value])],bookmaker,sharp ? 'Sportsbooks' : '');
  const periodControl = designSelect('period','Period', arb ? [['pregame','Pregame'],['live','Live']] : [['all','All games'],['pregame','Pregame'],['live','Live']],arb ? (active === 'arb-live' ? 'live' : 'pregame') : designFilters.period,arb ? 'Period' : '');
  const oddsControl = designSelect('odds','Maximum odds', [['all','Any'],['200','+200'],['300','+300'],['500','+500']],designFilters.maxOdds,'Max Odds');
  const liquidityControl = `<label class="ev-design-filter"><span class="ev-design-icon" aria-hidden="true">${filterIcons.liquidity}</span><span class="ev-design-prefix">Min Liquidity</span><input data-filter="liquidity" aria-label="Minimum liquidity" type="number" min="0" step="1" value="${esc(localStorage.getItem('sportslab-ev-sharp-min') || 1000)}"></label>`;
  const edgeControl = designSelect('edge','Minimum edge', [['0','Any edge'],['0.005','0.5%'],['0.01','1%'],['0.02','2%']],designFilters.minEdge,'Minimum edge');
  const stakeControl = `<label class="ev-design-filter"><span class="ev-design-icon" aria-hidden="true">${designFilterIcon('stake')}</span><span class="ev-design-prefix">Max stake</span><input data-filter="stake" aria-label="Maximum stake" type="number" min="1" step="1" value="${esc(stake)}"></label>`;
  const sideControl = designSelect('side','Over or Under', [['','Over/Under'],['Over','Over'],['Under','Under']],designFilters.side);
  const controls = fantasy ? [sportControl,bookControl,leagueControl,marketControl,dateControl,sideControl]
    : odds ? [sportControl,leagueControl,marketControl,periodControl,dateControl]
    : arb ? [sportControl,marketControl,edgeControl,stakeControl,dateControl,periodControl]
    : [sportControl,leagueControl,marketControl,oddsControl,liquidityControl,dateControl];
  container.innerHTML = controls.join('');
}
let inlineDetail=null;
let evVisibleCount=40;
const evReferenceModels=new Map();
function render() {
  feedControls?.update();
  if (!['arb-pre','arb-live'].includes(active) && $('#ev-notice').dataset.arbDemo) {
    delete $('#ev-notice').dataset.arbDemo;
    $('#ev-notice').textContent = state.example ? 'Example market data. Add or import your own prices; no live feed is connected.' : 'Manual workspace saved in this browser. No market feed is connected.';
  }
  if (active !== 'odds' && $('#ev-notice').dataset.oddsDemo) {
    delete $('#ev-notice').dataset.oddsDemo;
    $('#ev-notice').textContent = state.example ? 'Example market data. Add or import your own prices; no live feed is connected.' : 'Manual workspace saved in this browser. No market feed is connected.';
  }
  if (active === 'tracker') { location.replace(legacyBetTrackerUrl(new URL(location.href)) || betTrackerUrl(sport.toLowerCase())); return; }
  renderNav();
  const titles = { odds:'Odds Screen', 'ev-pre':'Positive EV', 'ev-live':'Positive EV', fantasy:'DFS Props', 'arb-pre':'Arbitrage', 'arb-live':'Live Arbitrage', sharp:'Smart Money', tracker:'Bet Tracker' };
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
  document.querySelectorAll('.ev-site-header a[href]').forEach(link => {
    const url = new URL(link.href);
    if (!['/ev', '/ev/tracker', '/ev/dashboard'].includes(url.pathname)) return;
    if (sport) url.searchParams.set('sport', sport.toLowerCase());
    else if (url.pathname === '/ev') url.searchParams.set('sport', 'all');
    else url.searchParams.delete('sport');
    link.href = url.pathname + url.search + url.hash;
  });
  $('#ev-sport').value = sport;
  $('#ev-search').value = search;
  const options = active === 'fantasy'
    ? [['','All props'],...[...new Set(state.dfs.map(item => item.market))].sort().map(value => [value,value])]
    : [['','All markets'],...(active === 'sharp' ? [['moneyline','Moneyline']] : []),['total','Totals'],['spread','Spreads'],['prop','Player props'],['alternate','Alternates'],['future','Futures'],['three-way','Three-way']];
  $('#ev-market-type').innerHTML = options.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if (!options.some(([value]) => value === marketType)) marketType = '';
  $('#ev-market-type').value = marketType;
  const positiveView = active === 'ev-pre' || active === 'ev-live';
  $('#ev-reference-sport').options[0].textContent = positiveView ? 'Sports' : 'All sports';
  $('#ev-reference-sport').value = sport;
  $('#ev-reference-market').innerHTML = options.map(([value,label]) => `<option value="${esc(value)}">${esc(!value && positiveView ? 'Markets' : label)}</option>`).join('');
  $('#ev-reference-market').value = marketType;
  const leagues = [...new Set(state.quotes.map(q => q.league || q.sport).filter(Boolean))].sort();
  $('#ev-reference-league').innerHTML = `<option value="">${positiveView ? 'Leagues' : 'All leagues'}</option>` + leagues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (!leagues.includes(evLeague)) evLeague = '';
  $('#ev-reference-league').value = evLeague;
  $('#ev-reference-date').value = evDateRange;
  $('#ev-reference-max-odds').value = evMaxOdds;
  $('#ev-sort-mode').innerHTML = ['ev-pre','ev-live'].includes(active)
    ? '<option value="ev">Recommended</option><option value="event">Event</option><option value="odds">Odds</option>'
    : '<option value="recommended">Recommended</option><option value="event">Event</option><option value="time">Time</option>';
  $('#ev-sort-mode').value = ['ev-pre','ev-live'].includes(active) ? evSort : designSort;
  renderDesignFilters();
  $('#ev-sharp-filter').hidden = active !== 'sharp';
  $('#ev-sharp-min').value = localStorage.getItem('sportslab-ev-sharp-min') || 1000;
  $('#ev-ev-bankroll').value = bankroll;
  const usesKelly = ['ev-pre','ev-live'].includes(active);
  const usesFlat = ['arb-pre','arb-live'].includes(active);
  $('#ev-kelly').value = usesKelly ? kelly : flatMultiplier.toFixed(2);
  const dataKind = (active === 'odds' && oddsDemoActive()) || (usesFlat && !hasApiSnapshot() && isArbitrageDemo(state.quotes)) ? 'Demo mode' : active === 'fantasy' ? (state.dfs.length ? 'Entered props' : 'Design preview') : hasApiSnapshot() ? 'API snapshot' : state.example ? 'Example prices' : 'Manual prices';
  $('#ev-data-kind').textContent = toolDataLabel(active, state, dataKind);
  $('#ev-top-badge').textContent = toolDataLabel(active, state, dataKind);
  $('#ev-multiplier-label').textContent = usesKelly ? 'Kelly multiplier' : 'Flat multiplier';
  $('#ev-kelly').disabled = !usesKelly && !usesFlat;
  $('#ev-kelly').min = usesKelly ? '0' : '0.05';
  $('#ev-kelly').max = usesKelly ? '1' : '10';
  $('#ev-kelly').title = usesKelly ? 'Fractional Kelly stake multiplier' : usesFlat ? 'Multiplier for the arbitrage stake split' : 'Saved display preference; this view has no stake calculation';
  $('#ev-odds-tabs').hidden = active !== 'odds';
  document.querySelectorAll('[data-odds-tab]').forEach(tab => tab.setAttribute('aria-pressed',String(tab.dataset.oddsTab === marketType)));
  renderBooks();
  $('#ev-record-count').textContent = `${state.quotes.length} prices · ${state.dfs.length} DFS props · ${state.contracts.length} contracts`;
  $('#ev-title').textContent = pageTitle;
  $('#ev-description').textContent = toolMeta[active][3];
  const viewActions = {
    odds: oddsDemoActive() ? '' : state.example ? button('Remove examples', 'data-remove-examples') : button('Load examples', 'data-load-examples'), 'ev-pre': state.example ? button('Remove examples', 'data-remove-examples') : button('Load examples', 'data-load-examples'), 'ev-live': state.example ? button('Replay live examples', 'data-replay-live') : '',
    'arb-pre': '', 'arb-live': state.example ? button('Replay live examples', 'data-replay-live') : '', middles: action('Add price', 'quote') + (state.example ? button('Replay live examples', 'data-replay-live') : ''), holds: action('Add price', 'quote'),
    sharp: state.example ? button('Replay live examples', 'data-replay-live') : '', fantasy: '', optimizer: action('Add DFS prop', 'dfs'), slip: action('Add DFS prop', 'dfs'),
    'fantasy-alerts': action('New alert', 'alert', 'data-kind="fantasy-new"'), prediction: action('Add contract', 'contract'), tracker: action('Add bet', 'bet'), trends: action('Add result', 'result'), 'line-alerts': action('New alert', 'alert')
  };
  $('#ev-view-actions').innerHTML = viewActions[active] || '';
  if (EV_DEMO_MODE) $('#ev-view-actions').querySelectorAll('[data-remove-examples],[data-load-examples],[data-replay-live]').forEach(button=>button.remove());
  const positiveScreen = ['ev-pre','ev-live'].includes(active);
  document.body.classList.toggle('ev-detail-mode', positiveScreen && Boolean(detailQuoteId));
  $('#ev-menu-actions').append($('.ev-header-actions'));
  $('.ev-header-actions').append($('#ev-view-actions'), $('.ev-sidebar'));
  const views = { odds: renderOdds, 'ev-pre': () => renderEv(false), 'ev-live': () => renderEv(true), 'arb-pre': () => renderArb(false), 'arb-live': () => renderArb(true), middles: renderMiddles, holds: renderHolds, promo: renderPromo, parlay: renderParlay, sharp: renderSharp, fantasy: renderFantasy, optimizer: renderOptimizer, slip: renderSlip, 'fantasy-alerts': renderFantasyAlerts, prediction: renderPrediction, trends: renderTrends, 'line-alerts': renderLineAlerts };
  const secondary = SECONDARY_TOOLS.some(tool => tool.key === active);
  document.body.classList.toggle('ev-secondary-mode',secondary);
  const feedPanel = $('.ev-feed');
  if (feedPanel) (secondary ? $('.ev-shell') : $('.ev-header')).after(feedPanel);
  $('#ev-view').innerHTML = secondaryShell(active, views[active](), {actions:viewActions[active] || '',sport,search,dataLabel:toolDataLabel(active,state,dataKind)});
  if (positiveScreen) bindEvReferenceCards();
  document.dispatchEvent(new Event('ev-tool-change'));
  if(inlineDetail?.tool===active)showBetComparison(inlineDetail.id,inlineDetail.kind,{force:true});else inlineDetail=null;
}

function renderBooks() {
  const fantasyMode = ['fantasy','optimizer','slip','fantasy-alerts'].includes(active);
  const positiveMode = active === 'ev-pre' || active === 'ev-live';
  const timingToggle = $('#ev-timing-toggle');
  timingToggle.hidden = !positiveMode;
  timingToggle.dataset.mode = active;
  timingToggle.setAttribute('aria-checked', String(active === 'ev-live'));
  timingToggle.title = active === 'ev-live' ? 'Switch to pregame bets' : 'Switch to live bets';
  const entered = fantasyMode ? state.dfs.filter(item => isDfsPlatform(item.app)).map(item => canonicalPlatform(item.app)) : state.quotes.filter(q => !sport || q.sport === sport).map(q => q.book);
  const supported = fantasyMode ? fantasyNames : active === 'sharp' ? ['Pinnacle','DraftKings','FanDuel','bet365',...sportsbookNames.filter(name => !['DraftKings','FanDuel','bet365'].includes(name))] : sportsbookNames;
  const books = [...new Set([...supported, ...entered])].filter(book => fantasyMode || bookAvailable(book));
  const relevant = ['ev-pre','ev-live','odds','arb-pre','arb-live','sharp','fantasy'].includes(active);
  $('.ev-bookbar').hidden = !relevant;
  $('.ev-control-grid').hidden = !relevant;
  $('.ev-bookbar').classList.toggle('ev-bookbar-select', relevant && !fantasyMode);
  const menu = $('#ev-book-menu');
  if (relevant && !fantasyMode) {
    const options = [...new Set([...books, ...sportsbookOptions()])];
    const selected = options.filter(sportsbookSelected);
    $('#ev-books').innerHTML = selected.length ? selected.map(book => `<button type="button" class="ev-selected-book" data-book-remove="${esc(book)}" aria-label="Remove ${esc(book)} from selected sportsbooks" title="Remove ${esc(book)}"><span class="ev-book-symbol">${brandMarks[book] ? `<img src="${brandMarks[book]}" alt="" class="ev-book-logo">` : esc(book.slice(0,2))}</span><span class="ev-book-remove" aria-hidden="true">×</span></button>`).join('') + '<button type="button" class="ev-book-overflow" data-open-book-menu hidden></button>' : `<span class="ev-no-books">${sportsbookState && !options.length ? "No supported sportsbooks in " + sportsbookState : "No books selected"}</span>`;
    $('#ev-books-more').hidden = false;
    $('#ev-books-more').innerHTML = '<span aria-hidden="true">+</span>';
    $('#ev-books-more').setAttribute('aria-label','Choose sportsbooks');
    $('#ev-books-more').setAttribute('aria-expanded',String(bookMenuOpen));
    menu.hidden = !bookMenuOpen;
    menu.innerHTML = `<div class="ev-book-menu-heading"><strong>Sportsbooks</strong><span>${selected.length} selected</span></div><div class="ev-book-menu-actions"><button type="button" data-book-select-all>Select all</button><button type="button" data-book-clear>Clear all</button></div><div class="ev-book-menu-options" role="group" aria-label="Choose sportsbooks">${options.map(book => `<label class="ev-book-option"><input type="checkbox" data-book-option="${esc(book)}" ${sportsbookSelected(book) ? 'checked' : ''}><span class="ev-book-option-mark" aria-hidden="true">${brandMarks[book] ? `<img src="${brandMarks[book]}" alt="">` : esc(book.slice(0,2))}</span><span>${esc(platformLabel(book))}</span></label>`).join('')}</div>`;
  } else {
    menu.hidden = true;
    bookMenuOpen = false;
    const visibleCount = fantasyMode ? 6 : active === 'sharp' ? 4 : ['ev-pre','ev-live'].includes(active) ? 11 : 9;
    const shown = showAllBooks ? books : books.slice(0, visibleCount);
    $('#ev-books').innerHTML = `<button type="button" class="ev-book-all" data-book="" aria-pressed="${!bookmaker}">All</button>` + shown.map(book => `<button type="button" data-book="${esc(book)}" aria-pressed="${bookmaker === book}" title="Filter ${esc(book)}"><span class="ev-book-symbol">${brandMarks[book] ? `<img src="${brandMarks[book]}" alt="" class="ev-book-logo">` : esc(book)}</span><span class="ev-book-name">${esc(book)}</span></button>`).join('');
    $('#ev-books-more').hidden = books.length <= visibleCount;
    $('#ev-books-more').textContent = showAllBooks ? '−' : ['ev-pre','ev-live'].includes(active) ? `+${books.length - shown.length}` : `+${books.length - shown.length} more`;
    $('#ev-books-more').setAttribute('aria-label', showAllBooks ? `Show fewer ${fantasyMode ? 'platforms' : 'bookmakers'}` : `Show ${books.length - shown.length} more ${fantasyMode ? 'platforms' : 'bookmakers'}`);
    $('#ev-books-more').setAttribute('aria-expanded', String(showAllBooks));
  }
  const labels = { odds:'Compare lines', 'ev-pre':'Find bets', 'ev-live':'Find bets', fantasy:'Find props', 'arb-pre':'Find arbs', 'arb-live':'Find arbs', sharp:'Find opportunities' };
  $('#ev-find').firstChild.textContent = (labels[active] || 'View results') + ' ';
  $('#ev-add-quote').textContent = active === 'fantasy' ? 'Add DFS prop' : active === 'sharp' ? 'Add exchange price' : 'Add price';
  layoutSelectedBooks();
}

function layoutSelectedBooks() {
  const picker = $('.ev-book-picker'), list = $('#ev-books'), overflow = list.querySelector('.ev-book-overflow');
  if (!$('.ev-bookbar').classList.contains('ev-bookbar-select') || !overflow || !picker.clientWidth) return;
  const buttons = [...list.querySelectorAll('.ev-selected-book')];
  for (const button of buttons) button.hidden = false;
  overflow.hidden = true;
  const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
  const pickerGap = parseFloat(getComputedStyle(picker).columnGap) || 0;
  const available = picker.clientWidth - $('#ev-books-more').getBoundingClientRect().width - pickerGap;
  const widths = buttons.map(button => button.getBoundingClientRect().width);
  if (widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1) <= available) return;
  overflow.hidden = false;
  overflow.textContent = '+' + buttons.length;
  const budget = available - overflow.getBoundingClientRect().width - gap;
  let used = 0, visible = 0;
  for (const width of widths) {
    const next = used + (visible ? gap : 0) + width;
    if (next > budget) break;
    used = next;
    visible++;
  }
  buttons.forEach((button, index) => { button.hidden = index >= visible; });
  const remaining = buttons.length - visible;
  overflow.textContent = '+' + remaining;
  overflow.setAttribute('aria-label', `Show ${remaining} more selected sportsbooks`);
}

function renderOdds() {
  const demo = oddsDemoActive();
  if (demo) {$('#ev-notice').dataset.oddsDemo = 'true';$('#ev-notice').textContent = 'Demo mode is on for development. Matchups, rosters, prices and line movement are simulated.';}
  else delete $('#ev-notice').dataset.oddsDemo;
  return oddsScreen.render({sport,demo});
}

function renderEvExpanded(quote, fair, ev, asCard = false) {
  const open = detailQuoteId === quote.id;
  const peers = groups(state.quotes).find(group => group.some(item => item.id === quote.id)) || [quote];
  const sides = [quote.side, ...new Set(peers.map(item => item.side).filter(side => side !== quote.side))];
  const books = [...new Set(peers.map(item => item.book))].filter(bookAvailable).sort((a,b) => {
    const ai = sportsbookNames.indexOf(a), bi = sportsbookNames.indexOf(b);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
  });
  const matrix = sides.map(side => {
    const prices = peers.filter(item => item.side === side);
    const average = prices.length ? probabilityToAmerican(prices.reduce((sum,item) => sum + implied(item.odds),0) / prices.length) : NaN;
    const best = prices.slice().sort((a,b) => decimal(b.odds) - decimal(a.odds))[0];
    const cells = books.map(book => {
      const price = prices.filter(item => item.book === book).sort((a,b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
      return `<td class="${price?.id === quote.id ? 'is-selected' : ''} ${price?.id === best?.id ? 'is-best' : ''}">${price ? `<strong>${oddsLabel(price.odds)}</strong>${price.liquidity ? `<small>${money(price.liquidity)} available</small>` : ''}` : '<span class="ev-odds-missing">—</span>'}</td>`;
    }).join('');
    const line = prices[0]?.line;
    return `<tr><th scope="row">${esc(side)}${line !== '' && line != null ? ' ' + fmtLine(line) : ''}</th><td>${Number.isFinite(average) ? oddsLabel(average) : '—'}</td><td class="ev-matrix-best">${best ? `${brandMark(best.book)} <strong>${oddsLabel(best.odds)}</strong>` : '—'}</td>${cells}</tr>`;
  }).join('');
  const stakeEstimate = fractionalKellyStake(bankroll,kelly,fair,quote.odds);
  return `${asCard ? '' : '<tr class="ev-opportunity-detail-row"><td colspan="9">'}<article class="ev-opportunity-card" aria-label="${esc(quote.event)} ${esc(quote.market)} price comparison">
    <div class="ev-opportunity-summary">
      <button type="button" class="ev-opportunity-collapse" data-detail="${esc(quote.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(quote.event)} details">${open ? '⌃' : '+'}</button>
      <div class="ev-opportunity-market"><strong>${esc(quote.market)}</strong><span>${esc(quote.event)} · ${esc(quote.sport)} · ${quote.live ? 'Live entry' : 'Pregame'}</span></div>
      <div><strong>${esc(quote.side)}${quote.line !== '' && quote.line != null ? ' ' + fmtLine(quote.line) : ''}</strong><span>Selection</span></div>
      <div><strong class="ev-opportunity-book">${brandMark(quote.book)} ${oddsLabel(quote.odds)}</strong><span>${esc(quote.book)}</span></div>
      <div><strong>${percent(fair)}</strong><span>Fair probability</span></div>
      <div><strong>${money(stakeEstimate)}</strong><span>Rec. bet</span></div>
      <div class="ev-opportunity-ev"><strong>${(ev * 100).toFixed(2)}%</strong><span>Estimated EV</span></div>
    </div>
    ${open ? `<div class="ev-opportunity-actions"><span>Observed ${age(quote.ts)} · ${quote.source === 'local-api' ? 'Local API' : quote.source === 'example' ? 'Example' : 'Manual'} price</span><div><button type="button" data-edit="quote" data-id="${esc(quote.id)}">Edit price</button>${quote.live ? '' : `<button type="button" data-parlay="${esc(quote.id)}">Add to parlay</button>`}</div></div>
    <div class="ev-price-matrix-scroller"><table class="ev-price-matrix"><thead><tr><th scope="col">Selection</th><th scope="col">Average</th><th scope="col">Best</th>${books.map(book => `<th scope="col">${brandMark(book)}<span>${esc(book)}</span></th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table></div>
    <p class="ev-opportunity-note">Prices shown are entered records for this market. Confirm availability, limits and freshness independently.</p>` : ''}
  </article>${asCard ? '' : '</td></tr>'}`;
}

function renderEv(live) {
  const today = new Date().toDateString(), weekAgo = Date.now() - 7 * 86_400_000;
  const pool = state.quotes.filter(q => (!sport || q.sport === sport) && (!evLeague || (q.league || q.sport) === evLeague) && (evDateRange === 'all' || evDateRange === 'today' && new Date(q.ts).toDateString() === today || evDateRange === 'week' && Date.parse(q.ts) >= weekAgo));
  const all = evRows(pool, live);
  const rows = all.filter(({quote:q,ev}) => ev > 0 && (evMaxOdds === 'all' || Number(q.odds) <= Number(evMaxOdds)) && sportsbookSelected(q.book) && (!marketType || q.type === marketType) && (!search || [q.event,q.market,q.book,q.side,q.sport].some(value => filterText(value))));
  if (evSort === 'event') rows.sort((a,b) => a.quote.event.localeCompare(b.quote.event) || b.ev - a.ev);
  else if (evSort === 'odds') rows.sort((a,b) => decimal(b.quote.odds) - decimal(a.quote.odds));
  else rows.sort((a,b) => b.ev - a.ev);
  rows.sort((a,b)=>Number(Boolean(comparisonAnnotations(b.quote.id).pin))-Number(Boolean(comparisonAnnotations(a.quote.id).pin)));
  const heading = (label,key) => `<button type="button" data-sort="${key}" aria-label="Sort by ${label}" ${evSort === key ? 'aria-current="true"' : ''}>${label}${evSort === key ? ' ↓' : ''}</button>`;
  evReferenceModels.clear();
  const cards = rows.slice(0,evVisibleCount).map(({quote:q,fair,ev}) => {
    const model = evReferenceModel(q, fair, ev);
    evReferenceModels.set(q.id, model);
    return `<div class="ev-reference-mount" data-reference-id="${esc(q.id)}">${betComparisonCard(model)}</div>`;
  }).join('');
  const emptyTitle = !pool.length ? 'No prices for this sport yet' : 'No positive EV selections match these filters';
  const emptyBody = !pool.length ? 'Add or import prices to compare. You can also load clearly labeled examples.' : 'Add complete opposing prices from at least two books, or clear a filter. Use Sync API to refresh saved prices.';
  return `<div class="ev-stack ev-positive-screen ev-bet-board"><div class="wager-results-bar"><span><strong>${rows.length} positive ${rows.length === 1 ? 'selection' : 'selections'}</strong> from ${all.length} comparable prices</span><div class="wager-sort" aria-label="Sort bet cards">${heading('EV','ev')}${heading('Event','event')}${heading('Odds','odds')}</div></div>${rows.length ? `<div class="wager-grid" aria-label="${live ? 'Live' : 'Pregame'} positive EV bets">${cards}</div>${rows.length>evVisibleCount?`<button type="button" class="ev-parlay-more" data-ev-more>Show ${Math.min(40,rows.length-evVisibleCount)} more selections · ${Math.min(evVisibleCount,rows.length)} of ${rows.length} shown</button>`:''}` : empty(emptyTitle,emptyBody)}<p class="ev-caption ev-method-note">Fair probability averages no-vig pairs from other complete books at the same line. Recommended stakes use your bankroll and Kelly multiplier. ${live ? 'Live entries expire after 90 seconds.' : ''} Confirm price, limits and freshness independently.</p></div>`;
}

function evReferenceModel(quote, fair, ev) {
  const model = comparisonForQuote(quote);
  return {...model, standalone:true, inlineHistory:true, historyMetric:'line',
    market:quote.displayMarket || (quote.player ? quote.market.replace(quote.player,'').trim() : quote.market),
    selection:`${quote.player ? quote.player+' ' : ''}${quote.side}${quote.line !== '' && quote.line != null ? ' '+quote.line : ''}`,
    event:quote.displayEvent || quote.event,
    time:`${quote.source === 'example' || quote.demo ? 'Demo · ' : ''}${quote.live ? 'Live' : 'Pregame'} · Observed ${age(quote.ts)}`,
    fairOdds:Number.isFinite(fair)?oddsLabel(probabilityToAmerican(fair)):'—',fairMark:'',fairLabel:'Fair value · consensus',
    probability:percent(fair),probabilityLabel:'True probability',
    metrics:[{label:quote.book,value:oddsLabel(quote.odds)},{label:'Expected value',value:Number.isFinite(ev)?`${(ev*100).toFixed(2)}%`:'—'},{label:'Rec. bet',value:money(fractionalKellyStake(bankroll,kelly,fair,quote.odds))},...(Number(quote.liquidity)>0?[{label:'Available',value:money(Number(quote.liquidity))}]:[])],
    extraActions:quote.live?'':`<button type="button" class="bet-inline-icon" data-parlay="${esc(quote.id)}" aria-label="Add to parlay" title="Add to parlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14"/></svg></button>`,
    referenceRows:[{selection:'Line',prices:model.columns.map(column=>({value:column.line,difference:column.difference}))},{selection:'Odds',prices:model.columns.map(column=>({value:column.odds}))}]
  };
}

function bindEvReferenceCard(root, model) {
  bindComparison(root,model,{
    onEdit:()=>openForm('quote',model.id),
    onTrack:()=>{
      const quote=state.quotes.find(item=>item.id===model.id);
      if(quote)openForm('bet',null,{sport:quote.sport,selection:qName(quote),book:quote.book,odds:quote.odds,stake:Math.round(Number(model.rawStake)||0)});
    },
    onSwap:()=>{
      const quote=quoteSource().find(item=>item.id===model.swapId);
      if(!quote)return;
      const next=comparisonForQuote(quote),fair=next.rawFair;
      const replacement=evReferenceModel(quote,fair,expectedReturn(fair,quote.odds));
      root.innerHTML=betComparisonCard(replacement);
      bindEvReferenceCard(root,replacement);
      root.querySelector('[data-comparison-action="swap"]')?.focus({preventScroll:true});
    },
    onRefresh:()=>{
      const quote=quoteSource().find(item=>item.id===model.id);
      if(!quote)return;
      const next=comparisonForQuote(quote),fair=next.rawFair;
      const replacement=evReferenceModel(quote,fair,expectedReturn(fair,quote.odds));
      root.innerHTML=betComparisonCard(replacement);
      bindEvReferenceCard(root,replacement);
      root.querySelector('[data-comparison-action="refresh"]')?.focus({preventScroll:true});
    }
  });
}

function bindEvReferenceCards() {
  $('#ev-view').querySelectorAll('.ev-reference-mount').forEach(root=>{
    const model=evReferenceModels.get(root.dataset.referenceId);
    if(model)bindEvReferenceCard(root,model);
  });
}

function comparisonForQuote(quote) {
  const source = active === 'odds' ? oddsQuotes() : active === 'sharp' && !state.quotes.some(item => item.id === quote.id) ? smartMoneyDemoQuotes() : quoteSource();
  const peers = groups(source).find(group => group.some(item => item.id === quote.id)) || [quote];
  const fair = fairProbability(quote, peers);
  const books = [...new Set(peers.map(item => item.book))].filter(bookAvailable).sort((a,b) => {
    const ai = sportsbookNames.indexOf(a), bi = sportsbookNames.indexOf(b);
    return Number(peers.some(item=>item.book===b&&item.exchange))-Number(peers.some(item=>item.book===a&&item.exchange)) || (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
  });
  const latest = (book,side) => peers.filter(item => item.book === book && item.side === side).sort((a,b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
  const opposite = [...new Set(peers.map(item => item.side))].find(side => side !== quote.side);
  const columns = books.map(book => {
    const same = latest(book, quote.side), other = opposite ? latest(book, opposite) : null;
    const difference = same && quote.line !== '' && same.line !== '' && Number.isFinite(Number(same.line) - Number(quote.line)) && Number(same.line) !== Number(quote.line)
      ? `${Number(same.line) - Number(quote.line) > 0 ? '+' : ''}${Number(same.line) - Number(quote.line)}` : '';
    const complete=[...new Set(peers.map(item=>item.side))].map(side=>latest(book,side));
    const noVig=same&&complete.length>=2&&complete.every(item=>item&&fresh(item))?implied(same.odds)/complete.reduce((sum,item)=>sum+implied(item.odds),0):NaN;
    return {name:book,probability:Number.isFinite(noVig)?percent(noVig):null,mark:brandMark(book),exchange:peers.some(item=>item.book===book&&item.exchange),line:same?.line !== '' && same?.line != null ? fmtLine(same.line) : '—',difference,odds:same ? `${oddsLabel(same.odds)}${other ? ' / ' + oddsLabel(other.odds) : ''}` : '—'};
  });
  const selection = `${quote.side}${quote.line !== '' && quote.line != null ? ' ' + fmtLine(quote.line) : ''}`;
  const canEdit = state.quotes.some(item => item.id === quote.id);
  const sideNames=[quote.side,...new Set(peers.map(item=>item.side).filter(side=>side!==quote.side))];
  const rows=sideNames.map(side=>{
    const prices=books.map(book=>latest(book,side)),available=prices.filter(item=>item&&fresh(item)),best=available.slice().sort((a,b)=>decimal(b.odds)-decimal(a.odds))[0];
    const average=available.length?probabilityToAmerican(available.reduce((sum,item)=>sum+implied(item.odds),0)/available.length):NaN;
    const line=available[0]?.line;
    return {side,selection:`${side}${line!==''&&line!=null?' '+fmtLine(line):''}`,average:Number.isFinite(average)?oddsLabel(average):'—',best:best?oddsLabel(best.odds):'—',bestMark:best?brandMark(best.book):'',prices:prices.map(item=>({value:item?oddsLabel(item.odds):'—',best:!!item&&item.id===best?.id,liquidity:item?.exchange&&Number(item.liquidity)>0?money(Number(item.liquidity)):''}))};
  });
  const historyBySide=Object.fromEntries(sideNames.map(side=>{const current=books.map(book=>latest(book,side)).filter(Boolean),ids=new Set(current.map(item=>item.id)),seen=new Set();return [side,[...state.history.filter(item=>ids.has(item.quoteId)),...current.flatMap(oddsDemoHistory),...current].filter(item=>{const key=[item.book,item.ts,item.odds,item.line].join('|');if(seen.has(key))return false;seen.add(key);return true;})];}));
  const priceHistory=historyBySide[quote.side];
  const offeredPair=sideNames.map(side=>latest(quote.book,side));
  const vig=offeredPair.length>=2&&offeredPair.every(Boolean)?(offeredPair.reduce((sum,item)=>sum+implied(item.odds),0)-1)*100:NaN;
  const recommended=fractionalKellyStake(bankroll,kelly,fair,quote.odds);
  return {id:quote.id,market:quote.market,sport:quote.sport,event:quote.event,time:quote.demo ? `${quote.displayTime} · Demo` : quote.startTime || `${quote.live ? fresh(quote)?'Live':'Stale live' : 'Pregame'} · ${age(quote.ts)}`,selection,
    fairOdds:Number.isFinite(fair) ? oddsLabel(probabilityToAmerican(fair)) : null,fairMark:brandMark(quote.book),
    book:quote.book,rawLine:quote.line,side:quote.side,rawOdds:Number(quote.odds),offerOdds:oddsLabel(quote.odds),rawFair:fair,rawStake:recommended,recommended:money(recommended),ev:Number.isFinite(fair)?(expectedReturn(fair,quote.odds)*100).toFixed(2)+'%':'—',vig:Number.isFinite(vig)?vig.toFixed(1)+'%':null,
    probability:Number.isFinite(fair) ? percent(fair) : null,probabilityLabel:'Est. probability',
    context:`${quote.demo ? 'Example demo' : quote.source === 'example' ? 'Example' : 'Saved'} prices · ${books.length} ${books.length === 1 ? 'book' : 'books'} · Observed ${age(quote.ts)}`,
    note:quote.demo ? 'Demo matchup, roster, prices and price history. Fair value is calculated from the simulated sportsbook pairs at this line.' : 'Fair value and true probability use the no-vig consensus from other complete books at the same line. Missing values mean there is not enough comparable data.',
    columns,rows,historyBySide,history:priceHistory,canSwap:!!opposite,swapId:peers.find(item=>item.side===opposite)?.id,canEdit,canTrack:canEdit};
}
function showBetComparison(id, kind = 'quote', options = {}) {
  const selector=kind==='dfs'?'data-open-dfs':kind==='tracked'?'data-open-tracked':'data-open-quote';
  const target=options.anchor || $('#ev-view').querySelector(`[${selector}="${CSS.escape(id)}"],[data-detail="${CSS.escape(id)}"],[data-sharp-select="${CSS.escape(id)}"]`);
  if(!target)return;
  const anchor=target.closest('.wager-card,tr,.ev-arb-card,.ev-arb-opportunity,.sharp-card,.ev-reference-card')||target;
  const openedFromKeyboard=anchor.contains(document.activeElement)&&document.activeElement.matches(':focus-visible');
  const old=$('#ev-view').querySelector('.bet-inline-mount');
  if(inlineDetail?.id===id&&inlineDetail.kind===kind&&old&&!options.force){closeInlineDetail();return;}
  if(inlineDetail?.anchor?.matches('.ev-reference-card'))inlineDetail.anchor.hidden=false;
  old?.remove();
  let model;
  if (kind === 'dfs') {
    const item = state.dfs.find(entry => entry.id === id);
    if (!item) return;
    const peers = state.dfs.filter(entry => entry.player === item.player && entry.market === item.market && entry.event === item.event && entry.side === item.side);
    model = {market:item.market,sport:item.sport,event:item.event,time:age(item.ts),selection:`${item.player} ${item.side} ${fmtLine(item.line)}`,probability:Number.isFinite(Number(item.probability)) ? percent(Number(item.probability)) : null,probabilityLabel:'Est. hit rate',fairLabel:'Fair value',context:'Entered DFS props',note:'DFS hit rates are entered estimates. No sportsbook odds or fair value are calculated for these props.',columns:peers.map(entry => ({name:entry.app,mark:brandMark(canonicalPlatform(entry.app)),line:fmtLine(entry.line),odds:'—'})),actions:[{label:'Edit prop',icon:'✎',attrs:`data-compare-edit-dfs="${esc(item.id)}"`},{label:'Add to slip',icon:'＋',attrs:`data-compare-dfs="${esc(item.id)}"`}]};
  } else if (kind === 'tracked') {
    const bet = state.bets.find(entry => entry.id === id);
    if (!bet) return;
    model = {market:'Tracked bet',sport:bet.sport,event:bet.selection,time:bet.date,selection:bet.selection,fairLabel:'Booked odds',fairOdds:oddsLabel(bet.odds),probabilityLabel:'Est. probability',context:`${bet.result} · ${money(Number(bet.stake))} stake`,note:'Only the booked price is available for this tracked bet. Fair probability and other bookmaker prices were not recorded.',columns:[{name:bet.book || 'Sportsbook',mark:brandMark(bet.book || 'Sportsbook'),line:'—',odds:oddsLabel(bet.odds)}],actions:[{label:'Edit bet',icon:'✎',attrs:`data-compare-edit-bet="${esc(bet.id)}"`}]};
  } else {
    const source = active === 'odds' ? oddsQuotes() : active === 'sharp' && !hasApiSnapshot() ? [...state.quotes,...smartMoneyDemoQuotes()] : quoteSource();
    const quote = source.find(item => item.id === id);
    if (!quote) return;
    model = {...comparisonForQuote(quote),
      market:quote.displayMarket || (quote.player ? quote.market.replace(quote.player,'').trim() : quote.market),
      event:quote.displayEvent || quote.event,
      selection:`${quote.player ? quote.player+' ' : ''}${quote.side}${quote.line!==''&&quote.line!=null?' '+fmtLine(quote.line):''}`,
      fairMark:'',fairLabel:'Fair value · consensus',probabilityLabel:'True Prob'};
  }
  model.id=id;
  model.inlineHistory=true;
  model.historyMetric='line';
  if(kind==='dfs'){model.canEdit=true;model.canTrack=true;model.trackLabel='Add to fantasy slip';}
  if(kind==='tracked')model.canEdit=true;
  const mount=document.createElement(anchor.tagName==='TR'?'tr':'div');mount.className='bet-inline-mount';mount.id='expanded-bet-comparison';
  const root=anchor.tagName==='TR'?mount.appendChild(document.createElement('td')):mount;
  if(anchor.tagName==='TR')root.colSpan=anchor.children.length;
  root.innerHTML=betComparisonCard(model);
  if(anchor.matches('.wager-card'))anchor.append(mount);else anchor.after(mount);
  if(anchor.matches('.ev-reference-card'))anchor.hidden=true;
  const scroller=mount.closest('.ev-table-wrap');if(scroller)scroller.scrollLeft=0;
  inlineDetail={id,kind,tool:active,anchor};const disclosure=anchor.querySelector('[data-detail]')||target;disclosure.setAttribute('aria-expanded','true');disclosure.setAttribute('aria-controls',mount.id);
  bindComparison(root,model,{
    onCollapse:closeInlineDetail,
    onSwap:()=>model.swapId&&showBetComparison(model.swapId,kind,{anchor,force:true}),
    onEdit:()=>openForm(kind==='dfs'?'dfs':kind==='tracked'?'bet':'quote',id),
    onTrack:()=>{if(kind==='dfs'){const item=state.dfs.find(entry=>entry.id===id);if(item.app!==fantasyApp){fantasyApp=item.app;fantasyIds=[];}fantasyIds=[...new Set([...fantasyIds,id])];setTool('slip');}else{const quote=state.quotes.find(item=>item.id===id);if(quote)openForm('bet',null,{sport:quote.sport,selection:qName(quote),book:quote.book,odds:quote.odds,stake:Math.round(Number(model.rawStake)||0)});}},
    onRefresh:()=>showBetComparison(id,kind,{anchor,force:true}),onAnnotation:()=>{
      const card = anchor.closest('.wager-card');
      if (!card) return;
      let label = card.querySelector('[data-card-annotation]');
      if (!label) { label=document.createElement('span'); label.dataset.cardAnnotation=''; label.className='ev-caption'; card.append(label); }
      const saved = comparisonAnnotations(id);
      label.textContent = [saved.pin?'Pinned':'',saved.flag?'Flagged for review':''].filter(Boolean).join(' · ');
    }
  });
  if (!options.force && matchMedia('(max-width:800px)').matches) {
    mount.tabIndex = -1;
    mount.setAttribute('role','region');
    mount.setAttribute('aria-label','Expanded price comparison');
    mount.scrollIntoView({block:'start',behavior:'instant'});
    root.querySelector('[data-inline-collapse]')?.focus({preventScroll:true});
  } else if (openedFromKeyboard) {
    root.querySelector('[data-inline-collapse]')?.focus({preventScroll:true});
  }
}
function closeInlineDetail(){const anchor=inlineDetail?.anchor;if(anchor?.matches('.ev-reference-card'))anchor.hidden=false;$('#ev-view').querySelector('.bet-inline-mount')?.remove();$('#ev-view').querySelectorAll('[aria-controls="expanded-bet-comparison"]').forEach(el=>el.setAttribute('aria-expanded','false'));inlineDetail=null;const focus=anchor?.matches('button,[tabindex]')?anchor:anchor?.querySelector('[data-detail]')||anchor?.querySelector('button');focus?.focus({preventScroll:true});}

function openDetail(id, anchor) { showBetComparison(id, 'quote', {anchor}); }

function renderArb(live) {
  const preview = !hasApiSnapshot() && isArbitrageDemo(state.quotes);
  if (preview) {
    $('#ev-notice').dataset.arbDemo = 'true';
    $('#ev-notice').textContent = 'Demo prices are simulated. Your saved workspace is unchanged.';
  } else if ($('#ev-notice').dataset.arbDemo) {
    delete $('#ev-notice').dataset.arbDemo;
    $('#ev-notice').textContent = 'Manual workspace saved in this browser. No market feed is connected.';
  }
  const opportunities = arbitrageRows(quotes().filter(q => sportsbookSelected(q.book) && !q.exchange), live)
    .flatMap(({ rows, best }) => rows.filter(q => q.side === best[0].side && fresh(q)).flatMap(a =>
      rows.filter(b => b.side === best[1].side && b.book !== a.book && fresh(b)).map(b => [a,b])))
    .filter(([a,b]) => (!marketType || a.type === marketType) && arbitrage([a,b], 100)?.margin >= Number(designFilters.minEdge))
    .sort((left,right) => arbitrage(right, 100).margin - arbitrage(left, 100).margin);
  const wholeDollars = value => '$' + Math.round(value).toLocaleString('en-US');
  const directionIcon = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M4 12 12 4M6.5 4H12v5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const matchupMarkup = quote => {
    const event = String(quote.displayEvent || quote.event || '').trim();
    const teams = /^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})$/i.exec(event);
    if (!teams) return `<span class="ev-arb-matchup">${esc(event)}</span>`;
    const away = teams[1].toUpperCase(), home = teams[3].toUpperCase();
    const mark = code => teamMark({ sport:String(quote.sport).toLowerCase(), team:code });
    return `<span class="ev-arb-matchup ev-arb-matchup-teams">${mark(away)}<span class="ev-arb-team-code">${esc(away)}</span><span class="ev-arb-versus">${teams[2] === '@' ? '@' : 'vs'}</span>${mark(home)}<span class="ev-arb-team-code">${esc(home)}</span></span>`;
  };
  const cards = opportunities.map(([a,b]) => {
    const hedgePerDollar = decimal(a.odds) / decimal(b.odds);
    const anchorStake = Math.min(Number(stake) * flatMultiplier, bankroll / (1 + hedgePerDollar));
    const totalStake = anchorStake * (1 + hedgePerDollar);
    const result = arbitrage([a,b], totalStake);
    const edge = result.margin;
    const leg = (q, index) => `<div class="ev-arb-leg" role="button" tabindex="0" data-open-quote="${esc(q.id)}" title="Open ${esc(q.side)} bet comparison">
      <span class="ev-arb-book-logo" aria-hidden="true">${brandMark(q.book)}</span>
      <div class="ev-arb-selection"><strong>${esc(q.type === 'prop' ? q.player || q.market : q.market)} ${esc(q.side)}${q.line !== '' && q.line != null ? ' ' + fmtLine(q.line) : ''} <span class="ev-arb-selection-arrow">${directionIcon}</span></strong><small>${esc(q.book)}</small></div>
      <div class="ev-arb-leg-figure ev-arb-odds"><strong>${oddsLabel(q.odds)}</strong><small>Odds</small></div>
      <div class="ev-arb-leg-figure"><strong>${wholeDollars(result.stakes[index])}</strong><small>Rec. bet</small></div>
      <div class="ev-arb-leg-figure"><strong>${wholeDollars(result.profit)}</strong><small>Profit</small></div>
    </div>`;
    return `<article class="ev-arb-opportunity">
      <button type="button" class="ev-arb-overview" data-arb-calc="${esc(a.id)}" data-arb-hedge="${esc(b.id)}" aria-haspopup="dialog" aria-label="Open arbitrage calculator for ${esc(a.event)}" title="Open arbitrage calculator"><span class="ev-arb-edge">${(edge * 100).toFixed(2)}%</span><span class="ev-arb-market"><strong>${esc(a.displayMarket || a.market)} <span class="ev-arb-league">${leagueMark(String(a.sport).toLowerCase())}<span>${esc(a.sport)}</span></span></strong><small>${matchupMarkup(a)}<span class="ev-arb-event-time">${a.source === 'example' ? 'Demo' : a.live ? 'Live' : 'Pregame'} · ${esc(a.displayTime || age(a.ts))}</span></small><span class="ev-arb-calc-hint">Open calculator</span></span></button>
      <div class="ev-arb-pair"><span class="ev-arb-pair-count" aria-label="Two opposing bets"><b>2</b><b>×</b>${directionIcon}</span><div class="ev-arb-legs">${leg(a,0)}${leg(b,1)}</div></div>
    </article>`;
  });
  const demoIntro = preview ? `<div class="ev-arb-demo-note"><div><strong>Demo opportunities <span>${cards.length} ${cards.length === 1 ? 'match' : 'matches'}</span></strong><p>Simulated matchups and prices. Try the filters or open a calculator.</p></div>${button('Add your prices', `data-add="quote" data-live="${live}"`)}</div>` : '';
  return `<div class="ev-stack ev-arb-screen">${demoIntro}${cards.length ? `<div class="ev-arb-list">${cards.join('')}</div>` : `<div class="ev-empty ev-arb-empty"><strong>No arbitrage matches</strong><p>${preview || state.quotes.length ? 'No opposing prices match the selected books and filters. Adjust your filters or add another market price.' : 'Add both sides of a market at different sportsbooks to compare prices and calculate the stake split.'}</p><div class="ev-arb-empty-actions">${button('Add price', `data-add="quote" data-live="${live}"`)}${preview || state.quotes.length ? button('Clear filters', 'data-arb-clear') : ''}</div></div>`}<p class="ev-caption ev-method-note">Stake split equalizes the return from either side. Amounts are calculations from entered prices; they are not verified offers.</p></div>`;
}

function renderMiddles() {
  const rows = [false,true].flatMap(mode => middleRows(eligibleQuotes(quotes()),mode));
  const cards = rows.map(x => {
    const plan = arbitrage([x.over,x.under],Number(stake));
    const both = plan.stakes[0]*(decimal(x.over.odds)-1)+plan.stakes[1]*(decimal(x.under.odds)-1);
    const legs = [x.over,x.under].map((q,i)=>`<div class="tool-market-leg"><span>${brandMark(q.book)}${esc(q.book)}</span><strong>${esc(q.side)} ${fmtLine(q.line)}</strong>${oddsCell(q)}<small>Stake ${money(plan.stakes[i])}</small></div>`).join('');
    return toolPanel(esc(x.over.event),esc(x.over.market)+' · '+(x.over.live?'Live':'Pregame')+' · '+esc(x.window),`<div class="tool-market-pair">${legs}</div><div class="tool-outcomes"><span>One side wins<strong class="${plan.profit>=0?'ev-positive':'ev-negative'}">${money(plan.profit)}</strong></span><span>Both sides win<strong>${money(both)}</strong></span></div>`);
  }).join('');
  return `<div class="tool-stack">${toolStats([['Winning windows',rows.length],['Live markets',rows.filter(x=>x.over.live).length],['Total per pair',money(stake)]])}<div class="tool-two-column"><div class="tool-stack">${cards || toolPanel('Middle opportunities','Compare overlapping totals and spread lines.',toolEmpty('Find a winning window','Add a lower Over and a higher Under, or opposing spreads with room for both sides to win.',action('Add market prices','quote'),'expand'))}</div>${toolPanel('Stake plan','The same outlay is used for each pair.',`<div class="tool-form-grid"><label>Total outlay ($)<input id="ev-bankroll" type="number" min="1" step="0.01" value="${esc(stake)}"><small>Split to equalize the one-win outcomes.</small></label></div><div class="tool-outcomes"><span>Inside the window<strong>Both can win</strong></span></div><p class="ev-caption">Outside the window, check the one-win result on each pair. Exact settlement depends on integer lines and push rules.</p>`)}</div></div>`;
}

function renderHolds() {
  const rows = [false,true].flatMap(mode=>holdRows(eligibleQuotes(quotes()),mode)).sort((a,b)=>a.hold-b.hold);
  const prices = rows.length ? table(['Market','Side A','Side B','Market hold'],rows.map(x=>`<tr><td><strong>${esc(x.best[0].event)}</strong><small>${esc(x.best[0].market)} · ${fmtLine(x.best[0].line)} · ${x.best[0].live?'Live':'Pregame'}</small></td>${x.best.map(q=>`<td><span class="tool-contract-brand">${brandMark(q.book)}${esc(q.book)}</span><small>${esc(q.side)}</small>${oddsCell(q)}</td>`).join('')}<td data-num class="${x.hold<0?'ev-positive':''}"><strong>${signed(x.hold)}</strong><small>${x.hold<0?'Below zero':'Combined margin'}</small></td></tr>`)) : toolEmpty('Compare your first two-sided market','Enter opposing selections so you can see the combined margin across books.',action('Add prices','quote'),'performance');
  return `<div class="tool-stack">${toolStats([['Markets compared',rows.length],['Lowest hold',rows.length?signed(rows[0].hold):'—'],['Below zero',rows.filter(x=>x.hold<0).length]])}${toolPanel('Tightest markets','Sorted from the lowest hold. Each pair uses the best recorded price on both sides.',prices)}${toolNote('Hold is the sum of both implied probabilities, less 100%. Negative hold is a potential arbitrage before fees, limits, and execution changes.')}</div>`;
}

function renderPromo() {
  const outcome = promoConversion({...promoInput, boost:promoInput.kind === 'bonus' ? 0 : promoInput.boost});
  const paired = groups(eligibleQuotes(quotes())).flatMap(rows=>rows.length>=2?rows.filter(fresh).map(q=>({q,opposite:rows.filter(x=>x.side!==q.side&&x.book!==q.book&&fresh(x)).sort((a,b)=>decimal(b.odds)-decimal(a.odds))[0]})).filter(x=>x.opposite):[]).slice(0,12);
  const fields = `<div class="tool-form-grid"><label>Promotion type<select data-promo="kind"><option value="bonus" ${promoInput.kind==='bonus'?'selected':''}>Bonus bet · stake not returned</option><option value="boost" ${promoInput.kind==='boost'?'selected':''}>Odds boost · cash stake</option></select></label><label>${promoInput.kind==='bonus'?'Bonus value':'Cash stake'} ($)<input data-promo="stake" type="number" min="0.01" step="0.01" value="${esc(promoInput.stake)}"></label><label>Profit boost (%)<input data-promo="boost" type="number" min="0" step="0.1" value="${esc(promoInput.boost)}" ${promoInput.kind==='bonus'?'disabled':''}></label><label>Promotion odds<input data-promo="promoOdds" type="number" step="1" value="${esc(promoInput.promoOdds)}"><small>American odds, such as +150.</small></label><label>Hedge odds<input data-promo="hedgeOdds" type="number" step="1" value="${esc(promoInput.hedgeOdds)}"><small>The opposing selection at another book.</small></label></div>`;
  const result = toolReceipt('Hedge stake',outcome?money(outcome.hedge):'—', [['Promotion wins',outcome?money(outcome.ifPromoWins):'—'],['Hedge wins',outcome?money(outcome.ifHedgeWins):'—'],[promoInput.kind==='bonus'?'Bonus conversion':'Cash stake',outcome?(promoInput.kind==='bonus'?percent(outcome.conversion):money(promoInput.stake)):'—']],outcome?'Calculated from the prices entered. Check promotion terms and settlement rules before using this plan.':'Enter a positive stake and valid American odds to calculate both outcomes.');
  const prices = paired.length ? table(['Promotion side','Opposing hedge',''],paired.map(({q,opposite})=>`<tr><td><strong>${esc(qName(q))}</strong><small>${brandMark(q.book)} ${esc(q.book)} ${oddsLabel(q.odds)}</small></td><td><strong>${esc(opposite.side)}</strong><small>${brandMark(opposite.book)} ${esc(opposite.book)} ${oddsLabel(opposite.odds)}</small></td><td>${button('Use prices',`data-promo-pair="${esc(q.id)}" data-hedge="${esc(opposite.id)}"`)}</td></tr>`)) : toolEmpty('Bring a market into your plan','Add prices on both sides at different books, then load a pair into the calculator.',action('Add prices','quote'),'tag');
  return `<div class="tool-stack"><div class="tool-two-column">${toolPanel('Your promotion','Adjust the inputs to compare the two outcomes.',fields)}${result}</div>${toolPanel('Use saved market prices','Load a promotion price and its opposing hedge in one click.',prices)}${toolNote('Bonus conversion uses a stake-not-returned bonus. Odds boosts use a cash stake and boost the profit portion of the price.')}</div>`;
}

function renderParlay() {
  const selected = parlayIds.map(id=>state.quotes.find(q=>q.id===id)).filter(q=>q&&bookAvailable(q.book));
  const legs = selected.map(q=>({...q,probability:fairProbability(q,groups(state.quotes).find(g=>g.some(x=>x.id===q.id))||[])}));
  const result = parlay(legs);
  const valid = result && Number.isFinite(result.ev) && new Set(selected.map(q=>q.book)).size===1;
  const options = evRows(quotes(),false).filter(({quote})=>bookAvailable(quote.book));
  const available = options.length ? table(['Selection','Book / odds','Fair chance','Leg EV',''],options.map(({quote:q,fair,ev})=>`<tr><td><strong>${esc(q.event)}</strong><small>${esc(q.market)} · ${esc(q.side)} ${fmtLine(q.line)}</small></td><td><span class="tool-contract-brand">${brandMark(q.book)}${esc(q.book)}</span><small>${oddsLabel(q.odds)}</small></td><td data-num>${percent(fair)}</td><td data-num class="${ev>0?'ev-positive':''}">${signed(ev)}</td><td>${button(parlayIds.includes(q.id)?'Remove':'Add leg',`data-parlay="${esc(q.id)}"`)}</td></tr>`)) : toolEmpty('Start with a priced market','Enter both sides at two books to calculate a fair probability for each leg.',action('Add prices','quote'),'plus');
  const ticket = legs.length ? `<div class="tool-selected">${legs.map(q=>`<div class="tool-selected-item"><div><strong>${esc(qName(q))}</strong><small>${esc(q.book)} · ${oddsLabel(q.odds)} · Fair ${percent(q.probability)}</small></div>${button('Remove',`data-parlay-remove="${esc(q.id)}"`)}</div>`).join('')}</div>` : toolEmpty('Your ticket starts here','Choose legs from one sportsbook and different events.','','picks');
  return `<div class="tool-two-column">${toolPanel('Available legs','Prices with a complete comparison market.',available)}<div class="tool-stack">${toolPanel('Your parlay',selected.length+' selected '+(selected.length===1?'leg':'legs'),ticket)}${toolReceipt('Combined decimal odds',valid?result.payout.toFixed(2):'—',[['Fair chance',valid?percent(result.probability):'—'],['Expected value',valid?signed(result.ev):'—']],valid?'Probabilities assume independent legs. Book pricing and parlay rules may change the actual offer.':'A total needs complete market pairs, one sportsbook, and different events.')}</div></div>`;
}

function renderSharp() {
  const threshold = Number(localStorage.getItem('sportslab-ev-sharp-min') || 1000);
  const cash = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value);
  const shortCash = value => Number(value) >= 1000 ? `$${(Number(value)/1000).toFixed(1)}k` : cash(value);
  const enteredQuotes = state.quotes.filter(q => q.source !== 'example');
  const preview = !hasApiSnapshot() && enteredQuotes.length === 0;
  const source = preview ? smartMoneyDemoQuotes() : enteredQuotes;
  const filtered = source.filter(q => !sport || q.sport === sport);
  const matches = sharpMatches(filtered.filter(q => !q.depthOnly), threshold).filter(x => bookAvailable(x.sportsbook.book) && (!marketType || x.exchange.type === marketType) && (!bookmaker || [x.exchange.book,x.sportsbook.book].includes(bookmaker)) && (!search || [x.exchange.event,x.exchange.market,x.exchange.side,x.exchange.book,x.sportsbook.side,x.sportsbook.book,x.exchange.sport].some(value => filterText(value)))).sort((a,b) => b.liquidity - a.liquidity);
  if (!matches.some(x => x.exchange.id === expandedSharpKey)) expandedSharpKey = matches[0]?.exchange.id || '';
  const selected = matches.find(x => x.exchange.id === expandedSharpKey);
  const selection = q => `${q.type === 'prop' && q.player ? esc(q.player) + ' ' : ''}${esc(q.side)}${q.line !== '' && q.line != null ? ' ' + (q.type === 'spread' && Number(q.line) > 0 ? '+' : '') + fmtLine(q.line) : ''}`;
  const category = q => `${q.sport === 'NFL' ? 'Football · ' : ''}${esc(q.sport)}`;
  const marketLabel = q => esc(q.displayMarket || q.market);
  const gameTime = q => q.live ? 'Live' : esc(q.displayTime || 'Pregame');
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',table:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',arrow:'<path d="M7 17 17 7M7 7h10v10"/>'}[name]}</svg>`;
  const card = x => {
    const q = x.exchange;
    return `<button type="button" class="sharp-card" data-sharp-select="${esc(q.id)}" aria-pressed="${q.id === expandedSharpKey}" aria-label="Compare ${esc(q.event)}, ${marketLabel(q)}">
      <span class="sharp-card-value"><strong>${cash(x.liquidity)}</strong><small>${q.limit ? `${cash(q.limit)} limit` : 'Opp. liquidity'}</small></span>
      <span class="sharp-card-body"><span class="sharp-card-context"><span class="sharp-category">${category(q)}</span><span class="sharp-game-time">${gameTime(q)}</span></span><strong class="sharp-card-event">${esc(q.event)}</strong><span class="sharp-market-label">${marketLabel(q)}</span>
        <span class="sharp-card-prices"><span class="sharp-card-offer"><strong>${selection(x.sportsbook)}</strong><span class="sharp-odds-chip" title="${esc(x.sportsbook.book)}">${brandMark(x.sportsbook.book)}<b>${oddsLabel(x.sportsbook.odds)}</b></span></span>
        <span class="sharp-card-counter"><span>${selection(q)}</span><span class="sharp-counter-metrics"><span class="sharp-counter-liquidity">${cash(x.liquidity)}<small>Liquidity</small></span><span class="sharp-exchange-price" title="${esc(q.book)}">${brandMark(q.book)}<b>${oddsLabel(q.odds)}</b></span></span></span></span>
      </span>
    </button>`;
  };
  let detail = `<div class="sharp-detail-empty"><strong>Select a market</strong><p>Choose an opportunity to compare prices and exchange liquidity.</p></div>`;
  if (selected) {
    const q = selected.exchange;
    const peers = groups(source).find(group => group.some(item => item.id === q.id)) || [];
    const books = peers.filter(item => item.side !== q.side && !item.exchange && bookAvailable(item.book)).sort((a,b) => decimal(b.odds) - decimal(a.odds));
    const featuredBook = books.find(item => item.id === sharpSelectedBook) || selected.sportsbook;
    const bestSameSide = peers.filter(item => !item.exchange && item.side === q.side && bookAvailable(item.book)).sort((a,b) => decimal(b.odds) - decimal(a.odds))[0];
    const depthRows = peers.filter(item => item.exchange && item.side === q.side && Number(item.liquidity) > 0).sort((a,b) => Number(b.liquidity) - Number(a.liquidity)).slice(0,5);
    const maxDepth = Math.max(1,...depthRows.map(item => Number(item.liquidity)));
    const bookRows = books.slice(0,8).map(item => {
      const other = peers.find(peer => !peer.exchange && peer.book === item.book && peer.side === q.side);
      return `<button type="button" class="sharp-book-row" data-sharp-book="${esc(item.id)}" aria-pressed="${featuredBook.id === item.id}" aria-label="Select ${esc(item.book)}: ${oddsLabel(item.odds)} versus ${other ? oddsLabel(other.odds) : 'unavailable'}">
        <span class="sharp-book-price ${item.id === selected.sportsbook.id ? 'is-best' : ''}"><strong>${oddsLabel(item.odds)}</strong><span aria-hidden="true">${icon('arrow')}</span></span>
        <span class="sharp-book-identity">${brandMark(item.book)}<span>${esc(item.book)}</span></span>
        <span class="sharp-book-price ${other?.id === bestSameSide?.id ? 'is-best' : ''}"><strong>${other ? oddsLabel(other.odds) : '—'}</strong><span aria-hidden="true">${icon('arrow')}</span></span>
      </button>`;
    }).join('');
    detail = `<div class="sharp-detail-header"><div class="sharp-detail-total"><strong>${cash(selected.liquidity)}</strong><span>${q.limit ? `${cash(q.limit)} limit` : 'Opp. liquidity'}</span></div><div class="sharp-detail-market"><span class="sharp-category">${category(q)}</span><h2>${esc(q.event)}</h2><span class="sharp-market-label">${marketLabel(q)}</span></div><button type="button" data-sharp-jump class="sharp-icon-button" aria-label="Jump to sportsbook comparison" title="Sportsbook comparison">${icon('table')}</button></div>
      <div class="sharp-featured-offer"><span class="sharp-featured-book" title="${esc(featuredBook.book)}">${brandMark(featuredBook.book)}</span><span class="sharp-featured-selection"><strong>${selection(featuredBook)}</strong><small>${esc(featuredBook.book)}</small></span><span class="sharp-featured-price"><strong>${oddsLabel(featuredBook.odds)}</strong><small>Odds</small></span><button type="button" data-sharp-jump class="sharp-compare-action">Compare ${icon('arrow')}</button></div>
      <div class="sharp-depth"><div class="sharp-depth-summary"><span class="sharp-depth-selection">${brandMark(q.book)}<strong>${selection(q)}</strong></span><span class="sharp-depth-stat"><strong>${oddsLabel(q.odds)}</strong><small>Top price</small></span><span class="sharp-depth-stat"><strong>${cash(selected.liquidity)}</strong><small>Liquidity</small></span></div>
      <div class="sharp-depth-chart" role="img" aria-label="Exchange depth for ${selection(q)}. ${depthRows.map(item => `${esc(item.book)} ${oddsLabel(item.odds)}, ${cash(item.liquidity)} available`).join('; ')}">${depthRows.map((item,index) => `<div class="sharp-depth-row ${index === 0 ? 'is-leading' : ''}"><span class="sharp-depth-source" title="${esc(item.book)}">${brandMark(item.book)}</span><span class="sharp-depth-odds">${oddsLabel(item.odds)}</span><span class="sharp-depth-track"><span style="width:${Math.max(3,Math.round(Number(item.liquidity)/maxDepth*100))}%"></span></span><span class="sharp-depth-liquidity">${shortCash(item.liquidity)}</span></div>`).join('')}</div><div class="sharp-depth-caption"><span>Exchange market depth</span><span>${depthRows.length} price levels</span></div></div>
      <div class="sharp-books"><div class="sharp-book-head"><strong>${selection(selected.sportsbook)}</strong><span>Sportsbook</span><strong>${selection(q)}</strong></div><div class="sharp-book-list">${bookRows || '<p class="sharp-no-books">No opposing sportsbook prices entered.</p>'}</div></div>
      <p class="sharp-detail-foot">${preview ? 'Demo prices and liquidity · not a live feed' : `Saved prices · updated ${age(q.ts)}`}</p>`;
  }
  return `<div class="sharp-workspace"><div class="sharp-page-bar"><div class="sharp-page-title"><h1>Smart Money</h1><span class="sharp-data-badge">${preview ? 'Demo data' : 'Saved prices'}</span></div><div class="sharp-toolbar"><label class="sharp-search">${icon('search')}<input id="sharp-search" type="search" placeholder="Search markets" aria-label="Search Smart Money markets" value="${esc(search)}" autocomplete="off"></label><button type="button" data-sharp-filters aria-expanded="${sharpFiltersOpen}">${icon('filter')}<span>Filters</span></button><button type="button" data-sharp-refresh title="Refresh comparison" aria-label="Refresh comparison">${icon('refresh')}</button></div></div>
    <div class="sharp-filter-tray" ${sharpFiltersOpen ? '' : 'hidden'}><label>League<select id="sharp-sport"><option value="">All leagues</option>${['NFL','MLB','NBA','WNBA','NHL','Soccer'].map(value => `<option value="${value}" ${sport === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Market<select id="sharp-market"><option value="">All markets</option>${[['moneyline','Moneyline'],['spread','Spreads'],['total','Totals'],['prop','Player props'],['alternate','Alternates'],['future','Futures']].map(([value,label]) => `<option value="${value}" ${marketType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Min liquidity<span class="sharp-currency">$</span><input id="sharp-min" type="number" min="0" step="100" value="${threshold}"></label><button type="button" data-sharp-clear>Clear filters</button><span class="sharp-result-count">${matches.length} ${matches.length === 1 ? 'opportunity' : 'opportunities'} · Highest liquidity</span></div>
    <div class="sharp-panels"><section class="sharp-list-panel" aria-label="Smart Money opportunities"><div class="sharp-card-list">${matches.length ? matches.map(card).join('') : `<div class="sharp-list-empty"><strong>No matching opportunities</strong><p>Try another league, market, or liquidity filter.</p><button type="button" data-sharp-clear>Clear filters</button></div>`}</div></section><section class="sharp-detail-panel" aria-label="Selected market comparison">${detail}</section></div><p class="sharp-method-note">${preview ? 'Sample matchups, schedules and prices for preview. ' : ''}Liquidity is the amount available at an exchange price; it does not verify betting activity.</p></div>`;
}


function renderFantasy() {
  return dfsWorkspace.render({initialSport:initialSport === 'ALL' ? '' : initialSport === 'SOCCER' ? 'Soccer' : initialSport || ''});
}

function renderOptimizer() {
  const rows = dfs().filter(x=>!isContestPlatform(x.app));
  const combos = [];
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
    if(rows[i].app!==rows[j].app||rows[i].player===rows[j].player)continue;
    const rules=state.paytables[rows[i].app]?.['2'];
    if(!Array.isArray(rules)||rules.length!==3)continue;
    const result=fantasySlip([rows[i],rows[j]],rules);
    if(result)combos.push({a:rows[i],b:rows[j],...result});
  }
  combos.sort((a,b)=>b.ev-a.ev);
  const ranking=combos.length?table(['Platform','First pick','Second pick','Both hit','Projected EV',''],combos.map(x=>`<tr><td><span class="tool-contract-brand">${brandMark(x.a.app)}${esc(x.a.app)}</span></td><td><strong>${esc(x.a.player)}</strong><small>${esc(x.a.side)} ${fmtLine(x.a.line)} ${esc(x.a.market)}</small><small>${percent(x.a.probability)} estimated</small></td><td><strong>${esc(x.b.player)}</strong><small>${esc(x.b.side)} ${fmtLine(x.b.line)} ${esc(x.b.market)}</small><small>${percent(x.b.probability)} estimated</small></td><td data-num>${percent(x.dist[2])}</td><td data-num class="${x.ev>0?'ev-positive':''}">${signed(x.ev)}</td><td>${button('Build slip',`data-optimize="${esc(x.a.id)},${esc(x.b.id)}"`)}</td></tr>`)):toolEmpty('Find your first combination','Add two player props from the same app and save its two-pick payout rule.',action('Add DFS prop','dfs')+button('Set payout rules','data-tool="slip"'),'settings');
  return `<div class="tool-stack">${toolStats([['Eligible combinations',combos.length],['Best projected EV',combos.length?signed(combos[0].ev):'—'],['Platforms',new Set(rows.map(x=>x.app)).size]])}${toolPanel('Ranked combinations','Your strongest estimated edge first. Open a combination to build the slip.',ranking)}${toolNote('Rankings use your entered hit rates and exact-hit payout tables. Picks are treated as independent; platform limits, fees and contest standings are not modeled.')}</div>`;
}

function renderSlip() {
  const apps=[...new Set(state.dfs.filter(x=>!isContestPlatform(x.app)).map(x=>x.app))];
  if(!fantasyApp||!apps.includes(fantasyApp))fantasyApp=apps[0]||'';
  const options=dfs().filter(x=>x.app===fantasyApp);
  const available=state.dfs.filter(x=>x.app===fantasyApp);
  fantasyIds=fantasyIds.filter(id=>available.some(x=>x.id===id));
  const selected=fantasyIds.map(id=>available.find(x=>x.id===id)).filter(Boolean);
  const rules=state.paytables[fantasyApp]?.[String(selected.length)]||[];
  const result=selected.length>=2&&rules.length===selected.length+1?fantasySlip(selected,rules,Number(fantasyStake)):null;
  const controls=`<div class="tool-form-grid"><label>Fantasy app<select id="ev-fantasy-app">${apps.length?apps.map(app=>`<option value="${esc(app)}" ${app===fantasyApp?'selected':''}>${esc(app)}</option>`).join(''):'<option value="">Add a prop to choose a platform</option>'}</select></label><label>Entry amount ($)<input id="ev-fantasy-stake" type="number" min="0.01" step="0.01" value="${esc(fantasyStake)}"></label></div>`;
  const choices=options.length?table(['Player','Prop','Est. hit rate',''],options.map(x=>`<tr><td><strong>${esc(x.player)}</strong><small>${esc(x.event)}</small></td><td>${esc(x.side)} ${fmtLine(x.line)}<small>${esc(x.market)}</small></td><td data-num>${percent(x.probability)}</td><td>${button(fantasyIds.includes(x.id)?'Remove':'Add pick',`data-fantasy="${esc(x.id)}"`)}</td></tr>`)):available.length?toolEmpty('No picks match your filters','Try a different sport or search. Your selected picks stay in the ticket.',button('Clear filters','data-tool-clear'),'search'):toolEmpty('Add your first player prop','Enter a player, line, and estimated hit rate to start a slip.',action('Add DFS prop','dfs'),'picks');
  const picked=selected.length?`<div class="tool-selected">${selected.map(x=>`<div class="tool-selected-item"><div><strong>${esc(x.player)}</strong><small>${esc(x.side)} ${fmtLine(x.line)} ${esc(x.market)} · ${percent(x.probability)}</small></div>${button('Remove',`data-fantasy="${esc(x.id)}"`)}</div>`).join('')}</div>`:toolEmpty('Choose your picks','Select at least two picks from the same app.','','picks');
  const payout=selected.length>=2?toolPanel('Payout rules','Total return multiplier for each number of correct picks, including the returned stake.',`<div class="tool-form-grid">${Array.from({length:selected.length+1},(_,hits)=>`<label>${hits} of ${selected.length} hits<input data-pay-hits="${hits}" type="number" min="0" step="0.01" value="${Number(rules[hits]||0)}"></label>`).join('')}</div><div class="ev-card-footer">${button('Save payout rules','id="ev-save-paytable"')}</div>${result?`<div class="ev-chip-row">${result.dist.map((p,i)=>`<span class="ev-chip">${i} hits · ${percent(p)} · ${Number(rules[i]||0)}×</span>`).join('')}</div>`:''}`):'';
  return `<div class="tool-stack"><div class="tool-two-column"><div class="tool-stack">${toolPanel('Build your entry','Use the payout rules for your chosen platform.',controls)}${toolPanel('Available picks','Compare your entered player lines and estimates.',choices)}${payout}</div><div class="tool-stack">${toolPanel('Your picks',selected.length+' selected',picked)}${toolReceipt('Expected return',result?money(result.payout*fantasyStake):'—',[['Entry amount',money(fantasyStake)],['Expected profit',result?money(result.expectedProfit):'—'],['Expected value',result?signed(result.ev):'—']],selected.length<2?'Select at least two picks to start the calculation.':result?'Calculated from the saved rules and your estimated hit rates.':'Save the payout rules for this entry size to calculate a return.')}</div></div>${toolNote('Picks are treated as independent. Pushes, ties, correlations, and platform settlement exceptions require adjustments to the payout rules.')}</div>`;
}

function renderFantasyAlerts() {
  const rules=state.alerts.filter(x=>x.kind==='fantasy-new'&&visible(x,['market','event']));
  const notes=state.notifications.filter(x=>rules.some(r=>r.id===x.ruleId));
  const watches=rules.length?`<div class="ev-list">${rules.map(r=>`<div class="ev-list-item"><div><strong>${esc(r.market||'Any market')}</strong><span>${esc(r.sport||'All sports')} · Minimum hit rate ${Number(r.threshold)||0}%</span><span class="tool-rule-status ${r.enabled===false?'is-paused':''}">${r.enabled===false?'Paused':'Watching'}</span></div><div>${button('Edit',`data-edit="alert" data-id="${esc(r.id)}"`)}${button(r.enabled===false?'Resume':'Pause',`data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>`:toolEmpty('Watch the props you care about','Choose a market and a minimum estimated hit rate. New matching entries will appear in your activity.',action('Create a fantasy alert','alert','data-kind="fantasy-new"'),'bookmark');
  return `<div class="tool-stack">${toolStats([['Active watches',rules.filter(x=>x.enabled!==false).length],['Paused',rules.filter(x=>x.enabled===false).length],['Unread matches',notes.filter(x=>!x.read).length]])}<div class="tool-two-column">${toolPanel('Your watchlist','Rules apply when new player props enter this workspace.',watches)}${toolPanel('Recent activity','Matches from your saved fantasy alerts.',notes.length?renderNotifications(notes):toolEmpty('You’re all caught up','New matching props will appear here as you add or import data.','','live'))}</div>${toolNote('These are local workspace alerts. They do not fetch player props or send push notifications while the page is closed.')}</div>`;
}

function renderNotifications(notes) {
  return notes.length ? `<div class="ev-list">${notes.map(x => `<div class="ev-list-item"><div><strong>${esc(x.message)}</strong><span> ${new Date(x.ts).toLocaleString()} ${x.read ? '· Read' : '· New'}</span></div>${button('Dismiss', `data-notification-dismiss="${esc(x.id)}"`)}</div>`).join('')}</div>` : empty('No alerts fired', 'Matching new entries will appear here after you add or update data.');
}

function renderPrediction() {
  const contracts=state.contracts.filter(x=>visible(x,['event','platform'])&&(!predictionPlatform||canonicalPlatform(x.platform)===predictionPlatform));
  const contractIds=new Set(contracts.map(x=>x.id));
  const names=[...new Set([...state.traders.filter(x=>contractIds.has(x.contractId)).map(x=>x.name),...state.trades.filter(x=>contractIds.has(x.contractId)).map(x=>x.trader)])];
  if(!traderName||!names.includes(traderName))traderName=names[0]||'';
  const positions=state.traders.filter(x=>x.name===traderName&&contractIds.has(x.contractId));
  const trades=state.trades.filter(x=>x.trader===traderName&&contractIds.has(x.contractId));
  const snapshots=state.contractHistory.filter(h=>contractIds.has(h.contractId)).slice().reverse().slice(0,100);
  const controls=`<div class="tool-board-toolbar"><h2>Markets you follow</h2><div><label>Platform<select id="ev-prediction-platform"><option value="">All prediction platforms</option>${[...new Set([...PREDICTION_PLATFORMS,...state.contracts.map(c=>canonicalPlatform(c.platform))])].map(name=>`<option value="${esc(name)}" ${predictionPlatform===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label>${action('Add exchange price','quote','data-exchange="true"')}</div></div>`;
  const cards=contracts.length?`<div class="tool-contract-grid">${contracts.map(c=>`<article class="tool-contract"><div class="tool-contract-brand">${brandMark(c.platform)}${esc(platformLabel(c.platform))} ${origin(c)}</div><h2>${esc(c.event)}</h2><div class="tool-contract-prices"><div><span>Yes bid</span><strong>${Number(c.bid).toFixed(0)}¢</strong></div><div><span>Yes ask</span><strong>${Number(c.ask).toFixed(0)}¢</strong></div></div><footer><small>${(Number(c.ask)-Number(c.bid)).toFixed(0)}¢ spread · ${Number(c.volume).toLocaleString()} contracts<br>${age(c.ts)}</small>${button('Update',`data-edit="contract" data-id="${esc(c.id)}"`)}</footer></article>`).join('')}</div>`:toolPanel('Market board','Bids and asks in cents per $1 settlement.',toolEmpty('Start following a market','Add a contract’s bid, ask, and available depth to start recording its price history.',action('Add contract','contract'),'research'));
  const positionTable=positions.length?table(['Contract','Side','Quantity','Entry','Mark / unrealized P&L',''],positions.map(p=>{const c=state.contracts.find(x=>x.id===p.contractId);const mark=c?p.side==='No'?100-Number(c.ask):Number(c.bid):NaN;const profit=Number.isFinite(mark)?(mark-Number(p.entry))*Number(p.quantity)/100:NaN;return `<tr><td><strong>${esc(c?.event||'Contract missing')}</strong></td><td>${esc(p.side)}</td><td data-num>${Number(p.quantity)}</td><td data-num>${Number(p.entry)}¢</td><td data-num class="${profit>=0?'ev-positive':'ev-negative'}">${Number.isFinite(mark)?mark+'¢':'—'}<small>${money(profit)}</small></td><td>${button('Edit',`data-edit="trader" data-id="${esc(p.id)}"`)}</td></tr>`;})):toolEmpty('No positions recorded','Add a position for a saved contract to compare its entry price with the current mark.',action('Add position','trader'),'picks');
  const historyTable=snapshots.length?table(['Observed','Contract','Bid','Ask','Depth'],snapshots.map(h=>`<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c=>c.id===h.contractId)?.event||'Contract missing')}</td><td data-num>${Number(h.bid)}¢</td><td data-num>${Number(h.ask)}¢</td><td data-num>${Number(h.volume).toLocaleString()}</td></tr>`)):toolEmpty('Price history starts with an update','Each contract edit saves its bid, ask, and depth.','','trends');
  const tradeTable=trades.length?table(['Time','Contract','Side','Quantity','Price',''],trades.map(t=>`<tr><td>${new Date(t.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c=>c.id===t.contractId)?.event||'Contract missing')}</td><td>${esc(t.side)}</td><td data-num>${Number(t.quantity)}</td><td data-num>${Number(t.price)}¢</td><td>${button('Edit',`data-edit="trade" data-id="${esc(t.id)}"`)}</td></tr>`)):toolEmpty('Keep a record of your trades','Record buys and sells against the contracts in your workspace.',action('Add trade','trade'),'paper');
  return `<div class="tool-stack">${toolStats([['Contracts',contracts.length],['Positions',positions.length],['Recorded trades',trades.length]])}${controls}${cards}${toolPanel('Positions','Marks use the executable bid for Yes and 100 − ask for No.',positionTable,{actions:`<label>Trader<select id="ev-trader-filter">${names.length?names.map(name=>`<option value="${esc(name)}" ${name===traderName?'selected':''}>${esc(name)}</option>`).join(''):'<option>No traders yet</option>'}</select></label>${action('Add position','trader')}`})}${toolPanel('Order book history','The latest 100 snapshots for the selected contracts.',historyTable)}${toolPanel('Trade history','Your saved buys and sells.',tradeTable,{actions:action('Add trade','trade')})}${toolNote('Prices and trades are recorded manually. Position marks exclude fees and partial fills; no trades are placed through this workspace.')}</div>`;
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
  return `<div class="ev-stack">${toolStats([['Player profiles',profiles.length],['Results recorded',rows.length],['Paired games',paired.length]])}${profiles.length ? table(['Player / prop', 'Last 5', 'Last 10', 'All recorded', 'Results'], profiles.map(key => { const [player,market,line] = key.split('|'); const games = rows.filter(x => `${x.player}|${x.market}|${x.line}` === key).sort((a,b) => b.date.localeCompare(a.date)); const rate = n => percent(games.slice(0,n).filter(x => Number(x.result) > Number(x.line)).length / Math.min(n,games.length)); return `<tr><td><strong>${esc(player)}</strong><small>${esc(market)} · Over ${esc(line)}</small></td><td data-num>${rate(5)}<small>${Math.min(5,games.length)} games</small></td><td data-num>${rate(10)}<small>${Math.min(10,games.length)} games</small></td><td data-num>${rate(games.length)}<small>${games.length} games</small></td><td><div class="ev-mini-bars" aria-label="Recent results">${games.slice(0,10).reverse().map(g => `<i title="${esc(g.game)}: ${esc(g.result)}" style="height:${Math.max(5, Math.min(100, Number(g.result)/Number(g.line)*65))}%"></i>`).join('')}</div></td></tr>`; })) : toolEmpty('Build a picture of recent form','Add game results to compare recent hit rates and player-prop correlations.',action('Add result','result'),'trends')}<div class="ev-card"><h3>Paired-game correlation</h3><p>Compare two props recorded against the same game IDs.</p><div class="ev-fields"><label>First prop<select id="ev-trend-a">${options.map(x => `<option value="${esc(x)}" ${x === trendA ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><label>Second prop<select id="ev-trend-b">${options.map(x => `<option value="${esc(x)}" ${x === trendB ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><div class="ev-result">${Number.isFinite(correlation) ? `Pearson r <strong>${correlation.toFixed(2)}</strong> across ${paired.length} matching game IDs` : `Need at least three matching game IDs with variation in both results. Currently ${paired.length}.`}</div></div></div><p class="ev-caption">Recent hit rates describe entered historical games. They do not estimate a future hit probability; correlation is descriptive and needs aligned game IDs.</p></div>`;
}

function renderLineAlerts() {
  const all = state.history.filter(h => (!sport || !h.sport || h.sport === sport) && (!search || ['event','market','book','side'].some(k => filterText(h[k])))).sort((a,b) => b.ts.localeCompare(a.ts));
  const rules = state.alerts.filter(x => x.kind !== 'fantasy-new' && visible(x,['event','market']));
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack">${toolStats([['Active watches',rules.filter(x=>x.enabled!==false).length],['Unread alerts',notes.filter(x=>!x.read).length],['Price snapshots',all.length]])}<div class="tool-two-column"><div><div class="ev-card"><h3>Price and EV watches</h3><p>Alerts fire in this browser when a newly saved or imported record meets a threshold. They do not poll sportsbooks.</p><div class="ev-card-footer">${action('New price, EV or movement alert', 'alert')}</div>${rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${r.kind === 'ev' ? 'EV at least ' + r.threshold + '%' : r.kind === 'movement' ? 'Line change at least ' + r.threshold : 'American price at least ' + oddsLabel(r.threshold)}</strong><span> ${esc(r.sport || 'All sports')} · ${esc(r.event || 'Any event')} · ${esc(r.market || 'Any market')} · ${r.liveOnly ? 'Live only' : 'All'} · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : toolEmpty('Choose your price target','Set a price, EV threshold, or line movement to watch.',action('Create alert','alert'),'live')}</div></div>${toolPanel('Alert activity','Matches from your saved rules.',notes.length?renderNotifications(notes):toolEmpty('You’re all caught up','Matching price updates will appear here.','','live'))}</div><h3 class="ev-section-title">Recorded line movement</h3>${all.length ? table(['Time', 'Market', 'Book', 'Side', 'Line', 'Price', 'Change'], all.slice(0,200).map(h => { const sequence = state.history.filter(x => x.quoteId === h.quoteId), index = sequence.findIndex(x => x.id === h.id), prior = sequence[index-1]; return `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(h.event)}<small>${esc(h.market)}</small></td><td>${esc(h.book)}</td><td>${esc(h.side)}</td><td data-num>${fmtLine(h.line)}</td><td data-num>${oddsLabel(h.odds)}</td><td>${prior ? `${oddsLabel(prior.odds)} → ${oddsLabel(h.odds)}${String(prior.line) !== String(h.line) ? ` · line ${fmtLine(prior.line)} → ${fmtLine(h.line)}` : ''}` : 'First entry'}</td></tr>`; })) : toolEmpty('Follow a line from its first price','Each new or edited price creates a timestamped snapshot.',action('Add price','quote'),'trends')}</div>`;
}

const FIELDS = {
  quote: [
    ['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']], ['event','Event / game','text',true], ['market','Market name','text',true],
    ['type','Market type','select',true,[['game','Two-way game line'],['three-way','Three-way game line'],['spread','Spread'],['total','Total'],['prop','Player prop'],['alternate','Alternate line'],['future','Future']]], ['outcomes','Exhaustive outcomes (multiway)','number',false], ['line','Line','text',false], ['side','Side / selection','text',true],
    ['book','Sportsbook / exchange','platform',true,[...SPORTSBOOK_PLATFORMS,...EXCHANGE_PLATFORMS]], ['odds','American odds','number',true], ['live','In game quote','checkbox',false],
    ['exchange','Exchange offer','checkbox',false], ['liquidity','Available liquidity ($)','number',false], ['ts','Observed at','datetime-local',true]
  ],
  dfs: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['event','Event / game','text',false],['player','Player','text',true],['team','Team abbreviation (logo)','text',false],['market','Prop market','text',true],['line','Line','number',true],['side','Pick','select',true,['Over','Under']],['app','Fantasy app','select',true,DFS_PLATFORMS],['probability','Estimated hit probability (0–1)','number',true]],
  contract: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['platform','Platform','platform',true,PREDICTION_PLATFORMS],['event','Contract / event','text',true],['bid','Best Yes bid (¢)','number',true],['ask','Best Yes ask (¢)','number',true],['last','Last price (¢)','number',false],['volume','Available depth (contracts)','number',true]],
  trader: [['name','Trader name','text',true],['platform','Platform','platform',true,PREDICTION_PLATFORMS],['contractId','Contract','contract',true],['side','Position side','select',true,['Yes','No']],['quantity','Contracts held','number',true],['entry','Entry price (¢)','number',true]],
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
  if (type === 'platform') return `<label>${esc(label)}<input name="${name}" list="ev-platform-${name}" value="${esc(value)}" maxlength="180" ${required ? 'required' : ''} placeholder="Choose or enter a platform"><datalist id="ev-platform-${name}">${platformOptions(options)}</datalist></label>`;
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
  if (type === 'bet') return location.assign(betTrackerUrl(sport.toLowerCase()));
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
  for (const name of ['book','app','platform']) if (item[name]) item[name] = canonicalPlatform(item[name]);
  if (editing.type === 'quote' && EXCHANGE_PLATFORMS.includes(item.book)) item.exchange = true;
  if (editing.type === 'quote' && !Number.isFinite(decimal(item.odds))) return failForm('Enter valid American odds: +100 or higher, or −100 or lower.'), null;
  if (editing.type === 'quote' && item.outcomes !== '' && !(Number.isInteger(item.outcomes) && item.outcomes >= 2 && item.outcomes <= 64)) return failForm('Exhaustive outcome count must be a whole number from 2 to 64.'), null;
  if (editing.type === 'quote' && item.exchange && !(Number(item.liquidity) >= 0)) return failForm('Exchange liquidity must be zero or higher.'), null;
  if (editing.type === 'dfs' && !isDfsPlatform(item.app)) return failForm('Choose a supported DFS platform.'), null;
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
$('#ev-books').addEventListener('click', event => {
  const remove = event.target.closest('[data-book-remove]');
  if (remove) {
    selectedSportsbooks = new Set(selectedSportsbooks ?? sportsbookOptions());
    selectedSportsbooks.delete(remove.dataset.bookRemove);
    render();
    return;
  }
  if (event.target.closest('[data-open-book-menu]')) { bookMenuOpen = true; renderBooks(); $('#ev-books-more').focus(); return; }
  const target = event.target.closest('[data-book]');
  if (target) { bookmaker = target.dataset.book; render(); }
});
$('#ev-books-more').addEventListener('click', () => {
  if (!$('.ev-bookbar').classList.contains('ev-bookbar-select')) { showAllBooks = !showAllBooks; renderBooks(); return; }
  bookMenuOpen = !bookMenuOpen;
  renderBooks();
  if (bookMenuOpen) $('#ev-book-menu input')?.focus();
});
$('#ev-book-menu').addEventListener('change', event => {
  const option = event.target.closest('[data-book-option]');
  if (!option) return;
  selectedSportsbooks = new Set(selectedSportsbooks ?? sportsbookOptions());
  if (option.checked) selectedSportsbooks.add(option.dataset.bookOption);
  else selectedSportsbooks.delete(option.dataset.bookOption);
  render();
  [...document.querySelectorAll('#ev-book-menu [data-book-option]')].find(input => input.dataset.bookOption === option.dataset.bookOption)?.focus();
});
$('#ev-book-menu').addEventListener('click', event => {
  if (event.target.closest('[data-book-select-all]')) selectedSportsbooks = null;
  else if (event.target.closest('[data-book-clear]')) selectedSportsbooks = new Set();
  else return;
  render();
  $('#ev-books-more').focus();
});
document.addEventListener('pointerdown', event => { if (bookMenuOpen && !$('.ev-bookbar').contains(event.target)) { bookMenuOpen = false; renderBooks(); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && bookMenuOpen) { bookMenuOpen = false; renderBooks(); $('#ev-books-more').focus(); } });
new ResizeObserver(layoutSelectedBooks).observe($('.ev-book-picker'));
$('#ev-find').addEventListener('click', () => $('#ev-view').scrollIntoView({ behavior:'smooth', block:'start' }));
$('#ev-timing-toggle').addEventListener('click', () => {
  if (active !== 'ev-pre' && active !== 'ev-live') return;
  active = active === 'ev-live' ? 'ev-pre' : 'ev-live';
  detailQuoteId = '';
  bookMenuOpen = false;
  history.replaceState(null, '', location.pathname + location.search + '#' + active);
  render();
});
document.querySelector('[data-ev-focus-search]')?.addEventListener('click', () => { if (active === 'odds') { $('#os-search')?.focus(); return; } if (active === 'fantasy') { $('#dfs-search')?.focus(); return; } document.body.classList.toggle('ev-search-open'); $('#ev-search').focus(); });
$('#ev-search').addEventListener('keydown', event => { if (event.key === 'Escape') { document.body.classList.remove('ev-search-open'); document.querySelector('[data-ev-focus-search]')?.focus(); } });
$('#ev-odds-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-odds-tab]'); if (tab) { marketType = tab.dataset.oddsTab; render(); } });
$('#ev-reset-filters').addEventListener('click', () => { bookmaker = ''; selectedSportsbooks = null; bookMenuOpen = false; marketType = ''; search = ''; evLeague = ''; evDateRange = 'week'; evMaxOdds = '200'; evSort = 'ev'; designSort = 'recommended'; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; if (sport !== '') { sport = ''; history.replaceState(null, '', location.pathname + '?sport=all' + location.hash); } render(); });
$('#ev-market-type').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-market').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-league').addEventListener('change', event => { evLeague = event.target.value; render(); });
$('#ev-reference-date').addEventListener('change', event => { evDateRange = event.target.value; render(); });
$('#ev-reference-max-odds').addEventListener('change', event => { evMaxOdds = event.target.value; render(); });
$('#ev-sort-mode').addEventListener('change', event => { if (['ev-pre','ev-live'].includes(active)) evSort = event.target.value; else designSort = event.target.value; render(); });
$('.ev-filter-panel').addEventListener('change', event => {
  const control = event.target.closest('[data-filter]');
  if (!control) return;
  const value = control.value;
  switch (control.dataset.filter) {
    case 'sport': sport = value; history.replaceState(null, '', location.pathname + '?sport=' + encodeURIComponent((sport || 'all').toLowerCase()) + location.hash); break;
    case 'platform': bookmaker = value; break;
    case 'league': designFilters.league = value; break;
    case 'market': marketType = value; break;
    case 'date': designFilters.date = value; break;
    case 'period':
      if (active === 'arb-pre' || active === 'arb-live') {
        active = value === 'live' ? 'arb-live' : 'arb-pre';
        designFilters.period = 'all';
        history.replaceState(null, '', location.pathname + location.search + '#' + active);
      } else designFilters.period = value;
      break;
    case 'side': designFilters.side = value; break;
    case 'odds': designFilters.maxOdds = value; break;
    case 'edge': designFilters.minEdge = value; break;
    case 'liquidity': localStorage.setItem('sportslab-ev-sharp-min', String(Math.max(0, Number(value) || 0))); break;
    case 'stake': stake = Math.max(1, Number(value) || 1); break;
  }
  render();
});
$('#ev-sharp-min').addEventListener('change', event => { localStorage.setItem('sportslab-ev-sharp-min', String(Math.max(0,Number(event.target.value)||0))); render(); });
const saveEvDisplay = () => { try { localStorage.setItem('sportslab-ev-display-v1', JSON.stringify({bankroll,kelly,flatMultiplier})); } catch { /* Display settings stay usable this session. */ } };
$('#ev-ev-bankroll').addEventListener('change', event => { bankroll = Math.max(1, Number(event.target.value) || 5000); saveEvDisplay(); render(); });
$('#ev-kelly').addEventListener('change', event => { if (['ev-pre','ev-live'].includes(active)) kelly = Math.max(0, Math.min(1, Number(event.target.value) || 0)); else flatMultiplier = Math.max(.05, Math.min(10, Number(event.target.value) || 1)); saveEvDisplay(); render(); });
const kellyInput = $('#ev-kelly');
const kellyWrap = kellyInput.parentElement;
const kellyLabel = kellyWrap.parentElement;
const kellyField = document.createElement('div');
kellyField.className = 'ev-multiplier-field';
kellyLabel.before(kellyField);
kellyField.append(kellyLabel, kellyWrap);
kellyLabel.htmlFor = 'ev-kelly';
const kellyStepper = document.createElement('div');
kellyStepper.className = 'ev-kelly-stepper';
kellyStepper.innerHTML = '<button type="button" data-step="up" aria-label="Increase multiplier"></button><button type="button" data-step="down" aria-label="Decrease multiplier"></button>';
kellyWrap.append(kellyStepper);
kellyStepper.addEventListener('click', event => {
  const button = event.target.closest('button[data-step]');
  if (!button || kellyInput.disabled) return;
  if (button.dataset.step === 'up') kellyInput.stepUp(); else kellyInput.stepDown();
  kellyInput.dispatchEvent(new Event('change', { bubbles: true }));
});
$('#ev-detail-close').addEventListener('click', () => $('#ev-detail').close());
$('#ev-detail').addEventListener('click', event => {
  if (event.target === $('#ev-detail')) { $('#ev-detail').close(); return; }
  const control = event.target.closest('button');
  if (!control) return;
  if (control.dataset.compareQuote) return showBetComparison(control.dataset.compareQuote);
  const editKind = control.dataset.compareEdit ? 'quote' : control.dataset.compareEditDfs ? 'dfs' : control.dataset.compareEditBet ? 'bet' : '';
  if (editKind) { const id = control.dataset.compareEdit || control.dataset.compareEditDfs || control.dataset.compareEditBet; $('#ev-detail').close(); return openForm(editKind, id); }
  if (control.dataset.compareParlay) { const id = control.dataset.compareParlay; $('#ev-detail').close(); parlayIds = [...new Set([...parlayIds,id])]; return setTool('parlay'); }
  if (control.dataset.compareDfs) { const id = control.dataset.compareDfs, item = state.dfs.find(entry => entry.id === id); $('#ev-detail').close(); if (item && item.app !== fantasyApp) { fantasyApp = item.app; fantasyIds = []; } fantasyIds = [...new Set([...fantasyIds,id])]; return setTool('slip'); }
});
$('#ev-sport').addEventListener('change', event => {
  sport = event.target.value;
  location.assign(`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
});
$('#ev-reference-sport').addEventListener('change', event => {
  sport = event.target.value;
  location.assign(`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
});
$('#ev-search').addEventListener('input', event => { search = event.target.value.toLowerCase().trim(); evVisibleCount=40;render(); });
$('#ev-add-quote').addEventListener('click', () => active === 'fantasy' ? openForm('dfs') : openForm('quote', null, active === 'sharp' ? { exchange:true } : ['ev-live','arb-live'].includes(active) ? { live:true } : {}));
$('#ev-sync-api').addEventListener('click', () => { void feedControls.refresh(); });
$('#ev-view-actions').addEventListener('click', event => { const target = event.target.closest('[data-add]'); if (target) openForm(target.dataset.add, null, { live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true', kind:target.dataset.kind || 'price' }); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-remove-examples]')) return; for (const key of arrays) state[key] = state[key].filter(x => x.source !== 'example'); state.example = false; parlayIds = []; fantasyIds = []; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-load-examples]')) return; const demo = exampleWorkspace(); for (const key of arrays) state[key].push(...demo[key]); state.paytables = { ...demo.paytables, ...state.paytables }; state.example = true; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-replay-live]')) return; for (const quote of state.quotes.filter(q => q.live && q.source === 'example')) { quote.ts = now(); snapshotQuote(quote); } commit(); });
$('#ev-view').addEventListener('keydown', event => {
  if (active === 'odds') oddsScreen.keydown(event);
  if (event.target.matches('.ev-arb-leg[data-open-quote],.ev-reference-card[data-open-quote]') && ['Enter',' '].includes(event.key)) {event.preventDefault();showBetComparison(event.target.dataset.openQuote);}
});
$('#ev-view').addEventListener('click', event => {
  if (active === 'odds' && oddsScreen.click(event)) return;
  if (active === 'fantasy' && dfsWorkspace.click(event)) return;
  const target = event.target.closest('button');
  if (!target) {
    const row = event.target.closest('[data-open-quote],[data-open-dfs],[data-open-tracked]');
    if (row && !event.target.closest('a,input,select,summary')) return showBetComparison(row.dataset.openQuote || row.dataset.openDfs || row.dataset.openTracked, row.dataset.openDfs ? 'dfs' : row.dataset.openTracked ? 'tracked' : 'quote');
    return;
  }
  if (target.dataset.openDfs) return showBetComparison(target.dataset.openDfs,'dfs');
  if (target.dataset.openTracked) return showBetComparison(target.dataset.openTracked,'tracked');
  if (target.dataset.sharpSelect) {
    const id = target.dataset.sharpSelect;
    if (id !== expandedSharpKey) {
      expandedSharpKey = id;
      sharpSelectedBook = '';
      inlineDetail = null;
      render();
      $('#ev-view').querySelector('[data-sharp-select="' + CSS.escape(id) + '"]')?.focus({preventScroll:true});
      return;
    }
    return showBetComparison(id);
  }
  if (target.dataset.sharpBook) { sharpSelectedBook = target.dataset.sharpBook; return render(); }
  if (target.hasAttribute('data-sharp-jump')) { $('#ev-view .sharp-books')?.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest' }); return; }
  if (target.hasAttribute('data-sharp-filters')) { sharpFiltersOpen = !sharpFiltersOpen; return render(); }
  if (target.hasAttribute('data-sharp-refresh')) { render(); $('#ev-notice').textContent = state.quotes.some(q => q.source !== 'example') ? 'Comparison refreshed from saved prices.' : 'Demo comparison refreshed.'; return; }
  if (target.hasAttribute('data-sharp-clear')) { search = ''; marketType = ''; bookmaker = ''; sport = ''; history.replaceState(null, '', `${location.pathname}?sport=all${location.hash}`); localStorage.setItem('sportslab-ev-sharp-min','0'); return render(); }
  if (target.dataset.sort) { evSort = target.dataset.sort; return render(); }
  if (target.dataset.detail) return openDetail(target.dataset.detail,target);
  if (target.hasAttribute('data-ev-more')) { const top=window.scrollY;evVisibleCount+=40;render();window.scrollTo({top,behavior:'instant'});return; }
  if (target.dataset.arbCalc) {
    const source = quoteSource();
    const first = source.find(quote => quote.id === target.dataset.arbCalc);
    const second = source.find(quote => quote.id === target.dataset.arbHedge);
    if (first && second) openArbCalculator({ first, second, stake, flatMultiplier, bankroll, brandMark, trigger:target });
    return;
  }
  if (target.dataset.sharpExpand) { expandedSharpKey = expandedSharpKey === target.dataset.sharpExpand ? '__closed__' : target.dataset.sharpExpand; return render(); }
  if (target.dataset.tool) return setTool(target.dataset.tool);
  if (target.hasAttribute('data-tool-clear')) { search = ''; sport = ''; history.replaceState(null, '', `${location.pathname}?sport=all${location.hash}`); return render(); }
  if (target.hasAttribute('data-replay-live')) return $('#ev-view-actions [data-replay-live]')?.click();
  if (target.hasAttribute('data-arb-clear')) return $('#ev-reset-filters').click();
  if (target.dataset.add) return openForm(target.dataset.add, null, { kind:target.dataset.kind || 'price', live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true' });
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
  if (active === 'odds' && oddsScreen.change(event)) return;
  if (active === 'fantasy' && dfsWorkspace.change(event)) return;
  const t = event.target;
  if (t.hasAttribute('data-tool-sport')) { sport = t.value; history.replaceState(null, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`); render(); return; }
  if (t.id === 'sharp-sport') { sport = t.value; history.replaceState(null, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`); render(); }
  else if (t.id === 'sharp-market') { marketType = t.value; render(); }
  else if (t.id === 'sharp-min') { localStorage.setItem('sportslab-ev-sharp-min', String(Math.max(0,Number(t.value)||0))); render(); }
  else if (t.id === 'ev-bankroll') { stake = Math.max(.01,Number(t.value)||100); render(); }
  else if (t.dataset.promo) { promoInput[t.dataset.promo] = t.dataset.promo === 'kind' ? t.value : Number(t.value); render(); }
  else if (t.id === 'ev-fantasy-app') { fantasyApp = t.value; fantasyIds = []; render(); }
  else if (t.id === 'ev-fantasy-stake') { fantasyStake = Math.max(.01,Number(t.value)||10); render(); }
  else if (t.id === 'ev-trader-filter') { traderName = t.value; render(); }
  else if (t.id === 'ev-prediction-platform') { predictionPlatform = t.value; render(); }
  else if (t.id === 'ev-trend-a') { trendA = t.value; render(); }
  else if (t.id === 'ev-trend-b') { trendB = t.value; render(); }
});
$('#ev-view').addEventListener('input', event => {
  if (active === 'odds' && oddsScreen.input(event)) return;
  if (active === 'fantasy' && dfsWorkspace.input(event)) return;
  if (event.target.hasAttribute('data-tool-search')) {
    const position = event.target.selectionStart; search = event.target.value.toLowerCase(); render();
    const input = $('[data-tool-search]'); input?.focus(); input?.setSelectionRange(position,position); return;
  }
  if (event.target.id !== 'sharp-search') return;
  const position = event.target.selectionStart;
  search = event.target.value.toLowerCase().trim();
  render();
  const input = $('#sharp-search');
  input?.focus();
  input?.setSelectionRange(position,position);
});
$('#ev-view').addEventListener('keydown', event => { if (active === 'fantasy') dfsWorkspace.keydown(event); });
$('#ev-view').addEventListener('error', event => { if (event.target.matches?.('[data-dfs-image]')) event.target.hidden = true; }, true);
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
    feedControls.pause(); state = normalize(data); evaluateAlerts(); persist(); $('#ev-import-dialog').close(); render();
  } catch (error) { $('#ev-import-error').textContent = error.message; }
});
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (toolMeta[key]) { active = key; bookmaker = ''; marketType = ''; showAllBooks = false; bookMenuOpen = false; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; render(); } });
setInterval(() => { if (EV_DEMO_MODE) refreshDemoObservations(state); if (inlineDetail || document.hidden) return; if (active === 'odds') {if (!document.querySelector('dialog[open]')) oddsScreen.refresh();return;} if (active === 'arb-live' && ((!hasApiSnapshot() && isArbitrageDemo(state.quotes)) || document.activeElement?.closest('.ev-control-grid,.bet-inline-mount'))) return; if (['ev-live','arb-live','sharp','line-alerts'].includes(active) && !bookMenuOpen && !document.querySelector('dialog[open]')) render(); }, 15_000);
$('.ev-header-actions').append($('.ev-sidebar'));
$('#main').append($('#ev-notice'));
document.addEventListener(STATE_CHANGE_EVENT, event => {
  sportsbookState = event.detail.state;
  selectedSportsbooks = null; bookmaker = ''; bookMenuOpen = false; detailQuoteId = ''; sharpSelectedBook = '';
  render();
});
feedControls = createQuoteFeedControls({ sync: syncLocalApi, getState: () => state, getTool: () => active, canRefresh: () => !bookMenuOpen && !document.querySelector('dialog[open]') && !document.activeElement?.closest('.ev-control-grid,.bet-inline-mount') });
persist(); render();
