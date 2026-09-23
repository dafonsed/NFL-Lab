import {requestData,mountLiveWorkspace} from './product-ui.js';
import { preserveLiveFocus, withheldSummary } from './presentation.js';
import { compareLiveLine } from './live-utils.js';
import { renderGameOdds, updateGameOdds, gameOddsFreshness, finalPlayerHtml } from './live-game.js';
const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, digits = 1) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const pct = x => Number.isFinite(x) ? Math.round(x * 100) + '%' : '—';
const time = t => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'unavailable';
const params = new URLSearchParams(location.search);
const state = { data: null, game: params.get('game') || '', date: params.get('date') || '', market: params.get('market') || 'rec_yds', search: '', loading: false, error: '', quotes: new Map(), drafts: new Map(), paused: new Set(), expanded: new Set() };
let controller, requestId = 0;
$('#date').value = state.date;
const key = id => `${state.game}:${id}:${state.market}`;
const playerKey = id => `${state.game}:${id}`;
function updateUrl() {
  const q = new URLSearchParams({ market: state.market });
  if (state.game) q.set('game', state.game);
  if (state.date) q.set('date', state.date);
  q.set('panel',document.querySelector('[data-live-panel][aria-selected=true]')?.dataset.livePanel||'game');
  history.replaceState(null, '', '/nfl/live?' + q);
}
function currentPlayers() {
  const q = state.search.trim().toLowerCase();
  return (state.data?.players || []).filter(p => p.projections[state.market] && (!q || `${p.name} ${p.team}`.toLowerCase().includes(q))).sort((a, b) => (b.projections[state.market].projection ?? b.projections[state.market].current ?? -1) - (a.projections[state.market].projection ?? a.projections[state.market].current ?? -1));
}
async function load({ clear = false } = {}) {
  controller?.abort(); controller = new AbortController(); const id = ++requestId;
  if (clear) { state.data = null; render(); }
  state.loading = true; state.error = ''; $('#refresh').disabled = true; $('#refresh').setAttribute('aria-label','Refreshing data');
  $('#players').setAttribute('aria-busy', 'true');
  const q = new URLSearchParams(); if (state.date) q.set('date', state.date); if (state.game) q.set('game', state.game);
  try {
    const data = await requestData('/api/nfl/live?' + q,{signal:controller.signal});
    if (id !== requestId) return;
    state.data = data; state.game = data.selected || ''; if (!data.markets[state.market]) state.market = 'rec_yds';
    updateUrl(); render();
  } catch (e) { if (e.name === 'AbortError' || id !== requestId) return; state.error = e.message; render(); }
  finally { if (id === requestId) { state.loading = false; $('#refresh').disabled = false; $('#refresh').setAttribute('aria-label','Refresh live'); $('#players').setAttribute('aria-busy', 'false'); updateFreshness(); } }
}
function render() {
  const restoreFocus = preserveLiveFocus($('main'));
  const d = state.data;
  $('#warnings').innerHTML = [...(d?.warnings || []), ...(state.error ? [state.error] : [])].map(w => `<p class="live-warning">${esc(w)}</p>`).join('');
  $('#game').innerHTML = d?.events.length ? d.events.map(g => `<option value="${esc(g.id)}" ${g.id === state.game ? 'selected' : ''}>${esc(g.teams.find(t => t.homeAway === 'away')?.abbreviation)} @ ${esc(g.teams.find(t => t.homeAway === 'home')?.abbreviation)} · ${esc(g.status)}</option>`).join('') : `<option value="">${state.error?'Schedule unavailable · refresh to retry':state.loading?'Loading games…':'No games on this date'}</option>`;
  $('#markets').innerHTML = Object.entries(d?.markets || {}).map(([k, m]) => `<button class="market-tab ${k === state.market ? 'active' : ''}" data-market="${esc(k)}" aria-pressed="${k === state.market}">${esc(m.label)}</button>`).join('');
  const g = d?.game;
  $('#scoreboard').innerHTML = g ? `<div class="live-scoreboard"><div class="live-score-top"><span>${esc(g.state === 'in' ? 'IN PROGRESS' : g.status)}${g.state === 'in' && g.period ? ` · Q${g.period} · ${esc(g.clock || 'Clock unavailable')}` : ''}</span><span>${g.date ? esc(new Date(g.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ''}</span></div><div class="live-score-teams">${[...g.teams].sort((a, b) => a.homeAway === 'away' ? -1 : b.homeAway === 'away' ? 1 : 0).map(t => `<div class="live-score-team"><span>${g.possession === t.id ? '• ' : ''}${esc(t.abbreviation)}</span><b>${g.state === 'pre' ? '—' : num(t.score, 0)}</b></div>`).join('<span class="live-score-divider">:</span>')}</div><p class="live-last-play">${g.lastPlay?.text ? '<span>Last recorded play: </span>' : ''}${esc(g.lastPlay?.text || (g.state === 'pre' ? 'Player projections activate after kickoff and the first recorded opportunities.' : 'No play description available.'))}</p></div>` : '';
  renderGameOdds($('#odds'), d);
  renderPlayers();
  if (d?.method) {
    const m = d.method;
    $('#method-content').innerHTML = `<div class="live-formula">${esc(m.formula)}</div><div class="live-method-grid">${[['role', '01 / Player workload share'], ['efficiency', '02 / Production per opportunity'], ['pace', '03 / Team play volume'], ['mix', '04 / Passing vs. rushing'], ['possession', '05 / Possession & game clock']].map(([k, label]) => `<article><h3>${esc(label)}</h3><p>${esc(m[k])}</p></article>`).join('')}<article><h3>06 / Already recorded = 100% retained</h3><p>The model adds future production to the live box score. It never discounts a player’s current stats. Example: 20 team opportunities after 15+ minutes gives 50% historical role / 50% current role; 40 opportunities gives 33% / 67%. The exact weights appear inside each player card.</p></article></div><p class="live-method-note"><strong>Not included:</strong> ${esc(m.excluded)}</p><p class="live-method-note"><strong>Model limits:</strong> ${esc(m.limits)} TD and interception markets are not included in this version.</p>`;
    $('#sources').innerHTML = [...d.sources, ...(d.historySources || []).map(s => ({ url: s.url, fetchedAt: s.fetchedAt, stale: s.stale, sha256: s.sha256, error: s.error }))].map(s => `<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.url)}</a><br>Fetched ${esc(s.fetchedAt || 'unavailable')} · ${s.stale ? 'STALE' : 'source available'}${s.sha256 ? '<br>SHA-256 ' + esc(s.sha256) : ''}${s.error ? '<br>' + esc(s.error) : ''}</p>`).join('');
  }
  updateFreshness(); restoreFocus();
}
function breakdownPart(f) {
  const b = f.breakdown; if (!b) return '';
  return `<p class="live-equation">${num(f.current)} recorded + ${num(b.remainingOpp)} remaining ${esc(b.channel)} × ${num(b.efficiency, 2)} = ${num(f.projection)}</p><dl>${[
    ['Role · history / live', `${pct(1 - b.liveRoleWeight)} / ${pct(b.liveRoleWeight)}`],
    ['Player share · history → now → blended', `${pct(b.historicalShare)} → ${pct(b.observedShare)} → ${pct(b.share)}`],
    ['Efficiency · history / live', `${pct(1 - b.liveEfficiencyWeight)} / ${pct(b.liveEfficiencyWeight)}`],
    ['Efficiency · historical / live (bounded)', `${num(b.historicalEfficiency, 2)} / ${num(b.liveEfficiency, 2)}`],
    ['Pace · history / live', `${pct(1 - b.paceWeight)} / ${pct(b.paceWeight)}`],
    ['Resulting pace multiplier', `${num(b.pace, 3)}×`],
    ['Pass mix · history / live', `${pct(1 - b.mixWeight)} / ${pct(b.mixWeight)}`],
    ['Score adjustment to pass share', `${b.script >= 0 ? '+' : ''}${num(b.script * 100)} percentage points`],
    ['Projected pass share', pct(b.passShare)],
    ['Possession play adjustment', num(b.possessionPlays)],
    ['Team plays still to come', num(b.remainingPlays)],
    ['Team opportunities still to come', num(b.teamRemainingOpp)],
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
function renderPlayers() {
  const restoreFocus = preserveLiveFocus($('#players'));
  const focused = document.activeElement?.dataset.line;
  const rows = currentPlayers(), d = state.data, label = d?.markets[state.market]?.label || 'Player projections';
  $('#market-title').textContent = label;
  document.body.classList.toggle('live-final', d?.game?.state === 'post');
  $('#players-count').textContent = `${rows.length} players · ${d?.game?.state === 'post' ? 'Final box score · live comparisons closed' : 'No calibrated live probabilities · regulation projection'}`;
  if (!rows.length) {
    const message = !d ? state.error ? 'Live feed unavailable' : 'Loading live player props' : !d.events.length ? 'No NFL games on this date' : d.game?.state === 'pre' ? 'Waiting for kickoff' : 'No matching player statistics';
    $('#players').innerHTML = `<div class="live-empty"><h2>${esc(message)}</h2><p>${!d ? 'The board needs the ESPN box score and earlier NFL workload data.' : d.game?.state === 'pre' ? 'Choose an in-progress game to see live workload projections. Each player appears once the feed records offensive statistics.' : 'Choose another game, date, or market. Missing players and statistics are never treated as zero.'}</p></div>`;
    return;
  }
  $('#players').innerHTML = rows.map(p => {
    const f = p.projections[state.market], paused = state.paused.has(playerKey(p.id)), draft = state.drafts.get(key(p.id)) ?? '';
    if(f.status==='final') return finalPlayerHtml(p,f,label,[p.team,p.prior?.position].filter(Boolean).join(' · '),p.prior?.sample,state.expanded.has(key(p.id)));
    const weights = f.parts ? f.parts.map(x => `<h4>${esc(d.markets[x.market].label)}</h4>${breakdownPart(x)}`).join('') : breakdownPart(f);
    return `<article class="live-card" data-live-player="${esc(p.id)}"><div class="live-card-header"><div><h3>${esc(p.name)}</h3><p>${esc(p.team)} · ${esc(p.prior?.position || 'Offense')} · ${p.prior?.count || 0} prior role games</p></div><span class="live-tag ${f.status !== 'experimental' || paused ? 'withheld' : ''}">${paused ? 'PAUSED' : f.status === 'final' ? 'FINAL' : f.status === 'experimental' ? 'EXPERIMENTAL' : 'WITHHELD'}</span></div><div class="live-values"><div><small>RECORDED</small><strong>${num(f.current)}</strong></div><div><small>STILL TO COME</small><strong>${paused ? '—' : num(f.remaining)}</strong></div><div class="projected"><small>PROJECTED TOTAL</small><strong>${paused ? '—' : num(f.projection)}</strong></div></div>${!Number.isFinite(f.projection)&&f.reasons?.length?`<p class="live-withheld-reason">${esc(withheldSummary(f.reasons))}</p>`:""}<div class="live-inputs"><form data-quote="${esc(p.id)}"><label for="line-${esc(p.id)}">Your full-game ${esc(label.toLowerCase())} line<input id="line-${esc(p.id)}" data-line="${esc(p.id)}" type="number" min="0" max="1500" step="0.5" placeholder="Enter live total" value="${esc(draft)}" required ${f.projection === null || paused ? 'disabled' : ''}></label><button class="button subtle" type="submit" ${f.projection === null || paused ? 'disabled' : ''}>Confirm line</button></form><p class="live-comparison" data-comparison="${esc(p.id)}"></p><label class="pause-player"><input type="checkbox" data-pause="${esc(p.id)}" ${paused ? 'checked' : ''}> Pause player · injured, benched, or uncertain role</label></div><details class="live-breakdown" data-detail="${esc(p.id)}" ${state.expanded.has(key(p.id)) ? 'open' : ''}><summary>Projection inputs</summary>${f.reasons.length ? `<p>${f.reasons.map(esc).join(' ')}</p>` : weights}<p>Reported-out players and explicit ejections are automatically paused; stale injury feeds also pause projections. Unreported injuries and substitutions may be missed. Use Pause player when the role is uncertain.</p>${p.prior ? `<p>Role sample: ${p.prior.count} appearances. Efficiency sample: ${p.prior.efficiencyCount}. Team baseline: ${num(p.prior.teamPlays)} plays/game.</p><p>Earlier games: ${p.prior.sample.map(s => esc(s.date)).join(' · ')}.</p>` : ''}</details></article>`;
  }).join('');
  $('#players').querySelectorAll('[data-detail]').forEach(el => el.addEventListener('toggle', () => el.open ? state.expanded.add(key(el.dataset.detail)) : state.expanded.delete(key(el.dataset.detail))));
  if (focused) document.getElementById('line-' + focused)?.focus({ preventScroll: true });
  updateFreshness(); restoreFocus();
}
function updateFreshness() {
  const d = state.data, age = d?.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(d.fetchedAt)) / 1000)) : null;
  const stale = !d || d.stale || gameOddsFreshness(d, state.error).modelStale;
  updateGameOdds($('#odds'), d, state.error);
  $('#feed-status').classList.toggle('is-stale', stale);
  $('#feed-status').textContent = state.loading ? 'Refreshing live data…' : `${stale ? 'DATA STALE' : d.game?.state === 'in' ? 'GAME IN PROGRESS' : 'SCOREBOARD'} · Last successful fetch ${time(d?.fetchedAt)}${age !== null ? ` · ${age}s ago` : ''} · ${$('#auto').checked ? 'checks every 15s while visible' : 'auto-refresh off'}${d?.game?.lastPlay?.at ? ' · Last game event ' + time(d.game.lastPlay.at) : ''}`;
  for (const card of document.querySelectorAll('[data-live-player]')) {
    const p = d?.players.find(p => p.id === card.dataset.livePlayer), f = p?.projections[state.market];
    const paused = state.paused.has(playerKey(card.dataset.livePlayer));
    const isEstimate = f?.status === 'experimental';
    const tag = card.querySelector('.live-tag');
    if (tag && isEstimate && !paused) { tag.textContent = stale ? 'STALE ESTIMATE' : 'EXPERIMENTAL'; tag.classList.toggle('withheld', stale); }
    card.querySelectorAll('[data-quote] button').forEach(button => { button.disabled = stale || paused || !Number.isFinite(f?.projection); });
  }
  for (const el of document.querySelectorAll('[data-comparison]')) {
    const id = el.dataset.comparison, p = d?.players.find(p => p.id === id);
    const c = compareLiveLine({ projection: p?.projections[state.market], quote: state.quotes.get(key(id)), snapshot: d?.snapshot, fetchedAt: d?.fetchedAt, stale, paused: state.paused.has(playerKey(id)) });
    el.className = 'live-comparison ' + c.kind; el.textContent = c.text;
  }
}
$('#refresh').addEventListener('click', () => load());
$('#game').addEventListener('change', e => { state.game = e.target.value; load({ clear: true }); });
$('#date').addEventListener('change', e => { state.date = e.target.value; state.game = ''; load({ clear: true }); });
$('#current-week').addEventListener('click', () => { state.date = ''; state.game = ''; $('#date').value = ''; load({ clear: true }); });
$('#markets').addEventListener('click', e => { const btn = e.target.closest('[data-market]'); if (btn) { state.market = btn.dataset.market; updateUrl(); render(); } });
$('#search').addEventListener('input', e => { state.search = e.target.value; renderPlayers(); });
$('#auto').addEventListener('change', () => { updateFreshness(); if ($('#auto').checked && !state.loading) load(); });
$('#players').addEventListener('input', e => { if (e.target.dataset.line) { state.drafts.set(key(e.target.dataset.line), e.target.value); state.quotes.delete(key(e.target.dataset.line)); updateFreshness(); } });
$('#players').addEventListener('change', e => { const id = e.target.dataset.pause; if (id) { e.target.checked ? state.paused.add(playerKey(id)) : state.paused.delete(playerKey(id)); state.quotes.delete(key(id)); renderPlayers(); } });
$('#players').addEventListener('submit', e => {
  const form = e.target.closest('[data-quote]'); if (!form) return; e.preventDefault();
  const input = form.querySelector('input'), line = Number(input.value), id = form.dataset.quote;
  if (input.value.trim() === '' || !Number.isFinite(line) || line < 0 || line > 1500 || !input.checkValidity()) return;
  if (!state.data || state.data.stale || state.error || Date.now() - Date.parse(state.data.fetchedAt) > 45_000) return;
  state.quotes.set(key(id), { line, at: Date.now(), snapshot: state.data.snapshot }); updateFreshness();
});
setInterval(() => { if (!document.hidden && $('#auto').checked && !state.loading) load(); }, 15_000);
setInterval(() => { if (!document.hidden) updateFreshness(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateFreshness(); if ($('#auto').checked && !state.loading) load(); } });
mountLiveWorkspace();
load();
