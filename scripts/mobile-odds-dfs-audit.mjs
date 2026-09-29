import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {renderSitePage} from '../lib/site-layout.mjs';
import {renderProductDashboard} from '../lib/product-dashboards.mjs';
const require = createRequire(import.meta.url);
const {chromium,webkit} = require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phase = process.argv[2] || 'after';
const engine = process.argv[3] || 'chromium';
const base = process.env.MOBILE_AUDIT_URL || 'http://127.0.0.1:3201';
const out = `artifacts/mobile-audit/${phase}/${engine}`;
await fs.mkdir(out,{recursive:true});
const browser = engine === 'webkit' ? await webkit.launch({headless:true}) : await chromium.launch({headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const routes = [['odds','/ev?sport=nba#odds','.os-screen'],['dfs','/ev?sport=nba#fantasy','.dfs-workspace'],['smart-money','/ev?sport=all#sharp','.sharp-workspace'],['ev-overview','/ev/dashboard','.pd-main'],['trends-overview','/trends','.pd-main'],['models-overview','/models','.pd-main']];
const results=[];
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce',...(!phase.startsWith('fixture') && !phase.startsWith('before') ? {storageState:path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json')} : {})});
try {
 for(const [name,route,ready] of routes) {
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(phase.startsWith('fixture')) await page.route('http://127.0.0.1:3199'+route.split('#')[0],async request=>{
    const url=new URL(request.request().url());
    const source=url.pathname==='/ev'?await fs.readFile('public/ev.html','utf8'):renderProductDashboard(url);
    await request.fulfill({contentType:'text/html',body:renderSitePage(source,url)});
  });
  await page.addInitScript(()=>{window.__audit={lcp:0,cls:0};try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__audit.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__audit.cls+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}});
  await page.goto(base+route,{waitUntil:'networkidle'});
  await page.locator(ready).first().waitFor({timeout:15000}).catch(()=>{});
  const initial=await page.evaluate(()=>({...window.__audit,dom:document.getElementsByTagName('*').length,requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,e)=>n+e.encodedBodySize,0),load:performance.getEntriesByType('navigation')[0]?.loadEventEnd}));
  const sizes=[];
  for(const [width,height] of [[320,740],[360,800],[375,812],[390,844],[430,932],[768,1024],[667,375],[1440,1000]]){
   await page.setViewportSize({width,height});
   await page.screenshot({path:`${out}/${name}-${width}x${height}.png`});
   sizes.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,selectionWidths:[...document.querySelectorAll('.dfs-selection')].slice(0,2).map(e=>e.clientWidth)})));
  }
  await page.setViewportSize({width:390,height:844});
  if(name==='odds' && await page.locator('.os-comparison-toggle').count()){
   await page.locator('.os-comparison-toggle').first().click();
   await page.locator('.os-table-wrap').first().screenshot({path:`${out}/odds-comparison-390.png`});
   await page.locator('[data-os-action="settings"]').first().click();
   await page.screenshot({path:`${out}/odds-settings-390.png`});
  }
  if(name==='dfs' && await page.locator('[data-dfs-expand]').count()){
   const first=page.locator('[data-dfs-expand]').first();if(await first.getAttribute('aria-expanded')==='false')await first.click();
   await page.locator('.dfs-prop').first().screenshot({path:`${out}/dfs-comparison-390.png`});
  }
  const journeys={};
  if(name==='odds' && await page.locator('#os-search').count()){
    await page.getByRole('button',{name:'Close odds settings',exact:true}).click();
    const start=performance.now();await page.locator('#os-search').fill('NoMatchingTeamForAudit');
    await page.getByRole('heading',{name:'No matching prices'}).waitFor();journeys.searchMs=performance.now()-start;
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    await page.locator('.os-comparison-toggle').first().click();
    journeys.stickyOutcome=await page.locator('.os-table-wrap').first().evaluate(el=>{el.scrollLeft=500;return {scrollLeft:el.scrollLeft,regionLeft:el.getBoundingClientRect().left,labelLeft:el.querySelector('tbody th').getBoundingClientRect().left};});
    await page.locator('.os-table-wrap').first().screenshot({path:`${out}/odds-scrolled-390.png`});
  }
  if(name==='dfs' && await page.locator('[data-dfs-pick]').count()){
    const pick=page.locator('[data-dfs-pick]').first();await pick.evaluate(el=>el.scrollIntoView({block:'center'}));
    const start=performance.now();const oldY=await page.evaluate(()=>scrollY);await pick.uncheck();
    journeys.removePickMs=performance.now()-start;journeys.scrollDelta=await page.evaluate(y=>scrollY-y,oldY);
    journeys.dockAfterRemove=await page.locator('.dfs-slip-dock').innerText();
    const browseY=await page.evaluate(()=>scrollY);await page.locator('[data-dfs-review]').click();
    journeys.slipVisible=await page.locator('.dfs-slip-panel').isVisible();
    await page.screenshot({path:`${out}/dfs-slip-390.png`});
    await page.locator('[data-dfs-return]').click();
    journeys.restoredScroll=await page.evaluate(y=>Math.abs(scrollY-y)<3,browseY);
    await page.locator('#dfs-search').fill('NoMatchingPlayerForAudit');
    journeys.empty=await page.getByRole('heading',{name:'No matching props'}).isVisible();
    await page.locator('[data-dfs-reset]').click();
  }
  const measures=await page.evaluate(()=>({ ...window.__audit,dom:document.getElementsByTagName('*').length,requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,e)=>n+e.encodedBodySize,0),load:performance.getEntriesByType('navigation')[0]?.loadEventEnd}));
  results.push({name,route,errors,sizes,initial,measures,journeys});console.log(JSON.stringify(results.at(-1)));
  await page.close();
 }
}finally{await fs.writeFile(`${out}/odds-dfs-measurements.json`,JSON.stringify(results,null,2));await browser.close();}
