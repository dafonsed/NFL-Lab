import { accountStorage as storage, accountReady } from './account-sync.js';
await accountReady;
import { requestData, sportsbookMark } from './product-ui.js';
import { escape as esc } from './research-data.js';
import { icon } from './ui-icons.js';
import { playerPortrait } from './sports-identity.js';
import { syncTrendControl } from './trends-controls.js';
import { PARLAY_DEFAULTS, BACKTEST, HALF_LIFE, BASE_WEIGHT, buildParlay, relaxations, legReasons, legSummary, americanText } from './parlay-builder.js';

const $ = selector => document.querySelector(selector);
const sport = location.pathname.split('/')[1] || 'nfl', params = new URLSearchParams(location.search);
const SETTINGS_KEY = 'sports-lab-parlay-settings';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: sport === 'mlb' ? 'America/New_York' : 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDay = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const dayLabel = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const pct = (value, digits = 0) => Number.isFinite(value) ? (value * 100).toFixed(digits) + '%' : '—';
const money = value => '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = value => Number.isFinite(value) ? Number(value.toFixed(1)).toLocaleString('en-US') : '—';
const kickoff = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const count = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const sideWord = side => side === 'over' ? 'Over' : 'Under';

function savedSettings() {
  try { const value = JSON.parse(storage.getItem(SETTINGS_KEY)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
const clean = s => ({
  legs: Math.min(8, Math.max(2, Math.round(Number(s.legs)) || PARLAY_DEFAULTS.legs)),
  threshold: Math.min(100, Math.max(50, Math.round(Number(s.threshold) / 5) * 5 || PARLAY_DEFAULTS.threshold)),
  window: ['5', '10', '20'].includes(String(s.window)) ? String(s.window) : PARLAY_DEFAULTS.window,
  side: ['both', 'over', 'under'].includes(s.side) ? s.side : PARLAY_DEFAULTS.side,
  perGame: ['1', '2', 'any'].includes(String(s.perGame)) ? (s.perGame === 'any' ? 'any' : Number(s.perGame)) : PARLAY_DEFAULTS.perGame,
  maxFavorite: s.maxFavorite === null ? null : [-150, -200, -300, -500].includes(Number(s.maxFavorite)) ? Number(s.maxFavorite) : PARLAY_DEFAULTS.maxFavorite,
  skipInjured: typeof s.skipInjured === 'boolean' ? s.skipInjured : PARLAY_DEFAULTS.skipInjured,
  altLines: typeof s.altLines === 'boolean' ? s.altLines : PARLAY_DEFAULTS.altLines,
  stake: Number(s.stake) >= 1 && Number(s.stake) <= 100000 ? Number(s.stake) : PARLAY_DEFAULTS.stake,
  markets: Array.isArray(s.markets?.[sport]) ? s.markets[sport].map(String) : []
});
let settings = clean(savedSettings());
const state = { pool: null, excluded: new Set(), season: params.get('season') || '', week: params.get('week') || '', date: params.get('date') || today() };
let controller, requestId = 0;

function save() {
  const markets = { ...(savedSettings().markets || {}), [sport]: settings.markets };
  try { storage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, markets })); } catch {}
}
function change(next) { settings = clean({ ...settings, ...next, markets: { [sport]: next.markets ?? settings.markets } }); save(); render(); }
function updateUrl() {
  const q = new URLSearchParams({ view: 'parlay' });
  if (sport === 'nfl') { if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else q.set('date', state.date);
  history.replaceState(null, '', '/' + sport + '?' + q);
}
const slateLabel = () => {
  const s = state.pool?.slate;
  return sport === 'nfl' ? (s?.week ? `NFL · Week ${s.week}` : 'NFL') : `${sport.toUpperCase()} · ${dayLabel(s?.date || state.date)}`;
};
const marketOf = key => state.pool?.markets[key] || { label: key, unit: '' };

// ---------------------------------------------------------------- controls
function showThreshold(value) {
  const input = $('#pb-threshold');
  input.value = value; input.setAttribute('aria-valuetext', value + '% or better');
  input.style.setProperty('--t', String((value - 50) / 50));
  $('#pb-threshold-value').textContent = value + '%';
  for (const tick of document.querySelectorAll('[data-threshold]')) tick.classList.toggle('is-on', Number(tick.dataset.threshold) <= value);
}
function syncControls() {
  for (const group of document.querySelectorAll('.pb-segment')) for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === String(settings[group.dataset.setting])));
  showThreshold(settings.threshold);
  $('#pb-favorite').value = settings.maxFavorite === null ? '' : String(settings.maxFavorite); syncTrendControl($('#pb-favorite'));
  $('#pb-stake').value = settings.stake; $('#pb-injured').checked = settings.skipInjured; $('#pb-alt').checked = settings.altLines;
  // No selection means every market; picking one narrows to it, and All clears the selection.
  const markets = Object.entries(state.pool?.markets || {}), all = !settings.markets.length;
  $('#pb-markets').innerHTML = markets.length ? `<button type="button" class="pb-chip-toggle is-all" data-markets-all aria-pressed="${all}">All markets</button>` + markets.map(([key, m]) => `<button type="button" class="pb-chip-toggle" data-market="${esc(key)}" aria-pressed="${!all && settings.markets.includes(key)}">${esc(m.label)}</button>`).join('') : '<span class="pb-faint">Markets appear once lines load.</span>';
  $('#pb-markets-count').textContent = markets.length ? (all ? `All ${markets.length}` : `${settings.markets.length} of ${markets.length}`) : '';
  const defaults = clean({ ...PARLAY_DEFAULTS, stake: settings.stake, markets: {} });
  $('#pb-reset').disabled = !state.excluded.size && Object.keys(defaults).every(key => JSON.stringify(defaults[key]) === JSON.stringify(settings[key]));
}

// ---------------------------------------------------------------- pieces
const dots = (c, size = 10) => `<span class="pb-dots" aria-hidden="true">${c.leg.games.slice(0, size).reverse().map(r => `<i class="${(c.side === 'over' ? r[1] > c.line : r[1] < c.line) ? 'is-hit' : r[1] === c.line ? 'is-push' : ''}"></i>`).join('')}</span>`;
const portrait = leg => playerPortrait({ sport, name: leg.player, team: leg.team, position: leg.position, image: leg.image, playerId: leg.playerId });
// Alternate lines aren't on the public board, so they show no book and no price rather than a borrowed one.
const odds = c => c.price === null ? '<span class="pb-odds is-unpriced"><b>No posted price</b></span>' : `<span class="pb-odds">${sportsbookMark(c.leg.book)}<b>${esc(americanText(c.price))}</b></span>`;
const pickText = (c, market) => c.leg.alt ? `${c.leg.alt}+ ${market.label} · Alt line` : `${sideWord(c.side)} ${num(c.line)} ${market.label}`;
function trendsLink(c) {
  const q = new URLSearchParams({ view: 'trends', market: c.leg.market, researchPlayer: c.leg.key }), s = state.pool.slate;
  if (sport === 'nfl') { if (s.season && s.week) { q.set('season', s.season); q.set('week', s.week); } }
  else { q.set('date', s.date); if (sport === 'nba' || sport === 'nhl') q.set('game', c.leg.gameId); }
  return '/' + sport + '?' + q;
}
function bars(c) {
  const rows = c.leg.games.slice(0, c.size).reverse(), values = rows.map(r => r[1]);
  const top = Math.max(c.line * 1.35, ...values, 1), linePos = Math.min(100, (c.line / top) * 100);
  const result = v => (c.side === 'over' ? v > c.line : v < c.line) ? 'is-hit' : v === c.line ? 'is-push' : 'is-miss';
  const label = `Last ${rows.length} games, oldest first: ${rows.map(r => `${num(r[1])} vs ${r[4]}`).join(', ')}. Line ${num(c.line)}.`;
  return `<figure class="pb-chart" role="img" aria-label="${esc(label)}"><div class="pb-bars"><i class="pb-bars-line" style="bottom:${linePos}%"><span>${esc(num(c.line))}</span></i>${rows.map(r => `<span class="pb-bar ${result(r[1])}" style="--h:${Math.max(4, (Math.max(0, r[1]) / top) * 100)}%" title="${esc(`${r[0]} vs ${r[4]}: ${num(r[1])}`)}"><b>${esc(num(r[1]))}</b></span>`).join('')}</div><figcaption>Last ${rows.length} games, oldest to newest</figcaption></figure>`;
}
const split = (name, r, active = false) => r.n ? `<span class="pb-split${active ? ' is-active' : ''}"><small>${esc(name)}</small><b>${r.hits}/${r.n}</b></span>` : '';
function legCard(c, index, result) {
  const leg = c.leg, market = marketOf(leg.market), reasons = legReasons(c, market);
  const list = (tone, title, glyph) => { const items = reasons.filter(r => r.tone === tone); return items.length ? `<div class="pb-insight is-${tone}"><h4>${icon(glyph)}${title}</h4><ul>${items.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul></div>` : ''; };
  const facts = reasons.filter(r => r.tone === 'info');
  return `<li class="pb-leg">
    <div class="pb-leg-head">
      <span class="pb-leg-num">${index + 1}</span>${portrait(leg)}
      <div class="pb-leg-main"><strong>${esc(leg.player)}</strong><span class="pb-pick">${esc(pickText(c, market))}</span><small>${esc([leg.team, leg.position].filter(Boolean).join(' · '))} · ${esc(leg.game)} · ${esc(kickoff(leg.start))}</small></div>
      ${odds(c)}
    </div>
    <div class="pb-leg-stats">
      <div class="pb-rate"><span class="pb-rate-value">${c.recent.hits}/${c.recent.n}</span><small>last ${c.recent.n}</small>${dots(c, c.size)}</div>
      <div class="pb-meter"><span class="pb-meter-value">${pct(c.chance)}</span><small>expected</small><i><b style="width:${(c.chance * 100).toFixed(1)}%"></b></i></div>
      <div class="pb-splits">${split('L5', c.l5, settings.window === '5')}${split('L10', c.l10, settings.window === '10')}${split('L20', c.l20, settings.window === '20')}${split('vs ' + leg.opponent, c.h2h)}${c.venue ? split(leg.home ? 'Home' : 'Away', c.venue) : ''}</div>
    </div>
    ${bars(c)}
    <div class="pb-insights">${list('good', "Why it's in", 'check')}${list('warn', 'Watch for', 'info')}</div>
    ${facts.length ? `<ul class="pb-facts">${facts.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>` : ''}
    <div class="pb-leg-foot"><p>${esc(legSummary(c, { qualifying: result.qualifying, label: market.label }))}</p><div class="pb-leg-actions"><button type="button" class="pb-pill" data-swap="${esc(c.id)}">${icon('refresh')}<span>Swap</span></button><a class="pb-pill" href="${esc(trendsLink(c))}">${icon('trends')}<span>Open in Trends</span></a></div></div>
  </li>`;
}
const relaxLabel = c => c.threshold !== undefined ? `Lower the trend to ${c.threshold}%` : c.perGame ? 'Allow same-game legs' : c.maxFavorite === null ? 'Remove the odds limit' : c.side ? 'Use Overs and Unders' : c.skipInjured === false ? 'Include injury-listed players' : c.altLines ? 'Use alternate lines' : 'Use every market';
const relaxButton = (t, primary = false) => `<button class="${primary ? 'pb-cta' : 'pb-pill'}" type="button" data-relax='${esc(JSON.stringify(t.changes))}'>${esc(relaxLabel(t.changes))} <span class="pb-soft">→ ${t.legs} leg${t.legs === 1 ? '' : 's'}</span></button>`;
const emptyState = (glyph, title, text, actions = '') => `<div class="pb-empty"><span class="pb-cta-icon" aria-hidden="true">${icon(glyph)}</span><strong>${esc(title)}</strong><p>${esc(text)}</p>${actions ? `<div class="pb-empty-actions">${actions}</div>` : ''}</div>`;
const skeleton = () => `<div class="pb-skeleton" aria-hidden="true"><div class="pb-skeleton-summary"><b></b><b></b></div>${[0, 1, 2].map(() => '<div class="pb-skeleton-row"><i></i><span><b></b><b></b></span><em></em></div>').join('')}</div><p class="pb-faint pb-loading-note">Gathering every posted line and each player's recent games. This first build of the slate takes a little while; after that it opens instantly.</p>`;

function whyText(result) {
  const s = settings, t = result.ticket, n = result.legs.length, kind = s.side === 'over' ? 'Over' : s.side === 'under' ? 'Under' : 'side';
  const rule = s.perGame === 1 ? 'one per player and one per game, so no two legs ride on the same game' : s.perGame === 2 ? 'one per player and at most two per game' : 'one per player';
  return [
    `Out of ${count(result.qualifying, kind)} that hit in at least ${s.threshold}% of the last ${s.window} games (${count(result.players, 'player')}, ${count(result.games, 'game')}), these ${n} have the highest expected hit rates, with ${rule}.${s.altLines ? ` Alternate lines are on, so each player's stat also offers its highest milestone (like 20+ yards) that cleared ${s.threshold}%.` : ''}`,
    `If every trend held, this ticket would hit ${pct(t.trendChance)}. Trends cool off: on ${BACKTEST.hotSides.toLocaleString('en-US')} past lines that hit 70%+ of their last 10 games, ${pct(BACKTEST.hotActual)} hit the next time, not ${pct(BACKTEST.hotTrend)}. Using each leg's expected hit rate instead, the ticket lands about ${pct(t.chance, 1)} of the time.`
  ];
}
function ticketView(result) {
  const t = result.ticket, s = settings;
  const notes = [
    ...state.pool.notes.map(n => `<div class="pb-note">${icon('info')}<span>${esc(n)}</span></div>`),
    result.short ? `<div class="pb-note is-warn">${icon('info')}<div><span>Only ${count(result.legs.length, 'line')} can join a ${s.legs}-leg ticket under these settings.</span><div class="pb-note-actions">${relaxations(state.pool, { ...settings, excluded: [...state.excluded] }).slice(0, 3).map(r => relaxButton(r)).join('')}</div></div></div>` : '',
    t.sameGame ? `<div class="pb-note">${icon('info')}<span>Some legs share a game. Books price those together as a same-game parlay, so the payout will differ from these multiplied odds, and the legs tend to hit or miss together.</span></div>` : ''
  ].join('');
  const swaps = state.excluded.size ? `<button type="button" class="pb-text-button" data-reset-swaps>Undo ${count(state.excluded.size, 'swap')}</button>` : '';
  return `${notes}
    <div class="pb-summary">
      <div class="pb-payout"><span class="pb-overline">${result.legs.length}-leg parlay · ${esc(slateLabel())}</span>${t.priced
        ? `<strong class="pb-big-odds">${esc(americanText(t.american))}</strong><span class="pb-pays">${esc(money(s.stake))} pays <b>${esc(money(t.payout))}</b></span>`
        : `<strong class="pb-big-odds is-unpriced">No price</strong><span class="pb-pays">${esc(count(t.alternates, 'alternate line'))} ${t.alternates === 1 ? 'has' : 'have'} no posted price, so the payout needs your book's odds</span>`}</div>
      <dl class="pb-mini-stats">
        <div class="is-accent"><dt>Hit chance</dt><dd>${pct(t.chance, 1)}</dd><small>expected, legs independent</small></div>
        <div><dt>If trends held</dt><dd>${pct(t.trendChance, 1)}</dd><small>raw L${esc(s.window)} rates</small></div>
        <div><dt>Avg hit rate</dt><dd>${pct(t.averageRate)}</dd><small>last ${esc(s.window)}, per leg</small></div>
        <div><dt>Games</dt><dd>${t.games}</dd><small>${t.sameGame ? 'some share a game' : 'one leg each'}</small></div>
      </dl>
    </div>
    <div class="pb-why"><h3>Why these legs</h3>${whyText(result).map(p => `<p>${esc(p)}</p>`).join('')}${swaps}</div>
    <ol class="pb-legs">${result.legs.map((c, i) => legCard(c, i, result)).join('')}</ol>`;
}
function benchView(result) {
  const why = c => c.blocked.reason === 'player' ? `Same player as leg ${result.legs.indexOf(c.blocked.by) + 1}` : c.blocked.reason === 'game' ? `Same game as leg ${result.legs.indexOf(c.blocked.by) + 1}` : `Next in line · #${c.rank}`;
  return result.bench.map(c => `<li><div class="pb-row">${portrait(c.leg)}<span class="pb-row-main"><strong>${esc(c.leg.player)}</strong><small>${esc(pickText(c, marketOf(c.leg.market)))} · ${esc(c.leg.game)}</small>${dots(c, c.size)}</span><span class="pb-tag">${esc(why(c))}</span>${odds(c)}<span class="pb-row-side"><strong>${pct(c.chance)}</strong><small>${c.recent.hits}/${c.recent.n} · expected</small></span></div></li>`).join('');
}
function methodView() {
  return `<div class="pb-method-grid">
    <div><h3>${icon('filter')}What qualifies</h3><p>Every player line still open on this slate, in every market, Over and Under, from the same public lines the Trends boards show. A side qualifies when it hit at least your threshold over your window (at least 5 games), its odds are within your limit, and its game hasn't started. Players on the injury report are skipped unless you turn that off. With alternate lines on, each player's stat also gets its highest round-number milestone (1+, 2+ for counts; 10+, 20+ yards and so on) that clears your threshold, scored from the same games. The public board posts only the main line, so milestones carry no price.</p></div>
    <div><h3>${icon('trends')}Expected hit rate</h3><p>Hit rates over a few games run hot: on ${BACKTEST.sides.toLocaleString('en-US')} past Overs and Unders (NFL weeks 1–4 of 2026, MLB July 20 to September 27, 2026), lines that hit 70%+ of their last 10 games went on to hit ${pct(BACKTEST.hotActual)}, not ${pct(BACKTEST.hotTrend)}. So each side blends the player's last 20 games (newer ones count more; a game's weight halves every ${HALF_LIFE} games back) with how often that side of that market hit across the slate, counted as ${BASE_WEIGHT} games. On those past slates it predicted ${pct(BACKTEST.hotEstimate)} for that group.</p></div>
    <div><h3>${icon('parlay')}Picking legs</h3><p>Legs are taken highest expected hit rate first, one per player and within your per-game limit. In September games, the top tenth of hot lines by this rate hit ${pct(BACKTEST.topEstimateHit)}, against ${pct(BACKTEST.topRawHit)} picking by raw last-10 rate. Lines set far from a player's usual output are flagged: they hit ${pct(BACKTEST.farLineActual)}, against ${pct(BACKTEST.normalActual)} normally.</p></div>
    <div><h3>${icon('info')}Keep in mind</h3><p>Past hit rates don't guarantee future results, and the ticket chance treats legs as independent. Odds only set the payout; they come from a public comparison of US books and can move, so check your book before you bet.</p></div>
  </div>`;
}

// ---------------------------------------------------------------- render
function hero(result) {
  const pool = state.pool, now = Date.now(), open = pool ? pool.legs.filter(l => Date.parse(l.start) > now) : [];
  $('#pb-slate').textContent = pool ? slateLabel() : 'Loading the slate';
  $('#pb-asof').textContent = (pool?.linesAt ? 'Lines as of ' + new Date(pool.linesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Posted lines') + (state.updating ? ' · Updating…' : '');
  $('#pb-stat-lines').textContent = pool ? open.length.toLocaleString('en-US') : '—';
  $('#pb-stat-players').textContent = pool ? new Set(open.map(l => l.gameId + ':' + l.playerId)).size.toLocaleString('en-US') : '—';
  $('#pb-stat-games').textContent = pool ? new Set(open.map(l => l.gameId)).size.toLocaleString('en-US') : '—';
  $('#pb-stat-qualify-label').textContent = `Hit ${settings.threshold}%+ of last ${settings.window}`;
  $('#pb-stat-qualify').textContent = result ? result.qualifying.toLocaleString('en-US') : '—';
}
function render() {
  syncControls();
  const pool = state.pool, result$ = $('#pb-result'), chip = $('#pb-ticket-chip');
  $('#pb-bench').hidden = true; chip.hidden = true;
  if (!pool) { hero(null); return; }
  result$.setAttribute('aria-busy', 'false');
  const now = Date.now(), open = pool.legs.filter(l => Date.parse(l.start) > now);
  if (!open.length) {
    hero(null);
    const next = sport === 'nfl' ? (pool.weeks || []).find(w => w.season === pool.slate.season && w.week === pool.slate.week + 1) : null;
    const action = sport === 'nfl' ? (next ? `<button class="pb-cta" type="button" data-week="${next.season}:${next.week}">Try Week ${next.week}</button>` : '') : `<button class="pb-cta" type="button" data-date="${shiftDay(state.date, 1)}">Next day · ${esc(dayLabel(shiftDay(state.date, 1)))}</button>`;
    const message = pool.notes.find(n => /soccer/.test(n)) || (sport === 'nfl' ? "Every game on this week's slate has started or has no posted player lines yet. Next week's lines usually post early in the week." : 'No game on this date has open player lines. Try another date.');
    result$.innerHTML = emptyState('calendar', 'No open lines to build from', message, action);
    return;
  }
  const result = buildParlay(pool, { ...settings, excluded: [...state.excluded] }, now);
  hero(result);
  if (result.legs.length < 2) {
    const tips = relaxations(pool, { ...settings, excluded: [...state.excluded] }, now);
    const swaps = state.excluded.size ? `<button type="button" class="pb-pill" data-reset-swaps>Undo ${count(state.excluded.size, 'swap')}</button>` : '';
    const text = result.qualifying ? `${count(result.qualifying, 'side')} hit at least ${settings.threshold}% of the last ${settings.window} games, but all on the same player or game. Loosen a setting to build a parlay.` : `No side hit at least ${settings.threshold}% of the last ${settings.window} games under these settings. Loosen a setting to build a parlay.`;
    result$.innerHTML = emptyState('parlay', result.qualifying ? 'Not enough lines for a parlay yet' : 'No lines meet these settings', text, tips.map((t, i) => relaxButton(t, i === 0)).join('') + swaps);
    return;
  }
  chip.hidden = false; chip.textContent = `${result.legs.length} legs`;
  result$.innerHTML = ticketView(result);
  if (result.bench.length) { $('#pb-bench').hidden = false; $('#pb-bench-list').innerHTML = benchView(result); }
}

// The last pool for each slate is kept on this device (not account sync: it's ~100 KB and public data)
// and shown at once on the next visit while fresh lines load. Older than a day, it's not shown.
const POOL_CACHE = 'vo-parlay-pool-v1:';
const poolKey = () => POOL_CACHE + sport + ':' + (sport === 'nfl' ? (state.season && state.week ? state.season + '-' + state.week : 'current') : state.date);
function cachedPool() {
  try { const pool = JSON.parse(globalThis.localStorage.getItem(poolKey())); return pool && Date.now() - Date.parse(pool.builtAt) < 86400000 && Array.isArray(pool.legs) ? pool : null; } catch { return null; }
}
function keepPool(pool) {
  try { const { refreshing, ...saved } = pool; globalThis.localStorage.setItem(poolKey(), JSON.stringify(saved)); } catch { /* Storage full or disabled: the page still works. */ }
}
let followUp = null;
function updating(on) { state.updating = on; $('#pb-asof').classList.toggle('is-updating', on); hero(state.pool ? buildParlay(state.pool, { ...settings, excluded: [...state.excluded] }) : null); }

async function load({ force = false, quiet = false } = {}) {
  const id = ++requestId; controller?.abort(); controller = new AbortController(); clearTimeout(followUp);
  $('#pb-refresh').disabled = true;
  if (!state.pool && !quiet) {
    const cached = cachedPool();
    if (cached) { state.pool = cached; render(); }
  }
  if (!state.pool) { $('#pb-result').setAttribute('aria-busy', 'true'); $('#pb-result').innerHTML = skeleton(); }
  else updating(true);
  const q = new URLSearchParams({ sport });
  if (sport === 'nfl') { if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else q.set('date', state.date);
  if (force) q.set('refresh', '1');
  try {
    const pool = await requestData('/api/trends/parlay?' + q, { signal: controller.signal, timeout: 150000 });
    if (id !== requestId) return;
    state.updating = false; $('#pb-asof').classList.remove('is-updating');
    // The server sent its saved pool and is building a newer one: ask again once it should be ready.
    if (pool.refreshing) followUp = setTimeout(() => load({ quiet: true }), 20000);
    keepPool(pool);
    state.pool = pool;
    const known = Object.keys(pool.markets);
    if (settings.markets.length && known.length) settings.markets = settings.markets.filter(m => known.includes(m));
    if (sport === 'nfl') {
      const current = pool.slate, weeks = (pool.weeks || []).filter(w => w.season === current.season && w.week >= current.week).sort((a, b) => a.week - b.week).slice(0, 4);
      $('#pb-week').innerHTML = '<option value="">This week · automatic</option>' + weeks.map(w => `<option value="${w.season}:${w.week}">${w.season} · Week ${w.week}</option>`).join('');
      $('#pb-week').value = state.season && state.week ? `${state.season}:${state.week}` : ''; syncTrendControl($('#pb-week'));
    } else $('#pb-date').value = state.date;
    updateUrl(); render();
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    // A saved slate already on screen stays up; only an empty page shows the error.
    if (state.pool) { $('#pb-asof').textContent = 'Couldn’t refresh · showing lines as of ' + new Date(state.pool.linesAt || state.pool.builtAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return; }
    hero(null);
    $('#pb-result').setAttribute('aria-busy', 'false');
    $('#pb-result').innerHTML = emptyState('info', 'Lines could not load', error.message, '<button class="pb-cta" type="button" data-retry>Try again</button>');
  } finally { if (id === requestId) { $('#pb-refresh').disabled = false; if (state.updating) { state.updating = false; $('#pb-asof').classList.remove('is-updating'); } } }
}

// ---------------------------------------------------------------- wiring
for (const node of document.querySelectorAll('[data-pb-icon]')) node.outerHTML = icon(node.dataset.pbIcon);
const sports = document.querySelector('.site-sports');
if (sports) $('#pb-sports').append(sports);
$('#pb-week-label').hidden = sport !== 'nfl'; $('#pb-date-label').hidden = sport === 'nfl';
$('#pb-date').value = state.date;
$('#pb-method').innerHTML = methodView();
$('#pb-refresh').addEventListener('click', () => load({ force: true }));
// Back to the default ticket; the member's stake stays.
$('#pb-reset').addEventListener('click', () => { state.excluded.clear(); change({ ...PARLAY_DEFAULTS, stake: settings.stake, markets: [] }); });
$('#pb-form').addEventListener('submit', e => e.preventDefault());
$('#pb-threshold').addEventListener('input', e => showThreshold(Number(e.target.value)));
$('#pb-range-ticks').addEventListener('click', e => { const tick = e.target.closest('[data-threshold]'); if (tick) { change({ threshold: Number(tick.dataset.threshold) }); $('#pb-threshold').focus({ preventScroll: true }); } });
$('#pb-threshold').addEventListener('change', e => change({ threshold: Number(e.target.value) }));
$('#pb-favorite').addEventListener('change', e => change({ maxFavorite: e.target.value === '' ? null : Number(e.target.value) }));
$('#pb-stake').addEventListener('change', e => change({ stake: Number(e.target.value) }));
$('#pb-injured').addEventListener('change', e => change({ skipInjured: e.target.checked }));
$('#pb-alt').addEventListener('change', e => change({ altLines: e.target.checked }));
$('#pb-week').addEventListener('change', e => { [state.season, state.week] = e.target.value ? e.target.value.split(':') : ['', '']; state.excluded.clear(); state.pool = null; load(); });
$('#pb-date').addEventListener('change', e => { if (!e.target.value) return; state.date = e.target.value; state.excluded.clear(); state.pool = null; load(); });
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const segment = b.closest('.pb-segment');
  if (segment && b.dataset.value) {
    const key = segment.dataset.setting, value = key === 'legs' || key === 'perGame' && b.dataset.value !== 'any' ? Number(b.dataset.value) : b.dataset.value;
    change({ [key]: value }); document.querySelector(`.pb-segment[data-setting="${key}"] [data-value="${b.dataset.value}"]`)?.focus({ preventScroll: true });
  }
  if (b.dataset.market && b.closest('#pb-markets')) {
    const all = Object.keys(state.pool?.markets || {}), on = new Set(settings.markets);
    on.has(b.dataset.market) ? on.delete(b.dataset.market) : on.add(b.dataset.market);
    change({ markets: on.size === all.length ? [] : [...on] });
    document.querySelector(`#pb-markets [data-market="${CSS.escape(b.dataset.market)}"]`)?.focus({ preventScroll: true });
  }
  if (b.hasAttribute('data-markets-all')) { change({ markets: [] }); $('#pb-markets [data-markets-all]')?.focus({ preventScroll: true }); }
  if (b.dataset.swap) {
    const index = [...document.querySelectorAll('[data-swap]')].indexOf(b);
    state.excluded.add(b.dataset.swap); render();
    document.querySelectorAll('.pb-leg')[index]?.scrollIntoView({ block: 'nearest' });
  }
  if (b.hasAttribute('data-reset-swaps')) { state.excluded.clear(); render(); }
  if (b.dataset.relax) { try { change(JSON.parse(b.dataset.relax)); } catch {} }
  if (b.dataset.week) { [state.season, state.week] = b.dataset.week.split(':'); state.excluded.clear(); state.pool = null; load(); }
  if (b.dataset.date) { state.date = b.dataset.date; $('#pb-date').value = state.date; state.excluded.clear(); state.pool = null; load(); }
  if (b.hasAttribute('data-retry')) load({ force: true });
});
syncControls(); hero(null);
await load();
