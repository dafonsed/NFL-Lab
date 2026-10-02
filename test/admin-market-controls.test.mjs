import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openAccountDatabase, migrateAccountTables } from '../lib/accounts/database.mjs';
import { MARKET_CONTROL_SCOPE, sourceControlKey, eventControlKey, readMarketControls, filterMarketQuotes, buildMarketMatches, getMarketControlInventory, setMarketControl } from '../lib/admin-market-controls.mjs';
import { handleEvApi, readEvQuotes } from '../lib/ev-api-proxy.mjs';

const quote = (id, book, event = 'North vs South', sport = 'NFL') => ({ id, book, event, sport, market: 'Moneyline', type: 'moneyline', side: 'North', odds: 110, ts: '2026-09-28T18:00:00Z' });
const quotes = [quote('a1', 'Book A'), quote('a2', ' BOOK A ', 'East vs West'), quote('b1', 'Book B'), quote('b2', 'Book B', 'East vs West')];
const providerConfig = { base: new URL('http://127.0.0.1:8999'), apiKey: 'test-only-provider-key' };
const provider = async () => new Response(JSON.stringify({ quotes, count: quotes.length }), { headers: { 'content-type': 'application/json' } });
const unavailable = async () => { throw new Error('http://private.provider.invalid secret=do-not-expose'); };

async function fixture(t, file = ':memory:') {
  const { db } = await openAccountDatabase({ ACCOUNT_DB_PATH: file });
  await db.schema.createTable('user').ifNotExists().addColumn('id', 'text', c => c.primaryKey()).execute();
  await migrateAccountTables(db);
  let auditFailure = false;
  const system = { db, audit: async (event, tx) => {
    if (auditFailure) throw new Error('Audit write failed.');
    await tx.insertInto('accountAudit').values({ id: randomUUID(), userId: null, actorId: event.actorId, action: event.action, detail: JSON.stringify(event.detail), createdAt: new Date().toISOString() }).execute();
  } };
  t.after(() => db.destroy());
  const change = (body, loadQuotes = async () => quotes) => setMarketControl({ system, actorId: 'staff-real-id', body: { kind: 'source', key: 'book a', blocked: true, expectedVersion: 0, reason: 'Suppress incorrect source prices', ...body }, loadQuotes });
  return { db, system, change, failAudit: () => { auditFailure = true; } };
}

test('inventory reflects actual quote identities and starts without invented controls', async t => {
  const app = await fixture(t);
  const result = await getMarketControlInventory({ db: app.db, loadQuotes: async () => quotes });
  assert.equal(result.scope, MARKET_CONTROL_SCOPE);
  assert.equal(result.inventoryUnavailable, false);
  assert.equal(result.observedQuotes, 4);
  assert.deepEqual(result.controls, []);
  assert.equal(result.sources.length, 2);
  assert.equal(result.events.length, 2);
  assert.equal(result.sources.find(row => row.key === 'book a').quoteCount, 2);
  assert.ok([...result.sources, ...result.events].every(row => row.version === 0 && !row.blocked && row.observed));
  assert.equal(sourceControlKey('  BOOK   A  '), 'book a');
  assert.equal(eventControlKey(quotes[0]), 'b87e80614ed1b45f');
  assert.notEqual(eventControlKey(quotes[0]), eventControlKey({ ...quotes[0], sport: 'NBA' }));
});

test('source suppression filters existing and newly arriving quotes and recomputes match counts', async t => {
  const app = await fixture(t);
  const changed = await app.change({});
  assert.equal(changed.control.version, 1);
  assert.equal(changed.control.blocked, true);
  assert.equal(changed.upstreamChanged, false);
  const controls = await readMarketControls(app.db);
  const visible = filterMarketQuotes([...quotes, quote('a3', 'Book A', 'Third event')], controls);
  assert.deepEqual(visible.map(row => row.id), ['b1', 'b2']);
  assert.deepEqual(buildMarketMatches(visible).map(row => row.quoteCount), [1, 1]);
  const audit = await app.db.selectFrom('accountAudit').selectAll().execute();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, 'staff-real-id');
  assert.equal(audit[0].action, 'admin.market.source.suppress');
  assert.equal(JSON.parse(audit[0].detail).reason, 'Suppress incorrect source prices');
  assert.deepEqual(quotes.map(row => row.id), ['a1', 'a2', 'b1', 'b2'], 'Raw inputs remain intact for later restoration.');
});

test('event quarantine suppresses every source only for the exact provider match identity', async t => {
  const app = await fixture(t);
  const key = eventControlKey(quotes[0]);
  await app.change({ kind: 'event', key });
  const visible = filterMarketQuotes([...quotes, quote('other-sport', 'Book A', 'North vs South', 'NBA')], await readMarketControls(app.db));
  assert.deepEqual(visible.map(row => row.id), ['a2', 'b2', 'other-sport']);
  assert.equal(buildMarketMatches(visible).length, 2);
  assert.equal(buildMarketMatches(visible).some(match => match.id === key), false);
});

test('restoration is version checked, durable, and visible without a process cache', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sportslab-market-control-'));
  const file = path.join(dir, 'controls.sqlite');
  const app = await fixture(t, file);
  await app.change({});
  const reopened = await openAccountDatabase({ ACCOUNT_DB_PATH: file });
  t.after(() => reopened.db.destroy());
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.match(path.basename(dir), /^sportslab-market-control-/);
    await rm(dir, { recursive: true, force: true });
  });
  assert.equal((await readMarketControls(reopened.db))[0].blocked, true);
  await assert.rejects(app.change({ blocked: false }), error => error.status === 409 && error.code === 'MARKET_CONTROL_STALE');
  await assert.rejects(app.change({ expectedVersion: 1 }), error => error.code === 'MARKET_CONTROL_UNCHANGED');
  await app.change({ blocked: false, expectedVersion: 1, reason: 'Verified corrected source prices' });
  const restored = await readMarketControls(reopened.db);
  assert.equal(restored[0].version, 2);
  assert.deepEqual(filterMarketQuotes(quotes, restored), quotes);
});

test('audit failure rolls back the control and concurrent edits cannot overwrite it', async t => {
  const app = await fixture(t);
  app.failAudit();
  await assert.rejects(app.change({}), /Audit write failed/);
  assert.deepEqual(await readMarketControls(app.db), []);
  assert.equal((await app.db.selectFrom('accountAudit').selectAll().execute()).length, 0);
  const independent = await fixture(t);
  const attempts = await Promise.allSettled([independent.change({}), independent.change({ reason: 'A second reviewer competing update' })]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal((await independent.db.selectFrom('accountAudit').selectAll().execute()).length, 1);
});

test('upstream failure returns stored controls without secret leakage and permits restoration', async t => {
  const app = await fixture(t);
  await app.change({});
  const inventory = await getMarketControlInventory({ db: app.db, loadQuotes: unavailable });
  assert.equal(inventory.inventoryUnavailable, true);
  assert.equal(inventory.error, undefined);
  assert.match(inventory.inventoryError, /currently unavailable/);
  assert.equal(inventory.observedQuotes, null);
  assert.equal(inventory.sources.length, 1);
  assert.equal(inventory.sources[0].observed, false);
  assert.equal(inventory.sources[0].blocked, true);
  assert.doesNotMatch(JSON.stringify(inventory), /private[.]provider|do-not-expose/);
  await assert.rejects(app.change({ key: 'unknown source' }, unavailable), error => error.status === 503);
  await app.change({ blocked: false, expectedVersion: 1 }, unavailable);
  assert.equal((await readMarketControls(app.db))[0].blocked, false);
});

test('unknown keys, malformed requests, and partial provider inventories cannot create controls', async t => {
  const app = await fixture(t);
  for (const body of [{ key: 'made up' }, { key: 'Book A' }, { kind: 'league' }, { blocked: 'true' }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { reason: 'short' }, { reason: 'x'.repeat(501) }, { actorId: 'forged' }]) {
    await assert.rejects(app.change(body), error => [400, 404].includes(error.status));
  }
  await assert.rejects(app.change({ kind: 'event', key: '0000000000000000' }), error => error.status === 404);
  const bad = await getMarketControlInventory({ db: app.db, loadQuotes: async () => [quotes[0], quotes[0]] });
  assert.equal(bad.inventoryUnavailable, true);
  assert.deepEqual(bad.sources, []);
  assert.deepEqual(await readMarketControls(app.db), []);
});

test('corrupt or unavailable persisted controls fail closed instead of allowing distribution', async t => {
  const app = await fixture(t);
  await app.change({});
  await app.db.updateTable('adminMarketControl').set({ selector: '{broken' }).execute();
  await assert.rejects(readMarketControls(app.db), error => error.status === 503 && error.code === 'MARKET_CONTROLS_UNAVAILABLE');
});

async function proxy(route, options) {
  let status, headers, body;
  const response = { writeHead(code, values) { status = code; headers = values; }, end(value) { body = JSON.parse(value); } };
  await handleEvApi({ method: 'GET' }, response, new URL(route, 'http://localhost'), { providerConfig, fetcher: provider, ...options });
  return { status, headers, body };
}

test('actual proxy responses suppress source odds and hidden matches using fresh DB state', async t => {
  const app = await fixture(t);
  const options = { loadControls: () => readMarketControls(app.db) };
  assert.equal((await proxy('/api/ev/quotes', options)).body.count, 4);
  await app.change({});
  const filtered = await proxy('/api/ev/quotes', options);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.headers['Cache-Control'], 'no-store');
  assert.equal(filtered.body.controlsApplied, true);
  assert.deepEqual(filtered.body.quotes.map(row => row.id), ['b1', 'b2']);
  await app.change({ kind: 'event', key: eventControlKey(quotes[0]) });
  const matches = await proxy('/api/ev/matches', options);
  assert.equal(matches.body.count, 1);
  assert.equal(matches.body.matches[0].event, 'East vs West');
  assert.equal(matches.body.matches[0].quoteCount, 1);
  await app.change({ blocked: false, expectedVersion: 1 });
  assert.deepEqual((await proxy('/api/ev/quotes', options)).body.quotes.map(row => row.id), ['a2', 'b2']);
});

test('controls are loaded after upstream fetch and any control/provider failure returns no odds', async () => {
  const order = [];
  const result = await proxy('/api/ev/quotes', { fetcher: async () => { order.push('provider'); return provider(); }, loadControls: async () => { order.push('controls'); return []; } });
  assert.equal(result.status, 200);
  assert.deepEqual(order, ['provider', 'controls']);
  for (const options of [{ loadControls: unavailable }, { loadControls: async () => [], fetcher: unavailable }, { loadControls: async () => [], fetcher: async () => new Response(JSON.stringify({ quotes, partial: true })) }]) {
    const denied = await proxy('/api/ev/quotes', options);
    assert.equal(denied.status, 503);
    assert.equal(denied.body.quotes, undefined);
    assert.doesNotMatch(JSON.stringify(denied.body), /private[.]provider|do-not-expose/);
  }
  await assert.rejects(readEvQuotes({ providerConfig, fetcher: unavailable }), error => error.status === 503 && !/do-not-expose/.test(error.message));
});

test('a provider snapshot over 50,000 quotes is served instead of rejected', async () => {
  // The provider sent 76,799 quotes on 2 Oct 2026; a 50,000 cap blanked every dashboard refresh.
  const large = Array.from({ length: 60_000 }, (_, index) => ({ ...quotes[index % quotes.length], id: `bulk-${index}` }));
  const result = await proxy('/api/ev/quotes', { fetcher: async () => new Response(JSON.stringify({ quotes: large })), loadControls: async () => [] });
  assert.equal(result.status, 200);
  assert.equal(result.body.count, 60_000);
});
