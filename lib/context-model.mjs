// The same residual correction is used in training and serving. Coefficients
// are learned from earlier seasons, never assigned as subjective percentages.
export const CONTEXT_FEATURES=['Opponent production rate','Outdoor temperature','Outdoor wind'];
export const numeric=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))?Number(x):null;
export function weatherFeatures(weather){
  if(weather?.status!=='available'||weather.indoor||weather.stale)return [0,0];
  const temperature=numeric(weather.temperatureF),wind=numeric(weather.windMph);
  return [temperature===null?0:(temperature-65)/20,wind===null||wind<0?0:wind/10];
}
export function contextVector(opponent,weather){return [opponent?.available&&!opponent.stale&&numeric(opponent.rate)!==null&&opponent.rate>=0&&numeric(opponent.leagueRate)>0?opponent.rate/opponent.leagueRate-1:0,...weatherFeatures(weather)];}
export function adjustedPoint(base,x,model,maximum=Infinity){
  if(!model)return base;
  const delta=x.reduce((n,v,i)=>n+v*model.coefficients[i],0)*Math.max(1,base);
  return Math.max(0.00001,Math.min(maximum,base+delta));
}
export function fitContext(rows,lambda){
  const n=3,a=Array.from({length:n},()=>Array(n+1).fill(0));
  for(const r of rows){const residual=(r.y-r.base)/Math.max(1,r.base);for(let i=0;i<n;i++){a[i][n]+=r.x[i]*residual/rows.length;for(let j=0;j<n;j++)a[i][j]+=r.x[i]*r.x[j]/rows.length;}}
  for(let i=0;i<n;i++)a[i][i]+=lambda;
  for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[p],a[i]]=[a[i],a[p]];const d=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=d;for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=f*a[i][k];}}
  return {coefficients:a.map(r=>r[n]),lambda};
}
export function contextEvidence(base,point,opponent,weather,model){
  const x=contextVector(opponent,weather),scale=Math.max(1,base);
  const warnings=[];
  if(opponent?.available&&(opponent.stale||numeric(opponent.rate)===null||opponent.rate<0||!(numeric(opponent.leagueRate)>0)))warnings.push('Opponent context is invalid or stale; its adjustment is withheld.');
  if(weather?.status==='available'&&!weather.indoor&&(weather.stale||numeric(weather.temperatureF)===null||numeric(weather.windMph)===null||weather.windMph<0))warnings.push('Outdoor weather inputs are missing, invalid or stale; affected adjustments are withheld.');
  return {enabled:!!model?.enabled,basePoint:base,adjustedPoint:point,opponent,weather,warnings,adjustments:CONTEXT_FEATURES.map((feature,i)=>({feature,input:x[i],coefficient:model?.coefficients[i]??0,change:model?.enabled?x[i]*(model?.coefficients[i]??0)*scale:0,shadowChange:x[i]*(model?.coefficients[i]??0)*scale})),note:model?.enabled?'Correction passed 2024 MAE and MSE checks. Missing inputs contribute zero; availability is handled separately.':'Context correction is in shadow evaluation: it did not pass both 2024 error checks, so the base projection is retained.'};
}
