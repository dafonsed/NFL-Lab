import { productDashboardUrl } from './navigation.js';
const root = document.querySelector('.site-product-switcher');
// Remember the workspace group so the shared Dashboard keeps showing it.
const rememberGroup = group => { if (['trends', 'models', 'ev'].includes(group)) document.cookie = `sl-group=${group}; path=/; max-age=31536000; samesite=lax`; };
const header = root?.closest('.site-header');
if (header && header.dataset.siteSection !== 'home') rememberGroup(header.dataset.siteGroup);
if (root && root.querySelector('.site-product-menu')) {
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
      const sport = knownSports.includes(url.pathname.split('/')[1]) ? url.pathname.split('/')[1] : url.searchParams.get('sport') || root.closest('.site-header')?.dataset.siteSport;
      for (const link of root.querySelectorAll('[data-product]')) link.href = productDashboardUrl(link.dataset.product, sport);
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
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      setOpen(false);
      toggle.focus({preventScroll:true});
      return;
    }
    if (menu.hidden || !menu.contains(event.target) || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const links = [...menu.querySelectorAll('a')], current = links.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + links.length) % links.length;
    links[index]?.focus();
  });
  menu.addEventListener('click', event => { const link = event.target.closest('a[data-product]'); if (link) { rememberGroup(link.dataset.product); setOpen(false); } });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) setOpen(false); });
}
