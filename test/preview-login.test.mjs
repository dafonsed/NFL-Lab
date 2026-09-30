import test from 'node:test';
import assert from 'node:assert/strict';
import { previewLoginButton, handlePreviewLogin, previewLoginEnabled } from '../lib/preview-login.mjs';

test('guest login is off unless the local design preview enables it', async () => {
  const req = { headers: { host: 'localhost:3100' }, method: 'POST' };
  const url = new URL('http://localhost:3100/login/guest');
  assert.equal(previewLoginEnabled(), false);
  assert.equal(previewLoginButton(req, new URL('http://localhost:3100/login')), '');
  assert.equal(await handlePreviewLogin(req, {}, url), false, 'the route does not exist on a normal server');
});
