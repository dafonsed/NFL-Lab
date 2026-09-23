import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { renderSitePage, siteHeader, siteContext } from '../lib/site-layout.mjs';

const routes = [
  ['/', 'index', '/nfl/live'], ['/nfl/', 'index', '/nfl/live'], ['/mlb', 'mlb', '/mlb/live'], ['/nba', 'sports', '/nba/live'], ['/wnba/', 'sports', '/wnba/live'],
  ['/nhl', 'sports', '/live'], ['/soccer', 'sports', '/live'], ['/nfl/live', 'live', '/nfl/live'], ['/mlb/live', 'live-sports', '/mlb/live'],
  ['/nba/live', 'live-sports', '/nba/live'], ['/wnba/live', 'live-sports', '/wnba/live'], ['/bets', 'bets', '/live'], ['/performance', 'performance', '/nfl/live'],
  ['/paper', 'paper', '/nfl/live'], ['/paper?sport=mlb', 'paper', '/mlb/live'], ['/live', 'live-hub', '/live']
];

test('every page renders the same working navigation and Live link before any JavaScript runs', async () => {
  for (const [route, template, target] of routes) {
    const html = renderSitePage(await fs.readFile(new URL(`../public/${template}.html`, import.meta.url), 'utf8'), new URL(route, 'http://localhost'));
    const $ = load(html);
    assert.equal($('.site-header').length, 1, route);
    assert.equal($('.site-live-link').text().trim(), 'Live', route);
    assert.equal($('.site-live-link').attr('href'), target, route);
    assert.deepEqual($('.site-navigation a').map((_, a) => $(a).text().trim()).get(), ['Research', 'Live', 'Performance', 'Paper returns'], route);
    assert.deepEqual($('.site-sports a').map((_, a) => $(a).text()).get(), ['NFL', 'MLB', 'NBA', 'WNBA', 'NHL', 'Soccer'], route);
    assert.equal($('.site-tracker').attr('href'), '/bets');
    assert.equal($('body.site-layout').length, 1); assert.equal($('main#main').length, 1);
    assert.equal($('.page-heading h1').length, 1); assert.equal($('link[rel="stylesheet"]').last().attr('href'), '/site-layout.css');
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
  assert.deepEqual($('.live-directory-card a').map((_, e) => $(e).attr('href')).get(), ['/nfl/live','/mlb/live','/nba/live','/wnba/live']);
});
