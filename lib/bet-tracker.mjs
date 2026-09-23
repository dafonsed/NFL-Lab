import { MlbProvider } from './mlb/provider.mjs';
import { MLB_MARKETS, statValue } from './mlb/markets.mjs';
import { SPORTS, SOCCER_LEAGUES } from './sports/config.mjs';
import { gameInfo, normalizeSummary, numeric } from './sports/normalize.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
const nfl = {
  passing_yards:['Passing yards','passing','passingYards'], passing_tds:['Passing touchdowns','passing','passingTouchdowns'],
  completions:['Completions','passing','completions'], attempts:['Passing attempts','passing','passingAttempts'],
  interceptions:['Interceptions thrown','passing','interceptions'], rushing_yards:['Rushing yards','rushing','rushingYards'],
  carries:['Rushing attempts','rushing','rushingAttempts'], rushing_tds:['Rushing touchdowns','rushing','rushingTouchdowns'],
  receiving_yards:['Receiving yards','receiving','receivingYards'], receptions:['Receptions','receiving','receptions'],
  receiving_tds:['Receiving touchdowns','receiving','receivingTouchdowns'], targets:['Receiving targets','receiving','receivingTargets'],
  field_goals:['Field goals made','kicking','fieldGoalsMade'], kicking_points:['Kicking points','kicking','totalKickingPoints'],
};
const fail = message => Object.assign(Error(message), {status:400});
export function trackerQuery(input) {
  const sport=String(input.sport||'').toLowerCase(), date=String(input.date||''), league=sport==='soccer'?(input.league||'eng.1'):sport, game=input.game||null;
  if(!['nfl','mlb',...Object.keys(SPORTS)].includes(sport)||sport==='soccer'&&!Object.hasOwn(SOCCER_LEAGUES,league))throw fail('Choose a supported sport and league.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2005-01-01'||date>'2100-12-31')throw fail('Choose a valid game date.');
  if(game&&!/^\d{6,12}$/.test(game))throw fail('Choose a valid game.');
  return {sport,date,league,game,path:sport==='nfl'?'football/nfl':sport==='soccer'?'soccer/'+league:SPORTS[sport]?.path};
}
export function trackerMarkets(sport) {
  const props=sport==='nfl'?Object.fromEntries(Object.entries(nfl).map(([k,[label]])=>[k,{label}])):sport==='mlb'?MLB_MARKETS:SPORTS[sport].markets;
  const role=(key,m)=>sport==='nfl'?nfl[key][1]:sport==='mlb'?m.group:sport==='nhl'?(m.goalie?'goalie':'skater'):sport==='soccer'?(m.goalie?'goalie':['shots','sot','goals','assists'].includes(key)?'outfield':null):null;
  return {...Object.fromEntries(Object.entries(props).map(([k,m])=>[k,{label:m.label,kind:m.team?'team':'player',playerRole:role(k,m)}])),
    moneyline:{label:sport==='soccer'?'Match result · 3-way':'Moneyline',kind:'winner'},spread:{label:'Full-game spread',kind:'spread'},total:{label:'Full-game total',kind:'total'}};
}
const sum=(stats,keys)=>keys.every(k=>Number.isFinite(stats[k]))?keys.reduce((v,k)=>v+stats[k],0):null;
const receipt=r=>({url:r.url,checkedAt:r.checkedAt,fetchedAt:r.fetchedAt,stale:r.stale});

export function playerRoles(player,sport){
  const position=String(player.position||'').toUpperCase(),values=player.values||{},roles=new Set(player.categories||[]),has=keys=>keys.some(k=>Number.isFinite(values[k]));
  if(sport==='nfl'){
    if(position==='QB')roles.add('passing');
    if(['QB','RB','HB','FB','WR'].includes(position))roles.add('rushing');
    if(['RB','HB','FB','WR','TE'].includes(position))roles.add('receiving');
    if(['K','PK'].includes(position))roles.add('kicking');
    for(const [key,[,group]] of Object.entries(nfl))if(Number.isFinite(values[key]))roles.add(group);
  }else if(sport==='mlb'){
    const positions=[position,...(player.positions||[])];
    if(positions.some(p=>['P','SP','RP','TWP'].includes(p))||has(['k','outs','er','hits_allowed','walks_allowed']))roles.add('pitching');
    if(positions.some(p=>['C','1B','2B','3B','SS','LF','CF','RF','OF','IF','DH','PH','PR','TWP'].includes(p))||Number(player.battingOrder)>0||has(['hits','hr','tb','runs']))roles.add('hitting');
  }else if(sport==='nhl'){
    if(['G','GK'].includes(position)||!position&&Number.isFinite(values.saves))roles.add('goalie');
    if(position&&!['G','GK'].includes(position)||!position&&has(['shots','blocks','hits']))roles.add('skater');
  }else if(sport==='soccer'){
    if(['G','GK'].includes(position)||!position&&values.saves>0)roles.add('goalie');
    if(position&&!['G','GK'].includes(position))roles.add('outfield');
  }
  return [...roles];
}

export function nflPlayers(data) {
  const players=[];
  for(const team of data.boxscore?.players||[]) {
    const byId=new Map();
    for(const category of team.statistics||[])for(const row of category.athletes||[]) {
      if(!row.athlete?.id)continue;
      const id=String(row.athlete.id),p=byId.get(id)||{id,name:row.athlete.displayName,teamId:String(team.team.id),position:row.athlete.position?.abbreviation||'',categories:[],values:{},participation:'unknown'};
      if(!p.categories.includes(category.name))p.categories.push(category.name);
      const stats={};(category.keys||[]).forEach((key,i)=>{
        if(key.includes('/')) {const pair=String(row.stats?.[i]||'').split('/');if(pair.length===2)key.split('/').forEach((k,j)=>stats[k]=numeric(pair[j]));}
        else stats[key]=numeric(row.stats?.[i]);
      });
      for(const [key,[,group,field]] of Object.entries(nfl))if(group===category.name)p.values[key]=stats[field]??null;
      if(row.didNotPlay)p.participation='dnp';else if(Object.values(stats).some(v=>v!==null))p.participation='played';
      byId.set(id,p);
    }
    players.push(...byId.values());
  }
  return players;
}

export function espnTrackerGame(data,sport) {
  const game=gameInfo(data.header||{});
  if(!game.home||!game.away||!/^\d+$/.test(game.id))throw Error('Game source is incomplete.');
  if(sport==='nfl')return {game,players:nflPlayers(data),teams:[game.home,game.away].map(t=>({...t,values:{}}))};
  const normalized=normalizeSummary(data,sport);
  return {game:normalized.game,players:normalized.players.map(p=>({id:p.id,name:p.player,teamId:p.teamId,position:p.position,
    participation:p.minutes>0?'played':p.scratched||p.minutes===0?'dnp':'unknown',
    values:Object.fromEntries(Object.entries(SPORTS[sport].markets).filter(([,m])=>!m.team).map(([k,m])=>[k,sum(p.stats,m.fields)]))})),
    teams:[game.home,game.away].map(t=>({...t,values:Object.fromEntries(Object.entries(SPORTS[sport].markets).filter(([,m])=>m.team).map(([k,m])=>[k,sum(normalized.teams.find(r=>r.id===t.id)?.stats||{},m.fields)]))}))};
}
export function mlbTrackerGame(data) {
  const d=data.gameData,b=data.liveData?.boxscore,lines=data.liveData?.linescore,side=key=>({id:String(d.teams[key].id),name:d.teams[key].name,code:d.teams[key].abbreviation,score:numeric(lines?.teams?.[key]?.runs)});
  if(!d?.teams?.home||!d?.teams?.away||!data.gamePk)throw Error('MLB game source is incomplete.');
  const game={id:String(data.gamePk),date:d.datetime?.dateTime,home:side('home'),away:side('away'),state:d.status?.abstractGameState==='Final'?'post':d.status?.abstractGameState==='Live'?'in':'pre',complete:d.status?.abstractGameState==='Final',status:d.status?.detailedState||'Scheduled'};
  const players=[];
  for(const key of ['home','away'])for(const p of Object.values(b?.teams?.[key]?.players||{})) {
    const batting=p.stats?.batting||{},pitching=p.stats?.pitching||{};
    const hitPlayed=['plateAppearances','atBats','runs','stolenBases'].some(k=>numeric(batting[k])>0),pitPlayed=['numberOfPitches','battersFaced','outs'].some(k=>numeric(pitching[k])>0);
    players.push({id:String(p.person.id),name:p.person.fullName,teamId:game[key].id,position:p.position?.abbreviation||'',positions:(p.allPositions||[]).map(p=>p.abbreviation),battingOrder:p.battingOrder||null,participation:hitPlayed||pitPlayed?'played':'unknown',
      values:Object.fromEntries(Object.entries(MLB_MARKETS).map(([k,m])=>[k,(m.group==='pitching'?pitPlayed:hitPlayed)?statValue(p.stats?.[m.group==='pitching'?'pitching':'batting'],k):null]))});
  }
  return {game,players,teams:[game.home,game.away].map(t=>({...t,values:{}}))};
}

export class BetTrackerStore {
  constructor({provider=new MlbProvider()}={}){this.provider=provider;}
  async catalog(input) {
    const q=trackerQuery(input),url=q.sport==='mlb'?`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${q.date}`:ESPN+q.path+'/scoreboard?'+new URLSearchParams({dates:q.date.replaceAll('-',''),limit:'100'});
    const r=await this.provider.read(url,{ttl:30000});
    if(!Array.isArray(q.sport==='mlb'?r.payload.dates:r.payload.events))throw Error('Game schedule source returned an invalid response. Please retry.');
    const games=q.sport==='mlb'?(r.payload.dates||[]).flatMap(d=>d.games||[]).map(g=>({id:String(g.gamePk),date:g.gameDate,status:g.status.detailedState,home:{id:String(g.teams.home.team.id),name:g.teams.home.team.name},away:{id:String(g.teams.away.team.id),name:g.teams.away.team.name}})):(r.payload.events||[]).map(gameInfo).filter(g=>g.home&&g.away);
    return {sport:q.sport,date:q.date,league:q.league,games,markets:trackerMarkets(q.sport),leagues:SOCCER_LEAGUES,source:receipt(r)};
  }
  async game(input) {
    const q=trackerQuery(input);if(!q.game)throw fail('Choose a game.');
    const url=q.sport==='mlb'?`https://statsapi.mlb.com/api/v1.1/game/${q.game}/feed/live`:ESPN+q.path+'/summary?event='+q.game;
    const r=await this.provider.read(url,{ttl:30000}),result=q.sport==='mlb'?mlbTrackerGame(r.payload):espnTrackerGame(r.payload,q.sport);
    if(result.game.id!==q.game)throw Error('The result belongs to a different game.');
    // Pregame rosters let users save exact athlete IDs before box-score rows exist.
    // Roster-only entries never imply participation or a zero statistic.
    if(result.game.state==='pre'&&q.sport!=='mlb')for(const team of result.teams) {
      try {
        const roster=await this.provider.read(ESPN+q.path+`/teams/${team.id}/roster`,{ttl:3600000});
        const rows=(roster.payload.athletes||[]).flatMap(a=>a.items||[a]);
        for(const a of rows)if(a.id){
          const existing=result.players.find(p=>p.id===String(a.id));
          if(existing){if(!existing.position)existing.position=a.position?.abbreviation||'';}
          else result.players.push({id:String(a.id),name:a.displayName||a.fullName,teamId:team.id,position:a.position?.abbreviation||'',values:{},participation:'unknown'});
        }
      }catch{/* A missing roster must not prevent tracking the game or known players. */}
    }
    return {...result,players:result.players.map(p=>({...p,roles:playerRoles(p,q.sport)})),sport:q.sport,league:q.league,markets:trackerMarkets(q.sport),source:receipt(r)};
  }
}
