import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { randomUUID, createHmac } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'kysely';
import { openAccountDatabase, migrateAccountTables } from './database.mjs';
import { secureSessionAdapter, tokenHash } from './secure-adapter.mjs';
import { createAccountMail } from './mail.mjs';
import { createBilling, migrateBilling } from './billing.mjs';
import { migrateTrialNotices } from './trials.mjs';

export const POLICY_VERSION = '2026-09-28';
export class AccountError extends Error {
  constructor(message, status = 400, code = 'ACCOUNT_ERROR') { super(message); this.status = status; this.code = code; }
}
export function normalizeEmail(email) {
  // Email/password provider uses case-insensitive addresses. Preserve dots and tags.
  if (typeof email !== 'string' || email.length > 254) throw new AccountError('Enter a valid email address.');
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new AccountError('Enter a valid email address.');
  return value;
}
export function safeReturnPath(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return fallback;
  const path = new URL(value, 'https://sportslab.invalid');
  return path.origin === 'https://sportslab.invalid' ? path.pathname + path.search + path.hash : fallback;
}
export function validatePassword(password) {
  if (typeof password !== 'string' || [...password].length < 15 || password.length > 128) throw new AccountError('Use a password with 15 to 128 characters.');
  const common = ['password', 'qwerty', '123456', 'letmein', 'sportslab', 'visualodds'];
  const blocked = new Set(['qwertyuiopasdfgh', 'qwertyuiopasdfghjkl', '123456789012345', '1234567890123456', '12345678901234567890', 'abcdefghijklmnop', 'iloveyouiloveyou', 'correct horse battery staple']);
  if (blocked.has(password.toLowerCase()) || common.some(word => new RegExp(`^(?:${word})+[\\s!@#$%^&*0-9]*$`, 'i').test(password))) throw new AccountError('Choose a less common password or a unique passphrase.');
}

export async function createAccountSystem({ env: givenEnv = process.env, database, transport, migrate = false, stripe } = {}) {
  const env = { ...givenEnv };
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new AccountError('Accounts need a configured signing secret.', 503, 'ACCOUNTS_UNAVAILABLE');
  if (!env.BETTER_AUTH_URL) throw new AccountError('Accounts need a configured site URL.', 503, 'ACCOUNTS_UNAVAILABLE');
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  if ((env.VERCEL || env.NODE_ENV === 'production') && !origin.startsWith('https://')) throw new AccountError('Hosted accounts require HTTPS.', 503);
  env.BETTER_AUTH_URL = origin;
  const { db, type } = database || await openAccountDatabase(env);
  try {
  const context = new AsyncLocalStorage();
  const transactionContext = new AsyncLocalStorage();
  const activeDatabase = () => transactionContext.getStore() || db;
  const secret = env.BETTER_AUTH_SECRET;
  const audit = async ({ userId = null, actorId = null, action, detail = {} }, executor = activeDatabase()) => {
    // Callers pass explicitly selected fields; never log request bodies or bearer secrets.
    await executor.insertInto('accountAudit').values({ id: randomUUID(), userId, actorId, action, detail: JSON.stringify(detail), createdAt: new Date().toISOString() }).execute();
  };
  const mail = createAccountMail({ db, env, secret, transport });
  const options = {
    appName: 'VisualOdds', baseURL: origin, basePath: '/api/auth', secret,
    database: { db, type, transaction: true },
    trustedOrigins: [origin],
    logger: { disabled: true }, telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, autoSignIn: false,
      minPasswordLength: 15, maxPasswordLength: 128, resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        if (user.status !== 'active') return;
        await mail.send({ to: user.email, template: 'reset-password', data: { name: user.name, url: `${origin}/reset-password?token=${encodeURIComponent(token)}` } }, activeDatabase());
      },
      onPasswordReset: async ({ user }) => {
        await activeDatabase().deleteFrom('session').where('userId', '=', user.id).execute();
        await audit({ userId: user.id, action: 'password.reset' });
        await mail.send({ to: user.email, template: 'password-changed', data: { name: user.name, url: '/forgot-password' } }, activeDatabase());
      },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url, token }) => {
        await activeDatabase().insertInto('accountLink').values({ hash: tokenHash(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000).toISOString(), usedAt: null }).onConflict(c => c.column('hash').doNothing()).execute();
        await mail.send({ to: user.email, template: 'verify-email', data: { name: user.name, url } }, activeDatabase());
      },
      afterEmailVerification: async user => {
        // Email-change verification must never create a usable session, including MFA bypass.
        await activeDatabase().deleteFrom('session').where('userId', '=', user.id).execute();
        await audit({ userId: user.id, action: 'email.verified' });
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    user: {
      changeEmail: { enabled: true }, deleteUser: { enabled: false },
      additionalFields: {
        role: { type: 'string', defaultValue: 'customer', input: false },
        status: { type: 'string', defaultValue: 'active', input: false },
        termsAcceptedAt: { type: 'string', input: false },
        policyVersion: { type: 'string', input: false },
        initialMarketingConsent: { type: 'boolean', defaultValue: false, input: false, returned: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, freshAge: 300,
      cookieCache: { enabled: false },
      additionalFields: {
        encryptedToken: { type: 'string', input: false, returned: false },
        mfaVerifiedAt: { type: 'string', required: false, input: false },
        reauthenticatedAt: { type: 'string', required: false, input: false },
      },
    },
    verification: { storeIdentifier: 'hashed' },
    // Additional atomic application limiter covers both IP and normalized email.
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    advanced: {
      useSecureCookies: origin.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:') },
      database: { generateId: () => randomUUID(), validateSchema: false },
      ipAddress: { ipAddressHeaders: ['x-account-ip'] },
    },
    plugins: [twoFactor({ issuer: 'VisualOdds', backupCodeOptions: { storeBackupCodes: 'encrypted', amount: 10 }, accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 } })],
    databaseHooks: {
      user: {
        create: { before: async user => ({ data: { ...user, role: 'customer', status: 'active', termsAcceptedAt: new Date().toISOString(), policyVersion: POLICY_VERSION, initialMarketingConsent: context.getStore()?.marketingConsent === true } }) },
      },
      session: { create: { before: async session => {
        const user = await activeDatabase().selectFrom('user').select(['status']).where('id', '=', session.userId).executeTakeFirst();
        if (!user) return false;
        if (user.status !== 'active') throw new APIError('FORBIDDEN', { code: user.status === 'deletion-pending' ? 'ACCOUNT_DELETED' : 'ACCOUNT_SUSPENDED', message: 'This account is not available. Contact the service operator.' });
        return { data: { ...session, mfaVerifiedAt: null, reauthenticatedAt: null } };
      } } },
    },
  };
  if (migrate) {
    await (await getMigrations(options)).runMigrations();
    await migrateAccountTables(db);
    await migrateBilling(db);
    await migrateTrialNotices(db);
    // Provider identity must never resolve to two accounts.
    await db.schema.createIndex('account_provider_identity_unique').ifNotExists().on('account').columns(['providerId', 'accountId']).unique().execute();
    await db.insertInto('accountMigration').values({ version: '2026-09-28-accounts-v1-ready', appliedAt: new Date().toISOString() }).onConflict(c => c.column('version').doNothing()).execute();
  } else {
    const applied = await db.selectFrom('accountMigration').select('version').where('version', '=', '2026-09-28-accounts-v1-ready').executeTakeFirst().catch(() => null);
    if (!applied) throw new AccountError('Account database migration is required.', 503, 'ACCOUNTS_UNAVAILABLE');
  }
  const auth = betterAuth({ ...options, database: secureSessionAdapter(db, type, secret, transactionContext) });
  const billing = createBilling({ db, env, mail, audit, ...(stripe ? { stripe } : {}) });
  async function limit(scope, value, max = 10, window = 900_000) {
    const bucket = Math.floor(Date.now() / window);
    const key = createHmac('sha256', secret).update(`${scope}:${value}:${bucket}`).digest('hex');
    const row = await db.insertInto('accountLimit').values({ key, count: 1, expiresAt: new Date((bucket + 1) * window).toISOString() })
      .onConflict(c => c.column('key').doUpdateSet({ count: sql`"accountLimit"."count" + 1` })).returning('count').executeTakeFirst();
    if (row.count > max) throw new AccountError('Too many attempts. Wait a few minutes and try again.', 429, 'RATE_LIMITED');
  }
  async function session(headers) {
    const found = await auth.api.getSession({ headers });
    if (!found) return null;
    if (found.user.status !== 'active') { await db.deleteFrom('session').where('userId', '=', found.user.id).execute(); return null; }
    return found;
  }
  async function requireSession(headers) {
    const found = await session(headers);
    if (!found) throw new AccountError('Sign in to continue.', 401, 'SIGN_IN_REQUIRED');
    if (!found.user.emailVerified) throw new AccountError('Verify your email to continue.', 403, 'EMAIL_NOT_VERIFIED');
    if (found.user.twoFactorEnabled && !found.session.mfaVerifiedAt) throw new AccountError('Verify your authenticator code to continue.', 403, 'MFA_REQUIRED');
    return found;
  }
  function requireRecent(found) {
    const age = Date.now() - Date.parse(found.session.reauthenticatedAt);
    if (!Number.isFinite(age) || age < 0 || age > 300_000) throw new AccountError('Confirm your password again before making this change.', 403, 'REAUTHENTICATION_REQUIRED');
  }
  return { env, origin, db, type, auth, options, mail, billing, audit, limit, context, session, requireSession, requireRecent, close: () => db.destroy() };
  } catch (error) {
    if (!database) await db.destroy().catch(() => {});
    throw error;
  }
}
