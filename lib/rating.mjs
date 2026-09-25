// A profile score ranks players for research. Only the separately calibrated TD
// probability is a chance of an event occurring.
export const RATING_VERSION = 'reference-profile-v3';
export const RATING_WEIGHTS = Object.freeze({
  any_td: Object.freeze({ baseline: .6, opportunity: .4, role: Object.freeze({ rz_role: .35, volume: .25, goal_line: .15, target_share: .15, td_rate: .1 }), context: Object.freeze({ implied_total_score: .55, matchup_score: .45 }) }),
  rush_yds: Object.freeze({baseline:.55,opportunity:.45,role:Object.freeze({volume:.4,baseline:.15}),context:Object.freeze({front:.3,script:.15})}),
  rec: Object.freeze({baseline:.7,opportunity:.3,role:Object.freeze({design:.4,baseline:.3}),context:Object.freeze({matchup:.2,script:.1})}),
  pass_yds: Object.freeze({baseline:.45,opportunity:.55,role:Object.freeze({baseline:.45}),context:Object.freeze({matchup:.25,script:.15,environment:.15})}),
  pass_tds: Object.freeze({baseline:.65,opportunity:.35,role:Object.freeze({rz_lean:.35,baseline:.3}),context:Object.freeze({matchup:.2,environment:.15})}),
  other: Object.freeze({ baseline: .8, opportunity: .2, role: Object.freeze({ volume: .5, baseline: .3 }), context: Object.freeze({ matchup: 1 }) }),
});
const labels={rz_role:'Red-zone role',volume:'Workload',goal_line:'Goal-line carries',target_share:'Target share',td_rate:'Observed TD rate',implied_total_score:'Implied team total',matchup_score:'Opponent allowance',baseline:'Recent production',matchup:'Opponent allowance',front:'Run defense',script:'Game script',design:'Target design',environment:'Team total',rz_lean:'Red-zone pass rate'};
export function ratingFromComponents(market, components) {
  const rules=RATING_WEIGHTS[market]||RATING_WEIGHTS.other;
  const group=weights=>{
    const available=Object.entries(weights).filter(([key])=>Number.isFinite(components[key]));
    const weight=available.reduce((s,[,w])=>s+w,0);
    return {available,weight,score:weight?available.reduce((s,[key,w])=>s+components[key]*w,0)/weight:null};
  };
  const role=group(rules.role),context=group(rules.context),missing=Object.keys({...rules.role,...rules.context}).filter(key=>!Number.isFinite(components[key]));
  // Opponent data alone cannot establish a player's rating.
  const baseline=role.score,opportunity=context.score;
  const roleWeight=opportunity===null?1:rules.baseline,contextWeight=opportunity===null?0:rules.opportunity;
  const factors=baseline===null?[]:[[role,roleWeight],[context,contextWeight]].flatMap(([g,w])=>g.available.map(([key,weight])=>({key,label:labels[key],normalized:components[key],weight:w*weight/g.weight,points:components[key]*w*weight/g.weight}))).sort((a,b)=>b.points-a.points);
  const score=baseline===null?null:Math.max(0,Math.min(100,baseline*roleWeight+(opportunity??0)*contextWeight));
  return {version:RATING_VERSION,score,baseline,opportunity,missing,factors,summary:factors.length?'Largest score contributions: '+factors.slice(0,3).map(f=>`${f.label} ${f.points.toFixed(1)} points`).join('; ')+'.':'Insufficient player inputs for a rating.'};
}
