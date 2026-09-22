// Public ESPN response receipts are cached locally; no API key is required.
import fs from 'node:fs/promises';
import path from 'node:path';
import { MlbProvider } from '../lib/mlb/provider.mjs';
import { gameInfo,normalizeSummary } from '../lib/sports/normalize.mjs';
const year=Number(process.argv[2]||2025);
if(!Number.isInteger(year)||year<2005||year>new Date().getUTCFullYear())throw Error('Choose a completed/current WNBA season.');
const provider=new MlbProvider();provider.dir=path.join(provider.dir,'sports');
const api='https://site.api.espn.com/apis/site/v2/sports/basketball/wnba',sources=[];
async function get(url){let d;for(let attempt=0;attempt<3;attempt++){try{d=await provider.read(url,{ttl:365*86400000});break;}catch(e){if(attempt===2)throw e;}}if(d.stale)throw Error('Stale response: '+url);sources.push({url:d.url,sha256:d.sha256,fetchedAt:d.fetchedAt});return d.payload;}
const teams=(await get(api+'/teams?season='+year+'&limit=100')).sports[0].leagues[0].teams.map(t=>t.team),events=new Map();
await Promise.all(teams.flatMap(t=>[2,3].map(async seasontype=>{const d=await get(api+`/teams/${t.id}/schedule?season=${year}&seasontype=${seasontype}`);for(const e of d.events||[]){const g=gameInfo(e);if(g.complete&&[2,3].includes(g.seasonType)&&g.season===year)events.set(g.id,g);}})));
const games=[];let complete=0;
await Promise.all([...events.values()].map(async g=>{const d=await get(api+'/summary?event='+g.id),h=normalizeSummary(d,'wnba',g);if(h.game.complete&&h.players.length)games.push(h);if(++complete%30===0)console.log(`Downloaded ${complete}/${events.size} WNBA games`);}));
games.sort((a,b)=>a.game.date.localeCompare(b.game.date));await fs.mkdir('data-independent/wnba',{recursive:true});
await fs.writeFile(`data-independent/wnba/${year}.json`,JSON.stringify({year,downloadedAt:new Date().toISOString(),games,sources}));
console.log(JSON.stringify({year,teams:teams.length,games:games.length,first:games[0]?.game.date,last:games.at(-1)?.game.date}));
