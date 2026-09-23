import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationPropRows, simulationPropMarkets, SimulationPropsStore } from '../lib/simulation-props.mjs';

const now = Date.parse('2026-09-24T18:00:00Z'), kickoff = '2026-09-25T00:15:00Z';
const query = { sport: 'nfl', game: 'game-a', market: 'rec_yds', now, kickoff };
const player = (extra = {}) => ({ playerId: '1', gameId: 'game-a', player: 'Example Receiver', team: 'ATL', position: 'WR',
  forecast: { status: 'experimental', version: 'existing', point: 67.5, interval: [30, 98], probability: { over: .6, under: .4, push: 0 }, sampleCount: 10, availability: { status: 'Questionable', concern: true }, reasons: ['Forecast assumes participation.'] },
  prop: { line: 59.5, bookmaker: 'Example book', fetchedAt: '2026-09-24T17:30:00Z', commenceTime: kickoff, basis: 'captured_pregame' }, ...extra });
test('props preserve existing forecasts, line units, warnings, and selected matchup isolation', () => {
  const p = player(), before = JSON.stringify(p);
  const rows = simulationPropRows({ players: [p, player({ playerId: '2', gameId: 'other' })] }, query);
  assert.equal(rows.length, 1); assert.equal(rows[0].point, 67.5); assert.deepEqual(rows[0].interval, [30, 98]);
  assert.deepEqual(rows[0].probability, { over: .6, under: .4, push: 0 }); assert.equal(rows[0].line.status, 'current');
  assert.equal(rows[0].availability.status, 'Questionable'); assert.ok(rows[0].reasons.includes('Forecast assumes participation.'));
  assert.equal(JSON.stringify(p), before);
});
test('no line never becomes a research threshold or an invented probability', () => {
  const r = simulationPropRows({ players: [player({ prop: null })] }, query)[0];
  assert.equal(r.line, null); assert.equal(r.probability, null); assert.equal(r.point, 67.5);
});
test('stale, archived, in-play and expired quotes cannot receive a current pregame comparison', () => {
  for (const change of [{ stale: true }, { basis: 'published_archive' }, { basis: 'in_play' }, { fetchedAt: '2026-09-23T12:00:00Z' }]) {
    const p = player(); Object.assign(p.prop, change);
    const r = simulationPropRows({ players: [p] }, query)[0]; assert.equal(r.probability, null); assert.notEqual(r.line.status, 'current');
  }
  assert.equal(simulationPropRows({ players: [player()], stale: true }, query)[0].probability, null);
  const p = player(); p.forecast.availability.stale = true;
  assert.equal(simulationPropRows({ players: [p] }, query)[0].status, 'stale');
});
test('reported unavailable players remain visible with forecasts withheld, without duplication', () => {
  const p = player(), out = { playerId: '1', gameId: 'game-a', player: p.player, team: 'ATL', availability: { status: 'Out', unavailable: true } };
  const rows = simulationPropRows({ players: [p], unavailablePlayers: [out] }, query);
  assert.equal(rows.length, 1); assert.equal(rows[0].point, null); assert.equal(rows[0].probability, null); assert.equal(rows[0].status, 'unavailable');
});
test('TD probability is not mislabeled as expected touchdown count or outcome range', () => {
  const p = player(); p.forecast.point = .35; p.forecast.interval = [0, 1];
  const r = simulationPropRows({ players: [p] }, { ...query, market: 'any_td' })[0];
  assert.equal(r.pointIsProbability, true); assert.equal(r.point, .35); assert.equal(r.interval, null);
  assert.match(r.reasons.join(' '), /two estimates can differ/);
  p.forecast.point = 1.5;
  const invalid = simulationPropRows({ players: [p] }, { ...query, market: 'any_td' })[0];
  assert.equal(invalid.point, null); assert.equal(invalid.probability, null);
});
test('invalid probability mass is withheld; missing projections remain null while zero is preserved', () => {
  const p = player(); p.forecast.probability = { over: .9, under: .9, push: 0 };
  assert.equal(simulationPropRows({ players: [p] }, query)[0].probability, null);
  p.forecast.point = 0; assert.equal(simulationPropRows({ players: [p] }, query)[0].point, 0);
  p.forecast.status = 'unavailable'; assert.equal(simulationPropRows({ players: [p] }, query)[0].point, null);
});
test('NFL prop adapter resolves exact date and week before calling the existing board', async () => {
  const calls = [], nfl = { provider: { async load() { return { rows: [{ game_id: 'game-a', gameday: '2026-09-24', gametime: '20:15', season: 2026, week: 3, game_type: 'REG' }] }; } }, async board(q) { calls.push(q); return { players: [player()], current: { season: 2026, week: 3 } }; } };
  const store = new SimulationPropsStore({ nfl, now: () => now });
  const r = await store.board({ sport: 'nfl', game: 'game-a', date: '2026-09-24', market: 'rec_yds' });
  assert.deepEqual(calls, [{ season: 2026, week: 3, market: 'rec_yds', view: 'board' }]); assert.equal(r.players.length, 1);
  assert.match(r.researchUrl, /season=2026&week=3/); assert.match(r.method, /not draws/);
  await assert.rejects(store.board({ sport: 'nfl', game: 'game-a', date: '2026-09-25' }), /not found/);
});
test('MLB doubleheaders stay game-specific and basketball calls use the requested game', async () => {
  const mlb = { async board() { return { games: [{ gameId: 123456 }], players: [player({ gameId: 123456 }), player({ playerId: '2', gameId: 123457 })] }; } };
  const calls = [], sports = { async board(q) { calls.push(q); return { game: { id: q.game, date: kickoff }, players: [player({ gameId: q.game })] }; } };
  const store = new SimulationPropsStore({ mlb, sports, now: () => now });
  const r = await store.board({ sport: 'mlb', game: '123456', date: '2026-09-24', market: 'hits' }); assert.equal(r.players.length, 1);
  for (const sport of ['nba', 'wnba']) {
    const r = await store.board({ sport, game: '401234567', date: '2026-09-24', market: 'points' });
    assert.equal(r.market, 'points'); assert.equal(calls.at(-1).game, '401234567');
  }
  await assert.rejects(store.board({ sport: 'mlb', game: '123457', date: '2026-09-24' }), /not found/);
});
test('market registry is sport-specific and invalid requests fail before fetching', async () => {
  assert.equal(simulationPropMarkets('nfl').length, 11); assert.equal(simulationPropMarkets('mlb').length, 16);
  assert.ok(simulationPropMarkets('wnba').some(m => m.key === 'stocks')); assert.ok(!simulationPropMarkets('nba').some(m => m.key === 'stocks'));
  const store = new SimulationPropsStore({});
  await assert.rejects(store.board({ sport: 'nfl', game: 'target', market: 'bad' }), /supported player prop/);
  await assert.rejects(store.board({ sport: 'nba' }), /Select a matchup/);
});
