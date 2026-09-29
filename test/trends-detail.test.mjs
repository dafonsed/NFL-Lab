import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
globalThis.location={search:''};
const {trendChartPanel,trendContextPanel,trendSupportingPanel,trendRecordsPanel,trendQuoteBar}=await import('../public/trends-detail.js');
delete globalThis.location;
const games=[{date:'2026-09-20',value:0,parts:[],opponent:'HOU',opponentId:117,home:true},{date:'2026-09-19',value:1,parts:[],opponent:'LAA',opponentId:108,home:false}];
const p={sport:'mlb',name:'Player <A>',team:'SEA',opponent:'HOU',opponentId:117,displayDate:'2026-09-23',label:'Hits',unit:'hits',rows:games,raw:{teamId:136,home:true,role:'hitting',opponentPitcher:'Starter <B>'},availability:{},forecast:{},historyNote:'Prior games only.'};
const options={games,line:0,side:'under',window:'10',venue:'all',manual:true,width:600,modelUrl:'/mlb?researchPlayer=test'};

test('quote strip keeps saved prices separate from a custom historical comparison',()=>{
 const quoted={...p,prop:{line:.5,bookmaker:'Book <A>',stale:true,prices:{over:{american:-200},under:{american:150}}}};
 const book=load(trendQuoteBar(quoted,{line:.5,side:'over',manual:false}));
 assert.equal(book('.td-quote-selection strong').text(),'Over 0.5');assert.equal(book('.quote-book-copy strong').text(),'Book <A>');assert.equal(book('.quote-book-copy a').length,0);
 assert.equal(book('.td-quote-source').length,0);assert.match(book('.td-quote-prices').text(),/-200.*\+150/);
 const custom=load(trendQuoteBar(quoted,{line:0,side:'under',manual:true}));
 assert.equal(custom('.td-quote-selection strong').text(),'Under 0');assert.equal(custom('.td-quote-prices').length,0);
 assert.equal(custom('.quote-book-badge').length,0);assert.equal(custom('[data-reset-line]').length,1);
 const missing=load(trendQuoteBar(p,{line:null,side:'over',manual:false}));
 assert.equal(missing('.quote-book-badge').length,0);assert.doesNotMatch(missing('.td-quote-prices').text(),/undefined|NaN/);
 const fanDuel=load(trendQuoteBar({...p,prop:{bookmaker:'FanDuel',prices:{over:{american:-200},under:{american:null}}}},{line:.5,side:'over',manual:false}));
 assert.equal(fanDuel('.quote-book-badge').length,1);assert.equal(fanDuel('.quote-book-copy strong').text(),'FanDuel');
 assert.equal(fanDuel('.quote-book-mark img').attr('src'),'/assets/brands/fanduel.png');assert.equal(fanDuel('.td-quote-prices img').length,0);
 assert.equal(fanDuel('.td-quote-prices>span').last().find('strong').text(),'—');
 const otherBook=load(trendQuoteBar({...quoted,prop:{...quoted.prop,bookKey:'draftkings',stale:true}},{line:.5,side:'under',manual:false}));
 assert.equal(otherBook('.quote-book-copy strong').text(),'DraftKings');assert.equal(otherBook('.quote-book-copy small').text(),'Saved quote');
 assert.equal(otherBook('.quote-book-mark img').attr('src'),'/assets/brands/draftkings.png');assert.equal(otherBook('.td-quote-price.is-selected small').text(),'Under');
});

test('comparison controls and window tiles preserve pushes, zero lines and sample sizes',()=>{
 const $=load(trendChartPanel(p,options));
 assert.equal($('#td-line').attr('value'),'0');assert.equal($('.td-summary-stats strong').first().text(),'0%');
 assert.match($('.td-summary-stats small').first().text(),/0 of 2 games · 1 pushes/);
 assert.equal($('.td-rate-splits [data-window="10"]').attr('aria-pressed'),'true');
 assert.equal($('.td-rate-splits [data-window="10"] small').text(),'0/2');
 assert.equal($('[data-reset-line]').length,1);assert.match($('.td-chart-note').text(),/your line/);
 const empty=load(trendChartPanel({...p,rows:[]},{...options,games:[],line:null,manual:false}));
 assert.equal(empty('.td-summary-stats strong').first().text(),'—');assert.equal(empty('.td-split strong').first().text(),'—');
 assert.equal(empty('[data-reset-line]').length,0);
});

test('matchup sidebar uses actual teams and available facts without embedding model forecasts',()=>{
 const $=load(trendContextPanel(p,options));
 assert.equal($('.team-mark img').length,2);assert.match($('.td-matchup-facts').text(),/Starter <B>/);
 assert.match($('.td-insight-copy').text(),/below 0 hits in 0 of 2/);
 assert.equal($('a').attr('href'),options.modelUrl);assert.equal($('.pr-model-metrics').length,0);assert.equal($('b').length,0);
 assert.ok(trendSupportingPanel(p,games).includes('Loading supporting stats'));
 assert.ok(trendSupportingPanel({...p,full:true},games).includes('Unavailable for this sample'));
});

test('supporting stat cards use real filtered counts, include zeroes and preserve each sample',()=>{
 const rows=[{date:'2026-09-22',stats:{hits:0,plateAppearances:4}},{date:'2026-09-21',stats:{hits:1,plateAppearances:5}},{date:'2026-09-20',stats:{hits:5}}];
 const average=load(trendSupportingPanel(p,rows));
 const hits=average('.td-support-tile').filter((i,el)=>average(el).find('h4').text()==='Hits');
 assert.equal(hits.find('strong').text(),'2');assert.match(hits.text(),/3 games/);
 assert.deepEqual(hits.find('rect title').map((i,el)=>average(el).text()).get(),['2026-09-20: 5','2026-09-21: 1','2026-09-22: 0']);
 const plate=average('.td-support-tile').first();assert.equal(plate.find('strong').text(),'4.5');assert.match(plate.text(),/2 games/);assert.equal(plate.find('.missing').length,1);
 const median=load(trendSupportingPanel(p,rows,'median'));
 assert.equal(median('[data-stat-method="median"]').attr('aria-pressed'),'true');
 assert.equal(median('.td-support-tile').last().find('strong').text(),'1');
});

test('context tabs expose one panel and compare real zero values without inventing rankings',()=>{
 const $=load(trendContextPanel({...p,context:{available:true,unit:'per plate appearance',rate:0,leagueRate:.22,sampleCount:20}},{...options,contextTab:'insights'}));
 assert.equal($('[role=tabpanel]:not([hidden])').attr('id'),'td-context-insights');
 assert.equal($('[role=tab][aria-selected=true]').attr('aria-controls'),'td-context-insights');
 assert.equal($('#td-context-matchup tbody td').first().text(),'0');
 assert.equal($('#td-context-matchup tbody td').last().text(),'0.22');
 assert.match($('.td-context-caption').first().text(),/20 prior games/);
 assert.deepEqual($('.td-outcome-strip i').map((i,el)=>$(el).attr('class')).get(),['miss','push']);
 assert.doesNotMatch($('.td-context-table').text(),/rank|probability/i);
 const missing=load(trendContextPanel(p,{...options,line:null}));
 assert.equal(missing('.td-context-table').length,0);
 assert.equal(missing('.td-outcome-strip .neutral').length,2);
});

test('game log distinguishes zero, push, missing and under outcomes with actual opponent logos',()=>{
 const rows=[...games,{date:'2026-09-18',value:null,opponent:'San Diego Padres',opponentId:135,home:false}];
 const $=load(trendRecordsPanel(p,{...options,games:rows,showLog:true}));
 assert.equal($('#td-game-log').attr('hidden'),undefined);
 assert.equal($('[data-log]').attr('aria-expanded'),'true');
 assert.deepEqual($('.td-result>span').map((i,el)=>$(el).text()).get(),['Push','Miss','—']);
 assert.deepEqual($('.td-log-opponent strong').map((i,el)=>$(el).text()).get(),['HOU','LAA','SD']);
 assert.match($('.td-log-opponent img').last().attr('src'),/500-dark\/sd\.png$/);
 assert.equal($('.td-log-value').first().text(),'0');
 const under=load(trendRecordsPanel(p,{...options,games:rows,line:1}));
 assert.deepEqual(under('.td-result>span').map((i,el)=>under(el).text()).get(),['Hit','Push','—']);
 assert.ok(under('#td-game-log').is('[hidden]'));
});
