import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteRevision, preserveReadingOrder } from '../public/ev-mobile.js';
import { createQuoteFeedControls } from '../public/ev-feed.js';

test('clock-only updates do not invalidate cards; expiry, odds and liquidity do', () => {
  const time = Date.parse('2026-09-27T12:00:00Z');
  const quotes = [{id:'one',odds:110,line:24.5,liquidity:200,live:true,ts:new Date(time).toISOString()}];
  assert.equal(quoteRevision(quotes,time),quoteRevision(quotes,time+15_000));
  assert.notEqual(quoteRevision(quotes,time),quoteRevision(quotes,time+90_001));
  assert.notEqual(quoteRevision(quotes,time),quoteRevision([{...quotes[0],odds:120}],time));
  assert.notEqual(quoteRevision(quotes,time),quoteRevision([{...quotes[0],liquidity:0}],time));
});

test('reading order retains existing cards and appends newly seen selections', () => {
  assert.deepEqual(preserveReadingOrder([{id:'new'},{id:'b'},{id:'a'}],['a','b'],item=>item.id).map(x=>x.id),['a','b','new']);
});

function element() {
  const handlers = new Map();
  return {dataset:{},value:'0',textContent:'',disabled:false,
    setAttribute(){},removeAttribute(){},addEventListener:(name,handler)=>handlers.set(name,handler),handlers};
}

test('quote refresh restores cadence, avoids overlapping requests and pauses hidden tabs', async () => {
  const original = Object.fromEntries(['document','window','navigator','setTimeout','clearTimeout','setInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const select = element(), button = element(), fields = new Map();
  const panel = {...element(),querySelector:selector=>selector==='select'?select:fields.get(selector)};
  for (const selector of ['[data-feed-status]','[data-feed-meta]','[data-feed-detail]','[data-feed-coverage]']) fields.set(selector,element());
  const events = new Map(), pendingTimers = new Map(), storage = new Map([['sportslab-quote-refresh-ms','30000']]);
  let nextId = 0, requests = 0, resolve;
  const document = {hidden:false,createElement:()=>panel,querySelector:selector=>selector==='.ev-header'?{after(){}}:button,addEventListener:(name,handler)=>events.set(name,handler)};
  const window = {addEventListener:(name,handler)=>events.set(name,handler),localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
  const replace = (key,value) => Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  replace('document',document); replace('window',window); replace('navigator',{onLine:true});
  replace('setTimeout',(fn,ms)=>{pendingTimers.set(++nextId,{fn,ms});return nextId;});
  replace('clearTimeout',id=>pendingTimers.delete(id)); replace('setInterval',()=>1);
  try {
    const feed = createQuoteFeedControls({getState:()=>({quotes:[]}),getTool:()=> 'ev-pre',sync:()=>{requests++;return new Promise(done=>{resolve=done;});}});
    assert.equal(select.value,'30000');
    assert.equal([...pendingTimers.values()][0].ms,30000);
    const first = feed.refresh();
    assert.equal(await feed.refresh(),false);
    assert.equal(requests,1);
    resolve({saved:true}); await first;
    document.hidden=true; events.get('visibilitychange')();
    assert.equal(pendingTimers.size,0);
    document.hidden=false; events.get('visibilitychange')();
    assert.equal(pendingTimers.size,1);
    feed.pause(); assert.equal(storage.get('sportslab-quote-refresh-ms'),'0');
    assert.equal(pendingTimers.size,0);
  } finally {
    for (const [key,descriptor] of Object.entries(original)) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key];
  }
});

test('quote refresh defaults to 10 seconds and live tools are forced to 3 seconds', () => {
  const original = Object.fromEntries(['document','window','navigator','setTimeout','clearTimeout','setInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const replace = (key,value) => Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const build = (saved) => {
    const select = element(), button = element(), fields = new Map(), timers = new Map(), storage = new Map(saved == null ? [] : [['sportslab-quote-refresh-ms',saved]]);
    const panel = {...element(),querySelector:selector=>selector==='select'?select:fields.get(selector)};
    for (const selector of ['[data-feed-status]','[data-feed-meta]','[data-feed-detail]','[data-feed-coverage]']) fields.set(selector,element());
    let nextId = 0;
    replace('document',{hidden:false,createElement:()=>panel,querySelector:selector=>selector==='.ev-header'?{after(){}}:button,addEventListener(){}});
    replace('window',{addEventListener(){},localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,value)}});
    replace('navigator',{onLine:true});
    replace('setTimeout',(fn,ms)=>{timers.set(++nextId,{fn,ms});return nextId;});
    replace('clearTimeout',id=>timers.delete(id)); replace('setInterval',()=>1);
    return { select, timers, storage };
  };
  try {
    let env = build(null);
    createQuoteFeedControls({getState:()=>({quotes:[]}),getTool:()=> 'ev-pre',sync:async()=>({saved:true})});
    assert.equal(env.select.value,'10000');
    assert.equal([...env.timers.values()][0].ms,10000);

    env = build('0'); let tool = 'ev-live';
    const feed = createQuoteFeedControls({getState:()=>({quotes:[]}),getTool:()=>tool,sync:async()=>({saved:true})});
    assert.equal(env.select.value,'3000', 'Live ignores a saved Off preference.');
    assert.equal(env.select.disabled,true);
    assert.equal([...env.timers.values()][0].ms,3000);
    feed.pause();
    assert.equal([...env.timers.values()][0].ms,3000, 'Live refresh cannot be paused.');
    tool = 'ev-pre'; feed.update();
    assert.equal(env.select.value,'0');
    assert.equal(env.select.disabled,false);
    assert.equal(env.timers.size,0, 'Pregame keeps the viewer\'s Off choice.');
    tool = 'arb-live'; feed.update();
    assert.equal([...env.timers.values()][0].ms,3000);
  } finally {
    for (const [key,descriptor] of Object.entries(original)) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key];
  }
});
