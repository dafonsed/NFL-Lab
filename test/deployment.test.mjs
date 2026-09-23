import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('Vercel can import the default server without starting a listener or background sync', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import path from 'node:path';
    import os from 'node:os';
    import server from './server.mjs';
    import { DATA_DIR } from './lib/providers.mjs';
    assert.equal(server.listening, false);
    assert.equal(DATA_DIR, path.join(os.tmpdir(), 'nfl-lab-data'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      const health = await fetch(base + '/api/health', {headers:{host:'nfl-lab-xi.vercel.app'}});
      assert.equal(health.status,200);const status=await health.json();assert.equal(status.syncing,false);assert.equal(status.lastSync,null);
      const page=await fetch(base+'/');assert.equal(page.status,200);const homepage=await page.text();assert.match(homepage,/Your next pick/);assert.ok(!homepage.includes('src="/home.js"'));
      const research=await fetch(base+'/research?sport=wnba');assert.equal(research.status,200);assert.ok((await research.text()).includes('src="/home.js"'));
      const oldQuery='?sport=mlb&date=2026-09-23&prop=hits&researchPlayer=mlb%3A823894%3A605141%3Ahits';
      const moved=await fetch(base+'/'+oldQuery,{redirect:'manual'});assert.equal(moved.status,302);assert.equal(moved.headers.get('location'),'/research'+oldQuery);
      const tracked=await fetch(base+'/?utm_source=example');assert.match(await tracked.text(),/Your next pick/);
      for(const asset of ['/landing.css','/landing.js','/research-preview.png','/trends-preview.png']) {const response=await fetch(base+asset);assert.equal(response.status,200);if(asset.endsWith('.png'))assert.match(response.headers.get('content-type'),/^image\\/png/);}
      for (const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
        const page=await fetch(base+'/'+sport+'?view=trends');assert.equal(page.status,200);
        const html=await page.text();assert.match(html,/id="td-workbench"/);assert.ok(html.includes('src="/trends.js"'));
      }
      const legacy=await fetch(base+'/?view=board&market=rec');assert.ok((await legacy.text()).includes('src="/app.js"'));
      for(const asset of ['/workspace.css','/trends.css','/trends.js','/trends-data.js'])assert.equal((await fetch(base+asset)).status,200);
      assert.equal((await fetch(base+'/style.css')).status,200);
      for(const asset of ['/app-design.css','/workspace-ui.js','/ui-icons.js','/home.js','/product-ui.js','/chart-line.js','/research-notes.js'])assert.equal((await fetch(base+asset)).status,200);
      for(const route of ['/wnba','/wnba/','/nba','/nhl','/soccer','/sports.js','/sports-view.js','/sports.css','/player-research.js','/research-data.js','/site-preferences.js','/player-research.css'])assert.equal((await fetch(base+route)).status,200);
      assert.equal((await fetch(base+'/api/sports/board?sport=invalid')).status,400);
      assert.equal((await fetch(base+'/performance')).status,200);
      assert.equal((await fetch(base+'/forecast.css')).status,200);
      const betsPage = await fetch(base+'/bets');
      assert.equal(betsPage.status,200); assert.match(await betsPage.text(), /My picks/);
      for (const asset of ['/bets/', '/bets.js', '/bet-utils.js', '/bet-legs.js', '/bet-editor.js', '/bets.css']) assert.equal((await fetch(base+asset)).status,200,asset);
      assert.equal((await fetch(base+'/api/bets/catalog?sport=invalid&date=2026-09-22')).status,400);
      assert.equal((await fetch(base+'/api/bets/game?sport=wnba&date=2026-09-22&game=invalid')).status,400);
      for (const route of ['/nfl/live','/live.js','/live-utils.js','/live.css']) assert.equal((await fetch(base+route)).status,200);
      for (const sport of ['nba','wnba','mlb']) {
        for (const suffix of ['/live','/live/']) assert.equal((await fetch(base+'/'+sport+suffix)).status,200);
        assert.equal((await fetch(base+'/api/'+sport+'/live?game=invalid')).status,400);
        assert.equal((await fetch(base+'/api/'+sport+'/live?date=2026-02-31')).status,400);
      }
      assert.equal((await fetch(base+'/live-sports.js')).status,200);
      assert.equal((await fetch(base+'/site-layout.css')).status,200);
      for (const route of ['/nfl/','/mlb/','/nba/','/wnba/','/nhl/','/soccer/','/bets/','/performance','/paper','/live','/live/']) {
        const page=await fetch(base+route);assert.equal(page.status,200,route);
        const html=await page.text();assert.match(html,/class="site-live-link|class="site-nav-link site-live-link/);assert.ok(html.includes('href="/site-layout.css"'));
        assert.equal(html.includes('<!--site-header-->'),false);
      }
      assert.equal((await fetch(base+'/api/nfl/live?game=invalid')).status,400);
      assert.equal((await fetch(base+'/api/nfl/live?date=2026-02-31')).status,400);
      assert.equal((await fetch(base+'/api/cron/predictions')).status,401);
      assert.equal((await fetch(base+'/api/performance?season=2026&week=99')).status,400);
      assert.equal((await fetch(base+'/api/board?market=invalid')).status,400);
      assert.equal((await fetch(base+'/api/nfl/research?market=invalid')).status,400);
      assert.equal((await fetch(base+'/.env')).status,404);
      assert.equal((await fetch(base+'/api/health',{method:'POST'})).status,405);
    } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
  `;
  const env={...process.env,VERCEL:'1'};delete env.DATA_DIR;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env,windowsHide:true});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  assert.equal(code,0,output);
});
