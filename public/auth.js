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
        ageConfirmed: fields.get('ageConfirmed') === 'on', termsAccepted: fields.get('termsAccepted') === 'on', policyVersion: '2026-09-28',
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

// Google sign-in, shown only when the server has it configured. New accounts need the same
// age and Terms boxes as email sign-up; returning users just continue.
const social = document.querySelector('#account-social');
if (social) {
  api('/api/account/providers').then(data => { social.hidden = !data?.providers?.includes('google'); }).catch(() => {});
  if (mode === 'login' && query.get('error') === 'TWO_FACTOR_REQUIRED') message(status, 'This account uses two-step verification. Sign in with your email, password and authenticator code.');
  else if (mode === 'login' && query.get('error') === 'GOOGLE_SIGN_IN') message(status, 'Google sign-in did not finish. If you are new, create an account first, or sign in with your email.');
  social.addEventListener('click', async event => {
    const button = event.target.closest('[data-social]');
    if (!button) return;
    status.hidden = true;
    const signUp = mode === 'register';
    if (signUp) {
      const age = form.elements.namedItem('ageConfirmed'), terms = form.elements.namedItem('termsAccepted');
      if (!age.checked) { age.reportValidity(); age.focus(); return; }
      if (!terms.checked) { terms.reportValidity(); terms.focus(); return; }
    }
    setBusy(form, true);
    try {
      const data = await api('/api/auth/sign-in/social', { method: 'POST', body: {
        provider: button.dataset.social, callbackURL: next || '/research', requestSignUp: signUp,
        ...(signUp ? { ageConfirmed: true, termsAccepted: true, policyVersion: '2026-09-28' } : {}),
      } });
      if (data?.url) location.assign(data.url);
      else throw new Error('No redirect');
    } catch (error) {
      message(status, error.userMessage || error.message || 'Google sign-in is unavailable right now. Try again or use your email.');
      setBusy(form, false);
    }
  });
}
