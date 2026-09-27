const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decimal = value => Number(value) >= 100 ? 1 + Number(value)/100 : Number(value) <= -100 ? 1 + 100/-Number(value) : NaN;
const american = value => value >= 2 ? '+' + Math.round((value-1)*100) : String(Math.round(-100/(value-1)));
const odds = value => Number(value)>0 ? '+'+Number(value) : String(Number(value));
const colors = ['#d4ad65','#bb8862','#a7b681','#7ba4b6','#ac92bf','#d5cc84','#75bfa4','#d68b87','#939ec6','#bcac92','#a2c6cc','#c6a4af'];
const stamp = time => new Date(time).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export function historySeries(model) {
  const records = (model.history || []).filter(item=>Number.isFinite(Date.parse(item.ts)) && Number.isFinite(decimal(item.odds))).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
  const names = [...new Set([...(model.columns || []).map(book=>book.name),...records.map(item=>item.book)])];
  return names.map((name,index)=>({name,color:colors[index%colors.length],mark:model.columns?.find(book=>book.name===name)?.mark || '',points:records.filter(item=>item.book===name)}));
}
export function lineHistoryView(model, options={}) {
  const series = historySeries(model), range=options.range || 'hour';
  const selected = options.selected || new Set(series.map(item=>item.name));
  const end = Date.now(), hours={hour:1,six:6,day:24,week:168};
  const start = range==='all' ? Math.min(end,...series.flatMap(item=>item.points.map(point=>Date.parse(point.ts)))) : end-hours[range]*3600000;
  const shown = series.filter(item=>selected.has(item.name)).map(item=>({...item,points:item.points.filter(point=>Date.parse(point.ts)>=start)}));
  const points = shown.flatMap(item=>item.points);
  const toolbar = `<div class="bet-history-toolbar"><label class="bet-history-range"><span class="sr-only">History time range</span><select data-history-range aria-label="History time range">${[['hour','1 hour'],['six','6 hours'],['day','24 hours'],['week','7 days'],['all','All history']].map(([key,label])=>`<option value="${key}" ${key===range?'selected':''}>${label}</option>`).join('')}</select></label><div class="bet-history-books" aria-label="Sportsbooks shown on chart">${series.map(item=>`<button type="button" data-history-book="${esc(item.name)}" aria-pressed="${selected.has(item.name)}" aria-label="${selected.has(item.name)?'Hide':'Show'} ${esc(item.name)} history" title="${esc(item.name)}${item.points.length?'':' · no recorded prices'}" style="--series-color:${item.color}">${item.mark || `<span>${esc(item.name.slice(0,2))}</span>`}</button>`).join('')}</div><button type="button" data-history-all class="bet-history-all">${selected.size===series.length?'Clear':'All books'}</button></div>`;
  if (!points.length) return `<section class="bet-history-view"><h3>Line History</h3>${toolbar}<div class="bet-history-empty"><strong>${selected.size?'No recorded prices in this window':'Choose a sportsbook'}</strong><p>${selected.size?'Choose a longer range to view earlier snapshots. Prices are recorded when a quote is saved or updated.':'Select one or more sportsbook icons to compare their recorded prices.'}</p>${selected.size?'<button type="button" data-history-show-all>Show all history</button>':''}</div></section>`;
  const width=1200,height=490,left=48,right=1110,top=24,bottom=444;
  const times=points.map(point=>Date.parse(point.ts)), first=Math.min(...times),last=Math.max(...times);
  const from=range==='all' ? first-30000 : start, to=Math.max(end,last,from+60000);
  const values=points.map(point=>decimal(point.odds));
  const low=Math.min(...values),high=Math.max(...values),pad=Math.max(.06,(high-low)*.12),min=Math.max(1.01,low-pad),max=high+pad;
  const x=time=>left+(Date.parse(time)-from)/(to-from)*(right-left),y=price=>bottom-(decimal(price)-min)/(max-min)*(bottom-top);
  const grid=Array.from({length:6},(_,i)=>{const value=min+(max-min)*i/5,cy=bottom-(bottom-top)*i/5;return `<line x1="${left}" y1="${cy}" x2="${right}" y2="${cy}"/><text x="${left-12}" y="${cy+4}" text-anchor="end">${american(value)}</text>`;}).join('');
  const ticks=Array.from({length:7},(_,i)=>{const cx=left+(right-left)*i/6,time=from+(to-from)*i/6;return `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}"/><text x="${cx}" y="${bottom+26}" text-anchor="middle">${new Date(time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</text>`;}).join('');
  const traces=shown.filter(item=>item.points.length).map(item=>{
    const path=item.points.map((point,index)=>`${index?'H':'M'}${x(point.ts).toFixed(2)}${index?' V':','}${y(point.odds).toFixed(2)}`).join(' ');
    const final=item.points.at(-1);
    return `<g class="bet-history-trace" style="color:${item.color}">${item.points.length>1?`<path d="${path}"/>`:''}${item.points.map(point=>`<circle cx="${x(point.ts)}" cy="${y(point.odds)}" r="3.5"/><circle class="bet-history-hit" tabindex="0" role="img" aria-label="${esc(item.name)}: ${odds(point.odds)}, line ${esc(point.line??'—')}, ${esc(stamp(point.ts))}" data-history-point data-book="${esc(item.name)}" data-odds="${esc(odds(point.odds))}" data-line="${esc(point.line??'—')}" data-time="${esc(stamp(point.ts))}" cx="${x(point.ts)}" cy="${y(point.odds)}" r="9"><title>${esc(item.name)} · ${odds(point.odds)} · ${esc(stamp(point.ts))}</title></circle>`).join('')}<rect x="${right+9}" y="${y(final.odds)-10}" width="65" height="20" rx="10"/><text class="bet-history-end" x="${right+41}" y="${y(final.odds)+4}" text-anchor="middle">${odds(final.odds)}</text></g>`;
  }).join('');
  const activeSeries=shown.filter(item=>item.points.length);
  const averageTimes=[...new Set(times)].sort((a,b)=>a-b).filter(time=>activeSeries.every(item=>Date.parse(item.points[0].ts)<=time));
  const averagePoints=activeSeries.length>1?averageTimes.map(time=>{const probabilities=activeSeries.map(item=>1/decimal(item.points.findLast(point=>Date.parse(point.ts)<=time).odds));return {ts:new Date(time).toISOString(),odds:Number(american(1/(probabilities.reduce((sum,value)=>sum+value,0)/probabilities.length)))};}):[];
  const average=averagePoints.length>1?`<g class="bet-history-average"><path d="${averagePoints.map((point,index)=>`${index?'H':'M'}${x(point.ts).toFixed(2)}${index?' V':','}${y(point.odds).toFixed(2)}`).join(' ')}"/><title>Average implied price across the latest recorded snapshot for each selected sportsbook</title></g>`:'';
  const snapshots=points.slice().sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts));
  return `<section class="bet-history-view"><h3>Line History</h3>${toolbar}<div class="bet-history-plot"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorded American odds over time for ${esc(model.selection)}"><g class="bet-history-grid">${grid}${ticks}</g>${average}${traces}</svg><div class="bet-history-tooltip" hidden></div></div><div class="bet-history-caption"><span>${average ? '<i class="bet-history-average-key"></i> AVG · ' : ''}${points.length} recorded ${points.length===1?'price':'prices'} · ${esc(model.selection)}</span><span>${shown.some(item=>item.points.length>1)?'Select a point for its time, odds and line.':'One snapshot per book; movement appears after more prices are recorded.'}</span></div><details class="bet-history-records"><summary>Recorded prices</summary><div><table><thead><tr><th>Sportsbook</th><th>Observed</th><th>Line</th><th>Odds</th></tr></thead><tbody>${snapshots.map(point=>`<tr><td>${esc(point.book)}</td><td>${esc(stamp(point.ts))}</td><td>${esc(point.line??'—')}</td><td>${odds(point.odds)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}

export function bindHistory(root, model) {
  let range='hour', selected=new Set(historySeries(model).map(item=>item.name));
  const render=()=>{root.innerHTML=lineHistoryView(model,{range,selected});const plot=root.querySelector('.bet-history-plot');if(plot)plot.scrollLeft=plot.scrollWidth-plot.clientWidth;};
  root.addEventListener('change',event=>{if(event.target.matches('[data-history-range]')){range=event.target.value;render();}});
  root.addEventListener('click',event=>{
    const book=event.target.closest('[data-history-book]');
    if(book){const name=book.dataset.historyBook;selected.has(name)?selected.delete(name):selected.add(name);render();root.querySelector(`[data-history-book="${CSS.escape(name)}"]`)?.focus();}
    if(event.target.closest('[data-history-all]')){const names=historySeries(model).map(item=>item.name);selected=selected.size===names.length?new Set():new Set(names);render();}
    if(event.target.closest('[data-history-show-all]')){range='all';render();}
  });
  const showPoint=event=>{
    const point=event.target.closest('[data-history-point]');if(!point)return;
    const tooltip=root.querySelector('.bet-history-tooltip'), plot=root.querySelector('.bet-history-plot'),box=plot.getBoundingClientRect(),p=point.getBoundingClientRect();
    tooltip.innerHTML=`<small>${esc(point.dataset.time)}</small><strong>${esc(point.dataset.book)} <b>${esc(point.dataset.odds)}</b></strong><span>Line ${esc(point.dataset.line)}</span>`;
    tooltip.hidden=false;tooltip.style.left=plot.scrollLeft+Math.max(8,Math.min(box.width-200,p.x-box.x-70))+'px';tooltip.style.top=Math.max(8,p.y-box.y-90)+'px';
  };
  root.addEventListener('pointerover',showPoint);root.addEventListener('focusin',showPoint);
  const hide=()=>{const tip=root.querySelector('.bet-history-tooltip');if(tip)tip.hidden=true;};
  root.addEventListener('pointerout',hide);root.addEventListener('focusout',hide);render();
}
