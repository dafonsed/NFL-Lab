import { platformAsset, platformLabel } from './platform-catalog.js';
import {US_STATES, SPORTSBOOK_COVERAGE, COVERAGE_CHECKED, STATE_STORAGE_KEY, STATE_CHANGE_EVENT, normalizeState, readSportsbookState, saveSportsbookState, sportsbookStatus} from './sportsbook-availability.js';
import {icon} from './ui-icons.js';


function bookRow(book, available) {
  return `<div class="ev-state-book" data-availability="${available ? 'available' : 'unavailable'}"><img src="${platformAsset(book)}" width="26" height="26" alt="" decoding="async"><span class="ev-state-book-name">${platformLabel(book)}</span><span class="ev-state-book-status">${available ? `${icon('check')} Available` : 'Unavailable'}</span></div>`;
}

const picker = document.querySelector('[data-state-picker]');
if (picker) {
  const select = picker.querySelector('[data-state-select]');
  const trigger = picker.querySelector(':scope > summary');
  const books = Object.keys(SPORTSBOOK_COVERAGE);
  function render(code, saved = true) {
    select.value = code;
    for (const option of select.options) option.toggleAttribute('selected', option.value === code);
    picker.querySelector('[data-state-label]').textContent = code || 'All books';
    trigger.setAttribute('aria-label', code ? `Change state: ${US_STATES[code]}` : 'Choose your state');
    trigger.title = code ? `Sportsbooks in ${US_STATES[code]}` : 'Choose your state';
    const available = books.filter(book => sportsbookStatus(book, code) === 'available');
    const unavailable = books.filter(book => !available.includes(book));
    picker.querySelector('[data-state-status]').innerHTML = code ? `<span>Available in ${US_STATES[code]}</span><b aria-label="${available.length} of ${books.length} supported sportsbooks available">${available.length}<span> / ${books.length}</span></b>` : `<span>All supported sportsbooks</span><b>${books.length}</b>`;
    const saveError = picker.querySelector('[data-state-save-error]');
    saveError.hidden = saved;
    saveError.textContent = saved ? '' : 'Applied for now. Your browser could not save this state.';
    picker.querySelector('[data-state-books]').innerHTML = code
      ? `${available.length ? `<div class="ev-state-books" aria-label="Available sportsbooks">${available.map(book => bookRow(book, true)).join('')}</div>` : '<p class="ev-state-empty">None of our supported online sportsbooks are available here. Choose another state to check its coverage.</p>'}${unavailable.length ? `<details class="ev-state-unavailable"><summary><span>Unavailable sportsbooks <b>${unavailable.length}</b></span>${icon('chevron')}</summary><div class="ev-state-books" aria-label="Unavailable sportsbooks">${unavailable.map(book => bookRow(book, false)).join('')}</div></details>` : ''}`
      : '<p class="ev-state-empty">Showing offers across all states. Select your state to check local availability.</p>';
    picker.querySelector('[data-state-sources]').innerHTML = `<p>Checked ${COVERAGE_CHECKED}. Coverage can change. DFS apps and exchanges have separate rules. Books without verified state coverage remain selectable; confirm eligibility directly with the sportsbook.</p><div class="ev-state-source-links">${books.map(book => `<a href="${SPORTSBOOK_COVERAGE[book].source}" target="_blank" rel="noopener noreferrer">${book}</a>`).join('')}</div>`;
  }
  function change(code, saved = true) {
    render(code, saved);
    document.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT, {detail:{state:code, saved}}));
  }
  select.addEventListener('change', () => {
    const code = normalizeState(select.value);
    change(code, saveSportsbookState(code));
  });
  document.addEventListener(STATE_CHANGE_EVENT, event => render(normalizeState(event.detail?.state), event.detail?.saved !== false));
  window.addEventListener('storage', event => {
    if (event.key === STATE_STORAGE_KEY || event.key === null) change(readSportsbookState());
  });
  picker.querySelector('[data-state-close]').addEventListener('click', () => {
    picker.open = false;
    trigger.focus();
  });
  picker.addEventListener('toggle', () => {
    trigger.setAttribute('aria-expanded', String(picker.open));
    if (picker.open) {
      document.querySelectorAll('.ev-site-menu[open]').forEach(menu => { menu.open = false; });
    }
  });
  document.addEventListener('pointerdown', event => { if (picker.open && !picker.contains(event.target)) picker.open = false; });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { picker.open = false; trigger.focus(); event.stopPropagation(); }
  });
  render(readSportsbookState());
}
