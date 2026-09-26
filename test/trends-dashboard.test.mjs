import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { comparisonLine, trendRows } from '../public/trends-data.js';
import { renderSitePage, siteContext, siteHeader } from '../lib/site-layout.mjs';

const player = (id, prop, values = [0, 1, 2, 3, 4]) => ({ key: id, playerId: id, gameId: id === 'b' ? '2' : '1', name: 'Player ' + id, team: 'NY', opponent: 'LA', sport: 'nba', market: 'points', prop, rows: values.map((value, i) => ({ value, home: i % 2 === 0, opponent: 'LA', date: '2026-09-' + (20 - i) })) });

test('research overview opens with six sports and accessible loading state', async () => {
  const url = new URL('http://localhost/research');
  assert.deepEqual(siteContext(url), { sport: 'mlb', section: 'home' });
  const $ = load(renderSitePage(await fs.readFile(new URL('../public/home.html', import.meta.url), 'utf8'), url));
  assert.equal($('#home-board[aria-busy=true]').length,1);
  assert.equal($('script[src="/home.js"]').length,1);
  assert.equal($('.site-sports a').length,6);
  assert.equal($('.workspace-choice').length,0);
  assert.equal($('script[src="/app.js"]').length, 0);
  assert.equal(siteContext(new URL('http://localhost/nfl?view=board')).section, 'research');
  assert.equal(siteContext(new URL('http://localhost/nfl?view=trends')).section, 'trends');
});

test('main navigation preserves the current sport and the brand returns to the public homepage', () => {
  for (const sport of ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']) {
    const $ = load(siteHeader(new URL(`http://localhost/${sport}?view=trends`)));
    assert.deepEqual($('.site-navigation a[data-nav-section="research"],.site-navigation a[data-nav-section="trends"]').map((_, a) => $(a).attr('href')).get(), ['/' + sport, '/' + sport + '?view=trends']);
    assert.equal($('.site-navigation [aria-current]').text(), 'Trends');
    assert.equal($('.site-brand').attr('href'), '/');
  }
});

test('ranking keeps missing lines last, counts actual zeroes and excludes stale lines on request', () => {
  const profiles = [player('a', null), player('b', { line: 0 }), player('c', { line: 2, stale: true })];
  const rows = trendRows(profiles);
  assert.deepEqual(rows.map(r => r.p.key), ['b', 'c', 'a']);
  assert.equal(rows[0].stats.n, 5); assert.equal(rows[0].stats.rate, .8); assert.equal(rows[0].stats.pushes, 1);
  assert.deepEqual(trendRows(profiles, { posted: true }).map(r => r.p.key), ['b']);
  assert.equal(comparisonLine(profiles[0]), null);
  assert.equal(comparisonLine({ sport: 'nfl', market: 'any_td' }), .5);
});

test('dashboard search, watchlist, matchup, venue and side filters compose without changing source profiles', () => {
  const profiles = [player('a', { line: 2 }), player('b', { line: 2 }), player('c', null, [])];
  const options = { search: 'player a', game: '1', savedOnly: true, saved: new Set(['a']), venue: 'home', side: 'under', window: '5' };
  const rows = trendRows(profiles, options);
  assert.equal(rows.length, 1); assert.equal(rows[0].stats.n, 3); assert.equal(rows[0].stats.hits, 1);
  assert.equal(profiles[0].rows.length, 5);
  assert.equal(trendRows(profiles, { ...options, game: '2' }).length, 0);
  assert.equal(trendRows(profiles, { search: 'LA' }).length, 3);
});

test('advanced filters compose teams, positions, sample, hit rate, lines and selected-side odds', () => {
  const profiles = [
    {...player('a', {line:1.5,bookKey:'fanduel',prices:{over:{american:-150},under:{american:120}}}, [2,2,2,0,2]),team:'SEA',position:'DH',lineup:'confirmed'},
    {...player('b', {line:1.5,bookKey:'draftkings',prices:{over:{american:140}}}, [2,0,0,0,2]),team:'NYY',position:'CF',availability:{unavailable:true}},
    {...player('c', null),team:'SEA',position:'DH'}
  ];
  const filters={teams:['SEA'],positions:['DH'],sample:'5',minRate:80,minGames:5,book:'fanduel',minLine:1,maxLine:2,minOdds:-200,maxOdds:-100,startersOnly:true,hideUnavailable:true};
  assert.deepEqual(trendRows(profiles,{filters}).map(r=>r.p.key),['a']);
  assert.equal(trendRows(profiles,{filters,side:'under'}).length,0);
  assert.equal(trendRows(profiles,{filters:{...filters,minGames:6}}).length,0);
  assert.equal(trendRows(profiles,{filters:{...filters,venue:'away'}}).length,0);
  assert.deepEqual(trendRows(profiles,{filters:{minLine:0}}).map(r=>r.p.key),['a','b']);
  assert.equal(trendRows(profiles,{filters:{minOdds:0,maxOdds:0}}).length,0);
  assert.deepEqual(trendRows(profiles,{filters:{hideUnavailable:true}}).map(r=>r.p.key),['a','c']);
  assert.equal(profiles[0].rows.length,5);
});

test('advanced sample filters retain missing-data semantics and known zero lines', () => {
  const profiles=[player('zero',{line:0,prices:{over:{american:100}}},[0,1,0]),player('missing',null,[1,2]),player('empty',{line:1},[])];
  assert.deepEqual(trendRows(profiles,{filters:{minLine:0,maxLine:0}}).map(r=>r.p.key),['zero']);
  assert.deepEqual(trendRows(profiles,{filters:{minRate:1}}).map(r=>r.p.key),['zero']);
  assert.equal(trendRows(profiles,{filters:{sample:'5',venue:'home',minGames:2}}).find(r=>r.p.key==='zero').stats.n,2);
});
