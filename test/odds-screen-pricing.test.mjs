import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { buildOddsBoard, createOddsScreen } from '../public/odds-screen.js';
import { devig } from '../public/betting-math.js';
import { priced } from './helpers/priced.mjs';

// Prices are observed a minute before the real clock; games start tomorrow.
const now = Date.now(), ts = new Date(now - 60_000).toISOString(), start = new Date(now + 86_400_000).toISOString();
const game = {sport:'NFL',event:'Away @ Home',displayEvent:'Away @ Home',eventId:'NFL:away @ home',ts,startTime:start};
const moneyline = (book, side, odds, extra = {}) => ({...game,id:`${book}-${side}`,market:'moneyline',displayMarket:'Moneyline',marketId:'moneyline|NFL:away @ home',type:'moneyline',side,selection:side === 'home' ? 'Home' : 'Away',book,odds,...extra});
const pair = (book, home, away, extra) => [moneyline(book,'home',home,extra),moneyline(book,'away',away,extra)];
// The screen shows prices as /api/odds serves them, priced with the member's settings.
const screen = (quotes, options = {}) => {
  const served = priced(quotes, {settings:options.getSettings?.() || {}, now});
  return createOddsScreen({getQuotes:()=>served.quotes,getAnalytics:()=>served.analytics,now:()=>now,brandMark:()=>'',redraw:()=>{},onSport:()=>{},...options});
};
const board = (quotes, books) => { const served = priced(quotes, {now}); return buildOddsBoard(served.quotes, books, now, served.analytics); };
const rows = (quotes, options) => load(screen(quotes, options).render({sport:'NFL'}));
const implied = odds => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
const american = probability => { const d = 1 / probability; return d >= 2 ? `+${Math.round((d - 1) * 100)}` : String(Math.round(-100 / (d - 1))); };
// Rows list the away side first (away @ home).
const fairTitle = $ => $('tbody tr.os-row').last().find('.os-average').attr('title');

test('no-vig fair uses complete books, counts mirrors once and follows the member’s devig method', () => {
  const quotes = [...pair('DraftKings',-150,130), ...pair('BetRivers',-120,100,{priceFamily:'Kambi'}), ...pair('Desert Diamond Sports',-120,100,{priceFamily:'Kambi'}), moneyline('Fanatics','home',-300)];
  for (const method of ['multiplicative','additive']) {
    const expected = devig([implied(-150),implied(130)],method)[0];
    assert.match(fairTitle(rows(quotes,{getSettings:()=>({devigMethod:method})})), new RegExp(`no-vig fair ${american(expected).replace('+','\\+')}$`), method);
  }
});

test('a 1X2 market missing an outcome shows no fair price', () => {
  const threeWay = (book, side, odds) => ({...moneyline(book,side,odds),type:'three-way',outcomes:3,marketId:'three-way|NFL:away @ home',displayMarket:'Match result (1X2)'});
  const $ = rows([threeWay('Pinnacle','home',150),threeWay('Pinnacle','away',180),threeWay('BetRivers','home',160),threeWay('BetRivers','away',170)]);
  assert.equal($('tbody tr.os-row').length,2);
  assert.doesNotMatch($('tbody .os-average').toArray().map(cell => $(cell).attr('title')).join(' '),/no-vig fair/);
});

test('best odds skip an unverified one-sided price and a price far longer than the other books', () => {
  const prop = (book, side, odds, extra = {}) => ({...game,id:`${book}-${side}`,market:'Rec Yards',displayMarket:'Rec Yards',marketId:'prop|NFL:away @ home|receiving yards',type:'prop',player:'Pat Receiver',line:50.5,side,selection:side === 'over' ? 'Over' : 'Under',book,odds,...extra});
  const result = board([prop('Fanatics','over',200,{sideVerified:false}),prop('DraftKings','over',-110),prop('DraftKings','under',-110)],['Fanatics','DraftKings']);
  const over = result[0].markets[0].sides.find(row => row.side === 'over');
  assert.equal(over.best.book,'DraftKings');
  assert.equal(over.average,1 + 100 / 110,'the average skips it too');
  // With its own Under the unverified side is a real two-sided market again.
  const paired = board([prop('Fanatics','over',105,{sideVerified:false}),prop('Fanatics','under',-135,{sideVerified:false}),prop('DraftKings','over',-110)],['Fanatics','DraftKings']);
  assert.equal(paired[0].markets[0].sides.find(row => row.side === 'over').best.book,'Fanatics');
  // +300 (25%) against -110 / -105 (about 52%) is more than 10 points longer than the median.
  const outlier = board([moneyline('FanDuel','home',300),moneyline('DraftKings','home',-110),moneyline('Pinnacle','home',-105)],['FanDuel','DraftKings','Pinnacle']);
  assert.equal(outlier[0].markets[0].sides[0].best.book,'Pinnacle');
  const $ = rows([moneyline('FanDuel','home',300),moneyline('DraftKings','home',-110),moneyline('Pinnacle','home',-105)]);
  assert.equal($('.os-book-cell.is-best').attr('data-open-quote'),'Pinnacle-home');
  assert.equal($('.os-best-cell strong').text(),'-105');
  // A row whose only current price is excluded stays openable and says why there is no best price.
  const lone = rows([prop('Fanatics','over',200,{sideVerified:false})]);
  assert.equal(lone('.os-row').hasClass('is-stale'),false);
  assert.equal(lone('.os-row [data-detail]').attr('data-detail'),'Fanatics-over');
  assert.match(lone('.os-best-cell').text(),/No verified current price/);
});

test('current prices follow the member’s age settings, not EV availability rules', () => {
  const lineless = {...game,id:'td',market:'Anytime TDs',displayMarket:'Anytime TDs',marketId:'prop|NFL:away @ home|anytime touchdowns',type:'prop',player:'Pat Receiver',line:'',side:'yes',selection:'Yes',book:'Fanatics',odds:150};
  const exchange = {...moneyline('Novig','home',-105),exchange:true};
  let $ = rows([lineless, exchange]);
  assert.equal($('.os-book-cell.is-stale').length,0,'a prop without a line and an exchange price without depth are current');
  const old = {...moneyline('DraftKings','home',-110),ts:new Date(now - 20 * 60_000).toISOString()};
  $ = rows([old]);
  assert.equal($('.os-book-cell.is-stale').attr('title'),'DraftKings · Not currently offered');
  $ = rows([old],{getSettings:()=>({pregameMaxAgeSeconds:3600})});
  assert.equal($('.os-book-cell.is-stale').length,0,'the member allows hour-old pregame prices');
  $ = rows([{...old,live:true,ts:new Date(now - 60_000).toISOString()}],{getSettings:()=>({liveMaxAgeSeconds:30})});
  assert.equal($('.os-book-cell.is-stale').attr('title'),'DraftKings · stale live price');
});

test('games list live first, then by start time', () => {
  const at = hours => new Date(now + hours * 3600_000).toISOString();
  const event = (name, extra) => moneyline('DraftKings','home',-110,{event:name,displayEvent:name,eventId:name,id:name,...extra});
  const $ = rows([event('Late @ Game',{startTime:at(30)}),event('Live @ Game',{live:true,startTime:at(-1)}),event('Early @ Game',{startTime:at(3)})]);
  assert.deepEqual($('tbody.os-event-group .os-when small').toArray().map(node => $(node).text()),['Live @ Game','Early @ Game','Late @ Game']);
});

test('odds use the member’s format: +100 stays +100, decimals carry three places', t => {
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector:()=>null,querySelectorAll:()=>[]};
  t.after(()=>{if(originalDocument === undefined) delete globalThis.document;else globalThis.document=originalDocument;});
  const quotes = pair('DraftKings',100,-120), cells = $ => $('.os-book-cell b').toArray().map(node => $(node).text());
  assert.deepEqual(cells(rows(quotes)),['-120','+100']);
  assert.deepEqual(cells(rows(quotes,{getSettings:()=>({oddsFormat:'decimal'})})),['1.833','2.000']);
  assert.deepEqual(cells(rows(quotes,{getSettings:()=>({oddsFormat:'fractional'})})),['0.83/1','1.00/1']);
  // A format picked on this screen overrides the workspace setting.
  const values = new Map(), storage = {getItem:key => values.get(key),setItem:(key,value) => values.set(key,value)};
  const picked = screen(quotes,{storage,getSettings:()=>({oddsFormat:'decimal'})});
  picked.change({target:{dataset:{osFilter:'format'},value:'american'}});
  assert.deepEqual(cells(load(screen(quotes,{storage,getSettings:()=>({oddsFormat:'decimal'})}).render({sport:'NFL'}))),['-120','+100']);
});

test('props from books naming one stat differently share a row and a tab', () => {
  const prop = (book, displayMarket, side, odds) => ({...game,id:`${book}-${side}`,market:displayMarket,displayMarket,marketId:'prop|NFL:away @ home|receiving yards',type:'prop',player:'Pat Receiver',line:50.5,side,selection:side === 'over' ? 'Over' : 'Under',book,odds});
  const quotes = [prop('DraftKings','Rec Yards','over',-110),prop('DraftKings','Rec Yards','under',-110),prop('FanDuel','Receiving Yards','over',-105),prop('FanDuel','Receiving Yards','under',-115),prop('BetMGM','Rec Yards','over',-108)];
  const board = buildOddsBoard(quotes,['DraftKings','FanDuel','BetMGM'],now);
  assert.equal(board[0].markets.length,1);
  assert.deepEqual(board[0].markets[0].sides.find(row => row.side === 'over').prices.map(q => q.book).sort(),['BetMGM','DraftKings','FanDuel']);
  const $ = rows(quotes);
  assert.deepEqual($('.os-tab').toArray().map(tab => $(tab).text()),['All markets','Player props','Rec Yards']);
  assert.equal($('.os-tab').last().attr('data-os-tab'),'prop:receiving yards');
  assert.equal($('tbody tr.os-row').length,2);
});

test('the fair column is priced from every book, not only the books the member’s state or columns show', () => {
  const all = [...pair('DraftKings',-150,130), ...pair('BetMGM',-110,-110)];
  const shown = all.filter(quote => quote.book !== 'BetMGM');
  const home = book => devig(book === 'DraftKings' ? [implied(-150),implied(130)] : [implied(-110),implied(-110)],'multiplicative')[0];
  // The odds service prices from every book; the screen shows only the member's columns.
  const served = priced(all, {now});
  const $ = load(createOddsScreen({getQuotes:()=>served.quotes.filter(quote => quote.book !== 'BetMGM'),getAnalytics:()=>served.analytics,now:()=>now,brandMark:()=>'',redraw:()=>{},onSport:()=>{}}).render({sport:'NFL'}));
  assert.equal($('[data-os-book="BetMGM"]').length,0,'BetMGM is not a column');
  // The home side is listed last.
  assert.match(fairTitle($), new RegExp(`no-vig fair ${american((home('DraftKings') + home('BetMGM')) / 2).replace('+','\\+')}$`));
  // Priced from the shown books alone, they are the reference.
  assert.match(fairTitle(rows(shown)), new RegExp(`no-vig fair ${american(home('DraftKings')).replace('+','\\+')}$`));
});
