import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createEvMarketViews } from '../public/ev-market-views.js';

const NOW = Date.parse('2026-10-03T06:17:08Z');
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
// A moneyline side at one book; `game` names the event.
const quote = (id, book, game, side, odds, extra = {}) => ({ id, sport: 'NFL', event: `Game ${game}`, market: 'Moneyline', type: 'moneyline', line: '', side, book, odds, live: false, ts: at(1), source: 'local-api', ...extra });
const observation = (q, minutes, odds) => ({ id: `h-${q.id}-${minutes}`, quoteId: q.id, sport: q.sport, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds, ts: at(minutes), source: 'local-api' });
function views(state) {
  return createEvMarketViews({ getState: () => state, save() {}, redraw() {}, navigate() {}, getSettings: () => ({}) });
}

test('Smart Money finds exchange moves and the best same-selection price quickly on a full-size feed', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const quotes = [], history = [];
  // 6,000 games at three books; 2,000 exchange quotes with liquidity and two recorded prices each.
  for (let game = 0; game < 6_000; game += 1) {
    quotes.push(quote(`a${game}`, 'Book A', game, 'home', 120), quote(`b${game}`, 'Book B', game, 'home', game % 2 ? 150 : 130), quote(`c${game}`, 'Book C', game, 'home', 150));
    if (game % 3 === 0) {
      const exchange = quote(`x${game}`, 'Exchange', game, 'home', 110, { exchange: true, liquidity: 5_000 });
      quotes.push(exchange);
      history.push(observation(exchange, 30, 140), observation(exchange, 5, 110));
    }
  }
  history.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const state = { quotes, history, dfs: [], suite: { marketViews: { minimumMovement: 1, signalRange: '6h' } } };
  const started = performance.now();
  const $ = load(views(state).render('smart-signals'));
  const elapsed = performance.now() - started;
  assert.equal($('.evx-signal').length, 2_000);
  assert.ok(elapsed < 3_000, `rendered in ${elapsed.toFixed(0)} ms (the per-candidate scans took minutes)`);
  const first = $('.evx-signal').first();
  assert.match(first.find('.evx-movement').text(), /\+5\.95 pp/, '+140 → +110 is 41.67% → 47.62% implied');
  // Game 0: Book B and Book C both offer +150 (B only on odd games) → the first highest price in feed order wins.
  const better = $('.evx-signal').toArray().map(item => $(item).find('.evx-primary').attr('data-detail'));
  assert.equal(better[0], 'c0', 'Book C +150 beats Book B +130');
  assert.equal(better[1], 'b3', 'Book B +150 is listed before Book C +150');
});

test('the market screen pages market groups and shows more on request', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const quotes = [];
  for (let game = 0; game < 100; game += 1) quotes.push(quote(`a${game}`, 'Book A', game, 'home', 110), quote(`b${game}`, 'Book B', game, 'away', -120));
  const state = { quotes, history: [], dfs: [], suite: {} };
  const screen = views(state);
  let $ = load(screen.render('market-screen'));
  assert.equal($('tbody').length, 40);
  assert.equal($('.evx-pagination span').text(), '40 of 100 markets shown');
  assert.match($('header .evx-title, .evx-title').text(), /200 available quotes/, 'the count covers every market, not the page');
  // Click "Show more" (minimal DOM stand-ins for the browser globals the handler touches).
  const saved = { Element: globalThis.Element, document: globalThis.document, window: globalThis.window };
  class FakeElement { constructor(action) { this.dataset = { evxAction: action }; } closest(selector) { return selector === '[data-evx-action]' ? this : null; } matches() { return false; } hasAttribute() { return false; } }
  Object.assign(globalThis, { Element: FakeElement, document: { querySelectorAll: () => [], querySelector: () => null, activeElement: null }, window: { scrollY: 0, scrollTo() {} } });
  try { assert.equal(screen.handleEvent({ type: 'click', target: new FakeElement('screen-more') }), true); }
  finally { Object.assign(globalThis, saved); }
  $ = load(screen.render('market-screen'));
  assert.equal($('tbody').length, 80);
  assert.equal($('.evx-pagination [data-evx-action="screen-more"]').text(), 'Show 20 more markets');
});

test('line history offers only selections with recorded observations, defaulting to the most observed', t => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const quotes = Array.from({ length: 500 }, (_, game) => quote(`a${game}`, 'Book A', game, 'home', 110));
  const history = [observation(quotes[7], 50, 100), observation(quotes[3], 40, 120), observation(quotes[3], 20, 115), observation(quotes[3], 10, 110)];
  const state = { quotes, history, dfs: [], suite: {} };
  let $ = load(views(state).render('history'));
  const options = $('[data-evx-field="historySelection"] option');
  assert.equal(options.length, 2, 'not one option per feed quote');
  assert.match(options.first().text(), /Game 3/);
  assert.equal(options.first().attr('selected'), 'selected');
  assert.equal($('.evx-records summary').first().text(), 'Recorded observations · 3');
  // A saved selection whose quote has no history yet stays selected.
  const keep = load(views({ ...state, history: [] }).render('history'))('[data-evx-field="historySelection"] option');
  assert.equal(keep.length, 1);
  assert.equal(keep.attr('value'), '', 'nothing recorded yet');
  state.suite.marketViews = { historySelection: options.eq(1).attr('value') };
  $ = load(views(state).render('history'));
  assert.match($('[data-evx-field="historySelection"] option[selected]').text(), /Game 7/);
});
