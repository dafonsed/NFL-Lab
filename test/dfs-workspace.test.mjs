import test from 'node:test';
import assert from 'node:assert/strict';
import { breakEven, comparisonPlatforms, selectedComparisonPlatforms, sportsbookOffer, createDfsWorkspace, dfsPreview, DFS_PLATFORMS } from '../public/dfs-workspace.js';
import { fantasySlip } from '../public/ev-core.js';

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
  const base = {...prop,app:'PrizePicks',side:'Under',probability:.55,ts:'2026-09-25T10:00:00Z'};
  const result = comparisonPlatforms(prop, [
    base, {...base,side:'Over',probability:.45}, {...base,probability:.56,ts:'2026-09-25T11:00:00Z'},
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

test('entering the first prop exits the preview without retaining its NBA filter or sample lines', () => {
  const state = {dfs:[],quotes:[],paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{},onSave:()=>{}});
  assert.match(view.render(), /Design preview/);
  state.dfs.push({id:'manual-1',sport:'NFL',app:'Underdog Fantasy',player:'Test <Player>',event:'BUF vs MIA',market:'Passing Yards',side:'Over',line:249.5,probability:.55,team:'BUF'});
  const html = view.render();
  assert.doesNotMatch(html, /Design preview|Tyrese Maxey|Brandin Podziemski/);
  assert.match(html, /Test &lt;Player&gt;/);
  assert.match(html, /Underdog Fantasy<\/option>/);
  assert.doesNotMatch(html, /No matching props/);
  assert.equal(comparisonPlatforms(state.dfs[0],state.dfs)[0].app,'Underdog Fantasy');
});

test('selected DFS platforms remain visible without lines and never include sportsbooks', () => {
  const prop = {sport:'NBA',event:'PHI vs ORL',player:'Tyrese Maxey',market:'Points',line:28.5,app:'PrizePicks',side:'Under',probability:.55};
  const rows = [prop, {...prop,line:27.5}, {...prop,app:'FanDuel'}];
  const result = selectedComparisonPlatforms(prop,rows,['Sleeper Picks','PrizePicks','FanDuel','Pinnacle']);
  assert.deepEqual(result.map(row=>[row.app,row.line]),[['Sleeper Picks',undefined],['PrizePicks',28.5],['PrizePicks',27.5]]);
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
  assert.doesNotMatch(html,/alt="SportsLab"/);
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
  const compared = html => [...html.matchAll(/data-platform-name="([^"]+)"/g)].map(match=>match[1]);
  const html = view.render({initialSport:'NFL'});
  assert.equal([...html.matchAll(/data-dfs-compare-platform=/g)].length,DFS_PLATFORMS.length);
  click({dfsExpand:prop.id});
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS);

  for (const app of DFS_PLATFORMS.slice(2)) click({dfsComparePlatform:app});
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS.slice(0,2));
  click({dfsComparePlatform:'Sleeper Picks'});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  assert.match(view.render(),/aria-label="Sleeper Picks Over unavailable"/);

  view.change({target:{id:'dfs-sport',value:'MLB',dataset:{}}});
  assert.equal([...view.render().matchAll(/data-dfs-compare-platform=/g)].length,DFS_PLATFORMS.length);
  view.change({target:{id:'dfs-sport',value:'NFL',dataset:{}}});
  assert.deepEqual(compared(view.render()),['PrizePicks','Underdog Fantasy','Sleeper Picks']);
  click({},['data-dfs-all-platforms']);
  assert.deepEqual(compared(view.render()),DFS_PLATFORMS);
});

test('main DFS odds use the best current recorded sportsbook quote for the exact selection', () => {
  const prop = {sport:'NFL',event:'BUF vs MIA',player:'Josh Allen',market:'Passing Yards',line:249.5,side:'Over',probability:.6};
  const quote = {...prop,type:'prop',book:'FanDuel',odds:-115,ts:'2026-09-25T11:00:00Z'};
  const result = sportsbookOffer(prop,[
    {...quote,odds:150,ts:'2026-09-25T10:00:00Z'},
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
  const state = {dfs:[prop],quotes:[{...prop,book:'FanDuel',odds:-115}],paytables:{}};
  const view = createDfsWorkspace({getState:()=>state,redraw:()=>{}});
  const html = view.render();
  assert.match(html,/src="\/assets\/brands\/fanduel.png" alt="FanDuel"/);
  assert.match(html,/<span>-115<\/span><\/strong><small>FanDuel<\/small>/);
  assert.doesNotMatch(html,/Fair value|alt="SportsLab"|<span>-150<\/span>/);
  const button = {dataset:{dfsExpand:prop.id},hasAttribute:()=>false};
  view.click({target:{closest:()=>button}});
  assert.match(view.render(),/<span>-150<\/span><small>Fair value<\/small>/);
  state.quotes = [];
  view.click({target:{closest:()=>button}});
  assert.match(view.render(),/<span>—<\/span><\/strong><small>No book price<\/small>/);
  assert.doesNotMatch(view.render(),/Fair value|alt="SportsLab"/);
});
