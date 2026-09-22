// Reconstruct strictly chronological predictions from already downloaded ESPN
// box scores. No network, injury/lineup hindsight, or fabricated sportsbook lines.
import fs from 'node:fs/promises';
import { normalizeSummary } from '../lib/sports/normalize.mjs';
import { SPORTS } from '../lib/sports/config.mjs';
import { predict,value } from '../lib/sports/model.mjs';
const histories={nba:new Map(),nhl:new Map(),soccer:new Map()},sources=[];
for(const dir of ['data-independent/mlb/sports/raw','data-independent/mlb/raw']){
 let files=[];try{files=await fs.readdir(dir);}catch{continue;}
 for(const file of files){if(!file.endsWith('.json'))continue;let d;try{d=JSON.parse(await fs.readFile(dir+'/'+file,'utf8'));}catch{continue;}
  if(!d.url?.includes('/summary?event='))continue;
  const sport=d.url.includes('/basketball/nba/')?'nba':d.url.includes('/hockey/nhl/')?'nhl':d.url.includes('/soccer/')?'soccer':null;
  if(!sport)continue;const h=normalizeSummary(d.payload,sport);
  if(!h.game.complete||h.game.extraTime||!h.players.length||!h.game.date)continue;
  const prior=histories[sport].get(h.game.id);if(prior)continue;
  histories[sport].set(h.game.id,h);sources.push({url:d.url,sha256:d.sha256});
 }
}
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null,report={generatedAt:new Date().toISOString(),limitations:['Convenience sample of cached games; not league-wide or an untouched holdout.','Corrected historical data, not frozen pregame feeds. Current injuries and actual target-game starter status are excluded.','This comparison isolates the shot/attempt decomposition, not pregame lineup or injury effects. No profitability claim.'],sports:{},sources};
for(const [sport,items] of Object.entries(histories)){
 const history=[...items.values()].sort((a,b)=>a.game.date.localeCompare(b.game.date)),markets=sport==='nba'?['points','threes']:['goals'];report.sports[sport]={games:history.length,markets:{}};
 for(const market of markets){const m=SPORTS[sport].markets[market],results=[];
  for(const target of history)for(const p of target.players.filter(p=>p.minutes>0&&(sport==='nba'||!['G','GK'].includes(p.position)))){
   const actual=value(p.stats,m);if(actual===null)continue;
   const x={sport,market,player:{...p,starter:false,lineupConfirmed:false},target:target.game,history,validation:true,evaluateCandidates:true};
   const candidate=predict(x),base=predict({...x,upgrades:false});if(base.point===null||candidate.point===null)continue;
   results.push({base:base.point,candidate:candidate.point,actual,baseBrier:(base.benchmark.probability.over-Number(actual>m.benchmark))**2,candidateBrier:(candidate.benchmark.probability.over-Number(actual>m.benchmark))**2,changed:Math.abs(base.point-candidate.point)>1e-6});
  }
  const metrics={n:results.length,changed:results.filter(r=>r.changed).length,baselineMAE:mean(results.map(r=>Math.abs(r.base-r.actual))),candidateMAE:mean(results.map(r=>Math.abs(r.candidate-r.actual))),baselineBrier:mean(results.map(r=>r.baseBrier)),candidateBrier:mean(results.map(r=>r.candidateBrier))};report.sports[sport].markets[market]=metrics;console.log(JSON.stringify({sport,market,...metrics}));
 }
}
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/opportunity-evaluation.json',JSON.stringify(report,null,2));
