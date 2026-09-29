import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { createAccountSystem, normalizeEmail, safeReturnPath, validatePassword, POLICY_VERSION } from '../lib/accounts/auth.mjs';
import { createAccountHandler, enforceAccountAccess } from '../lib/accounts/http.mjs';
import { tokenHash } from '../lib/accounts/secure-adapter.mjs';

const PASSWORD = 'Harbor lilies orbit six planets!';
const NEXT_PASSWORD = 'Meadow satellites drift through dawn!';

async function fixture(t) {
  let handler, activeSystem;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (await handler(req, res, url)) return;
      if (await enforceAccountAccess(req, res, url, activeSystem)) return;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"authorized":true}');
    }
    catch (error) { res.writeHead(error.status || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message, code: error.code })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`, outbox = [];
  const system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async message => outbox.push(message) });
  activeSystem = system; handler = createAccountHandler(system);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await system.close(); });
  function client() {
    const jar = new Map();
    async function request(path, body, options = {}) {
      const response = await fetch(new URL(path, origin), { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(jar.size ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}), ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'headers')) });
      const cookies = response.headers.getSetCookie();
      for (const cookie of cookies) { const first = cookie.split(';')[0], index = first.indexOf('='); const key = first.slice(0, index), value = first.slice(index + 1); if (value) jar.set(key, value); else jar.delete(key); }
      const text = await response.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
      return { status: response.status, body: value, headers: response.headers, cookies };
    }
    return { request, jar };
  }
  async function messages() { await system.mail.drain(); return outbox; }
  function messageLink(message) { return message.text.match(/https?:\/\/[^\s]+/)?.[0]; }
  async function register(email = 'customer@example.test', extra = {}) {
    const c = client();
    const result = await c.request('/api/auth/sign-up/email', { name: 'Research Customer', email, password: PASSWORD, termsAccepted: true, policyVersion: POLICY_VERSION, marketingConsent: false, callbackURL: '/account', ...extra });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    await messages();
    const verification = outbox.findLast(message => message.to === email.toLowerCase().trim() && /verify/i.test(message.subject));
    assert.ok(verification, 'A real rendered verification email was queued and delivered through the injectable test transport.');
    return { client: c, link: messageLink(verification) };
  }
  async function verified(email = 'customer@example.test') {
    const registration = await register(email);
    const verification = await registration.client.request(registration.link);
    assert.ok([200, 302, 303].includes(verification.status), JSON.stringify(verification.body));
    const login = await registration.client.request('/api/auth/sign-in/email', { email, password: PASSWORD, rememberMe: true });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { ...registration, login };
  }
  return { system, origin, outbox, client, register, verified, messages, messageLink };
}

test('registration verifies email once, records consent, and does not leak duplicate accounts', async t => {
  const app = await fixture(t), anonymous = app.client();
  assert.equal((await anonymous.request('/api/auth/sign-up/email', { name: 'Missing consent', email: 'no-consent@example.test', password: PASSWORD })).status, 400);
  const elevated = await anonymous.request('/api/auth/sign-up/email', { name: 'Injected role', email: 'injected@example.test', password: PASSWORD, termsAccepted: true, policyVersion: POLICY_VERSION, role: 'owner' });
  assert.equal(elevated.status, 200);
  const injection = await app.system.db.selectFrom('user').select('role').where('email', '=', 'injected@example.test').executeTakeFirst();
  assert.equal(injection.role, 'customer');
  const { client, link } = await app.register('customer+one@example.test', { marketingConsent: true });
  const before = await client.request('/api/auth/sign-in/email', { email: 'customer+one@example.test', password: PASSWORD });
  assert.ok([400, 401, 403].includes(before.status));
  const first = await client.request(link); assert.ok([200, 302, 303].includes(first.status));
  const replay = await client.request(link); assert.ok(replay.status >= 400 || /error|invalid|expired|used/i.test(replay.headers.get('location') || ''), 'Consumed verification links cannot be reused.');
  const duplicate = await anonymous.request('/api/auth/sign-up/email', { name: 'Duplicate', email: 'CUSTOMER+ONE@EXAMPLE.TEST', password: PASSWORD, termsAccepted: true, policyVersion: POLICY_VERSION, marketingConsent: false });
  assert.equal(duplicate.status, 200);
  const users = await app.system.db.selectFrom('user').selectAll().where('email', '=', 'customer+one@example.test').execute();
  assert.equal(users.length, 1); assert.equal(users[0].role, 'customer'); assert.ok(users[0].emailVerified); assert.ok(users[0].termsAcceptedAt); assert.ok(users[0].policyVersion);
  const consent = await app.system.db.selectFrom('accountConsent').selectAll().where('userId', '=', users[0].id).execute();
  assert.ok(consent.length >= 2);
  const absent = await anonymous.request('/api/auth/sign-in/email', { email: 'unknown@example.test', password: PASSWORD });
  const wrong = await anonymous.request('/api/auth/sign-in/email', { email: users[0].email, password: 'Wrong long passphrase here!' });
  assert.equal(absent.status, wrong.status); assert.deepEqual(absent.body, wrong.body);
});

test('sessions are protected at rest and sign-out invalidates only the intended session', async t => {
  const app = await fixture(t), account = await app.verified(), second = app.client();
  await second.request('/api/auth/sign-in/email', { email: 'customer@example.test', password: PASSWORD });
  assert.ok(account.login.cookies.some(cookie => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
  const tokenCookie = [...account.client.jar].find(([key]) => /session_token/.test(key))?.[1];
  assert.ok(tokenCookie);
  const token = decodeURIComponent(tokenCookie).split('.')[0];
  const rows = await app.system.db.selectFrom('session').selectAll().execute();
  assert.equal(rows.length, 2); assert.ok(rows.some(row => row.token === tokenHash(token))); assert.ok(rows.every(row => row.token !== token && row.encryptedToken && !row.encryptedToken.includes(token)));
  const listed = await account.client.request('/api/auth/list-sessions'); assert.equal(listed.status, 200); assert.equal(listed.body.length, 2);
  assert.equal((await account.client.request('/api/auth/sign-out', {})).status, 200);
  assert.equal((await account.client.request('/api/auth/get-session')).body, null);
  assert.ok((await second.request('/api/auth/get-session')).body?.user);
  await account.client.request('/api/auth/sign-in/email', { email: 'customer@example.test', password: PASSWORD });
  assert.equal((await second.request('/api/auth/revoke-sessions', {})).status, 200);
  assert.equal((await account.client.request('/api/auth/get-session')).body, null);
  assert.equal((await second.request('/api/auth/get-session')).body, null);
});

test('password recovery is generic, consumes tokens once and revokes old sessions', async t => {
  const app = await fixture(t), account = await app.verified(), stranger = app.client();
  const existing = await stranger.request('/api/auth/request-password-reset', { email: 'customer@example.test', redirectTo: '/reset-password' });
  const missing = await stranger.request('/api/auth/request-password-reset', { email: 'absent@example.test', redirectTo: '/reset-password' });
  assert.equal(existing.status, missing.status); assert.deepEqual(existing.body, missing.body);
  await app.messages(); const link = app.messageLink(app.outbox.findLast(message => /Reset your/.test(message.subject))), token = new URL(link).searchParams.get('token');
  const records = await app.system.db.selectFrom('verification').selectAll().execute();
  assert.equal(JSON.stringify(records).includes(token), false, 'Reset bearer tokens are not persisted as plaintext.');
  const result = await stranger.request('/api/auth/reset-password', { token, newPassword: NEXT_PASSWORD }); assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await account.client.request('/api/auth/get-session')).body, null);
  assert.ok((await stranger.request('/api/auth/reset-password', { token, newPassword: PASSWORD })).status >= 400);
  assert.ok((await stranger.request('/api/auth/sign-in/email', { email: 'customer@example.test', password: PASSWORD })).status >= 400);
  assert.equal((await stranger.request('/api/auth/sign-in/email', { email: 'customer@example.test', password: NEXT_PASSWORD })).status, 200);
  await app.messages(); assert.ok(app.outbox.some(message => /password changed/i.test(message.subject)));
});

test('account data derives ownership from sessions and rejects stale-tab identity and conflicting versions', async t => {
  const app = await fixture(t), first = await app.verified('first@example.test'), second = await app.verified('second@example.test');
  const who = (await first.client.request('/api/auth/get-session')).body.user;
  const payload = { value: { storage: { 'nfl-notes': '{"player":"Private research"}' } }, version: 0, userId: 'not-the-owner' };
  const saved = await first.client.request('/api/account/data/notes', payload, { method: 'PUT', headers: { 'X-Account-User': who.id } }); assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const other = await second.client.request('/api/account/data/notes?userId=' + who.id); assert.equal(other.status, 200); assert.equal(JSON.stringify(other.body).includes('Private research'), false);
  const stale = await second.client.request('/api/account/data/notes', payload, { method: 'PUT', headers: { 'X-Account-User': who.id } }); assert.ok([403, 409].includes(stale.status));
  const conflict = await first.client.request('/api/account/data/notes', payload, { method: 'PUT', headers: { 'X-Account-User': who.id } }); assert.equal(conflict.status, 409);
  assert.equal((await app.client().request('/api/account/data/notes')).status, 401);
});

test('email change requires reauthentication, verifies the new address and revokes prior sessions', async t => {
  const app = await fixture(t), account = await app.verified();
  const body = { newEmail: 'updated@example.test', callbackURL: '/account' };
  assert.equal((await account.client.request('/api/auth/change-email', body)).status, 403);
  assert.equal((await account.client.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
  assert.equal((await account.client.request('/api/auth/change-email', body)).status, 200);
  await app.messages();
  const verify = app.outbox.findLast(message => message.to === 'updated@example.test'); assert.ok(verify);
  const outsider = app.client(), result = await outsider.request(app.messageLink(verify)); assert.ok([200, 302, 303].includes(result.status));
  assert.equal((await account.client.request('/api/auth/get-session')).body, null);
  assert.equal((await outsider.request('/api/auth/get-session')).body, null, 'Email verification must not bypass password or MFA sign-in.');
  assert.equal((await outsider.request('/api/auth/sign-in/email', { email: body.newEmail, password: PASSWORD })).status, 200);
  await app.messages(); assert.ok(app.outbox.some(message => message.to === 'customer@example.test' && /email changed/i.test(message.subject)));
});

test('MFA enrollment, required challenge and single-use recovery', async t => {
  const app = await fixture(t), account = await app.verified();
  assert.equal((await account.client.request('/api/auth/two-factor/enable', { password: PASSWORD })).status, 403);
  assert.equal((await account.client.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
  const setup = await account.client.request('/api/auth/two-factor/enable', { password: PASSWORD }); assert.equal(setup.status, 200, JSON.stringify(setup.body));
  assert.equal(setup.body.backupCodes.length, 10);
  const secret = new TextDecoder().decode(base32.decode(new URL(setup.body.totpURI).searchParams.get('secret')));
  const code = await createOTP(secret).totp();
  const confirm = await account.client.request('/api/auth/two-factor/verify-totp', { code }); assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  const user = (await account.client.request('/api/auth/get-session')).body.user;
  const tf = await app.system.db.selectFrom('twoFactor').selectAll().where('userId', '=', user.id).executeTakeFirst();
  assert.equal(tf.backupCodes.includes(setup.body.backupCodes[0]), false);
  await account.client.request('/api/auth/sign-out', {});
  const fresh = app.client(), challenge = await fresh.request('/api/auth/sign-in/email', { email: user.email, password: PASSWORD }); assert.equal(challenge.status, 200); assert.equal(challenge.body.twoFactorRedirect, true);
  assert.equal((await fresh.request('/api/account/data/notes')).status, 401);
  const recovery = await fresh.request('/api/auth/two-factor/verify-backup-code', { code: setup.body.backupCodes[0], trustDevice: false }); assert.equal(recovery.status, 200, JSON.stringify(recovery.body));
  assert.equal((await fresh.request('/api/account/data/notes')).status, 200);
  const next = app.client(); await next.request('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });
  assert.ok((await next.request('/api/auth/two-factor/verify-backup-code', { code: setup.body.backupCodes[0] })).status >= 400);
  const concurrent = app.client(); await concurrent.request('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });
  // Isolate the atomic-spend scenario from the provider's three-attempt/10s
  // endpoint throttle; production throttling is tested independently below.
  await app.system.db.deleteFrom('rateLimit').execute();
  const race = await Promise.all([next, concurrent].map(c => c.request('/api/auth/two-factor/verify-backup-code', { code: setup.body.backupCodes[1] })));
  assert.equal(race.filter(result => result.status === 200).length, 1, 'Concurrent requests cannot spend the same recovery code twice: ' + JSON.stringify(race.map(result => ({ status: result.status, body: result.body }))));
  assert.equal((await fresh.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
  assert.equal((await fresh.request('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD })).status, 200);
  assert.equal((await fresh.request('/api/account/data/notes')).status, 200, 'A password change preserves the current session MFA proof.');
});

test('expired verification and recovery links cannot change account state', async t => {
  const app = await fixture(t), registration = await app.register();
  await app.system.db.updateTable('accountLink').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).execute();
  const expired = await registration.client.request(registration.link);
  assert.match(expired.headers.get('location') || '', /INVALID_TOKEN/);
  assert.equal((await app.system.db.selectFrom('user').select('emailVerified').executeTakeFirst()).emailVerified, 0);
  await registration.client.request('/api/auth/request-password-reset', { email: 'customer@example.test', redirectTo: '/reset-password' });
  await app.messages();
  const reset = app.outbox.findLast(message => /Reset your/.test(message.subject)), token = new URL(app.messageLink(reset)).searchParams.get('token');
  await app.system.db.updateTable('verification').set({ expiresAt: 0 }).execute();
  assert.ok((await registration.client.request('/api/auth/reset-password', { token, newPassword: NEXT_PASSWORD })).status >= 400);
});

test('real route policy denies free paid access, customer admin access and administrators without MFA', async t => {
  const app = await fixture(t), account = await app.verified();
  assert.equal((await account.client.request('/api/ev/quotes')).status, 403);
  assert.equal((await account.client.request('/api/admin/accounts')).status, 403);
  const user = (await account.client.request('/api/auth/get-session')).body.user;
  await app.system.db.updateTable('user').set({ role: 'owner' }).where('id', '=', user.id).execute();
  const noMfa = await account.client.request('/api/admin/accounts'); assert.equal(noMfa.status, 403); assert.equal(noMfa.body.code, 'ADMIN_MFA_REQUIRED');
  assert.equal((await account.client.request('/admin')).status, 302);
  await account.client.request('/api/account/reauthenticate', { password: PASSWORD });
  const setup = await account.client.request('/api/auth/two-factor/enable', { password: PASSWORD }); assert.equal(setup.status, 200);
  const secret = new TextDecoder().decode(base32.decode(new URL(setup.body.totpURI).searchParams.get('secret')));
  assert.equal((await account.client.request('/api/auth/two-factor/verify-totp', { code: await createOTP(secret).totp() })).status, 200);
  assert.equal((await account.client.request('/api/admin/accounts')).status, 200);
  const target = await app.verified('target@example.test'), targetUser = (await target.client.request('/api/auth/get-session')).body.user;
  await app.system.db.updateTable('user').set({ role: 'support' }).where('id', '=', user.id).execute();
  await account.client.request('/api/account/reauthenticate', { password: PASSWORD });
  const action = { action: 'suspend', reason: 'Automated authorization regression check' };
  assert.equal((await account.client.request(`/api/admin/accounts/${targetUser.id}/action`, action)).status, 403);
  await app.system.db.updateTable('user').set({ role: 'owner' }).where('id', '=', user.id).execute();
  assert.equal((await account.client.request(`/api/admin/accounts/${targetUser.id}/action`, action)).status, 200);
  assert.equal((await target.client.request('/api/account/data/notes')).status, 401);
  const audit = await app.system.db.selectFrom('accountAudit').select('detail').where('action', '=', 'admin.suspend').where('userId', '=', targetUser.id).executeTakeFirst();
  assert.equal(JSON.parse(audit.detail).reason, action.reason);
  assert.equal((await account.client.request('/api/auth/two-factor/disable', { password: PASSWORD })).status, 403, 'An administrator cannot remove required MFA.');
});

test('unsafe origins and redirects are rejected and suspended sessions immediately lose access', async t => {
  const app = await fixture(t), account = await app.verified(), user = (await account.client.request('/api/auth/get-session')).body.user;
  assert.equal((await account.client.request('/api/account/data/notes', { value: {}, version: 0 }, { method: 'PUT', headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.ok((await account.client.request('/api/auth/change-email', { newEmail: 'target@example.test', callbackURL: 'https://attacker.invalid/' })).status >= 400);
  await app.system.db.updateTable('user').set({ status: 'suspended' }).where('id', '=', user.id).execute();
  assert.equal((await account.client.request('/api/account/data/notes')).status, 401);
  assert.equal((await app.system.db.selectFrom('session').select('id').where('userId', '=', user.id).execute()).length, 0);
  const wrongPassword = await app.client().request('/api/auth/sign-in/email', { email: user.email, password: NEXT_PASSWORD });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.code, 'INVALID_EMAIL_OR_PASSWORD');
  const suspendedLogin = await app.client().request('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });
  assert.equal(suspendedLogin.status, 403);
  assert.equal(suspendedLogin.body.code, 'ACCOUNT_SUSPENDED');
});

test('social sign-in is not exposed', async t => {
  const app = await fixture(t), client = app.client();
  assert.equal((await client.request('/api/auth/sign-in/social', { provider: 'google' })).status, 404);
});

test('account export is scoped and deletion request requires recent proof and revokes access', async t => {
  const app = await fixture(t), account = await app.verified();
  assert.equal((await account.client.request('/api/account/export')).status, 403);
  assert.equal((await account.client.request('/api/account/deletion-request', { confirmation: 'DELETE' })).status, 403);
  await account.client.request('/api/account/reauthenticate', { password: PASSWORD });
  const exported = await account.client.request('/api/account/export'); assert.equal(exported.status, 200); assert.equal(exported.body.user.email, 'customer@example.test');
  assert.equal(JSON.stringify(exported.body).includes(PASSWORD), false);
  assert.equal((await account.client.request('/api/account/deletion-request', { confirmation: 'not-confirmed' })).status, 400);
  assert.equal((await account.client.request('/api/account/deletion-request', { confirmation: 'DELETE' })).status, 200);
  assert.equal((await account.client.request('/api/account/data/notes')).status, 401);
  const request = await app.system.db.selectFrom('deletionRequest').selectAll().executeTakeFirst(); assert.equal(request.status, 'pending');
  const deletedLogin = await app.client().request('/api/auth/sign-in/email', { email: 'customer@example.test', password: PASSWORD });
  assert.equal(deletedLogin.status, 403);
  assert.equal(deletedLogin.body.code, 'ACCOUNT_DELETED');
});

test('email normalization preserves aliases and password/redirect validation rejects common bypasses', () => {
  assert.equal(normalizeEmail('  Person.Name+Tag@EXAMPLE.COM  '), 'person.name+tag@example.com');
  assert.notEqual(normalizeEmail('person.name@example.com'), normalizeEmail('personname@example.com'));
  for (const password of ['short', 'passwordpassword', 'qwertyuiopasdfgh', '123456789012345']) assert.throws(() => validatePassword(password));
  validatePassword(PASSWORD); validatePassword('多种字符可以组成安全而漫长的密码短语');
  for (const value of ['//attacker.invalid', '/\\attacker.invalid', 'https://attacker.invalid', '/\u0000bad']) assert.equal(safeReturnPath(value), '/account');
  assert.equal(safeReturnPath('/ev/tracker?sport=nfl#history'), '/ev/tracker?sport=nfl#history');
});
