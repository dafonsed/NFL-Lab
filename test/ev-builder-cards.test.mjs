import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {load} from 'cheerio';
import * as core from '../public/ev-core.js';
import * as views from '../public/ev-secondary-views.js';
import {wagerCard} from '../public/ev-bet-card.js';
import {canonicalPlatform, isContestPlatform, PREDICTION_PLATFORMS} from '../public/platform-catalog.js';
import {TOOL_FILTER_DEFAULTS, oddsWithin} from '../public/ev-filters.js';
import {withStandardPaytables, paytableSource, breakEven, standardPayout, payoutFactor, payoutKnown} from '../public/dfs-workspace.js';
import {selectionText, startLabel} from '../public/ev-board.js';
import {computeAdvancedEv, evCapFor, suiteSettings} from '../public/ev-advanced-math.js';

const source=await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
const quote=(id,extra={})=>({id,sport:'NBA',event:'BOS vs NYK',player:'Player <One>',market:'Points',type:'prop',side:'Over',line:20.5,book:'FanDuel',odds:120,ts:'2026-09-25T10:00:00Z',...extra});
const pick=(id,extra={})=>({id,app:'PrizePicks',sport:'NBA',event:'BOS vs NYK',player:'Player '+id,market:'Points',side:'Over',line:20.5,probability:.6,...extra});

function render(name,extra={}) {
  const start=source.indexOf(`function ${name}()`),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start);
  const context=vm.createContext({...core,...views,wagerCard,canonicalPlatform,isContestPlatform,PREDICTION_PLATFORMS,
    esc:views.toolEsc,fmtLine:String,age:()=> 'Recorded',visible:()=>true,bookAvailable:()=>true,eligibleQuotes:rows=>rows,
    qName:q=>q.player+' '+q.side+' '+q.line,origin:()=>'<span class="ev-status">Manual</span>',
    table:(head,rows)=>`<table><thead><tr>${head.map(text=>`<th>${views.toolEsc(text)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
    button:(label,attrs='')=>`<button type="button" ${attrs}>${label}</button>`,action:()=>'',
    toolFilters:{...TOOL_FILTER_DEFAULTS},oddsWithin,filteredEmpty:fallback=>fallback,sportsbookSelected:()=>true,sport:'',ARB_SANITY_LIMIT:.15,feedContracts:[],optimizerVisibleCount:40,startLabel,slipNotice:'',
    breakEven,standardPayout,payoutFactor,payoutKnown,selectionText,computeAdvancedEv,evCapFor,suite:{settings:()=>({devigMethod:'multiplicative'})},...extra});
  // Parlay computes fair odds from every quote for the sport (quoteSource), not only the listed ones.
  context.quoteSource ??= () => context.state?.quotes ?? context.quotes?.() ?? [];
  // Standard payouts layer under saved tables (public/dfs-workspace.js).
  context.apiPaytables ??= {};
  context.paytables ??= () => withStandardPaytables(context.state?.paytables, context.apiPaytables);
  context.paytableSource ??= paytableSource;
  const $=load(vm.runInContext(source.slice(start,end)+`\n${name}()`,context));
  assert.equal($('.wager-card button button').length,0,'actions are separate controls');
  return {$,context};
}

test('promotion cards keep the selected price and opposing hedge connected to the calculator',()=>{
  const a=quote('promo-a'),b=quote('hedge-b',{side:'Under',book:'DraftKings',odds:-110});
  // Each book prices both sides, as real books do (one-sided prices never pair).
  const others=[quote('promo-a-under',{side:'Under',odds:-150}),quote('hedge-b-over',{book:'DraftKings',odds:-110})];
  const {$}=render('renderPromo',{quotes:()=>[a,b,...others],fresh:()=>true,promoInput:{kind:'bonus',stake:100,promoOdds:150,hedgeOdds:-130,boost:50}});
  const card=$('.evc-promo .evc-card[data-wager-id="promo-promo-a"]');
  const plan=core.promoConversion({kind:'bonus',stake:100,promoOdds:120,hedgeOdds:-110,boost:0});
  assert.equal(card.find('.evc-metric strong').text(),core.percent(plan.conversion),'pairs are scored at the current promotion settings');
  assert.equal(card.find('.evc-side:not(.is-hedge) .evb-price').text(),'+120');
  assert.equal(card.find('.evc-side.is-hedge .evb-price').text(),'-110');
  assert.equal(card.find('.evc-side.is-hedge small').text(),'Stake '+core.money(plan.hedge));
  assert.equal(card.attr('data-open-quote'),'promo-a');
  assert.equal(card.find('.evb-toggle').attr('data-detail'),'promo-a');
  assert.equal(card.find('[data-promo-pair]').attr('data-hedge'),'hedge-b');
  assert.equal(card.find('.evc-side:not(.is-hedge) .evc-side-main strong').text(),'Player <One> Over 20.5');
  assert.equal(card.find('one').length,0,'player names remain text');
});

test('parlay leg cards retain selection state and the actual offered price',()=>{
  const a=quote('a'),b=quote('b',{event:'NYK vs DEN',player:'Player Two'});
  const {$}=render('renderParlay',{state:{quotes:[a,b]},quotes:()=>[a,b],parlayIds:['a'],parlayVisibleCount:40,
    computeAdvancedEv:()=>[{quote:a,fair:.55,ev:.21,consensus:{books:[{},{}]}},{quote:b,fair:.5,ev:.1,consensus:{books:[{},{}]}}]});
  const card=$('.evc-parlay .evc-card[data-wager-id="parlay-a"]');
  assert.equal(card.find('.evc-pick .evb-price').text(),'+120');
  assert.equal($('.evc-board [data-parlay="a"]').attr('aria-pressed'),'true');
  assert.equal($('.evc-board [data-parlay="b"]').attr('aria-pressed'),'false');
  assert.equal(card.find('.evc-meter b').text(),'55.0%');
  assert.ok(card.hasClass('is-pinned'),'legs in the ticket stay highlighted');
  assert.equal($('[data-parlay-remove="a"]').length,1,'selected ticket remains editable');
});

test('parlay legs get a fair chance whatever their EV; the Leg EV filter decides which are listed',()=>{
  const ts=new Date().toISOString();
  // Two games, each priced at FanDuel and DraftKings.
  const side=(game,book,s,odds)=>quote(`${book}-${s}${game}`,{book,side:s,odds,ts,event:game?'NYK vs DEN':'BOS vs NYK',eventId:game?'NBA:nyk vs den':'NBA:bos vs nyk',player:game?'Player Two':'Player One'});
  const market=game=>[side(game,'FanDuel','Over',-130),side(game,'FanDuel','Under',100),side(game,'DraftKings','Over',-110),side(game,'DraftKings','Under',-110)];
  const quotes=[...market(''),...market('2')];
  const settings=suiteSettings({});
  // One FanDuel ticket: a -11.5% leg and a 0% leg from different games.
  const listed=legEv=>render('renderParlay',{state:{quotes},quotes:()=>quotes,parlayIds:['FanDuel-Over','FanDuel-Under2'],parlayVisibleCount:40,
    toolFilters:{...TOOL_FILTER_DEFAULTS,legEv},suite:{settings:()=>settings}}).$;
  // FanDuel's Over at -130 is about -11.5% EV against DraftKings' even market: listed under "Any", not "Positive".
  const any=listed('');
  assert.equal(any('.evc-board [data-parlay="FanDuel-Over"]').length,1);
  assert.equal(listed('0')('.evc-board [data-parlay="FanDuel-Over"]').length,0);
  // Both legs in the ticket carry a fair chance, so the parlay prices.
  assert.doesNotMatch(any('#ev-parlay-ticket').text(),/Fair —|NaN/);
  assert.match(any('.ev-parlay-summary').text(),/decimal/);
});

test('optimizer cards pair only legs above break-even, keep payout rules and both pick IDs',()=>{
  const rows=[pick('a',{probability:.65}),pick('b',{probability:.6}),pick('c',{probability:.5})];
  const state={dfs:rows,paytables:{PrizePicks:{2:[0,0,3]}}};
  const {$}=render('renderOptimizer',{state,dfs:()=>rows});
  const best=$('.evc-optimizer .evc-card').first();
  assert.equal(best.attr('data-wager-id'),'optimizer-a-b');
  assert.equal(best.find('[data-optimize]').attr('data-optimize'),'a,b');
  assert.equal(best.find('.evc-stat strong').text(),'3×');
  assert.equal(best.find('.evc-stat small').text(),'Full-hit payout');
  assert.equal(best.find('.evc-metric strong').text(),core.signed(core.fantasySlip(rows.slice(0,2),[0,0,3]).ev));
  assert.equal(best.find('.evc-ring strong').text(),'39.0%');
  assert.equal(best.find('.evc-combo-pick').length,2,'both picks are shown');
  // 2-pick 3× break-even is √(1/3) = 57.74%: c (50%) has a negative edge and does not qualify.
  assert.equal($('.evc-optimizer .evc-card').length,1);
  assert.equal($('[data-optimize*="c"]').length,0);
});

test('slip pick cards pair each line\'s Over and Under and keep edit and select actions distinct',()=>{
  const rows=[pick('a'),pick('b',{player:'Player a',side:'Under',probability:.4}),pick('c',{player:'Player Two',probability:.55})];
  const {$,context}=render('renderSlip',{state:{dfs:rows,paytables:{PrizePicks:{2:[0,0,3]}}},dfs:()=>rows,
    fantasyApp:'PrizePicks',fantasyIds:['a'],fantasyStake:10,slipVisibleCount:40});
  assert.equal($('.evc-slip .evc-card').length,2,'one card per player line');
  const first=$('.evc-slip .evc-card[data-wager-id="slip-a"]');
  assert.equal(first.find('.evc-slip-line strong').text(),'20.5','the line is shown; no sportsbook price is invented');
  assert.equal(first.find('.evc-side-pick').length,2);
  assert.equal(first.find('[data-fantasy="a"]').attr('aria-pressed'),'true');
  assert.equal(first.find('[data-fantasy="a"] b').text(),'60.0%');
  assert.equal(first.find('[data-fantasy="b"]').attr('aria-pressed'),'false');
  assert.equal(first.find('[data-fantasy="b"] b').text(),'40.0%');
  assert.match(first.find('.evc-slip-note').text(),/Estimated/,'hit rates are labelled as estimates');
  assert.equal(first.find('[data-edit="dfs"]').attr('data-id'),'a');
  assert.equal(first.attr('data-open-dfs'),'a');
  assert.ok($('.evc-slip .evc-card[data-wager-id="slip-c"] .evc-slip-sides').hasClass('is-single'));
  assert.deepEqual(Array.from(context.fantasyIds),['a']);
});

test('prediction cards retain cents, depth and contract actions while history stays a table',()=>{
  const contract={id:'contract-a',platform:'Kalshi',event:'Team <One> wins',sport:'NBA',bid:44,ask:48,volume:1500,ts:'2026-09-25T10:00:00Z'};
  const state={contracts:[contract],traders:[],trades:[],contractHistory:[{...contract,contractId:contract.id}]};
  const {$}=render('renderPrediction',{state,predictionPlatform:'',traderName:''});
  const card=$('.evc-prediction .evc-card[data-wager-id="contract-contract-a"]');
  assert.equal(card.find('.evc-metric strong').text(),'4¢');
  assert.equal(card.find('.evc-quotes .is-ask strong').text(),'48¢');
  assert.equal(card.find('.evc-quotes .is-bid strong').text(),'44¢');
  assert.equal(card.find('.evc-stat strong').text(),'1,500');
  assert.equal(card.find('[data-edit="contract"]').attr('data-id'),'contract-a');
  assert.equal(card.find('.evc-event strong').text(),'Team <One> wins');
  assert.equal($('table tbody tr').length,1,'recorded order-book history stays tabular');
});

