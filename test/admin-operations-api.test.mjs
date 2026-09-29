import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, PASSWORD } from './helpers/admin-api-fixture.mjs';
import { filterMarketQuotes, readMarketControls } from '../lib/admin-market-controls.mjs';

const reason = 'Verified this change with the customer';
const report = { title: 'Incorrect market line', body: 'The saved line differs from the latest market.', category: 'incorrect-line', reference: 'market-fixture-01' };
const notice = { title: 'Scheduled service notice', body: 'Customer support reports are available.', category: 'announcement', reason };
const quotes = [
  { id: 'quote-1', book: 'Fixture Book', sport: 'NFL', event: 'Falcons at Saints' },
  { id: 'quote-2', book: 'Fixture Alternate', sport: 'NFL', event: 'Falcons at Saints' },
  { id: 'quote-3', book: 'Fixture Alternate', sport: 'NBA', event: 'Lakers at Clippers' },
];
const setRole = (app, role) => app.system.db.updateTable('user').set({ role }).where('id', '=', app.owner.id).execute();
const clearRecent = app => app.system.db.updateTable('session').set({ reauthenticatedAt: null }).where('userId', '=', app.owner.id).execute();
async function confirm(app) { assert.equal((await app.owner.client.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200); }

test('operation capabilities and reads enforce real roles and verified MFA independently of account inspection', async t => {
  const app = await fixture(t, { staffMfa: false });
  let inventoryCalls = 0;
  app.system.loadAdminMarketQuotes = async () => { inventoryCalls++; return quotes; };
  for (const route of ['/api/admin/capabilities', '/api/admin/support', '/api/admin/content', '/api/admin/market-controls']) {
    assert.equal((await app.client().request(route)).status, 401, route);
    assert.equal((await app.customer.client.request(route)).status, 403, route);
    const noMfa = await app.owner.client.request(route);
    assert.equal(noMfa.status, 403, route); assert.equal(noMfa.body.code, 'ADMIN_MFA_REQUIRED', route);
  }
  assert.equal(inventoryCalls, 0, 'Unauthorized reads never load quote inventory.');
  await app.mfa(app.owner);
  for (const [role, allowed] of [['support', 'support'], ['content', 'content'], ['data-operator', 'market-controls']]) {
    await setRole(app, role);
    const capability = await app.owner.client.request('/api/admin/capabilities');
    assert.equal(capability.status, 200); assert.equal(capability.body.actor.id, app.owner.id); assert.equal(capability.body.actor.role, role);
    for (const path of ['support', 'content', 'market-controls']) assert.equal((await app.owner.client.request(`/api/admin/${path}`)).status, path === allowed ? 200 : 403, `${role}: ${path}`);
    if (role !== 'support') assert.equal((await app.owner.client.request('/api/admin/accounts')).status, 403);
  }
  assert.equal(inventoryCalls, 1);
});

test('customer support uses the authenticated identity, scopes reads and keeps internal notes private', async t => {
  const app = await fixture(t), customer = app.customer.client;
  assert.equal((await app.client().request('/api/account/support')).status, 401);
  assert.equal((await customer.request('/api/account/support', report, { Origin: 'https://outside.example.test' })).status, 403);
  assert.equal((await customer.request('/api/account/support', { ...report, userId: app.owner.id })).status, 400);
  assert.equal((await customer.request('/api/account/support', { ...report, priority: 'urgent' })).status, 400);
  const created = await customer.request('/api/account/support', report);
  assert.equal(created.status, 200); const item = created.body.item;
  const persisted = await app.system.db.selectFrom('adminOperation').selectAll().where('id', '=', item.id).executeTakeFirst();
  assert.equal(persisted.userId, app.customer.id); assert.equal(persisted.createdBy, app.customer.id); assert.equal(persisted.priority, 'normal');
  await confirm(app);
  const privateReason = 'PRIVATE_STAFF_REASON_731 investigated customer support';
  const updated = await app.owner.client.request(`/api/admin/support/${item.id}`, { version: 1, status: 'in-progress', priority: 'high', assigneeId: app.owner.id, note: 'Private staff note must stay confidential.', reason: privateReason }, {}, 'PATCH');
  assert.equal(updated.status, 200); assert.equal(updated.body.item.version, 2);
  const detail = await customer.request(`/api/account/support/${item.id}`);
  assert.equal(detail.status, 200); assert.equal(detail.body.item.status, 'in-progress');
  for (const key of ['priority', 'assigneeId', 'createdBy', 'updatedBy', 'userId']) assert.equal(key in detail.body.item, false, key);
  assert.equal('notes' in detail.body, false); assert.ok(!JSON.stringify(detail.body).includes('Private staff note'));
  assert.equal((await app.owner.client.request(`/api/account/support/${item.id}`)).status, 404, 'A different signed-in account cannot read the customer report.');
  assert.equal((await app.owner.client.request('/api/account/support')).body.items.length, 0);
  assert.equal((await customer.request(`/api/account/support/${item.id}`, { version: 2, status: 'resolved' }, {}, 'PATCH')).status, 405);
  await customer.request('/api/account/support', { ...report, title: 'Second report' });
  const page = await customer.request('/api/account/support?pageSize=1');
  assert.equal(page.body.items.length, 1); assert.equal(page.body.hasMore, true);
  assert.equal((await customer.request('/api/account/support?pageSize=101')).status, 400);
  const staffDetail = await app.owner.client.request(`/api/admin/support/${item.id}`);
  assert.equal(staffDetail.body.notes[0].body, 'Private staff note must stay confidential.');
  const audit = await app.system.db.selectFrom('accountAudit').selectAll().where('action', '=', 'support.updated').executeTakeFirst();
  assert.equal(audit.actorId, app.owner.id); assert.equal(audit.userId, app.customer.id); assert.equal(JSON.parse(audit.detail).reason, privateReason);
  assert.ok(!audit.detail.includes('Private staff note'));
  assert.equal((await customer.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
  const exported = await customer.request('/api/account/export');
  assert.equal(exported.status, 200); assert.equal(exported.body.supportReports.length, 2);
  assert.equal(exported.body.supportReports.find(row => row.id === item.id).body, report.body);
  const serializedExport = JSON.stringify(exported.body);
  assert.ok(!serializedExport.includes(privateReason)); assert.ok(!serializedExport.includes('Private staff note'));
  assert.ok(!serializedExport.includes('assigneeId')); assert.ok(!serializedExport.includes(app.owner.id));
});

test('staff support mutations require origin and recent proof, persist optimistic updates and audit without sending mail', async t => {
  const app = await fixture(t); await setRole(app, 'support');
  const body = { ...report, userId: app.customer.id, reason };
  await clearRecent(app);
  assert.equal((await app.owner.client.request('/api/admin/support', body)).status, 403);
  assert.equal((await app.owner.client.request('/api/admin/support', body, { Origin: '' })).body.code, 'ORIGIN_REJECTED');
  await confirm(app);
  const outboxBefore = await app.system.db.selectFrom('accountMail').select(({ fn }) => fn.countAll().as('n')).executeTakeFirst();
  const created = await app.owner.client.request('/api/admin/support', body);
  assert.equal(created.status, 200); const item = created.body.item;
  const path = `/api/admin/support/${item.id}`;
  assert.equal((await app.owner.client.request(path, { version: 1, status: 'resolved', reason }, { 'Sec-Fetch-Site': 'cross-site' }, 'PATCH')).status, 403);
  await clearRecent(app);
  assert.equal((await app.owner.client.request(path, { version: 1, status: 'resolved', reason }, {}, 'PATCH')).status, 403);
  await confirm(app);
  assert.equal((await app.owner.client.request(path, { version: 1, status: 'resolved', reason }, {}, 'PATCH')).status, 200);
  assert.equal((await app.owner.client.request(path, { version: 1, priority: 'urgent', reason }, {}, 'PATCH')).status, 409);
  assert.equal((await app.owner.client.request(path)).body.item.status, 'resolved');
  const outboxAfter = await app.system.db.selectFrom('accountMail').select(({ fn }) => fn.countAll().as('n')).executeTakeFirst();
  assert.equal(outboxAfter.n, outboxBefore.n, 'Ticket operations do not pretend to send external notifications.');
  const audit = await app.system.db.selectFrom('accountAudit').select('action').where('userId', '=', app.customer.id).where('action', 'like', 'support.%').execute();
  assert.deepEqual(audit.map(row => row.action).sort(), ['support.created', 'support.updated']);
});

test('content drafts, publication windows and archive use real DB state with origin, MFA, role and recent proof', async t => {
  const app = await fixture(t); await setRole(app, 'content');
  assert.deepEqual((await app.client().request('/api/content')).body.items, []);
  await clearRecent(app);
  assert.equal((await app.owner.client.request('/api/admin/content', notice)).status, 403);
  assert.equal((await app.owner.client.request('/api/admin/content', notice, { Origin: 'https://outside.example.test' })).status, 403);
  await confirm(app);
  const created = await app.owner.client.request('/api/admin/content', notice);
  assert.equal(created.status, 200); const id = created.body.item.id, path = `/api/admin/content/${id}`;
  assert.deepEqual((await app.client().request('/api/content')).body.items, []);
  assert.equal((await app.owner.client.request(path, { version: 1, body: 'Updated public notice.', reason }, {}, 'PATCH')).status, 200);
  assert.equal((await app.owner.client.request(path + '/publish', { version: 1, reason })).status, 409);
  await clearRecent(app);
  assert.equal((await app.owner.client.request(path + '/publish', { version: 2, reason })).status, 403);
  await confirm(app);
  assert.equal((await app.owner.client.request(path + '/publish', { version: 2, reason }, { Origin: '' })).status, 403);
  assert.equal((await app.owner.client.request(path + '/publish', { version: 2, reason })).status, 200);
  const publicItems = (await app.client().request('/api/content')).body.items;
  assert.equal(publicItems[0].id, id); assert.equal(publicItems[0].body, 'Updated public notice.');
  for (const key of ['createdBy', 'updatedBy', 'reason', 'userId']) assert.equal(key in publicItems[0], false);
  assert.equal((await app.owner.client.request(path, { version: 3, body: 'Cannot edit a published notice', reason }, {}, 'PATCH')).status, 409);
  const scheduled = await app.owner.client.request('/api/admin/content', { ...notice, publishAt: new Date(Date.now() + 86400_000).toISOString() });
  assert.equal((await app.owner.client.request(`/api/admin/content/${scheduled.body.item.id}/publish`, { version: 1, reason })).body.item.effectiveStatus, 'scheduled');
  assert.equal((await app.client().request('/api/content')).body.items.length, 1);
  assert.equal((await app.owner.client.request(path + '/archive', { version: 3, reason })).status, 200);
  assert.deepEqual((await app.client().request('/api/content')).body.items, []);
  const audit = await app.system.db.selectFrom('accountAudit').selectAll().where('action', 'like', 'content.%').execute();
  assert.ok(audit.every(row => row.actorId === app.owner.id && JSON.parse(row.detail).reason === reason));
  assert.ok(audit.some(row => row.action === 'content.archived'));
});

test('market-control HTTP routes use injected inventory and persist audited distribution suppression with fresh authorization', async t => {
  const app = await fixture(t); await setRole(app, 'data-operator');
  let inventoryCalls = 0;
  app.system.loadAdminMarketQuotes = async () => { inventoryCalls++; return quotes; };
  const route = '/api/admin/market-controls', body = { kind: 'source', key: 'fixture book', blocked: true, expectedVersion: 0, reason };
  const inventory = await app.owner.client.request(route);
  assert.equal(inventory.status, 200); assert.equal(inventory.body.observedQuotes, 3); assert.equal(inventory.body.sources.length, 2);
  await clearRecent(app);
  assert.equal((await app.owner.client.request(route, body)).status, 403);
  assert.equal((await app.owner.client.request(route, body, { Origin: '' })).body.code, 'ORIGIN_REJECTED');
  assert.equal(inventoryCalls, 1, 'Rejected changes do not request provider inventory.');
  await confirm(app);
  const suppressed = await app.owner.client.request(route, body);
  assert.equal(suppressed.status, 200); assert.equal(suppressed.body.control.version, 1); assert.equal(suppressed.body.upstreamChanged, false);
  assert.deepEqual(filterMarketQuotes(quotes, await readMarketControls(app.system.db)).map(quote => quote.id), ['quote-2', 'quote-3']);
  assert.equal((await app.owner.client.request(route, body)).status, 409);
  assert.equal((await app.owner.client.request(route, { ...body, key: 'nonexistent source' })).status, 404);
  app.system.loadAdminMarketQuotes = async () => { throw new Error('Simulated provider outage'); };
  const degraded = await app.owner.client.request(route);
  assert.equal(degraded.status, 200); assert.equal(degraded.body.inventoryUnavailable, true); assert.equal(degraded.body.sources[0].observed, false); assert.equal(degraded.body.sources[0].blocked, true);
  assert.equal((await app.owner.client.request(route, { ...body, blocked: false, expectedVersion: 1 })).status, 200);
  assert.equal(filterMarketQuotes(quotes, await readMarketControls(app.system.db)).length, 3);
  const audit = await app.system.db.selectFrom('accountAudit').selectAll().where('action', 'like', 'admin.market.%').execute();
  assert.deepEqual(audit.map(row => row.action).sort(), ['admin.market.source.restore', 'admin.market.source.suppress']);
  assert.ok(audit.every(row => row.actorId === app.owner.id && JSON.parse(row.detail).reason === reason));
});
