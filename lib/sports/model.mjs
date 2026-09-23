import { SPORTS,isBasketball } from './config.mjs';
import { numeric } from './normalize.mjs';
import { countDistribution,lineProbabilities,predictionInterval } from '../mlb/forecast-core.mjs';
import { positionGroup, roleMinutes, absenceRate, opportunityRate, opposingGoalie } from './opportunities.mjs';
import opportunityValidation from '../artifacts/opportunity-validation.json' with {type:'json'};
import wnbaValidation from '../artifacts/wnba-validation.json' with {type:'json'};
export const modelVersion=sport=>sport==='wnba'?wnbaValidation.version:MODEL_VERSION;
export const modelEvidence=sport=>sport==='wnba'?wnbaValidation:null;
export const MODEL_VERSION='multi-sport-opportunities-v2';
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:0;
const sum=(xs,fn)=>xs.reduce((s,x)=>s+fn(x),0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=x=>Number.isFinite(x)?Math.round(x*10000)/10000:null;
const display=x=>Number(x.toFixed(2));
export const value=(stats,market)=>market.fields.every(k=>numeric(stats?.[k])!==null)?sum(market.fields,k=>numeric(stats[k])):null;
const goalie=p=>p.position==='G'||p.position==='GK';
const group=positionGroup;
export function historyBefore(history,target){return history.filter(h=>h.game.complete&&h.game.date<target.date&&Date.parse(target.date)-Date.parse(h.game.date)<450*86400000).sort((a,b)=>b.game.date.localeCompare(a.game.date));}
export function injuryWorkloads(candidates,history,sport){
 const result=new Map(),config=SPORTS[sport];
 for(const teamId of new Set(candidates.map(p=>p.teamId))){
  const games=history.filter(h=>h.teams.some(t=>t.id===teamId)).slice(0,3);
  if(games.length<3)continue;
  const usage=id=>mean(games.map(h=>h.players.find(p=>p.id===id)?.minutes||0));
  const donors=candidates.filter(p=>p.teamId===teamId&&p.availability?.unavailable&&!p.availability.stale&&usage(p.id)>0);
  for(const role of new Set(donors.map(p=>group(p,sport)))){
   const missing=donors.filter(p=>group(p,sport)===role),vacant=sum(missing,p=>usage(p.id));
   const eligible=candidates.filter(p=>p.teamId===teamId&&group(p,sport)===role&&!p.availability?.unavailable&&!p.availability?.concern&&!p.availability?.stale&&usage(p.id)>0);
   if(role==='goalie'||sport==='soccer')continue; // Starting XI / goalie identity is required; do not invent a replacement.
   const total=sum(eligible,p=>usage(p.id));
   for(const p of eligible){
    const without=history.filter(h=>{const r=h.players.find(r=>r.id===p.id);return r?.teamId===teamId&&r.minutes>0&&missing.every(d=>{const x=h.players.find(r=>r.id===d.id);return x?.teamId===teamId&&x.minutes===0;});});
    const historical=without.length>=2?Math.max(0,mean(without.map(h=>h.players.find(r=>r.id===p.id).minutes))-usage(p.id)):0;
    const weight=without.length>=2?without.length/(without.length+8):0,roleShare=total?vacant*.25*usage(p.id)/total:0;
    const delta=Math.min(weight*historical+(1-weight)*roleShare,roleShare*2,usage(p.id)*.2,isBasketball(sport)?SPORTS[sport].duration/48*5:2);
    result.set(p.id,{delta:round(delta),vacant:round(vacant),donors:missing.map(d=>({id:d.id,player:d.player,status:d.availability.status,sourceUrl:d.availability.sourceUrl})),withoutGames:without.map(h=>h.game.id),method:weight?'Verified DNP history shrunk toward recent role':'25% of vacated same-role minutes, allocated by recent usage',experimental:true});
   }
  }
 }
 return result;
}
export function predict({sport,market:marketKey,player,target,history,weather={},injury=null,prop=null,stale=false,validation=false,candidates=[],upgrades=true,evaluateCandidates=false,minuteBudget=null}){
 const config=SPORTS[sport],market=config.markets[marketKey],allPast=historyBefore(history,target),sameCompetition=allPast.filter(h=>h.game.competition===target.competition),competitionScoped=sport==='soccer'&&!!target.competition&&sameCompetition.filter(h=>h.players.some(p=>p.id===player.id)||market.team&&h.teams.some(t=>t.id===player.id)).length>=config.minimum,past=competitionScoped?sameCompetition:allPast,teamMarket=market.team;
 const rows=past.flatMap(h=>{const r=(teamMarket?h.teams:h.players).find(r=>r.id===player.id);return r&&value(r.stats,market)!==null&&(teamMarket||r.minutes>0)?[{...r,date:h.game.date,gameId:h.game.id,opponentId:r.opponentId,opponent:(h.game.home?.id===(r.teamId||r.id)?h.game.away:h.game.home)?.code,url:h.sourceUrl,actual:value(r.stats,market),minutes:teamMarket?config.duration:r.minutes}]:[];}).slice(0,20);
 const base={version:modelVersion(sport),status:'unavailable',point:null,probability:null,lean:null,eligible:false,sampleCount:rows.length,availability:player.availability,injury,weather,reasons:[],sample:rows.map(r=>({gameId:r.gameId,date:r.date,opponent:r.opponent,opponentId:r.opponentId,url:r.url,value:r.actual,minutes:round(r.minutes),home:r.home,stats:r.stats}))};
 if(player.availability?.unavailable)return {...base,reasons:['Reported '+player.availability.status+'; player forecast withheld.']};
 if(!validation&&market.goalie&&player.lineupConfirmed&&!player.starter)return {...base,reasons:['Confirmed starting lineup names another goalkeeper/goalie; forecast withheld.']};
 if(rows.length<config.minimum)return {...base,reasons:[`Needs ${config.minimum} prior completed ${teamMarket?'team games':'appearances'}; ${rows.length} available.`]};
 const pool=past.flatMap(h=>(teamMarket?h.teams:h.players).filter(p=>value(p.stats,market)!==null&&(teamMarket||p.minutes>0&&group(p,sport)===group(player,sport))));
 const poolExposure=sum(pool,p=>teamMarket?config.duration:p.minutes),priorRate=poolExposure?sum(pool,p=>value(p.stats,market))/poolExposure:0;
 const exposure=sum(rows,r=>r.minutes),production=sum(rows,r=>r.actual),priorMinutes=mean(rows.map(r=>r.minutes))*5,rate=(production+priorMinutes*priorRate)/(exposure+priorMinutes);
 const recent=rows.slice(0,5),baseMinutes=.6*mean(recent.map(r=>r.minutes))+.4*mean(rows.map(r=>r.minutes));
 const role=roleMinutes({sport,player,history:past,baseMinutes,validation:validation||!upgrades||teamMarket});
 // A confirmed new role already contains the minute change; do not add an
 // absence allocation a second time on top of that role's observed minutes.
 let workload=role.status==='applied'?role.minutes:baseMinutes+(injury?.delta||0);
 if(!upgrades&&sport==='soccer'&&!teamMarket&&player.starter){const starts=rows.filter(r=>r.starter);if(starts.length>=3)workload=.7*mean(starts.slice(0,5).map(r=>r.minutes))+.3*baseMinutes;}
 workload=clamp(workload,0,teamMarket?config.duration:isBasketball(sport)?(config.maximumMinutes||44):sport==='nhl'?goalie(player)?60:32:90);
 workload*=minuteBudget?.factor??1;
 const rawShot=opportunityRate({sport,market:marketKey,rows,pool,baseRate:rate}),shotCheck=(sport==='wnba'?wnbaValidation.markets[marketKey]?.shot:opportunityValidation.markets[sport+':'+marketKey]);
 const shot=['applied','unchanged'].includes(rawShot.status)&&!evaluateCandidates&&!shotCheck?.enabled?{...rawShot,rate,factor:1,shadowRate:rawShot.rate,status:'validation_disabled',validation:shotCheck,note:'Attempt/conversion candidate did not improve both absolute error and probability error in the saved chronological diagnostic. Original rate retained; candidate inputs remain visible.'}:{...rawShot,validation:shotCheck};
 const usage=absenceRate({sport,market,player,history:past,candidates:!validation&&!stale?candidates:[],rate:upgrades?shot.rate:rate});
 const keeper=opposingGoalie({sport,market:marketKey,player,history:past,candidates:!validation&&!stale?candidates:[]});
 const adjustedRate=upgrades?shot.rate*usage.factor*keeper.factor:rate;
 const basePoint=rate*baseMinutes,unadjusted=adjustedRate*workload,teamHist=past.flatMap(h=>h.teams.map(t=>({...t,date:h.game.date,opponent:h.teams.find(x=>x.id!==t.id),gameId:h.game.id}))),opponents=teamHist.filter(t=>t.id===player.opponentId).slice(0,15);
 const allowed=t=>{if(market.goalie)return numeric(t.stats[sport==='nhl'?'shotsTotal':'shotsOnTarget']);return value(t.opponent?.stats,market);};
 const usable=opponents.filter(t=>allowed(t)!==null),all=teamHist.filter(t=>allowed(t)!==null);
 const league=mean(all.map(allowed)),opponentRate=league?(sum(usable,allowed)+8*league)/(usable.length+8):null;
 let opponentFactor=usable.length>=5&&league>0?clamp(opponentRate/league,.85,1.15):1,paceFactor=1;
 if(isBasketball(sport)){
  const own=teamHist.filter(t=>t.id===player.teamId&&t.pace>0).slice(0,15),opp=opponents.filter(t=>t.pace>0),typical=mean(all.filter(t=>t.pace>0).map(t=>t.pace));
  if(own.length>=5&&opp.length>=5&&typical){const recentPace=mean(own.map(t=>t.pace));paceFactor=clamp((recentPace+mean(opp.map(t=>t.pace)))/2/recentPace,.92,1.08);const paceRatio=mean(opp.map(t=>t.pace))/typical;opponentFactor=clamp(opponentFactor/paceRatio,.85,1.15);}
 }
 const venueRows=rows.filter(r=>r.home===player.home),overallRate=production/exposure;
 const venueRate=venueRows.length>=4?(sum(venueRows,r=>r.actual)+priorMinutes*overallRate)/(sum(venueRows,r=>r.minutes)+priorMinutes):overallRate;
 const homeFactor=overallRate>0?clamp(1+.25*(venueRate/overallRate-1),.95,1.05):1;
 const teamGames=past.filter(h=>h.teams.some(t=>t.id===player.teamId)),restDays=teamGames.length?(Date.parse(target.date)-Date.parse(teamGames[0].game.date))/86400000:null,shortRest=restDays!==null&&restDays<(sport==='soccer'?3:1.5);
 const restRows=rows.filter(r=>{const prior=teamGames.find(h=>h.game.date<r.date);return prior&&(Date.parse(r.date)-Date.parse(prior.game.date))/86400000<(sport==='soccer'?3:1.5);});
 const restRate=restRows.length>=3?(sum(restRows,r=>r.actual)+priorMinutes*overallRate)/(sum(restRows,r=>r.minutes)+priorMinutes):overallRate,restFactor=shortRest&&overallRate?clamp(1+.25*(restRate/overallRate-1),.95,1.05):1;
 let weatherFactor=1;
 if(sport==='soccer'&&weather.status==='available'&&!weather.indoor&&['shots','sot','goals','assists','team_goals'].includes(marketKey))weatherFactor=(weather.windMph>=25?.95:1)*(weather.temperatureF>=95||weather.temperatureF<=25?.97:1);
 // PP exposure is real NHL usage, but remains a modest supporting factor.
 const ppLong=mean(rows.map(r=>r.stats.powerPlayTimeOnIce||0)),ppRecent=mean(recent.map(r=>r.stats.powerPlayTimeOnIce||0));
 const powerPlayFactor=sport==='nhl'&&['shots','goals','assists','points'].includes(marketKey)&&ppLong>.5?clamp(1+.1*(ppRecent/ppLong-1),.95,1.05):1;
 const factor=clamp(opponentFactor*paceFactor*homeFactor*restFactor*weatherFactor*powerPlayFactor,.7,1.3),point=Math.max(.0001,unadjusted*factor);
 const observedMean=mean(rows.map(r=>r.actual)),variance=mean(rows.map(r=>(r.actual-observedMean)**2)),alpha=observedMean?clamp((variance-observedMean)/(observedMean**2),0,2):0;
 const distribution={family:alpha>0?'negative-binomial':'poisson',alpha},pmf=countDistribution(point,distribution),probability=lineProbabilities(pmf,prop?.line),benchmark=lineProbabilities(pmf,market.benchmark),reasons=[];
 const inputEffects=[...(minuteBudget?[minuteBudget]:[]),role,shot,usage,keeper,{label:'Competition-specific history',status:sport==='soccer'?(competitionScoped?'applied':'unavailable'):'not_applicable',note:competitionScoped?'Only earlier games in the selected competition enter player rates and opponent comparisons.':'Not enough same-competition history; mixed-competition sample retained and strength differences are not modeled.'}];
 if(!validation){
  if(rows.length&&Date.parse(target.date)-Date.parse(rows[0].date)>60*86400000)reasons.push('Most recent appearance is over 60 days old; offseason role and fitness are unverified.');
  reasons.push('New model: prospective calibration pending; no automatic betting lean.');
  if(target.state!=='pre')reasons.push('Historical/live reconstruction; current lineups and injuries are not used as pregame evidence.');
  if(player.availability?.stale||player.availability?.status==='Unknown')reasons.push('Current availability could not be verified.');
  if(player.availability?.concern)reasons.push('Availability concern: '+player.availability.status+'.');
  if(!teamMarket&&!player.starter)reasons.push(market.goalie?'Starting goalkeeper/goalie is unconfirmed.':'Starting lineup is unconfirmed; forecast assumes recent role.');
  if(stale)reasons.push('One or more sources are unavailable or stale.');
  if(weather.status!=='available'&&weather.status!=='not_applicable')reasons.push('Weather/roof input unavailable; no weather adjustment.');
  if(!prop)reasons.push('No verified posted total; research thresholds are not sportsbook lines.');
  if(sport==='wnba'&&player.availability?.detail)reasons.push('Availability report: '+player.availability.detail);
  if(sport==='wnba')reasons.push('Individual defender assignments, tracking-derived assist/rebound chances and unannounced minutes restrictions are not supplied.');
  if(sport==='soccer')reasons.push('Player xG, individual defender assignments and penalty-taker confirmation are not supplied by this feed.');
  if(sport==='nhl')reasons.push('Shot-quality xG and confirmed line combinations are not supplied by this feed.');
  if(target.seasonType===1&&sport!=='soccer')reasons.push('Preseason rotations are uncertain; regular-season model is not validated for preseason.');
 }
 return {...base,status:'available',point:round(point),basePoint:round(basePoint),originalPoint:round(basePoint*factor),probability,inputEffects,benchmark:{line:market.benchmark,probability:benchmark,label:'Research threshold, not a sportsbook line'},interval:predictionInterval(pmf),distribution,reasons,inputs:{production,exposure:round(exposure),priorRate:round(priorRate),priorMinutes:round(priorMinutes),rate:round(adjustedRate),originalRate:round(rate),baseMinutes:round(baseMinutes),projectedMinutes:round(workload),restDays:round(restDays),shortRest,powerPlayMinutes:round(ppRecent)},effects:{opponent:{factor:round(opponentFactor),games:usable.length,rate:round(opponentRate),comparison:round(league)},pace:{factor:round(paceFactor)},venue:{factor:round(homeFactor),sample:venueRows.length},rest:{factor:round(restFactor),sample:restRows.length},powerPlay:{factor:round(powerPlayFactor)},weather:{factor:round(weatherFactor)}},baseline:round(mean(recent.map(r=>r.actual))),explanation:`${rows.length} prior appearances: ${display(production)} ${market.label.toLowerCase()} in ${display(exposure)} minutes. Projected workload ${display(workload)} minutes × rate ${round(adjustedRate)}, with opponent, venue, rest${isBasketball(sport)?', pace':sport==='nhl'?', power-play usage':', weather'} adjustments.${usage.status==='applied'?' Teammate absence also changes production per minute.':''}`};
}
export function backtest({sport,market,history}){
 const ordered=[...history].sort((a,b)=>a.game.date.localeCompare(b.game.date)),tests=ordered.slice(-5),config=SPORTS[sport].markets[market],results=[];
 for(const target of tests){const candidates=config.team?target.teams.map(t=>({...t,teamId:t.id,player:t.id,position:'TEAM'})):target.players.filter(p=>p.minutes>0&&(config.goalie?goalie(p):isBasketball(sport)||!goalie(p)));
  for(const p of candidates){const y=value(p.stats,config);if(y===null)continue;const f=predict({sport,market,player:{...p,starter:false},target:target.game,history:ordered,validation:true});if(f.point===null)continue;const prob=f.benchmark.probability.over;results.push({date:target.game.date,gameId:target.game.id,playerId:p.id,actual:y,predicted:f.point,baseline:f.baseline,brier:(prob-Number(y>config.benchmark))**2,covered:y>=f.interval[0]&&y<=f.interval[1]});}
 }
 return {n:results.length,games:new Set(results.map(r=>r.gameId)).size,mae:results.length?round(mean(results.map(r=>Math.abs(r.predicted-r.actual)))):null,baselineMae:results.length?round(mean(results.map(r=>Math.abs(r.baseline-r.actual)))):null,brier:results.length?round(mean(results.map(r=>r.brier))):null,intervalCoverage:results.length?round(mean(results.map(r=>Number(r.covered)))):null,threshold:config.benchmark,method:'Rolling checks on the last five fetched games: every prediction uses only earlier completed games. This is a small matchup-specific diagnostic, not a league-wide holdout or profitability test. Current injuries, actual starting status and weather are not historical pregame inputs.',rows:results};
}
export function resultFor(player,game,market){if(!game.complete)return {status:'pending',actual:null};if(game.extraTime)return {status:'needs_regulation_stats',actual:null};if(!player)return {status:'missing',actual:null};if(player.minutes===0)return {status:'did_not_play',actual:null};const actual=value(player.stats,market);return {status:actual===null?'missing':'final',actual};}
