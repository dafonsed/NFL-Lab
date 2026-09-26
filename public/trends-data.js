import { finite, selectGames, summarize, recentChange } from './research-data.js';

export const comparisonLine = profile => finite(profile.prop?.line) ?? (profile.sport === 'nfl' && profile.market === 'any_td' ? 0.5 : null);
export const defaultTrendFilters = () => ({sample:'10',venue:'all',minRate:0,minGames:0,teams:[],positions:[],book:'',minLine:'',maxLine:'',minOdds:'',maxOdds:'',hideUnavailable:false,startersOnly:false});
export function trendFilterCount(filters={}) {return Object.entries(defaultTrendFilters()).filter(([key,value])=>Array.isArray(value)?filters[key]?.length:filters[key]!==undefined&&filters[key]!==value).length;}
export function trendRows(profiles, { search = '', game = '', posted = false, savedOnly = false, saved = new Set(), window = '10', side = 'over', venue = 'all', sort = 'rate', filters = {} } = {}) {
  const query = search.trim().toLowerCase();
  window=filters.sample??window;venue=filters.venue??venue;
  const between=(value,min,max)=>(finite(min)===null||value!==null&&value>=Number(min))&&(finite(max)===null||value!==null&&value<=Number(max));
  return profiles.filter(p => (!query || `${p.name} ${p.team} ${p.opponent}`.toLowerCase().includes(query)) && (!game || game === 'all' || String(p.gameId) === String(game)) && (!posted || p.prop && !p.prop.stale) && (!savedOnly || saved.has(String(p.playerId))))
    .filter(p=>(!filters.teams?.length||filters.teams.includes(p.team))&&(!filters.positions?.length||filters.positions.includes(p.position))&&(!filters.book||(p.prop?.bookKey||p.prop?.bookmaker)===filters.book)&&(!filters.hideUnavailable||!p.availability?.unavailable)&&(!filters.startersOnly||['confirmed','starter'].includes(p.lineup))&&between(comparisonLine(p),filters.minLine,filters.maxLine)&&between(finite(p.prop?.prices?.[side]?.american),filters.minOdds,filters.maxOdds))
    .map(p => ({ p, line: comparisonLine(p), stats: summarize(selectGames(p, { window, venue }), comparisonLine(p), side), change: recentChange(p.rows) }))
    .filter(row=>row.stats.n>=(finite(filters.minGames)??0)&&(!(filters.minRate>0)||row.stats.rate!==null&&row.stats.rate*100>=filters.minRate))
    .sort((a, b) => {
      const value = row => sort === 'average' ? row.stats.average : sort === 'change' ? row.change.change === null ? null : Math.abs(row.change.change) : row.stats.rate;
      const av = value(a), bv = value(b);
      return (sort === 'name' ? 0 : (av === null) - (bv === null) || (bv ?? 0) - (av ?? 0) || b.stats.n - a.stats.n) || a.p.name.localeCompare(b.p.name) || a.p.key.localeCompare(b.p.key);
    });
}
