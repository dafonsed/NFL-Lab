// SportWizzard (https://sportwizzard.com/developers) as a quote source for the odds service.
//
// Its /api/v1/odds feed is one flat row per price per book. Rows are converted into the quote feed's
// record shape (the same records lib/odds/normalize.mjs reads from the main feed), so pricing, EV,
// arbitrage and every tool work on them unchanged. The browser never calls SportWizzard; the key stays
// on the server.
//
// Taken, for the full game and for each part of it (halves, quarters, periods, innings, regulation):
//   - moneylines, three-way results, spreads and totals;
//   - Over/Under player props and "N+" player milestones (as Over N−0.5);
//   - player yes/no props: anytime TD, goal, assist, hit and home run as Over 0.5 of the stat (so they
//     pair with the books' Over/Under and 1+ lines and with DFS picks), the rest (carded, first and last
//     scorer, most yards ...) as Yes/No props of the player;
//   - game props (type 'game-prop'): team totals, other game totals and handicaps (corners, cards,
//     touchdowns), three-way handicaps, draw no bet, yes/no game markets (both teams to score, clean
//     sheet, overtime ...), odd/even, race-to, first team to score, winning margins and bands;
//   - pick'em apps' player lines for DFS (see DFS_APPS), with part-game lines named by their part.
// Kalshi moneylines get Kalshi's own order-book depth (lib/odds/kalshi.mjs) for Smart Money.
// Left out on purpose:
//   - futures (marketScope): no game, and no two-way fair price;
//   - bets on two players or several results at once (head-to-heads, either-player and combined-player
//     props, same-game parlays, result-and-total doubles, correct scores and squares): rows name one
//     player or a book's own label for the combination, so the bet can't be told apart or compared;
//   - milestones that don't name their threshold ("Yes" on a pass-yards ladder);
//   - pick'em lines with a changed payout (goblins, boosts) and suspended lines.
// Configuration (server only, set in the hosting environment):
//   SPORTWIZZARD_API_KEY   key from the API Keys tab of a SportWizzard account (sent as X-Api-Key)
//   SPORTWIZZARD_ENABLED   0 turns the source off; it is on by default (the API doesn't require a key today)
//   SPORTWIZZARD_API_URL   optional, defaults to https://api.sportwizzard.com
//   KALSHI_DEPTH           0 turns off the Kalshi depth lookup (on by default; Kalshi's market data needs no key)

import { kalshiDepthEnabled, kalshiMarkets, withKalshiDepth } from './kalshi.mjs';
import { propMarket, FEED_MAX_AGE_MS } from './normalize.mjs';
import { canonicalPlatform } from '../../public/platform-catalog.js';
import { sportName } from '../../public/sport-names.js';

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
const OTHER_MARKETS = 'TEAM_TOTAL,SPREAD_3_WAY,YES_NO,CATEGORICAL,RACE_TO,WINNING_MARGIN,BAND,PLAYER_YES_NO,PLAYER_FIRST_TO';
// SportWizzard files other markets under the game ones: Caesars' total field-goal yards and punts sit under
// TOTAL, regulation draw-no-bet under MONEYLINE, card counts under the three-way. Only the game's own
// result and score are game lines; the rest are game props. US football moneylines push on a tie, so
// draw-no-bet is the moneyline there.
const SOCCER = new Set(['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'mls', 'ucl', 'soccer']);
const GAME_TOTALS = { nfl: ['TOTAL_POINTS'], ncaaf: ['TOTAL_POINTS'], nba: ['TOTAL_POINTS'], wnba: ['TOTAL_POINTS'], ncaab: ['TOTAL_POINTS'],
  mlb: ['TOTAL_RUNS'], nhl: ['TOTAL_GOALS', 'TOTAL_POINTS'], mma: ['TOTAL_ROUNDS'], tennis: ['TOTAL_GAMES'] };
const DRAW_NO_BET = new Set(['MONEYLINE_DRAW_NO_BET', 'DRAW_NO_BET', 'TIE_NO_BET']);
// How a row is read: 'moneyline', 'three-way', 'spread', 'total' (the game's own lines), 'game-prop'
// (another game market), or null (left out).
const marketKind = (market, subtype, sport) => {
  switch (market) {
    // A soccer two-way "moneyline" (Fliff, Liga MX) is a draw-no-bet the normalizer would read as a
    // three-way missing its draw, clashing with the book's real three-way.
    case 'MONEYLINE':
      if (subtype === 'MONEYLINE') return SOCCER.has(sport) ? null : 'moneyline';
      if (subtype === 'MONEYLINE_3WAY') return 'three-way';
      if (DRAW_NO_BET.has(subtype)) return subtype === 'MONEYLINE_DRAW_NO_BET' && (sport === 'nfl' || sport === 'ncaaf') ? 'moneyline' : 'game-prop';
      return null;
    case 'MONEYLINE_3_WAY': return subtype === 'MONEYLINE_3WAY' || subtype === 'THREE_WAY_RESULT' ? 'three-way' : DRAW_NO_BET.has(subtype) ? 'game-prop' : null;
    case 'SPREAD': return subtype === 'SPREAD' ? 'spread' : 'game-prop';
    case 'TOTAL': return (SOCCER.has(sport) ? ['TOTAL_GOALS'] : GAME_TOTALS[sport] || []).includes(subtype) ? 'total' : 'game-prop';
    case 'TEAM_TOTAL': return subtype === 'NONE' ? null : 'game-prop';
    case 'YES_NO': return subtype === 'MONEYLINE_3_WAY' ? null : 'game-prop';
    case 'SPREAD_3_WAY': case 'CATEGORICAL': case 'RACE_TO': case 'WINNING_MARGIN': case 'BAND': return 'game-prop';
    case 'PLAYER_TOTAL': case 'PLAYER_MILESTONE': case 'PLAYER_YES_NO': case 'PLAYER_FIRST_TO': return 'prop';
    default: return null;
  }
};
// Categorical markets that are really scores or combinations ("Bills 7-3 Rams" squares, "Atlanta Dream
// / Over 42.5"): each book labels them its own way, so they can't be compared.
const COMBINATION = /SQUARES|CORRECT_SCORE|DOUBLE|_AND_|SPECIALS|H2H|NEXT_PLAY|FIRST_PLAY|DRIVE_OUTCOME|DRIVE_GRANULAR/;

// SportWizzard's period codes → the feed's period: the part-game words the normalizer and DFS tools
// already use ("1h", "1q", "1p", "f5") where there is one, else the code ("reg", "1inn", "1inn_3inn").
// 'PERIOD' (theScore's "current period") doesn't say which.
const PERIODS = { FULL: 'full', '1INN_5INN': 'f5' };
const periodOf = value => { const code = String(value || '').trim().toUpperCase(); return !code || code === 'PERIOD' ? null : PERIODS[code] || code.toLowerCase(); };
// Parts a pick'em app's line can be priced for (sportsbooks post the same part's props).
const PICK_PERIODS = new Set(['1h', '2h', '1q', '2q', '3q', '4q', '1p', '2p', '3p', 'f5']);

// Pick'em apps → the platform catalog's names. PrizePicks, Pick6 and Betr mark a standard line with a
// 1x multiplier; any other value is a goblin, demon or boost that changes the entry's payout, which the
// DFS board can't price from this feed, so those lines are left out. Sleeper, Chalkboard, WannaParlay,
// HotStreak and Boom pay a multiplier per pick (an entry pays their product: WannaParlay's Over 0.5
// tackles ×1.05 and Over 4.5 ×8.5, HotStreak's Over 0.5 goals ×7.07), so every line is taken with its
// multiplier as the pick's payoutMultiplier (public/dfs-workspace.js PER_PICK_APPS); a pick paying 1× or
// less can't beat its own line and is left out. Underdog and Boom post season-long lines today (no
// game, so they're skipped with the other season markets); their game-day lines come through as listed.
const DFS_APPS = { prizepicks: 'PrizePicks', dabble: 'Dabble', dkpick6: 'DraftKings Pick6', sleeper: 'Sleeper Picks', chalkboard: 'Chalkboard',
  wannaparlay: 'WannaParlay', hotstreak: 'HotStreak', boom: 'Boom Fantasy', betr: 'Betr Picks', underdog: 'Underdog Fantasy' };
const PER_PICK_APPS = new Set(['sleeper', 'chalkboard', 'wannaparlay', 'hotstreak', 'boom']);
// Dabble adjusts a standard line's payout per side (Over 6.5 rush attempts ×1.1, Under ×0.7): the entry
// pays its table times each pick's adjustment, as a goblin or demon does on PrizePicks. Underdog adjusts
// its lines the same way, but only its 50/50 lines (1×) are taken; adjusted ones are left out.
const ADJUSTED_APPS = new Set(['dabble']);
const pickPayout = (slug, multiplier) => {
  const value = Number(multiplier);
  if (PER_PICK_APPS.has(slug)) return value > 1 && value < 100 ? { payoutMultiplier: value } : null;
  if (ADJUSTED_APPS.has(slug) && value > 0 && value < 100 && value !== 1) return { oddsType: 'adjusted', payoutMultiplier: value };
  return multiplier == null || multiplier === '' || value === 1 ? {} : null;
};
const LIVE_STATUSES = new Set(['live', 'in_progress', 'inprogress', 'in-progress', 'started']);
const DONE_STATUSES = new Set(['final', 'closed', 'complete', 'completed', 'cancelled', 'canceled', 'postponed']);

const titleCase = value => value.toLowerCase().split(/[_\s]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
// Stat abbreviations keep their capitals ("FG Made", not "Fg Made").
const ACRONYMS = { Fg: 'FG', Fgs: 'FGs', Pat: 'PAT', Td: 'TD', Tds: 'TDs', Rbi: 'RBI', Rbis: 'RBIs', Sog: 'SOG', Hr: 'HR', Ot: 'OT' };
// A market's name from its code: BOTH_TEAMS_TO_SCORE is "Both Teams To Score".
const codeName = code => titleCase(String(code || '')).split(' ').map(word => ACRONYMS[word] || word).join(' ');
// PLAYER_TOTAL_REC_YARDS and the milestone's PLAYER_REC_YARDS name one stat.
const statName = subtype => codeName(String(subtype || '').replace(/^PLAYER_(?:TOTAL_)?/, ''));
const lineText = line => String(line);
const signed = line => `${line > 0 ? '+' : ''}${line}`;

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
  // A book that posts one bet as a milestone and a yes/no (1+ TDs and anytime TD) keeps the newest.
  const selection = record => [record.eventId, record.book, record.period || 'full', propMarket(record.market, record.player), record.player, record.line, record.side].join('|');
  const props = new Set(records.filter(record => record.type === 'prop' && !record.fromMilestone).map(selection));
  const newest = new Map();
  for (const record of records) if (record.fromMilestone && !props.has(selection(record)) && !(Date.parse(newest.get(selection(record))?.ts) >= Date.parse(record.ts))) newest.set(selection(record), record);
  const unique = records.filter(record => !record.fromMilestone || newest.get(selection(record)) === record).map(({ fromMilestone, ...record }) => record);
  const main = withFeedLag(withOutcomeCounts(mainLinesOnly(unambiguous(oneResultPerBook(unique)))));
  return { records: main, skipped: skipped + records.length - main.length };
}

// SportWizzard files several of a book's markets as its one full-game result: BetMGM's match result
// (Barcelona -1200) beside two three-way handicaps (-400, -600) on 9 Oct 2026, and US football
// moneylines both as MONEYLINE and draw-no-bet. One book pricing one selection two ways makes the
// normalizer drop every copy, so where a book sends a result side more than once, the copy nearest
// the books that send it once is kept (within RESULT_GAP); identical copies are one price. Without two
// such books to compare against, the copies go.
const RESULT_TYPES = new Set(['moneyline', 'three-way']), RESULT_GAP = 0.08;
const impliedOf = odds => 1 / decimalOf(odds);
function oneResultPerBook(records) {
  const sides = new Map();
  for (const record of records) {
    if (!RESULT_TYPES.has(record.type) || record.odds == null) continue;
    const key = [record.eventId, record.period || 'full', record.type, record.side].join('|');
    if (!sides.has(key)) sides.set(key, new Map());
    const books = sides.get(key);
    books.set(record.book, [...(books.get(record.book) || []), record]);
  }
  const drop = new Set();
  for (const books of sides.values()) {
    const single = [...books.values()].filter(copies => copies.length === 1).map(([record]) => impliedOf(record.odds));
    const centre = single.length >= 2 ? median(single) : null;
    for (const copies of books.values()) {
      if (copies.length === 1) continue;
      const newest = [...copies].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
      if (new Set(copies.map(record => record.odds)).size === 1) { newest.slice(1).forEach(record => drop.add(record)); continue; }
      const nearest = centre === null ? null : newest.reduce((best, record) => Math.abs(impliedOf(record.odds) - centre) < Math.abs(impliedOf(best.odds) - centre) ? record : best);
      for (const record of copies) if (record !== nearest || Math.abs(impliedOf(record.odds) - centre) > RESULT_GAP) drop.add(record);
    }
  }
  return records.filter(record => !drop.has(record));
}

// SportWizzard rescrapes each book on its own cycle: Caesars about every 18 minutes, BetParx in waves up
// to 35 minutes apart (9 Oct 2026), most books every few minutes; BetParx, BetMGM and FanDuel go game by
// game, so one game's prices can be 20+ minutes old while the book's next game is seconds old. A price's
// age counts from its book's latest pass over that game, not from now, so a game waiting its turn isn't
// dropped as stale while a price that pass didn't see still is (theScore drops lines between passes).
// feedLagSeconds is how far the book's newest price in the game (game lines and props separately)
// trails now; a book further behind than MAX_FEED_LAG isn't being kept current (ProphetX, hours old) and
// gets no allowance; nor does one within 2 minutes of now.
// BetParx's soccer waves reach 36+ minutes apart (9 Oct 2026: games last scraped 2, 12 and 36 minutes ago).
const MAX_FEED_LAG_MS = 45 * 60_000;
// A price older than the normalizer's limit plus the most lag a book is allowed can never be current, so
// it isn't converted (ProphetX and pick'em apps leave thousands of hours-old rows in the feed).
const tooOld = updated => !(Date.now() - Date.parse(updated) <= FEED_MAX_AGE_MS + MAX_FEED_LAG_MS);
function withFeedLag(records, now = Date.now()) {
  const group = record => [record.sport, record.league || '', record.book, record.eventId || '', record.type === 'prop' ? 'prop' : 'game'].join('|');
  const newest = new Map();
  for (const record of records) {
    const seen = Date.parse(record.ts);
    if (Number.isFinite(seen) && !(seen <= (newest.get(group(record)) ?? -Infinity))) newest.set(group(record), seen);
  }
  return records.map(record => {
    const lag = now - (newest.get(group(record)) ?? now);
    return lag > 2 * 60_000 && lag <= MAX_FEED_LAG_MS ? { ...record, feedLagSeconds: Math.round(lag / 1000) } : record;
  });
}

// Books post whole ladders (alternate spreads, totals and prop lines) under the same market, even with
// is_main. A ladder isn't one market: its far rungs aren't priced like the main line, and pairing every
// rung against every other made ~1M "middles" on one NFL board. Each book keeps the one line in each
// market whose two sides are priced closest to even (its main line); moneylines have no line.
// A prop line that isn't a book's main line (an alternate, or one priced on one side only) is kept as
// depthOnly: the engine and the page skip it, but DFS lists every book that posts a pick's exact line.
// A book's only "at least once" line (Over 0.5) is its main line even when it prices one side (DraftKings'
// anytime TD at -160, Yes only): other books' two-sided markets price it. Game props with a line (team
// totals, corners) keep their main line the same way; their alternates go.
// Some books also tag quarter and half totals as the full game (a 7.5 "total" beside 44.5), so once three
// or more books post a game spread or total, a book's main line has to sit near their median.
const decimalOf = odds => odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
const LADDERED = new Set(['spread', 'total', 'prop', 'game-prop']);
// Lines a book's ladder is chosen among: game lines, Over/Under props, and two-way game props with a line
// (a three-way handicap's lines are each a market; yes/no and labelled outcomes have no ladder).
const laddered = record => LADDERED.has(record.type) && record.odds != null && record.line !== ''
  && (record.type !== 'game-prop' || ['over', 'under', 'home', 'away'].includes(record.side) && !record.market.includes('3-Way'));
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const nearConsensus = (type, line, centre) => Math.abs(line - centre) <= (type === 'total' ? Math.max(0.2 * Math.abs(centre), 1.5) : Math.max(0.35 * Math.abs(centre), 2.5));
function mainLinesOnly(records) {
  const groups = new Map();
  const homeLine = record => record.type === 'spread' ? (record.side === 'home' ? record.line : -record.line) : record.line;
  for (const record of records) {
    if (!laddered(record)) continue;
    const key = [record.eventId, record.period || 'full', record.book, record.type, record.market, record.player || ''].join('|');
    if (!groups.has(key)) groups.set(key, { type: record.type, market: [record.eventId, record.period || 'full', record.type, record.market].join('|'), lines: new Map() });
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
  const firstPick = new Map(), consensus = new Map(), gameLine = group => group.type === 'spread' || group.type === 'total';
  // A one-sided line stands on its own when it is the book's only line: an "at least once" prop (anytime TD
  // is Over 0.5) or a game prop's one line. A one-sided prop ladder (15+, 25+, 40+ yards) stays comparison-only.
  const lone = group => { const [line] = group.lines.keys(); return group.lines.size === 1 && (group.type === 'game-prop' || line === 0.5) ? line : null; };
  for (const [key, group] of groups) {
    const line = mainLine(group.lines) ?? (gameLine(group) ? null : lone(group));
    firstPick.set(key, line);
    if (line !== null && gameLine(group)) consensus.set(group.market, [...(consensus.get(group.market) || []), line]);
  }
  const keep = new Set(), oneSided = new Set();
  for (const [key, group] of groups) {
    const lines = consensus.get(group.market);
    const centre = gameLine(group) && lines?.length >= 3 ? median(lines) : null;
    const best = centre === null ? firstPick.get(key) : mainLine(group.lines, line => nearConsensus(group.type, line, centre));
    if (best !== null) for (const record of group.lines.get(best)) keep.add(record);
    if (best !== null && group.type === 'prop' && mainLine(group.lines) === null) for (const record of group.lines.get(best)) oneSided.add(record);
  }
  // Lone one-sided player lines are many (Kambi lists every soccer and hockey player's anytime goal and
  // assist) and travel with the page's "More markets" (scope 'more', lib/odds/providers.mjs); anytime TD stays
  // with the main markets.
  return records.flatMap(record => !laddered(record) || keep.has(record) ? [oneSided.has(record) && record.market !== 'Anytime TDs' ? { ...record, scope: 'more' } : record]
    : record.type === 'prop' ? [{ ...record, depthOnly: true }] : []);
}

// Some rows don't carry everything that tells two bets apart: BetMGM's "race to" goals in one game come
// without the goal count, and a book's 1+, 2+ and 3+ rungs can share one code. Where a book prices one
// game-prop or yes/no selection more than once at different prices, which is which can't be known and
// every copy goes; identical copies are one price (the newest stands).
// A labelled outcome (a winning margin, a band, "1st Half") only one book posts can't be compared with
// anything, so it goes as well.
function unambiguous(records) {
  const checked = record => record.odds != null && (record.type === 'game-prop' || record.type === 'prop' && record.line === '');
  const selection = record => [record.eventId, record.period || 'full', record.book, record.type, record.market, record.player || '', record.line, record.side, Boolean(record.live)].join('|');
  const copies = new Map();
  for (const record of records) if (checked(record)) { const key = selection(record); if (!copies.has(key)) copies.set(key, []); copies.get(key).push(record); }
  const drop = new Set();
  for (const list of copies.values()) {
    if (list.length < 2) continue;
    if (new Set(list.map(record => record.odds)).size > 1) list.forEach(record => drop.add(record));
    else [...list].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(1).forEach(record => drop.add(record));
  }
  const labelled = record => record.type === 'game-prop' && !CODED_SIDES.has(record.side), outcome = record => [record.eventId, record.period || 'full', record.market, record.line, record.side].join('|');
  const books = new Map();
  for (const record of records) if (labelled(record) && !drop.has(record)) { if (!books.has(outcome(record))) books.set(outcome(record), new Set()); books.get(outcome(record)).add(record.book); }
  return records.filter(record => !drop.has(record) && !(labelled(record) && books.get(outcome(record)).size < 2));
}

// A game prop's outcomes are only known to be every outcome when the books' sides form a closed set:
// home/away (draw no bet, first team to score a TD), odd/even, or home/away with a draw, tie or neither.
// Those get their count, so a book posting all of them can be de-vigged; yes/no and over/under need none.
// Labels (winning margins, bands, "1st Half") may leave outcomes out, so they are compared but not priced.
const CLOSED_SETS = [['away', 'home'], ['even', 'odd'], ['away', 'draw', 'home'], ['away', 'home', 'neither'], ['away', 'home', 'tie']];
function withOutcomeCounts(records) {
  const key = record => [record.eventId, record.period || 'full', record.market, record.line, Boolean(record.live)].join('|'), sides = new Map();
  for (const record of records) if (record.type === 'game-prop') { if (!sides.has(key(record))) sides.set(key(record), new Set()); sides.get(key(record)).add(record.side); }
  const counts = new Map([...sides].map(([group, set]) => [group, CLOSED_SETS.find(closed => closed.length === set.size && closed.every(side => set.has(side)))?.length]));
  return records.map(record => record.type === 'game-prop' && counts.get(key(record)) ? { ...record, outcomes: counts.get(key(record)) } : record);
}

function toFeedRecord(row, event) {
  if (!row || typeof row !== 'object' || !event) return null;
  const period = periodOf(row.period);
  if (row.marketScope || row.suspended === true || !period || tooOld(row.updated)) return null;
  const slug = String(row.sportsbook || '').trim().toLowerCase();
  if (DFS_APPS[slug] && (row.priceAmerican == null || row.priceAmerican === '')) return pickemRecord(row, event, slug, period);
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
    ...(period !== 'full' ? { period } : {}),
    ...(EXCHANGES.has(slug) && Number.isFinite(row.liquidity) ? { liquidity: row.liquidity } : {}),
  };
  const market = String(row.market || '').toUpperCase(), subtype = String(row.marketSubtype || '').toUpperCase();
  switch (marketKind(market, subtype, league[0])) {
    case 'moneyline':
      if (!['home', 'away'].includes(side)) return null;
      // SportWizzard's side is normalized; its selection label is often abbreviated ("CBJ Blue Jackets"),
      // so the selection is named with the event's own team name.
      return { ...base, market: 'moneyline', type: 'moneyline', side, selection_name: side === 'home' ? home : away };
    case 'three-way':
      if (!['home', 'away', 'draw'].includes(side)) return null;
      return { ...base, market: '1x2', type: 'three-way', side, outcomes: 3, selection_name: side === 'draw' ? 'Draw' : side === 'home' ? home : away };
    case 'spread':
      if (!['home', 'away'].includes(side) || !Number.isFinite(line)) return null;
      return { ...base, market: 'spread', type: 'spread', side, line, selection_name: `${side === 'home' ? home : away} ${signed(line)}` };
    case 'total':
      if (!['over', 'under'].includes(side) || !Number.isFinite(line)) return null;
      return { ...base, market: 'total', type: 'total', side, line, selection_name: `${side === 'over' ? 'Over' : 'Under'} ${lineText(line)}` };
    case 'prop':
      return playerProp(base, row, market, subtype, side, line, league[0]);
    case 'game-prop':
      // A categorical market with a player on each outcome (DraftKings' "Last TD Scorer") is the player's yes/no bet.
      if (String(row.playerName || '').trim()) return ['yes', 'no'].includes(side) ? playerProp(base, row, 'PLAYER_YES_NO', subtype, side, line, league[0]) : null;
      return gameProp(base, row, { home, away }, market, subtype, line);
    default:
      return null;
  }
}

// Player yes/no bets on doing something at least once: Over 0.5 of the stat the books' props and DFS
// picks use ("Anytime TDs" as the normalizer reads "Anytime Touchdown Scorer"). To score or assist is
// points in hockey and goals + assists in soccer.
const AT_LEAST_ONE = { PLAYER_TO_SCORE_TD: 'Anytime TDs', PLAYER_TO_SCORE_GOAL: 'Goals', PLAYER_TO_ASSIST: 'Assists', PLAYER_TO_HIT_HR: 'Home Runs', PLAYER_TO_RECORD_HIT: 'Hits' };
// One bet filed under several codes (and markets) gets one name, so the books compare.
const PLAYER_BETS = {
  PLAYER_FIRST_TD: 'First TD Scorer', FIRST_TD_SCORER: 'First TD Scorer', PLAYER_FIRST_TO_SCORE_TD: 'First TD Scorer', PLAYER_FIRST_TD_SCORER: 'First TD Scorer',
  PLAYER_LAST_TO_SCORE_TD: 'Last TD Scorer', PLAYER_LAST_TD_SCORER: 'Last TD Scorer',
  PLAYER_FIRST_GOAL_SCORER: 'First Goal Scorer', PLAYER_FIRST_TO_SCORE_GOAL: 'First Goal Scorer', PLAYER_LAST_TO_SCORE_GOAL: 'Last Goal Scorer',
  PLAYER_TEAM_FIRST_TD: 'Team First TD Scorer', PLAYER_TEAM_FIRST_GOAL: 'Team First Goal Scorer', PLAYER_TO_BE_SHOWN_YELLOW_CARD: 'To Be Carded', PLAYER_TO_BE_CARDED: 'To Be Carded',
};

function playerProp(base, row, market, subtype, side, line, sport) {
  const player = String(row.playerName || '').trim();
  if (!player) return null;
  const team = row.teamName ? { team: String(row.teamName) } : {};
  const overUnder = (stat, direction, at) => ({ ...base, market: stat, type: 'prop', player, side: direction, line: at, selection_name: `${direction === 'over' ? 'Over' : 'Under'} ${lineText(at)}`, ...team });
  if (market === 'PLAYER_TOTAL') {
    const stat = statName(subtype);
    return ['over', 'under'].includes(side) && Number.isFinite(line) && stat ? overUnder(stat, side, line) : null;
  }
  if (market === 'PLAYER_MILESTONE') {
    // "Christian Watson 15+" is Over 14.5 receiving yards; Fliff's "62.5+" is Over 62.5; Hard Rock's "Over 1.5"
    // says it outright. A row that only says "Yes" or the player has no threshold: a book's 1+, 2+ and 3+
    // rungs all arrive alike (BetMGM, FanDuel), and some books start at 2+ TDs (BetParx +230 and +1000 beside
    // a -245 anytime TD), so the rungs can't be told apart by price either.
    // N+ touchdowns are the anytime TD ladder (2+ is Anytime TDs Over 1.5), as the yes/no anytime TD is Over 0.5.
    const selection = String(row.selection || ''), threshold = /(\d+(?:\.\d+)?)\+\s*$/.exec(selection), over = /^over\s+(\d+\.5)$/i.exec(selection.trim());
    const stat = subtype === 'PLAYER_TDS' ? 'Anytime TDs' : statName(subtype);
    const direction = side === 'yes' ? 'over' : side === 'no' ? 'under' : '';
    if (!(threshold || over) || !direction || !stat) return null;
    const count = Number((threshold || over)[1]), at = Number.isInteger(count) ? count - 0.5 : count;
    return { ...overUnder(stat, direction, at), fromMilestone: true };
  }
  // theScore files plain "to be carded" under first-to bets too, so which one a row is can't be told.
  if (!['yes', 'no'].includes(side) || (market === 'PLAYER_FIRST_TO' && subtype === 'PLAYER_TO_BE_CARDED')) return null;
  const count = subtype === 'PLAYER_TO_SCORE_OR_ASSIST' ? (sport === 'nhl' ? 'Points' : 'Goals + Assists') : AT_LEAST_ONE[subtype];
  if (count) return { ...overUnder(count, side === 'yes' ? 'over' : 'under', 0.5), fromMilestone: true };
  const bet = PLAYER_BETS[subtype] || codeName(subtype.replace(/^PLAYER_/, ''));
  return { ...base, market: bet, type: 'prop', player, side, line: '', selection_name: side === 'yes' ? 'Yes' : 'No', ...team };
}

// Game-prop outcomes: SportWizzard's codes, else the team the outcome names (teamSide), else the book's label.
const GAME_SIDES = { YES: 'yes', NO: 'no', OVER: 'over', UNDER: 'under', ODD: 'odd', EVEN: 'even', HOME: 'home', AWAY: 'away', 1: 'home', 2: 'away',
  DRAW: 'draw', X: 'draw', TIE: 'tie', NEITHER: 'neither', NONE: 'neither', NO_GOAL: 'neither' };
// Outcomes about a team's own game (its total, its clean sheet) name the team in the market.
const TEAM_MARKET_SIDES = new Set(['yes', 'no', 'over', 'under', 'odd', 'even']);
const SCORING_TEAM_TOTALS = new Set(['TEAM_TOTAL', 'TEAM_TOTAL_POINTS', 'TEAM_TOTAL_GOALS', 'TEAM_TOTAL_RUNS']);
const GAME_PROP_NAMES = { SPREAD_3_WAY: '3-Way Handicap', SPREAD_3_WAY_CORNERS: '3-Way Corners Handicap', SPREAD_3_WAY_CARDS: '3-Way Cards Handicap', SPREAD_CORNERS: 'Corners Handicap' };
const label = value => String(value ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const CODED_SIDES = new Set(Object.values(GAME_SIDES));
// A game prop's name from its code, read the way books print it: "Odd/Even", "10+ Rush".
const propName = code => codeName(code).replace(/\bOdd Even\b/g, 'Odd/Even').replace(/\b(\d+)plus\b/gi, '$1+');

function gameProp(base, row, teams, market, subtype, line) {
  const raw = String(row.side || '').trim().toUpperCase(), teamSide = String(row.teamSide || '').trim().toLowerCase();
  const role = teamSide === 'home' || teamSide === 'away' ? teamSide : '';
  // A label with a number is a score, margin or band ("Kraken to win by 1"), not the team itself.
  const side = GAME_SIDES[raw] || (role && !/\d/.test(raw) ? role : label(row.selection || row.side).toLowerCase());
  if (!side) return null;
  // Scores and combinations ("Bills 7-3 Rams" squares, "Atlanta Dream / Over 42.5"): each book labels them
  // its own way, so they can't be compared or priced.
  if (!GAME_SIDES[raw] && /SQUARES|CORRECT_SCORE|DOUBLE(?!_CHANCE)|_AND_|SPECIALS|H2H/.test(subtype)) return null;
  // A market about a number ("race to", "both teams to score X points", "Xth goal") is a different bet for
  // each number; a row without the number as its line can't say which, and books pick different ones.
  if ((/(^|_)XT?H?(_|$)/.test(subtype) || /RACE_TO/.test(subtype) || market === 'RACE_TO') && !Number.isFinite(line)) return null;
  const teamName = role ? teams[role] : String(row.teamName || '').trim();
  const team = TEAM_MARKET_SIDES.has(side) || market === 'TEAM_TOTAL' ? teamName : '';
  if (market === 'TEAM_TOTAL' && !team) return null;
  const name = market === 'TEAM_TOTAL' ? (SCORING_TEAM_TOTALS.has(subtype) ? 'Team Total' : propName(subtype.replace(/^TEAM_/, '')))
    : DRAW_NO_BET.has(subtype) ? 'Draw No Bet' : GAME_PROP_NAMES[subtype] || propName(subtype);
  let at = Number.isFinite(line) ? line : '', selection = label(row.selection) || side;
  if (side === 'over' || side === 'under') {
    if (at === '') return null;
    selection = `${side === 'over' ? 'Over' : 'Under'} ${lineText(at)}`;
  } else if (side === 'yes' || side === 'no') selection = side === 'yes' ? 'Yes' : 'No';
  else if (side === 'home' || side === 'away') {
    // A two-way handicap is keyed by the home team's line (as spreads are), so both sides are one market;
    // a three-way handicap's rows already all carry it.
    if (at !== '' && market === 'SPREAD' && !subtype.includes('3_WAY') && side === 'away') at = -at;
    selection = at === '' ? teams[side] : `${teams[side]} ${signed(side === 'home' ? at : -at)}`;
  } else if (side === 'draw') selection = at === '' ? 'Draw' : `Draw (${teams.home} ${signed(at)})`;
  return { ...base, type: 'game-prop', market: team ? `${team} ${name}` : name, side, line: at, selection_name: selection, ...(team ? { team } : {}) };
}

// A pick'em line: no price, so the normalizer makes it a DFS pick and prices it against the sportsbooks'
// Over/Under props for the same player, stat and line. A part-game line names its part in the stat
// ("Rec Yards 1H"), which pairs it with the books' props for that part (lib/odds/normalize.mjs dfsPicks).
function pickemRecord(row, event, slug, period) {
  const league = LEAGUES[String(row.league || '').toLowerCase()];
  const home = String(event.homeTeamName || '').trim(), away = String(event.awayTeamName || '').trim();
  const status = String(event.status || '').toLowerCase(), side = String(row.side || '').toLowerCase();
  const player = String(row.playerName || '').trim(), stat = statName(row.marketSubtype), line = Number(row.line);
  if (!league || !home || !away || DONE_STATUSES.has(status) || LIVE_STATUSES.has(status) || typeof row.updated !== 'string') return null;
  if (String(row.market || '').toUpperCase() !== 'PLAYER_TOTAL' || !['over', 'under'].includes(side) || !player || !stat || !(line > 0)) return null;
  if (period !== 'full' && !PICK_PERIODS.has(period)) return null;
  const payout = pickPayout(slug, row.dfsMultiplier);
  if (!payout) return null;
  return {
    id: `sw:${row.id}`, sport: league[0], ...(league[1] ? { league: league[1] } : {}),
    event: `${away} @ ${home}`, eventId: `sw-${row.eventId}`, startTime: event.startTime || '', ts: row.updated,
    book: DFS_APPS[slug], type: 'prop', market: period === 'full' ? stat : `${stat} ${period.toUpperCase()}`, player, side, line, live: false,
    selection_name: `${side === 'over' ? 'Over' : 'Under'} ${lineText(line)}`, ...(row.teamName ? { team: String(row.teamName) } : {}), ...payout,
  };
}

// ---- Fetching ----

const PAGE_LIMIT = 1000, MAX_PAGES = 80, REQUEST_TIMEOUT_MS = 20_000, RETRY_DELAY_MS = 1_000, CONCURRENCY = 4, MAX_EXTRA_EVENTS = 60;
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

// A page that times out or meets a busy server (HTTP 429/5xx) is asked once more: under load single
// pages time out (NFL, NCAAF and EPL on 9 Oct 2026) and one lost page would otherwise lose the whole request.
async function pageOnce(config, fetcher, path, params) {
  try { return await getJson(config, fetcher, path, params); }
  catch (error) {
    const status = Number(/HTTP (\d+)/.exec(error?.message || '')?.[1]);
    if (!(error?.name === 'TimeoutError' || error?.name === 'AbortError' || status === 429 || status >= 500)) throw error;
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return getJson(config, fetcher, path, params);
  }
}

async function allPages(config, fetcher, path, params) {
  const rows = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await pageOnce(config, fetcher, path, { ...params, limit: PAGE_LIMIT, cursor });
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
  let partial = false;
  const [events, gameRows, propRows, milestoneRows, otherRows, markets] = await Promise.all([
    allPages(config, fetcher, '/api/v1/events', { league }),
    // is_main: each book's primary game line only (alternate spread ladders are most of the rows and aren't priced here).
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: GAME_MARKETS, is_main: 'true' }),
    // Props with their alternates (a few percent more rows): a book's alternate at a DFS app's line still prices that pick.
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: PROP_MARKETS }),
    // Milestones are one-sided ladders: comparison lines for DFS and +EV, never a main line.
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: MILESTONE_MARKETS, is_main: 'true' }),
    // Team totals, game props and player yes/no bets, every line (a team total ladder is each its own market).
    // Extras: when this call fails the league keeps its main lines and props (or its last full set, fetchBoard).
    allPages(config, fetcher, '/api/v1/odds', { league, scope: 'event', market: OTHER_MARKETS })
      .catch(error => { console.error(`[sportwizzard] ${league} game props:`, error?.message || error); partial = true; return []; }),
    config.kalshi ? kalshiMarkets(fetcher, league) : [],
  ]);
  const rows = [...gameRows, ...propRows, ...milestoneRows, ...otherRows], byId = new Map(events.map(event => [event.id, event]));
  // /events lists the next few weeks; a game further out (NHL on 31 Dec, 9 Oct 2026) is fetched by id.
  const missing = [...new Set(rows.map(row => row.eventId).filter(id => id && !byId.has(id)))].slice(0, MAX_EXTRA_EVENTS);
  await inPool(missing, async id => {
    try { const body = await getJson(config, fetcher, `/api/v1/events/${encodeURIComponent(id)}`); if (body.data[0]?.id === id) byId.set(id, body.data[0]); }
    catch { /* the game's rows are skipped */ }
  });
  const { records, skipped } = toFeedRecords(withKalshiDepth(rows, markets), byId);
  return { records, skipped, partial };
}

// A league whose request failed (or whose game props didn't come) keeps its records from the previous
// board for up to CARRY_OVER_MS, counted from when they were fetched. Without this a league that timed out
// (NFL, NCAAF, MLB and EPL on 9 Oct 2026) vanished from the board until the next refresh, so its lines and
// the DFS odds priced from them blinked in and out. The records are the previous board's own objects (no
// copy), and they keep their update times, so normalize still ages them out like any other price.
const CARRY_OVER_MS = 10 * 60_000;
async function fetchBoard(config, fetcher, sport, previous = null) {
  const active = await activeLeagues(config, fetcher);
  const wanted = sport ? (SPORT_LEAGUES[String(sport).toLowerCase()] || []).filter(code => active.includes(code)) : active;
  const results = await inPool(wanted, async league => {
    try { return await leagueRecords(config, fetcher, league); }
    catch (error) { console.error(`[sportwizzard] ${league}:`, error?.message || error); return { records: [], skipped: 0, failed: true }; }
  });
  const leagues = new Map(), at = Date.now();
  results.forEach((result, index) => {
    const league = wanted[index], last = previous?.leagues?.get(league);
    if ((result.failed || result.partial) && last && at - last.at < CARRY_OVER_MS) {
      console.error(`[sportwizzard] ${league}: ${result.failed ? 'request failed' : 'game props missing'}; keeping its lines from ${Math.round((at - last.at) / 1000)} s ago.`);
      results[index] = { records: last.records, skipped: 0, carried: true };
      leagues.set(league, last);
    } else if (!result.failed) leagues.set(league, { at, records: result.records });
  });
  if (wanted.length && results.every(result => result.failed)) throw new Error('Every SportWizzard league request failed.');
  const seen = new Set(), quotes = [];
  for (const { records } of results) for (const record of records) if (!seen.has(record.id)) { seen.add(record.id); quotes.push(record); }
  return { base: config.base.href, at, quotes, leagues, dropped: results.reduce((sum, result) => sum + result.skipped, 0), droppedReasons: {}, stale: false, warmingUp: false };
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
    entry.refresh = fetchBoard(config, fetcher, sport, entry.good).then(snapshot => { entry.good = snapshot; return snapshot; })
      .finally(() => { entry.refresh = null; });
    entry.refresh.catch(error => console.error('[sportwizzard] Board refresh failed:', error?.message || error));
  }
  // A board a few minutes old is still current for these markets; only an older one says so on the page.
  if (age < SERVE_STALE_MS) return Promise.resolve(age < MARK_STALE_MS ? entry.good : { ...entry.good, stale: true });
  return entry.refresh;
}

/**
 * The main feed's snapshot with SportWizzard's lines added. Each book's lines in a sport (game lines and
 * player props apart) come from one source only, so no price is counted twice in the fair price: the
 * source with more of them, the main feed on a tie. Taking whole books from the main feed dropped
 * SportWizzard's 13,344 FanDuel and 979 Kalshi lines for the main feed's 3 and 4 (9 Oct 2026), and they
 * came back whenever the main feed was down, so those lines blinked in and out on the page.
 * The result is the same object while both inputs are unchanged (the normalizer caches per array).
 */
const merged = new WeakMap();
const names = new Map(), cachedName = (kind, raw, name) => {
  const key = `${kind}|${raw}`;
  if (!names.has(key)) { if (names.size > 5000) names.clear(); names.set(key, name(raw).toLowerCase()); }
  return names.get(key);
};
const mergeGroup = quote => `${cachedName('book', String(quote.book ?? ''), canonicalPlatform)}|${cachedName('sport', String(quote.sport ?? ''), raw => sportName(raw) || raw)}|${quote.player || /^(player|prop$)/i.test(String(quote.type ?? '')) ? 'prop' : 'game'}`;
export function mergeSnapshots(primary, extra) {
  if (!extra?.quotes?.length) return primary;
  if (!primary) return extra;
  const byExtra = merged.get(primary);
  if (byExtra?.extra === extra) return byExtra.snapshot;
  const groups = quotes => quotes.map(mergeGroup), ownGroups = groups(primary.quotes), extraGroups = groups(extra.quotes);
  const tally = list => { const counts = new Map(); for (const group of list) counts.set(group, (counts.get(group) || 0) + 1); return counts; };
  const own = tally(ownGroups), theirs = tally(extraGroups);
  const fromExtra = group => (theirs.get(group) || 0) > (own.get(group) || 0);
  const kept = primary.quotes.filter((_, index) => !fromExtra(ownGroups[index])), added = extra.quotes.filter((_, index) => fromExtra(extraGroups[index]));
  const snapshot = { ...primary, quotes: kept.length === primary.quotes.length && !added.length ? primary.quotes : [...kept, ...added], stale: Boolean(primary.stale || extra.stale) };
  merged.set(primary, { extra, snapshot });
  return snapshot;
}
