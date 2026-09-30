import { accountStorage, accountReady, accountSyncState } from './account-sync.js';

// This key already belongs to the signed-in account's "bets" data bucket.
// Never read global localStorage here: legacy device data has a separate import flow.
const ACCOUNT_WORKSPACE_KEY = 'sportslab-ev-workbench-v1';
// accountStorage keeps unrecognized keys in memory for this document only.
const GUEST_SUITE_KEY = 'sportslab-ev-suite-session-v1';
const collections = ['quotes','history','dfs','contracts','contractHistory','traders','trades','bets','results','alerts','notifications','slips'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyWorkspace = () => ({version:1,...Object.fromEntries(collections.map(name => [name,[]])),paytables:{}});

/** Suite settings sync through `storage` (the account adapter). */
export function createSuiteStorage({ storage, userId = () => null } = {}) {
  const key = () => userId() ? ACCOUNT_WORKSPACE_KEY : GUEST_SUITE_KEY;

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
  // Older builds nested a demo workspace here; it is dropped and never written back.
  function writeWorkspace(storageKey, workspace) {
    const { demoWorkspace, ...synced } = workspace;
    storage.setItem(storageKey, JSON.stringify(synced));
  }

  /** Returns a detached suite snapshot, or null when this account/session has none. */
  function readSuiteState() {
    const workspace = readWorkspace(key());
    return workspace?.suite ? JSON.parse(JSON.stringify(workspace.suite)) : null;
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
   * Drops a demo workspace that older builds nested in account data. Otherwise the
   * oversized pending draft keeps failing to sync after every reload.
   */
  function releaseAccountDemoWorkspace() {
    const storageKey = key();
    let workspace;
    try { workspace = readWorkspace(storageKey); } catch { return false; }
    if (!workspace || !Object.hasOwn(workspace, 'demoWorkspace')) return false;
    writeWorkspace(storageKey, workspace);
    return true;
  }

  return { readSuiteState, writeSuiteState, releaseAccountDemoWorkspace };
}

await accountReady;

const suiteStorage = createSuiteStorage({ storage: accountStorage, userId: () => accountSyncState().userId });
try { suiteStorage.releaseAccountDemoWorkspace(); } catch { /* Account sync reports session and storage errors. */ }

export const { readSuiteState, writeSuiteState } = suiteStorage;
