import { icon } from './ui-icons.js';

// The public homepage makes no data requests. Product previews are labelled
// snapshots; their links open the real workspace with its normal freshness rules.
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
const tabs = [...document.querySelectorAll('.landing-preview-tabs [role="tab"]')];
function selectTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const index = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    selectTab(tabs[next], true);
  });
}
