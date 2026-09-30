// Learn library: type tabs, search and numbered pages over the server-rendered cards.
const PAGE = 12;
const grid = document.querySelector('#learn-grid');
const cards = [...grid.querySelectorAll('.learn-card')];
const search = document.querySelector('#learn-search');
const archived = document.querySelector('#learn-archived');
const pager = document.querySelector('#learn-pager');
const count = document.querySelector('#learn-count');
const empty = document.querySelector('#learn-empty');
const params = new URLSearchParams(location.search);
let type = params.get('type') || '';
let page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);

const ARROW = dir => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === 'prev' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;

// Page numbers to show: first, last, and a window around the current page, with gaps.
function pageList(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(n => pages.add(n));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(n => pages.add(n));
  const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, index) => { if (index && n - sorted[index - 1] > 1) out.push('gap'); out.push(n); });
  return out;
}

function renderPager(total) {
  pager.hidden = total <= 1;
  if (total <= 1) { pager.innerHTML = ''; return; }
  const button = (target, label, attrs = '') => `<button type="button" data-page="${target}" ${attrs}>${label}</button>`;
  pager.innerHTML = [
    button(page - 1, `${ARROW('prev')}<span>Previous</span>`, `class="learn-pager-step"${page === 1 ? ' disabled' : ''} aria-label="Previous page"`),
    `<span class="learn-pager-pages">${pageList(page, total).map(n => n === 'gap' ? '<span class="learn-pager-gap" aria-hidden="true">…</span>' : button(n, n, `aria-label="Page ${n}"${n === page ? ' aria-current="page"' : ''}`)).join('')}</span>`,
    button(page + 1, `<span>Next</span>${ARROW('next')}`, `class="learn-pager-step"${page === total ? ' disabled' : ''} aria-label="Next page"`),
  ].join('');
}

function apply() {
  const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = cards.filter(card => (!type || card.dataset.type === type)
    && (archived.checked || !card.hasAttribute('data-archived'))
    && words.every(word => card.dataset.text.includes(word)));
  const total = Math.max(1, Math.ceil(matches.length / PAGE));
  page = Math.min(page, total);
  const shown = new Set(matches.slice((page - 1) * PAGE, page * PAGE));
  for (const card of cards) card.hidden = !shown.has(card);
  const first = matches.length ? (page - 1) * PAGE + 1 : 0;
  count.textContent = matches.length > PAGE ? `${first}–${first + shown.size - 1} of ${matches.length} results` : `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`;
  empty.hidden = matches.length > 0;
  renderPager(total);
  document.querySelectorAll('[data-learn-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.learnType === type)));
}
function remember() {
  const url = new URL(location.href);
  type ? url.searchParams.set('type', type) : url.searchParams.delete('type');
  search.value ? url.searchParams.set('q', search.value) : url.searchParams.delete('q');
  page > 1 ? url.searchParams.set('page', page) : url.searchParams.delete('page');
  history.replaceState(history.state, '', url);
}
const reset = () => { page = 1; apply(); remember(); };
document.querySelector('.learn-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-learn-type]');
  if (!button) return;
  type = button.dataset.learnType; reset();
});
search.addEventListener('input', reset);
archived.addEventListener('change', reset);
pager.addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  page = Number(button.dataset.page); apply(); remember();
  const top = document.querySelector('#learn-controls').getBoundingClientRect().top + scrollY - 90;
  scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); search.focus(); }
});
if (params.get('q')) search.value = params.get('q');
apply();
