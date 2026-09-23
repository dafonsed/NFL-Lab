import { icon } from '../public/ui-icons.js';
const sports = { nfl: 'NFL', mlb: 'MLB', nba: 'NBA', wnba: 'WNBA', nhl: 'NHL', soccer: 'Soccer' };
const liveSports = new Set(['nfl', 'mlb', 'nba', 'wnba']);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function siteContext(url) {
  const path = url.pathname.replace(/\/$/, '') || '/', segment = path.split('/')[1];
  if (path === '/' && !['view', 'market', 'season', 'week'].some(key => url.searchParams.has(key))) return { sport: null, section: 'home' };
  const section = (Object.hasOwn(sports, segment) && path === '/' + segment || path === '/') && url.searchParams.get('view') === 'trends' ? 'trends' : path === '/bets' ? 'bets' : path === '/performance' ? 'performance' : path === '/paper' ? 'paper' : path === '/live' || path.endsWith('/live') ? 'live' : 'research';
  const sport = Object.hasOwn(sports, segment) ? segment : section === 'paper' ? url.searchParams.get('sport') === 'mlb' ? 'mlb' : 'nfl' : ['bets', 'live'].includes(section) ? null : 'nfl';
  return { sport, section };
}

export function siteHeader(url) {
  const { sport, section } = siteContext(url), research = '/' + (sport || 'nfl');
  const brand = `<a class="site-brand" href="/" aria-label="Sports Lab home"><img src="/favicon.svg" width="36" height="36" alt=""><span>sports<span class="brand-light">lab</span><small>YOUR RESEARCH WORKSPACE</small></span></a>`;
  const settings = `<button class="site-settings-toggle" data-display-settings aria-label="Display settings" title="Display settings">${icon('settings')}</button>`;
  const developer = `<button class="site-dev-toggle" data-dev-toggle aria-pressed="false" title="Show model inputs, formulas and source data">${icon('code')}<span>Dev mode</span><b>Off</b></button>`;
  if (section === 'home') return `<header class="site-header workspace-home-header" data-site-section="home"><div class="site-header-main">${brand}<div class="site-header-actions">${developer}<a class="site-tracker" href="/bets">${icon('picks')} My picks</a>${settings}</div></div></header>`;
  const live = liveSports.has(sport) ? `/${sport}/live` : '/live';
  const tabs = [['research', 'Research', research], ['trends', 'Trends', research + '?view=trends'], ['live', 'Live', live], ['performance', 'Performance', '/performance'], ['paper', 'Paper returns', '/paper?sport=' + (sport === 'mlb' ? 'mlb' : 'nfl')]];
  const sportIcon = { nfl: 'football', mlb: 'baseball', nba: 'basketball', wnba: 'basketball', nhl: 'hockey', soccer: 'soccer' };
  return `<header class="site-header" data-site-section="${section}" data-site-sport="${sport || ''}">
    <div class="site-header-main">
      ${brand}
      <nav class="site-sports" aria-label="Sport">${Object.entries(sports).map(([key, label]) => `<a href="/${key}${section === 'live' && liveSports.has(key) ? '/live' : section === 'trends' ? '?view=trends' : ''}"${key === sport ? ' aria-current="page"' : ''}>${icon(sportIcon[key])}<span>${label}</span></a>`).join('')}</nav>
      <div class="site-header-actions">${developer}${settings}</div>
    </div>
    <div class="site-header-bar"><details class="site-workspace-picker"><summary>${section === 'trends' ? 'Trends &amp; Lines' : 'Models &amp; Data'}<span aria-hidden="true">⌄</span></summary><nav class="workspace-switch" aria-label="Workspace"><a href="${research}"${section !== 'trends' ? ' aria-current="true"' : ''}>Models &amp; Data</a><a href="${research}?view=trends"${section === 'trends' ? ' aria-current="true"' : ''}>Trends &amp; Lines</a></nav></details><span class="site-nav-caption">WORKSPACE</span><nav class="site-navigation" aria-label="Main navigation">${tabs.map(([key, label, href]) => `<a class="site-nav-link${key === 'live' ? ' site-live-link' : ''}" href="${esc(href)}" aria-label="${label}"${key === section ? ' aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${key === 'live' ? '<i class="site-live-dot" aria-hidden="true"></i>' : ''}</a>`).join('')}</nav><div class="site-personal"><span class="site-nav-caption">PERSONAL</span><a class="site-tracker${section === 'bets' ? ' active' : ''}" href="/bets" aria-label="My picks"${section === 'bets' ? ' aria-current="page"' : ''}>${icon('picks')}<span>My picks</span></a></div><a class="workspace-home-link" href="/" aria-label="All workspaces">${icon('home')}<span>All workspaces</span>${icon('chevron')}</a><div class="site-rail-note"><span class="site-live-dot"></span> Independent sports research</div></div>
    <nav class="mobile-navigation" aria-label="Mobile navigation">${tabs.slice(0,3).map(([key,label,href])=>`<a href="${esc(href)}"${key===section?' aria-current="page"':''}>${icon(key)}<span>${label}</span></a>`).join('')}<a href="/bets"${section==='bets'?' aria-current="page"':''}>${icon('picks')}<span>My picks</span></a><button data-navigation-menu aria-label="More navigation" aria-haspopup="dialog">${icon('more')}<span>More</span></button></nav>
  </header>`;
}

// Navigation is present in the initial HTML, independent of data requests or
// page scripts. Every route uses this same header and final layout stylesheet.
export function renderSitePage(html, url) {
  if (!html.includes('<!--site-header-->')) throw Error('Page is missing the shared site header.');
  return html.replace('<!--site-header-->', siteHeader(url))
    .replace('</head>', '<link rel="stylesheet" href="/site-layout.css"><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/player-research.css"><link rel="stylesheet" href="/app-design.css"><script type="module" src="/site-preferences.js"></script><script type="module" src="/workspace-ui.js"></script></head>')
    .replace(/<body([^>]*)>/, (_, attrs) => `<body${/class=/.test(attrs) ? attrs.replace(/class="([^"]*)"/, 'class="$1 site-layout"') : attrs + ' class="site-layout"'}>`);
}
