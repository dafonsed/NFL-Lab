// Repeatable local lab audit. Screenshots and metrics are evidence, not field Core Web Vitals.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phase=process.env.AUDIT_PHASE||'before',engine=process.env.AUDIT_ENGINE||'chromium';
const base=process.env.AUDIT_URL||'http://127.0.0.1:3199';
const widths=(process.env.AUDIT_WIDTHS||'320,360,375,390,430,768,667,1440').split(',').map(Number);
const routes=process.argv.slice(2).length?process.argv.slice(2):['/','/research','/models','/trends','/ev/dashboard','/nfl','/mlb','/nba','/wnba','/nhl','/soccer',...['nfl','mlb','nba','wnba','nhl','soccer'].map(s=>`/${s}?view=trends`),'/live',...['nfl','mlb','nba','wnba'].map(s=>`/${s}/live`),'/simulation',...['nfl','mlb','nba','wnba','nhl','soccer'].map(s=>`/${s}/simulation`),'/performance','/paper','/paper?sport=mlb','/docs','/betting-calculators','/betting-tools','/betting-education','/online-sports-betting','/online-sportsbooks','/odds-api'];
const output=`reports/mobile/${phase}/${engine}`;await fs.mkdir(output,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}:{})});
const results=[];
try{
 for(const route of routes){
  if(process.env.AUDIT_AUTH==='fixture'&&new URL(base).hostname!=='127.0.0.1')throw Error('Fixture login is restricted to localhost.');
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',deviceScaleFactor:1,hasTouch:true,isMobile:true,...(process.env.AUDIT_AUTH==='fixture'?{storageState:join(tmpdir(),`sportslab-mobile-audit-session-${new URL(base).port}.json`)}:{})});
  if(process.env.AUDIT_SESSION_FIXTURE==='1'){
   await context.route('**/api/auth/get-session',route=>route.fulfill({json:null}));
   for(const asset of ['account-sync.js','account-client.js','ev-bet-card.js','ev-bet-cards.css'])await context.route(`**/${asset}`,async route=>route.fulfill({status:200,contentType:asset.endsWith('.js')?'text/javascript':'text/css',body:await fs.readFile(`public/${asset}`,'utf8')}));
  }
  await context.addInitScript(()=>{window.__mobileAudit={lcp:0,cls:0,events:[]};for(const type of ['largest-contentful-paint','layout-shift','event'])try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')window.__mobileAudit.lcp=e.startTime;if(type==='layout-shift'&&!e.hadRecentInput)window.__mobileAudit.cls+=e.value;if(type==='event')window.__mobileAudit.events.push({name:e.name,duration:e.duration});}}).observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});}catch{}});
  const page=await context.newPage(),errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failures.push({url:r.url().replace(base,''),status:r.status()});});
  let status=null,navigationError=null;try{status=(await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000}))?.status();await page.waitForTimeout(Number(process.env.AUDIT_SETTLE_MS||1800));}catch(e){navigationError=e.message;}
  const slug=route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
  const metrics=await page.evaluate(()=>({observer:window.__mobileAudit,nav:performance.getEntriesByType('navigation').map(e=>({domContentLoaded:e.domContentLoadedEventEnd,load:e.loadEventEnd,transfer:e.transferSize})),resources:performance.getEntriesByType('resource').map(e=>({url:e.name,bytes:e.transferSize,duration:e.duration})),nodes:document.querySelectorAll('*').length,heap:performance.memory?.usedJSHeapSize}));
  const sizes=[];
  for(const width of widths){await page.setViewportSize({width,height:width===667?375:width===844?390:width===1440?1000:844});await page.screenshot({path:`${output}/${slug}-${width}.png`,timeout:15000});sizes.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('[hidden],[inert],.table-wrap,.table-scroll,.research-table-wrap,.td-table-wrap,.workspace-table-wrap');}).slice(0,12).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'svg',right:Math.round(e.getBoundingClientRect().right)}))})));}
  const result={route,status,title:await page.title(),navigationError,errors,failures,sizes,metrics,text:(await page.locator('body').innerText()).slice(0,5000)};results.push(result);await fs.writeFile(`${output}/${slug}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({route,status,errors,failed:failures.length,overflow:sizes.filter(s=>s.scrollWidth>s.width+1).map(s=>[s.width,s.scrollWidth]),lcp:Math.round(metrics.observer?.lcp||0),nodes:metrics.nodes}));await context.close();
 }
}finally{await fs.writeFile(`${output}/audit.json`,JSON.stringify(results,null,2));await browser.close();}
