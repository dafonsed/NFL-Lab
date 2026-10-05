import test from 'node:test';
import assert from 'node:assert/strict';
import { alertMatches } from '../public/odds-alerts.js';
import { isCurrent } from '../public/odds-contract.js';
import { priced, current } from './helpers/priced.mjs';

// Alert rules compare the odds service's values with the member's thresholds; nothing is priced here.

test('movement alerts identify a new line snapshot of a current price', () => {
  const quote = current({ id: 'q', sport: 'NFL', event: 'A vs B', market: 'Total', side: 'Over', book: 'Book A', odds: -110, line: 44.5, live: false, ts: new Date().toISOString() });
  const state = { quotes: [quote], history: [{ id: 'h1', quoteId: 'q', line: 44.5 }, { id: 'h2', quoteId: 'q', line: 45.5 }], dfs: [] };
  const rule = { kind: 'movement', event: '', market: '', threshold: 1, liveOnly: false };
  assert.deepEqual(alertMatches(rule, state, { available: isCurrent }), [{ id: 'h2', label: 'Over 44.5 -110 · Total · A vs B at Book A · line 44.5 → 45.5' }]);
  // A price that is no longer current doesn't alert.
  assert.deepEqual(alertMatches(rule, { ...state, quotes: [{ ...quote, status: 'stale' }] }, { available: isCurrent }), []);
});

test('EV alerts use the server’s EV from every book; only the matched price must be at an offered book', () => {
  const ts = new Date().toISOString();
  const line = (book, side, odds) => ({ id: `${book}-${side}`, sport: 'NFL', event: 'A @ B', eventId: 'NFL:a @ b', market: 'moneyline', marketId: 'moneyline|NFL:a @ b', type: 'moneyline', side, book, odds, live: false, ts });
  const quotes = [line('Pinnacle', 'away', -110), line('Pinnacle', 'home', -110), line('DraftKings', 'away', -110), line('DraftKings', 'home', -110), line('BetMGM', 'away', 120), line('BetMGM', 'home', -130), line('FanDuel', 'away', 120), line('FanDuel', 'home', -130)];
  const { quotes: served, analytics } = priced(quotes);
  const rule = { kind: 'ev', threshold: 5 }, options = { pricing: analytics.pricing, available: isCurrent };
  const books = matches => matches.map(match => match.id.split('-')[0]).sort();
  assert.deepEqual(books(alertMatches(rule, { quotes: served }, options)), ['BetMGM', 'FanDuel']);
  // A member whose state has BetMGM only: Pinnacle and DraftKings still set the fair price.
  assert.deepEqual(books(alertMatches(rule, { quotes: served }, { ...options, offered: q => q.book === 'BetMGM' })), ['BetMGM']);
  // Without the server's pricing there is nothing to compare: no EV is made up in the browser.
  assert.deepEqual(alertMatches(rule, { quotes: served }, { available: isCurrent }), []);
  // Pricing only BetMGM's own prices leaves it with no fair price.
  const alone = priced(quotes.filter(q => q.book === 'BetMGM'));
  assert.deepEqual(alertMatches(rule, { quotes: alone.quotes }, { pricing: alone.analytics.pricing, available: isCurrent }), []);
});

test('price and new-fantasy-prop rules compare the member’s thresholds', () => {
  const quote = current({ id: 'p', sport: 'NFL', event: 'A @ B', market: 'moneyline', side: 'home', selection: 'B', book: 'FanDuel', odds: 150, ts: new Date().toISOString() });
  assert.equal(alertMatches({ kind: 'price', threshold: 140 }, { quotes: [quote] }, { available: isCurrent }).length, 1);
  assert.equal(alertMatches({ kind: 'price', threshold: 160 }, { quotes: [quote] }, { available: isCurrent }).length, 0);
  const dfs = [{ id: 'd', sport: 'NFL', player: 'P', side: 'Over', line: 1.5, market: 'Receptions', app: 'PrizePicks', probability: .61 }, { id: 'e', sport: 'NFL', player: 'Q', side: 'Over', line: 1.5, market: 'Receptions', app: 'PrizePicks', probability: null }];
  assert.deepEqual(alertMatches({ kind: 'fantasy-new', threshold: 60 }, { dfs }).map(match => match.id), ['d']);
});
