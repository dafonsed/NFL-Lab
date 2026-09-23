// Isolated browser checks. Error responses below are test-only; no saved user
// records or model inputs on disk are changed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || 'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const base = process.env.FRONTEND_URL || 'http://127.0.0.1:3199';
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page = await context.newPage(), results=[], errors=[];
page.on('pageerror', e => errors.push(e.message));
const ready = async selector => page.locator(selector).first().waitFor({timeout:45000});
const idle = async () => page.waitForFunction(() => !document.querySelector('[aria-busy=true]'),null,{timeout:45000});
async function check(name, fn) {
  try { await fn(); results.push({name,pass:true}); }
  catch(e) { results.push({name,pass:false,error:e.message}); await page.keyboard.press('Escape').catch(()=>{}); }
  console.log(JSON.stringify(results.at(-1)));
}
try {
  await check('Home navigation, metric guide, search and CSV export',async()=>{
    await page.goto(base+'/');await page.getByRole('link',{name:'Explore NFL research'}).click();await ready('[data-expand]');
    await page.locator('.research-guide summary').click();assert.match(await page.locator('.guide-body').innerText(),/not predictive confidence/);await page.locator('.research-guide summary').click();
    await page.locator('#search').fill('zzzz-no-player');assert.equal(await page.locator('[data-expand]').count(),0);await page.locator('#search').fill('');await ready('[data-expand]');
    await page.locator('#export-button').click();assert.match(await page.locator('#dialog').getAttribute('aria-label'),/Export/);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:/Download CSV/}).click();assert.match((await download).suggestedFilename(),/\.csv$/);await page.keyboard.press('Escape');
  });
  await check('Research to Trends preserves week and market',async()=>{
    await page.goto(base+'/nfl?season=2026&week=3&market=rec_yds&view=board');await ready('[data-expand]');
    await page.locator('.site-navigation').getByRole('link',{name:'Trends',exact:true}).click();await ready('.td-player-row');
    const url=new URL(page.url());assert.equal(url.searchParams.get('week'),'3');assert.equal(url.searchParams.get('market'),'rec_yds');
    await page.locator('.site-navigation').getByRole('link',{name:'Research',exact:true}).click();await ready('[data-expand]');assert.equal(new URL(page.url()).searchParams.get('week'),'3');
  });
  await check('Evidence dialog name, sticky close, empty record explanations',async()=>{
    await page.goto(base+'/mlb?date=2026-09-22&market=hits');await ready('.mlb-card');await page.locator('[data-action=model]').click();await ready('#mlb-dialog[open]');
    assert.ok(await page.locator('#mlb-dialog').getAttribute('aria-label'));
    await page.locator('#mlb-dialog').evaluate(el=>el.scrollTop=el.scrollHeight);await page.locator('#close-dialog').click();assert.equal(await page.locator('#mlb-dialog').evaluate(e=>e.open),false);
    await page.goto(base+'/paper?sport=mlb&date=2001-01-01');await idle();assert.equal(await page.locator('#report tbody:empty').count(),0);assert.match(await page.locator('#report').innerText(),/No qualifying|No records/);
  });
  await check('Performance filters, historical split, pagination and JSON download',async()=>{
    await page.goto(base+'/performance');await idle();await ready('#historical table');await page.locator('#split').selectOption('2024');assert.ok(await page.locator('#historical tbody tr').count());
    await page.locator('#market').selectOption('rec_yds');await idle();assert.equal(await page.locator('#market').inputValue(),'rec_yds');
    if(await page.locator('#next-page').isEnabled()){await page.locator('#next-page').click();await idle();assert.match(await page.locator('#report').innerText(),/Page 2/);await page.locator('#previous-page').click();await idle();}
    const download=page.waitForEvent('download');await page.locator('#export').click();assert.match((await download).suggestedFilename(),/\.json$/);
  });
  await check('Simulation real run, distribution, export and input invalidation',async()=>{
    await page.goto(base+'/nfl/simulation?date=2026-09-20');await page.waitForFunction(()=>!document.querySelector('#sim-game').disabled,null,{timeout:45000});
    assert.equal(await page.locator('#sim-run').isEnabled(),true);await page.locator('#sim-count').selectOption('1000');await page.locator('#sim-seed').fill('frontend-verification');await page.locator('#sim-run').click();await ready('.sim-outcome');
    assert.equal(await page.locator('.sim-histogram').count(),2);assert.match(await page.locator('#sim-results').innerText(),/HISTORICAL RECONSTRUCTION/);
    await page.screenshot({path:'reports/frontend/simulation-result-1440.png'});
    for(const width of [768,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.screenshot({path:`reports/frontend/simulation-result-${width}.png`});}
    const download=page.waitForEvent('download');await page.locator('#sim-download').click();assert.match((await download).suggestedFilename(),/simulation.*\.json$/);
    await page.locator('#sim-seed').fill('changed-input');assert.equal(await page.locator('.sim-outcome').count(),0);assert.match(await page.locator('#sim-status').innerText(),/Inputs changed/);
    await page.setViewportSize({width:1440,height:1000});
  });
  await check('Paper failure state and successful retry',async()=>{
    let fail=true;
    await page.route('**/api/paper?*', async route=>{if(fail)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Verification: source temporarily unavailable'})});else await route.continue();});
    await page.goto(base+'/paper?sport=mlb');await ready('[data-paper-retry]');assert.equal(await page.locator('#report').getAttribute('aria-busy'),'false');assert.equal(await page.locator('#export').isDisabled(),true);
    fail=false;await page.locator('[data-paper-retry]').click();await idle();assert.equal(await page.locator('#export').isEnabled(),true);await page.unroute('**/api/paper?*');
  });
  await check('Simulation schedule failure, retry and stale guard',async()=>{
    let failure=true;
    await page.route('**/api/simulation/catalog?*',async route=>{if(failure)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Verification: schedule unavailable'})});else await route.continue();});
    await page.goto(base+'/nfl/simulation');await ready('#sim-retry');assert.equal(await page.locator('#sim-run').isDisabled(),true);await page.locator('#sim-count').selectOption('25000');assert.equal(await page.locator('#sim-run').isDisabled(),true);
    failure=false;await page.locator('#sim-retry').click();await page.waitForFunction(()=>!document.querySelector('#sim-run').disabled,null,{timeout:45000});await page.unroute('**/api/simulation/catalog?*');
  });
  await check('Latest selected market wins during overlapping requests',async()=>{
    await page.goto(base+'/wnba?date=2026-09-22');await ready('.sports-card');
    const buttons=page.locator('#markets [data-market]');const next=await buttons.nth(2).getAttribute('data-market');
    await buttons.nth(1).click();await buttons.nth(2).click();await idle();assert.equal(await page.locator('#markets [aria-pressed=true]').getAttribute('data-market'),next);assert.equal(new URL(page.url()).searchParams.get('market'),next);
  });
  assert.deepEqual(errors,[]);
} finally {
  await fs.writeFile(`reports/frontend/interactions-${Date.now()}.json`,JSON.stringify({results,errors},null,2));
  await browser.close();
  if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
}
