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
import { readControlledInventory, readSiteDataset, parseEvApiConfig } from '../ev-api-proxy.mjs';
import { filterMarketRecords } from '../admin-market-controls.mjs';
import { normalizeFeed, normalizeDfsRecords, payoutTables, createDfsPricer, dfsPicks } from './normalize.mjs';
import { analyzeSnapshot, pricingApplied, expiresAt, quoteStatus, ENGINE, ENGINE_VERSION } from './engine.mjs';
import { CONTRACT_ID, SECTIONS, OddsError, preferencesKey, encodePreferences, decodeSnapshot, pricingSettings, encodeTable, QUOTE_DICTIONARY, PRICING_DICTIONARY } from '../../public/odds-contract.js';
import { implied } from '../../public/betting-math.js';
import { marketIdentity } from '../../public/market-identity.js';
import { canonicalPlatform } from '../../public/platform-catalog.js';
import { knownSport } from '../../public/sport-names.js';

// A priced snapshot is reused for this long before the next request reprices the latest feed. Prices
// age by up to this much more than the feed itself; live prices stay current for 90 s.
const BUILD_TTL_MS = 4_000;
// A response is outdated (shown as stale by the page) this long after the prices were fetched.
const STALE_AFTER_MS = 60_000;
const DFS_PROPS_TTL_MS = 60_000, DFS_PRICED_TTL_MS = 15_000, PAYOUTS_TTL_MS = 3_600_000, HISTORY_TTL_MS = 60_000, CONTRACTS_TTL_MS = 60_000;
const iso = ms => new Date(ms).toISOString();

// ---- Shared helpers ----

/** Single flight with a time-to-live: callers share one load in flight and its result for `ttl` ms. Failures aren't kept. */
function cached(ttl) {
  const entries = new Map();
  return (key, load) => {
    const entry = entries.get(key);
    if (entry && (entry.at === null || Date.now() - entry.at < ttl)) return entry.promise;
    const record = { at: null, promise: null };
    record.promise = Promise.resolve().then(load).then(value => { record.at = Date.now(); return value; }, error => { if (entries.get(key) === record) entries.delete(key); throw error; });
    entries.set(key, record);
    if (entries.size > 64) entries.delete(entries.keys().next().value);
    return record.promise;
  };
}
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
  const dfsPricer = createDfsPricer();
  let pricerSource = null, pricerProps = null;
  const props = cached(DFS_PROPS_TTL_MS), payouts = cached(PAYOUTS_TTL_MS), dfsPriced = cached(DFS_PRICED_TTL_MS), histories = cached(HISTORY_TTL_MS), contracts = cached(CONTRACTS_TTL_MS);

  // Normalization depends only on the distributed records, so every pricing preference shares it.
  function normalizedFor(records, snapshot) {
    let result = normalized.get(records);
    if (!result) {
      result = normalizeFeed(records, { syncedAt: iso(snapshot.at), price: false });
      result.byId = new Map(result.quotes.map(quote => [quote.id, quote]));
      normalized.set(records, result);
    }
    return result;
  }

  /**
   * The priced snapshot for one control state and set of pricing settings, shared by every request
   * that asks within BUILD_TTL_MS (one build at a time per key). Controls are read for every request.
   */
  async function build(context, prefs) {
    const inventory = await readControlledInventory(context);
    const key = `${inventory.controlsKey}|${preferencesKey(prefs)}`, entry = builds.get(key);
    if (entry && (entry.at === null || Date.now() - entry.at < BUILD_TTL_MS)) return entry.promise;
    const record = { at: null, promise: null };
    record.promise = Promise.resolve().then(() => {
      const feed = normalizedFor(inventory.records, inventory.snapshot);
      const analysis = analyzeSnapshot(feed.quotes, prefs, { now: Date.now() });
      record.at = Date.now();
      return { id: ++buildCount, at: record.at, inventory, feed, analysis };
    });
    record.promise.catch(() => { if (builds.get(key) === record) builds.delete(key); });
    builds.set(key, record);
    if (builds.size > 32) builds.delete(builds.keys().next().value);
    return record.promise;
  }

  function meta(built, { sport, warnings = [], pricing = built.analysis.applied, quoteCount }) {
    const { snapshot, records, controlled } = built.inventory;
    return {
      provenance: { provider: 'website-transition', engine: ENGINE, engineVersion: ENGINE_VERSION, generatedAt: iso(built.at) },
      pricing, snapshotAt: iso(snapshot.at), staleAfter: iso(snapshot.at + STALE_AFTER_MS),
      stale: Boolean(snapshot.stale), warmingUp: Boolean(snapshot.warmingUp), partial: warnings.length > 0, warnings,
      scope: { sport: sport || null }, controlsApplied: controlled,
      counts: { records: records.length, quotes: quoteCount, skipped: built.feed.skipped, dropped: snapshot.dropped || 0 },
    };
  }
  // The feed record id is the server's (for line history); the page gets the selection's stable id.
  // A series id equal to the quote's own id is left out (the page reads it as the id).
  const quoteOut = (quote, fields) => { const { feedId, seriesId, ...rest } = quote; return { ...rest, ...(seriesId && seriesId !== quote.id ? { seriesId } : {}), ...fields }; };

  function body(built, { sections, sport, quotes, sectionRows, warnings, books = null }) {
    const ids = new Set(quotes.map(quote => quote.id));
    const records = quotes.map(quote => quoteOut(quote, built.analysis.fields(quote)));
    // The long lists travel as tables (public/odds-contract.js encodeTable): about a quarter of the JSON.
    const out = { contract: CONTRACT_ID, meta: meta(built, { sport, warnings, quoteCount: quotes.length }), quotes: encodeTable(records, QUOTE_DICTIONARY) };
    const quoteRow = { table: 'quotes', rows: new Map(records.map((quote, row) => [quote.id, row])) };
    if (sections.includes('events')) out.events = eventsOf(quotes);
    const keys = sport && !sectionRows?.markets ? new Set(records.map(quote => quote.marketKey)) : null;
    for (const section of sections) {
      if (section === 'events') continue;
      const rows = sectionRows?.[section] ?? built.analysis.section(section, { books });
      const kept = section === 'markets' ? (keys ? rows.filter(row => keys.has(row.key)) : rows) : sectionRecordsIn(section, rows, ids);
      out[section] = section === 'pricing' ? encodeTable(kept, PRICING_DICTIONARY, { quoteId: quoteRow }) : section === 'hedges' ? encodeTable(kept, [], { promoQuoteId: quoteRow }) : section === 'markets' ? encodeTable(kept) : kept;
    }
    return out;
  }

  return {
    id: 'website-transition',
    /** Every current price plus the requested sections, as a JSON string (cached per build). */
    async snapshot(context, { prefs, include, sport, books }) {
      const sections = sectionsOf(include), scope = scopeOf(sport), built = await build(context, prefs), offered = booksOf(books);
      const key = `${built.id}|${sections.join(',')}|${scope}|${offered ? [...offered].sort().join(',') : ''}`;
      if (!bodies.has(key)) {
        const quotes = scope ? built.feed.quotes.filter(quote => quote.sport === scope) : built.feed.quotes;
        bodies.set(key, JSON.stringify(body(built, { sections, sport: scope, quotes, books: offered })));
        if (bodies.size > 6) bodies.delete(bodies.keys().next().value);
      }
      return bodies.get(key);
    },
    /** One section with only the quotes it names (getEV, getArbitrage, …). */
    async section(context, { prefs, section, sport, live, minEv, limit, books }) {
      if (!SECTIONS.includes(section)) throw new OddsError('NOT_FOUND');
      const scope = scopeOf(sport), built = await build(context, prefs), byId = built.feed.byId;
      const inScope = id => { const quote = byId.get(id); return quote && (!scope || quote.sport === scope) && (live == null || Boolean(quote.live) === live); };
      let rows = built.analysis.section(section, { books: booksOf(books) });
      if (section === 'markets') {
        const keys = new Set(built.feed.quotes.filter(quote => inScope(quote.id)).map(quote => built.analysis.fields(quote).marketKey));
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
      const scope = scopeOf(sport), built = await build(context, prefs);
      if (!event) return JSON.stringify({ ...body(built, { sections: [], sport: scope, quotes: [] }), events: eventsOf(scope ? built.feed.quotes.filter(quote => quote.sport === scope) : built.feed.quotes) });
      const quotes = built.feed.quotes.filter(quote => quote.eventId === event && (!scope || quote.sport === scope));
      if (!quotes.length) throw new OddsError('NOT_FOUND', 'No prices for that event.');
      return JSON.stringify(body(built, { sections: ['events', 'pricing', 'markets'], sport: scope, quotes }));
    },
    /** DFS (pick'em) lines priced against the sportsbooks, with each app's payout tables. */
    async dfs(context, { prefs }) {
      const built = await build(context, prefs), warnings = [];
      // The payout records name each app as the props feed does ("Underdog"), so those names ask for missing apps.
      const payout = await payouts('payouts', async () => { const records = await readSiteDataset('/site/dfs/payouts', {}, context); return { tables: payoutTables(records), apps: (Array.isArray(records) ? records : []).map(entry => entry?.app).filter(app => typeof app === 'string' && app) }; })
        .catch(() => { warnings.push('Payout tables are unavailable.'); return { tables: {}, apps: [] }; });
      const tables = payout.tables;
      const lines = await props(`props|${built.inventory.controlsKey}|${payout.apps.join(',')}`, () => loadProps(context, payout.apps)).catch(() => { warnings.push('The DFS props feed is unavailable; lines from the quote snapshot are shown.'); return null; });
      const key = `${built.id}|${lines?.at ?? 'none'}|${preferencesKey(prefs)}`;
      const picks = await dfsPriced(key, () => {
        if (pricerSource !== built.feed) { dfsPricer.setQuotes(built.feed); pricerSource = built.feed; }
        if (pricerProps !== lines) { dfsPricer.setProps(lines?.picks || []); pricerProps = lines; }
        const now = Date.now();
        // Each line says when it stops being current (the member's price ages), as quotes do.
        return dfsPricer.price(prefs.devigMethod, { now, force: true, minBooks: prefs.minSharpBooks, maxVigPercent: prefs.maxVigPercent })
          .map(pick => ({ ...pick, expiresAt: expiresAt(pick, prefs), status: quoteStatus(pick, prefs, now) }));
      });
      return JSON.stringify({ contract: CONTRACT_ID, meta: meta(built, { warnings, quoteCount: 0 }), picks, payouts: tables });
    },
    /**
     * Fair probabilities for pick'em lines a member entered (the Fantasy lab), priced exactly as feed lines
     * are: two-sided sportsbook markets at the same player, stat and line, devigged with the member's method.
     */
    async dfsPrice(context, { prefs, lines }) {
      const built = await build(context, prefs), now = new Date().toISOString();
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
      const built = await build(context, defaultPrefs());
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
      const built = await build(context, defaultPrefs());
      const rows = await contracts(`contracts|${built.inventory.controlsKey}|${platform || ''}`, () => readSiteDataset('/site/prediction/contracts', platform ? { platform } : {}, context));
      return JSON.stringify({ contract: CONTRACT_ID, meta: meta(built, { quoteCount: 0 }), contracts: predictionContracts(rows) });
    },
  };

  // The unfiltered props request leaves some apps out (DraftKings Pick6 only comes back with ?app=), so each
  // app with payout tables that is missing from it is requested on its own; an app that answers with no
  // lines is asked again after 10 minutes, not every minute.
  async function loadProps(context, apps) {
    const records = await readSiteDataset('/site/dfs/props', {}, context);
    const base = Array.isArray(records) ? records : records?.props || records?.dfs;
    if (!Array.isArray(base)) throw new OddsError('MALFORMED');
    const present = new Set(base.map(raw => canonicalPlatform(String(raw?.app || raw?.book || '').trim())));
    const missing = apps.filter(app => app && !present.has(canonicalPlatform(app)) && !(emptyApps.get(app) > Date.now()));
    const extra = await Promise.all(missing.map(app => readSiteDataset('/site/dfs/props', { app }, context).catch(() => null)));
    missing.forEach((app, index) => { if (Array.isArray(extra[index]) && !extra[index].length) emptyApps.set(app, Date.now() + 600_000); else emptyApps.delete(app); });
    const seen = new Set(), merged = [];
    for (const raw of [base, ...extra.filter(Array.isArray)].flat()) {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      merged.push(raw);
    }
    return { at: Date.now(), picks: normalizeDfsRecords(merged, { syncedAt: new Date().toISOString() }).picks };
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
    snapshot: (context, { prefs, include, sport, books }) => get('/v1/odds/snapshot', { include: sectionsOf(include).join(','), sport: scopeOf(sport), books: books?.join(','), prefs: encodePreferences(prefs) }, context).then(passSnapshot),
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
function threadedProvider() {
  let worker = null, nextId = 0;
  const pending = new Map();
  const failAll = error => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); } pending.clear(); };
  function start() {
    worker = new Worker(new URL('./worker.mjs', import.meta.url));
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
  async function call(method, context, args) {
    let controls = null;
    if (typeof context.loadControls === 'function') {
      try { controls = await context.loadControls(); } catch { throw new OddsError('CONTROLS_UNAVAILABLE'); }
    }
    if (!worker) start();
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (pending.delete(id)) reject(new OddsError('TIMEOUT')); }, 90_000);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, method, args, controls });
    });
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
