// Browser cache for the latest feed quotes and their price history. The snapshot is several MB,
// beyond what localStorage holds (about 5M characters; about half that in Safari), so it lives in
// IndexedDB. Writes are throttled: prices refresh every few seconds and the cache only has to
// make the next page load start with recent data.
const DB = 'sportslab-ev', STORE = 'cache', KEY = 'quotes';
const LEGACY_KEY = 'sportslab-ev-quote-cache-v1';

// One connection for the page (a new one per read and write was never closed).
let connection = null;
function open() {
  connection ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
    request.onerror = () => reject(request.error);
  }).catch(error => { connection = null; throw error; });
  return connection;
}

/** Resolves to { quotes, history, apiSyncedAt } or null. Never rejects. */
export async function readQuoteCache() {
  try { globalThis.localStorage?.removeItem(LEGACY_KEY); } catch { /* Older builds kept the cache here. */ }
  try {
    const db = await open();
    return await new Promise(resolve => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => { const value = request.result; resolve(value && Array.isArray(value.quotes) && Array.isArray(value.history) ? value : null); };
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}

/** Resolves to true when saved. Never rejects. */
export async function writeQuoteCache(value) {
  try {
    const db = await open();
    return await new Promise(resolve => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(value, KEY);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    });
  } catch { return false; }
}

/**
 * Saves at most once per `interval` ms (the snapshot is ~30 MB, so not every sync), and right away when
 * the tab is hidden or closed. The first save waits a full interval: saving at page load wrote an empty
 * workspace over the cached prices before they were read. `getValue` returning null skips the save
 * (nothing synced yet). `onResult(saved)` reports failed saves (quota, private mode).
 */
export function createThrottledCacheWriter(getValue, { interval = 300_000, onResult = () => {} } = {}) {
  let last = Date.now(), timer = null;
  const flush = async () => {
    clearTimeout(timer); timer = null;
    const value = getValue();
    if (!value) return false;
    last = Date.now();
    const saved = await writeQuoteCache(value);
    onResult(saved);
    return saved;
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, last + interval - Date.now()));
  };
  const hide = () => { if (timer) void flush(); };
  globalThis.addEventListener?.('pagehide', hide);
  globalThis.document?.addEventListener?.('visibilitychange', () => { if (globalThis.document.visibilityState === 'hidden') hide(); });
  return { schedule, flush };
}
