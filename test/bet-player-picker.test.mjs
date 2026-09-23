import test from 'node:test';
import assert from 'node:assert/strict';
import { playerRoles,trackerMarkets,BetTrackerStore } from '../lib/bet-tracker.mjs';
import { playerEligible,playerNameMatches,findPlayers } from '../public/bet-legs.js';
const player=(position,sport,extra={})=>{const p={id:position,name:position,position,values:{},...extra};return {...p,roles:playerRoles(p,sport)};};

test('NFL props restrict pregame positions and retain verified unusual stat roles',()=>{
 const roster=['QB','WR','RB','FB','TE','OT','CB','K','PK','P','LS'].map(p=>player(p,'nfl')),markets=trackerMarkets('nfl');
 const eligible=key=>roster.filter(p=>playerEligible(p,markets[key])).map(p=>p.position);
 assert.deepEqual(eligible('receiving_yards'),['WR','RB','FB','TE']);
 assert.deepEqual(eligible('passing_yards'),['QB']);
 assert.deepEqual(eligible('carries'),['QB','WR','RB','FB']);
 assert.deepEqual(eligible('field_goals'),['K','PK']);
 assert.equal(playerEligible(player('QB','nfl',{values:{receiving_yards:0}}),markets.receiving_yards),true);
 assert.equal(playerEligible(player('','nfl',{categories:['receiving']}),markets.receiving_yards),true);
 assert.equal(playerEligible(player('','nfl'),markets.receiving_yards),false);
});
test('baseball separates hitters and pitchers while allowing two-way players',()=>{
 const markets=trackerMarkets('mlb'),pitcher=player('P','mlb',{battingOrder:'0'}),hitter=player('DH','mlb'),twoWay=player('P','mlb',{positions:['P','DH'],battingOrder:'100'});
 assert.equal(playerEligible(pitcher,markets.k),true);assert.equal(playerEligible(pitcher,markets.hits),false);
 assert.equal(playerEligible(hitter,markets.k),false);assert.equal(playerEligible(hitter,markets.hits),true);
 assert.equal(playerEligible(twoWay,markets.k),true);assert.equal(playerEligible(twoWay,markets.hr),true);
 assert.equal(playerEligible(player('1B','mlb',{values:{k:0}}),markets.k),true);
});
test('goalie props restrict NHL and soccer keepers without arbitrary basketball filters',()=>{
 const nhl=trackerMarkets('nhl'),soccer=trackerMarkets('soccer');
 assert.equal(playerEligible(player('G','nhl',{values:{goals:0}}),nhl.goals),false);
 assert.equal(playerEligible(player('G','nhl'),nhl.saves),true);
 assert.equal(playerEligible(player('D','nhl'),nhl.saves),false);
 assert.equal(playerEligible(player('D','nhl'),nhl.blocks),true);
 assert.equal(playerEligible(player('GK','soccer'),soccer.saves),true);
 assert.equal(playerEligible(player('F','soccer'),soccer.saves),false);
 assert.equal(playerEligible(player('GK','soccer'),soccer.shots),false);
 assert.equal(playerEligible(player('GK','soccer'),soccer.cards),true);
 for(const sport of ['nba','wnba'])for(const position of ['G','F','C'])assert.equal(playerEligible(player(position,sport),trackerMarkets(sport).points),true);
 assert.equal(playerEligible(player('F','soccer'),soccer.team_goals),false);
});
test('player search ignores accents and punctuation, keeps game identity, and enforces prop role',()=>{
 const markets=trackerMarkets('mlb'),p=player('DH','mlb',{id:'42',name:'José Ramírez'}),pitcher=player('P','mlb',{id:'43',name:'José Pitcher'});
 assert.equal(playerNameMatches(p,'jose ram'),true);assert.equal(playerNameMatches({name:'A’ja Wilson'},'aja'),true);
 const games=['111111','222222'].map(id=>({game:{id},markets,players:[p,pitcher]}));
 const found=findPlayers(games,'hits','JOSE');assert.equal(found.length,2);assert.deepEqual(found.map(r=>r.game.id),['111111','222222']);assert.ok(found.every(r=>r.player.id==='42'));
 assert.equal(findPlayers(games,'k','Jose')[0].player.id,'43');assert.deepEqual(findPlayers(games,'hits','No match'),[]);
});
test('pregame roster enrichment fills position on existing box-score players and never invents stats',async()=>{
 const summary={header:{id:'401000001',competitions:[{status:{type:{state:'pre',completed:false}},competitors:[{homeAway:'home',team:{id:1}},{homeAway:'away',team:{id:2}}]}]},boxscore:{players:[{team:{id:1},statistics:[{name:'receiving',keys:[],athletes:[{athlete:{id:22,displayName:'Receiver'},stats:[]}]}]}]}};
 const store=new BetTrackerStore({provider:{read:async url=>({url,payload:url.includes('/summary')?summary:{athletes:[{items:[{id:22,displayName:'Receiver',position:{abbreviation:'WR'}},{id:23,displayName:'Lineman',position:{abbreviation:'OT'}},{id:24,displayName:'Quarterback',position:{abbreviation:'QB'}}]}]}})}});
 const result=await store.game({sport:'nfl',date:'2026-09-22',game:'401000001'});
 assert.equal(result.players.find(p=>p.id==='22').position,'WR');
 assert.equal(result.players.find(p=>p.id==='22').values.receiving_yards,null);
 assert.deepEqual(result.players.filter(p=>playerEligible(p,result.markets.receiving_yards)).map(p=>p.id),['22']);
 assert.deepEqual(result.players.filter(p=>playerEligible(p,result.markets.passing_yards)).map(p=>p.id),['24']);
});
