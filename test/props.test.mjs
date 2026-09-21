import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseSchedule, matchEvent, parseQuotes, PropStore, weekURL } from '../lib/props.mjs';
import { actualResult, gradeResult } from '../lib/results.mjs';
import { normalizePlayer, MARKETS } from '../lib/markets.mjs';
import { COMPARISON_API } from '../lib/props.mjs';

const event={id:'nfl/123',home:'BUF',away:'DET',commenceTime:'2026-09-18T00:15:00Z',state:'FINAL'};
const game={game_id:'2026_02_DET_BUF',home_team:'BUF',away_team:'DET',gameday:'2026-09-17'};
const quote={line:20.5,basis:'captured_pregame',fetchedAt:'2026-09-17T23:00:00Z',commenceTime:event.commenceTime};
function payload(){return {event:{home:{key:'BUF'},away:{key:'DET'}},books:{fanduel:{name:'FanDuel',states:['AZ']},draftkings:{name:'DraftKings',states:['AZ']}},markets:[{id:'nfl.123.0.77.ratts',stat:'rush attempts',player:{first_name:'James',last_name:'Cook',team:{key:'BUF'}},comparison:{fanduel:{value:20.5,available:true},draftkings:{value:21.5,available:true}}}]};}
const parse=p=>parseQuotes(p,event,'rush_attempts','2026-09-21T00:00:00Z','https://www.scoresandodds.com/nfl?week=2026-reg-2','hash');
async function temporaryStore(t, options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nfl-props-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});
  return new PropStore({dir,...options});
}
test('public source outage keeps the original line timestamp and limits retries',async t=>{
  let now=Date.parse('2026-09-17T21:00:00Z'),offline=false,calls=0;
  const store=await temporaryStore(t,{now:()=>now,fetcher:async()=>{calls++;if(offline)throw Error('offline');return new Response(JSON.stringify(payload()));}});
  const url=COMPARISON_API+'?event=nfl%2F123&market=rush+attempts';
  const [live,duplicate]=await Promise.all([store.read(url,60000),store.read(url,60000)]);
  assert.equal(calls,1);assert.equal(live.sha256,duplicate.sha256);
  now+=120000;offline=true;
  const stale=await store.read(url,60000);assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,live.fetchedAt);assert.deepEqual(stale.payload,live.payload);
  await store.read(url,60000,true);assert.equal(calls,2);
  await assert.rejects(store.read(COMPARISON_API+'?event=nfl%2F999',60000),/temporarily unavailable/);assert.equal(calls,2);
});
test('a late request cannot replace a newer saved pregame total',async t=>{
  const store=await temporaryStore(t),q={...quote,nameKey:'jamescook',team:'BUF'};
  await store.preserve(game.game_id,'rush_attempts',[q]);
  await store.preserve(game.game_id,'rush_attempts',[{...q,line:19.5,fetchedAt:'2026-09-17T22:00:00Z'}]);
  assert.equal((await store.archived(game.game_id,'rush_attempts'))[0].line,20.5);
});
test('a Thursday UTC rollover matches Thursday Eastern, not Friday',()=>{assert.equal(matchEvent(game,[event]).id,event.id);assert.equal(matchEvent({...game,gameday:'2026-09-18'},[event]),null);assert.equal(matchEvent({...game,gameday:'2025-09-17'},[event]),null);});
test('public schedule matches team links even when logo filenames are opaque',()=>{const html='<table><thead><tr class="event-card-header" data-content="nfl/123"><th><span data-field="state">FINAL</span><span data-role="localtime" data-value="2026-09-18T00:15:00Z"></span></th></tr></thead><tbody><tr data-side="away"><td class="team-name"><a href="/nfl/teams/lions">Lions</a></td></tr><tr data-side="home"><td class="team-name"><a href="/nfl/teams/bills">Bills</a></td></tr></tbody></table>';assert.deepEqual(parseSchedule(html),[event]);});
test('FanDuel is preferred even when another book has a different total',()=>{const q=parse(payload())[0];assert.equal(q.line,20.5);assert.equal(q.bookmaker,'FanDuel');assert.equal(q.basis,'published_archive');assert.equal(q.jurisdictionVerified,false);});
test('another sportsbook is explicitly identified when FanDuel is absent',()=>{const p=payload();delete p.markets[0].comparison.fanduel;const q=parse(p)[0];assert.equal(q.line,21.5);assert.equal(q.bookmaker,'DraftKings');});
test('wrong event, half-game and wrong prop types are not accepted',()=>{for(const change of [{id:'nfl.999.0.77.ratts'},{id:'nfl.123.1.77.ratts'},{stat:'rushing yards'}]){const p=payload();Object.assign(p.markets[0],change);assert.equal(parse(p).length,0);}const p=payload();p.event.home.key='NE';assert.throws(()=>parse(p),/different matchup/);});
test('ambiguous player lines are omitted; zero is valid and null is not zero',()=>{const p=payload();p.markets.push({...p.markets[0]});assert.equal(parse(p).length,0);p.markets.pop();p.markets[0].comparison.fanduel.value=0;assert.equal(parse(p)[0].line,0);p.markets[0].comparison.fanduel.value=null;assert.equal(parse(p)[0].bookmaker,'DraftKings');});
test('withdrawn current lines are skipped but archived listings remain inspectable',()=>{const p=payload();p.markets[0].comparison.fanduel.available=false;assert.equal(parseQuotes(p,{...event,state:'Scheduled'},'rush_attempts','2026-09-17T00:00:00Z','url','hash')[0].bookmaker,'DraftKings');assert.equal(parse(p)[0].bookmaker,'FanDuel');});
test('a missing sportsbook line never becomes the model projection',()=>{assert.equal(gradeResult({status:'final',actual:25},null,'rush_attempts').status,'no_line');});
test('hit, miss and push correctly grade both sides including exact integer lines',()=>{for(const [actual,status,over,under] of [[21,'over','hit','miss'],[19,'under','miss','hit'],[20.5,'push','push','push']]){const r=gradeResult({status:'final',actual},quote,'rush_attempts');assert.deepEqual([r.status,r.over,r.under],[status,over,under]);}});
test('in-play totals are not used as pregame results',()=>{assert.equal(gradeResult({status:'final',actual:25},{...quote,basis:'in_play'},'rush_attempts').status,'no_line');assert.equal(gradeResult({status:'final',actual:25},{...quote,fetchedAt:'2026-09-18T01:00:00Z'},'rush_attempts').status,'no_line');});
test('an identified historical listing can be compared without claiming closing odds',()=>{const r=gradeResult({status:'final',actual:25},{...quote,basis:'published_archive'},'rush_attempts');assert.equal(r.over,'hit');assert.equal(r.basis,'published_archive');assert.match(r.note,/not verified closing lines/);});
test('unfinished games and missing players are not graded as losses',()=>{assert.equal(actualResult({...game,complete:false},'p','rush_attempts').status,'pending');assert.equal(actualResult({...game,complete:true,players:new Map(),plays:[]},'p','rush_attempts').status,'no_stats');assert.equal(gradeResult({status:'pending',actual:null},quote,'rush_attempts').over,null);});
test('zero official totals are distinct from missing totals',()=>{const g={...game,complete:true,plays:[],players:new Map([['p',{statsAvailable:true,offense_snaps:12,carries:0}]])};assert.equal(actualResult(g,'p','rush_attempts').actual,0);g.players.set('p',{statsAvailable:false,carries:0});assert.equal(actualResult(g,'p','rush_attempts').status,'no_stats');});
test('combined yards add only rushing and receiving, and return TDs count',()=>{const g={...game,complete:true,plays:[],players:new Map([['p',{statsAvailable:true,carries:8,rushing_yards:30,receiving_yards:40,passing_yards:200,rushing_tds:0,receiving_tds:0,special_teams_tds:1}]])};assert.equal(actualResult(g,'p','rush_rec_yds').actual,70);assert.equal(gradeResult(actualResult(g,'p','any_td'),null,'any_td').over,'hit');});
test('all new prop types are registered and playoff URLs use postseason weeks',()=>{assert.equal(MARKETS.length,11);assert.equal(weekURL(2025,22,[{game_type:'SB'}]),'https://www.scoresandodds.com/nfl?week=2025-post-4');assert.equal(normalizePlayer('Kenneth Walker III'),normalizePlayer('Kenneth Walker'));});
test('later archive imports do not replace a line saved before kickoff',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nfl-props-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});});const store=new PropStore({dir});const q={...quote,nameKey:'jamescook',team:'BUF'};await store.preserve(game.game_id,'rush_attempts',[q]);await store.preserve(game.game_id,'rush_attempts',[{...q,line:24.5,basis:'published_archive'}]);assert.equal((await store.archived(game.game_id,'rush_attempts'))[0].line,20.5);});
