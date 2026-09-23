const key = 'sports-lab-dev-mode';
let enabled = false;
try { enabled = localStorage.getItem(key) === '1'; } catch {}
function render() {
  document.documentElement.dataset.devMode = String(enabled);
  for (const button of document.querySelectorAll('[data-dev-toggle]')) {
    button.setAttribute('aria-pressed', String(enabled));
    button.innerHTML = '<span aria-hidden="true">&lt;/&gt;</span> Dev mode <b>' + (enabled ? 'On' : 'Off') + '</b>';
  }
}
document.addEventListener('click', event => {
  if (!event.target.closest('[data-dev-toggle]')) return;
  enabled = !enabled;
  try { localStorage.setItem(key, enabled ? '1' : '0'); } catch {}
  render();
  document.dispatchEvent(new CustomEvent('devmodechange', { detail: enabled }));
});
window.addEventListener('storage', event => { if (event.key === key) { enabled = event.newValue === '1'; render(); } });
document.addEventListener('researchopened', render);
render();
