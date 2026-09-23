// Existing standard-model weights. A score is a research ranking, not a probability.
export const RATING_VERSION = 'independent-v2.1';
export const RATING_WEIGHTS = Object.freeze({
  any_td: Object.freeze({ baseline: .6, opportunity: .4, role: Object.freeze({ rz_role: .35, volume: .25, goal_line: .15, target_share: .15, td_rate: .1 }), context: Object.freeze({ implied_total_score: .55, matchup_score: .45 }) }),
  other: Object.freeze({ baseline: .8, opportunity: .2, role: Object.freeze({ volume: .5, baseline: .3 }), context: Object.freeze({ matchup: 1 }) }),
});
const labels={rz_role:'Red-zone role',volume:'Workload',goal_line:'Goal-line carries',target_share:'Target share',td_rate:'Observed TD rate',implied_total_score:'Implied team total',matchup_score:'Opponent allowance',baseline:'Recent production',matchup:'Opponent allowance'};
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
