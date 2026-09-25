// Scoring reconstruction from the reference site's public metric definitions and
// serialized board data. Its server-side input filters and some composite inputs
// are not published, so the non-TD feature recipes are evidence-based estimates.
import {ratingFromComponents} from './rating.mjs';

export const PROFILE_MARKETS = Object.freeze(['any_td','rush_yds','rec','pass_yds','pass_tds']);
export const PERCENTILE_MARKETS = Object.freeze(PROFILE_MARKETS.filter(m=>m!=='any_td'));
const cap=x=>Math.max(0,Math.min(100,x));
const round=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
const linear=(x,lo,hi)=>Number.isFinite(x)?cap(100*(x-lo)/(hi-lo)):null;

export function anyTdComponents(s){
 return {
  rz_role:linear(s.rz_touch_share,0,.35),
  volume:linear(s.touches_pg,0,22),
  goal_line:linear(s.goal_line_carries_pg,0,2.5),
  target_share:linear(s.target_share_avg,0,.3),
  td_rate:linear(s.td_per_touch,0,.12),
  implied_total_score:linear(s.implied_total,14,31),
  matchup_score:Number.isFinite(s.opp_td_allowed_pg)?linear(s.opp_td_allowed_pg,.2,1.6):50,
 };
}

export function anyTdDueBonus(s,enabled=true){
 if(!enabled)return 0;
 const rz=anyTdComponents(s).rz_role;
 if(Number.isFinite(rz)&&rz>=60&&s.games_since_td>=3)return 8;
 if(s.touches_pg>=12&&s.games_since_td>=4)return 5;
 return 0;
}

// Inferred from publicly exposed 2026 weeks 1–3 score/probability pairs.
// The curve family was selected using weeks 1–2; week 3 held-out mean
// absolute probability error was 0.0000194 (max 0.000649) on 255 unmodified
// rows. This is a score-to-chance
// mapping, never the score itself and never a copied player percentage.
export const TD_CURVE_VERSION='reference-score-curve-v1';
const tdCurve=[-.7226421896313724,1.0622621257823823,-.22782927492134067,-.04522177500595738,.009427108933096014,.004670305823120396];
export function inferredTdProbability(score){
 if(!Number.isFinite(score))return null;
 const x=(Math.max(0,Math.min(100,score))-50)/25;
 const logit=tdCurve.reduce((sum,coefficient,power)=>sum+coefficient*x**power,0);
 return 1/(1+Math.exp(-logit));
}

function ranges(rows){
 const fields=new Set(rows.flatMap(r=>Object.keys(r)));
 return Object.fromEntries([...fields].map(key=>{
  const xs=rows.map(r=>r[key]).filter(Number.isFinite);
  return [key,{min:Math.min(...xs),max:Math.max(...xs)}];
 }));
}
const norm=(s,key,r,inverse=false)=>{
 const x=s[key],range=r[key];
 if(!Number.isFinite(x)||!range||!Number.isFinite(range.min)||range.max<=range.min)return null;
 const value=linear(x,range.min,range.max);
 return inverse?100-value:value;
};
const blend=parts=>{
 const usable=parts.filter(([value])=>Number.isFinite(value));
 const weight=usable.reduce((sum,[,w])=>sum+w,0);
 return weight?cap(usable.reduce((sum,[value,w])=>sum+value*w,0)/weight):null;
};

export function profileComponents(market,s,cohort){
 const r=ranges(cohort),n=(key,inverse=false)=>norm(s,key,r,inverse);
 const script=()=>{
  const max=Math.max(Math.abs(r.points_favored?.min??0),Math.abs(r.points_favored?.max??0));
  return Number.isFinite(s.points_favored)&&max>0?cap(50+100*s.points_favored/(2*max)):null;
 };
 if(market==='rush_yds')return {
  volume:blend([[n('carry_share'),.7],[n('carries_pg'),.3]]),
  front:blend([[n('opp_light_box_rate'),.5],[n('opp_ypc_allowed'),.5]]),
  script:script(),
  // This four-variable affine recipe reproduces the public component to
  // roughly a tenth across three weeks; its hidden source constants remain unknown.
  baseline:[s.rush_ypg,s.ypc,s.explosive_pct,s.stuff_avoid_pct].every(Number.isFinite)?cap(7.5+.342*s.rush_ypg+1.155*s.ypc+20*s.explosive_pct+10*s.stuff_avoid_pct):null,
 };
 if(market==='rec')return {
  design:blend([[n('target_share'),.6],[n('quick_share'),.4]]),
  baseline:blend([[n('rec_pg'),.5],[n('targets_pg'),.3],[n('catch_pct'),.2]]),
  matchup:blend([[n('opp_rec_allowed_pg'),.6],[n('opp_catch_rate_allowed'),.4]]),
  script:Number.isFinite(script())?100-script():null,
 };
 if(market==='pass_yds')return {
  baseline:blend([[n('air_volume'),.4],[n('pass_ypg'),.35],[n('ypa'),.25]]),
  matchup:blend([[n('opp_pass_ypg_allowed'),.6],[n('opp_sack_rate_forced',true),.4]]),
  script:Number.isFinite(script())?100-script():null,
  environment:n('implied_total'),
 };
 if(market==='pass_tds')return {
  rz_lean:n('rz_pass_rate'),
  baseline:blend([[n('pass_tds_pg'),.6],[n('end_zone_acc'),.4]]),
  matchup:n('opp_pass_tds_allowed_pg'),
  environment:n('implied_total'),
 };
 throw Error(`Unsupported profile market: ${market}`);
}

export function finishProfileRatings(players,market,rawStats,normalizationIds=null){
 if(!PERCENTILE_MARKETS.includes(market))return players;
 const cohort=players.filter(p=>!normalizationIds||normalizationIds.has(p.playerId)).map(p=>rawStats.get(p.playerId));
 const computed=players.map(p=>{
  const components=profileComponents(market,rawStats.get(p.playerId),cohort);
  const rating=ratingFromComponents(market,components);
  return {p,components,rating};
 });
 for(const {p,components,rating} of computed)if(!Number.isFinite(rating.score)){
  p.modelScore=null;p.compositeScore=null;p.baselineScore=round(rating.baseline);p.opportunityScore=round(rating.opportunity);p.dueBonus=null;
  p.details.components=components;p.details.rating=rating;p.details.coverage.missingRatingInputs=rating.missing;
 }
 const ranked=computed.filter(x=>Number.isFinite(x.rating.score)).sort((a,b)=>a.rating.score-b.rating.score);
 // Inclusive empirical percentile. Equal composite scores share the average rank.
 for(let start=0;start<ranked.length;){
  let end=start+1;
  while(end<ranked.length&&Math.abs(ranked[end].rating.score-ranked[start].rating.score)<1e-9)end++;
  const percentile=100*(start+1+end)/(2*ranked.length);
  for(let i=start;i<end;i++){
   const {p,components,rating}=ranked[i];
   p.modelScore=round(percentile);
   p.compositeScore=round(rating.score);
   p.baselineScore=round(rating.baseline);
   p.opportunityScore=round(rating.opportunity);
   p.dueBonus=null;
   p.details.components=Object.fromEntries(Object.entries(components).map(([key,value])=>[key,Number.isFinite(value)?Math.round(value*10)/10:null]));
   p.details.rating=rating;
   p.details.coverage.missingRatingInputs=rating.missing;
  }
  start=end;
 }
 return players;
}
