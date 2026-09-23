import test from 'node:test';
import assert from 'node:assert/strict';
import {teammateOpportunities,relevantOpportunity,applyOpportunityRating} from '../lib/nfl-opportunities.mjs';
import {forecast,project} from '../lib/forecast.mjs';
import {SourceStore} from '../lib/source.mjs';
import {buildRates} from '../lib/model.mjs';
import {AvailabilityStore} from '../lib/availability.mjs';
const ready={status:'No injury listing',concern:false,stale:false};
const out={status:'Out',unavailable:true,concern:true,stale:false,reportedAt:'2026-11-01T12:00Z',sourceUrl:'https://www.espn.com/nfl/'};
function fixture(){
 const target={season:2026,week:9,date:'2026-11-01',team:'A'};
 const people=[['donor','Missing WR','WR'],['receiver','Receiver','WR'],['backup','Second Receiver','WR'],['runner','Runner','RB'],['qb','Quarterback','QB'],['reserveqb','Reserve QB','QB']].map(([gsis_id,full_name,position])=>({gsis_id,full_name,position,team:'A',status:'ACT',pfr_id:gsis_id,espn_id:gsis_id,season:2026,week:9}));
 const rosters=new Map(people.map(p=>[p.gsis_id,p])),availability=new Map(people.map(p=>[p.gsis_id,p.gsis_id==='donor'?out:ready]));
 const games=[],weeklyRosters=[],snaps=[];
 for(let week=1;week<=8;week++){
  const absent=week<=2,game_id=`2026_${String(week).padStart(2,'0')}_A_B`,gameday=`2026-10-${String(week+1).padStart(2,'0')}`;
  const values={donor:[8,0],receiver:[absent?9:4,0],backup:[absent?3:2,0],runner:[2,16],qb:[0,1],reserveqb:[0,0]};
  const players=new Map();
  for(const p of people){
   weeklyRosters.push({...p,week});const [targets,carries]=values[p.gsis_id],offense=p.gsis_id==='reserveqb'||p.gsis_id==='donor'&&absent?0:40;
   snaps.push({game_id,pfr_player_id:p.gsis_id,team:'A',offense_snaps:offense});
   if(!offense)continue;
   players.set(p.gsis_id,{player_id:p.gsis_id,player_display_name:p.full_name,position:p.position,team:'A',season:2026,week,statsAvailable:true,offense_snaps:offense,snap_pct:.7,targets,receptions:Math.ceil(targets*.5),receiving_yards:targets*8,receiving_tds:targets>0&&week%3===0?1:0,carries,rushing_yards:carries*4,rushing_tds:carries>0&&week%4===0?1:0,attempts:p.position==='QB'?30:0,completions:p.position==='QB'?20:0,passing_yards:p.position==='QB'?240:0,passing_tds:1,passing_interceptions:0,special_teams_tds:0});
  }
  games.push({game_id,gameday,season:2026,week,home_team:'A',away_team:'B',game_type:'REG',complete:true,players,plays:[],chart:[]});
 }
 return {target,rosters,availability,games,weeklyRosters,snaps};
}

test('confirmed receiver absence allocates targets by demonstrated roles, with historical cohort evidence',()=>{
 const f=fixture(),result=teammateOpportunities(f),r=result.get('receiver');
 assert.ok(r.adjustments.targets>result.get('backup').adjustments.targets);assert.equal(r.adjustments.carries,0);assert.equal(r.channels[0].withCount,6);assert.equal(r.channels[0].withoutCount,2);assert.equal(r.channels[0].method,'Historical absence + recent role');
 assert.equal(result.get('donor').applied,false);assert.equal(result.get('qb').applied,false);assert.equal(result.get('reserveqb').applied,false);
 assert.equal(relevantOpportunity(r,'pass_yds','WR'),null);assert.equal(relevantOpportunity(r,'rush_attempts','WR').applied,false);
 assert.ok(relevantOpportunity(r,'rec','WR').applied);
});

test('shared multi-absence budget never duplicates vacated opportunities and enforces player caps',()=>{
 const f=fixture();f.availability.set('backup',out);const result=teammateOpportunities(f),receivers=[...result.values()].filter(x=>x.applied),allocated=receivers.reduce((s,x)=>s+x.adjustments.targets,0);
 assert.ok(allocated<=10);assert.equal(result.get('backup').applied,false);assert.equal(result.get('receiver').donors.length,2);
 for(const x of receivers)for(const c of x.channels){assert.ok(c.delta<=c.recentWorkload*.5+.0001);assert.ok(c.delta<=(c.field==='targets'?4:8));assert.ok(c.allocated<=c.vacated);}
});

test('an absence already present in every recent team game receives no extra boost',()=>{
 const f=fixture();for(const g of f.games.slice(-3))g.players.delete('donor');
 const result=teammateOpportunities(f);assert.ok([...result.values()].every(x=>!x.applied));
});

test('uncertain, stale and historical statuses cannot generate workload transfers',()=>{
 for(const availability of [{status:'Questionable',concern:true}, {...out,stale:true},{status:'historical_unavailable',concern:false}]){const f=fixture();f.availability.set('donor',availability);assert.ok([...teammateOpportunities(f).values()].every(x=>!x.applied));}
 const f=fixture();assert.ok([...teammateOpportunities({...f,stale:true}).values()].every(x=>!x.applied));
 f.availability.set('receiver',{status:'Questionable',concern:true});assert.equal(teammateOpportunities(f).get('receiver').applied,false);
});

test('a starting quarterback absence withholds the scenario; an inactive reserve quarterback does not',()=>{
 const f=fixture();f.availability.set('reserveqb',out);assert.ok(teammateOpportunities(f).get('receiver').applied);
 f.availability.set('qb',out);assert.equal(teammateOpportunities(f).get('receiver').status,'withheld');
 assert.equal(teammateOpportunities({...f,target:{...f.target,quarterbackId:'qb'}}).get('receiver').status,'withheld');
});

test('missing roster or snap reports are not counted as historical nonparticipation',()=>{
 const f=fixture();const r=teammateOpportunities({...f,weeklyRosters:[],snaps:[]}).get('receiver');assert.equal(r.channels[0].withoutCount,0);assert.equal(r.channels[0].method,'Recent role estimate');
 f.weeklyRosters=f.weeklyRosters.map(r=>r.gsis_id==='donor'&&r.week<=2?{...r,status:'RES'}:r);assert.equal(teammateOpportunities({...f,snaps:[]}).get('receiver').channels[0].withoutCount,2);
});

test('future, same-week, unfinished and other-team records never increase evidence or workload',()=>{
 const f=fixture(),base=teammateOpportunities(f).get('receiver');
 const extra=structuredClone(f.games[0]);extra.players.get('receiver').targets=999;
 for(const change of [{gameday:'2026-11-02',week:10},{week:9},{complete:false}]){const result=teammateOpportunities({...f,games:[...f.games,{...extra,...change}]}).get('receiver');assert.deepEqual(result,base);}
 for(const g of f.games)g.players.get('receiver').team='B';assert.equal(teammateOpportunities(f).get('receiver').applied,false);
});

test('running-back absence shifts RB carries without assigning carries to WRs or quarterback scrambles',()=>{
 const f=fixture();f.rosters.get('backup').position='RB';for(const g of f.games){const p=g.players.get('backup');p.position='RB';p.carries=4;p.rushing_yards=16;}
 f.availability.set('donor',ready);f.availability.set('runner',out);const result=teammateOpportunities(f);
 assert.ok(result.get('backup').adjustments.carries>0);assert.equal(result.get('receiver').adjustments.carries,0);assert.equal(result.get('qb').adjustments.carries,0);
});

function forecastFixture(){const f=fixture(),sample=f.games.map(g=>({...g.players.get('receiver'),gameId:g.game_id,date:g.gameday}));return {f,input:{sample,target:f.target,market:'rec',position:'WR',availability:ready,teammateImpact:relevantOpportunity(teammateOpportunities(f).get('receiver'),'rec','WR'),artifact:{id:'fixture',trainingSeason:2023,pools:{candidate:{'rec:WR':Array.from({length:200},()=>[4,4])}}},prop:{line:2.5,basis:'captured_pregame',fetchedAt:'2026-11-01T14:00:00Z',commenceTime:'2026-11-01T18:00:00Z'},now:Date.parse('2026-11-01T15:00:00Z')}};}

test('injury workload changes actual forecast and same-weight rating, preserving all historical statistics',()=>{
 const {input}=forecastFixture(),saved=structuredClone(input.sample),plain=forecast({...input,teammateImpact:null}),adjusted=forecast(input);
 assert.ok(adjusted.point>plain.point);assert.equal(adjusted.teammateImpact.beforePoint,plain.point);assert.equal(adjusted.lean,null);assert.ok(adjusted.reasons.some(r=>r.includes('not separately calibrated')));assert.deepEqual(input.sample,saved);
 const p={modelScore:42,baselineScore:42.5,opportunityScore:40,dueBonus:0,tdProb:null,projected:2,reason:'Recorded history.',details:{components:{volume:50,baseline:30,matchup:40},stats:{targets_pg:6,rec_pg:2}},forecast:adjusted};const stats=structuredClone(p.details.stats);
 applyOpportunityRating(p,'rec');assert.ok(p.modelScore>42);assert.equal(p.baseRating.score,42);assert.deepEqual(p.details.stats,stats);assert.equal(p.details.components.matchup,40);
 assert.ok(Math.abs(p.modelScore-(p.details.components.volume*.5+p.details.components.baseline*.3+40*.2))<.0001);
});

test('stale or injured recipients never apply an injected opportunity scenario',()=>{
 const {input}=forecastFixture();for(const changes of [{stale:true},{availability:{status:'Questionable',concern:true}},{availability:{...ready,stale:true}},{availability:{status:'historical_unavailable'}},{availability:{status:'unavailable'}},{availability:null}]){const a=forecast({...input,...changes}),b=forecast({...input,...changes,teammateImpact:null});assert.equal(a.point,b.point);assert.equal(a.teammateImpact.applied,false);}
 assert.equal(forecast({...input,availability:out}).point,null);
});

test('a receiver absence raises only the receiving component of combined yards and TD opportunity',()=>{
 const {input}=forecastFixture(),delta=input.teammateImpact.adjustments;
 for(const market of ['rec','rec_yds','rush_rec_yds','any_td'])assert.ok(project(input.sample,market,'candidate',delta).point>project(input.sample,market).point);
 for(const market of ['rush_yds','rush_attempts','pass_yds','pass_attempts'])assert.equal(project(input.sample,market,'candidate',delta).point,project(input.sample,market).point);
});

test('board integration changes teammate rating on Out and restores it when the report clears',async()=>{
 const f=fixture(),now=Date.parse('2026-11-01T15:00Z');let status='Active';
 const availability=new AvailabilityStore({now:()=>now,fetcher:async()=>new Response(JSON.stringify({injuries:[{injuries:[{status,date:'2026-11-01T14:00Z',athlete:{id:'donor'}}]}]}))});
 const game={game_id:'2026_09_B_A',home_team:'A',away_team:'B',season:2026,week:9,gameday:'2026-11-01',gametime:'13:00',game_type:'REG',complete:false,players:new Map(),plays:[],chart:[]};
 const bundle={games:new Map([...f.games,game].map(g=>[g.game_id,g])),rosters:[...f.rosters.values()],weeklyRosters:f.weeklyRosters,snaps:f.snaps,rates:buildRates([]),ngs:{},datasets:[],loadedAt:now};
 const store=new SourceStore({now:()=>now,availability,props:{enrich:async()=>({})},weather:{nfl:async()=>({status:'unavailable'})},predictions:{capture:async()=>({state:'waiting'})},paper:{capturePaper:async()=>({state:'waiting'})}});
 store.catalog=async()=>({current:{season:2026,week:9},weeks:[{season:2026,week:9}],schedule:{rows:[game],meta:{fetchedAt:new Date(now).toISOString()}}});store.bundle=async()=>bundle;store.trackLines=async()=>[];
 const input={season:2026,week:9,market:'rec'};const initial=await store.board(input,true),before=initial.players.find(p=>p.playerId==='receiver');status='Out';
 const updated=await store.board(input,true),after=updated.players.find(p=>p.playerId==='receiver');assert.ok(after.modelScore>before.modelScore);assert.ok(after.forecast.point>before.forecast.point);assert.equal(after.baseRating.score,before.modelScore);assert.ok(!updated.players.some(p=>p.playerId==='donor'));assert.deepEqual(after.details.stats,before.details.stats);
 status='Active';const cleared=(await store.board(input,true)).players.find(p=>p.playerId==='receiver');assert.equal(cleared.modelScore,before.modelScore);assert.equal(cleared.forecast.point,before.forecast.point);
});
