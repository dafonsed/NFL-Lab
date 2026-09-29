const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decimal=n=>Number(n)>=100?1+Number(n)/100:Number(n)<=-100?1+100/-Number(n):NaN;
const american=d=>d>=2?'+'+Math.round((d-1)*100):String(Math.round(-100/(d-1)));
const odds=n=>Number(n)>0?'+'+Number(n):String(Number(n));
const numeric=n=>n!==null&&n!==''&&n!==undefined&&Number.isFinite(Number(n));
const line=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const colors=['#72b3df','#74c7a2','#e9c96d','#dc9390','#b59bd8','#73bec2','#d789ae','#a9ca81','#d3a174','#9bafdd'];
const ranges={hour:['1 hour',1],three:['3 hours',3],six:['6 hours',6],day:['24 hours',24],all:['All history',null]};
const stamp=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export function referenceHistorySeries(model,metric='line'){
  const records=(model.history||[]).filter(p=>Number.isFinite(Date.parse(p.ts))&&(metric==='line'?numeric(p.line):Number.isFinite(decimal(p.odds)))).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
  const names=[...new Set([...(model.columns||[]).map(b=>b.name),...records.map(p=>p.book)])];
  return names.map((name,index)=>({name,color:colors[index%colors.length],mark:model.columns?.find(b=>b.name===name)?.mark||'',points:records.filter(p=>p.book===name)}));
}
function windowPoints(points,from,to){
  const preceding=points.findLast(p=>Date.parse(p.ts)<from);
  return [...(preceding&&from-Date.parse(preceding.ts)<=15*60_000?[preceding]:[]),...points.filter(p=>Date.parse(p.ts)>=from&&Date.parse(p.ts)<=to)];
}
export function referenceHistoryView(model,{metric='line',range='three',selected,width=1400,height}={}){
  const series=referenceHistorySeries(model,metric),chosen=selected||new Set(series.map(s=>s.name));
  const allPoints=series.flatMap(s=>s.points),latest=allPoints.length?Math.max(...allPoints.map(p=>Date.parse(p.ts))):Date.now();
  const earliest=allPoints.length?Math.min(...allPoints.map(p=>Date.parse(p.ts))):latest;
  const from=range==='all'?earliest-60000:latest-ranges[range][1]*3600000,to=latest+Math.max(60000,(latest-from)*.015);
  const shown=series.filter(s=>chosen.has(s.name)).map(s=>({...s,points:windowPoints(s.points,from,to)}));
  const points=shown.flatMap(s=>s.points),value=p=>metric==='line'?Number(p.line):decimal(p.odds),format=v=>metric==='line'?line(v):american(v);
  const toolbar=`<div class="bet-reference-chart-toolbar"><details class="bet-reference-range"><summary>${ranges[range][0]}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div>${Object.entries(ranges).map(([key,[label]])=>`<button type="button" data-reference-range="${key}" aria-pressed="${range===key}">${label}</button>`).join('')}</div></details><div class="bet-reference-legend" aria-label="Sportsbooks on chart">${series.map(s=>{const end=s.points.at(-1);return `<button type="button" data-reference-book="${esc(s.name)}" aria-label="${chosen.has(s.name)?'Hide':'Show'} ${esc(s.name)} on chart" aria-pressed="${chosen.has(s.name)}" style="--series-color:${s.color}"><i aria-hidden="true"></i>${s.mark}<span>${esc(s.name)}</span><b>${end?format(value(end)):'—'}</b></button>`;}).join('')}</div></div>`;
  if(!points.length)return `${toolbar}<div class="bet-reference-empty"><strong>${chosen.size?'No recorded '+(metric==='line'?'lines':'odds'):'Choose a sportsbook'}</strong><p>${chosen.size?'Saved price snapshots will appear here when available.':'Select a sportsbook above to show its history.'}</p></div>`;
  const W=Math.max(280,Math.min(1400,Number(width)||1400)),phone=W<600,H=Number(height)||(phone?340:Math.max(390,shown.filter(s=>s.points.length).length*32+68)),L=phone?48:70,R=W-(phone?18:140),T=22,B=H-46;
  const side=String(model.side||'').toLowerCase();
  const values=points.map(value),selection=metric==='line'&&['over','under'].includes(side)&&numeric(model.rawLine)?Number(model.rawLine):null;
  if(selection!==null)values.push(selection);
  const low=Math.min(...values),high=Math.max(...values),pad=metric==='line'?Math.max(.75,(high-low)*.13):Math.max(.04,(high-low)*.12);
  const rough=(high-low+pad*2)/5,magnitude=10**Math.floor(Math.log10(rough));
  const step=metric==='line'?[1,2,2.5,5,10].map(n=>n*magnitude).find(n=>n>=rough)||magnitude*10:rough;
  const min=metric==='line'?Math.floor((low-pad)/step)*step:Math.max(1.01,low-pad),max=metric==='line'?Math.ceil((high+pad)/step)*step:high+pad;
  const x=ts=>L+Math.max(0,Math.min(1,(Date.parse(ts)-from)/(to-from)))*(R-L),y=n=>B-(n-min)/(max-min)*(B-T);
  const gridCount=metric==='line'?Math.round((max-min)/step):5;
  const grid=Array.from({length:gridCount+1},(_,i)=>{const v=min+(max-min)*i/gridCount,cy=y(v);return `<line x1="${L}" y1="${cy}" x2="${R}" y2="${cy}"/><text x="${L-12}" y="${cy+5}" text-anchor="end">${format(v)}</text>`;}).join('');
  const tickCount=phone?3:6;
  const ticks=Array.from({length:tickCount},(_,i)=>{const cx=L+(R-L)*i/(tickCount-1),t=from+(to-from)*i/(tickCount-1);return `<line x1="${cx}" y1="${T}" x2="${cx}" y2="${B}"/><text x="${cx}" y="${B+31}" text-anchor="middle">${new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</text>`;}).join('');
  const active=shown.filter(s=>s.points.length),endpoints=active.map(s=>({name:s.name,y:y(value(s.points.at(-1)))})).sort((a,b)=>a.y-b.y);
  const gap=Math.min(32,(B-T-28)/Math.max(1,endpoints.length-1));
  for(let i=0;i<endpoints.length;i++)endpoints[i].labelY=Math.max(T+14,endpoints[i].y,i?endpoints[i-1].labelY+gap:T+14);
  if(endpoints.length&&endpoints.at(-1).labelY>B-14){endpoints.at(-1).labelY=B-14;for(let i=endpoints.length-2;i>=0;i--)endpoints[i].labelY=Math.min(endpoints[i].labelY,endpoints[i+1].labelY-gap);}
  const endY=new Map(endpoints.map(p=>[p.name,p.labelY]));
  const traces=active.map(s=>{
    const path=s.points.map((p,i)=>{const continuous=i>0&&Date.parse(p.ts)-Date.parse(s.points[i-1].ts)<=15*60_000;return `${continuous?'H':'M'}${x(p.ts).toFixed(2)}${continuous?' V':','}${y(value(p)).toFixed(2)}`;}).join(' ');
    const end=s.points.at(-1),cy=y(value(end)),labelY=endY.get(s.name),src=/\bsrc="([^"]+)"/.exec(s.mark)?.[1];
    return `<g class="bet-reference-trace" style="color:${s.color}"><path d="${path}"/>${s.points.map(p=>`<circle class="bet-reference-point" cx="${x(p.ts)}" cy="${y(value(p))}" r="7" tabindex="0" role="img" aria-label="${esc(s.name)}: ${format(value(p))}, ${esc(stamp(p.ts))}" data-reference-point data-book="${esc(s.name)}" data-time="${esc(stamp(p.ts))}" data-line="${esc(p.line??'—')}" data-odds="${numeric(p.odds)?odds(p.odds):'—'}"><title>${esc(s.name)}: ${format(value(p))} · ${esc(stamp(p.ts))}</title></circle>`).join('')}${phone?'':`<path class="bet-reference-leader" d="M${R},${cy} L${R+14},${labelY}"/><rect class="bet-reference-end-bg" x="${R+14}" y="${labelY-14}" width="101" height="28" rx="14"/>${src?`<image href="${src}" x="${R+17}" y="${labelY-12}" width="24" height="24"/>`:''}<text class="bet-reference-end-value" x="${R+(src?73:64)}" y="${labelY+5}" text-anchor="middle">${format(value(end))}</text>`}</g>`;
  }).join('');
  const selectionY=selection===null?0:y(selection),under=side==='under',selectionLabel=(under?'U ':'O ')+(selection===null?'':line(selection));
  const shade=selection===null?'':`<rect class="bet-reference-selection-fill" x="${L}" y="${under?selectionY:T}" width="${R-L}" height="${under?B-selectionY:selectionY-T}"/><line class="bet-reference-selection-line" x1="${L}" x2="${R}" y1="${selectionY}" y2="${selectionY}"/>`;
  const tag=selection===null?'':`<g class="bet-reference-selection-tag"><rect x="${L+10}" y="${selectionY-18}" width="94" height="30" rx="15"/><text x="${L+57}" y="${selectionY+2}" text-anchor="middle">${selectionLabel}</text></g>`;
  return `${toolbar}<div class="bet-reference-plot" role="region" aria-label="Recorded ${metric==='line'?'line movement':'odds history'}; select a point for recorded price details" tabindex="0"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Recorded ${metric==='line'?'line thresholds':'American odds'} for ${esc(model.selection)}">${shade}<g class="bet-reference-grid">${grid}${ticks}</g>${traces}${tag}</svg><div class="bet-reference-tooltip" role="status" hidden></div></div><div class="bet-reference-chart-caption"><span>${points.length} recorded ${points.length===1?'snapshot':'snapshots'} · ${metric==='line'?'Line movement':'Odds history'}</span><span>Last recorded ${esc(stamp(latest))}. Gaps over 15 minutes are not connected.</span></div>`;
}
export function bindReferenceHistory(root,model,options={}){
  const {metric='line',book,fullscreen=false}=options,controller=new AbortController(),signal=controller.signal;
  let range=options.range||'three',selected=new Set(options.selected|| (book?[book]:referenceHistorySeries(model,metric).map(s=>s.name)));
  const render=()=>{root.innerHTML=(fullscreen?'':'<button type="button" class="bet-reference-expand" data-reference-expand>Expand chart</button>')+referenceHistoryView(model,{metric,range,selected,width:root.clientWidth||Math.min(1400,window.innerWidth-64),height:fullscreen&&window.innerHeight<500?Math.max(160,window.innerHeight-180):undefined});};
  const openExpanded=()=>{
    const dialog=document.createElement('dialog');dialog.className='bet-reference-dialog';dialog.setAttribute('aria-label','Recorded '+(metric==='line'?'line movement':'odds history'));
    dialog.innerHTML='<header><h2>Recorded price history</h2><button type="button" data-reference-close>Close chart</button></header><div class="bet-expanded-card"><div class="bet-reference-root"></div></div>';
    document.body.append(dialog);dialog.showModal();const dispose=bindReferenceHistory(dialog.querySelector('.bet-reference-root'),model,{metric,range,selected,fullscreen:true});
    dialog.querySelector('[data-reference-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{dispose();dialog.remove();root.querySelector('[data-reference-expand]')?.focus({preventScroll:true});},{once:true});
    dialog.querySelector('[data-reference-close]').focus();
  };
  const show=event=>{const p=event.target.closest('[data-reference-point]');if(!p)return;const tip=root.querySelector('.bet-reference-tooltip'),plot=root.querySelector('.bet-reference-plot'),box=plot.getBoundingClientRect(),pos=p.getBoundingClientRect();tip.innerHTML=`<strong>${esc(p.dataset.book)}</strong><span>Line ${esc(p.dataset.line)} · Odds ${esc(p.dataset.odds)}</span><small>${esc(p.dataset.time)}</small>`;tip.hidden=false;tip.style.left=(plot.scrollLeft+Math.max(4,Math.min(box.width-205,pos.x-box.x)))+'px';tip.style.top=Math.max(0,pos.y-box.y-85)+'px';};
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-reference-expand]'))return openExpanded();
    const choice=event.target.closest('[data-reference-range]'),toggle=event.target.closest('[data-reference-book]');
    if(choice){range=choice.dataset.referenceRange;render();root.querySelector('.bet-reference-range summary')?.focus();}
    if(toggle){const name=toggle.dataset.referenceBook;selected.has(name)?selected.delete(name):selected.add(name);render();root.querySelector('[data-reference-book="'+CSS.escape(name)+'"]')?.focus();}
    show(event);
  },{signal});
  const hide=()=>{const tip=root.querySelector('.bet-reference-tooltip');if(tip)tip.hidden=true;};
  root.addEventListener('pointerover',show,{signal});root.addEventListener('focusin',show,{signal});root.addEventListener('pointerout',event=>{if(event.pointerType!=='touch')hide();},{signal});root.addEventListener('focusout',hide,{signal});render();
  let width=0,frame=0;const observer=new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(!next||width===next)return;width=next;cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});observer.observe(root);
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();controller.abort();};
}
