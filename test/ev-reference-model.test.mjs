import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../public/ev-core.js';

const source=await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
const functions=['comparisonForQuote','evReferenceModel'].map(name=>{
  const start=source.indexOf(`function ${name}(`);
  return source.slice(start,source.indexOf('\nfunction ',start+1));
}).join('\n');
const quote=(id,book,side,odds,extra={})=>({id,book,side,odds,sport:'NFL',event:'ARI vs SEA',market:'Passing yards',player:'Quarterback',type:'prop',line:249.5,live:false,ts:new Date().toISOString(),...extra});
function modelFor(rows,index=0){
  const context=vm.createContext({...core,active:'ev-pre',state:{quotes:rows,history:[]},quoteSource:()=>rows,
    bookAvailable:()=>true,sportsbookNames:['FanDuel','DraftKings'],brandMark:()=>'',fmtLine:String,
    oddsDemoHistory:()=>[],bankroll:5000,kelly:.25,age:()=> 'Just now',esc:String,
    quote:rows[index]});
  return vm.runInContext(functions+'\nconst comparison=comparisonForQuote(quote);evReferenceModel(quote,comparison.rawFair,expectedReturn(comparison.rawFair,quote.odds));',context);
}

test('reference cards keep consensus probability distinct from the selected sportsbook offer',()=>{
  const rows=[quote('offer','FanDuel','Over',140),quote('offer-under','FanDuel','Under',-155),quote('ref','DraftKings','Over',-110),quote('ref-under','DraftKings','Under',-110)];
  const model=modelFor(rows);
  assert.equal(model.fairOdds,'-100');
  assert.equal(model.fairMark,'','consensus does not acquire an offered-book logo');
  assert.equal(model.probability,'50.0%');
  assert.equal(model.selection,'Quarterback Over 249.5');
  assert.equal(model.metrics[0].label,'FanDuel');
  assert.equal(model.metrics[0].value,'+140');
  assert.equal(model.metrics[1].value,'20.00%');
  assert.equal(model.metrics[2].value,core.money(core.fractionalKellyStake(5000,.25,.5,140)));
  assert.equal(model.referenceRows[0].selection,'Line');
  assert.equal(model.referenceRows[0].prices[0].value,'249.5');
  assert.equal(model.referenceRows[1].prices[0].value,'+140 / -155');
  assert.equal(model.inlineHistory,true);
  assert.equal(model.standalone,true);
  assert.equal(model.historyMetric,'line');
  assert.equal(model.history.length,2,'only recorded quotes appear without a history feed');
});

test('a missing consensus remains unavailable and does not acquire invented probability or history',()=>{
  const model=modelFor([quote('one','FanDuel','Over',120)]);
  assert.equal(model.fairOdds,'—');
  assert.equal(model.probability,'—');
  assert.equal(model.metrics[1].value,'—');
  assert.equal(model.metrics[2].value,'—');
  assert.equal(model.history.length,1);
  assert.equal(model.canSwap,false);
});

test('reference comparison keeps different player markets out of the price and history rows',()=>{
  const rows=[quote('a','FanDuel','Over',120),quote('b','FanDuel','Under',-130),
    quote('c','DraftKings','Over',-110),quote('d','DraftKings','Under',-110),
    quote('other','Unrelated book','Over',400,{player:'Different player'})];
  const model=modelFor(rows);
  assert.deepEqual(Array.from(model.columns,column=>column.name),['FanDuel','DraftKings']);
  assert.ok(model.history.every(point=>point.player==='Quarterback'));
});
