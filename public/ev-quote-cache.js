// Browser cache for the latest feed quotes and their price history. The snapshot is several MB,
// beyond what localStorage holds (about 5M characters; about half that in Safari), so it lives in
// IndexedDB. Writes are throttled: prices refresh every few seconds and the cache only has to
// make the next page load start with recent data.
const DB = 'sportslab-ev', STORE = 'cache', KEY = 'quotes';
const LEGACY_KEY = 'sportslab-ev-quote-cache-v1';

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

/** Saves at most once per `interval` ms, plus immediately when the page is being hidden. */
export function createThrottledCacheWriter(getValue, { interval = 30_000 } = {}) {
  let last = 0, timer = null;
  const flush = () => { clearTimeout(timer); timer = null; last = Date.now(); return writeQuoteCache(getValue()); };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, last + interval - Date.now()));
  };
  globalThis.addEventListener?.('pagehide', () => { if (timer) void flush(); });
  return { schedule, flush };
}
