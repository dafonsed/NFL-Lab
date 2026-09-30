import { artStyle } from './editorial-art.mjs';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const plainText = html => html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;|&#39;|&apos;/gi, ' ')
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const slugify = value => plainText(value)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'section';

export function artworkForSlug(value, diversify = false) {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const options = ['odds', 'probability', 'comparison', 'calculator'];
  const seed = [...slug].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  if (diversify) return options[seed % options.length];
  if (/probab|implied|fair-odds|decimal-odds|fractional-odds|american-odds|moneyline|spread|total-over/.test(slug)) return 'probability';
  if (/calculator|bankroll|arbitrage|hedge|kelly|payout|return|variance/.test(slug)) return 'calculator';
  if (/sportsbook|sports-betting|market|comparison|alternative|state|province|line-movement|closing-line|no-vig|vig|juice/.test(slug)) return 'comparison';
  return options[seed % options.length];
}

// `artType` (guide, state, sportsbook, calculator, tool) gives the card that page's own illustration.
export function renderRelatedCard({ href, slug, category, title, description, meta, artType = '' }) {
  const art = artworkForSlug(slug, true);
  return `<li><a class="related-card" href="${escapeHtml(href)}"><span class="related-card-art longform-art--${art}"${artType ? ` style="${artStyle(artType, slug)}"` : ''} role="img" aria-label="Editorial illustration for ${escapeHtml(title)}"></span><span class="related-card-copy"><span class="related-card-category">${escapeHtml(category)}</span><strong>${escapeHtml(title)}</strong><span class="related-card-excerpt">${escapeHtml(description)}</span><span class="related-card-meta">${escapeHtml(meta)}</span></span></a></li>`;
}

function formatArticleFaqs(content) {
  return content.replace(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi, (section, attributes, body) => {
    const heading = body.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!heading || !/^(?:Frequently asked questions|FAQs?)\b/i.test(plainText(heading[1])) || /<details\b/i.test(body)) return section;
    if (!/<h3\b/i.test(body)) return section;
    const formatted = body.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi,
      (_, question, answer) => `<details><summary>${question}</summary>${answer}</details>`);
    const classes = attributes.match(/\bclass="([^"]*)"/i);
    if (!classes) attributes += ' class="faq"';
    else if (!classes[1].split(/\s+/).includes('faq')) attributes = attributes.replace(classes[0], `class="${classes[1]} faq"`);
    return `<section${attributes}>${formatted}</section>`;
  });
}

export function prepareLongformContent(content, articleSlug, title = articleSlug, { cover = true, artType = '' } = {}) {
  let index = 0;
  const usedIds = new Set();
  const withIds = formatArticleFaqs(content)
    .replace(/<nav\b[^>]*class="[^"]*market-contents[^"]*"[\s\S]*?<\/nav>/gi, '')
    .replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, (heading, attributes, inner) => {
      const existing = attributes.match(/\bid=["']([^"']+)["']/i);
      const base = existing?.[1] || slugify(inner);
      let id = base;
      while (usedIds.has(id)) id = `${base}-${++index}`;
      usedIds.add(id);
      if (existing) return heading.replace(existing[0], `id="${escapeHtml(id)}"`);
      return `<h2${attributes} id="${escapeHtml(id)}">${inner}</h2>`;
    });
  const entries = [...withIds.matchAll(/<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map(([, id, heading]) => ({ id, label: plainText(heading) }))
    .filter(entry => entry.label);
  const text = plainText(withIds);
  const wordCount = (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  const toc = entries.length > 1
    ? `<nav class="longform-toc" aria-label="On this page"><h2>On this page</h2><ol>${entries.map(entry => `<li><a href="#${escapeHtml(entry.id)}" data-toc-link>${escapeHtml(entry.label)}</a></li>`).join('')}</ol></nav>`
    : '';
  const art = artworkForSlug(`${articleSlug} ${title}`);
  const coverHtml = cover ? `<figure class="longform-cover longform-art--${art}"${artType ? ` style="${artStyle(artType, articleSlug)}"` : ''} role="img" aria-label="Editorial illustration for ${escapeHtml(title)}"></figure>` : '';
  return {
    html: `<div class="longform-layout${cover ? '' : ' longform-layout--no-cover'}" data-article-slug="${escapeHtml(articleSlug)}">${toc}${coverHtml}<div class="longform-copy" itemprop="articleBody">${withIds}</div></div>`,
    wordCount,
    minutes,
  };
}

export function readingTimeLabel(minutes) {
  return `${minutes} min read`;
}
