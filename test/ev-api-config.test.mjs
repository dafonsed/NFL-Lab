import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvApiConfig } from '../lib/ev-api-proxy.mjs';

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

test('props and contracts routes find the upstream path that exists and pass its JSON through', async () => {
  const { handleEvApi } = await import('../lib/ev-api-proxy.mjs');
  const providerConfig = { base: new URL('http://127.0.0.1:9/'), apiKey: 'k' };
  const asked = [];
  const fetcher = async target => {
    asked.push(target.pathname + target.search);
    return target.pathname === '/dfs/props' ? new Response(JSON.stringify({ props: [{ id: 'p1' }] }), { status: 200 }) : new Response('{}', { status: 404 });
  };
  const call = async path => {
    let status, headers, body;
    await handleEvApi({ method: 'GET' }, { writeHead(code, value) { status = code; headers = value; }, end(value) { body = JSON.parse(value); } }, new URL(path, 'http://localhost'), { providerConfig, fetcher });
    return { status, headers, body };
  };
  const first = await call('/api/ev/props?sport=nfl');
  assert.equal(first.status, 200);
  assert.equal(first.headers['X-Upstream-Path'], '/dfs/props');
  assert.deepEqual(first.body, { props: [{ id: 'p1' }] });
  assert.deepEqual(asked, ['/props?sport=nfl', '/dfs/props?sport=nfl']);
  asked.length = 0;
  await call('/api/ev/props');
  assert.deepEqual(asked, ['/dfs/props'], 'the working path is remembered');
  const missing = await call('/api/ev/contracts');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body.tried, ['/contracts', '/prediction/contracts', '/predictions', '/markets']);
});
