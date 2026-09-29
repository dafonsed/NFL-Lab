import { AccountError } from './auth.mjs';
import { readAdminAuditRows } from './admin-read.mjs';
import { getMarketControlInventory } from '../admin-market-controls.mjs';
import { readEvQuotes } from '../ev-api-proxy.mjs';

const SUPPORT_FIELDS = ['id', 'userId', 'title', 'category', 'status', 'priority', 'assigneeId', 'version', 'createdAt', 'updatedAt'];
const CONTENT_FIELDS = ['id', 'title', 'category', 'status', 'publishAt', 'expiresAt', 'publishedAt', 'archivedAt', 'version', 'createdAt', 'updatedAt'];
async function count(query) {
  const result = await query.select(eb => eb.fn.countAll().as('count')).executeTakeFirst();
  return Number(result.count);
}
async function accounts(system, at) {
  const now = new Date(at);
  const [totalUsers, activeUsers, suspendedUsers, activeSessions, subscriptions, activeGrants] = await Promise.all([
    count(system.db.selectFrom('user')),
    count(system.db.selectFrom('user').where('status', '=', 'active')),
    count(system.db.selectFrom('user').where('status', '=', 'suspended')),
    count(system.db.selectFrom('session').innerJoin('user', 'user.id', 'session.userId').where('user.status', '=', 'active').where('session.expiresAt', '>', system.type === 'sqlite' ? now.valueOf() : now)),
    count(system.db.selectFrom('subscription')),
    count(system.db.selectFrom('accessGrant').where('revokedAt', 'is', null).where('expiresAt', '>', at)),
  ]);
  return { totalUsers, activeUsers, suspendedUsers, activeSessions, subscriptions, activeGrants };
}
async function support(system) {
  const base = system.db.selectFrom('adminOperation').where('kind', '=', 'ticket');
  const unresolved = base.where('status', '!=', 'resolved');
  const [total, open, urgent, unassigned, latest] = await Promise.all([
    count(base), count(unresolved), count(unresolved.where('priority', '=', 'urgent')),
    count(unresolved.where('assigneeId', 'is', null)),
    base.select(SUPPORT_FIELDS).orderBy('updatedAt', 'desc').orderBy('id', 'desc').limit(5).execute(),
  ]);
  return { total, open, urgent, unassigned, latest };
}
function effectiveContentStatus(item, at) {
  if (item.status !== 'published') return item.status;
  if (item.expiresAt && item.expiresAt <= at) return 'expired';
  return item.publishAt && item.publishAt > at ? 'scheduled' : 'published';
}
async function content(system, at) {
  const base = system.db.selectFrom('adminOperation').where('kind', '=', 'content');
  const publishedRows = base.where('status', '=', 'published');
  const unexpired = publishedRows.where(eb => eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', at)]));
  const [draft, published, scheduled, expired, archived, latest] = await Promise.all([
    count(base.where('status', '=', 'draft')),
    count(unexpired.where('publishAt', '<=', at)),
    count(unexpired.where('publishAt', '>', at)),
    count(publishedRows.where('expiresAt', '<=', at)),
    count(base.where('status', '=', 'archived')),
    base.select(CONTENT_FIELDS).orderBy('updatedAt', 'desc').orderBy('id', 'desc').limit(5).execute(),
  ]);
  return { draft, published, scheduled, expired, archived, latest: latest.map(item => ({ ...item, effectiveStatus: effectiveContentStatus(item, at) })) };
}
function domainError(error, domain) {
  if (error?.code === '42P01' || /no such table|relation .+ does not exist/i.test(error?.message || '')) return 'ADMIN_MIGRATION_REQUIRED';
  if (domain === 'markets' && error?.code === 'MARKET_CONTROLS_UNAVAILABLE') return 'MARKET_CONTROLS_UNAVAILABLE';
  return `DASHBOARD_${domain.toUpperCase()}_UNAVAILABLE`;
}

/** A bounded projection of real data. The HTTP layer authenticates the session;
 * this helper also requires the real permission context and completed MFA.
 * Unavailable or forbidden data never becomes fabricated zeroes or fixtures.
 */
export async function readAdminDashboard({ system, found, now = new Date().toISOString() }) {
  if (!found?.user?.id) throw new AccountError('Sign in to use staff operations.', 401, 'UNAUTHORIZED');
  if (found.user.status !== 'active' || !Array.isArray(found.permissions) || !found.permissions.length) throw new AccountError('Staff access is required.', 403, 'FORBIDDEN');
  if (!found.user.twoFactorEnabled || !found.session?.mfaVerifiedAt) throw new AccountError('Staff access requires a verified authenticator.', 403, 'ADMIN_MFA_REQUIRED');
  const at = new Date(now).toISOString();
  const permissions = [...found.permissions];
  const allowed = permission => permissions.includes(permission);
  const result = {
    actor: { id: found.user.id, name: found.user.name, role: found.user.role }, permissions, generatedAt: at,
    accounts: null, support: null, content: null, markets: null, audit: null, services: null, errors: [],
  };
  const jobs = [];
  if (allowed('inspect')) {
    jobs.push(['accounts', () => accounts(system, at)]);
    jobs.push(['audit', () => readAdminAuditRows(system, null, 8)]);
  }
  if (allowed('inspect') || found.user.role === 'owner') jobs.push(['services', async () => {
    const billing = await system.billing.summary(found.user.id);
    return { mail: { configured: Boolean(system.mail?.configured) }, billing: { configured: Boolean(billing.configured) } };
  }]);
  if (allowed('support')) jobs.push(['support', () => support(system)]);
  if (allowed('content')) jobs.push(['content', () => content(system, at)]);
  if (allowed('data')) jobs.push(['markets', () => getMarketControlInventory({ db: system.db, loadQuotes: system.loadAdminMarketQuotes || readEvQuotes })]);
  const settled = await Promise.allSettled(jobs.map(([, read]) => read()));
  for (let index = 0; index < settled.length; index++) {
    const domain = jobs[index][0], read = settled[index];
    if (read.status === 'fulfilled') {
      result[domain] = read.value;
      if (domain === 'markets' && read.value.inventoryUnavailable) result.errors.push({ domain, errorCode: 'MARKET_INVENTORY_UNAVAILABLE' });
    } else result.errors.push({ domain, errorCode: domainError(read.reason, domain) });
  }
  return result;
}
