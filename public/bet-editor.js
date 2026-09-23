import { SPORTS } from './bet-utils.js';
import { gameKey } from './bet-legs.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const leagues={'eng.1':'Premier League','esp.1':'La Liga','ger.1':'Bundesliga','ita.1':'Serie A','fra.1':'Ligue 1','usa.1':'MLS','uefa.champions':'Champions League'};
const option=(value,label,selected)=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`;
const select=(name,label,choices,value)=>`<label>${label}<select data-field="${name}">${choices.map(([v,l])=>option(v,l,value)).join('')}</select></label>`;
const input=(name,label,value,extra='')=>`<label>${label}<input data-field="${name}" value="${esc(value)}" ${extra}></label>`;
const request=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(35000)}),d=await r.json();if(!r.ok)throw Error(d.error||'Game data unavailable');return d;};
const blank=(sport,date)=>({id:crypto.randomUUID(),mode:sport==='Other'?'manual':'auto',sport,date,league:'eng.1',gameId:'',market:'',subjectId:'',subject:'',marketLabel:'',matchup:'',label:'',side:'over',line:'',override:null,observation:null});

export class BetLegEditor {
  constructor(element,onChange){
    this.element=element;this.onChange=onChange;this.rows=[];this.catalogs=new Map();this.games=new Map();this.errors=new Map();this.pending=new Set();
    element.addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){this.rows=this.rows.filter(l=>l.id!==b.dataset.remove);this.render();onChange();}});
    element.addEventListener('input',e=>{if(e.target.tagName==='INPUT')this.change(e,false);});
    element.addEventListener('change',e=>this.change(e,true));
  }
  reset(legs,sport,date){this.rows=structuredClone(legs);this.render();for(const leg of this.rows)this.load(leg);this.defaultSport=sport;this.defaultDate=date;}
  add(sport,date){if(this.rows.length>=20)return;const l=blank(sport,date);this.rows.push(l);this.render();this.load(l);this.onChange();}
  catalogKey(l){return [l.sport,l.league,l.date].join('|');}
  async load(l){
    if(l.mode!=='auto'||l.sport==='Other')return;
    const key=this.catalogKey(l),id=l.id;
    const cquery=new URLSearchParams({sport:l.sport.toLowerCase(),league:l.league,date:l.date});
    this.pending.add(id);this.errors.delete(id);this.render();
    try{
      if(!this.catalogs.has(key))this.catalogs.set(key,await request('/api/bets/catalog?'+cquery));
      if(l.gameId&&!this.games.has(gameKey(l)))this.games.set(gameKey(l),await request('/api/bets/game?'+cquery+'&game='+encodeURIComponent(l.gameId)));
    }catch(e){this.errors.set(id,e.message+' You can retry by choosing the game again, or enter this leg manually.');}
    finally{this.pending.delete(id);this.render();this.onChange();}
  }
  change(event,rerender){
    const target=event.target,name=target.dataset.field,id=target.closest('[data-leg-id]')?.dataset.legId;
    if(!name||!id)return;const l=this.rows.find(l=>l.id===id);if(!l)return;
    const prior=l[name];l[name]=target.value;
    if(name==='override')l.override=target.value||null;
    const changed=String(prior??'')!==String(l[name]??'');
    if(changed&&['sport','date','league','mode'].includes(name)){l.gameId='';l.subjectId='';l.market='';l.matchup='';if(l.sport==='Other')l.mode='manual';}
    if(changed&&name==='gameId'){l.subjectId='';l.subject='';}
    if(changed&&name==='market'){l.subjectId='';l.side=['moneyline','spread'].includes(l.market)?'home':'over';}
    if(changed&&name!=='override')l.observation=null;
    if(rerender){this.hydrate(l);this.render();if(['sport','date','league','mode','gameId'].includes(name))this.load(l);}
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
  values(){return this.rows.map(l=>{this.hydrate(l);return {...l,...(l.mode==='manual'?{market:l.market||'custom',override:l.override||'open'}:{})};});}
  render(){
    this.element.innerHTML=this.rows.map((l,i)=>{
      const c=this.catalogs.get(this.catalogKey(l)),g=this.games.get(gameKey(l)),m=c?.markets[l.market]||g?.markets[l.market],manual=l.mode==='manual';
      const gameChoices=[['','Choose game…'],...(c?.games||[]).map(g=>[g.id,g.away.name+' @ '+g.home.name+' · '+g.status])];
      if(l.gameId&&!gameChoices.some(([id])=>id===l.gameId))gameChoices.push([l.gameId,l.matchup||l.gameId]);
      const choices=(m?.kind==='team'?g?.teams:g?.players)||[];
      const subjects=[['','Choose '+(m?.kind==='team'?'team':'player')+'…'],...choices.map(p=>[p.id,p.name+(p.teamId?' · '+(g.teams.find(t=>t.id===p.teamId)?.code||g.teams.find(t=>t.id===p.teamId)?.name||''):'')])];
      if(l.subjectId&&!subjects.some(([id])=>id===l.subjectId))subjects.push([l.subjectId,l.subject||l.subjectId]);
      const sides=['moneyline','spread'].includes(l.market)?[['home','Home'],['away','Away'],...(l.sport==='Soccer'&&l.market==='moneyline'?[['draw','Draw']]:[])]:[['over','Over'],['under','Under']];
      return `<fieldset class="leg-editor" data-leg-id="${esc(l.id)}"><legend>Leg ${i+1}</legend><button type="button" class="leg-remove" data-remove="${esc(l.id)}" aria-label="Remove leg ${i+1}">Remove</button><div class="leg-fields">
        ${select('mode','Tracking',[['auto','Connect to game results'],['manual','Enter / settle manually']],l.mode)}${select('sport','Sport',SPORTS.map(s=>[s,s]),l.sport)}
        ${input('date','Game date',l.date,'type="date" min="2005-01-01" max="2100-12-31"')}
        ${l.sport==='Soccer'?select('league','League',Object.entries(leagues),l.league):''}
        ${manual?input('label','Selection / player / market',l.label,'maxlength="240" placeholder="e.g. A’ja Wilson points"'):
          `<div class="full-field">${select('gameId','Game',gameChoices,l.gameId)}</div>${select('market','Bet type',[['','Choose market…'],...Object.entries(c?.markets||g?.markets||{}).map(([k,v])=>[k,v.label])],l.market)}${m&&['player','team'].includes(m.kind)?select('subjectId',m.kind==='team'?'Team':'Player',subjects,l.subjectId):''}`}
        ${manual?select('market','Line type',[['custom','Player prop / total'],['spread','Spread'],['moneyline','Moneyline']],l.market||'custom'):''}
        ${select('side','Your side',sides,l.side)}${l.market!=='moneyline'?input('line','Line you took',l.line,`type="number" step="${manual?'any':'0.5'}" min="-100000" max="100000" placeholder="e.g. 24.5"`):''}
        ${select('override','Leg result',[...(!manual?[['','Automatic from box score']]:[]),['open','Pending'],['won','Hit / won'],['lost','Miss / lost'],['push','Push'],['void','Void']],l.override||(manual?'open':''))}
      </div>${!manual?`<p class="leg-help" role="status">${this.pending.has(l.id)?'Loading game / player choices…':esc(this.errors.get(l.id)||(!c?.games.length?'No published games on this date. Choose another date or enter manually.':'Full-game lines only. Soccer uses regulation time; other sports include overtime. Enter your exact booked line.'))}</p>`:''}</fieldset>`;
    }).join('')||'<p class="leg-help">No connected legs. Existing tickets can keep their manual result, or you can add their selections below.</p>';
  }
}
