import fs from 'node:fs';
import { SPORTS } from '../public/navigation.js';

// Product dashboards (/trends, /models, /ev/dashboard): each workspace gets the
// Dashboard layout from home.html, focused on its own data. home.js reads
// data-hd-product and fills only the panels present on the page.
const template = fs.readFileSync(new URL('../public/home.html', import.meta.url), 'utf8');
const block = cls => template.match(new RegExp(`<(section|nav) class="hd-panel ${cls}"[\\s\\S]*?</\\1>`))?.[0] || '';
const span = (html, size) => html.replace(/class="hd-panel ([^"]+)"/, `class="hd-panel $1 hd-span-${size}"`);

function panel({ key, glyph, title, chip = '', open = '', openLabel = '', openId = '', size = 5 }) {
  return `<section class="hd-panel hd-panel-${key} hd-span-${size}" aria-labelledby="hd-${key}-title">
    <header class="hd-panel-head"><div class="hd-panel-title"><span class="hd-panel-icon" aria-hidden="true"><span data-ui-icon="${glyph}"></span></span><h2 id="hd-${key}-title">${title}</h2>${chip ? `<span class="hd-chip" id="hd-${key}-badge">${chip}</span>` : ''}</div>${open ? `<a${openId ? ` id="${openId}"` : ''} class="hd-open" href="${open}">Open <span class="sr-only">${openLabel}</span><span aria-hidden="true">→</span></a>` : ''}</header>
    <div class="hd-panel-body" id="hd-${key}" aria-live="polite"></div>
  </section>`;
}
const stat = ([key, label, { suffix = '', decimals = 0, accent = false, id = '' } = {}]) =>
  `<div class="hd-stat${accent ? ' is-accent' : ''}"><dt${id ? ` id="${id}"` : ''}>${label}</dt><dd><span data-hd-count="${key}"${suffix ? ` data-hd-suffix="${suffix}"` : ''}${decimals ? ` data-hd-decimals="${decimals}"` : ''}>—</span></dd></div>`;

const PRODUCTS = {
  models: {
    name: 'Models', headline: 'Today’s projections, <span class="hd-gradient">at a glance.</span>',
    lede: 'The model’s strongest picks, its biggest edges against the posted line and the slate for the selected sport. Open any panel for the full board.',
    stats: [['games', 'Games today', { id: 'hd-stat-games-label' }], ['props', 'Props modeled'], ['priced', 'With a posted line'], ['top', 'Top model chance', { suffix: '%', accent: true }]],
    panels: sport => [
      span(block('hd-panel-picks'), 7),
      panel({ key: 'edges', glyph: 'performance', title: 'Biggest edges vs the book', chip: 'Model − implied', size: 5 }),
      span(block('hd-panel-games'), 5),
      span(block('hd-panel-tools'), 7)
    ]
  },
  trends: {
    name: 'Trends', headline: 'Recent form, <span class="hd-gradient">at a glance.</span>',
    lede: 'The hottest and coldest players against their posted lines over the last ten games, and the slate they play next.',
    stats: [['tracked', 'Players with a line'], ['hot', 'Hit 8+ of last 10', { accent: true }], ['cold', 'Hit 2 or fewer'], ['games', 'Games today', { id: 'hd-stat-games-label' }]],
    panels: sport => [
      span(block('hd-panel-trends'), 7),
      panel({ key: 'cold', glyph: 'trends', title: 'Cold streaks', chip: 'Last 10 at line', open: `/${sport}?view=trends`, openLabel: 'Player trends', size: 5 }),
      span(block('hd-panel-games'), 5),
      span(block('hd-panel-tools'), 7)
    ]
  },
  ev: {
    name: '+EV', headline: 'Today’s prices, <span class="hd-gradient">at a glance.</span>',
    lede: 'Positive EV prices with the vig removed, the books offering them and your bet record, in one place.',
    stats: [['ev', '+EV opportunities'], ['edge', 'Best edge', { suffix: '%', decimals: 1, accent: true }], ['books', 'Books with value'], ['avg', 'Average edge', { suffix: '%', decimals: 1 }]],
    panels: () => [
      span(block('hd-panel-ev'), 7),
      panel({ key: 'books', glyph: 'research', title: 'Books with value', chip: 'Pregame', size: 5 }),
      span(block('hd-panel-tracker'), 5),
      span(block('hd-panel-tools'), 7)
    ]
  }
};

export function renderProductDashboard(url) {
  const path = url.pathname.replace(/\/$/, '');
  const product = path === '/trends' ? 'trends' : path === '/models' ? 'models' : path === '/ev/dashboard' ? 'ev' : null;
  if (!product) return null;
  const info = PRODUCTS[product], sport = Object.hasOwn(SPORTS, url.searchParams.get('sport')) ? url.searchParams.get('sport') : product === 'ev' ? 'all' : 'mlb';
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${info.name} dashboard · VisualOdds</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="Your VisualOdds ${info.name} dashboard.">`)
    .replace('<a class="skip" href="#main">Skip to dashboard</a>', `<a class="skip" href="#main">Skip to ${info.name} dashboard</a>`)
    .replace('<div class="hd" id="home-dashboard"', `<div class="hd" id="home-dashboard" data-hd-product="${product}"`)
    .replace('<span id="home-context">Dashboard</span>', `<span id="home-context">${info.name} workspace</span>`)
    .replace(/<h1 id="hd-title">[\s\S]*?<\/h1>/, `<h1 id="hd-title"><span class="hd-kicker">${info.name} dashboard</span> ${info.headline}</h1>`)
    .replace(/<p class="hd-lede" id="hd-lede">[\s\S]*?<\/p>/, `<p class="hd-lede" id="hd-lede">${info.lede}</p>`)
    .replace(/(<dl class="hd-stats"[^>]*>)[\s\S]*?(<\/dl>)/, `$1${info.stats.map(stat).join('')}$2`)
    .replace(/(<div class="hd-grid-panels">)[\s\S]*?(<\/div>\s*<p class="hd-footnote")/, `$1${info.panels(sport).join('')}$2`)
    .replace(/(<p class="hd-footnote" id="home-source">)[\s\S]*?(<\/p>)/, `$1${product === 'ev' ? 'Prices are compared against a no-vig consensus. Demo prices are illustrative until the odds feed is connected.' : product === 'trends' ? 'Historical hit rates describe recorded games; past results are not future probabilities.' : 'Model estimates are experimental. Sources and assumptions are in each player’s details.'}$2`);
}
