import assert from 'node:assert/strict';
import { educationArticles } from '../lib/betting-education.mjs';
import { bettingPagePaths } from '../lib/betting-pages.mjs';
import { marketGuidePaths } from '../lib/online-sports-betting.mjs';
import { renderSportsbookGuideSitemapEntries } from '../lib/online-sportsbook-guides.mjs';

const entry = new URL('../dist/server/index.js', import.meta.url);
const worker = (await import(entry.href + '?check=' + Date.now())).default;
for (const route of ['/', '/research?sport=nfl', '/research?sport=mlb', '/nfl', '/nba', '/mlb', '/nfl?view=trends', '/live', '/nfl/live', '/simulation', '/bets']) {
  const response = await worker.fetch(new Request('https://sportslab.local' + route));
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.match(html, /<main\b/, route);
  assert.doesNotMatch(html, /<!--site-header-->/, route);
}
const sportsbookPaths = [...renderSportsbookGuideSitemapEntries({}).matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname);
const newRoutes = [...new Set([...bettingPagePaths, '/betting-education', ...educationArticles.map(article => `/betting-education/${article.slug}`), ...marketGuidePaths, ...sportsbookPaths, '/odds-api'])];
const internalLinks = new Set();
for (const route of newRoutes) {
  const response = await worker.fetch(new Request('https://sportslab.local' + route));
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.match(html, /<main\b/, route);
  assert.match(html, /<title>/, route);
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const target = new URL(href, 'https://sportslab.local' + route);
    if (target.origin === 'https://sportslab.local' && !target.pathname.startsWith('/api/')) internalLinks.add(target.pathname);
  }
}
for (const route of internalLinks) {
  const response = await worker.fetch(new Request('https://sportslab.local' + route));
  assert.equal(response.status, 200, `Internal link ${route}`);
}
for (const route of ['/robots.txt', '/sitemap.xml']) {
  const response = await worker.fetch(new Request('https://sportslab.local' + route));
  assert.equal(response.status, 200, route);
  assert.match(await response.text(), /sportslab\.fnsd\.chatgpt\.site/, route);
}
for (const asset of ['/favicon.svg', '/landing.js', '/style.css', '/assets/fonts/InterVariable.woff2']) {
  const response = await worker.fetch(new Request('https://sportslab.local' + asset));
  assert.equal(response.status, 200, asset);
  assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
}
const redirect = await worker.fetch(new Request('https://sportslab.local/?sport=nfl'));
assert.equal(redirect.status, 302);
assert.match(redirect.headers.get('location') || '', /\/research\?sport=nfl$/);
const cron = await worker.fetch(new Request('https://sportslab.local/api/cron/predictions'));
assert.equal(cron.status, 404);
console.log(`Sites workspace, ${newRoutes.length} added routes, and bundled assets verified.`);
