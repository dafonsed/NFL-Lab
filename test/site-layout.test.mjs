import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { renderSitePage, siteHeader, siteContext, legacyResearchUrl } from '../lib/site-layout.mjs';
import { sportTools, sportDestination, betTrackerUrl } from '../public/navigation.js';
import { renderProductDashboard } from '../lib/product-dashboards.mjs';
import { MORE_TOOLS } from '../public/ev-tool-catalog.js';

test('developer tools remain available only through the Dev mode gate', async () => {
  for (const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const $=load(siteHeader(new URL('http://localhost/'+sport)));
    for(const tool of sportTools(sport).filter(tool=>['performance','paper'].includes(tool.key))) {
      assert.equal(tool.devOnly,true);
      assert.equal($(`.site-navigation [data-nav-section=${tool.key}][data-dev-only]`).length,1);
    }
    assert.equal($('.mobile-navigation [data-nav-section=paper],.mobile-navigation [data-nav-section=performance]').length,0);
  }
  for(const name of ['performance','paper']) {
    const template=await fs.readFile(new URL(`../public/${name}.html`,import.meta.url),'utf8');
    const $=load(renderSitePage(template,new URL('http://localhost/'+name)));
    assert.equal($('main[data-dev-only]').length,1);
    assert.equal($('.developer-gate [data-dev-toggle]').length,1);
    assert.equal($('.developer-gate a').attr('href'),'/nfl');
  }
});

test('sport tool capabilities prevent cross-sport pages and unsupported destinations', () => {
  for (const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const tools = sportTools(sport), keys = tools.map(tool => tool.key);
    assert.equal(keys.includes('performance'), sport === 'nfl');
    assert.equal(keys.includes('paper'), ['nfl','mlb'].includes(sport));
    assert.equal(keys.includes('live'), ['nfl','mlb','nba','wnba'].includes(sport));
    assert.equal(keys.includes('simulation'), ['nfl','mlb','nba','wnba'].includes(sport));
    for (const section of ['research','ev','trends','live','simulation','performance','paper','home','bets']) {
      const $ = load(siteHeader(new URL(sportDestination(sport,section), 'http://localhost')));
      if(['ev','bets'].includes(section)) {
        assert.equal($(`.dashboard-group-home[data-dashboard-section=ev][href="/ev/dashboard?sport=${sport}"]`).length,1);
        assert.equal($('.ev-primary-nav a[href="/ev?sport='+sport+'#odds"]').length,1);
      } else {
        assert.equal($('.site-sports [aria-current]').text(), sport === 'soccer' ? 'Soccer' : sport.toUpperCase());
        assert.equal($('.dashboard-group-home').attr('href'), (section === 'trends' ? '/trends' : '/models') + '?sport=' + sport);
      }
      if(sport !== 'nfl') assert.equal($('.site-navigation a[href="/performance"]').length,0);
      if(!['nfl','mlb'].includes(sport)) assert.equal($('.site-navigation a[href^="/paper"]').length,0);
    }
  }
  assert.equal(sportDestination('mlb','paper'), '/paper?sport=mlb');
  assert.equal(sportDestination('mlb','ev'), '/ev?sport=mlb');
  assert.equal(sportDestination('nba','performance'), '/nba');
  assert.equal(sportDestination('nhl','simulation'), '/nhl');
  assert.equal(sportDestination('invalid','research'), '/research');
});

test('the shared Trends sidebar keeps its watchlist and product switcher sport-aware', () => {
  for(const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const $=load(siteHeader(new URL('http://localhost/'+sport+'?view=trends')));
    assert.equal($('#dashboard-sidebar .site-navigation [data-nav-section=watchlist]').text(),'Watchlist');
    assert.equal($('#dashboard-sidebar .site-navigation [data-nav-section=watchlist]').attr('href'),'/'+sport+'?view=trends&saved=1');
    assert.equal($('.site-navigation [aria-current]').text(),'Player trends');
    assert.equal($('.mobile-navigation').length,0,'mobile opens the same sidebar instead of duplicating links');
    assert.equal($('.site-product-menu [data-product=models]').attr('href'),'/models?sport='+sport);
    assert.equal($('.site-product-menu [data-product=ev]').attr('href'),'/ev/dashboard?sport='+sport);
  }
});

test('Trends and Models expose one sport-aware Bet Tracker in the shared sidebar', () => {
  for (const product of ['trends', 'models']) {
    for (const sport of ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']) {
      const $ = load(siteHeader(new URL(`http://localhost/${product}?sport=${sport}`)));
      const expected = betTrackerUrl(sport);
      const tracker=$(`.dashboard-primary-link[href="${expected}"]`);
      assert.equal(tracker.length,1);
      assert.equal(tracker.closest('#dashboard-sidebar').length,1);
      assert.equal(tracker.text().trim(),'Bet Tracker');
      assert.equal($('.site-navigation [data-nav-section=bets]').length,0,'tracker is not repeated among context tools');
    }
  }
});

test('EV workbench keeps sport context and loads its own page assets', async () => {
  const url = new URL('http://localhost/ev?sport=wnba');
  assert.deepEqual(siteContext(url), { sport:'wnba', section:'ev' });
  const template = await fs.readFile(new URL('../public/ev.html', import.meta.url), 'utf8');
  const $ = load(renderSitePage(template,url));
  assert.equal($('.ev-site-brand').text().trim(),'VisualOdds');
  assert.equal($('.ev-primary-nav a[href="/ev?sport=wnba#fantasy"]').text(),'DFS Props');
  assert.equal($('script[src^="/ev.js?"]').length,1);
  assert.equal($('link[rel="stylesheet"][href^="/ev.css?"]').length,1);
  assert.equal($('link[rel="stylesheet"][href="/ev-more-tools.css?v=2"]').length,1);
  const styles=$('link[rel=stylesheet]').map((_,el)=>$(el).attr('href')).get();
  const palette=styles.findIndex(href=>href.startsWith('/workspace-palette.css'));
  const cards=styles.findIndex(href=>href.startsWith('/ev-bet-cards.css'));
  assert.ok(cards>styles.indexOf('/ev-more-tools.css?v=1')&&palette>cards,'shared cards precede the palette, after tool styles');
  assert.ok(styles.every((href,index)=>index<=palette||href.startsWith('/mobile-workspace.css')||href.startsWith('/ev-mobile.css')||href.startsWith('/sportslab-2026.css')||/^\/(trends-board|models-board|hub-pages|home-dashboard|player-detail|live-sim|tracker-2026|ev-suite-2026|boards-polish)\.css/.test(href)),'only the shared and EV responsive sheets may follow the palette');
  assert.ok(styles.slice(styles.findIndex(href=>href.startsWith('/sportslab-2026.css'))+1).every(href=>/^\/(trends-board|models-board|hub-pages|home-dashboard|player-detail|live-sim|tracker-2026|ev-suite-2026|boards-polish)\.css/.test(href)),'only the 2026 area sheets follow the 2026 design system');
  assert.equal($('script[type=module][src^="/dashboard-navigation.js"]').length,1);
});

test('overview shortcuts use the selected sport before scripts or data requests finish', async () => {
  const template = await fs.readFile(new URL('../public/home.html', import.meta.url), 'utf8');
  for(const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const $=load(renderSitePage(template,new URL('http://localhost/research?sport='+sport)));
    assert.equal($('#home-trends').attr('href'),'/'+sport+'?view=trends');
    assert.equal($('#home-live').attr('hidden')!==undefined,['nhl','soccer'].includes(sport));
    assert.equal($('.product-tools a[href="/performance"]').length,0);
  }
});

const routes = [
  ['/nfl?view=games', 'index', '/nfl/live'], ['/nfl/', 'index', '/nfl/live'], ['/mlb', 'mlb', '/mlb/live'], ['/nba', 'sports', '/nba/live'], ['/wnba/', 'sports', '/wnba/live'],
  ['/nhl', 'sports', null], ['/soccer', 'sports', null], ['/nfl/live', 'live', '/nfl/live'], ['/mlb/live', 'live-sports', '/mlb/live'],
  ['/nba/live', 'live-sports', '/nba/live'], ['/wnba/live', 'live-sports', '/wnba/live'], ['/performance', 'performance', '/nfl/live'],
  ['/paper', 'paper', '/nfl/live'], ['/paper?sport=mlb', 'paper', '/mlb/live'], ['/live', 'live-hub', '/live']
];

test('public homepage is separate from the sport-aware research workspace', async () => {
  const root = new URL('http://localhost/');
  assert.deepEqual(siteContext(root), { sport: null, section: 'landing' });
  const homepage = await fs.readFile(new URL('../public/landing.html', import.meta.url), 'utf8');
  const $ = load(renderSitePage(homepage, root));
  assert.equal($('.site-header').length, 0);
  assert.equal($('.dashboard-sidebar,.dashboard-mobile-bar').length,0);
  assert.equal($('h1').text(), 'Find the edge.Track every result.');
  assert.equal($('script[src="/home.js"]').length, 0);
  assert.equal($('.home-header-action').attr('href'), '/research');
  assert.equal($('.home-menu-toggle').attr('aria-controls'), 'home-nav');
  assert.equal($('.home-hero .home-button').attr('href'), '/research');
  assert.equal($('.hero-brand-set').length, 2);
  assert.equal($('#home-live-panel').length, 1);
  assert.equal($('#home-tool-panel').length, 1);
  assert.equal($('#hero-tracker').length, 1);
  assert.equal($('#home-pricing-grid').length, 1);
  assert.equal($('#home-review-viewport').length, 1);
  assert.equal($('script[src="/landing.js?v=11"]').length, 1);
  assert.equal($('link[rel="stylesheet"]').last().attr('href'), '/landing-2026.css?v=7');
  const workspace = new URL('http://localhost/research?sport=wnba');
  assert.deepEqual(siteContext(workspace), { sport: 'wnba', section: 'home' });
  const nav = load(siteHeader(workspace));
  assert.equal(nav('.site-sports [aria-current="page"]').attr('href'), '/research?sport=wnba');
  assert.equal(nav('.dashboard-group-home').attr('href'), '/models?sport=wnba', 'the retired combined dashboard opens a workspace dashboard');
  assert.equal(nav('.workspace-home-link').length, 0, 'No duplicate overview shortcut');
  assert.equal(nav('.site-brand').attr('href'), '/');
  assert.equal(nav('.site-product-menu [aria-current]').length, 0, 'the Dashboard is not presented as one of the product workspaces');
  const watchlist = load(siteHeader(new URL('http://localhost/nba?view=trends&saved=1')));
  assert.deepEqual(watchlist('.site-sports a').map((_, a) => watchlist(a).attr('href')).get(), ['nfl','mlb','nba','wnba','nhl','soccer'].map(code => `/${code}?view=trends&saved=1`), 'sport pills keep the watchlist open');
  assert.deepEqual(watchlist('.site-sports a').map((_, a) => watchlist(a).attr('data-sport')).get(), ['nfl','mlb','nba','wnba','nhl','soccer']);
});

test('saved root research links preserve their exact context while ordinary visits stay on the homepage', () => {
  for (const query of ['', '?utm_source=bookmark', '?unrelated=value']) assert.equal(legacyResearchUrl(new URL('http://localhost/' + query)), null);
  for (const query of ['?sport=mlb&date=2026-09-23&prop=hits&researchPlayer=mlb%3A823894%3A605141%3Ahits', '?sport=wnba&game=401857208', '?period=2026-3']) {
    assert.equal(legacyResearchUrl(new URL('http://localhost/' + query)), '/research' + query);
  }
  assert.equal(legacyResearchUrl(new URL('http://localhost/?view=board&season=2026&week=3&market=rec_yds')), '/nfl?view=board&season=2026&week=3&market=rec_yds');
  assert.equal(legacyResearchUrl(new URL('http://localhost/research?sport=mlb')), null);
});

test('every page renders the same working navigation and Live link before any JavaScript runs', async () => {
  for (const [route, template, target] of routes) {
    const html = renderSitePage(await fs.readFile(new URL(`../public/${template}.html`, import.meta.url), 'utf8'), new URL(route, 'http://localhost'));
    const $ = load(html);
    assert.equal($('.site-header').length, 1, route);
    assert.equal($('.site-live-link').length, target ? 1 : 0, route);
    assert.equal($('.site-live-link').attr('href') || null, target, route);
    const sport=siteContext(new URL(route,'http://localhost')).sport;
    const labels=!sport?['Live sports']:['Projections',...(['nfl','mlb','nba','wnba'].includes(sport)?['Live games','Simulation']:[]),...(sport==='nfl'?['Performance']:[]),...(['nfl','mlb'].includes(sport)?['Paper returns']:[])];
    assert.deepEqual($('.site-navigation a').map((_, a) => $(a).text().trim()).get(), labels, route);
    assert.ok($('.site-navigation a').toArray().every(a => $(a).attr('aria-label')), 'Icon rail links retain accessible labels');
    assert.deepEqual($('.site-sports a').map((_, a) => $(a).text()).get(), ['NFL', 'MLB', 'NBA', 'WNBA', 'NHL', 'Soccer'], route);
    assert.equal($('.site-product-menu [data-product=ev]').attr('href'), '/ev/dashboard?sport='+(sport||'all'));
    assert.equal($('body.site-layout').length, 1); assert.equal($('main#main').length, 1);
    assert.equal($('.page-heading h1,.tracker-page-heading h1').length, 1);
    for (const asset of ['/dashboard-unified.css?v=4','/research-filters.css?v=1','/research-details.css?v=2']) assert.equal($(`link[rel="stylesheet"][href="${asset}"]`).length, 1, asset);
    assert.equal($('body.ui-theme').length,1,'Every workspace uses the shared control theme');
    assert.equal(html.includes('<!--site-header-->'), false);
    const ids = $('[id]').map((_, e) => $(e).attr('id')).get(); assert.equal(new Set(ids).size, ids.length, `Duplicate IDs on ${route}`);
  }
});

test('live sport switches retain the live section only for supported sports', () => {
  const $ = load(siteHeader(new URL('http://localhost/mlb/live/')));
  assert.equal($('.site-nav-link[aria-current="page"]').text().trim(), 'Live games');
  assert.equal($('.site-sports [aria-current="page"]').text(), 'MLB');
  assert.deepEqual($('.site-sports a').map((_, e) => $(e).attr('href')).get(), ['/nfl/live', '/mlb/live', '/nba/live', '/wnba/live', '/nhl', '/soccer']);
});

test('shared layout retains the sport-specific research controls and personal workspace classes', async () => {
  const required = { index: ['navigation','status-button','week-select'], mlb: ['mlb-navigation','data-button','batter-markets','pitcher-markets'], sports: ['views','players-tab','rankings-tab','records-button','model-button','connection'], bets: ['bet-form','leg-editor'] };
  for (const [page, ids] of Object.entries(required)) {
    const $ = load(renderSitePage(await fs.readFile(new URL(`../public/${page}.html`, import.meta.url), 'utf8'), new URL('http://localhost/' + (page === 'sports' ? 'wnba' : page))));
    for (const id of ids) assert.equal($('#' + id).length, 1, `${page}: ${id}`);
    if (page === 'mlb' || page === 'bets') assert.equal($('body').hasClass(page + '-app'), true);
  }
});

test('navigation context cannot inject untrusted query parameters and the live directory exposes four real boards', async () => {
  const url = new URL('http://localhost/paper?sport=%22%3E%3Cscript%3Ealert(1)%3C/script%3E');
  assert.deepEqual(siteContext(url), { sport: 'nfl', section: 'paper' }); assert.ok(!siteHeader(url).includes('<script>'));
  const $ = load(await fs.readFile(new URL('../public/live-hub.html', import.meta.url), 'utf8'));
  assert.deepEqual($('.live-directory a').map((_, e) => $(e).attr('href')).get(), ['/nfl/live','/mlb/live','/nba/live','/wnba/live']);
  assert.deepEqual($('.live-directory a strong').map((_, e) => $(e).text()).get(), ['NFL','MLB','NBA','WNBA']);
});

test('all dashboard route families render one sidebar and keep tool navigation out of the mobile bar', async () => {
  const pages=[...routes,['/research?sport=nba','home'],['/nfl?view=trends','trends'],['/mlb?view=trends&saved=1','trends'],['/nfl/simulation','simulation'],['/ev?sport=nba#odds','ev'],['/ev?sport=all#fantasy','ev'],['/ev/tracker?sport=wnba','bets'],['/bets?sport=mlb','bets'],['/trends?sport=nhl',null],['/models?sport=soccer',null],['/ev/dashboard?sport=nfl',null]];
  for(const [route,name] of pages) {
    const url=new URL(route,'http://localhost');
    const template=name?await fs.readFile(new URL(`../public/${name}.html`,import.meta.url),'utf8'):renderProductDashboard(url);
    const $=load(renderSitePage(template,url));
    assert.equal($('body.has-dashboard-sidebar').length,1,route);
    assert.equal($('#dashboard-sidebar.site-header.dashboard-sidebar').length,1,route);
    assert.equal($('.dashboard-primary-nav').closest('#dashboard-sidebar').length,1,route);
    assert.equal($('.dashboard-primary-link').length,1,route);
    assert.equal($('.site-group-toggle').length,1,route);
    assert.equal($('.dashboard-sidebar-group[data-group]').length,1,`${route}: one workspace group at a time`);
    for(const nav of $('.site-navigation,.ev-primary-nav,.dashboard-more-tools').toArray()) assert.equal($(nav).closest('#dashboard-sidebar').length,1,route);
    assert.equal($('.site-header-main,.site-header-bar,.mobile-navigation').length,0,`${route}: old top/bottom navigation is removed`);
    assert.equal($('.dashboard-mobile-bar .site-navigation,.dashboard-mobile-bar .ev-primary-nav,.dashboard-mobile-bar .dashboard-primary-nav').length,0,route);
    assert.equal($('.dashboard-mobile-bar [data-sidebar-toggle][aria-controls="dashboard-sidebar"][aria-expanded="false"]').length,1,route);
    assert.equal($('#dashboard-sidebar [data-sidebar-close]').length,1,route);
    assert.equal($('.dashboard-sidebar-backdrop[hidden]').length,1,route);
    assert.equal($('.dashboard-more-tools[open]').length,0,`${route}: tools are collapsed until requested`);
    const moreTools=$('#dashboard-sidebar').attr('data-site-group')==='ev'?1:0;
    assert.equal($('.dashboard-more-tools > summary[aria-controls="dashboard-tool-groups"][aria-expanded="false"]').length,moreTools,route);
    assert.equal($('.dashboard-more-tools #dashboard-tool-groups[role="region"][aria-labelledby="dashboard-tools-title"]').length,moreTools,route);
    assert.equal($('#dashboard-tools-title').text(),moreTools?'More tools':'',route);
    assert.equal($('#dashboard-tool-groups [data-more-close][aria-label="Close more tools"]').length,moreTools,route);
    assert.equal($('#ev-menu-actions').length,siteContext(url).section==='ev'?1:0,`${route}: only actual EV tools need the workspace-action menu`);
    const ids=$('[id]').map((_,el)=>$(el).attr('id')).get();
    assert.equal(new Set(ids).size,ids.length,`${route}: duplicate IDs`);
    const styles=$('link[rel=stylesheet]').map((_,el)=>$(el).attr('href')).get();
    const palette=styles.findIndex(href=>href.startsWith('/workspace-palette.css'));
    assert.ok(palette>=0&&styles.every((href,index)=>index<=palette||href.startsWith('/mobile-workspace.css')||href.startsWith('/ev-mobile.css')||href.startsWith('/sportslab-2026.css')||/^\/(trends-board|models-board|hub-pages|home-dashboard|player-detail|live-sim|tracker-2026|ev-suite-2026|boards-polish)\.css/.test(href)),`${route}: palette follows tool styles; only the shared and EV responsive sheets may follow it`);
    if(['ev','bets','ev-home'].includes(siteContext(url).section)) {
      const cards=styles.findIndex(href=>href.startsWith('/ev-bet-cards.css'));
      assert.ok(cards>styles.findIndex(href=>href.startsWith('/ev.css?'))&&cards<palette,`${route}: shared cards follow EV styles and precede palette`);
    }
    assert.equal($('script[type=module][src^="/dashboard-navigation.js"]').length,1,route);
  }
});

test('sidebar product destinations and secondary tools retain every supported sport', () => {
  for(const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) for(const route of [`/research?sport=${sport}`,`/models?sport=${sport}`,`/trends?sport=${sport}`,`/${sport}?view=trends&saved=1`,`/ev?sport=${sport}#promo`,`/ev/tracker?sport=${sport}`]) {
    const $=load(siteHeader(new URL(route,'http://localhost')));
    const hrefs=$('.dashboard-primary-link').map((_,el)=>$(el).attr('href')).get();
    assert.deepEqual(hrefs,[`/ev/tracker?sport=${sport}`],route);
    assert.deepEqual($('.site-product-menu [data-product]').map((_,el)=>$(el).attr('href')).get(),[`/trends?sport=${sport}`,`/models?sport=${sport}`,`/ev/dashboard?sport=${sport}`],route);
    const group=$('#dashboard-sidebar').attr('data-site-group');
    assert.equal($('.dashboard-group-home').attr('href'),{trends:`/trends?sport=${sport}`,models:`/models?sport=${sport}`,ev:`/ev/dashboard?sport=${sport}`}[group],route);
    for(const el of $('.dashboard-primary-link').toArray()) {
      assert.ok($(el).text().trim(),`${route}: visible navigation label`);
      assert.equal($(el).find('svg').length,1,`${route}: navigation icon`);
    }
    // More tools are +EV tools, listed only in the +EV group.
    assert.equal($('.dashboard-more-tools').length,group==='ev'?1:0,route);
    if(group==='ev') for(const tool of MORE_TOOLS) {
      const link=$(`.dashboard-more-tools [data-more-tool="${tool.key}"]`);
      assert.equal(link.length,1,`${route}: ${tool.key}`);
      assert.equal(link.attr('href'),`/ev?sport=${sport}#${tool.key}`);
      assert.ok(link.text().includes(tool.label),tool.key);
    }
    for(const link of $('.site-navigation a').toArray()) {
      const key=$(link).attr('data-nav-section');
      if(['performance','paper','live','simulation'].includes(key)) assert.ok(sportTools(sport).some(tool=>tool.key===key),`${route}: unsupported ${key}`);
    }
  }
});

test('sidebar selection distinguishes products, saved Trends, and exact EV tool hashes', () => {
  const selected=[['/research?sport=nba','home',null],['/models?sport=mlb','models',null],['/trends?sport=nhl','trends',null],['/nfl','models','research'],['/nfl/live','models','live'],['/wnba/simulation','models','simulation'],['/nba?view=trends','trends','trends'],['/nba?view=trends&saved=1','trends','watchlist'],['/ev/dashboard?sport=soccer','ev',null],['/ev/tracker?sport=nfl','bets',null]];
  for(const [route,product,tool] of selected) {
    const $=load(siteHeader(new URL(route,'http://localhost')));
    const group={home:'models',bets:'ev'}[product]||product;
    assert.equal($('#dashboard-sidebar').attr('data-site-group'),group,route);
    assert.equal($('.site-product-menu [data-selected]').attr('data-product'),group,route);
    assert.equal($('.dashboard-primary-nav [aria-current=page]').attr('data-dashboard-section')||null,product==='bets'?'bets':null,route);
    assert.equal($('.site-navigation [aria-current=page]').attr('data-nav-section')||null,tool,route);
    assert.equal($('.ev-primary-nav [aria-current],.dashboard-more-tools [aria-current]').length,0,route);
  }
  const keys=['odds','ev-pre','fantasy','arb-pre','sharp',...MORE_TOOLS.map(tool=>tool.key)];
  for(const key of keys) {
    const $=load(siteHeader(new URL(`http://localhost/ev?sport=wnba#${key}`)));
    const active=$('.ev-primary-nav [aria-current=page],.dashboard-more-tools [aria-current=page]');
    assert.equal(active.length,1,key);
    assert.equal(new URL(active.attr('href'),'http://localhost').hash,'#'+key);
    assert.equal($('#dashboard-sidebar').attr('data-site-group'),'ev');
    assert.equal($('.dashboard-more-tools').is('[open]'),false,`${key}: active tools do not automatically expand the flyout`);
    assert.equal($('.dashboard-more-tools > summary').attr('aria-expanded'),'false',key);
    assert.equal($('.dashboard-more-tools').hasClass('has-current-tool'),MORE_TOOLS.some(tool=>tool.key===key),key);
  }
  const defaults=load(siteHeader(new URL('http://localhost/ev?sport=nfl')));
  assert.equal(defaults('.ev-primary-nav [aria-current=page]').attr('href'),'/ev?sport=nfl#ev-pre');
});

test('workspace selector lists Trends, Models, +EV and the sidebar shows only the chosen group', () => {
  const nav = (features, route = '/models?sport=nfl', group = null) => { const $ = load(siteHeader(new URL(route, 'http://localhost'), { features, group })); return { group: $('#dashboard-sidebar').attr('data-site-group') || null, shared: $('.dashboard-primary-link').map((_, el) => $(el).attr('data-dashboard-section')).get(), products: $('.site-product-menu [data-product]').map((_, el) => $(el).attr('data-product')).get(), more: $('.dashboard-more-tools').length, context: $('.dashboard-sidebar-group[data-group] :is(.site-navigation,.ev-primary-nav) a').length }; };
  assert.deepEqual(nav(null), { group: 'models', shared: ['bets'], products: ['trends', 'models', 'ev'], more: 0, context: 5 });
  assert.deepEqual(nav(null, '/ev?sport=nfl'), { group: 'ev', shared: ['bets'], products: ['trends', 'models', 'ev'], more: 1, context: 5 });
  assert.equal(nav(null, '/trends?sport=nfl').group, 'trends');
  assert.equal(nav(null, '/research?sport=nfl', 'trends').group, 'trends', 'the Dashboard keeps the last picked group');
  assert.equal(nav(null, '/models?sport=nfl', 'trends').group, 'models', 'a product page always shows its own group');
  assert.deepEqual(nav(['research', 'trends', 'bet-tracker'], '/research?sport=nfl', 'ev'), { group: 'trends', shared: ['bets'], products: ['trends'], more: 0, context: 2 });
  assert.deepEqual(nav(['research', 'trends', 'models', 'bet-tracker']).products, ['trends', 'models']);
  assert.deepEqual(nav(['account', 'bet-tracker', 'saved-filters'], '/ev/tracker').group, null);
});
