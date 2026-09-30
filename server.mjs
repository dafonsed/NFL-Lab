import { handleReferralLink } from './lib/accounts/referrals.mjs';
import { handlePreviewLogin, previewLoginButton } from './lib/preview-login.mjs';
import { renderContentSitemap } from './lib/content/registry.mjs';
import { renderBeginnerGuide, renderLearnLibrary } from './lib/learn-library.mjs';
import { renderArt } from './lib/editorial-art.mjs';
import { siteChromeAssets, withSiteChrome } from './lib/site-chrome.mjs';
import { handleClientErrors } from './lib/client-errors.mjs';
import { INFO_PATHS, renderInfoPage } from './lib/info-pages.mjs';
import { analyticsCsp } from './lib/consent.mjs';
import { clientIp, createIpLimiter, createRefreshGate } from './lib/request-limits.mjs';
import { renderErrorPage, wantsHtml } from './lib/error-page.mjs';
import { compactNflBoard } from './lib/research-history.mjs';
import { landingResearch } from './lib/landing-data.mjs';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceStore, REFRESH_MS } from './lib/source.mjs';
import { MlbStore } from './lib/mlb/source.mjs';
import { SportsStore } from './lib/sports/source.mjs';
import { mlbModelReport } from './lib/mlb/forecast.mjs';
import { LiveNflStore } from './lib/live-nfl.mjs';
import { LiveSportsStore } from './lib/live-sports.mjs';
import { BetTrackerStore } from './lib/bet-tracker.mjs';
import { legacyBetTrackerUrl, productDashboardUrl } from './public/navigation.js';
import { renderProductDashboard } from './lib/product-dashboards.mjs';
import { renderAdminPage } from './lib/admin-page.mjs';
import { renderConnectedAdminPage } from './lib/admin-connected-page.mjs';
import { resolveHelpCenterRequest } from './lib/help-center-routing.mjs';
import { renderHelpCenterPage } from './lib/help-center-page.mjs';
import { renderSitePage, siteContext, legacyResearchUrl, sidebarGroup } from './lib/site-layout.mjs';
import { isEducationPath, renderEducationPage, renderEducationRobots } from './lib/betting-education.mjs';
import { isMarketGuidePath, renderMarketGuidePage } from './lib/online-sports-betting.mjs';
import { isSportsbookGuidePath, renderSportsbookGuidePage } from './lib/online-sportsbook-guides.mjs';
import { SimulationStore } from './lib/simulation-source.mjs';
import { SimulationPropsStore, createSimulationPropStores } from './lib/simulation-props.mjs';
import { renderBettingPage } from './lib/betting-pages.mjs';
import { renderOddsApiPage } from './lib/odds-api-page.mjs';
import { handleEvApi } from './lib/ev-api-proxy.mjs';
import { accountRuntime } from './lib/accounts/runtime.mjs';
import { accountJson, enforceAccountAccess } from './lib/accounts/http.mjs';
import { readMarketControls } from './lib/admin-market-controls.mjs';
import { sendPublicResponse } from './lib/http-compression.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const store = new SourceStore();
const nflLive = new LiveNflStore({ provider: store.provider });
const mlb = new MlbStore();
const sports = new SportsStore();
const liveSports = new LiveSportsStore({ provider: sports.provider });
const betTracker = new BetTrackerStore();
const simulation = new SimulationStore({ nflProvider: store.provider, provider: sports.provider });
const simulationProps = new SimulationPropsStore(createSimulationPropStores({ nfl: store, mlb, sports }));
let syncing = false, lastSync = null;
async function sync() {
  if (syncing) return;
  syncing = true;
  try { lastSync = await store.sync(); console.log(`[sync] ${JSON.stringify(lastSync)}`); }
  catch (e) { lastSync = { ok: false, error: e.message }; console.error(`[sync] ${e.message}`); }
  finally { syncing = false; }
}
// Browsers get a designed page; API calls and fetches keep the JSON error body.
function errorResponse(req, res, url, message, status) {
  if (url && wantsHtml(req, url)) return sendPublicResponse(req, res, renderErrorPage(status), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  return json(res, { error: message }, status);
}
// Public content pages are static per deploy; keep rendered HTML (keyed by host + path) in memory.
const pageCache = new Map();
function cachedPage(req, key, render) {
  const cacheKey = `${req.headers.host || ''}${key}`;
  if (pageCache.has(cacheKey)) return pageCache.get(cacheKey);
  const html = render();
  if (html) { if (pageCache.size >= 800) pageCache.delete(pageCache.keys().next().value); pageCache.set(cacheKey, html); }
  return html;
}
// Rendered editorial illustrations (/art/<key>.svg), by key.
const artCache = new Map();
const allowApiRequest = createIpLimiter({ max: 240, windowMs: 60_000 });
const allowRefresh = createRefreshGate({ windowMs: 60_000 });
function json(res, data, status = 200) { return sendPublicResponse(res.req, res, JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  let url = null;
  try {
    const host = req.headers.host || '';
    if (!process.env.VERCEL && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return json(res, { error: 'This workspace only accepts local connections.' }, 403);
    url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://static.www.nfl.com https://a.espncdn.com https://img.mlbstatic.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (process.env.VERCEL) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // The site never needs these browser capabilities; deny them to every page and embedded frame.
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    const accounts = await accountRuntime();
    const accountApi = /^\/api\/(?:auth(?:\/|$)|account(?:\/|$)|admin(?:\/|$)|content$|billing\/webhook$|cron\/accounts$)/.test(url.pathname);
    if (accountApi) {
      if (!accounts && req.method === 'GET' && url.pathname === '/api/auth/get-session') return accountJson(res, null);
      if (!accounts) return accountJson(res, { error: 'Account services are not configured yet. Please try again later.', code: 'ACCOUNTS_UNAVAILABLE' }, 503);
      if (await accounts.handle(req, res, url)) return;
      return accountJson(res, { error: 'Account route not found.' }, 404);
    }
    if (handleReferralLink(req, res, url, { secure: !!process.env.VERCEL })) return;
    // Local design preview only (scripts/design-preview.mjs); inert everywhere else.
    if (await handlePreviewLogin(req, res, url)) return;
    // Front-end error reports are public (signed-out pages crash too) and handled before plan gating.
    if (await handleClientErrors(req, res, url)) return;
    if (!['/api/cron/predictions', '/api/cron/mlb-predictions'].includes(url.pathname) && await enforceAccountAccess(req, res, url, accounts?.system)) return;
    if (url.pathname === '/admin/login') { res.writeHead(302, { Location: '/login?next=%2Fadmin', 'Cache-Control': 'no-store' }); return res.end(); }
    const trackerRedirect = legacyBetTrackerUrl(url);
    if (trackerRedirect) { res.writeHead(308, { Location: trackerRedirect, 'Cache-Control': 'no-cache' }); return res.end(); }
    if (url.pathname.startsWith('/api/ev/')) return await handleEvApi(req, res, url, { loadControls: async () => { try { return await readMarketControls(accounts.system.db); } catch { return []; } } });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Method not allowed.' }, 405);
    const helpRequest = resolveHelpCenterRequest(url, { host });
    if (helpRequest) {
      const help = renderHelpCenterPage(helpRequest.url, { basePath: helpRequest.basePath, appOrigin: helpRequest.appOrigin });
      if (!help) return errorResponse(req, res, url, 'Help page not found.', 404);
      return sendPublicResponse(req, res, help, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    if (url.pathname === '/ev-api-requirements.md') {
      const contents = await fs.readFile(new URL('./docs/ev-api-requirements.md', import.meta.url), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'attachment; filename="visualodds-ev-api-requirements.md"' });
      return res.end(req.method === 'HEAD' ? undefined : contents);
    }
  const analyticsSources = analyticsCsp();
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${analyticsSources.script} ${req.url.split('?')[0] === '/vendor/ocr/worker.min.js' ? "'wasm-unsafe-eval'" : ''}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://static.www.nfl.com https://a.espncdn.com https://img.mlbstatic.com data:; connect-src 'self'${analyticsSources.connect}; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`);
    if (url.pathname === '/admin-sandbox' || url.pathname.startsWith('/admin-sandbox/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const admin = renderAdminPage(url);
      if (!admin) return errorResponse(req, res, url, 'Not found.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : admin);
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || ['/admin.html', '/admin-accounts.html'].includes(url.pathname)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const admin = renderConnectedAdminPage(url);
      if (!admin) return errorResponse(req, res, url, 'Not found.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : admin);
    }
    const artMatch = url.pathname.match(/^\/art\/([a-z]+--[a-z0-9-]+)\.svg$/);
    if (artMatch) {
      if (!artCache.has(artMatch[1])) { if (artCache.size >= 2000) artCache.delete(artCache.keys().next().value); artCache.set(artMatch[1], await renderArt(artMatch[1])); }
      const svg = artCache.get(artMatch[1]);
      if (!svg) return errorResponse(req, res, url, 'Not found.', 404);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' });
      return res.end(req.method === 'HEAD' ? undefined : svg);
    }
    if (url.pathname === '/learn/beginner-guide' || url.pathname === '/learn/beginner-guide/') {
      return sendPublicResponse(req, res, renderBeginnerGuide(process.env.PUBLIC_SITE_URL || 'https://visualodds.com'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    if (url.pathname === '/learn' || url.pathname === '/learn/') {
      return sendPublicResponse(req, res, renderLearnLibrary(process.env.PUBLIC_SITE_URL || 'https://visualodds.com'), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
    }
    if (INFO_PATHS.includes(url.pathname.replace(/\/$/, ''))) {
      const page = renderInfoPage(url.pathname, process.env.PUBLIC_SITE_URL || 'https://visualodds.com');
      if (page) return sendPublicResponse(req, res, page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': url.pathname.startsWith('/status') ? 'no-store' : 'public, max-age=300' } });
    }
    if (url.pathname === '/betting-api' || url.pathname === '/betting-api/') {
      res.writeHead(308, { Location: '/odds-api' + url.search, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    if (url.pathname === '/odds-api/') {
      res.writeHead(308, { Location: '/odds-api' + url.search, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    const apiReference = url.pathname.match(/^\/odds-api(?:\/([a-z0-9-]+))?$/);
    if (apiReference) {
      const origin = (process.env.PUBLIC_SITE_URL || 'https://visualodds.com').replace(/\/+$/, '');
      const html = cachedPage(req, `odds-api:${apiReference[1] || ''}`, () => renderOddsApiPage(origin, apiReference[1] || ''));
      if (!html) return errorResponse(req, res, url, 'Not found.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    if (/^\/betting-(?:calculators|tools)(?:\/|$)/.test(url.pathname) || url.pathname === '/betting-education/positive-ev') {
      const origin = (process.env.PUBLIC_SITE_URL || 'https://visualodds.com').replace(/\/+$/, '');
      const html = renderBettingPage(url, origin);
      if (!html) return errorResponse(req, res, url, 'Not found.', 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return res.end(req.method === 'HEAD' ? undefined : renderEducationRobots(req));
    }
    if (url.pathname === '/sitemap.xml') {
      // Built from the content library (lib/content/registry.mjs), the one index of public pages.
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      const sitemap = renderContentSitemap(process.env.PUBLIC_SITE_URL || 'https://visualodds.com');
      return res.end(req.method === 'HEAD' ? undefined : sitemap);
    }
    if (isSportsbookGuidePath(url.pathname)) {
      if (url.pathname !== '/online-sportsbooks' && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = cachedPage(req, url.pathname, () => renderSportsbookGuidePage(url.pathname, req));
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : renderErrorPage(404));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (isMarketGuidePath(url.pathname)) {
      if (url.pathname !== '/online-sports-betting' && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = cachedPage(req, url.pathname, () => renderMarketGuidePage(url.pathname, req));
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : renderErrorPage(404));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (isEducationPath(url.pathname)) {
      if (url.pathname !== '/betting-education' && url.pathname !== '/betting-education/' && !/^\/betting-education\/page-\d+\/?$/.test(url.pathname) && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = cachedPage(req, url.pathname, () => renderEducationPage(url.pathname, req));
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : renderErrorPage(404));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const legacyUrl = legacyResearchUrl(url);
    if (legacyUrl) { res.writeHead(302, { Location: legacyUrl, 'Cache-Control': 'no-store' }); return res.end(); }
    if (['/api/cron/predictions','/api/cron/mlb-predictions'].includes(url.pathname)) {
      const expected=process.env.CRON_SECRET ? Buffer.from('Bearer '+process.env.CRON_SECRET) : null, actual=Buffer.from(req.headers.authorization||'');
      if(!expected||expected.length!==actual.length||!timingSafeEqual(expected,actual))return json(res,{error:'Unauthorized'},401);
      return json(res,await (url.pathname.includes('/mlb-')?mlb:store).captureDaily());
    }
    // Data APIs: a coarse per-IP ceiling (accounts have their own exact limiter).
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/account/') && !allowApiRequest(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return json(res, { error: 'Too many requests. Wait a minute and try again.', code: 'RATE_LIMITED' }, 429);
    }
    const forceRefresh = allowRefresh(url.pathname, url.searchParams.get('refresh') === '1');
    if(url.pathname==='/api/paper')return json(res,await (url.searchParams.get('sport')==='mlb'?mlb:store).paperPerformance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/performance') return json(res,await store.performance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/health') return json(res, { ok: true, app: 'independent-nfl-workspace', syncing, lastSync, refreshMinutes: REFRESH_MS / 60_000 });
    if (url.pathname === '/api/simulation/catalog') return json(res, await simulation.catalog(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/simulation/run') return json(res, await simulation.run(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/simulation/props') return json(res, await simulationProps.board(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/bets/catalog') return json(res,await betTracker.catalog(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/bets/game') return json(res,await betTracker.game(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/nfl/live') return json(res, await nflLive.board(Object.fromEntries(url.searchParams)));
    const liveRoute = /^\/api\/(nba|wnba|mlb)\/live$/.exec(url.pathname);
    if (liveRoute) return json(res, await liveSports.board({ ...Object.fromEntries(url.searchParams), sport: liveRoute[1] }));
    if (url.pathname === '/api/sports/performance') return json(res,await sports.performance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/sports/catalog') return json(res, await sports.catalog(Object.fromEntries(url.searchParams),forceRefresh));
    if (url.pathname === '/api/sports/board') return json(res, await sports.board(Object.fromEntries(url.searchParams),forceRefresh));
    if (url.pathname === '/api/mlb/board') return json(res, await mlb.board(Object.fromEntries(url.searchParams), forceRefresh));
    if (url.pathname === '/api/mlb/model') return json(res, mlbModelReport());
    if (url.pathname === '/api/mlb/evidence') return json(res, await mlb.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/evidence') return json(res, await store.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/catalog') { const {current,weeks}=await store.catalog(forceRefresh); return json(res,{current,weeks}); }
    if (url.pathname === '/api/landing/research') return json(res, landingResearch(await store.board({ market: 'rec_yds' })));
    if (url.pathname === '/api/nfl/research') { const board=await store.board(Object.fromEntries(url.searchParams)); const player=board.players.find(p=>p.playerId===url.searchParams.get('player')); if(!player)return json(res,{error:'Player not found in this matchup.'},404); return json(res,{player,current:board.current,sources:board.datasets,definitions:board.definitions}); }
    if (url.pathname === '/api/board') return json(res, compactNflBoard(await store.board(Object.fromEntries(url.searchParams), forceRefresh)));
    const names = { '/docs':'docs.html', '/docs.html':'docs.html', '/docs.css':'docs.css', '/docs.js':'docs.js', '/bets':'bets.html', '/bets/':'bets.html', '/bets.js':'bets.js', '/bet-legs.js':'bet-legs.js', '/bet-editor.js':'bet-editor.js', '/bet-utils.js':'bet-utils.js', '/presentation.js':'presentation.js', '/bets.css':'bets.css', '/wnba':'sports.html','/wnba/':'sports.html','/nba':'sports.html','/nhl':'sports.html','/soccer':'sports.html','/sports.js':'sports.js','/sports-view.js':'sports-view.js','/sports.css':'sports.css', '/nfl/live':'live.html', '/nfl/live/':'live.html', '/live.js':'live.js', '/live-game.js':'live-game.js', '/live.css':'live.css', '/live-utils.js':'live-utils.js', '/paper':'paper.html','/paper.js':'paper.js','/context-ui.js':'context-ui.js','/context.css':'context.css', '/performance':'performance.html', '/performance.js':'performance.js', '/forecast.css':'forecast.css', '/': 'index.html', '/nfl': 'index.html', '/mlb': 'mlb.html', '/mlb/': 'mlb.html', '/mlb.js': 'mlb.js', '/mlb-model.js':'mlb-model.js', '/mlb.css': 'mlb.css', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg', '/manifest.webmanifest': 'manifest.webmanifest' };
    const pagePath = url.pathname.replace(/\/$/, '') || '/';
    for (const file of ['admin.js', 'admin.css', 'admin-catalog.js', 'admin-store.js', 'admin-values.js']) names['/' + file] = file;
    for (const file of ['admin-shell.js', 'admin-unified.css', 'admin-overview.js', 'admin-overview.css']) names['/' + file] = file;
    for (const file of ['help.css', 'help.js', 'help-search.js']) names['/' + file] = file;
    for (const file of ['ev.js', 'ev-core.js', 'ev-workspace-clean.js', 'ev-feed.js', 'ev-feed.css', 'ev-bet-card.js', 'ev-bet-cards.css', 'dfs-workspace.js', 'dfs-workspace.css', 'odds-screen.js', 'odds-screen.css', 'ev.css', 'ev.html']) names['/' + file] = file;
    for (const file of ['ev-suite.js', 'ev-suite.css', 'ev-suite-storage.js', 'ev-advanced-math.js', 'ev-operations.js', 'ev-operations.css', 'ev-market-views.js', 'ev-market-views.css', 'ev-ledger.js', 'ev-ledger.css', 'ev-fantasy-lab.js', 'ev-fantasy-lab.css', 'ev.webmanifest', 'ev-sw.js', 'ev-app-icon.svg']) names['/' + file] = file;
    for (const file of ['platform-catalog.js', 'ev-tool-catalog.js', 'ev-more-menu.js', 'ev-secondary-views.js', 'ev-more-tools.css', 'ev-filters.js']) names['/' + file] = file;
    for (const file of ['research-filters.css', 'research-details.css', 'tool-dropdowns.css', 'arb-calculator.js', 'arb-calculator.css', 'bet-comparison.js', 'bet-comparison.css', 'bet-dashboard-v2.js', 'bet-dashboard-v3.js', 'bet-history.js', 'bet-inline.js', 'bet-inline.css',   'bet-tracker-reference.css', 'ev-arb-reference.css', 'ev-book-picker.css', 'ev-filter-polish.css',  'sites-redesign.css', 'smart-money.css']) names['/' + file] = file;
    if (/^\/ev-icons\/(date|leagues|markets|odds|sports)\.svg$/.test(pagePath)) names[pagePath] = pagePath.slice(1);
    if (['/product-switcher.js','/product-switcher.css'].includes(pagePath)) names[pagePath] = pagePath.slice(1);
    if (['/sportsbook-availability.js','/sportsbook-state.js','/sportsbook-state.css'].includes(pagePath)) names[pagePath] = pagePath.slice(1);
    if (pagePath === '/ev') names[pagePath] = 'ev.html';
    if (pagePath === '/ev/tracker') names[pagePath] = 'bets.html';
    if (pagePath === '/bet-tracker-migration.js') names[pagePath] = 'bet-tracker-migration.js';
    for (const file of ['login.html', 'register.html', 'auth.css', 'auth.js', 'account-2026.css']) names['/' + file] = file;
    for (const file of ['account-client.js', 'account-system.css', 'account-mobile.css', 'account-sync.js', 'account.js', 'recovery.js', 'admin-accounts.js', 'admin-connected.css', 'admin-confirmation.js', 'admin-operations.js', 'support.js', 'ev-mobile.css', 'ev-mobile.js', 'mobile-workspace.css', 'mobile-workspace.js', 'ev-bet-card.js', 'ev-bet-cards.css', 'ev-board.js', 'ev-board.css', 'alert-delivery.js', 'onboarding.js', 'bet-limits.js', 'tracker-analytics.js', 'ev-controls.css', 'line-history.js', 'line-history.css', 'trends-board.css', 'models-board.css', 'hub-pages.css', 'account-refresh.css', 'home-dashboard.css', 'player-detail.css', 'live-sim.css', 'tracker-2026.css', 'ev-suite-2026.css', 'boards-polish.css']) names['/' + file] = file;
    const accountPages = { '/account': 'account.html', '/account.html': 'account.html', '/admin': 'admin-accounts.html', '/admin/accounts': 'admin-accounts.html', '/admin/operations': 'admin-operations.html', '/support': 'support.html', '/admin-accounts.html': 'admin-accounts.html', '/forgot-password': 'recovery.html', '/reset-password': 'recovery.html', '/verify-email': 'recovery.html', '/two-factor': 'recovery.html', '/terms': 'account-terms.html', '/privacy': 'account-privacy.html' };
    if (accountPages[pagePath]) names[pagePath] = accountPages[pagePath];
    if (pagePath === '/login') names[pagePath] = 'login.html';
    if (pagePath === '/register') names[pagePath] = 'register.html';
    if (['bet-dashboard.js','bet-analytics.js','bet-slip-import.js','bet-slip-parser.js'].some(file => pagePath === '/' + file)) names[pagePath]=pagePath.slice(1);
    if (pagePath === '/vendor/qrcode/qrcode.js') names[pagePath]=pagePath.slice(1);
    if (/^\/vendor\/ocr\/(?:tesseract\.esm\.min\.js|worker\.min\.js|tesseract-core-(?:lstm|simd-lstm|relaxedsimd-lstm)\.wasm\.js|eng\.traineddata\.gz|[A-Za-z.-]+\.txt)$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/leagues\/(nfl|mlb|nba|wnba|nhl|premier)\.png$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/teams\/mlb\/(mia|nym)\.svg$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/brands\/[a-z0-9-]+\.png$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath === '/assets/og/visualodds.png') names[pagePath]=pagePath.slice(1);
    if (['/assets/sportsbooks/fanduel.png','/assets/sportsbooks/draftkings.svg'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (['/assets/fonts/InterVariable.woff2','/assets/fonts/Inter-LICENSE.txt','/assets/fonts/OutfitVariable.ttf','/assets/fonts/Outfit-LICENSE.txt'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath==='/sports-identity.js') names[pagePath]='sports-identity.js';
    if (pagePath==='/trends-detail.js') names[pagePath]='trends-detail.js';
    if (pagePath==='/trends-controls.js') names[pagePath]='trends-controls.js';
    if (['/calendar-control.js','/trends-filters.js','/chart-controls.js'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath==='/ui-theme.css') names[pagePath]='ui-theme.css';
    if (pagePath==='/reference-design.css') names[pagePath]='reference-design.css';
    if (pagePath==='/workspace-palette.css') names[pagePath]='workspace-palette.css';
    if (pagePath==='/performance-mobile.css') names[pagePath]='performance-mobile.css';
    if (['/dashboard-unified.css','/dashboard-navigation.css','/dashboard-navigation.js','/player-order.js'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath==='/sportslab-2026.css') names[pagePath]='sportslab-2026.css';
    if (pagePath==='/content-2026.css') names[pagePath]='content-2026.css';
    for (const file of ['learn.css','learn.js','beginner-guide.js','site-chrome.css','site-footer.css','editorial-art.css','odds-api.js','api-reference-code.js','assets/art/odds.svg','assets/art/probability.svg','assets/art/comparison.svg','assets/art/calculator.svg','assets/art/arbitrage.svg','assets/art/trends.svg','assets/art/ticket.svg','assets/art/tracker.svg','notification-bell.js','command-palette.js','command-palette.css','error-reporter.js','consent.js','consent.css','info-pages.css','status.js','landing-2026.css','landing-widgets.css','landing-motion.js','landing-header.js','landing-demo-bets.js','landing-reviews.js','landing-pricing.js','landing-nav.js']) names['/' + file] = file;
    if (pagePath==='/landing-research-snapshot.json') names[pagePath]='landing-research-snapshot.json';
    for (const file of ['calculator-design.css', 'article-interactives.css', 'article-interactives.js', 'longform-articles.css', 'longform-articles.js', 'sportsbook-guide-directory.js', 'assets/longform-editorial-sprite.png']) names['/' + file] = file;
    if (pagePath==='/betting-education.css') names[pagePath]='betting-education.css';
    if (pagePath==='/betting-education-dashboard.js') names[pagePath]='betting-education-dashboard.js';
    if (pagePath==='/online-sports-betting.css') names[pagePath]='online-sports-betting.css';
    if (pagePath==='/sportsbook-guide.css') names[pagePath]='sportsbook-guide.css';
    if (pagePath==='/odds-api.css') names[pagePath]='odds-api.css';
    if (pagePath==='/market-guide-search.js') names[pagePath]='market-guide-search.js';
    for (const file of ['simulation.js', 'simulation-props.js', 'simulation.css']) names['/' + file] = file;
    if (pagePath === '/simulation' || /^\/(nfl|nba|wnba|mlb|nhl|soccer)\/simulation$/.test(pagePath)) names[pagePath] = 'simulation.html';
    if (['/navigation.js','/dashboard.css','/landing.js','/landing-live.js','/landing-demo.js','/demo-data.js','/home.js','/product-ui.js','/player-research.js','/chart-line.js','/research-notes.js','/research-data.js','/site-preferences.js','/player-research.css','/workspace.css','/trends.css','/trends.js','/trends-data.js','/app-design.css','/workspace-ui.js','/ui-icons.js','/betting-pages.js','/betting-pages.css'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    for (const file of ['bet-expanded.js','bet-expanded.css','bet-reference-history.js']) names['/' + file] = file;
    const preferredGroup = /(?:^|;\s*)sl-group=(trends|models|ev)(?:;|$)/.exec(req.headers.cookie || '')?.[1] || null;
    if (pagePath === '/research') {
      // The combined Dashboard became one dashboard per workspace; open the viewer's current one.
      const { sport } = siteContext(url), player = url.searchParams.get('researchPlayer');
      const location = player ? `/${sport}?` + new URLSearchParams({ ...(url.searchParams.get('prop') ? { market: url.searchParams.get('prop') } : {}), researchPlayer: player }) : productDashboardUrl(sidebarGroup('home', req.sportslabFeatures || null, preferredGroup) || 'models', sport);
      res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }); return res.end();
    }
    const dashboard = renderProductDashboard(url);
    if (dashboard) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(renderSitePage(dashboard, url, { features: req.sportslabFeatures || null, group: preferredGroup })); }
    const context = siteContext(url);
    const name = context.section === 'landing' ? 'landing.html' : context.section === 'home' ? 'home.html' : context.section === 'trends' ? 'trends.html' : /^\/(nba|wnba|mlb)\/live$/.test(pagePath) ? 'live-sports.html' : pagePath === '/live' ? 'live-hub.html' : pagePath === '/site-layout.css' ? 'site-layout.css' : pagePath === '/live-sports.js' ? 'live-sports.js' : names[pagePath];
    if (!name) return errorResponse(req, res, url, 'Not found.', 404);
    const bytes = await fs.readFile(path.join(publicDir, name));
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.gz': 'application/gzip', '.webmanifest': 'application/manifest+json' };
    const body = name === 'docs.html' ? withSiteChrome(bytes.toString('utf8'), { current: 'api' }).replace('</head>', siteChromeAssets() + '</head>') : name === 'login.html' && previewLoginButton(req, url) ? bytes.toString('utf8').replace('<p class="account-switch">', previewLoginButton(req, url) + '<p class="account-switch">') : ['login.html', 'register.html', ...Object.values(accountPages)].includes(name) ? bytes : name.endsWith('.html') ? renderSitePage(bytes.toString('utf8'), url, { features: req.sportslabFeatures || null, group: preferredGroup }) : bytes;
    await sendPublicResponse(req, res, body, { headers: { 'Content-Type': (types[path.extname(name)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-cache' } });
  } catch (e) { console.error('[request] Request failed.'); const status = e.status || 500; errorResponse(req, res, url, 'This request could not be completed. Please try again.', status); }
});
const port = Number(process.env.PORT || 3100);
// Vercel owns the listener and invocation lifetime. Dataset refreshes there run
// on demand through SourceStore's TTL; a background interval cannot be relied on.
if (!process.env.VERCEL) server.listen(port, '127.0.0.1', () => { console.log(`VisualOdds is ready at http://127.0.0.1:${port}`); if (process.env.AUTO_SYNC !== '0') { sync(); setInterval(sync, REFRESH_MS).unref(); } });
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open http://127.0.0.1:${port}, or set PORT to another port.` : e.message); process.exitCode = 1; });
export default server;
