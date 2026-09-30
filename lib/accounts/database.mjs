import { migrateReferralTables } from './referrals.mjs';
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function openAccountDatabase(env = process.env) {
  if (env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
    return { db: new Kysely({ dialect: new PostgresDialect({ pool }) }), type: 'postgres' };
  }
  if (env.VERCEL || env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required for hosted accounts.');
  const file = env.ACCOUNT_DB_PATH || path.resolve('data/accounts.sqlite');
  if (file !== ':memory:') await mkdir(path.dirname(file), { recursive: true });
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  return { db: new Kysely({ dialect: new SqliteDialect({ database: sqlite }) }), type: 'sqlite' };
}

// Additive, rerunnable migrations. Existing users and browser records are never replaced.
export async function migrateAccountTables(db) {
  const userRef = c => c.notNull().references('user.id').onDelete('cascade');
  await db.schema.createTable('accountProfile').ifNotExists()
    .addColumn('userId', 'text', c => userRef(c).primaryKey())
    .addColumn('oddsFormat', 'text', c => c.notNull().defaultTo('american'))
    .addColumn('notifications', 'text', c => c.notNull().defaultTo('{}'))
    .addColumn('marketingConsent', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('updatedAt', 'text', c => c.notNull()).execute();
  await db.schema.createTable('accountData').ifNotExists()
    .addColumn('userId', 'text', userRef).addColumn('kind', 'text', c => c.notNull())
    .addColumn('value', 'text', c => c.notNull()).addColumn('version', 'integer', c => c.notNull())
    .addColumn('updatedAt', 'text', c => c.notNull()).addPrimaryKeyConstraint('accountData_pk', ['userId', 'kind']).execute();
  await migrateReferralTables(db);
  // Server-sent alert emails: one row per (user, rule:match) so a match is emailed once.
  await db.schema.createTable('alertDelivery').ifNotExists()
    .addColumn('userId', 'text', userRef).addColumn('key', 'text', c => c.notNull())
    .addColumn('sentAt', 'text', c => c.notNull()).addPrimaryKeyConstraint('alertDelivery_pk', ['userId', 'key']).execute();
  await db.schema.createTable('accountConsent').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', userRef)
    .addColumn('kind', 'text', c => c.notNull()).addColumn('version', 'text', c => c.notNull())
    .addColumn('accepted', 'integer', c => c.notNull()).addColumn('createdAt', 'text', c => c.notNull()).execute();
  await db.schema.createTable('accountAudit').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text')
    .addColumn('actorId', 'text').addColumn('action', 'text', c => c.notNull())
    .addColumn('detail', 'text', c => c.notNull()).addColumn('createdAt', 'text', c => c.notNull()).execute();
  await db.schema.createIndex('accountAudit_user_date').ifNotExists().on('accountAudit').columns(['userId', 'createdAt']).execute();
  await db.schema.createTable('accountLink').ifNotExists()
    .addColumn('hash', 'text', c => c.primaryKey()).addColumn('userId', 'text', userRef)
    .addColumn('expiresAt', 'text', c => c.notNull()).addColumn('usedAt', 'text').execute();
  await db.schema.createTable('accountLimit').ifNotExists()
    .addColumn('key', 'text', c => c.primaryKey()).addColumn('count', 'integer', c => c.notNull())
    .addColumn('expiresAt', 'text', c => c.notNull()).execute();
  await db.schema.createTable('accountMail').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey()).addColumn('payload', 'text', c => c.notNull())
    .addColumn('status', 'text', c => c.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('nextAttemptAt', 'text', c => c.notNull()).addColumn('createdAt', 'text', c => c.notNull())
    .addColumn('sentAt', 'text').execute();
  await db.schema.createTable('deletionRequest').ifNotExists()
    .addColumn('userId', 'text', c => userRef(c).primaryKey())
    .addColumn('createdAt', 'text', c => c.notNull()).addColumn('status', 'text', c => c.notNull().defaultTo('pending')).execute();
  await db.schema.createTable('adminOperation').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('kind', 'text', c => c.notNull())
    .addColumn('userId', 'text', c => c.references('user.id').onDelete('cascade'))
    .addColumn('title', 'text', c => c.notNull()).addColumn('body', 'text', c => c.notNull())
    .addColumn('category', 'text', c => c.notNull()).addColumn('status', 'text', c => c.notNull())
    .addColumn('priority', 'text').addColumn('assigneeId', 'text', c => c.references('user.id').onDelete('set null'))
    .addColumn('reference', 'text').addColumn('publishAt', 'text').addColumn('expiresAt', 'text')
    .addColumn('publishedAt', 'text').addColumn('archivedAt', 'text')
    .addColumn('version', 'integer', c => c.notNull().defaultTo(1))
    .addColumn('createdBy', 'text', c => c.notNull()).addColumn('updatedBy', 'text', c => c.notNull())
    .addColumn('createdAt', 'text', c => c.notNull()).addColumn('updatedAt', 'text', c => c.notNull()).execute();
  await db.schema.createIndex('adminOperation_kind_date').ifNotExists().on('adminOperation').columns(['kind', 'createdAt', 'id']).execute();
  await db.schema.createIndex('adminOperation_user_date').ifNotExists().on('adminOperation').columns(['userId', 'createdAt', 'id']).execute();
  await db.schema.createIndex('adminOperation_public').ifNotExists().on('adminOperation').columns(['kind', 'status', 'publishAt', 'expiresAt']).execute();
  await db.schema.createTable('adminOperationNote').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('operationId', 'text', c => c.notNull().references('adminOperation.id').onDelete('cascade'))
    .addColumn('authorId', 'text', c => c.notNull()).addColumn('body', 'text', c => c.notNull())
    .addColumn('createdAt', 'text', c => c.notNull()).execute();
  await db.schema.createIndex('adminOperationNote_parent_date').ifNotExists().on('adminOperationNote').columns(['operationId', 'createdAt', 'id']).execute();
  await db.schema.createTable('adminMarketControl').ifNotExists()
    .addColumn('scope', 'text', c => c.notNull()).addColumn('kind', 'text', c => c.notNull())
    .addColumn('key', 'text', c => c.notNull()).addColumn('label', 'text', c => c.notNull())
    .addColumn('selector', 'text', c => c.notNull()).addColumn('reason', 'text', c => c.notNull())
    .addColumn('blocked', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('version', 'integer', c => c.notNull().defaultTo(1))
    .addColumn('updatedAt', 'text', c => c.notNull()).addColumn('updatedBy', 'text', c => c.notNull())
    .addPrimaryKeyConstraint('adminMarketControl_pk', ['scope', 'kind', 'key']).execute();
  await db.schema.createTable('accountMigration').ifNotExists()
    .addColumn('version', 'text', c => c.primaryKey()).addColumn('appliedAt', 'text', c => c.notNull()).execute();
  await db.insertInto('accountMigration').values({ version: '2026-09-28-accounts-v1', appliedAt: new Date().toISOString() })
    .onConflict(c => c.column('version').doNothing()).execute();
  await db.insertInto('accountMigration').values({ version: '2026-09-28-admin-operations-v1', appliedAt: new Date().toISOString() })
    .onConflict(c => c.column('version').doNothing()).execute();
}
