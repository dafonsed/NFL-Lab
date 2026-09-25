import test from 'node:test';
import assert from 'node:assert/strict';
import {anyTdComponents,anyTdDueBonus,inferredTdProbability,profileComponents,finishProfileRatings} from '../lib/reference-profile.mjs';
import {ratingFromComponents} from '../lib/rating.mjs';

test('published touchdown scales reconstruct an unseen player score from inputs',()=>{
 const stats={rz_touch_share:.457,touches_pg:21.6,goal_line_carries_pg:2.6,target_share_avg:.176,td_per_touch:.056,implied_total:28,opp_td_allowed_pg:1.25,games_since_td:0};
 const components=anyTdComponents(stats);
 assert.deepEqual(Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Math.round(v)])),{rz_role:100,volume:98,goal_line:100,target_share:59,td_rate:47,implied_total_score:82,matchup_score:75});
 assert.ok(Math.abs(ratingFromComponents('any_td',components).score-84.389626)<.05);
 assert.equal(anyTdDueBonus(stats),0);
 assert.equal(anyTdDueBonus({...stats,rz_touch_share:.211,games_since_td:3}),8);
 assert.equal(anyTdDueBonus({...stats,rz_touch_share:.207,touches_pg:12,games_since_td:4}),5);
 assert.equal(anyTdDueBonus({...stats,rz_touch_share:.207,touches_pg:11.9,games_since_td:4}),0);
 assert.equal(anyTdComponents({...stats,opp_td_allowed_pg:null}).matchup_score,50);
});

test('separate score-to-chance curve reproduces held-out public scores',()=>{
 assert.ok(Math.abs(inferredTdProbability(60.117264)-.41758913)<.0001);
 assert.ok(Math.abs(inferredTdProbability(20.475681)-.098606594)<.0001);
 assert.ok(inferredTdProbability(84.389626)>.5);
 assert.ok(inferredTdProbability(84.389626)<.7);
});

test('other market percentiles use weighted composites and inclusive cohort ranks',()=>{
 const stats=[{carry_share:.2,carries_pg:5,opp_light_box_rate:.3,opp_ypc_allowed:3.5,points_favored:-5,rush_ypg:20,ypc:4,explosive_pct:.05,stuff_avoid_pct:.6},{carry_share:.5,carries_pg:15,opp_light_box_rate:.5,opp_ypc_allowed:4.5,points_favored:0,rush_ypg:70,ypc:5,explosive_pct:.1,stuff_avoid_pct:.8},{carry_share:.8,carries_pg:25,opp_light_box_rate:.7,opp_ypc_allowed:5.5,points_favored:5,rush_ypg:110,ypc:5.5,explosive_pct:.15,stuff_avoid_pct:.9}];
 const players=stats.map((s,i)=>({playerId:String(i),details:{coverage:{}}})),raw=new Map(stats.map((s,i)=>[String(i),s]));
 finishProfileRatings(players,'rush_yds',raw);
 assert.deepEqual(players.map(p=>p.modelScore),[33.333,66.667,100]);
 for(const p of players){const rating=ratingFromComponents('rush_yds',profileComponents('rush_yds',raw.get(p.playerId),stats));assert.ok(Math.abs(p.compositeScore-rating.score)<.001);assert.notEqual(p.modelScore,p.compositeScore);}
});
