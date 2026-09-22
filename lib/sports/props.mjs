import { load } from 'cheerio';
import { normalizePlayer } from '../markets.mjs';
import { quotePrices } from '../paper.mjs';
const BASE='https://www.scoresandodds.com',API='https://rga51lus77.execute-api.us-east-1.amazonaws.com/prod/market-comparison';
const names={nba:{points:'points',rebounds:'rebounds',assists:'assists',threes:'3-pointers',pra:'points, rebounds & assists',pr:'points & rebounds',pa:'points & assists',ra:'rebounds & assists',steals:'steals',blocks:'blocks',turnovers:'turnovers'},nhl:{shots:'shots on goal',goals:'goals',assists:'assists',points:'points',blocks:'blocked shots',hits:'hits',saves:'saves'}};
const teamMatches=(short,full)=>{const a=normalize(String(short).replace(/\s+\d+-\d+.*$/,'')),b=normalize(full);return a.length>=3&&(a===b||b.endsWith(a));};
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function publicEvents(html,sport){const $=load(html),out=[];$('tr.event-card-header[data-content]').each((_,el)=>{const h=$(el),table=h.closest('table'),id=h.attr('data-content'),start=h.find('[data-role="localtime"]').attr('data-value');if(!id?.startsWith(sport+'/')||!Number.isFinite(Date.parse(start)))return;const side=k=>table.find(`tr[data-side="${k}"] .team-name`).first().text().trim();out.push({id,start,home:side('home'),away:side('away')});});return out;}
export class PublicSportsProps{
 constructor(provider){this.provider=provider;}
 async lines(q,game,players,force){
  const sourceUrl=BASE+'/'+q.sport+'?date='+q.date,empty={quotes:[],sourceUrl,preferredBook:'FanDuel',regionNote:'Public US comparison; Arizona-specific pricing not verified.'};
  if(!names[q.sport]?.[q.market])return {...empty,status:'unavailable',message:'No supported public comparison for this market. Research thresholds are explicitly labeled.'};
  try{const raw=await this.provider.read(sourceUrl,{html:true,force,ttl:300000}),events=publicEvents(raw.payload,q.sport),matches=events.filter(e=>Math.abs(Date.parse(e.start)-Date.parse(game.date))<45*60000&&teamMatches(e.home,game.home.name)&&teamMatches(e.away,game.away.name));
   if(matches.length!==1)return {...empty,status:'unavailable',message:'No unambiguous game match in the public lines source.'};const event=matches[0],r=await this.provider.read(API+'?'+new URLSearchParams({event:event.id,market:names[q.sport][q.market]}),{force,ttl:300000});
   if(r.payload.event?.sport!==q.sport||!teamMatches(r.payload.event.home?.mascot,game.home.name)||!teamMatches(r.payload.event.away?.mascot,game.away.name))throw Error('Prop response sport or team mismatch');const quotes=[];
   for(const row of r.payload.markets||[]){if(row.stat!==names[q.sport][q.market]||!String(row.id).startsWith(event.id.replace('/','.')+'.0.'))continue;const name=normalizePlayer([row.player?.first_name,row.player?.last_name].filter(Boolean).join(' ')),match=players.filter(p=>normalizePlayer(p.player)===name);if(match.length!==1||row.player?.team?.key!==r.payload.event[match[0].teamId===game.home.id?'home':'away']?.key)continue;
    for(const book of ['fanduel','draftkings','betmgm','caesars','bet365']){const v=row.comparison?.[book],info=r.payload.books?.[book];if(!v||!info||game.state!=='post'&&v.available!==true||info.states?.length&&!info.states.includes('AZ')||v.value==null||!Number.isFinite(Number(v.value)))continue;quotes.push({playerId:match[0].id,line:Number(v.value),bookmaker:info.name||book,bookKey:book,prices:quotePrices(v),sourceUrl,fetchedAt:r.fetchedAt,commenceTime:game.date,basis:Date.parse(r.fetchedAt)<Date.parse(game.date)?'captured_pregame':game.state==='post'?'published_archive':'in_play',stale:r.stale||raw.stale});break;}
   }
   const unique=quotes.filter(q=>quotes.filter(r=>r.playerId===q.playerId).length===1);return {...empty,quotes:unique,status:unique.length?'available':'unavailable',message:unique.length?`${unique.length} posted lines`:'No posted totals for this market.'};
  }catch(e){return {...empty,status:'unavailable',error:'Public prop source unavailable: '+e.message};}
 }
}
