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
  assert.deepEqual(skipped, { invalid: 0, notProps: 2, stale: 1 });
  assert.equal(picks[0].side, 'over');
  assert.equal(picks[0].probability, undefined, 'fair probability comes only from devigged sportsbook odds');
  assert.equal(picks.at(-1).probability, undefined, 'a per-pick probability from the API is not used either');
  assert.deepEqual(payoutTables([{ app: 'Underdog', payouts: { 2: { power: { multiplier: 3 } }, 3: { power: { multiplier: 5 }, flex: null } } }]), { 'Underdog Fantasy': { 2: [0, 0, 3], 3: [0, 0, 0, 5] } });
  const { withStandardPaytables, paytableSource } = await import('../public/dfs-workspace.js');
  const api = { PrizePicks: { 3: [0, 0, 0, 5] } };
  assert.deepEqual(withStandardPaytables({}, api).PrizePicks['3'], [0, 0, 0, 5], 'the API table wins over the built-in one');
  assert.equal(paytableSource({}, 'PrizePicks', 3, api), 'api');
  assert.equal(paytableSource({ PrizePicks: { 3: [0, 0, 1, 6] } }, 'PrizePicks', 3, api), 'saved');
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
