// Market identity: which prices are the same bet. Keys and record helpers only, no betting math.
// Shared by the server's normalization and analytics (lib/odds) and by browser code that groups or
// joins records (the bet ledger's saved quotes, line history).

/**
 * A price record as these helpers read it: a feed quote, a saved bet or a calculator leg. Records come from
 * JSON and forms, so every field is optional and loosely typed.
 * @typedef {{
 *   sport?: unknown, league?: unknown, eventId?: unknown, event?: unknown, playerId?: unknown, player?: unknown,
 *   marketId?: unknown, market?: unknown, period?: unknown, type?: unknown, side?: unknown, line?: unknown, live?: unknown,
 *   homeTeam?: Named, awayTeam?: Named, home?: Named, away?: Named, homeAway?: unknown, sideRole?: unknown, teamSide?: unknown,
 *   participants?: Named[] | null, outcomes?: unknown, outcomeSides?: unknown[] | null,
 *   settlement?: Json, settlementRules?: Json, includeOvertime?: Json, drawNoBet?: Json, deadHeat?: Json, pushRule?: Json,
 *   [field: string]: unknown
 * }} MarketQuote
 */
/** A team or participant: its name, or a record with a `name` (`string &` lets `.name` be read off either). @typedef {(string & { name?: undefined }) | { name?: unknown, [field: string]: unknown } | null | undefined} Named */
/**
 * A JSON value (settlement rules are compared by their JSON).
 * @typedef {string | number | boolean | null | JsonArray | JsonObject} Json
 * @typedef {Json[]} JsonArray
 * @typedef {{ [key: string]: Json }} JsonObject
 */

/** @param {unknown} value */
export const valuePresent = value => value !== undefined && value !== null && value !== '';
/** @param {unknown} value */
export const number = value => typeof value === 'number' ? (Number.isFinite(value) ? value : NaN)
  : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
/** @param {unknown} value */
const text = value => typeof value === 'string' ? value.trim() : '';
/** @param {unknown} value */
export const name = value => text(value).toLowerCase().replace(/\s+/g, ' ');
/** @param {unknown} value */
export const identifier = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : name(value);
/** An ISO time with an explicit zone, as milliseconds; NaN otherwise. @param {unknown} value */
export const timestamp = value => typeof value === 'string' && /(?:z|[+-]\d\d:\d\d)$/i.test(value) ? Date.parse(value) : NaN;
/** @param {MarketQuote | null | undefined} quote */
export const lineNumber = quote => number(quote?.line);
/** @param {MarketQuote | null | undefined} quote */
export const selection = quote => name(quote?.side);
/** @param {MarketQuote | null | undefined} quote */
export const isLive = quote => quote?.live === true;
/** @param {MarketQuote | null | undefined} quote */
export const kind = quote => name(quote?.type) === 'alternate'
  ? ['over', 'under'].includes(selection(quote)) ? 'total' : 'spread'
  : name(quote?.type) || (['over', 'under'].includes(selection(quote)) ? 'total' : 'moneyline');
/** Markets settled against a line (a whole-number line can push). @param {MarketQuote | null | undefined} quote */
export const thresholdMarket = quote => ['total', 'spread', 'prop', 'alternate'].includes(kind(quote)) || ['over', 'under'].includes(selection(quote));
/** @param {Json} value @returns {Json} */
const stable = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  : Array.isArray(value) ? value.map(stable) : value;
/** @param {MarketQuote | null | undefined} quote */
const settlementOf = quote => stable({
  rules: quote?.settlement ?? quote?.settlementRules ?? 'standard',
  overtime: quote?.includeOvertime ?? null,
  drawNoBet: quote?.drawNoBet ?? false,
  deadHeat: quote?.deadHeat ?? null,
  pushRule: quote?.pushRule ?? null
});
// Almost every price settles by the standard rules; that common case skips rebuilding the object.
const STANDARD_SETTLEMENT = settlementOf({});
/** @param {MarketQuote | null | undefined} quote */
const settlement = quote => quote?.settlement == null && quote?.settlementRules == null && quote?.includeOvertime == null && quote?.drawNoBet == null && quote?.deadHeat == null && quote?.pushRule == null ? STANDARD_SETTLEMENT : settlementOf(quote);
/** @param {MarketQuote | null | undefined} quote */
export const eventIdentity = quote => JSON.stringify([identifier(quote?.sport), identifier(quote?.league || quote?.sport), identifier(quote?.eventId || quote?.event)]);

// Spreads are keyed by the signed handicap of one stable participant. A team
// without an identifiable opponent is kept separate rather than matched by |line|.
/** @param {MarketQuote} quote */
function spreadCoordinate(quote) {
  const side = selection(quote), line = lineNumber(quote);
  if (!Number.isFinite(line)) return null;
  const home = name(quote.homeTeam?.name || quote.homeTeam || quote.home?.name);
  const away = name(quote.awayTeam?.name || quote.awayTeam || quote.away?.name);
  const designated = name(quote.homeAway || quote.sideRole || quote.teamSide);
  if (side === 'home' || designated === 'home' || home && side === home) return ['home', line];
  if (side === 'away' || designated === 'away' || away && side === away) return ['home', -line];
  const participants = Array.isArray(quote.participants) ? quote.participants.map(item => name(item?.name || item)).filter(Boolean) : [];
  const parsed = text(quote.event).split(/\s+(?:vs\.?|v\.?|@|at)\s+/i).map(name);
  const teams = participants.length === 2 ? participants : parsed.length === 2 ? parsed : [];
  if (teams.length === 2 && teams[0] !== teams[1] && teams.includes(side)) {
    const anchor = [...teams].sort()[0];
    return [anchor, side === anchor ? line : -line];
  }
  return ['unmatched:' + side, line];
}

/**
 * The exact market a price belongs to (with its line), or its line family (`includeLine` false).
 * @param {MarketQuote | null | undefined} quote
 * @param {boolean} [includeLine]
 */
export function marketIdentity(quote, includeLine = true) {
  if (!quote || typeof quote !== 'object') return '';
  const point = kind(quote) === 'spread' ? spreadCoordinate(quote) : Number.isFinite(lineNumber(quote)) ? lineNumber(quote) : null;
  return JSON.stringify([
    identifier(quote.sport), identifier(quote.league || quote.sport), identifier(quote.eventId || quote.event),
    identifier(quote.playerId || quote.player), identifier(quote.marketId || quote.market),
    name(quote.period || 'full'), kind(quote), settlement(quote), isLive(quote), ...(includeLine ? [point] : [])
  ]);
}

/**
 * Every outcome of `quote`'s market, sorted, when `rows` (records of that market) name all of them:
 * over/under, yes/no, else the sides found (two, three for a 1X2, or the quote's own `outcomes`
 * count). [] when an outcome is missing or the count can't be known (a future without a count).
 * @param {MarketQuote} quote
 * @param {MarketQuote[]} rows
 */
export function sideNames(quote, rows) {
  const side = selection(quote);
  if (['over', 'under'].includes(side)) return ['over', 'under'];
  if (['yes', 'no'].includes(side)) return ['yes', 'no'];
  const count = valuePresent(quote.outcomes) ? number(quote.outcomes) : kind(quote) === 'three-way' || kind(quote) === '1x2' ? 3 : kind(quote) === 'future' ? NaN : 2;
  const supplied = Array.isArray(quote.outcomeSides) ? quote.outcomeSides.map(name) : null;
  const found = [...new Set(supplied || rows.map(selection))].filter(Boolean).sort();
  return Number.isInteger(count) && count >= 2 && found.length === count && found.includes(side) ? found : [];
}

/** A short, stable hash of a key (two 32-bit FNV variants in base 36). @param {unknown} value */
export function stableHash(value) {
  const textValue = String(value);
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < textValue.length; i++) { const c = textValue.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
