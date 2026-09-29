import { api } from './account-client.js';

// Every connected controller shares this request and the server's staff identity.
// Permission checks remain on the server; this shell never chooses a role.
export const staffContext = api('/api/admin/capabilities').then(data => {
  if (!data?.actor || typeof data.actor.role !== 'string' || !Array.isArray(data.permissions)) {
    throw Object.assign(new Error('Invalid staff context'), {
      userMessage: 'Staff identity could not be loaded. Reload the page to try again.'
    });
  }
  return data;
});

const $ = selector => document.querySelector(selector);
const roleNames = { owner: 'Owner', admin: 'Administrator', support: 'Support', 'data-operator': 'Data operator', content: 'Content editor' };
$('[data-admin-search]')?.setAttribute('aria-label', 'Search admin');

staffContext.then(({ actor }) => {
  const name = actor.name || actor.email || 'Staff account';
  if ($('#admin-actor-name')) $('#admin-actor-name').textContent = name;
  if ($('#admin-actor-role')) $('#admin-actor-role').textContent = roleNames[actor.role] || actor.role;
  if ($('#admin-actor-avatar')) $('#admin-actor-avatar').textContent = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() || 'S';
  if ($('#admin-shell-status')) $('#admin-shell-status').textContent = `Signed in as ${name}, ${roleNames[actor.role] || actor.role}.`;
}, error => {
  if ($('#admin-actor-name')) $('#admin-actor-name').textContent = 'Staff access unavailable';
  if ($('#admin-actor-role')) $('#admin-actor-role').textContent = 'Check your account session';
  if ($('#admin-actor-avatar')) $('#admin-actor-avatar').textContent = '?';
  if ($('#admin-shell-status')) $('#admin-shell-status').textContent = error.userMessage || 'Staff identity could not be loaded.';
});

const sidebar = $('#admin-sidebar');
const workspace = $('.ad-workspace');
const backdrop = $('#admin-nav-backdrop');
const menu = $('[data-admin-menu]');
const narrow = window.matchMedia('(max-width: 760px)');
let drawerOpen = false;
let drawerOpener = null;

function drawerTargets() {
  return sidebar ? [...sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(node => !node.hidden && node.getClientRects().length) : [];
}

function setDrawer(open, restoreFocus = true) {
  if (!sidebar || !workspace || !menu || !backdrop) return;
  const wasOpen = drawerOpen;
  drawerOpen = Boolean(open && narrow.matches);
  sidebar.classList.toggle('is-open', drawerOpen);
  sidebar.inert = narrow.matches && !drawerOpen;
  workspace.inert = drawerOpen;
  backdrop.hidden = !drawerOpen;
  document.body.classList.toggle('ad-nav-open', drawerOpen);
  menu.setAttribute('aria-expanded', String(drawerOpen));
  menu.setAttribute('aria-label', drawerOpen ? 'Close navigation' : 'Open navigation');
  if (narrow.matches && !drawerOpen) sidebar.setAttribute('aria-hidden', 'true');
  else sidebar.removeAttribute('aria-hidden');
  if (drawerOpen) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    if (!wasOpen) {
      drawerOpener = document.activeElement;
      (sidebar.querySelector('[aria-current="page"]') || drawerTargets()[0])?.focus();
    }
  } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    if (wasOpen && restoreFocus && narrow.matches) (drawerOpener?.isConnected ? drawerOpener : menu).focus();
  }
}

menu?.addEventListener('click', () => setDrawer(!drawerOpen));
backdrop?.addEventListener('click', () => setDrawer(false));
narrow.addEventListener('change', () => {
  const focusInSidebar = sidebar?.contains(document.activeElement);
  setDrawer(false, false);
  if (narrow.matches && focusInSidebar) menu?.focus();
});
setDrawer(false, false);

const searchDialog = $('#admin-area-search');
const query = $('#admin-area-query');
const results = $('#admin-area-results');
const searchButton = $('[data-admin-search]');
let searchOpener = null;
const availability = { connected: 'Connected', limited: 'Limited controls', unavailable: 'Not connected' };
const areas = sidebar ? [...sidebar.querySelectorAll('a[data-admin-section]')].map(link => ({
  id: link.dataset.adminSection,
  label: link.querySelector('span')?.textContent.trim() || link.textContent.trim(),
  group: link.closest('nav')?.getAttribute('aria-label') || 'Administration',
  availability: link.dataset.adminAvailability || 'unavailable',
  href: link.getAttribute('href')
})) : [];

function renderSearch() {
  if (!query || !results) return;
  const words = query.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = areas.filter(area => words.every(word => `${area.label} ${area.id} ${area.group} ${availability[area.availability]}`.toLocaleLowerCase().includes(word)));
  results.replaceChildren();
  const count = document.createElement('p');
  count.className = 'ad-area-count';
  count.setAttribute('role', 'status');
  count.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'area' : 'areas'}${words.length ? ' found' : ' in this workspace'}` : 'No areas match. Try a name such as users, sources, or support.';
  results.append(count);
  if (!matches.length) return;
  const list = document.createElement('ul');
  list.className = 'ad-area-list';
  for (const area of matches) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = area.href;
    link.dataset.availability = area.availability;
    if (area.id === document.body.dataset.adminView) link.setAttribute('aria-current', 'page');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = area.label;
    const group = document.createElement('small');
    group.textContent = area.group;
    const state = document.createElement('span');
    state.className = 'ad-area-availability';
    state.textContent = availability[area.availability];
    copy.append(title, group);
    link.append(copy, state);
    item.append(link);
    list.append(item);
  }
  results.append(list);
}

function openSearch(opener = document.activeElement) {
  if (!searchDialog || !query || !results) return;
  // Do not replace an active edit or confirmation dialog and lose its draft.
  if ([...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== searchDialog)) return;
  if (searchDialog.open) { query.focus(); return; }
  searchOpener = drawerOpen ? menu : opener;
  setDrawer(false, false);
  query.value = '';
  renderSearch();
  searchDialog.showModal();
  query.focus();
}

if (results) results.setAttribute('aria-live', 'off');
searchButton?.setAttribute('aria-keyshortcuts', 'Control+k Meta+k');
searchButton?.addEventListener('click', () => openSearch(searchButton));
query?.addEventListener('input', renderSearch);
$('[data-admin-search-close]')?.addEventListener('click', () => searchDialog?.close());
searchDialog?.addEventListener('close', () => {
  const target = searchOpener?.isConnected && !searchOpener.closest('[inert]') ? searchOpener : searchButton;
  target?.focus();
});
searchDialog?.addEventListener('keydown', event => {
  const links = [...results.querySelectorAll('a')];
  const index = links.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' && links.length) {
    event.preventDefault();
    links[Math.min(index + 1, links.length - 1)].focus();
  } else if (event.key === 'ArrowUp' && (index >= 0 || document.activeElement === query)) {
    event.preventDefault();
    if (index <= 0) query.focus();
    else links[index - 1].focus();
  } else if (event.key === 'Enter' && document.activeElement === query && links.length) {
    event.preventDefault();
    links[0].click();
  }
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLocaleLowerCase() === 'k' && searchDialog) {
    event.preventDefault();
    openSearch();
    return;
  }
  if (!drawerOpen || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setDrawer(false);
  } else if (event.key === 'Tab') {
    const targets = drawerTargets();
    if (!targets.length) return;
    const index = targets.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); targets.at(-1).focus(); }
    else if (!event.shiftKey && (index === targets.length - 1 || index < 0)) { event.preventDefault(); targets[0].focus(); }
  }
});

function updateViewport() {
  document.documentElement.style.setProperty('--admin-viewport', `${window.visualViewport?.height || window.innerHeight}px`);
}
updateViewport();
window.visualViewport?.addEventListener('resize', updateViewport);
