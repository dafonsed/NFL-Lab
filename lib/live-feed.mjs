import { createHash } from 'node:crypto';

export const LIVE_TTL = 15_000;
export const LIVE_MAX_AGE = 45_000;
export const liveStale = (receipt, now = Date.now()) => !receipt || receipt.stale || !Number.isFinite(Date.parse(receipt.fetchedAt)) || (receipt.sourceAgeMs || 0) + now - Date.parse(receipt.fetchedAt) > LIVE_MAX_AGE;
export const liveReceipt = r => ({ url: r.sourceUrl, fetchedAt: r.fetchedAt || null, checkedAt: new Date(r.checkedAt).toISOString(), sourceAgeMs: r.sourceAgeMs || 0, stale: r.stale, error: r.error || null, sha256: r.sha256 || null });

// Live responses use memory only, coalesce concurrent reads, and never advance a
// successful timestamp when the provider fails or sends an invalid replacement.
export class LiveFeed {
  constructor({ fetcher = fetch, now = () => Date.now() } = {}) {
    this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.pending = new Map();
  }
  async read(url, validate) {
    if (this.pending.has(url)) return this.pending.get(url);
    const saved = this.cache.get(url);
    if (saved && this.now() - saved.checkedAt < LIVE_TTL) return liveStale(saved, this.now()) ? { ...saved, stale: true } : saved;
    const task = (async () => {
      let value;
      try {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
        if (!response.ok) throw Error(`Live source returned HTTP ${response.status}`);
        const raw = await response.text();
        if (raw.length > 30_000_000) throw Error('Live source response is too large.');
        const data = JSON.parse(raw); validate(data);
        const age = Number(response.headers.get('age')), sourceAgeMs = Number.isFinite(age) ? Math.max(0, age) * 1000 : 0;
        value = { data, sourceUrl: url, fetchedAt: new Date(this.now()).toISOString(), checkedAt: this.now(), sourceAgeMs, stale: sourceAgeMs > LIVE_MAX_AGE, sha256: createHash('sha256').update(raw).digest('hex'), error: sourceAgeMs > LIVE_MAX_AGE ? 'Provider cache is too old for live comparisons.' : null };
      } catch (e) {
        value = { ...saved, data: saved?.data || null, sourceUrl: url, checkedAt: this.now(), stale: true, error: e.message };
      }
      this.cache.set(url, value);
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value);
      return value;
    })().finally(() => this.pending.delete(url));
    this.pending.set(url, task); return task;
  }
}
