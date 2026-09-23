import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { comparisonLine, trendRows } from '../public/trends-data.js';
import { renderSitePage, siteContext, siteHeader } from '../lib/site-layout.mjs';

const player = (id, prop, values = [0, 1, 2, 3, 4]) => ({ key: id, playerId: id, gameId: id === 'b' ? '2' : '1', name: 'Player ' + id, team: 'NY', opponent: 'LA', sport: 'nba', market: 'points', prop, rows: values.map((value, i) => ({ value, home: i % 2 === 0, opponent: 'LA', date: '2026-09-' + (20 - i) })) });

test('home offers exactly two working workspace choices without loading a player board', async () => {
  const url = new URL('http://localhost/');
  assert.deepEqual(siteContext(url), { sport: null, section: 'home' });
  const $ = load(renderSitePage(await fs.readFile(new URL('../public/home.html', import.meta.url), 'utf8'), url));
  assert.deepEqual($('.workspace-choice').map((_, a) => $(a).attr('href')).get(), ['/nfl', '/nfl?view=trends']);
  assert.equal($('script[src="/app.js"]').length, 0);
  assert.equal(siteContext(new URL('http://localhost/?view=board')).section, 'research');
  assert.equal(siteContext(new URL('http://localhost/?view=trends')).section, 'trends');
});

test('workspace switch preserves the current sport and Sports Lab always returns to the chooser', () => {
  for (const sport of ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']) {
    const $ = load(siteHeader(new URL(`http://localhost/${sport}?view=trends`)));
    assert.deepEqual($('.workspace-switch a').map((_, a) => $(a).attr('href')).get(), ['/' + sport, '/' + sport + '?view=trends']);
    assert.equal($('.workspace-switch [aria-current]').text(), 'Trends & Lines');
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
