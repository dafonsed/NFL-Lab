import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceHistoryView} from '../public/bet-reference-history.js';
import {load} from 'cheerio';
import {lineHistoryView} from '../public/bet-history.js';

test('phone history uses its viewport width and fewer readable time ticks',()=>{
  const ts=new Date(Date.now()-60_000).toISOString();
  const $=load(lineHistoryView({selection:'Over 24.5',columns:[{name:'Book A'}],history:[{book:'Book A',odds:110,line:24.5,ts}]},{width:320}));
  assert.equal($('svg').attr('viewBox'),'0 0 320 340');
  assert.equal($('.bet-history-grid text').length,9,'six price ticks and three time ticks');
  assert.equal($('.bet-history-hit').attr('tabindex'),'0');
  assert.match($('.bet-history-hit').attr('aria-label'),/Book A: \+110/);
  assert.equal($('.bet-history-hit').attr('data-line'),'24.5');
});

test('long unobserved intervals do not draw a falsely flat price trace',()=>{
  const now=Date.now();
  const history=[30,29,1].map((minutes,index)=>({book:'Book A',odds:index?120:110,line:24.5,ts:new Date(now-minutes*60_000).toISOString()}));
  const $=load(lineHistoryView({selection:'Over 24.5',history},{width:390}));
  const path=$('.bet-history-trace path').attr('d');
  assert.equal((path.match(/M/g)||[]).length,2,'restart path after the 28-minute missing interval');
  assert.equal((path.match(/H/g)||[]).length,1,'connect the adjacent recorded snapshots');
});

test('expanded reference history adapts to phones without connecting missing intervals',()=>{
  const now=Date.now();
  const history=[30,29,1].map((minutes,index)=>({book:'Book A',odds:index?120:110,line:index?25.5:24.5,ts:new Date(now-minutes*60_000).toISOString()}));
  const $=load(referenceHistoryView({selection:'Over 24.5',history},{metric:'line',width:320}));
  assert.equal($('svg[role=img]').attr('viewBox'),'0 0 320 340');
  const path=$('.bet-reference-trace>path').attr('d');
  assert.equal((path.match(/M/g)||[]).length,2);
  assert.equal((path.match(/H/g)||[]).length,1,'no invented trailing price line');
  assert.equal($('.bet-reference-leader').length,0,'latest book values remain in the phone legend');
  assert.match($('.bet-reference-point').first().attr('aria-label'),/Book A: 24.5/);
});
