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
import { renderSitePage, siteContext, legacyResearchUrl } from './lib/site-layout.mjs';
import { isEducationPath, renderEducationPage, renderEducationRobots, renderEducationSitemap } from './lib/betting-education.mjs';
import { isMarketGuidePath, renderMarketGuidePage, renderMarketGuideSitemapEntries } from './lib/online-sports-betting.mjs';
import { isSportsbookGuidePath, renderSportsbookGuidePage, renderSportsbookGuideSitemapEntries } from './lib/online-sportsbook-guides.mjs';
import { SimulationStore } from './lib/simulation-source.mjs';
import { SimulationPropsStore, createSimulationPropStores } from './lib/simulation-props.mjs';
import { renderBettingPage, renderBettingSitemapEntries } from './lib/betting-pages.mjs';
import { renderOddsApiPage } from './lib/odds-api-page.mjs';
import { handleEvApi } from './lib/ev-api-proxy.mjs';

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
function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const host = req.headers.host || '';
    if (!process.env.VERCEL && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return json(res, { error: 'This workspace only accepts local connections.' }, 403);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/ev/')) return await handleEvApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Method not allowed.' }, 405);
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' ${req.url.split('?')[0] === '/vendor/ocr/worker.min.js' ? "'wasm-unsafe-eval'" : ''}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://static.www.nfl.com https://a.espncdn.com https://img.mlbstatic.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`);
    if (url.pathname === '/betting-api' || url.pathname === '/betting-api/') {
      res.writeHead(308, { Location: '/odds-api' + url.search, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    if (url.pathname === '/odds-api/') {
      res.writeHead(308, { Location: '/odds-api' + url.search, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    if (url.pathname === '/odds-api') {
      const origin = (process.env.PUBLIC_SITE_URL || 'https://nfl-lab-xi.vercel.app').replace(/\/+$/, '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : renderOddsApiPage(origin));
    }
    if (/^\/betting-(?:calculators|tools)(?:\/|$)/.test(url.pathname) || url.pathname === '/betting-education/positive-ev') {
      const origin = (process.env.PUBLIC_SITE_URL || 'https://nfl-lab-xi.vercel.app').replace(/\/+$/, '');
      const html = renderBettingPage(url, origin);
      if (!html) return json(res, { error: 'Not found.' }, 404);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return res.end(req.method === 'HEAD' ? undefined : renderEducationRobots(req));
    }
    if (url.pathname === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      const publicOrigin = (process.env.PUBLIC_SITE_URL || 'https://nfl-lab-xi.vercel.app').replace(/\/+$/, '');
      const sitemap = renderEducationSitemap(req).replace('</urlset>', `${renderMarketGuideSitemapEntries(req)}${renderSportsbookGuideSitemapEntries(req)}${renderBettingSitemapEntries(publicOrigin)}<url><loc>${publicOrigin}/odds-api</loc></url></urlset>`);
      return res.end(req.method === 'HEAD' ? undefined : sitemap);
    }
    if (isSportsbookGuidePath(url.pathname)) {
      if (url.pathname !== '/online-sportsbooks' && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = renderSportsbookGuidePage(url.pathname, req);
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Sportsbook guide not found | Sportslab</title><body><main><h1>Sportsbook guide not found</h1><p><a href="/online-sportsbooks">Browse sportsbook and app guides</a></p></main></body></html>');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (isMarketGuidePath(url.pathname)) {
      if (url.pathname !== '/online-sports-betting' && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = renderMarketGuidePage(url.pathname, req);
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Market guide not found | Sportslab</title><body><main><h1>Market guide not found</h1><p><a href="/online-sports-betting">Browse sports betting guides</a></p></main></body></html>');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (isEducationPath(url.pathname)) {
      if (url.pathname !== '/betting-education' && url.pathname !== '/betting-education/' && !/^\/betting-education\/page-\d+\/?$/.test(url.pathname) && url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname.slice(0, -1) + url.search, 'Cache-Control': 'public, max-age=86400' });
        return res.end();
      }
      const body = renderEducationPage(url.pathname, req);
      if (!body) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
        return res.end(req.method === 'HEAD' ? undefined : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Guide not found | Sportslab</title><body><main><h1>Guide not found</h1><p><a href="/betting-education">Browse the education library</a></p></main></body></html>');
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
    if (url.pathname === '/api/sports/catalog') return json(res, await sports.catalog(Object.fromEntries(url.searchParams),url.searchParams.get('refresh')==='1'));
    if (url.pathname === '/api/sports/board') return json(res, await sports.board(Object.fromEntries(url.searchParams),url.searchParams.get('refresh')==='1'));
    if (url.pathname === '/api/mlb/board') return json(res, await mlb.board(Object.fromEntries(url.searchParams), url.searchParams.get('refresh') === '1'));
    if (url.pathname === '/api/mlb/model') return json(res, mlbModelReport());
    if (url.pathname === '/api/mlb/evidence') return json(res, await mlb.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/evidence') return json(res, await store.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/catalog') { const {current,weeks}=await store.catalog(url.searchParams.get('refresh') === '1'); return json(res,{current,weeks}); }
    if (url.pathname === '/api/landing/research') return json(res, landingResearch(await store.board({ market: 'rec_yds' })));
    if (url.pathname === '/api/nfl/research') { const board=await store.board(Object.fromEntries(url.searchParams)); const player=board.players.find(p=>p.playerId===url.searchParams.get('player')); if(!player)return json(res,{error:'Player not found in this matchup.'},404); return json(res,{player,current:board.current,sources:board.datasets,definitions:board.definitions}); }
    if (url.pathname === '/api/board') return json(res, compactNflBoard(await store.board(Object.fromEntries(url.searchParams), url.searchParams.get('refresh') === '1')));
    const names = { '/docs':'docs.html', '/docs.html':'docs.html', '/docs.css':'docs.css', '/docs.js':'docs.js', '/bets':'bets.html', '/bets/':'bets.html', '/bets.js':'bets.js', '/bet-legs.js':'bet-legs.js', '/bet-editor.js':'bet-editor.js', '/bet-utils.js':'bet-utils.js', '/presentation.js':'presentation.js', '/bets.css':'bets.css', '/wnba':'sports.html','/wnba/':'sports.html','/nba':'sports.html','/nhl':'sports.html','/soccer':'sports.html','/sports.js':'sports.js','/sports-view.js':'sports-view.js','/sports.css':'sports.css', '/nfl/live':'live.html', '/nfl/live/':'live.html', '/live.js':'live.js', '/live-game.js':'live-game.js', '/live.css':'live.css', '/live-utils.js':'live-utils.js', '/paper':'paper.html','/paper.js':'paper.js','/context-ui.js':'context-ui.js','/context.css':'context.css', '/performance':'performance.html', '/performance.js':'performance.js', '/forecast.css':'forecast.css', '/': 'index.html', '/nfl': 'index.html', '/mlb': 'mlb.html', '/mlb/': 'mlb.html', '/mlb.js': 'mlb.js', '/mlb-model.js':'mlb-model.js', '/mlb.css': 'mlb.css', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg', '/manifest.webmanifest': 'manifest.webmanifest' };
    const pagePath = url.pathname.replace(/\/$/, '') || '/';
    for (const file of ['ev.js', 'ev-core.js', 'ev-demo.js', 'dfs-jersey.js', 'ev.css', 'ev.html']) names['/' + file] = file;
    if (pagePath === '/ev') names[pagePath] = 'ev.html';
    for (const file of ['login.html', 'register.html', 'auth.css', 'auth.js']) names['/' + file] = file;
    if (pagePath === '/login') names[pagePath] = 'login.html';
    if (pagePath === '/register') names[pagePath] = 'register.html';
    if (['bet-dashboard.js','bet-analytics.js','bet-slip-import.js','bet-slip-parser.js'].some(file => pagePath === '/' + file)) names[pagePath]=pagePath.slice(1);
    if (/^\/vendor\/ocr\/(?:tesseract\.esm\.min\.js|worker\.min\.js|tesseract-core-(?:lstm|simd-lstm|relaxedsimd-lstm)\.wasm\.js|eng\.traineddata\.gz|[A-Za-z.-]+\.txt)$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/leagues\/(nfl|mlb|nba|wnba|nhl|premier)\.png$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/teams\/mlb\/(mia|nym)\.svg$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (/^\/assets\/brands\/[a-z0-9-]+\.png$/.test(pagePath)) names[pagePath]=pagePath.slice(1);
    if (['/assets/sportsbooks/fanduel.png','/assets/sportsbooks/draftkings.svg'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (['/assets/fonts/InterVariable.woff2','/assets/fonts/Inter-LICENSE.txt'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath==='/sports-identity.js') names[pagePath]='sports-identity.js';
    if (pagePath==='/trends-detail.js') names[pagePath]='trends-detail.js';
    if (pagePath==='/trends-controls.js') names[pagePath]='trends-controls.js';
    if (['/calendar-control.js','/trends-filters.js','/chart-controls.js'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    if (pagePath==='/ui-theme.css') names[pagePath]='ui-theme.css';
    if (pagePath==='/reference-design.css') names[pagePath]='reference-design.css';
    if (pagePath==='/workspace-palette.css') names[pagePath]='workspace-palette.css';
    if (pagePath==='/oddsjam-design.css') names[pagePath]='oddsjam-design.css';
    if (pagePath==='/landing-refined.css') names[pagePath]='landing-refined.css';
    for (const file of ['landing-home.css','landing-header.css','landing-footer.css','landing-atmosphere.css','landing-pricing.css','landing-nav.css','landing-header.js','landing-demo-bets.js','landing-reviews.js','landing-pricing.js','landing-nav.js']) names['/' + file] = file;
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
    if (['/navigation.js','/dashboard.css','/landing.css','/landing.js','/landing-live.js','/landing-demo.js','/landing-demo.css','/demo-data.js','/home.js','/product-ui.js','/player-research.js','/chart-line.js','/research-notes.js','/research-data.js','/site-preferences.js','/player-research.css','/workspace.css','/trends.css','/trends.js','/trends-data.js','/app-design.css','/workspace-ui.js','/ui-icons.js','/betting-pages.js','/betting-pages.css'].includes(pagePath)) names[pagePath]=pagePath.slice(1);
    const context = siteContext(url);
    const name = context.section === 'landing' ? 'landing.html' : context.section === 'home' ? 'home.html' : context.section === 'trends' ? 'trends.html' : /^\/(nba|wnba|mlb)\/live$/.test(pagePath) ? 'live-sports.html' : pagePath === '/live' ? 'live-hub.html' : pagePath === '/site-layout.css' ? 'site-layout.css' : pagePath === '/live-sports.js' ? 'live-sports.js' : names[pagePath];
    if (!name) return json(res, { error: 'Not found.' }, 404);
    const bytes = await fs.readFile(path.join(publicDir, name));
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.gz': 'application/gzip', '.webmanifest': 'application/manifest+json' };
    const body = ['docs.html', 'login.html', 'register.html'].includes(name) ? bytes : name.endsWith('.html') ? renderSitePage(bytes.toString('utf8'), url) : bytes;
    res.writeHead(200, { 'Content-Type': (types[path.extname(name)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) { console.error(`[request] ${e.message}`); json(res, { error: e.message }, e.status || 500); }
});
const port = Number(process.env.PORT || 3100);
// Vercel owns the listener and invocation lifetime. Dataset refreshes there run
// on demand through SourceStore's TTL; a background interval cannot be relied on.
if (!process.env.VERCEL) server.listen(port, '127.0.0.1', () => { console.log(`NFL Analytics is ready at http://127.0.0.1:${port}`); if (process.env.AUTO_SYNC !== '0') { sync(); setInterval(sync, REFRESH_MS).unref(); } });
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open http://127.0.0.1:${port}, or set PORT to another port.` : e.message); process.exitCode = 1; });
export default server;
