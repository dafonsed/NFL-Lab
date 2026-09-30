// The EV workspace shows only real data: quotes synced from the odds feed and records the member
// entered. Earlier releases seeded example and demo records (example quotes, a permanent demo
// workspace, arbitrage/odds/smart-money fixtures, a DFS design preview). This module recognizes
// those records so saved workspaces can be cleaned on load, and provides the empty workspace.

// Storage keys that only ever held demo data.
export const LEGACY_DEMO_KEYS = Object.freeze(['sportslab-ev-permanent-demo-v1', 'sportslab-ev-permanent-demo-bets-v1']);
export const LEGACY_DEMO_SESSION_PREFIX = 'sportslab-ev-demo-session-v1:';
export const WORKSPACE_ARRAYS = Object.freeze(['quotes', 'history', 'dfs', 'contracts', 'contractHistory', 'traders', 'trades', 'bets', 'results', 'alerts', 'notifications', 'slips']);

const DEMO_ID = /^(?:example-|h-example-|demo-|permanent-demo-|smart-demo-|arb-demo-|odds-demo-|dfs-preview-|h-(?:demo|permanent-demo|odds-demo|arb-demo|smart-demo)-)/;
const EXAMPLE_NAME = /\(example\)\s*$/i;

/** True for a record that came from example or demo data rather than the feed or the member. */
export function isDemoRecord(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.demo === true || item.example === true) return true;
  if (['example', 'demo', 'design-preview'].includes(item.source)) return true;
  if (DEMO_ID.test(String(item.id ?? ''))) return true;
  for (const field of ['book', 'app', 'platform']) if (EXAMPLE_NAME.test(String(item[field] ?? ''))) return true;
  return /^(?:Demo portfolio|Sample trader)$/i.test(String(item.name ?? ''));
}

export function emptyWorkspace() {
  return { version: 1, ...Object.fromEntries(WORKSPACE_ARRAYS.map(key => [key, []])), paytables: {} };
}

/** Removes example/demo records and flags from a saved workspace. Returns the count removed. */
export function purgeDemoData(workspace) {
  let removed = 0;
  for (const flag of ['example', 'demoPermanent', 'demoRevision', 'demoDay']) if (flag in workspace) { delete workspace[flag]; removed += 1; }
  for (const key of WORKSPACE_ARRAYS) {
    if (!Array.isArray(workspace[key])) continue;
    const kept = workspace[key].filter(item => !isDemoRecord(item));
    removed += workspace[key].length - kept.length;
    workspace[key] = kept;
  }
  if (workspace.paytables && typeof workspace.paytables === 'object') {
    for (const name of Object.keys(workspace.paytables)) if (EXAMPLE_NAME.test(name)) { delete workspace.paytables[name]; removed += 1; }
  }
  return removed;
}

/** Deletes storage that only ever held demo data (local and session). */
export function clearLegacyDemoStorage(local = globalThis.localStorage, session = globalThis.sessionStorage) {
  try { for (const key of LEGACY_DEMO_KEYS) local?.removeItem(key); } catch { /* Storage can be unavailable. */ }
  try {
    const stale = [];
    for (let index = 0; index < (session?.length || 0); index++) { const key = session.key(index); if (key?.startsWith(LEGACY_DEMO_SESSION_PREFIX)) stale.push(key); }
    for (const key of stale) session.removeItem(key);
  } catch { /* Storage can be unavailable. */ }
}
