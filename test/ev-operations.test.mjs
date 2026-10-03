import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createEvOperations } from '../public/ev-operations.js';

const NOW = Date.parse('2026-10-03T06:17:08Z');
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
// Feed prices as the page holds them after a sync (source 'local-api', the feed's own side and event text).
const feedQuote = (id, book, extra = {}) => ({ id, sport: 'NFL', event: 'IND Colts @ WAS Commanders', displayEvent: 'Indianapolis Colts @ Washington Commanders', market: 'moneyline', displayMarket: 'Moneyline', type: 'moneyline', line: '', side: 'away', selection: 'IND Colts', book, odds: -208, live: false, ts: at(1), source: 'local-api', ...extra });
const STATUS = { datasets: {
  fanduel: { status: 'ok', last_update: '2026-10-03T06:16:28+00:00', items: 268, anomaly: null },
  oddsjam: { status: 'degraded', last_update: '2026-10-03T06:16:29+00:00', items: 53, anomaly: 'Item count dropped from ~456 to 53 (89% below average)' },
  dk_pick6: { status: 'error', last_update: '2026-10-03T06:15:28+00:00', items: 0, anomaly: null },
  caesars: { status: 'idle', last_update: '', items: 0 },
}, total_quotes: 29329, total_props: 27970, total_contracts: 932, total_matches: 1242 };

function browser(t, respond) {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const panel = { innerHTML: '' }, requests = [];
  const saved = { fetch: globalThis.fetch, document: globalThis.document };
  globalThis.fetch = async url => { requests.push(String(url)); return respond(); };
  globalThis.document = { querySelector: selector => selector.includes('data-evx-feed-status') ? panel : null };
  t.after(() => Object.assign(globalThis, saved));
  return { panel, requests, settle: () => new Promise(resolve => setImmediate(resolve)) };
}
const operationsFor = state => createEvOperations({ getState: () => state, save() {}, redraw() {}, navigate() {} });

test('connection readiness reports the live quote feed instead of "awaiting integration"', async t => {
  const page = browser(t, () => new Response(JSON.stringify(STATUS)));
  const quotes = [feedQuote('q1', 'DraftKings', { betUrl: 'https://sportsbook.example/bet' }), feedQuote('q2', 'Novig', { exchange: true }), feedQuote('q3', 'FanDuel', { live: true, ts: at(0.5) })];
  const state = { quotes, dfs: [], apiSyncedAt: at(0.2), suite: { settings: {} } };
  const $ = load(operationsFor(state).render('connections'));
  const status = name => $('td').filter((_, cell) => $(cell).find('strong').text() === name).parent().find('td').last().text();
  assert.match(status('Odds and game state'), /^Connected3 feed prices, 1 live · synced/);
  assert.match(status('Exchanges and smart money'), /^Connected1 exchange prices/);
  assert.match(status('Bet links'), /^Connected1 feed prices carry a sportsbook link/);
  assert.match(status('Fantasy'), /^Connected/);
  for (const name of ['Wallet activity', 'Lineup announcements', 'Results and grading', 'Affiliates and payouts', 'Desktop / mobile push', 'Discord alerts', 'Native mobile apps']) assert.equal(status(name), 'Awaiting integration', name);
  assert.equal(status('Authentication'), 'Uses app account services');
  // Coverage: feed prices, and the latest observation per book is a date, not "—".
  assert.equal($('.evx-stats div').filter((_, item) => $(item).find('span').text() === 'Feed prices').find('strong').text(), '3');
  assert.equal($('.evx-stats span').filter((_, item) => /Entered/.test($(item).text())).length, 0);
  const coverage = $('th').filter((_, cell) => $(cell).text() === 'Latest observation').closest('table');
  assert.ok(coverage.find('tbody tr').toArray().every(row => $(row).find('td').last().text() !== '—'));
  // Per-source status from GET /api/ev/status fills its panel when it answers.
  assert.equal($('[data-evx-feed-status]').text(), 'Checking the quote feed…');
  await page.settle();
  assert.deepEqual(page.requests, ['/api/ev/status']);
  const sources = load(page.panel.innerHTML);
  assert.deepEqual(sources('tbody tr').toArray().map(row => sources(row).find('td').eq(0).text()), ['dk_pick6', 'oddsjam', 'fanduel', 'caesars'], 'errors and degraded sources first');
  assert.match(sources('tbody tr').eq(1).text(), /Degraded.*89% below average/);
  assert.match(sources('tbody tr').eq(3).text(), /Idle \(not collecting\)0—/);
  assert.match(sources.text(), /29,329 \/ 27,970 \/ 932/);
  // A redraw within the minute doesn't fetch again, and shows the result directly.
  const ops = operationsFor(state);
  ops.render('connections'); await page.settle();
  assert.equal(page.requests.length, 2, 'a new workspace instance checks once');
  const redrawn = load(ops.render('connections')); await page.settle();
  assert.equal(page.requests.length, 2, 'at most once a minute');
  assert.equal(redrawn('[data-evx-feed-status] tbody tr').length, 4);
});

test('an unavailable status check says so and offers to check again', async t => {
  const page = browser(t, () => new Response(JSON.stringify({ error: 'The quote source is unavailable right now. Prices refresh automatically when it recovers.' }), { status: 503 }));
  operationsFor({ quotes: [], dfs: [], suite: { settings: {} } }).render('connections');
  await page.settle();
  const panel = load(page.panel.innerHTML);
  assert.match(panel.text(), /Source status is unavailable right now\. The quote source is unavailable/);
  assert.equal(panel('[data-evx-action="refresh-status"]').text(), 'Check again');
});

test('the latest observation of a book with 200k prices renders (no spread into Math.max)', t => {
  browser(t, () => new Response(JSON.stringify(STATUS)));
  const quotes = Array.from({ length: 200_000 }, (_, index) => feedQuote(`q${index}`, 'Big Book', { ts: at(index % 10) }));
  const $ = load(operationsFor({ quotes, dfs: [], apiSyncedAt: at(0), suite: { settings: {} } }).render('connections'));
  const row = $('td').filter((_, cell) => $(cell).text() === 'Big Book').parent();
  assert.equal(row.find('td').eq(1).text(), '200000');
  assert.equal(row.find('td').last().text(), new Date(NOW).toLocaleString());
});

test('wallet positions and lineup changes link feed prices recorded with the team and game as shown', t => {
  browser(t, () => new Response(JSON.stringify(STATUS)));
  const quotes = [feedQuote('dk', 'DraftKings'), feedQuote('sb', 'theScore Bet', { event: 'Colts @ Commanders', selection: 'Indianapolis Colts', odds: -200 }), feedQuote('home', 'DraftKings', { side: 'home', selection: 'WAS Commanders', odds: 170 })];
  const entry = { id: 'e1', walletId: 'w1', kind: 'position', sport: 'NFL', event: 'Indianapolis Colts @ Washington Commanders', market: 'Moneyline', selection: 'Indianapolis Colts', line: null, quantity: 10, price: 40, sample: 'forward', phase: 'pregame', ts: at(0) };
  const prop = feedQuote('prop', 'FanDuel', { type: 'prop', market: 'Hits', displayMarket: 'Hits', player: 'Drake Baldwin', side: 'over', selection: 'Over', line: 2.5, odds: 120, ts: at(5) });
  const lineup = { id: 'l1', sport: 'NFL', event: 'Indianapolis Colts @ Washington Commanders', player: 'Drake Baldwin', market: 'Hits', selection: 'Over', line: 2.5, previous: '5', next: '2', status: 'moved', ts: at(1), sourceUrl: 'https://example.test/lineups' };
  const state = { quotes: [...quotes, prop], dfs: [], suite: { settings: {}, operations: { wallets: [{ id: 'w1', name: 'Wallet' }], entries: [entry], lineups: [lineup] } } };
  const ops = operationsFor(state);
  const wallets = load(ops.render('wallets'));
  assert.deepEqual(wallets('[data-detail]').toArray().map(button => wallets(button).attr('data-detail')), ['dk', 'sb'], 'both books, not the other side');
  const lineups = load(ops.render('lineups'));
  assert.equal(lineups('.evx-stats div').filter((_, item) => lineups(item).find('span').text() === 'Quotes before news').find('strong').text(), '1');
});
