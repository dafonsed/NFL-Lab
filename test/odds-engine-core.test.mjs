import test from 'node:test';
import assert from 'node:assert/strict';
import { consensusPrice, computeAdvancedEv, arbitrageRows, middleRows, sharpMatches, quoteAvailable, groups, analyzeSnapshot } from '../lib/odds/engine.mjs';
import { constrainedArb, decimal } from '../public/betting-math.js';
import { exampleWorkspace } from './fixtures/ev-demo.js';

// The server engine's market analytics (what /api/odds serves); fixtures are the example workspace.
const now = () => Date.now(), available = quote => quoteAvailable(quote, {}, now());

test('consensus prices a selection from the other books’ complete markets', () => {
  const state = exampleWorkspace();
  const offer = state.quotes.find(q => q.book === 'DraftKings' && q.market === 'Game total' && q.line === 44.5 && q.side === 'Over');
  const fair = consensusPrice(offer, state.quotes, { now: now() }).probability;
  assert.ok(fair > .49 && fair < .51, String(fair));
  const rows = computeAdvancedEv(state.quotes, { now: now() });
  assert.ok(rows.some(row => row.quote.id === offer.id && row.ev > 0));
  assert.ok(rows.some(row => row.quote.market === 'Point spread'));
  // A future without every outcome listed has no fair price; a complete 1X2 does.
  const incomplete = [{ ...offer, type: 'future', side: 'Arizona' }, { ...offer, id: 'other', type: 'future', side: 'Seattle' }];
  assert.ok(Number.isNaN(consensusPrice(incomplete[0], incomplete, { now: now() }).probability));
  const threeWay = ['Home', 'Draw', 'Away'].flatMap((side, i) => ['Pinnacle', 'Circa'].map(book => ({ ...offer, id: `${book}-${side}`, event: 'Example soccer', type: 'three-way', line: '', side, book, odds: [180, 220, 160][i] })));
  assert.ok(Number.isFinite(consensusPrice(threeWay[0], threeWay, { now: now() }).probability));
});

test('opposite prices that only break even are not arbitrage', () => {
  const now = Date.now(), ts = new Date(now - 30_000).toISOString(), startTime = new Date(now + 3_600_000).toISOString();
  const side = (book, side, odds) => ({ id: `${book}-${side}`, sport: 'NFL', event: 'A @ B', market: 'moneyline', type: 'moneyline', side, book, odds, ts, startTime });
  // +170 and -170 imply exactly 100% (0.9999999999999999 in floating point).
  const quotes = [side('Caesars', 'home', 170), side('Caesars', 'away', -205), side('FanDuel', 'home', 140), side('FanDuel', 'away', -170)];
  assert.deepEqual(arbitrageRows(quotes, false, { now }), []);
  assert.deepEqual(analyzeSnapshot(quotes, {}, { now }).section('arbitrage'), []);
});

test('arbitrage pairs need different books, and their stake split pays the same either way', () => {
  const state = exampleWorkspace();
  const row = arbitrageRows(state.quotes, false, { now: now() }).find(x => x.best[0].market === 'Game total');
  assert.ok(row);
  assert.notEqual(row.best[0].book, row.best[1].book);
  const plan = constrainedArb(row.best, 100);
  assert.ok(plan.margin > 0);
  assert.ok(Math.abs(plan.stakes[0] * decimal(row.best[0].odds) - plan.stakes[1] * decimal(row.best[1].odds)) < .02);
  const sameBook = [{ ...row.best[0], book: 'Only' }, { ...row.best[1], book: 'Only' }];
  assert.equal(arbitrageRows(sameBook, false, { now: now() }).length, 0);
});

test('live prices expire, and totals and spreads find middles', () => {
  const state = exampleWorkspace();
  assert.ok(computeAdvancedEv(state.quotes, { now: now() }).some(row => row.quote.live));
  const expired = state.quotes.map(q => q.live ? { ...q, ts: new Date(Date.now() - 120_000).toISOString() } : q);
  assert.equal(computeAdvancedEv(expired, { now: now() }).filter(row => row.quote.live).length, 0);
  assert.ok(middleRows(state.quotes, false, { now: now() }).some(x => x.over.line < x.under.line));
  assert.ok(middleRows(state.quotes, false, { now: now() }).some(x => x.kind === 'spread' && x.width > 0));
});

test('smart money returns only the best sportsbook price that improves on the exchange', () => {
  const matches = sharpMatches(exampleWorkspace().quotes, 1000, available);
  const prop = matches.find(x => x.exchange.market === 'Kyler Murray passing yards' && x.exchange.side === 'Over');
  assert.equal(prop.sportsbook.book, 'bet365');
  assert.ok(prop.improvement > 0);
  assert.ok(matches.every(x => !x.opposite || decimal(x.sportsbook.odds) > decimal(x.opposite.odds)));
  assert.ok(groups(exampleWorkspace().quotes).length > 5);
});
