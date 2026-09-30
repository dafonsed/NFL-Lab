// The VisualOdds API reference (/odds-api and /odds-api/<slug>): a docs layout with a section
// sidebar, the page in the middle, and a request panel (language tabs, request, Try it, response).
import { siteHeader, siteFooter, siteChromeAssets } from './site-chrome.mjs';
import { ACCESS, API_GROUPS, API_PAGES, apiPage, apiPagePath } from './api-reference.mjs';
import { LANGUAGES, highlight, snippet } from '../public/api-reference-code.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
// Inline formatting for reference copy: `code` and **bold**.
const inline = value => esc(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const json = value => JSON.stringify(value, null, 2);
const ICON = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};
const LANG_ICON = {
  shell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 5 5-5 5M12 17h7"/></svg>',
  node: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4Z"/><path d="M12 8v8"/></svg>',
  python: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-4 0-4 1.6-4 3v2h4.5v1H6c-2 0-3 1.4-3 4s1 4 3 4h2v-2.5c0-1.4 1.2-2.5 2.5-2.5h4c1.4 0 2.5-1.1 2.5-2.5V6c0-1.6-1.8-3-5-3Z"/><path d="M12 21c4 0 4-1.6 4-3v-2h-4.5v-1H18c2 0 3-1.4 3-4"/></svg>',
  browser: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>',
};
const methodBadge = method => `<span class="apiref-method apiref-method--${esc(method.toLowerCase())}">${esc(method === 'DELETE' ? 'DEL' : method)}</span>`;

function sidebar(current) {
  const groups = API_GROUPS.map(group => {
    const links = API_PAGES.filter(page => page.group === group.id).map(page => `<li><a href="${esc(apiPagePath(page))}" data-filter-text="${esc(`${page.title} ${page.path || ''}`.toLowerCase())}"${page === current ? ' aria-current="page"' : ''}><span>${esc(page.nav || page.title)}</span>${page.method ? methodBadge(page.method) : ''}</a></li>`).join('');
    return `<div class="apiref-nav-group"><h2>${esc(group.label)}</h2><ul>${links}</ul></div>`;
  }).join('');
  return `<aside class="apiref-side" id="apiref-side" aria-label="API reference">
    <label class="apiref-filter">${ICON.search}<span class="sr-only">Filter pages</span><input type="search" id="apiref-filter" placeholder="Filter" autocomplete="off"><kbd>/</kbd></label>
    <nav>${groups}<p class="apiref-filter-empty" id="apiref-filter-empty" hidden>No pages match.</p></nav>
  </aside>`;
}

function codeBlock(code, language, { label = '', copy = true } = {}) {
  return `<div class="apiref-code">${label || copy ? `<div class="apiref-code-head"><span>${esc(label)}</span>${copy ? `<button type="button" class="apiref-copy" data-copy>${ICON.copy}<span>Copy</span></button>` : ''}</div>` : ''}<pre><code data-lang="${esc(language)}">${highlight(language, code)}</code></pre></div>`;
}

function guideBody(page) {
  return page.sections.map(section => {
    const parts = [`<h2 id="${esc(section.id)}"><a href="#${esc(section.id)}">${esc(section.title)}</a></h2>`];
    for (const paragraph of section.body || []) parts.push(`<p>${inline(paragraph)}</p>`);
    if (section.table) {
      const [head, ...rows] = section.table;
      parts.push(`<div class="apiref-table-wrap"><table class="apiref-table"><thead><tr>${head.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    }
    if (section.steps) parts.push(`<ol class="apiref-steps">${section.steps.map(([slug, title, text]) => { const target = apiPage(slug); return `<li><a href="${esc(apiPagePath(target))}"><span class="apiref-step-top"><strong>${esc(title)}</strong>${target?.method ? methodBadge(target.method) : ''}</span><small>${esc(text)}</small><code>${esc(target?.path || '')}</code></a></li>`; }).join('')}</ol>`);
    if (section.code) parts.push(codeBlock(section.code, section.code.trim().startsWith('{') ? 'json' : 'shell', { label: section.code.trim().startsWith('{') ? 'JSON' : section.code.startsWith('curl') ? 'Shell' : 'Base URL' }));
    return `<section class="apiref-section" aria-labelledby="${esc(section.id)}">${parts.join('')}</section>`;
  }).join('');
}

function paramRows(params) {
  return params.map(param => {
    const id = `param-${param.name}`;
    const control = param.values
      ? `<select id="${id}" data-param="${esc(param.name)}"><option value="">${param.required ? 'Choose…' : 'Default'}</option>${param.values.map(value => `<option${value === param.example ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select>`
      : `<input id="${id}" data-param="${esc(param.name)}" value="${esc(param.example || '')}" placeholder="${esc(param.placeholder || '')}" spellcheck="false" autocomplete="off"${param.type === 'integer' ? ' inputmode="numeric"' : ''}>`;
    return `<div class="apiref-param"><div class="apiref-param-info"><div class="apiref-param-name"><label for="${id}"><code>${esc(param.name)}</code></label><span class="apiref-param-type">${esc(param.type)}${param.format ? ` · ${esc(param.format)}` : ''}</span>${param.required ? '<span class="apiref-param-req">required</span>' : ''}</div><p>${inline(param.description)}</p>${param.values && param.values.length > 4 ? `<p class="apiref-param-values">Allowed: ${param.values.map(value => `<code>${esc(value)}</code>`).join(' ')}</p>` : ''}</div><div class="apiref-param-control">${control}</div></div>`;
  }).join('');
}

function endpointBody(page, base) {
  const access = ACCESS[page.access];
  const pathParams = (page.params || []).filter(param => param.in === 'path');
  const queryParams = (page.params || []).filter(param => param.in !== 'path');
  return `<div class="apiref-endpoint-url">${methodBadge(page.method)}<code>${esc(base)}${esc(page.path)}</code></div>
    <p class="apiref-lede">${inline(page.summary)}</p>
    <p class="apiref-access apiref-access--${esc(page.access)}">${ICON.lock}<strong>${esc(access.label)}</strong><span>${esc(access.note)}</span></p>
    <section class="apiref-section" aria-labelledby="description"><h2 id="description"><a href="#description">Description</a></h2>${page.description.map(text => `<p>${inline(text)}</p>`).join('')}${page.pathSport ? `<p class="apiref-variants">Also available: ${page.pathSport.filter(sport => sport !== 'nfl').map(sport => `<code>GET /api/${sport}/live</code>`).join(' ')}</p>` : ''}</section>
    ${pathParams.length ? `<section class="apiref-section" aria-labelledby="path-params"><h2 id="path-params"><a href="#path-params">Path parameters</a></h2><div class="apiref-params">${paramRows(pathParams)}</div></section>` : ''}
    ${queryParams.length ? `<section class="apiref-section" aria-labelledby="query-params"><h2 id="query-params"><a href="#query-params">Query parameters</a></h2><div class="apiref-params">${paramRows(queryParams)}</div></section>` : ''}
    ${!pathParams.length && !queryParams.length ? '<section class="apiref-section" aria-labelledby="params"><h2 id="params"><a href="#params">Parameters</a></h2><p class="apiref-muted">This route takes no parameters.</p></section>' : ''}
    ${page.body ? `<section class="apiref-section" aria-labelledby="body"><h2 id="body"><a href="#body">Body</a></h2><p>A JSON array of quotes.</p>${codeBlock(json(page.body), 'json', { label: 'application/json' })}</section>` : ''}
    <section class="apiref-section" aria-labelledby="responses"><h2 id="responses"><a href="#responses">Responses</a></h2><ul class="apiref-responses">${page.responses.map(([status, text], index) => `<li><button type="button" data-example="${index}" aria-pressed="${index === 0}"><span class="apiref-status apiref-status--${esc(status[0])}">${esc(status)}</span><span>${inline(text)}</span>${ICON.arrow}</button></li>`).join('')}</ul></section>`;
}

function requestPanel(page, base) {
  const values = Object.fromEntries((page.params || []).map(param => [param.name, param.example || '']));
  const canTry = page.method === 'GET';
  const tabs = LANGUAGES.map((lang, index) => `<button type="button" role="tab" data-lang="${lang.id}" aria-selected="${index === 0}">${LANG_ICON[lang.id]}<span>${esc(lang.label)}</span></button>`).join('');
  const [status, text, example] = page.responses[0];
  return `<aside class="apiref-panel" aria-label="Try this request">
    <div class="apiref-panel-block"><p class="apiref-panel-label">Language</p><div class="apiref-langs" role="tablist" aria-label="Code language">${tabs}</div></div>
    <div class="apiref-panel-block"><p class="apiref-panel-label">Credentials</p><div class="apiref-cred"><span class="apiref-cred-kind">Session</span><span class="apiref-cred-value" id="apiref-cred">Your VisualOdds sign-in</span><span class="apiref-cred-soon">API keys soon</span></div></div>
    <div class="apiref-request">
      <div class="apiref-code-head"><span id="apiref-lang-file">${esc(LANGUAGES[0].file)}</span><button type="button" class="apiref-copy" data-copy>${ICON.copy}<span>Copy</span></button></div>
      <pre><code id="apiref-snippet" data-lang="shell">${highlight('shell', snippet('shell', page, values, base))}</code></pre>
      <div class="apiref-request-foot"><span class="apiref-request-note">${canTry ? 'Sends from your browser with your session.' : `${esc(page.method)} requests can’t be sent from the docs.`}</span><button type="button" class="apiref-try" id="apiref-try"${canTry ? '' : ' disabled'}>Try it!</button></div>
    </div>
    <div class="apiref-response" aria-live="polite">
      <div class="apiref-code-head"><span>Response</span><span class="apiref-response-meta" id="apiref-response-meta"></span></div>
      <p class="apiref-response-hint" id="apiref-response-hint">Click <b>Try it!</b> to send a request and see the response here, or choose an example:</p>
      <div class="apiref-examples" role="group" aria-label="Example responses">${page.responses.map(([code], index) => `<button type="button" data-example="${index}" aria-pressed="${index === 0}"><span class="apiref-status apiref-status--${esc(code[0])}">${esc(code)}</span></button>`).join('')}</div>
      <pre class="apiref-response-body"><code id="apiref-response-body" data-lang="json">${highlight('json', json(example))}</code></pre>
      <p class="apiref-response-caption" id="apiref-response-caption">${esc(status)} · ${inline(text)} Example values.</p>
    </div>
  </aside>`;
}

function tocPanel(page) {
  return `<aside class="apiref-panel apiref-toc" aria-label="On this page"><p class="apiref-panel-label">On this page</p><ul>${page.sections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ul>
    <div class="apiref-toc-card"><strong>Need a hand?</strong><p>Questions about the API or access for your team?</p><a href="/contact">Contact us ${ICON.arrow}</a></div></aside>`;
}

function pager(page) {
  const index = API_PAGES.indexOf(page);
  const prev = API_PAGES[index - 1];
  const next = API_PAGES[index + 1];
  const link = (target, dir) => target ? `<a class="apiref-pager-${dir}" href="${esc(apiPagePath(target))}"><small>${dir === 'prev' ? 'Previous' : 'Next'}</small><span>${dir === 'prev' ? ICON.back : ''}${esc(target.title)}${dir === 'next' ? ICON.arrow : ''}</span></a>` : '<span></span>';
  return `<nav class="apiref-pager" aria-label="Previous and next pages">${link(prev, 'prev')}${link(next, 'next')}</nav>`;
}

/** Renders one API reference page; `slug` '' is Getting started. Returns null for unknown pages. */
export function renderOddsApiPage(origin = 'https://visualodds.com', slug = '') {
  const page = apiPage(slug);
  if (!page) return null;
  const base = String(origin).replace(/\/+$/, '');
  const canonical = `${base}${apiPagePath(page)}`;
  const title = page.slug ? `${page.title} · API reference | VisualOdds` : 'Sports Betting Data API | VisualOdds';
  const description = page.kind === 'endpoint' ? `${page.method} ${page.path}: ${page.summary}` : page.lede.replace(/`/g, '');
  const schema = { '@context': 'https://schema.org', '@type': page.kind === 'endpoint' ? 'TechArticle' : 'WebPage', name: title, description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'VisualOdds', url: base } };
  const data = page.kind === 'endpoint' ? { method: page.method, path: page.path, params: page.params || [], body: page.body || null, base, responses: page.responses.map(([status, text, example]) => ({ status, text, example })) } : null;
  const heading = page.kind === 'endpoint' ? page.title : page.title;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#07090b">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="VisualOdds">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="https://visualodds.com/assets/og/visualodds.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/odds-api.css?v=2">
  ${siteChromeAssets()}
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
</head>
<body class="apiref-page">
  <a class="apiref-skip" href="#main">Skip to content</a>
  ${siteHeader({ current: 'api' })}
  <div class="apiref-bar"><div class="apiref-bar-inner">
    <button type="button" class="apiref-menu" id="apiref-menu" aria-controls="apiref-side" aria-expanded="false">${ICON.menu}<span>Menu</span></button>
    <nav aria-label="Developer sections"><a href="/odds-api" aria-current="page">API reference</a><a href="/docs">Guides</a><a href="/changelog">Changelog</a><a href="/status">Status</a></nav>
    <span class="apiref-version">v1 · preview</span>
  </div></div>
  <div class="apiref-layout${page.kind === 'endpoint' ? ' is-endpoint' : ''}">
    ${sidebar(page)}
    <main id="main" class="apiref-main">
      <article class="apiref-article">
        <p class="apiref-crumb">${esc(API_GROUPS.find(group => group.id === page.group).label)}</p>
        <h1>${esc(heading)}</h1>
        ${page.kind === 'endpoint' ? endpointBody(page, base) : `<p class="apiref-lede">${inline(page.lede)}</p>${guideBody(page)}`}
      </article>
      ${pager(page)}
    </main>
    ${page.kind === 'endpoint' ? requestPanel(page, base) : tocPanel(page)}
  </div>
  ${siteFooter()}
  ${data ? `<script type="application/json" id="apiref-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}
  <script type="module" src="/odds-api.js?v=1"></script>
</body>
</html>`;
}
