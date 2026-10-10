import { readFileSync } from 'node:fs';
import { parseEnv, promisify } from 'node:util';
import { brotliCompress, gzip, constants as zlib } from 'node:zlib';
import { MARKET_CONTROL_SCOPE, MAX_MARKET_QUOTES, buildMarketMatches, filterMarketQuotes, filterMarketRecords, validateMarketQuotes } from './admin-market-controls.mjs';
import { OddsError } from '../public/odds-contract.js';
import { sportWizzardConfig, sportWizzardSnapshot, mergeSnapshots } from './odds/sportwizzard.mjs';
import { TableBuilder, tableSnapshot, restamp } from './odds/record-table.mjs';
import { readJsonRecords } from './json-records.mjs';

// Credentials stay on the VisualOdds server; browsers only use same-origin /api/ev routes.
const configFile = new URL('../.env.local', import.meta.url);

// The quote API's read-only routes for the site, with the query parameters each accepts (its
// OpenAPI document fixes both). Writes, scans, collector controls and the review queue stay private.
const SITE_ROUTES = new Map([
  ['/site/health', []],
  ['/site/status', []],
  ['/site/dfs/props', ['sport', 'app']],
  ['/site/dfs/payouts', []],
  ['/site/odds/history', ['id', 'hours']],
  ['/site/prediction/contracts', ['platform']],
  ['/site/smartstake/datasets', []],
  ['/site/smartstake/datasets/positive-ev', []],
  ['/site/smartstake/datasets/matched-bets', []],
  ['/site/smartstake/datasets/smart-money', []],
  ['/site/smartstake/datasets/smart-money-depth', []],
  ['/site/smartstake/datasets/fantasy', []],
  ['/site/smartstake/datasets/fantasy-main-lines', []],
  ['/site/smartstake/datasets/insiders', []],
  ['/site/smartstake/datasets/insiders-orderbook', []],
  ['/site/smartstake/datasets/insiders-market-breakdown', []],
  ['/site/smartstake/datasets/insiders-market-positions', []],
  ['/site/smartstake/datasets/lineup-dropper', []],
  ['/site/smartstake/datasets/market-counts', []],
  ['/site/smartstake/datasets/all-bookmakers', []],
  ['/site/smartstake/datasets/locations', []],
  ['/site/smartstake/datasets/leagues', []],
  ['/site/smartstake/datasets/sports', []],
  ['/site/smartstake/datasets/markets', []],
]);
// Record datasets carry a book, app or platform (or, for history, a quote id) and get the same
// distribution controls as /quotes.
const CONTROLLED_ROUTES = new Set(['/site/dfs/props', '/site/dfs/payouts', '/site/odds/history', '/site/prediction/contracts']);
const ALIASES = new Map([
  ['/api/ev/health', '/site/health'],
  ['/api/ev/status', '/site/status'],
  ['/api/ev/props', '/site/dfs/props'],
  ['/api/ev/contracts', '/site/prediction/contracts'],
  ['/api/ev/openapi', '/openapi.json'],
  ['/api/ev/smartstake/datasets', '/site/smartstake/datasets'],
  ['/api/ev/smartstake/positive-ev', '/site/smartstake/datasets/positive-ev'],
  ['/api/ev/smartstake/matched-bets', '/site/smartstake/datasets/matched-bets'],
  ['/api/ev/smartstake/smart-money', '/site/smartstake/datasets/smart-money'],
  ['/api/ev/smartstake/smart-money/depth', '/site/smartstake/datasets/smart-money-depth'],
  ['/api/ev/smartstake/fantasy/main-lines', '/site/smartstake/datasets/fantasy-main-lines'],
  ['/api/ev/smartstake/insiders', '/site/smartstake/datasets/insiders'],
  ['/api/ev/smartstake/insiders/orderbook', '/site/smartstake/datasets/insiders-orderbook'],
  ['/api/ev/smartstake/insiders/market-breakdown', '/site/smartstake/datasets/insiders-market-breakdown'],
  ['/api/ev/smartstake/insiders/market-positions', '/site/smartstake/datasets/insiders-market-positions'],
  ['/api/ev/smartstake/lineup-dropper', '/site/smartstake/datasets/lineup-dropper'],
  ['/api/ev/smartstake/market-counts', '/site/smartstake/datasets/market-counts'],
  ['/api/ev/smartstake/reference/bookmakers', '/site/smartstake/datasets/all-bookmakers'],
  ['/api/ev/smartstake/reference/locations', '/site/smartstake/datasets/locations'],
  ['/api/ev/smartstake/reference/leagues', '/site/smartstake/datasets/leagues'],
  ['/api/ev/smartstake/reference/sports', '/site/smartstake/datasets/sports'],
  ['/api/ev/smartstake/reference/markets', '/site/smartstake/datasets/markets'],
]);

const compressors = { br: promisify(brotliCompress), gzip: promisify(gzip) };
function encodingFor(header = '') {
  const accepted = new Map(String(header).toLowerCase().split(',').map(part => {
    const [name, ...params] = part.trim().split(';'), quality = params.find(item => item.trim().startsWith('q='));
    return [name.trim(), quality === undefined ? 1 : Number(quality.trim().slice(2))];
  }));
  return ['br', 'gzip'].find(name => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0) || '';
}

// Vercel's edge compresses function responses itself; the Node server (npm start) sent the 23 MB
// quote snapshot uncompressed on every poll. Brotli at quality 4 takes ~60 ms for it (~2 MB out).
const reply = (req, res, status, value, headers = {}) => sendJsonText(req, res, status, JSON.stringify(value), headers);
/** Sends JSON text (no-store), compressed for clients that accept it when the platform doesn't compress. */
export async function sendJsonText(req, res, status, text, headers = {}) {
  let body = Buffer.from(text);
  const out = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  const encoding = !process.env.VERCEL && body.length >= 1024 ? encodingFor(req?.headers?.['accept-encoding']) : '';
  if (encoding) {
    out.Vary = 'Accept-Encoding';
    try {
      body = await compressors[encoding](body, encoding === 'br' ? { params: { [zlib.BROTLI_PARAM_QUALITY]: 4, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } } : { level: 6 });
      out['Content-Encoding'] = encoding;
    } catch { /* Send it uncompressed. */ }
  }
  if (res.destroyed) return;
  res.writeHead(status, { ...out, 'Content-Length': body.length });
  res.end(body);
}

/**
 * Validates the quote API address. Local and private-network servers may use HTTP or HTTPS.
 * A public IP or domain must use HTTPS, because every request carries the API key; plain HTTP
 * to a public host needs an explicit EV_TOOL_API_ALLOW_HTTP=1. Link-local and metadata
 * addresses are never allowed.
 */
export function parseEvApiConfig({ address, apiKey, allowHttp = '' } = {}) {
  if (!address || !apiKey?.trim()) throw new Error('Set EV_TOOL_API_URL and EV_TOOL_API_KEY in the server environment or .env.local.');
  let base;
  try { base = new URL(address); }
  catch { throw new Error('EV_TOOL_API_URL must be an HTTP or HTTPS origin, such as https://api.example.com or http://192.168.1.20:8000.'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('EV_TOOL_API_URL must be an HTTP or HTTPS origin without a path or credentials.');
  }
  const host = base.hostname.toLowerCase();
  const octets = host.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(n => n >= 0 && n <= 255);
  if ((ipv4 && (octets[0] === 169 && octets[1] === 254 || octets[0] === 0)) || host === 'metadata.google.internal') {
    throw new Error('EV_TOOL_API_URL cannot point at a link-local or metadata address.');
  }
  const privateHost = ['localhost', '[::1]'].includes(host) || (ipv4 && (
    octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  ));
  if (!privateHost && base.protocol === 'http:' && allowHttp !== '1') {
    throw new Error('A public EV_TOOL_API_URL must use HTTPS so the API key is encrypted. Set EV_TOOL_API_ALLOW_HTTP=1 to accept plain HTTP.');
  }
  return { base, apiKey: apiKey.trim(), privateHost };
}

/** The quote API connection from the server environment (or .env.local); throws when it isn't set. */
export function connection() {
  let local = {};
  try {
    local = parseEnv(readFileSync(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to read the EV API configuration in .env.local.');
  }
  return parseEvApiConfig({
    address: process.env.EV_TOOL_API_URL ?? local.EV_TOOL_API_URL,
    apiKey: process.env.EV_TOOL_API_KEY ?? local.EV_TOOL_API_KEY,
    allowHttp: process.env.EV_TOOL_API_ALLOW_HTTP ?? local.EV_TOOL_API_ALLOW_HTTP,
  });
}

// The quote API answers from more than one instance, and one may be restarting: on 4 Oct 2026, 3 of 5
// /quotes requests failed outright while the next answered. A request that fails without an answer,
// or with a 502/503/504 that doesn't ask for a wait (Retry-After), is tried once more after 300 ms. A
// timeout isn't retried: that request already waited its full time.
const RETRY_STATUSES = new Set([502, 503, 504]);
async function askUpstream(fetcher, url, init) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(url, init());
      if (attempt || !RETRY_STATUSES.has(response.status) || response.headers.get('retry-after')) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt || error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

async function fetchQuoteInventory(config, fetcher) {
  // The snapshot is ~30 MB of JSON (77k quotes); 10 s was too short to download and parse it.
  const response = await askUpstream(fetcher, new URL('/quotes', config.base), () => ({
    headers: { Accept: 'application/json', 'X-API-Key': config.apiKey },
    redirect: 'error', signal: AbortSignal.timeout(60_000),
  }));
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Quote inventory unavailable (HTTP ${response.status}).`), { retryAfter: response.headers.get('retry-after') });
  }
  const inventory = await readInventory(response);
  if (inventory.root?.complete === false || inventory.root?.partial === true || inventory.root?.next_cursor) throw new Error('Complete quote inventory required.');
  return inventory;
}

// One malformed or duplicate record must not blank the feed for every viewer: drop it and keep
// the rest, and say how many were dropped, why and from which book (`droppedReasons`), so the
// provider can see what it sent that can't be distributed. A record needs an id, a book, a sport and
// an event: the market controls are keyed on them. The dashboard also skips and counts records it
// can't use.
const filled = (value, maximum) => typeof value === 'string' && value.trim() !== '' && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const missingBook = (value, maximum) => !filled(value, maximum) || value.trim().toLowerCase() === 'none';
function dropReason(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'not a record';
  const id = typeof record.id === 'number' && Number.isSafeInteger(record.id) ? String(record.id) : record.id;
  return !filled(id, 180) ? 'no id' : missingBook(record.book, 120) ? 'no book' : !filled(record.sport, 40) ? 'no sport' : !filled(record.event, 240) ? 'no event' : 'invalid';
}
// The inventory as it downloads (lib/json-records.mjs): each record is checked (a record without an id,
// book, sport or event, or a repeated id, is dropped and counted by reason and book) and packed straight
// into the snapshot's compact table. Returns { table, dropped, droppedReasons, root }.
async function readInventory(response) {
  const builder = new TableBuilder(), seen = new Set(), reasons = {};
  let total = 0;
  const { root, found } = await readJsonRecords(response.body, record => {
    total += 1;
    try { validateMarketQuotes([record]); } catch { dropFrom(reasons, dropReason(record), record); return; }
    const id = String(record.id);
    if (seen.has(id)) { dropFrom(reasons, 'duplicate id', record); return; }
    seen.add(id); builder.add(record);
  });
  if (!found) validateMarketQuotes(root?.quotes);
  if (builder.length > MAX_MARKET_QUOTES) throw Object.assign(new Error('The quote provider returned an unsupported inventory.'), { status: 502, code: 'MARKET_INVENTORY_INVALID' });
  return { table: builder.build(), dropped: total - builder.length, droppedReasons: reasons, root: Array.isArray(root) ? null : root };
}
const dropFrom = (reasons, reason, record) => {
  const book = record && typeof record === 'object' && filled(record.book, 120) ? record.book.trim() : 'unknown';
  (reasons[reason] ??= {})[book] = (reasons[reason][book] || 0) + 1;
};

// Every open dashboard polls every 3-10 s, and the upstream snapshot is several MB. Requests share
// the upstream fetch in flight and its result for 2 s after it settles (single flight; a slow
// upstream is never fetched twice at once). Only the provider data is shared: market controls are
// still read fresh for every response. Failures are never reused.
// When one refresh fails (a momentary upstream error), the last complete snapshot up to LAST_GOOD_MS old
// is served instead, marked stale, so open dashboards don't flash "Refresh failed".
// While the upstream refills after a restart, each partial answer still says complete (9,564 →
// 20,670 → 48,332 → 51,307 quotes in ~70 s on 3 Oct 2026, PrizePicks and Fanatics missing). A
// snapshot under 60% of the last full one's size is held back for up to 10 minutes; the full one is
// served, marked stale and warmingUp.
// The upstream inventory is ~30 MB and can take 20+ seconds to download from the VPS.
// A short TTL created a thundering herd: every 2 s a new fetch started while the previous
// was still in flight, overloading the VPS and causing cascading 503s. 60 s is the same
// cadence as the DFS props feed and is faster than the odds themselves move.
// Past the TTL the last good snapshot (up to HOLD_MS old) answers at once while the refresh runs, marked
// stale only after MARK_STALE_MS. The relay takes 10-66 s and fails about every other time (9 Oct 2026);
// without the hold each slow or failed refresh dropped the main feed's 100,000 Pinnacle prices from the
// board (and every fair price built on them) until the next one answered, so lines came and went.
const INVENTORY_TTL_MS = 60_000, LAST_GOOD_MS = 10 * 60_000, MARK_STALE_MS = 3 * 60_000, WARMUP_HOLD_MS = 10 * 60_000, WARMUP_RATIO = 0.6;
const inventoryCache = new WeakMap(), lastGood = new WeakMap(), staleCopies = new WeakMap();
// One stale copy per snapshot, so the merge and normalize caches (kept per object) still hit.
function markedStale(good) {
  if (!staleCopies.has(good)) staleCopies.set(good, restamp(good, { stale: true }));
  return staleCopies.get(good);
}
function held(good, base) {
  if (!good || good.base !== base) return null;
  const age = Date.now() - good.at;
  return age >= LAST_GOOD_MS ? null : age < MARK_STALE_MS ? good : markedStale(good);
}
function sharedInventory(config, fetcher) {
  const base = config.base.href, entry = inventoryCache.get(fetcher);
  if (entry && entry.base === base && entry.settledAt !== null && Date.now() - entry.settledAt < INVENTORY_TTL_MS) return entry.promise;
  const refresh = entry && entry.base === base && entry.settledAt === null ? entry.promise : refreshInventory(config, fetcher, base);
  const good = held(lastGood.get(fetcher), base);
  return good ? Promise.resolve(good) : refresh;
}
function refreshInventory(config, fetcher, base) {
  const record = { base, settledAt: null, promise: null };
  record.promise = fetchQuoteInventory(config, fetcher).then(({ table, dropped, droppedReasons }) => {
    const at = Date.now(), good = lastGood.get(fetcher);
    if (good && good.base === base && at - good.at < WARMUP_HOLD_MS && table.length < good.count * WARMUP_RATIO) {
      console.error(`[ev-api] Quote inventory shrank from ${good.count} to ${table.length}; serving the last full snapshot while it refills.`);
      return restamp(good, { stale: true, warmingUp: true });
    }
    // Kept compactly between refreshes (lib/odds/record-table.mjs).
    const snapshot = tableSnapshot({ base, at, dropped, droppedReasons, stale: false, warmingUp: false }, table);
    lastGood.set(fetcher, snapshot);
    return snapshot;
  }, error => {
    // The reason is for the operator's logs; visitors get the generic message.
    console.error('[ev-api] Quote inventory refresh failed:', error?.message || error);
    const good = held(lastGood.get(fetcher), base);
    if (good) return markedStale(lastGood.get(fetcher));
    throw error;
  });
  record.promise.then(() => { record.settledAt = Date.now(); }, () => { if (inventoryCache.get(fetcher) === record) inventoryCache.delete(fetcher); });
  inventoryCache.set(fetcher, record);
  return record.promise;
}

// Filtering re-validates and hashes every quote, so the result is kept per snapshot and control set.
const visibleCache = new WeakMap();
function visibleQuotes(quotes, controls) {
  const blocked = controls.filter(control => control.scope === MARKET_CONTROL_SCOPE && control.blocked).map(control => `${control.kind}:${control.key}`).sort().join('|');
  if (!blocked) return quotes;
  const cached = visibleCache.get(quotes);
  if (cached?.blocked === blocked) return cached.visible;
  const visible = filterMarketQuotes(quotes, controls);
  visibleCache.set(quotes, { blocked, visible });
  return visible;
}

/** Staff inventory loader; never return provider addresses, credentials, or errors. */
export async function readEvQuotes({ fetcher = fetch, providerConfig } = {}) {
  try {
    return (await fetchQuoteInventory(providerConfig || connection(), fetcher)).table.rows();
  } catch {
    throw Object.assign(new Error('The normalized EV quote inventory is unavailable.'), { status: 503, code: 'MARKET_INVENTORY_UNAVAILABLE' });
  }
}

/**
 * The shared quote snapshot with the market distribution controls applied, for the odds service
 * (lib/odds/providers.mjs): { snapshot, records, controlled, controlsKey }. `records` is the same array
 * object while the snapshot and controls are unchanged. Throws OddsError NOT_CONFIGURED, UNAVAILABLE or
 * CONTROLS_UNAVAILABLE; never an unfiltered snapshot when controls can't be read.
 */
// The quote snapshot from every configured source: the main feed and SportWizzard (lib/odds/sportwizzard.mjs,
// on unless SPORTWIZZARD_ENABLED=0). Either one alone is enough; when both
// answer, the main feed stays primary. A caller that passes its own providerConfig (tests) gets only it.
const MAIN_FIRST_WAIT_MS = 15_000, mainHealth = new WeakMap();
async function sourcedInventory({ fetcher, providerConfig, sportWizzard, sport = '' }) {
  let config = null;
  try { config = providerConfig || connection(); }
  catch (error) {
    if (!sportWizzard) { console.error('[ev-api] Quote feed configuration:', error.message); throw new OddsError('NOT_CONFIGURED'); }
  }
  const unavailable = error => new OddsError('UNAVAILABLE', undefined, { retryAfterSeconds: /^\d+$/.test(String(error?.retryAfter || '')) ? Number(error.retryAfter) : undefined });
  let mainFeed = config ? (sport ? sharedSportInventory(config, fetcher, sport) : sharedInventory(config, fetcher)) : null;
  if (mainFeed) {
    const health = mainHealth.get(fetcher) || {}, start = Date.now();
    mainFeed.then(() => mainHealth.set(fetcher, { ...health, okAt: Date.now() }), () => mainHealth.set(fetcher, { ...health, failedAt: Date.now() }));
    // With SportWizzard to serve, a main feed whose last fetch failed isn't waited on (its retry keeps
    // running in the background and is used once it answers; a held snapshot still answers at once), and
    // any other main fetch gets MAIN_FIRST_WAIT_MS: a cached board answers at once, and a relay that
    // stalls (40-66 s on 9 Oct 2026) no longer holds the page while SportWizzard is ready.
    if (sportWizzard) {
      const lastFailed = health.failedAt && (!health.okAt || health.failedAt > health.okAt);
      mainFeed.catch(() => {});
      mainFeed = Promise.race([mainFeed, new Promise((_, reject) => setTimeout(() => {
        // Too slow to wait for: treated as down until it answers (its fetch keeps running and is cached).
        const now = mainHealth.get(fetcher) || {};
        if (!now.okAt || now.okAt < start) mainHealth.set(fetcher, { ...now, failedAt: Date.now() });
        reject(new Error(lastFailed ? 'Main feed recently unavailable.' : 'Main feed slow to answer.'));
      }, lastFailed ? 0 : MAIN_FIRST_WAIT_MS).unref?.())]);
    }
  }
  const [main, added] = await Promise.allSettled([
    mainFeed,
    sportWizzard ? sportWizzardSnapshot(sportWizzard, fetcher, { sport }) : null,
  ]);
  const mainSnapshot = config && main.status === 'fulfilled' ? main.value : null, extraSnapshot = sportWizzard && added.status === 'fulfilled' ? added.value : null;
  if (!mainSnapshot && !extraSnapshot) throw unavailable(config ? main.reason : added.reason);
  if (config && !mainSnapshot) console.error('[ev-api] Main quote feed unavailable; serving SportWizzard alone.');
  if (sportWizzard && !extraSnapshot) console.error('[ev-api] SportWizzard unavailable; serving the main feed alone.');
  return mergeSnapshots(mainSnapshot, extraSnapshot);
}

export async function readControlledInventory({ loadControls, fetcher = fetch, providerConfig, sportWizzard = providerConfig ? null : sportWizzardConfig() } = {}) {
  const snapshot = await sourcedInventory({ fetcher, providerConfig, sportWizzard });
  let controls = [];
  const controlled = typeof loadControls === 'function';
  if (controlled) {
    try { controls = await loadControls(); }
    catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
  }
  return controlledInventory(snapshot, controls, controlled);
}

// The lines visitors may see are read only when something prices them (`records`); a snapshot already
// priced for this control set (controlsKey) never rebuilds them.
function controlledInventory(snapshot, controls, controlled) {
  let blocked;
  try { blocked = controls.filter(control => control.scope === MARKET_CONTROL_SCOPE && control.blocked).map(control => `${control.kind}:${control.key}`).sort().join('|'); }
  catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
  return Object.defineProperty({ snapshot, controlled, controlsKey: blocked }, 'records', { enumerable: true, get() {
    try { return visibleQuotes(snapshot.quotes, controls); } catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
  } });
}
// Sport-filtered inventory: fetches only one sport from the upstream (?sport=X&compact=true), which
// cuts an 88 MB download to 5-15 MB so the DFS endpoint never times out on a cold start.
const sportInventoryCache = new WeakMap();

async function fetchSportQuoteInventory(config, fetcher, sport) {
  const url = new URL(`/quotes?sport=${encodeURIComponent(sport.toLowerCase())}&compact=true`, config.base);
  const response = await askUpstream(fetcher, url, () => ({
    headers: { Accept: 'application/json', 'X-API-Key': config.apiKey },
    redirect: 'error', signal: AbortSignal.timeout(60_000),
  }));
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Quote inventory unavailable (HTTP ${response.status}).`), { retryAfter: response.headers.get('retry-after') });
  }
  return readInventory(response);
}

function sharedSportInventory(config, fetcher, sport) {
  const base = config.base.href;
  let perFetcher = sportInventoryCache.get(fetcher);
  if (!perFetcher) { perFetcher = new Map(); sportInventoryCache.set(fetcher, perFetcher); }
  const cacheKey = `${base}|${sport}`;
  const entry = perFetcher.get(cacheKey);
  if (entry?.settledAt != null && Date.now() - entry.settledAt < INVENTORY_TTL_MS) return entry.promise;
  // Like the full inventory, the last good one (entry.good) answers while the next is fetched.
  const good = held(entry?.good, base);
  if (entry?.settledAt === null) return good ? Promise.resolve(good) : entry.promise;
  const record = { settledAt: null, promise: null, good: entry?.good || null };
  record.promise = fetchSportQuoteInventory(config, fetcher, sport).then(({ table, dropped, droppedReasons }) => {
    record.settledAt = Date.now();
    record.good = tableSnapshot({ base, at: Date.now(), dropped, droppedReasons, stale: false, warmingUp: false }, table);
    return record.good;
  });
  record.promise.catch(() => { if (perFetcher.get(cacheKey) === record) { if (record.good) perFetcher.set(cacheKey, { settledAt: 0, promise: null, good: record.good }); else perFetcher.delete(cacheKey); } });
  perFetcher.set(cacheKey, record);
  return good ? Promise.resolve(good) : record.promise;
}

/** Like readControlledInventory but fetches only the named sport, with market controls applied. */
export async function readControlledSportInventory({ loadControls, fetcher = fetch, providerConfig, sport, sportWizzard = providerConfig ? null : sportWizzardConfig() } = {}) {
  if (!sport) return readControlledInventory({ loadControls, fetcher, providerConfig, sportWizzard });
  const snapshot = await sourcedInventory({ fetcher, providerConfig, sportWizzard, sport });
  let controls = [];
  if (typeof loadControls === 'function') {
    try { controls = await loadControls(); }
    catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
  }
  return controlledInventory(snapshot, controls, true);
}

/**
 * One of the quote API's read-only site datasets (/site/dfs/props, /site/dfs/payouts, /site/odds/history,
 * /site/prediction/contracts) with controls applied, for the odds service. Throws OddsError.
 */
export async function readSiteDataset(path, params = {}, { loadControls, fetcher = fetch, providerConfig } = {}) {
  if (!SITE_ROUTES.has(path)) throw new OddsError('NOT_FOUND');
  let config;
  try { config = providerConfig || connection(); }
  catch (error) { console.error('[ev-api] Quote feed configuration:', error.message); throw new OddsError('NOT_CONFIGURED'); }
  let result;
  try { result = await fetchDataset(new URLSearchParams(params), path, config, fetcher, loadControls); }
  catch (error) {
    console.error('[ev-api] Quote API request failed:', error?.message || error);
    throw new OddsError(error?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNAVAILABLE');
  }
  if (result.error) throw result.error;
  return result.payload;
}

// GET /api/ev/quotes?live_only=true&sport=&book=&market= narrows the shared, controlled snapshot on
// the server (the upstream's /site/quotes parameters), so live tools can poll a few dozen records
// instead of 50k. Other parameters are ignored.
const text = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
// SmartStake records name sports inconsistently: "fantasy" uses sport names ("Football", "Hockey")
// alongside a league code ("nfl", "nhl"); "fantasy-main-lines" uses sport codes; "positive-ev" always
// says "other" and identifies by market prefix. relayRecordSport resolves any record to one code.
const SPORT_NAME_TO_CODE = { football: 'nfl', basketball: 'nba', hockey: 'nhl', baseball: 'mlb', soccer: 'soccer', tennis: 'tennis' };
const KNOWN_SPORT_CODES = new Set(['nfl', 'nba', 'wnba', 'nhl', 'mlb', 'soccer', 'ncaaf', 'ncaab', 'cfl', 'wta', 'atp', 'tennis']);
function relayRecordSport(record) {
  const league = text(record?.league);
  if (league && KNOWN_SPORT_CODES.has(league)) return league;
  const sport = text(record?.sport);
  if (sport && sport !== 'other' && KNOWN_SPORT_CODES.has(sport)) return sport;
  if (sport && sport !== 'other' && SPORT_NAME_TO_CODE[sport]) return SPORT_NAME_TO_CODE[sport];
  const market = text(record?.market);
  if (market.startsWith('football')) return 'nfl';
  if (market.startsWith('basketball')) return 'nba';
  if (market.startsWith('hockey')) return 'nhl';
  if (market.startsWith('baseball')) return 'mlb';
  if (market.startsWith('soccer')) return 'soccer';
  return '';
}
function relayDataset(payload, path, params) {
  if (!path.startsWith('/site/smartstake/datasets/') || !payload || typeof payload !== 'object' || !Array.isArray(payload.records)) return payload;
  const limit = Number(params.get('limit'));
  const sport = text(params.get('sport'));
  let records = payload.records;
  if (sport) records = records.filter(record => relayRecordSport(record) === sport);
  if (Number.isInteger(limit) && limit >= 1 && limit <= 5000) records = records.slice(0, limit);
  return records === payload.records ? payload : { ...payload, records };
}
function quoteFilter(params) {
  const applied = {}, tests = [];
  if (['true', '1', 'yes'].includes(text(params.get('live_only')))) { applied.live_only = true; tests.push(quote => quote.live === true); }
  for (const name of ['sport', 'book', 'market']) {
    const wanted = text(params.get(name)).slice(0, 120);
    if (wanted) { applied[name] = wanted; tests.push(quote => text(quote[name]) === wanted); }
  }
  return tests.length ? { applied, test: quote => tests.every(check => check(quote)) } : null;
}

const SOURCE_DOWN = { error: 'The quote source is unavailable right now. Prices refresh automatically when it recovers.', code: 'QUOTE_SOURCE_UNAVAILABLE', retryable: true };
const CONTROLS_DOWN = { error: 'Market distribution controls could not be read, so no prices were served. Try again shortly.', code: 'MARKET_DISTRIBUTION_UNAVAILABLE', retryable: true };
const NOT_CONFIGURED = { error: 'The quote feed is not configured on the server yet.', retryable: false };
const retryHeader = value => value ? { 'Retry-After': String(value) } : {};

async function handleInventory(req, res, url, config, fetcher, loadControls) {
  const matches = url.pathname === '/api/ev/matches';
  let snapshot, controls = [];
  try { snapshot = await sharedInventory(config, fetcher); }
  catch (error) { return reply(req, res, 503, SOURCE_DOWN, retryHeader(error?.retryAfter)); }
  // Rules are read after the upstream request, directly before serving: no cached response may
  // bypass a newly committed source/event control. Without account services there are no controls.
  const controlled = typeof loadControls === 'function';
  if (controlled) {
    try { controls = await loadControls(); }
    catch { return reply(req, res, 503, CONTROLS_DOWN); }
  }
  let records, filter = null;
  try {
    const visible = visibleQuotes(snapshot.quotes, controls);
    filter = matches ? null : quoteFilter(url.searchParams);
    records = matches ? buildMarketMatches(visible) : filter ? visible.filter(filter.test) : visible;
  } catch { return reply(req, res, 503, CONTROLS_DOWN); }
  const age = Math.max(0, Math.round((Date.now() - snapshot.at) / 1000));
  return reply(req, res, 200, {
    [matches ? 'matches' : 'quotes']: records, count: records.length,
    complete: true, controlsApplied: controlled, controlScope: MARKET_CONTROL_SCOPE,
    snapshotAt: new Date(snapshot.at).toISOString(), stale: snapshot.stale, warmingUp: snapshot.warmingUp, dropped: snapshot.dropped,
    droppedReasons: snapshot.droppedReasons || {},
    ...(filter ? { filter: filter.applied } : {}),
  }, { 'X-Snapshot-Age': String(age) });
}

// Only the site's routes are described; private upstream routes and its server list are left out.
function publicOpenApi(document) {
  const paths = document && typeof document.paths === 'object' ? document.paths : {};
  return { openapi: document?.openapi, info: document?.info, paths: Object.fromEntries(Object.entries(paths).filter(([path]) => SITE_ROUTES.has(path))), components: document?.components };
}

// One site dataset request: { status, payload, retry }, or { status, body, retry, error } when it failed (the
// body /api/ev/* answers with, and an OddsError for the odds service).
async function fetchDataset(params, path, config, fetcher, loadControls) {
  const target = new URL(path, config.base);
  for (const name of SITE_ROUTES.get(path) || []) {
    const value = params.get(name);
    if (value !== null) target.searchParams.set(name, value.slice(0, 200));
  }
  const response = await askUpstream(fetcher, target, () => ({ headers: { Accept: 'application/json', 'X-API-Key': config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(45_000) }));
  const retryAfter = response.headers.get('retry-after'), retry = retryHeader(retryAfter);
  const failed = (status, code, body) => ({ status, retry, body, error: new OddsError(code, undefined, { retryAfterSeconds: /^\d+$/.test(retryAfter || '') ? Number(retryAfter) : undefined }) });
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    console.error(`[ev-api] The quote API refused this server's API key (HTTP ${response.status}).`);
    return failed(502, 'UNAUTHORIZED', { error: "The quote source refused this server's credentials.", retryable: false });
  }
  // Upstream error bodies can describe its internals (and aren't always JSON); visitors get the status
  // and a plain message.
  if (!response.ok) {
    await response.body?.cancel();
    return failed(response.status, response.status === 429 ? 'RATE_LIMITED' : response.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE', { error: 'The quote source could not answer this request.', retryable: response.status === 429 || response.status >= 500 });
  }
  let payload;
  try { payload = JSON.parse(await response.text()); }
  catch { return failed(502, 'MALFORMED', { error: 'The quote source returned an unexpected response.', retryable: true }); }
  if (path === '/openapi.json') return { status: 200, payload: publicOpenApi(payload), retry: {} };
  if (CONTROLLED_ROUTES.has(path) && typeof loadControls === 'function') {
    let controls;
    try { controls = await loadControls(); }
    catch { return { status: 503, retry: {}, body: CONTROLS_DOWN, error: new OddsError('CONTROLS_UNAVAILABLE') }; }
    if (controls.some(control => control.scope === MARKET_CONTROL_SCOPE && control.blocked)) {
      if (!Array.isArray(payload)) return failed(502, 'MALFORMED', { error: 'The quote source returned an unexpected response.', retryable: true });
      if (path === '/site/odds/history') {
        // History rows carry only a quote id: keep the ids the controlled snapshot still distributes.
        let snapshot;
        try { snapshot = await sharedInventory(config, fetcher); }
        catch (error) { return { status: 503, retry: retryHeader(error?.retryAfter), body: SOURCE_DOWN, error: new OddsError('UNAVAILABLE') }; }
        const ids = new Set(visibleQuotes(snapshot.quotes, controls).map(quote => String(quote.id)));
        payload = payload.filter(row => row && ids.has(String(row.id)));
      } else payload = filterMarketRecords(payload, controls);
    }
  }
  return { status: response.status, payload, retry };
}
async function handleDataset(req, res, url, path, config, fetcher, loadControls) {
  const result = await fetchDataset(url.searchParams, path, config, fetcher, loadControls);
  const headers = { ...result.retry };
  if (!result.error && path.startsWith('/site/smartstake/datasets')) Object.assign(headers, { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400' });
  return result.error ? reply(req, res, result.status, result.body, headers) : reply(req, res, result.status, relayDataset(result.payload, path, url.searchParams), headers);
}

export async function handleEvApi(req, res, url, { loadControls, fetcher = fetch, providerConfig } = {}) {
  // Read-only: every upstream request carries the site's API key, so a public write route would let
  // any visitor upsert quotes, delete matches or trigger collector refreshes. No site feature writes.
  if (req.method !== 'GET') return reply(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  const inventory = ['/api/ev/quotes', '/api/ev/matches'].includes(url.pathname);
  const sitePath = url.pathname.startsWith('/api/ev/site/') ? url.pathname.slice('/api/ev'.length) : null;
  const path = ALIASES.get(url.pathname) || (SITE_ROUTES.has(sitePath) ? sitePath : null);
  if (!inventory && !path) return reply(req, res, 404, { error: 'Unknown EV API route.' });
  let config;
  try { config = providerConfig || connection(); }
  catch (error) {
    // The detail names server settings; log it for the operator, show visitors a plain message.
    console.error('[ev-api] Quote feed configuration:', error.message);
    return reply(req, res, 500, NOT_CONFIGURED);
  }
  if (inventory) return handleInventory(req, res, url, config, fetcher, loadControls);
  try { return await handleDataset(req, res, url, path, config, fetcher, loadControls); }
  catch (error) {
    console.error('[ev-api] Quote API request failed:', error?.message || error);
    return reply(req, res, 503, SOURCE_DOWN);
  }
}
