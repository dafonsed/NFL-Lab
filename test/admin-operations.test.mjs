import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openAccountDatabase, migrateAccountTables } from '../lib/accounts/database.mjs';
import { handleAdminOperations, operationPermission, readActiveContent } from '../lib/accounts/admin-operations.mjs';

const NOW = '2026-09-28T18:00:00.000Z';
const REASON = 'Reviewed the real customer report and recorded this change.';
const users = [
  { id: 'customer-one', name: 'Customer one', email: 'one@example.test', role: 'customer', status: 'active', emailVerified: 1, twoFactorEnabled: 0 },
  { id: 'customer-two', name: 'Customer two', email: 'two@example.test', role: 'customer', status: 'active', emailVerified: 1, twoFactorEnabled: 0 },
  { id: 'support-agent', name: 'Support agent', email: 'support@example.test', role: 'support', status: 'active', emailVerified: 1, twoFactorEnabled: 1 },
  { id: 'content-editor', name: 'Content editor', email: 'content@example.test', role: 'content', status: 'active', emailVerified: 1, twoFactorEnabled: 1 },
];
const identity = id => ({ user: { ...users.find(user => user.id === id) }, session: { id: `session-${id}`, mfaVerifiedAt: NOW }, permissions: id === 'support-agent' ? ['support'] : id === 'content-editor' ? ['content'] : [] });
const customer = identity('customer-one'), otherCustomer = identity('customer-two'), support = identity('support-agent'), editor = identity('content-editor');
const ticketBody = { title: 'My tracked selection needs review', body: 'The official result differs from the result shown on my tracked selection.', category: 'grading-dispute', reference: 'My saved bet reference' };

async function fixture(t, file = ':memory:') {
  const { db, type } = await openAccountDatabase({ ACCOUNT_DB_PATH: file });
  await db.schema.createTable('user').ifNotExists().addColumn('id', 'text', c => c.primaryKey()).addColumn('name', 'text', c => c.notNull()).addColumn('email', 'text', c => c.notNull()).addColumn('role', 'text', c => c.notNull()).addColumn('status', 'text', c => c.notNull()).addColumn('emailVerified', 'integer', c => c.notNull()).addColumn('twoFactorEnabled', 'integer', c => c.notNull()).execute();
  await migrateAccountTables(db);
  await migrateAccountTables(db);
  for (const user of users) await db.insertInto('user').values(user).onConflict(c => c.column('id').doNothing()).execute();
  let closed = false;
  const system = { db, type, async audit(input, tx = db) { await tx.insertInto('accountAudit').values({ id: randomUUID(), userId: input.userId ?? null, actorId: input.actorId ?? null, action: input.action, detail: JSON.stringify(input.detail || {}), createdAt: NOW }).execute(); } };
  const close = async () => { if (!closed) { closed = true; await db.destroy(); } };
  t.after(close);
  const request = (route, method = 'GET', body, found = support, now = NOW) => handleAdminOperations({ system, found, url: new URL(route, 'http://localhost'), method, body, now });
  return { system, db, request, close };
}
const expectError = (status, code) => error => error.status === status && (!code || error.code === code);
async function createTicket(app, overrides = {}) { return app.request('/api/account/support', 'POST', { ...ticketBody, ...overrides }, customer); }
async function createDraft(app, overrides = {}) { return app.request('/api/admin/content', 'POST', { title: 'Service announcement', body: 'An actual persisted announcement for our customers.', reason: REASON, ...overrides }, editor); }

test('customer reports persist to the database; ownership and internal-note privacy apply to every read', async t => {
  const app = await fixture(t);
  assert.deepEqual((await app.request('/api/account/support', 'GET', undefined, customer)).items, []);
  const created = await createTicket(app);
  assert.equal(created.item.status, 'open');
  assert.equal(created.item.version, 1);
  const stored = await app.db.selectFrom('adminOperation').selectAll().where('id', '=', created.item.id).executeTakeFirst();
  assert.equal(stored.userId, customer.user.id);
  assert.equal(stored.createdBy, customer.user.id);
  assert.equal((await app.request('/api/admin/support')).items.length, 1);
  const updated = await app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: 'in-progress', priority: 'high', assigneeId: support.user.id, note: 'PRIVATE STAFF INVESTIGATION: compare the source result snapshot.', reason: REASON });
  assert.equal(updated.item.version, 2);
  assert.equal(updated.item.assigneeId, support.user.id);
  const staffDetail = await app.request(`/api/admin/support/${created.item.id}`);
  assert.equal(staffDetail.notes.length, 1);
  assert.equal(staffDetail.notes[0].authorId, support.user.id);
  assert.ok(staffDetail.notes[0].body.includes('PRIVATE STAFF'));
  const customerDetail = await app.request(`/api/account/support/${created.item.id}`, 'GET', undefined, customer);
  assert.equal(customerDetail.item.status, 'in-progress');
  for (const secret of ['PRIVATE STAFF', 'assigneeId', 'updatedBy', 'createdBy', 'notes', REASON]) assert.ok(!JSON.stringify(customerDetail).includes(secret), secret);
  assert.equal((await app.request('/api/account/support?userId=customer-one', 'GET', undefined, otherCustomer)).items.length, 0);
  await assert.rejects(() => app.request(`/api/account/support/${created.item.id}`, 'GET', undefined, otherCustomer), expectError(404));
  const audit = await app.db.selectFrom('accountAudit').selectAll().where('action', '=', 'support.updated').executeTakeFirst();
  assert.equal(audit.actorId, support.user.id);
  assert.equal(audit.userId, customer.user.id);
  assert.equal(JSON.parse(audit.detail).before.status, 'open');
  assert.equal(JSON.parse(audit.detail).after.status, 'in-progress');
  assert.equal(JSON.parse(audit.detail).reason, REASON);
  assert.ok(!audit.detail.includes('PRIVATE STAFF'), 'Audit records reference immutable notes without copying their private bodies.');
});

test('ticket writes reject spoofed owners, invalid links, invalid assignments, methods, and unauthorized staff', async t => {
  const app = await fixture(t);
  await assert.rejects(() => app.request('/api/account/support', 'POST', { ...ticketBody, userId: otherCustomer.user.id }, customer), expectError(400));
  await assert.rejects(() => app.request('/api/admin/support', 'POST', { ...ticketBody, userId: 'missing-user', reason: REASON }), expectError(404));
  await assert.rejects(() => app.request('/api/admin/support', 'POST', { ...ticketBody, userId: customer.user.id, assigneeId: customer.user.id, reason: REASON }), expectError(400));
  await assert.rejects(() => app.request('/api/admin/support', 'GET', undefined, customer), expectError(403));
  await assert.rejects(() => app.request('/api/admin/support', 'GET', undefined, editor), expectError(403));
  await assert.rejects(() => app.request('/api/admin/content', 'GET', undefined, support), expectError(403));
  await assert.rejects(() => app.request('/api/admin/support', 'GET', undefined, { ...support, session: { mfaVerifiedAt: null } }), expectError(403, 'ADMIN_MFA_REQUIRED'));
  await assert.rejects(() => app.request('/api/account/support', 'GET', undefined, null), expectError(401));
  const created = await createTicket(app);
  await assert.rejects(() => app.request(`/api/account/support/${created.item.id}`, 'PATCH', { version: 1, status: 'resolved', reason: REASON }, customer), expectError(405));
  await assert.rejects(() => app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, title: 'Replacing the original customer report', reason: REASON }), expectError(400));
  await assert.rejects(() => app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: 'notification-sent', reason: REASON }), expectError(400));
  await assert.rejects(() => app.request('/api/admin/support/bad%2Fid'), expectError(400));
  assert.equal(await app.request('/api/admin/unrelated-service'), null);
  assert.equal(operationPermission('/api/admin/support/one'), 'support');
  assert.equal(operationPermission('/api/admin/content/one/publish'), 'content');
  assert.equal(operationPermission('/api/account/support'), null);
  assert.equal(operationPermission('/api/admin/support-fake'), null);
});

test('simultaneous ticket edits enforce optimistic versions without duplicate notes or partial audit', async t => {
  const app = await fixture(t);
  const created = await createTicket(app);
  const outcomes = await Promise.allSettled([
    app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: 'in-progress', note: 'First concurrent investigation note.', reason: REASON }),
    app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: 'resolved', note: 'Second concurrent resolution note.', reason: REASON }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'VERSION_CONFLICT');
  const detail = await app.request(`/api/admin/support/${created.item.id}`);
  assert.equal(detail.item.version, 2);
  assert.equal(detail.notes.length, 1);
  assert.equal((await app.db.selectFrom('accountAudit').selectAll().where('action', '=', 'support.updated').execute()).length, 1);
  await assert.rejects(() => app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: detail.item.status, reason: REASON }), expectError(409, 'VERSION_CONFLICT'));
  await assert.rejects(() => app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 2, status: detail.item.status, reason: REASON }), expectError(409, 'NO_CHANGES'));
});

test('row edits and immutable notes roll back if their audit event cannot commit', async t => {
  const app = await fixture(t);
  const created = await createTicket(app);
  const before = await app.db.selectFrom('adminOperation').selectAll().where('id', '=', created.item.id).executeTakeFirst();
  app.system.audit = async () => { throw new Error('Simulated audit storage failure'); };
  await assert.rejects(() => app.request(`/api/admin/support/${created.item.id}`, 'PATCH', { version: 1, status: 'resolved', note: 'This note must roll back with the action.', reason: REASON }), /audit storage failure/);
  assert.deepEqual(await app.db.selectFrom('adminOperation').selectAll().where('id', '=', created.item.id).executeTakeFirst(), before);
  assert.deepEqual(await app.db.selectFrom('adminOperationNote').selectAll().execute(), []);
  await assert.rejects(() => createDraft(app), /audit storage failure/);
  assert.deepEqual(await app.db.selectFrom('adminOperation').selectAll().where('kind', '=', 'content').execute(), []);
});

test('draft, scheduled, live, expired, and archived content have real publication effects at read time', async t => {
  const app = await fixture(t);
  const draft = await createDraft(app, { publishAt: '2026-09-29T12:00:00.000Z', expiresAt: '2026-09-30T12:00:00.000Z' });
  assert.equal(draft.item.status, 'draft');
  assert.deepEqual((await app.request('/api/content', 'GET', undefined, null)).items, []);
  const published = await app.request(`/api/admin/content/${draft.item.id}/publish`, 'POST', { version: 1, reason: REASON }, editor);
  assert.equal(published.item.status, 'published');
  assert.equal(published.item.effectiveStatus, 'scheduled');
  assert.equal(published.item.version, 2);
  assert.deepEqual((await app.request('/api/content', 'GET', undefined, null)).items, []);
  const live = await app.request('/api/content', 'GET', undefined, null, '2026-09-29T12:00:00.000Z');
  assert.equal(live.items[0].id, draft.item.id);
  for (const privateField of ['createdBy', 'updatedBy', 'assigneeId', 'userId', 'reason']) assert.ok(!(privateField in live.items[0]));
  assert.deepEqual((await app.request('/api/content', 'GET', undefined, null, '2026-09-30T12:00:00.000Z')).items, []);
  const archived = await app.request(`/api/admin/content/${draft.item.id}/archive`, 'POST', { version: 2, reason: REASON }, editor, '2026-09-29T13:00:00.000Z');
  assert.equal(archived.item.status, 'archived');
  assert.deepEqual((await app.request('/api/content', 'GET', undefined, null, '2026-09-29T14:00:00.000Z')).items, []);
  assert.deepEqual((await app.db.selectFrom('accountAudit').select('action').where('action', 'like', 'content.%').execute()).map(row => row.action).sort(), ['content.archived', 'content.created', 'content.published']);
});

test('draft edits validate merged dates, reasons and versions; publishing cannot mutate protected states', async t => {
  const app = await fixture(t);
  await assert.rejects(() => createDraft(app, { publishAt: '2026-02-30T12:00:00Z' }), expectError(400));
  await assert.rejects(() => createDraft(app, { publishAt: '2026-10-01T00:00:00Z', expiresAt: '2026-09-30T00:00:00Z' }), expectError(400));
  await assert.rejects(() => createDraft(app, { reason: 'short' }), expectError(400));
  const draft = await createDraft(app, { publishAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-03T00:00:00Z' });
  await assert.rejects(() => app.request(`/api/admin/content/${draft.item.id}`, 'PATCH', { version: 1, expiresAt: '2026-09-30T00:00:00Z', reason: REASON }, editor), expectError(400));
  const updated = await app.request(`/api/admin/content/${draft.item.id}`, 'PATCH', { version: 1, title: 'Updated real notice', body: 'Updated plain-text content with a real draft revision.', reason: REASON }, editor);
  assert.equal(updated.item.version, 2);
  assert.equal(updated.item.title, 'Updated real notice');
  await assert.rejects(() => app.request(`/api/admin/content/${draft.item.id}/publish`, 'POST', { version: 1, reason: REASON }, editor), expectError(409, 'VERSION_CONFLICT'));
  await app.request(`/api/admin/content/${draft.item.id}/publish`, 'POST', { version: 2, reason: REASON }, editor);
  await assert.rejects(() => app.request(`/api/admin/content/${draft.item.id}`, 'PATCH', { version: 3, body: 'Should never update a published notice in place.', reason: REASON }, editor), expectError(409, 'CONTENT_NOT_DRAFT'));
  await assert.rejects(() => app.request(`/api/admin/content/${draft.item.id}/publish`, 'POST', { version: 3, reason: REASON }, editor), expectError(409, 'CONTENT_NOT_DRAFT'));
  await assert.rejects(() => app.request(`/api/admin/content/${draft.item.id}`, 'PATCH', { version: 3, status: 'published', reason: REASON }, editor), expectError(400));
  const expired = await createDraft(app, { expiresAt: '2026-01-01T00:00:00Z' });
  await assert.rejects(() => app.request(`/api/admin/content/${expired.item.id}/publish`, 'POST', { version: 1, reason: REASON }, editor), expectError(400));
});

test('lists and internal notes have bounded deterministic pagination and literal search', async t => {
  const app = await fixture(t);
  const first = await createTicket(app, { title: 'Literal % character report' });
  await createTicket(app, { title: 'A second real customer report' });
  const page1 = await app.request('/api/admin/support?pageSize=1');
  const page2 = await app.request('/api/admin/support?pageSize=1&page=2');
  assert.equal(page1.hasMore, true);
  assert.equal(page2.hasMore, false);
  assert.notEqual(page1.items[0].id, page2.items[0].id);
  assert.equal((await app.request('/api/admin/support?q=%25')).items.length, 1);
  assert.equal((await app.request('/api/admin/support?q=%5F')).items.length, 0);
  for (const query of ['pageSize=101', 'pageSize=0', 'page=10001', 'page=-1', 'status=fake', 'priority=unbounded']) await assert.rejects(() => app.request('/api/admin/support?' + query), expectError(400));
  for (let version = 1; version <= 2; version++) await app.request(`/api/admin/support/${first.item.id}`, 'PATCH', { version, note: `Persisted internal note number ${version}.`, reason: REASON });
  const notes1 = await app.request(`/api/admin/support/${first.item.id}?notesPageSize=1`);
  const notes2 = await app.request(`/api/admin/support/${first.item.id}?notesPageSize=1&notesPage=2`);
  assert.equal(notes1.notesHasMore, true);
  assert.equal(notes2.notesHasMore, false);
  assert.notEqual(notes1.notes[0].id, notes2.notes[0].id);
  await assert.rejects(() => app.request(`/api/admin/support/${first.item.id}?notesPageSize=1000`), expectError(400));
  await assert.rejects(() => app.request('/api/content?pageSize=1000', 'GET', undefined, null), expectError(400));
});

test('tickets, staff notes and published content survive closing and reopening persistent storage', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sportslab-operations-'));
  const databasePath = path.join(directory, 'accounts.sqlite');
  const app = await fixture(t, databasePath);
  const ticket = await createTicket(app);
  await app.request(`/api/admin/support/${ticket.item.id}`, 'PATCH', { version: 1, status: 'resolved', note: 'Persistent investigation note.', reason: REASON });
  const draft = await createDraft(app);
  await app.request(`/api/admin/content/${draft.item.id}/publish`, 'POST', { version: 1, reason: REASON }, editor);
  await app.close();
  const reopened = await fixture(t, databasePath);
  const detail = await reopened.request(`/api/admin/support/${ticket.item.id}`);
  assert.equal(detail.item.status, 'resolved');
  assert.equal(detail.notes[0].body, 'Persistent investigation note.');
  assert.equal((await readActiveContent({ system: reopened.system, now: NOW })).items[0].id, draft.item.id);
  assert.equal((await reopened.db.selectFrom('accountMigration').selectAll().where('version', '=', '2026-09-28-admin-operations-v1').execute()).length, 1);
  await reopened.close();
  await rm(directory, { recursive: true, force: true });
});
