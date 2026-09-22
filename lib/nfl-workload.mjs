const channels=['attempts','carries','targets'];
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const num=x=>Number.isFinite(Number(x))?Number(x):0;
function rowsFrom(games){
 return games.filter(g=>g.complete&&g.game_type!=='PRE').flatMap(g=>[g.home_team,g.away_team].map(team=>{
  const players=[...g.players.values()].filter(p=>p.team===team&&p.statsAvailable!==false);
  const totals=Object.fromEntries(channels.map(k=>[k,players.reduce((s,p)=>s+num(p[k]),0)]));
  return {date:g.gameday,gameId:g.game_id,team,opponent:team===g.home_team?g.away_team:g.home_team,...totals};
 })).filter(r=>r.attempts>=5&&r.carries>=5&&r.targets>0).sort((a,b)=>a.date.localeCompare(b.date));
}
function inputs(rows,target,channel){
 const past=rows.filter(r=>r.date<target.date&&Date.parse(target.date)-Date.parse(r.date)<450*86400000),own=past.filter(r=>r.team===target.team).slice(-5),allowed=past.filter(r=>r.opponent===target.opponent).slice(-5);
 if(own.length<5||allowed.length<5)return null;
 const baseline=mean(own.map(r=>r[channel])),league=mean(past.map(r=>r[channel])),opponent=mean(allowed.map(r=>r[channel]));
 return {baseline,opponent,league,ratio:league>0?opponent/league:1,games:[...own,...allowed].map(r=>r.gameId)};
}
const estimate=(x,w)=>x.baseline*clamp(Math.pow(x.ratio,w),.8,1.2);
const metrics=(rows,w)=>({mae:mean(rows.map(r=>Math.abs(estimate(r.x,w)-r.y))),mse:mean(rows.map(r=>(estimate(r.x,w)-r.y)**2))});
export function fitTeamWorkload(games){
 const rows=rowsFrom(games),models={};
 for(const channel of channels){
  const examples=rows.flatMap(r=>{const x=inputs(rows,r,channel);return x?[{x,y:r[channel],date:r.date}]:[];});
  // Split by calendar date, keeping both teams from a game on the same side.
  const dates=[...new Set(examples.map(r=>r.date))],cutoff=dates[Math.floor(dates.length*.7)];
  const train=examples.filter(r=>r.date<cutoff),validation=examples.filter(r=>r.date>=cutoff);
  const weight=train.length>=100?[0,.25,.5,.75,1].sort((a,b)=>metrics(train,a).mse-metrics(train,b).mse)[0]:0;
  const baseline=metrics(validation,0),candidate=metrics(validation,weight),enabled=validation.length>=64&&weight>0&&candidate.mae<baseline.mae&&candidate.mse<baseline.mse;
  models[channel]={weight,enabled,trainCount:train.length,validationCount:validation.length,cutoff,baseline,candidate};
 }
 return {version:'nfl-team-workload-v1',rows,models};
}
export function teamWorkload(model,target){
 return Object.fromEntries(channels.map(channel=>{
  const x=inputs(model.rows,target,channel),fit=model.models[channel];
  return [channel,{...fit,...x,available:!!x,point:x?estimate(x,fit.enabled?fit.weight:0):null,shadowPoint:x?estimate(x,fit.weight):null}];
 }));
}
export function workloadDeltas(sample,workload,market){
 const relevant=market.startsWith('pass_')?['attempts']:market==='rush_rec_yds'||market==='any_td'?['carries','targets']:market.startsWith('rush_')?['carries']:['targets'];
 const deltas={},effects=[];
 for(const channel of relevant){
  const x=workload?.[channel],recent=sample.slice(0,3),baseline=mean(recent.map(r=>num(r[channel]))),teamVolume=recent.map(r=>r.teamOpportunities?.[channel]);
  const usable=teamVolume.length===3&&teamVolume.every(v=>Number.isFinite(v)&&v>0)&&baseline>0;
  const active=x?.available&&usable,denominator=usable?mean(teamVolume):null,factor=active?clamp(x.point/denominator,.8,1.2):1;
  deltas[channel]=baseline*(factor-1);
  effects.push({label:`Team ${channel} → player workload`,status:active?(Math.abs(factor-1)>1e-6?'applied':'unchanged'):'unavailable',factor,before:baseline,after:baseline*factor,unit:channel,experimental:true,
   note:active?'Player recent share × projected team opportunities. Team matchup weight is learned on earlier games and used only when a later validation block improves both MAE and MSE. Player effect capped at ±20%.':'Needs five prior team/opponent games and three matched player/team appearances.',
   teamProjection:x?.point??null,recentTeamVolume:denominator,opponentAdjustment:x?.enabled?'enabled':'validation_disabled',weight:x?.enabled?x.weight:0,validation:x?{n:x.validationCount,baseline:x.baseline,candidate:x.candidate}:null,games:x?.games||[]});
 }
 return {deltas,effects};
}
