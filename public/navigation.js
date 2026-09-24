// One capability map for the server-rendered shell and client-side shortcuts.
export const SPORTS = { nfl: 'NFL', mlb: 'MLB', nba: 'NBA', wnba: 'WNBA', nhl: 'NHL', soccer: 'Soccer' };
const live = new Set(['nfl', 'mlb', 'nba', 'wnba']);
export function sportTools(sport) {
  if (!Object.hasOwn(SPORTS, sport)) return [{ key: 'live', label: 'Live sports', href: '/live' }];
  return [
    { key: 'research', label: 'Model', href: '/' + sport },
    { key: 'trends', label: 'Trends', href: '/' + sport + '?view=trends' },
    ...(live.has(sport) ? [{ key: 'live', label: 'Live games', href: '/' + sport + '/live' }, { key: 'simulation', label: 'Simulation', href: '/' + sport + '/simulation' }] : []),
    ...(sport === 'nfl' ? [{ key: 'performance', label: 'Performance', href: '/performance', devOnly: true }] : []),
    ...(['nfl', 'mlb'].includes(sport) ? [{ key: 'paper', label: 'Paper returns', href: '/paper?sport=' + sport, devOnly: true }] : [])
  ];
}
export function sportDestination(sport, section) {
  if (!Object.hasOwn(SPORTS, sport)) return '/research';
  if (section === 'home') return '/research?sport=' + sport;
  if (section === 'bets') return '/bets?sport=' + sport;
  return sportTools(sport).find(tool => tool.key === section)?.href || '/' + sport;
}
