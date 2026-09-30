import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleClientErrors } from '../lib/client-errors.mjs';

function call({ method = 'POST', body = '{}', headers = {} } = {}) {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method, headers: { host: 'visualodds.test', origin: 'https://visualodds.test', 'sec-fetch-site': 'same-origin', ...headers }, socket: { remoteAddress: '203.0.113.' + Math.floor(Math.random() * 250) } });
  const res = { status: 0, writeHead(status) { this.status = status; }, end() {} };
  return handleClientErrors(req, res, new URL('https://visualodds.test/api/client-errors'), {}).then(handled => ({ handled, status: res.status }));
}

test('same-origin reports are logged without query strings', async t => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
  const result = await call({ body: JSON.stringify({ message: 'x is not defined', source: 'https://visualodds.test/ev.js?v=3', page: '/ev?token=secret', line: 4 }) });
  assert.deepEqual(result, { handled: true, status: 204 });
  assert.match(logged[0], /x is not defined/);
  assert.doesNotMatch(logged[0], /secret|\?v=3/);
});

test('cross-site, oversized and non-POST requests are refused', async () => {
  assert.equal((await call({ headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await call({ body: JSON.stringify({ message: 'x'.repeat(5000) }) })).status, 413);
  assert.equal((await call({ method: 'GET' })).status, 405);
});
