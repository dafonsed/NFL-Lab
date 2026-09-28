import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {permanentDemoWorkspace} from '../public/ev-preview.js';
import {groups,validQuote} from '../public/ev-core.js';
import {platformAsset} from '../public/platform-catalog.js';
import {oddsDemoHistory} from '../public/odds-demo.js';

const now = Date.parse('2026-09-27T18:00:00Z');
const demo = permanentDemoWorkspace(null, now);

test('each demo comparison offers twelve named books with valid opposing prices', () => {
  const baseQuotes = demo.quotes.filter(quote => !quote.id.includes(':middle:'));
  const comparisons = groups(baseQuotes);
  assert.equal(comparisons.length, 6 * 3 * 3 * 2);
  for (const comparison of comparisons) {
    const names = [...new Set(comparison.map(quote => quote.book))];
    assert.equal(names.length, 12);
    assert.equal(comparison.length, 24);
    assert.ok(new Set(comparison.map(quote => quote.odds)).size >= 10);
    assert.ok(comparison.every(quote => validQuote(quote) && quote.demo && quote.source === 'example'));
    for (const name of names) {
      assert.ok(platformAsset(name), name);
      assert.ok(existsSync(new URL(`../public${platformAsset(name)}`, import.meta.url)), name);
      assert.equal(new Set(comparison.filter(quote => quote.book === name).map(quote => quote.side)).size, 2);
    }
  }
});

test('adding comparison books preserves saved demo edits and original quote identities', () => {
  const saved = structuredClone(demo);
  saved.quotes = saved.quotes.filter(quote => /:(?:[0-3]|exchange):[01]$/.test(quote.id));
  const original = saved.quotes.find(quote => quote.id === 'demo-nfl-0:prop:pre:0:0');
  original.odds = 135;
  const extra = {...original, id:'custom-demo-quote', odds:145};
  saved.quotes.push(extra);
  saved.history[0].odds = -125;
  const before = JSON.stringify(saved);
  const restored = permanentDemoWorkspace(saved, now);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(restored.quotes.find(quote => quote.id === original.id).odds, 135);
  assert.equal(restored.quotes.find(quote => quote.id === extra.id).odds, 145);
  assert.equal(restored.history.find(point => point.id === saved.history[0].id).odds, -125);
  assert.equal(new Set(restored.quotes.filter(quote => quote.marketId === original.marketId).map(quote => quote.book)).size, 12);
  assert.equal(new Set(restored.quotes.map(quote => quote.id)).size, restored.quotes.length);
});

test('all demo brands provide labeled history without exceeding typical browser storage', () => {
  const comparison = demo.quotes.filter(quote => quote.marketId === 'demo-nfl-0:prop:pre' && quote.side === 'Over');
  assert.equal(comparison.length, 12);
  for (const quote of comparison) {
    const history = oddsDemoHistory(quote);
    assert.equal(history.length, 9);
    assert.ok(history.every(point => point.demo && point.source === 'example' && validQuote(point)));
    assert.equal(history.at(-1).odds, quote.odds);
    assert.ok(new Set(history.map(point => point.odds)).size > 1);
  }
  assert.ok(JSON.stringify(demo).length * 2 < 5 * 1024 * 1024, 'base demo should fit a 5 MiB UTF-16 storage allowance');
});
