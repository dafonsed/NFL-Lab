import { readFileSync } from 'node:fs';
import { MLB_MARKETS } from './markets.mjs';
import { MLB_MODEL_VERSION, forecastInputs, predictMean, design, countDistribution, lineProbabilities, predictionInterval } from './forecast-core.mjs';
import contextArtifact from '../artifacts/mlb-context.json' with {type:'json'};
import { mlbOpponent } from './context.mjs';
import { adjustedPoint,contextVector,contextEvidence } from '../context-model.mjs';

const artifact=JSON.parse(readFileSync(new URL('../artifacts/mlb-model.json',import.meta.url),'utf8'));
if(artifact.version!==MLB_MODEL_VERSION)throw Error('MLB model artifact version mismatch');
const round=x=>Number.isFinite(x)?Math.round(x*1000000)/1000000:null;
export function mlbModelReport(){return {...artifact,contextModel:contextArtifact};}
export function forecastHistory(person,completed){
  return (person?.stats||[]).filter(s=>s.type?.displayName==='gameLog').flatMap(s=>(s.splits||[]).filter(r=>r.gameType==='R'&&completed.has(r.game?.gamePk)&&(!r.sport||r.sport.id===1)).map(r=>({date:r.date,gameId:r.game.gamePk,role:s.group.displayName,stats:r.stat})));
}
export function attachMlbForecast(p,history,date,market,sources=[],context={}){
  const model=artifact.models[market],correction=contextArtifact.models[market],availability=context.availability||{status:'unavailable',stale:true},base={version:contextArtifact.version,artifactId:contextArtifact.id,baseArtifactId:artifact.id,trainedThrough:artifact.trainedThrough,unit:MLB_MARKETS[market].unit,point:null,probability:null,interval:null,eligible:false,availability,reasons:[]};
  if(availability.unavailable){p.forecast={...base,status:'unavailable',reasons:[`Reported ${availability.status}; projection withheld until availability is resolved.`]};p.reason=p.forecast.reasons[0];return p;}
  if(date<=artifact.trainedThrough){p.forecast={...base,status:'unavailable',reasons:['This date overlaps model development. Forecasts are available from 2025 onward.']};return p;}
  const input=forecastInputs(history,{date,home:p.home},market,model.prior);
  if(!input.available){p.forecast={...base,status:'unavailable',sampleCount:input.count,reasons:[`Needs ${input.minimum} prior ${p.role==='pitching'?'starts':'appearances'} in the same season and last 100 days; ${input.count} available.`]};return p;}
  const opponent=mlbOpponent(context.teamRows||[],{date,opponentId:p.opponentId},market,correction.leagueRate),weather=context.weather||{status:'unavailable',note:'No weather input'},x=contextVector(opponent,weather),basePoint=predictMean(input,model),shadowPoint=adjustedPoint(basePoint,x,correction,50),point=correction.enabled?shadowPoint:basePoint,dispersion=correction.enabled?correction.dispersion:model.dispersion,pmf=countDistribution(point,dispersion),probability=lineProbabilities(pmf,p.prop?.line),reasons=[];
  const modelContext={...contextEvidence(basePoint,point,opponent,weather,correction),shadowPoint,sourceReceipts:context.opponentSources||[]};
  if(!opponent.available)reasons.push('Insufficient opponent history; no matchup adjustment.');
  if(weather.status!=='available')reasons.push('Weather or roof status unavailable; no weather adjustment.');
  if(availability.concern)reasons.push(`Reported availability: ${availability.status}. Forecast assumes participation; no clear lean.`);
  if(availability.stale||availability.status==='unavailable')reasons.push('Current injury report unavailable.');
  if(!probability)reasons.push('No posted sportsbook total; no line probability or lean.');
  if(!['confirmed','starter','probable'].includes(p.lineupStatus))reasons.push(p.lineupStatus==='bench'?'Bench/substitute: a comparable full appearance is uncertain.':'Batting lineup is unconfirmed.');
  if(p.lineupStatus==='probable')reasons.push('Probable starter; check the official starting pitcher before game time.');
  if(input.count<(p.role==='pitching'?8:20))reasons.push('Limited current-season sample.');
  if(input.values.recentWorkload<input.values.longWorkload*0.7)reasons.push('Recent workload is at least 30% below the longer sample.');
  if(sources.some(s=>s.stale)||p.prop?.stale)reasons.push('A source is cached after a refresh failure.');
  if(p.gameType&&p.gameType!=='R')reasons.push('Postseason games were not included in validation.');
  if(probability&&Math.max(probability.over,probability.under)<0.6)reasons.push('Neither side reaches the fixed 60% research threshold.');
  if(p.abstractState!=='Preview')reasons.push('Historical/live reconstruction, not a frozen pregame prediction.');
  if(p.prop?.basis==='in_play')reasons.push('In-play total; this is a pregame model.');
  const z=design(input.x,model),terms=z.map((v,i)=>({feature:i?artifact.features[i-1]:'Intercept',standardizedInput:round(v),coefficient:round(model.coefficients[i]),logContribution:round(v*model.coefficients[i])}));
  p.forecast={...base,status:'available',point:round(point),interval:predictionInterval(pmf),probability:probability?Object.fromEntries(Object.entries(probability).map(([k,v])=>[k,round(v)])):null,line:p.prop?.line??null,sampleCount:input.count,recentCount:input.recentCount,inputs:input.values,gameIds:input.games,terms,modelContext,distribution:dispersion,reasons,eligible:reasons.length===0,lean:reasons.length===0?(probability.over>probability.under?'over':'under'):null,context:p.abstractState==='Preview'?'Current inputs; not a locked prediction':'Reconstructed from prior completed games'};
  const config=MLB_MARKETS[market],fmt=x=>Number(x.toFixed(2));
  p.reason=`Model projects ${fmt(point)} ${config.unit} using ${input.count} prior ${p.role==='pitching'?'starts':'appearances'}. Recent workload: ${fmt(input.values.recentWorkload)} ${input.values.exposureUnit}; observed production: ${input.values.observedTotal} ${config.unit} / ${input.values.observedExposure} ${input.values.exposureUnit}. `+(probability?`Estimated over ${p.prop.line}: ${Math.round(probability.over*100)}%; under: ${Math.round(probability.under*100)}%. `:'No posted line yet. ')+(reasons.length?reasons[0]:'Experimental model; 60% is a research threshold, not a proven edge.');
  return p;
}
