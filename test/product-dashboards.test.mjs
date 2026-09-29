import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {load} from 'cheerio';
import {renderProductDashboard} from '../lib/product-dashboards.mjs';
import {siteHeader} from '../lib/site-layout.mjs';
import {SPORTS} from '../public/navigation.js';

const markets={
  nfl:['rec_yds','rush_yds','pass_yds','rec'],mlb:['hits','k','tb','hr'],
  nba:['points','rebounds','assists','threes'],wnba:['points','rebounds','assists','threes'],
  nhl:['shots','goals','assists','saves'],soccer:['shots','sot','goals','assists']
};

test('each workspace has its own dashboard focused on that product', () => {
  const expected={
    models:{title:'Models dashboard · VisualOdds',kicker:'Models dashboard',panels:['hd-picks','hd-edges','hd-games','hd-tools'],stats:['games','props','priced','top']},
    trends:{title:'Trends dashboard · VisualOdds',kicker:'Trends dashboard',panels:['hd-trends','hd-cold','hd-games','hd-tools'],stats:['tracked','hot','cold','games']},
    ev:{title:'+EV dashboard · VisualOdds',kicker:'+EV dashboard',panels:['hd-ev','hd-books','hd-tracker','hd-tools'],stats:['ev','edge','books','avg']}
  };
  for(const [product,info] of Object.entries(expected)) for(const sport of [...Object.keys(SPORTS),'unknown']) {
    const path=product==='ev'?'/ev/dashboard':'/'+product;
    const html=renderProductDashboard(new URL(`http://localhost${path}?sport=${sport}`));
    const $=load(html);
    assert.ok(html.includes('<!--site-header-->'),'the shared sidebar is injected');
    assert.equal($('title').text(),info.title);
    assert.equal($('#home-dashboard').attr('data-hd-product'),product);
    assert.equal($('.hd-kicker').text(),info.kicker);
    assert.deepEqual($('.hd-grid-panels .hd-panel-body, .hd-grid-panels .hd-tools').map((_,el)=>$(el).attr('id')).get(),info.panels,`${product}: only its own panels`);
    assert.deepEqual($('.hd-stats [data-hd-count]').map((_,el)=>$(el).attr('data-hd-count')).get(),info.stats);
    assert.equal($('.hd-stat.is-accent').length,1);
    assert.equal($('script[src="/home.js"]').length,1);
  }
  assert.equal(renderProductDashboard(new URL('http://localhost/unknown')),null);
  // Other products' panels never leak into a dashboard.
  assert.equal(load(renderProductDashboard(new URL('http://localhost/models?sport=nfl')))('#hd-ev,#hd-trends,#hd-tracker').length,0);
  assert.equal(load(renderProductDashboard(new URL('http://localhost/trends?sport=nfl')))('#hd-ev,#hd-picks,#hd-tracker').length,0);
  assert.equal(load(renderProductDashboard(new URL('http://localhost/ev/dashboard?sport=all')))('#hd-picks,#hd-trends,#hd-games').length,0);
});

test('dashboards are the first link in each sidebar group and keep sport-aware links', () => {
  for(const product of ['trends','models','ev']) for(const sport of Object.keys(SPORTS)) {
    const path=product==='ev'?'/ev/dashboard':'/'+product;
    const header=load(siteHeader(new URL(`http://localhost${path}?sport=${sport}`)));
    const group=header('.dashboard-sidebar-group[data-group]');
    assert.equal(group.attr('data-group'),product);
    const first=group.find('a').first();
    assert.equal(first.text().trim(),'Dashboard');
    assert.equal(first.attr('href'),`${path}?sport=${sport}`);
    assert.equal(first.attr('aria-current'),'page');
    assert.equal(header(`.dashboard-primary-link[href="/ev/tracker?sport=${sport}"]`).length,1);
    assert.equal(header('.dashboard-primary-link[data-dashboard-section=home]').length,0,'no combined dashboard link');
    assert.equal(header('.dashboard-mobile-bar [data-sidebar-toggle]').attr('aria-controls'),'dashboard-sidebar');
  }
});

test('model search query survives opening, changing markets and clearing the board', async () => {
  const value="O'Neil & Smith";
  for(const file of ['app.js','mlb.js']) {
    const source=await fs.readFile(new URL('../public/'+file,import.meta.url),'utf8');
    const lines=source.split(/\r?\n/),search={value:''},sort={value:''};
    const state={view:'board',market:file==='app.js'?'rec_yds':'hits',sort:'model',season:null,week:null,matchup:''};
    let written='';
    const context=vm.createContext({state,URLSearchParams,location:{search:'?market='+state.market+'&search='+encodeURIComponent(value)},$:key=>key==='#search'?search:sort,views:{board:[]},marketLabels:{rec_yds:'Receiving yards',pass_yds:'Passing yards'},defaults:{hits:['Hits'],hr:['Home runs']},history:{replaceState:(_a,_b,url)=>{written=url;}}});
    const reader=lines.find(line=>line.startsWith('function readUrl('));
    const writer=lines.find(line=>line.startsWith(file==='app.js'?'function makeUrl(':'function writeUrl('));
    vm.runInContext(reader+'\n'+writer+'\nreadUrl();',context);
    assert.equal(search.value,value,file+' restores the submitted search');
    if(file==='app.js') written=vm.runInContext("makeUrl({market:'pass_yds'})",context);
    else {state.market='hr';vm.runInContext('writeUrl()',context);}
    assert.equal(new URL(written,'http://localhost').searchParams.get('search'),value,file+' preserves search across market changes');
    search.value='';state.search='';
    if(file==='app.js') written=vm.runInContext('makeUrl()',context);else vm.runInContext('writeUrl()',context);
    assert.equal(new URL(written,'http://localhost').searchParams.has('search'),false);
  }
  const source=await fs.readFile(new URL('../public/sports.js',import.meta.url),'utf8');
  const search={value:''},state={date:'2026-09-27',league:'eng.1',market:'points',sort:'projection',view:'players',rankBy:'projection'};
  const context=vm.createContext({state,URLSearchParams,sport:'nba',params:new URLSearchParams({search:value}),$:()=>search});
  const hydrate=source.match(/\$\('#search'\)\.value=params\.get\('search'\)\|\|'';/)[0];
  const query=source.split(/\r?\n/).find(line=>line.startsWith('const query='));
  vm.runInContext(hydrate+'\n'+query,context);
  assert.equal(search.value,value);
  assert.equal(vm.runInContext("query().get('search')",context),value);
  search.value='';assert.equal(vm.runInContext("query().has('search')",context),false);
});
