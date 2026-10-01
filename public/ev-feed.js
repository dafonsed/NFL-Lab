// Controls for the shared quote feed. Creating these controls only schedules the next refresh.
const waitOptions = [10_000, 15_000, 30_000, 60_000];
// Live tools always refresh every 3 seconds; the viewer's cadence applies everywhere else.
export const LIVE_REFRESH_MS = 3_000;
export const DEFAULT_REFRESH_MS = 10_000;
export const LIVE_TOOLS = new Set(['ev-live', 'arb-live']);
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
  if (['fantasy','optimizer','slip','fantasy-alerts'].includes(tool)) return 'DFS lines come from the quote feed (PrizePicks, Underdog, Sleeper and other pick\'em apps). Hit chances use no-vig sportsbook prop odds at the same line; payouts start from each app\'s published standard payouts.';
  if (tool === 'prediction') return 'Prediction feed needed: contracts, bids, asks and market depth. Positions and trades use your saved records.';
  if (tool === 'trends') return 'Results feed needed: historical player stats with matching game IDs. Quote sync does not update game results.';
  if (tool === 'sharp') return 'Uses quote sync. Exchange prices, available liquidity and matching sportsbook quotes are required.';
  if (tool === 'promo') return 'Uses quote sync for hedge prices. Enter your bonus amount and promotion terms separately.';
  if (tool === 'line-alerts') return 'Uses saved quote movements. Alerts run in this open browser after a sync or local edit.';
  return 'Uses shared sportsbook quotes. EV and comparison tools need complete matching outcomes across books.';
}

export function createQuoteFeedControls({ sync, getState, getTool, canRefresh = () => true, hasLive = () => true, storage }) {
  const panel = document.createElement('section');
  panel.className = 'ev-feed';
  panel.setAttribute('aria-label', 'Quote feed');
  panel.innerHTML = `<div class="ev-feed-row"><div class="ev-feed-summary"><strong>Quote feed</strong><span data-feed-status role="status" aria-live="polite"></span></div><label class="ev-feed-refresh">Auto-refresh<select aria-label="Quote auto-refresh interval"><option value="0">Off</option><option value="3000" hidden>Every 3 seconds (live)</option><option value="10000">Every 10 seconds</option><option value="15000">Every 15 seconds</option><option value="30000">Every 30 seconds</option><option value="60000">Every 60 seconds</option></select></label><a href="/docs#api-requirements">About the data</a></div><p class="ev-feed-meta" data-feed-meta></p><p class="ev-feed-detail" data-feed-detail></p><p class="ev-feed-coverage" data-feed-coverage></p>`;
  document.querySelector('.ev-header').after(panel);
  const button = document.querySelector('#ev-sync-api');
  const select = panel.querySelector('select');
  const status = panel.querySelector('[data-feed-status]');
  const meta = panel.querySelector('[data-feed-meta]');
  const detail = panel.querySelector('[data-feed-detail]');
  const toolCoverage = panel.querySelector('[data-feed-coverage]');
  let chosen = DEFAULT_REFRESH_MS, interval = 0, failures = 0, timer = null, pending = false, nextAt = 0, retryNotBefore = 0, error = '', blocked = false, warning = '', skipped = 0, expired = 0;
  // Persist the user's chosen cadence, not an in-flight request or failure state.
  const preferenceKey = 'sportslab-quote-refresh-ms';
  // Auto-refresh every 10 seconds unless the viewer has chosen a cadence (including Off).
  try { storage ??= window.localStorage; const raw = storage.getItem(preferenceKey), saved = Number(raw); if (raw !== null) chosen = waitOptions.includes(saved) ? saved : 0; } catch { /* Session controls still work without storage. */ }
  // The 3-second cadence only applies while the feed actually has in-play prices; polling a
  // multi-MB snapshot that fast for an empty live board only costs data and battery.
  const live = () => LIVE_TOOLS.has(getTool()) && hasLive();
  const effective = () => live() ? LIVE_REFRESH_MS : chosen;
  interval = effective();
  const savePreference = () => { try { storage.setItem(preferenceKey, String(chosen)); } catch { /* Do not block a local control. */ } };

  function update() {
    const state = getState();
    // Switching between pregame and live tools changes the cadence; restart the timer to match.
    if (effective() !== interval) { interval = effective(); if (interval) blocked = false; schedule(); }
    select.value = String(interval);
    select.disabled = live();
    select.title = live() ? 'Live prices always refresh every 3 seconds.' : '';
    const quotes = state.quotes.filter(quote => quote.source === 'local-api');
    const stale = quotes.filter(quote => quote.live && (!Number.isFinite(Date.parse(quote.ts)) || Date.now() - Date.parse(quote.ts) > 90_000 || Date.parse(quote.ts) > Date.now() + 5_000)).length;
    const newest = quotes.reduce((latest, quote) => Date.parse(quote.ts) > Date.parse(latest || '1970-01-01') ? quote.ts : latest, '');
    let label = pending ? 'Updating…' : error ? 'Refresh failed' : state.apiSyncedAt ? 'Up to date' : 'Not checked';
    if (!pending && error && navigator.onLine === false) label = 'Connection unavailable';
    else if (!pending && blocked && interval) label = 'Auto-refresh paused';
    else if (!pending && interval && document.hidden) label = 'Paused in background';
    else if (!pending && interval && !canRefresh()) label = 'Paused while editing';
    status.textContent = label;
    status.dataset.tone = error || stale ? 'warning' : pending ? 'busy' : 'neutral';
    button.disabled = pending;
    button.textContent = pending ? 'Updating…' : 'Refresh prices';
    const syncAt = state.apiSyncedAt ? `Updated ${elapsed(state.apiSyncedAt)}` : 'Not updated yet';
    meta.textContent = `${quotes.length.toLocaleString()} prices · ${syncAt}${newest ? ` · Newest price seen ${elapsed(newest)}` : ''}${stale ? ` · ${stale} expired live prices excluded` : ''}${skipped ? ` · ${skipped.toLocaleString()} unusable feed prices hidden` : ''}${expired ? ` · ${expired.toLocaleString()} expired prices ignored` : ''}`;
    meta.title = `Last update: ${clockTime(state.apiSyncedAt)}. Latest price observation: ${clockTime(newest)}.${skipped ? ` ${skipped} feed prices were hidden because their team or side could not be confirmed (for example a price filed under the wrong game, or both teams priced as underdogs at one book).` : ''}${expired ? ` ${expired} prices are still in the feed but haven't been refreshed in 15+ minutes, so the book no longer offers them.` : ''}`;
    const retry = interval && nextAt && !document.hidden && !blocked ? ` Next attempt in ${Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))}s.` : '';
    detail.textContent = error ? `${error}${blocked ? ' Press Refresh prices to try again.' : retry}` : warning || (interval ? 'Prices refresh automatically while this tab is visible. The last prices stay on screen if a refresh fails.' : 'Auto-refresh is off. Press Refresh prices to update.');
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
      skipped = Number(result?.skipped) || 0;
      expired = Number(result?.expired) || 0;
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
    chosen = 0;
    savePreference();
    interval = effective();
    clearTimeout(timer);
    nextAt = 0;
    if (interval) schedule();
    update();
  }

  select.addEventListener('change', () => {
    if (live()) return;
    const selected = Number(select.value);
    chosen = waitOptions.includes(selected) ? selected : 0;
    interval = chosen;
    savePreference();
    blocked = false;
    failures = 0;
    if (interval) void refresh();
    else pause();
  });
  // Returning to the tab after a while refreshes right away instead of showing old prices for a full interval.
  const resume = () => { const synced = Date.parse(getState().apiSyncedAt); if (interval && !document.hidden && !pending && !blocked && Number.isFinite(synced) && Date.now() - synced >= interval) void refresh({ automatic: true }); else schedule(); update(); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', update);
  window.addEventListener('pagehide', () => { clearTimeout(timer); nextAt = 0; });
  window.addEventListener('pageshow', resume);
  // Updating ages is local; only refresh() makes a request via the supplied callback.
  setInterval(() => { if (!document.hidden) update(); }, 5_000);
  update();
  schedule();
  return { refresh, pause, update };
}
