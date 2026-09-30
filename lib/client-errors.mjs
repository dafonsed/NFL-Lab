// Front-end error reports (public/error-reporter.js → POST /api/client-errors). Reports are
// same-origin only, small, rate-limited per IP and written to the server log, where the host
// (Vercel) keeps them. Nothing identifying is stored: no cookies, no query strings.
import { clientIp, createIpLimiter } from './request-limits.mjs';

const allow = createIpLimiter({ max: 20, windowMs: 60_000 });
const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, max);

function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (!origin) return site === 'same-origin';
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function readSmallBody(req, limit = 4096) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Returns true when the request was handled. */
export async function handleClientErrors(req, res, url, env = process.env) {
  if (url.pathname !== '/api/client-errors') return false;
  const reply = status => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); return true; };
  if (req.method !== 'POST') return reply(405);
  if (!sameOrigin(req)) return reply(403);
  if (!allow(clientIp(req, env))) return reply(429);
  try {
    const report = JSON.parse(await readSmallBody(req));
    const entry = {
      message: clip(report.message, 300), source: clip(report.source, 200).replace(/\?.*$/, ''),
      line: Number.isFinite(report.line) ? report.line : null, column: Number.isFinite(report.column) ? report.column : null,
      page: clip(report.page, 200).replace(/\?.*$/, ''), stack: clip(report.stack, 1200), agent: clip(req.headers['user-agent'], 160),
    };
    if (!entry.message) return reply(400);
    console.error('[client-error]', JSON.stringify(entry));
    return reply(204);
  } catch (error) { return reply(error.status || 400); }
}
