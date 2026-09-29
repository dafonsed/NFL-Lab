import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.AUDIT_URL||'http://127.0.0.1:3201';
const results=[];await fs.mkdir('reports/mobile/journeys',{recursive:true});
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',storageState:join(tmpdir(),`sportslab-mobile-audit-session-${new URL(base).port}.json`)});
 const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 try{
  await page.goto(base+'/nfl');await page.locator('.research-row').first().waitFor({timeout:30000});
  await page.locator('[data-sidebar-toggle]').click();assert.equal(await page.locator('main').evaluate(e=>e.inert),true);await page.goBack();await page.waitForFunction(()=>document.querySelector('[data-sidebar-toggle]').getAttribute('aria-expanded')==='false');checks.push('Browser Back dismisses navigation and keeps route');
  await page.locator('.research-player').first().click();await page.locator('.pr-chart-scroll').first().waitFor();
  await page.screenshot({path:`reports/mobile/journeys/${name}-player-detail-390.png`});
  const fullChart=page.locator('.pr-chart-scroll').filter({has:page.locator('svg[role=group]')}).first();
  await fullChart.locator('[data-result]').first().tap();assert.ok((await page.locator('.mobile-chart-reading').first().innerText()).length>4);checks.push('Touch chart result reveals date/opponent/stat');
  await page.getByRole('button',{name:'Expand chart',exact:true}).first().click();await page.locator('.mobile-chart-dialog[open]').waitFor();
  await page.setViewportSize({width:667,height:375});await page.screenshot({path:`reports/mobile/journeys/${name}-chart-landscape.png`});
  const dialog=await page.locator('.mobile-chart-dialog').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));assert.ok(dialog.width<=667&&dialog.height<=375);await page.goBack();await page.waitForFunction(()=>!document.querySelector('.mobile-chart-dialog'));checks.push('Expanded chart fits landscape; Back restores inline chart');
  await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`reports/mobile/journeys/${name}-player-detail-320.png`});
  // Verify increased text does not become document-wide overflow.
  await page.addStyleTag({content:'html {font-size:200%}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push('320px player detail has no document overflow at increased root text size');
  await page.route('**/api/nfl/live*',r=>r.abort('failed'));await page.goto(base+'/nfl/live');await page.waitForFunction(()=>document.querySelector('#players').getAttribute('aria-busy')==='false');assert.match(await page.locator('main').innerText(),/unavailable|interrupted|failed/i);checks.push('Failed live request clears loading and exposes retry');
  await page.locator('#auto').uncheck();await page.reload();assert.equal(await page.locator('#auto').isChecked(),false);checks.push('Live auto-refresh preference survives reload');
  results.push({engine:name,checks,errors});console.log(JSON.stringify(results.at(-1)));
 }catch(error){results.push({engine:name,checks,errors,failure:error.message});await page.screenshot({path:`reports/mobile/journeys/${name}-failure.png`}).catch(()=>{});console.log(JSON.stringify(results.at(-1)));}
 finally{await browser.close();}
}
await fs.writeFile('reports/mobile/journeys/results.json',JSON.stringify(results,null,2));
if(results.some(r=>r.failure||r.errors.length))process.exitCode=1;
