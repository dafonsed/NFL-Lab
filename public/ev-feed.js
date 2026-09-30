// Controls for the shared quote feed. Creating these controls never sends a request.
const waitOptions = [15_000, 30_000, 60_000];
const clockTime = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Never';
const elapsed = value => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds)) return 'unknown';
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
};

export function toolDataLabel(tool, state, quoteLabel) {
  const collection = ['fantasy','optimizer','slip','fantasy-alerts'].includes(tool) ? 'dfs' : tool === 'prediction' ? 'contracts' : tool === 'trends' ? 'results' : null;
  if (!collection) return quoteLabel;
  const label = collection === 'dfs' ? 'DFS props' : collection === 'contracts' ? 'contracts' : 'results';
  const records = state[collection] || [];
  return records.length ? `Entered ${label}` : `No ${label}`;
}

function coverage(tool) {
  if (['fantasy','optimizer','slip','fantasy-alerts'].includes(tool)) return 'DFS feed needed: platform lines, hit probabilities and payout rules. Quote sync does not update DFS props.';
  if (tool === 'prediction') return 'Prediction feed needed: contracts, bids, asks and market depth. Positions and trades use your saved records.';
  if (tool === 'trends') return 'Results feed needed: historical player stats with matching game IDs. Quote sync does not update game results.';
  if (tool === 'sharp') return 'Uses quote sync. Exchange prices, available liquidity and matching sportsbook quotes are required.';
  if (tool === 'promo') return 'Uses quote sync for hedge prices. Enter your bonus amount and promotion terms separately.';
  if (tool === 'line-alerts') return 'Uses saved quote movements. Alerts run in this open browser after a sync or local edit.';
  return 'Uses shared sportsbook quotes. EV and comparison tools need complete matching outcomes across books.';
}

export function createQuoteFeedControls({ sync, getState, getTool, canRefresh = () => true, storage }) {
  const panel = document.createElement('section');
  panel.className = 'ev-feed';
  panel.setAttribute('aria-label', 'Quote feed');
  panel.innerHTML = `<div class="ev-feed-row"><div class="ev-feed-summary"><strong>Quote feed</strong><span data-feed-status role="status" aria-live="polite"></span></div><label class="ev-feed-refresh">Auto-refresh<select aria-label="Quote auto-refresh interval"><option value="0">Off</option><option value="15000">Every 15 seconds</option><option value="30000">Every 30 seconds</option><option value="60000">Every 60 seconds</option></select></label><a href="/docs#api-requirements">Feed requirements</a></div><p class="ev-feed-meta" data-feed-meta></p><p class="ev-feed-detail" data-feed-detail></p><p class="ev-feed-coverage" data-feed-coverage></p>`;
  document.querySelector('.ev-header').after(panel);
  const button = document.querySelector('#ev-sync-api');
  const select = panel.querySelector('select');
  const status = panel.querySelector('[data-feed-status]');
  const meta = panel.querySelector('[data-feed-meta]');
  const detail = panel.querySelector('[data-feed-detail]');
  const toolCoverage = panel.querySelector('[data-feed-coverage]');
  let interval = 0, failures = 0, timer = null, pending = false, nextAt = 0, retryNotBefore = 0, error = '', blocked = false, warning = '';
  // Persist the user's chosen cadence, not an in-flight request or failure state.
  const preferenceKey = 'sportslab-quote-refresh-ms';
  try { storage ??= window.localStorage; const saved = Number(storage.getItem(preferenceKey)); interval = waitOptions.includes(saved) ? saved : 0; } catch { /* Session controls still work without storage. */ }
  select.value = String(interval);
  const savePreference = () => { try { storage.setItem(preferenceKey, String(interval)); } catch { /* Do not block a local control. */ } };

  function update() {
    const state = getState();
    select.disabled = false;
    const quotes = state.quotes.filter(quote => quote.source === 'local-api');
    const stale = quotes.filter(quote => quote.live && (!Number.isFinite(Date.parse(quote.ts)) || Date.now() - Date.parse(quote.ts) > 90_000 || Date.parse(quote.ts) > Date.now() + 5_000)).length;
    const newest = quotes.reduce((latest, quote) => Date.parse(quote.ts) > Date.parse(latest || '1970-01-01') ? quote.ts : latest, '');
    let label = pending ? 'Syncing…' : error ? 'Refresh failed' : state.apiSyncedAt ? 'Snapshot available' : 'Not checked';
    if (!pending && error && navigator.onLine === false) label = 'Connection unavailable';
    else if (!pending && blocked && interval) label = 'Auto-refresh paused';
    else if (!pending && interval && document.hidden) label = 'Paused in background';
    else if (!pending && interval && !canRefresh()) label = 'Paused while editing';
    status.textContent = label;
    status.dataset.tone = error || stale ? 'warning' : pending ? 'busy' : 'neutral';
    button.disabled = pending;
    button.textContent = pending ? 'Syncing…' : 'Sync API';
    const syncAt = state.apiSyncedAt ? `Last sync ${elapsed(state.apiSyncedAt)}` : 'No successful sync yet';
    meta.textContent = `${quotes.length} API quotes · ${syncAt}${newest ? ` · Newest price observed ${elapsed(newest)}` : ''}${stale ? ` · ${stale} expired live quotes excluded from live calculations` : ''}`;
    meta.title = `Last successful sync: ${clockTime(state.apiSyncedAt)}. Latest price observation: ${clockTime(newest)}.`;
    const retry = interval && nextAt && !document.hidden && !blocked ? ` Next attempt in ${Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))}s.` : '';
    detail.textContent = error ? `${error}${blocked ? ' Fix the issue, then press Sync API to retry.' : retry}` : warning || (interval ? 'Auto-refresh runs while this tab is visible. Your saved prices remain available if a request fails.' : 'Press Sync API once, or enable auto-refresh when your feed is ready.');
    toolCoverage.textContent = coverage(getTool());
  }

  function schedule(delay = interval) {
    clearTimeout(timer);
    nextAt = 0;
    if (!interval || blocked || document.hidden || pending) return;
    nextAt = Math.max(Date.now() + delay, retryNotBefore);
    timer = setTimeout(() => { void refresh({ automatic: true }); }, Math.max(0, nextAt - Date.now()));
  }

  async function refresh({ automatic = false } = {}) {
    if (pending) return false;
    if (automatic && (!interval || blocked)) return false;
    clearTimeout(timer);
    nextAt = 0;
    if (automatic && (document.hidden || !canRefresh())) {
      schedule(5_000);
      update();
      return false;
    }
    // A LAN service can work without internet. navigator.onLine is not a gate.
    pending = true;
    blocked = false;
    error = '';
    warning = '';
    update();
    let success = false, retryAfter = 0;
    try {
      const result = await sync();
      failures = 0;
      retryNotBefore = 0;
      success = true;
      if (result?.saved === false) warning = 'Prices updated in memory, but browser storage is unavailable. Export your workspace before leaving.';
    } catch (reason) {
      failures++;
      blocked = reason.retryable === false;
      retryAfter = Number(reason.retryAfterMs) || 0;
      error = reason.name === 'TimeoutError' ? 'The request timed out. Saved prices were kept.' : reason.message || 'Unable to refresh quotes. Saved prices were kept.';
    } finally {
      pending = false;
      const retryDelay = Math.max(retryAfter, Math.min(120_000, (interval || 30_000) * 2 ** Math.min(failures, 4)));
      if (!success) retryNotBefore = Date.now() + retryDelay;
      schedule(success ? interval : retryDelay);
      update();
    }
    return success;
  }

  function pause() {
    interval = 0;
    savePreference();
    select.value = '0';
    clearTimeout(timer);
    nextAt = 0;
    update();
  }

  select.addEventListener('change', () => {
    const selected = Number(select.value);
    interval = waitOptions.includes(selected) ? selected : 0;
    savePreference();
    blocked = false;
    failures = 0;
    if (interval) void refresh();
    else pause();
  });
  document.addEventListener('visibilitychange', () => { schedule(); update(); });
  window.addEventListener('online', () => { schedule(); update(); });
  window.addEventListener('offline', update);
  window.addEventListener('pagehide', () => { clearTimeout(timer); nextAt = 0; });
  window.addEventListener('pageshow', () => { schedule(); update(); });
  // Updating ages is local; only refresh() makes a request via the supplied callback.
  setInterval(() => { if (!document.hidden) update(); }, 5_000);
  update();
  schedule();
  return { refresh, pause, update };
}
