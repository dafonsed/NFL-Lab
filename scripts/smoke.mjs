import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root='http://127.0.0.1:3100';
const results=[];
for(const market of ['any_td','pass_yds','pass_tds','rush_yds','rec'])for(const view of ['games','board','viper','edge']){
 const r=await fetch(`${root}/api/board?market=${market}&view=${view}`);assert.equal(r.status,200);const d=await r.json();assert.equal(d.market,market);assert.equal(d.view,view);assert.ok(d.players.every(p=>Number.isFinite(p.modelScore)));
 assert.ok(d.datasets.every(s=>s.url.startsWith('https://github.com/nflverse/nflverse-data/')));
 assert.ok(d.players.every(p=>p.details.sample.every(g=>g.season<d.current.season||g.week<d.current.week)));
 results.push({market,view,players:d.players.length});
}
for(const [season,week] of [[2026,1],[2026,3],[2025,18]]){
 const r=await fetch(`${root}/api/board?season=${season}&week=${week}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.current,{season,week});assert.ok(d.players.length>0);assert.ok(d.players.every(p=>p.details.sample.every(g=>g.season<season||g.season===season&&g.week<week)));results.push({season,week,players:d.players.length});
}
const future=await(await fetch(root+'/api/board?season=2035&week=1')).json();assert.equal(future.pending,true);assert.equal(future.players.length,0);
assert.equal((await fetch(root+'/api/board?season=2026&week=99')).status,400);
assert.equal((await fetch(root+'/api/board',{method:'POST'})).status,405);
const evidence=await(await fetch(root+'/api/evidence?season=2026&week=2&market=rec&player=00-0037238')).json();assert.ok(evidence.plays.length>0);assert.ok(evidence.sources.length>=13);assert.ok(evidence.definitions.targets_pg);assert.ok(evidence.player.dataDiscrepancies.length===1);
await fs.writeFile('reports/api-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),results,futurePending:true,queryValidation:true,evidence:true},null,2));console.log(JSON.stringify({boards:results.length,futurePending:true,validation:true,evidencePlays:evidence.plays.length}));
