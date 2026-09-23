import { SPORTS } from './bet-utils.js';
import { gameKey,playerEligible,playerMarkets,findPlayers } from './bet-legs.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const leagues={'eng.1':'Premier League','esp.1':'La Liga','ger.1':'Bundesliga','ita.1':'Serie A','fra.1':'Ligue 1','usa.1':'MLS','uefa.champions':'Champions League'};
const option=(value,label,selected)=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`;
const select=(name,label,choices,value)=>`<label>${label}<select data-field="${name}">${choices.map(([v,l])=>option(v,l,value)).join('')}</select></label>`;
const input=(name,label,value,extra='')=>`<label>${label}<input data-field="${name}" value="${esc(value)}" ${extra}></label>`;
const request=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(35000)}),d=await r.json();if(!r.ok)throw Error(d.error||'Game data unavailable');return d;};
const blank=(sport,date)=>({id:crypto.randomUUID(),mode:sport==='Other'?'manual':'quick',sport,date,league:'eng.1',gameId:'',market:'',subjectId:'',subject:'',marketLabel:'',matchup:'',label:'',side:'over',line:'',override:null,observation:null});

export class BetLegEditor {
  constructor(element,onChange){
    this.element=element;this.onChange=onChange;this.rows=[];this.catalogs=new Map();this.catalogPending=new Map();this.games=new Map();this.gamePending=new Map();this.errors=new Map();this.pending=new Set();this.searches=new Map();
    element.addEventListener('click',e=>{const b=e.target.closest('[data-remove]'),pick=e.target.closest('[data-pick-player]');if(b){this.rows=this.rows.filter(l=>l.id!==b.dataset.remove);this.render();onChange();}if(pick)this.pickPlayer(pick);});
    element.addEventListener('input',e=>{if(e.target.hasAttribute('data-search-player')){const l=this.rows.find(l=>l.id===e.target.dataset.searchPlayer);if(!l)return;const s=this.searchState(l);s.query=e.target.value;clearTimeout(s.timer);s.sequence++;s.loading=false;s.results=[];this.renderSearch(l);s.timer=setTimeout(()=>this.searchPlayers(l),250);}else if(e.target.tagName==='INPUT')this.change(e,false);});
    element.addEventListener('change',e=>this.change(e,true));
  }
  reset(legs,sport,date){for(const s of this.searches.values())clearTimeout(s.timer);this.searches.clear();this.rows=structuredClone(legs).map(l=>({...l,mode:l.mode==='auto'&&l.entry==='quick'?'quick':l.mode}));this.render();for(const leg of this.rows)this.load(leg);this.defaultSport=sport;this.defaultDate=date;}
  add(sport,date){if(this.rows.length>=20)return;const l=blank(sport,date);this.rows.push(l);this.render();this.load(l);this.onChange();}
  catalogKey(l){return [l.sport,l.league,l.date].join('|');}
  async getCatalog(l){
    const key=this.catalogKey(l);if(this.catalogs.has(key))return this.catalogs.get(key);if(this.catalogPending.has(key))return this.catalogPending.get(key);
    const task=request('/api/bets/catalog?'+new URLSearchParams({sport:l.sport.toLowerCase(),league:l.league,date:l.date})).then(c=>{this.catalogs.set(key,c);return c;}).finally(()=>this.catalogPending.delete(key));
    this.catalogPending.set(key,task);return task;
  }
  async getGame(l){
    const key=gameKey(l);if(this.games.has(key))return this.games.get(key);if(this.gamePending.has(key))return this.gamePending.get(key);
    const task=request('/api/bets/game?'+new URLSearchParams({sport:l.sport.toLowerCase(),league:l.league,date:l.date,game:l.gameId})).then(g=>{this.games.set(key,g);return g;}).finally(()=>this.gamePending.delete(key));
    this.gamePending.set(key,task);return task;
  }
  async load(l){
    if(l.mode==='manual'||l.sport==='Other')return;
    const id=l.id,q={...l};
    this.pending.add(id);this.errors.delete(id);this.render();
    try{
      await this.getCatalog(q);
      if(q.gameId)await this.getGame(q);
    }catch(e){this.errors.set(id,e.message+' You can retry by choosing the game again, or enter this leg manually.');}
    finally{this.pending.delete(id);this.render();this.onChange();}
  }
  change(event,rerender){
    const target=event.target,name=target.dataset.field,id=target.closest('[data-leg-id]')?.dataset.legId;
    if(!name||!id)return;const l=this.rows.find(l=>l.id===id);if(!l)return;
    const prior=l[name];l[name]=target.value;
    if(name==='override')l.override=target.value||null;
    const changed=String(prior??'')!==String(l[name]??'');
    if(changed&&['sport','date','league','mode','gameId','market'].includes(name)){clearTimeout(this.searches.get(l.id)?.timer);this.searches.delete(l.id);}
    if(changed&&(['sport','date','league'].includes(name)||name==='mode'&&(prior==='manual'||l.mode==='manual'))){l.gameId='';l.subjectId='';l.subject='';l.market='';l.marketLabel='';l.matchup='';if(l.sport==='Other')l.mode='manual';}
    if(changed&&name==='mode'&&l.mode==='quick'){
      const m=this.games.get(gameKey(l))?.markets[l.market]||this.catalogs.get(this.catalogKey(l))?.markets[l.market];
      if(m&&m.kind!=='player'){l.subjectId='';l.subject='';l.market='';l.marketLabel='';}
    }
    if(changed&&name==='gameId'){l.subjectId='';l.subject='';}
    if(changed&&name==='market'){if(l.mode!=='quick')l.subjectId='';l.side=['moneyline','spread'].includes(l.market)?'home':'over';}
    if(changed&&name!=='override')l.observation=null;
    if(rerender){this.hydrate(l);this.render();if(['sport','date','league','mode','gameId'].includes(name))this.load(l);if(name==='mode'&&l.mode==='quick')[...this.element.querySelectorAll('[data-search-player]')].find(e=>e.dataset.searchPlayer===l.id)?.focus();}
    this.onChange();
  }
  hydrate(l){
    if(l.mode==='manual')return;
    const c=this.catalogs.get(this.catalogKey(l)),g=this.games.get(gameKey(l)),market=c?.markets[l.market]||g?.markets[l.market];
    const game=c?.games.find(x=>x.id===l.gameId)||g?.game;
    if(game)l.matchup=game.away.name+' @ '+game.home.name;
    if(market)l.marketLabel=market.label;
    if(['winner','spread','total'].includes(market?.kind)){
      l.subjectId=market.kind==='total'?'game':l.side;
      l.subject=market.kind==='total'?'Game total':l.side==='draw'?'Draw':game?.[l.side]?.name||l.side;
    }else if(g){const p=(market?.kind==='team'?g.teams:g.players).find(x=>x.id===l.subjectId);if(p)l.subject=p.name;}
    const side=l.market==='moneyline'?'Moneyline':l.market==='spread'?'Spread '+(Number(l.line)>0?'+':'')+l.line:(l.side==='under'?'Under ':'Over ')+l.line;
    l.label=[l.subject,l.market==='moneyline'||l.market==='spread'?side:l.marketLabel+' · '+side].filter(Boolean).join(' · ');
  }
  values(){return this.rows.map(l=>{this.hydrate(l);return {...l,mode:l.mode==='quick'?'auto':l.mode,entry:l.mode==='quick'?'quick':'game',...(l.mode==='manual'?{market:l.market||'custom',override:l.override||'open'}:{})};});}
  searchState(l){if(!this.searches.has(l.id))this.searches.set(l.id,{query:'',results:[],sequence:0,loading:false,error:''});return this.searches.get(l.id);}
  async searchPlayers(l){
    const s=this.searchState(l),sequence=++s.sequence,q={...l};s.results=[];s.error='';
    if(s.query.trim().length<2){s.loading=false;this.renderSearch(l);return;}
    s.loading=true;this.renderSearch(l);let catalog;
    try{catalog=await this.getCatalog(q);}catch(e){if(this.searches.get(l.id)===s&&sequence===s.sequence){s.loading=false;s.error=e.message;this.renderSearch(l);}return;}
    if(this.searches.get(l.id)!==s||sequence!==s.sequence)return;
    const games=catalog.games;let next=0,failed=0;const loaded=[];
    await Promise.all(Array.from({length:Math.min(3,games.length)},async()=>{while(next<games.length){if(this.searches.get(l.id)!==s||sequence!==s.sequence)return;const game=games[next++];try{loaded.push(await this.getGame({...q,gameId:game.id}));}catch{failed++;}}}));
    if(this.searches.get(l.id)!==s||sequence!==s.sequence)return;
    s.loading=false;s.results=findPlayers(loaded,null,s.query);s.error=failed?failed+' game rosters could not load. Results may be incomplete.':'';this.renderSearch(l);
  }
  renderSearch(l){
    const container=[...this.element.querySelectorAll('[data-search-results]')].find(e=>e.dataset.searchResults===l.id);if(!container)return;
    const s=this.searchState(l);
    if(s.query.trim().length<2){container.innerHTML='<p class="leg-help">Type a name, pick the player, then choose their prop.</p>';return;}
    if(s.loading){container.innerHTML='<p class="leg-help">Finding players in this date’s games…</p>';return;}
    container.innerHTML=(s.error?'<p class="leg-help">'+esc(s.error)+'</p>':'')+(s.results.length?`<p class="leg-help">${s.results.length} matching selection${s.results.length===1?'':'s'}${s.results.length>12?' · first 12 shown; type more to narrow':''}</p><div class="player-search-results">${s.results.slice(0,12).map(({player:p,game:g})=>`<button type="button" data-pick-player="${esc(p.id)}" data-pick-game="${esc(g.id)}"><strong>${esc(p.name)}</strong><small>${esc([p.position,g.away.code||g.away.name,g.home.code||g.home.name].filter(Boolean).join(' · '))} · ${esc(new Date(g.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))}</small><span>Select ↗</span></button>`).join('')}</div>`:'<p class="leg-help">No matching players on this date. Check the sport or game date.</p>');
  }
  pickPlayer(button){
    const l=this.rows.find(l=>l.id===button.closest('[data-leg-id]')?.dataset.legId);if(!l)return;
    const g=this.games.get(gameKey({...l,gameId:button.dataset.pickGame})),p=g?.players.find(p=>p.id===button.dataset.pickPlayer);
    if(!p||!playerMarkets(p,g.markets).length)return;
    l.gameId=g.game.id;l.subjectId=p.id;l.subject=p.name;l.observation=null;
    if(!playerEligible(p,g.markets[l.market])){l.market='';l.marketLabel='';}
    this.searches.delete(l.id);this.hydrate(l);this.render();this.onChange();
    [...this.element.querySelectorAll('[data-leg-id]')].find(e=>e.dataset.legId===l.id)?.querySelector(l.market?'[data-field=line]':'[data-field=market]')?.focus();
  }
  render(){
    const active=document.activeElement,searchFocus=this.element.contains(active)?active?.dataset.searchPlayer:null,caret=searchFocus?active.selectionStart:null;
    this.element.innerHTML=this.rows.map((l,i)=>{
      const c=this.catalogs.get(this.catalogKey(l)),g=this.games.get(gameKey(l)),m=c?.markets[l.market]||g?.markets[l.market],manual=l.mode==='manual',quick=l.mode==='quick';
      const gameChoices=[['','Choose game…'],...(c?.games||[]).map(g=>[g.id,g.away.name+' @ '+g.home.name+' · '+g.status])];
      if(l.gameId&&!gameChoices.some(([id])=>id===l.gameId))gameChoices.push([l.gameId,l.matchup||l.gameId]);
      const choices=(m?.kind==='team'?g?.teams:g?.players?.filter(p=>playerEligible(p,m)))||[];
      const subjects=[['','Choose '+(m?.kind==='team'?'team':'player')+'…'],...choices.map(p=>[p.id,p.name+(p.position?' · '+p.position:'')+(p.teamId?' · '+(g.teams.find(t=>t.id===p.teamId)?.code||g.teams.find(t=>t.id===p.teamId)?.name||''):'')])];
      if(l.subjectId&&!subjects.some(([id])=>id===l.subjectId))subjects.push([l.subjectId,'Saved selection: '+(l.subject||l.subjectId)]);
      const search=this.searchState(l),picked=g?.players.find(p=>p.id===l.subjectId),props=picked?playerMarkets(picked,g.markets).map(([k,v])=>[k,v.label]):[];
      if(l.market&&!props.some(([key])=>key===l.market))props.push([l.market,l.marketLabel||l.market]);
      const sides=['moneyline','spread'].includes(l.market)?[['home','Home'],['away','Away'],...(l.sport==='Soccer'&&l.market==='moneyline'?[['draw','Draw']]:[])]:[['over','Over'],['under','Under']];
      const quickFlow=`<div class="quick-player-search full-field"><label>Player name<input type="search" data-search-player="${esc(l.id)}" value="${esc(search.query)}" placeholder="Type a player name…" autocomplete="off" maxlength="100"></label><div data-search-results="${esc(l.id)}" aria-live="polite"></div></div>${l.subjectId?`<div class="selected-search-player full-field"><strong>${esc(l.subject)}</strong><small>${esc(l.matchup)}</small></div>${select('market','Bet type',[['','Choose player prop…'],...props],l.market)}`:''}`;
      const gameFlow=`<div class="full-field">${select('gameId','Game',gameChoices,l.gameId)}</div>${select('market','Bet type',[['','Choose market…'],...Object.entries(c?.markets||g?.markets||{}).map(([k,v])=>[k,v.label])],l.market)}${m&&['player','team'].includes(m.kind)?select('subjectId',m.kind==='team'?'Team':'Player',subjects,l.subjectId):''}`;
      return `<fieldset class="leg-editor" data-leg-id="${esc(l.id)}"><legend>Leg ${i+1}</legend><button type="button" class="leg-remove" data-remove="${esc(l.id)}" aria-label="Remove leg ${i+1}">Remove</button><div class="leg-fields">
        ${select('mode','Tracking',[['quick','Quick Search'],['auto','Pick a game'],['manual','Enter / settle manually']],l.mode)}${select('sport','Sport',SPORTS.map(s=>[s,s]),l.sport)}
        ${input('date','Game date',l.date,'type="date" min="2005-01-01" max="2100-12-31"')}
        ${l.sport==='Soccer'?select('league','League',Object.entries(leagues),l.league):''}
        ${manual?input('label','Selection / player / market',l.label,'maxlength="240" placeholder="e.g. A’ja Wilson points"'):quick?quickFlow:gameFlow}
        ${manual?select('market','Line type',[['custom','Player prop / total'],['spread','Spread'],['moneyline','Moneyline']],l.market||'custom'):''}
        ${!quick||l.subjectId&&l.market?`${select('side','Your side',sides,l.side)}${l.market!=='moneyline'?input('line','Line you took',l.line,`type="number" step="${manual?'any':'0.5'}" min="-100000" max="100000" placeholder="e.g. 24.5"`):''}
        ${select('override','Leg result',[...(!manual?[['','Automatic from box score']]:[]),['open','Pending'],['won','Hit / won'],['lost','Miss / lost'],['push','Push'],['void','Void']],l.override||(manual?'open':''))}`:''}
      </div>${!manual?`<p class="leg-help" role="status">${this.pending.has(l.id)?'Loading games…':esc(this.errors.get(l.id)||(!c?.games.length?'No published games on this date. Choose another date or enter manually.':quick?'Search covers all '+l.sport+' games on '+l.date+'.':'Full-game lines only. Soccer uses regulation time; other sports include overtime. Enter your exact booked line.'))}</p>`:''}</fieldset>`;
    }).join('')||'<p class="leg-help">No connected legs. Existing tickets can keep their manual result, or you can add their selections below.</p>';
    for(const l of this.rows)this.renderSearch(l);
    if(searchFocus){const input=[...this.element.querySelectorAll('[data-search-player]')].find(e=>e.dataset.searchPlayer===searchFocus);if(input){input.focus({preventScroll:true});if(caret!==null)input.setSelectionRange(caret,caret);}}
  }
}
