// Reproducible browser lab. --fixture serves existing workspace assets and a
// logged-out session while the independently developed account server is absent.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {renderSitePage} from '../lib/site-layout.mjs';
const require = createRequire(import.meta.url);
const {chromium,webkit} = require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.MOBILE_URL || 'http://127.0.0.1:3199';
const phase = process.argv.includes('--before') ? 'before' : 'after';
const fixture = process.argv.includes('--fixture');
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const quick = process.argv.includes('--quick');
const selectedTool = process.argv.find(value=>value.startsWith('--tool='))?.slice(7);
const out = `reports/mobile-ev/${phase}-${engine}${fixture?'-fixture':''}`;
await fs.mkdir(out,{recursive:true});
const browser = await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',...(base.endsWith(':3201') ? {storageState:path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json')} : {})});
if (fixture || phase==='before') await context.route('**/*',async route=>{
  const url = new URL(route.request().url());
  if(url.origin!==base)return route.continue();
  if(fixture && url.pathname==='/ev') {
    const body=renderSitePage(await fs.readFile('public/ev.html','utf8'),url);
    return route.fulfill({status:200,contentType:'text/html',body:body.replace('</head>','<link rel="stylesheet" href="/ev-bet-cards.css?v=fixture"></head>')});
  }
  if(fixture && url.pathname==='/api/auth/get-session')return route.fulfill({status:200,contentType:'application/json',body:'null'});
  if((fixture || ['/ev-mobile.js','/arb-calculator.css'].includes(url.pathname)) && /^\/[\w-]+\.(js|css)$/.test(url.pathname)) {
    try {
      let body=await fs.readFile(path.join('public',url.pathname.slice(1)),'utf8');
      if(phase==='before'&&url.pathname==='/ev-mobile.js')body=body.replace('export function installMobileWorkspace()', 'function disabledMobileWorkspace()')+'\nexport function installMobileWorkspace(){}';
      if(phase==='before'&&url.pathname==='/arb-calculator.css')body=body.split('/* Keep both sides readable')[0];
      return route.fulfill({status:200,contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css',body});
    } catch { /* Missing files remain actual errors. */ }
  }
  return route.continue();
});
await context.addInitScript(()=>{
  window.__lab={lcp:0,cls:0,longTasks:[],events:[]};
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__lab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.events.push(e.duration);}).observe({type:'event',buffered:true,durationThreshold:16});}catch{}
});
const results=selectedTool ? JSON.parse(await fs.readFile(`${out}/measurements.json`,'utf8').catch(()=>'[]')).filter(item=>item.tool!==selectedTool) : [];
try {
  for(const tool of selectedTool?[selectedTool]:quick?['ev-pre','arb-pre','parlay']:['ev-pre','ev-live','arb-pre','arb-live','middles','parlay','holds','promo','optimizer','slip','fantasy-alerts','prediction','trends','line-alerts']){
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const start=performance.now();
    await page.goto(`${base}/ev?sport=all#${tool}`);
    await page.waitForFunction(()=>document.querySelector('#ev-view')?.textContent.trim().length>0,{timeout:15000}).catch(()=>{});
    const usefulMs=performance.now()-start;
    await page.waitForTimeout(150);
    const sizes=[];
    for(const [width,height] of (quick?[[320,740],[390,844],[768,1024]]:[[320,740],[360,800],[375,812],[390,844],[430,932],[768,1024],[667,375],[1440,1000]])){
      await page.setViewportSize({width,height});
      await page.screenshot({path:`${out}/${tool}-${width}.png`});
      sizes.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,firstCardY:document.querySelector('.wager-card,.ev-reference-card')?.getBoundingClientRect().top,cardCount:document.querySelectorAll('.wager-card,.ev-reference-card').length,smallTargets:[...document.querySelectorAll('#ev-view button,#ev-view summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.height<24||r.width<24);}).length})));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#ev-view').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${tool}-content-390.png`});
    const lab=await page.evaluate(()=>({...window.__lab,requests:performance.getEntriesByType('resource').length,transferBytes:performance.getEntriesByType('resource').reduce((sum,x)=>sum+x.transferSize,0),jsBytes:performance.getEntriesByType('resource').filter(x=>x.name.includes('.js')).reduce((sum,x)=>sum+x.decodedBodySize,0),domNodes:document.querySelectorAll('*').length,heap:performance.memory?.usedJSHeapSize||null}));
    results.push({tool,phase,engine,fixture,usefulMs,errors,sizes,lab});
    console.log(JSON.stringify({tool,usefulMs:Math.round(usefulMs),errors,overflows:sizes.filter(x=>x.documentWidth>x.width+1)}));
    await fs.writeFile(`${out}/measurements.json`,JSON.stringify(results,null,2));
    await page.close();
  }
}finally{await browser.close();}
