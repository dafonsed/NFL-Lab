import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HALF_LIFE, BASE_WEIGHT, FAR_LINE, milestoneSteps, bestAlternateLine, evaluateSide, qualifyingSides, buildParlay, relaxations, legReasons, legSummary, slateBaseRates, weightedTrend, record, toAmerican, toDecimal } from '../public/parlay-builder.js';
import { boardLegs, createParlayPool, createSnapshotStore } from '../lib/parlay-pool.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requiredFeature } from '../lib/accounts/entitlements.mjs';
import { productTools, sportDestination, workspaceProduct } from '../public/navigation.js';
import { siteContext } from '../lib/site-layout.mjs';

const NOW = Date.parse('2026-10-05T12:00:00Z'), LATER = '2026-10-06T00:15:00.000Z';
const history = (values, { home = 1, opponent = 'LV', versus = [] } = {}) => values.map((value, i) => [`2026-09-${String(28 - i).padStart(2, '0')}`, value, home, versus.includes(i) ? 1 : 0, opponent]);
const leg = (overrides = {}) => ({ id: 'g1:p1:rec_yds', key: 'nfl:g1:p1:rec_yds', player: 'Player One', playerId: 'p1', team: 'NO', opponent: 'ATL', position: 'WR', gameId: 'g1', game: 'ATL @ NO', home: true, start: LATER, market: 'rec_yds', line: 50.5, book: 'FanDuel', books: 3, over: -110, under: -110, projection: null, status: 'Active', concern: false, lineup: null, matchup: null, pitcher: null, games: history([60, 70, 40, 80, 55, 65, 30, 90, 75, 52]), ...overrides });
const memorySnapshots = () => { const saved = new Map(); return { saved, read: async key => saved.get(key) ?? null, write: async (key, value) => { saved.set(key, JSON.parse(JSON.stringify(value))); } }; };

test('odds conversions', () => {
  assert.equal(toDecimal(-110).toFixed(4), '1.9091');
  assert.equal(toDecimal(150), 2.5);
  assert.equal(toAmerican(2.5), 150);
  assert.equal(toAmerican(1.5), -200);
});

test('the expected hit rate blends recency-weighted games with the slate base rate, worth BASE_WEIGHT games', () => {
  const c = evaluateSide(leg(), 'over', { window: '10', base: () => 0.45 });
  // 8 of 10 over 50.5 (misses: 40 and 30 at positions 2 and 6).
  assert.deepEqual([c.recent.hits, c.recent.n, c.recent.rate], [8, 10, 0.8]);
  let weight = 0, hits = 0;
  [1, 1, 0, 1, 1, 1, 0, 1, 1, 1].forEach((hit, i) => { const w = 0.5 ** (i / HALF_LIFE); weight += w; hits += w * hit; });
  assert.ok(Math.abs(c.trend - hits / weight) < 1e-12);
  assert.ok(Math.abs(c.chance - (hits + BASE_WEIGHT * 0.45) / (weight + BASE_WEIGHT)) < 1e-12);
  assert.equal(c.baseRate, 0.45);
  assert.ok(c.chance > 0.45 && c.chance < 0.8, 'between the slate rate and the raw trend');
  // A longer record pulls further from the base rate than a short one with the same hit rate.
  const short = evaluateSide(leg({ games: history([60, 70, 80, 90, 55]) }), 'over', { base: () => 0.45 });
  const long = evaluateSide(leg({ games: history(Array(20).fill(60)) }), 'over', { base: () => 0.45 });
  assert.ok(long.chance > short.chance);
  assert.equal(evaluateSide(leg({ under: null }), 'under'), null, 'a side needs a posted price for the payout');
  assert.deepEqual(weightedTrend([], 1, 'over'), { rate: null, weight: 0 });
});

test('the slate base rate is the market-and-side average, else the side average, else 50%', () => {
  const recs = ['a', 'b', 'c', 'd', 'e'].map(id => leg({ id, games: history([60, 60, 60, 60, 40]) }));
  const base = slateBaseRates([...recs, leg({ id: 'r', market: 'rec', line: 4.5, games: history([1, 1, 1, 1, 1]) })]);
  const overRate = weightedTrend(recs[0].games, 50.5, 'over').rate;
  assert.ok(Math.abs(base('rec_yds', 'over') - overRate) < 1e-12);
  // Only one 'rec' leg: falls back to every Over on the slate.
  assert.ok(Math.abs(base('rec', 'over') - 5 * overRate / 6) < 1e-12);
  assert.equal(slateBaseRates([])('rec', 'under'), 0.5);
});

test('pushes count against the hit rate, as on the Trends table', () => {
  assert.deepEqual(record(history([3, 4, 5]), 4, 'over'), { n: 3, hits: 1, pushes: 1, rate: 1 / 3, values: [3, 4, 5] });
});

test('qualifying sides respect the threshold, window, odds limit, markets, injuries and start time', () => {
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
  assert.ok(!ids({ threshold: 50, window: '5' }).includes('short:over'), 'fewer than 5 games never qualifies');
  const ranked = qualifyingSides(pool, { threshold: 70 }, NOW).map(c => c.chance);
  assert.deepEqual(ranked, [...ranked].sort((a, b) => b - a), 'most likely to hit first');
});

test('the ticket takes the most likely sides, one per player and per-game limit, and prices the parlay', () => {
  const a = leg({ id: 'a', playerId: 'a', gameId: 'g1' });
  const a2 = leg({ id: 'a2', playerId: 'a', gameId: 'g1', market: 'rec', line: 4.5, games: history([6, 7, 5, 8, 6, 7, 5, 6, 9, 6]) });
  const b = leg({ id: 'b', playerId: 'b', gameId: 'g1', over: 120, under: -140 });
  const c = leg({ id: 'c', playerId: 'c', gameId: 'g2', over: -105, under: -115 });
  const d = leg({ id: 'd', playerId: 'd', gameId: 'g3', over: -150, under: 130, games: history([60, 70, 80, 90, 60, 70, 80, 90, 60, 70]) });
  const pool = { legs: [a, a2, b, c, d] };
  const result = buildParlay(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW);
  assert.equal(result.legs.length, 3);
  assert.equal(new Set(result.legs.map(x => x.leg.gameId)).size, 3, 'one leg per game');
  assert.equal(new Set(result.legs.map(x => x.leg.playerId)).size, 3, 'one leg per player');
  const chances = result.legs.map(x => x.chance);
  assert.deepEqual(chances, [...chances].sort((x, y) => y - x));
  const t = result.ticket, decimal = result.legs.reduce((p, x) => p * x.decimal, 1);
  assert.ok(Math.abs(t.decimal - decimal) < 1e-12);
  assert.equal(t.american, toAmerican(decimal));
  assert.ok(Math.abs(t.payout - 10 * decimal) < 1e-9);
  assert.ok(Math.abs(t.chance - result.legs.reduce((p, x) => p * x.chance, 1)) < 1e-12);
  assert.ok(Math.abs(t.trendChance - result.legs.reduce((p, x) => p * x.recent.rate, 1)) < 1e-12);
  assert.ok(t.chance < t.trendChance, 'the expected chance is below the raw trend math');
  assert.equal(t.games, 3);
  assert.equal(t.sameGame, false);
  assert.ok(!('ev' in t) && !('bookChance' in t), 'no price-based estimate on the ticket');
  assert.ok(result.bench.every(x => x.blocked), 'every bench row says why it is out');
  assert.ok(result.bench.some(x => x.blocked.reason === 'game' || x.blocked.reason === 'player'));
  const sameGame = buildParlay(pool, { legs: 4, threshold: 70, perGame: 'any' }, NOW);
  assert.equal(sameGame.ticket.sameGame, true);
});

test('when too few sides qualify, the builder names the change that adds legs', () => {
  const pool = { legs: ['a', 'b', 'c'].map(id => leg({ id, playerId: id, gameId: 'only' })) };
  const result = buildParlay(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW);
  assert.equal(result.legs.length, 1);
  assert.equal(result.short, true);
  assert.deepEqual(relaxations(pool, { legs: 3, threshold: 70, perGame: 1 }, NOW), [{ changes: { perGame: 'any' }, legs: 3 }]);
});

test('each leg explains itself: why it is in, what to watch, short facts, and where its expected rate comes from', () => {
  const c = evaluateSide(leg({ projection: 62.3, matchup: { rate: 165, league: 150, unit: 'WR production per opponent game' }, games: history([60, 70, 40, 80, 55, 65, 30, 90, 75, 52], { versus: [3] }) }), 'over', { base: () => 0.45 });
  c.rank = 1;
  const text = legReasons(c, { unit: 'yards', label: 'Receiving yards' }).map(r => r.tone + ': ' + r.text);
  assert.deepEqual(text, [
    'good: Over 50.5 in 8 of the last 10',
    'good: Averages 61.7, 11.2 yards over the line',
    'good: ATL allows 10% more than average (WR production per opponent game)',
    'good: Our projection: 62.3, 11.8 yards over the line',
    'info: Median 62.5',
    'info: Worst miss 30',
    'info: 3 books at 50.5'
  ]);
  assert.ok(!text.some(t => /no-vig|expected return|edge|value/i.test(t)), 'no +EV language');
  assert.equal(legSummary(c, { qualifying: 12, label: 'Receiving yards' }), `#1 of 12 qualifying · ${Math.round(c.chance * 100)}% expected: the last 10 games (recent ones weighted) blended with this slate's Over rate in receiving yards (45%)`);
  assert.match(legSummary({ ...c, side: 'under' }, { qualifying: 3, label: 'RBIs' }), /Under rate in RBIs/, 'acronyms keep their case');
  // An average on the line, a weak head-to-head and a weaker venue are risks; a strong one isn't repeated.
  const flat = evaluateSide(leg({ line: 0.5, games: history([0, 1, 0, 0, 2, 0, 1, 0, 0, 1], { versus: [1, 4, 9] }) }), 'under');
  const warns = legReasons(flat).filter(r => r.tone === 'warn').map(r => r.text);
  assert.ok(warns.includes('Averages 0.5, right at the line'), warns.join(' | '));
  assert.ok(warns.includes('0 of 3 against ATL'));
  const hurt = evaluateSide(leg({ concern: true, status: 'Questionable', books: 1 }), 'over');
  const warnings = legReasons(hurt).filter(r => r.tone === 'warn').map(r => r.text);
  assert.ok(warnings.includes('Injury report: Questionable'));
  assert.ok(warnings.includes('Only one book posts this line'));
});

test('a line set far below the usual output carries a warning', () => {
  // Strikeouts at 1.5 for a pitcher who strikes out 2–6 every start.
  const far = evaluateSide(leg({ market: 'k', line: 1.5, games: history([4, 4, 6, 4, 5, 3, 2, 3, 4, 4]) }), 'over');
  assert.ok(far.cushion >= FAR_LINE && far.farLine);
  assert.ok(legReasons(far).some(r => r.tone === 'warn' && r.text.startsWith('Line set far below')));
  const normal = evaluateSide(leg(), 'over');
  assert.equal(normal.farLine, false);
  assert.ok(!legReasons(normal).some(r => r.text.startsWith('Line set far')));
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
  assert.deepEqual([l.line, l.over, l.under, l.book, l.books, l.projection], [50.5, -110, -110, 'FanDuel', 3, 55]);
  assert.ok(!('model' in l), 'no model probability: the estimate is trends only');
  assert.deepEqual(l.matchup, { rate: 160, league: 150, unit: 'WR production per opponent game' });
  assert.deepEqual(l.games, [['2026-09-27', 60, 1, 1, 'ATL'], ['2026-09-20', 40, 0, 0, 'LV']]);
});

test('the pool covers every market, reuses a recent build and reports a market that failed', async () => {
  let calls = 0;
  const nfl = { board: async ({ market }) => { calls++; if (market === 'pass_yds') throw Error('down'); return { ...nflBoard(), market }; } };
  let time = NOW, background = null;
  const pool = createParlayPool({ nfl }, { now: () => time, snapshots: memorySnapshots(), defer: task => (background = task) });
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
  const stale = await pool({ sport: 'nfl' });
  assert.equal(stale.refreshing, true, 'after two minutes the saved pool is served at once while a new one builds');
  assert.equal(stale.legs.length, 10);
  await background;
  assert.equal(calls, 22, 'rebuilt in the background');
  assert.equal((await pool({ sport: 'nfl' })).refreshing, undefined, 'the fresh build is served next');
  await assert.rejects(pool({ sport: 'golf' }), /supported sport/);
  const soccer = await createParlayPool({}, { now: () => NOW, snapshots: memorySnapshots() })({ sport: 'soccer', date: '2026-10-05' });
  assert.deepEqual(soccer.legs, []);
  assert.ok(soccer.notes[0].includes('soccer'));
});

test('the parlay builder never touches the +EV odds feed or +EV code', async () => {
  for (const file of ['../public/parlay.js', '../public/parlay-builder.js', '../lib/parlay-pool.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)].map(m => m[1]);
    assert.ok(!imports.some(path => /(^|\/)ev[-.]|ev-api|odds-screen/.test(path)), `${file} imports ${imports.join(', ')}`);
    assert.ok(!/\/api\/ev\/|sportslab-ev-workbench|devig|fairFromAmerican/i.test(source), `${file} touches +EV data or math`);
  }
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
  for (const file of ['parlay-builder.js', 'account-sync.js', 'product-ui.js', 'research-data.js', 'ui-icons.js', 'sports-identity.js']) assert.ok(html.includes(`rel="modulepreload" href="/${file}"`), file);
});

test('alternate lines ladder round-number milestones up to the best recent game', () => {
  assert.deepEqual(milestoneSteps([5, 3, 12]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(milestoneSteps([40, 22]), [5, 10, 15, 20, 25, 30, 35, 40]);
  assert.deepEqual(milestoneSteps([60, 90, 75]), [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(milestoneSteps([310, 250]), [25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300]);
  assert.deepEqual(milestoneSteps([0, 0]), []);
});

test('with alternate lines on, each stat offers its highest milestone that clears the threshold, unpriced', () => {
  // Last 10: 60 70 40 80 55 65 30 90 75 52. 50+ hits 8 of 10; 60+ only 6 of 10.
  const pool = { legs: [leg({ over: null })] }, settings = { side: 'over', threshold: 70, window: '10' };
  assert.equal(qualifyingSides(pool, settings, NOW).length, 0, 'the posted Over has no price, so nothing qualifies without alternates');
  const [c] = qualifyingSides(pool, { ...settings, altLines: true }, NOW);
  assert.equal(c.leg.alt, 50);
  assert.equal(c.line, 49.5);
  assert.equal(c.price, null);
  assert.equal(c.decimal, null);
  assert.deepEqual([c.recent.hits, c.recent.n], [8, 10]);
  assert.equal(c.farLine, false, 'milestones sit below usual output by design');
  const reasons = legReasons(c, { unit: 'yds', label: 'Receiving yards' });
  assert.equal(reasons[0].text, '50+ in 8 of the last 10');
  assert.ok(reasons.some(r => r.tone === 'warn' && /posts only 50\.5 for this stat, so this milestone has no price/.test(r.text)), 'names the posted line, not the milestone');
  assert.ok(!reasons.some(r => /books at|Only one book/.test(r.text)), 'book counts describe the posted line, not the milestone');
  assert.equal(qualifyingSides(pool, { ...settings, altLines: true, threshold: 90 }, NOW)[0].leg.alt, 40, 'a higher bar steps down the ladder');
  assert.equal(bestAlternateLine(leg({ games: history([1, 2]) }), settings, { base: () => 0.5, milestoneBase: () => 0.5 }), null, 'needs enough games');
});

test('a ticket with an alternate leg has no payout; swapping drops that alternate; Unders-only skips them', () => {
  const pool = { legs: [leg({ over: null }), leg({ id: 'g2:p2:rec_yds', key: 'nfl:g2:p2:rec_yds', player: 'Player Two', playerId: 'p2', gameId: 'g2', game: 'TB @ CAR', over: -110 })] };
  const settings = { side: 'over', threshold: 70, window: '10', legs: 2, altLines: true, maxFavorite: null };
  const result = buildParlay(pool, settings, NOW);
  assert.equal(result.legs.length, 2);
  assert.ok(result.legs.some(c => c.leg.alt));
  assert.equal(result.ticket.priced, false);
  assert.equal(result.ticket.payout, null);
  assert.equal(result.ticket.american, null);
  assert.ok(result.ticket.alternates >= 1);
  assert.ok(result.ticket.chance > 0 && result.ticket.chance < 1, 'the hit chance still comes from the trends');
  const alt = result.legs.find(c => c.leg.id.startsWith('g1:p1:rec_yds:alt'));
  const swapped = qualifyingSides(pool, { ...settings, excluded: [alt.id] }, NOW);
  assert.ok(!swapped.some(c => c.leg.id.startsWith('g1:p1:rec_yds')), 'the swapped player has no other priced side here');
  assert.ok(!qualifyingSides(pool, { ...settings, side: 'under' }, NOW).some(c => c.leg.alt), 'milestones are Overs');
  const priced = buildParlay({ legs: [pool.legs[1], leg({ id: 'g3:p3:rec_yds', playerId: 'p3', gameId: 'g3' })] }, { ...settings, altLines: false }, NOW);
  assert.equal(priced.ticket.priced, true);
  assert.ok(priced.ticket.payout > 0);
});

test('a cold server serves the saved pool at once and rebuilds it in the background', async () => {
  let calls = 0, time = NOW, background = null;
  const nfl = { board: async ({ market }) => { calls++; return { ...nflBoard(), market }; } };
  const snapshots = memorySnapshots();
  await createParlayPool({ nfl }, { now: () => time, snapshots })({ sport: 'nfl' });
  assert.equal(calls, 11);
  assert.equal(snapshots.saved.size, 1, 'the finished pool is saved');
  // A new instance (empty memory) an hour later: answers from the snapshot without waiting on a build.
  time += 3600_000;
  const fresh = createParlayPool({ nfl }, { now: () => time, snapshots, defer: task => (background = task) });
  const served = await fresh({ sport: 'nfl' });
  assert.equal(served.refreshing, true);
  assert.equal(served.legs.length, 11);
  await background;
  assert.equal(calls, 22);
  // Older than a day, a snapshot isn't served: lines have moved, so the request waits for a build.
  time += 25 * 3600_000;
  const old = createParlayPool({ nfl }, { now: () => time, snapshots });
  const rebuilt = await old({ sport: 'nfl' });
  assert.equal(rebuilt.refreshing, undefined);
  assert.equal(calls, 33);
});

test('saved pools are files when Blob is not configured, and a failed save is not an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pool-'));
  try {
    const files = createSnapshotStore({ dir, cloud: false });
    assert.equal(files.kind, 'file');
    assert.equal(await files.read('missing'), null);
    await files.write('["nfl","","",""]', { builtAt: '2026-10-05T12:00:00.000Z', legs: [1] });
    assert.deepEqual(await files.read('["nfl","","",""]'), { builtAt: '2026-10-05T12:00:00.000Z', legs: [1] });
    const blobs = new Map(), blob = { put: async (key, body) => blobs.set(key, body), get: async key => blobs.has(key) ? { stream: new Response(blobs.get(key)).body } : null };
    const cloud = createSnapshotStore({ cloud: true, environment: 'production', blob });
    await cloud.write('k', { builtAt: 'x' });
    assert.ok([...blobs.keys()][0].startsWith('parlay-pools/production/'));
    assert.deepEqual(await cloud.read('k'), { builtAt: 'x' });
    const failing = { read: async () => null, write: async () => { throw Error('disk full'); } };
    const pool = createParlayPool({ nfl: { board: async ({ market }) => ({ ...nflBoard(), market }) } }, { now: () => NOW, snapshots: failing });
    assert.equal((await pool({ sport: 'nfl' })).legs.length, 11, 'the member still gets the pool');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
