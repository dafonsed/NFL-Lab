// Independent shared-shell regression review against authenticated local pages.
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:3201',engine=process.argv[2]||'chromium';
const out=`artifacts/mobile-audit/shared-review/${engine}`;await fs.mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',storageState:join(tmpdir(),'sportslab-mobile-audit-session-3201.json')});
const page=await context.newPage(),errors=[],result={engine};page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
try{
 await page.goto(base+'/nfl');await page.locator('.research-row').first().waitFor({timeout:30000});
 const startUrl=page.url();
 await page.locator('[data-sidebar-toggle]').click();
 result.drawerOpened=await page.evaluate(()=>({inert:document.querySelector('main').inert,state:history.state,focus:document.activeElement.getAttribute('data-sidebar-close')}));
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#dashboard-sidebar').contains(document.activeElement)),true);
 await page.goBack();await page.waitForFunction(()=>document.querySelector('[data-sidebar-toggle]').getAttribute('aria-expanded')==='false');
 assert.equal(page.url(),startUrl);result.drawerBack={sameRoute:true,restoredFocus:await page.locator('[data-sidebar-toggle]').evaluate(e=>e===document.activeElement),unlocked:await page.locator('main').evaluate(e=>!e.inert)};assert.equal(result.drawerBack.restoredFocus,true);
 await page.locator('.research-player').first().click();await page.getByRole('button',{name:'Expand chart',exact:true}).first().waitFor();
 const expand=page.getByRole('button',{name:'Expand chart',exact:true}).first();await expand.scrollIntoViewIfNeeded();
 const capture=()=>page.evaluate(()=>{const chart=document.querySelector('.pr-chart-scroll:has(svg[role=group])'),parent=chart.closest('dialog');return{windowY:scrollY,parentY:parent?.scrollTop,chartX:chart.scrollLeft,focus:document.activeElement.textContent,chartFound:!!chart,history:history.state};});
 await page.evaluate(()=>{window.__reviewChart=document.querySelector('.pr-chart-scroll:has(svg[role=group])');window.__reviewParent=window.__reviewChart.parentElement;window.__reviewChart.scrollLeft=120;});
 const before=await capture();await expand.click();await page.locator('.mobile-chart-dialog[open]').waitFor();
 result.viewportVariable=await page.evaluate(()=>{document.documentElement.style.setProperty('--mobile-viewport-height','400px');return{root:getComputedStyle(document.documentElement).getPropertyValue('--mobile-viewport-height'),body:getComputedStyle(document.body).getPropertyValue('--mobile-viewport-height'),dialogMax:getComputedStyle(document.querySelector('.mobile-chart-dialog')).maxHeight};});
 assert.equal(result.viewportVariable.body,'400px');assert.equal(result.viewportVariable.dialogMax,'376px');await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
 await page.locator('.mobile-chart-dialog [data-result]').first().focus();assert.ok((await page.locator('.mobile-chart-dialog .mobile-chart-reading').innerText()).length>4);
 const comparisonLine=page.locator('.mobile-chart-dialog [data-comparison-line]');if(await comparisonLine.count()){result.expandedReference=await comparisonLine.evaluate(el=>({role:el.getAttribute('role'),tabindex:el.getAttribute('tabindex'),name:el.getAttribute('aria-label')}));assert.equal(result.expandedReference.role,'img');assert.equal(result.expandedReference.tabindex,null);assert.match(await page.locator('.mobile-chart-note').innerText(),/Close expanded chart to adjust/);}
 await page.getByRole('button',{name:'Close expanded chart'}).click();await page.waitForFunction(()=>!document.querySelector('.mobile-chart-dialog'));await page.waitForTimeout(100);
 result.chartClose={before,after:await capture(),sameNode:await page.evaluate(()=>window.__reviewChart===document.querySelector('.pr-chart-scroll:has(svg[role=group])')),sameParent:await page.evaluate(()=>window.__reviewChart.parentElement===window.__reviewParent),focus:await expand.evaluate(e=>e===document.activeElement)};
 assert.equal(result.chartClose.sameNode,true);assert.equal(result.chartClose.sameParent,true);assert.equal(result.chartClose.focus,true);
 const restoredLine=page.locator('.pr-chart-scroll [data-comparison-line]').first();if(await restoredLine.count()){const value=Number(await restoredLine.getAttribute('aria-valuenow'));await restoredLine.focus();await page.keyboard.press('ArrowUp');result.restoredSlider={before:value,after:Number(await restoredLine.getAttribute('aria-valuenow'))};assert.equal(result.restoredSlider.after,value+.5);}
 await expand.click();await page.locator('.mobile-chart-dialog[open]').waitFor();await page.setViewportSize({width:667,height:375});await page.screenshot({path:`${out}/chart-landscape.png`});await page.goBack();await page.waitForFunction(()=>!document.querySelector('.mobile-chart-dialog'));result.chartBack={sameRoute:page.url()===startUrl,parentStillOpen:await page.locator('dialog[open]').count()};
 await page.setViewportSize({width:390,height:844});await page.keyboard.press('Escape');await page.waitForTimeout(100);
 await page.locator('[data-sidebar-toggle]').click();await page.locator('#dashboard-sidebar [data-display-settings]').click();await page.locator('.workspace-sheet[open]').waitFor();
 result.appearance={drawerClosed:await page.locator('[data-sidebar-toggle]').getAttribute('aria-expanded')==='false',unlocked:await page.locator('main').evaluate(e=>!e.inert)};await page.goBack();await page.waitForFunction(()=>!document.querySelector('.workspace-sheet'));result.appearance.sameRoute=page.url()===startUrl;
 result.errors=errors;console.log(JSON.stringify(result));
}finally{await fs.writeFile(`${out}/results.json`,JSON.stringify(result,null,2));await browser.close();}
