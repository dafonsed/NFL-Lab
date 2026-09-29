import { HELP_COLLECTIONS, HELP_ARTICLES } from './help-center-catalog.mjs';
import { escapeHelp as esc, renderHelpResults } from '../public/help-search.js';

const glyphs = {
  start: '<path d="m8 4 12 8-12 8V4Z"/><path d="M4 4v16"/>',
  research: '<path d="m4 19 5-6 4 3 7-11M16 5h4v4"/><path d="M4 4v16h16"/>',
  updates: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  account: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  ev: '<path d="M4 18V9M10 18V5M16 18v-6M22 18V3M2 22h22"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  article: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  ticket: '<path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7Z"/><path d="M15 7v3m0 4v5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.article}</svg>`;
const tones = ['sky','coral','lilac','lime','amber'];
const searchIndex = HELP_ARTICLES.map(article => ({
  slug: article.slug, title: article.title, summary: article.summary,
  collectionTitle: HELP_COLLECTIONS.find(collection=>collection.id===article.collectionId)?.title || '',
  searchText: article.sections.flatMap(section=>[section.heading,...(section.paragraphs||[]),...(section.steps||[]),...(section.links||[]).map(link=>link.label)]).join(' ')
}));

function collectionIcon(collection) {
  return `<span class="help-collection-icon" data-help-tone="${tones[HELP_COLLECTIONS.indexOf(collection)%tones.length]}">${icon(collection.icon)}</span>`;
}
function articleRows(articles, basePath) {
  return `<div class="help-article-list">${articles.map(article=>`<a class="help-article-row" href="${basePath}/articles/${encodeURIComponent(article.slug)}">${icon('article')}<div><h2>${esc(article.title)}</h2><p>${esc(article.summary)}</p></div><span class="help-row-arrow" aria-hidden="true">›</span></a>`).join('')}</div>`;
}
function breadcrumbs(items) {
  return `<nav class="help-breadcrumb" aria-label="Breadcrumb"><ol>${items.map(item=>`<li>${item.href?`<a href="${item.href}">${esc(item.label)}</a>`:`<span aria-current="page">${esc(item.label)}</span>`}</li>`).join('')}</ol></nav>`;
}
function homepage(basePath) {
  return `<div class="help-section-heading"><h2>Browse by topic</h2><p>${HELP_ARTICLES.length} guides to help you get more from your workspace</p></div><div class="help-collections">${HELP_COLLECTIONS.map(collection=>`<a class="help-collection" href="${basePath}/collections/${encodeURIComponent(collection.id)}">${collectionIcon(collection)}<h2>${esc(collection.title)}</h2><p>${esc(collection.description)}</p><div class="help-card-meta"><span>VisualOdds guides</span><span>${collection.articles.length} articles</span></div><span class="help-card-arrow" aria-hidden="true">${icon('arrow')}</span></a>`).join('')}</div>`;
}
function collectionPage(collection, basePath) {
  return `${breadcrumbs([{label:'All collections',href:basePath||'/'},{label:collection.title}])}<header class="help-collection-heading">${collectionIcon(collection)}<h1>${esc(collection.title)}</h1><p>${esc(collection.description)}</p><div class="help-card-meta"><span>VisualOdds guides</span><span>${collection.articles.length} articles</span></div></header>${articleRows(collection.articles,basePath)}`;
}
function articlePage(article, collection, basePath, appOrigin, ticketHref) {
  const body = section => `${(section.paragraphs||[]).map(text=>`<p>${esc(text)}</p>`).join('')}${section.steps?.length?`<ol>${section.steps.map(text=>`<li>${esc(text)}</li>`).join('')}</ol>`:''}${section.links?.length?`<div class="help-inline-links">${section.links.map(link=>`<a href="${esc(appOrigin+link.href)}">${esc(link.label)} ${icon('arrow')}</a>`).join('')}</div>`:''}`;
  const minutes = Math.max(1,Math.ceil(searchIndex.find(row=>row.slug===article.slug).searchText.split(/\s+/).length/220));
  const related = (article.related?.length ? article.related.map(slug=>HELP_ARTICLES.find(item=>item.slug===slug)).filter(Boolean) : collection.articles.filter(item=>item.slug!==article.slug)).slice(0,3);
  return `${breadcrumbs([{label:'All collections',href:basePath||'/'},{label:collection.title,href:`${basePath}/collections/${collection.id}`},{label:article.title}])}<div class="help-reading-layout"><article class="help-article"><header class="help-article-header"><h1>${esc(article.title)}</h1><p>${esc(article.summary)}</p><div class="help-article-meta"><span>VisualOdds guides</span><span>${minutes} min read</span></div></header><div class="help-article-body">${article.sections.map((section,index)=>`<section id="section-${index+1}"><h2>${esc(section.heading)}</h2>${body(section)}</section>`).join('')}</div><div class="help-article-support"><p>Need help with your specific situation?</p><a href="${esc(ticketHref)}">Submit a ticket ${icon('arrow')}</a></div></article><aside class="help-toc"><nav aria-label="On this page"><h2>On this page</h2>${article.sections.map((section,index)=>`<a href="#section-${index+1}">${esc(section.heading)}</a>`).join('')}</nav></aside></div>${related.length?`<section class="help-related"><h2>Related articles</h2><div class="help-related-links">${articleRows(related,basePath)}</div></section>`:''}`;
}

export function renderHelpCenterPage(url, { basePath = '/help', appOrigin = '' } = {}) {
  if (!['','/help'].includes(basePath)) return null;
  if (appOrigin) {
    try { const origin = new URL(appOrigin); if (!['https:','http:'].includes(origin.protocol) || origin.username || origin.password) return null; appOrigin=origin.origin; } catch { return null; }
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (basePath && path!==basePath && !path.startsWith(basePath+'/')) return null;
  const route = (basePath ? path.slice(basePath.length) : path) || '/';
  let collection, article, content, title='VisualOdds Help Center', description='Guides for VisualOdds research, odds, bet tracking, your account, and support.';
  const ticketHref = `${appOrigin}/support#new-report`;
  if (route==='/') content=homepage(basePath);
  else {
    const collectionMatch=/^\/collections\/([a-z0-9-]+)$/.exec(route), articleMatch=/^\/articles\/([a-z0-9-]+)$/.exec(route);
    if (collectionMatch) {
      collection=HELP_COLLECTIONS.find(item=>item.id===collectionMatch[1]); if(!collection)return null;
      title=`${collection.title} · VisualOdds Help`; description=collection.description; content=collectionPage(collection,basePath);
    } else if(articleMatch) {
      article=HELP_ARTICLES.find(item=>item.slug===articleMatch[1]); if(!article)return null;
      collection=HELP_COLLECTIONS.find(item=>item.id===article.collectionId);
      title=`${article.title} · VisualOdds Help`; description=article.summary; content=articlePage(article,collection,basePath,appOrigin,ticketHref);
    } else return null;
  }
  const query=String(url.searchParams.get('q')||'').trim().slice(0,120), isHome=route==='/', home=basePath||'/';
  if(query)title='Search results · VisualOdds Help';
  const data=JSON.stringify({articles:searchIndex,articleBase:`${basePath}/articles`,ticketHref}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050607"><title>${esc(title)}</title><meta name="description" content="${esc(description)}">${query?'<meta name="robots" content="noindex,follow">':''}<link rel="icon" href="/favicon.svg"><link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/help.css"><script type="module" src="/help.js"></script><link rel="stylesheet" href="/content-2026.css?v=1"></head><body class="help-page"><a class="help-skip" href="#help-main">Skip to help articles</a><header class="help-header${isHome?'':' compact'}"><div class="help-wrap"><div class="help-header-row"><a class="help-brand" href="${home}" aria-label="VisualOdds Help Center"><img src="/favicon.svg" alt="" width="38" height="38"><span><strong>Visual<span>Odds</span></strong><small>Help center</small></span></a><nav class="help-header-actions" aria-label="Help navigation"><a class="help-app-link" href="${esc(appOrigin+'/')}">Back to VisualOdds</a><a class="help-button" href="${esc(ticketHref)}">${icon('ticket')}Submit a ticket</a></nav></div>${isHome?'<div class="help-hero"><h1>How can we help?</h1><p>Learn the tools, understand your data, and find your next step.</p></div>':''}<form id="help-search" class="help-search" action="${home}" method="get" role="search"><label class="help-sr-only" for="help-search-input">Search help articles</label>${icon('search')}<input type="search" id="help-search-input" name="q" placeholder="Search for articles…" value="${esc(query)}" maxlength="120" autocomplete="off"><button type="button" class="help-search-clear" aria-label="Clear search"${query?'':' hidden'}>×</button><button type="submit" class="help-search-submit">Search</button></form><p class="help-search-hint">Find answers about research, your account, and using VisualOdds.</p></div></header><main id="help-main" class="help-main help-wrap" tabindex="-1"><div id="help-browse"${query?' hidden':''}>${content}</div><div id="help-results"${query?'':' hidden'}>${query?renderHelpResults(searchIndex,query,{articleBase:`${basePath}/articles`,ticketHref}):''}</div><p id="help-search-status" class="help-sr-only" role="status" aria-live="polite"></p><aside class="help-contact"><div><h2>Still need a hand?</h2><p>Tell us what’s happening. You can follow your ticket in your account.</p></div><div class="help-contact-actions"><a class="help-button" href="${esc(ticketHref)}">Submit a ticket</a><a href="${esc(appOrigin+'/support#reports')}">View my tickets</a></div></aside></main><footer class="help-footer"><div class="help-wrap"><a class="help-brand" href="${home}"><img src="/favicon.svg" alt="" width="28" height="28"><strong>Visual<span>Odds</span></strong></a><p>A little clarity goes a long way.</p><nav aria-label="Footer"><a href="${esc(appOrigin+'/')}">VisualOdds home</a><a href="${esc(appOrigin+'/account')}">My account</a><a href="${esc(appOrigin+'/support#reports')}">My tickets</a></nav></div></footer><script type="application/json" id="help-search-data">${data}</script></body></html>`;
}
