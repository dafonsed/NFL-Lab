// Browser notifications for saved alerts. Opt-in per browser: the user turns them on, the
// browser asks for permission, and each new alert match then shows a system notification.
const PREF = 'vo-browser-alerts';
const MAX_PER_BATCH = 3;

const supported = () => typeof window !== 'undefined' && 'Notification' in window;
const pref = () => { try { return localStorage.getItem(PREF) === 'on'; } catch { return false; } };
const setPref = on => { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

/** 'unsupported' | 'blocked' | 'on' | 'off' */
export function browserAlertsState() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && pref() ? 'on' : 'off';
}

export async function toggleBrowserAlerts() {
  if (!supported()) return 'unsupported';
  if (browserAlertsState() === 'on') { setPref(false); return 'off'; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  setPref(permission === 'granted');
  return browserAlertsState();
}

/** Show system notifications for newly created alert matches ({ id, message }). */
export function deliverAlerts(notes) {
  if (!notes.length || browserAlertsState() !== 'on') return 0;
  const shown = notes.slice(0, MAX_PER_BATCH);
  for (const note of shown) {
    try { new Notification('VisualOdds alert', { body: note.message, tag: note.id, icon: '/favicon.svg' }); } catch { /* some browsers only allow service-worker notifications */ }
  }
  if (notes.length > MAX_PER_BATCH) {
    try { new Notification('VisualOdds alerts', { body: `${notes.length - MAX_PER_BATCH} more alerts matched. Open VisualOdds to see them all.`, tag: 'vo-alert-overflow', icon: '/favicon.svg' }); } catch { /* ignore */ }
  }
  return shown.length;
}

/** Small control for alert screens: a switch plus a short status line. */
export function browserAlertsControl() {
  const state = browserAlertsState();
  const label = { on: 'Browser alerts on', off: 'Turn on browser alerts', blocked: 'Browser alerts blocked', unsupported: 'Browser alerts unavailable' }[state];
  const hint = { on: 'New matches pop up even when this tab is in the background.', off: 'Get a notification when a saved alert matches.', blocked: 'Allow notifications for this site in your browser settings, then try again.', unsupported: 'This browser does not support notifications.' }[state];
  return `<div class="browser-alerts" data-state="${state}"><button type="button" data-browser-alerts aria-pressed="${state === 'on'}"${['blocked', 'unsupported'].includes(state) ? ' disabled' : ''}>${label}</button><small>${hint}</small></div>`;
}
