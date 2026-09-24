import { BET_STORAGE_KEY, betReturns, readBets, summarizeBets } from './bet-utils.js';

const dollars = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const dailyAmount = amount => {
  const absolute = Math.abs(amount);
  const compact = absolute >= 1000 ? '$' + (absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1) + 'k' : dollars(absolute).replace(/\.00$/, '');
  return (amount > 0 ? '+' : amount < 0 ? '−' : '') + compact;
};

export function mountHeroTracker() {
  const root = document.querySelector('#hero-tracker');
  if (!root) return;
  let month = new Date();
  month = new Date(month.getFullYear(), month.getMonth(), 1);

  function render() {
    let bets;
    try { bets = readBets(localStorage); }
    catch {
      root.innerHTML = '<p class="hero-tracker-error">Your pick record is unavailable in this browser. <a href="/bets">Open My Picks</a></p>';
      return;
    }
    const total = summarizeBets(bets);
    const year = month.getFullYear();
    const monthNumber = month.getMonth();
    const key = `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
    const monthly = bets.filter(bet => bet.date.startsWith(key));
    const dayTotals = new Map();
    for (const bet of monthly) {
      const record = dayTotals.get(bet.date) || { count: 0, settled: 0, cents: 0 };
      record.count++;
      const profit = betReturns(bet).profit;
      if (profit !== null) { record.settled++; record.cents += Math.round(profit * 100); }
      dayTotals.set(bet.date, record);
    }
    const leading = new Date(year, monthNumber, 1).getDay();
    const days = new Date(year, monthNumber + 1, 0).getDate();
    const cells = Array.from({ length: leading }, () => '<span class="hero-tracker-day empty" aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const date = `${key}-${String(day).padStart(2, '0')}`;
      const item = dayTotals.get(date);
      const profit = (item?.cents || 0) / 100;
      const status = item ? (profit > 0 ? 'positive' : profit < 0 ? 'negative' : item.settled ? '' : 'open') : '';
      const value = item ? (item.settled ? dailyAmount(profit) : `${item.count} open`) : '';
      const label = item ? `${date}: ${item.count} saved ${item.count === 1 ? 'pick' : 'picks'}, ${item.settled} settled, ${dollars(profit)} net` : `${date}: no saved picks`;
      cells.push(`<span class="hero-tracker-day ${status}" aria-label="${label}" title="${label}"><small>${day}</small><strong>${value}</strong></span>`);
    }
    const totalTone = total.profit > 0 ? 'positive' : total.profit < 0 ? 'negative' : '';
    const totalLabel = total.profit > 0 ? '+' + dollars(total.profit) : dollars(total.profit);
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month);
    root.innerHTML = `<div class="hero-tracker-profit ${totalTone}"><small>Total net profit</small><strong>${totalLabel}</strong></div>
      <div class="hero-tracker-head"><strong>My Picks</strong><small>Your personal betting record · saved in this browser</small></div>
      <div class="hero-tracker-body"><div class="hero-tracker-month"><strong>${monthLabel}</strong><div><button type="button" data-tracker-month="-1" aria-label="Previous month">‹</button><button type="button" data-tracker-month="1" aria-label="Next month">›</button></div></div>
      <div class="hero-tracker-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="hero-tracker-grid">${cells.join('')}</div></div>
      <div class="hero-tracker-foot"><span>${monthly.length ? `${monthly.length} saved ${monthly.length === 1 ? 'pick' : 'picks'} this month` : 'No picks logged this month'}</span><a href="/bets">Open full tracker ↗</a></div>`;
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-tracker-month]');
    if (!button) return;
    const direction = Number(button.dataset.trackerMonth);
    month = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    render();
    root.querySelector(`[data-tracker-month="${direction}"]`)?.focus();
  });
  window.addEventListener('storage', event => { if (event.key === BET_STORAGE_KEY) render(); });
  render();
}
