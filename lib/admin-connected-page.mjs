import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { icon } from '../public/ui-icons.js';

// This navigation contains presentation metadata only. Live controllers read
// authenticated APIs; no sandbox catalog, browser store, or sample data is used.
export const CONNECTED_ADMIN_SECTIONS = Object.freeze([
  ['overview', 'Overview', 'Workspace', 'home', 'connected', 'Platform overview', 'Your customers, operations, and service availability in one workspace.'],
  ['users', 'Users', 'Business', 'players', 'connected', 'Users', 'Manage customer access, manual grants, and account security with an audited staff identity.'],
  ['billing', 'Plans & billing', 'Business', 'tag', 'limited', 'Plans & billing', 'Inspect customer subscription records and manage manual access. Refunds and pricing administration are unavailable.'],
  ['sources', 'Data sources', 'Trading operations', 'research', 'limited', 'Data sources', 'Inspect connected EV sources and control quote distribution. Upstream collection settings are unavailable.'],
  ['events', 'Events & markets', 'Trading operations', 'calendar', 'limited', 'Events & markets', 'Inspect events in the connected EV feed and suppress or restore their quote distribution.'],
  ['quality', 'Odds quality', 'Trading operations', 'check', 'unavailable', 'Odds quality', 'A connected quality review service is required to investigate and resolve feed-quality incidents.'],
  ['ev', '+EV & fair lines', 'Trading operations', 'ev', 'unavailable', '+EV & fair lines', 'Publishing fair-line rules and reference-book weights is not available from this workspace.'],
  ['arbitrage', 'Arb & Smart Money', 'Trading operations', 'trends', 'unavailable', 'Arb & Smart Money', 'Arbitrage and signal qualification rules do not have a connected administration service.'],
  ['fantasy', 'Fantasy & parlays', 'Trading operations', 'simulation', 'unavailable', 'Fantasy & parlays', 'DFS payout, correlation, and settlement settings cannot be changed from this workspace.'],
  ['links', 'Bet links & regions', 'Trading operations', 'arrow', 'unavailable', 'Bet links & regions', 'Sportsbook link testing and regional configuration do not have a connected administration service.'],
  ['grading', 'Bet grading', 'Trading operations', 'check', 'unavailable', 'Bet grading', 'Automated settlement corrections and grading backfills are not connected. Customer grading disputes can be tracked in support.'],
  ['clv', 'CLV & performance', 'Trading operations', 'performance', 'unavailable', 'CLV & performance', 'Closing-line recalculation and historical performance jobs are not available from this workspace.'],
  ['wallets', 'Insiders & wallets', 'Trading operations', 'bookmark', 'unavailable', 'Insiders & wallets', 'Wallet monitoring and insider identity review do not have a connected administration service.'],
  ['lineups', 'Lineup Dropper', 'Trading operations', 'players', 'unavailable', 'Lineup Dropper', 'Lineup collection and publication do not have a connected administration service.'],
  ['notifications', 'Notifications', 'Platform', 'info', 'unavailable', 'Notifications', 'Email, push, and Discord campaign delivery is not available here. Customer notices can be published in content.'],
  ['content', 'Promotions & content', 'Business', 'paper', 'limited', 'Promotions & content', 'Draft, schedule, publish, and archive customer notices. Promotional billing offers are not connected.'],
  ['support', 'Customer support', 'Business', 'info', 'connected', 'Customer support', 'Review real customer reports, manage their status, and keep internal staff notes.'],
  ['system', 'System health', 'Platform', 'live', 'unavailable', 'System health', 'Infrastructure monitoring, job replay, and deployment rollback do not have connected controls here.'],
  ['admins', 'Admin accounts', 'Platform', 'gear', 'limited', 'Admin accounts', 'Inspect staff roles, security, and sessions. Only permitted account actions are available.'],
  ['security', 'Security & audit', 'Platform', 'settings', 'limited', 'Security & audit', 'Review recorded account and operational changes with their authenticated staff identity.'],
  ['reports', 'Reports & analytics', 'Workspace', 'research', 'limited', 'Reports & analytics', 'Review and export available account, support, and service records. Revenue and historical traffic reporting are not connected.'],
].map(([id, label, group, glyph, availability, title, description]) => Object.freeze({ id, label, group, glyph, availability, title, description })));

const byId = new Map(CONNECTED_ADMIN_SECTIONS.map(section => [section.id, section]));
const accountViews = new Set(['users', 'billing', 'admins', 'security']);
const operationViews = new Set(['support', 'content', 'sources', 'events', 'operations']);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const href = id => id === 'overview' ? '/admin' : `/admin/${id}`;

function extractTemplate(source, kind) {
  const $ = load(source), main = $('main').first();
  main.children('.settings-heading, noscript').remove();
  if (kind === 'accounts') {
    // Keep complete controller contracts while allowing view-specific display.
    const first = $('#admin-search'), last = $('#admin-results');
    const directory = $('<div id="connected-directory"></div>');
    first.before(directory);
    const nodes = first.nextUntil(last).addBack().add(last).toArray();
    for (const node of nodes) directory.append(node);
  } else {
    main.find('.connected-panel').filter((_, node) => !$(node).attr('id')).remove();
  }
  return { content: main.html(), dialogs: $('body > dialog').map((_, node) => $.html(node)).get().join('\n') };
}

const [accountSource, operationSource] = await Promise.all([
  readFile(new URL('../public/admin-accounts.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/admin-operations.html', import.meta.url), 'utf8'),
]);
const accountTemplate = extractTemplate(accountSource, 'accounts');
const operationTemplate = extractTemplate(operationSource, 'operations');

function sidebar(current) {
  const groups = [...new Set(CONNECTED_ADMIN_SECTIONS.map(section => section.group))];
  return `<aside class="ad-sidebar" id="admin-sidebar" aria-label="Admin navigation">
    <a class="ad-brand" href="/admin"><img src="/favicon.svg" alt="" width="32" height="32"><span>VisualOdds<small>Administration</small></span><span class="ad-brand-chevron">${icon('chevron')}</span></a>
    <div class="ad-nav-scroll">${groups.map(group => `<nav class="ad-nav-group" aria-label="${esc(group)}"><h2>${esc(group)}</h2>${CONNECTED_ADMIN_SECTIONS.filter(section => section.group === group).map(section => `<a href="${href(section.id)}" data-admin-section="${section.id}" data-admin-availability="${section.availability}"${section.id === current ? ' aria-current="page"' : ''}>${icon(section.glyph)}<span>${esc(section.label)}</span>${section.availability !== 'connected' ? `<small class="ad-nav-state">${section.availability === 'limited' ? 'Limited' : 'Not connected'}</small>` : ''}</a>`).join('')}</nav>`).join('')}</div>
    <div class="ad-sidebar-footer"><a href="/">${icon('arrow')}<span>Back to VisualOdds</span></a><a class="ad-staff-profile" href="/account#security"><span class="ad-avatar" id="admin-actor-avatar" aria-hidden="true">…</span><span><strong id="admin-actor-name">Checking staff identity…</strong><small id="admin-actor-role">Authenticated staff access</small></span>${icon('gear')}</a></div>
  </aside><button id="admin-nav-backdrop" class="ad-backdrop" type="button" aria-label="Close navigation" hidden></button>`;
}

function unavailable(section) {
  const related = section.id === 'grading' ? ['support', 'Customer support'] : section.id === 'notifications' ? ['content', 'Promotions & content'] : ['overview', 'Platform overview'];
  return `<section class="ad-panel ad-unavailable" aria-labelledby="unavailable-heading"><div class="ad-panel-heading"><div><h2 id="unavailable-heading">Not connected</h2><p>This area does not have live administration controls yet.</p></div><span class="ad-badge neutral">Unavailable</span></div><div class="ad-unavailable-body"><p>${esc(section.description)}</p><p>No sample records or pending requests are shown as live operations.</p><a class="ad-button secondary" href="${href(related[0])}">${esc(related[1])}${icon('arrow')}</a></div></section>`;
}

/** Call only after the normal account/staff/MFA route guard has completed. */
export function renderConnectedAdminPage(url) {
  const alias = { '/admin-accounts.html': 'users', '/admin.html': 'overview' }[url.pathname];
  const match = /^\/admin(?:\/([a-z]+))?\/?$/.exec(url.pathname);
  if (!alias && !match) return null;
  const id = alias || (match[1] === 'accounts' ? 'users' : match[1] || 'overview');
  const section = byId.get(id) || (id === 'operations' ? { id, label: 'Operations', title: 'Operations', description: 'Work on customer support, notices, and connected EV feed distribution.', availability: 'limited' } : null);
  if (!section) return null;
  const template = accountViews.has(id) ? accountTemplate : operationViews.has(id) ? operationTemplate : null;
  const overview = ['overview', 'reports'].includes(id);
  const script = accountViews.has(id) ? 'admin-accounts.js' : operationViews.has(id) ? 'admin-operations.js' : overview ? 'admin-overview.js' : null;
  const content = template?.content || (overview ? '<p id="overview-status" class="account-status" role="status" aria-live="polite" hidden></p><div id="admin-overview-content">Loading overview…</div>' : unavailable(section));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${esc(section.label)} · VisualOdds Admin</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/admin.css"><link rel="stylesheet" href="/admin-unified.css">${overview ? '<link rel="stylesheet" href="/admin-overview.css">' : ''}<script type="module" src="/admin-shell.js"></script>${script ? `<script type="module" src="/${script}"></script>` : ''}</head>
<body class="admin-app admin-connected-app" data-admin-view="${id}"><a class="admin-skip-link" href="#admin-main">Skip to admin workspace</a>${sidebar(id)}<div class="ad-workspace"><header class="ad-topbar"><div class="ad-breadcrumb"><button type="button" class="ad-mobile-toggle ad-icon-button" data-admin-menu aria-controls="admin-sidebar" aria-expanded="false" aria-label="Open navigation">${icon('more')}</button><span>Admin workspace</span>${icon('chevron')}<strong>${esc(section.label)}</strong></div><div class="ad-top-actions"><button type="button" class="ad-command" data-admin-search>${icon('search')}<span>Search admin</span><kbd>Ctrl K</kbd></button><span class="ad-environment"><i></i>Connected workspace</span></div></header><main id="admin-main" tabindex="-1"><div class="ad-page-heading"><div><div class="ad-heading-context">Administration <span> / </span> ${esc(section.label)}</div><h1>${esc(section.title)}</h1><p>${esc(section.description)}</p></div></div>${content}<footer class="ad-page-footer"><span>VisualOdds administration</span><span>Actions use your authenticated staff identity</span><a href="/account#security">Account security</a></footer></main></div>
${template?.dialogs || ''}
<dialog id="admin-area-search" class="ad-dialog command-dialog" aria-labelledby="admin-area-title"><div class="ad-dialog-header"><div><h2 id="admin-area-title">Find an admin area</h2><p>Search available operations and integration status.</p></div><button type="button" class="ad-icon-button" data-admin-search-close aria-label="Close search">${icon('close')}</button></div><div class="ad-dialog-body"><label class="ad-search global" for="admin-area-query">${icon('search')}<span class="ad-sr-only">Search admin areas</span><input id="admin-area-query" type="search" autocomplete="off" placeholder="Search admin areas…" maxlength="120"></label><div id="admin-area-results" aria-live="polite"></div></div></dialog><div id="admin-shell-status" class="ad-sr-only" role="status" aria-live="polite"></div><noscript><p>Enable JavaScript to load authenticated records and use the connected administration controls.</p></noscript></body></html>`;
}
