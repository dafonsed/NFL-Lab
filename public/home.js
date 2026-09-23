import {requestData, loadingRows, emptyBoard, propBoard, gameStrip, boardGames} from './product-ui.js';
import {researchProfile, NFL_MARKETS, escape as esc} from './research-data.js';
import {playerContext, playerKey} from './sports-view.js';
import {mountResearchWorkspace, openPlayerResearch, observeLines} from './player-research.js';

const $ = s => document.querySelector(s), params = new URLSearchParams(location.search);
const sports = ['nfl','mlb','nba','wnba','nhl','soccer'], sport = sports.includes(params.get('sport')) ? params.get('sport') : 'mlb';
const defaults = {nfl:'rec_yds',mlb:'hits',nba:'points',wnba:'points',nhl:'shots',soccer:'shots'};
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:sport==='mlb'?'America/New_York':'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const state = {date:params.get('date')||today(),market:params.get('prop')||defaults[sport],week:params.get('period')||'',game:params.get('game')||'',board:null,profiles:[],catalog:null,loadedKey:null};
const savedKey = sport==='nfl'?'nfl-saved':sport==='mlb'?'mlb-lab-watchlist':'sports-lab-saved-'+sport;
const noteKey = sport==='nfl'?'nfl-notes':sport==='mlb'?'mlb-lab-notes':'sports-lab-notes-'+sport;
const read = (key,fallback) => {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const savedValue=read(savedKey,[]),saved=new Set(Array.isArray(savedValue)?savedValue:[]);
let requestId=0, controller;
$('#home-date').value=state.date;$('#home-date-label').hidden=sport==='nfl';$('#home-week-label').hidden=sport!=='nfl';
$('#home-market').innerHTML=`<option value="${esc(state.market)}">${esc(({rec_yds:'Receiving yards',hits:'Hits',points:'Points',shots:'Shots'}[state.market])||state.market)}</option>`;
function query(){const q=new URLSearchParams({market:state.market});if(sport==='nfl'){q.set('view','board');if(state.week){const [season,week]=state.week.split('-');q.set('season',season);q.set('week',week);}}else {q.set('date',state.date);if(sport!=='mlb'){q.set('sport',sport);if(state.game)q.set('game',state.game);}}return q;}
function links(){const q=query();q.delete('sport');if(state.game&&['nfl','mlb'].includes(sport))q.set('game',state.game);const root='/'+sport+'?'+q;$('#full-research').href=root;$('#home-all').href=root;const tq=new URLSearchParams(q);tq.set('view','trends');$('#home-trends').href='/'+sport+'?'+tq;$('#home-live').href=['nfl','mlb','nba','wnba'].includes(sport)?'/'+sport+'/live'+(sport==='nfl'?'':'?date='+state.date):'/live';$('#home-simulation').href='/'+sport+'/simulation'+(sport==='nfl'?'':'?date='+state.date);}
function save(p){const id=p.playerId;if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem(savedKey,JSON.stringify([...saved]));$('#home-status').textContent=saved.has(id)?p.name+' saved.':p.name+' removed from saved players.';}catch{$('#home-status').textContent='Browser storage is unavailable. Your changes last only for this session.';}render();return saved.has(id);}
function render(){
  const filter=$('#home-search').value.trim().toLowerCase(), rows=state.profiles.filter(p=>(p.name+' '+p.team+' '+p.opponent).toLowerCase().includes(filter)&&(!state.game||sport!=='mlb'&&sport!=='nfl'||String(p.gameId)===state.game));
  $('#home-count').textContent=(rows.length>30?'30 of ':'')+rows.length+' players';$('#home-board-title').textContent=state.profiles[0]?.label||'Player props';
  $('#home-board').innerHTML=rows.length?propBoard(rows.slice(0,30),{kind:'home-prop',row:p=>({saved:saved.has(p.playerId),saveId:p.key})}):emptyBoard('No matching players','Try another prop or clear the player search.',filter?'<button class="button subtle" data-clear-search>Clear search</button>':'');
  if(rows.length)mountResearchWorkspace($('#home-board'),rows,{open:detail});
  $('#home-all').textContent=rows.length>30?'See all '+rows.length+' players →':'Open the full board →';
}
async function load(force=false){
  const id=++requestId;controller?.abort();controller=new AbortController();const signal=controller.signal,key=query().toString(),retain=state.board&&state.loadedKey===key;
  if(!retain){state.board=null;state.profiles=[];$('#home-board').innerHTML=loadingRows('Loading '+sport.toUpperCase()+' research');$('#home-games').innerHTML='';$('#home-count').textContent='';$('#home-source').textContent='';}
  $('#home-board').setAttribute('aria-busy','true');$('#home-refresh').disabled=true;$('#home-status').textContent=retain?'Refreshing the current board…':'Loading schedule and player history…';links();
  try{
    if(!['nfl','mlb'].includes(sport)){
      const c=await requestData('/api/sports/catalog?'+query(),{signal});if(id!==requestId)return;state.catalog=c;
      const game=c.games.find(g=>String(g.id)===state.game)||c.games.find(g=>g.state==='pre')||c.games[0];
      $('#home-market').innerHTML=Object.entries(c.markets).map(([k,m])=>`<option value="${esc(k)}">${esc(m.label)}</option>`).join('');$('#home-market').value=state.market;
      if(!game){const prev=c.availableDates?.filter(d=>d<state.date).at(-1),next=c.availableDates?.find(d=>d>state.date);$('#home-board').innerHTML=emptyBoard('No '+sport.toUpperCase()+' games on '+state.date,'The schedule loaded successfully. Choose another date to research available games.',[prev,next].filter(Boolean).map(d=>`<button class="button subtle" data-date="${esc(d)}">${d<state.date?'Previous':'Next'} games · ${esc(d)}</button>`).join(''));$('#home-status').textContent='Schedule loaded · no listed games';$('#home-context').textContent=sport.toUpperCase()+' · '+state.date;return;}
      state.game=String(game.id);
    }
    const b=await requestData((sport==='nfl'?'/api/board?':sport==='mlb'?'/api/mlb/board?':'/api/sports/board?')+query()+(force?'&refresh=1':''),{signal});if(id!==requestId)return;
    state.board=b;state.loadedKey=query().toString();const markets=sport==='nfl'?NFL_MARKETS:b.markets;
    $('#home-market').innerHTML=Object.entries(markets).map(([k,m])=>`<option value="${esc(k)}">${esc(m.label)}</option>`).join('');$('#home-market').value=state.market;
    state.profiles=b.players.map(p=>{const context=!['mlb','nfl'].includes(sport)?playerContext(b,playerKey(p)):null;return researchProfile({sport,board:context?.board||b,player:p,market:state.market});});
    const games=state.catalog?.games?state.catalog.games.map(g=>({id:g.id,away:g.away.code,home:g.home.code,awayScore:g.away.score,homeScore:g.home.score,status:g.status})):boardGames(b,sport);
    $('#home-games').innerHTML=gameStrip(games,{selected:state.game,all:['nfl','mlb'].includes(sport)});
    if(sport==='nfl'){$('#home-week').innerHTML='<option value="">Latest available week</option>'+(b.weeks||[]).map(w=>`<option value="${w.season}-${w.week}">${w.season} · Week ${w.week}</option>`).join('');$('#home-week').value=state.week;}
    const period=sport==='nfl'?b.current.season+' · Week '+b.current.week:state.date,historical=sport==='nfl'?!!b.current?.completed:state.date<today()||b.game?.state==='post'||(b.games?.length&&b.games.every(g=>g.state==='final'));
    $('#home-context').textContent=sport.toUpperCase()+' · '+period+(historical?' · Historical research':'');
    $('#home-disclosure').textContent=(historical?'Historical research. Reconstructed estimates and final results are separate. ':'Experimental projections; production accuracy is unverified. ')+(b.game?.state==='post'?'Past injury and lineup status was not archived. ':'')+'Open a player for sources and model limitations. Recent bars compare completed games with the displayed line.';
    $('#home-status').textContent=b.stale?'Saved data · a source is unavailable. Refresh to try again.':b.partial?'Some games could not load. Open full research for coverage.':'';
    $('#home-source').textContent=b.fetchedAt?'Board fetched '+new Date(b.fetchedAt).toLocaleString():'';
    const q=new URLSearchParams({sport,date:state.date,prop:state.market});if(state.week)q.set('period',state.week);if(state.game)q.set('game',state.game);const player=new URLSearchParams(location.search).get('researchPlayer');if(player)q.set('researchPlayer',player);history.replaceState(null,'','/research?'+q);links();observeLines(state.profiles);render();
    if(!games.length)$('#home-board').innerHTML=emptyBoard('No games on '+state.date,'The schedule loaded successfully. Use the date control to choose another day.');
  }catch(e){if(e.name==='AbortError'||id!==requestId)return;$('#home-status').textContent=retain?'Refresh failed. The previous board is still displayed and may be outdated.':'';if(!retain)$('#home-board').innerHTML=emptyBoard('Research could not load',e.message,'<button class="button primary" data-retry>Retry request</button>');}
  finally{if(id===requestId){$('#home-board').setAttribute('aria-busy','false');$('#home-refresh').disabled=false;}}
}
function detail(p, container){
 const notes=read(noteKey,{});openPlayerResearch({container,profile:p,saved:saved.has(p.playerId),note:notes[p.playerId]||'',onSave:()=>save(p),saveNote:value=>{notes[p.playerId]=value;try{localStorage.setItem(noteKey,JSON.stringify(notes));return true;}catch{return false;}},loadDetails:['nfl','mlb'].includes(sport)?async signal=>{const q=query();q.set('player',p.id);if(sport==='nfl'){q.set('season',state.board.current.season);q.set('week',state.board.current.week);}const data=await requestData((sport==='nfl'?'/api/nfl/research?':'/api/mlb/evidence?')+q,{signal});return {...researchProfile({sport,board:state.board,player:data.player||p.raw,market:state.market}),full:true};}:undefined,loadMarket:async(market,signal)=>{const q=query();q.set('market',market);const b=await requestData((sport==='nfl'?'/api/board?':sport==='mlb'?'/api/mlb/board?':'/api/sports/board?')+q,{signal}),raw=b.players.find(r=>String(r.playerId??r.id)===String(p.playerId)&&String(r.gameId)===String(p.gameId));return raw?researchProfile({sport,board:b,player:raw,market}):null;}});
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-retry'))load(true);if(b.hasAttribute('data-clear-search')){$('#home-search').value='';render();}if(b.dataset.date){state.date=b.dataset.date;state.game='';$('#home-date').value=state.date;load();}if(b.hasAttribute('data-board-game')){state.game=b.dataset.boardGame;if(['nfl','mlb'].includes(sport)){const url=new URL(location.href);if(state.game)url.searchParams.set('game',state.game);else url.searchParams.delete('game');history.replaceState(null,'',url);render();links();$('#home-games').querySelectorAll('[data-board-game]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.boardGame===state.game)));}else load();}if(b.dataset.player){const p=state.profiles.find(p=>p.key===b.dataset.player);if(p)detail(p);}if(b.dataset.save){const p=state.profiles.find(p=>p.key===b.dataset.save);if(p)save(p);}});
$('#home-date').addEventListener('change',()=>{if($('#home-date').value){state.date=$('#home-date').value;state.game='';load();}});$('#home-week').addEventListener('change',()=>{state.week=$('#home-week').value;state.game='';load();});$('#home-market').addEventListener('change',()=>{state.market=$('#home-market').value;load();});$('#home-refresh').addEventListener('click',()=>load(true));$('#home-search').addEventListener('input',render);
load();
