import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveFeed, liveStale } from '../lib/live-feed.mjs';
import { liveGameOdds, matchMlbOddsEvent } from '../lib/live-odds.mjs';
import { LiveSportsStore, liveQuery } from '../lib/live-sports.mjs';
import { basketballClock, basketballEvent, normalizeLiveBasketball, normalizeLiveMlb, basketballPriors, basketballWorkloads, projectBasketball, mlbPriors, projectMlb, remainingBattingOuts, liveMarkets } from '../lib/live-sports-model.mjs';

const now = Date.parse('2026-09-22T23:00:00Z');
const teams = [{ id: '1', name: 'Home Team', abbreviation: 'HOM', homeAway: 'home', score: 40 }, { id: '2', name: 'Away Team', abbreviation: 'AWY', homeAway: 'away', score: 38 }];
const game = { id: '401000001', sport: 'wnba', date: '2026-09-22T22:00:00Z', season: 2026, teams, state: 'in', period: 3, remainingSeconds: 1200 };
const stats = { minutes: 15, points: 12, rebounds: 4, assists: 3, threePointFieldGoalsMade: 2, steals: 1, blocks: 0, turnovers: 1, fieldGoalsMade: 4, fieldGoalsAttempted: 9, freeThrowsMade: 2 };
const player = { id: '100', name: 'Test Player', teamId: '1', minutes: 15, stats };
const past = Array.from({ length: 8 }, (_, i) => ({ game: { id: 'past' + i, date: `2026-09-${String(20 - i).padStart(2, '0')}T22:00:00Z`, complete: true }, players: [{ ...player, minutes: 30, stats: { ...stats, minutes: 30, points: 20 } }] }));
function basketballFixture(sport = 'wnba') {
  const competitors = teams.map(t => ({ homeAway: t.homeAway, score: String(t.score), team: { id: t.id, displayName: t.name, abbreviation: t.abbreviation } }));
  const status = { period: 3, displayClock: sport === 'nba' ? '12:00' : '10:00', type: { state: 'in', name: 'STATUS_IN_PROGRESS', detail: 'Third quarter' } };
  const event = { id: game.id, date: game.date, season: { year: 2026, type: 2 }, competitions: [{ competitors, status }] };
  const summary = { header: event, boxscore: { players: [{ team: { id: '1' }, statistics: [{ keys: Object.keys(stats), athletes: [{ athlete: { id: player.id, displayName: player.name }, stats: Object.values(stats).map(String) }] }] }] }, plays: [{ id: 'p1', text: 'Made basket', wallclock: new Date(now - 1000).toISOString(), period: { number: 3 }, clock: { displayValue: status.displayClock } }], pickcenter: [] };
  return { event, summary, scoreboard: { events: [event] } };
}
const bbArgs = (sport = 'wnba') => {
  const target = { ...game, sport, remainingSeconds: sport === 'nba' ? 1440 : 1200 }, priors = basketballPriors(past, target, [player]);
  return { sport, game: target, player, prior: priors.get(player.id), workload: basketballWorkloads([player], priors, target, sport).get(player.id), market: 'points', stale: false };
};
const mlbGame = { ...game, id: '800001', sport: 'mlb', officialDate: '2026-09-22', inning: 5, top: true, outs: 1, scheduledInnings: 9 };
const batting = { plateAppearances: 2, hits: 1, doubles: 0, triples: 0, homeRuns: 0, runs: 1, rbi: 0, stolenBases: 0, baseOnBalls: 1, strikeOuts: 0 };
const pitching = { gamesStarted: 1, battersFaced: 16, numberOfPitches: 60, outs: 13, strikeOuts: 5, hits: 3, earnedRuns: 1, baseOnBalls: 2 };
const batter = { id: '100', teamId: '1', side: 'home', roles: ['hitting'], stats: { hitting: batting }, inLineup: true };
const pitcher = { id: '200', teamId: '1', side: 'home', roles: ['pitching'], stats: { pitching }, starter: true, currentPitcher: true };
const battingRows = Array.from({ length: 6 }, () => ({ stat: { ...batting, plateAppearances: 4, hits: 2 } }));
const pitchingRows = Array.from({ length: 4 }, () => ({ stat: { ...pitching, battersFaced: 24, numberOfPitches: 90, outs: 18, strikeOuts: 7 } }));

test('basketball clocks support decimals, 40/48 minute regulation, halftime and overtime', () => {
  for (const [clock, expected] of [['0.0', 0], ['12:00', 720], ['1:02.5', 62.5], ['8.9', 8.9]]) assert.equal(basketballClock(clock, 12), expected);
  for (const clock of ['12:01', '0:60', '60', '-1', '', null]) assert.equal(basketballClock(clock, 12), null);
  for (const sport of ['wnba', 'nba']) {
    const f = basketballFixture(sport), event = basketballEvent(f.event, sport);
    const target = normalizeLiveBasketball(f.summary, event, sport).game;
    assert.equal(target.remainingSeconds, sport === 'nba' ? 1440 : 1200);
    f.summary.header.competitions[0].status.type.name = 'STATUS_HALFTIME';
    assert.equal(normalizeLiveBasketball(f.summary, event, sport).game.remainingSeconds, target.remainingSeconds);
    f.summary.header.competitions[0].status = { period: 5, displayClock: '5:00', type: { state: 'in' } };
    assert.equal(normalizeLiveBasketball(f.summary, event, sport).game.remainingSeconds, null);
  }
});

test('basketball normalization keeps missing stats distinct and retains ejections and fouls', () => {
  const f = basketballFixture(), row = f.summary.boxscore.players[0].statistics[0].athletes[0];
  row.stats[1] = '--'; row.ejected = true;
  const p = normalizeLiveBasketball(f.summary, basketballEvent(f.event, 'wnba'), 'wnba').players[0];
  assert.equal(p.stats.points, null); assert.equal(p.liveUnavailable, 'Ejected');
  f.summary.header.id = '999999999'; assert.throws(() => normalizeLiveBasketball(f.summary, game, 'wnba'), /another game/);
});

test('basketball projection equations retain all recorded totals in both leagues', () => {
  for (const sport of ['nba', 'wnba']) for (const market of Object.keys(liveMarkets(sport))) {
    const args = bbArgs(sport), f = projectBasketball({ ...args, market });
    assert.ok(Number.isFinite(f.projection), market);
    assert.equal(f.projection, f.current + f.breakdown.opportunities * f.breakdown.rate);
    assert.ok(f.projection >= f.current);
    assert.ok(f.breakdown.opportunities <= args.game.remainingSeconds / 60);
  }
});

test('basketball historical priors exclude future, selected, incomplete and other-team games', () => {
  const bad = [
    { ...past[0], game: { ...past[0].game, id: game.id } },
    { ...past[0], game: { ...past[0].game, date: game.date } },
    { ...past[0], game: { ...past[0].game, complete: false } },
    { ...past[0], players: [{ ...player, teamId: 'wrong' }] }
  ];
  const p = basketballPriors([...past, ...bad], game, [player]).get(player.id);
  assert.equal(p.count, past.length); assert.equal(p.minutes, 30);
});

test('basketball combined markets sum the same bounded component rates', () => {
  const args = bbArgs(), p = { ...player, stats: { ...stats, points: 90, assists: 0, rebounds: 1 } };
  const project = market => projectBasketball({ ...args, player: p, market });
  assert.ok(Math.abs(project('pra').projection - ['points', 'rebounds', 'assists'].reduce((s, m) => s + project(m).projection, 0)) < 1e-10);
});

test('basketball remaining minutes share a five-player team budget', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ ...player, id: String(i), minutes: 20 }));
  const priors = new Map(players.map(p => [p.id, { count: 5, minutes: 40 }]));
  const budgets = basketballWorkloads(players, priors, game, 'wnba');
  assert.equal([...budgets.values()].reduce((s, b) => s + b.minutes, 0), 100);
});

test('basketball stale, endgame, overtime, absent data, injuries and short samples pause projections', () => {
  const args = bbArgs();
  for (const patch of [{ stale: true }, { prior: null }, { workload: null }, { player: { ...player, minutes: null } }, { player: { ...player, liveUnavailable: 'Ejected' } }, { player: { ...player, availability: { stale: true } } }, { player: { ...player, availability: { unavailable: true } } }, { player: { ...player, stats: { ...stats, points: null } } }, ...[{ state: 'pre' }, { state: 'post' }, { period: 5 }, { remainingSeconds: 119 }, { remainingSeconds: null }, { interrupted: true }].map(g => ({ game: { ...game, ...g } }))]) assert.equal(projectBasketball({ ...args, ...patch }).projection, null, JSON.stringify(patch));
  assert.equal(projectBasketball({ ...args, player: { ...player, stats: { ...stats, points: 0 } } }).current, 0);
  assert.equal(projectBasketball({ ...args, market: 'pra', player: { ...player, stats: { ...stats, assists: null } } }).current, null);
});

test('baseball remaining outs account for both halves, transitions and regulation limits', () => {
  assert.equal(remainingBattingOuts(mlbGame, 'away'), 14); assert.equal(remainingBattingOuts(mlbGame, 'home'), 15);
  assert.equal(remainingBattingOuts({ ...mlbGame, top: false }, 'away'), 12); assert.equal(remainingBattingOuts({ ...mlbGame, top: false }, 'home'), 14);
  assert.equal(remainingBattingOuts({ ...mlbGame, outs: 3 }, 'away'), 12);
  assert.equal(remainingBattingOuts({ ...mlbGame, inning: 10 }, 'away'), null);
  assert.equal(remainingBattingOuts({ ...mlbGame, top: null }, 'away'), null);
  assert.equal(remainingBattingOuts({ ...mlbGame, inning: 9, top: false }, 'home'), 0);
});

test('baseball hitter and starter projections disclose independently recomputable opportunities', () => {
  for (const p of [batter, pitcher]) for (const [market, m] of Object.entries(liveMarkets('mlb')).filter(([, m]) => p.roles.includes(m.group))) {
    const f = projectMlb({ game: mlbGame, player: p, prior: { hitting: { rows: battingRows }, pitching: { rows: pitchingRows } }, market });
    assert.ok(Number.isFinite(f.projection), market); assert.ok(f.projection >= f.current);
    assert.equal(f.projection, f.current + f.breakdown.opportunities * f.breakdown.rate);
    if (m.group === 'hitting') assert.equal(f.breakdown.opportunities, 15 * 1.43 / 9);
    else assert.equal(f.breakdown.opportunities, 30 / (90 / 24));
  }
});

test('baseball removed players, relievers, unknown lineups, missing stats and extra innings stay withheld', () => {
  const args = { game: mlbGame, player: pitcher, prior: { pitching: { rows: pitchingRows } }, market: 'k' };
  for (const patch of [{ stale: true }, { player: { ...pitcher, currentPitcher: false } }, { player: { ...pitcher, starter: false } }, { player: { ...pitcher, liveUnavailable: 'Removed' } }, { game: { ...mlbGame, inning: 10 } }, { game: { ...mlbGame, interrupted: true } }]) assert.equal(projectMlb({ ...args, ...patch }).projection, null);
  assert.equal(projectMlb({ ...args, player: { ...batter, inLineup: null }, market: 'hits' }).projection, null);
  assert.equal(projectMlb({ ...args, player: { ...batter, stats: { hitting: { plateAppearances: 2 } } }, market: 'hits' }).current, null);
});

test('MLB history rejects same-day, future, uncompleted and relief games and deduplicates starts', () => {
  const good = { date: '2026-09-21', game: { gamePk: 800000 }, stat: pitching };
  const splits = [good, good, { ...good, date: mlbGame.officialDate }, { ...good, game: { gamePk: 799999 } }, { ...good, game: { gamePk: 799998 }, stat: { ...pitching, gamesStarted: 0 } }];
  const people = [{ id: pitcher.id, stats: [{ type: { displayName: 'gameLog' }, group: { displayName: 'pitching' }, splits }] }];
  const p = mlbPriors(people, mlbGame, [pitcher], new Set(['800000', '799998'])).get(pitcher.id);
  assert.equal(p.pitching.count, 1); assert.equal(p.pitching.rows[0].game.gamePk, 800000);
});

test('MLB normalization handles two-way athletes, current lineup membership and live pitch timestamps', () => {
  const row = { person: { id: 100, fullName: 'Two Way' }, position: { abbreviation: 'DH' }, gameStatus: { isCurrentPitcher: true }, stats: { batting, pitching } };
  const data = { gamePk: 800001, gameData: { teams: { home: { id: 1, name: 'Home', abbreviation: 'HOM' }, away: { id: 2, name: 'Away', abbreviation: 'AWY' } }, status: { abstractGameState: 'Live' } }, liveData: { boxscore: { teams: { home: { players: { ID100: row }, battingOrder: [100], pitchers: [100] }, away: { players: {} } } }, linescore: { currentInning: 5, isTopInning: true, outs: 1, teams: { home: { runs: 1 }, away: { runs: 2 } } }, plays: { currentPlay: { about: { atBatIndex: 25 }, playEvents: [{ index: 2, endTime: new Date(now).toISOString(), details: { description: 'Strike' } }] } } } };
  const n = normalizeLiveMlb(data, mlbGame); assert.deepEqual(n.players[0].roles, ['hitting', 'pitching']); assert.equal(n.players[0].inLineup, true); assert.equal(n.players[0].currentPitcher, true); assert.equal(n.game.lastPlay.at, new Date(now).toISOString());
  data.liveData.boxscore.teams.home.battingOrder = [999]; assert.equal(normalizeLiveMlb(data, mlbGame).players[0].inLineup, false);
  assert.throws(() => normalizeLiveMlb({ ...data, gamePk: 800002 }, mlbGame), /another game/);
});

test('live odds use only explicit live selections, never pregame or archived prices', () => {
  const row = { provider: { name: 'Test book' }, moneyline: { home: { close: { odds: '-110' }, live: { odds: '-150' } }, away: { close: { odds: '+100' } } }, total: { over: { live: { line: 'o161.5', odds: '-110' } }, under: { live: { line: 'u161.5', odds: '-115', suspended: true } } } };
  const receipt = { fetchedAt: new Date(now).toISOString(), url: 'https://example.com/source' };
  const live = liveGameOdds([row], game, receipt);
  assert.equal(live.books[0].markets[0].selections.length, 1); assert.equal(live.books[0].markets[0].selections[0].odds, -150);
  assert.equal(live.books[0].markets[1].selections[0].line, 161.5); assert.equal(live.books[0].markets[1].selections.length, 1);
  delete row.moneyline.home.live; delete row.total; assert.equal(liveGameOdds([row], game, receipt).status, 'unavailable');
  const archive = liveGameOdds([row], { ...game, state: 'post' }, receipt); assert.equal(archive.books[0].markets[0].selections[0].basis, 'archive');
  assert.equal(liveGameOdds([row], { ...game, state: 'pre' }, { ...receipt, stale: true }).status, 'stale');
});

test('MLB odds matching requires unique teams and start time to separate doubleheaders', () => {
  const f = basketballFixture(), first = f.event, second = { ...first, id: '401000002', date: '2026-09-23T02:00:00Z' };
  assert.equal(matchMlbOddsEvent([first, second], mlbGame).id, first.id);
  assert.equal(matchMlbOddsEvent([first, { ...first, id: '401000003' }], mlbGame), null);
  assert.equal(matchMlbOddsEvent([second], mlbGame), null);
  assert.equal(matchMlbOddsEvent([first], { ...mlbGame, teams: teams.map(t => ({ ...t, name: 'Other' })) }), null);
});

test('live cache coalesces reads, advances upstream age, and preserves good data on failure', async () => {
  let clock = now, calls = 0, broken = false;
  const feed = new LiveFeed({ now: () => clock, fetcher: async () => { calls++; if (broken) throw Error('offline'); return new Response('{"events":[]}', { headers: { age: '40' } }); } });
  const check = b => { if (!Array.isArray(b.events)) throw Error('Invalid'); };
  const [a, b] = await Promise.all([feed.read('https://example.com', check), feed.read('https://example.com', check)]);
  assert.equal(calls, 1); assert.equal(a.sha256, b.sha256); assert.equal(liveStale(a, clock), false);
  clock += 6000; assert.equal((await feed.read('https://example.com', check)).stale, true);
  clock += 10000; broken = true; const old = await feed.read('https://example.com', check);
  assert.equal(old.stale, true); assert.equal(old.fetchedAt, a.fetchedAt); assert.deepEqual(old.data, a.data);
});

test('live board rejects invalid input without I/O and exposes honest empty schedules', async () => {
  let calls = 0; const store = new LiveSportsStore({ now: () => now, fetcher: async () => { calls++; return new Response('{"events":[],"dates":[]}'); } });
  for (const patch of [{ sport: 'nfl' }, { date: '2026-02-31' }, { game: '../bad' }]) await assert.rejects(store.board({ sport: 'nba', ...patch }), e => e.status === 400);
  assert.equal(calls, 0);
  for (const sport of ['nba', 'wnba', 'mlb']) { const b = await store.board({ sport }); assert.equal(b.players.length, 0); assert.equal(b.selected, null); assert.equal(b.stale, false); }
  assert.equal(liveQuery({ sport: 'mlb' }, Date.parse('2026-09-23T01:00Z')).date, '2026-09-22');
});

test('basketball live board projects then pauses changed injury or stale play feeds', async () => {
  let clock = now, out = false; const f = basketballFixture();
  const store = new LiveSportsStore({ now: () => clock, fetcher: async url => new Response(JSON.stringify(url.includes('/injuries') ? { injuries: out ? [{ injuries: [{ athlete: { id: player.id }, status: 'Out' }] }] : [] } : url.includes('/summary') ? f.summary : f.scoreboard)) });
  store.history = async () => ({ history: past, sources: [], stale: false });
  const first = await store.board({ sport: 'wnba' }); assert.equal(first.stale, false); assert.ok(first.players[0].projections.points.projection > 12);
  clock += 16000; out = true;
  const next = await store.board({ sport: 'wnba' }); assert.equal(next.players[0].projections.points.projection, null); assert.notEqual(next.snapshot, first.snapshot);
  clock += 240000; assert.equal((await store.board({ sport: 'wnba' })).stale, true);
  await assert.rejects(store.board({ sport: 'wnba', game: '401999999' }), e => e.status === 400);
});

test('slow history reads cannot keep an aged box score actionable', async () => {
  let clock = now; const f = basketballFixture();
  const store = new LiveSportsStore({ now: () => clock, fetcher: async url => new Response(JSON.stringify(url.includes('/injuries') ? { injuries: [] } : url.includes('/summary') ? f.summary : f.scoreboard)) });
  store.history = async () => { clock += 46000; return { history: past, sources: [], stale: false }; };
  const result = await store.board({ sport: 'wnba' }); assert.equal(result.stale, true); assert.equal(result.players[0].projections.points.projection, null);
});

test('halftime allows a break but cannot keep a frozen scoreboard actionable indefinitely', async () => {
  let clock = now; const f = basketballFixture(); f.summary.header.competitions[0].status.type.name = 'STATUS_HALFTIME';
  const store = new LiveSportsStore({ now: () => clock, fetcher: async url => new Response(JSON.stringify(url.includes('/injuries') ? { injuries: [] } : url.includes('/summary') ? f.summary : f.scoreboard)) });
  store.history = async () => ({ history: past, sources: [], stale: false });
  clock += 15 * 60000; assert.equal((await store.board({ sport: 'wnba' })).stale, false);
  clock += 11 * 60000; assert.equal((await store.board({ sport: 'wnba' })).stale, true);
});

test('live cache rejects malformed replacements and failed empty schedules remain stale', async () => {
  let clock = now, bad = false;
  const feed = new LiveFeed({ now: () => clock, fetcher: async () => new Response(bad ? '{}' : '{"events":[]}') });
  const check = data => { if (!Array.isArray(data.events)) throw Error('Malformed'); };
  const first = await feed.read('https://example.com/scoreboard', check); clock += 16000; bad = true;
  const next = await feed.read('https://example.com/scoreboard', check);
  assert.equal(next.sha256, first.sha256); assert.equal(next.stale, true);
  const store = new LiveSportsStore({ now: () => clock, fetcher: async () => { throw Error('offline'); } });
  const empty = await store.board({ sport: 'nba' }); assert.equal(empty.stale, true); assert.match(empty.warnings[0], /offline/);
});
