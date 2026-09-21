import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MLB_MARKETS, statValue } from '../lib/mlb/markets.mjs';
import { MLB_MODEL_VERSION, FEATURE_NAMES, BENCHMARKS, forecastInputs, fitPoisson, predictMean, countDistribution, lineProbabilities, predictionInterval } from '../lib/mlb/forecast-core.mjs';

// Declare the split and candidate grid BEFORE inspecting holdout outcomes.
const split={leaguePriors:2022,training:2023,selectionAndDispersion:2024,untouchedTest:2025};
const lambdas=[0.0001,0.001,0.01];
const seasons=await Promise.all([2022,2023,2024,2025].map(async y=>JSON.parse(await fs.readFile(`data-independent/mlb-training/${y}.json`,'utf8'))));
const round=n=>Number.isFinite(n)?Math.round(n*1000000)/1000000:null;
const artifact={version:MLB_MODEL_VERSION,trainedThrough:'2024-12-31',generatedAt:new Date().toISOString(),split,features:FEATURE_NAMES,models:{},report:{},sources:seasons.flatMap(s=>s.sources),dataset:seasons.map(s=>({season:s.season,games:s.gameCount,players:s.playerCount,playerGames:s.rows.length})),limitations:[
  'Retrospective reconstruction from official corrected MLB game logs available at download time; not frozen predictions made in 2025.',
  'Only regular-season appearances with a plate appearance, and actual pitcher starts, are tested. At least 8 prior batter appearances or 4 prior starts in the same season and preceding 100 days are required.',
  '2023 fits the coefficients. 2024 selects regularization and estimates the count distribution. All choices are frozen before scoring 2025.',
  'Brier scores use the listed fixed thresholds, not historical sportsbook lines. These are probability checks, not betting returns or a promised win rate.',
  'No batting-order, handedness matchup, opposing pitcher, defense, park, weather, injury or Statcast adjustment is included in v1. Home/away is the only game-context feature.',
  'Forecasts assume a comparable appearance/start to the player history. Unconfirmed lineups, bench players, small samples and stale inputs are explicitly flagged.',
  'The live model is frozen at this version; player inputs refresh automatically. Retraining requires rerunning the documented historical evaluation.'
]};
const nll=(rows,model)=>rows.reduce((s,r)=>{const mu=predictMean(r,model);return s+mu-r.y*Math.log(mu);},0)/rows.length;
for(const [market,config] of Object.entries(MLB_MARKETS)){
  const exposure=config.group==='pitching'?'battersFaced':'plateAppearances';
  const base=seasons[0].rows.filter(r=>r.role===config.group&&Number(r.stats[exposure])>0&&statValue(r.stats,market)!==null);
  const prior={rate:base.reduce((a,r)=>a+statValue(r.stats,market),0)/base.reduce((a,r)=>a+Number(r.stats[exposure]),0),workload:base.reduce((a,r)=>a+Number(r.stats[exposure]),0)/base.length};
  const datasets={};
  for(const season of seasons.slice(1)){
    const history=new Map(),rows=[];
    for(const r of season.rows.filter(r=>r.role===config.group)){
      const past=history.get(r.playerId)||[],input=forecastInputs(past,r,market,prior),y=statValue(r.stats,market);
      if(input.available&&y!==null)rows.push({x:input.x,y,baseline:input.baseline});
      past.push(r);history.set(r.playerId,past.slice(-65));
    }
    datasets[season.season]=rows;
  }
  const train=datasets[2023],validation=datasets[2024],test=datasets[2025];
  if(train.length<1000||validation.length<1000||test.length<1000)throw Error(`Insufficient complete data for ${market}`);
  const candidates=lambdas.map(lambda=>{const model=fitPoisson(train,lambda);return {model,validationNll:nll(validation,model)};}).sort((a,b)=>a.validationNll-b.validationNll);
  const chosen=candidates[0].model;
  const predictions=validation.map(r=>({y:r.y,mu:predictMean(r,chosen)}));
  const alpha=Math.max(0,predictions.reduce((s,r)=>s+(r.y-r.mu)**2-r.y,0)/predictions.reduce((s,r)=>s+r.mu*r.mu,0));
  const factor=predictions.reduce((s,r)=>s+(r.y-r.mu)**2/Math.max(0.05,r.mu),0)/predictions.length;
  const families=[{family:'poisson'},...(alpha>0?[{family:'negative-binomial',alpha}]:[]),...(market==='outs'?[{family:'normal',factor}]:[])];
  const distributionScores=families.map(d=>({d,loss:predictions.reduce((s,r)=>s-Math.log(Math.max(1e-12,countDistribution(r.mu,d)[r.y]||0)),0)/predictions.length})).sort((a,b)=>a.loss-b.loss);
  const model={...chosen,prior,dispersion:distributionScores[0].d,trainN:train.length,validationN:validation.length};
  artifact.models[market]=model;
  const rates=Object.fromEntries(BENCHMARKS[market].map(line=>[line,train.filter(r=>r.y>line).length/train.length]));
  function evaluate(rows){
    const benchmarks=Object.fromEntries(BENCHMARKS[market].map(line=>[line,{n:0,model:0,formPoisson:0,leagueRate:0}]));
    const calibration=Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,n:0,predictedSum:0,observedSum:0}));
    let ae=0,se=0,oldAe=0,oldSe=0,covered=0,width=0;
    for(const r of rows){
      const mu=predictMean(r,model),pmf=countDistribution(mu,model.dispersion),baselinePmf=countDistribution(Math.max(0.0001,r.baseline)),interval=predictionInterval(pmf);
      ae+=Math.abs(mu-r.y);se+=(mu-r.y)**2;oldAe+=Math.abs(r.baseline-r.y);oldSe+=(r.baseline-r.y)**2;covered+=r.y>=interval[0]&&r.y<=interval[1]?1:0;width+=interval[1]-interval[0];
      for(const line of BENCHMARKS[market]){
        const p=lineProbabilities(pmf,line).over,q=lineProbabilities(baselinePmf,line).over,actual=Number(r.y>line),v=benchmarks[line];
        v.n++;v.model+=(p-actual)**2;v.formPoisson+=(q-actual)**2;v.leagueRate+=(rates[line]-actual)**2;
        const bin=calibration[Math.min(9,Math.floor(p*10))];bin.n++;bin.predictedSum+=p;bin.observedSum+=actual;
      }
    }
    return {n:rows.length,mae:round(ae/rows.length),rmse:round(Math.sqrt(se/rows.length)),oldFormMae:round(oldAe/rows.length),oldFormRmse:round(Math.sqrt(oldSe/rows.length)),maeImprovementPercent:round((oldAe-ae)/oldAe*100),intervalCoverage:round(covered/rows.length),intervalAverageWidth:round(width/rows.length),benchmarks:Object.fromEntries(Object.entries(benchmarks).map(([line,m])=>[line,{n:m.n,modelBrier:round(m.model/m.n),formPoissonBrier:round(m.formPoisson/m.n),leagueRateBrier:round(m.leagueRate/m.n)}])),calibration:calibration.map(b=>({from:b.from,to:b.to,n:b.n,predicted:b.n?round(b.predictedSum/b.n):null,observed:b.n?round(b.observedSum/b.n):null}))};
  }
  artifact.report[market]={label:config.label,unit:config.unit,selectedLambda:chosen.lambda,distribution:model.dispersion,selection:candidates.map(c=>({lambda:c.model.lambda,nll:round(c.validationNll)})),validation:evaluate(validation),holdout:evaluate(test)};
  console.log(JSON.stringify({market,n:test.length,distribution:model.dispersion,...Object.fromEntries(Object.entries(artifact.report[market].holdout).filter(([k])=>['mae','oldFormMae','maeImprovementPercent'].includes(k)))}));
}
artifact.id=createHash('sha256').update(JSON.stringify({version:artifact.version,models:artifact.models,sourceHashes:artifact.sources.map(s=>s.sha256)})).digest('hex');
await fs.writeFile('lib/artifacts/mlb-model.json',JSON.stringify(artifact));
console.log(`Saved model ${artifact.id}`);
