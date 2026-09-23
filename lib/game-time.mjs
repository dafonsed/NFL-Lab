// Schedule conversion only. Shared by independent models and archives.
export function kickoffTime(game) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game?.gameday||'') || !/^\d{2}:\d{2}/.test(game?.gametime||'')) return null;
  const wall=Date.parse(`${game.gameday}T${game.gametime.slice(0,5)}:00Z`);
  if(!Number.isFinite(wall))return null;
  let utc=wall+5*3600000;
  for(let i=0;i<2;i++){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc)).map(p=>[p.type,p.value]));
    utc+=wall-Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  }
  return new Date(utc).toISOString();
}
