import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS,query } from '../lib/sports/config.mjs';
import { normalizeSummary } from '../lib/sports/normalize.mjs';
import { predict,injuryWorkloads,resultFor,modelEvidence } from '../lib/sports/model.mjs';
import { positionGroup,teamMinuteBudgets,absenceRate } from '../lib/sports/opportunities.mjs';
import { SportsStore } from '../lib/sports/source.mjs';
import { PublicSportsProps } from '../lib/sports/props.mjs';
import { validateBet } from '../public/bet-utils.js';

const stat=(points=16)=>({points,rebounds:5,assists:4,threePointFieldGoalsMade:2,threePointFieldGoalsAttempted:5,fieldGoalsMade:6,fieldGoalsAttempted:13,freeThrowsMade:2,freeThrowsAttempted:3,steals:1,blocks:1,turnovers:2});
const history=()=>Array.from({length:12},(_,i)=>({game:{id:String(400000000+i),date:new Date(Date.UTC(2026,8,i+1)).toISOString(),complete:true,state:'post',seasonType:2,home:{id:'1',name:'Washington Mystics'},away:{id:'2',name:'Connecticut Sun'}},players:Array.from({length:12},(_,n)=>({id:String(n),player:'Player '+n,teamId:n<6?'1':'2',opponentId:n<6?'2':'1',position:n%3?'F':'G',minutes:35,starter:n%6<5,home:n<6,stats:stat(14+i%4)})),teams:['1','2'].map(id=>({id,minutes:200,pace:80,stats:{...stat(),points:80}}))})).reverse();
const player={id:'0',player:'Player 0',teamId:'1',opponentId:'2',position:'G',home:true,starter:false,availability:{status:'No injury listing',stale:false}};
const target={id:'499999999',date:'2026-09-22T23:30:00Z',state:'pre',seasonType:2};
const input=()=>({sport:'wnba',market:'points',player:{...player},target:{...target},history:history(),weather:{status:'not_applicable',indoor:true}});

test('WNBA uses its own 40-minute configuration, markets, version and evaluation',()=>{
 const q=query({sport:'wnba',date:'2026-09-22'});assert.equal(q.path,'basketball/wnba');assert.equal(q.league,'wnba');assert.equal(SPORTS.wnba.duration,40);assert.equal(Object.keys(SPORTS.wnba.markets).length,15);
 assert.equal(predict(input()).version,'wnba-opportunities-v1.1');assert.equal(modelEvidence('wnba').season,2025);assert.equal(modelEvidence('nba'),null);
 assert.equal(positionGroup(player,'wnba'),'guard');assert.equal(positionGroup({...player,position:'C'},'wnba'),'center');
});
test('WNBA possessions are normalized to 40 minutes; explicit DNP is distinct from missing minutes',()=>{
 const data={header:{id:target.id,competitions:[{date:target.date,status:{type:{state:'post',completed:true}},competitors:[{homeAway:'home',team:{id:'1'}},{homeAway:'away',team:{id:'2'}}]}]},boxscore:{players:[{team:{id:'1'},statistics:[{keys:['minutes','points'],athletes:[...Array.from({length:5},(_,i)=>({athlete:{id:String(i)},stats:['40','10']})),{athlete:{id:'dnp'},didNotPlay:true,stats:[]},{athlete:{id:'unknown'},stats:[]}]}]}],teams:[{team:{id:'1'},statistics:[{name:'fieldGoalsAttempted',displayValue:'70'},{name:'freeThrowsAttempted',displayValue:'20'},{name:'offensiveRebounds',displayValue:'10'},{name:'totalTurnovers',displayValue:'12'}]}]}};
 const w=normalizeSummary(data,'wnba'),n=normalizeSummary(data,'nba');assert.equal(w.teams[0].minutes,200);assert.ok(Math.abs(w.teams[0].pace-80.8)<1e-9);assert.ok(Math.abs(n.teams[0].pace-w.teams[0].pace*1.2)<1e-9);assert.equal(w.players.find(p=>p.id==='dnp').minutes,0);assert.equal(w.players.find(p=>p.id==='unknown').minutes,null);
});
test('WNBA all prop models produce distributions and preserve combo-stat correlation',()=>{
 for(const market of Object.keys(SPORTS.wnba.markets)){const f=predict({...input(),market,prop:{line:SPORTS.wnba.markets[market].benchmark}});assert.equal(f.status,'available',market);assert.ok(f.point>0,market);assert.ok(Math.abs(f.probability.over+f.probability.under+f.probability.push-1)<1e-8);assert.ok(f.inputs.projectedMinutes<=40);assert.equal(f.lean,null);}
 const f=predict({...input(),market:'pra'});assert.equal(f.inputs.production,history().reduce((s,h)=>s+h.players[0].stats.points+9,0));
});
test('WNBA target/future results and actual target starter status cannot enter historical predictions',()=>{
 const x=input(),a=predict({...x,validation:true}),future=history()[0];future.game.date=x.target.date;future.players[0].stats.points=9999;
 const b=predict({...x,validation:true,history:[future,...x.history],player:{...x.player,starter:true,lineupConfirmed:true}});assert.equal(a.point,b.point);
});
test('WNBA own shot-validation gate does not inherit the enabled NBA points candidate',()=>{
 const f=predict(input()),shot=f.inputEffects.find(e=>e.label==='Shot opportunities and conversion');assert.equal(shot.status,'validation_disabled');assert.equal(shot.validation.enabled,false);assert.equal(shot.factor,1);
});
test('WNBA shared minute budget constrains an overallocated roster to 200, not NBA 240',()=>{
 const h=history(),roster=h[0].players.map(p=>({...p,availability:{status:'No injury listing'}})),budgets=teamMinuteBudgets(roster,h,'wnba');const b=budgets.get('0');assert.equal(b.budget,200);assert.equal(b.totalBefore,210);assert.equal(b.totalAfter,200);assert.ok(b.factor<1);
 const overtime=h.map(g=>({...g,teams:g.teams.map(t=>({...t,minutes:225}))}));assert.equal(teamMinuteBudgets(roster,overtime,'wnba').get('0').budget,225);
});
test('WNBA fresh teammate absence changes minutes, but a stale or questionable report does not',()=>{
 const h=history(),roster=[player,{...player,id:'3',player:'Teammate',availability:{status:'Out',unavailable:true,stale:false}}];
 const impact=injuryWorkloads(roster,h,'wnba').get('0');assert.ok(impact.delta>0&&impact.delta<=40/48*5+.0001);
 assert.equal(injuryWorkloads([player,{...roster[1],availability:{status:'Out',unavailable:true,stale:true}}],h,'wnba').size,0);
 assert.equal(predict({...input(),player:{...player,availability:{status:'Out',unavailable:true}}}).point,null);
});
test('WNBA with/without rates require explicit same-team DNP evidence across positions',()=>{
 const h=history();for(const g of h.slice(0,3)){g.players.find(p=>p.id==='1').minutes=0;g.players[0].stats.points=30;}
 const x={sport:'wnba',market:SPORTS.wnba.markets.points,player,history:h,candidates:[{...player,id:'1',position:'F',availability:{unavailable:true,stale:false}}],rate:.5};assert.ok(absenceRate(x).factor>1);
 for(const g of h.slice(0,3))g.players=g.players.filter(p=>p.id!=='1');assert.equal(absenceRate(x).status,'unavailable');
});
test('WNBA indoor model is neutral and zero statistics, pushes, DNP, and missing stats remain distinct',async()=>{
 const store=new SportsStore({provider:{},archive:{}}),w=await store.gameWeather(query({sport:'wnba'}),{id:'499999999',venue:{fullName:'Arena'}});assert.equal(w.status,'not_applicable');assert.equal(w.indoor,true);assert.match(w.note,/does not explicitly/);
 assert.equal(predict({...input(),weather:{...w,windMph:80,temperatureF:5}}).effects.weather.factor,1);
 assert.equal(resultFor({minutes:20,stats:{points:0}},{complete:true},SPORTS.wnba.markets.points).actual,0);assert.equal(resultFor({minutes:0,stats:{points:0}},{complete:true},SPORTS.wnba.markets.points).status,'did_not_play');assert.equal(resultFor({minutes:20,stats:{}},{complete:true},SPORTS.wnba.markets.points).status,'missing');
 assert.ok(predict({...input(),prop:{line:15}}).probability.push>0);
});

const event=(id='499999999',state='pre',seasonType=2)=>({id,date:state==='post'?'2026-09-20T23:30Z':target.date,season:{year:2026,type:seasonType},competitions:[{status:{type:{state,completed:state==='post'}},competitors:[{homeAway:'home',team:{id:'1',displayName:'Washington Mystics',abbreviation:'WSH'}},{homeAway:'away',team:{id:'2',displayName:'Connecticut Sun',abbreviation:'CONN'}}]}]});
const raw=(game,outId=null)=>({header:game,boxscore:{players:['1','2'].map(team=>({team:{id:team},statistics:[{keys:['minutes','points'],athletes:Array.from({length:6},(_,i)=>({athlete:{id:team+i,displayName:'Player '+team+i,position:{abbreviation:i%2?'F':'G'}},starter:i<5,stats:['30','15']}))}]})),teams:[]}});
test('WNBA board retains guards, confirms five starters, refreshes reported Out, and uses WNBA archives',async()=>{
 let out=false,clock=Date.parse('2026-09-22T16:00Z');const urls=[],records=[];
 const provider={read:async url=>{urls.push(url);let payload;if(url.includes('/scoreboard'))payload={events:[event()]};else if(url.includes('/summary'))payload=raw(event());else if(url.includes('/roster'))payload={athletes:[]};else if(url.includes('/injuries'))payload={injuries:[{injuries:out?[{athlete:{id:'10'},status:'Out',date:new Date(clock).toISOString()}]:[]}]};else payload={events:[]};return {payload,url,sha256:'fixture',fetchedAt:new Date(clock).toISOString(),checkedAt:new Date(clock).toISOString(),stale:false};}};
 const archive={environment:'test',written:new Map(),status:{},append:async(key,r)=>{records.push({key,...r});return r;}};
 const store=new SportsStore({provider,archive,now:()=>clock});store.history=async()=>history().map(g=>({...g,players:g.players.map(p=>({...p,id:p.teamId+(Number(p.id)%6)}))}));store.props={lines:async()=>({quotes:[],status:'unavailable'})};
 const a=await store.board({sport:'wnba',date:'2026-09-22'});assert.equal(a.players.length,12);assert.equal(a.players.find(p=>p.id==='10').lineupConfirmed,true);assert.ok(a.players.find(p=>p.id==='10').forecast.point>0);assert.equal(a.model.version,'wnba-opportunities-v1.1');assert.ok(records[0].key.includes('/wnba/wnba/'));assert.match(records[0].key,/wnba-opportunities-v1/);
 out=true;clock+=61000;const b=await store.board({sport:'wnba',date:'2026-09-22'},true);assert.equal(b.players.some(p=>p.id==='10'),false);assert.equal(b.unavailablePlayers[0].id,'10');assert.ok(urls.every(u=>u.includes('/basketball/wnba/')));
});
test('WNBA history requests both regular season and playoffs, never future/post-target games',async()=>{
 const urls=[],provider={read:async url=>{urls.push(url);return {url,payload:url.includes('/schedule')?{events:[event('400000111','post',3),event('400000112','pre',3)]}:raw(event('400000111','post',3)),stale:false};}};
 const store=new SportsStore({provider,archive:{}}),g={...target,season:2026,home:{id:'1'},away:{id:'2'}};const h=await store.history(query({sport:'wnba',date:'2026-09-22'}),g,false,[],[]);assert.equal(h.length,1);assert.equal(h[0].game.seasonType,3);assert.ok(urls.some(u=>u.includes('seasontype=3')));assert.ok(!urls.some(u=>u.includes('/summary?event=400000112')));
});
test('WNBA public totals match game, player, team and book; FanDuel is preferred',async()=>{
 const html='<table><tr class="event-card-header" data-content="wnba/123"><td data-role="localtime" data-value="2026-09-22T23:30:00Z"></td></tr><tr data-side="home"><td class="team-name">Mystics 26-16</td></tr><tr data-side="away"><td class="team-name">Sun 10-32</td></tr></table>';
 const payload={event:{sport:'wnba',home:{mascot:'Mystics',key:'WSH'},away:{mascot:'Sun',key:'CONN'}},markets:[{id:'wnba.123.0.1.pts',stat:'points',player:{first_name:'Player',last_name:'One',team:{key:'WSH'}},comparison:{fanduel:{value:17.5,available:true,over:-110,under:-115},draftkings:{value:16.5,available:true,over:-120,under:100}}}],books:{fanduel:{name:'FanDuel',states:['AZ']},draftkings:{name:'DraftKings',states:['AZ']}}};
 const provider={read:async(u,opts)=>({payload:opts.html?html:payload,fetchedAt:'2026-09-22T16:00Z',stale:false})},props=new PublicSportsProps(provider),g={...target,home:{id:'1',name:'Washington Mystics'},away:{id:'2',name:'Connecticut Sun'}},q=query({sport:'wnba',date:'2026-09-22'});
 const a=await props.lines(q,g,[{...player,player:'Player One'}]);assert.equal(a.quotes.length,1);assert.equal(a.quotes[0].bookKey,'fanduel');assert.equal(a.quotes[0].line,17.5);assert.equal(a.quotes[0].basis,'captured_pregame');assert.ok(a.quotes[0].prices.over.decimal>1);
 payload.event.sport='nba';assert.equal((await props.lines(q,g,[{...player,player:'Player One'}])).quotes.length,0);
});
test('WNBA three-pointer and PRA requests use verified public labels; unsupported lines stay absent',async()=>{
 const requested=[],provider={read:async(url,options)=>{requested.push(url);if(options.html)return {payload:'<table><tr class="event-card-header" data-content="wnba/123"><td data-role="localtime" data-value="2026-09-22T23:30:00Z"></td></tr><tr data-side="home"><td class="team-name">Mystics</td></tr><tr data-side="away"><td class="team-name">Sun</td></tr></table>'};return {payload:{event:{sport:'wnba',home:{mascot:'Mystics'},away:{mascot:'Sun'}},markets:[]}};}},props=new PublicSportsProps(provider),g={...target,home:{id:'1',name:'Washington Mystics'},away:{id:'2',name:'Connecticut Sun'}};
 for(const [market,label] of [['threes','3 pointers'],['pra','points, rebounds, & assists']]){await props.lines(query({sport:'wnba',date:'2026-09-22',market}),g,[]);assert.equal(new URL(requested.at(-1)).searchParams.get('market'),label);}
 const before=requested.length;const r=await props.lines(query({sport:'wnba',market:'fga'}),g,[]);assert.equal(r.status,'unavailable');assert.equal(requested.length,before);
});
test('WNBA is available in the personal bet tracker',()=>{
 assert.equal(validateBet({selection:'Player points over 15.5',sport:'WNBA',type:'single',status:'open',date:'2026-09-22',oddsFormat:'american',odds:-110,stake:10}).sport,'WNBA');
});
