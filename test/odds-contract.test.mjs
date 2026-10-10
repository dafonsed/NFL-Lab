import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_ID, OddsError, errorFromBody, decodeSnapshot, decodeTable, encodeTable, encodePreferences, parsePreferences, pricingSettings, pricingPreferences,
  preferencesKey, quoteFreshness, isCurrent, snapshotStale, valueState, QUOTE_DICTIONARY } from '../public/odds-contract.js';

const now = Date.parse('2026-10-05T18:00:00Z'), iso = ms => new Date(ms).toISOString();
const quote = (id, extra = {}) => ({ id, book: 'FanDuel', event: 'A @ B', side: 'home', odds: -110, ts: iso(now - 30_000), status: 'open', expiresAt: iso(now + 60_000), marketKey: 'm1', impliedProbability: 0.52381, ...extra });

test('a snapshot decodes its quotes and sections; unreadable values become null, never a made-up number', () => {
  const body = { contract: CONTRACT_ID, meta: { provenance: { provider: 'website-transition', engine: 'e', engineVersion: '1', generatedAt: iso(now) }, pricing: { devigMethod: 'power', devigVersion: 'v1' }, snapshotAt: iso(now), staleAfter: iso(now + 60_000) },
    quotes: [quote('a'), quote('b', { odds: 'abc', impliedProbability: 2, bookFairProbability: 'x', expiresAt: 'soon' }), { id: '', book: 'X' }, quote('a')],
    pricing: [{ quoteId: 'a', fairProbability: .5, fairOdds: 100, ev: .02, edge: .01, kellyFraction: .02, plausible: true, bookCount: 2 }, { quoteId: 'missing', fairProbability: .5, ev: .1 }, { quoteId: 'b', fairProbability: 1.5, ev: .1 }] };
  const { snapshot, dropped } = decodeSnapshot(body);
  assert.deepEqual(snapshot.quotes.map(q => q.id), ['a', 'b']);
  assert.deepEqual(dropped, { quotes: 2, pricing: 2 }, 'a quote without an id, a duplicate, pricing for a missing quote and an impossible probability');
  const b = snapshot.quotes[1];
  assert.equal(b.odds, null);
  assert.equal(b.impliedProbability, null);
  assert.equal(b.bookFairProbability, null);
  assert.equal(b.expiresAt, null);
  assert.equal(snapshot.pricing.length, 1);
  assert.equal(snapshot.pricing[0].fairProbability, .5);
  assert.equal(snapshot.meta.pricing.devigMethod, 'power');
  assert.equal(snapshot.meta.pricing.devigVersion, 'v1');
  assert.throws(() => decodeSnapshot({ quotes: [] }), error => error instanceof OddsError && error.code === 'MALFORMED', 'another contract (or none) is malformed');
  assert.throws(() => decodeSnapshot('<html>'), OddsError);
});

test('an empty market is an empty answer, not an error, and indexes to no values', async () => {
  const { indexSnapshot } = await import('../public/odds-client.js');
  const { snapshot, dropped } = decodeSnapshot({ contract: CONTRACT_ID, meta: { snapshotAt: iso(now), staleAfter: iso(now + 60_000) }, quotes: [], pricing: [], markets: [], arbitrage: [] });
  assert.deepEqual([snapshot.quotes, snapshot.pricing, snapshot.markets, snapshot.arbitrage, dropped], [[], [], [], [], {}]);
  const index = indexSnapshot(snapshot);
  assert.equal(index.pricingOf({ id: 'x' }), null);
  assert.equal(index.marketSide({ marketKey: 'm', side: 'home' }), null);
  assert.equal(index.has('arbitrage'), true, 'an empty section was answered');
  assert.equal(index.has('middles'), false, 'a section that wasn’t requested is unknown, not empty');
  assert.throws(() => decodeSnapshot({ contract: CONTRACT_ID, meta: {} }), { code: 'MALFORMED' }, 'no quote list at all is malformed');
});

test('tables round-trip records, dictionary columns and row references to another table', () => {
  const quotes = [quote('a'), quote('b', { book: 'DraftKings', odds: 120 }), quote('c', { liquidity: 900 })];
  const table = encodeTable(quotes, QUOTE_DICTIONARY);
  assert.equal(table.dictionaries.book.length, 2, 'repeated text is listed once');
  assert.deepEqual(decodeTable(table), quotes);
  const pricing = [{ quoteId: 'c', ev: .1 }, { quoteId: 'a', ev: -.02 }];
  const encoded = encodeTable(pricing, [], { quoteId: { table: 'quotes', rows: new Map(quotes.map((item, row) => [item.id, row])) } });
  assert.deepEqual(encoded.rows.map(row => row[0]), [2, 0], 'quote ids travel as row numbers');
  assert.deepEqual(decodeTable(encoded, { quotes: quotes.map(item => item.id) }), pricing);
  assert.deepEqual(decodeTable([{ x: 1 }]), [{ x: 1 }], 'plain arrays are accepted too');
  assert.throws(() => decodeTable({ rows: [] }), OddsError);
  const { snapshot } = decodeSnapshot({ contract: CONTRACT_ID, quotes: table, pricing: encoded });
  assert.deepEqual(snapshot.pricing.map(row => row.quoteId), [], 'pricing rows without a fair probability are not pricing');
});

test('pricing preferences: defaults send nothing, saved settings travel, anything else is a 400', () => {
  assert.equal(encodePreferences({}), '');
  assert.equal(encodePreferences({ minEvPercent: 3, league: 'NFL' }), '', 'display filters are not pricing');
  const saved = { devigMethod: 'power', minSharpBooks: '2', bookRules: [{ book: 'Pinnacle', weight: 3 }], pregameMaxAgeSeconds: 86400, maxEvPercent: '' };
  assert.deepEqual(pricingPreferences(saved), { devigMethod: 'power', minSharpBooks: 2, bookRules: [{ book: 'Pinnacle', weight: 3 }] }, 'the old 24-hour age is treated as unset');
  const parsed = parsePreferences(encodePreferences(saved));
  assert.equal(parsed.devigMethod, 'power');
  assert.equal(parsed.maxVigPercent, 20, 'unsent values are the defaults');
  assert.equal(preferencesKey(parsed), preferencesKey(pricingSettings(saved)));
  assert.notEqual(preferencesKey(parsed), preferencesKey(pricingSettings({})));
  for (const bad of ['{', '[]', '{"devigMethod":"magic"}', '{"minSharpBooks":0}', '{"apiKey":"x"}', '{"bookRules":[{"weight":1}]}', 'x'.repeat(5000)]) {
    assert.throws(() => parsePreferences(bad), error => error.code === 'BAD_REQUEST' && error.status === 400, bad.slice(0, 30));
  }
});

test('freshness: current only while open and before the server’s expiry; old odds are never current', () => {
  assert.equal(quoteFreshness(quote('a'), now), 'current');
  assert.equal(quoteFreshness(quote('a'), now + 61_000), 'stale');
  assert.equal(quoteFreshness(quote('a', { status: 'suspended' }), now), 'suspended');
  assert.equal(quoteFreshness(quote('a', { expiresAt: null }), now), 'stale', 'no expiry, not current');
  assert.equal(isCurrent(null, now), false);
  assert.equal(snapshotStale({ staleAfter: iso(now + 1000), stale: false }, now), false);
  assert.equal(snapshotStale({ staleAfter: iso(now + 1000), stale: true }, now), true, 'a held-over snapshot');
  assert.equal(snapshotStale({ staleAfter: iso(now - 1000) }, now), true);
  assert.equal(snapshotStale(null, now), true);
});

test('a value is authoritative (odds API), calculated (website server), unavailable, stale or pending', () => {
  const meta = provider => ({ provenance: { provider }, staleAfter: iso(now + 60_000), stale: false });
  assert.equal(valueState(.52, { meta: meta('odds-api'), quote: quote('a'), now }), 'authoritative');
  assert.equal(valueState(.52, { meta: meta('website-transition'), quote: quote('a'), now }), 'calculated');
  assert.equal(valueState(null, { meta: meta('odds-api'), now }), 'unavailable');
  assert.equal(valueState(Number.NaN, { meta: meta('odds-api'), now }), 'unavailable', 'NaN is no value, not a number to show');
  assert.equal(valueState(.52, { meta: meta('odds-api'), quote: quote('a', { expiresAt: iso(now - 1) }), now }), 'stale');
  assert.equal(valueState(.52, { meta: { ...meta('odds-api'), stale: true }, now }), 'stale', 'a held-over snapshot');
  assert.equal(valueState(.52, { meta: meta('odds-api'), now: now + 61_000 }), 'stale', 'past the response’s staleAfter');
  assert.equal(valueState(undefined, { pending: true }), 'pending');
});

test('errors carry a code, an HTTP status and whether a retry can help', () => {
  const limited = new OddsError('RATE_LIMITED', undefined, { retryAfterSeconds: 30 });
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.toBody(), { error: { code: 'RATE_LIMITED', message: 'Too many price requests. Prices resume shortly.', retryable: true, retryAfterSeconds: 30 } });
  assert.equal(new OddsError('NOT_CONFIGURED').retryable, false);
  assert.equal(new OddsError('UNKNOWN_THING').code, 'UNAVAILABLE');
  assert.equal(errorFromBody({ error: { code: 'TIMEOUT', message: 'slow' } }, 504).code, 'TIMEOUT');
  assert.equal(errorFromBody({ error: 'Too many requests' }, 429).code, 'RATE_LIMITED', 'the older text body still maps');
  assert.equal(errorFromBody(null, 500).code, 'UNAVAILABLE');
});

test('saved Pricing & filters settings no longer apply; only the arbitrage page’s mode is kept', async () => {
  const { workspaceSettings, SUITE_SETTING_DEFAULTS } = await import('../public/odds-contract.js');
  const saved = { minSharpBooks: 4, maxVigPercent: 2, devigMethod: 'worst-case', bookRules: [{ book: 'Pinnacle', weight: 1, required: true }], minEvPercent: 5, league: 'NFL', arbMode: 'middles' };
  const { oddsFormat, ...defaults } = SUITE_SETTING_DEFAULTS;
  assert.deepEqual(workspaceSettings({ ...saved, oddsFormat: 'decimal' }), { ...defaults, bookRules: [], arbMode: 'middles' }, 'the account odds format decides, not a saved workspace one');
  assert.deepEqual(workspaceSettings(null), { ...defaults, bookRules: [] });
});
