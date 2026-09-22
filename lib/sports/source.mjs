import path from 'node:path';
import fs from 'node:fs/promises';
import { MlbProvider } from '../mlb/provider.mjs';
import { WeatherStore } from '../weather.mjs';
import { PredictionStore } from '../predictions.mjs';
import { SPORTS,isBasketball,SOCCER_LEAGUES,query,day } from './config.mjs';
import { gameInfo,normalizeSummary } from './normalize.mjs';
import { predict,historyBefore,injuryWorkloads,backtest,resultFor,modelVersion,modelEvidence } from './model.mjs';
import { teamMinuteBudgets } from './opportunities.mjs';
import { PublicSportsProps } from './props.mjs';
const API='https://site.api.espn.com/apis/site/v2/sports/';
const receipt=d=>({url:d.url,fetchedAt:d.fetchedAt,checkedAt:d.checkedAt,sha256:d.sha256,stale:d.stale,error:d.error});
const shift=(d,n)=>new Date(Date.parse(d+'T12:00Z')+n*86400000).toISOString().slice(0,10);
export const isReportedOut=s=>/^(out|inactive|injured reserve|IR|suspended|suspension|not with team|scratched)$/i.test(s||'');
export class SportsStore{
 constructor(options={}){this.now=options.now||(()=>Date.now());this.provider=options.provider||new MlbProvider(options);if(!options.provider)this.provider.dir=path.join(this.provider.dir,'sports');this.weather=options.weather||new WeatherStore(options);this.archive=options.archive||new PredictionStore(options);this.props=new PublicSportsProps(this.provider);this.cache=new Map();this.pending=new Map();this.injuries=new Map();}
 get storage(){return {...this.archive.status,cadence:"Saved when a pregame board is opened, at most once per market per UTC hour; no unattended capture is scheduled for these sports."};}
 async get(url,{force=false,ttl=900000,sources=null}={}){let r;try{r=await this.provider.read(url,{force,ttl});}catch(first){try{r=await this.provider.read(url,{force:true,ttl});}catch{throw first;}}if(sources)sources.push(receipt(r));return r;}
 async catalog(input={},force=false){const q=query(input,this.now()),url=API+q.path+'/scoreboard?'+new URLSearchParams({dates:q.date.replaceAll('-',''),limit:'100'}),r=await this.get(url,{force,ttl:60000});if(!Array.isArray(r.payload.events))throw Error('Scoreboard source returned an invalid response.');const games=r.payload.events.map(gameInfo).filter(g=>g.home&&g.away);return {sport:q.sport,league:q.league,date:q.date,games,availableDates:(r.payload.leagues?.[0]?.calendar||[]).filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}/.test(d)).map(d=>d.slice(0,10)),source:receipt(r),leagues:q.sport==='soccer'?SOCCER_LEAGUES:null,markets:SPORTS[q.sport].markets};}
 async availability(q,force,sources){
  const url=API+q.path+'/injuries',old=this.injuries.get(q.path);
  if(old&&!force&&this.now()-Date.parse(old.checkedAt)<60000)return old;
  try{const r=await this.get(url+'?_='+Math.floor(this.now()/60000),{force,ttl:60000,sources});if(!Array.isArray(r.payload.injuries))throw Error('Invalid injury response');const entries=new Map();
   for(const t of r.payload.injuries)for(const i of t.injuries||[]){const id=String(i.athlete?.id||'');if(id&&i.status){const prior=entries.get(id);if(!prior||Date.parse(prior.date||0)<=Date.parse(i.date||0))entries.set(id,{id,status:i.status,date:i.date,detail:i.shortComment,sourceUrl:i.athlete.links?.find(l=>l.rel?.includes('playercard'))?.href||url});}}
   for(const [id,i] of old?.entries||[])if(isReportedOut(i.status)&&this.now()-Date.parse(i.date)<86400000&&!entries.has(id))entries.set(id,{...i,stale:true});
   const feed={entries,checkedAt:r.checkedAt,sourceUrl:url,stale:r.stale,coverage:q.sport==='soccer'?'Soccer injury coverage may be incomplete; confirmed match lineups take priority.':'ESPN reports; no listing does not guarantee participation.'};this.injuries.set(q.path,feed);return feed;
  }catch{return {entries:old?.entries||new Map(),checkedAt:new Date(this.now()).toISOString(),sourceUrl:url,stale:true,coverage:'Injury feed failed; last known reports retained.'};}
 }
 async history(q,game,force,sources,warnings){
  const events=new Map(),year=game.season||Number(q.date.slice(0,4)),years=[year,year-1];
  await Promise.all([game.home,game.away].flatMap(t=>years.flatMap(season=>(q.sport==='wnba'?[2,3]:[q.sport==='soccer'?'':2]).map(async seasontype=>{try{const u=API+(q.sport==='soccer'?'soccer/all':q.path)+`/teams/${t.id}/schedule?`+new URLSearchParams({season,seasontype});const r=await this.get(u,{force,ttl:3600000,sources});for(const e of r.payload.events||[]){const g={...gameInfo(e),sourcePath:q.sport==='soccer'?'soccer/'+(e.league?.slug||q.league):q.path,competition:e.league?.slug||q.league};if(q.sport==='soccer'&&!/\.1$|^uefa\.(champions|europa|europa\.conf)$/.test(g.competition))continue;if(g.complete&&g.date<game.date&&(q.sport==='soccer'||g.seasonType===2||q.sport==='wnba'&&g.seasonType===3)&&Date.parse(game.date)-Date.parse(g.date)<450*86400000)events.set(g.id,g);}}catch(e){warnings.push('Historical schedule: '+e.message);}}))));
  const chosen=new Map();for(const team of [game.home,game.away])for(const g of [...events.values()].filter(g=>[g.home?.id,g.away?.id].includes(team.id)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,25))chosen.set(g.id,g);
  const history=[];await Promise.all([...chosen.values()].map(async g=>{try{const r=await this.get(API+(g.sourcePath||q.path)+'/summary?event='+g.id,{force:false,ttl:86400000,sources});const h=normalizeSummary(r.payload,q.sport,g);if(h.game.complete&&!h.game.extraTime&&h.game.date<game.date)history.push(h);}catch(e){warnings.push('A historical box score is unavailable: '+g.id);}}));return historyBefore(history,game);
 }
 async gameWeather(q,game){
  const venue=game.venue||{},sourceUrl=API+q.path+'/summary?event='+game.id;
  if(q.sport==='wnba'&&venue.indoor!==false)return {status:venue.indoor===true?'available':'not_applicable',indoor:true,roof:venue.indoor===true?'indoor':'unspecified',sourceUrl,location:venue.fullName,note:venue.indoor===true?'Confirmed indoor venue; outdoor weather has zero effect.':'Indoor basketball model: outdoor weather has zero effect. The feed does not explicitly identify the roof; exceptional outdoor games require verified conditions.'};
  if(venue.indoor===true)return this.weather.forecast({kickoff:game.date,roof:'indoor',sourceUrl,location:venue.fullName});
  const roof=venue.indoor===false||q.sport==='soccer'?'outdoor':'unknown';
  if(roof==='unknown')return this.weather.forecast({kickoff:game.date,roof,sourceUrl,location:venue.fullName});
  try{const city=venue.address?.city,countries={England:'GB',Scotland:'GB',Wales:'GB',Spain:'ES',Germany:'DE',Italy:'IT',France:'FR',USA:'US','United States':'US',Canada:'CA',Portugal:'PT',Netherlands:'NL',Belgium:'BE',Austria:'AT',Switzerland:'CH',Turkey:'TR',Türkiye:'TR',Greece:'GR',Denmark:'DK',Norway:'NO',Sweden:'SE',Czechia:'CZ','Czech Republic':'CZ',Croatia:'HR',Poland:'PL',Serbia:'RS'};
   const country=countries[venue.address?.country];if(!city||!country)throw Error('Venue location unavailable');
   const geocode='https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:city,count:'20',countryCode:country,language:'en',format:'json'}),data=await this.weather.json(geocode,86400000),matches=(data.results||[]).filter(x=>x.country_code===country&&x.name.toLowerCase()===city.toLowerCase());
   if(matches.length!==1)throw Error('Ambiguous stadium city');return {...await this.weather.forecast({kickoff:game.date,roof,...matches[0],sourceUrl,location:venue.fullName+' · '+city}),locationSource:geocode};
  }catch{return {status:'unavailable',roof,note:'Venue coordinates could not be verified; no numerical weather effect.',sourceUrl};}
 }
 async board(input={},force=false){const q=query(input,this.now()),key=JSON.stringify(q),old=this.cache.get(key);if(this.pending.has(key))return this.pending.get(key);if(old&&!force&&this.now()-old.at<60000)return old.value;const task=this.build(q,force).then(value=>{this.cache.set(key,{at:this.now(),value});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);return value;}).finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;}
 async build(q,force){
  const catalog=await this.catalog(q,force),game=catalog.games.find(g=>g.id===q.gameId)||(!q.gameId?catalog.games.find(g=>g.state==='pre')||catalog.games[0]:null);
  if(q.gameId&&!game)throw Object.assign(Error('That matchup is not on the selected date.'),{status:404});
  const base={...catalog,today:day(this.now()),players:[],unavailablePlayers:[],warnings:[],model:{version:modelVersion(q.sport),status:'experimental',evidence:modelEvidence(q.sport)},sources:[catalog.source],fetchedAt:new Date(this.now()).toISOString()};if(!game)return {...base,empty:true,message:'No games published for this date. Choose another date; future schedules load automatically.'};
  const sources=base.sources,warnings=base.warnings;
  const current=await this.get(API+q.path+'/summary?event='+game.id,{force,ttl:60000,sources});
  const summary=normalizeSummary(current.payload,q.sport,game);Object.assign(game,{...summary.game,venue:{...game.venue,...summary.game.venue}});
  const currentWindow=game.state!=='post'&&Date.parse(game.date)-this.now()<7*86400000&&this.now()-Date.parse(game.date)<8*3600000;
  const [history,feed,weather]=await Promise.all([this.history(q,game,force,sources,warnings),this.availability(q,force,sources),this.gameWeather(q,game)]);
  const candidates=new Map(summary.players.map(p=>[p.id,{...p,starter:game.state==='pre'&&p.starter,confirmed:game.state==='pre'&&p.confirmed}]));
  const confirmedLineups=new Set([game.home,game.away].filter(t=>{
    const starters=summary.players.filter(p=>p.teamId===t.id&&p.starter);
    return !current.stale&&game.state==='pre'&&(isBasketball(q.sport)?starters.length===5:q.sport==='soccer'?starters.length===11:starters.filter(p=>p.position==='G').length===1);
  }).map(t=>t.id));
  if(game.state==='pre')await Promise.all([game.home,game.away].map(async team=>{try{const r=await this.get(API+q.path+'/teams/'+team.id+'/roster',{force,ttl:60000,sources});
   const flatten=xs=>xs.flatMap(x=>x.items?flatten(x.items):[x]);for(const a of flatten(r.payload.athletes||[])){if(!a.id||candidates.has(String(a.id)))continue;candidates.set(String(a.id),{id:String(a.id),player:a.displayName||a.fullName,teamId:team.id,opponentId:team.id===game.home.id?game.away.id:game.home.id,home:team.id===game.home.id,position:a.position?.abbreviation||'',headshot:a.headshot?.href,sourceUrl:a.links?.find(l=>l.rel?.includes('playercard'))?.href||r.url,starter:false,rosterStatus:a.status?.type,injury:a.injuries?.[0],stats:{}});}
  }catch(e){warnings.push('Current roster unavailable for '+team.name);}}));
  for(const p of candidates.values()){
   p.lineupConfirmed=confirmedLineups.has(p.teamId)&&(q.sport!=='nhl'||p.position==='G');
   const item=feed.entries.get(p.id)||p.injury,currentStatus=item?.status||item?.type?.description,confirmedOut=currentWindow&&isReportedOut(currentStatus);
   p.availability=!currentWindow?{status:q.sport==='wnba'&&game.state==='pre'?'Too early to verify availability':'Historical status unavailable',concern:false,sourceUrl:feed.sourceUrl}: {status:currentStatus||(p.starter?'Confirmed starter':feed.stale?'Unknown':'No injury listing'),unavailable:confirmedOut,concern:!!currentStatus&&!/active|healthy/i.test(currentStatus),stale:feed.stale||!!item?.stale,checkedAt:feed.checkedAt,reportedAt:item?.date,detail:item?.detail,sourceUrl:item?.sourceUrl||p.sourceUrl||feed.sourceUrl,note:feed.coverage};
  }
  const market=SPORTS[q.sport].markets[q.market],impacts=injuryWorkloads([...candidates.values()],history,q.sport);
  const minuteBudgets=teamMinuteBudgets([...candidates.values()],history,q.sport,currentWindow?impacts:new Map());
  let selected=[...candidates.values()].filter(p=>market.goalie?['G','GK'].includes(p.position):isBasketball(q.sport)||!['G','GK'].includes(p.position));
  if(market.team)selected=[game.home,game.away].map(t=>({id:t.id,player:t.name,teamId:t.id,opponentId:t.id===game.home.id?game.away.id:game.home.id,position:'TEAM',home:t.id===game.home.id,starter:true,availability:{status:'Team market',note:'Individual injuries are shown separately; team history includes earlier lineups.'}}));
  const props=await this.props.lines(q,game,selected,force);if(props.error)warnings.push(props.error);
  const stale=sources.some(s=>s.stale)||warnings.length>0;
  const players=selected.map(p=>{const prop=props.quotes.find(x=>x.playerId===p.id)||null,forecast=predict({sport:q.sport,market:q.market,player:p,target:game,history,weather,injury:currentWindow?impacts.get(p.id):null,prop,stale,minuteBudget:minuteBudgets.get(p.id),candidates:currentWindow?[...candidates.values()]:[]});const actual=resultFor((market.team?summary.teams:summary.players).find(x=>x.id===p.id),game,market),outcome=actual.status==='final'&&prop?(actual.actual>prop.line?'over':actual.actual<prop.line?'under':'push'):null;
   return {...p,team:(p.teamId===game.home.id?game.home:game.away).code,opponent:(p.opponentId===game.home.id?game.home:game.away).code,gameId:game.id,prop,forecast,result:{...actual,outcome}};});
  const unavailablePlayers=players.filter(p=>p.availability.unavailable),visible=players.filter(p=>!p.availability.unavailable).sort((a,b)=>(b.forecast.point??-1)-(a.forecast.point??-1));
  const diagnostic=backtest({sport:q.sport,market:q.market,history});
  const data={...base,game,market:q.market,players:visible,unavailablePlayers,weather,availability:{...feed,entries:undefined,count:feed.entries.size},props:{...props,quotes:undefined},validation:diagnostic,historyGames:history.map(h=>({id:h.game.id,date:h.game.date,url:h.sourceUrl,competition:h.game.competition,teams:h.game.home.name+' vs '+h.game.away.name})),methodology:'Bayesian count model: up to 20 prior appearances, five-appearance positional-rate prior, 60% last-five / 40% long-sample playing time. Bounded opponent, pace (NBA/WNBA), venue, rest and power-play (NHL) effects. Soccer weather is a bounded scenario; no unverified xG or lineup data is invented. Confirmed roles, a league-specific basketball minute budget, NBA/WNBA with/without rates and confirmed opposing goalkeeper effects are disclosed separately. Basketball shot attempts and conversion are enabled only by each league’s own diagnostic; unsuccessful rate candidates remain disabled. Parameters and prior games appear under every player. No forecast uses the selected result. Probabilities are experimental.'};
  try{data.capture=await this.capture(data,q);}catch(e){data.capture={state:'error',message:'Pregame record could not be saved.'};}
  return data;
 }
 async performance(input={}){
  const q=query(input,this.now()),board=await this.board(input),game=board.game;
  if(!game)return {records:[],message:'No selected matchup.'};
  const prefix=`sports-forecasts/v1/${this.archive.environment}/${q.sport}/${q.league}/${q.date}/${game.id}/${q.market}/`;let keys=[];
  if(this.archive.cloud){let cursor;do{const page=await this.archive.blob.list({prefix,cursor,limit:1000});keys.push(...page.blobs.map(b=>b.pathname));cursor=page.hasMore?page.cursor:null;}while(cursor);}
  else try{keys=(await fs.readdir(path.join(this.archive.dir,prefix))).filter(f=>f.endsWith('.json')).map(f=>prefix+f);}catch(e){if(e.code!=='ENOENT')throw e;}
  const batches=(await Promise.all(keys.map(k=>this.archive.read(k)))).filter(Boolean).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),selected=new Map();
  // First saved forecast per player and model version; no cherry-picking results.
  for(const b of batches)if(Date.parse(b.createdAt)<Date.parse(game.date))for(const p of b.players)if(Number.isFinite(p.forecast.point)&&!selected.has(p.id+':'+b.version))selected.set(p.id+':'+b.version,{...p,capturedAt:b.createdAt,version:b.version});
  const records=[...selected.values()].map(p=>{const current=board.players.find(x=>x.id===p.id),actual=current?.result||{status:'missing',actual:null},graded=actual.status==='final'&&p.prop?.basis==='captured_pregame'&&!p.prop.stale;return {...p,actual,lineOutcome:graded?(actual.actual>p.prop.line?'over':actual.actual<p.prop.line?'under':'push'):null,absoluteError:actual.status==='final'?Math.abs(actual.actual-p.forecast.point):null};});
  return {sport:q.sport,league:q.league,market:q.market,game,records,storage:this.storage,method:'First saved pregame forecast per player and model version. Results use the captured line when available. Missing statistics and DNP are not misses. No profitable strategy is implied and no bets are placed.'};
 }
 async capture(board,q){
  const game=board.game,now=this.now();if(!game||game.state!=='pre'||Date.parse(game.date)<=now||Date.parse(game.date)-now>7*86400000)return {state:'not_pregame'};
  if(!board.players.some(p=>Number.isFinite(p.forecast.point)))return {state:'waiting_for_data',message:'No supported player forecasts to save yet.'};
  const key=`sports-forecasts/v1/${this.archive.environment}/${q.sport}/${q.league}/${q.date}/${game.id}/${q.market}/${modelVersion(q.sport)}-${new Date(now).toISOString().slice(0,13).replace('T','-')}.json`;
  const prior=this.archive.written.get(key);if(prior)return {state:'saved',createdAt:prior.createdAt,storage:this.storage};
  const record={version:modelVersion(q.sport),createdAt:new Date(now).toISOString(),game,sport:q.sport,league:q.league,market:q.market,sources:board.sources,weather:board.weather,players:board.players.map(p=>({id:p.id,player:p.player,prop:p.prop,forecast:p.forecast})),deployment:process.env.VERCEL_GIT_COMMIT_SHA||null};
  const saved=await this.archive.append(key,record);this.archive.written.set(key,saved);if(this.archive.written.size>100)this.archive.written.delete(this.archive.written.keys().next().value);return {state:'saved',createdAt:saved.createdAt,storage:this.storage};
 }
}
