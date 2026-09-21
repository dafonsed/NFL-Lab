import { PaperStore } from '../paper.mjs';
import { mlbResult } from './model.mjs';
import { MlbProvider, MLB_API } from './provider.mjs';
import { MlbProps, teamCode } from './props.mjs';
import { MLB_MARKETS, validateMlbQuery, mlbDay, shiftDate } from './markets.mjs';
import { buildMlbPlayer, explainAndGrade } from './model.mjs';
import { attachMlbForecast, forecastHistory, mlbModelReport } from './forecast.mjs';
import { WeatherStore } from '../weather.mjs';
import { MlbAvailability } from './availability.mjs';
const meta=d=>({url:d.url,fetchedAt:d.fetchedAt,checkedAt:d.checkedAt,sha256:d.sha256,stale:d.stale,error:d.error});
const allGames=d=>(d.dates||[]).flatMap(x=>x.games||[]);
const seasonTypes=new Set(['R','F','D','L','W']);
export function gameSummary(g){
  const side=key=>({id:g.teams[key].team.id,name:g.teams[key].team.name,code:teamCode(g.teams[key].team.abbreviation||g.teams[key].team.teamCode),score:g.teams[key].score,pitcher:g.teams[key].probablePitcher||null});
  return {gameId:g.gamePk,date:g.officialDate,startTime:g.gameDate,gameNumber:g.gameNumber||1,doubleHeader:['Y','S'].includes(g.doubleHeader),gameType:g.gameType,abstractState:g.status.abstractGameState,state:g.status.detailedState,venue:g.venue?.name,venueInfo:g.venue,weather:g.weather,home:side('home'),away:side('away'),url:`https://www.mlb.com/gameday/${g.gamePk}`};
}
export function candidatesFor(game,box,role){
  const result=[];
  for(const side of ['away','home']){
    const team=game[side],opponent=game[side==='away'?'home':'away'],data=box?.teams?.[side],people=Object.values(data?.players||{});
    const starters=people.filter(p=>Number(p.stats?.pitching?.gamesStarted)===1);
    const pitcherIds=new Set(game.abstractState==='Final'||game.abstractState==='Live'?starters.map(p=>p.person.id):team.pitcher?[team.pitcher.id]:[]);
    if(role==='pitching'&&!pitcherIds.size&&team.pitcher)pitcherIds.add(team.pitcher.id);
    const confirmed=people.filter(p=>Number(p.battingOrder)>0&&Number(p.battingOrder)%100===0);
    const ids=role==='pitching'?[...pitcherIds]:people.filter(p=>p.position?.type!=='Pitcher'||Number(p.stats?.batting?.plateAppearances)>0||p.position?.code==='Y').filter(p=>p.status?.code==='A'||game.abstractState!=='Preview'||Number(p.battingOrder)>0).map(p=>p.person.id);
    for(const id of ids){
      const p=people.find(p=>p.person.id===id),person=p?.person||team.pitcher;if(!person)continue;
      const starter=role==='pitching'?pitcherIds.has(id):confirmed.some(p=>p.person.id===id);
      result.push({id:`${game.gameId}:${id}`,playerId:id,player:person.fullName,team:team.code,teamId:team.id,opponent:opponent.code,opponentId:opponent.id,opponentPitcher:opponent.pitcher?.fullName||'TBD',gameId:game.gameId,home:side==='home',gameType:game.gameType,startTime:game.startTime,gameNumber:game.gameNumber,gameState:game.state,abstractState:game.abstractState,position:role==='pitching'?'SP':p.position?.abbreviation||'BAT',role,lineupStatus:role==='pitching'?game.abstractState==='Preview'?'probable':'starter':confirmed.length?starter?'confirmed':'bench':'unconfirmed',battingOrder:Number(p?.battingOrder)>0?Math.floor(Number(p.battingOrder)/100):null,boxAvailable:!!data,gameStats:p?.stats?.[role==='pitching'?'pitching':'batting'],headshot:`https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:good/v1/people/${id}/headshot/67/current`});
    }
  }
  return result;
}
export class MlbStore {
  constructor(options={}){this.provider=options.provider||new MlbProvider(options);this.now=options.now||(()=>Date.now());this.props=new MlbProps(this.provider);this.paper=options.paper||new PaperStore(options);this.weather=options.weather||new WeatherStore(options);this.availability=options.availability||new MlbAvailability(options);this.bundles=new Map();this.pending=new Map();this.boards=new Map();this.boardPending=new Map();}
  async bundle(date,force=false){
    if(this.pending.has(date))return this.pending.get(date);const old=this.bundles.get(date);if(old&&!force&&this.now()-old.created<900000)return old;
    const task=this.loadBundle(date,force).finally(()=>this.pending.delete(date));this.pending.set(date,task);return task;
  }
  async loadBundle(date,force){
    const sources=[],warnings=[];const read=async(url,options={})=>{const d=await this.provider.read(url,{force,...options});sources.push(meta(d));if(d.stale)warnings.push(d.error);return d.payload;};
    const raw=await read(`${MLB_API}/schedule?${new URLSearchParams({sportId:'1',date,hydrate:'probablePitcher,team,weather,venue(location,fieldInfo)'})}`),games=allGames(raw).filter(g=>seasonTypes.has(g.gameType)).map(gameSummary);
    for(const game of games)game.scheduleSource=sources[0].url;
    const candidates=[];
    await Promise.all(games.map(async game=>{
      let box=null;try{box=await read(`${MLB_API}/game/${game.gameId}/boxscore`,{ttl:game.abstractState==='Final'?21600000:900000});}catch(e){warnings.push(`Box score ${game.gameId}: ${e.message}`);}
      // Future games can have a schedule before the game-specific roster exists.
      // Populate active-roster research profiles without implying a confirmed lineup.
      if(game.abstractState==='Preview')for(const side of ['away','home'])if(!Object.keys(box?.teams?.[side]?.players||{}).length){
        try{const roster=await read(`${MLB_API}/teams/${game[side].id}/roster?${new URLSearchParams({rosterType:'active',date})}`,{ttl:3600000});box??={};box.teams??={};box.teams[side]={players:Object.fromEntries((roster.roster||[]).map(p=>['ID'+p.person.id,{...p,stats:{}}]))};}catch(e){warnings.push(`Roster ${game[side].code}: ${e.message}`);}
      }
      game.boxAvailable=!!box?.teams?.away&&!!box?.teams?.home;
      for(const role of ['hitting','pitching'])candidates.push(...candidatesFor(game,box,role));
    }));
    const today=mlbDay(this.now()),end=shiftDate(date<today?date:today,-1),year=Number(date.slice(0,4));
    const start=Number(end.slice(5,7))<6?`${Number(end.slice(0,4))-1}-09-01`:shiftDate(end,-100);
    let completed=new Set(),historyAvailable=true;
    if(candidates.length){try{const past=await read(`${MLB_API}/schedule?${new URLSearchParams({sportId:'1',startDate:start,endDate:end})}`,{ttl:3600000});completed=new Set(allGames(past).filter(g=>g.status.abstractGameState==='Final'&&seasonTypes.has(g.gameType)).map(g=>g.gamePk));}catch(e){warnings.push(`Historical game status: ${e.message}`);historyAvailable=false;}}
    const ids=[...new Set(candidates.map(p=>p.playerId))].sort((a,b)=>a-b),people=new Map();const tasks=[];
    for(let season=Number(start.slice(0,4));season<=Math.min(year,Number(end.slice(0,4)));season++)for(let i=0;i<ids.length;i+=30){
      const group=ids.slice(i,i+30),hydrate=`stats(group=[hitting,pitching],type=[gameLog],season=${season},startDate=${start},endDate=${end},gameType=[R,F,D,L,W],sportId=1,limit=1000)`;
      tasks.push(async()=>{try{const data=await read(`${MLB_API}/people?${new URLSearchParams({personIds:group.join(','),hydrate})}`,{ttl:3600000});for(const p of data.people||[]){const old=people.get(p.id);people.set(p.id,{...p,stats:[...(old?.stats||[]),...(p.stats||[])]});}}catch(e){warnings.push(`Player history: ${e.message}`);}});
    }
    if(historyAvailable)await Promise.all(tasks.map(t=>t()));
    const teamRows=[],weather=new Map();
    const availability=candidates.length?await this.availability.load():{stale:true};
    await Promise.all(games.map(async g=>weather.set(g.gameId,await this.weather.mlb(g))));
    if(candidates.length)try{
      const directory=await read(MLB_API+'/teams?'+new URLSearchParams({sportId:'1',season:year}),{ttl:86400000});
      await Promise.all((directory.teams||[]).map(async t=>{
        try{const d=await read(MLB_API+'/teams/'+t.id+'/stats?'+new URLSearchParams({stats:'gameLog',group:'hitting',season:year,gameType:'R'}),{ttl:3600000});
          for(const series of d.stats||[])for(const r of series.splits||[])if(completed.has(r.game?.gamePk)&&r.date<date)teamRows.push({gameId:r.game.gamePk,date:r.date,teamId:t.id,opponentId:r.opponent?.id,stats:r.stat});
        }catch(e){warnings.push('Opponent history '+t.name+': '+e.message);}
      }));
    }catch(e){warnings.push('Opponent team directory: '+e.message);}
    const bundle={created:this.now(),date,games,candidates,people,completed,sources,teamRows,weather,availability,warnings:[...new Set(warnings)],sampleStart:start,sampleEnd:end};this.bundles.set(date,bundle);if(this.bundles.size>4)this.bundles.delete(this.bundles.keys().next().value);return bundle;
  }
  async board(input={},force=false){
    const q=validateMlbQuery(input,this.now()),key=JSON.stringify(q),old=this.boards.get(key);
    if(this.boardPending.has(key))return this.boardPending.get(key);
    if(old&&!force&&this.now()-old.created<900000)return old.data;
    const task=this.buildBoard(q,force).finally(()=>this.boardPending.delete(key));this.boardPending.set(key,task);return task;
  }
  async buildBoard(q,force){
    const b=await this.bundle(q.date,force),config=MLB_MARKETS[q.market],sources=b.sources.filter(s=>s.url.includes('/people?'));
    const players=b.candidates.filter(c=>c.role===config.group).map(c=>buildMlbPlayer(c,b.people.get(c.playerId),b.completed,q.date,q.market,sources.filter(s=>new URL(s.url).searchParams.get('personIds')?.split(',').includes(String(c.playerId)))));
    const props=b.games.length?await this.props.enrich(players,b.games,{...q,force}):null;
    for(const p of players){
      attachMlbForecast(p,forecastHistory(b.people.get(p.playerId),b.completed),q.date,q.market,b.sources,this.context(p,b,q.market));
      // Full audit inputs and per-feature contributions stay in player evidence.
      if(p.forecast){delete p.forecast.terms;delete p.forecast.gameIds;if(p.forecast.modelContext)delete p.forecast.modelContext.sourceReceipts;}
    }
    // The grid needs ten chart values. Full samples remain in /evidence so even
    // a doubleheader-heavy slate stays below the serverless response limit.
    for(const p of players)p.logs=p.logs.slice(0,10).map(({stats,...log})=>log);
    players.sort((a,b)=>(b.modelScore??-1)-(a.modelScore??-1)||a.player.localeCompare(b.player));players.forEach((p,i)=>p.rank=i+1);
    const data={sport:'mlb',date:q.date,today:mlbDay(this.now()),market:q.market,markets:MLB_MARKETS,games:b.games,players,props,sources:b.sources,stale:b.warnings.length>0,warnings:b.warnings,fetchedAt:new Date(this.now()).toISOString(),sampleWindow:{start:b.sampleStart,end:b.sampleEnd},empty:!b.games.length,storage:process.env.VERCEL?'temporary':'local',methodology:'Batter sample: up to 20 completed MLB appearances with a plate appearance. Pitcher sample: up to 8 completed starts. Strictly before the selected calendar date; no same-day game enters the sample. Recent-form baseline = 60% sample mean + 40% last 5 batter appearances / last 3 starts. Rating = baseline / published market scale × 100, capped at 100; it is not a win probability. Source corrections can revise historical boards.'};
    try{data.paperHistory=await this.paper.capturePaper('mlb',q.date,q.market,players,p=>p.startTime,b.sources);}catch{data.paperHistory={state:'error',message:'Paper record could not be saved.'};}
    const model=mlbModelReport();
    data.forecastModel={version:model.contextModel.version,id:model.contextModel.id,contextReport:model.contextModel.report[q.market],contextEnabled:model.contextModel.models[q.market].enabled,trainedThrough:model.trainedThrough,report:model.report[q.market],split:model.split};
    data.methodology+=' Separate predictive model: regularized Poisson count regression fitted on 2023 official game logs, selected and dispersion-fitted on 2024, tested on 2025. Uses up to 60 batter appearances or 20 pitcher starts in the same season and prior 100 days. Details and measured performance: /api/mlb/model.';
    this.boards.set(JSON.stringify(q),{created:this.now(),data});if(this.boards.size>48)this.boards.delete(this.boards.keys().next().value);return data;
  }
  async paperPerformance(input={}){const q=validateMlbQuery(input,this.now());let b;return this.paper.report('mlb',q.date,async r=>{b??=await this.bundle(q.date);const c=b.candidates.find(p=>p.playerId===r.playerId&&p.gameId===r.gameId&&p.role===MLB_MARKETS[r.market].group);if(c)return mlbResult(c,r.market);const g=b.games.find(g=>g.gameId===r.gameId);return {status:g?.abstractState==='Final'?g.boxAvailable?'did_not_play':'no_stats':'pending',actual:null};});}
  async captureDaily(){const captures=[];for(const market of Object.keys(MLB_MARKETS)){const board=await this.board({market});captures.push({market,...board.paperHistory});}if(captures.some(c=>c.state==='error'))throw Error('A paper snapshot failed to persist');return {ok:true,captures};}
  context(p,b,market){return {teamRows:b.teamRows||[],weather:b.weather?.get(p.gameId),availability:this.availability.forPlayer(b.availability||{stale:true},p,b.candidates,Date.parse(p.startTime)>this.now()),opponentSources:b.sources.filter(s=>s.url.includes('/stats?'))};}
  async evidence(input){const board=await this.board(input),p=board.players.find(p=>p.id===input.player);if(!p)throw Object.assign(Error('Player and game not found on this MLB board.'),{status:404});const b=await this.bundle(board.date);const raw=b.candidates.find(c=>c.id===p.id&&c.role===MLB_MARKETS[board.market].group);const full=buildMlbPlayer(raw,b.people.get(p.playerId),b.completed,board.date,board.market,p.sources);full.prop=p.prop;full.rank=p.rank;explainAndGrade(full,board.market);const history=forecastHistory(b.people.get(p.playerId),b.completed);attachMlbForecast(full,history,board.date,board.market,b.sources,this.context(full,b,board.market));const selected=new Set(full.forecast?.gameIds||[]);return {player:full,forecastGameLog:history.filter(r=>selected.has(r.gameId)&&r.role===MLB_MARKETS[board.market].group),forecastModel:board.forecastModel,selectedDate:board.date,market:board.market,officialGameStats:raw?.gameStats||null,sources:b.sources,methodology:board.methodology};}
}
