import test from 'node:test';
import assert from 'node:assert/strict';
import { AvailabilityStore, availabilityApplies } from '../lib/availability.mjs';
import { SourceStore } from '../lib/source.mjs';
import { buildRates, prepareData } from '../lib/model.mjs';
import { PaperStore } from '../lib/paper.mjs';
const before=Date.parse('2026-09-21T22:45:00Z'),after=Date.parse('2026-09-21T22:51:00Z');
const kickoff='2026-09-22T00:15:00.000Z',playerId='00-0039075';
const injury=(status,date)=>({status,date,athlete:{links:[{rel:['playercard','desktop'],href:'https://www.espn.com/nfl/player/_/id/4426515/puka-nacua'}]}});
const report=(rows,timestamp='2026-09-21T22:51:00Z')=>new Response(JSON.stringify({timestamp,injuries:[{injuries:rows}]}));
const questionable=()=>injury('Questionable','2026-09-20T16:07Z'),out=()=>injury('Out','2026-09-21T22:50Z');

test('manual refresh bypasses cached Questionable and upstream cache, exposing the new Out receipt',async()=>{
 let now=before,calls=0;const store=new AvailabilityStore({now:()=>now,fetcher:async(url,options)=>{
  assert.equal(options.cache,'no-store');assert.equal(options.headers['Cache-Control'],'no-cache');assert.equal(new URL(url).searchParams.get('_'),String(now));
  return report([calls++?out():questionable()]);
 }});
 const first=await store.load();now+=1000;assert.equal(await store.load(),first);assert.equal(calls,1);
 const second=await store.load({force:true});assert.equal(calls,2);assert.equal(store.forPlayer(second,4426515,true).status,'Out');assert.equal(second.sourceUpdatedAt,'2026-09-21T22:51:00Z');assert.notEqual(first.checkedAt,second.checkedAt);
});

test('automatic injury check expires in one minute, not fifteen',async()=>{
 let now=before,calls=0;const store=new AvailabilityStore({now:()=>now,fetcher:async()=>report([calls++?out():questionable()])});
 await store.load();now+=60000;assert.equal(store.forPlayer(await store.load(),4426515,true).unavailable,true);assert.equal(calls,2);
});

test('a refresh during a pending older request waits for a newly started fetch',async()=>{
 let release,calls=0;const store=new AvailabilityStore({fetcher:async()=>{if(!calls++)await new Promise(r=>release=r);return report([calls===1?questionable():out()]);}});
 const older=store.load();const refreshed=store.load({force:true});release();assert.equal((await older).entries[0].status,'Questionable');assert.equal((await refreshed).entries[0].status,'Out');assert.equal(calls,2);
});

test('latest dated injury wins, and failed or incomplete refresh cannot turn a known Out into available',async()=>{
 let now=after,mode=0;const store=new AvailabilityStore({now:()=>now,fetcher:async()=>{if(mode===1)throw Error('fixture outage');return report(mode===2?[]:mode===3?[questionable()]:mode===4?[injury('Active','2026-09-21T23:00Z')]:[out(),questionable()]);}});
 const fresh=await store.load();assert.equal(fresh.entries[0].status,'Out');
 now+=1000;mode=1;const stale=await store.load({force:true});assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,fresh.fetchedAt);assert.equal(store.forPlayer(stale,4426515,true).unavailable,true);assert.equal(store.forPlayer(stale,'unknown',true).stale,true);
 mode=2;assert.equal(store.forPlayer(await store.load({force:true}),4426515,true).unavailable,true);
 mode=3;assert.equal(store.forPlayer(await store.load({force:true}),4426515,true).status,'Out');
 mode=4;assert.equal(store.forPlayer(await store.load({force:true}),4426515,true).unavailable,false);
});

test('availability stays enforced through Monday kickoff and UTC midnight, without changing completed or old games',()=>{
 const start=Date.parse(kickoff);for(const now of [after,start,start+3*3600000])assert.equal(availabilityApplies(start,false,now),true);
 assert.equal(availabilityApplies(start,true,start+3600000),false);assert.equal(availabilityApplies(start,false,start+86400000),false);assert.equal(availabilityApplies(start+14*86400000,false,start),false);
});

function sourceFixture(){
 let now=before,calls=0;const availability=new AvailabilityStore({now:()=>now,fetcher:async()=>report([calls++?out():questionable()])});
 const game={game_id:'2026_02_NYG_LA',season:'2026',week:'2',gameday:'2026-09-21',gametime:'20:15',game_type:'REG',home_team:'LA',away_team:'NYG',total_line:'45',spread_line:'3'};
 const prior={...game,game_id:'2026_01_LA_B',week:'1',gameday:'2026-09-13',away_team:'B'};
 const roster=(id,name,espn)=>({gsis_id:id,full_name:name,espn_id:espn,position:'WR',team:'LA',season:'2026',week:'2',status:'ACT'});
 const rosters=[roster(playerId,'Puka Nacua','4426515'),roster('other','Healthy Receiver','999')];
 const weekly=rosters.map(r=>({player_id:r.gsis_id,team:'LA',position:'WR',game_id:prior.game_id,receptions:'8',targets:'10',receiving_yards:'90',receiving_tds:'0',attempts:'0',carries:'0',rushing_tds:'0'}));
 const pbp=[{game_id:prior.game_id,desc:'END GAME',play_type:'no_play'}];
 const bundle={games:prepareData({schedule:[prior,game],pbp,weekly,rosters,snaps:[],chart:[]}),rosters,rates:buildRates([]),ngs:{},datasets:[],loadedAt:now};
 const captured=[];
 const store=new SourceStore({now:()=>now,availability,props:{enrich:async()=>({withLine:0})},weather:{nfl:async()=>({status:'unavailable'})},predictions:{capture:async()=>({state:'waiting'})},paper:{capturePaper:async(s,p,m,players)=>{captured.push(players);return {state:'waiting'};}}});
 store.catalog=async()=>({current:{season:2026,week:2},weeks:[{season:2026,week:2}],schedule:{rows:[prior,game],meta:{fetchedAt:new Date(now).toISOString()}}});
 store.bundle=async()=>bundle;store.trackLines=async()=>[];
 return {store,game,bundle,captured,setNow:value=>now=value,calls:()=>calls};
}

test('real NFL board refresh removes Out from rankings, records a source receipt, and invalidates other market caches',async()=>{
 const f=sourceFixture();const input={season:2026,week:2,market:'rec'};
 const old=await f.store.board(input);assert.equal(old.players.find(p=>p.playerId===playerId).forecast.availability.status,'Questionable');
 await f.store.board({...input,market:'rec_yds'});assert.equal(f.calls(),1);
 f.setNow(before+1000);const current=await f.store.board(input,true);
 assert.equal(f.calls(),2);assert.ok(!current.players.some(p=>p.playerId===playerId));assert.equal(current.players[0].rank,1);
 const excluded=current.unavailablePlayers.find(p=>p.playerId===playerId);assert.equal(excluded.availability.status,'Out');assert.equal(excluded.availability.reportedAt,'2026-09-21T22:50Z');assert.equal(excluded.modelScore,undefined);
 assert.equal(f.captured.at(-1).find(p=>p.playerId===playerId).forecast.point,null);assert.equal(f.captured.at(-1).find(p=>p.playerId===playerId).forecast.lean,null);
 for(const market of ['rec','rec_yds','any_td','rush_rec_yds'])for(const view of ['board','games','viper']){const b=await f.store.board({...input,market,view});assert.ok(!b.players.some(p=>p.playerId===playerId));assert.ok(b.unavailablePlayers.some(p=>p.playerId===playerId));}
 f.setNow(Date.parse(kickoff)+60000);assert.ok(!(await f.store.board(input)).players.some(p=>p.playerId===playerId));
 f.bundle.games.get(f.game.game_id).complete=true;assert.ok((await f.store.board(input,true)).players.some(p=>p.playerId===playerId));
});

test('a posted priced line cannot create a paper selection for a ruled-out player',async()=>{
 const store=new PaperStore({now:()=>after,cloud:false});store.append=async()=>{throw Error('Unavailable player must never be archived as a new paper selection');};
 const result=await store.capturePaper('nfl','2026-W02','rec',[{playerId,gameId:'2026_02_NYG_LA',forecast:{status:'unavailable',point:null,probability:null,lean:null},prop:{line:6.5,basis:'captured_pregame',commenceTime:kickoff,fetchedAt:new Date(after).toISOString(),prices:{over:{american:-110,decimal:1.91}}}}],()=>kickoff);
 assert.equal(result.state,'waiting');
});
