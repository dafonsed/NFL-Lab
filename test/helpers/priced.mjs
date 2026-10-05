// Prices as /api/odds serves them, for tests of the browser modules that display them: the quotes run
// through the real engine (lib/odds/engine.mjs) get its producer fields (status, expiresAt, implied and
// book no-vig probabilities, hold, outlier flag, market key) and the snapshot gets its analytics sections.
import { analyzeSnapshot } from '../../lib/odds/engine.mjs';
import { pricingSettings, SECTIONS } from '../../public/odds-contract.js';
import { indexSnapshot } from '../../public/odds-client.js';

/** { quotes, snapshot, analytics } for `quotes` priced with `settings` at `now`. */
export function priced(quotes, { settings = {}, now = Date.now(), sections = SECTIONS, books = null } = {}) {
  const analysis = analyzeSnapshot(quotes, pricingSettings(settings), { now });
  const out = quotes.map(quote => ({ ...quote, ...analysis.fields(quote) }));
  const snapshot = { contract: 'visualodds.odds/1', meta: { pricing: analysis.applied, provenance: { provider: 'website-transition', engine: 'test', engineVersion: '0', generatedAt: new Date(now).toISOString() }, snapshotAt: new Date(now).toISOString(), staleAfter: new Date(now + 60_000).toISOString(), stale: false, warmingUp: false, partial: false, warnings: [], scope: {}, counts: {} }, quotes: out };
  for (const section of sections) snapshot[section] = analysis.section(section, { books: books ? new Set(books) : null });
  return { quotes: out, snapshot, analytics: indexSnapshot(snapshot), analysis };
}

/** A quote as /api/odds serves a current price: open until `seconds` from now (the server's expiry time). */
export const current = (quote, seconds = 60) => ({ ...quote, status: 'open', expiresAt: new Date(Date.now() + seconds * 1000).toISOString() });
/** A quote past its expiry time (the server would mark it stale on its next answer). */
export const expired = quote => ({ ...quote, status: 'open', expiresAt: new Date(Date.now() - 1000).toISOString() });
