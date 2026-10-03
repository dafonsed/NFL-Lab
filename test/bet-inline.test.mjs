import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {inlineBetCard,bindInlineComparison} from '../public/bet-inline.js';

const fixture=()=>({id:'line-1',market:'Passing yards',sport:'NFL',event:'ARI @ SEA',time:'Sun 1:05 PM',selection:'Player <One> Over 249.5',book:'FanDuel',fairMark:'',fairOdds:'-108',fairLabel:'Fair value · consensus',probability:'51.9%',probabilityLabel:'True probability',rawOdds:-110,canSwap:true,canTrack:true,canEdit:true,
  columns:[{name:'FanDuel',line:'249.5',difference:'+1.5',odds:'-110 / -105'},{name:'DraftKings',line:'248',odds:'-115 / +100'}],
  rows:[{side:'Over',selection:'Over 249.5',prices:[{value:'-110'},{value:'-115'}]},{side:'Under',selection:'Under 249.5',prices:[{value:'-105'},{value:'+100'}]}]});




test('nonstandalone comparisons delegate to the expanded panel with actionable book histories',()=>{
  const model=fixture(),$=load(inlineBetCard(model));
  assert.equal($('.bet-expanded-card').length,1);
  assert.equal($('.ev-reference-card').length,0);
  assert.equal($('[data-inline-collapse]').length,1);
  assert.deepEqual($('tbody th').map((_,el)=>$(el).text()).get(),['Line','Odds']);
  assert.equal($('[data-book-history="FanDuel"]').text(),'-110 / -105');
  for(const action of ['table','chart','movement','hide','track','pin','flag','refresh'])assert.equal($(`[data-comparison-action="${action}"]`).length,1,action);
});

