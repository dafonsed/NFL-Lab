import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries } from '../public/command-palette.js';

test('an empty query shows the main destinations', () => {
  const results = searchEntries('');
  assert.ok(results.length > 0 && results.length <= 12);
  assert.ok(results.some(entry => entry.label === 'Bet tracker'));
});

test('every word must match, and label-prefix matches rank first', () => {
  const [first] = searchEntries('nba trends');
  assert.equal(first.label, 'NBA player trends');
  assert.equal(first.href, '/nba?view=trends');
  assert.equal(searchEntries('arbitrage')[0].label, 'Arbitrage');
  assert.deepEqual(searchEntries('zzzz nothing'), []);
});

test('keywords find tools by what people call them', () => {
  assert.equal(searchEntries('log ticket')[0].href, '/ev/tracker?add=1');
  assert.ok(searchEntries('billing').some(entry => entry.href === '/account'));
});
