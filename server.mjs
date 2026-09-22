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

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const store = new SourceStore();
const nflLive = new LiveNflStore({ provider: store.provider });
const mlb = new MlbStore();
const sports = new SportsStore();
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://static.www.nfl.com https://a.espncdn.com https://img.mlbstatic.com data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  try {
    const host = req.headers.host || '';
    if (!process.env.VERCEL && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return json(res, { error: 'This workspace only accepts local connections.' }, 403);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Method not allowed.' }, 405);
    const url = new URL(req.url, 'http://localhost');
    if (['/api/cron/predictions','/api/cron/mlb-predictions'].includes(url.pathname)) {
      const expected=process.env.CRON_SECRET ? Buffer.from('Bearer '+process.env.CRON_SECRET) : null, actual=Buffer.from(req.headers.authorization||'');
      if(!expected||expected.length!==actual.length||!timingSafeEqual(expected,actual))return json(res,{error:'Unauthorized'},401);
      return json(res,await (url.pathname.includes('/mlb-')?mlb:store).captureDaily());
    }
    if(url.pathname==='/api/paper')return json(res,await (url.searchParams.get('sport')==='mlb'?mlb:store).paperPerformance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/performance') return json(res,await store.performance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/health') return json(res, { ok: true, app: 'independent-nfl-workspace', syncing, lastSync, refreshMinutes: REFRESH_MS / 60_000 });
    if (url.pathname === '/api/nfl/live') return json(res, await nflLive.board(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/sports/performance') return json(res,await sports.performance(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/sports/catalog') return json(res, await sports.catalog(Object.fromEntries(url.searchParams),url.searchParams.get('refresh')==='1'));
    if (url.pathname === '/api/sports/board') return json(res, await sports.board(Object.fromEntries(url.searchParams),url.searchParams.get('refresh')==='1'));
    if (url.pathname === '/api/mlb/board') return json(res, await mlb.board(Object.fromEntries(url.searchParams), url.searchParams.get('refresh') === '1'));
    if (url.pathname === '/api/mlb/model') return json(res, mlbModelReport());
    if (url.pathname === '/api/mlb/evidence') return json(res, await mlb.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/evidence') return json(res, await store.evidence(Object.fromEntries(url.searchParams)));
    if (url.pathname === '/api/catalog') { const {current,weeks}=await store.catalog(url.searchParams.get('refresh') === '1'); return json(res,{current,weeks}); }
    if (url.pathname === '/api/board') return json(res, await store.board(Object.fromEntries(url.searchParams), url.searchParams.get('refresh') === '1'));
    const names = { '/bets':'bets.html', '/bets/':'bets.html', '/bets.js':'bets.js', '/bet-utils.js':'bet-utils.js', '/bets.css':'bets.css', '/wnba':'sports.html','/wnba/':'sports.html','/nba':'sports.html','/nhl':'sports.html','/soccer':'sports.html','/sports.js':'sports.js','/sports.css':'sports.css', '/nfl/live':'live.html', '/nfl/live/':'live.html', '/live.js':'live.js', '/live.css':'live.css', '/live-utils.js':'live-utils.js', '/paper':'paper.html','/paper.js':'paper.js','/context-ui.js':'context-ui.js','/context.css':'context.css', '/performance':'performance.html', '/performance.js':'performance.js', '/forecast.css':'forecast.css', '/': 'index.html', '/nfl': 'index.html', '/mlb': 'mlb.html', '/mlb/': 'mlb.html', '/mlb.js': 'mlb.js', '/mlb-model.js':'mlb-model.js', '/mlb.css': 'mlb.css', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg', '/manifest.webmanifest': 'manifest.webmanifest' };
    const name = names[url.pathname];
    if (!name) return json(res, { error: 'Not found.' }, 404);
    const bytes = await fs.readFile(path.join(publicDir, name));
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': (types[path.extname(name)] || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) { console.error(`[request] ${e.message}`); json(res, { error: e.message }, e.status || 500); }
});
const port = Number(process.env.PORT || 3100);
// Vercel owns the listener and invocation lifetime. Dataset refreshes there run
// on demand through SourceStore's TTL; a background interval cannot be relied on.
if (!process.env.VERCEL) server.listen(port, '127.0.0.1', () => { console.log(`NFL Analytics is ready at http://127.0.0.1:${port}`); if (process.env.AUTO_SYNC !== '0') { sync(); setInterval(sync, REFRESH_MS).unref(); } });
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open http://127.0.0.1:${port}, or set PORT to another port.` : e.message); process.exitCode = 1; });
export default server;
