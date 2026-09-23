import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGamePrior, projectLiveGame, compareGameMarkets, impliedProbability, fairAmerican, nflGameHistory, mlbGameHistory } from '../lib/live-game-model.mjs';
import { gameOddsHtml, gameOddsFreshness } from '../public/live-game.js';
import { LiveNflStore } from '../lib/live-nfl.mjs';
import { LiveSportsStore } from '../lib/live-sports.mjs';

const now = Date.parse('2026-09-22T22:00:00Z');
const gameFor = sport => ({ id: '401234567', sport, date: '2026-09-22T21:00:00Z', state: 'in', period: 3,
  remainingSeconds: { nfl: 1800, nba: 1440, wnba: 1200 }[sport], possession: 'h',
  inning: 5, outs: 1, top: true, scheduledInnings: 9, bases: ['second'], regularSeason: true,
  teams: [{ id: 'a', abbreviation: 'AWY', homeAway: 'away', score: sport === 'mlb' ? 2 : 20 }, { id: 'h', abbreviation: 'HME', homeAway: 'home', score: sport === 'mlb' ? 3 : 24 }] });
const historyFor = sport => Array.from({ length: 40 }, (_, i) => ({ id: 'past-' + i, date: new Date(now - (i + 1) * 86400000).toISOString(), complete: true,
  home: sport === 'nfl' ? i % 2 ? 'AWY' : 'HME' : i % 2 ? 'a' : 'h', away: sport === 'nfl' ? i % 2 ? 'HME' : 'AWY' : i % 2 ? 'h' : 'a',
  homeScore: (sport === 'mlb' ? 4 : sport === 'nfl' ? 22 : sport === 'nba' ? 112 : 81) + i % 5,
  awayScore: (sport === 'mlb' ? 3 : sport === 'nfl' ? 20 : sport === 'nba' ? 110 : 79) + i % 7 }));
const odds = { status: 'available', fetchedAt: new Date(now).toISOString(), books: [{ name: 'Example book', markets: [
  { key: 'moneyline', label: 'Moneyline', selections: [{ side: 'home', label: 'HME', odds: -150, line: null, basis: 'live' }, { side: 'away', label: 'AWY', odds: 130, line: null, basis: 'live' }] },
  { key: 'pointSpread', label: 'Spread', selections: [{ side: 'home', label: 'HME', odds: -110, line: -3, basis: 'live' }, { side: 'away', label: 'AWY', odds: -110, line: 3, basis: 'live' }] },
  { key: 'total', label: 'Total', selections: [{ side: 'over', label: 'over', odds: -110, line: 60, basis: 'live' }, { side: 'under', label: 'under', odds: -110, line: 60, basis: 'live' }] },
] }] };
const args = sport => ({ sport, game: gameFor(sport), history: historyFor(sport), odds, now, simulations: 3000 });

test('American fair prices and market implied probabilities round trip', () => {
  assert.equal(fairAmerican(.8), -400); assert.equal(fairAmerican(.2), 400);
  assert.equal(impliedProbability(-400), .8); assert.equal(impliedProbability(400), .2);
  assert.equal(impliedProbability(-50), null); assert.equal(fairAmerican(null), null);
  assert.equal(fairAmerican(.999999), -19900);
});
test('historical priors exclude same-day, future, incomplete, ancient and duplicate results', () => {
  const a = args('nfl'), original = buildGamePrior(a);
  const extra = { ...a.history[0], homeScore: 999, awayScore: 0 };
  const result = buildGamePrior({ ...a, history: [...a.history, a.history[0], { ...extra, id: 'same', date: '2026-09-22T00:00Z' }, { ...extra, id: 'future', date: '2026-10-01' }, { ...extra, id: 'old', date: '2020-01-01' }, { ...extra, id: 'incomplete', complete: false }] });
  assert.deepEqual(result, original);
  assert.ok(original.teams.home.historyWeight > 0 && original.teams.home.historyWeight < 1);
});
test('all four sports produce reproducible independent fair odds and coherent moneylines', () => {
  for (const sport of ['nfl', 'nba', 'wnba', 'mlb']) {
    const a = args(sport), result = projectLiveGame(a);
    assert.equal(result.status, 'experimental', sport); assert.deepEqual(result, projectLiveGame(a));
    assert.equal(result.teams.length, 2); assert.equal(result.books[0].markets.length, 3);
    const [away, home] = result.teams;
    assert.ok(Math.abs(away.probability + home.probability + home.pushProbability - 1) < 1e-12);
    assert.ok(away.projectedScore >= a.game.teams[0].score && home.projectedScore >= a.game.teams[1].score);
    assert.ok(Math.abs(result.projectedTotal - away.projectedScore - home.projectedScore) < 1e-9);
    assert.ok(result.reasons.some(r => /earlier games/.test(r)));
    const changed = structuredClone(a); changed.odds.books[0].markets[0].selections[0].odds = -900;
    assert.deepEqual(projectLiveGame(changed).teams, result.teams, 'Market price must not change the model');
  }
});
test('score and clock move win probabilities in the expected direction', () => {
  const a = args('nfl'), tied = structuredClone(a); tied.game.teams[1].score = 20;
  const lead = projectLiveGame(a).teams[1].probability;
  assert.ok(lead > projectLiveGame(tied).teams[1].probability);
  const late = structuredClone(a); late.game.remainingSeconds = 300; late.game.period = 4;
  assert.ok(projectLiveGame(late).teams[1].probability > lead);
});
test('market comparison handles integer pushes, spread signs and no-vig normalization', () => {
  const result = compareGameMarkets(odds, [[20, 23], [20, 24], [20, 19], [30, 30]])[0];
  for (const market of result.markets) {
    const [a, b] = market.selections;
    assert.ok(Math.abs(a.marketProbability + b.marketProbability - 1) < 1e-12);
    assert.ok(Math.abs(a.probability + b.probability + a.pushProbability - 1) < 1e-12);
  }
  const spread = result.markets[1].selections[0];
  assert.equal(spread.pushProbability, .2); assert.equal(spread.probability, .3);
  assert.equal(spread.conditionalProbability, .3 / .8);
  const unpaired = structuredClone(odds); unpaired.books[0].markets[1].selections[1].line = 4;
  assert.equal(compareGameMarkets(unpaired, [[20, 23]])[0].markets[1].selections[0].marketProbability, null);
});
test('stale, missing, interrupted, final, endgame and overtime states withhold estimates', () => {
  for (const patch of [{ stale: true }, { historyStale: true }, { history: [] }]) assert.equal(projectLiveGame({ ...args('nba'), ...patch }).status, 'withheld');
  for (const patch of [{ state: 'pre' }, { state: 'post' }, { interrupted: true }, { remainingSeconds: 120 }, { remainingSeconds: null }, { period: 5 }, { teams: [] }]) {
    const a = args('nba'); Object.assign(a.game, patch); assert.equal(projectLiveGame(a).status, 'withheld');
  }
  for (const patch of [{ inning: 10 }, { bases: null }, { outs: 3 }, { top: null }, { scheduledInnings: 7 }]) {
    const a = args('mlb'); Object.assign(a.game, patch); assert.equal(projectLiveGame(a).status, 'withheld');
  }
});
test('stale or pregame quotes cannot be compared, but independent forecasts remain', () => {
  for (const patch of [{ status: 'stale' }, { fetchedAt: new Date(now - 46000).toISOString() }, { sourceAgeMs: 46000 }, { fetchedAt: new Date(now + 6000).toISOString() }]) {
    const r = projectLiveGame({ ...args('nfl'), odds: { ...odds, ...patch } }); assert.equal(r.status, 'experimental'); assert.equal(r.books.length, 0);
  }
  const a = args('nfl'); a.odds = structuredClone(odds); a.odds.books.forEach(b => b.markets.forEach(m => m.selections.forEach(s => { s.basis = 'pregame'; })));
  assert.equal(projectLiveGame(a).books[0].markets.length, 0);
});
test('baseball home team can skip its last half inning and never loses recorded runs', () => {
  const a = args('mlb'); Object.assign(a.game, { inning: 9, top: true, outs: 2, bases: [] }); a.game.teams[1].score = 30;
  const result = projectLiveGame(a);
  assert.equal(result.teams[1].projectedScore, 30);
  assert.ok(result.teams[1].probability > .99);
});
test('history adapters preserve missing scores and exclude exhibition games', () => {
  const nfl = nflGameHistory([{ game_id: 'x', gameday: '2025-01-01', home_team: 'LA', away_team: 'WAS', home_score: '', away_score: '7' }, { game_type: 'PRE' }]);
  assert.equal(nfl.length, 1); assert.equal(nfl[0].home, 'LAR'); assert.equal(nfl[0].complete, false);
  assert.deepEqual(mlbGameHistory([{ gameType: 'S' }]), []);
});
test('rendered comparisons expose reasons, caveats and escaping; freshness expires in the browser', () => {
  const a = args('nfl'), gameModel = projectLiveGame(a), data = { game: a.game, odds, gameModel, fetchedAt: new Date(now).toISOString() };
  const html = gameOddsHtml(data);
  for (const text of ['Why the model believes this', 'Model fair odds', 'Market chance', 'Push', 'not a guaranteed betting edge', 'Experimental']) assert.ok(html.includes(text), text);
  const escaped = structuredClone(data); escaped.odds.books[0].name = '<img onerror=bad>';
  assert.ok(!gameOddsHtml(escaped).includes('<img onerror'));
  assert.deepEqual(gameOddsFreshness(data, '', now), { modelStale: false, oddsStale: false });
  assert.deepEqual(gameOddsFreshness(data, '', now + 46000), { modelStale: true, oddsStale: true });
  assert.equal(gameOddsFreshness({ ...data, sourceAgeMs: 45001 }, '', now).modelStale, true);
  assert.equal(gameOddsHtml({}), '');
});

test('NFL API returns prices and fair odds even when player history fails; slow feeds pause both', async () => {
  let clock = now;
  const a = args('nfl'), competitors = a.game.teams.map(t => ({ team: { id: t.id, abbreviation: t.abbreviation, displayName: t.abbreviation }, homeAway: t.homeAway, score: t.score }));
  const status = { period: 3, displayClock: '15:00', type: { state: 'in' } }, competition = { competitors, status, situation: { possession: 'h' } };
  const event = { id: a.game.id, date: a.game.date, season: { year: 2026, type: 2 }, competitions: [competition] };
  const summary = { header: { ...event }, boxscore: { players: [], teams: [] }, drives: { current: { plays: [{ id: '1', wallclock: new Date(clock).toISOString() }] } }, pickcenter: [{ provider: { displayName: 'Example' }, moneyline: { home: { live: { odds: -150 } }, away: { live: { odds: 130 } } } }] };
  const schedule = a.history.map(g => ({ game_id: g.id, gameday: g.date.slice(0, 10), home_team: g.home, away_team: g.away, home_score: g.homeScore, away_score: g.awayScore, game_type: 'REG' }));
  const store = new LiveNflStore({ now: () => clock, provider: { load: async key => { if (key !== 'schedule') throw Error('Player history offline'); return { rows: schedule, meta: { available: true, stale: false } }; } }, availability: { load: async () => ({ stale: false }), forPlayer: () => null },
    fetcher: async url => new Response(JSON.stringify(url.includes('/summary') ? summary : { events: [event] })) });
  const result = await store.board();
  assert.equal(result.gameModel.status, 'experimental'); assert.equal(result.gameModel.books[0].markets[0].selections[0].odds, 130);
  assert.equal(result.stale, true); assert.equal(result.gameDataStale, false);
  assert.equal(gameOddsFreshness(result, '', clock).modelStale, false);
  clock += 240000; assert.equal((await store.board()).gameModel.status, 'withheld');
});

test('basketball API exposes the game model from completed team history without player boxes', async () => {
  const a = args('wnba'), competition = { competitors: a.game.teams.map(t => ({ team: { id: t.id, abbreviation: t.abbreviation, displayName: t.abbreviation }, homeAway: t.homeAway, score: t.score })), status: { period: 3, displayClock: '10:00', type: { state: 'in' } } };
  const event = { id: a.game.id, date: a.game.date, season: { year: 2026, type: 2 }, competitions: [competition] };
  const summary = { header: event, boxscore: { teams: [], players: [] }, plays: [{ id: '1', wallclock: new Date(now).toISOString() }] };
  const store = new LiveSportsStore({ now: () => now, fetcher: async url => new Response(JSON.stringify(url.includes('/injuries') ? { injuries: [] } : url.includes('/summary') ? summary : { events: [event] })) });
  store.history = async () => ({ gameHistory: a.history, gameHistoryStale: false, history: [], sources: [], stale: true });
  const result = await store.board({ sport: 'wnba', date: '2026-09-22' });
  assert.equal(result.gameModel.status, 'experimental'); assert.equal(result.gameModel.teams.length, 2);
});
