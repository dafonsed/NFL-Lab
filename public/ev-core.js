// Pure market math. Quote adapters can replace manual/example records without changing the workbench.
export const decimal = odds => {
  const n = Number(odds);
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return NaN;
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
};
export const implied = odds => 1 / decimal(odds);
export const expectedReturn = (probability, odds) => probability * decimal(odds) - 1;
export const money = n => Number.isFinite(n) ? '$' + n.toFixed(2) : '—';
export const percent = n => Number.isFinite(n) ? (100 * n).toFixed(1) + '%' : '—';
export const signed = n => Number.isFinite(n) ? (n > 0 ? '+' : '') + (100 * n).toFixed(1) + '%' : '—';
export const oddsLabel = odds => Number(odds) > 0 ? '+' + Number(odds) : String(Number(odds));
export const marketKey = q => [q.event, q.market, q.line, q.live ? 'live' : 'pregame'].join('|');
export const familyKey = q => [q.event, q.market, q.live ? 'live' : 'pregame'].join('|');
export const validQuote = q => q && q.event && q.market && q.side && q.book && Number.isFinite(decimal(q.odds));
export const fresh = (q, now = Date.now()) => !q.live || now - Date.parse(q.ts) <= 90_000;

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
  return sides.length === 2 ? sides : [];
}

export function fairProbability(quote, rows) {
  const sides = opposingSides(rows);
  if (!sides.includes(quote.side)) return NaN;
  const books = [...new Set(rows.map(q => q.book))].filter(book => book !== quote.book);
  const estimates = [];
  for (const book of books) {
    const a = rows.filter(q => q.book === book && q.side === quote.side && fresh(q)).sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts))[0];
    const b = rows.filter(q => q.book === book && q.side !== quote.side && fresh(q)).sort((x, y) => Date.parse(y.ts) - Date.parse(x.ts))[0];
    if (a && b) estimates.push(implied(a.odds) / (implied(a.odds) + implied(b.odds)));
  }
  return estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : NaN;
}

export function evRows(quotes, mode) {
  return groups(quotes, mode).flatMap(rows => rows.filter(q => fresh(q)).map(q => {
    const fair = fairProbability(q, rows);
    return { quote: q, fair, ev: expectedReturn(fair, q.odds), edge: fair - implied(q.odds) };
  })).filter(row => Number.isFinite(row.ev)).sort((a, b) => b.ev - a.ev);
}

export function bestSides(rows) {
  const sides = opposingSides(rows);
  if (!sides.length) return [];
  return sides.map(side => rows.filter(q => q.side === side && fresh(q)).sort((a, b) => decimal(b.odds) - decimal(a.odds))[0]).filter(Boolean);
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

export function middleRows(quotes, mode) {
  const families = new Map();
  for (const q of quotes.filter(validQuote).filter(q => q.type === 'total' && Boolean(q.live) === mode && fresh(q))) {
    const key = familyKey(q);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(q);
  }
  const found = [];
  for (const rows of families.values()) {
    const overs = rows.filter(q => q.side.toLowerCase() === 'over');
    const unders = rows.filter(q => q.side.toLowerCase() === 'under');
    for (const over of overs) for (const under of unders) {
      if (Number(over.line) >= Number(under.line) || over.book === under.book) continue;
      found.push({ over, under, width: Number(under.line) - Number(over.line), cost: 1 - 1 / (implied(over.odds) + implied(under.odds)) });
    }
  }
  return found.sort((a, b) => b.width - a.width || a.cost - b.cost);
}

export function promoConversion({ stake, promoOdds, hedgeOdds, kind = 'bonus', boost = 0 }) {
  const d1 = decimal(promoOdds), d2 = decimal(hedgeOdds), amount = Number(stake), factor = 1 + Number(boost) / 100;
  if (!(amount > 0) || !Number.isFinite(d1) || !Number.isFinite(d2) || !(factor > 0)) return null;
  const payout = kind === 'bonus' ? amount * (d1 - 1) * factor : amount * (1 + (d1 - 1) * factor);
  const hedge = payout / d2;
  const ifPromoWins = kind === 'bonus' ? payout - hedge : payout - amount - hedge;
  const ifHedgeWins = hedge * (d2 - 1) - (kind === 'bonus' ? 0 : amount);
  return { hedge, ifPromoWins, ifHedgeWins, conversion: kind === 'bonus' ? ifPromoWins / amount : NaN };
}

export function parlay(legs) {
  if (!legs.length || new Set(legs.map(x => x.event)).size !== legs.length) return null;
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

export function fantasySlip(picks, paytable, stake = 1) {
  if (!picks.length || !(stake > 0)) return null;
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

export function sharpMatches(quotes, minimum = 1000) {
  return groups(quotes).flatMap(rows => rows.filter(q => q.exchange && Number(q.liquidity) >= minimum && fresh(q)).flatMap(exchange =>
    rows.filter(q => !q.exchange && q.side !== exchange.side && fresh(q)).map(sportsbook => ({ exchange, sportsbook, liquidity: Number(exchange.liquidity), opposingPrice: sportsbook.odds }))
  ));
}

export function alertMatches(rule, state) {
  if (rule.kind === 'fantasy-new') return state.dfs.filter(x => x.id !== rule.seenId && (!rule.market || x.market.toLowerCase().includes(rule.market.toLowerCase()))).map(x => ({ id: x.id, label: `${x.player} ${x.market} at ${x.app}` }));
  const rows = state.quotes.filter(q => (!rule.event || q.event.toLowerCase().includes(rule.event.toLowerCase())) && (!rule.market || q.market.toLowerCase().includes(rule.market.toLowerCase())) && (!rule.liveOnly || q.live));
  if (rule.kind === 'price') return rows.filter(q => decimal(q.odds) >= decimal(rule.threshold)).map(q => ({ id: q.id, label: `${q.side} ${oddsLabel(q.odds)} at ${q.book}` }));
  if (rule.kind === 'ev') {
    const ids = new Set(evRows(state.quotes, rule.liveOnly ? true : null).filter(x => x.ev >= Number(rule.threshold) / 100).map(x => x.quote.id));
    return rows.filter(q => ids.has(q.id)).map(q => ({ id: q.id, label: `${q.side} at ${q.book}` }));
  }
  return [];
}
