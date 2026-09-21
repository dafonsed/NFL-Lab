import { PaperStore } from './paper.mjs';
import { actualResult } from './results.mjs';
import { WeatherStore } from './weather.mjs';
import { nflOpponent } from './nfl-context.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Provider, DATA_DIR } from './providers.mjs';
import { buildRates, buildPlayers, chooseCurrent, prepareData, validPlay, number } from './model.mjs';
import { definitions } from './definitions.mjs';
import { MARKETS } from './markets.mjs';
import { PropStore } from './props.mjs';
import { forecast } from './forecast.mjs';
import { AvailabilityStore } from './availability.mjs';
import { PredictionStore, kickoffTime, performancePage } from './predictions.mjs';
import artifact from './artifacts/nfl-context.json' with {type:'json'};
import evaluation from './artifacts/nfl-evaluation.json' with {type:'json'};
export { DATA_DIR };
export { MARKETS };
export const VIEWS=['board','games','viper','edge'];
const minutes=Number(process.env.REFRESH_MINUTES||15);
export const REFRESH_MS=(Number.isFinite(minutes)?Math.max(1,Math.min(1440,minutes)):15)*60000;
export function validateQuery(input={}){
 const view=input.view||'board',market=input.market||'any_td';
 const season=input.season==null||input.season===''?null:Number(input.season),week=input.week==null||input.week===''?null:Number(input.week);
 if(!VIEWS.includes(view)||!MARKETS.includes(market)||(season===null)!==(week===null)||season!==null&&(!Number.isInteger(season)||season<2000||season>2200||!Number.isInteger(week)||week<1||week>22))throw Object.assign(Error('Choose a valid NFL season, week (1–22), market and view.'),{status:400});
 return {season,week,market,view};
}
export class SourceStore {
 constructor(options={}){this.provider=options.provider||new Provider(options);this.dir=options.dir||DATA_DIR;this.now=options.now||(()=>Date.now());this.props=options.props||new PropStore({dir:this.dir,now:this.now});this.predictions=options.predictions||new PredictionStore({dir:this.dir,now:this.now});this.paper=options.paper||new PaperStore({dir:this.dir,now:this.now});this.weather=options.weather||new WeatherStore(options);this.availability=options.availability||new AvailabilityStore({now:this.now});this.bundles=new Map();this.pending=new Map();this.boards=new Map();}
 async catalog(force=false){const s=await this.provider.load('schedule',null,{force});const current=chooseCurrent(s.rows,new Date(this.now()));const weeks=[...new Map(s.rows.filter(g=>g.game_type!=='PRE'&&Number(g.season)>=current.season-1&&Number(g.season)<=current.season).map(g=>[`${g.season}:${g.week}`,{season:Number(g.season),week:Number(g.week)}])).values()].sort((a,b)=>b.season-a.season||b.week-a.week);return {current,weeks,schedule:s};}
 async bundle(season,force=false){
  if(this.pending.has(season))return this.pending.get(season);
  const cached=this.bundles.get(season);if(cached&&!force&&this.now()-cached.loadedAt<REFRESH_MS)return cached;
  const task=(async()=>{
   const specs=[['schedule',null,false],...['ngsRushing','ngsPassing','ngsReceiving'].map(t=>[t,null,true]),...[season-1,season].flatMap(y=>[['pbp',y,y===season],['weekly',y,y===season],['roster',y,y===season],['weeklyRoster',y,true],['snaps',y,true],['participation',y,true]])];
   const datasets=await Promise.all(specs.map(async([type,year,optional])=>({type,year,...await this.provider.load(type,year,{force,optional})})));
   const get=(type)=>datasets.filter(d=>d.type===type).flatMap(d=>d.rows);
   const rosters=[...get('roster'),...get('weeklyRoster')];
   const games=prepareData({schedule:get('schedule'),pbp:get('pbp'),weekly:get('weekly'),rosters,snaps:get('snaps'),chart:get('participation')});
   const train=get('pbp').filter(p=>Number(p.season)===season-1&&games.get(p.game_id)?.complete);
   const result={games,rosters,rates:buildRates(train),ngs:{rushing:get('ngsRushing'),passing:get('ngsPassing'),receiving:get('ngsReceiving')},datasets:datasets.map(({rows,...d})=>d),loadedAt:this.now()};
   this.bundles.set(season,result);this.boards.clear();
   if(this.bundles.size>3)this.bundles.delete(this.bundles.keys().next().value);
   return result;
  })().finally(()=>this.pending.delete(season));this.pending.set(season,task);return task;
 }
 async board(input={},force=false,captureOnly=false){
  const q=validateQuery(input),catalog=await this.catalog(force);const current=q.season===null?catalog.current:{season:q.season,week:q.week};
  const key=JSON.stringify({...q,...current,captureOnly});const cached=this.boards.get(key);if(cached&&!force&&this.now()-cached.created<REFRESH_MS&&!cached.data.players.some(p=>Date.parse(p.prop?.commenceTime)>cached.created&&Date.parse(p.prop?.commenceTime)<=this.now()))return cached.data;
  const games=catalog.schedule.rows.filter(g=>Number(g.season)===current.season&&Number(g.week)===current.week&&g.game_type!=='PRE'&&(!captureOnly||Date.parse(kickoffTime(g))>this.now()&&Date.parse(kickoffTime(g))-this.now()<7*86400000));
  const base={current,weeks:catalog.weeks,market:q.market,view:q.view,players:[],sourceUrl:'https://nflverse.nflverse.com',fetchedAt:catalog.schedule.meta.fetchedAt,connection:'independent',stale:false,notes:[],extra:[],vault:null,definitions};
  if(!games.length)return {...base,pending:true,notes:[`No schedule has been published for ${current.season}, week ${current.week}. The app will load it automatically when nflverse publishes it.`]};
  const b=await this.bundle(current.season,force);
  const all=buildPlayers({...b,...current,market:q.market,trainingSeason:current.season-1}).filter(p=>!captureOnly||games.some(g=>g.game_id===p.gameId));
  const props=q.view==='edge'?null:await this.props.enrich(all,games,{...current,market:q.market,force});
  const players=q.view==='viper'?all.filter(p=>p.dueSignal).sort((a,b)=>b.debt-a.debt).map((p,i)=>({...p,rank:i+1})):all;
  const datasets=b.datasets.map(d=>({type:d.type,season:d.year,...d.meta}));
  const stale=datasets.some(d=>d.stale),warning=datasets.filter(d=>d.stale).map(d=>d.error).join(' · ');
  const model={version:'independent-v1',trainingSeason:current.season-1,probability:'Uncalibrated Poisson estimate: 1 − exp(−mean expected rushing/receiving TDs). Excludes return TDs. Not a sportsbook probability.',rates:b.rates};
  const notes=[`Independent calculations from nflverse. Player samples use up to five completed games strictly before week ${current.week}; samples can cross seasons.`,...(!datasets.some(d=>d.type==='pbp'&&d.season===current.season&&d.available)?['Current-season play-by-play is not available yet; recent prior-season games are used.']:[]),`Scores use our published formula. FTN box/coverage splits include charted games only; in-season charting is not available in the free feed.`];
  const lines=await this.trackLines(games,catalog.schedule.meta);
  let verification=null;
  try{const audit=JSON.parse(await fs.readFile(path.join(this.dir,'../reports/independent-audit.json'),'utf8'));verification={checkedAt:audit.checkedAt,comparisons:audit.espn.comparisons,mismatches:audit.espn.mismatches.length};for(const p of players)p.dataDiscrepancies=audit.espn.mismatches.filter(m=>m.player===p.player&&p.details.sample.some(g=>g.gameId===m.game&&g[m.stat]===m.nflverse)).map(m=>({...m,checkedAt:audit.checkedAt}));}catch{}
  const data={...base,players,datasets,model,notes,stale,warning,fetchedAt:new Date(b.loadedAt).toISOString(),connection:stale?'offline':'independent',lines,asOfWeek:current,definitions,verification,props};
  if(q.view!=='edge'){
    const feed=await this.availability.load(),weather=new Map();await Promise.all(games.map(async g=>weather.set(g.game_id,await this.weather.nfl(g,kickoffTime(g)))));
    const priorGames=[...b.games.values()].filter(g=>g.complete&&g.game_type!=='PRE'&&(Number(g.season)<current.season||Number(g.season)===current.season&&Number(g.week)<current.week)).sort((a,b)=>b.gameday.localeCompare(a.gameday));
    const rosters=new Map(b.rosters.filter(r=>Number(r.season)===current.season&&Number(r.week||0)<=current.week).sort((a,b)=>Number(a.week||0)-Number(b.week||0)).map(r=>[r.gsis_id,r]));
    for(const p of all){
      const game=games.find(g=>g.game_id===p.gameId),start=Date.parse(kickoffTime(game));
      const sample=priorGames.flatMap(g=>{const r=g.players.get(p.playerId);return r&&r.statsAvailable!==false&&(Number(r.offense_snaps)>0||Number(r.attempts)+Number(r.carries)+Number(r.targets)>0)?[{...r,gameId:g.game_id,date:g.gameday,season:Number(g.season),week:Number(g.week)}]:[];}).slice(0,10);
      const opponent=nflOpponent(priorGames,{...current,date:game.gameday,opponent:p.opponent},q.market,p.position,artifact.contextModels[q.market+':'+p.position]?.leagueRate);
      const availability=this.availability.forPlayer(feed,rosters.get(p.playerId)?.espn_id,start>this.now());
      p.forecast=forecast({sample,target:{...current,date:game.gameday,team:p.team},market:q.market,position:p.position,prop:p.prop,artifact,availability,context:{opponent,weather:weather.get(p.gameId)},stale,now:this.now()});
    }
    // Viper contains copied rows; attach the same candidate result without changing ranking.
    for(const p of players)p.forecast=all.find(x=>x.playerId===p.playerId)?.forecast;
    try{data.predictionHistory=await this.predictions.capture({...data,players:all},games,artifact);}catch(e){data.predictionHistory={...this.predictions.status,state:'error',message:'Prediction archive unavailable; this board has not been recorded.'};console.error('[predictions]',e.message);}
    try{data.paperHistory=await this.paper.capturePaper('nfl',current.season+'-W'+String(current.week).padStart(2,'0'),q.market,all,p=>kickoffTime(games.find(g=>g.game_id===p.gameId)),datasets);}catch{data.paperHistory={state:'error',message:'Paper record could not be saved.'};}
    data.forecastModel={version:artifact.version,artifactId:artifact.id,trainingSeason:artifact.trainingSeason,status:'experimental',evaluationUrl:'/performance'};
  }
  this.boards.set(key,{created:this.now(),data});return data;
 }
 async performance(input={}){
  const q=validateQuery({season:input.season,week:input.week}),catalog=await this.catalog(),c=q.season===null?catalog.current:q;
  const archived=await this.predictions.batches(c.season,c.week),bundle=archived.length?await this.bundle(c.season):{games:new Map()};
  return {...performancePage(await this.predictions.performance(c.season,c.week,bundle),input),evaluation,contextEvaluation:{version:artifact.version,report:artifact.report,models:artifact.contextModels,limitations:artifact.limitations},weeks:catalog.weeks};
 }
 async paperPerformance(input={}){
  const q=validateQuery({season:input.season,week:input.week}),catalog=await this.catalog(),c=q.season===null?catalog.current:q,period=c.season+'-W'+String(c.week).padStart(2,'0');
  let bundle;return this.paper.report('nfl',period,async r=>{bundle??=await this.bundle(c.season);return actualResult(bundle.games.get(r.gameId),r.playerId,r.market);});
 }
 async captureDaily(){
  const catalog=await this.catalog(true),now=this.now();
  const weeks=[...new Map(catalog.schedule.rows.filter(g=>g.game_type!=='PRE'&&Date.parse(kickoffTime(g))>now&&Date.parse(kickoffTime(g))-now<7*86400000).map(g=>[g.season+':'+g.week,{season:Number(g.season),week:Number(g.week)}])).values()];
  const captures=[];
  for(const c of weeks)for(const market of MARKETS){const board=await this.board({...c,market},false,true);captures.push({season:c.season,week:c.week,market,...board.predictionHistory,paper:board.paperHistory});}
  const c=catalog.current,settlements=[];
  for(const week of [c.week-1,c.week].filter(w=>w>=1))settlements.push({week,...await this.predictions.settle(c.season,week,await this.bundle(c.season))});
  if(captures.some(c=>c.state==='error'||c.paper?.state==='error'))throw Error('One or more prediction snapshots failed to persist.');
  return {ok:true,capturedAt:new Date(this.now()).toISOString(),captures,settlements};
 }
 async trackLines(games,source){const task=(this.lineTask||Promise.resolve()).catch(()=>{}).then(()=>this._trackLines(games,source));this.lineTask=task;return task;}
 async _trackLines(games,source){
  const file=path.join(this.dir,'game-lines.json');let saved={};try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
  const lines=games.map(g=>{const value={total:number(g.total_line),homeFavoredBy:number(g.spread_line)};const previous=saved[g.game_id];const first=previous?.first||{...value,seenAt:source.fetchedAt};const latest={...value,seenAt:source.fetchedAt};saved[g.game_id]={first,latest};return {gameId:g.game_id,home:g.home_team,away:g.away_team,date:g.gameday,first,latest,totalMovement:value.total!==null&&first.total!==null?value.total-first.total:null,spreadMovement:value.homeFavoredBy!==null&&first.homeFavoredBy!==null?value.homeFavoredBy-first.homeFavoredBy:null,sourceUrl:source.url};});
  await fs.mkdir(this.dir,{recursive:true});await fs.writeFile(file,JSON.stringify(saved,null,2));return lines;
 }
 async evidence(input){const q=validateQuery(input),board=await this.board(q);const player=board.players.find(p=>p.playerId===input.player);if(!player)throw Object.assign(Error('Player not found on this board.'),{status:404});const b=await this.bundle(board.current.season),ids=new Set(player.details.sample.map(s=>s.gameId));const plays=[...b.games.values()].filter(g=>ids.has(g.game_id)).flatMap(g=>g.plays.filter(p=>[p.rusher_player_id,p.receiver_player_id,p.passer_player_id].includes(player.playerId)&&validPlay(p)));
 return {player,selectedWeek:board.current,definitions,model:board.model,sources:board.datasets,plays,notes:'Recorded game totals come from stats_player_week. Raw PBP records support opportunity calculations. Use game_id + play_id to locate rows in the linked CSVs. Snap-only appearances are included with zero counting stats.'};}
 async sync(){const d=await this.board({});const c=d.current;for(const market of MARKETS.filter(m=>m!=='any_td'))await this.board({...c,market});return {ok:true,season:c.season,week:c.week,players:d.players.length,provider:'nflverse + ScoresAndOdds public lines',stale:d.stale};}
}
