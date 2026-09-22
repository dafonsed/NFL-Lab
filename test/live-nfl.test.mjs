import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLivePriors, projectLiveProp, LIVE_MARKETS, finite } from '../lib/live-nfl-model.mjs';
import { LiveNflStore, normalizeSummary, clockSeconds, ESPN_LIVE } from '../lib/live-nfl.mjs';
import { compareLiveLine } from '../public/live-utils.js';

const now = Date.parse('2026-09-20T18:30:00Z');
const game = { id: '401872933', date: '2026-09-20T17:00:00Z', season: 2026, state: 'in', period: 3, clock: '15:00', remainingSeconds: 1800, possession: '1', teams: [{ id: '1', abbreviation: 'ATL', score: 14 }, { id: '29', abbreviation: 'CAR', score: 21 }] };
const player = { id: '100', name: 'Test Receiver', teamId: '1', team: 'ATL', stats: { targets: 5, receptions: 4, receiving_yards: 48, carries: 2, rushing_yards: 8, attempts: 0, completions: 0, passing_yards: 0 } };
const team = { id: '1', plays: 32, attempts: 20, carries: 10, sacks: 2, targets: 20 };
const prior = { count: 5, efficiencyCount: 10, teamPlays: 64, passShare: .65, sackRate: .06, targetRate: .95, shares: { target: .2, rush: .1, pass: 1 }, efficiency: { rec_yds: 8, rec: .65, rush_yds: 4, rush_attempts: 1, pass_yds: 7, pass_attempts: 1, pass_completions: .65 } };
const project = (overrides = {}) => projectLiveProp({ game, player, team, prior, market: 'rec_yds', ...overrides });

function fixture() {
  const competitors = game.teams.map((t, i) => ({ id: t.id, homeAway: i ? 'away' : 'home', score: String(t.score), team: { id: t.id, abbreviation: t.abbreviation, displayName: t.abbreviation } }));
  const status = { period: 3, displayClock: '15:00', type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '3rd Quarter' } };
  const event = { id: game.id, date: game.date, season: { year: 2026, type: 2 }, competitions: [{ competitors, status }] };
  const group = (name, keys, values, id = '100') => ({ name, keys, athletes: [{ athlete: { id, displayName: 'Test Player' }, stats: values }] });
  const summary = { header: { id: game.id, competitions: [{ competitors, status }] }, boxscore: {
    teams: [{ team: { id: '1' }, statistics: [{ name: 'totalOffensivePlays', displayValue: '32' }, { name: 'completionAttempts', displayValue: '14/20' }, { name: 'rushingAttempts', displayValue: '10' }, { name: 'sacksYardsLost', displayValue: '2-10' }] }],
    players: [{ team: { id: '1', abbreviation: 'ATL' }, statistics: [group('passing', ['completions/passingAttempts', 'passingYards'], ['14/20', '150'], '200'), group('rushing', ['rushingAttempts', 'rushingYards'], ['10', '40'], '300'), group('receiving', ['receptions', 'receivingYards', 'receivingTargets'], ['4', '48', '5'])] }],
  }, drives: { current: { plays: [{ id: '10', sequenceNumber: '100', text: 'Pass complete', period: { number: 3 }, clock: { displayValue: '15:00' }, wallclock: new Date(now - 10_000).toISOString(), end: { team: { id: '1' } } }] } } };
  return { event, summary, scoreboard: { season: { year: 2026, type: 2 }, events: [event] } };
}

test('live workload equation retains recorded stats and exposes independently recomputable weights', () => {
  const p = project(), b = p.breakdown;
  assert.equal(p.current, 48); assert.equal(b.liveRoleWeight, .5); assert.equal(b.share, .225);
  assert.equal(b.liveEfficiencyWeight, 5 / 45);
  assert.equal(b.efficiency, 8 * (40 / 45) + 9.6 * (5 / 45));
  assert.equal(b.pace, 1); assert.equal(b.remainingPlays, 33.5);
  assert.equal(p.projection, 48 + b.remainingPlays * b.passShare * .94 * .95 * .225 * b.efficiency);
  assert.ok(p.projection > p.current);
});
test('all supported markets are finite and combined yards equal both components', () => {
  for (const market of Object.keys(LIVE_MARKETS)) assert.ok(Number.isFinite(project({ market }).projection), market);
  const combined = project({ market: 'rush_rec_yds' });
  assert.equal(combined.projection, project({ market: 'rush_yds' }).projection + project().projection);
});
test('early game retains historical role, efficiency caps huge plays, and pace is bounded', () => {
  const early = project({ game: { ...game, period: 1, remainingSeconds: 3540 }, team: { ...team, plays: 4, targets: 2 }, player: { ...player, stats: { ...player.stats, targets: 1, receiving_yards: 95 } } });
  assert.ok(early.breakdown.liveRoleWeight < .01); assert.equal(early.breakdown.paceWeight, 0);
  assert.equal(early.breakdown.liveEfficiency, 16);
  const fast = project({ team: { ...team, plays: 200 } }); assert.equal(fast.breakdown.pace, 1.0875);
});
test('score deficit favors passing and lead favors rushing; possession affects remaining plays', () => {
  const leading = { ...game, teams: [{ ...game.teams[0], score: 28 }, game.teams[1]] };
  assert.ok(project().remaining > project({ game: leading }).remaining);
  assert.ok(project({ game: leading, market: 'rush_yds' }).remaining > project({ market: 'rush_yds' }).remaining);
  assert.equal(project().breakdown.remainingPlays - project({ game: { ...game, possession: '29' } }).breakdown.remainingPlays, 3);
  assert.equal(project({ game: { ...game, halftime: true } }).breakdown.possessionPlays, 0);
});
test('missing stats are withheld, real zero and negative yards remain recorded', () => {
  assert.equal(finite(''), null); assert.equal(finite(null), null); assert.equal(finite('0'), 0);
  assert.equal(project({ player: { ...player, stats: { targets: 5 } } }).projection, null);
  assert.equal(project({ player: { ...player, stats: { targets: 5, receiving_yards: 0 } } }).current, 0);
  assert.equal(project({ player: { ...player, stats: { targets: 5, receiving_yards: -3 } } }).current, -3);
  assert.equal(project({ market: 'rush_rec_yds', player: { ...player, stats: { receiving_yards: 50 } } }).current, null);
});
test('stale, upcoming, completed, OT, last-two-minute, short-history and incomplete team states cannot project', () => {
  for (const overrides of [{ stale: true }, { prior: null }, { prior: { ...prior, count: 2 } }, { team: { ...team, sacks: null } }, { team: { ...team, targets: 3 } }, ...[{ state: 'pre' }, { state: 'post' }, { period: 5 }, { remainingSeconds: 119 }, { remainingSeconds: null }].map(g => ({ game: { ...game, ...g } }))]) assert.equal(project(overrides).projection, null, JSON.stringify(overrides));
});
test('ESPN normalization uses named fields, stable IDs, actual zeros, missing categories and valid clocks', () => {
  const { summary } = fixture(), n = normalizeSummary(summary, game), receiver = n.players.find(p => p.id === '100');
  assert.equal(receiver.stats.receiving_yards, 48); assert.equal(receiver.stats.rushing_yards, 0);
  assert.equal(n.players.find(p => p.id === '200').stats.attempts, 20); assert.equal(n.teamStats[0].sacks, 2);
  assert.equal(n.game.remainingSeconds, 1800); assert.equal(n.game.possession, '1');
  summary.boxscore.players[0].statistics = summary.boxscore.players[0].statistics.filter(c => c.name !== 'rushing');
  assert.equal(normalizeSummary(summary, game).players.find(p => p.id === '100').stats.rushing_yards, undefined);
  assert.equal(clockSeconds('14:59'), 899); for (const clock of ['15:60', '19:00', '', null]) assert.equal(clockSeconds(clock), null);
  assert.throws(() => normalizeSummary({ ...summary, header: { ...summary.header, id: '401999999' } }, game), /another game/);
});
test('halftime stays at 30 minutes and clock can come from last recorded play', () => {
  const { summary } = fixture(); delete summary.header.competitions[0].status.period; delete summary.header.competitions[0].status.displayClock;
  assert.equal(normalizeSummary(summary, game).game.remainingSeconds, 1800);
  summary.header.competitions[0].status.type.name = 'STATUS_HALFTIME';
  const g = normalizeSummary(summary, game).game; assert.equal(g.remainingSeconds, 1800); assert.equal(g.possession, null);
});
test('priors exclude selected/future/incomplete games and use ESPN ID plus team, never player names', () => {
  const schedule = [], weekly = [];
  for (let i = 1; i <= 8; i++) {
    schedule.push({ game_id: 'g' + i, gameday: `2026-09-${String(i + 12).padStart(2, '0')}`, game_type: 'REG', home_score: i === 7 ? '' : '20', away_score: '10' });
    weekly.push({ game_id: 'g' + i, player_id: 'gsis', team: 'ATL', position: 'WR', targets: i >= 7 ? '999' : '5', receptions: '4', receiving_yards: '50', attempts: '0', carries: '0', sacks_suffered: '0' });
    weekly.push({ game_id: 'g' + i, player_id: 'qb', team: 'ATL', position: 'QB', targets: '0', attempts: '30', carries: '4', sacks_suffered: '2' });
  }
  const priors = buildLivePriors({ weekly, schedule, rosters: [{ espn_id: '100', gsis_id: 'gsis', team: 'ATL', season: '2026', position: 'WR' }], game });
  const p = priors.get('100:ATL'); assert.equal(p.count, 5); assert.equal(p.efficiencyCount, 6); assert.equal(p.efficiency.rec_yds, 10); assert.equal(p.teamPlays, 36);
  assert.ok(p.sample.every(s => s.date < '2026-09-19')); assert.equal(priors.get('100:CAR'), undefined);
});
test('line comparisons expire on clock/stat changes, 60 seconds, stale feed, missing line, and player pause', () => {
  const args = { projection: project(), quote: { line: 65.5, at: now, snapshot: 'abc' }, snapshot: 'abc', fetchedAt: new Date(now).toISOString(), now };
  assert.equal(compareLiveLine(args).kind, 'current');
  assert.equal(compareLiveLine({ ...args, snapshot: 'def' }).kind, 'expired');
  assert.equal(compareLiveLine({ ...args, quote: { ...args.quote, at: now - 60001 } }).kind, 'expired');
  for (const changes of [{ stale: true }, { paused: true }, { fetchedAt: new Date(now - 45001).toISOString() }]) assert.equal(compareLiveLine({ ...args, ...changes }).kind, 'paused');
  assert.equal(compareLiveLine({ ...args, quote: null }).kind, 'empty');
  assert.equal(compareLiveLine({ ...args, projection: project({ stale: true }) }).kind, 'paused');
});
test('feed cache coalesces requests, preserves timestamps on failure, and rejects malformed replacements', async () => {
  let clock = now, calls = 0, broken = false;
  const store = new LiveNflStore({ now: () => clock, fetcher: async () => { calls++; if (broken) throw Error('offline'); return new Response(JSON.stringify({ events: [] })); } });
  const check = b => { if (!Array.isArray(b.events)) throw Error('bad feed'); };
  const [a, b] = await Promise.all([store.read(ESPN_LIVE, check), store.read(ESPN_LIVE, check)]);
  assert.equal(calls, 1); assert.equal(a.sha256, b.sha256);
  clock += 16_000; broken = true; const c = await store.read(ESPN_LIVE, check);
  assert.equal(c.stale, true); assert.equal(c.fetchedAt, a.fetchedAt); assert.deepEqual(c.data, a.data);
  await store.read(ESPN_LIVE, check); assert.equal(calls, 2);
  clock += 16_000; store.fetcher = async () => new Response('{}');
  const bad = await store.read(ESPN_LIVE, check); assert.equal(bad.stale, true); assert.equal(bad.sha256, a.sha256);
});
test('board exposes honest no-games state, validates input, and pauses a quiet in-progress feed', async () => {
  const { scoreboard, summary } = fixture(); let clock = now;
  const provider = { load: async () => ({ rows: [], meta: { available: true, stale: false } }) };
  const store = new LiveNflStore({ provider, now: () => clock, fetcher: async url => new Response(JSON.stringify(url.includes('/summary') ? summary : scoreboard)) });
  const first = await store.board(); assert.equal(first.stale, false); assert.equal(first.players.length, 3); assert.equal(first.players[0].projections.pass_yds.projection, null);
  clock += 240_000; assert.equal((await store.board()).stale, true);
  await assert.rejects(store.board({ date: '2026-02-31' }), /valid game date/); await assert.rejects(store.board({ game: '../etc' }), /valid ESPN game/);
  const empty = new LiveNflStore({ fetcher: async () => new Response('{"events":[]}') });
  assert.deepEqual((await empty.board()).players, []);
});
test('provider cache age keeps advancing during the local cache lifetime', async () => {
  let clock = now;
  const store = new LiveNflStore({ now: () => clock, fetcher: async () => new Response('{"events":[]}', { headers: { age: '40' } }) });
  const validate = () => {};
  assert.equal((await store.read(ESPN_LIVE, validate)).stale, false);
  clock += 6_000;
  assert.equal((await store.read(ESPN_LIVE, validate)).stale, true);
});
test('malformed category values never imply zero for an omitted player', () => {
  const { summary } = fixture();
  summary.boxscore.players[0].statistics.find(s => s.name === 'rushing').athletes[0].stats[1] = '--';
  assert.equal(normalizeSummary(summary, game).players.find(p => p.id === '100').stats.rushing_yards, undefined);
  assert.equal(project({ player: { ...player, teamId: 'wrong' } }).projection, null);
});
