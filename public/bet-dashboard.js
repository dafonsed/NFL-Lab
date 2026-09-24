import { monthAnalytics, shiftMonth } from './bet-analytics.js';
import { icon } from './ui-icons.js';
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const signed = n => (n > 0 ? '+' : '') + money(n);
const compact = n => Math.abs(n) >= 1000 ? (n < 0 ? '−' : '+') + '$' + new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Math.abs(n)) : (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(n)%1 ? 2 : 0}).format(Math.abs(n));
const tone = n => n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral';
const counted = (count, singular, plural = singular + 's') => count + ' ' + (count === 1 ? singular : plural);
const dateLabel = date => new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

export class BetDashboard {
  constructor(root, { month, onChange }) {
    this.root=root;this.month=month;this.currentMonth=month;this.selectedDay='';this.onChange=onChange;this.bets=[];
    root.addEventListener('click', event => {
      const move=event.target.closest('[data-month-step]'),day=event.target.closest('[data-calendar-day]');
      if(move){this.month=shiftMonth(this.month,Number(move.dataset.monthStep));this.selectedDay='';this.render(this.bets);onChange();root.querySelector(`[data-month-step="${move.dataset.monthStep}"]`)?.focus();}
      if(event.target.closest('[data-current-month]')){this.month=this.currentMonth;this.selectedDay='';this.render(this.bets);onChange();root.querySelector('[data-current-month]')?.focus();}
      if(day){this.selectedDay=this.selectedDay===day.dataset.calendarDay?'':day.dataset.calendarDay;this.render(this.bets);onChange();root.querySelector(`[data-calendar-day="${day.dataset.calendarDay}"]`)?.focus();}
    });
    root.addEventListener('change',event=>{if(event.target.matches('[data-calendar-month]')&&event.target.checkValidity()&&/^\d{4}-\d{2}$/.test(event.target.value)){this.month=event.target.value;this.selectedDay='';this.render(this.bets);onChange();queueMicrotask(()=>{const month=root.querySelector('[data-calendar-month]');(month?.closest('.ui-calendar')?.querySelector('.calendar-trigger')||month)?.focus();});}});
    root.addEventListener('keydown',event=>{
      const day=event.target.closest('[data-calendar-day]');if(!day)return;
      const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
      const buttons=[...root.querySelectorAll('[data-calendar-day]')],index=buttons.indexOf(day);
      let target=event.key==='Home'?0:event.key==='End'?buttons.length-1:index+(offsets[event.key]||0);
      if(!(event.key in offsets)&&!['Home','End'].includes(event.key))return;
      event.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,target))]?.focus();
    });
  }
  render(bets) {
    this.bets=bets;
    const renderKey=JSON.stringify([this.month,this.selectedDay,bets]);
    if(this.renderKey===renderKey&&this.root.childElementCount)return;
    this.renderKey=renderKey;
    const data=monthAnalytics(bets,this.month),total=data.total;
    const monthLabel=new Date(this.month+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const totalProfit=data.settled?signed(total.profit):'—';
    const metrics=[['Net profit',totalProfit,counted(data.settled,'settled ticket'),data.settled?tone(total.profit):'neutral'],['Return on stake',total.roi===null?'—':(total.roi>0?'+':'')+total.roi.toFixed(1)+'%',money(total.settledStake)+' settled stakes',tone(total.roi)],['Win rate',total.winRate===null?'—':total.winRate.toFixed(1)+'%',counted(total.won,'win')+' · '+counted(total.lost,'loss','losses'),'neutral'],['Open stake',money(total.openStake),counted(total.open,'unsettled ticket'),'neutral']];
    const days=data.days.map(d=>`<button type="button" class="profit-day ${d.settled?tone(d.profit):d.open?'pending':'empty'}${d.count?' has-bets':''}" data-calendar-day="${d.date}" aria-pressed="${this.selectedDay===d.date}" aria-label="${dateLabel(d.date)}: ${d.count?`${d.count} tickets, ${d.settled?'settled net '+signed(d.profit):'no settled results'}${d.open?', '+d.open+' open':''}`:'no tickets'}" title="${dateLabel(d.date)}${d.count?' · '+(d.settled?signed(d.profit)+' settled net':'Unsettled')+' · '+d.count+' tickets':''}"><span class="profit-day-number">${d.day}</span><strong>${d.settled?compact(d.profit):d.open?'Open':''}</strong><small>${d.count?d.count+(d.count===1?' bet':' bets')+(d.open?' · '+d.open+' open':''):''}</small></button>`).join('');
    this.root.innerHTML=`<div class="tracker-period"><div><span class="tracker-kicker">Performance</span><h2>${esc(monthLabel)}</h2></div><div class="tracker-month-controls"><button class="tracker-icon-button" data-month-step="-1" aria-label="Previous month"${this.month<='1900-01'?' disabled':''}>${icon('chevron')}</button><label class="tracker-month-input"><span class="sr-only">Calendar month</span><input type="month" data-calendar-month value="${this.month}" min="1900-01" max="2100-12" required></label><button class="tracker-icon-button" data-month-step="1" aria-label="Next month"${this.month>='2100-12'?' disabled':''}>${icon('chevron')}</button><button class="tracker-button" data-current-month>This month</button></div></div>
      <section class="tracker-metrics" aria-label="${esc(monthLabel)} totals">${metrics.map(([label,value,note,color])=>`<article><span>${label}</span><strong class="${color}">${value}</strong>${data.tickets.length?`<small>${note}</small>`:''}</article>`).join('')}</section>
      <div class="tracker-overview"><section class="profit-calendar" aria-labelledby="profit-calendar-title"><div class="tracker-panel-heading"><div><h3 id="profit-calendar-title">Profit calendar</h3><p>Settled net, grouped by date placed</p></div><span class="tracker-currency">USD</span></div><div class="calendar-weekdays" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="Daily ticket results for ${esc(monthLabel)}">${'<span class="calendar-blank" aria-hidden="true"></span>'.repeat(data.firstWeekday)}${days}</div><div class="calendar-key"><span><i class="positive"></i>Profit</span><span><i class="negative"></i>Loss</span><span><i class="pending"></i>Open</span><p>Select a day to see its tickets</p></div></section>
      <section class="tracker-month-detail" aria-labelledby="month-detail-title"><div class="tracker-panel-heading"><div><h3 id="month-detail-title">Monthly results</h3><p>${counted(data.tickets.length,'ticket')} · ${counted(data.activeDays,'active day')}</p></div>${icon('trends')}</div>${this.chart(data)}${data.settled?`<div class="tracker-month-facts"><div><span>Total returned</span><strong>${data.settled?money(data.returned):'—'}</strong><small>Includes returned stakes</small></div><div><span>Best day</span><strong class="${tone(data.bestDay?.profit)}">${data.bestDay?signed(data.bestDay.profit):'—'}</strong><small>${data.bestDay?dateLabel(data.bestDay.date):'No settled tickets'}</small></div></div>`:''}${data.books.length?`<div class="book-breakdown"><h4>By sportsbook</h4>${data.books.length?`<table><thead><tr><th scope="col">Book</th><th scope="col">Tickets</th><th scope="col">Net profit</th></tr></thead><tbody>${data.books.map(b=>`<tr><th scope="row">${esc(b.book)}</th><td>${b.count}</td><td class="${b.settled?tone(b.profit):''}">${b.settled?signed(b.profit):'—'}</td></tr>`).join('')}</tbody></table>`:''}</div>`:''}</section></div>
      <details class="tracker-accounting"><summary>How these totals work ${icon('info')}</summary><p>Calendar totals include all sports and books for this month. Dates are the date placed, not the settlement date. Open bets have no realized profit. Pushes and voids return the stake; ROI excludes those refunded stakes. Win rate uses wins and losses only. Ticket filters below do not change this overview.</p></details>`;
  }
  chart(data) {
    if(!data.settled)return '<div class="profit-chart-empty">'+icon('trends')+'<strong>No settled results yet</strong><span>Your settled tickets will appear here.</span></div>';
    const points=[{day:0,profit:0},...data.cumulative],min=Math.min(0,...points.map(p=>p.profit)),max=Math.max(0,...points.map(p=>p.profit)),range=max-min||1;
    const x=d=>42+d/data.days.length*370,y=v=>126-(v-min)/range*105;
    const path=points.map((p,i)=>(i?'L':'M')+x(p.day).toFixed(1)+','+y(p.profit).toFixed(1)).join(' ');
    return `<figure class="profit-chart"><figcaption><span>Cumulative net profit</span><strong class="${tone(data.total.profit)}">${signed(data.total.profit)}</strong></figcaption><svg viewBox="0 0 430 154" role="img" aria-label="Cumulative settled profit by bet date. Starts at zero and ends at ${signed(data.total.profit)}."><line x1="42" x2="412" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".24" stroke-dasharray="3 4"/><text x="3" y="${y(max)+4}">${compact(max)}</text>${min!==max?`<text x="3" y="${y(min)+4}">${compact(min)}</text>`:''}<path d="${path}" fill="none" stroke="var(--tracker-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${points.slice(1).map(p=>`<circle cx="${x(p.day)}" cy="${y(p.profit)}" r="2.5" fill="var(--tracker-accent)"><title>Day ${p.day}: ${signed(p.profit)}</title></circle>`).join('')}<text x="42" y="148">1</text><text x="402" y="148">${data.days.length}</text></svg><details><summary>Daily values</summary><div class="chart-data-scroll"><table><caption>Cumulative profit after each bet date</caption><thead><tr><th>Date</th><th>Net profit</th></tr></thead><tbody>${data.cumulative.map(p=>`<tr><th scope="row">${dateLabel(p.date)}</th><td>${signed(p.profit)}</td></tr>`).join('')}</tbody></table></div></details></figure>`;
  }
}
