import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

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

export async function handleEvApi(req, res, url) {
  const key = `${req.method} ${url.pathname}`;
  const match = /^\/api\/ev\/matches\/([a-zA-Z0-9_-]{1,180})$/.exec(url.pathname);
  const route = paths.get(key) || (req.method === 'DELETE' && match ? `/matches/${match[1]}` : null);
  if (!route) return reply(res, 404, { error: 'Unknown EV API route.' });
  if (process.env.VERCEL) return reply(res, 503, { error: 'The EV API requires Sportslab running on the same local network as the API server.', retryable: false });

  let config;
  try {
    config = connection();
  } catch (error) {
    return reply(res, 500, { error: error.message, retryable: false });
  }

  const target = new URL(route, config.base);
  if (route === '/scrape') target.search = url.search;
  try {
    const body = req.method === 'POST' ? await requestBody(req) : undefined;
    const response = await fetch(target, {
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
    const payload = await response.text();
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(response.headers.get('retry-after') ? { 'Retry-After': response.headers.get('retry-after') } : {})
    });
    res.end(payload);
  } catch (error) {
    reply(res, error.status || 503, { error: error.status ? error.message : 'EV API unavailable. Confirm the API host is running on port 8000 and this computer is on the same WiFi or local network.' });
  }
}
