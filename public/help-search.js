export const escapeHelp = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalized = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchHelp(articles, query) {
  const terms = [...new Set(normalized(query).trim().slice(0, 120).split(/\s+/).filter(Boolean))];
  if (!terms.length) return [];
  return articles.map((article, order) => {
    const title = normalized(article.title), summary = normalized(article.summary), collection = normalized(article.collectionTitle), body = normalized(article.searchText);
    if (!terms.every(term => `${title} ${summary} ${collection} ${body}`.includes(term))) return null;
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 12 : 0) + (summary.includes(term) ? 5 : 0) + (collection.includes(term) ? 2 : 0) + (body.includes(term) ? 1 : 0), 0);
    return { article, score, order };
  }).filter(Boolean).sort((a,b) => b.score-a.score || a.order-b.order).map(row => row.article);
}

export function renderHelpResults(articles, query, { articleBase = '/help/articles', ticketHref = '/support#new-report' } = {}) {
  const clean = String(query).trim().slice(0,120), results = searchHelp(articles, clean);
  return `<div class="help-results-heading"><h1>Search results</h1><p>${results.length} ${results.length === 1 ? 'article' : 'articles'} for “${escapeHelp(clean)}”</p></div>${results.length ? `<div class="help-article-list">${results.map(article=>`<a class="help-article-row" href="${escapeHelp(articleBase)}/${encodeURIComponent(article.slug)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></svg><div><span class="help-result-meta">${escapeHelp(article.collectionTitle)}</span><h2>${escapeHelp(article.title)}</h2><p>${escapeHelp(article.summary)}</p></div><span class="help-row-arrow" aria-hidden="true">›</span></a>`).join('')}</div>` : `<div class="help-empty"><h2>No articles found</h2><p>Try a shorter phrase, like “password”, “filters”, or “billing”. You can also send us a support ticket.</p><a class="help-button" href="${escapeHelp(ticketHref)}">Submit a ticket</a></div>`}`;
}
