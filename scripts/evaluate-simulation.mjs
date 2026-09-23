// Offline, frozen chronological diagnostic. No fit/tuning occurs on these periods.
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { DATA_DIR } from '../lib/providers.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GAME_MODEL_VERSION } from '../lib/live-game-model.mjs';
import { simulationNflHistory, regulationPriorRows } from '../lib/simulation-history.mjs';
import { readNflRegulation } from '../lib/simulation-nfl-data.mjs';
import { simulateGame, SIMULATION_VERSION, SIMULATION_RANDOM_VERSION } from '../lib/game-simulation.mjs';
import { evaluationRow, evaluationMetrics, calibrationBuckets, compactSimulationEvidence } from '../lib/simulation-evaluation.mjs';

const codeFiles = ['lib/game-simulation.mjs', 'lib/simulation-history.mjs', 'lib/simulation-nfl-data.mjs', 'lib/simulation-rules.mjs', 'lib/live-game-model.mjs', 'lib/sports/normalize.mjs', 'lib/simulation-evaluation.mjs', 'scripts/evaluate-simulation.mjs'];
const codeSha256 = Object.fromEntries(await Promise.all(codeFiles.map(async file => [file, createHash('sha256').update(await fs.readFile(new URL('../' + file, import.meta.url))).digest('hex')])));

const bytes = await fs.readFile(path.join(DATA_DIR, 'raw', 'games.csv.gz'));
const schedule = parse(gunzipSync(bytes), { columns: true, skip_empty_lines: true });
const regulationData = await readNflRegulation(DATA_DIR, [2022, 2023, 2024, 2025]);
const history = simulationNflHistory(schedule, regulationData.index), byId = new Map(schedule.map(g => [g.game_id, g]));
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
const scheduleMeta = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'raw', 'games.csv.gz.meta.json'), 'utf8'));
const sourceReceipts = [{ localFile: 'raw/games.csv.gz', url: scheduleMeta.url, sha256: sourceSha256,
  fetchedAt: scheduleMeta.sha256 === sourceSha256 ? scheduleMeta.fetchedAt : null, publicationTiming: 'retrospective; not a pregame snapshot' }, ...regulationData.sources];
const publication = { status: 'NOT VERIFIED', mode: 'retrospective reconstruction', faithfulEvaluatedGames: 0,
  provenPregameInputRows: 0, reason: 'Receipts identify later downloaded/corrected bytes. No immutable pregame snapshots or row-level publication ledger exist for these inputs. Faithful mode excludes all of them.' };
const holdout = { status: 'NOT VERIFIED', message: 'untouched holdout not verified', periods: [2023, 2024, 2025], prospectiveSimulationArchive: false,
  perSport: { nfl: 'inspected retrospective regulation diagnostics only', nba: 'no evaluation of this engine', wnba: 'no evaluation of this engine', mlb: 'no evaluation of this engine' } };
if (process.argv.includes('--faithful')) {
  await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../reports/simulation-faithful-evaluation.json', import.meta.url), JSON.stringify({ publication, holdout, evaluatedGames: 0, codeSha256, sourceReceipts }, null, 2));
  console.log('Faithful historical evaluation withheld: 0 games; no publication-proven pregame input snapshots.');
  process.exit(0);
}
const protocolLock = { codeSha256, sourceSha256, dataSha256: Object.fromEntries(sourceReceipts.map(r => [r.localFile, r.sha256])),
  outcomeScope: 'regulation-only', seasons: [2023, 2024, 2025], baselineSeason: 2022, simulations: 2000, seedPattern: 'evaluation:<game-id>',
  purpose: 'Frozen reproduction of already inspected retrospective diagnostics; not an untouched holdout. No coefficients or calibration are fitted.' };
if (process.argv.includes('--lock-inputs')) {
  await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../reports/simulation-protocol-lock.json', import.meta.url), JSON.stringify(protocolLock, null, 2));
  console.log('Code/data/protocol hashes recorded before replay.'); process.exit(0);
}
if (process.argv.includes('--verify-lock')) assert.deepEqual(protocolLock, JSON.parse(await fs.readFile(new URL('../reports/simulation-protocol-lock.json', import.meta.url), 'utf8')));
const warmup = regulationPriorRows(history.filter(g => g.complete && byId.get(g.id).season === '2022'));
if (warmup.length < 200) throw Error('At least 200 completed 2022 games are required for the frozen baseline.');
const baseline = Object.fromEntries(['home', 'away', 'tie'].map(side => [side, (1 + warmup.filter(g => side === 'home' ? g.homeScore > g.awayScore : side === 'away' ? g.awayScore > g.homeScore : g.homeScore === g.awayScore).length) / (warmup.length + 3)]));
const gameFor = g => ({ id: g.id, date: g.date, season: Number(byId.get(g.id).season), state: 'post', postseason: byId.get(g.id).game_type !== 'REG', neutralSite: byId.get(g.id).location === 'Neutral',
  teams: ['away', 'home'].map(side => ({ id: g[side], abbreviation: g[side], homeAway: side })) });
const phases = {}, rows = [], withheld = [], forecasts = [];
for (const [phase, season] of [['calibrationDiagnostic', '2023'], ['validation', '2024'], ['finalEvaluation', '2025']]) {
  for (const game of history.filter(g => g.complete && byId.get(g.id).season === season).sort((a, b) => a.date.localeCompare(b.date))) {
    if (!game.regulation) { withheld.push({ id: game.id, warnings: ['Regulation outcome unavailable; final score cannot substitute.'] }); continue; }
    const result = simulateGame({ sport: 'nfl', game: gameFor(game), history, simulations: 2000, seed: 'evaluation:' + game.id });
    if (result.status !== 'experimental') { withheld.push({ id: game.id, warnings: result.warnings }); continue; }
    const usedHistory = regulationPriorRows(history.filter(g => g.complete && g.date < game.date && Date.parse(game.date) - Date.parse(g.date) < 450 * 86400000));
    forecasts.push({ id: game.id, phase, cutoff: result.inputs.cutoff, inputDigest: result.inputDigest, seed: result.seed, simulations: result.simulations,
      publicationStatus: 'not proven', inputIds: usedHistory.map(g => g.id).sort(), sourceHashes: sourceReceipts.map(r => r.sha256), scoreBasis: result.scoreBasis });
    rows.push({ ...evaluationRow(result, { ...game, ...game.regulation, scoreBasis: 'regulation', season }, baseline), phase,
      finalResult: { homeScore: game.homeScore, awayScore: game.awayScore, winner: game.homeScore > game.awayScore ? 'home' : game.homeScore < game.awayScore ? 'away' : 'tie' },
      regulationOutcome: game.regulation, finalProbabilityEvaluation: 'withheld; no NFL continuation model' });
  }
  const selected = rows.filter(r => r.phase === phase);
  if (selected.length < 200) throw Error(`Incomplete ${season} evaluation data: only ${selected.length} forecasts available.`);
  phases[phase] = { season, ...evaluationMetrics(selected), calibration: calibrationBuckets(selected) };
  console.log(`${phase}: ${selected.length} games, home Brier ${phases[phase].homeBrier?.toFixed(4)}, baseline ${phases[phase].baselineHomeBrier?.toFixed(4)}`);
}
const final = rows.filter(r => r.phase === 'finalEvaluation'), representative = history.find(g => g.complete && byId.get(g.id).season === '2025');
const benchmarks = [];
for (const simulations of [1000, 10000, 50000]) {
  const times = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = performance.now(); simulateGame({ sport: 'nfl', game: gameFor(representative), history, simulations, seed: 'benchmark' }); times.push(performance.now() - start);
  }
  benchmarks.push({ simulations, milliseconds: times.map(v => Math.round(v * 10) / 10), medianMs: times.sort((a, b) => a - b)[1] });
}
const report = { version: SIMULATION_VERSION, randomVersion: SIMULATION_RANDOM_VERSION, priorVersion: GAME_MODEL_VERSION, codeSha256, generatedAt: new Date().toISOString(), sport: 'nfl', sourceSha256, sourceReceipts, publication, holdout, outcomeScope: 'regulation-only',
  status: 'experimental', protocol: 'Retrospective regulation-only reconstruction with inherited parameters and no fitting routine. Reconstructed 2022 regulation baseline; 2023, 2024 and 2025 already-inspected diagnostics (legacy phase keys retained). Earlier observed results update rolling regulation histories, never same-day or future results. No final NFL probabilities or prospectively untouched holdout.',
  limitations: ['Corrected historical schedules are not immutable pregame snapshots.', 'This evaluation cannot establish historical player availability or odds.', 'No pre-registered parameter freeze or untouched final holdout can be established from this repository.', 'Confidence intervals use an approximate game-level standard error; team and week dependence is not modeled.', 'Other sports have no league-wide holdout evaluation for this new simulation.', 'No profitability or reliable predictive-use claim is established by this report.'],
  baseline: { method: '2022 regulation home-lead/away-lead/tie frequencies with one pseudocount per outcome; no fitting on 2023–2025', n: warmup.length, probabilities: baseline }, phases,
  finalSegments: { homeFavorites: evaluationMetrics(final.filter(r => r.homeFavorite)), homeUnderdogs: evaluationMetrics(final.filter(r => !r.homeFavorite)), limitedHistory: evaluationMetrics(final.filter(r => r.limitedHistory)), sufficientHistory: evaluationMetrics(final.filter(r => !r.limitedHistory)),
    teams: Object.fromEntries([...new Set(final.flatMap(r => [r.home, r.away]))].sort().map(team => [team, evaluationMetrics(final.filter(r => r.home === team || r.away === team))])) }, withheld, benchmarks, forecasts, rows };
await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../reports/simulation-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));
const artifactUrl = new URL('../lib/artifacts/simulation-validation.json', import.meta.url);
if (process.argv.includes('--write-artifact')) await fs.writeFile(artifactUrl, JSON.stringify(compactSimulationEvidence(report), null, 2) + '\n');
if (process.argv.includes('--verify-artifact')) {
  assert.deepEqual(compactSimulationEvidence(report), JSON.parse(await fs.readFile(artifactUrl, 'utf8')));
  console.log('Shipped evidence reproduced exactly, including source and code hashes.');
}
console.log(JSON.stringify({ final: phases.finalEvaluation, withheld: withheld.length, benchmarks }, null, 2));
