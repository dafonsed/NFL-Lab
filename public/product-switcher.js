import { productDashboardUrl } from './navigation.js';
const root = document.querySelector('.site-product-switcher');
if (root) {
  const toggle = root.querySelector('.site-product-toggle');
  const menu = root.querySelector('.site-product-menu');
  let pinned = false;
  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) pinned = false;
    if (open) {
      // Read the current URL when opening, including sport changes made in-place.
      const url = new URL(location.href);
      const knownSports = ['nfl','mlb','nba','wnba','nhl','soccer'];
      const sport = knownSports.includes(url.pathname.split('/')[1]) ? url.pathname.split('/')[1] : url.searchParams.get('sport');
      for (const product of ['trends', 'models', 'ev']) root.querySelector(`[data-product="${product}"]`).href = productDashboardUrl(product, sport);
    }
  }
  toggle.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') setOpen(true); });
  root.addEventListener('pointerleave', () => { if (!pinned && !menu.contains(document.activeElement)) setOpen(false); });
  toggle.addEventListener('click', () => { pinned = !pinned; setOpen(pinned); });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) setOpen(false); });
  toggle.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    const links = [...menu.querySelectorAll('a')];
    (event.key === 'ArrowDown' ? links[0] : links.at(-1)).focus();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
    toggle.focus({preventScroll:true});
  });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) setOpen(false); });
}
