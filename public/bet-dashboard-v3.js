import { monthAnalytics, shiftMonth } from './bet-analytics.js';
import { betReturns, summarizeBets, closingLineValue } from './bet-utils.js?v=2';
import { icon } from './ui-icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const money = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
// Keep the chart axis inside its gutter; exact amounts remain in the overview
// and accessible chart description.
const axisMoney = value => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', notation:Math.abs(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits:Math.abs(value) >= 10000 ? 1 : 0 }).format(value);
const signed = value => (value > 0 ? '+' : '') + money(value);
const tone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const dateText = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const pct = (value, digits = 2, sign = true) => (sign && value > 0 ? '+' : '') + value.toFixed(digits) + '%';
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatCount = (value, format) => format === 'money' ? signed(Math.round(value * 100) / 100) : format === 'pct-signed' ? pct(value) : format === 'pct' ? pct(value, 1, false) : String(Math.round(value));
const isoDay = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export class BetDashboard {
  constructor(root, { month, onChange, kpis = null }) {
    Object.assign(this, { root, kpis, month, currentMonth:month, onChange, selectedDay:'', range:'all', view:'graph', bets:[], customStart:'', customEnd:'', chartWidth:0, chartPoints:[], kpiValues:new Map(), counterFrame:0 });
    // Chart hover: nearest settled ticket to the pointer, with a cursor and tooltip.
    root.addEventListener('pointermove', event => this.hoverChart(event));
    root.addEventListener('pointerleave', () => this.hoverChart(null));
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
    // Render after layout has settled. Rendering inside the observer callback
    // itself changes the observed height and produces resize loops in WebKit.
    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.round(root.clientWidth);
      if (width === this.observedWidth) return;
      this.observedWidth = width;
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.render(this.bets));
    });
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
    const stakes = settled.filter(bet => !['push','void'].includes(bet.status)).map(bet => Number(bet.stake) || 0);
    const averageStake = stakes.length ? stakes.reduce((sum, value) => sum + value, 0) / stakes.length : null;
    const bestWin = settled.reduce((best, bet) => Math.max(best, betReturns(bet).profit || 0), 0);
    const kpiValue = (key, value, format, className = '') => value === null || value === undefined
      ? `<span class="bt-kpi-value is-empty">—</span>`
      : `<span class="bt-kpi-value ${className}" aria-hidden="true" data-kpi="${key}" data-count="${value}" data-format="${format}">${esc(formatCount(value, format))}</span><span class="sr-only">${esc(formatCount(value, format))}</span>`;
    if (this.kpis) {
      this.kpis.innerHTML = [
        ['profit', 'Net profit', kpiValue('profit', total.profit, 'money', tone(total.profit)), `${total.won}–${total.lost}–${total.open} record`, 'is-primary'],
        ['roi', 'ROI', kpiValue('roi', total.roi, 'pct-signed', total.roi === null ? '' : tone(total.roi)), total.settledStake ? `on ${money(total.settledStake)} staked` : 'No settled stake yet', ''],
        ['win', 'Win rate', kpiValue('win', total.winRate, 'pct'), `${total.won} won · ${total.lost} lost`, ''],
        ['clv', 'Avg CLV', kpiValue('clv', average, 'pct-signed', average === null ? '' : tone(average)), values.length ? `${positive} of ${values.length} beat the close` : 'Add closing odds to track', ''],
        ['open', 'Open bets', kpiValue('open', total.open, 'int'), `${money(total.openStake)} at risk`, 'is-open']
      ].map(([key, label, value, note, className]) => `<div class="bt-kpi ${className}" data-kpi-card="${key}"><dt>${label}</dt><dd>${value}<small>${esc(note)}</small></dd></div>`).join('');
      this.animateCounters();
    }
    const settledCount = settled.length;
    const graph = this.view === 'graph';
    this.root.innerHTML = `
      <section class="tracker-performance-card" aria-label="Performance overview">
        <div class="tracker-card-top"><div class="bt-card-title"><span class="bt-icon-tile" aria-hidden="true">${icon(graph ? 'research' : 'calendar')}</span><div><h2>${graph ? 'Profit over time' : 'Daily results'}</h2><small>${graph ? `Cumulative · ${settledCount} settled ${settledCount === 1 ? 'ticket' : 'tickets'}` : esc(monthLabel)}</small></div></div><div class="tracker-profit-metric"><strong class="${tone(total.profit)}">${signed(total.profit)}</strong><span class="tracker-metric-label">Period P/L</span></div><div class="tracker-view-switch" role="group" aria-label="Performance view"><button type="button" data-performance-view="graph" aria-pressed="${graph}">${icon('research')}<span>Graph</span></button><button type="button" data-performance-view="calendar" aria-pressed="${!graph}">${icon('calendar')}<span>Calendar</span></button></div></div>
        ${graph ? this.chart(performanceBets) : `<div class="tracker-month-controls"><button class="tracker-icon-button" data-month-step="-1" aria-label="Previous month"${this.month <= '1900-01' ? ' disabled' : ''}>${icon('chevron')}</button><strong>${monthLabel}</strong><button class="tracker-icon-button" data-month-step="1" aria-label="Next month"${this.month >= '2100-12' ? ' disabled' : ''}>${icon('chevron')}</button></div>${this.calendar(data,monthLabel)}`}
      </section>
      <section class="tracker-clv-strip" aria-label="Closing line value"><div class="bt-card-title"><span class="bt-icon-tile" aria-hidden="true">${icon('performance')}</span><div><h2>Closing line value</h2><small>Booked odds vs the closing price</small></div></div><div class="tracker-clv-value"><strong class="${tone(average)}">${average === null ? '—' : `${average > 0 ? '+' : ''}${average.toFixed(2)}%`}</strong><small>Average CLV</small></div><div class="tracker-clv-breakdown"><div class="tracker-clv-caption"><span>Bet breakdown</span><span>${values.length} of ${settled.length} settled bets</span></div><div class="tracker-clv-labels"><span>+CLV bets <b>${values.length ? positiveRate.toFixed(1)+'%' : '—'}</b></span><span>−CLV bets <b>${values.length ? negativeRate.toFixed(1)+'%' : '—'}</b></span></div><div class="tracker-clv-track" role="img" aria-label="${positive} positive and ${negative} negative closing line value bets out of ${values.length}"><span style="width:${positiveRate}%"></span><span class="clv-negative" style="width:${negativeRate}%"></span></div><small>${values.length ? 'Booked odds compared with the closing price.' : 'Add closing odds to your settled bets to see this breakdown.'}</small></div><dl class="bt-mini-stats"><div><dt>Beat the close</dt><dd class="${positive ? 'positive' : ''}">${positive}</dd></div><div><dt>Missed the close</dt><dd class="${negative ? 'negative' : ''}">${negative}</dd></div><div><dt>Avg stake</dt><dd>${averageStake === null ? '—' : money(averageStake)}</dd></div><div><dt>Biggest win</dt><dd class="${bestWin > 0 ? 'positive' : ''}">${bestWin > 0 ? signed(bestWin) : '—'}</dd></div></dl></section>`;
    // Size the chart to its own card, which can be narrower than the overview.
    const figure = this.root.querySelector('.profit-chart');
    if (figure) {
      const measured = Math.round(figure.querySelector('svg')?.getBoundingClientRect().width || 0);
      if (measured > 0 && Math.abs(measured - this.chartWidth) > 2) { this.chartWidth = measured; figure.outerHTML = this.chart(performanceBets); }
    }
  }

  animateCounters() {
    const nodes = [...this.kpis.querySelectorAll('[data-count]')];
    cancelAnimationFrame(this.counterFrame);
    const runs = nodes.map(node => {
      const key = node.dataset.kpi, to = Number(node.dataset.count), from = this.kpiValues.has(key) ? this.kpiValues.get(key) : 0;
      this.kpiValues.set(key, to);
      return { node, from, to, format: node.dataset.format };
    });
    const finish = () => runs.forEach(({ node, to, format }) => { node.textContent = formatCount(to, format); });
    if (reduceMotion() || runs.every(run => run.from === run.to)) return finish();
    const started = performance.now(), duration = 850;
    const step = now => {
      const progress = Math.min(1, (now - started) / duration), eased = 1 - Math.pow(1 - progress, 3);
      for (const { node, from, to, format } of runs) node.textContent = formatCount(from + (to - from) * eased, format);
      if (progress < 1) this.counterFrame = requestAnimationFrame(step); else finish();
    };
    this.counterFrame = requestAnimationFrame(step);
  }

  hoverChart(event) {
    const figure = this.root.querySelector('.profit-chart');
    const svg = figure?.querySelector('svg'), cursor = figure?.querySelector('.bt-chart-cursor'), tip = figure?.querySelector('.bt-chart-tip');
    if (!svg || !cursor || !tip) return;
    if (!event || !svg.contains(event.target) || this.chartPoints.length < 2) { cursor.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
    const box = svg.getBoundingClientRect(), scale = (svg.viewBox.baseVal.width || box.width) / box.width;
    const px = (event.clientX - box.left) * scale;
    let nearest = this.chartPoints[1];
    for (const point of this.chartPoints.slice(1)) if (Math.abs(point.x - px) < Math.abs(nearest.x - px)) nearest = point;
    cursor.setAttribute('visibility', 'visible');
    const rule = cursor.querySelector('line'), dot = cursor.querySelector('circle');
    rule.setAttribute('x1', nearest.x); rule.setAttribute('x2', nearest.x);
    dot.setAttribute('cx', nearest.x); dot.setAttribute('cy', nearest.y);
    tip.innerHTML = `<span>${esc(dateText(nearest.date))}</span><strong class="${tone(nearest.profit)}">${signed(nearest.profit)}</strong><small>${esc(nearest.selection)}</small><em class="${tone(nearest.delta)}">${signed(nearest.delta)} this ticket</em>`;
    tip.hidden = false;
    const width = tip.offsetWidth, height = tip.offsetHeight;
    const left = nearest.x / scale, top = nearest.y / scale;
    tip.style.left = Math.max(4, Math.min(box.width - width - 4, left - width / 2)) + 'px';
    tip.style.top = (top - height - 14 < 0 ? top + 14 : top - height - 14) + 'px';
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
    const points = [{profit:0,delta:0},...entries.map(bet => { const delta = Math.round((betReturns(bet).profit || 0)*100); return {date:bet.date,selection:bet.selection,delta:delta/100,profit:(cents += delta)/100}; })];
    const values = points.map(point => point.profit), min = Math.min(0,...values), max = Math.max(0,...values), spread = max-min || 1;
    const width = Math.max(260, this.chartWidth || Math.round(this.root.clientWidth - 38));
    const height = width < 450 ? 210 : 318, left = 50, right = width - 10, bottom = height - 30, top = 16;
    const x = index => left+index/Math.max(1,points.length-1)*(right-left);
    const y = value => bottom-(value-min)/spread*(bottom-top);
    this.chartPoints = points.map((point,index) => ({...point, x:+x(index).toFixed(1), y:+y(point.profit).toFixed(1)}));
    const line = this.chartPoints.map((point,index) => `${index?'L':'M'}${point.x},${point.y}`).join(' ');
    const labels = entries.length ? [...new Set([0,Math.floor((entries.length-1)/3),Math.floor((entries.length-1)*2/3),entries.length-1])] : [];
    const ending = cents/100, stroke = ending < 0 ? 'var(--tracker-negative)' : 'var(--tracker-positive)';
    return `<figure class="profit-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${entries.length ? `Cumulative profit for ${entries.length} settled bets, ending at ${signed(ending)}.` : 'No settled bets in this period.'}"><defs><linearGradient id="tracker-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${stroke}" stop-opacity=".28"/><stop offset="1" stop-color="${stroke}" stop-opacity="0"/></linearGradient><linearGradient id="tracker-chart-stroke" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${stroke}" stop-opacity=".55"/><stop offset="1" stop-color="${stroke}"/></linearGradient></defs><g class="tracker-chart-grid">${[0,1,2,3].map(index => {const value=max-index*spread/3;return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/>${entries.length ? `<text x="${left-10}" y="${y(value)+4}" text-anchor="end">${axisMoney(value)}</text>` : ''}`;}).join('')}${min < 0 && max > 0 ? `<line class="tracker-chart-zero" x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}"/>` : ''}</g>${entries.length ? `<path class="tracker-chart-area" d="${line} L${right},${bottom} L${left},${bottom} Z" fill="url(#tracker-chart-fill)"/><path class="tracker-chart-line" d="${line}" fill="none" stroke="url(#tracker-chart-stroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle class="tracker-chart-end" cx="${right}" cy="${y(ending)}" r="4" fill="${stroke}"/>` : ''}${labels.map((index,i)=>`<text x="${x(index+1)}" y="${height-8}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${esc(dateText(entries[index].date))}</text>`).join('')}<g class="bt-chart-cursor" visibility="hidden" aria-hidden="true"><line x1="0" x2="0" y1="${top}" y2="${bottom}"/><circle cx="0" cy="0" r="5"/></g><rect class="bt-chart-hit" x="${left}" y="0" width="${right-left}" height="${bottom}" fill="transparent"/></svg><div class="bt-chart-tip" hidden></div>${!entries.length?'<p class="tracker-chart-empty-message">Settle a bet to start your profit history.</p>':''}<figcaption class="sr-only">Profit includes settled tickets. Open bets are excluded.</figcaption></figure>`;
  }
}
