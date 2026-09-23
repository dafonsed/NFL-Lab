import { finite, selectGames, summarize, recentChange } from './research-data.js';

export const comparisonLine = profile => finite(profile.prop?.line) ?? (profile.sport === 'nfl' && profile.market === 'any_td' ? 0.5 : null);
export function trendRows(profiles, { search = '', game = '', posted = false, savedOnly = false, saved = new Set(), window = '10', side = 'over', venue = 'all', sort = 'rate' } = {}) {
  const query = search.trim().toLowerCase();
  return profiles.filter(p => (!query || `${p.name} ${p.team} ${p.opponent}`.toLowerCase().includes(query)) && (!game || game === 'all' || String(p.gameId) === String(game)) && (!posted || p.prop && !p.prop.stale) && (!savedOnly || saved.has(String(p.playerId))))
    .map(p => ({ p, line: comparisonLine(p), stats: summarize(selectGames(p, { window, venue }), comparisonLine(p), side), change: recentChange(p.rows) }))
    .sort((a, b) => {
      const value = row => sort === 'average' ? row.stats.average : sort === 'change' ? row.change.change === null ? null : Math.abs(row.change.change) : row.stats.rate;
      const av = value(a), bv = value(b);
      return (sort === 'name' ? 0 : (av === null) - (bv === null) || (bv ?? 0) - (av ?? 0) || b.stats.n - a.stats.n) || a.p.name.localeCompare(b.p.name) || a.p.key.localeCompare(b.p.key);
    });
}
