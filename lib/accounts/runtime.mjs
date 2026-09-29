import { createAccountSystem } from './auth.mjs';
import { createAccountHandler } from './http.mjs';

let initialization;
// Explicit dependency injection for integration tests; no request or env flag can
// manufacture a user/session or bypass the normal authorization path.
export function configureAccountTestRuntime(system) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test runtime is only available under NODE_ENV=test.');
  initialization = Promise.resolve({ system, handle: createAccountHandler(system) });
}
export function accountRuntime() {
  if (!initialization) initialization = (async () => {
    if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) return null;
    try {
      const system = await createAccountSystem({ migrate: process.env.ACCOUNT_AUTO_MIGRATE === 'true' && !process.env.VERCEL && process.env.NODE_ENV !== 'production' });
      return { system, handle: createAccountHandler(system) };
    } catch {
      // Never expose database URLs, provider details, passwords, or tokens in logs.
      console.error('[accounts] Initialization unavailable. Check account configuration and migrations.');
      return null;
    }
  })();
  return initialization;
}
