import {escape as esc, safeUrl, finite, number as num, selectGames, summarize} from './research-data.js';
import {icon} from './ui-icons.js';

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
  const sync=()=>{empty.hidden=!odds.hidden;};new MutationObserver(sync).observe(odds,{attributes:true,attributeFilter:['hidden']});sync();
  const playerPanel=document.createElement('section');playerPanel.id='live-players-panel';playerPanel.setAttribute('role','tabpanel');playerPanel.setAttribute('aria-labelledby','live-players-tab');game.after(playerPanel);
  for(const selector of ['#markets','.live-filter-row','.live-line-note','#players']){const node=document.querySelector(selector);if(node)playerPanel.append(node);}
  function select(panel){for(const b of tabs.querySelectorAll('button')){const active=b.dataset.livePanel===panel;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}game.hidden=panel!=='game';playerPanel.hidden=panel!=='players';const url=new URL(location.href);url.searchParams.set('panel',panel);history.replaceState(null,'',url);}
  tabs.addEventListener('click',e=>{const button=e.target.closest('[data-live-panel]');if(button)select(button.dataset.livePanel);});
  tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'game':e.key==='End'?'players':game.hidden?'game':'players';select(next);tabs.querySelector('[aria-selected=true]').focus();});
  select(new URLSearchParams(location.search).get('panel')==='players'?'players':'game');
}

export function propRow(profile, {open='data-player', id=profile.key, save='data-save', saveId=profile.playerId, saved=false, side='over', compare=false, comparing=false, kind='sports-card'} = {}) {
  const p=profile, f=p.forecast||{}, quote=p.prop, stats=summarize(selectGames(p,{window:'10'}),quote?.line??null,side), probability=finite(f.probability?.[side]);
  const source=quote ? quote.basis==='published_archive'?(quote.stale?'Retrospective · saved':'Retrospective'):quote.stale?'Saved quote':quote.basis==='in_play'?'In play':quote.basis==='captured_pregame'?'Pregame':'Posted' : 'Not available';
  const outcome=p.result, final=outcome&&finite(outcome.actual)!==null&& ['final','over','under','push','no_line'].includes(outcome.status);
  const resultLabel={did_not_play:'Did not play',did_not_bat:'No plate appearance',did_not_start:'Did not start',needs_regulation_stats:'Regulation stats needed',no_stats:'Result unavailable',missing:'Result unavailable',unsettled:'Postponed / unsettled',no_line:'Final · line unverified'}[outcome?.status]||(final?'Final'+(['over','under','push'].includes(outcome.status)?' · '+outcome.status:''):p.raw?.gameState||'Not settled');
  const probabilityText=probability===null?'—':`${Math.round(probability*100)}%`;
  const tdChance=p.market==='any_td'&&p.sport==='nfl';
  const calibrated=tdChance&&p.raw?.tdProbMethod==='historical-score-calibration'&&finite(p.raw.tdProb)!==null&&!p.availability?.unavailable;
  const label=calibrated?'Score TD chance':tdChance?'TD estimate':'Projection';
  const modelValue=calibrated?`${Math.round(p.raw.tdProb*100)}%`:tdChance&&finite(f.point)!==null?`${Math.round(f.point*100)}%`:num(f.point,p.sport==='mlb'?2:1);
  const probabilityLabel=calibrated?'Workload 1+ TD chance':`Model ${side}`;
  const status=p.availability?.concern||p.availability?.unavailable?p.availability.status:p.lineup==='confirmed'?`Batting ${p.battingOrder}`:p.lineup==='probable'?'Probable starter':'';
  return `<article class="research-row ${kind}" data-research-row="${esc(p.key)}"><header class="research-identity"><button class="research-player player-detail-link" ${open}="${esc(id)}" aria-haspopup="dialog">${p.image?`<img src="${safeUrl(p.image)}" alt="" loading="lazy" width="38" height="38">`:`<span class="research-initial" aria-hidden="true">${esc(p.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</span>`}<span><strong>${esc(p.name)}</strong><small><span class="position">${esc(p.position||p.sport.toUpperCase())}</span> · ${esc(p.team)} vs ${esc(p.opponent||'TBD')}${p.raw?.gameNumber>1?' · Game '+p.raw.gameNumber:''}</small>${status?`<small class="player-status">${esc(status)}</small>`:''}</span></button></header>
  <div class="research-line"><span class="row-field-label">Line / book</span><strong>${quote?`${p.market==='any_td'?'1+ TD':num(quote.line)}`:'—'}</strong><small>${quote?esc(quote.bookmaker):'No posted line'}</small><span class="quote-kind">${source}</span></div>
  <div class="research-estimate"><span class="row-field-label">${label}</span><strong>${modelValue}</strong><small>${calibrated?'2024–2025 outcome fit · if playing':finite(f.point)===null?'Withheld':`${f.sampleCount??p.rows.length} prior games`}</small>${finite(p.raw?.modelScore)!==null?`<small class="row-rating">Rating ${num(p.raw.modelScore)} / 100</small>`:''}</div>
  <div class="research-probability"><span class="row-field-label">${probabilityLabel}</span><strong>${probabilityText}</strong><small>${probability===null?'Not priced':'Experimental'}</small></div>
  <div class="research-history"><span class="row-field-label">Last ${stats.n||10} games</span>${miniHistory(p,side)}<small>${stats.rate===null?`${stats.n} recorded games`:`${stats.hits}/${stats.n} ${side==='over'?'above':'below'} line${stats.pushes?' · '+stats.pushes+' tied':''}`}</small></div>
  <div class="research-result"><span class="row-field-label">Result</span><strong>${final?num(outcome.actual):'—'}</strong><small>${esc(resultLabel)}</small></div>
  <div class="research-actions${compare?' mlb-card-actions':''}"><button class="save-player" ${save}="${esc(saveId)}" aria-label="${saved?'Unsave':'Save'} ${esc(p.name)}" title="${saved?'Remove saved player':'Save player'}" aria-pressed="${saved}">${icon(saved?'check':'bookmark')}</button>${compare?`<button data-compare="${esc(id)}" aria-pressed="${comparing}" aria-label="${comparing?'Remove':'Compare'} ${esc(p.name)}" title="Compare player">${icon(comparing?'check':'plus')}</button><button ${open}="${esc(id)}" class="row-open" aria-label="Details for ${esc(p.name)}" title="Player details">${icon('chevron')}</button>`:''}</div></article>`;
}

export function propBoard(rows, options={}) {
  const tdChance=rows[0]?.sport==='nfl'&&rows[0]?.market==='any_td';
  const calibrated=tdChance&&rows.some(p=>p.raw?.tdProbMethod==='historical-score-calibration');
  const estimate=calibrated?'Score TD chance':tdChance?'TD estimate':'Projection';
  const comparison=calibrated?'Workload 1+ TD chance':`Model ${options.side||'over'}`;
  return `<div class="research-board"><div class="research-columns" aria-hidden="true"><span>Player / matchup</span><span>Line / sportsbook</span><span>${estimate}</span><span>${comparison}</span><span>Recent results</span><span>Final result</span><span></span></div>${rows.map(p=>propRow(p,typeof options.row==='function'?{...options,...options.row(p)}:options)).join('')}</div>`;
}

export function gameStrip(games, {selected='',attribute='data-board-game',all=true}={}) {
  if(!games.length)return '';
  return `<div class="game-strip" aria-label="Matchups">${all?`<button class="game-chip game-chip-all" ${attribute}="" aria-pressed="${!selected}">${icon('home')}<strong>All games</strong><small>${games.length} matchups</small></button>`:''}${games.map(g=>`<button class="game-chip" ${attribute}="${esc(g.id)}" aria-pressed="${String(selected)===String(g.id)}"><span class="game-chip-status">${esc(g.status||'Scheduled')}</span><span><b>${esc(g.away)}</b><strong>${g.awayScore??'—'}</strong></span><span><b>${esc(g.home)}</b><strong>${g.homeScore??'—'}</strong></span></button>`).join('')}</div>`;
}

export function boardGames(board,sport) {
  if(sport==='nfl')return (board.lines||[]).map(g=>({id:g.gameId,away:g.away,home:g.home,status:g.date,awayScore:g.awayScore,homeScore:g.homeScore}));
  const games=board.games||board.matchups?.map(m=>m.game)||(board.game?[board.game]:[]);
  return games.map(g=>({id:g.gameId||g.id,away:g.away?.code,home:g.home?.code,awayScore:g.away?.score,homeScore:g.home?.score,status:(g.status||g.state)+(g.doubleHeader?' · Game '+g.gameNumber:'')}));
}
