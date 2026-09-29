import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {bindComparisonLines,snapComparisonLine,valueAtChartY} from '../public/chart-line.js';
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

function comparisonGesture(t,onPreview=()=>{}) {
 const originalPoint=globalThis.DOMPoint;
 globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(matrix){return {x:this.x,y:this.y+matrix.dy};}};
 t.after(()=>{if(originalPoint===undefined)delete globalThis.DOMPoint;else globalThis.DOMPoint=originalPoint;});
 const handlers=new Map(),attributes=new Map([['aria-valuemin','0'],['aria-valuemax','100'],['aria-valuenow','50']]);
 const classes=new Set(),previews=[],commits=[],label={textContent:'50'};
 let chartTop=0,capture=null,start=50,cancels=0;
 const svg={dataset:{low:'0',high:'100',top:'0',height:'100',side:'over'},getScreenCTM:()=>({inverse:()=>({dy:-chartTop})}),getAttribute:()=>'; comparison line at 50',setAttribute(){},querySelectorAll:()=>[]};
 const control={ownerSVGElement:svg,isConnected:true,getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,String(value)),querySelector:()=>label,focus(){},setPointerCapture:id=>{capture=id;},hasPointerCapture:id=>capture===id,releasePointerCapture:()=>{capture=null;},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}};
 const cleanup=bindComparisonLines({addEventListener:(type,handler)=>handlers.set(type,handler)},{
  onStart:()=>{start=Number(attributes.get('aria-valuenow'));},
  onPreview:value=>{previews.push(value);onPreview({svg,moveChart:top=>{chartTop=top;}});},
  onCommit:value=>{commits.push(value);control.setAttribute('aria-valuenow',value);},
  onCancel:()=>{cancels++;control.setAttribute('aria-valuenow',start);}
 });
 t.after(cleanup);
 const fire=(type,changes={})=>handlers.get(type)({target:{closest:()=>control},button:0,isPrimary:true,pointerId:1,clientX:0,clientY:50,preventDefault(){},stopPropagation(){},...changes});
 return {fire,svg,previews,commits,control,classes,get capture(){return capture;},get cancels(){return cancels;}};
}

test('drag keeps pointer deltas stable when a custom-line preview moves and resizes the chart',t=>{
 const gesture=comparisonGesture(t,({svg,moveChart})=>{moveChart(30);Object.assign(svg.dataset,{high:'300',top:'20',height:'200'});});
 gesture.fire('pointerdown');
 gesture.fire('pointermove',{clientY:49});
 gesture.fire('pointermove',{clientY:48});
 gesture.fire('pointerup',{clientY:48});
 assert.deepEqual(gesture.previews,[51,52]);assert.deepEqual(gesture.commits,[52]);
 assert.equal(gesture.capture,null);assert.equal(gesture.classes.has('is-dragging'),false);
 // The next gesture uses the new location and scale, rather than the old snapshot.
 gesture.fire('pointerdown',{clientY:100});gesture.fire('pointermove',{clientY:98});gesture.fire('pointerup',{clientY:98});
 assert.deepEqual(gesture.previews,[51,52,55]);assert.deepEqual(gesture.commits,[52,55]);
});

test('comparison gestures still cancel, ignore untouched clicks, and support keyboard adjustments',t=>{
 const gesture=comparisonGesture(t);
 for(const cancel of ['pointercancel','lostpointercapture','Escape']){
  gesture.fire('pointerdown');gesture.fire('pointermove',{clientY:45});
  gesture.fire(cancel==='Escape'?'keydown':cancel,{key:cancel});
  assert.equal(gesture.control.getAttribute('aria-valuenow'),'50');assert.equal(gesture.capture,null);
 }
 assert.equal(gesture.cancels,3);assert.deepEqual(gesture.commits,[]);
 gesture.fire('pointerdown');gesture.fire('pointerup');assert.deepEqual(gesture.commits,[]);
 gesture.fire('keydown',{key:'ArrowUp'});gesture.fire('keydown',{key:'ArrowDown',shiftKey:true});
 gesture.fire('keydown',{key:'Home'});gesture.fire('keydown',{key:'End'});
 assert.deepEqual(gesture.commits,[50.5,45.5,0,100]);
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

test('history labels use the actual opponent logos, short codes and home/away markers',()=>{
 const rows=[{date:'2026-09-20',value:0,parts:[],opponent:'Los Angeles Angels',opponentId:108,home:true},{date:'2026-09-19',value:2,parts:[],opponent:'Athletics',opponentId:133,home:false}];
 const $=load(gameChart(rows,.5,'under',false,600,'mlb'));
 assert.deepEqual($('.pr-opponent-code').map((_,e)=>$(e).text()).get(),['@ ATH','vs LAA']);
 assert.deepEqual($('.pr-opponent-logo').map((_,e)=>$(e).attr('href')).get(),['https://a.espncdn.com/i/teamlogos/mlb/500-dark/ath.png','https://a.espncdn.com/i/teamlogos/mlb/500/laa.png']);
 assert.match($('.pr-game-opponent').first().attr('aria-label'),/Athletics/);
 assert.equal($('[data-result="0"] .pr-bar.hit').length,1);
 assert.equal($('[data-result="2"] .pr-bar.miss').length,1);
 assert.ok(!$('.pr-game-opponent').text().includes('…'));
});
test('matchup comparison preserves its units, values, sample and calculation note',()=>{
 const p={sport:'nfl',label:'Receiving yards',opponent:'LV <team>',forecast:{},context:{available:true,rate:138.28,leagueRate:150.74,sampleCount:5,unit:'WR production per opponent game',description:'Stabilized with three league-average games',sourceUrl:'https://example.com'}};
 const $=load(matchupComparison(p));assert.deepEqual($('.pr-matchup-comparison-table tbody td').map((_,e)=>$(e).text()).get(),['138.28','150.74']);assert.match($('.pr-context-unit').text(),/Receiving yards \/ game · vs WR/);assert.match($('.pr-context-sample').text(),/5 prior games/);assert.match($('details').text(),/three league-average games/);assert.equal($('team').length,0);
 p.context={available:true,rate:0,leagueRate:0,sampleCount:0,unit:'per plate appearance'};
 assert.deepEqual(load(matchupComparison(p))('.pr-matchup-comparison-table tbody td').map((_,e)=>load(e).text()).get(),['0','0']);
});
test('injury receipts preserve failure reasons and unavailable timestamps',()=>{
 const $=load(availabilityReceiptHtml({applied:1,excluded:0,stale:true,error:'Refresh failed <source>. New leans withheld.'}));
 assert.match($('.source-receipt-title').text(),/0 unavailable players/);assert.equal($('details[open]').length,1);assert.match($('details').text(),/New leans withheld/);assert.match($('dd').text(),/Unavailable/);assert.equal($('source').length,0);
 const historical=load(availabilityReceiptHtml({applied:0,stale:false}));assert.match(historical.text(),/outside the current report/);assert.match(historical.text(),/do not establish past availability/);
});
