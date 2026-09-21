import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR } from '../providers.mjs';
export const MLB_API='https://statsapi.mlb.com/api/v1';
export const hash=text=>createHash('sha256').update(text).digest('hex');
export class MlbProvider {
  constructor({dir=DATA_DIR,fetcher=fetch,now=()=>Date.now()}={}){this.dir=path.join(dir,'mlb');this.fetcher=fetcher;this.now=now;this.memory=new Map();this.pending=new Map();this.active=0;this.queue=[];}
  async limited(fn){if(this.active>=4)await new Promise(r=>this.queue.push(r));this.active++;try{return await fn();}finally{this.active--;this.queue.shift()?.();}}
  async read(url,{ttl=900000,force=false,html=false}={}){
    if(this.pending.has(url))return this.pending.get(url);
    const task=this.load(url,{ttl,force,html}).finally(()=>this.pending.delete(url));this.pending.set(url,task);return task;
  }
  async load(url,{ttl,force,html}){
    const file=path.join(this.dir,'raw',hash(url)+'.json');let old=this.memory.get(url);
    if(!old)try{old=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
    if(old&&this.now()-Date.parse(old.checkedAt)<(force?60000:ttl))return old;
    try{
      const response=await this.limited(async()=>{
        const r=await this.fetcher(url,{signal:AbortSignal.timeout(25000),headers:{Accept:html?'text/html':'application/json'}});
        if(!r.ok)throw Error(`HTTP ${r.status}`);
        const text=await r.text();if(text.length>30_000_000)throw Error('Unexpectedly large source response');
        const payload=html?text:JSON.parse(text);if(!html&&payload.messageNumber)throw Error(payload.message||'MLB source error');
        return {payload,url,fetchedAt:new Date(this.now()).toISOString(),checkedAt:new Date(this.now()).toISOString(),sha256:hash(text),stale:false};
      });
      await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(response));await fs.rename(file+'.tmp',file);this.remember(url,response);return response;
    }catch(e){
      if(old){const fallback={...old,stale:true,error:`${new URL(url).hostname}: ${e.message}`,checkedAt:new Date(this.now()).toISOString()};this.remember(url,fallback);return fallback;}
      throw Error(`${new URL(url).hostname}: ${e.message}`);
    }
  }
  remember(url,value){this.memory.set(url,value);if(this.memory.size>100)this.memory.delete(this.memory.keys().next().value);}
}
