import {icon} from './ui-icons.js';
import {bindComparisonLines, snapComparisonLine} from './chart-line.js';
import {DEMO_SPORTS, DEMO_PLAYERS, demoGames, demoSummary} from './demo-data.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>value===null?'—':Number.isInteger(value)?String(value):value.toFixed(1);
const defaults=()=>({view:'research',player:DEMO_PLAYERS[0].id,market:'yards',window:'10',venue:'all',side:'over',aside:'matchup',position:'all',lines:{},saved:new Set(),notes:{},game:null,search:'',sport:'all',savedOnly:false,sort:'rate'});
const segment=(name,choices,value)=>`<div class="demo-segment" role="group" aria-label="${name}">${choices.map(([key,label])=>`<button type="button" data-demo-${name}="${key}" data-focus="${name}-${key}" aria-pressed="${value===key}">${label}</button>`).join('')}</div>`;

export function mountLandingDemo(root) {
  let state=defaults(),unbindLine,dragStart=null,resizeFrame;
  const research=root.querySelector('#demo-research'),trends=root.querySelector('#demo-trends'),tabs=[...root.querySelectorAll('.landing-preview-tabs [role=tab]')];
  const player=()=>DEMO_PLAYERS.find(p=>p.id===state.player);
  const market=()=>DEMO_SPORTS[player().sport].markets.find(m=>m[0]===state.market);
  const key=()=>state.player+':'+state.market;
  const line=()=>state.lines[key()]??market()[2];
  const games=()=>demoGames(player(),state);
  const announce=text=>{root.querySelector('#demo-feedback').textContent=text;};
  const chartResult=value=>value===line()?'push':(state.side==='under'?value<line():value>line())?'hit':'miss';
  const header=()=>`<div class="demo-player-header"><div class="demo-avatar">${player().initials}<span>${icon(DEMO_SPORTS[player().sport].icon)}</span></div><div class="demo-player-identity"><span>${DEMO_SPORTS[player().sport].label} · ${player().team} vs ${player().opponent} · ${player().position}</span><h2>${player().name}</h2><p>${market()[1]} <span>· Fictional player</span></p></div><button type="button" class="demo-button demo-save${state.saved.has(state.player)?' is-saved':''}" data-demo-save="${state.player}" aria-pressed="${state.saved.has(state.player)}" data-focus="save">${icon(state.saved.has(state.player)?'check':'bookmark')}<span>${state.saved.has(state.player)?'Saved in demo':'Save in demo'}</span></button></div>`;
  function setView(view,focus=false) {
    state.view=view;
    for(const tab of tabs){const selected=tab.id===`preview-${view}-tab`;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;root.querySelector('#'+tab.getAttribute('aria-controls')).hidden=!selected;if(selected&&focus)tab.focus();}
    render();
    announce(view==='trends'?'Search, save, or open a sample player.':'Try a filter or drag the comparison line.');
  }
  function restoreFocus(id){if(id)(root.querySelector(`[data-focus="${id}"]`)||(state.view==='trends'?trends:research).querySelector('.demo-empty button'))?.focus({preventScroll:true});}
  function render() {
    const focus=document.activeElement?.dataset.focus;
    unbindLine?.();
    if(state.view==='research')renderResearch();else renderTrends();
    root.querySelector('#demo-open-research').href='/'+player().sport+(state.view==='trends'?'?view=trends':'');
    restoreFocus(focus);
  }
  function renderResearch() {
    const p=player(),config=DEMO_SPORTS[p.sport];
    research.innerHTML=`<div class="demo-selectors"><label>Sport<select aria-label="Sport" data-demo-field="league" data-focus="league">${Object.entries(DEMO_SPORTS).map(([id,s])=>`<option value="${id}"${p.sport===id?' selected':''}>${s.label}</option>`).join('')}</select></label><label>Sample player<select aria-label="Sample player" data-demo-field="player" data-focus="player">${DEMO_PLAYERS.filter(item=>item.sport===p.sport).map(item=>`<option value="${item.id}"${p.id===item.id?' selected':''}>${item.name}</option>`).join('')}</select></label><span class="demo-help">${icon('settings')}Change a filter. See what changes.</span></div>
      ${header()}<div class="demo-markets" role="group" aria-label="Player statistic">${config.markets.map(([id,label])=>`<button type="button" data-demo-market="${id}" data-focus="market-${id}" aria-pressed="${state.market===id}">${label}</button>`).join('')}</div>
      <div class="demo-research-grid"><div class="demo-main"><div class="demo-chart-controls">${segment('window',[['5','L5'],['10','L10'],['20','L20'],['h2h','H2H']],state.window)}<label class="demo-venue"><span class="demo-sr">Game location</span><select aria-label="Game location" data-demo-field="venue" data-focus="venue"><option value="all"${state.venue==='all'?' selected':''}>Home + away</option><option value="home"${state.venue==='home'?' selected':''}>Home only</option><option value="away"${state.venue==='away'?' selected':''}>Away only</option></select></label></div>
      <div class="demo-chart-heading"><div><h3>${p.name} <span>· ${market()[1]}</span></h3><div class="demo-hit-rate"><strong data-demo-rate></strong><span data-demo-side-label></span></div><p data-demo-count></p></div><dl class="demo-metrics"><div><dt>Average</dt><dd data-demo-average></dd></div><div><dt>Median</dt><dd data-demo-median></dd></div><div><dt>Range</dt><dd data-demo-range></dd></div></dl></div>
      <div class="demo-line-tools">${segment('side',[['over','Over'],['under','Under']],state.side)}<label>Compare line<input data-demo-field="line" data-focus="line" aria-label="Comparison line" type="number" min="0" max="${market()[3]}" step="0.5" value="${line()}"></label><button type="button" class="demo-text-button" data-demo-line-reset data-focus="line-reset">Reset line</button></div>
      <div class="demo-chart-scroll" tabindex="0" role="region" aria-label="Sample game chart; scroll horizontally for more games"><div class="demo-chart"></div></div>
      <div class="demo-chart-caption"><span><i class="demo-dot hit"></i>${state.side==='over'?'Above':'Below'} line <i class="demo-dot miss"></i>${state.side==='over'?'Below':'Above'} line <i class="demo-dot push"></i>Tied</span><span>Oldest → newest</span></div>
      <p class="demo-drag-hint">${icon('settings')} Drag the cyan line or use its arrow keys. Select a bar for game details.</p><div class="demo-game-detail" aria-live="polite"></div>
      <div class="demo-support"><h3>Supporting stats <span>Same sample</span></h3><div>${config.markets.map(([id,label])=>`<dl><dt>${label}</dt><dd>${num(demoSummary(games(),id,0).average)} <small>/ game</small></dd></dl>`).join('')}</div></div>
      <details class="demo-game-log"><summary>View sample game log ${icon('chevron')}</summary><div class="demo-table-scroll"><table><caption class="demo-sr">Sample games for ${p.name}</caption><thead><tr><th>Game</th><th>Opponent</th>${config.markets.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${games().map(g=>`<tr><th scope="row">${g.id}</th><td>${g.home?'vs':'@'} ${g.opponent}</td>${config.markets.map(([id])=>`<td>${g.stats[id]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
      </div><aside class="demo-aside" aria-label="Demo player details">${segment('aside',[['matchup','Matchup'],['history','Line history'],['notes','Notes']],state.aside)}<div class="demo-aside-content"></div></aside></div>`;
    updateSummary();renderChart();renderAside();renderGame();
    unbindLine=bindComparisonLines(research,{onStart:()=>{dragStart=line();},onPreview:value=>{state.lines[key()]=value;updateSummary();},onCommit:value=>setLine(value,true),onCancel:()=>{state.lines[key()]=dragStart;renderChart();updateSummary();research.querySelector('[data-comparison-line]')?.focus({preventScroll:true});}});
  }
  function updateSummary(){
    const summary=demoSummary(games(),state.market,line(),state.side);
    research.querySelector('[data-demo-rate]').textContent=summary.rate===null?'—':summary.rate+'%';
    research.querySelector('[data-demo-side-label]').textContent=(state.side==='over'?'above ':'below ')+num(line());
    research.querySelector('[data-demo-count]').textContent=`${summary.hits} of ${summary.n} sample games${summary.pushes?' · '+summary.pushes+' tied':''}`;
    for(const field of ['average','median'])research.querySelector(`[data-demo-${field}]`).textContent=num(summary[field]);
    research.querySelector('[data-demo-range]').textContent=summary.n?num(summary.min)+'–'+num(summary.max):'—';
    research.querySelector('[data-demo-field=line]').value=line();
  }
  function renderChart(){
    const container=research.querySelector('.demo-chart');if(!container)return;
    const rows=games();
    if(!rows.length){container.style.minWidth='';container.innerHTML='<div class="demo-empty"><strong>No sample games for these filters</strong><p>Try both home and away games to see this matchup’s sample.</p><button type="button" class="demo-button" data-demo-all-venues>Show home + away</button></div>';return;}
    const width=Math.max(container.parentElement.clientWidth,rows.length*34+60),height=288,top=30,plot=208,left=52,gap=(width-left-12)/rows.length,high=market()[3],y=value=>top+(high-value)/high*plot;
    container.style.minWidth=width+'px';
    container.innerHTML=`<svg class="demo-chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(market()[1])} in sample games; comparison line at ${line()}" data-low="0" data-high="${high}" data-top="${top}" data-height="${plot}" data-side="${state.side}">
      ${[0,1,2,3,4].map(i=>{const v=high*i/4;return `<line x1="${left}" x2="${width-10}" y1="${y(v)}" y2="${y(v)}" class="demo-grid-line"/><text x="${left-10}" y="${y(v)+4}" class="demo-axis" text-anchor="end">${num(v)}</text>`;}).join('')}
      ${rows.map((g,i)=>{const value=g.stats[state.market],x=left+i*gap+gap*.13,w=gap*.74;return `<g data-result="${value}" data-demo-game="${g.id}" role="button" tabindex="0" aria-label="Sample game ${g.id}, ${g.home?'home vs':'away at'} ${g.opponent}: ${value} ${market()[1]}" aria-pressed="${state.game===g.id}" class="demo-bar-group"><title>Game ${g.id} · ${g.home?'vs':'@'} ${g.opponent} · ${value} ${market()[1]}</title><rect x="${x}" y="${top}" width="${w}" height="${plot+26}" fill="transparent"/><rect class="pr-bar ${chartResult(value)}" x="${x}" y="${value===0?y(0)-2:y(value)}" width="${w}" height="${Math.max(2,value/high*plot)}" rx="3"/><text x="${x+w/2}" y="${y(value)-8}" text-anchor="middle" class="demo-bar-value">${value}</text><text x="${x+w/2}" y="${top+plot+21}" text-anchor="middle" class="demo-axis">G${g.id}</text><text x="${x+w/2}" y="${top+plot+39}" text-anchor="middle" class="demo-axis">${g.home?'vs':'@'} ${g.opponent}</text></g>`;}).join('')}
      <g data-comparison-line class="pr-line-control" transform="translate(0 ${y(line())})" tabindex="0" role="slider" aria-label="Drag comparison line" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="${high}" aria-valuenow="${line()}" aria-valuetext="${line()}, your comparison line"><line class="pr-line-target" x1="${left}" x2="${width-10}"/><line class="pr-threshold" x1="${left}" x2="${width-10}"/><rect class="pr-line-pill" x="0" y="-16" width="49" height="32" rx="9"/><path class="pr-line-grip" d="m6 -4 3 -3 3 3m-6 8 3 3 3-3"/><text class="pr-line-label" x="30" y="4" text-anchor="middle">${num(line())}</text></g></svg>`;
  }
  function setLine(value,focusChart=false){
    if(!Number.isFinite(value))return;
    state.lines[key()]=snapComparisonLine(value,0,market()[3]);updateSummary();renderChart();renderGame();
    if(focusChart)research.querySelector('[data-comparison-line]')?.focus({preventScroll:true});
    announce(`Demo comparison: ${state.side} ${num(line())}. ${research.querySelector('[data-demo-count]').textContent}.`);
  }
  function renderGame(){
    const game=games().find(g=>g.id===state.game),host=research.querySelector('.demo-game-detail');
    host.hidden=!game;
    if(game)host.innerHTML=`<span><strong>Sample game ${game.id}</strong> ${game.home?'Home vs':'Away at'} ${game.opponent}</span><span><b>${game.stats[state.market]}</b> ${market()[1]} · ${game.stats[state.market]===line()?'Tied with':game.stats[state.market]>line()?'Above':'Below'} ${num(line())}</span><button type="button" data-demo-close-game aria-label="Close sample game details">${icon('close')}</button>`;
  }
  function renderAside(){
    const host=research.querySelector('.demo-aside-content'),p=player(),m=market();
    if(state.aside==='notes'){
      host.innerHTML=`<h3>Your demo notes</h3><p>Try saving a thought alongside this player.</p><label class="demo-note-label" for="demo-note">Research note</label><textarea id="demo-note" data-demo-field="note" data-focus="note" rows="6" maxlength="280" placeholder="What would you look at next?">${esc(state.notes[p.id]||'')}</textarea><div class="demo-note-meta"><span>Demo only · resets on reload</span><span data-note-count>${(state.notes[p.id]||'').length}/280</span></div><button type="button" class="demo-button" data-demo-clear-note>Clear note</button>`;return;
    }
    if(state.aside==='history'){
      const quotes=[Math.max(0,m[2]-1),Math.max(0,m[2]-.5),m[2]],min=Math.min(...quotes)-.5,max=Math.max(...quotes)+.5,y=v=>72-(v-min)/(max-min)*52;
      host.innerHTML=`<h3>Sample line movement</h3><p>Choose an observation to compare the same games with a different threshold.</p><svg class="demo-history-chart" viewBox="0 0 250 96" role="img" aria-label="Three sample observations: ${quotes.join(', ')}"><path d="M 12 ${y(quotes[0])} H 125 V ${y(quotes[1])} H 238 V ${y(quotes[2])}"/><g>${quotes.map((q,i)=>`<circle cx="${12+i*113}" cy="${y(q)}" r="4"/><text x="${12+i*113}" y="${y(q)-12}" text-anchor="${i===0?'start':i===2?'end':'middle'}">${num(q)}</text>`).join('')}</g></svg><div class="demo-observations">${quotes.map((q,i)=>`<button type="button" data-demo-quote="${q}" data-focus="quote-${i}"><span>Sample ${i+1}<small>${i===0?'First observation':i===2?'Latest observation':'Line changed'}</small></span><b>${num(q)} ${icon('arrow')}</b></button>`).join('')}</div><p class="demo-fine-print">Illustrative movement. No sportsbook quotes or live prices are used in this demo.</p>`;return;
    }
    const factor=state.position==='all'?1:0.9,allowance=m[2]*1.08*factor,league=m[2]*1.14*factor;
    host.innerHTML=`<h3>${p.opponent} · ${m[1]} defense</h3><p>${p.team} vs ${p.opponent} <span class="demo-badge">Sample matchup</span></p>${segment('position',[['all','Overall'],['position','vs '+p.position]],state.position)}<div class="demo-opponent-values"><dl><dt>Opponent allowance</dt><dd>${num(allowance)}</dd></dl><dl><dt>League comparison</dt><dd>${num(league)}</dd></dl></div><p class="demo-fine-print">${m[1]} per game${state.position==='position'?' · '+p.position+' sample':''}</p><details class="demo-explanation"><summary>How to read the matchup ${icon('chevron')}</summary><p>Compare the same statistic and position group. Higher allowance means more production in that sample, not a guaranteed result. These numbers illustrate the layout; they are not real team statistics.</p></details><div class="demo-sample-insight"><span>${icon('info')}Reading this sample</span><p>Past results and forecasts answer different questions. The chart’s hit rate counts sample games above or below your line; it is not a prediction.</p></div>`;
  }
  function renderTrends(){
    trends.innerHTML=`<div class="demo-trends-heading"><div><span class="demo-kicker">SAMPLE PLAYER BOARD</span><h2>Find a trend. Take a closer look.</h2><p>Compare fictional players, then open their game-by-game chart.</p></div><span class="demo-badge">12 sample players</span></div><div class="demo-trends-filters"><label class="demo-search-label">Find a sample player<input type="search" data-demo-field="search" data-focus="search" placeholder="Player or team" value="${esc(state.search)}"></label><label>Sport<select aria-label="Sport" data-demo-field="sport" data-focus="sport"><option value="all">All sports</option>${Object.entries(DEMO_SPORTS).map(([id,s])=>`<option value="${id}"${state.sport===id?' selected':''}>${s.label}</option>`).join('')}</select></label><label>Sort by<select aria-label="Sort by" data-demo-field="sort" data-focus="sort"><option value="rate"${state.sort==='rate'?' selected':''}>Hit rate</option><option value="name"${state.sort==='name'?' selected':''}>Player name</option></select></label></div><div class="demo-trends-controls">${segment('window',[['5','L5'],['10','L10'],['20','L20']],state.window==='h2h'?'10':state.window)}<button type="button" class="demo-button" data-demo-saved-only aria-pressed="${state.savedOnly}" data-focus="saved-only">${icon('bookmark')}Saved in demo (${state.saved.size})</button><span>Above comparison line · all venues</span></div><div class="demo-trends-results"></div>`;
    renderTrendRows();
  }
  function renderTrendRows(){
    const list=DEMO_PLAYERS.filter(p=>(state.sport==='all'||p.sport===state.sport)&&(!state.savedOnly||state.saved.has(p.id))&&(p.name+' '+p.team).toLowerCase().includes(state.search.toLowerCase())).map(p=>{const m=DEMO_SPORTS[p.sport].markets[0],rows=demoGames(p,{window:state.window==='h2h'?'10':state.window});const threshold=state.lines[p.id+':'+m[0]]??m[2];return {p,m,rows,threshold,s:demoSummary(rows,m[0],threshold)};});
    list.sort((a,b)=>state.sort==='name'?a.p.name.localeCompare(b.p.name):b.s.rate-a.s.rate||a.p.name.localeCompare(b.p.name));
    trends.querySelector('.demo-trends-results').innerHTML=list.length?`<div class="demo-table-scroll" tabindex="0" role="region" aria-label="Sample trends table; scroll horizontally for all columns"><table class="demo-trends-table"><caption class="demo-sr">Fictional player trends above their comparison line</caption><thead><tr><th>Player / matchup</th><th>Compare line</th><th>Hit rate</th><th>Average</th><th>Recent games</th><th><span class="demo-sr">Save player</span></th></tr></thead><tbody>${list.map(({p,m,rows,threshold,s})=>`<tr><td><button type="button" class="demo-open-player" data-demo-open="${p.id}" aria-label="Open ${p.name} sample research"><span class="demo-avatar-small">${p.initials}</span><span><strong>${p.name} ${icon('arrow')}</strong><small>${DEMO_SPORTS[p.sport].label} · ${p.team} vs ${p.opponent}</small></span></button></td><td><strong>${num(threshold)}</strong><small>${m[1]}${threshold!==m[2]?' · Custom':''}</small></td><td><strong class="demo-rate-value">${s.rate}%</strong><small>${s.hits} of ${s.n} games</small></td><td>${num(s.average)}</td><td><svg class="demo-mini-chart" viewBox="0 0 110 32" role="img" aria-label="Sample results: ${rows.map(g=>g.stats[m[0]]).join(', ')}">${rows.map((g,i)=>{const h=g.stats[m[0]]/m[3]*30;return `<rect x="${i*110/rows.length}" y="${30-h}" width="${110/rows.length-2}" height="${Math.max(1,h)}" rx="1" class="${g.stats[m[0]]===threshold?'push':g.stats[m[0]]>threshold?'hit':'miss'}"/>`;}).join('')}</svg></td><td><button type="button" class="demo-table-save" data-demo-save="${p.id}" data-focus="save-${p.id}" aria-label="${state.saved.has(p.id)?'Unsave':'Save'} ${p.name} in demo" aria-pressed="${state.saved.has(p.id)}">${icon(state.saved.has(p.id)?'check':'bookmark')}</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="demo-empty"><strong>${state.savedOnly?'No saved players match':'No matching sample players'}</strong><p>${state.savedOnly?'Save a player with the bookmark button, or show all players.':'Try another name or sport.'}</p><button class="demo-button" type="button" data-demo-clear-filters>Show all sample players</button></div>`;
  }
  root.addEventListener('click',event=>{
    const tab=event.target.closest('.landing-preview-tabs [role=tab]');if(tab){setView(tab.id.includes('trends')?'trends':'research');return;}
    const b=event.target.closest('button,[data-demo-game]');if(!b)return;
    const d=b.dataset;
    if('demoReset'in d){state=defaults();setView('research');announce('Demo reset. Sample players, lines, saves and notes restored.');return;}
    if(d.demoWindow){state.window=d.demoWindow;state.game=null;render();return;}
    if(d.demoSide){state.side=d.demoSide;render();return;}
    if(d.demoMarket){state.market=d.demoMarket;state.game=null;render();return;}
    if(d.demoAside){state.aside=d.demoAside;render();return;}
    if(d.demoPosition){state.position=d.demoPosition;render();return;}
    if(d.demoSave){state.saved.has(d.demoSave)?state.saved.delete(d.demoSave):state.saved.add(d.demoSave);render();announce(`${DEMO_PLAYERS.find(p=>p.id===d.demoSave).name} ${state.saved.has(d.demoSave)?'saved in':'removed from'} the demo.`);return;}
    if(d.demoOpen){if(state.window==='h2h')state.window='10';state.player=d.demoOpen;state.market=DEMO_SPORTS[player().sport].markets[0][0];state.venue='all';state.side='over';state.game=null;setView('research',true);announce('Opened '+player().name+' in the demo.');return;}
    if('demoSavedOnly'in d){state.savedOnly=!state.savedOnly;render();return;}
    if('demoClearFilters'in d){state.savedOnly=false;state.sport='all';state.search='';render();trends.querySelector('[data-demo-field=search]').focus({preventScroll:true});return;}
    if('demoLineReset'in d){setLine(market()[2]);return;}
    if('demoAllVenues'in d){state.venue='all';render();research.querySelector('[data-demo-field=venue]').focus({preventScroll:true});return;}
    if('demoQuote'in d){setLine(Number(d.demoQuote));return;}
    if('demoClearNote'in d){state.notes[state.player]='';renderAside();research.querySelector('textarea').focus({preventScroll:true});return;}
    if(d.demoGame){state.game=Number(d.demoGame);research.querySelectorAll('[data-demo-game]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderGame();return;}
    if('demoCloseGame'in d){state.game=null;renderGame();research.querySelectorAll('[data-demo-game]').forEach(el=>el.setAttribute('aria-pressed','false'));research.querySelector('[data-comparison-line]')?.focus({preventScroll:true});}
  });
  root.addEventListener('change',event=>{
    const field=event.target.dataset.demoField;if(!field)return;
    const value=event.target.value;
    if(field==='line'){if(value===''){event.target.value=line();return;}setLine(Number(value));return;}
    if(field==='league'){state.player=DEMO_PLAYERS.find(p=>p.sport===value).id;state.market=DEMO_SPORTS[value].markets[0][0];state.game=null;}
    else if(field==='player'){state.player=value;state.game=null;}
    else if(['venue','sport','sort'].includes(field)){state[field]=value;state.game=null;}
    else return;
    render();
  });
  root.addEventListener('input',event=>{
    const field=event.target.dataset.demoField;
    if(field==='search'){state.search=event.target.value;renderTrendRows();}
    if(field==='note'){state.notes[state.player]=event.target.value;research.querySelector('[data-note-count]').textContent=event.target.value.length+'/280';}
  });
  root.addEventListener('keydown',event=>{
    const tab=event.target.closest('.landing-preview-tabs [role=tab]');
    if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const i=event.key==='Home'?0:event.key==='End'?1:1-tabs.indexOf(tab);setView(i?'trends':'research',true);}
    const bar=event.target.closest('[data-demo-game]');if(bar&&['Enter',' '].includes(event.key)){event.preventDefault();bar.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    if(event.key==='Enter'&&event.target.matches('[data-demo-field=line]'))event.target.dispatchEvent(new Event('change',{bubbles:true}));
  });
  // Resize the vector chart to real CSS pixels, preserving readable labels on phones.
  let lastWidth=0;
  const resize=new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width===lastWidth)return;lastWidth=width;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(state.view==='research')renderChart();});});
  resize.observe(root);render();
}
