// UI regression checks use fresh browser storage and isolated, disposable tickets.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const base=process.env.FRONTEND_URL||'http://127.0.0.1:3127',dir='.research/product-polish/workflows',results=[];
await fs.mkdir(dir,{recursive:true});
async function check(name,fn){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{await fn(page);assert.deepEqual(errors,[]);results.push({name,pass:true});}
 catch(e){results.push({name,pass:false,error:e.message,errors});await page.screenshot({path:`${dir}/${name.replace(/\W+/g,'-')}.png`}).catch(()=>{});}
 finally{await context.close();}
 console.log(JSON.stringify(results.at(-1)));await fs.writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));
}
const open=async p=>{await p.goto(base+'/bets');await p.locator('#add-bet').click();};
async function manual(p){
 await p.locator('[name=selection]').fill('Isolated UI verification ticket');
 await p.locator('[name=stake]').fill('25');await p.locator('[name=odds]').fill('150');
 await p.locator('[name=settlement]').selectOption('manual');
 await p.locator('[data-field=mode]').selectOption('manual');
 await p.locator('[data-field=label]').fill('Isolated selection');await p.locator('[data-field=line]').fill('3.5');
}
async function saved(p){await p.locator('#bet-form [type=submit]').click();await p.waitForFunction(()=>!document.querySelector('#bet-dialog').open);}
try{
 await check('Ticket cancel unsaved confirmation Escape and focus return',async p=>{
  await open(p);await p.locator('#cancel-bet').click();assert.equal(await p.locator('#add-bet').evaluate(e=>e===document.activeElement),true);
  await p.locator('#add-bet').click();await p.locator('[name=selection]').fill('Unsaved draft');await p.keyboard.press('Escape');
  await p.locator('#discard-dialog[open]').waitFor();await p.locator('#keep-editing').click();assert.equal(await p.locator('[name=selection]').inputValue(),'Unsaved draft');
  await p.keyboard.press('Escape');await p.keyboard.press('Escape');assert.equal(await p.locator('#bet-dialog').evaluate(e=>e.open),true);
  await p.locator('#close-bet').click();await p.locator('#discard-bet').click();assert.equal(await p.locator('#bet-dialog').evaluate(e=>e.open),false);
  assert.equal(await p.locator('#add-bet').evaluate(e=>e===document.activeElement),true);
 });
 await check('Ticket footer reachable at five widths and reduced keyboard viewport',async p=>{
  await open(p);await manual(p);await p.locator('#add-leg').click();const second=p.locator('.leg-editor').nth(1);await second.locator('[data-field=mode]').selectOption('manual');await second.locator('[data-field=label]').fill('Second selection');await second.locator('[data-field=line]').fill('5.5');
  for(const[width,height]of[[1440,900],[1280,800],[768,1024],[390,844],[360,800],[390,460]]){
   await p.setViewportSize({width,height});await p.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--bet-viewport'))-innerHeight)<2);await p.locator('#return-preview').scrollIntoViewIfNeeded();
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const geometry=await p.evaluate(()=>{const d=document.querySelector('#bet-dialog'),body=document.querySelector('.bet-form-body'),foot=document.querySelector('.bet-form-actions'),last=document.querySelector('#return-preview'),head=document.querySelector('.bet-dialog-header');return{overflow:d.scrollWidth-d.clientWidth,dialog:d.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),footer:foot.getBoundingClientRect().toJSON(),last:last.getBoundingClientRect().toJSON(),header:head.getBoundingClientRect().toJSON(),height:innerHeight};});
   assert.ok(geometry.overflow<=1);assert.ok(geometry.last.bottom<=geometry.footer.top+1,'last content covered by footer');assert.ok(geometry.body.bottom<=geometry.footer.top+1);assert.ok(geometry.footer.bottom<=geometry.height,JSON.stringify({width,...geometry}));assert.ok(geometry.header.top>=0);
   await p.screenshot({path:`${dir}/bet-bottom-${width}-${height}.png`});
  }
  await p.setViewportSize({width:390,height:844});await p.locator('#cancel-bet').focus();
  for(let i=0;i<12;i++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('#bet-dialog').contains(document.activeElement)),true);}
 });
 await check('Ticket field errors preserve draft and reveal lower invalid field',async p=>{
  await open(p);await manual(p);await p.locator('[name=stake]').fill('');await p.locator('#bet-form [type=submit]').click();
  assert.equal(await p.locator('[name=stake]').getAttribute('aria-invalid'),'true');assert.equal(await p.locator('[name=stake]').evaluate(e=>e===document.activeElement),true);
  await p.locator('[name=stake]').fill('25');await p.locator('[data-field=side]').selectOption('at_least');await p.locator('[data-field=line]').fill('1.5');await p.locator('#bet-form [type=submit]').click();
  assert.equal(await p.locator('[data-field=line]').getAttribute('aria-invalid'),'true');assert.equal(await p.locator('[data-field=line]').evaluate(e=>e===document.activeElement),true);
  assert.equal(await p.locator('[name=selection]').inputValue(),'Isolated UI verification ticket');assert.equal(await p.locator('[name=stake]').inputValue(),'25');
  await p.screenshot({path:`dir/invalid.png`.replace('dir',dir)});
 });
 await check('Manual single decimal odds automatic leg settlement edit reload delete',async p=>{
  await open(p);await manual(p);await p.locator('[name=oddsFormat]').selectOption('decimal');await p.locator('[name=odds]').fill('2.5');
  await p.locator('[name=settlement]').selectOption('auto');assert.equal(await p.locator('#bet-status').isDisabled(),true);assert.match(await p.locator('#result-help').innerText(),/Determined from your leg results/);
  await p.locator('[data-field=override]').selectOption('won');assert.equal(await p.locator('#bet-status').inputValue(),'won');await saved(p);
  assert.equal(await p.locator('.bet-ticket').count(),1);await p.reload();await p.locator('[data-edit]').click();assert.equal(await p.locator('[name=odds]').inputValue(),'2.5');
  await p.locator('[name=settlement]').selectOption('manual');await p.locator('[name=status]').selectOption('cashed');await p.locator('[name=cashout]').fill('15');await p.locator('[name=notes]').fill('Isolated edit');await saved(p);
  await p.locator('[data-edit]').click();assert.equal(await p.locator('[name=notes]').inputValue(),'Isolated edit');assert.equal(await p.locator('[name=cashout]').inputValue(),'15');await p.locator('#delete-bet').click();await p.locator('#confirm-delete').click();assert.equal(await p.locator('.bet-ticket').count(),0);
 });
 await check('Storage failure keeps values and duplicate save creates one ticket',async p=>{
  await open(p);await manual(p);await p.evaluate(()=>{window.qaStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Isolated blocked storage');};});
  await p.locator('#bet-form [type=submit]').click();await p.locator('#form-error:not([hidden])').waitFor();assert.match(await p.locator('#form-error').innerText(),/could not be saved/);assert.equal(await p.locator('[name=stake]').inputValue(),'25');
  await p.evaluate(()=>{Storage.prototype.setItem=window.qaStorage;const form=document.querySelector('#bet-form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await p.waitForFunction(()=>!document.querySelector('#bet-dialog').open);assert.equal(await p.locator('.bet-ticket').count(),1);
 });
 await check('Unavailable game and empty player search explain next actions',async p=>{
  await p.route('**/api/bets/catalog?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({games:[],markets:{}})}));
  await open(p);await p.locator('[data-search-player]').fill('Nobody here');await p.getByText('No matching players on this date. Check the sport or game date.').waitFor();
  assert.match(await p.locator('#leg-editor').innerText(),/No published games/);await p.locator('[data-field=mode]').selectOption('manual');assert.equal(await p.locator('[data-field=label]').isVisible(),true);
 });
 await check('Pick a game tracking connects a real NBA player and preserves editing',async p=>{
  await open(p);await p.locator('[name=selection]').fill('Isolated game picker verification');
  await p.locator('[name=stake]').fill('10');await p.locator('[name=odds]').fill('-110');
  await p.locator('[data-field=mode]').selectOption('auto');await p.locator('[data-field=sport]').selectOption('NBA');
  await p.locator('[data-field=date]').fill('2026-04-10');await p.locator('[data-field=date]').blur();
  await p.waitForFunction(()=>document.querySelector('[data-field=gameId] option[value="401811026"]'));
  await p.locator('[data-field=gameId]').selectOption('401811026');await p.locator('[data-field=market]').selectOption('points');
  await p.waitForFunction(()=>document.querySelector('[data-field=subjectId] option[value="4432816"]'));
  await p.locator('[data-field=subjectId]').selectOption('4432816');await p.locator('[data-field=line]').fill('22.5');
  await saved(p);await p.locator('[data-edit]').click();assert.equal(await p.locator('[data-field=mode]').inputValue(),'auto');
  assert.equal(await p.locator('[data-field=gameId]').inputValue(),'401811026');assert.equal(await p.locator('[data-field=subjectId]').inputValue(),'4432816');
  await p.locator('#delete-bet').click();await p.locator('#confirm-delete').click();assert.equal(await p.locator('.bet-ticket').count(),0);
 });
 await check('Mobile research tools and icon actions remain named and reachable',async p=>{
  await p.setViewportSize({width:360,height:800});await p.goto(base+'/nba?date=2026-04-10&market=points');await p.locator('.player-research-inline').waitFor();await p.locator('.research-options > summary').click();
  assert.equal(await p.locator('.research-tools').evaluate(e=>e.open),false);
  await p.locator('.research-tools > summary').click();assert.equal(await p.locator('#model-button').isVisible(),true);
  await p.locator('#model-button').click();await p.locator('#research-dialog[open]').waitFor();await p.keyboard.press('Escape');
  for(const id of ['refresh','export'])assert.ok(await p.locator('#'+id).getAttribute('aria-label'));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
 });
 await check('MLB matchup search doubleheaders scores and return to board',async p=>{
  await p.goto(base+'/mlb?date=2026-09-22&market=hits&view=games');await p.locator('.mlb-game').first().waitFor();
  assert.match(await p.locator('#content').innerText(),/Game 1/);assert.match(await p.locator('#content').innerText(),/Game 2/);
  assert.equal(await p.locator('.game-score.accent').count(),0);await p.locator('#search').fill('nobody here');await p.getByRole('heading',{name:'No matching matchups'}).waitFor();await p.locator('#content [data-action=clear]').click();await p.locator('.mlb-game').first().waitFor();
  await p.locator('[data-view=board]').click();await p.locator('.player-research-inline').waitFor();await p.locator('.research-options > summary').click();assert.equal(await p.locator('#batter-markets').isVisible(),true);
 });
 await check('Live refresh fixture preserves selection draft focus and scroll and exposes failure',async p=>{
  // The real historical game is final. Use a browser-only active estimate to
  // exercise editable-line refresh behavior; never write it to application data.
  const snapshot=await (await p.request.get(base+'/api/nba/live?date=2026-04-10')).json();
  const f=snapshot.players[0].projections.points;f.status='experimental';f.remaining=1.5;f.projection=(f.current||0)+1.5;f.reasons=[];
  snapshot.stale=false;snapshot.gameDataStale=false;snapshot.sourceAgeMs=0;
  await p.route('**/api/nba/live?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...snapshot,fetchedAt:new Date().toISOString()})}));
  await p.goto(base+'/nba/live?panel=players&date=2026-04-10');await p.locator('.live-card').first().waitFor({timeout:60000});await p.locator('#auto').uncheck();
  const game=await p.locator('#game').inputValue(),input=p.locator('[data-line]:not(:disabled)').first();await input.fill('22.5');await input.focus();const id=await input.getAttribute('id'),y=await p.evaluate(()=>scrollY);
  await p.evaluate(()=>document.querySelector('#refresh').click());await p.waitForFunction(()=>!document.querySelector('#refresh').disabled);
  assert.equal(await p.locator('#game').inputValue(),game);assert.equal(await p.locator('#'+id).inputValue(),'22.5');assert.equal(await p.locator('#'+id).evaluate(e=>e===document.activeElement),true);assert.ok(Math.abs(await p.evaluate(()=>scrollY)-y)<3);
  await Promise.all([p.waitForResponse(r=>r.url().includes('/api/nba/live?')),p.locator('#auto').check()]);await p.waitForFunction(()=>!document.querySelector('#refresh').disabled);await input.focus();const autoY=await p.evaluate(()=>scrollY);await p.waitForResponse(r=>r.url().includes('/api/nba/live?'),{timeout:22000});await p.waitForFunction(()=>!document.querySelector('#refresh').disabled);assert.equal(await p.locator('#'+id).inputValue(),'22.5');assert.equal(await p.locator('#'+id).evaluate(e=>e===document.activeElement),true);assert.ok(Math.abs(await p.evaluate(()=>scrollY)-autoY)<3);await p.locator('#auto').uncheck();
  await p.unroute('**/api/nba/live?*');await p.route('**/api/nba/live?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test feed unavailable'})}));await p.evaluate(()=>document.querySelector('#refresh').click());await p.waitForFunction(()=>!document.querySelector('#refresh').disabled);
  assert.match(await p.locator('#feed-status').innerText(),/DATA STALE/);assert.equal(await p.locator('#'+id).inputValue(),'22.5');assert.ok(await p.locator('.live-card').count()>0);assert.equal(await p.locator('.live-card [data-quote] button').first().isDisabled(),true);
 });
 await check('MLB provider transition and extra innings withheld fixture',async p=>{
  const snapshot=await (await p.request.get(base+'/api/mlb/live?date=2026-09-22')).json();
  snapshot.game={...snapshot.game,state:'in',inning:12,half:'Bottom',outs:1,balls:2,strikes:3};snapshot.stale=false;snapshot.gameDataStale=false;snapshot.sourceAgeMs=0;
  snapshot.gameModel={status:'withheld',reasons:['Extra innings are not modeled.']};
  for(const player of snapshot.players)for(const projection of Object.values(player.projections))Object.assign(projection,{status:'withheld',remaining:null,projection:null,reasons:['Extra innings are not modeled.']});
  await p.route('**/api/mlb/live?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...snapshot,fetchedAt:new Date().toISOString()})}));
  await p.goto(base+'/mlb/live?panel=players&date=2026-09-22');await p.locator('.live-card').first().waitFor();await p.locator('#auto').uncheck();
  assert.match(await p.locator('#scoreboard').innerText(),/1 out · Balls 2 · Strikes 3 · Provider transition state/);
  assert.match(await p.locator('.live-withheld-reason').first().innerText(),/Extra innings/);assert.equal(await p.locator('[data-line]').first().isDisabled(),true);
  await p.locator('.live-card').first().scrollIntoViewIfNeeded();await p.screenshot({path:`${dir}/withheld-fixture.png`});
 });
}finally{await browser.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
