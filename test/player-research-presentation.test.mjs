import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';

// Only the module's initial browser-storage read needs a browser environment.
const priorLocation = globalThis.location;
globalThis.location = { search: '' };
const { projectionPanel, supportingStatsPanel, mountResearchWorkspace } = await import('../public/player-research.js');
if (priorLocation === undefined) delete globalThis.location; else globalThis.location = priorLocation;

const profile = overrides => ({ sport:'nfl', market:'rec_yds', label:'Receiving yards', unit:'yards', position:'WR', availability:{}, forecast:{ point:113.7, interval:[49,165], probability:{over:.67,under:.33} }, prop:{line:75.5,bookmaker:'Test book',basis:'pregame'}, ...overrides });

test('model boards remain boards unless an exact player deep link requests details', () => {
  const original=globalThis.location, host={}, players=[{key:'first'},{key:'requested'}], opened=[];
  try {
    for(const search of ['', '?researchPlayer=unknown']) {
      globalThis.location={search};
      mountResearchWorkspace(host,players,{open:p=>opened.push(p.key)});
    }
    assert.deepEqual(opened,[], 'Never select the first player automatically');
    globalThis.location={search:'?researchPlayer=requested'};
    mountResearchWorkspace(host,players,{open:p=>opened.push(p.key)});
    mountResearchWorkspace(host,players,{open:p=>opened.push(p.key)});
    assert.deepEqual(opened,['requested'], 'Filtering or refresh does not reopen a dismissed player');
  } finally {
    if(original===undefined)delete globalThis.location; else globalThis.location=original;
  }
});

test('research estimate keeps zero values distinct from missing values',()=>{
  const $=load(projectionPanel(profile({forecast:{point:0,interval:[0,1]},prop:{line:0,bookmaker:'Test book'}}),{probability:0}));
  assert.deepEqual($('.reference-model-table tbody tr').slice(0,3).find('td').map((_,e)=>$(e).text()).get(),['0','0','0%']);
  const unavailable=load(projectionPanel(profile({forecast:{point:null}})));
  assert.equal(unavailable('.reference-model-table').length,0);
  assert.match(unavailable.text(),/Projection unavailable/);
});

test('custom lines and stale quotes withhold probability even when an estimate was passed',()=>{
  for(const [p,options,reason] of [[profile(),{manual:true,probability:.67},/Custom line not priced/],[profile({prop:{line:75.5,bookmaker:'Test book',stale:true}}),{probability:.67},/Saved quote · odds withheld/]]) {
    const $=load(projectionPanel(p,options));
    assert.equal($('tr[data-model-stat=probability] td').text(),'—');
    assert.doesNotMatch($('.reference-model-table').text(),/67%/);
    assert.match($('tr[data-model-stat=probability] td').attr('title'),reason);
  }
});

test('unavailable model status does not expose a retained point or probability',()=>{
  const $=load(projectionPanel(profile({forecast:{status:'unavailable',point:113.7}}),{probability:.67}));
  assert.equal($('.reference-model-table').length,0);
  assert.doesNotMatch($.text(),/113\.7|67%/);
});

test('under estimates retain their side and ranges are not confidence intervals',()=>{
  const $=load(projectionPanel(profile(),{side:'under',probability:.33}));
  assert.equal($('tr[data-model-stat=probability] th').text(),'Model under');
  assert.equal($('tr[data-model-stat=probability] td').text(),'33%');
  assert.match($('tr[data-model-stat=probability] td').attr('title'),/below 75.5/);
  assert.match($('tr[data-model-stat=range]').text(),/49–165/);
  assert.doesNotMatch($.text(),/confidence interval/i);
});

test('touchdown presentation separates model strength from TD chance and workload estimate',()=>{
  const $=load(projectionPanel(profile({market:'any_td',label:'Anytime TD',raw:{modelScore:83.4,tdProb:.61,tdProbMethod:'historical-score-calibration'},forecast:{point:.7,probability:{over:.55}},prop:{line:.5,bookmaker:'Test book'}})));
  assert.equal($('tr[data-model-stat=projection] td').text(),'83.4%');
  assert.equal($('tr[data-model-stat=td-chance] td').text(),'61%');
  assert.equal($('tr[data-model-stat=workload] td').text(),'55%');
  assert.match($('tr[data-model-stat=projection] td').attr('title'),/0–100 relative ranking score/);
});

test('supporting stats preserve metric-specific missingness and average/median selection',()=>{
  const rows=[{stats:{targets:2,receiving_yards:0}},{stats:{targets:4,receiving_yards:null}},{stats:{targets:30,receiving_yards:10}}];
  const average=load(supportingStatsPanel(profile(),rows,'average',true)),median=load(supportingStatsPanel(profile(),rows,'median',true));
  const targets=$=>$('.pr-support > div').filter((_,e)=>$(e).find('dt').text()==='Targets');
  assert.equal(targets(average).find('dd').text(),'12');
  assert.equal(targets(median).find('dd').text(),'4');
  const yards=average('.pr-support > div').filter((_,e)=>average(e).find('dt').text()==='Rec. yards');
  assert.equal(yards.find('dd').text(),'5');
  assert.equal(yards.find('small').text(),'2 games');
  assert.match(average('.pr-explainer').text(),/Missing statistics are excluded/);
});
