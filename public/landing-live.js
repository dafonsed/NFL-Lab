import { readBets, summarizeBets, betReturns, STATUSES } from './bet-utils.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safe = value => { try { const url = new URL(value); return url.protocol === 'https:' ? esc(url.href) : '#'; } catch { return '#'; } };
const number = value => Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
const day = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Unavailable';
const when = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)) : 'Unavailable';
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const readJson = async path => { const response = await fetch(path, { headers: { Accept: 'application/json' } }); if (!response.ok) throw Error('Source returned ' + response.status); return response.json(); };

export function mountLandingResearch() {
  const research = $('#workspace'), live = $('#home-live-panel'), simulation = $('#home-simulation-panel'), tools = $('#home-tool-panel');
  let payload = null, liveData = null, liveError = '', simCatalog = null, simResult = null, simError = '', tool = 'picks';
  const r = { playerId: '', window: 10, side: 'over', line: 0, gameId: '', search: '', sort: 'board' };
  const l = { sport: 'nfl', game: '', market: 'moneyline' };
  const s = { date: '', game: '', runs: 1000, pending: false };
  const player = () => payload?.players.find(item => item.id === r.playerId) || payload?.players[0];
  const rows = () => player()?.games.slice(0, r.window).reverse() || [];
  const researchUrl = p => '/research?sport=nfl&prop=rec_yds&researchPlayer=' + encodeURIComponent(p.id);
  const split = (games, line, side) => {
    const values = games.map(row => row.value), sorted = [...values].sort((a, b) => a - b);
    return { count: values.length, hits: values.filter(value => side === 'over' ? value > line : value < line).length,
      average: values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
      median: values.length ? (sorted[Math.floor((values.length - 1) / 2)] + sorted[Math.floor(values.length / 2)]) / 2 : 0 };
  };
  const researchStatus = p => (payload.stale || p.quote.stale) ? 'Captured source · refresh delayed' : 'Source snapshot · capture time shown';

  function renderResearch() {
    if (!payload) return;
    if (!research) return;
    const p = player(), games = rows(), result = split(games, r.line, r.side);
    const max = Math.max(r.line, ...games.map(game => game.value), 1);
    const game = p.games.find(item => item.id === r.gameId);
    research.innerHTML = `<div class="screen-top"><span>SportsLab / Player research</span><span>${esc(payload.period || 'NFL')}</span></div>
      <div class="research-identity"><div><span class="screen-kicker">NFL · ${esc(p.team)} vs ${esc(p.opponent)} · ${esc(p.position)}</span><h2>${esc(p.name)}</h2><p>Receiving yards · ${esc(p.quote.book || 'Public comparison')} captured line ${number(p.line)}</p></div><label class="research-player-label">Player<select data-research-player aria-label="Select player">${payload.players.map(item => `<option value="${esc(item.id)}"${item.id === p.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label></div>
      <div class="research-controls"><label>Comparison line<input data-research-line type="number" min="0" max="350" step="0.5" inputmode="decimal" value="${number(r.line)}"></label><div role="group" aria-label="Game window"><span>Completed games</span><div>${[5,10,20].map(n => `<button type="button" data-research-window="${n}" aria-pressed="${r.window === n}">L${n}</button>`).join('')}</div></div><div role="group" aria-label="Compare side"><span>Side of line</span><div><button type="button" data-research-side="over" aria-pressed="${r.side === 'over'}">Above</button><button type="button" data-research-side="under" aria-pressed="${r.side === 'under'}">Below</button></div></div></div>
      <div class="research-summary"><div class="research-hit"><small>Last ${result.count} completed games ${r.side === 'over' ? 'above' : 'below'} ${number(r.line)}</small><strong>${result.hits}<span> / ${result.count}</span></strong><em>Historical count, not a future probability</em></div><div class="research-facts"><div><small>Average</small><strong>${number(result.average)} yd</strong></div><div><small>Median</small><strong>${number(result.median)} yd</strong></div><div><small>Latest</small><strong>${number(p.games[0].value)} yd</strong></div></div></div>
      <div class="research-chart-label"><span>Receiving yards by completed game</span><span>Oldest → newest</span></div><div class="research-chart" style="grid-template-columns:repeat(${games.length},minmax(24px,1fr))" role="group" aria-label="${esc(p.name)} completed receiving yard results, oldest to newest">
      ${games.map(item => `<button type="button" data-research-game="${esc(item.id)}" class="${(r.side === 'over' ? item.value > r.line : item.value < r.line) ? 'hit' : 'miss'}${item.id === r.gameId ? ' selected' : ''}" aria-label="${esc(day(item.date))}, ${esc(item.opponent)}, ${number(item.value)} receiving yards"><b>${number(item.value)}</b><i style="height:${Math.max(7, item.value / max * 100).toFixed(1)}%"></i><small>${esc(item.opponent)}</small></button>`).join('')}</div>
      <div class="research-game" role="status">${game ? `<span>${day(game.date)} · ${game.home ? 'vs' : 'at'} ${esc(game.opponent)} · <strong>${number(game.value)} receiving yards</strong></span><a href="${safe(game.url)}" target="_blank" rel="noreferrer">Box score ↗</a>` : '<span>Select a result to inspect its game.</span><button type="button" data-research-reset>Reset captured line</button>'}</div>
      <div class="screen-footer"><span>${esc(researchStatus(p))} · ${when(p.quote.capturedAt)} · ${result.count} games</span><a href="${researchUrl(p)}">Open full research ↗</a></div>`;
  }
  function renderBoard() {
    if (!payload) return '<p>Player board is loading.</p>';
    const list = payload.players.filter(item => item.id !== payload.players[0].id && (item.name + ' ' + item.team).toLowerCase().includes(r.search.toLowerCase()));
    if (r.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (r.sort === 'rate') list.sort((a, b) => split(b.games.slice(0,10), b.line, 'over').hits - split(a.games.slice(0,10), a.line, 'over').hits);
    return `<div class="tool-heading"><div><span>Player research</span><h3>Start with a player.</h3><p>Captured NFL receiving yard lines with completed game history.</p></div><a class="home-button" href="/research">Open research ↗</a></div><div class="tool-board-filters"><label>Find player<input type="search" data-board-search placeholder="Name or team" value="${esc(r.search)}"></label><label>Order<select data-board-sort><option value="board"${r.sort==='board'?' selected':''}>Board order</option><option value="rate"${r.sort==='rate'?' selected':''}>Historical count</option><option value="name"${r.sort==='name'?' selected':''}>Player name</option></select></label></div><div class="tool-board">${list.length ? list.slice(0,5).map(item => { const n=split(item.games.slice(0,10), item.line, 'over'); return `<button type="button" data-board-player="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${esc(item.team)} vs ${esc(item.opponent)} · ${esc(item.quote.book || 'Public quote')} ${number(item.line)}</small></span><b>${n.hits}/${n.count}<small>above line</small></b></button>`; }).join('') : '<p class="tool-empty">No players match your search.</p>'}</div><p class="tool-note">Historical counts only. Quotes may be stale; check the capture time in player research.</p>`;
  }
  function selectTool(next) {
    tool = next;
    document.querySelectorAll('[data-home-tool]').forEach(button => { const active = button.dataset.homeTool === next; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    renderTool();
  }
  function renderTool() {
    if (tool === 'research') tools.innerHTML = renderBoard();
    if (tool === 'live') tools.innerHTML = `<div class="tool-heading"><div><span>Live games</span><h3>Game state, in context.</h3><p>Select a sport or game above to inspect the feed and available markets.</p></div><a class="home-button" href="/live">Open live center ↗</a></div><div class="tool-linked-state">${liveData?.game ? `<strong>${esc(liveData.game.teams.find(t=>t.homeAway==='away')?.name)} at ${esc(liveData.game.teams.find(t=>t.homeAway==='home')?.name)}</strong><span>${esc(liveData.game.state==='pre'?'Upcoming':liveData.game.status)} · updated ${when(liveData.fetchedAt)}</span>` : '<strong>Live feed status</strong><span>Use the game center to choose a date and matchup. The public feed may be unavailable.</span>'}</div><div class="tool-route-grid"><a href="/nfl/live">NFL ↗</a><a href="/nba/live">NBA ↗</a><a href="/wnba/live">WNBA ↗</a><a href="/mlb/live">MLB ↗</a></div>`;
    if (tool === 'simulation') tools.innerHTML = `<div class="tool-heading"><div><span>Simulation</span><h3>Keep the assumptions visible.</h3><p>Run the game model for a matchup, then inspect its outcome range.</p></div><a class="home-button" href="/simulation">Open simulation ↗</a></div><div class="tool-linked-state"><strong>${simResult ? esc(simResult.teams.map(t=>t.label).join(' at ')) : 'Select a matchup and run the model'}</strong><span>${simResult ? 'Expected total '+number(simResult.total.mean)+' · middle 80% '+simResult.total.p10+'–'+simResult.total.p90 : 'Scores are experimental estimates, not verified outcomes.'}</span></div><p class="tool-note">The full simulation view includes score distributions, player props when available, and model details.</p>`;
    if (tool === 'picks') renderPicks();
  }

  document.querySelector('.home-tool-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-home-tool]'); if (tab) selectTool(tab.dataset.homeTool); });
  document.querySelector('.home-tool-tabs').addEventListener('keydown', event => { if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; const tabs=[...document.querySelectorAll('[data-home-tool]')], current=tabs.indexOf(event.target.closest('[data-home-tool]')); if(current<0)return; event.preventDefault(); const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+tabs.length)%tabs.length; selectTool(tabs[next].dataset.homeTool); tabs[next].focus(); });
  tools.addEventListener('input', event => { if (event.target.matches('[data-board-search]')) { r.search=event.target.value; const board=tools.querySelector('.tool-board'); if(board) { const start=event.target.selectionStart; renderTool(); tools.querySelector('[data-board-search]')?.focus(); tools.querySelector('[data-board-search]')?.setSelectionRange(start,start); } } });
  tools.addEventListener('change', event => { if (event.target.matches('[data-board-sort]')) { r.sort=event.target.value; renderTool(); } });
  tools.addEventListener('click', event => { const button=event.target.closest('[data-board-player]'); if(!button)return; r.playerId=button.dataset.boardPlayer; window.location.href=researchUrl(player()); });
  research?.addEventListener('click', event => { const target=event.target.closest('[data-research-window],[data-research-side],[data-research-game],[data-research-reset]'); if(!target)return; if(target.dataset.researchWindow)r.window=Number(target.dataset.researchWindow); if(target.dataset.researchSide)r.side=target.dataset.researchSide; if(target.dataset.researchGame)r.gameId=target.dataset.researchGame; if(target.hasAttribute('data-research-reset'))r.line=player().line; renderResearch(); });
  research?.addEventListener('input', event => { if(event.target.matches('[data-research-line]')){const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=350)r.line=value;} });
  research?.addEventListener('focusout', event => { if(event.target.matches('[data-research-line]'))renderResearch(); });
  research?.addEventListener('change', event => { if(event.target.matches('[data-research-player]')){r.playerId=event.target.value;r.line=player().line;r.gameId='';renderResearch();} if(event.target.matches('[data-research-line]')){const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=350){r.line=value;r.gameId='';renderResearch();}} });
  async function loadResearch() {
    const latest = readJson('/api/landing/research');
    try { payload = await readJson('/landing-research-snapshot.json'); } catch { try { payload = await latest; } catch { if(research)research.innerHTML='<p class="screen-error">Player history is unavailable. <a href="/research">Open the workspace ↗</a></p>'; return; } }
    r.playerId=payload.players[0].id;r.line=player().line;renderResearch();if(tool==='research')renderTool();
    latest.then(next => { const newer=Date.parse(next.boardFetchedAt||'')>Date.parse(payload.boardFetchedAt||'');if(!newer)return;const oldLine=player().line;payload=next;if(!payload.players.some(item=>item.id===r.playerId))r.playerId=payload.players[0].id;if(r.line===oldLine)r.line=player().line;renderResearch();if(tool==='research')renderTool(); }).catch(()=>{});
  }

  const liveMarkets = () => liveData?.odds?.books?.[0]?.markets || [];
  const liveGame = () => liveData?.game || liveData?.events?.find(item => item.id === l.game);
  const liveLabel = game => game?.state === 'in' ? 'In progress' : game?.state === 'post' ? 'Final' : 'Upcoming';
  const oddsLabel = selection => {
    const price = Number(selection.odds);
    return (selection.line === null || selection.line === undefined ? '' : number(selection.line) + '  ') + (Number.isFinite(price) ? (price > 0 ? '+' : '') + price : '—');
  };
  function renderLive() {
    const game = liveGame(), markets = liveMarkets();
    if (!markets.some(item => item.key === l.market)) l.market = markets[0]?.key || 'moneyline';
    const market = markets.find(item => item.key === l.market);
    const away = game?.teams?.find(team => team.homeAway === 'away'), home = game?.teams?.find(team => team.homeAway === 'home');
    live.innerHTML = `<div class="screen-top"><span>SportsLab / Live game center</span><span class="feed-badge${liveData?.stale || liveError ? ' is-stale' : ''}">${liveError ? 'Feed unavailable' : liveData?.stale ? 'Feed delayed' : liveLabel(game)}</span></div>
      <div class="live-controls"><label>Sport<select data-live-sport aria-label="Choose live sport">${[['nfl','NFL'],['nba','NBA'],['wnba','WNBA'],['mlb','MLB']].map(([key,value])=>`<option value="${key}"${l.sport===key?' selected':''}>${value}</option>`).join('')}</select></label><label>Game<select data-live-game aria-label="Choose game" ${liveData?.events?.length?'':'disabled'}>${liveData?.events?.length?liveData.events.map(item=>{const a=item.teams.find(t=>t.homeAway==='away'),h=item.teams.find(t=>t.homeAway==='home');return `<option value="${esc(item.id)}"${item.id===game?.id?' selected':''}>${esc(a?.abbreviation)} at ${esc(h?.abbreviation)} · ${esc(item.status)}</option>`}).join(''):'<option>No games available</option>'}</select></label><button type="button" data-live-refresh>Refresh feed</button></div>
      <div class="live-scoreboard">${game ? `<div class="live-matchup"><span>${esc(l.sport.toUpperCase())} · ${esc(liveLabel(game))}</span><strong>${esc(away?.name || 'Away')} <small>at</small> ${esc(home?.name || 'Home')}</strong><em>${esc(game.status || 'Status unavailable')}</em></div><div class="live-score"><div><span>${esc(away?.abbreviation || 'AWAY')}</span><strong>${game.state==='pre'?'—':Number.isFinite(away?.score)?away.score:'—'}</strong></div><div><span>${esc(home?.abbreviation || 'HOME')}</span><strong>${game.state==='pre'?'—':Number.isFinite(home?.score)?home.score:'—'}</strong></div></div>` : `<div class="live-matchup"><span>${esc(l.sport.toUpperCase())} · GAME CENTER</span><strong>${liveError ? 'The feed is unavailable.' : 'No game on this date.'}</strong><em>${liveError ? 'Refresh to try the public source again.' : 'Choose another sport in the game center.'}</em></div>`}</div>
      <div class="live-market-head"><div><strong>Available market context</strong><span>${esc(liveData?.odds?.note || 'Prices appear when the provider publishes them.')}</span></div><a href="/${esc(l.sport)}/live">View full game ↗</a></div>
      <div class="live-market-tabs" role="group" aria-label="Game market">${markets.length?markets.map(item=>`<button type="button" data-live-market="${esc(item.key)}" aria-pressed="${l.market===item.key}">${esc(item.label)}</button>`).join(''):'<span>Markets unavailable</span>'}</div>
      <div class="live-market-values">${market?.selections?.length?market.selections.map(item=>`<div><span>${esc(item.label || item.side)}</span><strong>${esc(oddsLabel(item))}</strong></div>`).join(''):'<p>There are no published prices for this game and market.</p>'}</div>
      <div class="screen-footer"><span>${liveData ? 'Public feed · updated '+when(liveData.fetchedAt)+(liveData.stale?' · delayed':'') : 'Last update unavailable'}${liveData?.odds?.books?.[0]?.name ? ' · '+esc(liveData.odds.books[0].name) : ''}</span><a href="${safe(liveData?.odds?.sourceUrl || liveData?.sources?.[0]?.url)}" target="_blank" rel="noreferrer">Feed source ↗</a></div>`;
    if(tool==='live')renderTool();
  }
  async function loadLive() {
    liveError=''; live.innerHTML='<p class="home-loading">Connecting to the public game feed…</p>';
    const query=new URLSearchParams();if(l.game)query.set('game',l.game);
    try { const next=await readJson('/api/'+l.sport+'/live'+(query.size?'?'+query:''));liveData=next;l.game=next.selected||next.game?.id||'';renderLive(); }
    catch { liveData=null;liveError='The public feed could not be loaded.';renderLive(); }
  }
  live.addEventListener('click',event=>{const target=event.target.closest('[data-live-refresh],[data-live-market]');if(!target)return;if(target.hasAttribute('data-live-refresh'))loadLive();else{l.market=target.dataset.liveMarket;renderLive();}});
  live.addEventListener('change',event=>{if(event.target.matches('[data-live-sport]')){l.sport=event.target.value;l.game='';l.market='moneyline';loadLive();}if(event.target.matches('[data-live-game]')){l.game=event.target.value;loadLive();}});

  function distribution(dist) {
    const pmf=dist?.pmf;if(!pmf?.length)return '<p>Distribution unavailable for this run.</p>';
    const lo=pmf[0].value,hi=pmf.at(-1).value,width=Math.max(1,Math.ceil((hi-lo+1)/12));
    const bins=Array.from({length:Math.ceil((hi-lo+1)/width)},(_,i)=>({from:lo+i*width,to:Math.min(hi,lo+(i+1)*width-1),p:0}));
    pmf.forEach(item=>{bins[Math.floor((item.value-lo)/width)].p+=item.probability;});
    const max=Math.max(...bins.map(bin=>bin.p),.001);
    return `<div class="sim-distribution" role="img" aria-label="Simulated total score distribution, middle 80 percent ${dist.p10} to ${dist.p90}">${bins.map(bin=>`<span title="${bin.from}–${bin.to}: ${Math.round(bin.p*100)}%"><i style="height:${Math.max(5,bin.p/max*100).toFixed(1)}%"></i><small>${bin.from}</small></span>`).join('')}</div>`;
  }
  function renderSimulation() {
    const events=simCatalog?.events||[],selected=events.find(item=>item.id===s.game);
    simulation.innerHTML=`<div class="screen-top"><span>SportsLab / Game simulation</span><span>Experimental model</span></div>
      <div class="sim-panel-head"><div><span class="screen-kicker">Matchup scenario</span><h2>${selected ? selected.teams.map(t=>esc(t.name)).join(' at ') : 'Choose a game'}</h2><p>${simCatalog?.stale?'Schedule needs a refresh.':simError||'Select a matchup, choose the number of runs, then compare its score range.'}</p></div></div>
      <div class="sim-form"><label>Date<input type="date" data-sim-date value="${esc(s.date)}"></label><label>Matchup<select data-sim-game aria-label="Select simulation matchup" ${events.length?'':'disabled'}>${events.length?events.map(item=>`<option value="${esc(item.id)}"${item.id===s.game?' selected':''}>${item.teams.map(t=>esc(t.abbreviation)).join(' at ')}</option>`).join(''):'<option>No games available</option>'}</select></label><label>Runs<select data-sim-runs><option value="1000"${s.runs===1000?' selected':''}>1,000</option><option value="10000"${s.runs===10000?' selected':''}>10,000</option><option value="25000"${s.runs===25000?' selected':''}>25,000</option></select></label><button type="button" data-sim-run ${!selected||simCatalog?.stale||s.pending?'disabled':''}>${s.pending?'Running…':'Run model'}</button></div>
      ${simResult ? `<div class="sim-output"><div class="sim-output-head"><span>Projected score · ${esc(simResult.outcomeScope==='regulation-only'?'regulation only':'full game estimate')}</span><span>${simResult.simulations.toLocaleString()} runs</span></div><div class="sim-scoreline">${simResult.teams.map(t=>`<div><small>${esc(t.side)}</small><strong>${esc(t.label)} <b>${number(t.score.mean)}</b></strong><span>Middle 80% ${t.score.p10}–${t.score.p90}</span></div>`).join('')}</div><div class="sim-total"><div><small>Expected combined score</small><strong>${number(simResult.total.mean)}</strong></div><div><small>Middle 80% of scenarios</small><strong>${simResult.total.p10}–${simResult.total.p90}</strong></div></div><div class="sim-chart-title">Combined score distribution</div>${distribution(simResult.total)}</div>` : `<div class="sim-ready"><strong>${s.pending?'Running the selected matchup…':simError?'No result available':'Ready for a matchup'}</strong><p>${esc(simError||'The model reports expected scores and a scenario range after a run.')}</p></div>`}
      <div class="screen-footer"><span>${simResult?'Model '+esc(simResult.version)+' · '+esc(simResult.game?.officialDate||s.date):'Schedule '+(s.date||'unavailable')} · estimates, not outcomes</span><a href="/simulation">Inspect full assumptions ↗</a></div>`;
    if(tool==='simulation')renderTool();
  }
  async function loadCatalog() {
    simError='';simResult=null;simulation.innerHTML='<p class="home-loading">Loading the connected game schedule…</p>';
    try { simCatalog=await readJson('/api/simulation/catalog?sport=nfl'+(s.date?'&date='+encodeURIComponent(s.date):''));s.date=simCatalog.date;s.game=simCatalog.events?.[0]?.id||'';renderSimulation();if(s.game&&!simCatalog.stale)runSimulation(); }
    catch { simCatalog=null;simError='The schedule could not be loaded. Try another date or open the full simulation.';renderSimulation(); }
  }
  async function runSimulation() {
    if(!s.game||simCatalog?.stale)return;
    s.pending=true;simResult=null;simError='';renderSimulation();
    const params=new URLSearchParams({sport:'nfl',date:s.date,game:s.game,simulations:String(s.runs)});
    try { const result=await readJson('/api/simulation/run?'+params);if(result.status!=='experimental')throw Error(result.warnings?.[0]||'The model did not return a result.');simResult=result; }
    catch(error){simError=error.message||'The simulation is unavailable.';}
    finally{s.pending=false;renderSimulation();}
  }
  simulation.addEventListener('click',event=>{if(event.target.closest('[data-sim-run]'))runSimulation();});
  simulation.addEventListener('change',event=>{if(event.target.matches('[data-sim-date]')){s.date=event.target.value;loadCatalog();}if(event.target.matches('[data-sim-game]')){s.game=event.target.value;simResult=null;renderSimulation();}if(event.target.matches('[data-sim-runs]')){s.runs=Number(event.target.value);simResult=null;renderSimulation();}});

  function renderPicks() {
    let bets;
    try { bets=readBets(localStorage); }
    catch { tools.innerHTML='<div class="tool-heading"><div><span>My picks</span><h3>Saved picks are unavailable.</h3><p>Browser storage could not be read. Your existing data has not been changed.</p></div><a class="home-button" href="/bets">Open My Picks ↗</a></div>';return; }
    const today=new Date(),year=today.getFullYear(),month=today.getMonth(),first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate();
    const monthly=bets.filter(bet=>bet.date.startsWith(year+'-'+String(month+1).padStart(2,'0')));
    const totals=summarizeBets(bets);
    const perDay=new Map();
    monthly.forEach(bet=>{const item=perDay.get(bet.date)||{count:0,profit:0};item.count++;item.profit+=betReturns(bet).profit||0;perDay.set(bet.date,item);});
    const calendar=Array.from({length:first},()=>'<span class="pick-day spacer" aria-hidden="true"></span>').join('')+Array.from({length:days},(_,i)=>{const d=i+1,key=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'),record=perDay.get(key);return `<span class="pick-day ${record ? record.profit>0?'positive':record.profit<0?'negative':'recorded' : ''}" title="${record?record.count+' saved pick'+(record.count===1?'':'s')+' · '+money(record.profit):'No saved picks'}"><small>${d}</small><strong>${record?record.profit===0?record.count+' pick'+(record.count===1?'':'s'):money(record.profit):'—'}</strong></span>`;}).join('');
    tools.innerHTML=`<div class="tool-heading"><div><span>My picks</span><h3>${bets.length?'Your saved record.':'Start your own record.'}</h3><p>${bets.length?'Picks and notes saved in this browser. This is your record, not a verified return claim.':'No picks are saved in this browser yet. Add a pick in the tracker to see it here.'}</p></div><a class="home-button" href="/bets">${bets.length?'Open My Picks':'Add a pick'} ↗</a></div>
      ${bets.length?`<div class="pick-summary"><div><small>Saved picks</small><strong>${bets.length}</strong></div><div><small>Open</small><strong>${totals.open}</strong></div><div><small>Settled record</small><strong>${totals.won}–${totals.lost}</strong></div><div><small>Net profit</small><strong class="${totals.profit>=0?'positive':'negative'}">${money(totals.profit)}</strong></div></div>`:''}
      <div class="pick-calendar"><div class="pick-calendar-top"><strong>${new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(today)}</strong><span>${monthly.length?'Saved activity':'No saved activity this month'}</span></div><div class="pick-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="pick-grid">${calendar}</div></div>
      ${bets.length?`<div class="pick-recent"><span>Recent picks</span>${bets.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).map(bet=>`<div><strong>${esc(bet.selection)}</strong><small>${day(bet.date)} · ${esc(bet.sport)} · ${esc(STATUSES[bet.status]||bet.status)}</small></div>`).join('')}</div>`:'<p class="tool-note">Your picks stay on this device. SportsLab does not place bets.</p>'}`;
  }
  window.addEventListener('storage',event=>{if(event.key==='nfl-lab.personal-bets.v1'&&tool==='picks')renderPicks();});

  // Live feeds, simulations, and the browser-local pick record initialize independently.
  loadResearch(); renderPicks(); loadLive(); loadCatalog();
}
