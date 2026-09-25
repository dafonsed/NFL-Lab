const toc = document.querySelector('.longform-toc');
if (toc && 'IntersectionObserver' in window) {
  const links = [...toc.querySelectorAll('[data-toc-link]')];
  const sections = links
    .map(link => {
      const id = decodeURIComponent(link.hash.slice(1));
      return { link, section: document.getElementById(id) };
    })
    .filter(item => item.section);

  const setActive = id => {
    for (const { link, section } of sections) {
      const active = section.id === id;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  const observer = new IntersectionObserver(entries => {
    const current = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (current) setActive(current.target.id);
  }, { rootMargin: '-105px 0px -72% 0px', threshold: 0 });

  for (const { section } of sections) observer.observe(section);
  if (sections.length) setActive(sections[0].section.id);
}

