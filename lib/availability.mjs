export const INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
export const AVAILABILITY_REFRESH_MS = 60_000;
const isOut = status => /^(out|inactive|injured reserve|IR|PUP|suspended|reserve.*)$/i.test(status || '');

// Keep tonight's gate after kickoff, without applying today's report to old games.
export function availabilityApplies(start, complete, now) {
  return !complete && Number.isFinite(start) && start - now <= 7 * 86400000 && now - start < 8 * 3600000;
}

export class AvailabilityStore {
  constructor({ fetcher=fetch, now=()=>Date.now() }={}) { this.fetcher=fetcher; this.now=now; }
  async load({ force=false }={}) {
    if (this.pending) {
      if (!force) return this.pending;
      // A user refresh cannot resolve with a request started before the click.
      await this.pending;
      return this.load({force:true});
    }
    if (!force && this.cached && this.now()-Date.parse(this.cached.checkedAt)<(this.cached.stale?15000:AVAILABILITY_REFRESH_MS)) return this.cached;
    this.pending=(async()=>{
      const checkedAt=new Date(this.now()).toISOString();
      try {
        const url=new URL(INJURIES_URL);url.searchParams.set('_',String(this.now()));
        const r=await this.fetcher(url.href,{signal:AbortSignal.timeout(8000),cache:'no-store',headers:{'Cache-Control':'no-cache'}});
        if(!r.ok) throw Error(`HTTP ${r.status}`);
        const data=await r.json();
        if(!Array.isArray(data.injuries)) throw Error('Unexpected availability response');
        const latest=new Map();
        for(const team of data.injuries)for(const x of team.injuries||[]){
          const sourceUrl=x.athlete?.links?.find(l=>l.rel?.includes('playercard'))?.href||INJURIES_URL;
          const id=String(x.athlete?.id||sourceUrl.match(/\/id\/(\d+)/)?.[1]||'');
          if(!id||!x.status)continue;
          const item={id,status:x.status,reportedAt:x.date||null,sourceUrl};
          const prior=latest.get(id);
          if(!prior||(Date.parse(item.reportedAt)||0)>=(Date.parse(prior.reportedAt)||0))latest.set(id,item);
        }
        // An older upstream report or an omitted recently ruled-out player is
        // not affirmative evidence that the player became available again.
        for(const prior of this.cached?.entries||[]){
          const item=latest.get(prior.id);
          if(item && Date.parse(item.reportedAt)<Date.parse(prior.reportedAt))latest.set(prior.id,prior);
          else if(!item && isOut(prior.status) && this.now()-Date.parse(prior.reportedAt)<86400000)latest.set(prior.id,{...prior,listingMissing:true});
        }
        const fetchedAt=new Date(this.now()).toISOString();
        return this.cached={checkedAt:fetchedAt,fetchedAt,sourceUpdatedAt:data.timestamp||null,sourceUrl:INJURIES_URL,entries:[...latest.values()],stale:false};
      } catch(error) {
        console.warn('[nfl-availability] Refresh failed:',error.message);
        return this.cached={...this.cached,checkedAt,sourceUrl:INJURIES_URL,entries:this.cached?.entries||[],stale:true,error:'ESPN injury refresh failed; last known reports are retained and new leans are withheld.'};
      }
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  forPlayer(feed, espnId, currentGame) {
    if (!currentGame) return {status:'historical_unavailable',sourceUrl:INJURIES_URL,concern:false,note:'Current injury reports apply only to games within the next seven days or still within tonight’s game window, not historical games.'};
    const item=feed.entries.find(x=>x.id===String(espnId));
    const receipt={checkedAt:feed.checkedAt,fetchedAt:feed.fetchedAt,sourceUpdatedAt:feed.sourceUpdatedAt,sourceUrl:INJURIES_URL,stale:feed.stale||!!item?.listingMissing};
    if(item)return {...item,...receipt,sourceUrl:item.sourceUrl,unavailable:isOut(item.status),concern:!/^(active|healthy)$/i.test(item.status),note:receipt.stale?'Last known report; current status could not be verified. No new lean is issued.':'Reported by ESPN; absence from this feed does not confirm a full workload.'};
    if (!espnId || feed.stale) return {...receipt,status:'unavailable',stale:true,concern:false};
    return {...receipt,status:'No injury listing',concern:false,note:'No listing is not a confirmed active status or guaranteed workload.'};
  }
}
