import {evToolUrl} from './ev-tool-catalog.js';

const menu = document.querySelector('[data-ev-more]');
if (menu) {
  const trigger = menu.querySelector('summary');
  const canHover = matchMedia('(hover: hover) and (pointer: fine)');
  let timer, hoverOpened = false;
  const close = () => { clearTimeout(timer); menu.open = false; hoverOpened = false; trigger.setAttribute('aria-expanded','false'); };
  const open = () => { clearTimeout(timer); menu.open = true; trigger.setAttribute('aria-expanded','true'); };
  menu.addEventListener('pointerenter', () => { if (!canHover.matches) return; clearTimeout(timer); if (!menu.open) { hoverOpened = true; open(); } });
  menu.addEventListener('pointerleave', () => { if (canHover.matches && hoverOpened) timer = setTimeout(() => { if (!menu.contains(document.activeElement)) close(); },200); });
  trigger.addEventListener('click', event => {
    event.preventDefault();
    const shouldOpen = hoverOpened || !menu.open;
    hoverOpened = false;
    if (shouldOpen) { open(); trigger.focus({preventScroll:true}); } else close();
  });
  menu.addEventListener('toggle', () => trigger.setAttribute('aria-expanded',String(menu.open)));
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); } else if (event.key === 'ArrowDown' && event.target === trigger) { event.preventDefault(); open(); menu.querySelector('.ev-more-groups a')?.focus(); } });
  menu.addEventListener('focusout', event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) close(); });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) close(); });
  menu.addEventListener('click', event => { if (event.target.closest('a')) { close(); if (location.pathname === '/ev') document.querySelector('main')?.focus({preventScroll:true}); } });
  const active = () => {
    const key = location.pathname === '/ev' ? location.hash.slice(1) : '';
    const sport = new URLSearchParams(location.search).get('sport') || 'all';
    let selected = false;
    menu.querySelectorAll('[data-more-tool]').forEach(link => { link.href = evToolUrl(link.dataset.moreTool,sport); const current = link.dataset.moreTool === key; link.toggleAttribute('aria-current',current); if (current) link.setAttribute('aria-current','page'); selected ||= current; });
    menu.classList.toggle('has-current-tool',selected);
  };
  window.addEventListener('hashchange', () => { close(); active(); });
  document.addEventListener('ev-tool-change',active);
  active();
}
