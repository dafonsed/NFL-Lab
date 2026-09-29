import { accountStorage as localStorage, accountReady } from './account-sync.js';
import { icon } from './ui-icons.js';
import {enhanceTrendControls} from './trends-controls.js';
import {enhanceCalendars,syncCalendars} from './calendar-control.js';
import {leagueMark,prepareIdentityImages} from './sports-identity.js';

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
// The visual shell can initialize while private account preferences load. A
// slow session must not postpone navigation or move the whole page after paint.
void accountReady.then(()=>{settings=read(settingsKey,{});if(!settings||typeof settings!=='object'||Array.isArray(settings))settings={};applyDisplay();});

// One control vocabulary for every workspace, including asynchronously rendered
// dialogs and toolbars. Tags change presentation only; handlers and values stay local.
function styleControls(root) {
  enhanceCalendars(root);
  enhanceTrendControls(root,'select:not([multiple]):not([size])');
  // Tables on every tool use the same row/heading treatment as the Trends board.
  for(const table of [...(root.matches?.('table')?[root]:[]),...root.querySelectorAll?.('table')||[]]) {
    if(!table.closest('.calendar-popover'))table.classList.add('workspace-data-table');
  }
  const buttons=[...(root.matches?.('button')?[root]:[]),...root.querySelectorAll?.('button')||[]];
  for(const button of buttons) {
    if(button.matches('[data-player],.td-split,.profit-day,.game-card,.sports-game,.research-player,.live-directory-card')||button.closest('.mobile-navigation'))continue;
    const kind=button.matches('.danger-button,[data-danger]')?'danger'
      :button.matches('.primary,.td-apply-line,[type=submit]')?'primary'
      :button.matches('.td-choice-option,[role=option]')?'option'
      :button.closest('.market-tabs,.sports-markets,.pr-tabs,.pr-stat-tabs,.pr-markets,.pr-mode-tabs,.sim-result-tabs,.section-tabs,.sports-views')?'tab'
      :button.matches('[role=tab]')||button.closest('.td-windows,.td-side,.side-toggle,.td-context-tabs,.td-stat-method,.pr-segmented,.section-tabs,.sports-views,.display-segments,.picks-tabs,.sim-chart-switch')?'segment'
      :button.matches('.icon-button,.tracker-icon-button,.sheet-close,.dialog-close,.site-settings-toggle,[data-step-player]')||button.closest('.research-actions')?'icon'
      :button.matches('[data-back-board],[data-breakdown],.td-reset-line,[data-line-step]')||button.closest('footer')?'ghost':'secondary';
    button.dataset.uiControl=kind;
  }
}
// Let page setup capture the original labels before selects are wrapped.
queueMicrotask(()=>styleControls(document));
new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)styleControls(node);syncCalendars();}).observe(document.body,{childList:true,subtree:true});
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
    <div class="display-preview"><span class="appearance-label">${icon('palette')} NIGHT THEME</span><strong>Display preferences</strong><p>Ink-black surfaces with a soft volt-lime glow.</p><div class="appearance-swatches" aria-label="Theme colors"><span style="--swatch:var(--sl-bg,#07090b)" title="Ink"></span><span style="--swatch:var(--sl-panel-2,#13181c)" title="Slate"></span><span style="--swatch:var(--sl-lime,#a3f06b)" title="Lime"></span><span style="--swatch:var(--sl-cyan,#43c3ff)" title="Sky"></span></div></div>
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
  const links = [...document.querySelectorAll('.dashboard-group-home,.site-overview-link,.site-navigation a,.site-personal a')].map(link => link.outerHTML).join('');
  sheet('Your workspace', 'VisualOdds', `<nav class="sheet-nav" aria-label="All destinations">${links}</nav>`, `<button class="button subtle" data-display-settings>${icon('settings')} Display settings</button>`);
}

const guide = $('.research-guide');
if (guide) {
  const anchor = $('#content') || $('#players') || $('#sim-results') || $('#td-workbench') || $('#bet-list') || $('#historical') || $('#report');
  if (anchor) anchor.after(guide); else if($('main > footer')) $('main > footer').before(guide);
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
    const label = document.createElement('span'); label.textContent = 'VISUALODDS / RESEARCH';
    header.append(label, close); dialog.prepend(header);
    if (dialog.id === 'bet-dialog') label.textContent = 'VISUALODDS / TICKET EDITOR';
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
  const link = event.target.closest('.site-navigation a,.mobile-navigation a,.workspace-switch a,.sheet-nav a,.site-overview-link,.dashboard-group-home');
  if (!link) return;
  const destination = new URL(link.href), current = new URL(location.href);
  if (destination.origin !== current.origin) return;
  const sport = document.querySelector('.site-header')?.dataset.siteSport;
  const sameBoard = destination.pathname === current.pathname;
  const betweenOverview = sport && [current.pathname,destination.pathname].every(path => [('/'+sport),'/research'].includes(path));
  if (!sameBoard && !betweenOverview) return;
  if (betweenOverview) {
    if(current.pathname==='/research') {
      if(current.searchParams.has('prop')) destination.searchParams.set('market',current.searchParams.get('prop'));
      const [season,week]=(current.searchParams.get('period')||'').split('-');
      if(season&&week){destination.searchParams.set('season',season);destination.searchParams.set('week',week);}
    } else if(destination.pathname==='/research') {
      if(current.searchParams.has('market')) destination.searchParams.set('prop',current.searchParams.get('market'));
      if(current.searchParams.has('season')&&current.searchParams.has('week')) destination.searchParams.set('period',current.searchParams.get('season')+'-'+current.searchParams.get('week'));
    }
  }
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
if (filterBar && !filterBar.matches('.td-filters')) {
  const controls = [...filterBar.querySelectorAll('select[id],input[type="checkbox"][id],button[id][aria-pressed]')];
  const labelFor = element => {
    const label = [...document.querySelectorAll('label')].find(item => item.htmlFor === element.id);
    const copy = (label || element.closest('label'))?.cloneNode(true);
    copy?.querySelectorAll('select,input,button,small,.field-help,.field-hint').forEach(child => child.remove());
    return (element.getAttribute('aria-label') || copy?.textContent || element.textContent || element.id).replace(/^[☆↗\s]+/, '').trim();
  };
  const available = control => control && !control.disabled && !control.closest('[hidden]');
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
      if (!available(control) || value === undefined) continue;
      if (field.kind === 'select') {
        if (![...control.options].some(option => option.value === value && !option.disabled && !option.parentElement.matches('optgroup:disabled')) || control.value === value) continue;
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
    const current = values(), active = fields.filter(field => available(document.getElementById(field.id)) && current[field.id] !== defaults[field.id]);
    const count = trigger.querySelector('.filter-count'); count.textContent = active.length; count.hidden = !active.length;
    summary.hidden = !active.length;
    summary.innerHTML = active.map(field => `<span>${esc(field.kind === 'select' ? document.getElementById(field.id).selectedOptions[0]?.textContent : field.label)}</span>`).join('') + (active.length ? '<button type="button" data-clear-ui-filters>Clear filters</button>' : '');
  }
  summary.addEventListener('click', event => { if (event.target.closest('[data-clear-ui-filters]')) applyFilters(defaults); });
  filterBar.addEventListener('change', () => queueMicrotask(updateSummary));
  filterBar.addEventListener('click', () => queueMicrotask(updateSummary));
  // A board can update its controls when data arrives or URL state changes.
  const observer = new MutationObserver(updateSummary);
  controls.forEach(control => observer.observe(control, { attributes: true, attributeFilter: ['aria-pressed','hidden','disabled'], childList: control.tagName === 'SELECT' }));
  const section = $('.site-header')?.dataset.siteSection || 'research';
  const sport = $('.site-header')?.dataset.siteSport || 'all';
  const presetKey = `sports-lab-filter-presets:${sport}:${section}`;
  function openFilters() {
    const initial = values();
    const fieldsHTML = fields.filter(field => available(document.getElementById(field.id))).map(field => {
      const control = document.getElementById(field.id);
      return field.kind === 'select' ? `<label class="sheet-field">${esc(field.label)}<select data-filter-field="${esc(field.id)}">${[...control.options].map(option => `<option value="${esc(option.value)}"${option.value === initial[field.id] ? ' selected' : ''}${option.disabled || option.parentElement.matches('optgroup:disabled') ? ' disabled' : ''}>${esc(option.textContent)}</option>`).join('')}</select></label>` : `<label class="sheet-switch"><span>${esc(field.label)}</span><input type="checkbox" data-filter-field="${esc(field.id)}"${initial[field.id] ? ' checked' : ''}></label>`;
    }).join('');
    const dialog = sheet('Filters', `${sport === 'all' ? 'All sports' : sport.toUpperCase()} model`, `<nav class="filter-category-nav" role="tablist" aria-label="Filter categories" aria-orientation="vertical"><button type="button" id="board-filter-tab" role="tab" aria-selected="true" aria-controls="board-filter-fields" data-model-filter-tab="board-filter-fields">${icon('filter')}<span>Board filters</span></button><button type="button" id="board-preset-tab" role="tab" aria-selected="false" tabindex="-1" aria-controls="board-filter-presets" data-model-filter-tab="board-filter-presets">${icon('bookmark')}<span>Saved presets</span></button></nav><div class="model-filter-editors"><section id="board-filter-fields" role="tabpanel" aria-labelledby="board-filter-tab"><div class="sheet-section-title"><span>Board filters</span><button type="button" data-reset-draft>Reset all</button></div>${fieldsHTML}</section><section id="board-filter-presets" role="tabpanel" aria-labelledby="board-preset-tab" hidden><div class="sheet-section-title"><span>Saved presets</span></div><div class="sheet-presets"></div><form class="sheet-preset-form"><label class="sr-only" for="preset-name">Preset name</label><input id="preset-name" name="name" maxlength="40" placeholder="Name this preset" required autocomplete="off"><button type="submit" class="button subtle">Save</button></form></section><div class="sheet-message" role="status"></div></div>`, '<button class="button subtle" data-sheet-close>Cancel</button><button class="button primary" data-apply-filters>Apply filters</button>');
    dialog.classList.add('model-filter-dialog');
    const selectFilterTab=(id,focus=false)=>{
      for(const tab of dialog.querySelectorAll('[data-model-filter-tab]')){const active=tab.dataset.modelFilterTab===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;dialog.querySelector('#'+tab.dataset.modelFilterTab).hidden=!active;if(active&&focus)tab.focus();}
    };
    dialog.querySelector('.filter-category-nav').addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...dialog.querySelectorAll('[data-model-filter-tab]')],index=event.key==='Home'?0:event.key==='End'?1:1-tabs.indexOf(event.target);selectFilterTab(tabs[index].dataset.modelFilterTab,true);});
    const draft = () => Object.fromEntries([...dialog.querySelectorAll('[data-filter-field]')].map(control => [control.dataset.filterField, control.tagName === 'SELECT' ? control.value : control.checked]));
    function setDraft(next) {
      for (const control of dialog.querySelectorAll('[data-filter-field]')) {
        const value = next[control.dataset.filterField];
        if (control.tagName === 'SELECT') { if ([...control.options].some(option => option.value === value && !option.disabled)) {control.value = value;control.dispatchEvent(new Event('change',{bubbles:true}));} }
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
      if (button.dataset.modelFilterTab) selectFilterTab(button.dataset.modelFilterTab);
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
for (const link of document.querySelectorAll('.live-sport-row')) {
  const sport=link.getAttribute('href').split('/')[1];
  link.querySelector('.live-sport-icon,.ui-icon')?.insertAdjacentHTML('beforebegin',leagueMark(sport));
  link.querySelector('.live-sport-icon,.ui-icon')?.remove();
}

// Label the destination on each research page; no status is inferred from styling.
const pageHeader = $('.site-header'), headingLabel = $('.page-heading .eyebrow');
if (pageHeader) document.body.dataset.section = pageHeader.dataset.siteSection;
if (headingLabel && pageHeader) {
  const sport = pageHeader.dataset.siteSport, section = pageHeader.dataset.siteSection;
  const labels = { research: 'MODEL PROJECTIONS', trends: 'PLAYER TRENDS', live: 'LIVE GAME CENTER', bets: 'MY PICKS', performance: 'MODEL PERFORMANCE', paper: 'PAPER RETURNS', simulation: 'GAME SIMULATION' };
  if (!headingLabel.querySelector('[id]')) headingLabel.innerHTML = `${icon(section === 'bets' ? 'picks' : section)}<span>${esc(sport ? sport.toUpperCase() + ' / ' : '')}${esc(labels[section] || 'VISUALODDS')}</span>`;
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
// Model boards show their overview as the masthead stat strip instead (see below).
if (!document.body.classList.contains('bets-app') && document.body.dataset.section !== 'research') foldPanel($('#summary'), 'Board overview', 'overview-fold');
foldPanel($('#prop-status') || $('#line-source'), 'Sportsbook lines & sources', 'sources-fold');
foldPanel($('#game-context'), 'Matchup & availability', 'context-fold');
if (document.body.dataset.section === 'live') {
  const lineNote=$('.live-line-note'),playerTools=$('.live-filter-row');
  if(lineNote&&playerTools){
    const help=document.createElement('button');help.type='button';help.className='icon-button live-line-help';
    help.title='Comparing sportsbook lines';help.setAttribute('aria-label',help.title);help.innerHTML=icon('info');
    playerTools.append(help);lineNote.hidden=true;
    help.addEventListener('click',()=>sheet('Comparing sportsbook lines','',lineNote.innerHTML));
  }
  foldPanel($('#warnings'),'Feed details','live-feed-notes');
  const feedNotes=$('.live-feed-notes');if(feedNotes)$('#live-players-panel')?.after(feedNotes);
  foldPanel($('#method'), 'How the live model works', 'method-fold');
  const methodFold = $('.method-fold');
  if (methodFold) {
    // Detailed model context belongs with its methodology, not above the scores.
    for (const note of document.querySelectorAll('.live-caveat,.live-disclosure')) methodFold.append(note);
    if (location.hash === '#method') methodFold.open = true;
    document.querySelectorAll('a[href="#method"]').forEach(link => link.addEventListener('click', () => { methodFold.open = true; }));
  }
}
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
if (boardNotes.length > 1 || (boardNotes.length && document.body.dataset.section === 'research')) {
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

// Keep schedule controls in the heading without a separate metadata strip.
if (document.body.classList.contains('trends-workspace')) {
  const toolbar = $('.td-toolbar'), heading = $('.page-heading');
  if (toolbar && heading) { heading.classList.add('trends-heading'); heading.insertBefore(toolbar, $('#trend-refresh')); }
}

// Reuse the native controls so every sport keeps its own schedule and markets.
const deskHeading = $('.page-heading');
if (deskHeading && ['research', 'trends'].includes(document.body.dataset.section)) {
  const toolbar = document.createElement('div'); toolbar.className = 'desk-toolbar';
  deskHeading.after(toolbar);
  for (const selector of ['.season-bar', '.sports-controls', '.td-toolbar']) {
    const controls = $(selector); if (controls) toolbar.append(controls);
  }
  // Markets are few enough to show inline: a pill strip above a slim command bar.
  toolbar.classList.add('desk-2026');
  const command = document.createElement('div'); command.className = 'desk-command';
  command.append(...toolbar.children);
  const markets = $('.market-picker') || $('#markets') || $('.sports-markets') || $('#td-markets');
  if (markets) {
    const strip = document.createElement('div'); strip.className = 'desk-market-strip';
    const arrow = (direction, label) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'desk-market-scroll'; button.tabIndex = -1;
      button.dataset.direction = direction; button.setAttribute('aria-label', label);
      button.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'}"/></svg>`;
      button.addEventListener('click', () => markets.scrollBy({ left: direction * 280, behavior: 'smooth' }));
      return button;
    };
    const start = arrow(-1, 'Scroll markets left'), end = arrow(1, 'Scroll markets right');
    markets.classList.add('desk-market-list');
    strip.append(start, markets, end);
    toolbar.append(strip);
    const syncArrows = () => {
      const overflow = markets.scrollWidth > markets.clientWidth + 2;
      strip.classList.toggle('is-scrollable', overflow);
      start.disabled = markets.scrollLeft < 4;
      end.disabled = markets.scrollLeft + markets.clientWidth > markets.scrollWidth - 4;
    };
    const revealActive = () => {
      const selected = markets.querySelector('[aria-pressed=true],[aria-selected=true],[aria-current=page],.active');
      if (selected && selected.offsetParent) {
        const left = selected.offsetLeft - markets.offsetLeft, right = left + selected.offsetWidth;
        if (left < markets.scrollLeft || right > markets.scrollLeft + markets.clientWidth) markets.scrollTo({ left: Math.max(0, left - 40) });
      }
      strip.hidden = markets.hidden;
      syncArrows();
    };
    markets.addEventListener('scroll', syncArrows, { passive:true });
    window.addEventListener('resize', syncArrows);
    new MutationObserver(revealActive).observe(markets, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-pressed','aria-selected','aria-current','class','hidden'] });
    requestAnimationFrame(revealActive);
  }
  toolbar.append(command);
  const filters=$('.td-filters') || $('.research-controls');
  if(filters) command.append(filters);
  const pageTools = $('.page-tools'); if(pageTools) toolbar.after(pageTools);
  foldPanel($('#board-caption'), 'How to read this board', 'caption-fold');
  const content = $('#content');
  if(content) {
    const notes = $('.workspace-context-strip') || document.createElement('div');
    notes.classList.add('workspace-context-strip');
    const caption = $('.caption-fold'); if(caption) notes.append(caption);
    if(notes.childElementCount) content.after(notes);
  }
  if(document.body.classList.contains('trends-workspace')) {
    $('#trend-refresh').innerHTML=icon('refresh');
    $('#trend-refresh').title='Refresh data';
    const saved=$('#td-saved');
    if(saved){saved.innerHTML=icon('bookmark')+'<span>Saved</span>';saved.title='Saved players';}
    $('.td-search input')?.setAttribute('placeholder','Search players');
  }
}

// Every internal tool shares the same title, sport switcher and action positions.
// Move existing elements so their data handlers and accessible labels stay intact.
const workspaceHeading = $('.page-heading,.product-page-heading,.tracker-page-heading');
if (workspaceHeading) {
  document.body.classList.add('research-console');
  workspaceHeading.classList.add('workspace-masthead');
  workspaceHeading.querySelector(':scope > div:first-child')?.classList.add('masthead-title');
  const actions = document.createElement('div'); actions.className = 'masthead-actions';
  for (const child of [...workspaceHeading.children]) {
    if (child.classList.contains('masthead-title')) continue;
    if (child.matches('.heading-actions,.tracker-heading-actions')) actions.append(...child.children);
    else if (child.matches('button,a,.sim-badge')) actions.append(child);
    if (child.matches('.heading-actions,.tracker-heading-actions')) child.remove();
  }
  if (actions.childElementCount) workspaceHeading.append(actions);
  for(const action of actions.querySelectorAll('button,a')){
    const label=action.getAttribute('aria-label')||action.textContent.trim();
    action.setAttribute('aria-label',label);action.title=label;
    if(!action.querySelector('svg,[data-ui-icon],[data-bet-icon]')){
      const mark=document.createElement('span');mark.className='masthead-mobile-icon';mark.innerHTML=icon('info');action.prepend(mark);
    }
  }
  const sports = $('.site-sports'), settings = $('.site-header-actions');
  if (sports) workspaceHeading.append(sports);
  if (settings) workspaceHeading.append(settings);
  // Board pages: the overview cards become the hero stat strip (boards-polish.css).
  const overview = $('#summary');
  if (overview && document.body.dataset.section === 'research' && !overview.closest('.workspace-fold')) { overview.classList.add('masthead-stats'); workspaceHeading.append(overview); }
  // Gradient accent on the title's last word; titles are re-rendered, so re-apply on change.
  const title = workspaceHeading.querySelector('h1');
  if (title && ['research', 'trends', 'performance', 'paper', 'live'].includes(document.body.dataset.section)) {
    const accentTitle = () => {
      if (title.querySelector('.masthead-accent')) return;
      const text = [...title.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).pop();
      const match = text?.textContent.match(/^([\s\S]*\s)(\S+)(\s*)$/);
      if (!match) return;
      const word = document.createElement('span'); word.className = 'masthead-accent'; word.textContent = match[2];
      text.textContent = match[1]; text.after(word); if (match[3]) word.after(match[3]);
    };
    accentTitle(); new MutationObserver(accentTitle).observe(title, { childList: true, characterData: true, subtree: true });
  }
  // Keep documentation available through one action instead of repeated footer strips.
  if(guide){
    if(!settings&&!actions.isConnected)workspaceHeading.append(actions);
    const help=document.createElement('button');help.className='icon-button workspace-help';help.type='button';
    help.setAttribute('aria-label','About this data');help.title='About this data';help.innerHTML=icon('info');
    (settings||actions).append(help);guide.hidden=true;
    help.addEventListener('click',()=>sheet('About this data','',guide.querySelector('.guide-body').innerHTML));
  }
}

// Keep the overview's search, date and prop selection together.
if (document.body.dataset.section === 'home') {
  const toolbar = $('.home-toolbar'), search = $('.home-player-search');
  toolbar?.classList.add('workspace-controlbar');
  if (toolbar && search) {
    const label = document.createElement('span'); label.className = 'sr-only'; label.textContent = 'Find a player';
    for (const node of [...search.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    search.prepend(label); toolbar.prepend(search);
    $('#home-search').placeholder = 'Search players or teams';
  }
}

// Simulation uses the same horizontal control strip as the Trends board.
if (document.body.dataset.section === 'simulation' && $('#simulation-form') && !$('.simulator-workspace')) {
  const grid = document.createElement('div'); grid.className = 'simulation-workspace';
  const configuration = document.createElement('aside'); configuration.className = 'simulation-configuration';
  configuration.setAttribute('aria-label', 'Simulation setup');
  const results = document.createElement('section'); results.className = 'simulation-output'; results.setAttribute('aria-label', 'Simulation results');
  const form = $('#simulation-form'); form.before(grid); grid.append(configuration,results);
  configuration.append(form);form.classList.add('workspace-controlbar');
  for (const selector of ['#sim-status','#sim-retry']) { const node=$(selector); if(node)configuration.append(node); }
  results.append($('#sim-results'));
  const note=$('.sim-note');if(note)results.append(note);
}

// Compact controls and evidence belong below the masthead on every tool.
for (const bar of document.querySelectorAll('main > .live-toolbar,main > .performance-controls')) bar.classList.add('workspace-controlbar');
const archiveNote = $('.performance-main > .performance-note');
if (archiveNote) $('.performance-main > .performance-controls')?.after(archiveNote);

function workspaceViews(heading, views, parameter) {
  const tabs=document.createElement('nav');tabs.className='workspace-view-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workspace views');
  const panels=views.map(({key,label,nodes,developer})=>{
    const panel=document.createElement('section');panel.id=`workspace-${key}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`workspace-tab-${key}`);
    for(const node of nodes.filter(Boolean))panel.append(node);
    const tab=document.createElement('button');tab.id=`workspace-tab-${key}`;tab.type='button';tab.setAttribute('role','tab');tab.dataset.workspaceView=key;tab.setAttribute('aria-controls',panel.id);tab.textContent=label;tabs.append(tab);
    if(developer){tab.setAttribute('data-dev-only','');panel.setAttribute('data-dev-only','');}
    return panel;
  });
  heading.after(tabs,...panels);
  const select=(key,{focus=false,update=true}={})=>{
    if(!views.some(view=>view.key===key&&(!view.developer||document.documentElement.dataset.devMode==='true')))key=views[0].key;
    views.forEach((view,index)=>{const active=view.key===key,tab=tabs.children[index];tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panels[index].hidden=!active;if(active&&focus)tab.focus();});
    if(update){const url=new URL(location.href);url.searchParams.set(parameter,key);history.replaceState(null,'',url);}
  };
  tabs.addEventListener('click',e=>{const tab=e.target.closest('[data-workspace-view]');if(tab)select(tab.dataset.workspaceView);});
  tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const available=views.filter(view=>!view.developer||document.documentElement.dataset.devMode==='true'),index=available.findIndex(view=>view.key===e.target.dataset.workspaceView),next=e.key==='Home'?0:e.key==='End'?available.length-1:(index+(e.key==='ArrowRight'?1:-1)+available.length)%available.length;select(available[next].key,{focus:true});});
  const restore=()=>select(new URLSearchParams(location.search).get(parameter),{update:false});restore();window.addEventListener('popstate',restore);
  document.addEventListener('devmodechange',restore);
  return select;
}

if (document.body.dataset.section === 'bets') {
  // The tracker keeps performance, the calendar and ticket activity in one reading flow.
  // Its own month controls and filters remain next to the information they change.
}

if (document.body.dataset.section === 'performance') {
  workspaceViews(workspaceHeading,[{key:'archive',label:'Pregame archive',nodes:[$('.performance-main > .performance-controls'),$('#status'),$('#report'),archiveNote]},{key:'historical',label:'Historical evaluation',nodes:[$('.performance-main > .performance-section')]}],'panel');
}

// A slow or unavailable remote headshot still gets a useful, deterministic avatar.
// Keep the real image above the initials and reveal it when the request succeeds.
function prepareAvatars(root) {
  const images = root.matches?.('img') ? [root] : [...root.querySelectorAll?.('.research-player img,.avatar,.mlb-avatar,.sports-card header img,.td-player-name img,.td-player-identity img,.pr-identity > img,.trend-card header img') || []];
  for (const img of images) {
    if (!(img instanceof HTMLImageElement) || img.dataset.avatarReady || img.closest('.ui-avatar,.player-portrait')) continue;
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
prepareIdentityImages(document);
new MutationObserver(records => {
  for(const record of records) {
    if(record.type==='attributes'){prepareIdentityImages(record.target);continue;}
    for(const node of record.addedNodes)if(node instanceof Element&&!node.closest('.ui-avatar')){prepareAvatars(node);prepareIdentityImages(node);}
  }
}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']});
