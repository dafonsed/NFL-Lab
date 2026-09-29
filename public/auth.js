import { api, safeNext, message, bindPasswordToggles, setBusy } from './account-client.js';

const form = document.querySelector('#account-form');
const status = document.querySelector('#account-status');
const mode = document.body.dataset.accountMode;
const next = safeNext(new URLSearchParams(location.search).get('next'));
const query = new URLSearchParams(location.search);
if (mode === 'login' && (query.has('verified') || query.has('emailChanged'))) {
  message(status, query.has('emailChanged') ? 'Email verification completed. Sign in using your updated email address.' : 'Email verification completed. Sign in to continue.');
} else if (mode === 'login' && query.has('mfaDisabled')) {
  message(status, 'Two-step verification was disabled and your sessions were signed out. Sign in again to continue.');
}
bindPasswordToggles();
const confirmation = form.elements.namedItem('confirm');
confirmation?.addEventListener('input', () => confirmation.setCustomValidity(''));
form.elements.namedItem('password').addEventListener('input', () => confirmation?.setCustomValidity(''));

form.addEventListener('submit', async event => {
  event.preventDefault();
  status.hidden = true;
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  if (confirmation && confirmation.value !== fields.get('password')) {
    confirmation.setCustomValidity('Passwords do not match.');
    confirmation.reportValidity();
    return;
  }
  setBusy(form, true);
  try {
    if (mode === 'register') {
      await api('/api/auth/sign-up/email', { method: 'POST', body: {
        name: fields.get('name').trim(), email: fields.get('email').trim(), password: fields.get('password'),
        termsAccepted: fields.get('termsAccepted') === 'on', policyVersion: '2026-09-28',
        marketingConsent: fields.get('marketingConsent') === 'on', callbackURL: '/account'
      }});
      form.reset();
      message(status, 'Check your inbox. If this address can be registered, a verification email will arrive shortly. If you already have an account, sign in or reset your password.');
      const recovery = document.createElement('a');
      recovery.href = '/forgot-password'; recovery.textContent = 'Reset your password';
      status.append(document.createElement('br'), recovery);
    } else {
      const data = await api('/api/auth/sign-in/email', { method: 'POST', body: {
        email: fields.get('email').trim(), password: fields.get('password'), rememberMe: fields.get('rememberMe') === 'on'
      }});
      form.elements.namedItem('password').value = '';
      location.assign(data.twoFactorRedirect ? `/two-factor?next=${encodeURIComponent(next)}` : next);
    }
  } catch (error) {
    message(status, error.userMessage, true);
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      const link = document.createElement('a'); link.href = '/verify-email'; link.textContent = 'Request a verification email'; status.append(document.createElement('br'), link);
    }
  } finally { setBusy(form, false); }
});
