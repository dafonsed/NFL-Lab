import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const base=process.env.MARKETING_URL||'http://127.0.0.1:3201',out='reports/marketing',selected=process.argv.slice(2);
const results=selected.length?JSON.parse(await fs.readFile(`${out}/flows.json`,'utf8')):[];
const loaded=page=>page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'),{timeout:30000});
async function check(name,route,fn){
 if(selected.length&&!selected.includes(name))return;
 const prior=results.findIndex(r=>r.name===name);if(prior>=0)results.splice(prior,1);
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+route);await loaded(page);const details=await fn(page);
  await fs.writeFile(`${out}/${name}.txt`,await page.locator('body').innerText());
  const widths=[];for(const width of [1440,390]){await page.setViewportSize({width,height:1000});
   if(name==='landing-to-player')await page.getByRole('heading',{name:/model chance of a player TD/}).scrollIntoViewIfNeeded();
   if(name==='nfl-drought-methodology')await page.getByRole('heading',{name:'Drought & opportunity gaps'}).scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/${name}-${width}.png`});widths.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogOverflow:[...document.querySelectorAll('dialog[open]')].map(d=>({client:d.clientWidth,scroll:d.scrollWidth}))})));}
  results.push({name,route,status:'PASS',details,errors,widths});
 }catch(e){results.push({name,route,status:'NOT VERIFIED',error:e.message,errors});await page.screenshot({path:`${out}/${name}-incomplete.png`});}
 finally{await page.close();await fs.writeFile(`${out}/flows.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));}
}
try{
 await check('landing-to-player','/',async p=>{
  await p.getByRole('link',{name:/Explore NFL research/}).click();await loaded(p);
  assert.match(await p.locator('#due-filter').innerText(),/Gap signals/);
  await p.locator('[data-expand]').first().click();await p.locator('dialog[open]').waitFor();await loaded(p);
  const text=await p.locator('dialog[open]').innerText();assert.match(text,/special-teams TDs/);assert.match(text,/Production accuracy is unverified/);
  return {player:await p.locator('dialog[open] h2').first().innerText(),tdScope:'Rushing, receiving and special-teams; passing TDs separate'};
 });
 await check('nfl-drought-methodology','/nfl?view=metrics',async p=>{
  const card=p.locator('.method-card').filter({has:p.getByRole('heading',{name:'Drought & opportunity gaps'})});
  assert.match(await card.innerText(),/adds no score bonus/);assert.ok(!/\+8 points|\+5/.test(await p.locator('main').innerText()));await card.scrollIntoViewIfNeeded();return await card.innerText();
 });
 await check('nfl-player-controls','/nfl?view=board&market=rec',async p=>{
  const first=p.locator('[data-expand]').first(),name=(await first.innerText()).split('\n').find(Boolean);await first.click();await loaded(p);
  await p.locator('[data-pr-action="window"][data-value="5"]').click();await p.locator('[data-pr-venue]').selectOption('home');
  await p.locator('[data-pr-action="save"]').click();assert.equal(await p.locator('[data-pr-action="save"]').getAttribute('aria-pressed'),'true');
  await p.locator('[data-pr-note]').fill('Local audit note');await p.locator('[data-pr-action="market"][data-value="rec_yds"]').click();await loaded(p);
  assert.match(await p.locator('dialog[open]').innerText(),/Receiving yards/);return {name,actions:'History window, venue, save, note, market switch'};
 });
 await check('mlb-methodology','/mlb?date=2026-09-22',async p=>{
  await p.locator('#about-button').click();const d=p.locator('#mlb-dialog');assert.match(await d.innerText(),/Opponent and weather corrections apply/);assert.ok(!(await d.innerText()).includes('does not yet model opponent'));await d.getByRole('heading',{name:'Predictive model & original form rating'}).scrollIntoViewIfNeeded();return 'Applied adjustments, production limitation and no ballpark factor disclosed';
 });
 await check('mlb-model-evidence','/mlb?date=2026-09-22',async p=>{
  await p.locator('[data-action="model"]').first().click();await p.getByRole('heading',{name:'A prediction you can inspect.'}).waitFor();assert.match(await p.locator('#mlb-dialog').innerText(),/not a fresh untouched test/);return 'Base-model and context historical results render; reused 2025 period disclosed';
 });
 await check('mlb-player','/mlb?date=2026-09-22',async p=>{
  await p.locator('button[data-detail]').first().click();await p.locator('dialog.pr-dialog[open],dialog[open] .pr-hero').first().waitFor();await loaded(p);return {player:await p.locator('dialog[open] h2').first().innerText(),detailLoaded:true};
 });
 for(const [sport,date] of [['nba','2026-04-10'],['wnba','2026-09-22'],['nhl','2026-04-09'],['soccer','2026-09-19']]){
  await check(`${sport}-player` ,`/${sport}?date=${date}`,async p=>{await p.locator('button[data-player]').first().click();await p.locator('dialog[open]').waitFor();await loaded(p);return {player:await p.locator('dialog[open] h2').first().innerText()};});
 }
 await check('wnba-ranking-controls','/wnba?date=2026-09-22',async p=>{
  await p.locator('#rankings-tab').click();await p.locator('#rank-by').selectOption('projection');assert.match(await p.locator('#board-caption').innerText(),/Highest projected/);await p.locator('#rank-by').selectOption('under');assert.match(await p.locator('#board-caption').innerText(),/not betting value/);return await p.locator('#board-caption').innerText();
 });
 await check('mobile-navigation','/nfl',async p=>{
  await p.setViewportSize({width:390,height:1000});await p.getByRole('button',{name:'More navigation'}).click();await p.locator('.workspace-sheet[open]').waitFor();const targets=await p.locator('.workspace-sheet[open] a').evaluateAll(es=>es.map(e=>({name:e.innerText,href:e.getAttribute('href')})));assert.ok(targets.some(x=>x.href==='/performance'));return targets;
 });
 await check('mlb-unavailable-retry','/mlb?date=2026-09-23',async p=>{
  assert.match(await p.locator('#content').innerText(),/unavailable/);await p.getByRole('button',{name:'Try again',exact:true}).click();await loaded(p);assert.match(await p.locator('#content').innerText(),/unavailable/);return 'Real failed retrieval retains an explicit unavailable state after retry; no invented player forecasts';
 });
 await check('live-paused','/nfl/live',async p=>{
  assert.match(await p.locator('#feed-status').innerText(),/PAUSED|STALE/);assert.match(await p.locator('.live-disclosure').innerText(),/separate game simulation/);await p.locator('#auto').uncheck();await p.locator('#refresh').click();await loaded(p);return await p.locator('#feed-status').innerText();
 });
 await check('nfl-simulation-controls','/nfl/simulation',async p=>{
  await p.locator('#sim-run').waitFor();await p.waitForFunction(()=>!document.querySelector('#sim-run').disabled,{timeout:10000});await p.locator('#sim-run').click();await loaded(p);
  const text=await p.locator('#sim-results').innerText();assert.match(text,/Model assumptions/);assert.match(text,/not draws from the game-score simulation/);return {status:await p.locator('#sim-status').innerText(),simulationSeparate:true};
 });
}finally{await browser.close();}
