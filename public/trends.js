import {requestData,loadingRows,emptyBoard,trendTable} from './product-ui.js';
import { escape as esc, finite, number as num, NFL_MARKETS, researchProfile, selectGames, summarize } from './research-data.js';
import { observeLines, openPlayerResearch, marketTabLabel } from './player-research.js';
import {enhanceTrendControls} from './trends-controls.js';
import {chartFilterControl} from './chart-controls.js';
import {trendChartPanel,trendContextPanel,trendSupportingPanel,trendRecordsPanel,trendResultMarkup,trendQuoteBar} from './trends-detail.js';
import { playerContext, playerKey } from './sports-view.js';
import { comparisonLine, trendRows, defaultTrendFilters } from './trends-data.js';
import {setupTrendFilters} from './trends-filters.js';
import { icon } from './ui-icons.js';
import {playerPortrait} from './sports-identity.js';
import { bindComparisonLines } from './chart-line.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search), sport = location.pathname.split('/')[1] || 'nfl';
const defaults = { nfl: 'rec_yds', mlb: 'hits', nba: 'points', wnba: 'points', nhl: 'shots', soccer: 'shots' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: sport === 'mlb' ? 'America/New_York' : 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const storageKey = 'sports-lab-trends-watchlist-' + sport;
let saved = [];
try { const value = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(value)) saved = value.map(String); } catch {}
const state = { market: params.get('market') || defaults[sport], date: params.get('date') || today(), season: params.get('season'), week: params.get('week'), league: params.get('league') || 'eng.1', game: params.get('game') || (sport === 'wnba' ? 'all' : ''), search: '', sort: 'rate', window: '10', side: 'over', venue: 'all', posted: false, savedOnly: false, saved: new Set(saved), selected: params.get('researchPlayer'), manualLine: null, statMethod: 'average', profiles: [], board: null, catalog: null, count: 50 };
state.contextTab='matchup';
state.filters=defaultTrendFilters();
const boardOptions=(changes={})=>{const next={...state,...changes};return {...next,window:next.filters.sample,venue:next.filters.venue};};
const filterPanel=setupTrendFilters({sport,getState:()=>state,preview:draft=>trendRows(state.profiles,boardOptions(draft)),apply:draft=>{Object.assign(state,draft);state.count=50;render();}});
let requestId = 0, controller, loadedSelection='';
const pct = v => finite(v) === null ? '—' : Math.round(v * 100) + '%';
const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'time unavailable';
const avatar = p => playerPortrait(p,{size:'hero',eager:true});
const selected = () => state.profiles.find(p => p.key === state.selected);
function modelLink(p) { const q = query(); q.delete('sport'); q.delete('view'); q.set('researchPlayer', p.key); if(state.game) q.set('game', state.game); return '/' + sport + '?' + q; }
function query(market = state.market) {
  const q = new URLSearchParams({ market });
  if (sport === 'nfl') { q.set('view', 'board'); if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else { q.set('date', state.date); if (sport !== 'mlb') { q.set('sport', sport); q.set('league', state.league); if (state.game) q.set('game', state.game); } }
  return q;
}
function updateUrl() {
  const q = query(); q.set('view', 'trends'); q.delete('sport');
  if (state.selected) q.set('researchPlayer',state.selected);
  if (sport === 'nfl' || sport === 'mlb') { if (state.game) q.set('game', state.game); }
  history.replaceState(null, '', '/' + sport + '?' + q);
}
async function request(url, signal) {return requestData(url,{signal});}
function marketButtons(markets) {
  $('#td-markets').innerHTML = Object.entries(markets).map(([key, m]) => `<button data-market="${esc(key)}" aria-pressed="${key === state.market}">${esc(m.label)}</button>`).join('');
}
function clearDetail() { state.selected = null; state.manualLine = null; }
function renderEmpty(message = 'No players match these filters', description = 'Try another market, matchup, or search.', actions='<button class="button subtle" data-reset>Reset player filters</button>') {
  document.body.dataset.researchView='board';
  $('#td-workbench').dataset.state='empty';$('#td-detail-nav').hidden=true;$('#td-players').hidden=false;
  $('#td-player-list').innerHTML=emptyBoard(message,description,actions);
  $('#td-detail').hidden=true;
  $('#td-count').textContent='0 players';
}
async function load({ force = false, schedule = true } = {}) {
  const id = ++requestId; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  const selection=query().toString(),retain=state.board&&selection===loadedSelection;
  if(!retain){state.profiles=[];state.board=null;clearDetail();}
  $('#trend-refresh').disabled = true; $('#td-workbench').setAttribute('aria-busy', 'true');
  $('#td-status').textContent = 'Loading player data…'; $('#td-notice').textContent = ''; if(!retain)$('#td-count').textContent = 'Loading';
  if(!retain){$('#td-workbench').dataset.state='loading';$('#td-player-list').innerHTML=loadingRows('Loading player trends');$('#td-detail').hidden=true;}
  try {
    if (sport !== 'nfl' && sport !== 'mlb') {
      if (schedule || !state.catalog) {
        const catalog = await request('/api/sports/catalog?' + query() + (force ? '&refresh=1' : ''), signal);
        if (id !== requestId) return;
        state.catalog = catalog;
      }
      const c = state.catalog, all = sport === 'wnba' && state.game === 'all';
      state.game = all ? 'all' : (c.games.find(g => String(g.id) === state.game) || c.games.find(g => g.state === 'pre') || c.games[0])?.id || '';
      $('#td-game').innerHTML = (sport === 'wnba' ? '<option value="all">All matchups</option>' : '') + c.games.map(g => `<option value="${esc(g.id)}">${esc(g.away.code)} @ ${esc(g.home.code)} · ${esc(g.status)}</option>`).join('');
      if(!c.games.length){state.game='';$('#td-game').innerHTML='<option value="">No games on this date</option>';}
      $('#td-game').disabled=!c.games.length;
      $('#td-game').value = state.game;
      if (!Object.hasOwn(c.markets, state.market)) state.market = Object.keys(c.markets)[0];
      marketButtons(c.markets);
      if (!c.games.length) {
        const nearby=(c.availableDates || []).filter(d => d !== state.date).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(state.date)) - Math.abs(Date.parse(b) - Date.parse(state.date))).slice(0, 2);
        const actions=nearby.map(d=>`<button class="button subtle" data-date="${esc(d)}">${d<state.date?'Previous':'Next'} games · ${esc(new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}))}</button>`).join('');
        updateUrl(); renderEmpty('No games on this date', 'Choose another date to explore player history.',actions); $('#td-status').textContent = 'Schedule checked'; return;
      }
    }
    if (sport === 'nfl' && !Object.hasOwn(NFL_MARKETS, state.market)) state.market = defaults.nfl;
    const q = query(); if (force) q.set('refresh', '1');
    const board = await request((sport === 'nfl' ? '/api/board?' : sport === 'mlb' ? '/api/mlb/board?' : '/api/sports/board?') + q, signal);
    if (id !== requestId) return;
    state.board = board;loadedSelection=query().toString();
    if (board.market && typeof board.market === 'string') state.market = board.market;
    marketButtons(sport === 'nfl' ? NFL_MARKETS : board.markets);
    if (sport === 'nfl') {
      $('#td-week').innerHTML = '<option value="">Latest week · automatic</option>' + (board.weeks || []).map(w => `<option value="${w.season}:${w.week}">${w.season} · Week ${w.week}</option>`).join('');
      $('#td-week').value = state.season && state.week ? `${state.season}:${state.week}` : '';
      $('#td-game').innerHTML = '<option value="">All matchups</option>' + (board.lines || []).map(g => `<option value="${esc(g.gameId)}">${esc(g.away)} @ ${esc(g.home)}</option>`).join('');
    } else if (sport === 'mlb') {
      state.date = board.date; $('#td-date').value = state.date;
      $('#td-game').innerHTML = '<option value="">All matchups</option>' + board.games.map(g => `<option value="${esc(g.gameId)}">${esc(g.away.code)} @ ${esc(g.home.code)}${g.doubleHeader ? ' · Game ' + g.gameNumber : ''}</option>`).join('');
    }
    if (sport === 'nfl' || sport === 'mlb') { if (![...$('#td-game').options].some(o => o.value === state.game)) state.game = ''; $('#td-game').value = state.game; }
    state.profiles = (board.players || []).map(p => {
      const context = board.scope === 'all' ? playerContext(board, playerKey(p)) : { player: p, board };
      return context ? researchProfile({ sport, ...context, market: state.market }) : null;
    }).filter(Boolean);
    if(state.pendingPlayerId){state.selected=state.profiles.find(p=>p.playerId===state.pendingPlayerId)?.key||null;state.pendingPlayerId=null;}
    else if (!state.selected) state.selected = new URLSearchParams(location.search).get('researchPlayer');
    observeLines(state.profiles); updateUrl(); render();
    $('#td-status').textContent = (sport === 'nfl' ? `${board.current.season} · Week ${board.current.week} · ` : '') + (board.stale || board.partial ? 'Cached sources' : 'Updated') + ' · ' + stamp(board.fetchedAt);
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    if(retain){$('#td-status').textContent='Refresh failed · previous board may be outdated';$('#td-notice').innerHTML='<div class="td-notice">The current board could not refresh. <button data-retry>Try again</button></div>';return;}
    renderEmpty('Player data could not load', error.message); $('#td-status').textContent = 'Refresh needed';
    $('#td-notice').innerHTML = '<div class="td-notice">The data source is unavailable. <button data-retry>Try again</button></div>';
  } finally { if (id === requestId) { $('#trend-refresh').disabled = false; $('#td-workbench').setAttribute('aria-busy', 'false'); } }
}
function render() {
  const rows = trendRows(state.profiles, boardOptions());
  filterPanel.update();
  for (const b of document.querySelectorAll('[data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side === state.side));
  $('#td-posted').setAttribute('aria-pressed', String(state.posted)); $('#td-saved').setAttribute('aria-pressed', String(state.savedOnly));
  if (!rows.length) { clearDetail(); renderEmpty(); return; }
  $('#td-workbench').dataset.state='ready';
  if (!rows.some(r => r.p.key === state.selected)) clearDetail();
  const detail=!!state.selected;
  document.body.dataset.researchView=detail?'player':'board';
  $('#td-workbench').dataset.view=detail?'player':'board';
  $('#td-detail').hidden=!detail;$('#td-players').hidden=detail;$('#td-detail-nav').hidden=!detail;
  $('#td-count').textContent = rows.length + ' players · L5 / L10 / L20 / H2H';
  $('#td-player-list').innerHTML=trendTable(rows.slice(0,state.count),boardOptions())+(rows.length>state.count?'<button class="td-load-more" data-more>Show 50 more players</button>':'');
  updateUrl();
  if(detail){
    const index=rows.findIndex(r=>r.p.key===state.selected);
    $('#td-current-player').textContent=(index+1)+' of '+rows.length+' players';
    $('[data-step-player="-1"]').disabled=index===0;
    $('[data-step-player="1"]').disabled=index===rows.length-1;
    renderDetail();
    hydrateSelected();
  }
}

function renderDetail() {
  const p = selected(); if (!p) return;
  const root=$('#td-detail'),filtersOpen=root.querySelector('.reference-chart-filter')?.open||false,scroll=root.querySelector('.pr-chart-scroll')?.scrollLeft||0,showLog=$('#td-game-log')?.hidden===false;
  const line=state.manualLine??comparisonLine(p),games=selectGames(p,state),manual=state.manualLine!==null&&state.manualLine!==comparisonLine(p);
  const card=root.querySelector('.td-chart-card'),padding=card?parseFloat(getComputedStyle(card).paddingLeft)+parseFloat(getComputedStyle(card).paddingRight):0;
  const width=Math.max(280,card?card.clientWidth-padding:root.clientWidth*(matchMedia('(min-width:701px)').matches?.68:1)-60);
  const options={games,line,manual,width,side:state.side,window:state.window,venue:state.venue,modelUrl:modelLink(p),contextTab:state.contextTab,showLog};
  $('#td-detail').innerHTML = `<header class="td-player-hero"><div class="td-player-heading"><div class="td-player-identity">${avatar(p)}<div><span class="td-kicker">${esc(p.team)} vs ${esc(p.opponent || 'TBD')} · ${esc(p.position || sport.toUpperCase())}</span><h2>${esc(p.name)}</h2><p>${esc(p.label)}</p></div></div><button class="primary" data-watch aria-pressed="${state.saved.has(String(p.playerId))}" aria-label="${state.saved.has(String(p.playerId)) ? 'Remove from' : 'Add to'} watchlist">${icon(state.saved.has(String(p.playerId)) ? 'check' : 'bookmark')}<span>${state.saved.has(String(p.playerId)) ? 'Saved' : 'Save player'}</span></button></div>
    ${trendQuoteBar(p,options)}</header>
    <nav class="reference-player-markets" aria-label="Player markets">${Object.entries(p.markets).map(([key,m])=>`<button data-market="${esc(key)}" aria-label="${esc(m.label)}" title="${esc(m.label)}" aria-pressed="${key===state.market}">${esc(marketTabLabel(p.sport,key,m.label))}</button>`).join('')}</nav><div class="td-research-grid">${trendChartPanel(p,options)}${trendContextPanel(p,options)}<div id="td-support-section">${trendSupportingPanel(p,games,state.statMethod)}</div>${trendRecordsPanel(p,options)}</div>`;
  const chartPanel=root.querySelector('.td-chart-card');
  const controls=document.createElement('div');controls.className='reference-chart-controls';
  chartPanel.before(controls);controls.append(root.querySelector('.td-chart-toolbar'),chartFilterControl([root.querySelector('.td-venue-control'),root.querySelector('.td-chart-bottom')],{open:filtersOpen,count:Number(state.venue!=='all')+Number(manual)+Number(state.side==='under')}));
  const rates=root.querySelector('.td-splits-section');root.querySelector('.td-summary-stats').append(rates);
  enhanceTrendControls(root);
  const chart=root.querySelector('.pr-chart-scroll');if(chart){chart.scrollLeft=scroll;chart.dataset.scroll=String(chart.scrollWidth>chart.clientWidth+2);}
}

function selectContextTab(key,{focus=false}={}) {
  const tabs=[...document.querySelectorAll('[data-context-tab]')];
  if(!tabs.some(tab=>tab.dataset.contextTab===key))return;
  state.contextTab=key;
  tabs.forEach(tab=>{const active=tab.dataset.contextTab===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!active;if(active&&focus)tab.focus();});
}
$('#td-detail').addEventListener('keydown',event=>{
  const tab=event.target.closest('[data-context-tab]');
  if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...tab.parentElement.querySelectorAll('[data-context-tab]')],index=tabs.indexOf(tab);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();selectContextTab(tabs[next].dataset.contextTab,{focus:true});
});
async function detailedProfile(profile,board,market,signal) {
  const q=new URLSearchParams({market,player:sport==='mlb'?profile.raw.id:profile.playerId});
  if(sport==='nfl'){q.set('season',board.current.season);q.set('week',board.current.week);}else q.set('date',board.date);
  const data=await request((sport==='nfl'?'/api/nfl/research?':'/api/mlb/evidence?')+q,signal);
  return {...researchProfile({sport,board,player:data.player,market}),full:true};
}
async function hydrateSelected() {
  const profile=selected();
  if(!profile||!['nfl','mlb'].includes(sport)||profile.full||profile.statsLoaded||profile.detailsPending||profile.detailsFailed)return;
  profile.detailsPending=true;
  const board=state.board,market=state.market;
  try {
    const detail=await detailedProfile(profile,board,market);
    if(state.board!==board)return;
    const index=state.profiles.findIndex(p=>p.key===profile.key);
    if(index<0)return;
    // Attach counts to exactly the games already charted; never change sample coverage.
    const rows=profile.rows.map(row=>{const full=detail.rows.find(r=>row.gameId&&r.gameId?String(r.gameId)===String(row.gameId):r.date===row.date&&r.opponent===row.opponent);return full?{...row,stats:full.stats,url:full.url,parts:full.parts}:row;});
    state.profiles[index]={...profile,rows,statsLoaded:true,detailsPending:false};
  } catch {profile.detailsFailed=true;profile.detailsPending=false;}
  if(state.board===board&&state.selected===profile.key) {
    // Populate supporting counts without moving focus or rebuilding the chart.
    const panel=$('#td-support-section');
    if(panel)panel.innerHTML=trendSupportingPanel(selected(),selectGames(selected(),state),state.statMethod);
  }
}
function openBreakdown() {
  const profile = selected(); if (!profile) return;
  const board = state.board, market = state.market;
  let loadDetails;
  if (sport === 'nfl' || sport === 'mlb') loadDetails = signal=>detailedProfile(profile,board,market,signal);
  openPlayerResearch({ profile, loadDetails });
}
$('#td-week-label').hidden = sport !== 'nfl'; $('#td-date-label').hidden = sport === 'nfl'; $('#td-league-label').hidden = sport !== 'soccer';
$('#td-date').value = state.date; $('#td-league').value = state.league;
if (sport === 'nfl') marketButtons(NFL_MARKETS);
$('#trend-refresh').addEventListener('click', () => load({ force: true }));
$('#td-search').addEventListener('input', e => { state.search = e.target.value; state.count = 50; render(); });
$('#td-sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
$('#td-posted').addEventListener('click', () => { state.posted = !state.posted; render(); });
$('#td-saved').addEventListener('click', () => { state.savedOnly = !state.savedOnly; render(); });
$('#td-week').addEventListener('change', e => { [state.season, state.week] = e.target.value.split(':'); state.game = ''; load(); });
$('#td-date').addEventListener('change', e => { if (!e.target.value) return; state.date = e.target.value; state.game = sport === 'wnba' ? 'all' : ''; load(); });
$('#td-league').addEventListener('change', e => { state.league = e.target.value; state.game = ''; load(); });
$('#td-game').addEventListener('change', e => { state.game = e.target.value; if (sport === 'nfl' || sport === 'mlb') { updateUrl(); render(); } else load({ schedule: false }); });
let beforeChartDrag;
bindComparisonLines($('#td-detail'), {
 onStart() { beforeChartDrag=state.manualLine; },
 onPreview(value) {
  state.manualLine=value;
  const p=selected(),games=selectGames(p,state),stats=summarize(games,value,state.side),side=state.side==='over'?'Over':'Under';
  $('#td-line').value=value;
  $('#td-game-log th:last-child').textContent=side+' '+num(value);
  $('#td-game-log').querySelectorAll('tbody tr').forEach((row,i)=>{if(games[i])row.cells[3].innerHTML=trendResultMarkup(games[i].value,value,state.side);});
  $('#td-detail .td-summary-stats strong').textContent=pct(stats.rate);
  $('#td-detail .td-summary-stats small').textContent=stats.hits+' of '+stats.n+' games'+(stats.pushes?' · '+stats.pushes+' pushes':'');
  $('#td-detail .td-stat-meter').style.setProperty('--rate',(stats.rate??0)*100+'%');
  const manual=value!==comparisonLine(p);
  $('#td-detail .td-line-banner').outerHTML=trendQuoteBar(p,{line:value,side:state.side,manual});
  $('#td-detail').querySelectorAll('.td-rate-splits > button').forEach((el,i)=>{const s=summarize(selectGames(p,{window:['5','10','20','h2h','all'][i],venue:state.venue}),value,state.side);el.querySelector('strong').textContent=pct(s.rate);el.querySelector('small').textContent=s.rate===null?s.n+' games':s.hits+'/'+s.n;el.querySelector('i').style.setProperty('--rate',(s.rate??0)*100+'%');});
  $('#td-detail .td-chart-note').textContent=p.historyNote+' Hit rates compare past results against '+(manual?'your line':'one comparison line')+'; pushes remain in the sample.';
  $('#td-detail .td-context-modern').outerHTML=trendContextPanel(p,{games,line:value,side:state.side,modelUrl:modelLink(p),contextTab:state.contextTab});
 },
 onCommit(value) { state.manualLine=value;renderDetail();$('#td-detail [data-comparison-line]')?.focus({preventScroll:true}); },
 onCancel() { state.manualLine=beforeChartDrag;renderDetail();$('#td-detail [data-comparison-line]')?.focus({preventScroll:true}); }
});
$('#td-detail').addEventListener('change', e => { if (e.target.id === 'td-venue') { state.venue = e.target.value; render(); $('#td-venue').closest('.td-choice').querySelector('button').focus({ preventScroll: true }); } });
$('#td-detail').addEventListener('submit', e => { if (e.target.id !== 'td-line-form') return; e.preventDefault(); const value = finite(new FormData(e.target).get('line')); if (value !== null && value >= -100 && value <= 1000) { state.manualLine = value; renderDetail(); $('#td-line').focus({ preventScroll: true }); } });
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.market && b.dataset.market !== state.market) { state.pendingPlayerId=selected()?.playerId;state.market = b.dataset.market;state.manualLine=null;load({ schedule: false }); }
  if (b.dataset.player) {
    state.selected=b.dataset.player;state.manualLine=null;
    const url=new URL(location.href);url.searchParams.set('researchPlayer',state.selected);history.pushState(null,'',url);
    render();$('[data-back-board]').focus({preventScroll:true});$('#td-detail-nav').scrollIntoView({block:'start'});
  }
  if(b.hasAttribute('data-back-board')) {
    const key=state.selected;clearDetail();render();
    [...document.querySelectorAll('[data-player]')].find(el=>el.dataset.player===key)?.focus({preventScroll:true});
  }
  if(b.hasAttribute('data-step-player')) {
    const rows=trendRows(state.profiles,boardOptions()),index=rows.findIndex(r=>r.p.key===state.selected),next=rows[index+Number(b.dataset.stepPlayer)];
    if(next){state.selected=next.p.key;state.manualLine=null;render();}
  }
  if(b.hasAttribute('data-watch-player')) {
    const id=b.dataset.watchPlayer;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);
    try{localStorage.setItem(storageKey,JSON.stringify([...state.saved]));}catch{$('#td-notice').textContent='Watchlist changes last for this session.';}
    render();[...document.querySelectorAll('[data-watch-player]')].find(el=>el.dataset.watchPlayer===id)?.focus({preventScroll:true});
  }
  if (b.dataset.statMethod) { state.statMethod=b.dataset.statMethod;const p=selected();if(p){$('#td-support-section').innerHTML=trendSupportingPanel(p,selectGames(p,state),state.statMethod);document.querySelector('[data-stat-method="'+state.statMethod+'"]')?.focus({preventScroll:true});} }
  if (b.dataset.contextTab) selectContextTab(b.dataset.contextTab);
  if (b.dataset.window) { const split=b.closest('.td-rate-splits');state.window = b.dataset.window; render(); document.querySelector(`${split?'.td-rate-splits ':'.td-windows '}[data-window="${state.window}"]`)?.focus({ preventScroll: true }); }
  if (b.dataset.lineStep) { state.manualLine=Math.max(-100,Math.min(1000,(finite($('#td-line').value)??0)+Number(b.dataset.lineStep)));renderDetail();document.querySelector(`[data-line-step="${b.dataset.lineStep}"]`)?.focus({preventScroll:true}); }
  if (b.dataset.side) { const chartControl=!!b.closest('.td-chart-side');state.side = b.dataset.side; render();if(chartControl)document.querySelector('.td-chart-side [data-side="'+state.side+'"]')?.focus({preventScroll:true}); }
  if (b.hasAttribute('data-reset-line')) { state.manualLine = null; renderDetail(); }
  if (b.hasAttribute('data-watch')) { const p = selected(); if (!p) return; const id = String(p.playerId); state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id); try { localStorage.setItem(storageKey, JSON.stringify([...state.saved])); } catch { $('#td-notice').textContent = 'Watchlist changes last for this session. Browser storage is unavailable.'; } render(); $('[data-watch]')?.focus({ preventScroll: true }); }
  if (b.hasAttribute('data-log')) { const log = $('#td-game-log'); log.hidden = !log.hidden; b.setAttribute('aria-expanded', String(!log.hidden)); b.querySelector('span').textContent = log.hidden ? 'View game log' : 'Hide game log'; }
  if (b.hasAttribute('data-breakdown')) openBreakdown();
  if (b.hasAttribute('data-retry')) load({ force: true });
  if (b.hasAttribute('data-more')) { state.count += 50; render(); }
  if (b.hasAttribute('data-reset')) { state.search = ''; state.posted = false; state.savedOnly = false; state.venue = 'all'; state.game='';state.filters=defaultTrendFilters();$('#td-game').value='';$('#td-game').dispatchEvent(new Event('change',{bubbles:true}));$('#td-search').value = ''; render(); }
  if (b.dataset.date) { state.date = b.dataset.date; $('#td-date').value = state.date; state.game = sport === 'wnba' ? 'all' : ''; load(); }
});
$('#td-saved').innerHTML=icon('bookmark')+'<span>Watchlist</span>';
$('[data-back-board]').innerHTML=icon('arrow','td-back-arrow')+'<span>Back to Trends</span>';
$('[data-step-player="-1"]').innerHTML=icon('chevron','td-back-arrow');
$('[data-step-player="1"]').innerHTML=icon('chevron');
enhanceTrendControls();
await load();

window.addEventListener('popstate',()=>{state.selected=new URLSearchParams(location.search).get('researchPlayer');state.manualLine=null;render();});
let detailWidth=0,resizeFrame;
new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width>0&&Math.abs(width-detailWidth)>1){detailWidth=width;cancelAnimationFrame(resizeFrame);if(selected())resizeFrame=requestAnimationFrame(renderDetail);}}).observe($('#td-detail'));
