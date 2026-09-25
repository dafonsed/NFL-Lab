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

export function prepareLongformContent(content, articleSlug) {
  let index = 0;
  const usedIds = new Set();
  const withIds = content
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
    ? `<nav class="longform-toc" aria-label="On this page"><h2>On this page</h2><ol>${entries.map(entry => `<li><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</a></li>`).join('')}</ol><p class="longform-toc-meta">${minutes} min read <span aria-hidden="true">·</span> about ${wordCount.toLocaleString('en-US')} words</p></nav>`
    : '';
  return {
    html: `<div class="longform-layout" data-article-slug="${escapeHtml(articleSlug)}">${toc}<div class="longform-copy" itemprop="articleBody">${withIds}</div></div>`,
    wordCount,
    minutes,
  };
}

export function readingTimeLabel(minutes) {
  return `${minutes} min read`;
}
