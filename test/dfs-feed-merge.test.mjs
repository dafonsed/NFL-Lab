import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDfsFeed } from '../public/dfs-feed-merge.js';

const line = (extra = {}) => ({ app: 'PrizePicks', sport: 'MLB', player: 'Fixture Runner', market: 'HOME_RUNS', line: 0.5, side: 'UNDER', startTime: '2026-10-06T23:10:00Z', ...extra });

test('the full API feed and relay feed merge without duplicate pick’em lines', () => {
  const primary = [line({ id: 'api', probability: null }), line({ id: 'other', player: 'Other Runner', probability: .6 })];
  const relay = [
    line({ id: 'relay', app: 'PrizePicks ', market: 'NFL_PLAYER_HOME_RUNS', side: 'under', probability: .62, bookLines: [{ book: 'Pinnacle' }], probabilityBooks: ['Pinnacle'] }),
    line({ id: 'relay-other', player: 'Other Runner', probability: .99 }),
  ];
  const merged = mergeDfsFeed(primary, relay);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'api', 'the priced full API row remains authoritative');
  assert.equal(merged[0].probability, .62, 'a relay row can supply only a missing probability');
  assert.deepEqual(merged[0].probabilityBooks, ['Pinnacle']);
  assert.equal(merged[1].probability, .6, 'an existing API probability is never overwritten');
});
