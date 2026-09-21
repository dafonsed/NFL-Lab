import { targetValue } from './forecast.mjs';
export function nflOpponent(games,target,market,position,leagueRate){
  const sample=games.filter(g=>g.gameday<target.date&&(Number(g.season)<target.season||Number(g.week)<target.week)&&(g.home_team===target.opponent||g.away_team===target.opponent)).sort((a,b)=>b.gameday.localeCompare(a.gameday)).slice(0,5);
  let production=0;
  for(const g of sample)for(const p of g.players.values())if(p.team!==target.opponent&&p.position===position)production+=market==='any_td'?Number(targetValue(p,market)>0):targetValue(p,market);
  return {available:sample.length>=4&&leagueRate>0,rate:(production+leagueRate*3)/(sample.length+3),leagueRate,production,sampleCount:sample.length,games:sample.map(g=>g.game_id),unit:`${position} production per opponent game`,description:'Production allowed to this position in the opponent’s previous five games, stabilized with three league-average games',sourceUrl:'https://github.com/nflverse/nflverse-data/releases/tag/stats_player'};
}
