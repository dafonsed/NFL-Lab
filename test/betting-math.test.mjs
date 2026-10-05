import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, implied, decimalToAmerican, probabilityToAmerican, fractionalOdds, expectedValue, expectedReturn, kellyFraction, fractionalKellyStake,
  devig, DEVIG_METHODS, fairFromAmerican, boostDecimal, hedgeStake, effectiveDecimal, constrainedArb, promoConversion, parlay, fantasySlip,
  hitDistribution, expectedPayout, breakEven, closingLineValue, priceClv, noVigClv, gradedBet, pearson } from '../public/betting-math.js';

// The one implementation of every betting formula: the server's engine and the browser's calculators both use it.

test('odds conversions round-trip and reject impossible American prices', () => {
  assert.equal(decimal(115), 2.15);
  assert.equal(decimal(-200), 1.5);
  assert.ok(Number.isNaN(decimal(99)) && Number.isNaN(decimal(-99)) && Number.isNaN(decimal('x')));
  assert.equal(implied(-110).toFixed(6), (110 / 210).toFixed(6));
  assert.equal(decimalToAmerican(2.5), 150);
  assert.equal(decimalToAmerican(1.5), -200);
  assert.ok(Number.isNaN(decimalToAmerican(1)));
  // Even money is +100, as books quote it.
  assert.equal(probabilityToAmerican(.5), 100);
  assert.equal(probabilityToAmerican(.4), 150);
  assert.equal(probabilityToAmerican(.6), -150);
  assert.ok(Number.isNaN(probabilityToAmerican(0)) && Number.isNaN(probabilityToAmerican(1)));
  assert.deepEqual(fractionalOdds(2.5), [3, 2]);
  for (const odds of [-450, -110, 100, 145, 900]) assert.equal(decimalToAmerican(decimal(odds)), odds);
});

test('expected value and Kelly use the stated probability and payout', () => {
  assert.ok(Math.abs(expectedValue(.5, 2.1) - .05) < 1e-12);
  assert.ok(Math.abs(expectedReturn(.5, 110) - .05) < 1e-12);
  // A +100 offer at a 60% fair probability has a 20% full Kelly fraction.
  assert.ok(Math.abs(kellyFraction(.6, 2) - .2) < 1e-12);
  assert.equal(kellyFraction(.4, 2), 0, 'no edge, no stake');
  assert.equal(kellyFraction(1, 2), 1);
  assert.ok(Number.isNaN(kellyFraction(1.2, 2)) && Number.isNaN(kellyFraction(.5, 1)));
  assert.ok(Math.abs(fractionalKellyStake(5000, .25, .6, 100) - 250) < 1e-8);
  assert.equal(fractionalKellyStake(5000, .25, .4, 100), 0);
  assert.ok(Number.isNaN(fractionalKellyStake(5000, .25, NaN, 100)));
  assert.ok(Number.isNaN(fractionalKellyStake(5000, 1.2, .6, 100)));
});

test('every devig method returns probabilities that sum to one, and multiplicative keeps each share', () => {
  const book = fairFromAmerican([-140, 118]);
  assert.ok(Math.abs(book.overround - 1.0420) < 1e-4);
  assert.ok(Math.abs(book.fair[0] - .56) < 1e-3 && Math.abs(book.fair[1] - .44) < 1e-3);
  for (const method of DEVIG_METHODS) {
    const fair = devig([implied(-140), implied(118)], method);
    assert.equal(fair.length, 2, method);
    assert.ok(Math.abs(fair[0] + fair[1] - 1) < 1e-8, method);
    assert.ok(fair[0] > .5, method);
  }
  assert.deepEqual(devig([.5], 'multiplicative'), []);
  assert.deepEqual(devig([.6, .5], 'unknown'), []);
});

test('boosts, hedges and commissions use one effective payout', () => {
  assert.equal(boostDecimal(2, 50), 2.5);
  assert.equal(hedgeStake(100, 2.5, 2), 125);
  assert.equal(effectiveDecimal({ odds: 100 }, 50), 2.5);
  assert.equal(effectiveDecimal({ odds: 100, commissionPercent: 2 }), 1.98);
  // An equal split of a 2.10 / 2.10 market pays the same either way.
  const plan = constrainedArb([{ odds: 110 }, { odds: 110 }], 100);
  assert.deepEqual(plan.stakes, [50, 50]);
  assert.ok(plan.margin > 0);
});

test('bonus conversion, fantasy paytables, CLV and parlays use stated payout rules', () => {
  const promo = promoConversion({ stake: 100, promoOdds: 200, hedgeOdds: -110, kind: 'bonus', boost: 0 });
  assert.ok(Math.abs(promo.ifPromoWins - promo.ifHedgeWins) < .0001);
  const slip = fantasySlip([{ probability: .5 }, { probability: .5 }], [0, 0, 3], 10);
  assert.deepEqual(slip.dist, [.25, .5, .25]);
  assert.equal(slip.expectedProfit, -2.5);
  assert.deepEqual(hitDistribution([.5, .5]), [.25, .5, .25]);
  assert.equal(expectedPayout([.25, .5, .25], [0, 0, 3]), .75);
  assert.ok(closingLineValue(115, 105) > 0);
  assert.ok(Math.abs(priceClv(2.15, 2.05) - (2.15 / 2.05 - 1)) < 1e-12);
  assert.ok(Number.isFinite(noVigClv(2.15, 1.91, 1.91)));
  assert.equal(gradedBet({ stake: 10, odds: 150, result: 'win' }), 15);
  assert.equal(pearson([[1, 2], [2, 4], [3, 6]]), 1);
  assert.equal(parlay([{ event: 'one', odds: 110, probability: .5 }]), null);
  assert.ok(parlay([{ event: 'one', odds: 110, probability: .5 }, { event: 'two', odds: 110, probability: .5 }]));
});

test('DFS break-even has one definition for the DFS board and the fantasy lab', () => {
  assert.ok(Math.abs(breakEven([0, 0, 3]) - Math.sqrt(1 / 3)) < 1e-10);
  assert.equal(breakEven(null), null);
  assert.equal(breakEven([0, 1]), null, 'a single pick is not a slip');
  assert.equal(breakEven([0, 0, 1]), null, 'a table that never pays more than the stake can’t break even');
  assert.equal(breakEven([0, 2, 1]), null, 'more hits never pay less');
  assert.equal(breakEven([1.2, 0, 3]), null, 'a table that returns more than the stake with no hits');
});
