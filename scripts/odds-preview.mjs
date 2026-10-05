// Local-only preview of the odds pages against synthetic fixture prices (test/fixtures/odds-feed.mjs: every
// game is "Fixture … @ Fixture …", so they can't be mistaken for real ones). The site's server runs
// unchanged — /api/odds, the pricing engine, the browser — and only its quote source (EV_TOOL_API_URL)
// is a stand-in on this machine. For checking loading, empty, error, stale and partial states.
//
//   node scripts/odds-preview.mjs        then open http://localhost:3104/ev and use "Continue as guest"
//
// The stand-in follows data/odds-preview-mode.txt, read on every request:
//   normal (default) · empty (no prices) · error (503) · slow (8 s answers) · partial (no DFS payout tables)
// After "error", the server shows the last prices as held over (stale) for a minute, then the error.
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtureRecords, fixturePayouts } from '../test/fixtures/odds-feed.mjs';

if (process.env.VERCEL) throw new Error('The odds preview runs on this machine only.');
const modeFile = fileURLToPath(new URL('../data/odds-preview-mode.txt', import.meta.url));
const mode = () => { try { return fs.readFileSync(modeFile, 'utf8').trim() || 'normal'; } catch { return 'normal'; } };

// Fixture prices are rebuilt on every request, observed 30 seconds ago, so they stay current.
const records = () => fixtureRecords({ games: 8, propsPerGame: 3 });
// A day of made-up movement for one fixture price: its current odds, a few points earlier.
function history(id) {
  const record = records().find(item => item.id === id);
  if (!record) return [];
  const now = Date.now(), odds = Number(record.odds), step = odds > 0 ? 10 : -10;
  return [6, 4, 2, 1].map((hours, index) => ({ ts: new Date(now - hours * 3_600_000).toISOString(), odds: odds - step * (3 - index), line: record.line ?? null }))
    .concat({ ts: new Date(now - 60_000).toISOString(), odds, line: record.line ?? null });
}

const upstream = http.createServer(async (req, res) => {
  const current = mode(), url = new URL(req.url || '/', 'http://fixture');
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (current === 'error') return send(503, { detail: 'Fixture outage' });
  if (current === 'slow') await new Promise(resolve => setTimeout(resolve, 8_000));
  if (url.pathname === '/quotes') return send(200, { quotes: current === 'empty' ? [] : records(), complete: true });
  if (url.pathname === '/site/dfs/payouts') return current === 'partial' ? send(503, { detail: 'Fixture outage' }) : send(200, fixturePayouts());
  if (url.pathname === '/site/dfs/props') return send(200, []);
  if (url.pathname === '/site/odds/history') return send(200, history(url.searchParams.get('id')));
  if (url.pathname === '/site/prediction/contracts') return send(200, []);
  if (url.pathname === '/status' || url.pathname === '/health') return send(200, { status: 'fixture', books: [] });
  return send(404, {});
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
process.env.EV_TOOL_API_URL = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
process.env.EV_TOOL_API_KEY = 'odds-preview-fixture';
process.env.PORT ||= '3104';
console.log(`Fixture quote source (synthetic prices) at ${process.env.EV_TOOL_API_URL}; mode file ${modeFile}`);
// The design preview's throwaway account (Continue as guest) and the real server.
await import('./design-preview.mjs');
