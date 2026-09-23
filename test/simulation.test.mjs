import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGame, simulationOptions, compareSimulationMarket } from '../lib/game-simulation.mjs';
import { SimulationStore, simulationQuery } from '../lib/simulation-source.mjs';
import { evaluationRow, evaluationMetrics, calibrationBuckets, crps } from '../lib/simulation-evaluation.mjs';

const day = i => new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10);
const game = { id: 'target', date: '2025-03-01', state: 'pre', postseason: false, regularSeason: true, scheduledInnings: 9, neutralSite: true,
  teams: [{ id: 'B', abbreviation: 'B', homeAway: 'away' }, { id: 'A', abbreviation: 'A', homeAway: 'home' }] };
const historyFor = (a = 24, b = a) => Array.from({ length: 40 }, (_, i) => ({ id: String(i), date: day(i), complete: true, home: i % 2 ? 'A' : 'B', away: i % 2 ? 'B' : 'A', homeScore: i % 2 ? a : b, awayScore: i % 2 ? b : a }));
const run = (options = {}) => simulateFixture({ sport: 'nfl', game, history: historyFor(), simulations: 1000, seed: 'test', ...options });
const simulateFixture = input => simulateGame({ ...input, history: input.history.map(g => ({ ...g, regulation: g.regulation || { homeScore: g.homeScore, awayScore: g.awayScore, method: 'explicit synthetic regulation fixture' } })) });
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);

test('simulation seed reproduces the complete result and alternate seeds change draws', () => {
  assert.deepEqual(run(), run()); assert.notDeepEqual(run().total, run({ seed: 'different' }).total);
  const fresh = run({ seed: undefined }); assert.ok(fresh.seed); assert.deepEqual(fresh, run({ seed: fresh.seed }));
});
test('all supported sports return normalized probabilities and legal integer scores', () => {
  for (const [sport, score] of [['nfl', 24], ['nba', 110], ['wnba', 80], ['mlb', 4]]) {
    const result = run({ sport, history: historyFor(score) });
    assert.equal(result.status, 'experimental');
    near(result.probabilities.home + result.probabilities.away + result.probabilities.tie, 1);
    assert.ok(result.probabilities.overtime >= result.probabilities.tie);
    if (sport !== 'nfl') assert.equal(result.probabilities.tie, 0);
    for (const dist of [result.total, result.homeMargin, ...result.teams.map(t => t.score)]) {
      near(dist.pmf.reduce((s, p) => s + p.probability, 0), 1);
      assert.equal(dist.pmf.reduce((s, p) => s + p.count, 0), 1000);
      assert.ok(dist.p10 <= dist.median && dist.median <= dist.p90);
      assert.ok(dist.pmf.every(p => Number.isInteger(p.value)));
    }
    assert.ok(result.teams.every(t => t.score.pmf.every(p => p.value >= 0 && (sport !== 'nfl' || p.value !== 1))));
  }
});
test('equal neutral team histories produce roughly even winning chances and a varying score distribution', () => {
  const r = run({ simulations: 10000 }); near(r.probabilities.home, r.probabilities.away, .025);
  assert.ok(r.total.p90 > r.total.p10); assert.ok(r.homeMargin.p10 < 0 && r.homeMargin.p90 > 0);
});
test('stronger history shifts results, while extreme and zero-score histories stay finite', () => {
  const strong = run({ history: historyFor(50, 0) }); assert.ok(strong.probabilities.home > .75);
  for (const history of [historyFor(0), historyFor(200, 0)]) {
    const r = run({ history }); assert.ok(Number.isFinite(r.total.mean)); assert.ok(r.teams.every(t => t.score.p10 >= 0));
  }
  assert.ok(run({ game: { ...game, postseason: true } }).probabilities.tie > 0); // Regulation ties require unresolved postseason OT.
});
test('missing and stale data withhold forecasts instead of silently creating inputs', () => {
  assert.equal(run({ stale: true }).status, 'withheld');
  assert.equal(run({ history: [] }).status, 'withheld');
  assert.equal(run({ sport: 'soccer' }).status, 'withheld');
  assert.equal(run({ game: { ...game, postseason: undefined } }).status, 'withheld');
  assert.equal(run({ sport: 'mlb', game: { ...game, scheduledInnings: 7 } }).status, 'withheld');
  assert.throws(() => run({ game: { ...game, teams: [game.teams[0], game.teams[0]] } }), /distinct/);
  assert.throws(() => run({ game: { ...game, date: '2025-02-31' } }), /valid date/);
  const old = run({ game: { ...game, date: '2025-08-01' } }); assert.ok(old.warnings.some(w => /days old/.test(w)));
});
test('future, same-day, selected-game scores and rows unavailable before kickoff never enter simulation', () => {
  const base = run(), contamination = historyFor(900).map((g, i) => ({ ...g, id: 'future' + i, date: i % 2 ? game.date : '2025-12-01' }));
  const r = run({ game: { ...game, teams: game.teams.map(t => ({ ...t, score: 999 })) }, history: [...historyFor(), ...contamination, { ...historyFor()[0], id: game.id }, { ...historyFor()[0], id: 'late', availableAt: '2025-04-01' }] });
  assert.deepEqual(base.teams, r.teams); assert.deepEqual(base.total, r.total);
  assert.ok(r.teams.every(t => t.inputs.sample.every(g => g.date < game.date && g.id !== game.id)));
});
test('input order and harmless duplicates do not change draws; conflicting duplicates are excluded', () => {
  assert.deepEqual(run().total, run({ history: [...historyFor().reverse(), historyFor()[0]] }).total);
  const r = run({ history: [...historyFor(), { ...historyFor()[0], homeScore: 99 }, { ...historyFor()[0], id: 'missing', homeScore: null }] });
  assert.ok(r.warnings.some(w => /conflicting/.test(w))); assert.ok(r.warnings.some(w => /invalid/.test(w)));
  assert.ok(r.teams.every(t => !t.inputs.sample.some(g => g.id === '0' || g.id === 'missing')));
});
test('each input contribution explains the exact scoring baseline', () => {
  const r = run({ game: { ...game, neutralSite: false }, history: historyFor(42, 10) });
  for (const t of r.teams) {
    near(Object.values(t.inputs.contributions).reduce((s, v) => s + v, 0), t.inputs.expected);
    near(t.inputs.historyWeight + t.inputs.leagueWeight, 1);
  }
});
test('counts, seeds, invalid sports and malformed calendar dates are rejected before fetching', async () => {
  for (const simulations of [0, 999, 50001, Infinity, NaN, 2000.5, '']) assert.throws(() => simulationOptions({ simulations }), /count/);
  assert.throws(() => simulationOptions({ seed: 'x'.repeat(129) }), /Seed/);
  assert.equal(simulationOptions({}).simulations, 10000);
  for (const input of [{ sport: 'hockey' }, { date: '2026-02-31' }, { game: '../secrets' }]) assert.throws(() => simulationQuery(input));
  const store = new SimulationStore({ nflProvider: { load() { throw Error('Must not fetch'); } } });
  await assert.rejects(store.run({ game: 'target', market: 'spread', firstOdds: 5, secondOdds: -110 }), /American/);
});
test('paired market comparison removes vig and handles pushes explicitly without changing predictions', () => {
  const r = run({ sport: 'nba', history: historyFor(110) }), before = JSON.stringify(r), quote = compareSimulationMarket(r, { type: 'moneyline', firstOdds: -110, secondOdds: -110 });
  near(quote.selections[0].noVigMarketProbability, .5); assert.ok(quote.overround > 0);
  near(quote.selections.reduce((s, x) => s + x.modelProbability, 0) + quote.pushProbability, 1);
  assert.equal(JSON.stringify(r), before);
  const spread = compareSimulationMarket(r, { type: 'spread', line: 0, firstOdds: 100, secondOdds: 100 });
  near(spread.pushProbability, r.probabilities.tie);
  const total = compareSimulationMarket(r, { type: 'total', line: 0, firstOdds: 100, secondOdds: 100 });
  near(total.selections[1].modelProbability, 0);
});
test('source adapter keeps game date matching and source stale state intact', async () => {
  const rows = historyFor().map(g => ({ game_id: g.id, gameday: g.date, home_team: g.home, away_team: g.away, home_score: String(g.homeScore), away_score: String(g.awayScore), season: '2025', game_type: 'REG', overtime: '0', location: 'Home' }));
  rows.push({ game_id: 'target', gameday: game.date, home_team: 'A', away_team: 'B', home_score: '', away_score: '', season: '2025', game_type: 'REG', location: 'Home' });
  let stale = false;
  const store = new SimulationStore({ nflProvider: { async load() { return { rows, meta: { url: 'https://example.org/history', stale, sha256: 'fixture' } }; } } });
  const catalog = await store.catalog({ date: game.date }); assert.equal(catalog.events.length, 1);
  const r = await store.run({ date: game.date, game: 'target', seed: 'test', simulations: 1000 }); assert.equal(r.status, 'experimental'); assert.equal(r.sources[0].sha256, 'fixture');
  await assert.rejects(store.run({ date: game.date, game: 'target', simulations: 1000, market: 'moneyline', firstOdds: -110, secondOdds: -110 }), /withheld/);
  assert.equal((await store.run({ date: game.date, game: 'target', publicationMode: 'faithful' })).status, 'withheld');
  stale = true; assert.equal((await store.run({ date: game.date, game: 'target' })).status, 'withheld');
  await assert.rejects(store.run({ date: '2025-03-02', game: 'target' }), /not found/);
});
test('basketball adapter only needs completed schedule scores and pauses if a schedule fails', async () => {
  let fail = false;
  const event = (id, date, final) => ({ id, date, season: { year: 2025, type: 2 }, competitions: [{ neutralSite: false, status: { period: 4, type: { completed: final, state: final ? 'post' : 'pre' } }, competitors: game.teams.map(t => ({ homeAway: t.homeAway, team: { id: t.id, displayName: t.id, abbreviation: t.id }, score: '100' })) }] });
  const provider = { async read(url) {
    if (fail && url.includes('/teams/')) throw Error('offline');
    return { url, stale: false, payload: { events: url.includes('/scoreboard') ? [event('target', game.date, false)] : historyFor().map(g => event(g.id, g.date, true)) } };
  } };
  const store = new SimulationStore({ provider });
  assert.equal((await store.run({ sport: 'nba', date: game.date, game: 'target', simulations: 1000 })).status, 'experimental');
  fail = true; assert.equal((await store.run({ sport: 'nba', date: game.date, game: 'target' })).status, 'withheld');
});
test('evaluation scores known synthetic probabilities and reports empty samples honestly', () => {
  const pmf = [{ value: 0, probability: .5 }, { value: 2, probability: .5 }]; near(crps(pmf, 0), .5);
  const result = { status: 'experimental', probabilities: { home: .75, away: .25, tie: 0 }, total: { mean: 2, p10: 0, p90: 4, pmf }, homeMargin: { mean: 1, p10: 0, p90: 4, pmf }, teams: [{ score: { mean: 0 }, inputs: { count: 20 } }, { score: { mean: 2 }, inputs: { count: 20 } }], inputs: { weights: { min: 5 } } };
  const row = evaluationRow(result, { homeScore: 2, awayScore: 0 }, { home: .5, away: .5, tie: 0 });
  near(row.brier, .0625); near(row.logLoss, -Math.log(.75)); near(row.baselineBrier, .25);
  assert.equal(evaluationMetrics([row]).scoreMAE, 0); assert.equal(evaluationMetrics([]).homeBrier, null);
  const bucket = calibrationBuckets([row])[7]; assert.equal(bucket.n, 1); assert.equal(bucket.observed, 1); assert.ok(bucket.observedInterval95[0] < 1);
});
