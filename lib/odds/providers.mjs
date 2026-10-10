// Where /api/odds gets its data. Two providers answer in the same contract (lib/odds/contract.d.ts):
//
//   website-transition  (default) the quote feed through the site's proxy (lib/ev-api-proxy.mjs: shared
//                       inventory, market distribution controls) → normalize.mjs → engine.mjs.
//   odds-api            ODDS_PROVIDER=odds-api: the odds/analytics API returns the prices and analytics
//                       already computed (ODDS_API_URL, ODDS_API_KEY; server only). Its answers are validated
//                       (public/odds-contract.js) and the distribution controls still apply.
//
// Either way the browser receives finished values; switching providers changes nothing in the frontend.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { readControlledInventory, readControlledSportInventory, readSiteDataset, parseEvApiConfig } from '../ev-api-proxy.mjs';
import { filterMarketRecords, MARKET_CONTROL_SCOPE } from '../admin-market-controls.mjs';
import { normalizeFeed, normalizeDfsRecords, underdogFiftyFifty, payoutTables, createDfsPricer, dfsPicks, propMarket } from './normalize.mjs';
import { analyzeSnapshot, pricingApplied, expiresAt, quoteStatus, ENGINE, ENGINE_VERSION } from './engine.mjs';
import { CONTRACT_ID, SECTIONS, OddsError, preferencesKey, encodePreferences, decodeSnapshot, pricingSettings, encodeTable, QUOTE_DICTIONARY, PRICING_DICTIONARY } from '../../public/odds-contract.js';
import { implied, probabilityToAmerican, decimalToAmerican } from '../../public/betting-math.js';
import { marketIdentity } from '../../public/market-identity.js';
import { canonicalPlatform } from '../../public/platform-catalog.js';
import { knownSport } from '../../public/sport-names.js';

// A priced snapshot is reused for this long before the next request reprices the latest feed. Prices
// age by up to this much more than the feed itself; live prices stay current for 90 s.
const BUILD_TTL_MS = 4_000;
// A response is outdated (shown as stale by the page) this long after the prices were fetched.
const STALE_AFTER_MS = 60_000;
const DFS_PROPS_TTL_MS = 60_000, DFS_FEED_TTL_MS = 60_000, DFS_PRICED_TTL_MS = 60_000, PAYOUTS_TTL_MS = 3_600_000, HISTORY_TTL_MS = 60_000, CONTRACTS_TTL_MS = 60_000;
const STALE_IF_ERROR_MS = 15_000;
// Priced boards kept at once (one per pricing settings, the least recently built going first). Each is
// the whole board priced (~250 MB of analysis, or ~41k priced DFS lines) and holds the feed it priced:
// keyed by build, the DFS cache kept 64 of them, one per minute, and the engine thread ran out of memory.
const MAX_PRICED_BOARDS = 3;
const iso = ms => new Date(ms).toISOString();

// ---- Shared helpers ----

/** Single flight with a time-to-live; after a real failure, the last result is served only briefly.
 * With staleWhileRevalidateMs, an expired entry is served immediately while a refresh runs in the
 * background — the cache never goes cold after its first successful load. At most maxEntries keys are
 * kept, the least recently loaded going first. */
export function createTimeToLiveCache(ttl, staleIfErrorMs = STALE_IF_ERROR_MS, staleWhileRevalidateMs = 0, maxEntries = 64) {
  const entries = new Map();
  const cache = (key, load) => {
    const entry = entries.get(key);
    const now = Date.now();
    if (entry && entry.at !== null && now - entry.at < ttl) return entry.promise;
    // Stale-while-revalidate: serve the last good value and start a background refresh.
    if (staleWhileRevalidateMs > 0 && entry?.lastGood !== undefined && entry?.lastGoodAt && now - entry.lastGoodAt < staleWhileRevalidateMs) {
      if (!entry.refreshing) {
        entry.refreshing = true;
        Promise.resolve().then(load).then(value => {
          entry.at = Date.now();
          entry.lastGood = value;
          entry.lastGoodAt = entry.at;
          entry.promise = Promise.resolve(value);
          entry.refreshing = false;
        }, () => { entry.refreshing = false; });
      }
      return Promise.resolve(entry.lastGood);
    }
    if (entry && entry.at === null && now < entry.staleUntil) return entry.promise;
    const record = { at: null, staleUntil: 0, promise: null, lastGood: entry?.lastGood, lastGoodAt: entry?.lastGoodAt || 0 };
    record.promise = Promise.resolve().then(load).then(value => {
      record.at = Date.now();
      record.lastGood = value;
      record.lastGoodAt = record.at;
      return value;
    }, error => {
      const failedAt = Date.now();
      if (record.lastGood !== undefined && record.lastGoodAt && failedAt - record.lastGoodAt <= staleIfErrorMs) {
        record.staleUntil = record.lastGoodAt + staleIfErrorMs;
        return record.lastGood;
      }
      if (entries.get(key) === record) entries.delete(key);
      throw error;
    });
    entries.delete(key); entries.set(key, record);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return record.promise;
  };
  cache.clear = () => entries.clear();
  return cache;
}
/**
 * The last answer to each request, served at once while the next one is computed (stale-while-
 * revalidate). After the quote board refreshes, the engine thread spends 10-30 s re-normalizing and
 * re-pricing it, and every request would queue behind that; with this, only a request nobody has made
 * in `staleMs` waits. An answer younger than `freshMs` is served without asking again. Large answers
 * ("More markets" is ~70 MB of text, every DFS line ~56 MB) are bounded by `maxChars` in total.
 */
export function createAnswerCache({ freshMs = 2_000, staleMs = 60_000, maxEntries = 12, maxChars = 160_000_000, now = Date.now } = {}) {
  const answers = new Map();
  const store = (key, text) => {
    answers.delete(key);
    answers.set(key, { text, at: now(), refreshing: false });
    let chars = 0;
    for (const entry of answers.values()) chars += entry.text.length;
    for (const [oldest, entry] of answers) {
      if (answers.size <= 1 || (answers.size <= maxEntries && chars <= maxChars)) break;
      chars -= entry.text.length; answers.delete(oldest);
    }
    return text;
  };
  return async (key, load) => {
    const entry = answers.get(key), age = entry ? now() - entry.at : Infinity;
    if (!entry || age >= staleMs) return store(key, await load());
    if (age >= freshMs && !entry.refreshing) {
      entry.refreshing = true;
      // A failed refresh keeps the last answer until it is too old to serve.
      Promise.resolve().then(load).then(text => { if (answers.get(key) === entry) store(key, text); }, () => {}).finally(() => { entry.refreshing = false; });
    }
    return entry.text;
  };
}

// The page's default snapshot carries full-game lines and Over/Under player props (anytime TD as Over 0.5
// TDs among them). Part-game lines, game props (team totals, both teams to score ...) and yes/no player bets
// (first scorer, to be carded) are twice as many prices again, so they travel, and are priced into the
// sections, only when asked for (markets=all, or one game's markets); DFS lines use them either way.
export const MARKET_SCOPES = ['main', 'all'];
// Every DFS line fits one answer: 89k lines on 10 Oct 2026 with the unpriced ones (PrizePicks 18.8k,
// Underdog 9.5k). The 5,000 cap before showed the board one line in seven, and 60,000 cut unpriced lines.
export const MAX_DFS_PICKS = 150_000;
const marketsOf = value => { const scope = String(value ?? '').trim().toLowerCase() || 'main'; if (!MARKET_SCOPES.includes(scope)) throw new OddsError('BAD_REQUEST', 'Unknown market scope.'); return scope; };
export const mainMarket = quote => quote.scope !== 'more' && quote.type !== 'game-prop' && String(quote.period || 'full').toLowerCase() === 'full' && !(quote.type === 'prop' && (quote.line === '' || quote.line == null));
const scopeOf = sport => { const known = knownSport(sport); if (sport && !known) throw new OddsError('BAD_REQUEST', 'Unknown sport.'); return known || ''; };
// The books a member can bet (their state's sportsbooks), or null for every book.
const booksOf = books => Array.isArray(books) && books.length ? new Set(books.map(book => canonicalPlatform(book))) : null;
const sectionsOf = include => {
  const wanted = [...new Set((Array.isArray(include) ? include : String(include || '').split(',')).map(item => String(item).trim()).filter(Boolean))];
  for (const item of wanted) if (!SECTIONS.includes(item) && item !== 'events') throw new OddsError('BAD_REQUEST', `Unknown section: ${item}.`);
  return wanted;
};

/** Events (games) present in a list of quotes. */
function eventsOf(quotes) {
  const events = new Map();
  for (const quote of quotes) {
    const prior = events.get(quote.eventId);
    if (!prior) events.set(quote.eventId, { id: quote.eventId, sport: quote.sport, league: quote.league || quote.sport, name: quote.event, displayName: quote.displayEvent || quote.event, startTime: quote.startTime || null, live: Boolean(quote.live), quoteCount: 1 });
    else { prior.quoteCount += 1; prior.live ||= Boolean(quote.live); }
  }
  return [...events.values()].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || a.displayName.localeCompare(b.displayName));
}

// Every record that names a quote id must name one still in the response.
function sectionRecordsIn(section, records, ids) {
  const keep = {
    pricing: row => ids.has(row.quoteId),
    markets: () => true,
    arbitrage: row => row.legs.every(leg => ids.has(leg.quoteId)),
    middles: row => ids.has(row.firstQuoteId) && ids.has(row.secondQuoteId),
    holds: row => row.quoteIds.every(id => ids.has(id)),
    sharp: row => ids.has(row.exchangeQuoteId) && ids.has(row.sportsbookQuoteId),
    hedges: row => ids.has(row.promoQuoteId),
  }[section];
  const kept = records.filter(keep);
  return section === 'hedges' ? kept.map(row => ({ ...row, hedges: row.hedges.filter(hedge => ids.has(hedge.quoteId)) })).filter(row => row.hedges.length) : kept;
}

// ---- Transition provider: the website prices the quote feed itself (server side) ----

function transitionProvider() {
  const normalized = new WeakMap();
  const builds = new Map();
  const bodies = new Map();
  let buildCount = 0;
  let dfsBuildCount = 0;
  const dfsPricer = createDfsPricer();
  let pricerSource = null, pricerMainLines = null, pricerProps = null;
  // The DFS caches use stale-while-revalidate: once built, the last good result is always served
  // (up to 10 minutes) while a refresh runs in the background. The 143 MB upstream inventory
  // takes 23+ seconds to download; without SWR, every 60-second TTL expiry produced a cold
  // start where the DFS board lost its sportsbook pricing.
  const DFS_STALE_WHILE_REVALIDATE_MS = 10 * 60_000;
  const DFS_EXTRA_WAIT_MS = 10_000, DFS_RELAY_RETRY_MS = 2 * 60_000;
  let dfsRelaySlowAt = 0;
  const props = createTimeToLiveCache(DFS_PROPS_TTL_MS, STALE_IF_ERROR_MS, DFS_STALE_WHILE_REVALIDATE_MS), dfsFeeds = createTimeToLiveCache(DFS_FEED_TTL_MS, STALE_IF_ERROR_MS, DFS_STALE_WHILE_REVALIDATE_MS), payouts = createTimeToLiveCache(PAYOUTS_TTL_MS), dfsPriced = createTimeToLiveCache(DFS_PRICED_TTL_MS, STALE_IF_ERROR_MS, DFS_STALE_WHILE_REVALIDATE_MS, MAX_PRICED_BOARDS), histories = createTimeToLiveCache(HISTORY_TTL_MS);

  // A new board is priced beside nothing older: everything priced from the last one (builds, response
  // bodies, the DFS pricer and priced lines) is let go first. Holding both while the new one was priced
  // doubled the thread's memory at every refresh, past what a 2 GB function has (10 Oct 2026). Requests
  // meanwhile are answered from the last responses (createAnswerCache, on the main thread).
  let pricedSnapshot = null;
  function releaseOlderBoards(snapshot) {
    if (pricedSnapshot === snapshot) return;
    pricedSnapshot = snapshot;
    for (const [key, entry] of builds) if (entry.at !== null) builds.delete(key);
    bodies.clear(); dfsFeeds.clear(); dfsPriced.clear();
    dfsPricer.setQuotes({}); pricerSource = null; pricerMainLines = null;
  }

  // Normalization depends only on the distributed records, so every pricing preference shares it.
  // Kept per control set, so the snapshot's lines (rebuilt from its compact table) are read only to price
  // it the first time. The whole board's is kept for its latest snapshot only: an older snapshot object can
  // outlive its turn (the merge keeps one per main-feed snapshot, and the held main snapshot gets a stale
  // copy after 3 minutes), and keeping its priced lines (~250 MB) beside the new ones ran the engine thread
  // out of memory (10 Oct 2026).
  let latest = null;
  function normalizedFor(inventory, { scoped = false } = {}) {
    const { snapshot, controlsKey = '' } = inventory;
    let byControls;
    if (scoped) {
      byControls = normalized.get(snapshot);
      if (!byControls) { byControls = new Map(); normalized.set(snapshot, byControls); }
    } else {
      if (latest?.snapshot !== snapshot) latest = { snapshot, byControls: new Map() };
      byControls = latest.byControls;
    }
    let result = byControls.get(controlsKey);
    if (!result) {
      if (!scoped) releaseOlderBoards(snapshot);
      const records = inventory.records;
      result = normalizeFeed(records, { syncedAt: iso(snapshot.at), price: false });
      result.byId = new Map(result.quotes.map(quote => [quote.id, quote]));
      result.recordCount = records.length;
      byControls.set(controlsKey, result);
    }
    return result;
  }

  /**
   * The priced snapshot for one control state and set of pricing settings, shared by every request
   * that asks within BUILD_TTL_MS (one build at a time per key). Controls are read for every request.
   */
  // The analysis covers the main markets unless `markets` is 'all': part-game lines, game props and
  // yes/no bets are two thirds of the quotes (210k of 320k on 10 Oct 2026) and pricing them all tripled the
  // analysis (78 → 245 MB), more than a 2 GB function holds beside the rest. They are priced when a page
  // asks for them (More markets, one game's markets); DFS lines are priced from the whole feed either way.
  async function build(context, prefs, sport = '', markets = 'main') {
    const inventory = sport ? await readControlledSportInventory({ ...context, sport }) : await readControlledInventory(context);
    const key = `${inventory.controlsKey}|${preferencesKey(prefs)}|${sport}|${markets}`, entry = builds.get(key);
    if (entry && (entry.at === null || Date.now() - entry.at < BUILD_TTL_MS)) return entry.promise;
    const record = { at: null, promise: null };
    record.promise = Promise.resolve().then(() => {
      const feed = normalizedFor(inventory, { scoped: Boolean(sport) });
      const quotes = markets === 'all' ? feed.quotes : (feed.mainQuotes ??= feed.quotes.filter(mainMarket));
      // Every market is priced while its answer is written, one sport at a time (allMarketsBody).
      const now = Date.now(), analysis = markets === 'all' ? null : analyzeSnapshot(quotes, prefs, { now });
      record.at = Date.now();
      return { id: ++buildCount, at: now, inventory, feed, quotes, prefs, analysis };
    });
    record.promise.catch(() => { if (builds.get(key) === record) builds.delete(key); });
    builds.delete(key); builds.set(key, record);
    while (builds.size > MAX_PRICED_BOARDS) builds.delete(builds.keys().next().value);
    return record.promise;
  }

  // DFS does not need the full +EV/arb/hedge analysis. A lightweight normalized feed starts beside
  // the props and payout downloads, then is reused: a cold all-sport build can otherwise spend more
  // than a serverless request timeout before the first pick is priced.
  async function dfsBuild(context, sport = '') {
    let blocked = '';
    if (typeof context.loadControls === 'function') {
      const controls = await context.loadControls();
      blocked = controls.filter(control => control.scope === MARKET_CONTROL_SCOPE && control.blocked).map(control => `${control.kind}:${control.key}`).sort().join('|');
    }
    return dfsFeeds(`dfs|${blocked}|${sport}`, async () => {
      const inventory = sport ? await readControlledSportInventory({ ...context, sport }) : await readControlledInventory(context);
      // The snapshot's normalized feed when it has one for these records (normalizing the board takes 10+ s).
      return { id: ++dfsBuildCount, at: Date.now(), inventory, feed: normalizedFor(inventory, { scoped: Boolean(sport) }) };
    });
  }

  function meta(built, { sport, warnings = [], pricing = built.analysis?.applied, quoteCount }) {
    const { snapshot, controlled } = built.inventory;
    return {
      provenance: { provider: 'website-transition', engine: ENGINE, engineVersion: ENGINE_VERSION, generatedAt: iso(built.at) },
      pricing, snapshotAt: iso(snapshot.at), staleAfter: iso(snapshot.at + STALE_AFTER_MS),
      stale: Boolean(snapshot.stale), warmingUp: Boolean(snapshot.warmingUp), partial: warnings.length > 0, warnings,
      scope: { sport: sport || null }, controlsApplied: controlled,
      counts: { records: built.feed.recordCount, quotes: quoteCount, skipped: built.feed.skipped, dropped: snapshot.dropped || 0 },
    };
  }

  /** Metadata for read-only feeds that do not need the quote pricing build. */
  function readOnlyMeta(context, records, warnings = []) {
    const now = Date.now();
    return {
      provenance: { provider: 'website-transition', engine: ENGINE, engineVersion: ENGINE_VERSION, generatedAt: iso(now) },
      pricing: pricingApplied(defaultPrefs()), snapshotAt: iso(now), staleAfter: iso(now + STALE_AFTER_MS),
      stale: false, warmingUp: false, partial: warnings.length > 0, warnings, scope: { sport: null },
      controlsApplied: typeof context.loadControls === 'function',
      counts: { records: records.length, quotes: 0, skipped: {}, dropped: 0 },
    };
  }
  // The feed record id is the server's (for line history); the page gets the selection's stable id.
  // A series id equal to the quote's own id is left out (the page reads it as the id).
  const quoteOut = (quote, fields) => { const { feedId, seriesId, ...rest } = quote; return { ...rest, ...(seriesId && seriesId !== quote.id ? { seriesId } : {}), ...fields }; };

  function body(built, { sections, sport, quotes, sectionRows, warnings, books = null, records = null, pricing }) {
    // Comparison-only prices stay on the server (DFS reads them there); the page's tools list current prices.
    quotes = quotes.filter(quote => !quote.depthOnly);
    const ids = new Set(quotes.map(quote => quote.id));
    records ??= quotes.map(quote => quoteOut(quote, built.analysis.fields(quote)));
    // The long lists travel as tables (public/odds-contract.js encodeTable): about a quarter of the JSON.
    const out = { contract: CONTRACT_ID, meta: meta(built, { sport, warnings, pricing, quoteCount: quotes.length }), quotes: encodeTable(records, QUOTE_DICTIONARY) };
    const quoteRow = { table: 'quotes', rows: new Map(records.map((quote, row) => [quote.id, row])) };
    if (sections.includes('events')) out.events = eventsOf(quotes);
    // Market rows only for the markets whose prices the answer carries (one sport, or the main markets).
    const keys = !sectionRows?.markets ? new Set(records.map(quote => quote.marketKey)) : null;
    for (const section of sections) {
      if (section === 'events') continue;
      const rows = sectionRows?.[section] ?? built.analysis.section(section, { books });
      const kept = section === 'markets' ? (keys ? rows.filter(row => keys.has(row.key)) : rows) : sectionRecordsIn(section, rows, ids);
      out[section] = section === 'pricing' ? encodeTable(kept, PRICING_DICTIONARY, { quoteId: quoteRow }) : section === 'hedges' ? encodeTable(kept, [], { promoQuoteId: quoteRow }) : section === 'markets' ? encodeTable(kept) : kept;
    }
    return out;
  }

  // More markets (every market, 320k prices on 10 Oct 2026) is priced one sport at a time: no market, arb,
  // middle or hedge spans two sports, so the rows are the same, and only one sport's analysis is held at
  // once. Analysing them all together peaked past the engine thread's heap in a 2 GB function. The lists
  // the engine sorts are sorted again across sports.
  const SECTION_ORDER = { pricing: (a, b) => b.ev - a.ev, arbitrage: (a, b) => b.margin - a.margin, holds: (a, b) => a.hold - b.hold };
  function allMarketsBody(built, { sections, sport, quotes, books }) {
    const bySport = new Map();
    for (const quote of quotes) { const key = quote.sport ?? ''; if (!bySport.has(key)) bySport.set(key, []); bySport.get(key).push(quote); }
    const records = [], sectionRows = Object.fromEntries(sections.filter(section => section !== 'events').map(section => [section, []]));
    for (const group of bySport.values()) {
      const analysis = analyzeSnapshot(group, built.prefs, { now: built.at });
      const shown = group.filter(quote => !quote.depthOnly), ids = new Set(shown.map(quote => quote.id)), keys = new Set();
      for (const quote of shown) { const fields = analysis.fields(quote); keys.add(fields.marketKey); records.push(quoteOut(quote, fields)); }
      for (const [section, rows] of Object.entries(sectionRows)) {
        const list = analysis.section(section, { books });
        for (const row of section === 'markets' ? list.filter(row => keys.has(row.key)) : sectionRecordsIn(section, list, ids)) rows.push(row);
      }
    }
    for (const [section, order] of Object.entries(SECTION_ORDER)) sectionRows[section]?.sort(order);
    return body(built, { sections, sport, quotes, books, records, sectionRows, pricing: pricingApplied(built.prefs) });
  }

  return {
    id: 'website-transition',
    /** Every current price plus the requested sections, as a JSON string (cached per build). */
    async snapshot(context, { prefs, include, sport, books, markets }) {
      const sections = sectionsOf(include), scope = scopeOf(sport), wanted = marketsOf(markets), built = await build(context, prefs, scope, wanted), offered = booksOf(books);
      const key = `${built.id}|${sections.join(',')}|${scope}|${wanted}|${offered ? [...offered].sort().join(',') : ''}`;
      if (!bodies.has(key)) {
        const quotes = built.quotes.filter(quote => !scope || quote.sport === scope);
        bodies.set(key, JSON.stringify((wanted === 'all' ? allMarketsBody : body)(built, { sections, sport: scope, quotes, books: offered })));
        if (bodies.size > 2) bodies.delete(bodies.keys().next().value);
      }
      return bodies.get(key);
    },
    /** One section with only the quotes it names (getEV, getArbitrage, …). */
    async section(context, { prefs, section, sport, live, minEv, limit, books }) {
      if (!SECTIONS.includes(section)) throw new OddsError('NOT_FOUND');
      const scope = scopeOf(sport), built = await build(context, prefs, scope), byId = built.feed.byId;
      const inScope = id => { const quote = byId.get(id); return quote && (!scope || quote.sport === scope) && (live == null || Boolean(quote.live) === live); };
      let rows = built.analysis.section(section, { books: booksOf(books) });
      if (section === 'markets') {
        const keys = new Set(built.quotes.filter(quote => inScope(quote.id)).map(quote => built.analysis.fields(quote).marketKey));
        rows = rows.filter(row => keys.has(row.key));
      } else if (section === 'pricing') {
        // The +EV board: positive, plausible prices, highest EV first.
        rows = rows.filter(row => row.plausible && row.ev > (Number.isFinite(minEv) ? minEv : 0) && inScope(row.quoteId)).sort((a, b) => b.ev - a.ev);
      } else {
        const named = row => [row.quoteId, row.firstQuoteId, row.secondQuoteId, row.exchangeQuoteId, row.sportsbookQuoteId, row.promoQuoteId, ...(row.quoteIds || []), ...(row.legs || []).map(leg => leg.quoteId)].filter(Boolean);
        rows = rows.filter(row => named(row).every(inScope));
      }
      rows = rows.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 2000));
      const wanted = new Set(rows.flatMap(row => [row.quoteId, row.firstQuoteId, row.secondQuoteId, row.exchangeQuoteId, row.oppositeExchangeQuoteId, row.sportsbookQuoteId, row.promoQuoteId, ...(row.quoteIds || []), ...(row.legs || []).map(leg => leg.quoteId), ...(row.hedges || []).map(hedge => hedge.quoteId)].filter(Boolean)));
      const quotes = section === 'markets' ? [] : [...wanted].map(id => byId.get(id)).filter(Boolean);
      return JSON.stringify(body(built, { sections: [section], sport: scope, quotes, sectionRows: { [section]: rows } }));
    },
    /** Events with their prices and market summaries (getEvents, getMarkets/getOdds for one event). */
    async events(context, { prefs, sport, event }) {
      const scope = scopeOf(sport), built = await build(context, prefs, scope);
      if (!event) return JSON.stringify({ ...body(built, { sections: [], sport: scope, quotes: [] }), events: eventsOf(scope ? built.feed.quotes.filter(quote => quote.sport === scope) : built.feed.quotes) });
      const quotes = built.feed.quotes.filter(quote => quote.eventId === event && (!scope || quote.sport === scope));
      if (!quotes.length) throw new OddsError('NOT_FOUND', 'No prices for that event.');
      // Every market of one game, priced on their own: a market is priced from its own quotes only.
      const game = { ...built, quotes, analysis: analyzeSnapshot(quotes, prefs, { now: built.at }) };
      return JSON.stringify(body(game, { sections: ['events', 'pricing', 'markets'], sport: scope, quotes }));
    },
    /** DFS (pick'em) lines priced against the sportsbooks, with each app's payout tables. */
    async dfs(context, { prefs, limit = 500, sport = '' }) {
      const scope = scopeOf(sport), warnings = [];
      const payoutPromise = payouts('payouts', async () => { const records = await readSiteDataset('/site/dfs/payouts', {}, context); return { tables: payoutTables(records), apps: (Array.isArray(records) ? records : []).map(entry => entry?.app).filter(app => typeof app === 'string' && app) }; })
        .catch(() => { warnings.push('Payout tables are unavailable.'); return { tables: {}, apps: [] }; });
      // The full quote inventory is ~143 MB from the VPS and takes 23-33 seconds on a cold
      // start. The DFS endpoint waits for it: the first request is slow but returns the full
      // weighted book consensus. Subsequent requests within the stale-while-revalidate window
      // (10 minutes) are served instantly from the last good build while a refresh runs in
      // the background. The race-timeout approach always fired before the build completed,
      // so the cache never had a good first result to serve.
      const builtPromise = dfsBuild(context, scope).catch(() => null);
      const linesPromise = props(`props|${scope}`, () => loadProps(context, payoutPromise, scope)).catch(() => null);
      const smartstakePromise = props(`smartstake-fantasy|${scope}`, async () => {
        const records = await Promise.race([
          readSiteDataset('/site/smartstake/datasets/fantasy', {}, context),
          new Promise(resolve => setTimeout(() => resolve(null), 5_000)),
        ]).catch(() => null);
        return Array.isArray(records) ? records : records?.records || [];
      }).catch(() => []);
      const mainLinesPromise = props(`smartstake-main-lines|${scope}`, async () => {
        const payload = await Promise.race([
          readSiteDataset('/site/smartstake/datasets/fantasy-main-lines', {}, context),
          new Promise(resolve => setTimeout(() => resolve(null), 10_000)),
        ]).catch(() => null);
        return Array.isArray(payload) ? payload : payload?.records || [];
      }).catch(() => []);
      // When the quote snapshot already carries pick'em lines (SportWizzard's), the relay's props and payout
      // feeds get DFS_EXTRA_WAIT_MS more: a stalled relay took 45 s a request on 9 Oct 2026. Their fetches
      // keep running and fill the cache for the next request.
      const built = await builtPromise;
      // After a relay timeout the next requests for DFS_RELAY_RETRY_MS don't wait at all (a cached answer still wins).
      const waitBriefly = (promise, fallback) => {
        if (!built?.feed?.picks?.length) return promise;
        let timer;
        const wait = Date.now() - dfsRelaySlowAt < DFS_RELAY_RETRY_MS ? 0 : DFS_EXTRA_WAIT_MS;
        return Promise.race([promise.finally(() => clearTimeout(timer)), new Promise(resolve => { timer = setTimeout(() => { dfsRelaySlowAt = Date.now(); resolve(fallback()); }, wait); timer.unref?.(); })]);
      };
      const [payout, lines, smartstake, mainLines] = await Promise.all([
        waitBriefly(payoutPromise, () => { warnings.push('Payout tables are unavailable.'); return { tables: {}, apps: [] }; }),
        waitBriefly(linesPromise, () => null), smartstakePromise, mainLinesPromise,
      ]);
      // The payout records name each app as the props feed does ("Underdog"), so those names ask for missing apps.
      const tables = payout.tables;
      if (!lines) warnings.push('The DFS props feed is unavailable; lines from the quote snapshot are shown.');
      const key = `${built?.id ?? 'no-build'}|${lines?.at ?? 'none'}|ml:${mainLines.length}|${preferencesKey(prefs)}`;
      const picks = await dfsPriced(key, () => {
        const feed = built ? (scope ? { ...built.feed, quotes: built.feed.quotes.filter(quote => quote.sport === scope) } : built.feed) : { quotes: [], names: new Map(), skipped: {} };
        const sportName = { nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB', ncaaf: 'NCAAF', wnba: 'WNBA' };
        const mainLineQuotes = mainLines.map((row, index) => {
          if (!row || typeof row.odds !== 'number' || row.odds <= 1.01) return null;
          const book = String(row.bookmaker || '').trim();
          const player = String(row.playerName || '').trim();
          const side = String(row.selectionLine || '').toLowerCase();
          const line = Number(row.selectionPoints);
          if (!book || !player || !['over', 'under'].includes(side) || !Number.isFinite(line)) return null;
          const event = `${String(row.awayCompetitor || '').trim()} @ ${String(row.homeCompetitor || '').trim()}`;
          const sport = sportName[String(row.sport || row.league || '').toLowerCase()] || 'Other';
          const ts = row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString();
          const marketSlug = String(row.middleKey || '').split('~')[2] || '';
          const marketText = marketSlug.replace(/^(football|basketball|hockey|baseball|soccer)_player_/, '').replace(/_/g, ' ').trim();
          return {
            id: `ss-ml:${index}`, book, player, line, side,
            odds: decimalToAmerican(row.odds),
            market: marketText.replace(/\b\w/g, c => c.toUpperCase()),
            sport, event, eventId: `${sport}:${event.toLowerCase()}`,
            startTime: row.startDate || '', ts, live: false, period: 'full',
          };
        }).filter(Boolean);
        // The feed is shared with the snapshot builds, so the main lines join a copy of its list.
        if (pricerSource !== feed || pricerMainLines !== mainLines) {
          dfsPricer.setQuotes(mainLineQuotes.length ? { ...feed, quotes: [...feed.quotes, ...mainLineQuotes] } : feed);
          pricerSource = feed; pricerMainLines = mainLines;
        }
        if (pricerProps !== lines) { dfsPricer.setProps(lines?.picks || []); pricerProps = lines; }
        const now = Date.now();
        // Each line says when it stops being current (the member's price ages), as quotes do.
        const priced = dfsPricer.price(prefs.devigMethod, { now, force: true, minBooks: prefs.minSharpBooks, maxVigPercent: prefs.maxVigPercent });
        const applyFallback = picks => picks.map(pick => {
          if (Number.isFinite(pick.probability)) return pick;
          const player = String(pick.player || '').trim().toLowerCase();
          const market = propMarket(String(pick.market || ''), pick.player || '').replace(/\s*\+\s*/g, '+');
          const side = String(pick.side || '').trim().toLowerCase() === 'under' ? 'under' : 'over';
          const pickSport = String(pick.sport || '').trim().toUpperCase(); const probability = fallback?.get(`${player}|${market}|${Number(pick.line)}|${side}|${pickSport}`);
          return Number.isFinite(probability) ? { ...pick, probability, fairOdds: probabilityToAmerican(probability), probabilityMethod: 'smartstake', probabilityBooks: ['SmartStake'] } : pick;
        });
        const fallback = new Map();
        if (smartstake.length) {
          for (const row of smartstake) {
            if (typeof row?.trueProbability !== 'number' || !(row.trueProbability > 0) || row.trueProbability >= 1) continue;
            const player = String(row.playerName || '').trim().toLowerCase();
          const market = propMarket(String(row.market || ''), row.playerName || '').replace(/\s*\+\s*/g, '+');
            const side = String(row.selectionLine || '').trim().toLowerCase();
            const line = Number(row.selectionPoints);
            if (!player || !market || !side || !Number.isFinite(line)) continue;
            const fallbackSport = String(row.league || '').trim().toUpperCase(); fallback.set(`${player}|${market}|${line}|${side}|${fallbackSport}`, row.trueProbability);
          }
        }
        return applyFallback(priced).map(pick => ({ ...pick, expiresAt: expiresAt(pick, prefs), status: quoteStatus(pick, prefs, now) }));
      });
      const capped = Array.isArray(limit) ? 500 : Math.min(Math.max(Number(limit) || 500, 1), MAX_DFS_PICKS);
      // Every app's line is listed, priced or not: dropping lines no sportsbook prices left 4,859 of PrizePicks'
      // 18,749 (every demon and goblin a book has no line at, and stats books don't post, 10 Oct 2026). The
      // page marks them "No fair probability"; priced lines come first below.
      const scoped = scope ? picks.filter(pick => pick.sport === scope) : picks;
      // A cap must never hide the only priced candidates behind thousands of unpriced rows.
      const byProbability = [...scoped].sort((left, right) => {
        const leftValue = Number.isFinite(left.probability) ? left.probability : -1;
        const rightValue = Number.isFinite(right.probability) ? right.probability : -1;
        return rightValue - leftValue;
      });
      // Nor hide a whole app: per-pick apps (Sleeper, Chalkboard) list every heavy favourite, which filled the
      // top 500 by probability and left PrizePicks with no lines on 9 Oct 2026. The apps take turns, each in
      // probability order, priced lines before unpriced ones.
      const rankInApp = new Map(), turns = new Map();
      for (const pick of byProbability) {
        const group = `${Number.isFinite(pick.probability) ? 0 : 1}|${pick.app}`;
        const turn = rankInApp.get(group) || 0;
        rankInApp.set(group, turn + 1); turns.set(pick, turn);
      }
      const ranked = byProbability.map((pick, index) => ({ pick, index })).sort((left, right) =>
        (Number.isFinite(left.pick.probability) ? 0 : 1) - (Number.isFinite(right.pick.probability) ? 0 : 1)
        || turns.get(left.pick) - turns.get(right.pick) || left.index - right.index).map(entry => entry.pick);
      const metadata = built
        ? meta(built, { sport: scope, warnings, pricing: pricingApplied(prefs), quoteCount: 0 })
        : readOnlyMeta(context, [], [...warnings, 'Sportsbook pricing is still loading; SmartStake probabilities are shown.']);
      if (capped < ranked.length) metadata.truncated = true, metadata.totalPicks = ranked.length;
      return JSON.stringify({ contract: CONTRACT_ID, meta: metadata, picks: ranked.slice(0, capped), payouts: tables });
    },
    /**
     * Fair probabilities for pick'em lines a member entered (the Fantasy lab), priced exactly as feed lines
     * are: two-sided sportsbook markets at the same player, stat and line, devigged with the member's method.
     */
    async dfsPrice(context, { prefs, lines }) {
      const built = await build(context, prefs, ''), now = new Date().toISOString();
      const records = lines.map((line, index) => ({ id: `line-${index}`, app: line.app, player: line.player, market: line.market, side: line.side, line: line.line, sport: line.sport, event: line.event, startTime: line.startTime || '', ts: now, live: line.live === true }));
      const { picks } = normalizeDfsRecords(records, { syncedAt: now });
      const priced = dfsPicks(picks, built.feed.quotes, built.feed.names, { method: prefs.devigMethod, minBooks: prefs.minSharpBooks, maxVigPercent: prefs.maxVigPercent });
      const key = line => [canonicalPlatform(line.app), String(line.player ?? '').trim().toLowerCase(), String(line.market ?? '').trim().toLowerCase(), Number(line.line), String(line.side ?? '').trim().toLowerCase()].join('|');
      const byKey = new Map(priced.map(pick => [key(pick), pick]));
      return JSON.stringify({ contract: CONTRACT_ID, meta: meta(built, { quoteCount: 0 }), lines: lines.map(line => {
        const pick = byKey.get(key(line));
        return { probability: pick?.probability ?? null, probabilityMethod: pick?.probabilityMethod ?? prefs.devigMethod, probabilityBooks: pick?.probabilityBooks || [], bookLines: pick?.bookLines || [], ...(pick?.period ? { period: pick.period } : {}) };
      }) });
    },
    /** Recorded prices for the opened quote's market: its book's sides plus up to four other books (sharp books first). */
    async history(context, { id, hours }) {
      const built = await build(context, defaultPrefs(), '');
      const quote = built.feed.byId.get(id);
      if (!quote) throw new OddsError('NOT_FOUND', 'That price is no longer in the feed.');
      const key = marketIdentity(quote), sharp = book => ['pinnacle', 'circa', 'circa sports', 'betfair', 'betfair exchange'].includes(String(book).toLowerCase());
      const peers = built.feed.quotes.filter(other => other.feedId && marketIdentity(other) === key);
      const others = [...new Set(peers.filter(other => other.book !== quote.book).sort((a, b) => Number(sharp(b.book)) - Number(sharp(a.book))).map(other => other.book))].slice(0, 4);
      const series = [];
      // One upstream request at a time, each cached for a minute: opening charts can't use up the feed's request limit.
      for (const peer of peers.filter(other => other.book === quote.book || others.includes(other.book))) {
        const feedId = String(peer.feedId).replace(/^local-api:/, '');
        const rows = await histories(`${feedId}|${hours}`, () => readSiteDataset('/site/odds/history', { id: feedId, hours: String(hours) }, context)).catch(() => []);
        const usable = (Array.isArray(rows) ? rows : []).map(row => ({ ts: Date.parse(row?.ts), odds: Number(row?.odds), line: row?.line }))
          .filter(row => Number.isFinite(row.ts) && Number.isFinite(implied(row.odds)) && (row.line == null || row.line === '' || peer.line === '' || Number(row.line) === Number(peer.line))).sort((a, b) => a.ts - b.ts);
        // The API sometimes files another selection's price under the same id within one scrape: a row
        // followed within a second by another for the same id is a mixed-up copy.
        const points = usable.filter((row, index) => !(usable[index + 1] && usable[index + 1].ts - row.ts < 1_000)).map(row => ({ at: iso(row.ts), odds: row.odds, line: peer.line, impliedProbability: Number(implied(row.odds).toFixed(6)) }));
        series.push({ quoteId: peer.id, seriesId: peer.seriesId || peer.id, book: peer.book, side: peer.side, selection: peer.selection, line: peer.line, points });
      }
      return JSON.stringify({ contract: CONTRACT_ID, meta: meta(built, { quoteCount: 0 }), quoteId: id, hours, series });
    },
    /** Prediction-market contracts (bid/ask), read-only beside the member's own. */
    async contracts(context, { platform }) {
      const rows = await readSiteDataset('/site/prediction/contracts', platform ? { platform } : {}, context);
      return JSON.stringify({ contract: CONTRACT_ID, meta: readOnlyMeta(context, rows), contracts: predictionContracts(rows) });
    },
  };

  // The unfiltered props request leaves some apps out (DraftKings Pick6 only comes back with ?app=), so each
  // app with payout tables that is missing from it is requested on its own; an app that answers with no
  // lines is asked again after 10 minutes, not every minute.
  async function loadProps(context, appsPromise, sport = '') {
    const params = sport ? { sport: sport.toLowerCase() } : {};
    const [records, payout] = await Promise.all([readSiteDataset('/site/dfs/props', params, context), appsPromise]);
    const apps = Array.isArray(payout?.apps) ? payout.apps : [];
    const base = Array.isArray(records) ? records : records?.props || records?.dfs;
    if (!Array.isArray(base)) throw new OddsError('MALFORMED');
    const present = new Set(base.map(raw => canonicalPlatform(String(raw?.app || raw?.book || '').trim())));
    const missing = apps.filter(app => app && !present.has(canonicalPlatform(app)) && !(emptyApps.get(app) > Date.now()));
      const extra = await Promise.all(missing.map(app => readSiteDataset('/site/dfs/props', { ...params, app }, context).catch(() => null)));
    missing.forEach((app, index) => { if (Array.isArray(extra[index]) && !extra[index].length) emptyApps.set(app, Date.now() + 600_000); else emptyApps.delete(app); });
    const seen = new Set(), merged = [];
    for (const raw of [base, ...extra.filter(Array.isArray)].flat()) {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      merged.push(raw);
    }
    return { at: Date.now(), picks: underdogFiftyFifty(normalizeDfsRecords(merged, { syncedAt: new Date().toISOString() }).picks) };
  }
}
const emptyApps = new Map();
const defaultPrefs = () => pricingSettings({});

/**
 * The quote API's prediction contracts → the records the Prediction tool lists. ProphetX sends up to 113
 * unlabeled contracts per event that can't be told apart, so an event with more than one contract per
 * platform is left out, as are crossed books (bid above ask).
 */
export function predictionContracts(rows) {
  const list = Array.isArray(rows) ? rows : [], perEvent = new Map(), key = row => `${row?.platform}|${row?.event}`;
  for (const row of list) perEvent.set(key(row), (perEvent.get(key(row)) || 0) + 1);
  return list.filter(row => perEvent.get(key(row)) === 1 && typeof row?.event === 'string' && row.event && Number(row.yes_bid_cents) >= 0 && Number(row.yes_ask_cents) <= 100 && Number(row.yes_bid_cents) <= Number(row.yes_ask_cents) && Number.isFinite(Date.parse(row.ts)))
    .map(row => ({ id: `feed-contract:${key(row)}`, platform: canonicalPlatform(row.platform), event: row.event, sport: knownSport(row.sport) || 'Other', bid: Number(row.yes_bid_cents), ask: Number(row.yes_ask_cents), ...(Number.isFinite(Number(row.last)) ? { last: Number(row.last) } : {}), volume: Number(row.volume) || 0, ts: row.ts, source: 'local-api' }));
}

// ---- Odds API provider: prices and analytics computed by the odds API ----

/**
 * The odds API answers the same contract at /v1/odds/{snapshot,section/<name>,events,dfs,history,contracts}
 * (see docs/odds-architecture.md). The key travels only in the server's request header.
 */
function oddsApiProvider(config, fetcher = fetch) {
  async function get(path, params, context) {
    const target = new URL(path, config.base);
    for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') target.searchParams.set(name, String(value));
    let response;
    try { response = await fetcher(target, { headers: { Accept: 'application/json', 'X-API-Key': config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(30_000) }); }
    catch (error) { throw new OddsError(error?.name === 'TimeoutError' ? 'TIMEOUT' : 'UNAVAILABLE'); }
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); console.error(`[odds-api] The odds API refused this server's key (HTTP ${response.status}).`); throw new OddsError('UNAUTHORIZED'); }
    if (!response.ok) {
      await response.body?.cancel();
      const retry = response.headers.get('retry-after');
      throw new OddsError(response.status === 429 ? 'RATE_LIMITED' : response.status === 404 ? 'NOT_FOUND' : response.status === 422 ? 'UNSUPPORTED_MARKET' : 'UNAVAILABLE', undefined, { retryAfterSeconds: /^\d+$/.test(retry || '') ? Number(retry) : undefined });
    }
    let body;
    try { body = await response.json(); } catch { throw new OddsError('MALFORMED'); }
    // Distribution controls apply to every provider: blocked books and events never reach visitors.
    let controls = [];
    if (typeof context.loadControls === 'function') { try { controls = await context.loadControls(); } catch { throw new OddsError('CONTROLS_UNAVAILABLE'); } }
    return { body, controls };
  }
  // A snapshot answer, validated; quotes at blocked books or events are removed with every record naming them.
  function passSnapshot({ body, controls }) {
    const { snapshot } = decodeSnapshot(body);
    if (controls.length) {
      snapshot.quotes = filterMarketRecords(snapshot.quotes, controls);
      const ids = new Set(snapshot.quotes.map(quote => quote.id));
      for (const section of SECTIONS) if (Array.isArray(snapshot[section])) snapshot[section] = sectionRecordsIn(section, snapshot[section], ids);
    }
    const quoteRow = { table: 'quotes', rows: new Map(snapshot.quotes.map((quote, row) => [quote.id, row])) };
    return JSON.stringify({ ...snapshot, quotes: encodeTable(snapshot.quotes, QUOTE_DICTIONARY), ...(snapshot.pricing ? { pricing: encodeTable(snapshot.pricing, PRICING_DICTIONARY, { quoteId: quoteRow }) } : {}) });
  }
  // DFS, history and contract answers carry records with an app, book or platform: controls apply to those too.
  const controlled = (list, controls) => controls.length ? filterMarketRecords(list, controls) : list;
  return {
    id: 'odds-api',
    snapshot: (context, { prefs, include, sport, books, markets }) => get('/v1/odds/snapshot', { include: sectionsOf(include).join(','), sport: scopeOf(sport), books: books?.join(','), markets: marketsOf(markets), prefs: encodePreferences(prefs) }, context).then(passSnapshot),
    section: (context, { prefs, section, sport, live, minEv, limit, books }) => get(`/v1/odds/section/${encodeURIComponent(section)}`, { sport: scopeOf(sport), live, minEv, limit, books: books?.join(','), prefs: encodePreferences(prefs) }, context).then(passSnapshot),
    events: (context, { prefs, sport, event }) => get('/v1/odds/events', { sport: scopeOf(sport), event, prefs: encodePreferences(prefs) }, context).then(passSnapshot),
    dfs: (context, { prefs }) => get('/v1/odds/dfs', { prefs: encodePreferences(prefs) }, context).then(({ body, controls }) => {
      if (body?.contract !== CONTRACT_ID || !Array.isArray(body.picks)) throw new OddsError('MALFORMED');
      return JSON.stringify({ ...body, picks: controlled(body.picks, controls) });
    }),
    dfsPrice: (context, { prefs, lines }) => get('/v1/odds/dfs/price', { lines: JSON.stringify(lines), prefs: encodePreferences(prefs) }, context).then(({ body }) => {
      if (body?.contract !== CONTRACT_ID || !Array.isArray(body.lines)) throw new OddsError('MALFORMED');
      return JSON.stringify(body);
    }),
    history: (context, { id, hours }) => get('/v1/odds/history', { id, hours }, context).then(({ body, controls }) => {
      if (body?.contract !== CONTRACT_ID || !Array.isArray(body.series)) throw new OddsError('MALFORMED');
      return JSON.stringify({ ...body, series: controlled(body.series, controls) });
    }),
    contracts: (context, { platform }) => get('/v1/odds/contracts', { platform }, context).then(({ body, controls }) => {
      if (body?.contract !== CONTRACT_ID || !Array.isArray(body.contracts)) throw new OddsError('MALFORMED');
      return JSON.stringify({ ...body, contracts: controlled(body.contracts, controls) });
    }),
  };
}

// ---- The transition provider on its own thread (production) ----

/**
 * Runs the transition provider in lib/odds/worker.mjs. The distribution controls are read here (the
 * database belongs to this thread) and sent with each request; the thread fetches the quote feed itself.
 */
// The thread's heap, sized from the function's memory rather than left to Node, which sizes it from the
// machine (a quarter of a 2 GB instance can be too little for the board, and a second full-size heap
// beside this thread's could take the instance past its memory). An engine past its heap stops and the next
// request starts a new one while this thread keeps answering from its last responses; an instance past
// its memory is killed outright. ODDS_ENGINE_HEAP_MB sets it directly.
export function engineHeapMb(env = process.env, total = os.totalmem(), constrained = process.constrainedMemory?.() || 0) {
  const set = Number(env.ODDS_ENGINE_HEAP_MB);
  if (Number.isFinite(set) && set >= 256) return Math.round(set);
  const memoryMb = (constrained > 0 ? Math.min(constrained, total) : total) / 1_048_576;
  return Math.round(Math.min(4096, Math.max(512, memoryMb * 0.6)));
}

function threadedProvider() {
  let worker = null, nextId = 0, logged = false;
  const pending = new Map();
  const failAll = error => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); } pending.clear(); };
  function start() {
    const heapMb = engineHeapMb();
    if (!logged) { logged = true; console.log(`[odds] Engine thread heap ${heapMb} MB (memory ${Math.round(os.totalmem() / 1_048_576)} MB).`); }
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: heapMb } });
    worker.on('message', ({ id, text, error }) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id); clearTimeout(request.timer);
      if (error) request.reject(new OddsError(error.code, error.message, { retryAfterSeconds: error.retryAfterSeconds }));
      else request.resolve(text);
    });
    // A crashed thread fails what it held; the next request starts a new one.
    worker.on('error', error => { console.error('[odds] Engine thread stopped:', error?.stack || error); worker = null; failAll(new OddsError('UNAVAILABLE')); });
    worker.on('exit', () => { worker = null; failAll(new OddsError('UNAVAILABLE')); });
    // The thread never keeps the process alive on its own (listeners added after unref would ref it again).
    worker.unref();
  }
  function ask(method, args, controls) {
    if (!worker) start();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (pending.delete(id)) reject(new OddsError('TIMEOUT')); }, 90_000);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, method, args, controls });
    });
  }
  // The page's polled reads answer from the last result while the thread works (createAnswerCache); the
  // controls are part of the key, so a market an admin blocks leaves the next answer at once.
  const answers = createAnswerCache(), POLLED = new Set(['snapshot', 'section', 'events', 'dfs']);
  async function call(method, context, args) {
    let controls = null;
    if (typeof context.loadControls === 'function') {
      try { controls = await context.loadControls(); } catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
    }
    if (!POLLED.has(method)) return ask(method, args, controls);
    return answers(JSON.stringify([method, args, controls]), () => ask(method, args, controls));
  }
  return Object.fromEntries([['id', 'website-transition'], ...['snapshot', 'section', 'events', 'dfs', 'dfsPrice', 'history', 'contracts'].map(method => [method, (context, args) => call(method, context, args)])]);
}

let transition = null;
const apiProviders = new Map();
/**
 * The configured provider. ODDS_PROVIDER=odds-api selects the odds API (ODDS_API_URL and ODDS_API_KEY
 * must be set; an unreachable or misconfigured API is reported, never silently replaced by another source).
 */
export function selectProvider(env = process.env, { fetcher } = {}) {
  if ((env.ODDS_PROVIDER || '').trim() === 'odds-api') {
    let config;
    try { config = parseEvApiConfig({ address: env.ODDS_API_URL, apiKey: env.ODDS_API_KEY, allowHttp: env.ODDS_API_ALLOW_HTTP }); }
    catch (error) { console.error('[odds-api] Configuration:', error.message.replaceAll('EV_TOOL_API', 'ODDS_API')); throw new OddsError('NOT_CONFIGURED'); }
    const key = `${config.base.href}|${config.apiKey}`;
    if (!apiProviders.has(key) || fetcher) apiProviders.set(key, oddsApiProvider(config, fetcher));
    return apiProviders.get(key);
  }
  // An injected fetcher (tests) or ODDS_ENGINE_THREAD=off prices on this thread.
  if (fetcher || env.ODDS_ENGINE_THREAD === 'off') return inProcess ??= transitionProvider();
  return transition ??= threadedProvider();
}
let inProcess = null;
/** A fresh transition provider (tests). */
export const createTransitionProvider = transitionProvider;
export { pricingApplied };
