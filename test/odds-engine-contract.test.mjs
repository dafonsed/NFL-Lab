import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSnapshot, quoteStatus, expiresAt, pricingApplied, ARB_SANITY_LIMIT } from '../lib/odds/engine.mjs';
import { normalizeFeed } from '../lib/odds/normalize.mjs';
import { pricingSettings } from '../public/odds-contract.js';
import { implied, decimal, devig, constrainedArb } from '../public/betting-math.js';
import { fixtureRecords } from './fixtures/odds-feed.mjs';

// The engine's output is the /api/odds contract: per-quote fields and analytics sections.
const now = Date.now(), feed = normalizeFeed(fixtureRecords({ now }), { syncedAt: new Date(now).toISOString(), price: false });
const analysis = analyzeSnapshot(feed.quotes, pricingSettings({}), { now });
const find = (book, event, type, side, extra = () => true) => feed.quotes.find(q => q.book === book && q.event.includes(event) && q.type === type && q.side === side && extra(q));

test('every quote carries its implied probability, its book’s own no-vig split and hold, and when it stops being current', () => {
  const pinnacle = find('Pinnacle', 'Saints', 'moneyline', 'home'), other = find('Pinnacle', 'Saints', 'moneyline', 'away');
  const fields = analysis.fields(pinnacle);
  assert.ok(Math.abs(fields.impliedProbability - implied(pinnacle.odds)) < 1e-5);
  const own = devig([implied(pinnacle.odds), implied(other.odds)], 'multiplicative');
  assert.ok(Math.abs(fields.bookFairProbability - own[0]) < 1e-5);
  assert.ok(Math.abs(fields.bookHold - (implied(pinnacle.odds) + implied(other.odds) - 1)) < 1e-5);
  assert.equal(fields.status, 'open');
  assert.equal(fields.expiresAt, new Date(Date.parse(pinnacle.ts) + 900_000).toISOString(), 'pregame prices last 15 minutes');
  assert.equal(fields.consistent, true);
  assert.equal(fields.marketKey, analysis.fields(other).marketKey, 'both sides of one market share its key');
  const live = feed.quotes.find(q => q.live);
  assert.equal(analysis.fields(live).expiresAt, new Date(Date.parse(live.ts) + 90_000).toISOString(), 'live prices last 90 seconds');
  // A member's own price ages are part of the pricing request.
  const longer = analyzeSnapshot(feed.quotes, pricingSettings({ pregameMaxAgeSeconds: 3600 }), { now });
  assert.equal(longer.fields(pinnacle).expiresAt, new Date(Math.min(Date.parse(pinnacle.ts) + 3_600_000, Date.parse(pinnacle.startTime))).toISOString());
});

test('status says whether a price is offered now; a pregame price never outlives its game’s start', () => {
  const base = { sport: 'NFL', event: 'A @ B', market: 'moneyline', side: 'home', book: 'X', odds: 110, ts: new Date(now - 60_000).toISOString(), startTime: new Date(now + 3_600_000).toISOString() };
  assert.equal(quoteStatus(base, {}, now), 'open');
  assert.equal(quoteStatus({ ...base, ts: new Date(now - 1_000_000).toISOString() }, {}, now), 'stale');
  assert.equal(quoteStatus({ ...base, suspended: true }, {}, now), 'suspended');
  assert.equal(quoteStatus({ ...base, startTime: new Date(now - 1000).toISOString() }, {}, now), 'closed');
  assert.equal(quoteStatus({ ...base, gameStatus: 'final' }, {}, now), 'closed');
  assert.equal(quoteStatus({ ...base, ts: 'yesterday' }, {}, now), 'stale', 'no usable observation time');
  assert.equal(expiresAt({ ...base, startTime: new Date(now + 60_000).toISOString() }), new Date(now + 60_000).toISOString());
});

test('pricing rows carry fair probability and odds, EV, the full-Kelly fraction and the devig method and version', () => {
  const caesars = find('Caesars', 'Saints', 'moneyline', 'home');
  const row = analysis.section('pricing').find(item => item.quoteId === caesars.id);
  assert.ok(row.fairProbability > .39 && row.fairProbability < .41);
  assert.ok(Math.abs(row.ev - (row.fairProbability * decimal(caesars.odds) - 1)) < 1e-4, 'EV = fair probability × decimal − 1');
  assert.ok(Math.abs(row.edge - (row.fairProbability - implied(caesars.odds))) < 1e-4);
  assert.ok(row.kellyFraction > 0 && row.kellyFraction < 1);
  assert.equal(row.plausible, true);
  assert.equal(row.devigMethod, 'multiplicative');
  assert.match(row.devigVersion, /^visualodds-devig\//);
  assert.ok(row.references.every(book => book.book !== 'Caesars'), 'the offered book never prices itself');
  const negative = analysis.section('pricing').find(item => item.ev < 0);
  assert.equal(negative.references, undefined, 'reference lists only travel with positive rows');
  assert.deepEqual(pricingApplied({ maxEvPercent: 40 }).evCap, .4, 'a saved maximum EV replaces the caps');
});

test('arbitrage: stake shares pay the same on either outcome; margin and capacity come with them', () => {
  const opportunity = analysis.section('arbitrage')[0];
  const [a, b] = opportunity.legs;
  assert.ok(Math.abs(a.stakeFraction * a.multiplier - b.stakeFraction * b.multiplier) < 1e-6, 'equal payout per unit');
  assert.ok(Math.abs(opportunity.payoutPerUnit - a.stakeFraction * a.multiplier) < 1e-5);
  assert.ok(Math.abs(opportunity.margin - (opportunity.payoutPerUnit - 1)) < 1e-5);
  assert.ok(opportunity.margin > 0 && opportunity.margin <= ARB_SANITY_LIMIT);
  // The split is the shared calculator's (betting-math.js constrainedArb).
  const quotes = opportunity.legs.map(leg => feed.quotes.find(q => q.id === leg.quoteId)), plan = constrainedArb(quotes, 1000);
  assert.ok(Math.abs(plan.fractions[0] - a.stakeFraction) < 1e-6);
  assert.ok(analysis.section('arbitrage').some(item => item.capacity !== null && item.legs.some(leg => leg.liquidity !== null)), 'exchange depth caps a pair’s total stake');
});

test('middles, holds, smart money and hedges come out complete and sorted', () => {
  const middle = analysis.section('middles')[0];
  assert.ok(middle.perUnit.inside > 0 && middle.perUnit.outside < 0, 'both win inside the window; one loses outside');
  assert.ok(middle.ladder.some(point => point.first === 'win' && point.second === 'win'));
  assert.ok(Math.abs(middle.stakeFractions[0] + middle.stakeFractions[1] - 1) < 1e-6);
  const holds = analysis.section('holds');
  assert.ok(holds.every((row, index) => !index || holds[index - 1].hold <= row.hold), 'lowest hold first');
  assert.ok(holds.every(row => Math.abs(row.fairProbabilities[0] + row.fairProbabilities[1] - 1) < 1e-4));
  const sharp = analysis.section('sharp');
  assert.ok(sharp.length > 0 && sharp.every(row => row.liquidity > 0));
  const hedges = analysis.section('hedges');
  assert.ok(hedges.every(row => row.hedges.length >= 1 && row.hedges.length <= 3 && row.hedges.every(hedge => 1 / hedge.impliedSum - 1 <= ARB_SANITY_LIMIT)));
  const markets = analysis.section('markets').filter(market => market.twoWay);
  assert.ok(markets.length > 0 && markets.every(market => market.sides.every(side => side.fairProbability === null || side.fairProbability > 0)));
  const fair = markets.find(market => market.sides.every(side => side.fairProbability !== null));
  assert.ok(Math.abs(fair.sides[0].fairProbability + fair.sides[1].fairProbability - 1) < 1e-4, 'a two-way market’s fair probabilities sum to one');
});

test('the full synthetic slate is priced in reasonable time', () => {
  const big = normalizeFeed(fixtureRecords({ now, games: 120, propsPerGame: 6 }), { syncedAt: new Date(now).toISOString(), price: false });
  const started = performance.now(), result = analyzeSnapshot(big.quotes, pricingSettings({}), { now });
  for (const section of ['pricing', 'markets', 'arbitrage', 'middles', 'holds', 'sharp', 'hedges']) result.section(section);
  const elapsed = performance.now() - started;
  assert.ok(big.quotes.length > 8_000, String(big.quotes.length));
  assert.ok(elapsed < 10_000, `${big.quotes.length} quotes in ${elapsed.toFixed(0)} ms`);
});
