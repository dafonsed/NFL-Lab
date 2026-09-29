/** Targeted real-browser check: unavailable pricing and suspended sign-in only. */
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createAccountSystem, POLICY_VERSION } from '../lib/accounts/auth.mjs';
import { createAccountHandler, enforceAccountAccess } from '../lib/accounts/http.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const publicDir = path.resolve('public'), reportsDir = path.resolve('reports');
const routes = { '/': 'landing.html', '/login': 'login.html', '/register': 'register.html', '/account': 'account.html', '/forgot-password': 'recovery.html', '/reset-password': 'recovery.html', '/verify-email': 'recovery.html' };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
let system, handle, configured = true;
const outbox = [], checks = [], pageErrors = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!configured && url.pathname.startsWith('/api/account/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ code: 'ACCOUNTS_UNAVAILABLE', error: 'Account services unavailable.' })); }
    if (await handle(req, res, url)) return;
    if (await enforceAccountAccess(req, res, url, system)) return;
    const file = path.resolve(publicDir, routes[url.pathname] || url.pathname.slice(1));
    if (!file.startsWith(publicDir + path.sep) || !mime[path.extname(file)]) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', mime[path.extname(file)]); res.setHeader('Referrer-Policy', 'no-referrer'); res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end('Fixture asset unavailable'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async mail => outbox.push(mail) });
handle = createAccountHandler(system);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
const check = (label, condition = true) => { assert.ok(condition, label); checks.push(label); };
try {
  const plansResponse = page.waitForResponse(response => response.url().endsWith('/api/account/billing/plans'));
  await page.goto(origin + '/#plans');
  const plans = await (await plansResponse).json();
  await page.locator('#home-pricing-grid .home-plan').nth(2).waitFor();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  check('Real plans API reports billing unconfigured and no available checkout prices', plans.configured === false && plans.plans.every(plan => plan.prices.every(price => !price.available)));
  const cards = page.locator('#home-pricing-grid .home-plan');
  const standard = page.getByRole('radio', { name: 'Premium', exact: true });
  const max = page.getByRole('radio', { name: 'Premium Max', exact: true });
  const cardPrices = () => cards.locator('.home-plan-price strong').allTextContents();
  check('Three cards display Basic, Pro, and Premium', await cards.count() === 3 && JSON.stringify(await cards.locator('h3').allTextContents()) === JSON.stringify(['Basic', 'Pro', 'Premium']));
  check('Owner-approved monthly amounts are 14.99, 24.99, and 49.99', JSON.stringify(await cardPrices()) === JSON.stringify(['14.99', '24.99', '49.99']));
  const priceTops = await cards.locator('.home-plan-price strong').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  check(`Desktop price baselines align within 1px (${priceTops.map(top => top.toFixed(2)).join(', ')})`, Math.max(...priceTops) - Math.min(...priceTops) <= 1);
  check('Unavailable billing exposes previews rather than purchase actions', await page.locator('#home-pricing-grid').getByRole('button', { name: /^Choose / }).count() === 0);
  check('Default Premium option is selected accessibly', await standard.isChecked() && !await max.isChecked());
  await page.locator('#plans').screenshot({ path: path.join(reportsDir, 'pricing-three-plans-desktop.png') });
  await standard.focus(); await standard.press('ArrowRight');
  check('ArrowRight selects Premium Max and preserves keyboard focus after rerender', await max.isChecked() && await max.evaluate(element => element === document.activeElement));
  check('Max changes price, heading, content context, and CTA selection', await cards.nth(2).locator('h3').innerText() === 'Premium Max' && await cards.nth(2).locator('.home-plan-price strong').innerText() === '99.99' && (await cards.nth(2).locator('h4').innerText()).includes('Max benefits coming soon') && await page.getByRole('button', { name: 'Preview Premium Max', exact: true }).isVisible());
  await page.locator('#plans').screenshot({ path: path.join(reportsDir, 'pricing-three-plans-max-desktop.png') });
  await page.getByRole('button', { name: 'Preview Premium Max', exact: true }).click();
  check('Max CTA opens matching preview and discloses unavailable extras and checkout', await page.getByRole('dialog', { name: 'Premium Max preview' }).isVisible() && (await page.locator('#home-pricing-dialog p').innerText()).includes('additional features and checkout are not available yet'));
  await page.keyboard.press('Escape');
  check('Escape dismisses preview and returns keyboard focus to selected CTA', !await page.locator('#home-pricing-dialog').isVisible() && await page.getByRole('button', { name: 'Preview Premium Max', exact: true }).evaluate(element => element === document.activeElement));
  await page.getByRole('switch').click();
  check('Annual cycle retains selected Max and unchanged monthly fallback amounts', await max.isChecked() && JSON.stringify(await cardPrices()) === JSON.stringify(['14.99', '24.99', '99.99']));
  check('Annual state explicitly says monthly preview and unavailable annual pricing', (await cards.locator('.home-plan-billing').allTextContents()).every(text => text === 'Monthly preview shown · annual pricing unavailable') && await page.locator('.home-pricing-cycle em').innerText() === 'Preview only');
  await page.getByRole('switch').click();
  await max.focus(); await max.press('ArrowLeft');
  check('ArrowLeft restores Standard option, amount, heading, and focus', await standard.isChecked() && await standard.evaluate(element => element === document.activeElement) && await cards.nth(2).locator('h3').innerText() === 'Premium' && await cards.nth(2).locator('.home-plan-price strong').innerText() === '49.99');
  await max.focus(); await max.press('Space');
  check('Space selects the focused Max radio', await max.isChecked() && await max.evaluate(element => element === document.activeElement));
  for (const width of [920, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const variant of ['pro', 'premium_max']) {
      const radio = variant === 'pro' ? standard : max;
      await radio.focus(); await radio.press('Space');
      check(`${width}px ${variant === 'pro' ? 'Premium' : 'Premium Max'} cards fit without horizontal overflow`, await page.locator('#plans').evaluate(element => element.scrollWidth <= element.getBoundingClientRect().width) && await cards.evaluateAll(elements => elements.every(element => element.scrollWidth <= Math.ceil(element.getBoundingClientRect().width))));
      check(`${width}px Premium header and segmented options do not overlap`, await cards.nth(2).evaluate(element => { const heading = element.querySelector('h3').getBoundingClientRect(), toggle = element.querySelector('.home-plan-variants').getBoundingClientRect(); return heading.right <= toggle.left + 1 || heading.bottom <= toggle.top + 1 || toggle.bottom <= heading.top + 1; }));
      if (width !== 320) await page.locator('#plans').screenshot({ path: path.join(reportsDir, `pricing-three-plans-${variant}-${width}.png`) });
    }
  }
  configured = false;
  const missingResponse = page.waitForResponse(response => response.url().endsWith('/api/account/billing/plans'));
  await page.reload(); assert.equal((await missingResponse).status(), 503);
  check('Unavailable-service fallback preserves the three approved plan previews', JSON.stringify(await cards.locator('h3').allTextContents()) === JSON.stringify(['Basic', 'Pro', 'Premium']) && JSON.stringify(await cardPrices()) === JSON.stringify(['14.99', '24.99', '49.99']));
  check('Unavailable fallback never enables Max checkout', await page.locator('#home-pricing-grid').getByRole('button', { name: /^Choose / }).count() === 0);
  configured = true;
  if (!process.env.ACCOUNT_BROWSER_PRICING_ONLY) {
  const email = 'suspended-browser@example.test', password = 'Bright autumn research maps stay private!';
  const signup = await context.request.post(origin + '/api/auth/sign-up/email', { headers: { Origin: origin }, data: { email, password, name: 'Suspended Browser Fixture', termsAccepted: true, policyVersion: POLICY_VERSION, marketingConsent: false } });
  assert.equal(signup.status(), 200); await system.mail.drain();
  const url = outbox.find(mail => /Verify your/.test(mail.subject)).text.match(/https?:\/\/[^\s]+/)[0];
  await context.request.get(url);
  await system.db.updateTable('user').set({ status: 'suspended' }).where('email', '=', email).execute();
  await page.goto(origin + '/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong but sufficiently long password!');
  let responsePromise = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in/email'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const wrong = await (await responsePromise).json();
  check('Wrong password does not reveal the account is suspended', wrong.code !== 'ACCOUNT_SUSPENDED' && !(await page.locator('#account-status').innerText()).includes('suspended'));
  await page.getByLabel('Password', { exact: true }).fill(password);
  responsePromise = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in/email'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const suspendedResponse = await responsePromise, suspended = await suspendedResponse.json();
  await page.getByText('This account is suspended.', { exact: false }).waitFor();
  check('Correct-password suspended sign-in displays explicit safe guidance', suspendedResponse.status() === 403 && suspended.code === 'ACCOUNT_SUSPENDED' && (await page.locator('#account-status').innerText()).includes('Privacy Policy'));
  const session = await context.request.get(origin + '/api/auth/get-session');
  check('Suspended sign-in does not create a session', session.status() === 200 && await session.json() === null);
  check('Suspended error uses an accessible alert and fits mobile', await page.locator('#account-status').getAttribute('role') === 'alert' && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(reportsDir, 'account-suspended-signin-mobile.png'), fullPage: true });
  const dialogPage = await context.newPage();
  for (const [file, id, name] of [['account.html', 'security-dialog', 'Confirm it is you'], ['account.html', 'mfa-dialog', 'Set up your authenticator'], ['admin-accounts.html', 'admin-action-dialog', 'Update account']]) {
    const source = await fs.readFile(path.join(publicDir, file), 'utf8');
    const dialogMarkup = source.match(new RegExp(`<dialog\\b[^>]*id="${id}"[\\s\\S]*?<\\/dialog>`))?.[0];
    assert.ok(dialogMarkup);
    await dialogPage.setContent(dialogMarkup);
    await dialogPage.locator('#' + id).evaluate(element => element.showModal());
    check(`${id} has its expected accessible name`, await dialogPage.getByRole('dialog', { name, exact: true }).isVisible());
    check(`${id} description references a real element`, await dialogPage.locator('#' + id).evaluate(element => Boolean(document.getElementById(element.getAttribute('aria-describedby')))));
  }
  await dialogPage.close();
  }
  check('Targeted browser flows have no uncaught JavaScript errors', pageErrors.length === 0);
  const result = { status: 'passed', checks, pageErrors, limitations: 'No live Stripe checkout or external email delivery performed. Pricing checked against the real unconfigured billing service and unavailable-service fallback.' };
  await fs.writeFile(path.join(reportsDir, process.env.ACCOUNT_BROWSER_PRICING_ONLY ? 'pricing-three-plans-browser-results.json' : 'account-pricing-browser-results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(reportsDir, 'account-pricing-browser-failure.png'), fullPage: true });
  console.error(JSON.stringify({ status: 'failed', checks, pageErrors, error: error.message }, null, 2)); process.exitCode = 1;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await system.close(); }
