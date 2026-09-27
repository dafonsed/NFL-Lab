import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOddsBoard, createOddsScreen } from '../public/odds-screen.js';
import { SPORTSBOOK_COVERAGE, availableSportsbookQuotes, readSportsbookState, saveSportsbookState } from '../public/sportsbook-availability.js';

const now = Date.parse('2026-09-25T20:00:00Z');
const quote = (extra = {}) => ({id:'a',sport:'MLB',event:'MIA @ WSH',player:'Player A',market:'Player A hits',type:'prop',line:.5,side:'Over',book:'DraftKings',odds:110,ts:new Date(now).toISOString(),...extra});

test('compares each threshold separately and keeps tied best prices', () => {
  const board = buildOddsBoard([quote(),quote({id:'b',book:'FanDuel'}),quote({id:'c',book:'BetMGM',line:1.5,odds:300})],['DraftKings','FanDuel','BetMGM'],now);
  assert.equal(board[0].markets.length,2);
  const row = board[0].markets[0].sides[0];
  assert.equal(row.bestDecimal,2.1);
  assert.equal(row.average,2.1);
  assert.equal(row.prices.length,2);
});

test('uses the latest quote per book and excludes stale live prices from summaries', () => {
  const board = buildOddsBoard([quote({live:true,odds:200,ts:new Date(now-5000).toISOString()}),quote({id:'new',live:true,odds:100}),quote({id:'stale',book:'FanDuel',live:true,odds:400,ts:new Date(now-120000).toISOString()})],['DraftKings','FanDuel'],now);
  const row = board[0].markets[0].sides[0];
  assert.equal(row.prices.length,2);
  assert.equal(row.best.id,'new');
  assert.equal(row.average,2);
});

test('pairs opposing spread lines and isolates sports and live markets', () => {
  const base = {type:'spread',player:'',market:'Point spread'};
  const board = buildOddsBoard([quote({...base,line:-3.5,side:'Away'}),quote({...base,line:3.5,side:'Home'}),quote({...base,line:-3.5,side:'Away',sport:'NFL'}),quote({...base,line:-3.5,side:'Away',live:true})],['DraftKings'],now);
  assert.equal(board.length,3);
  assert.equal(board[0].markets.length,1);
  assert.equal(board[0].markets[0].sides.length,2);
});

test('excludes hidden books, exchange depth and invalid prices', () => {
  const board = buildOddsBoard([quote(),quote({book:'FanDuel',odds:500}),quote({id:'depth',depthOnly:true,odds:800}),quote({id:'invalid',odds:20})],['DraftKings'],now);
  assert.equal(board[0].markets[0].sides[0].best.id,'a');
});

test('renders honest empty state and escapes entered market text', () => {
  const empty = createOddsScreen({getQuotes:()=>[],brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'});
  assert.match(empty,/Your odds board starts here/);
  const html = createOddsScreen({getQuotes:()=>[quote({player:'<img onerror=x>',market:'<script>x<\/script>'})],brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'});
  assert.doesNotMatch(html,/<script>|<img onerror/);
  assert.match(html,/&lt;img onerror=x&gt;/);
});

test('All sportsbooks clears a one-book state filter, restores hidden columns and survives reload', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  saveSportsbookState('FL',storage);
  const records = Object.keys(SPORTSBOOK_COVERAGE).map(book => quote({id:book,book}));
  const options = {getQuotes:()=>availableSportsbookQuotes(records,readSportsbookState(storage)),getSportsbookState:()=>readSportsbookState(storage),onAllSportsbooks:()=>saveSportsbookState('',storage),brandMark:()=>'',redraw:()=>{},onSport:()=>{}};
  const screen = createOddsScreen(options);
  let html = screen.render({sport:'MLB'});
  assert.equal((html.match(/data-os-book=/g) || []).length,1);
  assert.match(html,/Filtered to FL/);
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector:()=>null,querySelectorAll:()=>[]};
  try {
    const showAll = () => screen.click({target:{closest:()=>({dataset:{osAction:'all-books'}})}});
    showAll();
    html = screen.render({sport:'MLB'});
    assert.equal((html.match(/data-os-book=/g) || []).length,11);
    assert.equal((html.match(/class="os-book-heading"/g) || []).length,11);
    assert.doesNotMatch(html,/Filtered to FL/);
    screen.change({target:{dataset:{osBook:'FanDuel'},checked:false}});
    assert.equal((screen.render({sport:'MLB'}).match(/class="os-book-heading"/g) || []).length,10);
    showAll();
    assert.equal((screen.render({sport:'MLB'}).match(/class="os-book-heading"/g) || []).length,11);
    assert.equal((createOddsScreen(options).render({sport:'MLB'}).match(/data-os-book=/g) || []).length,11);
    assert.equal(readSportsbookState(storage),'');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
