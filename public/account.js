import { api, message, setBusy, downloadJson, readableDate } from './account-client.js';
import { accountReady, legacyDataSummary, importLegacyData, flushAccountData } from './account-sync.js';

const $ = selector => document.querySelector(selector);
let account;
let recoveryCodes = [];
let pendingReauthentication;
const securityStatus = $('#security-status');
const featureLabels = { account: 'Account', arb: 'Arbitrage', arbitrage: 'Arbitrage', ev: 'Positive EV', positiveEv: 'Positive EV', 'ev-feed': 'Positive EV', 'ev-indicators': 'EV indicators', fantasy: 'Fantasy', smartMoney: 'Smart Money', 'smart-money': 'Smart Money', odds: 'Odds Screen', oddsScreen: 'Odds Screen', 'odds-screen': 'Odds Screen', alerts: 'Saved alerts', insiders: 'Insiders', bets: 'Bet tracker', 'bet-tracker': 'Bet tracker', 'saved-filters': 'Saved filters', 'line-movement': 'Line movement', models: 'Prediction models', simulation: 'Game simulation', boosts: 'Boosts', middles: 'Middles', research: 'Research', trends: 'Player trends' };
const planLabels = { free: 'Free', premium: 'Basic', premium_plus: 'Pro', pro: 'Premium' };

function fail(target, error) {
  const syncMessages = { session: 'Your signed-in account changed or expired. Sign in again before saving.', conflict: 'Your data changed on another device. Download pending changes from the sync notice, then reload.', network: 'Your data could not sync. Your pending changes remain on this device. Try again when connected.', format: 'Your saved data could not be read. Reload before editing.', confirmation: 'Confirm that this device’s saved research belongs to you before importing.', pending: 'Your import has pending changes. Resolve the sync notice before importing again; the original browser data is preserved.' };
  message(target, error.userMessage || syncMessages[error.code] || 'Unable to complete this request. Try again, or reload if your session has expired.', true);
}
function field(form, name) { return form.elements.namedItem(name); }
function bindForm(selector, work) {
  const form = $(selector);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const status = form.querySelector('[data-status]'); status.hidden = true; setBusy(form, true);
    try { await work(form, new FormData(form), status); }
    catch (error) { if (error.code !== 'CANCELED') fail(status, error); }
    finally { setBusy(form, false); }
  });
}
function bindAction(selector, target, work) {
  $(selector).addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await work(); }
    catch (error) { if (error.code !== 'CANCELED') fail(target, error); }
    finally { button.disabled = false; }
  });
}
function confirmIdentity(description) {
  if (pendingReauthentication) return Promise.reject(Object.assign(new Error('Already open'), { code: 'CANCELED' }));
  $('#reauth-description').textContent = description || 'Enter your current password before continuing.';
  $('#reauth-form').reset(); $('#reauth-form [data-status]').hidden = true;
  $('#security-dialog').showModal(); $('#reauth-password').focus();
  return new Promise((resolve, reject) => { pendingReauthentication = { resolve, reject }; });
}
$('#security-dialog').addEventListener('close', () => {
  $('#reauth-form').reset();
  if (pendingReauthentication) { pendingReauthentication.reject(Object.assign(new Error('Canceled'), { code: 'CANCELED' })); pendingReauthentication = null; }
});
$('body').querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
bindForm('#reauth-form', async (form, data) => {
  const password = data.get('password');
  await api('/api/account/reauthenticate', { method: 'POST', body: { password } });
  const pending = pendingReauthentication; pendingReauthentication = null; $('#security-dialog').close(); pending?.resolve(password);
});

function updateProfile() {
  const { user, profile = {}, entitlements = {}, capabilities = {} } = account;
  $('#identity-name').textContent = user.name || 'Your account';
  $('#identity-plan').textContent = planLabels[entitlements.plan] || entitlements.plan || 'Free';
  $('#account-avatar').textContent = (user.name || user.email || 'S').slice(0, 1).toUpperCase();
  $('#profile-name').value = user.name || profile.name || '';
  $('#profile-email').value = user.email || '';
  $('#verification-state').textContent = user.emailVerified ? 'Email verified' : 'Email not yet verified';
  $('#verification-state').dataset.verified = String(Boolean(user.emailVerified));
  $('#resend-verification').hidden = Boolean(user.emailVerified);
  $('#staff-link').hidden = !capabilities.admin;
  $('#mfa-status').textContent = user.twoFactorEnabled ? 'An authenticator protects your account.' : 'Add a code from your authenticator when you sign in.';
  $('#mfa-toggle').textContent = user.twoFactorEnabled ? 'Disable authenticator' : 'Set up authenticator';
  $('#mfa-management').hidden = !user.twoFactorEnabled;
  $('#odds-format').value = profile.oddsFormat || 'american';
  const preferences = $('#preferences-form');
  field(preferences, 'alerts').checked = Boolean(profile.notifications?.alerts);
  field(preferences, 'productUpdates').checked = Boolean(profile.notifications?.productUpdates);
  field(preferences, 'marketingConsent').checked = Boolean(profile.marketingConsent);
  $('#plan-name').textContent = planLabels[entitlements.plan] || entitlements.plan || 'Free';
  const billing = account.billing || {};
  const subscription = billing.subscription || billing;
  const expiration = entitlements.expiresAt || (subscription.status === 'trialing' ? subscription.trialEnd : null) || subscription.currentPeriodEnd;
  const status = entitlements.source === 'manual-grant' ? 'Manually granted access' : subscription.refunded ? 'Refunded' : subscription.paymentConfirmed === false || subscription.paymentConfirmed === 0 ? 'Payment not confirmed' : subscription.status || 'No active paid subscription';
  const endLabel = expiration && Date.parse(expiration) <= Date.now() ? 'Access ended' : subscription.cancelAtPeriodEnd || entitlements.source === 'manual-grant' ? 'Access ends' : subscription.status === 'trialing' ? 'Trial ends' : 'Current period ends';
  $('#plan-state').textContent = `${status}${expiration ? ` · ${endLabel} ${readableDate(expiration)}` : ''}`;
  $('#feature-list').replaceChildren();
  for (const feature of entitlements.features || []) {
    const item = document.createElement('li'); item.textContent = featureLabels[feature] || feature.replace(/[-_]/g, ' '); $('#feature-list').append(item);
  }
  if (!entitlements.features?.length) { const item = document.createElement('li'); item.textContent = 'No protected tools are currently included.'; $('#feature-list').append(item); }
  $('#billing-portal').hidden = !capabilities.billing || !billing.customer;
  $('#billing-availability').textContent = capabilities.billing ? 'Checkout and subscription changes are processed securely by our billing provider.' : 'Online checkout is not currently available. Your listed plan and access remain visible here.';
  $('#activity-list').replaceChildren();
  const activity = account.activity || [];
  if (!activity.length) { const item = document.createElement('li'); item.textContent = 'No recent account activity.'; $('#activity-list').append(item); }
  for (const entry of activity.slice(0, 30)) {
    const item = document.createElement('li'); const name = document.createElement('strong'); const date = document.createElement('span');
    name.textContent = String(entry.action || entry.type || 'Account updated').replace(/[._-]/g, ' ');
    date.textContent = readableDate(entry.createdAt || entry.timestamp); item.append(name, date); $('#activity-list').append(item);
  }
}
async function loadAccount() { account = await api('/api/account'); updateProfile(); }
// Referral link and sign-up count (created on first view).
async function loadReferral() {
  try {
    const data = await api('/api/account/referral');
    $('#referral-url').value = data.url;
    $('#referral-count').textContent = String(data.signups);
    $('#referral-count-label').textContent = data.signups === 1 ? 'person has signed up with your link' : 'people have signed up with your link';
  } catch { $('#referral-url').value = 'Your referral link is unavailable right now.'; }
}
$('#copy-referral')?.addEventListener('click', async () => {
  const input = $('#referral-url');
  try { await navigator.clipboard.writeText(input.value); message($('#referral-status'), 'Link copied.'); }
  catch { input.select(); message($('#referral-status'), 'Select the link and copy it.'); }
});

bindForm('#profile-form', async (_form, data, status) => {
  await api('/api/account/profile', { method: 'PATCH', body: { name: data.get('name').trim() } }); await loadAccount(); message(status, 'Your profile has been saved.');
});
bindForm('#preferences-form', async (_form, data, status) => {
  await api('/api/account/profile', { method: 'PATCH', body: { oddsFormat: data.get('oddsFormat'), notifications: { alerts: data.has('alerts'), productUpdates: data.has('productUpdates') }, marketingConsent: data.has('marketingConsent') } }); await loadAccount(); message(status, 'Your preferences have been saved.');
});
bindForm('#email-form', async (form, data, status) => {
  await confirmIdentity('Confirm your password to request a change to your email address.');
  await api('/api/auth/change-email', { method: 'POST', body: { newEmail: data.get('newEmail').trim(), callbackURL: '/account' } });
  form.reset(); message(status, 'Check your email to approve the address change. Follow each verification step before using the new address.');
});
$('#password-form').querySelectorAll('input').forEach(input => input.addEventListener('input', () => field($('#password-form'), 'confirm').setCustomValidity('')));
bindForm('#password-form', async (form, data, status) => {
  if (data.get('newPassword') !== data.get('confirm')) { field(form, 'confirm').setCustomValidity('Passwords do not match.'); field(form, 'confirm').reportValidity(); return; }
  await api('/api/account/reauthenticate', { method: 'POST', body: { password: data.get('currentPassword') } });
  await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword'), revokeOtherSessions: true } });
  form.reset(); await loadSessions(); message(status, 'Your password has been updated and your other sessions have been signed out.');
});
bindAction('#resend-verification', $('#profile-form [data-status]'), async () => {
  await api('/api/auth/send-verification-email', { method: 'POST', body: { email: account.user.email, callbackURL: '/account' } });
  message($('#profile-form [data-status]'), 'If verification is needed, a new link will arrive shortly. Check your inbox and spam folder.');
});
bindAction('#sign-out', $('#account-load-status'), async () => {
  await api('/api/auth/sign-out', { method: 'POST', body: {} }); location.assign('/login');
});
bindAction('#sign-out-all', securityStatus, async () => {
  await confirmIdentity('Confirm your password to sign out this device and every other active session.');
  await api('/api/auth/revoke-sessions', { method: 'POST', body: {} });
  await api('/api/auth/sign-out', { method: 'POST', body: {} }).catch(() => {}); location.assign('/login');
});
async function loadSessions() {
  const data = await api('/api/auth/list-sessions'); const sessions = Array.isArray(data) ? data : data.sessions || [];
  $('#session-list').replaceChildren();
  for (const session of sessions) {
    const row = document.createElement('li'); const details = document.createElement('div'); const name = document.createElement('strong'); const seen = document.createElement('span');
    const current = session.id === account.session?.id;
    name.textContent = `${current ? 'This session' : 'Signed-in device'}${session.userAgent ? ` · ${session.userAgent.slice(0, 100)}` : ''}`;
    seen.textContent = `Started ${readableDate(session.createdAt)} · Expires ${readableDate(session.expiresAt)}`;
    details.append(name, seen); row.append(details);
    if (!current) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-button secondary'; button.textContent = 'Sign out';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api('/api/auth/revoke-session', { method: 'POST', body: { token: session.token } }); await loadSessions(); message(securityStatus, 'The selected session has been signed out.'); }
        catch (error) { fail(securityStatus, error); button.disabled = false; }
      }); row.append(button);
    }
    $('#session-list').append(row);
  }
  if (!sessions.length) { const item = document.createElement('li'); item.textContent = 'No active sessions found. Sign in again to refresh your session.'; $('#session-list').append(item); }
}
bindAction('#refresh-sessions', securityStatus, loadSessions);

function displayRecoveryCodes(codes) {
  recoveryCodes = Array.isArray(codes) ? codes : [];
  $('#backup-codes-panel').hidden = !recoveryCodes.length;
  $('#backup-codes').value = recoveryCodes.join('\n');
}
$('#mfa-dialog').addEventListener('close', () => {
  recoveryCodes = []; $('#backup-codes').value = ''; $('#mfa-secret').value = ''; $('#mfa-verify-form').reset();
});
bindAction('#mfa-toggle', securityStatus, async () => {
  const enabled = account.user.twoFactorEnabled;
  const password = await confirmIdentity(enabled ? 'Confirm your password to remove authenticator protection. Staff accounts must retain two-step verification.' : 'Confirm your password to add an authenticator app.');
  const data = await api(`/api/auth/two-factor/${enabled ? 'disable' : 'enable'}`, { method: 'POST', body: { password } });
  if (enabled) { location.assign('/login?mfaDisabled=1'); return; }
  let secret = '';
  try { secret = new URL(data.totpURI).searchParams.get('secret') || ''; } catch { /* Missing setup details handled below. */ }
  if (!secret) throw Object.assign(new Error('No setup key'), { userMessage: 'The authenticator setup could not be loaded. Close this dialog and try again.' });
  $('#mfa-dialog-title').textContent = 'Set up your authenticator'; $('#mfa-dialog-description').textContent = 'Scan the QR code with your authenticator app (or type the setup key), then enter a code to finish.';
  // QR drawn locally from the otpauth URI (public/vendor/qrcode); the secret never leaves this page.
  const qrBox = $('#mfa-qr');
  qrBox.hidden = typeof window.qrcode !== 'function';
  if (!qrBox.hidden) { const qr = window.qrcode(0, 'M'); qr.addData(data.totpURI); qr.make(); qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); }
  $('#mfa-secret').value = secret; $('#mfa-setup').hidden = false; $('#mfa-verify-form [data-status]').hidden = true;
  displayRecoveryCodes(data.backupCodes); $('#mfa-dialog').showModal();
});
bindForm('#mfa-verify-form', async (form, data, status) => {
  await api('/api/auth/two-factor/verify-totp', { method: 'POST', body: { code: data.get('code').trim() } });
  await loadAccount(); form.reset(); $('#mfa-setup').hidden = true;
  $('#mfa-dialog-title').textContent = 'Two-step verification is on'; $('#mfa-dialog-description').textContent = 'Save your recovery codes before closing this window.';
  message(securityStatus, 'Authenticator protection is enabled. Keep your recovery codes private.');
});
bindAction('#replace-recovery', securityStatus, async () => {
  const password = await confirmIdentity('Confirm your password to replace all recovery codes. Your previous codes will stop working immediately.');
  const data = await api('/api/auth/two-factor/generate-backup-codes', { method: 'POST', body: { password } });
  $('#mfa-dialog-title').textContent = 'Your new recovery codes'; $('#mfa-dialog-description').textContent = 'Your previous recovery codes no longer work.';
  $('#mfa-setup').hidden = true; displayRecoveryCodes(data.backupCodes); $('#mfa-dialog').showModal();
});
$('#download-codes').addEventListener('click', () => downloadJson('visualodds-recovery-codes.json', { account: account.user.email, recoveryCodes }));

bindAction('#export-bets', $('#privacy-status'), async () => {
  await flushAccountData(); const data = await api('/api/account/data/bets', { headers: { 'X-Account-User': account.user.id } }); downloadJson('visualodds-bets.json', data.value); message($('#privacy-status'), 'Your saved bet data has been exported.');
});
bindAction('#export-account', $('#privacy-status'), async () => {
  await confirmIdentity('Confirm your password to download your private account data.');
  const data = await api('/api/account/export'); downloadJson('visualodds-account.json', data); message($('#privacy-status'), 'Your account export is ready. Keep the downloaded file private.');
});
bindForm('#deletion-form', async (_form, data, status) => {
  if (data.get('confirmation') !== 'DELETE') return;
  await confirmIdentity('Confirm your password to request account deletion and disable your account.');
  await api('/api/account/deletion-request', { method: 'POST', body: { confirmation: 'DELETE' } });
  $('#account-content').hidden = true; $('#sign-out').disabled = true;
  message($('#account-load-status'), 'Your deletion request has been recorded and your account is disabled. Review the Privacy Policy for the deletion and retention process.');
  $('#account-load-status').scrollIntoView({ block: 'center' });
});
bindAction('#import-local', $('#import-status'), async () => {
  if (!$('#legacy-consent').checked) { message($('#import-status'), 'Confirm that the saved research on this device belongs to you before importing.', true); return; }
  const result = await importLegacyData({ confirmed: true });
  $('#legacy-consent').checked = false;
  message($('#import-status'), `Imported ${result.imported} saved item groups. ${result.skipped ? `${result.skipped} existing groups were kept unchanged. ` : ''}The original browser data has been preserved.`);
});
function providerRedirect(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('Invalid billing destination');
  location.assign(url.href);
}
bindAction('#billing-portal', $('#billing-status'), async () => {
  await confirmIdentity('Confirm your password to manage your subscription and billing details.');
  const data = await api('/api/account/billing/portal', { method: 'POST', body: {} }); providerRedirect(data.url);
});
async function loadPlans() {
  const response = await api('/api/account/billing/plans'); const plans = Array.isArray(response) ? response : response.plans || [];
  $('#plan-options').replaceChildren();
  for (const plan of plans) {
    const card = document.createElement('div'); card.className = 'plan-option';
    const heading = document.createElement('h3'); heading.textContent = plan.name || plan.id;
    const description = document.createElement('p'); description.textContent = (plan.features || []).map(feature => featureLabels[feature] || feature.replace(/[-_]/g, ' ')).join(', ');
    card.append(heading, description);
    const prices = (plan.prices || []).filter(price => price.available);
    for (const price of prices) {
      const name = price.interval;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-button secondary';
      const amount = new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency || 'USD' }).format(price.amount / 100);
      button.textContent = `Choose ${amount} / ${name === 'annual' ? 'year' : 'month'}`;
      button.disabled = !account.capabilities?.billing || plan.id === account.entitlements?.plan;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await confirmIdentity('Confirm your password to continue to secure checkout.'); const data = await api('/api/account/billing/checkout', { method: 'POST', body: { plan: plan.id, interval: name } }); providerRedirect(data.url); }
        catch (error) { fail($('#billing-status'), error); button.disabled = false; }
      }); card.append(button);
    }
    if (!prices.length) { const note = document.createElement('p'); note.textContent = plan.unavailableReason || (plan.id === 'free' ? 'Included without a subscription.' : 'Checkout is not currently available for this plan.'); card.append(note); }
    $('#plan-options').append(card);
  }
}

// Highlight the settings section currently in view in the sidebar / mobile pill nav.
function setupSectionNav() {
  const nav = $('.settings-sidebar nav');
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const entries = links.map(link => ({ link, section: document.getElementById(link.hash.slice(1)) })).filter(entry => entry.section);
  if (!entries.length) return;
  let locked = 0;
  const setActive = link => {
    for (const entry of entries) {
      if (entry.link === link) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    }
    if (nav.scrollWidth > nav.clientWidth + 1) {
      const left = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, left), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  };
  const update = () => {
    if (Date.now() < locked) return;
    const visible = entries.filter(entry => entry.section.offsetParent !== null);
    if (!visible.length) return;
    const anchor = Math.min(innerHeight * 0.3, 240);
    let current = visible[0];
    for (const entry of visible) if (entry.section.getBoundingClientRect().top - anchor <= 0) current = entry;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = visible.at(-1);
    if (current.link.getAttribute('aria-current') !== 'location') setActive(current.link);
  };
  for (const { link } of entries) link.addEventListener('click', () => { setActive(link); locked = Date.now() + 900; setTimeout(update, 950); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(update, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: '0px 0px -40% 0px' });
    for (const { section } of entries) observer.observe(section);
  }
  let frame = 0;
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); }, { passive: true });
  setActive((entries.find(entry => entry.link.hash === location.hash) || entries[0]).link);
  return update;
}
const refreshSectionNav = setupSectionNav();

try {
  await loadAccount(); $('#account-load-status').hidden = true; $('#account-content').hidden = false; $('#sign-out').disabled = false;
  loadReferral();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  refreshSectionNav?.();
  const notice = new URLSearchParams(location.search).get('notice');
  if (notice === 'UPGRADE_REQUIRED') message($('#account-load-status'), 'Your current plan does not include that tool. Review the available plans below to change your access.');
  if (['MFA_REQUIRED', 'ADMIN_MFA_REQUIRED'].includes(notice)) message($('#account-load-status'), 'This area requires two-step verification. Set up an authenticator in Security, then sign in with an authenticator code.');
  const outcomes = await Promise.allSettled([loadSessions(), loadPlans(), accountReady]);
  if (outcomes[0].status === 'rejected') fail(securityStatus, outcomes[0].reason);
  if (outcomes[1].status === 'rejected') fail($('#billing-status'), outcomes[1].reason);
  const legacy = legacyDataSummary();
  $('#legacy-summary').textContent = legacy.count ? `${legacy.count} saved browser item groups found: ${legacy.groups.map(group => `${group.kind} (${group.count})`).join(', ')}.` : 'No older research was found in this browser.';
  $('#import-local').disabled = !legacy.count;
} catch (error) {
  if (error.status === 401) location.replace('/login?next=%2Faccount');
  else {
    fail($('#account-load-status'), error);
    const link = document.createElement('a'); link.href = '/login'; link.textContent = 'Return to sign in'; $('#account-load-status').append(document.createElement('br'), link);
  }
}
