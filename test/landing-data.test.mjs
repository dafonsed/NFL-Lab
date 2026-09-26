import test from 'node:test';
import assert from 'node:assert/strict';
import { landingResearch } from '../lib/landing-data.mjs';

test('homepage research returns only sourced completed games and captured lines', () => {
  const game = (week, value) => ({ gameId: `2026_0${week}_NO_LV`, date: `2026-09-${String(week).padStart(2, '0')}`, opponent: 'LV', home: true, value, url: 'https://www.espn.com/boxscore' });
  const board = {
    current: { season: 2026, week: 3 }, fetchedAt: '2026-09-24T16:00:00Z', stale: true,
    datasets: [{ type: 'weekly', season: 2026, available: true, url: 'https://example.com/weekly.csv', fetchedAt: '2026-09-24T15:00:00Z', stale: true }],
    players: [
      { playerId: 'real-1', player: 'Source Player', position: 'WR', team: 'NO', opponent: 'LV', prop: { line: 79.5, bookmaker: 'Source Book', fetchedAt: '2026-09-24T16:00:00Z', stale: true, sourceUrl: 'https://example.com/line' }, trendGames: [game(1, 86), game(2, 64), game(3, 100), game(4, 45), game(5, 90), { gameId: 'pending', date: '2026-09-24', value: null }] },
      { playerId: 'no-line', player: 'No Line', position: 'WR', prop: null, trendGames: [game(1, 10), game(2, 10), game(3, 10), game(4, 10), game(5, 10)] }
    ]
  };
  const result = landingResearch(board);
  assert.equal(result.available, true);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].name, 'Source Player');
  assert.equal(result.players[0].line, 79.5);
  assert.equal(result.players[0].quote.stale, true);
  assert.deepEqual(result.players[0].games.map(row => row.value), [86, 64, 100, 45, 90]);
  assert.equal(result.sources[0].url, 'https://example.com/weekly.csv');
});
