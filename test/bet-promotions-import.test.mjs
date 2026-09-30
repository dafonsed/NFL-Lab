import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBet, betReturns, summarizeBets, betsCsv, parseBetsCsv } from '../public/bet-utils.js';

const base = { selection: 'Bills -3.5', book: 'FanDuel', market: 'Spread', sport: 'NFL', type: 'single', status: 'won', date: '2026-09-20', odds: 100, oddsFormat: 'american', stake: '50' };

test('a profit boost raises winnings; the stake is unchanged', () => {
  const bet = validateBet({ ...base, boost: '25' });
  assert.equal(bet.boost, 25);
  const result = betReturns(bet);
  assert.equal(result.potentialProfit, 62.5, '$50 at +100 wins $50, boosted 25% to $62.50');
  assert.equal(result.profit, 62.5);
});

test('a free bet returns only winnings, costs nothing when it loses and stays out of ROI stake', () => {
  const won = validateBet({ ...base, freeBet: true });
  assert.equal(betReturns(won).returned, 50, 'the $50 token is not returned');
  assert.equal(betReturns(won).profit, 50);
  const lost = validateBet({ ...base, freeBet: true, status: 'lost' });
  assert.equal(betReturns(lost).profit, 0, 'losing a free bet costs no cash');
  const summary = summarizeBets([won, lost]);
  assert.equal(summary.profit, 50);
  assert.equal(summary.settledStake, 0);
});

test('boosts outside 0-500% are rejected', () => {
  assert.throws(() => validateBet({ ...base, boost: '900' }), /boost/);
});

test('an exported file imports back to the same tickets', () => {
  const bets = [validateBet({ ...base, boost: '10' }), validateBet({ ...base, selection: '=HYPERLINK("x")', status: 'lost', freeBet: true, odds: -110 })];
  let n = 0;
  const { bets: imported, errors } = parseBetsCsv(betsCsv(bets), { idFactory: () => 'id-' + ++n, now: () => '2026-09-29T00:00:00.000Z' });
  assert.deepEqual(errors, []);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].boost, 10);
  assert.equal(imported[1].freeBet, true);
  assert.equal(imported[1].odds, -110);
  assert.equal(imported[1].selection, '=HYPERLINK("x")', 'the export formula guard is removed on import, the text survives');
  assert.equal(imported[1].status, 'lost');
});

test('sportsbook-style history maps common column names and reports bad rows', () => {
  const csv = 'Placed,League,Selection,Book,Price,Risk,Outcome\n9/21/2026,NBA,Lakers ML,DraftKings,+150,$20.00,Win\n9/22/2026,NBA,Bad row,DraftKings,+50,$20,Loss\n';
  const { bets, errors } = parseBetsCsv(csv, { idFactory: () => 'x', now: () => '2026-09-29T00:00:00.000Z' });
  assert.equal(bets.length, 1);
  assert.equal(bets[0].date, '2026-09-21');
  assert.equal(bets[0].status, 'won');
  assert.equal(bets[0].stake, 20);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Row 3:/);
});

test('files without the required columns are refused before any row is read', () => {
  const { bets, errors } = parseBetsCsv('Date,Team\n2026-09-01,Bills\n');
  assert.equal(bets.length, 0);
  assert.match(errors[0], /Missing required columns/);
});
