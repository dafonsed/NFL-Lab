// One capability map for the server-rendered shell and client-side shortcuts.
export const SPORTS = { nfl: 'NFL', mlb: 'MLB', nba: 'NBA', wnba: 'WNBA', nhl: 'NHL', soccer: 'Soccer' };
const live = new Set(['nfl', 'mlb', 'nba', 'wnba']);
export function workspaceProduct(section) {
  if (['ev', 'bets', 'ev-home'].includes(section)) return 'ev';
  return ['trends', 'trends-home', 'parlay'].includes(section) ? 'trends' : 'models';
}
export function productDashboardUrl(product, sport) {
  if (product === 'ev') return '/ev/dashboard';
  const selected = Object.hasOwn(SPORTS, sport) ? sport : 'mlb';
  return (product === 'trends' ? '/trends' : '/models') + '?sport=' + selected;
}
export function productTools(product, sport) {
  const selected = Object.hasOwn(SPORTS, sport) ? sport : 'mlb';
  if (product === 'trends') return [
    { key: 'trends', label: 'Player trends', href: '/' + selected + '?view=trends' },
    { key: 'watchlist', label: 'Watchlist', href: '/' + selected + '?view=trends&saved=1' },
    { key: 'parlay', label: 'Parlay builder', href: '/' + selected + '?view=parlay' }
  ];
  return sportTools(sport).filter(tool => !['ev', 'trends'].includes(tool.key)).map(tool => tool.key === 'research' ? { ...tool, label: 'Projections' } : tool);
}
// The bet tracker is part of +EV: one address, sport is a filter on the page.
export function betTrackerUrl() {
  return '/ev/tracker';
}
export function legacyBetTrackerUrl(url) {
  const path = url.pathname.replace(/\/$/, '');
  if (['/bets', '/bets.html'].includes(path) || path === '/ev' && url.hash === '#tracker') {
    // Old links keep their other parameters; sport is a filter on the page now.
    const params = new URLSearchParams(url.search); params.delete('sport');
    return '/ev/tracker' + (params.size ? '?' + params : '');
  }
  return null;
}
export function sportTools(sport) {
  if (!Object.hasOwn(SPORTS, sport)) return [{ key: 'live', label: 'Live sports', href: '/live' }];
  return [
    { key: 'research', label: 'Model', href: '/' + sport },
    { key: 'ev', label: 'EV tools', href: '/ev?sport=' + sport },
    { key: 'trends', label: 'Trends', href: '/' + sport + '?view=trends' },
    ...(live.has(sport) ? [{ key: 'live', label: 'Live games', href: '/' + sport + '/live' }, { key: 'simulation', label: 'Simulation', href: '/' + sport + '/simulation' }] : []),
    ...(sport === 'nfl' ? [{ key: 'performance', label: 'Performance', href: '/performance', devOnly: true }] : []),
    ...(['nfl', 'mlb'].includes(sport) ? [{ key: 'paper', label: 'Paper returns', href: '/paper?sport=' + sport, devOnly: true }] : [])
  ];
}
export function sportDestination(sport, section) {
  if (section.endsWith('-home')) return productDashboardUrl(workspaceProduct(section), sport);
  if (!Object.hasOwn(SPORTS, sport)) return '/research';
  if (section === 'home') return '/research?sport=' + sport;
  if (section === 'bets') return betTrackerUrl(sport);
  if (section === 'ev') return '/ev';
  if (section === 'parlay') return '/' + sport + '?view=parlay';
  return sportTools(sport).find(tool => tool.key === section)?.href || '/' + sport;
}
