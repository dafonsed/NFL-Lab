// /learn: the one library page for every article, guide, calculator, tool, API page and help
// article, rendered from the content registry with the shared site chrome. /learn/beginner-guide
// is the seven-lesson Beginner Guide built from help-center articles.
import { CONTENT_TYPES, contentLibrary } from './content/registry.mjs';
import { HELP_ARTICLES } from './help-center-catalog.mjs';
import { BEGINNER_GUIDE_LESSONS, BEGINNER_GUIDE_PATH } from './beginner-guide.mjs';
import { siteHeader, siteFooter, siteChromeAssets } from './site-chrome.mjs';
import { artStyle } from './editorial-art.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TYPE_ICONS = {
  guide: '<path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3V5Zm14 3h2v11"/>',
  state: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  sportsbook: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  tool: '<path d="M14 7a4 4 0 0 1-5.3 5.3L4 17l3 3 4.7-4.7A4 4 0 0 1 17 10l3-3-3-3-3 3Z"/>',
  developer: '<path d="m9 8-4 4 4 4m6-8 4 4-4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
};
const ARROW = '<svg class="learn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const icon = type => `<svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICONS[type] || TYPE_ICONS.guide}</svg>`;
const typeLabel = Object.fromEntries(CONTENT_TYPES.map(type => [type.id, type.label]));
const CARD_CTA = { guide: 'Read guide', state: 'Read state guide', sportsbook: 'Read sportsbook guide', calculator: 'Open calculator', tool: 'Open tool', developer: 'Read the docs', help: 'Read article' };

// Card illustrations (public/assets/art/*.svg): topical where the title says what it is about,
// otherwise a stable pick from the family's set so neighbouring cards vary.
const ART_TOPICS = [
  [/arbitrage|arb\b|hedge|middle/, 'arbitrage'], [/track|record|result|bankroll|unit|export|clv|closing/, 'tracker'],
  [/parlay|ticket|slip|same.game|teaser/, 'ticket'], [/trend|prop|player|stat|model|project/, 'trends'],
  [/probab|implied|expected|ev\b|positive|variance|fair|no.vig|vig|kelly/, 'probability'], [/calculat|payout|convert|odds.format|return/, 'calculator'],
  [/compar|line.shop|screen|price|best.odds|movement/, 'comparison'],
];
const ART_SETS = { state: ['odds', 'comparison'], sportsbook: ['odds', 'ticket', 'comparison'], calculator: ['calculator'], tool: ['comparison', 'trends', 'calculator'], developer: ['trends', 'odds'] };
const ALL_ART = ['odds', 'probability', 'comparison', 'calculator', 'arbitrage', 'trends', 'ticket', 'tracker'];
const seed = text => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
export function artFor(item) {
  const set = ART_SETS[item.type];
  if (item.type === 'guide' || item.type === 'help' || item.type === 'tool') {
    const text = `${item.title} ${item.path}`.toLowerCase();
    const topic = ART_TOPICS.find(([pattern]) => pattern.test(text));
    if (topic) return topic[1];
  }
  const pool = set || ALL_ART;
  return pool[seed(item.id) % pool.length];
}

// The Beginner Guide: help-center articles in order, with read time and illustration.
export const BEGINNER_LESSONS = BEGINNER_GUIDE_LESSONS
  .map(({ slug, minutes, art }) => ({ article: HELP_ARTICLES.find(article => article.slug === slug), minutes, art })).filter(lesson => lesson.article);
const BEGINNER_MINUTES = BEGINNER_LESSONS.reduce((sum, lesson) => sum + lesson.minutes, 0);
const BEGINNER_PATH = BEGINNER_GUIDE_PATH;

function head({ title, description, canonical, structuredData, css }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#07090b">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="https://visualodds.com/assets/og/visualodds.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${css}">
  ${siteChromeAssets()}
  <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
</head>`;
}

function beginnerBanner() {
  if (!BEGINNER_LESSONS.length) return '';
  return `<section class="learn-beginner" aria-labelledby="learn-beginner-title"><a href="${BEGINNER_PATH}">
    <span class="learn-beginner-copy">
      <span class="learn-kicker">Beginner Guide</span>
      <strong id="learn-beginner-title">New to VisualOdds? Start with the Beginner Guide.</strong>
      <span class="learn-beginner-text">${BEGINNER_LESSONS.length} short lessons, in order: from your first research session to comparing prices, reading +EV and arbitrage, and tracking every result.</span>
      <span class="learn-beginner-foot"><span class="learn-beginner-cta">Start the guide ${ARROW}</span><span class="learn-beginner-meta">${BEGINNER_LESSONS.length} lessons · ${BEGINNER_MINUTES} min</span></span>
    </span>
    <span class="learn-beginner-art" aria-hidden="true">${['probability', 'odds', 'tracker'].map(scene => `<span style="${artStyle('scene', scene)}"></span>`).join('')}</span>
  </a></section>`;
}

export function renderLearnLibrary(origin = 'https://visualodds.com') {
  const canonical = `${origin.replace(/\/+$/, '')}/learn`;
  const counts = Object.fromEntries(CONTENT_TYPES.map(type => [type.id, contentLibrary.filter(item => item.type === type.id).length]));
  // Reviewed content first within each type; archived guides follow.
  const items = [...contentLibrary].sort((a, b) => CONTENT_TYPES.findIndex(t => t.id === a.type) - CONTENT_TYPES.findIndex(t => t.id === b.type) || Number(b.indexable) - Number(a.indexable));
  const cards = items.map(item => `<li class="learn-card" data-type="${esc(item.type)}" data-text="${esc(`${item.title} ${item.description} ${item.category}`.toLowerCase())}"${item.indexable ? '' : ' data-archived'}><a href="${esc(item.path)}"><span class="learn-card-art" style="${artStyle(item.id.split(':')[0], item.id.split(':').slice(1).join(':'))}" aria-hidden="true"></span><span class="learn-card-body"><span class="learn-card-type">${icon(item.type)}${esc(typeLabel[item.type])}${item.category && item.category.toLowerCase() !== typeLabel[item.type].toLowerCase().replace(/s$/, '') ? ` · ${esc(item.category)}` : ''}</span><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small><span class="learn-card-foot">${esc(CARD_CTA[item.type] || 'Open')} ${ARROW}</span></span></a></li>`).join('');
  const tabs = [`<button type="button" data-learn-type="" aria-pressed="true">All <span>${contentLibrary.length}</span></button>`, ...CONTENT_TYPES.map(type => `<button type="button" data-learn-type="${type.id}" aria-pressed="false">${esc(type.label)} <span>${counts[type.id]}</span></button>`)].join('');
  const structuredData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'VisualOdds Learn library', url: canonical, description: 'Every VisualOdds guide, state guide, sportsbook guide, calculator, tool and developer page in one library.', mainEntity: { '@type': 'ItemList', numberOfItems: contentLibrary.filter(item => item.indexable).length } };
  return `${head({ title: 'Learn: Sports Betting Guides, Calculators & Tools | VisualOdds', description: 'Every VisualOdds guide in one place: betting fundamentals, state-by-state legality, sportsbook guides, free calculators and tools, and the developer API.', canonical, structuredData, css: '/learn.css?v=3' })}
<body class="learn-page">
  ${siteHeader({ current: 'learn' })}
  <main id="main" class="learn-main">
    <section class="learn-hero">
      <span class="learn-kicker">Learn</span>
      <h1>Everything we publish, in one library.</h1>
      <p>Betting fundamentals, where betting is legal, how each sportsbook works, free calculators and tools, and the VisualOdds API. Search it all or filter by type.</p>
    </section>
    ${beginnerBanner()}
    <div class="learn-controls" id="learn-controls">
      <div class="learn-tabs" role="group" aria-label="Content type">${tabs}</div>
      <label class="learn-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="sr-only">Search the library</span><input type="search" id="learn-search" placeholder="Search guides, states, sportsbooks, calculators…" autocomplete="off"></label>
      <label class="learn-archived"><input type="checkbox" id="learn-archived"> Include archived guides</label>
    </div>
    <p class="learn-count" id="learn-count" role="status">${contentLibrary.filter(item => item.indexable).length} results</p>
    <ul class="learn-grid" id="learn-grid">${cards}</ul>
    <p class="learn-empty" id="learn-empty" hidden>Nothing matches that search. Try a sport, a state or a sportsbook name.</p>
    <nav class="learn-pager" id="learn-pager" aria-label="Library pages" hidden></nav>
  </main>
  ${siteFooter()}
  <script type="module" src="/learn.js?v=2"></script>
</body>
</html>`;
}

export function renderBeginnerGuide(origin = 'https://visualodds.com') {
  const base = origin.replace(/\/+$/, '');
  const canonical = `${base}${BEGINNER_PATH}`;
  const description = `Learn VisualOdds in ${BEGINNER_LESSONS.length} short lessons: research a player, compare prices, read +EV and arbitrage, filter trends and track your bets.`;
  const structuredData = { '@context': 'https://schema.org', '@type': 'Course', name: 'The VisualOdds Beginner Guide', description, url: canonical, provider: { '@type': 'Organization', name: 'VisualOdds', url: base }, hasPart: BEGINNER_LESSONS.map(({ article }, index) => ({ '@type': 'CreativeWork', position: index + 1, name: article.title, url: `${base}/help/articles/${article.slug}` })) };
  const lessons = BEGINNER_LESSONS.map(({ article, minutes, art }, index) => {
    const number = String(index + 1).padStart(2, '0');
    const topics = (article.sections || []).map(section => section.heading).filter(Boolean).slice(0, 3);
    return `<li class="bg-lesson" data-lesson="${esc(article.slug)}" id="lesson-${index + 1}">
      <a class="bg-lesson-art" style="${artStyle('help', article.slug)}" href="/help/articles/${esc(article.slug)}" data-lesson-link tabindex="-1" aria-hidden="true"><span class="bg-lesson-badge">${number}</span></a>
      <div class="bg-lesson-copy">
        <p class="bg-lesson-meta"><span>Lesson ${number}</span><span>${minutes} min read</span><span class="bg-lesson-done-label">${CHECK}Done</span></p>
        <h2><a href="/help/articles/${esc(article.slug)}" data-lesson-link>${esc(article.title)}</a></h2>
        <p class="bg-lesson-summary">${esc(article.summary)}</p>
        ${topics.length ? `<p class="bg-lesson-learn">What you'll cover</p><ul class="bg-lesson-topics">${topics.map(topic => `<li>${CHECK}${esc(topic)}</li>`).join('')}</ul>` : ''}
        <div class="bg-lesson-actions"><a class="bg-button" href="/help/articles/${esc(article.slug)}" data-lesson-link>Start lesson ${ARROW}</a><button type="button" class="bg-mark" data-mark="${esc(article.slug)}" aria-pressed="false">${CHECK}<span>Mark as done</span></button></div>
      </div>
    </li>`;
  }).join('');
  const outline = BEGINNER_LESSONS.map(({ article }, index) => `<li data-outline="${esc(article.slug)}"><a href="#lesson-${index + 1}"><span class="bg-outline-num">${index + 1}</span><span>${esc(article.title)}</span></a></li>`).join('');
  return `${head({ title: 'Beginner Guide: Learn VisualOdds in 7 Lessons | VisualOdds', description, canonical, structuredData, css: '/learn.css?v=3' })}
<body class="learn-page bg-page">
  ${siteHeader({ current: 'learn' })}
  <main id="main" class="learn-main bg-main">
    <nav class="bg-crumbs" aria-label="Breadcrumb"><a href="/learn">Learn</a><span aria-hidden="true">/</span><span>Beginner Guide</span></nav>
    <section class="bg-hero">
      <div class="bg-hero-copy">
        <span class="learn-kicker">Beginner Guide</span>
        <h1>Learn VisualOdds in ${BEGINNER_LESSONS.length} short lessons.</h1>
        <p>Start with your first research session and finish with a tracker you can trust. Each lesson takes a few minutes and builds on the one before it.</p>
        <ul class="bg-facts"><li><strong>${BEGINNER_LESSONS.length}</strong><span>lessons</span></li><li><strong>${BEGINNER_MINUTES} min</strong><span>total reading</span></li><li><strong>Free</strong><span>no account needed</span></li></ul>
      </div>
      <aside class="bg-progress" aria-labelledby="bg-progress-title">
        <p class="bg-progress-label" id="bg-progress-title">Your progress</p>
        <p class="bg-progress-count"><strong id="bg-done">0</strong> of ${BEGINNER_LESSONS.length} lessons done</p>
        <div class="bg-progress-bar" role="progressbar" aria-labelledby="bg-progress-title" aria-valuemin="0" aria-valuemax="${BEGINNER_LESSONS.length}" aria-valuenow="0"><span id="bg-bar"></span></div>
        <a class="bg-button bg-continue" id="bg-continue" href="/help/articles/${esc(BEGINNER_LESSONS[0]?.article.slug || '')}" data-lesson-link>Start lesson 1 ${ARROW}</a>
        <ol class="bg-outline">${outline}</ol>
        <p class="bg-progress-note">Progress is saved in this browser.</p>
      </aside>
    </section>
    <ol class="bg-lessons">${lessons}</ol>
    <section class="bg-finish" aria-labelledby="bg-finish-title">
      <div><span class="learn-kicker">Next steps</span><h2 id="bg-finish-title">Put it to work.</h2><p>Open the workspace to run your first research session, or browse the full library for betting fundamentals, calculators and state guides.</p></div>
      <div class="bg-finish-actions"><a class="bg-button" href="/research">Open the workspace ${ARROW}</a><a class="bg-button bg-button--ghost" href="/learn">Browse the library</a></div>
    </section>
  </main>
  ${siteFooter()}
  <script type="module" src="/beginner-guide.js?v=1"></script>
</body>
</html>`;
}
