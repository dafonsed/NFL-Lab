
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { createAccountSystem } from '../../lib/accounts/auth.mjs';
import { createAccountHandler } from '../../lib/accounts/http.mjs';

export const PASSWORD = 'Quiet rivers orbit distant planets!';

export async function fixture(t, { staffMfa = true, server: providedServer, configureSystem } = {}) {
  let handler;
  const server = providedServer || http.createServer(async (req, res) => {
    try {
      if (await handler(req, res, new URL(req.url, 'http://localhost'))) return;
      res.writeHead(404); res.end();
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async () => {} });
  handler = createAccountHandler(system);
  if (configureSystem) await configureSystem(system);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await system.close(); });
  function client() {
    const cookies = new Map();
    return { async request(route, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
      const response = await fetch(origin + route, { method, headers: { Origin: origin, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';'), split = pair.indexOf('=');
        const key = pair.slice(0, split), value = pair.slice(split + 1);
        if (value) cookies.set(key, value); else cookies.delete(key);
      }
      const text = await response.text();
      const responseBody = text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
      return { status: response.status, body: responseBody, text, headers: response.headers };
    } };
  }
  async function account(email, name = 'Research customer') {
    const registered = await system.auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
    await system.db.updateTable('user').set({ emailVerified: 1 }).where('id', '=', registered.user.id).execute();
    const browser = client();
    assert.equal((await browser.request('/api/auth/sign-in/email', { email, password: PASSWORD })).status, 200);
    return { id: registered.user.id, client: browser };
  }
  async function mfa(account) {
    assert.equal((await account.client.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
    const setup = await account.client.request('/api/auth/two-factor/enable', { password: PASSWORD });
    assert.equal(setup.status, 200);
    const otpSecret = new TextDecoder().decode(base32.decode(new URL(setup.body.totpURI).searchParams.get('secret')));
    assert.equal((await account.client.request('/api/auth/two-factor/verify-totp', { code: await createOTP(otpSecret).totp() })).status, 200);
  }
  const owner = await account('owner@example.test', 'Staff Owner');
  if (staffMfa) await mfa(owner);
  await system.db.updateTable('user').set({ role: 'owner' }).where('id', '=', owner.id).execute();
  const customer = await account('MixedCase@example.test', 'MixedCase customer');
  return { system, owner, customer, client, account, mfa };
}

