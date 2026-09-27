import { monthAnalytics, shiftMonth } from './bet-analytics.js';
import { betReturns, summarizeBets, closingLineValue } from './bet-utils.js?v=2';
import { icon } from './ui-icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
const signed = value => (value > 0 ? '+' : '') + money(value);
const tone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const dateText = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const isoDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export class BetDashboard {
  constructor(root, { month, onChange }) {
    Object.assign(this, { root, month, currentMonth:month, onChange, selectedDay:'', range:'all', view:'graph', bets:[], customStart:'', customEnd:'' });
    root.addEventListener('click', event => {
      const step = event.target.closest('[data-month-step]');
      const day = event.target.closest('[data-calendar-day]');
      const view = event.target.closest('[data-performance-view]');
      if (step) {
        this.month = shiftMonth(this.month, Number(step.dataset.monthStep));
        this.selectedDay = '';
      } else if (day) {
        this.selectedDay = this.selectedDay === day.dataset.calendarDay ? '' : day.dataset.calendarDay;
      } else if (view) {
        this.view = view.dataset.performanceView;
        this.selectedDay = '';
      } else return;
      this.render(this.bets);
      onChange();
      const focusSelector = day ? `[data-calendar-day="${day.dataset.calendarDay}"]` : view ? `[data-performance-view="${this.view}"]` : `[data-month-step="${step.dataset.monthStep}"]`;
      root.querySelector(focusSelector)?.focus({ preventScroll:true });
    });
    root.addEventListener('keydown', event => {
      const day = event.target.closest('[data-calendar-day]');
      if (!day) return;
      const buttons = [...root.querySelectorAll('[data-calendar-day]')];
      const index = buttons.indexOf(day);
      const offset = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 }[event.key];
      if (offset === undefined && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + offset;
      buttons[Math.max(0, Math.min(buttons.length - 1, target))]?.focus();
    });
    this.resizeObserver = new ResizeObserver(() => this.render(this.bets));
    this.resizeObserver.observe(root);
  }

  periodBets(bets) {
    return this.view === 'calendar' ? bets.filter(bet => bet.date.startsWith(this.month)) : this.rangedBets(bets);
  }

  render(bets) {
    this.bets = bets;
    const key = JSON.stringify([bets, this.month, this.selectedDay, this.range, this.view, this.customStart, this.customEnd, Math.round(this.root.clientWidth)]);
    if (key === this.renderKey && this.root.childElementCount) return;
    this.renderKey = key;
    const data = monthAnalytics(bets, this.month);
    const performanceBets = this.periodBets(bets);
    const total = summarizeBets(performanceBets);
    const monthLabel = new Date(this.month + '-01T12:00:00').toLocaleDateString('en-US', { month:'long', year:'numeric' });
    const settled = performanceBets.filter(bet => bet.status !== 'open');
    const values = settled.map(closingLineValue).filter(value => value !== null);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const positive = values.filter(value => value > 0.05).length;
    const negative = values.filter(value => value < -0.05).length;
    const positiveRate = values.length ? positive / values.length * 100 : 0;
    const negativeRate = values.length ? negative / values.length * 100 : 0;
    this.root.innerHTML = `
      <section class="tracker-performance-card" aria-label="Performance overview">
        <div class="tracker-card-top"><div class="tracker-profit-metric"><span class="tracker-metric-label">Net profit</span><div><strong class="${tone(total.profit)}">${signed(total.profit)}</strong><span class="tracker-roi ${tone(total.roi)}">${total.roi === null ? '—' : `${total.roi.toFixed(2)}%`} ROI</span></div></div><div class="tracker-record-metric"><span class="tracker-metric-label">Record <span>W · L · Open</span></span><strong>${total.won}<i>–</i>${total.lost}<i>–</i>${total.open}</strong></div><div class="tracker-view-switch" role="group" aria-label="Performance view"><button type="button" data-performance-view="graph" aria-pressed="${this.view === 'graph'}">${icon('chart')}<span>Graph</span></button><button type="button" data-performance-view="calendar" aria-pressed="${this.view === 'calendar'}">${icon('calendar')}<span>Calendar</span></button></div></div>
        ${this.view === 'graph' ? this.chart(performanceBets) : `<div class="tracker-month-controls"><button class="tracker-icon-button" data-month-step="-1" aria-label="Previous month"${this.month <= '1900-01' ? ' disabled' : ''}>${icon('chevron')}</button><strong>${monthLabel}</strong><button class="tracker-icon-button" data-month-step="1" aria-label="Next month"${this.month >= '2100-12' ? ' disabled' : ''}>${icon('chevron')}</button></div>${this.calendar(data,monthLabel)}`}
      </section>
      <section class="tracker-clv-strip" aria-label="Closing line value"><div class="tracker-clv-value"><span class="tracker-metric-label">Closing line value</span><strong class="${tone(average)}">${average === null ? '—' : `${average > 0 ? '+' : ''}${average.toFixed(2)}%`}</strong><small>Average CLV</small></div><div class="tracker-clv-breakdown"><div class="tracker-clv-caption"><span>Bet breakdown</span><span>${values.length} of ${settled.length} settled bets</span></div><div class="tracker-clv-labels"><span>+CLV bets <b>${values.length ? positiveRate.toFixed(1)+'%' : '—'}</b></span><span>−CLV bets <b>${values.length ? negativeRate.toFixed(1)+'%' : '—'}</b></span></div><div class="tracker-clv-track" role="img" aria-label="${positive} positive and ${negative} negative closing line value bets out of ${values.length}"><span style="width:${positiveRate}%"></span><span class="clv-negative" style="width:${negativeRate}%"></span></div><small>${values.length ? 'Booked odds compared with the closing price.' : 'Add closing odds to your settled bets to see this breakdown.'}</small></div></section>`;
  }

  calendar(data, monthLabel) {
    const days = data.days.map(day => `<button type="button" class="profit-day ${day.settled ? tone(day.profit) : day.open ? 'pending' : 'empty'}" data-calendar-day="${day.date}" aria-pressed="${this.selectedDay === day.date}" aria-label="${dateText(day.date)}: ${day.count} bets, ${day.settled ? 'net '+signed(day.profit) : 'no settled results'}"><span class="profit-day-number">${day.day}</span><strong>${day.settled ? signed(day.profit) : day.open ? 'Open' : ''}</strong></button>`).join('');
    return `<div class="tracker-calendar-view"><div class="calendar-weekdays" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="Daily results for ${esc(monthLabel)}">${'<span class="calendar-blank" aria-hidden="true"></span>'.repeat(data.firstWeekday)}${days}</div><p class="tracker-calendar-hint">Select a day to view its tickets below.</p></div>`;
  }

  rangedBets(bets) {
    if (this.range === 'custom') return bets.filter(bet => (!this.customStart || bet.date >= this.customStart) && (!this.customEnd || bet.date <= this.customEnd));
    const days = { '1w':7, '1m':30, '1y':365 }[this.range];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ((days || 1) - 1));
    return bets.filter(bet => !days || bet.date >= isoDay(cutoff));
  }

  chart(bets) {
    const entries = bets.filter(bet => bet.status !== 'open').sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let cents = 0;
    const points = [{profit:0},...entries.map(bet => ({date:bet.date,profit:(cents += Math.round((betReturns(bet).profit || 0)*100))/100}))];
    const values = points.map(point => point.profit), min = Math.min(0,...values), max = Math.max(0,...values), spread = max-min || 1;
    const width = Math.max(290, Math.round(this.root.clientWidth - 38));
    const height = width < 450 ? 205 : 235, right = width - 12, bottom = height - 30;
    const x = index => 54+index/Math.max(1,points.length-1)*(right-54);
    const y = value => bottom-(value-min)/spread*(bottom-25);
    const line = points.map((point,index) => `${index?'L':'M'}${x(index).toFixed(1)},${y(point.profit).toFixed(1)}`).join(' ');
    const labels = entries.length ? [...new Set([0,Math.floor((entries.length-1)/3),Math.floor((entries.length-1)*2/3),entries.length-1])] : [];
    return `<figure class="profit-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${entries.length ? `Cumulative profit for ${entries.length} settled bets, ending at ${signed(cents/100)}.` : 'No settled bets in this period.'}"><defs><linearGradient id="tracker-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--tracker-positive)" stop-opacity=".24"/><stop offset="1" stop-color="var(--tracker-positive)" stop-opacity=".015"/></linearGradient></defs><g class="tracker-chart-grid">${[0,1,2,3].map(index => {const value=max-index*spread/3;return `<line x1="54" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="43" y="${y(value)+4}" text-anchor="end">${money(value).replace('.00','')}</text>`;}).join('')}</g>${entries.length ? `<path d="${line} L${right},${bottom} L54,${bottom} Z" fill="url(#tracker-chart-fill)"/><path d="${line}" fill="none" stroke="var(--tracker-positive)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${right}" cy="${y(cents/100)}" r="3" fill="var(--tracker-positive)"/>` : `<path d="M54,${bottom} L${right},${bottom}" stroke="var(--tracker-positive)" stroke-width="2" opacity=".4"/>`}${labels.map((index,i)=>`<text x="${x(index+1)}" y="${height-8}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${esc(dateText(entries[index].date))}</text>`).join('')}</svg>${!entries.length?'<p class="tracker-chart-empty-message">Settle a bet to start your profit history.</p>':''}<figcaption class="sr-only">Profit includes settled tickets. Open bets are excluded.</figcaption></figure>`;
  }
}
