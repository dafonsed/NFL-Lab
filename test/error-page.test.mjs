import test from 'node:test';
import assert from 'node:assert/strict';
import { renderErrorPage, wantsHtml } from '../lib/error-page.mjs';

test('browsers navigating to pages get HTML errors; API paths and fetches keep JSON', () => {
  const html = { headers: { accept: 'text/html,application/xhtml+xml' } }, fetchy = { headers: { accept: 'application/json' } };
  assert.equal(wantsHtml(html, new URL('http://x/missing')), true);
  assert.equal(wantsHtml(fetchy, new URL('http://x/missing')), false);
  assert.equal(wantsHtml(html, new URL('http://x/api/missing')), false);
});

test('error pages carry the status, a way back into the product and no indexing', () => {
  const notFound = renderErrorPage(404), failed = renderErrorPage(503);
  assert.match(notFound, /ERROR 404/);
  assert.match(failed, /ERROR 500/, 'server errors share one page');
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /href="\/research"/);
  assert.doesNotMatch(notFound, /<script/i, 'the page needs no script');
});
