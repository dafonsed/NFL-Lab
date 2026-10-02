import test from 'node:test';
import assert from 'node:assert/strict';
import { repairSelection, matchParticipant, normalizeFeed, markPriceFamilies, knownSport, sportName } from '../public/ev-feed-normalize.js';
import { consensusPrice } from '../public/ev-advanced-math.js';

// Shapes copied from the live quote feed's mislabeled records (30 Sep 2026).
const record = (id, extra) => ({ id, sport: 'nfl', event: 'Cowboys @ Texans', market: 'spread', type: 'spread', side: 'home', book: 'Fanatics', odds: -110, ts: '2026-09-30T21:58:58.477Z', ...extra });
const synced = '2026-09-30T22:00:00.000Z';

test('totals take their side and line from the selection, not the feed side', () => {
  assert.deepEqual(repairSelection({ type: 'total', side: 'home', line: 44.5, selection: 'Over 44.5', event: 'Cowboys @ Texans' }),
    { type: 'total', side: 'over', line: 44.5, selection: 'Over', verified: true });
  assert.equal(repairSelection({ type: 'total', side: 'home', line: 44.5, selection: 'Dallas Cowboys', event: 'Cowboys @ Texans' }), null);
});

test('spreads take the team and signed line from the selection', () => {
  // Fanatics sends the home team's line with side "home", but the price is for the named team.
  assert.deepEqual(repairSelection({ type: 'spread', side: 'home', line: 17.5, selection: 'Dallas Cowboys -17.5', event: 'Cowboys @ Texans' }),
    { type: 'spread', side: 'away', line: -17.5, selection: 'Dallas Cowboys', verified: true });
  // DraftKings: the name agrees with the side, so the feed line stands.
  assert.equal(repairSelection({ type: 'spread', side: 'away', line: -8.5, selection: 'CIN Bengals', event: 'CIN Bengals @ MIA Dolphins' }).line, -8.5);
  // A name that disagrees with the side and carries no line can't be trusted.
  assert.equal(repairSelection({ type: 'spread', side: 'home', line: -2.5, selection: 'Denver Nuggets', event: 'Denver Nuggets @ Golden State Warriors' }), null);
  // A different game's team filed under this event.
  assert.equal(repairSelection({ type: 'spread', side: 'home', line: -2.5, selection: 'Navy Midshipmen +2.5', event: 'Falcons @ Saints' }), null);
});

test('moneylines reject other bets and rebuild 1X2', () => {
  assert.equal(repairSelection({ type: 'moneyline', side: 'home', selection: 'Dallas Cowboys / Tie', event: 'Cowboys @ Texans' }), null);
  assert.equal(repairSelection({ type: 'moneyline', side: 'away', selection: 'Schlagenhauf, Noah/Stroemberg, Isac', event: 'Mensik @ Bublik' }), null);
  assert.equal(repairSelection({ type: 'moneyline', side: 'away', selection: 'No', event: 'Cowboys @ Texans' }), null);
  assert.equal(repairSelection({ type: 'moneyline', side: 'home', selection: 'NO Saints', event: 'MIN Vikings @ NO Saints' }).side, 'home', 'NO is New Orleans, not a "No" bet');
  assert.deepEqual(repairSelection({ type: 'moneyline', side: 'home', selection: '2', event: 'Guyana @ Dominica' }),
    { type: 'three-way', side: 'away', line: '', selection: '', verified: true, outcomes: 3 });
  assert.equal(repairSelection({ type: 'moneyline', side: 'home', selection: 'Chicago White Sox', event: 'CHI White Sox @ HOU Astros' }).side, 'away');
});

test('participant matching ignores accents, order and shared words', () => {
  assert.equal(matchParticipant('Martínez Gómez, Pablo', { away: 'Pablo Martinez Gomez', home: 'Vlado Jankanj' }), 'away');
  assert.equal(matchParticipant('Los Angeles Lakers', { away: 'Los Angeles Clippers', home: 'Los Angeles Lakers' }), 'home');
  assert.equal(matchParticipant('Los Angeles', { away: 'Los Angeles Clippers', home: 'Los Angeles Lakers' }), null);
});

test('the feed pipeline skips and counts bad records instead of failing the snapshot', () => {
  const { quotes, skipped } = normalizeFeed([
    record('a', { selection_name: 'Dallas Cowboys +3.0', line: -3 }),
    record('a', { selection_name: 'Dallas Cowboys +3.0', line: -3 }),
    record('b', { selection_name: 'Houston Texans -3.0', line: 3, side: 'away' }),
    record('c', { selection_name: 'Navy Midshipmen +2.5', line: -2.5 }),
    { id: 'd', sport: 'nfl' },
  ], { syncedAt: synced });
  // Ids are stable per selection; the API's own id is kept as feedId.
  assert.deepEqual(quotes.map(q => [q.feedId, q.side, q.line, q.selection]), [['local-api:a', 'away', 3, 'Dallas Cowboys'], ['local-api:b', 'home', -3, 'Houston Texans']]);
  assert.match(quotes[0].id, /^local-api:[a-z0-9]+$/);
  assert.deepEqual(skipped, { invalid: 1, mislabeled: 1, duplicate: 1, stale: 0, started: 0, inconsistent: 0 });
  assert.equal(quotes[0].displayMarket, 'Spread');
});

test('books that send start times in ts get them moved, and started games drop for every book', () => {
  const kambi = Array.from({ length: 6 }, (_, i) => record(`k${i}`, { book: 'BetRivers', event: `Team${i} @ Other${i}`, market: 'moneyline', type: 'moneyline', side: 'home', selection_name: `Other${i}`, ts: i === 0 ? '2026-09-30T20:00:00+00:00' : '2026-10-02T00:15:00+00:00' }));
  const dk = record('dk', { book: 'DraftKings', event: 'Team0 @ Other0', market: 'moneyline', type: 'moneyline', side: 'home', selection_name: 'Other0', ts: '2026-09-30T21:59:10.120Z' });
  const { quotes, skipped } = normalizeFeed([...kambi, dk], { syncedAt: synced });
  assert.equal(skipped.started, 2, 'the started game drops at BetRivers and at DraftKings');
  const future = quotes.find(q => q.feedId === 'local-api:k1');
  assert.equal(future.startTime, '2026-10-02T00:15:00.000Z');
  assert.equal(future.ts, synced);
  assert.equal(future.ageUnknown, true);
});

test('mirrored books count once in the consensus', () => {
  const q = (book, side, odds) => ({ id: `${book}-${side}`, sport: 'NFL', event: 'A @ B', eventId: 'NFL:a @ b', market: 'Moneyline', marketId: 'moneyline|NFL:a @ b', type: 'moneyline', line: '', side, book, odds, ts: new Date().toISOString(), live: false, outcomes: '' });
  const quotes = [q('BetRivers', 'home', -150), q('BetRivers', 'away', 130), q('Bally Bet', 'home', -150), q('Bally Bet', 'away', 130), q('DraftKings', 'home', -110), q('DraftKings', 'away', -110), q('FanDuel', 'home', 120)];
  markPriceFamilies(quotes, { minShared: 2, minIdentical: 0.7 });
  assert.equal(quotes[2].priceFamily, 'Bally Bet' < 'BetRivers' ? undefined : 'BetRivers');
  const consensus = consensusPrice(quotes.at(-1), quotes, { minSharpBooks: 1 });
  assert.equal(consensus.bookCount, 2, 'BetRivers and Bally Bet are one reference, DraftKings the other');
});

test('sport names cover the feed beyond the six major leagues', () => {
  assert.equal(sportName('nfl'), 'NFL');
  assert.equal(sportName('tennis'), 'Tennis');
  assert.equal(sportName('americanfootball'), 'Other');
  assert.equal(knownSport('TENNIS'), 'Tennis');
  assert.equal(knownSport('garbage'), '');
});

test('pick\'em lines from the feed become DFS picks priced from sportsbook props at the same line', async () => {
  const prop = (id, book, side, odds, extra = {}) => ({ id, sport: 'nfl', event: 'BUF Bills @ MIA Dolphins', market: 'Passing Yards', type: 'prop', player: 'Josh Allen', line: 262.5, side, book, odds, ts: '2026-09-30T21:59:00.000Z', selection_name: `Josh Allen ${side === 'over' ? 'Over' : 'Under'} 262.5`, ...extra });
  const { quotes, dfs } = normalizeFeed([
    prop('dk-o', 'DraftKings', 'over', -120), prop('dk-u', 'DraftKings', 'under', 100),
    prop('fd-o', 'FanDuel', 'over', -115), prop('fd-u', 'FanDuel', 'under', -105),
    prop('pp-o', 'PrizePicks', 'over', undefined, { event: 'Bills @ Dolphins', market: 'Pass Yards' }),
    prop('ud-o', 'Underdog', 'over', undefined, { line: 263.5, selection_name: 'Josh Allen Over 263.5' }),
  ], { syncedAt: '2026-09-30T22:00:00.000Z' });
  assert.equal(quotes.some(q => q.book === 'PrizePicks'), false, 'pick\'em lines stay out of the sportsbook tools');
  const pp = dfs.find(pick => pick.app === 'PrizePicks'), ud = dfs.find(pick => pick.app === 'Underdog Fantasy');
  assert.equal(pp.side, 'Over');
  assert.equal(pp.event, ud.event, 'every app shares one game name');
  const noVig = (o, u) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100)) / ((o > 0 ? 100 / (o + 100) : -o / (-o + 100)) + (u > 0 ? 100 / (u + 100) : -u / (-u + 100)));
  // "Pass Yards" at PrizePicks matches "Passing Yards" at the books; Underdog's 263.5 line has no book at that line.
  assert.ok(Math.abs(pp.probability - (noVig(-120, 100) + noVig(-115, -105)) / 2) < 1e-9);
  assert.equal(ud.probability, null);
  const exact = normalizeFeed([prop('dk-o', 'DraftKings', 'over', -120), prop('dk-u', 'DraftKings', 'under', 100), prop('fd-o', 'FanDuel', 'over', -115), prop('fd-u', 'FanDuel', 'under', -105), prop('pp-o', 'PrizePicks', 'over', undefined)], { syncedAt: '2026-09-30T22:00:00.000Z' }).dfs[0];
  assert.ok(Math.abs(exact.probability - (noVig(-120, 100) + noVig(-115, -105)) / 2) < 1e-9);
  assert.deepEqual(exact.probabilityBooks.sort(), ['DraftKings', 'FanDuel']);
});

test('standard pick\'em payouts fill in until a table is saved', async () => {
  const { withStandardPaytables, isStandardPaytable } = await import('../public/dfs-workspace.js');
  const tables = withStandardPaytables({ PrizePicks: { 3: [0, 0, 1, 5] } });
  assert.deepEqual(tables.PrizePicks['2'], [0, 0, 3]);
  assert.deepEqual(tables.PrizePicks['3'], [0, 0, 1, 5], 'a saved table wins');
  assert.deepEqual(tables['Underdog Fantasy']['4'], [0, 0, 0, 0, 12]);
  assert.equal(isStandardPaytable({}, 'PrizePicks', 2), true);
  assert.equal(isStandardPaytable({ PrizePicks: { 2: [0, 0, 3] } }, 'PrizePicks', 2), false);
});

test('prices the API stopped refreshing are dropped, and a selection keeps one id across scrapes', () => {
  const synced = '2026-10-01T22:12:00.000Z';
  const old = record('old', { selection_name: 'Dallas Cowboys +3.0', line: -3, odds: 140, ts: '2026-10-01T15:21:12.000Z' });
  const fresh = record('new', { selection_name: 'Dallas Cowboys +3.0', line: -3, odds: -115, ts: '2026-10-01T22:11:00.000Z' });
  const gone = record('gone', { selection_name: 'Dallas Cowboys +9.5', line: -9.5, odds: -400, ts: '2026-10-01T15:21:12.000Z' });
  const first = normalizeFeed([old, fresh, gone], { syncedAt: synced });
  assert.deepEqual(first.quotes.map(q => q.odds), [-115], 'the stale copy and the market no longer offered are gone');
  assert.equal(first.skipped.stale, 2);
  const next = normalizeFeed([{ ...fresh, id: 'rescraped', odds: -120, ts: '2026-10-01T22:16:00.000Z' }], { syncedAt: '2026-10-01T22:16:30.000Z' });
  assert.equal(next.quotes[0].id, first.quotes[0].id, 'a new API id for the same selection keeps the site id');
});

test('set-score and handicap selections are other markets', () => {
  assert.equal(repairSelection({ type: 'moneyline', side: 'away', selection: 'Kate Fakih 2:1', event: 'Kate Fakih @ Caroline Dolehide' }), null);
  assert.equal(repairSelection({ type: 'moneyline', side: 'home', selection: 'Correcaminos 11+', event: 'Lobos @ Correcaminos' }), null);
  assert.equal(repairSelection({ type: 'moneyline', side: 'home', selection: 'Philadelphia 76ers', event: 'Celtics @ Philadelphia 76ers' }).side, 'home');
});

test('the API\'s DFS props become picks; contests and rosters are left out and the API\'s probability is never read', async () => {
  const { normalizeDfsRecords, payoutTables } = await import('../public/ev-feed-normalize.js');
  const synced = '2026-10-02T00:30:00.000Z', ts = '2026-10-02T00:29:00.000Z';
  const pp = (i, extra = {}) => ({ id: `pp${i}`, sport: 'nfl', event: '', player: `Player ${i}`, market: 'Rush Yards', line: 50.5 + i, side: 'higher', app: 'PrizePicks', probability: 0.6667, ts, ...extra });
  const records = [...Array.from({ length: 24 }, (_, i) => pp(i)), pp(99, { probability: 0.58 }),
    { id: 'fd1', sport: 'mlb', event: '', player: 'Main', market: 'salary_cap', line: 35000, side: 'higher', app: 'FanDuel Fantasy', probability: 0.6667, ts },
    { id: 'sl1', sport: 'nba', event: '', player: 'Tyler Lydon', market: 'roster', line: 0, side: 'higher', app: 'Sleeper', probability: 0.9901, ts },
    pp(100, { ts: '2026-10-01T22:00:00.000Z' })];
  const { picks, skipped } = normalizeDfsRecords(records, { syncedAt: synced });
  assert.equal(picks.length, 25);
  assert.deepEqual(skipped, { invalid: 0, notProps: 2, stale: 1, started: 0 });
  assert.equal(picks[0].side, 'over');
  assert.equal(picks[0].probability, undefined, 'fair probability comes only from devigged sportsbook odds');
  assert.equal(picks.at(-1).probability, undefined, 'a per-pick probability from the API is not used either');
  assert.deepEqual(payoutTables([{ app: 'Underdog', payouts: { 2: { power: { multiplier: 3 } }, 3: { power: { multiplier: 5 }, flex: null } } }]), { 'Underdog Fantasy': { 2: [0, 0, 3], 3: [0, 0, 0, 5] } });
  const { withStandardPaytables, paytableSource } = await import('../public/dfs-workspace.js');
  // The API's PrizePicks 3-pick 5× is retired; PrizePicks publishes 6×. Published tables win.
  const api = { PrizePicks: { 3: [0, 0, 0, 5] }, Sleeper: { 3: [0, 0, 0, 5.64] } };
  const tables = withStandardPaytables({}, api);
  assert.deepEqual(tables.PrizePicks['3'], [0, 0, 0, 6], 'the published PrizePicks payout beats the API');
  assert.deepEqual(tables['Sleeper Picks']['3'], [0, 0, 0, 5.64], 'the API fills apps without a published table');
  assert.equal(paytableSource({}, 'PrizePicks', 3, api), 'standard');
  assert.equal(paytableSource({}, 'Sleeper Picks', 3, { 'Sleeper Picks': api.Sleeper }), 'api');
  assert.equal(paytableSource({ PrizePicks: { 3: [0, 0, 1, 6] } }, 'PrizePicks', 3, api), 'saved');
  const { breakEven } = await import('../public/dfs-workspace.js');
  // Published PrizePicks Power: 3×, 6×, 10×, 20×, 37.5× → per-pick break-even M^(-1/n).
  assert.deepEqual([2, 3, 4, 5, 6].map(n => Math.round(breakEven(tables.PrizePicks[String(n)]) * 10000) / 100), [57.74, 55.03, 56.23, 54.93, 54.66]);
});

test('DFS lines filed under NBA move to the sport their markets belong to; season rows are not players', async () => {
  const { normalizeDfsRecords } = await import('../public/ev-feed-normalize.js');
  const synced = '2026-10-02T00:30:00.000Z', ts = '2026-10-02T00:29:00.000Z';
  const pick = (player, market, sport = 'nba') => ({ id: `${player}:${market}`, sport, event: '', player, market, line: 2.5, side: 'higher', app: 'PrizePicks', ts });
  const { picks, skipped } = normalizeDfsRecords([
    pick('Filip Forsberg', 'Shots On Goal'), pick('Filip Forsberg', 'Points'), pick('Juuse Saros', 'Goalie Saves'),
    pick('soulfly', 'MAP 1 Kills'), pick('Justin Stevenson', 'Receiving Yards'), pick('Justin Rose', 'Strokes'),
    pick('Caitlin Clark', 'Points'), pick('Bruno Fernandes', 'Shots On Goal', 'epl'),
    pick('2026-2027 Season', 'Points Per Game'),
  ], { syncedAt: synced });
  const sportOf = (player, market) => picks.find(item => item.player === player && item.market === market)?.sport;
  assert.equal(sportOf('Filip Forsberg', 'Shots On Goal'), 'NHL');
  assert.equal(sportOf('Filip Forsberg', 'Points'), 'NHL', 'his other lines follow the market that gave the sport away');
  assert.equal(sportOf('Juuse Saros', 'Goalie Saves'), 'NHL');
  assert.equal(sportOf('soulfly', 'MAP 1 Kills'), 'Esports');
  assert.equal(sportOf('Justin Stevenson', 'Receiving Yards'), 'Football');
  assert.equal(sportOf('Justin Rose', 'Strokes'), 'Golf');
  assert.equal(sportOf('Caitlin Clark', 'Points'), 'NBA', 'basketball markets keep the feed\'s label');
  assert.equal(sportOf('Bruno Fernandes', 'Shots On Goal'), 'Soccer', 'only lines filed under basketball are relabeled');
  assert.equal(skipped.notProps, 1);
});

test('DFS props are also requested per app for apps the unfiltered response leaves out', async t => {
  const { loadDfsFeed } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString(), originalFetch = globalThis.fetch, urls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  const prop = (id, app, market = 'Points') => ({ id, app, sport: 'nba', event: '', player: `P ${id}`, market, line: 10.5, side: 'higher', ts });
  globalThis.fetch = async url => {
    urls.push(url);
    const app = new URL(url, 'https://x.test').searchParams.get('app');
    const body = !app ? [prop('a', 'PrizePicks'), prop('b', 'Sleeper', 'roster')] : app === 'Underdog' ? [prop('c', 'Underdog'), prop('a', 'PrizePicks')] : [];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const result = await loadDfsFeed('/api/ev/site/dfs/props', ts, ['PrizePicks', 'Underdog', 'Sleeper', 'Betr']);
  assert.deepEqual(urls, ['/api/ev/site/dfs/props', '/api/ev/site/dfs/props?app=Underdog', '/api/ev/site/dfs/props?app=Betr'], 'apps already in the unfiltered response are not requested again');
  assert.deepEqual(result.picks.map(pick => pick.book).sort(), ['PrizePicks', 'Underdog Fantasy'], 'duplicates by id are dropped and roster rows skipped');
});

test('raw two-sided odds → implied → devig → fair probability, with the method as a setting', async () => {
  const { americanToImpliedProbability, fairFromAmerican, devig, DEVIG_METHODS } = await import('../public/ev-advanced-math.js');
  const { breakEven } = await import('../public/dfs-workspace.js');
  const pct = value => Math.round(value * 10000) / 100;
  assert.equal(pct(americanToImpliedProbability(-140)), 58.33);
  assert.equal(pct(americanToImpliedProbability(118)), 45.87);
  const a = fairFromAmerican([-140, 118]);
  assert.equal(pct(a.overround), 104.2, 'the extra 4.20% is the book\'s vig');
  assert.deepEqual(a.fair.map(pct), [55.98, 44.02], '0.58333 / 1.04205; about 56% / 44%');
  const b = fairFromAmerican([-150, 125]);
  assert.deepEqual(b.implied.map(pct), [60, 44.44]);
  assert.deepEqual(b.fair.map(pct), [57.45, 42.55]);
  // A 2-pick Power slip at 3× breaks even at √(1/3) = 57.74%; the edge is fair minus that.
  const power2 = breakEven([0, 0, 3]);
  assert.equal(pct(power2), 57.74);
  assert.equal(pct(b.fair[0] - power2), -0.29, '57.45% fair does not clear a 2-pick Power slip');
  assert.equal(pct(fairFromAmerican([-170, 140]).fair[0] - power2), 2.44, '60.18% fair does');
  assert.deepEqual([...DEVIG_METHODS], ['multiplicative', 'additive', 'power', 'probit']);
  for (const method of DEVIG_METHODS) {
    const [over, under] = fairFromAmerican([-150, 125], method).fair;
    assert.ok(Math.abs(over + under - 1) < 1e-8, `${method} sums to 1`);
    assert.ok(over > 0.55 && over < 0.6, `${method} keeps the favourite near 57%: ${over}`);
    assert.deepEqual(fairFromAmerican([-110, -110], method).fair.map(pct), [50, 50], `${method}: an even market stays even`);
  }
  const methods = Object.fromEntries(DEVIG_METHODS.map(method => [method, pct(fairFromAmerican([-150, 125], method).fair[0])]));
  assert.notEqual(methods.multiplicative, methods.power, 'methods can differ slightly');
  assert.deepEqual(devig([0.6, 0.444], 'made-up'), [], 'an unknown method gives no fair probability');
});

test('DFS fair probability devigs each book\'s Over/Under prices with the chosen method', async () => {
  const { dfsPicks } = await import('../public/ev-feed-normalize.js');
  const { fairFromAmerican } = await import('../public/ev-advanced-math.js');
  const ts = new Date().toISOString();
  const book = (book, side, odds) => ({ book, side, odds, player: 'Jalen Hurts', market: 'Pass Yards', line: 225.5, eventId: 'NFL:eagles', ts });
  const quotes = [book('FanDuel', 'over', -140), book('FanDuel', 'under', 118), book('DraftKings', 'over', -150), book('DraftKings', 'under', 125), book('BetMGM', 'over', -130)];
  const pick = side => ({ book: 'PrizePicks', player: 'Jalen Hurts', market: 'Pass Yards', line: 225.5, side, eventId: 'NFL:eagles', ts, probability: 0.6667 });
  for (const method of ['multiplicative', 'probit']) {
    const [over, under] = dfsPicks([pick('over'), pick('under')], quotes, new Map(), { method });
    const expected = (fairFromAmerican([-140, 118], method).fair[0] + fairFromAmerican([-150, 125], method).fair[0]) / 2;
    assert.ok(Math.abs(over.probability - expected) < 1e-12, `${method}: average of each book's devigged Over`);
    assert.ok(Math.abs(under.probability - (1 - expected)) < 1e-12);
    assert.deepEqual(over.probabilityBooks, ['FanDuel', 'DraftKings'], 'a one-sided book (BetMGM) is not devigged');
    assert.equal(over.probabilityMethod, method);
  }
  const [alone] = dfsPicks([pick('over')], [], new Map());
  assert.equal(alone.probability, null, 'without sportsbook prices there is no fair probability, whatever the API sends');
});

test('Fanatics props read the stat from propMarket and repair a selection sent as the player', async () => {
  const { normalizeRecord } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString();
  const yards = normalizeRecord({ id: 'f1', sport: 'nfl', event: 'Commanders @ Colts', market: 'prop', propMarket: 'Receiving Yards', player: 'Rachaad White', line: 20.5, side: 'over', book: 'Fanatics', odds: 240, ts, type: 'prop', selection_name: 'Rachaad White Over 20.5 Receiving Yards' });
  assert.deepEqual([yards.player, yards.market, yards.side, yards.line], ['Rachaad White', 'Receiving Yards', 'over', 20.5]);
  const points = normalizeRecord({ id: 'f2', sport: 'nba', event: 'Dallas Wings @ Golden State Valkyries', market: 'Awak Kuier - Points', side: 'yes', book: 'Fanatics', odds: -130, ts, type: 'prop', player: 'Over 6.5', selection_name: 'Over 6.5' });
  assert.deepEqual([points.player, points.market, points.side, points.line], ['Awak Kuier', 'Points', 'over', 6.5]);
});

test('a sportsbook Over/Under pair with no margin is not devigged into a fair probability', async () => {
  const { dfsPicks } = await import('../public/ev-feed-normalize.js');
  const { fairFromAmerican } = await import('../public/ev-advanced-math.js');
  const ts = new Date().toISOString();
  const book = (book, side, odds) => ({ book, side, odds, player: 'Rachaad White', market: 'Receiving Yards', line: 20.5, eventId: 'NFL:colts @ commanders', ts });
  // +240 / -238 implies 29.4% + 70.4% = 99.8%: the Under is the Over mirrored, not a market.
  const quotes = [book('Fanatics', 'over', 240), book('Fanatics', 'under', -238), book('DraftKings', 'over', -140), book('DraftKings', 'under', 118)];
  const [pick] = dfsPicks([{ book: 'PrizePicks', player: 'Rachaad White', market: 'Receiving Yards', line: 20.5, side: 'over', eventId: 'NFL:colts @ commanders', ts }], quotes);
  assert.deepEqual(pick.probabilityBooks, ['DraftKings']);
  assert.ok(Math.abs(pick.probability - fairFromAmerican([-140, 118]).fair[0]) < 1e-12);
});

test('a pick prices against the same player, stat and line when the books name the game differently', async () => {
  const { dfsPicks } = await import('../public/ev-feed-normalize.js');
  const { fairFromAmerican } = await import('../public/ev-advanced-math.js');
  const ts = new Date().toISOString();
  const quote = (side, odds, eventId = 'NBA:wings @ valkyries') => ({ book: 'Fanatics', side, odds, sport: 'NBA', player: 'Veronica Burton', market: 'Points', line: 12.5, eventId, ts });
  const pick = (eventId = 'NBA:dal @ gsv') => ({ book: 'PrizePicks', sport: 'NBA', player: 'Veronica Burton', market: 'Points', line: 12.5, side: 'over', eventId, ts });
  // PrizePicks "DAL @ GSV" and Fanatics "Dallas Wings @ Golden State Valkyries" are one game.
  const [priced] = dfsPicks([pick()], [quote('over', 100), quote('under', -130)]);
  assert.ok(Math.abs(priced.probability - fairFromAmerican([100, -130]).fair[0]) < 1e-12);
  assert.equal(Math.round(priced.probability * 10000) / 100, 46.94);
  // The player has this stat in two games at the book: never guessed.
  const [twoGames] = dfsPicks([pick()], [quote('over', 100), quote('under', -130), quote('over', 120, 'NBA:wings @ lynx'), quote('under', -150, 'NBA:wings @ lynx')]);
  assert.equal(twoGames.probability, null);
  // Or in two games among the picks.
  const priced2 = dfsPicks([pick(), { ...pick('NBA:dal @ min'), line: 13.5 }], [quote('over', 100), quote('under', -130)]);
  assert.ok(priced2.every(item => item.probability === null));
});

test('PrizePicks line type is read from oddsType or odds_type; unflagged PrizePicks lines are standard', async () => {
  const { normalizeRecord, normalizeDfsRecords, dfsPicks } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString();
  const quote = extra => normalizeRecord({ id: 'pp', sport: 'nfl', event: 'IND @ WAS', market: 'Receiving Yards', side: 'over', book: 'PrizePicks', ts, type: 'prop', line: 63.5, player: 'Josh Downs', selection_name: 'Josh Downs Over 63.5', ...extra });
  assert.equal(quote({ oddsType: 'Goblin' }).oddsType, 'goblin');
  assert.equal(quote({}).oddsType, undefined);
  const { picks } = normalizeDfsRecords([{ id: 'd1', sport: 'nfl', event: 'IND @ WAS', player: 'Josh Downs', market: 'Receiving Yards', line: 80.5, side: 'higher', app: 'PrizePicks', odds_type: 'demon', ts }], { syncedAt: ts });
  assert.equal(picks[0].oddsType, 'demon');
  const [standard] = dfsPicks([{ ...quote({}), book: 'PrizePicks' }], []);
  assert.equal(standard.oddsType, 'standard');
});

test('a standard pick\'em line sent as More is also listed as Less at the same line; goblins and demons are More only', async () => {
  const { dfsPicks } = await import('../public/ev-feed-normalize.js');
  const { fairFromAmerican } = await import('../public/ev-advanced-math.js');
  const ts = new Date().toISOString();
  const pick = (oddsType, line) => ({ book: 'PrizePicks', sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line, side: 'over', eventId: 'NBA:dal @ gsv', ts, oddsType });
  const quotes = [['over', -110], ['under', -120]].map(([side, odds]) => ({ book: 'Fanatics', side, odds, sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line: 15.5, eventId: 'NBA:dal @ gsv', ts }));
  const rows = dfsPicks([pick('standard', 15.5), pick('goblin', 10.5), pick('demon', 22.5)], quotes);
  assert.deepEqual(rows.map(row => [row.line, row.side, row.oddsType]), [[15.5, 'Over', 'standard'], [15.5, 'Under', 'standard'], [10.5, 'Over', 'goblin'], [22.5, 'Over', 'demon']]);
  const [over, under] = rows, fair = fairFromAmerican([-110, -120]).fair;
  assert.ok(Math.abs(over.probability - fair[0]) < 1e-12 && Math.abs(under.probability - fair[1]) < 1e-12, 'Less is priced from the same devigged market');
  assert.notEqual(over.id, under.id);
  // A Less line the feed already sends is not doubled.
  assert.equal(dfsPicks([pick('standard', 15.5), { ...pick('standard', 15.5), side: 'under' }], quotes).length, 2);
});

test('player props show their stat as the market and in the bet; margin bands and round props are not moneylines', async () => {
  const { normalizeRecord } = await import('../public/ev-feed-normalize.js');
  const { selectionText } = await import('../public/ev-board.js');
  const ts = new Date().toISOString();
  const fanatics = extra => normalizeRecord({ id: 'f', sport: 'nfl', event: 'Patriots @ Bills', book: 'Fanatics', odds: 110, ts, type: 'prop', ...extra });
  const yards = fanatics({ market: 'prop', propMarket: 'Receiving Yards', player: 'Dawson Knox', line: 10.5, side: 'under', selection_name: 'Dawson Knox Under 10.5 Receiving Yards' });
  assert.equal(yards.displayMarket, 'Receiving Yards');
  assert.equal(selectionText(yards), 'Dawson Knox Under 10.5 Receiving Yards');
  const scorer = fanatics({ market: 'Anytime Touchdown Scorer', player: 'Dawson Knox', side: 'yes', selection_name: 'Dawson Knox' });
  assert.equal(selectionText(scorer), 'Dawson Knox Over 0.5 Anytime TDs', 'an anytime scorer is Anytime TDs Over 0.5, as pick\'em apps list it');
  const milestone = fanatics({ market: 'Dawson Knox - ALT Longest Reception', player: '20+', side: 'yes', selection_name: '20+' });
  assert.equal(selectionText(milestone), 'Dawson Knox Over 19.5 Longest Reception', 'a 20+ milestone is Over 19.5');
  const moneyline = selection => normalizeRecord({ id: 'm', sport: 'ncaaf', event: 'Pittsburgh Panthers @ Virginia Tech Hokies', market: 'moneyline', type: 'moneyline', side: 'away', book: 'Fanatics', odds: 550, ts, selection_name: selection });
  assert.equal(moneyline('Pittsburgh Panthers (13+)').skip, 'mislabeled', 'a winning-margin band is not a moneyline');
  assert.equal(moneyline('Pittsburgh Panthers in Rd 9').skip, 'mislabeled');
  assert.equal(moneyline('Pittsburgh Panthers').skip, undefined);
});

test('a sportsbook market with no margin is never a fair-price reference; an exchange can be', async () => {
  const { consensusPrice } = await import('../public/ev-advanced-math.js');
  const now = Date.now(), ts = new Date(now).toISOString();
  const row = (id, book, side, odds, extra = {}) => ({ id, book, side, odds, ts, sport: 'NFL', event: 'Patriots @ Bills', eventId: 'NFL:patriots @ bills', market: 'Receiving Yards', type: 'prop', player: 'Dawson Knox', line: 10, ...extra });
  const offered = row('o', 'Fanatics', 'under', 110);
  // DraftKings' Under is its Over mirrored (-112 / +112 = 100.00%): no margin, not a market.
  const mirrored = [offered, row('a', 'DraftKings', 'over', -112), row('b', 'DraftKings', 'under', 112)];
  assert.ok(Number.isNaN(consensusPrice(offered, mirrored, { now }).probability));
  const priced = [offered, row('a', 'DraftKings', 'over', -112), row('b', 'DraftKings', 'under', -108)];
  assert.ok(consensusPrice(offered, priced, { now }).probability > 0.4);
  const exchange = [offered, row('a', 'Novig', 'over', -110, { exchange: true }), row('b', 'Novig', 'under', 110, { exchange: true })];
  assert.ok(consensusPrice(offered, exchange, { now }).probability > 0.4, 'an exchange can price at zero margin');
});

test('DFS audit fixes: stat-aware props, sides per book, pregame only, per-app matching, higher/lower, merged pricing', async () => {
  const { normalizeFeed, dfsPicks, createDfsPricer, normalizeRecord } = await import('../public/ev-feed-normalize.js');
  const { fairFromAmerican } = await import('../public/ev-advanced-math.js');
  const { fantasySlip } = await import('../public/ev-core.js');
  const now = Date.now(), ts = new Date(now - 60_000).toISOString(), start = new Date(now + 3 * 3_600_000).toISOString();
  const dk = (id, propMarket, side, odds) => ({ id, sport: 'nba', event: 'Dallas Mavericks @ Denver Nuggets', market: 'prop', propMarket, player: 'Luka Doncic', line: 8.5, side, book: 'DraftKings', odds, ts, type: 'prop', startTime: start, selection_name: `Luka Doncic ${side === 'over' ? 'Over' : 'Under'} 8.5 ${propMarket}` });
  // 1. Rebounds 8.5 and Assists 8.5 for one player at one book are two markets, not duplicates.
  const feed = normalizeFeed([dk('r1', 'Rebounds', 'over', -120), dk('r2', 'Rebounds', 'under', -110), dk('a1', 'Assists', 'over', 105), dk('a2', 'Assists', 'under', -135)], { syncedAt: new Date(now).toISOString() });
  assert.equal(feed.quotes.length, 4, 'all four prices are kept');
  assert.equal(feed.skipped.duplicate, 0);
  // 2. Each book keeps its own Over and Under; a price family is averaged after devigging.
  const q = (book, side, odds, extra = {}) => ({ book, side, odds, sport: 'NBA', player: 'Luka Doncic', market: 'Rebounds', line: 8.5, eventId: 'NBA:mavericks @ nuggets', ts, startTime: start, ...extra });
  const pick = extra => ({ book: 'PrizePicks', sport: 'NBA', player: 'Luka Doncic', market: 'Rebounds', line: 8.5, side: 'over', eventId: 'NBA:mavericks @ nuggets', ts, startTime: start, ...extra });
  const family = [q('BetRivers', 'over', -115, { priceFamily: 'kambi' }), q('BetRivers', 'under', -105, { priceFamily: 'kambi' }), q('Bally Bet', 'over', -125, { priceFamily: 'kambi' }), q('Bally Bet', 'under', 105, { priceFamily: 'kambi' })];
  const [priced] = dfsPicks([pick()], family);
  const expected = (fairFromAmerican([-115, -105]).fair[0] + fairFromAmerican([-125, 105]).fair[0]) / 2;
  assert.ok(Math.abs(priced.probability - expected) < 1e-12, 'each book devigged on its own prices, then the family averaged');
  assert.deepEqual(priced.probabilitySources.map(s => [s.book, s.over, s.under]), [['BetRivers', -115, -105], ['Bally Bet', -125, 105]]);
  // 3. Live or period quotes never price a pregame, full-game pick.
  assert.equal(dfsPicks([pick()], [q('DraftKings', 'over', 400, { live: true }), q('DraftKings', 'under', -600, { live: true })])[0].probability, null);
  assert.equal(dfsPicks([pick()], [q('DraftKings', 'over', -110, { period: '1st half' }), q('DraftKings', 'under', -110, { period: '1st half' })])[0].probability, null);
  // 4. Two DFS apps naming the game differently don't switch off the name fallback.
  const book = [q('FanDuel', 'over', -110, { eventId: 'NBA:dallas mavericks @ denver nuggets' }), q('FanDuel', 'under', -110, { eventId: 'NBA:dallas mavericks @ denver nuggets' })];
  const twoApps = dfsPicks([pick({ eventId: 'NBA:dal @ den' }), pick({ book: 'Underdog Fantasy', eventId: 'NBA:mavericks @ nuggets' })], book);
  assert.ok(twoApps.every(item => Math.abs(item.probability - 0.5) < 1e-12), 'both apps priced');
  // ...but a book game far from the pick's start time is another game.
  const tomorrow = new Date(now + 27 * 3_600_000).toISOString();
  assert.equal(dfsPicks([pick({ eventId: 'NBA:dal @ den', startTime: tomorrow })], book)[0].probability, null);
  // 5. Pick'em higher/lower sides read as Over/Under.
  const lower = normalizeRecord({ id: 'pp', sport: 'nba', event: 'DAL @ DEN', market: 'Rebounds', side: 'lower', book: 'PrizePicks', ts, type: 'prop', line: 8.5, player: 'Luka Doncic' });
  assert.equal(lower.side, 'under');
  // 6. A slip with a pick that has no fair probability has no EV (not -100%).
  assert.equal(fantasySlip([{ probability: .56 }, { probability: null }], [0, 0, 3], 10), null);
  // 7. One pricer: a line in both feeds once, a goblin flag sticks, unchanged prices aren't resent.
  const pricer = createDfsPricer();
  pricer.setQuotes({ quotes: family, names: new Map(), picks: [pick({ oddsType: undefined })] });
  pricer.setProps([pick({ oddsType: 'goblin', event: '' })]);
  const merged = pricer.price();
  assert.equal(merged.length, 1, 'one line, More only once it is a goblin');
  assert.equal(merged[0].oddsType, 'goblin');
  assert.equal(pricer.price(), null, 'unchanged picks are not sent again');
});

test('DFS sports for display: college football and WNBA split out by team abbreviation, matching keeps the feed sport', async () => {
  const { normalizeDfsRecords, dfsPicks } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const row = (sport, event, player) => ({ id: player, sport, event, player, market: 'Points', line: 10.5, side: 'higher', app: 'PrizePicks', ts, startTime: start });
  const { picks } = normalizeDfsRecords([row('nfl', 'PITT @ VT', 'College Player'), row('nfl', 'IND @ WAS', 'Pro Player'), row('nba', 'DAL @ GSV', 'Paige Bueckers'), row('nba', 'DAL @ DEN', 'Luka Doncic')], { syncedAt: ts });
  assert.deepEqual(picks.map(p => [p.player, p.sport]), [['College Player', 'NCAAF'], ['Pro Player', 'NFL'], ['Paige Bueckers', 'WNBA'], ['Luka Doncic', 'NBA']]);
  const book = ['over', 'under'].map(side => ({ book: 'Fanatics', side, odds: -115, sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line: 10.5, eventId: 'NBA:wings @ valkyries', ts, startTime: start }));
  const [bueckers] = dfsPicks([picks[2]], book);
  assert.equal(bueckers.sport, 'WNBA');
  assert.ok(Math.abs(bueckers.probability - 0.5) < 1e-12, 'still priced from books that label the game NBA');
});

test('milestone thresholds for one player and stat are separate markets, not duplicates', async () => {
  const { normalizeFeed } = await import('../public/ev-feed-normalize.js');
  const ts = new Date(Date.now() - 60_000).toISOString();
  const row = (id, threshold, odds) => ({ id, sport: 'nfl', event: 'Chicago Bears @ Detroit Lions', market: 'Isaiah Davis - ALT Rushing Yards 1st Quarter', side: 'yes', book: 'Fanatics', odds, ts, type: 'prop', player: threshold, selection_name: threshold });
  const { quotes, skipped } = normalizeFeed([row('a', '1+', -200), row('b', '5+', 129), row('c', '10+', 309)], { syncedAt: new Date().toISOString(), price: false });
  assert.equal(skipped.duplicate, 0);
  // N+ milestones are Over (N - 0.5) on the stat.
  assert.deepEqual(quotes.map(q => [q.player, q.market, q.side, q.line, q.odds]), [['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 0.5, -200], ['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 4.5, 129], ['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 9.5, 309]]);
});

test('DFS lines match a book that labels the game with another sport; payout multipliers and sportless quotes are read', async () => {
  const { dfsPicks, normalizeRecord, normalizeDfsRecords } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  // FanDuel files this NFL game's props as NCAAF; PrizePicks says NFL.
  const book = ['over', 'under'].map(side => ({ book: 'FanDuel', side, odds: -114, sport: 'NCAAF', player: 'Josh Downs', market: 'Receiving Yards', line: 52.5, eventId: 'NCAAF:indianapolis colts @ washington commanders', ts, startTime: start }));
  const [pick] = dfsPicks([{ book: 'PrizePicks', sport: 'NFL', player: 'Josh Downs', market: 'Receiving Yards', line: 52.5, side: 'over', eventId: 'NFL:colts @ commanders', ts, startTime: start }], book);
  assert.ok(Math.abs(pick.probability - 0.5) < 1e-12);
  const sportless = normalizeRecord({ id: 'x', event: 'Pittsburgh @ Virginia Tech', market: 'prop', propMarket: 'Passing Yards', player: 'Eli Holstein', line: 210.5, side: 'over', book: 'FanDuel', odds: -110, ts, type: 'prop', selection_name: 'Eli Holstein Over 210.5' });
  assert.equal(sportless.skip, undefined, 'a quote without a sport is kept');
  assert.equal(sportless.sport, 'Other');
  const { picks } = normalizeDfsRecords([{ id: 'g', sport: 'nfl', event: 'IND @ WAS', player: 'Josh Downs', market: 'Receiving Yards', line: 30.5, side: 'higher', app: 'PrizePicks', odds_type: 'goblin', payout_multiplier: 0.7, ts, startTime: start }], { syncedAt: ts });
  assert.equal(picks[0].payoutMultiplier, 0.7);
  assert.equal(normalizeRecord({ id: 'q', sport: 'nfl', event: 'IND @ WAS', market: 'Receiving Yards', side: 'over', book: 'PrizePicks', ts, type: 'prop', line: 90.5, player: 'Josh Downs', oddsType: 'demon', payoutMultiplier: 1.55 }).payoutMultiplier, 1.55);
});

test('a payout multiplier repeated on nearly every goblin or demon line is a default and is ignored', async () => {
  const { dfsPicks } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString();
  const demon = (i, payoutMultiplier) => ({ book: 'PrizePicks', sport: 'NFL', player: `Player ${i}`, market: 'Rush Yards', line: 80.5 + i, side: 'over', eventId: 'NFL:a @ b', ts, oddsType: 'demon', payoutMultiplier });
  const flat = dfsPicks(Array.from({ length: 25 }, (_, i) => demon(i, 1.55)), []);
  assert.ok(flat.every(pick => pick.payoutMultiplier === undefined), 'the same 1.55 on all 25 demons is not a per-pick value');
  const varied = dfsPicks(Array.from({ length: 25 }, (_, i) => demon(i, 1.2 + (i % 5) * 0.25)), []);
  assert.deepEqual([...new Set(varied.map(pick => pick.payoutMultiplier))].sort(), [1.2, 1.45, 1.7, 1.95, 2.2]);
});

test('bet links that name the game instead of the book id are dropped; a future game is not live', async () => {
  const { normalizeRecord, normalizeFeed } = await import('../public/ev-feed-normalize.js');
  const ts = new Date(Date.now() - 60_000).toISOString();
  const quote = (betUrl, extra = {}) => normalizeRecord({ id: 'q', sport: 'nfl', event: 'Cincinnati Bengals @ Miami Dolphins', market: 'moneyline', type: 'moneyline', side: 'home', book: 'DraftKings', odds: -150, ts, betUrl, eventUrl: betUrl, ...extra });
  assert.equal(quote('https://sportsbook.fanduel.com/event/36112224?market=&selection=').betUrl, 'https://sportsbook.fanduel.com/event/36112224?market=&selection=');
  assert.equal(quote('https://sportsbook.draftkings.com/event/cin bengals @ mia dolphins?market=&selection=').betUrl, undefined);
  assert.equal(quote('https://www.az.bet365.com/#/AS/B1/hanshin tigers @ hiroshima toyo carp/').betUrl, undefined);
  assert.equal(quote('https://az.betrivers.com/?page=sportsbook#event/1029303644?market=').betUrl, 'https://az.betrivers.com/?page=sportsbook#event/1029303644?market=');
  assert.equal(quote('javascript:alert(1)').betUrl, undefined);
  // Sunday's game flagged live on Friday: another book's start time says it hasn't started.
  const sunday = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const raw = (id, book, extra) => ({ id, sport: 'nfl', event: 'Arizona Cardinals @ New York Giants', market: 'moneyline', type: 'moneyline', side: 'home', book, odds: 116, ts, ...extra });
  const { quotes } = normalizeFeed([raw('a', 'Betr', { live: true }), raw('b', 'FanDuel', { startTime: sunday, odds: 120 })], { syncedAt: new Date().toISOString(), price: false });
  assert.ok(quotes.every(q => q.live === false));
});

test('milestone, N+ and one-sided ladder props compare with the same pick\'em lines as Over (N - 0.5)', async () => {
  const { normalizeFeed, dfsPicks } = await import('../public/ev-feed-normalize.js');
  const ts = new Date(Date.now() - 60_000).toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const base = { sport: 'nfl', event: 'New York Jets @ Chicago Bears', type: 'prop', ts, startTime: start };
  const raw = [
    // FanDuel "to record a 15+ yard reception" and Fanatics "ALT Longest Reception 15+".
    { ...base, id: 'fd', book: 'FanDuel', market: 'prop', propMarket: 'Player to Record a 15+ Yard Reception', player: 'Luther Burden III', line: 15, side: 'over', odds: -300, selection_name: 'Luther Burden III Over 15 Player to Record a 15+ Yard Reception' },
    { ...base, id: 'fa', book: 'Fanatics', market: 'Luther Burden III - ALT Longest Reception', player: '15+', side: 'yes', odds: -270, selection_name: '15+' },
    // A one-sided whole-number ladder rung is a 50+ milestone; a whole number priced both ways stays.
    { ...base, id: 'dk', book: 'DraftKings', market: 'prop', propMarket: 'Receiving Yards', player: 'Luther Burden III', line: 50, side: 'over', odds: 101, selection_name: 'Luther Burden III Over 50.0 Receiving Yards' },
    { ...base, id: 'o4', book: 'BetMGM', market: 'prop', propMarket: 'Receptions', player: 'Luther Burden III', line: 4, side: 'over', odds: -110, selection_name: 'Luther Burden III Over 4 Receptions' },
    { ...base, id: 'u4', book: 'BetMGM', market: 'prop', propMarket: 'Receptions', player: 'Luther Burden III', line: 4, side: 'under', odds: -110, selection_name: 'Luther Burden III Under 4 Receptions' },
    { ...base, id: 'td', book: 'Fanatics', market: 'Anytime Touchdown Scorer', player: 'Luther Burden III', side: 'yes', odds: 215, selection_name: 'Luther Burden III' },
  ];
  const { quotes } = normalizeFeed(raw, { syncedAt: new Date().toISOString(), price: false });
  const line = book => quotes.filter(q => q.book === book).map(q => [q.market, q.side, q.line]);
  assert.deepEqual(line('FanDuel'), [['Longest Reception', 'over', 14.5]]);
  assert.deepEqual(line('Fanatics').sort(), [['Anytime TDs', 'over', 0.5], ['Longest Reception', 'over', 14.5]]);
  assert.deepEqual(line('DraftKings'), [['Receiving Yards', 'over', 49.5]]);
  assert.deepEqual(line('BetMGM').map(x => x[2]), [4, 4], 'a line priced both ways keeps its number');
  const pick = (market, ln) => ({ book: 'PrizePicks', sport: 'NFL', player: 'Luther Burden III', market, line: ln, side: 'over', eventId: 'NFL:jets @ bears', ts, startTime: start, oddsType: 'demon' });
  const [longest, yards, tds] = dfsPicks([pick('Longest Reception', 14.5), pick('Receiving Yards', 49.5), pick('Anytime TDs', 0.5)], quotes);
  assert.deepEqual(longest.bookLines.map(b => [b.book, b.over]).sort(), [['FanDuel', -300], ['Fanatics', -270]]);
  assert.deepEqual(yards.bookLines.map(b => [b.book, b.over]), [['DraftKings', 101]]);
  assert.deepEqual(tds.bookLines.map(b => [b.book, b.over]), [['Fanatics', 215]]);
  assert.equal(longest.probability, null, 'one-sided prices are shown, not devigged');
});

test('games filed as football whose lines are hockey, baseball or basketball show under that sport', async () => {
  const { normalizeDfsRecords } = await import('../public/ev-feed-normalize.js');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const row = (event, player, market) => ({ id: `${event}${player}${market}`, sport: 'nfl', event, player, market, line: 1.5, side: 'higher', app: 'PrizePicks', ts, startTime: start });
  const { picks } = normalizeDfsRecords([
    row('SEA @ EDM', 'Connor McDavid', 'Shots On Goal'), row('SEA @ EDM', 'Connor McDavid', 'Points'),
    row('CWS @ CLE', 'Jose Ramirez', 'Total Bases'), row('CWS @ CLE', 'Jose Ramirez', 'Hits'),
    row('DAL @ GSV', 'Paige Bueckers', 'Rebounds'), row('DAL @ GSV', 'Paige Bueckers', 'FG Made'),
    row('IND @ WAS', 'Josh Downs', 'Receptions'), row('IND @ WAS', 'Spencer Shrader', 'FG Made'),
  ], { syncedAt: ts });
  const sportOf = (player, market) => picks.find(p => p.player === player && p.market === market).sport;
  assert.equal(sportOf('Connor McDavid', 'Points'), 'NHL');
  assert.equal(sportOf('Jose Ramirez', 'Hits'), 'MLB');
  assert.equal(sportOf('Paige Bueckers', 'FG Made'), 'WNBA');
  assert.equal(sportOf('Spencer Shrader', 'FG Made'), 'NFL', 'a real football game keeps its label');
  assert.ok(picks.filter(p => p.sport !== 'NFL').every(p => p.matchSport === 'NFL'), 'matching keeps the feed sport');
});
