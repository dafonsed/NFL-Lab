import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { AccountError } from './auth.mjs';

export const SUPPORT_STATUSES = Object.freeze(['open', 'in-progress', 'waiting-on-customer', 'resolved']);
export const SUPPORT_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);
export const SUPPORT_CATEGORIES = Object.freeze(['bug', 'incorrect-line', 'grading-dispute', 'billing', 'account', 'other']);
export const CONTENT_CATEGORIES = Object.freeze(['banner', 'announcement', 'guide', 'promotion']);
const SUPPORT_ROLES = ['owner', 'admin', 'support'];
const own = (object, key) => Object.hasOwn(object, key);
const fail = (message, status = 400, code = 'INVALID_OPERATION') => { throw new AccountError(message, status, code); };

export function operationPermission(route) {
  if (/^\/api\/admin\/support(?:\/|$)/.test(route)) return 'support';
  if (/^\/api\/admin\/content(?:\/|$)/.test(route)) return 'content';
  return null;
}
function identifier(value, label = 'record') {
  if (typeof value !== 'string' || !value || value.length > 200 || /[\s\u0000-\u001f\u007f/\\]/.test(value)) fail(`Choose a valid ${label} ID.`);
  return value;
}
function text(value, label, min, max) {
  if (typeof value !== 'string') fail(`Enter ${label.toLowerCase()} as text.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) fail(`${label} must contain ${min} to ${max} characters.`);
  return clean;
}
function choice(value, values, label) { if (!values.includes(value)) fail(`Choose a valid ${label}.`); return value; }
function payload(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Send an operation object.');
  const unknown = Object.keys(body).find(key => !allowed.includes(key));
  if (unknown) fail(`The field "${unknown}" is not accepted by this operation.`);
  return body;
}
function version(body) {
  if (!Number.isSafeInteger(body.version) || body.version < 1) fail('Supply the current record version.', 400, 'VERSION_REQUIRED');
  return body.version;
}
function reason(body) { return text(body.reason, 'Reason', 8, 500); }
function timestamp(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label} must be an ISO date and time with a timezone.`);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) fail(`${label} must be a valid calendar date and time.`);
  return date.toISOString();
}
function contentDates(item) {
  if (item.publishAt && item.expiresAt && item.expiresAt <= item.publishAt) fail('Expiration must be after the publication time.');
}
function pagination(url, prefix = '') {
  const integer = (name, fallback, max) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) fail(`Choose a valid ${name}.`);
    return Number(raw);
  };
  const page = integer(prefix ? `${prefix}Page` : 'page', 1, 10000);
  const pageSize = integer(prefix ? `${prefix}PageSize` : 'pageSize', 25, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
function requireUser(found) {
  if (!found?.user?.id) fail('Sign in to use this service.', 401, 'UNAUTHORIZED');
  if (found.user.status !== 'active') fail('This account cannot perform this operation.', 403, 'FORBIDDEN');
}
function requirePermission(found, permission) {
  requireUser(found);
  if (!found.permissions?.includes(permission)) fail('This role cannot perform this operation.', 403, 'FORBIDDEN');
  if (!found.user.twoFactorEnabled || !found.session?.mfaVerifiedAt) fail('Staff access requires a verified authenticator session.', 403, 'ADMIN_MFA_REQUIRED');
}
async function linkedUser(db, userId) {
  const user = await db.selectFrom('user').select(['id', 'status']).where('id', '=', identifier(userId, 'customer')).executeTakeFirst();
  if (!user) fail('Customer account not found.', 404, 'ACCOUNT_NOT_FOUND');
  if (user.status === 'deletion-pending') fail('This account is pending deletion. Follow the privacy review process.', 409, 'DELETION_PENDING');
  return user.id;
}
async function assignee(db, userId) {
  if (userId === null || userId === '') return null;
  const user = await db.selectFrom('user').select(['id', 'role', 'status', 'emailVerified', 'twoFactorEnabled']).where('id', '=', identifier(userId, 'assignee')).executeTakeFirst();
  if (!user || !SUPPORT_ROLES.includes(user.role) || user.status !== 'active' || !user.emailVerified || !user.twoFactorEnabled) fail('Assign tickets to an active, verified support staff account.');
  return user.id;
}
async function row(db, kind, id, userId) {
  let query = db.selectFrom('adminOperation').selectAll().where('kind', '=', kind).where('id', '=', identifier(id));
  if (userId) query = query.where('userId', '=', userId);
  return await query.executeTakeFirst() || fail('Record not found.', 404, 'NOT_FOUND');
}
function itemView(item, { customer = false, publicContent = false, now = new Date().toISOString() } = {}) {
  if (publicContent) return Object.fromEntries(['id', 'title', 'body', 'category', 'publishAt', 'expiresAt', 'publishedAt', 'version'].map(key => [key, item[key]]));
  if (customer) return Object.fromEntries(['id', 'title', 'body', 'category', 'status', 'reference', 'version', 'createdAt', 'updatedAt'].map(key => [key, item[key]]));
  const effectiveStatus = item.kind !== 'content' || item.status !== 'published' ? item.status : item.expiresAt && item.expiresAt <= now ? 'expired' : item.publishAt && item.publishAt > now ? 'scheduled' : 'published';
  return { ...item, effectiveStatus };
}
function auditSnapshot(item) {
  if (!item) return null;
  return Object.fromEntries(['id', 'kind', 'userId', 'title', 'category', 'status', 'priority', 'assigneeId', 'publishAt', 'expiresAt', 'publishedAt', 'archivedAt', 'version'].map(key => [key, item[key]]));
}
async function audit(system, tx, found, action, before, after, changeReason, extra = {}) {
  await system.audit({ userId: after.userId, actorId: found.user.id, action, detail: { operationId: after.id, reason: changeReason, before: auditSnapshot(before), after: auditSnapshot(after), ...extra } }, tx);
}
async function saveUpdate(tx, current, next, expectedVersion) {
  if (current.version !== expectedVersion) fail('This record changed. Reload it before saving.', 409, 'VERSION_CONFLICT');
  const result = await tx.updateTable('adminOperation').set(next).where('id', '=', current.id).where('version', '=', expectedVersion).returningAll().executeTakeFirst();
  if (!result) fail('This record changed. Reload it before saving.', 409, 'VERSION_CONFLICT');
  return result;
}
async function supportDetail(system, id, found, url, customer) {
  const item = await row(system.db, 'ticket', id, customer ? found.user.id : undefined);
  if (customer) return { item: itemView(item, { customer: true }) };
  const { page, pageSize, offset } = pagination(url, 'notes');
  const notes = await system.db.selectFrom('adminOperationNote').selectAll().where('operationId', '=', item.id).orderBy('createdAt', 'desc').orderBy('id', 'desc').offset(offset).limit(pageSize + 1).execute();
  return { item: itemView(item), notes: notes.slice(0, pageSize), notesPage: page, notesPageSize: pageSize, notesHasMore: notes.length > pageSize };
}
async function list(system, kind, found, url, customer) {
  const { page, pageSize, offset } = pagination(url);
  let query = system.db.selectFrom('adminOperation').selectAll().where('kind', '=', kind);
  if (customer) query = query.where('userId', '=', found.user.id);
  for (const [key, choices] of [['status', kind === 'ticket' ? SUPPORT_STATUSES : ['draft', 'published', 'archived']], ['category', kind === 'ticket' ? SUPPORT_CATEGORIES : CONTENT_CATEGORIES]]) {
    if (url.searchParams.has(key)) query = query.where(key, '=', choice(url.searchParams.get(key), choices, key));
  }
  if (!customer && kind === 'ticket') {
    if (url.searchParams.has('priority')) query = query.where('priority', '=', choice(url.searchParams.get('priority'), SUPPORT_PRIORITIES, 'priority'));
    for (const key of ['userId', 'assigneeId']) if (url.searchParams.has(key)) query = query.where(key, '=', identifier(url.searchParams.get(key), key));
  }
  const q = url.searchParams.get('q');
  if (q) {
    const needle = text(q, 'Search', 1, 120).toLowerCase().replace(/[!%_]/g, '!$&');
    query = query.where(eb => eb.or(['id', 'title'].map(key => sql`lower(${sql.ref(key)}) like ${'%' + needle + '%'} escape '!'`)));
  }
  const items = await query.orderBy('createdAt', 'desc').orderBy('id', 'desc').offset(offset).limit(pageSize + 1).execute();
  return { items: items.slice(0, pageSize).map(item => itemView(item, { customer })), page, pageSize, hasMore: items.length > pageSize };
}
async function createTicket(system, found, body, customer, now) {
  payload(body, customer ? ['title', 'body', 'category', 'reference'] : ['userId', 'title', 'body', 'category', 'priority', 'assigneeId', 'reference', 'note', 'reason']);
  const input = { title: text(body.title, 'Title', 1, 160), body: text(body.body, 'Report', 10, 10000), category: choice(body.category ?? 'other', SUPPORT_CATEGORIES, 'category'), reference: own(body, 'reference') ? text(body.reference, 'Reference', 0, 200) : null };
  const changeReason = customer ? 'Customer submitted a support report.' : reason(body);
  const note = !customer && own(body, 'note') ? text(body.note, 'Internal note', 1, 4000) : null;
  const created = await system.db.transaction().execute(async tx => {
    const userId = await linkedUser(tx, customer ? found.user.id : body.userId);
    const assigned = !customer && own(body, 'assigneeId') ? await assignee(tx, body.assigneeId) : null;
    const item = { id: randomUUID(), kind: 'ticket', userId, ...input, status: 'open', priority: customer ? 'normal' : choice(body.priority ?? 'normal', SUPPORT_PRIORITIES, 'priority'), assigneeId: assigned, publishAt: null, expiresAt: null, publishedAt: null, archivedAt: null, version: 1, createdBy: found.user.id, updatedBy: found.user.id, createdAt: now, updatedAt: now };
    await tx.insertInto('adminOperation').values(item).execute();
    const noteId = note ? randomUUID() : null;
    if (note) await tx.insertInto('adminOperationNote').values({ id: noteId, operationId: item.id, authorId: found.user.id, body: note, createdAt: now }).execute();
    await audit(system, tx, found, 'support.created', null, item, changeReason, noteId ? { noteId } : {});
    return item;
  });
  return { item: itemView(created, { customer }) };
}
async function updateTicket(system, found, id, body, now) {
  payload(body, ['version', 'status', 'priority', 'assigneeId', 'note', 'reason']);
  const expected = version(body), changeReason = reason(body);
  if (!['status', 'priority', 'assigneeId', 'note'].some(key => own(body, key))) fail('Choose a ticket field to update or add an internal note.');
  const note = own(body, 'note') ? text(body.note, 'Internal note', 1, 4000) : null;
  const updated = await system.db.transaction().execute(async tx => {
    const current = await row(tx, 'ticket', id);
    if (current.version !== expected) fail('This record changed. Reload it before saving.', 409, 'VERSION_CONFLICT');
    const changes = {};
    if (own(body, 'status')) changes.status = choice(body.status, SUPPORT_STATUSES, 'status');
    if (own(body, 'priority')) changes.priority = choice(body.priority, SUPPORT_PRIORITIES, 'priority');
    if (own(body, 'assigneeId')) changes.assigneeId = await assignee(tx, body.assigneeId);
    if (!note && Object.entries(changes).every(([key, value]) => current[key] === value)) fail('No ticket changes were provided.', 409, 'NO_CHANGES');
    const next = await saveUpdate(tx, current, { ...changes, version: expected + 1, updatedBy: found.user.id, updatedAt: now }, expected);
    const noteId = note ? randomUUID() : null;
    if (note) await tx.insertInto('adminOperationNote').values({ id: noteId, operationId: id, authorId: found.user.id, body: note, createdAt: now }).execute();
    await audit(system, tx, found, 'support.updated', current, next, changeReason, noteId ? { noteId } : {});
    return next;
  });
  return { item: itemView(updated) };
}
function contentFields(body, creating) {
  const fields = {};
  for (const [key, label, minimum, maximum] of [['title', 'Title', 1, 160], ['body', 'Content', 1, 20000]]) if (creating || own(body, key)) fields[key] = text(body[key], label, minimum, maximum);
  if (creating || own(body, 'category')) fields.category = choice(body.category ?? 'announcement', CONTENT_CATEGORIES, 'category');
  for (const [key, label] of [['publishAt', 'Publication time'], ['expiresAt', 'Expiration time']]) if (creating || own(body, key)) fields[key] = body[key] === undefined ? null : timestamp(body[key], label);
  return fields;
}
async function createContent(system, found, body, now) {
  payload(body, ['title', 'body', 'category', 'publishAt', 'expiresAt', 'reason']);
  const fields = contentFields(body, true), changeReason = reason(body);
  contentDates(fields);
  const item = { id: randomUUID(), kind: 'content', userId: null, ...fields, status: 'draft', priority: null, assigneeId: null, reference: null, publishedAt: null, archivedAt: null, version: 1, createdBy: found.user.id, updatedBy: found.user.id, createdAt: now, updatedAt: now };
  await system.db.transaction().execute(async tx => {
    await tx.insertInto('adminOperation').values(item).execute();
    await audit(system, tx, found, 'content.created', null, item, changeReason);
  });
  return { item: itemView(item, { now }) };
}
async function updateContent(system, found, id, body, action, now) {
  payload(body, action === 'edit' ? ['version', 'title', 'body', 'category', 'publishAt', 'expiresAt', 'reason'] : ['version', 'reason']);
  const expected = version(body), changeReason = reason(body);
  const fields = action === 'edit' ? contentFields(body, false) : {};
  if (action === 'edit' && !Object.keys(fields).length) fail('Choose a draft field to update.');
  const updated = await system.db.transaction().execute(async tx => {
    const current = await row(tx, 'content', id);
    if (current.version !== expected) fail('This record changed. Reload it before saving.', 409, 'VERSION_CONFLICT');
    if (action === 'edit' && current.status !== 'draft') fail('Only drafts can be edited. Archive published content and create a replacement draft.', 409, 'CONTENT_NOT_DRAFT');
    if (action === 'publish') {
      if (current.status !== 'draft') fail('Only a draft can be published.', 409, 'CONTENT_NOT_DRAFT');
      fields.status = 'published'; fields.publishedAt = now; fields.publishAt = current.publishAt || now;
      if (current.expiresAt && current.expiresAt <= now) fail('Choose a future expiration before publishing.');
    }
    if (action === 'archive') {
      if (current.status === 'archived') fail('This content is already archived.', 409, 'NO_CHANGES');
      fields.status = 'archived'; fields.archivedAt = now;
    }
    if (action === 'edit' && Object.entries(fields).every(([key, value]) => current[key] === value)) fail('No draft changes were provided.', 409, 'NO_CHANGES');
    contentDates({ ...current, ...fields });
    const next = await saveUpdate(tx, current, { ...fields, version: expected + 1, updatedBy: found.user.id, updatedAt: now }, expected);
    await audit(system, tx, found, `content.${action === 'edit' ? 'updated' : action === 'publish' ? 'published' : 'archived'}`, current, next, changeReason, action === 'edit' ? { changedFields: Object.keys(fields) } : {});
    return next;
  });
  return { item: itemView(updated, { now }) };
}

export async function readActiveContent({ system, url = new URL('http://localhost/api/content'), now = new Date().toISOString() }) {
  const { page, pageSize, offset } = pagination(url);
  let query = system.db.selectFrom('adminOperation').selectAll().where('kind', '=', 'content').where('status', '=', 'published').where('publishAt', '<=', now).where(eb => eb.or([eb('expiresAt', 'is', null), eb('expiresAt', '>', now)]));
  if (url.searchParams.has('category')) query = query.where('category', '=', choice(url.searchParams.get('category'), CONTENT_CATEGORIES, 'category'));
  const rows = await query.orderBy('publishAt', 'desc').orderBy('id', 'desc').offset(offset).limit(pageSize + 1).execute();
  return { items: rows.slice(0, pageSize).map(item => itemView(item, { publicContent: true })), page, pageSize, hasMore: rows.length > pageSize };
}

/** HTTP owns session lookup, origin, rate limits, and recent authentication.
 * This service rechecks staff capabilities/MFA and scopes every customer query.
 * No notification or other external side effect is claimed or queued here.
 */
export async function handleAdminOperations({ system, found, url, method, body, now = new Date().toISOString() }) {
  const route = url.pathname.replace(/\/+$/, '');
  if (route === '/api/content') {
    if (method !== 'GET') fail('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    return readActiveContent({ system, url, now });
  }
  const matched = /^\/api\/(admin\/(support|content)|account\/(support))(?:\/([^/]+))?(?:\/(publish|archive))?$/.exec(route);
  if (!matched) return null;
  const customer = matched[1].startsWith('account/');
  const kind = matched[2] === 'content' ? 'content' : 'ticket';
  if (customer) requireUser(found); else requirePermission(found, kind === 'ticket' ? 'support' : 'content');
  let id = matched[4];
  if (id) { try { id = decodeURIComponent(id); } catch { fail('Choose a valid record ID.'); } identifier(id); }
  const action = matched[5];
  if (action && (kind !== 'content' || !id)) fail('Operation not found.', 404, 'NOT_FOUND');
  if (method === 'GET' && !action) {
    if (!id) return list(system, kind, found, url, customer);
    return kind === 'ticket' ? supportDetail(system, id, found, url, customer) : { item: itemView(await row(system.db, 'content', id), { now }) };
  }
  if (customer && !(method === 'POST' && !id)) fail('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
  if (method === 'POST' && !id) return kind === 'ticket' ? createTicket(system, found, body, customer, now) : createContent(system, found, body, now);
  if (method === 'PATCH' && id && !action && !customer) return kind === 'ticket' ? updateTicket(system, found, id, body, now) : updateContent(system, found, id, body, 'edit', now);
  if (method === 'POST' && id && action && kind === 'content') return updateContent(system, found, id, body, action, now);
  fail('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
}
