import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSitePage } from '../lib/site-layout.mjs';
import { educationArticles, renderEducationPage, renderEducationRobots, renderEducationSitemap } from '../lib/betting-education.mjs';
import { bettingPagePaths, renderBettingPage, renderBettingSitemapEntries } from '../lib/betting-pages.mjs';
import { marketGuidePaths, renderMarketGuidePage, renderMarketGuideSitemapEntries } from '../lib/online-sports-betting.mjs';
import { renderSportsbookGuidePage, renderSportsbookGuideSitemapEntries } from '../lib/online-sportsbook-guides.mjs';
import { renderOddsApiPage } from '../lib/odds-api-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'dist', 'server');
const upstream = 'https://nfl-lab-xi.vercel.app';
const origin = 'https://sportslab.fnsd.chatgpt.site';
process.env.PUBLIC_SITE_URL = origin;
const sports = ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer'];
const pages = {};

async function page(key, filename, pathname, search = '') {
  const html = await readFile(path.join(publicDir, filename), 'utf8');
  pages[key] = renderSitePage(html, new URL(`${pathname}${search}`, 'https://sportslab.local'));
}

await page('landing', 'landing.html', '/');
await page('index', 'index.html', '/nfl');
await page('research:nfl', 'home.html', '/research', '?sport=nfl');
for (const sport of sports) {
  await page(`research:${sport}`, 'home.html', '/research', `?sport=${sport}`);
  await page(`bets:${sport}`, 'bets.html', '/bets', `?sport=${sport}`);
  await page(`simulation:${sport}`, 'simulation.html', `/${sport}/simulation`);
  await page(`trends:${sport}`, 'trends.html', `/${sport}`, '?view=trends');
  if (sport !== 'nfl') await page(`sport:${sport}`, sport === 'mlb' ? 'mlb.html' : 'sports.html', `/${sport}`);
}
await page('bets', 'bets.html', '/bets');
await page('live', 'live-hub.html', '/live');
await page('live:nfl', 'live.html', '/nfl/live');
for (const sport of ['mlb', 'nba', 'wnba']) await page(`live:${sport}`, 'live-sports.html', `/${sport}/live`);
await page('simulation', 'simulation.html', '/simulation');
await page('paper:nfl', 'paper.html', '/paper', '?sport=nfl');
await page('paper:mlb', 'paper.html', '/paper', '?sport=mlb');
await page('performance', 'performance.html', '/performance');
await page('ev', 'ev.html', '/ev');
for (const sport of sports) await page(`ev:${sport}`, 'ev.html', '/ev', `?sport=${sport}`);

// Keep the pages already available in the main SportsLab project on Sites.
// These renderers produce standalone HTML and use the same public CSS/JS assets.
const request = { headers: {} };
const addRendered = (pathname, html) => {
  if (!html) throw Error(`No page was rendered for ${pathname}`);
  pages[pathname] = html;
};
for (const pathname of bettingPagePaths) addRendered(pathname, renderBettingPage(new URL(pathname, origin), origin));
for (const pathname of ['/betting-education', ...educationArticles.map(article => `/betting-education/${article.slug}`)]) {
  if (!pages[pathname]) addRendered(pathname, renderEducationPage(pathname, request));
}
for (let index = 2; ; index++) {
  const pathname = `/betting-education/page-${index}`;
  const html = renderEducationPage(pathname, request);
  if (!html) break;
  addRendered(pathname, html);
}
for (const pathname of marketGuidePaths) addRendered(pathname, renderMarketGuidePage(pathname, request));
const sportsbookEntries = renderSportsbookGuideSitemapEntries(request);
const sportsbookPaths = [...sportsbookEntries.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname);
for (const pathname of sportsbookPaths) addRendered(pathname, renderSportsbookGuidePage(pathname, request));
addRendered('/odds-api', renderOddsApiPage(origin));
const documents = {
  '/robots.txt': ['text/plain; charset=utf-8', renderEducationRobots(request)],
  '/sitemap.xml': ['application/xml; charset=utf-8', renderEducationSitemap(request).replace('</urlset>', `${renderMarketGuideSitemapEntries(request)}${sportsbookEntries}${renderBettingSitemapEntries(origin)}<url><loc>${origin}/odds-api</loc></url></urlset>`)]
};

const types = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};
const assets = {};
async function visit(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (name !== 'vendor/ocr') await visit(filename, name);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.html') || name.endsWith('/SOURCES.md')) continue;
    const type = types[path.extname(name)];
    if (!type) continue;
    assets[`/${name}`] = [type, (await readFile(filename)).toString('base64')];
  }
}
await visit(publicDir);

const worker = `// Generated from public/ by scripts/build.mjs. Edit the source files instead.
const pages = ${JSON.stringify(pages)};
const documents = ${JSON.stringify(documents)};
const assets = ${JSON.stringify(assets)};
const upstream = ${JSON.stringify(upstream)};
const sports = new Set(${JSON.stringify(sports)});
const csp = "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://static.www.nfl.com https://a.espncdn.com https://img.mlbstatic.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
function htmlKey(url) {
  const path = url.pathname.replace(/\\/$/, '') || '/';
  const sport = url.searchParams.get('sport');
  if (path === '/') return 'landing';
  if (path === '/research') return 'research:' + (sports.has(sport) ? sport : 'mlb');
  if (path === '/bets') return sports.has(sport) ? 'bets:' + sport : 'bets';
  if (path === '/paper') return sport === 'mlb' ? 'paper:mlb' : 'paper:nfl';
  if (path === '/performance') return 'performance';
  if (path === '/ev') return sports.has(sport) ? 'ev:' + sport : 'ev';
  if (path === '/live') return 'live';
  if (path === '/simulation') return 'simulation';
  const live = /^\\/(nfl|mlb|nba|wnba)\\/live$/.exec(path);
  if (live) return 'live:' + live[1];
  const simulation = /^\\/(nfl|mlb|nba|wnba|nhl|soccer)\\/simulation$/.exec(path);
  if (simulation) return 'simulation:' + simulation[1];
  if (sports.has(path.slice(1))) return url.searchParams.get('view') === 'trends' ? 'trends:' + path.slice(1) : path === '/nfl' ? 'index' : 'sport:' + path.slice(1);
  if (path === '/index.html') return 'index';
  if (pages[path]) return path;
  return null;
}
function response(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...headers, ...extra } });
}
export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return response(JSON.stringify({ error: 'Method not allowed.' }), 405, { 'content-type': 'application/json; charset=utf-8' });
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/' && ['view', 'market', 'season', 'week', 'sport', 'date', 'prop', 'period', 'game', 'researchPlayer'].some(key => url.searchParams.has(key))) {
      const nfl = ['view', 'market', 'season', 'week'].some(key => url.searchParams.has(key));
      return Response.redirect(new URL((nfl ? '/nfl' : '/research') + url.search, url), 302);
    }
    if (path.startsWith('/api/') || path.startsWith('/vendor/ocr/')) {
      if (path.startsWith('/api/cron/')) return response(JSON.stringify({ error: 'Not found.' }), 404, { 'content-type': 'application/json; charset=utf-8' });
      const target = new URL(path + url.search, upstream);
      try {
        const source = await fetch(target, { method: request.method, headers: { accept: request.headers.get('accept') || '*/*' }, redirect: 'follow' });
        const out = new Headers(source.headers);
        out.delete('set-cookie');
        out.delete('content-encoding');
        out.delete('content-length');
        out.delete('transfer-encoding');
        out.set('x-content-type-options', 'nosniff');
        out.set('referrer-policy', 'no-referrer');
        if (path === '/vendor/ocr/worker.min.js') out.set('content-security-policy', csp.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'"));
        return new Response(request.method === 'HEAD' ? null : source.body, { status: source.status, headers: out });
      } catch {
        return response(JSON.stringify({ error: 'The live data service is temporarily unavailable.' }), 502, { 'content-type': 'application/json; charset=utf-8' });
      }
    }
    const key = htmlKey(url);
    if (key && pages[key]) return response(request.method === 'HEAD' ? null : pages[key], 200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp, 'cache-control': 'no-cache' });
    const document = documents[path];
    if (document) return response(request.method === 'HEAD' ? null : document[1], 200, { 'content-type': document[0], 'cache-control': 'public, max-age=3600' });
    const asset = assets[path];
    if (asset) return response(request.method === 'HEAD' ? null : decode(asset[1]), 200, { 'content-type': asset[0], 'cache-control': 'public, max-age=300' });
    return response(JSON.stringify({ error: 'Not found.' }), 404, { 'content-type': 'application/json; charset=utf-8' });
  }
};
`;
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'index.js'), worker);
console.log(`Built ${Object.keys(pages).length} page variants and ${Object.keys(assets).length} local assets.`);
