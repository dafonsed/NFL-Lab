// Analytics + consent wiring. Analytics is off unless ANALYTICS_SCRIPT_URL names an https script
// (e.g. https://plausible.io/js/script.js). When it is on, pages carry a meta tag describing it and
// public/consent.js only loads the script after the visitor accepts analytics in the banner.

export function analyticsConfig(env = process.env) {
  try {
    const src = new URL(env.ANALYTICS_SCRIPT_URL || '');
    if (src.protocol !== 'https:') return null;
    const domain = String(env.ANALYTICS_DOMAIN || 'visualodds.com').replace(/[^a-z0-9.-]/gi, '');
    return { src: src.href, origin: src.origin, domain };
  } catch { return null; }
}

const escAttr = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Adds the consent script (always) and the analytics description (when configured) to an HTML page. */
export function withConsent(html, env = process.env) {
  if (!html.includes('</head>') || html.includes('/consent.js')) return html;
  // Styles are loaded by consent.js only when the banner is shown, so pages keep their stylesheet order.
  return html.replace('</head>', `${consentHead(env)}</head>`);
}

/** The consent script (always) plus the analytics description (when configured), for a page <head>. */
export function consentHead(env = process.env) {
  const config = analyticsConfig(env);
  const meta = config ? `<meta name="vo-analytics" content="${escAttr(config.src)}" data-domain="${escAttr(config.domain)}">` : '';
  return `${meta}<script type="module" src="/consent.js?v=5"></script>`;
}

/** Extra CSP sources so the configured analytics script can load and report. */
export function analyticsCsp(env = process.env) {
  const config = analyticsConfig(env);
  return config ? { script: ` ${config.origin}`, connect: ` ${config.origin}` } : { script: '', connect: '' };
}
