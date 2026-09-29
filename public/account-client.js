export function safeNext(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || /^\/(?:api\/auth|login|register|two-factor|reset-password)(?:[/?#]|$)/.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

const errorMessages = {
  INVALID_EMAIL_OR_PASSWORD: 'Unable to sign in with those details. Check your email and password, or reset your password.',
  EMAIL_NOT_VERIFIED: 'Verify your email before continuing. Use the verification page to request a new link.',
  USER_BANNED: 'This account is suspended. Contact support using the contact details in the Privacy Policy.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support using the contact details in the Privacy Policy.',
  ACCOUNT_DELETED: 'This account is no longer available.',
  INVALID_TOKEN: 'This link has expired or has already been used. Request a new link.',
  TOKEN_EXPIRED: 'This link has expired. Request a new link.',
  INVALID_TWO_FACTOR_COOKIE: 'Your sign-in attempt has expired. Return to sign in and try again.',
  INVALID_CODE: 'That code could not be verified. Use a current authenticator code or an unused recovery code.',
  INVALID_BACKUP_CODE: 'That recovery code could not be verified. Try an unused code.',
  INVALID_PASSWORD: 'The current password could not be verified.',
  PASSWORD_TOO_SHORT: 'Use a password with at least 15 characters.',
  PASSWORD_TOO_LONG: 'Use a password with no more than 128 characters.',
  PASSWORD_COMPROMISED: 'This password is commonly used or has appeared in a breach. Choose a different password.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes before trying again.',
  REAUTHENTICATION_REQUIRED: 'Confirm your password in the security check, then try again.',
  REAUTH_REQUIRED: 'Confirm your password in the security check, then try again.',
  VERSION_CONFLICT: 'Your saved data changed on another device. Reload this page before saving again.',
  NO_CHANGES: 'No changes were made. Update a field or cancel this form.',
  CONTENT_NOT_DRAFT: 'This notice is no longer a draft. Refresh the list; archive it and create a replacement to revise published content.',
  MARKET_CONTROLS_UNAVAILABLE: 'Feed controls could not be read. No unfiltered feed response will be served until the service recovers.',
  MARKET_INVENTORY_UNAVAILABLE: 'The connected quote provider is unavailable. Existing distribution controls remain active.',
  MFA_REQUIRED: 'Staff access requires a verified authenticator. Set up two-step verification in your account.',
  ADMIN_MFA_REQUIRED: 'Staff access requires a verified authenticator. Set up two-step verification in your account, then sign in using a code.',
  ACCOUNT_CHANGED: 'The signed-in account changed in another tab. Reload before working with your saved data.',
  ACCOUNTS_UNAVAILABLE: 'Account services are not configured yet. Please try again once account access is available.',
  EMAIL_UNAVAILABLE: 'Email delivery is not configured. Please try again once the service is available.',
  BILLING_UNAVAILABLE: 'Online billing is not available yet. Your current access is unchanged.'
};

export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  } catch {
    throw Object.assign(new Error('Network request failed'), { userMessage: 'Cannot connect. Check your connection and try again.' });
  }
  let data;
  try { data = await response.json(); }
  catch { throw Object.assign(new Error('Invalid response'), { status: response.status, userMessage: 'The account service returned an unexpected response. Reload and try again.' }); }
  if (!response.ok || data?.error) {
    const code = data?.code || data?.error?.code || (typeof data?.error === 'string' ? data.error : '');
    const userMessage = errorMessages[code] || (response.status === 429 ? errorMessages.RATE_LIMITED
      : response.status === 401 ? 'Your session has expired or your credentials could not be verified. Sign in and try again.'
      : response.status === 403 ? 'Your account does not have access to this action. Check your verification status and plan.'
      : response.status === 409 ? errorMessages.VERSION_CONFLICT
      : response.status === 503 ? 'This service is not configured or is temporarily unavailable. Please try again later.'
      : 'Unable to complete this request. Check the form and try again.');
    throw Object.assign(new Error(code || 'Request failed'), { code, status: response.status, userMessage });
  }
  return data;
}

export function message(target, text, error = false) {
  target.textContent = text; target.hidden = false;
  target.dataset.tone = error ? 'error' : 'success';
  target.setAttribute('role', error ? 'alert' : 'status');
}

export function setBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  form.querySelectorAll('button[type="submit"]').forEach(button => {
    if (busy) { button.dataset.label = button.textContent; button.textContent = 'Please wait…'; }
    else button.textContent = button.dataset.label || button.textContent;
    button.disabled = busy;
  });
}

export function bindPasswordToggles(root = document) {
  root.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password'; button.textContent = showing ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(showing));
    button.setAttribute('aria-label', `${showing ? 'Hide' : 'Show'} password`);
  }));
}

export function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const readableDate = value => value && !Number.isNaN(new Date(value).valueOf()) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
