import test from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createIpLimiter, createRefreshGate } from '../lib/request-limits.mjs';

test('forced refreshes are honoured once per window per endpoint', () => {
  let time = 0;
  const allow = createRefreshGate({ windowMs: 60_000, now: () => time });
  assert.equal(allow('/api/board', false), false, 'no refresh requested');
  assert.equal(allow('/api/board', true), true);
  assert.equal(allow('/api/board', true), false, 'a second forced refresh inside the window is served from cache');
  assert.equal(allow('/api/sports/board', true), true, 'endpoints are gated separately');
  time = 60_000;
  assert.equal(allow('/api/board', true), true, 'a new window allows one more');
});

test('the per-IP ceiling resets each window and tracks addresses separately', () => {
  let time = 0;
  const allow = createIpLimiter({ max: 3, windowMs: 1000, now: () => time });
  assert.deepEqual([1, 2, 3, 4].map(() => allow('1.1.1.1')), [true, true, true, false]);
  assert.equal(allow('2.2.2.2'), true);
  time = 1000;
  assert.equal(allow('1.1.1.1'), true);
});

test('client IP trusts only the Vercel ingress header in production', () => {
  const req = { headers: { 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1', 'x-forwarded-for': '6.6.6.6' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(req, { VERCEL: '1' }), '203.0.113.9');
  assert.equal(clientIp(req, {}), '127.0.0.1', 'locally the socket address is used, never a spoofable header');
});
