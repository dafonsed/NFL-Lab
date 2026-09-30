import './error-reporter.js?v=1';
// Cookie / analytics consent. Analytics only exists when the server describes it with
// <meta name="vo-analytics">; the script is loaded after the visitor accepts, never before.
const KEY = 'vo-consent-v1';
const meta = document.querySelector('meta[name="vo-analytics"]');
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = value => { try { localStorage.setItem(KEY, value); } catch { /* private mode: ask again next visit */ } };

// Funnel events (sign-up clicks, pricing, CTAs). A no-op until analytics is loaded with consent.
window.voTrack = (name, props) => {
  if (typeof window.plausible === 'function') window.plausible(name, props ? { props } : undefined);
};
document.addEventListener('click', event => {
  const target = event.target.closest?.('[data-track]');
  if (target) window.voTrack(target.dataset.track, target.dataset.trackLabel ? { label: target.dataset.trackLabel } : undefined);
}, { capture: true });

function loadAnalytics() {
  if (!meta || document.querySelector('script[data-vo-analytics]')) return;
  window.plausible = window.plausible || function queue() { (window.plausible.q = window.plausible.q || []).push(arguments); };
  const script = document.createElement('script');
  script.defer = true;
  script.src = meta.content;
  script.dataset.domain = meta.dataset.domain || location.hostname;
  script.dataset.voAnalytics = '';
  document.head.append(script);
}

function banner() {
  if (document.querySelector('.vo-consent')) return;
  if (!document.querySelector('link[href^="/consent.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/consent.css?v=2' }));
  const node = document.createElement('section');
  node.className = 'vo-consent';
  node.setAttribute('role', 'region');
  node.setAttribute('aria-label', 'Cookie preferences');
  node.innerHTML = `<p><strong>Privacy-friendly analytics</strong>We count visits and clicks to improve VisualOdds. No ads, no cross-site tracking, and we never sell data. <a href="/privacy">Privacy policy</a></p>
    <div class="vo-consent-actions"><button type="button" class="vo-consent-accept">Accept analytics</button><button type="button" class="vo-consent-decline">Essential only</button></div>`;
  node.addEventListener('click', event => {
    const accept = event.target.closest('.vo-consent-accept'), decline = event.target.closest('.vo-consent-decline');
    if (!accept && !decline) return;
    write(accept ? 'granted' : 'denied');
    if (accept) loadAnalytics();
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  });
  document.body.append(node);
  node.querySelector('.vo-consent-accept').focus({ preventScroll: true });
}

// Without analytics there is nothing to consent to, so "Cookie settings" links are hidden.
document.documentElement.classList.toggle('vo-has-analytics', !!meta);
if (!meta) document.querySelectorAll('[data-consent-settings]').forEach(link => { link.hidden = true; });
if (meta) {
  const choice = read();
  if (choice === 'granted') loadAnalytics();
  else if (choice !== 'denied') banner();
}
// "Cookie settings" links reopen the choice.
document.addEventListener('click', event => {
  const link = event.target.closest?.('[data-consent-settings]');
  if (!link) return;
  event.preventDefault();
  if (meta) banner();
});

// Quick search (Ctrl/⌘ K or any [data-open-search] button). The palette loads on first use.
const openSearch = () => import('./command-palette.js?v=1').then(module => module.openPalette());
addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
});
document.addEventListener('click', event => { if (event.target.closest?.('[data-open-search]')) { event.preventDefault(); openSearch(); } });
if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelectorAll('[data-open-search] kbd').forEach(key => { key.textContent = '⌘ K'; });

// Alerts bell in the workspace sidebar.
if (document.querySelector('.dashboard-search')) import('./notification-bell.js?v=1');
