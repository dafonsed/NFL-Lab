// "Get set up" checklist for new accounts, shown at the top of each workspace dashboard.
// Steps tick themselves off by reading the same saved data the tools write; the card can be
// dismissed and stays dismissed for this account (it syncs with account storage).
import { accountStorage as storage, accountReady } from './account-sync.js';
import { productDashboardUrl } from './navigation.js';

const DISMISSED = 'vo-onboarding-dismissed-v1';
const read = key => { try { return storage.getItem(key); } catch { return null; } };
const json = key => { try { return JSON.parse(read(key) || 'null'); } catch { return null; } };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The sidebar's workspace menu only lists products this plan includes.
const hasProduct = key => !!document.querySelector(`.site-product-menu [data-product="${key}"]`) || document.querySelector('.site-group-toggle')?.dataset.group === key;

function steps() {
  const list = [];
  if (hasProduct('ev')) {
    list.push({ id: 'state', title: 'Choose your state', text: 'Only sportsbooks legal where you are appear in prices and bets.', href: productDashboardUrl('ev', 'all'), action: 'Choose state', done: !!json('sportslab-sportsbook-state-v1') || !!read('sportslab-sportsbook-state-v1') });
    const session = json('sportslab-ev-suite-session-v1');
    list.push({ id: 'books', title: 'Pick your sportsbooks', text: 'Filter every EV and arbitrage board to the books you actually have.', href: '/ev?sport=all#ev-pre', action: 'Pick books', done: Array.isArray(session?.context?.books ?? session?.books) && (session?.context?.books ?? session?.books).length > 0 });
  }
  const bets = json('nfl-lab.personal-bets.v1');
  list.push({ id: 'bet', title: 'Add your first bet', text: 'Log a ticket and the tracker keeps profit, ROI and closing-line value for you.', href: '/bets?add=1', action: 'Add a bet', done: Array.isArray(bets?.bets) && bets.bets.length > 0 });
  if (hasProduct('trends')) {
    let watching = false;
    try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('sports-lab-trends-watchlist-') && (json(key) || []).length) { watching = true; break; } } } catch { /* storage blocked */ }
    list.push({ id: 'watch', title: 'Watch a player', text: 'Save players from Trends to follow their lines and hit rates.', href: '/nfl?view=trends', action: 'Open trends', done: watching });
  }
  return list;
}

function render(root) {
  const list = steps(), done = list.filter(step => step.done).length;
  if (read(DISMISSED) === '1' || !list.length || done === list.length) { root.hidden = true; root.innerHTML = ''; return; }
  root.hidden = false;
  root.innerHTML = `<header class="vo-onboard-head"><div><span class="vo-onboard-kicker">Get set up · ${done} of ${list.length} done</span><h2 id="vo-onboard-title">Make VisualOdds yours</h2></div>
    <button type="button" class="vo-onboard-dismiss" data-onboard-dismiss aria-label="Hide the setup checklist">Hide</button></header>
    <div class="vo-onboard-meter" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${done}"><i style="width:${done / list.length * 100}%"></i></div>
    <ol class="vo-onboard-steps">${list.map((step, index) => `<li class="${step.done ? 'is-done' : ''}"><span class="vo-onboard-check" aria-hidden="true">${step.done ? '✓' : index + 1}</span><span class="vo-onboard-copy"><strong>${esc(step.title)}</strong><small>${esc(step.text)}</small></span>${step.done ? '<span class="vo-onboard-state">Done</span>' : `<a href="${esc(step.href)}">${esc(step.action)}</a>`}<span class="sr-only">${step.done ? 'completed' : 'not done yet'}</span></li>`).join('')}</ol>`;
}

export function mountOnboarding() {
  const dashboard = document.querySelector('#home-dashboard');
  if (!dashboard) return;
  let root = document.querySelector('#vo-onboarding');
  if (!root) {
    root = Object.assign(document.createElement('section'), { id: 'vo-onboarding', className: 'vo-onboard', hidden: true });
    root.setAttribute('aria-labelledby', 'vo-onboard-title');
    const hero = dashboard.querySelector('.hd-hero');
    hero ? hero.after(root) : dashboard.prepend(root);
  }
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-onboard-dismiss]')) return;
    try { storage.setItem(DISMISSED, '1'); } catch { /* storage blocked: hide for this view only */ }
    root.hidden = true;
  });
  render(root);
  Promise.resolve(accountReady).then(() => render(root), () => {});
  addEventListener('storage', () => render(root));
}

mountOnboarding();
