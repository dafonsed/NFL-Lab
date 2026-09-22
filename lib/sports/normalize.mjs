export const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
export function minutes(x){if(/^\d+:\d{2}$/.test(String(x))){const [a,b]=x.split(':').map(Number);return a+b/60;}return numeric(x);}
export function fields(keys,values){const s={};keys.forEach((k,i)=>{if(k.includes('-')){const pair=String(values[i]??'').split('-');if(pair.length===2)k.split('-').forEach((name,j)=>s[name]=numeric(pair[j]));}else s[k]=['minutes','timeOnIce','powerPlayTimeOnIce'].includes(k)?minutes(values[i]):numeric(values[i]);});return s;}
export function gameInfo(event){
 const c=event.competitions?.[0]||{},status=c.status||event.status||{},side=key=>{const t=c.competitors?.find(x=>x.homeAway===key);return t?{id:String(t.team.id),name:t.team.displayName,code:t.team.abbreviation,score:numeric(t.score?.value??t.score)}:null;};
 return {id:String(event.id),date:event.date||c.date,startTime:event.date||c.date,home:side('home'),away:side('away'),venue:c.venue||{},state:status.type?.state||'pre',complete:status.type?.completed===true,status:status.type?.detail||status.type?.description||'Scheduled',season:event.season?.year,seasonType:Number(event.season?.type||event.seasonType?.type),url:event.links?.find(x=>x.rel?.includes('summary'))?.href||null};
}
export function soccerMinutes(row,events){
 const id=String(row.athlete.id),played=row.stats?.find(s=>s.name==='appearances')?.value;
 if(played===0)return 0;
 let start=row.starter?0:null,end=90;
 for(const e of events||[]){const ids=(e.participants||[]).map(p=>String(p.athlete?.id)),t=Math.min(90,(numeric(e.clock?.value)||0)/60);
  if(e.type?.type==='substitution'||e.type?.text==='Substitution'){if(ids[0]===id)start=t;if(ids[1]===id)end=Math.min(end,t);}
  if((e.type?.text||'').match(/red card|second yellow/i)&&ids.includes(id))end=Math.min(end,t);
 }
 if(start===null||row.subbedOut&&end===90&&!events?.some(e=>e.type?.text==='Substitution'&&String(e.participants?.[1]?.athlete?.id)===id))return null;
 return Math.max(0,end-start);
}
export function normalizeSummary(data,sport,fallback={}){
 const game={...fallback,...gameInfo({...data.header,competitions:data.header?.competitions,season:data.header?.season})};
 game.extraTime=sport==='soccer'&&(Number(data.header?.competitions?.[0]?.status?.period)>2||/extra time|penalt|aet|pens/i.test(game.status));
 game.venue={...fallback.venue,...data.gameInfo?.venue};game.competition=fallback.competition||data.header?.league?.slug;game.url=game.url||`https://www.espn.com/${sport}/${sport==='soccer'?'match':'game'}/_/gameId/${game.id}`;
 const players=[];
 const add=(r,teamId,stats,position=r.athlete?.position?.abbreviation)=>{const a=r.athlete;players.push({id:String(a.id),player:a.displayName||a.fullName,teamId:String(teamId),position:position||'',headshot:a.headshot?.href||null,sourceUrl:a.links?.find(l=>l.rel?.includes('playercard'))?.href||game.url,starter:r.starter===true,confirmed:r.starter===true||r.active===true,scratched:!!a.scratched||!!r.didNotPlay,stats,minutes:stats.minutes??stats.timeOnIce??null,gameId:game.id,date:game.date,home:String(teamId)===game.home?.id,opponentId:String(teamId)===game.home?.id?game.away?.id:game.home?.id});};
 if(sport==='soccer')for(const team of data.rosters||[])for(const r of team.roster||[]){const stats=Object.fromEntries((r.stats||[]).map(s=>[s.name,numeric(s.value)]));stats.minutes=soccerMinutes(r,data.keyEvents);add(r,team.team.id,stats,r.position?.abbreviation);}
 else for(const team of data.boxscore?.players||[])for(const s of team.statistics||[])for(const r of s.athletes||[])add(r,team.team.id,fields(s.keys||[],r.stats||[]));
 const unique=[...new Map(players.map(p=>[p.id,p])).values()];
 const teams=(data.boxscore?.teams||[]).map(t=>{const stats=fields((t.statistics||[]).map(x=>x.name),(t.statistics||[]).map(x=>x.displayValue)),id=String(t.team.id),ps=unique.filter(p=>p.teamId===id&&p.minutes>0),other=id===game.home?.id?game.away:game.home;
  for(const key of ['points','goals','totalGoals','rebounds','assists','threePointFieldGoalsMade','saves','goalAssists'])if(stats[key]===undefined&&ps.length&&ps.every(p=>numeric(p.stats[key])!==null))stats[key]=ps.reduce((s,p)=>s+p.stats[key],0);
  if(sport==='soccer')stats.totalGoals=(id===game.home?.id?game.home:game.away)?.score??stats.totalGoals;
  const exposure=ps.reduce((s,p)=>s+p.minutes,0),possessions=sport==='nba'&&['fieldGoalsAttempted','freeThrowsAttempted','offensiveRebounds','totalTurnovers'].every(k=>stats[k]!==null&&stats[k]!==undefined)?stats.fieldGoalsAttempted+.44*stats.freeThrowsAttempted-stats.offensiveRebounds+stats.totalTurnovers:null;
  return {id,opponentId:other?.id,stats,minutes:exposure,pace:possessions&&exposure?possessions/(exposure/5)*48:null,home:id===game.home?.id};});
 return {game,players:unique,teams,injuries:data.injuries||[],sourceUrl:game.url};
}
