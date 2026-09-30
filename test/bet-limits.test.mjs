import test from 'node:test';
import assert from 'node:assert/strict';
import { limitStatus, limitWarnings, readLimits, weekBounds, writeLimits } from '../public/bet-limits.js';

const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }; };
const now = new Date('2026-09-30T12:00:00Z'); // a Wednesday
const bet = extra => ({ selection: 'x', book: 'FanDuel', sport: 'NFL', type: 'single', status: 'open', date: '2026-09-29', odds: 100, oddsFormat: 'american', stake: 50, ...extra });

test('weeks run Monday to Sunday', () => {
  assert.deepEqual(weekBounds(now), { start: '2026-09-28', end: '2026-10-04' });
});

test('limits round-trip and ignore blanks or non-positive values', () => {
  const storage = memory();
  assert.deepEqual(readLimits(storage), { weeklyStake: null, monthlyLoss: null, pauseUntil: null });
  const saved = writeLimits(storage, { weeklyStake: 200, monthlyLoss: 0, pauseUntil: null });
  assert.deepEqual(saved, { weeklyStake: 200, monthlyLoss: null, pauseUntil: null });
});

test('weekly stake counts cash stakes this week only; free bets are excluded', () => {
  const status = limitStatus([bet(), bet({ stake: 30, freeBet: true }), bet({ date: '2026-09-20', stake: 500 })], { weeklyStake: 60, monthlyLoss: null, pauseUntil: null }, now);
  assert.equal(status.weekStake, 50);
  assert.equal(status.overWeekly, false);
});

test('a new bet that crosses the weekly limit is warned about; one that does not is not', () => {
  const limits = { weeklyStake: 100, monthlyLoss: null, pauseUntil: null };
  assert.equal(limitWarnings([bet()], limits, bet({ stake: 40 }), now).length, 0);
  assert.match(limitWarnings([bet()], limits, bet({ stake: 60 }), now)[0], /past your \$100\.00 weekly limit/);
});

test('monthly losses and an active break both produce reminders', () => {
  const lost = bet({ status: 'lost', stake: 120, date: '2026-09-10' });
  const reasons = limitWarnings([lost], { weeklyStake: null, monthlyLoss: 100, pauseUntil: '2026-10-05T00:00:00Z' }, bet({ stake: 10 }), now);
  assert.equal(reasons.length, 2);
  assert.match(reasons.join(' '), /break until/);
  assert.match(reasons.join(' '), /down \$120\.00 this month/);
});
