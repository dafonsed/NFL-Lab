import { actualResult } from './results.mjs';
import { statValue } from './mlb/markets.mjs';

export function compactNflBoard(board) {
  return { ...board, players: board.players.map(p => {
    const { sample, inputEffects, parts, explanation, teammateImpact, modelContext, ...forecast } = p.forecast || {};
    const { stats, coverage, components } = p.details || {};
    return { ...p, details: { stats, coverage, components, sampleCount: p.details?.sample?.length || 0 },
      trendGames: (p.trendGames || []).map(({ stats, url, ...game }) => game),
      forecast: { ...forecast, ...(modelContext ? { modelContext: { opponent: modelContext.opponent, weather: modelContext.weather, enabled: modelContext.enabled } } : {}), ...(teammateImpact ? { teammateImpact: { applied: teammateImpact.applied, donors: teammateImpact.donors } } : {}) }
    };
  }) };
}

export function opponentResearch(history, opponentId, market, sport) {
  if (market.goalie || !market.fields?.length) return null;
  const games = history.filter(h => h.game.complete && h.teams.some(t => t.id === opponentId)).slice(0, 15);
  const groups = [['all', 'Overall', () => true]];
  const group = p => /^(PG|SG|G)$/.test(p.position) ? 'G' : /^(SF|PF|F)$/.test(p.position) ? 'F' : p.position;
  if (['nba', 'wnba'].includes(sport)) for (const key of ['G', 'F', 'C']) groups.push([key, 'vs ' + key, p => group(p) === key]);
  const result = groups.map(([key, label, match]) => {
    const fields = market.fields.map(field => {
      const values = games.flatMap(h => {
        if (key === 'all') { const t = h.teams.find(t => t.id !== opponentId), v = t?.stats?.[field]; return v !== null && v !== undefined && Number.isFinite(Number(v)) ? [Number(v)] : []; }
        const players = h.players.filter(p => p.teamId !== opponentId && p.minutes > 0 && match(p));
        return players.length && players.every(p => p.stats[field] !== null && p.stats[field] !== undefined && Number.isFinite(Number(p.stats[field]))) ? [players.reduce((s, p) => s + Number(p.stats[field]), 0)] : [];
      });
      return { field, average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, games: values.length };
    });
    return { key, label, fields };
  }).filter(g => g.fields.some(f => f.games));
  return { groups: result, games: games.length, sourceUrls: games.map(h => h.sourceUrl).filter(Boolean), note: 'Per-game totals scored by the opposing team or position group. Games with missing statistics are excluded. Position groups use the box score’s listed positions.' };
}

// This view does not alter model samples, projections or training inputs.
export function nflResearchHistory(games, player, market, before) {
  const fields = player.position === 'QB'
    ? ['attempts', 'completions', 'passing_yards', 'passing_tds', 'passing_interceptions', 'carries', 'rushing_yards', 'rushing_tds', 'receiving_tds', 'special_teams_tds', 'snap_pct']
    : ['carries', 'targets', 'receptions', 'rushing_yards', 'receiving_yards', 'rushing_tds', 'receiving_tds', 'special_teams_tds', 'snap_pct'];
  return games.flatMap(g => {
    const row = g.players.get(player.playerId);
    if (!g.complete || g.game_id === player.gameId || before && g.gameday >= before || !row || row.statsAvailable === false || !(Number(row.offense_snaps) > 0 || Number(row.attempts) + Number(row.carries) + Number(row.targets) > 0 || Number(row.special_teams_tds) > 0)) return [];
    const result = actualResult(g, player.playerId, market);
    if (!Number.isFinite(result.actual)) return [];
    return [{ gameId: g.game_id, date: g.gameday, home: row.team === g.home_team, opponent: row.team === g.home_team ? g.away_team : g.home_team, value: result.actual, stats: Object.fromEntries(fields.filter(k => row[k] !== null && row[k] !== undefined && Number.isFinite(Number(row[k]))).map(k => [k, Number(row[k])])), url: g.espn ? `https://www.espn.com/nfl/boxscore/_/gameId/${g.espn}` : null }];
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
}

export function mlbResearchHistory(person, completed, date, market, group, full = false) {
  const rows = (person?.stats || []).filter(s => s.group?.displayName === group && s.type?.displayName === 'gameLog').flatMap(s => s.splits || []);
  const seen = new Map();
  const fields = group === 'pitching' ? ['outs', 'inningsPitched', 'strikeOuts', 'battersFaced', 'baseOnBalls', 'earnedRuns', 'hits'] : ['plateAppearances', 'hits', 'totalBases', 'doubles', 'triples', 'homeRuns', 'runs', 'rbi', 'strikeOuts', 'baseOnBalls', 'stolenBases'];
  for (const r of rows) {
    const value = statValue(r.stat, market);
    if (r.date >= date || !completed.has(r.game?.gamePk) || !['R', 'F', 'D', 'L', 'W'].includes(r.gameType) || value === null || (group === 'pitching' ? Number(r.stat.gamesStarted) !== 1 : Number(r.stat.plateAppearances) <= 0)) continue;
    seen.set(r.game.gamePk, { gameId: r.game.gamePk, date: r.date, opponent: r.opponent?.name, opponentId: r.opponent?.id, home: r.isHome, value, ...(full ? { stats: Object.fromEntries(fields.filter(k => r.stat[k] !== undefined).map(k => [k, r.stat[k]])), url: `https://www.mlb.com/gameday/${r.game.gamePk}` } : {}) });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date) || b.gameId - a.gameId).slice(0, full ? 60 : 20);
}
