// Kalshi order-book depth for the exchange prices SportWizzard carries.
//
// SportWizzard sends Kalshi's game prices but not how much money stands behind them, and Smart Money
// ranks exchange prices by that money. Kalshi publishes its markets with no key
// (https://api.elections.kalshi.com/trade-api/v2/markets): each game-winner market has its best ask and
// the contracts resting there. A SportWizzard Kalshi moneyline whose team label, game date and price
// agree with exactly one Kalshi market takes that market's live ask as its price and ask × contracts
// (the dollars a bettor can stake at that price) as its liquidity. A row that doesn't match keeps its
// SportWizzard price and no liquidity; nothing is estimated.
//
// Configuration: KALSHI_DEPTH=0 turns the lookup off.

export const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
// SportWizzard league → Kalshi's game-winner series.
const SERIES = { nfl: 'KXNFLGAME', cfb: 'KXNCAAFGAME', mlb: 'KXMLBGAME', nba: 'KXNBAGAME', wnba: 'KXWNBAGAME', nhl: 'KXNHLGAME', cbb: 'KXNCAAMBGAME' };
const PAGE_LIMIT = 1000, MAX_PAGES = 5, REQUEST_TIMEOUT_MS = 15_000, TTL_MS = 30_000;
// A SportWizzard price may be a few minutes older than Kalshi's; further apart than this, it isn't the same market.
const MAX_PRICE_GAP = 0.06;
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

export const kalshiDepthEnabled = (env = process.env) => String(env.KALSHI_DEPTH ?? '').trim() !== '0';

// KXNFLGAME-26OCT19WASSF → the game's (US Eastern) calendar day as a UTC midnight timestamp.
function tickerDay(eventTicker) {
  const match = /-(\d{2})([A-Z]{3})(\d{2})/.exec(String(eventTicker || ''));
  if (!match || !(match[2] in MONTHS)) return NaN;
  return Date.UTC(2000 + Number(match[1]), MONTHS[match[2]], Number(match[3]));
}
const dollars = value => { const number = Number(value); return Number.isFinite(number) ? number : NaN; };
const label = value => String(value || '').trim().toLowerCase();
const impliedOf = american => american > 0 ? 100 / (american + 100) : -american / (-american + 100);
const americanOf = probability => probability >= 0.5 ? -Math.round(100 * probability / (1 - probability)) : Math.round(100 * (1 - probability) / probability);

async function seriesMarkets(fetcher, series) {
  const markets = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${KALSHI_BASE}/markets`);
    url.searchParams.set('series_ticker', series);
    url.searchParams.set('status', 'open');
    url.searchParams.set('limit', String(PAGE_LIMIT));
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) { await response.body?.cancel?.(); throw new Error(`Kalshi ${series} answered HTTP ${response.status}.`); }
    const body = await response.json();
    if (!Array.isArray(body?.markets)) throw new Error(`Kalshi ${series} returned an unexpected body.`);
    markets.push(...body.markets);
    if (!body.cursor) break;
    cursor = body.cursor;
  }
  return markets.map(market => ({
    label: label(market.yes_sub_title), day: tickerDay(market.event_ticker),
    ask: dollars(market.yes_ask_dollars), size: dollars(market.yes_ask_size_fp),
  })).filter(market => market.label && Number.isFinite(market.day) && market.ask > 0 && market.ask < 1 && market.size > 0);
}

const books = new WeakMap();
/** One league's open Kalshi game markets, shared per fetcher for TTL_MS. Empty for leagues Kalshi has no series for. */
export function kalshiMarkets(fetcher, league) {
  const series = SERIES[league];
  if (!series) return Promise.resolve([]);
  let perFetcher = books.get(fetcher);
  if (!perFetcher) { perFetcher = new Map(); books.set(fetcher, perFetcher); }
  const cached = perFetcher.get(series);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.markets;
  const markets = seriesMarkets(fetcher, series).catch(error => {
    console.error(`[kalshi] ${series}:`, error?.message || error);
    perFetcher.delete(series);
    return [];
  });
  perFetcher.set(series, { at: Date.now(), markets });
  return markets;
}

/**
 * SportWizzard rows with Kalshi's depth added to its Kalshi moneylines (see the header). Other rows are
 * returned as they are.
 */
export function withKalshiDepth(rows, markets, observedAt = new Date()) {
  if (!markets?.length) return rows;
  const byLabel = new Map();
  for (const market of markets) byLabel.set(market.label, [...(byLabel.get(market.label) || []), market]);
  const updated = observedAt.toISOString().replace(/\.\d+Z$/, 'Z');
  return rows.map(row => {
    if (String(row?.sportsbook).toLowerCase() !== 'kalshi' || String(row.market).toUpperCase() !== 'MONEYLINE' || String(row.period || '').toUpperCase() !== 'FULL') return row;
    const price = Number(row.priceAmerican), start = Date.parse(`${String(row.eventStartTime || '').replace(/Z$/, '')}Z`);
    if (!Number.isFinite(price) || !Number.isFinite(start)) return row;
    // The ticker carries the Eastern date: the UTC start date, or the day before for a late kickoff.
    const utcDay = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate());
    const candidates = (byLabel.get(label(row.selection)) || []).filter(market => market.day === utcDay || market.day === utcDay - 86_400_000);
    const implied = impliedOf(price);
    const matches = candidates.filter(market => Math.abs(market.ask - implied) <= MAX_PRICE_GAP);
    if (matches.length !== 1) return row;
    const [market] = matches;
    return { ...row, priceAmerican: americanOf(market.ask), liquidity: Math.round(market.ask * market.size * 100) / 100, updated };
  });
}
