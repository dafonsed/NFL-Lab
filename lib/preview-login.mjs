// Local design preview only: a one-click "Continue as guest" sign-in to the preview's test
// account. scripts/design-preview.mjs enables it; the normal server never does. It also
// refuses to run outside the test runtime, on Vercel, or for any host other than localhost.
let signInPreviewAccount = null;

/** Called by scripts/design-preview.mjs with a function that returns the session Set-Cookie headers. */
export function enablePreviewLogin(signIn) { signInPreviewAccount = signIn; }

export const previewLoginEnabled = () => typeof signInPreviewAccount === 'function' && process.env.NODE_ENV === 'test' && !process.env.VERCEL;

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
export const isLocalRequest = req => LOCAL_HOST.test(String(req.headers.host || ''));

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/ev/dashboard';
  if (/^\/(?:api\/auth|login|register|two-factor|reset-password)(?:[/?#]|$)/.test(value)) return '/ev/dashboard';
  return value;
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The guest button for the sign-in page, or '' when preview login is off. */
export function previewLoginButton(req, url) {
  if (!previewLoginEnabled() || !isLocalRequest(req)) return '';
  const next = encodeURIComponent(safeNext(url.searchParams.get('next') || '/ev/dashboard'));
  return `<form class="account-guest" method="post" action="/login/guest?next=${esc(next)}"><button type="submit">Continue as guest</button><small>Local preview only · signs in to the test account</small></form>`;
}

/** POST /login/guest: signs in to the preview account and returns to `next`. */
export async function handlePreviewLogin(req, res, url) {
  if (url.pathname !== '/login/guest' || !previewLoginEnabled() || !isLocalRequest(req)) return false;
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return true; }
  // Same-site form posts only. The site's no-referrer policy makes browsers send `Origin: null`
  // on form posts, so rely on Sec-Fetch-Site, and reject any other explicit origin.
  const origin = req.headers.origin, site = req.headers['sec-fetch-site'];
  if ((site && !['same-origin', 'none'].includes(site)) || (origin && origin !== 'null' && origin !== `http://${req.headers.host}`)) { res.writeHead(403); res.end(); return true; }
  const cookies = await signInPreviewAccount(`http://${req.headers.host}`);
  res.writeHead(303, { Location: safeNext(url.searchParams.get('next') || '/ev/dashboard'), 'Set-Cookie': cookies, 'Cache-Control': 'no-store' });
  res.end();
  return true;
}
