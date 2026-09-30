// Personal betting limits for the tracker. These are self-set reminders: VisualOdds cannot
// stop a bet at a sportsbook, so the tracker warns before recording a bet past a limit and
// shows progress against each limit. A break timer adds a reminder until it ends.
import { betReturns } from './bet-utils.js?v=4';

export const LIMITS_KEY = 'vo-bet-limits-v1';

export function readLimits(storage) {
  try {
    const saved = JSON.parse(storage.getItem(LIMITS_KEY) || '{}');
    return {
      weeklyStake: Number(saved.weeklyStake) > 0 ? Number(saved.weeklyStake) : null,
      monthlyLoss: Number(saved.monthlyLoss) > 0 ? Number(saved.monthlyLoss) : null,
      pauseUntil: typeof saved.pauseUntil === 'string' && Number.isFinite(Date.parse(saved.pauseUntil)) ? saved.pauseUntil : null,
    };
  } catch { return { weeklyStake: null, monthlyLoss: null, pauseUntil: null }; }
}

export function writeLimits(storage, limits) {
  const clean = {
    ...(limits.weeklyStake > 0 ? { weeklyStake: Math.round(limits.weeklyStake * 100) / 100 } : {}),
    ...(limits.monthlyLoss > 0 ? { monthlyLoss: Math.round(limits.monthlyLoss * 100) / 100 } : {}),
    ...(limits.pauseUntil ? { pauseUntil: limits.pauseUntil } : {}),
  };
  storage.setItem(LIMITS_KEY, JSON.stringify(clean));
  return readLimits(storage);
}

const dayKey = date => date.toISOString().slice(0, 10);
/** Monday-based week containing `now`, as YYYY-MM-DD bounds (inclusive). */
export function weekBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return { start: dayKey(start), end: dayKey(end) };
}

/** Totals against each limit. Free bets risk no cash, so they do not count toward stake. */
export function limitStatus(bets, limits, now = new Date()) {
  const week = weekBounds(now), month = dayKey(now).slice(0, 7);
  let weekStake = 0, monthProfit = 0;
  for (const bet of bets) {
    if (bet.date >= week.start && bet.date <= week.end && !bet.freeBet) weekStake += Number(bet.stake) || 0;
    if (bet.date.startsWith(month) && bet.status !== 'open') monthProfit += betReturns(bet).profit || 0;
  }
  const monthLoss = Math.max(0, -monthProfit);
  const paused = !!limits.pauseUntil && Date.parse(limits.pauseUntil) > now.getTime();
  return {
    weekStake: Math.round(weekStake * 100) / 100, monthLoss: Math.round(monthLoss * 100) / 100,
    weeklyStake: limits.weeklyStake, monthlyLoss: limits.monthlyLoss, pauseUntil: paused ? limits.pauseUntil : null,
    overWeekly: limits.weeklyStake != null && weekStake >= limits.weeklyStake,
    overMonthly: limits.monthlyLoss != null && monthLoss >= limits.monthlyLoss,
  };
}

/** Reasons a new ticket would cross a limit (empty when it would not). */
export function limitWarnings(bets, limits, bet, now = new Date()) {
  const reasons = [];
  const status = limitStatus(bets, limits, now), week = weekBounds(now);
  if (status.pauseUntil) reasons.push(`You set a break until ${new Date(status.pauseUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`);
  if (limits.weeklyStake != null && !bet.freeBet && bet.date >= week.start && bet.date <= week.end && status.weekStake + Number(bet.stake) > limits.weeklyStake) {
    reasons.push(`This bet takes this week's stakes to $${(status.weekStake + Number(bet.stake)).toFixed(2)}, past your $${limits.weeklyStake.toFixed(2)} weekly limit.`);
  }
  if (status.overMonthly) reasons.push(`You are down $${status.monthLoss.toFixed(2)} this month, past your $${limits.monthlyLoss.toFixed(2)} monthly loss limit.`);
  return reasons;
}
