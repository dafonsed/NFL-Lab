const search = document.querySelector('[data-guide-search]');
const cards = [...document.querySelectorAll('[data-guide-item]')];
const sections = [...document.querySelectorAll('[data-guide-section]')];
const count = document.querySelector('[data-guide-count]');
const empty = document.querySelector('[data-library-empty]');

if (search) {
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      card.hidden = Boolean(query) && !card.dataset.search.includes(query);
      visible += Number(!card.hidden);
    }
    for (const section of sections) {
      section.hidden = !section.querySelector('[data-guide-item]:not([hidden])');
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible > 0;
  };

  search.addEventListener('input', update);
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
