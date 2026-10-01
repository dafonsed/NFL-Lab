import test from 'node:test';
import assert from 'node:assert/strict';
import { teamKey, matchedEventKey, splitQuoteTimes } from '../public/ev-event-match.js';

test('team names from different books reduce to the same nickname', () => {
  for (const name of ['CIN Bengals', 'Bengals', 'Cincinnati Bengals']) assert.equal(teamKey(name), 'bengals');
  assert.equal(teamKey('LA Chargers'), 'chargers');
  assert.equal(teamKey('San Francisco 49ers'), '49ers');
  assert.equal(teamKey('Portland Trail Blazers'), 'blazers');
});

test('the same game gets one key whatever each book calls it', () => {
  const keys = ['CIN Bengals @ MIA Dolphins', 'Bengals @ Dolphins', 'Cincinnati Bengals @ Miami Dolphins'].map(event => matchedEventKey('NFL', event));
  assert.deepEqual(new Set(keys), new Set(['bengals @ dolphins']));
  assert.notEqual(matchedEventKey('NFL', 'Dolphins @ Bengals'), keys[0], 'home and away stay distinct');
});

test('only safe sports and "@" names are matched', () => {
  assert.equal(matchedEventKey('MLB', 'NY Mets @ MIA Marlins'), null, 'MLB series repeat on back-to-back days');
  assert.equal(matchedEventKey('tennis', 'A Player @ B Player'), null);
  assert.equal(matchedEventKey('NBA', 'Celtics vs Nuggets'), null, '"vs" does not say which team is home');
  assert.equal(matchedEventKey('NFL', 'Bengals'), null);
});

test('a future ts is treated as the game start and the price as seen at sync time', () => {
  const synced = '2026-09-30T22:00:00.000Z';
  assert.deepEqual(splitQuoteTimes({ ts: '2026-10-02T00:15:00.000Z' }, synced), { ts: synced, startTime: '2026-10-02T00:15:00.000Z' });
  assert.deepEqual(splitQuoteTimes({ ts: '2026-09-30T21:59:00.000Z', startTime: '' }, synced), { ts: '2026-09-30T21:59:00.000Z', startTime: '' });
  assert.equal(splitQuoteTimes({ ts: '2026-10-02T00:15:00.000Z', startTime: '2026-10-02T00:20:00.000Z' }, synced).startTime, '2026-10-02T00:20:00.000Z', 'a supplied start time wins');
});

test('listings whose own two sides cannot be real prices are skipped', async () => {
  const { dropInconsistentListings } = await import('../public/ev-event-match.js');
  const { marketKey } = await import('../public/ev-core.js');
  const q = (id, book, event, side, odds, extra = {}) => ({ id, sport: 'NFL', eventId: 'NFL:titans @ ravens', event, market: 'moneyline', marketId: 'moneyline|NFL:titans @ ravens', type: 'moneyline', line: '', side, book, odds, live: false, outcomes: '', ...extra });
  const quotes = [
    q('dk-a', 'DraftKings', 'TEN Titans @ BAL Ravens', 'away', 500), q('dk-h', 'DraftKings', 'TEN Titans @ BAL Ravens', 'home', -714),
    q('fa-a', 'Fanatics', 'Titans @ Ravens', 'away', 325), q('fa-h', 'Fanatics', 'Titans @ Ravens', 'home', 4000),
    q('fb-a', 'Fanatics', 'Tennessee Titans @ Baltimore Ravens', 'away', -700), q('fb-h', 'Fanatics', 'Tennessee Titans @ Baltimore Ravens', 'home', -205),
    q('fd-h', 'FanDuel', 'Titans @ Ravens', 'home', -650),
  ];
  const { kept, dropped } = dropInconsistentListings(quotes, marketKey);
  assert.deepEqual(kept.map(x => x.id), ['dk-a', 'dk-h', 'fd-h'], 'both-underdog and both-favorite listings go; single-sided quotes stay');
  assert.equal(dropped, 4);
});

test('one-sided alternate-line ladders are skipped because their team is unknown', async () => {
  const { dropInconsistentListings } = await import('../public/ev-event-match.js');
  const { marketKey } = await import('../public/ev-core.js');
  const spread = (id, book, side, line, odds) => ({ id, sport: 'NFL', eventId: 'NFL:steelers @ browns', event: 'Steelers @ Browns', market: 'spread', marketId: 'spread|NFL:steelers @ browns', type: 'spread', line, side, book, odds, live: false, outcomes: '' });
  const quotes = [spread('l1', 'Fanatics', 'home', 2.5, 130), spread('l2', 'Fanatics', 'home', -13.5, 600), spread('l3', 'Fanatics', 'home', 8.5, -400),
    spread('m1', 'DraftKings', 'away', -2.5, -120), spread('m2', 'DraftKings', 'home', 2.5, 100)];
  const { kept } = dropInconsistentListings(quotes, marketKey);
  assert.deepEqual(kept.map(x => x.id), ['m1', 'm2']);
});
