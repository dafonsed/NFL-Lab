// Homepage motion: scroll reveals, the hero product-window tabs, stat count-ups
// and a pointer spotlight on tool cards. Content stays visible without JS.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;

// Scroll reveals, staggered within each parent.
const revealables = [...document.querySelectorAll('[data-reveal]')];
if (!reduced && 'IntersectionObserver' in window) {
  body.classList.add('sl-motion');
  const siblings = new Map();
  for (const node of revealables) {
    const index = siblings.get(node.parentElement) || 0;
    siblings.set(node.parentElement, index + 1);
    node.style.setProperty('--reveal-delay', Math.min(index, 6) * 70 + 'ms');
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealables.forEach(node => observer.observe(node));
  // Fail-safe: observers are throttled in hidden tabs; never leave content invisible.
  const revealInView = () => revealables.forEach(node => { if (node.getBoundingClientRect().top < innerHeight * 1.1) node.classList.add('is-visible'); });
  setTimeout(revealInView, 1200);
  addEventListener('scroll', revealInView, { passive: true });
  document.addEventListener('visibilitychange', revealInView);
} else {
  revealables.forEach(node => node.classList.add('is-visible'));
}

// Product window tabs (WAI-ARIA tabs pattern with arrow-key navigation).
const tablist = document.querySelector('.sl-window-tabs');
if (tablist) {
  const tabs = [...tablist.querySelectorAll('[role=tab]')];
  let auto = reduced ? null : setInterval(() => select((current() + 1) % tabs.length, false), 6000);
  const stop = () => { clearInterval(auto); auto = null; };
  const current = () => tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  function select(index, focus = true) {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tabs[index].focus();
  }
  tablist.addEventListener('click', event => {
    const tab = event.target.closest('[role=tab]');
    if (!tab) return;
    stop(); select(tabs.indexOf(tab));
  });
  tablist.addEventListener('keydown', event => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if (!(event.key in keys)) return;
    event.preventDefault(); stop();
    const step = keys[event.key];
    select(step === 'first' ? 0 : step === 'last' ? tabs.length - 1 : (current() + step + tabs.length) % tabs.length);
  });
  document.querySelector('.sl-window')?.addEventListener('pointerenter', stop, { once: true });
}

// Count-up for the stats band.
const counters = [...document.querySelectorAll('[data-count]')];
if (!reduced && 'IntersectionObserver' in window && counters.length) {
  const run = node => {
    const target = Number(node.dataset.count), suffix = node.dataset.suffix || '', start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / 1100), eased = 1 - (1 - t) ** 3;
      node.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Frames pause in hidden tabs; always settle on the real value.
    setTimeout(() => { node.textContent = target + suffix; }, 1300);
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { run(entry.target); observer.unobserve(entry.target); }
  }, { threshold: 0.6 });
  counters.forEach(node => observer.observe(node));
}

// Pointer spotlight on tool cards.
if (!reduced) {
  document.querySelector('.sl-tool-grid')?.addEventListener('pointermove', event => {
    const card = event.target.closest('.sl-tool');
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', event.clientX - box.left + 'px');
    card.style.setProperty('--my', event.clientY - box.top + 'px');
  });
}


// Hero feed: every few seconds the oldest card in the visible feed moves to the top and
// slides in, like a live opportunities feed. Pauses on hover and in hidden tabs.
const feeds = [...document.querySelectorAll('[data-feed]')];
if (!reduced && feeds.length) {
  let paused = false;
  const stage = document.querySelector('.sl-window');
  stage?.addEventListener('pointerenter', () => { paused = true; });
  stage?.addEventListener('pointerleave', () => { paused = false; });
  setInterval(() => {
    if (paused || document.hidden) return;
    const feed = feeds.find(node => !node.closest('[hidden]'));
    if (!feed || feed.children.length < 2) return;
    const card = feed.lastElementChild;
    // Restart only the moving card's slide-in; other cards keep their current state.
    card.classList.remove('is-new');
    void card.offsetWidth;
    feed.prepend(card);
    card.classList.add('is-new');
  }, 3200);
}

// FAQ: answers ease open and closed, and opening one question closes the others.
const faqs = [...document.querySelectorAll('.sl-faq-list details')];
const faqEase = 'cubic-bezier(.2,.7,.2,1)';
function setFaq(item, open) {
  const answer = item.querySelector('.sl-faq-answer');
  if (!answer || reduced || typeof answer.animate !== 'function') { item.open = open; return; }
  item.faqAnimation?.cancel();
  if (open) item.open = true;
  const full = answer.scrollHeight;
  item.faqAnimation = answer.animate(
    open ? [{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: full + 'px', opacity: 1, transform: 'none' }]
         : [{ height: full + 'px', opacity: 1, transform: 'none' }, { height: '0px', opacity: 0, transform: 'translateY(-6px)' }],
    { duration: open ? 360 : 260, easing: faqEase });
  item.faqAnimation.onfinish = () => { if (!open) item.open = false; item.faqAnimation = null; };
}
for (const item of faqs) {
  item.querySelector('summary')?.addEventListener('click', event => {
    event.preventDefault();
    const opening = !item.open || item.faqAnimation?.effect?.getKeyframes?.().at(-1)?.height === '0px';
    if (opening) faqs.filter(other => other !== item && other.open).forEach(other => setFaq(other, false));
    setFaq(item, opening);
  });
}

// Scroll-triggered widget effects: bars, calendar tiles and score rows animate only once the
// widget is properly on screen (a third of it visible), never while it is still below the fold.
const playables = [...document.querySelectorAll('[data-play]')];
if (!reduced && 'IntersectionObserver' in window) {
  const player = new IntersectionObserver(entries => {
    for (const entry of entries) {
      // Tall widgets on short screens may never reach 35%, so filling 40% of the view counts too.
      if (!entry.isIntersecting || (entry.intersectionRatio < 0.35 && entry.intersectionRect.height < innerHeight * 0.4)) continue;
      entry.target.classList.add('is-playing');
      player.unobserve(entry.target);
    }
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.35, 0.5] });
  playables.forEach(node => player.observe(node));
} else {
  playables.forEach(node => node.classList.add('is-playing'));
}
