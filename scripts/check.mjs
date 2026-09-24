import assert from 'node:assert/strict';

const entry = new URL('../dist/server/index.js', import.meta.url);
const worker = (await import(entry.href + '?check=' + Date.now())).default;
for (const route of ['/', '/research?sport=nfl', '/research?sport=mlb', '/nfl', '/nba', '/mlb', '/nfl?view=trends', '/live', '/nfl/live', '/simulation', '/bets']) {
  const response = await worker.fetch(new Request('https://sportslab.local' + route));
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.match(html, /<main\b/, route);
  assert.doesNotMatch(html, /<!--site-header-->/, route);
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
console.log('Sites routes and bundled assets verified.');
