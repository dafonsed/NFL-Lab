import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MARKET_CONTROL_SCOPE, sourceControlKey } from '../lib/admin-market-controls.mjs';
import { pricingSettings, decodeSnapshot } from '../public/odds-contract.js';
import { fixtureRecords } from './fixtures/odds-feed.mjs';

// In production the transition provider prices on its own thread (lib/odds/worker.mjs) so the server keeps
// answering while it works. The thread reads the quote API itself; here that is a local stand-in.
test('the engine thread prices the feed, applies the controls it is sent, and keeps the main thread free', async t => {
  const body = JSON.stringify({ quotes: fixtureRecords({ games: 80, propsPerGame: 4 }), complete: true }), keys = [];
  const upstream = http.createServer((req, res) => { keys.push(req.headers['x-api-key']); res.writeHead(req.url.startsWith('/quotes') ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(req.url.startsWith('/quotes') ? body : '{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  // SportWizzard is on by default; the thread reads only the stand-in here (no network in tests).
  const saved = { url: process.env.EV_TOOL_API_URL, key: process.env.EV_TOOL_API_KEY, sportWizzard: process.env.SPORTWIZZARD_ENABLED };
  process.env.EV_TOOL_API_URL = `http://127.0.0.1:${upstream.address().port}`; process.env.EV_TOOL_API_KEY = 'thread-key'; process.env.SPORTWIZZARD_ENABLED = '0';
  t.after(() => { upstream.close(); for (const [name, value] of [['EV_TOOL_API_URL', saved.url], ['EV_TOOL_API_KEY', saved.key], ['SPORTWIZZARD_ENABLED', saved.sportWizzard]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const { selectProvider } = await import('../lib/odds/providers.mjs');
  const provider = selectProvider({});
  // The longest the main thread went without running a timer. Pricing on this thread stalls it for about
  // the whole build (normalize, price, encode); on the engine thread it keeps ticking.
  let last = performance.now(), longest = 0;
  const timer = setInterval(() => { const at = performance.now(); longest = Math.max(longest, at - last); last = at; }, 5);
  const started = performance.now();
  const text = await provider.snapshot({ loadControls: async () => [] }, { prefs: pricingSettings({}), include: 'pricing,markets' });
  const elapsed = performance.now() - started;
  longest = Math.max(longest, performance.now() - last);
  clearInterval(timer);
  const { snapshot } = decodeSnapshot(JSON.parse(text));
  assert.ok(snapshot.quotes.length > 1000 && snapshot.pricing.length > 0);
  assert.ok(keys.every(key => key === 'thread-key'));
  assert.ok(longest < elapsed / 2, `the main thread kept running (longest stall ${longest.toFixed(0)} ms of ${elapsed.toFixed(0)} ms)`);
  // Controls are read on the main thread and travel with the request.
  const controls = [{ scope: MARKET_CONTROL_SCOPE, kind: 'source', key: sourceControlKey('Caesars'), blocked: true }];
  const controlled = decodeSnapshot(JSON.parse(await provider.snapshot({ loadControls: async () => controls }, { prefs: pricingSettings({}), include: 'pricing' }))).snapshot;
  assert.ok(!controlled.quotes.some(quote => quote.book === 'Caesars'));
  await assert.rejects(provider.snapshot({ loadControls: async () => { throw new Error('db'); } }, { prefs: pricingSettings({}), include: 'pricing' }), { code: 'CONTROLS_UNAVAILABLE' });
});
