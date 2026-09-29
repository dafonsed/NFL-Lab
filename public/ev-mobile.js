// Phone controls use the existing filter inputs so a close never discards an edit.
export function installMobileWorkspace() {
  if (!document.querySelector('link[href^="/ev-mobile.css"]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/ev-mobile.css?v=1';
    document.head.append(style);
  }
  // Announce the compact count; rereading an entire live list floods speech.
  document.querySelector('#ev-view')?.removeAttribute('aria-live');
  const grid = document.querySelector('.ev-control-grid');
  if (!grid) return;
  const home = document.createComment('market filters');
  grid.before(home);
  const bar = document.createElement('div');
  bar.className = 'ev-mobile-controls';
  bar.innerHTML = '<button type="button" data-mobile-filters aria-haspopup="dialog">Filters & stake <span data-mobile-filter-count></span></button><span data-mobile-result-count role="status" aria-live="polite" aria-atomic="true"></span>';
  home.before(bar);
  const dialog = document.createElement('dialog');
  dialog.className = 'ev-mobile-filter-dialog';
  dialog.setAttribute('aria-labelledby', 'ev-mobile-filter-title');
  dialog.innerHTML = '<header><h2 id="ev-mobile-filter-title">Filters & stake</h2><button type="button" data-mobile-close aria-label="Close filters">×</button></header><div data-mobile-filter-body></div><footer><p>Changes apply as you choose. Closing keeps your filters.</p><button type="button" data-mobile-done>Show results</button></footer>';
  document.body.append(dialog);
  const trigger = bar.querySelector('button');
  let scrollY = 0;
  let historyEntry = false;
  const restore = () => {
    home.after(grid);
    document.body.classList.remove('ev-mobile-filter-open');
    window.scrollTo({top: scrollY, behavior: 'instant'});
    trigger.focus({preventScroll:true});
  };
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    if (historyEntry && history.state?.evFilterSheet) { historyEntry = false; history.back(); }
  };
  trigger.addEventListener('click', () => {
    scrollY = window.scrollY;
    dialog.querySelector('[data-mobile-filter-body]').append(grid);
    document.body.classList.add('ev-mobile-filter-open');
    dialog.showModal();
    history.pushState({...history.state, evFilterSheet:true}, '', location.href);
    historyEntry = true;
  });
  dialog.addEventListener('click', event => { if (event.target.closest('[data-mobile-close],[data-mobile-done]')) close(); });
  // Popovers can retarget their final click to the dialog after the option is
  // removed. Only a pointer actually outside the sheet means backdrop dismissal.
  dialog.addEventListener('pointerdown', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', restore);
  window.addEventListener('popstate', () => { if (dialog.open && !history.state?.evFilterSheet) { historyEntry = false; dialog.close(); } });
  const media = matchMedia('(max-width: 800px)');
  media.addEventListener('change', () => { if (!media.matches) close(); });
  function update() {
    bar.hidden = grid.hidden || ['odds','fantasy','sharp'].includes(document.body.dataset.evScreen);
    const inputs = [...grid.querySelectorAll('select,input')].filter(input => {
      if (input.disabled) return false;
      for (let node = input.closest('label'); node && node !== grid; node = node.parentElement) if (node.hidden || getComputedStyle(node).display === 'none') return false;
      return true;
    });
    const filtered = inputs.filter(input => input.id !== 'ev-sort-mode' && input.type !== 'number' && input.value && !['all','week','200','ev','recommended'].includes(input.value)).length;
    bar.querySelector('[data-mobile-filter-count]').textContent = filtered ? `· ${filtered} active` : '';
    const result = document.querySelector('.wager-results-bar>span,.evb-summary>p,.ev-results-context>div,.ev-arb-demo-note strong span');
    bar.querySelector('[data-mobile-result-count]').textContent = result?.textContent?.split(' from ')[0] || '';
    dialog.querySelector('[data-mobile-done]').textContent = result ? `Show ${result.textContent.split(' from ')[0]}` : 'Show results';
    // Horizontal comparisons remain keyboard reachable and explain the gesture.
    document.querySelectorAll('.ev-table-wrap,.bet-inline-scroll,.bet-comparison-scroll').forEach(scroller => {
      if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
      scroller.tabIndex = 0;
      scroller.setAttribute('role', 'region');
      if (!scroller.hasAttribute('aria-label')) scroller.setAttribute('aria-label', 'Price comparison. Scroll horizontally to compare books.');
    });
  }
  document.addEventListener('ev-tool-change', () => requestAnimationFrame(update));
  update();
  return {close, update};
}

// Keep the reading order of existing live records. New opportunities appear last;
// an explicit user sort/filter render can establish a new order.
export function preserveReadingOrder(records, previousIds, idOf) {
  const rank = new Map(previousIds.map((id,index) => [id,index]));
  return records.sort((a,b) => (rank.get(idOf(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(idOf(b)) ?? Number.MAX_SAFE_INTEGER));
}

export function quoteRevision(quotes, now = Date.now()) {
  return quotes.map(q => [q.id,q.odds,q.line,q.liquidity,q.limit,q.suspended,
    q.live ? Number.isFinite(Date.parse(q.ts)) && now - Date.parse(q.ts) <= 90_000 && Date.parse(q.ts) <= now + 5_000 : true].join('|')).join('\n');
}

// Keep the full comparison template on desktop, with optional details on phones.
export function bindMobileReferenceCard(root) {
  const card = root.querySelector('.ev-reference-card');
  if (!card || card.querySelector('[data-mobile-comparison]')) return;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ev-mobile-comparison-toggle';
  toggle.dataset.mobileComparison = '';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'Compare prices & details';
  card.dataset.mobileDetails = 'collapsed';
  card.querySelector('.bet-inline-toolbar')?.before(toggle);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Collapse price comparison' : 'Compare prices & details';
    card.dataset.mobileDetails = expanded ? 'expanded' : 'collapsed';
    if (!expanded) toggle.focus({preventScroll:true});
  });
}
