import { accountStorage, accountReady, accountSyncState } from './account-sync.js';

// This key already belongs to the signed-in account's "bets" data bucket.
// Never read global localStorage here: legacy device data has a separate import flow.
const ACCOUNT_WORKSPACE_KEY = 'sportslab-ev-workbench-v1';
// accountStorage keeps unrecognized keys in memory for this document only.
const GUEST_SUITE_KEY = 'sportslab-ev-suite-session-v1';
// Showcase records are regenerated on every load and exceed the account payload
// limit, so demo edits stay in this tab and never enter synced account data.
export const DEMO_SESSION_PREFIX = 'sportslab-ev-demo-session-v1:';
const collections = ['quotes','history','dfs','contracts','contractHistory','traders','trades','bets','results','alerts','notifications','slips'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyWorkspace = () => ({version:1,example:false,...Object.fromEntries(collections.map(name => [name,[]])),paytables:{}});

function demoSnapshot(value) {
  if (!isObject(value) || value.version !== 1 || collections.some(name => value[name] != null && !Array.isArray(value[name])) || value.suite != null && !isObject(value.suite)) {
    throw new Error('Saved +EV demo workspace has an unsupported format. Existing data was preserved.');
  }
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(value)); }
  catch { throw new Error('The +EV demo workspace could not be saved as JSON. Existing data was preserved.'); }
  if (!isObject(snapshot) || snapshot.version !== 1) throw new Error('The +EV demo workspace must serialize to a version 1 object.');
  // The personal ledger has its own account key and merge/validation workflow.
  delete snapshot.personalBets;
  return snapshot;
}

/**
 * Suite settings sync through `storage` (the account adapter). Demo workspaces
 * use `session` (per-tab sessionStorage) and fall back to document memory.
 */
export function createSuiteStorage({ storage, userId = () => null, session } = {}) {
  const memory = new Map();
  const key = () => userId() ? ACCOUNT_WORKSPACE_KEY : GUEST_SUITE_KEY;
  const demoKey = () => DEMO_SESSION_PREFIX + (userId() || 'guest');

  function readWorkspace(storageKey) {
    // The account adapter enforces readiness, account identity and readable storage.
    const raw = storage.getItem(storageKey);
    if (raw === null) return null;
    let workspace;
    try { workspace = JSON.parse(raw); }
    catch { throw new Error('Saved +EV account data could not be read. Existing data was preserved.'); }
    if (!isObject(workspace) || workspace.version !== 1) {
      throw new Error('Saved +EV account data has an unsupported format. Existing data was preserved.');
    }
    if (workspace.suite != null && !isObject(workspace.suite)) {
      throw new Error('Saved +EV settings have an unsupported format. Existing data was preserved.');
    }
    return workspace;
  }
  // Older builds nested the whole demo workspace here; it is never written back.
  function writeWorkspace(storageKey, workspace) {
    const { demoWorkspace, ...synced } = workspace;
    storage.setItem(storageKey, JSON.stringify(synced));
  }

  function readDemoRaw() {
    const id = demoKey();
    if (memory.has(id)) return memory.get(id);
    try { return session?.getItem(id) ?? null; } catch { return null; }
  }
  function saveDemo(snapshot) {
    const id = demoKey(), raw = JSON.stringify(snapshot);
    try { session.setItem(id, raw); memory.delete(id); }
    catch {
      memory.set(id, raw);
      try { session?.removeItem(id); } catch { /* Memory shadows any stale tab copy. */ }
    }
  }

  /** Returns a detached suite snapshot, or null when this account/session has none. */
  function readSuiteState() {
    const workspace = readWorkspace(key());
    return workspace?.suite ? JSON.parse(JSON.stringify(workspace.suite)) : null;
  }

  /** Returns this tab's complete detached demo workspace, or null. */
  function readSuiteWorkspace() {
    const raw = readDemoRaw();
    if (raw === null) return null;
    try { return demoSnapshot(JSON.parse(raw)); }
    catch { return null; }
  }

  /**
   * Stores demo edits for this tab only. Account data is never touched, so
   * example records cannot reach sync; use writeSuiteState for shared settings.
   */
  function writeSuiteWorkspace(state) {
    const snapshot = demoSnapshot(state);
    saveDemo(snapshot);
    return snapshot;
  }

  /**
   * Saves a complete suite snapshot without replacing the workspace's market data.
   * Signed-in data uses account sync; guest data remains isolated to this document.
   * Errors propagate so callers can retain the in-memory state and show save failures.
   */
  function writeSuiteState(suite) {
    if (!isObject(suite)) throw new Error('The +EV suite state must be an object.');
    let snapshot;
    try { snapshot = JSON.parse(JSON.stringify(suite)); }
    catch { throw new Error('The +EV suite state could not be saved as JSON. Existing data was preserved.'); }
    if (!isObject(snapshot)) throw new Error('The +EV suite state must serialize to an object.');

    const storageKey = key();
    // Re-read on every write, preserving all current outer fields, including unknown
    // fields added by newer versions of the existing workspace.
    const workspace = readWorkspace(storageKey) || emptyWorkspace();
    writeWorkspace(storageKey, { ...workspace, suite: snapshot });
    return snapshot;
  }

  /**
   * Moves a demo workspace saved by older builds out of account data. Otherwise
   * the oversized pending draft keeps failing to sync after every reload.
   */
  function releaseAccountDemoWorkspace() {
    const storageKey = key();
    let workspace;
    try { workspace = readWorkspace(storageKey); } catch { return false; }
    if (!workspace || !Object.hasOwn(workspace, 'demoWorkspace')) return false;
    if (workspace.demoWorkspace != null && readDemoRaw() === null) {
      try { saveDemo(demoSnapshot(workspace.demoWorkspace)); } catch { /* Showcase data regenerates. */ }
    }
    writeWorkspace(storageKey, workspace);
    return true;
  }

  return { readSuiteState, readSuiteWorkspace, writeSuiteWorkspace, writeSuiteState, releaseAccountDemoWorkspace };
}

await accountReady;

const tabStorage = (() => { try { return globalThis.sessionStorage; } catch { return undefined; } })();
const suiteStorage = createSuiteStorage({ storage: accountStorage, userId: () => accountSyncState().userId, session: tabStorage });
try { suiteStorage.releaseAccountDemoWorkspace(); } catch { /* Account sync reports session and storage errors. */ }

export const { readSuiteState, readSuiteWorkspace, writeSuiteWorkspace, writeSuiteState } = suiteStorage;
