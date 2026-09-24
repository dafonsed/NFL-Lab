import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { project, priorSample, forecast, distribution, lineProbabilities, roleFlags } from '../lib/forecast.mjs';
import { PredictionStore, freshQuote, kickoffTime, summarize, performancePage } from '../lib/predictions.mjs';
import { AvailabilityStore } from '../lib/availability.mjs';

const now=Date.parse('2026-09-13T15:00:00Z'),kickoff='2026-09-13T17:00:00Z';
const sample=Array.from({length:10},(_,i)=>({gameId:'g'+i,date:`2025-11-${String(29-i).padStart(2,'0')}`,season:2025,week:10-i,team:'NYG',carries:10,rushing_yards:40,targets:4,receptions:3,receiving_yards:32,attempts:20,completions:15,passing_yards:160,passing_tds:1,passing_interceptions:0,rushing_tds:0,receiving_tds:0,special_teams_tds:0,snap_pct:.6}));
const prop={line:30.5,basis:'captured_pregame',fetchedAt:new Date(now-60000).toISOString(),commenceTime:kickoff,bookmaker:'FanDuel',bookKey:'fanduel'};
const pool=Array.from({length:200},(_,i)=>[40,i%2?45:35]);
const artifact={id:'test-artifact',trainingSeason:2023,pools:{candidate:{'rush_yds:RB':pool},average:{'rush_yds:RB':pool}}};
const base={sample,target:{season:2025,week:11,date:'2025-12-01',team:'NYG'},market:'rush_yds',position:'RB',artifact,prop,availability:{status:'No injury listing'},now};

test('candidate uses separate workload and efficiency windows without changing the five-game baseline',()=>{
 const rows=sample.map((r,i)=>({...r,carries:i<3?20:10,rushing_yards:i<3?100:40}));
 const p=project(rows,'rush_yds');assert.equal(p.parts[0].workload,20);assert.equal(p.point,89.2308);assert.equal(p.baseline,76);
 assert.equal(project(rows,'rush_yds','average').point,76);
 assert.notEqual(project(rows,'rush_yds','workloadOnly').point,p.point);
 assert.notEqual(project(rows,'rush_yds','efficiencyOnly').point,p.point);
});
test('same-week, future and same-date results cannot enter the candidate sample',()=>{
 const rows=[...sample,{...sample[0],week:11,carries:999},{...sample[0],season:2026,week:1,carries:999},{...sample[0],date:'2025-12-01',week:9,carries:999}];
 assert.equal(priorSample(rows,base.target).length,10);assert.equal(forecast({...base,sample:rows}).point,40);
});
test('a residual artifact cannot leak back into its training season',()=>{
 const f=forecast({...base,target:{season:2023,week:11},sample:sample.map(r=>({...r,season:2023}))});assert.equal(f.probability,null);assert.equal(f.lean,null);assert.equal(f.artifactId,null);
});
test('integer push outcomes and negative yardage are kept distinct',()=>{
 const d={outcomes:[-1,0,1,2,3],count:5};assert.deepEqual(lineProbabilities(d,1,'rush_yds'),{over:.4,under:.4,push:.2});assert.deepEqual(lineProbabilities(d,.5,'rush_yds'),{over:.6,under:.4,push:0});
 const a={pools:{candidate:{'rush_yds:RB':[[1,-3]],'rec:WR':[[1,-3]]}}};assert.equal(distribution(0,'rush_yds','RB',a).outcomes[0],-4);assert.equal(distribution(0,'rec','WR',a).outcomes[0],0);
});
test('anytime TD uses binary occurrence including return TD history, not passing touchdowns',()=>{
 const rows=sample.map(r=>({...r,passing_tds:9,special_teams_tds:1}));assert.ok(project(rows,'any_td').point>.6);assert.equal(project(sample.map(r=>({...r,passing_tds:9})),'any_td').point,0);
 assert.equal(lineProbabilities({probability:.3},1.5,'any_td'),null);
});
test('strong probability still yields no lean when workload, injuries, sample, or source are uncertain',()=>{
 assert.equal(forecast(base).lean,'over');
 assert.equal(forecast({...base,sample:sample.slice(0,4)}).lean,null);
 assert.equal(forecast({...base,sample:sample.slice(0,4)}).probability,null);
 assert.equal(forecast({...base,stale:true}).lean,null);
 assert.equal(forecast({...base,availability:{status:'Questionable',concern:true}}).lean,null);
 assert.equal(forecast({...base,availability:{status:'unavailable'}}).lean,null);
 assert.equal(forecast({...base,artifact:{...artifact,pools:{candidate:{'rush_yds:RB':[[40,50]]}}}}).probability,null);
 assert.equal(forecast({...base,prop:{...prop,fetchedAt:new Date(now-3*3600000).toISOString()}}).lean,null);
 assert.equal(forecast({...base,now:Date.parse(kickoff)}).lean,null);
 const changed=sample.map((r,i)=>({...r,carries:i<2?20:5}));assert.ok(roleFlags(changed,'rush_yds',base.target).some(r=>r.includes('30%')));
 assert.ok(roleFlags(sample,'rush_yds',{...base.target,team:'KC'}).some(r=>r.includes('different team')));
});
test('public kickoff times respect Eastern daylight and standard time',()=>{
 assert.equal(Date.parse(kickoffTime({gameday:'2026-09-13',gametime:'13:00'})),Date.parse(kickoff));
 assert.equal(kickoffTime({gameday:'2026-12-13',gametime:'13:00'}),'2026-12-13T18:00:00.000Z');
 assert.equal(kickoffTime({gameday:'2026-12-13'}),null);
});
test('pregame capture rejects postgame, stale, future-dated and wrong-game quotes',()=>{
 assert.ok(freshQuote(prop,now,kickoff));assert.ok(!freshQuote(prop,Date.parse(kickoff),kickoff));
 for(const change of [{stale:true},{basis:'published_archive'},{line:null},{fetchedAt:new Date(now+1).toISOString()},{commenceTime:'2026-09-14T17:00:00Z'}])assert.ok(!freshQuote({...prop,...change},now,kickoff));
});
async function temporaryStore(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nfl-forecast-test-'));t.after(async()=>{assert.ok(dir.startsWith(path.join(os.tmpdir(),'nfl-forecast-test-')));await fs.rm(dir,{recursive:true,force:true});});return new PredictionStore({dir,now:()=>now,cloud:false});}
const game={game_id:'2026_01_NYG_LA',gameday:'2026-09-13',gametime:'13:00',season:2026,week:1,complete:false};
function board(){const f=forecast(base);return {current:{season:2026,week:1},market:'rush_yds',model:{version:'independent-v1'},datasets:[{url:'source',sha256:'hash'}],players:[{gameId:game.game_id,playerId:'p1',player:'Player One',team:'NYG',opponent:'LA',position:'RB',prop:{...prop},forecast:f,modelScore:82,projected:42}]};}
test('concurrent immutable appends retain the complete first record and survive a new store instance',async t=>{
 const store=await temporaryStore(t),key=store.prefix(2026,1)+'rush_yds/2026-09-13.json';
 const a={x:'a'.repeat(20000)},b={x:'b'.repeat(20000)};const saved=await Promise.all([store.append(key,a),store.append(key,b)]);assert.deepEqual(saved[0],saved[1]);
 assert.deepEqual(await new PredictionStore({dir:path.dirname(store.dir),cloud:false}).read(key),saved[0]);
});
test('a daily capture freezes its original line, probabilities and score without being overwritten',async t=>{
 const store=await temporaryStore(t),b=board();const first=await store.capture(b,[game],artifact);assert.equal(first.state,'saved');
 b.players[0].prop.line=80.5;b.players[0].modelScore=12;await store.capture(b,[game],artifact);
 const saved=(await store.batches(2026,1))[0];assert.equal(saved.records[0].prop.line,30.5);assert.equal(saved.records[0].original.score,82);assert.equal(b.players[0].forecast.capture.line,30.5);
});
test('postkickoff boards and missing lines cannot create fake pregame predictions',async t=>{
 const store=await temporaryStore(t),b=board();store.now=()=>Date.parse(kickoff)+1;assert.equal((await store.capture(b,[game],artifact)).state,'waiting');
 store.now=()=>now;b.players[0].prop=null;assert.equal((await store.capture(b,[game],artifact)).state,'waiting');assert.equal((await store.batches(2026,1)).length,0);
});
test('grading uses the frozen line and keeps pending and missing stats out of losses',async t=>{
 const store=await temporaryStore(t);await store.capture(board(),[game],artifact);
 let bundle={games:new Map([[game.game_id,{...game,plays:[],players:new Map()}]])};let report=await store.performance(2026,1,bundle);assert.equal(report.summary.pending,1);assert.equal(report.summary.leanLosses,0);
 bundle.games.get(game.game_id).complete=true;report=await store.performance(2026,1,bundle);assert.equal(report.summary.missingStats,1);assert.equal(report.summary.leanLosses,0);
 bundle.games.get(game.game_id).players.set('p1',{rushing_yards:35,statsAvailable:true});report=await store.performance(2026,1,bundle);assert.equal(report.rows[0].outcome,'over');assert.equal(report.rows[0].hit,'hit');assert.equal(report.summary.leanWins,1);
});
test('prospective TD score evaluation uses saved probabilities and rushing or receiving TDs',async t=>{
 const store=await temporaryStore(t),b=board();b.market='any_td';
 b.players[0].prop={...prop,line:.5};b.players[0].tdProb=.7;b.players[0].tdProbMethod='historical-score-calibration';b.players[0].tdCalibrationId='fit-2025';
 b.players.push({...b.players[0],playerId:'p2',player:'Player Two',prop:null,tdProb:.25});
 await store.capture(b,[game],artifact);
 const saved=(await store.batches(2026,1))[0];assert.equal(saved.records[0].original.tdProb,.7);assert.equal(saved.records[0].original.tdCalibrationId,'fit-2025');
 const finalGame={...game,complete:true,plays:[],players:new Map([['p1',{rushing_tds:1,receiving_tds:0,statsAvailable:true,offense_snaps:30}],['p2',{rushing_tds:0,receiving_tds:0,statsAvailable:true,offense_snaps:20}]])};
 const report=await store.performance(2026,1,{games:new Map([[game.game_id,finalGame]]),datasets:[]});
 assert.equal(report.summary.profileTd.n,2);assert.ok(Math.abs(report.summary.profileTd.brier-.07625)<1e-12);
 assert.deepEqual(report.rows.map(r=>r.profileTdActual),[1,0]);
 finalGame.players.get('p2').receiving_tds=null;
 const missing=await store.performance(2026,1,{games:new Map([[game.game_id,finalGame]]),datasets:[]});
 assert.equal(missing.summary.profileTd.n,1);
});
test('a new TD calibration is captured alongside an earlier same-day model snapshot',async t=>{
 const store=await temporaryStore(t),b=board();b.market='any_td';b.players[0].prop={...prop,line:.5};b.players[0].tdProb=.4;
 await store.capture(b,[game],artifact);
 b.players[0].tdProb=.7;b.players[0].tdProbMethod='historical-score-calibration';b.players[0].tdCalibrationId='fit-2025';
 await store.capture(b,[game],artifact);
 const batches=await store.batches(2026,1);
 assert.equal(batches.length,2);assert.deepEqual(batches.map(x=>x.records[0].original.tdProb).sort(),[.4,.7]);
 assert.ok(batches.some(x=>x.profileCalibrationId==='fit-2025'));
});
test('TD accuracy uses the latest calibrated snapshot even when an older line stays eligible',async t=>{
 const store=await temporaryStore(t),b=board();b.market='any_td';b.players[0].prop={...prop,line:.5};b.players[0].tdProb=.4;
 await store.capture(b,[game],artifact);
 b.players[0].prop=null;b.players[0].tdProb=.7;b.players[0].tdProbMethod='historical-score-calibration';b.players[0].tdCalibrationId='fit-2025';
 b.players.push({...b.players[0],playerId:'p2',prop:{...prop,line:.5},tdProbMethod:null,tdCalibrationId:null});
 await store.capture(b,[game],artifact);
 const finalGame={...game,complete:true,plays:[],players:new Map([['p1',{rushing_tds:1,receiving_tds:0,statsAvailable:true,offense_snaps:30}],['p2',{rushing_tds:0,receiving_tds:0,statsAvailable:true,offense_snaps:20}]])};
 const report=await store.performance(2026,1,{games:new Map([[game.game_id,finalGame]]),datasets:[]});
 assert.equal(report.rows.find(r=>r.playerId==='p1').original.tdProb,.4);
 assert.equal(report.summary.profileTd.n,1);assert.ok(Math.abs(report.summary.profileTd.brier-.09)<1e-12);
});
test('a later exclusion does not erase a real earlier eligible prediction',async t=>{
 const store=await temporaryStore(t),b=board();await store.capture(b,[game],artifact);const batch=(await store.batches(2026,1))[0];
 await store.append(store.prefix(2026,1)+'rush_yds/later.json',{...batch,createdAt:'2026-09-13T16:00:00Z',records:batch.records.map(r=>({...r,eligible:false,prop:null}))});store.cache.clear();
 const report=await store.performance(2026,1,{games:new Map()});assert.equal(report.rows[0].eligible,true);assert.equal(report.rows[0].prop.line,30.5);
});
test('probability comparisons use the same cohort, exclude pushes and include no-lean forecasts',()=>{
 const make=(id,outcome,lean,average)=>({id,market:'rush_yds',eligible:true,outcome,hit:lean?(outcome===lean?'hit':'miss'):null,forecast:{point:4,lean,probability:{over:.8,under:.2,push:0},reasons:[]},average:{point:5,probability:average?{over:.5,under:.5,push:0}:null},original:{projected:5},actual:{status:'final',actual:6}});
 const s=summarize([make('a','over',null,true),make('b','under','over',true),make('c','push',null,true),make('d','over','over',false)]);
 assert.equal(s.candidate.n,2);assert.equal(s.average.n,2);assert.ok(Math.abs(s.candidate.brier-.34)<1e-10);assert.equal(s.records,4);assert.equal(s.noLean,2);assert.equal(s.pushes,1);
});
test('availability joins ESPN IDs and never applies current injury reports to old games',async()=>{
 const store=new AvailabilityStore({now:()=>now,fetcher:async()=>new Response(JSON.stringify({injuries:[{injuries:[{status:'Out',date:'2026-09-13',athlete:{id:'123'}}]}]}))});const feed=await store.load();
 assert.equal(store.forPlayer(feed,'123',true).concern,true);assert.equal(store.forPlayer(feed,'123',false).status,'historical_unavailable');assert.equal(store.forPlayer(feed,null,true).status,'unavailable');assert.equal(store.forPlayer(feed,'456',true).status,'No injury listing');
});
test('large weekly archives paginate without truncating totals or mixing an updated export',()=>{
 const report={archiveVersion:'v1',summary:{records:2500},sourceReceipts:[{url:'source'}],rows:Array.from({length:2500},(_,i)=>({id:i,market:i%2?'rec':'rush_yds'}))};
 const first=performancePage(report);assert.equal(first.rows.length,100);assert.equal(first.pagination.total,2500);assert.equal(first.pagination.nextOffset,100);assert.equal(first.summary.records,2500);
 const next=performancePage(report,{offset:100});assert.equal(next.rows[0].id,100);assert.equal(next.pagination.previousOffset,0);
 const filtered=performancePage(report,{market:'rec',offset:1200});assert.equal(filtered.rows.length,50);assert.equal(filtered.pagination.total,1250);assert.equal(filtered.pagination.nextOffset,null);assert.deepEqual(filtered.sourceReceipts,report.sourceReceipts);
 assert.throws(()=>performancePage(report,{offset:-1}),{status:400});assert.throws(()=>performancePage(report,{market:'invalid'}),{status:400});assert.throws(()=>performancePage(report,{archiveVersion:'v0'}),{status:409});
});
test('export version survives cold-instance fetch times but detects changed result data',async t=>{
 const store=await temporaryStore(t),bundle={games:new Map(),datasets:[{type:'weekly',year:2026,meta:{sha256:'same',available:true,fetchedAt:'first'}}]};
 const a=await store.performance(2026,1,bundle);bundle.datasets[0].meta.fetchedAt='second';const b=await store.performance(2026,1,bundle);assert.equal(a.archiveVersion,b.archiveVersion);
 bundle.datasets[0].meta.sha256='corrected';const c=await store.performance(2026,1,bundle);assert.notEqual(a.archiveVersion,c.archiveVersion);
});

test('new model versions append alongside prior daily snapshots and preserve the original rating comparison',async t=>{
 const store=await temporaryStore(t),b=board(),legacyKey=store.prefix(2026,1)+'rush_yds/2026-09-13.json';
 const legacy={schema:1,createdAt:new Date(now-60000).toISOString(),candidateVersion:'workload-context-v2',records:[]};await store.append(legacyKey,legacy);
 b.players[0].baseRating={score:70,projected:39,tdProb:null};b.players[0].modelScore=82;b.players[0].forecast.teammateImpact={applied:true,rating:{before:70,after:82,delta:12}};
 await store.capture(b,[game],artifact);const batches=await store.batches(2026,1);assert.equal(batches.length,2);assert.deepEqual(await store.read(legacyKey),legacy);
 const current=batches.find(x=>x.candidateVersion==='workload-opportunities-v4.1');assert.equal(current.records[0].original.score,70);assert.equal(current.records[0].adjustedRating.after,82);assert.equal(current.records[0].forecast.teammateImpact.rating.before,70);
});
