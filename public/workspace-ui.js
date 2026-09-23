import { icon } from './ui-icons.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const settingsKey = 'sports-lab-display';
let settings = read(settingsKey, {});
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
function applyDisplay() {
  document.documentElement.dataset.density = settings.density === 'compact' ? 'compact' : 'comfortable';
  document.documentElement.dataset.motion = settings.motion === 'reduce' ? 'reduce' : 'system';
}
applyDisplay();
document.querySelectorAll('.site-live-dot').forEach(dot => dot.remove());
document.querySelectorAll('.site-nav-link,.site-tracker,.workspace-home-link').forEach(link => link.title = link.getAttribute('aria-label') || link.textContent.trim());
window.addEventListener('storage', event => {
  if (event.key !== settingsKey) return;
  const next = read(settingsKey, {});
  settings = next && typeof next === 'object' && !Array.isArray(next) ? next : {};
  applyDisplay();
});

let openSheet = null;
function sheet(title, eyebrow, content, footer = '') {
  const trigger = openSheet?.contains(document.activeElement) ? openSheet.returnFocus : document.activeElement;
  openSheet?.close();
  const dialog = document.createElement('dialog'); dialog.returnFocus = trigger;
  dialog.className = 'workspace-sheet';
  dialog.setAttribute('aria-labelledby', 'workspace-sheet-title');
  dialog.innerHTML = `<div class="sheet-header"><div><span class="sheet-eyebrow">${esc(eyebrow)}</span><h2 id="workspace-sheet-title">${esc(title)}</h2></div><button class="sheet-close" data-sheet-close aria-label="Close ${esc(title.toLowerCase())}">${icon('close')}</button></div><div class="sheet-body">${content}</div>${footer ? `<div class="sheet-footer">${footer}</div>` : ''}`;
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-sheet-close]')) dialog.close();
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => { dialog.remove(); if (openSheet === dialog) openSheet = null; if (!openSheet && trigger?.isConnected) trigger.focus({ preventScroll: true }); }, { once: true });
  openSheet = dialog;
  dialog.showModal();
  return dialog;
}

function displaySettings() {
  const dialog = sheet('Appearance', 'Display settings', `
    <div class="display-preview"><span class="appearance-label">${icon('palette')} NIGHT THEME</span><strong>Display preferences</strong><p>Black surfaces. Blue and cyan accents.</p><div class="appearance-swatches" aria-label="Theme colors"><span style="--swatch:var(--bg)" title="Black"></span><span style="--swatch:var(--accent-strong)" title="Blue"></span><span style="--swatch:var(--accent)" title="Cyan"></span><span style="--swatch:var(--text)" title="White"></span></div></div>
    <div class="sheet-field"><span>Card spacing</span><div class="display-segments" role="group" aria-label="Card spacing"><button data-density="comfortable" aria-pressed="${settings.density !== 'compact'}">Comfortable</button><button data-density="compact" aria-pressed="${settings.density === 'compact'}">Compact</button></div></div>
    <label class="sheet-switch"><span>Reduce animations</span><input type="checkbox" data-reduce-motion ${settings.motion === 'reduce' ? 'checked' : ''}></label>
    <div><div class="sheet-section-title"><span>Developer mode</span><button class="site-dev-toggle" data-dev-toggle aria-pressed="${document.documentElement.dataset.devMode === 'true'}">${icon('code')}<span>Dev mode</span><b>${document.documentElement.dataset.devMode === 'true' ? 'On' : 'Off'}</b></button></div><p>Show model inputs, formulas, and source data in player research.</p></div>
    <p>Your display preferences are saved in this browser.</p><div class="sheet-message" role="status"></div>`, '<button class="button primary" data-sheet-close>Done</button>');
  const save = () => { applyDisplay(); const ok = write(settingsKey, settings); dialog.querySelector('.sheet-message').textContent = ok ? 'Preference saved.' : 'Applied for this session. Browser storage is unavailable.'; };
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-density]'); if (!button) return;
    settings.density = button.dataset.density;
    dialog.querySelectorAll('[data-density]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    save();
  });
  dialog.querySelector('[data-reduce-motion]').addEventListener('change', event => { settings.motion = event.target.checked ? 'reduce' : 'system'; save(); });
}

function navigationMenu() {
  const links = [...document.querySelectorAll('.site-navigation a,.site-personal a,.workspace-home-link')].map(link => link.outerHTML).join('');
  sheet('Your workspace', 'Sports Lab', `<nav class="sheet-nav" aria-label="All destinations">${links}</nav>`, `<button class="button subtle" data-display-settings>${icon('settings')} Display settings</button>`);
}

const guide = $('.research-guide');
if (guide) {
  const anchor = $('#content') || $('#players') || $('#sim-results') || $('#td-workbench') || $('#bet-list') || $('#historical') || $('#report');
  if (anchor) anchor.after(guide); else $('.page-heading')?.after(guide);
}

// Existing evidence/compare dialogs change content in place; keep their name
// tied to the visible heading without exposing technical content by default.
for (const dialog of document.querySelectorAll('dialog:not([aria-labelledby]):not([aria-label])')) {
  const name = () => dialog.setAttribute('aria-label', dialog.querySelector('h2,h3')?.textContent.trim() || 'Research details');
  new MutationObserver(name).observe(dialog, { childList: true, subtree: true });
  name();
}
for (const dialog of document.querySelectorAll('dialog')) {
  const close = dialog.querySelector(':scope > .dialog-close');
  if (close) {
    const header = document.createElement('div'); header.className = 'research-dialog-bar';
    const label = document.createElement('span'); label.textContent = 'SPORTS LAB / RESEARCH';
    header.append(label, close); dialog.prepend(header);
    if (dialog.id === 'bet-dialog') label.textContent = 'SPORTS LAB / TICKET EDITOR';
  }
}

// Give every empty table a readable, correctly spanned row. Zero values remain
// data; only a genuinely empty tbody gets an unavailable state.
function explainEmptyTables(root) {
  const tables = root.matches?.('table') ? [root] : [...root.querySelectorAll?.('table') || []];
  for (const table of tables) {
    const body = table.tBodies[0];
    if (!body || body.rows.length) continue;
    const cell = body.insertRow().insertCell();
    cell.colSpan = Math.max(1, table.tHead?.rows[0]?.cells.length || 1);
    cell.className = 'table-empty-state';
    cell.textContent = 'No records available for this selection. Try another date or filter; missing results are not counted as zero.';
  }
}
explainEmptyTables(document);
new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) explainEmptyTables(node); }).observe(document.querySelector('main'), { childList: true, subtree: true });

// Preserve compatible date/market selections when switching research views.
document.addEventListener('click', event => {
  const link = event.target.closest('.site-navigation a,.mobile-navigation a,.workspace-switch a,.sheet-nav a');
  if (!link) return;
  const destination = new URL(link.href), current = new URL(location.href);
  if (destination.origin !== current.origin || destination.pathname !== current.pathname) return;
  for (const key of ['date','season','week','market','game','league']) {
    if (current.searchParams.has(key) && !destination.searchParams.has(key)) destination.searchParams.set(key, current.searchParams.get(key));
  }
  link.href = destination.href;
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-display-settings]')) displaySettings();
  if (event.target.closest('[data-navigation-menu]')) navigationMenu();
});

// The sheet edits the existing page controls. The original data and event handlers
// remain authoritative; no second search/filter implementation is introduced.
const filterBar = $('.td-filters') || $('.research-controls');
if (filterBar) {
  const controls = [...filterBar.querySelectorAll('select[id],input[type="checkbox"][id],button[id][aria-pressed]')];
  const labelFor = element => {
    const label = [...document.querySelectorAll('label')].find(item => item.htmlFor === element.id);
    return (element.getAttribute('aria-label') || label?.textContent || element.closest('label')?.textContent || element.textContent || element.id).replace(/^[☆↗\s]+/, '').trim();
  };
  const describe = control => ({ id: control.id, label: labelFor(control), kind: control.tagName === 'SELECT' ? 'select' : control.tagName === 'BUTTON' ? 'button' : 'checkbox' });
  const fields = controls.map(describe);
  const values = () => Object.fromEntries(fields.map(field => {
    const control = document.getElementById(field.id);
    return [field.id, field.kind === 'select' ? control.value : field.kind === 'button' ? control.getAttribute('aria-pressed') === 'true' : control.checked];
  }));
  const defaults = Object.fromEntries(fields.map(field => {
    const control = document.getElementById(field.id);
    return [field.id, field.kind === 'select' ? control.options[0]?.value ?? '' : false];
  }));
  // Record a selected default when it is declared explicitly, e.g. a sport's sort.
  fields.filter(field => field.kind === 'select').forEach(field => {
    const control = document.getElementById(field.id), chosen = [...control.options].find(option => option.defaultSelected);
    if (chosen) defaults[field.id] = chosen.value;
  });
  function applyFilters(draft) {
    for (const field of fields) {
      const control = document.getElementById(field.id), value = draft[field.id];
      if (!control || value === undefined) continue;
      if (field.kind === 'select') {
        if (![...control.options].some(option => option.value === value) || control.value === value) continue;
        control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (field.kind === 'button') {
        if ((control.getAttribute('aria-pressed') === 'true') !== Boolean(value)) control.click();
      } else if (control.checked !== Boolean(value)) {
        control.checked = Boolean(value); control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    updateSummary();
  }
  const trigger = document.createElement('button');
  trigger.className = 'button subtle filter-open'; trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.innerHTML = `${icon('filter')}<span>Filters</span><b class="filter-count" hidden>0</b>`;
  filterBar.append(trigger); filterBar.classList.add('filters-enhanced');
  controls.forEach(control => {
    // Hide the whole labeled control on mobile; keep a search or over/under group.
    (control.closest('label:not(.sr-only)') || control).classList.add('filter-desktop-control');
  });
  const summary = document.createElement('div'); summary.className = 'filter-active-summary'; summary.hidden = true;
  summary.setAttribute('aria-live', 'polite'); filterBar.after(summary);
  function updateSummary() {
    const current = values(), active = fields.filter(field => current[field.id] !== defaults[field.id]);
    const count = trigger.querySelector('.filter-count'); count.textContent = active.length; count.hidden = !active.length;
    summary.hidden = !active.length;
    summary.innerHTML = active.map(field => `<span>${esc(field.kind === 'select' ? document.getElementById(field.id).selectedOptions[0]?.textContent : field.label)}</span>`).join('') + (active.length ? '<button type="button" data-clear-ui-filters>Clear filters</button>' : '');
  }
  summary.addEventListener('click', event => { if (event.target.closest('[data-clear-ui-filters]')) applyFilters(defaults); });
  filterBar.addEventListener('change', () => queueMicrotask(updateSummary));
  filterBar.addEventListener('click', () => queueMicrotask(updateSummary));
  // A board can update its controls when data arrives or URL state changes.
  const observer = new MutationObserver(updateSummary);
  controls.forEach(control => observer.observe(control, { attributes: true, attributeFilter: ['aria-pressed'], childList: control.tagName === 'SELECT' }));
  const section = $('.site-header')?.dataset.siteSection || 'research';
  const sport = $('.site-header')?.dataset.siteSport || 'all';
  const presetKey = `sports-lab-filter-presets:${sport}:${section}`;
  function openFilters() {
    const initial = values();
    const fieldsHTML = fields.filter(field => !document.getElementById(field.id).closest('[hidden]')).map(field => {
      const control = document.getElementById(field.id);
      return field.kind === 'select' ? `<label class="sheet-field">${esc(field.label)}<select data-filter-field="${esc(field.id)}">${[...control.options].map(option => `<option value="${esc(option.value)}"${option.value === initial[field.id] ? ' selected' : ''}>${esc(option.textContent)}</option>`).join('')}</select></label>` : `<label class="sheet-switch"><span>${esc(field.label)}</span><input type="checkbox" data-filter-field="${esc(field.id)}"${initial[field.id] ? ' checked' : ''}></label>`;
    }).join('');
    const dialog = sheet('Filters', `${sport === 'all' ? 'All sports' : sport.toUpperCase()} / ${section === 'bets' ? 'My picks' : section}`, `<div class="sheet-section-title"><span>Current filters</span><button type="button" data-reset-draft>Reset all</button></div>${fieldsHTML}<div class="sheet-section-title"><span>Saved presets</span></div><div class="sheet-presets"></div><form class="sheet-preset-form"><label class="sr-only" for="preset-name">Preset name</label><input id="preset-name" name="name" maxlength="40" placeholder="Name this preset" required autocomplete="off"><button type="submit" class="button subtle">Save</button></form><p>Presets save these filters for ${esc(sport.toUpperCase())}. Dates, markets, and your search stay as they are.</p><div class="sheet-message" role="status"></div>`, '<button class="button subtle" data-sheet-close>Cancel</button><button class="button primary" data-apply-filters>Apply filters</button>');
    const draft = () => Object.fromEntries([...dialog.querySelectorAll('[data-filter-field]')].map(control => [control.dataset.filterField, control.tagName === 'SELECT' ? control.value : control.checked]));
    function setDraft(next) {
      for (const control of dialog.querySelectorAll('[data-filter-field]')) {
        const value = next[control.dataset.filterField];
        if (control.tagName === 'SELECT') { if ([...control.options].some(option => option.value === value)) control.value = value; }
        else control.checked = value === true;
      }
    }
    let presets = read(presetKey, []);
    if (!Array.isArray(presets)) presets = [];
    presets = presets.filter(preset => preset && typeof preset.name === 'string' && preset.values && typeof preset.values === 'object').slice(0, 8);
    const message = text => { dialog.querySelector('.sheet-message').textContent = text; };
    function renderPresets() { dialog.querySelector('.sheet-presets').innerHTML = presets.length ? presets.map((preset, index) => `<div class="sheet-preset"><button type="button" data-load-preset="${index}">${esc(preset.name)}</button><button type="button" data-delete-preset="${index}" aria-label="Delete preset ${esc(preset.name)}">${icon('close')}</button></div>`).join('') : '<p>No presets yet. Save a combination you use often.</p>'; }
    renderPresets();
    dialog.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-apply-filters')) { applyFilters(draft()); dialog.close(); }
      if (button.hasAttribute('data-reset-draft')) { setDraft(defaults); message('Filters reset. Apply to update the board.'); }
      if (button.dataset.loadPreset !== undefined) { setDraft(presets[Number(button.dataset.loadPreset)].values); message('Preset selected. Apply to update the board.'); }
      if (button.dataset.deletePreset !== undefined) { presets.splice(Number(button.dataset.deletePreset), 1); const ok = write(presetKey, presets); renderPresets(); message(ok ? 'Preset deleted.' : 'Removed for this session. Browser storage is unavailable.'); }
    });
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); const input = dialog.querySelector('#preset-name'), name = input.value.trim(); if (!name) return;
      const existing = presets.findIndex(preset => preset.name.toLowerCase() === name.toLowerCase());
      if (existing < 0 && presets.length >= 8) { message('You have 8 presets. Delete one to make room.'); return; }
      const preset = { name, values: draft() }; if (existing >= 0) presets[existing] = preset; else presets.push(preset);
      const ok = write(presetKey, presets); renderPresets(); input.value = ''; message(ok ? 'Preset saved.' : 'Saved for this session. Browser storage is unavailable.');
    });
  }
  trigger.addEventListener('click', openFilters);
  updateSummary();
}

// Replace inconsistent text glyphs with the same small icon set. Labels stay
// visible (and accessible), including when the mobile Refresh button is compact.
for (const [selector, name] of [
  ['#refresh-button,#refresh,#trend-refresh,#reload,#refresh-lines', 'refresh'],
  ['#export-button,#export,#export-bets', 'download'], ['#add-bet,#add-leg', 'plus']
]) for (const button of document.querySelectorAll(selector)) {
  const label = button.textContent.replace(/^[↻↓＋+\s]+/, '').trim();
  button.innerHTML = `${icon(name)}<span>${esc(label)}</span>`;
  if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
  if (!button.title) button.title = button.getAttribute('aria-label');
}
for (const search of document.querySelectorAll('.searchbox,.td-search')) {
  const prefix = search.querySelector('span[aria-hidden=true]');
  if (prefix) prefix.outerHTML = icon('search');
}
for (const choice of document.querySelectorAll('.choice-symbol')) choice.innerHTML = icon(choice.closest('.trends-choice') ? 'trends' : 'research');
for (const node of document.querySelectorAll('[data-ui-icon]')) node.outerHTML = icon(node.dataset.uiIcon);

// Label the destination on each research page; no status is inferred from styling.
const pageHeader = $('.site-header'), headingLabel = $('.page-heading .eyebrow');
if (pageHeader) document.body.dataset.section = pageHeader.dataset.siteSection;
if (headingLabel && pageHeader) {
  const sport = pageHeader.dataset.siteSport, section = pageHeader.dataset.siteSection;
  const labels = { research: 'PLAYER RESEARCH', trends: 'PLAYER TRENDS', live: 'LIVE GAME CENTER', bets: 'MY PICKS', performance: 'MODEL PERFORMANCE', paper: 'PAPER RETURNS', simulation: 'GAME SIMULATION' };
  if (!headingLabel.querySelector('[id]')) headingLabel.innerHTML = `${icon(section === 'bets' ? 'picks' : section)}<span>${esc(sport ? sport.toUpperCase() + ' / ' : '')}${esc(labels[section] || 'SPORTS LAB')}</span>`;
}

// Put the player data ahead of repeated board-level explanations. Native details
// keep every source note and overview available without another modal.
function foldPanel(node, title, className) {
  if (!node || node.closest('.workspace-fold')) return;
  const details = document.createElement('details'); details.className = 'workspace-fold ' + className;
  const summary = document.createElement('summary'); summary.innerHTML = `<span>${esc(title)}</span>${icon('chevron')}`;
  node.before(details); details.append(summary, node);
  const sync = () => { details.hidden = node.hidden || !node.textContent.trim(); };
  new MutationObserver(sync).observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); sync();
}
if (!document.body.classList.contains('bets-app')) foldPanel($('#summary'), 'Board overview', 'overview-fold');
foldPanel($('#prop-status') || $('#line-source'), 'Sportsbook lines & sources', 'sources-fold');
foldPanel($('#game-context'), 'Matchup & availability', 'context-fold');
if ($('.context-fold') && $('.page-tools-actions')) $('.page-tools-actions').after($('.context-fold'));
const researchActions = $('.page-tools-actions');
if (researchActions && $('.context-fold')) {
  const tools = document.createElement('details'); tools.className = 'research-tools';
  tools.innerHTML = `<summary>Research notes & tools ${icon('chevron')}</summary>`;
  researchActions.before(tools); tools.append(researchActions, $('.context-fold'));
  const desktop = matchMedia('(min-width:701px)');
  tools.open = false;
  desktop.addEventListener('change', () => { tools.open = false; });
}
const boardNotes = [...document.querySelectorAll('main > .workspace-fold')];
if (boardNotes.length > 1) {
  const strip = document.createElement('div'); strip.className = 'workspace-context-strip';
  boardNotes[0].before(strip); strip.append(...boardNotes);
}
const notices = $('#notice');
if (notices) {
  const foldNotes = () => {
    for (const note of notices.querySelectorAll(':scope > .notice.info')) {
      foldPanel(note, 'About this data', 'information-fold');
      // Keep related NFL context in one row; warnings and freshness stay visible.
      const strip = $('.workspace-context-strip');
      const options = $('.research-options');
      if(options) options.append(note.parentElement);
      else if (strip && $('#week-select')) strip.append(note.parentElement);
    }
  };
  new MutationObserver(foldNotes).observe(notices, { childList: true }); foldNotes();
}

// Keep source freshness before the player board, close to schedule controls.
if (document.body.classList.contains('trends-workspace')) {
  const toolbar = $('.td-toolbar'), heading = $('.page-heading'), status = $('#td-status');
  if (toolbar && heading) { heading.classList.add('trends-heading'); heading.insertBefore(toolbar, $('#trend-refresh')); }
  if (status) { status.classList.add('board-freshness'); heading?.after(status); }
}

// A slow or unavailable remote headshot still gets a useful, deterministic avatar.
// Keep the real image above the initials and reveal it when the request succeeds.
function prepareAvatars(root) {
  const images = root.matches?.('img') ? [root] : [...root.querySelectorAll?.('.research-player img,.avatar,.mlb-avatar,.sports-card header img,.td-player-name img,.td-player-identity img,.pr-identity > img,.trend-card header img') || []];
  for (const img of images) {
    if (!(img instanceof HTMLImageElement) || img.dataset.avatarReady || img.closest('.ui-avatar')) continue;
    const group = img.closest('.research-player,.player-main,.mlb-card-top,.sports-card header,.td-player-name,.td-player-identity,.pr-identity,.trend-card header');
    const name = group?.querySelector('.player-name,h2,h3,strong')?.textContent?.trim(); if (!name) continue;
    img.dataset.avatarReady = 'true';
    const holder = document.createElement('span'); holder.className = 'ui-avatar'; holder.setAttribute('aria-hidden','true');
    const size = parseFloat(getComputedStyle(img).width) || 48; holder.style.setProperty('--avatar-size', Math.min(80, Math.max(28, size)) + 'px');
    const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('');
    const fallback = document.createElement('span'); fallback.textContent = initials; holder.append(fallback);
    img.before(holder); holder.append(img); img.classList.add('ui-avatar-image');
    const ready = () => { holder.classList.toggle('image-ready', img.naturalWidth > 0); };
    img.addEventListener('load', ready); img.addEventListener('error', ready); if (img.complete) ready();
  }
}
prepareAvatars(document);
new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && !node.closest('.ui-avatar')) prepareAvatars(node); }).observe(document.body, { childList: true, subtree: true });
