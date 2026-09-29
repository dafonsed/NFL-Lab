import {createRequire} from 'node:module';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium,webkit}=require('C:/Users/eturn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const results=[];
for(const engine of ['chromium','webkit']){
const b=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{headless:true,executablePath:'C:/Users/eturn/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{
const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:path.join(os.tmpdir(),'sportslab-mobile-audit-session-3201.json')});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:3201/ev?sport=all#ev-pre');await p.locator('[data-mobile-comparison]').first().click();await p.locator('.ev-reference-card[data-mobile-details=expanded] [data-comparison-action=chart]').click();await p.locator('[data-history-expand]').click();await p.locator('.bet-history-fullscreen').click();
await p.setViewportSize({width:667,height:375});await p.waitForTimeout(200);
const line=await p.locator('.bet-line-history-dialog .bet-history-plot svg').boundingBox();
assert.ok(line.y+line.height<=375,`line plot bottom ${line.y+line.height}`);await p.screenshot({path:`reports/mobile-ev/journeys-${engine}/line-history-fullscreen-landscape.png`});await p.locator('.bet-history-close').click();await p.waitForTimeout(100);
await p.setViewportSize({width:390,height:844});await p.locator('.bet-open-detail').first().click();await p.locator('.bet-expanded-card [data-comparison-action=movement]').click();await p.locator('[data-reference-expand]').click();await p.setViewportSize({width:667,height:375});await p.waitForTimeout(200);
const reference=await p.locator('.bet-reference-dialog .bet-reference-plot svg').boundingBox();assert.ok(reference.y+reference.height<=375,`reference plot bottom ${reference.y+reference.height}`);await p.screenshot({path:`reports/mobile-ev/journeys-${engine}/reference-history-fullscreen-landscape.png`});assert.deepEqual(errors,[]);results.push({engine,line,reference,errors});
}finally{await b.close();}
}
await fs.writeFile('reports/mobile-ev/history-landscape-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
