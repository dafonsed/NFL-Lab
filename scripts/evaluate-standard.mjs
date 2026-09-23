// Offline regression evaluation. Freeze a copy of lib/ before editing, then run:
// node scripts/evaluate-standard.mjs --before .research/standard-model-before
// No downloads, retraining, changed artifacts, prices or simulated outcomes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Provider } from '../lib/providers.mjs';
import * as nfl from '../lib/model.mjs';
import * as nflForecast from '../lib/forecast.mjs';
import { MARKET_CONFIG } from '../lib/markets.mjs';
import * as mlb from '../lib/mlb/forecast-core.mjs';
import { MLB_MARKETS,statValue } from '../lib/mlb/markets.mjs';
import * as sports from '../lib/sports/model.mjs';
import { normalizeSummary } from '../lib/sports/normalize.mjs';
import { SPORTS } from '../lib/sports/config.mjs';
import { pairedReport } from './standard-metrics.mjs';

const beforeDir=process.argv[process.argv.indexOf('--before')+1];
if(!process.argv.includes('--before')||!beforeDir)throw Error('Supply --before PATH to a frozen pre-edit directory containing lib/.');
const before=Object.fromEntries(await Promise.all([['nfl','model.mjs'],['nflForecast','forecast.mjs'],['mlb','mlb/forecast-core.mjs'],['sports','sports/model.mjs']].map(async([key,file])=>[key,await import(pathToFileURL(path.resolve(beforeDir,'lib',file)).href)])));
const report={generatedAt:new Date().toISOString(),protocol:{nfl:'2024 rate training; 2025 chronological reconstruction. Workload forecast retains shipped parameters; this run does not refit or recalibrate.',mlb:'Frozen 2022 priors, 2023 coefficients, 2024 selection/dispersion; recheck 2025. No refit.',wnba:'Existing development through 2025-08-14; recheck 2025-08-15 onward with frozen gates.',otherSports:'All available cached history; last 30% of chronological games are reported. Convenience diagnostic, not a fresh independent holdout.'},limitations:['Corrected historical data and outcome-conditioned appearance populations; not point-in-time source archives.','No target results in features. Historical roster publication timing and schedule closing-line timing cannot be reconstructed.','Current injuries, target-game lineup, current weather and market odds are excluded from retrospective direct-forecast evaluation.','NFL weighted TD rating still uses historical schedule lines; score changes are descriptive only, never probability accuracy.','Previously inspected evaluation periods are reused regression diagnostics, not untouched new evidence. No weights selected on these periods.','Log loss clips probabilities to [1e-6,1-1e-6]. Baseline probabilities use earlier empirical frequencies at fixed research thresholds, never market-implied probabilities.'],models:{},sources:[],code:[]};
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of ['model.mjs','rating.mjs','forecast.mjs','context-model.mjs','mlb/markets.mjs','mlb/model.mjs','mlb/forecast-core.mjs','mlb/forecast.mjs','sports/model.mjs']){
  const current=await fs.readFile(path.join('lib',file));let prior=null;try{prior=sha(await fs.readFile(path.join(beforeDir,'lib',file)));}catch{}
  report.code.push({file,before:prior,after:sha(current)});
}
const save=async()=>{await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/standard-model-audit.json',JSON.stringify(report,null,2)+'\n');};
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;

async function evaluateNfl(){
  const provider=new Provider({fetcher:async()=>{throw Error('Offline audit: cached files only');}});
  const specs=[['schedule',null],...['pbp','weekly','roster','weeklyRoster','snaps'].flatMap(k=>[[k,2024],[k,2025]]),...['ngsRushing','ngsPassing','ngsReceiving'].map(k=>[k,null])];
  const datasets=await Promise.all(specs.map(async([type,year])=>({type,year,...await provider.load(type,year,{optional:true})})));
  const get=k=>datasets.filter(d=>d.type===k).flatMap(d=>d.rows);
  if(!get('pbp').some(r=>Number(r.season)===2024)||!get('weekly').length)throw Error('NFL cached 2024/2025 PBP and weekly stats required');
  report.sources.push(...datasets.map(d=>({type:d.type,year:d.year,url:d.meta.url,sha256:d.meta.sha256,fetchedAt:d.meta.fetchedAt,available:d.meta.available})));
  const rosters=[...get('roster'),...get('weeklyRoster')],games=nfl.prepareData({schedule:get('schedule'),pbp:get('pbp'),weekly:get('weekly'),rosters,snaps:get('snaps'),chart:[]});
  const train=get('pbp').filter(p=>Number(p.season)===2024&&games.get(p.game_id)?.complete),rates=nfl.buildRates(train),oldRates=before.nfl.buildRates(train);
  const ngs={rushing:get('ngsRushing'),passing:get('ngsPassing'),receiving:get('ngsReceiving')};
  const weeks=[...new Set([...games.values()].filter(g=>Number(g.season)===2025&&g.complete&&g.game_type!=='PRE').map(g=>Number(g.week)))].sort((a,b)=>a-b);
  for(const [market,config] of Object.entries(MARKET_CONFIG)){
    const rows=[],workload=[],scoreChanges=[];
    for(const week of weeks){
      const input={games,rosters,season:2025,week,market,trainingSeason:2024,ngs};
      const old=new Map(before.nfl.buildPlayers({...input,rates:oldRates}).map(p=>[p.gameId+':'+p.playerId,p]));
      for(const p of nfl.buildPlayers({...input,rates})){
        const a=old.get(p.gameId+':'+p.playerId),g=games.get(p.gameId),actualRow=g?.players.get(p.playerId);
        if(!a||!g.complete||!actualRow||actualRow.statsAvailable===false)continue;
        const fields=market==='any_td'?['rushing_tds','receiving_tds']:config.fields;
        if(!fields.every(k=>nfl.number(actualRow[k])!==null))continue;
        const actual=fields.reduce((s,k)=>s+Number(actualRow[k]),0),values=p.details.sample.map(r=>fields.reduce((s,k)=>s+r[k],0));
        rows.push({date:g.gameday,gameId:p.gameId,actual,event:market==='any_td'?actual>0:null,before:{point:a.projected,probability:a.tdProb},after:{point:p.projected,probability:p.tdProb},baseline:{point:mean(values),probability:market==='any_td'?mean(values.map(v=>Number(v>0))):null}});
        scoreChanges.push(Math.abs(p.modelScore-a.modelScore));
        const sample=[...games.values()].filter(h=>h.complete&&h.game_type!=='PRE'&&h.gameday<g.gameday&&(Number(h.season)<2025||Number(h.season)===2025&&Number(h.week)<week)).sort((x,y)=>y.gameday.localeCompare(x.gameday)).flatMap(h=>{const r=h.players.get(p.playerId);return r&&r.statsAvailable!==false&&(Number(r.offense_snaps)>0||Number(r.attempts)+Number(r.carries)+Number(r.targets)>0)?[{...r,gameId:h.game_id,date:h.gameday,season:Number(h.season),week:Number(h.week)}]:[];}).slice(0,10);
        if(sample.length>=5){const b=before.nflForecast.project(sample,market),f=nflForecast.project(sample,market),y=market==='any_td'?Number(config.fields.reduce((s,k)=>s+(Number(actualRow[k])||0),0)>0):actual;workload.push({date:g.gameday,gameId:p.gameId,actual:y,event:market==='any_td'?!!y:null,before:{point:b.point,probability:market==='any_td'?b.point:null},after:{point:f.point,probability:market==='any_td'?f.point:null},baseline:{point:f.baseline,probability:market==='any_td'?f.baseline:null}});}
      }
    }
    report.models['nfl-rating:'+market]={...pairedReport(rows),ratingChanges:scoreChanges.filter(d=>d>1e-6).length,ratingMaxChange:Math.max(0,...scoreChanges)};
    report.models['nfl-workload:'+market]={...pairedReport(workload),scope:'Direct workload × efficiency point estimate; no context, team/injury scenario or residual calibration. TD target includes special-teams TDs.'};
    console.log(JSON.stringify({sport:'nfl',market,n:rows.length,changed:report.models['nfl-rating:'+market].changed}));await save();
  }
}
async function evaluateMlb(){
  const data=await json('data-independent/mlb-training/2025.json'),artifact=await json('lib/artifacts/mlb-model.json');
  report.sources.push(...data.sources);
  for(const [market,config] of Object.entries(MLB_MARKETS)){
    const model=artifact.models[market],history=new Map(),rows=[],line=mlb.BENCHMARKS[market][0];
    for(const r of [...data.rows].filter(r=>r.role===config.group).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId)){
      const past=history.get(r.playerId)||[],a=before.mlb.forecastInputs(past,r,market,model.prior),b=mlb.forecastInputs(past,r,market,model.prior),actual=statValue(r.stats,market);
      if(actual!==null&&(a.available||b.available)){
        const result=(input,core)=>{if(!input.available)return {point:null};const point=core.predictMean(input,model);return {point,probability:core.lineProbabilities(core.countDistribution(point,model.dispersion),line).over};};
        const values=past.filter(x=>x.date<r.date&&x.date>=r.date.slice(0,4)+'-01-01').slice(-20).map(x=>statValue(x.stats,market)).filter(Number.isFinite);
        rows.push({date:r.date,gameId:r.gameId,actual,event:actual>line,before:result(a,before.mlb),after:result(b,mlb),baseline:{point:b.baseline??a.baseline,probability:mean(values.map(v=>Number(v>line)))}});
      }
      past.push(r);history.set(r.playerId,past);
    }
    report.models['mlb:'+market]={...pairedReport(rows),threshold:line,scope:'Frozen count regression and distribution; baseline point is existing 60/40 form. Current pitcher/lineup/weather adjustments cannot be reconstructed.'};
    console.log(JSON.stringify({sport:'mlb',market,n:rows.length,changed:report.models['mlb:'+market].changed}));await save();
  }
}
async function evaluateSports(){
  const wnba=await json('data-independent/wnba/2025.json'),histories={wnba:new Map(wnba.games.map(h=>[h.game.id,h])),nba:new Map(),nhl:new Map(),soccer:new Map()};report.sources.push(...wnba.sources);
  for(const dir of ['data-independent/mlb/sports/raw','data-independent/mlb/raw']){
    let files=[];try{files=await fs.readdir(dir);}catch{continue;}
    for(const file of files){if(!file.endsWith('.json'))continue;let d;try{d=await json(path.join(dir,file));}catch{continue;}
      if(!d.url?.includes('/summary?event='))continue;const sport=d.url.includes('/basketball/nba/')?'nba':d.url.includes('/hockey/nhl/')?'nhl':d.url.includes('/soccer/')?'soccer':null;if(!sport)continue;
      const h=normalizeSummary(d.payload,sport);if(!h.game.complete||h.game.extraTime||!h.players.length||!h.game.date||histories[sport].has(h.game.id))continue;
      histories[sport].set(h.game.id,h);report.sources.push({url:d.url,sha256:d.sha256,fetchedAt:d.fetchedAt});
    }
  }
  for(const [sport,items] of Object.entries(histories)){
    const history=[...items.values()].sort((a,b)=>Date.parse(a.game.date)-Date.parse(b.game.date));
    const cutoff=sport==='wnba'?'2025-08-15T00:00:00Z':history[Math.floor(history.length*.7)]?.game.date;
    const contexts=history.filter(h=>Date.parse(h.game.date)>=Date.parse(cutoff)).map(target=>{const prior=sports.historyBefore(history,target.game),ids=new Set();for(const team of target.teams)for(const h of prior.filter(h=>h.teams.some(t=>t.id===team.id)).slice(0,25))ids.add(h.game.id);return {target,past:prior.filter(h=>ids.has(h.game.id))};});
    for(const [market,config] of Object.entries(SPORTS[sport].markets)){
      const rows=[];
      for(const {target,past} of contexts){
        const candidates=config.team?target.teams.map(t=>({...t,teamId:t.id,position:'TEAM'})):target.players.filter(p=>p.minutes>0&&(config.goalie?['G','GK'].includes(p.position):['nba','wnba'].includes(sport)||!['G','GK'].includes(p.position)));
        for(const p of candidates){const actual=sports.value(p.stats,config);if(actual===null)continue;const input={sport,market,player:{...p,starter:false,lineupConfirmed:false,availability:undefined},target:target.game,history:past,validation:true},a=before.sports.predict(input),b=sports.predict(input);if(a.point===null&&b.point===null)continue;
          const compact=f=>({point:f.point,probability:f.benchmark?.probability.over});
          rows.push({date:target.game.date,gameId:target.game.id,actual,event:actual>config.benchmark,before:compact(a),after:compact(b),baseline:{point:b.baseline??a.baseline,probability:mean(b.sample.slice(0,5).map(r=>Number(r.value>config.benchmark)))}});
        }
      }
      report.models[sport+':'+market]={...pairedReport(rows),threshold:config.benchmark,historyGames:history.length,cutoff};
      console.log(JSON.stringify({sport,market,n:rows.length,changed:report.models[sport+':'+market].changed}));await save();
    }
  }
}
await evaluateNfl();await evaluateMlb();await evaluateSports();await save();
console.log('Saved reports/standard-model-audit.json; no weights or artifacts changed.');
