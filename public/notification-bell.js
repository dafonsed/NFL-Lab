// Sidebar bell: unread saved-alert matches from the EV workbench, with the latest few in a popover.
import { accountStorage as storage, accountReady } from './account-sync.js';

const STORE = 'sportslab-ev-workbench-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };

function readAlerts() {
  try {
    const state = JSON.parse(storage.getItem(STORE) || '{}');
    const rules = new Map((state.alerts || []).map(rule => [rule.id, rule]));
    return (state.notifications || []).filter(note => !note.read).map(note => ({ ...note, fantasy: rules.get(note.ruleId)?.kind === 'fantasy-new' }));
  } catch { return []; }
}

export function mountNotificationBell() {
  const anchor = document.querySelector('.dashboard-search');
  if (!anchor || document.querySelector('.vo-bell')) return;
  const wrap = document.createElement('div');
  wrap.className = 'vo-bell';
  wrap.innerHTML = `<button type="button" class="vo-bell-button" aria-haspopup="dialog" aria-expanded="false" aria-controls="vo-bell-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4a2 2 0 0 0 4 0"/></svg><span class="vo-bell-count" hidden></span><span class="sr-only">Alerts</span></button><section class="vo-bell-panel" id="vo-bell-panel" role="dialog" aria-label="Recent alerts" hidden></section>`;
  // Search and the bell share one row at the top of the sidebar.
  const row = document.createElement('div');
  row.className = 'dashboard-search-row';
  anchor.before(row);
  row.append(anchor, wrap);
  const button = wrap.querySelector('button'), panel = wrap.querySelector('section'), count = wrap.querySelector('.vo-bell-count');
  function render() {
    const notes = readAlerts();
    count.hidden = !notes.length;
    count.textContent = notes.length > 99 ? '99+' : String(notes.length);
    button.setAttribute('aria-label', notes.length ? `${notes.length} unread ${notes.length === 1 ? 'alert' : 'alerts'}` : 'Alerts');
    panel.innerHTML = `<header><strong>Alerts</strong><a href="/ev?sport=all#line-alerts">Manage alerts</a></header>${notes.length
      ? `<ul>${notes.slice(0, 6).map(note => `<li><a href="/ev?sport=all#${note.fantasy ? 'fantasy-alerts' : 'line-alerts'}"><strong>${esc(note.message)}</strong><small>${esc(when(note.ts))}</small></a></li>`).join('')}</ul>${notes.length > 6 ? `<p>${notes.length - 6} more in your alerts.</p>` : ''}`
      : '<p class="vo-bell-empty">No new alerts. Set price, EV or fantasy alerts and matches show up here.</p>'}`;
  }
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => { const open = panel.hidden; render(); panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', event => { if (!wrap.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { close(); button.focus(); } });
  addEventListener('storage', render);
  render();
  Promise.resolve(accountReady).then(render, () => {});
}

mountNotificationBell();
