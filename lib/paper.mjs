import fs from 'node:fs/promises';
import path from 'node:path';
import { PredictionStore,freshQuote } from './predictions.mjs';
export function americanPrice(value){
  if(value==null||value===''||!Number.isFinite(Number(value))||Math.abs(Number(value))<100)return null;
  const american=Number(value);return {american,decimal:american>0?1+american/100:1+100/Math.abs(american)};
}
export function quotePrices(value){return {over:americanPrice(value?.over),under:americanPrice(value?.under)};}
export function settlePaper(record,actual){
  const base={status:'pending',profit:null,stake:0};
  if(['did_not_play','did_not_bat','void'].includes(actual?.status))return {...base,status:'void'};
  if(actual?.status!=='final'||!Number.isFinite(actual.actual))return {...base,status:actual?.status||'pending'};
  const price=record.prop?.prices?.[record.side];if(!price||!Number.isFinite(price.decimal)||price.decimal<=1)return {...base,status:'missing_price'};
  if(actual.actual===record.prop.line)return {status:'push',profit:0,stake:1};
  const win=record.side==='over'?actual.actual>record.prop.line:actual.actual<record.prop.line;
  return {status:win?'win':'loss',profit:win?price.decimal-1:-1,stake:1};
}
export function paperSummary(rows){
  const done=rows.filter(r=>Number.isFinite(r.paper.profit)),staked=done.reduce((s,r)=>s+r.paper.stake,0),profit=done.reduce((s,r)=>s+r.paper.profit,0);
  return {records:rows.length,settled:done.length,pending:rows.filter(r=>r.paper.status==='pending').length,voids:rows.filter(r=>r.paper.status==='void').length,wins:rows.filter(r=>r.paper.status==='win').length,losses:rows.filter(r=>r.paper.status==='loss').length,pushes:rows.filter(r=>r.paper.status==='push').length,unitsStaked:staked,profitUnits:done.length?profit:null,roi:staked?profit/staked:null};
}
export class PaperStore extends PredictionStore {
  get status(){return {...super.status,cadence:'Immutable hourly snapshots on board visits plus daily scheduled capture: NFL 10:00 UTC, MLB 20:00 UTC. Reports retain the first qualifying selection per player/game/market. Coverage depends on posted prices and available lineups; not closing prices.'};}
  paperPrefix(sport,period){if(!['nfl','mlb'].includes(sport)||!/^\d{4}-(?:\d{2}-\d{2}|W\d{2})$/.test(period))throw Object.assign(Error('Invalid paper record period'),{status:400});return `paper/v1/${this.environment}/${sport}/${period}/`;}
  async capturePaper(sport,period,market,players,gameTime,sourceReceipts=[]){
    const now=this.now(),capturedAt=new Date(now).toISOString(),prefix=this.paperPrefix(sport,period),key=prefix+market+'/'+capturedAt.slice(0,13).replace('T','-')+'.json';
    if(this.written.has(key))return {state:'saved',...this.status};
    const records=players.flatMap(p=>{
      const f=p.forecast,side=f?.lean,kickoff=gameTime(p),price=p.prop?.prices?.[side];
      if(!side||!price||!Number.isFinite(f.probability?.[side])||Date.parse(kickoff)-now>7*86400000||!freshQuote(p.prop,now,kickoff))return [];
      return [{id:`${p.gameId}:${p.playerId}:${market}`,sport,period,market,gameId:p.gameId,playerId:p.playerId,player:p.player,team:p.team,opponent:p.opponent,kickoff,capturedAt,side,prop:structuredClone(p.prop),forecast:{version:f.version,artifactId:f.artifactId,point:f.point,probability:f.probability,modelContext:f.modelContext,teammateImpact:f.teammateImpact,matchup:f.matchup,availability:f.availability,reasons:f.reasons},stakeUnits:1,policy:'First qualifying priced research lean captured before scheduled start. One unit risked, one record per player/game/market.'}];
    });
    if(!records.length)return {state:'waiting',message:'No fresh priced pregame lean meeting all model checks.',...this.status};
    const batch={schema:1,capturedAt,sport,period,market,sourceReceipts,records,deployment:{commit:process.env.VERCEL_GIT_COMMIT_SHA||null}};
    const saved=await this.append(key,batch);this.written.set(key,saved);if(this.written.size>100)this.written.delete(this.written.keys().next().value);return {state:'saved',records:saved.records.length,...this.status};
  }
  async paperBatches(sport,period){
    const prefix=this.paperPrefix(sport,period);let keys=[];
    if(this.cloud){let cursor;do{const p=await this.blob.list({prefix,cursor,limit:1000});keys.push(...p.blobs.map(b=>b.pathname));cursor=p.hasMore?p.cursor:null;}while(cursor);}
    else try{const root=path.join(this.dir,prefix);for(const dir of await fs.readdir(root,{withFileTypes:true}))if(dir.isDirectory())for(const file of await fs.readdir(path.join(root,dir.name)))if(file.endsWith('.json'))keys.push(prefix+dir.name+'/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
    const batches=[];for(let i=0;i<keys.length;i+=12)batches.push(...await Promise.all(keys.slice(i,i+12).map(k=>this.read(k))));return batches.filter(Boolean);
  }
  async report(sport,period,resolve){
    const batches=await this.paperBatches(sport,period),selected=new Map();
    for(const b of batches.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)))for(const r of b.records)if(!selected.has(r.id)&&Date.parse(r.capturedAt)<Date.parse(r.kickoff))selected.set(r.id,r);
    const rows=[];for(const r of selected.values()){const actual=await resolve(r);rows.push({...r,actual,paper:settlePaper(r,actual)});}
    const versions=Object.fromEntries([...new Set(rows.map(r=>r.forecast.version))].map(v=>[v,paperSummary(rows.filter(r=>r.forecast.version===v))]));
    const sourceReceipts=[...new Map(batches.flatMap(b=>b.sourceReceipts||[]).map(s=>[s.url+':'+s.sha256,s])).values()];
    return {sport,period,storage:this.status,summary:paperSummary(rows),byVersion:versions,rows,sourceReceipts,method:'Prospective paper results only: first captured eligible research lean per player/game/market, at its saved price. Risk 1 unit; wins return decimal odds minus 1, losses -1, pushes 0. DNP/voids excluded from stake. No bets are placed. Book-specific settlement rules and rejected prices may differ; this is not an account statement.',checkedAt:new Date(this.now()).toISOString()};
  }
}
