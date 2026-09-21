import { normalizePlayer } from '../markets.mjs';
import { teamCode } from './props.mjs';
export const MLB_INJURIES_URL='https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries';
export const isUnavailable=status=>/^(out|inactive|injured reserve|IR|PUP|suspended)$|injured list|\b\d+-day[- ]il\b/i.test(status||'');
export class MlbAvailability {
  constructor({fetcher=fetch,now=()=>Date.now()}={}){this.fetcher=fetcher;this.now=now;}
  async load(){
    if(this.cached&&this.now()-Date.parse(this.cached.checkedAt)<900000)return this.cached;
    if(this.pending)return this.pending;
    this.pending=(async()=>{const base={checkedAt:new Date(this.now()).toISOString(),sourceUrl:MLB_INJURIES_URL};try{const r=await this.fetcher(MLB_INJURIES_URL,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data.injuries))throw Error();return this.cached={...base,stale:false,entries:data.injuries.flatMap(t=>(t.injuries||[]).map(i=>({nameKey:normalizePlayer(i.athlete?.displayName||''),team:teamCode(i.athlete?.team?.abbreviation||t.team?.abbreviation),status:i.status,reportedAt:i.date,sourceUrl:i.athlete?.links?.find(l=>l.rel?.includes('playercard'))?.href||MLB_INJURIES_URL})))};}catch{return this.cached={...base,stale:true,entries:[]};}})().finally(()=>this.pending=null);return this.pending;
  }
  forPlayer(feed,p,peers,upcoming){
    if(!upcoming)return {status:'historical_unavailable',sourceUrl:MLB_INJURIES_URL,concern:false,note:'Today’s injury report is not applied to past games.'};
    const base={checkedAt:feed.checkedAt,sourceUrl:MLB_INJURIES_URL};
    if(feed.stale)return {...base,status:'unavailable',stale:true,concern:false};
    const nameKey=normalizePlayer(p.player),team=teamCode(p.team),matches=feed.entries.filter(e=>e.nameKey===nameKey&&e.team===team);
    if(matches.length>1||new Set(peers.filter(x=>normalizePlayer(x.player)===nameKey&&teamCode(x.team)===team).map(x=>x.playerId)).size>1)return {...base,status:'unavailable',stale:true,concern:false,note:'Ambiguous player match; no injury status assumed.'};
    if(!matches.length)return {...base,status:'No injury listing',concern:false,note:'Exact normalized name and team match. No listing does not confirm health or playing time.'};
    const item=matches[0];return {...base,...item,concern:!/^(active|healthy)$/i.test(item.status||''),unavailable:isUnavailable(item.status),note:'ESPN reported status, matched by exact normalized name and team. Uncertain availability suppresses leans; confirmed unavailability withholds the forecast.'};
  }
}
