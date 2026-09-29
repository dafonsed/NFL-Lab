import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;
const load = () => import(`../public/admin-confirmation.js?test=${++moduleId}`);
function passwordInput() {
  const field = { hidden: false };
  return { value: 'stale autofill', required: false, field, closest: () => field };
}

test('successful admin proof avoids repeated password requests until the conservative four-minute expiry', async t => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json({ status: true });
  });
  const helper = await load(), input = passwordInput();
  helper.prepareAdminPassword(input);
  assert.equal(input.value, ''); assert.equal(input.required, true); assert.equal(input.field.hidden, false);
  await assert.rejects(helper.confirmAdminPassword(''), { code: 'REAUTHENTICATION_REQUIRED' });
  assert.equal(requests.length, 0);
  await helper.confirmAdminPassword('Disposable proof password');
  assert.equal(requests[0].url, '/api/account/reauthenticate');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), { password: 'Disposable proof password' });
  input.value = 'browser autofill'; helper.prepareAdminPassword(input);
  assert.equal(input.value, ''); assert.equal(input.required, false); assert.equal(input.field.hidden, true);
  for (let index = 0; index < 10; index++) await helper.confirmAdminPassword('');
  assert.equal(requests.length, 1, 'Subsequent actions reuse proof without consuming reauthentication attempts.');
  now += 239_999;
  await helper.confirmAdminPassword(''); assert.equal(requests.length, 1);
  now += 1;
  await assert.rejects(helper.confirmAdminPassword(''), { code: 'REAUTHENTICATION_REQUIRED' });
  helper.prepareAdminPassword(input);
  assert.equal(input.required, true); assert.equal(input.field.hidden, false); assert.equal(input.value, '');
  assert.equal(requests.length, 1, 'Expiry never reuses the earlier password.');
});

test('failed, throttled and invalidated admin confirmation cannot suppress the next password prompt', async t => {
  t.mock.method(Date, 'now', () => 2_000_000);
  let mode = 'invalid', calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (mode === 'network') throw new Error('Offline');
    if (mode === 'invalid') return Response.json({ error: 'Incorrect password', code: 'INVALID_PASSWORD' }, { status: 400 });
    if (mode === 'limited') return Response.json({ error: 'Too many attempts', code: 'RATE_LIMITED' }, { status: 429 });
    return Response.json({ status: true });
  });
  const helper = await load();
  for (const next of ['invalid', 'limited', 'network']) {
    mode = next;
    await assert.rejects(helper.confirmAdminPassword('Disposable proof password'));
    assert.equal(helper.needsAdminPassword(), true, next);
  }
  mode = 'success';
  await helper.confirmAdminPassword('Disposable proof password');
  assert.equal(helper.needsAdminPassword(), false);
  helper.invalidateAdminConfirmation();
  assert.equal(helper.needsAdminPassword(), true);
  await assert.rejects(helper.confirmAdminPassword(''), { code: 'REAUTHENTICATION_REQUIRED' });
  assert.equal(calls, 4, 'Invalidation does not automatically replay a password.');
});
