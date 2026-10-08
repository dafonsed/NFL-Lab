// Workspace dashboards (/models, /trends, /ev/dashboard; legacy /research shows all panels):
// a fast, top-N summary. data-hd-product picks the panels; each renders only if present.
// Panels render independently; nothing here blocks on the largest request.
import { accountStorage, accountReady } from './account-sync.js';
import {requestData} from './product-ui.js';
import {researchProfile, escape as esc, finite, number as num, selectGames, summarize, recentChange} from './research-data.js';
import {sortProfiles} from './player-order.js';
import {playerContext, playerKey} from './sports-view.js';
import {playerPortrait, teamMark} from './sports-identity.js';
import {icon} from './ui-icons.js';
import {sportTools, betTrackerUrl, SPORTS} from './navigation.js';
import {evToolUrl} from './ev-tool-catalog.js';
import {getEV, serverNow} from './odds-client.js';
import {suiteSettings, isCurrent} from './odds-contract.js';
import {implied} from './betting-math.js';
import {isDemoRecord} from './ev-workspace-clean.js?v=1';
import {platformAsset, platformLabel} from './platform-catalog.js';
import {readBets, summarizeBets, betReturns} from './bet-utils.js?v=4';

const $ = s => document.querySelector(s), params = new URLSearchParams(location.search);
const put = (selector, html) => { const node = $(selector); if (node) node.innerHTML = html; };
const product = document.getElementById('home-dashboard')?.dataset.hdProduct || '';
const PRODUCT_NAMES = {models:'Models', trends:'Trends', ev:'+EV'};
// +EV covers every sport at one address; the other dashboards are per sport.
const sport = product === 'ev' ? 'all' : Object.hasOwn(SPORTS, params.get('sport')) ? params.get('sport') : 'mlb', label = sport === 'all' ? 'All sports' : SPORTS[sport];
const defaults = {nfl:'rec_yds', mlb:'hits', nba:'points', wnba:'points', nhl:'shots', soccer:'shots'}, market = defaults[sport];
const zone = sport === 'mlb' ? 'America/New_York' : 'America/Phoenix';
const today = new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tools = new Set(sport === 'all' ? [] : sportTools(sport).map(t => t.key));
// The member's pricing settings from the +EV workspace, read as ev-suite.js settings() reads them, so the
// preview is priced like the Positive EV page. Its board filters (league, odds range) stay on that page.
// Loaded on demand: the storage module waits for account sync, which must not hold up the first paint.
async function memberEvSettings() {
  let saved = {};
  try { const {readSuiteState} = await import('./ev-suite-storage.js?v=2'); const settings = readSuiteState()?.settings; if (settings && typeof settings === 'object') saved = settings; } catch { /* Unreadable saved settings fall back to the defaults. */ }
  return suiteSettings(saved);
}
// Books available in the member's state, as the Positive EV page offers them (every book still prices).
async function memberBooks() {
  try { const {readSportsbookState, sportsbookAvailable} = await import('./sportsbook-availability.js'); const state = readSportsbookState(); return book => sportsbookAvailable(book, state); }
  catch { return () => true; }
}
const stats = {games:null, props:null, ev:null, edge:null};
let slateDate = today;

const pct = (value, digits = 0) => finite(value) === null ? '—' : (value * 100).toFixed(digits) + '%';
const money = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', minimumFractionDigits:Math.abs(value) >= 1000 ? 0 : 2, maximumFractionDigits:Math.abs(value) >= 1000 ? 0 : 2}).format(value);
const signedMoney = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));
const shortDate = value => new Intl.DateTimeFormat('en-US', {weekday:'short', month:'short', day:'numeric', timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z'));
const bookMark = book => {
  const asset = platformAsset(book), name = platformLabel(book) || book || 'Sportsbook';
  return asset ? `<img class="hd-book-logo" src="${esc(asset)}" alt="${esc(name)}" title="${esc(name)}" width="22" height="22" decoding="async">` : `<span class="hd-book-logo is-text" title="${esc(name)}" aria-label="${esc(name)}">${esc(String(name).slice(0, 2))}</span>`;
};
const oddsPill = (odds, book) => odds === null || odds === undefined || odds === '' ? '' : `<span class="hd-odds">${book ? bookMark(book) : ''}<b>${esc(americanOdds(odds))}</b></span>`;
const skeleton = (rows = 5) => `<ul class="hd-list hd-skeleton" aria-hidden="true">${'<li><i></i><span><b></b><b></b></span><em></em></li>'.repeat(rows)}</ul>`;
const empty = (title, body, action = '') => `<div class="hd-empty"><strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</div>`;
const failed = message => empty('Could not load this panel', message || 'The data service is unavailable. Reload the page to try again.');

// <dashboard-data> Pure ranking and shaping (no DOM, no requests); exercised by test/home-order.test.mjs.
function greeting(date = new Date()) {
  const hour = date.getHours();
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const day = new Intl.DateTimeFormat('en-US', {weekday:'short', month:'short', day:'numeric'}).format(date);
  return {part, day, text:`${part} · ${day}`};
}

const americanOdds = value => {
  const odds = finite(value);
  return odds === null ? '' : (odds > 0 ? '+' : '') + Math.round(odds);
};
const impliedFromAmerican = value => {
  const odds = finite(value), probability = odds === null ? NaN : implied(odds);
  return Number.isFinite(probability) ? probability : null;
};

// Rank the entire pool first, then slice. Rows with a posted line come first so the
// panel shows actionable picks; the model's over probability orders them.
function topPicks(profiles, count = 5) {
  const priced = profiles.filter(p => finite(p.forecast?.probability?.over) !== null && !p.availability?.unavailable);
  const ranked = sortProfiles(priced, 'over');
  const withLine = ranked.filter(p => p.prop), rest = ranked.filter(p => !p.prop);
  return [...withLine, ...rest].slice(0, count).map(p => {
    const probability = finite(p.forecast.probability.over), odds = finite(p.prop?.prices?.over?.american);
    const implied = impliedFromAmerican(odds);
    return {profile:p, probability, odds, book:p.prop?.bookmaker || '', line:finite(p.prop?.line), implied, edge:implied === null ? null : probability - implied};
  });
}

// Hot trends: highest hit rate over the last ten completed games at the posted line.
// Without posted lines, fall back to the largest recent production increase.
function ratedTrends(profiles, window = '10') {
  return profiles.flatMap(p => {
    const line = finite(p.prop?.line);
    if (line === null || p.availability?.unavailable) return [];
    const games = selectGames(p, {window}), summary = summarize(games, line, 'over');
    if (summary.n < 5 || summary.rate === null) return [];
    return [{profile:p, kind:'hit-rate', line, rate:summary.rate, hits:summary.hits, n:summary.n, games:games.slice(0, Number(window) || 10).map(r => ({value:r.value, hit:finite(r.value) > line, date:r.date}))}];
  }).sort((a, b) => b.rate - a.rate || b.n - a.n || b.hits - a.hits || a.profile.name.localeCompare(b.profile.name));
}
function hotTrends(profiles, count = 5, window = '10') {
  const rated = ratedTrends(profiles, window);
  if (rated.length) return rated.slice(0, count);
  return profiles.flatMap(p => {
    const change = recentChange(p.rows || []);
    return finite(change.change) === null ? [] : [{profile:p, kind:'mover', change:change.change, recent:change.recent, previous:change.previous, games:(p.rows || []).slice(0, 10).map(r => ({value:r.value, hit:finite(r.value) > finite(change.previous), date:r.date}))}];
  }).sort((a, b) => b.change - a.change || a.profile.name.localeCompare(b.profile.name)).slice(0, count);
}

// Positive, pregame EV rows. Show the highest edges but vary the book and event so
// five identical exchange quotes do not fill the whole preview.
function topEvRows(rows, count = 5) {
  const prop = r => r.quote.type === 'prop' ? 0 : 1;
  const positive = rows.filter(r => r.ev > 0 && !r.quote.live).sort((a, b) => b.ev - a.ev || prop(a) - prop(b));
  const picked = [], books = new Set(), events = new Set(), pairs = new Set(), pair = r => r.quote.book + '|' + r.quote.event;
  for (const pass of [r => !books.has(r.quote.book) && !events.has(r.quote.event), r => !books.has(r.quote.book), r => !pairs.has(pair(r)), () => true]) {
    for (const row of positive) {
      if (picked.length >= count) break;
      if (picked.includes(row) || !pass(row)) continue;
      picked.push(row); books.add(row.quote.book); events.add(row.quote.event); pairs.add(pair(row));
    }
  }
  return picked.sort((a, b) => b.ev - a.ev || prop(a) - prop(b));
}

// Rows are titled with the feed's selection ("Over", a team, "Draw"), not its side code ("home"); props lead with the player.
function evSelection(quote) {
  const line = finite(quote.line), spread = quote.type === 'spread' || quote.type === 'alternate' && !/^(over|under)$/i.test(quote.side);
  const lineText = line === null ? '' : ' ' + (spread && line > 0 ? '+' : '') + line;
  const pick = String(quote.selection || quote.side || '').trim();
  return {title:`${quote.player ? quote.player + ' ' : ''}${pick}${lineText}`, detail:quote.displayMarket || quote.market, event:quote.displayEvent || quote.event};
}

// The odds service's +EV rows (priced with the member's settings, past the feed-error caps and the
// both-sides check) with their quotes: only positive, current prices at `offered` books (the member's
// state), within the member's saved EV range.
function dashboardEvRows(snapshot, settings = {}, offered = () => true, now = Date.now()) {
  const quotes = new Map((snapshot?.quotes || []).map(quote => [quote.id, quote])), set = value => value != null && value !== '';
  const inRange = ev => ev > 0 && (!set(settings.minEvPercent) || ev * 100 >= Number(settings.minEvPercent)) && (!set(settings.maxEvPercent) || ev * 100 <= Number(settings.maxEvPercent));
  return (snapshot?.pricing || []).flatMap(row => {
    const quote = quotes.get(row.quoteId);
    return quote && row.plausible && inRange(row.ev) && offered(quote.book) && isCurrent(quote, now)
      ? [{quote, fair:row.fairProbability, ev:row.ev}] : [];
  });
}

function evSummary(rows) {
  const positive = rows.filter(r => r.ev > 0 && !r.quote.live);
  return {count:positive.length, best:positive.length ? Math.max(...positive.map(r => r.ev)) : null};
}

// One shape for three schedule sources: simulation catalog, sports catalog, NFL board lines.
function normalizeGames(sport, source) {
  if (sport === 'nfl') return (source?.lines || []).map(g => ({id:g.gameId, away:{code:g.away}, home:{code:g.home}, start:g.date, dateOnly:true, state:g.awayScore != null ? 'post' : 'pre', status:'', total:finite(g.latest?.total), spread:finite(g.latest?.homeFavoredBy)}));
  if (Array.isArray(source?.events)) return source.events.map(g => {
    const team = side => g.teams?.find(t => t.homeAway === side) || {};
    const away = team('away'), home = team('home');
    return {id:g.id, away:{code:away.abbreviation || away.code, id:away.id, score:finite(away.score)}, home:{code:home.abbreviation || home.code, id:home.id, score:finite(home.score)}, start:g.date, state:g.state, status:g.status || ''};
  });
  return (source?.games || []).map(g => ({id:g.id, away:{code:g.away?.code, id:g.away?.id, score:finite(g.away?.score)}, home:{code:g.home?.code, id:g.home?.id, score:finite(g.home?.score)}, start:g.startTime || g.date, state:g.state, status:g.status || ''}));
}

function orderGames(games) {
  const rank = g => g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2;
  return [...games].sort((a, b) => rank(a) - rank(b) || String(a.start).localeCompare(String(b.start)));
}
// Cold streaks: lowest hit rate at the posted line, at most four hits in ten.
function coldTrends(profiles, count = 5, window = '10') {
  return ratedTrends(profiles, window).filter(r => r.rate <= 0.4).sort((a, b) => a.rate - b.rate || b.n - a.n || a.profile.name.localeCompare(b.profile.name)).slice(0, count);
}
// Model edge: model over chance minus the book's implied chance, largest first.
function topEdges(profiles, count = 5) {
  return topPicks(profiles, Infinity).filter(p => finite(p.edge) !== null && p.edge > 0).sort((a, b) => b.edge - a.edge).slice(0, count);
}
// Books offering positive pregame prices: count and best edge per book.
function evBooks(rows) {
  const books = new Map();
  for (const r of rows) {
    if (!(r.ev > 0) || r.quote.live) continue;
    const entry = books.get(r.quote.book) || {book:r.quote.book, count:0, best:0, total:0};
    entry.count++; entry.total += r.ev; entry.best = Math.max(entry.best, r.ev); books.set(r.quote.book, entry);
  }
  return [...books.values()].sort((a, b) => b.count - a.count || b.best - a.best);
}
// </dashboard-data>

// ---------------------------------------------------------------- hero
function hero() {
  const g = greeting();
  $('#hd-greeting').textContent = g.text;
  $('#home-context').textContent = product ? `${label} · ${PRODUCT_NAMES[product]}` : label + ' workspace';
  const sports = document.querySelector('.site-sports');
  // +EV has no sport switcher: its dashboard always covers every sport.
  if (product === 'ev') $('#hd-sports')?.remove();
  else if (sports && $('#hd-sports')) $('#hd-sports').append(sports);
  if ($('#hd-ev-open')) $('#hd-ev-open').href = evToolUrl('ev-pre', sport);
  const live = $('#home-live');
  // NHL and soccer have no live model; the games panel opens the schedule-backed projections.
  if (live && !tools.has('live')) { live.hidden = false; live.href = '/' + sport; live.querySelector('.sr-only').textContent = label + ' projections'; }
}

function setStat(key, value) { stats[key] = value; count(key, value); }
function count(key, value) {
  const node = document.querySelector(`[data-hd-count="${key}"]`);
  if (!node) return;
  const decimals = Number(node.dataset.hdDecimals || 0), suffix = node.dataset.hdSuffix || '';
  const format = v => Number(v).toLocaleString('en-US', {minimumFractionDigits:decimals, maximumFractionDigits:decimals}) + suffix;
  if (finite(value) === null) { node.textContent = '—'; return; }
  node.closest('.hd-stat')?.classList.add('is-ready');
  if (reduceMotion || document.hidden) { node.textContent = format(value); return; }
  const start = performance.now(), duration = 900;
  const step = now => {
    const k = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - k, 3);
    node.textContent = format(value * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- +EV preview
async function evPanel() {
  if (!$('#hd-ev')) return;
  // Pregame +EV rows from the odds service (GET /api/odds/ev), priced with the member's settings. When it
  // can't answer, the panel says so instead of showing old prices as current value.
  const code = sport === 'soccer' ? 'Soccer' : label, settings = await memberEvSettings();
  let snapshot;
  try { snapshot = await getEV({settings, sport:sport === 'all' ? undefined : code, live:false, limit:2000}); }
  catch (error) { put('#hd-ev', failed(error?.code === 'NOT_CONFIGURED' ? 'The odds feed is not connected yet.' : 'The odds service is unavailable right now. Reload the page to try again.')); setStat('ev', null); setStat('edge', null); booksPanel([]); return; }
  const rows = dashboardEvRows({...snapshot, quotes:snapshot.quotes.filter(quote => quote?.source === 'local-api' && !isDemoRecord(quote))}, settings, await memberBooks(), serverNow());
  const summary = evSummary(rows), top = topEvRows(rows, 5);
  setStat('ev', summary.count); setStat('edge', summary.best === null ? null : summary.best * 100);
  booksPanel(rows);
  $('#hd-ev-badge').textContent = 'Pregame';
  const href = evToolUrl('ev-pre', sport);
  put('#hd-ev', top.length ? `<ul class="hd-list">${top.map(({quote, ev, fair}) => {
    const s = evSelection(quote);
    return `<li><a class="hd-row hd-ev-row" href="${esc(href)}"><span class="hd-ev-value"><strong>+${(ev * 100).toFixed(1)}%</strong><small>EV</small></span><span class="hd-row-main"><strong>${esc(s.title)}</strong><small>${esc(s.detail)} · ${esc(s.event)}</small></span><span class="hd-row-side"><small class="hd-fair">Fair ${pct(fair, 1)}</small>${oddsPill(quote.odds, quote.book)}</span></a></li>`;
  }).join('')}</ul><p class="hd-panel-foot">${summary.count} positive ${summary.count === 1 ? 'price' : 'prices'} across ${new Set(rows.filter(r => r.ev > 0 && !r.quote.live).map(r => r.quote.book)).size} books</p>`
    : empty('No positive EV prices yet', `Positive EV prices for ${label} appear here once the odds feed syncs.`, `<a class="hd-cta" href="${esc(href)}">Open Positive EV <span aria-hidden="true">→</span></a>`));
}

function booksPanel(rows) {
  const books = evBooks(rows), positive = rows.filter(r => r.ev > 0 && !r.quote.live);
  setStat('books', books.length);
  setStat('avg', positive.length ? positive.reduce((sum, r) => sum + r.ev, 0) / positive.length * 100 : null);
  if (!$('#hd-books')) return;
  const href = evToolUrl('odds', sport), top = books[0]?.count || 1;
  put('#hd-books', books.length ? `<ul class="hd-list">${books.slice(0, 5).map(b => `<li><a class="hd-row hd-book-row" href="${esc(evToolUrl('ev-pre', sport))}">${bookMark(b.book)}<span class="hd-row-main"><strong>${esc(platformLabel(b.book) || b.book)}</strong><small>${b.count} +EV ${b.count === 1 ? 'price' : 'prices'} · avg +${(b.total / b.count * 100).toFixed(1)}%</small><span class="hd-bar" aria-hidden="true"><i style="width:${Math.round(b.count / top * 100)}%"></i></span></span><span class="hd-row-side hd-rate-cell"><strong class="hd-rate">+${(b.best * 100).toFixed(1)}%</strong><small>best edge</small></span></a></li>`).join('')}</ul>`
    : empty('No books with value yet', 'Books appear here once they post a price above the no-vig fair line.', `<a class="hd-cta" href="${esc(href)}">Open Odds Screen <span aria-hidden="true">→</span></a>`));
}

// ---------------------------------------------------------------- model + trends
function modelLink(p) {
  const q = new URLSearchParams({market});
  if (sport !== 'nfl') q.set('date', slateDate);
  if (!['nfl', 'mlb'].includes(sport) && p.gameId) q.set('game', p.gameId);
  q.set('researchPlayer', p.key);
  return '/' + sport + '?' + q;
}
function trendLink(p) {
  const q = new URLSearchParams({view:'trends', market});
  if (sport !== 'nfl') q.set('date', slateDate);
  if (!['nfl', 'mlb'].includes(sport) && p.gameId) q.set('game', p.gameId);
  q.set('researchPlayer', p.key);
  return '/' + sport + '?' + q;
}
const matchup = p => `${esc(p.team || '')}${p.opponent ? ' vs ' + esc(p.opponent) : ''}`;
const lineText = (p, line) => line === null ? esc(p.label || '') : `O ${num(line, 1)} ${esc(String(p.label || '').toLowerCase())}`;

function picksPanel(profiles) {
  if (!$('#hd-picks')) return;
  const picks = topPicks(profiles, 5);
  $('#hd-picks-badge').textContent = profiles[0]?.label ? profiles[0].label + ' · over' : 'Over chance';
  $('#hd-picks').innerHTML = picks.length ? `<ul class="hd-list">${picks.map(({profile:p, probability, odds, book, line}) => `<li><a class="hd-row hd-pick-row" href="${esc(modelLink(p))}">${playerPortrait(p)}<span class="hd-row-main"><strong>${esc(p.name)}</strong><small>${matchup(p)} · ${lineText(p, line)}</small></span><span class="hd-meter" title="Model over chance"><strong>${pct(probability)}</strong><i aria-hidden="true"><b style="width:${Math.max(4, Math.min(100, Math.round(probability * 100)))}%"></b></i><small>model</small></span>${oddsPill(odds, book) || '<span class="hd-odds is-empty">No line</span>'}</a></li>`).join('')}</ul>`
    : stats.games === 0 ? empty('No games on the slate', `Model picks return when the next ${label} slate is posted.`) : empty('No model picks for this slate', 'Projections appear once the schedule and player history load.');
}

function trendsPanel(profiles) {
  if (!$('#hd-trends')) return;
  const rows = hotTrends(profiles, 5);
  const movers = rows[0]?.kind === 'mover';
  $('#hd-trends-title').textContent = movers ? 'Model movers' : 'Hot trends';
  $('#hd-trends-badge').textContent = movers ? 'Last 5 vs prior 5' : 'Last 10 at line';
  $('#hd-trends').innerHTML = rows.length ? `<ul class="hd-list">${rows.map(r => {
    const p = r.profile, dots = `<span class="hd-dots" aria-hidden="true">${r.games.slice().reverse().map(g => `<i class="${g.hit ? 'is-hit' : ''}"></i>`).join('')}</span>`;
    const value = movers ? `<strong class="hd-rate">${r.change > 0 ? '+' : ''}${num(r.change, 1)}</strong><small>per game</small>` : `<strong class="hd-rate">${Math.round(r.rate * 100)}%</strong><small>${r.hits} of ${r.n}</small>`;
    return `<li><a class="hd-row hd-trend-row" href="${esc(trendLink(p))}">${playerPortrait(p)}<span class="hd-row-main"><strong>${esc(p.name)}</strong><small>${movers ? esc(p.label || '') + ' · recent ' + num(r.recent, 1) : lineText(p, r.line)}</small>${dots}</span><span class="hd-row-side hd-rate-cell">${value}</span></a></li>`;
  }).join('')}</ul>`
    : empty(stats.games === 0 ? 'No games on the slate' : 'No trend data yet', 'Recent hit rates need posted lines and at least five completed games.');
}

function edgesPanel(profiles) {
  if (!$('#hd-edges')) return;
  const edges = topEdges(profiles, 5);
  put('#hd-edges', edges.length ? `<ul class="hd-list">${edges.map(({profile:p, probability, implied, edge, odds, book, line}) => `<li><a class="hd-row hd-edge-row" href="${esc(modelLink(p))}">${playerPortrait(p)}<span class="hd-row-main"><strong>${esc(p.name)}</strong><small>${lineText(p, line)} · model ${pct(probability)} vs book ${pct(implied)}</small></span><span class="hd-row-side hd-rate-cell"><strong class="hd-rate">+${(edge * 100).toFixed(1)}%</strong><small>${oddsPill(odds, book) ? esc(americanOdds(odds)) : 'edge'}</small></span></a></li>`).join('')}</ul>`
    : empty('No edges on this slate', 'Edges appear when the model’s chance beats the price a book is posting.'));
}

function coldPanel(profiles) {
  if (!$('#hd-cold')) return;
  const rows = coldTrends(profiles, 5);
  put('#hd-cold', rows.length ? `<ul class="hd-list">${rows.map(r => {
    const p = r.profile, dots = `<span class="hd-dots" aria-hidden="true">${r.games.slice().reverse().map(g => `<i class="${g.hit ? 'is-hit' : ''}"></i>`).join('')}</span>`;
    return `<li><a class="hd-row hd-trend-row is-cold" href="${esc(trendLink(p))}">${playerPortrait(p)}<span class="hd-row-main"><strong>${esc(p.name)}</strong><small>${lineText(p, r.line)}</small>${dots}</span><span class="hd-row-side hd-rate-cell"><strong class="hd-rate">${Math.round(r.rate * 100)}%</strong><small>${r.hits} of ${r.n}</small></span></a></li>`;
  }).join('')}</ul>`
    : empty('No cold streaks right now', 'Players who hit four or fewer of their last ten appear here.'));
}

// ---------------------------------------------------------------- games
function gameTime(g) {
  if (g.dateOnly) return shortDate(String(g.start).slice(0, 10));
  const d = new Date(g.start);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-US', {hour:'numeric', minute:'2-digit'}).format(d) : '';
}
function gamesPanel(games, date = slateDate) {
  if (!$('#hd-games')) return;
  const ordered = orderGames(games), live = ordered.filter(g => g.state === 'in').length;
  const isToday = date === today && sport !== 'nfl';
  $('#hd-games-title').textContent = sport === 'nfl' ? 'This week’s games' : isToday ? 'Today’s games' : 'Next slate';
  $('#hd-stat-games-label').textContent = sport === 'nfl' ? 'Games this week' : isToday ? 'Games today' : 'Games · ' + shortDate(date);
  const badge = $('#hd-games-badge');
  badge.hidden = !live; badge.textContent = live ? live + ' live' : ''; badge.classList.toggle('is-live', !!live);
  setStat('games', games.length);
  const href = $('#home-live')?.href || '/' + sport;
  const team = (t, winner) => `<span class="hd-team${winner ? ' is-winner' : ''}">${teamMark({sport, team:t.code, teamId:t.id})}<b>${esc(t.code || 'TBD')}</b>${t.score === null || t.score === undefined ? '' : `<em>${esc(t.score)}</em>`}</span>`;
  const shown = ordered.slice(0, 5);
  $('#hd-games').innerHTML = shown.length ? `<ul class="hd-list hd-games">${shown.map(g => {
    const final = g.state === 'post', scored = g.state !== 'pre' && finite(g.away.score) !== null && finite(g.home.score) !== null;
    const away = {...g.away, score:scored ? g.away.score : null}, home = {...g.home, score:scored ? g.home.score : null};
    const status = g.state === 'in' ? `<span class="hd-live-pill"><i aria-hidden="true"></i>Live</span><small>${esc(g.status)}</small>` : final ? '<span class="hd-final">Final</span>' : `<strong>${esc(gameTime(g))}</strong><small>${sport === 'nfl' && g.spread !== null && g.spread !== undefined ? esc(g.home.code) + ' ' + (g.spread > 0 ? '−' : '+') + num(Math.abs(g.spread), 1) + (g.total ? ' · O/U ' + num(g.total, 1) : '') : g.status && g.status.length <= 16 ? esc(g.status) : ''}</small>`;
    return `<li><a class="hd-row hd-game-row${g.state === 'in' ? ' is-live' : ''}" href="${esc(href)}"><span class="hd-teams">${team(away, final && away.score > home.score)}${team(home, final && home.score > away.score)}</span><span class="hd-game-status">${status}</span></a></li>`;
  }).join('')}</ul>${ordered.length > shown.length ? `<p class="hd-panel-foot">+${ordered.length - shown.length} more ${ordered.length - shown.length === 1 ? 'game' : 'games'} on the slate</p>` : ''}`
    : empty(`No ${label} games scheduled`, date === today ? 'Nothing on today’s schedule. Check back when the next slate is posted.' : 'No upcoming games were found in the published schedule.');
}

// ---------------------------------------------------------------- bet tracker
function trackerPanel() {
  if (!$('#hd-tracker')) return;
  const href = $('#home-picks')?.href || betTrackerUrl(sport);
  let bets = [];
  try { bets = readBets(accountStorage); } catch {
    $('#hd-tracker').innerHTML = empty('Saved bets could not be read', 'Open the tracker to review storage and sync status.', `<a class="hd-cta" href="${esc(href)}">Open Bet tracker <span aria-hidden="true">→</span></a>`);
    return;
  }
  if (!bets.length) {
    $('#hd-tracker').innerHTML = `<div class="hd-tracker-cta"><span class="hd-cta-icon" aria-hidden="true">${icon('picks')}</span><strong>Track every result</strong><p>Log bets from any book to see profit, ROI and closing line value in one record.</p><a class="hd-cta" href="${esc(href)}">Add your first bet <span aria-hidden="true">→</span></a></div>`;
    return;
  }
  const s = summarizeBets(bets), recent = [...bets].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 3);
  const tone = v => v > 0 ? 'is-up' : v < 0 ? 'is-down' : '';
  $('#hd-tracker').innerHTML = `<dl class="hd-mini-stats"><div><dt>Open bets</dt><dd>${s.open}</dd></div><div><dt>At risk</dt><dd>${money(s.openStake)}</dd></div><div><dt>Profit</dt><dd class="${tone(s.profit)}">${signedMoney(s.profit)}</dd></div><div><dt>ROI</dt><dd class="${tone(s.roi)}">${s.roi === null ? '—' : (s.roi > 0 ? '+' : '') + s.roi.toFixed(1) + '%'}</dd></div></dl>
  <ul class="hd-list hd-bets">${recent.map(b => { const r = betReturns(b); return `<li><a class="hd-row hd-bet-row" href="${esc(href)}">${bookMark(b.book)}<span class="hd-row-main"><strong>${esc(b.selection)}</strong><small>${esc(b.book || '')}${b.date ? ' · ' + esc(shortDate(b.date)) : ''}</small></span><span class="hd-row-side"><span class="hd-status is-${esc(b.status)}">${esc(b.status)}</span><small class="${tone(r.profit)}">${r.profit === null ? money(b.stake) + ' stake' : signedMoney(r.profit)}</small></span></a></li>`; }).join('')}</ul>`;
}

// ---------------------------------------------------------------- quick links
const TREND_MARKETS = {nfl:[['rec_yds','Receiving yards'],['rush_yds','Rushing yards'],['pass_yds','Passing yards'],['rec','Receptions']], mlb:[['hits','Hits'],['k','Pitcher strikeouts'],['tb','Total bases'],['hr','Home runs']], nba:[['points','Points'],['rebounds','Rebounds'],['assists','Assists'],['threes','Three-pointers']], wnba:[['points','Points'],['rebounds','Rebounds'],['assists','Assists'],['threes','Three-pointers']], nhl:[['shots','Shots on goal'],['goals','Goals'],['assists','Assists'],['saves','Goalie saves']], soccer:[['shots','Shots'],['sot','Shots on target'],['goals','Goals'],['assists','Assists']]};
function quickLinks() {
  if (!$('#hd-tools')) return;
  const base = '/' + sport;
  const byProduct = {
    ev: [['Odds Screen', 'Every book, one grid', evToolUrl('odds', sport), 'research'], ['Positive EV', 'Prices above fair', evToolUrl('ev-pre', sport), 'ev'], ['DFS Props', 'Pick’em lines', evToolUrl('fantasy', sport), 'players'], ['Arbitrage', 'Opposing best prices', evToolUrl('arb-pre', sport), 'expand'], ['Smart Money', 'Exchange liquidity', evToolUrl('sharp', sport), 'performance'], ['Middles', 'Windows to win both', evToolUrl('middles', sport), 'filter']],
    models: [['Projections', label + ' model board', base, 'research', 'research'], ['Live games', 'In-game model', base + '/live', 'live', 'live'], ['Simulation', 'Game scenarios', base + '/simulation', 'simulation', 'simulation']],
    trends: [['Player trends', 'Hit rates at the line', base + '?view=trends', 'trends'], ['Watchlist', 'Saved players', base + '?view=trends&saved=1', 'bookmark'], ['Parlay builder', 'Legs picked from trends', base + '?view=parlay', 'parlay'], ...(TREND_MARKETS[sport] || []).slice(0, 3).map(([key, name]) => [name, 'Trends board', base + '?view=trends&market=' + key, 'trends'])]
  };
  if (byProduct[product]) { renderTools(byProduct[product].filter(([, , , , need]) => !need || tools.has(need))); return; }
  const links = [
    ['Odds Screen', 'Every book, one grid', evToolUrl('odds', sport), 'research'],
    ['Positive EV', 'Prices above fair', evToolUrl('ev-pre', sport), 'ev'],
    ['DFS Props', 'Pick’em lines', evToolUrl('fantasy', sport), 'players'],
    ['Arbitrage', 'Opposing best prices', evToolUrl('arb-pre', sport), 'expand'],
    ['Smart Money', 'Exchange liquidity', evToolUrl('sharp', sport), 'performance'],
    ['Projections', label + ' model board', base, 'research', 'research'],
    ['Live games', 'In-game model', base + '/live', 'live', 'live'],
    ['Simulation', 'Game scenarios', base + '/simulation', 'simulation', 'simulation'],
    ['Trends', 'Recent hit rates', base + '?view=trends', 'trends', 'trends'],
    ['Watchlist', 'Saved players', base + '?view=trends&saved=1', 'bookmark', 'trends']
  ].filter(([, , , , need]) => !need || tools.has(need));
  renderTools(links);
}
function renderTools(links) {
  $('#hd-tools').innerHTML = links.map(([name, hint, href, glyph]) => `<li><a class="hd-tool" href="${esc(href)}"><span class="hd-tool-icon" aria-hidden="true">${icon(glyph)}</span><span><strong>${esc(name)}</strong><small>${esc(hint)}</small></span></a></li>`).join('');
}

// ---------------------------------------------------------------- data
const profilesFrom = board => board.players.map(p => {
  const context = !['mlb', 'nfl'].includes(sport) ? playerContext(board, playerKey(p)) : null;
  return researchProfile({sport, board:context?.board || board, player:p, market});
});

function showProfiles(profiles, board) {
  setStat('props', profiles.filter(p => finite(p.forecast?.point) !== null || finite(p.forecast?.probability?.over) !== null).length);
  if (product === 'models') {
    const chances = profiles.filter(p => !p.availability?.unavailable).map(p => finite(p.forecast?.probability?.over)).filter(v => v !== null);
    setStat('priced', profiles.filter(p => p.prop && finite(p.forecast?.probability?.over) !== null).length);
    setStat('top', chances.length ? Math.round(Math.max(...chances) * 100) : null);
  }
  if (product === 'trends') {
    const rated = ratedTrends(profiles);
    setStat('tracked', rated.length); setStat('hot', rated.filter(r => r.rate >= 0.8).length); setStat('cold', rated.filter(r => r.rate <= 0.2).length);
  }
  picksPanel(profiles); trendsPanel(profiles); edgesPanel(profiles); coldPanel(profiles);
  if (board?.fetchedAt) $('#home-source').textContent = `${label} board updated ${new Date(board.fetchedAt).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}. Model estimates are experimental.`;
}
function boardFailed(error) {
  const message = error?.message;
  for (const id of ['#hd-picks', '#hd-trends', '#hd-edges', '#hd-cold']) put(id, failed(message));
  for (const key of ['props', 'priced', 'top', 'tracked', 'hot', 'cold']) setStat(key, null);
}

async function loadMain() {
  if (sport === 'mlb') {
    const schedule = requestData('/api/simulation/catalog?sport=mlb').then(c => gamesPanel(normalizeGames('mlb', c), c.date || today)).catch(e => { $('#hd-games').innerHTML = failed(e.message); });
    const board = await requestData('/api/mlb/board?' + new URLSearchParams({market, date:today}));
    showProfiles(profilesFrom(board), board);
    await schedule;
    return;
  }
  if (sport === 'nfl') {
    const board = await requestData('/api/board?' + new URLSearchParams({market, view:'board'}));
    gamesPanel(normalizeGames('nfl', board), today);
    if (board.current) $('#home-context').textContent = `NFL · ${board.current.season} week ${board.current.week}`;
    showProfiles(board.players.map(p => researchProfile({sport, board, player:p, market})), board);
    return;
  }
  let catalog = await requestData('/api/sports/catalog?' + new URLSearchParams({market, date:today, sport}));
  if (!catalog.games?.length) {
    const next = catalog.availableDates?.find(d => d > today);
    if (next) { slateDate = next; catalog = await requestData('/api/sports/catalog?' + new URLSearchParams({market, date:next, sport})); }
  }
  const games = normalizeGames(sport, catalog);
  gamesPanel(games, slateDate);
  const upcoming = orderGames(games).filter(g => g.state !== 'post');
  const targets = (upcoming.length ? upcoming : games).slice(0, 3);
  if (!targets.length) { showProfiles([]); return; }
  const boards = await Promise.allSettled(targets.map(g => requestData('/api/sports/board?' + new URLSearchParams({market, date:slateDate, sport, game:g.id}))));
  const loaded = boards.filter(b => b.status === 'fulfilled').map(b => b.value);
  if (!loaded.length) throw boards.find(b => b.status === 'rejected')?.reason || Error('No boards loaded.');
  showProfiles(loaded.flatMap(profilesFrom), loaded[0]);
}

// ---------------------------------------------------------------- start
hero(); quickLinks();
for (const id of ['#hd-picks', '#hd-trends', '#hd-edges', '#hd-cold', '#hd-games']) put(id, skeleton(id === '#hd-games' ? 4 : 5));
put('#hd-tracker', skeleton(3));
$('#home-dashboard').dataset.hdReady = '';
await accountReady;
trackerPanel();
void evPanel();
// The +EV dashboard is built from saved prices only; the others need the league board.
try { if (product !== 'ev') await loadMain(); }
catch (error) { if (error?.name !== 'AbortError') { boardFailed(error); if ($('#hd-games .hd-skeleton')) put('#hd-games', failed(error.message)); if (stats.games === null) setStat('games', null); } }
finally { $('#home-dashboard').setAttribute('aria-busy', 'false'); }
window.addEventListener('storage', event => { if (event.key === null || String(event.key).includes('bet')) trackerPanel(); });
