import { icon } from '../public/ui-icons.js';
import {leagueMark} from '../public/sports-identity.js';
import { SPORTS as sports, sportTools, sportDestination } from '../public/navigation.js';
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
  const section = path === '/simulation' || /^\/(nfl|nba|wnba|mlb|nhl|soccer)\/simulation$/.test(path) ? 'simulation' : (Object.hasOwn(sports, segment) && path === '/' + segment || path === '/') && url.searchParams.get('view') === 'trends' ? 'trends' : path === '/ev' ? 'ev' : path === '/bets' ? 'bets' : path === '/performance' ? 'performance' : path === '/paper' ? 'paper' : path === '/live' || path.endsWith('/live') ? 'live' : 'research';
  const sport = Object.hasOwn(sports, segment) ? segment : section === 'paper' ? url.searchParams.get('sport') === 'mlb' ? 'mlb' : 'nfl' : ['bets', 'ev'].includes(section) && Object.hasOwn(sports, url.searchParams.get('sport')) ? url.searchParams.get('sport') : ['bets', 'ev', 'live'].includes(section) ? null : 'nfl';
  return { sport, section };
}

export function siteHeader(url) {
  const { sport, section } = siteContext(url), overview = sport ? '/research?sport=' + sport : '/research', picks = '/bets' + (sport ? '?sport=' + sport : '');
  if (section === 'ev') {
    const tabs = [
      ['Overview', overview], ['Odds Screen', '/ev?sport=' + (sport || 'all') + '#odds'],
      ['Positive EV', '/ev?sport=' + (sport || 'all') + '#ev-pre'],
      ['DFS Props', '/ev?sport=' + (sport || 'all') + '#fantasy'],
      ['Arbitrage', '/ev?sport=' + (sport || 'all') + '#arb-pre'],
      ['Smart Money', '/ev?sport=' + (sport || 'all') + '#sharp'],
      ['Bet Tracker', '/ev?sport=' + (sport || 'all') + '#tracker']
    ];
    return `<header class="site-header ev-site-header" data-site-section="ev" data-site-sport="${sport || ''}"><div class="ev-site-header-inner">
      <a class="ev-site-brand" href="/" aria-label="SportsLab home"><img src="/favicon.svg" width="32" height="32" alt=""><strong>SPORTSLAB</strong></a>
      <div class="ev-top-heading"><h1 id="ev-top-title">Positive EV</h1><span id="ev-top-badge" class="ev-data-badge">Manual prices</span></div>
      <nav class="ev-primary-nav" aria-label="Market workspace">${tabs.map(([label, href]) => `<a href="${esc(href)}" data-ev-nav="${esc(label)}">${esc(label)}</a>`).join('')}</nav>
      <div class="ev-site-actions"><button type="button" data-ev-focus-search aria-label="Search markets" title="Search markets">${icon('search')}</button><span class="ev-action-rule" aria-hidden="true"></span><details class="ev-site-menu"><summary aria-label="Workspace menu"><span>SL</span><span aria-hidden="true">⌄</span></summary><div class="ev-site-menu-panel"><nav aria-label="Workspace navigation">${tabs.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join('')}</nav><div id="ev-menu-actions"></div></div></details><button type="button" data-display-settings aria-label="Display settings" title="Display settings">${icon('gear')}</button></div>
    </div></header>`;
  }
  const brand = `<a class="site-brand" href="/" aria-label="SportsLab home"><img src="/favicon.svg" width="36" height="36" alt=""><span>SPORTSLAB</span></a>`;
  const settings = `<button class="site-settings-toggle" data-display-settings aria-label="Display settings" title="Display settings">${icon('palette')}<span>Appearance</span></button>`;
  const developer = `<button class="site-dev-toggle" data-dev-toggle aria-pressed="false" title="Show model inputs, formulas and source data">${icon('code')}<span>Dev mode</span><b>Off</b></button>`;
  const tabs = sportTools(sport).map(({ key, label, href, devOnly }) => [key, label, href, devOnly]);
  return `<header class="site-header" data-site-section="${section}" data-site-sport="${sport || ''}">
    <div class="site-header-main">
      ${brand}
      <nav class="site-sports" aria-label="Sport">${Object.entries(sports).map(([key, label]) => `<a href="${esc(sportDestination(key, section))}"${key === sport ? ' aria-current="page"' : ''}>${leagueMark(key)}<span>${label}</span></a>`).join('')}</nav>
      <div class="site-header-actions">${developer}${settings}</div>
    </div>
    <div class="site-header-bar"><div class="site-rail-content"><a class="site-overview-link" href="${overview}" aria-label="Overview" title="Overview"${section==='home'?' aria-current="page"':''}>${icon('home')}<span>Overview</span></a><div class="site-sport-context">${sport ? leagueMark(sport) : icon('research')}<span>${sport ? sports[sport] : 'All sports'}</span><span class="rail-context-rule" aria-hidden="true"></span></div><nav class="site-navigation" aria-label="Main navigation">${tabs.map(([key, label, href, devOnly]) => `<a class="site-nav-link${key === 'live' ? ' site-live-link' : ''}" data-nav-section="${key}"${devOnly ? ' data-dev-only' : ''} href="${esc(href)}" aria-label="${label}"${key === section ? ' aria-current="page"' : ''}>${icon(key)}<span>${label}</span></a>`).join('')}</nav><div class="site-personal"><a class="site-tracker${section === 'bets' ? ' active' : ''}" href="${picks}" aria-label="My picks"${section === 'bets' ? ' aria-current="page"' : ''}>${icon('picks')}<span>My picks</span>${icon('chevron','rail-picks-arrow')}</a></div></div></div>
    <nav class="mobile-navigation" aria-label="Mobile navigation"><a href="${overview}"${section==='home'?' aria-current="page"':''}>${icon('home')}<span>Overview</span></a>${tabs.slice(0,2).map(([key,label,href])=>`<a data-nav-section="${key}" href="${esc(href)}"${key===section?' aria-current="page"':''}>${icon(key)}<span>${label}</span></a>`).join('')}<a href="${picks}"${section==='bets'?' aria-current="page"':''}>${icon('picks')}<span>My picks</span></a><button data-navigation-menu aria-label="More navigation" aria-haspopup="dialog">${icon('more')}<span>More</span></button></nav>
  </header>`;
}

// Navigation is present in the initial HTML, independent of data requests or
// page scripts. Every route uses this same header and final layout stylesheet.
export function renderSitePage(html, url) {
  if (siteContext(url).section === 'landing') return html;
  if (!html.includes('<!--site-header-->')) throw Error('Page is missing the shared site header.');
  const { sport, section } = siteContext(url);
  if (['performance', 'paper'].includes(section)) {
    html = html.replace(/<main([^>]*)>/, `<section class="developer-gate" aria-labelledby="developer-title"><span class="developer-gate-icon">${icon('code')}</span><h2 id="developer-title">Developer workspace</h2><p>Performance and paper returns are available in Dev mode.</p><button class="button" data-dev-toggle aria-pressed="false">Enable Dev mode</button><a href="/${sport || 'nfl'}">Back to Model ${icon('arrow')}</a></section><main$1 data-dev-only>`);
  }
  if (section === 'home') {
    const destinations = { 'full-research':'research', 'home-all':'research', 'home-model':'research', 'home-trends':'trends', 'home-live':'live', 'home-simulation':'simulation', 'home-picks':'bets' };
    const supported = new Set(sportTools(sport).map(tool => tool.key));
    html = html.replace(/<a id="(full-research|home-all|home-model|home-trends|home-live|home-simulation|home-picks)"([^>]*)>/g, (_, id, attributes) => {
      const key = destinations[id], hidden = key !== 'bets' && !supported.has(key);
      return `<a id="${id}"${attributes.replace(/href="[^"]*"/, `href="${esc(sportDestination(sport, key))}"`)}${hidden ? ' hidden' : ''}>`;
    });
  }
  return html.replace('<!--site-header-->', siteHeader(url))
    .replace('</main>', `${researchGuide(url)}</main>`)
    .replace('</head>', '<link rel="stylesheet" href="/site-layout.css"><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/player-research.css"><link rel="stylesheet" href="/app-design.css"><link rel="stylesheet" href="/dashboard.css"><script type="module" src="/site-preferences.js"></script><script type="module" src="/workspace-ui.js"></script>'+ (section === 'bets' ? '<link rel="stylesheet" href="/bets.css">' : '') + '<link rel="stylesheet" href="/ui-theme.css"><link rel="stylesheet" href="/reference-design.css"><link rel="stylesheet" href="/sites-redesign.css?v=2">' + (section === 'ev' ? '<link rel="stylesheet" href="/ev.css?v=18"><link rel="stylesheet" href="/ev-book-picker.css?v=3"><link rel="stylesheet" href="/ev-filter-polish.css?v=5">' : '<link rel="stylesheet" href="/dashboard-unified.css?v=2">') + '</head>')
    .replace(/<body([^>]*)>/, (_, attrs) => `<body${/class=/.test(attrs) ? attrs.replace(/class="([^"]*)"/, 'class="$1 site-layout ui-theme reference-design"') : attrs + ' class="site-layout ui-theme reference-design"'}>`);
}

// Display-only context, shared by every tool. Model and API values stay untouched.
function researchGuide(url) {
  const { section, sport } = siteContext(url);
  if (section === 'home' || section === 'trends') return '';
  const notes = {
    research: 'Experimental estimates · inspect samples and source freshness.',
    trends: 'Historical results · past hit rates are not future probabilities.',
    live: 'Experimental live estimates · public feeds may lag the game.',
    simulation: 'Experimental scenarios · more runs do not prove accuracy.',
    performance: 'NFL evidence archive · historical tests are reconstructions.',
    paper: `${sport === 'mlb' ? 'MLB' : 'NFL'} paper record · hypothetical one-unit returns.`,
    bets: 'Personal records · stored in this browser, with no device sync.',
    ev: 'EV workbench · market entries are examples or manual inputs until a feed is connected.'
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
