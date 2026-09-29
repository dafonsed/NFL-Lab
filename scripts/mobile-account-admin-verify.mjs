// Public admin sandbox and logged-out account pages; all synthetic mutations stay in this fresh browser context.
import{createRequire}from'node:module';import fs from'node:fs/promises';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{chromium,webkit}=require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='reports/mobile-account-admin-tracker',routes=['/login','/register','/account','/forgot-password','/reset-password','/verify-email','/two-factor','/admin-sandbox',...['users','billing','sources','events','quality','ev','arbitrage','fantasy','links','grading','clv','wallets','lineups','notifications','content','support','system','admins','security','reports'].map(s=>'/admin-sandbox/'+s)],results=[];
for(const engine of ['chromium','webkit']){
 let browser;try{browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}):webkit.launch({headless:true}));}catch(e){results.push({engine,error:e.message});continue;}
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 try{
  for(const route of routes){const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3199'+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(100);
   for(const width of [320,360,375,390,430,768,667,1440]){await page.setViewportSize({width,height:width===667?375:width===1440?1000:844});const metric=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((s,r)=>s+r.encodedBodySize,0),load:performance.getEntriesByType('navigation')[0]?.loadEventEnd}));results.push({route,engine,...metric,errors});if(width===390&&engine==='chromium')await page.screenshot({path:`${out}/after-${route.slice(1).replaceAll('/','-')}-390.png`,fullPage:true});}
   await page.close();
  }
  const p=await context.newPage();await p.setViewportSize({width:320,height:740});await p.goto('http://127.0.0.1:3199/admin-sandbox/sources');await p.locator('[data-action=toggle-nav]').click();assert.equal(await p.locator('.ad-workspace').evaluate(e=>e.inert),true);await p.keyboard.press('Escape');assert.equal(await p.locator('[data-action=toggle-nav]').evaluate(e=>e===document.activeElement),true);
  await p.locator('.ad-record-name').first().click();assert.equal(await p.locator('#admin-dialog').getAttribute('aria-labelledby'),'admin-dialog-title');await p.screenshot({path:`${out}/after-admin-source-inspector-${engine}-320.png`});await p.getByRole('button',{name:'Edit record',exact:true}).click();await p.screenshot({path:`${out}/after-admin-source-editor-${engine}-320.png`});assert.equal(await p.locator('#admin-dialog').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);await p.getByRole('button',{name:'Cancel',exact:true}).click();
  await p.locator('#admin-record-search').fill('zz-no-record');await p.waitForFunction(()=>document.querySelector('#admin-content').textContent.includes('No matching records'));assert.match(await p.locator('#admin-content').innerText(),/No matching records/);await p.getByRole('button',{name:'Clear filters',exact:true}).click();
  await p.locator('#admin-role').selectOption('Support');assert.equal(await p.locator('.ad-nav-group a[data-section=sources]').count(),0);
  results.push({engine,journey:'admin 320px nav/focus/inspect/edit-cancel/empty-filter/role restriction',passed:true});await p.close();
 }catch(e){results.push({engine,error:e.stack});}finally{await browser.close();}
}
await fs.writeFile(`${out}/account-admin-verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.filter(r=>r.error||r.journey||r.scrollWidth>r.width+1),null,2));if(results.some(r=>r.error||r.scrollWidth>r.width+1))process.exitCode=1;

