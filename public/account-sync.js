// Product data belongs to the authenticated account. Old, unowned browser data
// is read only by the explicit import flow, never during account initialization.
export const ACCOUNT_DATA_KINDS = ['bets', 'filters', 'alerts', 'notes', 'watchlist', 'preferences'];
export const ACCOUNT_DRAFT_PREFIX = 'sportslab-account-draft-v1:';
export function accountDataKind(key) {
  if (['nfl-lab.personal-bets.v1', 'sportslab-ev-workbench-v1', 'sportslab-bet-annotations-v1'].includes(key)) return 'bets';
  if (key === 'nfl-notes' || key === 'mlb-lab-notes' || /^sports-lab-notes-(nfl|mlb|nba|wnba|nhl|soccer)$/.test(key)) return 'notes';
  if (['nfl-saved', 'mlb-lab-watchlist'].includes(key) || /^sports-lab-(saved|trends-watchlist)-(nfl|mlb|nba|wnba|nhl|soccer)$/.test(key)) return 'watchlist';
  if (/^sports-lab-filter-presets:[a-z-]+:[a-z-]+$/.test(key)) return 'filters';
  if (['nfl-auto', 'sports-lab-display', 'sports-lab-dev-mode', 'sportslab-sportsbook-state-v1', 'sportslab-ev-display-v1', 'sportslab-ev-sport', 'sportslab-ev-sharp-min', 'sportslab-docs-theme', 'sports-lab-line-observations-v1', 'sportslab-odds-display-v1', 'sportslab-more-markets-v1', 'sports-lab-parlay-settings'].includes(key)) return 'preferences';
  return null;
}

const record = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const issue = (message, code) => Object.assign(new Error(message), { code });
const safeStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
// Replays local edits onto the newest cloud copy, key by key. Keys changed only
// elsewhere keep the cloud value; keys changed here keep the local value. Without
// a recorded base, every local key is treated as an edit.
export function mergeAccountData(latest, local, base) {
  const cloud = { ...(latest?.storage || {}) }, mine = local?.storage || {}, before = base?.storage;
  const keys = new Set([...Object.keys(mine), ...Object.keys(before || {})]);
  for (const key of keys) {
    if (before && mine[key] === before[key]) continue;
    if (Object.hasOwn(mine, key)) cloud[key] = mine[key]; else delete cloud[key];
  }
  return { ...(latest || {}), ...Object.fromEntries(Object.entries(local || {}).filter(([key]) => key !== 'storage')), storage: cloud };
}

export function createAccountStore({ fetcher = globalThis.fetch?.bind(globalThis), legacyStorage, onState = () => {}, delay = 400 } = {}) {
  let userId = null, initialized = false, locked = false, syncing = null, timer = null, preferences = {};
  const state = new Map(), volatile = new Map();
  const draftKey = kind => ACCOUNT_DRAFT_PREFIX + encodeURIComponent(userId) + ':' + kind;
  const info = () => ({ userId, initialized, locked, pending: [...state].filter(([, entry]) => entry.dirty).map(([kind]) => kind), errors: [...state].filter(([, entry]) => entry.error).map(([kind, entry]) => ({ kind, message: entry.error, conflict: entry.conflict })) });
  const notify = () => onState(info());
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function rebase(entry, latest) {
    const merged = mergeAccountData(latest.value, entry.value, entry.base);
    Object.assign(entry, { value: merged, version: latest.version, base: clone(latest.value), error: null, conflict: false, dirty: !same(merged, latest.value) });
  }
  function saveDraft(kind, entry) {
    if (!userId || !legacyStorage) return;
    try {
      if (entry.dirty) legacyStorage.setItem(draftKey(kind), JSON.stringify({ value: entry.value, version: entry.version, base: entry.base }));
      else legacyStorage.removeItem(draftKey(kind));
    } catch { entry.error = 'Browser storage is unavailable. Keep this page open until your changes finish syncing.'; }
  }
  async function request(kind, init = {}) {
    const response = await fetcher('/api/account/data/' + kind, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { 'X-Account-User': userId, ...init.headers } });
    if ([401, 403].includes(response.status)) { locked = true; throw issue('Your session changed or expired. Sign in again before saving.', 'session'); }
    if (response.status === 409) throw issue('This data changed in another session. Download your pending changes before reloading.', 'conflict');
    if (!response.ok) throw issue('Account data could not sync. Your pending changes remain on this device. Retry when connected.', 'network');
    const result = await response.json();
    if (!Number.isInteger(result.version) || result.version < 0) throw issue('Account data could not be read. Retry before editing.', 'format');
    return { value: record(result.value) ? result.value : {}, version: result.version };
  }
  async function session() {
    const response = await fetcher('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw issue('Your account session could not be checked. Reload before editing saved data.', 'session');
    const result = await response.json();
    preferences = result?.user?.id && record(result.preferences) ? result.preferences : {};
    return typeof result?.user?.id === 'string' ? result.user.id : null;
  }
  async function initialize() {
    try { userId = await session(); }
    catch { locked = true; initialized = true; notify(); return info(); }
    if (userId) {
      await Promise.all(ACCOUNT_DATA_KINDS.map(async kind => {
        const entry = { value: {}, version: 0, base: {}, dirty: false, error: null, conflict: false, readable: false };
        state.set(kind, entry);
        try {
          const latest = await request(kind);
          Object.assign(entry, latest, { base: clone(latest.value), readable: true });
          let draft;
          try { draft = JSON.parse(legacyStorage?.getItem(draftKey(kind)) || 'null'); } catch { /* Never overwrite unreadable legacy drafts. */ }
          if (record(draft?.value) && Number.isInteger(draft.version)) {
            const latest = { value: entry.value, version: entry.version };
            Object.assign(entry, { value: draft.value, version: draft.version, base: record(draft.base) ? draft.base : null, dirty: true });
            if (draft.version !== latest.version) { rebase(entry, latest); saveDraft(kind, entry); }
          }
        } catch (error) { entry.error = error.message; }
      }));
    }
    initialized = true; notify();
    if ([...state.values()].some(entry => entry.dirty)) schedule();
    return info();
  }
  async function checkIdentity() {
    const current = await session();
    if (current !== userId) {
      locked = true; volatile.clear(); state.clear(); preferences = {}; notify();
      throw issue('The signed-in account changed. Reload to continue with the current account.', 'session');
    }
    return current;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { void flush().catch(() => {}); }, delay); timer?.unref?.(); }
  function entryFor(key) {
    if (!initialized || locked) throw issue('Your account session could not be checked. Reload before editing saved data.', 'session');
    const kind = accountDataKind(key);
    if (!userId || !kind) return null;
    const entry = state.get(kind);
    if (!entry?.readable) throw issue('Your saved data could not load. Retry before making changes.', 'network');
    return { entry, kind };
  }
  const storage = {
    getItem(key) {
      const found = entryFor(String(key));
      const value = found ? found.entry.value.storage?.[key] : volatile.get(String(key));
      return typeof value === 'string' ? value : null;
    },
    setItem(key, value) {
      key = String(key); value = String(value);
      const found = entryFor(key);
      if (!found) { volatile.set(key, value); return; }
      if (found.entry.value.storage?.[key] === value) return;
      found.entry.value = { ...found.entry.value, storage: { ...found.entry.value.storage, [key]: value } };
      found.entry.dirty = true; saveDraft(found.kind, found.entry); notify(); schedule();
    },
    removeItem(key) {
      key = String(key);
      const found = entryFor(key);
      if (!found) { volatile.delete(key); return; }
      if (!Object.hasOwn(found.entry.value.storage || {}, key)) return;
      const values = { ...found.entry.value.storage }; delete values[key];
      found.entry.value = { ...found.entry.value, storage: values };
      found.entry.dirty = true; saveDraft(found.kind, found.entry); notify(); schedule();
    },
  };
  async function flush() {
    clearTimeout(timer);
    if (syncing) return syncing;
    if (!userId || locked) return info();
    syncing = (async () => {
      try { await checkIdentity(); } catch (error) { locked = true; notify(); throw error; }
      for (const [kind, entry] of state) {
        if (!entry.dirty || !entry.readable || locked) continue;
        for (let attempt = 0; attempt < 4 && entry.dirty && !locked; attempt++) {
          const snapshot = clone(entry.value);
          try {
            const updated = await request(kind, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: snapshot, version: entry.version }) });
            entry.version = updated.version; entry.base = snapshot; entry.error = null;
            entry.dirty = !same(entry.value, snapshot);
            saveDraft(kind, entry); break;
          } catch (error) {
            if (error.code !== 'conflict') { entry.error = error.message; break; }
            // Another tab or device saved first: merge onto its copy and try again.
            try { rebase(entry, await request(kind)); saveDraft(kind, entry); } catch (latestError) { entry.error = latestError.message; break; }
          }
        }
      }
      notify(); return info();
    })().finally(() => {
      syncing = null;
      const waiting = [...state.values()].filter(entry => entry.dirty && entry.readable);
      if (!locked && waiting.length) { clearTimeout(timer); timer = setTimeout(() => { void flush().catch(() => {}); }, waiting.some(entry => entry.error) ? Math.max(delay, 15_000) : delay); timer?.unref?.(); }
    });
    return syncing;
  }
  function legacySummary() {
    const groups = new Map();
    if (legacyStorage) for (let index = 0; index < legacyStorage.length; index++) {
      const key = legacyStorage.key(index), kind = accountDataKind(key);
      if (!kind || !legacyStorage.getItem(key)) continue;
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(key);
    }
    return { count: [...groups.values()].reduce((sum, keys) => sum + keys.length, 0), groups: [...groups].map(([kind, keys]) => ({ kind, count: keys.length, keys })) };
  }
  async function importLegacy({ confirmed = false } = {}) {
    if (!confirmed) throw issue('Confirm that the saved data on this device belongs to you before importing.', 'confirmation');
    if (!userId || locked) throw issue('Sign in before importing browser data.', 'session');
    await checkIdentity();
    const summary = legacySummary(); let imported = 0, skipped = 0;
    for (const group of summary.groups) for (const key of group.keys) {
      const existing = storage.getItem(key);
      if (existing !== null) { skipped++; continue; }
      storage.setItem(key, legacyStorage.getItem(key)); imported++;
    }
    const result = await flush();
    if (result.pending.length || result.errors.length) throw issue('The import has pending changes. Resolve the sync message before importing again. Original browser data is preserved.', 'pending');
    return { imported, skipped };
  }
  function exportPending() { return { exportedAt: new Date().toISOString(), data: Object.fromEntries([...state].filter(([, entry]) => entry.dirty).map(([kind, entry]) => [kind, { value: clone(entry.value), version: entry.version }])) }; }
  async function discardPending({ confirmed = false } = {}) {
    if (!confirmed) throw issue('Download pending changes before confirming that they can be discarded.', 'confirmation');
    await checkIdentity();
    for (const [kind, entry] of state) if (entry.dirty) { const latest = await request(kind); Object.assign(entry, latest, { base: clone(latest.value), dirty: false, error: null, conflict: false }); saveDraft(kind, entry); }
    notify();
  }
  return { initialize, storage, info, preferences: () => ({ ...preferences }), checkIdentity, flush, legacySummary, importLegacy, exportPending, discardPending };
}

const NOTICE_STYLE = `#account-sync-notice{position:fixed;left:50%;bottom:20px;z-index:9999;transform:translateX(-50%);box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:12px 16px;width:min(780px,calc(100vw - 32px));padding:14px 14px 14px 16px;border:1px solid rgb(247 194 90/.28);border-radius:18px;background:radial-gradient(420px 120px at 0% 0%,rgb(247 194 90/.08),transparent 70%),rgb(14 18 21/.97);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgb(255 255 255/.05),0 24px 60px -14px rgb(0 0 0/.8);color:#edf2ee;font:500 13px/1.45 'SL Inter',Inter,system-ui,sans-serif;animation:sync-notice-in .22s ease-out}
#account-sync-notice .sync-icon{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:rgb(247 194 90/.12);color:#f7c25a}
#account-sync-notice .sync-copy{flex:1 1 260px;display:grid;gap:2px;min-width:0}
#account-sync-notice .sync-copy strong{font-weight:650;font-size:13.5px;color:#edf2ee}
#account-sync-notice .sync-copy span{color:#b9c3be}
#account-sync-notice .sync-actions{flex:1 1 100%;padding-left:46px;box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:8px}
html body #account-sync-notice .sync-actions :is(button,a){display:inline-flex!important;align-items:center!important;justify-content:center!important;height:34px!important;margin:0!important;padding:0 14px!important;border:1px solid #2f3a42!important;border-radius:999px!important;background:rgb(255 255 255/.03)!important;color:#edf2ee!important;font:600 12.5px/1 'SL Inter',Inter,system-ui,sans-serif!important;white-space:nowrap!important;text-decoration:none!important;cursor:pointer!important;transition:border-color .15s,background .15s,color .15s!important}
html body #account-sync-notice .sync-actions :is(button,a):hover{border-color:rgb(163 240 107/.45)!important;background:rgb(163 240 107/.06)!important;color:#a3f06b!important}
html body #account-sync-notice .sync-actions .is-primary{border-color:#a3f06b!important;background:#a3f06b!important;color:#0a200f!important;box-shadow:0 8px 22px -12px rgb(163 240 107/.7)!important}
html body #account-sync-notice .sync-actions .is-primary:hover{background:#c4f79c!important;border-color:#c4f79c!important;color:#0a200f!important}
html body #account-sync-notice .sync-actions .is-quiet{border-color:transparent!important;background:transparent!important;color:#b9c3be!important;padding:0 10px!important}
html body #account-sync-notice :is(button,a):focus-visible{outline:2px solid #a3f06b!important;outline-offset:2px!important}
@keyframes sync-notice-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:640px){#account-sync-notice{bottom:12px!important;border-radius:16px!important}#account-sync-notice .sync-actions{width:100%!important;padding-left:0!important}#account-sync-notice .sync-actions .is-primary{flex:1!important}}
@media (prefers-reduced-motion:reduce){#account-sync-notice{animation:none}}`;

function displayState(state) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('accountsyncchange', { detail: state }));
  let notice = document.getElementById('account-sync-notice');
  // Sync retries and merges on its own; only a lost session needs the reader.
  const message = state.locked && state.initialized && state.userId ? 'Your account session changed or could not be checked. Reload or sign in to continue safely.' : '';
  if (!message) { notice?.remove(); return; }
  if (!document.body) return;
  if (!document.getElementById('account-sync-style')) { const style = document.createElement('style'); style.id = 'account-sync-style'; style.textContent = NOTICE_STYLE; document.head.append(style); }
  if (!notice) { notice = document.createElement('aside'); notice.id = 'account-sync-notice'; notice.setAttribute('role', 'alert'); document.body.append(notice); }
  notice.innerHTML = '<span class="sync-icon" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2h.01"/></svg></span><div class="sync-copy"><strong></strong><span></span></div><div class="sync-actions"></div>';
  notice.querySelector('.sync-copy strong').textContent = 'Session check needed';
  const copy = notice.querySelector('.sync-copy span'); copy.textContent = message;
  const actions = notice.querySelector('.sync-actions');
  const button = (label, action, tone = '') => { const element = document.createElement('button'); element.type = 'button'; element.textContent = label; if (tone) element.className = tone; element.addEventListener('click', action); actions.append(element); };
  if (state.pending.length) button('Download pending changes', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(singleton.exportPending(), null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'visualodds-pending-account-data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  { const link = document.createElement('a'); link.href = '/login'; link.textContent = 'Sign in'; link.className = 'is-primary'; actions.append(link); }
  button('Reload', () => location.reload(), 'is-quiet');
}
const singleton = createAccountStore({ legacyStorage: safeStorage(), onState: displayState });
export const accountStorage = singleton.storage;
export const accountReady = typeof window !== 'undefined' ? singleton.initialize() : Promise.resolve();
export const accountSyncState = () => singleton.info();
export const getAccountPreferences = () => singleton.preferences();
export const legacyDataSummary = () => singleton.legacySummary();
export const importLegacyData = options => singleton.importLegacy(options);
export const flushAccountData = () => singleton.flush();
export const exportPendingAccountData = () => singleton.exportPending();
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { void accountReady.then(() => singleton.checkIdentity()).catch(() => displayState({ ...singleton.info(), locked: true })); });
  window.addEventListener('online', () => { void singleton.flush().catch(() => {}); });
  window.addEventListener('beforeunload', event => { if (singleton.info().pending.length) { event.preventDefault(); event.returnValue = ''; } });
}
