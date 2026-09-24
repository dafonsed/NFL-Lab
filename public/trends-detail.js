import {escape as esc,finite,number as num,selectGames,summarize,supportingStats} from './research-data.js';
import {gameChart,movement} from './player-research.js';
import {teamMark,playerPortrait,opponentIdentity} from './sports-identity.js';
import {availabilityLabel} from './presentation.js';
import {icon} from './ui-icons.js';

const windows=[['5','L5'],['10','L10'],['20','L20'],['h2h','H2H'],['all','All']];
const pct=value=>value===null?'—':Math.round(value*100)+'%';

export function trendQuoteBar(p,{line,side,manual}) {
  const quote=p.prop;
  const price=value=>finite(value)===null?'—':(value>0?'+':'')+num(value,0);
  const isFanDuel=[quote?.bookKey,quote?.bookmaker].some(value=>/^fanduel(?:sportsbook)?$/.test(String(value||'').toLowerCase().replace(/[^a-z]/g,'')));
  const bookmaker=isFanDuel?'<span class="td-sportsbook-logo" title="FanDuel"><img src="/assets/sportsbooks/fanduel.png" alt="FanDuel" width="1920" height="1080"></span>':'';
  const prices=['over','under'].map(side=>{
    const value=quote?.prices?.[side]?.american,available=finite(value)!==null,label=side==='over'?'Over':'Under';
    return `<span${available&&quote?.bookmaker?` title="${esc(quote.bookmaker)}"`:''}><small>${label}</small><span class="td-quote-value">${available?bookmaker:''}<strong>${price(value)}</strong></span></span>`;
  }).join('');
  return `<div class="td-line-banner td-quote-bar"><div class="td-quote-selection">${icon('research')}<div><span>${manual?'Your line':esc(p.label)}</span><strong>${line===null?'Set a comparison line':(side==='over'?'Over':'Under')+' '+num(line)}</strong></div></div>${manual?(quote?'<div class="td-quote-custom"><button type="button" data-reset-line>Use book line</button></div>':''):`<div class="td-quote-prices" aria-label="Sportsbook quote">${prices}</div>`}</div>`;
}

export function trendChartPanel(p,{games,line,side,window,venue,manual,width}) {
  const s=summarize(games,line,side),sample=window==='h2h'?'Head to head':window==='all'?'Available history':`Last ${window} games`;
  return `<section class="td-chart-card" aria-label="Player performance chart">
    <header class="td-chart-card-heading"><div><h3>${icon('trends')}${esc(p.name)} · ${esc(p.label)}</h3><span>${esc(sample)} <i>·</i> ${s.n} recorded</span></div><div class="td-venue-control"><select id="td-venue" aria-label="Game venue"><option value="all" ${venue==='all'?'selected':''}>Home + away</option><option value="home" ${venue==='home'?'selected':''}>Home only</option><option value="away" ${venue==='away'?'selected':''}>Away only</option></select></div></header>
    <div class="td-chart-toolbar"><div class="td-windows" role="group" aria-label="Game window">${windows.map(([value,label])=>`<button data-window="${value}" aria-pressed="${window===value}"><span>${label}</span></button>`).join('')}</div></div>
    <div class="td-summary-stats"><div class="td-hit-stat"><span>${esc(sample.replace(' games',''))}</span><strong class="td-positive">${pct(s.rate)}</strong><small>${!s.n?'No games in sample':s.rate===null?'Set a line to compare':`${s.hits} of ${s.n} games${s.pushes?' · '+s.pushes+' pushes':''}`}</small><i class="td-stat-meter" style="--rate:${(s.rate??0)*100}%" aria-hidden="true"></i></div><div><span>Average</span><strong>${num(s.average)}</strong></div><div><span>Median</span><strong>${num(s.median)}</strong></div><div><span>Range</span><strong>${s.n?num(s.min)+'–'+num(s.max):'—'}</strong></div></div>
    <div class="td-main-chart">${gameChart(games,line,side,false,width,p.sport)}</div>
    <div class="td-legend" aria-label="Chart legend">${line===null?'<span><i class="neutral"></i>Recorded result</span>':`<span><i class="hit"></i>${side==='over'?'Above':'Below'} line</span><span><i class="miss"></i>${side==='over'?'Below':'Above'} line</span><span><i class="push"></i>Push</span><span><i class="line"></i>Line</span>`}</div>
    <div class="td-chart-bottom"><div class="td-side td-chart-side" role="group" aria-label="Chart comparison side">${['over','under'].map(value=>`<button data-side="${value}" aria-pressed="${side===value}">${value==='over'?'Over':'Under'}</button>`).join('')}</div><form id="td-line-form"><label for="td-line">Line</label><div class="td-line-stepper"><button type="button" data-line-step="-0.5" aria-label="Decrease comparison line">−</button><input id="td-line" name="line" aria-label="Compare line" type="number" min="-100" max="1000" step="any" value="${line??''}" placeholder="—" required><button type="button" data-line-step="0.5" aria-label="Increase comparison line">+</button></div><button class="td-apply-line" type="submit" aria-label="Apply comparison line">${icon('check')}<span>Apply</span></button>${manual?'<button class="td-reset-line" type="button" data-reset-line aria-label="Reset to sportsbook line">Reset</button>':''}</form></div>
    <section class="td-splits-section" aria-label="Hit rates by game window"><div class="td-rate-splits">${windows.map(([value,label])=>{const stats=summarize(selectGames(p,{window:value,venue}),line,side);return `<button class="td-split" data-window="${value}" aria-pressed="${window===value}"><span>${label}</span><strong>${pct(stats.rate)}</strong><i style="--rate:${(stats.rate??0)*100}%" aria-hidden="true"></i><small>${stats.rate===null?stats.n+' games':stats.hits+'/'+stats.n}</small></button>`;}).join('')}</div></section>
    <details class="td-chart-explainer"><summary>${icon('info')}Sample & methodology ${icon('chevron')}</summary><p class="td-chart-note">${esc(p.historyNote)} Hit rates compare past results against ${manual?'your line':p.prop?.basis==='published_archive'?'this archived line':'one comparison line'}; pushes remain in the sample.</p></details>
  </section>`;
}

export function trendContextPanel(p,{games,line,side,modelUrl,contextTab='matchup'}) {
  const s=summarize(games,line,side),context=p.context,matchup=p.forecast?.matchup;
  const starter=matchup?.pitcher||p.raw?.opponentPitcher;
  const role=({confirmed:`Batting ${p.battingOrder||'order confirmed'}`,starter:'Confirmed starter',probable:'Probable starter',bench:'Bench / substitute',unconfirmed:'Lineup pending'})[p.lineup];
  const availability=availabilityLabel(p.availability?.status),date=p.displayDate?new Date(p.displayDate.slice(0,10)+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'';
  const tabs=[['matchup','Matchup'],['availability','Availability'],['insights','Insights']];
  const active=tabs.some(([key])=>key===contextTab)?contextTab:'matchup';
  const facts=`<dl class="td-matchup-facts">${starter&&starter!=='TBD'?`<div><dt>Opposing starter</dt><dd>${esc(starter)}${matchup?.pitcherHand?` <small>${esc(matchup.pitcherHand)}HP</small>`:''}</dd></div>`:''}${role?`<div><dt>Lineup</dt><dd>${esc(role)}</dd></div>`:''}${availability?`<div><dt>Availability</dt><dd>${esc(availability)}</dd></div>`:''}</dl>`;
  const panel=key=>`id="td-context-${key}" role="tabpanel" aria-labelledby="td-tab-${key}" tabindex="0"${active!==key?' hidden':''}`;
  const player=`<div class="td-context-player">${playerPortrait(p)}<div><strong>${esc(p.name)}</strong><span>${esc(p.team)}${p.position?' · '+esc(p.position):''} <i>vs</i> ${esc(p.opponent||'TBD')}</span></div></div>`;
  const rate=finite(context?.rate),league=finite(context?.leagueRate),total=Math.max(0,rate??0)+Math.max(0,league??0);
  return `<aside class="td-context-grid td-context-modern" aria-label="Player insights and matchup"><section class="reference-line-movement"><h3>Line movement</h3>${movement(p)}</section>
    <div class="td-context-tabs" role="tablist" aria-label="Player context">${tabs.map(([key,label])=>`<button id="td-tab-${key}" role="tab" data-context-tab="${key}" aria-selected="${active===key}" aria-controls="td-context-${key}" tabindex="${active===key?'0':'-1'}">${label}</button>`).join('')}</div>
    <section class="td-context-panel" ${panel('matchup')}>
      <header class="td-context-heading"><h3>Matchup</h3><time>${esc(date)}</time></header>
      <div class="td-matchup-teams"><div>${teamMark({sport:p.sport,team:p.team,teamId:p.raw?.teamId})}<strong>${esc(p.team)}</strong><small>${p.raw?.home===true?'Home':p.raw?.home===false?'Away':''}</small></div><span class="td-versus">vs</span><div>${teamMark({sport:p.sport,team:p.opponent,teamId:p.opponentId})}<strong>${esc(p.opponent||'TBD')}</strong><small>${p.raw?.home===true?'Away':p.raw?.home===false?'Home':''}</small></div></div>
      <div class="td-matchup-data"><h4>Key ${esc(p.opponent||'opponent')} matchup stats</h4>${context?.available?`<table class="td-context-table"><thead><tr><th scope="col">Stat</th><th scope="col">${esc(p.opponent||'Opp.')}</th><th scope="col">League</th></tr></thead><tbody><tr><th scope="row">${esc(context.unit?.startsWith('per ')?p.label+' '+context.unit:context.unit||p.label)}</th><td>${num(rate,2)}</td><td>${num(league,2)}</td></tr></tbody></table>${rate!==null&&league!==null&&total>0?`<div class="td-rate-comparison" aria-hidden="true"><i style="flex:${Math.max(0,rate)/total}"></i><i style="flex:${Math.max(0,league)/total}"></i></div>`:''}<p class="td-context-caption">${finite(context.sampleCount)===null?'Sample size unavailable':context.sampleCount+' prior games'} · Opponent vs. league average</p>`:'<p class="td-context-empty">Opponent comparison is unavailable for this market.</p>'}</div>
      ${starter&&starter!=='TBD'?`<dl class="td-matchup-facts"><div><dt>Opposing starter</dt><dd>${esc(starter)}${matchup?.pitcherHand?` <small>${esc(matchup.pitcherHand)}HP</small>`:''}</dd></div></dl>`:''}
    </section>
    <section class="td-context-panel td-availability-panel" ${panel('availability')}>${player}<h3>Player availability</h3>${facts}<p class="td-context-caption">${esc(p.availability?.note||'Status reflects the latest report supplied for this matchup.')}</p></section>
    <section class="td-context-panel td-insights-panel" ${panel('insights')}>${player}<p class="td-insight-copy">${!s.n?'No completed games match this sample. Try another window or include home and away games.':s.rate===null?`${esc(p.name)} averaged <strong>${num(s.average)} ${esc(p.unit)}</strong> across these ${s.n} games.`:`${esc(p.name)} finished ${side==='over'?'above':'below'} <strong>${num(line)} ${esc(p.unit)}</strong> in <strong>${s.hits} of ${s.n}</strong> selected games.`}</p><div class="td-insight-market">${icon('research')}<strong>${line===null?esc(p.label):(side==='over'?'Over':'Under')+' '+num(line)+' '+esc(p.label)}</strong><span>${pct(s.rate)}</span></div><div class="td-outcome-strip" aria-label="Game results, oldest to newest">${[...games].reverse().map(r=>`<i class="${resultState(r.value,line,side)}" title="${esc(r.date?.slice(0,10))}: ${num(r.value)}"></i>`).join('')}</div><p class="td-context-caption">Historical results · ${s.n} games${s.pushes?' · '+s.pushes+' pushes':''}</p></section>
    <div class="td-model-shortcut"><a href="${esc(modelUrl)}">Open in Model ${icon('arrow')}</a></div>
  </aside>`;
}

function resultState(value,line,side) {
  const actual=finite(value),threshold=finite(line);
  return actual===null||threshold===null?'neutral':actual===threshold?'push':(side==='under'?actual<threshold:actual>threshold)?'hit':'miss';
}

export function trendResultMarkup(value,line,side) {
  const result=resultState(value,line,side),label={hit:'Hit',miss:'Miss',push:'Push',neutral:'—'}[result];
  return `<span class="td-result td-result-${result}"><i aria-hidden="true">${result==='hit'?'✓':result==='miss'?'×':'–'}</i><span>${label}</span></span>`;
}

export function trendRecordsPanel(p,{games,line,side,showLog=false}) {
  return `<section class="td-records-card" aria-label="Game history"><header><div><h3>Game history <span>${games.length}</span></h3></div><div class="td-records-actions"><button data-breakdown>${icon('info')}<span>History & sources</span></button><button data-log aria-expanded="${showLog}" aria-controls="td-game-log">${icon('calendar')}<span>${showLog?'Hide':'View'} game log</span>${icon('chevron')}</button></div></header><div id="td-game-log" ${showLog?'':'hidden'} class="pr-table-scroll"><table><caption>${esc(p.name)} · ${esc(p.label)} · selected games</caption><thead><tr><th scope="col">Date</th><th scope="col">Opponent</th><th scope="col">${esc(p.label)}</th><th scope="col">${line===null?'Comparison':(side==='over'?'Over':'Under')+' '+num(line)}</th></tr></thead><tbody>${games.map(r=>{const opponent=opponentIdentity(r,p.sport);return `<tr><td><time datetime="${esc(r.date?.slice(0,10))}">${esc(r.date?.slice(5,10).replace('-','/'))}</time></td><td><span class="td-log-opponent"><small>${r.home===false?'@':'vs'}</small>${opponent.logo?`<img src="${esc(opponent.logo)}" alt="" width="24" height="24" loading="lazy" data-identity-image>`:''}<strong title="${esc(opponent.name)}">${esc(opponent.code||opponent.name||'—')}</strong></span></td><td><strong class="td-log-value">${num(r.value)}</strong></td><td>${trendResultMarkup(r.value,line,side)}</td></tr>`;}).join('')}</tbody></table></div></section>`;
}

export function trendSupportingPanel(p,games,method='average') {
  const stats=supportingStats(p,games,method);
  if(stats.length)return `<section class="td-support-card" aria-label="Supporting stats"><header><div><h3>Supporting stats</h3></div><div class="td-stat-method" role="group" aria-label="Supporting statistic summary">${['average','median'].map(value=>`<button data-stat-method="${value}" aria-pressed="${method===value}">${value==='average'?'Average':'Median'}</button>`).join('')}</div></header><div class="td-support-tiles">${stats.map(s=>{
    const rows=[...games].reverse(),values=rows.map(r=>finite(r.stats?.[s.key])),max=Math.max(1,...values.filter(v=>v!==null));
    const bars=values.map((value,i)=>`<rect x="${i*100/values.length}" y="${value===null?29:30-Math.max(1,value/max*28)}" width="${Math.max(.5,100/values.length-1.3)}" height="${value===null?1:Math.max(1,value/max*28)}" rx="1" class="${value===null?'missing':''}"><title>${esc(rows[i].date?.slice(0,10))}: ${value===null?'Not supplied':num(s.percent?value*100:value)+(s.percent?'%':'')}</title></rect>`).join('');
    return `<article class="td-support-tile"><h4>${esc(s.label)}</h4><div><strong>${s.percent?num(s.value*100)+'%':num(s.value)}</strong><svg viewBox="0 0 100 32" role="img" aria-label="${esc(s.label)} by game, oldest to newest" preserveAspectRatio="none">${bars}</svg></div><span>${s.n} ${s.n===1?'game':'games'} <i>·</i> ${method==='median'?'median':'average'}</span></article>`;
  }).join('')}</div><details class="td-chart-explainer"><summary>${icon('info')}How these stats are calculated ${icon('chevron')}</summary><p>${method==='median'?'Median is the middle result.':'Average is the total divided by the number of games with that statistic.'} These stats follow the chart’s game window and venue filters. Missing values are excluded; each tile shows its sample size. Bars show recorded counts, oldest to newest.</p></details></section>`;
  if(['mlb','nfl'].includes(p.sport)&&!p.full&&!p.statsLoaded&&!p.detailsFailed)return `<div class="td-support-loading" role="status"><span class="td-loading-dot"></span>Loading supporting stats</div>`;
  return `<details class="td-support-empty"><summary>Supporting stats<span>Unavailable for this sample</span>${icon('chevron')}</summary><p>Additional counts were not supplied for these games. Open History & sources to inspect the available records.</p></details>`;
}
