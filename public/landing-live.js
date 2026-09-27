import { icon } from './ui-icons.js';
import { decimal, oddsLabel } from './ev-core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
const day = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Unavailable';
const when = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)) : 'Unavailable';
const safe = value => { try { const url = new URL(value); return url.protocol === 'https:' ? esc(url.href) : '#'; } catch { return '#'; } };
const readJson = async path => {
  const response = await fetch(path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Source returned ' + response.status);
  return response.json();
};
const panelHeader = label => `<div class="product-panel-head"><span class="product-panel-brand"><span class="product-brand-mark"><img src="/favicon.svg" width="24" height="24" alt=""></span><strong>SportsLab</strong></span><span class="product-panel-label">${esc(label)}</span></div>`;
const leagues = [['nfl','NFL'],['nba','NBA'],['wnba','WNBA'],['mlb','MLB']];

export function mountLandingResearch() {
  mountPlayerPreview(document.querySelector('#home-tool-panel'));
  mountMarketPreview(document.querySelector('#home-market-panel'));
  mountLivePreview(document.querySelector('#home-live-panel'));
}

function mountPlayerPreview(root) {
  if (!root) return;
  let payload, failed = false;
  const state = { playerId: '', window: 10, gameId: '' };
  const player = () => payload?.players.find(item => item.id === state.playerId) || payload?.players[0];
  function render(focusSelector) {
    if (!payload?.players?.length) {
      root.innerHTML = panelHeader('Player research') + `<div class="product-panel-empty"><strong>${failed ? 'Player history is unavailable' : 'Loading player history'}</strong><p>${failed ? 'Choose a sport and date in the research workspace.' : 'Gathering completed games and captured lines.'}</p>${failed ? '<a href="/research">Open player research</a>' : ''}</div>`;
      return;
    }
    const p = player(), games = p.games.slice(0, state.window).reverse();
    const values = games.map(game => game.value), sorted = [...values].sort((a,b) => a-b);
    const hits = values.filter(value => value > p.line).length;
    const average = values.reduce((sum,value) => sum+value,0)/(values.length||1);
    const median = values.length ? (sorted[Math.floor((values.length-1)/2)]+sorted[Math.floor(values.length/2)])/2 : null;
    const high = Math.max(p.line*1.25,...values.map(value => value*1.2),1);
    const selected = games.find(game => game.id === state.gameId);
    root.innerHTML = panelHeader('Player research') + `
      <div class="player-preview-heading"><div><span class="preview-matchup">${esc(p.team)} <span>vs</span> ${esc(p.opponent)} <span>· ${esc(p.position)}</span></span><h3>${esc(p.name)}</h3><p>Receiving yards</p></div><label><span class="sr-only">Preview player</span><select data-preview-player aria-label="Preview player">${payload.players.map(item => `<option value="${esc(item.id)}"${item.id===p.id?' selected':''}>${esc(item.name)}</option>`).join('')}</select></label></div>
      <div class="player-preview-summary"><div><span>Above ${number(p.line)} yards</span><strong>${hits}<small> / ${games.length}</small></strong></div><div class="preview-window" role="group" aria-label="Completed game window">${[5,10,20].map(n => `<button type="button" data-preview-window="${n}" aria-pressed="${state.window===n}">L${n}</button>`).join('')}</div></div>
      <div class="preview-chart-scroll" tabindex="0" role="region" aria-label="Receiving yards chart; scroll for additional games"><div class="preview-chart" style="--game-count:${games.length};--comparison-line:${p.line/high*100}%" role="group" aria-label="${esc(p.name)} receiving yards, oldest to newest"><div class="preview-threshold"><span>${number(p.line)} yd</span></div>${games.map(game => `<button type="button" class="preview-game ${game.value>p.line?'is-above':game.value===p.line?'is-tied':'is-below'}" data-preview-game="${esc(game.id)}" aria-pressed="${state.gameId===game.id}" aria-label="${esc(day(game.date))}, ${esc(game.opponent)}, ${number(game.value)} receiving yards" style="--result-height:${Math.max(1.5,game.value/high*100)}%"><span class="preview-game-bar"><b>${number(game.value)}</b></span><small>${esc(game.opponent)}</small></button>`).join('')}</div></div>
      <div class="preview-chart-detail" role="status">${selected ? `<span>${day(selected.date)} · ${selected.home?'vs':'at'} ${esc(selected.opponent)} · <strong>${number(selected.value)} yd</strong></span><a href="${safe(selected.url)}" target="_blank" rel="noreferrer">Box score ${icon('arrow')}</a>` : '<span>Select a game to see its result</span><span>Oldest to newest</span>'}</div>
      <div class="preview-stat-footer"><div><span>Average</span><strong>${number(average)} <small>yd</small></strong></div><div><span>Median</span><strong>${median===null?'—':number(median)} <small>yd</small></strong></div><div><span>Comparison line</span><strong>${number(p.line)} <small>yd</small></strong></div></div>
      <details class="preview-source"><summary>Captured history · ${esc(day(p.quote.capturedAt))}</summary><p>${esc(p.quote.book||'Public comparison')} line captured ${when(p.quote.capturedAt)}. ${payload.stale||p.quote.stale?'Refresh delayed. ':''}These are completed results, not future probabilities.</p><a href="/research?sport=nfl&prop=rec_yds&researchPlayer=${encodeURIComponent(p.id)}">Open this player in research</a></details>`;
    if(focusSelector)root.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  root.addEventListener('change', event => {
    if(event.target.matches('[data-preview-player]')){state.playerId=event.target.value;state.gameId='';render('[data-preview-player]');}
  });
  root.addEventListener('click', event => {
    const button=event.target.closest('[data-preview-window],[data-preview-game]');if(!button)return;
    if(button.dataset.previewWindow){state.window=Number(button.dataset.previewWindow);state.gameId='';render(`[data-preview-window="${state.window}"]`);}
    else {state.gameId=button.dataset.previewGame;render(`[data-preview-game="${CSS.escape(state.gameId)}"]`);}
  });
  async function load() {
    const latest=readJson('/api/landing/research').catch(()=>null);
    try{payload=await readJson('/landing-research-snapshot.json');}catch{payload=await latest;}
    failed=!payload?.players?.length;
    if(!failed)state.playerId=payload.players[0].id;
    render();
    const next=await latest;
    if(!next?.players?.length || (!failed && Date.parse(next.boardFetchedAt||'')<=Date.parse(payload.boardFetchedAt||'')))return;
    const focused=root.contains(document.activeElement)?document.activeElement:null;
    payload=next;failed=false;
    if(!payload.players.some(item=>item.id===state.playerId))state.playerId=payload.players[0].id;
    if(!focused)render();
    else {
      const refreshWhenUnfocused = () => queueMicrotask(() => {
        if(root.contains(document.activeElement))return;
        root.removeEventListener('focusout',refreshWhenUnfocused);
        render();
      });
      root.addEventListener('focusout',refreshWhenUnfocused);
    }
  }
  render();load();
}

function mountMarketPreview(root) {
  if(!root)return;
  // Fixed, hypothetical examples keep the homepage independent of saved workspace data.
  const markets = [
    { key: 'total', label: 'Game total', line: 44.5, prices: [['DraftKings',115,-135],['FanDuel',-110,-110],['BetMGM',-112,-108]] },
    { key: 'prop', label: 'Passing yards', line: 249.5, prices: [['DraftKings',118,-140],['FanDuel',-105,-115],['BetMGM',110,-120]] },
  ];
  const brandAssets = { DraftKings: 'draftkings', FanDuel: 'fanduel', BetMGM: 'betmgm' };
  let selected='total';
  function render(focus=false){
    const market=markets.find(item=>item.key===selected);
    const rows=market.prices.flatMap(([book,over,under])=>[
      {id:book+'-over',book,side:'Over',odds:over},
      {id:book+'-under',book,side:'Under',odds:under},
    ]);
    const books=[...new Set(rows.map(q=>q.book))];
    const best=Object.fromEntries(['Over','Under'].map(side=>[side,rows.filter(q=>q.side===side).sort((a,b)=>decimal(b.odds)-decimal(a.odds))[0]]));
    root.innerHTML=panelHeader('Odds comparison')+`<div class="market-preview-heading"><span class="preview-example">Example prices</span><h3>Arizona <span>vs</span> Seattle</h3><p>NFL · ${market.key==='prop'?'Example QB passing yards':'Full game total'}</p></div><div class="market-preview-tabs" role="group" aria-label="Example market">${markets.map(item=>`<button type="button" data-preview-market="${item.key}" aria-pressed="${item.key===selected}">${item.label}</button>`).join('')}</div><div class="market-price-grid" role="table" aria-label="Example American odds for ${market.label}"><div class="market-price-head" role="row"><span role="columnheader">Source</span><span role="columnheader">Over ${market.line}</span><span role="columnheader">Under ${market.line}</span></div>${books.map(book=>`<div class="market-price-row" role="row"><span class="market-book" role="rowheader"><img src="/assets/brands/${brandAssets[book]}.png" width="26" height="26" alt="">${esc(book)}</span>${['Over','Under'].map(side=>{const q=rows.find(q=>q.book===book&&q.side===side);return `<span role="cell" class="${q?.id===best[side]?.id?'is-best':''}"><strong>${q?oddsLabel(q.odds):'—'}</strong>${q?.id===best[side]?.id?'<small>Best price</small>':''}</span>`;}).join('')}</div>`).join('')}</div><div class="market-price-summary">${['Over','Under'].map(side=>`<div><span>Best ${side.toLowerCase()}</span><strong>${oddsLabel(best[side].odds)}</strong><small>${esc(best[side].book)}</small></div>`).join('')}</div><p class="preview-footnote">Illustrative prices for comparison only. This preview does not show live sportsbook odds.</p>`;
    if(focus)root.querySelector(`[data-preview-market="${selected}"]`)?.focus({preventScroll:true});
  }
  root.addEventListener('click',event=>{const button=event.target.closest('[data-preview-market]');if(button){selected=button.dataset.previewMarket;render(true);}});
  render();
}

function mountLivePreview(root){
  if(!root)return;
  const state={sport:'nfl',game:'',market:'moneyline'};
  let data=null,failed=false,request=0;
  function render(focusSelector){
    const game=data?.game||data?.events?.find(item=>item.id===state.game);
    const events=data?.events||[],markets=data?.odds?.books?.[0]?.markets||[];
    if(!markets.some(item=>item.key===state.market))state.market=markets[0]?.key||'moneyline';
    const market=markets.find(item=>item.key===state.market);
    const delayed=failed||data?.stale;
    const status=delayed?(game?'Feed delayed':'Feed unavailable'):game?.state==='in'?'In progress':game?.state==='post'?'Final':game?'Upcoming':'Between games';
    root.innerHTML=panelHeader('Live game center')+`<div class="live-preview-toolbar"><label><span class="sr-only">Choose live sport</span><select data-live-sport aria-label="Choose live sport">${leagues.map(([key,label])=>`<option value="${key}"${key===state.sport?' selected':''}>${label}</option>`).join('')}</select></label><span class="live-preview-status ${delayed?'is-delayed':''}"><i aria-hidden="true"></i>${status}</span><button type="button" data-live-refresh aria-label="Refresh feed" title="Refresh feed">${icon('refresh')}</button></div>${events.length?`<label class="live-preview-game"><span class="sr-only">Choose game</span><select data-live-game aria-label="Choose game">${events.map(item=>`<option value="${esc(item.id)}"${item.id===game?.id?' selected':''}>${esc(item.teams.find(t=>t.homeAway==='away')?.abbreviation)} at ${esc(item.teams.find(t=>t.homeAway==='home')?.abbreviation)} · ${esc(item.status)}</option>`).join('')}</select></label>`:''}
      ${game?`<div class="live-preview-score"><span>${esc(game.status||status)}</span><div>${['away','home'].map(side=>{const team=game.teams.find(t=>t.homeAway===side);return `<div><span class="live-team-mark">${esc(team?.abbreviation||side)}</span><strong>${game.state==='pre'?'—':Number.isFinite(team?.score)?team.score:'—'}</strong><span>${esc(team?.name||side)}</span></div>`;}).join('<span class="live-score-divider">:</span>')}</div></div><div class="live-preview-markets"><div class="market-preview-tabs" role="group" aria-label="Game market">${markets.map(item=>`<button type="button" data-live-market="${esc(item.key)}" aria-pressed="${state.market===item.key}">${esc(item.label)}</button>`).join('')}</div>${market?.selections?.length?`<div class="live-price-pair">${market.selections.map(item=>`<div><span>${esc(item.label||item.side)}${item.line===null||item.line===undefined?'':' '+esc(item.line)}</span><strong>${Number.isFinite(Number(item.odds))?oddsLabel(item.odds):'—'}</strong></div>`).join('')}</div>`:'<p>Market prices are not available for this game.</p>'}</div>`:`<div class="live-preview-empty"><h3>${delayed?'The feed is unavailable.':'Between games.'}</h3><p>${delayed?'Refresh the public feed or explore another league.':'No games are available for this date. Choose a league to explore its game center.'}</p></div><div class="live-league-directory">${leagues.map(([key,label])=>`<a href="/${key}/live"><img src="/assets/leagues/${key}.png" alt="" width="38" height="38"><span><strong>${label}</strong><small>Game center</small></span>${icon('arrow')}</a>`).join('')}</div>`}
      <div class="live-preview-footer"><span>${data?.fetchedAt?'Updated '+when(data.fetchedAt):'Update time unavailable'}</span>${game?`<a href="/${state.sport}/live">Open full game ${icon('arrow')}</a>`:'<span>Public feeds may lag</span>'}</div>`;
    if(focusSelector)root.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  async function load(focusSelector){
    const current=++request;failed=false;
    root.setAttribute('aria-busy','true');
    const refresh=root.querySelector('[data-live-refresh]');if(refresh)refresh.disabled=true;
    try{const params=new URLSearchParams();if(state.game)params.set('game',state.game);const next=await readJson('/api/'+state.sport+'/live'+(params.size?'?'+params:''));if(current!==request)return;data=next;state.game=next.selected||next.game?.id||'';}
    catch{if(current!==request)return;data=null;failed=true;}
    if(current!==request)return;
    root.setAttribute('aria-busy','false');render(focusSelector);
  }
  root.addEventListener('change',event=>{if(event.target.matches('[data-live-sport]')){state.sport=event.target.value;state.game='';load('[data-live-sport]');}if(event.target.matches('[data-live-game]')){state.game=event.target.value;load('[data-live-game]');}});
  root.addEventListener('click',event=>{const button=event.target.closest('[data-live-refresh],[data-live-market]');if(!button)return;if(button.hasAttribute('data-live-refresh'))load('[data-live-refresh]');else{state.market=button.dataset.liveMarket;render(`[data-live-market="${CSS.escape(state.market)}"]`);}});
  load();
}
