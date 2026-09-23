import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MLB_MARKETS, statValue, inningsToOuts, validateMlbQuery, mlbDay, shiftDate } from '../lib/mlb/markets.mjs';
import { sampleFor, buildMlbPlayer, mlbResult, explainAndGrade } from '../lib/mlb/model.mjs';
import { parseMlbEvents, matchMlbEvent, parseMlbQuotes, MlbProps } from '../lib/mlb/props.mjs';
import { MlbProvider } from '../lib/mlb/provider.mjs';
import { MlbStore, candidatesFor } from '../lib/mlb/source.mjs';

const batting={gamesPlayed:1,plateAppearances:5,atBats:4,hits:3,doubles:1,triples:0,homeRuns:1,runs:2,rbi:4,baseOnBalls:1,strikeOuts:0,stolenBases:1};
const candidate={id:'100:7',playerId:7,player:'Test Hitter',team:'TOR',opponent:'BAL',gameId:100,startTime:'2026-09-21T23:00:00Z',gameState:'Final',abstractState:'Final',boxAvailable:true,role:'hitting',lineupStatus:'confirmed',gameStats:batting};
const row=(gamePk,date,stat=batting,extra={})=>({game:{gamePk},date,gameType:'R',stat,opponent:{name:'Opponent'},...extra});
const person=(rows,group='hitting')=>({stats:[{group:{displayName:group},type:{displayName:'gameLog'},splits:rows}]});
const event={id:'mlb/888',home:'BAL',away:'TOR',startTime:'2026-09-21T23:00:00Z'};
const game={gameId:100,date:'2026-09-21',startTime:event.startTime,abstractState:'Preview',state:'Scheduled',home:{id:110,code:'BAL'},away:{id:141,code:'TOR'}};
const quoteMeta={fetchedAt:'2026-09-21T12:00:00Z',sha256:'receipt',stale:false};
const publicPayload=()=>({event:{sport:'mlb',home:{key:'BAL'},away:{key:'TOR'}},books:{fanduel:{name:'FanDuel',states:['AZ']},draftkings:{name:'DraftKings',states:['AZ']}},markets:[{id:'mlb.888.0.7.h',stat:'hits',player:{first_name:'Test',last_name:'Hitter',team:{key:'TOR'}},comparison:{fanduel:{value:1.5,available:true},draftkings:{value:0.5,available:true}}}]});
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mlb-lab-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('MLB definitions count total bases, singles and combined props correctly',()=>{
  assert.equal(statValue(batting,'tb'),7);assert.equal(statValue(batting,'singles'),1);assert.equal(statValue(batting,'hrr'),9);
  assert.equal(statValue({...batting,totalBases:7},'tb'),7);assert.equal(statValue({...batting,baseOnBalls:9},'tb'),7);
  assert.equal(statValue({homeRuns:0},'hr'),0);assert.equal(statValue({},'hr'),null);assert.equal(statValue({hits:3},'singles'),null);
  assert.equal(Object.keys(MLB_MARKETS).length,16);
});
test('innings are thirds, not decimal arithmetic',()=>{
  assert.equal(inningsToOuts('6.1'),19);assert.equal(inningsToOuts('5.2'),17);assert.equal(inningsToOuts('0.0'),0);
  assert.equal(inningsToOuts('6.3'),null);assert.equal(inningsToOuts(''),null);assert.equal(statValue({inningsPitched:'6.1'},'outs'),19);
  assert.equal(statValue({outs:0,inningsPitched:'0.0'},'outs'),0);
  assert.equal(statValue({outs:0,inningsPitched:'1.0'},'outs'),null);
});
test('MLB dates roll over in Eastern time and reject invalid dates/markets',()=>{
  assert.equal(mlbDay('2026-09-21T02:00:00Z'),'2026-09-20');assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');
  assert.equal(validateMlbQuery({},Date.parse('2026-09-21T05:00:00Z')).date,'2026-09-21');
  for(const q of [{date:'2026-02-30'},{market:'__proto__'},{date:'1999-12-31'},{date:'x'}])assert.throws(()=>validateMlbQuery(q),{status:400});
});
test('samples exclude same-day, incomplete, duplicate, spring and no-PA records',()=>{
  const rows=[row(1,'2026-09-20'),row(2,'2026-09-21'),row(3,'2026-09-19'),row(4,'2026-09-18',{...batting,plateAppearances:0}),row(5,'2026-09-17',batting,{gameType:'S'}),row(1,'2026-09-20')];
  assert.deepEqual(sampleFor(person(rows),'hitting','2026-09-21',new Set([1,2,4,5])).map(r=>r.game.gamePk),[1]);
});
test('samples include both prior doubleheader games, with 20 appearance / 8 start caps',()=>{
  const rows=Array.from({length:25},(_,i)=>row(i+1,'2026-09-20'));const done=new Set(rows.map(r=>r.game.gamePk));
  assert.equal(sampleFor(person(rows),'hitting','2026-09-21',done).length,20);
  const pitching=rows.map(r=>({...r,stat:{gamesStarted:r.game.gamePk===25?0:1,strikeOuts:5}}));
  const sample=sampleFor(person(pitching,'pitching'),'pitching','2026-09-21',done);assert.equal(sample.length,8);assert.ok(sample.every(r=>r.stat.gamesStarted===1));
});
test('weighted baseline uses only selected samples and a score is not a probability',()=>{
  const rows=Array.from({length:10},(_,i)=>row(i+1,`2026-09-${String(10+i).padStart(2,'0')}`,{...batting,homeRuns:i>=5?1:0}));
  const p=buildMlbPlayer(candidate,person(rows),new Set(rows.map(r=>r.game.gamePk)),'2026-09-21','hr');
  assert.equal(p.baseline,.5);assert.equal(p.recentMean,1);assert.equal(p.projected,.7);assert.equal(p.modelScore,100);assert.equal(p.logs.length,10);
  const empty=buildMlbPlayer(candidate,null,new Set(),'2026-09-21','hr');assert.equal(empty.modelScore,null);
});
test('final actuals distinguish zero, missing, nonparticipation and unsettled games',()=>{
  assert.equal(mlbResult({...candidate,gameStats:{...batting,hits:0}},'hits').actual,0);
  assert.equal(mlbResult({...candidate,boxAvailable:false},'hits').status,'no_stats');
  assert.equal(mlbResult({...candidate,gameStats:{}},'hits').status,'did_not_play');
  assert.equal(mlbResult({...candidate,gameStats:{...batting,plateAppearances:0}},'hits').status,'did_not_bat');
  assert.equal(mlbResult({...candidate,gameState:'Suspended'},'hits').status,'unsettled');
  assert.equal(mlbResult({...candidate,gameStats:{gamesPlayed:1,gamesStarted:0,strikeOuts:2}},'k').status,'did_not_start');
});
test('hit, miss and push require a valid pregame or archived total',()=>{
  for(const [line,status,over,under]of [[2.5,'over','hit','miss'],[3.5,'under','miss','hit'],[3,'push','push','push']]){
    const p=buildMlbPlayer(candidate,person([row(1,'2026-09-20')]),new Set([1]),'2026-09-21','hits');p.prop={line,basis:'captured_pregame',fetchedAt:quoteMeta.fetchedAt,bookmaker:'FanDuel'};explainAndGrade(p,'hits');assert.equal(p.result.status,status);assert.equal(p.result.over,over);assert.equal(p.result.under,under);
  }
  for(const prop of [null,{line:.5,basis:'in_play'},{line:.5,basis:'captured_pregame',fetchedAt:'2026-09-22T01:00:00Z'}]){const p=buildMlbPlayer(candidate,null,new Set(),'2026-09-21','hits');p.prop=prop;explainAndGrade(p,'hits');assert.equal(p.result.status,'no_line');assert.equal(p.result.actual,3);}
});
test('1+ benchmark does not become a fabricated sportsbook line or result',()=>{
  const p=buildMlbPlayer(candidate,person([row(1,'2026-09-20')]),new Set([1]),'2026-09-21','hr');explainAndGrade(p,'hr');assert.equal(p.sampleOver.reference,'1+ benchmark');assert.equal(p.prop,null);assert.equal(p.result.status,'no_line');
});
test('official lineups distinguish starters, bench players and starting pitchers',()=>{
  const box={teams:{away:{players:{a:{person:{id:7,fullName:'Starter'},position:{type:'Infielder',abbreviation:'1B'},status:{code:'A'},battingOrder:'100'},b:{person:{id:8,fullName:'Bench'},position:{type:'Outfielder',abbreviation:'RF'},status:{code:'A'},battingOrder:'101'},c:{person:{id:9,fullName:'Pitcher'},position:{type:'Pitcher'},status:{code:'A'}}}}}};
  const g={...game,away:{...game.away,pitcher:{id:9,fullName:'Pitcher'}}};assert.deepEqual(candidatesFor(g,box,'hitting').map(p=>[p.playerId,p.lineupStatus]),[[7,'confirmed'],[8,'bench']]);assert.equal(candidatesFor(g,box,'pitching')[0].playerId,9);
});
test('public event parser and matching separate doubleheaders',()=>{
  const html='<table><tr class="event-card-header" data-content="mlb/888"><td><span data-role="localtime" data-value="2026-09-21T23:00:00Z"></span></td></tr><tr data-side="away"><td class="team-name"><a href="/mlb/teams/blue-jays">TOR</a></td></tr><tr data-side="home"><td class="team-name"><a href="/mlb/teams/orioles">BAL</a></td></tr></table>';
  const events=parseMlbEvents(html);assert.equal(events.length,1);assert.equal(matchMlbEvent(game,events).id,'mlb/888');
  const second={...event,id:'mlb/999',startTime:'2026-09-21T18:00:00Z'};assert.equal(matchMlbEvent(game,[event,second]).id,event.id);
  assert.equal(matchMlbEvent({...game,startTime:'2026-09-21T20:30:00Z'},[event,second]),null);assert.equal(matchMlbEvent({...game,date:'2026-09-20'},[event]),null);
});
test('quotes prefer FanDuel, validate game/period/market and reject ambiguous names',()=>{
  const payload=publicPayload();assert.equal(parseMlbQuotes(payload,event,'hits',quoteMeta,game)[0].bookmaker,'FanDuel');
  payload.markets[0].comparison.fanduel.available=false;assert.equal(parseMlbQuotes(payload,event,'hits',quoteMeta,game)[0].bookmaker,'DraftKings');
  payload.markets[0].id='mlb.888.1.7.h';assert.equal(parseMlbQuotes(payload,event,'hits',quoteMeta,game).length,0);
  const wrong=publicPayload();wrong.event.sport='nfl';assert.throws(()=>parseMlbQuotes(wrong,event,'hits',quoteMeta,game));
  const dup=publicPayload();dup.markets.push({...dup.markets[0]});assert.equal(parseMlbQuotes(dup,event,'hits',quoteMeta,game).length,0);
  assert.equal(parseMlbQuotes(publicPayload(),event,'hr',quoteMeta,game).length,0);
});
test('line archive preserves the pregame capture through a postgame refresh',async t=>{
  const dir=await temp(t),props=new MlbProps({dir});const pre=parseMlbQuotes(publicPayload(),event,'hits',quoteMeta,game)[0];await props.preserve(100,'hits',[pre]);
  const post={...pre,line:2.5,basis:'published_archive',fetchedAt:'2026-09-22T06:00:00Z'};const [saved]=await props.preserve(100,'hits',[post]);assert.equal(saved.line,1.5);assert.equal(saved.basis,'captured_pregame');
});
test('MLB cache deduplicates downloads and retains a stale source receipt on outage',async t=>{
  const dir=await temp(t);let calls=0,now=Date.parse(quoteMeta.fetchedAt),fail=false;const provider=new MlbProvider({dir,now:()=>now,fetcher:async()=>{calls++;if(fail)throw Error('Offline');return new Response('{"dates":[]}');}});
  const url='https://statsapi.mlb.com/api/v1/schedule?date=2026-09-21';const [a,b]=await Promise.all([provider.read(url),provider.read(url)]);assert.equal(calls,1);assert.equal(a.sha256,b.sha256);
  now+=3600000;fail=true;const stale=await provider.read(url);assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,a.fetchedAt);assert.match(stale.error,/Offline/);
});
test('empty future schedules are a successful empty board and invalid requests do no I/O',async()=>{
  let calls=0;const provider={read:async url=>{calls++;return{url,payload:{dates:[]},fetchedAt:quoteMeta.fetchedAt,stale:false};}};const store=new MlbStore({provider,now:()=>Date.parse(quoteMeta.fetchedAt)});
  const b=await store.board({date:'2027-01-15'});assert.equal(b.empty,true);assert.equal(b.players.length,0);assert.equal(calls,1);
  await assert.rejects(store.board({date:'2026-02-30'}),{status:400});assert.equal(calls,1);
});
test('board trims chart payload without truncating evidence or historical rate',async t=>{
  const dir=await temp(t),rows=Array.from({length:20},(_,i)=>row(i+1,`2026-09-${String(i+1).padStart(2,'0')}`));
  const store=new MlbStore({provider:{dir,read:async url=>({url,payload:'',fetchedAt:quoteMeta.fetchedAt,stale:false})},now:()=>Date.parse(quoteMeta.fetchedAt)});
  const b={created:Date.parse(quoteMeta.fetchedAt),date:'2026-09-21',games:[game],candidates:[candidate],people:new Map([[7,person(rows)]]),completed:new Set(rows.map(r=>r.game.gamePk)),sources:[],warnings:[],sampleStart:'2026-06-12',sampleEnd:'2026-09-20'};store.bundles.set(b.date,b);
  const board=await store.board({date:b.date,market:'hits'});assert.equal(board.players[0].logs.length,20);assert.equal(board.players[0].sampleOver.total,20);assert.equal(board.players[0].logs[0].stats,undefined);
  const evidence=await store.evidence({date:b.date,market:'hits',player:candidate.id});assert.equal(evidence.player.logs.length,20);assert.equal(evidence.player.logs[0].stats.hits,3);assert.equal(evidence.player.sampleOver.total,20);
  assert.equal(evidence.player.trendGames.length,20);assert.equal(evidence.player.trendGames[0].stats.hits,3);
});
