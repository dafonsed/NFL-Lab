// Read-only serving-code investigation. All inputs are existing local files.
// Writes new explanatory evidence only; no fitting, network, board capture or model edits.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Provider} from '../lib/providers.mjs';
import * as model from '../lib/model.mjs';
import * as before from '../.research/standard-model-before/lib/model.mjs';
import {buildLivePriors} from '../lib/live-nfl-model.mjs';
import {buildLivePriors as oldLivePriors} from '../.research/standard-model-before/lib/live-nfl-model.mjs';
import {kickoffTime} from '../lib/game-time.mjs';
import {ratingFromComponents} from '../lib/rating.mjs';
import {project} from '../lib/forecast.mjs';
import {forecastInputs,predictMean,design} from '../lib/mlb/forecast-core.mjs';
import {attachMlbForecast} from '../lib/mlb/forecast.mjs';
import {MLB_MARKETS} from '../lib/mlb/markets.mjs';
import {SPORTS} from '../lib/sports/config.mjs';
import {normalizeSummary} from '../lib/sports/normalize.mjs';
import {predict,historyBefore} from '../lib/sports/model.mjs';
import {positionGroup} from '../lib/sports/opportunities.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const sum=(a,k)=>a.reduce((s,r)=>s+Number(r[k]||0),0);
const report={generatedAt:new Date().toISOString(),scope:'Offline local reconstruction, not production; no model changes.',sources:[]};
const servingFiles=(await fs.readdir('lib',{recursive:true})).filter(f=>/\.(mjs|json)$/.test(f));
const initial=await Promise.all(servingFiles.map(async file=>({file,hash:sha(await fs.readFile('lib/'+file))})));
const provider=new Provider({fetcher:async()=>{throw Error('Offline explanation');}});
const specs=[['schedule',null],...['pbp','weekly','roster','weeklyRoster','snaps'].flatMap(k=>[2024,2025,2026].map(y=>[k,y]))];
const datasets=await Promise.all(specs.map(async([type,year])=>({type,year,...await provider.load(type,year,{optional:true})})));
const get=k=>datasets.filter(d=>d.type===k).flatMap(d=>d.rows);
report.sources=datasets.map(d=>({type:d.type,year:d.year,...d.meta}));
const rosters=[...get('roster'),...get('weeklyRoster')],raw={schedule:get('schedule'),pbp:get('pbp'),weekly:get('weekly'),rosters,snaps:get('snaps'),chart:[]};
const games=model.prepareData(raw),ratesByYear=new Map();
for(const season of [2025,2026]){const p=get('pbp').filter(p=>Number(p.season)===season-1&&games.get(p.game_id)?.complete);ratesByYear.set(season,{current:model.buildRates(p),before:before.buildRates(p)});}
const allMarkets=['any_td','pass_yds','pass_tds','rush_yds','rec','rush_attempts','rec_yds','pass_attempts','pass_completions','pass_interceptions','rush_rec_yds'];
const rows=[],boards=[];
for(const season of [2025,2026]){
 const weeks=season===2026?[3]:[...new Set([...games.values()].filter(g=>Number(g.season)===season&&g.complete&&g.game_type!=='PRE').map(g=>Number(g.week)))].sort((a,b)=>a-b);
 for(const week of weeks)for(const market of allMarkets){
  const ps=model.buildPlayers({games,rosters,season,week,market,rates:ratesByYear.get(season).current,trainingSeason:season-1});
  const usable=ps.filter(p=>Number.isFinite(p.modelScore));
  const patterns=new Set(usable.map(p=>p.details.rating.missing.join(',')||'complete'));
  boards.push({season,week,market,n:ps.length,finite:usable.length,patterns:[...patterns]});
  for(const p of ps)rows.push({season,week,market,player:p.player,playerId:p.playerId,position:p.position,gameId:p.gameId,rank:p.rank,boardSize:ps.length,rankPercentile:ps.length>1?(p.rank-1)/(ps.length-1):0,score:p.modelScore,missing:p.details.rating.missing,pattern:p.details.rating.missing.join(',')||'complete',components:p.details.components});
 }
 console.log('NFL ranking census complete',season);
}
const quantile=(xs,p)=>{const a=xs.slice().sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)]??null;};
const groups=new Map();for(const r of rows){const key=[r.season,r.market,r.pattern].join('|'),a=groups.get(key)||[];a.push(r);groups.set(key,a);}
report.missingness={syntheticExample:{complete:ratingFromComponents('rec',{volume:80,baseline:0,matchup:0}),missing:ratingFromComponents('rec',{volume:80,baseline:null,matchup:null}),missingVolume:ratingFromComponents('rec',{volume:null,baseline:40,matchup:null}),zeroVolume:ratingFromComponents('rec',{volume:0,baseline:40,matchup:null})},boards,groups:[...groups].map(([key,a])=>{const s=a.map(r=>r.score).filter(Number.isFinite);return {key,n:a.length,uniquePlayers:new Set(a.map(r=>r.playerId)).size,finite:s.length,min:quantile(s,0),p10:quantile(s,.1),median:quantile(s,.5),p90:quantile(s,.9),max:quantile(s,1),mean:mean(s),meanRank:mean(a.map(r=>r.rank)),meanRankPercentile:mean(a.map(r=>r.rankPercentile)),top10:a.filter(r=>r.rank<=10).length,positions:Object.fromEntries([...new Set(a.map(r=>r.position))].map(p=>[p,a.filter(r=>r.position===p).length]))};}),mixedBoardCount:boards.filter(b=>b.patterns.length>1).length,rowFile:'reports/standard-model-missingness-rows.jsonl',recentExamples:rows.filter(r=>r.season===2026&&r.market==='any_td'&&r.pattern!=='complete').slice(0,12)};
await fs.writeFile(report.missingness.rowFile,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
report.nflExamples=[];
for(const [season,week,market,name] of [[2025,1,'pass_tds','Kyler Murray'],[2025,1,'rec','Alvin Kamara'],[2026,3,'pass_tds','Josh Allen'],[2026,3,'rec','Justin Jefferson'],[2026,3,'any_td','Saquon Barkley']]){
 const args={games,rosters,season,week,market,trainingSeason:season-1},p=model.buildPlayers({...args,rates:ratesByYear.get(season).current}).find(p=>p.player===name);if(!p)continue;
 const old=before.buildPlayers({...args,rates:ratesByYear.get(season).before}).find(q=>q.playerId===p.playerId);
 const sampleIds=new Set(p.details.sample.map(s=>s.gameId)),plays=[...sampleIds].flatMap(id=>games.get(id).plays);
 const depth=p=>{const v=model.number(p.air_yards);return v===null?'unknown':v<0?'behind':v<10?'short':v<20?'medium':'deep';};
 const used=plays.filter(q=>market==='rec'?model.targetPlay(q)&&q.receiver_player_id===p.playerId:model.passPlay(q)&&!Number(q.qb_spike)&&q.passer_player_id===p.playerId);
 const buckets=market==='any_td'?[]:[...new Set(used.map(q=>market==='rec'?depth(q):model.zoneFor(model.number(q.yardline_100))))].map(bin=>{const count=used.filter(q=>(market==='rec'?depth(q):model.zoneFor(model.number(q.yardline_100)))===bin).length,prior=ratesByYear.get(season),oldRate=market==='rec'?prior.before.depths[bin]?.catchRate:prior.before.zones['pass:'+bin]?.rate,newRate=market==='rec'?prior.current.receiving[bin]?.catchRate:prior.current.passing[bin]?.rate;return {bin,count,oldRate,newRate,oldExpected:count*oldRate,newExpected:count*newRate};});
 const g=games.get(p.gameId);report.nflExamples.push({season,week,market,date:g.gameday,matchup:g.away_team+' @ '+g.home_team,player:p.player,playerId:p.playerId,current:p,before:{projected:old?.projected,debt:old?.debt,modelScore:old?.modelScore},buckets,rawPriorRates:ratesByYear.get(season),simpleWorkloadProjectFromFive:project(p.details.sample,market)});
}
const negativeOutcomes=get('weekly').filter(r=>Number(r.carries)>0&&Number(r.rushing_yards)<0).map(r=>({player:r.player_display_name,playerId:r.player_id,gameId:r.game_id,carries:Number(r.carries),yards:Number(r.rushing_yards)}));
const neg=[];
for(const g of get('schedule').filter(g=>Number(g.season)===2026&&Number(g.week)===3)){
 const game={date:kickoffTime(g),season:2026,teams:[{abbreviation:g.home_team},{abbreviation:g.away_team}]};
 const args={weekly:get('weekly').filter(r=>[2025,2026].includes(Number(r.season))),rosters:datasets.find(d=>d.type==='roster'&&d.year===2026).rows,schedule:get('schedule'),game};
 const priors=buildLivePriors(args),old=oldLivePriors(args);
 for(const [key,p] of priors){const carries=sum(p.sample,'carries'),yards=sum(p.sample,'rushingYards');if(carries&&yards<0){const gsis=p.gsisId;const rs=rosters.find(r=>r.gsis_id===gsis);const ids=new Set(p.sample.map(r=>r.gameId)),rawPlays=get('pbp').filter(q=>ids.has(q.game_id)&&q.rusher_player_id===gsis&&Number(q.rush_attempt)===1&&model.validPlay(q));neg.push({player:rs?.full_name,key,targetGame:g.game_id,sample:p.sample,carries,yards,unflooredEfficiency:yards/carries,servedEfficiency:p.efficiency.rush_yds,beforeEfficiency:old.get(key)?.efficiency.rush_yds,prior:p,kneels:rawPlays.filter(q=>Number(q.qb_kneel)===1).length,nonKneelRushes:rawPlays.filter(q=>Number(q.qb_kneel)!==1).length,playEvidence:rawPlays.map(q=>({gameId:q.game_id,playId:q.play_id,yards:q.rushing_yards,kneel:q.qb_kneel,description:q.desc}))});}}
}
report.negativeYardage={outcomeCount:negativeOutcomes.length,outcomes:negativeOutcomes,negativeLivePriors:neg,conclusion:'Negative raw historical efficiency is floored to zero by both prior builders. The audit guard therefore receives zero on these normal serving paths, not the negative raw rate. No persisted live scoreboard/box/clock snapshot was available; live final outputs not replayed.'};
console.log('Negative historical live-prior cases',neg.length);
// MLB: actual 2025 rows; latest eligible hitting appearance for Shohei Ohtani.
const mlb=await read('data-independent/mlb-training/2025.json'),artifact=await read('lib/artifacts/mlb-model.json');
const person=660271,market='hits',playerRows=mlb.rows.filter(r=>r.playerId===person),target=playerRows.filter(r=>r.role==='hitting').sort((a,b)=>b.date.localeCompare(a.date)||b.gameId-a.gameId)[0];
const fitted=artifact.models[market],input=forecastInputs(playerRows,target,market,fitted.prior),z=design(input.x,fitted),terms=z.map((v,i)=>({feature:i?artifact.features[i-1]:'Intercept',raw:i?input.x[i-1]:1,center:i?fitted.centers[i-1]:null,scale:i?fitted.scales[i-1]:null,standardized:v,coefficient:fitted.coefficients[i],contribution:v*fitted.coefficients[i]}));
const p={playerId:person,player:'Shohei Ohtani',role:'hitting',home:target.home,opponentId:target.opponentId,abstractState:'Final',gameType:'R',lineupStatus:'unconfirmed'};
attachMlbForecast(p,playerRows,target.date,market,[],{now:Date.parse(target.date+'T12:00Z')});
report.mlbExample={player:p.player,market,target,input,model:fitted,terms,logMean:sum(terms,'contribution'),basePoint:predictMean(input,fitted),forecast:p.forecast,sample:input.games.map(id=>playerRows.find(r=>r.role==='hitting'&&r.gameId===id)),excluded:playerRows.filter(r=>!input.games.includes(r.gameId)||r.role!=='hitting').map(r=>({gameId:r.gameId,date:r.date,role:r.role,reason:r.role!=='hitting'?'other role':r.date>=target.date?'same/future date':'outside 100-day/60-appearance selection'}))};
// Rebuild the saved WNBA forecast from its specific source URL receipts.
const archivePath='data-independent/predictions/sports-forecasts/v1/preview/wnba/wnba/2026-09-22/401857209/points/wnba-opportunities-v1-2026-09-22-21.json';
const archive=await read(archivePath),saved=archive.players.find(p=>p.id==='3142191'),history=[],receipts=[];
for(const s of archive.sources.filter(s=>s.url.includes('/summary?event=')&&!s.url.endsWith(archive.game.id))){const path='data-independent/mlb/sports/raw/'+sha(s.url)+'.json';try{const raw=await read(path);const h=normalizeSummary(raw.payload,'wnba');h.game.competition='wnba';history.push(h);receipts.push({path,url:s.url,hashMatchesArchive:raw.sha256===s.sha256,fetchedAt:raw.fetchedAt});}catch(e){receipts.push({path,error:e.message});}}
const past=historyBefore(history,archive.game),latest=past.flatMap(h=>h.players).find(p=>p.id===saved.id);
if(latest){const player={...latest,home:true,teamId:archive.game.home.id,opponentId:archive.game.away.id,starter:false,lineupConfirmed:false,availability:saved.forecast.availability};
 const budget=saved.forecast.inputEffects.find(e=>e.label==='Team playing-time budget');
 const result=predict({sport:'wnba',market:'points',player,target:archive.game,history,weather:archive.weather,prop:saved.prop,minuteBudget:budget,injury:saved.forecast.injury});
 const pool=past.flatMap(h=>h.players.filter(p=>Number.isInteger(p.stats.points)&&p.stats.points>=0&&p.minutes>0&&positionGroup(p,'wnba')===positionGroup(player,'wnba'))),priorRate=sum(pool.map(p=>p.stats),'points')/sum(pool,'minutes');
 const f=result.inputs,exactRate=(f.production+f.priorMinutes*priorRate)/(f.exposure+f.priorMinutes);
 report.wnbaExample={archivePath,createdAt:archive.createdAt,player:saved.player,target:archive.game,prop:saved.prop,receipts,pool:{rows:pool.length,points:sum(pool.map(p=>p.stats),'points'),minutes:sum(pool,'minutes'),priorRate},exactRate,exactBase:exactRate*f.baseMinutes,exactWorkload:f.baseMinutes*budget.factor,archived:saved.forecast,reproduced:result,pointMatches:result.point===saved.forecast.point,probabilityMatches:JSON.stringify(result.probability)===JSON.stringify(saved.forecast.probability),note:'Minute-budget factor and availability come from the saved local archive; raw history rebuilt from matching receipt URLs. Full candidate roster not archived, so budget factor is not independently reconstructed.'};
}else report.wnbaExample={archivePath,error:'Historical player not found',receipts};
report.servingFileHashes=await Promise.all(initial.map(async r=>({...r,unchanged:r.hash===sha(await fs.readFile('lib/'+r.file))})));
await fs.writeFile('reports/standard-model-explanation.json',JSON.stringify(report,null,2)+'\n');
// Generate complete numerical coefficient/market appendix directly from current artifacts.
let md='# Standard-model formula and coefficient appendix\n\nGenerated by `node --max-old-space-size=6144 scripts/explain-standard-model.mjs`. Values are read, never fitted. See the deep explanation for interpretation and missing-input rules.\n\n## MLB frozen regressions\n\nFor each market: zᵢ=(xᵢ−centerᵢ)/scaleᵢ; log μ=intercept+Σ coefficientᵢzᵢ; μ=exp(clamp(log μ,−9,ln 50)). Feature order: '+artifact.features.join('; ')+'.\n';
for(const [k,m] of Object.entries(artifact.models)){md+='\n### '+k+'\n\nPrior rate '+m.prior.rate+'; prior workload '+m.prior.workload+'; dispersion `'+JSON.stringify(m.dispersion)+'`.\n\n|Feature|Center|Scale|Coefficient|\n|---|---:|---:|---:|\n|Intercept|—|—|'+m.coefficients[0]+'|\n';artifact.features.forEach((f,i)=>md+='|'+f+'|'+m.centers[i]+'|'+m.scales[i]+'|'+m.coefficients[i+1]+'|\n');}
for(const file of ['nfl-context.json','mlb-context.json']){const a=await read('lib/artifacts/'+file);md+='\n## '+file+'\n\nOrder: opponent relative rate; (outdoor °F−65)/20; outdoor wind mph/10. Enabled terms multiply max(1, base). Disabled rows are research only.\n\n|Market/position|Enabled|Opponent|Temperature|Wind|\n|---|---|---:|---:|---:|\n';for(const [key,m]of Object.entries(a.models||a.contextModels))md+='|'+key+'|'+!!m.enabled+'|'+m.coefficients.join('|')+'|\n';}
md+='\n## All shared-sport market fields\n\nCounts are summed before estimating the rate and variance; the threshold is a research benchmark, not a sportsbook quote.\n\n|Sport|Market|Source fields|Threshold|Population|\n|---|---|---|---:|---|\n';for(const [sport,c]of Object.entries(SPORTS))for(const [k,m]of Object.entries(c.markets))md+='|'+sport+'|'+k+'|'+m.fields.join(' + ')+'|'+m.benchmark+'|'+(m.team?'team':m.goalie?'goalkeeper':'player')+'|\n';
md+='\n## MLB profile scales\n\nProfile rating=100×clamp((0.6×full mean+0.4×recent mean)/scale,0,1).\n\n|Market|Fields|Scale|\n|---|---|---:|\n';for(const [k,m]of Object.entries(MLB_MARKETS))md+='|'+k+'|'+(m.fields?.join(' + ')||m.field||'derived; see markets.mjs')+'|'+m.scale+'|\n';
await fs.writeFile('docs/standard-model-formula-appendix.md',md);
console.log(JSON.stringify({groups:report.missingness.groups,mixedBoards:report.missingness.mixedBoardCount,negativePriors:neg.map(p=>({player:p.player,raw:p.unflooredEfficiency,served:p.servedEfficiency,before:p.beforeEfficiency})),wnbaMatch:report.wnbaExample.pointMatches,mlbPoint:report.mlbExample.forecast.point,servingChanged:report.servingFileHashes.filter(f=>!f.unchanged)},null,2));
