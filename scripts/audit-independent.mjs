import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SourceStore, MARKETS } from '../lib/source.mjs';
const store=new SourceStore();const boards=await Promise.all(MARKETS.map(market=>store.board({market})));const board=boards[0],bundle=await store.bundle(board.current.season);
const report={checkedAt:new Date().toISOString(),selectedWeek:board.current,provider:'nflverse + NFL Next Gen Stats',sources:board.datasets,formulas:{players:0,assertions:0},espn:{games:[],comparisons:0,mismatches:[],unmatched:[]},limitations:['This checks recorded statistics and arithmetic, not predictive calibration.','Both data providers can carry later stat corrections.','ESPN public summary endpoints are used for this audit only; app operation does not depend on ESPN API availability.']};
const assertNear=(a,b)=>{assert.ok(Math.abs(a-b)<.0011,`${a} != ${b}`);report.formulas.assertions++;};
for(const b of boards)for(const p of b.players){const sample=p.details.sample,s=p.details.stats,total=k=>sample.reduce((v,g)=>v+g[k],0),per=k=>total(k)/sample.length;
 assert.ok(sample.every(g=>g.season<b.current.season||g.week<b.current.week));assert.ok(Number.isFinite(p.modelScore)&&p.modelScore>=0&&p.modelScore<=100);report.formulas.assertions+=2;
 if(b.market==='any_td'){assertNear(s.touches_pg,per('carries')+per('receptions'));assertNear(p.details.cheat_code.td_debt.actual,total('rushing_tds')+total('receiving_tds'));assertNear(p.tdProb,1-Math.exp(-p.details.cheat_code.td_debt.expected/sample.length));}
 if(b.market==='pass_yds'){assertNear(s.attempts_pg,per('attempts'));assertNear(s.pass_ypg,per('passing_yards'));}
 if(b.market==='pass_tds')assertNear(s.pass_tds_pg,per('passing_tds'));
 if(b.market==='rush_yds'){assertNear(s.carries_pg,per('carries'));assertNear(s.rush_ypg,per('rushing_yards'));}
 if(b.market==='rec'){assertNear(s.targets_pg,per('targets'));assertNear(s.rec_pg,per('receptions'));}
 report.formulas.players++;
}
const games=[...bundle.games.values()].filter(g=>g.complete&&(Number(g.season)<board.current.season||Number(g.season)===board.current.season&&Number(g.week)<board.current.week)&&g.espn).sort((a,b)=>b.gameday.localeCompare(a.gameday)).slice(0,16);
const roster=new Map(bundle.rosters.filter(r=>r.espn_id&&r.gsis_id).map(r=>[String(r.espn_id),r.gsis_id]));
const categories={passing:{YDS:'passing_yards',TD:'passing_tds'},rushing:{CAR:'carries',YDS:'rushing_yards',TD:'rushing_tds'},receiving:{REC:'receptions',YDS:'receiving_yards',TD:'receiving_tds',TGTS:'targets'}};
for(let i=0;i<games.length;i+=4)await Promise.all(games.slice(i,i+4).map(async g=>{
 const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${g.espn}`;
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${response.status} ${url}`);const data=await response.json();
 await fs.mkdir('reports/espn',{recursive:true});await fs.writeFile(`reports/espn/${g.espn}.json`,JSON.stringify(data));
 let count=0;for(const team of data.boxscore?.players||[])for(const group of team.statistics||[]){const mapping=categories[group.name];if(!mapping)continue;for(const athlete of group.athletes||[]){const id=roster.get(String(athlete.athlete.id)),row=g.players.get(id);if(!row){report.espn.unmatched.push({game:g.game_id,player:athlete.athlete.displayName,espnId:athlete.athlete.id});continue;}
  for(const [label,key] of Object.entries(mapping)){const index=group.labels.indexOf(label);if(index<0||athlete.stats[index]==null||athlete.stats[index]==='--')continue;const espn=Number(athlete.stats[index]),nflverse=Number(row[key]);if(!Number.isFinite(espn)||!Number.isFinite(nflverse))continue;count++;if(espn!==nflverse)report.espn.mismatches.push({game:g.game_id,player:athlete.athlete.displayName,stat:key,espn,nflverse});}
  if(group.name==='passing'){const index=group.labels.indexOf('C/ATT'),attempts=Number(athlete.stats[index]?.split('/')[1]);if(Number.isFinite(attempts)){count++;if(attempts!==Number(row.attempts))report.espn.mismatches.push({game:g.game_id,player:athlete.athlete.displayName,stat:'attempts',espn:attempts,nflverse:Number(row.attempts)});}}
 }}report.espn.comparisons+=count;report.espn.games.push({game:g.game_id,url,comparisons:count});
}));
await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/independent-audit.json',JSON.stringify(report,null,2));
const md=`# Independent data audit\n\nChecked ${report.checkedAt}. Selected ${board.current.season} week ${board.current.week}.\n\n- ${report.formulas.players} player/market profiles, ${report.formulas.assertions} sample and formula assertions passed.\n- ${report.espn.comparisons} recorded-stat comparisons with ESPN across ${report.espn.games.length} games.\n- ${report.espn.mismatches.length} mismatches; ${report.espn.unmatched.length} unmatched player-category entries.\n\n${report.espn.mismatches.length?'Investigate mismatches in independent-audit.json.':'All compared stats matched at audit time.'}\n\nThis is data verification, not evidence of predictive accuracy. Full source URLs, hashes, results and archived ESPN responses are in independent-audit.json and the espn directory.\n`;
await fs.writeFile('reports/INDEPENDENT-AUDIT.md',md);console.log(md);if(!report.espn.comparisons||report.espn.mismatches.length)process.exitCode=1;
