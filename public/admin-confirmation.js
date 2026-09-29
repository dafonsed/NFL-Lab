import { api } from './account-client.js';
// Only a UI convenience. Every mutation still checks the current session and
// its five-minute password proof on the server. No password is retained.
let confirmedUntil = 0;
export function needsAdminPassword() { return Date.now() >= confirmedUntil; }
export function prepareAdminPassword(input) {
  const needed = needsAdminPassword();
  input.value = ''; input.required = needed; input.closest('.account-field').hidden = !needed;
}
export function invalidateAdminConfirmation() { confirmedUntil = 0; }
export async function confirmAdminPassword(password) {
  if (!needsAdminPassword()) return;
  if (!password) throw Object.assign(new Error('Password confirmation required'), { code: 'REAUTHENTICATION_REQUIRED', userMessage: 'Your security confirmation expired. Enter your password again.' });
  await api('/api/account/reauthenticate', { method: 'POST', body: { password } });
  confirmedUntil = Date.now() + 240_000;
}
