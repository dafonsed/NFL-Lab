import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {createOddsDemoQuotes,oddsWorkspaceQuotes,oddsDemoHistory,ODDS_DEMO_ENABLED,ODDS_DEMO_BOOKS} from '../public/odds-demo.js';
import {buildOddsBoard,createOddsScreen} from '../public/odds-screen.js';
import {decimal,implied,fairProbability} from '../public/ev-core.js';

const date=new Date('2026-09-25T22:00:00Z');
const data=createOddsDemoQuotes(date);
const expected={MLB:15,NBA:15,NFL:16,WNBA:8,NHL:16,Soccer:10};

test('all six sports have a complete simulated slate and valid unique prices',()=>{
  assert.equal(ODDS_DEMO_ENABLED,true);
  assert.equal(new Set(data.map(q=>q.id)).size,data.length);
  for(const [sport,count] of Object.entries(expected)) {
    const rows=data.filter(q=>q.sport===sport);
    assert.equal(new Set(rows.map(q=>q.eventId)).size,count,sport);
    assert.equal(new Set(rows.map(q=>q.book)).size,11,sport);
    assert.ok(rows.every(q=>q.demo&&q.source==='example'&&Number.isFinite(decimal(q.odds))&&Date.parse(q.startTime)>date.getTime()),sport);
    assert.ok(rows.some(q=>q.type==='prop')&&rows.some(q=>q.type==='alternate')&&rows.some(q=>q.type==='total')&&rows.some(q=>q.type==='spread'),sport);
  }
});

test('prices have complete sides, realistic margin and comparable no-vig values',()=>{
  for(const event of buildOddsBoard(data,ODDS_DEMO_BOOKS))for(const market of event.markets) {
    const prices=[...market.latest.values()];
    const sides=market.first.type==='three-way'?3:2;
    for(const book of new Set(prices.map(q=>q.book))) {
      const pair=prices.filter(q=>q.book===book);
      assert.equal(pair.length,sides);
      const probability=pair.reduce((sum,q)=>sum+implied(q.odds),0);
      assert.ok(probability>1.015&&probability<1.07,`${market.first.market}: ${probability}`);
    }
    const fair=fairProbability(prices[0],prices);
    assert.ok(fair>0&&fair<1);
  }
});

test('demo survives empty storage and release switch preserves manual records',()=>{
  const saved=[{id:'manual-1',source:'manual'},{id:'old-example',source:'example'}];
  const before=JSON.stringify(saved);
  assert.ok(oddsWorkspaceQuotes([],date).length>38000);
  const merged=oddsWorkspaceQuotes(saved,date);
  assert.equal(merged.filter(q=>q.id==='manual-1').length,1);
  assert.ok(!merged.some(q=>q.id==='old-example'));
  assert.equal(JSON.stringify(saved),before);
  assert.deepEqual(oddsWorkspaceQuotes(saved,date,false),[saved[0]]);
  assert.deepEqual(oddsWorkspaceQuotes([],date,false),[]);
});

test('reload produces stable odds and tomorrow rolls the schedule forward',()=>{
  const tomorrow=createOddsDemoQuotes(new Date('2026-09-26T22:00:00Z'));
  assert.deepEqual(tomorrow.map(q=>[q.id,q.odds]),data.map(q=>[q.id,q.odds]));
  assert.ok(Date.parse(tomorrow[0].startTime)>Date.parse(data[0].startTime));
  const history=oddsDemoHistory(data[0]);
  assert.equal(history.length,9);
  assert.ok(history.filter(q=>Date.parse(q.ts)>=Date.parse(data[0].ts)-3600000).length>=4);
  assert.equal(history.at(-1).odds,data[0].odds);
  assert.ok(history.every(q=>q.demo&&Date.parse(q.ts)<=Date.parse(data[0].ts)));
});

test('each sport opens on a main-market grid with every game expanded',()=>{
  const original=globalThis.document;
  globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};
  try {
    for(const [sport,count] of Object.entries(expected)) {
      const screen=createOddsScreen({getQuotes:()=>data,brandMark:()=>'',onSport:()=>{},redraw:()=>{}});
      let html=screen.render({sport,demo:true});
      assert.match(html,/Demo mode/);
      assert.equal((html.match(/class="os-event-heading"/g)||[]).length,count);
      assert.equal((html.match(/aria-label="Collapse [^"]* vs /g)||[]).length,count);
      const $=load(html);
      assert.equal($('.os-tab[aria-pressed="true"]').text(),'Main markets');
      // Moneyline (two or three-way), spread and total for every game, one column per book.
      assert.equal($('tbody tr.os-row').length,count*(sport==='Soccer'?7:6),sport);
      assert.equal($('thead .os-book-head').length,11);
      assert.equal($('tbody tr.os-row').first().find('.os-book-cell').length,11);
      // The full slate of every market still opens one game at a time.
      screen.click({target:{closest:selector=>selector.includes('data-line-history')?null:{dataset:{osTab:'group:all'}}}});
      html=screen.render({sport,demo:true});
      assert.equal((html.match(/class="os-event-heading"/g)||[]).length,count);
      assert.equal((html.match(/aria-label="Collapse [^"]* vs /g)||[]).length,1);
      assert.ok(load(html)('tbody tr.os-row').length>=30);
    }
  } finally {
    if(original===undefined)delete globalThis.document;else globalThis.document=original;
  }
});
