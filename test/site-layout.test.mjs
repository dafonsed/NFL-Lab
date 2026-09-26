import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { renderSitePage, siteHeader, siteContext, legacyResearchUrl } from '../lib/site-layout.mjs';
import { sportTools, sportDestination } from '../public/navigation.js';

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
      if(section === 'ev') {
        assert.equal($('.ev-primary-nav a').first().attr('href'), '/research?sport=' + sport);
        assert.equal($('.ev-primary-nav a[href="/ev?sport='+sport+'#odds"]').length,1);
      } else {
        assert.equal($('.site-sports [aria-current]').text(), sport === 'soccer' ? 'Soccer' : sport.toUpperCase());
        assert.equal($('.site-overview-link').attr('href'), '/research?sport=' + sport);
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

test('mobile navigation keeps Model and Trends separate and preserves the selected sport', () => {
  for(const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const $=load(siteHeader(new URL('http://localhost/'+sport+'?view=trends')));
    assert.equal($('.mobile-navigation [data-nav-section=research]').text(),'Model');
    assert.equal($('.mobile-navigation [data-nav-section=research]').attr('href'),'/'+sport);
    assert.equal($('.mobile-navigation [aria-current]').text(),'Trends');
    assert.equal($('.site-tracker').attr('href'),'/bets?sport='+sport);
  }
});

test('EV workbench keeps sport context and loads its own page assets', async () => {
  const url = new URL('http://localhost/ev?sport=wnba');
  assert.deepEqual(siteContext(url), { sport:'wnba', section:'ev' });
  const template = await fs.readFile(new URL('../public/ev.html', import.meta.url), 'utf8');
  const $ = load(renderSitePage(template,url));
  assert.equal($('.ev-site-brand').text().trim(),'SPORTSLAB');
  assert.equal($('.ev-primary-nav a[href="/ev?sport=wnba#fantasy"]').text(),'DFS Props');
  assert.equal($('script[src="/ev.js?v=14"]').length,1);
  assert.equal($('link[rel="stylesheet"]').last().attr('href'),'/ev.css?v=15');
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
  ['/nba/live', 'live-sports', '/nba/live'], ['/wnba/live', 'live-sports', '/wnba/live'], ['/bets', 'bets', '/live'], ['/performance', 'performance', '/nfl/live'],
  ['/paper', 'paper', '/nfl/live'], ['/paper?sport=mlb', 'paper', '/mlb/live'], ['/live', 'live-hub', '/live']
];

test('public homepage is separate from the sport-aware research workspace', async () => {
  const root = new URL('http://localhost/');
  assert.deepEqual(siteContext(root), { sport: null, section: 'landing' });
  const homepage = await fs.readFile(new URL('../public/landing.html', import.meta.url), 'utf8');
  const $ = load(renderSitePage(homepage, root));
  assert.equal($('.site-header').length, 0);
  assert.equal($('h1').text(), 'See the gamebehind the line.');
  assert.equal($('script[src="/home.js"]').length, 0);
  assert.equal($('.landing-button[href="/research"]').length, 3);
  assert.equal($('.landing-league-inner nav a').length, 6);
  assert.equal($('.landing-sports-list a').length, 6);
  assert.equal($('#home-hero-proof').length, 1);
  assert.equal($('#home-insight').length, 1);
  assert.equal($('#home-research-feed').length, 1);
  assert.equal($('#home-results-calendar').length, 1);
  assert.equal($('#home-path-detail').length, 1);
  assert.equal($('[data-home-path]').length, 4);
  assert.equal($('.landing-compare-card').length, 3);
  assert.equal($('#home-outcome-panel').length, 1);
  assert.equal($('#home-receipts-rail').length, 1);
  assert.doesNotMatch(homepage, /profit|testimonial|try 7 days|\$59\.99/i);
  assert.match($('#workspace').text(), /Loading sourced research/);
  assert.equal($('script[src="/landing.js"]').length, 1);
  assert.doesNotMatch(homepage, /fictional player|fictional sample/i);
  assert.equal($('link[rel="stylesheet"]').last().attr('href'), '/landing-refined.css');
  const workspace = new URL('http://localhost/research?sport=wnba');
  assert.deepEqual(siteContext(workspace), { sport: 'wnba', section: 'home' });
  const nav = load(siteHeader(workspace));
  assert.equal(nav('.site-sports [aria-current="page"]').attr('href'), '/research?sport=wnba');
  assert.equal(nav('.site-overview-link').attr('href'), '/research?sport=wnba');
  assert.equal(nav('.workspace-home-link').length, 0, 'No duplicate overview shortcut');
  assert.equal(nav('.site-brand').attr('href'), '/');
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
    const labels=!sport?['Live sports']:['Model','EV tools','Trends',...(['nfl','mlb','nba','wnba'].includes(sport)?['Live games','Simulation']:[]),...(sport==='nfl'?['Performance']:[]),...(['nfl','mlb'].includes(sport)?['Paper returns']:[])];
    assert.deepEqual($('.site-navigation a').map((_, a) => $(a).text().trim()).get(), labels, route);
    assert.ok($('.site-navigation a').toArray().every(a => $(a).attr('aria-label')), 'Icon rail links retain accessible labels');
    assert.deepEqual($('.site-sports a').map((_, a) => $(a).text()).get(), ['NFL', 'MLB', 'NBA', 'WNBA', 'NHL', 'Soccer'], route);
    assert.equal($('.site-tracker').attr('href'), '/bets'+(sport?'?sport='+sport:''));
    assert.equal($('body.site-layout').length, 1); assert.equal($('main#main').length, 1);
    assert.equal($('.page-heading h1,.tracker-page-heading h1').length, 1); assert.equal($('link[rel="stylesheet"]').last().attr('href'), '/dashboard-unified.css?v=2');
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
