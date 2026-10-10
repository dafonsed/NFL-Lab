import test from 'node:test';
import assert from 'node:assert/strict';
import { sportWizzardConfig, toFeedRecords, sportWizzardSnapshot, mergeSnapshots } from '../lib/odds/sportwizzard.mjs';
import { normalizeFeed, dfsPicks } from '../lib/odds/normalize.mjs';
import { marketIdentity, sideNames, stableHash } from '../public/market-identity.js';
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

test('other stats filed under the game markets are game props, not the game’s lines', () => {
  const rows = [
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_FIELD_GOAL_YARDS', side: 'OVER', line: 131.5 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_FIELD_GOAL_YARDS', side: 'UNDER', line: 131.5 }),
    row({ market: 'MONEYLINE', marketSubtype: 'DRAW_NO_BET', side: 'HOME' }),
    row({ market: 'MONEYLINE_3_WAY', marketSubtype: 'THREE_WAY_CARDS', side: 'DRAW' }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 }),
  ];
  assert.deepEqual(toFeedRecords(rows, new Map([['e1', event]])).records.map(r => [r.type, r.market, r.line]), [
    ['game-prop', 'Total Field Goal Yards', 131.5], ['game-prop', 'Total Field Goal Yards', 131.5], ['game-prop', 'Draw No Bet', ''], ['total', 'total', 6], ['total', 'total', 6]]);
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

test('DraftKings Pick6 lines with their own multiplier and WannaParlay yes/no picks come through', () => {
  const pick = (book, extra) => row({ id: `${book}:${JSON.stringify(extra)}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side: 'OVER', line: 2.5, playerName: 'Alex DeBrincat', priceAmerican: undefined, ...extra });
  const { records } = toFeedRecords([
    pick('dkpick6', { dfsMultiplier: 3.5 }), pick('dkpick6', { dfsMultiplier: 0.7, line: 0.5 }), pick('dkpick6', { dfsMultiplier: 1, line: 1.5 }),
    pick('wannaparlay', { market: 'PLAYER_YES_NO', marketSubtype: 'PLAYER_TO_SCORE_GOAL', side: 'YES', line: undefined, dfsMultiplier: 7.94 }),
    pick('hotstreak', { market: 'PLAYER_FIRST_TO', marketSubtype: 'PLAYER_FIRST_GOAL', side: 'YES', line: undefined, dfsMultiplier: 9 }),
  ], new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.book, r.market, r.side, r.line, r.oddsType, r.payoutMultiplier]).sort(), [
    ['DraftKings Pick6', 'Shots', 'over', 0.5, 'adjusted', 0.7], ['DraftKings Pick6', 'Shots', 'over', 1.5, undefined, undefined], ['DraftKings Pick6', 'Shots', 'over', 2.5, 'adjusted', 3.5],
    ['WannaParlay', 'Goals', 'over', 0.5, undefined, 7.94],
  ].sort(), 'a first-to pick has no line to compare and stays out');
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
  assert.deepEqual(second.map(r => [r.id, r.line]).sort(), [[`sw:${stableHash('half')}`, 62.5], [`sw:${stableHash('p')}`, 89.5]].sort());
  // Hard Rock writes the line ("Over 1.5"); a row naming only the player can't say which rung it is.
  const third = toFeedRecords([
    row({ id: 'hr', sportsbook: 'hardrock', market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_TDS', side: 'YES', selection: 'Over 1.5', playerName: 'Alex DeBrincat', priceAmerican: 225 }),
    row({ id: 'mgm', sportsbook: 'betmgm', market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_TDS', side: 'YES', selection: 'Alex DeBrincat', playerName: 'Alex DeBrincat', priceAmerican: 200 }),
  ], new Map([['e1', event]])).records;
  assert.deepEqual(third.map(r => [r.id, r.market, r.side, r.line]), [[`sw:${stableHash('hr')}`, 'Anytime TDs', 'over', 1.5]]);
});

test('futures, unnamed periods, unreadable milestones, pick’em rows, suspended, finished and hours-old prices are left out', () => {
  const rows = [
    row({ market: 'CATEGORICAL', marketSubtype: 'CHAMPIONSHIP_WINNER', side: 'YES', marketScope: 'SEASON' }),
    row({ market: 'SPREAD', marketSubtype: 'SPREAD', side: 'AWAY', line: 0.5, period: 'PERIOD' }),
    row({ market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_GOALS', side: 'YES', selection: 'Yes', playerName: 'Andrew Copp' }),
    row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6, updated: new Date(Date.now() - 3 * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z') }),
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
  assert.equal(seen.filter(call => call.path.endsWith('/odds')).length, 8, 'game lines, props, milestones and the other markets are each paged with their cursor');
  const again = await sportWizzardSnapshot(config, fetcher);
  assert.equal(again, snapshot, 'a second request within the TTL reuses the board');
});

test('a failed game-props request leaves the league its main lines; a failed main request still fails the league', async () => {
  const board = failing => async url => {
    const body = url.pathname.endsWith('/leagues') ? { success: true, data: ['nhl'] }
      : url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : url.searchParams.get('market')?.includes(failing) ? null
      : url.searchParams.get('market')?.startsWith('MONEYLINE') ? { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }), row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null }
      : { success: true, data: [], nextCursor: null };
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 504, headers: new Map(), body: null };
  };
  const config = { base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' };
  const errors = console.error;
  console.error = () => {};
  try {
    assert.equal((await sportWizzardSnapshot(config, board('TEAM_TOTAL'))).quotes.length, 2);
    await assert.rejects(sportWizzardSnapshot(config, board('MONEYLINE')), /Every SportWizzard league request failed/);
  } finally { console.error = errors; }
});

test('a league whose request fails keeps its lines from the previous board for ten minutes, so they don’t drop out between boards', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
  let failing = false;
  const fetcher = async url => {
    const body = url.pathname.endsWith('/leagues') ? { success: true, data: ['nhl'] }
      : url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : url.searchParams.get('market')?.startsWith('MONEYLINE') ? (failing ? null : { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }), row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null })
      : { success: true, data: [], nextCursor: null };
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 504, headers: new Map(), body: null };
  };
  const config = { base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' };
  const first = await sportWizzardSnapshot(config, fetcher);
  assert.equal(first.quotes.length, 2);
  failing = true;
  t.mock.timers.tick(31_000);
  assert.equal(await sportWizzardSnapshot(config, fetcher), first, 'the last board answers while the next is fetched');
  await new Promise(resolve => setTimeout(resolve, 1_300));
  const carried = await sportWizzardSnapshot(config, fetcher);
  assert.notEqual(carried, first, 'the refresh succeeded');
  assert.equal(carried.quotes.length, 2, 'the failed request’s lines are still on the board');
  assert.ok(logged.some(line => /nhl: request failed; keeping its lines from 31 s ago/.test(line)));
  assert.equal(carried.leagues.get('nhl'), first.leagues.get('nhl'), 'the previous board’s lines, not a copy');
  t.mock.timers.tick(11 * 60_000);
  await assert.rejects(sportWizzardSnapshot(config, fetcher), /Every SportWizzard league request failed/, 'lines past ten minutes old are not kept');
});

test('a league whose game props didn’t come keeps its last full set instead of losing its team totals for a board', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.method(console, 'error', () => {});
  let failing = false;
  const teamTotal = side => row({ id: `tt:${side}`, market: 'TEAM_TOTAL', marketSubtype: 'TEAM_TOTAL_GOALS', side, line: 3.5, teamSide: 'HOME', teamName: 'DET Red Wings - Inc. OT' });
  const fetcher = async url => {
    const market = url.searchParams.get('market') || '';
    const body = url.pathname.endsWith('/leagues') ? { success: true, data: ['nhl'] }
      : url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : market.startsWith('MONEYLINE') ? { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }), row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null }
      : market.startsWith('TEAM_TOTAL') ? (failing ? null : { success: true, data: [teamTotal('OVER'), teamTotal('UNDER')], nextCursor: null })
      : { success: true, data: [], nextCursor: null };
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 504, headers: new Map(), body: null };
  };
  const config = { base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' };
  const first = await sportWizzardSnapshot(config, fetcher);
  assert.ok(first.quotes.length > 2, 'the team total is on the first board');
  failing = true;
  t.mock.timers.tick(31_000);
  await sportWizzardSnapshot(config, fetcher);
  await new Promise(resolve => setTimeout(resolve, 1_300));
  const next = await sportWizzardSnapshot(config, fetcher);
  assert.notEqual(next, first);
  assert.deepEqual(next.quotes.map(quote => quote.id), first.quotes.map(quote => quote.id));
});

test('a board past three minutes is marked stale with one copy, so the merge and normalize caches keep hitting', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.method(console, 'error', () => {});
  let up = true;
  const fetcher = async url => {
    if (!up) return { ok: false, status: 503, headers: new Map(), body: null };
    const body = url.pathname.endsWith('/leagues') ? { success: true, data: ['nhl'] }
      : url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : url.searchParams.get('market')?.startsWith('MONEYLINE') ? { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }), row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null }
      : { success: true, data: [], nextCursor: null };
    return { ok: true, status: 200, json: async () => body };
  };
  const config = { base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' };
  const first = await sportWizzardSnapshot(config, fetcher);
  up = false;
  t.mock.timers.tick(4 * 60_000);
  const stale = await sportWizzardSnapshot(config, fetcher);
  assert.equal(stale.stale, true);
  assert.equal(stale.quotes, first.quotes);
  assert.equal(await sportWizzardSnapshot(config, fetcher), stale, 'the same stale copy every time');
  await new Promise(resolve => setTimeout(resolve, 1_300));
});

test('a timed-out page is asked once more before its request fails', async () => {
  let calls = 0;
  const fetcher = async url => {
    if (url.pathname.endsWith('/leagues')) return { ok: true, status: 200, json: async () => ({ success: true, data: ['nhl'] }) };
    if (url.searchParams.get('market')?.startsWith('MONEYLINE') && ++calls === 1) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const body = url.pathname.endsWith('/events') ? { success: true, data: [event], nextCursor: null }
      : url.searchParams.get('market')?.startsWith('MONEYLINE') ? { success: true, data: [row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: 6 }), row({ market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: 6 })], nextCursor: null }
      : { success: true, data: [], nextCursor: null };
    return { ok: true, status: 200, json: async () => body };
  };
  const snapshot = await sportWizzardSnapshot({ base: new URL('https://api.sportwizzard.com'), apiKey: 'sw_live_test' }, fetcher);
  assert.equal(calls, 2);
  assert.equal(snapshot.quotes.length, 2);
});

test('merging takes each book’s lines in a sport from the source with more of them, so neither feed wipes out the other’s', () => {
  const quote = (id, book, sport, extra = {}) => ({ id, book, sport, type: 'total', ...extra });
  const primary = { quotes: [
    quote('m-fd', 'fanduel', 'NFL'),
    ...['1', '2', '3'].map(n => quote(`m-pin${n}`, 'pinnacle', 'NFL')),
    quote('m-hr', 'hardrock', 'NHL'),
  ], stale: false };
  const extra = { quotes: [
    ...['1', '2'].map(n => quote(`sw-fd${n}`, 'FanDuel', 'nfl')),
    quote('sw-fdprop', 'FanDuel', 'nfl', { type: 'prop', player: 'Josh Allen' }),
    quote('sw-pin', 'Pinnacle', 'nfl'),
    quote('sw-pinprop', 'Pinnacle', 'nfl', { type: 'prop', player: 'Josh Allen' }),
    quote('sw-hr', 'Hard Rock Bet', 'nhl'),
    quote('sw-bpx', 'betparx', 'nfl'),
  ], stale: false };
  const merged = mergeSnapshots(primary, extra);
  assert.deepEqual(merged.quotes.map(q => q.id).sort(), ['m-hr', 'm-pin1', 'm-pin2', 'm-pin3', 'sw-bpx', 'sw-fd1', 'sw-fd2', 'sw-fdprop', 'sw-pinprop'],
    'FanDuel NFL lines from SportWizzard (2 beat 1), Pinnacle NFL lines from the main feed (3 beat 1), Hard Rock (the same book by either name) from the main feed on a tie, props and new books added');
  assert.equal(mergeSnapshots(primary, extra), merged, 'the same object while inputs are unchanged');
  assert.equal(mergeSnapshots(null, extra), extra);
  assert.equal(mergeSnapshots(primary, null), primary);
  const untouched = { quotes: [quote('a', 'DraftKings', 'NFL')], stale: false };
  assert.equal(mergeSnapshots(untouched, { quotes: [quote('b', 'draftkings', 'NFL')], stale: false }).quotes, untouched.quotes, 'nothing taken, nothing copied');
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

test('a book that rescrapes game by game keeps a game waiting its turn; a price its game’s last pass missed is stale', () => {
  const at = minutes => new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  const prop = (eventId, player, minutes) => ['OVER', 'UNDER'].map(side => row({ id: `${eventId}:${player}:${side}`, eventId, sportsbook: 'betparx', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS', side, line: 2.5, playerName: player, updated: at(minutes) }));
  const rows = [...prop('e1', 'Alex DeBrincat', 1), ...prop('e1', 'Dylan Larkin', 22), ...prop('e2', 'Jordan Eberle', 22), ...prop('e2', 'Jared McCann', 23)];
  const { records } = toFeedRecords(rows, new Map([['e1', event], ['e2', { ...event, id: 'e2' }]]));
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.deepEqual([...new Set(feed.quotes.map(q => q.player))].sort(), ['Alex DeBrincat', 'Jared McCann', 'Jordan Eberle'],
    'the second game hasn’t been rescraped yet; Larkin’s line in the first game was missed by its latest pass');
});

test('the engine counts a slow-cycle book’s price age from its latest pass too', async () => {
  const { quoteAvailable } = await import('../lib/odds/engine.mjs');
  const quote = { id: 'q', sport: 'NHL', eventId: 'e1', event: 'Seattle Kraken @ Detroit Red Wings', marketId: 'm', market: 'Shots', type: 'prop', player: 'Alex DeBrincat', side: 'over', line: 2.5,
    book: 'Caesars', odds: -110, live: false, startTime: event.startTime, ts: new Date(Date.now() - 20 * 60_000).toISOString() };
  assert.equal(quoteAvailable(quote, {}), false, '20 minutes old is past the 15-minute default');
  assert.equal(quoteAvailable({ ...quote, feedLagSeconds: 18 * 60 }, {}), true, 'but only 2 minutes behind its book’s latest pass');
  assert.equal(quoteAvailable({ ...quote, feedLagSeconds: 18 * 60 }, { pregameMaxAgeSeconds: 60 }), false, 'a stricter setting still applies on top of the lag');
});

test('every pick’em app SportWizzard carries comes through: per-pick WannaParlay, HotStreak and Boom, Underdog’s 50/50 lines only, Betr’s standard lines', () => {
  const pick = (book, side, multiplier, line = 1.5) => row({ id: `${book}:${side}:${line}:${multiplier}`, sportsbook: book, market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_SHOTS',
    side, line, playerName: 'Alex DeBrincat', priceAmerican: undefined, dfsMultiplier: multiplier });
  const rows = [pick('wannaparlay', 'OVER', 1.33), pick('wannaparlay', 'OVER', 1, 0.5), pick('hotstreak', 'OVER', 1.9), pick('hotstreak', 'UNDER', 0.92), pick('boom', 'OVER', 1.7),
    pick('underdog', 'OVER', 1), pick('underdog', 'UNDER', 1), pick('underdog', 'UNDER', 0.85, 2.5), pick('underdog', 'OVER', 1.12, 2.5), pick('underdog', 'OVER', 1, 3.5), pick('betr', 'OVER', 1),
    // Season-long lines name no game: skipped with the other season markets.
    { ...pick('underdog', 'OVER', 1, 86.5), id: 'season', period: 'REG_SEASON', marketScope: 'SEASON' }];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.book, r.side, r.line, r.payoutMultiplier, r.oddsType]), [['WannaParlay', 'over', 1.5, 1.33, undefined], ['HotStreak', 'over', 1.5, 1.9, undefined], ['Boom Fantasy', 'over', 1.5, 1.7, undefined],
    ['Underdog Fantasy', 'over', 1.5, undefined, undefined], ['Underdog Fantasy', 'under', 1.5, undefined, undefined], ['Underdog Fantasy', 'over', 3.5, undefined, undefined], ['Betr Picks', 'over', 1.5, undefined, undefined]],
    'a per-pick line paying 1× or less can’t beat its own line; an Underdog line paying more or less than 1× is left out');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.deepEqual(feed.picks.filter(p => p.book === 'Underdog Fantasy').map(p => [p.side, p.line]), [['over', 1.5], ['under', 1.5]], 'Underdog’s 50/50 lines are the ones it lists both ways');
  assert.equal(feed.picks.length, 6, 'every app is a DFS app, so its lines are picks, not sportsbook quotes');
});

test('part-game lines are their own markets: named by their part, priced apart from the full game', () => {
  const lines = (period, home, away, homePrice, awayPrice) => [
    row({ id: `ml:${period}:h`, market: 'MONEYLINE', marketSubtype: 'MONEYLINE', side: 'HOME', period, priceAmerican: homePrice }),
    row({ id: `ml:${period}:a`, market: 'MONEYLINE', marketSubtype: 'MONEYLINE', side: 'AWAY', period, priceAmerican: awayPrice }),
    row({ id: `t:${period}:o`, market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'OVER', line: home, period }),
    row({ id: `t:${period}:u`, market: 'TOTAL', marketSubtype: 'TOTAL_GOALS', side: 'UNDER', line: home, period }),
  ];
  const { records } = toFeedRecords([...lines('FULL', 6, 0, -125, 105), ...lines('1P', 1.5, 0, -105, -115), ...lines('1INN_5INN', 4.5, 0, -110, -110)], new Map([['e1', event]]));
  assert.deepEqual([...new Set(records.map(r => r.period || 'full'))], ['full', '1p', 'f5']);
  assert.equal(records.length, 12, 'a part’s main total isn’t held to the full game’s');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.length, 12, JSON.stringify(feed.skipped));
  assert.deepEqual([...new Set(feed.quotes.map(q => q.displayMarket))], ['Moneyline', 'Total', '1st Period Moneyline', '1st Period Total', 'First 5 Innings Moneyline', 'First 5 Innings Total']);
  assert.equal(new Set(feed.quotes.filter(q => q.type === 'moneyline').map(q => marketIdentity(q))).size, 3);
});

test('anytime TD, goal and assist are Over 0.5 of the stat; a book’s lone Yes is its main line and pairs with two-sided books', () => {
  const nfl = { ...event, homeTeamName: 'Philadelphia Eagles', awayTeamName: 'Jacksonville Jaguars', league: 'nfl' };
  const yes = (book, price, side = 'YES', subtype = 'PLAYER_TO_SCORE_TD') => row({ id: `${book}:${subtype}:${side}`, sportsbook: book, league: 'nfl', market: 'PLAYER_YES_NO', marketSubtype: subtype, side, selection: side === 'YES' ? 'Yes' : 'No', playerName: 'Saquon Barkley', priceAmerican: price });
  const { records } = toFeedRecords([yes('draftkings', -160), yes('prophetx', -150), yes('prophetx', 125, 'NO'),
    // DraftKings' 1+ milestone is the same bet as its anytime TD: one price stands.
    row({ id: 'dk-m', sportsbook: 'draftkings', league: 'nfl', market: 'PLAYER_MILESTONE', marketSubtype: 'PLAYER_TDS', side: 'YES', selection: 'Saquon Barkley 1+', playerName: 'Saquon Barkley', priceAmerican: -160 }),
    yes('draftkings', 550, 'YES', 'PLAYER_FIRST_TO_SCORE_TD'), row({ id: 'fanatics-first', sportsbook: 'fanatics', league: 'nfl', market: 'PLAYER_FIRST_TO', marketSubtype: 'FIRST_TD_SCORER', side: 'YES', selection: 'Saquon Barkley', playerName: 'Saquon Barkley', priceAmerican: 600 }),
  ], new Map([['e1', nfl]]));
  assert.deepEqual(records.map(r => [r.book, r.market, r.side, r.line, Boolean(r.depthOnly)]).sort(), [
    ['draftkings', 'Anytime TDs', 'over', 0.5, false], ['draftkings', 'First TD Scorer', 'yes', '', false], ['fanatics', 'First TD Scorer', 'yes', '', false],
    ['prophetx', 'Anytime TDs', 'over', 0.5, false], ['prophetx', 'Anytime TDs', 'under', 0.5, false]]);
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.length, 5, JSON.stringify(feed.skipped));
  const first = feed.quotes.filter(q => q.market === 'First TD Scorer');
  assert.equal(new Set(first.map(q => marketIdentity(q))).size, 1, 'two codes for first TD scorer are one market');
  assert.ok(first.every(q => q.sideVerified && q.selection === 'Yes'));
  const anytime = feed.quotes.filter(q => q.market === 'Anytime TDs');
  assert.equal(new Set(anytime.map(q => marketIdentity(q))).size, 1);
});

test('game props: team totals name the team and keep one main line, yes/no and closed outcome sets can be priced, labels only compare', () => {
  const gp = (id, market, marketSubtype, side, extra = {}) => row({ id, market, marketSubtype, side, ...extra });
  const teamTotal = (book, side, line, price, teamSide = 'HOME') => gp(`${book}:tt:${teamSide}:${side}:${line}`, 'TEAM_TOTAL', 'TEAM_TOTAL_GOALS', side, { sportsbook: book, line, priceAmerican: price, teamSide, teamName: teamSide === 'HOME' ? 'DET Red Wings - Inc. OT' : 'SEA Kraken' });
  const rows = [
    teamTotal('ballybet', 'OVER', 3.5, 106), teamTotal('ballybet', 'UNDER', 3.5, -143), teamTotal('ballybet', 'OVER', 4.5, 240), teamTotal('ballybet', 'UNDER', 4.5, -360),
    gp('btts-y', 'YES_NO', 'BOTH_TEAMS_TO_SCORE', 'YES', { priceAmerican: -400 }), gp('btts-n', 'YES_NO', 'BOTH_TEAMS_TO_SCORE', 'NO', { priceAmerican: 250 }),
    ...['HOME', 'AWAY', 'NEITHER'].map(side => gp(`first:${side}`, 'CATEGORICAL', 'TEAM_TO_SCORE_FIRST_GOAL', side, { priceAmerican: side === 'NEITHER' ? 5000 : -105, teamSide: side === 'NEITHER' ? undefined : side })),
    // A winning margin only one book labels this way can't be compared; one two books share stays.
    gp('wm-dk', 'WINNING_MARGIN', 'WINNING_MARGIN', 'RED WINGS TO WIN BY 1', { selection: 'Red Wings to win by 1', priceAmerican: 300 }),
    gp('wm-fd', 'WINNING_MARGIN', 'WINNING_MARGIN', 'RED WINGS TO WIN BY 1', { sportsbook: 'fanduel', selection: 'Red Wings to win by 1', priceAmerican: 310 }),
    gp('wm-only', 'WINNING_MARGIN', 'WINNING_MARGIN', 'KRAKEN TO WIN BY 4', { selection: 'Kraken to win by 4', priceAmerican: 2000 }),
    // "Race to" without its number, and squares, can't be told apart.
    gp('race', 'RACE_TO', 'RACE_TO', 'HOME', { teamSide: 'HOME', priceAmerican: 100 }), gp('sq', 'CORRECT_SCORE', 'SQUARES_FINAL', 'DET 7-3 SEA', { priceAmerican: 900 }),
  ];
  const { records } = toFeedRecords(rows, new Map([['e1', event]]));
  assert.deepEqual(records.filter(r => r.market.endsWith('Team Total')).map(r => [r.market, r.side, r.line]), [['Detroit Red Wings Team Total', 'over', 3.5], ['Detroit Red Wings Team Total', 'under', 3.5]]);
  assert.deepEqual(records.filter(r => r.market === 'Team To Score First Goal').map(r => [r.side, r.outcomes]), [['home', 3], ['away', 3], ['neither', 3]]);
  assert.deepEqual(records.filter(r => r.market === 'Winning Margin').map(r => [r.book, r.side]), [['draftkings', 'red wings to win by 1'], ['fanduel', 'red wings to win by 1']]);
  assert.ok(!records.some(r => /Race|Squares/.test(r.market)));
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  assert.equal(feed.quotes.length, records.length, JSON.stringify(feed.skipped));
  assert.deepEqual(feed.quotes.filter(q => q.market.endsWith('Team Total')).map(q => [q.selection, q.line]), [['Over', 3.5], ['Under', 3.5]], 'a team total reads as a total: the line is shown once, beside it');
  const btts = feed.quotes.find(q => q.market === 'Both Teams To Score' && q.side === 'yes');
  assert.deepEqual(sideNames(btts, feed.quotes.filter(q => q.market === 'Both Teams To Score')), ['yes', 'no']);
  const margin = feed.quotes.find(q => q.market === 'Winning Margin');
  assert.deepEqual(sideNames(margin, feed.quotes.filter(q => q.market === 'Winning Margin')), [], 'a labelled market has no known outcome count');
  const first = feed.quotes.filter(q => q.market === 'Team To Score First Goal');
  assert.deepEqual(sideNames(first[0], first), ['away', 'home', 'neither']);
});

test('part-game pick’em lines name their part and are priced by the books’ props for that part only', () => {
  const nfl = { ...event, homeTeamName: 'Philadelphia Eagles', awayTeamName: 'Jacksonville Jaguars', league: 'nfl' };
  const prop = (book, side, line, price, period) => row({ id: `${book}:${side}:${line}:${period}`, sportsbook: book, league: 'nfl', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_REC_YARDS', side, line, period, playerName: 'A.J. Brown', priceAmerican: price });
  const { records } = toFeedRecords([
    prop('draftkings', 'OVER', 32.5, -115, '1H'), prop('draftkings', 'UNDER', 32.5, -105, '1H'),
    prop('draftkings', 'OVER', 64.5, -110, 'FULL'), prop('draftkings', 'UNDER', 64.5, -110, 'FULL'),
    row({ id: 'cb-1h', sportsbook: 'chalkboard', league: 'nfl', market: 'PLAYER_TOTAL', marketSubtype: 'PLAYER_TOTAL_REC_YARDS', side: 'OVER', line: 32.5, period: '1H', playerName: 'A.J. Brown', priceAmerican: undefined, dfsMultiplier: 1.8 }),
  ], new Map([['e1', nfl]]));
  assert.equal(records.find(r => r.book === 'Chalkboard').market, 'Rec Yards 1H');
  const feed = normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false });
  const [pick] = dfsPicks(feed.picks, feed.quotes);
  assert.equal(pick.market, 'Rec Yards 1H');
  assert.ok(Math.abs(pick.probability - 0.5108) < 0.002, `priced from the 1H prop, not the full game (${pick.probability})`);
});

test('a lone one-sided anytime goal travels with More markets; anytime TD and two-sided lines stay with the main markets', () => {
  const yes = (id, subtype, side = 'YES', book = 'betrivers-kambi') => row({ id, sportsbook: book, market: 'PLAYER_YES_NO', marketSubtype: subtype, side, selection: side === 'YES' ? 'Yes' : 'No', playerName: 'Alex DeBrincat', priceAmerican: side === 'YES' ? 220 : -300 });
  const { records } = toFeedRecords([yes('g', 'PLAYER_TO_SCORE_GOAL'), yes('a-y', 'PLAYER_TO_ASSIST', 'YES', 'prophetx'), yes('a-n', 'PLAYER_TO_ASSIST', 'NO', 'prophetx')], new Map([['e1', event]]));
  assert.deepEqual(records.map(r => [r.market, r.side, r.scope ?? 'main']), [['Goals', 'over', 'more'], ['Assists', 'over', 'main'], ['Assists', 'under', 'main']]);
  assert.equal(normalizeFeed(records, { syncedAt: new Date().toISOString(), price: false }).quotes.find(q => q.market === 'Goals').scope, 'more');
});
