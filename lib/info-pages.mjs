// Company pages (About, Contact, Changelog, Status) in the VisualOdds site style.
import { siteHeader, siteFooter, siteChromeAssets } from './site-chrome.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CHANGELOG = [
  { date: '2026-09-29', title: 'VisualOdds', items: [
    'SportsLab is now VisualOdds, with one design across every page.',
    'Workspaces are grouped into Trends, Models and +EV, each with its own dashboard.',
    'New tool layouts for the promo converter, parlay builder, fantasy optimizer, slip builder and prediction markets.',
    'Bet tracker: CSV import, free bets, profit boosts and personal betting limits.',
    'Saved alerts can now notify you through your browser.',
    'A setup checklist on each dashboard for new accounts.',
  ] },
  { date: '2026-09-28', title: 'Accounts and billing', items: [
    'Accounts with email verification, two-step sign-in for staff, and data export.',
    'Plan management and a customer billing portal, ready for checkout to open.',
    'Help center with searchable guides and support tickets.',
  ] },
];

const PAGES = {
  about: {
    title: 'About VisualOdds',
    description: 'VisualOdds is a sports-betting research workspace that keeps the source, the math and the limits in view.',
    body: `<section class="info-hero"><span class="info-kicker">About</span><h1>Research you can check.</h1><p>VisualOdds brings odds from many sportsbooks, player history, model projections and your own bet record into one workspace, and shows where every number comes from.</p></section>
      <section class="info-grid">
        <article><h2>What we do</h2><p>Compare prices across books, find positive expected value and arbitrage, study player trends against today's lines, and track every bet you place with profit, ROI and closing-line value.</p></article>
        <article><h2>What we don't do</h2><p>We don't take bets, hold balances or pick winners for you. Projections are estimates with stated assumptions, and past hit rates describe the past. You place any bet yourself at a licensed sportsbook.</p></article>
        <article><h2>How we work</h2><p>Sources and timestamps sit next to the numbers. When data is delayed or missing, the tool says so instead of guessing. Calculations like no-vig fair odds and Kelly stakes are shown, not hidden.</p></article>
        <article><h2>Bet responsibly</h2><p>Set limits in the tracker, take a break whenever you need one, and only bet what you can afford to lose. Gambling problem? Call or text <a href="tel:18004262537">1-800-GAMBLER</a>.</p></article>
      </section>`,
  },
  contact: {
    title: 'Contact VisualOdds',
    description: 'Get help with VisualOdds: the help center, support tickets, billing questions and partnerships.',
    body: `<section class="info-hero"><span class="info-kicker">Contact</span><h1>How can we help?</h1><p>Most answers are in the help center. For anything else, reach the right place below.</p></section>
      <section class="info-grid">
        <article><h2>Help center</h2><p>Guides for every tool, market and calculator, plus account and billing answers.</p><a class="info-link" href="/help">Open the help center →</a></article>
        <article><h2>Support ticket</h2><p>Signed in? Open a ticket from your account and our team replies by email. Include the tool, sport and what you expected to see.</p><a class="info-link" href="/account">Go to your account →</a></article>
        <article><h2>Billing</h2><p>Change your plan, update your card or cancel from the billing portal in your account. Questions about a charge: <a href="mailto:billing@visualodds.com">billing@visualodds.com</a>.</p></article>
        <article><h2>Partnerships and press</h2><p>Sportsbooks, data partners and media: <a href="mailto:hello@visualodds.com">hello@visualodds.com</a>.</p></article>
      </section>
      <p class="info-note">Need to talk to someone about gambling? Call or text <a href="tel:18004262537">1-800-GAMBLER</a> for free, confidential help, any time.</p>`,
  },
  changelog: {
    title: 'What’s new at VisualOdds',
    description: 'Release notes for VisualOdds: new tools, improvements and fixes.',
    body: `<section class="info-hero"><span class="info-kicker">Changelog</span><h1>What’s new</h1><p>New tools, improvements and fixes, newest first.</p></section>
      <ol class="info-changelog">${CHANGELOG.map(entry => `<li><time datetime="${esc(entry.date)}">${esc(new Date(entry.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))}</time><div><h2>${esc(entry.title)}</h2><ul>${entry.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div></li>`).join('')}</ol>`,
  },
  status: {
    title: 'VisualOdds status',
    description: 'Live status of the VisualOdds website and data services.',
    body: `<section class="info-hero"><span class="info-kicker">Status</span><h1 id="status-summary">Checking services…</h1><p>This page checks the service directly from your browser. Refresh to check again.</p></section>
      <ul class="info-status" id="status-list" aria-live="polite">
        <li data-component="site"><span class="info-dot is-up"></span><strong>Website</strong><small>Up</small></li>
        <li data-component="api"><span class="info-dot"></span><strong>Workspace API</strong><small>Checking…</small></li>
        <li data-component="sync"><span class="info-dot"></span><strong>Sports data sync</strong><small>Checking…</small></li>
      </ul>
      <p class="info-note">Public sports feeds can lag. When a feed is delayed, the affected tools say so next to the data.</p>
      <script type="module" src="/status.js?v=1"></script>`,
  },
};

export const INFO_PATHS = Object.keys(PAGES).map(key => '/' + key);

export function renderInfoPage(pathname, origin = 'https://visualodds.com') {
  const key = String(pathname).replace(/^\//, '').replace(/\/$/, '');
  const page = PAGES[key];
  if (!page) return null;
  const canonical = `${origin.replace(/\/+$/, '')}/${key}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#07090b">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:image" content="https://visualodds.com/assets/og/visualodds.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/info-pages.css?v=3">${siteChromeAssets()}
</head>
<body class="info-page">
  ${siteHeader()}
  <main class="info-main">${page.body}</main>
  ${siteFooter()}
</body>
</html>`;
}
