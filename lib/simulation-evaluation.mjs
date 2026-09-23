import { probabilityInterval } from './game-simulation.mjs';
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const loss = p => -Math.log(Math.max(1e-6, p));
const abs = xs => mean(xs.map(Math.abs));
export function crps(pmf, actual) {
  // E|X-y| - .5 E|X-X'|, evaluated in linear time on an ordered discrete PMF.
  let mass = 0, moment = 0, pair = 0, error = 0;
  for (const { value, probability: p } of pmf) {
    error += p * Math.abs(value - actual); pair += p * (value * mass - moment);
    mass += p; moment += p * value;
  }
  return error - pair;
}
export function evaluationRow(result, actual, baseline) {
  if (result.status !== 'experimental') throw Error('Cannot evaluate an unavailable forecast.');
  if (result.outcomeScope === 'regulation-only' && actual.scoreBasis !== 'regulation') throw Error('Regulation forecasts require regulation outcomes; final-game scoring is withheld.');
  if ([actual.homeScore, actual.awayScore].some(v => !Number.isInteger(v) || v < 0)) throw Error('Final scores are required.');
  const winner = actual.homeScore > actual.awayScore ? 'home' : actual.homeScore < actual.awayScore ? 'away' : 'tie';
  const margin = actual.homeScore - actual.awayScore, total = actual.homeScore + actual.awayScore;
  const homeY = Number(winner === 'home'), p = result.probabilities;
  return { id: actual.id, date: actual.date, season: actual.season, home: actual.home, away: actual.away,
    homeProbability: p.home, homeWon: homeY, brier: (p.home - homeY) ** 2, baselineBrier: (baseline.home - homeY) ** 2,
    multiclassBrier: ['away', 'home', 'tie'].reduce((s, k) => s + (p[k] - Number(winner === k)) ** 2, 0),
    logLoss: loss(p[winner]), baselineLogLoss: loss(baseline[winner]),
    totalError: result.total.mean - total, marginError: result.homeMargin.mean - margin,
    scoreErrors: [result.teams[0].score.mean - actual.awayScore, result.teams[1].score.mean - actual.homeScore],
    totalCovered: total >= result.total.p10 && total <= result.total.p90,
    marginCovered: margin >= result.homeMargin.p10 && margin <= result.homeMargin.p90,
    totalCRPS: crps(result.total.pmf, total), marginCRPS: crps(result.homeMargin.pmf, margin),
    homeFavorite: p.home >= p.away, limitedHistory: result.teams.some(t => t.inputs.count < result.inputs.weights.min * 2) };
}
export function evaluationMetrics(rows) {
  const delta = rows.map(r => r.brier - r.baselineBrier), average = mean(delta);
  const se = rows.length > 1 ? Math.sqrt(delta.reduce((s, d) => s + (d - average) ** 2, 0) / (rows.length - 1) / rows.length) : null;
  return { n: rows.length, homeBrier: mean(rows.map(r => r.brier)), baselineHomeBrier: mean(rows.map(r => r.baselineBrier)),
    brierDifference: average, brierDifferenceInterval95: se === null ? null : [average - 1.96 * se, average + 1.96 * se],
    multiclassBrier: mean(rows.map(r => r.multiclassBrier)), logLoss: mean(rows.map(r => r.logLoss)), baselineLogLoss: mean(rows.map(r => r.baselineLogLoss)),
    scoreMAE: abs(rows.flatMap(r => r.scoreErrors)), totalMAE: abs(rows.map(r => r.totalError)), marginMAE: abs(rows.map(r => r.marginError)),
    marginRMSE: rows.length ? Math.sqrt(mean(rows.map(r => r.marginError ** 2))) : null,
    totalCoverage80: mean(rows.map(r => Number(r.totalCovered))), marginCoverage80: mean(rows.map(r => Number(r.marginCovered))),
    totalCRPS: mean(rows.map(r => r.totalCRPS)), marginCRPS: mean(rows.map(r => r.marginCRPS)) };
}
export function calibrationBuckets(rows) {
  return Array.from({ length: 10 }, (_, i) => {
    const group = rows.filter(r => Math.min(9, Math.floor(r.homeProbability * 10)) === i), wins = group.reduce((s, r) => s + r.homeWon, 0);
    return { from: i / 10, to: (i + 1) / 10, n: group.length, predicted: mean(group.map(r => r.homeProbability)), observed: group.length ? wins / group.length : null, observedInterval95: probabilityInterval(wins, group.length) };
  });
}

// One generator for the shipped evidence and reproducibility check; omit clocks
// and benchmarks because those vary even when the statistical results do not.
export function compactSimulationEvidence(report) {
  return Object.fromEntries(['version', 'randomVersion', 'priorVersion', 'sport', 'status', 'protocol', 'sourceSha256', 'sourceReceipts', 'codeSha256', 'publication', 'holdout', 'outcomeScope', 'limitations', 'phases'].map(key => [key, report[key]]));
}
