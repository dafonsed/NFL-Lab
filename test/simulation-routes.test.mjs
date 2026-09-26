import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { siteHeader, siteContext, renderSitePage } from '../lib/site-layout.mjs';

test('Simulation remains in workspace navigation and follows sport changes', async () => {
  const template = await fs.readFile(new URL('../public/simulation.html', import.meta.url), 'utf8');
  for (const sport of ['nfl', 'nba', 'wnba', 'mlb', 'nhl', 'soccer']) {
    const url = new URL(`http://localhost/${sport}/simulation/`), $ = load(renderSitePage(template, url));
    assert.deepEqual(siteContext(url), { sport, section: 'simulation' });
    const supported = ['nfl','mlb','nba','wnba'].includes(sport);
    assert.equal($('.site-navigation a').filter((_, a) => $(a).text().trim() === 'Simulation').length, supported ? 1 : 0);
    assert.equal($('.site-navigation a[aria-current="page"]').attr('href'), supported ? `/${sport}/simulation` : undefined);
    assert.equal($('.site-header').attr('data-site-section'), 'simulation');
    assert.deepEqual($('.site-sports a').map((_,a)=>$(a).attr('href')).get(), ['/nfl/simulation','/mlb/simulation','/nba/simulation','/wnba/simulation','/nhl','/soccer']);
    assert.equal($('#sim-count').val(), '10000');
    assert.equal($('#simulation-form').length, 1);
  }
  assert.equal(load(siteHeader(new URL('http://localhost/nfl')))('.site-navigation a[href="/nfl/simulation"]').length, 1);
});

test('simulation HTTP routes and assets work; invalid parameters fail before source access', async () => {
  // Vercel mode exposes the server without starting a listener or automatic sync.
  const old = process.env.VERCEL; process.env.VERCEL = '1';
  const { server } = await import('../server.mjs');
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/simulation', '/nfl/simulation/', '/mlb/simulation', '/nba/simulation', '/wnba/simulation', '/nhl/simulation', '/soccer/simulation', '/simulation.js', '/simulation-props.js', '/simulation.css']) assert.equal((await fetch(base + route)).status, 200, route);
    for (const query of ['sport=bad', 'date=2026-02-31', 'simulations=999', 'simulations=50001', 'game=../private']) assert.equal((await fetch(base + '/api/simulation/run?' + query)).status, 400, query);
    assert.equal((await fetch(base + '/api/simulation/run')).status, 400);
    assert.equal((await fetch(base + '/api/simulation/catalog?sport=nhl')).status, 400);
    for (const query of ['sport=nhl', 'date=2026-02-31', 'game=401234567&market=invalid', '']) assert.equal((await fetch(base + '/api/simulation/props?' + query)).status, 400);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (old === undefined) delete process.env.VERCEL; else process.env.VERCEL = old;
  }
});
