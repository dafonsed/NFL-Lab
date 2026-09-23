// Browser audit against the running local app. No production data is modified.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3199';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || 'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/nfl', '/mlb', '/nba', '/wnba', '/nhl', '/soccer', ...['nfl','mlb','nba','wnba','nhl','soccer'].map(s => `/${s}?view=trends`), '/live', ...['nfl','mlb','nba','wnba'].map(s => `/${s}/live`), '/simulation', ...['nfl','mlb','nba','wnba','nhl','soccer'].map(s => `/${s}/simulation`), '/performance', '/paper', '/paper?sport=mlb', '/bets'];
const results = [];
await fs.mkdir('reports/frontend', { recursive: true });
try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], failures = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failures.push({url:r.url(), status:r.status()}); });
    await page.goto(base + route);
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 10_000 }).catch(() => {});
    const slug = route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') || 'home';
    const sizes = [];
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:`reports/frontend/${slug}-${width}.png`});
      sizes.push(await page.evaluate(() => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth, overflow:[...document.querySelectorAll('main *')].filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.right>innerWidth+1||r.left< -1) && !e.closest('[class*="table"], [class*="markets"], [class*="chart"], [class*="segmented"], [class*="windows"]'); }).slice(0,8).map(e=>e.tagName+'.'+e.className) })));
    }
    const result = {route, title:await page.title(), errors, failures, sizes, busy:await page.locator('[aria-busy="true"]').count(), status:await page.locator('#connection-label,#connection,#td-status,#feed-status,#status,#sim-status').allTextContents(), text:(await page.locator('main').innerText()).slice(0,3500)};
    results.push(result); console.log(JSON.stringify({route, errors, failures:failures.length, overflow:sizes.filter(s=>s.scrollWidth>s.width), busy:result.busy,status:result.status}));
    await fs.writeFile(`reports/frontend/${slug}-audit.json`, JSON.stringify(result,null,2));
    await page.close();
  }
} finally { await fs.writeFile(`reports/frontend/audit-${Date.now()}.json`, JSON.stringify(results,null,2)); await browser.close(); }
