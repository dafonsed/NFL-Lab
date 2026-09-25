const input = document.querySelector('#market-search');
if (input) {
  const entries = [...document.querySelectorAll('[data-market-guide]')];
  const empty = document.querySelector('.market-no-results');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    for (const entry of entries) {
      const show = entry.dataset.marketGuide.includes(query);
      entry.hidden = !show;
      visible += Number(show);
    }
    if (empty) empty.hidden = visible !== 0;
  });
}
