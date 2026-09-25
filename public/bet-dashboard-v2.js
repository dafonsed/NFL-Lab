import { monthAnalytics, shiftMonth } from './bet-analytics.js';
import { betReturns, summarizeBets } from './bet-utils.js';
import { icon } from './ui-icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2}).format(value);
const signed = value => (value > 0 ? '+' : '') + money(value);
const compactDay = value => Math.abs(value) >= 10 ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.round(Math.abs(value))}` : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;
const tone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const dateText = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
const dayText = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
const statuses = {open:'Open', won:'Won', lost:'Lost', push:'Push', void:'Void', cashed:'Cashed out'};

export class BetDashboard {
  constructor(root, {month, onChange}) {
    Object.assign(this, {root, month, currentMonth:month, onChange, selectedDay:'', range:'all', bets:[]});
    root.addEventListener('click', event => {
      const move = event.target.closest('[data-month-step]');
      const day = event.target.closest('[data-calendar-day]');
      const range = event.target.closest('[data-profit-range]');
      if (move) {
        this.month = shiftMonth(this.month, Number(move.dataset.monthStep));
        this.selectedDay = '';
        this.render(this.bets);
        onChange();
        root.querySelector(`[data-month-step="${move.dataset.monthStep}"]`)?.focus();
      } else if (event.target.closest('[data-current-month]')) {
        this.month = this.currentMonth;
        this.selectedDay = '';
        this.render(this.bets);
        onChange();
      } else if (day) {
        this.selectedDay = this.selectedDay === day.dataset.calendarDay ? '' : day.dataset.calendarDay;
        this.render(this.bets);
        onChange();
        root.querySelector(`[data-calendar-day="${day.dataset.calendarDay}"]`)?.focus();
      } else if (range) {
        this.range = range.dataset.profitRange;
        this.render(this.bets);
        root.querySelector(`[data-profit-range="${this.range}"]`)?.focus();
      }
    });
    root.addEventListener('change', event => {
      if (!event.target.matches('[data-calendar-month]') || !event.target.checkValidity() || !/^\d{4}-\d{2}$/.test(event.target.value)) return;
      this.month = event.target.value;
      this.selectedDay = '';
      this.render(this.bets);
      onChange();
    });
    root.addEventListener('keydown', event => {
      const day = event.target.closest('[data-calendar-day]');
      if (!day) return;
      const buttons = [...root.querySelectorAll('[data-calendar-day]')];
      const index = buttons.indexOf(day);
      const offset = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7}[event.key];
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (offset || 0);
      if (offset === undefined && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, target))]?.focus();
    });
  }

  render(bets) {
    this.bets = bets;
    const key = JSON.stringify([bets, this.month, this.selectedDay, this.range]);
    if (key === this.renderKey && this.root.childElementCount) return;
    this.renderKey = key;
    const data = monthAnalytics(bets, this.month), total = data.total;
    const monthLabel = new Date(this.month + '-01T12:00:00').toLocaleDateString('en-US', {month:'long', year:'numeric'});
    const featuredDate = this.selectedDay || [...data.days].reverse().find(day => day.count)?.date;
    const featured = featuredDate ? bets.filter(bet => bet.date === featuredDate) : [];
    const featuredTotal = summarizeBets(featured);
    const metrics = [
      ['Total bets', data.tickets.length, `${data.settled} settled · ${total.open} open`, 'neutral'],
      ['Bets won', total.winRate === null ? '—' : total.winRate.toFixed(0) + '%', `${total.won} won · ${total.lost} lost`, 'neutral'],
      ['Net profit', data.settled ? signed(total.profit) : '—', `${data.settled} settled tickets`, data.settled ? tone(total.profit) : 'neutral'],
      ['ROI', total.roi === null ? '—' : `${total.roi > 0 ? '+' : ''}${total.roi.toFixed(1)}%`, `${money(total.settledStake)} settled stake`, tone(total.roi)]
    ];
    const days = data.days.map(day => `<button type="button" class="profit-day ${day.settled ? tone(day.profit) : day.open ? 'pending' : 'empty'}${featuredDate === day.date ? ' is-featured' : ''}" data-calendar-day="${day.date}" aria-pressed="${this.selectedDay === day.date}" aria-label="${dateText(day.date)}: ${day.count} ${day.count === 1 ? 'bet' : 'bets'}, ${day.settled ? 'net ' + signed(day.profit) : 'no settled results'}"><span class="profit-day-number">${day.day}</span><strong><span class="profit-day-full">${day.settled ? signed(day.profit) : day.open ? 'Open' : ''}</span><span class="profit-day-compact" aria-hidden="true">${day.settled ? compactDay(day.profit) : day.open ? 'Open' : ''}</span></strong></button>`).join('');
    const dayCards = featured.length ? featured.map(bet => {
      const result = betReturns(bet);
      const value = result.profit ?? result.potentialProfit;
      return `<article class="tracker-day-ticket"><div class="tracker-day-ticket-top"><span class="tracker-day-status ${esc(bet.status)}">${statuses[bet.status] || esc(bet.status)}</span><span>${esc(bet.book || 'No sportsbook')}</span></div><strong>${esc(bet.selection)}</strong><p>${esc(bet.sport)} · ${bet.type === 'parlay' ? 'Parlay' : 'Single'} · ${money(bet.stake)} stake</p><span class="tracker-day-profit ${bet.status === 'open' ? 'neutral' : tone(value)}">${bet.status === 'open' ? 'Potential ' : ''}${signed(value)}</span></article>`;
    }).join('') : '<div class="tracker-day-empty">Select a day with bets to see its tickets here.</div>';
    this.root.innerHTML = `<div class="tracker-period"><div><span class="tracker-kicker">Your record</span><h2>${esc(monthLabel)}</h2></div><div class="tracker-month-controls"><button class="tracker-icon-button" data-month-step="-1" aria-label="Previous month"${this.month <= '1900-01' ? ' disabled' : ''}>${icon('chevron')}</button><label class="tracker-month-input"><span class="sr-only">Calendar month</span><input type="month" data-calendar-month value="${this.month}" min="1900-01" max="2100-12" required></label><button class="tracker-icon-button" data-month-step="1" aria-label="Next month"${this.month >= '2100-12' ? ' disabled' : ''}>${icon('chevron')}</button><button class="tracker-button" data-current-month>This month</button></div></div>
    <section class="tracker-metrics" aria-label="${esc(monthLabel)} totals">${metrics.map(([label,value,note,color]) => `<article><span>${label}</span><strong class="${color}">${value}</strong><small>${note}</small></article>`).join('')}</section>
    <div class="tracker-overview"><section class="profit-calendar" aria-labelledby="profit-calendar-title"><div class="tracker-panel-heading"><div><h3 id="profit-calendar-title">Profit calendar</h3><p>Daily net by date placed</p></div><span class="tracker-currency">USD</span></div><div class="calendar-weekdays" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="Daily ticket results for ${esc(monthLabel)}">${'<span class="calendar-blank" aria-hidden="true"></span>'.repeat(data.firstWeekday)}${days}</div><div class="calendar-key"><span><i class="positive"></i>Profit</span><span><i class="negative"></i>Loss</span><span><i class="pending"></i>Open</span><p>Select a day to filter activity</p></div></section>
    <section class="tracker-day-detail" aria-labelledby="tracker-day-title"><div class="tracker-panel-heading"><div><h3 id="tracker-day-title">${featuredDate ? esc(dayText(featuredDate)) : 'Day details'}</h3><p>${featured.length ? `${featured.length} ${featured.length === 1 ? 'ticket' : 'tickets'} · ${featured.filter(bet => bet.status === 'open').length} open` : 'No tickets this month'}</p></div>${featured.some(bet => bet.status !== 'open') ? `<strong class="tracker-day-total ${tone(featuredTotal.profit)}">${signed(featuredTotal.profit)}</strong>` : ''}</div><div class="tracker-day-list">${dayCards}</div></section></div>
    <div class="tracker-performance"><section class="tracker-month-detail" aria-labelledby="month-detail-title"><div class="tracker-panel-heading"><div><span class="tracker-kicker">Performance</span><h3 id="month-detail-title">Profit over time</h3></div><span class="tracker-currency">USD</span></div>${this.chart(bets)}</section><aside class="tracker-breakdown" aria-label="Monthly breakdown"><div class="tracker-panel-heading"><div><h3>Monthly breakdown</h3><p>${data.tickets.length} ${data.tickets.length === 1 ? 'ticket' : 'tickets'} across ${data.books.length} ${data.books.length === 1 ? 'book' : 'books'}</p></div></div><div class="tracker-month-facts"><div><span>Total returned</span><strong>${data.settled ? money(data.returned) : '—'}</strong><small>Includes returned stakes</small></div><div><span>Best day</span><strong class="${tone(data.bestDay?.profit)}">${data.bestDay ? signed(data.bestDay.profit) : '—'}</strong><small>${data.bestDay ? dateText(data.bestDay.date) : 'No settled tickets'}</small></div></div>${data.books.length ? `<div class="book-breakdown"><h4>By sportsbook</h4><table><thead><tr><th scope="col">Book</th><th scope="col">Tickets</th><th scope="col">Net</th></tr></thead><tbody>${data.books.map(book => `<tr><th scope="row">${esc(book.book)}</th><td>${book.count}</td><td class="${book.settled ? tone(book.profit) : ''}">${book.settled ? signed(book.profit) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="tracker-breakdown-empty">Your sportsbooks appear here after you add a bet.</p>'}</aside></div>
    <details class="tracker-accounting"><summary>How these totals work ${icon('info')}</summary><p>Calendar totals include all sports and books for this month. Dates are the date placed, not the settlement date. Open bets have no realized profit. Pushes and voids return the stake; ROI excludes those refunded stakes. Win rate uses wins and losses only. Ticket filters below do not change this overview.</p></details>`;
  }

  chart(bets) {
    const days = {'1m':30, '3m':90, '1y':365}[this.range];
    const cutoff = days ? new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10) : '';
    const entries = bets.filter(bet => bet.status !== 'open' && (!cutoff || bet.date >= cutoff)).sort((a,b) => a.date.localeCompare(b.date));
    const ranges = `<div class="tracker-chart-ranges" role="group" aria-label="Profit chart date range">${[['1m','1M'],['3m','3M'],['1y','1Y'],['all','All']].map(([value,label]) => `<button type="button" data-profit-range="${value}" aria-pressed="${this.range === value}">${label}</button>`).join('')}</div>`;
    if (!entries.length) return `<div class="profit-chart-empty">${icon('trends')}<strong>No settled bets in this range</strong><span>Settled results will build your profit history.</span></div>${ranges}`;
    let running = 0;
    const points = [{profit:0}, ...entries.map(bet => ({date:bet.date, profit:(running += Math.round((betReturns(bet).profit || 0) * 100)) / 100}))];
    const values = points.map(point => point.profit), min = Math.min(0, ...values), max = Math.max(0, ...values), spread = max - min || 1;
    const x = index => 30 + index / Math.max(1, points.length - 1) * 690;
    const y = value => 216 - (value - min) / spread * 185;
    const line = points.map((point,index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.profit).toFixed(1)}`).join(' ');
    return `<figure class="profit-chart"><figcaption><span>Realized profit</span><strong class="${tone(running)}">${signed(running / 100)}</strong></figcaption><svg viewBox="0 0 750 246" role="img" aria-label="Cumulative settled profit for ${entries.length} ${entries.length === 1 ? 'bet' : 'bets'}. Ends at ${signed(running / 100)}."><defs><linearGradient id="tracker-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--tracker-positive)" stop-opacity=".27"/><stop offset="1" stop-color="var(--tracker-positive)" stop-opacity="0"/></linearGradient></defs><g class="tracker-chart-grid">${[31,93,155,216].map(value => `<line x1="30" x2="720" y1="${value}" y2="${value}"/>`).join('')}</g><path d="${line} L720,216 L30,216 Z" fill="url(#tracker-chart-fill)"/><path d="${line}" fill="none" stroke="var(--tracker-positive)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(points.length - 1)}" cy="${y(running / 100)}" r="5" fill="var(--tracker-positive)"/><text x="30" y="242">${esc(dateText(entries[0].date))}</text><text x="720" y="242" text-anchor="end">${esc(dateText(entries[entries.length - 1].date))}</text></svg><details><summary>View chart values</summary><div class="chart-data-scroll"><table><caption>Cumulative profit by ticket</caption><thead><tr><th>Date</th><th>Profit</th></tr></thead><tbody>${points.slice(1).map(point => `<tr><th scope="row">${dateText(point.date)}</th><td>${signed(point.profit)}</td></tr>`).join('')}</tbody></table></div></details></figure>${ranges}`;
  }
}
