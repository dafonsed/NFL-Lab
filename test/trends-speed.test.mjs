import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { trendsDataUrl, trendsPreload } from '../lib/trends-preload.mjs';

const at = path => new URL(path, 'https://visualodds.test');
const now = new Date('2026-10-05T01:00:00Z'); // 9 PM in New York, 6 PM in Phoenix on 4 Oct

test('the trends page names its first data request, as public/trends.js builds it', () => {
  assert.equal(trendsDataUrl(at('/nfl?view=trends'), now), '/api/board?market=rec_yds&view=board');
  assert.equal(trendsDataUrl(at('/nfl?view=trends&market=rush_yds&season=2026&week=5'), now), '/api/board?market=rush_yds&view=board&season=2026&week=5');
  assert.equal(trendsDataUrl(at('/mlb?view=trends'), now), '/api/mlb/board?market=hits&date=2026-10-04');
  assert.equal(trendsDataUrl(at('/mlb?view=trends&date=2026-10-06&market=tb'), now), '/api/mlb/board?market=tb&date=2026-10-06');
  assert.equal(trendsDataUrl(at('/nba?view=trends'), now), '/api/sports/catalog?market=points&date=2026-10-04&sport=nba&league=eng.1');
  assert.equal(trendsDataUrl(at('/wnba?view=trends'), now), '/api/sports/catalog?market=points&date=2026-10-04&sport=wnba&league=eng.1&game=all');
  assert.equal(trendsDataUrl(at('/soccer?view=trends&league=esp.1'), now), '/api/sports/catalog?market=shots&date=2026-10-04&sport=soccer&league=esp.1');
  assert.equal(trendsDataUrl(at('/unknown?view=trends'), now), null);
  const html = trendsPreload('<html><head><title>x</title></head><body></body></html>', at('/nfl?view=trends&market=a"b<c'), now);
  assert.match(html, /<link rel="preload" as="fetch" href="\/api\/board\?market=a%22b%3Cc&amp;view=board" crossorigin>\n<\/head>/);
});

test('trends.html preloads every module trends.js imports, so they load at once', async () => {
  const pub = new URL('../public/', import.meta.url), html = await readFile(new URL('trends.html', pub), 'utf8');
  const preloaded = new Set([...html.matchAll(/rel="modulepreload" href="\/([^"]+)"/g)].map(m => m[1]));
  const seen = new Set(), visit = async file => {
    if (seen.has(file)) return; seen.add(file);
    const source = await readFile(new URL(file, pub), 'utf8');
    for (const m of source.matchAll(/(?:^|\n|;)\s*import\s*(?:[^'"]*?from\s*)?['"]\.\/([^'"]+)['"]/g)) await visit(path.posix.normalize(m[1]));
  };
  await visit('trends.js');
  seen.delete('trends.js');
  for (const file of seen) assert.ok(preloaded.has(file), `${file} is imported but not preloaded`);
});

test('shared research data is cacheable by the CDN; a forced refresh is not', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /const SHARED_DATA = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'/);
  for (const route of ['/api/board', '/api/mlb/board', '/api/sports/board', '/api/sports/catalog', '/api/simulation/catalog', '/api/catalog', '/api/evidence', '/api/mlb/evidence']) {
    const line = server.split('\n').find(text => text.includes(`url.pathname === '${route}'`));
    assert.ok(line && line.includes('sharedJson('), `${route} answers with sharedJson`);
  }
  assert.match(server, /fresh \? 'no-store' : SHARED_DATA/);
  // Per-user and live routes stay uncached.
  for (const route of ['/api/paper', '/api/nfl/live', '/api/bets/catalog']) assert.ok(!server.split('\n').find(text => text.includes(`'${route}'`))?.includes('sharedJson('), route);
});
