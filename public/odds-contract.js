// Runtime side of the odds contract (types: lib/odds/contract.d.ts). Shared by the server, which validates
// what an odds API returns and parses the pricing preferences a page sends, and by the browser, which
// validates what /api/odds returns before showing it. Validation only: a value that is missing or not a
// number becomes null (unavailable), and a record that can't be read is dropped and counted. Nothing here
// computes a betting value.
import { DEVIG_METHODS } from './betting-math.js';

/** @typedef {import('../lib/odds/contract').OddsSnapshot} OddsSnapshot */
/** @typedef {import('../lib/odds/contract').SnapshotMeta} SnapshotMeta */
/** @typedef {import('../lib/odds/contract').SnapshotSection} SnapshotSection */
/** @typedef {import('../lib/odds/contract').Quote} Quote */
/** @typedef {import('../lib/odds/contract').QuotePricing} QuotePricing */
/** @typedef {import('../lib/odds/contract').MarketSnapshot} MarketSnapshot */
/** @typedef {import('../lib/odds/contract').PricingPreferences} PricingPreferences */
/** @typedef {import('../lib/odds/contract').BookRule} BookRule */
/** @typedef {import('../lib/odds/contract').ApiErrorCode} ApiErrorCode */
/** @typedef {import('../lib/odds/contract').ApiErrorBody} ApiErrorBody */
/** @typedef {import('../lib/odds/contract').ValueState} ValueState */
/** @typedef {Record<string, unknown>} Loose a record read from JSON, not yet validated */
/** @typedef {keyof PricingPreferences} PricingKey */

export const CONTRACT_ID = 'visualodds.odds/1';
/** @type {readonly SnapshotSection[]} */
export const SECTIONS = Object.freeze(['pricing', 'markets', 'arbitrage', 'middles', 'holds', 'sharp', 'hedges']);
export { DEVIG_METHODS };

/** A JSON object's fields ({} for anything else). @param {unknown} value @returns {Loose} */
export const fieldsOf = value => value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Loose} */ (value) : {};

// ---- Errors ----

/** HTTP status and whether a retry can help, per error code. @type {Readonly<Record<ApiErrorCode, { status: number, retryable: boolean, message: string }>>} */
export const ERRORS = Object.freeze({
  NOT_CONFIGURED: { status: 503, retryable: false, message: 'The odds feed is not configured on the server yet.' },
  UNAVAILABLE: { status: 503, retryable: true, message: 'The odds source is unavailable right now. Prices refresh automatically when it recovers.' },
  TIMEOUT: { status: 504, retryable: true, message: 'The odds source took too long to answer.' },
  MALFORMED: { status: 502, retryable: true, message: 'The odds source returned data that could not be read.' },
  PARTIAL: { status: 503, retryable: true, message: 'The odds source sent an incomplete snapshot.' },
  RATE_LIMITED: { status: 429, retryable: true, message: 'Too many price requests. Prices resume shortly.' },
  UNAUTHORIZED: { status: 502, retryable: false, message: 'The odds source refused this server\'s credentials.' },
  FORBIDDEN: { status: 403, retryable: false, message: 'This request is not allowed.' },
  BAD_REQUEST: { status: 400, retryable: false, message: 'The request has an invalid parameter.' },
  NOT_FOUND: { status: 404, retryable: false, message: 'Not found.' },
  UNSUPPORTED_MARKET: { status: 422, retryable: false, message: 'This market is not supported.' },
  UNSUPPORTED_BOOK: { status: 422, retryable: false, message: 'This sportsbook is not supported.' },
  CONTROLS_UNAVAILABLE: { status: 503, retryable: true, message: 'Market distribution controls could not be read, so no prices were served. Try again shortly.' },
});
/** @param {unknown} code @returns {code is ApiErrorCode} */
const knownCode = code => typeof code === 'string' && Object.hasOwn(ERRORS, code);

/** An error with an odds contract code. */
export class OddsError extends Error {
  /** @param {string} code an ApiErrorCode (anything else is UNAVAILABLE) @param {string} [message] @param {{ retryAfterSeconds?: number, status?: number }} [options] */
  constructor(code, message, { retryAfterSeconds, status } = {}) {
    const known = knownCode(code) ? ERRORS[code] : ERRORS.UNAVAILABLE;
    super(message || known.message);
    this.name = 'OddsError';
    /** @type {ApiErrorCode} */
    this.code = knownCode(code) ? code : 'UNAVAILABLE';
    this.status = status || known.status;
    this.retryable = known.retryable;
    /** @type {number | undefined} */
    this.retryAfterSeconds;
    if (Number.isFinite(retryAfterSeconds)) this.retryAfterSeconds = retryAfterSeconds;
  }
  /** @returns {ApiErrorBody} */
  toBody() { return { error: { code: this.code, message: this.message, retryable: this.retryable, ...(Number.isFinite(this.retryAfterSeconds) ? { retryAfterSeconds: this.retryAfterSeconds } : {}) } }; }
}

/** An error body from /api/odds (or a legacy { error: 'text' } body) → OddsError. @param {unknown} body @param {number} [status] */
export function errorFromBody(body, status = 503) {
  const error = fieldsOf(body).error;
  if (error && typeof error === 'object') {
    const { code, message, retryAfterSeconds } = fieldsOf(error);
    if (typeof code === 'string') return new OddsError(code, typeof message === 'string' ? message : undefined, { retryAfterSeconds: Number(retryAfterSeconds), status });
  }
  const code = status === 429 ? 'RATE_LIMITED' : status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : status === 504 ? 'TIMEOUT' : 'UNAVAILABLE';
  return new OddsError(code, typeof error === 'string' ? error : undefined, { status });
}

// ---- Workspace settings and pricing preferences ----

/** The +EV workspace's settings before the member saves any (Pricing & filters). */
export const SUITE_SETTING_DEFAULTS = Object.freeze({ minSharpBooks:1,maxVigPercent:20,devigMethod:'multiplicative',bookRules:[],liquidityWeighting:false,allowProjection:false,liveMaxAgeSeconds:90,pregameMaxAgeSeconds:900,minEvPercent:0,maxEvPercent:null,minArbPercent:0,maxArbPercent:null,minOdds:null,maxOdds:null,minLiquidity:0,minAvailableStake:0,league:'',market:'',side:'',gameStatus:'',region:'',oddsFormat:'american',cardTap:'expand',hideTaken:false,showHidden:false,arbMode:'arbs',autoRefresh:0 });

/**
 * A member's saved settings over the defaults, as every tool (and the alert email job) uses them.
 * Pregame prices expire after 15 minutes (the feed rescrapes every few). A saved value equal to the
 * old 24-hour default is treated as unset, so it moves to the new default.
 * @param {unknown} saved
 * @returns {Loose}
 */
export function suiteSettings(saved) {
  const own = { ...fieldsOf(saved) };
  if (Number(own.pregameMaxAgeSeconds) === 86400) delete own.pregameMaxAgeSeconds;
  if (typeof own.devigMethod !== 'string' || !DEVIG_METHODS.includes(own.devigMethod)) delete own.devigMethod;
  return { ...SUITE_SETTING_DEFAULTS, bookRules: [], ...own };
}

/**
 * The settings every tool uses: the defaults, plus the arbitrage page's own arbs/middles choice. The
 * Pricing & filters page is gone, and what was saved there (devig method, minimum books, vig limit,
 * reference-book rules, EV/odds ranges, scope) no longer applies: a saved rule left DFS lines unpriced
 * ("One-sided market") with no page left to change it (10 Oct 2026).
 * @param {unknown} saved
 * @returns {Loose}
 */
export function workspaceSettings(saved) {
  const mode = fieldsOf(saved).arbMode, settings = suiteSettings(typeof mode === 'string' && mode ? { arbMode: mode } : {});
  // No workspace odds format: the member's account preference (and the odds screen's own choice) decides.
  delete settings.oddsFormat;
  return settings;
}

/** The settings the pricing engine reads; the rest of the workspace settings are display filters. @type {readonly PricingKey[]} */
export const PRICING_KEYS = Object.freeze(['devigMethod', 'minSharpBooks', 'maxVigPercent', 'bookRules', 'liquidityWeighting', 'allowProjection', 'liveMaxAgeSeconds', 'pregameMaxAgeSeconds', 'minLiquidity', 'maxEvPercent', 'maxArbPercent']);
/** @param {unknown} value */
const blank = value => value === null || value === undefined || value === '';
/** A number in [low, high] (a numeric string counts), else NaN. @param {unknown} value @param {number} low @param {number} high */
const finite = (value, low, high) => { const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN; return Number.isFinite(n) && n >= low && n <= high ? n : NaN; };
/** @param {unknown} value @param {number} limit */
const shortText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f]/.test(value) ? value.trim() : '';
/** @param {unknown} value @param {number} low @param {number} high @returns {number | undefined} */
const ranged = (value, low, high) => { const n = finite(value, low, high); return Number.isNaN(n) ? undefined : n; };
/** @param {unknown} value @param {number} high @returns {number | null | undefined} */
const optionalPercent = (value, high) => blank(value) ? null : ranged(value, 0, high);
/**
 * Each pricing setting's reader: the normalized value, or undefined when it can't be read.
 * @type {{ [K in PricingKey]: (value: unknown) => PricingPreferences[K] | undefined }}
 */
const RULES = {
  devigMethod: value => typeof value === 'string' && DEVIG_METHODS.includes(value) ? value : undefined,
  minSharpBooks: value => { const n = finite(value, 1, 20); return Number.isInteger(n) ? n : undefined; },
  maxVigPercent: value => optionalPercent(value, 100),
  bookRules: value => {
    if (!Array.isArray(value) || value.length > 50) return undefined;
    /** @type {(BookRule | null)[]} */
    const rules = value.map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const rule = fieldsOf(entry), book = shortText(rule.book, 80), weight = blank(rule.weight) ? 1 : finite(rule.weight, 0, 100);
      if (!book || Number.isNaN(weight)) return null;
      const scope = Object.fromEntries(/** @type {const} */ (['sport', 'league', 'market']).map(field => [field, shortText(rule[field], 60)]).filter(([, text]) => text));
      return { book, weight, ...scope, ...(rule.required === true ? { required: /** @type {const} */ (true) } : {}), ...(rule.enabled === false ? { enabled: /** @type {const} */ (false) } : {}) };
    });
    return rules.every(rule => rule !== null) ? /** @type {BookRule[]} */ (rules) : undefined;
  },
  liquidityWeighting: value => typeof value === 'boolean' ? value : undefined,
  allowProjection: value => typeof value === 'boolean' ? value : undefined,
  liveMaxAgeSeconds: value => ranged(value, 5, 3600),
  pregameMaxAgeSeconds: value => ranged(value, 30, 86_400),
  minLiquidity: value => ranged(value, 0, 1e9),
  maxEvPercent: value => optionalPercent(value, 1000),
  maxArbPercent: value => optionalPercent(value, 100),
};
/** @type {Readonly<PricingPreferences>} */
const DEFAULT_PRICING = Object.freeze({ devigMethod: SUITE_SETTING_DEFAULTS.devigMethod, minSharpBooks: SUITE_SETTING_DEFAULTS.minSharpBooks, maxVigPercent: SUITE_SETTING_DEFAULTS.maxVigPercent,
  bookRules: [], liquidityWeighting: SUITE_SETTING_DEFAULTS.liquidityWeighting, allowProjection: SUITE_SETTING_DEFAULTS.allowProjection, liveMaxAgeSeconds: SUITE_SETTING_DEFAULTS.liveMaxAgeSeconds,
  pregameMaxAgeSeconds: SUITE_SETTING_DEFAULTS.pregameMaxAgeSeconds, minLiquidity: SUITE_SETTING_DEFAULTS.minLiquidity, maxEvPercent: SUITE_SETTING_DEFAULTS.maxEvPercent, maxArbPercent: SUITE_SETTING_DEFAULTS.maxArbPercent });
/** @param {unknown} a @param {unknown} b */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/**
 * One pricing setting read from a value, or its default. @template {PricingKey} K
 * @param {K} key @param {unknown} value @returns {PricingPreferences[K]}
 */
const settingOf = (key, value) => { const read = RULES[key](value); return read === undefined ? DEFAULT_PRICING[key] : read; };

/**
 * The pricing part of a member's settings, normalized: every pricing key, unreadable values replaced by
 * the default. What the server prices with and what it reports back.
 * @param {unknown} [settings]
 * @returns {PricingPreferences}
 */
export function pricingSettings(settings = {}) {
  const merged = suiteSettings(settings);
  return { devigMethod: settingOf('devigMethod', merged.devigMethod), minSharpBooks: settingOf('minSharpBooks', merged.minSharpBooks), maxVigPercent: settingOf('maxVigPercent', merged.maxVigPercent),
    bookRules: settingOf('bookRules', merged.bookRules), liquidityWeighting: settingOf('liquidityWeighting', merged.liquidityWeighting), allowProjection: settingOf('allowProjection', merged.allowProjection),
    liveMaxAgeSeconds: settingOf('liveMaxAgeSeconds', merged.liveMaxAgeSeconds), pregameMaxAgeSeconds: settingOf('pregameMaxAgeSeconds', merged.pregameMaxAgeSeconds), minLiquidity: settingOf('minLiquidity', merged.minLiquidity),
    maxEvPercent: settingOf('maxEvPercent', merged.maxEvPercent), maxArbPercent: settingOf('maxArbPercent', merged.maxArbPercent) };
}

/** Only the pricing settings that differ from the defaults, for a request (members on the defaults share one cached answer). @param {unknown} [settings] @returns {Partial<PricingPreferences>} */
export function pricingPreferences(settings = {}) {
  const full = pricingSettings(settings);
  return Object.fromEntries(PRICING_KEYS.filter(key => !same(full[key], DEFAULT_PRICING[key])).map(key => [key, full[key]]));
}
/** Preferences → the `prefs` query value ('' for the defaults). @param {unknown} [settings] */
export function encodePreferences(settings = {}) {
  const prefs = pricingPreferences(settings);
  return Object.keys(prefs).length ? JSON.stringify(prefs) : '';
}
/**
 * The `prefs` query value → full pricing settings. Throws OddsError BAD_REQUEST for text that isn't a
 * preferences object, or for a value outside its range: a request is answered for exactly what it asked.
 * @param {string | null | undefined} text
 * @returns {PricingPreferences}
 */
export function parsePreferences(text) {
  if (blank(text)) return pricingSettings({});
  if (typeof text !== 'string' || text.length > 4096) throw new OddsError('BAD_REQUEST', 'prefs is too long.');
  /** @type {unknown} */
  let value;
  try { value = JSON.parse(text); } catch { throw new OddsError('BAD_REQUEST', 'prefs must be a JSON object.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OddsError('BAD_REQUEST', 'prefs must be a JSON object.');
  for (const [key, entry] of Object.entries(value)) {
    if (!(/** @type {readonly string[]} */ (PRICING_KEYS)).includes(key)) throw new OddsError('BAD_REQUEST', `prefs.${key} is not a pricing preference.`);
    if (RULES[/** @type {PricingKey} */ (key)](entry) === undefined) throw new OddsError('BAD_REQUEST', `prefs.${key} is out of range.`);
  }
  return pricingSettings(value);
}
/** One string per distinct set of pricing settings (cache keys). @param {PricingPreferences} settings */
export const preferencesKey = settings => JSON.stringify(PRICING_KEYS.map(key => settings[key]));

// ---- Freshness ----

/**
 * A quote's state at `now` (the server's clock as the page knows it): 'current' while the producer says it
 * is open and before its expiresAt, else 'stale', 'suspended', 'closed' or 'unavailable'. Never current
 * without an expiry time: old odds are not shown as live.
 * @param {Pick<Quote, 'status' | 'expiresAt'> | null | undefined} quote
 * @param {number} [now]
 * @returns {'current' | Exclude<Quote['status'], 'open'>}
 */
export function quoteFreshness(quote, now = Date.now()) {
  if (!quote) return 'unavailable';
  if (quote.status && quote.status !== 'open') return quote.status;
  const ends = Date.parse(quote.expiresAt ?? '');
  return Number.isFinite(ends) && ends > now ? 'current' : 'stale';
}
/** @param {Pick<Quote, 'status' | 'expiresAt'> | null | undefined} quote @param {number} [now] */
export const isCurrent = (quote, now = Date.now()) => quoteFreshness(quote, now) === 'current';
/** Whether a whole response is past its staleAfter time, or was served from a held-over snapshot. @param {Pick<SnapshotMeta, 'stale' | 'staleAfter'> | null | undefined} meta @param {number} [now] */
export const snapshotStale = (meta, now = Date.now()) => !meta || meta.stale === true || !(Date.parse(meta.staleAfter ?? '') > now);
/**
 * How to read a displayed value (contract ValueState): 'pending' before an answer, 'unavailable' when the
 * producer sent none, 'stale' when its quote or the response is past expiry, else 'authoritative' (the odds
 * API computed it) or 'calculated' (the website's server computed it from raw sportsbook prices).
 * @param {unknown} value
 * @param {{ meta?: Pick<SnapshotMeta, 'stale' | 'staleAfter' | 'provenance'> | null, quote?: Pick<Quote, 'status' | 'expiresAt'> | null, now?: number, pending?: boolean }} [context]
 * @returns {ValueState}
 */
export function valueState(value, { meta = null, quote = null, now = Date.now(), pending = false } = {}) {
  if (pending) return 'pending';
  if (value === null || value === undefined || typeof value === 'number' && !Number.isFinite(value)) return 'unavailable';
  if (quote && !isCurrent(quote, now) || meta && snapshotStale(meta, now)) return 'stale';
  return meta?.provenance?.provider === 'odds-api' ? 'authoritative' : 'calculated';
}

// ---- Table encoding (transport) ----

/**
 * Large record lists travel as tables: { table: 1, columns, dictionaries, rows }. A row lists values in
 * column order; a dictionary column's values are indexes into that column's list (event names, books and
 * times repeat across thousands of prices). A missing value is null. Decoding gives back the records;
 * null values are left out. A reference column (`refs`, e.g. pricing's quoteId → 'quotes') holds row
 * numbers in the response's quote table instead of repeating the ids. Every producer may also send plain arrays.
 * @param {readonly object[]} records
 * @param {readonly string[]} [dictionary] columns to dictionary-encode
 * @param {Record<string, { table: string, rows: Map<unknown, number> }>} [references] columns stored as row numbers of another table
 */
export function encodeTable(records, dictionary = [], references = {}) {
  /** @type {string[]} */
  const columns = [];
  const seen = new Set();
  for (const record of records) for (const key of Object.keys(record)) if (!seen.has(key)) { seen.add(key); columns.push(key); }
  const coded = new Set(dictionary.filter(column => seen.has(column)));
  /** @type {Record<string, unknown[]>} */
  const dictionaries = Object.fromEntries([...coded].map(column => [column, []]));
  /** @type {Record<string, Map<string, number>>} */
  const positions = Object.fromEntries([...coded].map(column => [column, new Map()]));
  /** @type {Record<string, string>} */
  const refs = Object.fromEntries(Object.keys(references).filter(column => seen.has(column)).map(column => [column, references[column].table]));
  const rows = records.map(record => columns.map(column => {
    const value = fieldsOf(record)[column];
    if (value === undefined || value === null) return null;
    if (refs[column]) { const row = references[column].rows.get(value); if (row === undefined) throw new Error(`${column} ${value} is not in ${refs[column]}`); return row; }
    if (!coded.has(column)) return value;
    const index = positions[column], key = typeof value === 'string' ? value : JSON.stringify(value);
    let at = index.get(key);
    if (at === undefined) { at = dictionaries[column].length; dictionaries[column].push(value); index.set(key, at); }
    return at;
  }));
  return { table: 1, columns, dictionaries, ...(Object.keys(refs).length ? { refs } : {}), rows };
}
/**
 * Plain records from an encodeTable table (or the array itself). `tables` gives the referenced lists by
 * name (e.g. { quotes: [quote ids in row order] }). Throws OddsError MALFORMED for anything else.
 * @param {unknown} value
 * @param {Record<string, readonly unknown[]>} [tables]
 * @returns {unknown[]}
 */
export function decodeTable(value, tables = {}) {
  if (Array.isArray(value)) return value;
  const table = fieldsOf(value), { columns, rows } = table;
  if (table.table !== 1 || !Array.isArray(columns) || !Array.isArray(rows)) throw new OddsError('MALFORMED');
  const dictionaries = fieldsOf(table.dictionaries), refs = fieldsOf(table.refs);
  /** @type {(readonly unknown[] | null)[]} */
  const lists = columns.map(column => {
    const ref = refs[column], list = dictionaries[column];
    if (typeof ref === 'string' && ref) return Array.isArray(tables[ref]) ? tables[ref] : [];
    return Array.isArray(list) ? list : null;
  });
  return rows.map(row => {
    /** @type {Loose} */
    const record = {};
    if (!Array.isArray(row)) return record;
    for (let i = 0; i < columns.length; i++) {
      const raw = row[i];
      if (raw === null || raw === undefined) continue;
      const list = lists[i], value = list ? list[raw] : raw;
      if (value !== undefined && value !== null) record[columns[i]] = value;
    }
    return record;
  });
}
/** Quote columns worth a dictionary: text that repeats across books, markets and scrapes. */
export const QUOTE_DICTIONARY = Object.freeze(['sport', 'league', 'event', 'displayEvent', 'eventId', 'market', 'displayMarket', 'marketId', 'type', 'period', 'player', 'playerId', 'team', 'side', 'selection', 'book', 'priceFamily', 'startTime', 'ts', 'expiresAt', 'status', 'marketKey', 'source', 'outcomes', 'line']);
export const PRICING_DICTIONARY = Object.freeze(['devigMethod', 'devigVersion']);

// ---- Decoding ----

/** @param {unknown} value */
const text = value => typeof value === 'string' ? value : '';
/** @param {unknown} value */
const num = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** @param {unknown} value */
const probability = value => { const n = num(value); return n !== null && n >= 0 && n <= 1 ? n : null; };
/** @param {unknown} value */
const bool = value => value === true;
/** @param {unknown} value */
const count = value => typeof value === 'number' && Number.isInteger(value) ? value : 0;
/** @param {unknown} value */
const odds = value => { const n = num(value); return n !== null && Math.abs(n) >= 100 ? n : null; };
/** @param {unknown} value */
const isoOrNull = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
/** @param {unknown} value @returns {unknown[]} */
const list = value => Array.isArray(value) ? value : [];
/** @type {ReadonlySet<unknown>} */
const STATUSES = new Set(['open', 'stale', 'suspended', 'closed', 'unavailable']);

/** @param {unknown} input @returns {Quote | null} */
export function decodeQuote(input) {
  const raw = fieldsOf(input);
  if (!text(raw.id) || !text(raw.book) || !text(raw.event) || !text(raw.side) || !isoOrNull(raw.ts)) return null;
  return /** @type {Quote} */ ({ ...raw, seriesId: text(raw.seriesId) || raw.id, odds: odds(raw.odds), live: bool(raw.live), exchange: bool(raw.exchange),
    marketKey: text(raw.marketKey), impliedProbability: probability(raw.impliedProbability), bookFairProbability: probability(raw.bookFairProbability),
    bookHold: num(raw.bookHold), consistent: bool(raw.consistent), outlier: bool(raw.outlier), expiresAt: isoOrNull(raw.expiresAt),
    status: STATUSES.has(raw.status) ? raw.status : 'unavailable' });
}

/** @param {unknown} input @returns {QuotePricing | null} */
export function decodePricing(input) {
  const raw = fieldsOf(input);
  if (!text(raw.quoteId)) return null;
  const fair = probability(raw.fairProbability), ev = num(raw.ev);
  if (fair === null || ev === null) return null;
  return { quoteId: text(raw.quoteId), fairProbability: fair, fairOdds: odds(raw.fairOdds), devigMethod: text(raw.devigMethod) || null, devigVersion: text(raw.devigVersion) || null,
    bookCount: count(raw.bookCount), references: list(raw.references).map(fieldsOf).filter(book => text(book.book)).map(book => ({ ...book, book: text(book.book), probability: probability(book.probability), weight: num(book.weight), vigPercent: num(book.vigPercent) })),
    edge: num(raw.edge), ev, kellyFraction: probability(raw.kellyFraction), plausible: bool(raw.plausible), estimated: bool(raw.estimated), conditionalOnNoPush: bool(raw.conditionalOnNoPush) };
}

/** @param {unknown[]} ids @param {ReadonlySet<string>} quotes */
const validIds = (ids, quotes) => ids.length > 0 && ids.every(id => typeof id === 'string' && quotes.has(id));
/** @param {unknown} id @param {ReadonlySet<string>} quotes */
const knownId = (id, quotes) => typeof id === 'string' && quotes.has(id);
/**
 * Each section's record reader: the record, or null when it can't be shown (a missing number, or a quote
 * id that isn't in the response).
 * @type {{ [K in Exclude<SnapshotSection, 'pricing'>]-?: (raw: Loose, quotes: ReadonlySet<string>) => NonNullable<OddsSnapshot[K]>[number] | null }}
 */
const DECODERS = {
  markets: raw => text(raw.key) && Array.isArray(raw.sides) ? { key: text(raw.key), live: bool(raw.live), twoWay: bool(raw.twoWay), sides: raw.sides.map(fieldsOf).filter(side => text(side.side)).map(side => ({
    side: text(side.side), fairProbability: probability(side.fairProbability), fairOdds: odds(side.fairOdds), fairBookCount: count(side.fairBookCount),
    averageImpliedProbability: probability(side.averageImpliedProbability), averageOdds: odds(side.averageOdds), priceCount: count(side.priceCount) })) } : null,
  arbitrage: (raw, quotes) => Array.isArray(raw.legs) && validIds(raw.legs.map(leg => fieldsOf(leg).quoteId), quotes) && num(raw.margin) !== null && raw.legs.every(leg => num(fieldsOf(leg).stakeFraction) !== null)
    ? /** @type {import('../lib/odds/contract').ArbitrageOpportunity} */ ({ ...raw, capacity: num(raw.capacity), minimumTotal: num(raw.minimumTotal), lowestPerUnit: num(raw.lowestPerUnit) ?? num(raw.margin), pushPossible: bool(raw.pushPossible), limitsKnown: bool(raw.limitsKnown), live: bool(raw.live) }) : null,
  middles: (raw, quotes) => {
    const perUnit = fieldsOf(raw.perUnit);
    return validIds([raw.firstQuoteId, raw.secondQuoteId], quotes) && Array.isArray(raw.stakeFractions) && num(perUnit.inside) !== null && num(perUnit.outside) !== null
      ? /** @type {import('../lib/odds/contract').MiddleOpportunity} */ ({ ...raw, capacity: num(raw.capacity), limitsKnown: bool(raw.limitsKnown), live: bool(raw.live), ladder: list(raw.ladder).filter(point => num(fieldsOf(point).score) !== null && num(fieldsOf(point).netPerUnit) !== null) }) : null;
  },
  holds: (raw, quotes) => validIds(list(raw.quoteIds), quotes) && num(raw.hold) !== null
    ? /** @type {import('../lib/odds/contract').HoldMarket} */ ({ ...raw, live: bool(raw.live), fairProbabilities: list(raw.fairProbabilities).map(probability), impliedProbabilities: list(raw.impliedProbabilities).map(probability) }) : null,
  sharp: (raw, quotes) => validIds([raw.exchangeQuoteId, raw.sportsbookQuoteId], quotes) && num(raw.liquidity) !== null
    ? /** @type {import('../lib/odds/contract').SharpMoney} */ ({ ...raw, oppositeExchangeQuoteId: knownId(raw.oppositeExchangeQuoteId, quotes) ? raw.oppositeExchangeQuoteId : null, improvement: num(raw.improvement) }) : null,
  hedges: (raw, quotes) => knownId(raw.promoQuoteId, quotes) && Array.isArray(raw.hedges)
    ? { promoQuoteId: text(raw.promoQuoteId), hedges: raw.hedges.map(fieldsOf).filter(hedge => knownId(hedge.quoteId, quotes) && num(hedge.impliedSum) !== null).map(hedge => ({ quoteId: text(hedge.quoteId), impliedSum: num(hedge.impliedSum) ?? 0 })) } : null,
};

/** The contract's response metadata, with every field readable. @param {unknown} raw @returns {SnapshotMeta} */
export function decodeMeta(raw) {
  const meta = fieldsOf(raw), pricing = fieldsOf(meta.pricing), provenance = fieldsOf(meta.provenance), provider = text(provenance.provider);
  return {
    provenance: { provider: provider === 'odds-api' || provider === 'website-transition' ? provider : 'unknown', engine: text(provenance.engine), engineVersion: text(provenance.engineVersion), generatedAt: isoOrNull(provenance.generatedAt) },
    pricing: { ...pricing, devigMethod: text(pricing.devigMethod) || null, devigVersion: text(pricing.devigVersion) || null },
    snapshotAt: isoOrNull(meta.snapshotAt), staleAfter: isoOrNull(meta.staleAfter), stale: bool(meta.stale), warmingUp: bool(meta.warmingUp),
    partial: bool(meta.partial), warnings: list(meta.warnings).filter(item => typeof item === 'string'),
    scope: fieldsOf(meta.scope), counts: fieldsOf(meta.counts),
  };
}

/**
 * An /api/odds snapshot body → { snapshot, dropped }: quotes and section records that can't be read are
 * dropped (counted by kind), references to missing quotes too. Throws OddsError MALFORMED when the body
 * isn't a snapshot of this contract at all.
 * @param {unknown} input
 * @returns {{ snapshot: OddsSnapshot, dropped: Record<string, number> }}
 */
export function decodeSnapshot(input) {
  const body = fieldsOf(input);
  if (body.contract !== CONTRACT_ID || !body.quotes) throw new OddsError('MALFORMED');
  /** @type {Record<string, number>} */
  const dropped = {};
  /** @param {string} kind */
  const drop = kind => { dropped[kind] = (dropped[kind] || 0) + 1; };
  /** @type {Quote[]} */
  const quotes = [];
  /** @type {Set<string>} */
  const ids = new Set();
  const rawQuotes = decodeTable(body.quotes), quoteRows = { quotes: rawQuotes.map(raw => fieldsOf(raw).id) };
  for (const raw of rawQuotes) { const quote = decodeQuote(raw); if (!quote || ids.has(quote.id)) { drop('quotes'); continue; } ids.add(quote.id); quotes.push(quote); }
  /** @type {OddsSnapshot} */
  const snapshot = { contract: CONTRACT_ID, meta: decodeMeta(body.meta), quotes };
  if (body.pricing) snapshot.pricing = decodeTable(body.pricing, quoteRows).flatMap(raw => { const row = decodePricing(raw); if (!row || !ids.has(row.quoteId)) { drop('pricing'); return []; } return [row]; });
  if (Array.isArray(body.events)) snapshot.events = /** @type {import('../lib/odds/contract').Event[]} */ (body.events.filter(event => text(fieldsOf(event).id)));
  for (const section of /** @type {(keyof typeof DECODERS)[]} */ (Object.keys(DECODERS))) {
    if (!body[section]) continue;
    /** @type {(raw: Loose, quotes: ReadonlySet<string>) => object | null} */
    const decode = DECODERS[section];
    const records = decodeTable(body[section], quoteRows).flatMap(raw => { const record = decode(fieldsOf(raw), ids); if (!record) { drop(section); return []; } return [record]; });
    Object.assign(snapshot, { [section]: records });
  }
  return { snapshot, dropped };
}

/** A section view (/api/odds/ev, /arbitrage, …) → the same shape as a snapshot with only that section. */
export const decodeSection = decodeSnapshot;
