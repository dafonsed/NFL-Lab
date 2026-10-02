import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { MARKET_CONTROL_SCOPE, buildMarketMatches, filterMarketQuotes, validateMarketQuotes } from './admin-market-controls.mjs';

// Credentials stay on the VisualOdds server; browsers only use same-origin /api/ev routes.
const configFile = new URL('../.env.local', import.meta.url);
const paths = new Map([
  ['GET /api/ev/health', '/'],
  ['GET /api/ev/status', '/status'],
  ['GET /api/ev/quotes', '/quotes'],
  ['POST /api/ev/quotes', '/quotes'],
  ['GET /api/ev/matches', '/matches'],
  ['POST /api/ev/scrape', '/scrape']
]);

function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
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

async function requestBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) {
      const error = new Error('EV API request is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchQuoteInventory(config, fetcher) {
  const response = await fetcher(new URL('/quotes', config.base), {
    headers: { Accept: 'application/json', 'X-API-Key': config.apiKey },
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Quote inventory unavailable.'); }
  const payload = await response.json();
  if (payload?.complete === false || payload?.partial === true || payload?.next_cursor) throw new Error('Complete quote inventory required.');
  return sanitizeInventory(Array.isArray(payload) ? payload : payload?.quotes);
}

// One malformed or duplicate record must not blank the feed for every viewer: drop it and keep
// the rest. The dashboard also skips and counts records it can't use.
function sanitizeInventory(records) {
  if (!Array.isArray(records)) return validateMarketQuotes(records);
  const seen = new Set(), kept = [];
  for (const record of records) {
    try { validateMarketQuotes([record]); } catch { continue; }
    const id = String(record.id);
    if (seen.has(id)) continue;
    seen.add(id); kept.push(record);
  }
  return validateMarketQuotes(kept);
}

// Every open dashboard polls every 3-10 s, and the upstream snapshot is several MB. Requests that
// arrive within 2 s share one upstream fetch (single flight). Only the provider data is shared:
// market controls are still read fresh for every response. Failures are never reused.
const INVENTORY_TTL_MS = 2_000;
const inventoryCache = new WeakMap();
function sharedInventory(config, fetcher) {
  const now = Date.now(), entry = inventoryCache.get(fetcher);
  if (entry && entry.base === config.base.href && now - entry.at < INVENTORY_TTL_MS) return entry.promise;
  const promise = fetchQuoteInventory(config, fetcher);
  inventoryCache.set(fetcher, { base: config.base.href, at: now, promise });
  promise.catch(() => { if (inventoryCache.get(fetcher)?.promise === promise) inventoryCache.delete(fetcher); });
  return promise;
}

/** Staff inventory loader; never return provider addresses, credentials, or errors. */
export async function readEvQuotes({ fetcher = fetch, providerConfig } = {}) {
  try {
    return await fetchQuoteInventory(providerConfig || connection(), fetcher);
  } catch {
    throw Object.assign(new Error('The normalized EV quote inventory is unavailable.'), { status: 503, code: 'MARKET_INVENTORY_UNAVAILABLE' });
  }
}

// Read-only datasets the quote API serves outside /quotes (its /status counts props and
// contracts separately). The upstream path isn't fixed in a contract yet, so the first candidate
// that doesn't 404 is used and remembered. Query strings pass through.
const DATASET_ROUTES = new Map([
  ['GET /api/ev/props', ['/props', '/dfs/props', '/player-props', '/quotes/props']],
  ['GET /api/ev/contracts', ['/contracts', '/prediction/contracts', '/predictions', '/markets']],
  ['GET /api/ev/openapi', ['/openapi.json']],
]);
const discoveredPaths = new Map();

async function handleDataset(res, url, candidates, config, fetcher) {
  const ordered = [...new Set([discoveredPaths.get(url.pathname), ...candidates].filter(Boolean))];
  for (const path of ordered) {
    const target = new URL(path, config.base);
    target.search = url.search;
    const response = await fetcher(target, { headers: { Accept: 'application/json', 'X-API-Key': config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (response.status === 404 || response.status === 405) { await response.body?.cancel(); continue; }
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); return reply(res, response.status, { error: 'The EV API rejected authentication. Check EV_TOOL_API_KEY in the server configuration.', retryable: false }); }
    const text = await response.text();
    let payload;
    try { payload = JSON.stringify(JSON.parse(text)); }
    catch { return reply(res, 502, { error: 'The EV API returned an unexpected response.', retryable: true }); }
    if (response.ok) discoveredPaths.set(url.pathname, path);
    res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Upstream-Path': path });
    return res.end(payload);
  }
  return reply(res, 404, { error: 'The quote API has no route for this dataset.', tried: ordered, retryable: false });
}

export async function handleEvApi(req, res, url, { loadControls, fetcher = fetch, providerConfig } = {}) {
  const key = `${req.method} ${url.pathname}`;
  if (DATASET_ROUTES.has(key)) {
    let config;
    try { config = providerConfig || connection(); }
    catch (error) { console.error('[ev-api] Quote feed configuration:', error.message); return reply(res, 500, { error: 'The quote feed is not configured on the server yet.', retryable: false }); }
    try { return await handleDataset(res, url, DATASET_ROUTES.get(key), config, fetcher); }
    catch { return reply(res, 503, { error: 'EV API unavailable. Confirm the API server is running and reachable at EV_TOOL_API_URL.', retryable: true }); }
  }
  const match = /^\/api\/ev\/matches\/([a-zA-Z0-9_-]{1,180})$/.exec(url.pathname);
  const route = paths.get(key) || (req.method === 'DELETE' && match ? `/matches/${match[1]}` : null);
  if (!route) return reply(res, 404, { error: 'Unknown EV API route.' });

  let config;
  try {
    config = providerConfig || connection();
  } catch (error) {
    // The detail names server settings; log it for the operator, show visitors a plain message.
    console.error('[ev-api] Quote feed configuration:', error.message);
    return reply(res, 500, { error: 'The quote feed is not configured on the server yet.', retryable: false });
  }

  const target = new URL(route, config.base);
  if (route === '/scrape') target.search = url.search;
  try {
    if (req.method === 'GET' && ['/quotes', '/matches'].includes(route) && typeof loadControls === 'function') {
      // Read rules after the upstream request, directly before serving. No cached
      // response may bypass a newly committed source/event distribution control.
      const quotes = await sharedInventory(config, fetcher);
      const controls = await loadControls();
      // Filtering re-validates and hashes every quote; skip it when nothing is blocked.
      const visible = controls.some(control => control.blocked) ? filterMarketQuotes(quotes, controls) : quotes;
      const records = route === '/matches' ? buildMarketMatches(visible) : visible;
      return reply(res, 200, {
        [route === '/matches' ? 'matches' : 'quotes']: records, count: records.length,
        complete: true, controlsApplied: true, controlScope: MARKET_CONTROL_SCOPE,
      });
    }
    const body = req.method === 'POST' ? await requestBody(req) : undefined;
    const response = await fetcher(target, {
      method: req.method,
      body,
      headers: {
        Accept: 'application/json',
        'X-API-Key': config.apiKey,
        ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return reply(res, response.status, { error: 'The EV API rejected authentication. Check EV_TOOL_API_KEY in the server configuration.', retryable: false });
    }
    // Only JSON leaves this origin: an upstream that returns HTML (misconfigured or tampered with)
    // must not be able to serve pages from the VisualOdds domain.
    const text = await response.text();
    let payload;
    try { payload = JSON.stringify(JSON.parse(text)); }
    catch { return reply(res, 502, { error: 'The EV API returned an unexpected response.', retryable: true }); }
    res.writeHead(response.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(response.headers.get('retry-after') ? { 'Retry-After': response.headers.get('retry-after') } : {})
    });
    res.end(payload);
  } catch (error) {
    if (req.method === 'GET' && ['/quotes', '/matches'].includes(route) && typeof loadControls === 'function') {
      return reply(res, 503, { error: 'Controlled quote distribution is unavailable. No unfiltered snapshot was served.', code: 'MARKET_DISTRIBUTION_UNAVAILABLE', retryable: true });
    }
    reply(res, error.status || 503, { error: error.status ? error.message : 'EV API unavailable. Confirm the API server is running and reachable at EV_TOOL_API_URL.' });
  }
}
