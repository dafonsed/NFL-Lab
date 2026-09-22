import { MLB_API } from './provider.mjs';
import { MLB_MARKETS, statValue } from './markets.mjs';
export const MATCHUP_VERSION='mlb-pitcher-splits-v1';
const sum=(rows,key)=>rows.reduce((s,r)=>s+Number(r.stat?.[key]||0),0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// MLB's statSplits and vsPlayer APIs ignore date ranges. Never use a current
// season aggregate to reconstruct an earlier game. Preserve season rows only.
export function selectMatchupRows(person,{year,pregame,pitcherId}){
 const last=pregame?year:year-1,series=person?.stats||[];
 const valid=r=>Number(r.season)>=year-4&&Number(r.season)<=last&&r.gameType==='R';
 return {hand:series.filter(s=>s.type.displayName==='statSplits').flatMap(s=>s.splits||[]).filter(r=>valid(r)&&Number(r.season)>=year-2),versus:series.filter(s=>s.type.displayName==='vsPlayer').flatMap(s=>s.splits||[]).filter(r=>valid(r)&&Number(r.pitcher?.id)===Number(pitcherId))};
}
export async function loadMlbMatchups({games,candidates,people,read,now}){
 const result=new Map();
 await Promise.all(games.flatMap(game=>['away','home'].map(async side=>{
  const opponent=game[side==='home'?'away':'home'],pitcherId=opponent.pitcher?.id;
  const batters=candidates.filter(p=>p.gameId===game.gameId&&p.teamId===game[side].id&&p.role==='hitting');
  if(!batters.length)return;
  const year=Number(game.date.slice(0,4)),pregame=game.abstractState==='Preview'&&Date.parse(game.startTime)>now;
  const accumulated=new Map(),sources=[];let error=null;
  if(pitcherId)try{
   for(const season of [year-2,year-1,...(pregame?[year]:[])]){
    const hydrate=`stats(group=[hitting],type=[statSplits${season===year-1?',vsPlayer':''}],season=${season},sitCodes=[vl,vr],opposingPlayerId=${pitcherId})`;
    const url=MLB_API+'/people?'+new URLSearchParams({personIds:batters.map(p=>p.playerId).join(','),hydrate});
    const data=await read(url,{ttl:3600000});sources.push(url);
    for(const p of data.people||[]){const old=accumulated.get(p.id);accumulated.set(p.id,{...p,stats:[...(old?.stats||[]),...(p.stats||[])]});}
   }
  }catch(e){error=e.message;}
  const pitcher=people.get(pitcherId),hand=pitcher?.pitchHand?.code;
  for(const p of batters)result.set(p.id,{version:MATCHUP_VERSION,pitcherId,pitcher:opponent.pitcher?.fullName||'Unannounced starter',pitcherHand:hand||null,batterHand:people.get(p.playerId)?.batSide?.code||null,pregame,year,...selectMatchupRows(accumulated.get(p.playerId),{year,pregame,pitcherId}),sources,error,period:pregame?`Hand splits ${year-2}–${year}; head-to-head ${year-4}–${year}, available before this game`:`Completed seasons only, through ${year-1}; current career totals excluded to prevent hindsight`});
 })));
 return result;
}
export function matchupAdjustment(input,market,basePoint,longRate){
 if(!input||MLB_MARKETS[market].group!=='hitting')return null;
 const base={...input,hand:undefined,versus:undefined,applied:false,before:basePoint,after:basePoint,factor:1,components:[]};
 if(input.error||!input.pitcherId||!['L','R'].includes(input.pitcherHand)||!(longRate>0))return {...base,note:input.error?'Matchup source unavailable; no adjustment.':'Opposing pitcher or handedness unconfirmed; no adjustment.'};
 const selected=input.hand.filter(r=>r.split?.code===(input.pitcherHand==='L'?'vl':'vr'));
 const all=input.hand;
 const rows=[['Pitcher handedness',selected,120,.15],['This batter vs this pitcher',input.versus,80,.05]];
 let change=0;
 for(const [label,sample,prior,limit] of rows){
  const usable=sample.filter(r=>statValue(r.stat,market)!==null&&Number(r.stat.plateAppearances)>0),pa=sum(usable,'plateAppearances');
  const production=usable.reduce((s,r)=>s+statValue(r.stat,market),0);
  const baselineRows=all.filter(r=>statValue(r.stat,market)!==null),baselinePa=sum(baselineRows,'plateAppearances');
  const baseline=baselinePa?baselineRows.reduce((s,r)=>s+statValue(r.stat,market),0)/baselinePa:longRate;
  const reliability=pa/(pa+prior),rate=pa?production/pa:null;
  const delta=pa&&baseline>0?clamp((rate/baseline-1)*reliability,-limit,limit):0;
  // Starting-pitcher evidence applies to half a typical game's plate appearances;
  // the bullpen is already represented in the team opponent model.
  change+=delta*.5;
  base.components.push({label,plateAppearances:pa,production,rate,baseline,reliability,priorPlateAppearances:prior,fullGameEffect:delta*.5,stats:{hits:sum(usable,'hits'),atBats:sum(usable,'atBats'),homeRuns:sum(usable,'homeRuns'),strikeOuts:sum(usable,'strikeOuts'),baseOnBalls:sum(usable,'baseOnBalls')},seasons:[...new Set(usable.map(r=>r.season))]});
 }
 const factor=1+clamp(change,-.10,.10);
 return {...base,factor,applied:Math.abs(factor-1)>1e-9,after:basePoint*factor,note:'Supporting matchup scenario: handedness capped at ±7.5% and batter-vs-pitcher at ±2.5% of the full-game projection. Small samples shrink toward the batter’s overall rate. The new layer needs prospective calibration.'};
}
