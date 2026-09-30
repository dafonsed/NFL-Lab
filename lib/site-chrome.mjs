import { consentHead } from './consent.mjs';
// The public site header and footer. Every public page (homepage, Learn library, education,
// state and sportsbook guides, calculators, API page, docs, company pages) renders these, so the
// navigation and footer stay identical everywhere. Class names match the homepage design.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ARROW = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

export const HEADER_LINKS = [
  ['tools', 'Tools', '/#tools'],
  ['how', 'How it works', '/#how'],
  ['pricing', 'Pricing', '/#plans'],
  ['learn', 'Learn', '/learn'],
  ['api', 'API', '/odds-api'],
];

export const FOOTER_COLUMNS = [
  ['product', 'Product', [['Player research', '/research'], ['Live games', '/live'], ['Game simulation', '/simulation'], ['EV workbench', '/ev'], ['Bet tracker', '/ev/tracker']]],
  ['learn', 'Learn', [['Learn library', '/learn'], ['Beginner Guide', '/learn/beginner-guide'], ['Calculators', '/betting-calculators'], ['Betting by state', '/online-sports-betting'], ['Sportsbooks', '/sportsbooks']]],
  ['developers', 'Developers', [['API reference', '/odds-api'], ['Guides', '/docs'], ['Status', '/status'], ['Changelog', '/changelog']]],
  ['company', 'Company', [['About', '/about'], ['Pricing', '/#plans'], ['Help center', '/help'], ['Contact', '/contact']]],
];

/** `current` is one of the HEADER_LINKS keys; that link gets aria-current. */
export function siteHeader({ current = '' } = {}) {
  const links = HEADER_LINKS.map(([key, label, href]) => `<a href="${esc(href)}"${key === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  return `<header class="home-header vo-site-header">
    <div class="home-header-inner">
      <a class="home-brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="34" height="34" alt=""><span>Visual<em>Odds</em></span></a>
      <nav class="home-nav" id="home-nav" aria-label="Main navigation">${links}<a class="home-nav-login" href="/login">Log in</a></nav>
      <div class="home-header-end">
        <a class="home-login" href="/login">Log in</a>
        <a class="home-button home-header-action" href="/research" data-track="CTA" data-track-label="header">Get started</a>
        <button class="home-menu-toggle" type="button" aria-controls="home-nav" aria-expanded="false" aria-label="Open menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
      </div>
    </div>
  </header>`;
}

/** Community link (e.g. a Discord invite) from COMMUNITY_URL; https only, hidden when unset. */
export function communityUrl(env = process.env) {
  try { const url = new URL(env.COMMUNITY_URL || ''); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

export function siteFooter(env = process.env) {
  const community = communityUrl(env);
  const columnsData = FOOTER_COLUMNS.map(([id, title, links]) => id === 'company' && community ? [id, title, [...links, ['Community', community]]] : [id, title, links]);
  const columns = columnsData.map(([id, title, links]) => `<nav class="vo-footer-column" aria-labelledby="footer-${id}-title"><h2 id="footer-${id}-title">${esc(title)}</h2>${links.map(([label, href]) => `<a href="${esc(href)}"${/^https:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`).join('')}</nav>`).join('');
  return `<footer class="home-footer vo-site-footer">
    <div class="vo-footer">
      <div class="vo-footer-main">
        <div class="vo-footer-brand">
          <a class="home-brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="34" height="34" alt=""><span>Visual<em>Odds</em></span></a>
          <p>Sports research with the source in view.</p>
          <a class="vo-footer-cta" href="/research">Open the workspace ${ARROW}</a>
        </div>
        <div class="vo-footer-columns">${columns}</div>
      </div>
      <div class="vo-footer-bottom">
        <p class="vo-footer-meta"><span>© 2026 VisualOdds</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="#" data-consent-settings>Cookie settings</a></p>
        <p class="vo-footer-legal"><span class="vo-footer-age">21+</span>VisualOdds does not take bets. Gambling problem? Call <a href="tel:18004262537">1-800-GAMBLER</a>.</p>
      </div>
    </div>
  </footer>`;
}

/** Assets a page needs to render the chrome when it does not load the homepage stylesheet:
    the chrome styles, the mobile menu, and the consent script (analytics, error reporting, search). */
export function siteChromeAssets(env = process.env) {
  return `<link rel="stylesheet" href="/site-chrome.css?v=4"><link rel="stylesheet" href="/site-footer.css?v=1"><link rel="stylesheet" href="/editorial-art.css?v=2"><script type="module" src="/landing-nav.js?v=2"></script>${consentHead(env)}`;
}

/** Fill `<!--vo-site-header-->` / `<!--vo-site-footer-->` placeholders in a static page. */
export function withSiteChrome(html, options = {}) {
  return html.replace('<!--vo-site-header-->', siteHeader(options)).replace('<!--vo-site-footer-->', siteFooter());
}
