import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Provider } from '../lib/providers.mjs';
import { MARKETS } from '../lib/markets.mjs';
import { FORECAST_VERSION, RULES, project, priorSample, targetValue, distribution } from '../lib/forecast.mjs';

// Split and formulas are declared before loading outcomes. Do not tune on 2025.
const provider=new Provider(), schedule=await provider.load('schedule');
const seasons=[2022,2023,2024,2025];
const datasets=await Promise.all(seasons.map(y=>provider.load('weekly',y)));
const games=new Map(schedule.rows.map(g=>[g.game_id,g]));
const rows=datasets.flatMap(d=>d.rows).filter(r=>['QB','RB','FB','WR','TE'].includes(r.position)&&r.season_type!=='PRE')
  .map(r=>({...r,date:games.get(r.game_id)?.gameday})).filter(r=>r.date)
  .sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week));
const variants=['average','workloadOnly','efficiencyOnly','candidate'], pools=Object.fromEntries(variants.map(v=>[v,{}]));
const histories=new Map(), report={};
for(const row of rows){
  const history=histories.get(row.player_id)||[], sample=priorSample(history,row);
  if(sample.length>=5&&Number(row.season)>=2023){
    for(const market of MARKETS){
      if(market.startsWith('pass_')&&row.position!=='QB')continue;
      if(['rush_yds','rush_attempts'].includes(market)&&!sample.slice(0,5).some(r=>Number(r.carries)>0))continue;
      if(['rec','rec_yds'].includes(market)&&!sample.slice(0,5).some(r=>Number(r.targets)>0))continue;
      if(market==='rush_rec_yds'&&!sample.slice(0,5).some(r=>Number(r.carries)+Number(r.targets)>0))continue;
      const actual=market==='any_td'?Number(targetValue(row,market)>0):targetValue(row,market), key=`${market}:${row.position}`;
      for(const variant of variants){
        const p=project(sample,market,variant).point;
        if(Number(row.season)===2023)(pools[variant][key]??=[]).push([p,actual]);
        else {
          const metrics=((report[row.season]??={})[market]??={})[variant]??={n:0,absoluteError:0,squaredError:0,brierSum:0,probabilityN:0,covered:0,intervalN:0};
          metrics.n++;metrics.absoluteError+=Math.abs(p-actual);metrics.squaredError+=(p-actual)**2;
          const d=distribution(p,market,row.position,{pools},variant);
          if(d&&d.count>=RULES.minErrors&&d.local){
            if(market==='any_td'){metrics.brierSum+=(d.probability-actual)**2;metrics.probabilityN++;}
            else {metrics.intervalN++;metrics.covered+=actual>=d.interval[0]&&actual<=d.interval[1]?1:0;}
          }
        }
      }
    }
  }
  history.push(row);histories.set(row.player_id,history.slice(-12));
}
const rnd=x=>Math.round(x*10000)/10000;
for(const season of Object.values(report))for(const market of Object.values(season))for(const [v,m]of Object.entries(market))market[v]={n:m.n,mae:rnd(m.absoluteError/m.n),rmse:rnd(Math.sqrt(m.squaredError/m.n)),brier:m.probabilityN?rnd(m.brierSum/m.probabilityN):null,probabilityN:m.probabilityN,intervalCoverage:m.intervalN?rnd(m.covered/m.intervalN):null,intervalN:m.intervalN};
const artifact={version:FORECAST_VERSION,trainingSeason:2023,rules:RULES,pools};
artifact.id=createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
const evaluation={version:FORECAST_VERSION,artifactId:artifact.id,generatedAt:new Date().toISOString(),split:{warmup:2022,training:2023,validation:2024,holdout:2025},report,sources:datasets.map(d=>({url:d.meta.url,sha256:d.meta.sha256,fetchedAt:d.meta.fetchedAt})),limitations:[
 'Historical reconstruction uses corrected weekly statistics available today, not an archive of what was published before each kickoff.',
 'Only appearances with a published weekly stat row and at least five earlier rows are evaluated. DNPs, snap-only appearances and missing historical props are not fabricated.',
 'No archived sportsbook lines were used here. Yardage/count results are projection errors and interval coverage, not betting hit rates or profitability.',
 'The original 0–100 rating has no equivalent outcome unit. It remains unchanged and is saved alongside each future prediction for prospective comparison.',
 'Workload-only and efficiency-only ablations isolate each change; the combined candidate stays experimental regardless of this report.',
 'Anytime TD tests use weekly rushing, receiving and special-teams touchdowns. Rare fumble-recovery touchdowns may be absent from these weekly fields.'
]};
await fs.mkdir('lib/artifacts',{recursive:true});
await fs.writeFile('lib/artifacts/nfl-forecast.json',JSON.stringify(artifact));
await fs.writeFile('lib/artifacts/nfl-evaluation.json',JSON.stringify(evaluation,null,2));
console.log(JSON.stringify({artifactId:artifact.id,holdout:Object.fromEntries(Object.entries(report[2025]).map(([k,v])=>[k,{n:v.candidate.n,averageMAE:v.average.mae,candidateMAE:v.candidate.mae,brier:v.candidate.brier,coverage:v.candidate.intervalCoverage}]))},null,2));
