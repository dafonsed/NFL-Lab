import fs from 'node:fs/promises';
import { MlbProvider, MLB_API } from '../lib/mlb/provider.mjs';

// Public MLB responses are cached locally; only receipts and fitted parameters ship.
const provider=new MlbProvider(), dir='data-independent/mlb-training';
await fs.mkdir(dir,{recursive:true});
const fields=['plateAppearances','atBats','hits','doubles','triples','homeRuns','totalBases','runs','rbi','stolenBases','baseOnBalls','strikeOuts','gamesStarted','inningsPitched','outs','earnedRuns','battersFaced'];
for(const season of [2022,2023,2024,2025]) {
  const file=`${dir}/${season}.json`;
  try { const cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.complete){console.log(`${season}: cached ${cached.rows.length} player-games`);continue;} }catch{}
  const sources=[];
  const read=async url=>{const d=await provider.read(url,{ttl:365*86400000});if(d.stale)throw Error(`Stale training source: ${url}`);sources.push({url:d.url,sha256:d.sha256,fetchedAt:d.fetchedAt});return d.payload;};
  const [roster,schedule]=await Promise.all([read(`${MLB_API}/sports/1/players?season=${season}`),read(`${MLB_API}/schedule?${new URLSearchParams({sportId:1,season,gameType:'R'})}`)]);
  const games=new Set((schedule.dates||[]).flatMap(d=>d.games||[]).filter(g=>g.status.abstractGameState==='Final').map(g=>g.gamePk));
  if(games.size<2400||roster.people?.length<1000)throw Error(`Incomplete MLB season ${season}`);
  const ids=roster.people.map(p=>p.id).sort((a,b)=>a-b), rows=[], jobs=[];
  for(let i=0;i<ids.length;i+=20)jobs.push(ids.slice(i,i+20));
  for(let i=0;i<jobs.length;i+=4){
    await Promise.all(jobs.slice(i,i+4).map(async ids=>{
      const hydrate=`stats(group=[hitting,pitching],type=[gameLog],season=${season},gameType=R,sportId=1,limit=1000)`;
      const data=await read(`${MLB_API}/people?${new URLSearchParams({personIds:ids.join(','),hydrate})}`);
      if(data.people?.length!==ids.length)throw Error('Incomplete player batch');
      for(const person of data.people)for(const group of person.stats||[])for(const r of group.splits||[]){
        if(group.type?.displayName!=='gameLog'||r.gameType!=='R'||!games.has(r.game?.gamePk)||r.sport?.id!==1)continue;
        const role=group.group.displayName;
        if(role==='pitching'?Number(r.stat.gamesStarted)!==1:Number(r.stat.plateAppearances)<=0)continue;
        rows.push({playerId:person.id,gameId:r.game.gamePk,date:r.date,season,role,home:r.isHome,teamId:r.team.id,opponentId:r.opponent.id,stats:Object.fromEntries(fields.filter(k=>r.stat[k]!==undefined).map(k=>[k,r.stat[k]]))});
      }
    }));
    console.log(`${season}: ${Math.min(i+4,jobs.length)}/${jobs.length} batches`);
  }
  const unique=[...new Map(rows.map(r=>[`${r.playerId}:${r.gameId}:${r.role}`,r])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId||a.playerId-b.playerId);
  await fs.writeFile(file,JSON.stringify({complete:true,season,gameCount:games.size,playerCount:ids.length,rows:unique,sources}));
  console.log(`${season}: saved ${unique.length} verified player-games`);
}
