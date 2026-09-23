// Independent, offline verification. Does not fit models or capture predictions.
// node --max-old-space-size=6144 scripts/verify-standard-audit.mjs
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Provider,DATA_DIR } from '../lib/providers.mjs';
import * as current from '../lib/model.mjs';
import * as previous from '../.research/standard-model-before/lib/model.mjs';
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const oldReport=await json('reports/standard-model-audit.json');
const savedExamples=await json('reports/standard-change-examples.json');
const provider=new Provider({fetcher:async()=>{throw Error('Verification uses cached bytes only');}});
const specs=[['schedule',null],...['pbp','weekly','roster','weeklyRoster','snaps'].flatMap(k=>[[k,2024],[k,2025]])];
const data=await Promise.all(specs.map(async([type,year])=>({type,year,...await provider.load(type,year,{optional:true})})));
const get=k=>data.filter(d=>d.type===k).flatMap(d=>d.rows);
const rosters=[...get('roster'),...get('weeklyRoster')];
const raw={schedule:get('schedule'),pbp:get('pbp'),weekly:get('weekly'),rosters,snaps:get('snaps'),chart:[]};
const games=current.prepareData(raw),oldGames=previous.prepareData(raw);
const train=get('pbp').filter(p=>Number(p.season)===2024&&games.get(p.game_id)?.complete);
const rates=current.buildRates(train),oldRates=previous.buildRates(train);
const valid=p=>p.play_type!=='no_play'&&Number(p.play_deleted)!==1&&Number(p.two_point_attempt)!==1;
const attempt=p=>valid(p)&&Number(p.pass_attempt)===1&&Number(p.sack)!==1&&Number(p.qb_spike)!==1&&!!p.passer_player_id;
const target=p=>valid(p)&&Number(p.pass_attempt)===1&&Number(p.sack)!==1&&Number(p.qb_spike)!==1&&!!p.receiver_player_id;
const scalar=x=>x!==''&&x!=null&&Number.isFinite(Number(x))?Number(x):null;
const zone=x=>{const n=scalar(x);return n===null||n<0||n>100?null:n<=5?'goal_line':n<=20?'red_zone':n<=40?'fringe':'open';};
const depth=x=>{const n=scalar(x);return n===null?'unknown':n<0?'behind':n<10?'short':n<20?'medium':'deep';};
const count=fn=>train.filter(fn).length;
const populations={trainingRows:train.length,seasonTypes:Object.fromEntries([...new Set(train.map(p=>p.season_type))].map(s=>[s,count(p=>p.season_type===s)])),passAttemptFlag:count(p=>Number(p.pass_attempt)===1),attempts:count(attempt),targets:count(target),unassignedAttempts:count(p=>attempt(p)&&!p.receiver_player_id),unassignedCompletedAttempts:count(p=>attempt(p)&&!p.receiver_player_id&&Number(p.complete_pass)===1),targetsWithoutPasser:count(p=>target(p)&&!p.passer_player_id),invalidZoneAttempts:count(p=>attempt(p)&&zone(p.yardline_100)===null),invalidCompletionFlags:count(p=>target(p)&&![0,1].includes(scalar(p.complete_pass))),excluded:{noPlay:count(p=>Number(p.pass_attempt)===1&&p.play_type==='no_play'),deleted:count(p=>Number(p.pass_attempt)===1&&Number(p.play_deleted)===1),twoPoint:count(p=>Number(p.pass_attempt)===1&&Number(p.two_point_attempt)===1),sacks:count(p=>Number(p.pass_attempt)===1&&Number(p.sack)===1),spikes:count(p=>Number(p.pass_attempt)===1&&Number(p.qb_spike)===1),missingPasser:count(p=>valid(p)&&Number(p.pass_attempt)===1&&Number(p.sack)!==1&&Number(p.qb_spike)!==1&&!p.passer_player_id)},includedPenaltyDescriptions:count(p=>attempt(p)&&/PENALTY/i.test(p.desc)),includedInterceptionDescriptions:count(p=>attempt(p)&&/INTERCEPT/i.test(p.desc)),includedLateralDescriptions:count(p=>attempt(p)&&/lateral/i.test(p.desc)),missingDownAttempts:count(p=>attempt(p)&&scalar(p.down)===null),passTdFlagWithoutCompletion:count(p=>attempt(p)&&Number(p.pass_touchdown)===1&&Number(p.complete_pass)!==1)};
const passingBins=['goal_line','red_zone','fringe','open'].map(z=>{
 const a=train.filter(p=>attempt(p)&&zone(p.yardline_100)===z),t=train.filter(p=>target(p)&&zone(p.yardline_100)===z),td=a.reduce((s,p)=>s+Number(p.pass_touchdown),0);
 return {zone:z,attempts:a.length,targets:t.length,td,oldRate:oldRates.zones['pass:'+z]?.rate,newRate:rates.passing[z]?.rate,manualRate:td/a.length};
});
const receivingBins=['behind','short','medium','deep','unknown'].map(d=>{
 const a=train.filter(p=>attempt(p)&&depth(p.air_yards)===d),t=train.filter(p=>target(p)&&depth(p.air_yards)===d),caught=t.reduce((s,p)=>s+Number(p.complete_pass),0);
 return {depth:d,attempts:a.length,targets:t.length,caught,oldRate:oldRates.depths[d]?.catchRate,newRate:rates.receiving[d]?.catchRate,manualRate:t.length?caught/t.length:null};
});
const round=n=>Math.round(n*1e6)/1e6;
const roundedPoint=n=>Math.round(n*1000)/1000;
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const metrics=(rows,key)=>({mae:mean(rows.map(r=>Math.abs(r[key]-r.actual))),rmse:Math.sqrt(mean(rows.map(r=>(r[key]-r.actual)**2)))});
const report={generatedAt:new Date().toISOString(),method:'Independent predicates, metrics and formula-only ablation; no imports from standard-metrics.mjs. Separate before/after prepareData calls. Corrected cached data, not frozen pregame archives.',populations,passingBins,receivingBins,sources:[],artifacts:[],code:[],markets:{},examples:[],rowsFile:'reports/final-standard-verification-rows.jsonl'};
for(const d of data){const hash=d.meta.available?sha(await fs.readFile(DATA_DIR+'/raw/'+d.meta.name)):null;const original=oldReport.sources.find(x=>x.type===d.type&&x.year===d.year);report.sources.push({type:d.type,year:d.year,hash,receiptHash:d.meta.sha256,hashMatchesReceipt:hash===d.meta.sha256,hashMatchesOriginal:hash===(original?.sha256??null),fetchedAt:d.meta.fetchedAt,url:d.meta.url});}
for(const file of await fs.readdir('.research/standard-model-before/lib/artifacts')){const a=sha(await fs.readFile('.research/standard-model-before/lib/artifacts/'+file)),b=sha(await fs.readFile('lib/artifacts/'+file));report.artifacts.push({file,before:a,after:b,identical:a===b});}
for(const c of oldReport.code){const hash=sha(await fs.readFile('lib/'+c.file));report.code.push({file:c.file,hash,matchesEvaluatedCode:hash===c.after});}
const weeks=[...new Set([...games.values()].filter(g=>Number(g.season)===2025&&g.complete&&g.game_type!=='PRE').map(g=>Number(g.week)))].sort((a,b)=>a-b);
const allRows=[];
for(const market of ['pass_tds','rec']){
 const rows=[],excluded={beforeOnly:0,afterOnly:0,noOutcome:0,nonFiniteBefore:0,nonFiniteAfter:0},invariants={differentSample:0,nonPriorSample:0,scoreChanges:0,manualBeforeMismatch:0,manualAfterMismatch:0,formulaOnlyMismatch:0};
 const patchedRates=structuredClone(oldRates);
 if(market==='pass_tds')for(const z of passingBins)patchedRates.zones['pass:'+z.zone]={...patchedRates.zones['pass:'+z.zone],rate:z.newRate};
 else for(const d of receivingBins)if(patchedRates.depths[d.depth])patchedRates.depths[d.depth].catchRate=d.newRate;
 for(const week of weeks){
  const input={rosters,season:2025,week,market,trainingSeason:2024};
  const old=new Map(previous.buildPlayers({...input,games:oldGames,rates:oldRates}).map(p=>[p.gameId+':'+p.playerId,p]));
  const updated=new Map(current.buildPlayers({...input,games,rates}).map(p=>[p.gameId+':'+p.playerId,p]));
  const formulaOnly=new Map(previous.buildPlayers({...input,games:oldGames,rates:patchedRates}).map(p=>[p.gameId+':'+p.playerId,p]));
  excluded.beforeOnly+=[...old.keys()].filter(k=>!updated.has(k)).length;excluded.afterOnly+=[...updated.keys()].filter(k=>!old.has(k)).length;
  for(const [key,p] of updated){const a=old.get(key);if(!a)continue;const g=games.get(p.gameId),actual=scalar(g.players.get(p.playerId)?.[market==='rec'?'receptions':'passing_tds']);if(!g.complete||actual===null){excluded.noOutcome++;continue;}
   if(!Number.isFinite(a.projected))excluded.nonFiniteBefore++;if(!Number.isFinite(p.projected))excluded.nonFiniteAfter++;if(!Number.isFinite(a.projected)||!Number.isFinite(p.projected))continue;
   const beforeIds=a.details.sample.map(r=>r.gameId),afterIds=p.details.sample.map(r=>r.gameId);
   if(JSON.stringify(beforeIds)!==JSON.stringify(afterIds))invariants.differentSample++;
   if(p.details.sample.some(r=>r.date>=g.gameday||!(r.season<2025||r.season===2025&&r.week<week)))invariants.nonPriorSample++;
   if(a.modelScore!==p.modelScore)invariants.scoreChanges++;
   const plays=afterIds.flatMap(id=>games.get(id).plays).filter(q=>market==='rec'?target(q)&&q.receiver_player_id===p.playerId:attempt(q)&&q.passer_player_id===p.playerId);
   const manual=(isNew)=>roundedPoint(plays.reduce((s,q)=>s+(market==='rec'?(isNew?rates.receiving[depth(q.air_yards)]?.catchRate:oldRates.depths[depth(q.air_yards)]?.catchRate):(isNew?rates.passing[zone(q.yardline_100)]?.rate:oldRates.zones['pass:'+zone(q.yardline_100)]?.rate)),0)/afterIds.length);
   if(manual(false)!==a.projected)invariants.manualBeforeMismatch++;if(manual(true)!==p.projected)invariants.manualAfterMismatch++;
   if(formulaOnly.get(key)?.projected!==p.projected)invariants.formulaOnlyMismatch++;
   rows.push({market,id:key,player:p.player,date:g.gameday,gameId:p.gameId,actual,before:a.projected,after:p.projected,formulaOnly:formulaOnly.get(key)?.projected,scoreBefore:a.modelScore,scoreAfter:p.modelScore,debtBefore:a.debt,debtAfter:p.debt,sampleGames:afterIds});
  }
 }
 const before=metrics(rows,'before'),after=metrics(rows,'after'),byGame=new Map();for(const r of rows){const list=byGame.get(r.gameId)||[];list.push(Math.abs(r.after-r.actual)-Math.abs(r.before-r.actual));byGame.set(r.gameId,list);}
 const deltas=[...byGame.values()].map(mean),delta=mean(deltas),se=Math.sqrt(deltas.reduce((s,x)=>s+(x-delta)**2,0)/(deltas.length-1)/deltas.length),dates=rows.map(r=>r.date).sort();
 const result={n:rows.length,games:byGame.size,players:new Set(rows.map(r=>r.id.split(':')[1])).size,from:dates[0],through:dates.at(-1),changed:rows.filter(r=>r.before!==r.after).length,increased:rows.filter(r=>r.after>r.before).length,decreased:rows.filter(r=>r.after<r.before).length,before,after,delta:{mae:after.mae-before.mae,rmse:after.rmse-before.rmse},excluded,invariants,uncertainty:{gameMeanDifference:delta,interval95:[delta-1.96*se,delta+1.96*se],method:'Same descriptive equal-game normal interval, independently computed; repeated-player/time dependence not removed.'}};
 const saved=oldReport.models['nfl-rating:'+market];result.matchesSavedMetrics=['mae','rmse'].every(k=>round(before[k])===saved.before[k]&&round(after[k])===saved.after[k])&&result.n===saved.n&&result.changed===saved.changed;
 report.markets[market]=result;
 for(const e of savedExamples.examples.filter(e=>e.market===market)){const r=rows.find(r=>r.id===e.gameId+':'+e.playerId);report.examples.push({...r,matchesSaved:!!r&&r.before===e.before.projected&&r.after===e.after.projected&&r.scoreBefore===e.before.modelScore&&r.scoreAfter===e.after.modelScore&&r.actual===e.actual});}
 allRows.push(...rows);console.log(JSON.stringify({market,...result}));
}
await fs.writeFile(report.rowsFile,allRows.map(r=>JSON.stringify(r)).join('\n')+'\n');
await fs.writeFile('reports/final-standard-verification.json',JSON.stringify(report,null,2)+'\n');
console.log('Saved independent verification, row-level evidence, raw populations and artifact hashes.');
