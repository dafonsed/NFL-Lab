import { implied } from '../../public/betting-math.js';

// Books name the same game differently ("CIN Bengals @ MIA Dolphins", "Bengals @ Dolphins",
// "Cincinnati Bengals @ Miami Dolphins"). Prices only compare when their event IDs match, so
// team-sport quotes get a shared ID built from team nicknames. Display names are unchanged.

// MLB is excluded: the same teams play on back-to-back days, and the feed's times can't tell
// those games apart. Nicknames are unique within each of these leagues.
export const MATCHED_SPORTS = new Set(['NFL', 'NBA', 'NHL', 'WNBA']);

// Club suffixes used by European and Australian teams the feed files under NBA/NHL ("Färjestad BK",
// "Frölunda HC"). They aren't nicknames, so those teams keep their full name as the key.
const CLUB_SUFFIXES = new Set(['if', 'hc', 'hk', 'bk', 'kk', 'fc', 'sc', 'cf', 'ac', 'ik', 'aik', 'hf', 'sk', 'bc', 'cd', 'ud', 'ehc', 'sv', 'tps', 'jyp']);

/** "CIN Bengals", "Bengals" and "Cincinnati Bengals" all become "bengals". */
export function teamKey(name) {
  // Notes in brackets ("(TBD)", a listed pitcher, "(W)") aren't part of the name.
  const words = String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  // A leading 2-4 letter code ("CIN", "LA", "NY") is a city abbreviation, not the nickname.
  if (words.length > 1 && /^[A-Z]{2,4}$/.test(words[0])) words.shift();
  if (!words.length) return '';
  const last = words[words.length - 1].toLowerCase();
  return CLUB_SUFFIXES.has(last) ? words.join(' ').toLowerCase() : last;
}

/**
 * Shared key for an "Away @ Home" (or "Away at Home") event, or null when the name can't be split
 * reliably. Fanatics names prop events "Home v Away" ("Washington Commanders v Indianapolis Colts" for
 * Colts @ Commanders), so a "v"/"vs" name is read home first, as participantsOf reads it.
 */
export function matchedEventKey(sport, event) {
  if (!MATCHED_SPORTS.has(sport)) return null;
  const text = String(event ?? ''), at = text.split(/\s+(?:@|at)\s+/), versus = text.split(/\s+(?:vs\.?|v)\s+/i);
  const parts = at.length === 2 ? at : versus.length === 2 ? [versus[1], versus[0]] : null;
  if (!parts) return null;
  const [away, home] = parts.map(teamKey);
  return away && home && away !== home ? `${away} @ ${home}` : null;
}

const TWO_WAY = new Set(['moneyline', 'spread', 'total', 'prop', 'alternate']);

/**
 * Drops two-way listings that can't be real prices at one book: both sides as underdogs
 * (a book never offers arbitrage against itself) or a margin above 25%. These come from
 * mislabeled sides in the feed and would show as huge fake EV or arbitrage. A listing is one
 * book's quotes for one event name and market, so a book that lists a game twice is checked
 * per listing. Single-sided quotes can't be checked and are kept. `identity(q)` must give the
 * market with its line (for spreads, both sides of one line share it).
 */
export function dropInconsistentListings(quotes, identity) {
  const listings = new Map();
  for (const quote of quotes) {
    // A game prop is two-way when it is yes/no, over/under or has two outcomes; a book's two labels of a
    // winning-margin market are two of many.
    const twoWay = TWO_WAY.has(quote.type) || quote.type === 'game-prop' && (['yes', 'no', 'over', 'under'].includes(quote.side) || Number(quote.outcomes) === 2);
    if (!twoWay || quote.live || (quote.outcomes !== '' && quote.outcomes != null && Number(quote.outcomes) !== 2)) continue;
    const key = JSON.stringify([quote.book, quote.event, identity(quote)]);
    if (!listings.has(key)) listings.set(key, []);
    listings.get(key).push(quote);
  }
  const rejected = new Set();
  // A spread or total "ladder" (several lines at one book) that only ever names one side can't
  // say which team each line belongs to, so it can't be compared with other books.
  const ladders = new Map();
  for (const quote of quotes) {
    // Sides confirmed against the selection name already say which team each line belongs to.
    if (!['spread', 'total'].includes(quote.type) || quote.live || quote.sideVerified) continue;
    const key = JSON.stringify([quote.book, quote.event, quote.type, quote.period || 'full']);
    if (!ladders.has(key)) ladders.set(key, []);
    ladders.get(key).push(quote);
  }
  for (const ladder of ladders.values()) {
    const lines = new Set(ladder.map(quote => String(quote.line))), sides = new Set(ladder.map(quote => String(quote.side).toLowerCase()));
    if (lines.size > 1 && sides.size === 1) ladder.forEach(quote => rejected.add(quote));
  }
  for (const listing of listings.values()) {
    const sides = new Map();
    for (const quote of listing) sides.set(String(quote.side).toLowerCase(), [...(sides.get(String(quote.side).toLowerCase()) || []), quote]);
    if (sides.size !== 2) continue;
    // Several prices for one side means the listing mixes markets; compare the best of each side.
    const total = [...sides.values()].reduce((sum, group) => sum + Math.min(...group.map(q => implied(q.odds))), 0);
    if (!(total >= 0.98 && total <= 1.25)) listing.forEach(quote => rejected.add(quote));
  }
  return { kept: quotes.filter(quote => !rejected.has(quote)), dropped: rejected.size };
}

/**
 * Some books send the game start as `ts` instead of when the price was seen. A `ts` more than
 * five minutes ahead can't be an observation, so it becomes the start time and the price counts
 * as seen at `syncedAt`. Returns { ts, startTime }.
 */
export function splitQuoteTimes({ ts, startTime = '' }, syncedAt) {
  const observed = Date.parse(ts), synced = Date.parse(syncedAt);
  if (Number.isFinite(observed) && Number.isFinite(synced) && observed > synced + 5 * 60_000) {
    return { ts: new Date(synced).toISOString(), startTime: startTime || new Date(observed).toISOString() };
  }
  return { ts, startTime };
}
