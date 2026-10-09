import test from 'node:test';
import assert from 'node:assert/strict';
import { sportWizzardConfig, toFeedRecords, sportWizzardSnapshot, mergeSnapshots } from '../lib/odds/sportwizzard.mjs';
import { normalizeFeed, dfsPicks } from '../lib/odds/normalize.mjs';
import { withKalshiDepth } from '../lib/odds/kalshi.mjs';

// Two days out, so the fixture game never counts as started.
const event = { id: 'e1', homeTeamName: 'Detroit Red Wings', awayTeamName: 'Seattle Kraken', startTime: new Date(Date.now() + 2 * 86_400_000).toISOString().replace(/:\d{2}\.\d+Z$/, 'Z'), league: 'nhl', status: 'scheduled' };
const updated = new Date(Date.now() - 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const row = extra => ({ id: `e1:draftkings:${extra.market}:${extra.side}:${extra.line ?? ''}:${extra.playerName ?? ''}`, sportsbook: 'draftkings', league: 'nhl', eventId: 'e1', period: 'FULL', priceAmerican: -110, suspended: false, updated, ...extra });

test('the source is off unless a key or SPORTWIZZARD_ENABLED=1 turns it on, and only over https', () => {
  assert.equal(sportWizzardConfig({}).base.href, 'https://api.sportwizzard.com/', 'on by default: the API needs no key');
  assert.equal(sportWizzardConfig({ SPORTWIZZARD_ENABLED: '0' }), null);
  assert.equal(sportWizzardConfig({ SPORTWIZZARD_API_KEY: 'sw_live_x' }).apiKey, 'sw_live_x');
  assert.equal(sportWizzardConfig({ SPORTWIZZARD_ENABLED: '1' }).base.href, 'https://api.sportwizzard.com/');
  assert.equal(sportWizzardConfig({ SPORTWIZZARD_API_KEY: 'k', SPORTWIZZARD_ENABLED: '0' }), null);
  assert.equal(sportWizzardConfig({ SPORTWIZZARD_ENABLED: '1', SPORTWIZZARD_API_URL: 'http://api.sportwizzard.com' }), null);
});

test('game lines and Over/Under props become feed records with full team names', () => {
  const rows = [
    row({ market: 'MONEYLINE', marketSubtype: 'MONEYLINE', side: 'AWAY', selection: 'SEA Kraken', priceAmerican: 109 }),
    row({ market: 'MONEYLINE', marketSubtype: 'MONEYLINE', side: 'HOME', selection: 'DET Red Wings', priceAmerican: -125 }),
    row({ market: 'SPREAD', marketSubtype: 'SPREAD', side: 'AWAY', selection: 'SEA Kraken +1.5', line: 1.5, priceAmerican: -200 }),
    row({ market: 'SPREAD', marketSubtype: 'SPREAD', side: 'HOME', selection: 'DET Red Wings -1.5', line: -1.5, priceAmerican: 170 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', selection: 'Over', line: 6 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', selection: 'Under', line: 6 }),
    row({ market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', selection: 'Over', line: 3.5, playerName: 'Alex DeBrincat' }),
    row({ market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'UNDER', selection: 'Under', line: 3.5, playerName: 'Alex DeBrincat' }),
  ];
  const { records, skipped } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.equal(skipped, 0);
  assert.deepEqual(records.map(r => [r.type, r.side, r.selection_name]), [
    ['moneyline', 'away', 'Seattle Kraken'], ['moneyline', 'home', 'Detroit Red Wings'], ['spread', 'away', 'Seattle Kraken +1.5'], ['spread', 'home', 'Detroit Red Wings -1.5'],
    ['total', 'over', 'Over 6'], ['total', 'under', 'Under 6'], ['prop', 'over', 'Over 3.5'], ['prop', 'under', 'Under 3.5'],
  ]);
  assert.equal(records[0].event, 'Seattle Kraken @ Detroit Red Wings');
  assert.equal(records[6].market, 'Shots'); assert.equal(records[6].player, 'Alex DeBrincat');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.length, 8, JSON.stringify(feed.skipped));
  assert.ok(feed.quotes.every(q => q.book === 'DraftKings' && q.sport === 'NHL'));
});

test('a book’s ladder keeps only its main line, the one priced closest to even', () => {
  const rung = (side, line, price) => row({ market: 'SPREAD', marketSubtype: 'SPREAD', side, line, priceAmerican: price });
  const { records } = toFeedRecords([
    rung('HOME', -1.5, 170), rung('AWAY', 1.5, -200),
    rung('HOME', -0.5, -110), rung('AWAY', 0.5, -110),
    rung('HOME', -2.5, 320), rung('AWAY', 2.5, -450),
    rung('HOME', -3.5, 600),
  ], new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.side, r.line]), [['home', -0.5], ['away', 0.5]]);
});

test('other stats filed under the game markets are left out', () => {
  const rows = [
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_FIELD_GOAL_YARDS', side: 'OVER', line: 131.5 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_FIELD_GOAL_YARDS', side: 'UNDER', line: 131.5 }),
    row({ market: 'MONEYLINE', marketSubtype: 'DRAW_NO_BET', side: 'HOME' }),
    row({ market: 'MONEYLINE_3_WAY', marketSubtype: 'THREE_WAY_CARDS', side: 'DRAW' }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 }),
  ];
  assert.deepEqual(toFeedRecords(rows, new Map([['e1', event]])).records.map(r => [r.market, r.line]), [['total', 6], ['total', 6]]);
});

test('a book’s main total far from the other books’ (a quarter total tagged full game) is dropped', () => {
  const total = (book, line) => ['OVER', 'UNDER'].map(side => row({ id: `${book}:${side}:${line}`, sportsbook: book, market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side, line }));
  const { records } = toFeedRecords([...total('draftkings', 6), ...total('fanduel', 6.5), ...total('betmgm', 6), ...total('caesars', 1.5), ...total('caesars', 6)], new Map([['e1', event]]));
  assert.deepEqual(records.filter(r => r.book === 'caesars').map(r => r.line), [6, 6]);
  assert.equal(records.length, 8);
});

test('pick’em lines become DFS picks: standard lines, Dabble’s adjusted lines, and per-pick apps’ lines with their payout', () => {
  const pick = (book, side, multiplier, line = 3.5) => row({ id: `${book}:${side}:${line}:${multiplier}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS',
    side, line, playerName: 'Alex DeBrincat', priceAmerican: undefined, dfsMultiplier: multiplier });
  const rows = [
    pick('prizepicks', 'OVER', 1), pick('prizepicks', 'UNDER', 1), pick('dabble', 'OVER', 1), pick('sleeper', 'OVER', 1.78), pick('chalkboard', 'UNDER', 1.76),
    pick('dabble', 'OVER', 2.5, 4.5), pick('dabble', 'UNDER', 0.6, 2.5), pick('sleeper', 'OVER', 3.5, 5.5), pick('chalkboard', 'UNDER', 0.99, 2.5), pick('hotstreak', 'OVER', 1),
    row({ market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', line: 3.5, playerName: 'Alex DeBrincat', priceAmerican: -120 }),
    row({ market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'UNDER', line: 3.5, playerName: 'Alex DeBrincat', priceAmerican: -110 }),
  ];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  const picks = records.filter(r => r.odds == null);
  assert.deepEqual(picks.map(r => [r.book, r.side, r.line, r.payoutMultiplier, r.oddsType]), [['PrizePicks', 'over', 3.5, undefined, undefined], ['PrizePicks', 'under', 3.5, undefined, undefined], ['Dabble', 'over', 3.5, undefined, undefined],
    ['Sleeper Picks', 'over', 3.5, 1.78, undefined], ['Chalkboard', 'under', 3.5, 1.76, undefined],
    ['Dabble', 'over', 4.5, 2.5, 'adjusted'], ['Dabble', 'under', 2.5, 0.6, 'adjusted'], ['Sleeper Picks', 'over', 5.5, 3.5, undefined]],
    'per-pick apps keep every line with its own payout; Dabble’s adjustments scale its table');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.picks.length, 8);
  assert.deepEqual(feed.picks.filter(pick => pick.oddsType === 'adjusted').map(pick => pick.payoutMultiplier), [2.5, 0.6]);
  assert.equal(feed.picks.find(pick => pick.line === 5.5).payoutMultiplier, 3.5);
  assert.equal(feed.quotes.length, 2, 'the sportsbook prop stays a quote');
});

test('a Kalshi moneyline takes the live ask and the dollars resting there from the one Kalshi market that matches', () => {
  const kalshi = (selection, priceAmerican, extra = {}) => ({ id: `k:${selection}`, sportsbook: 'kalshi', market: 'MONEYLINE', period: 'FULL', selection, priceAmerican, eventStartTime: '2026-10-12T03:20', updated, ...extra });
  const markets = [
    { label: 'atlanta', day: Date.UTC(2026, 9, 11), ask: 0.63, size: 1000 },
    { label: 'baltimore', day: Date.UTC(2026, 9, 11), ask: 0.39, size: 250 },
    { label: 'chicago', day: Date.UTC(2026, 9, 11), ask: 0.5, size: 10 },
    { label: 'chicago', day: Date.UTC(2026, 9, 12), ask: 0.52, size: 10 },
  ];
  const [atl, bal, chi, far, other] = withKalshiDepth([kalshi('Atlanta', -163), kalshi('Baltimore', 156), kalshi('Chicago', -105), kalshi('Atlanta', 300), row({ market: 'MONEYLINE', side: 'HOME' })], markets, new Date('2026-10-09T08:00:00Z'));
  assert.deepEqual([atl.priceAmerican, atl.liquidity, atl.updated], [-170, 630, '2026-10-09T08:00:00Z']);
  assert.deepEqual([bal.priceAmerican, bal.liquidity], [156, 97.5]);
  assert.equal(chi.liquidity, undefined, 'two Kalshi markets fit: neither is taken');
  assert.equal(far.liquidity, undefined, 'a price far from Kalshi’s isn’t the same market');
  assert.equal(other.liquidity, undefined);
});

test('every book posting a pick’s exact line is listed, alternates and one-sided lines as comparison-only prices', () => {
  const prop = (book, side, line, price) => row({ id: `${book}:${side}:${line}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side, line, playerName: 'Alex DeBrincat', priceAmerican: price });
  const rows = [
    prop('draftkings', 'OVER', 3.5, -120), prop('draftkings', 'UNDER', 3.5, -110),
    prop('fanduel', 'OVER', 2.5, -110), prop('fanduel', 'UNDER', 2.5, -110), prop('fanduel', 'OVER', 3.5, -125), prop('fanduel', 'UNDER', 3.5, 105),
    prop('fliff', 'OVER', 3.5, -125),
    row({ id: 'pp', sportsbook: 'prizepicks', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', line: 3.5, playerName: 'Alex DeBrincat', priceAmerican: undefined, dfsMultiplier: 1 }),
  ];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.deepEqual(records.filter(r => r.depthOnly).map(r => [r.book, r.side, r.line]).sort(), [['fanduel', 'over', 3.5], ['fanduel', 'under', 3.5], ['fliff', 'over', 3.5]]);
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.filter(q => q.depthOnly).length, 3);
  const [pick] = dfsPicks(feed.picks, feed.quotes);
  assert.deepEqual(pick.bookLines.map(line => line.book).sort(), ['DraftKings', 'FanDuel', 'Fliff']);
});

test('a milestone that names its threshold is an Over line; one the book also posts as a prop gives way to it', () => {
  const milestone = (book, selection, price) => row({ id: `${book}:${selection}`, sportsbook: book, market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_SHOTS', side: 'YES', selection, playerName: 'Alex DeBrincat', priceAmerican: price });
  const { records } = toFeedRecords([
    milestone('draftkings', 'Alex DeBrincat 4+', 150), milestone('fanduel', 'Alex DeBrincat 3+', 120),
    row({ id: 'fd-o', sportsbook: 'fanduel', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', line: 2.5, playerName: 'Alex DeBrincat', priceAmerican: 115 }),
    row({ id: 'fd-u', sportsbook: 'fanduel', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'UNDER', line: 2.5, playerName: 'Alex DeBrincat', priceAmerican: -145 }),
  ], new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.book, r.market, r.side, r.line, r.odds, Boolean(r.depthOnly)]).sort(), [
    ['draftkings', 'Shots', 'over', 3.5, 150, true], ['fanduel', 'Shots', 'over', 2.5, 115, false], ['fanduel', 'Shots', 'under', 2.5, -145, false]]);
  // A half threshold is already the line; a stat spelled two ways is still one bet.
  const yards = (id, market, marketSubtype, extra) => row({ id, sportsbook: 'draftkings', market, marketSubtype, playerName: 'Alex DeBrincat', ...extra });
  const second = toFeedRecords([
    yards('half', 'PLAYER_MILESTONE', 'PLAYER_PASS_YARDS', { side: 'YES', selection: 'Alex DeBrincat 62.5+', priceAmerican: -120 }),
    yards('m', 'PLAYER_MILESTONE', 'PLAYER_RUSH_REC_YARDS', { side: 'YES', selection: 'Alex DeBrincat 90+', priceAmerican: 105 }),
    yards('p', 'PLAYER_TOTAL', 'PLAYER_TOTAL_RUSH_+_REC_YARDS', { side: 'OVER', line: 89.5, priceAmerican: 100 }),
  ], new Map([['e1', event]])).records;
  assert.deepEqual(second.map(r => [r.id, r.line]).sort(), [['sw:half', 62.5], ['sw:p', 89.5]]);
});

test('futures, partial periods, unreadable milestones, pick’em rows, suspended and finished games are left out', () => {
  const rows = [
    row({ market: 'CATEGORICAL', marketSubtype: 'CHAMPIONSHIP_WINNER', side: 'YES', marketScope: 'SEASON' }),
    row({ market: 'SPREAD', marketSubtype: 'SPREAD', side: 'AWAY', line: 0.5, period: '1P' }),
    row({ market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_GOALS', side: 'YES', selection: 'Yes', playerName: 'Andrew Copp' }),
    row({ market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', line: 2.5, playerName: 'A', priceAmerican: undefined, dfsMultiplier: 1.8 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6, suspended: true }),
  ];
  assert.equal(toFeedRecords(rows, new Map([['e1', event]])).records.length, 0);
  const done = toFeedRecords([row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 })], new Map([['e1', { ...event, status: 'final' }]]));
  assert.equal(done.records.length, 0);
});

test('the board pages through every active league, sends the key, and is shared until it ages', async () => {
  const seen = [];
  const fetcher = async url => {
    seen.push({ path: url.pathname, cursor: url.searchParams.get('cursor'), league: url.searchParams.get('league') });
    const body = url.pathname.endsWith('/leagues') ? { success: true, data: ['nhl', 'dota2'] }
      : url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : !url.searchParams.get('cursor') ? { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 })], nextCursor: 'p2' }
      : { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null };
    return { ok: true, status: 200, json: async () => body };
  };
  const config = { base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' };
  const snapshot = await sportWizzardSnapshot(config, fetcher);
  assert.equal(snapshot.quotes.length, 2);
  assert.ok(seen.every(call => call.league !== 'dota2'), 'unsupported leagues are not fetched');
  assert.equal(seen.filter(call => call.path.endsWith('/odds')).length, 6, 'game lines, props and milestones are each paged with their cursor');
  const again = await sportWizzardSnapshot(config, fetcher);
  assert.equal(again, snapshot, 'a second request within the TTL reuses the board');
});

test('merging keeps the main feed primary and adds only books it lacks', () => {
  const primary = { quotes: [{ id: 'a', book: 'DraftKings' }], stale: false };
  const extra = { quotes: [{ id: 'sw:1', book: 'draftkings' }, { id: 'sw:2', book: 'betparx' }], stale: false };
  const merged = mergeSnapshots(primary, extra);
  assert.deepEqual(merged.quotes.map(q => q.id), ['a', 'sw:2']);
  assert.equal(mergeSnapshots(primary, extra), merged, 'the same object while inputs are unchanged');
  assert.equal(mergeSnapshots(null, extra), extra);
  assert.equal(mergeSnapshots(primary, null), primary);
});

test('one result market per book: a copy nearest the other books stands, and NHL moneylines beside three-ways survive', () => {
  const result = (book, market, side, price, n = 0) => row({ id: `e1:${book}:${market}:${side}:${n}`, sportsbook: book, market, marketSubtype: market === 'MONEYLINE' ? 'MONEYLINE' : 'MONEYLINE_3WAY', side, priceAmerican: price });
  const books = ['draftkings', 'fanduel', 'betrivers-kambi'];
  const rows = [
    ...books.flatMap(book => [result(book, 'MONEYLINE', 'HOME', -145), result(book, 'MONEYLINE', 'AWAY', 120), result(book, 'MONEYLINE_3_WAY', 'HOME', 130), result(book, 'MONEYLINE_3_WAY', 'DRAW', 330), result(book, 'MONEYLINE_3_WAY', 'AWAY', 150)]),
    // BetMGM files a handicap three-way under the same market: the copy at the others' price stands.
    result('betmgm', 'MONEYLINE_3_WAY', 'HOME', 135, 1), result('betmgm', 'MONEYLINE_3_WAY', 'HOME', -400, 2),
    result('betmgm', 'MONEYLINE_3_WAY', 'DRAW', 320), result('betmgm', 'MONEYLINE_3_WAY', 'AWAY', 155),
  ];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.deepEqual(records.filter(r => r.book === 'betmgm' && r.side === 'home').map(r => r.odds), [135]);
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.filter(q => q.type === 'moneyline').length, 6, 'an NHL moneyline is its own market beside a regulation three-way');
  assert.equal(feed.quotes.filter(q => q.type === 'three-way').length, 12);
  assert.equal(feed.skipped.inconsistent, 0);
});

test('a soccer two-way moneyline (an unlabelled draw-no-bet) is left out', () => {
  const soccer = { ...event, homeTeamName: 'Puebla', awayTeamName: 'Leon' };
  const rows = ['HOME', 'AWAY'].map(side => row({ id: `e1:fliff:${side}`, sportsbook: 'fliff', league: 'liga-mx', market: 'MONEYLINE', marketSubtype: 'MONEYLINE', side, priceAmerican: 105 }));
  assert.equal(toFeedRecords(rows, new Map([['e1', soccer]])).records.length, 0);
});

test('a book SportWizzard rescrapes slowly keeps its latest pass; a price that pass missed is stale', () => {
  const at = minutes => new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const prop = (book, player, minutes) => ['OVER', 'UNDER'].map(side => row({ id: `e1:${book}:${player}:${side}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side, line: 2.5, playerName: player, updated: at(minutes) }));
  const rows = [...prop('caesars', 'Alex DeBrincat', 18), ...prop('caesars', 'Dylan Larkin', 20), ...prop('fanduel', 'Alex DeBrincat', 1), ...prop('fanduel', 'Dylan Larkin', 25), ...prop('prophetx', 'Alex DeBrincat', 90)];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.ok(records.filter(r => r.book === 'caesars').every(r => r.feedLagSeconds >= 17 * 60 && r.feedLagSeconds <= 19 * 60), 'Caesars trails by its newest price’s age');
  assert.ok(records.filter(r => r.book !== 'caesars').every(r => r.feedLagSeconds === undefined), 'a current book, and one hours behind, get no allowance');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.deepEqual(feed.quotes.map(q => `${q.book} ${q.player}`).sort(), ['Caesars Alex DeBrincat', 'Caesars Alex DeBrincat', 'Caesars Dylan Larkin', 'Caesars Dylan Larkin', 'FanDuel Alex DeBrincat', 'FanDuel Alex DeBrincat'].sort(),
    'FanDuel’s 25-minute-old line missed its last passes; ProphetX is 90 minutes behind');
});

test('the engine counts a slow-cycle book’s price age from its latest pass too', async () => {
  const { quoteAvailable } = await import('../lib/odds/engine.mjs');
  const quote = { id: 'q', sport: 'NHL', eventId: 'e1', event: 'Seattle Kraken @ Detroit Red Wings', marketId: 'm', market: 'Shots', type: 'prop', player: 'Alex DeBrincat', side: 'over', line: 2.5,
    book: 'Caesars', odds: -110, live: false, startTime: event.startTime, ts: new Date(Date.now() - 20 * 60_000).toISOString() };
  assert.equal(quoteAvailable(quote, {}), false, '20 minutes old is past the 15-minute default');
  assert.equal(quoteAvailable({ ...quote, feedLagSeconds: 18 * 60 }, {}), true, 'but only 2 minutes behind its book’s latest pass');
  assert.equal(quoteAvailable({ ...quote, feedLagSeconds: 18 * 60 }, { pregameMaxAgeSeconds: 60 }), false, 'a stricter setting still applies on top of the lag');
});

test('every pick’em app SportWizzard carries comes through: per-pick WannaParlay, HotStreak and Boom, Underdog’s adjustments, Betr’s standard lines', () => {
  const pick = (book, side, multiplier, line = 1.5) => row({ id: `${book}:${side}:${line}:${multiplier}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS',
    side, line, playerName: 'Alex DeBrincat', priceAmerican: undefined, dfsMultiplier: multiplier });
  const rows = [pick('wannaparlay', 'OVER', 1.33), pick('wannaparlay', 'OVER', 1, 0.5), pick('hotstreak', 'OVER', 1.9), pick('hotstreak', 'UNDER', 0.92), pick('boom', 'OVER', 1.7),
    pick('underdog', 'OVER', 1), pick('underdog', 'UNDER', 0.85), pick('betr', 'OVER', 1),
    // Season-long lines name no game: skipped with the other season markets.
    { ...pick('underdog', 'OVER', 1, 86.5), id: 'season', period: 'REG_SEASON', marketScope: 'SEASON' }];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.book, r.side, r.payoutMultiplier, r.oddsType]), [['WannaParlay', 'over', 1.33, undefined], ['HotStreak', 'over', 1.9, undefined], ['Boom Fantasy', 'over', 1.7, undefined],
    ['Underdog Fantasy', 'over', undefined, undefined], ['Underdog Fantasy', 'under', 0.85, 'adjusted'], ['Betr Picks', 'over', undefined, undefined]],
    'a per-pick line paying 1× or less can’t beat its own line');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.picks.length, 6, 'every app is a DFS app, so its lines are picks, not sportsbook quotes');
});
