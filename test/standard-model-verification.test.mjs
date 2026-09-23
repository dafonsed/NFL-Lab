import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRates,passPlay,targetPlay} from '../lib/model.mjs';
import {ratingFromComponents} from '../lib/rating.mjs';
import {applyOpportunityRating} from '../lib/nfl-opportunities.mjs';
import {contextVector} from '../lib/context-model.mjs';
import {freshPregameQuote} from '../lib/pregame-quote.mjs';
import {statValue} from '../lib/mlb/markets.mjs';

const pass=(overrides={})=>({play_type:'pass',pass_attempt:1,passer_player_id:'qb',receiver_player_id:'wr',yardline_100:15,air_yards:5,complete_pass:1,pass_touchdown:1,...overrides});
test('rate populations exclude negated plays, conversions, sacks and spikes but include receiverless attempts',()=>{
 const caught=pass(),missed=pass({complete_pass:0,pass_touchdown:0}),unassigned=pass({receiver_player_id:'',complete_pass:0,pass_touchdown:0});
 const exclusions=[{play_type:'no_play'},{play_deleted:1},{two_point_attempt:1},{sack:1},{qb_spike:1},{pass_attempt:0}].map(pass);
 const rates=buildRates([caught,missed,unassigned,...exclusions]);
 assert.equal(rates.passing.red_zone.count,3);assert.equal(rates.passing.red_zone.td,1);assert.equal(rates.passing.red_zone.rate,1/3);
 assert.equal(rates.receiving.short.count,2);assert.equal(rates.receiving.short.caught,1);assert.equal(rates.receiving.short.catchRate,1/2);
 assert.equal(passPlay(unassigned),true);assert.equal(targetPlay(unassigned),false);
 assert.equal(passPlay(pass({passer_player_id:''})),false);
 // A target's completed flag is counted only after that target is admitted.
 assert.equal(buildRates([caught,pass({receiver_player_id:'',complete_pass:1})]).receiving.short.caught,1);
});

test('full-data rating weights reconcile on a grid and missing factors do not imply equal comparability',()=>{
 for(const volume of [0,20,80,100])for(const baseline of [0,35,100])for(const matchup of [0,50,100]){
  const r=ratingFromComponents('rec',{volume,baseline,matchup});
  assert.ok(Math.abs(r.score-(.5*volume+.3*baseline+.2*matchup))<1e-10);
 }
 const complete=ratingFromComponents('rec',{volume:80,baseline:0,matchup:0});
 const incomplete=ratingFromComponents('rec',{volume:80,baseline:null,matchup:null});
 assert.equal(complete.score,40);assert.equal(incomplete.score,80);
 assert.deepEqual(incomplete.missing,['baseline','matchup']);
 assert.equal(ratingFromComponents('rec',{volume:null,baseline:40,matchup:null}).score,40);
 assert.equal(ratingFromComponents('rec',{volume:0,baseline:40,matchup:null}).score,15);
});

test('shared opportunity scoring retains exact weights with unrounded context inputs',()=>{
 const p={modelScore:42,baselineScore:42.5,opportunityScore:40,dueBonus:0,tdProb:null,projected:2,reason:'History',details:{components:{volume:50,baseline:30,matchup:40.0004}},forecast:{sample:[{targets:4,receptions:2}],teammateImpact:{applied:true,adjustments:{targets:1,carries:0},channels:[{field:'targets',delta:1,teamWorkload:30}],donors:[{player:'Donor'}]}}};
 applyOpportunityRating(p,'rec');const c=p.details.components;
 const exact=.5*c.volume+.3*c.baseline+.2*c.matchup;
 const former=.5*c.volume+.3*c.baseline+.2*40;
 assert.equal(p.modelScore,Math.round(exact*1e4)/1e4);
 assert.equal(p.modelScore,47.8334);assert.equal(Math.round(former*1e4)/1e4,47.8333);
});

test('valid weather, consistent baseball units and quote boundaries preserve their formulas',()=>{
 assert.deepEqual(contextVector({available:true,rate:3,leagueRate:2},{status:'available',temperatureF:85,windMph:20}),[.5,1,2]);
 assert.equal(statValue({outs:19,inningsPitched:'6.1'},'outs'),19);
 assert.equal(statValue({hits:4,doubles:1,triples:1,homeRuns:1},'singles'),1);
 assert.equal(statValue({hits:4,doubles:1,triples:1,homeRuns:1},'tb'),10);
 const now=Date.parse('2026-09-23T16:00:00Z'),q={line:1.5,basis:'captured_pregame',fetchedAt:'2026-09-23T14:00:00Z',commenceTime:'2026-09-23T18:00:00Z'};
 assert.equal(freshPregameQuote(q,now,q.commenceTime),true);
 assert.equal(freshPregameQuote({...q,fetchedAt:'2026-09-23T13:59:59Z'},now,q.commenceTime),false);
 assert.equal(freshPregameQuote(q,now,'2026-09-23T18:15:00Z'),false);
 assert.equal(freshPregameQuote(q,Date.parse(q.commenceTime),q.commenceTime),false);
});
