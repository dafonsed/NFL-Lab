// Turns the quote API's records into the quotes every +EV tool uses. The feed's `side` is often
// wrong, while `selection_name` names the real pick ("Over 44.5", "Dallas Cowboys +3.0"), so sides
// and spread lines are rebuilt from the selection. Records that can't be trusted are skipped and
// counted instead of failing the whole snapshot. Pure functions: the page and the tests share them.
import { decimal, implied, marketKey } from './ev-core.js?v=3';
import { canonicalPlatform, isFantasyPlatform } from './platform-catalog.js';
import { DEFAULT_SHARP_WEIGHTS, devig } from './ev-advanced-math.js';
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
// Set or correct-score picks ("Kate Fakih 2:1", "Team 2-0"), handicap and winning-margin bands
// ("Team 11+", "Pittsburgh Panthers (13+)") and fight round or method props ("Sonny Hardy in Rd 9")
// are other markets too, even when the name matches a participant.
const otherMarket = (selection, event) => /^(yes|no|tie|draw)$/i.test(selection.trim()) || /^(over|under)\b/i.test(selection) || (selection.includes('/') && !String(event).includes('/'))
  || /\b\d+\s*[:-]\s*\d+\b/.test(selection) || /\s\d+\+$/.test(selection.trim()) || /\(\d+\+?\)$/.test(selection.trim())
  || /\b(in\s+rd\.?\s*\d+|in\s+round\s+\d+|by\s+(ko|tko|submission|decision|points))\b/i.test(selection);
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
  if (type === 'prop' || type === 'alternate' && /^(over|under)\b/i.test(sel)) {
    const match = /\b(over|under)\b\s*([+-]?\d+(?:\.\d+)?)?/i.exec(sel);
    if (!match) return { type, side: rawSide, line, selection: '', verified: false };
    return { type, side: match[1].toLowerCase(), line: match[2] != null ? Math.abs(Number(match[2])) : line, selection: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), verified: true };
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
// PrizePicks line type. Goblin and demon picks change the entry payout (and are More only); a line
// without a type is standard.
const ODDS_TYPES = new Set(['standard', 'goblin', 'demon']);
const oddsType = raw => { const value = (text(raw, 'oddsType') || text(raw, 'odds_type')).toLowerCase(); return ODDS_TYPES.has(value) ? value : ''; };

// Player and stat as the books send them. Fanatics files Over/Under player props as market "prop"
// with the stat in propMarket, and milestone props as market "Awak Kuier - Points" with the
// selection ("Over 6.5") where the player belongs.
function propIdentity(raw) {
  let market = text(raw, 'market'), player = text(raw, 'player') || text(raw, 'player_name');
  if (market.toLowerCase() === 'prop' && text(raw, 'propMarket')) market = text(raw, 'propMarket');
  const split = market.indexOf(' - ');
  // Milestone props send the threshold ("5+") as the player: "Tommy Tremble - ALT Longest Reception".
  const milestone = split > 0 && /^\d+(\.\d+)?\+$/.test(player) ? player : '';
  if ((milestone || /^(over|under)\s+\d+(\.\d+)?$/i.test(player)) && split > 0) { player = market.slice(0, split).trim(); market = market.slice(split + 3).trim(); }
  return { market, player, milestone };
}

/** One API record → quote, or { skip: reason }. `clockOffsetMs` = server clock − this clock. */
export function normalizeRecord(raw, { clockOffsetMs = 0 } = {}) {
  const id = text(raw, 'id') || (Number.isSafeInteger(raw?.id) ? String(raw.id) : '');
  const odds = Number(raw?.odds), timestamp = text(raw, 'ts'), observed = Date.parse(timestamp);
  // Pick'em apps (PrizePicks, Underdog ...) post a line, not a price, so their records may omit odds.
  const fantasy = isFantasyPlatform(text(raw, 'book')) && Boolean(text(raw, 'player') || text(raw, 'player_name'));
  if (!id || !text(raw, 'sport') || !text(raw, 'event') || !text(raw, 'market') || !text(raw, 'side') || !text(raw, 'book') || (!fantasy && !Number.isFinite(decimal(odds))) || !Number.isFinite(observed) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return { skip: 'invalid' };
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
  const { market, player, milestone } = propIdentity(raw);
  return {
    id: `local-api:${id}`, sport, event, market, displayMarket: type === 'prop' && market && market.toLowerCase() !== 'prop' ? market : MARKET_NAMES[type] || market,
    eventId, marketId: matched ? `${type}|${eventId}` : text(raw, 'marketId') || `${type}|${eventId}`,
    playerId: text(raw, 'playerId') || text(raw, 'player_id'), player, period: text(raw, 'period') || 'full', league: text(raw, 'league') || SOCCER_LEAGUES[text(raw, 'sport').toLowerCase()] || '',
    startTime: Number.isFinite(start) ? new Date(start).toISOString() : '',
    type, line, side: repaired.side, selection: milestone || repaired.selection, sideVerified: repaired.verified,
    book: canonicalPlatform(text(raw, 'book')), odds: Number.isFinite(decimal(odds)) ? odds : null, outcomes,
    ...(text(raw, 'team') ? { team: text(raw, 'team') } : {}), ...(oddsType(raw) ? { oddsType: oddsType(raw) } : {}), live: raw.live === true, exchange: raw.exchange === true,
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

// The quote API keeps every record it has ever scraped: when a price changes it adds a new record
// with a new id, and a market a book stops offering keeps its last price forever. Books rescrape
// every few minutes, so a pregame price not seen for 15 minutes is no longer offered.
export const FEED_MAX_AGE_MS = 15 * 60_000;

// Stable ids: the API's ids change on every scrape, which would close open rows, drop parlay legs
// and restart line history each time. One selection (book, market, line, side) keeps one id.
function stableId(text) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
const selectionKey = quote => JSON.stringify([quote.book, marketKey(quote), quote.side]);
// Known observation times beat unknown ones; then the newest price wins.
const fresher = (a, b) => Boolean(a.ageUnknown) !== Boolean(b.ageUnknown) ? !a.ageUnknown : Date.parse(a.ts) > Date.parse(b.ts);

/**
 * Full snapshot → { quotes, dfs, skipped: { invalid, mislabeled, duplicate, stale, started, inconsistent } }.
 * Some books send the game start as `ts`; for those, `ts` becomes the start time, the price's age
 * is unknown, and games that already started are dropped from pregame.
 */
export function normalizeFeed(records, { syncedAt = new Date().toISOString(), clockOffsetMs = 0, method = 'multiplicative' } = {}) {
  const skipped = { invalid: 0, mislabeled: 0, duplicate: 0, stale: 0, started: 0, inconsistent: 0 };
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
    // Pregame prices the API hasn't refreshed in 15 minutes are markets the book no longer offers.
    if (!quote.live && !quote.ageUnknown && now - Date.parse(quote.ts) > FEED_MAX_AGE_MS) { skipped.stale += 1; return false; }
    return true;
  });
  // Pick'em lines (a DFS app plus a player) are not sportsbook prices; they become DFS picks.
  const picks = relabelDfsSports(quotes.filter(quote => quote.player && isFantasyPlatform(quote.book)));
  quotes = quotes.filter(quote => !(quote.player && isFantasyPlatform(quote.book)));
  // Older copies of one selection (the API keeps them with new ids), and one book listing a game
  // twice, keep only the freshest price. This runs before the listing check so a stale copy can't
  // pair with a current one.
  const newest = (list, keyOf) => {
    const kept = new Map();
    for (const quote of list) {
      const key = keyOf(quote), prior = kept.get(key);
      if (!prior) kept.set(key, quote);
      else { skipped.duplicate += 1; if (fresher(quote, prior)) kept.set(key, quote); }
    }
    return [...kept.values()];
  };
  quotes = newest(newest(quotes, quote => quote.id), selectionKey);
  const checked = dropInconsistentListings(quotes, marketKey);
  skipped.inconsistent += checked.dropped;
  quotes = checked.kept;
  for (const quote of quotes) { quote.feedId = quote.id; quote.id = `local-api:${stableId(selectionKey(quote))}`; }
  markPriceFamilies(quotes);
  markAlternateLines(quotes);
  // One name per team and game: the fullest any book uses ("Dallas Cowboys", not "DAL Cowboys"),
  // from both event names and verified selections, so every row and book says the same thing.
  const teamNames = new Map();
  const offer = (eventId, side, name) => { const key = `${eventId}|${side}`; if (name && name.length > (teamNames.get(key) || '').length) teamNames.set(key, name); };
  for (const quote of [...quotes, ...picks]) {
    const teams = participantsOf(quote.event);
    if (teams) { offer(quote.eventId, 'away', teams.away); offer(quote.eventId, 'home', teams.home); }
    if (quote.sideVerified && ['home', 'away'].includes(quote.side)) offer(quote.eventId, quote.side, quote.selection);
  }
  // Every app's DFS picks and every book's quotes for one game share this display name.
  const names = new Map();
  const displayName = item => { const away = teamNames.get(`${item.eventId}|away`), home = teamNames.get(`${item.eventId}|home`); return away && home ? `${away} @ ${home}` : item.event; };
  for (const item of [...quotes, ...picks]) if (!names.has(item.eventId)) names.set(item.eventId, displayName(item));
  for (const quote of quotes) {
    const away = teamNames.get(`${quote.eventId}|away`), home = teamNames.get(`${quote.eventId}|home`);
    quote.displayEvent = names.get(quote.eventId);
    if (['home', 'away'].includes(quote.side) && away && home && (!quote.selection || matchParticipant(quote.selection, { away, home }) === quote.side)) quote.selection = quote.side === 'away' ? away : home;
    if (!quote.selection) quote.selection = { over: 'Over', under: 'Under', draw: 'Draw' }[quote.side] || quote.side;
  }
  return { quotes, dfs: dfsPicks(picks, quotes, names, { method }), skipped };
}

const propName = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Player Points", "Points", "Pts" and "points (incl. OT)" for one player compare as one market.
const PROP_WORDS = { pass: 'passing', rush: 'rushing', rec: 'receiving', yds: 'yards', yd: 'yards', td: 'touchdowns', tds: 'touchdowns', pts: 'points', reb: 'rebounds', rebs: 'rebounds', ast: 'assists', asts: 'assists', stl: 'steals', blk: 'blocks', '3pm': 'threes', '3pt': 'threes', so: 'strikeouts', ks: 'strikeouts', att: 'attempts', comp: 'completions', cmp: 'completions', sog: 'shots on goal' };
const propMarket = (market, player) => propName(market).replace(propName(player), '').replace(/\b(player|total|o u|over under|incl ot|alt)\b/g, ' ')
  .split(/\s+/).filter(Boolean).map(word => PROP_WORDS[word] || word).join(' ');
const propKey = (eventId, player, market, line) => JSON.stringify([eventId, propName(player), propMarket(market, player), Number(line)]);

/**
 * DFS picks in the shape the DFS tools use. A pick's fair probability comes only from sportsbook
 * prices for the same player, market and line: each book's two-sided Over/Under market is turned
 * into implied probabilities, devigged with `method` (see devig), then averaged (sharp books
 * weighted, mirrored books once). A probability the API sends with a DFS line is never used. Without
 * a two-sided sportsbook market the fair probability stays empty.
 */
export function dfsPicks(picks, quotes, names = new Map(), { method = 'multiplicative' } = {}) {
  // Books name one game differently (PrizePicks "DAL @ GSV", Fanatics "Dallas Wings @ Golden State
  // Valkyries"). A pick whose event finds no market falls back to the same sport, player, stat and
  // line, but only when that player has the stat in exactly one game at the books and in one game
  // among the picks; a player listed in two games is never guessed.
  const playerStat = (sport, player, market) => JSON.stringify([sport, propName(player), propMarket(market, player)]);
  const gamesOf = (map, key, eventId) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(eventId); };
  const markets = new Map(), bookGames = new Map(), pickGames = new Map();
  for (const pick of picks) gamesOf(pickGames, playerStat(pick.sport, pick.player, pick.market), pick.eventId);
  for (const quote of quotes) {
    if (!quote.player || !['over', 'under'].includes(quote.side) || !Number.isFinite(implied(quote.odds))) continue;
    const key = propKey(quote.eventId, quote.player, quote.market, quote.line);
    gamesOf(bookGames, playerStat(quote.sport, quote.player, quote.market), quote.eventId);
    if (!markets.has(key)) markets.set(key, new Map());
    const books = markets.get(key), family = quote.priceFamily || quote.book;
    books.set(family, { ...books.get(family), book: quote.book, exchange: quote.exchange === true, [quote.side]: implied(quote.odds), [`${quote.side}Odds`]: Number(quote.odds) });
  }
  // A pick'em line can be played either way at the same number: a standard line the feed sends as
  // More only is also listed as Less. Goblin and demon lines are More only.
  const sent = new Set(picks.map(pick => JSON.stringify([pick.book, propKey(pick.eventId, pick.player, pick.market, pick.line), pick.side])));
  const bothSides = picks.flatMap(pick => pick.side !== 'over' || ['goblin', 'demon'].includes(pick.oddsType)
    || sent.has(JSON.stringify([pick.book, propKey(pick.eventId, pick.player, pick.market, pick.line), 'under'])) ? [pick] : [pick, { ...pick, side: 'under' }]);
  const latest = new Map();
  for (const pick of bothSides) {
    const key = JSON.stringify([pick.book, propKey(pick.eventId, pick.player, pick.market, pick.line), pick.side]);
    const prior = latest.get(key);
    if (!prior || fresher(pick, prior)) latest.set(key, { ...pick, id: `local-api:${stableId(key)}` });
  }
  const marketFor = pick => {
    const exact = markets.get(propKey(pick.eventId, pick.player, pick.market, pick.line));
    if (exact) return exact;
    const key = playerStat(pick.sport, pick.player, pick.market), games = bookGames.get(key);
    return games?.size === 1 && pickGames.get(key)?.size === 1 ? markets.get(propKey([...games][0], pick.player, pick.market, pick.line)) : undefined;
  };
  return [...latest.values()].map(pick => {
    const books = [...(marketFor(pick)?.values() || [])]
      // A sportsbook pair whose implied probabilities sum to 100.5% or less has no margin to remove:
      // the feed built the Under from the Over (874 of 876 Fanatics prop pairs on 2 Oct 2026).
      .filter(book => book.exchange || book.over + book.under > 1.005)
      .map(book => ({ ...book, fairOver: devig([book.over, book.under], method)[0] })).filter(book => Number.isFinite(book.fairOver));
    const weight = book => DEFAULT_SHARP_WEIGHTS[String(book.book).toLowerCase()] || 1;
    const total = books.reduce((sum, book) => sum + weight(book), 0);
    const over = total ? books.reduce((sum, book) => sum + weight(book) * book.fairOver, 0) / total : NaN;
    const probability = Number.isFinite(over) ? (pick.side === 'over' ? over : 1 - over) : null;
    return {
      id: pick.id, app: pick.book, sport: pick.sport, league: pick.league, event: names.get(pick.eventId) || pick.event, eventId: pick.eventId,
      player: pick.player, ...(pick.team ? { team: pick.team } : {}), market: pick.market, line: pick.line, side: pick.side === 'under' ? 'Under' : 'Over',
      ...(pick.oddsType ? { oddsType: pick.oddsType } : pick.book === 'PrizePicks' ? { oddsType: 'standard' } : {}),
      probability, probabilityBooks: books.map(book => book.book), probabilityMethod: method,
      ...(books.length ? { probabilitySources: books.map(book => ({ book: book.book, over: book.overOdds, under: book.underOdds })) } : {}),
      ts: pick.ts, startTime: pick.startTime, live: pick.live, source: 'local-api',
    };
  });
}

/**
 * Fetches and cleans the snapshot. Runs in the feed worker (public/ev-feed-worker.js) or, where
 * module workers aren't supported, in the page. Returns a plain result object; never throws.
 */
export async function loadFeed(url, syncedAt = new Date().toISOString(), { method = 'multiplicative' } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
    // Feed times come from the server's clock; measure how far this device's clock is off.
    const serverNow = Date.parse(response.headers.get('Date') || ''), offset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
    let payload;
    try { payload = await response.json(); }
    catch { return { ok: false, kind: 'unreadable', status: response.status }; }
    if (!response.ok) return { ok: false, kind: 'http', status: response.status, payload, retryAfter: response.headers.get('Retry-After') };
    const records = Array.isArray(payload) ? payload : payload?.quotes;
    if (!Array.isArray(records)) return { ok: false, kind: 'shape' };
    if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) return { ok: false, kind: 'partial' };
    const { quotes, dfs, skipped } = normalizeFeed(records, { syncedAt, clockOffsetMs: Math.abs(offset) > 5_000 ? offset : 0, method });
    return { ok: true, quotes, dfs, skipped, total: records.length };
  } catch (error) {
    return { ok: false, kind: error?.name === 'TimeoutError' ? 'timeout' : 'network', message: String(error?.message || '') };
  }
}

// Entries that aren't player props: contest lobbies ("Main", "Snake Draft"), rosters, salary-cap
// prices (DraftKings Pick6 rows such as "Aaron Rodgers salary 14700").
const DFS_NON_PROPS = new Set(['roster', 'salary', 'salary cap', 'salary_cap', 'contest', 'lobby']);
const DFS_SIDES = { higher: 'over', more: 'over', over: 'over', lower: 'under', less: 'under', under: 'under' };
// Season-long entries list the season where the player goes ("2026-2027 Season").
const SEASON_LABEL = /^\d{4}(-\d{2,4})? season$/i;
// The feed files leagues it doesn't map (college football, esports, golf, motorsport, darts, NPB,
// some NHL) under NBA. A market basketball doesn't have moves all of that player's lines to the
// sport it belongs to, so "Points" for an NHL forward follows his "Shots On Goal".
const BASKETBALL = new Set(['NBA', 'WNBA', 'NCAAB']);
/** Moves DFS picks filed under basketball to the sport their player's markets belong to (in place). */
function relabelDfsSports(picks) {
  const key = pick => `${pick.book}|${propName(pick.player)}`, sports = new Map();
  for (const pick of picks) {
    if (!BASKETBALL.has(pick.sport)) continue;
    const sport = NOT_BASKETBALL.find(([pattern]) => pattern.test(String(pick.market).toLowerCase()))?.[1];
    if (sport) sports.set(key(pick), sport);
  }
  if (sports.size) for (const pick of picks) if (BASKETBALL.has(pick.sport) && sports.has(key(pick))) pick.sport = sports.get(key(pick));
  return picks;
}
const NOT_BASKETBALL = [
  [/\bmaps?\b|\bfirst bloods?\b|\bheadshots?\b/, 'Esports'],
  [/\bgoalie\b|\bshots on goal\b|\bpower play\b/, 'NHL'],
  [/\b(receiving|rush|rushing|pass|passing) yards\b|\breceptions\b|\blongest reception\b|\banytime tds?\b/, 'Football'],
  [/\bstrokes\b|\bbirdies\b|\bbogeys\b/, 'Golf'],
  [/\bpit stop\b|\b(finishing|starting) position\b|\bfastest lap\b/, 'Motorsports'],
  [/\b180'?s\b|\bcheckout\b/, 'Darts'],
  [/\bpitcher strikeouts\b|\bhits allowed\b|\bearned runs\b|\btotal bases\b/, 'Baseball'],
];

/**
 * The quote API's DFS props (GET /site/dfs/props) → pick records for dfsPicks(). Contest, roster
 * and salary entries are skipped. Only the line is read: the record's `probability` is not a fair
 * probability (it is the same 0.6667 on every pick), and fair probabilities come from devigged
 * sportsbook prices in dfsPicks().
 */
export function normalizeDfsRecords(records, { syncedAt = new Date().toISOString() } = {}) {
  const now = Date.parse(syncedAt), list = Array.isArray(records) ? records : [];
  const skipped = { invalid: 0, notProps: 0, stale: 0 };
  const picks = [];
  for (const raw of list) {
    const app = canonicalPlatform(text(raw, 'app') || text(raw, 'book')), player = text(raw, 'player') || text(raw, 'player_name');
    const market = text(raw, 'market'), side = DFS_SIDES[text(raw, 'side').toLowerCase()], line = Number(raw?.line), ts = Date.parse(text(raw, 'ts'));
    if (!app || !player || !market || !side || !Number.isFinite(line) || !Number.isFinite(ts)) { skipped.invalid += 1; continue; }
    if (DFS_NON_PROPS.has(market.toLowerCase()) || SEASON_LABEL.test(player) || line <= 0) { skipped.notProps += 1; continue; }
    if (now - ts > FEED_MAX_AGE_MS) { skipped.stale += 1; continue; }
    const sport = sportName(text(raw, 'sport')), event = text(raw, 'event');
    const matched = matchedEventKey(sport, event);
    picks.push({
      id: text(raw, 'id'), book: app, sport, league: text(raw, 'league') || SOCCER_LEAGUES[text(raw, 'sport').toLowerCase()] || '',
      event, eventId: matched ? `${sport}:${matched}` : event ? `${sport}:${event.toLowerCase()}` : `${sport}:${propName(player)}`,
      player, market, line, side, ts: new Date(ts).toISOString(), startTime: text(raw, 'startTime') || '', live: raw.live === true,
      ...(text(raw, 'team') ? { team: text(raw, 'team') } : {}), ...(oddsType(raw) ? { oddsType: oddsType(raw) } : {}),
    });
  }
  return { picks: relabelDfsSports(picks), skipped };
}

/** The quote API's payout tables (GET /site/dfs/payouts) → { app: { size: [return by hits] } } (power play: all picks must hit). */
export function payoutTables(records) {
  const tables = {};
  for (const entry of Array.isArray(records) ? records : []) {
    const app = canonicalPlatform(text(entry, 'app'));
    if (!app || !entry.payouts || typeof entry.payouts !== 'object') continue;
    for (const [size, kinds] of Object.entries(entry.payouts)) {
      const picks = Number(size), multiplier = Number(kinds?.power?.multiplier);
      if (!Number.isInteger(picks) || picks < 2 || picks > 10 || !(multiplier > 1)) continue;
      (tables[app] ||= {})[String(picks)] = [...Array(picks).fill(0), multiplier];
    }
  }
  return tables;
}

/**
 * Fetches and normalizes the DFS props; runs in the feed worker. Never throws. The unfiltered
 * request leaves some apps out (DraftKings Pick6 only comes back with ?app=), so each app named in
 * `apps` that is missing from it is requested on its own.
 */
export async function loadDfsFeed(url, syncedAt = new Date().toISOString(), apps = [], { method = 'multiplicative' } = {}) {
  const read = async target => {
    const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { ok: false, kind: 'http', status: response.status };
    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload?.props || payload?.dfs;
    return Array.isArray(records) ? { ok: true, records } : { ok: false, kind: 'shape' };
  };
  try {
    const base = await read(url);
    if (!base.ok) return base;
    const present = new Set(base.records.map(raw => canonicalPlatform(text(raw, 'app') || text(raw, 'book'))));
    const missing = [...new Set(apps)].filter(app => app && !present.has(canonicalPlatform(app)));
    const extra = await Promise.all(missing.map(app => read(`${url}${url.includes('?') ? '&' : '?'}app=${encodeURIComponent(app)}`).catch(() => ({ ok: false }))));
    const seen = new Set(), records = [];
    for (const raw of [base.records, ...extra.filter(result => result.ok).map(result => result.records)].flat()) {
      const id = text(raw, 'id');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      records.push(raw);
    }
    const { picks, skipped } = normalizeDfsRecords(records, { syncedAt });
    return { ok: true, picks, dfs: dfsPicks(picks, [], undefined, { method }), skipped, total: records.length };
  } catch (error) {
    return { ok: false, kind: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
