import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPlayers } from '../public/player-order.js';

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
