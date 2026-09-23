import { icon } from '../public/ui-icons.js';
const sports = { nfl: 'NFL', mlb: 'MLB', nba: 'NBA', wnba: 'WNBA', nhl: 'NHL', soccer: 'Soccer' };
const liveSports = new Set(['nfl', 'mlb', 'nba', 'wnba']);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Keep bookmarked workspace URLs working now that the root is a public homepage.
export function legacyResearchUrl(url) {
  if (url.pathname !== '/') return null;
  const query = url.searchParams;
  if (['view', 'market', 'season', 'week'].some(key => query.has(key))) return '/nfl' + url.search;
  if (['sport', 'date', 'prop', 'period', 'game', 'researchPlayer'].some(key => query.has(key))) return '/research' + url.search;
  return null;
}

export function siteContext(url) {
  const path = url.pathname.replace(/\/$/, '') || '/', segment = path.split('/')[1];
  if (path === '/') return { sport: null, section: 'landing' };
  if (path === '/research') return { sport: Object.hasOwn(sports, url.searchParams.get('sport')) ? url.searchParams.get('sport') : 'mlb', section: 'home' };
  const section = path === '/simulation' || /^\/(nfl|nba|wnba|mlb|nhl|soccer)\/simulation$/.test(path) ? 'simulation' : (Object.hasOwn(sports, segment) && path === '/' + segment || path === '/') && url.searchParams.get('view') === 'trends' ? 'trends' : path === '/bets' ? 'bets' : path === '/performance' ? 'performance' : path === '/paper' ? 'paper' : path === '/live' || path.endsWith('/live') ? 'live' : 'research';
  const sport = Object.hasOwn(sports, segment) ? segment : section === 'paper' ? url.searchParams.get('sport') === 'mlb' ? 'mlb' : 'nfl' : ['bets', 'live'].includes(section) ? null : 'nfl';
  return { sport, section };
}

export function siteHeader(url) {
  const { sport, section } = siteContext(url), research = '/' + (sport || 'nfl');
  const brand = `<a class="site-brand" href="/" aria-label="Sports Lab home"><img src="/favicon.svg" width="36" height="36" alt=""><span>sports<span class="brand-light">lab</span><small>YOUR RESEARCH WORKSPACE</small></span></a>`;
  const settings = `<button class="site-settings-toggle" data-display-settings aria-label="Display settings" title="Display settings">${icon('palette')}<span>Appearance</span></button>`;
  const developer = `<button class="site-dev-toggle" data-dev-toggle aria-pressed="false" title="Show model inputs, formulas and source data">${icon('code')}<span>Dev mode</span><b>Off</b></button>`;
  const live = liveSports.has(sport) ? `/${sport}/live` : '/live';
  const tabs = [['research', 'Research', research], ['trends', 'Trends', research + '?view=trends'], ['live', 'Live', live], ['simulation', 'Simulation', research + '/simulation'], ['performance', 'NFL performance', '/performance'], ['paper', 'Paper returns', '/paper?sport=' + (sport === 'mlb' ? 'mlb' : 'nfl')]];
  const sportIcon = { nfl: 'football', mlb: 'baseball', nba: 'basketball', wnba: 'basketball', nhl: 'hockey', soccer: 'soccer' };
  return `<header class="site-header" data-site-section="${section}" data-site-sport="${sport || ''}">
    <div class="site-header-main">
      ${brand}
      <nav class="site-sports" aria-label="Sport">${Object.entries(sports).map(([key, label]) => `<a href="${section === 'home' ? '/research?sport=' + key : '/' + key}${section === 'simulation' ? '/simulation' : section === 'live' && liveSports.has(key) ? '/live' : section === 'trends' ? '?view=trends' : ''}"${key === sport ? ' aria-current="page"' : ''}>${icon(sportIcon[key])}<span>${label}</span></a>`).join('')}</nav>
      <div class="site-header-actions">${developer}${settings}</div>
    </div>
    <div class="site-header-bar"><div class="site-rail-content"><a class="site-overview-link" href="/research" aria-label="Research today" title="Research today"${section==='home'?' aria-current="page"':''}>${icon('home')}<span>Research today</span></a><span class="site-nav-caption">RESEARCH TOOLS</span><nav class="site-navigation" aria-label="Main navigation">${tabs.map(([key, label, href]) => `<a class="site-nav-link${key === 'live' ? ' site-live-link' : ''}" href="${esc(href)}" aria-label="${label}"${key === section ? ' aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`).join('')}</nav><div class="site-personal"><span class="site-nav-caption">PERSONAL</span><a class="site-tracker${section === 'bets' ? ' active' : ''}" href="/bets" aria-label="My picks"${section === 'bets' ? ' aria-current="page"' : ''}>${icon('picks')}<span>My picks</span></a></div><a class="workspace-home-link" href="/research" aria-label="Research overview">${icon('home')}<span>Research overview</span>${icon('chevron')}</a><div class="site-rail-note">Independent sports research</div></div></div>
    <nav class="mobile-navigation" aria-label="Mobile navigation">${tabs.slice(0,3).map(([key,label,href])=>`<a href="${esc(href)}"${key===section?' aria-current="page"':''}>${icon(key)}<span>${label}</span></a>`).join('')}<a href="/bets"${section==='bets'?' aria-current="page"':''}>${icon('picks')}<span>My picks</span></a><button data-navigation-menu aria-label="More navigation" aria-haspopup="dialog">${icon('more')}<span>More</span></button></nav>
  </header>`;
}

// Navigation is present in the initial HTML, independent of data requests or
// page scripts. Every route uses this same header and final layout stylesheet.
export function renderSitePage(html, url) {
  if (siteContext(url).section === 'landing') return html;
  if (!html.includes('<!--site-header-->')) throw Error('Page is missing the shared site header.');
  return html.replace('<!--site-header-->', siteHeader(url))
    .replace('</main>', `${researchGuide(url)}</main>`)
    .replace('</head>', '<link rel="stylesheet" href="/site-layout.css"><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/player-research.css"><link rel="stylesheet" href="/app-design.css"><script type="module" src="/site-preferences.js"></script><script type="module" src="/workspace-ui.js"></script></head>')
    .replace(/<body([^>]*)>/, (_, attrs) => `<body${/class=/.test(attrs) ? attrs.replace(/class="([^"]*)"/, 'class="$1 site-layout"') : attrs + ' class="site-layout"'}>`);
}

// Display-only context, shared by every tool. Model and API values stay untouched.
function researchGuide(url) {
  const { section, sport } = siteContext(url);
  if (section === 'home') return '';
  const notes = {
    research: 'Experimental estimates · inspect samples and source freshness.',
    trends: 'Historical results · past hit rates are not future probabilities.',
    live: 'Experimental live estimates · public feeds may lag the game.',
    simulation: 'Experimental scenarios · more runs do not prove accuracy.',
    performance: 'NFL evidence archive · historical tests are reconstructions.',
    paper: `${sport === 'mlb' ? 'MLB' : 'NFL'} paper record · hypothetical one-unit returns.`,
    bets: 'Personal records · stored in this browser, with no device sync.'
  };
  return `<details class="research-guide"><summary><span class="guide-mark" aria-hidden="true">i</span><span>${notes[section] || notes.research}</span><b>Reading the numbers</b>${icon('chevron')}</summary><div class="guide-body"><dl>
    <div><dt>Historical statistic</dt><dd>Recorded performance in the displayed game sample. L5, L10 and L20 mean the last 5, 10 or 20 eligible games; filters can reduce the sample.</dd></div>
    <div><dt>Projection &amp; rating</dt><dd>A projection estimates production in the selected market’s units. A research rating orders profiles on its stated scale; it is not a probability.</dd></div>
    <div><dt>Model probability</dt><dd>An estimated chance under model assumptions. Experimental or unvalidated estimates are not measured accuracy or guaranteed outcomes.</dd></div>
    <div><dt>Line &amp; market probability</dt><dd>A line is the threshold for a market. Implied probability comes from the quoted odds; a no-vig estimate removes the book’s margin. Neither is a model forecast.</dd></div>
    <div><dt>Range &amp; difference</dt><dd>A prediction or simulation range shows possible outcomes under assumptions. A Monte Carlo interval measures simulation noise, not predictive confidence. Probability differences use percentage points (pp), not proven edge.</dd></div>
    <div><dt>Sources &amp; missing data</dt><dd>Check sample counts, retrieval times and stale markers. A dash (—) means unavailable, not zero. Posted, archived and manually entered prices have different provenance; inspect the label before comparing.</dd></div>
  </dl><p>Model evidence varies by sport and tool. Use Model &amp; evidence, Data &amp; methodology, or Source receipts in the current view for the actual calculation, sources and limitations.</p></div></details>`;
}
