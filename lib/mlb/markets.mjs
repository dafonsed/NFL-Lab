export const MLB_MARKETS = {
  hr: { label:'Home runs', group:'hitting', field:'homeRuns', public:'home runs', scale:0.5, unit:'HR' },
  hits: { label:'Hits', group:'hitting', field:'hits', public:'hits', scale:1.6, unit:'hits' },
  k: { label:'Pitcher strikeouts', group:'pitching', field:'strikeOuts', public:'strikeouts', scale:8, unit:'K' },
  tb: { label:'Total bases', group:'hitting', field:'totalBases', public:'total bases', scale:3, unit:'bases' },
  rbi: { label:'RBIs', group:'hitting', field:'rbi', public:'runs batted in', scale:1.2, unit:'RBI' },
  runs: { label:'Runs scored', group:'hitting', field:'runs', public:'runs', scale:1.2, unit:'runs' },
  hrr: { label:'Hits + runs + RBIs', group:'hitting', fields:['hits','runs','rbi'], public:'hits, runs & rbis', scale:3.5, unit:'H+R+RBI' },
  sb: { label:'Stolen bases', group:'hitting', field:'stolenBases', public:'steals', scale:0.5, unit:'SB' },
  singles: { label:'Singles', group:'hitting', public:'singles', scale:1.1, unit:'singles' },
  doubles: { label:'Doubles', group:'hitting', field:'doubles', public:'doubles', scale:0.5, unit:'doubles' },
  bb: { label:'Batter walks', group:'hitting', field:'baseOnBalls', public:'batter walks', scale:0.9, unit:'BB' },
  batter_k: { label:'Batter strikeouts', group:'hitting', field:'strikeOuts', public:'batter strikeouts', scale:1.8, unit:'K' },
  outs: { label:'Pitcher outs', group:'pitching', field:'outs', public:'outs', scale:21, unit:'outs' },
  er: { label:'Earned runs allowed', group:'pitching', field:'earnedRuns', public:'earned runs allowed', scale:4, unit:'ER' },
  hits_allowed: { label:'Hits allowed', group:'pitching', field:'hits', public:'hits allowed', scale:7, unit:'hits' },
  walks_allowed: { label:'Walks allowed', group:'pitching', field:'baseOnBalls', public:'walks allowed', scale:3, unit:'BB' },
};
export const finite = value => (typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value)) ? Number(value) : null;
const count=value=>{const n=finite(value);return Number.isInteger(n)&&n>=0?n:null;};
export function inningsToOuts(value) {
  const m=String(value??'').match(/^(\d+)(?:\.([012]))?$/);
  return m ? Number(m[1])*3+Number(m[2]||0) : null;
}
export function statValue(stats, market) {
  if (!stats) return null;
  const config=MLB_MARKETS[market];
  if(market==='outs'){
    const outs=count(stats.outs),innings=inningsToOuts(stats.inningsPitched);
    if(stats.outs!=null&&stats.outs!==''&&outs===null)return null;
    return outs!==null&&innings!==null&&outs!==innings?null:outs??innings;
  }
  if(market==='singles'){
    const values=['hits','doubles','triples','homeRuns'].map(k=>count(stats[k]));
    return values.some(v=>v===null)||values[0]<values[1]+values[2]+values[3]?null:values[0]-values[1]-values[2]-values[3];
  }
  if(market==='tb'&&finite(stats.totalBases)===null){
    const values=['hits','doubles','triples','homeRuns'].map(k=>count(stats[k]));
    return values.some(v=>v===null)||values[0]<values[1]+values[2]+values[3]?null:values[0]+values[1]+2*values[2]+3*values[3];
  }
  const values=(config.fields||[config.field]).map(k=>count(stats[k]));
  return values.some(v=>v===null)?null:values.reduce((a,b)=>a+b,0);
}
export const mlbDay = (now=Date.now()) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export function validateMlbQuery(q={}, now=Date.now()) {
  const date=q.date||mlbDay(now),market=q.market||'hr';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<'2000-01-01'||date>'2100-12-31'||!Object.hasOwn(MLB_MARKETS,market))throw Object.assign(Error('Choose a valid MLB date and player prop.'),{status:400});
  return {date,market};
}
