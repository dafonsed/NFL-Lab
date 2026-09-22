export const playerKey=p=>`${p.gameId}:${p.id}`;
export function playerContext(board,key){
 const player=board?.players.find(p=>playerKey(p)===key);if(!player)return null;
 if(board.scope!=='all')return {player,board};
 const matchup=board.matchups.find(m=>m.game.id===player.gameId);
 return matchup?{player,board:{...board,...matchup,scope:'game'}}:null;
}
export function rankValue(player,by='over'){
 if(player.availability?.unavailable||player.forecast?.status!=='available'||!Number.isFinite(player.forecast.point))return null;
 if(by==='projection')return player.forecast.point;
 if(!['over','under'].includes(by)||!Number.isFinite(player.prop?.line)||player.prop?.stale)return null;
 const value=player.forecast.probability?.[by];return Number.isFinite(value)&&value>=0&&value<=1?value:null;
}
export function rankPlayers(players,by='over'){
 const sorted=players.filter(p=>!p.availability?.unavailable).map(player=>({player,value:rankValue(player,by)})).sort((a,b)=>
  (a.value===null)-(b.value===null)||(b.value??0)-(a.value??0)||a.player.player.localeCompare(b.player.player)||playerKey(a.player).localeCompare(playerKey(b.player)));
 let rank=0,previous=null;
 return sorted.map((row,index)=>{if(row.value!==null&&row.value!==previous)rank=index+1;previous=row.value;return {...row,rank:row.value===null?null:rank};});
}
export function unrankedReason(p,by){
 if(p.forecast?.status!=='available'||!Number.isFinite(p.forecast?.point))return 'Forecast unavailable';
 if(by!=='projection'&&p.prop?.stale)return 'Posted line is stale';
 if(by!=='projection'&&!Number.isFinite(p.prop?.line))return 'No posted line';
 return 'Probability unavailable';
}
