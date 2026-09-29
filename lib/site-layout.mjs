import { MORE_TOOL_GROUPS, evToolUrl } from '../public/ev-tool-catalog.js';
import { siteProductSwitcher } from './product-switcher.mjs';
import { sportsbookStatePicker } from './sportsbook-state-picker.mjs';
import { icon } from '../public/ui-icons.js';
import {leagueMark} from '../public/sports-identity.js';
import { SPORTS as sports, sportTools, sportDestination, betTrackerUrl, workspaceProduct, productDashboardUrl, productTools } from '../public/navigation.js';
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
  if (['/trends', '/models', '/ev/dashboard'].includes(path)) {
    const product = path === '/ev/dashboard' ? 'ev' : path.slice(1);
    return { sport: Object.hasOwn(sports, url.searchParams.get('sport')) ? url.searchParams.get('sport') : product === 'ev' ? null : 'mlb', section: product + '-home' };
  }
  if (path === '/research') return { sport: Object.hasOwn(sports, url.searchParams.get('sport')) ? url.searchParams.get('sport') : 'mlb', section: 'home' };
  const section = path === '/simulation' || /^\/(nfl|nba|wnba|mlb|nhl|soccer)\/simulation$/.test(path) ? 'simulation' : (Object.hasOwn(sports, segment) && path === '/' + segment || path === '/') && url.searchParams.get('view') === 'trends' ? 'trends' : path === '/ev' ? 'ev' : ['/bets', '/ev/tracker'].includes(path) ? 'bets' : path === '/performance' ? 'performance' : path === '/paper' ? 'paper' : path === '/live' || path.endsWith('/live') ? 'live' : 'research';
  const sport = Object.hasOwn(sports, segment) ? segment : section === 'paper' ? url.searchParams.get('sport') === 'mlb' ? 'mlb' : 'nfl' : ['bets', 'ev'].includes(section) && Object.hasOwn(sports, url.searchParams.get('sport')) ? url.searchParams.get('sport') : ['bets', 'ev', 'live'].includes(section) ? null : 'nfl';
  return { sport, section };
}

// Plan feature that unlocks each sidebar destination. `features === null` means the
// viewer's plan is unknown (public or unconfigured routes), so every link renders.
const LINK_FEATURES = { home:'research', trends:'trends', models:'models', ev:'ev-feed', bets:'bet-tracker' };
export const allowsLink = (features, key) => !Array.isArray(features) || !LINK_FEATURES[key] || features.includes(LINK_FEATURES[key]);

const GROUPS = { trends:['Trends','Player & team trends','trends','Trends workspace'], models:['Models','Projections & research','research','Model workspace'], ev:['+EV','Odds & opportunities','ev','Market workspace'] };
// Which workspace group the sidebar shows: the page's own product, or on the shared
// Dashboard the group the viewer last picked. Only groups in the plan qualify.
export function sidebarGroup(section, features = null, preferred = null) {
  const allowed = Object.keys(GROUPS).filter(key => allowsLink(features, key));
  const own = section === 'home' ? null : workspaceProduct(section);
  if (own && allowed.includes(own)) return own;
  if (allowed.includes(preferred)) return preferred;
  return allowed.includes('models') ? 'models' : allowed[0] || null;
}

export function siteHeader(url, { features = null, group: preferredGroup = null } = {}) {
  const { sport, section } = siteContext(url), product = workspaceProduct(section), picks = betTrackerUrl(sport);
  const ev = product === 'ev', selectedProduct = section === 'home' ? 'home' : section === 'bets' ? 'bets' : product;
  const activeSection = section === 'trends' && url.searchParams.get('saved') === '1' ? 'watchlist' : section;
  const selectedTool = section === 'ev' ? url.hash.slice(1) || 'ev-pre' : '';
  const group = sidebarGroup(section, features, preferredGroup);
  // Each group starts with its own dashboard; Bet Tracker is shared by every plan.
  const mainLinks = [
    ['bets','Bet Tracker',picks,'picks']
  ].filter(([key])=>allowsLink(features,key));
  const pageLabel = {home:'Dashboard',bets:'Bet Tracker',trends:'Trends',models:'Models',ev:'+EV'}[selectedProduct] || 'Dashboard';
  const marketTools = [
    {key:'odds',label:'Odds Screen',icon:'research',description:'Every book, side by side'},
    {key:'ev-pre',label:'Positive EV',icon:'ev',description:'Prices above fair value'},
    {key:'fantasy',label:'DFS Props',icon:'players',description:'Pick lines against sharp odds'},
    {key:'arb-pre',label:'Arbitrage',icon:'expand',description:'Lock in both sides of a gap'},
    {key:'sharp',label:'Smart Money',icon:'performance',description:'Where sharp action is landing'}
  ];
  const toolLink = (tool, primary = false) => `<a class="dashboard-tool-link" href="${esc(evToolUrl(tool.key,sport))}" aria-label="${esc(tool.label)}" ${primary ? `data-ev-nav="${esc(tool.label)}"` : `data-more-tool="${tool.key}"`}${selectedTool === tool.key ? ' aria-current="page"' : ''}>${icon(tool.icon)}${primary?`<span>${esc(tool.label)}</span>`:`<span class="dashboard-tool-copy"><strong>${esc(tool.label)}</strong>${tool.description?`<small>${esc(tool.description)}</small>`:''}</span>`}</a>`;
  const groups = MORE_TOOL_GROUPS;
  const moreSelected = groups.some(group => group.tools.some(tool => tool.key === selectedTool));
  const contextLabel = group ? GROUPS[group][3] : '';
  const groupHome = group ? `<a class="dashboard-group-home" data-dashboard-section="${group}" href="${esc(productDashboardUrl(group,sport))}"${section===group+'-home'?' aria-current="page"':''}>${icon('home')}<span>Dashboard</span></a>` : '';
  const contextLinks = !group ? '' : group === 'ev' ? `<nav class="ev-primary-nav" aria-label="Market workspace">${marketTools.map(tool=>toolLink(tool,true)).join('')}</nav>` : `<nav class="site-navigation" aria-label="${group === 'trends' ? 'Trends' : 'Models'} navigation">${productTools(group,sport).map(({key,label,href,devOnly})=>`<a class="site-nav-link${key === 'live' ? ' site-live-link' : ''}" data-nav-section="${key}"${devOnly ? ' data-dev-only' : ''} href="${esc(href)}" aria-label="${esc(label)}"${key === activeSection ? ' aria-current="page"' : ''}>${icon(key === 'watchlist' ? 'bookmark' : key)}<span>${esc(label)}</span></a>`).join('')}</nav>`;
  const settings = `<a class="site-settings-toggle" href="/account" aria-label="Account settings">${icon('settings')}<span>Account</span></a><button class="site-settings-toggle" data-display-settings aria-label="Display settings" title="Display settings">${icon('palette')}<span>Appearance</span></button>`;
  const developer = `<button class="site-dev-toggle" data-dev-toggle aria-pressed="false" title="Show model inputs, formulas and source data">${icon('code')}<span>Dev mode</span><b>Off</b></button>`;
  const workspaceActions = section === 'ev' ? `<details class="dashboard-workspace-actions"><summary>${icon('settings')}<span>Workspace tools</span>${icon('chevron')}</summary><div id="ev-menu-actions"></div></details>` : '';
  return `<div class="dashboard-mobile-bar"><button type="button" data-sidebar-toggle aria-controls="dashboard-sidebar" aria-expanded="false" aria-label="Open navigation"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a class="dashboard-mobile-brand" href="${esc(group ? productDashboardUrl(group,sport) : picks)}"><img src="/favicon.svg" width="26" height="26" alt=""><strong>Visual<span>Odds</span></strong></a><span>${esc(pageLabel)}</span></div>
  <header class="site-header dashboard-sidebar${ev ? ' ev-site-header' : ''}" id="dashboard-sidebar" data-site-section="${section}" data-site-product="${product}" data-site-group="${group || ''}" data-site-sport="${sport || ''}" aria-label="Workspace navigation" tabindex="-1">
    <div class="dashboard-sidebar-top">${siteProductSwitcher(sport,section,ev,features,group)}<button type="button" data-sidebar-close aria-label="Close navigation">${icon('close')}</button></div>
    <div class="dashboard-sidebar-scroll">
      ${group?`<section class="dashboard-sidebar-group" data-group="${group}"><h2 class="dashboard-nav-label">${contextLabel}</h2>${groupHome}${contextLinks}</section>`:''}
      ${group==='ev'?`<details class="dashboard-more-tools${moreSelected?' has-current-tool':''}"><summary aria-controls="dashboard-tool-groups" aria-expanded="false">${icon('more')}<span>More tools</span>${icon('chevron')}</summary><div class="dashboard-tool-groups" id="dashboard-tool-groups" role="region" aria-labelledby="dashboard-tools-title"><header class="dashboard-tools-heading"><div><h2 id="dashboard-tools-title">More tools</h2><span>${groups.reduce((count,group)=>count+group.tools.length,0)} tools in your workspace</span></div><button type="button" data-more-close aria-label="Close more tools">${icon('close')}</button></header><div class="dashboard-tools-grid">${groups.map(group=>`<section><h3 class="dashboard-nav-label">${esc(group.label)}</h3><nav aria-label="${esc(group.label)} tools">${group.tools.map(tool=>toolLink(tool)).join('')}</nav></section>`).join('')}</div></div></details>`:''}
      ${mainLinks.length?`<section class="dashboard-sidebar-group dashboard-shared-group"><h2 class="dashboard-nav-label">General</h2><nav class="dashboard-primary-nav" aria-label="Main navigation">${mainLinks.map(([key,label,href,glyph])=>`<a class="dashboard-primary-link${key===selectedProduct?' site-overview-link':''}" data-dashboard-section="${key}" href="${esc(href)}"${key===selectedProduct?' aria-current="page"':''}>${icon(glyph)}<span>${esc(label)}</span></a>`).join('')}</nav></section>`:''}
    </div>
    <footer class="dashboard-sidebar-footer">${ev?`<div class="ev-top-heading"><h2 id="ev-top-title">${section==='ev-home'?'+EV overview':section==='bets'?'Bet Tracker':'Positive EV'}</h2><span id="ev-top-badge" class="ev-data-badge">${section==='bets'?'Personal records':'Manual prices'}</span></div>${sportsbookStatePicker()}${workspaceActions}`:''}<div class="dashboard-sidebar-actions">${settings}${developer}</div></footer>
    <nav class="site-sports" aria-label="Sport">${Object.entries(sports).map(([key,label])=>`<a data-sport="${key}" href="${esc(sportDestination(key,section)+(activeSection==='watchlist'?'&saved=1':''))}"${key===sport?' aria-current="page"':''}>${leagueMark(key)}<span>${label}</span></a>`).join('')}</nav>
  </header><div class="dashboard-sidebar-backdrop" hidden></div>`;
}

// Navigation is present in the initial HTML, independent of data requests or
// page scripts. Every route uses this same header and final layout stylesheet.
export function renderSitePage(html, url, { features = null, group = null } = {}) {
  if (siteContext(url).section === 'landing') return html;
  if (!html.includes('<!--site-header-->')) throw Error('Page is missing the shared site header.');
  const { sport, section } = siteContext(url);
  if (['performance', 'paper'].includes(section)) {
    html = html.replace(/<main([^>]*)>/, `<section class="developer-gate" aria-labelledby="developer-title"><span class="developer-gate-icon">${icon('code')}</span><h2 id="developer-title">Developer workspace</h2><p>Performance and paper returns are available in Dev mode.</p><button class="button" data-dev-toggle aria-pressed="false">Enable Dev mode</button><a href="/${sport || 'nfl'}">Back to Model ${icon('arrow')}</a></section><main$1 data-dev-only>`);
  }
  if (section === 'home' || section.endsWith('-home')) {
    const destinations = { 'full-research':'research', 'home-all':'research', 'home-model':'research', 'home-trends':'trends', 'home-live':'live', 'home-simulation':'simulation', 'home-picks':'bets' };
    const supported = new Set(sportTools(sport).map(tool => tool.key));
    html = html.replace(/<a id="(full-research|home-all|home-model|home-trends|home-live|home-simulation|home-picks)"([^>]*)>/g, (_, id, attributes) => {
      const key = destinations[id], hidden = key !== 'bets' && !supported.has(key);
      return `<a id="${id}"${attributes.replace(/href="[^"]*"/, `href="${esc(sportDestination(sport, key))}"`)}${hidden ? ' hidden' : ''}>`;
    });
  }
  return html.replace('<!--site-header-->', siteHeader(url, { features, group }))
    .replace('</head>', (['ev','bets','ev-home'].includes(section) ? '<link rel="stylesheet" href="/sportsbook-state.css?v=2"><script type="module" src="/sportsbook-state.js?v=2"></script>' : '') + '</head>')
    .replace('</main>', `${researchGuide(url)}</main>`)
    .replace('</head>', '<link rel="stylesheet" href="/site-layout.css"><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/player-research.css"><link rel="stylesheet" href="/app-design.css"><link rel="stylesheet" href="/dashboard.css"><script type="module" src="/site-preferences.js"></script><script type="module" src="/workspace-ui.js?v=2"></script>'+ (section === 'bets' ? '<link rel="stylesheet" href="/bets.css">' : '') + '<link rel="stylesheet" href="/ui-theme.css"><link rel="stylesheet" href="/reference-design.css"><link rel="stylesheet" href="/sites-redesign.css?v=4">' + (['ev','bets','ev-home'].includes(section) ? '<link rel="stylesheet" href="/ev.css?v=28"><link rel="stylesheet" href="/dfs-workspace.css?v=10"><link rel="stylesheet" href="/ev-book-picker.css?v=4"><link rel="stylesheet" href="/ev-filter-polish.css?v=13"><link rel="stylesheet" href="/smart-money.css?v=17"><link rel="stylesheet" href="/ev-arb-reference.css?v=7"><link rel="stylesheet" href="/bet-comparison.css?v=3"><link rel="stylesheet" href="/bet-inline.css?v=4">' : '<link rel="stylesheet" href="/dashboard-unified.css?v=4"><link rel="stylesheet" href="/research-filters.css?v=1"><link rel="stylesheet" href="/research-details.css?v=2">') + (section === 'bets' ? '<link rel="stylesheet" href="/bet-tracker-reference.css?v=18"><link rel="stylesheet" href="/bet-comparison.css?v=3"><link rel="stylesheet" href="/bet-inline.css?v=4">' : '') + '<link rel="stylesheet" href="/product-switcher.css?v=2"><script type="module" src="/product-switcher.js?v=2"></script>' + '' + '</head>')
    .replace('</head>', (['ev','bets','ev-home'].includes(section) ? '<link rel="stylesheet" href="/ev-more-tools.css?v=2">' : '') + '</head>')
    .replace('</head>', (['ev','bets','ev-home'].includes(section) ? '<link rel="stylesheet" href="/ev-bet-cards.css?v=1"><link rel="stylesheet" href="/ev-board.css?v=3"><link rel="stylesheet" href="/ev-controls.css?v=5"><link rel="stylesheet" href="/line-history.css?v=1">' : '') + '<link rel="stylesheet" href="/dashboard-navigation.css?v=1"><script type="module" src="/dashboard-navigation.js?v=2"></script><link rel="stylesheet" href="/workspace-palette.css?v=2"></head>')
    .replace('</head>', (section === 'ev' ? '<link rel="stylesheet" href="/ev-mobile.css?v=1">' : '') + '<link rel="stylesheet" href="/mobile-workspace.css?v=1"><script type="module" src="/mobile-workspace.js?v=1"></script><link rel="stylesheet" href="/sportslab-2026.css?v=2"><link rel="stylesheet" href="/trends-board.css?v=1"><link rel="stylesheet" href="/models-board.css?v=1"><link rel="stylesheet" href="/hub-pages.css?v=3"><link rel="stylesheet" href="/player-detail.css?v=1"><link rel="stylesheet" href="/live-sim.css?v=1"><link rel="stylesheet" href="/tracker-2026.css?v=1"><link rel="stylesheet" href="/ev-suite-2026.css?v=1"><link rel="stylesheet" href="/boards-polish.css?v=1">' + (section === 'home' || section.endsWith('-home') ? '<link rel="stylesheet" href="/home-dashboard.css?v=2">' : '') + '</head>')
    .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')
    .replace(/<body([^>]*)>/, (_, attrs) => `<body${/class=/.test(attrs) ? attrs.replace(/class="([^"]*)"/, 'class="$1 site-layout ui-theme reference-design has-dashboard-sidebar"') : attrs + ' class="site-layout ui-theme reference-design has-dashboard-sidebar"'} data-site-page="${section}">`);
}

// Display-only context, shared by every tool. Model and API values stay untouched.
function researchGuide(url) {
  const { section, sport } = siteContext(url);
  if (section === 'home' || section === 'trends' || section.endsWith('-home')) return '';
  const notes = {
    research: 'Experimental estimates · inspect samples and source freshness.',
    trends: 'Historical results · past hit rates are not future probabilities.',
    live: 'Experimental live estimates · public feeds may lag the game.',
    simulation: 'Experimental scenarios · more runs do not prove accuracy.',
    performance: 'NFL evidence archive · historical tests are reconstructions.',
    paper: `${sport === 'mlb' ? 'MLB' : 'NFL'} paper record · hypothetical one-unit returns.`,
    bets: 'Personal records · saved to your signed-in account; check the save status before changing devices.',
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
