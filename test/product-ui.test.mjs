import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {requestData,propBoard,propRow,miniHistory} from '../public/product-ui.js';

test('request boundary times out, distinguishes caller cancellation, and keeps returned values intact',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason));});
  await assert.rejects(requestData('/slow',{timeout:10}),/took too long/);
  const c=new AbortController();const pending=requestData('/superseded',{signal:c.signal,timeout:1000});c.abort();await assert.rejects(pending,{name:'AbortError'});
  const response={point:0,probability:{over:.426},missing:null};globalThis.fetch=async()=>({ok:true,json:async()=>response});assert.equal(await requestData('/data'),response);
  globalThis.fetch=async()=>({ok:false,status:503});await assert.rejects(requestData('/error'),/data service is unavailable/);
 }finally{globalThis.fetch=original;}
});
test('comparison rows preserve zeroes, archive and stale provenance, and historical results separately',()=>{
 const p={key:'a',sport:'nba',name:'Player <A>',team:'ABC',opponent:'XYZ',position:'G',market:'points',playerId:'1',rows:[{date:'2026-01-01',value:0}],forecast:{point:0,sampleCount:1,probability:{over:0}},prop:{line:0,bookmaker:'Book',basis:'published_archive',stale:true},result:{status:'final',actual:0},raw:{}};
 const before=structuredClone(p),$=load(propRow(p));
 assert.equal($('.research-estimate > strong').text(),'0');assert.equal($('.research-probability > strong').text(),'0%');assert.equal($('.research-result > strong').text(),'0');assert.equal($('.research-result small').text(),'Final');assert.match($('.quote-kind').text(),/Retrospective.*saved/);assert.equal($('.research-player strong').text(),'Player <A>');assert.deepEqual(p,before);
 const missing=load(propRow({...p,prop:null,forecast:{point:null},result:null}));assert.equal(missing('.research-estimate > strong').text(),'—');assert.equal(missing('.research-probability > strong').text(),'—');assert.match(missing('.research-line small').text(),/No posted line/);
});
test('recent result charts retain negative game values, pushes and comparison direction',()=>{
 const p={rows:[{date:'2026-01-03',value:2},{date:'2026-01-02',value:0},{date:'2026-01-01',value:-2}],prop:{line:0}};
 const $=load(miniHistory(p,'under'));assert.equal($('rect.hit').length,1);assert.equal($('rect.push').length,1);assert.equal($('rect.miss').length,1);assert.match($('svg').attr('aria-label'),/-2/);assert.ok(Number($('rect.hit').attr('y'))>Number($('rect.miss').attr('y')));
});

test('future NFL TD overview shows model strength without workload',()=>{
 const p={key:'td',sport:'nfl',market:'any_td',name:'Player',team:'SEA',opponent:'HOU',rows:[],forecast:{point:.56,probability:{over:.45},sampleCount:5},prop:{line:.5,bookmaker:'Book'},raw:{modelScore:72,tdProb:.61,tdProbMethod:'historical-score-calibration'}};
 const $=load(propBoard([p]));
 assert.equal($('.research-estimate strong').text(),'72%');
 assert.match($('.research-estimate .row-field-label').text(),/Model strength/);
 assert.equal($('.research-probability').length,0);
 assert.equal($('.research-columns span').length,6);
 assert.doesNotMatch($('.research-board').text(),/Workload/);
});
