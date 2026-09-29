import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {inlineBetCard,bindInlineComparison} from '../public/bet-inline.js';

const fixture=()=>({id:'line-1',market:'Passing yards',sport:'NFL',event:'ARI @ SEA',time:'Sun 1:05 PM',selection:'Player <One> Over 249.5',book:'FanDuel',fairMark:'',fairOdds:'-108',fairLabel:'Fair value · consensus',probability:'51.9%',probabilityLabel:'True probability',rawOdds:-110,canSwap:true,canTrack:true,canEdit:true,
  columns:[{name:'FanDuel',line:'249.5',difference:'+1.5',odds:'-110 / -105'},{name:'DraftKings',line:'248',odds:'-115 / +100'}],
  rows:[{side:'Over',selection:'Over 249.5',prices:[{value:'-110'},{value:'-115'}]},{side:'Under',selection:'Under 249.5',prices:[{value:'-105'},{value:'+100'}]}]});

test('standalone reference cards show the supplied matrix without relabeling consensus as a book price',()=>{
  const model={...fixture(),standalone:true,inlineHistory:true,metrics:[{label:'FanDuel odds',value:'-110'},{label:'EV',value:'+3.1%'}],
    referenceRows:[{selection:'Line',prices:[{value:'249.5',difference:'+1.5'},{value:'248'}]},{selection:'Odds',prices:[{value:'-110 / -105'},{value:'-115 / +100'}]}],
    extraActions:'<button type="button" class="bet-inline-icon" data-parlay="line-1" aria-label="Add to parlay">+</button>'};
  const before=structuredClone(model),$=load(inlineBetCard(model));
  assert.equal($('.ev-selection-card.ev-reference-card').attr('data-wager-id'),'line-1');
  assert.equal($('[data-inline-collapse]').length,0);
  assert.equal($('.bet-inline-fair img').length,0,'explicit empty mark means unbranded consensus');
  assert.equal($('.bet-inline-fair strong').text(),'-108');
  assert.deepEqual($('tbody th').map((_,el)=>$(el).text()).get(),['Line','Odds']);
  assert.equal($('tbody tr').first().find('.bet-inline-price em').text(),'+1.5');
  assert.equal($('tbody tr').last().find('.bet-inline-price strong').first().text(),'-110 / -105');
  assert.equal($('.bet-inline-metrics dd').first().text(),'-110');
  assert.equal($('[data-parlay="line-1"]').length,1);
  assert.equal($('.bet-comparison-history').prop('hidden'),true);
  assert.equal($('[data-comparison-action="table"]').attr('aria-pressed'),'true');
  assert.equal($('[data-comparison-action="chart"]').attr('aria-pressed'),'false');
  assert.equal($('.bet-inline-summary>[data-comparison-action="pin"]').length,1);
  assert.equal($('.bet-inline-selection strong').text(),'Player <One> Over 249.5');
  assert.equal($('one').length,0);
  assert.equal($('.bet-inline-event .team-mark img').length,2);
  assert.equal($('.bet-inline-league img').attr('src'),'/assets/leagues/nfl.png');
  assert.equal($('button button').length,0);
  assert.deepEqual(model,before,'rendering leaves model and history rows unchanged');
});

test('reference cards accept side prices with their labels and side-specific history actions',()=>{
  const model={...fixture(),standalone:true},$=load(inlineBetCard(model));
  assert.equal($('[data-inline-collapse]').length,0);
  assert.deepEqual($('tbody th').map((_,el)=>$(el).text()).get(),['Over 249.5','Under 249.5']);
  assert.equal($('tbody [data-book-history="FanDuel"][data-history-side="Under"]').length,1);
  assert.equal($('.bet-inline-tools [data-comparison-action="calculator"]:disabled').length,0);
  assert.equal($('.bet-inline-tools [data-comparison-action="track"]:disabled').length,0);
  for(const action of ['swap','table','chart','hide','track','flag','refresh','edit'])assert.equal($(`.bet-inline-tools [data-comparison-action="${action}"]`).length,1,action);
  assert.equal($('.bet-comparison-history').length,0);
});

test('fallback matrix preserves missing values, line differences and full event names',()=>{
  const model={...fixture(),standalone:true,rows:undefined,event:'Arizona Cardinals at Seattle Seahawks'};
  model.columns[1].odds=undefined;
  const $=load(inlineBetCard(model));
  assert.equal($('.bet-inline-event').text(),model.event);
  assert.equal($('.bet-inline-event .team-mark').length,0);
  assert.equal($('tbody tr').first().find('em').text(),'+1.5');
  assert.equal($('tbody tr').last().find('strong').last().text(),'—');
});

test('nonstandalone comparisons delegate to the expanded panel with actionable book histories',()=>{
  const model=fixture(),$=load(inlineBetCard(model));
  assert.equal($('.bet-expanded-card').length,1);
  assert.equal($('.ev-reference-card').length,0);
  assert.equal($('[data-inline-collapse]').length,1);
  assert.deepEqual($('tbody th').map((_,el)=>$(el).text()).get(),['Line','Odds']);
  assert.equal($('[data-book-history="FanDuel"]').text(),'-110 / -105');
  for(const action of ['table','chart','movement','hide','track','pin','flag','refresh'])assert.equal($(`[data-comparison-action="${action}"]`).length,1,action);
});

test('standalone bind does not attach collapse listeners to the reused mount',()=>{
  const listeners=[],root={querySelector:()=>null,addEventListener:(type,callback)=>listeners.push([type,callback])};
  bindInlineComparison(root,{standalone:true});
  bindInlineComparison(root,{standalone:true});
  assert.equal(listeners.length,0);
});
