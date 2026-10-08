// The one implementation of every betting formula on the site.
//
// Who may call what (test/odds-architecture.test.mjs enforces it):
//   - lib/odds/engine.mjs prices the odds feed with these on the server: implied probability, devig,
//     fair odds, EV, Kelly, arbitrage stakes, middle outcomes. The browser never prices feed data; it
//     displays what /api/odds returns.
//   - Browser calculators use the same functions on numbers a member types or chooses: calculator
//     pages, the arbitrage/promo/middle calculators, a parlay the member builds, DFS slips, and the
//     member's own bet records (profit, ROI, CLV).
// Percent settings use percentage points; returned EV, ROI and CLV use fractions.
import { valuePresent, number, name, identifier, timestamp, lineNumber, selection, kind, thresholdMarket, marketIdentity, eventIdentity, sideNames } from './market-identity.js';
/** @typedef {import('./market-identity.js').MarketQuote} MarketQuote */
/**
 * A member's tracked bet: a price record (its own fields, or `quote`) with its stake and result, its close
 * (`closeQuote`, or flat close fields) and `tags`.
 * @typedef {MarketQuote & { quote?: MarketQuote | null, closeQuote?: MarketQuote | null, closingQuote?: MarketQuote | null,
 *   closeOtherQuote?: MarketQuote | null, closingOtherQuote?: MarketQuote | null, tags?: Array<string | Record<string, unknown> | null> | null }} TrackedBet
 */

/** American odds → decimal odds; NaN when |odds| < 100 or not a number. -110 → 1.909, +150 → 2.5. @param {unknown} odds */
export const decimal = odds => {
  const n = Number(odds);
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return NaN;
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
};
/** American odds → the book's implied probability, vig included: -140 → 58.33%, +118 → 45.87%. @param {unknown} odds */
export const implied = odds => 1 / decimal(odds);
/**
 * Decimal odds → American odds, rounded (2.5 → 150, 1.5 → -200; `round: false` keeps fractions); NaN for decimal ≤ 1.
 * @param {unknown} value
 * @param {{ round?: boolean }} [options]
 */
export const decimalToAmerican = (value, { round = true } = {}) => {
  const d = Number(value);
  if (!(d > 1) || !Number.isFinite(d)) return NaN;
  const odds = d >= 2 ? (d - 1) * 100 : -100 / (d - 1);
  return round ? Math.round(odds) : odds;
};
/** A probability → the American odds it implies (no margin). 0.6 → -150, 0.4 → +150. @param {unknown} probability */
export const probabilityToAmerican = probability => {
  const p = Number(probability);
  if (!(p > 0 && p < 1)) return NaN;
  return Math.round(p > .5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
};
/** Profit per unit staked at American odds (decimal − 1). @param {unknown} odds */
export const profitPerUnit = odds => decimal(odds) - 1;
/** Decimal odds as a fraction with a denominator up to `maxDenominator` (2.5 → [3, 2]). @param {unknown} decimalOdds @param {number} [maxDenominator] */
export function fractionalOdds(decimalOdds, maxDenominator = 100) {
  const target = Number(decimalOdds) - 1;
  if (!(target > 0) || !Number.isFinite(target)) return null;
  let best = [Math.round(target), 1], error = Math.abs(target - best[0]);
  for (let denominator = 2; denominator <= maxDenominator && error > 1e-9; denominator++) {
    const numerator = Math.round(target * denominator), candidate = Math.abs(target - numerator / denominator);
    if (numerator > 0 && candidate < error - 1e-12) { best = [numerator, denominator]; error = candidate; }
  }
  /** @type {(a: number, b: number) => number} */
  const divisor = (a, b) => b ? divisor(b, a % b) : a, g = divisor(best[0], best[1]);
  return [best[0] / g, best[1] / g];
}
/** Expected return per unit staked at decimal odds: probability × decimal − 1. @param {number} probability @param {number} decimalOdds */
export const expectedValue = (probability, decimalOdds) => probability * decimalOdds - 1;
/** Expected return per unit staked at American odds. @param {number} probability @param {unknown} odds */
export const expectedReturn = (probability, odds) => expectedValue(probability, decimal(odds));
/** Full-Kelly fraction of bankroll for a win probability at decimal odds; 0 without an edge. @param {unknown} probability @param {unknown} decimalOdds */
export function kellyFraction(probability, decimalOdds) {
  const p = Number(probability), d = Number(decimalOdds);
  if (!(p >= 0 && p <= 1) || !(d > 1)) return NaN;
  return Math.max(0, Math.min(1, (p * d - 1) / (d - 1)));
}
/** @param {unknown} bankroll @param {unknown} multiplier @param {unknown} probability @param {unknown} odds */
export function fractionalKellyStake(bankroll, multiplier, probability, odds) {
  const capital = Number(bankroll), fraction = Number(multiplier);
  if (!(capital > 0) || !(fraction >= 0 && fraction <= 1)) return NaN;
  return capital * fraction * kellyFraction(probability, decimal(odds));
}

// Standard normal CDF (complementary error function, |error| < 1.2e-7) and its inverse (Acklam).
/** @param {number} x */
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** @param {number} x */
const normalCdf = x => 0.5 * erfc(-x / Math.SQRT2);
/** @param {number} p */
function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  /** @param {number} q */
  const tail = q => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Devig methods the website implements. Multiplicative is the default. */
export const DEVIG_METHODS = Object.freeze(['multiplicative', 'additive', 'power', 'probit', 'shin', 'worst']);
/** Version of this devig implementation, reported with every fair price it produces. */
export const DEVIG_VERSION = 'visualodds-devig/1';

/**
 * Implied probabilities of every outcome of one book's market → fair (no-vig) probabilities that sum
 * to 1. Methods differ in how the book's margin is taken back:
 *   multiplicative  p / Σp (each price keeps its share)
 *   additive        p − (Σp − 1) / n (the same amount from every outcome)
 *   power           p^k, with k chosen so Σp^k = 1 (more margin taken from long shots)
 *   probit          Φ(Φ⁻¹(p) − c), with c chosen so the outcomes sum to 1 (one shift on the normal scale)
 * Returns [] when the inputs or the method can't produce valid probabilities.
 * @param {unknown[]} probabilities
 * @param {string} [method]
 * @returns {number[]}
 */
export function devig(probabilities, method = 'multiplicative') {
  if (!Array.isArray(probabilities) || probabilities.length < 2) return [];
  /** @type {number[]} */
  const values = probabilities.map(number);
  if (values.some(value => !(value > 0 && value < 1))) return [];
  const sum = values.reduce((total, value) => total + value, 0);
  /** @type {number[]} */
  let fair;
  if (method === 'multiplicative') fair = values.map(value => value / sum);
  else if (method === 'additive') fair = values.map(value => value - (sum - 1) / values.length);
  else if (method === 'power') {
    let low = 0, high = 1;
    /** @param {number} power */
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
    /** @param {number} shift */
    const total = shift => scores.reduce((result, score) => result + normalCdf(score - shift), 0);
    let low = -10, high = 10;
    for (let iteration = 0; iteration < 100; iteration++) {
      const middle = (low + high) / 2;
      if (total(middle) > 1) low = middle; else high = middle;
    }
    fair = scores.map(score => normalCdf(score - (low + high) / 2));
  } else if (method === 'shin') {
    // Shin (1993): the margin protects the book from a share z of informed money, so longshots carry more of
    // it. z solves Σ p_i = 1 with p_i = (√(z² + 4(1 − z)·π_i²/Σπ) − z) / (2(1 − z)). With no margin (Σπ ≤ 1)
    // there is no informed share to remove and the prices only need scaling to 100%.
    /** @param {number} z */
    const shares = z => values.map(value => (Math.sqrt(z * z + 4 * (1 - z) * value * value / sum) - z) / (2 * (1 - z)));
    /** @param {number} z */
    const total = z => shares(z).reduce((result, value) => result + value, 0);
    if (sum <= 1) fair = values.map(value => value / sum);
    else {
      let low = 0, high = 1 - 1e-12;
      for (let iteration = 0; iteration < 100; iteration++) {
        const middle = (low + high) / 2;
        if (total(middle) > 1) low = middle; else high = middle;
      }
      fair = shares((low + high) / 2);
    }
  } else if (method === 'worst') {
    const perMethod = ['additive', 'multiplicative', 'power', 'probit'].map(inner => devig(values, inner));
    if (perMethod.some(fairs => fairs.length !== values.length)) return [];
    fair = values.map((value, index) => {
      const candidates = perMethod.map(fairs => Number(fairs[index])).filter(f => Number.isFinite(f) && f > 0);
      if (!candidates.length) return 0;
      return Math.min(...candidates);
    });
    const fairTotal = fair.reduce((total, value) => total + value, 0);
    if (fairTotal > 0) fair = fair.map(value => value / fairTotal);
    else return [];
  } else return [];
  return fair.every(value => value > 0 && value < 1) && Math.abs(fair.reduce((total, value) => total + value, 0) - 1) < 1e-8 ? fair : [];
}

/** The most conservative fair probability for a selection: the minimum across additive, multiplicative, power and probit. @param {unknown[]} probabilities @param {number} [selectionIndex] */
export function worstCaseProbability(probabilities, selectionIndex = 0) {
  const values = ['additive', 'multiplicative', 'power', 'probit']
    .map(method => devig(probabilities, method))
    .filter(fair => fair.length > selectionIndex && Number.isFinite(fair[selectionIndex]) && fair[selectionIndex] > 0)
    .map(fair => fair[selectionIndex]);
  return values.length ? Math.min(...values) : 0;
}

/**
 * Every outcome of one book's market (American odds) → implied probabilities, overround and fair
 * probabilities. -140 / +118: implied 58.33% / 45.87% (104.20%), multiplicative fair 56.00% / 44.00%.
 * @param {unknown[]} odds
 * @param {string} [method]
 */
export function fairFromAmerican(odds, method = 'multiplicative') {
  const impliedProbabilities = (Array.isArray(odds) ? odds : []).map(implied);
  const fair = impliedProbabilities.length > 1 && impliedProbabilities.every(Number.isFinite) ? devig(impliedProbabilities, method) : [];
  return { implied: impliedProbabilities, overround: impliedProbabilities.reduce((sum, value) => sum + value, 0), fair, method };
}

/** @param {number} value */
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;
/** Decimal odds after a profit boost in percent: 1 + (decimal − 1) × (1 + boost / 100). @param {number} decimalOdds @param {number} [boostPercent] */
export const boostDecimal = (decimalOdds, boostPercent = 0) => 1 + (decimalOdds - 1) * (1 + boostPercent / 100);
/** The stake on the other side that pays the same as `stake` at `decimalOdds` (equal-payout hedge). @param {number} stake @param {number} decimalOdds @param {number} otherDecimalOdds */
export const hedgeStake = (stake, decimalOdds, otherDecimalOdds) => stake * decimalOdds / otherDecimalOdds;
/** @param {MarketQuote} quote */
function commissionRate(quote) {
  const rate = valuePresent(quote.commissionPercent) ? number(quote.commissionPercent) / 100
    : valuePresent(quote.commission) ? number(quote.commission) : 0;
  return rate >= 0 && rate < 1 ? rate : NaN;
}
/** Decimal payout after a profit boost (%) and the price's commission. @param {MarketQuote} quote @param {unknown} [boostPercent] */
export function effectiveDecimal(quote, boostPercent = 0) {
  const price = decimal(quote.odds), boost = number(boostPercent), commission = commissionRate(quote);
  return Number.isFinite(price) && Number.isFinite(commission) && boost >= 0 ? 1 + (boostDecimal(price, boost) - 1) * (1 - commission) : NaN;
}

/** @param {MarketQuote} leg */
function stakeLimit(leg) {
  const supplied = ['maxStake', 'maxBet'].filter(field => valuePresent(leg[field])).map(field => number(leg[field]));
  if (leg.exchange && valuePresent(leg.liquidity)) supplied.push(number(leg.liquidity));
  if (supplied.some(value => !(value >= 0))) return NaN;
  return supplied.length ? Math.min(...supplied) : Infinity;
}

// boostPercent applies to the first leg. A leg's own boostPercent overrides it.
// Liquidity/maxStake are dollars of stake, not shares or payout. Missing caps are
// reported through limitsKnown; they never become a claim of actual availability.
/** @param {MarketQuote[]} legs @param {unknown} totalStake @param {{ boostPercent?: unknown, bonusIndex?: number }} [options] */
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
  /** @param {number[]} allocations */
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
    limited: target + 1e-8 < requested, multipliers, fractions, pushPossible, pushProfit: pushPossible ? 0 : NaN, minWinProfit,
    winMargin: cashExposure > 0 ? minWinProfit / cashExposure : NaN };
}

// For totals, score is the observed total. For spreads, a numeric score is the
// winning margin of a.side; b must name the opposing side of the same market.
/** @param {MarketQuote | null | undefined} a @param {MarketQuote | null | undefined} b @param {unknown} stakeA @param {unknown} stakeB @param {unknown} score */
export function middleOutcomes(a, b, stakeA, stakeB, score) {
  const stakes = [number(stakeA), number(stakeB)], lineA = lineNumber(a), lineB = lineNumber(b), actual = number(score);
  if (!a || !b || stakes.some(stake => !(stake > 0)) || !Number.isFinite(actual) || !Number.isFinite(lineA) || !Number.isFinite(lineB)
    || marketIdentity(a, false) !== marketIdentity(b, false) || selection(a) === selection(b)) return null;
  const total = ['over', 'under'].includes(selection(a)) && ['over', 'under'].includes(selection(b));
  const spread = kind(a) === 'spread' && kind(b) === 'spread';
  if (!total && !spread) return null;
  const outcomes = [a, b].map((leg, index) => {
    const price = effectiveDecimal(leg, valuePresent(leg.boostPercent) ? number(leg.boostPercent) : 0);
    const difference = total ? (actual - lineNumber(leg)) * (selection(leg) === 'over' ? 1 : -1) : (index === 0 ? actual : -actual) + lineNumber(leg);
    const result = Math.abs(difference) < 1e-9 ? 'push' : difference > 0 ? 'win' : 'loss';
    const payout = result === 'push' ? stakes[index] : result === 'win' ? roundMoney(stakes[index] * price) : 0;
    return { result, stake: stakes[index], payout, profit: roundMoney(payout - stakes[index]) };
  });
  if (outcomes.some(outcome => !Number.isFinite(outcome.profit))) return null;
  const profit = roundMoney(outcomes.reduce((sum, outcome) => sum + outcome.profit, 0));
  return { a: outcomes[0], b: outcomes[1], outcomes, profit, totalProfit: profit, totalStake: roundMoney(stakes[0] + stakes[1]), score: actual };
}

/** @param {{ stake: unknown, promoOdds: unknown, hedgeOdds: unknown, kind?: string, boost?: unknown }} promo */
export function promoConversion({ stake, promoOdds, hedgeOdds, kind: promotion = 'bonus', boost = 0 }) {
  const d1 = decimal(promoOdds), d2 = decimal(hedgeOdds), amount = Number(stake), factor = 1 + Number(boost) / 100;
  // A boost adds to the profit; a negative one isn't a promotion.
  if (!(amount > 0) || !Number.isFinite(d1) || !Number.isFinite(d2) || !(Number(boost) >= 0)) return null;
  const payout = promotion === 'bonus' ? amount * (d1 - 1) * factor : amount * (1 + (d1 - 1) * factor);
  const hedge = payout / d2;
  const ifPromoWins = promotion === 'bonus' ? payout - hedge : payout - amount - hedge;
  const ifHedgeWins = hedge * (d2 - 1) - (promotion === 'bonus' ? 0 : amount);
  return { hedge, ifPromoWins, ifHedgeWins, conversion: promotion === 'bonus' ? ifPromoWins / amount : NaN };
}

/** A parlay a member builds: product of the legs' given probabilities and prices. @param {Array<{ event?: unknown, odds?: unknown, probability?: unknown }>} legs */
export function parlay(legs) {
  if (legs.length < 2 || new Set(legs.map(x => x.event)).size !== legs.length) return null;
  const probability = legs.reduce((a, x) => a * Number(x.probability), 1);
  const payout = legs.reduce((a, x) => a * decimal(x.odds), 1);
  return { probability, payout, ev: probability * payout - 1 };
}

/** @param {Array<MarketQuote & { quote?: MarketQuote | null }>} legs @param {{ jointProbability?: unknown, offeredDecimal?: unknown }} [options] */
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
  const prices = quotes.map(quote => decimal(quote.odds));
  const payout = explicitPrice ? number(offeredDecimal) : prices.every(Number.isFinite) ? prices.reduce((product, value) => product * value, 1) : NaN;
  if (!(probability >= 0 && probability <= 1) || !(payout > 1) || !Number.isFinite(payout)) return null;
  if (explicitProbability && marginalProbabilitiesValid && (probability > Math.min(...probabilities) + 1e-10
    || probability < Math.max(0, probabilities.reduce((total, value) => total + value, 0) - (legs.length - 1)) - 1e-10)) return null;
  if (new Set(quotes.map(quote => name(quote.book)).filter(Boolean)).size > 1 && !explicitPrice) return null;
  return { probability, payout, decimal: payout, odds: payout >= 2 ? (payout - 1) * 100 : -100 / (payout - 1),
    ev: probability * payout - 1, correlated, probabilityBasis: explicitProbability ? 'Entered joint probability' : 'Independent-leg estimate',
    priceBasis: explicitPrice ? 'Entered combined price' : 'Product of entered leg prices', legs };
}

/** Distribution of how many of independent picks hit: [P(0 hits), P(1 hit), …]. @param {number[]} probabilities */
export function hitDistribution(probabilities) {
  let distribution = [1];
  for (const p of probabilities) {
    if (!(p >= 0 && p <= 1)) return [];
    const next = Array(distribution.length + 1).fill(0);
    distribution.forEach((value, hits) => { next[hits] += value * (1 - p); next[hits + 1] += value * p; });
    distribution = next;
  }
  return distribution;
}

// A probability that is missing (null, '' or undefined) is unknown, not 0%.
/** @param {unknown} value */
export const knownProbability = value => value !== null && value !== undefined && value !== '' && Number(value) >= 0 && Number(value) <= 1;
/** Expected return multiplier of a hit-count distribution against a payout table (multiplier by number of hits). @param {number[]} distribution @param {unknown[]} paytable */
export const expectedPayout = (distribution, paytable) => distribution.reduce((sum, probability, hits) => sum + probability * Number(paytable[hits] || 0), 0);
/**
 * A DFS slip a member builds: expected payout from its picks' probabilities and the app's payout table (multiplier by hits).
 * @param {Array<{ probability?: unknown }>} picks
 * @param {unknown[]} paytable
 * @param {number} [stake]
 */
export function fantasySlip(picks, paytable, stake = 1) {
  if (!picks.length || !(stake > 0) || !picks.every(p => knownProbability(p.probability))) return null;
  const dist = hitDistribution(picks.map(p => Number(p.probability)));
  if (!dist.length) return null;
  const payout = expectedPayout(dist, paytable);
  return { dist, payout, ev: payout - 1, expectedProfit: stake * (payout - 1) };
}
/**
 * The per-pick hit chance at which a DFS payout table breaks even (every pick equally likely). A table is
 * the multiplier by number of hits ([0, 0, 3] for a 2-pick 3x); null when it can't break even: fewer than two
 * picks, a table that pays less for more hits, or one that returns the stake or more with no hits.
 * @param {unknown[] | null | undefined} rules
 */
export function breakEven(rules) {
  if (!Array.isArray(rules) || rules.length < 3 || Number(rules.at(-1)) <= 1 || !(Number(rules[0]) < 1)
    || rules.some((value, index) => !(Number(value) >= 0) || index > 0 && Number(value) < Number(rules[index - 1]))) return null;
  let low = 0, high = 1;
  for (let i = 0; i < 48; i++) {
    const probability = (low + high) / 2;
    const result = /** @type {NonNullable<ReturnType<typeof fantasySlip>>} */ (fantasySlip(Array.from({ length: rules.length - 1 }, () => ({ probability })), rules));
    if (result.payout < 1) low = probability; else high = probability;
  }
  return (low + high) / 2;
}

/** Price CLV of open and close American odds: open decimal / close decimal − 1. @param {unknown} openOdds @param {unknown} closeOdds */
export function closingLineValue(openOdds, closeOdds) {
  const open = decimal(openOdds), close = decimal(closeOdds);
  return Number.isFinite(open) && Number.isFinite(close) ? open / close - 1 : NaN;
}
/**
 * Price CLV, vig included: booked decimal / closing decimal − 1 for the same side (decimal odds in, fraction out).
 * @param {unknown} bookedDecimal
 * @param {unknown} closingDecimal
 */
export function priceClv(bookedDecimal, closingDecimal) {
  const booked = number(bookedDecimal), closing = number(closingDecimal);
  return booked > 1 && closing > 1 ? booked / closing - 1 : NaN;
}
/**
 * No-vig CLV: the booked payout against the closing market's fair probability for the same side,
 * bookedDecimal × devig([implied(close), implied(other close)…], method)[0] − 1. Needs the closing price
 * of every other outcome (one value for a two-way market); NaN otherwise.
 * @param {unknown} bookedDecimal
 * @param {unknown} closingDecimal
 * @param {unknown} otherClosingDecimals one decimal price, or an array of them
 * @param {string} [method]
 */
export function noVigClv(bookedDecimal, closingDecimal, otherClosingDecimals, method = 'multiplicative') {
  const booked = number(bookedDecimal), others = (Array.isArray(otherClosingDecimals) ? otherClosingDecimals : [otherClosingDecimals]).map(number);
  if (!(booked > 1) || !others.length || others.some(value => !(value > 1)) || !(number(closingDecimal) > 1)) return NaN;
  const fair = devig([1 / number(closingDecimal), ...others.map(value => 1 / value)], method);
  return fair.length ? booked * fair[0] - 1 : NaN;
}

// A closing record counts only when it is the booked selection's own pregame close.
/** @param {MarketQuote} open @param {MarketQuote | null | undefined} close @param {string} [side] */
function sameClose(open, close, side = selection(open)) {
  if (!close || close.live === true || marketIdentity(open) !== marketIdentity(close) || selection(close) !== side) return false;
  if (!identifier(open.eventId || open.event) || !identifier(open.marketId || open.market) || !selection(open)) return false;
  return !(valuePresent(open.startTime) && (!Number.isFinite(timestamp(open.startTime)) || !Number.isFinite(timestamp(close.ts)) || timestamp(close.ts) > timestamp(open.startTime)));
}
/** @param {unknown} object @param {string} key */
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
/**
 * Comparable CLV of a tracked bet as { price, noVig } fractions (NaN when not comparable). Price CLV is
 * vig included; no-vig CLV also needs the other side's close (closeOtherQuote, or flat closeOtherOdds).
 * @param {TrackedBet | null | undefined} bet
 * @param {string} [method]
 */
export function comparableClv(bet, method = 'multiplicative') {
  const none = { price: NaN, noVig: NaN };
  if (!bet || typeof bet !== 'object') return none;
  const open = bet.quote || bet, close = bet.closeQuote || bet.closingQuote;
  if (open.live === true) return none;
  let closeOdds, otherOdds;
  if (close) {
    if (!sameClose(open, close)) return none;
    closeOdds = close.odds;
    const other = bet.closeOtherQuote || bet.closingOtherQuote;
    if (other && selection(other) !== selection(open) && sameClose(open, other, selection(other))) otherOdds = other.odds;
  } else {
    // Flat closing fields are accepted only with an explicit comparability mark,
    // or a separately recorded closing line exactly matching the booked line.
    if (bet.closeComparable !== true && !(own(bet, 'closeLine') && Number.isFinite(lineNumber(open)) && number(bet.closeLine) === lineNumber(open))) return none;
    if (thresholdMarket(open) && (!Number.isFinite(lineNumber(open)) || !own(bet, 'closeLine') || number(bet.closeLine) !== lineNumber(open))) return none;
    if (bet.closeLive === true || valuePresent(bet.closeSide) && name(bet.closeSide) !== selection(open)
      || valuePresent(bet.closeMarket) && name(bet.closeMarket) !== name(open.market)
      || valuePresent(bet.closeEventId) && identifier(bet.closeEventId) !== identifier(open.eventId)) return none;
    closeOdds = bet.closeOdds;
    otherOdds = bet.closeOtherOdds;
  }
  const booked = decimal(bet.odds ?? open.odds), closing = decimal(closeOdds);
  return { price: priceClv(booked, closing), noVig: valuePresent(otherOdds) ? noVigClv(booked, closing, decimal(otherOdds), method) : NaN };
}

/** Profit of a graded bet at American odds (win, loss, push or void). @param {{ stake: unknown, odds: unknown, result: string }} bet */
export function gradedBet(bet) {
  const stake = Number(bet.stake), d = decimal(bet.odds);
  if (!(stake > 0) || !Number.isFinite(d)) return NaN;
  return bet.result === 'win' ? stake * (d - 1) : bet.result === 'loss' ? -stake : ['push', 'void'].includes(bet.result) ? 0 : NaN;
}

/** @param {number[][]} pairs */
export function pearson(pairs) {
  if (pairs.length < 3) return NaN;
  const mx = pairs.reduce((a, x) => a + x[0], 0) / pairs.length;
  const my = pairs.reduce((a, x) => a + x[1], 0) / pairs.length;
  const numerator = pairs.reduce((a, x) => a + (x[0] - mx) * (x[1] - my), 0);
  const sx = pairs.reduce((a, x) => a + (x[0] - mx) ** 2, 0);
  const sy = pairs.reduce((a, x) => a + (x[1] - my) ** 2, 0);
  return sx && sy ? numerator / Math.sqrt(sx * sy) : NaN;
}

/** @param {TrackedBet} bet */
function betResult(bet) {
  const status = name(bet.result || bet.status);
  return ({ won: 'win', lost: 'loss', pushed: 'push', voided: 'void', pending: 'open', active: 'live' })[status] || status;
}
/** @param {TrackedBet} bet @param {string} result @param {number} stake */
function resultProfit(bet, result, stake) {
  if (result === 'push' || result === 'void') return 0;
  for (const field of ['netProfit', 'profit']) if (valuePresent(bet[field])) return number(bet[field]);
  for (const field of ['settledReturn', 'payout']) if (valuePresent(bet[field])) return number(bet[field]) >= 0 ? number(bet[field]) - stake : NaN;
  if (result === 'loss') return -stake;
  const price = effectiveDecimal(bet);
  return result === 'win' && Number.isFinite(price) ? stake * (price - 1) : NaN;
}
/** @param {unknown} value */
function dateKey(value) {
  if (typeof value !== 'string') return '';
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(key)) || new Date(key).toISOString().slice(0, 10) !== key) return '';
  return key;
}
/** @param {string} label */
const aggregate = label => ({ label, count: 0, settled: 0, wins: 0, losses: 0, pushes: 0, voids: 0, profit: 0, risked: 0, openExposure: 0, clvTotal: 0, clvCount: 0, noVigClvTotal: 0, noVigClvCount: 0 });
/** @typedef {ReturnType<typeof aggregate>} Aggregate */
/**
 * @param {Aggregate} target
 * @param {{ open: boolean, stake: number, profit: number, risked: number, result: string, clv: number, noVigClv: number }} row
 */
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
  if (Number.isFinite(row.noVigClv)) { target.noVigClvTotal += row.noVigClv; target.noVigClvCount++; }
}
// averageClv is price CLV (vig included); averageNoVigClv covers only bets with the other side's close.
/** @param {Aggregate} value */
function finishAggregate(value) {
  const { clvTotal, noVigClvTotal, ...rest } = value, averageClv = value.clvCount ? clvTotal / value.clvCount : NaN;
  return { ...rest, profit: roundMoney(value.profit), risked: roundMoney(value.risked), openExposure: roundMoney(value.openExposure),
    roi: value.risked > 0 ? value.profit / value.risked : NaN, averageClv, averagePriceClv: averageClv,
    averageNoVigClv: value.noVigClvCount ? noVigClvTotal / value.noVigClvCount : NaN };
}

/**
 * A member's recorded bets: profit, ROI and CLV overall, by dimension and by day/month. settings.devigMethod sets the no-vig CLV method.
 * @param {Array<TrackedBet | null | undefined> | null | undefined} bets
 * @param {{ devigMethod?: string | null } | null} [settings]
 */
export function performanceSummary(bets, settings = {}) {
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
    const clv = comparableClv(bet, settings?.devigMethod || 'multiplicative');
    const row = { bet, stake, result, open, profit, risked: open || ['push', 'void'].includes(result) ? 0 : stake, clv: clv.price, priceClv: clv.price, noVigClv: clv.noVig };
    validBets.push(row); addAggregate(total, row);
    for (const dimension of dimensions) {
      const tags = Array.isArray(bet.tags) ? bet.tags.map(tag => String(typeof tag === 'string' ? tag : tag?.name || tag?.label || tag?.id || '').trim()).filter(Boolean) : typeof bet.tag === 'string' && bet.tag.trim() ? [bet.tag.trim()] : [];
      const labels = dimension === 'tag' ? tags.length ? [...new Set(tags)] : ['Untagged']
        : [String((dimension === 'tool' ? bet.tool || bet.sourceTool : dimension === 'league' ? bet.league || bet.sport : bet[dimension]) ?? '').trim() || 'Unspecified'];
      for (const label of labels) {
        if (!groups[dimension].has(label)) groups[dimension].set(label, aggregate(label));
        addAggregate(groups[dimension].get(label), row);
      }
    }
    if (!open) {
      const day = dateKey(bet.settledAt || bet.settledDate || bet.date || bet.placedAt);
      if (day) for (const [map, key] of /** @type {Array<[Map<string, Aggregate>, string]>} */ ([[daily, day], [monthly, day.slice(0, 7)]])) {
        if (!map.has(key)) map.set(key, aggregate(key));
        addAggregate(/** @type {Aggregate} */ (map.get(key)), row);
      }
    }
  }
  /**
   * @param {Map<string, Aggregate>} map
   * @param {string} keyName
   * @returns {Array<ReturnType<typeof finishAggregate> & { cumulativeProfit: number, [key: string]: unknown }>}
   */
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
