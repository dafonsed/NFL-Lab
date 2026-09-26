// Same-origin bridge to the separately running, loopback-only EV quote API.
// The bridge is intentionally unavailable in hosted Vercel deployments.
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
  const match = /^\/api\/ev\/matches\/([a-f0-9]{16})$/.exec(url.pathname);
  const route = paths.get(key) || (req.method === 'DELETE' && match ? `/matches/${match[1]}` : null);
  if (!route) return reply(res, 404, { error: 'Unknown EV API route.' });
  if (process.env.VERCEL) return reply(res, 503, { error: 'The EV quote API is local only.' });

  let base;
  try {
    base = new URL(process.env.EV_TOOL_API_URL || 'http://127.0.0.1:8000/');
    if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname.toLowerCase()) || base.username || base.password || base.pathname !== '/') {
      throw new Error('EV_TOOL_API_URL must be a loopback HTTP origin.');
    }
  } catch (error) {
    return reply(res, 500, { error: error.message });
  }

  const target = new URL(route, base);
  if (route === '/scrape') target.search = url.search;
  try {
    const body = req.method === 'POST' ? await requestBody(req) : undefined;
    const response = await fetch(target, {
      method: req.method,
      body,
      headers: body?.length ? { 'Content-Type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.text();
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(payload);
  } catch (error) {
    reply(res, error.status || 503, { error: error.status ? error.message : 'Local EV API unavailable. Start it on 127.0.0.1:8000 to sync quotes.' });
  }
}
