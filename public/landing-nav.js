const menuButton = document.querySelector('.home-menu-toggle');
const menu = document.querySelector('#home-nav');
const header = document.querySelector('.home-header');

if (header) {
  const updateScrollState = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  updateScrollState();
  window.addEventListener('scroll', updateScrollState, { passive: true });
}

if (menuButton && menu) {
  const setOpen = open => {
    menu.dataset.open = String(open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  menuButton.addEventListener('click', () => setOpen(menuButton.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.home-header')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      menuButton.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1180) setOpen(false);
  });
}
