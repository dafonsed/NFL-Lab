import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { parseEvApiConfig } from '../lib/ev-api-proxy.mjs';
import { sourceControlKey } from '../lib/admin-market-controls.mjs';

test('the quote API can be local, private, or a public HTTPS IP or domain', () => {
  for (const address of ['http://127.0.0.1:8000/', 'http://192.168.1.20:8000', 'https://api.example.com', 'https://203.0.113.10:8443']) {
    assert.equal(parseEvApiConfig({ address, apiKey: 'k' }).apiKey, 'k', address);
  }
});

test('public plain HTTP needs an explicit opt-in; unsafe addresses are refused', () => {
  assert.throws(() => parseEvApiConfig({ address: 'http://203.0.113.10:8000', apiKey: 'k' }), /must use HTTPS/);
  assert.ok(parseEvApiConfig({ address: 'http://203.0.113.10:8000', apiKey: 'k', allowHttp: '1' }));
  for (const address of ['http://169.254.169.254', 'https://api.example.com/v1', 'https://user:pw@api.example.com', 'ftp://api.example.com']) {
    assert.throws(() => parseEvApiConfig({ address, apiKey: 'k', allowHttp: '1' }), undefined, address);
  }
  assert.throws(() => parseEvApiConfig({ address: 'https://api.example.com', apiKey: ' ' }), /EV_TOOL_API_KEY/);
});

const providerConfig = { base: new URL('http://127.0.0.1:9/'), apiKey: 'k' };
async function call(path, { method = 'GET', headers = {}, ...options } = {}) {
  const { handleEvApi } = await import('../lib/ev-api-proxy.mjs');
  let status, sent, raw;
  await handleEvApi({ method, headers }, { writeHead(code, value) { status = code; sent = value; }, end(value) { raw = value; } }, new URL(path, 'http://localhost'), { providerConfig, ...options });
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status, headers: sent, body, raw };
}
const now = () => new Date().toISOString();
const feedQuote = (id, book, extra = {}) => ({ id, sport: 'nfl', event: 'A @ B', market: 'moneyline', side: 'home', book, odds: 110, live: false, ts: now(), ...extra });

test("writes are refused before any upstream request: the API key never leaves on a visitor's POST or DELETE", async () => {
  const asked = [];
  const fetcher = async target => { asked.push(target.pathname); return new Response('{}'); };
  for (const [method, path] of [['POST', '/api/ev/scrape'], ['POST', '/api/ev/quotes'], ['DELETE', '/api/ev/matches/nfl-1'], ['PUT', '/api/ev/quotes'], ['POST', '/api/ev/site/dfs/props'], ['HEAD', '/api/ev/quotes']]) {
    const result = await call(path, { method, fetcher, loadControls: async () => [] });
    assert.equal(result.status, 405, `${method} ${path}`);
    assert.equal(result.headers.Allow, 'GET');
  }
  assert.deepEqual(asked, [], 'nothing reached the upstream API');
});

test("dataset routes use the quote API's fixed /site paths with only their documented parameters", async () => {
  const asked = [];
  const fetcher = async target => { asked.push(target.pathname + target.search); return new Response(target.pathname === '/site/health' ? '{"status":"ok"}' : '[{"id":"p1"}]'); };
  const health = await call('/api/ev/health', { fetcher });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: 'ok' });
  assert.equal(health.headers['X-Upstream-Path'], undefined, 'upstream paths are not exposed');
  await call('/api/ev/status', { fetcher });
  await call('/api/ev/props?sport=nfl&compact=false', { fetcher });
  await call('/api/ev/contracts?platform=Kalshi', { fetcher });
  await call('/api/ev/site/odds/history?id=q1&hours=6&debug=1', { fetcher });
  assert.deepEqual(asked, ['/site/health', '/site/status', '/site/dfs/props?sport=nfl', '/site/prediction/contracts?platform=Kalshi', '/site/odds/history?id=q1&hours=6']);
});

test("only the site's read-only routes pass through; private upstream routes do not", async () => {
  const asked = [];
  const fetcher = async target => { asked.push(target.pathname + target.search); return new Response('[{"ok":true}]'); };
  assert.equal((await call('/api/ev/site/dfs/props?sport=nfl', { fetcher })).status, 200);
  assert.equal((await call('/api/ev/site/dfs/payouts', { fetcher })).status, 200);
  for (const path of ['/api/ev/collectors/status', '/api/ev/review', '/api/ev/clob?book=novig', '/api/ev/live-board', '/api/ev/ev', '/api/ev/deep-link', '/api/ev/site/quotes', '/api/ev/site/players/results', '/api/ev/site/../review', '/api/ev/scrape']) {
    assert.equal((await call(path, { fetcher })).status, 404, path);
  }
  assert.deepEqual(asked, ['/site/dfs/props?sport=nfl', '/site/dfs/payouts'], 'nothing else reached the upstream API');
});

test('the served OpenAPI document describes only the site routes', async () => {
  const document = { openapi: '3.1.0', info: { title: 'EV Platform' }, servers: [{ url: 'http://10.0.0.5:8000' }], paths: { '/site/health': { get: {} }, '/site/dfs/props': { get: {} }, '/collectors/run-all': { post: {} }, '/ingest': { post: {} }, '/review': { get: {} } } };
  const result = await call('/api/ev/openapi', { fetcher: async () => new Response(JSON.stringify(document)) });
  assert.deepEqual(Object.keys(result.body.paths), ['/site/health', '/site/dfs/props']);
  assert.equal(result.body.servers, undefined);
});

test('upstream errors keep their status and Retry-After, never the upstream body or server settings', async t => {
  const limited = await call('/api/ev/site/dfs/props', { fetcher: async () => new Response('{"detail":"internal collector trace"}', { status: 429, headers: { 'retry-after': '20' } }) });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '20');
  assert.doesNotMatch(JSON.stringify(limited.body), /collector trace/);
  t.mock.method(console, 'error', () => {});
  const refused = await call('/api/ev/status', { fetcher: async () => new Response('{}', { status: 401 }) });
  assert.equal(refused.status, 502);
  assert.equal(refused.body.retryable, false);
  assert.doesNotMatch(JSON.stringify(refused.body), /EV_TOOL/);
  const html = await call('/api/ev/health', { fetcher: async () => new Response('<!doctype html><title>Dashboard</title>') });
  assert.equal(html.status, 502, 'only JSON leaves this origin');
  const unreachable = await call('/api/ev/status', { fetcher: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5'); } });
  assert.equal(unreachable.status, 503);
  assert.doesNotMatch(JSON.stringify(unreachable.body), /EV_TOOL|10\.0\.0\.5/);
});

test('record datasets get the same distribution controls as quotes, and fail closed without them', async () => {
  const controls = [{ scope: 'ev-local-api', kind: 'source', key: sourceControlKey('PrizePicks'), blocked: true }];
  const inventory = [feedQuote('q-fd', 'FanDuel'), feedQuote('q-pp', 'PrizePicks')];
  const bodies = {
    '/quotes': inventory,
    '/site/dfs/props': [{ id: 'd1', app: 'PrizePicks', sport: 'nfl', event: '' }, { id: 'd2', app: 'Underdog', sport: 'nfl', event: '' }],
    '/site/dfs/payouts': [{ app: 'PrizePicks', payouts: {} }, { app: 'Underdog', payouts: {} }],
    '/site/prediction/contracts': [{ id: 'c1', platform: 'PrizePicks', sport: 'nfl', event: 'A @ B' }, { id: 'c2', platform: 'Kalshi', sport: 'nfl', event: 'A @ B' }],
    '/site/odds/history': [{ id: 'q-pp', odds: 120, ts: now() }, { id: 'q-fd', odds: 110, ts: now() }],
  };
  const fetcher = async target => new Response(JSON.stringify(bodies[target.pathname]));
  const loadControls = async () => controls;
  assert.deepEqual((await call('/api/ev/site/dfs/props', { fetcher, loadControls })).body.map(row => row.id), ['d2']);
  assert.deepEqual((await call('/api/ev/site/dfs/payouts', { fetcher, loadControls })).body.map(row => row.app), ['Underdog']);
  assert.deepEqual((await call('/api/ev/contracts', { fetcher, loadControls })).body.map(row => row.id), ['c2']);
  assert.deepEqual((await call('/api/ev/site/odds/history?id=q-pp', { fetcher, loadControls })).body.map(row => row.id), ['q-fd'], 'history keeps only ids the controlled snapshot distributes');
  assert.deepEqual((await call('/api/ev/site/dfs/props', { fetcher, loadControls: async () => [] })).body.map(row => row.id), ['d1', 'd2']);
  const down = await call('/api/ev/site/dfs/props', { fetcher, loadControls: async () => { throw new Error('db down'); } });
  assert.equal(down.status, 503);
  assert.equal(down.body.code, 'MARKET_DISTRIBUTION_UNAVAILABLE');
  assert.ok(!Array.isArray(down.body));
});

test('/api/ev/quotes narrows the shared snapshot by live_only, sport, book and market without another upstream fetch', async () => {
  let fetches = 0;
  const inventory = [feedQuote('a', 'FanDuel'), feedQuote('b', 'DraftKings', { live: true }), feedQuote('c', 'FanDuel', { live: true, sport: 'mlb', event: 'C @ D' }), feedQuote('d', 'FanDuel', { live: true, market: 'prop' })];
  const fetcher = async () => { fetches += 1; return new Response(JSON.stringify({ quotes: inventory })); };
  const body = async path => (await call(path, { fetcher, loadControls: async () => [] })).body;
  const live = await body('/api/ev/quotes?live_only=true');
  assert.deepEqual(live.quotes.map(quote => quote.id), ['b', 'c', 'd']);
  assert.deepEqual(live.filter, { live_only: true });
  assert.equal(live.complete, true);
  assert.deepEqual((await body('/api/ev/quotes?live_only=1&sport=NFL&book=fanduel')).quotes.map(quote => quote.id), ['d']);
  assert.deepEqual((await body('/api/ev/quotes?market=moneyline&live_only=false')).quotes.map(quote => quote.id), ['a', 'b', 'c']);
  const all = await body('/api/ev/quotes?compact=false');
  assert.equal(all.count, 4);
  assert.equal(all.filter, undefined);
  assert.equal(fetches, 1, 'every variant came from one shared upstream snapshot');
});

test('without account services there are no controls, and the reply says so', async () => {
  const result = await call('/api/ev/quotes', { fetcher: async () => new Response(JSON.stringify([feedQuote('a', 'FanDuel')])) });
  assert.equal(result.status, 200);
  assert.equal(result.body.controlsApplied, false);
});

test('replies carry the snapshot time and age; dropped records are counted, not hidden', async () => {
  const bad = { ...feedQuote('bad', 'FanDuel'), book: '' };
  const result = await call('/api/ev/quotes', { fetcher: async () => new Response(JSON.stringify({ quotes: [feedQuote('a', 'FanDuel'), bad, feedQuote('a', 'FanDuel')] })), loadControls: async () => [] });
  assert.equal(result.body.count, 1);
  assert.equal(result.body.dropped, 2);
  assert.equal(result.body.stale, false);
  assert.equal(result.body.warmingUp, false);
  assert.ok(Math.abs(Date.parse(result.body.snapshotAt) - Date.now()) < 5_000);
  assert.match(result.headers['X-Snapshot-Age'], /^\d+$/);
});

test('a refilling upstream (under 60% of the last full snapshot) is held back for up to ten minutes', async t => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  t.mock.timers.enable({ apis: ['Date'], now: 5_000_000 });
  t.mock.method(console, 'error', () => {});
  const full = Array.from({ length: 100 }, (_, index) => feedQuote(`q${index}`, 'FanDuel'));
  let size = 100;
  const fetcher = async () => new Response(JSON.stringify({ quotes: full.slice(0, size) }));
  assert.equal((await call('/api/ev/quotes', { fetcher, loadControls: async () => [] })).body.count, 100);
  size = 20; t.mock.timers.tick(61_000);
  assert.equal((await call('/api/ev/quotes', { fetcher, loadControls: async () => [] })).body.count, 100, 'the last snapshot answers while the refresh runs');
  await settle();
  const held = await call('/api/ev/quotes', { fetcher, loadControls: async () => [] });
  assert.equal(held.body.count, 100, 'the last full snapshot is served');
  assert.equal(held.body.stale, true);
  assert.equal(held.body.warmingUp, true);
  assert.equal(held.body.snapshotAt, new Date(5_000_000).toISOString());
  assert.equal(held.headers['X-Snapshot-Age'], '61');
  size = 70; t.mock.timers.tick(61_000);
  await call('/api/ev/quotes', { fetcher, loadControls: async () => [] });
  await settle();
  const refilled = await call('/api/ev/quotes', { fetcher, loadControls: async () => [] });
  assert.equal(refilled.body.count, 70, '70% of the last full snapshot is served as it is');
  assert.equal(refilled.body.stale, false);
  size = 10; t.mock.timers.tick(11 * 60_000);
  assert.equal((await call('/api/ev/quotes', { fetcher, loadControls: async () => [] })).body.count, 10, 'after ten minutes a smaller inventory is accepted');
});

test('past a minute the last snapshot answers at once; after a failed refresh it is marked stale, and past ten minutes the upstream Retry-After is returned', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 9_000_000 });
  t.mock.method(console, 'error', () => {});
  let calls = 0;
  const flaky = async () => ++calls === 1 ? new Response(JSON.stringify([feedQuote('a', 'FanDuel')])) : new Response('busy', { status: 503, headers: { 'retry-after': '15' } });
  assert.equal((await call('/api/ev/quotes', { fetcher: flaky, loadControls: async () => [] })).body.stale, false);
  t.mock.timers.tick(61_000);
  const quick = await call('/api/ev/quotes', { fetcher: flaky, loadControls: async () => [] });
  assert.equal(quick.status, 200);
  assert.equal(quick.body.stale, false, 'a minute-old snapshot is still current');
  await new Promise(resolve => setTimeout(resolve, 30));
  const fallback = await call('/api/ev/quotes', { fetcher: flaky, loadControls: async () => [] });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.stale, true, 'the refresh failed');
  t.mock.timers.tick(240_000);
  assert.equal((await call('/api/ev/quotes', { fetcher: flaky, loadControls: async () => [] })).status, 200, 'five minutes old is still held');
  t.mock.timers.tick(360_000);
  const down = await call('/api/ev/quotes', { fetcher: flaky, loadControls: async () => [] });
  assert.equal(down.status, 503);
  assert.equal(down.body.code, 'QUOTE_SOURCE_UNAVAILABLE');
  assert.equal(down.headers['Retry-After'], '15');
});

test('requests share one upstream fetch while it is in flight, however long it takes', async () => {
  let fetches = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = async () => { fetches += 1; await gate; return new Response(JSON.stringify([feedQuote('a', 'FanDuel')])); };
  const pending = [call('/api/ev/quotes', { fetcher: slow, loadControls: async () => [] })];
  await new Promise(resolve => setTimeout(resolve, 2_100));
  pending.push(call('/api/ev/quotes', { fetcher: slow, loadControls: async () => [] }), call('/api/ev/matches', { fetcher: slow, loadControls: async () => [] }));
  release();
  const results = await Promise.all(pending);
  assert.equal(fetches, 1);
  assert.deepEqual(results.map(result => result.status), [200, 200, 200]);
});

test('JSON replies are compressed for clients that accept brotli or gzip', async () => {
  const inventory = Array.from({ length: 50 }, (_, index) => feedQuote(`q${index}`, 'FanDuel'));
  const fetcher = async () => new Response(JSON.stringify(inventory));
  const zipped = await call('/api/ev/quotes', { fetcher, loadControls: async () => [], headers: { 'accept-encoding': 'gzip' } });
  assert.equal(zipped.headers['Content-Encoding'], 'gzip');
  assert.equal(zipped.headers.Vary, 'Accept-Encoding');
  assert.equal(JSON.parse(gunzipSync(zipped.raw)).count, 50);
  assert.equal(zipped.headers['Content-Length'], zipped.raw.length);
  assert.equal((await call('/api/ev/quotes', { fetcher, loadControls: async () => [], headers: { 'accept-encoding': 'br, gzip' } })).headers['Content-Encoding'], 'br');
  assert.equal((await call('/api/ev/quotes', { fetcher, loadControls: async () => [], headers: { 'accept-encoding': 'identity' } })).headers['Content-Encoding'], undefined);
});

test('the quotes reply says which records were dropped, why and from which book', async () => {
  const inventory = [
    feedQuote('a', 'FanDuel'), feedQuote('b', 'FanDuel'),
    // As Underdog sends DFS props in /quotes: no event.
    feedQuote('u1', 'Underdog', { event: '' }), feedQuote('u2', 'Underdog', { event: '' }),
    feedQuote('s', 'Pinnacle', { sport: '' }), feedQuote('a', 'DraftKings'),
  ];
  const result = await call('/api/ev/quotes', { fetcher: async () => new Response(JSON.stringify({ quotes: inventory })), loadControls: async () => [] });
  assert.equal(result.body.count, 2);
  assert.equal(result.body.dropped, 4);
  assert.deepEqual(result.body.droppedReasons, { 'no event': { Underdog: 2 }, 'no sport': { Pinnacle: 1 }, 'duplicate id': { DraftKings: 1 } });
});
