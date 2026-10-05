// The browser's one way to odds data: the website API (/api/odds, lib/odds/http.mjs). Every page asks here
// instead of fetching odds itself, so switching the data source (the website's transition engine today,
// the odds API later) changes nothing in a page. Requests already in flight are shared, time out, and
// fail as OddsError ({ code, retryable }); answers are validated (odds-contract.js) before a page sees
// them. Nothing here computes a betting value: pages display what these functions return.
import { decodeSnapshot, decodeMeta, errorFromBody, OddsError, encodePreferences, CONTRACT_ID, isCurrent, fieldsOf } from './odds-contract.js';
import { alertMatches } from './odds-alerts.js';

/** @typedef {import('../lib/odds/contract').OddsSnapshot} OddsSnapshot */
/** @typedef {import('../lib/odds/contract').SnapshotMeta} SnapshotMeta */
/** @typedef {import('../lib/odds/contract').SnapshotSection} SnapshotSection */
/** @typedef {import('../lib/odds/contract').Quote} Quote */
/** @typedef {import('../lib/odds/contract').MarketSnapshot} MarketSnapshot */
/** @typedef {import('../lib/odds/contract').DfsPick} DfsPick */
/** @typedef {import('../lib/odds/contract').DfsResponse} DfsResponse */
/** @typedef {import('../lib/odds/contract').DfsLinePriceResponse} DfsLinePriceResponse */
/** @typedef {import('../lib/odds/contract').LineMovement} LineMovement */
/** @typedef {import('../lib/odds/contract').PredictionContract} PredictionContract */
/** @typedef {import('../lib/odds/contract').Event} OddsEvent */
/** @typedef {{ snapshot: OddsSnapshot, dropped: Record<string, number> }} Decoded */
/** A member's workspace settings; only the pricing keys travel (odds-contract.js encodePreferences). @typedef {unknown} Settings */
/** @typedef {{ settings?: Settings, sport?: string, live?: boolean, minEv?: number, limit?: number, books?: string[] }} SectionOptions */
/** @typedef {{ app: string, sport?: string, event?: string, player: string, market: string, line: number, side: string, startTime?: string, live?: boolean }} EnteredLine */

/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map();
// The server's clock minus this device's, from each response's Date header (whole seconds), so quote
// expiry times are compared on the server's clock. Ignored under 5 seconds.
let clockOffset = 0;
/** Now on the server's clock (expiresAt and staleAfter are server times). */
export const serverNow = () => Date.now() + clockOffset;

/** A fetch that timed out or was aborted. @param {unknown} error */
const timedOut = error => { const name = error && typeof error === 'object' ? /** @type {{ name?: unknown }} */ (error).name : ''; return name === 'TimeoutError' || name === 'AbortError'; };

/**
 * GET a website API route. `transform` runs once on the shared answer (each route has one), so callers
 * sharing a request share its decoding too.
 * @template [T=unknown]
 * @param {string} path
 * @param {Record<string, string | number | boolean | null | undefined>} [params]
 * @param {{ timeout?: number, transform?: (body: unknown) => T }} [options]
 * @returns {Promise<T>}
 */
async function request(path, params = {}, { timeout = 45_000, transform = /** @type {(body: unknown) => T} */ (body => body) } = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => [key, String(value)]));
  const search = query.toString(), url = search ? `${path}?${search}` : path;
  const shared = inflight.get(url);
  if (shared) return /** @type {Promise<T>} */ (shared);
  const pending = (async () => {
    let response;
    try { response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) }); }
    catch (error) {
      throw new OddsError(timedOut(error) ? 'TIMEOUT' : 'UNAVAILABLE', timedOut(error) ? 'The odds request timed out.' : 'The odds service could not be reached.');
    }
    const date = Date.parse(response.headers.get('Date') || '');
    if (Number.isFinite(date)) { const offset = date - Date.now(); clockOffset = Math.abs(offset) > 5_000 ? offset : 0; }
    /** @type {unknown} */
    let body;
    try { body = await response.json(); }
    catch (error) {
      // A connection dropped mid-download is worth another try; a body that isn't JSON is malformed.
      throw new OddsError(timedOut(error) ? 'TIMEOUT' : response.ok ? 'MALFORMED' : 'UNAVAILABLE', undefined, { status: response.status });
    }
    if (!response.ok) {
      const failure = errorFromBody(body, response.status), retry = response.headers.get('Retry-After');
      if (/^\d+$/.test(retry || '') && !Number.isFinite(failure.retryAfterSeconds)) failure.retryAfterSeconds = Number(retry);
      throw failure;
    }
    return transform(body);
  })().finally(() => inflight.delete(url));
  inflight.set(url, pending);
  return pending;
}

/** @param {Settings} settings */
const prefsOf = settings => encodePreferences(settings || {});
// The books a member can bet, sorted so one state's members share one cached answer; none means every book.
/** @param {string[] | undefined} books */
const booksOf = books => Array.isArray(books) && books.length ? [...new Set(books)].sort().join(',') : undefined;

/**
 * Prices and the analytics sections a page needs (getOdds for every market).
 * @param {{ settings?: Settings, include?: (SnapshotSection | 'events')[], sport?: string, books?: string[] }} [options] `books`: the
 *   sportsbooks the member can bet (holds and hedge pairs choose best prices among them)
 * @returns {Promise<Decoded>}
 */
export async function getSnapshot({ settings, include = ['pricing', 'markets'], sport, books } = {}) {
  return request('/api/odds/snapshot', { include: include.join(','), sport, books: booksOf(books), prefs: prefsOf(settings) }, { timeout: 60_000, transform: decodeSnapshot });
}
/** A section view: the section's records and only the quotes they name. @param {string} route */
const section = route => /** @param {SectionOptions} [options] @returns {Promise<OddsSnapshot>} */ async ({ settings, sport, live, minEv, limit, books } = {}) => (await request(`/api/odds/${route}`, { sport, live, minEv, limit, books: booksOf(books), prefs: prefsOf(settings) }, { transform: decodeSnapshot })).snapshot;
/** The +EV rows (positive, plausible, highest first) with their quotes. */
export const getEV = section('ev');
export const getArbitrage = section('arbitrage');
export const getMiddles = section('middles');
export const getHolds = section('holds');
export const getSharpMoney = section('sharp');
export const getHedges = section('hedges');
/** Market summaries (fair, average) for a sport. */
export const getMarkets = section('markets');
/**
 * Games with prices ({ events }), or one game's prices, pricing and market summaries (`event`).
 * @param {{ settings?: Settings, sport?: string, event?: string }} [options]
 * @returns {Promise<OddsSnapshot | { meta: SnapshotMeta, events: OddsEvent[] }>}
 */
export async function getEvents({ settings, sport, event } = {}) {
  const body = await request('/api/odds/events', { sport, event, prefs: prefsOf(settings) });
  if (event) return decodeSnapshot(body).snapshot;
  const { meta, events } = fieldsOf(body);
  return { meta: decodeMeta(meta), events: /** @type {OddsEvent[]} */ (Array.isArray(events) ? events.filter(item => typeof fieldsOf(item).id === 'string') : []) };
}
/** One game's prices with their pricing and market summaries. @param {{ settings?: Settings, event: string }} options */
export const getOdds = async ({ settings, event }) => /** @type {OddsSnapshot} */ (await getEvents({ settings, event }));

// A probability that is missing (null, '' or undefined) is unknown, not 0%.
/** @param {unknown} value @returns {number | null} */
const probabilityOrNull = value => value !== null && value !== undefined && value !== '' && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : null;

/**
 * Pick'em (DFS) lines priced against the sportsbooks, with each app's payout tables.
 * @param {{ settings?: Settings }} [options]
 * @returns {Promise<{ meta: SnapshotMeta, payouts: DfsResponse['payouts'], picks: DfsPick[] }>}
 */
export async function getDfs({ settings } = {}) {
  const body = fieldsOf(await request('/api/odds/dfs', { prefs: prefsOf(settings) }));
  if (body.contract !== CONTRACT_ID || !Array.isArray(body.picks)) throw new OddsError('MALFORMED');
  return { meta: decodeMeta(body.meta), payouts: /** @type {DfsResponse['payouts']} */ (fieldsOf(body.payouts)),
    picks: body.picks.map(fieldsOf).filter(pick => typeof pick.id === 'string' && typeof pick.app === 'string').map(pick => /** @type {DfsPick} */ ({ ...pick, probability: probabilityOrNull(pick.probability) })) };
}
/**
 * Fair probabilities for pick'em lines a member entered (at most 50), in the same order.
 * @param {{ settings?: Settings, lines: EnteredLine[] }} options
 * @returns {Promise<DfsLinePriceResponse['lines']>}
 */
export async function getDfsLinePrices({ settings, lines }) {
  const body = fieldsOf(await request('/api/odds/dfs/price', { lines: JSON.stringify(lines), prefs: prefsOf(settings) }, { timeout: 30_000 }));
  if (body.contract !== CONTRACT_ID || !Array.isArray(body.lines) || body.lines.length !== lines.length) throw new OddsError('MALFORMED');
  return body.lines.map(fieldsOf).map(line => /** @type {DfsLinePriceResponse['lines'][number]} */ ({ ...line, probability: probabilityOrNull(line.probability) }));
}
/**
 * Recorded prices for a quote's market: its book's sides and up to four other books.
 * @param {{ quoteId: string, hours?: number }} options
 * @returns {Promise<{ meta: SnapshotMeta, series: LineMovement[] }>}
 */
export async function getLineMovement({ quoteId, hours = 24 }) {
  const body = fieldsOf(await request('/api/odds/history', { id: quoteId, hours }, { timeout: 20_000 }));
  if (body.contract !== CONTRACT_ID || !Array.isArray(body.series)) throw new OddsError('MALFORMED');
  return { meta: decodeMeta(body.meta), series: /** @type {LineMovement[]} */ (body.series.filter(series => typeof fieldsOf(series).quoteId === 'string' && Array.isArray(fieldsOf(series).points))) };
}
/**
 * Prediction-market contracts (bid/ask in cents).
 * @param {{ platform?: string }} [options]
 * @returns {Promise<PredictionContract[]>}
 */
export async function getPredictionContracts({ platform } = {}) {
  const body = fieldsOf(await request('/api/odds/contracts', { platform }, { timeout: 20_000 }));
  if (body.contract !== CONTRACT_ID || !Array.isArray(body.contracts)) throw new OddsError('MALFORMED');
  return body.contracts;
}
/** The quote source's collection status (per book), for the coverage view. @returns {Promise<unknown>} */
export async function getSourceStatus() {
  return request('/api/ev/status', {}, { timeout: 15_000 });
}
/** A member's alert rule against API data (see odds-alerts.js); no request. @type {typeof alertMatches} */
export const getAlerts = (rule, data, options) => alertMatches(rule, data, options);

/**
 * Lookups over one snapshot for display: quotes by id and by market, each quote's pricing and market
 * summary, and the analytics sections (null when the snapshot didn't include one).
 * @param {Partial<OddsSnapshot> | null | undefined} snapshot
 */
export function indexSnapshot(snapshot) {
  const quotes = snapshot?.quotes || [];
  const byId = new Map(quotes.map(quote => [quote.id, quote]));
  /** @type {Map<string, Quote[]>} */
  const byMarket = new Map();
  for (const quote of quotes) { const key = quote.marketKey || quote.id, rows = byMarket.get(key); if (rows) rows.push(quote); else byMarket.set(key, [quote]); }
  const pricing = new Map((snapshot?.pricing || []).map(row => [row.quoteId, row]));
  const markets = new Map((snapshot?.markets || []).map(market => [market.key, market]));
  /** @param {MarketSnapshot | undefined} market @param {Pick<Quote, 'side'>} quote */
  const sideOf = (market, quote) => market?.sides.find(side => side.side === quote.side) || null;
  /** @param {Partial<Pick<Quote, 'marketKey'>> | null | undefined} quote */
  const marketOf = quote => quote?.marketKey ? markets.get(quote.marketKey) : undefined;
  return {
    meta: snapshot?.meta || null, quotes, byId, pricing,
    /** @param {SnapshotSection} section */
    has: section => Array.isArray(snapshot?.[section]),
    /** Every book's price in the quote's exact market (its line), the quote included. @param {Quote | null | undefined} quote @returns {Quote[]} */
    peers: quote => (quote?.marketKey ? byMarket.get(quote.marketKey) : undefined) || (quote ? [quote] : []),
    /** @param {Partial<Pick<Quote, 'marketKey'>> | null | undefined} quote */
    market: quote => marketOf(quote) || null,
    /** The market's fair and average price for the quote's side. @param {Partial<Pick<Quote, 'marketKey'>> & Pick<Quote, 'side'>} quote */
    marketSide: quote => sideOf(marketOf(quote), quote),
    /** @param {Partial<Pick<Quote, 'id'>> | null | undefined} quote */
    pricingOf: quote => (quote?.id ? pricing.get(quote.id) : undefined) || null,
    arbitrage: snapshot?.arbitrage || null, middles: snapshot?.middles || null, holds: snapshot?.holds || null,
    sharp: snapshot?.sharp || null, hedges: snapshot?.hedges || null,
  };
}
/** An empty index (before the first answer). */
export const emptyIndex = () => indexSnapshot({ quotes: [] });
export { isCurrent };
