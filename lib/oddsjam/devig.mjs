// Devig engine — extracts no-vig fair probabilities from two-sided markets
// Methods extracted from OddsJam's JS bundles

// ─── American odds to decimal ───
export function americanToDecimal(american) {
  if (american > 0) return 1 + (american / 100);
  return 1 + (100 / Math.abs(american));
}

// ─── Decimal to implied probability ───
export function decimalToImpliedProb(decimal) {
  return 1 / decimal;
}

// ─── American odds to implied probability ───
export function americanToImpliedProb(american) {
  return decimalToImpliedProb(americanToDecimal(american));
}

// ─── Implied probability to American odds ───
export function impliedProbToAmerican(prob) {
  if (prob >= 1) return 1000000;
  if (prob > 0.5) return -Math.round(100 * prob / (1 - prob));
  return Math.round(100 * (1 - prob) / prob);
}

// ─── Devig Methods ───

// 1. Multiplicative (standard) — scales both sides proportionally
export function devigMultiplicative(odds1, odds2) {
  const p1 = americanToImpliedProb(odds1);
  const p2 = americanToImpliedProb(odds2);
  const total = p1 + p2;
  return {
    prob1: p1 / total,
    prob2: p2 / total,
    vig: total - 1
  };
}

// 2. Additive — subtracts equal share of vig from both sides
export function devigAdditive(odds1, odds2) {
  const p1 = americanToImpliedProb(odds1);
  const p2 = americanToImpliedProb(odds2);
  const vig = p1 + p2 - 1;
  return {
    prob1: p1 - (vig / 2),
    prob2: p2 - (vig / 2),
    vig
  };
}

// 3. Power (OddsJam default, Pinnacle's method) — finds exponent k such that
//    p1^k + p2^k = 1
export function devigPower(odds1, odds2) {
  const p1 = americanToImpliedProb(odds1);
  const p2 = americanToImpliedProb(odds2);
  const margin = p1 + p2 - 1;

  if (margin <= 0) {
    return { prob1: p1, prob2: p2, vig: 0 };
  }

  // Binary search for exponent k
  let lo = 0.1, hi = 2.0;
  const target = 1.0;
  
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const sum = Math.pow(p1, mid) + Math.pow(p2, mid);
    if (Math.abs(sum - target) < 1e-10) break;
    if (sum > target) lo = mid;
    else hi = mid;
  }

  const k = (lo + hi) / 2;
  return {
    prob1: Math.pow(p1, k),
    prob2: Math.pow(p2, k),
    vig: margin,
    exponent: k
  };
}

// 4. Worst Case (conservative) — assumes the vig hits your side
export function devigWorstCase(odds1, odds2, side = 1) {
  const p1 = americanToImpliedProb(odds1);
  const p2 = americanToImpliedProb(odds2);
  const vig = p1 + p2 - 1;
  
  if (side === 1) {
    return { prob1: p1 - vig, prob2: p2, vig };
  }
  return { prob1: p1, prob2: p2 - vig, vig };
}

// 5. Best Case (aggressive) — assumes no vig on your side
export function devigBestCase(odds1, odds2, side = 1) {
  const p1 = americanToImpliedProb(odds1);
  const p2 = americanToImpliedProb(odds2);
  const vig = p1 + p2 - 1;
  
  if (side === 1) {
    return { prob1: p1, prob2: p2 - vig, vig };
  }
  return { prob1: p1 - vig, prob2: p2, vig };
}

// ─── Main devig dispatcher ───
export function devig(odds1, odds2, method = 'power', side = 1) {
  switch (method) {
    case 'multiplicative': return devigMultiplicative(odds1, odds2);
    case 'additive': return devigAdditive(odds1, odds2);
    case 'power': return devigPower(odds1, odds2);
    case 'worst': return devigWorstCase(odds1, odds2, side);
    case 'best': return devigBestCase(odds1, odds2, side);
    default: return devigPower(odds1, odds2);
  }
}

// ─── No-vig fair odds ───
export function noVigFairOdds(odds1, odds2, method = 'power') {
  const result = devig(odds1, odds2, method);
  return {
    fair1: impliedProbToAmerican(result.prob1),
    fair2: impliedProbToAmerican(result.prob2),
    ...result
  };
}

// ─── EV Calculation ───
export function expectedValue(betOdds, fairProb) {
  const decimal = americanToDecimal(betOdds);
  const ev = (fairProb * (decimal - 1)) - ((1 - fairProb) * 1);
  return ev; // EV per $1 wagered
}

export function evPercentage(betOdds, fairProb) {
  return expectedValue(betOdds, fairProb) * 100;
}

// ─── Kelly Criterion ───
export function kelly(betOdds, fairProb, kellyFraction = 1.0) {
  const decimal = americanToDecimal(betOdds);
  const b = decimal - 1; // net odds
  const p = fairProb;
  const q = 1 - p;
  const k = (b * p - q) / b;
  return Math.max(0, k * kellyFraction);
}

// ─── Arbitrage Detection ───
export function findArbitrage(bestOdds1, bestOdds2) {
  const p1 = americanToImpliedProb(bestOdds1);
  const p2 = americanToImpliedProb(bestOdds2);
  const total = p1 + p2;
  
  if (total < 1) {
    const profit = (1 - total) / total;
    return {
      isArb: true,
      profitPct: profit * 100,
      stake1: p1 / total,
      stake2: p2 / total
    };
  }
  
  return { isArb: false, profitPct: (total - 1) * 100 };
}

// ─── DFS Edge (comparing DFS line vs no-vig book probability) ───
export function dfsEdge(dfsLine, dfsOverOdds, bookFairProb) {
  // DFS typically: over/under a line at standardized odds (usually -110 or implied 50%)
  // Edge = how far the DFS implied probability deviates from fair
  const dfsImpliedProb = americanToImpliedProb(dfsOverOdds || -110);
  const edge = bookFairProb - dfsImpliedProb;
  return {
    edge,
    edgePct: edge * 100,
    recommendation: edge > 0 ? 'OVER' : 'UNDER',
    fairProb: bookFairProb
  };
}
