import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { renderSitePage, siteHeader, siteContext, legacyResearchUrl } from '../lib/site-layout.mjs';

const routes = [
  ['/nfl?view=games', 'index', '/nfl/live'], ['/nfl/', 'index', '/nfl/live'], ['/mlb', 'mlb', '/mlb/live'], ['/nba', 'sports', '/nba/live'], ['/wnba/', 'sports', '/wnba/live'],
  ['/nhl', 'sports', '/live'], ['/soccer', 'sports', '/live'], ['/nfl/live', 'live', '/nfl/live'], ['/mlb/live', 'live-sports', '/mlb/live'],
  ['/nba/live', 'live-sports', '/nba/live'], ['/wnba/live', 'live-sports', '/wnba/live'], ['/bets', 'bets', '/live'], ['/performance', 'performance', '/nfl/live'],
  ['/paper', 'paper', '/nfl/live'], ['/paper?sport=mlb', 'paper', '/mlb/live'], ['/live', 'live-hub', '/live']
];

test('public homepage is separate from the sport-aware research workspace', async () => {
  const root = new URL('http://localhost/');
  assert.deepEqual(siteContext(root), { sport: null, section: 'landing' });
  const homepage = await fs.readFile(new URL('../public/landing.html', import.meta.url), 'utf8');
  const $ = load(renderSitePage(homepage, root));
  assert.equal($('.site-header').length, 0);
  assert.equal($('h1').text(), 'Your next pick.A clearer picture.');
  assert.equal($('script[src="/home.js"]').length, 0);
  assert.equal($('.landing-button[href="/research"]').length, 3);
  assert.equal($('.landing-sport-links a').length, 6);
  assert.equal($('[role="tabpanel"]').length, 2);
  assert.equal($('[role="tab"][aria-selected="true"]').length, 1);
  assert.equal($('#workspace img').length, 0, 'Homepage demo uses real controls, not screenshots');
  assert.equal($('#demo-research').length, 1);
  assert.equal($('#demo-trends').length, 1);
  assert.match($('.demo-notice').text(), /Fictional players & sample games/);
  const workspace = new URL('http://localhost/research?sport=wnba');
  assert.deepEqual(siteContext(workspace), { sport: 'wnba', section: 'home' });
  const nav = load(siteHeader(workspace));
  assert.equal(nav('.site-sports [aria-current="page"]').attr('href'), '/research?sport=wnba');
  assert.equal(nav('.site-overview-link').attr('href'), '/research');
  assert.equal(nav('.workspace-home-link').attr('href'), '/research');
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
    assert.equal($('.site-live-link').text().trim(), 'Live', route);
    assert.equal($('.site-live-link').attr('href'), target, route);
    assert.deepEqual($('.site-navigation a').map((_, a) => $(a).text().trim()).get(), ['Research', 'Trends', 'Live', 'Simulation', 'NFL performance', 'Paper returns'], route);
    assert.ok($('.site-navigation a').toArray().every(a => $(a).attr('aria-label')), 'Icon rail links retain accessible labels');
    assert.deepEqual($('.site-sports a').map((_, a) => $(a).text()).get(), ['NFL', 'MLB', 'NBA', 'WNBA', 'NHL', 'Soccer'], route);
    assert.equal($('.site-tracker').attr('href'), '/bets');
    assert.equal($('body.site-layout').length, 1); assert.equal($('main#main').length, 1);
    assert.equal($('.page-heading h1').length, 1); assert.equal($('link[rel="stylesheet"]').last().attr('href'), '/app-design.css');
    assert.equal(html.includes('<!--site-header-->'), false);
    const ids = $('[id]').map((_, e) => $(e).attr('id')).get(); assert.equal(new Set(ids).size, ids.length, `Duplicate IDs on ${route}`);
  }
});

test('live sport switches retain the live section only for supported sports', () => {
  const $ = load(siteHeader(new URL('http://localhost/mlb/live/')));
  assert.equal($('.site-nav-link[aria-current="page"]').text().trim(), 'Live');
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
