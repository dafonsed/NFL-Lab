import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MlbProvider, MLB_API } from '../lib/mlb/provider.mjs';
import { Provider } from '../lib/providers.mjs';
import { MLB_MARKETS,statValue } from '../lib/mlb/markets.mjs';
import { MARKETS } from '../lib/markets.mjs';
import { forecastInputs,predictMean,countDistribution,lineProbabilities,BENCHMARKS } from '../lib/mlb/forecast-core.mjs';
import { teamGameRows,mlbOpponent,opponentPrior } from '../lib/mlb/context.mjs';
import { nflOpponent } from '../lib/nfl-context.mjs';
import { project,priorSample,targetValue } from '../lib/forecast.mjs';
import { observedWeather } from '../lib/weather.mjs';
import { CONTEXT_FEATURES,contextVector,fitContext,adjustedPoint } from '../lib/context-model.mjs';

// Predeclared protocol: 2023 coefficient fitting, 2024 penalty selection and
// distribution calibration, 2025 comparison. No choices depend on 2025 scores.
// 2025 was inspected for v1, so this is a reused test set, not a fresh holdout.
const lambdas=[.001,.01,.1,1],round=x=>Math.round(x*1e6)/1e6;
const hash=a=>createHash('sha256').update(JSON.stringify(a)).digest('hex');
const metadata={generatedAt:new Date().toISOString(),features:CONTEXT_FEATURES,split:{priors:2022,training:2023,selectionAndCalibration:2024,test:2025},limitations:[
  'Historical weather is the reported game observation, not an archived forecast available before game time. This evaluation cannot establish the benefit of live forecast weather.',
  'A correction is enabled only if both MAE and MSE beat the base on 2024; otherwise it is saved as a shadow comparison with no effect on displayed projections. This gate was added after initial diagnostics; 2025 remains a reused test.',
  '2025 is reused after the base-model evaluation. It is an out-of-training comparison, not a new untouched test; prospective results are required.',
  'Injuries change forecast availability and lean eligibility; no unvalidated numerical injury penalty is applied. Historical injury status is not fabricated.',
  'Opponent team/position context does not include individual defender absences, handedness, batting order, park factors or a separately modeled opposing starter.',
  'These statistical comparisons are not betting returns. Future one-unit paper returns require an immutable pregame price and model selection.'
]};
function select(rows,max){const error=(r,m)=>r.reduce((s,x)=>s+(adjustedPoint(x.base,x.x,m,max)-x.y)**2,0)/r.length;return lambdas.map(l=>{const model=fitContext(rows[2023],l);return {...model,selectionMse:error(rows[2024],model)};}).sort((a,b)=>a.selectionMse-b.selectionMse)[0];}
function compare(rows,model,max){let old=0,ae=0,se=0;for(const r of rows){const p=adjustedPoint(r.base,r.x,model,max);old+=Math.abs(r.base-r.y);ae+=Math.abs(p-r.y);se+=(p-r.y)**2;}return {n:rows.length,baseMAE:round(old/rows.length),contextMAE:round(ae/rows.length),contextRMSE:round(Math.sqrt(se/rows.length)),maeImprovementPercent:round((old-ae)/old*100)};}
if(!process.argv.includes('--nfl-only')){
  const base=JSON.parse(await fs.readFile('lib/artifacts/mlb-model.json','utf8')),provider=new MlbProvider();
  const seasons=await Promise.all([2022,2023,2024,2025].map(async y=>JSON.parse(await fs.readFile(`data-independent/mlb-training/${y}.json`,'utf8'))));
  const schedules=await Promise.all(seasons.map(s=>provider.read(`${MLB_API}/schedule?${new URLSearchParams({sportId:'1',season:s.season,gameType:'R',hydrate:'weather,venue(location,fieldInfo)'})}`,{ttl:86400000*365})));
  const weather=new Map(schedules.flatMap(d=>(d.payload.dates||[]).flatMap(day=>day.games).map(g=>[g.gamePk,observedWeather({roof:g.venue?.fieldInfo?.roofType,condition:g.weather?.condition,temperatureF:g.weather?.temp,windMph:g.weather?.wind?.match(/^\d+(?:\.\d+)?/)?.[0],sourceUrl:d.url})])));
  const teams=new Map(seasons.map(s=>[s.season,teamGameRows(s.rows)])),artifact={...metadata,version:'mlb-context-v2',baseModelId:base.id,trainedThrough:'2024-12-31',models:{},report:{},sources:schedules.map(({url,fetchedAt,sha256})=>({url,fetchedAt,sha256}))};
  for(const [market,config] of Object.entries(MLB_MARKETS)){
    const leagueRate=opponentPrior(teams.get(2022),market),datasets={};
    for(const s of seasons.slice(1)){
      const history=new Map(),result=[],indexed=new Map();
      for(const t of teams.get(s.season)){const key=config.group==='pitching'?t.teamId:t.opponentId;(indexed.get(key)||indexed.set(key,[]).get(key)).push(t);}
      for(const r of s.rows.filter(r=>r.role===config.group)){
        const past=history.get(r.playerId)||[],input=forecastInputs(past,r,market,base.models[market].prior),y=statValue(r.stats,market);
        if(input.available&&y!==null){const opponent=mlbOpponent(indexed.get(r.opponentId)||[],r,market,leagueRate),w=weather.get(r.gameId);result.push({base:predictMean(input,base.models[market]),x:contextVector(opponent,w),y,weatherAvailable:w?.status==='available',opponentAvailable:opponent.available});}
        past.push(r);history.set(r.playerId,past.slice(-65));
      }datasets[s.season]=result;
    }
    const model={...select(datasets,50),leagueRate},validation=datasets[2024].map(r=>({y:r.y,mu:adjustedPoint(r.base,r.x,model,50)}));
    const alpha=Math.max(0,validation.reduce((s,r)=>s+(r.y-r.mu)**2-r.y,0)/validation.reduce((s,r)=>s+r.mu*r.mu,0));
    const factor=validation.reduce((s,r)=>s+(r.y-r.mu)**2/Math.max(.05,r.mu),0)/validation.length;
    const families=[{family:'poisson'},...(alpha>0?[{family:'negative-binomial',alpha}]:[]),...(market==='outs'?[{family:'normal',factor}]:[])];
    model.dispersion=families.map(d=>({d,nll:validation.reduce((s,r)=>s-Math.log(Math.max(1e-12,countDistribution(r.mu,d)[r.y]||0)),0)/validation.length})).sort((a,b)=>a.nll-b.nll)[0].d;
    const validationResult=compare(datasets[2024],model,50);model.enabled=validationResult.maeImprovementPercent>0&&model.selectionMse<datasets[2024].reduce((s,r)=>s+(r.base-r.y)**2,0)/datasets[2024].length;
    const test=datasets[2025],benchmarks={};
    for(const line of BENCHMARKS[market]){let a=0,b=0;for(const r of test){const actual=Number(r.y>line),p=lineProbabilities(countDistribution(adjustedPoint(r.base,r.x,model,50),model.dispersion),line).over,q=lineProbabilities(countDistribution(r.base,base.models[market].dispersion),line).over;a+=(p-actual)**2;b+=(q-actual)**2;}benchmarks[line]={contextBrier:round(a/test.length),baseBrier:round(b/test.length),n:test.length};}
    artifact.models[market]=model;artifact.report[market]={...compare(test,model,50),label:config.label,benchmarks,validation:compare(datasets[2024],model,50),weatherAvailable:test.filter(r=>r.weatherAvailable).length,opponentAvailable:test.filter(r=>r.opponentAvailable).length};
    console.log(JSON.stringify({sport:'mlb',market,...artifact.report[market],benchmarks:undefined}));
  }
  artifact.id=hash(artifact);await fs.writeFile('lib/artifacts/mlb-context.json',JSON.stringify(artifact));
}
if(!process.argv.includes('--mlb-only')){
  const provider=new Provider(),schedule=await provider.load('schedule'),seasons=await Promise.all([2022,2023,2024,2025].map(y=>provider.load('weekly',y))),base=JSON.parse(await fs.readFile('lib/artifacts/nfl-forecast.json','utf8'));
  const gameMap=new Map(schedule.rows.filter(g=>g.game_type!=='PRE').map(g=>[g.game_id,{...g,players:new Map()}]));
  const rows=seasons.flatMap(s=>s.rows).filter(r=>['QB','RB','FB','WR','TE'].includes(r.position)&&gameMap.has(r.game_id)).map(r=>({...r,date:gameMap.get(r.game_id).gameday})).sort((a,b)=>a.date.localeCompare(b.date));
  for(const r of rows)gameMap.get(r.game_id).players.set(r.player_id,r);
  const games=[...gameMap.values()].filter(g=>g.players.size),histories=new Map(),datasets={},priors={};
  for(const market of MARKETS)for(const position of ['QB','RB','FB','WR','TE']){const gs=games.filter(g=>Number(g.season)===2022);let total=0;for(const g of gs)for(const r of g.players.values())if(r.position===position)total+=market==='any_td'?Number(targetValue(r,market)>0):targetValue(r,market);priors[market+':'+position]=total/(gs.length*2);}
  for(const r of rows){
    const history=histories.get(r.player_id)||[],sample=priorSample(history,r),game=gameMap.get(r.game_id),opponent=game.home_team===r.team?game.away_team:game.home_team;
    if(sample.length>=5&&Number(r.season)>=2023)for(const market of MARKETS){
      if(market.startsWith('pass_')&&r.position!=='QB')continue;
      if(['rush_yds','rush_attempts'].includes(market)&&!sample.slice(0,5).some(p=>Number(p.carries)>0))continue;
      if(['rec','rec_yds'].includes(market)&&!sample.slice(0,5).some(p=>Number(p.targets)>0))continue;
      if(market==='rush_rec_yds'&&!sample.slice(0,5).some(p=>Number(p.carries)+Number(p.targets)>0))continue;
      const key=market+':'+r.position,o=nflOpponent(games,{date:r.date,season:Number(r.season),week:Number(r.week),opponent},market,r.position,priors[key]),w=observedWeather({roof:game.roof,temperatureF:game.temp,windMph:game.wind,sourceUrl:schedule.meta.url});
      (((datasets[key]??={})[r.season])??=[]).push({base:project(sample,market).point,x:contextVector(o,w),y:market==='any_td'?Number(targetValue(r,market)>0):targetValue(r,market),weatherAvailable:w.status==='available'});
    }
    history.push(r);histories.set(r.player_id,history.slice(-12));
  }
  const artifact={...metadata,version:'workload-context-v2',baseModelId:base.id,trainingSeason:2024,contextModels:{},pools:{average:base.pools.average,candidate:{...base.pools.candidate}},report:{},sources:[schedule,...seasons].map(d=>({url:d.meta.url,fetchedAt:d.meta.fetchedAt,sha256:d.meta.sha256}))};
  for(const [key,ds]of Object.entries(datasets)){
    if(![2023,2024,2025].every(y=>ds[y]?.length>=100))continue;
    const max=key.startsWith('any_td:')?1:Infinity,model={...select(ds,max),leagueRate:priors[key]};const v=compare(ds[2024],model,max);model.enabled=v.maeImprovementPercent>0&&model.selectionMse<ds[2024].reduce((s,r)=>s+(r.base-r.y)**2,0)/ds[2024].length;artifact.contextModels[key]=model;
    artifact.pools.candidate[key]=model.enabled?ds[2024].map(r=>[round(adjustedPoint(r.base,r.x,model,max)),r.y]):base.pools.candidate[key];
    artifact.report[key]={...compare(ds[2025],model,max),validation:compare(ds[2024],model,max),weatherAvailable:ds[2025].filter(r=>r.weatherAvailable).length};
    console.log(JSON.stringify({sport:'nfl',key,...artifact.report[key]}));
  }
  artifact.id=hash(artifact);await fs.writeFile('lib/artifacts/nfl-context.json',JSON.stringify(artifact));
}
