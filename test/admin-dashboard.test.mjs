import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/admin-api-fixture.mjs';
import { readAdminDashboard } from '../lib/accounts/admin-dashboard.mjs';
import { ROLES } from '../lib/accounts/http.mjs';

const quotes = [
  { id: 'dashboard-quote-1', book: 'Observed Book', sport: 'NFL', event: 'Falcons at Saints' },
  { id: 'dashboard-quote-2', book: 'Observed Book', sport: 'NBA', event: 'Lakers at Clippers' },
  { id: 'dashboard-quote-3', book: 'Other Book', sport: 'NFL', event: 'Falcons at Saints' },
];
async function found(app) {
  const user = await app.system.db.selectFrom('user').selectAll().where('id', '=', app.owner.id).executeTakeFirst();
  const session = await app.system.db.selectFrom('session').select(['id', 'mfaVerifiedAt']).where('userId', '=', app.owner.id).where('mfaVerifiedAt', 'is not', null).executeTakeFirst();
  return { user, session, permissions: ROLES[user.role] };
}
function operation(app, id, kind, at, values = {}) {
  return { id, kind, userId: kind === 'ticket' ? app.customer.id : null, title: `${kind} ${id}`, body: 'NEVER_RETURN_PRIVATE_OPERATION_BODY', category: kind === 'ticket' ? 'account' : 'announcement', status: kind === 'ticket' ? 'open' : 'draft', priority: kind === 'ticket' ? 'normal' : null, assigneeId: null, reference: 'NEVER_RETURN_PRIVATE_REFERENCE', publishAt: null, expiresAt: null, publishedAt: null, archivedAt: null, version: 1, createdBy: app.owner.id, updatedBy: app.owner.id, createdAt: at, updatedAt: at, ...values };
}

test('dashboard HTTP requires real staff MFA and only reads each role’s authorized domains', async t => {
  const app = await fixture(t, { staffMfa: false });
  let inventoryCalls = 0;
  app.system.loadAdminMarketQuotes = async () => { inventoryCalls++; return quotes; };
  assert.equal((await app.client().request('/api/admin/dashboard')).status, 401);
  assert.equal((await app.customer.client.request('/api/admin/dashboard')).status, 403);
  assert.equal((await app.owner.client.request('/api/admin/dashboard')).body.code, 'ADMIN_MFA_REQUIRED');
  assert.equal(inventoryCalls, 0);
  await app.mfa(app.owner);
  for (const [role, domains] of [
    ['support', ['accounts', 'support', 'audit', 'services']],
    ['content', ['content']],
    ['data-operator', ['markets']],
  ]) {
    await app.system.db.updateTable('user').set({ role }).where('id', '=', app.owner.id).execute();
    const response = await app.owner.client.request('/api/admin/dashboard');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.actor, { id: app.owner.id, name: 'Staff Owner', role });
    assert.deepEqual(response.body.permissions, ROLES[role]);
    for (const domain of ['accounts', 'support', 'content', 'markets', 'audit', 'services']) assert.equal(response.body[domain] !== null, domains.includes(domain), `${role}: ${domain}`);
    assert.deepEqual(response.body.errors, []);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!JSON.stringify(response.body).includes('owner@example.test'), 'Dashboard identity does not expose email.');
  }
  assert.equal(inventoryCalls, 1, 'Roles without data access never contact the provider.');
  assert.equal((await app.owner.client.request('/api/admin/dashboard', {})).status, 405);
});

test('dashboard aggregates durable counts, classifies publication windows, and bounds private projections', async t => {
  const app = await fixture(t), db = app.system.db;
  app.system.loadAdminMarketQuotes = async () => quotes;
  const at = new Date().toISOString(), past = new Date(Date.now() - 86400_000).toISOString(), future = new Date(Date.now() + 86400_000).toISOString();
  await db.updateTable('user').set({ status: 'suspended' }).where('id', '=', app.customer.id).execute();
  await db.insertInto('subscription').values({ id: 'dashboard-sub', userId: app.customer.id, stripeCustomerId: 'NEVER_RETURN_CUSTOMER_PROVIDER_ID', plan: 'pro', status: 'active', updatedAt: at }).execute();
  await db.insertInto('accessGrant').values([
    { id: 'dashboard-grant-active', userId: app.customer.id, plan: 'pro', reason: 'Private grant reason', expiresAt: future, revokedAt: null, createdAt: at, createdBy: app.owner.id },
    { id: 'dashboard-grant-expired', userId: app.customer.id, plan: 'pro', reason: 'Private grant reason', expiresAt: past, revokedAt: null, createdAt: at, createdBy: app.owner.id },
    { id: 'dashboard-grant-revoked', userId: app.customer.id, plan: 'pro', reason: 'Private grant reason', expiresAt: future, revokedAt: at, createdAt: at, createdBy: app.owner.id },
  ]).execute();
  await db.insertInto('accountData').values({ userId: app.customer.id, kind: 'bets', value: '{"private":"NEVER_RETURN_SAVED_BETS"}', version: 1, updatedAt: at }).execute();
  await db.insertInto('adminOperation').values([
    operation(app, 'ticket-1', 'ticket', at, { priority: 'urgent' }),
    operation(app, 'ticket-2', 'ticket', at, { status: 'in-progress', assigneeId: app.owner.id }),
    operation(app, 'ticket-3', 'ticket', at, { status: 'waiting-on-customer', priority: 'urgent' }),
    operation(app, 'ticket-4', 'ticket', at, { status: 'resolved', priority: 'urgent' }),
    operation(app, 'draft-1', 'content', at), operation(app, 'draft-2', 'content', at),
    operation(app, 'published-1', 'content', at, { status: 'published', publishAt: past, expiresAt: future, publishedAt: past }),
    operation(app, 'scheduled-1', 'content', at, { status: 'published', publishAt: future, publishedAt: at }),
    operation(app, 'scheduled-2', 'content', at, { status: 'published', publishAt: future, publishedAt: at }),
    operation(app, 'expired-1', 'content', at, { status: 'published', publishAt: past, expiresAt: at, publishedAt: past }),
    operation(app, 'archived-1', 'content', at, { status: 'archived', publishAt: past, archivedAt: at }),
  ]).execute();
  await db.insertInto('adminOperationNote').values({ id: 'private-note', operationId: 'ticket-1', authorId: app.owner.id, body: 'NEVER_RETURN_INTERNAL_NOTE', createdAt: at }).execute();
  for (let index = 0; index < 10; index++) await db.insertInto('accountAudit').values({ id: `dashboard-audit-${index}`, userId: app.customer.id, actorId: app.owner.id, action: 'support.updated', detail: JSON.stringify({ reason: 'Bearer SECRET_AUDIT_TOKEN password=SECRET_AUDIT_PASSWORD', operationId: 'ticket-1', privateBody: 'NEVER_RETURN_NESTED_AUDIT', before: { body: 'NEVER_RETURN_NESTED_AUDIT' } }), createdAt: new Date(Date.now() + 1000 + index).toISOString() }).execute();
  const dashboard = await readAdminDashboard({ system: app.system, found: await found(app), now: at });
  assert.deepEqual(dashboard.accounts, { totalUsers: 2, activeUsers: 1, suspendedUsers: 1, activeSessions: 1, subscriptions: 1, activeGrants: 1 });
  const { latest: tickets, ...supportCounts } = dashboard.support;
  assert.deepEqual(supportCounts, { total: 4, open: 3, urgent: 2, unassigned: 2 });
  assert.equal(tickets.length, 4);
  const { latest: content, ...contentCounts } = dashboard.content;
  assert.deepEqual(contentCounts, { draft: 2, published: 1, scheduled: 2, expired: 1, archived: 1 });
  assert.equal(content.length, 5);
  assert.equal(content.find(item => item.id === 'scheduled-1').effectiveStatus, 'scheduled');
  assert.equal(content.find(item => item.id === 'expired-1').effectiveStatus, 'expired');
  assert.equal(dashboard.markets.sources.length, 2);
  assert.equal(dashboard.markets.events.length, 2);
  assert.equal(dashboard.markets.observedQuotes, 3);
  assert.equal(dashboard.audit.length, 8);
  assert.equal(dashboard.audit[0].id, 'dashboard-audit-9');
  assert.equal(dashboard.audit[0].detail.operationId, 'ticket-1');
  assert.ok(dashboard.audit[0].detail.reason.includes('[redacted]'));
  assert.deepEqual(dashboard.services, { mail: { configured: true }, billing: { configured: false } });
  assert.deepEqual(dashboard.errors, []);
  const serialized = JSON.stringify(dashboard);
  for (const privateValue of ['NEVER_RETURN', 'SECRET_AUDIT_TOKEN', 'SECRET_AUDIT_PASSWORD', 'Private grant reason', 'revenue', 'trend', 'history']) assert.ok(!serialized.includes(privateValue), privateValue);
  await db.updateTable('adminOperation').set({ status: 'resolved' }).where('id', '=', 'ticket-1').execute();
  const refreshed = await readAdminDashboard({ system: app.system, found: await found(app), now: at });
  assert.equal(refreshed.support.open, 2, 'A fresh dashboard sees the committed database state, not a fixture cache.');
});

test('provider and missing-domain failures preserve unaffected dashboard data with safe explicit errors', async t => {
  const app = await fixture(t), db = app.system.db;
  app.system.loadAdminMarketQuotes = async () => { throw new Error('SECRET_PROVIDER_PASSWORD=do-not-return'); };
  await db.insertInto('adminMarketControl').values({ scope: 'ev-local-api', kind: 'source', key: 'observed book', label: 'Observed Book', selector: JSON.stringify({ book: 'Observed Book' }), reason: 'Persisted provider suppression', blocked: 1, version: 1, updatedAt: new Date().toISOString(), updatedBy: app.owner.id }).execute();
  const response = await app.owner.client.request('/api/admin/dashboard');
  assert.equal(response.status, 200);
  assert.equal(response.body.markets.inventoryUnavailable, true);
  assert.equal(response.body.markets.observedQuotes, null);
  assert.equal(response.body.markets.sources[0].blocked, true);
  assert.equal(response.body.accounts.totalUsers, 2);
  assert.ok(response.body.errors.some(error => error.domain === 'markets' && error.errorCode === 'MARKET_INVENTORY_UNAVAILABLE'));
  assert.ok(!JSON.stringify(response.body).includes('SECRET_PROVIDER_PASSWORD'));
  await db.schema.dropTable('adminOperationNote').execute();
  await db.schema.dropTable('adminOperation').execute();
  app.system.billing.summary = async () => { throw new Error('SECRET_DATABASE_URL=do-not-return'); };
  const partial = await app.owner.client.request('/api/admin/dashboard');
  assert.equal(partial.status, 200);
  assert.equal(partial.body.support, null);
  assert.equal(partial.body.content, null);
  assert.equal(partial.body.services, null);
  assert.equal(partial.body.accounts.totalUsers, 2);
  assert.ok(Array.isArray(partial.body.audit));
  assert.ok(partial.body.errors.some(error => error.domain === 'support' && error.errorCode === 'ADMIN_MIGRATION_REQUIRED'));
  assert.ok(partial.body.errors.some(error => error.domain === 'content' && error.errorCode === 'ADMIN_MIGRATION_REQUIRED'));
  assert.ok(partial.body.errors.some(error => error.domain === 'services' && error.errorCode === 'DASHBOARD_SERVICES_UNAVAILABLE'));
  assert.ok(!JSON.stringify(partial.body).includes('SECRET_DATABASE_URL'));
});

test('staff account directory filters before pagination and validates its scope without changing default account views', async t => {
  const app = await fixture(t), db = app.system.db;
  const customer = await db.selectFrom('user').selectAll().where('id', '=', app.customer.id).executeTakeFirst();
  const secondStaffId = randomUUID();
  await db.insertInto('user').values({ ...customer, id: secondStaffId, name: 'Second staff', email: 'second.staff@example.test', role: 'support' }).execute();
  const first = await app.owner.client.request('/api/admin/accounts?scope=staff&pageSize=1');
  const second = await app.owner.client.request('/api/admin/accounts?scope=staff&pageSize=1&page=2');
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal(first.body.hasMore, true); assert.equal(second.body.hasMore, false);
  assert.deepEqual(new Set([first.body.users[0].id, second.body.users[0].id]), new Set([app.owner.id, secondStaffId]));
  assert.equal((await app.owner.client.request('/api/admin/accounts')).body.users.length, 3);
  assert.equal((await app.owner.client.request('/api/admin/accounts?scope=all')).body.users.length, 3);
  assert.equal((await app.owner.client.request('/api/admin/accounts?scope=staff&q=MixedCase')).body.users.length, 0);
  for (const scope of ['', 'customers', 'owner', 'true']) assert.equal((await app.owner.client.request('/api/admin/accounts?scope=' + scope)).status, 400);
});
