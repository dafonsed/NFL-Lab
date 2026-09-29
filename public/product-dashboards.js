import { accountStorage as localStorage, accountReady } from './account-sync.js';
// Hub pages (/trends, /models, /ev/dashboard). The server renders the hero, bento cards and
// skeleton previews; this module fills them after first paint with real, top-N-only data:
// +EV rows from the same workspace math as /ev, model picks and hit rates from the sport's
// research board, the slate from the schedule catalog, and the local watchlist count.
const hubSport = document.body.dataset.dashboardSport;
const hubMarket = document.body.dataset.dashboardMarket;
const hubProduct = document.body.dataset.product;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const getJson = (url, signal) => fetch(url, { credentials: 'same-origin', signal })
  .then(response => response.ok ? response.json() : Promise.reject(Error('Unavailable')));
const arrow = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const simulationSports = new Set(['nfl', 'mlb', 'nba', 'wnba']);
const day = value => {
  const today = new Date(), local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return value === local ? 'today' : new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const localDate = sport => new Intl.DateTimeFormat('en-CA', { timeZone: sport === 'mlb' ? 'America/New_York' : 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Counters ease up from zero once; reduced-motion users see the final value immediately.
function setCount(key, value, { decimals = 0, suffix = '' } = {}) {
  for (const node of document.querySelectorAll?.(`[data-hub-count="${key}"]`) || []) {
    if (!Number.isFinite(value)) { node.textContent = '—'; continue; }
    const format = n => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    node.closest('.hub-stat')?.classList.add('is-ready');
    if (reducedMotion() || typeof requestAnimationFrame !== 'function' || value === 0) { node.textContent = format(value); continue; }
    const start = performance.now(), duration = 900;
    const step = now => {
      const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
      node.textContent = format(t < 1 ? Number((value * eased).toFixed(decimals)) : value);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
const setCardStat = (key, html) => { for (const node of document.querySelectorAll?.(`[data-hub-card-stat="${key}"]`) || []) node.innerHTML = html; };
const previewList = () => document.querySelector('[data-hub-preview-list]');
function fillPreview(html, emptyText) {
  const list = previewList();
  if (!list) return;
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = html || `<li class="hub-row-empty">${escapeHtml(emptyText)}</li>`;
}
function setVisual(kind, html, caption) {
  const node = document.querySelector(`[data-hub-visual="${kind}"]`);
  if (!node || !html) return;
  node.classList.add('is-live');
  node.innerHTML = html + (caption ? `<span class="hub-visual-caption">${escapeHtml(caption)}</span>` : '');
}
// With no data, the decorative placeholder stays dimmed and says so instead of implying a result.
function emptyVisual(kind, text) {
  const node = document.querySelector(`[data-hub-visual="${kind}"]`);
  if (!node || node.classList.contains('is-live')) return;
  node.classList.add('is-empty');
  const caption = node.querySelector('[data-hub-visual-caption]');
  if (caption) caption.textContent = text;
}
const bars = (values, { line = null, max = Math.max(...values, line ?? 0, 1) } = {}) => `<span class="hub-bars"${line !== null ? ` style="--line:${Math.round(line / max * 100)}%"` : ''}>${values.map(value => `<i class="${line !== null && value > line ? 'is-hit' : line !== null ? 'is-miss' : ''}" style="--h:${Math.max(6, Math.round(value / max * 100))}%"></i>`).join('')}</span>`;
const afterPaint = fn => {
  const run = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 60));
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : run();
};

// ── Schedule: the lightweight simulation catalog (or the sports catalog for NHL / soccer).
let schedulePromise = null;
function loadSchedule() {
  schedulePromise ??= simulationSports.has(hubSport)
    ? getJson('/api/simulation/catalog?sport=' + encodeURIComponent(hubSport)).then(catalog => ({
      date: catalog.date,
      events: (Array.isArray(catalog?.events) ? catalog.events : []).map(event => {
        const side = where => event.teams?.find(team => team.homeAway === where) || {};
        return { id: event.id, state: event.state, start: event.date, status: event.status, away: side('away').abbreviation, home: side('home').abbreviation, awayScore: side('away').score, homeScore: side('home').score };
      })
    }))
    : loadSportsCatalog().then(catalog => ({
      date: catalog.date,
      events: (catalog.games || []).map(game => ({ id: game.id, state: game.state, start: game.startTime || game.date, status: game.status, away: game.away?.code, home: game.home?.code, awayScore: game.away?.score, homeScore: game.home?.score }))
    }));
  return schedulePromise;
}
let sportsCatalogPromise = null;
const loadSportsCatalog = () => sportsCatalogPromise ??= getJson('/api/sports/catalog?' + new URLSearchParams({ sport: hubSport, date: localDate(hubSport), league: 'eng.1' }));

const scheduleNodes = [...(document.querySelectorAll?.('[data-hub-schedule]') || [])];
if (scheduleNodes.length && typeof fetch === 'function') {
  loadSchedule().then(catalog => {
    const events = catalog.events, live = events.filter(event => event.state === 'in').length;
    const games = `<b>${events.length}</b> ${events.length === 1 ? 'game' : 'games'}${/^\d{4}-\d{2}-\d{2}$/.test(catalog.date || '') ? ' ' + day(catalog.date) : ''}`;
    for (const node of scheduleNodes) {
      if (!events.length) { node.textContent = 'No games scheduled'; continue; }
      node.innerHTML = node.dataset.hubSchedule === 'live' && live ? `<b>${live}</b> live now` : games;
      node.closest('.hub-card')?.classList.toggle('is-live', node.dataset.hubSchedule === 'live' && live > 0);
    }
  }).catch(() => { /* Keep the static description when the schedule cannot be read. */ });
}

// ── +EV hub: the same no-vig math and demo/workspace quotes as the Positive EV tool.
const evSettings = { minSharpBooks: 1, maxVigPercent: 20, devigMethod: 'multiplicative', liveMaxAgeSeconds: 90, pregameMaxAgeSeconds: 86400, minEvPercent: 0 };
const americanOdds = odds => { const n = Number(odds); return Number.isFinite(n) ? (n > 0 ? '+' : '') + n : '—'; };
async function loadEvHub() {
  const [{ computeAdvancedEv }, { EV_DEMO_MODE, permanentDemoWorkspace }, { platformAsset }] = await Promise.all([
    import('./ev-advanced-math.js'), import('./ev-preview.js'), import('./platform-catalog.js')
  ]);
  let quotes = [];
  if (EV_DEMO_MODE) quotes = permanentDemoWorkspace().quotes;
  else {
    await accountReady;
    try { quotes = JSON.parse(localStorage.getItem('sportslab-ev-workbench-v1'))?.quotes || []; } catch { quotes = []; }
    if (!Array.isArray(quotes)) quotes = [];
  }
  const league = hubSport === 'all' ? '' : hubSport === 'soccer' ? 'Soccer' : hubSport.toUpperCase();
  const pool = quotes.filter(quote => !league || quote.sport === league);
  const priced = live => computeAdvancedEv(pool.filter(quote => Boolean(quote.live) === live), evSettings)
    .filter(row => row.ev > 0 && Number(row.quote.odds) <= 200);
  const rows = priced(false), liveRows = priced(true);
  const books = new Map();
  for (const row of rows) books.set(row.quote.book, Math.max(books.get(row.quote.book) ?? 0, row.ev));
  setCount('ev-count', rows.length);
  setCount('ev-top', rows.length ? Math.max(...rows.map(row => row.ev)) * 100 : 0, { decimals: rows.length ? 2 : 0, suffix: '%' });
  setCount('ev-books', books.size);
  const markets = new Set(pool.filter(quote => !quote.live).map(quote => quote.marketId || quote.market)).size;
  setCardStat('markets', `<b>${markets}</b> ${markets === 1 ? 'market' : 'markets'}`);
  setCardStat('ev', `<b>${rows.length}</b> +EV ${rows.length === 1 ? 'selection' : 'selections'}`);
  setCardStat('ev-live', `<b>${liveRows.length}</b> live +EV`);
  const flag = document.querySelector('[data-hub-preview-flag]');
  if (flag && pool.some(quote => quote.demo || quote.source === 'example')) { flag.textContent = 'Example data'; flag.classList.add('is-example'); }

  // Best price per market, interleaved across games so the top five aren't one matchup.
  const seen = new Set(), order = new Map();
  const top = rows.filter(row => { const key = row.quote.marketId || row.quote.id; if (seen.has(key)) return false; seen.add(key); return true; })
    .map(row => { const rank = order.get(row.quote.eventId) ?? 0; order.set(row.quote.eventId, rank + 1); return { row, rank, prop: row.quote.type === 'prop' ? 0 : 1 }; })
    .sort((a, b) => b.row.ev - a.row.ev || a.prop - b.prop || a.rank - b.rank).slice(0, 5).map(item => item.row);
  const href = document.querySelector('.hub-preview-foot')?.getAttribute('href') || '/ev';
  const logo = book => { const src = platformAsset(book); return src ? `<img src="${escapeHtml(src)}" alt="" width="24" height="24" loading="lazy" decoding="async">` : `<i>${escapeHtml(String(book).slice(0, 2).toUpperCase())}</i>`; };
  fillPreview(top.map(({ quote, ev }) => {
    const selection = quote.type === 'prop' ? `${quote.player} ${quote.side} ${quote.line}` : quote.type === 'spread' ? `${quote.side} ${Number(quote.line) > 0 ? '+' : ''}${quote.line}` : `${quote.side} ${quote.line}`;
    const detail = `${quote.type === 'prop' ? quote.displayMarket : quote.market} · ${quote.event}`;
    return `<li><a class="hub-row hub-row-ev" href="${escapeHtml(href)}"><span class="hub-ev">+${(ev * 100).toFixed(2)}%</span><span class="hub-row-main"><strong>${escapeHtml(selection)}</strong><small>${escapeHtml(detail)}</small></span><span class="hub-book" title="${escapeHtml(quote.book)}">${logo(quote.book)}<span>${escapeHtml(quote.book)}</span></span><span class="hub-odds">${americanOdds(quote.odds)}</span></a></li>`;
  }).join(''), 'No positive EV selections for this league right now.');

  const ranked = [...books].sort((a, b) => b[1] - a[1]).slice(0, 4), best = ranked[0]?.[1] || 1;
  setVisual('ev', ranked.length ? `<span class="hub-meters">${ranked.map(([book, ev]) => `<span class="hub-meter">${logo(book)}<span class="hub-meter-name">${escapeHtml(book)}</span><span class="hub-meter-track"><i style="--w:${Math.max(4, Math.round(ev / best * 100))}%"></i></span><b>+${(ev * 100).toFixed(1)}%</b></span>`).join('')}</span>` : '', 'Best edge by sportsbook');
  if (!ranked.length) emptyVisual('ev', 'No positive EV prices for this league yet');
}

// ── Research board shared by the Models and Trends hubs (same endpoints as those boards).
async function loadBoard() {
  const market = hubMarket;
  if (hubSport === 'nfl') return getJson('/api/board?' + new URLSearchParams({ market, view: 'board' }));
  if (hubSport === 'mlb') return getJson('/api/mlb/board?' + new URLSearchParams({ market }));
  const catalog = await loadSportsCatalog();
  const game = (catalog.games || []).find(item => item.state === 'pre') || catalog.games?.[0];
  if (!game) return { players: [], empty: true };
  return getJson('/api/sports/board?' + new URLSearchParams({ market, date: catalog.date || localDate(hubSport), sport: hubSport, league: 'eng.1', game: game.id }));
}
async function loadProfiles() {
  const [board, research] = await Promise.all([loadBoard(), import('./research-data.js')]);
  const profiles = (board.players || []).map(player => {
    try { return research.researchProfile({ sport: hubSport, player, board, market: hubMarket }); } catch { return null; }
  }).filter(Boolean);
  return { board, profiles, research };
}
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const avatar = profile => `<span class="hub-avatar" aria-hidden="true">${profile.image ? `<img src="${escapeHtml(profile.image)}" alt="" width="36" height="36" loading="lazy" decoding="async">` : ''}<i>${escapeHtml(initials(profile.name))}</i></span>`;
const matchup = profile => [profile.team, profile.opponent ? `vs ${profile.opponent}` : ''].filter(Boolean).join(' ');
const playerHref = (profile, trends) => {
  const q = new URLSearchParams(trends ? { view: 'trends', market: hubMarket } : { market: hubMarket });
  if (!['nfl', 'mlb'].includes(hubSport) && profile.gameId) q.set('game', profile.gameId);
  q.set('researchPlayer', profile.key);
  return `/${hubSport}?${q}`;
};
const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)).toLocaleString('en-US') : '—';

async function loadModelsHub() {
  loadSchedule().then(({ events }) => {
    setCount('games', events.length);
    setCount('live', events.filter(event => event.state === 'in').length);
    const list = document.querySelector('[data-hub-games]');
    if (!list) return;
    list.setAttribute('aria-busy', 'false');
    const order = { in: 0, pre: 1, post: 2 };
    const shown = [...events].sort((a, b) => (order[a.state] ?? 1) - (order[b.state] ?? 1) || Date.parse(a.start) - Date.parse(b.start)).slice(0, 6);
    const href = event => event.state === 'in' && simulationSports.has(hubSport) ? `/${hubSport}/live` : simulationSports.has(hubSport) ? `/${hubSport}/simulation` : `/${hubSport}?market=${encodeURIComponent(hubMarket)}&game=${encodeURIComponent(event.id)}`;
    const when = event => event.state === 'in' ? '<b class="is-live">Live</b>' : event.state === 'post' ? '<b>Final</b>' : Number.isFinite(Date.parse(event.start)) ? `<b>${new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b>` : '<b>Scheduled</b>';
    const score = event => event.state === 'pre' || !Number.isFinite(Number(event.awayScore)) ? '' : `<small>${event.awayScore}–${event.homeScore}</small>`;
    list.innerHTML = shown.length ? shown.map(event => `<li><a class="hub-game" href="${escapeHtml(href(event))}">${when(event)}<span>${escapeHtml(event.away || 'Away')} <em>@</em> ${escapeHtml(event.home || 'Home')}</span>${score(event)}</a></li>`).join('') : '<li class="hub-row-empty">No games on the schedule today.</li>';
  }).catch(() => {
    setCount('games', NaN); setCount('live', NaN);
    const list = document.querySelector('[data-hub-games]');
    if (list) { list.setAttribute('aria-busy', 'false'); list.innerHTML = '<li class="hub-row-empty">Schedule unavailable right now.</li>'; }
  });

  const { profiles, research } = await loadProfiles();
  const modeled = profiles.filter(profile => research.finite(profile.forecast?.point) !== null && profile.forecast?.status !== 'unavailable');
  setCount('modeled', modeled.length);
  if (modeled.length) setCardStat('modeled', `<b>${modeled.length}</b> props modeled`);
  const picks = modeled.map(profile => {
    const probability = profile.forecast?.probability || {}, line = research.finite(profile.prop?.line);
    const over = research.finite(probability.over), under = research.finite(probability.under);
    const side = over === null && under === null ? null : (over ?? 0) >= (under ?? 0) ? 'Over' : 'Under';
    return { profile, line, side, chance: side === 'Over' ? over : side === 'Under' ? under : null, score: research.finite(profile.raw?.modelScore) };
  }).filter(pick => !pick.profile.availability?.unavailable);
  const ranked = [...picks].sort((a, b) => (b.line !== null && b.chance !== null) - (a.line !== null && a.chance !== null) || (b.chance ?? -1) - (a.chance ?? -1) || (b.score ?? -1) - (a.score ?? -1));
  fillPreview(ranked.slice(0, 5).map(({ profile, line, side, chance }) => {
    const pick = line !== null && side ? `${side} ${fmt(line)} ${profile.unit}` : `${fmt(profile.forecast.point)} ${profile.unit} projected`;
    return `<li><a class="hub-row hub-row-player" href="${escapeHtml(playerHref(profile, false))}">${avatar(profile)}<span class="hub-row-main"><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(pick)} · ${escapeHtml(matchup(profile))}</small></span><span class="hub-proj"><b>${fmt(profile.forecast.point)}</b><small>${escapeHtml(profile.unit)}</small></span><span class="hub-chance${chance === null ? ' is-muted' : ''}">${chance === null ? '—' : Math.round(chance * 100) + '%'}</span></a></li>`;
  }).join(''), 'No projections are available for this market yet.');

  // Feature card: the model's strongest leans, highest first, measured from a 50/50 baseline.
  const chances = picks.map(pick => pick.chance).filter(value => value !== null).sort((a, b) => b - a);
  if (chances.length) {
    const shown = chances.slice(0, 24), top = shown[0], edge = value => Math.max(.002, value - .5);
    setVisual('models', bars(shown.map(edge), { max: edge(top) }), `Strongest ${shown.length} of ${chances.length} priced props · ${Math.round(top * 100)}% → ${Math.round(shown.at(-1) * 100)}% model chance`);
  } else emptyVisual('models', 'No priced props to chart yet');
}

async function loadTrendsHub() {
  const [{ profiles, research }, trends] = await Promise.all([loadProfiles(), import('./trends-data.js')]);
  setCount('players', profiles.length);
  if (profiles.length) setCardStat('players', `<b>${profiles.length}</b> players tracked`);
  const rows = trends.trendRows(profiles, trends.defaultTrendOptions()).filter(row => row.stats.rate !== null && row.stats.n >= 5).slice(0, 5);
  const lastTen = profile => research.selectGames(profile, { window: '10', venue: 'all' }).map(game => research.finite(game.value)).filter(value => value !== null).reverse();
  fillPreview(rows.map(({ p, line, stats }) => {
    const values = lastTen(p);
    return `<li><a class="hub-row hub-row-player" href="${escapeHtml(playerHref(p, true))}">${avatar(p)}<span class="hub-row-main"><strong>${escapeHtml(p.name)}</strong><small>Over ${fmt(line)} ${escapeHtml(p.unit)} · ${escapeHtml(matchup(p))}</small></span><span class="hub-spark" role="img" aria-label="${escapeHtml(`Last ${values.length} games: ${values.join(', ')}`)}">${bars(values, { line })}</span><span class="hub-rate"><b>${Math.round(stats.rate * 100)}%</b><small>${stats.hits}/${stats.n}</small></span></a></li>`;
  }).join(''), 'No player history for this market yet.');
  const lead = rows[0];
  if (lead) setVisual('trends', bars(lastTen(lead.p), { line: lead.line }), `${lead.p.name} · last ${lead.stats.n} · ${Math.round(lead.stats.rate * 100)}% over ${fmt(lead.line)}`);
  else emptyVisual('trends', 'No recent games to chart yet');
}

if (document.querySelector('[data-hub-preview]') && typeof fetch === 'function') {
  const run = hubProduct === 'ev' ? loadEvHub : hubProduct === 'models' ? loadModelsHub : loadTrendsHub;
  afterPaint(() => run().catch(() => {
    fillPreview('', 'Live data is unavailable right now. Open the tool for the full board.');
    emptyVisual(hubProduct, 'Live data is unavailable right now');
  }));
  // Headshots that fail to load fall back to the initials underneath (no inline handlers under CSP).
  document.addEventListener?.('error', event => { if (event.target?.matches?.('.hub-avatar img')) event.target.remove(); }, true);
  for (const node of document.querySelectorAll('[data-hub-count][data-value]')) setCount(node.dataset.hubCount, Number(node.dataset.value));
}

await accountReady;
const countNode = document.querySelector('[data-hub-saved-count]');
const copyNode = document.querySelector('[data-hub-saved-copy]');

if (countNode || copyNode) {
  const key = 'sports-lab-trends-watchlist-' + document.body.dataset.dashboardSport;

  function refreshSavedCount() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(saved)) throw Error('Invalid watchlist');
      const ids = saved.filter(id => typeof id === 'string' || typeof id === 'number' && Number.isFinite(id))
        .map(id => String(id).trim()).filter(Boolean);
      const count = new Set(ids).size;
      if (countNode) countNode.textContent = String(count);
      if (copyNode) copyNode.textContent = count === 0 ? 'No saved players yet' : `${count} saved ${count === 1 ? 'player' : 'players'}`;
    } catch {
      if (countNode) countNode.textContent = '—';
      if (copyNode) copyNode.textContent = 'Saved players unavailable in this browser';
    }
  }

  refreshSavedCount();
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) refreshSavedCount();
  });
  window.addEventListener('pageshow', refreshSavedCount);
}
