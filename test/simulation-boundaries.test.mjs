import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationNflHistory, nflRegulationIndex, simulationBasketballHistory, mlbRegulationHistory, regulationPriorRows } from '../lib/simulation-history.mjs';
import { simulateGame, compareSimulationMarket } from '../lib/game-simulation.mjs';
import { startNflOvertime, stepNflOvertime, nflOvertimeRules, automaticRunnerEligible, settleMlbScoringPlay, skipBottom } from '../lib/simulation-rules.mjs';
import { evaluationRow } from '../lib/simulation-evaluation.mjs';

const game = { id: 'target', date: '2025-03-01', season: 2025, state: 'pre', postseason: false, neutralSite: true,
  teams: [{ id: 'A', abbreviation: 'A', homeAway: 'home' }, { id: 'B', abbreviation: 'B', homeAway: 'away' }] };
const nfl = (extra = {}) => ({ game_id: 'ot', gameday: '2025-01-01', season: '2024', game_type: 'REG', home_team: 'A', away_team: 'B', home_score: '27', away_score: '24', overtime: '1', ...extra });
const plays = [
  { game_id: 'ot', play_id: '1', qtr: '4', quarter_seconds_remaining: '0', total_home_score: '21', total_away_score: '21' },
  { game_id: 'ot', play_id: '2', qtr: '5', quarter_seconds_remaining: '0', total_home_score: '27', total_away_score: '24' },
];
const rawHistory = () => Array.from({ length: 20 }, (_, i) => nfl({ game_id: String(i), gameday: `2025-01-${String(i + 1).padStart(2, '0')}`, overtime: '0' }));
const run = history => simulateGame({ sport: 'nfl', game, history, seed: 'boundary', simulations: 1000 });

test('NFL end-of-fourth extraction excludes OT from offense, allowed, league, venue and variance', () => {
  const r = simulationNflHistory([nfl()], nflRegulationIndex(plays))[0];
  assert.equal(r.homeScore, 27); assert.equal(r.awayScore, 24); // Final truth retained.
  assert.deepEqual([r.regulation.homeScore, r.regulation.awayScore], [21, 21]);
  const history = [...simulationNflHistory(rawHistory()), r];
  const a = run(history), b = run(history.map(x => x.id === 'ot' ? { ...x, homeScore: 60, awayScore: 54 } : x));
  assert.deepEqual(a.teams, b.teams); assert.deepEqual(a.total, b.total);
  assert.equal(a.inputs.leagueMean, b.inputs.leagueMean);
  assert.equal(a.inputs.homeAdvantage, b.inputs.homeAdvantage);
  assert.equal(a.scoreBasis.continuationRemoved, 1);
});

test('unknown, inconsistent or missing regulation rows never fall back to final scores', () => {
  assert.equal(regulationPriorRows(simulationNflHistory([nfl()])).length, 0);
  assert.equal(regulationPriorRows(simulationNflHistory([nfl({ overtime: '' })])).length, 0);
  assert.equal(nflRegulationIndex(plays.map(p => ({ ...p, total_away_score: '20' }))).size, 0);
  assert.equal(regulationPriorRows([{ homeScore: 7, awayScore: 3, regulation: { homeScore: 10, awayScore: 3, method: 'bad' } }]).length, 0);
  const history = simulationNflHistory(rawHistory());
  assert.deepEqual(run([...history, ...simulationNflHistory([nfl()])]).teams, run(history).teams);
  assert.equal(run(simulationNflHistory([nfl()])).status, 'withheld');
});

const basketball = (period = 5) => ({ id: 'b', date: '2025-01-01', season: { type: 2 }, competitions: [{ status: { period, type: { completed: true } }, competitors:
  ['home', 'away'].map((homeAway, i) => ({ homeAway, team: { id: i ? 'B' : 'A' }, score: i ? '105' : '109', linescores: [25, 25, 25, 25, i ? 5 : 9].map(value => ({ value })) })) }] });
test('NBA/WNBA reconcile quarter sums and remove only continuation scoring', () => {
  const row = simulationBasketballHistory([basketball()])[0];
  assert.equal(row.homeScore, 109); assert.equal(row.regulation.homeScore, 100); assert.equal(row.regulation.awayScore, 100);
  const bad = basketball(); bad.competitions[0].competitors[0].linescores[4].value = 8;
  assert.equal(simulationBasketballHistory([bad])[0].regulation, undefined);
  const absent = basketball(); absent.competitions[0].competitors.forEach(t => delete t.linescores);
  assert.equal(simulationBasketballHistory([absent])[0].regulation, undefined);
  const summary = basketball(); delete summary.competitions[0].status.period;
  summary.competitions[0].competitors.forEach(t => { t.linescores = t.linescores.map(l => ({ displayValue: String(l.value) })); });
  assert.deepEqual(simulationBasketballHistory([summary])[0].regulation, row.regulation);
  for (const sport of ['nba', 'wnba']) {
    const history = Array.from({ length: 20 }, (_, i) => ({ ...row, id: String(i) }));
    const options = { sport, game, simulations: 1000, seed: sport };
    const a = simulateGame({ ...options, history });
    const b = simulateGame({ ...options, history: history.map(h => ({ ...h, homeScore: 125, awayScore: 121 })) });
    assert.deepEqual(a.teams, b.teams); assert.deepEqual(a.total, b.total);
    assert.equal(a.inputs.leagueMean, b.inputs.leagueMean);
  }
});

const mlb = () => ({ gamePk: 1, officialDate: '2025-01-01', gameType: 'R', scheduledInnings: 9, status: { abstractGameState: 'Final' },
  teams: { home: { team: { id: 'A' }, score: 7 }, away: { team: { id: 'B' }, score: 5 } },
  linescore: { innings: Array.from({ length: 10 }, (_, i) => ({ num: i + 1, home: { runs: i === 0 ? 4 : i === 9 ? 3 : 0 }, away: { runs: i === 0 ? 4 : i === 9 ? 1 : 0 } })) } });
test('MLB extra-inning runs are stripped consistently and mismatched linescores fail closed', () => {
  const raw = mlb(), row = mlbRegulationHistory([raw])[0];
  assert.deepEqual([row.homeScore, row.awayScore], [7, 5]);
  assert.deepEqual([row.regulation.homeScore, row.regulation.awayScore], [4, 4]);
  const histories = Array.from({ length: 20 }, (_, i) => ({ ...row, id: String(i) }));
  const options = { sport: 'mlb', game: { ...game, regularSeason: true, scheduledInnings: 9 }, simulations: 1000, seed: 'mlb' };
  const a = simulateGame({ ...options, history: histories });
  const b = simulateGame({ ...options, history: histories.map(h => ({ ...h, homeScore: 10, awayScore: 9 })) });
  assert.deepEqual(a.teams, b.teams); assert.deepEqual(a.total, b.total);
  assert.throws(() => compareSimulationMarket(a, { type: 'total', line: 8, firstOdds: -110, secondOdds: -110 }), /withheld/);
  raw.linescore.innings[9].home.runs = 4; assert.equal(mlbRegulationHistory([raw])[0].regulation, undefined);
  assert.equal(mlbRegulationHistory([{ ...mlb(), scheduledInnings: 7 }])[0].regulation, undefined);
});

const drive = (s, outcome, tryPoints, elapsedSeconds = 60) => stepNflOvertime(s, { type: 'possession', team: s.possession, outcome, tryPoints, elapsedSeconds });
const start = (season, postseason = false) => startNflOvertime({ season, postseason });
test('NFL era boundaries do not retroactively apply modern possession or clock rules', () => {
  for (const [year, post, mode, seconds] of [[2009, true, 'sudden-death', 900], [2010, true, 'modified-sudden-death', 900], [2011, false, 'sudden-death', 900], [2012, false, 'modified-sudden-death', 900], [2017, false, 'modified-sudden-death', 600], [2021, true, 'modified-sudden-death', 900], [2022, true, 'both-possessions', 900], [2024, false, 'modified-sudden-death', 600], [2025, false, 'both-possessions', 600], [2026, false, 'both-possessions', 600]]) {
    assert.equal(nflOvertimeRules(year, post).mode, mode); assert.equal(start(year, post).remaining, seconds);
  }
  assert.equal(nflOvertimeRules(2027, false), null);
});
test('NFL first-possession field goals, TDs and required reply follow the supplied era', () => {
  assert.equal(drive(start(2011), 'field-goal').ended, true);
  assert.equal(drive(start(2012), 'field-goal').ended, false);
  assert.equal(drive(start(2024), 'touchdown').ended, true);
  for (const [season, post] of [[2022, true], [2025, false]]) {
    const first = drive(start(season, post), 'touchdown', 1);
    assert.equal(first.ended, false); assert.equal(first.possession, 'away');
    assert.equal(drive(first, 'field-goal').winner, 'home');
    const tied = drive(first, 'touchdown', 1); assert.equal(tied.ended, false);
    assert.equal(drive(tied, 'field-goal').winner, 'home');
    assert.equal(drive(first, 'touchdown', 2).winner, 'away');
  }
  assert.equal(drive(drive(start(2025), 'no-score'), 'field-goal').winner, 'away');
});
test('NFL defensive scores and clock termination; postseason carries possession into next period', () => {
  for (const outcome of ['defensive-touchdown', 'safety']) assert.equal(drive(start(2025), outcome).winner, 'away');
  const fg = drive(start(2025), 'field-goal');
  assert.equal(stepNflOvertime(fg, { type: 'period-end', elapsedSeconds: fg.remaining }).winner, 'home');
  assert.equal(stepNflOvertime(start(2025), { type: 'period-end', elapsedSeconds: 600 }).winner, 'tie');
  const post = stepNflOvertime(start(2025, true), { type: 'period-end', elapsedSeconds: 900 });
  assert.equal(post.ended, false); assert.equal(post.possession, 'home'); assert.equal(post.period, 2);
  assert.throws(() => stepNflOvertime(post, { type: 'period-end', elapsedSeconds: 900 }), /unsupported kickoff/);
  assert.throws(() => drive(start(2025), 'onside-kick'), /Unsupported/);
  assert.throws(() => drive(start(2025), 'touchdown'), /try result/);
  assert.throws(() => drive(drive(start(2011), 'field-goal'), 'no-score'), /ended/);
});
test('MLB adjudicated single stops at the winning run, out-of-park HR counts all runners, bottom ninth can be skipped', () => {
  const base = { inning: 9, top: false, home: 4, away: 4 };
  assert.deepEqual(settleMlbScoringPlay({ ...base, event: 'ordinary', runs: 2 }), { home: 5, away: 4, ended: true, skipped: false });
  assert.deepEqual(settleMlbScoringPlay({ ...base, event: 'home-run-out-of-park', runs: 4, runnersOnBase: 3 }), { home: 8, away: 4, ended: true, skipped: false });
  assert.ok(skipBottom(9, 5, 4)); assert.ok(!skipBottom(8, 5, 4));
  assert.equal(settleMlbScoringPlay({ ...base, home: 5, event: 'ordinary', runs: 3 }).home, 5);
  assert.throws(() => settleMlbScoringPlay({ ...base, event: 'aggregate', runs: 3 }), /Verified/);
});
test('MLB automatic runner eligibility is league, season, format and game-type specific', () => {
  assert.equal(automaticRunnerEligible({ season: 2019, regularSeason: true }), false);
  for (const season of [2020, 2021, 2022, 2023, 2026]) {
    assert.equal(automaticRunnerEligible({ season, regularSeason: true }), true);
    assert.equal(automaticRunnerEligible({ season, regularSeason: false }), false);
  }
  for (const extra of [{ sport: 'milb' }, { season: 2027 }, { scheduledInnings: 7 }, { regularSeason: undefined }]) assert.equal(automaticRunnerEligible({ season: 2025, regularSeason: true, ...extra }), null);
});
test('NFL final outcomes/markets and unproven historical publication are explicitly withheld', () => {
  const history = simulationNflHistory(rawHistory()), result = run(history);
  assert.equal(result.outcomeScope, 'regulation-only'); assert.equal(result.continuation.finalProbabilities, null);
  assert.equal(simulateGame({ sport: 'nfl', game: { ...game, season: undefined }, history, simulations: 1000 }).continuation.rules, null);
  assert.equal(result.probabilities.tie, result.probabilities.overtime);
  assert.throws(() => compareSimulationMarket(result, { type: 'moneyline', firstOdds: -110, secondOdds: -110 }), /withheld/);
  const strict = simulateGame({ sport: 'nfl', game, history, publicationMode: 'faithful' });
  assert.equal(strict.status, 'withheld'); assert.match(strict.warnings[0], /immutable row-level/);
  assert.throws(() => evaluationRow(result, { homeScore: 27, awayScore: 24 }, { home: .5, away: .5, tie: 0 }), /Regulation forecasts require regulation/);
});
