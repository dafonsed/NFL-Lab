import { escape as esc, safeUrl, finite, number as num, NFL_MARKETS, researchProfile, selectGames, summarize, supportingStats, forecastSummary } from './research-data.js';
import { gameChart, observeLines, openPlayerResearch } from './player-research.js';
import { playerContext, playerKey } from './sports-view.js';
import { comparisonLine, trendRows } from './trends-data.js';
import { icon } from './ui-icons.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search), sport = location.pathname.split('/')[1] || 'nfl';
const defaults = { nfl: 'rec_yds', mlb: 'hits', nba: 'points', wnba: 'points', nhl: 'shots', soccer: 'shots' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: sport === 'mlb' ? 'America/New_York' : 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const storageKey = 'sports-lab-trends-watchlist-' + sport;
let saved = [];
try { const value = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(value)) saved = value.map(String); } catch {}
const state = { market: params.get('market') || defaults[sport], date: params.get('date') || today(), season: params.get('season'), week: params.get('week'), league: params.get('league') || 'eng.1', game: params.get('game') || (sport === 'wnba' ? 'all' : ''), search: '', sort: 'rate', window: '10', side: 'over', venue: 'all', posted: false, savedOnly: false, saved: new Set(saved), selected: null, manualLine: null, profiles: [], board: null, catalog: null, count: 50 };
let requestId = 0, controller;
const pct = v => finite(v) === null ? '—' : Math.round(v * 100) + '%';
const price = v => finite(v) === null ? '—' : (v > 0 ? '+' : '') + num(v, 0);
const quoteLabel = p => !p.prop ? p.sport === 'nfl' && p.market === 'any_td' ? '1+ TD comparison · no posted line' : 'No posted line' : `${p.prop.bookmaker || 'Sportsbook'} · ${p.prop.stale ? 'saved quote' : p.prop.basis === 'published_archive' ? 'archived quote' : p.prop.basis === 'in_play' ? 'in-play quote' : 'posted quote'}`;
const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'time unavailable';
const avatar = p => p.image ? `<img src="${safeUrl(p.image)}" alt="" loading="lazy">` : `<span class="td-avatar" aria-hidden="true">${esc(p.name.split(' ').map(n => n[0]).slice(0, 2).join(''))}</span>`;
const selected = () => state.profiles.find(p => p.key === state.selected);
function query(market = state.market) {
  const q = new URLSearchParams({ market });
  if (sport === 'nfl') { q.set('view', 'board'); if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else { q.set('date', state.date); if (sport !== 'mlb') { q.set('sport', sport); q.set('league', state.league); if (state.game) q.set('game', state.game); } }
  return q;
}
function updateUrl() {
  const q = query(); q.set('view', 'trends'); q.delete('sport');
  if (sport === 'nfl' || sport === 'mlb') { if (state.game) q.set('game', state.game); }
  history.replaceState(null, '', '/' + sport + '?' + q);
}
async function request(url, signal) {
  const response = await fetch(url, { signal });
  let data; try { data = await response.json(); } catch { throw Error('The data service could not respond. Please try again.'); }
  if (!response.ok) throw Error(data.error || 'Player data is unavailable.');
  return data;
}
function marketButtons(markets) {
  $('#td-markets').innerHTML = Object.entries(markets).map(([key, m]) => `<button data-market="${esc(key)}" aria-pressed="${key === state.market}">${esc(m.label)}</button>`).join('');
}
function clearDetail() { state.selected = null; state.manualLine = null; }
function renderEmpty(message = 'No players match these filters', description = 'Try another market, matchup, or search.') {
  $('#td-player-list').innerHTML = `<div class="td-empty"><h3>${esc(message)}</h3><p>${esc(description)}</p><button class="button subtle" data-reset>Reset player filters</button></div>`;
  $('#td-detail').innerHTML = '<div class="td-empty"><span class="td-empty-icon" aria-hidden="true">▥</span><h2>No player selected</h2><p>Choose another date or adjust the filters to find a player.</p></div>';
  $('#td-count').textContent = '0 players';
}
async function load({ force = false, schedule = true } = {}) {
  const id = ++requestId; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  state.profiles = []; state.board = null; clearDetail();
  $('#trend-refresh').disabled = true; $('#td-workbench').setAttribute('aria-busy', 'true');
  $('#td-status').textContent = 'Loading player data…'; $('#td-notice').textContent = ''; $('#td-overview').innerHTML = ''; $('#td-count').textContent = 'Loading';
  $('#td-player-list').innerHTML = '<div class="td-empty"><div class="loader"></div><h3>Building your board</h3><p>Reading available lines and completed games.</p></div>';
  $('#td-detail').innerHTML = '<div class="td-empty"><span class="td-empty-icon" aria-hidden="true">▥</span><h2>Game by game. Line by line.</h2><p>Your player chart will appear here.</p></div>';
  try {
    if (sport !== 'nfl' && sport !== 'mlb') {
      if (schedule || !state.catalog) state.catalog = await request('/api/sports/catalog?' + query() + (force ? '&refresh=1' : ''), signal);
      if (id !== requestId) return;
      const c = state.catalog, all = sport === 'wnba' && state.game === 'all';
      state.game = all ? 'all' : (c.games.find(g => String(g.id) === state.game) || c.games.find(g => g.state === 'pre') || c.games[0])?.id || '';
      $('#td-game').innerHTML = (sport === 'wnba' ? '<option value="all">All matchups</option>' : '') + c.games.map(g => `<option value="${esc(g.id)}">${esc(g.away.code)} @ ${esc(g.home.code)} · ${esc(g.status)}</option>`).join('');
      $('#td-game').value = state.game;
      if (!Object.hasOwn(c.markets, state.market)) state.market = Object.keys(c.markets)[0];
      marketButtons(c.markets);
      if (!c.games.length) {
        updateUrl(); renderEmpty('No games on this date', 'Choose another date to explore player history.'); $('#td-status').textContent = 'Schedule checked';
        $('#td-notice').innerHTML = `<div class="td-notice">No scheduled ${esc(sport.toUpperCase())} games on ${esc(state.date)}.${(c.availableDates || []).filter(d => d !== state.date).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(state.date)) - Math.abs(Date.parse(b) - Date.parse(state.date))).slice(0, 2).map(d => ` <button data-date="${esc(d)}">View ${esc(d)}</button>`).join('')}</div>`; return;
      }
    }
    if (sport === 'nfl' && !Object.hasOwn(NFL_MARKETS, state.market)) state.market = defaults.nfl;
    const q = query(); if (force) q.set('refresh', '1');
    const board = await request((sport === 'nfl' ? '/api/board?' : sport === 'mlb' ? '/api/mlb/board?' : '/api/sports/board?') + q, signal);
    if (id !== requestId) return;
    state.board = board;
    if (board.market && typeof board.market === 'string') state.market = board.market;
    marketButtons(sport === 'nfl' ? NFL_MARKETS : board.markets);
    if (sport === 'nfl') {
      $('#td-week').innerHTML = '<option value="">Latest week · automatic</option>' + (board.weeks || []).map(w => `<option value="${w.season}:${w.week}">${w.season} · Week ${w.week}</option>`).join('');
      $('#td-week').value = state.season && state.week ? `${state.season}:${state.week}` : '';
      $('#td-game').innerHTML = '<option value="">All matchups</option>' + (board.lines || []).map(g => `<option value="${esc(g.gameId)}">${esc(g.away)} @ ${esc(g.home)}</option>`).join('');
    } else if (sport === 'mlb') {
      state.date = board.date; $('#td-date').value = state.date;
      $('#td-game').innerHTML = '<option value="">All matchups</option>' + board.games.map(g => `<option value="${esc(g.gameId)}">${esc(g.away.code)} @ ${esc(g.home.code)}${g.doubleHeader ? ' · Game ' + g.gameNumber : ''}</option>`).join('');
    }
    if (sport === 'nfl' || sport === 'mlb') { if (![...$('#td-game').options].some(o => o.value === state.game)) state.game = ''; $('#td-game').value = state.game; }
    state.profiles = (board.players || []).map(p => {
      const context = board.scope === 'all' ? playerContext(board, playerKey(p)) : { player: p, board };
      return context ? researchProfile({ sport, ...context, market: state.market }) : null;
    }).filter(Boolean);
    observeLines(state.profiles); updateUrl(); render();
    $('#td-status').textContent = (sport === 'nfl' ? `${board.current.season} · Week ${board.current.week} · ` : '') + (board.stale || board.partial ? 'Some sources unavailable / cached' : 'Sources checked') + ' · ' + stamp(board.fetchedAt);
    const warnings = [...(board.warnings || []), ...(board.props?.warnings || []), ...(board.notes || [])];
    if (board.stale || board.partial) warnings.unshift('Some data could not be refreshed. Check quote timestamps and availability before comparing.');
    $('#td-notice').innerHTML = warnings.length ? `<details class="td-notice"><summary>Data notes · ${new Set(warnings).size}</summary><p>${[...new Set(warnings)].map(esc).join(' ')}</p></details>` : '';
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    renderEmpty('Player data could not load', error.message); $('#td-status').textContent = 'Refresh needed';
    $('#td-notice').innerHTML = '<div class="td-notice">The data source is unavailable. <button data-retry>Try again</button></div>';
  } finally { if (id === requestId) { $('#trend-refresh').disabled = false; $('#td-workbench').setAttribute('aria-busy', 'false'); } }
}
function render() {
  const rows = trendRows(state.profiles, state), withHistory = rows.filter(r => r.stats.n), quoted = rows.filter(r => r.p.prop && !r.p.prop.stale);
  $('#td-overview').innerHTML = [[rows.length, 'Players on board'], [withHistory.length, 'With game history'], [quoted.length, 'Available posted lines'], [state.market === 'any_td' ? 'TDs' : state.profiles[0]?.label || '—', 'Selected market']].map(([value, label]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('');
  for (const b of document.querySelectorAll('[data-side]')) b.setAttribute('aria-pressed', String(b.dataset.side === state.side));
  $('#td-posted').setAttribute('aria-pressed', String(state.posted)); $('#td-saved').setAttribute('aria-pressed', String(state.savedOnly));
  if (!rows.length) { clearDetail(); renderEmpty(); return; }
  if (!rows.some(r => r.p.key === state.selected)) { state.selected = rows[0].p.key; state.manualLine = null; }
  $('#td-count').textContent = rows.length + ' players';
  $('#td-player-list').innerHTML = `<div class="td-list-labels"><span>PLAYER / MATCHUP</span><span>LINE</span><span>HIT RATE</span></div><div class="td-list-scroll">${rows.slice(0, state.count).map(({ p, stats: s, line }) => `<button class="td-player-row" data-player="${esc(p.key)}" aria-pressed="${p.key === state.selected}"><span class="td-player-name">${avatar(p)}<span><strong>${esc(p.name)}${state.saved.has(String(p.playerId)) ? ' ☆' : ''}</strong><small>${esc(p.team)} vs ${esc(p.opponent || 'TBD')} · ${esc(p.position || '')}</small></span></span><span class="td-row-line">${num(line)}<small>${!p.prop ? 'comparison' : p.prop.stale ? 'saved' : p.prop.basis === 'published_archive' ? 'archive' : p.prop.basis === 'in_play' ? 'in play' : 'posted'}</small></span><span class="td-row-rate ${s.rate >= .7 ? 'td-positive' : ''}">${pct(s.rate)}<small>${s.rate === null ? s.n + ' games' : `${s.hits}/${s.n} games`}</small></span></button>`).join('')}${rows.length > state.count ? '<button class="td-load-more" data-more>Show 50 more players</button>' : ''}</div><div class="td-list-footnote">${state.window === 'all' ? 'All available games' : state.window === 'h2h' ? 'Head-to-head games' : 'Last ' + state.window + ' games'} · ${state.side === 'over' ? 'above' : 'below'} the comparison line</div>`;
  renderDetail();
}
function renderDetail() {
  const p = selected(); if (!p) return;
  const line = state.manualLine ?? comparisonLine(p), games = selectGames(p, state), s = summarize(games, line, state.side), forecast = forecastSummary(p), supporting = supportingStats(p, games), manual = state.manualLine !== null;
  const splits = [['5', 'L5'], ['10', 'L10'], ['20', 'L20'], ['h2h', 'H2H'], ['all', 'All']];
  const context = p.context, lastQuote = p.prop?.fetchedAt;
  $('#td-detail').innerHTML = `<div class="td-player-heading"><div class="td-player-identity">${avatar(p)}<div><span class="td-kicker">${esc(p.team)} · ${esc(p.position || sport.toUpperCase())}</span><h2>${esc(p.name)}</h2><p>vs ${esc(p.opponent || 'Opponent pending')} <span>·</span> ${esc(p.label)}</p></div></div><button data-watch aria-pressed="${state.saved.has(String(p.playerId))}" aria-label="${state.saved.has(String(p.playerId)) ? 'Remove from' : 'Add to'} watchlist">${icon(state.saved.has(String(p.playerId)) ? 'check' : 'bookmark')}<span>${state.saved.has(String(p.playerId)) ? 'Saved' : 'Save'}</span></button></div>
    <div class="td-line-banner"><div><span>${manual ? 'YOUR COMPARISON LINE' : 'COMPARISON LINE'}</span><strong>${state.side === 'over' ? 'Over' : 'Under'} ${num(line)}</strong><small>${manual && p.prop ? 'Book line ' + num(p.prop.line) + ' · ' : ''}${esc(quoteLabel(p))}${lastQuote ? ' · ' + esc(stamp(lastQuote)) : ''}</small></div>${manual ? '<small class="td-custom-note">Custom comparison only<br>Book odds do not apply</small>' : `<div class="td-odds"><span>OVER <b>${price(p.prop?.prices?.over?.american)}</b></span><span>UNDER <b>${price(p.prop?.prices?.under?.american)}</b></span></div>`}</div>
    <div class="td-chart-toolbar"><div class="td-windows" aria-label="Game window">${splits.map(([value, label]) => `<button data-window="${value}" aria-pressed="${state.window === value}">${label}</button>`).join('')}</div><label class="sr-only" for="td-venue">Game venue</label><select id="td-venue"><option value="all" ${state.venue === 'all' ? 'selected' : ''}>Home + away</option><option value="home" ${state.venue === 'home' ? 'selected' : ''}>Home only</option><option value="away" ${state.venue === 'away' ? 'selected' : ''}>Away only</option></select></div>
    <div class="td-summary-stats"><div><span>Hit rate</span><strong class="td-positive">${pct(s.rate)}</strong><small>${s.rate === null ? 'Add a comparison line' : `${s.hits} of ${s.n} games${s.pushes ? ' · ' + s.pushes + ' pushes' : ''}`}</small></div><div><span>Average</span><strong>${num(s.average)}</strong><small>${s.n} recorded games</small></div><div><span>Median</span><strong>${num(s.median)}</strong><small>Middle result</small></div><div><span>Range</span><strong>${s.n ? num(s.min) + '–' + num(s.max) : '—'}</strong><small>Low to high</small></div></div>
    <div class="td-main-chart">${gameChart(games, line, state.side)}</div>
    <div class="td-chart-bottom"><div class="td-legend"><span>● ${state.side === 'over' ? 'Above' : 'Below'} line</span><span>● ${state.side === 'over' ? 'Below' : 'Above'} line</span><span>– Comparison line</span></div><form id="td-line-form"><label for="td-line">Compare line</label><input id="td-line" name="line" type="number" min="-100" max="1000" step="any" value="${line ?? ''}" placeholder="e.g. 24.5" required><button type="submit">Apply</button>${manual ? '<button type="button" data-reset-line>Reset</button>' : ''}</form></div>
    <div class="td-rate-splits">${splits.map(([window, label]) => { const stats = summarize(selectGames(p, { window, venue: state.venue }), line, state.side); return `<div><span>${label}</span><strong>${pct(stats.rate)}</strong><small>${stats.rate === null ? stats.n + ' games' : stats.hits + '/' + stats.n}</small></div>`; }).join('')}</div>
    <p class="td-chart-note">${esc(p.historyNote)} Hit rates compare past results against ${manual ? 'your line' : p.prop?.basis === 'published_archive' ? 'this archived line' : 'one comparison line'}; pushes remain in the sample.</p>
    <div class="td-context-grid"><section><h3>Matchup context</h3><div class="td-context-value">${esc(p.team)} <span>vs</span> ${esc(p.opponent || 'TBD')}</div><p>${context?.available ? `${num(context.rate, 2)} ${esc(context.unit || 'allowed per game')}. Based on ${esc(context.sampleCount)} prior games.` : 'Open the full breakdown for available opponent history and role details.'}</p><span class="td-availability">${esc(p.availability.status || p.lineup || 'Availability not confirmed')}</span></section><section><h3>Model projection</h3><div class="td-projection">${esc(forecast.title)}</div><p>${esc(forecast.text)}</p></section></div>
    ${supporting.length ? `<section class="td-supporting"><h3>Supporting stats <span>· average in selected games</span></h3><div>${supporting.slice(0, 6).map(s => `<div><span>${esc(s.label)}</span><strong>${s.percent ? pct(s.value) : num(s.value)}</strong></div>`).join('')}</div></section>` : ''}
    <div class="td-detail-footer"><button class="button primary" data-breakdown>Full player breakdown ↗</button><button class="button subtle" data-log aria-expanded="false">View game log</button></div>
    <div id="td-game-log" hidden class="pr-table-scroll"><table><caption>${esc(p.name)} · ${esc(p.label)} · selected games</caption><thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th>${state.side === 'over' ? 'Over' : 'Under'} ${num(line)}</th></tr></thead><tbody>${games.map(r => `<tr><td>${esc(r.date.slice(0, 10))}</td><td>${r.home === false ? '@' : 'vs'} ${esc(r.opponent || '—')}</td><td>${num(r.value)}</td><td>${line === null ? '—' : r.value === line ? 'Push' : (state.side === 'under' ? r.value < line : r.value > line) ? 'Hit' : 'Miss'}</td></tr>`).join('')}</tbody></table></div>`;
}
function openBreakdown() {
  const profile = selected(); if (!profile) return;
  const board = state.board, market = state.market;
  let loadDetails;
  if (sport === 'nfl' || sport === 'mlb') loadDetails = async signal => {
    const q = new URLSearchParams({ market, player: sport === 'mlb' ? profile.raw.id : profile.playerId });
    if (sport === 'nfl') { q.set('season', board.current.season); q.set('week', board.current.week); } else q.set('date', board.date);
    const data = await request((sport === 'nfl' ? '/api/nfl/research?' : '/api/mlb/evidence?') + q, signal);
    return { ...researchProfile({ sport, board, player: data.player, market }), full: true };
  };
  openPlayerResearch({ profile, loadDetails });
}
$('#td-week-label').hidden = sport !== 'nfl'; $('#td-date-label').hidden = sport === 'nfl'; $('#td-league-label').hidden = sport !== 'soccer';
$('#td-date').value = state.date; $('#td-league').value = state.league;
if (sport === 'nfl') marketButtons(NFL_MARKETS);
$('#trend-refresh').addEventListener('click', () => load({ force: true }));
$('#td-search').addEventListener('input', e => { state.search = e.target.value; state.count = 50; render(); });
$('#td-sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
$('#td-posted').addEventListener('click', () => { state.posted = !state.posted; render(); });
$('#td-saved').addEventListener('click', () => { state.savedOnly = !state.savedOnly; render(); });
$('#td-week').addEventListener('change', e => { [state.season, state.week] = e.target.value.split(':'); state.game = ''; load(); });
$('#td-date').addEventListener('change', e => { if (!e.target.value) return; state.date = e.target.value; state.game = sport === 'wnba' ? 'all' : ''; load(); });
$('#td-league').addEventListener('change', e => { state.league = e.target.value; state.game = ''; load(); });
$('#td-game').addEventListener('change', e => { state.game = e.target.value; if (sport === 'nfl' || sport === 'mlb') { updateUrl(); render(); } else load({ schedule: false }); });
$('#td-detail').addEventListener('change', e => { if (e.target.id === 'td-venue') { state.venue = e.target.value; render(); $('#td-venue').focus({ preventScroll: true }); } });
$('#td-detail').addEventListener('submit', e => { if (e.target.id !== 'td-line-form') return; e.preventDefault(); const value = finite(new FormData(e.target).get('line')); if (value !== null && value >= -100 && value <= 1000) { state.manualLine = value; renderDetail(); $('#td-line').focus({ preventScroll: true }); } });
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.market && b.dataset.market !== state.market) { state.market = b.dataset.market; load({ schedule: false }); }
  if (b.dataset.player) { state.selected = b.dataset.player; state.manualLine = null; render(); const target = [...document.querySelectorAll('[data-player]')].find(el => el.dataset.player === state.selected); target?.focus({ preventScroll: true }); if (matchMedia('(max-width: 900px)').matches) $('#td-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (b.dataset.window) { state.window = b.dataset.window; render(); document.querySelector(`[data-window="${state.window}"]`)?.focus({ preventScroll: true }); }
  if (b.dataset.side) { state.side = b.dataset.side; render(); }
  if (b.hasAttribute('data-reset-line')) { state.manualLine = null; renderDetail(); }
  if (b.hasAttribute('data-watch')) { const p = selected(); if (!p) return; const id = String(p.playerId); state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id); try { localStorage.setItem(storageKey, JSON.stringify([...state.saved])); } catch { $('#td-notice').textContent = 'Watchlist changes last for this session. Browser storage is unavailable.'; } render(); $('[data-watch]')?.focus({ preventScroll: true }); }
  if (b.hasAttribute('data-log')) { const log = $('#td-game-log'); log.hidden = !log.hidden; b.setAttribute('aria-expanded', String(!log.hidden)); b.textContent = log.hidden ? 'View game log' : 'Hide game log'; }
  if (b.hasAttribute('data-breakdown')) openBreakdown();
  if (b.hasAttribute('data-retry')) load({ force: true });
  if (b.hasAttribute('data-more')) { state.count += 50; render(); }
  if (b.hasAttribute('data-reset')) { state.search = ''; state.posted = false; state.savedOnly = false; state.venue = 'all'; $('#td-search').value = ''; render(); }
  if (b.dataset.date) { state.date = b.dataset.date; $('#td-date').value = state.date; state.game = sport === 'wnba' ? 'all' : ''; load(); }
});
await load();
