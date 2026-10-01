// Turns the quote API's records into the quotes every +EV tool uses. The feed's `side` is often
// wrong, while `selection_name` names the real pick ("Over 44.5", "Dallas Cowboys +3.0"), so sides
// and spread lines are rebuilt from the selection. Records that can't be trusted are skipped and
// counted instead of failing the whole snapshot. Pure functions: the page and the tests share them.
import { decimal, marketKey } from './ev-core.js?v=3';
import { canonicalPlatform } from './platform-catalog.js';
import { matchedEventKey, dropInconsistentListings } from './ev-event-match.js?v=3';

const MAJOR = { NFL: 'NFL', MLB: 'MLB', NBA: 'NBA', WNBA: 'WNBA', NHL: 'NHL', SOCCER: 'Soccer' };
// `americanfootball` holds Central American soccer clubs in today's feed, so it is not relabeled
// as football; `other` and `unknown` carry no usable sport.
// Soccer league codes become Soccer, with the league kept (see SOCCER_LEAGUES).
const SOCCER_LEAGUES = { epl: 'EPL', mls: 'MLS', laliga: 'La Liga', seriea: 'Serie A', bundesliga: 'Bundesliga', ligue1: 'Ligue 1', ucl: 'Champions League', uel: 'Europa League' };
const SPORT_NAMES = { ...Object.fromEntries(Object.keys(SOCCER_LEAGUES).map(code => [code, 'Soccer'])), tennis: 'Tennis', mma: 'MMA', boxing: 'Boxing', snooker: 'Snooker', darts: 'Darts', golf: 'Golf', cricket: 'Cricket', rugby: 'Rugby', ncaaf: 'NCAAF', ncaab: 'NCAAB', americanfootball: 'Other', other: 'Other', unknown: 'Other' };
export const MARKET_NAMES = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total', 'three-way': 'Match result (1X2)', prop: 'Player prop', alternate: 'Alternate line', future: 'Future' };

export function sportName(raw) {
  const text = String(raw ?? '').trim();
  const upper = text.toUpperCase();
  if (MAJOR[upper]) return MAJOR[upper];
  const known = SPORT_NAMES[text.toLowerCase()];
  return known || (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');
}

/** A sport name from a URL or menu ("tennis" → "Tennis"), or '' when it isn't one the feed uses. */
export function knownSport(raw) {
  const text = String(raw ?? '').trim();
  return MAJOR[text.toUpperCase()] || SPORT_NAMES[text.toLowerCase()] || '';
}

/** "Away @ Home" → { away, home }; "A vs B" keeps the listed order as home/away. */
export function participantsOf(event) {
  const text = String(event ?? '');
  let parts = text.split(/\s+@\s+/);
  if (parts.length === 2) return { away: parts[0].trim(), home: parts[1].trim() };
  parts = text.split(/\s+(?:vs\.?|v)\s+/i);
  if (parts.length === 2) return { home: parts[0].trim(), away: parts[1].trim() };
  return null;
}

const STOP = new Set(['fc', 'sc', 'cf', 'ac', 'afc', 'the', 'de', 'and', 'club']);
const tokens = name => String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length >= 2 && !STOP.has(word));

/** Which participant a selection names, or null when it names neither or both equally. */
export function matchParticipant(name, participants) {
  if (!participants) return null;
  const away = new Set(tokens(participants.away)), home = new Set(tokens(participants.home));
  // Words both teams share ("Los", "Angeles", "Manchester") can't tell them apart.
  const words = tokens(name).filter(word => !(away.has(word) && home.has(word)));
  const score = side => words.filter(word => side.has(word)).length;
  const a = score(away), h = score(home);
  return a > h ? 'away' : h > a ? 'home' : null;
}

// A selection for a different bet: a bare yes/no/tie, a total, or a pair ("A/B", "Cowboys / Tie")
// inside a singles event. Whole-word checks only: "NO Saints" is New Orleans, not a "No" bet.
const otherMarket = (selection, event) => /^(yes|no|tie|draw)$/i.test(selection.trim()) || /^(over|under)\b/i.test(selection) || (selection.includes('/') && !String(event).includes('/'));
const signedTail = /^(.*?)\s*([+-]\d+(?:\.\d+)?)$/;

/**
 * Rebuilds side, line, type and the display selection from `selection_name`.
 * Returns null when the record prices something other than its market (a doubles pair under a
 * singles match, "Cowboys / Tie" under a moneyline) or names neither participant.
 */
export function repairSelection({ type, side, line, selection, event }) {
  const sel = String(selection ?? '').trim();
  const rawSide = String(side ?? '').trim().toLowerCase();
  if (!sel) return { type, side: rawSide, line, selection: '', verified: false };
  const participants = participantsOf(event);
  if (type === 'total') {
    const match = /^(over|under)\b\s*([+-]?\d+(?:\.\d+)?)?/i.exec(sel);
    if (!match) return null;
    return { type, side: match[1].toLowerCase(), line: match[2] != null ? Math.abs(Number(match[2])) : line, selection: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), verified: true };
  }
  if (type === 'moneyline' || type === 'three-way') {
    // Kambi soccer sends 1X2 outcomes as a two-way moneyline.
    const outcome = { '1': 'home', x: 'draw', '2': 'away', draw: 'draw' }[sel.toLowerCase()];
    if (outcome) return { type: 'three-way', side: outcome, line: '', selection: outcome === 'draw' ? 'Draw' : '', verified: true, outcomes: 3 };
    if (otherMarket(sel, event) || signedTail.test(sel)) return null;
    const matched = matchParticipant(sel, participants);
    if (!matched) return participants ? null : { type, side: rawSide, line, selection: sel, verified: false };
    return { type, side: matched, line: '', selection: sel, verified: true };
  }
  if (type === 'spread') {
    const tail = signedTail.exec(sel), name = tail ? tail[1] : sel;
    if (otherMarket(name, event)) return null;
    const matched = matchParticipant(name, participants);
    if (!matched) return participants ? null : { type, side: rawSide, line, selection: name, verified: false };
    // A signed number in the selection is the line from that team's view. Without one, the feed's
    // line is only trustworthy when its side already names the same team.
    if (tail) return { type, side: matched, line: Number(tail[2]), selection: name, verified: true };
    if (matched !== rawSide) return null;
    return { type, side: matched, line, selection: name, verified: true };
  }
  return { type, side: rawSide, line, selection: sel, verified: false };
}

const text = (raw, key) => typeof raw?.[key] === 'string' ? raw[key].trim() : '';

/** One API record → quote, or { skip: reason }. `clockOffsetMs` = server clock − this clock. */
export function normalizeRecord(raw, { clockOffsetMs = 0 } = {}) {
  const id = text(raw, 'id') || (Number.isSafeInteger(raw?.id) ? String(raw.id) : '');
  const odds = Number(raw?.odds), timestamp = text(raw, 'ts'), observed = Date.parse(timestamp);
  if (!id || !text(raw, 'sport') || !text(raw, 'event') || !text(raw, 'market') || !text(raw, 'side') || !text(raw, 'book') || !Number.isFinite(decimal(odds)) || !Number.isFinite(observed) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return { skip: 'invalid' };
  if (raw.live != null && typeof raw.live !== 'boolean' || raw.exchange != null && typeof raw.exchange !== 'boolean') return { skip: 'invalid' };
  if (raw.line != null && typeof raw.line !== 'number' && typeof raw.line !== 'string') return { skip: 'invalid' };
  let line = raw.line == null || raw.line === '' ? '' : Number(raw.line);
  if (line !== '' && !Number.isFinite(line)) return { skip: 'invalid' };
  let type = text(raw, 'market').toLowerCase() === '1x2' ? 'three-way' : text(raw, 'type').toLowerCase() || 'prop';
  let outcomes = raw.outcomes == null || raw.outcomes === '' ? (type === 'three-way' ? 3 : '') : Number(raw.outcomes);
  if (outcomes !== '' && (!Number.isInteger(outcomes) || outcomes < 2 || outcomes > 64)) return { skip: 'invalid' };
  const event = text(raw, 'event');
  const repaired = repairSelection({ type, side: text(raw, 'side'), line, selection: text(raw, 'selection_name'), event });
  if (!repaired) return { skip: 'mislabeled' };
  ({ type, line } = repaired);
  if (repaired.outcomes) outcomes = repaired.outcomes;
  if (['spread', 'total', 'alternate'].includes(type) && line === '') return { skip: 'invalid' };
  const sport = sportName(text(raw, 'sport'));
  const matched = matchedEventKey(sport, event);
  const eventId = matched ? `${sport}:${matched}` : text(raw, 'eventId') || `${sport}:${event.toLowerCase()}`;
  const liquidity = Number(raw.liquidity);
  const start = Date.parse(text(raw, 'startTime') || text(raw, 'start_time'));
  return {
    id: `local-api:${id}`, sport, event, market: text(raw, 'market'), displayMarket: MARKET_NAMES[type] || text(raw, 'market'),
    eventId, marketId: matched ? `${type}|${eventId}` : text(raw, 'marketId') || `${type}|${eventId}`,
    playerId: text(raw, 'playerId'), player: text(raw, 'player'), period: text(raw, 'period') || 'full', league: text(raw, 'league') || SOCCER_LEAGUES[text(raw, 'sport').toLowerCase()] || '',
    startTime: Number.isFinite(start) ? new Date(start).toISOString() : '',
    type, line, side: repaired.side, selection: repaired.selection, sideVerified: repaired.verified,
    book: canonicalPlatform(text(raw, 'book')), odds, outcomes, live: raw.live === true, exchange: raw.exchange === true,
    liquidity: Number.isFinite(liquidity) ? Math.max(0, liquidity) : 0,
    // Feed times use the server's clock; shift them onto this device's clock.
    ts: new Date(observed - clockOffsetMs).toISOString(), source: 'local-api',
    // Optional fields the tools already use when the feed sends them: links, limits, suspension.
    ...Object.fromEntries(['betUrl', 'eventUrl', 'prefillUrl'].filter(key => text(raw, key)).map(key => [key, text(raw, key)])),
    ...(raw.links && typeof raw.links === 'object' && !Array.isArray(raw.links) ? { links: raw.links } : {}),
    ...(Number(raw.maxStake) > 0 ? { maxStake: Number(raw.maxStake) } : {}), ...(raw.suspended === true ? { suspended: true } : {}),
  };
}

/**
 * Books on the same odds platform (BetRivers, Desert Diamond and Bally Bet run on Kambi) post the
 * same price on most markets. Counting each as its own opinion would triple one view in the fair
 * odds, so books that match on at least 70% of 30+ shared prices get one `priceFamily`.
 * Independent books match on 10-30% in the live feed.
 */
export function markPriceFamilies(quotes, { minShared = 30, minIdentical = 0.7 } = {}) {
  const prices = new Map();
  for (const quote of quotes) {
    const key = JSON.stringify([marketKey(quote), quote.side]);
    if (!prices.has(key)) prices.set(key, new Map());
    prices.get(key).set(quote.book, quote.odds);
  }
  const pairs = new Map();
  for (const books of prices.values()) {
    const list = [...books];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const key = [list[i][0], list[j][0]].sort().join('\u0000'), pair = pairs.get(key) || { shared: 0, same: 0 };
      pair.shared += 1; if (list[i][1] === list[j][1]) pair.same += 1;
      pairs.set(key, pair);
    }
  }
  const parent = new Map(), root = book => { while (parent.has(book) && parent.get(book) !== book) book = parent.get(book); return book; };
  for (const [key, pair] of pairs) {
    if (pair.shared < minShared || pair.same / pair.shared < minIdentical) continue;
    const [a, b] = key.split('\u0000').map(root);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  for (const quote of quotes) { const family = root(quote.book); if (family !== quote.book) quote.priceFamily = family; }
  return quotes;
}

/**
 * Books list many spread/total lines per game (Fanatics sends 80+). The line priced closest to
 * even money is the book's main line; the rest get `alt: true` so the odds screen can show main
 * lines first. The market type is unchanged, so the same line still compares across books.
 */
export function markAlternateLines(quotes) {
  const ladders = new Map();
  for (const quote of quotes) {
    if (!['spread', 'total'].includes(quote.type) || quote.player) continue;
    const key = JSON.stringify([quote.book, quote.eventId, quote.type, quote.period || 'full', Boolean(quote.live)]);
    if (!ladders.has(key)) ladders.set(key, new Map());
    const lines = ladders.get(key), line = quote.type === 'spread' && quote.side === 'away' ? -Number(quote.line) : Number(quote.line);
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push(quote);
  }
  const evenness = odds => { const value = Number(odds); return Math.abs((value > 0 ? 100 / (value + 100) : -value / (-value + 100)) - 0.5); };
  for (const lines of ladders.values()) {
    if (lines.size < 2) continue;
    let main = null, best = Infinity;
    for (const [line, group] of lines) { const score = group.reduce((sum, q) => sum + evenness(q.odds), 0) / group.length; if (score < best) { best = score; main = line; } }
    for (const [line, group] of lines) if (line !== main) group.forEach(quote => { quote.alt = true; });
  }
  return quotes;
}

const wholeMinute = ts => { const date = new Date(ts); return date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0; };

/**
 * Full snapshot → { quotes, skipped: { invalid, mislabeled, duplicate, started, inconsistent } }.
 * Some books send the game start as `ts`; for those, `ts` becomes the start time, the price's age
 * is unknown, and games that already started are dropped from pregame.
 */
export function normalizeFeed(records, { syncedAt = new Date().toISOString(), clockOffsetMs = 0 } = {}) {
  const skipped = { invalid: 0, mislabeled: 0, duplicate: 0, started: 0, inconsistent: 0 };
  const now = Date.parse(syncedAt);
  let quotes = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const result = normalizeRecord(raw, { clockOffsetMs });
    if (result.skip) skipped[result.skip] += 1; else quotes.push(result);
  }
  // A book whose timestamps are all on the minute, with some in the future, is sending start times.
  const byBook = new Map();
  for (const quote of quotes) { if (!byBook.has(quote.book)) byBook.set(quote.book, []); byBook.get(quote.book).push(quote); }
  const startTimeBooks = new Set([...byBook].filter(([, list]) => list.length >= 5
    && list.filter(q => wholeMinute(q.ts)).length / list.length >= 0.9 && list.some(q => Date.parse(q.ts) > now + 5 * 60_000)).map(([book]) => book));
  for (const quote of quotes) {
    const ts = Date.parse(quote.ts);
    if (startTimeBooks.has(quote.book) || ts > now + 5 * 60_000) {
      if (!quote.startTime) quote.startTime = new Date(ts).toISOString();
      quote.ts = new Date(now).toISOString(); quote.ageUnknown = true;
    }
  }
  // Any book's start time applies to the whole game, so started games drop for every book.
  const startOf = new Map();
  for (const quote of quotes) if (quote.startTime && !startOf.has(quote.eventId)) startOf.set(quote.eventId, quote.startTime);
  quotes = quotes.filter(quote => {
    if (!quote.startTime && startOf.has(quote.eventId)) quote.startTime = startOf.get(quote.eventId);
    if (!quote.live && quote.startTime && Date.parse(quote.startTime) <= now) { skipped.started += 1; return false; }
    return true;
  });
  // Duplicate ids and duplicate listings (one book listing a game twice) keep the newest price.
  const newest = (list, keyOf) => {
    const kept = new Map();
    for (const quote of list) {
      const key = keyOf(quote), prior = kept.get(key);
      if (!prior) kept.set(key, quote);
      else { skipped.duplicate += 1; if (Date.parse(quote.ts) > Date.parse(prior.ts)) kept.set(key, quote); }
    }
    return [...kept.values()];
  };
  quotes = newest(quotes, quote => quote.id);
  const checked = dropInconsistentListings(quotes, marketKey);
  skipped.inconsistent += checked.dropped;
  quotes = newest(checked.kept, quote => JSON.stringify([quote.book, marketKey(quote), quote.side]));
  markPriceFamilies(quotes);
  markAlternateLines(quotes);
  // One name per team and game: the fullest any book uses ("Dallas Cowboys", not "DAL Cowboys"),
  // from both event names and verified selections, so every row and book says the same thing.
  const teamNames = new Map();
  const offer = (eventId, side, name) => { const key = `${eventId}|${side}`; if (name && name.length > (teamNames.get(key) || '').length) teamNames.set(key, name); };
  for (const quote of quotes) {
    const teams = participantsOf(quote.event);
    if (teams) { offer(quote.eventId, 'away', teams.away); offer(quote.eventId, 'home', teams.home); }
    if (quote.sideVerified && ['home', 'away'].includes(quote.side)) offer(quote.eventId, quote.side, quote.selection);
  }
  for (const quote of quotes) {
    const away = teamNames.get(`${quote.eventId}|away`), home = teamNames.get(`${quote.eventId}|home`);
    quote.displayEvent = away && home ? `${away} @ ${home}` : quote.event;
    if (['home', 'away'].includes(quote.side) && away && home && (!quote.selection || matchParticipant(quote.selection, { away, home }) === quote.side)) quote.selection = quote.side === 'away' ? away : home;
    if (!quote.selection) quote.selection = { over: 'Over', under: 'Under', draw: 'Draw' }[quote.side] || quote.side;
  }
  return { quotes, skipped };
}

/**
 * Fetches and cleans the snapshot. Runs in the feed worker (public/ev-feed-worker.js) or, where
 * module workers aren't supported, in the page. Returns a plain result object; never throws.
 */
export async function loadFeed(url, syncedAt = new Date().toISOString()) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    // Feed times come from the server's clock; measure how far this device's clock is off.
    const serverNow = Date.parse(response.headers.get('Date') || ''), offset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
    let payload;
    try { payload = await response.json(); }
    catch { return { ok: false, kind: 'unreadable', status: response.status }; }
    if (!response.ok) return { ok: false, kind: 'http', status: response.status, payload, retryAfter: response.headers.get('Retry-After') };
    const records = Array.isArray(payload) ? payload : payload?.quotes;
    if (!Array.isArray(records)) return { ok: false, kind: 'shape' };
    if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) return { ok: false, kind: 'partial' };
    const { quotes, skipped } = normalizeFeed(records, { syncedAt, clockOffsetMs: Math.abs(offset) > 5_000 ? offset : 0 });
    return { ok: true, quotes, skipped, total: records.length };
  } catch (error) {
    return { ok: false, kind: error?.name === 'TimeoutError' ? 'timeout' : 'network', message: String(error?.message || '') };
  }
}
