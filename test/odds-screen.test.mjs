import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { buildOddsBoard, createOddsScreen } from '../public/odds-screen.js';
import { SPORTSBOOK_COVERAGE, availableSportsbookQuotes, readSportsbookState, saveSportsbookState } from '../public/sportsbook-availability.js';

// Pregame prices expire after 24 hours, so fixtures are observed relative to the real clock.
const now = Date.now();
const quote = (extra = {}) => ({id:'a',sport:'MLB',event:'MIA @ WSH',player:'Player A',market:'Player A hits',type:'prop',line:.5,side:'Over',book:'DraftKings',odds:110,ts:new Date(now).toISOString(),...extra});
// A click on an odds-screen control: matches the screen's own selectors, never line-history buttons.
const hit = dataset => ({target:{closest:selector => selector.includes('data-line-history') ? null : {dataset}}});

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
  assert.match(empty,/Waiting for prices/); assert.doesNotMatch(empty,/data-add="quote"|Add a price/);
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
    const bookHeadings = markup => load(markup)('.os-grid .os-book-head').length;
    assert.equal(bookHeadings(html),1);
    const showAll = () => screen.click(hit({osAction:'all-books'}));
    showAll();
    html = screen.render({sport:'MLB'});
    assert.equal((html.match(/data-os-book=/g) || []).length,11);
    assert.equal(bookHeadings(html),11);
    assert.doesNotMatch(html,/Filtered to FL/);
    screen.change({target:{dataset:{osBook:'FanDuel'},checked:false}});
    assert.equal(bookHeadings(screen.render({sport:'MLB'})),10);
    showAll();
    assert.equal(bookHeadings(screen.render({sport:'MLB'})),11);
    assert.equal((createOddsScreen(options).render({sport:'MLB'}).match(/data-os-book=/g) || []).length,11);
    assert.equal(readSportsbookState(storage),'');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('grid rows keep both sides and show every sportsbook price in its own column', () => {
  const records = [quote(),quote({id:'b',book:'FanDuel',odds:100}),quote({id:'under-dk',side:'Under',odds:-110}),quote({id:'under-fd',side:'Under',book:'FanDuel',odds:-120})];
  const screen = createOddsScreen({getQuotes:()=>records,brandMark:book=>`<span>${book}</span>`,redraw:()=>{},onSport:()=>{}});
  const $ = load(screen.render({sport:'MLB'}));
  assert.equal($('tbody tr.os-row').length,2);
  assert.deepEqual($('thead .os-book-head').toArray().map(cell => $(cell).attr('title')),['DraftKings','FanDuel']);
  const first = $('tbody tr.os-row').first();
  // Every row has the same cell count so inline analysis rows can span the grid.
  assert.equal(first.children().length,$('tbody tr.os-row').last().children().length);
  assert.equal(first.children().length,$('thead th').length);
  assert.equal(first.find('.os-best-cell strong').text(),'2.10');
  assert.equal(first.find('.os-average strong').text(),'2.05');
  assert.deepEqual(first.find('.os-book-cell').toArray().map(cell => $(cell).find('b').text()),['2.10','2.00']);
  assert.deepEqual(first.find('.os-book-cell').toArray().map(cell => $(cell).attr('data-open-quote')),['a','b']);
  assert.ok(first.find('.os-book-cell').first().hasClass('is-best'));
  assert.equal($('.os-book-cell.is-worst').length,0,'two prices never mark a worst price');
  assert.equal(first.find('[data-detail]').attr('data-detail'),'a');
  assert.equal(first.find('.os-selection').attr('data-open-quote'),'a');
  assert.equal(first.find('[data-line-history]').attr('data-line-history'),'a');
  assert.equal($('tbody tr.os-row').last().find('[data-detail]').attr('data-detail'),'under-dk');
  assert.equal(first.find('.os-selection [data-detail]').text(),'Player A Over 0.5');
  assert.match(first.find('.os-c-time').text(),/MIA @ WSH/);
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector:()=>null,querySelectorAll:()=>[]};
  try {
    // Row bodies, price cells and line-history buttons are handled by the host page, never swallowed here.
    assert.equal(screen.click({target:{closest:selector => selector.includes('data-line-history') ? {dataset:{lineHistory:'a'}} : null}}),false);
    assert.equal(screen.click({target:{closest:() => null}}),false);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('best, worst, missing and different-line prices are marked per row', () => {
  const spread = {type:'spread',player:'',market:'Run line',displayEvent:'MIA @ WSH',team:''};
  const records = [
    quote({...spread,id:'m1',side:'MIA',line:1.5,odds:-120}),quote({...spread,id:'m2',side:'MIA',line:1.5,book:'FanDuel',odds:-105}),quote({...spread,id:'m3',side:'MIA',line:-1.5,book:'BetMGM',odds:150}),
    quote({...spread,id:'w1',side:'WSH',line:-1.5,odds:100}),quote({...spread,id:'w2',side:'WSH',line:-1.5,book:'FanDuel',odds:-110}),
  ];
  const $ = load(createOddsScreen({getQuotes:()=>records,brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'}));
  const rows = $('tbody tr.os-row');
  // Away side first, with the signed spread line in the selection.
  assert.equal(rows.first().find('[data-detail]').text(),'MIA -1.5');
  assert.deepEqual(rows.first().find('.os-book-cell').toArray().map(cell => $(cell).attr('class').replace('os-book-cell','').trim()),['is-worst','','is-best']);
  // A book offering the other side of the spread shows its signed line next to the price.
  assert.equal(rows.first().find('.os-book-cell').eq(0).find('small').text(),'+1.5');
  assert.equal(rows.first().find('.os-book-cell').eq(2).find('small').length,0);
  assert.equal(rows.last().find('.os-book-cell').eq(2).text(),'—');
  assert.ok(rows.last().find('.os-book-cell').eq(2).hasClass('is-missing'));
});

test('market tabs default to main markets and drive the market filter', t => {
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector:()=>null,querySelectorAll:()=>[]};
  t.after(()=>{if(originalDocument === undefined) delete globalThis.document;else globalThis.document=originalDocument;});
  const game = {player:'',displayEvent:'MIA @ WSH',line:''};
  const records = [
    quote({...game,id:'ml-a',type:'moneyline',market:'Moneyline',side:'MIA',odds:120}),quote({...game,id:'ml-h',type:'moneyline',market:'Moneyline',side:'WSH',odds:-140}),
    quote({...game,id:'t-o',type:'total',market:'Total runs',side:'Over',line:8.5,odds:-110}),quote({...game,id:'t-u',type:'total',market:'Total runs',side:'Under',line:8.5,odds:-110}),
    quote(),quote({id:'alt',type:'alternate',line:1.5,odds:300,displayMarket:'Hits · Alt'}),
  ];
  let redraws = 0;
  const saved = new Map(), storage = {getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const screen = createOddsScreen({storage,getQuotes:()=>records,brandMark:()=>'',redraw:()=>{redraws++;},onSport:()=>{}});
  let $ = load(screen.render({sport:'MLB'}));
  assert.deepEqual($('.os-tab').toArray().map(tab => $(tab).text()),['All markets','Main markets','Moneyline','Total runs','Player props','hits','Alternate lines']);
  assert.equal($('.os-tab[aria-pressed="true"]').text(),'Main markets');
  assert.equal($('#os-market option[selected]').attr('value'),'group:main');
  assert.deepEqual($('tbody tr.os-row [data-detail]').toArray().map(node => $(node).text()),['MIA','WSH','Over 8.5','Under 8.5']);
  assert.equal(screen.click(hit({osTab:'Moneyline'})),true);
  assert.equal(redraws,1);
  $ = load(screen.render({sport:'MLB'}));
  assert.equal($('.os-tab[aria-pressed="true"]').text(),'Moneyline');
  assert.equal($('tbody tr.os-row').length,2);
  screen.click(hit({osTab:'group:props'}));
  $ = load(screen.render({sport:'MLB'}));
  assert.deepEqual($('tbody tr.os-row [data-detail]').toArray().map(node => $(node).text()),['Player A Over 0.5']);
  screen.click(hit({osTab:'group:all'}));
  assert.equal(load(screen.render({sport:'MLB'}))('tbody tr.os-row').length,6);
  // An explicit "All markets" choice survives recreating the screen; reset returns to main markets.
  $ = load(createOddsScreen({storage,getQuotes:()=>records,brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'}));
  assert.equal($('.os-tab[aria-pressed="true"]').text(),'All markets');
  screen.click(hit({osAction:'reset'}));
  assert.equal(load(screen.render({sport:'MLB'}))('.os-tab[aria-pressed="true"]').text(),'Main markets');
});

test('stale live prices stay available in comparison without becoming actionable best-price rows', () => {
  const records = [quote({live:true,ts:new Date(Date.now()-120000).toISOString()})];
  const screen = createOddsScreen({getQuotes:()=>records,brandMark:()=>'',redraw:()=>{},onSport:()=>{}});
  const $ = load(screen.render({sport:'MLB'}));
  assert.equal($('tbody .os-best-cell strong').text(),'—');
  assert.equal($('tbody .os-average strong').text(),'—');
  assert.equal($('.os-row [data-detail],.os-row [data-suite-action],.os-row [data-open-quote]').length,0);
  assert.match($('tbody .os-best-cell').text(),/No current price/);
  assert.equal($('.os-book-cell.is-stale').length,1);
  assert.equal($('.os-book-cell.is-best').length,0);
  // Line history stays available for the stale quote.
  assert.equal($('.os-row [data-line-history]').attr('data-line-history'),'a');
});

test('suspended books never appear as current references on price rows', () => {
  const screen = createOddsScreen({getQuotes:()=>[quote(),quote({id:'closed-book',book:'FanDuel',odds:300,status:'suspended'})],brandMark:()=>'',redraw:()=>{},onSport:()=>{}});
  const $ = load(screen.render({sport:'MLB'}));
  assert.equal($('.os-row [data-detail]').attr('data-detail'),'a');
  assert.equal($('.os-row [data-suite-action="track"]').attr('data-id'),'a');
  assert.equal($('.os-book-cell.is-best').attr('data-open-quote'),'a');
  assert.equal($('.os-book-cell.is-locked').length,1);
  assert.equal($('.os-book-cell.is-locked').attr('data-open-quote'),undefined);
  assert.match($('.os-book-cell.is-locked').text(),/Suspended/);
});

test('the odds board labels feed and entered prices, never demo data', () => {
  const feed = load(createOddsScreen({getQuotes:()=>[quote({source:'local-api'})],brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'}));
  assert.match(feed('.os-board-meta').text(),/Feed prices/);
  const entered = load(createOddsScreen({getQuotes:()=>[quote({source:'manual'})],brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'MLB'}));
  assert.match(entered('.os-board-meta').text(),/Entered prices/);
  assert.doesNotMatch(entered.text(),/Demo mode|Simulated|Example data/);
});

test('periods never share an odds comparison and price-less suspensions replace older offers', () => {
  const board = buildOddsBoard([
    quote(), quote({id:'half',period:'first half',odds:300}),
    quote({id:'closed',status:'suspended',odds:null,ts:new Date(now+1000).toISOString()}),
  ],['DraftKings'],now);
  assert.equal(board[0].markets.length,2);
  assert.equal(board[0].markets[0].sides[0].best,undefined);
  assert.equal(board[0].markets[0].sides[0].prices[0].id,'closed');
  assert.equal(board[0].markets[1].sides[0].best.id,'half');
});

test('saved book order, selected books and odds format survive recreating the odds view', t => {
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector:()=>null,querySelectorAll:()=>[]};
  t.after(()=>{if(originalDocument === undefined) delete globalThis.document;else globalThis.document=originalDocument;});
  const saved = new Map(), storage = {getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const options = {storage,getQuotes:()=>[quote(),quote({book:'FanDuel'})],brandMark:()=>'',redraw:()=>{},onSport:()=>{}};
  const screen = createOddsScreen(options);
  screen.render();
  screen.click(hit({osOrder:'FanDuel',osDirection:'-1'}));
  screen.change({target:{dataset:{osBook:'DraftKings'},checked:false}});
  screen.change({target:{dataset:{osFilter:'format'},value:'american'}});
  const html = createOddsScreen(options).render();
  const $ = load(html);
  assert.deepEqual($('[data-os-book]').toArray().map(node=>$(node).attr('data-os-book')),['FanDuel','DraftKings']);
  assert.equal($('[data-os-book="DraftKings"]').attr('checked'),undefined);
  assert.equal($('#os-format option[selected]').attr('value'),'american');
  assert.equal($('.os-best-cell strong').text(),'+110');
});

test('unchanged odds snapshots update age without replacing the board', t => {
  const originalDocument=globalThis.document;
  globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],activeElement:null};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;});
  const record=quote();let renders=0;
  const screen=createOddsScreen({getQuotes:()=>[record],brandMark:()=>'',onSport:()=>{},redraw:()=>{renders++;}});
  screen.render();screen.refresh();
  record.ts=new Date().toISOString();screen.refresh();
  assert.equal(renders,0);
  record.odds=150;screen.refresh();assert.equal(renders,1);
  screen.render();record.status='suspended';screen.refresh();assert.equal(renders,2);
});

test('account odds default controls prices until the user saves an explicit display choice', () => {
  const options = { defaultFormat: 'american', getQuotes:()=>[quote()], brandMark:()=>'', redraw:()=>{}, onSport:()=>{} };
  const initial = load(createOddsScreen(options).render());
  assert.equal(initial('#os-format option[selected]').attr('value'), 'american');
  assert.equal(initial('.os-best-cell strong').text(), '+110');
  const storage = { getItem: () => '{"format":"decimal"}' };
  const saved = load(createOddsScreen({ ...options, storage }).render());
  assert.equal(saved('#os-format option[selected]').attr('value'), 'decimal');
  assert.equal(saved('.os-best-cell strong').text(), '2.10');
});
