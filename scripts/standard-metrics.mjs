// Paired descriptive evaluation; this module never fits model parameters.
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
const round=n=>Number.isFinite(n)?Math.round(n*1e6)/1e6:null;
export function metrics(rows,key){
  const valid=rows.filter(r=>Number.isFinite(r[key]?.point)&&Number.isFinite(r.actual));
  const probabilities=valid.filter(r=>Number.isFinite(r[key]?.probability)&&r.event!==null&&r.event!==undefined);
  const bins=Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,n:0,predicted:0,observed:0}));
  for(const r of probabilities){const p=r[key].probability,b=bins[Math.min(9,Math.floor(p*10))];b.n++;b.predicted+=p;b.observed+=Number(r.event);}
  return {n:valid.length,mae:round(mean(valid.map(r=>Math.abs(r[key].point-r.actual)))),rmse:round(Math.sqrt(mean(valid.map(r=>(r[key].point-r.actual)**2))??NaN)),probabilityN:probabilities.length,brier:round(mean(probabilities.map(r=>(r[key].probability-Number(r.event))**2))),logLoss:round(mean(probabilities.map(r=>{const p=Math.max(1e-6,Math.min(1-1e-6,r[key].probability));return -(r.event?Math.log(p):Math.log(1-p));}))),calibration:bins.map(b=>({...b,predicted:b.n?round(b.predicted/b.n):null,observed:b.n?round(b.observed/b.n):null}))};
}
export function pairedReport(rows){
  const paired=rows.filter(r=>Number.isFinite(r.before?.point)&&Number.isFinite(r.after?.point)&&Number.isFinite(r.actual));
  const byGame=new Map();for(const r of paired){const xs=byGame.get(r.gameId)||[];xs.push(Math.abs(r.after.point-r.actual)-Math.abs(r.before.point-r.actual));byGame.set(r.gameId,xs);}
  const differences=[...byGame.values()].map(mean),delta=mean(differences),se=differences.length>1?Math.sqrt(differences.reduce((s,x)=>s+(x-delta)**2,0)/(differences.length-1)/differences.length):null;
  const dates=paired.map(r=>r.date).sort();
  return {n:paired.length,games:byGame.size,from:dates[0]||null,through:dates.at(-1)||null,changed:paired.filter(r=>Math.abs(r.before.point-r.after.point)>1e-6||Math.abs((r.before.probability??0)-(r.after.probability??0))>1e-6).length,unpaired:rows.length-paired.length,before:metrics(paired,'before'),after:metrics(paired,'after'),baseline:metrics(paired,'baseline'),uncertainty:{method:'Approximate normal interval over equal-weight per-game mean paired absolute-error differences; repeated players across games remain correlated. Negative favors the fix. Descriptive, not proof of accuracy gain.',gameMeanMaeDifference:round(delta),interval95:se===null?null:[round(delta-1.96*se),round(delta+1.96*se)]}};
}
