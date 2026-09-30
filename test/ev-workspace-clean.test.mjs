import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, isDemoRecord, purgeDemoData, clearLegacyDemoStorage, LEGACY_DEMO_KEYS, LEGACY_DEMO_SESSION_PREFIX } from '../public/ev-workspace-clean.js';
import { exampleWorkspace } from './fixtures/ev-demo.js';
import { permanentDemoWorkspace } from './fixtures/ev-preview.js';

const memory = (initial = {}) => { const values = new Map(Object.entries(initial)); return { values, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) }; };

test('example, demo and preview records are recognized; real records are not', () => {
  for (const record of [{ source: 'example' }, { demo: true }, { source: 'design-preview' }, { id: 'arb-demo-1' }, { id: 'odds-demo-v1-x' }, { id: 'smart-demo-3' }, { id: 'permanent-demo-q-1' }, { book: 'Kalshi (example)' }, { name: 'Demo portfolio' }]) assert.equal(isDemoRecord(record), true, JSON.stringify(record));
  for (const record of [{ id: 'local-api:abc', source: 'local-api', book: 'FanDuel' }, { id: 'c1d2', source: 'manual', book: 'DraftKings' }, { id: 'bet-1' }]) assert.equal(isDemoRecord(record), false, JSON.stringify(record));
});

test('purging a saved workspace keeps feed quotes and the member’s own records only', () => {
  const saved = exampleWorkspace();
  const real = { id: 'local-api:1', source: 'local-api', sport: 'NFL', event: 'A at B', market: 'Moneyline', side: 'A', book: 'FanDuel', odds: 110, ts: new Date().toISOString() };
  const mine = { id: 'mine-1', source: 'manual', player: 'X', app: 'PrizePicks', market: 'Points', line: 20.5, side: 'Over' };
  saved.quotes.push(real); saved.dfs.push(mine);
  assert.ok(purgeDemoData(saved) > 0);
  assert.deepEqual(saved.quotes, [real]);
  assert.deepEqual(saved.dfs, [mine]);
  assert.equal(saved.example, undefined);
  assert.ok(Object.keys(saved.paytables).every(name => !/example/i.test(name)));
  const permanent = permanentDemoWorkspace(null, Date.parse('2026-09-29T16:00:00Z'));
  purgeDemoData(permanent);
  for (const key of ['quotes', 'history', 'dfs', 'contracts', 'traders', 'trades', 'results']) assert.equal(permanent[key].length, 0, key);
  assert.equal(permanent.demoPermanent, undefined);
});

test('the empty workspace has every collection and legacy demo storage is cleared', () => {
  const empty = emptyWorkspace();
  assert.equal(empty.version, 1);
  assert.deepEqual(empty.quotes, []);
  const local = memory({ [LEGACY_DEMO_KEYS[0]]: '{}', [LEGACY_DEMO_KEYS[1]]: '[]', keep: '1' });
  const session = memory({ [LEGACY_DEMO_SESSION_PREFIX + 'guest']: '{}', other: '1' });
  clearLegacyDemoStorage(local, session);
  assert.deepEqual([...local.values.keys()], ['keep']);
  assert.deepEqual([...session.values.keys()], ['other']);
});
