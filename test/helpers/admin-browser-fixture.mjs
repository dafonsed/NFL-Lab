/**
 * Disposable browser fixture: node test/helpers/admin-browser-fixture.mjs
 * Prints only a loopback launch-page URL. That page supplies test credentials and
 * a current authenticator code; the browser must complete the normal login/MFA.
 * Uses the existing application server and its explicit NODE_ENV=test injection.
 * No disk account database, external mail, billing provider, or auth bypass.
 */
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { createAccountSystem, POLICY_VERSION } from '../../lib/accounts/auth.mjs';
import { configureAccountTestRuntime } from '../../lib/accounts/runtime.mjs';
import { bootstrapOwner } from '../../scripts/accounts.mjs';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Run this disposable fixture locally, outside a deployment environment.');
const requestedPort = process.env.ADMIN_FIXTURE_PORT;
const fixturePort = requestedPort === undefined ? 0 : Number(requestedPort);
if (requestedPort !== undefined && (!/^[1-9]\d*$/.test(requestedPort) || !Number.isSafeInteger(fixturePort) || fixturePort > 65535)) throw new Error('ADMIN_FIXTURE_PORT must be a local port number between 1 and 65535.');
process.env.NODE_ENV = 'test';
process.env.AUTO_SYNC = '0';
// Prevent server.mjs from starting its regular listener; all listeners below bind loopback.
process.env.VERCEL = '1';
const { server } = await import('../../server.mjs');
server.listen(fixturePort, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const delivered = [];
const system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async mail => delivered.push(mail) });
// Explicit test injection: operation inventory never calls a sportsbook or provider.
system.loadAdminMarketQuotes = async () => [
  { id: 'fixture-quote-1', book: 'Fixture Book', sport: 'NFL', event: 'Falcons at Saints' },
  { id: 'fixture-quote-2', book: 'Fixture Alternate', sport: 'NFL', event: 'Falcons at Saints' },
  { id: 'fixture-quote-3', book: 'Fixture Alternate', sport: 'NBA', event: 'Lakers at Clippers' },
];
configureAccountTestRuntime(system);
const password = 'Local admin review uses seven lanterns!';
const ownerEmail = 'owner@admin-fixture.example.test';

function client() {
  const jar = new Map();
  return async (route, body, method = body === undefined ? 'GET' : 'POST') => {
    const url = new URL(route, origin);
    if (url.origin !== origin) throw new Error('Fixture requests cannot leave the local application origin.');
    const response = await fetch(url, { method, redirect: 'manual', headers: { Origin: origin, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'), split = pair.indexOf('=');
      const key = pair.slice(0, split), value = pair.slice(split + 1);
      if (value) jar.set(key, value); else jar.delete(key);
    }
    const text = await response.text();
    let result; try { result = JSON.parse(text); } catch { result = null; }
    if (response.status >= 400) throw new Error(`Fixture preparation failed at ${url.pathname}: ${response.status} ${result?.code || ''}`);
    return result;
  };
}
async function verifiedAccount(email, name) {
  const request = client();
  await request('/api/auth/sign-up/email', { email, name, password, termsAccepted: true, policyVersion: POLICY_VERSION, marketingConsent: false });
  await system.mail.drain(100);
  const verification = delivered.findLast(mail => mail.to === email && /Verify your/i.test(mail.subject));
  const link = verification?.text.match(/https?:\/\/[^\s]+/)?.[0];
  if (!link) throw new Error('Fixture verification message was not queued.');
  await request(link);
  await request('/api/auth/sign-in/email', { email, password });
  return request;
}
async function enrollMfa(request) {
  await request('/api/account/reauthenticate', { password });
  const setup = await request('/api/auth/two-factor/enable', { password });
  const secret = new TextDecoder().decode(base32.decode(new URL(setup.totpURI).searchParams.get('secret')));
  await request('/api/auth/two-factor/verify-totp', { code: await createOTP(secret).totp() });
  return secret;
}

let launchServer;
try {
  const owner = await verifiedAccount(ownerEmail, 'Fixture Owner');
  const ownerOtp = await enrollMfa(owner);
  const customer = await verifiedAccount('customer@admin-fixture.example.test', 'Fixture Customer');
  await customer('/api/account/data/notes', { version: 0, value: { storage: { 'nfl-notes': JSON.stringify({ fixture: 'Private fixture note; admin APIs expose only collection counts.' }) } } }, 'PUT');
  const staffCandidate = await verifiedAccount('candidate@admin-fixture.example.test', 'Fixture MFA Candidate');
  await enrollMfa(staffCandidate);
  await bootstrapOwner(system, ownerEmail);
  // The bootstrap revoked the preparation session. CUA must establish its own
  // authenticated owner session and complete the real authenticator challenge.
  launchServer = http.createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); return res.end(); }
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
    const code = await createOTP(ownerOtp).totp();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Disposable admin browser fixture</title><style>body{font:16px/1.6 system-ui;margin:48px auto;max-width:740px;padding:0 24px;color:#16344b}dt{font-weight:650;margin-top:18px}dd{margin:4px 0;overflow-wrap:anywhere}code{font-size:15px;padding:4px 8px;background:#eef3f6}a{color:#065ac4}li{margin:10px 0}</style></head><body><h1>Disposable admin browser fixture</h1><p>This uses a fresh in-memory database and actual session, password and authenticator checks. All accounts below exist only until this process stops. Email is captured locally; payments and external data providers are disconnected.</p><dl><dt>Staff email</dt><dd><code>${ownerEmail}</code></dd><dt>Disposable password</dt><dd><code>${password}</code></dd><dt>Current authenticator code</dt><dd><code>${code}</code> — refresh this fixture page for a current code.</dd></dl><ol><li><a href="${origin}/login?next=%2Fadmin" target="_blank" rel="noopener">Open the real staff sign-in</a>, enter the email and password, then the current authenticator code.</li><li>The app opens <a href="${origin}/admin">the real admin workspace</a>. Use the same disposable password to confirm account actions.</li><li>Search <code>customer@admin-fixture.example.test</code> for account, grants, session and metadata checks. <code>candidate@admin-fixture.example.test</code> has verified MFA and can receive a non-owner staff role.</li><li>Verify actions persist by refreshing and inspecting account details and audit. Stop the fixture process to erase the database.</li></ol><p>No production authentication path has been modified. Do not use real credentials in this fixture.</p></body></html>`);
  });
  launchServer.listen(0, '127.0.0.1'); await once(launchServer, 'listening');
  console.log(`http://127.0.0.1:${launchServer.address().port}/`);
} catch (error) {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await system.close();
  throw error;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  launchServer.closeAllConnections(); server.closeAllConnections();
  await Promise.all([new Promise(resolve => launchServer.close(resolve)), new Promise(resolve => server.close(resolve))]);
  await system.close();
}
process.on('SIGINT', () => close().then(() => process.exit()));
process.on('SIGTERM', () => close().then(() => process.exit()));
