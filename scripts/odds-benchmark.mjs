// Times the server-side odds pipeline (normalize → engine → the /api/odds answer) on a synthetic feed the size
// of the real one, and reports what the browser downloads and how long it takes to read. Synthetic "Fixture"
// games only (test/fixtures/odds-feed.mjs); the quote source is a local stand-in, nothing is fetched.
//   node scripts/odds-benchmark.mjs [games] [propsPerGame]
import { brotliCompressSync, constants } from 'node:zlib';
import { normalizeFeed } from '../lib/odds/normalize.mjs';
import { analyzeSnapshot } from '../lib/odds/engine.mjs';
import { createTransitionProvider } from '../lib/odds/providers.mjs';
import { parseEvApiConfig } from '../lib/ev-api-proxy.mjs';
import { pricingSettings, decodeSnapshot } from '../public/odds-contract.js';
import { fixtureRecords, fixtureFetcher } from '../test/fixtures/odds-feed.mjs';

const games = Number(process.argv[2]) || 420, propsPerGame = Number(process.argv[3]) || 12;
const records = fixtureRecords({ games, propsPerGame });
const time = async (label, run) => { const start = performance.now(); const value = await run(); console.log(`${label.padEnd(30)} ${(performance.now() - start).toFixed(0).padStart(6)} ms`); return value; };
console.log(`${records.length.toLocaleString()} raw records (${games} games, ${propsPerGame} props each)`);

// The stages one by one.
const feed = await time('normalize', () => normalizeFeed(records, { price: false }));
const analysis = await time('quote fields', () => analyzeSnapshot(feed.quotes, pricingSettings({})));
for (const section of ['pricing', 'markets', 'arbitrage', 'middles', 'holds', 'sharp', 'hedges']) await time(`section ${section}`, () => analysis.section(section).length);

// The whole answer as /api/odds/snapshot builds it (the +EV page's default sections), then as the browser reads it.
const provider = createTransitionProvider(), context = { fetcher: fixtureFetcher(records), providerConfig: parseEvApiConfig({ address: 'http://127.0.0.1:9', apiKey: 'benchmark' }) };
const body = await time('snapshot answer (all stages)', () => provider.snapshot(context, { prefs: pricingSettings({}), include: 'pricing,markets' }));
const compressed = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
const { snapshot } = await time('browser decode', () => decodeSnapshot(JSON.parse(body)));
console.log(`snapshot ${(body.length / 1e6).toFixed(1)} MB JSON, ${(compressed.length / 1e6).toFixed(1)} MB brotli (${snapshot.quotes.length.toLocaleString()} quotes, ${snapshot.pricing?.length.toLocaleString()} priced)`);
