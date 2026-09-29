import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeNext, api } from '../public/account-client.js';

test('account return path rejects external origins and authentication loops', () => {
  const original = globalThis.location;
  globalThis.location = { origin: 'https://sportslab.example' };
  try {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', '/api/auth/sign-out', '/login?next=/account', '/two-factor', null, 5]) assert.equal(safeNext(value), '/account', String(value));
    assert.equal(safeNext('/ev?league=nfl#saved'), '/ev?league=nfl#saved');
    assert.equal(safeNext('/admin/accounts'), '/admin/accounts');
  } finally { globalThis.location = original; }
});

test('account API handles anonymous null sessions and does not display raw server errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('null', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(await api('/api/auth/get-session'), null);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'database password secret-123 stack trace', code: 'INTERNAL_ERROR' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(api('/api/account'), error => error.status === 503 && !error.userMessage.includes('secret-123') && error.userMessage.includes('unavailable'));
    globalThis.fetch = async () => new Response('<html>Proxy error</html>');
    await assert.rejects(api('/api/auth/sign-in/email'), error => error.userMessage.includes('unexpected response'));
  } finally { globalThis.fetch = original; }
});

test('account API sends same-origin credentials and JSON without serializing passwords into URLs', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/auth/sign-in/email');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { password: 'private test value' });
      return new Response('{"status":true}');
    };
    assert.deepEqual(await api('/api/auth/sign-in/email', { method: 'POST', body: { password: 'private test value' } }), { status: true });
  } finally { globalThis.fetch = original; }
});

test('account forms cannot fall back to putting secrets in GET query strings if scripts fail', async () => {
  for (const file of ['login.html', 'register.html', 'account.html', 'admin-accounts.html', 'recovery.js']) {
    const source = await readFile(new URL('../public/' + file, import.meta.url), 'utf8');
    for (const form of source.matchAll(/<form\b[^>]*>/g)) assert.match(form[0], /method="post"/, file + ': ' + form[0]);
  }
});
