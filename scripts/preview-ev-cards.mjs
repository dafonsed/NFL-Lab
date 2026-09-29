// Isolated, loopback-only UI fixture. Serves public pages and synthetic demo data;
// it never mounts account services, private stores, or application API handlers.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSitePage, legacyResearchUrl } from '../lib/site-layout.mjs';
import { renderProductDashboard } from '../lib/product-dashboards.mjs';
import { previewResearchData } from './preview-research-data.mjs';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.webmanifest':'application/manifest+json'};
const sports = new Set(['nfl','mlb','nba','wnba','nhl','soccer']);
function pageFile(url) {
  const route = url.pathname.replace(/\/$/, '') || '/';
  if (route === '/') return 'landing.html';
  if (route === '/research') return 'home.html';
  if (route === '/ev') return 'ev.html';
  if (['/ev/tracker', '/bets'].includes(route)) return 'bets.html';
  const sport = route.slice(1);
  if (sports.has(sport)) return url.searchParams.get('view') === 'trends' ? 'trends.html' : sport === 'nfl' ? 'index.html' : sport === 'mlb' ? 'mlb.html' : 'sports.html';
  return null;
}
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '')) { res.writeHead(403);res.end();return; }
    const url = new URL(req.url,'http://127.0.0.1');
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405);res.end();return; }
    const legacy = legacyResearchUrl(url);
    if (legacy) { res.writeHead(302, {Location:legacy});res.end();return; }
    // Anonymous session fixture activates the app's in-memory demo store only.
    if (url.pathname==='/api/auth/get-session') {res.setHeader('Content-Type','application/json');res.end('null');return;}
    const data = previewResearchData(url);
    if (data !== null) { res.setHeader('Content-Type','application/json');res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));return; }
    const dashboard = renderProductDashboard(url), filename = pageFile(url);
    if (dashboard || filename) {
      let template = dashboard || await fs.readFile(path.join(root,filename),'utf8');
      if (['home.html','index.html','mlb.html','sports.html','trends.html'].includes(filename)) {
        template = template.replace(/(<main\b[^>]*>)/, '$1<p class="board-disclosure" role="note">Local design preview · Illustrative player data and prices.</p>');
      }
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : renderSitePage(template,url));return;
    }
    const asset = path.resolve(root,'.'+decodeURIComponent(url.pathname));
    const relative = path.relative(root,asset);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !mime[path.extname(asset)]) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(asset)]);
    const bytes = await fs.readFile(asset);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {res.writeHead(404);res.end();}
});
server.listen(3188,'127.0.0.1',()=>console.log('Local design preview: http://127.0.0.1:3188/research?sport=nfl'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
