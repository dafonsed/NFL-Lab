import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { MLB_MARKETS, validateMlbQuery } from '../lib/mlb/markets.mjs';

// Uses the running HTTP app, then checks results against fresh official box
// scores and independently recomputes the selected player's full-sample math.
const base=process.env.MLB_AUDIT_URL||'http://127.0.0.1:3100';
const date=validateMlbQuery({date:process.argv[2]||'2026-09-20'}).date;
const report={date,base,checkedAt:new Date().toISOString(),markets:[],resultComparisons:0,evidenceComparisons:0,errors:[]};
const boxes=new Map();
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(280000)});const text=await r.text();assert.ok(r.ok,`${r.status}: ${url}: ${text.slice(0,200)}`);return {data:JSON.parse(text),bytes:Buffer.byteLength(text)};}
function count(s,market){
  if(market==='outs'){if(s.outs!==undefined)return Number(s.outs);const [whole,thirds='0']=s.inningsPitched.split('.');return Number(whole)*3+Number(thirds);}
  if(market==='singles')return s.hits-s.doubles-s.triples-s.homeRuns;
  if(market==='tb')return s.hits+s.doubles+2*s.triples+3*s.homeRuns;
  if(market==='hrr')return s.hits+s.runs+s.rbi;
  return Number(s[MLB_MARKETS[market].field]);
}
for(const [market,config]of Object.entries(MLB_MARKETS)){
  try{
    const {data:b,bytes}=await get(`${base}/api/mlb/board?${new URLSearchParams({date,market})}`);assert.equal(b.market,market);assert.equal(b.date,date);assert.ok(bytes<4_000_000,'Full board exceeds hosted payload budget');
    for(const p of b.players){
      assert.ok(p.logs.every(l=>l.date<date),'Sample leaks selected-day results');assert.ok(p.modelScore===null||p.modelScore>=0&&p.modelScore<=100);
      if(p.prop)assert.ok(Number.isFinite(p.prop.line)&&p.prop.gameId===p.gameId&&p.prop.market===market);
      if(p.result.actual!==null){
        if(!boxes.has(p.gameId))boxes.set(p.gameId,(await get(`https://statsapi.mlb.com/api/v1/game/${p.gameId}/boxscore`)).data);
        const box=boxes.get(p.gameId),official=[...Object.values(box.teams.home.players),...Object.values(box.teams.away.players)].find(x=>x.person.id===p.playerId),stat=official?.stats[config.group==='pitching'?'pitching':'batting'];
        assert.ok(stat,`Missing official player ${p.player}`);assert.equal(p.result.actual,count(stat,market),`${p.player} ${market} official actual`);report.resultComparisons++;
        if(['over','under','push'].includes(p.result.status)){assert.ok(p.prop);assert.equal(p.result.status,p.result.actual>p.prop.line?'over':p.result.actual<p.prop.line?'under':'push');}
      }
    }
    const selected=b.players.find(p=>p.sampleCount>=8);if(selected){
      const {data:e}=await get(`${base}/api/mlb/evidence?${new URLSearchParams({date,market,player:selected.id})}`),p=e.player;assert.equal(p.logs.length,p.sampleCount);
      const values=p.logs.map(l=>{assert.equal(l.value,count(l.stats,market));return l.value;}),mean=a=>a.reduce((s,v)=>s+v,0)/a.length,baseline=.6*mean(values)+.4*mean(values.slice(0,config.group==='pitching'?3:5));
      assert.ok(Math.abs(p.projected-baseline)<.001);if(p.sampleOver)assert.equal(p.sampleOver.hits,values.filter(v=>v>p.sampleOver.line).length);report.evidenceComparisons++;
    }
    const item={market,players:b.players.length,games:b.games.length,lines:b.props?.withLine||0,fanDuel:b.props?.fanDuel||0,bytes,sourceWarnings:[...b.warnings,...(b.props?.warnings||[])]};report.markets.push(item);console.log(JSON.stringify(item));
  }catch(e){report.errors.push({market,error:e.message});console.error(`${market}: ${e.message}`);}
}
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/mlb-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({markets:report.markets.length,officialResultComparisons:report.resultComparisons,fullSampleChecks:report.evidenceComparisons,errors:report.errors.length,report:'reports/mlb-verification.json'}));
if(report.errors.length)process.exitCode=1;
