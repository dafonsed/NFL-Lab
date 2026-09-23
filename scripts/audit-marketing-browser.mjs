// Local presentation audit. Start server.mjs with an isolated DATA_DIR first.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.MARKETING_URL || 'http://127.0.0.1:3201';
const out = 'reports/marketing';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || 'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe' });
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/nfl', '/nfl?view=metrics', '/mlb', '/nba', '/wnba', '/nhl', '/soccer', ...['nfl','mlb','nba','wnba','nhl','soccer'].map(s=>`/${s}?view=trends`), '/live', ...['nfl','mlb','nba','wnba'].map(s=>`/${s}/live`), '/simulation', ...['nfl','mlb','nba','wnba','nhl','soccer'].map(s=>`/${s}/simulation`), '/performance', '/paper', '/paper?sport=mlb', '/bets'];
const results = JSON.parse(await fs.readFile(`${out}/routes.json`, 'utf8').catch(()=>'[]'));
try {
  for (const route of routes) {
    const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const errors=[], httpErrors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))httpErrors.push({url:r.url(),status:r.status()});});
    const response=await page.goto(base+route);
    let settled=true;
    try {await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'),{timeout:45000});} catch {settled=false;}
    const slug=route.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
    const text=await page.locator('main').innerText();
    await fs.writeFile(`${out}/${slug}.txt`,text);
    const sizes=[];
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:`${out}/${slug}-${width}.png`});
      sizes.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})));
    }
    const previous = results.findIndex(r=>r.route===route); if(previous>=0) results.splice(previous,1);
    results.push({route,status:response.status(),title:await page.title(),settled,errors,httpErrors,sizes,controls:await page.locator('main a,main button,main select').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.innerText.trim().slice(0,120),href:e.getAttribute('href'),disabled:e.disabled||false}))),textFile:`${slug}.txt`,statusText:await page.locator('#connection-label,#connection,#td-status,#feed-status,#status,#sim-status').allTextContents()});
    await fs.writeFile(`${out}/routes.json`,JSON.stringify(results,null,2));
    console.log(JSON.stringify({route,httpStatus:response.status(),settled,errors:errors.length,httpErrors,sizes,sourceStatus:results.at(-1).statusText}));
    await page.close();
  }
} finally {await browser.close();}
