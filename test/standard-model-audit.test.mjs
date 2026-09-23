import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildPlayers,buildRates,number,zoneFor } from '../lib/model.mjs';
import { ratingFromComponents,RATING_WEIGHTS } from '../lib/rating.mjs';
import { freshPregameQuote } from '../lib/pregame-quote.mjs';
import { forecast,priorSample } from '../lib/forecast.mjs';
import { contextVector } from '../lib/context-model.mjs';
import { statValue } from '../lib/mlb/markets.mjs';
import { sampleFor } from '../lib/mlb/model.mjs';
import { forecastInputs } from '../lib/mlb/forecast-core.mjs';
import { attachMlbForecast } from '../lib/mlb/forecast.mjs';
import { predict,historyBefore,value } from '../lib/sports/model.mjs';
import { SPORTS } from '../lib/sports/config.mjs';
import { projectLiveProp } from '../lib/live-nfl-model.mjs';
import { projectBasketball } from '../lib/live-sports-model.mjs';
import { metrics,pairedReport } from '../scripts/standard-metrics.mjs';

test('standard rating preserves published weights and explains the exact final score',()=>{
  const c={rz_role:70,volume:60,goal_line:20,target_share:50,td_rate:10,implied_total_score:60,matchup_score:40};
  const r=ratingFromComponents('any_td',c);
  assert.equal(r.score,(70*.35+60*.25+20*.15+50*.15+10*.1)*.6+(60*.55+40*.45)*.4);
  assert.ok(Math.abs(r.factors.reduce((s,f)=>s+f.points,0)-r.score)<1e-10);
  assert.ok(Math.abs(r.factors.reduce((s,f)=>s+f.weight,0)-1)<1e-10);
  assert.equal(RATING_WEIGHTS.any_td.role.rz_role,.35);
  for(const market of ['pass_yds','pass_tds','rush_yds','rec','rush_attempts','rec_yds','pass_attempts','pass_completions','pass_interceptions','rush_rec_yds'])assert.equal(ratingFromComponents(market,{volume:80,baseline:60,matchup:30}).score,64);
});
test('missing rating inputs are renormalized and cannot masquerade as recorded zero',()=>{
  const r=ratingFromComponents('rec',{volume:null,baseline:40,matchup:null});
  assert.equal(r.score,40);assert.deepEqual(r.missing,['volume','matchup']);
  assert.equal(ratingFromComponents('rec',{volume:0,baseline:40,matchup:null}).score,15);
  assert.equal(ratingFromComponents('rec',{matchup:100}).score,null);
});
const attempt=(extra={})=>({play_type:'pass',pass_attempt:1,passer_player_id:'q',receiver_player_id:'r',air_yards:5,yardline_100:15,complete_pass:1,pass_touchdown:1,passing_yards:15,...extra});
test('passing TD rates use all modeled attempts while receiving catch rates use targets',()=>{
  const r=buildRates([attempt(),attempt({receiver_player_id:'',complete_pass:0,pass_touchdown:0,passing_yards:0}),attempt({qb_spike:1}),attempt({sack:1})]);
  assert.equal(r.passing.red_zone.count,2);assert.equal(r.passing.red_zone.rate,.5);
  assert.equal(r.zones['pass:red_zone'].rate,1);assert.equal(r.receiving.short.catchRate,1);
  assert.equal(r.depths.short.catchRate,.5);
});
function nfl(rates=buildRates([])){
  const row={player_id:'p',team:'A',position:'RB',carries:10,rushing_yards:40,rushing_tds:0,targets:2,receptions:1,receiving_tds:0,offense_snaps:30,statsAvailable:true};
  const game={game_id:'prior',season:2025,week:1,gameday:'2025-09-01',game_type:'REG',home_team:'A',away_team:'B',complete:true,players:new Map([['p',row]]),plays:[{play_type:'run',rush_attempt:1,rusher_player_id:'p',yardline_100:3,rush_touchdown:0,rushing_yards:4}],chart:[]};
  const target={...game,game_id:'target',week:2,gameday:'2025-09-08',complete:false,players:new Map(),plays:[]};
  return {games:new Map([['prior',game],['target',target]]),rosters:[{gsis_id:'p',season:2025,week:2,team:'A',position:'RB',status:'ACT'}],season:2025,week:2,market:'any_td',rates,trainingSeason:2024};
}
test('missing applicable NFL rates leave estimates and debt blank while keeping the rating',()=>{
  const p=buildPlayers(nfl())[0];assert.ok(Number.isFinite(p.modelScore));
  for(const key of ['projected','tdProb','debt'])assert.equal(p[key],null,key);
  assert.equal(p.details.cheat_code.td_debt.expected,null);assert.equal(p.details.coverage.missingRateEstimate,true);
  const x=nfl(),r=buildRates(x.games.get('prior').plays),zero=buildPlayers({...x,rates:r})[0];
  assert.equal(zero.projected,0);assert.equal(zero.tdProb,0);assert.equal(zero.debt,0);
});
test('NFL sample enforces event date as well as season/week and rejects future rate training',()=>{
  const x=nfl(),future=structuredClone(x.games.get('prior'));future.game_id='late';future.gameday='2025-09-09';future.players.get('p').carries=999;x.games.set('late',future);
  const p=buildPlayers(x)[0];assert.deepEqual(p.details.sample.map(r=>r.gameId),['prior']);
  assert.throws(()=>buildPlayers({...x,trainingSeason:2025}),/before the prediction/);
  assert.equal(priorSample([{season:2025,week:1,date:null}],{season:2025,week:2,date:'2025-09-08'}).length,0);
});
test('NFL missing weekly fields do not become zero-valued score inputs or forecast history',()=>{
  const x=nfl();x.market='rush_yds';delete x.games.get('prior').players.get('p').rushing_yards;
  const p=buildPlayers(x)[0];assert.equal(p.details.components.baseline,null);assert.equal(p.details.stats.rush_ypg,null);assert.equal(p.details.sample[0].rushing_yards,null);
  assert.ok(p.details.coverage.missingWeeklyFields.includes('rushing_yards'));
  const f=forecast({sample:[{season:2025,week:1,date:'2025-09-01',carries:10}],target:{season:2025,week:2,date:'2025-09-08'},market:'rush_yds'});
  assert.equal(f.point,null);assert.ok(f.inputQuality.missingFields.includes('rushing_yards'));
});
test('invalid scalar inputs and impossible baseball counts stay unknown',()=>{
  for(const n of ['', ' ',true,[],Infinity])assert.equal(number(n),null);
  for(const n of [-1,101,Infinity])assert.equal(zoneFor(n),null);
  for(const n of [-1,.5,' ',true])assert.equal(statValue({hits:n},'hits'),null);
  assert.equal(statValue({hits:1,doubles:2,triples:0,homeRuns:0},'singles'),null);
  assert.equal(statValue({outs:19,inningsPitched:'6.2'},'outs'),null);
  assert.equal(statValue({outs:0,inningsPitched:'0.0'},'outs'),0);
  assert.equal(value({points:-1},SPORTS.nba.markets.points),null);
});
test('MLB rating requires known participation and fitted features reject invalid priors/exposure',()=>{
  const person={stats:[{group:{displayName:'hitting'},type:{displayName:'gameLog'},splits:[{date:'2025-09-01',game:{gamePk:1},gameType:'R',stat:{hits:1}}]}]};
  assert.deepEqual(sampleFor(person,'hitting','2025-09-02',new Set([1])),[]);
  assert.equal(forecastInputs([],{date:'2025-09-02'},'hits',{rate:0,workload:4}).available,false);
});
const now=Date.parse('2026-09-22T17:00Z'),start='2026-09-22T19:00Z';
const quote={line:1.5,basis:'captured_pregame',fetchedAt:'2026-09-22T16:59Z',commenceTime:start};
test('pregame quotes require finite matching timestamps, fresh retrieval and a numeric line',()=>{
  assert.equal(freshPregameQuote(quote,now,start),true);
  for(const change of [{fetchedAt:null},{fetchedAt:'invalid'},{commenceTime:'invalid'},{fetchedAt:'2026-09-22T18:00Z'},{fetchedAt:'2026-09-22T14:00Z'},{basis:'published_archive'},{stale:true},{line:null}])assert.equal(freshPregameQuote({...quote,...change},now,start),false);
  assert.equal(freshPregameQuote(quote,now,'2026-09-22T20:00Z'),false);
});
test('NFL invalid quote cannot produce a lean even with a strong forecast distribution',()=>{
  const sample=Array.from({length:5},(_,i)=>({date:`2026-09-0${i+1}`,season:2026,week:i+1,carries:10,rushing_yards:50,team:'A'}));
  const input={sample,target:{season:2026,week:6,date:'2026-09-22',team:'A'},market:'rush_yds',position:'RB',artifact:{trainingSeason:2024,pools:{candidate:{'rush_yds:RB':Array.from({length:100},()=>[50,50])}}},availability:{status:'No injury listing'},prop:{...quote,line:20.5},now};
  assert.equal(forecast(input).lean,'over');
  const bad=forecast({...input,prop:{...input.prop,fetchedAt:'invalid'}});assert.equal(bad.lean,null);assert.ok(bad.reasons.includes('No fresh upcoming pregame line'));
});
test('missing or stale context cannot inject NaN, cold weather or infinite opponent effects',()=>{
  assert.deepEqual(contextVector({available:true,rate:2,leagueRate:0},{status:'available',temperatureF:null,windMph:null}),[0,0,0]);
  assert.deepEqual(contextVector({available:true,rate:2,leagueRate:1,stale:true},{status:'available',temperatureF:20,windMph:40,stale:true}),[0,0,0]);
});
function sportInput(sport='nba'){
  const history=Array.from({length:8},(_,i)=>({game:{id:String(i),date:`2026-09-${String(i+1).padStart(2,'0')}T18:00:00Z`,complete:true},players:[{id:'p',teamId:'A',opponentId:'B',position:'G',minutes:30,starter:true,home:true,stats:{points:20+i%3,goals:1,totalShots:3,totalGoals:1,shotsTotal:3,powerPlayTimeOnIce:1}}],teams:[{id:'A',minutes:240,stats:{points:100,totalShots:10,goals:3,totalGoals:1}},{id:'B',minutes:240,stats:{points:110,totalShots:12,goals:2,totalGoals:2}}]}));
  return {sport,market:sport==='soccer'?'shots':sport==='nhl'?'goals':'points',history,target:{date:start,state:'pre'},player:{id:'p',teamId:'A',opponentId:'B',position:sport==='nba'||sport==='wnba'?'G':'C',starter:true,lineupConfirmed:true,availability:{status:'No injury listing'}}};
}
test('NBA/WNBA/NHL/soccer historical evaluation ignores all current inputs',()=>{
  for(const sport of ['nba','wnba','nhl','soccer']){
    const x={...sportInput(sport),validation:true},a=predict(x);
    const b=predict({...x,injury:{delta:10},minuteBudget:{factor:.5},weather:{status:'available',temperatureF:100,windMph:35},player:{...x.player,availability:{unavailable:true}}});
    assert.equal(b.point,a.point,sport);assert.equal(b.effects.weather.factor,1);assert.equal(b.inputs.projectedMinutes,a.inputs.projectedMinutes);
  }
});
test('stale sports inputs cannot change workload via role, injury or roster minute budget',()=>{
  const x={...sportInput(),stale:true},a=predict(x),b=predict({...x,injury:{delta:5},minuteBudget:{factor:.5}});
  assert.equal(b.point,a.point);assert.ok(b.inputEffects.some(e=>e.status==='withheld'));
});
test('sports contribution changes add back to the reported point estimate',()=>{
  for(const sport of ['nba','wnba','nhl','soccer']){
    const p=predict(sportInput(sport));
    assert.ok(Math.abs(p.basePoint+p.contributions.reduce((s,c)=>s+c.change,0)-p.point)<.0002,sport);
  }
});
test('sports history compares actual timestamps including timezone offsets',()=>{
  const x=sportInput();const future={...x.history[0],game:{complete:true,date:'2026-09-22T14:00:00-07:00'}};
  assert.equal(historyBefore([future],x.target).length,0);
});
test('MLB forecast discloses invalid pregame quotes and withholds stale pitcher effects',()=>{
  const history=Array.from({length:20},(_,i)=>({gameId:i,date:`2026-09-${String(i+1).padStart(2,'0')}`,role:'hitting',stats:{plateAppearances:4,homeRuns:i%4===0?1:0}}));
  const p={role:'hitting',home:true,lineupStatus:'confirmed',abstractState:'Preview',gameType:'R',startTime:start,prop:{...quote,line:.5,fetchedAt:null}};
  attachMlbForecast(p,history,'2026-09-22','hr',[{stale:true}],{now,matchup:{pitcherId:1,pitcherHand:'L',hand:[],versus:[]}});
  assert.equal(p.forecast.lean,null);assert.ok(p.forecast.reasons.includes('No fresh upcoming pregame line.'));assert.equal(p.forecast.matchup.applied,false);
});
test('standard calculation import graph has no simulation dependency',async()=>{
  const seen=new Set();
  async function visit(url){if(seen.has(url.href))return;seen.add(url.href);assert.doesNotMatch(url.pathname,/live-game-model|simulation/);const code=await fs.readFile(url,'utf8');assert.doesNotMatch(code,/Math\.random\s*\(/);for(const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+\.mjs)['"]/g))if(match[1].startsWith('.'))await visit(new URL(match[1],url));}
  for(const entry of ['model.mjs','forecast.mjs','mlb/model.mjs','mlb/forecast.mjs','sports/model.mjs','live-nfl-model.mjs','live-sports-model.mjs'])await visit(new URL('../lib/'+entry,import.meta.url));
  assert.ok(seen.size>=10);
});
test('simulation loader uses neutral source helpers without loading standard forecasts',async()=>{
  const seen=new Set(),blocked=new Set(['model.mjs','rating.mjs','forecast.mjs','predictions.mjs','mlb/model.mjs','mlb/forecast.mjs','sports/model.mjs','live-nfl-model.mjs','live-sports-model.mjs']);
  const root=new URL('../lib/',import.meta.url);
  async function visit(url){if(seen.has(url.href))return;seen.add(url.href);assert.ok(!blocked.has(url.href.slice(root.href.length)),url.href);const code=await fs.readFile(url,'utf8');for(const m of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+\.mjs)['"]/g))if(m[1].startsWith('.'))await visit(new URL(m[1],url));}
  await visit(new URL('simulation-source.mjs',root));
});
test('direct live estimates withhold malformed priors and impossible clock/workload values',()=>{
  const game={state:'in',period:2,remainingSeconds:2000,teams:[{id:'A',score:7},{id:'B',score:0}]},player={teamId:'A',stats:{carries:2,rushing_yards:8}};
  const p=projectLiveProp({game,player,team:{plays:30,attempts:20,carries:8,sacks:2},prior:{count:5},market:'rush_yds'});
  assert.equal(p.projection,null);assert.ok(p.reasons.some(r=>r.includes('Historical workload')));
  const b=projectBasketball({sport:'nba',game:{...game,remainingSeconds:1200},player:{...player,minutes:20,stats:{points:10}},prior:{appearances:Array.from({length:5},()=>({minutes:30,stats:{points:20}}))},workload:{minutes:-5},market:'points'});
  assert.equal(b.projection,null);assert.match(b.reasons[0],/minutes are invalid/);
});
test('evaluation computes proper probabilities and errors on the same paired sample',()=>{
  const rows=[{gameId:'1',date:'2025-01-01',actual:1,event:true,before:{point:1,probability:.8},after:{point:1,probability:.8},baseline:{point:0,probability:.5}},{gameId:'2',date:'2025-01-02',actual:0,event:false,before:{point:0,probability:.2},after:{point:0,probability:.2},baseline:{point:0,probability:.5}}];
  const m=metrics(rows,'after');assert.equal(m.brier,.04);assert.equal(m.logLoss,Math.round(-Math.log(.8)*1e6)/1e6);assert.equal(m.mae,0);assert.equal(m.calibration[8].observed,1);
  const p=pairedReport([...rows,{gameId:'3',actual:10,before:{point:10},after:{point:null}}]);assert.equal(p.n,2);assert.equal(p.unpaired,1);assert.equal(p.before.n,p.after.n);assert.deepEqual(p.uncertainty.interval95,[0,0]);
});
