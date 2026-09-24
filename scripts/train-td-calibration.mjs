import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Provider } from '../lib/providers.mjs';
import { buildPlayers, buildRates, prepareData, number } from '../lib/model.mjs';
import { calibratedTdProbability, fitTdCalibration, tdProbabilityMetrics } from '../lib/td-calibration.mjs';

// Train from local public-source caches. This script never reads the reference app's predictions.
const provider = new Provider({ fetcher: async () => { throw Error('Use cached public datasets for reproducible training.'); } });
const specs = [['schedule', null], ...[2024, 2025, 2026].flatMap(y => ['pbp', 'weekly', 'roster', 'weeklyRoster', 'snaps'].map(type => [type, y]))];
const datasets = await Promise.all(specs.map(async ([type, year]) => ({ type, year, ...await provider.load(type, year) })));
const get = type => datasets.filter(d => d.type === type).flatMap(d => d.rows);
const rosters = [...get('roster'), ...get('weeklyRoster')];
const games = prepareData({ schedule: get('schedule'), pbp: get('pbp'), weekly: get('weekly'), rosters, snaps: get('snaps'), chart: [] });
const rates = new Map([[2024, buildRates([])], [2025, buildRates(get('pbp').filter(p => Number(p.season) === 2024 && games.get(p.game_id)?.complete))], [2026, buildRates(get('pbp').filter(p => Number(p.season) === 2025 && games.get(p.game_id)?.complete))]]);
const rows = [];
for (const [season, first, last] of [[2024, 6, 18], [2025, 1, 18], [2026, 1, 2]]) {
  for (let week = first; week <= last; week++) {
    const board = buildPlayers({ games, rosters, season, week, market: 'any_td', rates: rates.get(season), trainingSeason: season - 1 });
    for (const player of board) {
      const game = games.get(player.gameId), result = game?.players.get(player.playerId);
      if (!game?.complete || player.details.sample.length < 5 || player.result.status !== 'final' || !result) continue;
      const rushing = number(result.rushing_tds), receiving = number(result.receiving_tds);
      if (rushing === null || receiving === null || !Number.isFinite(player.modelScore)) continue;
      rows.push({ season, week, gameId: player.gameId, playerId: player.playerId, position: player.position, score: player.modelScore, outcome: Number(rushing + receiving > 0), poisson: player.tdProb });
    }
  }
  console.log(`${season}: ${rows.filter(r => r.season === season).length} eligible outcomes`);
}
const train = rows.filter(r => r.season === 2024), validation = rows.filter(r => r.season === 2025), holdout = rows.filter(r => r.season === 2026);
if (train.length < 500 || validation.length < 500 || holdout.length < 100) throw Error('Insufficient cached chronological outcomes for TD calibration and evaluation.');
const scoreModel = fitTdCalibration(train), positionModel = fitTdCalibration(train, { withPosition: true });
const validationScore = tdProbabilityMetrics(validation, r => calibratedTdProbability(r.score, r.position, scoreModel, 2025));
const validationPosition = tdProbabilityMetrics(validation, r => calibratedTdProbability(r.score, r.position, positionModel, 2025));
const validationPoisson = tdProbabilityMetrics(validation, r => r.poisson);
// Add position only when it meaningfully improves the untouched validation year.
const withPosition = validationPosition.brier + .001 < validationScore.brier && validationPosition.logLoss <= validationScore.logLoss;
const artifact = fitTdCalibration(rows.filter(r => r.season <= 2025), { withPosition });
artifact.opponentWindow = 8;
artifact.droughtBonus = false;
artifact.id = createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
const holdoutCalibrated = tdProbabilityMetrics(holdout, r => calibratedTdProbability(r.score, r.position, artifact, 2026));
const holdoutPoisson = tdProbabilityMetrics(holdout, r => r.poisson);
const report = {
  version: artifact.version, artifactId: artifact.id, generatedAt: new Date().toISOString(),
  split: { training: 2024, validation: 2025, finalTraining: [2024, 2025], earlyHoldout: '2026 weeks 1–2' },
  selection: { rule: 'Position terms require ≥0.001 lower 2025 Brier and no higher log loss.', withPosition, validationScore, validationPosition, validationPoisson },
  earlyHoldout: { calibrated: holdoutCalibrated, poisson: holdoutPoisson },
  sources: datasets.map(d => ({ type: d.type, season: d.year, url: d.meta.url, sha256: d.meta.sha256, fetchedAt: d.meta.fetchedAt })),
  limitations: [
    'Historical boards are reconstructed from revised public datasets, not frozen pregame snapshots.',
    'Historical schedule spreads and totals may be closing lines; their exact pregame availability is unverified.',
    'The evaluation is conditional on a completed game and recorded offensive participation, not an unconditional active-roster forecast.',
    'The outcome is a rushing or receiving touchdown, excluding special-teams and rare fumble-recovery touchdowns.',
    'Early 2026 has only two completed weeks and is a small, previously observable test; more prospective weeks are needed.',
    'No reference-app outputs, displayed percentages, or private data are used for fitting.'
  ]
};
await fs.writeFile(new URL('../lib/artifacts/nfl-td-calibration.json', import.meta.url), JSON.stringify(artifact, null, 2) + '\n');
await fs.writeFile(new URL('../lib/artifacts/nfl-td-calibration-evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ artifactId: artifact.id, trainingCount: artifact.trainingCount, withPosition, validation: { score: validationScore.brier, position: validationPosition.brier, poisson: validationPoisson.brier }, earlyHoldout: { calibrated: holdoutCalibrated.brier, poisson: holdoutPoisson.brier, n: holdoutCalibrated.n } }, null, 2));
