// Fictional fixtures exclusively for the public, in-memory product demo.
// No provider data, model forecasts, odds or stored user records enter this module.
export const DEMO_SPORTS = {
  nfl: { label:'NFL', icon:'football', markets:[['yards','Receiving yards',75.5,200],['receptions','Receptions',5.5,16],['targets','Targets',8.5,20]],
    series:[[48,82,66,104,71,93,59,112,88,61,57,104,70,47,30,85,148,119,92,86],[4,7,5,8,6,7,4,9,7,5,4,8,5,4,3,7,10,9,7,6],[7,10,8,12,9,10,7,13,10,8,7,11,9,6,5,10,14,12,10,9]] },
  nba: { label:'NBA', icon:'basketball', markets:[['points','Points',24.5,50],['rebounds','Rebounds',5.5,18],['assists','Assists',6.5,18]],
    series:[[19,28,24,31,22,26,18,34,27,23,29,21,32,26,18,35,28,24,31,27],[4,6,5,7,3,6,4,8,5,7,6,4,8,5,3,7,6,4,9,5],[5,7,6,8,4,9,5,10,7,6,8,5,9,6,4,10,7,5,8,9]] },
  wnba: { label:'WNBA', icon:'basketball', markets:[['points','Points',21.5,45],['assists','Assists',7.5,16],['rebounds','Rebounds',4.5,14]],
    series:[[18,25,21,27,16,30,23,19,28,24,22,29,26,24,10,21,37,34,28,25],[6,8,7,9,5,10,8,6,9,7,8,10,7,9,4,8,12,11,9,10],[3,5,4,6,2,7,5,3,6,4,5,7,4,6,2,5,8,7,6,5]] },
  mlb: { label:'MLB', icon:'baseball', markets:[['hits','Hits',1.5,5],['bases','Total bases',2.5,10],['runs','Runs',0.5,4]],
    series:[[1,2,0,3,1,2,1,0,2,1,2,1,3,0,2,1,2,4,1,2],[1,3,0,5,2,4,1,0,3,2,4,1,5,0,3,2,4,7,1,3],[0,1,0,2,1,1,0,0,1,1,1,0,2,0,1,0,1,2,0,1]] },
  nhl: { label:'NHL', icon:'hockey', markets:[['shots','Shots on goal',2.5,9],['points','Points',0.5,5],['assists','Assists',0.5,4]],
    series:[[2,4,1,3,2,5,3,1,4,2,3,4,2,5,1,3,4,6,2,4],[0,1,0,2,1,1,0,0,2,1,1,0,2,1,0,1,2,3,0,1],[0,1,0,1,0,1,0,0,1,1,0,0,2,1,0,1,1,2,0,1]] },
  soccer: { label:'Soccer', icon:'soccer', markets:[['shots','Shots',2.5,9],['onTarget','Shots on target',0.5,5],['goals','Goals',0.5,4]],
    series:[[2,3,1,4,2,5,3,1,4,2,3,4,1,5,2,3,4,6,2,3],[1,1,0,2,1,3,1,0,2,1,1,2,0,3,1,1,2,3,0,2],[0,1,0,1,0,2,1,0,1,0,1,0,0,2,1,0,1,2,0,1]] }
};
const fixtures = [
  ['jordan-ellis','Jordan Ellis','nfl','NO','LV','WR',0],['marcus-reed','Marcus Reed','nfl','ATL','TB','WR',1],
  ['alex-carter','Alex Carter','nba','OKC','DAL','G',0],['devon-hayes','Devon Hayes','nba','NY','BOS','F',1],
  ['maya-brooks','Maya Brooks','wnba','IND','MIN','G',0],['riley-james','Riley James','wnba','SEA','LV','G',1],
  ['leo-martinez','Leo Martinez','mlb','LA','SD','OF',0],['eli-morgan','Eli Morgan','mlb','NY','BOS','IF',1],
  ['noah-bennett','Noah Bennett','nhl','TOR','OTT','C',0],['owen-clark','Owen Clark','nhl','NY','BOS','W',1],
  ['luca-silva','Luca Silva','soccer','LON','MAN','F',0],['mateo-costa','Mateo Costa','soccer','LIV','NEW','F',1]
];
export const DEMO_PLAYERS = fixtures.map(([id,name,sport,team,opponent,position,variant]) => ({
  id,name,sport,team,opponent,position,initials:name.split(' ').map(s=>s[0]).join(''),
  games:Array.from({length:20},(_,i)=>({id:i+1,home:i%2===0,opponent:i%4===0?opponent:['NY','LA','BOS','ATL'][i%4],
    stats:Object.fromEntries(DEMO_SPORTS[sport].markets.map(([key],m)=>[key,Math.max(0,DEMO_SPORTS[sport].series[m][variant?(i+3)%20:i]-(variant?(m===0&&sport==='nfl'?8:1):0))]))
  }))
}));
export function demoGames(player, {window='10',venue='all'}={}) {
  const rows=player.games.filter(g=>(window!=='h2h'||g.opponent===player.opponent)&&(venue==='all'||g.home===(venue==='home')));
  return window==='h2h'?rows:rows.slice(-Number(window));
}
export function demoSummary(games,market,line,side='over') {
  const values=games.map(g=>g.stats[market]).filter(Number.isFinite), sorted=[...values].sort((a,b)=>a-b),n=values.length;
  const hits=values.filter(v=>side==='under'?v<line:v>line).length,pushes=values.filter(v=>v===line).length;
  return {n,hits,pushes,rate:n?Math.round(hits/n*100):null,average:n?values.reduce((a,b)=>a+b,0)/n:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,min:n?sorted[0]:null,max:n?sorted.at(-1):null};
}
