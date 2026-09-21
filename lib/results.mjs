import { MARKET_CONFIG } from './markets.mjs';

const numeric = x => x !== '' && x !== null && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : null;
export function actualResult(game, playerId, market) {
  const sourceUrl = game?.espn ? `https://www.espn.com/nfl/boxscore/_/gameId/${game.espn}` : null;
  const base = { gameId: game?.game_id, source: 'nflverse final player statistics', sourceUrl, unit: MARKET_CONFIG[market].unit };
  if (!game?.complete) return { ...base, status: 'pending', actual: null };
  const row = game.players.get(playerId);
  if (!row || row.statsAvailable === false) return { ...base, status: 'no_stats', actual: null };
  // A present weekly row or snap-only appearance is evidence of participation;
  // an absent player is never fabricated as a zero or automatically voided.
  if (numeric(row.offense_snaps) === 0 && !['attempts', 'carries', 'targets', 'special_teams_tds'].some(k => Number(row[k]) > 0)) return { ...base, status: 'did_not_play', actual: null };
  const values = MARKET_CONFIG[market].fields.map(k => numeric(row[k]));
  const snapOnly = Number(row.offense_snaps) > 0 && !['attempts', 'carries', 'targets'].some(k => Number(row[k]) > 0);
  if (values.some(v => v === null) && !snapOnly) return { ...base, status: 'no_stats', actual: null };
  let actual = values.reduce((a, b) => a + (b ?? 0), 0);
  if (market === 'any_td') {
    // PBP captures unusual offensive fumble-recovery TDs as well as returns.
    const playTDs = game.plays.filter(p => p.td_player_id === playerId && Number(p.touchdown) === 1).length;
    actual = Math.max(actual, playTDs);
  }
  return { ...base, status: 'final', actual };
}

export function gradeResult(result, quote, market) {
  if (result.status !== 'final') return { ...result, over: null, under: null };
  const line = market === 'any_td' ? 0.5 : quote?.line;
  if (!Number.isFinite(line)) return { ...result, status: 'no_line', over: null, under: null, line: null };
  const recordedPregame = quote?.basis === 'captured_pregame' && Date.parse(quote.fetchedAt) < Date.parse(quote.commenceTime);
  const archivedListing = quote?.basis === 'published_archive';
  if (market !== 'any_td' && !recordedPregame && !archivedListing) return { ...result, status: 'no_line', over: null, under: null, line: null };
  const outcome = result.actual > line ? 'over' : result.actual < line ? 'under' : 'push';
  return { ...result, status: outcome, line, over: outcome === 'push' ? 'push' : outcome === 'over' ? 'hit' : 'miss', under: outcome === 'push' ? 'push' : outcome === 'under' ? 'hit' : 'miss', lineAsOf: quote?.fetchedAt || null, basis: quote?.basis || 'touchdown_record', note: 'Statistical comparison with the displayed line, not an official sportsbook settlement or a recorded model prediction. Archived listings are not verified closing lines.' };
}
