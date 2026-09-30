import test from 'node:test';
import assert from 'node:assert/strict';
import { startsWithin, oddsWithin, quoteMatches, readToolFilters, saveToolFilters, activeFilterCount, toolFilterBar, TOOL_FILTER_DEFAULTS } from '../public/ev-filters.js';

const noon = new Date(2026, 9, 1, 12, 0, 0).getTime();
const at = (days, hours = 0) => new Date(noon + days * 86_400_000 + hours * 3_600_000).toISOString();

test('start windows use the event start time, not when the price was observed', () => {
  const soon = { startTime: at(0, 2), ts: at(-5) };
  assert.equal(startsWithin(soon, 'soon', noon), true);
  assert.equal(startsWithin(soon, 'today', noon), true);
  assert.equal(startsWithin({ startTime: at(0, 4) }, 'soon', noon), false);
  assert.equal(startsWithin({ startTime: at(1) }, 'tomorrow', noon), true);
  assert.equal(startsWithin({ startTime: at(1) }, 'today', noon), false);
  assert.equal(startsWithin({ startTime: at(6) }, 'week', noon), true);
  assert.equal(startsWithin({ startTime: at(8) }, 'week', noon), false);
  assert.equal(startsWithin({ startTime: at(0, -1) }, 'soon', noon), true, 'a game in progress still counts as starting soon');
});

test('prices without a start time only match Any time', () => {
  assert.equal(startsWithin({ ts: at(0) }, 'all', noon), true);
  for (const range of ['soon', 'today', 'tomorrow', 'week']) assert.equal(startsWithin({ ts: at(0) }, range, noon), false, range);
});

test('odds ranges compare payouts, so -110 is shorter than +100', () => {
  assert.equal(oddsWithin(-110, '100'), false);
  assert.equal(oddsWithin(105, '100'), true);
  assert.equal(oddsWithin(-250, '-200'), false);
  assert.equal(oddsWithin(-150, '-200'), true);
  assert.equal(oddsWithin(250, '', '200'), false);
  assert.equal(oddsWithin(-500, '', '200'), true);
  assert.equal(oddsWithin(150, '', ''), true);
  assert.equal(oddsWithin('not odds', '', ''), false);
});

test('quote filters match league, market, period, start window and book', () => {
  const quote = { sport: 'NFL', league: 'NFL', type: 'spread', live: false, book: 'FanDuel', startTime: at(0, 2) };
  assert.equal(quoteMatches(quote, {}, noon), true);
  assert.equal(quoteMatches(quote, { league: 'NBA' }, noon), false);
  assert.equal(quoteMatches(quote, { market: 'total' }, noon), false);
  assert.equal(quoteMatches(quote, { period: 'live' }, noon), false);
  assert.equal(quoteMatches(quote, { period: 'pregame', when: 'soon' }, noon), true);
  assert.equal(quoteMatches(quote, { book: 'DraftKings' }, noon), false);
});

test('saved filters keep known string fields only and survive unreadable storage', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  saveToolFilters({ ...TOOL_FILTER_DEFAULTS, league: 'NBA', maxHold: '2', unknown: 'x' }, storage);
  const saved = readToolFilters(storage);
  assert.equal(saved.league, 'NBA');
  assert.equal(saved.maxHold, '2');
  assert.equal('unknown' in saved, false);
  assert.deepEqual(readToolFilters({ getItem: () => '{bad json' }), { ...TOOL_FILTER_DEFAULTS });
});

test('each tool gets its own controls and a clear button once a filter is set', () => {
  const quotes = [{ league: 'NFL', book: 'FanDuel' }, { league: 'NBA', book: 'DraftKings' }];
  const holds = toolFilterBar('holds', { ...TOOL_FILTER_DEFAULTS }, quotes);
  assert.match(holds, /data-tool-filter="maxHold"/);
  assert.doesNotMatch(holds, /data-tool-filter="book"/);
  assert.doesNotMatch(holds, /data-tool-filter-clear/);
  const parlay = toolFilterBar('parlay', { ...TOOL_FILTER_DEFAULTS, book: 'FanDuel' }, quotes);
  assert.match(parlay, /<option value="FanDuel" selected>FanDuel<\/option>/);
  assert.match(parlay, /Clear 1 filter/);
  assert.equal(activeFilterCount({ ...TOOL_FILTER_DEFAULTS, league: 'NFL', when: 'today' }, ['league', 'when', 'book']), 2);
  assert.equal(toolFilterBar('ev-pre', { ...TOOL_FILTER_DEFAULTS }, quotes), '');
});
