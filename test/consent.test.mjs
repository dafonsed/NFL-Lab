import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsConfig, analyticsCsp, withConsent } from '../lib/consent.mjs';

const page = '<html><head><title>x</title></head><body></body></html>';

test('analytics stays off unless an https script is configured', () => {
  assert.equal(analyticsConfig({}), null);
  assert.equal(analyticsConfig({ ANALYTICS_SCRIPT_URL: 'http://insecure.example/script.js' }), null);
  assert.deepEqual(analyticsCsp({}), { script: '', connect: '' });
  const html = withConsent(page, {});
  assert.match(html, /\/consent\.js/, 'the consent script always ships (it no-ops without analytics)');
  assert.doesNotMatch(html, /vo-analytics/);
});

test('configured analytics is described on the page and allowed by CSP, never loaded directly', () => {
  const env = { ANALYTICS_SCRIPT_URL: 'https://plausible.io/js/script.js', ANALYTICS_DOMAIN: 'visualodds.com' };
  const html = withConsent(page, env);
  assert.match(html, /<meta name="vo-analytics" content="https:\/\/plausible\.io\/js\/script\.js" data-domain="visualodds\.com">/);
  assert.doesNotMatch(html, /<script[^>]+plausible/, 'the provider script is only added by consent.js after the visitor accepts');
  assert.deepEqual(analyticsCsp(env), { script: ' https://plausible.io', connect: ' https://plausible.io' });
  assert.equal(withConsent(html, env), html, 'injection is idempotent');
});
