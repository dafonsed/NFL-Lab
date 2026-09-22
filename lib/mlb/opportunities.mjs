import { statValue } from './markets.mjs';
const sum=(xs,f)=>xs.reduce((s,x)=>s+f(x),0),mean=xs=>xs.length?sum(xs,x=>x)/xs.length:0;
const valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const OPPORTUNITY_VERSION='mlb-opportunities-v2';
export const slotAppearances=(teamPA,slot)=>Math.floor(Math.max(0,teamPA)/9)+(Math.max(0,teamPA)%9>=slot?1:0);
export function priorLogs(person,completed,date,role){
 return (person?.stats||[]).filter(s=>s.type?.displayName==='gameLog'&&s.group?.displayName===role).flatMap(s=>s.splits||[])
  .filter(r=>r.date<date&&r.gameType==='R'&&completed.has(r.game?.gamePk)&&(!r.sport||r.sport.id===1))
  .sort((a,b)=>b.date.localeCompare(a.date)||b.game.gamePk-a.game.gamePk);
}
export function starterWorkload(rows){
 const starts=rows.filter(r=>Number(r.stat.gamesStarted)===1&&Number(r.stat.battersFaced)>0).slice(0,20);
 if(starts.length<4)return {available:false,note:'Fewer than four completed starts; starter exposure unavailable.'};
 const recent=starts.slice(0,3),recentBF=mean(recent.map(r=>Number(r.stat.battersFaced))),pitched=starts.filter(r=>Number(r.stat.numberOfPitches)>0),recentPitches=recent.filter(r=>Number(r.stat.numberOfPitches)>0);
 const pitchBudget=recentPitches.length===3?mean(recentPitches.map(r=>Number(r.stat.numberOfPitches))):null;
 const bfPerPitch=pitched.length>=4?sum(pitched,r=>Number(r.stat.battersFaced))/sum(pitched,r=>Number(r.stat.numberOfPitches)):null;
 const expectedBF=pitchBudget&&bfPerPitch?clamp(pitchBudget*bfPerPitch,recentBF*.8,recentBF*1.2):recentBF;
 return {available:true,expectedBF,recentBF,pitchBudget,bfPerPitch,starts:starts.length,games:starts.map(r=>r.game.gamePk),note:'Recent three-start pitch budget × historical batters faced per pitch; no unreported coach restriction is assumed.'};
}
export function mlbOpportunities({player:p,date,market,input,context={},point}){
 const effects=[],teamRows=(context.teamRows||[]).filter(r=>r.date<date&&Number(r.stats.plateAppearances)>0),recent=rs=>rs.sort((a,b)=>b.date.localeCompare(a.date)||b.gameId-a.gameId).slice(0,20);
 let after=point,starterExposureFraction=null;
 const apply=(label,factor,note,detail={})=>{const before=after;after*=factor;effects.push({label,status:Math.abs(factor-1)>1e-6?'applied':'unchanged',factor,before,after,note,experimental:true,...detail});};
 const unavailable=(label,note)=>effects.push({label,status:'unavailable',factor:1,note});
 const clean=context.fresh!==false,pregame=!!context.pregame&&clean;
 const own=recent(teamRows.filter(r=>r.teamId===p.teamId)),allowed=recent(teamRows.filter(r=>r.opponentId===p.opponentId));
 const starter=starterWorkload(context.starterHistory||[]);
 if(p.role==='hitting'){
  let expectedPA=null;
  if(pregame&&p.lineupStatus==='confirmed'&&p.battingOrder>=1&&p.battingOrder<=9&&own.length>=5&&allowed.length>=5){
   expectedPA=(mean(own.map(r=>slotAppearances(Number(r.stats.plateAppearances),p.battingOrder)))+mean(allowed.map(r=>slotAppearances(Number(r.stats.plateAppearances),p.battingOrder))))/2;
   apply('Confirmed batting order → plate appearances',clamp(expectedPA/input.values.recentWorkload,.8,1.2),'Expected turns through the lineup from own-team and opponent-allowed PA distributions; replaces recent appearance workload. Capped at ±20%.',{slot:p.battingOrder,expectedPA,recentPA:input.values.recentWorkload,games:[...own,...allowed].map(r=>r.gameId)});
  }else unavailable('Confirmed batting order → plate appearances','Needs a fresh pregame confirmed lineup and five prior team games on each side. Historical actual lineups are not used.');
  if(starter.available){
   // Average over actual prior starter BF counts rather than flooring a mean.
   const starterPA=p.battingOrder>=1&&p.battingOrder<=9&&pregame?mean((context.starterHistory||[]).filter(r=>Number(r.stat.gamesStarted)===1&&Number(r.stat.battersFaced)>0).slice(0,3).map(r=>slotAppearances(Number(r.stat.battersFaced),p.battingOrder))):starter.expectedBF/9;
   starterExposureFraction=clamp(starterPA/(expectedPA||input.values.recentWorkload),0,1);
   effects.push({label:'Starter versus bullpen exposure',status:clean?'applied':'unavailable',factor:1,starterExposureFraction,...starter,note:'Starter share uses prior batters faced and confirmed lineup slot when available. Remaining opportunities are against the bullpen. '+starter.note});
  }else unavailable('Starter versus bullpen exposure',starter.note);
  const key={hr:'homeRuns',hits:'hits',bb:'baseOnBalls',batter_k:'strikeOuts'}[market];
  const sample=(context.starterHistory||[]).filter(r=>valid(r.stat[key])&&Number(r.stat.battersFaced)>0).slice(0,20),staff=allowed.filter(r=>valid(r.stats[key]));
  if(key&&clean&&starterExposureFraction!==null&&sample.length>=4&&staff.length>=5){
   const bf=sum(sample,r=>Number(r.stat.battersFaced)),staffPA=sum(staff,r=>Number(r.stats.plateAppearances)),staffRate=sum(staff,r=>Number(r.stats[key]))/staffPA;
   const rate=(sum(sample,r=>Number(r.stat[key]))+200*staffRate)/(bf+200);
   const factor=staffRate>0?1+starterExposureFraction*clamp(rate/staffRate-1,-.2,.2):1;
   apply('Individual starter quality',factor,'Starter allowed rate is compared with his own pitching staff, shrunk by 200 batters faced, and applied only to starter exposure. This avoids adding the full team matchup twice.',{starterRate:rate,staffRate,battersFaced:bf,starterExposureFraction,games:sample.map(r=>r.game.gamePk)});
  }else unavailable('Individual starter quality',key?'Insufficient verified starter/staff history.':'No separate starter-quality coefficient for this market.');
 }else{
  const workload=starterWorkload(context.playerHistory||[]);
  if(clean&&workload.available&&workload.pitchBudget&&workload.bfPerPitch)apply('Recent pitch budget → batters faced',clamp(workload.expectedBF/input.values.recentWorkload,.8,1.2),workload.note,workload);
  else unavailable('Recent pitch budget → batters faced','Verified pitch-count history unavailable; existing batters-faced forecast retained.');
  const lineup=(context.lineup||[]),key=market==='k'?'strikeOuts':market==='walks_allowed'?'baseOnBalls':null;
  const opponents=recent(teamRows.filter(r=>r.teamId===p.opponentId));
  if(key&&pregame&&lineup.length===9&&new Set(lineup.map(r=>r.id)).size===9&&opponents.length>=5&&opponents.every(r=>valid(r.stats[key]))){
   const teamRate=sum(opponents,r=>Number(r.stats[key]))/sum(opponents,r=>Number(r.stats.plateAppearances));
   const rates=lineup.map(b=>{const rows=b.rows.filter(r=>valid(r.stat[key])&&Number(r.stat.plateAppearances)>0).slice(0,60);const pa=sum(rows,r=>Number(r.stat.plateAppearances));return rows.length>=8?(sum(rows,r=>Number(r.stat[key]))+100*teamRate)/(pa+100):null;});
   if(rates.every(r=>r!==null)&&teamRate>0)apply('Confirmed opposing batting lineup',clamp(mean(rates)/teamRate,.85,1.15),'Nine confirmed batters’ stabilized per-PA rates relative to their team baseline; capped at ±15%.',{lineup:lineup.map(b=>b.id),lineupRate:mean(rates),teamRate});
   else unavailable('Confirmed opposing batting lineup','One or more confirmed batters lack eight prior appearances.');
  }else unavailable('Confirmed opposing batting lineup','Needs a fresh complete nine-batter lineup; not inferred from the final box score.');
 }
 return {after,effects,starterExposureFraction:clean?starterExposureFraction:null,experimental:effects.some(e=>e.status==='applied'&&e.factor!==1)};
}
