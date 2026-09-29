import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { load } from 'cheerio';
import { resolveHelpCenterRequest } from '../lib/help-center-routing.mjs';
import { renderHelpCenterPage } from '../lib/help-center-page.mjs';
import { HELP_COLLECTIONS, HELP_ARTICLES } from '../lib/help-center-catalog.mjs';
import { fixture } from './helpers/admin-api-fixture.mjs';
import { configureAccountTestRuntime } from '../lib/accounts/runtime.mjs';

const url = path => new URL(path, 'http://localhost');
const configuration = { HELP_CENTER_HOST: 'help.example.test', PUBLIC_SITE_URL: 'https://app.example.test' };

test('default help paths preserve query search without changing the main home or unrelated routes', () => {
  for (const path of ['/help', '/help/', '/help/collections/start', '/help/articles/start', '/help/unknown/nested']) {
    const target = url(path + '?q=account');
    const resolved = resolveHelpCenterRequest(target, { host: 'localhost:3100', env: {} });
    assert.equal(resolved.url, target); assert.equal(resolved.basePath, '/help'); assert.equal(resolved.appOrigin, '');
    assert.equal(resolved.url.searchParams.get('q'), 'account');
  }
  for (const path of ['/', '/helpful', '/collections/start', '/articles/start', '/help.css', '/help.js', '/help-search.js', '/api/account', '/login', '/support']) assert.equal(resolveHelpCenterRequest(url(path), { host: 'help.example.test', env: {} }), null, path);
});

test('subdomain help requires an explicit exact hostname and a distinct safe canonical application origin', () => {
  for (const path of ['/', '/collections/start', '/articles/start']) {
    const resolved = resolveHelpCenterRequest(url(path), { host: 'HELP.EXAMPLE.TEST:443', env: configuration });
    assert.equal(resolved.basePath, ''); assert.equal(resolved.appOrigin, 'https://app.example.test');
  }
  assert.equal(resolveHelpCenterRequest(url('/help'), { host: 'help.example.test', env: configuration }).appOrigin, 'https://app.example.test');
  for (const host of ['app.example.test', 'arbitrary.example.test', 'help.example.test.evil.test', 'evilhelp.example.test', 'evil@help.example.test', 'help.example.test/path', 'help.example.test:99999']) assert.equal(resolveHelpCenterRequest(url('/'), { host, env: configuration }), null, host);
  for (const path of ['/api/account', '/api/auth/get-session', '/login', '/support', '/account', '/help.js', '/favicon.svg', '/unrelated']) assert.equal(resolveHelpCenterRequest(url(path), { host: 'help.example.test', env: configuration }), null, path);
  for (const HELP_CENTER_HOST of ['https://help.example.test', '*.example.test', 'help.example.test:443', 'help.example.test/path', 'help.example.test,app.example.test']) assert.equal(resolveHelpCenterRequest(url('/'), { host: 'help.example.test', env: { ...configuration, HELP_CENTER_HOST } }), null, HELP_CENTER_HOST);
  for (const PUBLIC_SITE_URL of ['', 'javascript:alert(1)', 'http://app.example.test', 'https://user:secret@app.example.test', 'https://app.example.test/path', 'https://app.example.test?q=one', 'https://app.example.test/#top', 'https://help.example.test']) assert.equal(resolveHelpCenterRequest(url('/'), { host: 'help.example.test', env: { ...configuration, PUBLIC_SITE_URL } }), null, PUBLIC_SITE_URL);
  const fallback = resolveHelpCenterRequest(url('/'), { host: 'help.example.test', env: { HELP_CENTER_HOST: 'help.example.test', BETTER_AUTH_URL: 'https://accounts.example.test/' } });
  assert.equal(fallback.appOrigin, 'https://accounts.example.test');
  assert.equal(resolveHelpCenterRequest(url('/'), { host: 'app.example.test', forwardedHost: 'help.example.test', env: configuration }), null);
});

test('help renderer serves original catalog routes, excludes unknown pages and escapes search-query HTML', () => {
  assert.ok(HELP_COLLECTIONS.length > 0); assert.ok(HELP_ARTICLES.length > 0);
  const render = path => renderHelpCenterPage(url(path), { basePath: '/help', appOrigin: '' });
  const home = load(render('/help'));
  assert.equal(home('#help-search').length, 1); assert.equal(home('#help-search-input').length, 1);
  for (const collection of HELP_COLLECTIONS) {
    assert.ok(home(`a[href="/help/collections/${collection.id}"]`).length, collection.id);
    const page = load(render(`/help/collections/${collection.id}`));
    assert.ok(page('h1').text().includes(collection.title), collection.id);
    for (const article of collection.articles) assert.ok(page(`a[href="/help/articles/${article.slug}"]`).length, article.slug);
  }
  for (const article of HELP_ARTICLES) {
    const page = load(render(`/help/articles/${article.slug}`));
    assert.ok(page('h1').text().includes(article.title), article.slug);
  }
  for (const path of ['/help/no-such-page', '/help/collections/missing', '/help/articles/missing', '/help/articles/missing/more', '/help//articles/missing']) assert.equal(render(path), null, path);
  const query = '\"><img src=x onerror=alert(1)><script>alert(2)</script>';
  const searched = load(render(`/help?q=${encodeURIComponent(query)}`));
  assert.equal(searched('#help-search-input').val(), query);
  assert.equal(searched('img[onerror], [onload], script:not([src]):not([type="application/json"])').length, 0);
  assert.equal(searched('#help-search-data script').length, 0);
  const crossHost = load(renderHelpCenterPage(url('/'), { basePath: '', appOrigin: 'https://app.example.test' }));
  assert.ok(crossHost('a[href="https://app.example.test/support#new-report"]').length);
  assert.equal(crossHost('a[href^="/support"], a[href^="/login"], a[href^="/account"]').length, 0, 'Session-dependent links return to the app host.');
});

test('real HTTP help routes are public, exact-host scoped and preserve existing account and local host policy', async t => {
  const keys = ['VERCEL', 'NODE_ENV', 'HELP_CENTER_HOST', 'PUBLIC_SITE_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.VERCEL = '1'; process.env.NODE_ENV = 'test'; delete process.env.HELP_CENTER_HOST;
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const { server } = await import('../server.mjs');
  const app = await fixture(t, { server, configureSystem: configureAccountTestRuntime });
  const anonymous = app.client();
  // Native HTTP preserves a test Host header; Fetch may replace it with the URL host.
  const requestHost = (path, host, extraHeaders = {}) => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { Host: host, ...extraHeaders } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, text, body: response.headers['content-type']?.includes('application/json') ? JSON.parse(text) : text });
      });
    });
    request.on('error', reject); request.end();
  });
  const collectionPath = `/help/collections/${HELP_COLLECTIONS[0].id}`;
  const articlePath = `/help/articles/${HELP_ARTICLES[0].slug}`;
  for (const path of ['/help', '/help/', collectionPath, articlePath, '/help?q=account']) {
    const response = await anonymous.request(path);
    assert.equal(response.status, 200, path); assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(response.headers.get('set-cookie'), null, 'Reading help does not create an account session.');
    assert.equal(load(response.text)('#help-search').length, 1);
  }
  const head = await anonymous.request(articlePath, undefined, {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.text, '');
  assert.equal((await anonymous.request('/help', {})).status, 405);
  for (const path of ['/help/unknown', '/help/articles/missing', '/help/collections/missing', '/help/articles/a/b']) assert.equal((await anonymous.request(path)).status, 404, path);
  for (const asset of ['help.css', 'help.js', 'help-search.js']) {
    const response = await anonymous.request(`/${asset}`);
    assert.equal(response.status, 200, asset); assert.ok(response.text.length > 0);
  }
  const mainHome = await anonymous.request('/');
  assert.equal(mainHome.status, 200); assert.equal(load(mainHome.text)('#help-search').length, 0);
  assert.equal((await anonymous.request('/admin')).status, 302, 'Help never bypasses existing staff authentication.');
  process.env.HELP_CENTER_HOST = configuration.HELP_CENTER_HOST; process.env.PUBLIC_SITE_URL = configuration.PUBLIC_SITE_URL;
  for (const path of ['/', collectionPath.slice('/help'.length), articlePath.slice('/help'.length), '/?q=account', '/help']) {
    const response = await requestHost(path, 'help.example.test');
    assert.equal(response.status, 200, path);
    const page = load(response.text);
    assert.equal(page('#help-search').length, 1, path);
    assert.ok(page('a[href="https://app.example.test/support#new-report"]').length, path);
  }
  assert.equal((await requestHost('/articles/unknown', 'help.example.test')).status, 404);
  assert.equal(load((await requestHost('/', 'arbitrary.example.test')).text)('#help-search').length, 0);
  assert.equal(load((await requestHost('/', 'app.example.test', { 'X-Forwarded-Host': 'help.example.test' })).text)('#help-search').length, 0);
  assert.equal(load((await requestHost('/login', 'help.example.test')).text)('#help-search').length, 0);
  assert.equal(load((await requestHost('/support', 'help.example.test')).text)('#help-search').length, 0);
  const session = await requestHost('/api/auth/get-session', 'help.example.test');
  assert.equal(session.status, 200); assert.equal(session.body, null);
  delete process.env.VERCEL;
  assert.equal((await requestHost('/help', 'help.example.test')).status, 403, 'The existing local Host restriction remains authoritative.');
  assert.equal((await anonymous.request('/help')).status, 200, 'Loopback preview remains available.');
});
