import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {snapComparisonLine,valueAtChartY} from '../public/chart-line.js';
import {availabilityReceiptHtml} from '../public/research-notes.js';
globalThis.location={search:''};
const {gameChart,matchupComparison}=await import('../public/player-research.js');
delete globalThis.location;

test('drag coordinates increase upward, snap to half points and stay in bounds',()=>{
 const geometry={low:0,high:200,top:30,height:240};
 assert.equal(valueAtChartY(30,geometry),200);assert.equal(valueAtChartY(270,geometry),0);assert.equal(valueAtChartY(150,geometry),100);
 assert.equal(snapComparisonLine(75.72),75.5);assert.equal(snapComparisonLine(75.78),76);
 assert.equal(snapComparisonLine(-20,0,200),0);assert.equal(snapComparisonLine(205,0,200),200);
 assert.equal(snapComparisonLine(-4.7,-100,1000),-4.5);
});
test('only full charts with a comparison line expose a keyboard slider',()=>{
 const rows=[{date:'2026-09-20',value:0,parts:[]},{date:'2026-09-19',value:100,parts:[]}];
 const $=load(gameChart(rows,75.5));
 assert.equal($('[role=slider]').attr('aria-valuenow'),'75.5');assert.equal($('[role=slider]').attr('aria-orientation'),'vertical');assert.equal($('[role=slider]').attr('tabindex'),'0');
 assert.match($('[role=slider]').attr('aria-description'),/not the sportsbook line/);
 assert.equal($('[data-result="0"]').length,1);
 assert.equal(load(gameChart(rows,null))('[role=slider]').length,0);
 assert.equal(load(gameChart(rows,75.5,'over',true))('[role=slider]').length,0);
 assert.equal(load(gameChart([],75.5))('[role=slider]').length,0);
});
test('matchup comparison preserves its units, values, sample and calculation note',()=>{
 const p={sport:'nfl',label:'Receiving yards',opponent:'LV <team>',forecast:{},context:{available:true,rate:138.28,leagueRate:150.74,sampleCount:5,unit:'WR production per opponent game',description:'Stabilized with three league-average games',sourceUrl:'https://example.com'}};
 const $=load(matchupComparison(p));assert.deepEqual($('dd').map((_,e)=>$(e).text()).get(),['138.28','150.74']);assert.match($('.pr-context-unit').text(),/Receiving yards \/ game · vs WR/);assert.match($('.pr-context-sample').text(),/5 prior games/);assert.match($('details').text(),/three league-average games/);assert.equal($('team').length,0);
 p.context={available:true,rate:0,leagueRate:0,sampleCount:0,unit:'per plate appearance'};
 assert.deepEqual(load(matchupComparison(p))('dd').map((_,e)=>load(e).text()).get(),['0','0']);
});
test('injury receipts preserve failure reasons and unavailable timestamps',()=>{
 const $=load(availabilityReceiptHtml({applied:1,excluded:0,stale:true,error:'Refresh failed <source>. New leans withheld.'}));
 assert.match($('.source-receipt-title').text(),/0 unavailable players/);assert.equal($('details[open]').length,1);assert.match($('details').text(),/New leans withheld/);assert.match($('dd').text(),/Unavailable/);assert.equal($('source').length,0);
 const historical=load(availabilityReceiptHtml({applied:0,stale:false}));assert.match(historical.text(),/outside the current report/);assert.match(historical.text(),/do not establish past availability/);
});
