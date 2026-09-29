import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore, accountDataKind, ACCOUNT_DRAFT_PREFIX } from '../public/account-sync.js';

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function backend() {
  let user = 'user-a'; const records = new Map(), requests = [];
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  return { records, requests, user(value) { user = value; }, async fetcher(url, options) {
    requests.push({ url, options });
    if (url === '/api/auth/get-session') return response(200, user ? { user: { id: user }, session: {} } : null);
    if (!user) return response(401, {});
    if (options.headers['X-Account-User'] !== user) return response(403, {});
    const key = user + ':' + url.split('/').at(-1), old = records.get(key) || { value: {}, version: 0 };
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (body.version !== old.version) return response(409, {});
      records.set(key, { value: body.value, version: old.version + 1 });
    }
    return response(200, structuredClone(records.get(key) || old));
  } };
}
const make = (remote, local = memory()) => createAccountStore({ fetcher: remote.fetcher, legacyStorage: local, delay: 60_000 });

test('sign-in never adopts unowned shared-device data; explicit import preserves originals', async () => {
  const original = '{"version":1,"bets":[{"id":"legacy"}]}', local = memory({ 'nfl-lab.personal-bets.v1': original, 'nfl-notes': '{"p":"Private"}', 'sportslab-admin-sandbox-v1': '{}' });
  const remote = backend(), store = make(remote, local); await store.initialize();
  assert.equal(store.storage.getItem('nfl-lab.personal-bets.v1'), null);
  assert.equal(remote.requests.filter(request => request.options.method === 'PUT').length, 0);
  assert.equal(store.legacySummary().count, 2);
  await assert.rejects(store.importLegacy(), { code: 'confirmation' });
  const result = await store.importLegacy({ confirmed: true });
  assert.deepEqual(result, { imported: 2, skipped: 0 });
  assert.equal(remote.records.get('user-a:bets').value.storage['nfl-lab.personal-bets.v1'], original);
  assert.equal(local.getItem('nfl-lab.personal-bets.v1'), original);
  assert.equal(remote.records.get('user-a:bets').version, 1);
});

test('explicit import skips existing cloud keys and preserves other account preferences', async () => {
  const remote = backend(); remote.records.set('user-a:preferences', { value: { oddsFormat: 'decimal', storage: { 'nfl-auto': 'false' } }, version: 2 });
  const store = make(remote, memory({ 'nfl-auto': 'true', 'sports-lab-display': '{"density":"compact"}' })); await store.initialize();
  assert.deepEqual(await store.importLegacy({ confirmed: true }), { imported: 1, skipped: 1 });
  const value = remote.records.get('user-a:preferences').value;
  assert.equal(value.oddsFormat, 'decimal'); assert.equal(value.storage['nfl-auto'], 'false');
});

test('another account cannot read or automatically upload the previous account pending draft', async () => {
  const remote = backend(), local = memory(), first = make(remote, local); await first.initialize();
  first.storage.setItem('nfl-notes', '{"p":"A private draft"}');
  assert.ok(local.getItem(ACCOUNT_DRAFT_PREFIX + 'user-a:notes'));
  remote.user('user-b'); const second = make(remote, local); await second.initialize();
  assert.equal(second.storage.getItem('nfl-notes'), null);
  await assert.rejects(first.flush(), { code: 'session' });
  assert.equal(remote.records.has('user-b:notes'), false);
  assert.throws(() => first.storage.getItem('nfl-notes'), { code: 'session' });
});

test('session switch between identity check and PUT is rejected by account binding header', async () => {
  const remote = backend(); const fetcher = async (url, options) => { if (options.method === 'PUT') remote.user('user-b'); return remote.fetcher(url, options); };
  const store = createAccountStore({ fetcher, legacyStorage: memory(), delay: 60_000 }); await store.initialize();
  store.storage.setItem('nfl-saved', '["p"]'); const result = await store.flush();
  assert.equal(result.locked, true); assert.equal(remote.records.size, 0);
});

test('a newer cloud save merges with pending edits instead of blocking sync', async () => {
  const remote = backend(), local = memory(), first = make(remote, local); await first.initialize();
  first.storage.setItem('nfl-notes', '{"p":"My pending edit"}');
  remote.records.set('user-a:notes', { value: { storage: { 'mlb-lab-notes': '{"p":"Edit from another tab"}' } }, version: 1 });
  const result = await first.flush();
  assert.deepEqual(result.errors, []); assert.deepEqual(result.pending, []);
  assert.deepEqual(remote.records.get('user-a:notes'), { value: { storage: { 'mlb-lab-notes': '{"p":"Edit from another tab"}', 'nfl-notes': '{"p":"My pending edit"}' } }, version: 2 });
  assert.equal(first.storage.getItem('mlb-lab-notes'), '{"p":"Edit from another tab"}');
  assert.equal(local.getItem(ACCOUNT_DRAFT_PREFIX + 'user-a:notes'), null);
});

test('a stale draft from an earlier visit is replayed onto the newest cloud copy', async () => {
  const remote = backend(), local = memory(), first = make(remote, local); await first.initialize();
  first.storage.setItem('nfl-notes', '{"p":"Offline edit"}');
  remote.records.set('user-a:notes', { value: { storage: { 'nfl-notes': '{"p":"Older cloud"}', 'mlb-lab-notes': '{"p":"Cloud only"}' } }, version: 3 });
  const restored = make(remote, local); await restored.initialize();
  assert.deepEqual(restored.info().errors, []);
  assert.equal(restored.storage.getItem('nfl-notes'), '{"p":"Offline edit"}');
  assert.equal(restored.storage.getItem('mlb-lab-notes'), '{"p":"Cloud only"}');
  await restored.flush();
  assert.equal(remote.records.get('user-a:notes').version, 4);
  assert.equal(remote.records.get('user-a:notes').value.storage['mlb-lab-notes'], '{"p":"Cloud only"}');
});

test('writing an unchanged value does not create a pending edit', async () => {
  const remote = backend(); remote.records.set('user-a:notes', { value: { storage: { 'nfl-notes': '{"p":"Same"}' } }, version: 1 });
  const store = make(remote); await store.initialize();
  store.storage.setItem('nfl-notes', '{"p":"Same"}');
  assert.deepEqual(store.info().pending, []);
});

test('returning account retries pending drafts only against their original cloud version', async () => {
  const remote = backend(), local = memory(), first = make(remote, local); await first.initialize(); first.storage.setItem('nfl-notes', '{"p":"Draft"}');
  const restored = make(remote, local); await restored.initialize(); await restored.flush();
  assert.equal(remote.records.get('user-a:notes').value.storage['nfl-notes'], '{"p":"Draft"}');
  assert.equal(local.getItem(ACCOUNT_DRAFT_PREFIX + 'user-a:notes'), null);
});

test('failed data hydration cannot overwrite existing server data with default empty values', async () => {
  const remote = backend(), fetcher = async (url, options) => url.endsWith('/bets') ? { ok: false, status: 503 } : remote.fetcher(url, options);
  const store = createAccountStore({ fetcher, legacyStorage: memory(), delay: 60_000 }); await store.initialize();
  assert.throws(() => store.storage.setItem('nfl-lab.personal-bets.v1', '{"bets":[]}'), { code: 'network' });
  await store.flush(); assert.equal(remote.records.has('user-a:bets'), false);
});

test('signed-out demos use ephemeral state without reading or mutating unowned browser data', async () => {
  const remote = backend(); remote.user(null); const local = memory({ 'nfl-saved': '["old-user"]' }), store = make(remote, local); await store.initialize();
  assert.equal(store.storage.getItem('nfl-saved'), null); store.storage.setItem('nfl-saved', '["new-demo"]');
  assert.equal(store.storage.getItem('nfl-saved'), '["new-demo"]'); assert.equal(local.getItem('nfl-saved'), '["old-user"]');
  await store.flush(); assert.equal(remote.records.size, 0);
});

test('only allowlisted product keys can enter account imports', () => {
  assert.equal(accountDataKind('sports-lab-filter-presets:nfl:research'), 'filters');
  assert.equal(accountDataKind('sportslab-odds-display-v1'), 'preferences');
  for (const key of ['sportslab-admin-sandbox-v1', 'auth-token', 'sportslab-ev-permanent-demo-bets-v1', '__proto__', 'sports-lab-notes-other']) assert.equal(accountDataKind(key), null);
});

test('server-verified account defaults are exposed only for the current identity', async () => {
  const remote = backend(), store = createAccountStore({ delay: 60_000, legacyStorage: memory(), fetcher: async (url, options) => {
    const result = await remote.fetcher(url, options);
    if (url !== '/api/auth/get-session') return result;
    const value = await result.json();
    return { ...result, json: async () => value ? { ...value, preferences: { oddsFormat: 'american' } } : null };
  } });
  await store.initialize(); assert.equal(store.preferences().oddsFormat, 'american');
  remote.user(null); await assert.rejects(store.checkIdentity()); assert.deepEqual(store.preferences(), {});
});
