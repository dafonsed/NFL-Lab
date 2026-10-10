// GET /api/odds/*: the website API the frontend reads prices and analytics from (contract:
// lib/odds/contract.d.ts). Read-only, no-store, and never carries provider addresses, keys or upstream
// error bodies. Data comes from the configured provider (lib/odds/providers.mjs).
//
//   /api/odds/snapshot?include=pricing,markets,…&sport=&books=&markets=&prefs=  prices + requested analytics sections
//                       (books: the member's sportsbooks; holds and hedge pairs choose best prices among them;
//                       markets=all adds part-game lines, game props and yes/no player bets to the full-game markets)
//   /api/odds/ev | arbitrage | middles | holds | sharp | hedges | markets ?sport=&live=&minEv=&limit=&prefs=
//   /api/odds/events?sport=&event=&prefs=                           games, or one game's prices and markets
//   /api/odds/dfs?prefs=                                            pick'em lines priced against sportsbooks
//   /api/odds/dfs/price?lines=&prefs=                               the same pricing for lines a member entered
//   /api/odds/history?id=&hours=                                    recorded prices for a quote's market
//   /api/odds/contracts?platform=                                   prediction-market contracts
import { sendJsonText } from '../ev-api-proxy.mjs';
import { OddsError, parsePreferences } from '../../public/odds-contract.js';
import { selectProvider, MAX_DFS_PICKS } from './providers.mjs';

const SECTION_ROUTES = { ev: 'pricing', arbitrage: 'arbitrage', middles: 'middles', holds: 'holds', sharp: 'sharp', hedges: 'hedges', markets: 'markets' };
// The page's polled reads, which the CDN may share (dfs/price and history are per member or per quote).
const CDN_ROUTES = new Set(['snapshot', 'events', 'dfs', ...Object.keys(SECTION_ROUTES)]);
// Whether an answer's meta (at the start of the JSON) says it is complete and current.
const complete = text => { const head = text.slice(0, 6000); return head.includes('"meta":{') && !/"(stale|warmingUp|partial)":true/.test(head); };

function textParam(params, name, maximum) {
  const value = params.get(name);
  if (value === null || value === '') return '';
  if (value.length > maximum || /[\u0000-\u001f]/.test(value)) throw new OddsError('BAD_REQUEST', `${name} is invalid.`);
  return value.trim();
}
function numberParam(params, name, low, high) {
  const value = params.get(name);
  if (value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < low || number > high) throw new OddsError('BAD_REQUEST', `${name} must be between ${low} and ${high}.`);
  return number;
}
// A comma list of sportsbook names (the books the member can bet), at most 60.
function booksParam(params) {
  const value = textParam(params, 'books', 3000);
  if (!value) return undefined;
  const books = [...new Set(value.split(',').map(book => book.trim()).filter(Boolean))];
  if (books.length > 60 || books.some(book => book.length > 80)) throw new OddsError('BAD_REQUEST', 'books is invalid.');
  return books;
}
// Member-entered pick'em lines to price: a JSON list of at most 50 { app, sport, event, player, market, line, side }.
function linesParam(params) {
  const value = textParam(params, 'lines', 12_000);
  let lines;
  try { lines = JSON.parse(value); } catch { throw new OddsError('BAD_REQUEST', 'lines must be a JSON list.'); }
  const short = (text, maximum) => typeof text === 'string' && text.trim() && text.length <= maximum;
  if (!Array.isArray(lines) || !lines.length || lines.length > 50 || lines.some(line => !line || typeof line !== 'object' || !short(line.app, 80) || !short(line.player, 120) || !short(line.market, 120)
    || !Number.isFinite(Number(line.line)) || !['over', 'under', 'more', 'less', 'higher', 'lower'].includes(String(line.side).toLowerCase()) || line.sport != null && !short(String(line.sport), 40) || line.event != null && typeof line.event !== 'string')) throw new OddsError('BAD_REQUEST', 'lines is invalid.');
  return lines.map(line => ({ app: line.app.trim(), player: line.player.trim(), market: line.market.trim(), line: Number(line.line), side: String(line.side), sport: String(line.sport ?? '').trim(), event: String(line.event ?? '').slice(0, 300), startTime: typeof line.startTime === 'string' ? line.startTime.slice(0, 40) : '', live: line.live === true }));
}
function booleanParam(params, name) {
  const value = params.get(name);
  if (value === null || value === '') return undefined;
  if (!['true', 'false'].includes(value)) throw new OddsError('BAD_REQUEST', `${name} must be true or false.`);
  return value === 'true';
}

/**
 * Handles a /api/odds/* request. `loadControls` reads the market distribution controls (null when the
 * server has no account services, so none can exist; a loader that throws makes every answer a 503).
 * `provider` replaces the configured one (tests).
 */
export async function handleOddsApi(req, res, url, { loadControls = null, defer = null, fetcher, providerConfig, env = process.env, provider: chosen = null } = {}) {
  const send = (status, text, headers = {}) => sendJsonText(req, res, status, text, headers);
  if (req.method !== 'GET') return send(405, JSON.stringify(new OddsError('BAD_REQUEST', 'Method not allowed.').toBody()), { Allow: 'GET' });
  const route = url.pathname.replace(/^\/api\/odds\/?/, '').replace(/\/+$/, '');
  try {
    const provider = chosen || selectProvider(env, { fetcher });
    const context = { loadControls, ...(defer ? { defer } : {}), ...(fetcher ? { fetcher } : {}), ...(providerConfig ? { providerConfig } : {}) };
    const params = url.searchParams;
    const prefs = () => parsePreferences(params.get('prefs'));
    let text;
    if (route === 'snapshot') text = await provider.snapshot(context, { prefs: prefs(), include: textParam(params, 'include', 200) || 'pricing,markets', sport: textParam(params, 'sport', 40), books: booksParam(params), markets: textParam(params, 'markets', 10) });
    else if (SECTION_ROUTES[route]) text = await provider.section(context, { prefs: prefs(), section: SECTION_ROUTES[route], sport: textParam(params, 'sport', 40), live: booleanParam(params, 'live'), minEv: numberParam(params, 'minEv', 0, 1), limit: numberParam(params, 'limit', 1, 2000), books: booksParam(params) });
    else if (route === 'events') text = await provider.events(context, { prefs: prefs(), sport: textParam(params, 'sport', 40), event: textParam(params, 'event', 300) });
    else if (route === 'dfs') text = await provider.dfs(context, { prefs: prefs(), limit: numberParam(params, 'limit', 1, MAX_DFS_PICKS) ?? 500, sport: textParam(params, 'sport', 40) });
    else if (route === 'dfs/price') text = await provider.dfsPrice(context, { prefs: prefs(), lines: linesParam(params) });
    else if (route === 'history') {
      const id = textParam(params, 'id', 200);
      if (!id) throw new OddsError('BAD_REQUEST', 'id is required.');
      text = await provider.history(context, { id, hours: numberParam(params, 'hours', 1, 168) ?? 24 });
    } else if (route === 'contracts') text = await provider.contracts(context, { platform: textParam(params, 'platform', 60) });
    else throw new OddsError('NOT_FOUND', 'Unknown odds API route.');
    // Every visitor asking the same URL gets the same answer (the API is public and the market controls are
    // site-wide), so Vercel's CDN keeps complete answers briefly and serves the last one while it fetches
    // the next: a visit never waits out the 10-60 s board rebuild or a cold function. An answer that is
    // warming up, partial (DFS before its sportsbook pricing) or held over is never shared, so the CDN can't
    // pin a degraded cold-start answer. Browsers still don't store any of it.
    const cdn = route === 'contracts' ? 's-maxage=60, stale-while-revalidate=300'
      : CDN_ROUTES.has(route) && complete(text) ? 's-maxage=5, stale-while-revalidate=30' : '';
    return send(200, text, { 'X-Odds-Provider': provider.id, ...(cdn ? { 'Vercel-CDN-Cache-Control': cdn } : {}) });
  } catch (caught) {
    const error = caught instanceof OddsError ? caught : new OddsError('UNAVAILABLE');
    if (!(caught instanceof OddsError)) console.error('[odds] Request failed:', caught?.stack || caught);
    return send(error.status, JSON.stringify(error.toBody()), Number.isFinite(error.retryAfterSeconds) ? { 'Retry-After': String(error.retryAfterSeconds) } : {});
  }
}
