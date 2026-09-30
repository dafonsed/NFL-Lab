// Quick search (Ctrl/⌘ K): jump to any tool, dashboard or page from the keyboard.
import { SPORTS, productDashboardUrl, betTrackerUrl } from './navigation.js';
import { evToolUrl } from './ev-tool-catalog.js';

const EV_TOOLS = [
  ['odds', 'Odds screen', 'Every book on one row'], ['ev-pre', 'Positive EV', 'Prices above the no-vig fair line'], ['ev-live', 'Live positive EV', 'In-game value'],
  ['arb-pre', 'Arbitrage', 'Both sides priced to profit'], ['arb-live', 'Live arbitrage', 'In-game arbitrage'], ['middles', 'Middles', 'Win both sides'],
  ['holds', 'Low holds', 'Cheapest two-sided markets'], ['promo', 'Promo converter', 'Turn a bonus into cash'], ['parlay', 'Parlay builder', 'Build a ticket leg by leg'],
  ['sharp', 'Smart money', 'Exchange liquidity and movement'], ['fantasy', 'Fantasy lines', 'DFS pick lines'], ['optimizer', 'Fantasy optimizer', 'Best two-pick combos'],
  ['slip', 'Slip builder', "Build a pick'em slip"], ['fantasy-alerts', 'Fantasy alerts', 'New DFS props'], ['prediction', 'Prediction markets', 'Kalshi, Polymarket and more'],
  ['line-alerts', 'Price alerts', 'Line movement and price thresholds'],
];

function entries() {
  const list = [
    { group: 'Dashboards', label: 'Trends dashboard', hint: 'Hot players and lines', href: productDashboardUrl('trends', 'nfl') },
    { group: 'Dashboards', label: 'Models dashboard', hint: 'Projections and research', href: productDashboardUrl('models', 'mlb') },
    { group: '+EV', label: '+EV dashboard', hint: 'Best prices right now', href: productDashboardUrl('ev', 'all') },
    ...EV_TOOLS.map(([key, label, hint]) => ({ group: '+EV', label, hint, href: evToolUrl(key, 'all') })),
    { group: 'Bets', label: 'Bet tracker', hint: 'Profit, ROI and CLV', href: betTrackerUrl() },
    { group: 'Bets', label: 'Add a bet', hint: 'Log a new ticket', href: betTrackerUrl() + '?add=1', keywords: 'new ticket log' },
  ];
  for (const [sport, name] of Object.entries(SPORTS)) {
    list.push({ group: name, label: `${name} player trends`, hint: 'Hit rates against today’s lines', href: `/${sport}?view=trends`, keywords: 'props players' });
    list.push({ group: name, label: `${name} projections`, hint: 'Model research', href: `/${sport}`, keywords: 'model research' });
    if (['nfl', 'nba', 'wnba', 'mlb'].includes(sport)) {
      list.push({ group: name, label: `${name} live games`, hint: 'Scores and markets', href: `/${sport}/live` });
      list.push({ group: name, label: `${name} simulation`, hint: 'Play the game 10,000 times', href: `/${sport}/simulation` });
    }
  }
  list.push(
    { group: 'Account', label: 'Account settings', hint: 'Profile, security and billing', href: '/account', keywords: 'billing plan password' },
    { group: 'Help', label: 'Help center', hint: 'Guides for every tool', href: '/help', keywords: 'faq support' },
    { group: 'Help', label: 'Contact', hint: 'Support and billing', href: '/contact' },
    { group: 'Help', label: 'What’s new', hint: 'Changelog', href: '/changelog' },
    { group: 'Help', label: 'Status', hint: 'Service health', href: '/status' },
  );
  return list;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function searchEntries(query, list = entries()) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    // Starting points: the dashboards, the most-used market tools, the tracker and help.
    const picks = ['Trends dashboard', 'Models dashboard', '+EV dashboard', 'Positive EV', 'Arbitrage', 'Odds screen', 'Bet tracker', 'Add a bet', 'Help center'];
    return picks.map(label => list.find(entry => entry.label === label)).filter(Boolean);
  }
  return list.map(entry => {
    const label = entry.label.toLowerCase(), text = `${label} ${entry.group} ${entry.hint} ${entry.keywords || ''}`.toLowerCase();
    if (!words.every(word => text.includes(word))) return null;
    const score = words.reduce((sum, word) => sum + (label.startsWith(word) ? 3 : label.includes(word) ? 2 : 1), 0);
    return { entry, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 14).map(item => item.entry);
}

let dialog, input, results, active = 0, current = [];
function paint() {
  current = searchEntries(input.value);
  active = Math.min(active, Math.max(0, current.length - 1));
  let group = '';
  results.innerHTML = current.length ? current.map((entry, index) => {
    const heading = entry.group !== group ? `<li class="vo-cmd-group" role="presentation">${esc(entry.group)}</li>` : '';
    group = entry.group;
    return `${heading}<li role="option" id="vo-cmd-${index}" aria-selected="${index === active}" data-index="${index}"><a href="${esc(entry.href)}" tabindex="-1"><strong>${esc(entry.label)}</strong><small>${esc(entry.hint)}</small></a></li>`;
  }).join('') : '<li class="vo-cmd-empty" role="presentation">No matches. Try a sport, a tool or “bet”.</li>';
  input.setAttribute('aria-activedescendant', current.length ? `vo-cmd-${active}` : '');
  results.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
}
function build() {
  if (!document.querySelector('link[href^="/command-palette.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/command-palette.css?v=2' }));
  dialog = document.createElement('dialog');
  dialog.className = 'vo-cmd';
  dialog.setAttribute('aria-label', 'Quick search');
  dialog.innerHTML = `<div class="vo-cmd-box"><div class="vo-cmd-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Search tools, sports and pages" aria-label="Search tools, sports and pages" role="combobox" aria-expanded="true" aria-controls="vo-cmd-results" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><ul class="vo-cmd-results" id="vo-cmd-results" role="listbox"></ul><footer><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span></footer></div>`;
  document.body.append(dialog);
  input = dialog.querySelector('input'); results = dialog.querySelector('ul');
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + current.length) % Math.max(current.length, 1); paint(); }
    if (event.key === 'Enter' && current[active]) { event.preventDefault(); location.href = current[active].href; }
  });
  results.addEventListener('mousemove', event => { const row = event.target.closest('[data-index]'); if (row && Number(row.dataset.index) !== active) { active = Number(row.dataset.index); paint(); } });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
export function openPalette() {
  if (!dialog) build();
  input.value = ''; active = 0; paint();
  dialog.showModal(); input.focus();
}
