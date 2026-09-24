import {escape as esc, finite, number as num, selectGames, summarize} from './research-data.js';
import {icon} from './ui-icons.js';
import {playerPortrait,teamMark} from './sports-identity.js';

// The same compact book mark is used beside prices on every research surface.
export function sportsbookMark(book) {
  if (/^draftkings(?:sportsbook)?$/.test(String(book||'').toLowerCase().replace(/[^a-z]/g,''))) return '<span class="sportsbook-symbol" title="DraftKings"><img src="/assets/sportsbooks/draftkings.svg" alt="DraftKings" width="18" height="18"></span>';
  return /^fanduel(?:sportsbook)?$/.test(String(book||'').toLowerCase().replace(/[^a-z]/g,''))
    ? '<span class="td-sportsbook-logo" title="FanDuel"><img src="/assets/sportsbooks/fanduel.png" alt="FanDuel" width="1920" height="1080"></span>' : '';
}

// A request boundary for presentation code; source and model results are not altered.
export async function requestData(url, {signal, timeout = 45000} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  try {
    const response = await fetch(url, {signal:controller.signal});
    if (!response.ok) throw Error(response.status === 404 ? 'This selection is no longer available. Choose another date or matchup.' : 'The data service is unavailable. Retry to check the source again.');
    try { return await response.json(); } catch (error) { if(controller.signal.aborted)throw error; throw Error('The data service returned an incomplete response. Please retry.'); }
  } catch (error) {
    if (timedOut) throw Error('This request took too long. Retry, or choose another date while the source recovers.');
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) throw Error('The connection was interrupted. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function loadingRows(title = 'Loading players', action = 'data-retry') {
  return `<div class="board-loading"><div class="board-loading-caption"><span class="loading-mark" aria-hidden="true"></span><div><strong>${esc(title)}</strong><p>Waiting for the selected schedule, player history and available lines.</p></div><button class="button subtle" ${action}>Retry</button></div><div class="skeleton-rows" aria-hidden="true">${Array.from({length:5},()=>'<div><i></i><span></span><b></b><b></b><b></b></div>').join('')}</div></div>`;
}

export function emptyBoard(title, description, actions = '') {
  return `<div class="product-empty"><span class="empty-symbol">${icon('calendar')}</span><div><h2>${esc(title)}</h2><p>${esc(description)}</p>${actions ? `<div class="empty-actions">${actions}</div>` : ''}</div></div>`;
}

export function miniHistory(profile, side = 'over') {
  const games = selectGames(profile, {window:'10'}).slice().reverse(), line = finite(profile.prop?.line);
  if (!games.length) return '<span class="history-unavailable">No prior games</span>';
  const max = Math.max(1, ...games.map(g=>g.value), line ?? 0), min = Math.min(0,...games.map(g=>g.value),line??0), slot = 100/games.length;
  const y = v => 32-(v-min)/(max-min)*29, zero = y(0);
  return `<svg class="board-history" viewBox="0 0 100 34" role="img" aria-label="${esc(games.map(g=>`${g.date.slice(0,10)}: ${g.value}`).join('; '))}">${games.map((g,i)=>{const top=Math.min(zero,y(g.value)),h=Math.max(1,Math.abs(zero-y(g.value))),kind=line===null?'neutral':g.value===line?'push':(side==='over'?g.value>line:g.value<line)?'hit':'miss';return `<rect x="${i*slot+1}" y="${top}" width="${Math.max(2,slot-3)}" height="${h}" rx="1.5" class="${kind}"/>`;}).join('')}${line===null?'':`<line x1="0" x2="100" y1="${y(line)}" y2="${y(line)}"/>`}</svg>`;
}

// Keep game prices and player research one click apart without losing either view.
export function mountLiveWorkspace() {
  const odds=document.querySelector('#odds'),players=document.querySelector('#players');
  if(!odds||!players)return;
  const tabs=document.createElement('div');tabs.className='live-panel-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Live research');
  tabs.innerHTML='<button id="live-game-tab" role="tab" aria-controls="live-game-panel" data-live-panel="game">Game odds</button><button id="live-players-tab" role="tab" aria-controls="live-players-panel" data-live-panel="players">Player projections</button>';
  odds.before(tabs);
  const game=document.createElement('section');game.id='live-game-panel';game.setAttribute('role','tabpanel');game.setAttribute('aria-labelledby','live-game-tab');odds.before(game);game.append(odds);
  const empty=document.createElement('div');empty.className='live-panel-empty';empty.textContent='Choose a game to inspect available sportsbook prices and model estimates.';game.append(empty);
  empty.addEventListener('click',event=>{if(event.target.closest('[data-live-retry]'))document.querySelector('#refresh')?.click();});
  const sync=()=>{empty.hidden=!odds.hidden;};new MutationObserver(sync).observe(odds,{attributes:true,attributeFilter:['hidden']});sync();
  const playerPanel=document.createElement('section');playerPanel.id='live-players-panel';playerPanel.setAttribute('role','tabpanel');playerPanel.setAttribute('aria-labelledby','live-players-tab');game.after(playerPanel);
  for(const selector of ['#markets','.live-filter-row','.live-line-note','#players']){const node=document.querySelector(selector);if(node)playerPanel.append(node);}
  function select(panel){for(const b of tabs.querySelectorAll('button')){const active=b.dataset.livePanel===panel;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}game.hidden=panel!=='game';playerPanel.hidden=panel!=='players';const url=new URL(location.href);url.searchParams.set('panel',panel);history.replaceState(null,'',url);}
  tabs.addEventListener('click',e=>{const button=e.target.closest('[data-live-panel]');if(button)select(button.dataset.livePanel);});
  tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'game':e.key==='End'?'players':game.hidden?'game':'players';select(next);tabs.querySelector('[aria-selected=true]').focus();});
  select(new URLSearchParams(location.search).get('panel')==='players'?'players':'game');
}

export function renderLiveEmptyState(data,{loading=false,error=''}={}) {
  const empty=document.querySelector('.live-panel-empty');if(!empty)return;
  const unavailable=Boolean(error||data?.stale),noGames=!data?.events?.length;
  const title=loading&&!data?'Loading the scoreboard':noGames?(unavailable?'Game feed unavailable':'No games on this date'):'Game prices unavailable';
  const description=loading&&!data?'Connecting to the selected sport.':noGames?(unavailable?'Refresh the feed or choose another game date.':'Choose another date to see the available matchups.'):'Select another matchup or refresh for the latest available prices.';
  empty.innerHTML=`<span class="live-empty-symbol">${icon('live')}</span><h2>${title}</h2><p>${description}</p>${loading?'':'<button type="button" class="button subtle" data-live-retry>'+icon('refresh')+' Refresh games</button>'}`;
}

export function propRow(profile, {open='data-player', id=profile.key, save='data-save', saveId=profile.playerId, saved=false, side='over', compare=false, comparing=false, kind='sports-card'} = {}) {
  const p=profile, f=p.forecast||{}, quote=p.prop, probability=finite(f.probability?.[side]);
  const source=quote ? quote.basis==='published_archive'?(quote.stale?'Retrospective · saved':'Retrospective'):quote.stale?'Saved quote':quote.basis==='in_play'?'In play':quote.basis==='captured_pregame'?'Pregame':'Posted' : 'Not available';
  const outcome=p.result, final=outcome&&finite(outcome.actual)!==null&& ['final','over','under','push','no_line'].includes(outcome.status);
  const resultLabel={did_not_play:'Did not play',did_not_bat:'No plate appearance',did_not_start:'Did not start',needs_regulation_stats:'Regulation stats needed',no_stats:'Result unavailable',missing:'Result unavailable',unsettled:'Postponed / unsettled',no_line:'Final · line unverified'}[outcome?.status]||(final?'Final'+(['over','under','push'].includes(outcome.status)?' · '+outcome.status:''):p.raw?.gameState||'Not settled');
  const probabilityText=probability===null?'—':`${Math.round(probability*100)}%`;
  const tdChance=p.market==='any_td'&&p.sport==='nfl';
  const calibrated=tdChance&&p.raw?.tdProbMethod==='historical-score-calibration'&&finite(p.raw.tdProb)!==null&&!p.availability?.unavailable;
  const label=calibrated?'Score TD chance':tdChance?'Workload TD chance':'Projected '+String(p.label||p.unit||'amount').toLowerCase();
  const modelValue=calibrated?`${Math.round(p.raw.tdProb*100)}%`:tdChance&&finite(f.point)!==null?`${Math.round(f.point*100)}%`:num(f.point,p.sport==='mlb'?2:1);
  const probabilityLabel=calibrated?'Workload 1+ TD chance':`Model ${side} chance`;
  const status=p.availability?.concern||p.availability?.unavailable?p.availability.status:p.lineup==='confirmed'?`Batting ${p.battingOrder}`:p.lineup==='probable'?'Probable starter':'';
  const odds=finite(quote?.prices?.[side]?.american);
  return `<article class="research-row ${kind}" data-research-row="${esc(p.key)}"><header class="research-identity"><button class="research-player player-detail-link" ${open}="${esc(id)}" aria-haspopup="dialog">${playerPortrait(p)}<span><strong>${esc(p.name)}</strong><small><span class="position">${esc(p.position||p.sport.toUpperCase())}</span> · ${esc(p.team)} vs ${esc(p.opponent||'TBD')}${p.raw?.gameNumber>1?' · Game '+p.raw.gameNumber:''}</small>${status?`<small class="player-status">${esc(status)}</small>`:''}</span></button></header>
  <div class="research-line" title="${esc(source)}${quote?' · '+esc(quote.bookmaker):''}"><span class="row-field-label">Sportsbook line</span><strong>${quote?`${p.market==='any_td'?'1+ TD':num(quote.line)}`:'—'}</strong><small>${quote?esc(quote.bookmaker):'No posted line'}</small><span class="quote-kind">${source}</span></div>
  <div class="research-odds" title="${esc(source)}${quote?' · '+esc(quote.bookmaker):''}"><span class="row-field-label">Book odds</span>${odds!==null?sportsbookMark(quote?.bookmaker):''}<strong>${odds===null?'—':(odds>0?'+':'')+num(odds,0)}</strong>${odds!==null&&!sportsbookMark(quote?.bookmaker)?`<small>${esc(quote?.bookmaker||'')}</small>`:''}</div>
  <div class="research-estimate"><span class="row-field-label">${esc(label)}</span><strong>${modelValue}</strong><small>${calibrated?'2024–2025 outcome fit · if playing':finite(f.point)===null?'Estimate unavailable':`${f.sampleCount??p.rows.length} prior games`}</small>${finite(p.raw?.modelScore)!==null?`<small class="row-rating">Research rating ${num(p.raw.modelScore)} / 100</small>`:''}</div>
  <div class="research-probability"><span class="row-field-label">${esc(probabilityLabel)}</span><strong>${probabilityText}</strong><small>${probability===null?'No comparable estimate':tdChance?'Separate workload model':'At posted line'}</small></div>
  <div class="research-result"><span class="row-field-label">Actual result</span><strong>${final?num(outcome.actual):'—'}</strong><small>${esc(resultLabel)}</small></div>
  <div class="research-actions${compare?' mlb-card-actions':''}"><button class="save-player" ${save}="${esc(saveId)}" aria-label="${saved?'Unsave':'Save'} ${esc(p.name)}" title="${saved?'Remove saved player':'Save player'}" aria-pressed="${saved}">${icon(saved?'check':'bookmark')}</button>${compare?`<button data-compare="${esc(id)}" aria-pressed="${comparing}" aria-label="${comparing?'Remove':'Compare'} ${esc(p.name)}" title="Compare player">${icon(comparing?'check':'plus')}</button><button ${open}="${esc(id)}" class="row-open" aria-label="Details for ${esc(p.name)}" title="Player details">${icon('chevron')}</button>`:''}</div></article>`;
}

export function propBoard(rows, options={}) {
  const tdChance=rows[0]?.sport==='nfl'&&rows[0]?.market==='any_td', side=options.side||'over';
  const calibrated=tdChance&&rows.some(p=>p.raw?.tdProbMethod==='historical-score-calibration');
  const estimate=calibrated?'Score TD chance':tdChance?'Workload TD chance':'Projected '+(rows[0]?.label||'amount').toLowerCase();
  const comparison=calibrated?'Workload 1+ TD chance':`Model ${side} chance`;
  return `<div class="research-board model-board"><div class="research-board-guide"><span><b>Sportsbook</b> Line and American odds are the posted market.</span><span><b>${esc(estimate)}</b> ${calibrated?'Profile score fitted to 2024–2025 rushing/receiving TD outcomes, conditional on playing.':tdChance?'Model estimate from expected workload and TD rates.':'Model estimate in the selected stat.'}</span><span><b>${esc(comparison)}</b> ${tdChance?'Separate workload forecast and historical error comparison.':'Estimated chance of clearing the posted line.'} Neither model number is the sportsbook’s implied probability.</span></div><div class="research-columns" aria-hidden="true"><span>Player / matchup</span><span>Sportsbook line</span><span>Book odds</span><span>${esc(estimate)}</span><span>${esc(comparison)}</span><span class="research-column-result">Actual result</span><span></span></div>${rows.map(p=>propRow(p,typeof options.row==='function'?{...options,...options.row(p)}:options)).join('')}</div>`;
}

// Each window uses only the recorded games available for this player.
export function trendTable(rows, {side='over', venue='all', saved=new Set()}={}) {
  const windows=[['5','L5'],['10','L10'],['20','L20'],['h2h','H2H']];
  const rates=(p,line)=>windows.map(([window,label])=>{
    const s=summarize(selectGames(p,{window,venue}),line,side);
    const tone=s.rate===null?'missing':s.rate>=.7?'high':s.rate>=.5?'mid':'low';
    return `<td class="trend-rate ${tone}" data-window-label="${label}" title="${label}: ${s.rate===null?'No comparison line':s.hits+' hits'} · ${s.n} recorded games${s.pushes?' · '+s.pushes+' pushes':''}"><strong>${s.rate===null?'—':Math.round(s.rate*100)+'%'}</strong><small>${s.rate===null?s.n+' games':s.hits+'/'+s.n}</small></td>`;
  }).join('');
  return `<div class="trend-table-scroll" tabindex="0" role="region" aria-label="Player trends table"><table class="trend-table"><caption class="sr-only">Historical hit rates by player. L5, L10 and L20 use up to 5, 10 and 20 recorded games. H2H uses available games against the current opponent. Pushes remain in each sample.</caption><thead><tr><th scope="col"><span class="sr-only">Watchlist</span></th><th scope="col">Proposition</th><th scope="col">Line</th><th scope="col">Odds</th>${windows.map(([,label])=>`<th scope="col">${label}</th>`).join('')}<th scope="col">Average<small>Available games</small></th></tr></thead><tbody>${rows.map(({p,line})=>{
    const watched=saved.has(String(p.playerId)),odds=finite(p.prop?.prices?.[side]?.american),quote=p.prop;
    const kind=!quote?'No posted line':quote.stale?'Saved quote':quote.basis==='published_archive'?'Archived quote':quote.basis==='in_play'?'In play':'Posted quote';
    const all=summarize(selectGames(p,{window:'all',venue}),null,side);
    return `<tr data-trend-row="${esc(p.key)}"><td><button class="trend-save" data-watch-player="${esc(p.playerId)}" aria-label="${watched?'Unsave':'Save'} ${esc(p.name)}" aria-pressed="${watched}">${icon(watched?'check':'plus')}</button></td><th scope="row"><button class="td-player-name trend-player-link" data-player="${esc(p.key)}">${playerPortrait(p)}<span><span class="trend-player-topline"><strong>${esc(p.name)}</strong><small>${esc(p.team)} vs ${esc(p.opponent||'TBD')}${p.raw?.gameNumber>1?' · Game '+p.raw.gameNumber:''}</small></span><b>${line===null?esc(p.label):`${side==='over'?'Over':'Under'} ${num(line)} ${esc(p.label)}`}</b><small class="trend-mobile-quote sr-only">${esc(kind)}</small></span></button></th><td class="trend-line" title="${esc(kind)}"><strong>${num(line)}</strong><small class="sr-only">${esc(kind)}</small></td><td class="trend-odds" title="${esc(quote?.bookmaker||'No odds')}">${odds!==null&&/fanduel/i.test(quote?.bookKey||quote?.bookmaker||'')?'<span class="td-sportsbook-logo"><img src="/assets/sportsbooks/fanduel.png" alt="FanDuel" width="1920" height="1080"></span>':''}<strong>${odds===null?'—':(odds>0?'+':'')+num(odds,0)}</strong><small class="sr-only">${esc(quote?.bookmaker||'Unavailable')}</small></td>${rates(p,line)}<td class="trend-average"><strong>${num(all.average)}</strong><small>${all.n} games</small></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function gameStrip(games, {selected='',attribute='data-board-game',all=true,sport}={}) {
  if(!games.length)return '';
  return `<div class="game-strip" aria-label="Matchups">${all?`<button class="game-chip game-chip-all" ${attribute}="" aria-pressed="${!selected}"><span class="game-chip-all-icon">${icon('home')}</span><span><strong>All games</strong><small>${games.length} matchups</small></span></button>`:''}${games.map(g=>`<button class="game-chip" ${attribute}="${esc(g.id)}" aria-pressed="${String(selected)===String(g.id)}"><span class="game-chip-status">${esc(g.status||'Scheduled')}</span><span class="game-chip-team">${sport?teamMark({sport,team:g.away,teamId:g.awayId}):''}<b>${esc(g.away)}</b>${g.awayScore==null?'':`<strong>${esc(g.awayScore)}</strong>`}</span><span class="game-chip-team">${sport?teamMark({sport,team:g.home,teamId:g.homeId}):''}<b>${esc(g.home)}</b>${g.homeScore==null?'':`<strong>${esc(g.homeScore)}</strong>`}</span></button>`).join('')}</div>`;
}

export function boardGames(board,sport) {
  if(sport==='nfl')return (board.lines||[]).map(g=>({id:g.gameId,away:g.away,home:g.home,status:g.date,awayScore:g.awayScore,homeScore:g.homeScore}));
  const games=board.games||board.matchups?.map(m=>m.game)||(board.game?[board.game]:[]);
  return games.map(g=>({id:g.gameId||g.id,away:g.away?.code,home:g.home?.code,awayId:g.away?.id,homeId:g.home?.id,awayScore:g.away?.score,homeScore:g.home?.score,status:(g.status||g.state)+(g.doubleHeader?' · Game '+g.gameNumber:'')}));
}
