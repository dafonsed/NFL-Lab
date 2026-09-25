const viewport = document.querySelector('#home-review-viewport');
const previous = document.querySelector('[data-review-scroll="previous"]');
const next = document.querySelector('[data-review-scroll="next"]');

if (viewport && previous && next) {
  const update = () => {
    previous.disabled = viewport.scrollLeft <= 2;
    next.disabled = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
  };
  const move = direction => {
    const card = viewport.querySelector('.home-review-card');
    const track = viewport.querySelector('.home-review-track');
    if (!card || !track) return;
    const distance = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap);
    viewport.scrollBy({ left: direction * distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  viewport.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}
