import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { migrateAccountTables } from '../lib/accounts/database.mjs';
import { createAccountMail } from '../lib/accounts/mail.mjs';
import { migrateBilling } from '../lib/accounts/billing.mjs';
import { migrateTrialNotices, sweepTrialNotices } from '../lib/accounts/trials.mjs';
import { bootstrapOwner, runAccountCommand } from '../scripts/accounts.mjs';

async function fixture(t) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
  t.after(() => db.destroy());
  await db.schema.createTable('user').addColumn('id', 'text', c => c.primaryKey()).addColumn('email', 'text', c => c.unique()).addColumn('name', 'text')
    .addColumn('status', 'text').addColumn('role', 'text').addColumn('emailVerified', 'integer').addColumn('twoFactorEnabled', 'integer').execute();
  await db.schema.createTable('session').addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.references('user.id').onDelete('cascade')).execute();
  await db.schema.createTable('twoFactor').addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.references('user.id').onDelete('cascade')).addColumn('verified', 'integer').execute();
  await db.insertInto('user').values([
    { id: 'alice', email: 'alice@example.test', name: 'Alice', status: 'active', role: 'customer', emailVerified: 1, twoFactorEnabled: 1 },
    { id: 'bob', email: 'bob@example.test', name: 'Bob', status: 'active', role: 'customer', emailVerified: 1, twoFactorEnabled: 1 },
  ]).execute();
  await db.insertInto('twoFactor').values([{ id: 'mfa_alice', userId: 'alice', verified: 1 }, { id: 'mfa_bob', userId: 'bob', verified: 1 }]).execute();
  await migrateAccountTables(db); await migrateBilling(db); await migrateTrialNotices(db);
  const messages = [];
  const origin = 'http://127.0.0.1:3100';
  const mail = createAccountMail({ db, env: { BETTER_AUTH_URL: origin }, secret: 'local-test-encryption-key-only-never-deploy', transport: async message => messages.push(message) });
  const audit = async (event, executor = db) => executor.insertInto('accountAudit').values({ id: randomUUID(), userId: event.userId, actorId: event.actorId || null, action: event.action, detail: JSON.stringify(event.detail || {}), createdAt: new Date().toISOString() }).execute();
  const grant = async (id, expiresAt, overrides = {}) => db.insertInto('accessGrant').values({ id, userId: 'alice', plan: 'pro', reason: 'Reviewed trial access', expiresAt, createdAt: new Date().toISOString(), createdBy: 'bob', ...overrides }).execute();
  return { db, mail, audit, origin, messages, grant };
}

test('owner bootstrap is explicit, verified, audited and revokes existing sessions', async t => {
  const system = await fixture(t);
  await system.db.insertInto('session').values({ id: 'alice_session', userId: 'alice' }).execute();
  const result = await bootstrapOwner(system, ' ALICE@example.test ');
  assert.equal(result.sessionsRevoked, true);
  assert.equal((await system.db.selectFrom('user').select('role').where('id', '=', 'alice').executeTakeFirst()).role, 'owner');
  assert.equal((await system.db.selectFrom('session').selectAll().execute()).length, 0);
  const audit = await system.db.selectFrom('accountAudit').selectAll().execute();
  assert.equal(audit.length, 1); assert.equal(audit[0].action, 'admin.owner.bootstrapped');
  assert.equal(audit[0].actorId, null);
  assert.equal((await bootstrapOwner(system, 'alice@example.test')).alreadyOwner, true);
  await assert.rejects(bootstrapOwner(system, 'bob@example.test'), /owner already exists/);
  assert.equal((await system.db.selectFrom('user').select('role').where('id', '=', 'bob').executeTakeFirst()).role, 'customer');
});

test('unverified, suspended and unconfirmed-MFA accounts cannot bootstrap ownership', async t => {
  const system = await fixture(t);
  await assert.rejects(bootstrapOwner(system, 'nobody@example.test'), /existing active account/);
  await system.db.updateTable('user').set({ emailVerified: 0 }).where('id', '=', 'alice').execute();
  await assert.rejects(bootstrapOwner(system, 'alice@example.test'), /verified email/);
  await system.db.updateTable('user').set({ emailVerified: 1, status: 'suspended' }).where('id', '=', 'alice').execute();
  await assert.rejects(bootstrapOwner(system, 'alice@example.test'), /existing active account/);
  await system.db.updateTable('user').set({ status: 'active' }).where('id', '=', 'alice').execute();
  await system.db.updateTable('twoFactor').set({ verified: 0 }).where('userId', '=', 'alice').execute();
  await assert.rejects(bootstrapOwner(system, 'alice@example.test'), /Complete authenticator verification/);
  assert.equal((await system.db.selectFrom('accountAudit').selectAll().execute()).length, 0);
});

test('concurrent owner bootstraps cannot create two owners', async t => {
  const system = await fixture(t);
  const results = await Promise.allSettled([bootstrapOwner(system, 'alice@example.test'), bootstrapOwner(system, 'bob@example.test')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await system.db.selectFrom('user').select('id').where('role', '=', 'owner').execute()).length, 1);
});

test('CLI migrates only on explicit migrate command and closes its database', async () => {
  const calls = [], output = [];
  const createSystem = async options => { calls.push(options); return { type: 'sqlite', close: async () => calls.push('closed') }; };
  await runAccountCommand(['migrate'], { env: { BETTER_AUTH_URL: 'http://localhost:3100' }, createSystem, write: text => output.push(text) });
  assert.equal(calls[0].migrate, true); assert.equal(calls[1], 'closed');
  assert.equal(JSON.parse(output[0]).ok, true);
  await assert.rejects(runAccountCommand(['delete-all'], { createSystem }), /Unknown command/);
  assert.equal(calls.length, 2);
});

test('finite grants generate one encrypted start, ending and expiry notice per lifecycle', async t => {
  const system = await fixture(t), now = Date.now();
  await system.grant('g1', new Date(now + 48 * 3600_000).toISOString());
  assert.equal((await sweepTrialNotices({ ...system, now })).queued, 1);
  assert.equal((await sweepTrialNotices({ ...system, now })).queued, 0);
  const payload = (await system.db.selectFrom('accountMail').select('payload').executeTakeFirst()).payload;
  assert.ok(!payload.includes('alice@example.test')); assert.ok(!payload.includes('trial started'));
  assert.equal((await sweepTrialNotices({ ...system, now: now + 25 * 3600_000 })).queued, 1);
  assert.equal((await sweepTrialNotices({ ...system, now: now + 49 * 3600_000 })).queued, 1);
  assert.equal((await sweepTrialNotices({ ...system, now: now + 50 * 3600_000 })).scanned, 0);
  await system.mail.drain(20);
  assert.equal(system.messages.length, 3);
  assert.deepEqual(system.messages.map(m => m.subject), ['Your VisualOdds access trial started', 'Your VisualOdds trial ends soon', 'Your VisualOdds trial ended']);
  assert.equal((await system.db.selectFrom('accountAudit').selectAll().execute()).length, 3);
});

test('trial outbox failure rolls back receipt and audit so a later sweep retries', async t => {
  const system = await fixture(t), now = Date.now();
  await system.grant('g1', new Date(now + 48 * 3600_000).toISOString());
  await assert.rejects(sweepTrialNotices({ ...system, now, mail: { configured: true, send: async () => { throw new Error('Queue unavailable'); } } }), /Queue unavailable/);
  assert.equal((await system.db.selectFrom('trialNotice').selectAll().execute()).length, 0);
  assert.equal((await system.db.selectFrom('accountAudit').selectAll().execute()).length, 0);
  assert.equal((await sweepTrialNotices({ ...system, now })).queued, 1);
});

test('concurrent sweeps enqueue one notice and completed pages do not starve later grants', async t => {
  const system = await fixture(t), now = Date.now();
  await system.grant('g1', new Date(now + 48 * 3600_000).toISOString());
  const results = await Promise.all([sweepTrialNotices({ ...system, now }), sweepTrialNotices({ ...system, now })]);
  assert.equal(results.reduce((sum, row) => sum + row.queued, 0), 1);
  assert.equal((await system.db.selectFrom('accountMail').selectAll().execute()).length, 1);
  await system.grant('g2', new Date(now + 72 * 3600_000).toISOString());
  await system.grant('g3', new Date(now + 96 * 3600_000).toISOString());
  assert.equal((await sweepTrialNotices({ ...system, now, limit: 1 })).queued, 1);
  assert.equal((await sweepTrialNotices({ ...system, now, limit: 1 })).queued, 1);
  assert.equal((await sweepTrialNotices({ ...system, now, limit: 1 })).scanned, 0);
});

test('expired grant notices are suppressed when paid service remains; revocations do not announce active trials', async t => {
  const system = await fixture(t), now = Date.now();
  await system.grant('expired', new Date(now - 3600_000).toISOString());
  await system.grant('revoked', new Date(now + 48 * 3600_000).toISOString(), { revokedAt: new Date(now).toISOString() });
  await system.db.insertInto('subscription').values({ id: 'sub_current', userId: 'alice', stripeCustomerId: 'cus_alice', plan: 'premium', status: 'active', currentPeriodEnd: new Date(now + 48 * 3600_000).toISOString(), paymentConfirmed: 1, updatedAt: new Date(now).toISOString() }).execute();
  const result = await sweepTrialNotices({ ...system, now });
  assert.equal(result.queued, 0); assert.equal(result.suppressed, 1);
  assert.equal((await system.db.selectFrom('accountMail').selectAll().execute()).length, 0);
  assert.equal((await sweepTrialNotices({ ...system, now })).scanned, 0);
});

test('missing delivery configuration leaves notices unclaimed for a configured retry', async t => {
  const system = await fixture(t), now = Date.now();
  await system.grant('g1', new Date(now + 48 * 3600_000).toISOString());
  assert.equal((await sweepTrialNotices({ ...system, now, mail: { configured: false } })).emailUnavailable, true);
  assert.equal((await system.db.selectFrom('trialNotice').selectAll().execute()).length, 0);
  assert.equal((await sweepTrialNotices({ ...system, now })).queued, 1);
});
