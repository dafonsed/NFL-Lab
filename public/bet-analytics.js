import { betReturns, summarizeBets } from './bet-utils.js?v=4';

export function shiftMonth(month, delta) {
  const [year, index] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, index - 1 + delta, 1));
  return next.toISOString().slice(0, 7);
}

export function monthAnalytics(bets, month) {
  const tickets = bets.filter(bet => bet.date.slice(0, 7) === month);
  const [year, index] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const days = Array.from({ length }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const rows = tickets.filter(bet => bet.date === date);
    return { date, day: i + 1, count: rows.length, settled: rows.filter(bet => bet.status !== 'open').length, ...summarizeBets(rows) };
  });
  let runningCents = 0;
  const cumulative = days.map(day => {
    runningCents += Math.round(day.profit * 100);
    return { date: day.date, day: day.day, profit: runningCents / 100 };
  });
  const books = [...new Set(tickets.map(bet => bet.book || 'No sportsbook'))].map(book => {
    const rows = tickets.filter(bet => (bet.book || 'No sportsbook') === book);
    return { book, count: rows.length, settled: rows.filter(bet => bet.status !== 'open').length, ...summarizeBets(rows) };
  }).sort((a, b) => b.count - a.count || a.book.localeCompare(b.book));
  const settledDays = days.filter(day => day.settled);
  return { tickets, days, cumulative, books, firstWeekday: new Date(Date.UTC(year, index - 1, 1)).getUTCDay(),
    total: summarizeBets(tickets), settled: tickets.filter(bet => bet.status !== 'open').length,
    returned: Math.round(tickets.reduce((sum, bet) => sum + Math.round((betReturns(bet).returned || 0) * 100), 0)) / 100,
    activeDays: days.filter(day => day.count).length,
    bestDay: settledDays.length ? settledDays.reduce((best, day) => day.profit > best.profit ? day : best) : null,
    worstDay: settledDays.length ? settledDays.reduce((worst, day) => day.profit < worst.profit ? day : worst) : null,
  };
}
