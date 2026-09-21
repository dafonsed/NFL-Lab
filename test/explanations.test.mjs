import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPlayer } from '../lib/explanations.mjs';
const context={count:5,opponentCount:5,opponent:'MIA',position:'RB',modelScore:77};
test('TD explanation selects the strongest weighted recorded drivers',()=>{
 const x=explainPlayer({...context,market:'any_td',stats:{touches_pg:18.6,rz_touch_share:.471,goal_line_carries_pg:.6,target_share_avg:.232,opp_td_allowed_pg:2.2},components:{rz_role:94,volume:74,goal_line:30,target_share:66}});
 assert.match(x.reason,/47% of team red-zone work and 18.6 touches\/game/);assert.match(x.reason,/MIA has allowed 2.2 TDs\/game to RBs/);assert.equal(x.outlook,'Strong profile');
});
test('high scores with a single game are explicitly marked as early evidence',()=>{
 const x=explainPlayer({...context,count:1,market:'rec',modelScore:95,position:'WR',stats:{targets_pg:10,rec_pg:8}});
 assert.equal(x.outlookTone,'early');assert.match(x.reason,/Only 1 game/);assert.doesNotMatch(x.reason,/strong rating/);
});
test('low ratings do not turn every player into a favored pick',()=>{
 const x=explainPlayer({...context,modelScore:12,market:'rush_yds',stats:{carries_pg:.2,rush_ypg:1.2,opp_ypc_allowed:3.7}});
 assert.equal(x.outlook,'Limited support');assert.match(x.reason,/limited rating/);assert.match(x.reason,/0.2 carries\/game/);assert.doesNotMatch(x.reason,/likely to hit|guaranteed|lock|favored/i);
});
test('missing opponent data does not become a zero or a fabricated matchup advantage',()=>{
 const x=explainPlayer({...context,opponentCount:0,market:'pass_yds',stats:{attempts_pg:30,pass_ypg:245,opp_pass_ypg_allowed:0}});
 assert.match(x.reason,/30 attempts\/game and 245 passing yards\/game/);assert.doesNotMatch(x.reason,/MIA|allows|undefined|NaN|null/);
});
test('passing TD explanation uses the actual RZ-attempt model input, not an unused team rate',()=>{
 const x=explainPlayer({...context,market:'pass_tds',stats:{rz_attempts_pg:4.4,rz_pass_rate:.99,pass_tds_pg:2.6,opp_pass_tds_allowed_pg:2.2}});
 assert.match(x.reason,/4.4 red-zone attempts\/game and 2.6 passing TDs\/game/);assert.doesNotMatch(x.reason,/99%/);
});
test('no available numeric usage produces an honest missing-data message',()=>{
 const x=explainPlayer({...context,market:'any_td',stats:{touches_pg:null,rz_touch_share:NaN}});
 assert.equal(x.outlook,'Limited data');assert.doesNotMatch(x.reason,/undefined|NaN|null|0 touches/);
});
test('recorded zero is retained, while negative debt is never cast as a hit guarantee',()=>{
 const x=explainPlayer({...context,market:'rec',stats:{targets_pg:0,rec_pg:0,reception_debt:-8},modelScore:0});
 assert.match(x.reason,/0 targets\/game and 0 receptions\/game/);assert.equal(x.outlookTone,'limited');assert.doesNotMatch(x.reason,/due|guarantee/);
});
