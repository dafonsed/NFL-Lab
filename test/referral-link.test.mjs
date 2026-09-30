import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReferralLink, referralCodeFromCookie } from '../lib/accounts/referrals.mjs';

const call = (path, options) => {
  const res = { status: 0, headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end() {} };
  const handled = handleReferralLink({}, res, new URL('https://visualodds.com' + path), options);
  return { handled, ...res };
};

test('a referral link sets a 30-day first-party cookie and goes to sign-up', () => {
  const result = call('/r/abcd2345', { secure: true });
  assert.equal(result.handled, true);
  assert.equal(result.status, 302);
  assert.equal(result.headers.Location, '/register');
  assert.match(result.headers['Set-Cookie'], /^vo_ref=abcd2345; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/);
});

test('malformed codes still redirect but set nothing; other paths are ignored', () => {
  const bad = call('/r/<script>');
  assert.equal(bad.status, 302);
  assert.equal(bad.headers['Set-Cookie'], undefined);
  assert.equal(call('/research').handled, false);
});

test('the code is read back only from its own cookie', () => {
  assert.equal(referralCodeFromCookie('a=1; vo_ref=abcd2345; b=2'), 'abcd2345');
  assert.equal(referralCodeFromCookie('xvo_ref=abcd2345'), null);
  assert.equal(referralCodeFromCookie('vo_ref=ABC'), null);
});
