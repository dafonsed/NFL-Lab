import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeg,ticketSettlement,validateLeg,refreshTicket,gameKey } from '../public/bet-legs.js';
import { validateBet,betReturns,readBets,BET_STORAGE_KEY,betsCsv } from '../public/bet-utils.js';
import { trackerQuery,trackerMarkets,espnTrackerGame,nflPlayers,mlbTrackerGame,BetTrackerStore } from '../lib/bet-tracker.mjs';
const leg=(extra={})=>({id:'leg-1',mode:'auto',sport:'WNBA',league:'wnba',date:'2026-09-22',gameId:'401000001',market:'points',marketLabel:'Points',subjectId:'22',subject:'Player',matchup:'Away @ Home',label:'Player points over 10.5',side:'over',line:10.5,override:null,...extra});
const snapshot=(extra={})=>({sport:'wnba',league:'wnba',source:{url:'https://site.api.espn.com/result',checkedAt:'2026-09-22T10:00Z',stale:false},game:{id:'401000001',state:'post',complete:true,status:'Final',home:{id:'1',score:80},away:{id:'2',score:75}},markets:trackerMarkets('wnba'),players:[{id:'22',participation:'played',values:{points:12}}],...extra});
const ticket=(extra={})=>({selection:'My parlay',sport:'WNBA',type:'single',date:'2026-09-22',book:'FanDuel',stake:25,odds:150,oddsFormat:'american',status:'open',settlement:'auto',legs:[leg()],...extra});
const state=s=>leg({override:s});

test('final outcomes use the entered line: over, under, integer push and true zero',()=>{
 assert.equal(evaluateLeg(leg(),snapshot()).state,'won');
 assert.equal(evaluateLeg(leg({side:'under'}),snapshot()).state,'lost');
 assert.equal(evaluateLeg(leg({line:12}),snapshot()).state,'push');
 const zero=snapshot({players:[{id:'22',participation:'played',values:{points:0}}]});
 assert.equal(evaluateLeg(leg({side:'under',line:.5}),zero).state,'won');
 assert.equal(evaluateLeg(leg({line:.5}),zero).state,'lost');
});
test('live overs stay unsettled and missing / DNP / stale sources never become misses',()=>{
 const live=snapshot();live.game.complete=false;live.game.state='in';
 assert.equal(evaluateLeg(leg(),live).state,'live');assert.equal(evaluateLeg(leg(),live).actual,12);
 for(const players of [[],[{id:'22',participation:'dnp',values:{points:0}}],[{id:'22',participation:'played',values:{}}]])assert.equal(evaluateLeg(leg(),snapshot({players})).state,'review');
 const stale=snapshot();stale.source.stale=true;assert.equal(evaluateLeg(leg(),stale).state,'unavailable');
 const postponed=snapshot();postponed.game.status='Postponed';assert.equal(evaluateLeg(leg(),postponed).state,'review');
 assert.equal(evaluateLeg(leg({gameId:'401000002'}),snapshot()).state,'unavailable');
});
test('moneyline, spread and total use the correct selected side and score',()=>{
 assert.equal(evaluateLeg(leg({market:'moneyline',side:'home'}),snapshot()).state,'won');
 assert.equal(evaluateLeg(leg({market:'moneyline',side:'away'}),snapshot()).state,'lost');
 assert.equal(evaluateLeg(leg({market:'spread',side:'home',line:-5}),snapshot()).state,'push');
 assert.equal(evaluateLeg(leg({market:'spread',side:'away',line:5.5}),snapshot()).state,'won');
 assert.equal(evaluateLeg(leg({market:'total',side:'under',line:155.5}),snapshot()).state,'won');
});
test('soccer draw and extra time, and tied two-way moneylines are explicit',()=>{
 const s=snapshot({sport:'soccer',league:'eng.1',markets:trackerMarkets('soccer')});s.game.home.score=1;s.game.away.score=1;
 assert.equal(evaluateLeg(leg({sport:'Soccer',league:'eng.1',market:'moneyline',side:'draw'}),s).state,'won');
 s.game.extraTime=true;assert.equal(evaluateLeg(leg({sport:'Soccer',league:'eng.1',market:'moneyline',side:'draw'}),s).state,'review');
 const n=snapshot();n.game.home.score=75;assert.equal(evaluateLeg(leg({market:'moneyline',side:'home'}),n).state,'review');
});
test('parlays combine leg results and never invent a repriced payout after a push or void',()=>{
 assert.equal(ticketSettlement([state('won'),state('won')]).status,'won');
 assert.equal(ticketSettlement([state('lost'),state('open')]).status,'lost');
 assert.equal(ticketSettlement([state('won'),state('open')]).status,'open');
 assert.equal(ticketSettlement([state('push')]).status,'push');
 assert.equal(ticketSettlement([state('void'),state('void')]).status,'void');
 assert.match(ticketSettlement([state('won'),state('void')]).note,/payout/);
 assert.equal(ticketSettlement([state('won'),state('void')]).status,'open');
});
test('tracking preserves booked lines, cashouts and manual overrides, and follows stat corrections',()=>{
 const b=ticket(),snapshots=new Map([[gameKey(b.legs[0]),snapshot()]]);
 let updated=refreshTicket(b,snapshots);assert.equal(updated.status,'won');assert.equal(updated.legs[0].line,10.5);
 const corrected=snapshot();corrected.players[0].values.points=10;snapshots.set(gameKey(b.legs[0]),corrected);
 updated=refreshTicket(updated,snapshots);assert.equal(updated.status,'lost');
 const cashout=refreshTicket(ticket({settlement:'manual',status:'cashed',cashout:20}),snapshots);assert.equal(cashout.status,'cashed');assert.equal(cashout.cashout,20);
 const overridden=refreshTicket(ticket({legs:[leg({override:'void'})]}),snapshots);assert.equal(overridden.status,'void');
});
test('ticket validation enforces leg counts, valid lines and actual sportsbook return',()=>{
 assert.throws(()=>validateBet(ticket({type:'parlay'})),/at least two/);
 assert.throws(()=>validateBet(ticket({legs:[leg(),leg({id:'leg-2'})]})),/single/);
 assert.throws(()=>validateLeg(leg({line:''})),/line/);assert.throws(()=>validateLeg(leg({line:10.25})),/Quarter/);
 assert.throws(()=>validateLeg(leg({gameId:'../../etc'})),/Connect/);
 const b=validateBet(ticket({status:'won',settlement:'manual',returnOverride:45}));assert.equal(betReturns(b).returned,45);assert.equal(betReturns(b).profit,20);
});
test('existing version-one tickets remain readable and CSV carries separate leg evidence',()=>{
 const old=ticket();delete old.legs;delete old.settlement;old.id='ticket-1';old.updatedAt='2026-09-22T10:00Z';
 const [migrated]=readBets({getItem:key=>key===BET_STORAGE_KEY?JSON.stringify({version:1,bets:[old]}):null});
 assert.deepEqual(migrated.legs,[]);assert.equal(migrated.settlement,'manual');assert.equal(migrated.status,'open');
 const csv=betsCsv([ticket({legs:[leg({observation:evaluateLeg(leg(),snapshot())})]})]);assert.match(csv,/Player points over 10.5/);assert.match(csv,/Actual: 12/);assert.match(csv,/site.api.espn.com/);
});
test('NFL stat categories do not confuse interceptions thrown with defensive interceptions',()=>{
 const data={boxscore:{players:[{team:{id:1},statistics:[{name:'passing',keys:['completions/passingAttempts','interceptions'],athletes:[{athlete:{id:1,displayName:'QB'},stats:['20/30','2']}]},{name:'interceptions',keys:['interceptions'],athletes:[{athlete:{id:2,displayName:'Defender'},stats:['1']}]}]}]}};
 const players=nflPlayers(data);assert.equal(players[0].values.completions,20);assert.equal(players[0].values.attempts,30);assert.equal(players[0].values.interceptions,2);assert.equal(players[1].values.interceptions,undefined);
});
test('basketball combos, DNPs and missing fields normalize without invented zero values',()=>{
 const data={header:{id:'401000001',competitions:[{status:{type:{state:'post',completed:true}},competitors:[{homeAway:'home',team:{id:1},score:'80'},{homeAway:'away',team:{id:2},score:'75'}]}]},boxscore:{players:[{team:{id:1},statistics:[{keys:['minutes','points','rebounds','assists'],athletes:[{athlete:{id:22,displayName:'Player'},stats:['30','20','8','4']},{athlete:{id:23,displayName:'DNP'},didNotPlay:true,stats:[]}]}]}]}};
 const result=espnTrackerGame(data,'wnba');assert.equal(result.players[0].values.pra,32);assert.equal(result.players[1].participation,'dnp');assert.equal(result.players[1].values.points,null);
});
test('MLB outs use baseball innings and doubleheader game IDs stay distinct',()=>{
 const pitcher={person:{id:1,fullName:'Pitcher'},stats:{pitching:{inningsPitched:'5.2',numberOfPitches:90,strikeOuts:6}}};
 const data={gamePk:777777,gameData:{teams:{home:{id:1},away:{id:2}},status:{abstractGameState:'Final'}},liveData:{linescore:{teams:{home:{runs:3},away:{runs:2}}},boxscore:{teams:{home:{players:{ID1:pitcher}},away:{players:{}}}}}};
 const result=mlbTrackerGame(data);assert.equal(result.players[0].values.outs,17);assert.equal(result.players[0].values.k,6);assert.equal(result.players[0].values.hits,null);
 assert.notEqual(gameKey(leg({sport:'MLB',gameId:'777777'})),gameKey(leg({sport:'MLB',gameId:'777778'})));
});
test('tracker URLs restrict sports, league, calendar dates and IDs',async()=>{
 for(const q of [{sport:'fake',date:'2026-01-01'},{sport:'soccer',league:'../../',date:'2026-01-01'},{sport:'wnba',date:'2026-02-30'},{sport:'mlb',date:'2026-01-01',game:'https://evil'}])assert.throws(()=>trackerQuery(q));
 const store=new BetTrackerStore({provider:{read:async()=>{throw Error('Should not fetch');}}});await assert.rejects(store.game({sport:'wnba',date:'2026-09-22'}),/Choose a game/);
});
