import { accountStorage as storage, accountReady } from './account-sync.js';
await accountReady;
import { requestData, emptyBoard } from './product-ui.js';
import { escape as esc } from './research-data.js';
import { icon } from './ui-icons.js';
import { PARLAY_DEFAULTS, BACKTEST, HALF_LIFE, TREND_WEIGHT, TREND_CAP, MODEL_WEIGHT, MODEL_CAP, buildParlay, relaxations, legReasons, legSummary, americanText } from './parlay-builder.js';

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

// The member's +EV no-vig method setting, when they've saved one, so both tools agree.
function savedMethod() {
  try { const method = JSON.parse(storage.getItem('sportslab-ev-workbench-v1'))?.suite?.settings?.devigMethod; return ['multiplicative', 'additive', 'power', 'probit'].includes(method) ? method : null; } catch { return null; }
}
function savedSettings() {
  try { const value = JSON.parse(storage.getItem(SETTINGS_KEY)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
const clean = s => ({
  legs: Math.min(10, Math.max(2, Math.round(Number(s.legs)) || PARLAY_DEFAULTS.legs)),
  threshold: Math.min(100, Math.max(50, Math.round(Number(s.threshold) / 5) * 5 || PARLAY_DEFAULTS.threshold)),
  window: ['5', '10', '20'].includes(String(s.window)) ? String(s.window) : PARLAY_DEFAULTS.window,
  side: ['both', 'over', 'under'].includes(s.side) ? s.side : PARLAY_DEFAULTS.side,
  goal: ['value', 'safe'].includes(s.goal) ? s.goal : PARLAY_DEFAULTS.goal,
  perGame: ['1', '2', 'any'].includes(String(s.perGame)) ? (s.perGame === 'any' ? 'any' : Number(s.perGame)) : PARLAY_DEFAULTS.perGame,
  maxFavorite: s.maxFavorite === null ? null : [-150, -200, -300, -500].includes(Number(s.maxFavorite)) ? Number(s.maxFavorite) : PARLAY_DEFAULTS.maxFavorite,
  skipInjured: typeof s.skipInjured === 'boolean' ? s.skipInjured : PARLAY_DEFAULTS.skipInjured,
  stake: Number(s.stake) >= 1 && Number(s.stake) <= 100000 ? Number(s.stake) : PARLAY_DEFAULTS.stake,
  markets: Array.isArray(s.markets?.[sport]) ? s.markets[sport].map(String) : []
});
const stored = savedSettings();
let settings = clean(stored);
const state = { pool: null, excluded: new Set(), season: params.get('season') || '', week: params.get('week') || '', date: params.get('date') || today(), loading: false };
let controller, requestId = 0;

function save() {
  const markets = { ...(savedSettings().markets || {}), [sport]: settings.markets };
  try { storage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, markets })); } catch {}
}
function updateUrl() {
  const q = new URLSearchParams({ view: 'parlay' });
  if (sport === 'nfl') { if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else q.set('date', state.date);
  history.replaceState(null, '', '/' + sport + '?' + q);
}

function syncControls() {
  $('#pb-legs').textContent = settings.legs;
  $('[data-legs-step="-1"]').disabled = settings.legs <= 2; $('[data-legs-step="1"]').disabled = settings.legs >= 10;
  $('#pb-threshold').value = settings.threshold; $('#pb-threshold-value').textContent = settings.threshold + '%';
  for (const group of document.querySelectorAll('.pb-segment')) for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === String(settings[group.dataset.setting])));
  $('#pb-favorite').value = settings.maxFavorite === null ? '' : String(settings.maxFavorite);
  $('#pb-stake').value = settings.stake; $('#pb-injured').checked = settings.skipInjured;
  const markets = Object.entries(state.pool?.markets || {});
  $('#pb-markets').innerHTML = markets.length ? markets.map(([key, m]) => `<button type="button" data-market="${esc(key)}" aria-pressed="${!settings.markets.length || settings.markets.includes(key)}">${esc(m.label)}</button>`).join('') : '<span class="pb-muted">Markets appear once lines load.</span>';
  const changed = [settings.side !== 'both', settings.perGame !== 1, settings.maxFavorite !== -300, !settings.skipInjured, settings.markets.length > 0].filter(Boolean).length;
  $('#pb-more-count').textContent = changed ? `· ${changed} changed` : '';
}

const slateLabel = () => {
  const s = state.pool?.slate;
  return sport === 'nfl' ? (s?.week ? `NFL Week ${s.week}` : 'NFL') : `${sport.toUpperCase()} · ${dayLabel(s?.date || state.date)}`;
};
function trendsLink(c) {
  const q = new URLSearchParams({ view: 'trends', market: c.leg.market, researchPlayer: c.leg.key });
  const s = state.pool.slate;
  if (sport === 'nfl') { if (s.season && s.week) { q.set('season', s.season); q.set('week', s.week); } }
  else { q.set('date', s.date); if (sport === 'nba' || sport === 'nhl') q.set('game', c.leg.gameId); }
  return '/' + sport + '?' + q;
}

function gameBars(c) {
  const rows = c.leg.games.slice(0, c.size).reverse(), values = rows.map(r => r[1]);
  const top = Math.max(c.line * 1.4, ...values, 1), linePos = Math.min(100, (c.line / top) * 100);
  const result = v => (c.side === 'over' ? v > c.line : v < c.line) ? 'hit' : v === c.line ? 'push' : 'miss';
  const label = `Last ${rows.length} games, oldest first: ${rows.map(r => `${num(r[1])} vs ${r[4]}`).join(', ')}. Line ${num(c.line)}.`;
  return `<div class="pb-bars" role="img" aria-label="${esc(label)}"><i class="pb-bars-line" style="bottom:${linePos}%"></i>${rows.map(r => `<span class="pb-bar ${result(r[1])}" style="height:${Math.max(3, (Math.max(0, r[1]) / top) * 100)}%" title="${esc(`${r[0]} vs ${r[4]}: ${num(r[1])}`)}"><b>${esc(num(r[1]))}</b></span>`).join('')}</div>`;
}
function splitChip(name, r, active = false) {
  return r.n ? `<span class="pb-split${active ? ' active' : ''}"><small>${name}</small><b>${r.hits}/${r.n}</b></span>` : '';
}
function legCard(c, index, result) {
  const leg = c.leg, market = state.pool.markets[leg.market] || { label: leg.market, unit: '' };
  const reasons = legReasons(c, market);
  const initials = leg.player.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
  return `<li class="pb-leg">
    <div class="pb-leg-head">
      <span class="pb-leg-number">${index + 1}</span>
      ${leg.image ? `<img src="${esc(leg.image)}" alt="" width="44" height="48" loading="lazy">` : `<span class="td-avatar" aria-hidden="true">${esc(initials)}</span>`}
      <div class="pb-leg-title"><h3>${esc(leg.player)}</h3><p><strong>${c.side === 'over' ? 'Over' : 'Under'} ${esc(num(c.line))} ${esc(market.label)}</strong></p><small>${esc([leg.team, leg.position].filter(Boolean).join(' · '))} · ${esc(leg.game)} · ${esc(kickoff(leg.start))}</small></div>
      <div class="pb-price"><small>${esc(leg.book)}</small><b>${esc(americanText(c.price))}</b></div>
    </div>
    <div class="pb-leg-body">
      <div class="pb-splits">${splitChip('L5', c.l5, settings.window === '5')}${splitChip('L10', c.l10, settings.window === '10')}${splitChip('L20', c.l20, settings.window === '20')}${splitChip('vs ' + leg.opponent, c.h2h)}${c.venue ? splitChip(leg.home ? 'Home' : 'Away', c.venue) : ''}<span class="pb-split pb-estimate"><small>Our estimate</small><b>${pct(c.chance)}</b></span><span class="pb-split"><small>Book</small><b>${pct(c.market)}</b></span></div>
      ${gameBars(c)}
      <p class="pb-leg-summary">${esc(legSummary(c, { goal: settings.goal, qualifying: result.qualifying }))}</p>
      <ul class="pb-reasons">${reasons.map(r => `<li class="${r.tone}">${icon(r.tone === 'good' ? 'check' : r.tone === 'warn' ? 'info' : 'tag')}<span>${esc(r.text)}</span></li>`).join('')}</ul>
      <div class="pb-leg-actions"><button type="button" class="button subtle" data-swap="${esc(c.id)}">${icon('refresh')}<span>Swap this leg</span></button><a class="button subtle" href="${esc(trendsLink(c))}">${icon('trends')}<span>Open in Trends</span></a></div>
    </div>
  </li>`;
}

function whyText(result) {
  const s = settings, t = result.ticket, n = result.legs.length;
  const rule = s.perGame === 1 ? 'one per player and one per game, so no two legs ride on the same game' : s.perGame === 2 ? 'one per player and at most two per game' : 'one per player';
  const kind = s.side === 'over' ? 'Over' : s.side === 'under' ? 'Under' : 'side';
  const lines = [`Out of ${result.qualifying} ${kind}${result.qualifying === 1 ? '' : 's'} that hit in at least ${s.threshold}% of the last ${s.window} games (${result.players} player${result.players === 1 ? '' : 's'}, ${result.games} game${result.games === 1 ? '' : 's'}), these ${n} rank highest by ${s.goal === 'value' ? 'expected return' : 'chance to hit'}, with ${rule}.`];
  lines.push(`If every trend simply held, this ticket would hit ${pct(t.trendChance)}. It won't: on ${BACKTEST.hotSides.toLocaleString('en-US')} past lines that hit 70%+ of their last 10 games, ${pct(BACKTEST.hotActual)} went on to hit, about what their prices said (${pct(BACKTEST.hotPrice)}), not the ${pct(BACKTEST.hotTrend)} their trends said. Books set these lines knowing the trends. So each leg's chance starts from its price and moves only as far as the trend${result.legs.some(c => c.model !== null) ? ' and our projection model' : ''} earned on past slates. That gives ${pct(t.chance, 1)}; the prices alone imply ${pct(t.bookChance, 1)}. At ${americanText(t.american)} the ticket needs ${pct(t.breakEven, 1)} to break even.`);
  const losing = result.legs.filter(c => c.ev <= 0).length;
  lines.push(t.ev > 0 ? `By our estimate that's an expected return of +${pct(t.ev, 1)} per dollar.` : `By our estimate it returns ${pct(t.ev, 1)} per dollar${losing ? `: ${losing === n ? 'none' : n - losing} of the ${n} legs ${losing === n ? 'beat' : 'beats'} ${losing === n ? 'their' : 'its'} price` : ''}. Every parlay pays the book's margin once per leg; this is the ticket that gives up the least while meeting your settings.`);
  return lines;
}

function benchTable(result) {
  if (!result.bench.length) return '';
  const why = c => c.blocked.reason === 'player' ? `Same player as leg ${result.legs.indexOf(c.blocked.by) + 1}` : c.blocked.reason === 'game' ? `Same game as leg ${result.legs.indexOf(c.blocked.by) + 1}` : `Next in line (#${c.rank})`;
  return `<section class="pb-bench" aria-labelledby="pb-bench-title"><h2 id="pb-bench-title">Next best lines</h2><p class="pb-muted">What would come in if you swap a leg, and why each one is out.</p><div class="pb-bench-scroll"><table><thead><tr><th scope="col">Player</th><th scope="col">Pick</th><th scope="col">Price</th><th scope="col">L${esc(settings.window)}</th><th scope="col">Estimate</th><th scope="col">Why it's out</th></tr></thead><tbody>${result.bench.map(c => `<tr><th scope="row">${esc(c.leg.player)}<small>${esc(c.leg.game)}</small></th><td>${c.side === 'over' ? 'Over' : 'Under'} ${esc(num(c.line))} ${esc(state.pool.markets[c.leg.market]?.label || c.leg.market)}</td><td>${esc(americanText(c.price))}</td><td>${c.recent.hits}/${c.recent.n}</td><td>${pct(c.chance)} <small>vs ${pct(c.market)}</small></td><td>${esc(why(c))}</td></tr>`).join('')}</tbody></table></div></section>`;
}

const capPoints = v => { const n = Number((v * 100).toFixed(2)); return `${n} point${n === 1 ? '' : 's'}`; };
function methodNote() {
  return `<details class="pb-method"><summary>${icon('info')}<span>How the builder decides</span></summary><div>
    <p><strong>Qualifying lines.</strong> Every player line a sportsbook still offers on this slate, in every market, Over and Under. A side qualifies when it hit at least your threshold over your chosen window (at least 5 games), its price is no shorter than your favorite limit, and the game hasn't started. Players on the injury report are skipped unless you turn that off.</p>
    <p><strong>What we tested.</strong> Before building this we checked trends against ${BACKTEST.sides.toLocaleString('en-US')} past Overs and Unders (NFL weeks 1–4 of 2026, MLB July 20 to September 27, 2026). Raw hit rates predicted results much worse than the books' own prices. Lines that hit 70%+ of their last 10 games went on to hit ${pct(BACKTEST.hotActual)}, against ${pct(BACKTEST.hotPrice)} from their no-vig prices and ${pct(BACKTEST.hotTrend)} from their trends. When a trend beat its price by 30 points or more, those lines hit ${pct(BACKTEST.wideGapActual)}: right at their prices (${pct(BACKTEST.wideGapPrice)}), nowhere near their trends (${pct(BACKTEST.wideGapTrend)}).</p>
    <p><strong>The estimate.</strong> So each side's chance is the book's no-vig price (in MLB, adjusted for a bias past results showed: favorites hit a little more often than priced, and prices posted on one side only run high), plus ${TREND_WEIGHT * 100}% of the gap between the player's recent record and that price (newer games count more), at most ${capPoints(TREND_WEIGHT * TREND_CAP)}, plus ${MODEL_WEIGHT * 100}% of our projection model's gap from the price, at most ${capPoints(MODEL_WEIGHT * MODEL_CAP)}. In later games, the top tenth of hot lines by this estimate roughly broke even on single bets (+${pct(BACKTEST.topEstimateRoi, 1)}); the top tenth by how far the trend beat the price lost ${pct(-BACKTEST.topTrendRoi, 1)}, and all hot lines lost ${pct(-BACKTEST.hotRoi, 1)}.</p>
    <p><strong>Picking legs.</strong> "Best value" ranks by expected return (estimate × decimal odds); "Most likely to hit" ranks by the estimate alone. Legs are taken best first, one per player, and with your per-game limit. Ticket odds multiply the legs' prices, which is what books pay on legs from different games. A red flag marks a leg whose trend beats its price by 30+ points: those are where the book most often knows something the record doesn't. Same-game parlays are re-priced by the book for correlation, so their real payout differs.</p>
    <p><strong>Limits.</strong> Past hit rates don't guarantee future results. The ticket chance assumes the legs are independent. Prices come from a public comparison of US books and can move; check your book before you bet.</p>
  </div></details>`;
}

function render() {
  const pool = state.pool;
  syncControls();
  if (!pool) return;
  const now = Date.now(), open = pool.legs.filter(l => Date.parse(l.start) > now), openGames = pool.games.filter(g => Date.parse(g.start) > now).length;
  const lines = `${open.length} posted line${open.length === 1 ? '' : 's'} · ${openGames} game${openGames === 1 ? '' : 's'} · ${slateLabel()}${pool.linesAt ? ' · lines as of ' + new Date(pool.linesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}`;
  $('#pb-status').textContent = lines;
  $('#pb-result').setAttribute('aria-busy', 'false');
  if (!open.length) {
    const next = sport === 'nfl' ? (pool.weeks || []).filter(w => w.season === pool.slate.season && w.week === pool.slate.week + 1)[0] : null;
    const actions = sport === 'nfl' ? (next ? `<button class="button subtle" type="button" data-week="${next.season}:${next.week}">Try Week ${next.week}</button>` : '') : `<button class="button subtle" type="button" data-date="${shiftDay(state.date, 1)}">Next day · ${esc(dayLabel(shiftDay(state.date, 1)))}</button>`;
    const message = pool.notes.find(n => /soccer/.test(n)) || (sport === 'nfl' ? 'Every game on this week\'s slate has started or has no posted player lines yet. Lines for the next week usually post early in the week.' : 'No game on this date has posted player lines that are still open. Try another date.');
    $('#pb-result').innerHTML = emptyBoard('No open lines to build from', message, actions);
    return;
  }
  const result = buildParlay(pool, { ...settings, excluded: [...state.excluded], method: savedMethod() || 'multiplicative' }, now);
  const notes = pool.notes.map(n => `<div class="td-notice">${esc(n)}</div>`).join('');
  const swaps = state.excluded.size ? `<button type="button" class="pb-link" data-reset-swaps>Undo ${state.excluded.size} swap${state.excluded.size > 1 ? 's' : ''}</button>` : '';
  if (!result.legs.length || result.legs.length < 2) {
    const tips = relaxations(pool, { ...settings, excluded: [...state.excluded] }, now);
    $('#pb-result').innerHTML = notes + emptyBoard(result.qualifying ? `Only ${result.legs.length} line can join a ticket` : 'No lines meet these settings', `${result.qualifying} side${result.qualifying === 1 ? '' : 's'} hit at least ${settings.threshold}% of the last ${settings.window} games${result.qualifying ? ', all on the same player or game' : ''}. Loosen a setting to build a parlay.`, tips.map(relaxButton).join('') + swaps);
    return;
  }
  const t = result.ticket;
  const short = result.short ? `<div class="td-notice">Only ${result.legs.length} lines meet your settings for a ${settings.legs}-leg ticket. <span class="pb-relax">${relaxations(pool, { ...settings, excluded: [...state.excluded] }, now).slice(0, 3).map(relaxButton).join('')}</span></div>` : '';
  const sameGame = t.sameGame ? '<div class="td-notice">Two or more legs share a game. Books price same-game legs together as a same-game parlay, so the payout will differ from these multiplied odds, and the legs move together more than the ticket chance assumes.</div>' : '';
  $('#pb-result').innerHTML = `${notes}${short}${sameGame}
    <section class="pb-ticket" aria-labelledby="pb-ticket-title">
      <header class="pb-ticket-head">
        <div class="pb-ticket-price"><span class="pb-kicker" id="pb-ticket-title">${result.legs.length}-leg parlay · ${esc(slateLabel())}</span><strong>${esc(americanText(t.american))}</strong><small>${esc(money(settings.stake))} pays ${esc(money(t.payout))}</small></div>
        <dl class="pb-metrics">
          <div><dt>Our hit chance</dt><dd>${pct(t.chance, 1)}</dd><small>needs ${pct(t.breakEven, 1)} to break even</small></div>
          <div><dt>Book's chance</dt><dd>${pct(t.bookChance, 1)}</dd><small>from no-vig prices</small></div>
          <div><dt>If trends held</dt><dd>${pct(t.trendChance, 1)}</dd><small>raw L${esc(settings.window)} rates multiplied</small></div>
          <div class="${t.ev > 0 ? 'positive' : 'negative'}"><dt>Expected return</dt><dd>${t.ev > 0 ? '+' : ''}${pct(t.ev, 1)}</dd><small>per dollar, by our estimate</small></div>
        </dl>
      </header>
      <div class="pb-why"><h2>Why these legs</h2>${whyText(result).map(p => `<p>${esc(p)}</p>`).join('')}${swaps ? `<p>${swaps}</p>` : ''}</div>
      <ol class="pb-legs">${result.legs.map((c, i) => legCard(c, i, result)).join('')}</ol>
    </section>
    ${benchTable(result)}
    ${methodNote()}`;
}

async function load({ force = false } = {}) {
  const id = ++requestId; controller?.abort(); controller = new AbortController();
  state.loading = true; $('#pb-refresh').disabled = true; $('#pb-result').setAttribute('aria-busy', 'true');
  $('#pb-status').textContent = 'Loading posted lines…';
  if (!state.pool) $('#pb-result').innerHTML = '<div class="td-empty"><div class="loader"></div><h3>Gathering every posted line</h3><p>Each market\'s lines and every player\'s recent games. The first load after a quiet spell can take up to a minute.</p></div>';
  const q = new URLSearchParams({ sport });
  if (sport === 'nfl') { if (state.season && state.week) { q.set('season', state.season); q.set('week', state.week); } }
  else q.set('date', state.date);
  if (force) q.set('refresh', '1');
  try {
    const pool = await requestData('/api/trends/parlay?' + q, { signal: controller.signal, timeout: 150000 });
    if (id !== requestId) return;
    state.pool = pool;
    const known = Object.keys(pool.markets);
    if (settings.markets.length && known.length) settings.markets = settings.markets.filter(m => known.includes(m));
    if (sport === 'nfl') {
      const current = pool.slate, weeks = (pool.weeks || []).filter(w => w.season === current.season && w.week >= current.week).sort((a, b) => a.week - b.week).slice(0, 4);
      $('#pb-week').innerHTML = '<option value="">This week · automatic</option>' + weeks.map(w => `<option value="${w.season}:${w.week}">${w.season} · Week ${w.week}</option>`).join('');
      $('#pb-week').value = state.season && state.week ? `${state.season}:${state.week}` : '';
    } else $('#pb-date').value = state.date;
    updateUrl(); render();
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    state.pool = null;
    $('#pb-status').textContent = 'Lines could not load';
    $('#pb-result').setAttribute('aria-busy', 'false');
    $('#pb-result').innerHTML = emptyBoard('Lines could not load', error.message, '<button class="button subtle" type="button" data-retry>Try again</button>');
  } finally { if (id === requestId) { state.loading = false; $('#pb-refresh').disabled = false; } }
}

const relaxLabel = c => c.threshold !== undefined ? `Lower the trend to ${c.threshold}%` : c.perGame ? 'Allow same-game legs' : c.maxFavorite === null ? 'Remove the favorite limit' : c.side ? 'Allow Overs and Unders' : c.skipInjured === false ? 'Include injury-listed players' : 'Use every market';
const relaxButton = t => `<button class="button subtle" type="button" data-relax='${esc(JSON.stringify(t.changes))}'>${esc(relaxLabel(t.changes))} → ${t.legs} leg${t.legs === 1 ? '' : 's'}</button>`;
function change(next) { settings = clean({ ...settings, ...next, markets: { [sport]: next.markets ?? settings.markets } }); save(); render(); }

$('#pb-week-label').hidden = sport !== 'nfl'; $('#pb-date-label').hidden = sport === 'nfl';
$('#pb-date').value = state.date;
$('#pb-refresh').addEventListener('click', () => load({ force: true }));
$('#pb-form').addEventListener('submit', e => e.preventDefault());
$('#pb-threshold').addEventListener('input', e => { $('#pb-threshold-value').textContent = e.target.value + '%'; });
$('#pb-threshold').addEventListener('change', e => change({ threshold: Number(e.target.value) }));
$('#pb-favorite').addEventListener('change', e => change({ maxFavorite: e.target.value === '' ? null : Number(e.target.value) }));
$('#pb-stake').addEventListener('change', e => change({ stake: Number(e.target.value) }));
$('#pb-injured').addEventListener('change', e => change({ skipInjured: e.target.checked }));
$('#pb-week').addEventListener('change', e => { [state.season, state.week] = e.target.value ? e.target.value.split(':') : ['', '']; state.excluded.clear(); load(); });
$('#pb-date').addEventListener('change', e => { if (!e.target.value) return; state.date = e.target.value; state.excluded.clear(); load(); });
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.legsStep) change({ legs: settings.legs + Number(b.dataset.legsStep) });
  const segment = b.closest('.pb-segment');
  if (segment && b.dataset.value) change({ [segment.dataset.setting]: segment.dataset.setting === 'perGame' && b.dataset.value !== 'any' ? Number(b.dataset.value) : b.dataset.value });
  if (b.dataset.market && b.closest('#pb-markets')) {
    const all = Object.keys(state.pool?.markets || {}), on = new Set(settings.markets.length ? settings.markets : all);
    on.has(b.dataset.market) ? on.delete(b.dataset.market) : on.add(b.dataset.market);
    if (!on.size) return;
    change({ markets: on.size === all.length ? [] : [...on] });
    document.querySelector(`#pb-markets [data-market="${CSS.escape(b.dataset.market)}"]`)?.focus({ preventScroll: true });
  }
  if (b.hasAttribute('data-markets-all')) change({ markets: [] });
  if (b.dataset.swap) {
    const index = [...document.querySelectorAll('[data-swap]')].indexOf(b);
    state.excluded.add(b.dataset.swap); render();
    document.querySelectorAll('[data-swap]')[index]?.closest('.pb-leg')?.querySelector('h3')?.scrollIntoView({ block: 'nearest' });
  }
  if (b.hasAttribute('data-reset-swaps')) { state.excluded.clear(); render(); }
  if (b.dataset.relax) { try { change(JSON.parse(b.dataset.relax)); } catch {} }
  if (b.dataset.week) { [state.season, state.week] = b.dataset.week.split(':'); state.excluded.clear(); load(); }
  if (b.dataset.date) { state.date = b.dataset.date; $('#pb-date').value = state.date; state.excluded.clear(); load(); }
  if (b.hasAttribute('data-retry')) load({ force: true });
});
$('#pb-refresh').innerHTML = icon('refresh') + '<span>Refresh lines</span>';
syncControls();
await load();
