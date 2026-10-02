// Pure calculations for saved, manually entered, or provider-supplied records.
// Percent settings use percentage points; returned EV, ROI and CLV use fractions.
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const valuePresent = value => value !== undefined && value !== null && value !== '';
const number = value => typeof value === 'number' ? (Number.isFinite(value) ? value : NaN)
  : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
const text = value => typeof value === 'string' ? value.trim() : '';
const name = value => text(value).toLowerCase().replace(/\s+/g, ' ');
const identifier = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : name(value);
const americanDecimal = value => {
  const odds = number(value);
  return Number.isFinite(odds) && Math.abs(odds) >= 100 ? odds > 0 ? 1 + odds / 100 : 1 - 100 / odds : NaN;
};
const timestamp = value => typeof value === 'string' && /(?:z|[+-]\d\d:\d\d)$/i.test(value) ? Date.parse(value) : NaN;
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
const lineNumber = quote => number(quote?.line);
const selection = quote => name(quote?.side);
const live = quote => quote?.live === true;
const kind = quote => name(quote?.type) === 'alternate'
  ? ['over', 'under'].includes(selection(quote)) ? 'total' : 'spread'
  : name(quote?.type) || (['over', 'under'].includes(selection(quote)) ? 'total' : 'moneyline');
const thresholdMarket = quote => ['total', 'spread', 'prop', 'alternate'].includes(kind(quote)) || ['over', 'under'].includes(selection(quote));
const stable = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  : Array.isArray(value) ? value.map(stable) : value;
const settlement = quote => stable({
  rules: quote?.settlement ?? quote?.settlementRules ?? 'standard',
  overtime: quote?.includeOvertime ?? null,
  drawNoBet: quote?.drawNoBet ?? false,
  deadHeat: quote?.deadHeat ?? null,
  pushRule: quote?.pushRule ?? null
});
const eventIdentity = quote => JSON.stringify([identifier(quote?.sport), identifier(quote?.league || quote?.sport), identifier(quote?.eventId || quote?.event)]);

// Spreads are keyed by the signed handicap of one stable participant. A team
// without an identifiable opponent is kept separate rather than matched by |line|.
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

export function marketIdentity(quote, includeLine = true) {
  if (!quote || typeof quote !== 'object') return '';
  const point = kind(quote) === 'spread' ? spreadCoordinate(quote) : Number.isFinite(lineNumber(quote)) ? lineNumber(quote) : null;
  return JSON.stringify([
    identifier(quote.sport), identifier(quote.league || quote.sport), identifier(quote.eventId || quote.event),
    identifier(quote.playerId || quote.player), identifier(quote.marketId || quote.market),
    name(quote.period || 'full'), kind(quote), settlement(quote), live(quote), ...(includeLine ? [point] : [])
  ]);
}

export function quoteAvailable(quote, settings = {}, now = Date.now()) {
  if (!quote || typeof quote !== 'object' || !Number.isFinite(now)) return false;
  if (!identifier(quote.sport) || !identifier(quote.eventId || quote.event) || !identifier(quote.marketId || quote.market)
    || !selection(quote) || !name(quote.book) || !Number.isFinite(americanDecimal(quote.odds))) return false;
  if (quote.live != null && typeof quote.live !== 'boolean') return false;
  for (const flag of ['available', 'active', 'suspended', 'expired', 'stale']) if (quote[flag] != null && typeof quote[flag] !== 'boolean') return false;
  if (quote.available === false || quote.active === false || quote.suspended === true || quote.expired === true || quote.stale === true || quote.depthOnly === true) return false;
  if (['suspended', 'expired', 'closed', 'settled', 'cancelled', 'canceled', 'unavailable', 'stale', 'removed'].includes(name(quote.status))) return false;
  if (['final', 'finished', 'post', 'settled', 'cancelled', 'canceled', 'postponed'].includes(name(quote.gameStatus))) return false;
  if (['live', 'in', 'in-play', 'inplay'].includes(name(quote.gameStatus)) && !live(quote)) return false;
  if (thresholdMarket(quote) && !Number.isFinite(lineNumber(quote))) return false;
  if (valuePresent(quote.outcomes) && (!Number.isInteger(number(quote.outcomes)) || number(quote.outcomes) < 2 || number(quote.outcomes) > 64)) return false;
  const observed = timestamp(quote.ts), ageSetting = live(quote) ? settings.liveMaxAgeSeconds : settings.pregameMaxAgeSeconds;
  // Defaults: live 90 s, pregame 15 min. Feed books rescrape every few minutes, so an older pregame
  // price is one the book has stopped offering.
  const maximumAge = ageSetting == null ? live(quote) ? 90 : 900 : number(ageSetting);
  if (!Number.isFinite(observed) || !(maximumAge > 0) || observed > now || now - observed > maximumAge * 1000) return false;
  for (const field of ['expiresAt', 'expiry', 'expiryTime']) if (valuePresent(quote[field])) {
    const expires = timestamp(quote[field]);
    if (!Number.isFinite(expires) || expires <= now) return false;
  }
  if (!live(quote) && valuePresent(quote.startTime)) {
    const starts = timestamp(quote.startTime);
    if (!Number.isFinite(starts) || starts <= now) return false;
  }
  for (const field of ['maxStake', 'maxBet']) if (valuePresent(quote[field]) && !(number(quote[field]) > 0)) return false;
  if (quote.exchange && valuePresent(quote.liquidity) && !(number(quote.liquidity) > 0)) return false;
  return true;
}

// Standard normal CDF (complementary error function, |error| < 1.2e-7) and its inverse (Acklam).
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const normalCdf = x => 0.5 * erfc(-x / Math.SQRT2);
function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = q => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Devig methods the fair-value settings offer. Multiplicative is the default. */
export const DEVIG_METHODS = Object.freeze(['multiplicative', 'additive', 'power', 'probit']);

/** American odds → the book's implied probability, vig included: -140 → 140/240 = 58.33%, +118 → 100/218 = 45.87%. */
export function americanToImpliedProbability(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return NaN;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}

/**
 * Every outcome of one book's market (American odds) → implied probabilities, overround and fair
 * probabilities. -140 / +118: implied 58.33% / 45.87% (104.20%), multiplicative fair 56.00% / 44.00%.
 */
export function fairFromAmerican(odds, method = 'multiplicative') {
  const implied = (Array.isArray(odds) ? odds : []).map(americanToImpliedProbability);
  const fair = implied.length > 1 && implied.every(Number.isFinite) ? devig(implied, method) : [];
  return { implied, overround: implied.reduce((sum, value) => sum + value, 0), fair, method };
}

/**
 * Implied probabilities of every outcome of one book's market → fair (no-vig) probabilities that sum
 * to 1. Methods differ in how the book's margin is taken back:
 *   multiplicative  p / Σp (each price keeps its share)
 *   additive        p − (Σp − 1) / n (the same amount from every outcome)
 *   power           p^k, with k chosen so Σp^k = 1 (more margin taken from long shots)
 *   probit          Φ(Φ⁻¹(p) − c), with c chosen so the outcomes sum to 1 (one shift on the normal scale)
 * Returns [] when the inputs or the method can't produce valid probabilities.
 */
export function devig(probabilities, method = 'multiplicative') {
  if (!Array.isArray(probabilities) || probabilities.length < 2) return [];
  const values = probabilities.map(number);
  if (values.some(value => !(value > 0 && value < 1))) return [];
  const sum = values.reduce((total, value) => total + value, 0);
  let fair;
  if (method === 'multiplicative') fair = values.map(value => value / sum);
  else if (method === 'additive') fair = values.map(value => value - (sum - 1) / values.length);
  else if (method === 'power') {
    let low = 0, high = 1;
    const total = power => values.reduce((result, value) => result + value ** power, 0);
    while (total(high) > 1 && high < 1024) high *= 2;
    if (total(high) > 1) return [];
    for (let iteration = 0; iteration < 90; iteration++) {
      const middle = (low + high) / 2;
      if (total(middle) > 1) low = middle; else high = middle;
    }
    fair = values.map(value => value ** ((low + high) / 2));
  } else if (method === 'probit') {
    const scores = values.map(normalQuantile);
    const total = shift => scores.reduce((result, score) => result + normalCdf(score - shift), 0);
    let low = -10, high = 10;
    for (let iteration = 0; iteration < 100; iteration++) {
      const middle = (low + high) / 2;
      if (total(middle) > 1) low = middle; else high = middle;
    }
    fair = scores.map(score => normalCdf(score - (low + high) / 2));
  } else return [];
  return fair.every(value => value > 0 && value < 1) && Math.abs(fair.reduce((total, value) => total + value, 0) - 1) < 1e-8 ? fair : [];
}

function matchesScope(rule, quote) {
  return ['sport', 'league', 'market'].every(field => !valuePresent(rule[field]) || name(rule[field]) === name(field === 'league' ? quote.league || quote.sport : quote[field]));
}

// Without saved reference-book rules, sharp books count more: their prices move first and carry
// the least margin, which is what fair-odds tools anchor on.
// Matches the quote API's /books list, which marks Pinnacle, Betfair and Circa as sharp benchmarks.
/** Smallest margin (%) a sportsbook market needs before it is devigged into a fair price. */
export const MIN_BOOK_VIG_PERCENT = 0.5;
export const DEFAULT_SHARP_WEIGHTS = Object.freeze({ pinnacle: 3, betfair: 3, 'betfair exchange': 3, circa: 3, 'circa sports': 3 });
function referenceRules(quote, quotes, settings) {
  const configured = Array.isArray(settings.bookRules) && settings.bookRules.length ? settings.bookRules : null;
  const rules = new Map();
  if (configured) {
    const selected = configured.filter(rule => rule && name(rule.book) && matchesScope(rule, quote))
      .map((rule, order) => ({ ...rule, order, specificity: ['sport', 'league', 'market'].filter(field => valuePresent(rule[field])).length }))
      .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    for (const rule of selected) rules.set(name(rule.book), { ...rule, weight: rule.weight == null ? 1 : number(rule.weight) });
  } else {
    for (const row of quotes) if (name(row?.book)) rules.set(name(row.book), { book: row.book, enabled: true, required: false, weight: DEFAULT_SHARP_WEIGHTS[name(row.book)] || 1 });
  }
  // The offered book is never used to manufacture its own reference price.
  if (!rules.get(name(quote.book))?.required) rules.delete(name(quote.book));
  return rules;
}

function commissionRate(quote) {
  const rate = valuePresent(quote.commissionPercent) ? number(quote.commissionPercent) / 100
    : valuePresent(quote.commission) ? number(quote.commission) : 0;
  return rate >= 0 && rate < 1 ? rate : NaN;
}

function effectiveDecimal(quote, boostPercent = 0) {
  const decimal = americanDecimal(quote.odds), boost = number(boostPercent), commission = commissionRate(quote);
  return Number.isFinite(decimal) && Number.isFinite(commission) && boost >= 0 ? 1 + (decimal - 1) * (1 + boost / 100) * (1 - commission) : NaN;
}

function sideNames(quote, rows) {
  const side = selection(quote);
  if (['over', 'under'].includes(side)) return ['over', 'under'];
  if (['yes', 'no'].includes(side)) return ['yes', 'no'];
  const count = valuePresent(quote.outcomes) ? number(quote.outcomes) : kind(quote) === 'three-way' || kind(quote) === '1x2' ? 3 : kind(quote) === 'future' ? NaN : 2;
  const supplied = Array.isArray(quote.outcomeSides) ? quote.outcomeSides.map(name) : null;
  const found = [...new Set(supplied || rows.map(selection))].filter(Boolean).sort();
  return Number.isInteger(count) && count >= 2 && found.length === count && found.includes(side) ? found : [];
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
  const vigPercent = (raw.reduce((total, probability) => total + probability, 0) - 1) * 100;
  // A sportsbook market with no margin isn't a priced two-sided market: the feed built one side from
  // the other (DraftKings and Fanatics milestone props, Oct 2026). Exchanges can legitimately sit at 0%.
  if (!records.some(record => record.exchange === true) && vigPercent <= MIN_BOOK_VIG_PERCENT) return null;
  const maximumVig = valuePresent(settings.maxVigPercent) ? number(settings.maxVigPercent) : Infinity;
  if (!Number.isFinite(vigPercent) || !(maximumVig >= 0) || vigPercent > maximumVig) return null;
  const fair = devig(raw, settings.devigMethod || 'multiplicative');
  if (!fair.length) return null;
  const exchange = records.some(record => record.exchange === true);
  const liquidityValues = records.map(record => number(record.liquidity));
  const liquidity = exchange && liquidityValues.every(value => value > 0) ? Math.min(...liquidityValues) : NaN;
  const unit = valuePresent(settings.liquidityWeightUnit) ? number(settings.liquidityWeightUnit) : 1000;
  if (settings.liquidityWeighting && exchange && (!(liquidity > 0) || !(unit > 0))) return null;
  // Exchange weight is proportional to the least liquid side, in $1,000 units.
  const weight = rule.weight * (settings.liquidityWeighting && exchange ? liquidity / unit : 1);
  return { book: rule.book, family: records[0].priceFamily || rule.book, probability: fair[sides.indexOf(selection(quote))], weight, configuredWeight: rule.weight,
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

// Available quotes grouped by market identity. Building identities is the costly
// part, so a batch computes them once instead of once per quote pair.
function marketIndex(allQuotes, settings, now, includeLine = true) {
  const index = new Map();
  for (const row of allQuotes) {
    if (!quoteAvailable(row, settings, now)) continue;
    const key = marketIdentity(row, includeLine);
    const rows = index.get(key);
    if (rows) rows.push(row); else index.set(key, [row]);
  }
  return index;
}

// `index` is an optional marketIndex built from the same quotes, settings and time.
export function consensusPrice(quote, allQuotes, settings = {}, index = null) {
  const failure = reason => ({ probability: NaN, fair: NaN, books: [], bookCount: 0, requiredMissing: [], method: settings.devigMethod || 'multiplicative', reason, estimated: false });
  const now = Number.isFinite(settings.now) ? settings.now : Date.now();
  if (!quoteAvailable(quote, settings, now) || !Array.isArray(allQuotes)) return failure('The offered quote is unavailable or invalid.');
  const identity = marketIdentity(quote), book = name(quote.book);
  const rows = index ? (index.get(identity) || []).filter(row => name(row.book) !== book)
    : allQuotes.filter(row => quoteAvailable(row, settings, now) && name(row.book) !== book && marketIdentity(row) === identity);
  const rules = referenceRules(quote, rows, settings);
  const books = [...rules.values()].map(rule => completeBook(quote, rows, rule, settings)).filter(Boolean);
  return combine(onePerFamily(books), rules, settings);
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

// `familyIndex` is an optional marketIndex built without lines.
export function projectProbability(target, allQuotes, settings = {}, familyIndex = null) {
  const now = Number.isFinite(settings.now) ? settings.now : Date.now();
  if (!Array.isArray(allQuotes) || !target || !['over', 'under'].includes(selection(target)) || !Number.isFinite(lineNumber(target))) return null;
  const family = marketIdentity(target, false), targetLine = lineNumber(target), book = name(target.book);
  const rows = familyIndex ? (familyIndex.get(family) || []).filter(row => name(row.book) !== book)
    : allQuotes.filter(row => quoteAvailable(row, settings, now) && name(row.book) !== book && marketIdentity(row, false) === family);
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

function passesFilters(quote, settings) {
  for (const field of ['league', 'market', 'side']) if (valuePresent(settings[field]) && name(settings[field]) !== 'all'
    && name(settings[field]) !== name(field === 'league' ? quote.league || quote.sport : quote[field])) return false;
  if (valuePresent(settings.gameStatus) && name(settings.gameStatus) !== 'all') {
    const wanted = name(settings.gameStatus), status = live(quote) ? 'live' : 'pregame';
    const state = quote.gameState && typeof quote.gameState === 'object' ? quote.gameState : {};
    const inPlay = state.inPlay === true || quote.inPlay === true;
    const stopped = state.stoppage === true || quote.stoppage === true || state.inPlay === false;
    if (!(wanted === status || wanted === 'in' && status === 'live' || wanted === 'pre' && status === 'pregame'
      || wanted === 'in-play' && live(quote) && inPlay && !stopped || wanted === 'stoppage' && live(quote) && stopped && !inPlay)) return false;
  }
  if (valuePresent(settings.region) && name(settings.region) !== 'all') {
    const regions = Array.isArray(quote.regions) ? quote.regions : [quote.region || quote.state];
    if (!regions.some(region => name(region) === name(settings.region))) return false;
  }
  for (const [field, pass] of [['minOdds', value => number(quote.odds) >= value], ['maxOdds', value => number(quote.odds) <= value], ['minLiquidity', value => value === 0 || value > 0 && number(quote.liquidity) >= value]]) {
    if (valuePresent(settings[field]) && (!Number.isFinite(number(settings[field])) || !pass(number(settings[field])))) return false;
  }
  return true;
}

export function computeAdvancedEv(allQuotes, settings = {}) {
  if (!Array.isArray(allQuotes)) return [];
  const now = Number.isFinite(settings.now) ? settings.now : Date.now(), effectiveSettings = { ...settings, now };
  const index = marketIndex(allQuotes, effectiveSettings, now);
  let familyIndex = null;
  return allQuotes.flatMap(quote => {
    if (!quoteAvailable(quote, effectiveSettings, now) || !passesFilters(quote, settings)) return [];
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
    for (const [field, pass] of [['minEvPercent', value => ev * 100 >= value], ['maxEvPercent', value => ev * 100 <= value]]) {
      if (valuePresent(settings[field]) && (!Number.isFinite(number(settings[field])) || !pass(number(settings[field])))) return [];
    }
    return [{ quote, fair, ev, edge, consensus, estimated: Boolean(projection), ...(projection ? { projection } : {}),
      conditionalOnNoPush: thresholdMarket(quote) && Number.isInteger(lineNumber(quote)) && !valuePresent(quote.pushProbability) && quote.pushRule !== 'no-push' }];
  }).sort((a, b) => b.ev - a.ev);
}

function stakeLimit(leg) {
  const supplied = ['maxStake', 'maxBet'].filter(field => valuePresent(leg[field])).map(field => number(leg[field]));
  if (leg.exchange && valuePresent(leg.liquidity)) supplied.push(number(leg.liquidity));
  if (supplied.some(value => !(value >= 0))) return NaN;
  return supplied.length ? Math.min(...supplied) : Infinity;
}

// boostPercent applies to the first leg. A leg's own boostPercent overrides it.
// Liquidity/maxStake are dollars of stake, not shares or payout. Missing caps are
// reported through limitsKnown; they never become a claim of actual availability.
export function constrainedArb(legs, totalStake, { boostPercent = 0, bonusIndex = -1 } = {}) {
  const requested = number(totalStake), boost = number(boostPercent);
  if (!Array.isArray(legs) || legs.length < 2 || !(requested > 0) || !(boost >= 0)
    || !Number.isInteger(bonusIndex) || bonusIndex < -1 || bonusIndex >= legs.length) return null;
  if (legs.some(leg => !leg || typeof leg !== 'object')) return null;
  const identifiable = legs.some(leg => leg.event || leg.eventId || leg.market || leg.marketId);
  if (identifiable && (legs.some(leg => !identifier(leg.eventId || leg.event) || !identifier(leg.marketId || leg.market) || !selection(leg))
    || new Set(legs.map(leg => marketIdentity(leg))).size !== 1 || new Set(legs.map(selection)).size !== legs.length)) return null;
  if (identifiable && sideNames(legs[0], legs).length !== legs.length) return null;
  const multipliers = legs.map((leg, index) => effectiveDecimal(leg, valuePresent(leg.boostPercent) ? number(leg.boostPercent) : index === 0 ? boost : 0) - (index === bonusIndex ? 1 : 0));
  const caps = legs.map(stakeLimit), minimums = legs.map(leg => valuePresent(leg.minStake) ? number(leg.minStake) : 0);
  if (multipliers.some(value => !(value > 0)) || caps.some(value => !(value > 0)) || minimums.some((value, index) => !(value >= 0) || value > caps[index])) return null;
  const inverseSum = multipliers.reduce((total, multiplier) => total + 1 / multiplier, 0);
  const fractions = multipliers.map(multiplier => 1 / multiplier / inverseSum);
  const maximumFeasibleTotal = Math.min(...caps.map((cap, index) => cap / fractions[index]));
  const minimumFeasibleTotal = Math.max(...minimums.map((minimum, index) => minimum / fractions[index]));
  const target = Math.min(requested, maximumFeasibleTotal);
  if (!(target >= minimumFeasibleTotal)) return null;
  const capCents = caps.map(cap => cap === Infinity ? Infinity : Math.floor(cap * 100 + 1e-8));
  const cents = fractions.map((fraction, index) => Math.min(capCents[index], Math.floor(target * fraction * 100 + 1e-8)));
  let remaining = Math.max(0, Math.floor(target * 100 + 1e-8) - cents.reduce((total, stake) => total + stake, 0));
  const worstProfit = allocations => {
    const cash = allocations.reduce((total, stake, index) => total + (index === bonusIndex ? 0 : stake), 0);
    return Math.min(...allocations.map((stake, index) => Math.round(stake * multipliers[index]) - cash));
  };
  // At most one residual cent per leg remains after flooring the ideal allocation.
  while (remaining > 0) {
    let best = -1, profit = -Infinity;
    for (let index = 0; index < cents.length; index++) if (cents[index] < capCents[index]) {
      const candidate = [...cents]; candidate[index]++;
      const result = worstProfit(candidate);
      if (result > profit) { profit = result; best = index; }
    }
    if (best < 0) break;
    cents[best]++; remaining--;
  }
  const stakes = cents.map(value => value / 100);
  if (stakes.some((stake, index) => !(stake > 0) || stake + 1e-9 < minimums[index])) return null;
  const actualTotal = roundMoney(stakes.reduce((total, stake) => total + stake, 0));
  const cashExposure = roundMoney(stakes.reduce((total, stake, index) => total + (index === bonusIndex ? 0 : stake), 0));
  const payouts = stakes.map((stake, index) => roundMoney(stake * multipliers[index]));
  const profits = payouts.map(payout => roundMoney(payout - cashExposure));
  const pushPossible = identifiable && legs.every(leg => thresholdMarket(leg) && Number.isInteger(lineNumber(leg)))
    && !legs.every(leg => number(leg.pushProbability) === 0 || leg.pushRule === 'no-push');
  const minWinProfit = Math.min(...profits), minProfit = pushPossible ? Math.min(0, minWinProfit) : minWinProfit;
  return { legs, stakes, payouts, profits, outcomeProfits: profits, minProfit, profit: minProfit,
    margin: cashExposure > 0 ? minProfit / cashExposure : NaN, actualTotal, totalStake: actualTotal, requestedTotal: requested,
    cashExposure, bonusStake: bonusIndex >= 0 ? stakes[bonusIndex] : 0, bonusIndex, maximumFeasibleTotal,
    minimumFeasibleTotal, limitsKnown: caps.every(Number.isFinite), limitBasis: 'Supplied stake caps only',
    limited: target + 1e-8 < requested, multipliers, pushPossible, pushProfit: pushPossible ? 0 : NaN, minWinProfit,
    winMargin: cashExposure > 0 ? minWinProfit / cashExposure : NaN };
}

// For totals, score is the observed total. For spreads, a numeric score is the
// winning margin of a.side; b must name the opposing side of the same market.
export function middleOutcomes(a, b, stakeA, stakeB, score) {
  const stakes = [number(stakeA), number(stakeB)], lineA = lineNumber(a), lineB = lineNumber(b), actual = number(score);
  if (!a || !b || stakes.some(stake => !(stake > 0)) || !Number.isFinite(actual) || !Number.isFinite(lineA) || !Number.isFinite(lineB)
    || marketIdentity(a, false) !== marketIdentity(b, false) || selection(a) === selection(b)) return null;
  const total = ['over', 'under'].includes(selection(a)) && ['over', 'under'].includes(selection(b));
  const spread = kind(a) === 'spread' && kind(b) === 'spread';
  if (!total && !spread) return null;
  const outcomes = [a, b].map((leg, index) => {
    const decimal = effectiveDecimal(leg, valuePresent(leg.boostPercent) ? number(leg.boostPercent) : 0);
    const difference = total ? (actual - lineNumber(leg)) * (selection(leg) === 'over' ? 1 : -1) : (index === 0 ? actual : -actual) + lineNumber(leg);
    const result = Math.abs(difference) < 1e-9 ? 'push' : difference > 0 ? 'win' : 'loss';
    const payout = result === 'push' ? stakes[index] : result === 'win' ? roundMoney(stakes[index] * decimal) : 0;
    return { result, stake: stakes[index], payout, profit: roundMoney(payout - stakes[index]) };
  });
  if (outcomes.some(outcome => !Number.isFinite(outcome.profit))) return null;
  const profit = roundMoney(outcomes.reduce((sum, outcome) => sum + outcome.profit, 0));
  return { a: outcomes[0], b: outcomes[1], outcomes, profit, totalProfit: profit, totalStake: roundMoney(stakes[0] + stakes[1]), score: actual };
}

export function advancedParlay(legs, { jointProbability, offeredDecimal } = {}) {
  if (!Array.isArray(legs) || legs.length < 2 || legs.some(leg => !leg || typeof leg !== 'object')) return null;
  const quotes = legs.map(leg => leg.quote || leg);
  if (quotes.some(quote => !identifier(quote.eventId || quote.event) || !identifier(quote.marketId || quote.market) || !selection(quote))) return null;
  const identities = quotes.map(quote => marketIdentity(quote) + '|' + selection(quote));
  if (new Set(identities).size !== legs.length) return null;
  const events = quotes.map(eventIdentity), correlationGroups = quotes.map(quote => identifier(quote.correlationGroup)).filter(Boolean);
  const correlated = new Set(events).size !== legs.length || quotes.some(quote => quote.correlated === true)
    || new Set(correlationGroups).size !== correlationGroups.length;
  const explicitProbability = valuePresent(jointProbability), explicitPrice = valuePresent(offeredDecimal);
  if (correlated && !(explicitProbability && explicitPrice)) return null;
  const probabilities = legs.map((leg, index) => number(leg.probability ?? leg.fair ?? quotes[index].probability));
  const marginalProbabilitiesValid = probabilities.every(probability => probability >= 0 && probability <= 1);
  const probability = explicitProbability ? number(jointProbability) : marginalProbabilitiesValid ? probabilities.reduce((product, value) => product * value, 1) : NaN;
  const prices = quotes.map(quote => americanDecimal(quote.odds));
  const payout = explicitPrice ? number(offeredDecimal) : prices.every(Number.isFinite) ? prices.reduce((product, value) => product * value, 1) : NaN;
  if (!(probability >= 0 && probability <= 1) || !(payout > 1) || !Number.isFinite(payout)) return null;
  if (explicitProbability && marginalProbabilitiesValid && (probability > Math.min(...probabilities) + 1e-10
    || probability < Math.max(0, probabilities.reduce((total, value) => total + value, 0) - (legs.length - 1)) - 1e-10)) return null;
  if (new Set(quotes.map(quote => name(quote.book)).filter(Boolean)).size > 1 && !explicitPrice) return null;
  return { probability, payout, decimal: payout, odds: payout >= 2 ? (payout - 1) * 100 : -100 / (payout - 1),
    ev: probability * payout - 1, correlated, probabilityBasis: explicitProbability ? 'Entered joint probability' : 'Independent-leg estimate',
    priceBasis: explicitPrice ? 'Entered combined price' : 'Product of entered leg prices', legs };
}

function comparableClv(bet) {
  const open = bet.quote || bet, close = bet.closeQuote || bet.closingQuote;
  if (open.live === true) return NaN;
  let closeOdds;
  if (close) {
    if (close.live === true || marketIdentity(open) !== marketIdentity(close) || selection(open) !== selection(close)) return NaN;
    if (!identifier(open.eventId || open.event) || !identifier(open.marketId || open.market) || !selection(open)) return NaN;
    if (valuePresent(open.startTime) && (!Number.isFinite(timestamp(open.startTime)) || !Number.isFinite(timestamp(close.ts)) || timestamp(close.ts) > timestamp(open.startTime))) return NaN;
    closeOdds = close.odds;
  } else {
    // Flat closing fields are accepted only with an explicit comparability mark,
    // or a separately recorded closing line exactly matching the booked line.
    if (bet.closeComparable !== true && !(own(bet, 'closeLine') && Number.isFinite(lineNumber(open)) && number(bet.closeLine) === lineNumber(open))) return NaN;
    if (thresholdMarket(open) && (!Number.isFinite(lineNumber(open)) || !own(bet, 'closeLine') || number(bet.closeLine) !== lineNumber(open))) return NaN;
    if (bet.closeLive === true || valuePresent(bet.closeSide) && name(bet.closeSide) !== selection(open)
      || valuePresent(bet.closeMarket) && name(bet.closeMarket) !== name(open.market)
      || valuePresent(bet.closeEventId) && identifier(bet.closeEventId) !== identifier(open.eventId)) return NaN;
    closeOdds = bet.closeOdds;
  }
  const booked = americanDecimal(bet.odds ?? open.odds), closing = americanDecimal(closeOdds);
  return Number.isFinite(booked) && Number.isFinite(closing) ? booked / closing - 1 : NaN;
}

function betResult(bet) {
  const status = name(bet.result || bet.status);
  return ({ won: 'win', lost: 'loss', pushed: 'push', voided: 'void', pending: 'open', active: 'live' })[status] || status;
}

function resultProfit(bet, result, stake) {
  if (result === 'push' || result === 'void') return 0;
  for (const field of ['netProfit', 'profit']) if (valuePresent(bet[field])) return number(bet[field]);
  for (const field of ['settledReturn', 'payout']) if (valuePresent(bet[field])) return number(bet[field]) >= 0 ? number(bet[field]) - stake : NaN;
  if (result === 'loss') return -stake;
  const price = effectiveDecimal(bet);
  return result === 'win' && Number.isFinite(price) ? stake * (price - 1) : NaN;
}

function dateKey(value) {
  if (typeof value !== 'string') return '';
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(key)) || new Date(key).toISOString().slice(0, 10) !== key) return '';
  return key;
}

const aggregate = label => ({ label, count: 0, settled: 0, wins: 0, losses: 0, pushes: 0, voids: 0, profit: 0, risked: 0, openExposure: 0, clvTotal: 0, clvCount: 0 });
function addAggregate(target, row) {
  target.count++;
  if (row.open) target.openExposure += row.stake;
  else {
    target.settled++; target.profit += row.profit; target.risked += row.risked;
    if (row.result === 'win') target.wins++;
    if (row.result === 'loss') target.losses++;
    if (row.result === 'push') target.pushes++;
    if (row.result === 'void') target.voids++;
  }
  if (Number.isFinite(row.clv)) { target.clvTotal += row.clv; target.clvCount++; }
}
function finishAggregate(value) {
  const { clvTotal, ...rest } = value;
  return { ...rest, profit: roundMoney(value.profit), risked: roundMoney(value.risked), openExposure: roundMoney(value.openExposure),
    roi: value.risked > 0 ? value.profit / value.risked : NaN, averageClv: value.clvCount ? clvTotal / value.clvCount : NaN };
}

export function performanceSummary(bets) {
  const total = aggregate('All bets'), dimensions = ['sport', 'league', 'market', 'book', 'tool', 'tag'];
  const groups = Object.fromEntries(dimensions.map(dimension => [dimension, new Map()]));
  const daily = new Map(), monthly = new Map(), validBets = [], seen = new Set();
  let excluded = 0;
  for (const bet of Array.isArray(bets) ? bets : []) {
    if (!bet || typeof bet !== 'object') { excluded++; continue; }
    if (valuePresent(bet.id)) { if (seen.has(String(bet.id))) { excluded++; continue; } seen.add(String(bet.id)); }
    const stake = number(bet.stake), result = betResult(bet), open = ['open', 'live', 'ungraded', 'pending'].includes(result);
    if (!(stake > 0) || !open && !['win', 'loss', 'push', 'void', 'settled', 'cashout'].includes(result)) { excluded++; continue; }
    const profit = open ? 0 : resultProfit(bet, result, stake);
    if (!Number.isFinite(profit) || result === 'win' && profit < 0 || result === 'loss' && profit > 0 || profit < -stake - 1e-8) { excluded++; continue; }
    const row = { bet, stake, result, open, profit, risked: open || ['push', 'void'].includes(result) ? 0 : stake, clv: comparableClv(bet) };
    validBets.push(row); addAggregate(total, row);
    for (const dimension of dimensions) {
      const tags = Array.isArray(bet.tags) ? bet.tags.map(tag => text(typeof tag === 'string' ? tag : tag?.name || tag?.label || tag?.id)).filter(Boolean) : text(bet.tag) ? [text(bet.tag)] : [];
      const labels = dimension === 'tag' ? tags.length ? [...new Set(tags)] : ['Untagged']
        : [text(dimension === 'tool' ? bet.tool || bet.sourceTool : dimension === 'league' ? bet.league || bet.sport : bet[dimension]) || 'Unspecified'];
      for (const label of labels) {
        if (!groups[dimension].has(label)) groups[dimension].set(label, aggregate(label));
        addAggregate(groups[dimension].get(label), row);
      }
    }
    if (!open) {
      const day = dateKey(bet.settledAt || bet.settledDate || bet.date || bet.placedAt);
      if (day) for (const [map, key] of [[daily, day], [monthly, day.slice(0, 7)]]) {
        if (!map.has(key)) map.set(key, aggregate(key));
        addAggregate(map.get(key), row);
      }
    }
  }
  const series = (map, keyName) => {
    let cumulativeProfit = 0;
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
      cumulativeProfit += value.profit;
      return { ...finishAggregate(value), [keyName]: key, cumulativeProfit: roundMoney(cumulativeProfit) };
    });
  };
  const summary = finishAggregate(total), days = series(daily, 'date'), months = series(monthly, 'month');
  return { ...summary, amountRisked: summary.risked, clv: summary.averageClv, excluded, validBets,
    daily: days, monthly: months, cumulative: days.map(day => ({ date: day.date, profit: day.cumulativeProfit })),
    groups: Object.fromEntries(dimensions.map(dimension => [dimension, [...groups[dimension].values()].map(finishAggregate).sort((a, b) => b.profit - a.profit)])) };
}
