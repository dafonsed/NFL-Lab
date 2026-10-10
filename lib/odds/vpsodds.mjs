// Second quote source: the VPS harvester at VPS_ODDS_URL (http://209.145.53.103:3456 by default) that
// exposes /all?format=txt, a plain-text dump of ~197 harvested endpoints. The screen sections
// (nfl_ml, nfl_rec, mlb_tr, …) carry per-book price pairs for every market, so each row expands into
// up to 2*(books) feed records matching lib/odds/sportwizzard.mjs: the same shape the normalizer reads
// from the main feed, so pricing/EV/arb/DFS all pick them up unchanged. mergeSnapshots keeps groups
// where one source has more lines, and the normalizer dedupes exact (book|event|period|market|line|side)
// collisions, so adding this feed never counts the same book's price twice.
//
// Configuration (server only):
//   VPS_ODDS_URL      the harvester's origin (defaults to http://209.145.53.103:3456)
//   VPS_ODDS_ENABLED  0 turns the source off; it is on by default when a URL is set
//
// Left out on purpose: ev_*, arb_*, smart_*, cmp_*, fan_* product sections. They are at most 15 curated
// rows per sport, already derivable from the screen sections' prices and the engine's own analytics.
import { stableHash } from '../../public/market-identity.js';

export const VPS_ODDS_BASE = 'http://209.145.53.103:3456';

export function vpsOddsConfig(env = process.env) {
  const enabled = String(env.VPS_ODDS_ENABLED || '').trim();
  if (enabled === '0') return null;
  // Opt-in by URL: the harvester lives on one specific host; without VPS_ODDS_URL set, the source is
  // off (so test stand-ins don't accidentally hit the real IP, and nothing fetches it from CI).
  const raw = String(env.VPS_ODDS_URL || '').trim();
  if (!raw) return null;
  let base;
  try { base = new URL(raw); } catch { return null; }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
  return { base };
}

// Section-key prefix → sport code (public/sport-names.js). Non-US baseball (npb) and futures
// prefixes (fut, fut_al, fut_nl, …) are skipped: no two-way market for pricing.
const SPORT_MAP = {
  nfl: 'nfl', ncaaf: 'ncaaf', nba: 'nba', wnba: 'wnba',
  nhl: 'nhl', mlb: 'mlb', soc: 'soccer', ten: 'tennis',
  cfl: 'cfl', ufc: 'mma',
};
function sportFromKey(key) {
  const prefix = String(key || '').split('_')[0];
  return SPORT_MAP[prefix] || null;
}

// A market name's trailing "- 1st Half" names the period: the normalizer and DFS use these codes.
const PERIOD_MAP = {
  '1st half': '1h', '2nd half': '2h',
  '1st quarter': '1q', '2nd quarter': '2q', '3rd quarter': '3q', '4th quarter': '4q',
  '1st period': '1p', '2nd period': '2p', '3rd period': '3p',
  'first 5 innings': 'f5',
};
function splitPeriod(name) {
  const match = /^(.+?)\s*-\s*([^-]+)$/.exec(String(name || '').trim());
  if (!match) return { market: String(name || '').trim(), period: 'full' };
  const period = PERIOD_MAP[match[2].trim().toLowerCase()];
  if (!period) return { market: String(name || '').trim(), period: 'full' };
  return { market: match[1].trim(), period };
}

// Known two-way game markets. Spread aliases (puck line, run line) all read as 'spread'.
const GAME_MARKET = {
  moneyline: { type: 'moneyline' },
  'point spread': { type: 'spread' },
  'puck line': { type: 'spread' },
  'run line': { type: 'spread' },
  'total points': { type: 'total' },
  'total goals': { type: 'total' },
  'total runs': { type: 'total' },
  'total games': { type: 'total' },
  'total corners': { type: 'total' },
  'total cards': { type: 'total' },
  '3 way moneyline': { type: 'three-way' },
};
const TEAM_TOTAL_MARKETS = new Set(['team total points', 'team total goals', 'team total runs']);
const GAME_PROP_TOTALS = new Set(['total fgs', 'total punts', 'total tds']);

// Book name translations so VPS prices land under the same book as SportWizzard's: the merge dedups
// by (book, sport, prop|game) group, and canonicalPlatform (public/platform-catalog.js) folds the rest.
const BOOK_NAMES = {
  Hardrock: 'Hard Rock Bet',
  BallyBet: 'Bally Bet',
  theScore: 'theScore Bet',
  DraftKings6: 'DraftKings Pick6',
  BoomFantasy: 'Boom Fantasy',
  NoVigApp: 'Novig',
  Prophet: 'ProphetX',
  Betr: 'Betr Picks',
  Sleeper: 'Sleeper Picks',
  Underdog: 'Underdog Fantasy',
  PolymarketUS: 'Polymarket',
};
// (Alt) columns carry adjusted multipliers that aren't flat-priceable; the DFS board can't use them
// (public/dfs-workspace.js underdogFiftyFifty, lib/odds/sportwizzard.mjs ADJUSTED_APPS), so those
// columns are left out.
const SKIP_BOOK = book => /\s*\(alt\)$/i.test(String(book || ''));

/** "Away @ Home" → { away, home }, or null when the format doesn't match. */
function teamSides(row) {
  const parts = String(row?.event ?? '').split(' @ ');
  if (parts.length !== 2) return null;
  const away = parts[0].trim(), home = parts[1].trim();
  return away && home ? { away, home } : null;
}
function matchTeamSide(name, sides) {
  if (!sides) return null;
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === sides.home.toLowerCase()) return 'home';
  if (normalized === sides.away.toLowerCase()) return 'away';
  return null;
}
function parseLabel(label) {
  const text = String(label || '').trim();
  const prop = /^(.*?)\s+(Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/i.exec(text);
  if (prop) return { kind: 'prop', name: prop[1].trim(), side: prop[2].toLowerCase(), line: Number(prop[3]) };
  const total = /^(Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/i.exec(text);
  if (total) return { kind: 'total', side: total[1].toLowerCase(), line: Number(total[2]) };
  const spread = /^(.*?)\s+([+-]\d+(?:\.\d+)?)$/.exec(text);
  if (spread) return { kind: 'spread', name: spread[1].trim(), line: Number(spread[2]) };
  if (/^(yes|no)$/i.test(text)) return { kind: 'yesno', side: text.toLowerCase() };
  return { kind: 'name', name: text };
}

/** The /all?format=txt body → { harvestedAt, sections }, each { key, query, rows }. */
export function parseAllTxt(text) {
  const sections = [];
  const lines = String(text || '').split(/\r?\n/);
  let harvestedAt = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const start = /^--- \[([A-Za-z0-9_]+)\]\s*(\{.*?\})?\s*---$/.exec(line);
    if (!start) {
      const hv = /^Harvested:\s*(.+)$/.exec(line.trim());
      if (hv) harvestedAt = hv[1].trim();
      continue;
    }
    let query = {};
    try { if (start[2]) query = JSON.parse(start[2]); } catch { continue; }
    const rows = [];
    while (i + 1 < lines.length && !/^--- \[/.test(lines[i + 1])) {
      i += 1;
      const trimmed = lines[i].trim();
      if (!trimmed || /^Total:/.test(trimmed) || !trimmed.startsWith('{')) continue;
      try { rows.push(JSON.parse(trimmed)); } catch { /* malformed row */ }
    }
    sections.push({ key: start[1], query, rows });
  }
  return { harvestedAt, sections };
}

const AMERICAN_MIN = 100;
const stampedBookNames = book => BOOK_NAMES[book] || String(book || '').trim();

/** One screen row → up to 2*(books) feed records (one per book-side pair). */
function screenRecords(section, row, sport, harvestedAt, droppedReasons) {
  const marketField = String(section.query?.market || '').trim();
  if (!marketField || section.query?.product !== 'screen') return [];
  const { market: baseMarket, period } = splitPeriod(marketField);
  const key = baseMarket.toLowerCase();
  const sides = teamSides(row);
  const labels = Array.isArray(row.labels) ? row.labels.slice(0, 2) : [];
  if (labels.length !== 2 || !labels[0] || !labels[1]) {
    droppedReasons.badLabels = (droppedReasons.badLabels || 0) + 1;
    return [];
  }
  const parsed = labels.map(parseLabel);
  const bookOdds = row.odds && typeof row.odds === 'object' ? row.odds : {};
  if (!Object.keys(bookOdds).length) return [];
  const idTail = String(row.id || '').split(':').slice(0, 5).join(':');
  const eventId = idTail ? `vps-${idTail}` : `vps-${stableHash(String(row.event || '') + '|' + String(row.start || ''))}`;
  const event = sides ? `${sides.away} @ ${sides.home}` : String(row.event || '').trim();
  const startTime = typeof row.start === 'string' ? row.start : '';
  const base = {
    sport, event, eventId, startTime, ts: harvestedAt, live: false, source: 'vps',
    ...(period !== 'full' ? { period } : {}),
  };
  const sideFields = new Array(2);
  const gameMarket = GAME_MARKET[key];
  for (let i = 0; i < 2; i += 1) {
    const parsedSide = parsed[i];
    if (gameMarket?.type === 'moneyline') {
      const side = sides ? matchTeamSide(parsedSide.name || labels[i], sides) : null;
      if (!side) { droppedReasons.unmatchedSide = (droppedReasons.unmatchedSide || 0) + 1; return []; }
      sideFields[i] = { market: 'moneyline', type: 'moneyline', side, selection_name: sides[side] };
    } else if (gameMarket?.type === 'spread') {
      if (parsedSide.kind !== 'spread' || !sides) { droppedReasons.badSpread = (droppedReasons.badSpread || 0) + 1; return []; }
      const side = matchTeamSide(parsedSide.name, sides);
      if (!side) { droppedReasons.unmatchedSide = (droppedReasons.unmatchedSide || 0) + 1; return []; }
      sideFields[i] = {
        market: 'spread', type: 'spread', side, line: parsedSide.line,
        selection_name: `${sides[side]} ${parsedSide.line > 0 ? '+' : ''}${parsedSide.line}`,
      };
    } else if (gameMarket?.type === 'total') {
      if (parsedSide.kind !== 'total') { droppedReasons.badTotal = (droppedReasons.badTotal || 0) + 1; return []; }
      sideFields[i] = {
        market: 'total', type: 'total', side: parsedSide.side, line: parsedSide.line,
        selection_name: `${parsedSide.side === 'over' ? 'Over' : 'Under'} ${parsedSide.line}`,
      };
    } else if (TEAM_TOTAL_MARKETS.has(key)) {
      if (parsedSide.kind !== 'prop') { droppedReasons.badTeamTotal = (droppedReasons.badTeamTotal || 0) + 1; return []; }
      const team = parsedSide.name;
      sideFields[i] = {
        market: `${team} Team Total`, type: 'game-prop', side: parsedSide.side, line: parsedSide.line, team,
        selection_name: `${parsedSide.side === 'over' ? 'Over' : 'Under'} ${parsedSide.line}`,
      };
    } else if (GAME_PROP_TOTALS.has(key)) {
      if (parsedSide.kind !== 'total') { droppedReasons.badGameProp = (droppedReasons.badGameProp || 0) + 1; return []; }
      sideFields[i] = {
        market: baseMarket, type: 'game-prop', side: parsedSide.side, line: parsedSide.line,
        selection_name: `${parsedSide.side === 'over' ? 'Over' : 'Under'} ${parsedSide.line}`,
      };
    } else if (/^player\s+/i.test(baseMarket) || /^pitcher\s+/i.test(baseMarket)) {
      if (parsedSide.kind !== 'prop') { droppedReasons.badProp = (droppedReasons.badProp || 0) + 1; return []; }
      const stat = baseMarket.replace(/^player\s+/i, '');
      const team = typeof row.team === 'string' ? row.team.trim() : '';
      sideFields[i] = {
        market: stat, type: 'prop', side: parsedSide.side, line: parsedSide.line,
        player: parsedSide.name, selection_name: `${parsedSide.side === 'over' ? 'Over' : 'Under'} ${parsedSide.line}`,
        ...(team ? { team } : {}),
      };
    } else {
      droppedReasons.unknownMarket = (droppedReasons.unknownMarket || 0) + 1;
      return [];
    }
  }
  const out = [];
  for (const [rawBook, pair] of Object.entries(bookOdds)) {
    if (SKIP_BOOK(rawBook) || !Array.isArray(pair)) continue;
    const book = stampedBookNames(rawBook);
    if (!book) continue;
    for (let i = 0; i < 2; i += 1) {
      const odds = Number(pair[i]);
      if (!Number.isFinite(odds) || odds === 0 || (odds > -AMERICAN_MIN && odds < AMERICAN_MIN)) continue;
      const fields = sideFields[i];
      const id = `vps:${stableHash([eventId, book, fields.market, fields.player || '', fields.line ?? '', fields.side, period].join('|'))}`;
      out.push({ id, ...base, book, odds, ...fields });
    }
  }
  return out;
}

const REQUEST_TIMEOUT_MS = 20_000;
async function fetchAll(config, fetcher) {
  const url = new URL('/all?format=txt', config.base);
  const response = await fetcher(url, {
    headers: { Accept: 'text/plain' },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel?.();
    throw new Error(`VPS odds answered HTTP ${response.status}.`);
  }
  return response.text();
}

/** The VPS harvester → a quote-feed snapshot: { base, at, quotes, dropped, stale, warmingUp }. */
export async function buildVpsSnapshot(config, fetcher = fetch, { now = Date.now() } = {}) {
  const text = await fetchAll(config, fetcher);
  const { harvestedAt, sections } = parseAllTxt(text);
  const stamp = harvestedAt || new Date(now).toISOString();
  const quotes = [];
  const droppedReasons = {};
  let dropped = 0;
  for (const section of sections) {
    const sport = sportFromKey(section.key);
    if (!sport) { dropped += section.rows.length; droppedReasons.unknownSport = (droppedReasons.unknownSport || 0) + section.rows.length; continue; }
    for (const row of section.rows) {
      const records = screenRecords(section, row, sport, stamp, droppedReasons);
      if (!records.length) dropped += 1; else quotes.push(...records);
    }
  }
  return { base: config.base.href, at: now, quotes, dropped, droppedReasons, stale: false, warmingUp: false };
}

// One fetch in flight per fetcher. A board under TTL_MS is reused; up to SERVE_STALE_MS it is served
// at once (marked stale past MARK_STALE_MS) while a refresh runs. Mirrors sportwizzard.mjs.
const TTL_MS = 30_000, MARK_STALE_MS = 3 * 60_000, SERVE_STALE_MS = 10 * 60_000;
const boards = new WeakMap();

export function vpsOddsSnapshot(config, fetcher = fetch, { sport = '' } = {}) {
  let perFetcher = boards.get(fetcher);
  if (!perFetcher) { perFetcher = new Map(); boards.set(fetcher, perFetcher); }
  const key = `${config.base.href}|${String(sport || '').toLowerCase()}`;
  const entry = perFetcher.get(key) || { good: null, refresh: null };
  perFetcher.set(key, entry);
  const now = Date.now();
  const age = entry.good ? now - entry.good.at : Infinity;
  if (age < TTL_MS) return Promise.resolve(entry.good);
  if (!entry.refresh) {
    entry.refresh = buildVpsSnapshot(config, fetcher).then(snapshot => {
      const narrowed = sport
        ? { ...snapshot, quotes: snapshot.quotes.filter(quote => quote.sport === String(sport).toLowerCase()) }
        : snapshot;
      entry.good = narrowed;
      return narrowed;
    }).finally(() => { entry.refresh = null; });
    entry.refresh.catch(error => console.error('[vps-odds] Board refresh failed:', error?.message || error));
  }
  if (entry.good && age < SERVE_STALE_MS) {
    if (age < MARK_STALE_MS) return Promise.resolve(entry.good);
    return Promise.resolve({ ...entry.good, stale: true });
  }
  return entry.refresh;
}
