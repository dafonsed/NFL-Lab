import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createEvLedger } from '../public/ev-ledger.js';

const NOW = Date.parse('2026-10-03T06:17:08Z');
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const quote = (id, book, game, side, odds, extra = {}) => ({ id, sport: 'NFL', event: `Game ${game}`, market: 'Moneyline', type: 'moneyline', line: '', side, book, odds, live: false, ts: at(2), source: 'local-api', ...extra });
// Legacy workspace bets (the ledger's second record source) carry their quote snapshot directly.
const tracked = (id, snapshot, extra = {}) => ({ id, selection: `${snapshot.event} ${snapshot.side}`, stake: 10, odds: snapshot.odds, book: snapshot.book, sport: 'NFL', date: '2026-10-02', status: 'open', quoteSnapshots: [snapshot], ...extra });
const ledgerFor = state => createEvLedger({ getState: () => state, save() {}, redraw() {}, navigate() {}, getSettings: () => ({ devigMethod: 'multiplicative' }) });

test('tracked bets show the newest available price at their book and its no-vig fair value, from one index per feed snapshot', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const quotes = [];
  // 5,000 games priced both ways at four books.
  for (let game = 0; game < 5_000; game += 1) for (const [book, home, away] of [['Book A', -110, -110], ['Book B', -105, -115], ['Book C', -120, 100], ['Book D', 105, -125]]) {
    quotes.push(quote(`${book}-${game}-h`, book, game, 'home', home), quote(`${book}-${game}-a`, book, game, 'away', away));
  }
  // Game 0 at Book A was repriced; the older record is still in the feed.
  quotes.push(quote('Book A-0-h-new', 'Book A', 0, 'home', -102, { ts: at(1) }));
  const bets = Array.from({ length: 40 }, (_, index) => tracked(`bet-${index}`, quote(`Book A-${index}-h`, 'Book A', index, 'home', -110, { ts: at(30) })));
  const state = { quotes, bets, suite: { ledger: { filters: { source: 'legacy' } } } };
  const ledger = ledgerFor(state);
  const started = performance.now();
  let $ = load(ledger.render('tracker'));
  const first = performance.now() - started;
  const current = $('tbody tr').toArray().map(row => $(row).find('small').filter((_, item) => /^Current/.test($(item).text())).text());
  assert.equal(current.length, 40);
  assert.match(current[0], /^Current -102 · Fair \d+\.\d\d%$/, 'the newest Book A price, priced against the other books');
  assert.match(current[1], /^Current -110 · Fair/);
  const again = performance.now();
  ledger.render('tracker');
  const second = performance.now() - again;
  assert.ok(first < 3_000, `first render ${first.toFixed(0)} ms (a scan per row took seconds)`);
  assert.ok(second < first, `redraws reuse the index (${second.toFixed(1)} ms vs ${first.toFixed(1)} ms)`);
  // A new snapshot (a new array) is indexed again.
  state.quotes = quotes.map(item => item.id === 'Book A-0-h-new' ? { ...item, odds: 110 } : item);
  $ = load(ledger.render('tracker'));
  assert.match($('tbody tr').first().text(), /Current \+110/);
});

test('performance shows price CLV and, when the other side closed too, no-vig CLV', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const snapshot = quote('q1', 'Book A', 1, 'home', 120);
  const settled = (id, extra) => tracked(id, snapshot, { status: 'won', odds: 120, closingOdds: 100, closeComparable: true, ...extra });
  const state = { quotes: [], bets: [settled('with-other', { closingOtherOdds: -120 }), settled('price-only', {})], suite: { ledger: { filters: { source: 'legacy' } } } };
  const $ = load(ledgerFor(state).render('performance'));
  const stat = label => $('.evl-stats div').filter((_, item) => $(item).find('span').text() === label).find('strong').text();
  assert.equal(stat('Comparable CLV'), '', 'renamed');
  assert.equal(stat('Price CLV'), '10.00%', '2.20 booked against a 2.00 close');
  // Close +100 / -120: implied 50% and 54.55%, devigged 47.83% for this side; 2.20 × 0.4783 − 1.
  assert.equal(stat('No-vig CLV'), '5.22%');
  const lone = load(ledgerFor({ ...state, bets: [settled('price-only', {})] }).render('performance'));
  assert.equal(lone('.evl-stats span').filter((_, item) => lone(item).text() === 'No-vig CLV').length, 0, 'hidden without the other side’s close');
});
