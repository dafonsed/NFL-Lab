import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastInputs, fitPoisson, predictMean, countDistribution, lineProbabilities, predictionInterval, BENCHMARKS } from '../lib/mlb/forecast-core.mjs';
import { attachMlbForecast, forecastHistory, mlbModelReport } from '../lib/mlb/forecast.mjs';
const rows=Array.from({length:20},(_,i)=>({gameId:i+1,date:`2026-09-${String(i+1).padStart(2,'0')}`,role:'hitting',stats:{plateAppearances:4,homeRuns:i%4===0?1:0,hits:i%3,totalBases:i%3+1}}));
const target={date:'2026-09-21',home:true},prior={rate:0.03,workload:4};
const player=()=>({role:'hitting',home:true,lineupStatus:'confirmed',abstractState:'Preview',gameType:'R',prop:{line:0.5,basis:'captured_pregame'},result:{actual:null,status:'pending'},modelScore:44,projected:0.2});

test('MLB features exclude same-day, future, previous season, missing exposure and duplicate rows',()=>{
  const bad=[{...rows[0],gameId:90,date:target.date,stats:{plateAppearances:10,homeRuns:10}},{...rows[0],gameId:91,date:'2027-01-01'},{...rows[0],gameId:92,date:'2025-09-20'},{...rows[0],gameId:93,stats:{homeRuns:2}},rows[0]];
  const a=forecastInputs(rows,target,'hr',prior),b=forecastInputs([...rows,...bad],target,'hr',prior);
  assert.deepEqual(b,a);assert.equal(a.count,20);assert.equal(a.values.observedExposure,80);assert.equal(a.values.observedTotal,5);
  assert.equal(a.values.longRate,(5+0.03*40)/(80+40));
});
test('MLB feature history allows earlier doubleheaders but excludes both on target date',()=>{
  const extra={...rows[0],gameId:99,date:'2026-09-20'};
  assert.equal(forecastInputs([...rows,extra],target,'hr',prior).count,21);
  assert.equal(forecastInputs([...rows,extra],{...target,date:'2026-09-20'},'hr',prior).count,19);
});
test('MLB forecast history uses completed regular MLB games and actual pitcher starts',()=>{
  const splits=[{date:'2026-09-20',game:{gamePk:1},gameType:'R',sport:{id:1},stat:{gamesStarted:1,battersFaced:20,strikeOuts:6}},{date:'2026-09-19',game:{gamePk:2},gameType:'S',sport:{id:1},stat:{}},{date:'2026-09-18',game:{gamePk:3},gameType:'R',sport:{id:11},stat:{}},{date:'2026-09-17',game:{gamePk:4},gameType:'R',sport:{id:1},stat:{}}];
  const history=forecastHistory({stats:[{type:{displayName:'gameLog'},group:{displayName:'pitching'},splits}]},new Set([1,2,3]));
  assert.equal(history.length,1);
  const mixed=Array.from({length:6},(_,i)=>({...history[0],gameId:i+1,date:`2026-09-${10+i}`,stats:{...history[0].stats,gamesStarted:i<3?1:0}}));
  const input=forecastInputs(mixed,target,'k',{rate:0.22,workload:22});assert.equal(input.available,false);assert.equal(input.count,3);
});
test('Count distributions keep over, under and exact pushes distinct and normalized',()=>{
  for(const d of [{family:'poisson'},{family:'negative-binomial',alpha:0.7},{family:'normal',factor:0.9}]){
    const pmf=countDistribution(3,d),p=lineProbabilities(pmf,3),half=lineProbabilities(pmf,3.5);
    assert.ok(Math.abs(p.over+p.under+p.push-1)<1e-10);assert.ok(p.push>0);assert.equal(half.push,0);assert.ok(lineProbabilities(pmf,4.5).over<half.over);assert.ok(pmf.every(n=>n>=0&&n<=1));
    const range=predictionInterval(pmf);assert.ok(range[0]<=range[1]);
  }
  assert.equal(lineProbabilities([1],null),null);assert.deepEqual(lineProbabilities(countDistribution(0),0),{over:0,under:0,push:1});
});
test('Regression fitting learns the outcome mean instead of a hardcoded form scale',()=>{
  const data=Array.from({length:40},(_,i)=>({x:[0,0,0,0,0,0],y:i%2?1:3}));
  const model=fitPoisson(data,0.001);assert.ok(Math.abs(predictMean(data[0],model)-2)<0.00001);
});
test('Serving never incorporates selected-game results, and preserves original grade/form values',()=>{
  const a=player(),b={...player(),gameStats:{homeRuns:9},result:{actual:9,status:'over'}};
  attachMlbForecast(a,rows,target.date,'hr');attachMlbForecast(b,rows,target.date,'hr');
  assert.deepEqual(a.forecast,b.forecast);assert.equal(a.modelScore,44);assert.equal(a.projected,0.2);assert.equal(b.result.actual,9);assert.equal(a.forecast.sampleCount,20);
});
test('No fabricated line probability, leaked development-date forecast, or small-sample estimate',()=>{
  const noLine={...player(),prop:null};attachMlbForecast(noLine,rows,target.date,'hr');assert.equal(noLine.forecast.probability,null);assert.equal(noLine.forecast.eligible,false);
  const thin=player();attachMlbForecast(thin,rows.slice(0,7),target.date,'hr');assert.equal(thin.forecast.status,'unavailable');assert.equal(thin.forecast.point,null);
  const old=player();attachMlbForecast(old,rows,'2024-09-21','hr');assert.equal(old.forecast.status,'unavailable');
});
test('Lineup uncertainty, stale inputs, live games and postseason stay visible and suppress leans',()=>{
  for(const update of [{lineupStatus:'unconfirmed'},{lineupStatus:'bench'},{abstractState:'Final'},{gameType:'W'}]){
    const p={...player(),...update};attachMlbForecast(p,rows,target.date,'hr');assert.equal(p.forecast.eligible,false);assert.equal(p.forecast.lean,null);assert.ok(p.forecast.reasons.length);
  }
  const stale=player();attachMlbForecast(stale,rows,target.date,'hr',[{stale:true}]);assert.equal(stale.forecast.eligible,false);assert.ok(stale.forecast.reasons.some(r=>r.includes('cached')));
});
test('Shipped model includes frozen splits, all markets, comparative tests and official source receipts',()=>{
  const a=mlbModelReport();assert.deepEqual(a.split,{leaguePriors:2022,training:2023,selectionAndDispersion:2024,untouchedTest:2025});assert.equal(Object.keys(a.models).length,16);
  for(const [market,m]of Object.entries(a.models)){assert.equal(m.coefficients.length,7);assert.ok(m.coefficients.every(Number.isFinite));assert.ok(a.report[market].holdout.n>1000);for(const line of BENCHMARKS[market])assert.ok(a.report[market].holdout.benchmarks[line].modelBrier>=0);}
  assert.ok(a.sources.length>200);assert.ok(a.sources.every(s=>new URL(s.url).hostname==='statsapi.mlb.com'&&s.sha256.length===64));
});
