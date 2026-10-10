// DFS lines arrive priced by the odds service (fair probability and odds, each book's line and average);
// the slip calculator (betting-math.js) runs on the picks and payout tables the member chooses.
import { fantasySlip, decimal, breakEven, probabilityToAmerican } from './betting-math.js';
import { money, oddsLabel } from './odds-format.js';
import { isCurrent } from './odds-contract.js';
import { serverNow } from './odds-client.js';
export { breakEven };
import { teamLogo } from './sports-identity.js';
import { FANTASY_PLATFORMS, SPORTSBOOK_PLATFORMS, canonicalPlatform, platformAsset, isFantasyPlatform, isContestPlatform } from './platform-catalog.js?v=2';
import { boardIcon, renderBetPanel } from './ev-board.js?v=8-source';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Books with consensus weight in the server engine (lib/odds/engine.mjs BOOK_WEIGHTS); only these price the fair probability.
const WEIGHTED_BOOKS = new Set(['pinnacle','circa','circa sports','sporttrade','novig','prophetx','kalshi','4caster','fanduel','betonline','bookmaker','propbuilder','draftkings','betmgm','caesars','betano']);
const weightedBook = book => WEIGHTED_BOOKS.has(String(book).toLowerCase().trim());
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// App-name lookups run for every one of ~30k lines on each render; the answers never change.
const memo = fn => { const cache = new Map(); return value => { const key = String(value ?? ''); if (!cache.has(key)) cache.set(key, fn(value)); return cache.get(key); }; };
const appName = memo(canonicalPlatform);
// Goblin and demon picks change PrizePicks' payout: the feed's per-pick payout multiplier (goblin
// 0.7, demon 1.55, ...) scales the entry's payout. Without one, their edge, optimizer ranking and
// slip EV can't be measured.
// Sleeper and Chalkboard instead pay a multiplier per pick and an entry pays their product. Their table
// pays 1× (PER_PICK_TABLE) and each pick's multiplier is its payout factor, so a leg's break-even is
// 1 ÷ its multiplier and an entry pays the product: the same maths every slip and edge here already uses.
export const PER_PICK_APPS = new Set(['Sleeper Picks', 'Chalkboard', 'WannaParlay', 'HotStreak', 'Boom Fantasy']);
export const perPickApp = app => PER_PICK_APPS.has(appName(app));
// Pick types that scale the entry's payout by their multiplier: PrizePicks goblins and demons, Dabble's adjusted picks.
export const PAYOUT_TYPES = new Set(['goblin', 'demon', 'adjusted']);
export const standardPayout = item => !perPickApp(item?.app) && !PAYOUT_TYPES.has(item?.oddsType);
/** The factor a pick applies to its slip's payout: 1 for a standard line, the feed's multiplier for a goblin, demon or per-pick app, NaN when unknown. */
export const payoutFactor = item => standardPayout(item) ? 1 : Number(item?.payoutMultiplier) > 0 ? Number(item.payoutMultiplier) : NaN;
const payoutKind = item => perPickApp(item?.app) ? 'Per-pick' : ODDS_TYPE_LABELS[item?.oddsType] || 'Pick';
export const payoutKnown = item => Number.isFinite(payoutFactor(item));
/**
 * A leg's break-even: 1 ÷ its multiplier on a per-pick app; otherwise the app's per-leg break-even for the
 * entry size divided by the leg's payout factor. NaN when either is unknown (never null ÷ x = 0).
 */
export const legBreakEven = (item, appBreakEven) => {
  const factor = payoutFactor(item);
  if (!Number.isFinite(factor) || !(factor > 0)) return NaN;
  if (perPickApp(item?.app)) return 1 / factor;
  return appBreakEven == null || !Number.isFinite(Number(appBreakEven)) ? NaN : Number(appBreakEven) / factor;
};
const ODDS_TYPE_LABELS = { goblin: 'Goblin', demon: 'Demon', adjusted: 'Adjusted' };
// A 1st-half or 1st-quarter line the feed sends under the full-game stat name (see dfsPicks).
const partGame = item => item?.period === 'part';
const PART_GAME = 'PrizePicks also posts this stat for the 1st half and 1st quarter, and the feed sends those under the same name, so this line is one of them. It isn’t compared with full-game sportsbook prices.';
const PART_GAME_BLOCKED = 'Part-game lines can’t be priced; the feed doesn’t say which period this is.';
// Pick'em entries start at $1 on PrizePicks and Underdog; the entry field and its check share this.
const MIN_ENTRY = 1;
// Season-long boards arrive with the board code as the event (NBASZN).
const eventLabel = event => { const season = /^([A-Z]{2,5})SZN$/.exec(String(event || '')); return season ? `${season[1]} season-long` : event; };
const times = value => `${Math.round(Number(value) * 100) / 100}×`;
const typeBadge = item => perPickApp(item.app) ? (payoutKnown(item) ? `×${payoutFactor(item)}` : '') : ODDS_TYPE_LABELS[item.oddsType] ? `${ODDS_TYPE_LABELS[item.oddsType]}${payoutKnown(item) ? ` ×${payoutFactor(item)}` : ''}` : '';
const SPORT_ORDER = ['NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL','Soccer','Tennis','MMA','Golf'];
const validProbability = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
const percent = value => validProbability(value) ? `${(Number(value) * 100).toFixed(2)}%` : '—';
const icons = {
  down:'<path d="m6 9 6 6 6-6"/>', up:'<path d="m6 15 6-6 6 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
  hide:'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 21 12a13 13 0 0 1-3.2 4.1M6.2 6.2A14 14 0 0 0 3 12s3 7 9 7a10 10 0 0 0 4-.9"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6.1 7.1A7 7 0 0 1 18 6l2 3M4 15l2 3a7 7 0 0 0 11.9-1.1"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', cash:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>', right:'<path d="m9 6 6 6-6 6"/>', check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.down}</svg>`;
export const DFS_PLATFORMS = FANTASY_PLATFORMS;
export const isDfsPlatform = memo(isFantasyPlatform);

// Each app's published standard payouts: total return per $1 entry, indexed by picks correct.
// PrizePicks Power Play: prizepicks.com/help-center/payouts (last updated 9 Sep 2026; rechecked 2 Oct 2026).
// Underdog Standard entries: Underdog help center "Pick'em Standard & Flex Entry Payouts" (rechecked 2 Oct 2026).
// Sleeper sets a multiplier per pick, so it has no fixed table. Promotions, state rules, special
// picks and same-game combinations change real payouts; saved tables override these.
const allHit = (size, multiplier) => [...Array(size).fill(0), multiplier];
export const STANDARD_PAYTABLES = Object.freeze({
  PrizePicks: { 2: allHit(2, 3), 3: allHit(3, 6), 4: allHit(4, 10), 5: allHit(5, 20), 6: allHit(6, 37.5),
    // Flex: partial payouts by picks correct (published by PrizePicks, rechecked 2 Oct 2026).
    flex: { 3: [0, 0, 1, 3], 4: [0, 0, 0, 1.5, 6], 5: [0, 0, 0, 0.4, 2, 10], 6: [0, 0, 0, 0, 0.5, 2, 10], 7: [0, 0, 0, 0, 0, 0.5, 2, 15], 8: [0, 0, 0, 0, 0, 0, 0.5, 2, 20] } },
  'Underdog Fantasy': { 2: allHit(2, 3.5), 3: allHit(3, 6.5), 4: allHit(4, 12), 5: allHit(5, 20), 6: allHit(6, 35), 7: allHit(7, 65), 8: allHit(8, 120) },
});
// A per-pick app's entry pays 1× scaled by its picks' multipliers (see PER_PICK_APPS); no saved or feed table replaces it.
const PER_PICK_TABLE = Object.freeze(Object.fromEntries([2, 3, 4, 5, 6].map(size => [size, allHit(size, 1)])));
/**
 * Payout tables per app and entry size: the quote API's tables (GET /site/dfs/payouts) for apps
 * without a published table, then each app's published payouts, then the member's saved tables on
 * top. A published table always beats the API's: on 2 Oct 2026 the API still sent PrizePicks'
 * retired 3-pick 5×, 5-pick 15× and 6-pick 25× (now 6×, 20×, 37.5×) and Underdog's 3×/5×/10×/15×.
 */
export function withStandardPaytables(saved = {}, api = {}) {
  const tables = {};
  for (const layer of [api, STANDARD_PAYTABLES, saved]) for (const [app, sizes] of Object.entries(layer && typeof layer === 'object' ? layer : {})) {
    tables[canonicalPlatform(app)] = { ...(tables[canonicalPlatform(app)] || {}), ...Object.fromEntries(Object.entries(sizes || {}).map(([size, rules]) => [size, Array.isArray(rules) ? [...rules] : rules])) };
  }
  for (const app of PER_PICK_APPS) tables[app] = Object.fromEntries(Object.entries(PER_PICK_TABLE).map(([size, rules]) => [size, [...rules]]));
  return tables;
}
/** Where a table comes from: 'saved', 'standard' (published), 'api', or '' when there is none. */
export const paytableSource = (saved, app, size, api = {}) => saved?.[app]?.[String(size)] ? 'saved' : STANDARD_PAYTABLES[app]?.[String(size)] ? 'standard' : api?.[app]?.[String(size)] ? 'api' : '';
export const isStandardPaytable = (saved, app, size, api = {}) => paytableSource(saved, app, size, api) === 'standard';
const brand = name => {
  const asset = platformAsset(name);
  return asset ? `<img class="dfs-brand" src="${asset}" alt="${esc(name)}" width="28" height="28">` : `<span class="dfs-brand-fallback" aria-label="${esc(name)}">${esc(name.slice(0,2))}</span>`;
};
const teamMark = item => {
  const url = teamLogo({sport:String(item.sport || '').toLowerCase(),team:item.team,teamId:item.teamId,teamLogo:item.teamLogo});
  return url ? `<img class="dfs-team-logo" src="${esc(url)}" alt="${esc(item.team || '')}" width="24" height="24" loading="lazy" data-dfs-image>` : '';
};



// DFS comparisons come only from DFS props. Sportsbook quotes are a separate market.
export function comparisonPlatforms(item, props = []) {
  if (item.source === 'design-preview' && Array.isArray(item.platformLines)) return item.platformLines.filter(row => isDfsPlatform(row.app));
  const peers = props.filter(q => isDfsPlatform(q.app) && q.sport === item.sport && q.event === item.event && normalize(q.player) === normalize(item.player) && normalize(q.market) === normalize(item.market));
  const pairs = new Map();
  for (const q of peers) {
    if (!['Over','Under'].includes(q.side) || q.line == null || q.line === '' || !Number.isFinite(Number(q.line))) continue;
    const app = appName(q.app);
    const key = JSON.stringify([app,Number(q.line)]);
    const row = pairs.get(key) || {app,line:Number(q.line),...(q.oddsType ? {oddsType:q.oddsType} : {})};
    const side = q.side.toLowerCase();
    if (!row[side] || (Date.parse(q.ts) || 0) >= (Date.parse(row[side].ts) || 0)) row[side] = {line:Number(q.line),probability:validProbability(q.probability) ? Number(q.probability) : null,ts:q.ts};
    pairs.set(key,row);
  }
  return [...pairs.values()];
}

// One column per app. PrizePicks also posts goblin and demon alternates for the same player and stat,
// so each app shows the selected line if it has it, else its standard line nearest the selected one
// (any line when it has no standard one).
export function selectedComparisonPlatforms(item, props, names) {
  const lines = comparisonPlatforms(item, props), target = Number(item.line);
  const nearest = rows => rows.reduce((best, row) => Math.abs(row.line - target) < Math.abs(best.line - target) ? row : best);
  return names.filter(isDfsPlatform).map(app => {
    const matches = lines.filter(row => row.app === app);
    if (!matches.length) return {app};
    const standard = matches.filter(row => !row.oddsType || row.oddsType === 'standard');
    return matches.find(row => row.line === target) || nearest(standard.length ? standard : matches);
  });
}

// Use recorded prices for the exact selection; estimated hit rates are never offers.
export function sportsbookOffer(item, quotes = []) { return sportsbookOffers(item, quotes)[0] || null; }
// Quotes grouped by normalized player (or, for quotes without a player field, by normalized market),
// built once per quote list: each DFS row then checks only its own player's quotes instead of all
// ~13k (scanning them made every render take a second).
const offerIndex = new WeakMap();
function quotesFor(quotes, player, market) {
  let index = offerIndex.get(quotes);
  if (!index) {
    index = new Map();
    for (const quote of quotes) {
      const key = normalize(quote.player) || normalize(quote.market);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(quote);
    }
    offerIndex.set(quotes, index);
  }
  return [...(index.get(player) || []), ...(index.get(player + market) || [])];
}
const SPORTSBOOK_NAMES = new Set([...SPORTSBOOK_PLATFORMS, 'Pinnacle']);
// Latest matching price per sportsbook, best price first.
export function sportsbookOffers(item, quotes = []) {
  if (item.source === 'design-preview') return [];
  const player = normalize(item.player), event = normalize(item.event);
  const marketName = value => {
    const name = normalize(value);
    return name.startsWith(player) ? name.slice(player.length) : name;
  };
  const market = marketName(item.market);
  const hasLine = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  if (!player || !event || !market || !hasLine(item.line)) return [];
  const latest = new Map();
  for (const quote of quotesFor(quotes, player, market)) {
    const book = SPORTSBOOK_NAMES.has(appName(quote.book)) ? appName(quote.book) : '';
    const quotePlayer = normalize(quote.player) || (normalize(quote.market) === player + market ? player : '');
    if (!book || quote.exchange || !Number.isFinite(decimal(quote.odds)) ||
        (quote.source === 'example') !== (item.source === 'example') ||
        normalize(quote.sport) !== normalize(item.matchSport || item.sport) || normalize(quote.event) !== event ||
        quotePlayer !== player || marketName(quote.market) !== market ||
        !hasLine(quote.line) || Number(quote.line) !== Number(item.line) ||
        normalize(quote.side) !== normalize(item.side) || Boolean(quote.live) !== Boolean(item.live) ||
        normalize(quote.period || 'full') !== normalize(item.period || 'full') || !isCurrent(quote, serverNow())) continue;
    const prior = latest.get(book);
    if (!prior || (Date.parse(quote.ts) || 0) >= (Date.parse(prior.ts) || 0)) latest.set(book,{...quote,book});
  }
  return [...latest.values()].sort((a,b) => decimal(b.odds) - decimal(a.odds) || a.book.localeCompare(b.book));
}

// onDeleteSlip(id) removes a saved slip from the page's state and saves it; without it the slip is removed from
// the list in place and stays removed once the page next saves.
export function createDfsWorkspace({getState,redraw,onSave,onConfigure,onDeleteSlip}) {
  // platform: null until set, '' for all apps. A slip is for one app: its first pick's app, else the
  // chosen app, else the app with the most props listed (leadApp).
  let platform = null, filterSport, market = '', lineType = '', query = '', sort = 'edge', slipAppName = '', leadApp = '';
  let previousPreview = null;
  let expanded = '', menuOpen = false, slipType = '3-saved', entry = 10, feedback = '', allSaved = false;
  // The page's state is read once per render (getState copies it and filters the quotes).
  let snap = null;
  const current = () => snap || getState();
  let browsePosition = 0;
  // The feed carries tens of thousands of lines (17k NFL PrizePicks props alone); show them in pages.
  const ROW_PAGE = 50;
  let rowLimit = ROW_PAGE;
  const selected = new Set(), hidden = new Set(), excludedPlatforms = new Set();
  const noProps = () => !current().dfs.length;
  // DFS-app lines, filtered once per list of picks (the list only changes when the feed does).
  // (Adding a prop by hand pushes onto the same list, so its length is part of the key.)
  let rowsCache = { dfs: null, length: -1, rows: [] };
  const allRows = () => {
    const dfs = current().dfs;
    if (rowsCache.dfs !== dfs || rowsCache.length !== dfs.length) rowsCache = { dfs, length: dfs.length, rows: dfs.filter(item => isDfsPlatform(item.app)) };
    return rowsCache.rows;
  };
  const slipApp = () => (selected.size && slipAppName) || platform || leadApp || 'PrizePicks';
  // Salary-cap contest apps have no pick'em slip or payouts.
  const contestMode = () => isContestPlatform(slipApp());
  const rulesFor = app => { if (perPickApp(app)) return PER_PICK_TABLE; const tables = current().paytables; return tables[app] || Object.entries(tables).find(([name]) => appName(name) === app)?.[1] || {}; };
  const payoutRules = () => rulesFor(slipApp());
  let breakEvens = new Map();
  // A leg's break-even with the other legs at the standard break-even: the app's per-leg break-even
  // divided by the leg's payout factor (a 0.7 goblin in a 3-pick 6x entry needs 55.03% / 0.7 = 78.6%).
  const thresholdFor = item => {
    const app = appName(item.app);
    if (!breakEvens.has(app)) breakEvens.set(app, breakEven(rulesFor(app)[String(chosenType().size)]));
    const threshold = legBreakEven(item, breakEvens.get(app));
    return Number.isFinite(threshold) ? threshold : null;
  };
  const edgeKey = item => { const edge = edgeFor(item, thresholdFor(item)); return Number.isFinite(edge) ? edge : -Infinity; };
  // Entry sizes come from the app's payout tables (Underdog runs to 8 picks); 2–6 when the app has none.
  const types = () => {
    const rules = payoutRules(), sizes = Object.keys(rules).map(Number).filter(size => Number.isInteger(size) && size >= 2 && Array.isArray(rules[size])).sort((a,b) => a-b);
    return (sizes.length ? sizes : [2,3,4,5,6]).map(size => ({id:`${size}-saved`,size,kind:'',rules:rules[String(size)] || null}));
  };
  const chosenType = () => { const list = types(); return list.find(type => type.id === slipType) || list.find(type => type.size === 3) || list[0]; };
  const choices = () => allRows().filter(item => selected.has(item.id));
  const label = item => `${item.player} ${item.side} ${item.line}`;
  const repaint = (selector) => {
    const before = selector ? document.querySelector(selector)?.getBoundingClientRect?.().top : null;
    redraw();
    if (selector) {
      const control = document.querySelector(selector);
      control?.focus({preventScroll:true});
      const after = control?.getBoundingClientRect?.().top;
      if (Number.isFinite(before) && Number.isFinite(after)) globalThis.window?.scrollBy?.(0,after-before);
    }
  };
  const panelId = item => `dfs-detail-${encodeURIComponent(item.id).replace(/%/g,'_')}`;
  // The rail picks which pick'em apps the comparison shows; salary-cap contest apps (DraftKings and
  // FanDuel Fantasy) never post pick'em lines, and their logos read as the sportsbooks.
  const platformOptions = DFS_PLATFORMS.filter(app => !isContestPlatform(app));
  const chosenPlatforms = () => platformOptions.filter(app => !excludedPlatforms.has(app));
  // Platforms to compare: one rail of round logo toggles, like the Positive EV sportsbook bar.
  function platformFilters() {
    const count = chosenPlatforms().length;
    if (!platformOptions.length) return '';
    const logo = app => { const asset = platformAsset(app); return asset ? `<img src="${asset}" alt="" width="26" height="26" decoding="async">` : `<span aria-hidden="true">${esc(app.slice(0,2))}</span>`; };
    return `<div class="dfs-platform-bar" role="group" aria-label="DFS platforms to compare"><p class="dfs-platform-bar-label"><span>Platforms</span><span class="dfs-book-count">${count}/${platformOptions.length}</span></p><div class="dfs-platform-rail">${platformOptions.map(app => { const on = !excludedPlatforms.has(app); return `<button type="button" class="dfs-platform-logo" data-dfs-compare-platform="${esc(app)}" data-platform="${esc(app)}" aria-label="Compare ${esc(app)}" title="${esc(app)}${on ? '' : ' (hidden)'}" aria-pressed="${on}">${logo(app)}</button>`; }).join('')}</div><button type="button" class="dfs-platform-all" data-dfs-all-platforms aria-pressed="${count===platformOptions.length}" title="Compare all platforms">All</button></div>`;
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const matched = () => {
    const search = query.trim().toLowerCase();
    const rows = allRows().filter(item => (!platform || appName(item.app) === platform) && (!filterSport || item.sport === filterSport) && (!lineType || (item.oddsType || 'standard') === lineType) && (!market || item.market === market) && !hidden.has(item.id) && (!search || [item.player,item.event,item.market,item.team].some(text => String(text || '').toLowerCase().includes(search))));
    if (sort === 'player') return rows.sort((a,b) => collator.compare(a.player, b.player) || Number(a.line) - Number(b.line));
    // Sort keys computed once per row; lines without a value go last, in feed order.
    const keys = new Map(rows.map(item => [item, sort === 'edge' ? edgeKey(item) : validProbability(item.probability) ? Number(item.probability) : -Infinity]));
    return rows.sort((a,b) => (keys.get(b) - keys.get(a)) || 0);
  };
  const signed = value => Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(2)}%` : '—';
  const pad = value => String(value).padStart(2,'0');
  const whenLabel = item => {
    const at = Date.parse(item.startTime);
    if (!Number.isFinite(at)) return item.live ? 'Live now' : item.startLabel || (item.source === 'local-api' ? 'Start time not in feed' : 'Time not entered');
    const d = new Date(at), hour = d.getHours();
    return `${item.live ? 'Live · ' : ''}${pad(d.getMonth()+1)}/${pad(d.getDate())} · ${hour % 12 || 12}:${pad(d.getMinutes())}${hour < 12 ? 'am' : 'pm'}`;
  };
  const SPORT_GROUPS = {NFL:'Football',NCAAF:'Football',NBA:'Basketball',WNBA:'Basketball',NCAAB:'Basketball',MLB:'Baseball',NHL:'Hockey',MLS:'Soccer',EPL:'Soccer'};
  const leagueLabel = item => { const league = item.league || item.sport || '', group = SPORT_GROUPS[league] || SPORT_GROUPS[item.sport] || item.sport; return group && group !== league ? `${group} | ${league}` : league; };
  // Team-code "players" (WAS, JAC, esports teams) are team stats; combos ("A + B") already name the combo market.
  const marketTitle = item => (/\bplayer\b/i.test(item.market) || / \+ /.test(item.player || '') ? item.market : `${/^[A-Z]{2,4}$/.test(item.player || '') ? 'Team' : 'Player'} ${item.market}`).replace(/(^|\s)([a-z])/g,(_,space,char) => space+char.toUpperCase());
  // A pick'em edge is always fair probability minus the app's break-even. Custom-odds EV from apps
  // such as Chalkboard is a different bet type: a 16% prop at +519 can be +EV as a single wager, but
  // it is not a 55% break-even pick'em edge and must never rank above one on this board.
  const edgeFor = (item, threshold) => validProbability(item.probability) && threshold != null && payoutKnown(item)
    ? Number(item.probability) - threshold : NaN;
  // An entry's payout table scaled by its picks' payout factors (NaN-free only when all are known).
  const slipFactor = picks => picks.reduce((product, item) => product * payoutFactor(item), 1);
  // Estimate vs the slip's break-even: clear edge, within about a point, or below.
  const heat = edge => !Number.isFinite(edge) ? 'none' : edge >= .01 ? 'high' : edge > -.01 ? 'near' : 'low';
  const quotes = () => current().quotes || [];
  // Every sportsbook price for this exact player, stat and line on one side, best first: the feed's
  // match (bookLines, which also covers books that name the game differently) plus any quote matched
  // here by event name. Not limited by the DFS platforms chosen in the rail, but limited to the sportsbooks the
  // member can use: the page's optional state.bookAvailable(book) (state coverage and their sportsbook choice).
  const bookShown = book => { const available = current().bookAvailable; return typeof available !== 'function' || available(book); };
  const bookOffers = (item, side) => {
    const key = side.toLowerCase(), merged = new Map();
    for (const line of (item.bookLines || item.probabilitySources || [])) if (Number.isFinite(decimal(line[key])) && !merged.has(line.book) && bookShown(line.book)) merged.set(line.book, { book:line.book, odds:Number(line[key]) });
    for (const offer of sportsbookOffers({...item,side},quotes())) if (!merged.has(offer.book) && bookShown(offer.book)) merged.set(offer.book, offer);
    return [...merged.values()].sort((a,b) => decimal(b.odds) - decimal(a.odds) || a.book.localeCompare(b.book));
  };
  // The books' average price for a side, as the odds service computed it: a feed line's own average, else
  // the sportsbook market's average at that exact line (one book: its own price).
  const averagePrice = (offers, item, side) => {
    if (offers.length === 1 && Number.isFinite(decimal(offers[0].odds))) return oddsLabel(offers[0].odds);
    const average = item.bookAverage?.[side.toLowerCase()] ?? current().analytics?.marketSide(offers.find(offer => offer.id))?.averageOdds;
    return offers.length && average != null ? oddsLabel(average) : '—';
  };
  const COLUMNS = 5;
  // Expanded row: the shared bet panel with sportsbook prices, then each selected DFS platform's line.
  function comparison(item) {
    // The pick's own app's break-even, as on its row (not the slip app's when every app is listed).
    const threshold = thresholdFor(item);
    // Every sportsbook with this exact prop, whichever DFS platforms are chosen above.
    const offers = Object.fromEntries(['Over','Under'].map(side => [side, bookOffers(item, side)]));
    const books = [...new Set([...(offers[item.side] || []), ...offers.Over, ...offers.Under].map(offer => offer.book))];
    // With sportsbook prices, only DFS platforms that post this prop follow them; otherwise every selected platform shows.
    const platforms = selectedComparisonPlatforms(item,allRows(),chosenPlatforms()).filter(p => !books.length || p.over || p.under);
    // Over wants the lowest line and Under the highest; only mark a best line when platforms disagree.
    const best = side => {
      const entries = platforms.filter(p => p[side] && Number.isFinite(Number(p[side].line))).map(p => ({app:p.app,line:Number(p[side].line)}));
      if (!entries.length) return null;
      const lines = entries.map(entry => entry.line), target = side === 'over' ? Math.min(...lines) : Math.max(...lines);
      return {...entries.find(entry => entry.line === target), differs:Math.min(...lines) !== Math.max(...lines)};
    };
    const rows = ['Over','Under'].map(side => {
      const key = side.toLowerCase(), list = offers[side], top = best(key);
      const bookCells = books.map(book => { const offer = list.find(entry => entry.book === book); return {value:offer ? oddsLabel(offer.odds) : '—', best:offer === list[0] && Boolean(offer)}; });
      const dfsCells = platforms.map(p => ({value:p[key] ? String(p[key].line) : '—', sub:validProbability(p[key]?.probability) ? `${percent(p[key].probability)} fair` : '', best:!list.length && top?.differs && Number(p[key]?.line) === top.line}));
      return {label:`${item.player} ${side} ${item.line}`, selected:side === item.side, average:averagePrice(list, item, side),
        best:list[0] ? {book:list[0].book, value:oddsLabel(list[0].odds)} : top ? {book:top.app, value:String(top.line)} : null, cells:[...bookCells, ...dfsCells]};
    });
    // Feed lines carry the server's fair odds; a line the member entered converts their own estimate.
    const valid = validProbability(item.probability), fair = !valid ? NaN : item.fairOdds != null ? Number(item.fairOdds) : item.source !== 'local-api' ? probabilityToAmerican(Number(item.probability)) : NaN;
    const edge = edgeFor(item, threshold), type = chosenType();
    const facts = [`Fair ${percent(item.probability)}`, Number.isFinite(fair) ? `Fair odds ${oddsLabel(fair)}` : '',
      !payoutKnown(item) ? `${payoutKind(item)} payout not in the feed, so no break-even` : threshold == null ? 'Payout rules needed for break-even' : perPickApp(item.app) ? `Break-even ${percent(threshold)} (1 ÷ ${appName(item.app)}’s ×${payoutFactor(item)} for this pick)` : `Break-even ${percent(threshold)} (${appName(item.app)} ${type.size} Pick${standardPayout(item) ? '' : `, ${payoutKind(item).toLowerCase()} payout ×${payoutFactor(item)}`})`,
      Number.isFinite(edge) ? `Edge ${signed(edge)}` : ''].filter(Boolean).map(esc).join(' · ');
    // The fair probability devigs every two-sided book, including ones hidden from the columns above.
    const devigged = item.probabilityBooks || [], unseen = devigged.filter(book => !books.includes(book)), unseenNote = unseen.length ? `; ${unseen.join(', ')} hidden by your sportsbook settings` : '';
    const bookNote = !books.length ? (devigged.length ? `Fair probability devigs ${devigged.join(', ')}${unseenNote}. ` : 'No sportsbook has this exact line. ') : `Sportsbook columns show every book’s American odds for this exact line${devigged.length ? `; fair probability devigs ${devigged.join(', ')} (both sides priced${unseenNote})` : '; none prices both sides, so there is no fair probability'}. `;
    const legend = partGame(item) ? PART_GAME : !books.length && !platforms.length && !devigged.length ? 'Select a DFS platform above to compare lines.' : `${bookNote}${platforms.length ? 'DFS columns show each app’s line and its fair probability.' : ''}`;
    const picked = selected.has(item.id), id = esc(item.id);
    return renderBetPanel({ id:panelId(item), colspan:COLUMNS, label:`Price comparison for ${label(item)}`, boosts:[],
      tools:[
        { icon:'hide', label:'Hide prop', attrs:`data-dfs-hide="${id}"` },
        { icon:'trackCircle', label:picked ? 'Remove from slip' : 'Add to slip', pressed:picked, attrs:`data-dfs-toggle-pick="${id}"${isContestPlatform(platform || item.app) ? ' disabled' : ''}` },
        ...([{ icon:'edit', label:'Edit prop', attrs:`data-edit="dfs" data-id="${id}"` }]),
        { icon:'refresh', label:'Refresh comparison', attrs:'data-dfs-refresh' }
      ],
      books:[...books, ...platforms.map(p => p.app)], rows, addAttrs:'data-add="dfs"',
      note:`<span class="dfs-panel-facts">${facts}</span> ${esc(legend)}` });
  }
  // The site's fair value for a pick: the no-vig odds from the sportsbooks that price both sides (their
  // logos, sharpest first as the feed lists them) and, when an exchange among them reports the money
  // behind its prices, that amount (FV · Smart Money).
  function fairValueCell(item, offer, rowOffers) {
    const valid = validProbability(item.probability);
    // The server's fair odds, else its fair probability in American odds (the same number, formatted).
    const fair = !valid ? NaN : item.fairOdds != null ? Number(item.fairOdds) : probabilityToAmerican(Number(item.probability));
    if (Number.isFinite(fair)) {
      const sources = Array.isArray(item.probabilitySources) ? item.probabilitySources.filter(source => source?.book) : [];
      const books = [...new Set([...(item.probabilityBooks || []), ...sources.map(source => source.book)])];
      const depth = sources.filter(source => source.exchange && Number(source.liquidity) > 0).sort((a, b) => b.liquidity - a.liquidity)[0];
      const shown = books.slice(0, 3), extra = books.length - shown.length;
      const marks = shown.length ? `<span class="dfs-fv-books${shown.length > 1 ? ' is-stack' : ''}">${shown.map(book => brand(book)).join('')}${extra > 0 ? `<span class="dfs-fv-more">+${extra}</span>` : ''}</span>` : '';
      const from = books.length ? `${books.join(', ')} (both sides, devigged ${item.probabilityMethod || current().devigMethod || 'multiplicative'})` : item.source === 'local-api' ? 'the odds service' : 'your entered probability';
      const cashText = depth ? `$${Math.round(Number(depth.liquidity)).toLocaleString('en-US')}` : '';
      return `<span class="dfs-fv" title="${esc(`Fair value ${oddsLabel(fair)} from ${from}${depth ? `; ${cashText} available at ${depth.book}` : ''}`)}">${marks}<strong class="dfs-fv-odds">${esc(oddsLabel(fair))}</strong>${depth ? `<span class="dfs-fv-dot" aria-hidden="true">·</span><span class="dfs-fv-cash">${icon('cash')}<strong>${esc(cashText)}</strong></span>` : ''}</span><small>${depth ? 'FV · Smart Money' : 'Fair Value'}</small>`;
    }
    // No two-sided market: the best one-sided book price, when there is one.
    if (offer) return `<span class="dfs-fv">${brand(offer.book)}<strong class="dfs-fv-odds">${esc(oddsLabel(offer.odds))}</strong></span><small>${esc(offer.book)}${rowOffers.length > 1 ? ` · best of ${rowOffers.length}` : ''} · one side only</small>`;
    return `<span class="dfs-fv"><strong class="dfs-fv-odds is-empty">—</strong></span><small>${partGame(item) ? 'Not compared' : 'No book price'}</small>`;
  }
  // One prop per row: market and event, selection, fair value, true probability, then round actions.
  function row(item) {
    const open = expanded === item.id, picked = selected.has(item.id), id = esc(item.id), name = esc(label(item));
    const allOffers = bookOffers(item, String(item.side).toLowerCase() === 'under' ? 'Under' : 'Over'), weighted = allOffers.filter(offer => weightedBook(offer.book)), rowOffers = weighted.length ? weighted : allOffers, offer = rowOffers[0] || null, edge = edgeFor(item, thresholdFor(item)), league = leagueLabel(item);
    return `<tr class="evb-row dfs-prop${PAYOUT_TYPES.has(item.oddsType) ? ' dfs-alt-line' : ''}${picked ? ' is-selected' : ''}${open ? ' is-open' : ''}" data-dfs-row="${id}">
      <td class="dfs-event-cell"><strong class="dfs-market-title">${esc(marketTitle(item))}</strong><span class="dfs-event-name">${esc(eventLabel(item.event) || (item.source === 'local-api' ? 'Matchup not in feed' : 'Matchup not entered'))}</span><small>${esc(whenLabel(item))}${league ? ` · ${esc(league)}` : ''}</small></td>
      <td class="dfs-pick-cell" title="DFS line at ${esc(item.app)}${item.source ? ` · ${item.source}` : ''}"><strong class="dfs-selection"><span class="dfs-player">${esc(item.player)}</span> <span class="dfs-pick-line">${esc(item.side)} ${esc(item.line)}</span>${typeBadge(item) ? ` <span class="dfs-odds-type" data-odds-type="${esc(item.oddsType || (perPickApp(item.app) ? 'per-pick' : ''))}">${esc(typeBadge(item))}</span>` : ''}${partGame(item) ? ` <span class="dfs-odds-type" data-odds-type="part" title="${esc(PART_GAME)}">Part game</span>` : ''}</strong><small>${platform ? 'Selection' : esc(appName(item.app))}${item.source ? `<span class="source-tag" data-source="${esc(item.source)}" title="Feed source">${esc(item.source)}</span>` : ''}</small></td>
      <td class="dfs-offer">${fairValueCell(item, offer, rowOffers)}</td>
      <td class="dfs-probability" data-heat="${heat(edge)}" title="${esc(validProbability(item.probability) ? `True probability: ${(item.probabilityBooks || []).length || 'the'} sportsbook market${(item.probabilityBooks || []).length === 1 ? '' : 's'} devigged (${item.probabilityMethod || current().devigMethod || 'multiplicative'})${Number.isFinite(edge) ? ` · ${signed(edge)} vs break-even ${percent(thresholdFor(item))}` : !payoutKnown(item) ? ` · ${payoutKind(item).toLowerCase()} payout not in the feed, so no break-even` : ''}` : partGame(item) ? PART_GAME : 'No two-sided sportsbook market for this player, market and line')}"><span class="dfs-prob">${percent(item.probability)}</span><small>${validProbability(item.probability) ? 'True Prob' : partGame(item) ? 'Not compared' : (Array.isArray(item.bookLines) && item.bookLines.some(line => line.over != null && line.under != null)) ? 'No fair price' : (Array.isArray(item.bookLines) && item.bookLines.length) ? 'One-sided market' : 'No book market'}</small></td>
      <td class="dfs-actions"><div>
        <button type="button" class="dfs-round dfs-hide" data-dfs-hide="${id}" aria-label="Hide ${esc(item.player)} prop" title="Hide prop">${boardIcon('hide',17)}</button>
        <button type="button" class="dfs-round dfs-pick" data-dfs-pick="${id}" aria-pressed="${picked}" aria-label="${picked ? `Remove ${name} from slip` : `Add ${name} to slip`}" title="${picked ? 'Remove from slip' : partGame(item) ? 'Part-game line: can’t be priced in a slip' : 'Add to slip'}" ${isContestPlatform(platform || item.app) ? 'disabled' : ''}>${boardIcon('pin',17)}</button>
        <button type="button" class="dfs-round dfs-expand" data-dfs-expand="${id}" aria-expanded="${open}" aria-controls="${panelId(item)}" aria-label="${open ? 'Hide' : 'Compare'} prices for ${name}" title="Compare prices">${boardIcon('chevron',17)}</button>
      </div></td>
    </tr>${open ? comparison(item) : ''}`;
  }
  function table(rows) {
    return `<div class="evb-table-wrap dfs-table-wrap"><table class="evb-table dfs-table" aria-label="${esc(platform || 'All apps')} DFS player props"><thead class="dfs-thead"><tr><th scope="col">Market and event</th><th scope="col">Selection</th><th scope="col">Fair value</th><th scope="col">True prob</th><th scope="col">Actions</th></tr></thead><tbody>${rows.slice(0, rowLimit).map(item => row(item)).join('')}</tbody></table></div>${rows.length > rowLimit ? `<button type="button" class="dfs-more" data-dfs-more>Show ${Math.min(ROW_PAGE, rows.length - rowLimit)} more · ${(rows.length - rowLimit).toLocaleString()} not shown</button>` : ''}`;
  }
  function togglePick(id) {
    const item = allRows().find(entry => entry.id === id);
    if (!item || isContestPlatform(platform || item.app)) return;
    if (selected.has(id)) { selected.delete(id); feedback=''; }
    else if (partGame(item)) feedback=PART_GAME_BLOCKED;
    else if (selected.size && appName(item.app) !== slipApp()) feedback=`This slip is for ${slipApp()}. Clear it to build a ${appName(item.app)} slip.`;
    else if (choices().some(pick=>normalize(pick.player)===normalize(item.player))) feedback='Choose one prop per player for this slip.';
    else if (selected.size >= chosenType().size) feedback=`This is a ${chosenType().size} pick slip. Remove a pick or choose a larger slip.`;
    else { if (!selected.size) slipAppName = appName(item.app); selected.add(id);feedback=''; }
  }
  // Saved slips (the page's state.slips), newest first: a few at a time, each deletable.
  const SAVED_PAGE = 5;
  const savedWhen = ts => { const at = Date.parse(ts); if (!Number.isFinite(at)) return 'Saved'; const d = new Date(at), hour = d.getHours(); return `${pad(d.getMonth()+1)}/${pad(d.getDate())} · ${hour % 12 || 12}:${pad(d.getMinutes())}${hour < 12 ? 'am' : 'pm'}`; };
  function savedSlips() {
    const list = (current().slips || []).filter(saved => saved && typeof saved.id === 'string' && Array.isArray(saved.picks) && Array.isArray(saved.paytable)).reverse();
    if (!list.length) return '';
    const shown = allSaved ? list : list.slice(0, SAVED_PAGE);
    return `<section class="dfs-saved-slips" aria-label="Saved slips"><h3>Saved slips <span>${list.length}</span></h3><ol>${shown.map(saved => {
      const stake = Number(saved.stake), result = fantasySlip(saved.picks, saved.paytable, stake), top = Number(saved.paytable.at(-1));
      return `<li><div><strong>${esc(saved.app)} ${saved.picks.length} Pick${Number.isFinite(top) ? ` · ${times(top)}` : ''}</strong><span>${saved.picks.map(pick => esc(label(pick))).join(' · ')}</span><small>${esc(savedWhen(saved.ts))}${stake > 0 ? ` · ${money(stake)} entry` : ''}${result ? ` · ${signed(result.ev)} est. EV` : ''}</small></div><button type="button" class="dfs-icon-button evb-icon" data-dfs-delete-slip="${esc(saved.id)}" aria-label="Delete saved ${esc(saved.app)} ${saved.picks.length} pick slip" title="Delete saved slip">${icon('close')}</button></li>`;
    }).join('')}</ol>${list.length > SAVED_PAGE ? `<button type="button" class="dfs-text-button" data-dfs-saved-all aria-expanded="${allSaved}">${allSaved ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}</section>`;
  }
  function slip() {
    if (contestMode()) return `<aside class="dfs-slip-panel dfs-slip-empty"><h2>${esc(slipApp())}</h2><p>Save player research here and track contest entries in your bet tracker. Contest payouts use standings and scoring rules.</p><a href="/ev/tracker">Open bet tracker</a></aside>`;
    const picks = choices(), type = chosenType(), saved = savedSlips();
    const rules = type.rules, complete = picks.length === type.size;
    // A goblin or demon pick without a multiplier leaves the payout unknown (NaN factor): no payout, EV or save.
    const factor = slipFactor(picks), known = Number.isFinite(factor), scaled = rules && known ? rules.map(value => Number(value) * factor) : null;
    const result = complete && scaled ? fantasySlip(picks,scaled,entry) : null;
    const title = `${slipApp()} ${type.size} Pick${type.kind ? ' '+type.kind : ''}`;
    if (!picks.length) return `<aside class="dfs-slip-panel dfs-slip-empty${saved ? ' has-saved' : ''}" aria-label="Selected picks"><h2>Add a pick to get started</h2><p>Selections for ${esc(title)} will appear here.</p><div class="dfs-slip-placeholder" aria-hidden="true">${Array.from({length:Math.min(type.size,6)},()=>'<div><i></i><span></span></div>').join('')}</div>${saved}</aside>`;
    const extra = picks.length - type.size, plural = n => n > 1 ? 's' : '';
    const fullHit = !rules ? 'Not entered' : perPickApp(slipApp()) ? (known ? `${times(factor)} <small>(the picks’ multipliers)</small>` : 'Not in the feed') : !known ? 'Varies (goblin/demon)' : factor !== 1 ? `${times(Number(rules.at(-1)) * factor)} <small>(${Number(rules.at(-1))}× × ${Math.round(factor * 1000) / 1000})</small>` : `${Number(rules.at(-1))}×`;
    const action = extra < 0 ? `Add ${-extra} more pick${plural(-extra)}` : extra > 0 ? `Remove ${extra} pick${plural(extra)}` : !rules ? 'Set payout rules' : 'Save slip';
    const note = result ? `Return assumes independent picks.${perPickApp(slipApp()) ? ` ${slipApp()} pays the product of each pick’s multiplier.` : factor !== 1 ? ' Goblin and demon multipliers from the feed scale the payout.' : ''}` : !known && perPickApp(slipApp()) ? `${slipApp()} pays a multiplier per pick, and the feed didn’t send one for every pick, so the payout isn’t known and the slip can’t be saved.` : !known ? 'Goblin and demon picks change the payout, and the feed didn’t send a multiplier for every one, so the payout, return and EV aren’t known and the slip can’t be saved.' : picks.some(item => !validProbability(item.probability)) ? 'Return and EV need a fair probability for every pick; picks without a two-sided sportsbook market leave them blank.' : '';
    return `<aside class="dfs-slip-panel" aria-label="Selected picks" tabindex="-1"><button type="button" class="dfs-return" data-dfs-return>Back to props</button><div class="dfs-slip-heading"><div><h2>Your picks <span>${picks.length}/${type.size}</span></h2><p>${esc(title)}</p></div><button type="button" data-dfs-clear class="dfs-text-button">Clear</button></div><div class="dfs-selected-picks">${picks.map(item => `<div class="dfs-slip-pick">${teamMark(item)}<div><strong>${esc(item.player)}</strong><span>${esc(item.side)} ${esc(item.line)} ${esc(item.market)}${typeBadge(item) ? ` · ${esc(typeBadge(item))}` : ''}</span><small>${validProbability(item.probability) ? `${percent(item.probability)} fair` : 'No fair probability'}</small></div><button type="button" class="dfs-icon-button evb-icon" data-dfs-remove="${esc(item.id)}" aria-label="Remove ${esc(item.player)}">${icon('close')}</button></div>`).join('')}</div><div class="dfs-slip-total"><label for="dfs-entry">Entry amount</label><div class="dfs-entry-field"><span>$</span><input id="dfs-entry" type="number" min="${MIN_ENTRY}" step="0.01" value="${entry}" inputmode="decimal" aria-label="Entry amount"></div><dl><div><dt>Full-hit payout</dt><dd>${fullHit}</dd></div><div><dt>Estimated return</dt><dd>${result ? money(result.payout*entry) : '—'}</dd></div><div><dt>Expected profit</dt><dd${result?.expectedProfit > 0 ? ' class="dfs-profit"' : ''}>${result ? money(result.expectedProfit) : '—'}</dd></div></dl><button type="button" class="dfs-save-slip" data-dfs-${rules ? 'save' : 'configure'} ${complete && (!rules || known) ? '' : 'disabled'}>${action}</button><p class="dfs-slip-note">Saved slips are listed below; no entry is placed. ${note}</p></div>${saved}</aside>`;
  }
  function slipDock() {
    if (contestMode()) return '';
    const picks = choices(), type = chosenType();
    if (!picks.length) return '';
    const complete = picks.length === type.size, extra = picks.length - type.size, plural = n => n > 1 ? 's' : '';
    const factor = slipFactor(picks), known = Number.isFinite(factor), result = complete && type.rules && known ? fantasySlip(picks,type.rules.map(value => Number(value) * factor),entry) : null;
    const status = result ? `${(result.expectedProfit / entry * 100).toFixed(1)}% est. EV` : extra > 0 ? `Remove ${extra} pick${plural(extra)}` : extra < 0 ? `${-extra} more pick${plural(-extra)} needed` : !type.rules ? 'Payout rules needed' : !known ? (perPickApp(slipApp()) ? 'A pick’s multiplier is missing' : 'Payout varies (goblin/demon)') : 'EV needs a fair price for every pick';
    return `<div class="dfs-slip-dock" aria-label="Slip summary"><button type="button" data-dfs-review><strong>${picks.length}/${type.size} picks · Review</strong><span>${status}${current().demoPermanent ? ' · Demo' : ''}</span></button><button type="button" data-dfs-${type.rules ? 'save' : 'configure'} ${complete && (!type.rules || known) ? '' : 'disabled'}>${type.rules ? 'Save slip' : 'Set payouts'}</button></div>`;
  }
  function render(options) {
    snap = getState();
    try { return renderView(options); } finally { snap = null; }
  }
  function renderView({initialSport = ''} = {}) {
    const workspace = current();
    const preview = noProps();
    if (previousPreview !== null && previousPreview !== preview) {
      platform = null;
      filterSport = initialSport || '';
      market = ''; query = ''; expanded = ''; feedback = ''; selected.clear(); hidden.clear(); excludedPlatforms.clear();
    }
    previousPreview = preview;
    if (filterSport === undefined) filterSport = initialSport || '';
    const source = allRows(), ids = new Set(source.map(item => item.id)), appCounts = new Map(), sportSet = new Set();
    for (const item of source) { const app = appName(item.app); appCounts.set(app, (appCounts.get(app) || 0) + 1); if (item.sport) sportSet.add(item.sport); }
    leadApp = [...appCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    if (platform === null) platform = appCounts.size === 1 ? leadApp : '';
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    if (!selected.size) slipAppName = '';
    slipType = chosenType().id;
    // Sports in the feed, the major leagues first; a sport picked from the URL stays listed.
    for (const name of ['NFL','MLB','NBA','WNBA','NHL','NCAAF','NCAAB','Soccer']) sportSet.add(name);
    const sports = [...sportSet].sort((a, b) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const app = slipApp(), payoutFrom = workspace.payoutSource?.(app, chosenType().size);
    const payoutNote = perPickApp(app) ? `${app} pays each pick’s own multiplier; an entry pays their product` : payoutFrom === 'api' ? `${app} payouts from the quote feed` : payoutFrom === 'standard' ? `${app}'s published standard payouts` : payoutFrom === 'saved' ? `Your saved ${app} payouts` : `${app} payout rules needed`;
    const bookProps = quotes().some(q => q.player);
    breakEvens = new Map();
    const type = chosenType(), threshold = breakEven(type.rules);
    // Pick'em apps, plus a contest app only when it has entered props.
    const platforms = DFS_PLATFORMS.filter(app => !isContestPlatform(app) || appCounts.has(app));
    const rows = matched();
    // Markets for the chosen app and sport, alphabetical; a chosen market stays listed.
    const markets = [...new Set(source.filter(item => (!platform || appName(item.app) === platform) && (!filterSport || item.sport === filterSport)).map(item => item.market))].sort(collator.compare);
    if (market && !markets.includes(market)) markets.unshift(market);
    const priced = rows.some(item => validProbability(item.probability));
    const hitNote = rows.length && !priced ? `<p class="dfs-feed-note" role="note">${bookProps ? 'No two-sided sportsbook market matches these props yet, so fair probabilities, edges and slip EV are blank.' : 'Fair probability comes from devigging sportsbook Over/Under odds on the same player prop. The quote feed has game lines only right now, so fair probabilities, edges and slip EV are blank.'} DFS apps don’t supply fair probabilities, and the feed’s DFS probability is not used.</p>` : '';
    // Best edge vs break-even among lines with a known payout (a goblin's raw fair probability is no edge).
    let topEdge = -Infinity;
    for (const item of rows) if (validProbability(item.probability)) { const edge = edgeFor(item, thresholdFor(item)); if (edge > topEdge) topEdge = edge; }
    const summary = `<div class="dfs-results-toolbar evb-summary"><p><strong>${rows.length} ${rows.length === 1 ? 'prop' : 'props'}</strong> from ${esc(platform || 'all apps')}${filterSport ? ` · ${esc(filterSport)}` : ''}</p><div class="dfs-summary-side"><dl>${threshold == null || perPickApp(app) ? '' : `<div><dt>Break even</dt><dd class="is-positive">${percent(threshold)}</dd></div>`}<div title="Best fair probability minus break-even among these lines, counting only lines with a known payout"><dt>Top edge</dt><dd${topEdge > 0 ? ' class="is-positive"' : ''}>${Number.isFinite(topEdge) ? signed(topEdge) : '—'}</dd></div>${contestMode() ? '' : `<div><dt>Picks</dt><dd>${choices().length}/${type.size}</dd></div>`}</dl>${hidden.size ? `<button type="button" data-dfs-restore class="dfs-text-button">Show ${hidden.size} hidden</button>` : ''}<label class="dfs-sort-label">Sort by <select size="1" id="dfs-sort" aria-label="Sort DFS props"><option value="edge" ${sort==='edge' ? 'selected' : ''}>Edge vs break-even</option><option value="probability" ${sort==='probability' ? 'selected' : ''}>Fair probability</option><option value="player" ${sort==='player' ? 'selected' : ''}>Player name</option></select></label><button type="button" class="dfs-text-button" data-add="dfs">Add prop</button></div></div>`;
    return `<div class="dfs-workspace evb-board"><div class="dfs-controls"><label class="dfs-filter dfs-app-filter"><span>DFS app</span><span class="dfs-app-value">${platform ? brand(platform) : ''}<select size="1" id="dfs-platform" aria-label="DFS app"><option value="" ${platform ? '' : 'selected'}>All apps</option>${platforms.map(app => `<option ${app===platform ? 'selected' : ''}>${esc(app)}</option>`).join('')}</select></span></label><div class="dfs-slip-type" ${contestMode() ? 'hidden' : ''}><button type="button" class="dfs-slip-trigger" data-dfs-menu aria-expanded="${menuOpen}" aria-controls="dfs-slip-options"><span>Slip Type<strong>${type.size} Pick${type.kind ? ' '+esc(type.kind) : ''}${perPickApp(app) ? ' · Per-pick payouts' : `${type.rules ? ` · ${Number(type.rules.at(-1))}×` : ''}${threshold == null ? '' : ` · BE ${percent(threshold)}`}`}</strong></span>${icon('down')}</button>${menuOpen ? `<div class="dfs-slip-options" id="dfs-slip-options" role="group" aria-label="Slip types">${types().map(option => { const value = breakEven(option.rules); return `<button type="button" data-dfs-type="${option.id}" aria-pressed="${option.id===slipType}"><span><strong>${option.size} Pick</strong> ${esc(option.kind)}${perPickApp(app) ? ' · per-pick' : option.rules ? ` · ${Number(option.rules.at(-1))}×` : ''}</span><small>Break Even: <b>${perPickApp(app) ? '1 ÷ each pick’s multiplier' : value == null ? 'Payout rules needed' : percent(value)}</b></small>${option.id===slipType ? icon('check') : ''}</button>`; }).join('')}<p>${esc(payoutNote)}</p></div>` : ''}</div><label class="dfs-filter"><span>Sport</span><select size="1" id="dfs-sport" aria-label="DFS sport"><option value="">All sports</option>${sports.map(value=>`<option ${value===filterSport ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="dfs-filter"><span>Line type</span><select size="1" id="dfs-line-type" aria-label="PrizePicks line type">${[['','All lines'],['standard','Standard'],['goblin','Goblin'],['demon','Demon'],['adjusted','Adjusted (Dabble)']].map(([value,label])=>`<option value="${value}" ${value===lineType ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="dfs-filter"><span>Market</span><select size="1" id="dfs-market" aria-label="DFS market"><option value="">All markets</option>${markets.map(value=>`<option ${value===market ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="dfs-search">${icon('search')}<input id="dfs-search" type="search" placeholder="Search players or teams" value="${esc(query)}" aria-label="Search DFS players or teams"></label></div>${platformFilters()}${summary}<p class="dfs-feedback" role="status" ${feedback ? '' : 'hidden'}>${esc(feedback)}</p><div class="dfs-layout"><section class="dfs-prop-list" aria-label="DFS player props">${hitNote}${rows.length ? table(rows) : preview && workspace.dfsLoading ? '<div class="dfs-empty-results" aria-busy="true"><h2>Loading DFS lines…</h2><p>Reading PrizePicks, Underdog and other pick&#39;em lines from the quote feed.</p></div>' : preview ? '<div class="dfs-empty-results"><h2>No DFS lines in the quote feed yet</h2><p>Picks appear here when the quote feed sends PrizePicks, Underdog, Sleeper or other pick&#39;em lines. You can also add props yourself.</p></div>' : platform && !appCounts.has(platform) ? `<div class="dfs-empty-results"><h2>No ${esc(platform)} lines in the quote feed right now</h2><p>${esc(platform)} lines appear here when the quote feed sends them. You can also add props yourself.</p><button type="button" data-dfs-all-apps>Show all apps</button></div>` : '<div class="dfs-empty-results"><h2>No matching props</h2><p>Add player research or try another sport, market or search.</p><button type="button" data-dfs-reset>Clear filters</button></div>'}</section>${slip()}</div>${slipDock()}<p class="dfs-method-note">Best book price pairs the DFS line with the best recorded sportsbook price for that side at the exact same line. Fair probability: each sportsbook's Over and Under odds for the same player, market and line are converted to implied probabilities and devigged (${esc(current().devigMethod || 'multiplicative')}), then averaged across books. Edge is fair probability minus the app's break-even (BE) for the selected slip type. Expand a row to see each sportsbook's odds and each DFS app's line; a dash means unavailable.</p></div>`;
  }
  function click(event) {
    if (menuOpen && !event.target.closest('.dfs-slip-type')) {
      menuOpen = false;
      document.querySelector('#dfs-slip-options')?.remove();
      document.querySelector('[data-dfs-menu]')?.setAttribute('aria-expanded','false');
    }
    const target = event.target.closest('button');
    if (!target) {
      // Clicking anywhere on a prop row (outside its controls) opens the platform comparison, like the Positive EV board.
      const rowNode = event.target.closest('.evb-row[data-dfs-row]');
      if (!rowNode || event.target.closest('a,input,select,label,summary')) return false;
      const id = rowNode.dataset.dfsRow;
      expanded = expanded === id ? '' : id;
      repaint(`[data-dfs-expand="${CSS.escape(id)}"]`);
      return true;
    }
    if (target.hasAttribute('data-dfs-review')) {
      browsePosition = globalThis.window?.scrollY || 0;
      const panel = document.querySelector('.dfs-slip-panel');
      panel?.scrollIntoView({block:'start',behavior:'instant'});panel?.focus({preventScroll:true});
    }
    else if (target.hasAttribute('data-dfs-return')) { globalThis.window?.scrollTo?.({top:browsePosition,behavior:'instant'});document.querySelector('[data-dfs-review]')?.focus({preventScroll:true}); }
    else if (target.hasAttribute('data-dfs-menu')) { menuOpen = !menuOpen; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsType) { slipType = target.dataset.dfsType; menuOpen = false; feedback = ''; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsExpand) { const id=target.dataset.dfsExpand; expanded=expanded===id ? '' : id; repaint(`[data-dfs-expand="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsPick) { const id=target.dataset.dfsPick; togglePick(id); repaint(`[data-dfs-pick="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsTogglePick) { const id=target.dataset.dfsTogglePick; togglePick(id); repaint(`[data-dfs-toggle-pick="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsHide) { hidden.add(target.dataset.dfsHide); feedback='Prop hidden. Use Show hidden to restore it.'; repaint(); }
    else if (target.hasAttribute('data-dfs-restore')) { hidden.clear(); feedback=''; repaint(); }
    else if (target.dataset.dfsRemove) { selected.delete(target.dataset.dfsRemove); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-clear')) { selected.clear(); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-more')) { rowLimit += ROW_PAGE; repaint('[data-dfs-more]'); }
    else if (target.hasAttribute('data-dfs-reset')) { filterSport='';market='';lineType='';query='';hidden.clear();rowLimit=ROW_PAGE;repaint(); }
    else if (target.hasAttribute('data-dfs-all-apps')) { platform='';slipAppName='';selected.clear();expanded='';feedback='';rowLimit=ROW_PAGE;repaint('#dfs-platform'); }
    else if (target.hasAttribute('data-dfs-saved-all')) { allSaved=!allSaved; repaint('[data-dfs-saved-all]'); }
    else if (target.dataset.dfsDeleteSlip) {
      const id=target.dataset.dfsDeleteSlip;
      feedback='Saved slip deleted.';
      if (onDeleteSlip) onDeleteSlip(id);
      else { const slips=current().slips, index=Array.isArray(slips) ? slips.findIndex(saved => saved?.id===id) : -1; if (index>=0) slips.splice(index,1); repaint(); }
    }
    else if (target.hasAttribute('data-dfs-refresh')) { feedback='Comparison refreshed from the available DFS lines.'; repaint('[data-dfs-refresh]'); }
    else if (target.dataset.dfsComparePlatform) { const app=target.dataset.dfsComparePlatform; excludedPlatforms.has(app) ? excludedPlatforms.delete(app) : excludedPlatforms.add(app); repaint(`[data-dfs-compare-platform="${CSS.escape(app)}"]`); }
    else if (target.hasAttribute('data-dfs-all-platforms')) { excludedPlatforms.clear(); repaint('[data-dfs-all-platforms]'); }
    else if (target.hasAttribute('data-dfs-configure')) {
      if (choices().length === chosenType().size) onConfigure?.(choices());
    }
    else if (target.hasAttribute('data-dfs-save')) {
      const type=chosenType(), picks=choices(), factor=slipFactor(picks);
      if (picks.length!==type.size || !type.rules || picks.some(partGame)) return true;
      if (!Number.isFinite(factor)) { feedback=`Goblin and demon picks change the payout; the feed sent no multiplier for ${picks.filter(item => !payoutKnown(item)).map(label).join(', ')}.`; repaint(); return true; }
      feedback='Slip saved. It’s listed under Saved slips in the slip panel.';
      // The saved payout table is the one the slip was priced with: scaled by its goblin and demon multipliers.
      onSave({id:crypto.randomUUID(),app:slipApp(),picks:picks.map(item=>({...item})),paytable:type.rules.map(value=>Number(value)*factor),payoutFactor:factor,stake:entry,ts:new Date().toISOString(),source:'manual'});
    } else return false;
    return true;
  }
  function change(event) {
    const target=event.target;
    if (['dfs-platform','dfs-sport','dfs-market','dfs-line-type','dfs-sort'].includes(target.id)) rowLimit=ROW_PAGE;
    if (target.id==='dfs-platform') {platform=target.value;slipAppName='';selected.clear();hidden.clear();expanded='';feedback='';repaint('#dfs-platform');}
    else if (target.id==='dfs-sport') {filterSport=target.value;market='';if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('dfs-sport-change',{detail:{sport:target.value}}));repaint('#dfs-sport');}
    else if (target.id==='dfs-market') {market=target.value;repaint('#dfs-market');}
    else if (target.id==='dfs-line-type') {lineType=target.value;repaint('#dfs-line-type');}
    else if (target.id==='dfs-sort') {sort=target.value;repaint('#dfs-sort');}
    else if (target.id==='dfs-entry') {const value=Number(target.value);if(!Number.isFinite(value)||value<MIN_ENTRY){feedback=`Enter an entry amount of at least $${MIN_ENTRY}.`;}else{entry=value;feedback='';}repaint('#dfs-entry');}
    else return false;
    return true;
  }
  // Typing re-filters ~30k lines: wait for a pause instead of rebuilding the board on every key.
  let searchTimer = 0;
  function input(event) {
    if(event.target.id!=='dfs-search') return false;
    query=event.target.value;rowLimit=ROW_PAGE;
    clearTimeout(searchTimer);
    searchTimer=setTimeout(() => {
      const before=document.querySelector('#dfs-search'), cursor=before?.selectionStart;
      redraw();
      const node=document.querySelector('#dfs-search');
      if (node) { node.focus(); if (cursor != null) node.setSelectionRange(cursor,cursor); }
    }, 200);
    return true;
  }
  function keydown(event) { if(event.key==='Escape' && menuOpen) {menuOpen=false;repaint('[data-dfs-menu]');return true;}return false; }
  return {render,click,change,input,keydown};
}
