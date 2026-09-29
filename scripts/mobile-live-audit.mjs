// Synthetic response tests only. Real authenticated pages/assets; no upstream data claim.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {projectLiveProp,LIVE_MARKETS} from '../lib/live-nfl-model.mjs';
import {projectBasketball,basketballPriors,basketballWorkloads,liveMarkets} from '../lib/live-sports-model.mjs';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const engine=process.argv[2]||'chromium', base='http://127.0.0.1:3201';
const out=`artifacts/mobile-audit/live-synthetic/${engine}`;await fs.mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
const context=await browser.newContext({storageState:path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json'),viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const baseTime=Date.now(), results=[];
// Model inputs adapted from test/live-nfl.test.mjs and test/live-sports.test.mjs.
function fixture(sport,mode,now){
 const game={id:'401000001',sport,date:new Date(baseTime-3600000).toISOString(),season:2026,state:'in',status:mode==='suspended'?'Game suspended':'Synthetic in-progress fixture',interrupted:mode==='suspended',period:3,clock:'12:00',remainingSeconds:sport==='nfl'?1800:1440,possession:'1',teams:[{id:'1',name:'Synthetic Home',abbreviation:sport==='nfl'?'ATL':'HOM',homeAway:'home',score:24},{id:'2',name:'Synthetic Away',abbreviation:sport==='nfl'?'CAR':'AWY',homeAway:'away',score:20}]};
 const players=Array.from({length:8},(_,i)=>({id:String(100+i),name:`Synthetic Player ${String.fromCharCode(65+i)}`,teamId:'1',team:game.teams[0].abbreviation,position:'Player',minutes:15,stats:sport==='nfl'?{targets:5,receptions:4,receiving_yards:48-i*3,carries:2,rushing_yards:8,attempts:0,completions:0,passing_yards:0}:{minutes:15,points:20-i,rebounds:4,assists:3,threePointFieldGoalsMade:2,steals:1,blocks:0,turnovers:1,fieldGoalsMade:4,fieldGoalsAttempted:9,freeThrowsMade:2}}));
 const market=sport==='nfl'?'rec_yds':'points';
 const nflPrior={count:5,efficiencyCount:10,position:'WR',teamPlays:64,passShare:.65,sackRate:.06,targetRate:.95,shares:{target:.2,rush:.1,pass:1},efficiency:{rec_yds:8,rec:.65,rush_yds:4,rush_attempts:1,pass_yds:7,pass_attempts:1,pass_completions:.65},sample:[]};
 const past=Array.from({length:8},(_,i)=>({game:{id:'past'+i,date:new Date(baseTime-(i+2)*86400000).toISOString(),complete:true},players:players.map(p=>({...p,minutes:30,stats:{...p.stats,minutes:30,points:20}}))}));
 const priors=sport==='nfl'?null:basketballPriors(past,game,players);
 const workloads=sport==='nfl'?null:basketballWorkloads(players,priors,game,sport);
 for(const player of players){
  player.prior=sport==='nfl'?nflPrior:priors.get(player.id);
  const forecast=sport==='nfl'?projectLiveProp({game,player,team:{id:'1',plays:32,attempts:20,carries:10,sacks:2,targets:20},prior:nflPrior,market}):projectBasketball({sport,game,player,prior:player.prior,workload:workloads.get(player.id),market,stale:false});
  if(mode==='changed'&&player.id==='107'){forecast.projection=200;forecast.remaining=200-forecast.current;}
  player.projections={[market]:forecast};
 }
 return {sport,selected:game.id,events:[game],game,players,markets:{[market]:(sport==='nfl'?LIVE_MARKETS:liveMarkets(sport))[market]},fetchedAt:new Date(now).toISOString(),sourceAgeMs:mode==='aged'?46000:0,stale:mode==='stale',snapshot:mode==='changed'?'changed':'same',warnings:['Synthetic browser verification data; not real players or live odds.'],sources:[],historySources:[],odds:{status:'unavailable',books:[],fetchedAt:new Date(now).toISOString()}};
}
try{
 for(const sport of ['nfl','nba']){
  const page=await context.newPage();let mode='current',calls=0,virtualTime=baseTime;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(baseTime)});
  await page.route(`**/api/${sport}/live?*`,async route=>{calls++;await route.fulfill(mode==='unavailable'?{status:503,contentType:'application/json',body:'{"error":"Synthetic outage"}'}:{contentType:'application/json',body:JSON.stringify(fixture(sport,mode,virtualTime))});});
  await page.goto(`${base}/${sport}/live?panel=players`,{waitUntil:'networkidle'});
  await page.locator('[data-live-player]').first().waitFor();
  const waitDone=()=>page.waitForFunction(()=>document.querySelector('#players').getAttribute('aria-busy')==='false');await waitDone();
  if(!await page.locator('#auto').isChecked()){await page.locator('#auto').check();await waitDone();}
  const automatic=async()=>{const prior=calls;virtualTime+=15000;await page.clock.fastForward(15000);await page.waitForFunction(()=>document.querySelector('#players').getAttribute('aria-busy')==='false');await page.waitForTimeout(50);assert.ok(calls>prior,'automatic poll ran');};
  const manual=async()=>{const response=page.waitForResponse(r=>r.url().includes(`/api/${sport}/live?`));await page.locator('#refresh').click();await response;await waitDone();};
  const input=page.locator('[data-line="102"]');await input.fill('42.5');await page.locator('[data-quote="102"] button').click();assert.match(await page.locator('[data-comparison="102"]').getAttribute('class'),/current/);await input.evaluate(el=>el.scrollIntoView({block:'center'}));await input.focus();
  const before=await page.evaluate(()=>{window.__auditCard=document.querySelector('[data-live-player="102"]');return{order:[...document.querySelectorAll('[data-live-player]')].map(x=>x.dataset.livePlayer),scroll:scrollY,focus:document.activeElement.id};});
  await automatic();
  const unchanged=await page.evaluate(()=>({sameNode:window.__auditCard===document.querySelector('[data-live-player="102"]'),focus:document.activeElement.id,scroll:scrollY,draft:document.querySelector('[data-line="102"]').value}));
  assert.equal(unchanged.sameNode,true);assert.equal(unchanged.focus,before.focus);assert.equal(unchanged.draft,'42.5');assert.ok(Math.abs(unchanged.scroll-before.scroll)<2,'unchanged snapshot preserves scroll');
  assert.match(await page.locator('[data-comparison="102"]').getAttribute('class'),/current/);
  mode='changed';await automatic();
  const changed=await page.evaluate(()=>({order:[...document.querySelectorAll('[data-live-player]')].map(x=>x.dataset.livePlayer),focus:document.activeElement.id,scroll:scrollY,draft:document.querySelector('[data-line="102"]').value}));
  assert.deepEqual(changed.order,before.order);assert.equal(changed.focus,before.focus);assert.equal(changed.draft,'42.5');
  const needsReconfirmation=/expired/.test(await page.locator('[data-comparison="102"]').getAttribute('class'));assert.equal(needsReconfirmation,true,'changed snapshot requires line reconfirmation');
  await page.screenshot({path:`${out}/${sport}-changed-focused.png`});
  mode='stale';await manual();const staleDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(staleDisabled,true);
  await page.screenshot({path:`${out}/${sport}-stale.png`});
  mode='aged';await manual();const agedDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(agedDisabled,true);
  mode='suspended';await manual();const suspendedDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(suspendedDisabled,true,'suspended game cannot confirm a live comparison');
  await page.locator('[data-live-player="102"]').screenshot({path:`${out}/${sport}-suspended-player.png`});
  mode='unavailable';await manual();const unavailableDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(unavailableDisabled,true);assert.match(await page.locator('#warnings').textContent(),/unavailable/i);
  mode='current';await manual();
  await page.locator('[data-pause="102"]').check();const pausedDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(pausedDisabled,true);await page.locator('[data-pause="102"]').uncheck();
  await context.setOffline(true);const offlineCalls=calls;virtualTime+=60000;await page.clock.fastForward(60000);await page.waitForTimeout(50);assert.equal(calls,offlineCalls,'offline skips automatic polling');const elapsedDisabled=await page.locator('[data-quote="102"] button').isDisabled();assert.equal(elapsedDisabled,true,'old displayed snapshot stops confirmation while offline');
  await page.locator('#auto').uncheck();await context.setOffline(false);await page.waitForTimeout(50);assert.equal(calls,offlineCalls,'reconnect respects disabled auto');
  await manual();const recovered=await page.locator('[data-quote="102"] button').isEnabled();assert.equal(recovered,true);
  const offlineRequests=calls-offlineCalls-1;
  await page.locator('#auto').check();await waitDone();await page.locator('[data-sidebar-toggle]').click();const drawerToken=await page.evaluate(()=>history.state?.workspaceNavigation);await automatic();const drawerTokenAfterPoll=await page.evaluate(()=>history.state?.workspaceNavigation??null);assert.equal(drawerTokenAfterPoll,true,'poll preserves navigation history token');await page.locator('[data-sidebar-close]').click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>history.state?.workspaceNavigation??null),null,'close consumes drawer history entry');
  const liveControls=await page.locator('[data-live-player="102"]').evaluate(card=>[...card.querySelectorAll('input,button,summary,.pause-player')].map(el=>({tag:el.tagName,type:el.type||'',name:el.getAttribute('aria-label')||el.labels?.[0]?.textContent?.trim()||el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize})));
  assert.ok(liveControls.filter(item=>item.type==='number'||item.type==='submit').every(item=>item.height>=44),'live entry controls have 44px targets');
  const contrast=await page.locator('[data-live-player="102"]').evaluate(card=>{
   const rgb=value=>value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];
   const composite=(fg,bg)=>{const a=fg[3]??1;return fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));};
   const background=el=>{const stack=[];for(let p=el;p;p=p.parentElement)stack.unshift(rgb(getComputedStyle(p).backgroundColor));return stack.reduce((bg,fg)=>composite(fg,bg),[255,255,255]);};
   const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   return [...card.querySelectorAll('h3,.live-player-identity p,.live-values small,.live-tag,.live-comparison,.pause-player,input,button')].map(el=>{const style=getComputedStyle(el),bg=background(el),fg=composite(rgb(style.color),bg),a=lum(fg),b=lum(bg);return{text:el.textContent.trim().slice(0,100)||el.placeholder,font:style.fontSize,color:style.color,background:bg.map(Math.round),ratio:Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100};});
  });
  const sizes=[];for(const [width,height]of[[320,740],[390,844],[667,375],[1440,1000]]){await page.setViewportSize({width,height});await page.screenshot({path:`${out}/${sport}-recovered-${width}.png`});sizes.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})));}
  results.push({sport,synthetic:true,calls,errors,before,unchanged,changed,needsReconfirmation,staleDisabled,agedDisabled,suspendedDisabled,unavailableDisabled,elapsedDisabled,pausedDisabled,offlineRequests,recovered,drawerToken,drawerTokenAfterPoll,liveControls,contrast,sizes});console.log(JSON.stringify(results.at(-1)));await page.close();
 }
}finally{await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
