const sports = { nfl: 'NFL', mlb: 'MLB', nba: 'NBA', wnba: 'WNBA', nhl: 'NHL', soccer: 'Soccer' };
const liveSports = new Set(['nfl', 'mlb', 'nba', 'wnba']);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function siteContext(url) {
  const path = url.pathname.replace(/\/$/, '') || '/', segment = path.split('/')[1];
  const section = (Object.hasOwn(sports, segment) && path === '/' + segment || path === '/') && url.searchParams.get('view') === 'trends' ? 'trends' : path === '/bets' ? 'bets' : path === '/performance' ? 'performance' : path === '/paper' ? 'paper' : path === '/live' || path.endsWith('/live') ? 'live' : 'research';
  const sport = Object.hasOwn(sports, segment) ? segment : section === 'paper' ? url.searchParams.get('sport') === 'mlb' ? 'mlb' : 'nfl' : ['bets', 'live'].includes(section) ? null : 'nfl';
  return { sport, section };
}

export function siteHeader(url) {
  const { sport, section } = siteContext(url), research = '/' + (sport || 'nfl');
  const live = liveSports.has(sport) ? `/${sport}/live` : '/live';
  const tabs = [['research', 'Research', research], ['live', 'Live', live], ['trends', 'Trends', research + '?view=trends'], ['performance', 'Performance', '/performance'], ['paper', 'Paper returns', '/paper?sport=' + (sport === 'mlb' ? 'mlb' : 'nfl')]];
  return `<header class="site-header" data-site-section="${section}" data-site-sport="${sport || ''}">
    <div class="site-header-main">
      <a class="site-brand" href="/nfl" aria-label="Sports Lab home"><img src="/favicon.svg" width="36" height="36" alt=""><span>SPORTS<span class="brand-light">LAB</span><small>THE GAME. DECODED.</small></span></a>
      <nav class="site-sports" aria-label="Sport">${Object.entries(sports).map(([key, label]) => `<a href="/${key}${section === 'live' && liveSports.has(key) ? '/live' : section === 'trends' ? '?view=trends' : ''}"${key === sport ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <div class="site-header-actions"><button class="site-dev-toggle" data-dev-toggle aria-pressed="false" title="Show model inputs, formulas and source data">&lt;/&gt; Dev mode <b>Off</b></button><a class="site-tracker${section === 'bets' ? ' active' : ''}" href="/bets"${section === 'bets' ? ' aria-current="page"' : ''}><span aria-hidden="true">▤</span> Bet Tracker</a></div>
    </div>
    <div class="site-header-bar"><nav class="site-navigation" aria-label="Main navigation">${tabs.map(([key, label, href]) => `<a class="site-nav-link${key === 'live' ? ' site-live-link' : ''}" href="${esc(href)}"${key === section ? ' aria-current="page"' : ''}>${key === 'live' ? '<span class="site-live-dot" aria-hidden="true"></span>' : ''}${label}</a>`).join('')}</nav><span class="site-context">${sport ? sports[sport] : 'ALL SPORTS'} <span>/</span> ${section === 'bets' ? 'PERSONAL WORKSPACE' : section === 'live' ? 'LIVE CENTER' : section === 'trends' ? 'PLAYER TRENDS' : section === 'research' ? 'PLAYER RESEARCH' : 'MODEL EVIDENCE'}</span></div>
  </header>`;
}

// Navigation is present in the initial HTML, independent of data requests or
// page scripts. Every route uses this same header and final layout stylesheet.
export function renderSitePage(html, url) {
  if (!html.includes('<!--site-header-->')) throw Error('Page is missing the shared site header.');
  return html.replace('<!--site-header-->', siteHeader(url))
    .replace('</head>', '<link rel="stylesheet" href="/site-layout.css"><link rel="stylesheet" href="/player-research.css"><script type="module" src="/site-preferences.js"></script></head>')
    .replace(/<body([^>]*)>/, (_, attrs) => `<body${/class=/.test(attrs) ? attrs.replace(/class="([^"]*)"/, 'class="$1 site-layout"') : attrs + ' class="site-layout"'}>`);
}
