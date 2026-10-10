import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOddsApi } from '../lib/odds/http.mjs';
import { createTimeToLiveCache, createTransitionProvider } from '../lib/odds/providers.mjs';
import { parseEvApiConfig } from '../lib/ev-api-proxy.mjs';
import { MARKET_CONTROL_SCOPE, sourceControlKey } from '../lib/admin-market-controls.mjs';
import { CONTRACT_ID, decodeSnapshot, encodeTable, QUOTE_DICTIONARY } from '../public/odds-contract.js';
import { fixtureRecords, fixtureFetcher, fixturePayouts } from './fixtures/odds-feed.mjs';

// GET /api/odds/*: the website API the pages read. Upstream is a stand-in for the quote API serving
// synthetic "Fixture" games (test/fixtures/odds-feed.mjs); nothing leaves this process.
const providerConfig = parseEvApiConfig({ address: 'http://127.0.0.1:9', apiKey: 'fixture-key' });
async function call(path, { method = 'GET', fetcher = fixtureFetcher(), provider = createTransitionProvider(), loadControls = null, env, ...options } = {}) {
  let status, headers, raw;
  await handleOddsApi({ method, headers: {} }, { writeHead(code, value) { status = code; headers = value; }, end(value) { raw = String(value); }, destroyed: false },
    new URL(path, 'http://localhost'), { providerConfig, fetcher, provider, loadControls, env: env || { ODDS_ENGINE_THREAD: 'off' }, ...options });
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status, headers, body, raw };
}
const ALL = 'pricing,markets,arbitrage,middles,holds,sharp,hedges';

test('the snapshot serves prices with the analytics computed on the server, in the contract, without secrets', async () => {
  const fetcher = fixtureFetcher();
  const result = await call(`/api/odds/snapshot?include=${ALL}`, { fetcher });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Odds-Provider'], 'website-transition');
  assert.equal(result.body.contract, CONTRACT_ID);
  assert.ok(!result.raw.includes('fixture-key') && !result.raw.includes('127.0.0.1'), 'no key or upstream address in the answer');
  assert.ok(fetcher.calls.every(call => call.key === 'fixture-key'), 'the key goes upstream in a header');
  const { snapshot, dropped } = decodeSnapshot(result.body);
  assert.deepEqual(dropped, {});
  assert.equal(snapshot.meta.provenance.provider, 'website-transition');
  assert.equal(snapshot.meta.pricing.devigMethod, 'multiplicative');
  assert.match(snapshot.meta.pricing.devigVersion, /^visualodds-devig\//);
  const quote = snapshot.quotes.find(item => item.book === 'Pinnacle' && item.type === 'moneyline' && !item.live);
  for (const field of ['marketKey', 'impliedProbability', 'bookFairProbability', 'bookHold', 'expiresAt', 'status']) assert.notEqual(quote[field], null, field);
  assert.equal(quote.feedId, undefined, 'the feed record id stays on the server');
  // +EV: Caesars' home price is above the consensus of the other books.
  const caesars = snapshot.quotes.find(item => item.book === 'Caesars' && item.type === 'moneyline' && item.side === 'home' && item.event.includes('Saints'));
  const row = snapshot.pricing.find(item => item.quoteId === caesars.id);
  assert.ok(row.ev > 0.05 && row.plausible, JSON.stringify(row));
  assert.ok(row.references.length >= 3, 'positive rows list their reference books');
  assert.equal(row.devigMethod, 'multiplicative');
  // Arbitrage: DraftKings' home side against FanDuel's away side, with stake shares that sum to one.
  const arb = snapshot.arbitrage.find(item => item.legs.some(leg => leg.book === 'DraftKings') && item.legs.some(leg => leg.book === 'FanDuel'));
  assert.ok(arb && arb.margin > 0, 'the fixture arbitrage is found');
  assert.ok(Math.abs(arb.legs.reduce((sum, leg) => sum + leg.stakeFraction, 0) - 1) < 1e-6);
  for (const section of ['markets', 'middles', 'holds', 'sharp', 'hedges']) assert.ok(snapshot[section].length > 0, section);
});

test('requests share one upstream fetch and one pricing run', async () => {
  const fetcher = fixtureFetcher(), provider = createTransitionProvider();
  const answers = await Promise.all([1, 2, 3].map(() => call('/api/odds/snapshot', { fetcher, provider })));
  assert.ok(answers.every(answer => answer.status === 200));
  assert.equal(new Set(answers.map(answer => answer.raw)).size, 1, 'the same answer');
  assert.equal(fetcher.calls.filter(call => call.path === '/quotes').length, 1);
  await call('/api/odds/snapshot?include=pricing,markets,holds', { fetcher, provider });
  assert.equal(fetcher.calls.filter(call => call.path === '/quotes').length, 1, 'another section list reuses the same priced snapshot');
});

test('section views list only their rows and the quotes those rows name', async () => {
  const result = await call('/api/odds/ev?limit=1&live=false');
  assert.equal(result.status, 200);
  const { snapshot } = decodeSnapshot(result.body);
  assert.equal(snapshot.pricing.length, 1);
  assert.ok(snapshot.pricing[0].ev > 0 && snapshot.pricing[0].plausible);
  assert.deepEqual(snapshot.quotes.map(quote => quote.id), [snapshot.pricing[0].quoteId]);
  const arbs = decodeSnapshot((await call('/api/odds/arbitrage')).body).snapshot;
  assert.ok(arbs.arbitrage.length > 0 && arbs.quotes.length === new Set(arbs.arbitrage.flatMap(row => row.legs.map(leg => leg.quoteId))).size);
  const events = (await call('/api/odds/events?sport=NFL')).body;
  assert.ok(events.events.some(event => event.displayName === 'Fixture Falcons @ Fixture Saints'));
  const one = decodeSnapshot((await call(`/api/odds/events?event=${encodeURIComponent(events.events[0].id)}`)).body).snapshot;
  assert.ok(one.quotes.length > 0 && one.quotes.every(quote => quote.eventId === events.events[0].id));
});

test('the member’s pricing preferences change the pricing, and members on the defaults share one answer', async () => {
  const provider = createTransitionProvider(), fetcher = fixtureFetcher();
  const base = decodeSnapshot((await call('/api/odds/snapshot', { provider, fetcher })).body).snapshot;
  const power = decodeSnapshot((await call(`/api/odds/snapshot?prefs=${encodeURIComponent(JSON.stringify({ devigMethod: 'power' }))}`, { provider, fetcher })).body).snapshot;
  assert.equal(power.meta.pricing.devigMethod, 'power');
  const fair = snapshot => snapshot.pricing.find(row => snapshot.quotes.find(quote => quote.id === row.quoteId)?.book === 'Caesars').fairProbability;
  assert.notEqual(fair(power), fair(base));
  const strict = decodeSnapshot((await call(`/api/odds/snapshot?prefs=${encodeURIComponent(JSON.stringify({ minSharpBooks: 9 }))}`, { provider, fetcher })).body).snapshot;
  assert.equal(strict.pricing.length, 0, 'not enough reference books: no fair price is made up');
});

test('bad requests are refused with a typed error; only GET is served', async () => {
  for (const [path, code, status] of [['/api/odds/snapshot?prefs=%7B', 'BAD_REQUEST', 400], ['/api/odds/snapshot?include=everything', 'BAD_REQUEST', 400],
    ['/api/odds/snapshot?sport=Curling', 'BAD_REQUEST', 400], ['/api/odds/ev?minEv=7', 'BAD_REQUEST', 400], ['/api/odds/unknown', 'NOT_FOUND', 404],
    ['/api/odds/history', 'BAD_REQUEST', 400], ['/api/odds/history?id=local-api:nope', 'NOT_FOUND', 404], ['/api/odds/dfs/price?lines=%5B%5D', 'BAD_REQUEST', 400]]) {
    const result = await call(path);
    assert.equal(result.status, status, path);
    assert.equal(result.body.error.code, code, path);
  }
  const fetcher = fixtureFetcher();
  const post = await call('/api/odds/snapshot', { method: 'POST', fetcher });
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET');
  assert.equal(fetcher.calls.length, 0, 'nothing reached the upstream API');
});

test('distribution controls apply before pricing, and an unreadable control set serves nothing', async () => {
  const controls = [{ scope: MARKET_CONTROL_SCOPE, kind: 'source', key: sourceControlKey('Caesars'), blocked: true }];
  const { snapshot } = decodeSnapshot((await call(`/api/odds/snapshot?include=${ALL}`, { loadControls: async () => controls })).body);
  assert.ok(!snapshot.quotes.some(quote => quote.book === 'Caesars'));
  assert.ok(!snapshot.pricing.some(row => (row.references || []).some(book => book.book === 'Caesars')), 'a blocked book is not a reference either');
  const failed = await call('/api/odds/snapshot', { loadControls: async () => { throw new Error('db down'); } });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'CONTROLS_UNAVAILABLE');
  assert.ok(!failed.raw.includes('db down'));
});

test('an upstream outage is a retryable 503 with no upstream detail; a held-over snapshot is marked stale', async t => {
  const down = await call('/api/odds/snapshot', { fetcher: fixtureFetcher(fixtureRecords(), { fail: () => true }) });
  assert.equal(down.status, 503);
  assert.deepEqual(down.body, { error: { code: 'UNAVAILABLE', message: 'The odds source is unavailable right now. Prices refresh automatically when it recovers.', retryable: true } });
  // A refresh that fails within ten minutes of a good snapshot serves that snapshot, marked stale.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let failing = false;
  const fetcher = fixtureFetcher(fixtureRecords(), { fail: () => failing }), provider = createTransitionProvider();
  assert.equal(decodeSnapshot((await call('/api/odds/snapshot', { fetcher, provider })).body).snapshot.meta.stale, false);
  failing = true;
  t.mock.timers.tick(61_000);
  await call('/api/odds/snapshot', { fetcher, provider });
  await new Promise(resolve => setTimeout(resolve, 400));
  t.mock.timers.tick(5_000);
  const held = decodeSnapshot((await call('/api/odds/snapshot', { fetcher, provider })).body).snapshot;
  assert.equal(held.meta.stale, true);
  assert.ok(held.quotes.length > 0);
});

test('holds and hedge pairs choose best prices among the member’s books', async () => {
  const everyBook = decodeSnapshot((await call('/api/odds/snapshot?include=holds,hedges')).body).snapshot;
  const two = decodeSnapshot((await call('/api/odds/snapshot?include=holds,hedges&books=DraftKings,FanDuel')).body).snapshot;
  const booksOf = (snapshot, ids) => ids.map(id => snapshot.quotes.find(quote => quote.id === id).book);
  assert.ok(everyBook.holds.some(row => booksOf(everyBook, row.quoteIds).some(book => !['DraftKings', 'FanDuel'].includes(book))));
  assert.ok(two.holds.length > 0 && two.holds.every(row => booksOf(two, row.quoteIds).every(book => ['DraftKings', 'FanDuel'].includes(book))));
  assert.ok(two.hedges.every(row => [row.promoQuoteId, ...row.hedges.map(hedge => hedge.quoteId)].every(id => ['DraftKings', 'FanDuel'].includes(two.quotes.find(quote => quote.id === id).book))));
});

test('DFS lines are sport-scoped, priced on the server with payout tables; missing apps are requested on their own', async () => {
  const urls = [];
  const base = fixtureFetcher(fixtureRecords(), { payouts: [...fixturePayouts(), { app: 'Underdog', payouts: { 2: { power: { multiplier: 3 } } } }] });
  const prop = (id, app, player, line, sport = 'nfl') => ({ id, app, sport, event: 'Fixture Falcons @ Fixture Saints', player, market: 'Rushing Yards', line, side: 'higher', ts: new Date().toISOString() });
  const fetcher = async (url, init) => {
    const target = new URL(url);
    if (target.pathname !== '/site/dfs/props') return base(url, init);
    urls.push(target.search);
    const app = target.searchParams.get('app');
    return new Response(JSON.stringify(!app ? [prop('a', 'PrizePicks', 'Fixture Runner 1', 60.5), prop('runner-2', 'PrizePicks', 'Fixture Runner 2', 65.5), prop('roster', 'Sleeper', 'Fixture Runner 1', 60.5), prop('baseball', 'PrizePicks', 'Fixture Runner 1', 60.5, 'mlb')]
      : app === 'Underdog' ? [prop('c', 'Underdog', 'Fixture Runner 1', 60.5), prop('underdog-2', 'Underdog', 'Fixture Runner 2', 65.5), prop('a', 'PrizePicks', 'Fixture Runner 1', 60.5), prop('extra-baseball', 'Underdog', 'Fixture Runner 1', 60.5, 'mlb')] : []), { status: 200 });
  };
  const result = await call('/api/odds/dfs?sport=NFL', { fetcher });
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store', 'DFS responses are never CDN-cached; the function cache handles warm requests');
  assert.deepEqual(urls, ['?sport=nfl', '?sport=nfl&app=Underdog'], 'the sport and missing app requests stay scoped');
  assert.deepEqual(Object.keys(result.body.payouts).sort(), ['PrizePicks', 'Underdog Fantasy']);
  assert.ok(result.body.picks.length > 0 && result.body.picks.every(pick => pick.sport === 'NFL'), 'the selected sport is the only one served');
  const one = await call('/api/odds/dfs?sport=NFL&limit=1', { fetcher });
  assert.equal(one.body.picks.length, 1);
  assert.ok(Number.isFinite(one.body.picks[0].probability), 'a low cap keeps a priced candidate, not an unpriced row');
  assert.equal(one.body.meta.truncated, true);
  const apps = new Set(result.body.picks.filter(pick => Number.isFinite(pick.probability)).map(pick => pick.app));
  const capped = await call(`/api/odds/dfs?sport=NFL&limit=${apps.size}`, { fetcher });
  assert.deepEqual(new Set(capped.body.picks.map(pick => pick.app)), apps, 'a cap shares its lines across the apps instead of filling with one');
  const runner = result.body.picks.filter(pick => pick.player === 'Fixture Runner 1' && pick.side === 'Over' && Number.isFinite(pick.probability));
  assert.ok(runner.length >= 2 && runner.every(pick => pick.probability > .5 && pick.probability < .55), JSON.stringify(runner.map(pick => [pick.app, pick.probability])));
  assert.ok(runner.every(pick => pick.fairOdds < 0 && pick.probabilityMethod === 'multiplicative'));
  // Every line says when it stops being current, as quotes do: the page never ages lines itself.
  assert.ok(result.body.picks.every(pick => ['open', 'stale', 'closed', 'suspended', 'unavailable'].includes(pick.status) && (pick.expiresAt === null || Number.isFinite(Date.parse(pick.expiresAt)))));
  assert.ok(runner.every(pick => pick.status === 'open' && Date.parse(pick.expiresAt) > Date.now()));
  const lines = await call(`/api/odds/dfs/price?lines=${encodeURIComponent(JSON.stringify([{ app: 'PrizePicks', sport: 'NFL', event: 'Fixture Falcons @ Fixture Saints', player: 'Fixture Runner 1', market: 'Rushing Yards', line: 60.5, side: 'Over' }, { app: 'PrizePicks', sport: 'NFL', event: 'Fixture Falcons @ Fixture Saints', player: 'Nobody', market: 'Rushing Yards', line: 60.5, side: 'Over' }]))}`, { fetcher: base });
  assert.equal(lines.status, 200);
  assert.ok(lines.body.lines[0].probability > .5);
  assert.equal(lines.body.lines[1].probability, null, 'no sportsbook market: unknown, not made up');
});

test('a failed cached feed section serves its last result briefly, then fails', async () => {
  const cache = createTimeToLiveCache(5, 20);
  assert.equal(await cache('props', async () => 'first'), 'first');
  await new Promise(resolve => setTimeout(resolve, 6));
  assert.equal(await cache('props', async () => { throw new Error('upstream down'); }), 'first');
  await new Promise(resolve => setTimeout(resolve, 21));
  await assert.rejects(cache('props', async () => { throw new Error('upstream down'); }), /upstream down/);
  assert.equal(await cache('props', async () => 'second'), 'second');
});

test('line history and prediction contracts come through the server, cleaned', async () => {
  const records = fixtureRecords(), now = Date.now();
  const history = [{ id: 'fx-1', ts: new Date(now - 600_000).toISOString(), odds: -120, line: '' }, { id: 'fx-1', ts: new Date(now - 300_000).toISOString(), odds: -115, line: '' }, { id: 'fx-1', ts: new Date(now - 299_500).toISOString(), odds: 250, line: '' }];
  const contracts = [{ platform: 'Kalshi', event: 'Will A win?', sport: 'nfl', yes_bid_cents: 40, yes_ask_cents: 44, volume: 900, ts: new Date().toISOString() },
    { platform: 'Kalshi', event: 'Crossed', yes_bid_cents: 60, yes_ask_cents: 40, ts: new Date().toISOString() },
    { platform: 'ProphetX', event: 'Twice', yes_bid_cents: 1, yes_ask_cents: 2, ts: new Date().toISOString() }, { platform: 'ProphetX', event: 'Twice', yes_bid_cents: 3, yes_ask_cents: 4, ts: new Date().toISOString() }];
  const fetcher = fixtureFetcher(records, { history, contracts }), provider = createTransitionProvider();
  const snapshot = decodeSnapshot((await call('/api/odds/snapshot', { fetcher, provider })).body).snapshot;
  const first = snapshot.quotes.find(quote => quote.book === 'Pinnacle' && quote.type === 'moneyline' && quote.side === 'home' && quote.event.includes('Saints'));
  const result = await call(`/api/odds/history?id=${encodeURIComponent(first.id)}&hours=12`, { fetcher, provider });
  assert.equal(result.status, 200);
  const own = result.body.series.find(series => series.quoteId === first.id);
  assert.deepEqual(own.points.map(point => point.odds), [-120, 250], 'a row followed within a second by another for the same id is a mixed-up copy (the later stands)');
  assert.ok(fetcher.calls.some(call => call.path === '/site/odds/history' && call.search.includes('hours=12')));
  const listed = (await call('/api/odds/contracts', { fetcher, provider })).body.contracts;
  assert.deepEqual(listed.map(item => item.event), ['Will A win?']);
});

test('ODDS_PROVIDER=odds-api passes the odds API’s answers through, validated and controlled', async () => {
  const env = { ODDS_PROVIDER: 'odds-api', ODDS_API_URL: 'http://127.0.0.1:7', ODDS_API_KEY: 'api-key' };
  const quote = (id, book) => ({ id, book, event: 'A @ B', side: 'home', odds: 120, ts: new Date().toISOString(), status: 'open', expiresAt: new Date(Date.now() + 60_000).toISOString(), sport: 'NFL', marketKey: 'k' });
  const answer = { contract: CONTRACT_ID, meta: { provenance: { provider: 'odds-api', engine: 'api', engineVersion: '9', generatedAt: new Date().toISOString() }, pricing: { devigMethod: 'shin', devigVersion: 'api-2' } },
    quotes: encodeTable([quote('a', 'FanDuel'), quote('b', 'Caesars')], QUOTE_DICTIONARY), pricing: [{ quoteId: 'a', fairProbability: .48, fairOdds: 108, ev: .056, plausible: true, devigMethod: 'shin', devigVersion: 'api-2' }, { quoteId: 'b', fairProbability: .5, ev: .1, plausible: true }] };
  const asked = [];
  let reply = () => new Response(JSON.stringify(answer), { status: 200 });
  const fetcher = async (url, init) => { asked.push({ path: new URL(url).pathname, key: init.headers['X-API-Key'] }); return reply(); };
  const controls = [{ scope: MARKET_CONTROL_SCOPE, kind: 'source', key: sourceControlKey('Caesars'), blocked: true }];
  const result = await call('/api/odds/snapshot', { env, fetcher, provider: null, loadControls: async () => controls });
  assert.equal(result.status, 200);
  assert.equal(result.headers['X-Odds-Provider'], 'odds-api');
  assert.deepEqual(asked, [{ path: '/v1/odds/snapshot', key: 'api-key' }]);
  const { snapshot } = decodeSnapshot(result.body);
  assert.deepEqual(snapshot.quotes.map(item => item.id), ['a'], 'blocked books never reach visitors, whatever the provider');
  assert.deepEqual(snapshot.pricing.map(row => [row.quoteId, row.devigMethod, row.devigVersion]), [['a', 'shin', 'api-2']], 'the API’s devig method and version are shown, never recomputed');
  assert.ok(!result.raw.includes('api-key'));
  reply = () => new Response('not json', { status: 200 });
  assert.equal((await call('/api/odds/snapshot', { env, fetcher, provider: null })).body.error.code, 'MALFORMED');
  reply = () => new Response(JSON.stringify({ quotes: [] }), { status: 200 });
  assert.equal((await call('/api/odds/snapshot', { env, fetcher, provider: null })).body.error.code, 'MALFORMED');
  reply = () => new Response('{}', { status: 401 });
  const refused = await call('/api/odds/snapshot', { env, fetcher, provider: null });
  assert.equal(refused.status, 502);
  assert.equal(refused.body.error.code, 'UNAUTHORIZED');
  reply = () => new Response('{}', { status: 429, headers: { 'Retry-After': '20' } });
  const limited = await call('/api/odds/snapshot', { env, fetcher, provider: null });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '20');
  const unset = await call('/api/odds/snapshot', { env: { ODDS_PROVIDER: 'odds-api' }, fetcher, provider: null });
  assert.equal(unset.status, 503);
  assert.equal(unset.body.error.code, 'NOT_CONFIGURED');
});

test('the default snapshot carries full-game markets; markets=all adds part-game lines, game props and yes/no player bets', async () => {
  const records = fixtureRecords(), moneyline = side => records.find(record => record.type === 'moneyline' && record.side === side && record.book === 'Pinnacle'), home = moneyline('home');
  const extra = [
    { ...home, id: 'part-home', period: '1h' }, { ...moneyline('away'), id: 'part-away', period: '1h' },
    { ...home, id: 'btts-yes', type: 'game-prop', market: 'Both Teams To Score', side: 'yes', selection_name: 'Yes', odds: -150 },
    { ...home, id: 'first-td', type: 'prop', market: 'First TD Scorer', player: 'Fixture Runner 1', side: 'yes', selection_name: 'Yes', odds: 600 },
  ];
  const fetcher = fixtureFetcher([...records, ...extra]), provider = createTransitionProvider();
  const scoped = async markets => decodeSnapshot((await call(`/api/odds/snapshot?include=pricing${markets ? `&markets=${markets}` : ''}`, { fetcher, provider })).body).snapshot;
  const main = await scoped(''), all = await scoped('all');
  const extras = quotes => quotes.filter(quote => quote.period !== 'full' || quote.type === 'game-prop' || quote.line === '' && quote.type === 'prop');
  assert.equal(extras(main.quotes).length, 0);
  assert.deepEqual(extras(all.quotes).map(quote => quote.displayMarket).sort(), ['1st Half Moneyline', '1st Half Moneyline', 'Both Teams To Score', 'First TD Scorer']);
  assert.equal(all.quotes.length, main.quotes.length + 4);
  assert.ok(main.pricing.every(row => main.quotes.some(quote => quote.id === row.quoteId)), 'pricing rows only name quotes the answer carries');
  // More markets is priced one sport at a time as its answer is written; another answer gets the same rows.
  const again = decodeSnapshot((await call('/api/odds/snapshot?include=pricing,markets&markets=all', { fetcher, provider })).body).snapshot;
  assert.deepEqual(again.pricing.map(row => row.quoteId).sort(), all.pricing.map(row => row.quoteId).sort());
  assert.ok(again.markets.length > 0);
  assert.equal((await call('/api/odds/snapshot?markets=every', { fetcher, provider })).status, 400);
});

test('a time-to-live cache keeps at most its entry limit, dropping the least recently loaded', async () => {
  const cache = createTimeToLiveCache(60_000, 0, 0, 2);
  let loads = 0;
  const load = value => () => { loads += 1; return value; };
  await cache('a', load('a')); await cache('b', load('b')); await cache('c', load('c'));
  assert.equal(await cache('c', load('c2')), 'c');
  assert.equal(await cache('b', load('b2')), 'b');
  assert.equal(await cache('a', load('a2')), 'a2', 'the oldest key was dropped');
  assert.equal(loads, 4);
});

test('the engine thread’s heap is 60% of the function’s memory, between 512 MB and 4 GB, unless set', async () => {
  const { engineHeapMb } = await import('../lib/odds/providers.mjs');
  const mb = n => n * 1_048_576;
  assert.equal(engineHeapMb({}, mb(2048), 0), 1229);
  assert.equal(engineHeapMb({}, mb(65536), mb(2048)), 1229, 'a container limit wins over the machine');
  assert.equal(engineHeapMb({}, mb(512), 0), 512);
  assert.equal(engineHeapMb({}, mb(65536), 0), 4096);
  assert.equal(engineHeapMb({ ODDS_ENGINE_HEAP_MB: '1500' }, mb(2048), 0), 1500);
});
