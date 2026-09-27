import test from 'node:test';
import assert from 'node:assert/strict';
import { arbitrageDemoQuotes, arbitrageWorkspaceQuotes, isArbitrageDemo } from '../public/arbitrage-demo.js';
import { arbitrageRows, arbitrage, decimal, groups, fairProbability } from '../public/ev-core.js';

test('demo provides complete, usable arbitrage pairs across six sports in both modes', () => {
  const records = arbitrageDemoQuotes();
  assert.equal(new Set(records.map(quote => quote.id)).size, records.length);
  assert.equal(new Set(records.map(quote => quote.sport)).size, 6);
  assert.ok(records.every(quote => quote.demo && quote.source === 'example'));
  for (const live of [false, true]) {
    const opportunities = arbitrageRows(records, live);
    assert.equal(opportunities.length, 6);
    for (const {best} of opportunities) {
      assert.notEqual(best[0].book, best[1].book);
      const result = arbitrage(best, 200);
      assert.ok(result.profit > 0);
      assert.ok(Math.abs(result.stakes.reduce((sum, stake) => sum + stake, 0) - 200) < 1e-9);
      assert.ok(Math.abs(result.stakes[0] * decimal(best[0].odds) - result.stakes[1] * decimal(best[1].odds)) < 1e-9);
      assert.ok(Number.isFinite(fairProbability(best[0], groups(records).find(group => group.includes(best[0])))));
    }
  }
});

test('preview never adds fixtures to saved records or replaces manually entered prices', () => {
  const empty = [];
  const demo = arbitrageWorkspaceQuotes(empty);
  assert.equal(empty.length, 0);
  assert.equal(isArbitrageDemo(empty), true);
  assert.ok(demo.length > 0);
  const manual = [{...demo[0], id:'manual-quote', source:'manual', demo:false}];
  const before = structuredClone(manual);
  assert.equal(arbitrageWorkspaceQuotes(manual), manual);
  assert.deepEqual(manual, before);
  assert.equal(isArbitrageDemo(manual), false);
});
