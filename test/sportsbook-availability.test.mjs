import test from 'node:test';
import assert from 'node:assert/strict';
import {US_STATES, SPORTSBOOK_COVERAGE, STATE_STORAGE_KEY, normalizeState, sportsbookStatus, sportsbookAvailable, availableSportsbookQuotes, readSportsbookState, saveSportsbookState} from '../public/sportsbook-availability.js';
import {evRows} from '../public/ev-core.js';

test('state coverage distinguishes individual books, DFS products, and unverified books', () => {
  assert.equal(Object.keys(US_STATES).length, 51);
  assert.equal(normalizeState(' az '), 'AZ');
  assert.equal(normalizeState('constructor'), '');
  assert.equal(sportsbookAvailable('Hard Rock Bet', 'FL'), true);
  assert.equal(sportsbookAvailable('FanDuel', 'FL'), false);
  assert.equal(sportsbookAvailable('BetRivers', 'DE'), true);
  assert.equal(sportsbookAvailable('bet365', 'NY'), false);
  assert.equal(sportsbookAvailable('DraftKings (example)', 'OR'), true);
  assert.equal(sportsbookStatus('Pinnacle', 'AZ'), 'unverified');
  assert.equal(sportsbookStatus('DraftKings Pick6', 'AZ'), 'unverified');
  assert.equal(sportsbookAvailable('Custom book', ''), true);
  for (const [book, coverage] of Object.entries(SPORTSBOOK_COVERAGE)) {
    assert.equal(sportsbookAvailable(book, 'CA'), false);
    assert.equal(new Set(coverage.states).size, coverage.states.length);
    assert.ok(coverage.states.every(code => Object.hasOwn(US_STATES, code)));
    assert.ok(coverage.source.startsWith('https://'));
  }
});

test('filter offers without deleting records or altering benchmark probabilities', () => {
  const base = {event:'Test game', sport:'MLB', market:'Total', type:'total', line:8.5, live:false, ts:new Date().toISOString()};
  const quotes = [
    {...base,id:'a',book:'Hard Rock Bet',side:'Over',odds:120},
    {...base,id:'b',book:'Hard Rock Bet',side:'Under',odds:-140},
    {...base,id:'c',book:'FanDuel',side:'Over',odds:-110},
    {...base,id:'d',book:'FanDuel',side:'Under',odds:-110}
  ];
  const before = structuredClone(quotes);
  assert.deepEqual(availableSportsbookQuotes(quotes, 'FL').map(q => q.id), ['a','b']);
  assert.deepEqual(availableSportsbookQuotes(quotes, 'CA'), []);
  const offers = evRows(quotes, false).filter(row => sportsbookAvailable(row.quote.book, 'FL'));
  assert.equal(offers.length, 2);
  assert.equal(offers.find(row => row.quote.id === 'a').fair, .5);
  assert.deepEqual(quotes, before);
});

test('saved selection survives reload, clearing, corrupt values and blocked storage', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key), setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)};
  assert.equal(readSportsbookState(storage), '');
  assert.equal(saveSportsbookState('az',storage), true);
  assert.equal(readSportsbookState(storage), 'AZ');
  saveSportsbookState('',storage);
  assert.equal(readSportsbookState(storage), '');
  values.set(STATE_STORAGE_KEY, '<bad>');
  assert.equal(readSportsbookState(storage), '');
  const blocked = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(readSportsbookState(blocked), '');
  assert.equal(saveSportsbookState('AZ',blocked), false);
});
