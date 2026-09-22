import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPlayers,rankValue,playerKey,playerContext } from '../public/sports-view.js';
import { query } from '../lib/sports/config.mjs';
import { settleGames,combineSlate } from '../lib/sports/slate.mjs';
import { SportsStore } from '../lib/sports/source.mjs';

const p=(id,point,over,line=10.5,extra={})=>({id,gameId:'401000001',player:id,availability:{},forecast:{status:'available',point,probability:{over,under:over===null?null:1-over}},prop:line===null?null:{line},...extra});
const games=[1,2,3].map(i=>({id:'40100000'+i,home:{code:'H'+i},away:{code:'A'+i},state:'pre'}));
const catalog={sport:'wnba',date:'2026-09-22',games,markets:{points:{}},source:{url:'schedule',sha256:'a'}};
const board=g=>({game:g,players:[p('player-'+g.id,20,.65,10.5,{gameId:g.id})],unavailablePlayers:[],warnings:[],weather:{location:'Arena '+g.id},availability:{stale:false},props:{status:'available'},capture:{state:'saved'},validation:{n:1,mae:2},methodology:'method',historyGames:[{id:'shared'},{id:g.id}],sources:[catalog.source,{url:'summary/'+g.id,sha256:g.id}]});
const options={market:'points',model:{version:'wnba-opportunities-v1'},fetchedAt:'2026-09-22T12:00Z'};

test('All games is a valid WNBA selection without broadening other sports or invalid IDs',()=>{
 assert.equal(query({sport:'wnba',game:'all'}).gameId,'all');assert.throws(()=>query({sport:'nba',game:'all'}));assert.throws(()=>query({sport:'wnba',game:'arbitrary'}));
});
test('model ranking uses probability rather than raw production, preserves ties and does not mutate input',()=>{
 const players=[p('high-volume',30,.4),p('best',12,.8),p('tied',13,.8),p('zero',0,0)];
 const rows=rankPlayers(players);assert.deepEqual(rows.map(r=>r.player.id),['best','tied','high-volume','zero']);assert.deepEqual(rows.map(r=>r.rank),[1,1,3,4]);assert.equal(players[0].id,'high-volume');
 assert.equal(rankPlayers(players,'under')[0].player.id,'zero');assert.equal(rankPlayers(players,'projection')[0].player.id,'high-volume');
});
test('missing and stale lines stay unranked, zero is real, and reported-out players are excluded',()=>{
 const players=[p('no-line',25,.9,null),p('missing',null,.99),p('stale',20,.95,10.5,{prop:{line:10.5,stale:true}}),p('out',30,.99,10.5,{availability:{unavailable:true}}),p('valid',0,.2,0)];
 const rows=rankPlayers(players);assert.equal(rows[0].player.id,'valid');assert.equal(rows[0].rank,1);assert.equal(rows.filter(r=>r.rank===null).length,3);assert.equal(rows.some(r=>r.player.id==='out'),false);assert.equal(rankValue(players[0],'projection'),25);assert.equal(rankValue(players[1],'projection'),null);
});
test('all-games details keep each player matchup even when an athlete ID appears twice',()=>{
 const a=board(games[0]),b=board(games[1]);a.players=[p('same',20,.7,10.5,{gameId:games[0].id})];b.players=[p('same',10,.3,12.5,{gameId:games[1].id})];
 const slate=combineSlate({...catalog,games:games.slice(0,2)},[a,b].map(value=>({status:'fulfilled',value})),options);
 const context=playerContext(slate,playerKey(b.players[0]));assert.equal(context.player.forecast.point,10);assert.equal(context.board.game.id,games[1].id);assert.equal(context.board.weather.location,'Arena '+games[1].id);assert.equal(context.board.capture.state,'saved');assert.equal(slate.historyGames.length,3);assert.equal(slate.sources.length,3);
});
test('slate loading is bounded and preserves game order when one source fails',async()=>{
 let active=0,peak=0;const results=await settleGames(games,async g=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;if(g.id===games[1].id)throw Error('upstream unavailable');return board(g);});
 assert.equal(peak,2);assert.equal(results[1].status,'rejected');const slate=combineSlate(catalog,results,options);assert.equal(slate.partial,true);assert.equal(slate.loadedGames,2);assert.equal(slate.totalGames,3);assert.equal(slate.players.length,2);assert.match(slate.warnings[0],/A2 @ H2: upstream unavailable/);assert.deepEqual(slate.matchups.map(m=>m.game.id),[games[0].id,games[2].id]);
});
test('an empty schedule is different from all matchups failing',()=>{
 const empty=combineSlate({...catalog,games:[]},[],options);assert.equal(empty.empty,true);assert.equal(empty.partial,false);
 const failed=combineSlate(catalog,games.map(()=>({status:'rejected',reason:Error('unavailable')})),options);assert.equal(failed.empty,false);assert.equal(failed.partial,true);assert.equal(failed.loadedGames,0);assert.equal(failed.failures.length,3);
});
test('all-games API builds real single-game boards, caches them, and propagates forced refresh',async()=>{
 const store=new SportsStore({provider:{},archive:{status:{}}}),calls=[];store.catalog=async()=>catalog;store.build=async(q,force)=>{calls.push({id:q.gameId,force});return board(games.find(g=>g.id===q.gameId));};
 const input={sport:'wnba',date:'2026-09-22',game:'all'};const slate=await store.board(input);assert.equal(slate.loadedGames,3);assert.equal(slate.players.length,3);await store.board(input);assert.equal(calls.length,3);await store.board(input,true);assert.equal(calls.length,6);assert.ok(calls.slice(3).every(c=>c.force));
});
test('saved records across all games retain matchup identity and disclose record failures',async()=>{
 const store=new SportsStore({provider:{},archive:{status:{kind:'test'}}});store.board=async()=>({...combineSlate(catalog,games.map(g=>({status:'fulfilled',value:board(g)})),options)});
 const original=store.performance.bind(store);store.performance=async input=>{if(input.game==='all')return original(input);if(input.game===games[2].id)throw Error('Archive unavailable for third game');return {game:games.find(g=>g.id===input.game),records:[{id:'same',forecast:{point:10},version:'wnba-opportunities-v1'}]};};
 const data=await store.performance({sport:'wnba',date:'2026-09-22',game:'all'});assert.equal(data.records.length,2);assert.notEqual(data.records[0].gameId,data.records[1].gameId);assert.equal(data.records[0].matchup,'A1 @ H1');assert.match(data.warnings[0],/Archive unavailable/);
});
