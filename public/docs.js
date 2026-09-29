// Each tool link opens the matching screen in the local EV workspace.
const endpointGroups = [
  { name: 'Markets', endpoints: [
    ['Odds comparison', '/ev#odds'],
    ['Positive EV · pregame', '/ev#ev-pre'],
    ['Positive EV · live', '/ev#ev-live'],
    ['Arbitrage · pregame', '/ev#arb-pre'],
    ['Arbitrage · live', '/ev#arb-live'],
    ['Middles', '/ev#middles'],
    ['Low holds', '/ev#holds']
  ] },
  { name: 'Builders', endpoints: [
    ['Promo / bonus converter', '/ev#promo'],
    ['Parlay builder', '/ev#parlay']
  ] },
  { name: 'Research', endpoints: [['Sharp money / Pro', '/ev#sharp']] },
  { name: 'Fantasy', endpoints: [
    ['Fantasy lines', '/ev#fantasy'],
    ['Fantasy optimizer', '/ev#optimizer'],
    ['Fantasy slip builder', '/ev#slip'],
    ['Fantasy alerts', '/ev#fantasy-alerts']
  ] },
  { name: 'Records', endpoints: [
    ['Prediction traders', '/ev#prediction'],
    ['Bet tracker & CLV', '/ev/tracker'],
    ['Player prop trends', '/ev#trends'],
    ['Movement & price alerts', '/ev#line-alerts']
  ] }
];

const root = document.documentElement;
const body = document.body;
const filter = document.getElementById('docs-filter');
const endpointNav = document.getElementById('endpoint-nav');
const menu = document.getElementById('menu-toggle');
const themeButton = document.getElementById('theme-toggle');
const tocLinks = [...document.querySelectorAll('.docs-toc a')];

for (const group of endpointGroups) {
  const details = document.createElement('details');
  details.className = 'endpoint-group';
  const summary = document.createElement('summary');
  summary.append(document.createTextNode(group.name));
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-chevron');
  chevron.append(use);
  summary.append(chevron);
  details.append(summary);
  const items = document.createElement('div');
  items.className = 'endpoint-items';
  for (const [label, href] of group.endpoints) {
    const link = document.createElement('a');
    link.className = 'endpoint-link';
    link.href = href;
    link.title = `Open ${label} in the EV workspace`;
    link.append(document.createTextNode(label));
    items.append(link);
  }
  details.append(items);
  endpointNav.append(details);
}

function setTheme(theme) {
  root.dataset.theme = theme;
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  document.querySelector('meta[name="theme-color"]').content = '#0a1d2b';
}
try { setTheme(localStorage.getItem('sportslab-docs-theme') === 'light' ? 'light' : 'dark'); }
catch { setTheme('dark'); }
themeButton.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  try { localStorage.setItem('sportslab-docs-theme', next); } catch { /* Storage may be unavailable. */ }
});

function closeMenu() {
  body.classList.remove('nav-open');
  menu.setAttribute('aria-expanded', 'false');
}
menu.addEventListener('click', () => {
  const open = body.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', String(open));
  if (open) filter.focus();
});
body.addEventListener('click', event => {
  if (body.classList.contains('nav-open') && !event.target.closest('#docs-sidebar, #menu-toggle')) closeMenu();
});
endpointNav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });

function updateFilter() {
  const query = filter.value.trim().toLowerCase();
  let matches = 0;
  for (const page of document.querySelectorAll('.sidebar-page')) {
    page.hidden = !!query && !page.textContent.toLowerCase().includes(query);
    if (!page.hidden) matches++;
  }
  for (const group of endpointNav.querySelectorAll('.endpoint-group')) {
    const titleMatches = group.querySelector('summary').textContent.toLowerCase().includes(query);
    let childMatches = 0;
    for (const link of group.querySelectorAll('.endpoint-link')) {
      link.hidden = !!query && !titleMatches && !link.textContent.toLowerCase().includes(query);
      if (!link.hidden) childMatches++;
    }
    group.hidden = !!query && !titleMatches && !childMatches;
    if (query && childMatches && !titleMatches) group.open = true;
    if (!group.hidden) matches++;
  }
  document.getElementById('documentation-group').hidden =
    ![...document.querySelectorAll('.sidebar-page')].some(page => !page.hidden);
  document.getElementById('endpoints-group').hidden =
    ![...endpointNav.querySelectorAll('.endpoint-group')].some(group => !group.hidden);
  document.getElementById('filter-empty').hidden = matches > 0;
}
filter.addEventListener('input', updateFilter);

function focusSearch() {
  if (matchMedia('(max-width: 620px)').matches) {
    body.classList.add('nav-open');
    menu.setAttribute('aria-expanded', 'true');
  }
  filter.focus();
}
document.getElementById('search-trigger').addEventListener('click', focusSearch);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    focusSearch();
  } else if ((event.ctrlKey || event.metaKey) && event.key === '/') {
    event.preventDefault();
    focusSearch();
  } else if (event.key === 'Escape') {
    closeMenu();
    if (document.activeElement === filter) { filter.value = ''; updateFilter(); filter.blur(); }
    document.getElementById('copy-menu').hidden = true;
    document.getElementById('copy-more').setAttribute('aria-expanded', 'false');
  }
});

function pageMarkdown() {
  const title = document.querySelector('.article-header h1').textContent.trim();
  const intro = document.querySelector('.article-header p').textContent.trim();
  const lines = [`# ${title}`, '', intro, ''];
  for (const element of document.querySelector('.article-body').children) {
    if (/^H[1-3]$/.test(element.tagName)) lines.push(`${'#'.repeat(Number(element.tagName[1]))} ${element.textContent.trim()}`, '');
    else if (element.tagName === 'P') lines.push(element.textContent.trim(), '');
    else if (element.tagName === 'UL') { for (const item of element.children) lines.push(`- ${item.textContent.trim()}`); lines.push(''); }
    else if (element.tagName === 'PRE') lines.push('```', element.textContent.trim(), '```', '');
  }
  return lines.join('\n').trim();
}
async function copy(text, button, original) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch { button.textContent = 'Copy unavailable'; }
  window.setTimeout(() => { button.textContent = original; }, 2000);
}
const copyPage = document.getElementById('copy-page');
copyPage.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pageMarkdown());
    copyPage.lastChild.textContent = 'Copied';
  } catch { copyPage.lastChild.textContent = 'Copy unavailable'; }
  window.setTimeout(() => { copyPage.lastChild.textContent = 'Copy Page'; }, 2000);
});
const copyMore = document.getElementById('copy-more');
const copyMenu = document.getElementById('copy-menu');
copyMore.addEventListener('click', () => {
  copyMenu.hidden = !copyMenu.hidden;
  copyMore.setAttribute('aria-expanded', String(!copyMenu.hidden));
});
document.getElementById('copy-link').addEventListener('click', () => {
  copy(location.href, document.getElementById('copy-link'), 'Copy link');
  copyMenu.hidden = true;
  copyMore.setAttribute('aria-expanded', 'false');
});
document.getElementById('copy-markdown').addEventListener('click', () => {
  copy(pageMarkdown(), document.getElementById('copy-markdown'), 'Copy as Markdown');
  copyMenu.hidden = true;
  copyMore.setAttribute('aria-expanded', 'false');
});
document.addEventListener('click', event => {
  if (!event.target.closest('.copy-controls')) { copyMenu.hidden = true; copyMore.setAttribute('aria-expanded', 'false'); }
});

function setActive(id) { for (const link of tocLinks) link.classList.toggle('active', link.hash === `#${id}`); }
setActive(location.hash.slice(1) || 'welcome');
window.addEventListener('hashchange', () => setActive(location.hash.slice(1) || 'welcome'));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0] && !location.hash) setActive(visible[0].target.id);
  }, { rootMargin: '-130px 0px -60% 0px' });
  document.querySelectorAll('.article-body h1[id],.article-body h2[id],.article-body h3[id]')
    .forEach(heading => observer.observe(heading));
}
document.querySelectorAll('[data-feedback]').forEach(button => button.addEventListener('click', () => {
  document.getElementById('feedback-message').hidden = false;
  document.querySelectorAll('[data-feedback]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
import { accountStorage as localStorage, accountReady } from './account-sync.js';
await accountReady;
