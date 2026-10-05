import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBet, closingLineValue, priceClosingLineValue, noVigClosingLineValue, betsCsv } from '../public/bet-utils.js';
import { comparableClv, devig } from '../public/betting-math.js';

const ticket = (extra = {}) => validateBet({ selection: 'Colts +3.5', book: 'FanDuel', sport: 'NFL', type: 'single', status: 'open', date: '2026-10-03', oddsFormat: 'american', odds: 100, stake: 10, closingOdds: -110, ...extra });

test('the tracker and the Performance view share one price CLV definition', () => {
  const bet = ticket();
  const performance = comparableClv({ odds: 100, side: 'home', closeComparable: true, closeOdds: -110 }).price;
  assert.ok(Math.abs(closingLineValue(bet) - performance * 100) < 1e-9);
  assert.equal(priceClosingLineValue, closingLineValue);
  assert.equal(closingLineValue(ticket({ closingOdds: '' })), null);
  // Decimal tickets: booked 2.10 against a 2.00 close is +5% price CLV.
  assert.ok(Math.abs(closingLineValue(ticket({ oddsFormat: 'decimal', odds: 2.1, closingOdds: 2 })) - 5) < 1e-9);
  assert.match(betsCsv([bet]).split('\r\n')[0], /"Price CLV %"/);
});

test('no-vig CLV needs the other side’s close and removes the closing margin', () => {
  assert.equal(noVigClosingLineValue(ticket()), null, 'tracker tickets without the other side show price CLV only');
  const bet = ticket({ closingOdds: -120, closingOtherOdds: 100 });
  assert.equal(bet.closingOtherOdds, 100);
  const fair = devig([120 / 220, 100 / 200])[0];
  assert.ok(Math.abs(noVigClosingLineValue(bet) - (2 * fair - 1) * 100) < 1e-9);
  assert.ok(Math.abs(noVigClosingLineValue(bet, 'additive') - (2 * devig([120 / 220, 100 / 200], 'additive')[0] - 1) * 100) < 1e-9);
  assert.equal('closingOtherOdds' in ticket(), false, 'saved tickets keep their shape when it is not recorded');
  assert.throws(() => ticket({ closingOtherOdds: 50 }), /other side/);
  assert.throws(() => ticket({ closingOdds: '', closingOtherOdds: -110 }), /other side/);
});
