// Offline audit harness. Captures existing local bytes only; never fetches, fits,
// or writes model archives. Replays the actual store and independently checks
// every prior calculation and the complete seeded score/margin distributions.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import assert from 'node:assert/strict';
import { SimulationStore, simulationMlbHistory } from '../lib/simulation-source.mjs';
import { simulationNflHistory, simulationBasketballHistory, regulationPriorRows } from '../lib/simulation-history.mjs';
import { readNflRegulation } from '../lib/simulation-nfl-data.mjs';
import { simulateGame, compareSimulationMarket, SIMULATION_RANDOM_VERSION } from '../lib/game-simulation.mjs';
import { buildGamePrior, randomGenerator } from '../lib/live-game-model.mjs';
import { automaticRunnerEligible } from '../lib/simulation-rules.mjs';

const root = path.resolve('reports/simulation-deep'), capture = process.argv.includes('--capture');
const sourceRoot = path.join(root, 'sources'), hash = x => createHash('sha256').update(x).digest('hex');
const manifestFile = path.join(root, 'source-manifest.json');
let manifest = capture ? {} : JSON.parse(await fs.readFile(manifestFile, 'utf8'));
const codeFiles = ['lib/game-simulation.mjs', 'lib/live-game-model.mjs', 'lib/simulation-source.mjs', 'lib/simulation-history.mjs', 'lib/simulation-nfl-data.mjs', 'lib/simulation-rules.mjs', 'lib/sports/normalize.mjs', 'lib/sports/events.mjs', 'scripts/explain-simulation.mjs'];
const codeManifest = Object.fromEntries(await Promise.all(codeFiles.map(async file => [file, hash(await fs.readFile(file))])));
if (capture) await fs.writeFile(path.join(root, 'code-manifest.json'), JSON.stringify(codeManifest, null, 2) + '\n');
else assert.deepEqual(codeManifest, JSON.parse(await fs.readFile(path.join(root, 'code-manifest.json'), 'utf8')), 'Audit calculation code changed');
await fs.mkdir(sourceRoot, { recursive: true });
async function stored(relative, original = path.join('data-independent', relative)) {
  const file = path.join(sourceRoot, relative);
  if (capture) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.copyFile(original, file); }
  const bytes = await fs.readFile(file), sha256 = hash(bytes);
  if (capture) manifest[relative] = { sha256, original, bytes: bytes.length };
  else assert.equal(sha256, manifest[relative]?.sha256, 'Source bytes changed: ' + relative);
  return bytes;
}
for (const name of ['games.csv.gz', 'play_by_play_2025.csv.gz', 'play_by_play_2026.csv.gz']) {
  await stored('raw/' + name); await stored('raw/' + name + '.meta.json');
}
const scheduleBytes = await stored('raw/games.csv.gz');
const schedule = parse(gunzipSync(scheduleBytes), { columns: true, skip_empty_lines: true });
const meta = JSON.parse(await stored('raw/games.csv.gz.meta.json'));
const nflProvider = { dir: sourceRoot, async load(type) {
  assert.equal(type, 'schedule'); return { rows: schedule, meta: { ...meta, sha256: hash(scheduleBytes), stale: false } };
} };
const cases = [
  { sport: 'nfl', date: '2026-09-24', game: '2026_03_ATL_GB' },
  { sport: 'nba', date: '2026-04-01', game: '401810960' },
  { sport: 'wnba', date: '2026-09-22', game: '401857208' },
  { sport: 'mlb', date: '2026-09-22', game: '823543' },
]; // Same four previously observed integration matchups, fixed before this replay.
const sum = xs => xs.reduce((a, b) => a + b, 0), clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const near = (x, y, label) => assert.ok(Math.abs(x - y) < 1e-9, `${label}: ${x} != ${y}`);
function filterHistory(history, game) {
  const cutoff = (game.officialDate || game.date).slice(0, 10), excluded = [], valid = [];
  const badAvailability = new Set(history.filter(g => g.complete && g.date?.slice(0, 10) < cutoff && g.availableAt != null
    && !(Number.isFinite(Date.parse(g.availableAt)) && Date.parse(g.availableAt) < Date.parse(cutoff))).map(g => String(g.id)));
  history.forEach((g, index) => {
    let reason = !g.complete ? 'incomplete' : String(g.id) === game.id ? 'target game' : !Number.isFinite(Date.parse(g.date)) ? 'invalid date'
      : g.date.slice(0, 10) >= cutoff ? 'target-day or future' : badAvailability.has(String(g.id)) ? 'not available before cutoff'
        : Date.parse(cutoff) - Date.parse(g.date) >= 450 * 86400000 ? 'outside 450-day window' : null;
    if (!reason && (!g.id || !g.home || !g.away || g.home === g.away || [g.homeScore, g.awayScore].some(n => !Number.isInteger(n) || n < 0 || n > 1000))) reason = 'invalid identity or score';
    if (reason) excluded.push({ index, id: g.id, date: g.date, reason }); else valid.push({ ...g, originalIndex: index });
  });
  const unique = new Map(), conflicts = new Set();
  for (const g of valid) {
    const old = unique.get(g.id);
    if (old) {
      const conflict = ['date', 'home', 'away', 'homeScore', 'awayScore', 'availableAt'].some(k => old[k] !== g[k]) || JSON.stringify(old.regulation) !== JSON.stringify(g.regulation);
      if (conflict) conflicts.add(g.id);
      excluded.push({ index: old.originalIndex, id: old.id, date: old.date, reason: conflict ? 'conflicting duplicate' : 'identical duplicate' });
    }
    unique.set(g.id, g);
  }
  const window = [...unique.values()].filter(g => {
    if (conflicts.has(g.id)) { excluded.push({ index: g.originalIndex, id: g.id, reason: 'conflicting duplicate' }); return false; } return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const rows = regulationPriorRows(window);
  for (const g of window) if (!rows.some(r => r.id === g.id)) excluded.push({ index: g.originalIndex, id: g.id, date: g.date, reason: 'regulation scoring not established' });
  return { rows, window, excluded };
}
function calculations(game, rows, result) {
  const c = result.inputs.weights, cutoff = result.inputs.cutoff;
  const leagueRows = rows.map(g => {
    const ageDays = (Date.parse(cutoff) - Date.parse(g.date)) / 86400000;
    const weight = Math.exp(-Math.LN2 * ageDays / c.halfLife);
    return { ...g, ageDays, weight, weightedMeanScore: weight * (g.homeScore + g.awayScore) / 2, weightedHomeMargin: weight * (g.homeScore - g.awayScore) };
  });
  const mass = sum(leagueRows.map(g => g.weight)), weightedMeanScore = sum(leagueRows.map(g => g.weightedMeanScore));
  const leagueNumerator = 40 * c.mean + weightedMeanScore, leagueDenominator = 40 + mass, leagueMean = leagueNumerator / leagueDenominator;
  const weightedHomeMargin = sum(leagueRows.map(g => g.weightedHomeMargin)), homeRaw = weightedHomeMargin / (mass + 80);
  const homeAdvantage = clamp(homeRaw, -c.mean * .08, c.mean * .08), teams = {};
  near(leagueMean, result.inputs.leagueMean, 'league mean'); near(homeAdvantage, result.inputs.homeAdvantage, 'venue');
  for (const output of result.teams) {
    const team = game.teams.find(g => g.homeAway === output.side), id = result.sport === 'nfl' ? team.abbreviation : team.id;
    const sample = leagueRows.filter(g => g.home === id || g.away === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, c.limit).map(g => {
      const venue = (g.home === id ? 1 : -1) * homeAdvantage / 2, scored = g.home === id ? g.homeScore : g.awayScore, allowed = g.home === id ? g.awayScore : g.homeScore;
      return { ...g, venue, scored, allowed, adjustedScored: scored - venue, adjustedAllowed: allowed + venue,
        weightedScored: g.weight * (scored - venue), weightedAllowed: g.weight * (allowed + venue) };
    });
    const mass = sum(sample.map(g => g.weight)), denominator = c.shrink + mass, pseudoScore = c.shrink * leagueMean;
    const weightedScoredSum = sum(sample.map(g => g.weightedScored)), weightedAllowedSum = sum(sample.map(g => g.weightedAllowed));
    const offenseNumerator = pseudoScore + weightedScoredSum, defenseNumerator = pseudoScore + weightedAllowedSum;
    const offense = offenseNumerator / denominator, defense = defenseNumerator / denominator;
    for (const g of sample) g.weightedSquaredResidual = g.weight * (g.adjustedScored - offense) ** 2;
    const pseudoVariance = c.shrink * c.sd ** 2, squaredResidualSum = sum(sample.map(g => g.weightedSquaredResidual));
    const varianceNumerator = pseudoVariance + squaredResidualSum, variance = varianceNumerator / denominator;
    near(offense, output.inputs.offense, 'offense'); near(variance, output.inputs.scoreVariance, 'variance');
    const selected = new Set(sample.map(g => g.id));
    teams[output.side] = { id, sample, selection: leagueRows.map(g => ({ id: g.id, reason: selected.has(g.id) ? 'selected in most recent team sample' : g.home === id || g.away === id ? 'beyond team game limit; still used in league/venue prior' : 'other teams; used in league/venue prior only' })),
      mass, denominator, pseudoScore, weightedScoredSum, weightedAllowedSum, offenseNumerator, defenseNumerator, offense, defense,
      pseudoVariance, squaredResidualSum, varianceNumerator, variance, historyWeight: mass / denominator, leagueWeight: c.shrink / denominator };
  }
  for (const side of ['away', 'home']) {
    const t = teams[side], opponent = teams[side === 'away' ? 'home' : 'away'];
    t.offenseContribution = t.offense / 2; t.defenseContribution = opponent.defense / 2;
    t.venueContribution = game.neutralSite === true ? 0 : (side === 'home' ? 1 : -1) * homeAdvantage / 2;
    t.rawExpected = t.offenseContribution + t.defenseContribution + t.venueContribution;
    t.bounds = [.45 * leagueMean, 1.65 * leagueMean]; t.expected = clamp(t.rawExpected, ...t.bounds); t.clampAdjustment = t.expected - t.rawExpected;
    near(t.expected, result.teams.find(t => t.side === side).inputs.expected, 'expected');
  }
  return { leagueRows, mass, pseudoMass: 40, pseudoScore: 40 * c.mean, weightedMeanScore, leagueNumerator, leagueDenominator, leagueMean,
    weightedHomeMargin, homeDenominator: mass + 80, homeRaw, homeBounds: [-c.mean * .08, c.mean * .08], homeAdvantage, teams };
}
function replayDraws(result, game, prior) {
  const rng = randomGenerator(`${SIMULATION_RANDOM_VERSION}:${result.seed}`), all = [], first = { uniforms: [], steps: [] };
  let tracing = true, continuation = 0;
  const draw = () => { const u = rng(); if (tracing) first.uniforms.push(u); return u; };
  const note = x => { if (tracing) first.steps.push(x); };
  const normal = (side, mean, variance, period) => {
    const u1 = draw(), u2 = draw(), z = Math.sqrt(-2 * Math.log(Math.max(1e-12, u1))) * Math.cos(2 * Math.PI * u2);
    const rawScore = mean + z * Math.sqrt(variance), score = Math.max(0, Math.round(rawScore));
    note({ side, period, u1, u2, z, mean, variance, rawScore, score }); return score;
  };
  for (let i = 0; i < result.simulations; i++) {
    tracing = i === 0; let scores = [0, 0], overtime = false;
    if (result.sport === 'nfl') for (const [j, side] of ['away', 'home'].entries()) {
      const lambda = prior.teams[side].expected / 5.73, threshold = Math.exp(-Math.max(0, lambda)); let product = 1, k = 0;
      const poissonUniforms = []; do { k++; const u = draw(); product *= u; if (tracing) poissonUniforms.push({ u, product }); } while (product > threshold && k < 500);
      const events = []; for (let n = k - 1; n > 0; n--) { const u = draw(), points = u < .02 ? 2 : u < .32 ? 3 : u < .36 ? 6 : u < .93 ? 7 : 8; scores[j] += points; if (tracing) events.push({ u, points }); }
      note({ side, lambda, threshold, poissonUniforms, eventCount: k - 1, events, score: scores[j] });
    } else if (result.sport !== 'mlb') {
      scores = ['away', 'home'].map(side => normal(side, prior.teams[side].expected, prior.teams[side].variance, 'regulation'));
      overtime = scores[0] === scores[1];
      for (let ot = 0; scores[0] === scores[1] && ot < 100; ot++) for (const [j, side] of ['away', 'home'].entries()) {
        const f = 300 / prior.config.duration; scores[j] += normal(side, prior.teams[side].expected * f, prior.teams[side].variance * f, 'OT ' + (ot + 1));
      }
      assert.notEqual(scores[0], scores[1]);
    } else {
      const runner = automaticRunnerEligible(game);
      innings: for (let inning = 1; inning <= 100; inning++) {
        for (const [j, side] of ['away', 'home'].entries()) {
          if (j === 1 && inning >= 9 && scores[1] > scores[0]) { note({ inning, side, skipped: true, scores: [...scores] }); overtime = inning > 9; break innings; }
          const halfMean = prior.teams[side].expected / 9, p = 1 / (1 + halfMean / 3), outs = [];
          let runs = 0; for (let out = 0; out < 3; out++) { const u = draw(), n = Math.floor(Math.log(Math.max(1e-12, u)) / Math.log(1 - p)); runs += n; outs.push({ u, runs: n }); }
          const runnerDraw = inning > 9 && runner ? draw() : null, bonus = runnerDraw !== null && runnerDraw < .48 ? 1 : 0;
          runs += bonus; const recorded = inning >= 9 && j === 1 ? Math.min(runs, Math.max(0, scores[0] - scores[1] + 1)) : runs;
          scores[j] += recorded; note({ inning, side, halfMean, p, outs, runnerDraw, bonus, sampledRuns: runs, recordedRuns: recorded, scores: [...scores] });
        }
        if (inning >= 9 && scores[0] !== scores[1]) { overtime = inning > 9; break; }
        assert.ok(inning < 100);
      }
    }
    if (result.sport === 'nfl') overtime = scores[0] === scores[1];
    if (tracing) { first.scores = scores; first.continuation = overtime; }
    continuation += Number(overtime); all.push(scores);
  }
  const pmf = xs => [...xs.reduce((m, n) => m.set(n, (m.get(n) || 0) + 1), new Map())].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count, probability: count / xs.length }));
  for (const [j, t] of result.teams.entries()) assert.deepEqual(pmf(all.map(s => s[j])), t.score.pmf);
  assert.deepEqual(pmf(all.map(s => s[0] + s[1])), result.total.pmf); assert.deepEqual(pmf(all.map(s => s[1] - s[0])), result.homeMargin.pmf);
  near(continuation / result.simulations, result.probabilities.overtime, 'continuation');
  const counts = { home: all.filter(([a, h]) => h > a).length, away: all.filter(([a, h]) => a > h).length, tie: all.filter(([a, h]) => a === h).length, continuation };
  for (const k of ['home', 'away', 'tie']) near(counts[k] / result.simulations, result.probabilities[k], k);
  return { first, counts, allDistributionsMatchEngine: true };
}
const reports = [];
for (const q of cases) {
  const reads = new Map();
  const provider = { async read(url) {
    const relative = 'http/' + hash(url) + '.json';
    let original;
    if (capture) for (const dir of ['data-independent/mlb/sports/raw', 'data-independent/mlb/raw']) {
      const candidate = path.join(dir, hash(url) + '.json'); try { await fs.access(candidate); original = candidate; break; } catch {}
    }
    const bytes = await stored(relative, original), r = JSON.parse(bytes); assert.equal(r.url, url);
    reads.set(url, r); return r;
  } };
  const store = new SimulationStore({ provider, nflProvider, now: () => Date.parse('2026-09-23T04:00:00Z') });
  const catalog = await store.catalog(q), game = catalog.events.find(g => g.id === q.game); assert.ok(game, 'Missing selected game');
  const result = await store.run({ ...q, seed: 'final-deep-audit', simulations: 10000 }); assert.equal(result.status, 'experimental', result.warnings.join('; '));
  if (!capture) {
    const saved = JSON.parse(await fs.readFile(path.join(root, q.sport + '-example.json'), 'utf8'));
    assert.deepEqual(result, saved.result, 'Stored example output changed: ' + q.sport);
  }
  let history;
  if (q.sport === 'nfl') history = simulationNflHistory(schedule, (await readNflRegulation(sourceRoot, [2025, 2026])).index);
  else if (q.sport === 'mlb') history = simulationMlbHistory([...reads.values()].find(r => r.url.includes('startDate=')).payload.dates.flatMap(d => d.games || []));
  else {
    const events = [...reads.values()].filter(r => r.url.includes('/schedule?')).flatMap(r => r.payload.events.map(e => ({ ...e, season: { ...e.season, type: e.season?.type || Number(new URL(r.url).searchParams.get('seasontype')) } })));
    history = simulationBasketballHistory(events.map(e => {
      const summary = [...reads.values()].find(r => r.url.includes('/summary?event=' + e.id));
      return summary?.payload.header?.id === e.id ? { ...e, competitions: summary.payload.header.competitions } : e;
    }));
  }
  const pure = simulateGame({ sport: q.sport, game, history, seed: result.seed, simulations: result.simulations, sources: result.sources });
  assert.equal(pure.inputDigest, result.inputDigest); assert.deepEqual(pure.total, result.total);
  const filtered = filterHistory(history, game); assert.equal(filtered.rows.length, result.scoreBasis.included); assert.equal(filtered.window.length, result.scoreBasis.eligible);
  const calc = calculations(game, filtered.rows, result), prior = buildGamePrior({ sport: q.sport, game, history: filtered.rows });
  if (game.neutralSite === true) for (const side of ['away', 'home']) prior.teams[side].expected = calc.teams[side].expected;
  const replay = replayDraws(result, game, prior), markets = [];
  if (result.marketComparison.available) for (const [type, line] of [['moneyline', 0], ['spread', -3.5], ['total', q.sport === 'nba' ? 220.5 : 160.5]]) markets.push(compareSimulationMarket(result, { type, line, firstOdds: -110, secondOdds: -110 }));
  const benchmark = [];
  for (const simulations of [1000, 10000, 25000, 50000]) {
    const times = []; for (let repeat = 0; repeat < 5; repeat++) { const start = performance.now(); simulateGame({ sport: q.sport, game, history, seed: 'benchmark', simulations }); times.push(performance.now() - start); }
    benchmark.push({ simulations, milliseconds: times, medianMs: [...times].sort((a, b) => a - b)[2] });
  }
  const report = { query: q, game, cacheMode: 'Offline stored-byte reconstruction. Original fetched/check times retained; no claim of current source freshness or pregame publication.',
    sourceFiles: [...reads].map(([url]) => ({ url, file: 'sources/http/' + hash(url) + '.json' })), history,
    filtering: { rawNormalizedRows: history.length, included: filtered.rows.map(g => g.id), excluded: filtered.excluded, window: filtered.window.length },
    calculations: calc, replay, result, illustrativeMarkets: markets, marketNotice: 'Fixed illustrative -110/-110 paired prices, not observed bookmaker quotes.', benchmark };
  await fs.writeFile(path.join(root, q.sport + '-example.json'), JSON.stringify(report, null, 2) + '\n');
  reports.push({ sport: q.sport, teams: game.teams.map(t => t.name), date: q.date, count: result.simulations, seed: result.seed, scoreBasis: result.scoreBasis, first: replay.first.scores, counts: replay.counts,
    scores: result.teams.map(t => ({ side: t.side, mean: t.score.mean, median: t.score.median, p10: t.score.p10, p90: t.score.p90 })), total: { ...result.total, pmf: undefined }, margin: { ...result.homeMargin, pmf: undefined }, benchmark });
  console.log(q.sport, 'verified: actual store, all prior calculations and 10,000 seeded draws');
}
if (capture) await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root, 'examples-summary.json'), JSON.stringify(reports, null, 2) + '\n');
console.log('All four examples reproduced. Source files:', Object.keys(manifest).length);
