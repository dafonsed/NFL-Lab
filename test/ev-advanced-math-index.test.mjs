import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAdvancedEv, consensusPrice } from '../public/ev-advanced-math.js';
import { permanentDemoWorkspace } from './fixtures/ev-preview.js';

// computeAdvancedEv indexes markets once per batch; each fair value must match
// the unindexed consensus for the same quote, settings and time.
test('batched EV uses the same consensus as a single-quote lookup', () => {
  const now = Date.now(), quotes = permanentDemoWorkspace(null, now).quotes;
  for (const settings of [{ now }, { now, devigMethod:'power', minSharpBooks:2 }, { now, allowProjection:true }]) {
    const rows = computeAdvancedEv(quotes, settings);
    assert.ok(rows.length > 100, 'demo data produces comparable prices');
    // A spread-out sample keeps the slow single-quote reference quick.
    for (const row of rows.filter((item, index) => !item.estimated && index % 25 === 0)) {
      const single = consensusPrice(row.quote, quotes, { ...settings });
      assert.equal(row.fair, single.probability, row.quote.id);
      assert.deepEqual(row.consensus.books.map(book => book.book), single.books.map(book => book.book), row.quote.id);
    }
  }
});
