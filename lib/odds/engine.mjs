// The website's odds analytics engine. Server only: the browser never prices the feed, it displays what
// GET /api/odds/* returns (the contract in lib/odds/contract.d.ts).
//
// This is the one implementation of consensus fair prices, +EV, arbitrage, middles, holds, smart money and
// hedge pairing for the transition period: lib/odds/providers.mjs runs it on the normalized quote feed
// (lib/odds/normalize.mjs). When the odds API supplies these values itself, the 'odds-api' provider passes
// them through and this engine isn't used. Formulas (devig, Kelly, stake splits) live in
// public/betting-math.js; market identity in public/market-identity.js.
import { decimal, implied, devig, DEVIG_METHODS, DEVIG_VERSION, effectiveDecimal, kellyFraction, constrainedArb, middleOutcomes, probabilityToAmerican } from '../../public/betting-math.js';
import { valuePresent, number, name, identifier, timestamp, lineNumber, selection, isLive, kind, thresholdMarket, marketIdentity, stableHash, sideNames } from '../../public/market-identity.js';

export const ENGINE = 'visualodds-web-engine';
export const ENGINE_VERSION = '1.0.0';

const CLOCK_SKEW_MS = 5000;
/** Default price lifetimes: live 90 s, pregame 15 min (feed books rescrape every few minutes). */
export const LIVE_MAX_AGE_SECONDS = 90, PREGAME_MAX_AGE_SECONDS = 900;
/** Smallest margin (%) a sportsbook market needs before it is devigged into a fair price. */
export const MIN_BOOK_VIG_PERCENT = 0.5;
// Without saved reference-book rules, sharp books count more: their prices move first and carry the
// least margin. Matches the quote API's /books list, which marks Pinnacle, Betfair and Circa as sharp.
export const BOOK_WEIGHTS = Object.freeze({
  pinnacle: 100, circa: 100, 'circa sports': 100,
  sporttrade: 50, novig: 50, prophetx: 50, kalshi: 50, '4caster': 50, fanduel: 50, betonline: 50, bookmaker: 50,
  draftkings: 25, betmgm: 25, caesars: 25, betano: 25, propbuilder: 50,
});
export const DEFAULT_BOOK_WEIGHT = 0;
/** @deprecated Use BOOK_WEIGHTS[name] ?? DEFAULT_BOOK_WEIGHT. Kept for the DFS pricing path. */
export const DEFAULT_SHARP_WEIGHTS = BOOK_WEIGHTS;
/** A default sharp weight counts only on a sharp-margin market: Pinnacle's 10–18% MMA holds are not sharp prices. */
export const SHARP_MAX_VIG_PERCENT = 6;
/** An exchange's two sides sit near 100%; a pair implying less than this can't both be live prices (Novig sent 63–96%). */
export const MIN_EXCHANGE_IMPLIED_SUM = 0.98;
// Without a saved maximum EV, a larger return is treated as a feed error (a mislabeled or stale price):
// 25%, or 10% when one book sets the fair price.
export const EV_SANITY_LIMIT = .25, EV_SINGLE_BOOK_LIMIT = .10;
/** Without a saved maximum, arbitrage-like returns above 15% are mislabeled or stale prices. */
export const ARB_SANITY_LIMIT = .15;
// The feed files different games under one name; a known start this far from the priced quote's is another game.
const REFERENCE_START_WINDOW_MS = 3 * 3600_000;
// Odds-screen outliers: a price more than 10 points (implied) longer than the other books' median.
const OUTLIER_POINTS = 0.10;

// Market identities, availability and each book's own market are the costly parts of an analysis; within
// one (a run) each is computed once per quote. Quotes don't change during a run.
let identities = null;
const newMemo = () => ({ line: new Map(), family: new Map(), available: new Map(), availableFor: null, ownBook: new WeakMap() });
function identityOf(quote, includeLine = true) {
  if (!identities) return marketIdentity(quote, includeLine);
  const cache = includeLine ? identities.line : identities.family;
  let key = cache.get(quote);
  if (key === undefined) { key = marketIdentity(quote, includeLine); cache.set(quote, key); }
  return key;
}
function withIdentities(run, cache = identities ?? newMemo()) {
  const outer = identities;
  identities = cache;
  try { return run(); } finally { identities = outer; }
}
// Availability is cached for one clock reading and set of price-age settings at a time.
function memoAvailable(quote, settings, now) {
  const memo = identities, owner = memo.availableFor;
  if (!owner || owner.now !== now || owner.live !== settings.liveMaxAgeSeconds || owner.pregame !== settings.pregameMaxAgeSeconds || owner.minimum !== settings.minLiquidity) {
    memo.available = new Map();
    memo.availableFor = { now, live: settings.liveMaxAgeSeconds, pregame: settings.pregameMaxAgeSeconds, minimum: settings.minLiquidity };
  }
  let value = memo.available.get(quote);
  if (value === undefined) { value = checkAvailable(quote, settings, now); memo.available.set(quote, value); }
  return value;
}
export const marketKey = quote => identityOf(quote, true);
export const familyKey = quote => identityOf(quote, false);

/** Whether a price is current and complete enough to compare. `settings` carries the member's price ages and minimum liquidity. */
export function quoteAvailable(quote, settings = {}, now = Date.now()) {
  return identities && quote && typeof quote === 'object' ? memoAvailable(quote, settings, now) : checkAvailable(quote, settings, now);
}
function checkAvailable(quote, settings, now) {
  if (!quote || typeof quote !== 'object' || !Number.isFinite(now)) return false;
  if (!identifier(quote.sport) || !identifier(quote.eventId || quote.event) || !identifier(quote.marketId || quote.market)
    || !selection(quote) || !name(quote.book) || !Number.isFinite(decimal(quote.odds))) return false;
  if (quote.live != null && typeof quote.live !== 'boolean') return false;
  for (const flag of ['available', 'active', 'suspended', 'expired', 'stale']) if (quote[flag] != null && typeof quote[flag] !== 'boolean') return false;
  if (quote.available === false || quote.active === false || quote.suspended === true || quote.expired === true || quote.stale === true || quote.depthOnly === true) return false;
  if (['suspended', 'expired', 'closed', 'settled', 'cancelled', 'canceled', 'unavailable', 'stale', 'removed'].includes(name(quote.status))) return false;
  if (['final', 'finished', 'post', 'settled', 'cancelled', 'canceled', 'postponed'].includes(name(quote.gameStatus))) return false;
  if (['live', 'in', 'in-play', 'inplay'].includes(name(quote.gameStatus)) && !isLive(quote)) return false;
  if (thresholdMarket(quote) && !Number.isFinite(lineNumber(quote))) return false;
  if (valuePresent(quote.outcomes) && (!Number.isInteger(number(quote.outcomes)) || number(quote.outcomes) < 2 || number(quote.outcomes) > 64)) return false;
  const observed = timestamp(quote.ts), maximumAge = maxAgeSeconds(quote, settings);
  // A stamp a few seconds ahead is clock skew between the feed and this server, not a future price.
  if (!Number.isFinite(observed) || !(maximumAge > 0) || observed > now + CLOCK_SKEW_MS || now - observed > maximumAge * 1000) return false;
  for (const field of ['expiresAt', 'expiry', 'expiryTime']) if (valuePresent(quote[field])) {
    const expires = timestamp(quote[field]);
    if (!Number.isFinite(expires) || expires <= now) return false;
  }
  if (!isLive(quote) && valuePresent(quote.startTime)) {
    const starts = timestamp(quote.startTime);
    if (!Number.isFinite(starts) || starts <= now) return false;
  }
  for (const field of ['maxStake', 'maxBet']) if (valuePresent(quote[field]) && !(number(quote[field]) > 0)) return false;
  // Unknown exchange depth (no liquidity field) is not a reason to drop a price; a known amount below
  // the member's minimum is.
  if (quote.exchange && valuePresent(quote.liquidity)) {
    const liquidity = number(quote.liquidity), minimum = valuePresent(settings.minLiquidity) ? number(settings.minLiquidity) : 0;
    if (!(liquidity >= 0) || liquidity < minimum) return false;
  }
  return true;
}
// A pregame price from a source that rescrapes its book slowly gets that lag on top of the setting: its
// age counts from the book's latest pass (feedLagSeconds, lib/odds/sportwizzard.mjs).
function maxAgeSeconds(quote, settings) {
  const setting = isLive(quote) ? settings.liveMaxAgeSeconds : settings.pregameMaxAgeSeconds;
  const age = setting == null || setting === '' ? isLive(quote) ? LIVE_MAX_AGE_SECONDS : PREGAME_MAX_AGE_SECONDS : number(setting);
  return !isLive(quote) && number(quote.feedLagSeconds) > 0 ? age + number(quote.feedLagSeconds) : age;
}

/**
 * When a price stops being current, as an ISO time: its observation plus the price age for live or
 * pregame, and no later than the game's start (pregame) or a supplied expiry. null when unknown.
 */
export function expiresAt(quote, settings = {}) {
  const observed = timestamp(quote?.ts), age = maxAgeSeconds(quote || {}, settings);
  if (!Number.isFinite(observed) || !(age > 0)) return null;
  let end = observed + age * 1000;
  if (!isLive(quote)) { const starts = timestamp(quote.startTime); if (Number.isFinite(starts)) end = Math.min(end, starts); }
  for (const field of ['expiresAt', 'expiry', 'expiryTime']) { const expires = timestamp(quote[field]); if (Number.isFinite(expires)) end = Math.min(end, expires); }
  return new Date(end).toISOString();
}

/**
 * Whether a price is offered right now: 'open', 'suspended', 'closed' (settled, cancelled, or a pregame price
 * whose game started), 'unavailable' (withdrawn) or 'stale' (older than its price age, or no usable
 * observation time). This is about the price being current; whether it is complete enough to compare
 * (a line on a threshold market, every field) is quoteAvailable, which the analytics use.
 */
export function quoteStatus(quote, settings = {}, now = Date.now()) {
  if (quote?.suspended === true || name(quote?.status) === 'suspended') return 'suspended';
  if (['closed', 'settled', 'cancelled', 'canceled'].includes(name(quote?.status))
    || ['final', 'finished', 'post', 'settled', 'cancelled', 'canceled', 'postponed'].includes(name(quote?.gameStatus))
    || !isLive(quote) && Number.isFinite(timestamp(quote?.startTime)) && timestamp(quote.startTime) <= now) return 'closed';
  if (quote?.available === false || quote?.active === false || ['unavailable', 'removed'].includes(name(quote?.status))) return 'unavailable';
  const observed = timestamp(quote?.ts), ends = Date.parse(expiresAt(quote, settings) ?? '');
  if (quote?.stale === true || quote?.expired === true || ['stale', 'expired'].includes(name(quote?.status))
    || !Number.isFinite(observed) || observed > now + CLOCK_SKEW_MS || !(ends > now)) return 'stale';
  return 'open';
}

function matchesScope(rule, quote) {
  return ['sport', 'league', 'market'].every(field => !valuePresent(rule[field]) || name(rule[field]) === name(field === 'league' ? quote.league || quote.sport : quote[field]));
}
const familyName = quote => name(quote?.priceFamily || quote?.book);
// References come from other price families (a mirror of the offered book's platform would price it
// against itself) and from the same game.
function referenceRow(quote, row) {
  if (name(row.book) === name(quote.book) || familyName(row) === familyName(quote)) return false;
  const starts = timestamp(quote.startTime), rowStarts = timestamp(row.startTime);
  return !(Number.isFinite(starts) && Number.isFinite(rowStarts) && Math.abs(starts - rowStarts) > REFERENCE_START_WINDOW_MS);
}
function referenceRules(quote, quotes, settings) {
  const configured = Array.isArray(settings.bookRules) && settings.bookRules.length ? settings.bookRules : null;
  const rules = new Map();
  if (configured) {
    const selected = configured.filter(rule => rule && name(rule.book) && matchesScope(rule, quote))
      .map((rule, order) => ({ ...rule, order, specificity: ['sport', 'league', 'market'].filter(field => valuePresent(rule[field])).length }))
      .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    for (const rule of selected) rules.set(name(rule.book), { ...rule, weight: rule.weight == null ? 1 : number(rule.weight) });
  } else {
    for (const row of quotes) if (name(row?.book)) rules.set(name(row.book), { book: row.book, enabled: true, required: false, weight: BOOK_WEIGHTS[name(row.book)] ?? DEFAULT_BOOK_WEIGHT });
  }
  // The offered book is never used to manufacture its own reference price.
  if (!rules.get(name(quote.book))?.required) rules.delete(name(quote.book));
  return rules;
}

function completeBook(quote, rows, rule, settings) {
  if (!rule || rule.enabled === false || !(rule.weight > 0)) return null;
  const sides = sideNames(quote, rows);
  if (sides.length < 2) return null;
  const candidates = rows.filter(row => name(row.book) === name(rule.book));
  if (candidates.some(row => valuePresent(row.outcomes) && number(row.outcomes) !== sides.length)) return null;
  const records = sides.map(side => candidates.filter(row => selection(row) === side).sort((a, b) => timestamp(b.ts) - timestamp(a.ts))[0]);
  if (records.some(row => !row)) return null;
  const raw = records.map(row => 1 / effectiveDecimal(row));
  const impliedSum = raw.reduce((total, probability) => total + probability, 0), vigPercent = (impliedSum - 1) * 100;
  const exchange = records.some(record => record.exchange === true);
  // A sportsbook market with no margin isn't a priced two-sided market: the feed built one side from
  // the other (DraftKings and Fanatics milestone props, Oct 2026). Exchanges can legitimately sit at 0%.
  if (!exchange && vigPercent <= MIN_BOOK_VIG_PERCENT) return null;
  if (exchange && !(impliedSum >= MIN_EXCHANGE_IMPLIED_SUM)) return null;
  const maximumVig = valuePresent(settings.maxVigPercent) ? number(settings.maxVigPercent) : Infinity;
  if (!Number.isFinite(vigPercent) || !(maximumVig >= 0) || vigPercent > maximumVig) return null;
  const fair = devig(raw, settings.devigMethod || 'multiplicative');
  if (!fair.length) return null;
  const liquidityValues = records.map(record => number(record.liquidity));
  const liquidity = exchange && liquidityValues.every(value => value > 0) ? Math.min(...liquidityValues) : NaN;
  const unit = valuePresent(settings.liquidityWeightUnit) ? number(settings.liquidityWeightUnit) : 1000;
  if (settings.liquidityWeighting && exchange && (!(liquidity > 0) || !(unit > 0))) return null;
  const baseWeight = rule.weight > 0 && vigPercent > SHARP_MAX_VIG_PERCENT ? Math.min(rule.weight, 25) : rule.weight;
  // Exchange weight is proportional to the least liquid side, in $1,000 units.
  const weight = baseWeight * (settings.liquidityWeighting && exchange ? liquidity / unit : 1);
  return { book: rule.book, family: records[0].priceFamily || rule.book, probability: fair[sides.indexOf(selection(quote))], weight, configuredWeight: baseWeight,
    vigPercent, liquidity, exchange, quoteIds: records.map(record => record.id).filter(valuePresent), sides, probabilities: fair };
}

function combine(books, rules, settings, estimated = false) {
  const minimum = valuePresent(settings.minSharpBooks) ? number(settings.minSharpBooks) : 1;
  const requiredMissing = [...rules.values()].filter(rule => rule.required === true && !books.some(book => name(book.book) === name(rule.book))).map(rule => rule.book);
  const reason = requiredMissing.length ? 'A required reference book has no complete qualifying market.'
    : !Number.isInteger(minimum) || minimum < 1 ? 'Minimum sharp books must be a positive integer.'
    : books.length < minimum ? 'Too few complete qualifying reference books.' : '';
  const weight = books.reduce((total, book) => total + book.weight, 0);
  const probability = !reason && weight > 0 ? books.reduce((total, book) => total + book.probability * book.weight, 0) / weight : NaN;
  return { probability, fair: probability, books, bookCount: books.length, requiredMissing, method: settings.devigMethod || 'multiplicative', reason, estimated };
}

// Available quotes grouped by market identity.
function marketIndex(allQuotes, settings, now, includeLine = true) {
  const index = new Map();
  for (const row of allQuotes) {
    if (!quoteAvailable(row, settings, now)) continue;
    const key = identityOf(row, includeLine);
    const rows = index.get(key);
    if (rows) rows.push(row); else index.set(key, [row]);
  }
  return index;
}

// Books that mirror one odds platform (priceFamily) count as a single reference, averaged.
function onePerFamily(books) {
  const families = new Map();
  for (const book of books) { const key = name(book.family || book.book); if (!families.has(key)) families.set(key, []); families.get(key).push(book); }
  return [...families.values()].map(group => group.length === 1 ? group[0] : {
    ...group[0], book: group.map(book => book.book).join(' / '), mirrors: group.slice(1).map(book => book.book),
    probability: group.reduce((sum, book) => sum + book.probability, 0) / group.length,
    probabilities: group[0].probabilities.map((_, index) => group.reduce((sum, book) => sum + book.probabilities[index], 0) / group.length),
    weight: Math.max(...group.map(book => book.weight)), quoteIds: group.flatMap(book => book.quoteIds),
  });
}

/**
 * The no-vig consensus fair probability of `quote`'s side from the other books' complete markets: each
 * devigged with settings.devigMethod, mirrors once, sharp books weighted (or the member's book rules).
 * `index` is an optional marketIndex built from the same quotes, settings and time.
 */
export function consensusPrice(quote, allQuotes, settings = {}, index = null) {
  const failure = reason => ({ probability: NaN, fair: NaN, books: [], bookCount: 0, requiredMissing: [], method: settings.devigMethod || 'multiplicative', reason, estimated: false });
  const now = Number.isFinite(settings.now) ? settings.now : Date.now();
  if (!quoteAvailable(quote, settings, now) || !Array.isArray(allQuotes)) return failure('The offered quote is unavailable or invalid.');
  const identity = identityOf(quote);
  const rows = index ? (index.get(identity) || []).filter(row => referenceRow(quote, row))
    : allQuotes.filter(row => referenceRow(quote, row) && quoteAvailable(row, settings, now) && identityOf(row) === identity);
  const rules = referenceRules(quote, rows, settings);
  const books = [...rules.values()].map(rule => completeBook(quote, rows, rule, settings)).filter(Boolean);
  return combine(onePerFamily(books), rules, settings);
}

/**
 * The market's own no-vig fair probability for `quote`'s side, for price screens: every complete book in
 * `rows` counts, the offered book included. `rows` are current prices grouped to the quote's market identity.
 */
export function marketFairPrice(quote, rows, settings = {}) {
  const game = Array.isArray(rows) && quote ? rows.filter(row => referenceRow({ ...quote, book: '', priceFamily: '' }, row)) : [];
  const rules = referenceRules({ ...quote, book: '' }, game, settings);
  return combine(onePerFamily([...rules.values()].map(rule => completeBook(quote, game, rule, settings)).filter(Boolean)), rules, settings);
}

/** An Over/Under fair probability interpolated between a book's neighbouring lines (only with allowProjection). `familyIndex` is an optional marketIndex built without lines. */
export function projectProbability(target, allQuotes, settings = {}, familyIndex = null) {
  const now = Number.isFinite(settings.now) ? settings.now : Date.now();
  if (!Array.isArray(allQuotes) || !target || !['over', 'under'].includes(selection(target)) || !Number.isFinite(lineNumber(target))) return null;
  const family = identityOf(target, false), targetLine = lineNumber(target);
  const rows = familyIndex ? (familyIndex.get(family) || []).filter(row => referenceRow(target, row))
    : allQuotes.filter(row => referenceRow(target, row) && quoteAvailable(row, settings, now) && identityOf(row, false) === family);
  const rules = referenceRules(target, rows, settings), books = [], provenance = [];
  for (const rule of rules.values()) {
    if (rule.enabled === false || !(rule.weight > 0)) continue;
    const bookRows = rows.filter(row => name(row.book) === name(rule.book));
    const lines = [...new Set(bookRows.map(lineNumber))].filter(Number.isFinite).sort((a, b) => a - b);
    const points = lines.flatMap(line => {
      // Integer thresholds need an explicit zero-push contract; opposing odds
      // alone cannot distinguish win probability from probability conditional on no push.
      const atLine = bookRows.filter(row => lineNumber(row) === line);
      if (Number.isInteger(line) && !atLine.every(row => number(row.pushProbability) === 0 || row.pushRule === 'no-push')) return [];
      const representative = atLine.find(row => selection(row) === 'over');
      if (!representative) return [];
      const result = completeBook(representative, atLine, rule, settings);
      return result ? [{ line, ...result }] : [];
    });
    if (points.some((point, index) => index > 0 && point.probability > points[index - 1].probability + 1e-10)) continue;
    const lower = points.filter(point => point.line < targetLine).at(-1), upper = points.find(point => point.line > targetLine);
    if (!lower || !upper || points.some(point => point.line === targetLine)) continue;
    if (Number.isInteger(targetLine) && !(number(target.pushProbability) === 0 || target.pushRule === 'no-push')) continue;
    const fraction = (targetLine - lower.line) / (upper.line - lower.line);
    const overProbability = lower.probability + (upper.probability - lower.probability) * fraction;
    const probability = selection(target) === 'over' ? overProbability : 1 - overProbability;
    const weight = Math.min(lower.weight, upper.weight);
    const detail = { book: rule.book, lowerLine: lower.line, upperLine: upper.line,
      lowerProbability: lower.probability, upperProbability: upper.probability, probability, weight,
      quoteIds: [...lower.quoteIds, ...upper.quoteIds], basis: 'Linear interpolation of same-book no-vig Over probabilities.' };
    provenance.push(detail);
    books.push({ book: rule.book, probability, weight, vigPercent: Math.max(lower.vigPercent, upper.vigPercent),
      liquidity: Math.min(lower.liquidity, upper.liquidity), quoteIds: detail.quoteIds });
  }
  const result = combine(books, rules, settings, true);
  return Number.isFinite(result.probability) ? { ...result, estimate: true, label: 'Interpolated fair-probability estimate', provenance } : null;
}

/** The EV above which a row is treated as a feed error: none with a saved maximum EV, else 25% (10% with one reference book). */
export const evCapFor = (row, settings = {}) => settings?.maxEvPercent === '' || settings?.maxEvPercent == null
  ? (row?.consensus?.books?.length || 0) <= 1 ? EV_SINGLE_BOOK_LIMIT : EV_SANITY_LIMIT : Infinity;

/**
 * Every available price with a consensus fair probability: { quote, fair, ev, edge, consensus, estimated,
 * conditionalOnNoPush }, highest EV first. EV = (1 − push) × (fair × effective decimal − 1). Display filters
 * (league, EV thresholds, odds range) are the page's; this prices everything.
 */
export function computeAdvancedEv(allQuotes, settings = {}) {
  if (!Array.isArray(allQuotes)) return [];
  return withIdentities(() => {
    const now = Number.isFinite(settings.now) ? settings.now : Date.now(), effectiveSettings = { ...settings, now };
    const index = marketIndex(allQuotes, effectiveSettings, now);
    let familyIndex = null;
    return allQuotes.flatMap(quote => {
      if (!quoteAvailable(quote, effectiveSettings, now)) return [];
      let consensus = consensusPrice(quote, allQuotes, effectiveSettings, index), projection = null;
      if (!Number.isFinite(consensus.probability) && settings.allowProjection) {
        familyIndex ??= marketIndex(allQuotes, effectiveSettings, now, false);
        projection = projectProbability(quote, allQuotes, effectiveSettings, familyIndex);
        if (projection) consensus = projection;
      }
      const fair = consensus.probability, payout = effectiveDecimal(quote);
      const push = valuePresent(quote.pushProbability) ? number(quote.pushProbability) : 0;
      if (!Number.isFinite(fair) || !Number.isFinite(payout) || !(push >= 0 && push < 1)) return [];
      const ev = (1 - push) * (fair * payout - 1), edge = fair - 1 / payout;
      return [{ quote, fair, ev, edge, consensus, estimated: Boolean(projection), ...(projection ? { projection } : {}),
        conditionalOnNoPush: thresholdMarket(quote) && Number.isInteger(lineNumber(quote)) && !valuePresent(quote.pushProbability) && quote.pushRule !== 'no-push' }];
    }).sort((a, b) => b.ev - a.ev);
  });
}

// ---- Market groups and paired opportunities ----

// Books that copy one platform's prices (BetRivers, Desert Diamond, Bally Bet on Kambi) are one book.
export const priceFamily = quote => quote.priceFamily || quote.book;
const START_GAP_MS = 3 * 3_600_000;
/** False when both legs carry start times more than 3 hours apart: the feed filed two games under one name. */
export const sameGame = (a, b) => { const x = Date.parse(a.startTime), y = Date.parse(b.startTime); return !(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > START_GAP_MS); };
export const validQuote = quote => quote && quote.event && quote.market && quote.side && quote.book && Number.isFinite(decimal(quote.odds));
const newest = list => list.slice().sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];

/** Valid quotes grouped by exact market (`mode` true/false keeps only live/pregame ones). */
export function groups(quotes, mode = null) {
  const map = new Map();
  for (const quote of quotes.filter(validQuote)) {
    if (mode !== null && Boolean(quote.live) !== mode) continue;
    const key = marketKey(quote);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(quote);
  }
  return [...map.values()];
}

/** The two sides of a two-way market, or [] (three-way markets, futures with more outcomes). */
export function opposingSides(rows) {
  const sides = [...new Set(rows.map(quote => quote.side))];
  if (rows.some(quote => quote.type === 'three-way')) return [];
  if (rows.some(quote => quote.type === 'future') && !sides.every(side => ['yes', 'no'].includes(side.toLowerCase())) && !rows.every(quote => Number(quote.outcomes) === 2)) return [];
  return sides.length === 2 ? sides : [];
}

/**
 * A price only counts in a cross-book comparison when its own book prices every side of the same market
 * at a real margin: 100-125% implied. One-sided listings can't be checked, and a book whose own sides add
 * up to under 100% (Novig pairs at 99%, which can't both be takeable) or far over is quoting something
 * else: a mixed ladder, a mislabeled side, a yes/no prop or another game (Oct 2026: every arbitrage the
 * feed produced came from such listings).
 */
export function ownBookConsistent(quote, rows, available) {
  const index = ownBookIndex(rows, available), sides = index.sides;
  if (!sides.includes(quote.side)) return false;
  const own = sides.map(side => index.latest.get(`${quote.book}\u0000${side}`));
  if (!own.every(Boolean)) return false;
  const sum = own.reduce((total, row) => total + implied(row.odds), 0);
  return sum >= 1 && sum <= 1.25;
}

// The two sides of a market and each book's newest available price per side. Within a run it is built once
// per rows list and availability test.
function ownBookIndex(rows, available) {
  let byTest = identities?.ownBook.get(rows);
  const cached = byTest?.get(available);
  if (cached) return cached;
  const latest = new Map();
  for (const row of rows) {
    if (!available(row)) continue;
    const key = `${row.book}\u0000${row.side}`, prior = latest.get(key);
    if (!prior || Date.parse(row.ts) > Date.parse(prior.ts)) latest.set(key, row);
  }
  const index = { sides: opposingSides(rows), latest };
  if (identities) { if (!byTest) identities.ownBook.set(rows, byTest = new Map()); byTest.set(available, index); }
  return index;
}

/** Market rows by market key, for ownBookConsistent and plausibleEv lookups. */
export const marketRowsOf = quotes => new Map(groups(quotes).map(rows => [marketKey(rows[0]), rows]));
/**
 * Whether a priced row can be shown as +EV: within the sanity cap (evCapFor), and, for a game line, from
 * a book that prices both sides (one-sided Fanatics ladder prices were the feed's biggest "edges"). Props
 * may be one-sided milestones.
 */
export function plausibleEv(row, marketRows, settings = {}, available) {
  if (!(row.ev <= evCapFor(row, settings))) return false;
  return !['moneyline', 'spread', 'total'].includes(row.quote.type) || ownBookConsistent(row.quote, marketRows.get(marketKey(row.quote)) || [], available);
}

/** The best current price on each side of a two-way market, from books pricing both sides. */
export function bestSides(rows, available) {
  const sides = opposingSides(rows);
  if (!sides.length) return [];
  return sides.map(side => rows.filter(quote => quote.side === side && available(quote) && ownBookConsistent(quote, rows, available)).sort((a, b) => decimal(b.odds) - decimal(a.odds))[0]).filter(Boolean);
}

/** Two-way markets with the best price on each side and their combined hold, lowest first. */
export function holdRows(quotes, mode, available) {
  return groups(quotes, mode).map(rows => {
    const best = bestSides(rows, available);
    if (best.length !== 2) return null;
    return { rows, best, hold: implied(best[0].odds) + implied(best[1].odds) - 1 };
  }).filter(Boolean).sort((a, b) => a.hold - b.hold);
}

/**
 * Markets where two books' opposite sides add up to under 100%: { rows, best, pairs } with every such
 * pair, best first. Each leg must pass ownBookConsistent, come from a different price family and the
 * same game; mirrored books quoting the same pair are listed once.
 */
// Implied sums this close to 100% are even money (+170 / -170 sums to 0.9999999999999999), not arbitrage.
const BREAK_EVEN_TOLERANCE = 1e-9;
export function arbitrageRows(quotes, mode, settings = {}) {
  const available = quote => quoteAvailable(quote, settings, Number.isFinite(settings.now) ? settings.now : Date.now());
  const total = pair => implied(pair[0].odds) + implied(pair[1].odds);
  return groups(quotes, mode).map(rows => {
    const sides = opposingSides(rows);
    if (!sides.length) return null;
    const usable = rows.filter(quote => available(quote) && ownBookConsistent(quote, rows, available));
    const seen = new Set(), pairs = [];
    for (const a of usable.filter(quote => quote.side === sides[0])) for (const b of usable.filter(quote => quote.side === sides[1])) {
      if (priceFamily(a) === priceFamily(b) || !sameGame(a, b) || total([a, b]) >= 1 - BREAK_EVEN_TOLERANCE) continue;
      const key = JSON.stringify([priceFamily(a), Number(a.odds), priceFamily(b), Number(b.odds)]);
      if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); }
    }
    pairs.sort((a, b) => total(a) - total(b));
    return pairs.length ? { rows, best: pairs[0], pairs } : null;
  }).filter(Boolean).sort((a, b) => total(a.best) - total(b.best));
}

/** Over/Under or opposing-spread pairs at different books with a reachable score where both win. */
export function middleRows(quotes, mode, settings = {}) {
  const available = quote => quoteAvailable(quote, settings, Number.isFinite(settings.now) ? settings.now : Date.now());
  const candidates = quotes.filter(validQuote).filter(quote => ['total', 'spread', 'alternate'].includes(quote.type) && Boolean(quote.live) === mode && available(quote));
  // Each leg's own book must price both sides of its line (see ownBookConsistent).
  const markets = new Map();
  for (const quote of candidates) { const key = marketKey(quote); if (!markets.has(key)) markets.set(key, []); markets.get(key).push(quote); }
  const families = new Map();
  for (const quote of candidates.filter(quote => ownBookConsistent(quote, markets.get(marketKey(quote)), available))) {
    const key = familyKey(quote);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(quote);
  }
  const found = [];
  // Scores are whole numbers, so a window like 45 to 45.5 has no score where both bets win.
  const reachable = (low, high) => Math.floor(low) + 1 < high;
  for (const rows of families.values()) {
    const overs = rows.filter(quote => quote.side.toLowerCase() === 'over');
    const unders = rows.filter(quote => quote.side.toLowerCase() === 'under');
    for (const over of overs) for (const under of unders) {
      if (Number(over.line) >= Number(under.line) || priceFamily(over) === priceFamily(under) || !sameGame(over, under) || !reachable(Number(over.line), Number(under.line))) continue;
      found.push({ over, under, kind: 'total', window: `Total ${over.line} to ${under.line}`, low: Number(over.line), high: Number(under.line), width: Number(under.line) - Number(over.line), cost: 1 - 1 / (implied(over.odds) + implied(under.odds)) });
    }
    const spreadSides = [...new Set(rows.filter(quote => quote.type === 'spread' || quote.type === 'alternate' && !['over', 'under'].includes(quote.side.toLowerCase())).map(quote => quote.side))];
    if (spreadSides.length !== 2) continue;
    for (const over of rows.filter(quote => quote.side === spreadSides[0])) for (const under of rows.filter(quote => quote.side === spreadSides[1])) {
      const low = -Number(over.line), high = Number(under.line);
      if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high || priceFamily(over) === priceFamily(under) || !sameGame(over, under) || !reachable(low, high)) continue;
      found.push({ over, under, kind: 'spread', window: `${over.selection || spreadSides[0]} margin ${low} to ${high}`, low, high, width: high - low, cost: 1 - 1 / (implied(over.odds) + implied(under.odds)) });
    }
  }
  return found.sort((a, b) => b.width - a.width || a.cost - b.cost);
}

// Exchange prices with liquidity beside the best sportsbook price on the other side. Two-way markets only
// (a three-way draw isn't "the other side"), and only sides the feed confirmed: ProphetX's unnamed
// "home" prices were the other player's.
export function sharpMatches(quotes, minimum = 1000, available) {
  const confirmed = quote => quote.sideVerified !== false;
  return groups(quotes).filter(rows => opposingSides(rows).length === 2).flatMap(rows => rows.filter(quote => quote.exchange && confirmed(quote) && Number(quote.liquidity) >= minimum && available(quote)).map(exchange => {
    const opposite = rows.filter(quote => quote.exchange && confirmed(quote) && quote.side !== exchange.side && available(quote)).sort((a, b) => decimal(b.odds) - decimal(a.odds))[0];
    const sportsbook = rows.filter(quote => !quote.exchange && confirmed(quote) && quote.side !== exchange.side && available(quote)).sort((a, b) => decimal(b.odds) - decimal(a.odds))[0];
    if (!sportsbook || (opposite && decimal(sportsbook.odds) <= decimal(opposite.odds))) return null;
    return { exchange, opposite, sportsbook, liquidity: Number(exchange.liquidity), improvement: opposite ? decimal(sportsbook.odds) / decimal(opposite.odds) - 1 : NaN };
  }).filter(Boolean));
}

/**
 * Promotion prices and the best hedges on the other side: a sportsbook (never an exchange) price in a
 * two-way market whose own book prices both sides, against current prices at other price families in the
 * same game that also pass ownBookConsistent, best price first, up to `limit`. Pairs whose combined
 * implied probability shows more than the arbitrage cap are mislabeled prices and left out.
 */
export function hedgePairs(quotes, available, { cap = ARB_SANITY_LIMIT, limit = 3 } = {}) {
  return groups(quotes).flatMap(rows => {
    if (opposingSides(rows).length !== 2) return [];
    const usable = rows.filter(quote => available(quote) && ownBookConsistent(quote, rows, available)).sort((a, b) => decimal(b.odds) - decimal(a.odds));
    return usable.filter(quote => !quote.exchange).flatMap(promo => {
      const hedges = usable.filter(other => other.side !== promo.side && priceFamily(other) !== priceFamily(promo) && sameGame(other, promo))
        .map(hedge => ({ hedge, impliedSum: implied(promo.odds) + implied(hedge.odds) })).filter(({ impliedSum }) => 1 / impliedSum - 1 <= cap).slice(0, limit);
      return hedges.length ? [{ promo, hedges }] : [];
    });
  });
}

// ---- The /api/odds contract ----

// Probabilities, EV and margins go out to 5 decimals (0.001%): far finer than any display, and the
// response compresses better without noise digits.
const round = (value, digits = 5) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const americanOf = probability => { const odds = probabilityToAmerican(probability); return Number.isFinite(odds) ? odds : null; };
const oldest = quotes => quotes.map(quote => quote.ts).filter(Boolean).sort()[0] ?? null;
const earliest = values => values.filter(Boolean).sort()[0] ?? null;

/** The pricing the engine applies for `settings` (reported in every response's meta). */
export function pricingApplied(settings = {}) {
  const ownCaps = !(settings.maxEvPercent === '' || settings.maxEvPercent == null);
  return {
    devigMethod: DEVIG_METHODS.includes(settings.devigMethod) ? settings.devigMethod : 'multiplicative', devigVersion: DEVIG_VERSION,
    minSharpBooks: valuePresent(settings.minSharpBooks) ? number(settings.minSharpBooks) : 1,
    maxVigPercent: valuePresent(settings.maxVigPercent) ? number(settings.maxVigPercent) : null,
    liveMaxAgeSeconds: number(settings.liveMaxAgeSeconds) > 0 ? number(settings.liveMaxAgeSeconds) : LIVE_MAX_AGE_SECONDS,
    pregameMaxAgeSeconds: number(settings.pregameMaxAgeSeconds) > 0 ? number(settings.pregameMaxAgeSeconds) : PREGAME_MAX_AGE_SECONDS,
    evCap: ownCaps ? number(settings.maxEvPercent) / 100 : EV_SANITY_LIMIT, evCapSingleBook: ownCaps ? number(settings.maxEvPercent) / 100 : EV_SINGLE_BOOK_LIMIT,
    arbCap: arbCapFor(settings),
  };
}
export const arbCapFor = settings => settings?.maxArbPercent === '' || settings?.maxArbPercent == null ? ARB_SANITY_LIMIT : number(settings.maxArbPercent) / 100;

// Each book's own complete market: implied probabilities, hold and its no-vig split.
function ownMarkets(rows, current, method) {
  const latest = new Map();
  for (const quote of rows) {
    if (!current.has(quote)) continue;
    const key = `${name(quote.book)}|${selection(quote)}`, prior = latest.get(key);
    if (!prior || Date.parse(quote.ts) > Date.parse(prior.ts)) latest.set(key, quote);
  }
  const result = new Map();
  for (const quote of rows) {
    const sides = sideNames(quote, rows);
    if (sides.length < 2) continue;
    const own = sides.map(side => latest.get(`${name(quote.book)}|${side}`));
    if (!own.every(Boolean)) continue;
    const probabilities = own.map(row => implied(row.odds));
    if (!probabilities.every(Number.isFinite)) continue;
    const fair = devig(probabilities, method);
    result.set(quote, { hold: probabilities.reduce((sum, value) => sum + value, 0) - 1, fair: fair.length ? fair[sides.indexOf(selection(quote))] : NaN });
  }
  return result;
}

// Odds-screen outliers among current prices of one market: a side the feed couldn't verify that its book
// doesn't pair with the other side, or a price more than 10 points (implied) longer than the median of
// the other books at the same line (mirrors of one platform count once).
function outliers(rows, current) {
  const live = rows.filter(quote => current.has(quote)), flagged = new Set();
  for (const quote of live) {
    const same = live.filter(other => other !== quote);
    if (quote.sideVerified === false && !same.some(other => other.book === quote.book && other.side !== quote.side)) { flagged.add(quote); continue; }
    const families = new Map();
    for (const other of same) if (other.side === quote.side && other.book !== quote.book && !families.has(familyName(other))) families.set(familyName(other), implied(other.odds));
    const values = [...families.values()].filter(Number.isFinite).sort((a, b) => a - b), middle = values.length >> 1;
    if (!values.length) continue;
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    if (median - implied(quote.odds) > OUTLIER_POINTS) flagged.add(quote);
  }
  return flagged;
}

// Per-unit outcomes of a middle at a score, through middleOutcomes on a large base so cent rounding is negligible.
const MIDDLE_BASE = 10_000;
function middleAt(row, fractions, score) {
  const result = middleOutcomes(row.over, row.under, fractions[0] * MIDDLE_BASE, fractions[1] * MIDDLE_BASE, score);
  return result ? { first: result.a.result, second: result.b.result, netPerUnit: round(result.profit / MIDDLE_BASE) } : null;
}
// Final totals (or first-selection margins) from just below to just above the window.
function middleScores(low, high) {
  let scores = [];
  for (let score = Math.floor(low) - 1; score <= Math.ceil(high) + 1; score++) scores.push(score);
  if (scores.length > 12) scores = [...new Set([Math.floor(low) - 1, Math.floor(low), Math.round((low + high) / 2), Math.ceil(high), Math.ceil(high) + 1])];
  return scores;
}
// Only the financial terms of a leg (odds, commission, limits) go into a stake split.
const allocationLeg = quote => Object.fromEntries(['odds', 'commission', 'commissionPercent', 'boostPercent', 'minStake', 'maxStake', 'maxBet', 'exchange', 'liquidity'].filter(key => quote[key] !== undefined).map(key => [key, quote[key]]));
const capacityOf = plan => Number.isFinite(plan?.maximumFeasibleTotal) ? round(plan.maximumFeasibleTotal, 2) : null;
// Stake shares don't depend on the total; a large one reports the supplied limits without capping by it.
const SPLIT_BASE = 1_000_000;
// Sections whose best prices depend on which books the member can bet.
const OFFER_SECTIONS = new Set(['holds', 'hedges']);

/**
 * Prices a normalized snapshot for one set of pricing settings at `now`: the producer fields of every quote
 * and each analytics section of the /api/odds contract. Sections are built on first use (`section(name)`).
 */
export function analyzeSnapshot(quotes, settings = {}, { now = Date.now() } = {}) {
  const priced = { ...settings, now }, applied = pricingApplied(settings), method = applied.devigMethod;
  const available = quote => quoteAvailable(quote, priced, now);
  const identity = new Map(), byMarket = new Map(), current = new Set();
  const fields = new Map(), cache = newMemo(), run = work => withIdentities(work, cache);
  run(() => {
    for (const quote of quotes) {
      const key = identityOf(quote);
      identity.set(quote, key);
      if (!byMarket.has(key)) byMarket.set(key, []);
      byMarket.get(key).push(quote);
      if (available(quote)) current.add(quote);
    }
    for (const [key, rows] of byMarket) {
      const own = ownMarkets(rows, current, method), flagged = outliers(rows, current), hashed = stableHash(key);
      const consistentRows = opposingSides(rows).length === 2;
      for (const quote of rows) {
        const book = own.get(quote), probability = implied(quote.odds);
        fields.set(quote, {
          marketKey: hashed, impliedProbability: round(probability), bookFairProbability: round(book?.fair), bookHold: round(book?.hold),
          consistent: consistentRows && ownBookConsistent(quote, rows, available), outlier: flagged.has(quote),
          expiresAt: expiresAt(quote, priced), status: quoteStatus(quote, priced, now),
        });
      }
    }
  });
  const marketKeyOf = quote => fields.get(quote)?.marketKey ?? stableHash(identity.get(quote) ?? marketIdentity(quote));
  const built = new Map();
  const builders = {
    pricing() {
      const rows = computeAdvancedEv(quotes, priced), markets = marketRowsOf(quotes);
      return rows.map(row => {
        const plausible = plausibleEv(row, markets, priced, available), books = row.consensus.books || [];
        return {
          quoteId: row.quote.id, fairProbability: round(row.fair), fairOdds: americanOf(row.fair), devigMethod: method, devigVersion: DEVIG_VERSION,
          bookCount: books.length, ...(row.ev > 0 ? { references: books.map(book => ({ book: book.book, probability: round(book.probability), weight: round(book.weight, 4), vigPercent: round(book.vigPercent, 3), ...(book.exchange ? { exchange: true } : {}), ...(book.mirrors?.length ? { mirrors: book.mirrors } : {}) })) } : {}),
          edge: round(row.edge), ev: round(row.ev), kellyFraction: round(kellyFraction(row.fair, effectiveDecimal(row.quote))), plausible,
          estimated: row.estimated, conditionalOnNoPush: row.conditionalOnNoPush,
        };
      });
    },
    markets() {
      const result = [];
      for (const [key, rows] of byMarket) {
        const live = rows.filter(quote => current.has(quote));
        if (!live.length) continue;
        const sides = [...new Set(live.map(quote => quote.side))];
        result.push({ key: marketKeyOf(rows[0]), live: Boolean(rows[0].live), twoWay: opposingSides(rows).length === 2, sides: sides.map(side => {
          const anchor = live.find(quote => quote.side === side), fair = marketFairPrice(anchor, live, priced);
          // One price per book (its newest), outliers left out.
          const perBook = new Map();
          for (const quote of live) if (quote.side === side && !fields.get(quote).outlier) { const prior = perBook.get(quote.book); if (!prior || Date.parse(quote.ts) > Date.parse(prior.ts)) perBook.set(quote.book, quote); }
          const prices = [...perBook.values()].map(quote => implied(quote.odds)).filter(Number.isFinite);
          const average = prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : NaN;
          return { side, fairProbability: round(fair.probability), fairOdds: americanOf(fair.probability), fairBookCount: fair.bookCount,
            averageImpliedProbability: round(average), averageOdds: americanOf(average), priceCount: prices.length };
        }) });
      }
      return result;
    },
    arbitrage() {
      const cap = applied.arbCap;
      return [false, true].flatMap(mode => arbitrageRows(quotes, mode, priced)).flatMap(({ pairs }) => pairs.map(legs => {
        // Whole legs (not only their prices): a shared whole-number line can push.
        const plan = constrainedArb(legs, SPLIT_BASE);
        if (!plan) return null;
        const inverse = plan.multipliers.reduce((sum, multiplier) => sum + 1 / multiplier, 0), margin = 1 / inverse - 1;
        if (!(margin > BREAK_EVEN_TOLERANCE) || margin > cap) return null;
        return {
          id: legs.map(leg => leg.id).join('|'), marketKey: marketKeyOf(legs[0]), live: Boolean(legs[0].live),
          legs: legs.map((leg, index) => ({ quoteId: leg.id, book: leg.book, side: leg.side, odds: Number(leg.odds), multiplier: round(plan.multipliers[index]), impliedProbability: round(1 / plan.multipliers[index]), stakeFraction: round(plan.fractions[index], 8), maxStake: Number.isFinite(number(leg.maxStake ?? leg.maxBet)) ? number(leg.maxStake ?? leg.maxBet) : null, liquidity: leg.exchange && Number.isFinite(number(leg.liquidity)) ? number(leg.liquidity) : null })),
          impliedSum: round(inverse), margin: round(margin), payoutPerUnit: round(1 / inverse),
          // A shared whole-number line can push: both cash stakes come back, so the lowest outcome is break-even.
          lowestPerUnit: round(plan.pushPossible ? Math.min(0, margin) : margin), pushPossible: plan.pushPossible,
          capacity: capacityOf(plan), minimumTotal: round(plan.minimumFeasibleTotal, 2), limitsKnown: plan.limitsKnown,
          observedAt: oldest(legs), expiresAt: earliest(legs.map(leg => fields.get(leg)?.expiresAt)),
        };
      })).filter(Boolean).sort((a, b) => b.margin - a.margin);
    },
    middles() {
      const cap = applied.arbCap;
      return [false, true].flatMap(mode => middleRows(quotes, mode, priced)).flatMap(row => {
        if (row.cost < -cap) return [];
        const plan = constrainedArb([allocationLeg(row.over), allocationLeg(row.under)], SPLIT_BASE);
        if (!plan) return [];
        const fractions = plan.fractions, at = score => middleAt(row, fractions, score);
        const inside = at((row.low + row.high) / 2), below = at(row.low - 1), above = at(row.high + 1);
        if (!inside || !below || !above) return [];
        const ladder = middleScores(row.low, row.high).map(score => ({ score, ...at(score) })).filter(point => point.first);
        return [{
          id: `${row.over.id}|${row.under.id}`, kind: row.kind, live: Boolean(row.over.live), marketKey: marketKeyOf(row.over),
          firstQuoteId: row.over.id, secondQuoteId: row.under.id, window: { low: row.low, high: row.high, label: row.window }, width: row.width, cost: round(row.cost),
          stakeFractions: fractions.map(value => round(value, 8)), capacity: capacityOf(plan), limitsKnown: plan.limitsKnown,
          perUnit: { inside: inside.netPerUnit, outside: Math.min(below.netPerUnit, above.netPerUnit),
            // A score can only land on a whole-number line (a push for that leg); half-point lines never.
            atLower: Number.isInteger(row.low) ? at(row.low)?.netPerUnit ?? null : null, atUpper: Number.isInteger(row.high) ? at(row.high)?.netPerUnit ?? null : null },
          ladder, observedAt: oldest([row.over, row.under]), expiresAt: earliest([row.over, row.under].map(leg => fields.get(leg)?.expiresAt)),
        }];
      });
    },
    holds({ offered }) {
      const cap = applied.arbCap;
      return [false, true].flatMap(mode => holdRows(quotes, mode, offered)).filter(row => 1 / (1 + row.hold) - 1 <= cap).map(({ rows, best: [a, b], hold }) => {
        const probabilities = [implied(a.odds), implied(b.odds)], fair = devig(probabilities, method);
        return { id: `${a.id}|${b.id}`, marketKey: marketKeyOf(a), live: Boolean(a.live), quoteIds: [a.id, b.id], hold: round(hold),
          impliedProbabilities: probabilities.map(value => round(value)), fairProbabilities: [round(fair[0]), round(fair[1])], fairOdds: [americanOf(fair[0]), americanOf(fair[1])],
          bookCount: new Set(rows.map(quote => quote.book)).size, observedAt: oldest([a, b]) };
      }).sort((a, b) => a.hold - b.hold);
    },
    sharp() {
      // Every exchange price with depth; the page applies the member's minimum liquidity.
      return sharpMatches(quotes.filter(quote => !quote.depthOnly), 0, available).map(match => ({
        id: match.exchange.id, exchangeQuoteId: match.exchange.id, oppositeExchangeQuoteId: match.opposite?.id ?? null, sportsbookQuoteId: match.sportsbook.id,
        liquidity: match.liquidity, improvement: round(match.improvement), observedAt: oldest([match.exchange, match.sportsbook]),
      }));
    },
    hedges({ offered }) {
      return hedgePairs(quotes, offered, { cap: ARB_SANITY_LIMIT }).map(({ promo, hedges }) => ({
        promoQuoteId: promo.id, hedges: hedges.map(({ hedge, impliedSum }) => ({ quoteId: hedge.id, impliedSum: round(impliedSum) })),
      }));
    },
  };
  return {
    applied, now,
    /** The producer fields for one quote. */
    fields: quote => fields.get(quote) ?? null,
    /**
     * One section. `books` limits the prices that can be offered in holds and hedge pairs to books the member
     * can bet (best prices are chosen among them); fair values and the other sections use every book.
     */
    section(sectionName, { books = null } = {}) {
      if (!builders[sectionName]) throw new Error(`Unknown snapshot section: ${sectionName}`);
      const limited = books?.size && OFFER_SECTIONS.has(sectionName), key = limited ? `${sectionName}|${[...books].sort().join(',')}` : sectionName;
      if (!built.has(key)) {
        const offered = limited ? (quote => books.has(quote.book) && available(quote)) : available;
        built.set(key, run(() => builders[sectionName]({ offered })));
        if (built.size > 24) built.delete([...built.keys()].find(entry => entry.includes('|')));
      }
      return built.get(key);
    },
  };
}
