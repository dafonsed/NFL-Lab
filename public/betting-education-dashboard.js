const search = document.querySelector('[data-education-search]');
const cards = [...document.querySelectorAll('[data-education-card]')];
const filters = [...document.querySelectorAll('[data-education-category]')];
const count = document.querySelector('[data-education-count]');
const countLabel = document.querySelector('[data-education-count-label]');
const emptyState = document.querySelector('[data-education-empty]');
const clearButton = document.querySelector('[data-education-clear]');
const indexability = document.querySelector('[data-education-indexability]');
let activeCategory = 'all';
let activeIndexability = 'all';

if (search && cards.length) {
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const categoryMatches = activeCategory === 'all' || card.dataset.category === activeCategory;
      const indexabilityMatches = activeIndexability === 'all' || card.dataset.indexable === activeIndexability;
      const searchMatches = !query || card.dataset.search.includes(query);
      card.hidden = !(categoryMatches && indexabilityMatches && searchMatches);
      if (!card.hidden) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (countLabel) countLabel.textContent = visible === 1 ? 'guide' : 'guides';
    if (emptyState) emptyState.hidden = visible > 0;
  };

  search.addEventListener('input', update);
  indexability?.addEventListener('change', () => {
    activeIndexability = indexability.value || 'all';
    update();
  });
  clearButton?.addEventListener('click', () => {
    search.value = '';
    activeCategory = 'all';
    activeIndexability = 'all';
    if (indexability) indexability.value = 'all';
    for (const filter of filters) {
      const selected = filter.dataset.educationCategory === 'all';
      filter.classList.toggle('is-active', selected);
      filter.setAttribute('aria-pressed', String(selected));
    }
    update();
    search.focus();
  });
  for (const filter of filters) {
    filter.addEventListener('click', () => {
      activeCategory = filter.dataset.educationCategory || 'all';
      for (const option of filters) {
        const selected = option === filter;
        option.classList.toggle('is-active', selected);
        option.setAttribute('aria-pressed', String(selected));
      }
      update();
    });
  }

  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      search.focus();
    } else if (event.key === 'Escape' && document.activeElement === search && search.value) {
      search.value = '';
      update();
    }
  });
}
