export const INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
export class AvailabilityStore {
  constructor({ fetcher=fetch, now=()=>Date.now() }={}) { this.fetcher=fetcher; this.now=now; }
  async load() {
    if (this.cached && this.now()-Date.parse(this.cached.checkedAt)<900000) return this.cached;
    if (this.pending) return this.pending;
    this.pending=(async()=>{
      const checkedAt=new Date(this.now()).toISOString();
      try {
        const r=await this.fetcher(INJURIES_URL,{signal:AbortSignal.timeout(8000)});
        if(!r.ok) throw Error(`HTTP ${r.status}`);
        const data=await r.json();
        if(!Array.isArray(data.injuries)) throw Error('Unexpected availability response');
        const entries=data.injuries.flatMap(t=>(t.injuries||[]).map(x=>({ id:String(x.athlete?.id||x.athlete?.links?.find(l=>l.rel?.includes('playercard'))?.href?.match(/\/id\/(\d+)/)?.[1]||''), status:x.status, reportedAt:x.date, sourceUrl:x.athlete?.links?.find(l=>l.rel?.includes('playercard'))?.href||INJURIES_URL }))).filter(x=>x.id);
        return this.cached={checkedAt,sourceUrl:INJURIES_URL,entries,stale:false};
      } catch { return this.cached={checkedAt,sourceUrl:INJURIES_URL,entries:[],stale:true}; }
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  forPlayer(feed, espnId, upcoming) {
    if (!upcoming) return {status:'historical_unavailable',sourceUrl:INJURIES_URL,concern:false,note:'Today’s injury report is not applied to historical games.'};
    if (!espnId || feed.stale) return {status:'unavailable',stale:true,checkedAt:feed.checkedAt,sourceUrl:INJURIES_URL,concern:false};
    const item=feed.entries.find(x=>x.id===String(espnId));
    return item ? {...item,checkedAt:feed.checkedAt,unavailable:/^(out|inactive|injured reserve|IR|PUP|suspended)$/i.test(item.status||''),concern:!/^(active|healthy)$/i.test(item.status||''),note:'Reported by ESPN; absence from this feed does not confirm a full workload.'} : {status:'No injury listing',checkedAt:feed.checkedAt,sourceUrl:INJURIES_URL,concern:false,note:'No listing is not a confirmed active status or guaranteed workload.'};
  }
}
