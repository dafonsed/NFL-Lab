import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {load} from 'cheerio';
import * as core from '../public/ev-core.js';
import * as views from '../public/ev-secondary-views.js';
import {wagerCard} from '../public/ev-bet-card.js';
import {isArbitrageDemo} from '../public/arbitrage-demo.js';
import {smartMoneyDemoQuotes} from '../public/ev-demo.js';
import {boardIcon,bookLogo,startLabel,selectionText,renderBetPanel} from '../public/ev-board.js';
import {leagueMark,teamMark} from '../public/sports-identity.js';
import {constrainedArb,middleOutcomes} from '../public/ev-advanced-math.js';

const source = await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
const quote = (id, overrides={}) => ({id,sport:'NBA',event:'Home & Away',market:'Player points',player:'Ada <Example>',
  type:'prop',line:20.5,side:'Over',book:'DraftKings',odds:120,live:false,source:'example',ts:new Date().toISOString(),...overrides});

function render(name,quotes,extra={},args='') {
  const notice={dataset:{},textContent:''};
  const context=vm.createContext({...core,...views,wagerCard,isArbitrageDemo,smartMoneyDemoQuotes,boardIcon,bookLogo,startLabel,leagueMark,teamMark,selectionText,renderBetPanel,constrainedArb,middleOutcomes,
    suite:{quoteVisible:()=>true,settings:()=>({}),displayOdds:core.oddsLabel},sharpSort:'liquidity',sportsbookNames:[],
    EV_DEMO_MODE:false,preserveLiveOrder:false,state:{quotes},quotes:()=>quotes,eligibleQuotes:items=>items,hasApiSnapshot:()=>false,
    sportsbookSelected:()=>true,bookAvailable:()=>true,marketType:'',sport:'',bookmaker:'',search:'',
    designFilters:{minEdge:0},stake:100,flatMultiplier:1,bankroll:5000,expandedSharpKey:'',sharpSelectedBook:'',sharpFiltersOpen:false,
    esc:views.toolEsc,fmtLine:value=>views.toolEsc(value),age:()=> 'Just now',$:()=>notice,
    localStorage:{getItem:()=> '1000'},filterText:()=>true,
    brandMark:book=>`<span class="ev-brand-fallback">${views.toolEsc(book)}</span>`,
    button:(label,attrs='')=>`<button type="button" ${attrs}>${label}</button>`,action:()=>'',...extra});
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,`${name} is available`);
  // Arbitrage, Middles and Low holds share the paired-board helpers declared just above renderArb.
  vm.runInContext(source.slice(source.indexOf('// Paired opportunity boards'),source.indexOf('\nfunction renderArb(')),context);
  const detail=key=>load(vm.runInContext(`pairDetails.get(${JSON.stringify(key)})()`,context));
  return { $:load(vm.runInContext(source.slice(start,end)+`\n${name}(${args})`,context)),context,notice,detail };
}

test('arbitrage rows retain both quote actions, calculated stakes and demo provenance',()=>{
  const quotes=[quote('first'),quote('hedge',{side:'Under',book:'FanDuel',odds:-105})];
  const before=structuredClone(quotes);
  const {$,notice,detail,context}=render('renderArb',quotes,{},'false');
  const row=$('.evb-row[data-pair-row="first|hedge"]');
  assert.equal(row.length,1);
  assert.equal(row.find('.arb-leg-a .arb-odds strong').text(),'+120');
  assert.equal(row.find('.arb-leg-b .arb-odds strong').text(),'-105');
  assert.equal(row.find('.arb-leg-a [data-suite-action="link"]').attr('data-id'),'first');
  assert.equal(row.find('.arb-leg-b [data-suite-action="link"]').attr('data-id'),'hedge');
  assert.equal(row.find('[data-pair-open-both]').attr('data-pair-open-both'),'first|hedge');
  assert.equal(row.find('[data-pair-toggle]').attr('aria-expanded'),'false');
  assert.equal(row.children('td').length,4);
  const allocation=constrainedArb(quotes,5000),plan=constrainedArb(quotes,100*allocation.actualTotal/allocation.stakes[0]);
  assert.equal(row.find('.arb-pill').text(),(plan.margin*100).toFixed(2)+'%');
  assert.equal(row.find('.arb-leg-a .arb-stake strong').text(),core.money(plan.stakes[0]));
  assert.equal(row.find('.arb-leg-b .arb-stake strong').text(),core.money(plan.stakes[1]));
  assert.equal(row.find('.arb-leg-a .arb-profit strong').text(),core.money(plan.profits[0]));
  assert.equal(row.find('.arb-leg-b .arb-profit strong').text(),core.money(plan.profits[1]));
  assert.match(row.find('.arb-leg-a .arb-leg-link').text(),/Ada <Example> Over 20\.5/);
  assert.equal(row.find('example').length,0,'player text cannot become markup');
  assert.match($('.ev-arb-demo-note').text(),/1 match/);
  assert.match(notice.textContent,/simulated/);
  const open=detail('first|hedge');
  assert.match(vm.runInContext('pairDetails.get("first|hedge")()',context),/^<tr class="evb-detail-row evd-row" id="pair-detail-first\|hedge"><td colspan="4">/,'the panel spans every row cell');
  assert.deepEqual(open('.evd-grid td.is-best').map((_,el)=>open(el).text()).get(),['+120','-105'],'both chosen prices are highlighted');
  assert.equal(open('.evd-grid tr.is-selected th').text(),'Ada <Example> Over 20.5');
  assert.deepEqual(open('[data-arb-boost]').map((_,el)=>open(el).attr('data-leg')).get(),['0','1'],'one boost field per leg');
  assert.equal(open('.evd-tool[data-arb-calc]').attr('data-arb-calc'),'first');
  assert.equal(open('.evd-tool[data-arb-calc]').attr('data-arb-hedge'),'hedge');
  assert.equal(open('[data-arb-calc]').attr('data-suite-action'),undefined,'the calculator button reaches openArbCalculator');
  assert.equal(open('[data-suite-action="track-arb"]').attr('data-hedge'),'hedge');
  assert.equal(open('[data-suite-action="arb-promo"]').attr('data-hedge'),'hedge');
  assert.equal(open('[data-suite-action="pin-arb"]').attr('aria-pressed'),'false');
  assert.equal(open('[data-pair-swap]').attr('data-pair-swap'),'first|hedge');
  assert.match(open('.evd-note').text(),/lowest outcome/);
  const swapped=load(vm.runInContext('pairSwapped.add("first|hedge");arbRow("first|hedge")',context));
  assert.equal(swapped('.arb-leg-a .arb-odds strong').text(),'-105','swap lists the second leg first');
  assert.equal(swapped('.arb-leg-a .arb-stake strong').text(),core.money(plan.stakes[1]));
  assert.deepEqual(quotes,before);
});

test('middle rows keep unequal lines, both stakes and the possible one-side loss',()=>{
  const quotes=[quote('over',{type:'total',market:'Game total',player:'',line:43.5,odds:-110}),
    quote('under',{type:'total',market:'Game total',player:'',side:'Under',line:45.5,book:'FanDuel',odds:-110})];
  const {$,detail}=render('renderMiddles',quotes),row=$('.evb-row[data-pair-row="over|under"]'),plan=constrainedArb(quotes.map(q=>({odds:q.odds})),100);
  assert.equal(row.length,1);
  assert.equal(row.find('.pair-leg-a strong').text(),'Over 43.5');
  assert.equal(row.find('.pair-leg-b strong').text(),'Under 45.5');
  assert.equal(row.find('.pair-leg-a .pair-leg-note').text(),'Stake '+core.money(plan.stakes[0]));
  assert.equal(row.find('.pair-leg-b .pair-leg-note').text(),'Stake '+core.money(plan.stakes[1]));
  assert.equal(row.find('.pair-outside .is-negative').text(),core.money(middleOutcomes(...quotes,...plan.stakes,42).profit));
  assert.equal(row.find('.evb-ev strong').text(),core.money(middleOutcomes(...quotes,...plan.stakes,44.5).profit));
  assert.equal(row.find('[data-suite-action="middle"]').attr('data-hedge'),'under');
  assert.equal($('#ev-bankroll').attr('value'),'100','the stake control is retained');
  const open=detail('over|under');
  assert.deepEqual(open('.pair-ladder thead th').map((_,el)=>open(el).text()).get().slice(1),['42','43','44','45','46','47']);
  assert.equal(open('.pair-ladder td.is-best').length,2,'both bets win only strictly inside the window');
});

test('low-hold rows stay sorted by combined margin with both book prices inspectable',()=>{
  const quotes=[quote('expensive-a',{event:'Higher hold',odds:-110}),quote('expensive-b',{event:'Higher hold',side:'Under',book:'FanDuel',odds:-110}),
    quote('tight-a'),quote('tight-b',{side:'Under',book:'FanDuel',odds:-105})];
  const {$,detail}=render('renderHolds',quotes),rows=$('.evb-row[data-pair-row]');
  assert.equal(rows.length,2);
  assert.equal(rows.first().attr('data-wager-id'),'tight-a');
  assert.equal(rows.first().attr('data-pair-row'),'tight-a|tight-b');
  assert.equal(rows.first().find('.pair-leg-a .evb-price').text(),'+120');
  assert.equal(rows.first().find('.pair-leg-b .evb-price').text(),'-105');
  assert.match(detail('tight-a|tight-b')('.evb-stats').text(),/Below zero/);
  assert.doesNotMatch(rows.text(),/Stake/,'low holds do not invent stake recommendations');
});

test('Smart Money list preserves liquidity ranking and shows the selected opportunity in the detail panel',()=>{
  const family=(prefix,event,liquidity)=>[
    quote(prefix+'-exchange',{event,book:'Novig',odds:-110,exchange:true,liquidity,limit:750,source:'manual'}),
    quote(prefix+'-opposite',{event,side:'Under',book:'Novig',odds:-130,exchange:true,source:'manual'}),
    quote(prefix+'-book',{event,side:'Under',book:'FanDuel',odds:-110,exchange:false,source:'manual'})
  ];
  const quotes=[...family('low','Lower liquidity',5000),...family('high','Higher liquidity',10000)];
  const {$,context}=render('renderSharp',quotes,{expandedSharpKey:'low-exchange'});
  const items=$('[role="listbox"] .sm-item[role="option"]');
  assert.equal(items.length,2);
  assert.equal(items.first().attr('data-wager-id'),'high-exchange');
  assert.equal(items.first().find('.sm-item-liquidity strong').text(),'$10,000');
  assert.equal(items.first().find('.sm-item-liquidity small').text(),'$750 limit');
  assert.equal(items.first().find('.sm-item-market strong').text(),'Player Points');
  assert.equal(items.first().find('.sm-side.is-bet .sm-pill').text(),'-110');
  assert.equal(items.first().find('.sm-side.is-bet small').text(),'Compared -130');
  assert.equal(items.first().find('.sm-side:not(.is-bet) .sm-chip').text(),'$10.0k');
  assert.equal($('.sm-item[aria-selected="true"]').attr('data-sharp-select'),'low-exchange','the chosen opportunity is selected');
  assert.deepEqual(items.map((_,el)=>$(el).attr('tabindex')).get(),['-1','0'],'only the selected option is in the tab order');
  assert.equal(context.expandedSharpKey,'low-exchange');
  const panel=$('#sm-panel');
  assert.equal(panel.length,1,'one detail panel');
  assert.equal($('[role="listbox"] #sm-panel').length,0,'the panel sits beside the list, not inside it');
  assert.equal(panel.attr('style'),'--o:3','on phones the panel follows the selected item');
  assert.equal(panel.find('.sm-panel-liquidity strong').text(),'$5.0k');
  assert.equal(panel.find('.sm-bet .sm-pill').text(),'-110');
  assert.equal(panel.find('.sm-bet [data-suite-action="link"]').attr('data-id'),'low-book');
  assert.equal(panel.find('[data-line-history]').attr('data-line-history'),'low-book');
  assert.equal(panel.find('.sm-depth-row').length,1);
  assert.equal(panel.find('.sm-depth-track b').text(),'$5,000');
  assert.deepEqual(panel.find('.sm-books-table tbody th').map((_,el)=>$(el).text()).get(),['Average','Best','Exchange','FanDuel']);
  assert.equal(panel.find('.sm-books-table td.is-offer').text(),'-110');
  assert.equal(panel.find('.sm-exchange-row td').first().text(),'-130');
  assert.equal(panel.find('[data-suite-action="track"]').attr('data-id'),'low-book');
  assert.equal(panel.find('[data-suite-action="hide"]').attr('data-id'),'low-exchange');
  assert.equal(panel.find('[data-sharp-analysis]').attr('data-sharp-analysis'),'low-book');
  assert.match($('.evb-summary').text(),/Saved prices/);
  assert.doesNotMatch($('.sharp-workspace').text(),/Demo/);
  assert.equal($('button button').length,0,'list items and panel actions are separate accessible controls');
  const sorted=render('renderSharp',quotes,{sharpSort:'event'}).$;
  assert.equal(sorted('.sm-item').first().attr('data-wager-id'),'high-exchange');
  assert.equal(sorted('[data-sharp-sort="event"]').attr('aria-pressed'),'true');
  assert.equal(sorted('.sm-item[aria-selected="true"]').attr('data-wager-id'),'high-exchange','the first opportunity is selected by default');
});
