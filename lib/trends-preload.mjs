// The trends page's first data request, named in the page so the browser starts it while still
// reading the HTML. On 4 Oct 2026 it began only 1.7 s in, after the page's scripts and sign-in check.
// The URL must match the one public/trends.js builds (query() and load()) character for character,
// or the browser downloads it twice.
const DEFAULT_MARKETS = { nfl: 'rec_yds', mlb: 'hits', nba: 'points', wnba: 'points', nhl: 'shots', soccer: 'shots' };
const day = (timeZone, now) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function trendsDataUrl(url, now = new Date()) {
  const sport = url.pathname.split('/')[1] || 'nfl', params = url.searchParams;
  if (!Object.hasOwn(DEFAULT_MARKETS, sport)) return null;
  const q = new URLSearchParams({ market: params.get('market') || DEFAULT_MARKETS[sport] });
  if (sport === 'nfl') {
    q.set('view', 'board');
    if (params.get('season') && params.get('week')) { q.set('season', params.get('season')); q.set('week', params.get('week')); }
    return '/api/board?' + q;
  }
  q.set('date', params.get('date') || day(sport === 'mlb' ? 'America/New_York' : 'America/Phoenix', now));
  if (sport === 'mlb') return '/api/mlb/board?' + q;
  q.set('sport', sport); q.set('league', params.get('league') || 'eng.1');
  const game = params.get('game') || (sport === 'wnba' ? 'all' : '');
  if (game) q.set('game', game);
  // Other sports load the schedule first; the board request depends on it.
  return '/api/sports/catalog?' + q;
}

const attribute = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function trendsPreload(html, url, now = new Date()) {
  const href = trendsDataUrl(url, now);
  return href ? html.replace('</head>', `  <link rel="preload" as="fetch" href="${attribute(href)}" crossorigin>\n</head>`) : html;
}
