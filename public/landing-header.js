import { accountStorage as localStorage, accountReady } from './account-sync.js';
await accountReady;
import { BET_STORAGE_KEY, betReturns, readBets, summarizeBets } from './bet-utils.js?v=4';
import { demoRecord } from './landing-demo-bets.js?v=2';

const dollars = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const dailyAmount = amount => {
  const absolute = Math.abs(amount);
  const compact = absolute >= 1000 ? '$' + (absolute / 1000).toFixed(absolute >= 10000 ? 0 : 1) + 'k' : dollars(absolute).replace(/\.00$/, '');
  return (amount < 0 ? '−' : '') + compact;
};

export function mountHeroTracker() {
  const root = document.querySelector('#hero-tracker');
  if (!root) return;
  function render() {
    let bets;
    try { bets = readBets(localStorage); }
    catch {
      root.innerHTML = '<p class="hero-tracker-error">Your pick record is unavailable in this browser. <a href="/ev/tracker">Open My Picks</a></p>';
      return;
    }
    const demo = bets.length === 0;
    const example = demoRecord();
    const latest = demo ? null : bets.reduce((date, bet) => bet.date > date ? bet.date : date, '');
    const month = demo ? example.month : new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1);
    const record = demo ? example.bets : bets;
    const total = summarizeBets(record);
    const year = month.getFullYear();
    const monthNumber = month.getMonth();
    const key = `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
    const monthly = record.filter(bet => bet.date.startsWith(key));
    const dayTotals = new Map();
    for (const bet of monthly) {
      const record = dayTotals.get(bet.date) || { count: 0, settled: 0, cents: 0 };
      record.count++;
      const profit = betReturns(bet).profit;
      if (profit !== null) { record.settled++; record.cents += Math.round(profit * 100); }
      dayTotals.set(bet.date, record);
    }
    const strongestDay = Math.max(1, ...[...dayTotals.values()].map(item => item.cents));
    const leading = new Date(year, monthNumber, 1).getDay();
    const days = new Date(year, monthNumber + 1, 0).getDate();
    const cells = Array.from({ length: leading }, () => '<span class="hero-tracker-day empty" aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const date = `${key}-${String(day).padStart(2, '0')}`;
      const item = dayTotals.get(date);
      const profit = (item?.cents || 0) / 100;
      const status = item ? (profit > 0 ? 'positive' : profit < 0 ? 'negative' : item.settled ? '' : 'open') : '';
      const intensity = profit > 0 ? (item.cents >= strongestDay * .8 ? ' gain-high' : item.cents >= strongestDay * .55 ? ' gain-mid' : '') : '';
      const value = item ? (item.settled ? dailyAmount(profit) : 'Open') : '';
      const label = item ? `${date}: ${item.count} ${demo ? 'demo ' : ''}${item.count === 1 ? 'pick' : 'picks'}, ${item.settled} settled, ${dollars(profit)} net` : `${date}: no ${demo ? 'demo ' : 'saved '}picks`;
      cells.push(`<span class="hero-tracker-day ${item ? 'has-picks ' : ''}${status}${intensity}" style="--i:${day}" aria-label="${label}" title="${label}">${item ? '' : `<small>${day}</small>`}<strong>${value}</strong></span>`);
    }
    const totalTone = total.profit > 0 ? 'positive' : total.profit < 0 ? 'negative' : '';
    const totalLabel = total.profit > 0 ? '+' + dollars(total.profit) : dollars(total.profit);
    const [wholeProfit, centsProfit] = totalLabel.split('.');
    const profitDisplay = demo
      ? (total.profit > 0 ? '+' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total.profit)
      : `${wholeProfit}${centsProfit && centsProfit !== '00' ? `<span class="hero-tracker-cents">.${centsProfit}</span>` : ''}`;
    const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month);
    root.innerHTML = `<div class="hero-tracker-head"><span class="hero-tracker-avatar"><img src="/favicon.svg" alt=""></span><strong>VisualOdds</strong></div>
      <div class="hero-tracker-profit ${totalTone}" aria-label="${demo ? 'Demo net profit' : 'Net profit'}: ${totalLabel}"><small>${demo ? 'Demo net profit' : 'Net profit'}</small><strong>${profitDisplay}</strong></div>
      <div class="hero-tracker-body"><div class="hero-tracker-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="hero-tracker-grid" role="group" aria-label="${monthLabel} ${demo ? 'demo' : 'saved picks'} calendar">${cells.join('')}</div></div>`;
  }

  window.addEventListener('storage', event => { if (event.key === BET_STORAGE_KEY) render(); });
  render();
}
