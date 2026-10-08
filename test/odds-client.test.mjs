import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnapshot, getEV, getDfs, getLineMovement, getDfsLinePrices, getPredictionContracts, indexSnapshot, serverNow } from '../public/odds-client.js';
import { CONTRACT_ID, encodeTable, QUOTE_DICTIONARY } from '../public/odds-contract.js';

// The browser's adapter: one request per question, validated answers, typed failures.
const iso = ms => new Date(ms).toISOString();
const quote = (id, extra = {}) => ({ id, book: 'FanDuel', event: 'A @ B', side: 'home', odds: -110, ts: iso(Date.now()), status: 'open', expiresAt: iso(Date.now() + 60_000), marketKey: 'm1', ...extra });
const snapshot = (extra = {}) => ({ contract: CONTRACT_ID, meta: { snapshotAt: iso(Date.now()), staleAfter: iso(Date.now() + 60_000) }, quotes: encodeTable([quote('a'), quote('b', { side: 'away' })], QUOTE_DICTIONARY), pricing: [{ quoteId: 'a', fairProbability: .5, ev: .02, plausible: true }], markets: [{ key: 'm1', sides: [{ side: 'home', averageOdds: -115, fairProbability: .5 }] }], ...extra });
function stubFetch(t, respond) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return respond(url, calls.length); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('a snapshot request names its sections and the member’s pricing, and is shared while in flight', async t => {
  const calls = stubFetch(t, () => json(snapshot()));
  const settings = { devigMethod: 'power', minEvPercent: 2 };
  const [first, second] = await Promise.all([getSnapshot({ settings, include: ['pricing', 'markets', 'arbitrage'] }), getSnapshot({ settings, include: ['pricing', 'markets', 'arbitrage'] })]);
  assert.equal(calls.length, 1, 'one request for both callers');
  const url = new URL(calls[0].url, 'https://x.test');
  assert.equal(url.pathname, '/api/odds/snapshot');
  assert.equal(url.searchParams.get('include'), 'pricing,markets,arbitrage');
  assert.deepEqual(JSON.parse(url.searchParams.get('prefs')), { devigMethod: 'power' }, 'only pricing preferences travel');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual(first.snapshot.quotes.map(q => q.id), ['a', 'b']);
  assert.equal(second.snapshot, first.snapshot);
  // Defaults send no preferences at all, so every member on them shares the server's cached answer.
  await getSnapshot({ settings: {} });
  assert.equal(new URL(calls[1].url, 'https://x.test').searchParams.has('prefs'), false);
  // The member's sportsbooks travel sorted, so one state's members share one answer.
  await getSnapshot({ books: ['FanDuel', 'BetMGM', 'FanDuel'] });
  assert.equal(new URL(calls[2].url, 'https://x.test').searchParams.get('books'), 'BetMGM,FanDuel');
});

test('failures are typed: unavailable, rate limited (with its wait), malformed, timeout', async t => {
  let mode = 'down';
  stubFetch(t, () => {
    if (mode === 'down') return json({ error: { code: 'UNAVAILABLE', message: 'The odds source is unavailable right now.', retryable: true } }, 503);
    if (mode === 'limited') return json({ error: { code: 'RATE_LIMITED', message: 'Too many price requests.', retryable: true } }, 429, { 'Retry-After': '30' });
    if (mode === 'legacy') return json({ error: 'Too many price requests.' }, 429, { 'Retry-After': '12' });
    if (mode === 'html') return new Response('<html>oops</html>', { status: 200 });
    if (mode === 'shape') return json({ quotes: [] });
    throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
  });
  await assert.rejects(getSnapshot(), { code: 'UNAVAILABLE', retryable: true });
  mode = 'limited'; await assert.rejects(getSnapshot(), { code: 'RATE_LIMITED', retryAfterSeconds: 30 });
  mode = 'legacy'; await assert.rejects(getSnapshot(), { code: 'RATE_LIMITED', retryAfterSeconds: 12 });
  mode = 'html'; await assert.rejects(getSnapshot(), { code: 'MALFORMED' });
  mode = 'shape'; await assert.rejects(getSnapshot(), { code: 'MALFORMED' });
  mode = 'timeout'; await assert.rejects(getSnapshot(), { code: 'TIMEOUT', retryable: true });
});

test('the server’s clock decides expiry: a device clock that runs fast doesn’t expire current prices', async t => {
  stubFetch(t, () => json(snapshot(), 200, { Date: new Date(Date.now() - 120_000).toUTCString() }));
  await getSnapshot({ include: ['pricing'] });
  assert.ok(Math.abs(serverNow() - (Date.now() - 120_000)) < 2_000, 'two minutes behind, as the server said');
  stubFetch(t, () => json(snapshot(), 200, { Date: new Date().toUTCString() }));
  await getSnapshot({ include: ['markets'] });
  assert.ok(Math.abs(serverNow() - Date.now()) < 1_000, 'small differences are ignored');
});

test('section views, DFS lines, line history, member lines and contracts use their own routes', async t => {
  const calls = stubFetch(t, url => {
    const path = new URL(url, 'https://x.test').pathname;
    if (path === '/api/odds/ev') return json(snapshot());
    if (path === '/api/odds/dfs') return json({ contract: CONTRACT_ID, meta: {}, picks: [{ id: 'p', app: 'PrizePicks', probability: .61 }, { id: 'q', app: 'PrizePicks', probability: 'x' }], payouts: { PrizePicks: { 2: [0, 0, 3] } } });
    if (path === '/api/odds/history') return json({ contract: CONTRACT_ID, meta: {}, series: [{ quoteId: 'a', points: [{ at: iso(Date.now()), odds: -110 }] }, { quoteId: 3 }] });
    if (path === '/api/odds/dfs/price') return json({ contract: CONTRACT_ID, meta: {}, lines: [{ probability: .55, probabilityBooks: ['FanDuel'] }] });
    if (path === '/api/odds/contracts') return json({ contract: CONTRACT_ID, meta: {}, contracts: [{ id: 'k' }] });
    return json({}, 404);
  });
  const ev = await getEV({ live: false, limit: 50, sport: 'NFL' });
  assert.equal(ev.pricing[0].quoteId, 'a');
  assert.deepEqual(Object.fromEntries(new URL(calls[0].url, 'https://x.test').searchParams), { sport: 'NFL', live: 'false', limit: '50' });
  const fullDfs = await getDfs({ settings: { devigMethod: 'power' }, sport: 'MLB', limit: 5000 });
  assert.equal(fullDfs.picks.length, 2);
  assert.equal(calls[1].init.cache, 'default', 'the heavy full DFS feed may use the shared CDN answer');
  assert.deepEqual(Object.fromEntries(new URL(calls[1].url, 'https://x.test').searchParams), { prefs: JSON.stringify({ devigMethod: 'power' }), sport: 'MLB', limit: '5000' });
  const dfs = await getDfs();
  assert.deepEqual(dfs.picks.map(pick => pick.probability), [.61, null], 'an unreadable probability is unknown, not 0%');
  assert.deepEqual(dfs.payouts.PrizePicks['2'], [0, 0, 3]);
  assert.equal((await getLineMovement({ quoteId: 'a' })).series.length, 1);
  assert.equal(new URL(calls.at(-1).url, 'https://x.test').searchParams.get('hours'), '24');
  const lines = await getDfsLinePrices({ lines: [{ app: 'PrizePicks', player: 'P', market: 'Points', line: 20.5, side: 'Over' }] });
  assert.equal(lines[0].probability, .55);
  assert.deepEqual((await getPredictionContracts()).map(item => item.id), ['k']);
});

test('the index answers display lookups without computing anything', () => {
  const { snapshot: decoded } = { snapshot: { quotes: [quote('a'), quote('b', { side: 'away' }), quote('c', { marketKey: 'm2' })], pricing: [{ quoteId: 'a', fairProbability: .5, ev: .02 }], markets: [{ key: 'm1', sides: [{ side: 'home', averageOdds: -115 }] }], arbitrage: [] } };
  const index = indexSnapshot(decoded);
  assert.deepEqual(index.peers(decoded.quotes[0]).map(q => q.id), ['a', 'b']);
  assert.equal(index.marketSide(decoded.quotes[0]).averageOdds, -115);
  assert.equal(index.marketSide(decoded.quotes[1]), null, 'no summary for that side');
  assert.equal(index.pricingOf(decoded.quotes[0]).ev, .02);
  assert.equal(index.pricingOf(decoded.quotes[1]), null, 'no pricing is unavailable, not zero');
  assert.equal(index.has('arbitrage'), true);
  assert.equal(index.has('middles'), false);
  assert.equal(index.middles, null);
});
