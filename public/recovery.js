import { api, safeNext, message, bindPasswordToggles, setBusy } from './account-client.js';
const params = new URLSearchParams(location.search);
const mode = location.pathname.replace(/\/$/, '').split('/').pop();
const title = document.querySelector('#recovery-title');
const description = document.querySelector('#recovery-description');
const fields = document.querySelector('#recovery-fields');
const status = document.querySelector('#recovery-status');
const emailField = '<div class="account-field"><label for="recovery-email">Email address</label><input id="recovery-email" name="email" type="email" autocomplete="email" required></div>';
const passwordField = '<div class="account-field"><label for="recovery-password">New password</label><div class="account-password-field"><input id="recovery-password" name="newPassword" type="password" autocomplete="new-password" minlength="15" maxlength="128" aria-describedby="new-password-help" required><button type="button" data-toggle-password="recovery-password" aria-pressed="false">Show</button></div><p id="new-password-help" class="account-help">Use 15–128 characters and a password you do not use elsewhere.</p></div><div class="account-field"><label for="recovery-confirm">Confirm new password</label><input id="recovery-confirm" name="confirm" type="password" autocomplete="new-password" required></div>';
const configuration = {
  'forgot-password': ['Reset your password.', 'Enter your email and we will send a reset link if an account exists.', emailField, 'Send reset link'],
  'reset-password': ['Choose a new password.', 'Reset your password to recover access to your research.', passwordField, 'Save new password'],
  'verify-email': ['Verify your email.', 'Request a fresh verification link. Check your spam folder if the email does not arrive.', emailField, 'Send verification email'],
  'two-factor': ['One more security check.', 'Enter the current code from your authenticator app.', '<div class="account-field"><label for="recovery-code">Authenticator code</label><input id="recovery-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div><label class="account-check"><input name="backup" type="checkbox"><span>Use a recovery code instead</span></label>', 'Verify and sign in']
}[mode];
if (!configuration) {
  title.textContent = 'Choose a recovery option.'; description.textContent = 'Return to sign in, reset your password, or request a verification email.';
  fields.innerHTML = '<p class="recovery-links"><a href="/forgot-password">Reset password</a><a href="/verify-email">Verify email</a></p>';
} else {
  const [heading, copy, markup, label] = configuration;
  title.textContent = heading; document.title = `${heading} · VisualOdds`; description.textContent = copy;
  fields.innerHTML = `<form method="post" id="recovery-form" novalidate>${markup}<button class="account-submit" type="submit">${label}</button></form>`;
  bindPasswordToggles(fields);
  const form = fields.querySelector('form');
  if (mode === 'reset-password' && (!params.get('token') || params.has('error'))) {
    form.hidden = true;
    message(status, 'This reset link is missing, expired, or has already been used. Request a new link to continue.', true);
    const link = document.createElement('a'); link.href = '/forgot-password'; link.textContent = 'Request a new reset link'; status.append(document.createElement('br'), link);
  }
  if (mode === 'verify-email' && params.has('error')) message(status, 'This verification link is invalid, expired, or already used. Sign in to check your verification status, or request a new link below.', true);
  form.elements.namedItem('backup')?.addEventListener('change', event => {
    const input = form.elements.namedItem('code');
    input.value = ''; input.inputMode = event.target.checked ? 'text' : 'numeric';
    input.maxLength = event.target.checked ? 128 : 6;
    input.pattern = event.target.checked ? '.{4,128}' : '[0-9]{6}';
    input.labels[0].textContent = event.target.checked ? 'Unused recovery code' : 'Authenticator code';
    description.textContent = event.target.checked ? 'Each recovery code can only be used once. If you have lost your codes and authenticator, use the support contact in the Privacy Policy for a reviewed recovery request. A password reset does not remove two-step verification.' : 'Enter the current code from your authenticator app.';
  });
  form.querySelectorAll('input').forEach(input => input.addEventListener('input', () => form.elements.namedItem('confirm')?.setCustomValidity('')));
  form.addEventListener('submit', async event => {
    event.preventDefault(); status.hidden = true;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (mode === 'reset-password' && data.get('newPassword') !== data.get('confirm')) {
      const input = form.elements.namedItem('confirm'); input.setCustomValidity('Passwords do not match.'); input.reportValidity(); return;
    }
    setBusy(form, true);
    try {
      if (mode === 'forgot-password') {
        await api('/api/auth/request-password-reset', { method: 'POST', body: { email: data.get('email').trim(), redirectTo: '/reset-password' } });
        message(status, 'If an account exists for that address, a reset link will arrive shortly. Check your inbox and spam folder.');
      } else if (mode === 'verify-email') {
        await api('/api/auth/send-verification-email', { method: 'POST', body: { email: data.get('email').trim(), callbackURL: '/account' } });
        message(status, 'If the address needs verification, a new link will arrive shortly. Use the latest email.');
      } else if (mode === 'reset-password') {
        await api('/api/auth/reset-password', { method: 'POST', body: { token: params.get('token'), newPassword: data.get('newPassword') } });
        history.replaceState(null, '', '/reset-password'); form.reset(); form.hidden = true;
        message(status, 'Your password has been updated. Sign in again with your new password.');
      } else {
        await api(`/api/auth/two-factor/${data.get('backup') ? 'verify-backup-code' : 'verify-totp'}`, { method: 'POST', body: { code: data.get('code').trim(), trustDevice: false } });
        form.reset(); location.assign(safeNext(params.get('next')));
      }
    } catch (error) { message(status, error.userMessage, true); }
    finally { setBusy(form, false); }
  });
}
