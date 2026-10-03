import { readFileSync } from 'node:fs';
import { parseEnv, promisify } from 'node:util';
import { brotliCompress, gzip, constants as zlib } from 'node:zlib';
import { MARKET_CONTROL_SCOPE, buildMarketMatches, filterMarketQuotes, filterMarketRecords, validateMarketQuotes } from './admin-market-controls.mjs';

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
async function reply(req, res, status, value, headers = {}) {
  let body = Buffer.from(JSON.stringify(value));
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

function connection() {
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

async function fetchQuoteInventory(config, fetcher) {
  // The snapshot is ~30 MB of JSON (77k quotes); 10 s was too short to download and parse it.
  const response = await fetcher(new URL('/quotes', config.base), {
    headers: { Accept: 'application/json', 'X-API-Key': config.apiKey },
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Quote inventory unavailable (HTTP ${response.status}).`), { retryAfter: response.headers.get('retry-after') });
  }
  const payload = await response.json();
  if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) throw new Error('Complete quote inventory required.');
  return sanitizeInventory(Array.isArray(payload) ? payload : payload?.quotes);
}

// One malformed or duplicate record must not blank the feed for every viewer: drop it and keep
// the rest, and say how many were dropped. The dashboard also skips and counts records it can't use.
function sanitizeInventory(records) {
  if (!Array.isArray(records)) return { quotes: validateMarketQuotes(records), dropped: 0 };
  const seen = new Set(), kept = [];
  for (const record of records) {
    try { validateMarketQuotes([record]); } catch { continue; }
    const id = String(record.id);
    if (seen.has(id)) continue;
    seen.add(id); kept.push(record);
  }
  return { quotes: validateMarketQuotes(kept), dropped: records.length - kept.length };
}

// Every open dashboard polls every 3-10 s, and the upstream snapshot is several MB. Requests share
// the upstream fetch in flight and its result for 2 s after it settles (single flight; a slow
// upstream is never fetched twice at once). Only the provider data is shared: market controls are
// still read fresh for every response. Failures are never reused.
// When one refresh fails (a momentary upstream error), the last complete snapshot up to 60 s old is
// served instead, marked stale, so open dashboards don't flash "Refresh failed".
// While the upstream refills after a restart, each partial answer still says complete (9,564 →
// 20,670 → 48,332 → 51,307 quotes in ~70 s on 3 Oct 2026, PrizePicks and Fanatics missing). A
// snapshot under 60% of the last full one's size is held back for up to 10 minutes; the full one is
// served, marked stale and warmingUp.
const INVENTORY_TTL_MS = 2_000, LAST_GOOD_MS = 60_000, WARMUP_HOLD_MS = 10 * 60_000, WARMUP_RATIO = 0.6;
const inventoryCache = new WeakMap(), lastGood = new WeakMap();
function sharedInventory(config, fetcher) {
  const base = config.base.href, entry = inventoryCache.get(fetcher);
  if (entry && entry.base === base && (entry.settledAt === null || Date.now() - entry.settledAt < INVENTORY_TTL_MS)) return entry.promise;
  const record = { base, settledAt: null, promise: null };
  record.promise = fetchQuoteInventory(config, fetcher).then(({ quotes, dropped }) => {
    const at = Date.now(), good = lastGood.get(fetcher);
    if (good && good.base === base && at - good.at < WARMUP_HOLD_MS && quotes.length < good.quotes.length * WARMUP_RATIO) {
      console.error(`[ev-api] Quote inventory shrank from ${good.quotes.length} to ${quotes.length}; serving the last full snapshot while it refills.`);
      return { ...good, stale: true, warmingUp: true };
    }
    const snapshot = { base, at, quotes, dropped, stale: false, warmingUp: false };
    lastGood.set(fetcher, snapshot);
    return snapshot;
  }, error => {
    // The reason is for the operator's logs; visitors get the generic message.
    console.error('[ev-api] Quote inventory refresh failed:', error?.message || error);
    const good = lastGood.get(fetcher);
    if (good && good.base === base && Date.now() - good.at < LAST_GOOD_MS) return { ...good, stale: true };
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
    return (await fetchQuoteInventory(providerConfig || connection(), fetcher)).quotes;
  } catch {
    throw Object.assign(new Error('The normalized EV quote inventory is unavailable.'), { status: 503, code: 'MARKET_INVENTORY_UNAVAILABLE' });
  }
}

// GET /api/ev/quotes?live_only=true&sport=&book=&market= narrows the shared, controlled snapshot on
// the server (the upstream's /site/quotes parameters), so live tools can poll a few dozen records
// instead of 50k. Other parameters are ignored.
const text = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
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
    ...(filter ? { filter: filter.applied } : {}),
  }, { 'X-Snapshot-Age': String(age) });
}

// Only the site's routes are described; private upstream routes and its server list are left out.
function publicOpenApi(document) {
  const paths = document && typeof document.paths === 'object' ? document.paths : {};
  return { openapi: document?.openapi, info: document?.info, paths: Object.fromEntries(Object.entries(paths).filter(([path]) => SITE_ROUTES.has(path))), components: document?.components };
}

async function handleDataset(req, res, url, path, config, fetcher, loadControls) {
  const target = new URL(path, config.base);
  for (const name of SITE_ROUTES.get(path) || []) {
    const value = url.searchParams.get(name);
    if (value !== null) target.searchParams.set(name, value.slice(0, 200));
  }
  const response = await fetcher(target, { headers: { Accept: 'application/json', 'X-API-Key': config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const retry = retryHeader(response.headers.get('retry-after'));
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    console.error(`[ev-api] The quote API refused this server's API key (HTTP ${response.status}).`);
    return reply(req, res, 502, { error: 'The quote source refused this server\'s credentials.', retryable: false });
  }
  let payload;
  try { payload = JSON.parse(await response.text()); }
  catch { return reply(req, res, 502, { error: 'The quote source returned an unexpected response.', retryable: true }, retry); }
  // Upstream error bodies can describe its internals; visitors get the status and a plain message.
  if (!response.ok) return reply(req, res, response.status, { error: 'The quote source could not answer this request.', retryable: response.status === 429 || response.status >= 500 }, retry);
  if (path === '/openapi.json') return reply(req, res, 200, publicOpenApi(payload));
  if (CONTROLLED_ROUTES.has(path) && typeof loadControls === 'function') {
    let controls;
    try { controls = await loadControls(); }
    catch { return reply(req, res, 503, CONTROLS_DOWN); }
    if (controls.some(control => control.scope === MARKET_CONTROL_SCOPE && control.blocked)) {
      if (!Array.isArray(payload)) return reply(req, res, 502, { error: 'The quote source returned an unexpected response.', retryable: true });
      if (path === '/site/odds/history') {
        // History rows carry only a quote id: keep the ids the controlled snapshot still distributes.
        let snapshot;
        try { snapshot = await sharedInventory(config, fetcher); }
        catch (error) { return reply(req, res, 503, SOURCE_DOWN, retryHeader(error?.retryAfter)); }
        const ids = new Set(visibleQuotes(snapshot.quotes, controls).map(quote => String(quote.id)));
        payload = payload.filter(row => row && ids.has(String(row.id)));
      } else payload = filterMarketRecords(payload, controls);
    }
  }
  return reply(req, res, response.status, payload, retry);
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
