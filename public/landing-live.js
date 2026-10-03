import { icon } from './ui-icons.js';
import { oddsLabel } from './ev-core.js?v=6';
import { teamLogo } from './sports-identity.js';

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

export function mountLandingResearch() {
  mountPlayerPreview(document.querySelector('#home-tool-panel'));
  mountMarketPreview(document.querySelector('#home-market-panel'));
  mountLivePreview(document.querySelector('#home-live-panel'));
}

function mountPlayerPreview(root) {
  if (!root) return;
  let payload, failed = false;
  const state = { window: 10, gameId: '' };
  // The homepage always features one player (Jaxon Smith-Njigba); others in the payload are ignored.
  const featured = players => players?.find(item => /smith-njigba/i.test(item.name)) || players?.[0];
  const player = () => featured(payload?.players);
  function render(focusSelector) {
    if (!payload?.players?.length) {
      root.innerHTML = `<div class="product-panel-empty"><strong>${failed ? 'Player history is unavailable' : 'Loading player history'}</strong><p>${failed ? 'Choose a sport and date in the research workspace.' : 'Gathering completed games and captured lines.'}</p>${failed ? '<a href="/research">Open player research</a>' : ''}</div>`;
      return;
    }
    const p = player(), games = p.games.slice(0, state.window).reverse();
    const values = games.map(game => game.value), sorted = [...values].sort((a,b) => a-b);
    const hits = values.filter(value => value > p.line).length;
    const average = values.reduce((sum,value) => sum+value,0)/(values.length||1);
    const median = values.length ? (sorted[Math.floor((values.length-1)/2)]+sorted[Math.floor(values.length/2)])/2 : null;
    const high = Math.max(p.line*1.25,...values.map(value => value*1.2),1);
    const selected = games.find(game => game.id === state.gameId);
    const rate = games.length ? Math.round(hits/games.length*100) : 0;
    root.innerHTML = `<div class="oj-card oj-research">
      <header class="oj-band">
        <div class="oj-band-top"><span class="oj-league"><img src="/assets/leagues/nfl.png" width="14" height="14" alt="">NFL · ${esc(p.position)} · ${esc(p.team)} vs ${esc(p.opponent)}</span><span class="oj-lock">${hits} of ${games.length} over</span></div>
        <div class="oj-band-main"><div><h3>${esc(p.name)}</h3><p>Receiving yards · line ${number(p.line)}</p></div></div>
      </header>
      <div class="oj-body">
        <div class="oj-body-head"><p class="oj-banner">Last ${games.length} games vs the ${number(p.line)} line</p><div class="preview-window" role="group" aria-label="Completed game window">${[5,10,20].map(n => `<button type="button" data-preview-window="${n}" aria-pressed="${state.window===n}">L${n}</button>`).join('')}</div></div>
        <div class="preview-chart-scroll" tabindex="0" role="region" aria-label="Receiving yards chart; scroll for additional games"><div class="preview-chart" style="--game-count:${games.length};--comparison-line:${p.line/high*100}%" role="group" aria-label="${esc(p.name)} receiving yards, oldest to newest"><div class="preview-threshold"><span>${number(p.line)} yd</span></div>${games.map(game => `<button type="button" class="preview-game ${game.value>p.line?'is-above':game.value===p.line?'is-tied':'is-below'}" data-preview-game="${esc(game.id)}" aria-pressed="${state.gameId===game.id}" aria-label="${esc(day(game.date))}, ${esc(game.opponent)}, ${number(game.value)} receiving yards" style="--result-height:${Math.max(1.5,game.value/high*100)}%"><span class="preview-game-bar"><b>${number(game.value)}</b></span><small>${esc(game.opponent)}</small></button>`).join('')}</div></div>
        <div class="preview-chart-detail" role="status">${selected ? `<span>${day(selected.date)} · ${selected.home?'vs':'at'} ${esc(selected.opponent)} · <strong>${number(selected.value)} yd</strong></span><a href="${safe(selected.url)}" target="_blank" rel="noreferrer">Box score ${icon('arrow')}</a>` : '<span>Tap a bar for the game</span><span>Oldest to newest</span>'}</div>
      </div>
      <footer class="oj-foot"><div><small>Hit rate</small><strong class="is-lime">${rate}%</strong></div><div><small>Average</small><strong>${number(average)} yd</strong></div><div><small>Median</small><strong>${median===null?'—':number(median)} yd</strong></div></footer>
    </div>`;
    if(focusSelector)root.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  root.addEventListener('click', event => {
    const button=event.target.closest('[data-preview-window],[data-preview-game]');if(!button)return;
    if(button.dataset.previewWindow){state.window=Number(button.dataset.previewWindow);state.gameId='';render(`[data-preview-window="${state.window}"]`);}
    else {state.gameId=button.dataset.previewGame;render(`[data-preview-game="${CSS.escape(state.gameId)}"]`);}
  });
  async function load() {
    const latest=readJson('/api/landing/research').catch(()=>null);
    try{payload=await readJson('/landing-research-snapshot.json');}catch{payload=await latest;}
    failed=!payload?.players?.length;
    render();
    const next=await latest;
    if(!next?.players?.length || (!failed && Date.parse(next.boardFetchedAt||'')<=Date.parse(payload.boardFetchedAt||'')))return;
    const focused=root.contains(document.activeElement)?document.activeElement:null;
    payload=next;failed=false;
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
    { key: 'total', label: 'Game total', title: 'Total points', line: 44.5, sides: ['Over','Under'], prices: [['DraftKings',115,-135],['FanDuel',-110,-110],['BetMGM',-112,-108]] },
    { key: 'prop', label: 'Passing yards', title: 'K. Murray passing yards', line: 249.5, sides: ['Over','Under'], prices: [['DraftKings',118,-140],['FanDuel',-105,-115],['BetMGM',110,-120]] },
  ];
  const brandAssets = { DraftKings: 'draftkings', FanDuel: 'fanduel', BetMGM: 'betmgm' };
  const stake = 100, profit = odds => odds > 0 ? stake * odds / 100 : stake * 100 / -odds;
  const money = value => '$' + value.toFixed(2).replace(/\.00$/, '');
  let selected='total';
  function render(focus=false){
    const market=markets.find(item=>item.key===selected);
    const sides=market.sides.map((side,index)=>{
      const quotes=market.prices.map(([book,...odds])=>({book,odds:odds[index],win:profit(odds[index])}));
      const best=quotes.reduce((a,b)=>b.win>a.win?b:a),worst=quotes.reduce((a,b)=>b.win<a.win?b:a);
      return {side,quotes,best,worst};
    });
    const top=Math.max(...sides.flatMap(item=>item.quotes.map(q=>q.win)));
    const extra=Math.max(...sides.map(item=>item.best.win-item.worst.win));
    const column=(q,best,index)=>`<div class="mp-col${q===best?' is-best':''}" style="--h:${Math.max(18,q.win/top*100).toFixed(1)}%;--d:${index*120}ms"><b>+${money(q.win)}</b><span class="mp-bar"><img src="/assets/brands/${brandAssets[q.book]}.png" width="28" height="28" alt="${esc(q.book)}"></span><small>${oddsLabel(q.odds)}</small></div>`;
    root.innerHTML=`<div class="oj-card mp-card">
      <header class="oj-band mp-band"><div class="mp-top"><span class="mp-league"><img src="/assets/leagues/nfl.png" width="16" height="16" alt="">NFL</span><span class="mp-extra">Up to ${money(extra)} more</span></div>
      <h3 class="mp-title">Arizona at Seattle</h3><p class="mp-sub">${esc(market.title)} ${market.line} · Sun 4:25 PM</p>
      <div class="market-preview-tabs mp-tabs" role="group" aria-label="Example market">${markets.map(item=>`<button type="button" data-preview-market="${item.key}" aria-pressed="${item.key===selected}">${item.label}</button>`).join('')}</div></header>
      <div class="mp-stage" role="img" aria-label="${esc(sides.map(item=>`$${stake} on the ${item.side.toLowerCase()} wins ${money(item.best.win)} at ${item.best.book} and ${money(item.worst.win)} at ${item.worst.book}`).join('; '))}">
        <p class="mp-banner">$${stake} on each side, same bet at three books</p>
        <div class="mp-sides">${sides.map((item,sideIndex)=>`<div class="mp-side"><h4><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>${item.side} ${market.line} wins</h4><div class="mp-cols">${item.quotes.map((q,index)=>column(q,item.best,sideIndex*3+index)).join('')}</div></div>`).join('')}</div>
      </div>
      <footer class="mp-foot">${sides.map(item=>`<div><small>Best ${item.side.toLowerCase()} · ${esc(item.best.book)}</small><strong>+${money(item.best.win)}</strong><span>${money(item.best.win-item.worst.win)} more than ${esc(item.worst.book)}</span></div>`).join('')}</footer>
      <p class="preview-footnote">Illustrative prices. Profit shown for a $${stake} bet; not live sportsbook odds.</p>
    </div>`;
    if(focus)root.querySelector(`[data-preview-market="${selected}"]`)?.focus({preventScroll:true});
  }
  root.addEventListener('click',event=>{const button=event.target.closest('[data-preview-market]');if(button){selected=button.dataset.previewMarket;render(true);}});
  render();
}

// Shown when the live feed cannot be read (e.g. signed-out visitors): a fixed, clearly labelled example.
const SAMPLE_LIVE = {
  sample: true,
  game: { id: 'sample', state: 'post', status: 'Final', teams: [
    { homeAway: 'away', abbreviation: 'PHI', name: 'Philadelphia Eagles', score: 24, id: '21' },
    { homeAway: 'home', abbreviation: 'DAL', name: 'Dallas Cowboys', score: 20, id: '6' },
  ] },
  events: [],
  odds: { books: [{ markets: [
    { key: 'moneyline', label: 'Moneyline', selections: [{ label: 'PHI', odds: -135 }, { label: 'DAL', odds: 115 }] },
    { key: 'spread', label: 'Spread', selections: [{ label: 'PHI', line: -2.5, odds: -110 }, { label: 'DAL', line: 2.5, odds: -110 }] },
    { key: 'total', label: 'Total', selections: [{ label: 'Over', line: 46.5, odds: -108 }, { label: 'Under', line: 46.5, odds: -112 }] },
  ] }] },
};

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
    const status=data?.sample?'Sample game':delayed?(game?'Feed delayed':'Feed unavailable'):game?.state==='in'?'In progress':game?.state==='post'?'Final':game?'Upcoming':'Between games';
    const team=side=>game?.teams.find(t=>t.homeAway===side);
    const logo=item=>teamLogo({team:item?.abbreviation,teamId:item?.id,teamLogo:item?.logo,sport:state.sport});
    const mark=(item,size)=>{const src=logo(item);return src?`<img class="oj-team-logo" src="${esc(src)}" width="${size}" height="${size}" alt="" loading="lazy">`:`<span class="oj-team-logo is-text">${esc(item?.abbreviation||'—')}</span>`;};
    const scores=['away','home'].map(team).map(item=>Number(item?.score));
    const leader=game&&game.state!=='pre'&&scores.every(Number.isFinite)&&scores[0]!==scores[1]?(scores[0]>scores[1]?'away':'home'):'';
    const tone=delayed?'is-delayed':game?.state==='in'?'is-live':game?.state==='post'?'is-final':'';
    const pick=item=>{const label=String(item.label||item.side||'');const match=['away','home'].map(team).find(t=>t&&(label.includes(t.abbreviation)||label.includes(t.name)));return match;};
    root.innerHTML=`<div class="oj-card oj-live">
      <header class="oj-band">
        <div class="oj-band-top"><span class="oj-league"><img src="/assets/leagues/nfl.png" width="14" height="14" alt="">NFL</span><span class="oj-status ${tone}"><i aria-hidden="true"></i>${esc(status)}</span><button type="button" class="oj-icon-button" data-live-refresh aria-label="Refresh feed" title="Refresh feed">${icon('refresh')}</button></div>
        ${game?`<div class="oj-band-main"><div><h3>${esc(team('away')?.abbreviation||'Away')} at ${esc(team('home')?.abbreviation||'Home')}</h3><p>${data?.sample?'Example matchup · <a href="/login">Sign in</a> to follow the newest NFL game':esc(game.status||status)}</p></div></div>`:`<div class="oj-band-main"><div><h3>${delayed?'The feed is unavailable.':'Between games.'}</h3><p>${delayed?'Refresh the public feed or pick another league.':'No games on this date. Pick a league to open its game center.'}</p></div></div>`}
      </header>
      ${game?`<div class="oj-body">
        <div class="oj-scoreboard">${['away','home'].map(side=>{const item=team(side);return `<div class="oj-score-row${leader===side?' is-leader':''}">${mark(item,34)}<span class="oj-score-team"><strong>${esc(item?.name||side)}</strong><small>${side==='away'?'Away':'Home'} · ${esc(item?.abbreviation||'')}</small></span><b>${game.state==='pre'?'—':Number.isFinite(item?.score)?item.score:'—'}</b></div>`;}).join('')}</div>
        <div class="oj-body-head"><p class="oj-banner">${game.state==='post'?'Closing prices':'Current prices'}</p><div class="market-preview-tabs" role="group" aria-label="Game market">${markets.map(item=>`<button type="button" data-live-market="${esc(item.key)}" aria-pressed="${state.market===item.key}">${esc(item.label)}</button>`).join('')}</div></div>
        ${market?.selections?.length?`<div class="oj-split">${market.selections.map(item=>{const owner=pick(item);return `<div><span class="oj-side-label">${esc(item.label||item.side)}${item.line===null||item.line===undefined?'':' '+esc(item.line)}</span><span class="oj-price">${owner?mark(owner,20):''}<b>${Number.isFinite(Number(item.odds))?oddsLabel(item.odds):'—'}</b></span></div>`;}).join('')}</div>`:'<p class="oj-empty">Market prices are not available for this game.</p>'}
      </div>`:`<div class="oj-body"><p class="oj-empty">The card fills in with the newest NFL game as soon as the public feed responds.</p></div>`}
    </div>`;
    if(focusSelector)root.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  // Newest game: one in progress, else the most recent to start, else the next to start.
  const newest=events=>{
    const time=item=>Date.parse(item.date)||0;
    const live=events.filter(item=>item.state==='in').sort((a,b)=>time(b)-time(a))[0];
    const started=events.filter(item=>item.state==='post').sort((a,b)=>time(b)-time(a))[0];
    const upcoming=events.filter(item=>item.state==='pre').sort((a,b)=>time(a)-time(b))[0];
    return (live||started||upcoming||events[0])?.id||'';
  };
  async function load(focusSelector){
    const current=++request;failed=false;
    root.setAttribute('aria-busy','true');
    const refresh=root.querySelector('[data-live-refresh]');if(refresh)refresh.disabled=true;
    const url='/api/'+state.sport+'/live';
    try{
      let next=await readJson(url);
      const target=newest(next.events||[]);
      if(target&&target!==(next.selected||next.game?.id))next=await readJson(url+'?'+new URLSearchParams({game:target}));
      if(current!==request)return;data=next;state.game=next.selected||next.game?.id||'';
    }
    catch{if(current!==request)return;data=SAMPLE_LIVE;failed=false;}
    if(current!==request)return;
    root.setAttribute('aria-busy','false');render(focusSelector);
    schedule();
  }
  // Keep following the newest game while the card is on screen and the tab is visible.
  let timer=0,onScreen=true;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(onScreen&&!document.hidden&&!root.contains(document.activeElement))load();else schedule();},Math.max(60,Number(data?.refreshSeconds)||60)*1000);};
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{onScreen=entries.some(entry=>entry.isIntersecting);}).observe(root);
  root.addEventListener('click',event=>{const button=event.target.closest('[data-live-refresh],[data-live-market]');if(!button)return;if(button.hasAttribute('data-live-refresh'))load('[data-live-refresh]');else{state.market=button.dataset.liveMarket;render(`[data-live-market="${CSS.escape(state.market)}"]`);}});
  load();
}
