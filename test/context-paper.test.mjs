import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { weatherFeatures,contextVector,adjustedPoint,fitContext } from '../lib/context-model.mjs';
import { observedWeather,selectWeather,WeatherStore } from '../lib/weather.mjs';
import { mlbOpponent,teamGameRows } from '../lib/mlb/context.mjs';
import { nflOpponent } from '../lib/nfl-context.mjs';
import { MlbAvailability } from '../lib/mlb/availability.mjs';
import { quotePrices,settlePaper,PaperStore } from '../lib/paper.mjs';
import { forecast } from '../lib/forecast.mjs';
import { attachMlbForecast } from '../lib/mlb/forecast.mjs';
import { SourceStore } from '../lib/source.mjs';
import { MlbStore } from '../lib/mlb/source.mjs';

test('indoor, missing weather and unknown retractable roofs cannot acquire outdoor effects',()=>{
  assert.deepEqual(weatherFeatures(observedWeather({roof:'closed',temperatureF:100,windMph:50})),[0,0]);
  assert.equal(observedWeather({roof:'Retractable',temperatureF:70,windMph:5}).status,'unavailable');
  assert.equal(observedWeather({roof:'Open',temperatureF:null,windMph:5}).status,'unavailable');
  assert.deepEqual(weatherFeatures(observedWeather({roof:'Open',temperatureF:85,windMph:10})),[1,1]);
  assert.deepEqual(contextVector({available:false,rate:100,leagueRate:1},null),[0,0,0]);
});
test('weather matches start time in UTC and rejects missing or distant forecast values',()=>{
  const start=Date.parse('2026-09-22T01:20Z'),p={hourly:{time:[start/1000-1200,start/1000+2400],temperature_2m:[75,74],wind_speed_10m:[8,7]}};
  assert.equal(selectWeather(p,new Date(start).toISOString()).temperatureF,75);
  assert.equal(selectWeather(p,new Date(start+86400000).toISOString()),null);
  p.hourly.temperature_2m[0]=null;assert.equal(selectWeather(p,new Date(start).toISOString()),null);
});
test('weather failures remain unavailable rather than plausible default forecasts',async()=>{
  const store=new WeatherStore({now:()=>Date.parse('2026-09-21T00:00Z'),fetcher:async()=>{throw Error('offline');}});
  const r=await store.forecast({kickoff:'2026-09-22T01:00Z',roof:'outdoors',latitude:30,longitude:-110});assert.equal(r.status,'unavailable');assert.equal(r.temperatureF,undefined);
});
test('MLB opponent data uses the correct side, excludes same-day and future outcomes, and shrinks short samples',()=>{
  const rows=Array.from({length:6},(_,i)=>({gameId:i,date:`2026-09-${10+i}`,role:'hitting',teamId:1,opponentId:2,stats:{plateAppearances:40,hits:10}}));
  const target={date:'2026-09-16',opponentId:2},baseline=mlbOpponent(teamGameRows(rows),target,'hits',.25);
  assert.equal(baseline.available,true);assert.equal(baseline.rate,.25);
  const poison={...rows[0],date:target.date,gameId:99,stats:{plateAppearances:40,hits:40}};
  assert.deepEqual(mlbOpponent(teamGameRows([...rows,poison]),target,'hits',.25),baseline);
  assert.equal(mlbOpponent(teamGameRows(rows),target,'hits_allowed',.25).available,false);
});
test('NFL opponent context excludes target-week results and nonmatching positions',()=>{
  const games=Array.from({length:5},(_,i)=>({game_id:String(i),season:2026,week:i+1,gameday:`2026-09-${10+i}`,home_team:'ARI',away_team:'SEA',players:new Map([['qb',{team:'SEA',position:'QB',passing_yards:200}],['wr',{team:'SEA',position:'WR',passing_yards:999}]])}));
  const target={date:'2026-09-20',season:2026,week:6,opponent:'ARI'};
  assert.equal(nflOpponent(games,target,'pass_yds','QB',200).rate,200);
  assert.deepEqual(nflOpponent([...games,{...games[0],game_id:'x',week:6}],target,'pass_yds','QB',200),nflOpponent(games,target,'pass_yds','QB',200));
});
test('context corrections are fitted, missing inputs are neutral and predictions stay valid',()=>{
  const rows=Array.from({length:100},(_,i)=>({base:10,x:[i%2,0,0],y:i%2?12:10})),model=fitContext(rows,.001);
  assert.ok(adjustedPoint(10,[1,0,0],model)>11.9);assert.equal(adjustedPoint(10,[0,0,0],model),10);
  assert.equal(adjustedPoint(.5,[100,0,0],{coefficients:[1,0,0]},1),1);
});
test('MLB injury joins reject other teams and ambiguity; historical games never receive current status',()=>{
  const a=new MlbAvailability(),p={player:'John Smith',team:'ARI',playerId:1},feed={checkedAt:'2026-09-21',entries:[{nameKey:'johnsmith',team:'ARI',status:'10-Day-IL'}]};
  assert.equal(a.forPlayer(feed,p,[p],true).unavailable,true);
  assert.equal(a.forPlayer(feed,{...p,team:'NYM'},[p],true).concern,false);
  assert.equal(a.forPlayer(feed,p,[p,{...p,playerId:2}],true).status,'unavailable');
  assert.equal(a.forPlayer(feed,p,[p],false).status,'historical_unavailable');
});
test('confirmed unavailability withholds forecasts in both sports, rather than pricing a DNP as an under',()=>{
  const availability={unavailable:true,status:'Out'};
  assert.equal(forecast({sample:[],target:{},market:'rec',availability}).point,null);
  const p={};attachMlbForecast(p,[],'2026-09-21','hits',[],{availability});assert.equal(p.forecast.probability,null);assert.equal(p.forecast.point,null);
});
test('American prices and one-unit returns handle both signs, pushes, DNP and missing results',()=>{
  const prices=quotePrices({over:150,under:-200}),r={side:'over',prop:{line:1.5,prices}};
  assert.equal(prices.over.decimal,2.5);assert.equal(prices.under.decimal,1.5);
  assert.equal(settlePaper(r,{status:'final',actual:2}).profit,1.5);
  assert.equal(settlePaper({...r,side:'under'},{status:'final',actual:1}).profit,.5);
  assert.equal(settlePaper(r,{status:'final',actual:0}).profit,-1);
  assert.equal(settlePaper({...r,prop:{...r.prop,line:2}},{status:'final',actual:2}).profit,0);
  assert.equal(settlePaper(r,{status:'did_not_play'}).stake,0);
  assert.equal(settlePaper(r,{status:'no_stats'}).profit,null);
  assert.equal(quotePrices({over:0,under:'bad'}).over,null);
});
test('paper capture keeps the first qualifying selection across later prices, versions, and fresh instances',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paper-test-'));let now=Date.parse('2026-09-21T18:00Z');
  try{
    const store=new PaperStore({dir,now:()=>now,cloud:false}),kickoff='2026-09-21T23:00Z',p={playerId:1,gameId:2,player:'Test',forecast:{version:'a',point:2,lean:'over',probability:{over:.7},reasons:[]},prop:{line:1.5,basis:'captured_pregame',fetchedAt:new Date(now).toISOString(),commenceTime:kickoff,prices:quotePrices({over:150})}};
    await store.capturePaper('mlb','2026-09-21','hits',[p],()=>kickoff);
    now+=3600000;p.prop.prices.over=quotePrices({over:-150}).over;p.prop.fetchedAt=new Date(now).toISOString();p.forecast.version='b';
    await store.capturePaper('mlb','2026-09-21','hits',[p],()=>kickoff);
    const report=await new PaperStore({dir,now:()=>now,cloud:false}).report('mlb','2026-09-21',()=>({status:'final',actual:2}));
    assert.equal(report.rows.length,1);assert.equal(report.rows[0].forecast.version,'a');assert.equal(report.summary.profitUnits,1.5);
    now=Date.parse(kickoff)+1;p.prop.fetchedAt=new Date(now).toISOString();assert.equal((await store.capturePaper('mlb','2026-09-21','hits',[p],()=>kickoff)).state,'waiting');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('NFL paper report resolves the requested week and reads saved records through the store',async()=>{
  const store=new SourceStore({paper:{report:async(sport,period)=>({sport,period})}});
  store.catalog=async()=>({current:{season:2026,week:2}});
  assert.deepEqual(await store.paperPerformance({season:2026,week:3}),{sport:'nfl',period:'2026-W03'});
});
test('a failed MLB box-score lookup cannot void a saved selection as nonparticipation',async()=>{
  const store=new MlbStore({now:()=>Date.parse('2026-09-22'),paper:{report:async(sport,period,resolve)=>resolve({gameId:1,playerId:2,market:'hits'})}});
  store.bundle=async()=>({candidates:[],games:[{gameId:1,abstractState:'Final',boxAvailable:false}]});
  assert.equal((await store.paperPerformance({date:'2026-09-21'})).status,'no_stats');
});
test('context coefficients cannot change projections inside the model-development seasons',()=>{
  const sample=Array.from({length:10},(_,i)=>({season:2024,week:i+1,date:`2024-09-${String(i+1).padStart(2,'0')}`,attempts:30,passing_tds:2}));
  const f=forecast({sample,target:{season:2024,week:11,date:'2024-11-01'},market:'pass_tds',position:'QB',artifact:{trainingSeason:2024,contextModels:{'pass_tds:QB':{enabled:true,coefficients:[10,0,0]}}},context:{opponent:{available:true,rate:2,leagueRate:1}}});
  assert.equal(f.point,2);assert.equal(f.probability,null);assert.ok(f.reasons.some(r=>r.includes('overlaps')));
});
