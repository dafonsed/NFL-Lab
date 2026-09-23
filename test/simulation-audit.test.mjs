import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { simulateGame, compareSimulationMarket } from '../lib/game-simulation.mjs';
import { buildGamePrior } from '../lib/live-game-model.mjs';
import { SimulationStore, simulationMlbHistory } from '../lib/simulation-source.mjs';
import { createSimulationPropStores } from '../lib/simulation-props.mjs';
import { SourceStore } from '../lib/source.mjs';
import { MlbStore } from '../lib/mlb/source.mjs';
import { SportsStore } from '../lib/sports/source.mjs';

const game = { id: 'target', date: '2025-03-01', state: 'pre', postseason: false, neutralSite: true,
  teams: [{ id: 'B', abbreviation: 'B', homeAway: 'away' }, { id: 'A', abbreviation: 'A', homeAway: 'home' }] };
const history = Array.from({ length: 20 }, (_, i) => ({ id: String(i), date: `2025-01-${String(i + 1).padStart(2, '0')}`, complete: true, home: 'A', away: 'B', homeScore: 25, awayScore: 24 }));
const run = (extra = {}) => simulateFixture({ sport: 'nfl', game, history, simulations: 1000, seed: '0', ...extra });
const simulateFixture = input => simulateGame({ ...input, history: input.history.map(g => ({ ...g, regulation: g.regulation || { homeScore: g.homeScore, awayScore: g.awayScore, method: 'explicit synthetic regulation fixture' } })) });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);

test('mutating a returned simulation cannot change shared live/standard parameters or later runs', () => {
  const baseline = run(), prior = structuredClone(buildGamePrior({ sport: 'nfl', game, history }));
  const returned = run(); returned.inputs.weights.min = 100; returned.inputs.weights.mean = 900;
  returned.teams[0].inputs.sample[0].date = '2100-01-01';
  assert.deepEqual(run(), baseline);
  assert.deepEqual(buildGamePrior({ sport: 'nfl', game, history }), prior);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  assert.doesNotThrow(() => run({ game: freeze(structuredClone(game)), history: freeze(structuredClone(history)) }));
});

test('malformed calendar dates and date/team types cannot enter the prior or crash filtering', () => {
  const baseline = run();
  const invalid = ['2025-02-30', 123, [], 'invalid'].map((date, i) => ({ ...history[0], id: 'bad' + i, date, homeScore: 1000 }));
  invalid.push({ ...history[0], id: 'bad-team', home: 42 }, { ...history[0], id: 'bad-available', availableAt: '' });
  const r = run({ history: [...history, ...invalid] });
  assert.deepEqual(r.total, baseline.total); assert.match(r.warnings.join(' '), /6 historical rows were excluded/);
  assert.throws(() => run({ game: { ...game, date: 123 } }), /valid date/);
  for (const teams of [{ length: 2 }, [null, game.teams[1]], game.teams.map(t => ({ ...t, abbreviation: 12 }))]) assert.throws(() => run({ game: { ...game, teams } }), /valid date/);
});

test('a duplicate without availability metadata cannot bypass a known future completion', () => {
  const earlierHistory = history.filter(g => g.id !== '0');
  const r = run({ history: [...history, { ...history[0], availableAt: '2025-03-02T18:00:00Z' }] });
  assert.deepEqual(r.total, run({ history: earlierHistory }).total);
});

test('out-of-range scores and clipped expectations receive explicit warnings', () => {
  const r = run({ history: history.map(g => ({ ...g, homeScore: 200, awayScore: 0 })) });
  assert.match(r.warnings.join(' '), /unusually high/); assert.match(r.warnings.join(' '), /model bound/);
});

test('market probabilities remain bounded even when summed masses exceed one by epsilon', () => {
  const r = run({ sport: 'nba' }), market = compareSimulationMarket(r, { type: 'total', line: 0, firstOdds: 100, secondOdds: 100 });
  for (const s of market.selections) assert.ok(s.modelProbability >= 0 && s.modelProbability <= 1 && s.conditionalModelProbability >= 0 && s.conditionalModelProbability <= 1);
  near(market.selections.reduce((sum, s) => sum + s.modelProbability, 0) + market.pushProbability, 1);
});

test('signed home spreads, total pushes, no-vig prices and all-push outcomes use the correct denominators', () => {
  const result = { status: 'experimental', probabilities: { home: .6, away: .3, tie: .1 },
    homeMargin: { pmf: [{ value: -3, probability: .2 }, { value: 3, probability: .3 }, { value: 7, probability: .5 }] },
    total: { pmf: [{ value: 40, probability: .25 }, { value: 45, probability: .5 }, { value: 50, probability: .25 }] } };
  const spread = compareSimulationMarket(result, { type: 'spread', line: -3, firstOdds: -150, secondOdds: 130 });
  near(spread.pushProbability, .3); near(spread.selections[0].modelProbability, .5);
  near(spread.selections[0].conditionalModelProbability, .5 / .7);
  near(spread.selections[0].rawImpliedProbability, .6);
  near(spread.selections[0].noVigMarketProbability, .6 / (.6 + 100 / 230));
  const total = compareSimulationMarket(result, { type: 'total', line: 45, firstOdds: -110, secondOdds: -110 });
  near(total.pushProbability, .5); near(total.selections[0].conditionalModelProbability, .5);
  result.total.pmf = [{ value: 45, probability: 1 }];
  assert.ok(compareSimulationMarket(result, { type: 'total', line: 45, firstOdds: -110, secondOdds: -110 }).selections.every(s => s.conditionalModelProbability === null && s.difference === null));
});

test('suspended MLB finals cannot leak from their original official date through duplicate schedule rows', () => {
  const raw = { gamePk: 1, officialDate: '2025-01-01', gameDate: '2025-01-01T22:00:00Z', gameType: 'R', scheduledInnings: 9, linescore: { innings: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, home: { runs: i ? 0 : 9 }, away: { runs: i ? 0 : 2 } })) }, status: { abstractGameState: 'Final' }, teams: { home: { team: { id: 'A' }, score: 9 }, away: { team: { id: 'B' }, score: 2 } } };
  const rows = simulationMlbHistory([{ ...raw, resumeDate: '2025-03-02T18:00:00Z' }, { ...raw, gameDate: '2025-03-02T18:00:00Z', resumedFrom: raw.gameDate }]);
  assert.ok(rows.every(g => g.availableAt === '2025-03-02T23:59:59.999Z'));
  const options = { sport: 'mlb', game: { ...game, regularSeason: true, scheduledInnings: 9 }, history: history.map(g => ({ ...g, id: 'h' + g.id, homeScore: 4, awayScore: 3 })) };
  assert.deepEqual(run(options).total, run({ ...options, history: [...options.history, ...rows] }).total);
  const after = run({ ...options, game: { ...options.game, date: '2025-03-03' }, history: [...options.history, ...rows] });
  assert.ok(after.teams.every(t => t.inputs.sample.some(g => g.id === '1')));
});

test('late basketball games stay on the requested schedule day and exclude that entire day', async () => {
  const event = (id, date, complete) => ({ id, date, season: { year: 2025, type: 2 }, competitions: [{ neutralSite: false, status: { period: 4, type: { completed: complete, state: complete ? 'post' : 'pre' } }, competitors: game.teams.map(t => ({ homeAway: t.homeAway, team: { id: t.id, abbreviation: t.id }, score: '110' })) }] });
  const provider = { async read(url) { return { url, payload: { events: url.includes('/scoreboard') ? [event('target', '2025-03-02T03:00:00Z', false)] : [...history.map(g => event(g.id, g.date, true)), event('same-day', '2025-03-01T01:00:00Z', true)] } }; } };
  const store = new SimulationStore({ provider });
  const catalog = await store.catalog({ sport: 'nba', date: game.date }); assert.equal(catalog.events.length, 1);
  const r = await store.run({ sport: 'nba', date: game.date, game: 'target', simulations: 1000, seed: 'test' });
  assert.equal(r.inputs.cutoff, game.date); assert.equal(r.game.officialDate, game.date);
  assert.ok(r.teams.every(t => t.inputs.sample.every(g => g.id !== 'same-day')));
});

test('Simulation player stores use standard calculations with separate caches and no archive writes', async () => {
  const shared = { nfl: new SourceStore(), mlb: new MlbStore(), sports: new SportsStore() };
  const isolated = createSimulationPropStores(shared);
  assert.equal(isolated.nfl.board, shared.nfl.board); assert.equal(isolated.mlb.board, shared.mlb.board); assert.equal(isolated.sports.build, shared.sports.build);
  for (const sport of ['nfl', 'mlb', 'sports']) { assert.notEqual(isolated[sport], shared[sport]); assert.equal(isolated[sport].provider, shared[sport].provider); }
  assert.notEqual(isolated.nfl.boards, shared.nfl.boards); assert.notEqual(isolated.mlb.boards, shared.mlb.boards); assert.notEqual(isolated.sports.cache, shared.sports.cache);
  assert.equal((await isolated.nfl.predictions.capture()).state, 'read_only');
  assert.equal((await isolated.nfl.paper.capturePaper()).state, 'read_only');
  assert.equal((await isolated.mlb.paper.capturePaper()).state, 'read_only');
  assert.equal((await isolated.sports.capture()).state, 'read_only'); assert.deepEqual(await isolated.nfl.trackLines(), []);
  assert.notEqual(shared.nfl.predictions.capture, isolated.nfl.predictions.capture);
  assert.notEqual(shared.sports.capture, isolated.sports.capture);
});

test('standard and live models and their transitive imports never depend on simulation', async () => {
  const visited = new Set();
  async function trace(url) {
    if (visited.has(url.href)) return; visited.add(url.href);
    assert.doesNotMatch(url.pathname, /simulation/);
    const source = await fs.readFile(url, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+\.mjs)['"]/g)) await trace(new URL(match[1], url));
  }
  for (const file of ['source.mjs', 'mlb/source.mjs', 'sports/source.mjs', 'live-nfl.mjs', 'live-sports.mjs']) await trace(new URL('../lib/' + file, import.meta.url));
  assert.ok(visited.size > 30);
});

test('50,000-run output keeps score, margin, total, count and probability arithmetic consistent', () => {
  const r = run({ simulations: 50000 });
  near(r.total.mean, r.teams[0].score.mean + r.teams[1].score.mean);
  near(r.homeMargin.mean, r.teams[1].score.mean - r.teams[0].score.mean);
  for (const d of [r.total, r.homeMargin, ...r.teams.map(t => t.score)]) {
    assert.equal(d.pmf.reduce((s, v) => s + v.count, 0), 50000);
    near(d.pmf.reduce((s, v) => s + v.probability, 0), 1);
    near(d.pmf.reduce((s, v) => s + v.probability * v.value, 0), d.mean);
  }
});
