import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { MARKET_CONTROL_SCOPE, buildMarketMatches, filterMarketQuotes, validateMarketQuotes } from './admin-market-controls.mjs';

// Credentials stay in the local Node server; browsers use same-origin routes.
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

function connection() {
  let local = {};
  try {
    local = parseEnv(readFileSync(configFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to read the EV API configuration in .env.local.');
  }
  const address = process.env.EV_TOOL_API_URL ?? local.EV_TOOL_API_URL;
  const apiKey = process.env.EV_TOOL_API_KEY ?? local.EV_TOOL_API_KEY;
  if (!address || !apiKey?.trim()) throw new Error('Set EV_TOOL_API_URL and EV_TOOL_API_KEY in the server environment or .env.local.');
  let base;
  try { base = new URL(address); }
  catch { throw new Error('EV_TOOL_API_URL must be a local network HTTP or HTTPS origin.'); }
  const host = base.hostname.toLowerCase();
  const octets = host.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(n => n >= 0 && n <= 255);
  const privateHost = ['localhost', '[::1]'].includes(host) || (ipv4 && (
    octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  ));
  if (!['http:', 'https:'].includes(base.protocol) || !privateHost || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('EV_TOOL_API_URL must be a loopback or private IPv4 HTTP or HTTPS origin, without a path or credentials.');
  }
  return { base, apiKey: apiKey.trim() };
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
  return validateMarketQuotes(Array.isArray(payload) ? payload : payload?.quotes);
}

/** Staff inventory loader; never return provider addresses, credentials, or errors. */
export async function readEvQuotes({ fetcher = fetch, providerConfig } = {}) {
  try {
    if (process.env.VERCEL) throw new Error('Local provider unavailable.');
    return await fetchQuoteInventory(providerConfig || connection(), fetcher);
  } catch {
    throw Object.assign(new Error('The normalized EV quote inventory is unavailable.'), { status: 503, code: 'MARKET_INVENTORY_UNAVAILABLE' });
  }
}

export async function handleEvApi(req, res, url, { loadControls, fetcher = fetch, providerConfig } = {}) {
  const key = `${req.method} ${url.pathname}`;
  const match = /^\/api\/ev\/matches\/([a-zA-Z0-9_-]{1,180})$/.exec(url.pathname);
  const route = paths.get(key) || (req.method === 'DELETE' && match ? `/matches/${match[1]}` : null);
  if (!route) return reply(res, 404, { error: 'Unknown EV API route.' });
  if (process.env.VERCEL) return reply(res, 503, { error: 'The EV API requires VisualOdds running on the same local network as the API server.', retryable: false });

  let config;
  try {
    config = providerConfig || connection();
  } catch (error) {
    return reply(res, 500, { error: error.message, retryable: false });
  }

  const target = new URL(route, config.base);
  if (route === '/scrape') target.search = url.search;
  try {
    if (req.method === 'GET' && ['/quotes', '/matches'].includes(route) && typeof loadControls === 'function') {
      // Read rules after the upstream request, directly before serving. No cached
      // response may bypass a newly committed source/event distribution control.
      const quotes = await fetchQuoteInventory(config, fetcher);
      const controls = await loadControls();
      const visible = filterMarketQuotes(quotes, controls);
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
    reply(res, error.status || 503, { error: error.status ? error.message : 'EV API unavailable. Confirm the API host is running on port 8000 and this computer is on the same WiFi or local network.' });
  }
}
