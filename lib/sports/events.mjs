// Raw schedule adapters, without standard or simulation prediction dependencies.
import { gameInfo,numeric } from './normalize.mjs';
export function basketballEvent(event, sport) {
  const g = gameInfo(event);
  return { ...g, sport, teams: [g.away, g.home].filter(Boolean).map(t => ({ ...t, abbreviation: t.code || t.name, homeAway: t.id === g.home?.id ? 'home' : 'away' })) };
}
export function mlbEvent(g) {
  return { id: String(g.gamePk), sport: 'mlb', date: g.gameDate, officialDate: g.officialDate, season: Number(g.season),
    state: g.status?.abstractGameState === 'Final' ? 'post' : g.status?.abstractGameState === 'Live' ? 'in' : 'pre', status: g.status?.detailedState || 'Scheduled',
    teams: ['away', 'home'].map(side => ({ id: String(g.teams[side].team.id), name: g.teams[side].team.name, abbreviation: g.teams[side].team.abbreviation || g.teams[side].team.name, homeAway: side, score: numeric(g.teams[side].score) })) };
}
