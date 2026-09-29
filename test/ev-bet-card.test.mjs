import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {wagerCard} from '../public/ev-bet-card.js';

test('opportunity card escapes data in text, identifiers and attributes',()=>{
  const hostile='\"><img src=x onerror=alert(1)><script>alert(2)</script> & \'quoted\'';
  const $=load(wagerCard({id:hostile,className:hostile,metric:hostile,metricLabel:hostile,
    market:hostile,selection:hostile,book:hostile,odds:hostile,event:hostile,sport:hostile,time:hostile,
    reference:{book:hostile,odds:hostile,label:hostile},facts:[{label:hostile,value:hostile}],
    detailAttrs:'data-detail="safe-id"'}));
  assert.equal($('script,[onerror],img[src=x]').length,0);
  assert.equal($('.wager-card').attr('data-wager-id'),hostile);
  for(const selector of ['.wager-metric strong','.wager-metric small','.wager-market','.wager-selection','.wager-quote strong','.wager-event','.wager-reference small','.wager-reference strong','.wager-facts dt','.wager-facts dd']) {
    assert.equal($(selector).text(),hostile,selector);
  }
  assert.equal($('.wager-reference').attr('title'),hostile);
  assert.equal($('.wager-quote').attr('data-detail'),'safe-id');
  assert.ok($('.wager-quote').attr('aria-label').includes(hostile));
});

test('missing prices remain absent or unavailable instead of becoming fabricated odds',()=>{
  for(const odds of [undefined,null,NaN,Infinity,-Infinity]) {
    const $=load(wagerCard({book:'FanDuel',odds,selection:'Under 3.5',reference:{book:'DraftKings',label:'Opposing selection'}}));
    assert.equal($('.wager-quote strong').text(),'—');
    assert.equal($('.wager-reference strong').length,0);
    assert.equal($('.wager-quote').is('button'),false,'a noninteractive price is not a dead button');
  }
  const $=load(wagerCard({market:'Fantasy pick',selection:'Over 20.5',reference:{}}));
  assert.equal($('.wager-quote,.wager-reference').length,0);
  assert.equal($('.wager-selection').text(),'Over 20.5');
});

test('provided American and display prices retain their meaning',()=>{
  for(const [odds,expected] of [[115,'+115'],[-110,'-110'],['DFS pick','DFS pick'],['42¢','42¢']]) {
    const $=load(wagerCard({book:'FanDuel',odds,reference:{odds},detailAttrs:'data-detail="quote-id"'}));
    assert.equal($('.wager-quote strong').text(),expected);
    assert.equal($('.wager-reference strong').text(),expected);
    assert.equal($('button[data-detail="quote-id"]').length,2);
  }
});
