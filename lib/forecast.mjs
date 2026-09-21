import { MARKET_CONFIG } from './markets.mjs';

// Candidate v1 is deliberately independent of model.mjs and its scoring weights.
export const FORECAST_VERSION = 'workload-v1';
export const RULES = Object.freeze({ workloadGames: 3, efficiencyGames: 10, minGames: 5, minErrors: 100, leanProbability: .60, roleChange: .30 });
const finite = x => x !== '' && x != null && Number.isFinite(Number(x));
const n = x => finite(x) ? Number(x) : 0;
const total = (rows, field) => rows.reduce((a, r) => a + n(r[field]), 0);
const avg = (rows, field) => rows.length ? total(rows, field) / rows.length : 0;
const round = x => Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;
const sampleFields = ['gameId','game_id','date','season','week','team','attempts','completions','passing_yards','passing_tds','passing_interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','special_teams_tds','snap_pct'];
export const targetValue = (row, market) => MARKET_CONFIG[market].fields.reduce((a, k) => a + n(row[k]), 0);
export function priorSample(rows, target) {
  return rows.filter(r => Number(r.season) < Number(target.season) || Number(r.season) === Number(target.season) && Number(r.week) < Number(target.week))
    .filter(r => !target.date || !r.date || r.date < target.date)
    .sort((a, b) => Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week)).slice(0, 10);
}
export function project(sample, market, variant = 'candidate') {
  if (!sample.length) return null;
  const recent = sample.slice(0, 3), efficiency = sample.slice(0, 10);
  const baseline = sample.slice(0, 5).reduce((a, r) => a + (market === 'any_td' ? Number(targetValue(r, market) > 0) : targetValue(r, market)), 0) / Math.min(5, sample.length);
  if (variant === 'average') return { point: baseline, baseline, parts: [] };
  const workloads = variant === 'efficiencyOnly' ? sample.slice(0, 5) : recent;
  const rates = variant === 'workloadOnly' ? sample.slice(0, 5) : efficiency;
  const rate = (value, volume) => total(rates, volume) > 0 ? total(rates, value) / total(rates, volume) : 0;
  const parts = [];
  const component = (volume, value, label) => {
    const workload = avg(workloads, volume), efficiency = value ? rate(value, volume) : 1;
    parts.push({ label, workload: round(workload), efficiency: round(efficiency), value: round(workload * efficiency) });
    return workload * efficiency;
  };
  let point;
  if (market === 'any_td') {
    const lambda = component('carries', 'rushing_tds', 'Carries × rushing TD rate') + component('targets', 'receiving_tds', 'Targets × receiving TD rate') + avg(rates, 'special_teams_tds');
    point = 1 - Math.exp(-lambda);
  } else if (market === 'rush_rec_yds') point = component('carries', 'rushing_yards', 'Carries × yards per carry') + component('targets', 'receiving_yards', 'Targets × yards per target');
  else {
    const fields = { pass_yds:['attempts','passing_yards','Pass attempts × yards per attempt'], pass_tds:['attempts','passing_tds','Pass attempts × TD rate'], pass_interceptions:['attempts','passing_interceptions','Pass attempts × interception rate'], pass_completions:['attempts','completions','Pass attempts × completion rate'], pass_attempts:['attempts',null,'Pass attempts'], rush_yds:['carries','rushing_yards','Carries × yards per carry'], rush_attempts:['carries',null,'Carries'], rec:['targets','receptions','Targets × catch rate'], rec_yds:['targets','receiving_yards','Targets × yards per target'] }[market];
    point = component(...fields);
  }
  return { point: round(point), baseline: round(baseline), parts };
}
export function roleFlags(sample, market, target) {
  const flags = [];
  if (sample.length < RULES.minGames) flags.push('Fewer than five prior appearances');
  if (sample.some(r => r.team && target.team && r.team !== target.team)) flags.push('Sample includes a different team');
  if (sample[0]?.season < target.season) flags.push('No current-season appearance yet');
  const volumes = market.startsWith('pass_') ? ['attempts'] : market.startsWith('rush_') && market !== 'rush_rec_yds' ? ['carries'] : ['rec','rec_yds'].includes(market) ? ['targets'] : ['carries','targets'];
  if (sample.length >= 5) for (const field of volumes) {
    const latest = avg(sample.slice(0, 2), field), previous = avg(sample.slice(2, 5), field);
    if (Math.max(latest, previous) >= 3 && Math.abs(latest - previous) / Math.max(previous, 1) >= RULES.roleChange) flags.push(`${field === 'attempts' ? 'Pass attempts' : field === 'carries' ? 'Carries' : 'Targets'} changed by at least 30%`);
  }
  const snaps = sample.slice(0,5).filter(r => finite(r.snap_pct));
  if (snaps.length === 5 && Math.abs(avg(snaps.slice(0,2),'snap_pct') - avg(snaps.slice(2),'snap_pct')) >= .15) flags.push('Snap share changed by at least 15 points');
  return flags;
}
export function distribution(point, market, position, artifact, variant = 'candidate') {
  const pool = artifact?.pools?.[variant]?.[`${market}:${position}`];
  if (!pool?.length) return null;
  // Condition errors on forecast size to avoid giving a reserve a starter's range.
  const width = market === 'any_td' ? .15 : Math.max(market.includes('yds') ? 15 : 2, Math.abs(point) * .40);
  let selected = pool.filter(([p]) => Math.abs(p - point) <= width);
  const matchedCount = selected.length, local = matchedCount >= RULES.minErrors;
  if (!local) selected = pool;
  if (market === 'any_td') {
    const probability = (selected.reduce((a, [, actual]) => a + Number(actual > 0), 0) + 1) / (selected.length + 2);
    return { probability, count:selected.length, matchedCount, local, interval:[0,1], outcomes:null };
  }
  const countMarket = !market.includes('yds');
  const outcomes = selected.map(([p, actual]) => {
    const value = Math.round(point + actual - p);
    return countMarket ? Math.max(0, value) : value;
  }).sort((a,b) => a-b);
  const quantile = p => outcomes[Math.min(outcomes.length-1, Math.floor((outcomes.length-1)*p))];
  return { outcomes, count:outcomes.length, matchedCount, local, interval:[quantile(.10),quantile(.90)] };
}
export function lineProbabilities(dist, line, market) {
  if (!dist || !Number.isFinite(line)) return null;
  if (market === 'any_td') {
    if (line !== .5) return null;
    return { over:round(dist.probability), under:round(1-dist.probability), push:0 };
  }
  const length = dist.outcomes.length;
  return Object.fromEntries(['over','under','push'].map(side => [side, round(dist.outcomes.filter(v => side === 'over' ? v > line : side === 'under' ? v < line : v === line).length / length)]));
}
export function forecast({ sample, target, market, position, prop, artifact, availability, stale = false, now = Date.now() }) {
  const rows = priorSample(sample, target), projection = project(rows, market);
  if (!projection) return { version:FORECAST_VERSION, status:'unavailable', reasons:['No prior appearances'], lean:null };
  // A fitted error set is never used to reconstruct predictions from its own training season.
  const artifactAllowed = artifact && Number(target.season) > artifact.trainingSeason;
  const dist = artifactAllowed && rows.length >= RULES.minGames ? distribution(projection.point, market, position, artifact) : null;
  const supportedDist = dist?.local && dist.count >= RULES.minErrors ? dist : null;
  const probability = lineProbabilities(supportedDist, prop?.line, market);
  const reasons = roleFlags(rows, market, target);
  if (stale || prop?.stale) reasons.push('A data source is stale');
  if (!prop) reasons.push('No posted line');
  else if (prop.basis !== 'captured_pregame' || Date.parse(prop.commenceTime) <= now || Date.parse(prop.fetchedAt) > now || now - Date.parse(prop.fetchedAt) > 2*3600000) reasons.push('No fresh upcoming pregame line');
  if (!dist || dist.count < RULES.minErrors || !dist.local) reasons.push('Insufficient comparable forecast errors');
  if (availability?.concern) reasons.push(`Reported availability: ${availability.status}`);
  if (!availability || availability.status === 'unavailable' || availability.stale) reasons.push('Current availability feed unavailable');
  const side = probability && (probability.over >= probability.under ? 'over' : 'under');
  if (probability && Math.max(probability.over,probability.under) < RULES.leanProbability) reasons.push('Neither side reaches the 60% research threshold');
  const lean = reasons.length || !side ? null : side;
  const gap = Number.isFinite(prop?.line) ? projection.point-prop.line : null;
  const label = market === 'any_td' ? 'TD occurrence estimate' : 'Workload projection';
  return { version:FORECAST_VERSION, artifactId:artifactAllowed?artifact.id:null, status:'experimental', point:projection.point, pointUnit:market==='any_td'?'TD probability':MARKET_CONFIG[market].unit, baseline:projection.baseline, parts:projection.parts, interval:supportedDist?.interval||null, intervalLabel:'Middle 80% of historical forecast-error scenarios; not guaranteed coverage', probability, gap:market==='any_td'?null:round(gap), lean, reasons, sampleCount:rows.length, errorCount:dist?.matchedCount||0, availability:availability||{status:'unavailable'}, validation:'Prospective validation pending; does not replace the original rating', explanation:`${label} uses the last ${Math.min(3,rows.length)} appearances for workload and up to ${rows.length} for efficiency. ${lean?`Experimental ${lean} lean at ${prop.line}.`:'No clear lean.'}`, sample:rows.map(r=>Object.fromEntries(sampleFields.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))) };
}
