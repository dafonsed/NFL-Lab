export const LEG_RESULTS={open:'Pending',live:'Live',won:'Hit',lost:'Miss',push:'Push',void:'Void',review:'Check with book',unavailable:'Data unavailable'};
const outcomes=['open','won','lost','push','void'];
const number=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
const text=(v,max=160)=>String(v??'').trim().slice(0,max);
export const gameKey=l=>[l.sport,l.league,l.date,l.gameId].join('|');
export const playerEligible=(player,market)=>market?.kind==='player'&&(!market.playerRole||player.roles?.includes(market.playerRole)===true);
export const playerMarkets=(player,markets)=>Object.entries(markets||{}).filter(([,m])=>playerEligible(player,m));
const foldedName=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const playerNameMatches=(player,query)=>!!foldedName(query)&&foldedName(player.name).includes(foldedName(query));
export function findPlayers(games,marketKey,query){
  const matches=new Map();
  for(const g of games)for(const p of g.players||[])if((marketKey?playerEligible(p,g.markets?.[marketKey]):playerMarkets(p,g.markets).length>0)&&playerNameMatches(p,query))matches.set(g.game.id+':'+p.id,{player:p,game:g.game});
  return [...matches.values()].sort((a,b)=>a.player.name.localeCompare(b.player.name)||a.game.id.localeCompare(b.game.id));
}
export function validateLeg(input) {
  if(!input||!['auto','manual'].includes(input.mode))throw Error('Choose automatic or manual tracking for each leg.');
  if(!['NFL','MLB','NBA','WNBA','NHL','Soccer','Other'].includes(input.sport))throw Error('Choose a sport for each leg.');
  const label=text(input.label,240),marketLabel=text(input.marketLabel),subject=text(input.subject),matchup=text(input.matchup);
  if(!label)throw Error('Describe every leg.');
  if(!['over','under','home','away','draw'].includes(input.side))throw Error('Choose a side for every leg.');
  const line=number(input.line);
  if(input.market!=='moneyline'&&(line===null||Math.abs(line)>100000||input.mode==='auto'&&!Number.isInteger(line*2)))throw Error('Enter a whole- or half-point line for every connected leg. Quarter lines require manual book settlement.');
  if(input.mode==='auto'&&(['moneyline','spread'].includes(input.market)?!['home','away',...(input.sport==='Soccer'&&input.market==='moneyline'?['draw']:[])].includes(input.side):!['over','under'].includes(input.side)))throw Error('Choose a side that matches the bet type.');
  if(input.mode==='auto'&&(!/^\d{6,12}$/.test(input.gameId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(input.date||'')||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date||!input.market||!input.subjectId))throw Error('Connect every automatic leg to a game and player or team.');
  if(input.override&&!outcomes.includes(input.override))throw Error('Choose a valid leg result.');
  const o=input.observation;
  const observation=o&&Object.hasOwn(LEG_RESULTS,o.state)?{state:o.state,actual:number(o.actual),checkedAt:text(o.checkedAt,40),sourceUrl:text(o.sourceUrl,500),message:text(o.message,300),gameStatus:text(o.gameStatus)}:null;
  return {id:text(input.id,80)||crypto.randomUUID(),mode:input.mode,entry:input.entry==='quick'?'quick':'game',sport:input.sport,league:text(input.league,40),date:text(input.date,10),gameId:text(input.gameId,12),market:text(input.market,50),marketLabel,subjectId:text(input.subjectId,30),subject,matchup,label,side:input.side,line:input.market==='moneyline'?null:line,override:input.override||null,observation};
}
export function legState(leg){return leg.override||leg.observation?.state||'open';}
export function ticketSettlement(legs) {
  if(!legs.length)return {status:'open',note:'Add selections to track this ticket.'};
  const states=legs.map(legState);
  if(states.includes('lost'))return {status:'lost',note:'At least one leg missed.'};
  if(states.some(s=>['review','unavailable'].includes(s)))return {status:'open',note:'A leg needs a result check. Update it from your sportsbook.'};
  if(states.some(s=>['open','live'].includes(s)))return {status:'open',note:'Waiting for every leg to finish.'};
  if(states.every(s=>s==='won'))return {status:'won',note:'Every leg hit.'};
  if(states.every(s=>['push','void'].includes(s)))return {status:states.every(s=>s==='push')?'push':'void',note:'All selections refunded.'};
  return {status:'open',needsReturn:true,note:'A push or void changes the parlay payout. Confirm the ticket result and actual return from your sportsbook.'};
}
export function evaluateLeg(leg,snapshot) {
  const source=snapshot.source||{},game=snapshot.game||{};
  const base={actual:null,checkedAt:source.checkedAt||new Date().toISOString(),sourceUrl:source.url||'',gameStatus:game.status||''};
  const result=(state,message,actual=null)=>({...base,state,message,actual});
  if(String(game.id)!==leg.gameId||snapshot.sport!==leg.sport.toLowerCase()||leg.sport==='Soccer'&&snapshot.league!==leg.league)return result('unavailable','Game identity could not be verified.');
  if(source.stale)return result('unavailable','The result feed is stale; this leg has not been graded.');
  if(/postpon|cancel|suspend|abandon|no contest/i.test(game.status||''))return result('review','Game interrupted. Check your sportsbook’s rescheduling or void rule.');
  if(game.state==='pre')return result('open','Waiting for the game to start.');
  if(leg.sport==='Soccer'&&game.extraTime)return result('review','Extra time / shootout detected. Confirm the regulation-time result with your book.');
  const config=snapshot.markets?.[leg.market];if(!config)return result('unavailable','This market is not connected to a result field.');
  let actual;
  if(['winner','spread','total'].includes(config.kind)) {
    const home=game.home?.score,away=game.away?.score;
    if(!Number.isFinite(home)||!Number.isFinite(away))return result('unavailable','Score is not available.');
    if(config.kind==='winner') {
      if(!game.complete)return result('live',`${game.away.code||game.away.name} ${away} · ${game.home.code||game.home.name} ${home}`);
      const winner=home===away?'draw':home>away?'home':'away';
      if(winner==='draw'&&leg.sport!=='Soccer')return result('review','Tied game: confirm the sportsbook’s moneyline rule.');
      return result(winner===leg.side?'won':'lost',`Final: ${away}–${home}.`);
    }
    actual=config.kind==='total'?home+away:leg.side==='home'?home-away:away-home;
  } else {
    const p=(config.kind==='team'?snapshot.teams:snapshot.players)?.find(p=>String(p.id)===leg.subjectId);
    if(!p)return result(game.complete?'review':'open','Player / team not in the reported box score yet. No zero has been assumed.');
    if(config.kind==='player'&&p.participation!=='played')return result(game.complete?'review':'open','Participation is not confirmed. Check DNP and player-prop rules with the book.');
    actual=p.values?.[leg.market];
  }
  if(!Number.isFinite(actual))return result(game.complete?'review':'unavailable','Required statistic is missing; this is not counted as a miss.');
  if(!game.complete)return result('live','In progress · result remains unsettled until final.',actual);
  const diff=config.kind==='spread'?actual+leg.line:actual-leg.line;
  return result(diff===0?'push':(config.kind==='spread'||leg.side==='over'?diff>0:diff<0)?'won':'lost','Final box-score result.',actual);
}
export function refreshTicket(bet,snapshots) {
  const legs=(bet.legs||[]).map(leg=>{
    const snapshot=snapshots.get(gameKey(leg));if(leg.mode!=='auto'||!snapshot)return leg;
    return {...leg,observation:evaluateLeg(leg,snapshot)};
  });
  return {...bet,legs,...(bet.settlement==='auto'?{status:ticketSettlement(legs).status,cashout:null,returnOverride:null}:{})};
}
