const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import { decimal, decimalToAmerican } from './betting-math.js';
const american = value => { const odds = decimalToAmerican(value); return odds > 0 ? '+' + odds : String(odds); };
const odds = value => Number.isFinite(decimal(value)) ? (Number(value)>0 ? '+' : '')+Number(value) : '—';
const numericalLine = value => value == null || typeof value === 'boolean' || String(value).trim()==='' ? NaN : Number(value);
const line = value => Number.isFinite(numericalLine(value)) ? String(Number(Number(value).toFixed(3))) : '—';
const colors = ['var(--accent,#91c4ef)','var(--violet,#b8abe6)','var(--bright,#c2ddf5)','#d0c0e6','#7cabbc','#9782bb','#97c6dd','#c2b0dc','#6d909f','#a590b9','#d3e5ef','#dfd4ee'];
const stamp = time => new Date(time).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const validTime = item => Number.isFinite(Date.parse(item.ts));
const requestedMetric = (model,options) => (options.metric || model.historyMetric)==='line' ? 'line' : 'odds';
const metricFor = (model,options) => requestedMetric(model,options)==='line' && (model.history||[]).some(item=>validTime(item)&&Number.isFinite(numericalLine(item.line))) ? 'line' : 'odds';
export function historySeries(model, options={}) {
  const metric=metricFor(model,options);
  const records=(model.history||[]).filter(item=>validTime(item)&&Number.isFinite(metric==='line'?numericalLine(item.line):decimal(item.odds))).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
  const names=[...new Set([...(model.columns||[]).map(book=>book.name),...records.map(item=>item.book)])];
  return names.map((name,index)=>({name,color:colors[index%colors.length],mark:model.columns?.find(book=>book.name===name)?.mark||'',points:records.filter(item=>item.book===name)}));
}
export function lineHistoryView(model, options={}) {
  const metric=metricFor(model,options),series=historySeries(model,options),hours={hour:1,three:3,six:6,day:24,week:168};
  const range=options.range==='all'||Object.hasOwn(hours,options.range)?options.range:options.inline?'three':'hour';
  const selected=options.selected || new Set(series.map(item=>item.name));
  const end=Number.isFinite(options.now)?options.now:Date.now();
  const start=range==='all'?Math.min(end,...series.flatMap(item=>item.points.map(point=>Date.parse(point.ts)))):end-hours[range]*3600000;
  const inWindow=item=>item.points.filter(point=>Date.parse(point.ts)>=start&&Date.parse(point.ts)<=end);
  const shown=series.filter(item=>selected.has(item.name)).map(item=>({...item,points:inWindow(item)}));
  const points=shown.flatMap(item=>item.points),isLine=metric==='line',title=isLine?'Line movement':'Odds history';
  const fallback=requestedMetric(model,options)==='line'&&!isLine?'<p class="bet-history-fallback">No numerical line snapshots recorded. Showing recorded American odds.</p>':'';
  const toolbar=`<div class="bet-history-toolbar"><label class="bet-history-range"><span class="sr-only">History time range</span><select data-history-range aria-label="History time range">${[['hour','1 hour'],['three','3 hours'],['six','6 hours'],['day','24 hours'],['week','7 days'],['all','All history']].map(([key,label])=>`<option value="${key}" ${key===range?'selected':''}>${label}</option>`).join('')}</select></label><div class="bet-history-books" aria-label="Sportsbooks shown on chart">${series.map(item=>{
    const latest=inWindow(item).at(-1),latestValue=latest?(isLine?line(latest.line):odds(latest.odds)):'—';
    return `<button type="button" data-history-book="${esc(item.name)}" aria-pressed="${selected.has(item.name)}" aria-label="${selected.has(item.name)?'Hide':'Show'} ${esc(item.name)} history" title="${esc(item.name)}${latest?' · latest recorded '+(isLine?'line ':'odds ')+latestValue:' · no snapshots in this window'}" style="--series-color:${item.color}"><span class="bet-history-book-mark">${item.mark||`<span>${esc(item.name.slice(0,2))}</span>`}</span><span class="bet-history-book-name">${esc(item.name)}</span><strong class="bet-history-book-latest">${esc(latestValue)}</strong></button>`;
  }).join('')}</div><button type="button" data-history-all class="bet-history-all">${selected.size===series.length?'Clear':'All books'}</button></div>`;
  const heading=`<section class="bet-history-view" data-history-metric="${metric}"><h3>${title}</h3>${fallback}${toolbar}`;
  if(!points.length)return `${heading}<div class="bet-history-empty"><strong>${selected.size?'No recorded '+(isLine?'lines':'odds')+' in this window':'Choose a sportsbook'}</strong><p>${selected.size?'Choose a longer range to view earlier snapshots. History contains only saved or observed prices.':'Select one or more sportsbooks to compare their recorded history.'}</p>${selected.size?'<button type="button" data-history-show-all>Show all history</button>':''}</div></section>`;
  const width=Math.max(280,Math.min(1000,Number(options.width)||1000)),height=Number(options.height)|| (width<600?340:options.inline?310:370),left=60,right=width-40,top=20,bottom=height-50;
  const times=points.map(point=>Date.parse(point.ts)),first=Math.min(...times),from=range==='all'?first-30000:start,to=Math.max(end,from+60000);
  const value=point=>isLine?numericalLine(point.line):decimal(point.odds),values=points.map(value),low=Math.min(...values),high=Math.max(...values);
  const pad=Math.max(isLine?.5:.06,(high-low)*.12),min=isLine?low-pad:Math.max(1.01,low-pad),max=high+pad;
  const x=time=>left+(Date.parse(time)-from)/(to-from)*(right-left),y=n=>bottom-(n-min)/(max-min)*(bottom-top);
  const label=n=>isLine?line(n):american(n);
  const grid=Array.from({length:6},(_,i)=>{const n=min+(max-min)*i/5,cy=bottom-(bottom-top)*i/5;return `<line x1="${left}" y1="${cy}" x2="${right}" y2="${cy}"/><text x="${left-12}" y="${cy+4}" text-anchor="end">${label(n)}</text>`;}).join('');
  const tickCount=width<600?3:7;
  const ticks=Array.from({length:tickCount},(_,i)=>{const cx=left+(right-left)*i/(tickCount-1),time=from+(to-from)*i/(tickCount-1);return `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}"/><text x="${cx}" y="${bottom+26}" text-anchor="middle">${new Date(time).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</text>`;}).join('');
  const stepPath=entries=>entries.map((point,index)=>{const continuous=index>0&&Date.parse(point.ts)-Date.parse(entries[index-1].ts)<=15*60_000;return `${continuous?'H':'M'}${x(point.ts).toFixed(2)}${continuous?' V':','}${y(value(point)).toFixed(2)}`;}).join(' ');
  const traces=shown.filter(item=>item.points.length).map(item=>`<g class="bet-history-trace" style="color:${item.color}">${item.points.length>1?`<path d="${stepPath(item.points)}"/>`:''}${item.points.map(point=>{
    const displayValue=isLine?line(point.line):odds(point.odds);
    return `<circle cx="${x(point.ts)}" cy="${y(value(point))}" r="3.5"/><circle class="bet-history-hit" tabindex="0" role="img" aria-label="${esc(item.name)}: ${isLine?'line ':''}${esc(displayValue)}, ${esc(stamp(point.ts))}" data-history-point data-book="${esc(item.name)}" data-value="${esc(displayValue)}" data-metric="${metric}" data-odds="${esc(odds(point.odds))}" data-line="${esc(line(point.line))}" data-time="${esc(stamp(point.ts))}" cx="${x(point.ts)}" cy="${y(value(point))}" r="9"><title>${esc(item.name)} · ${isLine?'Line ':''}${esc(displayValue)} · ${esc(stamp(point.ts))}</title></circle>`;
  }).join('')}</g>`).join('');
  const activeSeries=shown.filter(item=>item.points.length),averageTimes=[...new Set(times)].sort((a,b)=>a-b).filter(time=>activeSeries.every(item=>Date.parse(item.points[0].ts)<=time));
  const averagePoints=activeSeries.length>1?averageTimes.map(time=>{
    const latest=activeSeries.map(item=>item.points.findLast(point=>Date.parse(point.ts)<=time));
    return isLine?{ts:new Date(time).toISOString(),line:latest.reduce((sum,point)=>sum+numericalLine(point.line),0)/latest.length}:{ts:new Date(time).toISOString(),odds:Number(american(1/(latest.reduce((sum,point)=>sum+1/decimal(point.odds),0)/latest.length)))};
  }):[];
  const average=averagePoints.length>1?`<g class="bet-history-average"><path d="${stepPath(averagePoints)}"/><title>${isLine?'Average latest recorded line':'Average implied price'} across selected sportsbooks</title></g>`:'';
  const snapshots=points.slice().sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts));
  return `${heading}<div class="bet-history-plot"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Recorded ${isLine?'betting lines':'American odds'} over time for ${esc(model.selection)}"><g class="bet-history-grid">${grid}${ticks}</g>${average}${traces}</svg><div class="bet-history-tooltip" hidden></div></div><div class="bet-history-caption"><span>${average?'<i class="bet-history-average-key"></i> AVG · ':''}${points.length} recorded ${points.length===1?'snapshot':'snapshots'} · ${esc(model.selection)}</span><span>${shown.some(item=>item.points.length>1)?'Latest recorded values appear in the legend. Select a point for details.':'One snapshot per book; movement appears only after more prices are recorded.'}</span></div><details class="bet-history-records"><summary>Recorded prices</summary><div><table><thead><tr><th>Sportsbook</th><th>Observed</th><th>Line</th><th>Odds</th></tr></thead><tbody>${snapshots.map(point=>`<tr><td>${esc(point.book)}</td><td>${esc(stamp(point.ts))}</td><td>${esc(line(point.line))}</td><td>${esc(odds(point.odds))}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}

export function bindHistory(root,model,options={}) {
  let range=options.range||(options.inline?'three':'hour'),selected=options.selected?new Set(options.selected):new Set(historySeries(model,options).map(item=>item.name));
  const render=()=>{root.innerHTML=(options.onExpand?'<button type="button" class="bet-history-inline-expand" data-history-expand>Expand chart</button>':'')+lineHistoryView(model,{...options,range,selected,width:root.clientWidth||Math.min(1000,window.innerWidth-64),height:root.closest('dialog')&&window.innerHeight<500?Math.max(160,window.innerHeight-175):undefined});const caption=root.querySelector('.bet-history-caption');if(caption)caption.insertAdjacentHTML('beforeend','<span>Gaps over 15 minutes are not connected. Unrecorded prices are unknown.</span>');};
  const change=event=>{if(event.target.matches('[data-history-range]')){range=event.target.value;render();}};
  const click=event=>{
    if(event.target.closest('[data-history-expand]'))return options.onExpand?.();
    const book=event.target.closest('[data-history-book]');
    if(book){const name=book.dataset.historyBook;selected.has(name)?selected.delete(name):selected.add(name);render();root.querySelector(`[data-history-book="${CSS.escape(name)}"]`)?.focus();}
    if(event.target.closest('[data-history-all]')){const names=historySeries(model,options).map(item=>item.name);selected=selected.size===names.length?new Set():new Set(names);render();}
    if(event.target.closest('[data-history-show-all]')){range='all';render();}
  };
  const showPoint=event=>{
    const point=event.target.closest('[data-history-point]');if(!point)return;
    const tooltip=root.querySelector('.bet-history-tooltip'),plot=root.querySelector('.bet-history-plot');if(!tooltip||!plot)return;
    const box=plot.getBoundingClientRect(),p=point.getBoundingClientRect();
    tooltip.innerHTML=`<small>${esc(point.dataset.time)}</small><strong>${esc(point.dataset.book)} <b>${point.dataset.metric==='line'?'Line ':''}${esc(point.dataset.value)}</b></strong><span>${point.dataset.metric==='line'?'Odds '+esc(point.dataset.odds):'Line '+esc(point.dataset.line)}</span>`;
    tooltip.hidden=false;tooltip.style.left=plot.scrollLeft+Math.max(8,Math.min(box.width-200,p.x-box.x-70))+'px';tooltip.style.top=Math.max(8,p.y-box.y-90)+'px';
  };
  const hide=()=>{const tip=root.querySelector('.bet-history-tooltip');if(tip)tip.hidden=true;};
  const listeners={change,click:event=>{click(event);showPoint(event);},pointerover:showPoint,focusin:showPoint,pointerout:event=>{if(event.pointerType!=='touch')hide();},focusout:hide};
  for(const [type,handler] of Object.entries(listeners))root.addEventListener(type,handler);
  render();
  let width=0,frame=0;
  const observer=new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(!next||next===width)return;width=next;cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});
  observer.observe(root);
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();for(const [type,handler] of Object.entries(listeners))root.removeEventListener(type,handler);};
}
