// Isolated localhost account; only the result-feed response is a controlled fixture.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sampleBets } from '../public/bet-sample-data.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3201',key='nfl-lab.personal-bets.v1',results=[];
for(const engine of ['chromium','webkit']){
 const browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}):webkit.launch({headless:true}));
 const context=await browser.newContext({storageState:path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json'),viewport:{width:390,height:844},hasTouch:true});
 let saved;
 try{
  const current=await(await context.request.get(base+'/api/account/data/bets')).json();saved=current.value?.storage?.[key];
  const sample=sampleBets()[0],leg={id:'audit-leg',mode:'auto',entry:'game',sport:'NBA',league:'nba',date:sample.date,gameId:'77777777',market:'points',marketLabel:'Player points',subjectId:'audit-player',subject:'Audit player',matchup:'Synthetic away at home',label:'Audit player Over 29.5 points',side:'over',line:29.5,override:null,observation:null};
  const bets=[{...sample,id:'audit-manual',selection:'Untouched manual receipt',status:'open',updatedAt:sample.date+'T14:00:00.000Z'},{...sample,id:'audit-auto',selection:leg.label,status:'open',settlement:'auto',legs:[leg],updatedAt:sample.date+'T12:00:00.000Z'}];
  const value={...current.value,storage:{...current.value?.storage,[key]:JSON.stringify({version:1,bets})}};
  assert.equal((await context.request.put(base+'/api/account/data/bets',{headers:{Origin:base},data:{value,version:current.version}})).status(),200);
  const page=await context.newPage();let phase=0,calls=0;
  await page.route('**/api/bets/game?*',async route=>{calls++;await route.fulfill({json:{sport:'nba',league:'nba',game:{id:leg.gameId,state:'in',status:'In progress',complete:false},source:{stale:phase===2,checkedAt:`2026-09-28T00:0${phase}:00.000Z`,url:'https://example.test/synthetic-result'},markets:{points:{kind:'player'}},players:[{id:leg.subjectId,participation:'played',values:{points:phase===0?15:25}}]}});});
  await page.goto(base+'/ev/tracker');await page.waitForFunction(()=>document.querySelector('#tracking-status')?.textContent.includes('Checked'));
  const auto=page.locator('[data-ticket-id="audit-auto"]');await auto.locator('summary').click();assert.match(await auto.innerText(),/Current:\s*15/);
  const originalOrder=await page.locator('[data-ticket-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.ticketId));
  const price=await auto.locator('.bet-price').innerText();
  await page.locator('[data-ticket-id="audit-manual"]').scrollIntoViewIfNeeded();
  const anchor=await page.locator('[data-ticket-id="audit-manual"]').evaluate(e=>{window.__manualReceipt=e;return e.getBoundingClientRect().top;});
  phase=1;await page.locator('#refresh-lines').evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('[data-ticket-id="audit-auto"]')?.textContent.match(/Current:\s*25/));
  assert.deepEqual(await page.locator('[data-ticket-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.ticketId)),originalOrder,'refresh preserves ticket order');
  assert.equal(await auto.locator('.bet-price').innerText(),price,'booked price remains fixed');
  assert.equal(await page.locator('[data-ticket-id="audit-manual"]').evaluate(e=>e===window.__manualReceipt),true,'unchanged receipt keeps its node');
  assert.ok(Math.abs(await page.locator('[data-ticket-id="audit-manual"]').evaluate(e=>e.getBoundingClientRect().top)-anchor)<2,'refresh keeps viewport anchor');
  phase=2;await page.locator('#refresh-lines').evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('[data-ticket-id="audit-auto"]')?.textContent.includes('Data unavailable'));
  assert.match(await auto.innerText(),/Potential/);assert.match(await auto.innerText(),/not been graded/);
  assert.equal(await page.evaluate(async storageKey=>JSON.parse((await import('/account-sync.js')).accountStorage.getItem(storageKey)).bets.find(b=>b.id==='audit-auto').status,key),'open');
  const beforeHidden=calls;await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.querySelector('#refresh-lines').click();});await page.waitForTimeout(100);assert.equal(calls,beforeHidden,'hidden document guard avoids network work');await page.evaluate(()=>delete document.hidden);
  await page.evaluate(()=>scrollTo(0,0));await page.locator('#add-bet').click();const beforeDialog=calls;await page.locator('#refresh-lines').evaluate(e=>e.click());await page.waitForTimeout(100);assert.equal(calls,beforeDialog,'editor guard avoids refresh');await page.locator('#close-bet').click();
  await page.screenshot({path:`reports/mobile-account-admin-tracker/after-tracker-feed-unavailable-${engine}-390.png`,fullPage:true});
  results.push({engine,passed:true,conditions:'real account API; controlled synthetic result feed, document.hidden emulated',checks:['live value changes','fixed booked odds','unchanged sort order','retained unchanged receipt node','viewport anchor','stale feed stays open/ungraded','hidden-page guard','open-editor guard'],calls});
 }catch(error){results.push({engine,error:error.stack});}
 finally{
  // Preserve any other concurrently changed account preferences while restoring the ledger.
  if(saved!==undefined){const latest=await(await context.request.get(base+'/api/account/data/bets')).json();await context.request.put(base+'/api/account/data/bets',{headers:{Origin:base},data:{value:{...latest.value,storage:{...latest.value?.storage,[key]:saved}},version:latest.version}});}
  await browser.close();
 }
}
await fs.writeFile('reports/mobile-account-admin-tracker/tracker-live-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.error))process.exitCode=1;
