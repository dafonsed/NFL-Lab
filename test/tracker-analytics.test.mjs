import test from 'node:test';
import assert from 'node:assert/strict';
import { bankrollSeries, defaultUnit, groupResults, money, oddsBucket, renderAnalytics } from '../public/tracker-analytics.js';

const bet = extra => ({ selection: 'x', sport: 'NFL', type: 'single', status: 'won', date: '2026-09-01', odds: 100, oddsFormat: 'american', stake: 10, ...extra });

test('groups report count, ROI and win rate on settled tickets only', () => {
  const rows = groupResults([bet(), bet({ status: 'lost' }), bet({ status: 'open' }), bet({ type: 'parlay', odds: 300 })], b => b.type);
  const singles = rows.find(row => row.name === 'single');
  assert.equal(singles.count, 2);
  assert.equal(singles.profit, 0);
  assert.equal(singles.winRate, 50);
  assert.equal(rows.find(row => row.name === 'parlay').roi, 300);
});

test('odds buckets split favorites from underdogs', () => {
  assert.match(oddsBucket(bet({ odds: -250 })), /Heavy favorites/);
  assert.match(oddsBucket(bet({ odds: -110 })), /^Favorites/);
  assert.match(oddsBucket(bet({ odds: 150 })), /Short underdogs/);
  assert.match(oddsBucket(bet({ odds: 3.5, oddsFormat: 'decimal' })), /Long shots/);
});

test('bankroll moves by settled profit per day from the starting amount', () => {
  const series = bankrollSeries([bet({ date: '2026-09-02' }), bet({ date: '2026-09-01', status: 'lost' }), bet({ status: 'open', date: '2026-09-03' })], 100);
  assert.deepEqual(series, [{ date: '2026-09-01', value: 90 }, { date: '2026-09-02', value: 100 }]);
});

test('units divide by the unit size; the default unit is the median cash stake', () => {
  assert.equal(defaultUnit([bet({ stake: 5 }), bet({ stake: 20 }), bet({ stake: 10 }), bet({ stake: 99, freeBet: true })]), 10);
  assert.equal(money(-25, { units: true }, 10), '−2.50u');
  assert.equal(money(25, { units: false }, 10), '$25.00');
});

test('the analysis renders with empty states when there is little data', () => {
  const html = renderAnalytics([bet({ status: 'open' })], { units: false, unitSize: null, bankroll: null });
  assert.match(html, /appears once two days of results are settled/);
  assert.match(html, /Add closing odds/);
});
