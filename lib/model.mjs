// All football calculations are local. Raw official totals and our estimates remain separate.
import { explainPlayer } from './explanations.mjs';
import { actualResult } from './results.mjs';
export const number = x => x!==''&&x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x):null;
const n=x=>number(x)??0;
export const sum=(xs,key)=>xs.reduce((s,x)=>s+n(typeof key==='function'?key(x):x[key]),0);
export const ratio=(a,b)=>b>0?a/b:null;
const cap=(x,a=0,b=100)=>Math.min(b,Math.max(a,x));
const score=(x,max)=>Number.isFinite(x)?cap(x/max*100):null;
const rounded=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
const mean=xs=>xs.length?sum(xs,x=>x)/xs.length:null;
export const zoneFor=x=>x==null?null:x<=5?'goal_line':x<=20?'red_zone':x<=40?'fringe':'open';
const depthFor=x=>x==null?'unknown':x<0?'behind':x<10?'short':x<20?'medium':'deep';
export const validPlay=p=>p.play_type!=='no_play'&&n(p.play_deleted)!==1&&n(p.two_point_attempt)!==1;
export const rushPlay=p=>validPlay(p)&&n(p.rush_attempt)===1&&!!p.rusher_player_id&&n(p.qb_kneel)!==1;
export const targetPlay=p=>validPlay(p)&&n(p.pass_attempt)===1&&!n(p.sack)&&!!p.receiver_player_id&&!n(p.qb_spike);
export const passPlay=p=>validPlay(p)&&n(p.pass_attempt)===1&&!n(p.sack)&&!!p.passer_player_id;
export function buildRates(plays) {
  const buckets={},depths={},rushBuckets={};
  for(const p of plays){
    if(passPlay(p)&&!n(p.qb_spike)){const d=depths[depthFor(number(p.air_yards))]??={count:0,caught:0,yards:0};d.count++;d.caught+=n(p.complete_pass);d.yards+=n(p.passing_yards);}
    const type=rushPlay(p)?'rush':targetPlay(p)?'pass':null;
    if(!type)continue;
    const z=zoneFor(number(p.yardline_100));
    if(z){const b=buckets[`${type}:${z}`]??={count:0,td:0};b.count++;b.td+=n(p[type==='rush'?'rush_touchdown':'pass_touchdown']);}
    if(type==='rush'){const d=rushBuckets[z||'open']??={count:0,yards:0};d.count++;d.yards+=n(p.rushing_yards);}
  }
  return {zones:Object.fromEntries(Object.entries(buckets).map(([k,b])=>[k,{...b,rate:ratio(b.td,b.count)}])),depths:Object.fromEntries(Object.entries(depths).map(([k,b])=>[k,{...b,catchRate:ratio(b.caught,b.count),yardsPerAttempt:ratio(b.yards,b.count)}])),rush:Object.fromEntries(Object.entries(rushBuckets).map(([k,b])=>[k,{...b,ypc:ratio(b.yards,b.count)}]))};
}
export function impliedPoints(game,team){const total=number(game.total_line),spread=number(game.spread_line);const favored=spread===null?null:team===game.home_team?spread:-spread;return {points_favored:favored,implied_total:total!==null&&favored!==null?(total+favored)/2:null};}
export function chooseCurrent(games,now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const season=Number(parts.month)<3?Number(parts.year)-1:Number(parts.year);
  const date=new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  if(date.getUTCDay()===2&&Number(parts.hour)<6)date.setUTCDate(date.getUTCDate()-1);
  const day=date.toISOString().slice(0,10);
  const rows=games.filter(g=>n(g.season)===season&&g.game_type!=='PRE');
  if(!rows.length)return {season,week:1};
  // Tuesday 06:00 Eastern keeps Monday Night Football in the current week.
  const tuesday=new Date(`${day}T12:00:00Z`);tuesday.setUTCDate(tuesday.getUTCDate()-((tuesday.getUTCDay()+5)%7));
  const upcoming=rows.filter(g=>g.gameday>=tuesday.toISOString().slice(0,10)).sort((a,b)=>n(a.week)-n(b.week))[0];
  return {season,week:upcoming?n(upcoming.week):Math.max(...rows.map(g=>n(g.week)))};
}
export function prepareData({schedule,pbp,weekly,rosters,snaps,chart}) {
  const games=new Map(schedule.map(g=>[g.game_id,{...g,players:new Map(),plays:[],chart:[],complete:false}]));
  const rosterByPfr=new Map(rosters.filter(r=>r.pfr_id&&r.gsis_id).map(r=>[r.pfr_id,r]));
  const chartByPlay=new Map(chart.map(c=>[c.nflverse_game_id+':'+c.play_id,c]));
  for(const p of pbp){const g=games.get(p.game_id);if(!g)continue;if(p.desc==='END GAME')g.complete=true;if(!validPlay(p))continue;g.plays.push(p);const c=chartByPlay.get(p.game_id+':'+p.play_id);if(c)g.chart.push({...p,...c});}
  for(const row of weekly){const g=games.get(row.game_id);if(g)g.players.set(row.player_id,{...row,statsAvailable:true,snap_pct:null,offense_snaps:null});}
  for(const s of snaps){const g=games.get(s.game_id),r=rosterByPfr.get(s.pfr_player_id);if(!g||!r||n(s.offense_snaps)<=0)continue;let p=g.players.get(r.gsis_id);if(!p){const hasPlays=g.plays.some(p=>[p.rusher_player_id,p.receiver_player_id,p.passer_player_id].includes(r.gsis_id));p={player_id:r.gsis_id,player_display_name:r.full_name,position:r.position,team:s.team,statsAvailable:!hasPlays};g.players.set(r.gsis_id,p);}p.snap_pct=number(s.offense_pct);p.offense_snaps=number(s.offense_snaps);}
  return games;
}
function aggregateSplits(plays,playerId){
 const box={},shell={};
 for(const p of plays){if(rushPlay(p)&&p.rusher_player_id===playerId){const count=number(p.defenders_in_box);if(count===null||count<1)continue;const key=count<=6?'light':count===7?'neutral':'stacked',b=box[key]??={bin:key,carries:0,yards:0,successes:0,tds:0};b.carries++;b.yards+=n(p.rushing_yards);b.successes+=n(p.epa)>0?1:0;b.tds+=n(p.rush_touchdown);}
 if(targetPlay(p)&&p.receiver_player_id===playerId){const key={COVER_1:'single_high',COVER_3:'single_high',COVER_2:'two_high',COVER_4:'two_high',COVER_6:'two_high',COVER_0:'zero'}[p.defense_coverage_type];if(!key)continue;const b=shell[key]??={shell:key,targets:0,yards:0,catches:0,tds:0};b.targets++;b.yards+=n(p.receiving_yards);b.catches+=n(p.complete_pass);b.tds+=n(p.pass_touchdown);}}
 return {box:Object.values(box).map(b=>({...b,ypc:ratio(b.yards,b.carries),success:ratio(b.successes,b.carries),td_rate:ratio(b.tds,b.carries)})),shell:Object.values(shell).map(b=>({...b,ypt:ratio(b.yards,b.targets),catch_rate:ratio(b.catches,b.targets),td_rate:ratio(b.tds,b.targets)}))};
}
export function buildPlayers({games,rosters,season,week,market,rates,trainingSeason,ngs={}}) {
 const eligibleGames=[...games.values()].filter(g=>g.complete&&(n(g.season)<season||n(g.season)===season&&n(g.week)<week)&&g.game_type!=='PRE').sort((a,b)=>b.gameday.localeCompare(a.gameday));
 const schedule=[...games.values()].filter(g=>n(g.season)===season&&n(g.week)===week&&g.game_type!=='PRE');
 const teamGame=new Map(schedule.flatMap(g=>[[g.home_team,g],[g.away_team,g]]));
 const candidates=new Map();
 for(const r of rosters.filter(r=>n(r.season)===season&&n(r.week)<=week&&r.gsis_id).sort((a,b)=>n(a.week)-n(b.week)))candidates.set(r.gsis_id,r);
 const players=[];
 for(const [id,r] of candidates){
  if(!['QB','RB','FB','WR','TE'].includes(r.position)||!teamGame.has(r.team)||r.status!=='ACT')continue;
  if(market.startsWith('pass_')&&r.position!=='QB')continue;
  const sample=eligibleGames.filter(g=>{const p=g.players.get(id);return p&&p.statsAvailable!==false&&(n(p.offense_snaps)>0||n(p.attempts)+n(p.carries)+n(p.targets)>0);}).slice(0,5);
  if(!sample.length)continue;
  const rows=sample.map(g=>g.players.get(id)),count=rows.length;
  const ngsRows=Object.fromEntries(['rushing','passing','receiving'].map(type=>[type,(ngs[type]||[]).filter(x=>x.player_gsis_id===id&&n(x.week)>0&&sample.some(g=>n(g.season)===n(x.season)&&n(g.week)===n(x.week)&&(g.game_type==='REG'?'REG':'POST')===x.season_type))]));
  const total=key=>sum(rows,key),per=key=>total(key)/count;
  if(['rush_yds','rush_attempts'].includes(market)&&total('carries')<1||['rec','rec_yds'].includes(market)&&total('targets')<1||market==='rush_rec_yds'&&total('carries')+total('targets')<1)continue;
  const game=teamGame.get(r.team),opponent=game.home_team===r.team?game.away_team:game.home_team;
  const relevant=sample.flatMap(g=>g.plays),rushes=relevant.filter(p=>rushPlay(p)&&p.rusher_player_id===id),targets=relevant.filter(p=>targetPlay(p)&&p.receiver_player_id===id),passes=relevant.filter(p=>passPlay(p)&&p.passer_player_id===id);
  const touches=[...rushes,...targets],rz=touches.filter(p=>number(p.yardline_100)!==null&&n(p.yardline_100)<=20),gl=rushes.filter(p=>number(p.yardline_100)!==null&&n(p.yardline_100)<=5);
  const teamTotals=sample.flatMap(g=>[...g.players.values()].filter(p=>p.team===g.players.get(id).team));
  const teamRz=sample.flatMap(g=>g.plays.filter(p=>p.posteam===g.players.get(id).team&&(rushPlay(p)||targetPlay(p))&&number(p.yardline_100)!==null&&n(p.yardline_100)<=20));
  const zones=[];for(const type of ['rush','pass'])for(const zone of ['goal_line','red_zone','fringe','open']){const plays=(type==='rush'?rushes:targets).filter(p=>zoneFor(number(p.yardline_100))===zone),rate=rates.zones[`${type}:${zone}`]?.rate;zones.push({zone,play_type:type,touches:plays.length,rate,expected:rate==null?null:plays.length*rate});}
  const expected=sum(zones,'expected'),actual=total('rushing_tds')+total('receiving_tds');
  const expectedRec=sum(targets,p=>rates.depths[depthFor(number(p.air_yards))]?.catchRate);
  const modeledPasses=passes.filter(p=>!n(p.qb_spike));
  const expectedYards=sum(modeledPasses,p=>rates.depths[depthFor(number(p.air_yards))]?.yardsPerAttempt);
  const expectedPassTD=sum(modeledPasses,p=>rates.zones['pass:'+zoneFor(number(p.yardline_100))]?.rate);
  const expectedRush=sum(rushes,p=>rates.rush[zoneFor(number(p.yardline_100))]?.ypc);
  const oppGames=eligibleGames.filter(g=>g.home_team===opponent||g.away_team===opponent).slice(0,5),allowed=oppGames.flatMap(g=>[...g.players.values()].filter(p=>p.team!==opponent)),oppN=oppGames.length;
  const allowedPos=allowed.filter(p=>p.position===r.position);
  const context=impliedPoints(game,r.team),targetShare=ratio(total('targets'),sum(teamTotals,'targets'));
  const ownTdPerTouch=ratio(actual,total('carries')+total('receptions'));
  const oppYpc=ratio(sum(allowed,'rushing_yards'),sum(allowed,'carries'));
  const opponentChart=oppGames.flatMap(g=>g.chart.filter(p=>p.defteam===opponent&&rushPlay(p)&&number(p.defenders_in_box)>0));
  const rzPasses=passes.filter(p=>number(p.yardline_100)!==null&&n(p.yardline_100)<=20),endzone=passes.filter(p=>number(p.air_yards)!==null&&number(p.yardline_100)!==null&&n(p.air_yards)>=n(p.yardline_100));
  const teamRzPlays=sample.flatMap(g=>g.plays.filter(p=>p.posteam===g.players.get(id).team&&number(p.yardline_100)!==null&&n(p.yardline_100)<=20&&(rushPlay(p)||passPlay(p))));
  let drought=0;for(const row of rows){if(n(row.rushing_tds)+n(row.receiving_tds)>0)break;drought++;}
  const statsByMarket={
   any_td:{touches_pg:per('carries')+per('receptions'),rz_touch_share:ratio(rz.length,teamRz.length),goal_line_carries_pg:gl.length/count,target_share_avg:targetShare,td_per_touch:ownTdPerTouch,games_since_td:drought,snap_pct_avg:mean(rows.map(p=>p.snap_pct).filter(Number.isFinite)),...context,opp_td_allowed_pg:ratio(sum(allowedPos,'rushing_tds')+sum(allowedPos,'receiving_tds'),oppN)},
   pass_yds:{attempts_pg:per('attempts'),pass_ypg:per('passing_yards'),ypa:ratio(total('passing_yards'),total('attempts')),adot:mean(passes.map(p=>number(p.air_yards)).filter(Number.isFinite)),air_volume:sum(passes,'air_yards')/count,sack_rate:ratio(total('sacks_suffered'),total('attempts')+total('sacks_suffered')),opp_pass_ypg_allowed:ratio(sum(allowed,'passing_yards'),oppN),opp_sack_rate_forced:ratio(sum(allowed,'sacks_suffered'),sum(allowed,'attempts')+sum(allowed,'sacks_suffered')),...context,yardage_debt:expectedYards-total('passing_yards')},
   pass_tds:{rz_attempts_pg:rzPasses.length/count,rz_pass_rate:ratio(teamRzPlays.filter(passPlay).length,teamRzPlays.length),pass_tds_pg:per('passing_tds'),end_zone_acc:ratio(sum(endzone,'complete_pass'),endzone.length),opp_pass_tds_allowed_pg:ratio(sum(allowed,'passing_tds'),oppN),...context,passtd_debt:expectedPassTD-total('passing_tds')},
   rush_yds:{carry_share:ratio(total('carries'),sum(teamTotals,'carries')),carries_pg:per('carries'),rush_ypg:per('rushing_yards'),ypc:ratio(total('rushing_yards'),total('carries')),explosive_pct:ratio(rushes.filter(p=>n(p.rushing_yards)>=10).length,rushes.length),stuff_avoid_pct:ratio(rushes.filter(p=>n(p.rushing_yards)>0).length,rushes.length),opp_light_box_rate:ratio(opponentChart.filter(p=>n(p.defenders_in_box)<=6).length,opponentChart.length),opp_charted_carries:opponentChart.length,opp_ypc_allowed:oppYpc,...context,rush_debt:expectedRush-sum(rushes,'rushing_yards')},
   rec:{target_share:targetShare,targets_pg:per('targets'),rec_pg:per('receptions'),catch_pct:ratio(total('receptions'),total('targets')),quick_share:ratio(targets.filter(p=>number(p.air_yards)!==null&&n(p.air_yards)<=5).length,targets.filter(p=>number(p.air_yards)!==null).length),opp_rec_allowed_pg:ratio(sum(allowedPos,'receptions'),oppN),opp_catch_rate_allowed:ratio(sum(allowedPos,'receptions'),sum(allowedPos,'targets')),...context,reception_debt:expectedRec-total('receptions')}
  };
  Object.assign(statsByMarket,{
   rush_attempts:{carries_pg:per('carries'),carry_share:ratio(total('carries'),sum(teamTotals,'carries')),opp_carries_allowed_pg:ratio(sum(allowed,'carries'),oppN),snap_pct_avg:mean(rows.map(p=>p.snap_pct).filter(Number.isFinite)),...context},
   rec_yds:{targets_pg:per('targets'),receiving_ypg:per('receiving_yards'),rec_pg:per('receptions'),yards_per_target:ratio(total('receiving_yards'),total('targets')),target_share:targetShare,opp_receiving_ypg_allowed:ratio(sum(allowedPos,'receiving_yards'),oppN),...context},
   pass_attempts:{attempts_pg:per('attempts'),pass_attempt_share:ratio(total('attempts'),sum(teamTotals,'attempts')),opp_pass_attempts_allowed_pg:ratio(sum(allowed,'attempts'),oppN),...context},
   pass_completions:{attempts_pg:per('attempts'),completions_pg:per('completions'),completion_pct:ratio(total('completions'),total('attempts')),opp_completions_allowed_pg:ratio(sum(allowed,'completions'),oppN),...context},
   pass_interceptions:{attempts_pg:per('attempts'),interceptions_pg:per('passing_interceptions'),interception_pct:ratio(total('passing_interceptions'),total('attempts')),opp_interceptions_pg:ratio(sum(allowed,'passing_interceptions'),oppN),...context},
   rush_rec_yds:{touches_pg:per('carries')+per('receptions'),rush_ypg:per('rushing_yards'),receiving_ypg:per('receiving_yards'),rush_rec_ypg:per('rushing_yards')+per('receiving_yards'),opp_rush_rec_ypg_allowed:ratio(sum(allowedPos,'rushing_yards')+sum(allowedPos,'receiving_yards'),oppN),...context}
  });
  const stats=statsByMarket[market],tdStats=statsByMarket.any_td;
  if(market==='rush_yds'){
   stats.rush_baseline_gap=stats.rush_debt;
   const published=ngsRows.rushing.filter(x=>number(x.rush_yards_over_expected)!==null);
   stats.rush_debt=published.length?-sum(published,'rush_yards_over_expected'):null;
   stats.ngs_rush_over_expected=published.length?sum(published,'rush_yards_over_expected'):null;
   stats.ngs_rush_games=published.length;
  }
  if(market==='pass_yds'){const x=ngsRows.passing.filter(x=>number(x.avg_time_to_throw)!==null);stats.ngs_time_to_throw=x.length?ratio(sum(x,r=>n(r.avg_time_to_throw)*n(r.attempts)),sum(x,'attempts')):null;}
  if(market==='rec'){const x=ngsRows.receiving.filter(x=>number(x.avg_separation)!==null);stats.ngs_separation=x.length?ratio(sum(x,r=>n(r.avg_separation)*n(r.targets)),sum(x,'targets')):null;}
  let components,baseline,opportunity,due=0;
  if(market==='any_td'){
   components={rz_role:score(tdStats.rz_touch_share,0.5),volume:score(tdStats.touches_pg,25),goal_line:score(gl.length/count,2),target_share:score(targetShare,0.35),td_rate:score(ownTdPerTouch,0.1),implied_total_score:score(context.implied_total,35),matchup_score:score(tdStats.opp_td_allowed_pg,1.5)};
   const weighted=(pairs)=>{const available=pairs.filter(([k])=>Number.isFinite(components[k]));return sum(available,([k,w])=>components[k]*w)/sum(available,([,w])=>w);};
   baseline=weighted([['rz_role',.35],['volume',.25],['goal_line',.15],['target_share',.15],['td_rate',.1]]);opportunity=weighted([['implied_total_score',.55],['matchup_score',.45]]);
   // A touchdown drought is descriptive; it is not evidence of a future score.
   due=0;
  }else{
   const config={pass_yds:[per('attempts'),40,per('passing_yards'),320,stats.opp_pass_ypg_allowed,300],pass_tds:[rzPasses.length/count,6,per('passing_tds'),3,stats.opp_pass_tds_allowed_pg,3],rush_yds:[per('carries'),25,per('rushing_yards'),120,oppYpc,6],rec:[per('targets'),12,per('receptions'),9,stats.opp_rec_allowed_pg,18],rush_attempts:[stats.carry_share,.75,per('carries'),25,stats.opp_carries_allowed_pg,32],rec_yds:[per('targets'),12,per('receiving_yards'),100,stats.opp_receiving_ypg_allowed,150],pass_attempts:[stats.pass_attempt_share,1,per('attempts'),40,stats.opp_pass_attempts_allowed_pg,40],pass_completions:[per('attempts'),40,per('completions'),30,stats.opp_completions_allowed_pg,28],pass_interceptions:[per('attempts'),40,per('passing_interceptions'),1.5,stats.opp_interceptions_pg,1.5],rush_rec_yds:[stats.touches_pg,25,stats.rush_rec_ypg,150,stats.opp_rush_rec_ypg_allowed,190]}[market];
   components={volume:score(config[0],config[1]),baseline:score(config[2],config[3]),matchup:score(config[4],config[5])};baseline=(components.volume*.5+components.baseline*.3)/.8;opportunity=components.matchup;
  }
  const modelScore=Number.isFinite(opportunity)?cap(baseline*(market==='any_td'?.6:.8)+opportunity*(market==='any_td'?.4:.2)+due):cap(baseline+due);
  const debt={any_td:expected-actual,pass_yds:stats.yardage_debt,pass_tds:stats.passtd_debt,rush_yds:stats.rush_debt,rec:stats.reception_debt}[market]??null;
  const chartPlays=sample.flatMap(g=>g.chart),splits=aggregateSplits(chartPlays,id),chartedGames=sample.filter(g=>g.chart.length).map(g=>g.game_id);
  const ngsExpected=ngsRows.rushing.filter(x=>number(x.expected_rush_yards)!==null);
  const projected={any_td:expected/count,pass_yds:expectedYards/count,pass_tds:expectedPassTD/count,rush_yds:ngsExpected.length?sum(ngsExpected,'expected_rush_yards')/ngsExpected.length:null,rec:expectedRec/count,rush_attempts:per('carries'),rec_yds:per('receiving_yards'),pass_attempts:per('attempts'),pass_completions:per('completions'),pass_interceptions:per('passing_interceptions'),rush_rec_yds:stats.rush_rec_ypg}[market];
  const threshold={any_td:1,pass_yds:30,pass_tds:1,rush_yds:25,rec:2}[market];
  const signatures={};signatures[market.toUpperCase()]=[...(debt>=threshold?['Opportunity above results']:[]),...(count<5?['Small sample']:[]),...(tdStats.rz_touch_share>=.3?['Strong red-zone role']:[])];
  const logs=sample.map(g=>{const p=g.players.get(id);return {gameId:g.game_id,date:g.gameday,season:n(g.season),week:n(g.week),team:p.team,opponent:g.home_team===p.team?g.away_team:g.home_team,attempts:n(p.attempts),completions:n(p.completions),passing_interceptions:n(p.passing_interceptions),special_teams_tds:n(p.special_teams_tds),passing_yards:n(p.passing_yards),passing_tds:n(p.passing_tds),carries:n(p.carries),rushing_yards:n(p.rushing_yards),rushing_tds:n(p.rushing_tds),targets:n(p.targets),receptions:n(p.receptions),receiving_yards:n(p.receiving_yards),receiving_tds:n(p.receiving_tds),snap_pct:p.snap_pct,boxscore:g.espn?`https://www.espn.com/nfl/boxscore/_/gameId/${g.espn}`:null};});
  players.push({gameId:game.game_id,result:actualResult(game,id,market),playerId:id,player:r.full_name,position:r.position,team:r.team,opponent,headshot:r.headshot_url,modelScore:rounded(modelScore),baselineScore:rounded(baseline),opportunityScore:rounded(opportunity),compositeScore:rounded(modelScore),dueBonus:due,tdProb:market==='any_td'?1-Math.exp(-expected/count):null,debt:rounded(debt),dueSignal:debt>=threshold||due>0,projected:rounded(projected),...explainPlayer({market,stats,components,modelScore,opponent,position:r.position,count,opponentCount:oppN}),signatures,details:{components,ngs:ngsRows,stats:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,rounded(v)])),cheat_code:{td_debt:{expected,actual,debt:expected-actual,zones},...splits},sample:logs,coverage:{chartedGames,chartNote:`FTN charting covers ${chartedGames.length} of these ${count} games. Uncharted games are excluded from splits; current-season free charting is published after the postseason.`,rosterWeek:n(r.week),rosterStatus:r.status},trainingSeason,opponentGames:oppGames.map(g=>g.game_id)}});
 }
 return players.sort((a,b)=>b.modelScore-a.modelScore).map((p,i)=>({...p,rank:i+1}));
}
