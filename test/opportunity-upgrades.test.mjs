import test from 'node:test';
import assert from 'node:assert/strict';
import { positionGroup,roleMinutes,absenceRate,opportunityRate,opposingGoalie,teamMinuteBudgets } from '../lib/sports/opportunities.mjs';
import { mlbOpportunities,starterWorkload,slotAppearances,priorLogs } from '../lib/mlb/opportunities.mjs';
import { workloadDeltas,fitTeamWorkload,teamWorkload } from '../lib/nfl-workload.mjs';
import { normalizeSummary } from '../lib/sports/normalize.mjs';
import { projectLiveProp } from '../lib/live-nfl-model.mjs';
import { predict } from '../lib/sports/model.mjs';

const row=(i,absent=false)=>({game:{id:String(i),date:`2026-01-${String(i+1).padStart(2,'0')}T20:00:00Z`,complete:true},players:[{id:'a',teamId:'A',position:'G',gameId:String(i),minutes:30,starter:true,stats:{points:absent?30:15}},{id:'b',teamId:'A',position:'C',minutes:absent?0:30,stats:{points:15}}],teams:[]});
const player={id:'a',teamId:'A',opponentId:'B',position:'G',starter:true,lineupConfirmed:true};
test('NBA teammate absence can change rate across positions and in either direction',()=>{
 const history=Array.from({length:10},(_,i)=>row(i,i<3)),candidates=[{id:'b',teamId:'A',player:'Center',availability:{unavailable:true,stale:false}}];
 const x={sport:'nba',market:{fields:['points']},player,history,candidates,rate:.5},a=absenceRate(x);
 assert.ok(a.factor>1&&a.factor<=1.25);assert.equal(a.withoutGames,3);
 history.slice(0,3).forEach(h=>h.players[0].stats.points=3);assert.ok(absenceRate(x).factor<1);
 candidates[0].availability.stale=true;assert.equal(absenceRate(x).factor,1);
});
test('missing donor rows and donors on another team cannot establish an absence',()=>{
 const history=Array.from({length:10},(_,i)=>row(i,i<3));history.slice(0,3).forEach(h=>h.players.pop());
 const x={sport:'nba',market:{fields:['points']},player,history,candidates:[{id:'b',teamId:'A',availability:{unavailable:true}}],rate:.5};
 assert.equal(absenceRate(x).factor,1);history.slice(0,3).forEach(h=>h.players.push({id:'b',teamId:'B',minutes:0}));assert.equal(absenceRate(x).factor,1);
});
test('a baseline already matching absence performance is not boosted twice',()=>{
 const x={sport:'nba',market:{fields:['points']},player,history:Array.from({length:10},(_,i)=>row(i,i<3)),candidates:[{id:'b',teamId:'A',availability:{unavailable:true}}],rate:1};assert.equal(absenceRate(x).factor,1);
});
test('confirmed playing role uses explicit bench DNPs and cannot leak into retrospective validation',()=>{
 const history=Array.from({length:6},(_,i)=>row(i));history.forEach((h,i)=>{h.players[0].starter=false;h.players[0].minutes=i<3?0:12;});
 const x={sport:'nba',player:{...player,starter:false},history,baseMinutes:30};assert.equal(roleMinutes(x).minutes,6);assert.equal(roleMinutes({...x,validation:true}).minutes,30);assert.equal(roleMinutes({...x,player:{...player,lineupConfirmed:false}}).minutes,30);
});
test('soccer midfield groups are distinct from defenders and forwards',()=>{assert.equal(positionGroup({position:'DM'},'soccer'),'midfield');assert.equal(positionGroup({position:'CM'},'soccer'),'midfield');assert.equal(positionGroup({position:'CB'},'soccer'),'defense');});
test('shot model responds to attempts rather than treating missing attempts as zero',()=>{
 const rows=Array.from({length:10},(_,i)=>({minutes:30,stats:{threePointFieldGoalsAttempted:i<5?10:4,threePointFieldGoalsMade:2}}));
 const x={sport:'nba',market:'threes',rows,pool:rows,baseRate:2/30};assert.ok(opportunityRate(x).rate>x.baseRate);
 rows.forEach(r=>delete r.stats.threePointFieldGoalsAttempted);assert.equal(opportunityRate(x).rate,x.baseRate);assert.equal(opportunityRate(x).status,'unavailable');
});
test('NBA points decomposes into two-point, three-point and free-throw production',()=>{
 const rows=Array.from({length:10},()=>({minutes:30,stats:{fieldGoalsAttempted:15,fieldGoalsMade:6,threePointFieldGoalsAttempted:5,threePointFieldGoalsMade:2,freeThrowsAttempted:5,freeThrowsMade:4}}));
 const f=opportunityRate({sport:'nba',market:'points',rows,pool:rows,baseRate:18/30});assert.equal(f.parts.length,3);assert.ok(Math.abs(f.rate-.6)<1e-9);
});
test('goalie quality needs a uniquely confirmed goalie and compares with his own team',()=>{
 const history=Array.from({length:10},(_,i)=>({players:[{id:i<5?'keeper':'other',teamId:'B',position:'G',minutes:60,gameId:String(i),stats:{goalsAgainst:i<5?1:4,saves:i<5?29:26}}]}));
 const p={...player,position:'C'},x={sport:'nhl',market:'goals',player:p,history,candidates:[{id:'keeper',teamId:'B',position:'G',starter:true,lineupConfirmed:true}]};
 assert.ok(opposingGoalie(x).factor<1);x.candidates[0].lineupConfirmed=false;assert.equal(opposingGoalie(x).factor,1);
});
test('confirmed backup goalies get no pregame starter forecast',()=>{
 const f=predict({sport:'nhl',market:'saves',player:{...player,position:'G',starter:false},target:{date:'2026-02-01'},history:[]});assert.equal(f.point,null);assert.match(f.reasons[0],/another goalkeeper/);
});
test('explicit ESPN DNP is retained as zero minutes, unknown minutes stay unknown',()=>{
 const body={header:{competitions:[]},boxscore:{players:[{team:{id:'A'},statistics:[{keys:['minutes','points'],athletes:[{athlete:{id:'a'},didNotPlay:true,stats:[]},{athlete:{id:'b'},stats:[]}]}]}]}};
 const n=normalizeSummary(body,'nba');assert.equal(n.players[0].minutes,0);assert.equal(n.players[1].minutes,null);assert.equal(n.players[0].stats.points,null);
});
const mlbContext=()=>({pregame:true,fresh:true,teamRows:Array.from({length:10},(_,i)=>({gameId:i,date:`2026-05-${String(i+1).padStart(2,'0')}`,teamId:1,opponentId:2,stats:{plateAppearances:40,hits:10,strikeOuts:10}}))});
const mlbInput=()=>({player:{role:'hitting',teamId:1,opponentId:2,battingOrder:1,lineupStatus:'confirmed'},date:'2026-06-01',market:'hits',input:{values:{recentWorkload:4}},point:1,context:mlbContext()});
test('MLB lineup position changes expected appearances; unconfirmed and historical lineups do not',()=>{
 const x=mlbInput(),top=mlbOpportunities(x),last=mlbOpportunities({...x,player:{...x.player,battingOrder:9}});assert.ok(top.after>last.after);assert.equal(slotAppearances(40,1),5);assert.equal(slotAppearances(40,9),4);
 assert.equal(mlbOpportunities({...x,player:{...x.player,lineupStatus:'unconfirmed'}}).after,1);assert.equal(mlbOpportunities({...x,context:{...x.context,pregame:false}}).after,1);assert.equal(mlbOpportunities({...x,context:{...x.context,fresh:false}}).after,1);
});
const starts=()=>Array.from({length:8},(_,i)=>({date:`2026-05-${String(25-i).padStart(2,'0')}`,game:{gamePk:i},stat:{gamesStarted:1,battersFaced:i<3?20:30,numberOfPitches:i<3?70:100,hits:5,strikeOuts:8}}));
test('MLB workload uses observed pitch budget and rejects relief outings',()=>{
 const s=starterWorkload(starts());assert.equal(s.pitchBudget,70);assert.ok(s.expectedBF>=16&&s.expectedBF<=24);
 assert.equal(starterWorkload(starts().map(r=>({...r,stat:{...r.stat,gamesStarted:0}}))).available,false);
});
test('MLB actual starter exposure replaces the fixed half-game assumption',()=>{
 const x=mlbInput();x.context.starterHistory=starts();const f=mlbOpportunities(x);assert.ok(f.starterExposureFraction>0&&f.starterExposureFraction<1);assert.notEqual(f.starterExposureFraction,.5);
});
test('MLB future and uncompleted games cannot enter new player history',()=>{
 const splits=[{date:'2026-05-01',gameType:'R',game:{gamePk:1}},{date:'2026-06-01',gameType:'R',game:{gamePk:2}},{date:'2026-05-02',gameType:'R',game:{gamePk:3}}];
 assert.deepEqual(priorLogs({stats:[{type:{displayName:'gameLog'},group:{displayName:'pitching'},splits}]},new Set([1,2]),'2026-06-01','pitching').map(r=>r.game.gamePk),[1]);
});
test('NFL player volume uses matching team opportunities and is bounded',()=>{
 const sample=Array.from({length:3},()=>({targets:5,teamOpportunities:{targets:25}})),volume={targets:{available:true,enabled:false,point:40,validationCount:10,weight:0}};
 const x=workloadDeltas(sample,volume,'rec');assert.equal(x.effects[0].status,'applied');assert.ok(Math.abs(x.deltas.targets-1)<1e-9);assert.equal(x.effects[0].opponentAdjustment,'validation_disabled');assert.equal(workloadDeltas(sample.map(r=>({targets:r.targets})),volume,'rec').deltas.targets,0);
});
test('NFL matchup weights remain disabled without enough chronological validation',()=>{
 const games=Array.from({length:10},(_,i)=>({complete:true,game_type:'REG',game_id:String(i),gameday:`2026-01-${String(i+1).padStart(2,'0')}`,home_team:'A',away_team:'B',players:new Map([['a',{team:'A',attempts:30,carries:25,targets:28}],['b',{team:'B',attempts:30,carries:25,targets:28}]])}));
 const m=fitTeamWorkload(games);assert.equal(m.models.attempts.enabled,false);const x=teamWorkload(m,{date:'2026-01-06',team:'A',opponent:'B'});assert.ok(x.attempts.games.every(id=>Number(id)<5));
});
test('NFL Live automatically withholds reported-out/ejected players and stale injury reports',()=>{
 const x={game:{state:'in',period:2,remainingSeconds:1800,teams:[]},player:{teamId:'A',stats:{receiving_yards:25},availability:{unavailable:true,status:'Out'}},market:'rec_yds'};
 let p=projectLiveProp(x);assert.equal(p.projection,null);assert.ok(p.reasons.some(r=>/Reported Out/.test(r)));x.player.availability={stale:true};p=projectLiveProp(x);assert.ok(p.reasons.some(r=>/injury report is stale/.test(r)));
});
test('NBA roster minutes share one team budget without inventing unused minutes',()=>{
 const candidates=Array.from({length:10},(_,i)=>({id:String(i),teamId:'A',position:'G'}));
 const history=Array.from({length:10},()=>({teams:[{id:'A',minutes:240}],players:candidates.map(p=>({...p,minutes:30,starter:false}))}));
 const budgets=teamMinuteBudgets(candidates,history,'nba');assert.equal(budgets.get('1').factor,.8);assert.equal(budgets.get('1').totalAfter,240);
 candidates[0].availability={unavailable:true};assert.ok(budgets.get('1').factor<teamMinuteBudgets(candidates,history,'nba').get('1').factor);
 assert.equal(teamMinuteBudgets(candidates.slice(0,5),history,'nba').get('1').factor,1);
});
test('unsuccessful shot candidates remain visible but cannot change production rates',()=>{
 const history=Array.from({length:10},(_,i)=>{const h=row(i);h.players[0].stats={threePointFieldGoalsAttempted:10,threePointFieldGoalsMade:i<5?3:1};return h;});
 const f=predict({sport:'nba',market:'threes',player,target:{date:'2026-02-01T20:00Z',state:'pre'},history,validation:true});
 assert.equal(f.inputEffects.find(e=>e.label==='Shot opportunities and conversion').status,'validation_disabled');assert.equal(f.inputs.rate,f.inputs.originalRate);
});
