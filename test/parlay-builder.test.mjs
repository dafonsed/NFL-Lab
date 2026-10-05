import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HALF_LIFE, TREND_WEIGHT, TREND_CAP, MODEL_WEIGHT, MODEL_CAP, PRICE_CALIBRATION, evaluateSide, qualifyingSides, buildParlay, relaxations, legReasons, legSummary, slateMargins, record, toAmerican, toDecimal, impliedChance } from '../public/parlay-builder.js';
import { boardLegs, createParlayPool } from '../lib/parlay-pool.mjs';
import { requiredFeature } from '../lib/accounts/entitlements.mjs';
import { productTools, sportDestination, workspaceProduct } from '../public/navigation.js';
import { siteContext } from '../lib/site-layout.mjs';

const NOW = Date.parse('2026-10-05T12:00:00Z'), LATER = '2026-10-06T00:15:00.000Z';
const history = (values, { home = 1, opponent = 'LV', versus = [] } = {}) => values.map((value, i) => [`2026-09-${String(28 - i).padStart(2, '0')}`, value, home, versus.includes(i) ? 1 : 0, opponent]);
const leg = (overrides = {}) => ({ id: 'g1:p1:rec_yds', key: 'nfl:g1:p1:rec_yds', player: 'Player One', playerId: 'p1', team: 'NO', opponent: 'ATL', position: 'WR', gameId: 'g1', game: 'ATL @ NO', home: true, start: LATER, market: 'rec_yds', line: 50.5, book: 'FanDuel', books: 3, over: -110, under: -110, projection: null, model: null, status: 'Active', concern: false, lineup: null, matchup: null, pitcher: null, games: history([60, 70, 40, 80, 55, 65, 30, 90, 75, 52]), ...overrides });

test('odds conversions', () => {
  assert.equal(toDecimal(-110).toFixed(4), '1.9091');
  assert.equal(toDecimal(150), 2.5);
  assert.equal(toAmerican(2.5), 150);
  assert.equal(toAmerican(1.5), -200);
  assert.equal(impliedChance(-200).toFixed(4), '0.6667');
});

test('a side starts from the calibrated price; the trend moves it at most TREND_WEIGHT × TREND_CAP, the model by MODEL_WEIGHT of its gap', () => {
  const c = evaluateSide(leg({ model: { over: 0.6, under: 0.4 } }), 'over', { window: '10' });
  // 8 of 10 over 50.5 (misses: 40 and 30 at positions 2 and 6).
  assert.deepEqual([c.recent.hits, c.recent.n, c.recent.rate], [8, 10, 0.8]);
  let weight = 0, hits = 0;
  [1, 1, 0, 1, 1, 1, 0, 1, 1, 1].forEach((hit, i) => { const w = 0.5 ** (i / HALF_LIFE); weight += w; hits += w * hit; });
  assert.ok(Math.abs(c.trend - hits / weight) < 1e-12);
  assert.ok(Math.abs(c.market - 0.5) < 1e-12, 'a -110/-110 line is 50% no-vig');
  assert.equal(c.priced, 0.5, 'no calibration without a sport');
  assert.ok(Math.abs(c.trendShift - TREND_WEIGHT * TREND_CAP) < 1e-12, 'a hot trend is capped');
  assert.ok(Math.abs(c.modelShift - MODEL_WEIGHT * Math.min(0.1, MODEL_CAP)) < 1e-12, 'the model gap is capped too');
  assert.ok(Math.abs(c.chance - (0.5 + TREND_WEIGHT * TREND_CAP + MODEL_WEIGHT * Math.min(0.1, MODEL_CAP))) < 1e-12);
  assert.ok(Math.abs(c.ev - (c.chance * toDecimal(-110) - 1)) < 1e-12);
  assert.ok(Math.abs(c.gap - 0.3) < 1e-12);
  // A cold record pulls the other way by no more than the cap.
  const under = evaluateSide(leg(), 'under');
  assert.equal(under.recent.hits, 2);
  assert.ok(Math.abs(under.chance - (0.5 - TREND_WEIGHT * TREND_CAP)) < 1e-12);
  assert.equal(evaluateSide(leg({ under: null }), 'under'), null);
  // MLB: favorites hit more often than their no-vig price; one-sided prices overstate.
  const [a, b] = PRICE_CALIBRATION.mlb.two, fav = evaluateSide(leg({ over: -200, under: 165, games: [] }), 'over', { sport: 'mlb' });
  assert.ok(Math.abs(fav.priced - 1 / (1 + Math.exp(-(a + b * Math.log(fav.market / (1 - fav.market)))))) < 1e-12);
  assert.ok(fav.priced > fav.market && fav.chance === fav.priced, 'no games: the calibrated price alone');
  const single = evaluateSide(leg({ under: null, games: [] }), 'over', { sport: 'mlb' });
  assert.ok(single.priced < single.market, 'an MLB one-sided price is marked down');
  const nfl = evaluateSide(leg({ over: -200, under: 165, games: [] }), 'over', { sport: 'nfl' });
  assert.equal(nfl.priced, nfl.market, 'other sports use the price as is');
});

test('a one-sided price loses the margin two-sided lines of its market carry on the same slate', () => {
  const twoSided = [-120, -115, -110].map((o, i) => leg({ id: 'x' + i, over: o, under: -110 }));
  const margin = slateMargins([...twoSided, leg({ id: 'single', under: null })]);
  const median = impliedChance(-115) + impliedChance(-110);
  assert.ok(Math.abs(margin('rec_yds') - median) < 1e-12);
  const c = evaluateSide(leg({ under: null }), 'over', { margin });
  assert.equal(c.twoSided, false);
  assert.ok(Math.abs(c.market - impliedChance(-110) / median) < 1e-12);
  assert.equal(slateMargins([])('rec'), 1.05);
});

test('pushes count against the hit rate, as on the Trends table', () => {
  assert.deepEqual(record(history([3, 4, 5]), 4, 'over'), { n: 3, hits: 1, pushes: 1, rate: 1 / 3, values: [3, 4, 5] });
});

test('qualifying sides respect the threshold, window, favorite limit, markets, injuries and start time', () => {
  const hot = leg({ id: 'hot', playerId: 'h' });                                              // 8/10 over
  const cold = leg({ id: 'cold', playerId: 'c', games: history([10, 20, 60, 10, 20, 10, 20, 10, 20, 10]) }); // 9/10 under
  const started = leg({ id: 'started', playerId: 's', start: '2026-10-05T11:00:00Z' });
  const hurt = leg({ id: 'hurt', playerId: 'q', concern: true, status: 'Questionable' });
  const juiced = leg({ id: 'juiced', playerId: 'j', over: -400, under: 300 });
  const short = leg({ id: 'short', playerId: 'n', games: history([60, 70, 80]) });
  const pool = { legs: [hot, cold, started, hurt, juiced, short] };
  const ids = settings => qualifyingSides(pool, settings, NOW).map(c => c.id).sort();
  assert.deepEqual(ids({ threshold: 70 }), ['cold:under', 'hot:over']);
  assert.deepEqual(ids({ threshold: 70, side: 'over' }), ['hot:over']);
  assert.deepEqual(ids({ threshold: 85 }), ['cold:under']);
  assert.deepEqual(ids({ threshold: 70, skipInjured: false, maxFavorite: null }), ['cold:under', 'hot:over', 'hurt:over', 'juiced:over']);
  assert.deepEqual(ids({ threshold: 70, markets: ['rec'] }), []);
  assert.deepEqual(ids({ threshold: 70, excluded: ['hot:over'] }), ['cold:under']);
  // Fewer than 5 games never qualifies; a 5-game window needs all 5.
  assert.ok(!ids({ threshold: 50, window: '5' }).includes('short:over'));
});

test('the ticket takes the best sides, one per player and per-game limit, and prices the parlay', () => {
  const a = leg({ id: 'a', playerId: 'a', gameId: 'g1' });
  const a2 = leg({ id: 'a2', playerId: 'a', gameId: 'g1', market: 'rec', line: 4.5, games: history([6, 7, 5, 8, 6, 7, 5, 6, 9, 6]) });
  const b = leg({ id: 'b', playerId: 'b', gameId: 'g1', over: 120, under: -140 });
  const c = leg({ id: 'c', playerId: 'c', gameId: 'g2', over: -105, under: -115 });
  const d = leg({ id: 'd', playerId: 'd', gameId: 'g3', over: -150, under: 130, games: history([60, 70, 80, 90, 60, 70, 80, 90, 60, 70]) });
  const pool = { legs: [a, a2, b, c, d] };
  const value = buildParlay(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW);
  assert.equal(value.legs.length, 3);
  assert.equal(new Set(value.legs.map(x => x.leg.gameId)).size, 3, 'one leg per game');
  assert.equal(new Set(value.legs.map(x => x.leg.playerId)).size, 3, 'one leg per player');
  const scores = value.legs.map(x => Math.log(x.chance * x.decimal));
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  const t = value.ticket, decimal = value.legs.reduce((p, x) => p * x.decimal, 1);
  assert.ok(Math.abs(t.decimal - decimal) < 1e-12);
  assert.equal(t.american, toAmerican(decimal));
  assert.ok(Math.abs(t.payout - 10 * decimal) < 1e-9);
  assert.ok(Math.abs(t.chance - value.legs.reduce((p, x) => p * x.chance, 1)) < 1e-12);
  assert.ok(Math.abs(t.ev - (value.legs.reduce((p, x) => p * x.chance * x.decimal, 1) - 1)) < 1e-12);
  assert.ok(Math.abs(t.breakEven - 1 / decimal) < 1e-12);
  assert.equal(t.sameGame, false);
  assert.ok(value.bench.every(x => x.blocked), 'every bench row says why it is out');
  assert.ok(value.bench.some(x => x.blocked.reason === 'game' || x.blocked.reason === 'player'));
  // "Most likely" ranks by chance alone: d's 100% run at -150 beats b's +120.
  const safe = buildParlay(pool, { legs: 2, threshold: 70, goal: 'safe', perGame: 'any' }, NOW);
  assert.equal(safe.legs[0].leg.id, 'd');
  const chances = safe.legs.map(x => x.chance);
  assert.deepEqual(chances, [...chances].sort((x, y) => y - x));
  const sameGame = buildParlay(pool, { legs: 4, threshold: 70, perGame: 'any' }, NOW);
  assert.equal(sameGame.ticket.sameGame, true);
});

test('when too few sides qualify, the builder names the change that adds legs', () => {
  const pool = { legs: ['a', 'b', 'c'].map(id => leg({ id, playerId: id, gameId: 'only' })) };
  const result = buildParlay(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW);
  assert.equal(result.legs.length, 1);
  assert.equal(result.short, true);
  const tips = relaxations(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW);
  assert.deepEqual(tips, [{ changes: { perGame: 'any' }, legs: 3 }]);
});

test('each leg explains itself with its record, cushion, misses, matchup, model and price', () => {
  const c = evaluateSide(leg({ projection: 62.3, model: { over: 0.58, under: 0.42 }, matchup: { rate: 165, league: 150, unit: 'WR production per opponent game' }, games: history([60, 70, 40, 80, 55, 65, 30, 90, 75, 52], { versus: [3] }) }), 'over');
  c.rank = 1;
  const text = legReasons(c, { unit: 'yards' }).map(r => r.tone + ': ' + r.text);
  assert.ok(text.includes('good: Over 50.5 in 8 of the last 10 games (80%).'));
  assert.ok(text.some(t => /^good: Averaging 61\.7 yards \(median 62\.5\) in that stretch: 11\.2 above the line\.$/.test(t)), text.join('\n'));
  assert.ok(text.includes('info: Misses in that stretch: 40, 30 (worst 30, 20.5 short).'));
  assert.ok(text.includes('good: Against ATL: 1 of 1 (80).'));
  assert.ok(text.includes('good: ATL allows 10% more than the league average (WR production per opponent game).'));
  assert.ok(text.some(t => t.startsWith('good: Our projection: 62.3 yards, 11.8 above the line; the model gives the Over 58%')));
  assert.ok(text.includes('info: FanDuel -110: no-vig chance 50.0%. Adding the trend +1 pt and our model +0.5 pts gives 51.5%, an expected return of -1.7% per dollar.'), text.join('\n'));
  assert.ok(text.some(t => t.startsWith('warn: Red flag: the trend says 80% but the price says 50%.')));
  assert.equal(legSummary(c, { goal: 'value', qualifying: 12 }), '#1 of 12 qualifying lines by value: 52% to hit at -110, an expected return of -1.7% per dollar; no qualifying line beats its price, and this one gives up the least.');
  assert.equal(legSummary(c, { goal: 'safe', qualifying: 12 }), '#1 of 12 qualifying lines by chance to hit: 52% by our estimate, on a 80% trend priced at -110.');
  const fair = evaluateSide(leg({ games: history([52, 49, 55, 48, 56, 40, 53, 47, 51, 58]) }), 'over');
  assert.ok(!legReasons(fair).some(r => r.text.startsWith('Red flag')), 'a trend near its price is no red flag');
  const hurt = evaluateSide(leg({ concern: true, status: 'Questionable', books: 1 }), 'over');
  const warnings = legReasons(hurt).filter(r => r.tone === 'warn').map(r => r.text);
  assert.ok(warnings.includes('Injury report: Questionable.'));
  assert.ok(warnings.includes('Only one book posts this line.'));
});

const nflBoard = () => ({
  current: { season: 2026, week: 4 }, weeks: [{ season: 2026, week: 4 }, { season: 2026, week: 5 }],
  lines: [{ gameId: 'g1', home: 'NO', away: 'ATL', date: '2026-10-05' }, { gameId: 'g0', home: 'CLE', away: 'PIT', date: '2026-10-01' }],
  players: [
    { gameId: 'g1', playerId: 'p1', player: 'Open Line', team: 'NO', opponent: 'ATL', position: 'WR', prop: { line: 50.5, prices: { over: { american: -110 }, under: { american: -110 } }, bookmaker: 'FanDuel', lineBooks: 3, commenceTime: LATER, fetchedAt: '2026-10-05T11:00:00Z', basis: 'captured_pregame', stale: false }, forecast: { status: 'experimental', point: 55, probability: { over: 0.55, under: 0.45 }, availability: { status: 'Active' }, modelContext: { opponent: { available: true, rate: 160, leagueRate: 150, unit: 'WR production per opponent game' } } }, trendGames: [{ gameId: 'a', date: '2026-09-27', home: true, opponent: 'ATL', value: 60 }, { gameId: 'b', date: '2026-09-20', home: false, opponent: 'LV', value: 40 }] },
    { gameId: 'g1', playerId: 'p2', player: 'Stale Line', team: 'NO', opponent: 'ATL', position: 'WR', prop: { line: 40.5, prices: { over: { american: -110 } }, commenceTime: LATER, stale: true }, forecast: {}, trendGames: [{ date: '2026-09-27', value: 50 }] },
    { gameId: 'g0', playerId: 'p3', player: 'Started', team: 'CLE', opponent: 'PIT', position: 'WR', prop: { line: 40.5, prices: { over: { american: -110 } }, commenceTime: '2026-10-01T17:00:00Z' }, forecast: {}, trendGames: [{ date: '2026-09-27', value: 50 }] },
    { gameId: 'g1', playerId: 'p4', player: 'No Price', team: 'ATL', opponent: 'NO', position: 'WR', prop: { line: 40.5, prices: {}, commenceTime: LATER }, forecast: {}, trendGames: [] },
    { gameId: 'g1', playerId: 'p5', player: 'Ruled Out', team: 'ATL', opponent: 'NO', position: 'WR', prop: { line: 40.5, prices: { over: { american: 100 } }, commenceTime: LATER }, forecast: { availability: { status: 'Out', unavailable: true } }, trendGames: [] },
  ]
});

test('the pool keeps open, priced, unexpired lines with the trends history and opponent flags', () => {
  const legs = boardLegs('nfl', 'rec_yds', nflBoard(), NOW);
  assert.equal(legs.length, 1);
  const [l] = legs;
  assert.equal(l.id, 'g1:p1:rec_yds');
  assert.equal(l.key, 'nfl:g1:p1:rec_yds');
  assert.equal(l.game, 'ATL @ NO');
  assert.equal(l.home, true);
  assert.deepEqual([l.line, l.over, l.under, l.book, l.books], [50.5, -110, -110, 'FanDuel', 3]);
  assert.deepEqual(l.model, { over: 0.55, under: 0.45 });
  assert.deepEqual(l.matchup, { rate: 160, league: 150, unit: 'WR production per opponent game' });
  assert.deepEqual(l.games, [['2026-09-27', 60, 1, 1, 'ATL'], ['2026-09-20', 40, 0, 0, 'LV']]);
});

test('the pool covers every market, reuses a recent build and reports a market that failed', async () => {
  let calls = 0;
  const nfl = { board: async ({ market }) => { calls++; if (market === 'pass_yds') throw Error('down'); return { ...nflBoard(), market }; } };
  let time = NOW;
  const pool = createParlayPool({ nfl }, { now: () => time });
  const data = await pool({ sport: 'nfl' });
  assert.equal(calls, 11);
  assert.deepEqual(data.slate, { season: 2026, week: 4 });
  assert.equal(data.legs.length, 10, 'one open line per market that loaded');
  assert.equal(data.markets.rec_yds.label, 'Receiving yards');
  assert.ok(data.notes.some(n => n.includes('pass_yds')));
  assert.deepEqual(data.games, [{ id: 'g1', label: 'ATL @ NO', start: LATER }]);
  await pool({ sport: 'nfl' });
  assert.equal(calls, 11, 'cached');
  time += 121_000;
  await pool({ sport: 'nfl' });
  assert.equal(calls, 22, 'rebuilt after two minutes');
  await assert.rejects(pool({ sport: 'golf' }), /supported sport/);
  const soccer = await createParlayPool({}, { now: () => NOW })({ sport: 'soccer', date: '2026-10-05' });
  assert.deepEqual(soccer.legs, []);
  assert.ok(soccer.notes[0].includes('soccer'));
});

test('the parlay builder lives in the Trends workspace and its data needs the research plan', async () => {
  assert.equal(requiredFeature('/api/trends/parlay'), 'research');
  assert.deepEqual(siteContext(new URL('https://x.test/nfl?view=parlay')), { sport: 'nfl', section: 'parlay' });
  assert.equal(workspaceProduct('parlay'), 'trends');
  assert.ok(productTools('trends', 'mlb').some(t => t.key === 'parlay' && t.href === '/mlb?view=parlay'));
  assert.equal(sportDestination('nhl', 'parlay'), '/nhl?view=parlay');
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.ok(server.split('\n').find(line => line.includes("url.pathname === '/api/trends/parlay'"))?.includes('sharedJson('));
  assert.match(server, /context\.section === 'parlay' \? 'parlay\.html'/);
  const html = await readFile(new URL('../public/parlay.html', import.meta.url), 'utf8');
  for (const file of ['parlay-builder.js', 'ev-advanced-math.js', 'account-sync.js', 'product-ui.js', 'research-data.js', 'ui-icons.js']) assert.ok(html.includes(`rel="modulepreload" href="/${file}"`), file);
});
