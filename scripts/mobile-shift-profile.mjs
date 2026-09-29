import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{
 const base=process.env.AUDIT_URL||'http://127.0.0.1:3202';
 if(new URL(base).hostname!=='127.0.0.1')throw Error('Local test fixture only.');
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:join(tmpdir(),`sportslab-mobile-audit-session-${new URL(base).port}.json`)});
 await context.addInitScript(()=>{window.shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.shifts.push({t:e.startTime,v:e.value,sources:e.sources.map(s=>({tag:s.node?.tagName,id:s.node?.id,cls:s.node?.className,previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()}))});}).observe({type:'layout-shift',buffered:true});});
 const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
 await page.goto(base+'/ev#ev-pre',{waitUntil:'load'});await page.locator('.wager-card,.ev-reference-mount').first().waitFor();await page.waitForTimeout(1000);const shifts=await page.evaluate(()=>window.shifts);await fs.writeFile(`reports/mobile/performance/shift-sources-${process.env.AUDIT_PHASE||'before'}.json`,JSON.stringify(shifts,null,2));console.log(JSON.stringify(shifts,null,2));
}finally{await browser.close();}
