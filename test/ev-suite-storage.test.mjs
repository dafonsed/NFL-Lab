import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountStore, ACCOUNT_DRAFT_PREFIX } from '../public/account-sync.js';
import { createSuiteStorage } from '../public/ev-suite-storage.js';
import { permanentDemoWorkspace } from './fixtures/ev-preview.js';

const now = Date.parse('2026-09-27T18:00:00Z');
const WORKSPACE = 'sportslab-ev-workbench-v1', LEDGER = 'nfl-lab.personal-bets.v1';
// Mirrors the account data PUT limit in lib/accounts/http.mjs.
const MAX_VALUE = 1_000_000;

function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function backend() {
  const records = new Map(), puts = [];
  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  return { records, puts, async fetcher(url, options = {}) {
    if (url === '/api/auth/get-session') return response(200, { user: { id: 'user-a' }, session: {} });
    const kind = url.split('/').at(-1), old = records.get(kind) || { value: null, version: 0 };
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body), size = JSON.stringify(body.value).length;
      puts.push({ kind, size });
      if (size > MAX_VALUE) return response(413, { error: 'Export older records before adding more data.' });
      if (body.version !== old.version) return response(409, {});
      records.set(kind, { value: body.value, version: old.version + 1 });
    }
    return response(200, structuredClone(records.get(kind) || old));
  } };
}
async function signedIn(remote, local = memory()) {
  const account = createAccountStore({ fetcher: remote.fetcher, legacyStorage: local, delay: 60_000 });
  await account.initialize();
  const suite = createSuiteStorage({ storage: account.storage, userId: () => account.info().userId });
  return { account, suite };
}
const exampleRecords = value => JSON.stringify(value).includes('"source":"example"');

test('the permanent demo workspace alone exceeds the account data limit', () => {
  assert.ok(JSON.stringify(permanentDemoWorkspace(null, now)).length > MAX_VALUE);
});

test('suite settings sync for a signed-in account alongside real bets', async () => {
  const remote = backend(), { account, suite } = await signedIn(remote);
  const ledger = JSON.stringify({ version: 1, bets: [{ id: 'real-bet', stake: 20, odds: -110 }] });
  account.storage.setItem(LEDGER, ledger);
  suite.writeSuiteState({ presets: [{ id: 'mine', name: 'Main view' }] });
  const result = await account.flush();
  assert.deepEqual(result.errors, []);
  const saved = remote.records.get('bets').value;
  assert.equal(saved.storage[LEDGER], ledger);
  assert.equal(exampleRecords(saved), false);
  assert.deepEqual(suite.readSuiteState(), { presets: [{ id: 'mine', name: 'Main view' }] });
});

test('an oversized demo draft from an older build is dropped so real bets sync again', async () => {
  const ledger = JSON.stringify({ version: 1, bets: [{ id: 'real-bet' }] });
  const envelope = { version: 1, example: false, suite: { presets: [] }, demoWorkspace: permanentDemoWorkspace(null, now) };
  const draft = { value: { storage: { [LEDGER]: ledger, [WORKSPACE]: JSON.stringify(envelope) } }, version: 0 };
  const local = memory({ [ACCOUNT_DRAFT_PREFIX + 'user-a:bets']: JSON.stringify(draft) });
  const remote = backend();

  const stuck = createAccountStore({ fetcher: remote.fetcher, legacyStorage: local, delay: 60_000 });
  await stuck.initialize();
  assert.match((await stuck.flush()).errors[0].message, /could not sync/);

  const { account, suite } = await signedIn(remote, local);
  assert.equal(suite.releaseAccountDemoWorkspace(), true);
  const result = await account.flush();
  assert.deepEqual(result.errors, []);
  const saved = remote.records.get('bets').value.storage;
  assert.equal(saved[LEDGER], ledger);
  assert.deepEqual(JSON.parse(saved[WORKSPACE]).suite, { presets: [] });
  assert.equal(exampleRecords(saved), false);
  assert.equal(suite.releaseAccountDemoWorkspace(), false);
});
