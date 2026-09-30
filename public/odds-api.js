// API reference: sidebar filter, mobile menu, copy buttons, language tabs, live parameters,
// Try it (same-origin request with the visitor's session) and example responses.
import { LANGUAGES, highlight, requestUrl, snippet } from './api-reference-code.js?v=1';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

// Sidebar filter
const filter = $('#apiref-filter');
filter?.addEventListener('input', () => {
  const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const group of $$('.apiref-nav-group')) {
    let groupShown = 0;
    for (const link of group.querySelectorAll('a')) {
      const match = words.every(word => link.dataset.filterText.includes(word));
      link.parentElement.hidden = !match;
      groupShown += match;
    }
    group.hidden = !groupShown;
    shown += groupShown;
  }
  $('#apiref-filter-empty').hidden = shown > 0;
});
addEventListener('keydown', event => {
  if (event.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) { event.preventDefault(); filter?.focus(); }
});

// Mobile menu
const menu = $('#apiref-menu');
const side = $('#apiref-side');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  side.classList.toggle('is-open', open);
});

// Copy buttons copy the code block they sit on.
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const code = button.closest('.apiref-code, .apiref-request')?.querySelector('code');
  if (!code) return;
  const label = button.querySelector('span');
  try { await navigator.clipboard.writeText(code.textContent); label.textContent = 'Copied'; }
  catch { label.textContent = 'Select to copy'; }
  setTimeout(() => { label.textContent = 'Copy'; }, 1600);
});

// Guide pages: highlight the section in view.
const tocLinks = $$('.apiref-toc a[href^="#"]');
if (tocLinks.length && 'IntersectionObserver' in window) {
  const byId = new Map(tocLinks.map(link => [link.getAttribute('href').slice(1), link]));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      tocLinks.forEach(link => link.classList.remove('is-active'));
      byId.get(entry.target.id)?.classList.add('is-active');
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  byId.forEach((link, id) => { const target = document.getElementById(id); if (target) observer.observe(target); });
}

// Endpoint pages
const dataNode = $('#apiref-data');
if (dataNode) {
  const page = JSON.parse(dataNode.textContent);
  const LANG_KEY = 'vo-api-lang';
  let language = LANGUAGES.some(lang => lang.id === localStorage.getItem(LANG_KEY)) ? localStorage.getItem(LANG_KEY) : 'shell';
  const values = () => Object.fromEntries($$('[data-param]').map(input => [input.dataset.param, input.value]));
  const code = $('#apiref-snippet');
  const render = () => {
    code.innerHTML = highlight(language, snippet(language, page, values(), page.base));
    code.dataset.lang = language;
    $('#apiref-lang-file').textContent = LANGUAGES.find(lang => lang.id === language).file;
    $$('[data-lang][role="tab"]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.lang === language)));
  };
  $('.apiref-langs').addEventListener('click', event => {
    const tab = event.target.closest('[data-lang]');
    if (!tab) return;
    language = tab.dataset.lang;
    try { localStorage.setItem(LANG_KEY, language); } catch {}
    render();
  });
  $$('[data-param]').forEach(input => input.addEventListener('input', render));
  render();

  const body = $('#apiref-response-body');
  const meta = $('#apiref-response-meta');
  const caption = $('#apiref-response-caption');
  const hint = $('#apiref-response-hint');
  const showExample = index => {
    const example = page.responses[index];
    body.innerHTML = highlight('json', JSON.stringify(example.example, null, 2));
    meta.textContent = '';
    caption.innerHTML = `${example.status} · ${example.text.replace(/[<>&]/g, '')} Example values.`;
    caption.hidden = false;
    $$('[data-example]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.example) === index)));
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-example]');
    if (!button) return;
    showExample(Number(button.dataset.example));
    if (button.closest('.apiref-responses') && matchMedia('(max-width: 1180px)').matches) $('.apiref-response').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const tryButton = $('#apiref-try');
  tryButton?.addEventListener('click', async () => {
    const missing = page.params.filter(param => param.required && !values()[param.name]);
    if (missing.length) { $(`#param-${missing[0].name}`)?.focus(); meta.innerHTML = `<span class="apiref-status apiref-status--4">Missing ${missing.map(param => param.name).join(', ')}</span>`; return; }
    tryButton.disabled = true; tryButton.textContent = 'Sending…';
    const started = performance.now();
    try {
      const response = await fetch(new URL(requestUrl(page, values()), location.origin), { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      const text = await response.text();
      const ms = Math.round(performance.now() - started);
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      const lines = pretty.split('\n');
      const clipped = lines.length > 400 ? `${lines.slice(0, 400).join('\n')}\n… ${lines.length - 400} more lines` : pretty;
      body.innerHTML = highlight('json', clipped);
      meta.innerHTML = `<span class="apiref-status apiref-status--${String(response.status)[0]}">${response.status}</span><span>${ms} ms</span>`;
      hint.hidden = true;
      caption.hidden = response.status !== 401;
      if (response.status === 401) caption.innerHTML = 'Sign in to send requests from the docs. <a href="/login?next=' + encodeURIComponent(location.pathname) + '">Sign in</a>';
      $$('[data-example]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    } catch {
      meta.innerHTML = '<span class="apiref-status apiref-status--5">Network error</span>';
    } finally {
      tryButton.disabled = false; tryButton.textContent = 'Try it!';
    }
  });
}
