// SportWizzard (https://sportwizzard.com/developers) as a quote source for the odds service.
//
// Its /api/v1/odds feed is one flat row per price per book. Rows are converted into the quote feed's
// record shape (the same records lib/odds/normalize.mjs reads from the main feed), so pricing, EV,
// arbitrage and every tool work on them unchanged. The browser never calls SportWizzard; the key stays
// on the server.
//
// Taken: full-game moneylines, three-way moneylines, spreads, totals, Over/Under player props and "N+"
// player milestones (as Over N−0.5), plus pick'em apps' player lines for DFS (see DFS_APPS). Kalshi moneylines get Kalshi's own
// order-book depth (lib/odds/kalshi.mjs) for Smart Money.
// Left out on purpose:
//   - futures (marketScope): no game, and no two-way fair price;
//   - partial periods (1H, 1P, 1INN ...): the engine keys markets by game, so they would mix with full-game lines;
//   - yes/no, first scorer, correct score, and milestones that don't name their threshold ("Yes");
//   - pick'em lines with a changed payout (goblins, boosts) and suspended lines.
//
// Configuration (server only, set in the hosting environment):
//   SPORTWIZZARD_API_KEY   key from the API Keys tab of a SportWizzard account (sent as X-Api-Key)
//   SPORTWIZZARD_ENABLED   0 turns the source off; it is on by default (the API doesn't require a key today)
//   SPORTWIZZARD_API_URL   optional, defaults to https://api.sportwizzard.com
//   KALSHI_DEPTH           0 turns off the Kalshi depth lookup (on by default; Kalshi's market data needs no key)

import { kalshiDepthEnabled, kalshiMarkets, withKalshiDepth } from './kalshi.mjs';
import { propMarket } from './normalize.mjs';

export const SPORTWIZZARD_BASE = 'https://api.sportwizzard.com';

/** The source's settings from the environment, or null when it is off. */
export function sportWizzardConfig(env = process.env) {
  const apiKey = String(env.SPORTWIZZARD_API_KEY || '').trim(), enabled = String(env.SPORTWIZZARD_ENABLED || '').trim();
  // On unless turned off: with the OddsJam bridge gone it is the site's quote source, and production went
  // without odds on 9 Oct 2026 because the hosting environment never set SPORTWIZZARD_ENABLED.
  if (enabled === '0') return null;
  let base;
  try { base = new URL(env.SPORTWIZZARD_API_URL || SPORTWIZZARD_BASE); } catch { return null; }
  if (base.protocol !== 'https:') return null;
  return { base, apiKey, kalshi: kalshiDepthEnabled(env) };
}

// SportWizzard league → the feed's sport code (and league label for soccer competitions the sport names
// don't know). Esports and golf outrights are left out.
const LEAGUES = {
  nfl: ['nfl'], mlb: ['mlb'], nba: ['nba'], wnba: ['wnba'], nhl: ['nhl'], cfb: ['ncaaf'], cbb: ['ncaab'],
  mma: ['mma'], tennis: ['tennis'],
  epl: ['epl'], laliga: ['laliga'], bundesliga: ['bundesliga'], seriea: ['seriea'], ligue1: ['ligue1'], mls: ['mls'], ucl: ['ucl'],
  eredivisie: ['soccer', 'Eredivisie'], 'primeira-liga': ['soccer', 'Primeira Liga'], 'liga-mx': ['soccer', 'Liga MX'],
  'brazil-sa': ['soccer', 'Brasileirão Série A'], 'brazil-sb': ['soccer', 'Brasileirão Série B'],
};
// The site's sport names (public/sport-names.js) → SportWizzard leagues, for one-sport reads.
const SPORT_LEAGUES = { nfl: ['nfl'], mlb: ['mlb'], nba: ['nba'], wnba: ['wnba'], nhl: ['nhl'], ncaaf: ['cfb'], ncaab: ['cbb'], mma: ['mma'], tennis: ['tennis'],
  soccer: ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'mls', 'ucl', 'eredivisie', 'primeira-liga', 'liga-mx', 'brazil-sa', 'brazil-sb'] };
// Book slugs the platform catalog doesn't already recognise.
const BOOK_NAMES = { 'betrivers-kambi': 'BetRivers', 'betr-ssb': 'Betr Sportsbook', dkpick6: 'DraftKings Pick6', 'underdog-pm': 'Underdog Predictions', hardrock: 'Hard Rock Bet', ballybet: 'Bally Bet', thescore: 'theScore Bet' };
const EXCHANGES = new Set(['prophetx', 'kalshi', 'polymarket', 'novig', 'underdog-pm']);
const GAME_MARKETS = 'MONEYLINE,MONEYLINE_3_WAY,SPREAD,TOTAL', PROP_MARKETS = 'PLAYER_TOTAL', MILESTONE_MARKETS = 'PLAYER_MILESTONE';
// SportWizzard files other markets under the game ones: Caesars' total field-goal yards and punts sit under
// TOTAL, regulation draw-no-bet under MONEYLINE, card counts under the three-way. Only the game's own
// result and score are taken. US football moneylines push on a tie, so draw-no-bet is the moneyline there.
const SOCCER = new Set(['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'mls', 'ucl', 'soccer']);
const GAME_TOTALS = { nfl: ['TOTAL_POINTS'], ncaaf: ['TOTAL_POINTS'], nba: ['TOTAL_POINTS'], wnba: ['TOTAL_POINTS'], ncaab: ['TOTAL_POINTS'],
  mlb: ['TOTAL_RUNS'], nhl: ['TOTAL_GOALS', 'TOTAL_POINTS'], mma: ['TOTAL_ROUNDS'], tennis: ['TOTAL_GAMES'] };
const takesSubtype = (market, subtype, sport) => {
  switch (market) {
    case 'MONEYLINE': return subtype === 'MONEYLINE' || (subtype === 'MONEYLINE_DRAW_NO_BET' && (sport === 'nfl' || sport === 'ncaaf'));
    case 'MONEYLINE_3_WAY': return subtype === 'MONEYLINE_3WAY' || subtype === 'THREE_WAY_RESULT';
    case 'SPREAD': return subtype === 'SPREAD';
    case 'TOTAL': return (SOCCER.has(sport) ? ['TOTAL_GOALS'] : GAME_TOTALS[sport] || []).includes(subtype);
    default: return market === 'PLAYER_TOTAL' || market === 'PLAYER_MILESTONE';
  }
};
// Pick'em apps → the platform catalog's names. PrizePicks, Dabble and Pick6 mark a standard line with a
// 1x multiplier; any other value is a goblin, demon or boost that changes the entry's payout, which the
// DFS board can't price from this feed, so those lines are left out. Sleeper and Chalkboard pay a
// multiplier per pick (an entry pays their product), so every line is taken with its multiplier as the
// pick's payoutMultiplier (public/dfs-workspace.js PER_PICK_APPS). HotStreak and WannaParlay aren't DFS apps here.
const DFS_APPS = { prizepicks: 'PrizePicks', dabble: 'Dabble', dkpick6: 'DraftKings Pick6', sleeper: 'Sleeper Picks', chalkboard: 'Chalkboard' };
const PER_PICK_APPS = new Set(['sleeper', 'chalkboard']);
const pickPayout = (slug, multiplier) => {
  const value = Number(multiplier);
  if (PER_PICK_APPS.has(slug)) return value > 1 && value < 100 ? { payoutMultiplier: value } : null;
  return multiplier == null || multiplier === '' || value === 1 ? {} : null;
};
const LIVE_STATUSES = new Set(['live', 'in_progress', 'inprogress', 'in-progress', 'started']);
const DONE_STATUSES = new Set(['final', 'closed', 'complete', 'completed', 'cancelled', 'canceled', 'postponed']);

const titleCase = value => value.toLowerCase().split(/[_\s]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
// Stat abbreviations keep their capitals ("FG Made", not "Fg Made").
const ACRONYMS = { Fg: 'FG', Fgs: 'FGs', Pat: 'PAT', Td: 'TD', Tds: 'TDs', Rbi: 'RBI', Rbis: 'RBIs', Sog: 'SOG' };
// PLAYER_TOTAL_REC_YARDS and the milestone's PLAYER_REC_YARDS name one stat.
const statName = subtype => titleCase(String(subtype || '').replace(/^PLAYER_(?:TOTAL_)?/, '')).split(' ').map(word => ACRONYMS[word] || word).join(' ');
const lineText = line => String(line);

/**
 * SportWizzard odds rows → quote-feed records. `events` maps an eventId to its /v1/events row (team
 * names, start time, status). Rows that can't be read as one of the taken markets are dropped.
 * @returns {{ records: object[], skipped: number }}
 */
export function toFeedRecords(rows, events) {
  const records = [];
  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const record = toFeedRecord(row, events.get(row?.eventId));
    if (record) records.push(record); else skipped += 1;
  }
  // A milestone the book also posts as an Over/Under prop is the same bet; two prices for one selection
  // would make the normalizer drop both, so the prop stands.
  // Stats are compared as the normalizer pairs them ("Rush Rec Yards" and "Rush + Rec Yards" are one stat).
  const selection = record => [record.eventId, record.book, propMarket(record.market, record.player), record.player, record.line, record.side].join('|');
  const props = new Set(records.filter(record => record.type === 'prop' && !record.fromMilestone).map(selection));
  const unique = records.filter(record => !record.fromMilestone || !props.has(selection(record))).map(({ fromMilestone, ...record }) => record);
  const main = mainLinesOnly(unique);
  return { records: main, skipped: skipped + records.length - main.length };
}

// Books post whole ladders (alternate spreads, totals and prop lines) under the same market, even with
// is_main. A ladder isn't one market: its far rungs aren't priced like the main line, and pairing every
// rung against every other made ~1M "middles" on one NFL board. Each book keeps the one line in each
// market whose two sides are priced closest to even (its main line); moneylines have no line.
// A prop line that isn't a book's main line (an alternate, or one priced on one side only) is kept as
// depthOnly: the engine and the page skip it, but DFS lists every book that posts a pick's exact line.
// Some books also tag quarter and half totals as the full game (a 7.5 "total" beside 44.5), so once three
// or more books post a game spread or total, a book's main line has to sit near their median.
const decimalOf = odds => odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
const LADDERED = new Set(['spread', 'total', 'prop']);
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const nearConsensus = (type, line, centre) => Math.abs(line - centre) <= (type === 'total' ? Math.max(0.2 * Math.abs(centre), 1.5) : Math.max(0.35 * Math.abs(centre), 2.5));
function mainLinesOnly(records) {
  const groups = new Map();
  const homeLine = record => record.type === 'spread' ? (record.side === 'home' ? record.line : -record.line) : record.line;
  for (const record of records) {
    if (!LADDERED.has(record.type) || record.odds == null) continue;
    const key = [record.eventId, record.book, record.type, record.market, record.player || ''].join('|');
    if (!groups.has(key)) groups.set(key, { type: record.type, market: [record.eventId, record.type, record.market].join('|'), lines: new Map() });
    const { lines } = groups.get(key), line = homeLine(record);
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push(record);
  }
  const mainLine = (lines, accept = () => true) => {
    let best = null, bestGap = Infinity;
    for (const [line, sides] of lines) {
      if (new Set(sides.map(record => record.side)).size !== 2 || !accept(line)) continue; // a one-sided rung can't be de-vigged
      const prices = sides.map(record => 1 / decimalOf(record.odds));
      const gap = Math.max(...prices) - Math.min(...prices);
      if (gap < bestGap) { bestGap = gap; best = line; }
    }
    return best;
  };
  const firstPick = new Map(), consensus = new Map();
  for (const [key, group] of groups) {
    const line = mainLine(group.lines);
    firstPick.set(key, line);
    if (line !== null && group.type !== 'prop') consensus.set(group.market, [...(consensus.get(group.market) || []), line]);
  }
  const keep = new Set();
  for (const [key, group] of groups) {
    const lines = consensus.get(group.market);
    const centre = group.type !== 'prop' && lines?.length >= 3 ? median(lines) : null;
    const best = centre === null ? firstPick.get(key) : mainLine(group.lines, line => nearConsensus(group.type, line, centre));
    if (best !== null) for (const record of group.lines.get(best)) keep.add(record);
  }
  return records.flatMap(record => !LADDERED.has(record.type) || record.odds == null || keep.has(record) ? [record]
    : record.type === 'prop' ? [{ ...record, depthOnly: true }] : []);
}

function toFeedRecord(row, event) {
  if (!row || typeof row !== 'object' || !event) return null;
  if (row.marketScope || row.suspended === true || String(row.period || '').toUpperCase() !== 'FULL') return null;
  const slug = String(row.sportsbook || '').trim().toLowerCase();
  if (DFS_APPS[slug] && (row.priceAmerican == null || row.priceAmerican === '')) return pickemRecord(row, event, slug);
  const odds = Number(row.priceAmerican);
  if (!Number.isFinite(odds) || odds === 0 || (odds > -100 && odds < 100)) return null;
  const league = LEAGUES[String(row.league || '').toLowerCase()];
  const home = String(event.homeTeamName || '').trim(), away = String(event.awayTeamName || '').trim();
  const status = String(event.status || '').toLowerCase();
  if (!league || !home || !away || DONE_STATUSES.has(status) || typeof row.updated !== 'string') return null;
  if (!slug) return null;
  const side = String(row.side || '').toLowerCase(), line = row.line == null || row.line === '' ? '' : Number(row.line);
  const base = {
    id: `sw:${row.id}`, sport: league[0], ...(league[1] ? { league: league[1] } : {}),
    event: `${away} @ ${home}`, eventId: `sw-${row.eventId}`, startTime: event.startTime || '',
    ts: row.updated, book: BOOK_NAMES[slug] || slug, odds, live: LIVE_STATUSES.has(status), exchange: EXCHANGES.has(slug),
    ...(EXCHANGES.has(slug) && Number.isFinite(row.liquidity) ? { liquidity: row.liquidity } : {}),
  };
  const market = String(row.market || '').toUpperCase();
  if (!takesSubtype(market, String(row.marketSubtype || '').toUpperCase(), league[0])) return null;
  switch (market) {
    case 'MONEYLINE':
      if (!['home', 'away'].includes(side)) return null;
      // SportWizzard's side is normalized; its selection label is often abbreviated ("CBJ Blue Jackets"),
      // so the selection is named with the event's own team name.
      return { ...base, market: 'moneyline', type: 'moneyline', side, selection_name: side === 'home' ? home : away };
    case 'MONEYLINE_3_WAY':
      if (!['home', 'away', 'draw'].includes(side)) return null;
      return { ...base, market: '1x2', type: 'three-way', side, outcomes: 3, selection_name: side === 'draw' ? 'Draw' : side === 'home' ? home : away };
    case 'SPREAD':
      if (!['home', 'away'].includes(side) || !Number.isFinite(line)) return null;
      return { ...base, market: 'spread', type: 'spread', side, line, selection_name: `${side === 'home' ? home : away} ${line > 0 ? '+' : ''}${line}` };
    case 'TOTAL':
      if (!['over', 'under'].includes(side) || !Number.isFinite(line)) return null;
      return { ...base, market: 'total', type: 'total', side, line, selection_name: `${side === 'over' ? 'Over' : 'Under'} ${lineText(line)}` };
    case 'PLAYER_TOTAL': {
      const player = String(row.playerName || '').trim(), stat = statName(row.marketSubtype);
      if (!['over', 'under'].includes(side) || !Number.isFinite(line) || !player || !stat) return null;
      return { ...base, market: stat, type: 'prop', player, side, line, selection_name: `${side === 'over' ? 'Over' : 'Under'} ${lineText(line)}`, ...(row.teamName ? { team: String(row.teamName) } : {}) };
    }
    case 'PLAYER_MILESTONE': {
      // "Christian Watson 15+" is Over 14.5 receiving yards; Fliff's "62.5+" is Over 62.5. A row that only says "Yes" has no threshold.
      const player = String(row.playerName || '').trim(), stat = statName(row.marketSubtype);
      const threshold = /(\d+(?:\.\d+)?)\+\s*$/.exec(String(row.selection || ''));
      const direction = side === 'yes' ? 'over' : side === 'no' ? 'under' : '';
      if (!threshold || !direction || !player || !stat) return null;
      const count = Number(threshold[1]), at = Number.isInteger(count) ? count - 0.5 : count;
      return { ...base, market: stat, type: 'prop', player, side: direction, line: at, selection_name: `${direction === 'over' ? 'Over' : 'Under'} ${lineText(at)}`, ...(row.teamName ? { team: String(row.teamName) } : {}), fromMilestone: true };
    }
    default:
      return null;
  }
}

// A pick'em line: no price, so the normalizer makes it a DFS pick and prices it against the sportsbooks'
// Over/Under props for the same player, stat and line.
function pickemRecord(row, event, slug) {
  const league = LEAGUES[String(row.league || '').toLowerCase()];
  const home = String(event.homeTeamName || '').trim(), away = String(event.awayTeamName || '').trim();
  const status = String(event.status || '').toLowerCase(), side = String(row.side || '').toLowerCase();
  const player = String(row.playerName || '').trim(), stat = statName(row.marketSubtype), line = Number(row.line);
  if (!league || !home || !away || DONE_STATUSES.has(status) || LIVE_STATUSES.has(status) || typeof row.updated !== 'string') return null;
  if (String(row.market || '').toUpperCase() !== 'PLAYER_TOTAL' || !['over', 'under'].includes(side) || !player || !stat || !(line > 0)) return null;
  const payout = pickPayout(slug, row.dfsMultiplier);
  if (!payout) return null;
  return {
    id: `sw:${row.id}`, sport: league[0], ...(league[1] ? { league: league[1] } : {}),
    event: `${away} @ ${home}`, eventId: `sw-${row.eventId}`, startTime: event.startTime || '', ts: row.updated,
    book: DFS_APPS[slug], type: 'prop', market: stat, player, side, line, live: false,
    selection_name: `${side === 'over' ? 'Over' : 'Under'} ${lineText(line)}`, ...(row.teamName ? { team: String(row.teamName) } : {}), ...payout,
  };
}

// ---- Fetching ----

const PAGE_LIMIT = 1000, MAX_PAGES = 80, REQUEST_TIMEOUT_MS = 20_000, CONCURRENCY = 4, MAX_EXTRA_EVENTS = 60;
// A board is fresh for TTL_MS (the page calls prices older than 60 s held over, and a refresh takes 10-30 s);
// up to SERVE_STALE_MS old it is still served at once while a refresh runs.
const TTL_MS = 30_000, MARK_STALE_MS = 3 * 60_000, SERVE_STALE_MS = 10 * 60_000, LEAGUES_TTL_MS = 3_600_000;

async function getJson(config, fetcher, path, params) {
  const url = new URL(path, config.base);
  for (const [key, value] of Object.entries(params || {})) if (value != null && value !== '') url.searchParams.set(key, value);
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel?.();
    throw Object.assign(new Error(`SportWizzard ${url.pathname} answered HTTP ${response.status}.`), { retryAfter: response.headers?.get?.('retry-after') });
  }
  const body = await response.json();
  if (!body || body.success === false || !Array.isArray(body.data)) throw new Error(`SportWizzard ${url.pathname} returned an unexpected body.`);
  return body;
}

async function allPages(config, fetcher, path, params) {
  const rows = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await getJson(config, fetcher, path, { ...params, limit: PAGE_LIMIT, cursor });
    rows.push(...body.data);
    if (!body.nextCursor) return rows;
    cursor = body.nextCursor;
  }
  console.error(`[sportwizzard] ${path} ${JSON.stringify(params)} stopped after ${MAX_PAGES} pages.`);
  return rows;
}

async function inPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index]); }
  }));
  return results;
}

const leagueCache = new WeakMap();
async function activeLeagues(config, fetcher) {
  const cached = leagueCache.get(fetcher);
  if (cached && Date.now() - cached.at < LEAGUES_TTL_MS) return cached.leagues;
  const body = await getJson(config, fetcher, '/api/v1/leagues');
  const leagues = body.data.map(value => String(typeof value === 'string' ? value : value?.id || '').toLowerCase()).filter(code => LEAGUES[code]);
  leagueCache.set(fetcher, { at: Date.now(), leagues });
  return leagues;
}

/** One league's records: its events (names, times, status) and its taken markets. */
async function leagueRecords(config, fetcher, league) {
  const [events, gameRows, propRows, milestoneRows, markets] = await Promise.all([
    allPages(config, fetcher, '/api/v1/events', { league }),
    // is_main: each book's primary game line only (alternate spread ladders are most of the rows and aren't priced here).
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: GAME_MARKETS, is_main: 'true' }),
    // Props with their alternates (a few percent more rows): a book's alternate at a DFS app's line still prices that pick.
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: PROP_MARKETS }),
    // Milestones are one-sided ladders: comparison lines for DFS and +EV, never a main line.
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: MILESTONE_MARKETS, is_main: 'true' }),
    config.kalshi ? kalshiMarkets(fetcher, league) : [],
  ]);
  const rows = [...gameRows, ...propRows, ...milestoneRows], byId = new Map(events.map(event => [event.id, event]));
  // /events lists the next few weeks; a game further out (NHL on 31 Dec, 9 Oct 2026) is fetched by id.
  const missing = [...new Set(rows.map(row => row.eventId).filter(id => id && !byId.has(id)))].slice(0, MAX_EXTRA_EVENTS);
  await inPool(missing, async id => {
    try { const body = await getJson(config, fetcher, `/api/v1/events/${encodeURIComponent(id)}`); if (body.data[0]?.id === id) byId.set(id, body.data[0]); }
    catch { /* the game's rows are skipped */ }
  });
  return toFeedRecords(withKalshiDepth(rows, markets), byId);
}

async function fetchBoard(config, fetcher, sport) {
  const active = await activeLeagues(config, fetcher);
  const wanted = sport ? (SPORT_LEAGUES[String(sport).toLowerCase()] || []).filter(code => active.includes(code)) : active;
  const results = await inPool(wanted, async league => {
    try { return await leagueRecords(config, fetcher, league); }
    catch (error) { console.error(`[sportwizzard] ${league}:`, error?.message || error); return { records: [], skipped: 0, failed: true }; }
  });
  if (wanted.length && results.every(result => result.failed)) throw new Error('Every SportWizzard league request failed.');
  const seen = new Set(), quotes = [];
  for (const { records } of results) for (const record of records) if (!seen.has(record.id)) { seen.add(record.id); quotes.push(record); }
  return { base: config.base.href, at: Date.now(), quotes, dropped: results.reduce((sum, result) => sum + result.skipped, 0), droppedReasons: {}, stale: false, warmingUp: false };
}

// One fetch in flight per fetcher and sport. A board younger than TTL_MS is reused; an older one (up to
// SERVE_STALE_MS) is served at once, marked stale, while a refresh runs in the background, so a visitor
// never waits for the 10-30 s refetch. With no usable board the request waits for the fetch.
const boards = new WeakMap();
/** The SportWizzard board as a quote-feed snapshot: { base, at, quotes, dropped, stale }. */
export function sportWizzardSnapshot(config, fetcher = fetch, { sport = '' } = {}) {
  let perFetcher = boards.get(fetcher);
  if (!perFetcher) { perFetcher = new Map(); boards.set(fetcher, perFetcher); }
  const key = `${config.base.href}|${String(sport).toLowerCase()}`;
  const entry = perFetcher.get(key) || { good: null, refresh: null };
  perFetcher.set(key, entry);
  const age = entry.good ? Date.now() - entry.good.at : Infinity;
  if (age < TTL_MS) return Promise.resolve(entry.good);
  if (!entry.refresh) {
    entry.refresh = fetchBoard(config, fetcher, sport).then(snapshot => { entry.good = snapshot; return snapshot; })
      .finally(() => { entry.refresh = null; });
    entry.refresh.catch(error => console.error('[sportwizzard] Board refresh failed:', error?.message || error));
  }
  // A board a few minutes old is still current for these markets; only an older one says so on the page.
  if (age < SERVE_STALE_MS) return Promise.resolve(age < MARK_STALE_MS ? entry.good : { ...entry.good, stale: true });
  return entry.refresh;
}

/**
 * The main feed's snapshot with SportWizzard's books added. The main feed stays primary: a book it
 * already carries isn't taken again from SportWizzard, so no book is counted twice in the fair price.
 * The result is the same object while both inputs are unchanged (the normalizer caches per array).
 */
const merged = new WeakMap();
export function mergeSnapshots(primary, extra) {
  if (!extra?.quotes?.length) return primary;
  if (!primary) return extra;
  const byExtra = merged.get(primary);
  if (byExtra?.extra === extra) return byExtra.snapshot;
  const key = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ownBooks = new Set(primary.quotes.map(quote => key(quote.book)));
  const added = extra.quotes.filter(quote => !ownBooks.has(key(quote.book)) && !ownBooks.has(key(BOOK_NAMES[String(quote.book).toLowerCase()])));
  const snapshot = { ...primary, quotes: added.length ? [...primary.quotes, ...added] : primary.quotes, stale: Boolean(primary.stale || extra.stale) };
  merged.set(primary, { extra, snapshot });
  return snapshot;
}
