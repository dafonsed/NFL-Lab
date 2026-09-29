import { sql } from 'kysely';
import { AccountError } from './auth.mjs';

const USER_FIELDS = ['id', 'name', 'email', 'emailVerified', 'role', 'status', 'twoFactorEnabled', 'createdAt'];
const DATA_KINDS = ['bets', 'filters', 'alerts', 'notes', 'watchlist', 'preferences'];
const AUDIT_FIELDS = ['id', 'userId', 'actorId', 'action', 'createdAt', 'detail'];
const DETAIL_KEYS = new Set(['reason', 'role', 'plan', 'expiresAt', 'source', 'interval', 'subscriptionId', 'status', 'refunded', 'paymentConfirmed', 'eventType', 'eventId', 'grantId', 'kind', 'method', 'route', 'scope', 'key', 'label', 'blocked', 'previousBlocked', 'version', 'effect', 'upstreamChanged', 'operationId']);
const ACTION_PERMISSIONS = { suspend: 'suspend', restore: 'suspend', 'revoke-sessions': 'suspend', 'grant-access': 'grant', 'revoke-grants': 'grant', 'set-role': 'roles' };
const iso = value => {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const safeText = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const redact = value => safeText(value)
  .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
  .replace(/\b(?:(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9_-]+/g, '[redacted]')
  .replace(/\b(password|secret|token|api[-_ ]?key|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]');

export function allowedAdminActions(found, target) {
  if (target.id === found.user.id || target.role === 'owner' || (target.role !== 'customer' && found.user.role !== 'owner')) return [];
  return Object.entries(ACTION_PERMISSIONS).filter(([action, permission]) => {
    if (!found.permissions.includes(permission)) return false;
    if (action === 'suspend') return target.status === 'active';
    if (action === 'restore') return target.status === 'suspended';
    // Demoting an existing staff member remains possible, while promotion needs MFA.
    if (action === 'set-role') return target.role !== 'customer' || (Boolean(target.emailVerified) && Boolean(target.twoFactorEnabled));
    return true;
  }).map(([action]) => action);
}

function publicAccount(found, user) {
  return { ...Object.fromEntries(USER_FIELDS.map(key => [key, user[key]])), emailVerified: Boolean(user.emailVerified), twoFactorEnabled: Boolean(user.twoFactorEnabled), createdAt: iso(user.createdAt), allowedActions: allowedAdminActions(found, user) };
}
function pagination(url) {
  const number = (name, fallback, maximum) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > maximum) throw new AccountError(`Choose a valid ${name}.`);
    return Number(raw);
  };
  const page = number('page', 1, 10000), pageSize = number('pageSize', 25, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
function identifier(value) {
  if (!value || value.length > 200 || /[\u0000-\u0020\u007f/\\]/.test(value)) throw new AccountError('Choose a valid account ID.');
  return value;
}
function auditEvent(row) {
  let parsed = {};
  try { parsed = JSON.parse(row.detail); } catch { /* Legacy malformed detail is omitted. */ }
  const detail = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed)) {
      if (!DETAIL_KEYS.has(key) || !['string', 'number', 'boolean'].includes(typeof value)) continue;
      if (typeof value === 'number' && !Number.isFinite(value)) continue;
      detail[key] = typeof value === 'string' ? redact(value) : value;
    }
  }
  return { id: row.id, userId: row.userId, actorId: row.actorId, action: safeText(row.action, 100), createdAt: iso(row.createdAt), detail };
}
export async function readAdminAuditRows(system, userId, limit, offset = 0) {
  let query = system.db.selectFrom('accountAudit').select(AUDIT_FIELDS);
  if (userId) query = query.where('userId', '=', userId);
  return (await query.orderBy('createdAt', 'desc').orderBy('id', 'desc').offset(offset).limit(limit).execute()).map(auditEvent);
}
async function count(query) {
  const row = await query.select(eb => eb.fn.countAll().as('count')).executeTakeFirst();
  return Number(row.count);
}

/** Called only after the HTTP layer has checked the real session, MFA, and inspect permission. */
export async function readAdminData({ system, found, url, method }) {
  if (method !== 'GET') return null;
  const route = url.pathname;
  if (route === '/api/admin/overview') {
    const now = new Date();
    const [totalUsers, activeUsers, suspendedUsers, activeSessions, subscriptions, activeGrants, billing] = await Promise.all([
      count(system.db.selectFrom('user')),
      count(system.db.selectFrom('user').where('status', '=', 'active')),
      count(system.db.selectFrom('user').where('status', '=', 'suspended')),
      count(system.db.selectFrom('session').innerJoin('user', 'user.id', 'session.userId').where('user.status', '=', 'active').where('session.expiresAt', '>', system.type === 'sqlite' ? now.valueOf() : now)),
      count(system.db.selectFrom('subscription')),
      count(system.db.selectFrom('accessGrant').where('revokedAt', 'is', null).where('expiresAt', '>', now.toISOString())),
      system.billing.summary(found.user.id),
    ]);
    return { actor: { id: found.user.id, name: found.user.name, email: found.user.email, role: found.user.role }, permissions: found.permissions, counts: { totalUsers, activeUsers, suspendedUsers, activeSessions, subscriptions, activeGrants }, services: { mail: { configured: Boolean(system.mail.configured) }, billing: { configured: Boolean(billing.configured) } } };
  }
  if (route === '/api/admin/accounts') {
    const { page, pageSize, offset } = pagination(url);
    const scope = url.searchParams.get('scope') ?? 'all';
    if (!['all', 'staff'].includes(scope)) throw new AccountError('Choose an account scope of all or staff.');
    const q = String(url.searchParams.get('q') || '').trim();
    if (q.length > 120) throw new AccountError('Keep account searches under 121 characters.');
    let query = system.db.selectFrom('user').select(USER_FIELDS);
    if (scope === 'staff') query = query.where('role', '!=', 'customer');
    if (q) {
      const pattern = `%${q.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
      query = query.where(eb => eb.or(['id', 'name', 'email'].map(key => sql`lower(${sql.ref(key)}) like ${pattern} escape '!'`)));
    }
    const users = await query.orderBy('createdAt', 'desc').orderBy('id', 'desc').offset(offset).limit(pageSize + 1).execute();
    return { users: users.slice(0, pageSize).map(user => publicAccount(found, user)), permissions: found.permissions, page, pageSize, hasMore: users.length > pageSize };
  }
  if (route === '/api/admin/audit') {
    const { page, pageSize, offset } = pagination(url);
    const userId = url.searchParams.has('userId') ? identifier(url.searchParams.get('userId')) : null;
    const events = await readAdminAuditRows(system, userId, pageSize + 1, offset);
    return { events: events.slice(0, pageSize), page, pageSize, hasMore: events.length > pageSize };
  }
  const matched = /^\/api\/admin\/accounts\/([^/]+)$/.exec(route);
  if (!matched) return null;
  let id;
  try { id = identifier(decodeURIComponent(matched[1])); } catch { throw new AccountError('Choose a valid account ID.'); }
  const user = await system.db.selectFrom('user').select(USER_FIELDS).where('id', '=', id).executeTakeFirst();
  if (!user) throw new AccountError('Account not found.', 404);
  const [sessions, grants, subscriptions, collections, audit] = await Promise.all([
    system.db.selectFrom('session').select(['id', 'createdAt', 'updatedAt', 'expiresAt', 'userAgent', 'mfaVerifiedAt', 'reauthenticatedAt']).where('userId', '=', id).orderBy('createdAt', 'desc').limit(101).execute(),
    system.db.selectFrom('accessGrant').select(['id', 'plan', 'reason', 'expiresAt', 'revokedAt', 'createdAt', 'createdBy']).where('userId', '=', id).orderBy('createdAt', 'desc').limit(101).execute(),
    system.db.selectFrom('subscription').select(['id', 'plan', 'status', 'currentPeriodEnd', 'trialEnd', 'cancelAtPeriodEnd', 'refunded', 'paymentConfirmed', 'updatedAt']).where('userId', '=', id).orderBy('updatedAt', 'desc').limit(101).execute(),
    // Values, storage keys, filters, bets and notes are deliberately never selected.
    system.db.selectFrom('accountData').select(['kind', 'updatedAt']).where('userId', '=', id).execute(),
    readAdminAuditRows(system, id, 26),
  ]);
  return {
    user: publicAccount(found, user),
    sessions: sessions.slice(0, 100).map(session => ({ id: session.id, createdAt: iso(session.createdAt), updatedAt: iso(session.updatedAt), expiresAt: iso(session.expiresAt), userAgent: redact(session.userAgent).slice(0, 300), mfaVerifiedAt: iso(session.mfaVerifiedAt), reauthenticatedAt: iso(session.reauthenticatedAt) })),
    grants: grants.slice(0, 100).map(grant => ({ ...grant, reason: redact(grant.reason) })),
    subscriptions: subscriptions.slice(0, 100).map(subscription => ({ ...subscription, cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd), refunded: Boolean(subscription.refunded), paymentConfirmed: Boolean(subscription.paymentConfirmed) })),
    dataKinds: DATA_KINDS.map(kind => ({ kind, count: collections.filter(row => row.kind === kind).length, updatedAt: collections.find(row => row.kind === kind)?.updatedAt || null })),
    dataCountUnit: 'stored-collections',
    audit: audit.slice(0, 25),
    hasMore: { sessions: sessions.length > 100, grants: grants.length > 100, subscriptions: subscriptions.length > 100, audit: audit.length > 25 },
  };
}
