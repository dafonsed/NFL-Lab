import test from 'node:test';
import assert from 'node:assert/strict';
import { breakEven, comparisonPlatforms, selectedComparisonPlatforms, sportsbookOffer, createDfsWorkspace, DFS_PLATFORMS } from '../public/dfs-workspace.js';
import { dfsPreview } from './fixtures/dfs-props.mjs';
import { fantasySlip } from '../public/ev-core.js';
import { load } from 'cheerio';

// Quotes must stay inside the pregame freshness window, so fixtures are relative to now.
// Both within the 15-minute pregame freshness window; `later` is the newer observation.
const earlier = new Date(Date.now() - 600_000).toISOString(), later = new Date(Date.now() - 300_000).toISOString();

test('DFS break-even includes partial-win payouts and rejects missing rules', () => {
  assert.equal(breakEven(null), null);
  assert.ok(Math.abs(breakEven([0,0,3]) - Math.sqrt(1/3)) < 1e-10);
  const rules = [0,0,0,.4,2,10];
  const probability = breakEven(rules);
  assert.ok(Math.abs(fantasySlip(Array.from({length:5},()=>({probability})), rules).payout - 1) < 1e-10);
  assert.equal((probability*100).toFixed(2), '54.25');
});

test('DFS comparison uses only matching fantasy props and preserves line boundaries and missing sides', () => {
  const prop = {sport:'NBA',event:'PHI vs ORL',player:'Tyrese Maxey',market:'Points',line:28.5};
  const base = {...prop,app:'PrizePicks',side:'Under',probability:.55,ts:earlier};
  const result = comparisonPlatforms(prop, [
    base, {...base,side:'Over',probability:.45}, {...base,probability:.56,ts:later},
    {...base,line:27.5,probability:null}, {...base,event:'PHI vs BOS'},
    {...base,player:'Someone Else'}, {...base,sport:'WNBA'}, {...base,market:'Assists'},
    {...base,app:'FanDuel'}, {...base,app:'DraftKings'}, {...base,app:'FanDuel Fantasy'},
    {...base,line:''}, {...base,line:null},
  ]);
  assert.equal(result.length,3);
  assert.equal(result[2].app,'FanDuel Fantasy');
  assert.equal(result[0].under.probability,.56);
  assert.equal(result[0].over.probability,.45);
  assert.equal(result[1].line,27.5);
  assert.equal(result[1].under.probability,null);
  assert.equal(result[1].over,undefined);
});

test('with no props the view shows an empty state, never sample lines; the first entered prop replaces it', () => {
  const state = {dfs:[],quotes:[],paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{},onSave:()=>{}});
  const empty = view.render();
  assert.match(empty, /No DFS lines in the quote feed yet/);
  assert.doesNotMatch(empty, /Design preview|Tyrese Maxey|Brandin Podziemski|Example/);
  state.dfs.push({id:'manual-1',sport:'NFL',app:'Underdog Fantasy',player:'Test <Player>',event:'BUF vs MIA',market:'Passing Yards',side:'Over',line:249.5,probability:.55,team:'BUF'});
  const html = view.render();
  assert.doesNotMatch(html, /No DFS lines in the quote feed yet|Tyrese Maxey|Brandin Podziemski/);
  assert.match(html, /Test &lt;Player&gt;/);
  assert.match(html, /Underdog Fantasy<\/option>/);
  assert.doesNotMatch(html, /No matching props/);
  assert.equal(comparisonPlatforms(state.dfs[0],state.dfs)[0].app,'Underdog Fantasy');
});

test('selected DFS platforms remain visible without lines and never include sportsbooks', () => {
  const prop = {sport:'NBA',event:'PHI vs ORL',player:'Tyrese Maxey',market:'Points',line:28.5,app:'PrizePicks',side:'Under',probability:.55};
  const rows = [prop, {...prop,line:27.5}, {...prop,app:'FanDuel'}];
  const result = selectedComparisonPlatforms(prop,rows,['Sleeper Picks','PrizePicks','FanDuel','Pinnacle']);
  assert.deepEqual(result.map(row=>[row.app,row.line]),[['Sleeper Picks',undefined],['PrizePicks',28.5]],'one column per app: the selected line');
  assert.equal(result[0].over,undefined);
  assert.equal(result[0].under,undefined);
  assert.deepEqual(selectedComparisonPlatforms(prop,rows,[]),[]);
});

test('preview and platform options contain DFS providers with lines instead of sportsbook prices', () => {
  const rows=dfsPreview();
  for (const item of rows) {
    assert.equal(item.bookOdds,undefined);
    for (const entry of comparisonPlatforms(item)) {
      assert.ok(DFS_PLATFORMS.includes(entry.app));
      assert.equal(entry.over.line,item.line);
      assert.equal(entry.under.line,item.line);
      assert.equal(entry.odds,undefined);
    }
  }
  const state={dfs:[{...rows[0],id:'invalid',app:'FanDuel',source:'manual'}, {...rows[1],id:'valid',app:'PrizePicks',source:'manual'}],quotes:[{book:'BetMGM'}],paytables:{}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{},onSave:()=>{}});
  const html=view.render();
  assert.doesNotMatch(html,/FanDuel(?! Fantasy)|BetMGM|Pinnacle|Sportsbooks|Brandin Podziemski/);
  assert.match(html,/Tyrese Maxey/);
  assert.doesNotMatch(html,/alt="VisualOdds"/);
  assert.match(html,/No book price/);
  assert.match(html,/DFS platforms/);
});

test('DFS comparison allows any number of platforms even with saved props from only two books', t => {
  const originalDocument = globalThis.document, originalCSS = globalThis.CSS;
  globalThis.document = {querySelector:()=>null};
  globalThis.CSS = {escape:value=>value};
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalCSS === undefined) delete globalThis.CSS; else globalThis.CSS = originalCSS;
  });
  const prop = {id:'manual-1',sport:'NFL',event:'BUF vs MIA',player:'Test Player',market:'Passing Yards',line:249.5,app:'PrizePicks',side:'Over',probability:.55};
  const state = {dfs:[prop,{...prop,id:'manual-2',app:'Underdog Fantasy'}],paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  const click = (dataset, attributes = []) => {
    const button = {dataset,hasAttribute:name=>attributes.includes(name)};
    assert.equal(view.click({target:{closest:()=>button}}),true);
  };
  const compared = html => load(html)('.evd-grid thead th[title]').map((_,th)=>th.attribs.title).get();
  const html = view.render({initialSport:'NFL'});
  assert.equal([...html.matchAll(/data-dfs-compare-platform=/g)].length,DFS_PLATFORMS.length);
  const bar = load(html)('.dfs-platform-bar');
  assert.equal(bar.find('.dfs-platform-rail button.dfs-platform-logo[aria-pressed="true"]').length,DFS_PLATFORMS.length,'every platform starts selected as a round logo toggle');
  assert.equal(bar.find('.dfs-book-count').text(),`${DFS_PLATFORMS.length}/${DFS_PLATFORMS.length}`);
  assert.equal(bar.find('[data-dfs-all-platforms]').attr('aria-pressed'),'true');
  assert.doesNotMatch(html,/data-dfs-platform-menu/,'the platform rail has no collapse toggle');
  click({dfsExpand:prop.id});
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS);

  for (const app of DFS_PLATFORMS.slice(2)) click({dfsComparePlatform:app});
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS.slice(0,2));
  const narrowed = load(view.render())('.dfs-platform-bar');
  assert.equal(narrowed.find(`[data-dfs-compare-platform="${DFS_PLATFORMS[2]}"]`).attr('aria-pressed'),'false');
  assert.equal(narrowed.find('.dfs-book-count').text(),`2/${DFS_PLATFORMS.length}`);
  assert.equal(narrowed.find('[data-dfs-all-platforms]').attr('aria-pressed'),'false');
  click({dfsComparePlatform:'Sleeper Picks'});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  const grid = load(view.render())('.evd-grid');
  const sleeper = grid.find('thead th').toArray().findIndex(th=>th.attribs.title==='Sleeper Picks');
  assert.equal(grid.find('tbody tr').first().children().eq(sleeper).hasClass('is-missing'),true,'Sleeper Picks Over is unavailable');

  view.change({target:{id:'dfs-sport',value:'MLB',dataset:{}}});
  assert.equal([...view.render().matchAll(/data-dfs-compare-platform=/g)].length,DFS_PLATFORMS.length);
  view.change({target:{id:'dfs-sport',value:'NFL',dataset:{}}});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  click({},['data-dfs-all-platforms']);
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS);
});

test('main DFS odds use the best current recorded sportsbook quote for the exact selection', () => {
  const prop = {sport:'NFL',event:'BUF vs MIA',player:'Josh Allen',market:'Passing Yards',line:249.5,side:'Over',probability:.6};
  const quote = {...prop,type:'prop',book:'FanDuel',odds:-115,ts:later};
  const result = sportsbookOffer(prop,[
    {...quote,odds:150,ts:earlier},
    {...quote,book:'DraftKings',odds:-120}, quote,
  ]);
  assert.equal(result.book,'FanDuel');
  assert.equal(result.odds,-115);
  const prefixed = {...quote,player:undefined,market:'Josh Allen passing yards'};
  assert.equal(sportsbookOffer(prop,[prefixed]).odds,-115);
  for (const mismatch of [
    {sport:'NBA'}, {event:'BUF vs NYJ'}, {event:''}, {player:'Someone Else'},
    {player:undefined}, {market:'Rushing Yards'}, {line:250.5}, {line:null},
    {line:''}, {side:'Under'}, {live:true}, {period:'first half'},
    {odds:0}, {odds:99}, {odds:Infinity}, {book:'PrizePicks'}, {book:'Sporttrade'},
    {exchange:true}, {source:'example'},
  ]) assert.equal(sportsbookOffer(prop,[{...quote,...mismatch}]),null,JSON.stringify(mismatch));
  assert.equal(sportsbookOffer({...prop,event:''},[quote]),null);
  assert.equal(sportsbookOffer({...prop,source:'design-preview'},[quote]),null);
  assert.equal(sportsbookOffer({...prop,source:'example'},[{...quote,source:'example'}]).book,'FanDuel');
  assert.equal(sportsbookOffer(prop,[]),null);
});

test('DFS rows show the book logo and offered odds, while fair value stays in the expanded comparison', t => {
  const originalDocument = globalThis.document, originalCSS = globalThis.CSS;
  globalThis.document = {querySelector:()=>null};
  globalThis.CSS = {escape:value=>value};
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalCSS === undefined) delete globalThis.CSS; else globalThis.CSS = originalCSS;
  });
  const prop = {id:'manual-offer',sport:'NFL',event:'BUF vs MIA',player:'Josh Allen',market:'Passing Yards',line:249.5,side:'Over',probability:.6,app:'PrizePicks'};
  const ts = new Date().toISOString(), quote = {...prop,book:'FanDuel',odds:-115,ts};
  const state = {dfs:[prop],quotes:[quote,{...quote,book:'DraftKings',odds:-125},{...quote,side:'Under',odds:-105}],paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  const html = view.render();
  const $ = load(html);
  assert.match(html,/src="\/assets\/brands\/fanduel.png" alt="FanDuel"/);
  assert.equal($('.dfs-prop.evb-row .dfs-offer strong').text(),'249.5 · -115');
  assert.equal($('.dfs-prop.evb-row .dfs-offer small').text(),'Sharp · FanDuel');
  assert.equal($('.dfs-prop.evb-row .dfs-prob').text(),'60.00%');
  assert.equal($('.dfs-prop .dfs-market-title').text(),'Player Passing Yards');
  assert.equal($('.dfs-prop .dfs-pick-cell').attr('title'),'DFS line at PrizePicks');
  assert.equal($('.dfs-prop .dfs-player').text(),'Josh Allen');
  assert.equal($('.dfs-prop .dfs-pick-line').text(),'Over 249.5');
  assert.equal($('.dfs-prop button button').length,0);
  assert.equal($('.dfs-prop button input').length,0);
  assert.doesNotMatch(html,/Fair value|alt="VisualOdds"|Fair -150/);
  const button = {dataset:{dfsExpand:prop.id},hasAttribute:()=>false};
  view.click({target:{closest:()=>button}});
  const panel = load(view.render());
  assert.match(panel('.evd-note').text(),/Fair odds -150/);
  assert.deepEqual(panel('.evd-grid tbody th').map((_,th)=>panel(th).text()).get(),['Josh Allen Over 249.5','Josh Allen Under 249.5']);
  assert.equal(panel('.evd-grid tbody tr.is-selected th').text(),'Josh Allen Over 249.5');
  assert.equal(panel('.evd-grid tbody tr.is-selected .evd-average').text(),'-120');
  assert.equal(panel('.evd-grid tbody tr.is-selected .evd-best strong').text(),'-115');
  assert.equal(panel('.evd-grid tbody tr').eq(1).find('.evd-best strong').text(),'-105');
  assert.deepEqual(panel('.evd-grid thead th[title]').map((_,th)=>th.attribs.title).get().slice(0,3),['FanDuel','DraftKings','PrizePicks']);
  assert.equal(panel('.evd-tool[data-dfs-toggle-pick]').attr('aria-pressed'),'false');
  assert.equal(panel('.evd-add[data-add="dfs"]').length,1);
  state.quotes = [];
  view.click({target:{closest:()=>button}});
  assert.equal(load(view.render())('.dfs-offer strong').text(),'249.5 · —');
  assert.equal(load(view.render())('.dfs-offer small').text(),'No book price');
  assert.doesNotMatch(view.render(),/Fair value|alt="VisualOdds"/);
  assert.equal(view.click({target:{closest:()=>({dataset:{dfsPick:prop.id},hasAttribute:()=>false})}}),true);
  const selected = load(view.render());
  assert.equal(selected('.dfs-prop [data-dfs-pick]').attr('aria-pressed'),'true');
  assert.equal(selected('.dfs-prop [data-dfs-pick]').attr('title'),'Remove from slip');
  assert.equal(selected('.dfs-slip-pick').length,1);
  const hideButton = {dataset:{dfsHide:prop.id},hasAttribute:()=>false};
  view.click({target:{closest:()=>hideButton}});
  assert.equal(load(view.render())('.dfs-prop').length,0);
  assert.equal(load(view.render())('.dfs-slip-pick').length,1,'hiding a card keeps its selected pick');
});

test('mobile slip review retains selections and rejects invalid entry values', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const rows=dfsPreview().slice(0,3).map((item,index)=>({...item,id:'entered-'+index,source:'manual',app:'PrizePicks'}));
  const state={dfs:rows,paytables:{PrizePicks:{3:[0,0,0,5]}}};
  const slips=[];
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{},onSave:slip=>slips.push(slip)});
  assert.equal(load(view.render())('.dfs-probability').first().attr('data-heat'),'low','estimates below break-even are muted');
  for(const item of rows)view.click({target:{closest:()=>({dataset:{dfsPick:item.id},hasAttribute:()=>false})}});
  let html=view.render();
  assert.match(html,/3\/3 picks · Review/);
  assert.match(html,/est\. EV/);
  assert.match(html,/data-dfs-return/);
  view.change({target:{id:'dfs-entry',dataset:{},value:'Infinity'}});
  html=view.render();
  assert.match(html,/Enter an entry amount of at least \$1/);
  assert.doesNotMatch(html,/value="Infinity"/);
  view.change({target:{id:'dfs-entry',dataset:{},value:'12.5'}});
  view.click({target:{closest:()=>({dataset:{},hasAttribute:name=>name==='data-dfs-save'})}});
  assert.equal(slips.length,1);
  assert.equal(slips[0].stake,12.5);
  assert.equal(slips[0].picks.length,3);
});

test('All apps lists every app, keeps a slip to one app and shows the slip payout and break-even', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={event:'',market:'Points',line:20.5,side:'Over',source:'local-api'};
  const state={dfs:[{...base,id:'pp1',app:'PrizePicks',player:'A One',sport:'NBA'},{...base,id:'pp2',app:'PrizePicks',player:'B Two',sport:'Tennis'},{...base,id:'ud1',app:'Underdog Fantasy',player:'C Three',sport:'NBA'}],
    quotes:[],paytables:{PrizePicks:{3:[0,0,0,5]}},payoutSource:()=>'api'};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  let $=load(view.render());
  assert.equal($('#dfs-platform option:selected').text(),'All apps');
  assert.equal($('.dfs-prop').length,3,'every app\'s lines are listed');
  assert.match($('.dfs-results-toolbar p').text(),/3 props from all apps/);
  assert.deepEqual($('#dfs-sport option').map((_,o)=>$(o).text()).get(),['All sports','NBA','Tennis'],'sports come from the feed');
  assert.equal($('.dfs-slip-trigger strong').text(),'3 Pick · 5× · BE 58.48%','the slip type shows its payout and break-even');
  assert.match($('.dfs-feed-note').text(),/game lines only/,'a missing hit chance is explained');
  assert.equal($('.dfs-prop .dfs-pick-cell small').first().text(),'PrizePicks','each row names its app');
  const pick=id=>view.click({target:{closest:()=>({dataset:{dfsPick:id},hasAttribute:()=>false})}});
  pick('pp1'); pick('ud1');
  $=load(view.render());
  assert.equal($('.dfs-slip-pick').length,1,'a slip holds one app\'s picks');
  assert.match($('.dfs-feedback').text(),/This slip is for PrizePicks/);
  view.change({target:{id:'dfs-platform',dataset:{},value:'Underdog Fantasy'}});
  $=load(view.render());
  assert.equal($('.dfs-prop').length,1);
  assert.equal($('.dfs-slip-pick').length,0,'switching apps starts a new slip');
});

test('goblin and demon lines show fair probability but no edge, and never produce a slip EV', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={event:'IND @ WAS',sport:'NFL',market:'Receiving Yards',side:'Over',app:'PrizePicks',source:'local-api',probability:.62};
  const state={dfs:[{...base,id:'s',player:'A One',line:60.5,oddsType:'standard'},{...base,id:'g',player:'B Two',line:40.5,oddsType:'goblin'},{...base,id:'d',player:'C Three',line:90.5,oddsType:'demon'}],quotes:[],paytables:{PrizePicks:{2:[0,0,3],3:[0,0,0,5]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  let $=load(view.render());
  const cell=id=>$(`[data-dfs-row="${id}"] .dfs-probability`);
  assert.match(cell('s').text(),/vs BE/);
  assert.match(cell('g').text(),/62\.00%.*Payout varies/s,'fair probability still shows');
  assert.doesNotMatch(cell('g').text(),/vs BE/);
  assert.equal($('[data-dfs-row="d"] .dfs-odds-type').text(),'Demon');
  view.change({target:{id:'dfs-line-type',dataset:{},value:'goblin'}});
  $=load(view.render());
  assert.deepEqual($('.dfs-prop').map((_,row)=>$(row).attr('data-dfs-row')).get(),['g']);
  view.change({target:{id:'dfs-line-type',dataset:{},value:''}});
  for(const id of ['s','g','d'])view.click({target:{closest:()=>({dataset:{dfsPick:id},hasAttribute:()=>false})}});
  $=load(view.render());
  assert.equal($('.dfs-slip-pick').length,3);
  assert.match($('.dfs-slip-note').text(),/Goblin and demon picks change the payout/);
  assert.doesNotMatch($.html(),/est\. EV/,'no slip EV with goblin or demon legs');
});

test('the comparison shows one column per app and the sportsbook prices the fair probability came from', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={app:'PrizePicks',sport:'NBA',event:'DAL @ GSV',player:'Kaila Charles',market:'Points',source:'local-api'};
  // Standard 5.5 with goblin and demon alternates for the same player and stat.
  const lines=[[5.5,'standard'],[4.5,'goblin'],[6.5,'demon'],[7.5,'demon'],[9.5,'demon'],[13.5,'demon']].map(([line,oddsType])=>({...base,id:`pp-${line}`,line,oddsType,side:'Over'}));
  const under={...base,id:'pp-u',line:5.5,oddsType:'standard',side:'Under',probability:.5306,probabilitySources:[{book:'Fanatics',over:100,under:-130}]};
  const state={dfs:[...lines,under],quotes:[],paytables:{PrizePicks:{3:[0,0,0,5]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  view.render();
  view.click({target:{closest:()=>({dataset:{dfsExpand:'pp-u'},hasAttribute:()=>false})}});
  const $=load(view.render());
  const heads=$('.evd-grid thead th[title]').map((_,th)=>th.attribs.title).get();
  assert.equal(heads.filter(name=>name==='PrizePicks').length,1,'PrizePicks appears once');
  assert.ok(heads.includes('Fanatics'),'the sportsbook behind the fair probability is a column');
  const cells=$('.evd-grid tbody tr').map((_,tr)=>$(tr).text().replace(/\s+/g,' ')).get();
  assert.match(cells[0],/\+100/);
  assert.match(cells[1],/-130/);
  assert.match($('.dfs-panel-facts').text(),/^Fair 53\.06%/);
});

test('the comparison panel uses the row\'s own app break-even when every app is listed', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={event:'A @ B',sport:'NBA',market:'Points',side:'Over',line:20.5,source:'local-api'};
  const state={dfs:[{...base,id:'pp1',app:'PrizePicks',player:'P One',probability:.5},{...base,id:'pp2',app:'PrizePicks',player:'P Two',probability:.5},{...base,id:'ud',app:'Underdog Fantasy',player:'U One',probability:.545}],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]},'Underdog Fantasy':{3:[0,0,0,6.5]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  view.render();
  view.click({target:{closest:()=>({dataset:{dfsExpand:'ud'},hasAttribute:()=>false})}});
  const $=load(view.render());
  // Underdog 3-pick 6.5x: break-even 53.58%, edge +0.92 (not PrizePicks' 55.03%).
  assert.match($('.dfs-panel-facts').text(),/Break-even 53\.58% \(Underdog Fantasy 3 Pick\) · Edge \+0\.92%/);
  assert.match($('[data-dfs-row="ud"] .dfs-vs-be').text(),/\+0\.92%/);
});

test('goblin and demon payout multipliers from the feed set the leg break-even and scale the slip payout', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={event:'IND @ WAS',sport:'NFL',market:'Receiving Yards',side:'Over',app:'PrizePicks',source:'local-api'};
  const state={dfs:[{...base,id:'s',player:'A One',line:60.5,oddsType:'standard',probability:.6},{...base,id:'g',player:'B Two',line:40.5,oddsType:'goblin',payoutMultiplier:.7,probability:.8},{...base,id:'d',player:'C Three',line:90.5,oddsType:'demon',payoutMultiplier:1.55,probability:.4}],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  let $=load(view.render());
  // 3-pick 6x: standard break-even 55.03%; goblin 55.032 / 0.7 = 78.617% (edge +1.38); demon 55.03 / 1.55 = 35.50% (edge +4.50).
  assert.match($('[data-dfs-row="g"] .dfs-vs-be').text(),/\+1\.38%/);
  assert.match($('[data-dfs-row="d"] .dfs-vs-be').text(),/\+4\.50%/);
  assert.equal($('[data-dfs-row="g"] .dfs-odds-type').text(),'Goblin ×0.7');
  for(const id of ['s','g','d'])view.click({target:{closest:()=>({dataset:{dfsPick:id},hasAttribute:()=>false})}});
  $=load(view.render());
  // Payout 6 × 0.7 × 1.55 = 6.51x; return = 0.6 × 0.8 × 0.4 × 6.51 = 1.2499 per $1.
  assert.match($('.dfs-slip-total').text(),/6\.51×/);
  const stake=10, expected=0.6*0.8*0.4*6*0.7*1.55*stake;
  assert.match($('.dfs-slip-total').text(),new RegExp(`Estimated return\\$${expected.toFixed(2).replace('.','\\.')}`));
  // A goblin without a multiplier still gets no edge or EV.
  state.dfs=state.dfs.map(item=>item.id==='g'?{...item,payoutMultiplier:undefined}:item);
  $=load(view.render());
  assert.match($('[data-dfs-row="g"] .dfs-vs-be').text(),/Payout varies/);
});
