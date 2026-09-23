// Diagnostic only: corrected historical play-by-play, not timestamped book odds.
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { nflGameHistory, projectLiveGame } from '../lib/live-game-model.mjs';
const season = Number(process.argv[2] || 2025);
const read = async (name, fields) => parse(gunzipSync(await fs.readFile(new URL('../data-independent/raw/' + name, import.meta.url))), { columns: keys => keys.map(k => !fields || fields.has(k) ? k : false), skip_empty_lines: true });
const schedule = await read('games.csv.gz'), history = nflGameHistory(schedule);
const fields = new Set(['game_id', 'game_date', 'home_team', 'away_team', 'game_seconds_remaining', 'qtr', 'posteam', 'total_home_score', 'total_away_score', 'season_type', 'play_id']);
const plays = await read(`play_by_play_${season}.csv.gz`, fields);
const checkpoints = new Map();
for (const p of plays) {
  if (!p.game_seconds_remaining || !p.total_home_score || !p.total_away_score || Number(p.qtr) > 4) continue;
  const remaining = Number(p.game_seconds_remaining);
  for (const mark of [2700, 1800, 900]) if (remaining <= mark && remaining > mark - 90) {
    const key = p.game_id + ':' + mark;
    if (!checkpoints.has(key)) checkpoints.set(key, { p, mark });
  }
}
const rows = [];
for (const { p, mark } of checkpoints.values()) {
  const final = history.find(g => g.id === p.game_id);
  if (!final?.complete || final.homeScore === final.awayScore) continue;
  const game = { id: p.game_id, date: p.game_date + 'T20:00:00Z', state: 'in', sport: 'nfl', postseason: p.season_type === 'POST', period: Number(p.qtr), remainingSeconds: Number(p.game_seconds_remaining), possession: p.posteam,
    teams: [{ id: p.away_team, abbreviation: p.away_team, homeAway: 'away', score: Number(p.total_away_score) }, { id: p.home_team, abbreviation: p.home_team, homeAway: 'home', score: Number(p.total_home_score) }] };
  const result = projectLiveGame({ sport: 'nfl', game, history, simulations: 2000 });
  if (result.status !== 'experimental') continue;
  const probability = result.teams[1].conditionalProbability, won = Number(final.homeScore > final.awayScore);
  const lead = game.teams[1].score - game.teams[0].score;
  const baseline = 1 / (1 + Math.exp(-lead / (8 * Math.sqrt(game.remainingSeconds / 3600))));
  rows.push({ game: p.game_id, mark, probability, won, brier: (probability - won) ** 2, baselineBrier: (baseline - won) ** 2, logLoss: -(won * Math.log(probability) + (1 - won) * Math.log(1 - probability)), totalError: result.projectedTotal - final.homeScore - final.awayScore });
}
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const metrics = xs => ({ snapshots: xs.length, games: new Set(xs.map(r => r.game)).size, brier: mean(xs.map(r => r.brier)), scoreClockBaselineBrier: mean(xs.map(r => r.baselineBrier)), logLoss: mean(xs.map(r => r.logLoss)), totalMAE: mean(xs.map(r => Math.abs(r.totalError))) });
const report = { season, version: 'live-game-distribution-v1', kind: 'Retrospective diagnostic; corrected data, correlated checkpoints, no sportsbook odds or betting-return claims', ...metrics(rows), checkpoints: Object.fromEntries([2700, 1800, 900].map(m => [m, metrics(rows.filter(r => r.mark === m))])), calibration: Array.from({ length: 5 }, (_, i) => { const xs = rows.filter(r => r.probability >= i / 5 && r.probability < (i + 1) / 5); return { bin: `${i * 20}–${(i + 1) * 20}%`, n: xs.length, predicted: mean(xs.map(r => r.probability)), actual: mean(xs.map(r => r.won)) }; }) };
await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await fs.writeFile(new URL(`../reports/live-game-${season}.json`, import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
