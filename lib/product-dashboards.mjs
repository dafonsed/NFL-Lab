import { SPORTS, productDashboardUrl, betTrackerUrl, sportTools } from '../public/navigation.js';
import { icon } from '../public/ui-icons.js';
import { leagueMark } from '../public/sports-identity.js';
import { escape as esc } from '../public/research-data.js';

const markets = {
  nfl: [['rec_yds', 'Receiving yards'], ['rush_yds', 'Rushing yards'], ['pass_yds', 'Passing yards'], ['rec', 'Receptions']],
  mlb: [['hits', 'Hits'], ['k', 'Pitcher strikeouts'], ['tb', 'Total bases'], ['hr', 'Home runs']],
  nba: [['points', 'Points'], ['rebounds', 'Rebounds'], ['assists', 'Assists'], ['threes', 'Three-pointers']],
  wnba: [['points', 'Points'], ['rebounds', 'Rebounds'], ['assists', 'Assists'], ['threes', 'Three-pointers']],
  nhl: [['shots', 'Shots on goal'], ['goals', 'Goals'], ['assists', 'Assists'], ['saves', 'Goalie saves']],
  soccer: [['shots', 'Shots'], ['sot', 'Shots on target'], ['goals', 'Goals'], ['assists', 'Assists']]
};
const products = {
  trends: { name: 'Trends', description: 'Player history, recent form, and the matchups behind the numbers.' },
  models: { name: 'Models', description: 'Projections, game scenarios, and the assumptions behind each estimate.' },
  ev: { name: '+EV', description: 'Compare prices, research opportunities, and track your bets.' }
};
const rowLink = (href, glyph, title, description) => `<a class="pd-tool-row" href="${esc(href)}"><span class="pd-tool-icon">${icon(glyph)}</span><span><strong>${title}</strong><small>${description}</small></span>${icon('chevron')}</a>`;

function researchForm(product, sport) {
  return `<form class="pd-research-form" action="/${sport}" method="get">
    ${product === 'trends' ? '<input type="hidden" name="view" value="trends"><label class="pd-search-field">Player or team<div>' + icon('search') + '<input type="search" name="search" placeholder="Search a player or team" autocomplete="off"></div></label>' : ''}
    <label>Market<select name="market">${markets[sport].map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
    <button class="pd-button pd-button-primary" type="submit">${product === 'trends' ? 'Open trends' : 'Open projections'}${icon('arrow')}</button>
  </form>`;
}

function trendsDashboard(sport) {
  return `<div class="pd-layout pd-trends-layout">
    <section class="pd-panel pd-main-panel" aria-labelledby="pd-research-title">
      <div class="pd-panel-heading"><span class="pd-feature-icon">${icon('trends')}</span><span class="pd-context">${SPORTS[sport]} research</span></div>
      <h2 id="pd-research-title">Find your next player to research.</h2><p>Start with a market. Explore game logs, hit rates, and matchup splits on your board.</p>
      ${researchForm('trends', sport)}
      <div class="pd-research-details"><span>${icon('calendar')}Recent game logs</span><span>${icon('performance')}Hit-rate samples</span><span>${icon('players')}Matchup context</span></div>
    </section>
    <aside class="pd-panel pd-watchlist" aria-labelledby="pd-watchlist-title"><div class="pd-panel-heading"><span class="pd-feature-icon">${icon('bookmark')}</span><span class="pd-context">Your research</span></div><h2 id="pd-watchlist-title">Watchlist</h2><p data-watchlist-summary>Keep the players you follow close to your research.</p><a class="pd-button" href="/${sport}?view=trends&amp;saved=1">Open watchlist${icon('chevron')}</a><small>Saved in this browser, separately for each sport.</small></aside>
    <section class="pd-panel pd-market-panel" aria-labelledby="pd-markets-title"><div class="pd-section-title"><h2 id="pd-markets-title">Explore ${SPORTS[sport]} markets</h2><span>Player trends</span></div><div class="pd-market-grid">${markets[sport].map(([key, label]) => rowLink(`/${sport}?view=trends&market=${key}`, 'research', label, 'Game history & hit rates')).join('')}</div></section>
  </div>`;
}

function modelsDashboard(sport) {
  const tools = sportTools(sport), simulation = tools.find(tool => tool.key === 'simulation'), live = tools.find(tool => tool.key === 'live');
  return `<div class="pd-layout pd-models-layout">
    <section class="pd-panel pd-main-panel" aria-labelledby="pd-projections-title"><div class="pd-panel-heading"><span class="pd-feature-icon">${icon('research')}</span><span class="pd-context">${SPORTS[sport]} model workspace</span></div><h2 id="pd-projections-title">Start with the projection.</h2><p>Compare player estimates, inspect outcome ranges, and open the inputs behind each model.</p>${researchForm('models', sport)}
    <dl class="pd-model-details"><div><dt>Projection</dt><dd>Estimated player production</dd></div><div><dt>Outcome range</dt><dd>Variation under model assumptions</dd></div><div><dt>Model inputs</dt><dd>Samples, sources, and adjustments</dd></div></dl></section>
    <aside class="pd-model-tools" aria-label="Model tools">
      ${simulation ? `<a class="pd-panel pd-model-tool" href="${simulation.href}"><span class="pd-tool-icon">${icon('simulation')}</span><div><h2>Simulation</h2><p>Explore game scenarios and outcome distributions.</p></div>${icon('chevron')}</a>` : `<section class="pd-panel pd-model-note"><h2>${SPORTS[sport]} coverage</h2><p>Player projections are available. Simulation and live models are available for NFL, MLB, NBA, and WNBA.</p></section>`}
      ${live ? `<a class="pd-panel pd-model-tool" href="${live.href}"><span class="pd-tool-icon">${icon('live')}</span><div><h2>Live games</h2><p>Follow the game and inspect in-game estimates.</p></div>${icon('chevron')}</a>` : ''}
      <p class="pd-model-disclosure">Model estimates are experimental. Open a player or game to inspect its sources and limitations.</p>
    </aside>
    <section class="pd-panel pd-market-panel" aria-labelledby="pd-markets-title"><div class="pd-section-title"><h2 id="pd-markets-title">${SPORTS[sport]} projection boards</h2><span>Choose a market</span></div><div class="pd-market-grid">${markets[sport].map(([key, label]) => rowLink(`/${sport}?market=${key}`, 'research', label, 'Projections & model inputs')).join('')}</div></section>
  </div>`;
}

function evDashboard(sport) {
  const base = '/ev?sport=' + (sport || 'all');
  return `<div class="pd-layout pd-ev-layout">
    <section class="pd-panel pd-main-panel pd-odds-panel" aria-labelledby="pd-odds-title"><div class="pd-panel-heading"><span class="pd-feature-icon">${icon('ev')}</span><span class="pd-context">${sport ? SPORTS[sport] : 'All sports'} markets</span></div><h2 id="pd-odds-title">Your market workspace.</h2><p>Start with the odds screen or go straight to your preferred value tool.</p><div class="pd-primary-actions"><a class="pd-button pd-button-primary" href="${base}#odds">Open odds screen${icon('arrow')}</a><a class="pd-button" href="${base}#ev-pre">Positive EV${icon('chevron')}</a></div><div class="pd-research-details"><span>${icon('research')}Compare sportsbooks</span><span>${icon('filter')}Filter your markets</span></div></section>
    <aside class="pd-panel pd-tracker-panel" aria-labelledby="pd-tracker-title"><div class="pd-panel-heading"><span class="pd-feature-icon">${icon('picks')}</span><span class="pd-context">Your results</span></div><h2 id="pd-tracker-title">Bet tracker</h2><p>Your tickets, profit history, and performance breakdowns in one place.</p><a class="pd-button" href="${betTrackerUrl(sport)}">Open bet tracker${icon('chevron')}</a><small>Your existing tickets stay together.</small></aside>
    <section class="pd-panel pd-market-panel" aria-labelledby="pd-tools-title"><div class="pd-section-title"><h2 id="pd-tools-title">Value tools</h2><span>Choose your workflow</span></div><div class="pd-market-grid">${rowLink(base + '#ev-pre', 'ev', 'Positive EV', 'Compare prices with fair-value estimates')}${rowLink(base + '#arb-pre', 'performance', 'Arbitrage', 'Compare prices on both sides of a market')}${rowLink(base + '#fantasy', 'players', 'DFS props', 'Research props and build your slip')}${rowLink(base + '#sharp', 'live', 'Smart money', 'Inspect market movement and signals')}</div></section>
  </div>`;
}

export function renderProductDashboard(url) {
  const path = url.pathname.replace(/\/$/, '');
  const product = path === '/trends' ? 'trends' : path === '/models' ? 'models' : path === '/ev/dashboard' ? 'ev' : null;
  if (!product) return null;
  const sport = Object.hasOwn(SPORTS, url.searchParams.get('sport')) ? url.searchParams.get('sport') : product === 'ev' ? null : 'mlb';
  const info = products[product];
  const sportLinks = [...(product === 'ev' ? [['all', 'All sports']] : []), ...Object.entries(SPORTS)];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#101719"><title>${info.name} dashboard · SportsLab</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css"></head>
    <body class="product-dashboard research-console${product === 'ev' ? ' ev-page' : ''}" data-product="${product}" data-dashboard-sport="${sport || 'all'}"><a class="skip" href="#main">Skip to ${info.name} dashboard</a><!--site-header-->
    <main id="main" class="pd-main" tabindex="-1"><header class="pd-heading"><div><h1>${info.name}<span>Overview</span></h1><p>${info.description}</p></div><span class="pd-workspace-label">${icon(product === 'models' ? 'research' : product)}${info.name} workspace</span></header>
    <nav class="pd-sports" aria-label="Dashboard sport">${sportLinks.map(([key, label]) => `<a href="${productDashboardUrl(product, key)}"${(sport || 'all') === key ? ' aria-current="page"' : ''}>${key === 'all' ? icon('home') : leagueMark(key)}<span>${label}</span></a>`).join('')}</nav>
    ${product === 'trends' ? trendsDashboard(sport) : product === 'models' ? modelsDashboard(sport) : evDashboard(sport)}
    </main></body></html>`;
}
