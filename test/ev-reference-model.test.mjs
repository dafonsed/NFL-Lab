import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as format from '../public/odds-format.js';
import {decimal,fractionalKellyStake} from '../public/betting-math.js';
import {isCurrent,valueState} from '../public/odds-contract.js';
import {priced} from './helpers/priced.mjs';

// The comparison panel behind every price (the Positive EV row detail and the inline analysis): it shows
// what /api/odds served for the selection and its market, and computes nothing from the odds.
const source=await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
const start=source.indexOf('function comparisonForQuote(');
const functions=[source.match(/^const kellyStake = .*$/m)[0],source.slice(start,source.indexOf('\nfunction ',start+1))].join('\n');
const quote=(id,book,side,odds,extra={})=>({id,book,side,odds,sport:'NFL',event:'ARI vs SEA',market:'Passing yards',player:'Quarterback',type:'prop',line:249.5,live:false,ts:new Date().toISOString(),...extra});
function modelFor(rows,index=0){
  const served=priced(rows);
  const context=vm.createContext({...format,decimal,valueState,serverNow:Date.now,suite:{settings:()=>({devigMethod:'multiplicative'}),quoteVisible:()=>true},active:'ev-pre',state:{quotes:served.quotes,analytics:served.analytics,history:[]},
    current:item=>isCurrent(item),bookAvailable:()=>true,sportsbookNames:['FanDuel','DraftKings'],brandMark:()=>'',fmtLine:String,oddsLabel:format.oddsLabel,startLabel:()=>'',
    bankroll:5000,kelly:.25,age:()=> 'Just now',esc:String,quote:served.quotes[index]});
  return vm.runInContext(functions+'\ncomparisonForQuote(quote);',context);
}

test('the comparison shows the server’s consensus fair value, EV and Kelly stake for the offered price',()=>{
  const rows=[quote('offer','FanDuel','Over',140),quote('offer-under','FanDuel','Under',-155),quote('ref','DraftKings','Over',-110),quote('ref-under','DraftKings','Under',-110)];
  const model=modelFor(rows);
  assert.equal(model.fairOdds,'+100','even money is +100');
  assert.equal(model.probability,'50.0%','DraftKings alone sets the fair price: the offered book never prices itself');
  assert.equal(model.ev,'20.00%');
  assert.equal(model.recommended,format.money(fractionalKellyStake(5000,.25,.5,140)),'the server’s Kelly fraction times the member’s bankroll and multiplier');
  assert.equal(model.vig,(100*(1/2.4+155/255-1)).toFixed(1)+'%','FanDuel’s own margin on this market');
  assert.deepEqual(Array.from(model.columns,column=>column.name),['FanDuel','DraftKings']);
  assert.equal(model.columns[0].odds,'+140 / -155');
  assert.equal(model.columns[1].probability,'50.0%','each book’s own no-vig probability');
  // The market's average price for the side, as served: FanDuel's +140 is more than 10 points (implied) longer
  // than the other book, so the server leaves it out of the average, as on the odds screen.
  assert.equal(model.rows[0].average,'-110');
  assert.equal(model.history.length,2,'only recorded quotes appear without a history feed');
  assert.match(model.note,/multiplicative/);
  assert.match(model.note,/calculated on the VisualOdds server from raw sportsbook prices/,'the note says where the fair value came from');
});

test('a missing consensus stays unavailable: no invented probability, EV or stake',()=>{
  const model=modelFor([quote('one','FanDuel','Over',120)]);
  assert.equal(model.fairOdds,null);
  assert.equal(model.probability,null);
  assert.equal(model.ev,'—');
  assert.equal(model.recommended,'—');
  assert.equal(model.vig,null);
  assert.equal(model.history.length,1);
  assert.equal(model.canSwap,false);
  assert.match(model.note,/not enough qualifying reference data/);
});

test('the comparison keeps different player markets out of the price and history rows',()=>{
  const rows=[quote('a','FanDuel','Over',120),quote('b','FanDuel','Under',-130),
    quote('c','DraftKings','Over',-110),quote('d','DraftKings','Under',-110),
    quote('other','Unrelated book','Over',400,{player:'Different player'})];
  const model=modelFor(rows);
  assert.deepEqual(Array.from(model.columns,column=>column.name),['FanDuel','DraftKings']);
  assert.ok(model.history.every(point=>point.player==='Quarterback'));
});
