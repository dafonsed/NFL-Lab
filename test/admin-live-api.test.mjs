import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, PASSWORD } from './helpers/admin-api-fixture.mjs';

const reason = 'Reviewed customer support request';
const future = () => new Date(Date.now() + 86400_000).toISOString();

test('real staff read APIs reject anonymous, customer and non-MFA staff sessions', async t => {
  const app = await fixture(t, { staffMfa: false });
  const routes = ['/api/admin/overview', '/api/admin/accounts', '/api/admin/audit', `/api/admin/accounts/${app.customer.id}`];
  for (const route of routes) {
    assert.equal((await app.client().request(route)).status, 401, route);
    assert.equal((await app.customer.client.request(route)).status, 403, route);
    const denied = await app.owner.client.request(route);
    assert.equal(denied.status, 403, route);
    assert.equal(denied.body.code, 'ADMIN_MFA_REQUIRED', route);
  }
  await app.mfa(app.owner);
  assert.equal((await app.owner.client.request('/api/admin/overview')).status, 200);
  await app.system.db.updateTable('user').set({ role: 'data-operator' }).where('id', '=', app.owner.id).execute();
  assert.equal((await app.owner.client.request('/api/admin/overview')).status, 403, 'A role without inspect cannot read account administration.');
});

test('overview and account detail derive actual DB state without private payloads or session secrets', async t => {
  const app = await fixture(t), db = app.system.db, target = app.customer.id;
  const timestamp = new Date().toISOString();
  await db.insertInto('subscription').values({ id: 'sub_local', userId: target, stripeCustomerId: 'cus_private', priceId: 'price_private', latestInvoiceId: 'in_private', plan: 'pro', status: 'active', currentPeriodEnd: future(), paymentConfirmed: 1, updatedAt: timestamp }).execute();
  await db.insertInto('accessGrant').values([
    { id: 'grant-active', userId: target, plan: 'premium', reason, expiresAt: future(), createdAt: timestamp, createdBy: app.owner.id },
    { id: 'grant-expired', userId: target, plan: 'premium', reason, expiresAt: '2020-01-01T00:00:00.000Z', createdAt: timestamp, createdBy: app.owner.id },
    { id: 'grant-revoked', userId: target, plan: 'pro', reason, expiresAt: future(), revokedAt: timestamp, createdAt: timestamp, createdBy: app.owner.id },
  ]).execute();
  await db.insertInto('accountData').values({ userId: target, kind: 'notes', value: JSON.stringify({ storage: { privateNote: 'NEVER_RETURN_CUSTOMER_CONTENT' } }), version: 1, updatedAt: timestamp }).execute();
  const overview = await app.owner.client.request('/api/admin/overview');
  assert.equal(overview.status, 200);
  assert.deepEqual(overview.body.counts, { totalUsers: 2, activeUsers: 2, suspendedUsers: 0, activeSessions: 2, subscriptions: 1, activeGrants: 1 });
  assert.equal(overview.body.actor.id, app.owner.id);
  assert.equal(overview.body.services.mail.configured, true);
  assert.equal(overview.body.services.billing.configured, false);
  assert.equal('revenue' in overview.body.counts, false);
  const detail = await app.owner.client.request(`/api/admin/accounts/${target}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('cache-control'), 'no-store');
  assert.equal(detail.body.user.id, target);
  assert.equal(detail.body.grants.length, 3);
  assert.equal(detail.body.subscriptions.length, 1);
  assert.equal(detail.body.sessions.length, 1);
  assert.equal(detail.body.dataCountUnit, 'stored-collections');
  assert.deepEqual(detail.body.dataKinds.find(item => item.kind === 'notes'), { kind: 'notes', count: 1, updatedAt: timestamp });
  assert.equal(detail.body.dataKinds.find(item => item.kind === 'bets').count, 0);
  const serialized = JSON.stringify(detail.body);
  for (const value of ['NEVER_RETURN_CUSTOMER_CONTENT', 'privateNote', 'encryptedToken', '"token"', '"password"', 'cus_private', 'price_private', 'in_private']) assert.ok(!serialized.includes(value), value);
  assert.equal((await app.owner.client.request('/api/admin/accounts/not-found')).status, 404);
  assert.equal((await app.owner.client.request('/api/admin/accounts/bad%2Fid')).status, 400);
});

test('account search is case-insensitive for IDs, names and emails with bounded pagination and safe actions', async t => {
  const app = await fixture(t);
  const first = await app.owner.client.request('/api/admin/accounts?pageSize=1');
  const second = await app.owner.client.request('/api/admin/accounts?pageSize=1&page=2');
  assert.equal(first.body.hasMore, true);
  assert.equal(second.body.hasMore, false);
  assert.notEqual(first.body.users[0].id, second.body.users[0].id);
  for (const query of ['MIXEDCASE@EXAMPLE.TEST', 'mixedcase CUSTOMER', app.customer.id.toUpperCase()]) {
    const result = await app.owner.client.request(`/api/admin/accounts?q=${encodeURIComponent(query)}`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.users.map(user => user.id), [app.customer.id]);
  }
  assert.equal((await app.owner.client.request('/api/admin/accounts?q=%25')).body.users.length, 0, 'A percent is literal, not a wildcard.');
  assert.equal((await app.owner.client.request('/api/admin/accounts?q=%5F')).body.users.length, 0, 'An underscore is literal, not a wildcard.');
  const users = (await app.owner.client.request('/api/admin/accounts')).body.users;
  assert.deepEqual(users.find(user => user.id === app.owner.id).allowedActions, []);
  assert.ok(users.find(user => user.id === app.customer.id).allowedActions.includes('suspend'));
  assert.ok(!users.find(user => user.id === app.customer.id).allowedActions.includes('set-role'), 'An unprepared customer cannot be promoted.');
  await app.system.db.updateTable('user').set({ status: 'deletion-pending' }).where('id', '=', app.customer.id).execute();
  const deletion = (await app.owner.client.request(`/api/admin/accounts/${app.customer.id}`)).body.user;
  assert.ok(!deletion.allowedActions.includes('suspend') && !deletion.allowedActions.includes('restore'));
  await app.system.db.updateTable('user').set({ role: 'support' }).where('id', '=', app.owner.id).execute();
  assert.ok((await app.owner.client.request('/api/admin/accounts')).body.users.every(user => user.allowedActions.length === 0));
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=10001', 'pageSize=101', 'pageSize=0', 'q=' + 'a'.repeat(121)]) assert.equal((await app.owner.client.request('/api/admin/accounts?' + query)).status, 400, query);
});

test('audit reads are bounded, filterable, ordered and strip credential fields and nested payloads', async t => {
  const app = await fixture(t), timestamp = new Date().toISOString();
  const auditUser = 'audited-record-only';
  await app.system.db.insertInto('accountAudit').values([
    { id: 'audit-old', userId: auditUser, actorId: app.owner.id, action: 'admin.fixture', createdAt: '2020-01-01T00:00:00.000Z', detail: '{}' },
    { id: 'audit-new', userId: auditUser, actorId: app.owner.id, action: 'admin.fixture', createdAt: timestamp, detail: JSON.stringify({ reason: 'Investigated token=unsafe-value and Bearer unsafe-bearer', plan: 'pro', password: 'private-password', token: 'private-token', nested: { secret: 'private-secret' }, source: 'sk_test_not_a_real_key', status: 'active' }) },
    { id: 'audit-other', userId: 'another-user', actorId: null, action: 'test.unrelated', createdAt: timestamp, detail: '{}' },
  ]).execute();
  const first = await app.owner.client.request(`/api/admin/audit?userId=${auditUser}&pageSize=1`);
  assert.equal(first.status, 200); assert.equal(first.body.hasMore, true);
  assert.equal(first.body.events[0].id, 'audit-new');
  assert.equal(first.body.events[0].detail.plan, 'pro');
  const serialized = JSON.stringify(first.body);
  for (const value of ['private-password', 'private-token', 'private-secret', 'unsafe-value', 'unsafe-bearer', 'sk_test_not_a_real_key', 'nested']) assert.ok(!serialized.includes(value), value);
  assert.match(first.body.events[0].detail.reason, /redacted/);
  const second = await app.owner.client.request(`/api/admin/audit?userId=${auditUser}&pageSize=1&page=2`);
  assert.equal(second.body.events[0].id, 'audit-old');
  assert.equal(second.body.hasMore, false);
  assert.equal((await app.owner.client.request('/api/admin/audit?pageSize=1000')).status, 400);
  assert.equal((await app.owner.client.request('/api/admin/audit?userId=')).status, 400);
});

test('all six actual admin mutations persist effects and audit; caller, owner and origin protections remain', async t => {
  const app = await fixture(t), target = app.customer.id, db = app.system.db;
  const action = (body, headers) => app.owner.client.request(`/api/admin/accounts/${target}/action`, { reason, ...body }, headers);
  assert.equal((await action({ action: 'suspend' }, { Origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await app.owner.client.request(`/api/admin/accounts/${app.owner.id}/action`, { action: 'suspend', reason })).status, 403);
  await db.updateTable('session').set({ reauthenticatedAt: null }).where('userId', '=', app.owner.id).execute();
  assert.equal((await action({ action: 'suspend' })).body.code, 'REAUTHENTICATION_REQUIRED');
  assert.equal((await app.owner.client.request('/api/account/reauthenticate', { password: PASSWORD })).status, 200);
  assert.equal((await action({ action: 'revoke-sessions' })).status, 200);
  assert.equal((await db.selectFrom('session').select('id').where('userId', '=', target).execute()).length, 0);
  assert.equal((await action({ action: 'set-role', role: 'support' })).status, 400, 'MFA prerequisite cannot be skipped.');
  assert.equal((await app.customer.client.request('/api/auth/sign-in/email', { email: 'mixedcase@example.test', password: PASSWORD })).status, 200);
  await app.mfa(app.customer);
  assert.equal((await action({ action: 'set-role', role: 'support' })).status, 200);
  assert.equal((await db.selectFrom('user').select('role').where('id', '=', target).executeTakeFirst()).role, 'support');
  assert.equal((await db.selectFrom('session').select('id').where('userId', '=', target).execute()).length, 0);
  assert.equal((await action({ action: 'suspend' })).status, 200);
  assert.equal((await db.selectFrom('user').select('status').where('id', '=', target).executeTakeFirst()).status, 'suspended');
  assert.equal((await app.customer.client.request('/api/account')).status, 401);
  assert.equal((await action({ action: 'restore' })).status, 200);
  assert.equal((await db.selectFrom('user').select('status').where('id', '=', target).executeTakeFirst()).status, 'active');
  assert.equal((await action({ action: 'grant-access', plan: 'premium', expiresAt: future() })).status, 200);
  let grants = await db.selectFrom('accessGrant').selectAll().where('userId', '=', target).execute();
  assert.equal(grants.length, 1); assert.equal(grants[0].plan, 'premium'); assert.equal(grants[0].createdBy, app.owner.id);
  assert.equal((await action({ action: 'revoke-grants' })).status, 200);
  grants = await db.selectFrom('accessGrant').selectAll().where('userId', '=', target).execute(); assert.ok(grants[0].revokedAt);
  const audit = await db.selectFrom('accountAudit').select(['action', 'actorId', 'detail']).where('userId', '=', target).where('action', 'like', 'admin.%').execute();
  assert.deepEqual(audit.map(item => item.action).sort(), ['admin.suspend', 'admin.restore', 'admin.revoke-sessions', 'admin.grant-access', 'admin.revoke-grants', 'admin.set-role'].sort());
  assert.ok(audit.every(item => item.actorId === app.owner.id && JSON.parse(item.detail).reason === reason));
  assert.equal((await action({ action: 'set-role', role: 'owner' })).status, 400);
  await db.updateTable('user').set({ role: 'admin' }).where('id', '=', app.owner.id).execute();
  assert.equal((await action({ action: 'suspend' })).status, 403, 'An admin cannot modify another staff member.');
  await db.updateTable('user').set({ role: 'owner' }).where('id', '=', app.owner.id).execute();
  await db.updateTable('user').set({ role: 'owner' }).where('id', '=', target).execute();
  assert.equal((await action({ action: 'suspend' })).status, 403, 'Another owner remains protected.');
});
