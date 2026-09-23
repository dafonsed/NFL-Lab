import { MLB_MARKETS, finite, statValue, shiftDate } from './markets.mjs';

export const MLB_MODEL_VERSION='mlb-count-regression-v1';
export const FEATURE_NAMES=['Long-term production rate','Recent rate change','Recent workload','Long-term workload','Home game','Days since previous appearance'];
export const BENCHMARKS={hr:[0.5],hits:[0.5,1.5],k:[3.5,4.5,5.5,6.5],tb:[0.5,1.5,2.5],rbi:[0.5,1.5],runs:[0.5],hrr:[1.5,2.5,3.5],sb:[0.5],singles:[0.5,1.5],doubles:[0.5],bb:[0.5],batter_k:[0.5,1.5],outs:[14.5,15.5,17.5],er:[1.5,2.5,3.5],hits_allowed:[3.5,4.5,5.5],walks_allowed:[0.5,1.5,2.5]};
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Training and serving use this exact function. Same-day games, previous seasons,
// relief outings, non-MLB and uncompleted games are excluded by the caller/core.
export function forecastInputs(rows,target,market,prior){
  const pitching=MLB_MARKETS[market].group==='pitching',exposureKey=pitching?'battersFaced':'plateAppearances';
  const minimum=pitching?4:8,limit=pitching?20:60,recentN=pitching?3:5;
  if(!(Number.isFinite(prior?.rate)&&prior.rate>0&&Number.isFinite(prior?.workload)&&prior.workload>0))return {available:false,count:0,minimum,reason:'Invalid fitted prior'};
  const first=shiftDate(target.date,-100);
  const sample=[...new Map(rows.filter(r=>r.date<target.date&&r.date>=first&&r.date.slice(0,4)===target.date.slice(0,4)&&r.role===MLB_MARKETS[market].group&&Number.isInteger(finite(r.stats?.[exposureKey]))&&finite(r.stats[exposureKey])>0&&(!pitching||Number(r.stats.gamesStarted)===1)&&statValue(r.stats,market)!==null).map(r=>[r.gameId,r])).values()].sort((a,b)=>b.date.localeCompare(a.date)||b.gameId-a.gameId).slice(0,limit);
  if(sample.length<minimum)return {available:false,count:sample.length,minimum};
  const recent=sample.slice(0,recentN),sum=(xs,fn)=>xs.reduce((a,r)=>a+fn(r),0),count=xs=>sum(xs,r=>statValue(r.stats,market)),exposure=xs=>sum(xs,r=>finite(r.stats[exposureKey]));
  const priorExposure=pitching?60:40;
  const longRate=(count(sample)+prior.rate*priorExposure)/(exposure(sample)+priorExposure);
  const recentRate=(count(recent)+prior.rate*priorExposure)/(exposure(recent)+priorExposure);
  const recentWorkload=exposure(recent)/recent.length,longWorkload=exposure(sample)/sample.length;
  const rest=clamp((Date.parse(target.date)-Date.parse(sample[0].date))/86400000,1,14);
  const x=[Math.log(longRate/prior.rate),Math.log(recentRate/longRate),Math.log(recentWorkload/prior.workload),Math.log(longWorkload/prior.workload),target.home?1:0,rest/7];
  const oldValues=sample.slice(0,pitching?8:20).map(r=>statValue(r.stats,market));
  return {available:true,x,count:sample.length,recentCount:recent.length,minimum,baseline:0.6*mean(oldValues)+0.4*mean(oldValues.slice(0,recentN)),values:{longRate,recentRate,recentWorkload,longWorkload,priorRate:prior.rate,priorExposure,observedTotal:count(sample),observedExposure:exposure(sample),restDays:rest,home:!!target.home,firstDate:sample.at(-1).date,lastDate:sample[0].date,exposureUnit:pitching?'batters faced':'plate appearances'},games:sample.map(r=>r.gameId)};
}
export function design(x,model){return [1,...x.map((v,i)=>(v-model.centers[i])/model.scales[i])];}
export function predictMean(input,model){const z=design(input.x,model);return Math.exp(clamp(z.reduce((a,v,i)=>a+v*model.coefficients[i],0),-9,Math.log(50)));}
function normalCdf(x){const sign=x<0?-1:1,t=1/(1+0.3275911*Math.abs(x)/Math.SQRT2);const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x/2);return (1+sign*erf)/2;}
export function countDistribution(mu,dispersion={family:'poisson'}){
  if(!Number.isFinite(mu)||mu<0)throw Error('Invalid expected count');
  const pmf=[],alpha=dispersion.alpha||0;
  if(dispersion.family==='normal'){
    const sd=Math.sqrt(Math.max(0.05,(dispersion.factor||1)*mu));
    for(let k=0;k<=200;k++)pmf.push(normalCdf((k+0.5-mu)/sd)-(k?normalCdf((k-0.5-mu)/sd):0));
  }else{
    pmf[0]=alpha>0?Math.pow(1+alpha*mu,-1/alpha):Math.exp(-mu);
    for(let k=1;k<=200;k++)pmf[k]=pmf[k-1]*(alpha>0?(k-1+1/alpha)/k*(alpha*mu/(1+alpha*mu)):mu/k);
  }
  const total=pmf.reduce((a,b)=>a+b,0);return pmf.map(v=>v/total);
}
export function lineProbabilities(pmf,line){
  if(!Number.isFinite(line)||line<0)return null;
  let over=0,under=0,push=0;pmf.forEach((p,k)=>{if(k>line)over+=p;else if(k<line)under+=p;else push+=p;});
  return {over,under,push};
}
export function predictionInterval(pmf){let sum=0,lo=null,hi=null;pmf.forEach((p,k)=>{sum+=p;if(lo===null&&sum>=0.1)lo=k;if(hi===null&&sum>=0.9)hi=k;});return [lo,hi];}

// Newton / IRLS minimizes Poisson negative log likelihood with an L2 penalty.
// The intercept is not penalized. No selected game's outcome is an input.
export function fitPoisson(rows,lambda){
  const width=FEATURE_NAMES.length,centers=Array(width).fill(0),scales=Array(width).fill(0);
  for(const r of rows)r.x.forEach((v,i)=>centers[i]+=v/rows.length);
  for(const r of rows)r.x.forEach((v,i)=>scales[i]+=(v-centers[i])**2/rows.length);
  scales.forEach((v,i)=>scales[i]=Math.max(0.01,Math.sqrt(v)));
  const model={centers,scales,coefficients:[Math.log(Math.max(0.001,mean(rows.map(r=>r.y)))),...Array(width).fill(0)],lambda};
  const matrix=rows.map(r=>design(r.x,model)),n=width+1;
  for(let iteration=0;iteration<30;iteration++){
    const gradient=Array(n).fill(0),hessian=Array.from({length:n},()=>Array(n).fill(0));
    rows.forEach((r,index)=>{const x=matrix[index],mu=Math.exp(clamp(x.reduce((s,v,j)=>s+v*model.coefficients[j],0),-15,8));
      for(let j=0;j<n;j++){gradient[j]+=(mu-r.y)*x[j]/rows.length;for(let k=0;k<=j;k++)hessian[j][k]+=mu*x[j]*x[k]/rows.length;}
    });
    for(let j=0;j<n;j++){for(let k=0;k<j;k++)hessian[k][j]=hessian[j][k];hessian[j][j]+=j?lambda:1e-8;if(j)gradient[j]+=lambda*model.coefficients[j];}
    const delta=solve(hessian,gradient),step=Math.min(1,1/Math.max(1,...delta.map(Math.abs)));
    model.coefficients=model.coefficients.map((v,j)=>v-step*delta[j]);
    if(Math.max(...delta.map(Math.abs))*step<1e-6)break;
  }
  return model;
}
function solve(matrix,vector){const n=vector.length,a=matrix.map((r,i)=>[...r,vector[i]]);for(let j=0;j<n;j++){let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;[a[j],a[pivot]]=[a[pivot],a[j]];const d=a[j][j];if(Math.abs(d)<1e-12)throw Error('Singular model');for(let k=j;k<=n;k++)a[j][k]/=d;for(let i=0;i<n;i++)if(i!==j){const f=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=f*a[j][k];}}return a.map(r=>r[n]);}
