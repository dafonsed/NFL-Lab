const PAGE_SIZE = 6;
const search = document.querySelector('[data-education-search]');
const cards = [...document.querySelectorAll('[data-education-card]')];
const filters = [...document.querySelectorAll('[data-education-category]')];
const count = document.querySelector('[data-education-count]');
const countLabel = document.querySelector('[data-education-count-label]');
const emptyState = document.querySelector('[data-education-empty]');
const clearButton = document.querySelector('[data-education-clear]');
const indexability = document.querySelector('[data-education-indexability]');
const pagination = document.querySelector('[data-education-pagination]');
let activeCategory = 'all';
let activeIndexability = 'all';
let currentPage = 1;

function renderPagination(totalPages) {
  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const last = Math.min(totalPages, first + 4);
  const pages = [];
  if (first > 1) pages.push(1, 'ellipsis');
  for (let number = first; number <= last; number += 1) pages.push(number);
  if (last < totalPages) pages.push('ellipsis', totalPages);
  const pageLink = number => `<a href="${number === 1 ? '/betting-education' : `/betting-education/page-${number}`}" data-education-page="${number}"${number === currentPage ? ' aria-current="page" aria-label="Page ' + number + ', current page"' : ' aria-label="Page ' + number + '"'}>${number}</a>`;
  const previous = currentPage > 1
    ? `<a class="learn-page-step" href="/betting-education/page-${currentPage - 1}" data-education-page="${currentPage - 1}" rel="prev" aria-label="Previous page">Previous</a>`
    : '<span class="learn-page-step is-disabled" aria-disabled="true">Previous</span>';
  const next = currentPage < totalPages
    ? `<a class="learn-page-step" href="/betting-education/page-${currentPage + 1}" data-education-page="${currentPage + 1}" rel="next" aria-label="Next page">Next</a>`
    : '<span class="learn-page-step is-disabled" aria-disabled="true">Next</span>';
  const pageItems = pages.map(number => number === 'ellipsis'
    ? '<span class="learn-page-ellipsis" aria-hidden="true">…</span>'
    : pageLink(number)).join('');
  return `${previous}<div class="learn-page-numbers">${pageItems}</div><span class="learn-page-status" aria-live="polite">Page ${currentPage} of ${totalPages}</span>${next}`;
}

function update() {
  const query = search?.value.trim().toLocaleLowerCase() || '';
  const matchingCards = cards.filter(card => {
    const categoryMatches = activeCategory === 'all' || card.dataset.libraryCategory === activeCategory;
    const indexabilityMatches = activeIndexability === 'all' || card.dataset.indexable === activeIndexability;
    const searchMatches = !query || card.dataset.search.includes(query);
    return categoryMatches && indexabilityMatches && searchMatches;
  });
  const totalPages = Math.max(1, Math.ceil(matchingCards.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleCards = new Set(matchingCards.slice(start, start + PAGE_SIZE));

  for (const card of cards) card.hidden = !visibleCards.has(card);
  if (count) count.textContent = String(matchingCards.length);
  if (countLabel) countLabel.textContent = matchingCards.length === 1 ? 'guide' : 'guides';
  if (emptyState) emptyState.hidden = matchingCards.length > 0;
  if (pagination) {
    pagination.innerHTML = renderPagination(totalPages);
    pagination.hidden = totalPages <= 1;
  }
}

if (cards.length) {
  search?.addEventListener('input', () => {
    currentPage = 1;
    update();
  });

  indexability?.addEventListener('change', () => {
    activeIndexability = indexability.value || 'all';
    currentPage = 1;
    update();
  });

  clearButton?.addEventListener('click', () => {
    if (search) search.value = '';
    activeCategory = 'all';
    activeIndexability = 'all';
    currentPage = 1;
    if (indexability) indexability.value = 'all';
    for (const filter of filters) {
      const selected = filter.dataset.educationCategory === 'all';
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', String(selected));
    }
    update();
    search?.focus();
  });

  for (const filter of filters) {
    filter.addEventListener('click', () => {
      activeCategory = filter.dataset.educationCategory || 'all';
      currentPage = 1;
      for (const option of filters) {
        const selected = option === filter;
        option.classList.toggle('is-active', selected);
        option.setAttribute('aria-pressed', String(selected));
      }
      update();
    });
  }

  pagination?.addEventListener('click', event => {
    const link = event.target.closest('a[data-education-page]');
    if (!link) return;
    const nextPage = Number(link.dataset.educationPage);
    if (!Number.isInteger(nextPage) || nextPage < 1) return;
    event.preventDefault();
    currentPage = nextPage;
    update();
    pagination.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
  });

  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey && search) {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'Escape' && document.activeElement === search && search.value) {
      search.value = '';
      currentPage = 1;
      update();
    }
  });

  update();
}
