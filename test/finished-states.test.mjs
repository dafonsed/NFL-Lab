import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {finalPlayerHtml,gameOddsHtml} from '../public/live-game.js';
import {marketLabel,modelLabel} from '../public/presentation.js';

test('final player records preserve missing versus zero and escape source labels',()=>{
  const player={id:'1',name:'Player <name>'};
  const zero=load(finalPlayerHtml(player,{current:0,reasons:['Final & confirmed']},'Points','TEAM · G'));
  assert.equal(zero('.live-final-value strong').text(),'0.0');
  assert.equal(zero('h3').text(),'Player <name>');
  assert.equal(zero('input,form').length,0);
  assert.match(zero('.live-final-source').text(),/Final & confirmed/);
  const missing=load(finalPlayerHtml(player,{current:null},'Points'));
  assert.equal(missing('.live-final-value strong').text(),'—');
});

test('withheld live odds retain every book price without empty model columns',()=>{
 const data={game:{state:'post'},gameModel:{status:'withheld',reasons:['Game finished.']},odds:{books:[{name:'Example',markets:[{key:'moneyline',label:'Moneyline',selections:[{label:'Away',side:'away',line:null,odds:110},{label:'Home',side:'home',line:null,odds:-130}]},{key:'total',label:'Total',selections:[{label:'Over',side:'over',line:8.5,odds:-110},{label:'Under',side:'under',line:8.5,odds:-110}]}]}]}};
 const $=load(gameOddsHtml(data));
 assert.equal($('.odds-market-block').length,2);assert.equal($('tbody tr').length,4);
 assert.deepEqual($('.book-price').map((_,el)=>$(el).text()).get(),['+110','-130','-110','-110']);
 for(const table of $('table').toArray())assert.equal($(table).find('thead th').length,2);
 assert.match($('#game-model-paused').text(),/Game finished/);
 assert.equal($('.odds-market-block').last().find('tbody th').first().text(),'Over8.5');assert.equal($('[data-game-comparison]').length,0);
});

test('archive labels name the market and keep model version identifiers separate',()=>{
 assert.equal(marketLabel('rec_yds'),'Receiving yards');assert.equal(marketLabel('new_stat'),'New stat');
 assert.equal(modelLabel('workload-context-v2'),'Workload + context');
 assert.equal(modelLabel('workload-opportunities-v4'),'Workload + opportunities');
});
