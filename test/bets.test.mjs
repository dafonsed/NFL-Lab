import test from 'node:test';
import assert from 'node:assert/strict';
import { BET_STORAGE_KEY, validateBet, betReturns, summarizeBets, readBets, writeBets, betsCsv } from '../public/bet-utils.js';

const ticket = overrides => ({ selection: 'Buffalo −3.5', sport: 'NFL', type: 'single', date: '2026-09-22', book: 'Example book', notes: '', stake: 25, odds: -110, oddsFormat: 'american', status: 'open', ...overrides });

test('American and decimal odds settle at the ticket level, with open stakes unsettled', () => {
  assert.deepEqual(betReturns(ticket()), { potentialProfit: 22.73, potentialReturn: 47.73, returned: null, profit: null });
  assert.equal(betReturns(ticket({ status: 'won' })).profit, 22.73);
  assert.equal(betReturns(ticket({ status: 'won', odds: 150 })).profit, 37.5);
  assert.equal(betReturns(ticket({ status: 'won', oddsFormat: 'decimal', odds: 2.5 })).returned, 62.5);
  assert.equal(betReturns(ticket({ status: 'won', odds: 100 })).profit, 25);
  assert.equal(betReturns(ticket({ status: 'won', odds: -100 })).profit, 25);
  assert.equal(betReturns(ticket({ status: 'lost' })).profit, -25);
  for (const status of ['push', 'void']) assert.equal(betReturns(ticket({ status })).profit, 0);
  assert.equal(betReturns(ticket({ status: 'cashed', cashout: 10 })).profit, -15);
  assert.equal(betReturns(ticket({ status: 'cashed', cashout: 0 })).profit, -25);
});

test('ROI and record exclude open/refunded bets and treat cash-out return as gross', () => {
  const summary = summarizeBets([
    ticket({ status: 'won', odds: 150, stake: 100 }),
    ticket({ status: 'lost', stake: 50 }),
    ticket({ status: 'cashed', stake: 100, cashout: 80 }),
    ticket({ status: 'push', stake: 500 }),
    ticket({ status: 'void', stake: 500 }),
    ticket({ stake: 75 }),
  ]);
  assert.deepEqual(summary, { profit: 80, settledStake: 250, openStake: 75, open: 1, won: 1, lost: 1, roi: 32, winRate: 50 });
  assert.equal(summarizeBets([]).roi, null);
  assert.equal(summarizeBets([ticket()]).winRate, null);
  assert.equal(summarizeBets([ticket({ status: 'push' })]).roi, null);
  assert.equal(summarizeBets([ticket({ status: 'lost', stake: 0.1 }), ticket({ status: 'lost', stake: 0.2 })]).profit, -0.3);
});

test('invalid or incomplete bets cannot enter the ledger', () => {
  for (const bad of [{ stake: '' }, { stake: 0 }, { stake: -10 }, { stake: 1.001 }, { stake: Infinity }, { stake: 1000001 }, { odds: 0 }, { odds: 99 }, { odds: -99 }, { odds: 110.5 }, { oddsFormat: 'decimal', odds: 1 }, { oddsFormat: 'fractional' }, { date: '2026-02-30' }, { date: '' }, { status: 'unknown' }, { selection: ' ' }, { sport: '' }, { type: 'unknown' }, { status: 'cashed', cashout: '' }, { status: 'cashed', cashout: -1 }]) {
    assert.throws(() => validateBet(ticket(bad)), JSON.stringify(bad));
  }
  assert.equal(validateBet(ticket({ selection: '  Buffalo  ', stake: '25.10', odds: '+150' })).stake, 25.1);
  assert.equal(validateBet(ticket({ status: 'cashed', cashout: '0' })).cashout, 0);
  assert.equal(validateBet(ticket({ status: 'open', cashout: 'stale value' })).cashout, null);
});

test('saved records round-trip; unreadable data is preserved and storage errors propagate', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(readBets(storage), []);
  const bets = [{ ...validateBet(ticket()), id: 'test-ticket-1', updatedAt: '2026-09-22T12:00:00.000Z' }];
  writeBets(storage, bets);
  assert.deepEqual(readBets(storage), bets);
  const snapshot = data.get(BET_STORAGE_KEY);
  data.set(BET_STORAGE_KEY, '{broken json');
  assert.throws(() => readBets(storage));
  assert.equal(data.get(BET_STORAGE_KEY), '{broken json');
  data.set(BET_STORAGE_KEY, snapshot.replace('"version":1', '"version":2'));
  assert.throws(() => readBets(storage));
  writeBets(storage, [...bets, ...bets]);
  assert.throws(() => readBets(storage));
  assert.throws(() => writeBets({ getItem() { return null; }, setItem() { throw new Error('Quota exceeded'); } }, bets), /Quota/);
});

test('CSV preserves quotes, notes, and empty open results and neutralizes formulas', () => {
  const csv = betsCsv([ticket({ selection: '=HYPERLINK("example")', notes: 'First leg\nSecond leg, "under"' })]);
  assert.ok(csv.includes('"\'=HYPERLINK(""example"")"'));
  assert.ok(csv.includes('"First leg\nSecond leg, ""under"""'));
  assert.ok(csv.includes('"Open","",""'));
  assert.ok(csv.includes(',-110,"","",25,"Open"'));
  assert.ok(betsCsv([ticket({ status: 'lost' })]).includes(',"Lost",0,-25,'));
});
