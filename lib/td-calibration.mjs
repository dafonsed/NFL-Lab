// Independent calibration of an NFL profile score against later rushing/receiving TD outcomes.
// The score is computed before the target game; no reference-app percentages enter this fit.
export const TD_CALIBRATION_VERSION = 'score-td-logistic-v1';

const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const features = (row, withPosition) => {
  const x = [1, (row.score - 50) / 20];
  if (withPosition) x.push(Number(row.position === 'WR'), Number(row.position === 'TE'), Number(row.position === 'QB'));
  return x;
};
function solve(a, b) {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    if (Math.abs(m[pivot][k]) < 1e-10) return null;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const divisor = m[k][k];
    for (let j = k; j <= n; j++) m[k][j] /= divisor;
    for (let i = 0; i < n; i++) if (i !== k) {
      const factor = m[i][k];
      for (let j = k; j <= n; j++) m[i][j] -= factor * m[k][j];
    }
  }
  return m.map(row => row[n]);
}
export function fitTdCalibration(rows, { withPosition = false, ridge = 2 } = {}) {
  const usable = rows.filter(r => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 && [0, 1].includes(r.outcome));
  if (usable.length < 200 || new Set(usable.map(r => r.outcome)).size !== 2) throw Error('At least 200 scored, mixed-outcome appearances are required for TD calibration.');
  const size = withPosition ? 5 : 2, coefficients = Array(size).fill(0);
  coefficients[0] = Math.log((usable.reduce((sum, r) => sum + r.outcome, 0) + .5) / (usable.length - usable.reduce((sum, r) => sum + r.outcome, 0) + .5));
  for (let iteration = 0; iteration < 35; iteration++) {
    const gradient = Array(size).fill(0), hessian = Array.from({ length: size }, () => Array(size).fill(0));
    for (const row of usable) {
      const x = features(row, withPosition), p = sigmoid(x.reduce((sum, value, i) => sum + value * coefficients[i], 0)), weight = Math.max(1e-8, p * (1 - p));
      for (let i = 0; i < size; i++) {
        gradient[i] += x[i] * (row.outcome - p);
        for (let j = 0; j < size; j++) hessian[i][j] += x[i] * x[j] * weight;
      }
    }
    for (let i = 1; i < size; i++) { gradient[i] -= ridge * coefficients[i]; hessian[i][i] += ridge; }
    const step = solve(hessian, gradient);
    if (!step) throw Error('TD calibration fit is singular.');
    for (let i = 0; i < size; i++) coefficients[i] += step[i];
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  if (!(coefficients[1] > 0)) throw Error('TD score is not positively associated with outcomes in training data.');
  return { version: TD_CALIBRATION_VERSION, method: 'ridge-logistic', withPosition, coefficients, trainingCount: usable.length, trainingSeasons: [...new Set(usable.map(r => r.season))].sort() };
}
export function calibratedTdProbability(score, position, artifact, targetSeason) {
  if (!artifact || artifact.version !== TD_CALIBRATION_VERSION || !Number.isFinite(score) || !Number.isInteger(Number(targetSeason)) || Number(targetSeason) <= Math.max(...artifact.trainingSeasons)) return null;
  const x = features({ score, position }, artifact.withPosition);
  if (x.length !== artifact.coefficients?.length || !artifact.coefficients.every(Number.isFinite)) return null;
  return Math.max(0, Math.min(1, sigmoid(x.reduce((sum, value, i) => sum + value * artifact.coefficients[i], 0))));
}
export function tdProbabilityMetrics(rows, predict) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: 0, predicted: 0, observed: 0 }));
  let n = 0, brier = 0, logLoss = 0;
  for (const row of rows) {
    const p = predict(row);
    if (!Number.isFinite(p) || ![0, 1].includes(row.outcome)) continue;
    const bounded = Math.max(1e-6, Math.min(1 - 1e-6, p)), bin = bins[Math.min(9, Math.floor(bounded * 10))];
    n++; brier += (bounded - row.outcome) ** 2; logLoss -= row.outcome * Math.log(bounded) + (1 - row.outcome) * Math.log(1 - bounded);
    bin.n++; bin.predicted += bounded; bin.observed += row.outcome;
  }
  return { n, brier: n ? brier / n : null, logLoss: n ? logLoss / n : null, bins: bins.map(b => ({ ...b, predicted: b.n ? b.predicted / b.n : null, observed: b.n ? b.observed / b.n : null })) };
}
