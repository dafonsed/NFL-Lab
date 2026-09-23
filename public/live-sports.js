import {requestData,mountLiveWorkspace} from './product-ui.js';
import { baseballSituation, preserveLiveFocus, withheldSummary } from './presentation.js';
import { compareLiveLine } from './live-utils.js';
import { renderGameOdds, updateGameOdds, finalPlayerHtml } from './live-game.js';
const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, digits = 1) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const pct = x => Number.isFinite(x) ? Math.round(x * 100) + '%' : '—';

const safe = url => /^https:\/\//.test(url || '') ? esc(url) : '#';
const time = t => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'unavailable';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sport = location.pathname.split('/')[1], label = sport.toUpperCase(), params = new URLSearchParams(location.search);
const state = { data: null, game: params.get('game') || '', date: params.get('date') || today(), followToday: !params.has('date'), market: params.get('market') || (sport === 'mlb' ? 'hits' : 'points'), search: '', loading: false, error: '', quotes: new Map(), drafts: new Map(), paused: new Set(), expanded: new Set() };
let controller, requestId = 0;
const key = id => `${sport}:${state.game}:${id}:${state.market}`;
const playerKey = id => `${sport}:${state.game}:${id}`;
$('#back-link').href = `/${sport}`;
$('#live-eyebrow').textContent = label + ' / LIVE GAME CENTER'; $('#footer-label').textContent = label + ' LAB / Live odds & props';
document.title = label + ' Lab · Live odds & props'; $('#date').value = state.date;
function updateUrl() {
  const q = new URLSearchParams({ date: state.date, market: state.market }); if (state.game) q.set('game', state.game);
  q.set('panel',document.querySelector('[data-live-panel][aria-selected=true]')?.dataset.livePanel||'game');
  history.replaceState(null, '', `/${sport}/live?` + q);
}
async function load({ clear = false } = {}) {
  if (state.followToday && state.date !== today()) { state.date = today(); state.game = ''; $('#date').value = state.date; clear = true; }
  controller?.abort(); controller = new AbortController(); const id = ++requestId;
  state.loading = true; state.error = ''; $('#refresh').disabled = true; $('#refresh').setAttribute('aria-label','Refreshing data'); $('#players').setAttribute('aria-busy', 'true');
  if (clear) { state.data = null; render(); } else updateFreshness();
  const q = new URLSearchParams({ date: state.date }); if (state.game) q.set('game', state.game);
  try {
    const data = await requestData(`/api/${sport}/live?` + q,{signal:controller.signal});
    if (id !== requestId) return;
    state.data = data; state.game = data.selected || '';
    if (!Object.hasOwn(data.markets, state.market)) state.market = sport === 'mlb' ? 'hits' : 'points';
    updateUrl(); render();
  } catch (e) { if (e.name === 'AbortError' || id !== requestId) return; state.error = e.message; render(); }
  finally { if (id === requestId) { state.loading = false; $('#refresh').disabled = false; $('#refresh').setAttribute('aria-label','Refresh live'); $('#players').setAttribute('aria-busy', 'false'); updateFreshness(); } }
}
function gameClock(g) {
  if (g.state !== 'in') return g.status;
  if (sport === 'mlb') return baseballSituation(g);
  return g.halftime ? 'Halftime' : `${g.period > 4 ? 'OT' + (g.period - 4) : 'Q' + (g.period || '—')} · ${g.clock || 'Clock unavailable'}`;
}
function render() {
  const restoreFocus = preserveLiveFocus($('main'));
  const d = state.data, g = d?.game;
  $('#warnings').innerHTML = [...new Set([...(d?.warnings || []), ...(state.error ? [state.error] : [])])].map(w => `<p class="live-warning">${esc(w)}</p>`).join('');
  $('#game').innerHTML = d?.events.length ? d.events.map(e => `<option value="${esc(e.id)}" ${e.id === state.game ? 'selected' : ''}>${esc(e.teams.find(t => t.homeAway === 'away')?.abbreviation)} @ ${esc(e.teams.find(t => t.homeAway === 'home')?.abbreviation)} · ${esc(e.status)}</option>`).join('') : `<option value="">${!d && state.loading ? 'Loading games…' : state.error ? 'Games unavailable · refresh to retry' : 'No games on this date'}</option>`;
  $('#markets').innerHTML = Object.entries(d?.markets || {}).map(([k, m]) => `<button class="market-tab ${k === state.market ? 'active' : ''}" data-market="${esc(k)}" aria-pressed="${k === state.market}">${esc(m.label)}</button>`).join('');
  $('#scoreboard').innerHTML = g ? `<div class="live-scoreboard"><div class="live-score-top"><span>${esc(gameClock(g))}</span><span>${esc(new Date(g.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span></div><div class="live-score-teams">${g.teams.map(t => `<div class="live-score-team"><span title="${esc(t.name)}">${esc(t.abbreviation)}</span><b>${g.state === 'pre' ? '—' : num(t.score, 0)}</b></div>`).join('<span class="live-score-divider">:</span>')}</div>${sport === 'mlb' && g.state === 'in' ? `<p class="live-bases">On base: ${g.bases === null ? 'Unavailable' : g.bases?.length ? g.bases.map(esc).join(' · ') : 'Bases empty'}</p>` : ''}<p class="live-last-play">${g.lastPlay?.text ? '<span>Last recorded play: </span>' : ''}${esc(g.lastPlay?.text || (g.state === 'pre' ? 'Projections activate after play begins and statistics are recorded.' : 'No play description available.'))}</p></div>` : '';
  renderGameOdds($('#odds'), d); renderPlayers();
  const method = d?.method;
  $('#method-content').innerHTML = method ? `<div class="live-formula">${esc(method.formula)}</div><div class="live-method-grid">${method.sections.map(([title, description], i) => `<article><h3>0${i + 1} / ${esc(title)}</h3><p>${esc(description)}</p></article>`).join('')}</div><p class="live-method-note">${esc(method.limits)}</p>` : 'The model specification appears when the feed connects.';
  $('#model-version').textContent = method?.version || 'Independent live model';
  $('#sources').innerHTML = [...(d?.sources || []), ...(d?.historySources || [])].map(s => `<p><a href="${safe(s.url)}" target="_blank" rel="noreferrer">${esc(s.url)}</a><br>Fetched ${esc(s.fetchedAt || 'unavailable')} · ${s.stale ? 'STALE' : 'source available'}${s.sha256 ? '<br>SHA-256 ' + esc(s.sha256) : ''}${s.error ? '<br>' + esc(s.error) : ''}</p>`).join('');
  updateFreshness(); restoreFocus();
}
function breakdown(f) {
  const b = f.breakdown; if (!b) return '';
  return `<p class="live-equation">${num(f.current)} recorded + ${num(b.opportunities, 2)} remaining ${esc(b.unit)} × ${num(b.rate, 3)} = ${num(f.projection)}</p><dl>${b.inputs.map(([k, v, format]) => `<dt>${esc(k)}</dt><dd>${format === 'percent' ? pct(v) : num(v, 2)}</dd>`).join('')}</dl>`;
}
function renderPlayers() {
  const restoreFocus = preserveLiveFocus($('#players'));
  const focus = document.activeElement?.dataset.line, d = state.data, query = state.search.trim().toLowerCase(), title = d?.markets[state.market]?.label || 'Player projections';
  const rows = (d?.players || []).filter(p => p.projections[state.market] && (!query || `${p.name} ${p.team}`.toLowerCase().includes(query))).sort((a, b) => (b.projections[state.market].projection ?? b.projections[state.market].current ?? -1) - (a.projections[state.market].projection ?? a.projections[state.market].current ?? -1));
  $('#market-title').textContent = title;
  document.body.classList.toggle('live-final', d?.game?.state === 'post');
  $('#players-count').textContent = `${rows.length} players · ${d?.game?.state === 'post' ? 'Final box score · live comparisons closed' : 'Regulation projection · no calibrated live probabilities'}`;
  if (!rows.length) {
    const message = state.error && !d ? 'Live feed unavailable' : !d ? 'Loading live odds & props' : !d.events.length ? d.stale ? 'Schedule unavailable · refresh to retry' : `No ${label} games on this date` : d.game?.state === 'pre' ? 'Waiting for the game to start' : 'No matching player statistics';
    $('#players').innerHTML = `<div class="live-empty"><h2>${esc(message)}</h2><p>${!d ? state.error ? 'The game feed could not be loaded. Use Refresh to retry, or choose another date.' : 'Connecting to public game feeds and earlier player workload data.' : 'Choose another game, date, or market. Players appear once the source records their statistics. Missing values are never treated as zero.'}</p></div>`; return;
  }
  $('#players').innerHTML = rows.map(p => {
    const f = p.projections[state.market], paused = state.paused.has(playerKey(p.id)), draft = state.drafts.get(key(p.id)) ?? '', prior = sport === 'mlb' ? p.prior?.[d.markets[state.market].group] : p.prior;
    if(f.status==='final') return finalPlayerHtml(p,f,title,[p.team,p.position,Number.isFinite(p.minutes)?num(p.minutes)+' min':null].filter(Boolean).join(' · '),prior?.sample,state.expanded.has(key(p.id)));
    const disabled = !Number.isFinite(f.projection) || paused;
    return `<article class="live-card" data-live-player="${esc(p.id)}"><div class="live-card-header"><div><h3>${esc(p.name)}</h3><p>${esc(p.team)} · ${esc(p.position || 'Player')}${Number.isFinite(p.minutes) ? ' · ' + num(p.minutes) + ' MIN' : ''} · ${prior?.count || 0} prior games</p></div><span class="live-tag ${disabled ? 'withheld' : ''}">${paused ? 'PAUSED' : f.status === 'final' ? 'FINAL' : disabled ? 'WITHHELD' : 'EXPERIMENTAL'}</span></div><div class="live-values"><div><small>RECORDED</small><strong>${num(f.current)}</strong></div><div><small>STILL TO COME</small><strong>${paused ? '—' : num(f.remaining)}</strong></div><div class="projected"><small>PROJECTED TOTAL</small><strong>${paused ? '—' : num(f.projection)}</strong></div></div>${!Number.isFinite(f.projection)&&f.reasons?.length?`<p class="live-withheld-reason">${esc(withheldSummary(f.reasons))}</p>`:""}<div class="live-inputs"><form data-quote="${esc(p.id)}"><label for="line-${esc(p.id)}">Your full-game ${esc(title.toLowerCase())} line<input id="line-${esc(p.id)}" data-line="${esc(p.id)}" type="number" min="0" max="1500" step="0.5" placeholder="Enter live total" value="${esc(draft)}" required ${disabled ? 'disabled' : ''}></label><button class="button subtle" type="submit" ${disabled ? 'disabled' : ''}>Confirm line</button></form><p class="live-comparison" data-comparison="${esc(p.id)}"></p><label class="pause-player"><input type="checkbox" data-pause="${esc(p.id)}" ${paused ? 'checked' : ''}> Pause player · injury or uncertain role</label></div><details class="live-breakdown" data-detail="${esc(p.id)}" ${state.expanded.has(key(p.id)) ? 'open' : ''}><summary>Projection inputs</summary>${f.reasons.length ? `<p>${f.reasons.map(esc).join(' ')}</p>` : breakdown(f)}${prior?.sample?.length ? `<p>Earlier games: ${prior.sample.map(s => esc(s.date.slice(0, 10))).join(' · ')}.</p>` : ''}<p>Check in-game substitutions and injuries. Projections exclude ${sport === 'mlb' ? 'extra innings' : 'overtime'}.</p></details></article>`;
  }).join('');
  $('#players').querySelectorAll('[data-detail]').forEach(el => el.addEventListener('toggle', () => el.open ? state.expanded.add(key(el.dataset.detail)) : state.expanded.delete(key(el.dataset.detail))));
  if (focus) document.getElementById('line-' + focus)?.focus({ preventScroll: true });
  updateFreshness(); restoreFocus();
}
function feedStale() {
  const d = state.data, at = Date.parse(d?.fetchedAt);
  return !!state.error || !d || d.stale || !Number.isFinite(at) || Date.now() - at + (d.sourceAgeMs || 0) > 45000 || Date.now() < at - 5000;
}
function updateFreshness() {
  const d = state.data, stale = feedStale(), age = d?.fetchedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(d.fetchedAt) + (d.sourceAgeMs || 0)) / 1000)) : null;
  updateGameOdds($('#odds'), d, state.error);
  $('#feed-status').classList.toggle('is-stale', stale);
  $('#feed-status').textContent = state.loading ? 'Refreshing live data…' : `${stale ? 'DATA STALE' : d.game?.state === 'in' ? 'GAME IN PROGRESS' : 'SCOREBOARD'} · Last successful fetch ${time(d?.fetchedAt)}${age !== null ? ` · ${age}s old` : ''} · ${$('#auto').checked ? 'checks every 15s while visible' : 'auto-refresh off'}${d?.game?.lastPlay?.at ? ' · Last game event ' + time(d.game.lastPlay.at) : ''}`;
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
$('#date').addEventListener('change', e => { if (!e.target.value) return; state.date = e.target.value; state.followToday = false; state.game = ''; load({ clear: true }); });
$('#today').addEventListener('click', () => { state.followToday = true; state.date = today(); state.game = ''; $('#date').value = state.date; load({ clear: true }); });
$('#markets').addEventListener('click', e => { const btn = e.target.closest('[data-market]'); if (btn) { state.market = btn.dataset.market; updateUrl(); render(); } });
$('#search').addEventListener('input', e => { state.search = e.target.value; renderPlayers(); });
$('#auto').addEventListener('change', () => { updateFreshness(); if ($('#auto').checked && !state.loading) load(); });
$('#players').addEventListener('input', e => { if (e.target.dataset.line) { state.drafts.set(key(e.target.dataset.line), e.target.value); state.quotes.delete(key(e.target.dataset.line)); updateFreshness(); } });
$('#players').addEventListener('change', e => { const id = e.target.dataset.pause; if (id) { e.target.checked ? state.paused.add(playerKey(id)) : state.paused.delete(playerKey(id)); for (const market of Object.keys(state.data?.markets || {})) state.quotes.delete(`${sport}:${state.game}:${id}:${market}`); renderPlayers(); } });
$('#players').addEventListener('submit', e => {
  const form = e.target.closest('[data-quote]'); if (!form) return; e.preventDefault();
  const input = form.querySelector('input'), line = Number(input.value), id = form.dataset.quote;
  if (!input.value.trim() || !Number.isFinite(line) || line < 0 || line > 1500 || !input.checkValidity() || feedStale() || state.paused.has(playerKey(id))) return;
  state.quotes.set(key(id), { line, at: Date.now(), snapshot: state.data.snapshot }); updateFreshness();
});
setInterval(() => { if (!document.hidden && $('#auto').checked && !state.loading) load(); }, 15000);
setInterval(() => { if (!document.hidden) updateFreshness(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateFreshness(); if ($('#auto').checked && !state.loading) load(); } });
mountLiveWorkspace();
load();
