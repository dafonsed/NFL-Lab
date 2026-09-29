import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),engines=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.AUDIT_URL||'http://127.0.0.1:3202';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use a disposable local fixture.');
const results=[];
for(const engine of ['chromium','webkit']){
 const browser=await engines[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}:{})});
 try{
  for(const scenario of ['module-failure','account-unavailable']){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,storageState:join(tmpdir(),`sportslab-mobile-audit-session-${new URL(base).port}.json`)});
   if(scenario==='module-failure')await context.route('**/ev.js?*',route=>route.abort());
   else await context.route('**/api/auth/get-session',route=>route.fulfill({status:503,json:{error:'Synthetic unavailable account service'}}));
   const page=await context.newPage();await page.goto(base+'/ev#ev-pre',{waitUntil:'domcontentloaded'});
   let message;
   if(scenario==='module-failure'){
    await page.locator('#ev-loading').waitFor();
    await page.locator('[data-loading-retry]').waitFor({state:'visible',timeout:18000});
    message=await page.locator('[data-loading-message]').innerText();assert.match(message,/taking longer/);
   }else{
    await page.locator('#account-sync-notice').waitFor();
    message=await page.locator('#account-sync-notice').innerText();assert.match(message,/session changed or could not be checked/);
    assert.equal(await page.locator('#account-sync-notice').getByRole('button',{name:'Reload',exact:true}).isVisible(),true);
   }
   assert.equal(await page.locator('[data-sidebar-toggle]').isVisible(),true);
   assert.equal(await page.locator('.ev-control-grid').isVisible(),false);
   const row={engine,scenario,message,retryVisible:true,navigationVisible:true,inactiveControlsHidden:true};results.push(row);console.log(JSON.stringify(row));await context.close();
  }
 }finally{await browser.close();}
}
await fs.writeFile('reports/mobile/loading-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
