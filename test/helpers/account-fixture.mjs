import { randomUUID, randomBytes } from 'node:crypto';
import { createAccountSystem } from '../../lib/accounts/auth.mjs';
import { configureAccountTestRuntime } from '../../lib/accounts/runtime.mjs';

// Rendering/API validation tests seed an existing verified Pro customer. Complete
// registration, verification and payment journeys are tested in account-auth/billing.
export async function authenticatedAccountFixture(origin) {
  const system = await createAccountSystem({ env: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ACCOUNT_DB_PATH: ':memory:' }, migrate: true, transport: async () => {} });
  const email = 'existing-customer@example.test', password = 'Existing sports research passphrase 42';
  const registration = await system.auth.api.signUpEmail({ body: { email, password, name: 'Existing customer' } });
  await system.db.updateTable('user').set({ emailVerified: system.type === 'sqlite' ? 1 : true }).where('id', '=', registration.user.id).execute();
  await system.db.insertInto('accessGrant').values({ id: randomUUID(), userId: registration.user.id, plan: 'pro', reason: 'Rendering integration fixture', expiresAt: new Date(Date.now() + 86400_000).toISOString(), revokedAt: null, createdAt: new Date().toISOString(), createdBy: null }).execute();
  const response = await system.auth.api.signInEmail({ body: { email, password }, asResponse: true, headers: new Headers({ origin }) });
  if (!response.ok) throw new Error('Fixture authentication failed.');
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  configureAccountTestRuntime(system);
  return { system, fetch: (url, options = {}) => {
    if (new URL(url).origin !== origin) throw new Error('Fixture credentials cannot leave the test origin.');
    return globalThis.fetch(url, { ...options, headers: { Cookie: cookie, ...(options.headers || {}) } });
  }, close: () => system.close() };
}
