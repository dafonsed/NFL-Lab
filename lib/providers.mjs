import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';

export const DATA_DIR = process.env.DATA_DIR || fileURLToPath(new URL('../data-independent/', import.meta.url));
export const RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';
export const DATASETS = {
  schedule: () => ['schedules', 'games.csv.gz'],
  pbp: y => ['pbp', `play_by_play_${y}.csv.gz`],
  weekly: y => ['stats_player', `stats_player_week_${y}.csv.gz`],
  roster: y => ['rosters', `roster_${y}.csv.gz`],
  weeklyRoster: y => ['weekly_rosters', `roster_weekly_${y}.csv.gz`],
  snaps: y => ['snap_counts', `snap_counts_${y}.csv.gz`],
  participation: y => ['pbp_participation', `pbp_participation_${y}.csv`],
  ngsRushing: () => ['nextgen_stats', 'ngs_rushing.csv.gz'],
  ngsPassing: () => ['nextgen_stats', 'ngs_passing.csv.gz'],
  ngsReceiving: () => ['nextgen_stats', 'ngs_receiving.csv.gz'],
};
export const datasetUrl = (type,year) => `${RELEASES}/${DATASETS[type](year).join('/')}`;
const pbpColumns = new Set(['game_id','play_id','season','week','season_type','game_date','posteam','defteam','play_type','desc','play_deleted','two_point_attempt','rush_attempt','pass_attempt','sack','qb_kneel','qb_spike','yardline_100','air_yards','down','ydstogo','epa','rusher_player_id','receiver_player_id','passer_player_id','rushing_yards','receiving_yards','passing_yards','complete_pass','rush_touchdown','pass_touchdown','td_player_id','touchdown']);
const chartColumns = new Set(['nflverse_game_id','play_id','defenders_in_box','defense_coverage_type']);
export class Provider {
  constructor({dir=DATA_DIR,fetcher=fetch,now=()=>Date.now()}={}) { this.dir=dir;this.fetcher=fetcher;this.now=now;this.memory=new Map();this.inflight=new Map(); }
  async load(type,year,{force=false,optional=false}={}) {
    const key=`${type}-${year||'all'}`;
    if(this.inflight.has(key))return this.inflight.get(key);
    const task=this._load(type,year,{force,optional}).finally(()=>this.inflight.delete(key));this.inflight.set(key,task);return task;
  }
  async _load(type,year,{force,optional}) {
    const [tag,name]=DATASETS[type](year),url=`${RELEASES}/${tag}/${name}`,file=path.join(this.dir,'raw',name),metaFile=file+'.meta.json';
    const today=new Date(this.now()),activeSeason=today.getUTCMonth()<2?today.getUTCFullYear()-1:today.getUTCFullYear();
    const ttl=type==='participation'||year&&year<activeSeason?24*3600000:15*60000;
    let meta,bytes,error,offline=false;
    try { meta=JSON.parse(await fs.readFile(metaFile,'utf8')); } catch {}
    if(force||!meta||this.now()-Date.parse(meta.checkedAt||meta.fetchedAt)>ttl){
      try {
        const r=await this.fetcher(url,{headers:meta?.etag?{'If-None-Match':meta.etag}:{},signal:AbortSignal.timeout(120000)});
        if(r.status===304&&meta){meta.checkedAt=new Date(this.now()).toISOString();}
        else {
          if(!r.ok)throw Error(`HTTP ${r.status}`);
          bytes=Buffer.from(await r.arrayBuffer());
          // Validate CSV before replacing a working cache. Redirected error pages must never become data.
          const first=(name.endsWith('.gz')?gunzipSync(bytes):bytes).subarray(0,1500).toString();
          if(!first.includes(',')||/^\s*</.test(first))throw Error('Invalid CSV response');
          meta={url,fetchedAt:new Date(this.now()).toISOString(),checkedAt:new Date(this.now()).toISOString(),etag:r.headers.get('etag'),lastModified:r.headers.get('last-modified'),sha256:createHash('sha256').update(bytes).digest('hex')};
          await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',bytes);await fs.rename(file+'.tmp',file);
        }
        await fs.writeFile(metaFile,JSON.stringify(meta,null,2));
      } catch(e){error=`${name}: ${e.message}`;offline=true;if(!meta){if(optional)return {rows:[],meta:{url,name,available:false,error}};throw Error(`Cannot load independent NFL data: ${error}`);}}
    }
    if(!bytes)try{bytes=await fs.readFile(file);}catch{if(optional)return {rows:[],meta:{url,name,available:false,error:'File unavailable'}};throw Error(`Missing cached data: ${name}`);}
    const hash=meta.sha256||createHash('sha256').update(bytes).digest('hex');
    let rows=this.memory.get(hash);
    if(!rows){
      const selected=type==='pbp'?pbpColumns:type==='participation'?chartColumns:null;
      rows=parse(name.endsWith('.gz')?gunzipSync(bytes):bytes,{bom:true,columns:headers=>headers.map(h=>!selected||selected.has(h)?h:false),skip_empty_lines:true});
      this.memory.set(hash,rows);
      // Bound retained versions when the provider publishes corrections.
      if(this.memory.size>35)this.memory.delete(this.memory.keys().next().value);
    }
    return {rows,meta:{...meta,sha256:hash,name,available:true,stale:offline,error,rows:rows.length}};
  }
}
