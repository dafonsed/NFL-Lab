// Local-only design preview. Boots the real server with a throwaway account
// database (gitignored data/ folder) and one verified test customer on a
// time-limited Premium grant, so every gated page can be reviewed without
// production accounts. Uses the account test runtime, which refuses to run
// outside NODE_ENV=test. Sessions survive restarts because the secret and
// database persist in data/.
// Test sign-in: "Continue as guest" on /login, or designer@example.test with PASSWORD from
// test/helpers/admin-api-fixture.mjs.
import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.PORT ||= '3102';
process.env.AUTO_SYNC ||= '0';
delete process.env.VERCEL;
const origin = `http://localhost:${process.env.PORT}`;
process.env.BETTER_AUTH_URL = origin;

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));
fs.mkdirSync(dataDir, { recursive: true });
const secretFile = dataDir + 'design-preview-secret.txt';
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, randomBytes(32).toString('hex'));

const { createAccountSystem } = await import('../lib/accounts/auth.mjs');
const { configureAccountTestRuntime } = await import('../lib/accounts/runtime.mjs');
const { PASSWORD } = await import('../test/helpers/admin-api-fixture.mjs');

const system = await createAccountSystem({
  env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: fs.readFileSync(secretFile, 'utf8').trim(), ACCOUNT_DB_PATH: dataDir + 'design-preview.sqlite' },
  migrate: true,
  transport: async () => {},
});
const email = 'designer@example.test';
let user = await system.db.selectFrom('user').select('id').where('email', '=', email).executeTakeFirst();
if (!user) {
  user = (await system.auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'Design Preview' } })).user;
  await system.db.updateTable('user').set({ emailVerified: 1 }).where('id', '=', user.id).execute();
}
const now = new Date();
await system.db.deleteFrom('accessGrant').where('userId', '=', user.id).execute();
await system.db.insertInto('accessGrant').values({
  id: randomUUID(), userId: user.id, plan: 'pro', reason: 'Local design preview', createdBy: user.id,
  expiresAt: new Date(now.getTime() + 7 * 864e5).toISOString(), revokedAt: null, createdAt: now.toISOString(),
}).execute();
configureAccountTestRuntime(system);
// "Continue as guest" on /login signs straight in to this test account (localhost only).
const { enablePreviewLogin } = await import('../lib/preview-login.mjs');
enablePreviewLogin(async () => {
  const response = await system.auth.api.signInEmail({ body: { email, password: PASSWORD, rememberMe: true }, asResponse: true, headers: new Headers({ origin }) });
  if (!response.ok) throw new Error('Preview sign-in failed.');
  return response.headers.getSetCookie();
});
await import('../server.mjs');
console.log(`Design preview ready at ${origin} — sign in as ${email}`);
