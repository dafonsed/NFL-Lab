const input = document.querySelector('#market-search');
if (input) {
  const entries = [...document.querySelectorAll('[data-market-guide]')];
  const empty = document.querySelector('.market-no-results');
  const count = document.querySelector('[data-market-count]');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    for (const entry of entries) {
      const show = entry.dataset.marketGuide.includes(query);
      entry.hidden = !show;
      visible += Number(show);
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      input.focus();
    } else if (event.key === 'Escape' && document.activeElement === input && input.value) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}
