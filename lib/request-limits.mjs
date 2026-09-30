// Cheap in-process guards for the public data APIs. Serverless instances each keep their own
// counters, so these bound abuse per instance rather than globally; the account limiter in
// lib/accounts handles anything that must be exact.

/** Same trusted-IP rule as the account system: Vercel's ingress header in production, the socket locally. */
export function clientIp(req, env = process.env) {
  return env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
}

/**
 * A forced refresh (?refresh=1) bypasses every cache and re-fetches upstream data. Honour at most one
 * per key per window; other requests inside the window are served from cache instead.
 */
export function createRefreshGate({ windowMs = 60_000, now = () => Date.now() } = {}) {
  const last = new Map();
  return function allowRefresh(key, requested) {
    if (!requested) return false;
    const time = now();
    if (last.has(key) && time - last.get(key) < windowMs) return false;
    last.set(key, time);
    return true;
  };
}

/** Fixed-window request counter per IP. Returns false once an IP exceeds `max` requests in the window. */
export function createIpLimiter({ max = 240, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return function allow(ip) {
    const time = now(), window = Math.floor(time / windowMs);
    const bucket = buckets.get(ip);
    if (!bucket || bucket.window !== window) {
      if (buckets.size > 10_000) for (const [key, value] of buckets) if (value.window !== window) buckets.delete(key);
      buckets.set(ip, { window, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}
