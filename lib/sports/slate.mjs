// Limit simultaneous matchup builds while retaining a partial slate when one
// upstream game fails. No model coefficients or player probabilities change.
export async function settleGames(games,build,concurrency=2){
 const results=new Array(games.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,games.length)},async()=>{
  while(next<games.length){const i=next++;try{results[i]={status:'fulfilled',value:await build(games[i])};}catch(reason){results[i]={status:'rejected',reason};}}
 }));return results;
}
const unique=(rows,key)=>[...new Map(rows.map(r=>[key(r),r])).values()];
export function combineSlate(catalog,results,{market,model,fetchedAt}){
 const boards=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
 const failures=results.flatMap((r,i)=>r.status==='rejected'?[{game:catalog.games[i],message:r.reason?.message||'Game data unavailable'}]:[]);
 const warnings=[...boards.flatMap(b=>b.warnings.map(w=>`${b.game.away.code} @ ${b.game.home.code}: ${w}`)),...failures.map(f=>`${f.game.away.code} @ ${f.game.home.code}: ${f.message}`)];
 return {...catalog,scope:'all',game:null,market,model,fetchedAt,players:boards.flatMap(b=>b.players),unavailablePlayers:boards.flatMap(b=>b.unavailablePlayers),
  matchups:boards.map(b=>({game:b.game,weather:b.weather,availability:b.availability,props:b.props,validation:b.validation,capture:b.capture,methodology:b.methodology})),
  failures,partial:failures.length>0,loadedGames:boards.length,totalGames:catalog.games.length,empty:catalog.games.length===0,warnings,
  historyGames:unique(boards.flatMap(b=>b.historyGames),g=>g.id),sources:unique([catalog.source,...boards.flatMap(b=>b.sources)],s=>s.url+'|'+s.sha256),
  methodology:boards[0]?.methodology||'Select a published matchup to inspect its model.',capture:{state:'per_game'},props:{message:'Posted totals are shown beside each player when available.'}};
}
