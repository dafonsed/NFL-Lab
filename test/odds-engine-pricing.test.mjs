import test from 'node:test';
import assert from 'node:assert/strict';
import { consensusPrice, computeAdvancedEv, quoteAvailable, marketFairPrice, evCapFor, EV_SANITY_LIMIT, EV_SINGLE_BOOK_LIMIT,
  SHARP_MAX_VIG_PERCENT, MIN_EXCHANGE_IMPLIED_SUM, BOOK_WEIGHTS } from '../lib/odds/engine.mjs';
import { devig, priceClv, noVigClv, comparableClv, performanceSummary } from '../public/betting-math.js';

test('operator book weights give Kalshi 50', () => {
  assert.equal(BOOK_WEIGHTS.kalshi, 50);
});

test('operator book weights give Kalshi 50', () => {
  assert.equal(BOOK_WEIGHTS.kalshi, 50);
});

// Fixed clock: every quote is a minute old and the game starts the next day.
const now = Date.parse('2026-10-03T06:00:00Z');
const ts = new Date(now - 60_000).toISOString(), start = '2026-10-04T17:00:00.000Z';
const hours = value => new Date(Date.parse(start) + value * 3600_000).toISOString();
const quote = (book, side, odds, extra = {}) => ({ id: `${book}-${side}`, sport: 'NFL', event: 'A @ B', eventId: 'NFL:a @ b', market: 'moneyline',
  marketId: 'moneyline|NFL:a @ b', type: 'moneyline', side, selection: side, book, odds, ts, startTime: start, ...extra });
const pair = (book, home, away, extra = {}) => [quote(book, 'home', home, extra), quote(book, 'away', away, extra)];
const fairOf = (home, away, method = 'multiplicative') => devig([home, away].map(odds => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100)), method)[0];
const books = result => result.books.map(book => book.book);

test('references from another game filed under the same name are left out', () => {
  const offered = quote('FanDuel', 'home', 150);
  const lateGame = pair('DraftKings', -120, 100, { startTime: hours(5) });
  assert.ok(Number.isNaN(consensusPrice(offered, [offered, ...lateGame], { now }).probability), 'a start 5 hours away is another game');
  const sameGame = pair('DraftKings', -120, 100, { startTime: hours(2) });
  assert.deepEqual(books(consensusPrice(offered, [offered, ...sameGame], { now })), ['DraftKings']);
  // An unknown start can't prove a different game.
  const unknown = pair('DraftKings', -120, 100, { startTime: undefined });
  assert.deepEqual(books(consensusPrice({ ...offered, startTime: undefined }, [...unknown], { now })), ['DraftKings']);
});

test('a book is never priced against mirrors of its own platform', () => {
  const offered = quote('BetRivers', 'home', 150, { priceFamily: 'Bally Bet' });
  const mirrors = [...pair('Bally Bet', -120, 100), ...pair('Desert Diamond Sports', -120, 100, { priceFamily: 'Bally Bet' })];
  const alone = consensusPrice(offered, [offered, ...mirrors], { now });
  assert.ok(Number.isNaN(alone.probability));
  assert.equal(alone.reason, 'Too few complete qualifying reference books.');
  const withOther = consensusPrice(offered, [offered, ...mirrors, ...pair('DraftKings', -150, 130)], { now });
  assert.deepEqual(books(withOther), ['DraftKings']);
  assert.ok(Math.abs(withOther.probability - fairOf(-150, 130)) < 1e-12);
  // The batch path (market index) applies the same rule.
  const row = computeAdvancedEv([offered, ...mirrors, ...pair('DraftKings', -150, 130)], { now, minEvPercent: null }).find(item => item.quote === offered);
  assert.deepEqual(books(row.consensus), ['DraftKings']);
});

test('the default sharp weight applies only to a low-margin market and never over saved book rules', () => {
  const offered = quote('FanDuel', 'home', 150);
  const weightOf = (rows, settings = {}) => consensusPrice(offered, [offered, ...rows], { now, ...settings }).books.find(book => book.book === 'Pinnacle').weight;
  assert.equal(SHARP_MAX_VIG_PERCENT, 6);
  assert.equal(weightOf(pair('Pinnacle', -105, -105)), 100, '2.4% margin is a sharp price');
  assert.equal(weightOf(pair('Pinnacle', -125, -125)), 25, 'an 11% MMA-style hold is capped at the recreational weight');
  assert.equal(weightOf(pair('Pinnacle', -125, -125), { bookRules: [{ book: 'Pinnacle', weight: 2 }] }), 2, 'saved weights are used as entered');
  const mixed = consensusPrice(offered, [offered, ...pair('Pinnacle', -125, -125), ...pair('DraftKings', -150, 130)], { now });
  assert.ok(Math.abs(mixed.probability - (fairOf(-125, -125) + fairOf(-150, 130)) / 2) < 1e-12, 'a wide Pinnacle market caps at the same weight as DraftKings (25): a 1:1 ratio');
});

test('an exchange pair implying well under 100% is not a reference market', () => {
  const offered = quote('FanDuel', 'home', 150);
  assert.equal(MIN_EXCHANGE_IMPLIED_SUM, 0.98);
  const loose = pair('Novig', 150, 150, { exchange: true });
  assert.ok(Number.isNaN(consensusPrice(offered, [offered, ...loose], { now }).probability), '+150 / +150 implies 80%');
  const tight = pair('Novig', -102, -102, { exchange: true });
  assert.deepEqual(books(consensusPrice(offered, [offered, ...tight], { now })), ['Novig']);
});

test('quote availability tolerates clock skew and unknown exchange depth', () => {
  const base = quote('FanDuel', 'home', 150);
  assert.equal(quoteAvailable({ ...base, ts: new Date(now + 3000).toISOString() }, {}, now), true, 'three seconds ahead is clock skew');
  assert.equal(quoteAvailable({ ...base, ts: new Date(now + 10_000).toISOString() }, {}, now), false);
  const exchange = { ...base, book: 'Novig', exchange: true };
  assert.equal(quoteAvailable(exchange, {}, now), true, 'no liquidity field means unknown, not empty');
  assert.equal(quoteAvailable({ ...exchange, liquidity: 0 }, {}, now), true, 'no configured minimum');
  assert.equal(quoteAvailable({ ...exchange, liquidity: 200 }, { minLiquidity: 500 }, now), false, 'known depth below the minimum');
  assert.equal(quoteAvailable({ ...exchange, liquidity: 800 }, { minLiquidity: 500 }, now), true);
  assert.equal(quoteAvailable({ ...exchange, liquidity: -5 }, {}, now), false, 'negative depth is invalid');
});

test('EV sanity caps are shared: 25%, 10% with one reference book, none with a saved maximum', () => {
  const row = count => ({ consensus: { books: Array.from({ length: count }, (_, index) => ({ book: String(index) })) } });
  assert.equal(EV_SANITY_LIMIT, .25); assert.equal(EV_SINGLE_BOOK_LIMIT, .10);
  assert.equal(evCapFor(row(1), { maxEvPercent: null }), .10);
  assert.equal(evCapFor(row(0), {}), .10);
  assert.equal(evCapFor(row(3), { maxEvPercent: '' }), .25);
  assert.equal(evCapFor(row(3), { maxEvPercent: 40 }), Infinity);
});

test('the market fair price counts every complete book, the offered one included, and needs every outcome', () => {
  const rows = [...pair('FanDuel', -150, 130), ...pair('BetRivers', -120, 100, { priceFamily: 'Kambi' }), ...pair('Desert Diamond Sports', -120, 100, { priceFamily: 'Kambi' })];
  const fair = marketFairPrice(rows[0], rows, { now });
  assert.ok(Math.abs(fair.probability - fairOf(-150, 130)) < 1e-12, 'only listed books count (BetRivers/Desert Diamond weight 0)');
  assert.ok(Math.abs(marketFairPrice(rows[0], rows, { now, devigMethod: 'additive' }).probability - fairOf(-150, 130, 'additive')) < 1e-12);
  const threeWay = (book, side, odds) => quote(book, side, odds, { type: 'three-way', outcomes: 3, marketId: 'three-way|NFL:a @ b' });
  const twoOfThree = [threeWay('FanDuel', 'home', 150), threeWay('FanDuel', 'away', 180), threeWay('Pinnacle', 'home', 160), threeWay('Pinnacle', 'away', 170)];
  assert.ok(Number.isNaN(marketFairPrice(twoOfThree[0], twoOfThree, { now }).probability), 'a 1X2 without the draw has no fair price');
});

test('CLV: price CLV keeps the vig, no-vig CLV prices the bet at the close’s fair probability', () => {
  assert.ok(Math.abs(priceClv(2, 1.9) - (2 / 1.9 - 1)) < 1e-12);
  assert.ok(Math.abs(noVigClv(2, 1.9, 2) - (2 * devig([1 / 1.9, 1 / 2])[0] - 1)) < 1e-12);
  assert.ok(Number.isNaN(noVigClv(2, 1.9, undefined)));
  const open = quote('FanDuel', 'home', 100), closeTs = new Date(Date.parse(start) - 60_000).toISOString();
  const bet = { id: 'b1', stake: 10, result: 'win', odds: 100, quote: open,
    closeQuote: { ...open, odds: -110, ts: closeTs }, closeOtherQuote: { ...quote('FanDuel', 'away', -110), ts: closeTs } };
  const clv = comparableClv(bet);
  assert.ok(Math.abs(clv.price - (2 / (1 + 100 / 110) - 1)) < 1e-12, 'beat a -110 close at +100: about +4.8% price CLV');
  assert.ok(Math.abs(clv.noVig) < 1e-12, 'a -110 / -110 close is a coin flip, so +100 had no no-vig edge');
  assert.ok(Number.isNaN(comparableClv({ ...bet, closeOtherQuote: undefined }).noVig), 'no other side, no no-vig CLV');
  // Flat closing fields (tracker rows) carry the other side as closeOtherOdds.
  const flat = comparableClv({ odds: 100, side: 'home', closeComparable: true, closeOdds: -110, closeOtherOdds: -110 });
  assert.ok(Math.abs(flat.noVig) < 1e-12);
  const summary = performanceSummary([bet, { ...bet, id: 'b2', closeOtherQuote: undefined }]);
  assert.equal(summary.averageClv, summary.averagePriceClv);
  assert.ok(Math.abs(summary.averagePriceClv - clv.price) < 1e-12);
  assert.ok(Math.abs(summary.averageNoVigClv) < 1e-12);
  assert.equal(summary.noVigClvCount, 1);
});
