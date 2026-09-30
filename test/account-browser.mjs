/** Real browser/account integration fixture. No live email or payment provider is used.
 * Run: PLAYWRIGHT_MODULE=<optional module path> node test/account-browser.mjs
 * A local Playwright installation with Chromium is required.
 */
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { createAccountSystem, POLICY_VERSION } from '../lib/accounts/auth.mjs';
import { createAccountHandler, enforceAccountAccess } from '../lib/accounts/http.mjs';

const moduleName = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright');
const publicDir = path.resolve('public');
const reportsDir = path.resolve('reports');
await fs.mkdir(reportsDir, { recursive: true });
const routes = { '/': 'login.html', '/login': 'login.html', '/register': 'register.html', '/account': 'account.html', '/forgot-password': 'recovery.html', '/reset-password': 'recovery.html', '/verify-email': 'recovery.html', '/two-factor': 'recovery.html', '/admin/accounts': 'admin-accounts.html' };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let system, handle;
const outbox = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await handle(req, res, url)) return;
    if (await enforceAccountAccess(req, res, url, system)) return;
    const file = path.resolve(publicDir, routes[url.pathname] || url.pathname.slice(1));
    if (!file.startsWith(publicDir + path.sep) || !mime[path.extname(file)]) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', mime[path.extname(file)] + '; charset=utf-8');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(500); res.end('Fixture request failed'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async mail => outbox.push(mail) });
handle = createAccountHandler(system);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const password = 'Autumn research holds seventeen maps!';
const nextPassword = 'Summer research holds nineteen maps!';
const email = 'browser-flow@example.test';
const outcomes = [];
const check = (name, condition = true) => { assert.ok(condition, name); outcomes.push(name); };
async function login(secret = password) {
  await page.goto(origin + '/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in/email'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await responsePromise;
  if (response.status() === 429) {
    await page.getByText('Too many attempts.', { exact: false }).waitFor();
    check('Credential rate limit is surfaced accessibly in the sign-in form');
    const retrySeconds = Math.min(30, Math.max(1, Number(response.headers()['x-retry-after']) || 11));
    await new Promise(resolve => setTimeout(resolve, (retrySeconds + 1) * 1000));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
}
async function reauthenticate(secret = password) {
  await page.locator('#security-dialog').waitFor({ state: 'visible' });
  await page.locator('#reauth-password').fill(secret);
  await page.locator('#reauth-form').getByRole('button', { name: 'Continue' }).click();
}
async function latestLink(subject) {
  await system.mail.drain(100);
  const mail = outbox.findLast(message => subject.test(message.subject));
  assert.ok(mail, 'A rendered email reached the local delivery adapter');
  return { mail, url: mail.text.match(/https?:\/\/[^\s]+/)[0] };
}
async function authenticatorCode(secret) {
  const key = await crypto.subtle.importKey('raw', base32.decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return createOTP(key).totp();
}
try {
  await page.goto(origin + '/register');
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.screenshot({ path: path.join(reportsDir, 'account-register-desktop.png'), fullPage: true });
  await page.getByLabel('Display name', { exact: true }).fill('Browser Researcher');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('I accept the').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByText('Check your inbox.', { exact: false }).waitFor();
  check('Browser registration completes with generic confirmation');
  const verification = await latestLink(/Verify your/);
  await page.goto(verification.url);
  await page.waitForURL('**/login?verified=1');
  check('Single-use verification link reaches the sign-in confirmation');
  await login(); await page.waitForURL('**/account');
  await page.locator('#account-content').waitFor({ state: 'visible' });
  check('Real email/password login loads customer account');
  await page.getByLabel('Default odds format').selectOption('decimal');
  await page.getByLabel('Optional news and promotional offers').check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByText('Your preferences have been saved.').waitFor();
  await page.getByLabel('Display name', { exact: true }).fill('Cross-device Researcher');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Your profile has been saved.').waitFor();
  await page.reload(); await page.locator('#account-content').waitFor({ state: 'visible' });
  check('Profile changes preserve saved preferences', await page.getByLabel('Default odds format').inputValue() === 'decimal' && await page.getByLabel('Optional news and promotional offers').isChecked());
  check('Unavailable billing exposes no enabled checkout button', await page.locator('#plan-options button:enabled').count() === 0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(reportsDir, 'account-settings-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click(); await reauthenticate();
  await page.locator('#mfa-dialog').waitFor({ state: 'visible' });
  const secret = await page.locator('#mfa-secret').inputValue();
  const backup = (await page.locator('#backup-codes').inputValue()).split('\n')[0];
  await page.locator('#mfa-code').fill(await authenticatorCode(secret));
  await page.getByRole('button', { name: 'Verify and enable' }).click();
  await page.getByRole('heading', { name: 'Two-step verification is on' }).waitFor();
  await page.locator('#mfa-dialog').getByRole('button', { name: 'Close', exact: true }).click();
  check('Customer MFA enabled by actual authenticator verification');
  await page.locator('#sign-out').click(); await page.waitForURL('**/login');
  await login(); await page.waitForURL('**/two-factor?*');
  await page.getByLabel('Use a recovery code instead').check();
  await page.getByLabel('Unused recovery code').fill(backup);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('**/account'); await page.locator('#account-content').waitFor({ state: 'visible' });
  check('MFA sign-in challenge accepts a real one-time recovery code');
  const other = await browser.newContext();
  const replay = await other.request.post(origin + '/api/auth/sign-in/email', { headers: { Origin: origin }, data: { email, password } });
  assert.equal(replay.status(), 200);
  const reused = await other.request.post(origin + '/api/auth/two-factor/verify-backup-code', { headers: { Origin: origin }, data: { code: backup } });
  check('Used recovery code cannot be reused', reused.status() >= 400); await other.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/account'); await page.locator('#account-content').waitFor({ state: 'visible' });
  check('Mobile account has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(reportsDir, 'account-settings-mobile.png'), fullPage: true });
  const adminResponse = await page.goto(origin + '/admin/accounts');
  check('Customer admin page access is denied', adminResponse.status() === 403 || new URL(page.url()).pathname !== '/admin/accounts');
  await page.goto(origin + '/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('If an account exists for that address', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(reportsDir, 'account-recovery-mobile.png'), fullPage: true });
  const reset = await latestLink(/Reset your/);
  await page.goto(reset.url);
  await page.getByLabel('New password', { exact: true }).fill(nextPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(nextPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await page.getByText('Your password has been updated.', { exact: false }).waitFor();
  check('Browser password recovery completes through the real reset endpoint');
  await login(nextPassword); await page.waitForURL('**/two-factor?*');
  await page.getByLabel('Authenticator code').fill(await authenticatorCode(secret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('**/account');
  check('Password reset retains MFA protection');
  // Bootstrap an owner only inside this disposable database, preserving the
  // existing real MFA-verified session for the staff UI flow.
  await system.db.updateTable('user').set({ role: 'owner' }).where('email', '=', email).execute();
  const customerEmail = 'staff-target@example.test';
  const created = await context.request.post(origin + '/api/auth/sign-up/email', { headers: { Origin: origin }, data: { name: 'Staff Review Customer', email: customerEmail, password, ageConfirmed: true, termsAccepted: true, policyVersion: POLICY_VERSION, marketingConsent: false } });
  assert.equal(created.status(), 200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/admin/accounts');
  await page.locator('#admin-content').waitFor({ state: 'visible' });
  await page.getByLabel('Search by name or email').fill(customerEmail);
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click();
  await page.getByText('1 account shown.', { exact: true }).waitFor();
  check('MFA-verified owner can search customer accounts');
  await page.getByRole('button', { name: 'Suspend account', exact: true }).click();
  await page.getByLabel('Reason for this action').fill('Browser fixture security review suspension.');
  await page.getByLabel('Your password', { exact: true }).fill(nextPassword);
  await page.locator('#admin-action-confirm').click();
  await page.getByText('Suspend account completed.', { exact: false }).waitFor();
  const target = await system.db.selectFrom('user').selectAll().where('email', '=', customerEmail).executeTakeFirst();
  check('Admin suspension form changes the account through authorized API', target.status === 'suspended');
  await page.getByRole('button', { name: 'Restore account', exact: true }).click();
  await page.getByLabel('Reason for this action').fill('Browser fixture reviewed restoration request.');
  await page.getByLabel('Your password', { exact: true }).fill(nextPassword);
  await page.locator('#admin-action-confirm').click();
  await page.getByText('Restore account completed.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Grant access', exact: true }).click();
  await page.getByLabel('Access plan').selectOption('premium');
  await page.getByLabel('Access expires').fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByLabel('Reason for this action').fill('Browser fixture customer research trial grant.');
  await page.getByLabel('Your password', { exact: true }).fill(nextPassword);
  await page.locator('#admin-action-confirm').click();
  await page.getByText('Grant access completed.', { exact: false }).waitFor();
  const grant = await system.db.selectFrom('accessGrant').selectAll().where('userId', '=', target.id).executeTakeFirst();
  const audit = await system.db.selectFrom('accountAudit').selectAll().where('userId', '=', target.id).where('action', '=', 'admin.grant-access').executeTakeFirst();
  check('Admin time-limited grant is separate from payments and records a reason', grant.plan === 'premium' && audit.detail.includes('Browser fixture customer research trial grant.'));
  await page.screenshot({ path: path.join(reportsDir, 'account-admin-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check('Mobile admin search and actions have no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(reportsDir, 'account-admin-mobile.png'), fullPage: true });
  await page.goto(origin + '/reset-password?error=INVALID_TOKEN');
  await page.getByText('This reset link is missing, expired', { exact: false }).waitFor();
  check('Invalid recovery link has an actionable fresh-link path', await page.getByRole('link', { name: 'Request a new reset link' }).isVisible());
  await page.goto(origin + '/register');
  check('Mobile registration has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(reportsDir, 'account-register-mobile.png'), fullPage: true });
  const mailPage = await context.newPage();
  // Expired, consumed fixture links are removed from the render artifact.
  const renderedMail = verification.mail.html.replaceAll(verification.url.replaceAll('&', '&amp;'), origin + '/verify-email').replaceAll(verification.url, origin + '/verify-email');
  await fs.writeFile(path.join(reportsDir, 'account-verification-email.html'), renderedMail);
  await mailPage.setContent(renderedMail); await mailPage.setViewportSize({ width: 390, height: 844 });
  check('Transactional verification template fits mobile width', await mailPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mailPage.screenshot({ path: path.join(reportsDir, 'account-verification-email-mobile.png'), fullPage: true });
  await mailPage.close();
  check('No uncaught browser JavaScript errors', pageErrors.length === 0);
  await fs.writeFile(path.join(reportsDir, 'account-browser-results.json'), JSON.stringify({ status: 'passed', transport: 'local test email adapter; no external delivery or Stripe checkout tested', checks: outcomes, pageErrors }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks: outcomes, pageErrors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(reportsDir, 'account-browser-failure.png'), fullPage: true });
  console.error(JSON.stringify({ status: 'failed', checks: outcomes, error: error.message, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await system.close();
}
