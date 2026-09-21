// Plain-language reasons use only the same recorded inputs as the selected board.
// A rating is not a probability of beating a sportsbook line.
const known=Number.isFinite;
const fmt=(x,d=1)=>Number(x.toFixed(d)).toString();
const percent=x=>`${Math.round(x*100)}%`;

export function explainPlayer({market,stats:s={},components:c={},modelScore,opponent,position,count=0,opponentCount=0}) {
  const tone=count<3?'early':!known(modelScore)?'limited':modelScore>=70?'strong':modelScore>=50?'promising':modelScore>=30?'mixed':'limited';
  const labels={strong:'Strong profile',promising:'Positive signals',mixed:'Mixed signals',limited:'Limited support',early:'Early sample'};
  const descriptions={strong:'strong rating',promising:'positive rating',mixed:'mixed rating',limited:'limited rating',early:'early rating'};
  let drivers=[],matchup='';
  const add=(value,text,weight=1)=>{if(known(value))drivers.push({text,weight});};
  const opponentName=opponent||'The opponent';
  if(market==='any_td'){
    if(known(s.rz_touch_share))add(s.rz_touch_share,`${percent(s.rz_touch_share)} of team red-zone work`,(c.rz_role??0)*.35);
    if(known(s.touches_pg))add(s.touches_pg,`${fmt(s.touches_pg)} touches/game`,(c.volume??0)*.25);
    if(known(s.goal_line_carries_pg))add(s.goal_line_carries_pg,`${fmt(s.goal_line_carries_pg)} goal-line carries/game`,(c.goal_line??0)*.15);
    if(known(s.target_share_avg))add(s.target_share_avg,`${percent(s.target_share_avg)} of team targets`,(c.target_share??0)*.15);
    if(opponentCount&&known(s.opp_td_allowed_pg))matchup=`${opponentName} has allowed ${fmt(s.opp_td_allowed_pg)} TDs/game to ${position||'this position'}${position?'s':''} in its recent sample.`;
    else if(known(s.implied_total))matchup=`A ${fmt(s.implied_total)}-point implied team total adds game context.`;
  }else if(market==='pass_yds'){
    if(known(s.attempts_pg))add(s.attempts_pg,`${fmt(s.attempts_pg)} attempts/game`,2);
    if(known(s.pass_ypg))add(s.pass_ypg,`${fmt(s.pass_ypg)} passing yards/game`);
    if(opponentCount&&known(s.opp_pass_ypg_allowed))matchup=`${opponentName} allows ${fmt(s.opp_pass_ypg_allowed)} passing yards/game${s.opp_pass_ypg_allowed>=240?', supporting the matchup':', a less supportive matchup'}.`;
  }else if(market==='pass_tds'){
    if(known(s.rz_attempts_pg))add(s.rz_attempts_pg,`${fmt(s.rz_attempts_pg)} red-zone attempts/game`,2);
    if(known(s.pass_tds_pg))add(s.pass_tds_pg,`${fmt(s.pass_tds_pg)} passing TDs/game`);
    if(opponentCount&&known(s.opp_pass_tds_allowed_pg))matchup=`${opponentName} has allowed ${fmt(s.opp_pass_tds_allowed_pg)} passing TDs/game in its recent sample.`;
  }else if(market==='rush_yds'){
    if(known(s.carries_pg))add(s.carries_pg,`${fmt(s.carries_pg)} carries/game`,2);
    if(known(s.rush_ypg))add(s.rush_ypg,`${fmt(s.rush_ypg)} rushing yards/game`);
    if(opponentCount&&known(s.opp_ypc_allowed))matchup=`${opponentName} allows ${fmt(s.opp_ypc_allowed)} yards/carry${s.opp_ypc_allowed>=4.5?', adding matchup support':', so the case rests more on workload'}.`;
  }else if(market==='rec'){
    if(known(s.targets_pg))add(s.targets_pg,`${fmt(s.targets_pg)} targets/game`,2);
    if(known(s.rec_pg))add(s.rec_pg,`${fmt(s.rec_pg)} receptions/game`);
    if(opponentCount&&known(s.opp_rec_allowed_pg))matchup=`${opponentName} allows ${fmt(s.opp_rec_allowed_pg)} receptions/game to ${position||'this position'}${position?'s':''} in its recent sample.`;
  }else if(market==='rush_attempts'){
    if(known(s.carries_pg))add(s.carries_pg,`${fmt(s.carries_pg)} carries/game`,2);
    if(known(s.carry_share))add(s.carry_share,`${percent(s.carry_share)} of team carries`);
    if(opponentCount&&known(s.opp_carries_allowed_pg))matchup=`Opponents average ${fmt(s.opp_carries_allowed_pg)} rushing attempts/game against ${opponentName}.`;
  }else if(market==='rec_yds'){
    if(known(s.targets_pg))add(s.targets_pg,`${fmt(s.targets_pg)} targets/game`,2);
    if(known(s.receiving_ypg))add(s.receiving_ypg,`${fmt(s.receiving_ypg)} receiving yards/game`);
    if(opponentCount&&known(s.opp_receiving_ypg_allowed))matchup=`${opponentName} allows ${fmt(s.opp_receiving_ypg_allowed)} receiving yards/game to ${position}s.`;
  }else if(market==='pass_attempts'){
    if(known(s.attempts_pg))add(s.attempts_pg,`${fmt(s.attempts_pg)} attempts/game`,2);
    if(known(s.pass_attempt_share))add(s.pass_attempt_share,`${percent(s.pass_attempt_share)} of the team’s pass attempts`);
    if(opponentCount&&known(s.opp_pass_attempts_allowed_pg))matchup=`Opposing passers average ${fmt(s.opp_pass_attempts_allowed_pg)} attempts/game against ${opponentName}.`;
  }else if(market==='pass_completions'){
    if(known(s.attempts_pg))add(s.attempts_pg,`${fmt(s.attempts_pg)} attempts/game`,2);
    if(known(s.completions_pg))add(s.completions_pg,`${fmt(s.completions_pg)} completions/game`);
    if(opponentCount&&known(s.opp_completions_allowed_pg))matchup=`${opponentName} allows ${fmt(s.opp_completions_allowed_pg)} completions/game.`;
  }else if(market==='pass_interceptions'){
    if(known(s.attempts_pg))add(s.attempts_pg,`${fmt(s.attempts_pg)} attempts/game`,2);
    if(known(s.interceptions_pg))add(s.interceptions_pg,`${fmt(s.interceptions_pg)} interceptions thrown/game`);
    if(opponentCount&&known(s.opp_interceptions_pg))matchup=`${opponentName} records ${fmt(s.opp_interceptions_pg)} interceptions/game. A higher score means more interception exposure.`;
  }else if(market==='rush_rec_yds'){
    if(known(s.touches_pg))add(s.touches_pg,`${fmt(s.touches_pg)} touches/game`,2);
    if(known(s.rush_rec_ypg))add(s.rush_rec_ypg,`${fmt(s.rush_rec_ypg)} combined rushing and receiving yards/game`);
    if(opponentCount&&known(s.opp_rush_rec_ypg_allowed))matchup=`${opponentName} allows ${fmt(s.opp_rush_rec_ypg_allowed)} combined yards/game to ${position}s.`;
  }
  drivers.sort((a,b)=>b.weight-a.weight);
  const facts=drivers.slice(0,2).map(d=>d.text);
  if(!facts.length)return {reason:'There is not enough recorded usage to explain a favorable outlook yet.',outlook:'Limited data',outlookTone:'limited'};
  const capital=text=>text.charAt(0).toUpperCase()+text.slice(1);
  const sentence=`${capital(facts.join(' and '))} ${facts.length===1?'drives':'drive'} the model’s ${descriptions[tone]}.`;
  const caution=count<3?` Only ${count} ${count===1?'game':'games'} in the sample.`:'';
  return {reason:[sentence,matchup].filter(Boolean).join(' ')+caution,outlook:labels[tone],outlookTone:tone};
}
