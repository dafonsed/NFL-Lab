// Public site smoke tests: every public page family renders with the shared chrome and works in
// each browser project (Chromium, Firefox, WebKit, mobile). No account or live data needed.
import { test, expect } from '@playwright/test';

const collectErrors = page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/401|Failed to load resource/.test(message.text())) errors.push(message.text()); });
  return errors;
};

test('homepage renders the shared header, footer and the example feed', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/VisualOdds/);
  await expect(page.locator('.vo-site-header')).toHaveCount(1);
  await expect(page.locator('.vo-site-footer')).toHaveCount(1);
  await expect(page.locator('#mock-ev .oj-card').first()).toBeVisible();
  await page.locator('#mock-tab-arb').click();
  await expect(page.locator('#mock-arb')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Learn library filters by type and search', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('h1')).toContainText('one library');
  await page.locator('[data-learn-type="state"]').click();
  await page.locator('#learn-search').fill('new york');
  await expect(page.locator('#learn-count')).toHaveText('1 result');
  await expect(page.locator('.learn-card:not([hidden]) strong')).toHaveText('Online sports betting in New York');
  await expect(page).toHaveURL(/type=state/);
});

for (const path of ['/betting-education', '/online-sports-betting', '/online-sportsbooks', '/betting-calculators', '/odds-api', '/docs', '/about', '/contact', '/changelog']) {
  test(`${path} uses the shared site chrome`, async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.locator('.vo-site-header')).toHaveCount(1);
    await expect(page.locator('.vo-site-footer')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('the status page checks the API from the browser', async ({ page }) => {
  await page.goto('/status');
  await expect(page.locator('[data-component="api"] small')).toContainText('Up', { timeout: 15_000 });
});

test('unknown pages show the designed 404 page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('This page is off the board.');
});

test('the mobile menu opens and closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout only');
  await page.goto('/betting-education');
  const toggle = page.locator('.home-menu-toggle');
  await toggle.click();
  await expect(page.locator('#home-nav')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('the sitemap lists the library', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain('/learn</loc>');
  expect(xml).toContain('/online-sports-betting/new-york</loc>');
});

test('the Learn library pages through results', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('.learn-card:not([hidden])')).toHaveCount(12);
  await page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('#learn-count')).toContainText('13–24');
});

test('the Beginner Guide remembers finished lessons', async ({ page }) => {
  await page.goto('/learn/beginner-guide');
  await expect(page.locator('.bg-lesson')).toHaveCount(7);
  await page.locator('[data-mark="your-first-research-session"]').click();
  await expect(page.locator('#bg-done')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#bg-done')).toHaveText('1');
  await expect(page.locator('#bg-continue')).toContainText('lesson 2');
});

test('the API reference sends a request with Try it', async ({ page }) => {
  await page.goto('/odds-api/health');
  await page.locator('#apiref-try').click();
  await expect(page.locator('#apiref-response-meta')).toContainText('200');
  await expect(page.locator('#apiref-response-body')).toContainText('"ok"');
});
