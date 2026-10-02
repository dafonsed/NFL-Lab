import { browserAlertsControl, deliverAlerts, toggleBrowserAlerts } from './alert-delivery.js?v=1';
import { wagerCard } from './ev-bet-card.js';
import { renderEvBoard, renderEvBoardDetail, renderBetPanel, boostedOffer, boardIcon, bookLogo, startLabel, selectionText } from './ev-board.js?v=5';
import { createEvSuite, EV_SUITE_TOOLS } from './ev-suite.js?v=local-suite-5';
import { computeAdvancedEv, consensusPrice, constrainedArb, middleOutcomes, devig } from './ev-advanced-math.js';
import { readSuiteState, writeSuiteState } from './ev-suite-storage.js?v=2';
import { installMobileWorkspace, quoteRevision, preserveReadingOrder } from './ev-mobile.js';
import { accountStorage as localStorage, accountReady, getAccountPreferences, accountSyncState } from './account-sync.js';
await accountReady;
import { secondaryShell, toolHero, accentTitle, toolPanel, toolEmpty, toolStats, toolNote, toolReceipt, toolBoard, boardTicket, boardButton, boardIconButton, boardToggle } from './ev-secondary-views.js?v=5';
import { SECONDARY_TOOLS } from './ev-tool-catalog.js';
import { emptyWorkspace, purgeDemoData, clearLegacyDemoStorage } from './ev-workspace-clean.js?v=1';
import { createQuoteFeedControls, toolDataLabel } from './ev-feed.js?v=7';
import { loadFeed, loadDfsFeed, dfsPicks, payoutTables, knownSport } from './ev-feed-normalize.js?v=7';
import { readQuoteCache, createThrottledCacheWriter } from './ev-quote-cache.js?v=1';
import { START_WINDOWS, MIN_ODDS, MIN_EV, MIN_WIN_CHANCE, TOOL_FILTERS, TOOL_FILTER_DEFAULTS, activeFilterCount, startsWithin, oddsWithin, quoteMatches, readToolFilters, saveToolFilters, toolFilterBar } from './ev-filters.js?v=2';
import { SITE_PLATFORMS, SPORTSBOOK_PLATFORMS, PREDICTION_PLATFORMS, EXCHANGE_PLATFORMS, canonicalPlatform, platformAsset, platformLabel, platformOptions, isContestPlatform } from './platform-catalog.js';
import { betTrackerUrl, legacyBetTrackerUrl } from './navigation.js?v=tracker-1';
import { decimal, implied, expectedReturn, money, percent, signed, probabilityToAmerican, fairProbability, fresh, groups, marketKey, evRows, fractionalKellyStake, holdRows, arbitrage, arbitrageRows, middleRows, promoConversion, parlay, fantasySlip, closingLineValue, gradedBet, pearson, sharpMatches, alertMatches } from './ev-core.js?v=3';
import { teamMark, leagueMark } from './sports-identity.js';
import { comparisonAnnotations } from './bet-comparison.js?v=4';
import { inlineBetCard as betComparisonCard, bindInlineComparison as bindComparison } from './bet-inline.js?v=card-click-3';
import { openArbCalculator } from './arb-calculator.js?v=2';
import { openLineHistory, buildLineSeries } from './line-history.js?v=1';
import { createDfsWorkspace, DFS_PLATFORMS, isDfsPlatform, withStandardPaytables, paytableSource, breakEven } from './dfs-workspace.js?v=15-devig';
import { createOddsScreen } from './odds-screen.js?v=9';

import {readSportsbookState, saveSportsbookState, sportsbookAvailable, availableSportsbookQuotes, STATE_CHANGE_EVENT} from './sportsbook-availability.js';

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
  ['Records', 'line-alerts', 'Movement & price alerts', 'Review price snapshots and manage local threshold alerts.'],
  ...EV_SUITE_TOOLS
];
const toolMeta = Object.fromEntries(TOOLS.map(row => [row[1], row]));
const SUITE_ICONS = { ledger:'bookmark', settings:'filter', performance:'performance', history:'trends', 'fantasy-lab':'picks', wallets:'research', lineups:'players', promotions:'tag', alerts:'live', connections:'settings' };
const arrays = ['quotes', 'history', 'dfs', 'contracts', 'contractHistory', 'traders', 'trades', 'bets', 'results', 'alerts', 'notifications', 'slips'];
function load() {
  clearLegacyDemoStorage(window.localStorage, window.sessionStorage);
  clearLegacyDemoStorage(localStorage, null);
  // Feed quotes come from the IndexedDB cache after startup (see hydrateQuoteCache).
  const withQuotes = data => normalize({ ...data, quotes: [], history: [] });
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE));
    if (parsed?.version === 1) {
      // Earlier releases seeded example and demo records. The workspace now holds only feed
      // quotes and records the member entered, so remove any that were saved.
      if (purgeDemoData(parsed)) localStorage.setItem(STORE, JSON.stringify(parsed));
      return withQuotes(parsed);
    }
  } catch { /* Browser storage can be disabled. */ }
  return withQuotes(emptyWorkspace());
}
function normalize(data) {
  for (const key of arrays) if (!Array.isArray(data[key])) data[key] = [];
  // Prices come only from the quote API. Saved manual or imported prices are dropped.
  data.quotes = data.quotes.filter(x => x?.source === 'local-api');
  const quoteIds = new Set(data.quotes.map(x => x.id)), contractIds = new Set(data.contracts.map(x => x.id));
  data.history = data.history.filter(x => quoteIds.has(x.quoteId));
  data.contractHistory = data.contractHistory.filter(x => contractIds.has(x.contractId));
  if (!data.paytables || typeof data.paytables !== 'object' || Array.isArray(data.paytables)) data.paytables = {};
  for (const [collection,field] of [['quotes','book'],['history','book'],['dfs','app'],['contracts','platform'],['traders','platform']]) {
    for (const item of data[collection]) if (item[field]) item[field] = canonicalPlatform(item[field]);
  }
  // Keep saved payout rules attached when an older app alias is normalized.
  // Existing rules under the canonical name take precedence over alias rules.
  for (const [name,rules] of Object.entries(data.paytables)) {
    const canonical = canonicalPlatform(name);
    if (canonical !== name) data.paytables = {...data.paytables,[canonical]:{...rules,...(Object.hasOwn(data.paytables,canonical) ? data.paytables[canonical] : {})}};
  }
  return data;
}
let state = load();
const quoteCacheWriter = createThrottledCacheWriter(() => ({ quotes: state.quotes.filter(q => q.source === 'local-api'), dfs: state.dfs.filter(item => item.source === 'local-api'), history: state.history.filter(item => item.source === 'local-api'), apiSyncedAt: state.apiSyncedAt }));
// Show the last cached prices while the first sync runs, unless that sync has already finished.
void readQuoteCache().then(cache => {
  // A cache older than 15 minutes holds prices the books may no longer offer; wait for the sync.
  if (!cache || Date.now() - Date.parse(cache.apiSyncedAt || 0) > 15 * 60_000 || (state.apiSyncedAt && Date.parse(state.apiSyncedAt) >= Date.parse(cache.apiSyncedAt || 0))) return;
  state.quotes = [...state.quotes.filter(q => q.source !== 'local-api'), ...cache.quotes.filter(q => q?.source === 'local-api')];
  const ids = new Set(state.quotes.map(q => q.id));
  state.history = cache.history.filter(item => ids.has(item.quoteId));
  // Cached pick'em lines stand in for the props request until it answers.
  if (Array.isArray(cache.dfs) && !dfsLoaded) { propsFeedDfs = cache.dfs; applyFeedDfs(); }
  state.apiSyncedAt = cache.apiSyncedAt;
  if (QUOTE_TOOLS.has(active) || DFS_TOOLS.has(active)) render(); else feedControls?.update();
});
try { state.suite = readSuiteState() || state.suite; } catch { /* A save will surface unavailable account storage. */ }
let feedControls = null;
let preserveLiveOrder = false;
const hasApiSnapshot = () => Boolean(state.apiSyncedAt) || state.quotes.some(q => q.source === 'local-api');
const oddsQuotes = () => state.quotes;
let active = toolMeta[location.hash.slice(1)] ? location.hash.slice(1) : 'ev-pre';
let search = '';
let bookmaker = '', marketType = '', showAllBooks = false, selectedSportsbooks = null, bookMenuOpen = false, bankroll = 5000, kelly = .25, flatMultiplier = 1, evSort = 'ev', detailQuoteId = '';
let evLeague = '', evDateRange = 'all', evMaxOdds = '200';
// Filters for Middles, Low holds, Parlay and Promo plus the extra Positive EV thresholds.
let toolFilters = readToolFilters(window.localStorage);
let bookSearch = '';
let designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' };
let designSort = 'recommended';
let expandedSharpKey = '';
let sharpFiltersOpen = true, sharpSelectedBook = '', sharpSort = 'liquidity';
const sportsbookNames = SPORTSBOOK_PLATFORMS;
const fantasyNames = DFS_PLATFORMS;
const brandMarks = Object.fromEntries([...SITE_PLATFORMS.map(item => item.name),'DraftKings Pick6','Pinnacle'].map(name => [name,platformAsset(name)]));
const brandMark = (name, cls = '') => platformAsset(name)
  ? `<img class="ev-brand-mark ${cls}" src="${platformAsset(name)}" alt="">`
  : `<span class="ev-brand-fallback ${cls}" aria-hidden="true">${esc(name.slice(0,2))}</span>`;
let sportsbookState = readSportsbookState();
const bookAvailable = name => sportsbookAvailable(name, sportsbookState);
const eligibleQuotes = records => availableSportsbookQuotes(records, sportsbookState);
const sportsbookSelected = name => bookAvailable(name) && (selectedSportsbooks === null || selectedSportsbooks.has(name));
const sportsbookOptions = () => [...new Set([...sportsbookNames, ...state.quotes.map(quote => quote.book).filter(Boolean)])].filter(bookAvailable);
try {
  const saved = JSON.parse(localStorage.getItem('sportslab-ev-display-v1'));
  if (Number(saved?.bankroll) > 0) bankroll = Number(saved.bankroll);
  if (Number(saved?.kelly) >= 0 && Number(saved?.kelly) <= 1) kelly = Number(saved.kelly);
  if (Number(saved?.flatMultiplier) > 0 && Number(saved?.flatMultiplier) <= 10) flatMultiplier = Number(saved.flatMultiplier);
} catch { /* Keep usable defaults when storage is unavailable. */ }
const initialSport = new URLSearchParams(location.search).get('sport')?.toUpperCase();
// Any sport the feed carries (Tennis, MMA ...) can be chosen, not only the six major leagues.
let sport = initialSport === 'ALL' ? '' : knownSport(initialSport) || 'NFL';
let parlayIds = Array.isArray(state.suite?.builderIds) ? state.suite.builderIds.filter(id=>state.quotes.some(q=>q.id===id)) : [], fantasyIds = [], fantasyApp = '', stake = 100, fantasyStake = 10;
let parlayVisibleCount = 40;
let evVisibleCount = 40;
let evOpenId = '';
const builderSessionKey = `sportslab-builder-session:${accountSyncState().userId || 'guest'}:${STORE}`;
let buildersRestored = Array.isArray(state.suite?.builderIds);
try {
  const saved = JSON.parse(sessionStorage.getItem(builderSessionKey));
  if (saved && Array.isArray(saved.parlayIds) && Array.isArray(saved.fantasyIds)) {
    parlayIds = saved.parlayIds.filter(id=>state.quotes.some(q=>q.id===id));
    fantasyIds = saved.fantasyIds.filter(id=>state.dfs.some(q=>q.id===id));
    fantasyApp = typeof saved.fantasyApp === 'string' ? saved.fantasyApp : '';
    buildersRestored = true;
  }
} catch { /* Builder remains usable when session storage is unavailable. */ }
function saveBuilderSession() { try { sessionStorage.setItem(builderSessionKey,JSON.stringify({parlayIds,fantasyIds,fantasyApp})); } catch { /* Keep in-memory selections. */ } }
window.addEventListener('pagehide',saveBuilderSession);
let promoInput = { stake: 100, promoOdds: 150, hedgeOdds: -130, kind: 'bonus', boost: 0 };
let trendA = '', trendB = '', traderName = '', predictionPlatform = '';
let editing = null;
// Published standard payouts fill in until the member saves their own table for an app and size.
const paytables = () => withStandardPaytables(state.paytables, apiPaytables);
const dfsWorkspace = createDfsWorkspace({getState:()=>({...state,quotes:eligibleQuotes(state.quotes),paytables:paytables(),devigMethod:suite.settings().devigMethod,payoutSource:(app,size)=>paytableSource(state.paytables,app,size,apiPaytables),dfsLoading:dfsLoading&&!dfsLoaded}),redraw:()=>render(),onSave:slip=>{state.slips.push(slip);commit();},onConfigure:picks=>{fantasyIds=picks.map(item=>item.id);fantasyApp=picks[0].app;setTool('slip');}});
const oddsScreen = createOddsScreen({storage:localStorage,defaultFormat:getAccountPreferences().oddsFormat,getQuotes:()=>eligibleQuotes(oddsQuotes()),getSportsbookState:()=>sportsbookState,onAllSportsbooks:()=>{const saved=saveSportsbookState('');document.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT,{detail:{state:'',saved}}));},brandMark,redraw:()=>render(),onSport:value=>{sport=value;history.replaceState(history.state,'',`${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}#odds`);}});
const suite = createEvSuite({
  getState:()=>state, save:persist, redraw:render, navigate:key=>setTool(key==='tracker'&&!accountSyncState().userId?'ledger':key), getTool:()=>active,
  nativeViews:['ev-pre','ev-live','arb-pre','arb-live','middles','odds','sharp','parlay'],
  getBuilderIds:()=>parlayIds,
  setBuilderIds:ids=>{parlayIds=ids;saveBuilderSession();},
  getContext:()=>({sport,search,marketType,league:evLeague,date:evDateRange,maxOdds:evMaxOdds,sort:evSort,designFilters,bankroll,kelly,books:selectedSportsbooks?[...selectedSportsbooks]:null}),
  restoreContext:c=>{if(!c)return;sport=c.sport||'';search=c.search||'';marketType=c.marketType||'';evLeague=c.league||'';evDateRange=c.date||'all';evMaxOdds=c.maxOdds||'all';evSort=c.sort||'ev';designFilters={...designFilters,...c.designFilters};selectedSportsbooks=Array.isArray(c.books)?new Set(c.books):null;if(Number(c.bankroll)>0)bankroll=Number(c.bankroll);if(Number(c.kelly)>=0&&Number(c.kelly)<=1)kelly=Number(c.kelly);},
  bookSelected:sportsbookSelected, openComparison:showBetComparison
});
const oddsLabel = value => suite.displayOdds(value);
const feedSports = () => [...new Set(['NFL','MLB','NBA','WNBA','NHL','Soccer', ...state.quotes.map(q => q.sport).filter(Boolean).sort(), ...(sport ? [sport] : [])])];
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const origin = x => x.source === 'local-api' ? '<span class="ev-status">API</span>' : '<span class="ev-status">Manual</span>';
const age = ts => { const n = Date.parse(ts); if (!Number.isFinite(n)) return 'Unknown time'; const s = Math.max(0, Math.floor((Date.now() - n) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const qName = q => `${q.event} · ${q.market}${q.line !== '' && q.line != null ? ' ' + q.line : ''} · ${q.side}`;
const qStatus = q => q.live ? `<span class="ev-status${fresh(q) ? '' : ' stale'}">${fresh(q) ? 'Live entry' : 'Stale live'} · ${age(q.ts)}</span>` : `<span class="ev-caption">Pregame · ${age(q.ts)}</span>`;
const filterText = value => String(value ?? '').toLowerCase().includes(search);
const visible = (item, fields) => (!sport || !item.sport || item.sport === sport) && (!search || fields.some(key => filterText(item[key])));
// DFS props are entered by hand and carry no event start, so they keep the observed-date filter.
const inDateRange = ts => designFilters.date === 'all' || (Number.isFinite(Date.parse(ts)) && (designFilters.date === 'today' ? new Date(ts).toDateString() === new Date().toDateString() : Date.parse(ts) >= Date.now() - 7 * 86_400_000));
const quotePassesDesign = q => !['odds','arb-pre','arb-live','sharp'].includes(active) || ((!designFilters.league || (q.league || q.sport) === designFilters.league) && startsWithin(q, designFilters.date) && (designFilters.period === 'all' || (designFilters.period === 'live') === Boolean(q.live)) && (designFilters.maxOdds === 'all' || oddsWithin(q.odds, '', designFilters.maxOdds)));
// Market-wide filters only. Book, odds and EV thresholds apply to result rows, because fair
// prices come from the other books and a promotion's hedge sits at a different book.
const QUOTE_LEVEL_FILTERS = ['league', 'market', 'period', 'when'];
const quotePassesTool = q => { const keys = TOOL_FILTERS[active]; return !keys || quoteMatches(q, Object.fromEntries(QUOTE_LEVEL_FILTERS.filter(key => keys.includes(key)).map(key => [key, toolFilters[key]]))); };
const quoteSource = () => state.quotes;
const quotes = () => quoteSource().filter(q => visible(q, ['event', 'market', 'book', 'side', 'sport', 'player']) && quotePassesDesign(q) && quotePassesTool(q) && suite.quoteVisible(q));
const dfs = () => state.dfs.filter(q => visible(q, ['player', 'market', 'app', 'side']) && (active !== 'fantasy' || ((!designFilters.league || (q.league || q.sport) === designFilters.league) && inDateRange(q.ts) && (!designFilters.side || q.side === designFilters.side))));
const fmtLine = line => line === '' || line == null ? '—' : esc(line);
const oddsCell = q => `<button type="button" data-detail="${esc(q.id)}" aria-label="Compare ${esc(q.side)} at ${esc(q.book)}"><strong>${oddsLabel(q.odds)}</strong><small>${esc(q.book)}</small></button>`;
const button = (label, attributes = '') => `<button type="button" ${attributes}>${label}</button>`;
const empty = (title, body) => `<div class="ev-empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;
const table = (headings, rows) => rows.length ? `<div class="ev-table-wrap"><table class="ev-table"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
const metric = (label, value, cls = '') => `<div class="ev-metric ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
function persist() {
  try {
    // API quotes, their price history and the sync time are re-fetched every few seconds, so they
    // stay in this browser (IndexedDB, throttled). Saving them to the account would exceed its size
    // limit (blocking tracked-bet saves in the same document) and upload on every refresh.
    const { quotes, history, apiSyncedAt, dfs, ...account } = state;
    quoteCacheWriter.schedule();
    localStorage.setItem(STORE, JSON.stringify({ ...account, dfs: dfs.filter(item => item.source !== 'local-api'), quotes: [], history: [] }));
    if(state.suite) writeSuiteState(state.suite);
    const apiCount = state.quotes.filter(q => q.source === 'local-api').length;
    $('#ev-notice').textContent = state.apiSyncedAt || apiCount ? `${apiCount} API quotes saved. Use Sync API or auto-refresh to update prices.` : 'Waiting for the quote API. Prices appear here once it syncs.';
    return true;
  } catch {
    $('#ev-notice').textContent = 'Browser storage is unavailable. Export your work before leaving this page.';
    return false;
  }
}
function snapshotQuote(q) { state.history.push({ id: uid(), quoteId: q.id, sport: q.sport, event: q.displayEvent || q.event, market: q.market, side: q.side, selection: q.selection, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: q.source }); }
// Tools that show feed prices. Other tabs hold the member's own records and forms, so a quote
// sync must not rebuild them (it would wipe what they are typing).
const QUOTE_TOOLS = new Set(['odds','ev-pre','ev-live','arb-pre','arb-live','middles','holds','promo','parlay','sharp','line-alerts']);
// DFS tools re-render only when the feed's pick'em lines or hit chances change.
const DFS_TOOLS = new Set(['fantasy','optimizer','slip','fantasy-alerts']);
const dfsRevision = () => state.dfs.filter(item => item.source === 'local-api').map(item => [item.id, item.line, item.probability].join('|')).join('\n');
// Feed DFS lines come from two requests on different clocks: pick'em lines inside the quote snapshot
// (every 10 s) and GET /site/dfs/props (every minute). Each refresh replaces only its own list, so a
// quote sync never wipes the props.
let quoteFeedDfs = [], propsFeedDfs = [];
function applyFeedDfs() {
  const ids = new Set(propsFeedDfs.map(item => item.id));
  state.dfs = [...state.dfs.filter(item => item.source !== 'local-api'), ...propsFeedDfs, ...quoteFeedDfs.filter(item => !ids.has(item.id))];
}
let lastSkipped = 0;
// The snapshot is downloaded and cleaned in a worker so the page stays responsive; browsers
// without module workers run the same loadFeed in the page.
let feedWorker = null, feedRequest = 0;
const pendingFeed = new Map();
function fetchFeed(kind = 'quotes', apps = []) {
  const url = kind === 'dfs' ? '/api/ev/site/dfs/props' : '/api/ev/quotes', syncedAt = now(), method = suite.settings().devigMethod;
  const inline = () => kind === 'dfs' ? loadDfsFeed(url, syncedAt, apps, { method }) : loadFeed(url, syncedAt, { method });
  if (feedWorker !== false && typeof Worker === 'function') {
    try {
      if (!feedWorker) {
        feedWorker = new Worker('/ev-feed-worker.js?v=7', { type: 'module' });
        feedWorker.onmessage = ({ data }) => { pendingFeed.get(data.id)?.(data); pendingFeed.delete(data.id); };
        feedWorker.onerror = () => { feedWorker = false; for (const resolve of pendingFeed.values()) resolve({ ok: false, kind: 'worker' }); pendingFeed.clear(); };
      }
      const id = ++feedRequest;
      return new Promise(resolve => {
        pendingFeed.set(id, resolve);
        feedWorker.postMessage({ id, kind, url, syncedAt, apps, method });
        setTimeout(() => { if (pendingFeed.delete(id)) resolve({ ok: false, kind: 'timeout' }); }, 40_000);
      }).then(result => result.kind === 'worker' ? inline() : result);
    } catch { feedWorker = false; }
  }
  return inline();
}
// DFS props (GET /site/dfs/props, about 30k lines) load while a DFS tool is open and refresh every
// minute; hit chances are priced against the sportsbook quotes already on the page. Payout tables
// (GET /site/dfs/payouts) load once and name the apps the props are requested for.
let dfsSyncedAt = 0, dfsLoading = false, dfsLoaded = false, apiPaytables = {}, payouts = null;
function loadPayouts() {
  payouts ||= fetch('/api/ev/site/dfs/payouts', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    .then(response => { if (!response.ok) throw Error(`payouts ${response.status}`); return response.json(); })
    .then(records => {
      const tables = payoutTables(records);
      if (Object.keys(tables).length) { apiPaytables = tables; if (DFS_TOOLS.has(active)) render(); }
      return (Array.isArray(records) ? records : []).map(entry => entry?.app).filter(app => typeof app === 'string' && app);
    })
    .catch(() => { payouts = null; return []; });
  return payouts;
}
function ensureDfsFeed() {
  if (!DFS_TOOLS.has(active)) return;
  // The first load runs even in a background tab so the lines are ready when it is opened; refreshes
  // wait for the tab to be visible.
  if (dfsLoading || (dfsLoaded && (Date.now() - dfsSyncedAt < 60_000 || document.hidden))) { void loadPayouts(); return; }
  dfsLoading = true;
  let changed = false;
  void loadPayouts().then(apps => fetchFeed('dfs', apps)).then(result => {
    if (!result.ok) return;
    const previous = dfsRevision();
    // The worker already built the picks; re-price here only when the page has sportsbook player props.
    propsFeedDfs = state.quotes.some(q => q.player) ? dfsPicks(result.picks, state.quotes, undefined, { method: suite.settings().devigMethod }) : result.dfs;
    applyFeedDfs();
    dfsSyncedAt = Date.now();
    persist();
    changed = dfsRevision() !== previous;
  }).finally(() => {
    // The first answer, even an empty or failed one, replaces the loading message.
    const first = !dfsLoaded;
    dfsLoading = false; dfsLoaded = true;
    if (DFS_TOOLS.has(active) && (changed || first)) renderKeepingView();
  });
}
async function syncLocalApi() {
  const workspace = state;
  const result = await fetchFeed();
  const invalid = message => Object.assign(Error(message + ' Saved prices were kept.'), { retryable: false });
  if (!result.ok) {
    if (result.kind === 'timeout') throw Object.assign(Error('The request timed out. Saved prices were kept.'), { name: 'TimeoutError' });
    if (result.kind === 'network') throw Object.assign(Error('The quote feed could not be reached. Saved prices were kept.'), { retryable: true });
    if (result.kind === 'unreadable') throw Object.assign(Error('The quote server returned an unreadable response. Saved prices were kept.'), { retryable: result.status === 429 || result.status >= 500 });
    if (result.kind === 'shape') throw invalid('The EV API did not return a quotes array.');
    if (result.kind === 'partial') throw invalid('Quote sync needs a complete snapshot; this response is partial or paginated.');
    const payload = result.payload;
    const failure = Error(typeof payload?.error === 'string' ? payload.error : typeof payload?.detail === 'string' ? payload.detail : 'The EV API is unavailable. Saved prices were kept.');
    failure.retryable = payload?.retryable !== false && ![400,401,403,404,405,422].includes(result.status);
    const retry = result.retryAfter;
    if (retry) failure.retryAfterMs = Math.min(86_400_000, Math.max(0, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()));
    throw failure;
  }
  // Bad or mislabeled records were skipped and counted; one bad record never blocks the snapshot.
  const { quotes: kept, skipped } = result, records = { length: result.total };
  const previousDfs = dfsRevision();
  if (Array.isArray(result.dfs)) { quoteFeedDfs = result.dfs; applyFeedDfs(); }
  const feed = new Map(kept.map(quote => [quote.id, quote]));
  if (state !== workspace) throw invalid('The workspace changed during sync. Try again after your import.');
  const existing = new Map(state.quotes.filter(quote => quote.source === 'local-api').map(quote => [quote.id, quote]));
  state.quotes = [...state.quotes.filter(quote => quote.source !== 'local-api' && !feed.has(quote.id)), ...feed.values()];
  const retainedIds = new Set(state.quotes.map(quote => quote.id));
  state.history = state.history.filter(item => retainedIds.has(item.quoteId));
  for (const quote of feed.values()) {
    const prior = existing.get(quote.id);
    if (!prior || prior.odds !== quote.odds || prior.line !== quote.line) snapshotQuote(quote);
  }
  const apiHistory = state.history.filter(item => item.source === 'local-api').slice(-5_000);
  state.history = [...state.history.filter(item => item.source !== 'local-api'), ...apiHistory];
  state.apiSyncedAt = now();
  lastSkipped = records.length - kept.length - skipped.duplicate - skipped.stale;
  evaluateAlerts();
  // Alert-center watches run on every price update, not only when "Refresh saved records" is on.
  if (state.suite?.watchRules?.length) suite.evaluateWatches();
  const saved = persist();
  // Rebuild only a quote tab, and only when prices actually changed, keeping scroll and menus.
  if (DFS_TOOLS.has(active) ? dfsRevision() !== previousDfs : QUOTE_TOOLS.has(active) && quoteRevision(state.quotes) !== displayedQuoteRevision) {
    if (active === 'odds' && !suite.hasView(active)) oddsScreen.refresh();
    else renderKeepingView();
  }
  return { count: feed.size, saved, skipped: lastSkipped, expired: skipped.stale };
}
// Re-render after a price sync without moving the reader: sideways scroll positions and open
// menus inside the view come back as they were.
function renderKeepingView() {
  const view = $('#ev-view');
  const keyOf = (element, index) => `${element.className}#${index}`;
  const scrollers = new Map(), open = new Set();
  const collect = (selector, visit) => { const seen = new Map(); view.querySelectorAll(selector).forEach(element => { const n = seen.get(element.className) || 0; seen.set(element.className, n + 1); visit(element, keyOf(element, n)); }); };
  collect('.evd-scroll,.evb-matrix-scroll,.evb-table-wrap,.ev-table-wrap,.ev-price-matrix-scroller,.bet-inline-scroll,.bet-comparison-scroll,.os-grid-wrap', (element, key) => scrollers.set(key, [element.scrollLeft, element.scrollTop]));
  collect('details', (element, key) => { if (element.open) open.add(key); });
  preserveLiveOrder = true;
  try { render(); } finally { preserveLiveOrder = false; }
  collect('.evd-scroll,.evb-matrix-scroll,.evb-table-wrap,.ev-table-wrap,.ev-price-matrix-scroller,.bet-inline-scroll,.bet-comparison-scroll,.os-grid-wrap', (element, key) => { const saved = scrollers.get(key); if (saved) [element.scrollLeft, element.scrollTop] = saved; });
  collect('details', (element, key) => { if (open.has(key)) element.open = true; });
}
// Email delivery runs on the server (lib/accounts/alert-mailer.mjs) for signed-in accounts that turn it on here.
function emailAlertsControl() {
  const on = state.alertEmail === true;
  return `<div class="browser-alerts email-alerts" data-state="${on ? 'on' : 'off'}"><button type="button" data-email-alerts aria-pressed="${on}">${on ? 'Email alerts on' : 'Email me new matches'}</button><small>${on ? 'New matches are emailed to your account address (checked on a schedule; each match is sent once).' : 'Get new matches by email, even when VisualOdds is closed.'}</small></div>`;
}
function evaluateAlerts() {
  const fresh = [];
  for (const rule of state.alerts) {
    if (rule.enabled === false) continue;
    const matched = alertMatches(rule, state);
    const seen = new Set(rule.seen || []);
    for (const match of matched) if (!seen.has(match.id)) {
      state.notifications.unshift({ id: uid(), ruleId: rule.id, message: `${rule.kind === 'fantasy-new' ? 'New fantasy prop' : rule.kind === 'ev' ? 'EV threshold' : rule.kind === 'movement' ? 'Line movement' : 'Price threshold'}: ${match.label}`, ts: now(), read: false });
      fresh.push(state.notifications[0]);
      seen.add(match.id);
    }
    rule.seen = [...seen];
  }
  state.notifications = state.notifications.slice(0, 300);
  deliverAlerts(fresh);
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
// Tool dialogs belong to the tool that opened them; switching tools closes them.
const closeToolDialogs = () => document.querySelectorAll('dialog#evx-dialog[open]').forEach(dialog => dialog.close());
function setTool(key) { if (key === 'tracker') return location.assign(betTrackerUrl(sport.toLowerCase())); if (!toolMeta[key]) return; closeToolDialogs(); active = key; pairVisibleCount = 40; bookmaker = ''; marketType = ''; showAllBooks = false; bookMenuOpen = false; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; $('.ev-tool-details').open = false; history.replaceState(history.state, '', location.pathname + location.search + '#' + key); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
// Sportsbook prices come only from the quote API, so there is no manual "add price" action.
function action(label, type, extra = '') { return type === 'quote' ? '' : button(label, `data-add="${type}" ${extra}`); }
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
  if (!fantasy && !START_WINDOWS.some(([value]) => value === designFilters.date)) designFilters.date = 'all';
  const dateControl = fantasy
    ? designSelect('date','Date Range', [['all','Any'],['today','Today'],['week','7 days']],designFilters.date,'Date Range')
    : designSelect('date','Starts', START_WINDOWS,designFilters.date,'Starts');
  const bookControl = designSelect('platform',fantasy ? 'Platforms' : 'Sportsbooks', [['',fantasy ? 'Platforms' : 'Sportsbooks'],...availableBooks.map(value => [value,value])],bookmaker,sharp ? 'Sportsbooks' : '');
  const periodControl = designSelect('period','Period', arb ? [['pregame','Pregame'],['live','Live']] : [['all','All games'],['pregame','Pregame'],['live','Live']],arb ? (active === 'arb-live' ? 'live' : 'pregame') : designFilters.period,arb ? 'Period' : '');
  const oddsControl = designSelect('odds','Max Odds', [['all','Any'],['200','+200'],['300','+300'],['500','+500']],designFilters.maxOdds,'Max Odds');
  const liquidityControl = `<label class="ev-design-filter"><span class="ev-design-icon" aria-hidden="true">${filterIcons.liquidity}</span><span class="ev-design-prefix">Min Liquidity</span><input data-filter="liquidity" aria-label="Minimum liquidity" type="number" min="0" step="1" value="${esc(localStorage.getItem('sportslab-ev-sharp-min') || 1000)}"></label>`;
  const edgeControl = designSelect('edge','Min Return', [['0','Any return'],['0.005','0.5%'],['0.01','1%'],['0.02','2%'],['0.03','3%'],['0.05','5%']],designFilters.minEdge,'Min return');
  const stakeControl = `<label class="ev-design-filter"><span class="ev-design-icon" aria-hidden="true">${designFilterIcon('stake')}</span><span class="ev-design-prefix">First Stake</span><input data-filter="stake" aria-label="First side stake" type="number" min="1" step="1" value="${esc(stake)}"></label>`;
  const sideControl = designSelect('side','Over or Under', [['','Over/Under'],['Over','Over'],['Under','Under']],designFilters.side);
  const controls = fantasy ? [sportControl,bookControl,leagueControl,marketControl,dateControl,sideControl]
    : odds ? [sportControl,leagueControl,marketControl,periodControl,dateControl]
    : arb ? [sportControl,leagueControl,marketControl,edgeControl,stakeControl,dateControl,periodControl]
    : [sportControl,leagueControl,marketControl,oddsControl,liquidityControl,dateControl];
  container.innerHTML = controls.join('');
}
// Min odds, Min EV and Min win chance for Positive EV, beside the existing Max odds filter.
function renderEvThresholds() {
  let container = $('#ev-reference-extra');
  if (!container) {
    container = document.createElement('span');
    container.id = 'ev-reference-extra';
    container.className = 'ev-reference-extra';
    $('.ev-reference-filters').append(container);
  }
  const choice = (key, icon, label, options, title) => `<label class="ev-odds-filter" title="${esc(title)}"><span aria-hidden="true">${icon}</span><span>${esc(label)}</span><select data-ev-threshold="${key}" aria-label="${esc(label)}">${options.map(([value,text]) => `<option value="${esc(value)}" ${value === toolFilters[key] ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  container.innerHTML = choice('evMinOdds','☷','Min Odds',MIN_ODDS,'Shortest price to include.')
    + choice('minEv','↗','Min EV',MIN_EV,'Hide bets with a smaller expected edge.')
    + choice('minProb','◔','Min Win Chance',MIN_WIN_CHANCE,'Fair no-vig probability. Raise it to skip long shots.');
}
let inlineDetail=null;
const evReferenceModels = new Map();
let renderedTool = '';
function render() {
  // Switching tools: drop the old view before anything measures layout. Leaving it in place made
  // every measurement lay out the previous tool again (seconds after a large odds grid).
  if (renderedTool !== active) { $('#ev-view').replaceChildren(); renderedTool = active; }
  feedControls?.update();
  ensureDfsFeed();
  if (active === 'tracker') { location.replace(legacyBetTrackerUrl(new URL(location.href)) || betTrackerUrl(sport.toLowerCase())); return; }
  renderNav();
  const titles = { odds:'Odds Screen', 'ev-pre':'Positive EV', 'ev-live':'Live Positive EV', fantasy:'DFS Props', 'arb-pre':'Arbitrage', 'arb-live':'Live Arbitrage', sharp:'Smart Money', tracker:'Bet Tracker' };
  const pageTitle = titles[active] || toolMeta[active][2];
  $('#ev-page-title').innerHTML = accentTitle(pageTitle);
  $('#ev-top-title').textContent = pageTitle;
  document.title = pageTitle + ' · VisualOdds';
  document.body.dataset.evScreen = active;
  document.querySelectorAll('[data-ev-nav]').forEach(link => {
    const target = new URL(link.href).hash.slice(1);
    const selected = target === active || target === 'ev-pre' && active === 'ev-live' || target === 'arb-pre' && active === 'arb-live';
    if (selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.ev-site-header a[href]').forEach(link => {
    // Sport pills choose a different sport; dashboard-navigation.js keeps them on the active tool.
    if (link.closest('.site-sports')) return;
    const url = new URL(link.href);
    if (!['/ev', '/ev/tracker', '/ev/dashboard'].includes(url.pathname)) return;
    if (sport) url.searchParams.set('sport', sport.toLowerCase());
    else if (url.pathname === '/ev') url.searchParams.set('sport', 'all');
    else url.searchParams.delete('sport');
    link.href = url.pathname + url.search + url.hash;
  });
  // Sport menus list the major leagues plus every other sport present in the feed.
  const sportOptions = feedSports();
  for (const menu of [$('#ev-sport'), $('#ev-reference-sport')]) {
    const first = menu.options[0]?.textContent || 'All sports';
    if (menu.dataset.sports !== sportOptions.join('|')) { menu.innerHTML = `<option value="">${esc(first)}</option>` + sportOptions.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join(''); menu.dataset.sports = sportOptions.join('|'); }
  }
  $('#ev-sport').value = sport;
  $('#ev-search').value = search;
  const options = active === 'fantasy'
    ? [['','All props'],...[...new Set(state.dfs.map(item => item.market))].sort().map(value => [value,value])]
    : [['','All markets'],...[['moneyline','Moneyline'],['spread','Spreads'],['total','Totals'],['prop','Player props'],['alternate','Alternates'],['future','Futures'],['three-way','Match result (1X2)']]
      // Only market types the feed actually has, so no option leads to an always-empty board.
      .filter(([type]) => type === marketType || state.quotes.some(q => q.type === type))];
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
  if (!START_WINDOWS.some(([value]) => value === evDateRange)) evDateRange = 'all';
  $('#ev-reference-date').value = evDateRange;
  $('#ev-reference-date').closest('label').hidden = active === 'ev-live';
  $('#ev-reference-max-odds').value = evMaxOdds;
  renderEvThresholds();
  $('#ev-sort-mode').innerHTML = ['ev-pre','ev-live'].includes(active)
    ? '<option value="ev">Recommended</option><option value="prob">Win chance</option><option value="start">Start time</option><option value="event">Event</option><option value="odds">Odds</option>'
    : '<option value="recommended">Recommended</option><option value="event">Event</option><option value="time">Time</option>';
  $('#ev-sort-mode').value = ['ev-pre','ev-live'].includes(active) ? evSort : designSort;
  renderDesignFilters();
  $('#ev-sharp-filter').hidden = active !== 'sharp';
  $('#ev-sharp-min').value = localStorage.getItem('sportslab-ev-sharp-min') || 1000;
  $('#ev-ev-bankroll').value = bankroll;
  const usesKelly = ['ev-pre','ev-live'].includes(active);
  const usesFlat = ['arb-pre','arb-live'].includes(active);
  $('#ev-kelly').value = usesKelly ? kelly : flatMultiplier.toFixed(2);
  const dataKind = active === 'fantasy' ? (state.dfs.length ? 'Entered props' : 'No props yet') : hasApiSnapshot() ? 'API snapshot' : 'No prices yet';
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
    odds: '', 'ev-pre': '', 'ev-live': '',
    'arb-pre': '', 'arb-live': '', middles: action('Add price', 'quote'), holds: action('Add price', 'quote'),
    sharp: '', fantasy: '', optimizer: action('Add DFS prop', 'dfs'), slip: action('Add DFS prop', 'dfs'),
    'fantasy-alerts': action('New alert', 'alert', 'data-kind="fantasy-new"'), prediction: action('Add contract', 'contract'), tracker: action('Add bet', 'bet'), trends: action('Add result', 'result'), 'line-alerts': action('New alert', 'alert')
  };
  $('#ev-view-actions').innerHTML = viewActions[active] || '';
  const positiveScreen = ['ev-pre','ev-live'].includes(active);
  document.body.classList.toggle('ev-detail-mode', positiveScreen && Boolean(detailQuoteId));
  $('#ev-menu-actions').append($('.ev-header-actions'));
  $('.ev-header-actions').append($('#ev-view-actions'), $('.ev-sidebar'));
  const views = { odds: renderOdds, 'ev-pre': () => renderEv(false), 'ev-live': () => renderEv(true), 'arb-pre': () => renderArb(false), 'arb-live': () => renderArb(true), middles: renderMiddles, holds: renderHolds, promo: renderPromo, parlay: renderParlay, sharp: renderSharp, fantasy: renderFantasy, optimizer: renderOptimizer, slip: renderSlip, 'fantasy-alerts': renderFantasyAlerts, prediction: renderPrediction, trends: renderTrends, 'line-alerts': renderLineAlerts };
  const suiteView = suite.hasView(active);
  const secondary = SECONDARY_TOOLS.some(tool => tool.key === active) || EV_SUITE_TOOLS.some(tool => tool[1] === active);
  document.body.classList.toggle('ev-secondary-mode',secondary);
  const feedPanel = $('.ev-feed');
  if (feedPanel) (secondary ? $('.ev-shell') : $('.ev-header')).after(feedPanel);
  let content = suiteView ? suite.render(active) : views[active]();
  if(EV_SUITE_TOOLS.some(tool=>tool[1]===active)){
    const heroActions={ledger:button('Performance','data-suite-action="navigate" data-id="performance"')+button('Add a bet','data-evl-action="add" data-evl-id="" data-evl-hero class="tool-hero-primary"'),performance:button('Bet ledger','data-suite-action="navigate" data-id="ledger" class="tool-hero-primary"'),alerts:button('Pricing & filters','data-suite-action="navigate" data-id="settings"'),settings:button('Alert center','data-suite-action="navigate" data-id="alerts"')};
    content=`<div class="tool-workspace es-2026" data-tool-workspace="${esc(active)}">${toolHero({title:pageTitle,description:esc(toolMeta[active][3]),group:toolMeta[active][0],symbol:SUITE_ICONS[active],actions:heroActions[active]||'',stats:suite.heroStats?.(active)||[]})}<div class="tool-content">${content}</div></div>`;
  }
  $('#ev-view').innerHTML = secondaryShell(active, content, {actions:viewActions[active] || '',sport,sports:feedSports(),search,dataLabel:toolDataLabel(active,state,dataKind),filters:toolFilterBar(active, toolFilters, state.quotes.filter(q => !sport || q.sport === sport))});
  suite.mount();
  if (positiveScreen && !suiteView) bindEvReferenceCards();
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
  const menuScroll = menu.scrollTop, focusedBook = document.activeElement?.dataset.bookOption;
  if (relevant && !fantasyMode) {
    const options = [...new Set([...books, ...sportsbookOptions()])];
    const selected = options.filter(sportsbookSelected);
    $('#ev-books').innerHTML = selected.length ? selected.map(book => `<button type="button" class="ev-selected-book" data-book-remove="${esc(book)}" aria-label="Remove ${esc(book)} from selected sportsbooks" title="Remove ${esc(book)}"><span class="ev-book-symbol">${brandMarks[book] ? `<img src="${brandMarks[book]}" alt="" class="ev-book-logo">` : esc(book.slice(0,2))}</span><span class="ev-book-remove" aria-hidden="true">×</span></button>`).join('') + '<button type="button" class="ev-book-overflow" data-open-book-menu hidden></button>' : `<span class="ev-no-books">${sportsbookState && !options.length ? "No supported sportsbooks in " + sportsbookState : "No books selected"}</span>`;
    $('#ev-books-more').hidden = false;
    $('#ev-books-more').innerHTML = '<span aria-hidden="true">+</span>';
    $('#ev-books-more').setAttribute('aria-label','Choose sportsbooks');
    $('#ev-books-more').setAttribute('aria-expanded',String(bookMenuOpen));
    menu.hidden = !bookMenuOpen;
    menu.innerHTML = `<div class="ev-book-menu-heading"><strong>Sportsbooks</strong><span>${selected.length} selected</span></div><div class="ev-book-menu-actions"><button type="button" data-book-select-all>Select all</button><button type="button" data-book-clear>Clear all</button></div><label class="ev-book-search">Search sportsbooks<input type="search" data-book-search value="${esc(bookSearch)}" placeholder="Sportsbook name" autocomplete="off"></label><div class="ev-book-menu-options" role="group" aria-label="Choose sportsbooks">${options.map(book => `<label class="ev-book-option" ${bookSearch && !book.toLowerCase().includes(bookSearch) ? 'hidden' : ''}><input type="checkbox" data-book-option="${esc(book)}" ${sportsbookSelected(book) ? 'checked' : ''}><span class="ev-book-option-mark" aria-hidden="true">${brandMarks[book] ? `<img src="${brandMarks[book]}" alt="">` : esc(book.slice(0,2))}</span><span>${esc(platformLabel(book))}</span></label>`).join('')}</div>`;
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
  // Only DFS props can be entered by hand; sportsbook prices come from the API.
  $('#ev-add-quote').textContent = 'Add DFS prop';
  $('#ev-add-quote').hidden = active !== 'fantasy';
  menu.scrollTop = menuScroll;
  if (focusedBook) menu.querySelector('[data-book-option="' + CSS.escape(focusedBook) + '"]')?.focus({preventScroll:true});
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
  return oddsScreen.render({sport});
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
    ${open ? `<div class="ev-opportunity-actions"><span>Observed ${age(quote.ts)} · API price</span><div>${quote.live ? '' : `<button type="button" data-parlay="${esc(quote.id)}">Add to parlay</button>`}</div></div>
    <div class="ev-price-matrix-scroller"><table class="ev-price-matrix"><thead><tr><th scope="col">Selection</th><th scope="col">Average</th><th scope="col">Best</th>${books.map(book => `<th scope="col">${brandMark(book)}<span>${esc(book)}</span></th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table></div>
    <p class="ev-opportunity-note">Prices shown come from the quote API for this market. Confirm availability, limits and freshness independently.</p>` : ''}
  </article>${asCard ? '' : '</td></tr>'}`;
}

const EV_SANITY_LIMIT = .25, EV_SINGLE_BOOK_LIMIT = .10;
function renderEv(live) {
  // Fair odds use every book in the market; the Starts window only narrows the result rows
  // (filtering first would drop books that don't report a start time from the consensus).
  const pool = state.quotes.filter(q => (!sport || q.sport === sport) && (!evLeague || (q.league || q.sport) === evLeague));
  const settings = suite.settings();
  const all = computeAdvancedEv(pool, settings).filter(row=>Boolean(row.quote.live)===live && suite.quoteVisible(row.quote) && (live || startsWithin(row.quote, evDateRange)));
  const { evMinOdds, minEv, minProb } = toolFilters;
  // Without a saved maximum, EV above 25% is treated as a feed error (a mislabeled or stale price),
  // the way arbitrage above 15% is. Real edges are almost always a few percent.
  const defaultCaps = settings.maxEvPercent === '' || settings.maxEvPercent == null;
  // One soft book disagreeing by 10%+ is far more often a stale or mislabeled price than value.
  const capFor = row => !defaultCaps ? Infinity : (row.consensus?.books?.length || 0) <= 1 ? EV_SINGLE_BOOK_LIMIT : EV_SANITY_LIMIT;
  const hiddenAsErrors = all.filter(row => row.ev > capFor(row)).length;
  const rows = all.filter(row => row.ev <= capFor(row)).filter(({quote:q,ev,fair}) => ev > 0 && oddsWithin(q.odds, evMinOdds, evMaxOdds === 'all' ? '' : evMaxOdds)
    && (!minEv || ev * 100 >= Number(minEv)) && (!minProb || fair * 100 >= Number(minProb))
    && sportsbookSelected(q.book) && (!marketType || q.type === marketType) && (!search || [q.displayEvent,q.event,q.market,q.book,q.selection,q.sport,q.player].some(value => filterText(value))));
  const startOf = q => { const start = Date.parse(q.startTime); return Number.isFinite(start) ? start : Infinity; };
  if (evSort === 'event') rows.sort((a,b) => (a.quote.displayEvent || a.quote.event).localeCompare(b.quote.displayEvent || b.quote.event) || b.ev - a.ev);
  else if (evSort === 'odds') rows.sort((a,b) => decimal(b.quote.odds) - decimal(a.quote.odds));
  else if (evSort === 'prob') rows.sort((a,b) => b.fair - a.fair || b.ev - a.ev);
  else if (evSort === 'start') rows.sort((a,b) => startOf(a.quote) - startOf(b.quote) || b.ev - a.ev);
  else rows.sort((a,b) => b.ev - a.ev);
  rows.sort((a,b)=>Number(Boolean(comparisonAnnotations(b.quote.id).pin))-Number(Boolean(comparisonAnnotations(a.quote.id).pin)));
  rows.sort((a,b)=>Number(Boolean(state.suite?.flags?.[b.quote.id]?.pin))-Number(Boolean(state.suite?.flags?.[a.quote.id]?.pin)));
  if (preserveLiveOrder) preserveReadingOrder(rows, [...document.querySelectorAll('.evb-row[data-wager-id]')].map(card=>card.dataset.wagerId), row=>row.quote.id);
  const noLive = live && !pool.some(q => q.live);
  const emptyTitle = noLive ? 'No live games in the feed right now' : !pool.length ? 'No prices for this sport yet' : 'No positive EV selections match these filters';
  const emptyBody = noLive ? 'Live +EV appears here when the quote feed sends in-play prices. Pregame +EV is under the Pregame tab.' : !pool.length ? 'Prices appear here once the odds feed syncs.' : 'No book is currently priced above the fair line for these filters. Clear a filter or wait for the next refresh.';
  const shown = rows.slice(0,evVisibleCount);
  const books = new Set(rows.map(row => row.quote.book)).size;
  const summary = `<div class="evb-summary"><p><strong>${rows.length} positive ${rows.length === 1 ? 'selection' : 'selections'}</strong> from ${pool.filter(q => Boolean(q.live) === live).length} prices checked</p>${rows.length ? `<dl><div><dt>Top edge</dt><dd class="is-positive">${(Math.max(...rows.map(row => row.ev)) * 100).toFixed(2)}%</dd></div><div><dt>Books</dt><dd>${books}</dd></div><div><dt>Bankroll</dt><dd>${money(bankroll)}</dd></div></dl>` : ''}</div>`;
  const more = rows.length > evVisibleCount ? `<button type="button" class="ev-parlay-more" data-ev-more>Show ${Math.min(40,rows.length-evVisibleCount)} more selections · ${Math.min(evVisibleCount,rows.length)} of ${rows.length} shown</button>` : '';
  return `<div class="ev-stack ev-positive-screen evb-board"><div class="wager-results-bar evb-results-bar">${summary}</div>${rows.length ? renderEvBoard(evBoardContext(shown, live)) + more : empty(emptyTitle,emptyBody)}<p class="ev-caption ev-method-note">Fair probability uses your saved reference-book, weighting and no-vig settings; by default Pinnacle counts three times as much as other books. Recommended stakes use your bankroll and Kelly multiplier. Open a row to compare every book. ${live ? 'Live entries expire after 90 seconds.' : ''}${hiddenAsErrors ? ` ${hiddenAsErrors} ${hiddenAsErrors === 1 ? 'price' : 'prices'} above 25% EV (10% when only one book sets the fair price) ${hiddenAsErrors === 1 ? 'is' : 'are'} hidden as likely feed errors; set a maximum EV in Pricing &amp; filters to change this.` : ''} Confirm price, limits and freshness independently.</p></div>`;
}

function evBoardContext(rows, live) {
  return {rows, live, sort:evSort, openId:evOpenId, oddsLabel, age,
    stake:(fair,odds)=>fractionalKellyStake(bankroll,kelly,fair,odds),
    kellyLabel:`${kelly === 1 ? 'Full' : kelly === .5 ? '½' : kelly === .25 ? '¼' : kelly} Kelly`,
    flags:id=>({...comparisonAnnotations(id),...state.suite?.flags?.[id]}),
    detail:comparisonForQuote};
}

// Open or close one row's price grid in place so scroll position and focus stay put.
function toggleEvBoardRow(id) {
  const view = $('#ev-view');
  const analysisOpen = inlineDetail?.id === id && !!view.querySelector('.bet-inline-mount');
  if (view.querySelector('.bet-inline-mount')) closeInlineDetail();
  view.querySelectorAll('.evb-detail-row').forEach(row => row.remove());
  view.querySelectorAll('.evb-row.is-open').forEach(row => { row.classList.remove('is-open'); row.querySelector('[data-evb-toggle]')?.setAttribute('aria-expanded','false'); });
  evOpenId = evOpenId === id || analysisOpen ? '' : id;
  if (!evOpenId) return;
  const row = view.querySelector(`.evb-row[data-evb-row="${CSS.escape(id)}"]`);
  const match = row && computeAdvancedEv(quoteSource(), suite.settings()).find(item => item.quote.id === id);
  if (!match) { evOpenId = ''; return; }
  row.classList.add('is-open');
  row.querySelector('[data-evb-toggle]')?.setAttribute('aria-expanded','true');
  row.insertAdjacentHTML('afterend', renderEvBoardDetail(evBoardContext([match], match.quote.live), match.quote, match.fair, match.ev));
}

function evReferenceModel(quote, fair, ev) {
  const model = comparisonForQuote(quote);
  return {...model, standalone:true, inlineHistory:true, historyMetric:'line',
    market:quote.displayMarket || (quote.player ? quote.market.replace(quote.player,'').trim() : quote.market),
    selection:`${quote.player ? quote.player+' ' : ''}${quote.side}${quote.line !== '' && quote.line != null ? ' '+quote.line : ''}`,
    event:quote.displayEvent || quote.event,
    time:`${quote.live ? 'Live' : 'Pregame'} · Observed ${age(quote.ts)}`,
    fairOdds:Number.isFinite(fair)?oddsLabel(probabilityToAmerican(fair)):'—',fairMark:'',fairLabel:'Fair value · consensus',
    probability:percent(fair),probabilityLabel:'Consensus probability',
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
      if(quote)suite.trackQuote(quote,active);
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
  const source = quoteSource();
  const peers = groups(source).find(group => group.some(item => item.id === quote.id)) || [quote];
  const fair = consensusPrice(quote, source, suite.settings()).probability;
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
    // This book's own fair probability: its complete market devigged with the member's method.
    const noVig=same&&complete.length>=2&&complete.every(item=>item&&fresh(item))?devig(complete.map(item=>implied(item.odds)),suite.settings().devigMethod)[complete.indexOf(same)]??NaN:NaN;
    return {name:book,probability:Number.isFinite(noVig)?percent(noVig):null,mark:brandMark(book),exchange:peers.some(item=>item.book===book&&item.exchange),line:same?.line !== '' && same?.line != null ? fmtLine(same.line) : '—',difference,odds:same ? `${oddsLabel(same.odds)}${other ? ' / ' + oddsLabel(other.odds) : ''}` : '—'};
  });
  const selection = `${quote.side}${quote.line !== '' && quote.line != null ? ' ' + fmtLine(quote.line) : ''}`;
  const canEdit = state.quotes.some(item => item.id === quote.id);
  const sideNames=[quote.side,...new Set(peers.map(item=>item.side).filter(side=>side!==quote.side))];
  const rows=sideNames.map(side=>{
    const prices=books.map(book=>latest(book,side)),available=prices.filter(item=>item&&fresh(item)),best=available.slice().sort((a,b)=>decimal(b.odds)-decimal(a.odds))[0];
    const average=available.length?probabilityToAmerican(available.reduce((sum,item)=>sum+implied(item.odds),0)/available.length):NaN;
    const line=available[0]?.line;
    return {side,selection:`${side}${line!==''&&line!=null?' '+fmtLine(line):''}`,average:Number.isFinite(average)?oddsLabel(average):'—',best:best?oddsLabel(best.odds):'—',bestMark:best?brandMark(best.book):'',prices:prices.map(item=>({raw:item?Number(item.odds):NaN,value:item?oddsLabel(item.odds):'—',best:!!item&&item.id===best?.id,liquidity:item?.exchange&&Number(item.liquidity)>0?money(Number(item.liquidity)):''}))};
  });
  const historyBySide=Object.fromEntries(sideNames.map(side=>{const current=books.map(book=>latest(book,side)).filter(Boolean),ids=new Set(current.map(item=>item.id)),seen=new Set();return [side,[...state.history.filter(item=>ids.has(item.quoteId)),...current].filter(item=>{const key=[item.book,item.ts,item.odds,item.line].join('|');if(seen.has(key))return false;seen.add(key);return true;})];}));
  const priceHistory=historyBySide[quote.side];
  const offeredPair=sideNames.map(side=>latest(quote.book,side));
  const vig=offeredPair.length>=2&&offeredPair.every(Boolean)?(offeredPair.reduce((sum,item)=>sum+implied(item.odds),0)-1)*100:NaN;
  const recommended=fractionalKellyStake(bankroll,kelly,fair,quote.odds);
  return {id:quote.id,market:quote.displayMarket || quote.market,sport:quote.sport,event:quote.displayEvent || quote.event,time:quote.startTime ? startLabel(quote) : `${quote.live ? fresh(quote)?'Live':'Stale live' : 'Pregame'} · ${quote.ageUnknown ? 'price age unknown' : age(quote.ts)}`,selection,
    fairOdds:Number.isFinite(fair) ? oddsLabel(probabilityToAmerican(fair)) : null,fairMark:brandMark(quote.book),
    book:quote.book,rawLine:quote.line,side:quote.side,rawOdds:Number(quote.odds),offerOdds:oddsLabel(quote.odds),rawFair:fair,rawStake:recommended,recommended:money(recommended),ev:Number.isFinite(fair)?(expectedReturn(fair,quote.odds)*100).toFixed(2)+'%':'—',vig:Number.isFinite(vig)?vig.toFixed(1)+'%':null,
    probability:Number.isFinite(fair) ? percent(fair) : null,probabilityLabel:'Est. probability',
    context:`${quote.source === 'local-api' ? 'Feed' : 'Saved'} prices · ${books.length} ${books.length === 1 ? 'book' : 'books'} · ${quote.ageUnknown ? 'This book does not report when its price was seen' : `Observed ${age(quote.ts)}`}`,
    note:`Fair value uses your saved reference-book, weighting, and ${suite.settings().devigMethod} no-vig settings. Missing values mean there is not enough qualifying data. Detailed analysis shows each reference and any estimated threshold.`,
    columns,rows,historyBySide,history:priceHistory,canSwap:!!opposite,swapId:peers.find(item=>item.side===opposite)?.id,
    // Feed prices can't be edited; they are replaced on every refresh.
    canEdit:canEdit && quote.source !== 'local-api',canTrack:canEdit};
}
// Line History modal for any [data-line-history="<quote id>"] button.
// The quote API keeps each price's history (GET /site/odds/history?id=&hours=). Pull it for every
// book in this market so the chart starts with real movement, not only what this browser saw.
async function loadServerHistory(quote) {
  const key = marketKey(quote);
  const peers = state.quotes.filter(q => q.source === 'local-api' && q.feedId && marketKey(q) === key).slice(0, 24);
  await Promise.all(peers.map(async peer => {
    try {
      const response = await fetch(`/api/ev/site/odds/history?id=${encodeURIComponent(peer.feedId)}&hours=24`, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
      const rows = response.ok ? await response.json() : [];
      const seen = new Set(state.history.filter(item => item.quoteId === peer.id).map(item => item.ts));
      for (const row of Array.isArray(rows) ? rows : []) {
        const ts = Date.parse(row?.ts), odds = Number(row?.odds);
        if (!Number.isFinite(ts) || !Number.isFinite(decimal(odds)) || seen.has(new Date(ts).toISOString())) continue;
        state.history.push({ id: uid(), quoteId: peer.id, sport: peer.sport, event: peer.displayEvent || peer.event, market: peer.market, side: peer.side, selection: peer.selection, book: peer.book, line: peer.line, odds, ts: new Date(ts).toISOString(), source: 'local-api' });
      }
    } catch { /* The chart still shows what this browser recorded. */ }
  }));
  state.history.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}
async function openQuoteLineHistory(id, trigger) {
  let quote = null;
  for (const list of [quoteSource]) { quote = list().find(item => item.id === id); if (quote) break; }
  if (!quote) return;
  await loadServerHistory(quote);
  const model = comparisonForQuote(quote);
  const market = quote.displayMarket || (quote.player ? String(quote.market).replace(quote.player, '').trim() : quote.market);
  openLineHistory({subtitle:[selectionText(quote), market, quote.displayEvent || quote.event].filter(Boolean).join(' · '),
    series:buildLineSeries(model.historyBySide?.[quote.side] || [], model.columns.map(column => column.name)),
    selectedBook:quote.book, oddsLabel, trigger});
}
function showBetComparison(id, kind = 'quote', options = {}) {
  const selector=kind==='dfs'?'data-open-dfs':kind==='tracked'?'data-open-tracked':'data-open-quote';
  // Positive EV board rows carry data-evb-row, so an open analysis panel is restored after a refresh.
  const target=options.anchor || $('#ev-view').querySelector(`[${selector}="${CSS.escape(id)}"],[data-detail="${CSS.escape(id)}"],[data-sharp-select="${CSS.escape(id)}"],.evb-row[data-evb-row="${CSS.escape(id)}"]`);
  if(!target)return;
  const anchor=target.closest('.evc-card,.wager-card,tr,.ev-arb-card,.ev-arb-opportunity,.sharp-card,.ev-reference-card')||target;
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
    const source = quoteSource();
    const quote = source.find(item => item.id === id);
    if (!quote) return;
    model = {...comparisonForQuote(quote),
      market:quote.displayMarket || (quote.player ? quote.market.replace(quote.player,'').trim() : quote.market),
      event:quote.displayEvent || quote.event,
      selection:selectionText(quote),
      fairMark:'',fairLabel:'Fair value · consensus',probabilityLabel:'Consensus prob'};
  }
  model.id=id;
  model.inlineHistory=true;
  model.historyMetric='line';
  if(kind==='dfs'){model.canEdit=true;model.canTrack=true;model.trackLabel='Add to fantasy slip';}
  if(kind==='tracked')model.canEdit=true;
  const mount=document.createElement(anchor.tagName==='TR'?'tr':'div');mount.className='bet-inline-mount';mount.id='expanded-bet-comparison';
  const root=anchor.tagName==='TR'?mount.appendChild(document.createElement('td')):mount;
  if(anchor.tagName==='TR')root.colSpan=anchor.children.length;
  const tableWrap=anchor.closest('.evb-table-wrap,.ev-table-wrap');
  if(tableWrap)mount.style.setProperty('--mount-width',tableWrap.clientWidth+'px');
  root.innerHTML=betComparisonCard(model);
  if(kind==='quote'&&!anchor.matches('.ev-reference-card')){
    const quote=state.quotes.find(item=>item.id===id);
    if(quote)root.insertAdjacentHTML('beforeend',`<div class="evx-workspace evx-native-actions">${suite.controls(quote,active)}</div>`);
  }
  if(anchor.matches('.wager-card'))anchor.append(mount);else anchor.after(mount);
  if(anchor.matches('.ev-reference-card'))anchor.hidden=true;
  const scroller=mount.closest('.ev-table-wrap');if(scroller)scroller.scrollLeft=0;
  inlineDetail={id,kind,tool:active,anchor};const disclosure=anchor.querySelector('[data-detail]')||target;disclosure.setAttribute('aria-expanded','true');disclosure.setAttribute('aria-controls',mount.id);
  bindComparison(root,model,{
    onCollapse:closeInlineDetail,
    onSwap:()=>model.swapId&&showBetComparison(model.swapId,kind,{anchor,force:true}),
    onEdit:()=>openForm(kind==='dfs'?'dfs':kind==='tracked'?'bet':'quote',id),
    onTrack:()=>{if(kind==='dfs'){const item=state.dfs.find(entry=>entry.id===id);if(item.app!==fantasyApp){fantasyApp=item.app;fantasyIds=[];}fantasyIds=[...new Set([...fantasyIds,id])];setTool('slip');}else{const quote=state.quotes.find(item=>item.id===id);if(quote)suite.trackQuote(quote,active);}},
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
function closeInlineDetail(){const anchor=inlineDetail?.anchor;if(anchor?.matches?.('.evb-row[data-evb-row]')&&!$('#ev-view').querySelector('.evb-detail-row')){anchor.classList.remove('is-open');anchor.querySelector('[data-evb-toggle]')?.setAttribute('aria-expanded','false');}if(anchor?.matches('.ev-reference-card'))anchor.hidden=false;$('#ev-view').querySelector('.bet-inline-mount')?.remove();$('#ev-view').querySelectorAll('[aria-controls="expanded-bet-comparison"]').forEach(el=>el.setAttribute('aria-expanded','false'));inlineDetail=null;const focus=anchor?.matches('button,[tabindex]')?anchor:anchor?.querySelector('[data-detail]')||anchor?.querySelector('button');focus?.focus({preventScroll:true});}

function openDetail(id, anchor) { showBetComparison(id, 'quote', {anchor}); }

// Paired opportunity boards (Arbitrage, Middles, Low holds) reuse the Positive EV
// board markup (evb-* classes). Rows expand in place; each render registers its
// detail builders so a toggle never needs a full re-render.
let pairOpenId = '';
let pairVisibleCount = 40;
const pairDetails = new Map();
const pairContext = extra => ({oddsLabel, age, bookAvailable, bookOrder:sportsbookNames, pinned:id => Boolean(state.suite?.flags?.[id]?.pin), ...extra});
const pairKey = (a, b) => `${a.id}|${b.id}`;
const pairMarket = q => q.displayMarket || (q.player ? String(q.market).replace(q.player, '').trim() : q.market);
const pairBar = ratio => Math.max(6, Math.min(100, ratio * 100)).toFixed(1);
const pairCapacity = plan => plan.limitsKnown && Number.isFinite(plan.maximumFeasibleTotal) ? money(plan.maximumFeasibleTotal) : Number.isFinite(plan.maximumFeasibleTotal) ? `≤ ${money(plan.maximumFeasibleTotal)}` : 'Not supplied';
const pairOldest = (...quotes) => quotes.map(q => q.ts).sort()[0];
const pairCalcIcon = size => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h1m6 0h1m-8 4h1m6 0h1"/></svg>`;
function pairCells(q, pinned, metric) {
  const market = pairMarket(q), sportKey = String(q.sport || '').toLowerCase();
  return `<td class="evb-ev" data-tier="${metric.tier}"><strong>${metric.value}</strong><span class="evb-ev-bar" aria-hidden="true"><i style="width:${metric.width}%"></i></span>${metric.note ? `<small class="pair-metric-note">${metric.note}</small>` : ''}${pinned ? `<small class="evb-pin">${boardIcon('pin', 12)}Pinned</small>` : ''}</td>
    <td class="evb-event"><small>${esc(startLabel(q))}</small><strong>${esc(q.displayEvent || q.event)}</strong><span class="evb-league">${leagueMark(sportKey) || ''}<span>${esc(q.sport)}${q.league && q.league !== q.sport ? ` · ${esc(q.league)}` : ''}</span></span><small class="pair-event-market">${esc(market)}</small></td>
    <td class="evb-market"><span>${esc(market)}</span>${q.live ? '<small class="evb-live-dot">Live</small>' : ''}</td>`;
}
const pairLeg = (ctx, q, side, note = '') => `<td class="pair-leg pair-leg-${side}"><div><span class="evb-book-logo">${bookLogo(q.book, 30)}</span><span class="pair-leg-copy"><strong>${esc(selectionText(q))}</strong><small>${esc(q.book)}</small>${note ? `<small class="pair-leg-note">${note}</small>` : ''}</span><span class="evb-price">${esc(ctx.oddsLabel(q.odds))}</span></div></td>`;
const pairToggle = (key, label) => `<button type="button" class="evb-icon evb-toggle" data-pair-toggle="${esc(key)}" aria-expanded="${pairOpenId === key}" aria-controls="pair-detail-${esc(key)}" aria-label="Details for ${esc(label)}" title="Details">${boardIcon('chevron')}</button>`;
const pairTable = (label, heads, body) => `<div class="evb-table-wrap"><table class="evb-table pair-table" aria-label="${esc(label)}"><thead><tr>${heads.map(([text, cls = '']) => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${text}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const pairStats = items => `<dl class="evb-stats">${items.map(([label, value, cls = '']) => `<div class="${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
const pairFooter = (legend, actions, note = '') => `${note ? `<p class="pair-note">${note}</p>` : ''}<footer class="evb-detail-footer"><ul class="evb-legend" aria-label="Legend">${legend.map(([cls, label]) => `<li><i class="${cls}"></i>${label}</li>`).join('')}</ul><div class="evb-detail-actions">${actions}</div></footer>`;
const pairDetail = (key, columns, label, inner) => `<tr class="evb-detail-row pair-detail-row" id="pair-detail-${esc(key)}"><td colspan="${columns}"><section class="evb-detail" aria-label="${esc(label)}">${inner}</section></td></tr>`;
// Long boards render in pages of 40 rows; thousands of rows stall style and layout.
const pairMore = total => total > pairVisibleCount ? `<button type="button" class="ev-parlay-more" data-pair-more>Show ${Math.min(40, total - pairVisibleCount)} more · ${pairVisibleCount} of ${total} shown</button>` : '';
const pairSummary = (text, pills, extra = '') => `<div class="wager-results-bar evb-results-bar"><div class="evb-summary"><p>${text}</p><div class="pair-summary-side">${pills.length ? `<dl>${pills.map(([label, value, cls = '']) => `<div><dt>${esc(label)}</dt><dd${cls ? ` class="${cls}"` : ''}>${esc(value)}</dd></div>`).join('')}</dl>` : ''}${extra}</div></div></div>`;
function pairBoardRow(key, q, pinned, cells, detail) {
  pairDetails.set(key, detail);
  const open = pairOpenId === key;
  return `<tr class="evb-row${open ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}" data-pair-row="${esc(key)}" data-wager-id="${esc(q.id)}">${cells}</tr>${open ? detail() : ''}`;
}
// Books quoting the market (chosen books first) and the newest price per book and side.
function pairBooks(ctx, rows, chosen) {
  const order = book => { const pick = chosen.findIndex(q => q.book === book), index = ctx.bookOrder.indexOf(book); return pick >= 0 ? pick - 10 : index < 0 ? 100 : index; };
  const books = [...new Set(rows.map(q => q.book))].filter(book => ctx.bookAvailable(book) || chosen.some(q => q.book === book)).sort((x, y) => order(x) - order(y) || x.localeCompare(y));
  const latest = (book, side) => chosen.find(q => q.book === book && q.side === side) || rows.filter(q => q.book === book && q.side === side).sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts))[0];
  return {books, latest};
}
// Both selections of one market at every book. Chosen prices are solid lime.
function pairMatrix(ctx, rows, chosen, summary, beats = () => false) {
  const {books, latest} = pairBooks(ctx, rows, chosen);
  const heads = books.map(book => {
    const pair = chosen.map(q => latest(book, q.side)), hold = pair.every(Boolean) ? (pair.reduce((sum, q) => sum + implied(q.odds), 0) - 1) * 100 : NaN;
    return `<th scope="col" class="${chosen.some(q => q.book === book) ? 'is-offer' : ''}" title="${esc(book)}"><span class="evb-book-tile">${bookLogo(book, 34)}</span><small>${esc(book)}</small><em>${Number.isFinite(hold) ? `${hold.toFixed(1)}% hold` : 'One side'}</em></th>`;
  }).join('');
  const body = chosen.map((q, index) => `<tr class="is-selected-side"><th scope="row"><span>${esc(selectionText(q))}</span></th>${summary.cells(q, index).map(value => `<td class="evb-summary-cell"><strong>${esc(value)}</strong></td>`).join('')}${books.map(book => {
    const price = latest(book, q.side);
    return `<td class="${price?.id === q.id ? 'is-best' : price && beats(price, index) ? 'is-plus' : ''}"><span>${price ? esc(ctx.oddsLabel(price.odds)) : '—'}</span></td>`;
  }).join('')}</tr>`).join('');
  return `<div class="evb-matrix-scroll" tabindex="0" role="region" aria-label="Sportsbook prices for both selections. Scroll horizontally to see every book."><table class="evb-matrix"><thead><tr><th scope="col" class="evb-matrix-side">Selection</th>${summary.heads.map(head => `<th scope="col" class="evb-summary-head">${head}</th>`).join('')}${heads}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Open or close one pair's detail in place so scroll position and focus stay put.
function togglePairRow(view, key) {
  view.querySelectorAll('.pair-detail-row,.evd-row[id^="pair-detail-"]').forEach(item => item.remove());
  view.querySelectorAll('.evb-row.is-open[data-pair-row]').forEach(item => { item.classList.remove('is-open'); item.querySelector('[data-pair-toggle]')?.setAttribute('aria-expanded', 'false'); });
  pairOpenId = pairOpenId === key ? '' : key;
  const target = pairOpenId && view.querySelector(`.evb-row[data-pair-row="${CSS.escape(key)}"]`), detail = pairDetails.get(key);
  if (!target || !detail) { pairOpenId = ''; return; }
  target.classList.add('is-open');
  target.querySelector('[data-pair-toggle]')?.setAttribute('aria-expanded', 'true');
  target.insertAdjacentHTML('afterend', detail());
}

// Arbitrage rows: Arb % pill, market and event, then one legs card holding both
// bets. The swap tool flips which leg is listed first; boosts re-run the split.
const pairSwapped = new Set();
const pairArbs = new Map();
const arbLegs = key => { const {legs} = pairArbs.get(key).entry; return pairSwapped.has(key) ? [legs[1], legs[0]] : legs; };
const arbLiquidity = q => Number(q.liquidity) > 0 ? `$${Math.round(Number(q.liquidity)).toLocaleString('en-US')}` : '';
function arbEvent(q) {
  const sport = String(q.sport || '').toLowerCase(), event = String(q.displayEvent || q.event || 'Event not entered');
  const codes = ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer'].includes(sport) && /^([A-Z]{2,4})\s+(@|vs\.?)\s+([A-Z]{2,4})$/.exec(event);
  return `<span class="arb-teams">${codes ? `${teamMark({sport, team:codes[1]})}<span>${esc(event)}</span>${teamMark({sport, team:codes[3]})}` : `<span>${esc(event)}</span>`}</span>`;
}
const arbLeg = (ctx, q, i, plan, side) => `<div class="arb-leg arb-leg-${side}"><span class="evb-book-logo">${bookLogo(q.book, 30)}</span><span class="arb-leg-copy"><button type="button" class="arb-leg-link" data-suite-action="link" data-id="${esc(q.id)}" aria-label="Open ${esc(q.book)} bet link for ${esc(selectionText(q))}"><span>${esc(selectionText(q))}</span>${boardIcon('link', 13)}</button><small>${esc(q.book)}</small></span>
  <span class="arb-stat arb-odds"><strong>${esc(ctx.oddsLabel(q.odds))}</strong><small>Odds${arbLiquidity(q) ? `<span class="arb-liq"><span aria-hidden="true"> · </span>Liq ${arbLiquidity(q)}</span>` : ''}</small></span><span class="arb-stat arb-stake"><strong>${money(plan.stakes[i])}</strong><small>Rec Bet</small></span><span class="arb-stat arb-profit"><strong class="${plan.profits[i] >= 0 ? 'is-positive' : 'is-negative'}">${money(plan.profits[i])}</strong><small>Profit</small></span></div>`;
// Both selections at every book for the expanded panel; the chosen prices are lime.
function arbPrices(ctx, rows, chosen) {
  const {books, latest} = pairBooks(ctx, rows, chosen);
  return {books, rows:chosen.map((q, index) => {
    const prices = books.map(book => latest(book, q.side)), quoted = prices.filter(Boolean);
    const best = quoted.reduce((top, price) => !top || decimal(price.odds) > decimal(top.odds) ? price : top, null);
    const average = probabilityToAmerican(quoted.reduce((sum, price) => sum + implied(price.odds), 0) / quoted.length);
    return {label:selectionText(q), selected:index === 0, average:Number.isFinite(average) ? ctx.oddsLabel(average) : '—', best:best && {book:best.book, value:ctx.oddsLabel(best.odds)},
      cells:prices.map(price => price ? {value:ctx.oddsLabel(price.odds), sub:arbLiquidity(price), best:price.id === q.id} : {value:'—'})};
  })};
}
function arbRow(key) {
  const {entry:{legs, plan, rows = legs}, ctx} = pairArbs.get(key), order = pairSwapped.has(key) ? [1, 0] : [0, 1], [a, b] = arbLegs(key);
  const pinned = ctx.pinned(a.id) && ctx.pinned(b.id), label = `${selectionText(a)} and ${selectionText(b)}`, sportKey = String(a.sport || '').toLowerCase();
  const ids = `data-id="${esc(a.id)}" data-hedge="${esc(b.id)}"`, calc = `data-arb-calc="${esc(a.id)}" data-arb-hedge="${esc(b.id)}" aria-haspopup="dialog"`;
  const cells = `<td class="arb-pct"><span class="arb-pill">${(plan.margin * 100).toFixed(2)}%</span>${pinned ? `<small class="evb-pin">${boardIcon('pin', 12)}Pinned</small>` : ''}</td>
    <td class="arb-market"><div class="arb-title"><strong>${esc(pairMarket(a))}</strong><span class="evb-league">${leagueMark(sportKey) || ''}<span>${esc(a.sport)}${a.league && a.league !== a.sport ? ` · ${esc(a.league)}` : ''}</span></span>${a.live ? '<small class="evb-live-dot">Live</small>' : ''}</div><div class="arb-when">${arbEvent(a)}<small>${esc(startLabel(a))}</small></div></td>
    <td class="arb-legs-cell"><div class="arb-legs"><button type="button" class="arb-open-both" data-pair-open-both="${esc(key)}" aria-haspopup="dialog" aria-label="Open both bet links for ${esc(label)}" title="Open both bets"><span>2</span><span>X</span>${boardIcon('link', 13)}</button><div class="arb-leg-list">${arbLeg(ctx, a, order[0], plan, 'a')}${arbLeg(ctx, b, order[1], plan, 'b')}</div></div></td>
    <td class="evb-actions"><div>${pairToggle(key, label)}</div></td>`;
  const detail = () => renderBetPanel({id:`pair-detail-${key}`, colspan:4, label:`Stake plan and book prices for ${label}`,
    boosts:[a, b].map((q, i) => ({book:q.book, attrs:`data-arb-boost="${esc(key)}" data-leg="${i}"`})),
    tools:[
      {icon:'calculator', label:'Arbitrage calculator', attrs:calc},
      {icon:'edit', label:'Boost or bonus calculator', attrs:`data-suite-action="arb-promo" ${ids} aria-haspopup="dialog"`},
      {icon:'swap', label:'Swap bet order', attrs:`data-pair-swap="${esc(key)}"`},
      {icon:'history', label:'Line history', attrs:`data-line-history="${esc(a.id)}" aria-haspopup="dialog"`},
      {icon:'hide', label:'Hide both bets', attrs:`data-suite-action="hide-arb" ${ids}`},
      {icon:'trackCircle', label:'Track both sides', attrs:`data-suite-action="track-arb" ${ids}`},
      {icon:'pin', label:pinned ? 'Unpin both bets' : 'Pin both bets', pressed:pinned, attrs:`data-suite-action="pin-arb" ${ids}`},
      {icon:'flag', label:'Report a problem', attrs:`data-suite-action="report" data-id="${esc(a.id)}"`},
      {icon:'refresh', label:'Refresh prices', attrs:`data-pair-refresh="${esc(key)}"`}
    ],
    ...arbPrices(ctx, rows, [a, b]),
    note:`${(plan.margin * 100).toFixed(2)}% return on ${money(plan.actualTotal)} · lowest outcome ${money(plan.minProfit)} · capacity ${esc(pairCapacity(plan))} · observed ${esc(ctx.age(pairOldest(a, b)))}. Stakes are rounded${plan.limited ? ' and reduced to supplied limits' : ''} and include supplied commissions and boosts.${plan.pushPossible ? ' A shared push returns both cash stakes; the lowest outcome includes it.' : ''}`});
  return pairBoardRow(key, a, pinned, cells, detail);
}
// Re-render one arbitrage row (and its open panel) with the legs in the other order.
function swapPairRow(view, key) {
  const row = view.querySelector(`.evb-row[data-pair-row="${CSS.escape(key)}"]`);
  if (!row || !pairArbs.has(key)) return;
  if (!pairSwapped.delete(key)) pairSwapped.add(key);
  if (row.nextElementSibling?.matches('.evb-detail-row')) row.nextElementSibling.remove();
  row.insertAdjacentHTML('afterend', arbRow(key));
  row.remove();
  view.querySelector(`[data-pair-swap="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
// "2 X" opens a small list of both legs; each opens the usual bet-link check.
function openPairLinks(key) {
  const item = pairArbs.get(key);
  if (!item) return;
  const {entry:{legs, plan}, ctx} = item, order = pairSwapped.has(key) ? [1, 0] : [0, 1];
  let dialog = document.getElementById('pair-links-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'pair-links-dialog';
    dialog.className = 'evx-dialog pair-links-dialog';
    dialog.setAttribute('aria-labelledby', 'pair-links-title');
    dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-pair-links-close]')) dialog.close(); });
    $('#main').append(dialog);
  }
  dialog.innerHTML = `<header><h2 id="pair-links-title">Open both bets</h2><button type="button" data-pair-links-close>Close</button></header><div class="evx-dialog-body"><p>Place each leg at its sportsbook. Confirm the price and stake before you bet.</p><ul class="pair-links">${order.map(i => { const q = legs[i]; return `<li><button type="button" data-suite-action="link" data-id="${esc(q.id)}"><span class="pair-links-logo">${bookLogo(q.book, 30)}</span><span class="pair-links-copy"><strong>${esc(selectionText(q))}</strong><small>${esc(q.book)} · ${esc(ctx.oddsLabel(q.odds))} · Bet ${money(plan.stakes[i])}</small></span>${boardIcon('link', 15)}</button></li>`; }).join('')}</ul></div>`;
  dialog.showModal();
}

// ctx: pairContext({live, firstStake, budget})
function renderArbBoard(opportunities, ctx) {
  pairDetails.clear();
  pairArbs.clear();
  const top = Math.max(...opportunities.map(({plan}) => plan.margin), .0001);
  const body = opportunities.slice(0, pairVisibleCount).map(entry => { const key = pairKey(...entry.legs); pairArbs.set(key, {entry, ctx}); return arbRow(key); }).join('');
  const count = opportunities.length, books = new Set(opportunities.flatMap(({legs}) => legs.map(q => q.book))).size;
  return pairSummary(`<strong>${count} ${ctx.live ? 'live' : 'pregame'} arbitrage ${count === 1 ? 'match' : 'matches'}</strong> from a ${money(ctx.firstStake)} first stake`, [['Top return', (top * 100).toFixed(2) + '%', 'is-positive'], ['Books', String(books)], ['Bankroll', money(ctx.budget)]])
    + pairTable(`${ctx.live ? 'Live' : 'Pregame'} arbitrage opportunities`, [['Arb %', 'arb-col-pct'], ['Market'], ['Bets'], ['<span class="sr-only">Actions</span>', 'evb-col-actions']], body) + pairMore(count);
}
// Final totals (or first-selection margins) from just below to just above the window.
function pairLadder(x) {
  const {over, under, plan} = x, low = x.kind === 'spread' ? -Number(over.line) : Number(over.line), high = Number(under.line);
  let scores = [];
  for (let score = Math.floor(low) - 1; score <= Math.ceil(high) + 1; score++) scores.push(score);
  if (scores.length > 12) scores = [...new Set([Math.floor(low) - 1, Math.floor(low), Math.round((low + high) / 2), Math.ceil(high), Math.ceil(high) + 1])];
  const results = scores.map(score => middleOutcomes(over, under, plan.stakes[0], plan.stakes[1], score));
  const word = leg => leg ? {win:'Win', push:'Push', loss:'Loss'}[leg.result] || '—' : '—';
  const net = result => !result ? '' : result.a.result === 'win' && result.b.result === 'win' ? 'is-best' : result.profit >= 0 ? 'is-plus' : 'is-loss';
  const legRow = (q, pick) => `<tr><th scope="row"><span>${esc(selectionText(q))}</span></th>${results.map(result => `<td class="pair-result is-${pick(result)?.result || 'none'}"><span>${word(pick(result))}</span></td>`).join('')}</tr>`;
  return `<div class="evb-matrix-scroll" tabindex="0" role="region" aria-label="Net result at each final score. Scroll horizontally to see every score."><table class="evb-matrix pair-ladder"><thead><tr><th scope="col" class="evb-matrix-side">${x.kind === 'spread' ? `${esc(over.side)} margin` : 'Final total'}</th>${scores.map(score => `<th scope="col">${score}</th>`).join('')}</tr></thead><tbody>${legRow(over, result => result?.a)}${legRow(under, result => result?.b)}<tr class="is-selected-side"><th scope="row"><span>Net result</span></th>${results.map(result => `<td class="${net(result)}"><span>${result ? money(result.profit) : '—'}</span></td>`).join('')}</tr></tbody></table></div>`;
}

// ctx: pairContext({stake})
function renderMiddleBoard(rows, ctx, empty) {
  pairDetails.clear();
  const top = Math.max(...rows.map(x => x.inside.profit), .01);
  const body = rows.slice(0, pairVisibleCount).map(x => {
    const {over, under, plan} = x, key = pairKey(over, under), pinned = ctx.pinned(over.id) || ctx.pinned(under.id), label = `${selectionText(over)} and ${selectionText(under)}`;
    const low = x.kind === 'spread' ? -Number(over.line) : Number(over.line), high = Number(under.line);
    const calc = `data-suite-action="middle" data-id="${esc(over.id)}" data-hedge="${esc(under.id)}" aria-haspopup="dialog"`;
    const cells = pairCells(over, pinned, {value:money(x.inside.profit), width:pairBar(x.inside.profit / top), tier:'high', note:`Window ${esc(low)} to ${esc(high)}`})
      + pairLeg(ctx, over, 'a', `Stake ${money(plan.stakes[0])}`) + pairLeg(ctx, under, 'b', `Stake ${money(plan.stakes[1])}`)
      + `<td class="pair-window"><span class="pair-window-line" aria-hidden="true" style="--win-left:${(2/(Math.abs(high-low)+4)*100).toFixed(1)}%;--win-width:${(Math.abs(high-low)/(Math.abs(high-low)+4)*100).toFixed(1)}%"><b></b></span><strong>${esc(low)} to ${esc(high)}</strong><small>${x.kind === 'spread' ? `${esc(over.side)} margin` : 'Final total'} · ${esc(x.width)} ${x.width === 1 ? 'pt' : 'pts'}</small></td>
      <td class="pair-outside"><strong class="${x.outside >= 0 ? 'is-positive' : 'is-negative'}">${money(x.outside)}</strong><small>on ${money(plan.actualTotal)}</small></td>
      <td class="evb-actions"><div><button type="button" class="evb-link" ${calc} aria-label="Calculate outcome for ${esc(label)}" title="Calculate outcome">${pairCalcIcon(14)}<span>Calculate</span></button>${pairToggle(key, label)}</div></td>`;
    const detail = () => pairDetail(key, 8, `Outcomes for ${label}`,
      pairStats([['Net if both win', money(x.inside.profit), 'is-positive'], ['Total stake', money(plan.actualTotal)], ['At lower line', money(x.lower.profit), x.lower.profit >= 0 ? '' : 'is-negative'], ['At upper line', money(x.upper.profit), x.upper.profit >= 0 ? '' : 'is-negative'], ['Lowest outside', money(x.outside), x.outside >= 0 ? 'is-positive' : 'is-negative'], ['Capacity', pairCapacity(plan)]])
      + pairLadder(x)
      + pairFooter([['is-best', 'Both bets win'], ['is-plus', 'Net gain or even'], ['is-loss', 'Net loss']],
        `<button type="button" data-suite-action="track" data-id="${esc(over.id)}" data-tool="middles">${boardIcon('track', 14)}Track first</button><button type="button" data-suite-action="track" data-id="${esc(under.id)}" data-tool="middles">${boardIcon('track', 14)}Track second</button><button type="button" class="evb-primary" ${calc}>${pairCalcIcon(14)}Calculate outcome</button>`,
        `Observed ${esc(ctx.age(pairOldest(over, under)))}.${plan.limited ? ' Stakes were reduced to supplied limits.' : ''} At an exact line, that leg pushes and returns its stake.`));
    return pairBoardRow(key, over, pinned, cells, detail);
  }).join('');
  const live = rows.filter(x => x.over.live).length;
  const stakeField = `<label class="pair-stake-input"><span>Total outlay</span><span class="pair-stake-field"><span aria-hidden="true">$</span><input id="ev-bankroll" type="number" min="1" step="0.01" value="${esc(ctx.stake)}" aria-describedby="pair-middle-note"></span></label>`;
  return pairSummary(`<strong>${rows.length} winning ${rows.length === 1 ? 'window' : 'windows'}</strong> · ${live} live`, rows.length ? [['Best both-win', money(top), 'is-positive']] : [], stakeField)
    + (rows.length ? pairTable('Middle opportunities', [['Both win', 'evb-col-ev'], ['Event'], ['Market'], ['First side'], ['Second side'], ['Window', 'pair-col-extra'], ['Outside'],['<span class="sr-only">Actions</span>', 'evb-col-actions']], body) + pairMore(rows.length) : empty)
    + `<p class="ev-caption ev-method-note" id="pair-middle-note">Each pair splits the total outlay; supplied limits may reduce it. Rounded splits include supplied commissions and boosts. The both-win figure assumes an attainable score strictly between the lines. Open a row for the outcome at every final score.</p>`;
}

// ctx: pairContext()
function renderHoldBoard(rows, ctx, empty) {
  pairDetails.clear();
  const holds = rows.map(x => x.hold), worst = Math.max(...holds, 0), best = Math.min(...holds, 0);
  const body = rows.slice(0, pairVisibleCount).map(x => {
    const [a, b] = x.best, key = pairKey(a, b), label = `${selectionText(a)} and ${selectionText(b)}`;
    const sum = implied(a.odds) + implied(b.odds), fair = [implied(a.odds) / sum, implied(b.odds) / sum];
    const cells = pairCells(a, false, {value:signed(x.hold), width:pairBar(worst === best ? 1 : .06 + .94 * (worst - x.hold) / (worst - best)), tier:x.hold < 0 ? 'high' : 'flat'})
      + pairLeg(ctx, a, 'a', `${percent(implied(a.odds))} implied`) + pairLeg(ctx, b, 'b', `${percent(implied(b.odds))} implied`)
      + `<td class="pair-fair"><strong>${percent(fair[0])} / ${percent(fair[1])}</strong><span class="pair-split" aria-hidden="true"><i style="width:${(fair[0]*100).toFixed(1)}%"></i></span><small>No-vig split</small></td>
      <td class="evb-actions"><div>${pairToggle(key, label)}</div></td>`;
    const detail = () => pairDetail(key, 7, `Book prices for ${label}`,
      pairStats([['Combined hold', signed(x.hold), x.hold < 0 ? 'is-positive' : ''], ['Market margin', x.hold < 0 ? 'Below zero' : 'Combined margin'], [`Fair ${selectionText(a)}`, ctx.oddsLabel(probabilityToAmerican(fair[0]))], [`Fair ${selectionText(b)}`, ctx.oddsLabel(probabilityToAmerican(fair[1]))], ['Books compared', String(new Set(x.rows.map(q => q.book)).size)], ['Observed', ctx.age(pairOldest(a, b))]])
      + pairMatrix(ctx, x.rows, [a, b], {heads:['Implied', 'No-vig'], cells:(q, i) => [percent(implied(q.odds)), percent(fair[i])]})
      + pairFooter([['is-best', 'Best price']], x.hold < 0 ? `<button type="button" class="evb-primary" data-tool="${a.live ? 'arb-live' : 'arb-pre'}">${pairCalcIcon(14)}Open in Arbitrage</button>` : ''));
    return pairBoardRow(key, a, false, cells, detail);
  }).join('');
  return pairSummary(`<strong>${rows.length} ${rows.length === 1 ? 'market' : 'markets'} compared</strong> · best price on both sides`, rows.length ? [['Lowest hold', signed(rows[0].hold), rows[0].hold < 0 ? 'is-positive' : ''], ['Below zero', String(rows.filter(x => x.hold < 0).length)]] : [])
    + (rows.length ? pairTable('Lowest-hold markets', [['Hold', 'evb-col-ev'], ['Event'], ['Market'], ['First side'], ['Second side'], ['No-vig'], ['<span class="sr-only">Actions</span>', 'evb-col-actions']], body) + pairMore(rows.length) : empty)
    + '<p class="ev-caption ev-method-note">Hold is the sum of both implied probabilities, less 100%. Negative hold is a potential arbitrage before fees, limits, and execution changes. Open a row to compare every book.</p>';
}

const ARB_SANITY_LIMIT = .15;
function renderArb(live) {
  const settings = suite.settings();
  const budget = Math.max(.01, Number(bankroll) || 5000);
  const firstStake = Math.max(.01, Number(stake) * flatMultiplier || 100);
  const minimumMargin = Math.max(Number(settings.minArbPercent || 0) / 100, Number(designFilters.minEdge) || 0);
  // Without a saved max, returns above 15% are hidden: real arbitrage is almost always a few
  // percent, and larger gaps come from mislabeled sides, sports or stale prices in the feed.
  const maximumMargin = settings.maxArbPercent === '' || settings.maxArbPercent == null ? ARB_SANITY_LIMIT : Number(settings.maxArbPercent) / 100;
  const pinned = legs => legs.some(q => state.suite?.flags?.[q.id]?.pin);
  const capacityPasses = plan => !(Number(settings.minAvailableStake) > 0) || plan.limitsKnown && Number.isFinite(plan.maximumFeasibleTotal) && plan.maximumFeasibleTotal >= Number(settings.minAvailableStake);
  const opportunities = arbitrageRows(quotes().filter(q => sportsbookSelected(q.book) && suite.quoteVisible(q)), live, settings)
    .flatMap(({ rows, best }) => rows.filter(q => q.side === best[0].side).flatMap(a =>
      rows.filter(b => b.side === best[1].side && b.book !== a.book).map(b => {
        const legs = [a,b], allocation = constrainedArb(legs, budget);
        if (!allocation) return null;
        const requested = Math.min(budget, firstStake * allocation.actualTotal / allocation.stakes[0]);
        const plan = constrainedArb(legs, requested);
        return plan ? {legs,plan,rows} : null;
      })))
    .filter(entry => entry && (!marketType || entry.legs[0].type === marketType) && entry.plan.margin >= minimumMargin && entry.plan.margin <= maximumMargin && capacityPasses(entry.plan))
    .sort((left,right) => Number(pinned(right.legs)) - Number(pinned(left.legs)) || right.plan.margin - left.plan.margin);
  if (preserveLiveOrder) {
    preserveReadingOrder(opportunities, [...document.querySelectorAll('.evb-row[data-pair-row]')].map(row=>row.dataset.pairRow), ({legs:[a,b]})=>pairKey(a,b));
    opportunities.sort((left,right) => Number(pinned(right.legs)) - Number(pinned(left.legs)));
  }
  const count = opportunities.length;
  return `<div class="ev-stack ev-arb-screen evb-board pair-board arb-board">${count ? renderArbBoard(opportunities, pairContext({live, firstStake, budget})) : `<div class="ev-empty ev-arb-empty"><strong>${live && !state.quotes.some(q => q.live) ? 'No live games in the feed right now' : 'No arbitrage matches'}</strong><p>${live && !state.quotes.some(q => q.live) ? 'Live arbitrage appears here when the quote feed sends in-play prices. Pregame arbitrage is under the Pregame tab.' : state.quotes.length ? 'No opposing prices match the selected books, pricing settings, and stake limits. Adjust a filter or wait for the next refresh.' : 'Arbitrage matches appear here once the quote API returns both sides of a market at different sportsbooks.'}</p><div class="ev-arb-empty-actions">${state.quotes.length ? button('Clear filters', 'data-arb-clear') : ''}</div></div>`}<p class="ev-caption ev-method-note">Rounded stakes use supplied limits, commissions, and boosts. Missing capacity is labeled; calculated outcomes do not confirm availability at a sportsbook. Open a row to compare every book.${maximumMargin === ARB_SANITY_LIMIT ? ' Returns above 15% are hidden as likely data errors; set a max return in Pricing &amp; filters to change this.' : ''}</p></div>`;
}

// When a tool's filters hide every result, say so instead of implying the feed has no prices.
const filteredEmpty = (fallback, symbol = 'filter') => TOOL_FILTERS[active] && activeFilterCount(toolFilters, TOOL_FILTERS[active]) && state.quotes.length
  ? toolEmpty('Nothing matches these filters', 'The quote API has prices, but none pass the filters you picked. Loosen or clear a filter to see more.', button('Clear filters', 'data-tool-filter-clear'), symbol)
  : fallback;
function renderMiddles() {
  const settings = suite.settings();
  const pinned = row => [row.over,row.under].some(q => state.suite?.flags?.[q.id]?.pin);
  // Allocate only the supplied financial terms here. Settlement still uses the
  // original exact market identities and distinct thresholds below.
  const allocationLeg = q => Object.fromEntries(['odds','commission','commissionPercent','boostPercent','minStake','maxStake','maxBet','exchange','liquidity'].filter(key=>q[key]!==undefined).map(key=>[key,q[key]]));
  const rows = [false,true].flatMap(mode => middleRows(eligibleQuotes(quotes()).filter(q=>sportsbookSelected(q.book)&&suite.quoteVisible(q)),mode,settings))
    .map(row => {
      const plan = constrainedArb([allocationLeg(row.over),allocationLeg(row.under)],Number(stake));
      if (!plan || Number(settings.minAvailableStake)>0 && (!plan.limitsKnown || !Number.isFinite(plan.maximumFeasibleTotal) || plan.maximumFeasibleTotal<Number(settings.minAvailableStake))) return null;
      const lower = row.kind==='spread' ? -Number(row.over.line) : Number(row.over.line), upper = Number(row.under.line);
      const outcomes = [lower-1,(lower+upper)/2,upper+1,lower,upper].map(score=>middleOutcomes(row.over,row.under,plan.stakes[0],plan.stakes[1],score));
      if (outcomes.some(outcome=>!outcome)) return null;
      return {...row,plan,inside:outcomes[1],outside:Math.min(outcomes[0].profit,outcomes[2].profit),lower:outcomes[3],upper:outcomes[4]};
    }).filter(row => row && (!toolFilters.minWidth || row.width >= Number(toolFilters.minWidth)) && (!toolFilters.maxCost || row.cost * 100 <= Number(toolFilters.maxCost))).sort((left,right)=>Number(pinned(right))-Number(pinned(left)));
  return `<div class="tool-stack evb-board pair-board middle-board">${renderMiddleBoard(rows, pairContext({stake}), toolPanel('Middle opportunities','Compare overlapping totals and spread lines.',filteredEmpty(toolEmpty('Find a winning window','Middles appear when the quote API has a lower Over and a higher Under, or opposing spreads with room for both sides to win. Prices must meet your availability and stake settings.',action('Add market prices','quote'),'expand'))))}</div>`;
}

function renderHolds() {
  const rows = [false,true].flatMap(mode=>holdRows(eligibleQuotes(quotes()).filter(q => sportsbookSelected(q.book)),mode)).filter(row=>1/(1+row.hold)-1 <= ARB_SANITY_LIMIT && (!toolFilters.maxHold || row.hold*100 <= Number(toolFilters.maxHold))).sort((a,b)=>a.hold-b.hold);
  const empty = filteredEmpty(toolEmpty('No two-sided markets yet','Holds appear here once the quote API returns both sides of a market across books.',action('Add prices','quote'),'performance'));
  return `<div class="tool-stack evb-board pair-board hold-board">${renderHoldBoard(rows, pairContext(), empty)}</div>`;
}

function renderPromo() {
  const outcome = promoConversion({...promoInput, boost:promoInput.kind === 'bonus' ? 0 : promoInput.boost});
  // Promo book and min odds describe the promotion side only; the hedge can be at any other book.
  const promoSide = q => fresh(q) && (!toolFilters.book || q.book === toolFilters.book) && oddsWithin(q.odds, toolFilters.minOdds);
  const paired = groups(eligibleQuotes(quotes()).filter(q => sportsbookSelected(q.book))).flatMap(rows=>rows.length>=2?rows.filter(promoSide).map(q=>({q,opposite:rows.filter(x=>x.side!==q.side&&x.book!==q.book&&fresh(x)).sort((a,b)=>decimal(b.odds)-decimal(a.odds))[0]})).filter(x=>x.opposite):[]);
  const fields = `<div class="tool-form-grid"><label>Promotion type<select data-promo="kind"><option value="bonus" ${promoInput.kind==='bonus'?'selected':''}>Bonus bet · stake not returned</option><option value="boost" ${promoInput.kind==='boost'?'selected':''}>Odds boost · cash stake</option></select></label><label>${promoInput.kind==='bonus'?'Bonus value':'Cash stake'} ($)<input data-promo="stake" type="number" min="0.01" step="0.01" value="${esc(promoInput.stake)}"></label><label>Profit boost (%)<input data-promo="boost" type="number" min="0" step="0.1" value="${esc(promoInput.boost)}" ${promoInput.kind==='bonus'?'disabled':''}></label><label>Promotion odds<input data-promo="promoOdds" type="number" step="1" value="${esc(promoInput.promoOdds)}"><small>American odds, such as +150.</small></label><label>Hedge odds<input data-promo="hedgeOdds" type="number" step="1" value="${esc(promoInput.hedgeOdds)}"><small>The opposing selection at another book.</small></label></div>`;
  const result = toolReceipt('Hedge stake',outcome?money(outcome.hedge):'—', [['Promotion wins',outcome?money(outcome.ifPromoWins):'—'],['Hedge wins',outcome?money(outcome.ifHedgeWins):'—'],[promoInput.kind==='bonus'?'Bonus conversion':'Cash stake',outcome?(promoInput.kind==='bonus'?percent(outcome.conversion):money(promoInput.stake)):'—']],outcome?'Calculated from the prices entered. Check promotion terms and settlement rules before using this plan.':'Enter a positive stake and valid American odds to calculate both outcomes.');
  const bonus = promoInput.kind === 'bonus';
  const pick = q => [q.player,q.side,q.line!==''&&q.line!=null?String(q.line):''].filter(Boolean).join(' ');
  const plans = paired.filter(({q,opposite})=>1/(implied(q.odds)+implied(opposite.odds))-1 <= ARB_SANITY_LIMIT).map(({q,opposite})=>({q,opposite,plan:promoConversion({...promoInput,boost:bonus?0:promoInput.boost,promoOdds:q.odds,hedgeOdds:opposite.odds})})).filter(x=>x.plan).map(x=>({...x,locked:Math.min(x.plan.ifPromoWins,x.plan.ifHedgeWins)})).sort((a,b)=>b.locked-a.locked).slice(0,12);
  const prices = plans.length ? toolBoard({layout:'cards',variant:'promo',
    label:'Saved promotion and hedge pairs',
    summary:{text:`<strong>${plans.length} hedge ${plans.length===1?'pair':'pairs'}</strong> from saved prices`,pills:[[bonus?'Best conversion':'Best locked profit',bonus?percent(plans[0].plan.conversion):money(plans[0].locked),plans[0].locked>0],[bonus?'Bonus value':'Cash stake',money(promoInput.stake)]]},
    columns:{metric:bonus?'Conversion':'Locked profit',event:'Event',market:'Market',bet:'Promotion bet',odds:'Promo odds',prob:'Hedge',stake:'Hedge stake'},
    rows:plans.map(({q,opposite,plan,locked})=>{
      const loaded = Number(promoInput.promoOdds)===Number(q.odds) && Number(promoInput.hedgeOdds)===Number(opposite.odds);
      return {id:'promo-'+q.id,attrs:`data-open-quote="${esc(q.id)}"`,selected:loaded,
        metric:{value:bonus?percent(plan.conversion):money(locked),label:bonus?`${money(locked)} locked`:'Either side',bar:Math.max(0,locked),negative:locked<0,tier:bonus?(plan.conversion>=.7?'high':plan.conversion>=.6?'mid':'low'):locked>0?'high':'low'},
        event:{quote:q,title:q.displayEvent||q.event,sport:q.sport},market:q.displayMarket||q.market,live:q.live,
        bet:{book:q.book,title:pick(q),lines:[q.book]},
        odds:{value:oddsLabel(q.odds)},
        prob:{value:oddsLabel(opposite.odds),sub:`${pick(opposite)} · ${opposite.book}`},
        stake:{value:money(plan.hedge),sub:`at ${opposite.book}`},
        actions:boardButton(loaded?'Loaded':'Use prices',`data-promo-pair="${esc(q.id)}" data-hedge="${esc(opposite.id)}" aria-pressed="${loaded}"`)+boardToggle(`Compare prices for ${pick(q)}`,`data-detail="${esc(q.id)}"`)};
    })
  }) : toolPanel('Use saved market prices','Load a promotion price and its opposing hedge in one click.',filteredEmpty(toolEmpty('No hedge prices yet','Once the quote API returns both sides at different books, load a pair into the calculator.',action('Add prices','quote'),'tag')));
  return `<div class="tool-stack"><div class="tool-two-column">${toolPanel('Your promotion','Adjust the inputs to compare the two outcomes.',fields)}${result}</div>${prices}${toolNote('Pairs are ranked by the smaller of the two outcomes at your current promotion settings. Bonus conversion uses a stake-not-returned bonus. Odds boosts use a cash stake and boost the profit portion of the price.')}</div>`;
}

function renderParlay() {
  const selected = parlayIds.map(id=>state.quotes.find(q=>q.id===id)).filter(q=>q&&bookAvailable(q.book));
  const method = suite.settings().devigMethod;
  const legs = selected.map(q=>({...q,probability:fairProbability(q,groups(state.quotes).find(g=>g.some(x=>x.id===q.id))||[],method)}));
  const result = parlay(legs);
  const valid = result && Number.isFinite(result.ev) && new Set(selected.map(q=>q.book)).size===1;
  const invalidReason = selected.length < 2 ? 'Choose at least two legs from different events.' : new Set(selected.map(q=>q.book)).size > 1 ? 'Choose one sportsbook for every leg. These books cannot form one ticket.' : new Set(selected.map(q=>q.event)).size < selected.length ? 'Same-event legs may be correlated. This independent-leg calculator does not support that combination.' : 'A fair estimate needs complete comparison prices for every leg.';
  // Fair odds for each leg come from every book in the market; filters only choose which legs show.
  const listed = new Set(quotes().map(q => q.id));
  const options = evRows(eligibleQuotes(quoteSource().filter(q => !sport || q.sport === sport)),false,method).filter(({quote,ev})=>listed.has(quote.id) && sportsbookSelected(quote.book)
    && (!toolFilters.book || quote.book === toolFilters.book)
    && (toolFilters.legEv === '' || ev * 100 >= Number(toolFilters.legEv))
    && oddsWithin(quote.odds, '', toolFilters.maxOdds));
  const pick = q => [q.player,q.side,q.line!==''&&q.line!=null?String(q.line):''].filter(Boolean).join(' ');
  const available = options.length ? toolBoard({layout:'cards',variant:'parlay',
    label:'Available parlay legs',compact:true,
    summary:{text:`<strong>${options.length} ${options.length===1?'leg':'legs'}</strong> with complete comparison prices`,pills:[['In ticket',String(selected.length)]]},
    columns:{metric:'Leg EV',event:'Event',market:'Market',bet:'Leg & book',odds:'Odds',prob:'Fair chance'},
    rows:options.slice(0,parlayVisibleCount).map(({quote:q,fair,ev})=>{
      const inTicket = parlayIds.includes(q.id);
      return {id:'parlay-'+q.id,attrs:`data-open-quote="${esc(q.id)}"`,selected:inTicket,
        metric:{value:signed(ev),bar:Math.max(0,ev),negative:ev<0,tier:ev>=.05?'high':ev>=.02?'mid':'low'},
        event:{quote:q,title:q.displayEvent||q.event,sport:q.sport},market:q.displayMarket||q.market,live:q.live,
        bet:{book:q.book,title:pick(q),lines:[q.book]},
        odds:{value:oddsLabel(q.odds),sub:Number.isFinite(fair)?`Fair ${oddsLabel(probabilityToAmerican(fair))}`:''},
        prob:{value:percent(fair),sub:'No-vig'},
        actions:boardButton(inTicket?'Added':'Add leg',`data-parlay="${esc(q.id)}" aria-pressed="${inTicket}" aria-label="${inTicket?'Remove':'Add'} ${esc(pick(q))} ${inTicket?'from':'to'} parlay"`)+boardToggle(`Compare prices for ${pick(q)}`,`data-detail="${esc(q.id)}"`)};
    })
  })+`${options.length > parlayVisibleCount ? `<button type="button" class="ev-parlay-more" data-parlay-more>Show ${Math.min(40,options.length-parlayVisibleCount)} more legs · ${options.length} available</button>` : ''}` : filteredEmpty(toolEmpty('No priced markets yet','Parlay legs appear once the quote API returns both sides at two books.',action('Add prices','quote'),'plus'));
  const ticket = legs.length ? boardTicket(legs.map(q=>({book:q.book,title:pick(q),sub:`${q.displayEvent||q.event} · ${q.displayMarket||q.market} · Fair ${percent(q.probability)}`,price:oddsLabel(q.odds),action:button('Remove',`data-parlay-remove="${esc(q.id)}"`)}))) : toolEmpty('Your ticket starts here','Choose legs from one sportsbook and different events.','','picks');
  return `<div class="ev-parlay-summary"><div><strong>${selected.length} ${selected.length===1?'leg':'legs'}</strong><span>${valid ? `${result.payout.toFixed(2)} decimal · ${signed(result.ev)} EV` : 'Choose compatible legs'}</span></div><button type="button" data-parlay-ticket>Review ticket</button></div><div class="tool-two-column evt-builder" id="ev-parlay-browse">${options.length ? `<div class="tool-stack">${available}</div>` : toolPanel('Available legs','Prices with a complete comparison market.',available)}<div class="tool-stack" id="ev-parlay-ticket" tabindex="-1"><button type="button" data-parlay-browse>Back to available legs</button>${toolPanel('Your parlay',selected.length+' selected '+(selected.length===1?'leg':'legs'),ticket)}${toolReceipt('Combined decimal odds',valid?result.payout.toFixed(2):'—',[['Fair chance',valid?percent(result.probability):'—'],['Expected value',valid?signed(result.ev):'—']],valid?'Probabilities assume independent legs. Book pricing and parlay rules may change the actual offer.':invalidReason)}</div></div>`;
}

function renderSharp() {
  const threshold = Number(localStorage.getItem('sportslab-ev-sharp-min') || 1000);
  const cash = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value);
  const shortCash = value => Number(value) >= 1000 ? `$${(Number(value)/1000).toFixed(1)}k` : cash(value);
  const source = state.quotes;
  const filtered = source.filter(q => !sport || q.sport === sport);
  const matches = sharpMatches(filtered.filter(q => !q.depthOnly), threshold).filter(x => bookAvailable(x.sportsbook.book) && (!marketType || x.exchange.type === marketType) && (!bookmaker || [x.exchange.book,x.sportsbook.book].includes(bookmaker)) && (!search || [x.exchange.event,x.exchange.market,x.exchange.side,x.exchange.book,x.sportsbook.side,x.sportsbook.book,x.exchange.sport].some(value => filterText(value))) && suite.quoteVisible(x.exchange));
  const eventName = q => q.displayEvent || q.event;
  const sorters = { liquidity:(a,b) => b.liquidity - a.liquidity, event:(a,b) => eventName(a.exchange).localeCompare(eventName(b.exchange)) || b.liquidity - a.liquidity, odds:(a,b) => decimal(b.sportsbook.odds) - decimal(a.sportsbook.odds) || b.liquidity - a.liquidity };
  matches.sort(sorters[sharpSort] || sorters.liquidity);
  if (preserveLiveOrder) preserveReadingOrder(matches, [...document.querySelectorAll('.sm-item[data-wager-id]')].map(item=>item.dataset.wagerId), row=>row.exchange.id);
  const selectionText = q => `${q.type === 'prop' && q.player ? q.player + ' ' : ''}${q.side}${q.line !== '' && q.line != null ? ' ' + (q.type === 'spread' && Number(q.line) > 0 ? '+' : '') + q.line : ''}`;
  const marketName = q => q.displayMarket || (q.player ? String(q.market).replace(q.player,'').trim() : q.market);
  const maxLiquidity = Math.max(1,...matches.map(x => x.liquidity));
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>'}[name]}</svg>`;
  const titleCase = text => String(text || '').replace(/(^|\s)([a-z])/g, (_, space, char) => space + char.toUpperCase());
  const families = {NFL:'Football',NCAAF:'Football',NBA:'Basketball',WNBA:'Basketball',NCAAB:'Basketball',MLB:'Baseball',NHL:'Hockey'};
  const meta = q => `${startLabel(q)} · ${families[q.sport] ? families[q.sport] + ' | ' : ''}${q.sport}`;
  const pill = (odds, cls = '') => `<b class="sm-pill${cls}">${esc(oddsLabel(odds))}</b>`;
  const sortControl = `<div class="sm-sort" role="group" aria-label="Sort opportunities"><span>Sort</span>${[['liquidity','Liquidity'],['event','Event'],['odds','Odds']].map(([key,label]) => `<button type="button" data-sharp-sort="${key}" aria-pressed="${sharpSort === key}">${label}</button>`).join('')}</div>`;
  const selected = matches.find(x => x.exchange.id === expandedSharpKey) || matches[0];
  // Detail panel: exchange depth ladder above a book-by-book table for both sides of the selected market.
  const panel = (x, order) => {
    const q = x.exchange, offer = x.sportsbook, market = marketName(q);
    const peers = groups(source).find(group => group.some(item => item.id === q.id)) || [];
    const depthRows = peers.filter(item => item.exchange && item.side === q.side && Number(item.liquidity) > 0).sort((a,b) => Number(b.liquidity) - Number(a.liquidity)).slice(0,6).sort((a,b) => decimal(b.odds) - decimal(a.odds) || Number(b.liquidity) - Number(a.liquidity));
    const maxDepth = Math.max(1,...depthRows.map(item => Number(item.liquidity)));
    const latest = (book, side) => peers.filter(item => !item.exchange && item.book === book && item.side === side).sort((a,b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    const offerPrice = book => latest(book, offer.side) ? decimal(latest(book, offer.side).odds) : 0;
    const books = [...new Set(peers.filter(item => !item.exchange && bookAvailable(item.book)).map(item => item.book))].sort((a,b) => offerPrice(b) - offerPrice(a));
    // Side A is the sportsbook bet, side B the liquid exchange side; each carries its exchange price for the Exchange row.
    const sides = [[offer, x.opposite], [q, q]].map(([label, exchangePrice]) => {
      const prices = books.map(book => latest(book, label.side)), priced = prices.filter(Boolean);
      const best = [...priced].sort((a,b) => decimal(b.odds) - decimal(a.odds))[0];
      const average = priced.length ? probabilityToAmerican(priced.reduce((sum, item) => sum + implied(item.odds), 0) / priced.length) : NaN;
      return {label, prices, best, average, exchangePrice};
    });
    const price = (item, side) => item ? `<td class="${decimal(item.odds) >= decimal(side.best.odds) ? 'is-best' : ''}${item.id === offer.id ? ' is-offer' : ''}">${esc(oddsLabel(item.odds))}</td>` : '<td class="is-empty">—</td>';
    const bookRows = books.map((book, index) => `<tr class="${book === offer.book ? 'is-offer-book' : ''}"><th scope="row"><span class="sm-book">${bookLogo(book, 20)}<span>${esc(book)}</span></span></th>${sides.map(side => price(side.prices[index], side)).join('')}</tr>`).join('');
    const table = books.length ? `<div class="sm-books" role="region" aria-label="Sportsbook prices for both sides" tabindex="0"><table class="sm-books-table"><thead><tr><th scope="col">Selection</th>${sides.map(side => `<th scope="col">${esc(selectionText(side.label))}</th>`).join('')}</tr></thead><tbody>
      <tr class="sm-agg"><th scope="row">Average</th>${sides.map(side => `<td>${Number.isFinite(side.average) ? esc(oddsLabel(side.average)) : '—'}</td>`).join('')}</tr>
      <tr class="sm-agg"><th scope="row">Best</th>${sides.map(side => side.best ? `<td class="is-best"><span class="sm-cell-book">${bookLogo(side.best.book, 16)}${esc(oddsLabel(side.best.odds))}</span></td>` : '<td class="is-empty">—</td>').join('')}</tr>
      <tr class="sm-agg sm-exchange-row"><th scope="row">Exchange</th>${sides.map(side => side.exchangePrice ? `<td>${esc(oddsLabel(side.exchangePrice.odds))}${Number(side.exchangePrice.liquidity) > 0 ? `<small class="sm-chip">${shortCash(side.exchangePrice.liquidity)}</small>` : ''}</td>` : '<td class="is-empty">—</td>').join('')}</tr>
      ${bookRows}</tbody></table></div>` : '<p class="sm-empty-note">No opposing sportsbook prices entered.</p>';
    const depth = `<section class="sm-depth" aria-label="Exchange market depth"><header><strong>Exchange depth</strong><span>${esc(selectionText(q))}</span></header>${depthRows.length ? `<div class="sm-ladder" role="img" aria-label="Exchange depth for ${esc(selectionText(q))}. ${depthRows.map(item => `${esc(item.book)} ${oddsLabel(item.odds)}, ${cash(item.liquidity)} available`).join('; ')}">${depthRows.map(item => `<div class="sm-depth-row${item.id === q.id ? ' is-leading' : ''}"><span class="sm-depth-odds">${esc(oddsLabel(item.odds))}</span><span class="sm-depth-track"><i style="width:${Math.max(4,Math.round(Number(item.liquidity)/maxDepth*100))}%"></i><b>${cash(item.liquidity)}</b></span><span class="sm-depth-source" title="${esc(item.book)}">${bookLogo(item.book, 18)}</span></div>`).join('')}</div>` : '<p class="sm-empty-note">No exchange depth entered.</p>'}<footer>${depthRows.length} price ${depthRows.length === 1 ? 'level' : 'levels'} · Observed ${age(q.ts)}</footer></section>`;
    return `<aside class="sm-panel" id="sm-panel" style="--o:${order}" aria-label="Selected opportunity: ${esc(selectionText(offer))} at ${esc(offer.book)}">
      <header class="sm-panel-head"><div class="sm-panel-liquidity"><strong>${shortCash(x.liquidity)}</strong><span>Opp. Liquidity${q.limit ? ` · ${cash(q.limit)} limit` : ''}</span></div><button type="button" class="sm-trend" data-line-history="${esc(offer.id)}" aria-haspopup="dialog" aria-label="Line history for ${esc(selectionText(offer))} at ${esc(offer.book)}" title="Line history">${boardIcon('history', 18)}</button></header>
      <div class="sm-panel-event"><strong>${esc(eventName(q))}</strong><span>${esc(titleCase(market))} · ${esc(meta(q))}</span></div>
      <div class="sm-bet"><span class="sm-logo">${bookLogo(offer.book, 32)}</span><span class="sm-bet-copy"><strong>${esc(selectionText(offer))}</strong><small>${esc(offer.book)}${x.opposite ? ` · Exchange ${esc(oddsLabel(x.opposite.odds))}` : ''}</small></span>${pill(offer.odds)}<button type="button" class="sm-bet-link" data-suite-action="link" data-id="${esc(offer.id)}" aria-label="Open ${esc(offer.book)} bet link">Bet${boardIcon('link', 14)}</button></div>
      ${depth}
      ${table}
      <footer class="sm-panel-actions">
        <button type="button" class="sm-primary" data-suite-action="track" data-id="${esc(offer.id)}" data-tool="sharp">${boardIcon('track', 15)}Track bet</button>
        <button type="button" data-sharp-analysis="${esc(offer.id)}" data-sharp-row-id="${esc(q.id)}">${boardIcon('expand', 15)}Full analysis</button>
        <button type="button" data-suite-action="hide" data-id="${esc(q.id)}" aria-label="Hide ${esc(eventName(q))}, ${esc(market)}">${boardIcon('hide', 15)}Hide</button>
      </footer>
    </aside>`;
  };
  // List item: one option per opportunity; its actions live in the detail panel.
  const item = (x, index) => {
    const q = x.exchange, offer = x.sportsbook, on = x === selected;
    return `<button type="button" role="option" class="sm-item${on ? ' is-selected' : ''}" id="sm-item-${esc(q.id)}" data-sharp-select="${esc(q.id)}" data-wager-id="${esc(q.id)}" aria-selected="${on}" aria-controls="sm-panel" tabindex="${on ? 0 : -1}" style="--o:${index * 2}">
      <span class="sm-item-liquidity"><strong>${cash(x.liquidity)}</strong><small>${q.limit ? `${cash(q.limit)} limit` : 'Opp. liquidity'}</small></span>
      <span class="sm-item-market"><strong>${esc(titleCase(marketName(q)))}${q.live ? '<small class="sm-live">Live</small>' : ''}</strong><span>${esc(eventName(q))}</span><small>${esc(meta(q))}</small></span>
      <span class="sm-item-sides">
        <span class="sm-side is-bet"><span class="sm-logo" title="${esc(offer.book)}">${bookLogo(offer.book, 22)}</span><span class="sm-side-name">${esc(selectionText(offer))}</span><span class="sm-side-price">${pill(offer.odds)}${x.opposite ? `<small>Compared ${esc(oddsLabel(x.opposite.odds))}</small>` : ''}</span></span>
        <span class="sm-side"><span class="sm-logo" title="${esc(q.book)}">${bookLogo(q.book, 22)}</span><span class="sm-side-name">${esc(selectionText(q))}</span><span class="sm-side-price">${pill(q.odds, ' is-exchange')}<small class="sm-chip">${shortCash(q.liquidity)}</small></span></span>
      </span>
    </button>`;
  };
  const total = matches.reduce((sum, x) => sum + x.liquidity, 0);
  const summary = `<div class="evb-summary"><p><strong>${matches.length} ${matches.length === 1 ? 'opportunity' : 'opportunities'}</strong> ranked by ${{event:'event',odds:'sportsbook odds'}[sharpSort] || 'opposing liquidity'} · ${hasApiSnapshot() ? 'Feed prices' : 'Saved prices'}</p>${matches.length ? `<dl><div><dt>Top liquidity</dt><dd class="is-positive">${cash(maxLiquidity)}</dd></div><div><dt>Total</dt><dd>${shortCash(total)}</dd></div><div><dt>Books</dt><dd>${new Set(matches.map(x => x.sportsbook.book)).size}</dd></div></dl>` : ''}</div>`;
  const split = matches.length ? `<div class="sm-split"><div class="sm-list" role="listbox" aria-label="Smart Money opportunities" aria-orientation="vertical">${matches.map(item).join('')}</div>${panel(selected, matches.indexOf(selected) * 2 + 1)}</div>` : '';
  return `<div class="sharp-workspace evb-board"><div class="sharp-page-bar"><div class="sharp-page-title"><h1>Smart Money</h1><span class="sharp-data-badge">${hasApiSnapshot() ? 'Feed prices' : 'Saved prices'}</span></div><div class="sharp-toolbar"><label class="sharp-search">${icon('search')}<input id="sharp-search" type="search" placeholder="Search markets" aria-label="Search Smart Money markets" value="${esc(search)}" autocomplete="off"></label><button type="button" data-sharp-filters aria-expanded="${sharpFiltersOpen}">${icon('filter')}<span>Filters</span></button><button type="button" data-sharp-refresh title="Refresh comparison" aria-label="Refresh comparison">${icon('refresh')}</button></div></div>
    <div class="sharp-filter-tray" ${sharpFiltersOpen ? '' : 'hidden'}><label>League<select id="sharp-sport"><option value="">All leagues</option>${feedSports().map(value => `<option value="${value}" ${sport === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Market<select id="sharp-market"><option value="">All markets</option>${[['moneyline','Moneyline'],['spread','Spreads'],['total','Totals'],['prop','Player props'],['alternate','Alternates'],['future','Futures']].map(([value,label]) => `<option value="${value}" ${marketType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="sharp-min-field"><span class="sharp-filter-label">Min liquidity</span><span class="sharp-currency">$</span><input id="sharp-min" type="number" min="0" step="100" value="${threshold}"></label><button type="button" data-sharp-clear>Clear filters</button></div>
    <div class="evb-results-bar">${summary}${matches.length > 1 ? sortControl : ''}</div>
    ${matches.length ? split : (source.length && !source.some(q => q.exchange && Number(q.liquidity) > 0) ? `<div class="sharp-list-empty"><strong>No exchange liquidity in the feed</strong><p>Smart Money ranks prices by the money available at betting exchanges. The quote feed doesn't include exchange liquidity yet, so there is nothing to rank.</p></div>` : source.length ? `<div class="sharp-list-empty"><strong>No matching opportunities</strong><p>Try another league, market, or liquidity filter.</p><button type="button" data-sharp-clear>Clear filters</button></div>` : `<div class="sharp-list-empty"><strong>No exchange prices yet</strong><p>Smart Money compares exchange liquidity with sportsbook prices. Opportunities appear once the odds feed syncs.</p></div>`)}
    <p class="sharp-method-note">Liquidity is the amount available at an exchange price; it does not verify betting activity. Select an opportunity to compare exchange depth and every sportsbook.</p></div>`;
}

// Select one Smart Money opportunity. The chosen item stays fixed on screen while the detail panel
// updates; on phones the panel sits below the item, so it is brought into view when it would start off screen.
function selectSharpItem(id, focus = false) {
  const itemOf = () => $('#ev-view').querySelector(`.sm-item[data-sharp-select="${CSS.escape(id)}"]`);
  const before = itemOf()?.getBoundingClientRect().top;
  expandedSharpKey = id;
  inlineDetail = null;
  render();
  const item = itemOf(), after = item?.getBoundingClientRect().top;
  if (!item) return;
  if (Number.isFinite(before) && Number.isFinite(after) && after !== before) window.scrollBy({top:after - before, behavior:'instant'});
  if (focus) item.focus({preventScroll:true});
  if (focus === 'keyboard') item.scrollIntoView({block:'nearest'});
  else if (matchMedia('(max-width: 899px)').matches && $('#sm-panel')?.getBoundingClientRect().top > innerHeight - 160) item.scrollIntoView({block:'start', behavior:'smooth'});
}
// Arrow keys, Home and End move the Smart Money selection.
function sharpKeydown(event) {
  const current = event.target.closest?.('.sm-item[data-sharp-select]');
  if (!current || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...$('#ev-view').querySelectorAll('.sm-item[data-sharp-select]')], index = items.indexOf(current);
  const next = items[{Home:0, End:items.length - 1}[event.key] ?? Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
  if (next && next !== current) selectSharpItem(next.dataset.sharpSelect, 'keyboard');
}


function renderFantasy() {
  return dfsWorkspace.render({initialSport:initialSport === 'ALL' ? '' : initialSport === 'SOCCER' ? 'Soccer' : initialSport || ''});
}

function renderOptimizer() {
  // Legs qualify when their fair probability beats the app's 2-pick break-even (edge > 0); the best
  // 40 per app by edge are paired and the pairs ranked by slip EV. Picks without a fair probability
  // (no two-sided sportsbook market yet) can't qualify.
  const tables = paytables(), combos = [], edges = new Map();
  const breakEvens = new Map(Object.entries(tables).map(([app, sizes]) => [app, breakEven(sizes?.['2'])]));
  const byApp = new Map();
  for (const x of dfs()) {
    if (isContestPlatform(x.app) || x.probability == null || !Number.isFinite(Number(x.probability))) continue;
    const edge = Number(x.probability) - breakEvens.get(x.app);
    if (!(edge > 0)) continue;
    edges.set(x.id, edge);
    if (!byApp.has(x.app)) byApp.set(x.app, []);
    byApp.get(x.app).push(x);
  }
  const rows = [...byApp.values()].flatMap(list => list.sort((a,b)=>edges.get(b.id)-edges.get(a.id)).slice(0,40));
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
    if(rows[i].app!==rows[j].app||rows[i].player===rows[j].player)continue;
    const rules=tables[rows[i].app]?.['2'];
    if(!Array.isArray(rules)||rules.length!==3)continue;
    const result=fantasySlip([rows[i],rows[j]],rules);
    if(result)combos.push({a:rows[i],b:rows[j],...result});
  }
  combos.sort((a,b)=>b.ev-a.ev);
  const leg = x => `${x.player} ${x.side} ${String(x.line??'—')} ${x.market} · ${percent(x.probability)}`;
  const ranking=combos.length?toolBoard({layout:'cards',variant:'optimizer',
    label:'Ranked two-pick combinations',
    summary:{text:`<strong>${combos.length} eligible ${combos.length===1?'combination':'combinations'}</strong> ranked by projected EV`,pills:[['Best projected EV',signed(combos[0].ev),combos[0].ev>0],['Platforms',String(new Set(rows.map(x=>x.app)).size)]]},
    columns:{metric:'Proj. EV',event:'Events',market:'Market',bet:'Picks & app',odds:'Payout',prob:'Both hit'},
    rows:combos.map(x=>({
      id:'optimizer-'+x.a.id+'-'+x.b.id,
      metric:{value:signed(x.ev),bar:Math.max(0,x.ev),negative:x.ev<0,tier:x.ev>=.1?'high':x.ev>=.04?'mid':'low'},
      event:{time:x.a.startLabel||'',title:x.a.event||'Event not entered',note:x.b.event&&x.b.event!==x.a.event?x.b.event:'',sport:[...new Set([x.a.sport,x.b.sport].filter(Boolean))].join(' / ')},
      market:'2-pick entry',
      bet:{book:x.a.app,title:x.a.player+' + '+x.b.player,lines:[leg(x.a),leg(x.b),x.a.app]},
      picks:[x.a,x.b].map(p=>({player:p.player,side:p.side,line:p.line,market:p.market,chance:percent(p.probability)})),
      odds:{value:Number(tables[x.a.app]['2'][2])+'×',sub:'Full-hit payout'},
      prob:{value:percent(x.dist[2]),sub:'Estimated'},
      actions:boardButton('Build slip',`data-optimize="${esc(x.a.id)},${esc(x.b.id)}" aria-label="Build a slip with ${esc(x.a.player)} and ${esc(x.b.player)}"`)
    }))
  }):toolPanel('Ranked combinations','Your strongest estimated edge first. Open a combination to build the slip.',toolEmpty(state.dfs.length?'Find your first combination':'No DFS lines in the quote feed yet',state.dfs.length?'Combinations need two picks from the same app with a hit chance.':'Combinations appear when the quote feed sends PrizePicks, Underdog or other pick\'em lines. You can also add a prop by hand.',action('Add DFS prop','dfs')+button('Set payout rules','data-tool="slip"'),'settings'));
  return `<div class="tool-stack">${ranking}${toolNote('Hit chances come from no-vig sportsbook odds at the same line (or your own entries). Payouts are each app\'s published standard payouts unless you saved your own; confirm them in the app. Picks are treated as independent; platform limits, fees and contest standings are not modeled.')}</div>`;
}

function renderSlip() {
  const apps=[...new Set(state.dfs.filter(x=>!isContestPlatform(x.app)).map(x=>x.app))];
  if(!fantasyApp||!apps.includes(fantasyApp))fantasyApp=apps[0]||'';
  const options=dfs().filter(x=>x.app===fantasyApp);
  const available=state.dfs.filter(x=>x.app===fantasyApp);
  fantasyIds=fantasyIds.filter(id=>available.some(x=>x.id===id));
  const selected=fantasyIds.map(id=>available.find(x=>x.id===id)).filter(Boolean);
  const rules=paytables()[fantasyApp]?.[String(selected.length)]||[];
  const rulesSource=paytableSource(state.paytables,fantasyApp,selected.length,apiPaytables);
  const result=selected.length>=2&&rules.length===selected.length+1?fantasySlip(selected,rules,Number(fantasyStake)):null;
  const controls=`<div class="tool-form-grid"><label>Fantasy app<select id="ev-fantasy-app">${apps.length?apps.map(app=>`<option value="${esc(app)}" ${app===fantasyApp?'selected':''}>${esc(app)}</option>`).join(''):'<option value="">Add a prop to choose a platform</option>'}</select></label><label>Entry amount ($)<input id="ev-fantasy-stake" type="number" min="0.01" step="0.01" value="${esc(fantasyStake)}"></label></div>`;
  const choices=options.length?toolBoard({layout:'cards',variant:'slip',
    label:`Available ${fantasyApp} picks`,compact:true,
    summary:{text:`<strong>${options.length} ${options.length===1?'pick':'picks'}</strong> on ${esc(fantasyApp)}`,pills:[['In slip',String(selected.length)]]},
    columns:{metric:'Hit rate',event:'Event',market:'Market',bet:'Pick & app',odds:'Line'},
    // One card per player line: its Over and Under picks become the two side buttons.
    rows:options.reduce((groups,x)=>{
      const key=[x.player,x.market,x.line,x.event].join('|'),group=groups.find(g=>g.key===key&&!g.picks.some(p=>p.side===x.side));
      if(group)group.picks.push(x);else groups.push({key,picks:[x]});
      return groups;
    },[]).map(({picks})=>{
      picks.sort((a,b)=>String(a.side).toLowerCase()==='over'?-1:String(b.side).toLowerCase()==='over'?1:0);
      const x=picks.find(p=>fantasyIds.includes(p.id))||picks[0], label=`${x.player} ${x.side} ${String(x.line??'—')}`;
      return {id:'slip-'+picks[0].id,attrs:`data-open-dfs="${esc(x.id)}"`,selected:picks.some(p=>fantasyIds.includes(p.id)),
        slip:{player:x.player,team:x.team||'',sport:x.sport||'',market:x.market||'',line:String(x.line??'—'),event:x.event||'',time:x.startLabel||'',
          sides:picks.map(p=>{const inSlip=fantasyIds.includes(p.id),name=`${p.player} ${p.side} ${String(p.line??'—')}`;
            return {side:p.side,value:percent(p.probability),rate:Number(p.probability),attrs:`data-fantasy="${esc(p.id)}" aria-pressed="${inSlip}" aria-label="${inSlip?'Remove':'Add'} ${esc(name)}"`};})},
        bet:{book:x.app,title:label},
        actions:(x.source==='local-api'?'<span class="evc-slip-note">Hit chance from sportsbook odds</span>':'<span class="evc-slip-note">Estimated hit rates</span>'+boardIconButton('edit',`Edit ${label}`,`data-edit="dfs" data-id="${esc(x.id)}"`))+boardToggle(`Compare ${label}`,`data-open-dfs="${esc(x.id)}"`)};
    })
  }):available.length?toolEmpty('No picks match your filters','Try a different sport or search. Your selected picks stay in the ticket.',button('Clear filters','data-tool-clear'),'search'):dfsLoading&&!dfsLoaded?toolEmpty('Loading DFS lines…','Reading PrizePicks, Underdog and other pick\'em lines from the quote feed.','','picks'):toolEmpty('No DFS lines in the quote feed yet','Picks appear when the quote feed sends PrizePicks, Underdog or other pick\'em lines. You can also add a prop by hand.',action('Add DFS prop','dfs'),'picks');
  const picked=selected.length?boardTicket(selected.map(x=>({book:x.app,title:x.player,sub:`${x.side} ${String(x.line??'—')} ${x.market} · ${percent(x.probability)}`,action:button('Remove',`data-fantasy="${esc(x.id)}"`)}))):toolEmpty('Choose your picks','Select at least two picks from the same app.','','picks');
  const payout=selected.length>=2?toolPanel('Payout rules',rulesSource==='api'?`${esc(fantasyApp)}'s ${selected.length}-pick payout comes from the quote feed. Confirm it in the app: promotions, your state and special picks can change it. Edit and save to use your own.`:rulesSource==='standard'?`${esc(fantasyApp)}'s published standard payout for a ${selected.length}-pick entry is filled in. Confirm it in the app: promotions, your state and special picks can change it. Edit and save to use your own.`:'Total return multiplier for each number of correct picks, including the returned stake.',`<div class="tool-form-grid">${Array.from({length:selected.length+1},(_,hits)=>`<label>${hits} of ${selected.length} hits<input data-pay-hits="${hits}" type="number" min="0" step="0.01" value="${Number(rules[hits]||0)}"></label>`).join('')}</div><div class="ev-card-footer">${button('Save payout rules','id="ev-save-paytable"')}</div>${result?`<div class="ev-chip-row">${result.dist.map((p,i)=>`<span class="ev-chip">${i} hits · ${percent(p)} · ${Number(rules[i]||0)}×</span>`).join('')}</div>`:''}`):'';
  return `<div class="tool-stack"><div class="tool-two-column evt-builder"><div class="tool-stack">${toolPanel('Build your entry','Use the payout rules for your chosen platform.',controls)}${options.length?choices:toolPanel('Available picks','Compare your entered player lines and estimates.',choices)}${payout}</div><div class="tool-stack">${toolPanel('Your picks',selected.length+' selected',picked)}${toolReceipt('Expected return',result?money(result.payout*fantasyStake):'—',[['Entry amount',money(fantasyStake)],['Expected profit',result?money(result.expectedProfit):'—'],['Expected value',result?signed(result.ev):'—']],selected.length<2?'Select at least two picks to start the calculation.':result?'Calculated from the saved rules and your estimated hit rates.':'Save the payout rules for this entry size to calculate a return.')}</div></div>${toolNote('Picks are treated as independent. Pushes, ties, correlations, and platform settlement exceptions require adjustments to the payout rules.')}</div>`;
}

function renderFantasyAlerts() {
  const rules=state.alerts.filter(x=>x.kind==='fantasy-new'&&visible(x,['market','event']));
  const notes=state.notifications.filter(x=>rules.some(r=>r.id===x.ruleId));
  const watches=rules.length?`<div class="ev-list">${rules.map(r=>`<div class="ev-list-item"><div><strong>${esc(r.market||'Any market')}</strong><span>${esc(r.sport||'All sports')} · Minimum hit rate ${Number(r.threshold)||0}%</span><span class="tool-rule-status ${r.enabled===false?'is-paused':''}">${r.enabled===false?'Paused':'Watching'}</span></div><div>${button('Edit',`data-edit="alert" data-id="${esc(r.id)}"`)}${button(r.enabled===false?'Resume':'Pause',`data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>`:toolEmpty('Watch the props you care about','Choose a market and a minimum estimated hit rate. New matching entries will appear in your activity.',action('Create a fantasy alert','alert','data-kind="fantasy-new"'),'bookmark');
  return `<div class="tool-stack">${browserAlertsControl()}${emailAlertsControl()}${toolStats([['Active watches',rules.filter(x=>x.enabled!==false).length],['Paused',rules.filter(x=>x.enabled===false).length],['Unread matches',notes.filter(x=>!x.read).length]])}<div class="tool-two-column">${toolPanel('Your watchlist','Rules apply when new player props enter this workspace.',watches)}${toolPanel('Recent activity','Matches from your saved fantasy alerts.',notes.length?renderNotifications(notes):toolEmpty('You’re all caught up','New matching props will appear here as you add or import data.','','live'))}</div>${toolNote('These are local workspace alerts. They do not fetch player props or send push notifications while the page is closed.')}</div>`;
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
  const controls=`<div class="tool-board-toolbar"><h2>Markets you follow</h2><div><label>Platform<select id="ev-prediction-platform"><option value="">All prediction platforms</option>${[...new Set([...PREDICTION_PLATFORMS,...state.contracts.map(c=>canonicalPlatform(c.platform))])].map(name=>`<option value="${esc(name)}" ${predictionPlatform===name?'selected':''}>${esc(name)}</option>`).join('')}</select></label></div></div>`;
  const cards=contracts.length?toolBoard({layout:'cards',variant:'prediction',
    label:'Prediction market contracts',
    summary:{text:`<strong>${contracts.length} ${contracts.length===1?'contract':'contracts'}</strong> · prices in cents per $1 settlement`,pills:[['Positions',String(positions.length)],['Recorded trades',String(trades.length)]]},
    columns:{metric:'Spread',event:'Contract',market:'Market',bet:'Platform',odds:'Yes ask',prob:'Yes bid',stake:'Depth'},
    rows:contracts.map(c=>{
      const spread=Number(c.ask)-Number(c.bid);
      return {id:'contract-'+c.id,
        metric:{value:spread.toFixed(0)+'¢',label:'Bid–ask',tier:spread<=2?'high':spread<=5?'mid':'low'},
        event:{time:'Observed '+age(c.ts),title:c.event,sport:c.sport},market:'Yes contract',
        bet:{book:c.platform,title:c.platform,html:origin(c)},
        odds:{value:Number(c.ask).toFixed(0)+'¢',sub:`No ${(100-Number(c.bid)).toFixed(0)}¢`},
        prob:{value:Number(c.bid).toFixed(0)+'¢',sub:'Best bid'},
        stake:{value:Number(c.volume).toLocaleString(),sub:'Contracts'},
        actions:boardButton('Update',`data-edit="contract" data-id="${esc(c.id)}" aria-label="Update ${esc(c.event)}"`,'edit')};
    })
  }):toolPanel('Market board','Bids and asks in cents per $1 settlement.',toolEmpty('Start following a market','Add a contract’s bid, ask, and available depth to start recording its price history.',action('Add contract','contract'),'research'));
  const positionTable=positions.length?table(['Contract','Side','Quantity','Entry','Mark / unrealized P&L',''],positions.map(p=>{const c=state.contracts.find(x=>x.id===p.contractId);const mark=c?p.side==='No'?100-Number(c.ask):Number(c.bid):NaN;const profit=Number.isFinite(mark)?(mark-Number(p.entry))*Number(p.quantity)/100:NaN;return `<tr><td><strong>${esc(c?.event||'Contract missing')}</strong></td><td>${esc(p.side)}</td><td data-num>${Number(p.quantity)}</td><td data-num>${Number(p.entry)}¢</td><td data-num class="${profit>=0?'ev-positive':'ev-negative'}">${Number.isFinite(mark)?mark+'¢':'—'}<small>${money(profit)}</small></td><td>${button('Edit',`data-edit="trader" data-id="${esc(p.id)}"`)}</td></tr>`;})):toolEmpty('No positions recorded','Add a position for a saved contract to compare its entry price with the current mark.',action('Add position','trader'),'picks');
  const historyTable=snapshots.length?table(['Observed','Contract','Bid','Ask','Depth'],snapshots.map(h=>`<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c=>c.id===h.contractId)?.event||'Contract missing')}</td><td data-num>${Number(h.bid)}¢</td><td data-num>${Number(h.ask)}¢</td><td data-num>${Number(h.volume).toLocaleString()}</td></tr>`)):toolEmpty('Price history starts with an update','Each contract edit saves its bid, ask, and depth.','','trends');
  const tradeTable=trades.length?table(['Time','Contract','Side','Quantity','Price',''],trades.map(t=>`<tr><td>${new Date(t.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c=>c.id===t.contractId)?.event||'Contract missing')}</td><td>${esc(t.side)}</td><td data-num>${Number(t.quantity)}</td><td data-num>${Number(t.price)}¢</td><td>${button('Edit',`data-edit="trade" data-id="${esc(t.id)}"`)}</td></tr>`)):toolEmpty('Keep a record of your trades','Record buys and sells against the contracts in your workspace.',action('Add trade','trade'),'paper');
  return `<div class="tool-stack">${controls}${cards}${toolPanel('Positions','Marks use the executable bid for Yes and 100 − ask for No.',positionTable,{actions:`<label>Trader<select id="ev-trader-filter">${names.length?names.map(name=>`<option value="${esc(name)}" ${name===traderName?'selected':''}>${esc(name)}</option>`).join(''):'<option>No traders yet</option>'}</select></label>${action('Add position','trader')}`})}${toolPanel('Order book history','The latest 100 snapshots for the selected contracts.',historyTable)}${toolPanel('Trade history','Your saved buys and sells.',tradeTable,{actions:action('Add trade','trade')})}${toolNote('Prices and trades are recorded manually. Position marks exclude fees and partial fills; no trades are placed through this workspace.')}</div>`;
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
  return `<div class="ev-stack">${toolStats([['Player profiles',profiles.length],['Results recorded',rows.length],['Paired games',paired.length]])}${profiles.length ? toolPanel('Recent hit rates','Share of recorded games that finished over the listed line.',table(['Player / prop', 'Last 5', 'Last 10', 'All recorded', 'Results'], profiles.map(key => { const [player,market,line] = key.split('|'); const games = rows.filter(x => `${x.player}|${x.market}|${x.line}` === key).sort((a,b) => b.date.localeCompare(a.date)); const rate = n => percent(games.slice(0,n).filter(x => Number(x.result) > Number(x.line)).length / Math.min(n,games.length)); return `<tr><td><strong>${esc(player)}</strong><small>${esc(market)} · Over ${esc(line)}</small></td><td data-num>${rate(5)}<small>${Math.min(5,games.length)} games</small></td><td data-num>${rate(10)}<small>${Math.min(10,games.length)} games</small></td><td data-num>${rate(games.length)}<small>${games.length} games</small></td><td><div class="ev-mini-bars" aria-label="Recent results">${games.slice(0,10).reverse().map(g => `<i title="${esc(g.game)}: ${esc(g.result)}" style="height:${Math.max(5, Math.min(100, Number(g.result)/Number(g.line)*65))}%"></i>`).join('')}</div></td></tr>`; }))) : toolEmpty('Build a picture of recent form','Add game results to compare recent hit rates and player-prop correlations.',action('Add result','result'),'trends')}${toolPanel('Paired-game correlation','Compare two props recorded against the same game IDs.',`<div class="ev-fields"><label>First prop<select id="ev-trend-a">${options.map(x => `<option value="${esc(x)}" ${x === trendA ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><label>Second prop<select id="ev-trend-b">${options.map(x => `<option value="${esc(x)}" ${x === trendB ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><div class="ev-result">${Number.isFinite(correlation) ? `Pearson r <strong>${correlation.toFixed(2)}</strong> across ${paired.length} matching game IDs` : `Need at least three matching game IDs with variation in both results. Currently ${paired.length}.`}</div></div>`)}<p class="ev-caption">Recent hit rates describe entered historical games. They do not estimate a future hit probability; correlation is descriptive and needs aligned game IDs.</p></div>`;
}

function renderLineAlerts() {
  const all = state.history.filter(h => (!sport || !h.sport || h.sport === sport) && (!search || ['event','market','book','side'].some(k => filterText(h[k])))).sort((a,b) => b.ts.localeCompare(a.ts));
  const rules = state.alerts.filter(x => x.kind !== 'fantasy-new' && visible(x,['event','market']));
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack">${browserAlertsControl()}${emailAlertsControl()}${toolStats([['Active watches',rules.filter(x=>x.enabled!==false).length],['Unread alerts',notes.filter(x=>!x.read).length],['Price snapshots',all.length]])}<div class="tool-two-column">${toolPanel('Price and EV watches','Alerts fire in this browser when a newly saved or imported record meets a threshold. They do not poll sportsbooks.',rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${r.kind === 'ev' ? 'EV at least ' + r.threshold + '%' : r.kind === 'movement' ? 'Line change at least ' + r.threshold : 'American price at least ' + oddsLabel(r.threshold)}</strong><span> ${esc(r.sport || 'All sports')} · ${esc(r.event || 'Any event')} · ${esc(r.market || 'Any market')} · ${r.liveOnly ? 'Live only' : 'All'} · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : toolEmpty('Choose your price target','Set a price, EV threshold, or line movement to watch.',action('Create alert','alert'),'live'),{actions:action('New alert','alert')})}${toolPanel('Alert activity','Matches from your saved rules.',notes.length?renderNotifications(notes):toolEmpty('You’re all caught up','Matching price updates will appear here.','','live'))}</div>${toolPanel('Recorded line movement','The latest 200 price snapshots, newest first.',all.length ? table(['Time', 'Market', 'Book', 'Side', 'Line', 'Price', 'Change'], all.slice(0,200).map(h => { const sequence = state.history.filter(x => x.quoteId === h.quoteId), index = sequence.findIndex(x => x.id === h.id), prior = sequence[index-1]; return `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(h.event)}<small>${esc(h.market)}</small></td><td>${esc(h.book)}</td><td>${esc(h.side)}</td><td data-num>${fmtLine(h.line)}</td><td data-num>${oddsLabel(h.odds)}</td><td>${prior ? `${oddsLabel(prior.odds)} → ${oddsLabel(h.odds)}${String(prior.line) !== String(h.line) ? ` · line ${fmtLine(prior.line)} → ${fmtLine(h.line)}` : ''}` : 'First entry'}</td></tr>`; })) : toolEmpty('Follow a line from its first price','Each new or edited price creates a timestamped snapshot.',action('Add price','quote'),'trends'))}</div>`;
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
  if (type === 'quote') return;
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
  if (editing.type === 'quote') return;
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
$('#ev-book-menu').addEventListener('input', event => { if (!event.target.matches('[data-book-search]')) return; const query=event.target.value.trim().toLowerCase(); bookSearch=query; $('#ev-book-menu').querySelectorAll('.ev-book-option').forEach(option=>{ option.hidden=!option.textContent.toLowerCase().includes(query); }); });
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
let bookLayoutFrame = 0, lastBookPickerWidth = -1;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width * 10) / 10;
  if (width === lastBookPickerWidth) return;
  lastBookPickerWidth = width;
  cancelAnimationFrame(bookLayoutFrame);
  bookLayoutFrame = requestAnimationFrame(layoutSelectedBooks);
}).observe($('.ev-book-picker'));
$('#ev-find').addEventListener('click', () => $('#ev-view').scrollIntoView({ behavior:'smooth', block:'start' }));
$('#ev-timing-toggle').addEventListener('click', () => {
  if (active !== 'ev-pre' && active !== 'ev-live') return;
  active = active === 'ev-live' ? 'ev-pre' : 'ev-live';
  detailQuoteId = '';
  bookMenuOpen = false;
  history.replaceState(history.state, '', location.pathname + location.search + '#' + active);
  render();
});
document.querySelector('[data-ev-focus-search]')?.addEventListener('click', () => { if (active === 'odds') { $('#os-search')?.focus(); return; } if (active === 'fantasy') { $('#dfs-search')?.focus(); return; } document.body.classList.toggle('ev-search-open'); $('#ev-search').focus(); });
$('#ev-search').addEventListener('keydown', event => { if (event.key === 'Escape') { document.body.classList.remove('ev-search-open'); document.querySelector('[data-ev-focus-search]')?.focus(); } });
$('#ev-odds-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-odds-tab]'); if (tab) { marketType = tab.dataset.oddsTab; render(); } });
$('#ev-reset-filters').addEventListener('click', () => { bookmaker = ''; selectedSportsbooks = null; bookMenuOpen = false; marketType = ''; search = ''; evLeague = ''; evDateRange = 'all'; evMaxOdds = '200'; toolFilters = { ...toolFilters, evMinOdds:'', minEv:'', minProb:'' }; saveToolFilters(toolFilters, window.localStorage); evSort = 'ev'; designSort = 'recommended'; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; if (sport !== '') { sport = ''; history.replaceState(history.state, '', location.pathname + '?sport=all' + location.hash); } render(); });
$('#ev-market-type').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-market').addEventListener('change', event => { marketType = event.target.value; render(); });
$('#ev-reference-league').addEventListener('change', event => { evLeague = event.target.value; render(); });
$('#ev-reference-date').addEventListener('change', event => { evDateRange = event.target.value; render(); });
$('#ev-reference-max-odds').addEventListener('change', event => { evMaxOdds = event.target.value; render(); });
$('.ev-reference-filters').addEventListener('change', event => {
  const key = event.target.dataset?.evThreshold;
  if (!key) return;
  toolFilters = { ...toolFilters, [key]: event.target.value }; saveToolFilters(toolFilters, window.localStorage); evVisibleCount = 40; render();
});
$('#ev-sort-mode').addEventListener('change', event => { if (['ev-pre','ev-live'].includes(active)) evSort = event.target.value; else designSort = event.target.value; render(); });
$('.ev-filter-panel').addEventListener('change', event => {
  const control = event.target.closest('[data-filter]');
  if (!control) return;
  const value = control.value;
  switch (control.dataset.filter) {
    case 'sport': sport = value; history.replaceState(history.state, '', location.pathname + '?sport=' + encodeURIComponent((sport || 'all').toLowerCase()) + location.hash); break;
    case 'platform': bookmaker = value; break;
    case 'league': designFilters.league = value; break;
    case 'market': marketType = value; break;
    case 'date': designFilters.date = value; break;
    case 'period':
      if (active === 'arb-pre' || active === 'arb-live') {
        active = value === 'live' ? 'arb-live' : 'arb-pre';
        designFilters.period = 'all';
        history.replaceState(history.state, '', location.pathname + location.search + '#' + active);
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
  history.replaceState(history.state, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
  render();
});
$('#ev-reference-sport').addEventListener('change', event => {
  sport = event.target.value;
  history.replaceState(history.state, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`);
  render();
});
$('#ev-search').addEventListener('input', event => { search = event.target.value.toLowerCase().trim(); evVisibleCount = 40; render(); });
$('#ev-add-quote').addEventListener('click', () => { if (active === 'fantasy') openForm('dfs'); });
$('#ev-sync-api').addEventListener('click', () => { void feedControls.refresh(); });
$('#ev-view-actions').addEventListener('click', event => { const target = event.target.closest('[data-add]'); if (target) openForm(target.dataset.add, null, { live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true', kind:target.dataset.kind || 'price' }); });
document.addEventListener('click', event => {
  document.querySelectorAll('.wager-more[open]').forEach(menu => {
    if (!menu.contains(event.target)) menu.open = false;
  });
});
$('#ev-view').addEventListener('keydown', event => {
  const menu = event.target.closest('.wager-more[open]');
  if (menu && event.key === 'Escape') {
    event.preventDefault();
    menu.open = false;
    menu.querySelector('summary')?.focus();
    return;
  }
  if (active === 'odds') oddsScreen.keydown(event);
  if (event.target.matches('.ev-arb-leg[data-open-quote]') && ['Enter',' '].includes(event.key)) {event.preventDefault();showBetComparison(event.target.dataset.openQuote);}
});
$('#ev-view').addEventListener('click', event => {
  const lineHistory = event.target.closest('button[data-line-history]');
  if (lineHistory) return openQuoteLineHistory(lineHistory.dataset.lineHistory, lineHistory);
  if (active === 'odds' && oddsScreen.click(event)) return;
  if (active === 'fantasy' && dfsWorkspace.click(event)) return;
  if (event.target.closest('[data-tool-filter-clear]')) {
    toolFilters = { ...toolFilters, ...Object.fromEntries((TOOL_FILTERS[active] || []).map(key => [key, TOOL_FILTER_DEFAULTS[key]])) };
    saveToolFilters(toolFilters, window.localStorage); render(); return;
  }
  const target = event.target.closest('button');
  if (!target) {
    const boardRow = event.target.closest('.evb-row[data-evb-row]');
    if (boardRow && !event.target.closest('a,input,select,summary')) return toggleEvBoardRow(boardRow.dataset.evbRow);
    const pairRow = event.target.closest('.evb-row[data-pair-row]');
    if (pairRow && !event.target.closest('a,input,select,summary')) return togglePairRow($('#ev-view'), pairRow.dataset.pairRow);
    const row = event.target.closest('[data-open-quote],[data-open-dfs],[data-open-tracked]');
    if (row && !event.target.closest('a,input,select,summary')) return showBetComparison(row.dataset.openQuote || row.dataset.openDfs || row.dataset.openTracked, row.dataset.openDfs ? 'dfs' : row.dataset.openTracked ? 'tracked' : 'quote');
    return;
  }
  const menu = target.closest('.wager-more');
  if (menu) menu.open = false;
  if (target.dataset.openDfs) return showBetComparison(target.dataset.openDfs,'dfs');
  if (target.dataset.openTracked) return showBetComparison(target.dataset.openTracked,'tracked');
  if (target.hasAttribute('data-parlay-ticket')) { $('#ev-parlay-ticket')?.scrollIntoView({block:'start',behavior:'instant'}); $('#ev-parlay-ticket')?.focus({preventScroll:true}); return; }
  if (target.hasAttribute('data-parlay-browse')) { $('#ev-parlay-browse')?.scrollIntoView({block:'start',behavior:'instant'}); return; }
  if (target.hasAttribute('data-parlay-more')) { const top = window.scrollY; parlayVisibleCount += 40; render(); window.scrollTo({top,behavior:'instant'}); return; }
  if (target.hasAttribute('data-pair-more')) { const top=window.scrollY;pairVisibleCount+=40;render();window.scrollTo({top,behavior:'instant'});return; }
  if (target.hasAttribute('data-ev-more')) { const top=window.scrollY;evVisibleCount+=40;render();window.scrollTo({top,behavior:'instant'});return; }
  if (target.dataset.sharpSelect && target.matches('.sm-item')) return selectSharpItem(target.dataset.sharpSelect, true);
  if (target.dataset.sharpSort) { sharpSort = target.dataset.sharpSort; return render(); }
  if (target.dataset.sharpAnalysis) { const actions = target.closest('.sm-panel-actions'); if (!actions) return; showBetComparison(target.dataset.sharpAnalysis, 'quote', {anchor:actions}); return actions.nextElementSibling?.matches('.bet-inline-mount') && actions.nextElementSibling.scrollIntoView({block:'nearest'}); }
  if (target.hasAttribute('data-sharp-filters')) { sharpFiltersOpen = !sharpFiltersOpen; return render(); }
  if (target.hasAttribute('data-sharp-refresh')) { render(); $('#ev-notice').textContent = state.quotes.length ? 'Comparison refreshed from the latest prices.' : 'No prices yet. They appear once the quote feed updates.'; return; }
  if (target.hasAttribute('data-sharp-clear')) { search = ''; marketType = ''; bookmaker = ''; sport = ''; history.replaceState(history.state, '', `${location.pathname}?sport=all${location.hash}`); localStorage.setItem('sportslab-ev-sharp-min','0'); return render(); }
  if (target.dataset.sort) { evSort = target.dataset.sort; return render(); }
  if (target.dataset.evbToggle) return toggleEvBoardRow(target.dataset.evbToggle);
  if (target.dataset.evbRefresh) { toggleEvBoardRow(target.dataset.evbRefresh); toggleEvBoardRow(target.dataset.evbRefresh); return $('#ev-view').querySelector(`[data-evb-refresh="${CSS.escape(target.dataset.evbRefresh)}"]`)?.focus({preventScroll:true}); }
  if (target.dataset.pairToggle) return togglePairRow($('#ev-view'), target.dataset.pairToggle);
  if (target.dataset.pairSwap) return swapPairRow($('#ev-view'), target.dataset.pairSwap);
  if (target.dataset.pairOpenBoth) return openPairLinks(target.dataset.pairOpenBoth);
  if (target.dataset.pairRefresh) { const key = target.dataset.pairRefresh; togglePairRow($('#ev-view'), key); togglePairRow($('#ev-view'), key); return $('#ev-view').querySelector(`[data-pair-refresh="${CSS.escape(key)}"]`)?.focus({preventScroll:true}); }
  if (target.dataset.evbAnalysis) {
    // Swap the compact panel for the full analysis with the stake calculator already open.
    const id = target.dataset.evbAnalysis, view = $('#ev-view'), row = view.querySelector(`.evb-row[data-evb-row="${CSS.escape(id)}"]`);
    if (!row) return;
    view.querySelectorAll('.evb-detail-row').forEach(detail => detail.remove());
    view.querySelectorAll('.evb-row.is-open').forEach(open => { open.classList.remove('is-open'); open.querySelector('[data-evb-toggle]')?.setAttribute('aria-expanded','false'); });
    evOpenId = '';
    showBetComparison(id, 'quote', {anchor:row, force:true});
    row.classList.add('is-open'); row.querySelector('[data-evb-toggle]')?.setAttribute('aria-expanded','true');
    const mount = view.querySelector('#expanded-bet-comparison'), calculator = mount?.querySelector('[data-comparison-action="calculator"]');
    if (calculator && calculator.getAttribute('aria-pressed') !== 'true') calculator.click();
    calculator?.closest('details')?.removeAttribute('open');
    mount?.scrollIntoView({block:'nearest', behavior:'instant'});
    return;
  }
  if (target.dataset.detail) return openDetail(target.dataset.detail, target);
  if (target.dataset.arbCalc) {
    const source = quoteSource();
    const first = source.find(quote => quote.id === target.dataset.arbCalc);
    const second = source.find(quote => quote.id === target.dataset.arbHedge);
    if (first && second) openArbCalculator({ first, second, stake, flatMultiplier, bankroll, brandMark, trigger:target });
    return;
  }
  if (target.dataset.sharpExpand) { expandedSharpKey = expandedSharpKey === target.dataset.sharpExpand ? '__closed__' : target.dataset.sharpExpand; return render(); }
  if (target.dataset.tool) return setTool(target.dataset.tool);
  if (target.hasAttribute('data-tool-clear')) { search = ''; sport = ''; history.replaceState(history.state, '', `${location.pathname}?sport=all${location.hash}`); return render(); }
  if (target.hasAttribute('data-replay-live')) return $('#ev-view-actions [data-replay-live]')?.click();
  if (target.hasAttribute('data-arb-clear')) return $('#ev-reset-filters').click();
  if (target.dataset.add) return openForm(target.dataset.add, null, { kind:target.dataset.kind || 'price', live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true' });
  if (target.dataset.edit) return openForm(target.dataset.edit, target.dataset.id);
  if (target.dataset.parlay || target.dataset.parlayRemove) {
    const id = target.dataset.parlay || target.dataset.parlayRemove;
    parlayIds = parlayIds.includes(id) ? parlayIds.filter(x => x !== id) : [...parlayIds,id];
    if (active !== 'parlay') return setTool('parlay');
    const top = window.scrollY;
    render();
    window.scrollTo({top, behavior:'instant'});
    $('#ev-view').querySelector(`[data-parlay="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
    return;
  }
  if (target.dataset.fantasy) { const id = target.dataset.fantasy; const item = state.dfs.find(x => x.id === id); if (item && item.app !== fantasyApp) { fantasyApp = item.app; fantasyIds = []; } const sameLine = other => other && item && other.player === item.player && other.market === item.market && String(other.line) === String(item.line) && other.event === item.event; fantasyIds = fantasyIds.includes(id) ? fantasyIds.filter(x => x !== id) : [...fantasyIds.filter(x => !sameLine(state.dfs.find(d => d.id === x))), id]; if (active !== 'slip') return setTool('slip'); const top = window.scrollY; render(); window.scrollTo({top,behavior:'instant'}); $('#ev-view').querySelector(`[data-fantasy="${CSS.escape(id)}"]`)?.focus({preventScroll:true}); return; }
  if (target.dataset.optimize) { fantasyIds = target.dataset.optimize.split(','); fantasyApp = state.dfs.find(x => x.id === fantasyIds[0])?.app || ''; return setTool('slip'); }
  if (target.dataset.promoPair) { const a = state.quotes.find(x => x.id === target.dataset.promoPair), b = state.quotes.find(x => x.id === target.dataset.hedge); if (a && b) { promoInput.promoOdds = a.odds; promoInput.hedgeOdds = b.odds; render(); } return; }
  if (target.dataset.alertToggle) { const rule = state.alerts.find(x => x.id === target.dataset.alertToggle); if (rule) { rule.enabled = rule.enabled === false; commit(); } return; }
  if (target.hasAttribute('data-email-alerts')) { state.alertEmail = state.alertEmail !== true; commit(); return; }
  if (target.hasAttribute('data-browser-alerts')) { toggleBrowserAlerts().then(() => render()); return; }
  if (target.dataset.notificationDismiss) { state.notifications = state.notifications.filter(x => x.id !== target.dataset.notificationDismiss); return commit(); }
  if (target.id === 'ev-save-paytable') { const inputs = [...$('#ev-view').querySelectorAll('[data-pay-hits]')]; if (!state.paytables[fantasyApp]) state.paytables[fantasyApp] = {}; state.paytables[fantasyApp][String(fantasyIds.length)] = inputs.map(x => Math.max(0, Number(x.value) || 0)); return commit(); }
});
// Boost fields preview the boosted price and EV without re-rendering the board.
$('#ev-view').addEventListener('input', event => {
  const field = event.target.closest('[data-evb-boost]');
  if (!field) return;
  const offer = boostedOffer(field.dataset.odds, Number(field.dataset.fair), field.value);
  field.parentElement.querySelector('.evd-boost-result').textContent = offer ? `${oddsLabel(offer.american)}${Number.isFinite(offer.ev) ? ` · ${(offer.ev * 100).toFixed(2)}% EV` : ''}` : '';
});
// Arbitrage boost fields re-run the stake split for that pair at the same total.
$('#ev-view').addEventListener('input', event => {
  const field = event.target.closest('[data-arb-boost]'), key = field?.dataset.arbBoost;
  if (!key || !pairArbs.has(key)) return;
  const fields = [...field.closest('.evd-panel').querySelectorAll('[data-arb-boost]')], boosts = fields.map(input => Number(input.value));
  const result = boosts.some(value => value > 0) ? constrainedArb(arbLegs(key).map((q, i) => boosts[i] > 0 ? {...q, boostPercent:boosts[i]} : q), pairArbs.get(key).entry.plan.actualTotal) : null;
  const shown = boosts[fields.indexOf(field)] > 0 ? field : fields.find((_, i) => boosts[i] > 0);
  fields.forEach(input => { input.parentElement.querySelector('.evd-boost-result').textContent = input !== shown ? '' : result ? `Profit ${money(result.minProfit)} · ${(result.margin * 100).toFixed(1)}%` : 'No valid split'; });
});
$('#ev-view').addEventListener('change', event => {
  if (active === 'odds' && oddsScreen.change(event)) return;
  if (active === 'fantasy' && dfsWorkspace.change(event)) return;
  const t = event.target;
  if (t.dataset.toolFilter) { toolFilters = { ...toolFilters, [t.dataset.toolFilter]: t.value }; saveToolFilters(toolFilters, window.localStorage); pairVisibleCount = 40; parlayVisibleCount = 40; render(); $(`[data-tool-filter="${t.dataset.toolFilter}"]`)?.focus(); return; }
  if (t.hasAttribute('data-tool-sport')) { sport = t.value; history.replaceState(history.state, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`); render(); return; }
  if (t.id === 'sharp-sport') { sport = t.value; history.replaceState(history.state, '', `${location.pathname}?sport=${encodeURIComponent((sport || 'all').toLowerCase())}${location.hash}`); render(); }
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
$('#ev-view').addEventListener('keydown', event => { if (active === 'fantasy') dfsWorkspace.keydown(event); if (active === 'sharp') sharpKeydown(event); });
$('#ev-view').addEventListener('error', event => { if (event.target.matches?.('[data-dfs-image]')) event.target.hidden = true; }, true);
$('#ev-form').addEventListener('submit', saveForm);
$('#ev-close').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-cancel').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-delete').addEventListener('click', deleteRecord);
$('#ev-dialog').addEventListener('close', () => { editing = null; });

$('#ev-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(suite.exportWorkspace(),null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `sportslab-ev-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (toolMeta[key]) { if (key !== active) closeToolDialogs(); active = key; bookmaker = ''; marketType = ''; showAllBooks = false; bookMenuOpen = false; designFilters = { league:'', date:'all', period:'all', side:'', minEdge:'0', maxOdds:'all' }; render(); } });
let displayedQuoteRevision = '';
document.addEventListener('ev-tool-change', () => { displayedQuoteRevision = quoteRevision(state.quotes); });
// Coming back to the tab refreshes DFS lines right away instead of on the next tick.
document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureDfsFeed(); });
setInterval(() => {
  if (document.hidden) return;
  ensureDfsFeed();
  const editing = bookMenuOpen || document.fullscreenElement || document.querySelector('dialog[open],.wager-more[open],.bet-comparison-history:not([hidden]),.evx-more[open],.evx-tools-menu[open]') || document.activeElement?.closest('input,textarea,select,[contenteditable],.ev-control-grid,.bet-inline-mount,.ev-reference-mount,.evb-detail');
  if (editing) return;
  if (active === 'odds') { if(!suite.hasView(active))oddsScreen.refresh(); return; }
  // Age labels update locally. An unchanged price snapshot must not replace cards,
  // reset focus, or collapse the comparison somebody is reading.
  document.querySelectorAll('.ev-selection-card[data-wager-id]').forEach(card => {
    const quote = state.quotes.find(q => q.id === card.dataset.wagerId);
    const label = card.querySelector('.wager-meta>span:last-child,.bet-inline-market>small');
    if (quote && label) label.textContent = `${quote.live ? 'Live' : 'Pregame'} · Observed ${age(quote.ts)}`;
  });
  if (['ev-live','arb-live','sharp','line-alerts'].includes(active) && quoteRevision(state.quotes) !== displayedQuoteRevision) {
    preserveLiveOrder = true;
    try { render(); } finally { preserveLiveOrder = false; }
  }
}, 15_000);
$('.ev-header-actions').append($('.ev-sidebar'));
$('#main').append($('#ev-notice'));
document.addEventListener(STATE_CHANGE_EVENT, event => {
  sportsbookState = event.detail.state;
  selectedSportsbooks = null; bookmaker = ''; bookMenuOpen = false; detailQuoteId = ''; sharpSelectedBook = '';
  render();
});
// A price refresh waits while someone is typing, choosing from an open dropdown or menu, or using
// the phone filter sheet, so it never wipes an edit or closes what they are reading.
const interacting = () => bookMenuOpen || Boolean(document.fullscreenElement)
  || document.body.classList.contains('ev-mobile-filter-open')
  || Boolean(document.querySelector('dialog[open],[aria-haspopup][aria-expanded="true"],.wager-more[open],.evx-more[open],.evx-tools-menu[open],.bet-expanded-more[open]'))
  || Boolean(document.activeElement?.closest?.('#main input:not([type=button]):not([type=checkbox]):not([type=radio]),#main select,#main textarea,#main [contenteditable]'));
feedControls = createQuoteFeedControls({ sync: syncLocalApi, getState: () => state, getTool: () => active, canRefresh: () => !interacting(), hasLive: () => state.quotes.some(q => q.live) });
installMobileWorkspace();
for(const type of ['click','change','input','submit','dragstart','dragover','drop'])$('#main').addEventListener(type,event=>{if(suite.handleEvent(event))event.stopImmediatePropagation();},true);
suite.startRefresh();
persist(); render();
// Load the latest quotes as soon as the dashboard opens instead of waiting for Sync API.
void feedControls.refresh();

