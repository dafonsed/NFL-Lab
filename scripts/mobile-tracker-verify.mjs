// Ephemeral localhost test account only. Real server auth/data APIs; synthetic bet records. No production data or billing changes.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {sampleBets} from '../public/bet-sample-data.js';
import {renderSitePage} from '../lib/site-layout.mjs';
import {trackerMarkets} from '../lib/bet-tracker.mjs';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.FRONTEND_URL||'http://127.0.0.1:3201';
const out='reports/mobile-account-admin-tracker';
await fs.mkdir(out,{recursive:true});
const results=[];
const widths=[320,360,375,390,430,768,667,1440];
const samples=sampleBets();
function fixtureBets(){return Array.from({length:120},(_,i)=>({...samples[i%samples.length],id:`mobile-${i}`,selection:i===0?'Alexandria Montgomery-Worthington · Over 29.5 points + rebounds + assists (alternate line)':i===119?'Last ledger searchable ticket':samples[i%samples.length].selection,odds:i===0?12500:samples[i%samples.length].odds,stake:i===0?10000:samples[i%samples.length].stake}));}
async function fixture(context){
 const session=JSON.parse(await fs.readFile(path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json'),'utf8'));
 await context.addCookies(session.cookies);
 const current=await (await context.request.get(base+'/api/account/data/bets')).json();
 const value={...current.value,storage:{...current.value?.storage,'nfl-lab.personal-bets.v1':JSON.stringify({version:1,bets:fixtureBets()})}};
 const seeded=await context.request.put(base+'/api/account/data/bets',{headers:{Origin:base},data:{value,version:current.version}});assert.equal(seeded.status(),200,'seed only in-memory fixture account');
}
async function instrument(page){await page.addInitScript(()=>{window.__mobilePerf={lcp:null,cls:0,longTasks:[],events:[]};for(const [type,work] of [['largest-contentful-paint',e=>{window.__mobilePerf.lcp=e.startTime;}],['layout-shift',e=>{if(!e.hadRecentInput)window.__mobilePerf.cls+=e.value;}],['longtask',e=>window.__mobilePerf.longTasks.push(e.duration)],['event',e=>{if(e.interactionId)window.__mobilePerf.events.push(e.duration);}]]){try{new PerformanceObserver(list=>list.getEntries().forEach(work)).observe({type,buffered:true,durationThreshold:16});}catch{}}});}
async function metric(page){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nodes:document.querySelectorAll('*').length,bytes:performance.getEntriesByType('resource').reduce((s,r)=>s+r.encodedBodySize,0),requests:performance.getEntriesByType('resource').length,load:performance.getEntriesByType('navigation')[0]?.loadEventEnd,...window.__mobilePerf}));}
for(const engine of ['chromium','webkit']){
 let browser;try{browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}):webkit.launch({headless:true}));}catch(e){results.push({engine,error:e.message});continue;}
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});await fixture(context);const page=await context.newPage();await instrument(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/ev/tracker');await page.locator('[data-ticket-id]').first().waitFor();
  const initial=await metric(page);
 assert.equal(await page.locator('[data-ticket-id]').count(),40);
 await page.locator('[data-more-tickets]').click();assert.equal(await page.locator('[data-ticket-id]').count(),80);
 await page.locator('[data-more-tickets]').click();assert.equal(await page.locator('[data-ticket-id]').count(),120);
 await page.locator('#bet-search').fill('Last ledger searchable ticket');assert.equal(await page.locator('[data-ticket-id]').count(),1);
 await page.locator('#bet-search').fill('');assert.equal(await page.locator('[data-ticket-id]').count(),40);
 await page.evaluate(()=>scrollTo(0,0));
  for(const width of widths){await page.setViewportSize({width,height:width===667?375:width===1440?1000:844});await page.waitForTimeout(70);const m=await metric(page);assert.ok(m.scrollWidth<=width+1,`tracker overflow ${engine} ${width}: ${m.scrollWidth}`);const prices=await page.locator('.bet-price').first().evaluate(e=>({display:getComputedStyle(e).display,size:parseFloat(getComputedStyle(e).fontSize)}));assert.notEqual(prices.display,'none',`hidden price at ${width}`);results.push({engine,route:'/ev/tracker',fixture:'120 account tickets, including long name and +12500',...m,prices});if([320,390,667,1440].includes(width)){await page.screenshot({path:`${out}/after-tracker-${engine}-${width}.png`});await page.locator('.bet-day-heading').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/after-ledger-${engine}-${width}.png`});await page.evaluate(()=>scrollTo(0,0));}}
  await page.setViewportSize({width:390,height:844});
  const interactions={};
  interactions.filterOpenMs=await page.evaluate(async()=>{const t=performance.now();document.querySelector('#tracker-filter-toggle').click();await new Promise(requestAnimationFrame);return performance.now()-t;});
  interactions.filterApplyMs=await page.evaluate(async()=>{const t=performance.now();const s=document.querySelector('#sport-filter');s.value='NBA';s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(requestAnimationFrame);return performance.now()-t;});
  assert.ok(await page.locator('[data-ticket-id]').count()<120);
  await page.locator('#bet-search').fill('unfindable-mobile-ticket');assert.equal(await page.locator('[data-ticket-id]').count(),0);assert.match(await page.locator('#bet-list').innerText(),/No tickets/);
  await page.locator('#bet-search').fill('');await page.locator('[data-remove-filter=sport-filter]').click();
  const firstId=await page.locator('[data-ticket-id]').first().getAttribute('data-ticket-id');
  interactions.expandMs=await page.evaluate(async()=>{const t=performance.now();document.querySelector('.bet-ticket summary').click();await new Promise(requestAnimationFrame);return performance.now()-t;});
  await page.evaluate(()=>window.__savedTicket=document.querySelector('.bet-ticket'));
  await page.locator('#bet-search').fill('');await page.locator('#bet-search').dispatchEvent('input');
  assert.equal(await page.evaluate(()=>window.__savedTicket===document.querySelector('.bet-ticket')),true,'unchanged ticket retains node');
  assert.equal(await page.locator(`[data-ticket-id="${firstId}"] details`).first().getAttribute('open'),'');
  await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Add bet',exact:true}).first().click();await page.locator('#bet-form [name=selection]').fill('Mobile audit isolated ticket');await page.locator('#bet-form [name=stake]').fill('25');await page.locator('#bet-form [name=odds]').fill('125');await page.locator('#bet-form [name=tags]').fill('Mobile audit');await page.locator('#bet-form [name=notes]').fill('Disposable browser fixture only');
  await page.screenshot({path:`${out}/after-editor-${engine}-390.png`});
  await page.getByRole('button',{name:'Save bet',exact:true}).click();await page.locator('#bet-dialog').waitFor({state:'hidden'});
  const added=page.locator('.bet-ticket').filter({hasText:'Mobile audit isolated ticket'});assert.equal(await added.count(),1);
  await added.locator('summary').click();await added.locator('[data-edit]').click();await page.locator('#bet-form [name=notes]').fill('Edited on a phone');await page.getByRole('button',{name:'Save bet',exact:true}).click();await page.locator('#bet-dialog').waitFor({state:'hidden'});assert.match(await added.innerText(),/Edited on a phone/);
  await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Add bet',exact:true}).first().click();await page.locator('#bet-form [name=selection]').fill('Unsaved audit draft');await page.locator('#close-bet').click();await page.locator('#discard-dialog').waitFor({state:'visible'});await page.getByRole('button',{name:'Keep editing',exact:true}).click();assert.equal(await page.locator('#bet-form [name=selection]').inputValue(),'Unsaved audit draft');await page.locator('#close-bet').click();await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.locator('[data-calendar-day]').first().click();assert.match(await page.locator('#selected-bet-day').innerText(),/Tickets placed/);
  await page.getByRole('button',{name:'Graph',exact:true}).click();
  results.push({engine,journey:'120-ticket pagination/full-ledger search/filters/empty/expand/node reuse/add/edit/tag/discard/calendar',passed:true,interactions,initial,errors,final:await metric(page)});
  if(engine==='chromium'){
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});await page.reload();await page.locator('[data-ticket-id]').first().waitFor();const slow=await metric(page);slow.filterApplyMs=await page.evaluate(async()=>{const t=performance.now();const s=document.querySelector('#sport-filter');s.value='NBA';s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(requestAnimationFrame);return performance.now()-t;});results.push({engine,conditions:'4x CPU, 150ms latency, 1.6Mbps download lab emulation',...slow});
  }
  await context.close();
 }catch(e){results.push({engine,error:e.stack});}finally{await browser.close();}
}
await fs.writeFile(`${out}/tracker-verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.filter(r=>r.error||r.journey||r.conditions),null,2));if(results.some(r=>r.error))process.exitCode=1;







