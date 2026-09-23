import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { put, list, get } from '@vercel/blob';
import { DATA_DIR } from './providers.mjs';
import { FORECAST_VERSION, distribution, lineProbabilities } from './forecast.mjs';
import { actualResult } from './results.mjs';
import { MARKETS } from './markets.mjs';
import { freshPregameQuote as freshQuote } from './pregame-quote.mjs';
export { freshQuote };
import { kickoffTime } from './game-time.mjs';
export { kickoffTime };

export class PredictionStore {
  constructor({dir=DATA_DIR,now=()=>Date.now(),cloud=!!process.env.VERCEL,environment=process.env.VERCEL_ENV||'local',blob={put,list,get}}={}) {
    this.dir=path.join(dir,'predictions');this.now=now;this.cloud=cloud;this.blob=blob;this.environment=environment==='production'?'production':'preview';this.cache=new Map();this.written=new Map();
  }
  get status(){return {kind:this.cloud?'private Vercel Blob':'local files',durable:!this.cloud||!!process.env.BLOB_READ_WRITE_TOKEN,environment:this.cloud?this.environment:'local',cadence:'First available pregame snapshot per model version, market and UTC day. Daily scheduled capture around 10:00 UTC plus board visits; not closing lines.'};}
  prefix(season,week){return `nfl-predictions/v1/${this.environment}/${season}/${String(week).padStart(2,'0')}/`;}
  async read(key){
    if(!this.cloud){try{return JSON.parse(await fs.readFile(path.join(this.dir,key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
    const result=await this.blob.get(key,{access:'private'});return result?await new Response(result.stream).json():null;
  }
  async append(key,data){
    if(!this.cloud){const file=path.join(this.dir,key),temp=file+'.'+randomUUID()+'.tmp';await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temp,JSON.stringify(data),{flag:'wx'});try{await fs.link(temp,file);return data;}catch(e){if(e.code!=='EEXIST')throw e;return this.read(key);}finally{await fs.unlink(temp);}}
    try{await this.blob.put(key,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});return data;}
    catch(e){if(!/already exists/i.test(e.message))throw e;return this.read(key);}
  }
  async capture(board,games,artifact){
    const now=this.now(),day=new Date(now).toISOString().slice(0,10),key=this.prefix(board.current.season,board.current.week)+`${board.market}/${day}-${FORECAST_VERSION}.json`;
    const existing=this.written.get(key);if(existing)return this.mark(board,existing);
    const byGame=new Map(games.map(g=>[g.game_id,g]));
    const records=board.players.flatMap(p=>{
      const game=byGame.get(p.gameId),kickoff=kickoffTime(game),start=Date.parse(kickoff);
      if(!Number.isFinite(start)||start<=now||start-now>7*86400000||game.complete)return [];
      const eligible=freshQuote(p.prop,now,kickoff)&&!board.stale&&Number.isFinite(p.forecast?.point);
      const averageDist=Number.isFinite(p.forecast?.baseline)?distribution(p.forecast.baseline,board.market,p.position,artifact,'average'):null;
      return [{id:`${p.gameId}:${p.playerId}:${board.market}`,gameId:p.gameId,playerId:p.playerId,player:p.player,team:p.team,opponent:p.opponent,position:p.position,kickoff,market:board.market,eligible,exclusion:eligible?null:!p.prop?'No posted line':board.stale?'Stale statistical source':'No fresh pregame line or forecast',prop:p.prop||null,forecast:p.forecast,original:{version:board.model.version,score:p.baseRating?.score??p.modelScore,projected:p.baseRating?.projected??p.projected,tdProb:p.baseRating?.tdProb??p.tdProb},adjustedRating:p.forecast?.teammateImpact?.rating||null,average:{point:p.forecast?.baseline,probability:averageDist?.local&&averageDist.count>=100?lineProbabilities(averageDist,p.prop?.line,board.market):null}}];
    });
    if(!records.some(r=>r.eligible))return {...this.status,state:'waiting',message:'Waiting for fresh upcoming lines; no pregame record invented.',records:0};
    const batch={schema:1,season:board.current.season,week:board.current.week,market:board.market,createdAt:new Date(this.now()).toISOString(),candidateVersion:FORECAST_VERSION,artifactId:artifact.id,deployment:{commit:process.env.VERCEL_GIT_COMMIT_SHA||null,url:process.env.VERCEL_URL||null},datasets:board.datasets,records:records.filter(r=>Date.parse(r.kickoff)>this.now())};
    const saved=await this.append(key,structuredClone(batch));this.written.set(key,saved);if(this.written.size>50)this.written.delete(this.written.keys().next().value);this.cache.delete(this.prefix(batch.season,batch.week));return this.mark(board,saved);
  }
  mark(board,batch){for(const p of board.players){const record=batch.records.find(r=>r.playerId===p.playerId&&r.gameId===p.gameId);if(record&&p.forecast)p.forecast.capture={version:record.forecast?.version,artifactId:record.forecast?.artifactId,createdAt:batch.createdAt,line:record.prop?.line,eligible:record.eligible,id:record.id};}return {...this.status,state:'saved',createdAt:batch.createdAt,records:batch.records.length,eligible:batch.records.filter(r=>r.eligible).length};}
  async batches(season,week){
    const prefix=this.prefix(season,week),cached=this.cache.get(prefix);if(cached&&this.now()-cached.at<300000)return cached.data;
    let keys=[];
    if(this.cloud){let cursor;do{const page=await this.blob.list({prefix,cursor,limit:1000});keys.push(...page.blobs.map(b=>b.pathname));cursor=page.hasMore?page.cursor:null;}while(cursor);}
    else{const root=path.join(this.dir,prefix);try{const folders=await fs.readdir(root,{withFileTypes:true});for(const f of folders.filter(f=>f.isDirectory()&&f.name!=='settlements'))for(const name of await fs.readdir(path.join(root,f.name)))if(name.endsWith('.json'))keys.push(prefix+f.name+'/'+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
    keys=keys.filter(k=>!k.includes('/settlements/'));
    const data=[];for(let i=0;i<keys.length;i+=12)data.push(...await Promise.all(keys.slice(i,i+12).map(k=>this.read(k))));
    this.cache.set(prefix,{at:this.now(),data:data.filter(Boolean)});return data.filter(Boolean);
  }
  async performance(season,week,bundle){
    const batches=await this.batches(season,week),selected=new Map();
    // Latest eligible pregame snapshot; a later missing quote cannot erase one.
    // For coverage, keep the latest excluded snapshot when none was eligible.
    for(const b of batches.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))for(const r of b.records)if(Date.parse(b.createdAt)<Date.parse(r.kickoff)&&(r.eligible||!selected.get(r.id)?.eligible))selected.set(r.id,{...r,capturedAt:b.createdAt});
    const rows=[...selected.values()].map(r=>{
      const actual=actualResult(bundle.games.get(r.gameId),r.playerId,r.market);
      const outcome=actual.status==='final'&&r.eligible?(actual.actual>r.prop.line?'over':actual.actual<r.prop.line?'under':'push'):null;
      return {...r,actual,outcome,hit:outcome&&r.forecast.lean?outcome==='push'?'push':outcome===r.forecast.lean?'hit':'miss':null};
    });
    const summary=summarize(rows);
    const sourceReceipts=batches.map(b=>({createdAt:b.createdAt,market:b.market,artifactId:b.artifactId,deployment:b.deployment,datasets:b.datasets}));
    const resultSources=(bundle.datasets||[]).map(d=>({type:d.type,season:d.year,...d.meta}));
    // Identical source bytes fetched by different function instances have the
    // same export version; only changed data/coverage should invalidate a page.
    const resultVersions=resultSources.map(s=>({type:s.type,season:s.season,sha256:s.sha256,available:s.available}));
    const archiveVersion=createHash('sha256').update(JSON.stringify({sourceReceipts,resultVersions})).digest('hex');
    return {season,week,storage:this.status,snapshots:batches.length,rows,summary,sourceReceipts,resultSources,checkedAt:new Date(this.now()).toISOString(),archiveVersion,method:'Latest eligible snapshot actually saved before kickoff per player/game/market; if none was eligible, the latest exclusion is retained. Selection never uses the game result. Statistical results use the frozen line, not a later sportsbook line. No odds or profit calculation.'};
  }
  async settle(season,week,bundle){
    const report=await this.performance(season,week,bundle),finals=report.rows.filter(r=>r.actual.status==='final').map(r=>({id:r.id,capturedAt:r.capturedAt,actual:r.actual,outcome:r.outcome,hit:r.hit}));
    if(finals.length){const hash=createHash('sha256').update(JSON.stringify(finals)).digest('hex').slice(0,20);await this.append(this.prefix(season,week)+`settlements/${hash}.json`,{checkedAt:new Date(this.now()).toISOString(),sources:bundle.datasets.map(d=>d.meta),results:finals});}
    return {records:report.rows.length,finals:finals.length};
  }
}
export function performancePage(report,input={}){
  const offset=Number(input.offset||0),market=input.market||'';
  if(!Number.isInteger(offset)||offset<0||offset>100000||market&&!MARKETS.includes(market))throw Object.assign(Error('Choose a valid market and record page.'),{status:400});
  if(input.archiveVersion&&input.archiveVersion!==report.archiveVersion)throw Object.assign(Error('The archive updated during export. Refresh and export again.'),{status:409});
  const rows=report.rows.filter(r=>!market||r.market===market),limit=100;
  return {...report,rows:rows.slice(offset,offset+limit),pagination:{offset,limit,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,previousOffset:offset?Math.max(0,offset-limit):null,market}};
}
export function summarize(rows){
  const eligible=rows.filter(r=>r.eligible),settled=eligible.filter(r=>r.outcome),decided=settled.filter(r=>r.outcome!=='push'),leans=eligible.filter(r=>r.forecast.lean),gradedLeans=leans.filter(r=>r.hit==='hit'||r.hit==='miss');
  const reasons={};for(const r of rows)for(const reason of [...(r.exclusion?[r.exclusion]:[]),...(r.forecast?.reasons||[])])reasons[reason]=(reasons[reason]||0)+1;
  const comparable=decided.filter(r=>Number.isFinite(r.forecast?.probability?.over)&&Number.isFinite(r.average?.probability?.over)&&r.forecast.probability.push<1&&r.average.probability.push<1);
  const probabilityMetrics=key=>{const usable=comparable,bins=Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,n:0,predicted:0,actual:0}));let brier=0,logLoss=0;for(const r of usable){const p=Math.min(1,r[key].probability.over/Math.max(1e-9,1-r[key].probability.push)),y=Number(r.outcome==='over'),clamped=Math.max(.000001,Math.min(.999999,p)),bin=bins[Math.min(9,Math.floor(p*10))];brier+=(p-y)**2;logLoss-=y*Math.log(clamped)+(1-y)*Math.log(1-clamped);bin.n++;bin.predicted+=p;bin.actual+=y;}return {n:usable.length,brier:usable.length?brier/usable.length:null,logLoss:usable.length?logLoss/usable.length:null,bins:bins.map(b=>({...b,predicted:b.n?b.predicted/b.n:null,actual:b.n?b.actual/b.n:null}))};};
  const paired=settled.filter(r=>r.market!=='any_td'&&Number.isFinite(r.original.projected)&&Number.isFinite(r.forecast.point));
  const byMarket={};for(const market of new Set(rows.map(r=>r.market))){const cohort=settled.filter(r=>r.market===market),p=paired.filter(r=>r.market===market);byMarket[market]={records:rows.filter(r=>r.market===market).length,eligible:eligible.filter(r=>r.market===market).length,settled:cohort.length,pairedN:p.length,originalMAE:p.length?p.reduce((a,r)=>a+Math.abs(r.original.projected-r.actual.actual),0)/p.length:null,candidateMAE:p.length?p.reduce((a,r)=>a+Math.abs(r.forecast.point-r.actual.actual),0)/p.length:null,averageMAE:p.length?p.reduce((a,r)=>a+Math.abs(r.average.point-r.actual.actual),0)/p.length:null};}
  return {records:rows.length,eligible:eligible.length,excluded:rows.length-eligible.length,settled:settled.length,pending:eligible.filter(r=>r.actual.status==='pending').length,missingStats:eligible.filter(r=>['no_stats','did_not_play'].includes(r.actual.status)).length,pushes:settled.filter(r=>r.outcome==='push').length,leans:leans.length,noLean:eligible.length-leans.length,leanCoverage:eligible.length?leans.length/eligible.length:null,leanWins:gradedLeans.filter(r=>r.hit==='hit').length,leanLosses:gradedLeans.filter(r=>r.hit==='miss').length,leanHitRate:gradedLeans.length?gradedLeans.filter(r=>r.hit==='hit').length/gradedLeans.length:null,candidate:probabilityMetrics('forecast'),average:probabilityMetrics('average'),reasons,byMarket};
}
