import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_TYPES, contentLibrary, renderContentSitemap, searchContent } from '../lib/content/registry.mjs';
import { renderLearnLibrary } from '../lib/learn-library.mjs';
import { siteHeader, siteFooter, withSiteChrome } from '../lib/site-chrome.mjs';
import { renderEducationPage } from '../lib/betting-education.mjs';
import { renderInfoPage } from '../lib/info-pages.mjs';

test('the library indexes every content family once, with a path and a known type', () => {
  const types = new Set(CONTENT_TYPES.map(type => type.id));
  for (const type of types) assert.ok(contentLibrary.some(item => item.type === type), `has ${type} records`);
  assert.equal(new Set(contentLibrary.map(item => item.id)).size, contentLibrary.length, 'ids are unique');
  for (const item of contentLibrary) {
    assert.ok(types.has(item.type));
    assert.match(item.path, /^\/[a-z0-9/-]*$/);
    assert.ok(item.title && item.description, item.id);
  }
});

test('search matches every word, optionally within one type', () => {
  const results = searchContent('arizona', { type: 'state' });
  assert.ok(results.length >= 1);
  assert.ok(results.every(item => item.type === 'state'));
  assert.deepEqual(searchContent('zzqq nothing'), []);
});

test('the sitemap comes from the library: hubs plus indexable records only', () => {
  const xml = renderContentSitemap('https://visualodds.com/');
  assert.match(xml, /<loc>https:\/\/visualodds\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/visualodds\.com\/learn<\/loc>/);
  assert.doesNotMatch(xml, /\/docs</, 'noindex docs stay out');
  const archived = contentLibrary.find(item => !item.indexable && item.type === 'guide');
  assert.ok(!xml.includes(`>https://visualodds.com${archived.path}<`), 'archived guides stay out');
  assert.equal((xml.match(/<url>/g) || []).length, new Set(xml.match(/<loc>[^<]+<\/loc>/g)).size, 'no duplicate URLs');
});

test('public pages share one header and footer', () => {
  const header = siteHeader({ current: 'learn' });
  assert.match(header, /<a href="\/learn" aria-current="page">Learn<\/a>/);
  assert.match(siteFooter(), /href="\/learn">Learn library</);
  assert.equal(withSiteChrome('<!--vo-site-header-->x<!--vo-site-footer-->'), `${siteHeader()}x${siteFooter()}`);
  const pages = [renderEducationPage('/betting-education', { headers: { host: 'visualodds.com' } }), renderInfoPage('/about'), renderLearnLibrary()];
  for (const html of pages) {
    const body = typeof html === 'string' ? html : html?.body || '';
    assert.equal((body.match(/vo-site-header/g) || []).length, 1);
    assert.equal((body.match(/vo-site-footer/g) || []).length, 1);
    assert.match(body, /\/site-chrome\.css/);
    assert.match(body, /\/consent\.js/, 'analytics consent and error reporting load on content pages');
  }
});

test('the Learn page renders every record as a filterable card', () => {
  const html = renderLearnLibrary();
  assert.equal((html.match(/class="learn-card"/g) || []).length, contentLibrary.length);
  for (const type of CONTENT_TYPES) assert.match(html, new RegExp(`data-learn-type="${type.id}"`));
});
