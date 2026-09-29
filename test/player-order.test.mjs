import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { modelValue, sortPlayers, sortProfiles } from '../public/player-order.js';

test('sort follows displayed model probability, retains zero and places missing values last', () => {
  const players = [
    { player: 'A', forecast: { probability: { over: .45 } }, modelScore: 90 },
    { player: 'B', forecast: { probability: { over: null } }, modelScore: 99 },
    { player: 'C', forecast: { probability: { over: .52 } }, modelScore: 70 },
    { player: 'D', forecast: { probability: { over: 0 } }, modelScore: 80 },
  ];
  const values = { over: p => p.forecast?.probability?.over, score: p => p.modelScore };
  assert.deepEqual(sortPlayers(players, 'over', values).map(p => p.player), ['C', 'A', 'D', 'B']);
  assert.deepEqual(sortPlayers(players, 'score', values).map(p => p.player), ['B', 'A', 'D', 'C']);
  assert.deepEqual(players.map(p => p.player), ['A', 'B', 'C', 'D']);
});

test('primary model ordering uses TD strength and projected amounts across all sports', () => {
  for (const sport of ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']) {
    const profiles = [
      { name: 'High chance', sport, market: 'points', forecast: { point: 8, probability: { over: .9 } } },
      { name: 'High projection', sport, market: 'points', forecast: { point: 30, probability: { over: .2 } } },
      { name: 'Missing', sport, market: 'points', forecast: { point: null } },
      { name: 'Zero', sport, market: 'points', forecast: { point: 0, probability: { over: 0 } } },
    ];
    assert.deepEqual(sortProfiles(profiles).map(p => p.name), ['High projection', 'High chance', 'Zero', 'Missing']);
    assert.deepEqual(sortProfiles(profiles, 'over').map(p => p.name), ['High chance', 'High projection', 'Zero', 'Missing']);
  }
  const profiles = [
    { name: 'High probability', sport: 'nfl', market: 'any_td', raw: { modelScore: 44, forecast: { point: 2 } } },
    { name: 'High strength', sport: 'nfl', market: 'any_td', raw: { modelScore: 95, forecast: { point: .7 } } },
    { name: 'Unavailable', sport: 'nfl', market: 'any_td', raw: { modelScore: 99, availability: { unavailable: true } } },
  ];
  assert.deepEqual(sortProfiles(profiles).map(p => p.name), ['High strength', 'High probability', 'Unavailable']);
});

test('missing, blank and invalid values follow real zero; ties are deterministic', () => {
  const profiles = [null, '', ' ', false, Infinity, NaN, -3, 0, '14'].map((point, i) => ({ name: String(i), forecast: { point } }));
  assert.deepEqual(sortProfiles(profiles).slice(0, 3).map(p => p.forecast.point), ['14', 0, -3]);
  assert.equal(modelValue({ forecast: { point: '' } }), null);
  const tied = [{ player: 'Same', gameId: '2', id: '9', score: 4 }, { player: 'Same', gameId: '1', id: '9', score: 4 }];
  assert.deepEqual(sortPlayers(tied, 'score', { score: p => p.score }).map(p => p.gameId), ['1', '2']);
});

test('explicit under sorting uses under probability and model amount to break ties', () => {
  const profiles = [
    { name: 'A', forecast: { point: 10, probability: { over: .9, under: .1 } } },
    { name: 'B', forecast: { point: 8, probability: { over: .2, under: .8 } } },
    { name: 'C', forecast: { point: 16, probability: { over: .2, under: .8 } } },
  ];
  assert.deepEqual(sortProfiles(profiles, 'under').map(p => p.name), ['C', 'B', 'A']);
  assert.deepEqual(sortProfiles(profiles, 'name').map(p => p.name), ['A', 'B', 'C']);
});

test('model filter resets retain highest-projection defaults, including WNBA rankings', async () => {
  for (const [file, expected] of [['index.html', 'model'], ['mlb.html', 'model'], ['sports.html', 'projection']]) {
    const $ = load(await readFile(new URL('../public/' + file, import.meta.url), 'utf8'));
    assert.equal($('#sort option').first().attr('value'), expected);
    if (file === 'sports.html') assert.equal($('#rank-by option').first().attr('value'), 'projection');
  }
});
