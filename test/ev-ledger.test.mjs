import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createEvLedger } from '../public/ev-ledger.js';
import { priced } from './helpers/priced.mjs';

const NOW = Date.parse('2026-10-03T06:17:08Z');
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const quote = (id, book, game, side, odds, extra = {}) => ({ id, sport: 'NFL', event: `Game ${game}`, market: 'Moneyline', type: 'moneyline', line: '', side, book, odds, live: false, ts: at(2), source: 'local-api', ...extra });
// Legacy workspace bets (the ledger's second record source) carry their quote snapshot directly.
const tracked = (id, snapshot, extra = {}) => ({ id, selection: `${snapshot.event} ${snapshot.side}`, stake: 10, odds: snapshot.odds, book: snapshot.book, sport: 'NFL', date: '2026-10-02', status: 'open', quoteSnapshots: [snapshot], ...extra });
const ledgerFor = state => createEvLedger({ getState: () => state, save() {}, redraw() {}, navigate() {}, getSettings: () => ({ devigMethod: 'multiplicative' }) });

test('tracked bets show their selection’s current price and the odds service’s fair value', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  // A selection keeps its id across price updates; each update is served with its pricing.
  const feed = (repriced = -102) => {
    const quotes = [];
    for (let game = 0; game < 1_000; game += 1) for (const [book, home, away] of [['Book A', -110, -110], ['Book B', -105, -115], ['Book C', -120, 100], ['Book D', 105, -125]]) {
      quotes.push(quote(`${book}-${game}-h`, book, game, 'home', book === 'Book A' && game === 0 ? repriced : home), quote(`${book}-${game}-a`, book, game, 'away', away));
    }
    return priced(quotes, { now: NOW });
  };
  const bets = Array.from({ length: 40 }, (_, index) => tracked(`bet-${index}`, quote(`Book A-${index}-h`, 'Book A', index, 'home', -110, { ts: at(30) })));
  const served = feed(), state = { quotes: served.quotes, analytics: served.analytics, bets, suite: { ledger: { filters: { source: 'legacy' } } } };
  const ledger = ledgerFor(state);
  const started = performance.now();
  let $ = load(ledger.render('tracker'));
  const elapsed = performance.now() - started;
  const current = $('tbody tr').toArray().map(row => $(row).find('small').filter((_, item) => /^Current/.test($(item).text())).text());
  assert.equal(current.length, 40);
  const fair = served.analytics.pricingOf(served.analytics.byId.get('Book A-0-h')).fairProbability;
  assert.equal(current[0], `Current -102 · Fair ${(fair * 100).toFixed(2)}%`, 'the repriced Book A price with the server’s fair value');
  assert.match(current[1], /^Current -110 · Fair/);
  assert.ok(elapsed < 3_000, `rendered in ${elapsed.toFixed(0)} ms`);
  // The next update replaces the prices and their pricing.
  const next = feed(110);
  Object.assign(state, { quotes: next.quotes, analytics: next.analytics });
  $ = load(ledger.render('tracker'));
  assert.match($('tbody tr').first().text(), /Current \+110/);
  // A price past its expiry time isn't shown as current.
  Object.assign(state, { quotes: next.quotes.map(item => ({ ...item, status: 'stale' })) });
  state.analytics = priced(state.quotes.map(({ status, ...item }) => ({ ...item, ts: at(60) })), { now: NOW }).analytics;
  $ = load(ledger.render('tracker'));
  assert.doesNotMatch($('tbody tr').first().text(), /Current/);
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
