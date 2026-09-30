import test from 'node:test';
import assert from 'node:assert/strict';
import { INFO_PATHS, renderInfoPage } from '../lib/info-pages.mjs';

test('company pages render with their own title, canonical URL and the shared site chrome', () => {
  assert.deepEqual(INFO_PATHS, ['/about', '/contact', '/changelog', '/status']);
  for (const path of INFO_PATHS) {
    const html = renderInfoPage(path, 'https://visualodds.com');
    assert.match(html, /<title>[^<]*VisualOdds[^<]*<\/title>/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://visualodds.com${path}">`));
    assert.match(html, /class="home-header vo-site-header"/, 'the shared site header');
    assert.match(html, /class="home-footer vo-site-footer"/, 'the shared site footer');
    assert.match(html, new RegExp(`<a href="${path}">`), 'the footer links every company page');
    assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'no inline script (CSP is script-src self)');
  }
  assert.equal(renderInfoPage('/nope'), null);
});

test('the status page checks health from the browser and every page keeps the 21+ notice', () => {
  assert.match(renderInfoPage('/status'), /<script type="module" src="\/status\.js\?v=1"><\/script>/);
  for (const path of INFO_PATHS) assert.match(renderInfoPage(path), /1-800-GAMBLER/);
});
