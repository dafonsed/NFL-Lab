import { MLB_MARKETS, finite, statValue } from './markets.mjs';
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const round=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
const fmt=x=>Number.isFinite(x)?String(Number(x.toFixed(2))):'—';
export function sampleFor(person, group, date, completed) {
  const rows=(person?.stats||[]).filter(s=>s.group?.displayName===group&&s.type?.displayName==='gameLog').flatMap(s=>s.splits||[]);
  const unique=new Map();
  for(const r of rows){
    if(!Number.isFinite(Date.parse(r.date))||r.date>=date||!completed.has(r.game?.gamePk)||!['R','F','D','L','W'].includes(r.gameType)||r.sport&&r.sport.id!==1)continue;
    if(group==='pitching'?Number(r.stat?.gamesStarted)!==1:!(finite(r.stat?.plateAppearances)>0))continue;
    unique.set(r.game.gamePk,r);
  }
  return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.game.gamePk-a.game.gamePk).slice(0,group==='pitching'?8:20);
}
export function buildMlbPlayer(candidate, person, completed, date, market, sources=[]) {
  const config=MLB_MARKETS[market],pitching=config.group==='pitching';
  const sample=sampleFor(person,config.group,date,completed).filter(s=>statValue(s.stat,market)!==null);
  const values=sample.map(s=>statValue(s.stat,market)),recent=values.slice(0,pitching?3:5),baseline=mean(values),recentMean=mean(recent);
  const projected=baseline===null?null:baseline*0.6+recentMean*0.4;
  const score=projected===null?null:Math.min(100,Math.max(0,projected/config.scale*100));
  const stats=sample.map(s=>s.stat),total=key=>stats.reduce((sum,s)=>sum+(finite(s[key])||0),0);
  const plateAppearances=total('plateAppearances'),atBats=total('atBats'),battersFaced=total('battersFaced');
  // Keep calculation inputs, not MLB's cumulative season fields, in the board.
  // A full slate must fit within the hosted function's response size limit.
  const keys=pitching?['gamesStarted','inningsPitched','outs','strikeOuts','baseOnBalls','hits','earnedRuns','battersFaced']:['plateAppearances','atBats','hits','doubles','triples','homeRuns','totalBases','runs','rbi','stolenBases','baseOnBalls','strikeOuts'];
  const logs=sample.map((s,i)=>({gameId:s.game.gamePk,date:s.date,opponent:s.opponent?.name,home:s.isHome,value:values[i],stats:Object.fromEntries(keys.filter(k=>s.stat[k]!==undefined).map(k=>[k,s.stat[k]])),url:`https://www.mlb.com/gameday/${s.game.gamePk}`}));
  return {...candidate,market,modelScore:round(score),projected:round(projected),baseline:round(baseline),recentMean:round(recentMean),sampleCount:sample.length,
    stats:pitching?{starts:sample.length,strikeoutsPerStart:mean(stats.map(s=>finite(s.strikeOuts)).filter(Number.isFinite)),outsPerStart:mean(stats.map(s=>statValue(s,'outs')).filter(Number.isFinite)),kRate:battersFaced?total('strikeOuts')/battersFaced:null,walkRate:battersFaced?total('baseOnBalls')/battersFaced:null,hitsPerStart:mean(stats.map(s=>finite(s.hits)).filter(Number.isFinite)),earnedRunsPerStart:mean(stats.map(s=>finite(s.earnedRuns)).filter(Number.isFinite))}:{appearances:sample.length,plateAppearances,battingAverage:atBats?total('hits')/atBats:null,slugging:atBats?total('totalBases')/atBats:null,hrRate:plateAppearances?total('homeRuns')/plateAppearances:null,kRate:plateAppearances?total('strikeOuts')/plateAppearances:null,walkRate:plateAppearances?total('baseOnBalls')/plateAppearances:null},
    logs,sources,reason:'',prop:null,result:mlbResult(candidate,market)};
}
export function mlbResult(candidate,market){
  const config=MLB_MARKETS[market],base={gameId:candidate.gameId,unit:config.unit,actual:null,over:null,under:null,source:'MLB official box score',sourceUrl:`https://www.mlb.com/gameday/${candidate.gameId}`};
  if(/postpon|cancel|suspend/i.test(candidate.gameState))return {...base,status:'unsettled'};
  if(candidate.abstractState!=='Final')return {...base,status:'pending'};
  if(!candidate.boxAvailable)return {...base,status:'no_stats'};
  const stats=candidate.gameStats;
  if(!stats||!Object.keys(stats).length||Number(stats.gamesPlayed)===0)return {...base,status:'did_not_play'};
  if(config.group==='pitching'&&Number(stats.gamesStarted)!==1)return {...base,status:'did_not_start'};
  if(config.group==='hitting'&&Number(stats.plateAppearances)===0)return {...base,status:'did_not_bat'};
  const actual=statValue(stats,market);return {...base,actual,status:actual===null?'no_stats':'final'};
}
export function explainAndGrade(p,market){
  const config=MLB_MARKETS[market],pitching=config.group==='pitching',period=pitching?'starts':'appearances';
  const hasLine=Number.isFinite(p.prop?.line),reference=hasLine?p.prop.line:['hr','hits','sb','doubles','singles','rbi','runs','bb'].includes(market)?0.5:null;
  const wins=reference===null?null:p.logs.filter(g=>g.value>reference).length,pushes=reference===null?0:p.logs.filter(g=>g.value===reference).length;
  p.sampleOver=reference===null||!p.logs.length?null:{line:reference,hits:wins,pushes,total:p.logs.length,rate:wins/p.logs.length,reference:hasLine?'posted_line':'1+ benchmark'};
  p.lean=hasLine&&p.sampleCount>=3?(p.projected>p.prop.line?'Over lean':p.projected<p.prop.line?'Under lean':'Near the line'):'Research profile';
  if(!p.sampleCount)p.reason='No completed MLB sample is available before this date. The model has no rating yet.';
  else {
    p.reason=`${fmt(p.baseline)} ${config.unit} per ${pitching?'start':'game'} over ${p.sampleCount} prior ${period}; ${fmt(p.recentMean)} across the last ${Math.min(p.sampleCount,pitching?3:5)}. `;
    p.reason+=hasLine?`Cleared ${p.prop.bookmaker}’s ${p.prop.line} in ${wins}/${p.sampleCount}; the recent-form baseline is ${p.projected>p.prop.line?'above':p.projected<p.prop.line?'below':'at'} that total.`:p.sampleOver?`Recorded 1+ in ${wins}/${p.sampleCount}. A sportsbook line is not posted yet.`:'A sportsbook line is not posted yet.';
    if(p.sampleCount<(pitching?4:8))p.reason+=' Small sample.';
    if(p.lineupStatus==='unconfirmed')p.reason+=' Lineup unconfirmed.';
  }
  if(p.result.status==='final'){
    const pre=p.prop?.basis==='captured_pregame'&&Date.parse(p.prop.fetchedAt)<Date.parse(p.startTime);
    if(!hasLine||(!pre&&p.prop.basis!=='published_archive'))p.result.status='no_line';
    else {const status=p.result.actual>p.prop.line?'over':p.result.actual<p.prop.line?'under':'push';Object.assign(p.result,{status,line:p.prop.line,over:status==='push'?'push':status==='over'?'hit':'miss',under:status==='push'?'push':status==='under'?'hit':'miss',basis:p.prop.basis});}
  }
  // Runtime-only box fields need not be duplicated in every board response.
  delete p.gameStats;delete p.boxAvailable;return p;
}
