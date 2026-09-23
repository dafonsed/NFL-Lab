import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_PLAYERS,DEMO_SPORTS,demoGames,demoSummary} from '../public/demo-data.js';

test('public demo has complete, stable fictional samples for each supported sport',()=>{
  assert.equal(DEMO_PLAYERS.length,12);
  assert.equal(new Set(DEMO_PLAYERS.map(p=>p.id)).size,12);
  for(const [sport,config] of Object.entries(DEMO_SPORTS)){
    const players=DEMO_PLAYERS.filter(p=>p.sport===sport);assert.equal(players.length,2);
    for(const p of players){
      assert.equal(p.games.length,20);
      for(const [id,,line,max] of config.markets){
        assert.ok(line>=0&&line<=max);
        assert.ok(p.games.every(g=>Number.isFinite(g.stats[id])&&g.stats[id]>=0&&g.stats[id]<=max));
      }
    }
  }
});

test('demo samples use the latest eligible games and compose location and head-to-head filters',()=>{
  const p=DEMO_PLAYERS[0],before=JSON.stringify(p);
  assert.deepEqual(demoGames(p,{window:'5'}).map(g=>g.id),[16,17,18,19,20]);
  const home=demoGames(p,{window:'5',venue:'home'});assert.equal(home.length,5);assert.ok(home.every(g=>g.home));assert.equal(home.at(-1).id,19);
  const h2h=demoGames(p,{window:'h2h'});assert.equal(h2h.length,5);assert.ok(h2h.every(g=>g.opponent===p.opponent));
  assert.equal(demoGames(p,{window:'h2h',venue:'away'}).length,0);
  assert.equal(JSON.stringify(p),before);
});

test('line changes recalculate demo results with zeroes, ties and empty samples kept distinct',()=>{
  const games=[0,1,2,3].map(value=>({stats:{hits:value}}));
  assert.deepEqual(demoSummary(games,'hits',1),{n:4,hits:2,pushes:1,rate:50,average:1.5,median:1.5,min:0,max:3});
  assert.equal(demoSummary(games,'hits',1,'under').rate,25);
  assert.equal(demoSummary(games,'hits',0,'under').rate,0);
  assert.equal(demoSummary(games,'hits',2.5).rate,25);
  assert.deepEqual(demoSummary([],'hits',1),{n:0,hits:0,pushes:0,rate:null,average:null,median:null,min:null,max:null});
});
