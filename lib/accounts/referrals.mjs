// Referral links: each account gets a short code (/r/<code>). A visitor who arrives through it gets
// a 30-day first-party cookie; when they create an account, the sign-up is credited to the referrer.
// Rewards (e.g. a free month) are applied through billing once checkout is live.
import { randomBytes } from 'node:crypto';

export const REFERRAL_COOKIE = 'vo_ref';
const CODE = /^[a-z0-9]{8}$/;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export async function migrateReferralTables(db) {
  await db.schema.createTable('referralCode').ifNotExists()
    .addColumn('code', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.notNull().unique())
    .addColumn('createdAt', 'text', c => c.notNull()).execute();
  await db.schema.createTable('referralSignup').ifNotExists()
    .addColumn('referredUserId', 'text', c => c.primaryKey()).addColumn('referrerUserId', 'text', c => c.notNull())
    .addColumn('createdAt', 'text', c => c.notNull()).execute();
}

function newCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('');
}

/** The user's referral code, created on first request. */
export async function referralCodeFor(db, userId) {
  const existing = await db.selectFrom('referralCode').select('code').where('userId', '=', userId).executeTakeFirst();
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const inserted = await db.insertInto('referralCode').values({ code, userId, createdAt: new Date().toISOString() })
      .onConflict(c => c.doNothing()).returning('code').executeTakeFirst();
    if (inserted) return inserted.code;
    const raced = await db.selectFrom('referralCode').select('code').where('userId', '=', userId).executeTakeFirst();
    if (raced) return raced.code;
  }
  throw new Error('Could not create a referral code.');
}

export async function referralSummary(db, userId, origin) {
  const code = await referralCodeFor(db, userId);
  const row = await db.selectFrom('referralSignup').select(eb => eb.fn.countAll().as('count')).where('referrerUserId', '=', userId).executeTakeFirst();
  return { code, url: `${origin.replace(/\/+$/, '')}/r/${code}`, signups: Number(row?.count || 0) };
}

export function referralCodeFromCookie(cookieHeader) {
  const match = String(cookieHeader || '').match(new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE}=([a-z0-9]{8})(?:;|$)`));
  return match ? match[1] : null;
}

/** Credit a new account to the referrer in the cookie (ignores unknown codes and self-referral). */
export async function creditReferral(db, cookieHeader, referredUserId) {
  const code = referralCodeFromCookie(cookieHeader);
  if (!code || !referredUserId) return false;
  const owner = await db.selectFrom('referralCode').select('userId').where('code', '=', code).executeTakeFirst();
  if (!owner || owner.userId === referredUserId) return false;
  const inserted = await db.insertInto('referralSignup').values({ referredUserId, referrerUserId: owner.userId, createdAt: new Date().toISOString() })
    .onConflict(c => c.column('referredUserId').doNothing()).returning('referredUserId').executeTakeFirst();
  return !!inserted;
}

/** GET /r/<code>: remember the code for 30 days and send the visitor to sign-up. */
export function handleReferralLink(req, res, url, { secure = false } = {}) {
  const match = url.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (!match) return false;
  const code = match[1].toLowerCase();
  const headers = { Location: '/register', 'Cache-Control': 'no-store' };
  if (CODE.test(code)) headers['Set-Cookie'] = `${REFERRAL_COOKIE}=${code}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  res.writeHead(302, headers); res.end();
  return true;
}
