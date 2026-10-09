import test from 'node:test';
import assert from 'node:assert/strict';
import { breakEven, comparisonPlatforms, selectedComparisonPlatforms, sportsbookOffer, createDfsWorkspace, DFS_PLATFORMS, withStandardPaytables } from '../public/dfs-workspace.js';
import { isContestPlatform } from '../public/platform-catalog.js';
// The rail lists pick'em apps; salary-cap contest apps never post pick'em lines.
const PICKEM = DFS_PLATFORMS.filter(app => !isContestPlatform(app));
import { dfsPreview } from './fixtures/dfs-props.mjs';
import { fantasySlip } from '../public/betting-math.js';
import { load } from 'cheerio';
import { current, expired, priced } from './helpers/priced.mjs';

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

test('custom-odds EV never masquerades as a pick’em edge', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={sport:'MLB',event:'NYY vs BOS',market:'Player Bases',line:0.5,side:'Over',source:'local-api'};
  const state={dfs:[
    {...base,id:'custom',app:'Chalkboard',player:'Colson Montgomery',probability:.1661,dfsOdds:519,ev:.1944,customOdds:true},
    {...base,id:'standard',app:'PrizePicks',player:'Anthony Volpe',market:'Player Bases',probability:.5526},
  ],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  const html=view.render(), $=load(html);
  assert.equal($('.dfs-prop').length,2);
  assert.equal($('.dfs-prop').first().find('.dfs-player').text(),'Anthony Volpe','the genuine 55.26% pick’em edge ranks first');
  assert.equal($('.dfs-prop').last().find('.dfs-player').text(),'Colson Montgomery','custom-odds rows rank by pick’em edge, not their wager EV');
  const edges=$('.dfs-probability').map((_,element)=>$(element).attr('title')).get().filter(title=>/vs break-even/.test(title));
  assert.equal(edges.length,1,'the app without payout rules gets no invented break-even');
  assert.match(edges[0],/\+0\.23%/);
  assert.doesNotMatch(html,/\+19\.44%/);
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
  assert.match(html,/Fair Value|No book price/);
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
  assert.equal([...html.matchAll(/data-dfs-compare-platform=/g)].length,PICKEM.length);
  const bar = load(html)('.dfs-platform-bar');
  assert.equal(bar.find('.dfs-platform-rail button.dfs-platform-logo[aria-pressed="true"]').length,PICKEM.length,'every platform starts selected as a round logo toggle');
  assert.equal(bar.find('.dfs-book-count').text(),`${PICKEM.length}/${PICKEM.length}`);
  assert.equal(bar.find('[data-dfs-all-platforms]').attr('aria-pressed'),'true');
  assert.doesNotMatch(html,/data-dfs-platform-menu/,'the platform rail has no collapse toggle');
  click({dfsExpand:prop.id});
  assert.deepEqual(compared(view.render()),PICKEM);

  for (const app of DFS_PLATFORMS.slice(2)) click({dfsComparePlatform:app});
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS.slice(0,2));
  const narrowed = load(view.render())('.dfs-platform-bar');
  assert.equal(narrowed.find(`[data-dfs-compare-platform="${PICKEM[2]}"]`).attr('aria-pressed'),'false');
  assert.equal(narrowed.find('.dfs-book-count').text(),`2/${PICKEM.length}`);
  assert.equal(narrowed.find('[data-dfs-all-platforms]').attr('aria-pressed'),'false');
  click({dfsComparePlatform:'Sleeper Picks'});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  const grid = load(view.render())('.evd-grid');
  const sleeper = grid.find('thead th').toArray().findIndex(th=>th.attribs.title==='Sleeper Picks');
  assert.equal(grid.find('tbody tr').first().children().eq(sleeper).hasClass('is-missing'),true,'Sleeper Picks Over is unavailable');

  view.change({target:{id:'dfs-sport',value:'MLB',dataset:{}}});
  assert.equal([...view.render().matchAll(/data-dfs-compare-platform=/g)].length,PICKEM.length);
  view.change({target:{id:'dfs-sport',value:'NFL',dataset:{}}});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  click({},['data-dfs-all-platforms']);
  assert.deepEqual(compared(view.render()),PICKEM);
});

test('main DFS odds use the best current recorded sportsbook quote for the exact selection', () => {
  const prop = {sport:'NFL',event:'BUF vs MIA',player:'Josh Allen',market:'Passing Yards',line:249.5,side:'Over',probability:.6};
  // Quotes as the odds service serves them: current until their expiry time.
  const quote = current({...prop,type:'prop',book:'FanDuel',odds:-115,ts:later});
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
    {exchange:true}, {source:'example'}, {status:'stale'}, {status:'suspended'}, {expiresAt:new Date(Date.now() - 1000).toISOString()},
  ]) assert.equal(sportsbookOffer(prop,[{...quote,...mismatch}]),null,JSON.stringify(mismatch));
  assert.equal(sportsbookOffer(prop,[expired(quote)]),null,'a price past its expiry time is not offered');
  assert.equal(sportsbookOffer({...prop,event:''},[quote]),null);
  assert.equal(sportsbookOffer({...prop,source:'design-preview'},[quote]),null);
  assert.equal(sportsbookOffer({...prop,source:'example'},[{...quote,source:'example'}]).book,'FanDuel');
  assert.equal(sportsbookOffer(prop,[]),null);
});

test('DFS rows show the site’s fair value and true probability; book prices are in the expanded comparison', t => {
  const originalDocument = globalThis.document, originalCSS = globalThis.CSS;
  globalThis.document = {querySelector:()=>null};
  globalThis.CSS = {escape:value=>value};
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalCSS === undefined) delete globalThis.CSS; else globalThis.CSS = originalCSS;
  });
  const prop = {id:'manual-offer',sport:'NFL',event:'BUF vs MIA',player:'Josh Allen',market:'Passing Yards',line:249.5,side:'Over',probability:.6,app:'PrizePicks'};
  // The sportsbook prices as /api/odds serves them, with their market's average.
  const ts = new Date().toISOString(), quote = {...prop,id:'fd-over',book:'FanDuel',odds:-115,ts};
  const {quotes, analytics} = priced([quote,{...quote,id:'dk-over',book:'DraftKings',odds:-125},{...quote,id:'fd-under',side:'Under',odds:-105}]);
  const state = {dfs:[prop],quotes,analytics,paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  const html = view.render();
  const $ = load(html);
  assert.equal($('.dfs-prop.evb-row .dfs-offer .dfs-fv-odds').text(),'-150');
  assert.equal($('.dfs-prop.evb-row .dfs-offer small').text(),'Fair Value');
  assert.equal($('.dfs-prop.evb-row .dfs-prob').text(),'60.00%');
  assert.equal($('.dfs-prop.evb-row .dfs-probability small').text(),'True Prob');
  assert.equal($('.dfs-prop .dfs-market-title').text(),'Player Passing Yards');
  assert.equal($('.dfs-prop .dfs-pick-cell').attr('title'),'DFS line at PrizePicks');
  assert.equal($('.dfs-prop .dfs-player').text(),'Josh Allen');
  assert.equal($('.dfs-prop .dfs-pick-line').text(),'Over 249.5');
  assert.equal($('.dfs-prop button button').length,0);
  assert.equal($('.dfs-prop button input').length,0);
  assert.doesNotMatch(html,/alt="VisualOdds"|Fair -150/);
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
  assert.equal(load(view.render())('.dfs-offer .dfs-fv-odds').text(),'-150','with no book line the fair value still shows');
  assert.equal(load(view.render())('.dfs-offer small').text(),'Fair Value');
  assert.doesNotMatch(view.render(),/alt="VisualOdds"/);
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
  assert.deepEqual($('#dfs-sport option').map((_,o)=>$(o).text()).get(),['All sports','NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL','Soccer','Tennis'],'major sports always listed; feed sports included');
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
  assert.match(cell('s').attr('title'),/vs break-even/);
  assert.match(cell('g').text(),/62\.00%/,'fair probability still shows');
  assert.match(cell('g').attr('title'),/goblin payout not in the feed/);
  assert.doesNotMatch(cell('g').attr('title'),/vs break-even/);
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
  assert.match($('[data-dfs-row="ud"] .dfs-probability').attr('title'),/\+0\.92% vs break-even 53\.58%/);
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
  assert.match($('[data-dfs-row="g"] .dfs-probability').attr('title'),/\+1\.38%/);
  assert.match($('[data-dfs-row="d"] .dfs-probability').attr('title'),/\+4\.50%/);
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
  assert.match($('[data-dfs-row="g"] .dfs-probability').attr('title'),/goblin payout not in the feed/);
});

test('the comparison lists every sportsbook with the exact prop, including one-sided books and other game names', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  // The feed matched three books to this PrizePicks line: FanDuel both sides, DraftKings and Fanatics Over only.
  const pick={id:'p',app:'PrizePicks',sport:'NFL',event:'NYJ @ CHI',player:'Luther Burden III',market:'Receptions',line:4.5,side:'Under',source:'local-api',oddsType:'standard',probability:.5458,probabilityBooks:['FanDuel'],
    probabilitySources:[{book:'FanDuel',over:110,under:-140}],bookLines:[{book:'FanDuel',over:110,under:-140},{book:'DraftKings',over:105},{book:'Fanatics',over:100}]};
  const state={dfs:[pick],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  view.render();
  view.click({target:{closest:()=>({dataset:{dfsExpand:'p'},hasAttribute:()=>false})}});
  const $=load(view.render());
  const heads=$('.evd-grid thead th[title]').map((_,th)=>th.attribs.title).get();
  assert.deepEqual(heads.filter(name=>['FanDuel','DraftKings','Fanatics'].includes(name)).sort(),['DraftKings','FanDuel','Fanatics']);
  assert.match($('.evd-note').text(),/fair probability devigs FanDuel \(both sides priced\)/);
  assert.equal($('.dfs-prop .dfs-offer small').text(),'Fair Value');
  assert.deepEqual($('.dfs-prop .dfs-fv-books img').map((_,img)=>img.attribs.alt).get(),['FanDuel'],'the fair value comes from FanDuel, the one book pricing both sides');
  assert.ok(!heads.includes('FanDuel Fantasy') && !heads.includes('DraftKings Fantasy'),'contest apps are not comparison columns');
  assert.equal($('[data-dfs-compare-platform="FanDuel Fantasy"]').length,0,'the rail lists pick\'em apps only');
});

// Shared setup for the slip, label and availability tests below: DOM stubs and a click driver.
function board(t, state, options = {}) {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const view=createDfsWorkspace({getState:()=>({...state}),redraw:()=>{},...options});
  const press=(dataset,attributes=[])=>view.click({target:{closest:()=>({dataset,hasAttribute:name=>attributes.includes(name)})}});
  return {view,press,html:()=>load(view.render())};
}
const feedLine={app:'PrizePicks',sport:'NFL',market:'Receiving Yards',side:'Over',source:'local-api',oddsType:'standard'};

test('a goblin or demon without a payout multiplier makes the slip payout vary and blocks saving; a known one saves the scaled table', t => {
  const state={dfs:[{...feedLine,id:'a',event:'A @ B',player:'A One',line:60.5,probability:.6},{...feedLine,id:'b',event:'C @ D',player:'B Two',line:50.5,probability:.58},{...feedLine,id:'g',event:'E @ F',player:'G One',line:40.5,oddsType:'goblin',probability:.8}],quotes:[],slips:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const {view,press,html}=board(t,state,{onSave:slip=>state.slips.push(slip)});
  view.render();
  for(const id of ['a','b','g'])press({dfsPick:id});
  let $=html();
  assert.equal($('.dfs-slip-total dl div').first().find('dd').text(),'Varies (goblin/demon)','never the standard 6x');
  assert.equal($('.dfs-save-slip').attr('disabled'),'disabled');
  assert.equal($('.dfs-slip-dock [data-dfs-save]').attr('disabled'),'disabled');
  assert.match($('.dfs-slip-dock').text(),/Payout varies/);
  press({},['data-dfs-save']);
  assert.equal(state.slips.length,0,'nothing is saved with an unknown payout');
  assert.match(html()('.dfs-feedback').text(),/the feed sent no multiplier for G One Over 40\.5/);
  state.dfs=state.dfs.map(item=>item.id==='g'?{...item,payoutMultiplier:.7}:item);
  $=html();
  assert.match($('.dfs-slip-total dl div').first().find('dd').text(),/^4\.2×/);
  assert.equal($('.dfs-save-slip').attr('disabled'),undefined);
  press({},['data-dfs-save']);
  assert.equal(state.slips.length,1);
  assert.ok(Math.abs(state.slips[0].paytable[3]-4.2)<1e-12,'the saved table is the scaled one the slip was priced with');
  assert.deepEqual(state.slips[0].paytable.slice(0,3),[0,0,0]);
  assert.equal(state.slips[0].payoutFactor,.7);
});

test('saved slips are listed newest first in the slip panel and can be deleted', t => {
  const state={dfs:[{...feedLine,id:'a',event:'A @ B',player:'A One',line:60.5,probability:.6},{...feedLine,id:'b',event:'C @ D',player:'B Two',line:50.5,probability:.58}],quotes:[],slips:[],paytables:{PrizePicks:{2:[0,0,3]}}};
  const deleted=[];
  const {view,press,html}=board(t,state,{onSave:slip=>state.slips.push(slip),onDeleteSlip:id=>{deleted.push(id);state.slips=state.slips.filter(slip=>slip.id!==id);}});
  view.render();
  press({dfsType:'2-saved'});
  press({dfsPick:'a'});press({dfsPick:'b'});
  press({},['data-dfs-save']);
  let $=html();
  assert.match($('.dfs-feedback').text(),/listed under Saved slips/);
  assert.equal($('.dfs-saved-slips li').length,1);
  assert.match($('.dfs-saved-slips li').text(),/PrizePicks 2 Pick · 3×/);
  assert.match($('.dfs-saved-slips li').text(),/A One Over 60\.5 · B Two Over 50\.5/);
  assert.match($('.dfs-saved-slips li').text(),/\$10\.00 entry · \+4\.40% est\. EV/,'0.6 × 0.58 × 3 − 1');
  for(let i=0;i<6;i++)state.slips.push({id:`old-${i}`,app:'PrizePicks',picks:[{player:`P${i}`,side:'Over',line:1.5}],paytable:[0,3],stake:5,ts:new Date(Date.now()+i*1000).toISOString()});
  $=html();
  assert.equal($('.dfs-saved-slips li').length,5,'five at a time');
  assert.match($('.dfs-saved-slips li').first().text(),/P5 Over 1\.5/,'newest first');
  assert.match($('[data-dfs-saved-all]').text(),/Show all 7/);
  press({},['data-dfs-saved-all']);
  assert.equal(html()('.dfs-saved-slips li').length,7);
  press({dfsDeleteSlip:'old-5'});
  assert.deepEqual(deleted,['old-5']);
  $=html();
  assert.equal($('.dfs-saved-slips li').length,6);
  assert.match($('.dfs-feedback').text(),/Saved slip deleted/);
  press({},['data-dfs-clear']);
  assert.equal(html()('.dfs-slip-empty.has-saved .dfs-saved-slips li').length,6,'the list stays with an empty slip');
});

test('without onDeleteSlip a saved slip is removed from the page state in place', t => {
  const slips=[{id:'s1',app:'PrizePicks',picks:[{player:'A',side:'Over',line:1}],paytable:[0,0,3],stake:10,ts:new Date().toISOString()}];
  const state={dfs:[{...feedLine,id:'a',event:'A @ B',player:'A One',line:60.5,probability:.6}],quotes:[],slips,paytables:{}};
  const {view,press,html}=board(t,state);
  view.render();
  press({dfsDeleteSlip:'s1'});
  assert.equal(slips.length,0);
  assert.equal(html()('.dfs-saved-slips').length,0);
});

test('slip sizes follow the app\'s payout tables (Underdog runs to 8 picks) and an over-full slip says how many to remove', t => {
  const state={dfs:Array.from({length:4},(_,i)=>({...feedLine,id:`p${i}`,event:`E${i}`,player:`P${i}`,line:20.5,probability:.55})),quotes:[],paytables:withStandardPaytables()};
  const {view,press,html}=board(t,state);
  view.render();
  view.change({target:{id:'dfs-platform',value:'Underdog Fantasy'}});
  press({},['data-dfs-menu']);
  let $=html();
  assert.deepEqual($('[data-dfs-type]').map((_,b)=>b.attribs['data-dfs-type']).get(),['2-saved','3-saved','4-saved','5-saved','6-saved','7-saved','8-saved']);
  assert.match($('[data-dfs-type="7-saved"]').text(),/65×/);
  assert.match($('[data-dfs-type="8-saved"]').text(),/120×.*54\.97%/s,'120^(-1/8)');
  assert.match($('.dfs-empty-results h2').text(),/No Underdog Fantasy lines in the quote feed right now/);
  press({},['data-dfs-all-apps']);
  assert.equal(html()('.dfs-prop').length,4);
  view.change({target:{id:'dfs-platform',value:'Sleeper Picks'}});
  assert.deepEqual(html()('[data-dfs-type]').map((_,b)=>b.attribs['data-dfs-type']).get(),['2-saved','3-saved','4-saved','5-saved','6-saved'],'2-6 without a table');
  press({},['data-dfs-menu']);
  view.change({target:{id:'dfs-platform',value:'PrizePicks'}});
  press({dfsType:'4-saved'});
  for(let i=0;i<4;i++)press({dfsPick:`p${i}`});
  press({dfsType:'2-saved'});
  $=html();
  assert.match($('.dfs-slip-dock').text(),/4\/2 picks · ReviewRemove 2 picks/);
  assert.doesNotMatch($('.dfs-slip-dock').text(),/more picks needed/);
  assert.equal($('.dfs-save-slip').text(),'Remove 2 picks');
  assert.equal($('#dfs-entry').attr('min'),'1','the same $1 minimum as the entry check');
});

test('part-game lines can\'t be added to a slip', t => {
  const state={dfs:[{...feedLine,id:'part',event:'A @ B',player:'A One',line:20.5,period:'part'},{...feedLine,id:'full',event:'A @ B',player:'B Two',line:60.5,probability:.6}],quotes:[],paytables:{}};
  const {view,press,html}=board(t,state);
  view.render();
  press({dfsPick:'part'});
  const $=html();
  assert.equal($('.dfs-slip-pick').length,0);
  assert.equal($('.dfs-feedback').text(),'Part-game lines can’t be priced; the feed doesn’t say which period this is.');
  press({dfsTogglePick:'part'});
  assert.equal(html()('.dfs-slip-pick').length,0,'nor from the comparison panel');
  press({dfsPick:'full'});
  assert.equal(html()('.dfs-slip-pick').length,1);
});

test('the summary shows the top edge among lines with a known payout, not a goblin\'s raw fair probability', t => {
  const state={dfs:[{...feedLine,id:'s',event:'A @ B',player:'A One',line:60.5,probability:.57},{...feedLine,id:'g',event:'A @ B',player:'B Two',line:.5,oddsType:'goblin',probability:.9},{...feedLine,id:'d',event:'A @ B',player:'C Three',line:90.5,oddsType:'demon',payoutMultiplier:1.5,probability:.3}],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const {view,html}=board(t,state);
  view.render();
  const $=html();
  assert.doesNotMatch($('.dfs-results-toolbar').text(),/Top fair|90\.00%/);
  // Standard: 57.00 − 55.03 = +1.97; demon: 30.00 − 55.03 / 1.5 = −6.69; the goblin has no break-even.
  assert.match($('.dfs-results-toolbar dl').text(),/Top edge\+1\.97%/);
});

test('rows name team and combo markets, season-long boards and the best book price', t => {
  const state={dfs:[{...feedLine,id:'team',event:'IND @ WAS',player:'WAS',market:'Pass Yards',line:240.5},{...feedLine,id:'combo',event:'NFL',player:'Jonathan Taylor + Puka Nacua',market:'Anytime TDs (Combo)',line:.5},{...feedLine,id:'szn',sport:'NBA',event:'NBASZN',player:'Nikola Jokic',market:'Triple-Doubles',line:30.5},{...feedLine,id:'player',event:'IND @ WAS',player:'Terry McLaurin',line:60.5}],quotes:[],paytables:{}};
  const {view,html}=board(t,state);
  view.render();
  const $=html(), title=id=>$(`[data-dfs-row="${id}"] .dfs-market-title`).text();
  assert.equal(title('team'),'Team Pass Yards');
  assert.equal(title('combo'),'Anytime TDs (Combo)');
  assert.equal(title('player'),'Player Receiving Yards');
  assert.equal($('[data-dfs-row="szn"] .dfs-event-name').text(),'NBA season-long');
  assert.deepEqual($('.dfs-thead th').map((_,th)=>$(th).text()).get(),['Market and event','Selection','Fair value','True prob','Actions']);
  assert.doesNotMatch($.html(),/Sharp price/);
});

test('sportsbooks the member can\'t use leave the row price and comparison, while the fair probability still names its books', t => {
  const pick={...feedLine,id:'p',event:'NYJ @ CHI',player:'Luther Burden III',market:'Receptions',line:4.5,side:'Under',probability:.5458,probabilityBooks:['FanDuel'],bookLines:[{book:'FanDuel',over:110,under:-140},{book:'DraftKings',over:105,under:-150}]};
  const state={dfs:[pick],quotes:[],paytables:{PrizePicks:{3:[0,0,0,6]}}};
  const {view,press,html}=board(t,state);
  view.render();
  assert.equal(html()('.dfs-offer .dfs-fv-odds').text(),'-120','the fair value');
  state.bookAvailable=book=>book!=='FanDuel';
  press({dfsExpand:'p'});
  const $=html();
  assert.deepEqual($('.dfs-fv-books img').map((_,img)=>img.attribs.alt).get(),['FanDuel'],'the fair value still names the book it comes from');
  assert.deepEqual($('.evd-grid thead th[title]').map((_,th)=>th.attribs.title).get().filter(name=>['FanDuel','DraftKings'].includes(name)),['DraftKings']);
  assert.match($('.evd-note').text(),/fair probability devigs FanDuel \(both sides priced; FanDuel hidden by your sportsbook settings\)/);
});

test('per-pick apps: each leg breaks even at 1 ÷ its multiplier and an entry pays the product; an exchange source shows FV · Smart Money', t => {
  const originalDocument=globalThis.document, originalCSS=globalThis.CSS;
  globalThis.document={querySelector:()=>null};globalThis.CSS={escape:value=>value};
  t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;if(originalCSS===undefined)delete globalThis.CSS;else globalThis.CSS=originalCSS;});
  const base={sport:'NFL',event:'CIN @ MIA',market:'FG Made',line:1.5,side:'Over',source:'local-api',app:'Sleeper Picks'};
  const state={dfs:[
    {...base,id:'a',player:'Kicker A',payoutMultiplier:1.52,probability:.7,fairOdds:-233,probabilityBooks:['DraftKings']},
    {...base,id:'b',player:'Kicker B',payoutMultiplier:2.12,probability:.5,fairOdds:100,probabilityBooks:['DraftKings']},
    {...base,id:'c',player:'Kicker C',payoutMultiplier:1.8,probability:.6,fairOdds:-150,probabilityBooks:['ProphetX'],probabilitySources:[{book:'ProphetX',over:-150,under:130,exchange:true,liquidity:792}]},
    {...base,id:'x',app:'Chalkboard',player:'Kicker X',probability:.6,fairOdds:-150},
  ],quotes:[],paytables:{'Sleeper Picks':{3:[0,0,0,5.64]}}};
  const view=createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  let $=load(view.render());
  const title=id=>$(`[data-dfs-row="${id}"] .dfs-probability`).attr('title');
  assert.match(title('a'),/\+4\.21% vs break-even 65\.79%/,'70% against 1 ÷ 1.52');
  assert.match(title('b'),/\+2\.83% vs break-even 47\.17%/,'50% against 1 ÷ 2.12');
  assert.match(title('x'),/per-pick payout not in the feed/,'no multiplier, no invented break-even');
  assert.equal($('[data-dfs-row="a"] .dfs-odds-type').text(),'×1.52');
  assert.equal($('[data-dfs-row="c"] .dfs-offer small').text(),'FV · Smart Money');
  assert.equal($('[data-dfs-row="c"] .dfs-fv-cash strong').text(),'$792');
  assert.equal($('[data-dfs-row="a"] .dfs-offer small').text(),'Fair Value');
  for(const id of ['a','b','c'])view.click({target:{closest:()=>({dataset:{dfsPick:id},hasAttribute:()=>false})}});
  $=load(view.render());
  assert.match($('.dfs-slip-total').text(),/5\.8×/,'1.52 × 2.12 × 1.8, not the feed’s 5.64× table');
});
