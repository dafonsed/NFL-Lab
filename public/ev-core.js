// Pure market math. Quote adapters can replace manual/example records without changing the workbench.
import {marketIdentity as preciseMarketIdentity,quoteAvailable,devig,evCapFor,computeAdvancedEv} from './ev-advanced-math.js';
export const decimal = odds => {
  const n = Number(odds);
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return NaN;
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
};
export const implied = odds => 1 / decimal(odds);
export const expectedReturn = (probability, odds) => probability * decimal(odds) - 1;
export function fractionalKellyStake(bankroll, multiplier, probability, odds) {
  const payout = decimal(odds), capital = Number(bankroll), fraction = Number(multiplier), p = Number(probability);
  if (!(capital > 0) || !(fraction >= 0 && fraction <= 1) || !(p > 0 && p < 1) || !Number.isFinite(payout)) return NaN;
  return capital * fraction * Math.max(0, Math.min(1, (p * payout - 1) / (payout - 1)));
}
export const money = n => Number.isFinite(n) ? (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2) : '—';
export const percent = n => Number.isFinite(n) ? (100 * n).toFixed(1) + '%' : '—';
export const signed = n => Number.isFinite(n) ? (n > 0 ? '+' : '') + (100 * n).toFixed(1) + '%' : '—';
export const oddsLabel = odds => Number(odds) > 0 ? '+' + Number(odds) : String(Number(odds));
export const probabilityToAmerican = probability => {
  const p = Number(probability);
  if (!(p > 0 && p < 1)) return NaN;
  return Math.round(p > .5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
};
export const marketKey = q => preciseMarketIdentity(q,true);
export const familyKey = q => preciseMarketIdentity(q,false);
export const validQuote = q => q && q.event && q.market && q.side && q.book && Number.isFinite(decimal(q.odds));
export const fresh = (q, now = Date.now()) => quoteAvailable(q,{},now);

export function groups(quotes, mode = null) {
  const map = new Map();
  for (const q of quotes.filter(validQuote)) {
    if (mode !== null && Boolean(q.live) !== mode) continue;
    const key = marketKey(q);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(q);
  }
  return [...map.values()];
}

export function opposingSides(rows) {
  const sides = [...new Set(rows.map(q => q.side))];
  if (rows.some(q => q.type === 'three-way')) return [];
  if (rows.some(q => q.type === 'future') && !sides.every(side => ['yes','no'].includes(side.toLowerCase())) && !rows.every(q => Number(q.outcomes) === 2)) return [];
  return sides.length === 2 ? sides : [];
}

// Fair probability of one selection: each other book's complete market is devigged with `method`
// (see devig in ev-advanced-math.js), then the books are averaged.
export function fairProbability(quote, rows, method = 'multiplicative') {
  const sides = [...new Set(rows.map(q => q.side))];
  const count = Number(quote.outcomes) || (quote.type === 'three-way' ? 3 : quote.type === 'future' && !sides.every(side => ['yes','no'].includes(side.toLowerCase())) ? NaN : 2);
  if (!Number.isInteger(count) || count < 2 || sides.length !== count || !sides.includes(quote.side)) return NaN;
  const books = [...new Set(rows.map(q => q.book))].filter(book => book !== quote.book);
  const estimates = [];
  for (const book of books) {
    const complete = sides.map(side => rows.filter(q => q.book === book && q.side === side && fresh(q)).sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts))[0]);
    if (!complete.every(Boolean)) continue;
    // No margin, no real two-sided market (one side built from the other): not a fair-price source.
    if (!complete.some(q => q.exchange) && complete.reduce((sum, q) => sum + implied(q.odds), 0) <= 1.005) continue;
    const fair = devig(complete.map(q => implied(q.odds)), method);
    if (fair.length) estimates.push(fair[sides.indexOf(quote.side)]);
  }
  return estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : NaN;
}

export function evRows(quotes, mode, method = 'multiplicative') {
  return groups(quotes, mode).flatMap(rows => rows.filter(q => fresh(q)).map(q => {
    const fair = fairProbability(q, rows, method);
    return { quote: q, fair, ev: expectedReturn(fair, q.odds), edge: fair - implied(q.odds) };
  })).filter(row => Number.isFinite(row.ev)).sort((a, b) => b.ev - a.ev);
}

// Books that copy one platform's prices (BetRivers, Desert Diamond, Bally Bet on Kambi) are one book.
export const priceFamily = q => q.priceFamily || q.book;
const START_GAP_MS = 3 * 3_600_000;
/** False when both legs carry start times more than 3 hours apart: the feed filed two games under one name. */
export const sameGame = (a, b) => { const x = Date.parse(a.startTime), y = Date.parse(b.startTime); return !(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) > START_GAP_MS); };
/**
 * A price only counts in a cross-book comparison when its own book prices every side of the same
 * market at a real margin: 100-125% implied. One-sided listings can't be checked, and a book whose own
 * sides add up to under 100% (Novig pairs at 99%, which can't both be takeable) or far over is quoting
 * something else:
 * a mixed ladder, a mislabeled side, a yes/no prop or another game (Oct 2026: every arbitrage the
 * feed produced came from such listings).
 */
export function ownBookConsistent(q, rows, available = fresh) {
  const sides = opposingSides(rows);
  if (!sides.includes(q.side)) return false;
  const own = sides.map(side => rows.filter(x => x.book === q.book && x.side === side && available(x)).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0]);
  if (!own.every(Boolean)) return false;
  const sum = own.reduce((total, x) => total + implied(x.odds), 0);
  return sum >= 1 && sum <= 1.25;
}

/** Market rows by market key, for ownBookConsistent and plausibleEv lookups. */
export const marketRowsOf = quotes => new Map(groups(quotes).map(rows => [marketKey(rows[0]), rows]));
/**
 * Whether a priced row can be shown as +EV: within the sanity cap (evCapFor), and, for a game line, from
 * a book that prices both sides (one-sided Fanatics ladder prices were the feed's biggest "edges").
 * Props may be one-sided milestones.
 */
export function plausibleEv(row, marketRows, settings = {}, available = fresh) {
  if (!(row.ev <= evCapFor(row, settings))) return false;
  return !['moneyline', 'spread', 'total'].includes(row.quote.type) || ownBookConsistent(row.quote, marketRows.get(marketKey(row.quote)) || [], available);
}

export function bestSides(rows, available = fresh) {
  const sides = opposingSides(rows);
  if (!sides.length) return [];
  return sides.map(side => rows.filter(q => q.side === side && available(q) && ownBookConsistent(q, rows, available)).sort((a, b) => decimal(b.odds) - decimal(a.odds))[0]).filter(Boolean);
}

export function holdRows(quotes, mode) {
  return groups(quotes, mode).map(rows => {
    const best = bestSides(rows);
    if (best.length !== 2) return null;
    return { rows, best, hold: implied(best[0].odds) + implied(best[1].odds) - 1 };
  }).filter(Boolean).sort((a, b) => a.hold - b.hold);
}

export function arbitrage(best, bankroll) {
  if (best.length !== 2 || !(bankroll > 0)) return null;
  const sum = implied(best[0].odds) + implied(best[1].odds);
  const stakes = best.map(q => bankroll * implied(q.odds) / sum);
  return { margin: 1 / sum - 1, stakes, payout: bankroll / sum, profit: bankroll * (1 / sum - 1) };
}

/**
 * Markets where two books' opposite sides add up to under 100%: { rows, best, pairs } with every such
 * pair, best first. Each leg must pass ownBookConsistent, come from a different price family and the
 * same game; mirrored books quoting the same pair are listed once.
 */
export function arbitrageRows(quotes, mode, settings = {}) {
  const available = q => quoteAvailable(q, settings), total = pair => implied(pair[0].odds) + implied(pair[1].odds);
  return groups(quotes, mode).map(rows => {
    const sides = opposingSides(rows);
    if (!sides.length) return null;
    const usable = rows.filter(q => available(q) && ownBookConsistent(q, rows, available));
    const seen = new Set(), pairs = [];
    for (const a of usable.filter(q => q.side === sides[0])) for (const b of usable.filter(q => q.side === sides[1])) {
      if (priceFamily(a) === priceFamily(b) || !sameGame(a, b) || total([a, b]) >= 1) continue;
      const key = JSON.stringify([priceFamily(a), Number(a.odds), priceFamily(b), Number(b.odds)]);
      if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); }
    }
    pairs.sort((a, b) => total(a) - total(b));
    return pairs.length ? { rows, best: pairs[0], pairs } : null;
  }).filter(Boolean).sort((a, b) => total(a.best) - total(b.best));
}

export function middleRows(quotes, mode, settings = {}) {
  const available = q => quoteAvailable(q, settings), candidates = quotes.filter(validQuote).filter(q => ['total','spread','alternate'].includes(q.type) && Boolean(q.live) === mode && available(q));
  // Each leg's own book must price both sides of its line (see ownBookConsistent).
  const markets = new Map();
  for (const q of candidates) { const key = marketKey(q); if (!markets.has(key)) markets.set(key, []); markets.get(key).push(q); }
  const families = new Map();
  for (const q of candidates.filter(q => ownBookConsistent(q, markets.get(marketKey(q)), available))) {
    const key = familyKey(q);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(q);
  }
  const found = [];
  // Scores are whole numbers, so a window like 45 to 45.5 has no score where both bets win.
  const reachable = (low, high) => Math.floor(low) + 1 < high;
  for (const rows of families.values()) {
    const overs = rows.filter(q => q.side.toLowerCase() === 'over');
    const unders = rows.filter(q => q.side.toLowerCase() === 'under');
    for (const over of overs) for (const under of unders) {
      if (Number(over.line) >= Number(under.line) || priceFamily(over) === priceFamily(under) || !sameGame(over, under) || !reachable(Number(over.line), Number(under.line))) continue;
      found.push({ over, under, kind:'total', window:`Total ${over.line} to ${under.line}`, width: Number(under.line) - Number(over.line), cost: 1 - 1 / (implied(over.odds) + implied(under.odds)) });
    }
    const spreadSides = [...new Set(rows.filter(q => q.type === 'spread' || q.type === 'alternate' && !['over','under'].includes(q.side.toLowerCase())).map(q => q.side))];
    if (spreadSides.length !== 2) continue;
    for (const over of rows.filter(q => q.side === spreadSides[0])) for (const under of rows.filter(q => q.side === spreadSides[1])) {
      const low = -Number(over.line), high = Number(under.line);
      if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high || priceFamily(over) === priceFamily(under) || !sameGame(over, under) || !reachable(low, high)) continue;
      found.push({ over, under, kind:'spread', window:`${over.selection || spreadSides[0]} margin ${low} to ${high}`, width:high-low, cost:1-1/(implied(over.odds)+implied(under.odds)) });
    }
  }
  return found.sort((a, b) => b.width - a.width || a.cost - b.cost);
}

export function promoConversion({ stake, promoOdds, hedgeOdds, kind = 'bonus', boost = 0 }) {
  const d1 = decimal(promoOdds), d2 = decimal(hedgeOdds), amount = Number(stake), factor = 1 + Number(boost) / 100;
  // A boost adds to the profit; a negative one isn't a promotion.
  if (!(amount > 0) || !Number.isFinite(d1) || !Number.isFinite(d2) || !(Number(boost) >= 0)) return null;
  const payout = kind === 'bonus' ? amount * (d1 - 1) * factor : amount * (1 + (d1 - 1) * factor);
  const hedge = payout / d2;
  const ifPromoWins = kind === 'bonus' ? payout - hedge : payout - amount - hedge;
  const ifHedgeWins = hedge * (d2 - 1) - (kind === 'bonus' ? 0 : amount);
  return { hedge, ifPromoWins, ifHedgeWins, conversion: kind === 'bonus' ? ifPromoWins / amount : NaN };
}

export function parlay(legs) {
  if (legs.length < 2 || new Set(legs.map(x => x.event)).size !== legs.length) return null;
  const probability = legs.reduce((a, x) => a * Number(x.probability), 1);
  const payout = legs.reduce((a, x) => a * decimal(x.odds), 1);
  return { probability, payout, ev: probability * payout - 1 };
}

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
const knownProbability = value => value !== null && value !== undefined && value !== '' && Number(value) >= 0 && Number(value) <= 1;
export function fantasySlip(picks, paytable, stake = 1) {
  if (!picks.length || !(stake > 0) || !picks.every(p => knownProbability(p.probability))) return null;
  const dist = hitDistribution(picks.map(p => Number(p.probability)));
  if (!dist.length) return null;
  const payout = dist.reduce((sum, probability, hits) => sum + probability * Number(paytable[hits] || 0), 0);
  return { dist, payout, ev: payout - 1, expectedProfit: stake * (payout - 1) };
}

export function closingLineValue(openOdds, closeOdds) {
  const open = decimal(openOdds), close = decimal(closeOdds);
  return Number.isFinite(open) && Number.isFinite(close) ? open / close - 1 : NaN;
}

export function gradedBet(bet) {
  const stake = Number(bet.stake), d = decimal(bet.odds);
  if (!(stake > 0) || !Number.isFinite(d)) return NaN;
  return bet.result === 'win' ? stake * (d - 1) : bet.result === 'loss' ? -stake : ['push', 'void'].includes(bet.result) ? 0 : NaN;
}

export function pearson(pairs) {
  if (pairs.length < 3) return NaN;
  const mx = pairs.reduce((a, x) => a + x[0], 0) / pairs.length;
  const my = pairs.reduce((a, x) => a + x[1], 0) / pairs.length;
  const numerator = pairs.reduce((a, x) => a + (x[0] - mx) * (x[1] - my), 0);
  const sx = pairs.reduce((a, x) => a + (x[0] - mx) ** 2, 0);
  const sy = pairs.reduce((a, x) => a + (x[1] - my) ** 2, 0);
  return sx && sy ? numerator / Math.sqrt(sx * sy) : NaN;
}

// Exchange prices with liquidity beside the best sportsbook price on the other side. Two-way markets only
// (a three-way draw isn't "the other side"), and only sides the feed confirmed: ProphetX's unnamed
// "home" prices were the other player's.
export function sharpMatches(quotes, minimum = 1000) {
  const confirmed = q => q.sideVerified !== false;
  return groups(quotes).filter(rows => opposingSides(rows).length === 2).flatMap(rows => rows.filter(q => q.exchange && confirmed(q) && Number(q.liquidity) >= minimum && fresh(q)).map(exchange => {
    const opposite = rows.filter(q => q.exchange && confirmed(q) && q.side !== exchange.side && fresh(q)).sort((a,b) => decimal(b.odds)-decimal(a.odds))[0];
    const sportsbook = rows.filter(q => !q.exchange && confirmed(q) && q.side !== exchange.side && fresh(q)).sort((a,b) => decimal(b.odds)-decimal(a.odds))[0];
    if (!sportsbook || (opposite && decimal(sportsbook.odds) <= decimal(opposite.odds))) return null;
    return { exchange, opposite, sportsbook, liquidity:Number(exchange.liquidity), improvement:opposite ? decimal(sportsbook.odds)/decimal(opposite.odds)-1 : NaN };
  }).filter(Boolean));
}

/**
 * Current matches for one alert rule: [{ id, label }]. A match's id is its selection's stable id (a
 * line move's snapshot for movement rules), so a rule fires when a price newly meets it, not on every
 * rescrape. `settings` are the member's pricing settings: EV rules price exactly as the Positive EV
 * board does, caps included. `available` decides which prices are current.
 */
export function alertMatches(rule, state, { settings = {}, available = fresh } = {}) {
  const lower = value => String(value ?? '').toLowerCase(), named = (values, text) => values.some(value => lower(value).includes(lower(text)));
  if (rule.kind === 'fantasy-new') {
    // A goblin or demon line without its multiplier, or a part-game line, has no comparable hit rate.
    const market = x => !rule.market || lower(x.market) === lower(rule.market) || lower(x.market).startsWith(lower(rule.market) + ' ');
    return (state.dfs || []).filter(x => knownProbability(x.probability) && x.period !== 'part' && (!['goblin', 'demon'].includes(x.oddsType) || Number(x.payoutMultiplier) > 0)
      && (!rule.sport || x.sport === rule.sport) && (!rule.event || named([x.event], rule.event)) && market(x) && (!rule.liveOnly || x.live)
      && (!Number.isFinite(Number(rule.threshold)) || Number(x.probability) * 100 >= Number(rule.threshold)))
      .map(x => ({ id: x.id, label: `${x.player} ${x.side} ${x.line} ${x.market} · ${(Number(x.probability) * 100).toFixed(1)}% fair at ${x.app}` }));
  }
  const quotes = (state.quotes || []).filter(q => available(q) && (!rule.sport || q.sport === rule.sport) && (!rule.event || named([q.displayEvent, q.event], rule.event))
    && (!rule.market || named([q.displayMarket, q.market], rule.market)) && (!rule.liveOnly || q.live));
  const label = q => `${q.player ? q.player + ' ' : ''}${q.selection || q.side}${q.line !== '' && q.line != null ? ' ' + q.line : ''} ${oddsLabel(q.odds)} · ${q.displayMarket || q.market} · ${q.displayEvent || q.event} at ${q.book}`;
  if (rule.kind === 'price') return quotes.filter(q => decimal(q.odds) >= decimal(rule.threshold)).map(q => ({ id: q.id, label: label(q) }));
  if (rule.kind === 'ev') {
    const all = state.quotes || [], markets = marketRowsOf(all);
    const rows = new Map(computeAdvancedEv(all, settings).filter(row => row.ev >= Number(rule.threshold) / 100 && plausibleEv(row, markets, settings, available)).map(row => [row.quote.id, row]));
    return quotes.filter(q => rows.has(q.id)).map(q => ({ id: q.id, label: `${label(q)} · ${signed(rows.get(q.id).ev)} EV` }));
  }
  if (rule.kind === 'movement') {
    // A moved line is a new selection id; its series id follows the book's line (see normalizeFeed).
    const series = new Map();
    for (const item of state.history || []) { const key = item.seriesId || item.quoteId; if (!series.has(key)) series.set(key, []); series.get(key).push(item); }
    return quotes.flatMap(q => {
      const observations = series.get(q.seriesId || q.id) || [];
      if (observations.length < 2) return [];
      const previous = observations.at(-2), current = observations.at(-1), change = Math.abs(Number(current.line) - Number(previous.line));
      return Number.isFinite(change) && change >= Number(rule.threshold) && change > 0 ? [{ id: current.id, label: `${label(q)} · line ${previous.line} → ${current.line}` }] : [];
    });
  }
  return [];
}

export function validateWorkspace(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.quotes)) throw Error('This is not a version 1 EV workspace.');
  const collections = ['quotes','history','dfs','contracts','contractHistory','traders','trades','bets','results','alerts','notifications','slips'];
  const text = (item,key) => typeof item?.[key] === 'string' && item[key].trim().length > 0;
  const range = (item,key,min,max) => Number.isFinite(Number(item?.[key])) && Number(item[key]) >= min && Number(item[key]) <= max;
  for (const key of collections) {
    if (data[key] != null && !Array.isArray(data[key])) throw Error(`${key} must be a list.`);
    const records = data[key] || [];
    const ids = new Set();
    for (const [index,item] of records.entries()) {
      if (!text(item,'id') || ids.has(item.id)) throw Error(`${key} record ${index + 1} needs a unique ID.`);
      ids.add(item.id);
      const valid = key === 'quotes' ? validQuote(item) && text(item,'ts') && Number.isFinite(Date.parse(item.ts)) && (item.outcomes == null || item.outcomes === '' || (Number.isInteger(Number(item.outcomes)) && Number(item.outcomes) >= 2 && Number(item.outcomes) <= 64))
        : key === 'history' ? text(item,'quoteId') && text(item,'ts') && Number.isFinite(decimal(item.odds))
        : key === 'dfs' ? text(item,'player') && text(item,'market') && text(item,'app') && range(item,'probability',0,1)
        : key === 'contracts' ? text(item,'platform') && text(item,'event') && range(item,'bid',0,100) && range(item,'ask',0,100) && Number(item.bid) <= Number(item.ask)
        : key === 'contractHistory' ? text(item,'contractId') && text(item,'ts') && range(item,'bid',0,100) && range(item,'ask',0,100)
        : key === 'traders' ? text(item,'name') && text(item,'contractId') && range(item,'entry',0,100) && Number(item.quantity) > 0
        : key === 'trades' ? text(item,'trader') && text(item,'contractId') && range(item,'price',0,100) && Number(item.quantity) > 0
        : key === 'bets' ? text(item,'selection') && Number(item.stake) > 0 && Number.isFinite(decimal(item.odds)) && (item.closeOdds == null || item.closeOdds === '' || Number.isFinite(decimal(item.closeOdds)))
        : key === 'results' ? text(item,'player') && text(item,'market') && text(item,'game') && text(item,'date') && Number.isFinite(Number(item.line)) && Number.isFinite(Number(item.result))
        : key === 'alerts' ? ['price','ev','movement','fantasy-new'].includes(item.kind) && (item.seen == null || Array.isArray(item.seen)) && (item.kind === 'price' ? Number.isFinite(decimal(item.threshold)) : item.kind === 'movement' ? Number(item.threshold) > 0 : range(item,'threshold',0,100))
        : key === 'notifications' ? text(item,'message') && text(item,'ts') : true;
      if (!valid) throw Error(`${key} record ${index + 1} has invalid fields.`);
    }
  }
  if (data.paytables != null && (typeof data.paytables !== 'object' || Array.isArray(data.paytables) || Object.values(data.paytables).some(table => !table || typeof table !== 'object' || Object.values(table).some(rule => !Array.isArray(rule) || rule.some(value => !(Number(value) >= 0)))))) throw Error('Payout rules must be nonnegative multiplier lists.');
  return true;
}
