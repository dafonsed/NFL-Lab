import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, implied, probabilityToAmerican, fairProbability, evRows, fractionalKellyStake, arbitrageRows, arbitrage, middleRows, promoConversion, parlay, fantasySlip, closingLineValue, gradedBet, pearson, sharpMatches, alertMatches, validateWorkspace } from '../public/ev-core.js';
import { exampleWorkspace } from './fixtures/ev-demo.js';

test('market math calculates no-vig EV from other complete books', () => {
  const state = exampleWorkspace();
  const offer = state.quotes.find(q => q.book === 'DraftKings' && q.market === 'Game total' && q.line === 44.5 && q.side === 'Over');
  const group = state.quotes.filter(q => q.event === offer.event && q.market === offer.market && q.line === offer.line && !q.live);
  assert.equal(decimal(115), 2.15);
  assert.equal(implied(-110).toFixed(6), (110/210).toFixed(6));
  assert.ok(fairProbability(offer, group) > .49 && fairProbability(offer, group) < .51);
  assert.ok(evRows(state.quotes,false).some(x => x.quote.id === offer.id && x.ev > 0));
  assert.ok(evRows(state.quotes,false).some(x => x.quote.market === 'Point spread'));
  assert.ok(Number.isNaN(decimal(99)));
  // Even money is +100, as books quote it.
  assert.equal(probabilityToAmerican(.5),100);
  assert.equal(probabilityToAmerican(.4),150);
  const incompleteFuture = [{...offer,type:'future',side:'Arizona'},{...offer,id:'other',type:'future',side:'Seattle'}];
  assert.ok(Number.isNaN(fairProbability(incompleteFuture[0],incompleteFuture)));
  const threeWay = ['Home','Draw','Away'].flatMap((side,i) => ['Book A','Book B'].map(book => ({...offer,id:`${book}-${side}`,event:'Example soccer',type:'three-way',side,book,odds:[180,220,160][i]})));
  assert.ok(Number.isFinite(fairProbability(threeWay[0],threeWay)));
});

test('fractional Kelly stake uses the displayed fair probability and caps losses at zero', () => {
  // A +100 offer at a 60% fair probability has a 20% full Kelly fraction.
  assert.ok(Math.abs(fractionalKellyStake(5000,.25,.6,100)-250) < 1e-8);
  assert.equal(fractionalKellyStake(5000,.25,.4,100),0);
  assert.ok(Number.isNaN(fractionalKellyStake(5000,.25,NaN,100)));
  assert.ok(Number.isNaN(fractionalKellyStake(5000,1.2,.6,100)));
});

test('arbitrage requires different books and equalizes stakes', () => {
  const state = exampleWorkspace();
  const row = arbitrageRows(state.quotes,false).find(x => x.best[0].market === 'Game total');
  assert.ok(row);
  assert.notEqual(row.best[0].book,row.best[1].book);
  const plan = arbitrage(row.best,100);
  assert.ok(plan.profit > 0);
  assert.ok(Math.abs(plan.stakes[0] + plan.stakes[1] - 100) < .0001);
  assert.ok(Math.abs(plan.stakes[0] * decimal(row.best[0].odds) - plan.stakes[1] * decimal(row.best[1].odds)) < .0001);
  const sameBook = [{...row.best[0],book:'Only'}, {...row.best[1],book:'Only'}];
  assert.equal(arbitrageRows(sameBook,false).length,0);
});

test('live math drops expired quotes and totals identify a middle', () => {
  const state = exampleWorkspace();
  assert.ok(evRows(state.quotes,true).length);
  const expired = state.quotes.map(q => q.live ? {...q,ts:new Date(Date.now()-120_000).toISOString()} : q);
  assert.equal(evRows(expired,true).length,0);
  assert.ok(middleRows(state.quotes,false).some(x => x.over.line < x.under.line));
  assert.ok(middleRows(state.quotes,false).some(x => x.kind === 'spread' && x.width > 0));
});

test('bonus conversion, fantasy paytable and CLV use stated payout rules', () => {
  const promo = promoConversion({stake:100,promoOdds:200,hedgeOdds:-110,kind:'bonus',boost:0});
  assert.ok(Math.abs(promo.ifPromoWins-promo.ifHedgeWins) < .0001);
  const slip = fantasySlip([{probability:.5},{probability:.5}],[0,0,3],10);
  assert.deepEqual(slip.dist,[.25,.5,.25]);
  assert.equal(slip.expectedProfit,-2.5);
  assert.ok(closingLineValue(115,105) > 0);
  assert.equal(gradedBet({stake:10,odds:150,result:'win'}),15);
  assert.equal(pearson([[1,2],[2,4],[3,6]]),1);
  assert.equal(parlay([{event:'one',odds:110,probability:.5}]),null);
  assert.ok(parlay([{event:'one',odds:110,probability:.5},{event:'two',odds:110,probability:.5}]));
});

test('movement alerts identify a new line snapshot', () => {
  const quote = {id:'q',sport:'NFL',event:'A vs B',market:'Total',side:'Over',book:'Book A',odds:-110,line:44.5,live:false,ts:new Date().toISOString()};
  const state = {quotes:[quote],history:[{id:'h1',quoteId:'q',line:44.5},{id:'h2',quoteId:'q',line:45.5}],dfs:[]};
  assert.deepEqual(alertMatches({kind:'movement',event:'',market:'',threshold:1,liveOnly:false},state),[{id:'h2',label:'Over 44.5 -110 · Total · A vs B at Book A · line 44.5 → 45.5'}]);
  // A price that is no longer current doesn't alert.
  assert.deepEqual(alertMatches({kind:'movement',event:'',market:'',threshold:1,liveOnly:false},{...state,quotes:[{...quote,ts:new Date(Date.now()-3_600_000).toISOString()}]}),[]);
});

test('EV alerts price from every book; only the matched price must be at an offered book', () => {
  const ts = new Date().toISOString();
  const line = (book, side, odds) => ({id:`${book}-${side}`,sport:'NFL',event:'A @ B',eventId:'NFL:a @ b',market:'moneyline',marketId:'moneyline|NFL:a @ b',type:'moneyline',side,book,odds,live:false,ts});
  const quotes = [line('Pinnacle','away',-110),line('Pinnacle','home',-110),line('DraftKings','away',-110),line('DraftKings','home',-110),line('BetMGM','away',120),line('BetMGM','home',-130),line('FanDuel','away',120),line('FanDuel','home',-130)];
  const rule = {kind:'ev',threshold:5};
  const books = matches => matches.map(match => match.id.split('-')[0]).sort();
  assert.deepEqual(books(alertMatches(rule,{quotes})),['BetMGM','FanDuel']);
  // A member whose state has BetMGM only: Pinnacle and DraftKings still set the fair price.
  assert.deepEqual(books(alertMatches(rule,{quotes},{offered:q => q.book === 'BetMGM'})),['BetMGM']);
  // Removing the reference books first (the old behavior) would leave BetMGM with no fair price.
  assert.deepEqual(alertMatches(rule,{quotes:quotes.filter(q => q.book === 'BetMGM')}),[]);
});

test('sharp screen returns only the best sportsbook price that improves on the exchange', () => {
  const matches = sharpMatches(exampleWorkspace().quotes,1000);
  const prop = matches.find(x => x.exchange.market === 'Kyler Murray passing yards' && x.exchange.side === 'Over');
  assert.equal(prop.sportsbook.book,'bet365');
  assert.ok(prop.improvement > 0);
  assert.ok(matches.every(x => !x.opposite || decimal(x.sportsbook.odds) > decimal(x.opposite.odds)));
});

test('workspace import accepts the exported schema and rejects malformed prices', () => {
  const data = exampleWorkspace();
  assert.equal(validateWorkspace(data),true);
  assert.throws(() => validateWorkspace({...data,quotes:[{...data.quotes[0],odds:0}]}),/quotes record 1/);
  assert.throws(() => validateWorkspace({...data,dfs:[{...data.dfs[0],probability:1.4}]}),/dfs record 1/);
});
