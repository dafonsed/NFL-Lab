import test from 'node:test';
import assert from 'node:assert/strict';
import { repairSelection, matchParticipant, normalizeFeed, normalizeDfsRecords, underdogFiftyFifty, shareStrings, markPriceFamilies, knownSport, sportName } from '../lib/odds/normalize.mjs';
import { consensusPrice } from '../lib/odds/engine.mjs';

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
  const quotes = [q('FanDuel', 'home', -150), q('FanDuel', 'away', 130), q('Novig', 'home', -150), q('Novig', 'away', 130), q('DraftKings', 'home', -110), q('DraftKings', 'away', -110), q('Pinnacle', 'home', 120)];
  markPriceFamilies(quotes, { minShared: 2, minIdentical: 0.7 });
  assert.equal(quotes[2].priceFamily, 'Novig' < 'FanDuel' ? undefined : 'FanDuel');
  const consensus = consensusPrice(quotes.at(-1), quotes, { minSharpBooks: 1 });
  assert.equal(consensus.bookCount, 2, 'FanDuel and Novig are one reference, DraftKings the other');
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
    prop('ud-u', 'Underdog', 'under', undefined, { line: 263.5, selection_name: 'Josh Allen Under 263.5' }),
  ], { syncedAt: '2026-09-30T22:00:00.000Z' });
  assert.equal(quotes.some(q => q.book === 'PrizePicks'), false, 'pick\'em lines stay out of the sportsbook tools');
  const pp = dfs.find(pick => pick.app === 'PrizePicks'), ud = dfs.find(pick => pick.app === 'Underdog Fantasy');
  assert.equal(pp.side, 'Over');
  assert.equal(pp.event, ud.event, 'every app shares one game name');
  const noVig = (o, u) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100)) / ((o > 0 ? 100 / (o + 100) : -o / (-o + 100)) + (u > 0 ? 100 / (u + 100) : -u / (-u + 100)));
  // "Pass Yards" at PrizePicks matches "Passing Yards" at the books; Underdog's 263.5 line has no book at that line.
  assert.ok(Math.abs(pp.probability - (noVig(-120, 100) * 25 + noVig(-115, -105) * 50) / 75) < 1e-9);
  assert.equal(ud.probability, null);
  const exact = normalizeFeed([prop('dk-o', 'DraftKings', 'over', -120), prop('dk-u', 'DraftKings', 'under', 100), prop('fd-o', 'FanDuel', 'over', -115), prop('fd-u', 'FanDuel', 'under', -105), prop('pp-o', 'PrizePicks', 'over', undefined)], { syncedAt: '2026-09-30T22:00:00.000Z' }).dfs[0];
  assert.ok(Math.abs(exact.probability - (noVig(-120, 100) * 25 + noVig(-115, -105) * 50) / 75) < 1e-9);
  assert.deepEqual(exact.probabilityBooks.sort(), ['DraftKings', 'FanDuel']);
});

test('Underdog lines count only when listed both higher and lower (its 50/50 lines); other apps are kept', () => {
  const pick = (id, app, side, line, market = 'Anytime TD') => ({ id, app, sport: 'nfl', event: '', startTime: '', player: 'Malik Washington', market, line, side, odds_type: 'standard', payout_multiplier: 1, ts: '2026-09-30T21:59:00.000Z' });
  const records = [
    pick('a', 'Underdog', 'higher', 0.5), pick('b', 'Underdog', 'higher', 58.5, 'Receiving Yards'), pick('c', 'Underdog', 'lower', 58.5, 'Receiving Yards'),
    pick('d', 'Underdog', 'higher', 79.5, 'Receiving Yards'), pick('e', 'PrizePicks', 'higher', 0.5),
  ];
  const { picks } = normalizeDfsRecords(records, { syncedAt: '2026-09-30T22:00:00.000Z' });
  assert.equal(picks.length, 5, 'entered lines are read as they are');
  assert.deepEqual(underdogFiftyFifty(picks).map(p => p.id), ['b', 'c', 'e'], 'a one-way Underdog line (anytime TD, an alternate yardage) pays an adjusted amount');
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
  const { normalizeDfsRecords, payoutTables } = await import('../lib/odds/normalize.mjs');
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
  const api = { PrizePicks: { 3: [0, 0, 0, 5] }, Sleeper: { 3: [0, 0, 0, 5.64] }, ParlayPlay: { 3: [0, 0, 0, 5.5] } };
  const tables = withStandardPaytables({ 'Sleeper Picks': { 3: [0, 0, 0, 6] } }, api);
  assert.deepEqual(tables.PrizePicks['3'], [0, 0, 0, 6], 'the published PrizePicks payout beats the API');
  assert.deepEqual(tables.ParlayPlay['3'], [0, 0, 0, 5.5], 'the API fills apps without a published table');
  // Sleeper pays each pick's multiplier (its 5.64x is 1.78x cubed): a 1x table scaled by the picks' multipliers, whatever else is saved.
  assert.deepEqual(tables['Sleeper Picks']['3'], [0, 0, 0, 1], 'per-pick apps use the product of their picks');
  assert.equal(paytableSource({}, 'PrizePicks', 3, api), 'standard');
  assert.equal(paytableSource({}, 'Sleeper Picks', 3, { 'Sleeper Picks': api.Sleeper }), 'api');
  assert.equal(paytableSource({ PrizePicks: { 3: [0, 0, 1, 6] } }, 'PrizePicks', 3, api), 'saved');
  const { breakEven } = await import('../public/dfs-workspace.js');
  // Published PrizePicks Power: 3×, 6×, 10×, 20×, 37.5× → per-pick break-even M^(-1/n).
  assert.deepEqual([2, 3, 4, 5, 6].map(n => Math.round(breakEven(tables.PrizePicks[String(n)]) * 10000) / 100), [57.74, 55.03, 56.23, 54.93, 54.66]);
});

test('DFS lines filed under NBA move to the sport their markets belong to; season rows are not players', async () => {
  const { normalizeDfsRecords } = await import('../lib/odds/normalize.mjs');
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

test('raw two-sided odds → implied → devig → fair probability, with the method as a setting', async () => {
  const { implied: americanToImpliedProbability, fairFromAmerican, devig, DEVIG_METHODS } = await import('../public/betting-math.js');
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
  assert.deepEqual([...DEVIG_METHODS], ['multiplicative', 'additive', 'power', 'probit', 'shin', 'worst']);
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
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const { fairFromAmerican } = await import('../public/betting-math.js');
  const ts = new Date().toISOString();
  const book = (book, side, odds) => ({ book, side, odds, player: 'Jalen Hurts', market: 'Pass Yards', line: 225.5, eventId: 'NFL:eagles', ts });
  const quotes = [book('FanDuel', 'over', -140), book('FanDuel', 'under', 118), book('DraftKings', 'over', -150), book('DraftKings', 'under', 125), book('BetMGM', 'over', -130)];
  const pick = side => ({ book: 'PrizePicks', player: 'Jalen Hurts', market: 'Pass Yards', line: 225.5, side, eventId: 'NFL:eagles', ts, probability: 0.6667 });
  for (const method of ['multiplicative', 'probit']) {
    const [over, under] = dfsPicks([pick('over'), pick('under')], quotes, new Map(), { method });
    const expected = (fairFromAmerican([-140, 118], method).fair[0] * 50 + fairFromAmerican([-150, 125], method).fair[0] * 25) / 75;
    assert.ok(Math.abs(over.probability - expected) < 1e-12, `${method}: average of each book's devigged Over`);
    assert.ok(Math.abs(under.probability - (1 - expected)) < 1e-12);
    assert.deepEqual(over.probabilityBooks, ['FanDuel', 'DraftKings'], 'a one-sided book (BetMGM) is not devigged');
    assert.equal(over.probabilityMethod, method);
  }
  const [alone] = dfsPicks([pick('over')], [], new Map());
  assert.equal(alone.probability, null, 'without sportsbook prices there is no fair probability, whatever the API sends');
});

test('Fanatics props read the stat from propMarket and repair a selection sent as the player', async () => {
  const { normalizeRecord } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString();
  const yards = normalizeRecord({ id: 'f1', sport: 'nfl', event: 'Commanders @ Colts', market: 'prop', propMarket: 'Receiving Yards', player: 'Rachaad White', line: 20.5, side: 'over', book: 'Fanatics', odds: 240, ts, type: 'prop', selection_name: 'Rachaad White Over 20.5 Receiving Yards' });
  assert.deepEqual([yards.player, yards.market, yards.side, yards.line], ['Rachaad White', 'Receiving Yards', 'over', 20.5]);
  const points = normalizeRecord({ id: 'f2', sport: 'nba', event: 'Dallas Wings @ Golden State Valkyries', market: 'Awak Kuier - Points', side: 'yes', book: 'Fanatics', odds: -130, ts, type: 'prop', player: 'Over 6.5', selection_name: 'Over 6.5' });
  assert.deepEqual([points.player, points.market, points.side, points.line], ['Awak Kuier', 'Points', 'over', 6.5]);
});

test('a sportsbook Over/Under pair with no margin is not devigged into a fair probability', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const { fairFromAmerican } = await import('../public/betting-math.js');
  const ts = new Date().toISOString();
  const book = (book, side, odds) => ({ book, side, odds, player: 'Rachaad White', market: 'Receiving Yards', line: 20.5, eventId: 'NFL:colts @ commanders', ts });
  // +240 / -238 implies 29.4% + 70.4% = 99.8%: the Under is the Over mirrored, not a market.
  const quotes = [book('Fanatics', 'over', 240), book('Fanatics', 'under', -238), book('DraftKings', 'over', -140), book('DraftKings', 'under', 118)];
  const [pick] = dfsPicks([{ book: 'PrizePicks', player: 'Rachaad White', market: 'Receiving Yards', line: 20.5, side: 'over', eventId: 'NFL:colts @ commanders', ts }], quotes);
  assert.deepEqual(pick.probabilityBooks, ['DraftKings']);
  assert.ok(Math.abs(pick.probability - fairFromAmerican([-140, 118]).fair[0]) < 1e-12);
});

test('a pick prices against the same player, stat and line when the books name the game differently', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const { fairFromAmerican } = await import('../public/betting-math.js');
  const ts = new Date().toISOString();
  const quote = (side, odds, eventId = 'NBA:wings @ valkyries') => ({ book: 'FanDuel', side, odds, sport: 'NBA', player: 'Veronica Burton', market: 'Points', line: 12.5, eventId, ts });
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
  const { normalizeRecord, normalizeDfsRecords, dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString();
  const quote = extra => normalizeRecord({ id: 'pp', sport: 'nfl', event: 'IND @ WAS', market: 'Receiving Yards', side: 'over', book: 'PrizePicks', ts, type: 'prop', line: 63.5, player: 'Josh Downs', selection_name: 'Josh Downs Over 63.5', ...extra });
  assert.equal(quote({ oddsType: 'Goblin' }).oddsType, 'goblin');
  assert.equal(quote({}).oddsType, undefined);
  const { picks } = normalizeDfsRecords([{ id: 'd1', sport: 'nfl', event: 'IND @ WAS', player: 'Josh Downs', market: 'Receiving Yards', line: 80.5, side: 'higher', app: 'PrizePicks', odds_type: 'demon', ts }], { syncedAt: ts });
  assert.equal(picks[0].oddsType, 'demon');
  const [standard] = dfsPicks([{ ...quote({}), book: 'PrizePicks' }], []);
  assert.equal(standard.oddsType, 'standard');
});

test('only the side an app publishes becomes a pick; goblins and demons are never mirrored', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const { fairFromAmerican } = await import('../public/betting-math.js');
  const ts = new Date().toISOString();
  const pick = (oddsType, line) => ({ book: 'PrizePicks', sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line, side: 'over', eventId: 'NBA:dal @ gsv', ts, oddsType });
  const quotes = [['over', -110], ['under', -120]].map(([side, odds]) => ({ book: 'FanDuel', side, odds, sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line: 15.5, eventId: 'NBA:dal @ gsv', ts }));
  const rows = dfsPicks([pick('standard', 15.5), pick('goblin', 10.5), pick('demon', 22.5)], quotes);
  assert.deepEqual(rows.map(row => [row.line, row.side, row.oddsType]), [[15.5, 'Over', 'standard'], [10.5, 'Over', 'goblin'], [22.5, 'Over', 'demon']]);
  const [over] = rows, fair = fairFromAmerican([-110, -120]).fair;
  assert.ok(Math.abs(over.probability - fair[0]) < 1e-12, 'the published side is priced from the devigged market');
  const sent = dfsPicks([pick('standard', 15.5), { ...pick('standard', 15.5), side: 'under' }], quotes);
  assert.deepEqual(sent.map(row => row.side), ['Over', 'Under'], 'both sides are kept only when the app sends both');
});

test('a priced SmartStake fantasy-book row is comparison data, not an offered pick', async () => {
  const { normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), startTime = new Date(Date.now() + 3_600_000).toISOString();
  const line = extra => ({
    sport: 'mlb', event: 'MIL @ SD', type: 'prop', market: 'prop', propMarket: 'Doubles',
    player: 'Cooper Pratt', line: .5, side: 'under', ts, startTime, ...extra,
  });
  const { picks, quotes } = normalizeFeed([
    line({ id: 'contaminated', book: 'parlayplay', odds: -1999 }),
    line({ id: 'offered', book: 'parlayplay' }),
    line({ id: 'book-over', book: 'DraftKings', side: 'over', odds: 500 }),
    line({ id: 'book-under', book: 'DraftKings', odds: -2000 }),
  ], { price: false });

  assert.deepEqual(picks.map(pick => pick.id), ['local-api:offered']);
  assert.deepEqual(quotes.map(quote => quote.book), ['DraftKings', 'DraftKings'], 'the sportsbook prices remain available to price the real pick');
});

test('player props show their stat as the market and in the bet; margin bands and round props are not moneylines', async () => {
  const { normalizeRecord } = await import('../lib/odds/normalize.mjs');
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
  const { consensusPrice } = await import('../lib/odds/engine.mjs');
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
  const { normalizeFeed, dfsPicks, createDfsPricer, normalizeRecord } = await import('../lib/odds/normalize.mjs');
  const { fairFromAmerican } = await import('../public/betting-math.js');
  const { fantasySlip } = await import('../public/betting-math.js');
  const now = Date.now(), ts = new Date(now - 60_000).toISOString(), start = new Date(now + 3 * 3_600_000).toISOString();
  const dk = (id, propMarket, side, odds) => ({ id, sport: 'nba', event: 'Dallas Mavericks @ Denver Nuggets', market: 'prop', propMarket, player: 'Luka Doncic', line: 8.5, side, book: 'DraftKings', odds, ts, type: 'prop', startTime: start, selection_name: `Luka Doncic ${side === 'over' ? 'Over' : 'Under'} 8.5 ${propMarket}` });
  // 1. Rebounds 8.5 and Assists 8.5 for one player at one book are two markets, not duplicates.
  const feed = normalizeFeed([dk('r1', 'Rebounds', 'over', -120), dk('r2', 'Rebounds', 'under', -110), dk('a1', 'Assists', 'over', 105), dk('a2', 'Assists', 'under', -135)], { syncedAt: new Date(now).toISOString() });
  assert.equal(feed.quotes.length, 4, 'all four prices are kept');
  assert.equal(feed.skipped.duplicate, 0);
  // 2. Each book keeps its own Over and Under; a price family is averaged after devigging.
  const q = (book, side, odds, extra = {}) => ({ book, side, odds, sport: 'NBA', player: 'Luka Doncic', market: 'Rebounds', line: 8.5, eventId: 'NBA:mavericks @ nuggets', ts, startTime: start, ...extra });
  const pick = extra => ({ book: 'PrizePicks', sport: 'NBA', player: 'Luka Doncic', market: 'Rebounds', line: 8.5, side: 'over', eventId: 'NBA:mavericks @ nuggets', ts, startTime: start, ...extra });
  const family = [q('FanDuel', 'over', -115, { priceFamily: 'kambi' }), q('FanDuel', 'under', -105, { priceFamily: 'kambi' }), q('Novig', 'over', -125, { priceFamily: 'kambi' }), q('Novig', 'under', 105, { priceFamily: 'kambi' })];
  const [priced] = dfsPicks([pick()], family);
  const expected = (fairFromAmerican([-115, -105]).fair[0] + fairFromAmerican([-125, 105]).fair[0]) / 2;
  assert.ok(Math.abs(priced.probability - expected) < 1e-12, 'each book devigged on its own prices, then the family averaged');
  assert.deepEqual(priced.probabilitySources.map(s => [s.book, s.over, s.under]), [['FanDuel', -115, -105], ['Novig', -125, 105]]);
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
  const { normalizeDfsRecords, dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const row = (sport, event, player) => ({ id: player, sport, event, player, market: 'Points', line: 10.5, side: 'higher', app: 'PrizePicks', ts, startTime: start });
  const { picks } = normalizeDfsRecords([row('nfl', 'PITT @ VT', 'College Player'), row('nfl', 'IND @ WAS', 'Pro Player'), row('nba', 'DAL @ GSV', 'Paige Bueckers'), row('nba', 'DAL @ DEN', 'Luka Doncic')], { syncedAt: ts });
  assert.deepEqual(picks.map(p => [p.player, p.sport]), [['College Player', 'NCAAF'], ['Pro Player', 'NFL'], ['Paige Bueckers', 'WNBA'], ['Luka Doncic', 'NBA']]);
  const book = ['over', 'under'].map(side => ({ book: 'FanDuel', side, odds: -115, sport: 'NBA', player: 'Paige Bueckers', market: 'Points', line: 10.5, eventId: 'NBA:wings @ valkyries', ts, startTime: start }));
  const [bueckers] = dfsPicks([picks[2]], book);
  assert.equal(bueckers.sport, 'WNBA');
  assert.ok(Math.abs(bueckers.probability - 0.5) < 1e-12, 'still priced from books that label the game NBA');
});

test('milestone thresholds for one player and stat are separate markets, not duplicates', async () => {
  const { normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const ts = new Date(Date.now() - 60_000).toISOString();
  const row = (id, threshold, odds) => ({ id, sport: 'nfl', event: 'Chicago Bears @ Detroit Lions', market: 'Isaiah Davis - ALT Rushing Yards 1st Quarter', side: 'yes', book: 'Fanatics', odds, ts, type: 'prop', player: threshold, selection_name: threshold });
  const { quotes, skipped } = normalizeFeed([row('a', '1+', -200), row('b', '5+', 129), row('c', '10+', 309)], { syncedAt: new Date().toISOString(), price: false });
  assert.equal(skipped.duplicate, 0);
  // N+ milestones are Over (N - 0.5) on the stat.
  assert.deepEqual(quotes.map(q => [q.player, q.market, q.side, q.line, q.odds]), [['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 0.5, -200], ['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 4.5, 129], ['Isaiah Davis', 'Rushing Yards 1st Quarter', 'over', 9.5, 309]]);
});

test('DFS lines match a book that labels the game with another sport; payout multipliers and sportless quotes are read', async () => {
  const { dfsPicks, normalizeRecord, normalizeDfsRecords } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  // FanDuel files this NFL game's props as NCAAF; PrizePicks says NFL.
  const book = ['over', 'under'].map(side => ({ book: 'FanDuel', side, odds: -114, sport: 'NCAAF', player: 'Josh Downs', market: 'Receiving Yards', line: 52.5, eventId: 'NCAAF:indianapolis colts @ washington commanders', ts, startTime: start }));
  const [pick] = dfsPicks([{ book: 'PrizePicks', sport: 'NFL', player: 'Josh Downs', market: 'Receiving Yards', line: 52.5, side: 'over', eventId: 'NFL:colts @ commanders', ts, startTime: start }], book);
  assert.ok(Math.abs(pick.probability - 0.5) < 1e-12);
  const sportless = normalizeRecord({ id: 'x', event: 'Pittsburgh @ Virginia Tech', market: 'prop', propMarket: 'Passing Yards', player: 'Eli Holstein', line: 210.5, side: 'over', book: 'FanDuel', odds: -110, ts, type: 'prop', selection_name: 'Eli Holstein Over 210.5' });
  assert.equal(sportless.skip, undefined, 'a quote without a sport is kept');
  assert.equal(sportless.sport, 'Other');
  const { picks } = normalizeDfsRecords([{ id: 'g', sport: 'nfl', event: 'IND @ WAS', player: 'Josh Downs', market: 'Receiving Yards', line: 30.5, side: 'higher', app: 'PrizePicks', odds_type: 'goblin', payout_multiplier: 0.7, ts, startTime: start }], { syncedAt: ts });
  assert.equal(picks[0].payoutMultiplier, undefined, 'the static 0.7 goblin default is not a real payout');
  assert.equal(normalizeRecord({ id: 'q', sport: 'nfl', event: 'IND @ WAS', market: 'Receiving Yards', side: 'over', book: 'PrizePicks', ts, type: 'prop', line: 90.5, player: 'Josh Downs', oddsType: 'demon', payoutMultiplier: 1.55 }).payoutMultiplier, 1.55);
});

test('a payout multiplier repeated on nearly every goblin or demon line is a default and is ignored', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString();
  const demon = (i, payoutMultiplier) => ({ book: 'PrizePicks', sport: 'NFL', player: `Player ${i}`, market: 'Rush Yards', line: 80.5 + i, side: 'over', eventId: 'NFL:a @ b', ts, oddsType: 'demon', payoutMultiplier });
  const flat = dfsPicks(Array.from({ length: 25 }, (_, i) => demon(i, 1.55)), []);
  assert.ok(flat.every(pick => pick.payoutMultiplier === undefined), 'the same 1.55 on all 25 demons is not a per-pick value');
  const varied = dfsPicks(Array.from({ length: 25 }, (_, i) => demon(i, 1.2 + (i % 5) * 0.25)), []);
  assert.deepEqual([...new Set(varied.map(pick => pick.payoutMultiplier))].sort(), [1.2, 1.45, 1.7, 1.95, 2.2]);
  const small = dfsPicks([demon(1, 1), demon(2, 1.3)], []);
  assert.deepEqual(small.map(pick => pick.payoutMultiplier), [undefined, 1.3], 'a flat 1x demon is never treated as a payout');
});

test('bet links that name the game instead of the book id are dropped; a future game is not live', async () => {
  const { normalizeRecord, normalizeFeed } = await import('../lib/odds/normalize.mjs');
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
  const { normalizeFeed, dfsPicks } = await import('../lib/odds/normalize.mjs');
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
  const { normalizeDfsRecords } = await import('../lib/odds/normalize.mjs');
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

test('books naming a player or stat differently still match the pick\'em line', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const pairs = [
    // [PrizePicks player, PrizePicks stat, book player, book stat]
    ['Luther Burden III', 'Receptions', 'Luther Burden', 'Total Receptions'],
    ['Marvin Harrison Jr.', 'Receiving Yards', 'Marvin Harrison', 'Rec Yds'],
    ['Stephen Curry', '3-PT Made', 'Stephen Curry', 'Threes'],
    ['Stephen Curry', '3-PT Made', 'Stephen Curry', '3-Pointers Made'],
    ['Tarik Skubal', 'Pitcher Strikeouts', 'Tarik Skubal', 'Strikeouts'],
    ['Juuse Saros', 'Goalie Saves', 'Juuse Saros', 'Saves'],
    ['Saquon Barkley', 'Rush Attempts', 'Saquon Barkley', 'Carries'],
    ['Jared Goff', 'INT', 'Jared Goff', 'Interceptions Thrown'],
    ['Nikola Jokic', 'Pts+Rebs+Asts', 'Nikola Jokić', 'Points + Rebounds + Assists'],
  ];
  for (const [ppPlayer, ppStat, bookPlayer, bookStat] of pairs) {
    const quotes = ['over', 'under'].map(side => ({ book: 'BetMGM', side, odds: -110, sport: 'NFL', player: bookPlayer, market: bookStat, line: 4.5, eventId: 'NFL:book game', ts, startTime: start }));
    const [pick] = dfsPicks([{ book: 'PrizePicks', sport: 'NFL', player: ppPlayer, market: ppStat, line: 4.5, side: 'over', eventId: 'NFL:pp game', ts, startTime: start }], quotes);
    assert.ok(Math.abs(pick.probability - 0.5) < 1e-12, `${ppPlayer} ${ppStat} matches ${bookPlayer} ${bookStat}`);
  }
  // Different stats still don't match.
  const hits = ['over', 'under'].map(side => ({ book: 'BetMGM', side, odds: -110, sport: 'MLB', player: 'Tarik Skubal', market: 'Hits Allowed', line: 4.5, eventId: 'MLB:g', ts, startTime: start }));
  assert.equal(dfsPicks([{ book: 'PrizePicks', sport: 'MLB', player: 'Tarik Skubal', market: 'Pitcher Strikeouts', line: 4.5, side: 'over', eventId: 'MLB:p', ts, startTime: start }], hits)[0].probability, null);
});

test('each sportsbook is matched to the pick by its own game, however it names or files it', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), at = hours => new Date(Date.now() + hours * 3_600_000).toISOString();
  const pair = (book, eventId, over, under, startTime, line = 1.5) => [['over', over], ['under', under]].map(([side, odds]) => ({ book, side, odds, player: 'Daniel Jones', market: 'Pass TDs', line, eventId, ts, startTime }));
  const pick = { book: 'PrizePicks', sport: 'NFL', player: 'Daniel Jones', market: 'Pass TDs', line: 1.5, side: 'over', eventId: 'NFL:ind @ was', ts, startTime: at(40) };
  // FanDuel files the game as NFL "Colts @ Commanders", DraftKings as NCAAF with city codes.
  const books = [...pair('FanDuel', 'NFL:colts @ commanders', 120, -150, at(40)), ...pair('DraftKings', 'NCAAF:ind colts @ was commanders', 115, -145, at(40))];
  const [priced] = dfsPicks([pick], books);
  assert.deepEqual(priced.probabilityBooks.sort(), ['DraftKings', 'FanDuel']);

  // A book listing the player in two games picks the one starting with the pick's game ...
  const twoGames = [...pair('FanDuel', 'NFL:colts @ commanders', 120, -150, at(40)), ...pair('FanDuel', 'NFL:colts @ texans', 300, -400, at(44))];
  assert.deepEqual(dfsPicks([pick], twoGames)[0].probabilitySources, [{ book: 'FanDuel', over: 120, under: -150 }]);
  // ... and is left out when both start near it, or when its only game is more than 12 hours off.
  const unclear = [...pair('FanDuel', 'NFL:colts @ commanders', 120, -150, at(40.5)), ...pair('FanDuel', 'NFL:colts @ texans', 300, -400, at(39.5))];
  assert.equal(dfsPicks([pick], unclear)[0].bookLines, undefined);
  assert.equal(dfsPicks([pick], pair('FanDuel', 'NFL:colts @ commanders', 120, -150, at(64)))[0].bookLines, undefined);
});

test('initials, nicknames and FanDuel ladder names match the pick\'em line', async () => {
  const { dfsPicks, normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const pairs = [
    ['D.J. Moore', 'Receptions', 'DJ Moore', 'Receptions'],
    ['T.J. Hockenson', 'Receiving Yards', 'TJ Hockenson', 'Receiving Yds'],
    ['Cam Skattebo', 'Rush Yards', 'Cameron Skattebo', 'Rushing Yards'],
    ['Kenny Gainwell', 'Rush Attempts', 'Kenneth Gainwell', 'Rush Attempts'],
    ['Tyson Bagent', 'Pass Completions', 'Tyson Bagent', 'Completions'],
    ['Jayson Tatum', '3-PT Made', 'Jayson Tatum', 'Jayson Tatum - Made Threes'],
    ['Shai Gilgeous-Alexander', 'Pts+Rebs+Asts', 'Shai Gilgeous-Alexander', 'S Gilgeous-Alexander - Pts + Reb + Ast'],
    // Anytime TD under the apps' names (Chalkboard and Dabble, Sleeper) and a book's.
    ['Bijan Robinson', 'Rush + Rec TDs', 'Bijan Robinson', 'Anytime TDs'],
    ['Bijan Robinson', 'TDs', 'Bijan Robinson', 'Anytime Touchdown Scorer'],
    ['Bijan Robinson', 'Rush + Rec TDs 1H', 'Bijan Robinson', '1st Half Anytime TD'],
  ];
  for (const [ppPlayer, ppStat, bookPlayer, bookStat] of pairs) {
    const quotes = ['over', 'under'].map(side => ({ book: 'FanDuel', side, odds: -110, player: bookPlayer, market: bookStat, line: 4.5, eventId: 'NFL:book game', ts, startTime: start }));
    const [pick] = dfsPicks([{ book: 'PrizePicks', sport: 'NFL', player: ppPlayer, market: ppStat, line: 4.5, side: 'over', eventId: 'NFL:pp game', ts, startTime: start }], quotes);
    assert.ok(Math.abs(pick.probability - 0.5) < 1e-12, `${ppPlayer} ${ppStat} matches ${bookPlayer} ${bookStat}`);
  }
  // FanDuel ladders ("To Score 20+ Points" at line 20, Over only) are Over 19.5 on the stat.
  const ladder = [['To Score 20+ Points', 20, 'Points', 19.5], ['To Record 2+ Hits + Runs + RBIs', 2, 'Hits + Runs + RBIs', 1.5], ['To Hit 2+ Home Runs', 2, 'Home Runs', 1.5], ['4+ Made Threes', 4, 'Made Threes', 3.5]];
  const { quotes } = normalizeFeed(ladder.map(([market, line], i) => ({ id: `l${i}`, sport: 'nba', event: 'Knicks @ Celtics', market: 'prop', propMarket: market, player: 'Jalen Brunson', line, side: 'over', book: 'FanDuel', odds: -150, ts, type: 'prop', selection_name: `Jalen Brunson Over ${line} ${market}`, startTime: start })), { syncedAt: ts });
  assert.deepEqual(quotes.map(quote => [quote.market, quote.line, quote.side]), ladder.map(([, , market, line]) => [market, line, 'over']));
});

test('a line a book moved or a DFS app pulled leaves the feed once the newer one is 5+ minutes ahead', async () => {
  const { normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const now = Date.now(), ago = minutes => new Date(now - minutes * 60_000).toISOString(), start = new Date(now + 86_400_000).toISOString();
  const prop = (id, book, line, side, minutes, extra = {}) => ({ id, sport: 'nfl', event: 'Giants @ Saints', market: 'prop', propMarket: 'Receiving Yards', player: 'Darius Slayton', line, side, book, odds: -110, ts: ago(minutes), type: 'prop', selection_name: `Darius Slayton ${side === 'over' ? 'Over' : 'Under'} ${line} Receiving Yards`, startTime: start, ...extra });
  const { quotes, picks } = normalizeFeed([
    // DraftKings moved 13.5 -> 14.5 six minutes ago; FanDuel's alt line refreshed with its main line.
    prop('a', 'DraftKings', 13.5, 'over', 6), prop('b', 'DraftKings', 13.5, 'under', 6), prop('c', 'DraftKings', 14.5, 'over', 0.5), prop('d', 'DraftKings', 14.5, 'under', 0.5),
    prop('e', 'FanDuel', 13.5, 'over', 0.5), prop('f', 'FanDuel', 13.5, 'under', 0.5), prop('g', 'FanDuel', 19.5, 'over', 0.5), prop('h', 'FanDuel', 19.5, 'under', 0.5),
    // PrizePicks pulled one line of the game eight minutes ago.
    prop('p1', 'PrizePicks', 13.5, 'over', 0.5, { event: 'NYG @ NO', market: 'Receiving Yards', propMarket: undefined, odds: null }), prop('p2', 'PrizePicks', 3.5, 'over', 8, { event: 'NYG @ NO', market: 'Receptions', propMarket: undefined, odds: null }),
  ], { syncedAt: new Date(now).toISOString() });
  assert.deepEqual(quotes.filter(q => q.book === 'DraftKings').map(q => q.line), [14.5, 14.5]);
  assert.deepEqual(quotes.filter(q => q.book === 'FanDuel').map(q => q.line), [13.5, 13.5, 19.5, 19.5]);
  assert.deepEqual(picks.map(p => p.line), [13.5]);
});

test('exchange prices that add up to well under 100% are not shown or devigged', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const pair = (book, over, under) => [['over', over], ['under', under]].map(([side, odds]) => ({ book, side, odds, exchange: book === 'Novig', player: 'Isaiah Davis', market: 'Rushing Yards', line: 20.5, eventId: 'NFL:jets @ bears', ts, startTime: start }));
  const pick = { book: 'PrizePicks', sport: 'NFL', player: 'Isaiah Davis', market: 'Rush Yards', line: 20.5, side: 'over', eventId: 'NFL:nyj @ chi', ts, startTime: start };
  const [bad] = dfsPicks([pick], [...pair('Novig', 122, 133), ...pair('FanDuel', -110, -110)]);
  assert.deepEqual(bad.bookLines.map(line => line.book), ['FanDuel']);
  const [good] = dfsPicks([pick], pair('Novig', -105, 101));
  assert.deepEqual(good.probabilityBooks, ['Novig']);
});

test('DFS lines take their sport from league codes and from the app\'s other lines for the game', async () => {
  const { normalizeDfsRecords } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const row = (sport, event, player, market) => ({ id: `${event}${player}${market}`, sport, event, player, market, line: 10.5, side: 'higher', app: 'PrizePicks', ts, startTime: start });
  const { picks } = normalizeDfsRecords([
    row('other', 'CS2', 'Legacy MAPS 1-2', 'MAPS 1-2 Kills'), row('mma', 'BAD', 'Viktor Axelsen', 'Points'), row('mlb', 'KBO', 'Kim Do-yeong', 'Hits'),
    row('other', 'PGA', 'Thomas Detry', 'Strokes'), row('nwsl', 'POR @ KC', 'Sophia Wilson', 'Shots'),
    row('nfl', 'MICH @ MINN', 'Justice Haynes', 'Rush Yards'), row('other', 'MICH @ MINN', 'Bryce Underwood', 'Pass Yards'),
  ], { syncedAt: ts });
  const sport = player => picks.find(p => p.player === player);
  assert.deepEqual(['Legacy MAPS 1-2', 'Viktor Axelsen', 'Kim Do-yeong', 'Thomas Detry'].map(p => sport(p).sport), ['Esports', 'Badminton', 'KBO', 'Golf']);
  assert.deepEqual([sport('Sophia Wilson').sport, sport('Sophia Wilson').league], ['Soccer', 'NWSL']);
  assert.equal(sport('Bryce Underwood').sport, 'NCAAF');
});

test('1st-half and 1st-quarter lines sent under the full-game stat are marked and not priced', async () => {
  const { dfsPicks } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 3_600_000).toISOString();
  const pp = (player, line, oddsType) => ({ book: 'PrizePicks', sport: 'NFL', player, market: 'Pass Yards', line, side: 'over', eventId: 'NFL:ind @ was', ts, startTime: start, ...(oddsType ? { oddsType } : {}) });
  const book = (player, line, over, under) => [['over', over], ['under', under]].map(([side, odds]) => ({ book: 'FanDuel', side, odds, player, market: 'Passing Yards', line, eventId: 'NFL:colts @ commanders', ts, startTime: start }));
  const quotes = [...book('Marcus Mariota', 211.5, -110, -110), ...book('Marcus Mariota', 98.5, -2000, 900), ...book('Daniel Jones', 224.5, -112, -108), ...book('Daniel Jones', 112.5, -5000, 1500)];
  const picks = dfsPicks([pp('Marcus Mariota', 211.5), pp('Marcus Mariota', 98.5), pp('Marcus Mariota', 40.5), pp('Marcus Mariota', 229.5, 'demon'), pp('Marcus Mariota', 94.5, 'goblin'),
    // Daniel Jones: only his 1H (112.5) and 1Q (48.5) standard lines are listed; 199.5 is a full-game demon.
    pp('Daniel Jones', 112.5), pp('Daniel Jones', 48.5), pp('Daniel Jones', 199.5, 'demon')], quotes).filter(p => p.side === 'Over');
  const part = player => picks.filter(p => p.player === player && p.period === 'part').map(p => p.line).sort((a, b) => b - a);
  assert.deepEqual(part('Marcus Mariota'), [98.5, 94.5, 40.5]);
  assert.deepEqual(part('Daniel Jones'), [112.5, 48.5]);
  const at = (player, line) => picks.find(p => p.player === player && p.line === line);
  assert.ok(Math.abs(at('Marcus Mariota', 211.5).probability - 0.5) < 1e-12);
  assert.equal(at('Marcus Mariota', 98.5).probability, null);
  assert.equal(at('Marcus Mariota', 98.5).bookLines, undefined);
});

test('season-long entries without a player name are dropped from the quote feed too', async () => {
  const { normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 86_400_000).toISOString();
  const row = (id, player) => ({ id, sport: 'nba', event: 'NBASZN', market: 'Points Per Game', player, line: 22.5, side: 'over', book: 'PrizePicks', ts, type: 'prop', selection_name: `${player} Over 22.5`, startTime: start });
  const { picks, skipped } = normalizeFeed([row('a', '2026-2027 Season'), row('b', 'Nikola Jokic')], { syncedAt: ts });
  assert.deepEqual(picks.map(p => p.player), ['Nikola Jokic']);
  assert.equal(skipped.invalid, 1);
});

test('books that put the player before the stat keep the player; team props keep the team', async () => {
  const { normalizeFeed } = await import('../lib/odds/normalize.mjs');
  const ts = new Date().toISOString(), start = new Date(Date.now() + 86_400_000).toISOString();
  const prop = (id, player, propMarket, side, line, odds) => ({ id, sport: 'nfl', event: 'Indianapolis Colts @ Washington Commanders', market: 'prop', propMarket, player, line, side, book: 'FanDuel', odds, ts, type: 'prop', selection_name: `${player} ${side === 'over' ? 'Over' : 'Under'} ${line} ${propMarket}`, startTime: start });
  const { quotes } = normalizeFeed([
    prop('a', 'Daniel Jones', 'Daniel Jones - Passing TDs', 'over', 1.5, -102), prop('b', 'Daniel Jones', 'Daniel Jones - Passing TDs', 'under', 1.5, -130),
    prop('c', 'Total Touchdowns', 'Total Touchdowns - IND Colts', 'over', 2.5, 110), prop('d', 'Total Touchdowns', 'Total Touchdowns - IND Colts', 'under', 2.5, -140),
  ], { syncedAt: ts });
  const jones = quotes.filter(q => q.player === 'Daniel Jones');
  assert.deepEqual(jones.map(q => [q.market, q.side, q.line]), [['Passing TDs', 'over', 1.5], ['Passing TDs', 'under', 1.5]]);
  assert.equal(quotes.filter(q => q.player === 'IND Colts' && q.market === 'Total Touchdowns').length, 2);
  assert.equal(new Set(jones.map(q => q.marketId)).size, 1, 'both sides form one market');
});

// One shape for the cross-book tests below: a record as the quote API sends it.
const feedRecord = (id, extra) => ({ id, side: 'over', live: false, ts: new Date().toISOString(), startTime: new Date(Date.now() + 86_400_000).toISOString(), ...extra });
const propRecord = (id, book, event, player, propMarket, side, line, odds, extra = {}) => feedRecord(id, { sport: 'nfl', event, market: 'prop', type: 'prop', propMarket, player, side, line, odds, book, selection_name: `${player} ${side === 'over' ? 'Over' : 'Under'} ${line} ${propMarket}`, ...extra });
const pair = (id, book, event, player, stat, line, over, under, extra) => [propRecord(`${id}o`, book, event, player, stat, 'over', line, over, extra), propRecord(`${id}u`, book, event, player, stat, 'under', line, under, extra)];

test('Pinnacle props ("Davante Adams Total", stat in the player) join every book\'s same line', async () => {
  const { marketIdentity } = await import('../public/market-identity.js');
  const game = 'Los Angeles Rams @ Philadelphia Eagles', short = 'LA Rams @ PHI Eagles';
  const { quotes, dfs } = normalizeFeed([
    ...pair('pin', 'Pinnacle', game, 'Davante Adams Total', 'Receptions', 4.5, -120, -104),
    ...pair('dk', 'DraftKings', short, 'Davante Adams', 'Receptions', 4.5, -123, -104),
    ...pair('fd', 'FanDuel', game, 'Davante Adams', 'Davante Adams - Total Receptions', 4.5, -130, -102),
    // The stat inside the player ("Total Touchdown Passes", sent as both) and split across both ("Total Field" + "Goals").
    ...pair('pin2', 'Pinnacle', game, 'Matthew Stafford Total Touchdown Passes', 'Matthew Stafford Total Touchdown Passes', 1.5, -150, 120),
    ...pair('dk2', 'DraftKings', short, 'Matthew Stafford', 'Passing TDs', 1.5, -155, 125),
    ...pair('pin3', 'Pinnacle', game, 'Jake Elliott Total Field', 'Goals', 1.5, -130, 100),
    feedRecord('pp', { sport: 'nfl', event: 'LA @ PHI', market: 'Receptions', type: 'prop', player: 'Davante Adams', line: 4.5, side: 'over', book: 'PrizePicks', selection_name: 'Davante Adams Over 4.5' }),
  ]);
  const adams = quotes.filter(q => q.player === 'Davante Adams');
  assert.equal(adams.length, 6);
  assert.equal(new Set(adams.map(q => marketIdentity(q))).size, 1, 'one market at three books');
  assert.deepEqual(quotes.filter(q => q.book === 'Pinnacle').map(q => q.player).sort(), ['Davante Adams', 'Davante Adams', 'Jake Elliott', 'Jake Elliott', 'Matthew Stafford', 'Matthew Stafford']);
  assert.equal(new Set(quotes.filter(q => q.player === 'Matthew Stafford').map(q => marketIdentity(q))).size, 1, 'Touchdown Passes = Passing TDs');
  assert.equal(quotes.find(q => q.player === 'Jake Elliott').marketId.split('|').pop(), 'field goals');
  // The pick'em line is priced from all three books, Pinnacle included.
  assert.deepEqual([...dfs.find(p => p.player === 'Davante Adams').probabilityBooks].sort(), ['DraftKings', 'FanDuel', 'Pinnacle']);
});

test('part-game stats compare however a book writes the period', () => {
  const game = 'Tennessee Titans @ Baltimore Ravens';
  const { quotes } = normalizeFeed([
    ...pair('dk', 'DraftKings', 'TEN Titans @ BAL Ravens', 'Zay Flowers', 'Rec Yards 1Q', 14.5, -115, -115),
    propRecord('fan', 'Fanatics', game, 'Zay Flowers', 'Receiving Yards 1st Quarter', 'over', 14.5, -105),
    ...pair('fd', 'FanDuel', game, 'Zay Flowers', 'Zay Flowers - 1st Half Receiving Yds', 30.5, -110, -120),
    ...pair('dk2', 'DraftKings', 'TEN Titans @ BAL Ravens', 'Zay Flowers', 'Rec Yards 1H', 30.5, -112, -118),
  ]);
  const ids = line => [...new Set(quotes.filter(q => q.line === line).map(q => q.marketId))];
  assert.deepEqual(ids(14.5), ['prop|NFL:titans @ ravens|receiving yards 1q']);
  assert.deepEqual(ids(30.5), ['prop|NFL:titans @ ravens|receiving yards 1h']);
});

test('one game named differently by each book is one game; other games stay apart', () => {
  const at = hours => new Date(Date.now() + hours * 3_600_000).toISOString();
  const ml = (id, book, sport, event, side, odds, start, selection) => feedRecord(id, { sport, event, market: 'moneyline', type: 'moneyline', side, odds, book, startTime: start, selection_name: selection });
  const game = (id, book, sport, event, away, home, start) => [ml(`${id}a`, book, sport, event, 'away', 120, start, away), ml(`${id}h`, book, sport, event, 'home', -140, start, home)];
  const code = (id, sport, event, team, start) => feedRecord(id, { sport, event, market: 'prop', type: 'prop', propMarket: 'moneyline', player: team, line: 0, side: 'over', odds: 118, book: 'Novig', selection_name: team, startTime: start });
  const { quotes } = normalizeFeed([
    // MLB: listed pitchers, city codes, a code-only exchange, and FanDuel filing the game as NCAAF.
    ...game('pin', 'Pinnacle', 'mlb', 'San Diego Padres @ Milwaukee Brewers', 'San Diego Padres', 'Milwaukee Brewers', at(5)),
    ...game('fd', 'FanDuel', 'ncaaf', 'San Diego Padres (R Ray) @ Milwaukee Brewers (J Misiorowski)', 'San Diego Padres', 'Milwaukee Brewers', at(5)),
    ...game('br', 'BetRivers', 'mlb', 'SD Padres @ MIL Brewers', 'SD Padres', 'MIL Brewers', at(5)),
    code('nv', 'mlb', 'SD @ MIL', 'SD', at(5)),
    // The same teams the next day are the next game of the series.
    ...game('next', 'theScore Bet', 'mlb', 'Padres @ Brewers', 'Padres', 'Brewers', at(29)),
    // College: school names / with mascots. Georgia State isn't Georgia.
    ...game('c1', 'FanDuel', 'ncaaf', 'Vanderbilt @ Georgia', 'Vanderbilt', 'Georgia', at(3)),
    ...game('c2', 'Fanatics', 'ncaaf', 'Vanderbilt Commodores @ Georgia Bulldogs', 'Vanderbilt Commodores', 'Georgia Bulldogs', at(3)),
    ...game('c3', 'Pinnacle', 'ncaaf', 'Troy @ Georgia State', 'Troy', 'Georgia State', at(3)),
    // NFL by code only.
    ...game('n1', 'DraftKings', 'nfl', 'IND Colts @ WAS Commanders', 'IND Colts', 'WAS Commanders', at(26)),
    code('n2', 'nfl', 'IND @ WAS', 'IND', at(26)),
    // Women's sides only match women's sides.
    ...game('w1', 'BetRivers', 'soccer', 'Barcelona (W) @ Real Madrid (W)', 'Barcelona (W)', 'Real Madrid (W)', at(4)),
    ...game('w2', 'Pinnacle', 'soccer', 'Barcelona @ Real Madrid', 'Barcelona', 'Real Madrid', at(4)),
  ]);
  const games = book => [...new Set(quotes.filter(q => q.book === book).map(q => q.eventId))];
  const today = quotes.find(q => q.book === 'BetRivers' && q.event.startsWith('SD')).eventId;
  for (const book of ['FanDuel', 'Novig']) assert.ok(games(book).includes(today), book);
  assert.ok(games('Pinnacle').includes(today));
  assert.notEqual(games('theScore Bet')[0], today, 'the next game of the series stays apart');
  assert.equal(quotes.find(q => q.book === 'FanDuel' && q.eventId === today).sport, 'MLB', 'the sport most books give');
  assert.equal(new Set(quotes.filter(q => /georgia/i.test(q.event) && !/state/i.test(q.event)).map(q => q.eventId)).size, 1);
  assert.notEqual(quotes.find(q => /georgia state/i.test(q.event)).eventId, quotes.find(q => q.book === 'FanDuel' && /georgia/i.test(q.event)).eventId);
  assert.equal(new Set(quotes.filter(q => /colts|ind @/i.test(q.event)).map(q => q.eventId)).size, 1);
  assert.equal(new Set(quotes.filter(q => /barcelona/i.test(q.event)).map(q => q.eventId)).size, 2);
  // Markets follow the game: every book's moneyline for today's MLB game is one market.
  assert.equal(new Set(quotes.filter(q => q.eventId === today && q.type === 'moneyline').map(q => q.marketId)).size, 1);
});

test('a book\'s props filed under another game than the other books price the player in are dropped, not moved', () => {
  const real = 'Arizona Cardinals @ New York Giants', wrong = 'New York Jets @ Chicago Bears';
  const { quotes, skipped } = normalizeFeed([
    ...pair('fd', 'FanDuel', real, 'Isaiah Likely', 'Isaiah Likely - Receiving Yds', 39.5, -115, -115),
    ...pair('dk', 'DraftKings', 'ARI Cardinals @ NY Giants', 'Isaiah Likely', 'Rec Yards', 39.5, -112, -118),
    // Fanatics' "Isaiah Likely" ladder under Jets @ Bears mixed another player's prices (40+ at +900).
    propRecord('fan', 'Fanatics', wrong, 'Isaiah Likely', 'Receiving Yards', 'over', 39.5, 900),
    // A player only one book prices stays where it is.
    propRecord('fan2', 'Fanatics', wrong, 'Rome Odunze', 'Receiving Yards', 'over', 59.5, 100),
  ]);
  assert.deepEqual([...new Set(quotes.filter(q => q.player === 'Isaiah Likely').map(q => q.book))].sort(), ['DraftKings', 'FanDuel']);
  assert.equal(skipped.mislabeled, 1);
  assert.equal(quotes.find(q => q.player === 'Rome Odunze').eventId, 'NFL:jets @ bears');
});

test('a price far from what the other books agree on is dropped, and so is a book\'s price group that keeps failing', () => {
  const game = 'New England Patriots @ Buffalo Bills', short = 'NE Patriots @ BUF Bills';
  const fanatics = (id, player, stat, line, odds) => propRecord(id, 'Fanatics', game, player, stat, 'over', line, odds);
  const qbs = ['Josh Allen', 'Drake Maye', 'Joe Burrow', 'Jared Goff', 'Bo Nix', 'Brock Purdy', 'Sam Darnold', 'Jalen Hurts'];
  const { quotes, skipped } = normalizeFeed([
    // As on 4 Oct 2026: Fanatics "ALT Passing Touchdowns" 2+ (Over 1.5) for Josh Allen at +114; FanDuel,
    // DraftKings and Pinnacle -152 to -167.
    ...pair('fd', 'FanDuel', game, 'Josh Allen', 'Josh Allen - Passing TDs', 1.5, -164, 125),
    ...pair('dk', 'DraftKings', short, 'Josh Allen', 'Pass TDs', 1.5, -167, 131),
    ...pair('pin', 'Pinnacle', game, 'Josh Allen Total Touchdown Passes', 'Josh Allen Total Touchdown Passes', 1.5, -152, 121),
    fanatics('fa', 'Josh Allen', 'ALT Passing Touchdowns', 2, 114),
  ]);
  const overs = list => list.filter(q => q.player === 'Josh Allen' && q.side === 'over').map(q => [q.book, q.odds]).sort();
  assert.deepEqual(overs(quotes), [['DraftKings', -167], ['FanDuel', -164], ['Pinnacle', -152]]);
  assert.equal(skipped.inconsistent, 1);
  // A price within a few points of the others stays.
  const close = normalizeFeed([
    ...pair('fd1', 'FanDuel', game, 'Josh Allen', 'Josh Allen - Passing TDs', 1.5, -164, 125),
    ...pair('dk1', 'DraftKings', short, 'Josh Allen', 'Pass TDs', 1.5, -167, 131),
    fanatics('fm', 'Josh Allen', 'Passing Touchdowns', 1.5, -160),
  ]);
  assert.deepEqual(overs(close.quotes), [['DraftKings', -167], ['FanDuel', -164], ['Fanatics', -160]]);
  // A group failing on 30%+ of 8+ checks goes whole, its uncheckable prices included: here every
  // checkable Fanatics ALT price is far off, and one ALT price nothing else prices goes with them.
  const records = qbs.flatMap((qb, i) => [
    ...pair(`f${i}`, 'FanDuel', game, qb, `${qb} - Passing TDs`, 1.5, -150, 120),
    ...pair(`d${i}`, 'DraftKings', short, qb, 'Pass TDs', 1.5, -155, 125),
    fanatics(`a${i}`, qb, 'ALT Passing Touchdowns', 2, 300),
  ]);
  const group = normalizeFeed([...records, fanatics('lone', 'Taysom Hill', 'ALT Passing Touchdowns', 2, 400)]);
  assert.equal(group.quotes.filter(q => q.book === 'Fanatics').length, 0);
  // With only one other book: a one-sided rung 15+ points off a two-sided market goes.
  const single = normalizeFeed([...pair('fd2', 'FanDuel', game, 'Isaiah Davis', 'Isaiah Davis - Receiving Yds', 9.5, -113, -113), fanatics('fs', 'Isaiah Davis', 'Receiving Yards', 9.5, -264)]);
  assert.deepEqual(single.quotes.map(q => q.book), ['FanDuel', 'FanDuel']);
});

test('one player spelled two ways in a game is one player; an event named like a selection is skipped', () => {
  const game = 'Arizona Cardinals @ New York Giants';
  const { quotes, skipped } = normalizeFeed([
    ...pair('pin', 'Pinnacle', game, 'Jeremiah Love Total', 'Rushing Yards', 64.5, -115, -115),
    ...pair('dk', 'DraftKings', 'ARI Cardinals @ NY Giants', 'Jeremiyah Love', 'Rush Yards', 64.5, -110, -120),
    ...pair('fd', 'FanDuel', game, 'Jeremiyah Love', 'Jeremiyah Love - Rushing Yds', 64.5, -114, -114),
    feedRecord('junk', { sport: 'mlb', event: 'Over 3.0', market: 'spread', type: 'spread', side: 'home', odds: -220, book: 'Fanatics', selection_name: 'San Diego Padres +2.5' }),
  ]);
  const love = quotes.filter(q => /love/i.test(q.player));
  assert.deepEqual([...new Set(love.map(q => q.player))], ['Jeremiyah Love']);
  assert.equal(new Set(love.map(q => q.marketId + q.playerId)).size, 1);
  assert.equal(skipped.mislabeled, 1);
});

test('Onyx team spreads sent as props become spreads; its game totals, which don\'t say which side is the Over, are skipped', () => {
  const game = 'Alabama @ Mississippi State';
  const onyx = (id, player, propMarket, line, odds) => feedRecord(id, { sport: 'ncaaf', event: game, market: 'prop', type: 'prop', propMarket, player, line, side: 'over', odds, book: 'Onyx', selection_name: `${player} Over ${line} ${propMarket}` });
  const { quotes, skipped } = normalizeFeed([
    onyx('a', 'Alabama', 'spread', -5.5, -110), onyx('b', 'Mississippi State', 'spread', 5.5, -110),
    onyx('c', 'Alabama', 'total', 60.5, -115), onyx('d', 'Mississippi State', 'total', 60.5, -105),
    feedRecord('fa', { sport: 'ncaaf', event: game, market: 'spread', type: 'spread', side: 'away', line: -5.5, odds: -112, book: 'FanDuel', selection_name: 'Alabama -5.5' }),
    feedRecord('fh', { sport: 'ncaaf', event: game, market: 'spread', type: 'spread', side: 'home', line: 5.5, odds: -108, book: 'FanDuel', selection_name: 'Mississippi State +5.5' }),
  ]);
  const spreads = quotes.filter(q => q.book === 'Onyx');
  assert.deepEqual(spreads.map(q => [q.type, q.side, q.line]).sort(), [['spread', 'away', -5.5], ['spread', 'home', 5.5]]);
  assert.equal(new Set(quotes.map(q => q.marketId)).size, 1, 'one spread market with FanDuel');
  assert.equal(skipped.mislabeled, 2);
});

test('API v2 records: epoch start times, pick\'em game lines, place names as sports; the fresh flag is not a cutoff', () => {
  const at = new Date(Math.floor(Date.now() / 1000) * 1000 + 3 * 3_600_000), ms = String(at.getTime()), seconds = String(at.getTime() / 1000);
  const ml = (id, book, side, odds, extra = {}) => feedRecord(id, { sport: 'nhl', event: 'St. Louis Blues @ Colorado Avalanche', market: 'moneyline', type: 'moneyline', side, odds, book, selection_name: side === 'away' ? 'St. Louis Blues' : 'Colorado Avalanche', ...extra });
  const { quotes, skipped } = normalizeFeed([
    ml('a', 'DraftKings', 'away', 150, { startTime: ms }), ml('b', 'DraftKings', 'home', -170, { startTime: ms }),
    ml('c', 'FanDuel', 'away', 145, { startTime: seconds }), ml('d', 'FanDuel', 'home', -165, { startTime: seconds }),
    // Betr Picks is a pick'em app: its team "moneylines" aren't sportsbook prices.
    ml('e', 'Betr', 'away', 1892, { startTime: ms }),
    // The API flags prices fresh: false a minute after a scrape; a minute-old price is still current.
    ml('f', 'BetMGM', 'away', 155, { startTime: ms, fresh: false, age_seconds: 62 }),
    feedRecord('g', { sport: 'tokyo,-japan', event: 'Arthur Fils @ Valentin Vacherot', market: 'moneyline', type: 'moneyline', side: 'away', odds: 120, book: 'Pinnacle', selection_name: 'Arthur Fils' }),
  ]);
  const start = at.getTime();
  assert.deepEqual([...new Set(quotes.filter(q => q.sport === 'NHL').map(q => Date.parse(q.startTime)))], [start], 'epoch milliseconds and seconds read as one kickoff');
  assert.deepEqual([...new Set(quotes.map(q => q.book))].sort(), ['BetMGM', 'DraftKings', 'FanDuel', 'Pinnacle']);
  assert.equal(skipped.mislabeled, 1, 'the Betr Picks game line');
  assert.equal(skipped.stale, 0, 'fresh: false alone drops nothing');
  assert.equal(quotes.find(q => q.book === 'Pinnacle').sport, 'Other');
});

test('a pick sent without its game, start or sport takes them from the sportsbook game it is priced from', async () => {
  const game = 'Indianapolis Colts @ Washington Commanders', start = new Date(Date.now() + 86_400_000).toISOString();
  const { normalizeDfsRecords } = await import('../lib/odds/normalize.mjs');
  const pricer = (await import('../lib/odds/normalize.mjs')).createDfsPricer();
  const feed = normalizeFeed([...pair('fd', 'FanDuel', game, 'Jonathan Taylor', 'Jonathan Taylor - Rushing Yds', 89.5, -114, -114, { startTime: start })], { price: false });
  pricer.setQuotes(feed);
  // As Underdog sends them on 4 Oct 2026: sport "other", no event, no start time.
  const { picks } = normalizeDfsRecords([{ id: 'u1', app: 'Underdog', sport: 'other', event: '', startTime: '', player: 'Jonathan Taylor', market: 'Rushing Yards', line: 89.5, side: 'higher', odds_type: 'standard', payout_multiplier: 1, ts: new Date().toISOString() }]);
  pricer.setProps(picks);
  const [over] = pricer.price('multiplicative', { now: Date.now() }).filter(p => p.side === 'Over');
  assert.ok(Math.abs(over.probability - 0.5) < 1e-9);
  assert.deepEqual([over.sport, over.event, over.startTime], ['NFL', 'Indianapolis Colts @ Washington Commanders', start]);
});

test('repeated text fields point at one shared copy; other fields and values are left as they are', () => {
  const name = n => ['Seattle', 'Kraken'].slice(0, n).join(' ');
  const items = [{ event: name(2), odds: -110, id: 'a' }, { event: name(2), odds: 120, id: 'b' }, { event: '', id: 'c' }];
  assert.equal(shareStrings(items, ['event']), items);
  assert.deepEqual(items.map(item => item.event), ['Seattle Kraken', 'Seattle Kraken', '']);
  assert.deepEqual(items.map(item => [item.id, item.odds]), [['a', -110], ['b', 120], ['c', undefined]]);
  assert.ok(!('event' in shareStrings([{ id: 'd' }], ['event'])[0]), 'a missing field stays missing');
});
