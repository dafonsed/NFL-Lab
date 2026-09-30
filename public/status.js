// Status page: checks the public health endpoint from the visitor's browser.
const list = document.querySelector('#status-list'), summary = document.querySelector('#status-summary');
const set = (component, state, text) => {
  const row = list?.querySelector(`[data-component="${component}"]`);
  if (!row) return;
  row.querySelector('.info-dot').className = `info-dot is-${state}`;
  row.querySelector('small').textContent = text;
};
const ago = iso => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};
try {
  const started = performance.now();
  const response = await fetch('/api/health', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  const ms = Math.round(performance.now() - started);
  set('api', response.ok ? 'up' : 'down', response.ok ? `Up · responded in ${ms} ms` : 'Not responding');
  const last = data.lastSync;
  if (data.syncing) set('sync', 'warn', 'Refreshing now');
  else if (!last) set('sync', 'warn', 'Waiting for the first refresh');
  else if (last.ok === false) set('sync', 'warn', 'Last refresh had a problem; tools show cached data');
  else {
    const when = last.finishedAt || last.at || last.fetchedAt;
    set('sync', 'up', when ? `Up · refreshed ${ago(when)}` : 'Up');
  }
  const down = list.querySelectorAll('.is-down').length, warn = list.querySelectorAll('.is-warn').length;
  summary.textContent = down ? 'Some services are down' : warn ? 'Running with minor delays' : 'All systems operational';
} catch {
  set('api', 'down', 'Not responding');
  set('sync', 'warn', 'Unknown while the API is unreachable');
  summary.textContent = 'Some services are down';
}
