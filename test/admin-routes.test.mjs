import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { renderAdminPage } from '../lib/admin-page.mjs';

const sections = [
  'overview', 'users', 'billing', 'sources', 'events', 'quality', 'ev',
  'arbitrage', 'fantasy', 'links', 'grading', 'clv', 'wallets', 'lineups',
  'notifications', 'content', 'support', 'system', 'admins', 'security', 'reports',
];

test('the admin shell is isolated, accessible, and restricted to known sections', () => {
  for (const route of ['/admin-sandbox', '/admin-sandbox/', ...sections.map(section => `/admin-sandbox/${section}`)]) {
    const html = renderAdminPage(new URL(route, 'http://localhost'));
    const $ = load(html);
    assert.equal($('html').attr('lang'), 'en', route);
    assert.equal($('title').text(), 'VisualOdds Admin', route);
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex, nofollow', route);
    assert.equal($('body').hasClass('admin-app'), true, route);
    assert.equal($('#admin-root').length, 1, route);
    assert.equal($('a[href="#admin-main"]').length, 1, route);
    assert.equal($('#admin-toast[role="status"][aria-live="polite"]').length, 1, route);
    assert.equal($('#admin-root #admin-dialog, #admin-root #admin-toast').length, 0, route);
    assert.equal($('dialog#admin-dialog').length, 1, route);
    assert.equal($('noscript').length, 1, route);
    assert.equal($('script[type="module"]').attr('src'), '/admin.js', route);
    assert.equal($('link[rel="stylesheet"]').attr('href'), '/admin.css', route);
    assert.equal($('.site-header, .site-navigation, .site-sports, .site-footer').length, 0, route);
  }
  for (const route of ['/admins', '/admin-sandbox/unknown', '/admin-sandbox/users/delete', '/admin-sandbox/../account', '/admin-sandbox//users', '/admin-sandbox/USERS']) {
    assert.equal(renderAdminPage(new URL(route, 'http://localhost')), null, route);
  }
});

test('admin HTTP routes serve an uncached standalone sandbox and allow only its public assets', async () => {
  // Importing in Vercel mode avoids a second listener or background data refresh.
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  const { server } = await import('../server.mjs');
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/admin-sandbox', '/admin-sandbox/', ...sections.map(section => `/admin-sandbox/${section}`)]) {
      const response = await fetch(origin + route);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'no-store', route);
      assert.match(response.headers.get('x-robots-tag'), /noindex/, route);
      assert.match(response.headers.get('content-type'), /^text\/html/, route);
      assert.match(response.headers.get('content-security-policy'), /default-src 'self'/, route);
      assert.equal(load(html)('#admin-root').length, 1, route);
      assert.doesNotMatch(html, /class="site-(?:header|navigation)|\/site-layout\.css/, route);
    }
    const head = await fetch(origin + '/admin-sandbox/users', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('cache-control'), 'no-store');
    for (const asset of ['admin.js', 'admin.css', 'admin-catalog.js', 'admin-store.js', 'admin-values.js']) {
      const response = await fetch(`${origin}/${asset}`);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /^text\/css/ : /^text\/javascript/, asset);
      assert.ok((await response.text()).length > 0, asset);
    }
    const missing = await fetch(origin + '/admin-sandbox/unknown');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.match(missing.headers.get('x-robots-tag'), /noindex/);
    for (const route of ['/admin-sandbox/users/delete', '/admin-private.json']) {
      assert.equal((await fetch(origin + route)).status, 404, route);
    }
    assert.equal((await fetch(origin + '/admin-sandbox/users', { method: 'POST' })).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});
