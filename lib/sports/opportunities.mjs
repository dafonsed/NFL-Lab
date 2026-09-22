// Observed role and opportunity scenarios. These are not fitted causal effects.
import { numeric } from './normalize.mjs';
import { SPORTS,isBasketball } from './config.mjs';
const sum=(xs,f)=>xs.reduce((s,x)=>s+f(x),0), mean=xs=>xs.length?sum(xs,x=>x)/xs.length:0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function positionGroup(p,sport){
 const pos=String(p.position||'').toUpperCase();
 if(isBasketball(sport))return pos.includes('G')?'guard':pos.includes('C')?'center':'forward';
 if(pos==='G'||pos==='GK')return 'goalie';
 if(sport==='soccer')return /^(D|CB|LB|RB|LWB|RWB|DF)$/.test(pos)?'defense':/M/.test(pos)?'midfield':'attack';
 return pos==='D'?'defense':'attack';
}
export function roleMinutes({sport,player,history,baseMinutes,validation=false}){
 const neutral={label:'Confirmed playing role',status:'unavailable',minutes:baseMinutes,factor:1,note:'Starting role unconfirmed; recent playing time retained.'};
 if(validation||!player.lineupConfirmed)return neutral;
 const rows=history.flatMap(h=>{const r=h.players.find(r=>r.id===player.id&&r.teamId===player.teamId);return r&&numeric(r.minutes)!==null&&r.starter===player.starter?[r]:[];}).slice(0,10);
 if(rows.length<3)return {...neutral,note:'Fewer than three prior games in the confirmed role; recent playing time retained.'};
 const minutes=mean(rows.map(r=>r.minutes));
 return {...neutral,status:Math.abs(minutes-baseMinutes)>.01?'applied':'unchanged',minutes,factor:baseMinutes?minutes/baseMinutes:1,games:rows.map(r=>r.gameId),note:`${player.starter?'Confirmed starter':'Confirmed bench'}: mean minutes in ${rows.length} previous games in this role, including explicit bench DNPs.`,experimental:true};
}
export function absenceRate({sport,market,player,history,candidates=[],rate}){
 const neutral={label:'Teammate absence · production rate',status:'unchanged',factor:1,note:'No supported same-team with/without comparison.'};
 if(!isBasketball(sport))return {...neutral,status:'not_modeled',note:'Per-minute teammate effects are not inferred for this sport.'};
 const donors=candidates.filter(p=>p.teamId===player.teamId&&p.id!==player.id&&p.availability?.unavailable&&!p.availability.stale);
 if(!donors.length)return neutral;
 const withRows=[],withoutRows=[];
 for(const h of history){
  const r=h.players.find(p=>p.id===player.id&&p.teamId===player.teamId);
  if(!r||!(r.minutes>0)||!market.fields.every(k=>numeric(r.stats[k])!==null))continue;
  const ds=donors.map(d=>h.players.find(p=>p.id===d.id&&p.teamId===player.teamId));
  // Absent records do not establish DNP, and a donor on another team is not a comparison.
  if(ds.every(d=>d&&d.minutes===0))withoutRows.push(r);
  else if(ds.every(d=>d&&d.minutes>0))withRows.push(r);
 }
 if(withRows.length<3||withoutRows.length<2)return {...neutral,status:'unavailable',withGames:withRows.length,withoutGames:withoutRows.length,note:'Needs three games together and two explicitly recorded DNP games; no rate boost guessed.'};
 const production=rs=>sum(rs,r=>sum(market.fields,k=>r.stats[k])),exposure=rs=>sum(rs,r=>r.minutes);
 const withRate=production(withRows)/exposure(withRows),withoutRate=production(withoutRows)/exposure(withoutRows);
 // Target the absent-teammate rate directly, instead of adding a ratio to a
 // baseline which may already contain the absence. Historical evidence shrinks
 // toward the current baseline with eight appearances of prior exposure.
 const priorMinutes=8*mean(withRows.map(r=>r.minutes));
 const stabilized=(production(withoutRows)+rate*priorMinutes)/(exposure(withoutRows)+priorMinutes);
 const factor=rate>0?clamp(stabilized/rate,.75,1.25):1;
 return {label:neutral.label,status:Math.abs(factor-1)>1e-6?'applied':'unchanged',factor,withRate,withoutRate,priorMinutes,withGames:withRows.length,withoutGames:withoutRows.length,gameIds:withoutRows.map(r=>r.gameId),donors:donors.map(d=>({id:d.id,player:d.player})),experimental:true,note:'Observed production per minute without these teammates, shrunk toward the baseline. Can increase or decrease production; capped at ±25%. Not a causal or calibrated injury coefficient.'};
}
export function opportunityRate({sport,market,rows,pool,baseRate}){
 const neutral={label:'Shot opportunities and conversion',status:'not_modeled',rate:baseRate,factor:1,note:'This market uses the stabilized production rate.'};
 const components=isBasketball(sport)&&market==='points'?[['Two-point attempts','fieldGoalsAttempted','fieldGoalsMade',2,'threePointFieldGoalsAttempted','threePointFieldGoalsMade'],['Three-point attempts','threePointFieldGoalsAttempted','threePointFieldGoalsMade',3],['Free-throw attempts','freeThrowsAttempted','freeThrowsMade',1]]:isBasketball(sport)&&market==='threes'?[['Three-point attempts','threePointFieldGoalsAttempted','threePointFieldGoalsMade',1]]:sport==='nhl'&&market==='goals'?[['Shots on goal','shotsTotal','goals',1]]:sport==='soccer'&&market==='goals'?[['Shots on target','shotsOnTarget','totalGoals',1]]:null;
 if(!components)return neutral;
 const parts=[];
 for(const [label,attempt,made,value,subtractAttempt,subtractMade] of components){
  const valid=r=>r.minutes>0&&[attempt,made,subtractAttempt,subtractMade].filter(Boolean).every(k=>numeric(r.stats[k])!==null);
  const history=rows.filter(valid),prior=pool.filter(valid);
  if(history.length<5||!prior.length)return {...neutral,status:'unavailable',note:'Attempt/conversion fields incomplete; production-rate model retained.'};
  const a=r=>r.stats[attempt]-(subtractAttempt?r.stats[subtractAttempt]:0),m=r=>r.stats[made]-(subtractMade?r.stats[subtractMade]:0);
  if([...history,...prior].some(r=>a(r)<0||m(r)<0||m(r)>a(r)))return {...neutral,status:'unavailable',note:'Inconsistent attempt/conversion totals; base rate retained.'};
  const recent=history.slice(0,5),historicalAttempts=sum(history,a),poolAttempts=sum(prior,a),poolMinutes=sum(prior,r=>r.minutes);
  const priorMinutes=5*mean(history.map(r=>r.minutes)),attemptRate=(sum(recent,a)+priorMinutes*(historicalAttempts/sum(history,r=>r.minutes)))/(sum(recent,r=>r.minutes)+priorMinutes);
  const priorAttempts=poolMinutes?priorMinutes*poolAttempts/poolMinutes:0;
  const conversion=(sum(history,m)+(poolAttempts?sum(prior,m)/poolAttempts:0)*priorAttempts)/(historicalAttempts+priorAttempts||1);
  parts.push({label,attemptRate,conversion,value,rate:attemptRate*conversion*value,games:history.length});
 }
 const rate=sum(parts,p=>p.rate),factor=baseRate>0?clamp(rate/baseRate,.75,1.25):1;
 return {label:neutral.label,status:Math.abs(factor-1)>1e-6?'applied':'unchanged',rate:baseRate*factor,factor,parts,experimental:true,note:'Recent shot/attempt volume × stabilized conversion; replaces the generic rate for this market, bounded to ±25%. Shot location/quality is not supplied.'};
}
export function opposingGoalie({sport,market,player,history,candidates=[]}){
 const neutral={label:'Confirmed opposing goalkeeper',status:'not_applicable',factor:1,note:'Opponent goalkeeper adjustment applies only to goals.'};
 if(!['nhl','soccer'].includes(sport)||!['goals','team_goals'].includes(market))return neutral;
 const starters=candidates.filter(p=>p.teamId===player.opponentId&&positionGroup(p,sport)==='goalie'&&p.starter&&p.lineupConfirmed&&!p.availability?.unavailable&&!p.availability?.stale);
 if(starters.length!==1)return {...neutral,status:'unavailable',note:'Opposing starting goalkeeper is not uniquely confirmed; no goalie effect guessed.'};
 const key=sport==='nhl'?'goalsAgainst':'goalsConceded';
 const pool=history.flatMap(h=>h.players.filter(p=>p.teamId===player.opponentId&&positionGroup(p,sport)==='goalie'&&p.minutes>0&&numeric(p.stats[key])!==null&&numeric(p.stats.saves)!==null));
 const sample=pool.filter(p=>p.id===starters[0].id),shots=rs=>sum(rs,r=>r.stats.saves+r.stats[key]);
 if(sample.length<5||shots(pool)<=0)return {...neutral,status:'unavailable',note:'Fewer than five verified goalie appearances; team matchup retained.'};
 const teamRate=sum(pool,r=>r.stats[key])/shots(pool),priorShots=sport==='nhl'?300:50,rate=(sum(sample,r=>r.stats[key])+priorShots*teamRate)/(shots(sample)+priorShots),factor=teamRate>0?clamp(rate/teamRate,.8,1.2):1;
 return {label:neutral.label,status:Math.abs(factor-1)>1e-6?'applied':'unchanged',factor,player:starters[0].player,playerId:starters[0].id,games:sample.map(p=>p.gameId),shots:shots(sample),rate,teamRate,priorShots,experimental:true,note:'Confirmed goalie’s goals conceded per on-target shot relative to his own team’s goalies, stabilized with prior shots. Shot quality is unavailable; this is not goals saved above expected.'};
}
export function teamMinuteBudgets(candidates,history,sport,impacts=new Map()){
 const result=new Map();if(!isBasketball(sport))return result;
 const duration=SPORTS[sport].duration,maximum=SPORTS[sport].maximumMinutes||44;
 for(const teamId of new Set(candidates.map(p=>p.teamId))){
  const teamGames=history.flatMap(h=>h.teams.filter(t=>t.id===teamId&&t.minutes>=duration*5-5&&t.minutes<=duration*5+50)).slice(0,10);
  if(teamGames.length<5)continue;
  // Observed team minutes retain the historical overtime allowance. Never
  // fill unused minutes by inventing extra production for the known players.
  const budget=mean(teamGames.map(t=>t.minutes)),projected=[];
  for(const p of candidates.filter(p=>p.teamId===teamId&&!p.availability?.unavailable)){
   const rows=history.flatMap(h=>h.players.filter(r=>r.id===p.id&&r.minutes>0)).slice(0,20);if(rows.length<5)continue;
   const baseline=.6*mean(rows.slice(0,5).map(r=>r.minutes))+.4*mean(rows.map(r=>r.minutes)),role=roleMinutes({sport,player:p,history,baseMinutes:baseline});
   projected.push({id:p.id,minutes:clamp(role.status==='applied'?role.minutes:baseline+(impacts.get(p.id)?.delta||0),0,maximum)});
  }
  const total=sum(projected,p=>p.minutes),factor=total>budget?budget/total:1;
  for(const p of projected)result.set(p.id,{label:'Team playing-time budget',status:factor<1?'applied':'unchanged',factor,budget,totalBefore:total,totalAfter:total*factor,games:teamGames.length,note:'Combined active-roster minutes cannot exceed the team’s observed minutes per game, including its historical overtime allowance. Unallocated minutes are not invented.',experimental:true});
 }
 return result;
}
