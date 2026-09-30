import test from 'node:test';
import assert from 'node:assert/strict';
import { API_PAGES, apiPagePath } from '../lib/api-reference.mjs';
import { renderOddsApiPage } from '../lib/odds-api-page.mjs';
import { highlight, requestUrl, snippet } from '../public/api-reference-code.js';
import { renderBeginnerGuide, renderLearnLibrary, BEGINNER_LESSONS } from '../lib/learn-library.mjs';
import { renderHelpCenterPage } from '../lib/help-center-page.mjs';
import { HEADER_LINKS } from '../lib/site-chrome.mjs';
import { contentLibrary } from '../lib/content/registry.mjs';

test('every API reference page renders with the sidebar and the shared chrome', () => {
  for (const page of API_PAGES) {
    const html = renderOddsApiPage('https://visualodds.com', page.slug);
    assert.ok(html, page.slug);
    assert.match(html, /class="apiref-side"/);
    assert.match(html, /vo-site-header/);
    assert.match(html, new RegExp(`href="${apiPagePath(page)}" [^>]*aria-current="page"`));
    if (page.kind === 'endpoint') assert.match(html, /id="apiref-try"/);
  }
  assert.equal(renderOddsApiPage('https://visualodds.com', 'no-such-page'), null);
});

test('request snippets build the URL from parameter values', () => {
  const page = API_PAGES.find(item => item.slug === 'sport-catalog');
  assert.equal(requestUrl(page, { sport: 'nba', market: 'points', date: '' }), '/api/sports/catalog?sport=nba&market=points');
  const del = API_PAGES.find(item => item.slug === 'ev-delete-match');
  assert.equal(requestUrl(del, { id: 'a b' }, 'https://x.test'), 'https://x.test/api/ev/matches/a%20b');
  assert.match(snippet('shell', page, { sport: 'wnba' }, 'https://visualodds.com'), /curl --request GET[\s\S]*sport=wnba/);
  assert.match(snippet('python', API_PAGES.find(item => item.slug === 'ev-upsert-quotes'), {}), /requests\.post\([\s\S]*json=\[[\s\S]*False/);
  assert.equal(highlight('json', '{"a": "<b>"}'), '{<span class="tk-key">&quot;a&quot;</span>: <span class="tk-str">&quot;&lt;b&gt;&quot;</span>}');
});

test('the header no longer links to Sportsbooks', () => {
  assert.ok(!HEADER_LINKS.some(([key]) => key === 'sportsbooks'));
});

test('the Beginner Guide lists seven lessons and each lesson links back to it', () => {
  assert.equal(BEGINNER_LESSONS.length, 7);
  const html = renderBeginnerGuide();
  assert.equal((html.match(/class="bg-lesson"/g) || []).length, 7);
  assert.match(renderLearnLibrary(), /href="\/learn\/beginner-guide"/);
  assert.ok(contentLibrary.some(item => item.path === '/learn/beginner-guide'));
  const lesson = renderHelpCenterPage(new URL('https://visualodds.com/help/articles/read-positive-ev-comparisons'));
  const body = typeof lesson === 'string' ? lesson : lesson.body;
  assert.match(body, /Lesson 3 of 7/);
  const other = renderHelpCenterPage(new URL('https://visualodds.com/help/articles/' + contentLibrary.find(item => item.type === 'help' && !BEGINNER_LESSONS.some(l => item.path.endsWith(l.article.slug))).path.split('/').pop()));
  assert.doesNotMatch(typeof other === 'string' ? other : other.body, /help-course"/);
});
