import { quotePrices } from '../paper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { normalizePlayer } from '../markets.mjs';
import { MLB_MARKETS, finite, mlbDay } from './markets.mjs';
import { hash } from './provider.mjs';
import { explainAndGrade } from './model.mjs';
const PUBLIC='https://www.scoresandodds.com';
const API='https://rga51lus77.execute-api.us-east-1.amazonaws.com/prod/market-comparison';
const BOOKS=['fanduel','draftkings','betmgm','caesars','fanatics','bet365'];
const SLUGS={'diamondbacks':'ARI','braves':'ATL','orioles':'BAL','red-sox':'BOS','cubs':'CHC','white-sox':'CWS','reds':'CIN','guardians':'CLE','indians':'CLE','rockies':'COL','tigers':'DET','astros':'HOU','royals':'KC','angels':'LAA','dodgers':'LAD','marlins':'MIA','brewers':'MIL','twins':'MIN','mets':'NYM','yankees':'NYY','athletics':'ATH','phillies':'PHI','pirates':'PIT','padres':'SD','giants':'SF','mariners':'SEA','cardinals':'STL','rays':'TB','rangers':'TEX','blue-jays':'TOR','nationals':'WSH'};
export const teamCode=value=>({AZ:'ARI',OAK:'ATH',WSN:'WSH',WAS:'WSH',CHW:'CWS',KCR:'KC',SDP:'SD',SFG:'SF',TBR:'TB',ANA:'LAA',LA:'LAD'}[String(value).toUpperCase()]||String(value||'').toUpperCase());
export function parseMlbEvents(html){
  const $=load(html),events=[];
  $('tr.event-card-header[data-content]').each((_,el)=>{
    const header=$(el),table=header.closest('table'),id=header.attr('data-content'),startTime=header.find('[data-role="localtime"]').attr('data-value');
    const side=key=>{const row=table.find(`tr[data-side="${key}"]`);const slug=row.find('.team-name a[href]').first().attr('href')?.split('/').pop();const img=row.find('img[data-src]').first().attr('data-src')||'';return SLUGS[slug]||teamCode(img.match(/\/([a-z]{2,3})\.png(?:\?|$)/i)?.[1]);};
    if(/^mlb\/\d+$/.test(id||'')&&Number.isFinite(Date.parse(startTime))&&side('home')&&side('away'))events.push({id,startTime,home:side('home'),away:side('away'),state:header.find('[data-field="state"]').text().trim()});
  });return [...new Map(events.map(e=>[e.id,e])).values()];
}
export function matchMlbEvent(game,events){
  const matches=events.filter(e=>e.home===teamCode(game.home.code)&&e.away===teamCode(game.away.code)&&mlbDay(e.startTime)===game.date);
  if(matches.length===1)return matches[0];
  // Doubleheaders must match the scheduled start as well as teams/date.
  const byTime=matches.map(e=>({e,diff:Math.abs(Date.parse(e.startTime)-Date.parse(game.startTime))})).sort((a,b)=>a.diff-b.diff);
  return byTime[0]?.diff<=45*60000&&(!byTime[1]||byTime[1].diff-byTime[0].diff>30*60000)?byTime[0].e:null;
}
export function parseMlbQuotes(payload,event,market,meta,game){
  if(payload.event?.sport!=='mlb'||teamCode(payload.event.home?.key)!==event.home||teamCode(payload.event.away?.key)!==event.away||!Array.isArray(payload.markets))throw Error('Public MLB comparison does not match this game.');
  const quotes=[];
  for(const row of payload.markets){
    const id=String(row.id||'').split('.');if(id[0]!=='mlb'||id[1]!==event.id.split('/')[1]||id[2]!=='0'||row.stat!==MLB_MARKETS[market].public)continue;
    const name=[row.player?.first_name,row.player?.last_name].filter(Boolean).join(' '),team=teamCode(row.player?.team?.key);if(!name||![event.home,event.away].includes(team))continue;
    for(const book of BOOKS){const value=row.comparison?.[book],info=payload.books?.[book];if(!value||!info||game.abstractState!=='Final'&&value.available!==true||info.states?.length&&!info.states.includes('AZ'))continue;
      const line=finite(value.value);if(line===null||line<0)continue;
      quotes.push({line,prices:quotePrices(value),bookmaker:info.name||book,bookKey:book,player:name,nameKey:normalizePlayer(name),team,gameId:game.gameId,eventId:event.id,market,fetchedAt:meta.fetchedAt,commenceTime:game.startTime,source:'ScoresAndOdds public comparison',sourceUrl:`${PUBLIC}/mlb?date=${game.date}`,rawHash:meta.sha256,basis:Date.parse(meta.fetchedAt)<Date.parse(game.startTime)?'captured_pregame':game.abstractState==='Final'?'published_archive':'in_play',stale:meta.stale,jurisdictionVerified:false});break;
    }
  }
  const keys=quotes.map(q=>q.team+':'+q.nameKey);return quotes.filter((q,i)=>keys.indexOf(keys[i])===keys.lastIndexOf(keys[i]));
}
export class MlbProps {
  constructor(provider){this.provider=provider;this.saving=new Map();}
  file(gameId,market){return path.join(this.provider.dir,'lines',hash(gameId+':'+market)+'.json');}
  async archived(gameId,market){try{return JSON.parse(await fs.readFile(this.file(gameId,market),'utf8'));}catch{return [];}}
  async preserve(gameId,market,quotes){
    const file=this.file(gameId,market),task=(this.saving.get(file)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const map=new Map((await this.archived(gameId,market)).map(q=>[q.team+':'+q.nameKey,q]));
      for(const q of quotes){const key=q.team+':'+q.nameKey,old=map.get(key),newer=!old||Date.parse(q.fetchedAt)>=Date.parse(old.fetchedAt);if(!old||q.basis==='captured_pregame'&&(old.basis!=='captured_pregame'||newer)||old.basis!=='captured_pregame'&&newer)map.set(key,q);}
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify([...map.values()]));await fs.rename(file+'.tmp',file);return [...map.values()];
    });this.saving.set(file,task);try{return await task;}finally{if(this.saving.get(file)===task)this.saving.delete(file);}
  }
  async enrich(players,games,{date,market,force=false}){
    const warnings=[],url=`${PUBLIC}/mlb?date=${date}`;let events=[],board;
    try{board=await this.provider.read(url,{html:true,ttl:1800000,force});events=parseMlbEvents(board.payload);if(board.stale)warnings.push(board.error);if(games.length&&!events.length)warnings.push('The public source has no matching MLB board yet.');}catch(e){warnings.push(e.message);}
    await Promise.all(games.map(async game=>{
      let quotes=[],fresh=[];const event=matchMlbEvent(game,events);
      try{
        if(event){const query=new URLSearchParams({event:event.id,market:MLB_MARKETS[market].public});const data=await this.provider.read(`${API}?${query}`,{ttl:game.abstractState==='Final'?86400000:1800000,force});if(data.stale)warnings.push(data.error);fresh=parseMlbQuotes(data.payload,event,market,data,game);quotes=await this.preserve(game.gameId,market,fresh);quotes=quotes.map(q=>({...q,stale:data.stale||board.stale||!fresh.some(f=>f.nameKey===q.nameKey&&f.team===q.team)}));}
        else quotes=(await this.archived(game.gameId,market)).map(q=>({...q,stale:true}));
      }catch(e){warnings.push(e.message);quotes=(await this.archived(game.gameId,market)).map(q=>({...q,stale:true}));}
      const ps=players.filter(p=>p.gameId===game.gameId);
      for(const p of ps){const nameKey=normalizePlayer(p.player),matches=quotes.filter(q=>q.team===teamCode(p.team)&&q.nameKey===nameKey);const people=ps.filter(x=>x.team===p.team&&normalizePlayer(x.player)===nameKey);p.prop=matches.length===1&&people.length===1?matches[0]:null;}
    }));
    players.forEach(p=>explainAndGrade(p,market));
    return {source:'ScoresAndOdds',sourceUrl:url,preferredBook:'FanDuel',withLine:players.filter(p=>p.prop).length,fanDuel:players.filter(p=>p.prop?.bookKey==='fanduel').length,total:players.length,stale:warnings.length>0,warnings:[...new Set(warnings)],regionNote:'Arizona preference; public US listings, not independently verified Arizona-specific pricing.'};
  }
}
