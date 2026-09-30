import { creditReferral, referralSummary } from './referrals.mjs';
import { runAlertEmails } from './alert-mailer.mjs';
import { fromNodeHeaders } from 'better-auth/node';
import { verifyPassword } from 'better-auth/crypto';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { AccountError, POLICY_VERSION, normalizeEmail, safeReturnPath, validatePassword } from './auth.mjs';
import { tokenHash } from './secure-adapter.mjs';
import { PLAN_CATALOG, requiredFeature, DENY_FEATURE } from './entitlements.mjs';
import { waitUntil } from '@vercel/functions';
import { sweepTrialNotices } from './trials.mjs';
import { readAdminData } from './admin-read.mjs';
import { handleAdminOperations, operationPermission } from './admin-operations.mjs';
import { getMarketControlInventory, setMarketControl } from '../admin-market-controls.mjs';
import { readEvQuotes } from '../ev-api-proxy.mjs';
import { readAdminDashboard } from './admin-dashboard.mjs';

export const ROLES = Object.freeze({
  customer: [], owner: ['inspect', 'suspend', 'grant', 'roles', 'data', 'content', 'support'],
  admin: ['inspect', 'suspend', 'grant', 'data', 'content', 'support'],
  support: ['inspect', 'support'], 'data-operator': ['data'], content: ['content'],
});
const kinds = new Set(['bets', 'filters', 'alerts', 'notes', 'watchlist', 'preferences']);
const authGET = new Set(['/get-session', '/verify-email', '/list-sessions']);
const authPOST = new Set(['/sign-up/email', '/sign-in/email', '/sign-out', '/request-password-reset', '/reset-password', '/send-verification-email', '/change-password', '/change-email', '/revoke-sessions', '/revoke-session', '/revoke-other-sessions', '/two-factor/enable', '/two-factor/disable', '/two-factor/verify-totp', '/two-factor/verify-backup-code', '/two-factor/generate-backup-codes']);
const sensitive = new Set(['/change-password', '/change-email', '/two-factor/enable', '/two-factor/disable', '/two-factor/generate-backup-codes']);
export function accountJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(data));
}
async function bodyBytes(req, max = 1_100_000) {
  if (Number(req.headers['content-length']) > max) throw new AccountError('This request is too large.', 413);
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > max) throw new AccountError('This request is too large.', 413); parts.push(part); }
  return Buffer.concat(parts);
}
async function readJSON(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new AccountError('Send this request as JSON.', 415);
  let parsed;
  try { parsed = JSON.parse((await bodyBytes(req)).toString('utf8')); } catch (error) { if (error.status) throw error; throw new AccountError('Check the form and try again.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AccountError('Check the form and try again.');
  return parsed;
}
function checkOrigin(req, system) {
  if (req.headers.origin !== system.origin || req.headers['sec-fetch-site'] === 'cross-site') throw new AccountError('Reload this page before trying again.', 403, 'ORIGIN_REJECTED');
}
function publicUser(user) {
  return Object.fromEntries(['id', 'name', 'email', 'emailVerified', 'twoFactorEnabled', 'role', 'status', 'createdAt', 'termsAcceptedAt', 'policyVersion'].map(k => [k, user[k]]));
}
function publicSession(session) {
  return Object.fromEntries(['id', 'createdAt', 'updatedAt', 'expiresAt', 'userAgent', 'mfaVerifiedAt', 'reauthenticatedAt'].map(k => [k, session[k]]));
}
function headersFor(req, system) {
  const headers = fromNodeHeaders(req.headers);
  headers.delete('x-forwarded-for'); headers.delete('x-real-ip'); headers.delete('x-account-ip');
  // Only the configured host's trusted ingress header is accepted on Vercel.
  const ip = system.env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
  headers.set('x-account-ip', ip);
  return { headers, ip };
}
async function sendResponse(res, response, data) {
  for (const [key, value] of response.headers) if (!['content-length', 'content-type', 'set-cookie', 'location', 'cache-control'].includes(key)) res.setHeader(key, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  if (data !== undefined) return accountJson(res, data, response.status);
  const location = response.headers.get('location');
  if (location) { res.writeHead(response.status, { Location: location, 'Cache-Control': 'no-store' }); return res.end(); }
  accountJson(res, await response.json().catch(() => ({ status: response.ok })), response.status);
}
function withResponseCookies(headers, response) {
  const cookies = new Map(String(headers.get('cookie') || '').split(';').map(c => c.trim().split(/=(.*)/s)).filter(c => c[0]).map(([k, v]) => [k, v]));
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0]; const at = pair.indexOf('=');
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  const next = new Headers(headers); next.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')); return next;
}
export async function requireStaff(system, headers, permission) {
  const found = await system.requireSession(headers);
  const permissions = ROLES[found.user.role] || [];
  if (!permissions.length || (permission && !permissions.includes(permission))) throw new AccountError('You do not have permission to perform this action.', 403, 'FORBIDDEN');
  if (!found.user.twoFactorEnabled || !found.session.mfaVerifiedAt) throw new AccountError('Staff access requires an authenticator. Set it up in Account security.', 403, 'ADMIN_MFA_REQUIRED');
  return { ...found, permissions };
}

export function createAccountHandler(system) {
  return async function handle(req, res, url) {
    const route = url.pathname.replace(/\/+$/, '');
    if (!(route.startsWith('/api/auth/') || route === '/api/account' || route.startsWith('/api/account/') || route.startsWith('/api/admin/') || route === '/api/content' || route === '/api/billing/webhook' || route === '/api/cron/accounts')) return false;
    try {
      const { headers, ip } = headersFor(req, system);
      if (route === '/api/billing/webhook') {
        if (req.method !== 'POST') throw new AccountError('Method not allowed.', 405);
        accountJson(res, await system.billing.webhook(await bodyBytes(req), req.headers['stripe-signature']));
        return true;
      }
      if (route === '/api/cron/accounts') {
        if (!['GET', 'POST'].includes(req.method)) throw new AccountError('Method not allowed.', 405);
        const expected = Buffer.from(`Bearer ${system.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '');
        if (!system.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AccountError('Unauthorized.', 401);
        const trials = system.mail.configured ? await sweepTrialNotices(system) : { queued: 0 };
        const alerts = system.mail.configured ? await runAlertEmails(system) : { checked: 0, emailed: 0, baselined: 0 };
        const result = { ...await system.mail.drain(50), trials, alerts };
        const now = new Date().toISOString();
        await system.db.deleteFrom('accountLimit').where('expiresAt', '<', now).execute();
        await system.db.deleteFrom('accountLink').where('expiresAt', '<', now).execute();
        accountJson(res, result); return true;
      }
      if (!['GET', 'HEAD'].includes(req.method)) checkOrigin(req, system);
      await system.limit('request', ip, 250, 60_000);
      if (route.startsWith('/api/auth/')) {
        await handleAuth(req, res, url, system, headers, ip); return true;
      }
      if (route === '/api/content') {
        const result = await handleAdminOperations({ system, found: null, url, method: req.method });
        if (result === null) throw new AccountError('Route not found.', 404);
        accountJson(res, result); return true;
      }
      if (route === '/api/account/billing/plans' && req.method === 'GET') { accountJson(res, await system.billing.plans()); return true; }
      if (route === '/api/account/providers' && req.method === 'GET') { accountJson(res, { providers: system.socialProviders || [] }); return true; }
      const found = await system.requireSession(headers);
      const { user, session } = found;
      if (route === '/api/account/referral' && req.method === 'GET') { accountJson(res, await referralSummary(system.db, user.id, system.origin)); return true; }
      if (route.startsWith('/api/admin/')) { await handleAdmin(req, res, url, system, headers); return true; }
      if (route === '/api/account/support' || route.startsWith('/api/account/support/')) {
        const result = await handleAdminOperations({ system, found, url, method: req.method, body: ['POST', 'PATCH'].includes(req.method) ? await readJSON(req) : undefined });
        if (result === null) throw new AccountError('Route not found.', 404);
        accountJson(res, result); return true;
      }
      if (req.method === 'GET' && route === '/api/account') {
        let profile = await system.db.selectFrom('accountProfile').selectAll().where('userId', '=', user.id).executeTakeFirst();
        if (!profile) {
          const initial = await system.db.selectFrom('user').select('initialMarketingConsent').where('id', '=', user.id).executeTakeFirst();
          profile = { userId: user.id, oddsFormat: 'american', notifications: '{}', marketingConsent: initial?.initialMarketingConsent ? 1 : 0, updatedAt: new Date().toISOString() };
          await system.db.insertInto('accountProfile').values(profile).onConflict(c => c.column('userId').doNothing()).execute();
        }
        const billing = await system.billing.summary(user.id);
        const activity = await system.db.selectFrom('accountAudit').select(['id', 'action', 'createdAt']).where('userId', '=', user.id).orderBy('createdAt', 'desc').limit(30).execute();
        accountJson(res, { user: publicUser(user), session: publicSession(session), profile: { ...profile, notifications: JSON.parse(profile.notifications), marketingConsent: !!profile.marketingConsent }, entitlements: billing.entitlements, billing, activity, capabilities: { emailDelivery: system.mail.configured, billing: billing.configured, admin: (ROLES[user.role] || []).length > 0, passkeys: false, discord: false } }); return true;
      }
      if (req.method === 'POST' && route === '/api/account/reauthenticate') {
        const body = await readJSON(req);
        await system.limit('reauth', user.id, 5);
        const account = await system.db.selectFrom('account').select('password').where('userId', '=', user.id).where('providerId', '=', 'credential').executeTakeFirst();
        if (!account?.password || typeof body.password !== 'string' || body.password.length > 128 || !await verifyPassword({ hash: account.password, password: body.password })) throw new AccountError('The password could not be confirmed.', 400, 'INVALID_PASSWORD');
        await system.db.updateTable('session').set({ reauthenticatedAt: new Date().toISOString() }).where('id', '=', session.id).where('userId', '=', user.id).execute();
        accountJson(res, { status: true }); return true;
      }
      if (req.method === 'PATCH' && route === '/api/account/profile') {
        const body = await readJSON(req);
        const name = typeof body.name === 'string' ? body.name.trim() : user.name;
        if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) throw new AccountError('Use a display name between 1 and 80 characters.');
        const existing = await system.db.selectFrom('accountProfile').selectAll().where('userId', '=', user.id).executeTakeFirst();
        const initialConsent = existing ? null : await system.db.selectFrom('user').select('initialMarketingConsent').where('id', '=', user.id).executeTakeFirst();
        const previousNotifications = existing ? JSON.parse(existing.notifications) : {};
        const oddsFormat = body.oddsFormat ?? existing?.oddsFormat ?? 'american';
        if (!['american', 'decimal'].includes(oddsFormat)) throw new AccountError('Choose a valid odds format.');
        const notifications = { alerts: body.notifications?.alerts ?? previousNotifications.alerts ?? false, productUpdates: body.notifications?.productUpdates ?? previousNotifications.productUpdates ?? false };
        if (Object.values(notifications).some(value => typeof value !== 'boolean') || (Object.hasOwn(body, 'marketingConsent') && typeof body.marketingConsent !== 'boolean')) throw new AccountError('Choose valid notification preferences.');
        const now = new Date().toISOString();
        await system.db.transaction().execute(async tx => {
          await tx.updateTable('user').set({ name }).where('id', '=', user.id).execute();
          const profile = { userId: user.id, oddsFormat, notifications: JSON.stringify(notifications), marketingConsent: Object.hasOwn(body, 'marketingConsent') ? body.marketingConsent === true ? 1 : 0 : existing?.marketingConsent ?? (initialConsent?.initialMarketingConsent ? 1 : 0), updatedAt: now };
          await tx.insertInto('accountProfile').values(profile).onConflict(c => c.column('userId').doUpdateSet(profile)).execute();
          if (Object.hasOwn(body, 'marketingConsent')) await tx.insertInto('accountConsent').values({ id: randomUUID(), userId: user.id, kind: 'marketing', version: POLICY_VERSION, accepted: profile.marketingConsent, createdAt: now }).execute();
          await system.audit({ userId: user.id, actorId: user.id, action: 'profile.updated' }, tx);
        });
        accountJson(res, { status: true }); return true;
      }
      if (route.startsWith('/api/account/data/')) {
        const kind = route.split('/').at(-1);
        if (!kinds.has(kind)) throw new AccountError('Data collection not found.', 404);
        if (req.headers['x-account-user'] && req.headers['x-account-user'] !== user.id) throw new AccountError('The signed-in account changed. Reload before saving.', 409, 'ACCOUNT_CHANGED');
        if (req.method === 'GET') {
          const row = await system.db.selectFrom('accountData').selectAll().where('userId', '=', user.id).where('kind', '=', kind).executeTakeFirst();
          accountJson(res, row ? { value: JSON.parse(row.value), version: row.version } : { value: null, version: 0 }); return true;
        }
        if (req.method === 'PUT') {
          const body = await readJSON(req);
          if (!Number.isSafeInteger(body.version) || body.version < 0 || !Object.hasOwn(body, 'value') || (body.value !== null && typeof body.value !== 'object')) throw new AccountError('Reload saved data and try again.');
          const value = JSON.stringify(body.value);
          if (value.length > 1_000_000) throw new AccountError('Export older records before adding more data.', 413);
          const next = { userId: user.id, kind, value, version: body.version + 1, updatedAt: new Date().toISOString() };
          if (body.version === 0) {
            const row = await system.db.insertInto('accountData').values(next).onConflict(c => c.columns(['userId', 'kind']).doNothing()).returning('version').executeTakeFirst();
            if (!row) throw new AccountError('Another device saved changes. Reload before trying again.', 409, 'VERSION_CONFLICT');
          } else {
            const result = await system.db.updateTable('accountData').set(next).where('userId', '=', user.id).where('kind', '=', kind).where('version', '=', body.version).executeTakeFirst();
            if (!Number(result.numUpdatedRows)) throw new AccountError('Another device saved changes. Reload before trying again.', 409, 'VERSION_CONFLICT');
          }
          accountJson(res, { value: body.value, version: next.version }); return true;
        }
        throw new AccountError('Method not allowed.', 405);
      }
      if (req.method === 'GET' && route === '/api/account/export') {
        system.requireRecent(found);
        const data = await system.db.selectFrom('accountData').selectAll().where('userId', '=', user.id).execute();
        const consent = await system.db.selectFrom('accountConsent').selectAll().where('userId', '=', user.id).execute();
        const auditRows = await system.db.selectFrom('accountAudit').select(['action', 'detail', 'createdAt']).where('userId', '=', user.id).execute();
        const activity = auditRows.map(event => {
          if (!event.action.startsWith('support.')) return event;
          let detail = {}; try { detail = JSON.parse(event.detail); } catch { /* Preserve the event without internal metadata. */ }
          return { ...event, detail: JSON.stringify({ operationId: detail.operationId, status: detail.after?.status }) };
        });
        const supportReports = await system.db.selectFrom('adminOperation').select(['id', 'title', 'body', 'category', 'status', 'reference', 'version', 'createdAt', 'updatedAt']).where('kind', '=', 'ticket').where('userId', '=', user.id).execute();
        const profile = await system.db.selectFrom('accountProfile').selectAll().where('userId', '=', user.id).executeTakeFirst();
        res.setHeader('Content-Disposition', 'attachment; filename="visualodds-account.json"');
        accountJson(res, { exportedAt: new Date().toISOString(), user: publicUser(user), profile, data: Object.fromEntries(data.map(row => [row.kind, JSON.parse(row.value)])), supportReports, consent, activity, billing: await system.billing.summary(user.id) }); return true;
      }
      if (req.method === 'POST' && route === '/api/account/deletion-request') {
        system.requireRecent(found); const body = await readJSON(req);
        if (body.confirmation !== 'DELETE') throw new AccountError('Type DELETE to request account deletion.');
        // Cancellation must be completed first; do not silently retain a recurring charge.
        const billing = await system.billing.summary(user.id);
        if (billing.subscriptions?.some(s => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status) && !s.cancelAtPeriodEnd)) throw new AccountError('Cancel your renewing subscription in Billing before requesting deletion.', 409, 'CANCEL_SUBSCRIPTION_FIRST');
        await system.db.transaction().execute(async tx => {
          await tx.insertInto('deletionRequest').values({ userId: user.id, createdAt: new Date().toISOString(), status: 'pending' }).onConflict(c => c.column('userId').doNothing()).execute();
          await tx.updateTable('user').set({ status: 'deletion-pending' }).where('id', '=', user.id).execute();
          await tx.deleteFrom('session').where('userId', '=', user.id).execute();
          await system.audit({ userId: user.id, actorId: user.id, action: 'deletion.requested' }, tx);
        });
        accountJson(res, { status: true, message: 'Your deletion request is recorded and your sessions have been signed out.' }); return true;
      }
      if (req.method === 'POST' && ['/api/account/billing/checkout', '/api/account/billing/portal'].includes(route)) {
        system.requireRecent(found); const body = await readJSON(req);
        accountJson(res, route.endsWith('/checkout') ? await system.billing.checkout(user, { ...body, plan: body.plan || body.planId }) : await system.billing.portal(user)); return true;
      }
      throw new AccountError('Account route not found.', 404);
    } catch (error) {
      accountJson(res, { error: error.status && error.status < 500 ? error.message : 'Account services are unavailable. Please try again later.', code: error.code || 'ACCOUNT_ERROR' }, error.status || 503);
    } finally {
      // Tests explicitly drain their in-memory outbox; production uses Vercel's lifetime API.
      if (system.env.VERCEL && system.mail.configured) waitUntil(system.mail.drain().catch(() => {}));
    }
    return true;
  };
}

async function handleAuth(req, res, url, system, headers, ip) {
  const endpoint = url.pathname.slice('/api/auth'.length).replace(/\/+$/, '');
  const providers = system.socialProviders || [];
  const socialRoute = (req.method === 'POST' && endpoint === '/sign-in/social' && providers.length > 0) || (req.method === 'GET' && providers.some(provider => endpoint === `/callback/${provider}`));
  if (!socialRoute && !(req.method === 'GET' ? authGET.has(endpoint) : req.method === 'POST' && authPOST.has(endpoint))) throw new AccountError('Authentication route not found.', 404);
  let body = req.method === 'POST' ? await readJSON(req) : undefined;
  if (body?.email !== undefined) body.email = normalizeEmail(body.email);
  if (body?.newEmail !== undefined) body.newEmail = normalizeEmail(body.newEmail);
  for (const key of ['callbackURL', 'redirectTo', 'newUserCallbackURL', 'errorCallbackURL']) if (body?.[key]) body[key] = new URL(safeReturnPath(body[key]), system.origin).href;
  if (['/sign-up/email', '/sign-in/email', '/sign-in/social', '/request-password-reset', '/send-verification-email', '/reset-password'].includes(endpoint) || endpoint.startsWith('/two-factor/')) {
    // Per-IP and per-email buckets: stop credential stuffing across IPs and email flooding of one address.
    await system.limit('auth-ip', ip, 40);
    if (body?.email) await system.limit(`email:${endpoint}`, body.email, endpoint === '/sign-in/email' ? 10 : 4);
    if (endpoint.startsWith('/two-factor/')) await system.limit('mfa-ip', ip, 12);
  }
  if (['/sign-up/email', '/request-password-reset', '/send-verification-email', '/change-email', '/reset-password', '/change-password'].includes(endpoint) && !system.mail.configured) throw new AccountError('Email delivery is being configured. Please try again later.', 503, 'EMAIL_UNAVAILABLE');
  if (endpoint === '/sign-up/email') {
    if (body.ageConfirmed !== true) throw new AccountError('Confirm you are 21 or older (or the legal betting age where you live) to create an account.', 400, 'AGE_CONFIRMATION_REQUIRED');
    if (body.termsAccepted !== true || body.policyVersion !== POLICY_VERSION) throw new AccountError('Accept the current Terms and Privacy Policy before creating an account.');
    delete body.ageConfirmed;
    if ((system.env.VERCEL || system.env.NODE_ENV === 'production') && system.env.POLICY_APPROVED_VERSION !== POLICY_VERSION) throw new AccountError('Registration is awaiting publication of the account policies.', 503, 'POLICY_NOT_READY');
    delete body.policyVersion;
    validatePassword(body.password);
    body.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'VisualOdds member';
    body.callbackURL = `${system.origin}/login?verified=1`;
  }
  if (endpoint === '/sign-in/social') {
    if (!providers.includes(body?.provider)) throw new AccountError('That sign-in provider is not available.', 400);
    // Creating an account through Google needs the same consents as email sign-up.
    if (body.requestSignUp === true) {
      if (body.ageConfirmed !== true) throw new AccountError('Confirm you are 21 or older (or the legal betting age where you live) to create an account.', 400, 'AGE_CONFIRMATION_REQUIRED');
      if (body.termsAccepted !== true || body.policyVersion !== POLICY_VERSION) throw new AccountError('Accept the current Terms and Privacy Policy before creating an account.');
      if ((system.env.VERCEL || system.env.NODE_ENV === 'production') && system.env.POLICY_APPROVED_VERSION !== POLICY_VERSION) throw new AccountError('Registration is awaiting publication of the account policies.', 503, 'POLICY_NOT_READY');
    } else body.requestSignUp = false;
    for (const key of ['ageConfirmed', 'termsAccepted', 'policyVersion', 'marketingConsent']) delete body[key];
    body.disableRedirect = true;
    body.errorCallbackURL = `${system.origin}/login?error=GOOGLE_SIGN_IN`;
    body.callbackURL ||= `${system.origin}/research`;
  }
  if (['/reset-password', '/change-password'].includes(endpoint)) validatePassword(body.newPassword);
  let found = await system.session(headers);
  let verificationUser;
  if (sensitive.has(endpoint)) {
    found = await system.requireSession(headers); system.requireRecent(found);
    if (endpoint === '/two-factor/disable' && found.user.role !== 'customer') throw new AccountError('Staff accounts must keep MFA enabled.', 403);
    if (endpoint === '/two-factor/enable' && found.user.twoFactorEnabled) throw new AccountError('Disable your existing authenticator before replacing it.', 409);
  }
  if (endpoint === '/change-password') body.revokeOtherSessions = true;
  if (endpoint === '/change-email') body.callbackURL = `${system.origin}/login?emailChanged=1`;
  if (endpoint.startsWith('/two-factor/')) body.trustDevice = false;
  if (endpoint === '/two-factor/enable') body.method = 'totp';
  if (endpoint === '/get-session') {
    const preferences = found ? await system.db.selectFrom('accountProfile').select('oddsFormat').where('userId', '=', found.user.id).executeTakeFirst() : null;
    accountJson(res, found ? { user: publicUser(found.user), session: publicSession(found.session), preferences: { oddsFormat: preferences?.oddsFormat || 'american' } } : null); return;
  }
  if (endpoint === '/list-sessions') {
    found = await system.requireSession(headers);
    const sessions = await system.db.selectFrom('session').select(['id', 'createdAt', 'updatedAt', 'expiresAt', 'userAgent']).where('userId', '=', found.user.id).execute();
    accountJson(res, sessions.filter(s => new Date(s.expiresAt).getTime() > Date.now()).map(s => ({ ...s, createdAt: new Date(s.createdAt).toISOString(), updatedAt: new Date(s.updatedAt).toISOString(), expiresAt: new Date(s.expiresAt).toISOString(), token: s.id, current: s.id === found.session.id }))); return;
  }
  if (['/revoke-session', '/revoke-sessions', '/revoke-other-sessions'].includes(endpoint)) {
    found = await system.requireSession(headers);
    let query = system.db.deleteFrom('session').where('userId', '=', found.user.id);
    if (endpoint === '/revoke-session') query = query.where('id', '=', String(body.token || ''));
    if (endpoint === '/revoke-other-sessions') query = query.where('id', '!=', found.session.id);
    await query.execute();
    await system.audit({ userId: found.user.id, actorId: found.user.id, action: 'sessions.revoked' });
    accountJson(res, { status: true }); return;
  }
  if (endpoint === '/verify-email') {
    await system.limit('verification', ip, 20);
    const token = url.searchParams.get('token') || '';
    const consumed = await system.db.updateTable('accountLink').set({ usedAt: new Date().toISOString() }).where('hash', '=', tokenHash(token)).where('usedAt', 'is', null).where('expiresAt', '>', new Date().toISOString()).returning('userId').executeTakeFirst();
    if (!consumed) { res.writeHead(302, { Location: '/verify-email?error=INVALID_TOKEN', 'Cache-Control': 'no-store' }); res.end(); return; }
    const user = await system.db.selectFrom('user').selectAll().where('id', '=', consumed.userId).executeTakeFirst();
    if (!user || user.status !== 'active') throw new AccountError('This link is no longer valid. Request another email.', 400);
    // Bind provider JWTs to the immutable user id at issuance, even after email changes.
    let payload;
    try { payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { throw new AccountError('This link is no longer valid.'); }
    if (payload.email !== user.email) throw new AccountError('This link is no longer valid. Request another email.');
    verificationUser = user;
    url = new URL(url); url.searchParams.set('callbackURL', `${system.origin}/login?verified=1`);
  }
  const requestURL = new URL(url.pathname + url.search, system.origin);
  const started = Date.now();
  const response = await system.context.run({ marketingConsent: body?.marketingConsent === true }, () => system.auth.handler(new Request(requestURL, { method: req.method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })));
  if (endpoint === '/verify-email') {
    // Provider email-change flows can emit a cookie; all such sessions are already revoked.
    response.headers.delete('set-cookie');
    const current = await system.db.selectFrom('user').select(['email']).where('id', '=', verificationUser.id).executeTakeFirst();
    if (current && current.email !== verificationUser.email) {
      await system.mail.send({ to: verificationUser.email, template: 'email-changed', data: { name: verificationUser.name } });
      await system.audit({ userId: verificationUser.id, action: 'email.changed' });
    }
    await sendResponse(res, response); return;
  }
  if (req.method === 'GET' && endpoint.startsWith('/callback/')) {
    // Google sign-in skips the authenticator check, so accounts with two-step verification must use
    // their password and code instead; any session the callback created for them is removed.
    const created = await system.session(withResponseCookies(headers, response));
    if (created?.user.twoFactorEnabled) {
      await system.db.deleteFrom('session').where('id', '=', created.session.id).execute();
      res.writeHead(302, { Location: '/login?error=TWO_FACTOR_REQUIRED', 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (created) {
      // New Google accounts consented on the register page before the redirect (see /sign-in/social).
      const user = await system.db.selectFrom('user').select(['id', 'termsAcceptedAt']).where('id', '=', created.user.id).executeTakeFirst();
      if (user) for (const kind of ['terms-and-privacy', 'age-21-confirmed']) await system.db.insertInto('accountConsent').values({ id: `${user.id}:${kind}:initial`, userId: user.id, kind, version: POLICY_VERSION, accepted: 1, createdAt: user.termsAcceptedAt }).onConflict(c => c.column('id').doNothing()).execute();
      if (user && Date.now() - Date.parse(user.termsAcceptedAt) < 10 * 60_000) await creditReferral(system.db, req.headers.cookie, user.id);
    }
    await sendResponse(res, response); return;
  }
  let result = await response.clone().json().catch(() => ({}));
  if (endpoint === '/sign-up/email' && response.ok) {
    const user = await system.db.selectFrom('user').select(['id', 'termsAcceptedAt', 'initialMarketingConsent']).where('email', '=', body.email).executeTakeFirst();
    if (user) {
      for (const [kind, accepted] of [['terms-and-privacy', 1], ['age-21-confirmed', 1], ['marketing', user.initialMarketingConsent ? 1 : 0]]) await system.db.insertInto('accountConsent').values({ id: `${user.id}:${kind}:initial`, userId: user.id, kind, version: POLICY_VERSION, accepted, createdAt: user.termsAcceptedAt }).onConflict(c => c.column('id').doNothing()).execute();
      // Sign-up answers the same for existing emails; only credit accounts created just now.
      if (Date.now() - Date.parse(user.termsAcceptedAt) < 5 * 60_000) await creditReferral(system.db, req.headers.cookie, user.id);
    }
    result = { status: true, message: 'If this address can be registered, check your email for the next step. Already have an account? Sign in or reset your password.' };
  }
  if (['/sign-up/email', '/request-password-reset', '/send-verification-email'].includes(endpoint)) {
    const remaining = 650 - (Date.now() - started); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
  if (response.ok && ['/two-factor/verify-totp', '/two-factor/verify-backup-code'].includes(endpoint)) {
    const verified = await system.session(withResponseCookies(headers, response));
    if (verified?.user.twoFactorEnabled) {
      await system.db.updateTable('session').set({ mfaVerifiedAt: new Date().toISOString() }).where('id', '=', verified.session.id).execute();
      // Sessions established before MFA enrollment cannot remain authenticated.
      await system.db.deleteFrom('session').where('userId', '=', verified.user.id).where('id', '!=', verified.session.id).where('mfaVerifiedAt', 'is', null).execute();
      await system.audit({ userId: verified.user.id, action: endpoint.endsWith('backup-code') ? 'mfa.recovery-used' : 'mfa.verified' });
    }
  }
  if (response.ok && endpoint === '/two-factor/disable') {
    await system.db.deleteFrom('session').where('userId', '=', found.user.id).execute();
    await system.audit({ userId: found.user.id, actorId: found.user.id, action: 'mfa.disabled' });
  }
  if (response.ok && endpoint === '/change-password') {
    const rotated = await system.session(withResponseCookies(headers, response));
    if (rotated && found.user.twoFactorEnabled && found.session.mfaVerifiedAt) await system.db.updateTable('session').set({ mfaVerifiedAt: found.session.mfaVerifiedAt }).where('id', '=', rotated.session.id).where('userId', '=', found.user.id).execute();
    await system.mail.send({ to: found.user.email, template: 'password-changed', data: { name: found.user.name, url: '/forgot-password' } });
    await system.audit({ userId: found.user.id, actorId: found.user.id, action: 'password.changed' });
  }
  if (response.ok && endpoint === '/two-factor/generate-backup-codes') await system.audit({ userId: found.user.id, actorId: found.user.id, action: 'mfa.recovery-codes-replaced' });
  if (response.ok && (endpoint === '/sign-in/email' && !result.twoFactorRedirect || ['/two-factor/verify-totp', '/two-factor/verify-backup-code'].includes(endpoint))) {
    const current = await system.session(withResponseCookies(headers, response));
    if (current) {
      await system.audit({ userId: current.user.id, action: 'session.signed-in' });
      if (system.mail.configured) await system.mail.send({ to: current.user.email, template: 'new-sign-in', data: { name: current.user.name } });
    }
  }
  if (!response.ok) {
    const code = result.code || 'AUTH_FAILED';
    result = { code, error: endpoint === '/sign-in/email' ? 'Unable to sign in. Check your details and email verification, or reset your password.' : endpoint.startsWith('/two-factor/') ? 'That code or password could not be verified. Try again, or use an unused recovery code.' : response.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : 'This request could not be completed. Check your details or request a fresh link.' };
  } else if (result && typeof result === 'object') { delete result.token; if (result.user) result.user = publicUser(result.user); }
  await sendResponse(res, response, result);
}

async function handleAdmin(req, res, url, system, headers) {
  const route = url.pathname;
  if (route === '/api/admin/dashboard') {
    const found = await requireStaff(system, headers);
    if (req.method !== 'GET') throw new AccountError('Method not allowed.', 405);
    accountJson(res, await readAdminDashboard({ system, found })); return;
  }
  if (route === '/api/admin/market-controls') {
    const found = await requireStaff(system, headers, 'data');
    const loadQuotes = system.loadAdminMarketQuotes || readEvQuotes;
    if (req.method === 'GET') { accountJson(res, await getMarketControlInventory({ db: system.db, loadQuotes })); return; }
    if (req.method !== 'POST') throw new AccountError('Method not allowed.', 405);
    system.requireRecent(found);
    accountJson(res, await setMarketControl({ system, actorId: found.user.id, body: await readJSON(req), loadQuotes })); return;
  }
  if (route === '/api/admin/capabilities' && req.method === 'GET') {
    const found = await requireStaff(system, headers);
    accountJson(res, { actor: { id: found.user.id, name: found.user.name, role: found.user.role }, permissions: found.permissions }); return;
  }
  const operation = operationPermission(route);
  if (operation) {
    const found = await requireStaff(system, headers, operation);
    if (!['GET', 'HEAD'].includes(req.method)) system.requireRecent(found);
    const result = await handleAdminOperations({ system, found, url, method: req.method, body: ['POST', 'PATCH'].includes(req.method) ? await readJSON(req) : undefined });
    if (result === null) throw new AccountError('Admin route not found.', 404);
    accountJson(res, result); return;
  }
  const found = await requireStaff(system, headers, 'inspect');
  const read = await readAdminData({ system, found, url, method: req.method });
  if (read !== null) { accountJson(res, read); return; }
  const actionRoute = /^\/api\/admin\/accounts\/([^/]+)\/action$/.exec(route);
  if (req.method !== 'POST' || !actionRoute) throw new AccountError('Admin route not found.', 404);
  system.requireRecent(found);
  const body = await readJSON(req), userId = actionRoute[1];
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 8 || reason.length > 500) throw new AccountError('Give a reason between 8 and 500 characters.');
  const permission = { suspend: 'suspend', restore: 'suspend', 'revoke-sessions': 'suspend', 'grant-access': 'grant', 'revoke-grants': 'grant', 'set-role': 'roles' }[body.action];
  if (!permission || !found.permissions.includes(permission)) throw new AccountError('This role cannot perform that action.', 403);
  const target = await system.db.selectFrom('user').selectAll().where('id', '=', userId).executeTakeFirst();
  if (!target) throw new AccountError('Account not found.', 404);
  if (userId === found.user.id || target.role === 'owner' || (target.role !== 'customer' && found.user.role !== 'owner')) throw new AccountError('This account cannot be changed using this action.', 403);
  const now = new Date().toISOString();
  await system.db.transaction().execute(async tx => {
    if (body.action === 'suspend' || body.action === 'restore') {
      if (target.status === 'deletion-pending') throw new AccountError('Deletion requests require the documented privacy review.', 409);
      await tx.updateTable('user').set({ status: body.action === 'suspend' ? 'suspended' : 'active' }).where('id', '=', userId).execute();
    }
    if (body.action === 'set-role') {
      if (!Object.hasOwn(ROLES, body.role) || body.role === 'owner') throw new AccountError('Choose a supported staff role.');
      if (body.role !== 'customer' && (!target.emailVerified || !target.twoFactorEnabled)) throw new AccountError('The account must verify its email and enable MFA before receiving a staff role.');
      await tx.updateTable('user').set({ role: body.role }).where('id', '=', userId).execute();
    }
    if (body.action === 'grant-access') {
      const expires = Date.parse(body.expiresAt);
      if (!Object.hasOwn(PLAN_CATALOG, body.plan) || body.plan === 'free' || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 366 * 86400_000) throw new AccountError('Choose a plan and an expiration within the next year.');
      await tx.insertInto('accessGrant').values({ id: randomUUID(), userId, plan: body.plan, reason, expiresAt: new Date(expires).toISOString(), revokedAt: null, createdAt: now, createdBy: found.user.id }).execute();
    }
    if (body.action === 'revoke-grants') await tx.updateTable('accessGrant').set({ revokedAt: now }).where('userId', '=', userId).where('revokedAt', 'is', null).execute();
    if (['suspend', 'set-role', 'revoke-sessions'].includes(body.action)) await tx.deleteFrom('session').where('userId', '=', userId).execute();
    await system.audit({ userId, actorId: found.user.id, action: `admin.${body.action}`, detail: { reason, ...(body.role ? { role: body.role } : {}), ...(body.plan ? { plan: body.plan, expiresAt: body.expiresAt } : {}) } }, tx);
  });
  if (body.action === 'grant-access' && system.mail.configured) await sweepTrialNotices({ ...system, userId });
  accountJson(res, { status: true });
}

export async function enforceAccountAccess(req, res, url, system) {
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const isAdmin = route !== '/admin/login' && (route === '/admin' || route.startsWith('/admin/') || route === '/admin.html' || route === '/admin-accounts.html');
  const feature = requiredFeature(route, url);
  if (!isAdmin && feature === null) return false;
  const api = route.startsWith('/api/');
  try {
    if (!system) throw new AccountError('Account services are not configured yet.', 503, 'ACCOUNTS_UNAVAILABLE');
    if (feature === DENY_FEATURE) throw new AccountError('Not found.', 404);
    const { headers } = headersFor(req, system);
    if (isAdmin) { await requireStaff(system, headers); return false; }
    const found = await system.requireSession(headers);
    if (route.startsWith('/api/ev/') && !['GET', 'HEAD'].includes(req.method)) {
      checkOrigin(req, system); const staff = await requireStaff(system, headers, 'data'); system.requireRecent(staff);
      await system.audit({ userId: staff.user.id, actorId: staff.user.id, action: 'data.provider-write', detail: { method: req.method, route: '/api/ev' } });
      return false;
    }
    const { entitlements } = await system.billing.summary(found.user.id);
    if (!entitlements.features.includes(feature)) throw new AccountError('Your current plan does not include this tool.', 403, 'UPGRADE_REQUIRED');
    // Pages render navigation for the plan the viewer actually has.
    req.sportslabFeatures = [...entitlements.features];
    return false;
  } catch (error) {
    if (api) accountJson(res, { error: error.status && error.status < 500 ? error.message : 'Account services are unavailable. Please try again later.', code: error.status && error.status < 500 ? error.code : 'ACCOUNTS_UNAVAILABLE' }, error.status || 503);
    else if (error.status === 401) { res.writeHead(302, { Location: `/login?next=${encodeURIComponent(safeReturnPath(url.pathname + url.search))}`, 'Cache-Control': 'no-store' }); res.end(); }
    else if (['UPGRADE_REQUIRED', 'MFA_REQUIRED', 'ADMIN_MFA_REQUIRED'].includes(error.code)) { res.writeHead(302, { Location: `/account?notice=${encodeURIComponent(error.code)}`, 'Cache-Control': 'no-store' }); res.end(); }
    else { res.writeHead(error.status || 503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Account access | VisualOdds</title><link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/account-system.css"><link rel="stylesheet" href="/account-mobile.css"><link rel="stylesheet" href="/account-2026.css?v=1"><style>body.account-page.access-page{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(760px 360px at 50% -10%,rgb(163 240 107/.1),transparent 65%),#07090b}.access-card{position:relative;width:min(100%,480px);padding:34px 32px 30px;border:1px solid rgb(163 240 107/.18);border-radius:24px;background:radial-gradient(420px 160px at 0% 0%,rgb(163 240 107/.08),transparent 70%),#0e1215;box-shadow:inset 0 1px 0 rgb(255 255 255/.05),0 30px 80px -40px rgb(163 240 107/.35);color:#b9c3be;line-height:1.6}.access-card::before{content:"";position:absolute;left:24px;right:24px;top:-1px;height:1px;background:linear-gradient(90deg,transparent,rgb(163 240 107/.6),transparent)}.access-card .account-brand{display:inline-flex;align-items:center;gap:9px;color:#edf2ee;font-weight:750;font-size:19px;text-decoration:none}.access-card .account-brand img{width:30px;height:30px}.access-icon{display:grid;place-items:center;width:46px;height:46px;margin:26px 0 16px;border-radius:14px;background:rgb(163 240 107/.08);box-shadow:inset 0 0 0 1px rgb(163 240 107/.22);color:#a3f06b}.access-card h1{margin:0 0 8px;color:#edf2ee;font-size:24px;letter-spacing:-.02em}.access-card p{margin:0}.access-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.access-actions a{display:inline-flex;align-items:center;height:40px;padding:0 18px;border:1px solid #2a3036;border-radius:999px;color:#edf2ee;font-weight:600;font-size:13.5px;text-decoration:none}.access-actions a:first-child{border-color:#a3f06b;background:#a3f06b;color:#0a200f;box-shadow:0 10px 26px -12px rgb(163 240 107/.7)}.access-actions a:hover{border-color:rgb(163 240 107/.5)}</style><body class="account-page access-page"><main class="access-card"><a class="account-brand" href="/"><img src="/favicon.svg" alt="" width="30" height="30">VisualOdds</a><span class="access-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg></span><h1>Account access is unavailable</h1><p>Sign in with an authorized account, or try again when account services are ready.</p><p class="access-actions"><a href="/login">Sign in</a><a href="/">VisualOdds home</a></p></main></body></html>'); }
    return true;
  }
}
