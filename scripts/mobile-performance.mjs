import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.AUDIT_URL||'http://127.0.0.1:3201',phase=process.env.AUDIT_PHASE||'before-compression';
if(new URL(base).hostname!=='127.0.0.1')throw Error('Use only the isolated local account fixture.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const results=[];await fs.mkdir('reports/mobile/performance',{recursive:true});
try{
 for(const throttle of [false,true])for(const route of (process.env.AUDIT_ROUTES||'/nfl,/ev#ev-pre,/ev#odds').split(',')){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',storageState:join(tmpdir(),`sportslab-mobile-audit-session-${new URL(base).port}.json`)});
  await context.addInitScript(()=>{
   window.__perf={lcp:0,shifts:[],events:[],useful:0};
   for(const type of ['largest-contentful-paint','layout-shift','event'])new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')window.__perf.lcp=e.startTime;if(type==='layout-shift'&&!e.hadRecentInput)window.__perf.shifts.push({t:e.startTime,v:e.value});if(type==='event'&&e.interactionId)window.__perf.events.push({name:e.name,duration:e.duration,interactionId:e.interactionId});}}).observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});
   const scan=()=>{if(!window.__perf.useful&&document.querySelector('.research-row,.wager-card,.ev-reference-mount,.os-match-card,.os-board .os-grid,.os-price-cell')){window.__perf.useful=performance.now();observer.disconnect();}};
   const observer=new MutationObserver(scan);observer.observe(document,{childList:true,subtree:true});
  });
  const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[],failures=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url().replace(base,''),status:r.status()});});
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  if(process.env.AUDIT_ENCODING==='identity')await cdp.send('Network.setExtraHTTPHeaders',{headers:{'Accept-Encoding':'identity'}});
  if(throttle){await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});}
  await page.goto(base+route,{waitUntil:'load',timeout:90000});
  await page.waitForFunction(()=>window.__perf?.useful>0,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(500);
  const before=await page.evaluate(()=>({perf:window.__perf,nav:performance.getEntriesByType('navigation')[0].toJSON(),resources:performance.getEntriesByType('resource').map(r=>({name:r.name.replace(location.origin,''),transferSize:r.transferSize,decodedBodySize:r.decodedBodySize,duration:r.duration})),nodes:document.querySelectorAll('*').length}));
  const interaction={};
  async function time(name,action){const start=performance.now();try{await action();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));interaction[name]=Math.round(performance.now()-start);}catch(e){interaction[name]={error:e.message.slice(0,180)};}}
  await time('openNavigation',async()=>{await page.locator('[data-sidebar-toggle]').click();await page.locator('#dashboard-sidebar[aria-modal=true]').waitFor();});
  await page.locator('[data-sidebar-close]').click();
  if(route.startsWith('/ev#ev-pre')){
   await time('openFilters',async()=>{await page.locator('[data-mobile-filters]').click();await page.locator('.ev-mobile-filter-dialog[open]').waitFor();});
   await time('applySportFilter',async()=>{await page.locator('.ev-mobile-filter-dialog [data-control=ev-reference-sport] .td-choice-trigger').click();await page.locator('.td-choice-menu:popover-open [role=option]').filter({hasText:/^NFL$/}).click();});
   if(await page.locator('[data-mobile-done]').isVisible())await page.locator('[data-mobile-done]').click();
  }
  const after=await page.evaluate(()=>({events:window.__perf.events,shifts:window.__perf.shifts}));
  const heap=await cdp.send('Runtime.getHeapUsage');
  const result={route,throttle:throttle?{cpu:4,latencyMs:150,downloadBytesPerSecond:200000,uploadBytesPerSecond:93750}:'normal',phase,errors,failures,before,interaction,after,heap,...(!before.perf.useful?{body:(await page.locator('body').innerText()).slice(0,2000)}:{})};results.push(result);await fs.writeFile(`reports/mobile/performance/${phase}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({route,throttled:throttle,lcp:before.perf.lcp,useful:before.perf.useful,bytes:before.resources.reduce((s,r)=>s+r.transferSize,0),requests:before.resources.length,interaction,errors,failures,...(!before.perf.useful?{body:result.body}:{})}));await context.close();
 }
}finally{await browser.close();}
