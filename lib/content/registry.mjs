// The VisualOdds content library: one index of every public article, guide, calculator, tool,
// API page and help article. Each content family keeps its own long-form text and renderer;
// this registry is the single place that lists them, so the Learn library, the sitemap and
// search all read the same records.
import { educationArticles } from '../betting-education.mjs';
import { marketGuides } from '../online-sports-betting.mjs';
import { sportsbookGuideIndex } from '../online-sportsbook-guides.mjs';
import { bettingPageIndex } from '../betting-pages.mjs';
import { HELP_ARTICLES } from '../help-center-catalog.mjs';
import { API_PAGES, apiPagePath } from '../api-reference.mjs';

/** Content types, in the order the library shows them. */
export const CONTENT_TYPES = [
  { id: 'guide', label: 'Guides', description: 'Betting fundamentals, strategy and tutorials' },
  { id: 'state', label: 'State guides', description: 'Where online sports betting is legal' },
  { id: 'sportsbook', label: 'Sportsbooks', description: 'How each sportsbook and app works' },
  { id: 'calculator', label: 'Calculators', description: 'Free betting calculators' },
  { id: 'tool', label: 'Tools', description: 'Free betting tools' },
  { id: 'developer', label: 'API & docs', description: 'The VisualOdds API and documentation' },
  { id: 'help', label: 'Help', description: 'Using your VisualOdds account and tools' },
];

const record = (type, fields) => ({ type, category: '', updated: '2026-09-25', indexable: true, ...fields });

function build() {
  const items = [
    // The Beginner Guide: seven help-center lessons in order (/learn/beginner-guide).
    record('guide', { id: 'guide:beginner-guide', title: 'Beginner Guide: learn VisualOdds in 7 lessons', description: 'Seven short lessons, in order: research a player, compare prices, read +EV and arbitrage, filter trends and track your bets.', category: 'Tutorials', path: '/learn/beginner-guide' }),
    // Every education guide is listed; archived ones keep indexable:false (noindex, not in the sitemap).
    ...educationArticles.map(article => record('guide', {
      id: `guide:${article.slug}`, title: article.title, description: article.description, category: article.group,
      path: `/betting-education/${article.slug}`, indexable: article.indexable,
    })),
    ...marketGuides.map(guide => record('state', {
      id: `state:${guide.slug}`, title: `Online sports betting in ${guide.name}`,
      description: guide.note || `${guide.status}. ${guide.availability || ''}`.trim(), category: guide.status,
      path: `/online-sports-betting/${guide.slug}`,
    })),
    ...sportsbookGuideIndex.map(guide => record('sportsbook', {
      id: `sportsbook:${guide.slug}`, title: `${guide.name} guide`, description: guide.description, category: guide.group, path: guide.path,
    })),
    ...bettingPageIndex.map(page => record(page.type, {
      id: `${page.type}:${page.slug}`, title: page.title, description: page.description, path: page.path,
      category: page.type === 'calculator' ? 'Calculator' : 'Tool',
    })),
    record('developer', { id: 'developer:odds-api', title: 'Sports betting data API', description: 'Schedules, player research, model context and source receipts as JSON endpoints.', category: 'API', path: '/odds-api' }),
    // Each API reference page (guides and endpoints) after the overview.
    ...API_PAGES.filter(page => page.slug).map(page => record('developer', {
      id: `developer:api-${page.slug}`, title: page.method ? `${page.title} (${page.method} ${page.path})` : `API: ${page.title}`,
      description: page.summary || page.lede.replace(/`/g, ''), category: page.method ? 'API endpoint' : 'API guide', path: apiPagePath(page),
    })),
    // The docs page is noindex (it documents a local workbench), so it is listed but kept out of the sitemap.
    record('developer', { id: 'developer:docs', title: 'EV tools & API documentation', description: 'The EV workbench, its tools, the quote data contract and the EV API connection.', category: 'Docs', path: '/docs', indexable: false }),
    ...HELP_ARTICLES.map(article => record('help', {
      id: `help:${article.slug}`, title: article.title, description: article.summary, category: 'Help center', path: `/help/articles/${article.slug}`,
    })),
  ];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate content id ${item.id}`);
    seen.add(item.id);
  }
  return Object.freeze(items.map(Object.freeze));
}

export const contentLibrary = build();

export function contentByType(type) {
  return contentLibrary.filter(item => item.type === type);
}

/** Words must all appear in the title, description or category (case-insensitive). */
export function searchContent(query, { type = '' } = {}) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return contentLibrary.filter(item => (!type || item.type === type)
    && words.every(word => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(word)));
}

/** Hub and landing pages that sit above the library records. */
export const HUB_PATHS = ['/', '/learn', '/betting-education', '/online-sports-betting', '/online-sportsbooks', '/sportsbooks', '/betting-calculators', '/betting-tools', '/odds-api', '/about', '/contact', '/changelog', '/status'];

/** The whole public sitemap, built from the library: hubs plus every indexable record. */
export function renderContentSitemap(origin = 'https://visualodds.com') {
  const base = String(origin).replace(/\/+$/, '');
  const escXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls = [...HUB_PATHS.map(path => ({ path, updated: null })), ...contentLibrary.filter(item => item.indexable).map(item => ({ path: item.path, updated: item.updated }))];
  const seen = new Set();
  const rows = urls.filter(url => !seen.has(url.path) && seen.add(url.path)).map(url => `<url><loc>${escXml(base + url.path)}</loc>${url.updated ? `<lastmod>${url.updated}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join('')}</urlset>`;
}
