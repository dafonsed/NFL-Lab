// A displayed market line is separate from the model's statistical estimate.
export function freshPregameQuote(prop, now, kickoff=prop?.commenceTime) {
  const start=Date.parse(kickoff),quoted=Date.parse(prop?.fetchedAt),postedStart=Date.parse(prop?.commenceTime);
  return !!prop && [now,start,quoted,postedStart,prop.line].every(Number.isFinite)
    && prop.basis==='captured_pregame' && !prop.stale && now<start && now<postedStart
    && Math.abs(start-postedStart)<15*60000 && quoted<=now && now-quoted<=2*3600000;
}
