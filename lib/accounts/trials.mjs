import { PLAN_CATALOG, entitlementsFor } from './entitlements.mjs';

export async function migrateTrialNotices(db) {
  await db.schema.createTable('trialNotice').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
    .addColumn('grantId', 'text', c => c.notNull().references('accessGrant.id').onDelete('cascade'))
    .addColumn('kind', 'text', c => c.notNull())
    .addColumn('expiresAt', 'text', c => c.notNull())
    .addColumn('createdAt', 'text', c => c.notNull())
    .addColumn('status', 'text', c => c.notNull()).execute();
  await db.schema.createIndex('trial_notice_grant_kind').ifNotExists().on('trialNotice').columns(['grantId', 'kind', 'expiresAt']).execute();
}

/** Finite staff grants are access trials, separate from Stripe payment records.
 * Stripe lifecycle notices are handled by billing.mjs's verified webhooks.
 * Each receipt, encrypted mail outbox row and audit record commit together.
 */
export async function sweepTrialNotices({ db, mail, audit, origin, now = Date.now(), limit = 100, userId }) {
  if (!mail?.configured) return { scanned: 0, queued: 0, suppressed: 0, emailUnavailable: true };
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(at)) throw new Error('A valid trial sweep timestamp is required.');
  const timestamp = new Date(at).toISOString(), soon = new Date(at + 24 * 3600_000).toISOString();
  const pageSize = Math.max(1, Math.min(1000, Number.isInteger(limit) ? limit : 100));
  const unseen = (kind, expiry = false) => {
    let query = db.selectFrom('trialNotice').select('trialNotice.id')
      .whereRef('trialNotice.grantId', '=', 'accessGrant.id').where('trialNotice.kind', '=', kind);
    if (expiry) query = query.whereRef('trialNotice.expiresAt', '=', 'accessGrant.expiresAt');
    return query;
  };
  let pending = db.selectFrom('accessGrant').innerJoin('user', 'user.id', 'accessGrant.userId')
    .select(['accessGrant.id', 'accessGrant.userId', 'accessGrant.plan', 'accessGrant.expiresAt', 'user.email', 'user.name', 'user.emailVerified'])
    .where('accessGrant.revokedAt', 'is', null).where('user.status', '=', 'active')
    .where(eb => eb.or([
      eb.and([eb('accessGrant.expiresAt', '>', timestamp), eb.not(eb.exists(unseen('trial-started')))]),
      eb.and([eb('accessGrant.expiresAt', '>', timestamp), eb('accessGrant.expiresAt', '<=', soon), eb.not(eb.exists(unseen('trial-ending', true)))]),
      eb.and([eb('accessGrant.expiresAt', '<=', timestamp), eb.not(eb.exists(unseen('trial-expired', true)))]),
    ]));
  if (userId) pending = pending.where('accessGrant.userId', '=', userId);
  const grants = await pending.orderBy('accessGrant.expiresAt', 'asc').limit(pageSize).execute();
  let queued = 0, suppressed = 0;
  for (const grant of grants) {
    const end = Date.parse(grant.expiresAt);
    const kinds = end <= at ? ['trial-expired'] : end <= at + 24 * 3600_000 ? ['trial-started', 'trial-ending'] : ['trial-started'];
    await db.transaction().execute(async trx => {
      const currentGrant = await trx.selectFrom('accessGrant').selectAll().where('id', '=', grant.id).executeTakeFirst();
      const user = await trx.selectFrom('user').select(['status', 'email', 'emailVerified', 'name']).where('id', '=', grant.userId).executeTakeFirst();
      if (!currentGrant || currentGrant.revokedAt || currentGrant.expiresAt !== grant.expiresAt || !user || user.status !== 'active') return;
      const [subscriptions, userGrants] = await Promise.all([
        trx.selectFrom('subscription').selectAll().where('userId', '=', grant.userId).execute(),
        trx.selectFrom('accessGrant').selectAll().where('userId', '=', grant.userId).execute(),
      ]);
      const remaining = entitlementsFor({ subscriptions, grants: userGrants, now: at });
      for (const kind of kinds) {
        const id = `grant-${grant.id}-${kind}${kind === 'trial-started' ? '' : `-${grant.expiresAt}`}`;
        const suppress = !user.emailVerified || !PLAN_CATALOG[grant.plan] || (kind === 'trial-expired' && remaining.plan !== 'free');
        const receipt = await trx.insertInto('trialNotice').values({ id, userId: grant.userId, grantId: grant.id, kind, expiresAt: grant.expiresAt, createdAt: timestamp, status: suppress ? 'suppressed' : 'queued' }).onConflict(c => c.column('id').doNothing()).executeTakeFirst();
        if (!Number(receipt.numInsertedOrUpdatedRows)) continue;
        if (suppress) { suppressed++; continue; }
        await mail.send({ to: user.email, template: kind, data: { name: user.name, plan: PLAN_CATALOG[grant.plan].name, expiresAt: grant.expiresAt, url: new URL('/account', origin).href }, dedupeKey: id }, trx);
        if (audit) await audit({ userId: grant.userId, actorId: null, action: 'access.notice.queued', detail: { grantId: grant.id, kind, expiresAt: grant.expiresAt } }, trx);
        queued++;
      }
    });
  }
  return { scanned: grants.length, queued, suppressed };
}
