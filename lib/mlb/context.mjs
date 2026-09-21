import { MLB_MARKETS, statValue } from './markets.mjs';
const sum=(rows,key)=>rows.reduce((a,r)=>a+Number(r.stats[key]||0),0);
export function teamGameRows(rows){
  const map=new Map();
  for(const r of rows.filter(r=>r.role==='hitting')){const key=r.gameId+':'+r.teamId;let t=map.get(key);if(!t){t={gameId:r.gameId,date:r.date,teamId:r.teamId,opponentId:r.opponentId,stats:{}};map.set(key,t);}for(const [k,v]of Object.entries(r.stats))if(Number.isFinite(Number(v)))t.stats[k]=(t.stats[k]||0)+Number(v);}
  return [...map.values()];
}
export function opponentStat(stats,market){
  const mapped={k:'batter_k',hits_allowed:'hits',walks_allowed:'bb',er:'runs',outs:'batter_k'}[market]||market;
  return statValue(stats,mapped);
}
export function opponentPrior(rows,market){return rows.reduce((a,r)=>a+(opponentStat(r.stats,market)||0),0)/sum(rows,'plateAppearances');}
export function mlbOpponent(rows,target,market,leagueRate){
  // For batters, summarize the offense faced by the opposing team's pitchers
  // (including the bullpen). For pitchers, summarize the opponent's batting.
  const pitching=MLB_MARKETS[market].group==='pitching';
  const sample=rows.filter(r=>r.date<target.date&&r.date>=target.date.slice(0,4)+'-01-01'&&(pitching?r.teamId===target.opponentId:r.opponentId===target.opponentId)&&Number(r.stats.plateAppearances)>0&&opponentStat(r.stats,market)!==null).sort((a,b)=>b.date.localeCompare(a.date)||b.gameId-a.gameId).slice(0,20);
  const exposure=sum(sample,'plateAppearances'),production=sample.reduce((n,r)=>n+opponentStat(r.stats,market),0);
  return {available:sample.length>=5&&leagueRate>0,rate:(production+leagueRate*200)/(exposure+200),leagueRate,production,exposure,games:sample.map(r=>r.gameId),sampleCount:sample.length,unit:'per plate appearance',description:pitching?(market==='outs'?'Opponent batting strikeout rate (learned relationship to outs)':'Opponent batting production'):'Opposing team pitching allowed production, starters and bullpen',sourceUrl:`https://statsapi.mlb.com/api/v1/teams/${target.opponentId}/stats?stats=gameLog&group=${pitching?'hitting':'pitching'}&season=${target.date.slice(0,4)}&gameType=R`};
}
