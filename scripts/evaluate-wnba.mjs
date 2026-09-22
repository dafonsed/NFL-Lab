// Frozen chronological development/holdout split. No historical lineup or
// injury hindsight; no sportsbook lines are fabricated from final statistics.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SPORTS } from '../lib/sports/config.mjs';
import { predict,value,historyBefore } from '../lib/sports/model.mjs';
const data=JSON.parse(await fs.readFile('data-independent/wnba/2025.json','utf8'));
const history=data.games.sort((a,b)=>a.game.date.localeCompare(b.game.date));
const cutoff='2025-08-15T00:00:00Z',mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function matchedHistory(target){const past=historyBefore(history,target.game),ids=new Set();for(const team of target.teams)for(const h of past.filter(h=>h.teams.some(t=>t.id===team.id)).slice(0,25))ids.add(h.game.id);return past.filter(h=>ids.has(h.game.id));}
const contexts=history.map(target=>({target,history:matchedHistory(target)}));
function measure(rows,key){return {n:rows.length,games:new Set(rows.map(r=>r.gameId)).size,mae:mean(rows.map(r=>Math.abs(r[key].point-r.actual))),baselineMAE:mean(rows.map(r=>Math.abs(r.baseline-r.actual))),brier:mean(rows.map(r=>(r[key].probability-Number(r.over))**2)),intervalCoverage:mean(rows.map(r=>Number(r.actual>=r[key].interval[0]&&r.actual<=r[key].interval[1]))),bias:mean(rows.map(r=>r[key].point-r.actual))};}
const report={version:'wnba-opportunities-v1',status:'experimental',generatedAt:new Date().toISOString(),developmentThrough:'2025-08-14',holdoutFrom:'2025-08-15',season:2025,games:history.length,method:'WNBA-only rolling predictions. Up to 25 previous games per matchup team, up to 20 player appearances; each target uses only earlier results. Shot candidates selected on dates before August 15, then frozen for the later holdout. Current injuries, final starting lineups and target-game results never enter predictions.',markets:{},limitations:['Corrected historical box scores, not archived pregame inputs.','Lineup, teammate-absence and roster-minute-budget scenarios need prospective validation.','Fixed research thresholds, not historical sportsbook lines or profitability.','Missing or stale feeds are disclosed. Matchup-specific priors are not league-wide tracking data.'],sources:data.sources};
const details=[];
for(const [market,config] of Object.entries(SPORTS.wnba.markets)){
 const rows=[];
 for(const {target,history:past} of contexts)for(const p of target.players.filter(p=>p.minutes>0)){
  const actual=value(p.stats,config);if(actual===null)continue;
  const x={sport:'wnba',market,player:{...p,starter:false,lineupConfirmed:false,availability:undefined},target:target.game,history:past,validation:true,evaluateCandidates:true};
  const base=predict({...x,upgrades:false});if(base.point===null)continue;
  const candidate=['points','threes'].includes(market)?predict(x):base;
  const compact=f=>({point:f.point,probability:f.benchmark.probability.over,interval:f.interval});
  rows.push({gameId:target.game.id,date:target.game.date,playerId:p.id,actual,baseline:base.baseline,over:actual>config.benchmark,base:compact(base),candidate:compact(candidate)});
 }
 const development=rows.filter(r=>r.date<cutoff),holdout=rows.filter(r=>r.date>=cutoff),baseDev=measure(development,'base'),candidateDev=measure(development,'candidate');
 const enabled=['points','threes'].includes(market)&&baseDev.n>=200&&candidateDev.mae<baseDev.mae&&candidateDev.brier<baseDev.brier;
 const shot={enabled,n:baseDev.n,baselineMAE:baseDev.mae,candidateMAE:candidateDev.mae,baselineBrier:baseDev.brier,candidateBrier:candidateDev.brier,selectedThrough:report.developmentThrough};
 const evaluation=measure(holdout,enabled?'candidate':'base');
 report.markets[market]={label:config.label,threshold:config.benchmark,shot,development:enabled?candidateDev:baseDev,holdout:evaluation};
 details.push(...holdout.map(r=>({market,...r,selected:enabled?'candidate':'base'})));
 console.log(JSON.stringify({market,shotEnabled:enabled,...evaluation}));
}
report.sourceManifestHash=createHash('sha256').update(JSON.stringify(report.sources)).digest('hex');
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/wnba-evaluation.json',JSON.stringify({...report,rows:details},null,2));
// Review the resulting diagnostic before shipping. Evaluation never triggers bets.
await fs.writeFile('lib/artifacts/wnba-validation.json',JSON.stringify(report,null,2)+'\n');
