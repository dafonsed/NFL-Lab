// Turns the quote API's records into the quotes every +EV tool uses. The feed's `side` is often
// wrong, while `selection_name` names the real pick ("Over 44.5", "Dallas Cowboys +3.0"), so sides
// and spread lines are rebuilt from the selection. Records that can't be trusted are skipped and
// counted instead of failing the whole snapshot. Pure functions: the page and the tests share them.
import { decimal, implied, marketKey, familyKey } from './ev-core.js';
import { canonicalPlatform, isFantasyPlatform } from './platform-catalog.js';
import { DEFAULT_SHARP_WEIGHTS, SHARP_MAX_VIG_PERCENT, devig } from './ev-advanced-math.js';
import { MATCHED_SPORTS, matchedEventKey, dropInconsistentListings } from './ev-event-match.js';

const MAJOR = { NFL: 'NFL', MLB: 'MLB', NBA: 'NBA', WNBA: 'WNBA', NHL: 'NHL', SOCCER: 'Soccer' };
// `americanfootball` holds Central American soccer clubs in today's feed, so it is not relabeled
// as football; `other` and `unknown` carry no usable sport.
// Soccer league codes become Soccer, with the league kept (see SOCCER_LEAGUES).
const SOCCER_LEAGUES = { epl: 'EPL', mls: 'MLS', nwsl: 'NWSL', laliga: 'La Liga', seriea: 'Serie A', bundesliga: 'Bundesliga', ligue1: 'Ligue 1', ucl: 'Champions League', uel: 'Europa League' };
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
  let parts = text.split(/\s+(?:@|at)\s+/);
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
  const a = score(away), h = score(home), side = a > h ? 'away' : h > a ? 'home' : null;
  if (!side) return null;
  // One shared word (a city, nickname or first name) isn't a match when each name also has words the
  // other lacks: "Rhode Island Rams" isn't the Los Angeles Rams, "Alhambra, Aaron" isn't Aaron Bowen.
  // City codes ("LA Rams", "NY Yankees") don't count as missing words.
  const own = tokens(participants[side]), other = side === 'away' ? home : away, picked = tokens(name);
  const codes = new Set(String(participants[side]).split(/\s+/).filter(word => /^[A-Z]{2,4}$/.test(word)).map(word => word.toLowerCase()));
  const pickExtra = picked.filter(word => !own.includes(word) && !other.has(word) && !/^\d+$/.test(word));
  const teamExtra = own.filter(word => !picked.includes(word) && !codes.has(word));
  if (pickExtra.length && teamExtra.length) return null;
  // "Last, First": the surname must be the participant's.
  const comma = String(name).indexOf(',');
  if (comma > 0 && !tokens(String(name).slice(0, comma)).some(word => own.includes(word))) return null;
  return side;
}

// A selection for a different bet: a bare yes/no/tie, a total, or a pair ("A/B", "Cowboys / Tie")
// inside a singles event. Whole-word checks only: "NO Saints" is New Orleans, not a "No" bet.
// Set or correct-score picks ("Kate Fakih 2:1", "Team 2-0"), handicap and winning-margin bands
// ("Team 11+", "Pittsburgh Panthers (13+)") and fight round or method props ("Sonny Hardy in Rd 9")
// are other markets too, even when the name matches a participant.
const otherMarket = (selection, event) => /^(yes|no|tie|draw)$/i.test(selection.trim()) || /^(over|under)\b/i.test(selection) || (selection.includes('/') && !String(event).includes('/'))
  || /\b\d+\s*[:-]\s*\d+\b/.test(selection) || /\s\d+\+$/.test(selection.trim()) || /\(\d{1,2}\+?\)$/.test(selection.trim())
  // Combos ("Lehecka, Jiri & Over 22.5") price two outcomes at once.
  || /&\s*(over|under|yes|no)\b/i.test(selection) || /\b(over|under)\s+\d/i.test(selection)
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
    const outcome = { '1': 'home', x: 'draw', '2': 'away', draw: 'draw', tie: 'draw' }[sel.toLowerCase()];
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
// The payout factor a goblin or demon pick applies to the entry (goblin 0.7, demon 1.55, ...).
const payoutMultiplier = raw => { const value = Number(raw?.payoutMultiplier ?? raw?.payout_multiplier); return value > 0 && value < 100 ? value : null; };
const lineType = raw => ({ ...(oddsType(raw) ? { oddsType: oddsType(raw) } : {}), ...(payoutMultiplier(raw) ? { payoutMultiplier: payoutMultiplier(raw) } : {}) });

// A bet link that names the game instead of the book's id ("events/kk bosna sarajevo @ lietkabelis",
// "#/AS/B1/hanshin tigers @ hiroshima toyo carp/") opens nothing at the book, so it isn't offered.
function usableLink(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    let place = url.pathname + url.hash;
    try { place = decodeURIComponent(place); } catch { return false; }
    return /^https?:$/.test(url.protocol) && !/\s|@/.test(place);
  } catch { return false; }
}

// Player and stat as the books send them. Fanatics files Over/Under player props as market "prop"
// with the stat in propMarket, and milestone props as market "Awak Kuier - Points" with the
// selection ("Over 6.5") where the player belongs.
function propIdentity(raw) {
  let market = text(raw, 'market'), player = text(raw, 'player') || text(raw, 'player_name');
  if (market.toLowerCase() === 'prop' && text(raw, 'propMarket')) market = text(raw, 'propMarket');
  // Pinnacle writes "Davante Adams Total" as the player, and sometimes the stat too: "Lamar Jackson
  // Total Touchdown Passes" (stat = player), "Jason Myers Total Field" + "Goals". The player is the name
  // before "Total"; the words after it belong to the stat.
  const total = /^(.+?\S)\s+total(?:\s+(.+))?$/i.exec(player);
  if (total && !/^total\b/i.test(player)) {
    const [, name, rest = ''] = total;
    market = market === player ? rest || market : rest ? `${rest} ${market}` : market;
    player = name;
  }
  const split = market.indexOf(' - ');
  // Milestone props send the threshold ("5+") as the player: "Tommy Tremble - ALT Longest Reception".
  const milestone = split > 0 && /^\d+(\.\d+)?\+$/.test(player) ? player : '';
  if ((milestone || /^(over|under)\s+\d+(\.\d+)?$/i.test(player)) && split > 0) { player = market.slice(0, split).trim(); market = market.slice(split + 3).trim(); }
  else if (split > 0 && player) {
    const before = market.slice(0, split).trim(), after = market.slice(split + 3).trim(), last = value => nameWords(value).split(' ').pop();
    // A team prop names the stat where the player goes and the team after the dash ("Total Touchdowns -
    // IND Colts"); otherwise the player comes first and the stat after it.
    const teamProp = nameWords(before) === nameWords(player) && /\b(touchdowns|points|goals|yards|runs|hits)\b/i.test(before) && /\b[A-Z]{2,4}\b/.test(after);
    if (teamProp) { player = after; market = before; }
    else if (last(before) && last(before) === last(player)) market = after;
  }
  return { market, player, milestone };
}

// Milestone and "N+" props are Over (N - 0.5) bets on the stat pick'em lines use, so they compare
// with the same lines: Fanatics "ALT Longest Reception 15+" and FanDuel "Player to Record a 15+ Yard
// Reception" are Longest Reception Over 14.5; "Anytime Touchdown Scorer" is Anytime TDs Over 0.5.
const MILESTONE_MARKETS = [
  [/^(?:player )?to record an? (\d+)\+ yard reception$/i, () => 'Longest Reception'],
  [/^(?:player )?to record an? (\d+)\+ yard rush$/i, () => 'Longest Rush'],
  [/^anytime touchdown scorer$/i, () => 'Anytime TDs', 1],
  [/^(?:player )?to score (\d+)(?:\+| or more) touchdowns$/i, () => 'Anytime TDs'],
  [/^player to score (\d+)\+ goals$/i, () => 'Goals'],
  [/^player to record (\d+)\+ shots on goal$/i, () => 'Shots On Goal'],
  [/^(\d+)\+ (points|assists|goals|rebounds|made threes)$/i, match => match[2]],
  // FanDuel ladders: "To Score 20+ Points", "To Record 2+ Hits + Runs + RBIs", "To Hit 2+ Home Runs".
  [/^(?:player )?to score (\d+)\+ points$/i, () => 'Points'],
  [/^(?:player )?to record (\d+)\+ (hits \+ runs \+ rbis|hits|total bases|rbis|runs|stolen bases|rebounds|assists|points|strikeouts)$/i, match => match[2]],
  [/^(?:player )?to hit (\d+)\+ home runs$/i, () => 'Home Runs'],
];
const MILESTONE_SIDES = { over: 'over', yes: 'over', under: 'under', no: 'under' };
function milestoneAsOverUnder(market, milestone, side) {
  const direction = MILESTONE_SIDES[String(side ?? '').toLowerCase()];
  if (!direction) return null;
  if (milestone) return { market: market.replace(/^alt\s+/i, '').replace(/\s+milestones?$/i, ''), line: parseFloat(milestone) - 0.5, side: direction };
  for (const [pattern, stat, count] of MILESTONE_MARKETS) {
    const match = pattern.exec(market);
    if (match) return { market: stat(match), line: (count ?? Number(match[1])) - 0.5, side: direction };
  }
  return null;
}

/** One API record → quote, or { skip: reason }. `clockOffsetMs` = server clock − this clock. */
export function normalizeRecord(raw, { clockOffsetMs = 0 } = {}) {
  const id = text(raw, 'id') || (Number.isSafeInteger(raw?.id) ? String(raw.id) : '');
  const odds = Number(raw?.odds), timestamp = text(raw, 'ts'), observed = Date.parse(timestamp);
  // Pick'em apps (PrizePicks, Underdog ...) post a line, not a price, so their records may omit odds.
  const fantasy = isFantasyPlatform(text(raw, 'book')) && Boolean(text(raw, 'player') || text(raw, 'player_name'));
  // A record without a sport is kept (as Other): the feed sends some college props with none.
  if (!id || !text(raw, 'event') || !text(raw, 'market') || !text(raw, 'side') || !text(raw, 'book') || (!fantasy && !Number.isFinite(decimal(odds))) || !Number.isFinite(observed) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return { skip: 'invalid' };
  if (raw.live != null && typeof raw.live !== 'boolean' || raw.exchange != null && typeof raw.exchange !== 'boolean') return { skip: 'invalid' };
  if (raw.line != null && typeof raw.line !== 'number' && typeof raw.line !== 'string') return { skip: 'invalid' };
  let line = raw.line == null || raw.line === '' ? '' : Number(raw.line);
  if (line !== '' && !Number.isFinite(line)) return { skip: 'invalid' };
  let type = text(raw, 'market').toLowerCase() === '1x2' ? 'three-way' : text(raw, 'type').toLowerCase() || 'prop';
  let outcomes = raw.outcomes == null || raw.outcomes === '' ? (type === 'three-way' ? 3 : '') : Number(raw.outcomes);
  if (outcomes !== '' && (!Number.isInteger(outcomes) || outcomes < 2 || outcomes > 64)) return { skip: 'invalid' };
  const event = text(raw, 'event');
  // An event named like a selection ("Over 3.0", from Fanatics, holding a Padres spread) doesn't say
  // which game its prices are for.
  if (/^(over|under)\s+\d/i.test(event)) return { skip: 'mislabeled' };
  // Exchanges (ProphetX, Kalshi, Polymarket) send every outcome as "home" with no selection name, and
  // the price is often the other participant's (ProphetX "Zverev" +526 was Shang's price), so the side
  // can't be known.
  if (raw.exchange === true && ['moneyline', 'spread'].includes(type) && !text(raw, 'selection_name')) return { skip: 'mislabeled' };
  // A moneyline with a line is another market sent as one (race-to-25 lines, "& Over 22.5" combos).
  if (['moneyline', 'three-way'].includes(type) && line !== '' && line !== 0) return { skip: 'mislabeled' };
  // Game lines need two teams; a single name ("Tottenham", "Over 3.0") can't say which side is which.
  if (['moneyline', 'spread', 'total'].includes(type) && !participantsOf(event) && !(Number(outcomes) > 2)) return { skip: 'mislabeled' };
  // Novig sends team moneylines as props: player "IOWA", stat "moneyline", Over 0 = that team wins.
  const teamMoneyline = type === 'prop' && /^moneyline$/i.test(text(raw, 'propMarket')) && (line === '' || line === 0);
  if (teamMoneyline) {
    const team = matchParticipant(text(raw, 'player'), participantsOf(event)), over = /^(over|yes)$/i.test(text(raw, 'side'));
    if (!team) return { skip: 'mislabeled' };
    type = 'moneyline'; line = '';
    raw = { ...raw, side: over ? team : team === 'home' ? 'away' : 'home', selection_name: '', player: '', propMarket: '' };
  }
  const repaired = teamMoneyline ? { type, side: raw.side, line, selection: '', verified: true } : repairSelection({ type, side: text(raw, 'side'), line, selection: text(raw, 'selection_name'), event });
  if (!repaired) return { skip: 'mislabeled' };
  ({ type, line } = repaired);
  if (repaired.outcomes) outcomes = repaired.outcomes;
  if (['spread', 'total', 'alternate'].includes(type) && line === '') return { skip: 'invalid' };
  const sport = sportName(text(raw, 'sport')) || 'Other';
  const matched = matchedEventKey(sport, event);
  const eventId = matched ? `${sport}:${matched}` : `${sport}:${text(raw, 'eventId') || event.toLowerCase()}`;
  const liquidity = raw.liquidity == null || raw.liquidity === '' ? NaN : Number(raw.liquidity);
  const start = Date.parse(text(raw, 'startTime') || text(raw, 'start_time'));
  const identity = teamMoneyline ? { market: 'moneyline', player: '', milestone: '' } : propIdentity(raw), { player, milestone } = identity;
  const asOverUnder = type === 'prop' && !fantasy ? milestoneAsOverUnder(identity.market, milestone, repaired.side) : null;
  const market = asOverUnder?.market || identity.market;
  if (asOverUnder) line = asOverUnder.line;
  return {
    id: `local-api:${id}`, sport, event, market, displayMarket: type === 'prop' && market && market.toLowerCase() !== 'prop' ? market : MARKET_NAMES[type] || market,
    // A player prop's market is its stat: one player's Rebounds 8.5 and Assists 8.5 at a book are two
    // markets, not two copies of one. A milestone that couldn't be read as Over/Under carries no
    // line, so its threshold ("5+", "10+") is part of the market too.
    eventId, marketId: type === 'prop' ? `prop|${eventId}|${propMarket(market, player)}${milestone && !asOverUnder ? `|${milestone}` : ''}` : `${type}|${eventId}`,
    // Books spell one player differently ("Cam" / "Cameron Skattebo"); the normalized name pairs them.
    playerId: text(raw, 'playerId') || text(raw, 'player_id') || (player ? playerName(player) : ''), player, period: text(raw, 'period') || 'full', league: text(raw, 'league') || SOCCER_LEAGUES[text(raw, 'sport').toLowerCase()] || '',
    startTime: Number.isFinite(start) ? new Date(start).toISOString() : '',
    // Pick'em apps say higher/lower or more/less for Over/Under.
    type, line, side: asOverUnder?.side || (fantasy && DFS_SIDES[repaired.side]) || repaired.side,
    selection: asOverUnder ? (asOverUnder.side === 'over' ? 'Over' : 'Under') : milestone || repaired.selection, sideVerified: repaired.verified,
    book: canonicalPlatform(text(raw, 'book')), odds: Number.isFinite(decimal(odds)) ? odds : null, outcomes,
    ...(text(raw, 'team') ? { team: text(raw, 'team') } : {}), ...lineType(raw), live: raw.live === true, exchange: raw.exchange === true,
    ...(Number.isFinite(liquidity) ? { liquidity: Math.max(0, liquidity) } : {}),
    // Feed times use the server's clock; shift them onto this device's clock.
    ts: new Date(observed - clockOffsetMs).toISOString(), source: 'local-api',
    // Optional fields the tools already use when the feed sends them: links, limits, suspension.
    ...Object.fromEntries(['betUrl', 'eventUrl', 'prefillUrl'].filter(key => usableLink(text(raw, key))).map(key => [key, text(raw, key)])),
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
const PLATFORM_FAMILIES = [['BetRivers', 'Desert Diamond Sports', 'Bally Bet']];
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
  const union = (x, y) => { const [a, b] = [root(x), root(y)]; if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); };
  // Kambi's skins are one platform whatever today's overlap (BetRivers and Desert Diamond matched on
  // 70.1% of shared prices on 3 Oct 2026, a hair over the threshold, since state pricing differs by cents).
  const present = new Set(quotes.map(quote => quote.book));
  for (const group of PLATFORM_FAMILIES) { const books = group.filter(book => present.has(book)); for (const book of books.slice(1)) union(books[0], book); }
  for (const [key, pair] of pairs) {
    if (pair.shared < minShared || pair.same / pair.shared < minIdentical) continue;
    union(...key.split('\u0000'));
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
  // Books that list one line list their main line; their median is the line the market agrees on. A
  // ladder's main line is the one nearest it. Scoring a one-sided ladder by price alone picked
  // Fanatics' total 7.5 as main where every book had 48.5.
  const marketOf = key => { const [, ...rest] = JSON.parse(key); return JSON.stringify(rest); }, agreed = new Map();
  for (const [key, lines] of ladders) if (lines.size === 1) { const market = marketOf(key); if (!agreed.has(market)) agreed.set(market, []); agreed.get(market).push([...lines.keys()][0]); }
  const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const chance = odds => { const value = Number(odds); return value > 0 ? 100 / (value + 100) : -value / (-value + 100); };
  // Without that, a line priced on both sides nearest an even split, half-points first.
  const evenness = group => {
    const sides = [...new Set(group.map(q => q.side))];
    if (sides.length === 2) { const [a, b] = sides.map(side => chance(group.find(q => q.side === side).odds)); return Math.abs(a / (a + b) - 0.5); }
    return 1 + Math.abs(chance(group[0].odds) - 0.5);
  };
  for (const [key, lines] of ladders) {
    if (lines.size < 2) continue;
    const reference = agreed.get(marketOf(key));
    let main = null, best = Infinity;
    for (const [line, group] of lines) {
      const score = (reference ? Math.abs(line - median(reference)) * 10 : 0) + evenness(group) + (Number.isInteger(line) ? 0.05 : 0);
      if (score < best) { best = score; main = line; }
    }
    for (const [line, group] of lines) if (line !== main) group.forEach(quote => { quote.alt = true; });
  }
  return quotes;
}

const wholeMinute = ts => { const date = new Date(ts); return date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0; };

// The quote API keeps every record it has ever scraped: when a price changes it adds a new record
// with a new id, and a market a book stops offering keeps its last price forever. Books rescrape
// every few minutes, so a pregame price not seen for 15 minutes is no longer offered.
export const FEED_MAX_AGE_MS = 15 * 60_000;

// The API also keeps a line after the book moves it (DraftKings Rec Yards 13.5 -> 14.5 leaves the
// 13.5 prices in the feed) or after a DFS app pulls it. A book rescrapes all of a player's stat at
// once and a DFS app all of a game, so a record 5+ minutes behind the newest one in its group
// (`groupOf`; null = not checked) is no longer offered.
const REPLACED_MS = 5 * 60_000;
function dropReplaced(list, groupOf, skipped) {
  const newest = new Map(), groups = list.map(groupOf);
  list.forEach((item, i) => { const ts = Date.parse(item.ts); if (groups[i] != null && !(newest.get(groups[i]) >= ts)) newest.set(groups[i], ts); });
  return list.filter((item, i) => {
    if (groups[i] == null || newest.get(groups[i]) - Date.parse(item.ts) <= REPLACED_MS) return true;
    skipped.stale += 1;
    return false;
  });
}

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

// A record naming a team for a game: 'named' when the name is one of the event's teams, 'unnamed' when
// it is neither; null for anything else (no name, 1X2 codes, other markets).
function teamPick(raw) {
  const type = text(raw, 'market').toLowerCase() === '1x2' ? 'three-way' : text(raw, 'type').toLowerCase(), selection = text(raw, 'selection_name'), event = text(raw, 'event');
  if (!['moneyline', 'spread', 'three-way'].includes(type) || !selection || /^(1|2|x|tie|draw)$/i.test(selection)) return null;
  const name = type === 'spread' ? signedTail.exec(selection)?.[1] ?? selection : selection, participants = participantsOf(event);
  if (!participants || otherMarket(name, event)) return null;
  return matchParticipant(name, participants) ? 'named' : 'unnamed';
}

/**
 * A book's ladder of lines for one selection must get harder as the line does: an Over at a higher
 * total, or a spread giving more points, can't be likelier. Fanatics mixes half, quarter and team lines
 * into its full-game spreads and totals (Colts -3.5 at +165 between -3 at -145 and -4 at -110), and one
 * player's alternate yardage with another's. The longest consistent run of each ladder (2-point
 * tolerance) is kept; the rest are dropped.
 */
function dropNonMonotoneLadders(quotes, skipped) {
  const ladders = new Map();
  for (const quote of quotes) {
    if (!['spread', 'total', 'prop'].includes(quote.type) || quote.line === '' || !['over', 'under', 'home', 'away'].includes(quote.side)) continue;
    const key = JSON.stringify([quote.book, quote.eventId, quote.type, quote.period || 'full', quote.side, quote.player || '', quote.market, Boolean(quote.live)]);
    if (!ladders.has(key)) ladders.set(key, []);
    ladders.get(key).push(quote);
  }
  const bad = new Set();
  for (const list of ladders.values()) {
    if (new Set(list.map(quote => quote.line)).size < 3) continue;
    // Easiest line first: lowest Over, highest Under, most points on a spread.
    const harder = list[0].side === 'under' || list[0].type === 'spread' ? -1 : 1, sorted = [...list].sort((a, b) => harder * (a.line - b.line)), chance = sorted.map(quote => implied(quote.odds));
    const length = chance.map(() => 1), previous = chance.map(() => -1);
    for (let i = 0; i < chance.length; i++) for (let j = 0; j < i; j++) if (chance[i] <= chance[j] + 0.02 && length[j] + 1 > length[i]) { length[i] = length[j] + 1; previous[i] = j; }
    const keep = new Set();
    for (let at = length.indexOf(Math.max(...length)); at >= 0; at = previous[at]) keep.add(sorted[at]);
    for (const quote of sorted) if (!keep.has(quote)) bad.add(quote);
  }
  skipped.inconsistent += bad.size;
  return quotes.filter(quote => !bad.has(quote));
}

// Books name one game differently: "SD Padres @ MIL Brewers", "San Diego Padres (R Ray) @ Milwaukee
// Brewers (J Misiorowski)"; "Vanderbilt @ Georgia", "Vanderbilt Commodores @ Georgia Bulldogs". NFL, NBA,
// NHL and WNBA games already share an id built from nicknames (ev-event-match.js). Elsewhere two
// listings are one game when each team's name holds every word of the other book's name for it (a
// leading city code and notes in brackets aside) and they start within 2 hours, so a series' games on
// back-to-back days stay apart. Women's, youth and reserve sides ("(W)", "U21", "II") only match their
// own. The feed also files some games under the wrong sport (FanDuel's Yankees @ Rays as NCAAF,
// Fanatics' Braves @ Dodgers as NBA): the same matchup at the same time in another sport is that game
// too. The game listed by the most books keeps its id and sport. Pick'em apps are matched to games by
// player instead (dfsPicks).
const SQUAD_WORDS = new Set(['w', 'women', 'womens', 'res', 'reserve', 'reserves', 'ii', 'b']), squadWord = word => SQUAD_WORDS.has(word) || /^u\d{2}$/.test(word);
const teamWords = name => {
  const text = String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '');
  const notes = [...text.matchAll(/\(([^)]*)\)/g)].flatMap(match => match[1].toLowerCase().split(/[^a-z0-9]+/));
  const words = text.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  // A city code before the name ("SD Padres") or a name that is only a code ("SD", "MIZ", Novig's style).
  const code = words.length && /^[A-Z]{2,5}$/.test(words[0]) ? words[0].toLowerCase() : '', bare = words.length === 1 && Boolean(code);
  if (words.length > 1 && /^[A-Z]{2,4}$/.test(words[0])) words.shift();
  const plain = words.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const squad = [...notes, ...plain].filter(squadWord).map(word => word.startsWith('w') ? 'w' : word.startsWith('res') ? 'res' : word);
  return Object.assign(tokens(words.join(' ')).filter(word => !squadWord(word)), { squad: [...new Set(squad)].sort().join(' '), code, bare });
};
// A code names a team when it is the team's own code, its initials ("SC" South Carolina, "WVU" West
// Virginia University, "UNC"), the start of its name or its name's letters in order ("IND", "FLA",
// "MRSH"). A few school codes are none of those.
const TEAM_CODES = { miz: ['missouri'], afa: ['air force'], uk: ['kentucky'], msst: ['mississippi state'], ole: ['mississippi'], bama: ['alabama'], uga: ['georgia'], ou: ['oklahoma'], tamu: ['texas'] };
const inOrder = (code, word) => { let at = 0; for (const letter of word) if (letter === code[at]) at += 1; return at === code.length; };
const codeNames = (code, team) => {
  if (!code || !team.length) return false;
  if (team.code === code || (TEAM_CODES[code] || []).some(name => name.split(' ').every(word => team.includes(word)))) return true;
  const initials = team.map(word => word[0]).join('');
  const variants = [code, ...(code.length >= 3 && code.endsWith('u') ? [code.slice(0, -1)] : []), ...(code.length >= 3 && code.startsWith('u') ? [code.slice(1)] : [])];
  return variants.some(form => (form.length >= 2 && initials.startsWith(form)) || (form.length >= 3 && team[0][0] === form[0] && inOrder(form, team[0])));
};
const sameTeam = (a, b) => {
  if (a.squad !== b.squad) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length > 0 && short.every(word => long.includes(word))) return true;
  return (a.bare && !b.bare && codeNames(a.code, b)) || (b.bare && !a.bare && codeNames(b.code, a));
};
const SAME_START_MS = 2 * 3_600_000;
function unifyEvents(quotes) {
  const events = new Map();
  for (const quote of quotes) {
    if (isFantasyPlatform(quote.book)) continue;
    let event = events.get(quote.eventId);
    if (!event) {
      const teams = participantsOf(quote.event);
      if (!teams) continue;
      event = { id: quote.eventId, sport: quote.sport, away: teamWords(teams.away), home: teamWords(teams.home), starts: new Map(), books: new Set(), size: 0 };
      events.set(quote.eventId, event);
    }
    event.books.add(quote.book); event.size += 1;
    if (quote.startTime) event.starts.set(quote.startTime, (event.starts.get(quote.startTime) || 0) + 1);
  }
  const list = [];
  for (const event of events.values()) {
    if (!event.starts.size || !event.away.length || !event.home.length) continue;
    event.start = Date.parse([...event.starts].sort((a, b) => b[1] - a[1])[0][0]);
    list.push(event);
  }
  list.sort((a, b) => a.start - b.start);
  const parent = new Map(), root = id => { while (parent.has(id)) id = parent.get(id); return id; };
  const ahead = (x, y) => x.books.size !== y.books.size ? x.books.size > y.books.size : x.size >= y.size;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].start - list[i].start <= SAME_START_MS; j++) {
    const a = list[i], b = list[j];
    // Two ids in one of the nickname-keyed leagues are two games, unless one names its teams by code
    // only ("IND @ WAS") and so has no nickname to key on.
    const coded = event => event.away.bare || event.home.bare;
    if (a.sport === b.sport && MATCHED_SPORTS.has(a.sport) && !coded(a) && !coded(b)) continue;
    if (!sameTeam(a.away, b.away) || !sameTeam(a.home, b.home)) continue;
    const x = events.get(root(a.id)), y = events.get(root(b.id));
    if (x === y) continue;
    const [keep, merge] = ahead(x, y) ? [x, y] : [y, x];
    parent.set(merge.id, keep.id);
    for (const book of merge.books) keep.books.add(book);
    keep.size += merge.size;
  }
  if (!parent.size) return;
  for (const quote of quotes) {
    if (!parent.has(quote.eventId)) continue;
    const from = quote.eventId, to = events.get(root(from)), cut = quote.marketId.indexOf('|') + 1;
    quote.eventId = to.id; quote.sport = to.sport;
    if (quote.marketId.startsWith(from, cut)) quote.marketId = quote.marketId.slice(0, cut) + to.id + quote.marketId.slice(cut + from.length);
  }
}

// The feed sometimes files one book's props for a player under another game (Fanatics put the Giants'
// Isaiah Likely under Jets @ Bears, and Yankees hitters under an "MLB" Packers @ Buccaneers). A player
// plays one game at a time: when 2+ other books price him in exactly one other game of the sport within
// a day, none of them in this book's game, and they price a stat this book prices for him, the book's
// props for him move to that game.
const PROP_GAME_MS = 24 * 3_600_000;
function relocateMisfiledProps(quotes) {
  const props = quotes.filter(quote => quote.type === 'prop' && quote.player && !quote.live && !isFantasyPlatform(quote.book) && quote.marketId.startsWith(`prop|${quote.eventId}|`));
  const statOf = quote => quote.marketId.slice(`prop|${quote.eventId}|`.length);
  const players = new Map(), games = new Map();
  for (const quote of props) {
    const key = `${quote.sport}|${quote.playerId}`, byGame = players.get(key) || new Map();
    players.set(key, byGame);
    const byBook = byGame.get(quote.eventId) || new Map(), stats = byBook.get(quote.book) || new Set();
    byGame.set(quote.eventId, byBook); byBook.set(quote.book, stats); stats.add(statOf(quote));
    if (!games.has(quote.eventId) && quote.startTime) games.set(quote.eventId, quote);
  }
  const moves = new Map();
  for (const [key, byGame] of players) {
    if (byGame.size < 2) continue;
    for (const [game, byBook] of byGame) for (const [book, stats] of byBook) {
      if (byBook.size > 1) continue; // another book prices him in this game too
      const elsewhere = [...byGame].filter(([other, books]) => other !== game && [...books.keys()].some(name => name !== book));
      if (elsewhere.length !== 1) continue;
      const [target, books] = elsewhere[0], others = [...books].filter(([name]) => name !== book);
      if (others.length < 2 || !others.some(([, theirs]) => [...stats].some(stat => theirs.has(stat)))) continue;
      const from = games.get(game), to = games.get(target);
      if (!to || (from && Math.abs(Date.parse(from.startTime) - Date.parse(to.startTime)) > PROP_GAME_MS)) continue;
      moves.set(`${key}|${game}|${book}`, to);
    }
  }
  if (!moves.size) return;
  for (const quote of props) {
    const to = moves.get(`${quote.sport}|${quote.playerId}|${quote.eventId}|${quote.book}`);
    if (!to) continue;
    Object.assign(quote, { marketId: `prop|${to.eventId}|${statOf(quote)}`, eventId: to.eventId, event: to.event, startTime: to.startTime });
  }
}

// One game's player spelled two ways by different books ("Jeremiah" / "Jeremiyah Love", "Andrew" /
// "Andres Borregales"): same last name, first names one or two letters apart, never both at one book.
// The spelling more books use wins.
const editDistance = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); row = next; }
  return row[b.length];
};
function unifyPlayerSpellings(quotes) {
  const games = new Map();
  for (const quote of quotes) {
    if (quote.type !== 'prop' || !quote.player || !quote.playerId || isFantasyPlatform(quote.book)) continue;
    const players = games.get(quote.eventId) || new Map(), entry = players.get(quote.playerId) || { player: quote.player, books: new Set() };
    games.set(quote.eventId, players); players.set(quote.playerId, entry); entry.books.add(quote.book);
  }
  const renamed = new Map();
  for (const [eventId, players] of games) {
    const ids = [...players.keys()];
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      const [fa, ...ra] = a.split(' '), [fb, ...rb] = b.split(' ');
      if (!ra.length || ra.join(' ') !== rb.join(' ') || fa[0] !== fb[0] || Math.min(fa.length, fb.length) < 4 || editDistance(fa, fb) > 2) continue;
      const x = players.get(a), y = players.get(b);
      if ([...x.books].some(book => y.books.has(book))) continue;
      const [keep, drop] = x.books.size >= y.books.size ? [a, b] : [b, a];
      renamed.set(`${eventId}|${drop}`, { playerId: keep, player: players.get(keep).player });
    }
  }
  for (const quote of quotes) { const to = renamed.get(`${quote.eventId}|${quote.playerId}`); if (to) Object.assign(quote, to); }
}

/**
 * Full snapshot → { quotes, dfs, skipped: { invalid, mislabeled, duplicate, stale, started, inconsistent } }.
 * Some books send the game start as `ts`; for those, `ts` becomes the start time, the price's age
 * is unknown, and games that already started are dropped from pregame.
 */
export function normalizeFeed(records, { syncedAt = new Date().toISOString(), clockOffsetMs = 0, method = 'multiplicative', price = true } = {}) {
  const skipped = { invalid: 0, mislabeled: 0, duplicate: 0, stale: 0, started: 0, inconsistent: 0 };
  const now = Date.parse(syncedAt);
  let quotes = [];
  // A book's game whose team picks never name either team carries another game's name (the feed filed
  // Memphis prices under "Denver Broncos @ San Francisco 49ers"); its totals and props belong to that
  // other game too, so the whole listing goes.
  // A moneyline listing with a "Yes"/"No" outcome is a yes/no prop (Fanatics ["Detroit Lions" -150,
  // "No" +280]), not the game's moneyline, so its team record goes as well.
  const listing = (book, event, start) => JSON.stringify([book, event, Date.parse(start) || '']), teamPicks = new Map(), yesNo = new Set();
  for (const raw of Array.isArray(records) ? records : []) {
    const result = normalizeRecord(raw, { clockOffsetMs }), verdict = teamPick(raw), key = listing(canonicalPlatform(text(raw, 'book')), text(raw, 'event'), text(raw, 'startTime') || text(raw, 'start_time'));
    if (verdict) { const tally = teamPicks.get(key) || { named: 0, unnamed: 0 }; tally[verdict] += 1; teamPicks.set(key, tally); }
    if (text(raw, 'type').toLowerCase() === 'moneyline' && /^(yes|no)$/i.test(text(raw, 'selection_name'))) yesNo.add(key);
    if (result.skip) skipped[result.skip] += 1; else quotes.push(result);
  }
  quotes = quotes.filter(quote => {
    const key = listing(quote.book, quote.event, quote.startTime), tally = teamPicks.get(key);
    return (!tally || tally.named > 0) && !(quote.type === 'moneyline' && yesNo.has(key)) || (skipped.mislabeled += 1, false);
  });
  // A book whose unconfirmed game-line sides are (nearly) all one value labels every outcome alike.
  const unconfirmed = quote => !quote.sideVerified && ['moneyline', 'spread'].includes(quote.type), sideCounts = new Map();
  for (const quote of quotes.filter(unconfirmed)) { const counts = sideCounts.get(quote.book) || new Map(); counts.set(quote.side, (counts.get(quote.side) || 0) + 1); sideCounts.set(quote.book, counts); }
  const oneSided = new Set([...sideCounts].filter(([, counts]) => { const total = [...counts.values()].reduce((a, b) => a + b, 0); return total >= 10 && Math.max(...counts.values()) / total >= 0.95; }).map(([book]) => book));
  quotes = quotes.filter(quote => !(oneSided.has(quote.book) && unconfirmed(quote)) || (skipped.mislabeled += 1, false));
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
  unifyEvents(quotes);
  relocateMisfiledProps(quotes);
  unifyPlayerSpellings(quotes);
  // A soccer match has a draw: a two-way moneyline there is an incomplete three-way market (comparing
  // it as two-way showed live J-League "arbs" of 16-147%).
  const drawn = new Set(quotes.filter(quote => quote.type === 'three-way').map(quote => quote.eventId));
  for (const quote of quotes) if (quote.type === 'moneyline' && (quote.sport === 'Soccer' || drawn.has(quote.eventId))) Object.assign(quote, { type: 'three-way', outcomes: 3, marketId: `three-way|${quote.eventId}`, displayMarket: MARKET_NAMES['three-way'] });
  // Ladder props a book prices on one side at whole numbers ("Receiving Yards" 20, 25, 30 with only an
  // Over) are N+ milestones: Over N - 0.5 on that stat. A whole number priced both ways is a real
  // line with a push and stays as it is.
  const ladderKey = quote => [quote.book, quote.eventId, propName(quote.player), propName(quote.market), quote.line].join('|');
  const pricedUnder = new Set(quotes.filter(quote => quote.type === 'prop' && quote.side === 'under').map(ladderKey));
  for (const quote of quotes) {
    if (quote.type === 'prop' && quote.player && quote.side === 'over' && Number.isInteger(quote.line) && quote.line >= 1 && !isFantasyPlatform(quote.book) && !pricedUnder.has(ladderKey(quote))) quote.line -= 0.5;
  }
  // Books disagree on a game's start (FanDuel stamps some games 16:00 on the scrape day; the feed files
  // other days' games under one name). Each book votes once per hour; where 2+ books agree, a price
  // starting 6+ hours from them belongs to another game or carries a placeholder and goes, and prices
  // within 2 hours take the agreed start, so every book shows one kickoff.
  const startOf = new Map(), byEvent = new Map();
  for (const quote of quotes) {
    if (!quote.startTime || isFantasyPlatform(quote.book)) continue;
    const hours = byEvent.get(quote.eventId) || new Map(), hour = Math.round(Date.parse(quote.startTime) / 3_600_000);
    if (!hours.has(hour)) hours.set(hour, new Map());
    if (!hours.get(hour).has(quote.book)) hours.get(hour).set(quote.book, quote.startTime);
    byEvent.set(quote.eventId, hours);
  }
  for (const [eventId, hours] of byEvent) {
    const [hour, books] = [...hours].sort((a, b) => b[1].size - a[1].size || a[0] - b[0])[0], times = new Map();
    for (const time of books.values()) times.set(time, (times.get(time) || 0) + 1);
    startOf.set(eventId, { start: [...times].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], books: books.size, hour });
  }
  quotes = quotes.filter(quote => {
    const agreed = startOf.get(quote.eventId);
    if (!agreed || !quote.startTime || isFantasyPlatform(quote.book) || agreed.books < 2) return true;
    const gap = Math.abs(Date.parse(quote.startTime) - Date.parse(agreed.start)), own = byEvent.get(quote.eventId).get(Math.round(Date.parse(quote.startTime) / 3_600_000));
    if (gap > 6 * 3_600_000 && own.size < agreed.books) { skipped.inconsistent += 1; return false; }
    if (gap <= 2 * 3_600_000) quote.startTime = agreed.start;
    return true;
  });
  for (const quote of quotes) if (quote.startTime && !startOf.has(quote.eventId)) startOf.set(quote.eventId, { start: quote.startTime });
  quotes = quotes.filter(quote => {
    if (!quote.startTime && startOf.has(quote.eventId)) quote.startTime = startOf.get(quote.eventId).start;
    // A price marked live for a game that a book says starts later is a pregame price (the feed
    // flagged Sunday's Betr moneylines live on Friday).
    if (quote.live && quote.startTime && Date.parse(quote.startTime) > now + 5 * 60_000) quote.live = false;
    if (!quote.live && quote.startTime && Date.parse(quote.startTime) <= now) { skipped.started += 1; return false; }
    // Pregame prices the API hasn't refreshed in 15 minutes are markets the book no longer offers.
    if (!quote.live && !quote.ageUnknown && now - Date.parse(quote.ts) > FEED_MAX_AGE_MS) { skipped.stale += 1; return false; }
    return true;
  });
  // Pick'em lines (a DFS app plus a player) are not sportsbook prices; they become DFS picks.
  const pickem = quote => quote.player && isFantasyPlatform(quote.book);
  // Season-long entries carry the season where the player goes ("2026-2027 Season"), so whose line it
  // is isn't known (normalizeDfsRecords skips them too).
  const seasonLabel = quote => SEASON_LABEL.test(quote.player) && (skipped.invalid += 1);
  const picks = relabelDfsSports(dropReplaced(quotes.filter(quote => pickem(quote) && !seasonLabel(quote)), pick => JSON.stringify([pick.book, pick.eventId]), skipped));
  quotes = dropReplaced(quotes.filter(quote => !pickem(quote)), quote => quote.player && quote.type === 'prop' && !quote.live && !quote.ageUnknown
    ? JSON.stringify([quote.book, quote.eventId, playerName(quote.player), propMarket(quote.market, quote.player)]) : null, skipped);
  // Older copies of one selection (the API keeps them with new ids), and one book listing a game
  // twice, keep only the freshest price. This runs before the listing check so a stale copy can't
  // pair with a current one.
  // One book quoting one selection at two prices in the same scrape is listing two markets under one
  // name (Fanatics "Aces" moneylines at -105, -130 and +320): neither price can be trusted.
  const conflicted = new Set();
  const newest = (list, keyOf, conflicts = false) => {
    const kept = new Map();
    for (const quote of list) {
      const key = keyOf(quote), prior = kept.get(key);
      if (!prior) { kept.set(key, quote); continue; }
      skipped.duplicate += 1;
      if (conflicts && !quote.ageUnknown && !prior.ageUnknown && Math.abs(Date.parse(quote.ts) - Date.parse(prior.ts)) < 5_000 && Number(quote.odds) !== Number(prior.odds)) conflicted.add(key);
      if (fresher(quote, prior)) kept.set(key, quote);
    }
    return [...kept.entries()].filter(([key]) => !conflicted.has(key) || (skipped.inconsistent += 1, false)).map(([, quote]) => quote);
  };
  quotes = dropNonMonotoneLadders(newest(newest(quotes, quote => quote.id), selectionKey, true), skipped);
  const checked = dropInconsistentListings(quotes, marketKey);
  skipped.inconsistent += checked.dropped;
  quotes = checked.kept;
  for (const quote of quotes) { quote.feedId = quote.id; quote.id = `local-api:${stableId(selectionKey(quote))}`; }
  markPriceFamilies(quotes);
  markAlternateLines(quotes);
  // Price history follows a book's line as it moves: a moved line is a new selection id, so a series is
  // the book, the market without its line, and the side. On a ladder only the main line is followed.
  const seriesKey = quote => JSON.stringify([quote.book, familyKey(quote), quote.side]), seriesSize = new Map();
  for (const quote of quotes) seriesSize.set(seriesKey(quote), (seriesSize.get(seriesKey(quote)) || 0) + 1);
  for (const quote of quotes) quote.seriesId = seriesSize.get(seriesKey(quote)) === 1 || ['spread', 'total'].includes(quote.type) && !quote.alt ? `local-api:${stableId(seriesKey(quote))}` : quote.id;
  // One name per team and game, so every row and book says the same thing: the name most books use in
  // their event names (the fuller one on a tie, "Dallas Cowboys" over "DAL Cowboys"), without notes in
  // brackets ("(TBD)", pitchers). A selection name only fills a side no event name covers, and only a
  // plain, confirmed one: taking the longest selection once renamed an NFL game "Rhode Island Rams @
  // Philadelphia Eagles" and a match "Lehecka, Jiri & Over 22.5 @ Ugo Humbert".
  const votes = new Map();
  const vote = (eventId, side, name, book) => {
    const clean = String(name ?? '').replace(/\s*\([^)]*\)/g, '').trim(), key = `${eventId}|${side}`;
    if (!clean) return;
    if (!votes.has(key)) votes.set(key, new Map());
    const names = votes.get(key);
    if (!names.has(clean)) names.set(clean, new Set());
    names.get(clean).add(book);
  };
  for (const item of [...quotes, ...picks]) { const teams = participantsOf(item.event); if (teams) { vote(item.eventId, 'away', teams.away, item.book); vote(item.eventId, 'home', teams.home, item.book); } }
  for (const quote of quotes) if (quote.sideVerified && ['home', 'away'].includes(quote.side) && !votes.has(`${quote.eventId}|${quote.side}`) && quote.selection && !/[,&\d]/.test(quote.selection)) vote(quote.eventId, quote.side, quote.selection, quote.book);
  const teamNames = new Map([...votes].map(([key, names]) => [key, [...names].sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length)[0][0]]));
  // A confirmed selection that spells out the same name ("Dallas Cowboys" for "Cowboys") fills it out.
  for (const quote of quotes) {
    const key = `${quote.eventId}|${quote.side}`, base = teamNames.get(key), name = String(quote.selection ?? '').trim();
    if (quote.sideVerified && base && name.length > base.length && !/[,&\d()]/.test(name) && tokens(base).every(word => tokens(name).includes(word))) teamNames.set(key, name);
  }
  // A side is named after a team only when it is confirmed, or its book also prices the other side.
  const priced = new Set(quotes.map(quote => `${quote.book}|${marketKey(quote)}|${quote.side}`));
  const named = quote => quote.sideVerified || priced.has(`${quote.book}|${marketKey(quote)}|${quote.side === 'home' ? 'away' : 'home'}`);
  // Every app's DFS picks and every book's quotes for one game share this display name.
  const names = new Map();
  const displayName = item => { const away = teamNames.get(`${item.eventId}|away`), home = teamNames.get(`${item.eventId}|home`); return away && home ? `${away} @ ${home}` : item.event; };
  for (const item of [...quotes, ...picks]) if (!names.has(item.eventId)) names.set(item.eventId, displayName(item));
  for (const quote of quotes) {
    const away = teamNames.get(`${quote.eventId}|away`), home = teamNames.get(`${quote.eventId}|home`);
    quote.displayEvent = names.get(quote.eventId);
    if (['home', 'away'].includes(quote.side) && away && home && named(quote) && (!quote.selection || matchParticipant(quote.selection, { away, home }) === quote.side)) quote.selection = quote.side === 'away' ? away : home;
    if (!quote.selection) quote.selection = { over: 'Over', under: 'Under', draw: 'Draw' }[quote.side] || quote.side;
  }
  // `price: false` leaves pricing to a pricer that also has the DFS props feed (createDfsPricer).
  return { quotes, picks, names, ...(price ? { dfs: dfsPicks(picks, quotes, names, { method }) } : {}), skipped };
}

const propName = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Player Points", "Points", "Pts" and "points (incl. OT)" for one player compare as one market.
const PROP_WORDS = { pass: 'passing', rush: 'rushing', rec: 'receiving', yds: 'yards', yd: 'yards', td: 'touchdowns', tds: 'touchdowns', pts: 'points', reb: 'rebounds', rebs: 'rebounds', ast: 'assists', asts: 'assists', stl: 'steals', blk: 'blocks', '3pm': 'threes', '3pt': 'threes', so: 'strikeouts', ks: 'strikeouts', att: 'attempts', comp: 'completions', cmp: 'completions', sog: 'shots on goal' };
// Books differ on name suffixes ("Luther Burden III" / "Luther Burden") and initials ("D.J. Moore" /
// "DJ Moore").
const NAME_SUFFIXES = /\b(jr|sr|ii|iii|iv)\b/g;
const nameWords = value => propName(value).replace(NAME_SUFFIXES, ' ').replace(/\b([a-z]) +(?=[a-z]\b)/g, '$1').replace(/\s+/g, ' ').trim();
// ... and on short first names ("Cam Ward" / "Cameron Ward", "Kenny Gainwell" / "Kenneth Gainwell").
const NICKNAMES = {
  cam: 'cameron', chig: 'chigoziem', chris: 'christopher', dan: 'daniel', danny: 'daniel', dave: 'david', ken: 'kenneth', kenny: 'kenneth',
  matt: 'matthew', mike: 'michael', mitch: 'mitchell', nate: 'nathan', nathaniel: 'nathan', nick: 'nicholas', nicolas: 'nicholas',
  zach: 'zachary', zack: 'zachary', josh: 'joshua', jake: 'jacob', alex: 'alexander', will: 'william', bill: 'william', billy: 'william',
  rob: 'robert', robbie: 'robert', bob: 'robert', bobby: 'robert', tony: 'anthony', joe: 'joseph', joey: 'joseph', ben: 'benjamin',
  sam: 'samuel', tom: 'thomas', tommy: 'thomas', tim: 'timothy', pat: 'patrick', greg: 'gregory', jim: 'james', jimmy: 'james',
  drew: 'andrew', andy: 'andrew', gabe: 'gabriel', jon: 'jonathan', steph: 'stephen', jeff: 'jeffrey', fred: 'frederick',
};
const playerName = value => nameWords(value).replace(/^\S+/, first => NICKNAMES[first] || first);
// The same stat written different ways: "3-PT Made" = "Threes" = "Made Threes", "Pitcher
// Strikeouts" = "Strikeouts", "Goalie Saves" = "Saves", "Carries" = "Rush Attempts", "INT" =
// "Interceptions", "Earned Runs Allowed" = "Earned Runs".
const STAT_PHRASES = [
  [/\b(3 ?pt|3 ?pointers?|three pointers?|3 ?pm|threes)( made)?\b/g, 'threes'],
  [/\bmade threes\b/g, 'threes'],
  [/\b(player|pitcher|goalie)\b/g, ' '],
  [/\bbatter\b/g, 'hitter'],
  [/\bcarries\b/g, 'rush attempts'],
  [/\binterceptions thrown\b/g, 'interceptions'],
  [/\bint\b/g, 'interceptions'],
  [/\bearned runs allowed\b/g, 'earned runs'],
  [/\bpra\b/g, 'points rebounds assists'],
  // Pinnacle "Touchdown Passes" = "Passing TDs".
  [/\b(touchdown|td|tds) passes\b/g, 'passing touchdowns'],
  // Part-game stats: "1st Quarter" = "1Q" = "Q1", "First Half" = "1H", "1st 5 Innings" = "F5".
  [/\b(1st|first) (5|five) innings\b/g, 'f5'],
  [/\b(1st|first) (quarter|half|period)\b/g, (_, n, part) => '1' + part[0]],
  [/\b(2nd|second) (quarter|half|period)\b/g, (_, n, part) => '2' + part[0]],
  [/\b(3rd|third) (quarter|period)\b/g, (_, n, part) => '3' + part[0]],
  [/\b(4th|fourth) quarter\b/g, '4q'],
  [/\b([qhp])([1-4])\b/g, (_, part, n) => n + part],
];
// A part-game marker goes last, wherever a book puts it ("1Q Rec Yards" / "Receiving Yards 1st Quarter").
const PERIOD_WORDS = new Set(['1q', '2q', '3q', '4q', '1h', '2h', '1p', '2p', '3p', 'f5']);
// A stat some books name without its kind ("Completions" is Pass Completions).
const BARE_STATS = { completions: 'passing completions' };
const propMarket = (market, player) => {
  // "S Gilgeous-Alexander - Pts + Reb + Ast": the player before the dash, however abbreviated.
  const name = nameWords(player), dash = String(market ?? '').lastIndexOf(' - ');
  if (dash > 0 && nameWords(String(market).slice(0, dash)).split(' ').pop() === name.split(' ').pop()) market = String(market).slice(dash + 3);
  let stat = ` ${nameWords(market)} `.replace(` ${name} `, ' ');
  for (const [pattern, replacement] of STAT_PHRASES) stat = stat.replace(pattern, replacement);
  const words = stat.replace(/\b(total|o u|ou|over under|incl ot|alt)\b/g, ' ').split(/\s+/).filter(Boolean).map(word => PROP_WORDS[word] || word);
  stat = [...words.filter(word => !PERIOD_WORDS.has(word)), ...words.filter(word => PERIOD_WORDS.has(word))].join(' ');
  return BARE_STATS[stat] || stat;
};
const propKey = (eventId, player, market, line) => JSON.stringify([eventId, playerName(player), propMarket(market, player), Number(line)]);

/**
 * DFS picks in the shape the DFS tools use. A pick's fair probability comes only from sportsbook
 * prices for the same player, market and line: each book's two-sided Over/Under market is turned
 * into implied probabilities, devigged with `method` (see devig), then averaged (sharp books
 * weighted, mirrored books once). A probability the API sends with a DFS line is never used. Without
 * a two-sided sportsbook market the fair probability stays empty.
 */
// A DFS pick is a pregame, full-game line, so it is priced only from pregame, full-game quotes. A
// book's game must start within 12 hours of the pick's; one starting within 2 hours is that game.
const SAME_GAME_MS = 12 * 3_600_000, CLOSE_START_MS = 2 * 3_600_000;
// Sports where pick'em apps post part-game (1st half, 1st quarter) lines.
const PERIOD_SPORTS = new Set(['NFL', 'NCAAF', 'NBA', 'WNBA', 'NCAAB']);
const pickSide = side => DFS_SIDES[String(side ?? '').toLowerCase()] || '';
export function dfsPicks(picks, quotes, names = new Map(), { method = 'multiplicative', minBooks = 1, maxVigPercent } = {}) {
  // Sportsbook prices per player prop. Each book keeps its own Over and Under (books that mirror one
  // platform are averaged after devigging, so one book's Over is never paired with another's Under).
  const playerStat = (player, market) => JSON.stringify([playerName(player), propMarket(market, player)]);
  const add = (map, key, value) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); };
  const markets = new Map(), bookGames = new Map(), statBooks = new Map(), gameStart = new Map();
  for (const quote of quotes) {
    const side = pickSide(quote.side);
    if (!quote.player || !side || quote.live || String(quote.period || 'full').toLowerCase() !== 'full' || !Number.isFinite(implied(quote.odds))) continue;
    const key = propKey(quote.eventId, quote.player, quote.market, quote.line), stat = playerStat(quote.player, quote.market);
    add(bookGames, JSON.stringify([quote.book, stat]), quote.eventId);
    add(statBooks, stat, quote.book);
    const start = Date.parse(quote.startTime), game = JSON.stringify([quote.book, quote.eventId]);
    if (Number.isFinite(start) && !gameStart.has(game)) gameStart.set(game, start);
    if (!markets.has(key)) markets.set(key, new Map());
    const books = markets.get(key), book = books.get(quote.book) || { book: quote.book, family: quote.priceFamily || quote.book, exchange: quote.exchange === true };
    const ts = Date.parse(quote.ts) || 0;
    if (!(book[`${side}Ts`] > ts)) Object.assign(book, { [side]: implied(quote.odds), [`${side}Odds`]: Number(quote.odds), [`${side}Ts`]: ts });
    books.set(quote.book, book);
  }
  // Every book names and files games its own way (PrizePicks "IND @ WAS", FanDuel "Colts @
  // Commanders", one book's NFL game is another's NCAAF), so each book is matched on its own: its
  // game for this player and stat with the pick's event, else the one starting within 2 hours of the
  // pick, else its only game within 12 hours when the app lists the player in one game too. A player
  // a book lists in two games near the pick's start is never guessed.
  const appGames = new Map();
  for (const pick of picks) add(appGames, JSON.stringify([pick.book, playerStat(pick.player, pick.market)]), pick.eventId);
  const marketFor = pick => {
    const stat = playerStat(pick.player, pick.market), pickStart = Date.parse(pick.startTime), found = new Map();
    const appOneGame = appGames.get(JSON.stringify([pick.book, stat]))?.size === 1;
    for (const book of statBooks.get(stat) || []) {
      const gap = game => { const start = gameStart.get(JSON.stringify([book, game])); return Number.isFinite(start) && Number.isFinite(pickStart) ? Math.abs(start - pickStart) : null; };
      const near = [...bookGames.get(JSON.stringify([book, stat]))].filter(game => !(gap(game) > SAME_GAME_MS));
      const close = near.filter(game => gap(game) !== null && gap(game) <= CLOSE_START_MS);
      const game = near.includes(pick.eventId) ? pick.eventId : close.length === 1 ? close[0] : near.length === 1 && appOneGame ? near[0] : null;
      const entry = game && markets.get(propKey(game, pick.player, pick.market, pick.line))?.get(book);
      if (entry) found.set(book, entry);
    }
    return found;
  };
  // A pick'em line can be played either way at the same number: a standard line the feed sends as
  // More only is also listed as Less. Goblin and demon lines are More only.
  const keyOf = (pick, side) => JSON.stringify([pick.book, propKey(pick.eventId, pick.player, pick.market, pick.line), side]);
  const sent = new Set(picks.map(pick => keyOf(pick, pickSide(pick.side))));
  const latest = new Map();
  for (const pick of picks) {
    const side = pickSide(pick.side);
    if (!side) continue;
    const sides = side === 'over' && !['goblin', 'demon'].includes(pick.oddsType) && !sent.has(keyOf(pick, 'under')) ? ['over', 'under'] : [side];
    for (const each of sides) {
      const key = keyOf(pick, each), prior = latest.get(key);
      if (!prior || fresher(pick, prior)) latest.set(key, { ...pick, side: each, id: `local-api:${stableId(key)}` });
    }
  }
  // PrizePicks posts NFL stats for the 1st half and 1st quarter too, and the feed sends them under the
  // same name as the full game (Marcus Mariota "Pass Yards" 211.5, 98.5 and 40.5). An app has one
  // full-game standard line per player and stat: the highest, unless it's under 70% of the books'
  // main line (then the full-game line isn't listed). The other standard lines, and goblins and
  // demons nearest them, are part-game lines; full-game sportsbook prices can't price those.
  const mainLines = new Map();
  for (const [key, books] of markets) {
    const [, player, stat, line] = JSON.parse(key), id = JSON.stringify([player, stat]);
    for (const book of books.values()) {
      if (!(book.over > 0 && book.under > 0)) continue;
      const evenness = Math.abs(book.over / (book.over + book.under) - 0.5);
      if (!(mainLines.get(id)?.evenness <= evenness)) mainLines.set(id, { line, evenness });
    }
  }
  const partGame = new Set(), statLines = new Map();
  for (const pick of latest.values()) {
    if (!PERIOD_SPORTS.has(pick.sport) || /^[A-Z]{2,4}$/.test(String(pick.player).trim()) || !(Number(pick.line) > 0)) continue;
    const key = JSON.stringify([pick.book, pick.eventId, playerStat(pick.player, pick.market)]);
    if (!statLines.has(key)) statLines.set(key, []);
    statLines.get(key).push(pick);
  }
  for (const group of statLines.values()) {
    const standard = [...new Set(group.filter(pick => !['goblin', 'demon'].includes(pick.oddsType)).map(pick => Number(pick.line)))].sort((a, b) => b - a);
    if (!standard.length) continue;
    // Under 70% of the books' main line, and 3+ units below it: a 1H line (Jonathan Taylor Rush Yards 42.5
    // with FanDuel's main at 90.5). Small counts (Receptions 1.5 against 2.5) can differ that much legitimately.
    const main = mainLines.get(playerStat(group[0].player, group[0].market))?.line;
    const full = main > 0 && standard[0] < 0.7 * main && main - standard[0] >= 3 ? null : standard[0];
    if (full === standard[0] && standard.length < 2) continue;
    const anchors = [...standard.map(line => ({ line, full: line === full })), ...(full === null && main > 0 ? [{ line: main, full: true }] : [])];
    const gap = (line, anchor) => Math.abs(Math.log(line / anchor.line));
    for (const pick of group) if (!anchors.reduce((best, anchor) => gap(Number(pick.line), anchor) < gap(Number(pick.line), best) ? anchor : best).full) partGame.add(pick);
  }
  // PrizePicks sets a payout multiplier per goblin or demon projection. One value on (nearly) every
  // goblin or demon line of an app is a default, not that pick's multiplier (on 2 Oct 2026 the feed
  // sent 0.7 for all 6,080 goblins and 1.55 for all 16,183 demons, which showed +25% demon "edges"),
  // so it is ignored and those lines get no edge until real per-pick values arrive.
  const multipliers = new Map();
  for (const pick of latest.values()) {
    if (!['goblin', 'demon'].includes(pick.oddsType) || !pick.payoutMultiplier) continue;
    const key = `${pick.book}|${pick.oddsType}`, counts = multipliers.get(key) || new Map();
    counts.set(pick.payoutMultiplier, (counts.get(pick.payoutMultiplier) || 0) + 1);
    multipliers.set(key, counts);
  }
  const placeholder = new Map([...multipliers].map(([key, counts]) => {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0), [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    return [key, total >= 20 && count / total >= 0.9 ? value : NaN];
  }));
  const realMultiplier = pick => pick.payoutMultiplier && pick.payoutMultiplier !== placeholder.get(`${pick.book}|${pick.oddsType}`) ? pick.payoutMultiplier : null;
  // A sharp book's extra weight only on a low-margin market, as in consensusPrice: a 10%-hold "Pinnacle"
  // market isn't a sharp price.
  const weight = book => (book.over + book.under - 1) * 100 <= SHARP_MAX_VIG_PERCENT && DEFAULT_SHARP_WEIGHTS[String(book.book).toLowerCase()] || 1;
  return [...latest.values()].map(pick => {
    // Every sportsbook with this exact player, stat and line (one side or both), for the comparison;
    // the fair probability uses those that price both sides with a margin.
    // An exchange's prices only count as a market when both sides are there and add up to about 100%
    // or more: Novig sent prop pairs adding to 63-96% (+257 Over and +186 Under), which no one can bet.
    const listed = partGame.has(pick) ? [] : [...marketFor(pick).values()].filter(book => !book.exchange || book.over + book.under >= 0.98);
    const books = listed
      // A sportsbook pair whose implied probabilities sum to 100.5% or less has no margin to remove:
      // the feed built the Under from the Over (DraftKings and Fanatics milestone props, Oct 2026).
      .filter(book => Number.isFinite(book.over) && Number.isFinite(book.under) && (book.exchange || book.over + book.under > 1.005)
        // The member's maximum margin (Pricing settings) applies here as in every other tool.
        && !(Number(maxVigPercent) >= 0 && maxVigPercent !== '' && maxVigPercent != null && (book.over + book.under - 1) * 100 > Number(maxVigPercent)))
      .map(book => ({ ...book, fairOver: devig([book.over, book.under], method)[0] })).filter(book => Number.isFinite(book.fairOver));
    const families = new Map();
    for (const book of books) { if (!families.has(book.family)) families.set(book.family, []); families.get(book.family).push(book); }
    let total = 0, sum = 0;
    for (const group of families.values()) {
      const each = Math.max(...group.map(weight));
      total += each; sum += each * group.reduce((value, book) => value + book.fairOver, 0) / group.length;
    }
    // Fewer qualifying books (price families) than the member's minimum: no fair probability.
    const over = total && families.size >= Math.max(1, Number(minBooks) || 1) ? sum / total : NaN;
    const probability = Number.isFinite(over) ? (pick.side === 'over' ? over : 1 - over) : null;
    return {
      id: pick.id, app: pick.book, sport: pick.sport, ...(pick.matchSport ? { matchSport: pick.matchSport } : {}), league: pick.league, event: names.get(pick.eventId) || pick.event, eventId: pick.eventId,
      player: pick.player, ...(pick.team ? { team: pick.team } : {}), market: pick.market, line: pick.line, side: pick.side === 'under' ? 'Under' : 'Over',
      ...(pick.oddsType ? { oddsType: pick.oddsType } : pick.book === 'PrizePicks' ? { oddsType: 'standard' } : {}),
      ...(realMultiplier(pick) ? { payoutMultiplier: realMultiplier(pick) } : {}), ...(partGame.has(pick) ? { period: 'part' } : {}),
      probability, probabilityBooks: books.map(book => book.book), probabilityMethod: method,
      ...(books.length ? { probabilitySources: books.map(book => ({ book: book.book, over: book.overOdds, under: book.underOdds })) } : {}),
      ...(listed.length ? { bookLines: listed.map(book => ({ book: book.book, ...(Number.isFinite(book.overOdds) ? { over: book.overOdds } : {}), ...(Number.isFinite(book.underOdds) ? { under: book.underOdds } : {}), ...(book.exchange ? { exchange: true } : {}) })) } : {}),
      ts: pick.ts, startTime: pick.startTime, live: pick.live, source: 'local-api',
    };
  });
}

/**
 * Prices DFS lines from both feeds together, each line once: pick'em lines in the quote snapshot
 * (they carry the event and start time) and GET /site/dfs/props, against the latest sportsbook
 * quotes. It lives in the feed worker, so the page receives finished picks, and only when they
 * changed.
 */
export function createDfsPricer() {
  let quotes = [], names = new Map(), quotePicks = [], propPicks = [], last = '';
  // The game is part of a line's identity: Byron Murphy Jr. (MIA) and Byron Murphy II (LAC) normalize to
  // one name.
  const lineKey = pick => JSON.stringify([pick.book, pick.eventId, playerName(pick.player), propMarket(pick.market, pick.player), Number(pick.line), pickSide(pick.side)]);
  const statKey = pick => JSON.stringify([pick.book, pick.eventId, playerName(pick.player), propMarket(pick.market, pick.player)]);
  const merged = now => {
    // The quote snapshot refreshes every few seconds and the props feed every minute: where the snapshot
    // has a player's stat, its lines stand (a moved line would otherwise show at both numbers).
    const lines = new Map(), current = pick => (pick.live || !(Date.parse(pick.startTime) <= now)) && !(now - Date.parse(pick.ts) > FEED_MAX_AGE_MS);
    const listed = new Set(quotePicks.map(statKey));
    for (const pick of quotePicks) if (current(pick)) lines.set(lineKey(pick), pick);
    for (const pick of propPicks) {
      if (!current(pick)) continue;
      const key = lineKey(pick), prior = lines.get(key);
      if (!prior) { if (!listed.has(statKey(pick))) lines.set(key, pick); }
      // A goblin or demon flag from either feed sticks: those lines don't pay the standard table.
      else if (['goblin', 'demon'].includes(pick.oddsType) && !['goblin', 'demon'].includes(prior.oddsType)) lines.set(key, { ...prior, oddsType: pick.oddsType, ...(pick.payoutMultiplier ? { payoutMultiplier: pick.payoutMultiplier } : {}) });
      else if (pick.payoutMultiplier && !prior.payoutMultiplier) lines.set(key, { ...prior, payoutMultiplier: pick.payoutMultiplier });
    }
    return [...lines.values()];
  };
  return {
    setQuotes(result) { quotes = result.quotes || []; names = result.names || new Map(); quotePicks = result.picks || []; },
    setProps(picks) { propPicks = picks || []; },
    /**
     * Priced picks, or null when they are the same as the last call's (`force` sends them anyway: the
     * page didn't receive the last answer). Started games and lines neither feed has refreshed in 15
     * minutes are left out even when one feed hasn't answered since.
     */
    price(method = 'multiplicative', { now = Date.now(), force = false, minBooks = 1, maxVigPercent } = {}) {
      const priced = dfsPicks(merged(now), quotes, names, { method, minBooks, maxVigPercent });
      let hash = 0x811c9dc5;
      for (const pick of priced) {
        const prices = (pick.bookLines || []).map(line => `${line.book}${line.over ?? ''}/${line.under ?? ''}`).join(',');
        const text = `${pick.id}|${pick.line}|${pick.probability}|${pick.oddsType || ''}|${pick.payoutMultiplier || ''}|${pick.period || ''}|${pick.startTime || ''}|${pick.event || ''}|${prices};`;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      }
      const fingerprint = `${priced.length}:${hash >>> 0}`;
      if (fingerprint === last && !force) return null;
      last = fingerprint;
      return priced;
    },
  };
}

/** One feed request (kind 'quotes' or 'dfs') through a pricer: the page gets quotes and/or priced DFS picks. */
export async function loadAndPrice(pricer, { kind = 'quotes', url, syncedAt, apps = [], method = 'multiplicative', minBooks = 1, maxVigPercent, force = false } = {}) {
  const result = kind === 'dfs' ? await loadDfsFeed(url, syncedAt, apps, { method, price: false }) : await loadFeed(url, syncedAt, { method, price: false });
  if (!result.ok) return result;
  if (kind === 'dfs') pricer.setProps(result.picks); else pricer.setQuotes(result);
  const { picks, names, ...rest } = result;
  const dfs = pricer.price(method, { now: Date.parse(syncedAt) || Date.now(), force, minBooks, maxVigPercent });
  return dfs ? { ...rest, dfs } : rest;
}

/**
 * Fetches and cleans the snapshot. Runs in the feed worker (public/ev-feed-worker.js) or, where
 * module workers aren't supported, in the page. Returns a plain result object; never throws.
 */
export async function loadFeed(url, syncedAt = new Date().toISOString(), { method = 'multiplicative', price = true } = {}) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
    // Feed times come from the server's clock; measure how far this device's clock is off.
    const serverNow = Date.parse(response.headers.get('Date') || ''), offset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
    let payload;
    try { payload = await response.json(); }
    catch (error) {
      // A connection dropped or slowed mid-download is a network problem or a timeout, worth retrying.
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return { ok: false, kind: 'timeout' };
      if (error?.name !== 'SyntaxError') return { ok: false, kind: 'network', message: String(error?.message || '') };
      return { ok: false, kind: 'unreadable', status: response.status };
    }
    if (!response.ok) return { ok: false, kind: 'http', status: response.status, payload, retryAfter: response.headers.get('Retry-After') };
    const records = Array.isArray(payload) ? payload : payload?.quotes;
    if (!Array.isArray(records)) return { ok: false, kind: 'shape' };
    if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) return { ok: false, kind: 'partial' };
    const { quotes, dfs, picks, names, skipped } = normalizeFeed(records, { syncedAt, clockOffsetMs: Math.abs(offset) > 5_000 ? offset : 0, method, price });
    // The proxy names when it fetched the snapshot it served and flags held-over or partial ones.
    const snapshotAt = typeof payload?.snapshotAt === 'string' && Number.isFinite(Date.parse(payload.snapshotAt)) ? payload.snapshotAt : '';
    return { ok: true, quotes, ...(price ? { dfs } : { picks, names }), skipped, total: records.length, ...(snapshotAt ? { snapshotAt } : {}), ...(payload?.stale === true ? { stale: true } : {}), ...(payload?.warmingUp === true ? { warmingUp: true } : {}) };
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
// PrizePicks names leagues without a matchup by code ("CS2", "PGA", "NBASZN" for season-long NBA)
// where the game goes; the feed files most of them as Other and some under the wrong sport
// (badminton "BAD" as MMA, KBO as MLB). The code says the sport.
const LEAGUE_CODES = {
  NFL: 'NFL', CFB: 'NCAAF', NBA: 'NBA', NBASZN: 'NBA', WNBA: 'WNBA', CBB: 'NCAAB', MLB: 'MLB', NHL: 'NHL', KBO: 'KBO', NPB: 'NPB',
  CS2: 'Esports', LOL: 'Esports', R6: 'Esports', DOTA2: 'Esports', VAL: 'Esports', COD: 'Esports', HALO: 'Esports', APEX: 'Esports', RL: 'Esports',
  PGA: 'Golf', EUROGOLF: 'Golf', LIVGOLF: 'Golf', LPGA: 'Golf', NASCAR: 'Motorsports', F1: 'Motorsports', INDYCAR: 'Motorsports', MOTOGP: 'Motorsports',
  DARTS: 'Darts', TT: 'Table Tennis', BAD: 'Badminton', UFC: 'MMA', MMA: 'MMA', BOXING: 'Boxing', TENNIS: 'Tennis', SOCCER: 'Soccer', CRICKET: 'Cricket',
};
// The feed files college football as NFL and the WNBA as NBA. PrizePicks names games by team
// abbreviation ("PITT @ VT", "DAL @ GSV"): a game with a team that isn't an NFL abbreviation is
// college, and one with a WNBA-only abbreviation is WNBA.
const NFL_TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX JAC KC LV LAC LAR LA MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS WSH'.split(' '));
const WNBA_ONLY_TEAMS = new Set('CON CONN GSV LVA LAS NYL PHO SEA'.split(' '));
const abbreviations = event => { const teams = participantsOf(event); return teams && [teams.away, teams.home].every(team => /^[A-Z&]{2,5}$/.test(team)) ? [teams.away, teams.home] : null; };
/**
 * Corrects DFS picks' sport for display and filtering (in place). Matching against sportsbook quotes
 * keeps using the feed's sport (matchSport), because the books carry the same labels.
 */
function relabelDfsSports(picks) {
  const relabel = (pick, sport) => { if (sport && sport !== pick.sport) { pick.matchSport ??= pick.sport; pick.sport = sport; } };
  const key = pick => `${pick.book}|${propName(pick.player)}`, sports = new Map(), byLeague = new Set();
  for (const pick of picks) {
    const league = LEAGUE_CODES[String(pick.event ?? '').trim().toUpperCase()];
    // Every series in a league shares the league code as its event; the start time tells them apart.
    if (league) { relabel(pick, league); byLeague.add(pick); if (pick.startTime && !String(pick.eventId).includes('|')) pick.eventId = `${pick.eventId}|${pick.startTime}`; }
  }
  for (const pick of picks) {
    if (byLeague.has(pick) || !BASKETBALL.has(pick.sport)) continue;
    const sport = NOT_BASKETBALL.find(([pattern]) => pattern.test(String(pick.market).toLowerCase()))?.[1];
    if (sport) sports.set(key(pick), sport);
  }
  // A game filed as football whose lines are another sport's moves to that sport: the feed files some
  // NHL, MLB and NWSL games as NFL ("SEA @ EDM" Shots On Goal, "CWS @ CLE" Total Bases).
  const gameSports = new Map(), footballGames = new Set();
  for (const pick of picks) {
    if (byLeague.has(pick) || !FOOTBALL.has(pick.sport)) continue;
    const market = String(pick.market).toLowerCase();
    if (FOOTBALL_MARKETS.test(market)) { footballGames.add(pick.eventId); continue; }
    const sport = NOT_FOOTBALL.find(([pattern]) => pattern.test(market))?.[1];
    if (sport && !gameSports.has(pick.eventId)) gameSports.set(pick.eventId, sport);
  }
  for (const pick of picks) {
    if (byLeague.has(pick)) continue;
    if (BASKETBALL.has(pick.sport) && sports.has(key(pick))) { relabel(pick, sports.get(key(pick))); continue; }
    if (FOOTBALL.has(pick.sport) && gameSports.has(pick.eventId) && !footballGames.has(pick.eventId)) {
      const sport = gameSports.get(pick.eventId);
      relabel(pick, sport === 'Basketball' ? (abbreviations(pick.event) || []).some(team => WNBA_ONLY_TEAMS.has(team)) ? 'WNBA' : 'NBA' : sport);
      continue;
    }
    const teams = abbreviations(pick.event);
    if (!teams) continue;
    if (pick.sport === 'NFL' && teams.some(team => !NFL_TEAMS.has(team))) relabel(pick, 'NCAAF');
    else if (pick.sport === 'NBA' && teams.some(team => WNBA_ONLY_TEAMS.has(team))) relabel(pick, 'WNBA');
  }
  // Football lines the feed files under another sport in a football game (VAN @ UGA passing yards as
  // NHL, LOU @ NCST as NWSL) take the game's football label.
  const footballLabels = new Map();
  for (const pick of picks) if (FOOTBALL.has(pick.sport) && FOOTBALL_MARKETS.test(String(pick.market).toLowerCase())) footballLabels.set(`${pick.book}|${pick.event}|${pick.startTime}`, pick.sport);
  for (const pick of picks) { const sport = footballLabels.get(`${pick.book}|${pick.event}|${pick.startTime}`); if (sport && !FOOTBALL.has(pick.sport) && FOOTBALL_MARKETS.test(String(pick.market).toLowerCase())) relabel(pick, sport); }
  // Lines the feed sends without a sport ("MICH @ MINN" Rush Yards as Other) take the sport of the
  // app's other lines for that game.
  const gameSport = new Map();
  for (const pick of picks) if (pick.sport && pick.sport !== 'Other' && pick.event) gameSport.set(`${pick.book}|${pick.event}`, pick.sport);
  for (const pick of picks) if (pick.sport === 'Other') relabel(pick, gameSport.get(`${pick.book}|${pick.event}`));
  return picks;
}
const FOOTBALL = new Set(['NFL', 'NCAAF']);
// ("FG Made" is left out: basketball has field goals too.)
const FOOTBALL_MARKETS = /\b(pass|passing|rush|rushing|receiving|receptions|rec targets|anytime tds|touchdowns|interceptions|int|sacks|tackles|kicking points|punts|longest (reception|rush|completion))\b/;
const NOT_FOOTBALL = [
  [/\b(pitcher strikeouts|hitter strikeouts|total bases|hits\+runs\+rbis|earned runs|hits allowed|pitching outs|stolen bases|home runs|rbis|walks allowed)\b/, 'MLB'],
  [/\b(shots on goal|goalie saves|goals allowed|power play points|blocked shots|faceoffs? won|time on ice)\b/, 'NHL'],
  [/\b(shots on target|passes attempted|clearances|crosses|attempted dribbles|goal \+ assist)\b/, 'Soccer'],
  [/\b(rebounds|rebs|3-pt|3pm|pts\+|blks|stls|steals|turnovers|double-double|triple-doubles?)\b/, 'Basketball'],
];
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
  const skipped = { invalid: 0, notProps: 0, stale: 0, started: 0 };
  const picks = [];
  for (const raw of list) {
    const app = canonicalPlatform(text(raw, 'app') || text(raw, 'book')), player = text(raw, 'player') || text(raw, 'player_name');
    const market = text(raw, 'market'), side = DFS_SIDES[text(raw, 'side').toLowerCase()], line = Number(raw?.line), ts = Date.parse(text(raw, 'ts'));
    if (!app || !player || !market || !side || !Number.isFinite(line) || !Number.isFinite(ts)) { skipped.invalid += 1; continue; }
    if (DFS_NON_PROPS.has(market.toLowerCase()) || SEASON_LABEL.test(player) || line <= 0) { skipped.notProps += 1; continue; }
    if (now - ts > FEED_MAX_AGE_MS) { skipped.stale += 1; continue; }
    // A pregame line for a game that has started can't be entered any more.
    const start = Date.parse(text(raw, 'startTime') || text(raw, 'start_time'));
    if (raw.live !== true && Number.isFinite(start) && start <= now) { skipped.started += 1; continue; }
    const sport = sportName(text(raw, 'sport')), event = text(raw, 'event');
    const matched = matchedEventKey(sport, event);
    picks.push({
      id: text(raw, 'id'), book: app, sport, league: text(raw, 'league') || SOCCER_LEAGUES[text(raw, 'sport').toLowerCase()] || '',
      event, eventId: matched ? `${sport}:${matched}` : event ? `${sport}:${event.toLowerCase()}` : `${sport}:${propName(player)}`,
      player, market, line, side, ts: new Date(ts).toISOString(), startTime: Number.isFinite(start) ? new Date(start).toISOString() : '', live: raw.live === true,
      ...(text(raw, 'team') ? { team: text(raw, 'team') } : {}), ...lineType(raw),
    });
  }
  return { picks: relabelDfsSports(dropReplaced(picks, pick => JSON.stringify([pick.book, pick.eventId]), skipped)), skipped };
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
// Apps the API answered with no lines are asked again after 10 minutes, not every minute.
const emptyApps = new Map();
export async function loadDfsFeed(url, syncedAt = new Date().toISOString(), apps = [], { method = 'multiplicative', price = true } = {}) {
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
    const missing = [...new Set(apps)].filter(app => app && !present.has(canonicalPlatform(app)) && !(emptyApps.get(app) > Date.now()));
    const extra = await Promise.all(missing.map(app => read(`${url}${url.includes('?') ? '&' : '?'}app=${encodeURIComponent(app)}`).catch(() => ({ ok: false }))));
    missing.forEach((app, i) => { if (extra[i].ok && !extra[i].records.length) emptyApps.set(app, Date.now() + 600_000); else emptyApps.delete(app); });
    const seen = new Set(), records = [];
    for (const raw of [base.records, ...extra.filter(result => result.ok).map(result => result.records)].flat()) {
      const id = text(raw, 'id');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      records.push(raw);
    }
    const { picks, skipped } = normalizeDfsRecords(records, { syncedAt });
    return { ok: true, picks, ...(price ? { dfs: dfsPicks(picks, [], undefined, { method }) } : {}), skipped, total: records.length };
  } catch (error) {
    return { ok: false, kind: error?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
