import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {requestData,propBoard,propRow,miniHistory,trendTable} from '../public/product-ui.js';

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
 assert.equal($('.research-history').length,0,'Model rows do not embed Trends charts');
 assert.equal($('.research-estimate > strong').text(),'0');assert.equal($('.research-probability > strong').text(),'0%');assert.equal($('.research-result > strong').text(),'0');assert.equal($('.research-result small').text(),'Final');assert.match($('.quote-kind').text(),/Retrospective.*saved/);assert.equal($('.research-player strong').text(),'Player <A>');assert.deepEqual(p,before);
 const missing=load(propRow({...p,prop:null,forecast:{point:null},result:null}));assert.equal(missing('.research-estimate > strong').text(),'—');assert.equal(missing('.research-probability > strong').text(),'—');assert.match(missing('.research-line small').text(),/No posted line/);
});
test('recent result charts retain negative game values, pushes and comparison direction',()=>{
 const p={rows:[{date:'2026-01-03',value:2},{date:'2026-01-02',value:0},{date:'2026-01-01',value:-2}],prop:{line:0}};
 const $=load(miniHistory(p,'under'));assert.equal($('rect.hit').length,1);assert.equal($('rect.push').length,1);assert.equal($('rect.miss').length,1);assert.match($('svg').attr('aria-label'),/-2/);assert.ok(Number($('rect.hit').attr('y'))>Number($('rect.miss').attr('y')));
});

test('model rows show the selected side price and only mark an available sportsbook quote',()=>{
 const p={key:'book',playerId:'1',sport:'mlb',name:'Player',team:'SEA',opponent:'HOU',market:'hits',rows:[],forecast:{point:1},prop:{line:.5,bookmaker:'FanDuel',stale:true,prices:{over:{american:-200},under:{american:150}}}};
 const over=load(propRow(p,{side:'over'})),under=load(propRow(p,{side:'under'}));
 assert.equal(over('.research-odds strong').text(),'-200');assert.equal(under('.research-odds strong').text(),'+150');
 assert.equal(over('.research-odds img').attr('alt'),'FanDuel');assert.match(over('.research-odds').attr('title'),/Saved quote/);
 const missing=load(propRow({...p,prop:{...p.prop,prices:{}}}));assert.equal(missing('.research-odds strong').text(),'—');assert.equal(missing('.research-odds img').length,0);
 const other=load(propRow({...p,prop:{...p.prop,bookmaker:'Other book'}}));assert.equal(other('.research-odds img').length,0);assert.equal(other('.research-odds small').text(),'Other book');
});

test('NFL TD overview shows model strength beside sportsbook prices and keeps TD chance separate',()=>{
 const p={key:'td',sport:'nfl',market:'any_td',label:'Touchdowns',name:'Player',team:'SEA',opponent:'HOU',rows:[],forecast:{point:.56,probability:{over:.45},sampleCount:5},prop:{line:.5,bookmaker:'FanDuel',prices:{over:{american:-220}}},raw:{}};
 const $=load(propBoard([p]));
 assert.match($('.research-board-guide').text(),/0–100 ranking score/);
 assert.match($('.research-estimate .row-field-label').text(),/Model strength/);
 assert.equal($('.research-estimate strong').text(),'—');
 assert.equal($('.research-probability').length,0);
 assert.equal($('.research-odds strong').text(),'-220');
 const calibrated=load(propBoard([{...p,raw:{modelScore:72,tdProb:.61,tdProbMethod:'historical-score-calibration'}}]));
 assert.match(calibrated('.research-columns').text(),/Model strength %/);
 assert.equal(calibrated('.research-estimate strong').text(),'72%');
 assert.doesNotMatch(calibrated('.research-estimate').text(),/61%/);
 assert.equal(calibrated('.research-probability').length,0);
 assert.doesNotMatch(calibrated('.research-board').text(),/Workload/);
});

test('Trends windows use real sample sizes, retain zeroes and mark saved odds',()=>{
 const p={key:'a',playerId:'1',name:'Player <A>',label:'Points',team:'ABC',opponent:'XYZ',sport:'nba',rows:[{date:'2026-01-03',value:2,opponent:'XYZ'},{date:'2026-01-02',value:0,opponent:'OTHER'},{date:'2026-01-01',value:-2,opponent:'XYZ'}],prop:{line:0,bookmaker:'Book',stale:true,prices:{under:{american:-110}}}};
 const before=structuredClone(p),$=load(trendTable([{p,line:0}],{side:'under',saved:new Set(['1'])}));
 assert.equal($('.trend-rate').length,4);assert.equal($('.trend-rate').first().find('strong').text(),'33%');assert.equal($('.trend-rate').first().find('small').text(),'1/3');assert.equal($('.trend-rate').last().find('strong').text(),'50%');assert.equal($('.trend-rate').last().find('small').text(),'1/2');
 assert.match($('.trend-rate').first().attr('title'),/1 pushes/);assert.equal($('.trend-average strong').text(),'0');assert.match($('.trend-line').text(),/0Saved quote/);assert.equal($('.trend-odds strong').text(),'-110');assert.equal($('.trend-save').attr('aria-pressed'),'true');assert.equal($('.trend-player-link strong').text(),'Player <A>');assert.deepEqual(p,before);
 const missing=load(trendTable([{p:{...p,prop:null,rows:[]},line:null}]));assert.equal(missing('.trend-rate').first().find('strong').text(),'—');assert.equal(missing('.trend-rate').first().find('small').text(),'0 games');assert.equal(missing('.trend-odds strong').text(),'—');assert.equal(missing('.trend-average strong').text(),'—');
});

test('Trends marks only the displayed sorted column and averages the selected sample',()=>{
 const p={key:'ranked',playerId:'1',name:'Player',label:'Points',team:'ABC',opponent:'XYZ',sport:'nba',rows:Array.from({length:10},(_,i)=>({date:`2026-01-${String(20-i).padStart(2,'0')}`,value:i<5?2:20,opponent:i%2?'OTHER':'XYZ'})),prop:null};
 const rows=[{p,line:1}];
 for(const [window,label] of [['5','L5'],['10','L10'],['20','L20'],['h2h','H2H']]){
  const $=load(trendTable(rows,{sort:'rate',window}));
  assert.equal($('thead [aria-sort]').length,1);
  assert.equal($('thead .trend-ranked').text(),label);
  assert.equal($('thead .trend-ranked').attr('aria-sort'),'descending');
  assert.equal($('tbody .trend-ranked').length,1);
  assert.equal($('tbody .trend-ranked').attr('data-window-label'),label);
  assert.equal($('thead button').length,0);
 }
 const average=load(trendTable(rows,{sort:'average',window:'5'}));
 assert.match(average('thead .trend-ranked').text(),/AverageLast 5 games/);
 assert.equal(average('.trend-average.trend-ranked strong').text(),'2');
 assert.equal(average('.trend-average small').text(),'5 games');
 assert.equal(average('thead [aria-sort]').length,1);
 const all=load(trendTable(rows,{sort:'average',window:'all'}));
 assert.equal(all('.trend-average.trend-ranked strong').text(),'11');
 for(const options of [{sort:'rate',window:'all'},{sort:'change',window:'5'},{sort:'name',window:'10'},{}]){
  const $=load(trendTable(rows,options));
  assert.equal($('.trend-ranked,[aria-sort]').length,0);
  assert.equal($('.trend-average strong').text(),'11');
 }
});
