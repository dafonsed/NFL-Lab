import { escape as esc, safeUrl, finite, number as num, average, selectGames, summarize, recentChange, supportingStats, forecastSummary, recordQuote, statNames } from './research-data.js';

const shortDate = date => new Date(date.includes('T') ? date : date.slice(0, 10) + 'T12:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: date.includes('T') ? 'America/Phoenix' : 'UTC' });
const stamp = date => Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unavailable';
const quoteKey = p => p.key + ':' + (p.prop?.bookKey || p.prop?.bookmaker || '');
const historyKey = 'sports-lab-line-observations-v1';
let quotes = {};
try { const saved = JSON.parse(localStorage.getItem(historyKey)); if (saved && !Array.isArray(saved) && typeof saved === 'object') quotes = saved; } catch {}
export function observeLines(profiles) {
  let next = quotes;
  for (const p of profiles) next = recordQuote(next, p.key, p.prop);
  if (next !== quotes) { quotes = next; try { localStorage.setItem(historyKey, JSON.stringify(quotes)); } catch {} }
}
const bookLabel = p => p.prop ? `${p.prop.bookmaker}${p.prop.stale ? ' · saved quote' : p.prop.basis === 'published_archive' ? ' · archived quote' : p.prop.basis === 'in_play' ? ' · in-play quote' : ' · posted quote'}` : 'No posted line';
const defaultLine = p => finite(p.prop?.line) ?? (p.sport === 'nfl' && p.market === 'any_td' ? 0.5 : null);
const price = n => finite(n) === null ? '—' : (n > 0 ? '+' : '') + num(n, 0);
const link = (url, label) => url && safeUrl(url) !== '#' ? `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${esc(label)} ↗</a>` : '';

export function gameChart(rows, line, side = 'over', compact = false, availableWidth = 600) {
  if (!rows.length) return '<div class="pr-empty"><strong>No games match these filters</strong><p>Choose another window or include both home and away games.</p></div>';
  const ordered = [...rows].reverse(), width = Math.max(compact ? 260 : availableWidth, ordered.length * (compact ? 15 : availableWidth < 600 ? 30 : 42) + 70), height = compact ? 75 : 310;
  const left = compact ? 0 : 40, right = 15, top = compact ? 4 : 30, bottom = compact ? 4 : 62, plotH = height - top - bottom;
  const minimum = Math.min(0, ...ordered.map(r => r.value), finite(line) ?? 0), maximum = Math.max(1, ...ordered.map(r => r.value), finite(line) ?? 0) * 1.12;
  const roughStep = (maximum - minimum) / 5, magnitude = 10 ** Math.floor(Math.log10(roughStep)), step = Math.max(1, [1, 2, 2.5, 5, 10].find(v => v * magnitude >= roughStep) * magnitude);
  const low = Math.floor(minimum / step) * step, high = Math.ceil(maximum / step) * step;
  const y = value => top + (high - value) / (high - low || 1) * plotH, slot = (width - left - right) / ordered.length, barWidth = Math.min(45, slot * 0.72);
  const ticks = compact ? '' : Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + step * i).map(v => `<g><line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" class="pr-gridline"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="pr-axis">${num(v)}</text></g>`).join('');
  const bars = ordered.map((r, i) => {
    const x = left + i * slot + (slot - barWidth) / 2, hit = finite(line) === null ? 'neutral' : r.value === line ? 'push' : (side === 'under' ? r.value < line : r.value > line) ? 'hit' : 'miss';
    const tooltip = `${shortDate(r.date)}${r.opponent ? ` ${r.home === false ? '@' : 'vs'} ${r.opponent}` : ''}: ${num(r.value)}${r.parts.length ? ' · ' + r.parts.map(p => p.label + ' ' + num(p.value)).join(', ') : ''}`;
    let rectangles = `<rect x="${x}" y="${Math.min(y(0), y(r.value))}" width="${barWidth}" height="${Math.max(2, Math.abs(y(r.value) - y(0)))}" rx="3" class="pr-bar ${hit}"/>`;
    if (!compact && r.parts.length > 1 && r.parts.every(p => p.value >= 0)) {
      let cumulative = 0;
      rectangles = r.parts.map((p, index) => { const start = cumulative; cumulative += p.value; const h = Math.abs(y(cumulative) - y(start)); return `<rect x="${x}" y="${y(cumulative)}" width="${barWidth}" height="${Math.max(0, h)}" class="pr-bar ${hit}" opacity="${1 - index * 0.2}"/>${h > 25 && barWidth > 27 ? `<text x="${x + barWidth / 2}" y="${y(cumulative) + h / 2 + 4}" text-anchor="middle" class="pr-stack-label">${num(p.value, 0)}</text>` : ''}`; }).join('');
    }
    return `<g><title>${esc(tooltip)}</title>${rectangles}${compact ? '' : `<text x="${x + barWidth / 2}" y="${r.value >= 0 ? y(r.value) - 8 : y(r.value) + 16}" text-anchor="middle" class="pr-bar-label">${num(r.value)}</text><text x="${x + barWidth / 2}" y="${height - 32}" text-anchor="middle" class="pr-axis">${esc(shortDate(r.date))}</text><text x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle" class="pr-axis">${esc(r.opponent ? `${r.home === false ? '@' : 'vs'} ${r.opponent.length > 9 ? r.opponent.slice(0, 8) + '…' : r.opponent}` : '')}</text>`}</g>`;
  }).join('');
  return `<div class="pr-chart-scroll" tabindex="0" aria-label="Game chart; scroll horizontally for more games"><svg viewBox="0 0 ${width} ${height}" style="min-width:${compact ? 0 : Math.min(width, 1500)}px" role="img" aria-label="${esc(`${rows.length} game results, oldest to newest${finite(line) === null ? '' : '; dashed comparison line at ' + line}`)}">${ticks}${bars}${finite(line) === null ? '' : `<line x1="${left}" x2="${width - right}" y1="${y(line)}" y2="${y(line)}" class="pr-threshold"/>${compact ? '' : `<rect x="0" y="${y(line) - 10}" width="38" height="20" rx="5" class="pr-line-pill"/><text x="19" y="${y(line) + 4}" text-anchor="middle" class="pr-line-label">${num(line)}</text>`}`}</svg></div>`;
}

function movement(p) {
  const saved = quotes[quoteKey(p)], rows = (Array.isArray(saved) ? saved : []).filter(r => finite(r.line) !== null && Number.isFinite(Date.parse(r.at))), first = rows[0], last = rows.at(-1);
  if (!p.prop) return '<p>No sportsbook line is available for this player and market. Add your own line in the chart to compare recent results.</p>';
  const delta = rows.length > 1 ? last.line - first.line : null;
  let chart = '';
  if (rows.length > 1) {
    const width = 320, height = 130, min = Math.min(...rows.map(r => r.line)) - 0.5, max = Math.max(...rows.map(r => r.line)) + 0.5;
    const start = Date.parse(first.at), span = Date.parse(last.at) - start || 1, x = r => 15 + (Date.parse(r.at) - start) / span * 290, y = r => 10 + (max - r.line) / (max - min) * 90;
    const points = rows.map((r, i) => i ? `H${x(r)} V${y(r)}` : `M${x(r)},${y(r)}`).join(' ');
    chart = `<svg class="pr-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Observed line: ${num(first.line)} to ${num(last.line)} over ${rows.length} checks`)}"><path d="${points}" fill="none" stroke="currentColor" stroke-width="2.5"/><text x="15" y="125" class="pr-axis">${esc(shortDate(first.at))}</text><text x="305" y="125" text-anchor="end" class="pr-axis">${esc(shortDate(last.at))}</text></svg>`;
  }
  return `<div class="pr-line-current"><strong>${num(p.prop.line)}</strong><span>${esc(p.prop.bookmaker)}<small>${delta === null ? rows.length ? 'First observation' : 'No fresh observations yet' : delta === 0 ? 'No change across recorded checks' : (delta > 0 ? 'Up ' : 'Down ') + num(Math.abs(delta)) + ' since first observation'}</small></span></div>${chart}<p class="pr-muted">${rows.length === 0 ? 'This quote is not a fresh observation. No movement history has been recorded in this browser.' : rows.length < 2 ? 'One quote recorded. A movement chart will appear after another fresh quote is observed.' : 'Only quotes this browser has observed are shown; this is not the sportsbook’s complete history.'}</p><details><summary>Recorded quotes${rows.length ? ` · ${rows.length}` : ''}</summary><div class="pr-table-scroll"><table><thead><tr><th>Seen</th><th>Line</th><th>Type</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td>${esc(stamp(r.at))}</td><td>${num(r.line)}</td><td>${r.basis === 'in_play' ? 'In play' : r.basis === 'published_archive' ? 'Archive' : 'Pregame'}</td></tr>`).join('')}</tbody></table></div></details>${link(p.prop.sourceUrl, 'Check the source')}`;
}
function matchup(p, selectedGroup) {
  const o = p.context, effect = p.forecast.effects?.opponent, pitcher = p.forecast.matchup;
  let content = `<p class="pr-muted">${esc(p.team)} vs ${esc(p.opponent || 'Opponent pending')}</p>`;
  if (pitcher?.pitcher) content += `<div class="pr-fact"><span>Opposing starter</span><strong>${esc(pitcher.pitcher)}</strong></div><div class="pr-fact"><span>Throws</span><strong>${pitcher.pitcherHand === 'L' ? 'Left-handed' : pitcher.pitcherHand === 'R' ? 'Right-handed' : 'Unconfirmed'}</strong></div>`;
  const defense=p.raw.matchupResearch, selected=defense?.groups.find(g=>g.key===selectedGroup)||defense?.groups[0];
  if(selected) content+=`<div class="pr-segmented pr-defense-tabs">${defense.groups.map(g=>`<button data-pr-action="defense" data-value="${g.key}" aria-pressed="${g.key===selected.key}">${esc(g.label)}</button>`).join('')}</div><div class="pr-table-scroll"><table><thead><tr><th>Allowed</th><th>Per game</th><th>Games</th></tr></thead><tbody>${selected.fields.map(f=>`<tr><td>${esc(statNames[f.field]||f.field)}</td><td>${num(f.average)}</td><td>${f.games}</td></tr>`).join('')}</tbody></table></div><p class="pr-muted">${esc(defense.note)} ${selected.key==='all'?'Overall includes the entire opposing team.':'G = guards, F = forwards, C = centers.'}</p>`;
  else if (o?.available) content += `<div class="pr-fact"><span>Opponent allows</span><strong>${num(o.rate, 2)}</strong></div><p>${esc(o.unit || '')}. ${esc(o.description || '')}</p><div class="pr-fact"><span>League comparison</span><strong>${num(o.leagueRate, 2)}</strong></div><p class="pr-muted">Based on ${o.sampleCount} prior games. Higher means more production allowed in this statistic.</p>${link(o.sourceUrl, 'Opponent stats')}`;
  else if (effect?.games && finite(effect.rate) !== null) content += `<div class="pr-fact"><span>${p.markets[p.market]?.goalie ? 'Shots faced' : esc(p.label) + ' allowed'} / game</span><strong>${num(effect.rate, 1)}</strong></div><div class="pr-fact"><span>Comparison sample / game</span><strong>${num(effect.comparison, 1)}</strong></div><p>Team totals across ${effect.games} prior opponent games, weighted toward the broader sample average. This describes the whole team’s production allowed; it is not an individual player or position ranking.</p>`;
  else content += '<p>There is not enough verified opponent history for a useful comparison in this market.</p>';
  if (selected && defense.sourceUrls?.length) content += `<details><summary>Opponent box scores · ${defense.games} games</summary>${[...new Set(defense.sourceUrls)].map((url,i)=>link(url,'Game '+(i+1))).join(' · ')}</details>`;
  if (p.lineup) content += `<div class="pr-fact"><span>Role</span><strong>${esc(({ confirmed: `Batting ${p.battingOrder || 'order confirmed'}`, starter: 'Confirmed starter', probable: 'Probable starter', bench: 'Bench / substitute', unconfirmed: 'Lineup pending' })[p.lineup] || p.lineup)}</strong></div>`;
  return content;
}
function availability(p) {
  const a = p.availability, raw = a.status || 'Unknown', status = raw === 'historical_unavailable' ? 'Historical report unavailable' : raw === 'unavailable' ? 'Report unavailable' : raw;
  const note = a.unavailable ? 'The player is reported unavailable. Check the team’s latest update before using this matchup.' : a.concern ? 'Participation or playing time may be affected. The projection is not a confirmed minutes limit.' : a.stale ? 'The last update could not be refreshed. This status may have changed.' : /no.*(injury|listing)|available|active/i.test(status) ? 'No absence is listed in the latest report. This does not confirm the starting lineup.' : /historical/i.test(status) ? 'A current injury report cannot establish what was known before a past game.' : a.note || 'Check the latest team report for participation and any minutes restriction.';
  const donors = p.forecast.injury?.donors || p.forecast.teammateImpact?.donors || [];
  return `<strong class="pr-status ${a.concern || a.unavailable || a.stale ? 'concern' : ''}">${esc(status)}</strong><p>${esc(note)}</p>${a.detail ? `<p>${esc(a.detail)}</p>` : ''}${donors.length ? `<p><strong>Teammate absences:</strong> ${donors.map(d => esc(d.player)).join(', ')}. The model allows for a possible change in workload.</p>` : ''}${a.checkedAt ? `<small>Checked ${esc(stamp(a.checkedAt))}</small>` : ''}${link(a.sourceUrl, 'Availability report')}`;
}
function insights(p, rows) {
  const c = recentChange(p.rows), recent = summarize(rows), notes = [];
  if (recent.n) notes.push(`${p.name.split(' ').at(-1)} averaged ${num(recent.average)} ${p.unit} in these ${recent.n} games, with results from ${num(recent.min)} to ${num(recent.max)}.`);
  if (c.change !== null) notes.push(c.change === 0 ? `The latest five-game average matches the previous five at ${num(c.recent)}.` : `The latest five-game average is ${num(Math.abs(c.change))} ${c.change > 0 ? 'higher' : 'lower'} than the previous five (${num(c.recent)} vs ${num(c.previous)}).`);
  const minutes = supportingStats(p, rows).find(s => s.key === 'minutes');
  if (minutes) notes.push(`Playing time averaged ${num(minutes.value)} minutes across ${minutes.n} games. A shorter role would reduce the opportunities behind this projection.`);
  if (rows.length && rows.length < 5) notes.push('Fewer than five games match these filters. One result can move the average substantially.');
  if (p.forecast.reasons?.some(r => /different team/i.test(r))) notes.push('Some history comes from a previous team. The current role may differ from those games.');
  return notes.length ? `<ul class="pr-insights">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p>No completed games are available for these filters.</p>';
}
function selectedGame(p) {
  const r=p.result||{}, value=finite(r.actual), complete=['final','over','under','push','no_line'].includes(r.status);
  const status=complete?'Final result':r.status==='did_not_play'?'Did not play':r.status==='pending'?'Result pending':r.status==='no_stats'?'Statistics unavailable':'Recorded so far';
  return `<h3>Selected game</h3><div class="pr-fact"><span>${status}</span><strong>${value===null?'—':num(value)+' '+esc(p.unit)}</strong></div><p class="pr-muted">${complete?'This result is shown separately and is excluded from the prior-game chart.':'Only completed appearances before this matchup enter the chart.'}</p>${link(r.sourceUrl||p.boardMeta.game?.url,'Game box score')}`;
}

let active = null;
export function syncResearchNav(view) {
  document.documentElement.dataset.researchView = view;
  const header = document.querySelector('.site-header'); if (!header) return;
  header.dataset.siteSection = view === 'trends' ? 'trends' : 'research';
  for (const a of header.querySelectorAll('.site-nav-link')) {
    const selected = view === 'trends' ? a.textContent.trim() === 'Trends' : a.textContent.trim() === 'Research';
    if (selected) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}
export function refreshPlayerResearch(profiles) {
  const next = profiles.find(p => p.key === active?.key);
  if (next) active.update(next);
}
export function openPlayerResearch({ profile, loadMarket, loadDetails, note = '', saveNote, onSave, saved = false, onCompare } = {}) {
  if (active) active.close();
  observeLines([profile]);
  const dialog = document.createElement('dialog'); dialog.className = 'player-research-dialog'; dialog.setAttribute('aria-label', profile.name + ' player research'); document.body.append(dialog);
  const returnFocus = document.activeElement, state = { profile, window: '10', venue: 'all', side: 'over', line: defaultLine(profile), manual: false, method: 'average', tab: 'matchup', defense: 'all', showLog: false, note, saved, busy: false, error: '' };
  let sequence = 0, controller;
  const close = () => dialog.close();
  active = { close, key: profile.key, update(next) { if (state.profile.full && !next.full) return; state.profile = next; if (!state.manual) state.line = defaultLine(next); observeLines([next]); render(); } };
  dialog.addEventListener('close', () => { sequence++; controller?.abort(); dialog.remove(); if (active?.close === close) active = null; if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } return; }
    const action = button.dataset.prAction;
    if (action === 'close') close();
    if (action === 'window') { state.window = button.dataset.value; render(); }
    if (action === 'side') { state.side = button.dataset.value; render(); }
    if (action === 'method') { state.method = button.dataset.value; render(); }
    if (action === 'defense') { state.defense=button.dataset.value; render(); }
    if (action === 'tab') { state.tab = button.dataset.value; render(); }
    if (action === 'log') { state.showLog = !state.showLog; render(); }
    if (action === 'reset-line') { state.line = defaultLine(state.profile); state.manual = false; render(); }
    if (action === 'save' && onSave) { state.saved = onSave(state.profile.playerId); render(); }
    if (action === 'compare' && onCompare) { onCompare(state.profile); close(); }
    if (action === 'jump') dialog.querySelector('#' + button.dataset.value)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (action === 'market' && loadMarket && button.dataset.value !== state.profile.market) {
      const id = ++sequence; controller?.abort(); controller = new AbortController(); state.busy = true; state.error = ''; render();
      try { const next = await loadMarket(button.dataset.value, controller.signal); if (id !== sequence || !dialog.open) return; if (!next) throw Error('This player has no eligible profile for that market.'); state.profile = next; active.key = next.key; state.line = defaultLine(next); state.manual = false; observeLines([next]); }
      catch (error) { if (error.name !== 'AbortError') state.error = error.message; }
      finally { if (id === sequence && dialog.open) { state.busy = false; render(); } }
    }
  });
  dialog.addEventListener('change', event => { if (event.target.matches('[data-pr-venue]')) { state.venue = event.target.value; render(); } });
  dialog.addEventListener('submit', event => {
    if (!event.target.matches('[data-pr-line-form]')) return; event.preventDefault();
    const value = finite(new FormData(event.target).get('line'));
    if (value !== null && value >= -100 && value <= 1000) { state.line = value; state.manual = true; render(); }
  });
  dialog.addEventListener('input', event => { if (event.target.matches('[data-pr-note]')) { state.note = event.target.value; const okay = saveNote?.(state.note); const status = dialog.querySelector('[data-pr-note-status]'); if (status) status.textContent = okay === false ? 'Could not save in this browser. Copy your note before closing.' : 'Saved in this browser'; } });
  function render() {
    const focus = dialog.contains(document.activeElement) ? document.activeElement : null, focusAction = focus?.dataset.prAction, focusValue = focus?.dataset.value;
    const focusControl = ['[data-pr-venue]', '[data-pr-note]', '[data-pr-line-form] input', '[data-pr-line-form] button', '[data-dev-toggle]'].find(selector => focus?.matches(selector));
    const p = state.profile, rows = selectGames(p, state), s = summarize(rows, state.line, state.side), f = forecastSummary(p), years = [...new Set(p.rows.map(r => r.date.slice(0, 4)))].slice(0, 3);
    const windows = [['5', 'L5'], ['10', 'L10'], ['20', 'L20'], ['h2h', 'H2H'], ['all', 'All'], ...years.map(y => ['year:' + y, y])];
    const total = finite(state.line), reference = state.manual ? 'Your comparison line' : p.prop ? bookLabel(p) : total === 0.5 && p.market === 'any_td' ? '1+ TD comparison' : 'Add a line to compare';
    const probability = !state.manual && p.prop && !p.prop.stale ? finite(p.forecast.probability?.[state.side]) : null;
    const rawOdds = !state.manual && !p.prop?.stale ? finite(p.prop?.prices?.[state.side]?.american) : null;
    dialog.setAttribute('aria-busy', String(state.busy));
    dialog.innerHTML = `<header class="pr-hero"><div class="pr-topline"><button class="pr-close" data-pr-action="close" aria-label="Close player research">×</button><span>${esc(p.sport.toUpperCase())} / PLAYER RESEARCH</span><button class="site-dev-toggle" data-dev-toggle aria-pressed="false">Dev mode</button></div><div class="pr-identity">${p.image ? `<img src="${safeUrl(p.image)}" alt="" width="64" height="64">` : '<span class="pr-initial">' + esc(p.name[0]) + '</span>'}<div><div class="pr-player-meta">${esc(p.team)} <span>vs</span> ${esc(p.opponent || 'TBD')}${p.target ? ` · ${esc(shortDate(p.displayDate || p.target))}` : ''}</div><h2>${esc(p.name)} <small>${esc(p.position || '')}</small></h2><p>${esc(p.label)}${total === null ? '' : ` · ${state.side === 'over' ? 'Over' : 'Under'} ${num(total)}`}</p></div><div class="pr-hero-actions">${onSave ? `<button class="pr-button" data-pr-action="save" aria-pressed="${state.saved}">${state.saved ? '★ Saved' : '☆ Save player'}</button>` : ''}${onCompare ? '<button class="pr-button" data-pr-action="compare">± Compare player</button>' : ''}</div></div></header>
    <nav class="pr-markets" aria-label="Player markets">${Object.entries(p.markets).map(([key, m]) => `<button data-pr-action="market" data-value="${esc(key)}" aria-pressed="${key === p.market}" ${state.busy ? 'disabled' : ''}>${esc(m.label)}</button>`).join('')}</nav>
    <nav class="pr-jump" aria-label="Player sections"><button data-pr-action="jump" data-value="pr-results">Recent games</button><button data-pr-action="jump" data-value="pr-matchup">Matchup</button><button data-pr-action="jump" data-value="pr-movement">Line movement</button><button data-pr-action="jump" data-value="pr-notes">Notes</button></nav>
    ${state.busy || state.error ? `<div class="pr-feedback" role="status">${esc(state.busy ? 'Loading this player’s ' + p.label.toLowerCase() + ' data…' : state.error)}</div>` : ''}
    <div class="pr-layout"><div class="pr-primary"><section class="pr-panel" id="pr-results"><div class="pr-filters"><div class="pr-segmented" aria-label="History window">${windows.map(([value, label]) => `<button data-pr-action="window" data-value="${value}" aria-pressed="${value === state.window}" title="${label === 'H2H' ? 'Games against this opponent' : label.startsWith('L') ? 'Last ' + value + ' available games' : label}">${label}</button>`).join('')}</div><label class="pr-venue-label"><span class="sr-only">Game location</span><select data-pr-venue aria-label="Game location"><option value="all" ${state.venue === 'all' ? 'selected' : ''}>Home + away</option><option value="home" ${state.venue === 'home' ? 'selected' : ''}>Home only</option><option value="away" ${state.venue === 'away' ? 'selected' : ''}>Away only</option></select></label></div>
    <div class="pr-chart-heading"><div><span class="pr-kicker">RECENT RESULTS / ${esc(p.label)}</span><h3>${s.rate === null ? `${num(s.average)} <small>average</small>` : `${Math.round(s.rate * 100)}% <small>${state.side === 'over' ? 'above' : 'below'} ${num(total)}</small>`}</h3><p>${s.rate === null ? `${s.n} recorded games in this view` : `${s.hits} of ${s.n} games${s.pushes ? ` · ${s.pushes} tied the line` : ''}`}</p></div><div class="pr-chart-summary"><span>Average <b>${num(s.average)}</b></span><span>Median <b>${num(s.median)}</b></span><span>Range <b>${s.n ? num(s.min) + '–' + num(s.max) : '—'}</b></span></div></div>
    <div class="pr-comparison"><div class="pr-segmented">${['over', 'under'].map(side => `<button data-pr-action="side" data-value="${side}" aria-pressed="${state.side === side}">${side === 'over' ? 'Over' : 'Under'}</button>`).join('')}</div><form data-pr-line-form><label>Compare line<input name="line" type="number" min="-100" max="1000" step="any" value="${total ?? ''}" placeholder="Enter line" required></label><button class="pr-button" type="submit">Apply</button></form>${state.manual ? '<button class="pr-text-button" data-pr-action="reset-line">Reset</button>' : ''}</div>
    <p class="pr-reference">${esc(reference)}${p.prop && !state.manual ? ' · checked ' + esc(stamp(p.prop.fetchedAt)) : ''}</p>${gameChart(rows, total, state.side, false, innerWidth <= 800 ? innerWidth - 54 : Math.min(1260, innerWidth - 48) - 440)}
    <div class="pr-chart-legend"><span><i class="${total === null ? 'neutral' : 'hit'}"></i>${total === null ? 'Recorded result' : state.side === 'over' ? 'Above line' : 'Below line'}</span>${total === null ? '' : `<span><i class="miss"></i>${state.side === 'over' ? 'Below line' : 'Above line'}</span><span><i class="push"></i>Tied line</span>`}<span>Oldest → newest</span></div>
    ${rows.find(r => r.parts.length)?.parts.length > 1 ? `<p class="pr-muted">Stacked bars: ${rows.find(r => r.parts.length).parts.map(r => esc(r.label)).join(' + ')}.</p>` : ''}
    <p class="pr-footnote">${esc(p.historyNote)} H2H and year filters use only this available history. ${total === null ? 'No hit rate is calculated without a comparison line.' : 'Every game is compared with this one line, not its original game-day price. These are past results, not a forecast.'} ${/^\d+$/.test(state.window) && rows.length < Number(state.window) ? `Only ${rows.length} of the requested ${state.window} games are available.` : ''}</p>
    <button class="pr-text-button" data-pr-action="log" aria-expanded="${state.showLog}">${state.showLog ? 'Hide' : 'View'} game log & box scores ${state.showLog ? '−' : '+'}</button>
    ${state.showLog ? `<div class="pr-table-scroll"><table><thead><tr><th>Date</th><th>Opponent</th><th>${esc(p.label)}</th><th>vs line</th><th>Box score</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(shortDate(r.date))}</td><td>${esc(r.opponent ? `${r.home === false ? '@' : 'vs'} ${r.opponent}` : 'Not supplied')}</td><td>${num(r.value)}</td><td>${total === null ? '—' : r.value === total ? 'Tied' : r.value > total ? 'Above' : 'Below'}</td><td>${link(r.url, 'Source') || 'Unavailable'}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
    <section class="pr-panel"><div class="pr-section-heading"><h3>Supporting stats</h3><div class="pr-segmented">${['average', 'median'].map(v => `<button data-pr-action="method" data-value="${v}" aria-pressed="${state.method === v}">${v === 'average' ? 'Average' : 'Median'}</button>`).join('')}</div></div><div class="pr-support">${supportingStats(p, rows, state.method).map(s => `<div><span>${esc(s.label)}</span><strong>${s.percent ? num(s.value * 100) + '%' : num(s.value)}</strong><small>${s.n} games</small></div>`).join('') || '<p>Supporting counts were not supplied for these games.</p>'}</div><p class="pr-footnote">${state.method === 'median' ? 'Median is the middle result, which is less affected by an unusually big game.' : 'Average adds each game’s result and divides by the number of games with that statistic.'} Uses the same filters as the chart.</p></section>
    <section class="pr-panel"><span class="pr-kicker">MODEL ESTIMATE</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${probability === null ? '' : `<div class="pr-probability"><strong>${Math.round(probability * 100)}%</strong><span>Estimated chance ${state.side === 'over' ? 'above' : 'below'} the posted ${num(p.prop.line)} line.<small>This model estimate is separate from the chart’s past-game frequency.</small></span></div>`}<p class="pr-footnote">The estimate depends on expected playing time and prior production. It is not a confirmed outcome. ${state.manual ? 'Model odds are hidden for your custom line because the model has not priced it.' : ''}</p></section>
    <section class="pr-panel" id="pr-notes"><h3>Your notes</h3><label class="sr-only" for="pr-note">Research note for ${esc(p.name)}</label><textarea id="pr-note" data-pr-note maxlength="5000" placeholder="What matters for this matchup?">${esc(state.note)}</textarea><small data-pr-note-status>Saved in this browser</small></section>
    <section class="pr-panel pr-developer" data-dev-only><span class="pr-kicker">DEV MODE</span><h3>Model inputs & source data</h3><p>Version ${esc(p.forecast.version || 'not supplied')}. These technical details are hidden when Dev mode is off.</p>${p.technical}<details><summary>Raw player and source context</summary><pre>${esc(JSON.stringify({ player: p.raw, context: p.boardMeta }, null, 2))}</pre></details></section></div>
    <aside class="pr-sidebar"><section class="pr-panel" id="pr-matchup"><div class="pr-segmented pr-aside-tabs">${[['matchup', 'Matchup'], ['availability', 'Availability'], ['insights', 'Insights']].map(([v, name]) => `<button data-pr-action="tab" data-value="${v}" aria-pressed="${state.tab === v}">${name}</button>`).join('')}</div><h3>${state.tab === 'matchup' ? 'The opponent' : state.tab === 'availability' ? 'Who is playing?' : 'What stands out'}</h3>${state.tab === 'matchup' ? matchup(p, state.defense) : state.tab === 'availability' ? availability(p) : insights(p, rows)}</section>
    <section class="pr-panel" id="pr-movement"><h3>Line movement</h3>${movement(p)}</section>
    <section class="pr-panel">${selectedGame(p)}</section><section class="pr-panel"><h3>Game conditions</h3><p>${p.weather?.indoor ? 'Played indoors. Wind and temperature do not affect this matchup.' : p.weather?.status === 'available' ? `${num(p.weather.temperatureF)}°F · ${num(p.weather.windMph)} mph wind. ${esc(p.weather.location || '')}` : 'A verified weather or roof update is not available.'}</p>${link(p.weather?.sourceUrl, 'Weather / venue source')}</section></aside></div>
    <footer class="pr-footer"><div><strong>${total === null ? 'No comparison line' : `${state.side === 'over' ? 'Over' : 'Under'} ${num(total)}`}</strong><span>${esc(state.manual ? 'Your line' : p.prop?.bookmaker || 'Research comparison')}${rawOdds === null ? '' : ' · ' + price(rawOdds)}</span></div><span>${s.n} games in view</span>${link(p.prop?.sourceUrl, 'View line source')}</footer>`;
    document.dispatchEvent(new Event('researchopened'));
    if (focusAction) [...dialog.querySelectorAll('[data-pr-action]')].find(b => b.dataset.prAction === focusAction && b.dataset.value === focusValue)?.focus({ preventScroll: true });
    else if (focusControl) dialog.querySelector(focusControl)?.focus({ preventScroll: true });
  }
  render(); dialog.showModal(); dialog.querySelector('.pr-close').focus();
  if (loadDetails) {
    const id = ++sequence; controller = new AbortController(); state.busy = true; render();
    loadDetails(controller.signal).then(next => { if (id === sequence && dialog.open) { state.profile = next; observeLines([next]); } }).catch(error => { if (id === sequence && error.name !== 'AbortError') state.error = 'Full history could not be loaded. ' + error.message; }).finally(() => { if (id === sequence && dialog.open) { state.busy = false; render(); } });
  }
}

const trendStates = new WeakMap();
export function renderTrends(container, profiles, { open } = {}) {
  observeLines(profiles);
  const previous = trendStates.get(container), state = previous?.state || { window: '10', side: 'over', sort: 'change', posted: false, count: 30 };
  previous?.controller.abort(); const controller = new AbortController(); trendStates.set(container, { state, controller });
  const paint = () => {
    const rows = profiles.map(p => { const games = selectGames(p, state), line = defaultLine(p); return { p, games, line, stats: summarize(games, line, state.side), change: recentChange(p.rows) }; }).filter(r => r.stats.n && (!state.posted || r.p.prop && !r.p.prop.stale));
    rows.sort(state.sort === 'rate' ? (a, b) => (b.stats.rate ?? -1) - (a.stats.rate ?? -1) || b.stats.n - a.stats.n : state.sort === 'average' ? (a, b) => b.stats.average - a.stats.average : (a, b) => (b.change.change === null ? -Infinity : Math.abs(b.change.change)) - (a.change.change === null ? -Infinity : Math.abs(a.change.change)) || a.p.name.localeCompare(b.p.name));
    container.innerHTML = `<section class="trends-intro"><div><span class="pr-kicker">PLAYER TRENDS</span><h2>Recent form, game by game.</h2><p>Compare the latest results, playing time and posted lines. Choose a player to see the full chart and matchup.</p></div><div><strong>${rows.length}</strong><span>players with recorded history</span></div></section><div class="trends-controls"><div class="pr-segmented" aria-label="Trend window">${['5', '10', '20'].map(v => `<button data-trend-window="${v}" aria-pressed="${state.window === v}">Last ${v}</button>`).join('')}</div><label>Compare<select data-trend-side><option value="over" ${state.side === 'over' ? 'selected' : ''}>Above the line</option><option value="under" ${state.side === 'under' ? 'selected' : ''}>Below the line</option></select></label><label>Sort by<select data-trend-sort><option value="change" ${state.sort === 'change' ? 'selected' : ''}>Largest recent change</option><option value="rate" ${state.sort === 'rate' ? 'selected' : ''}>Past-game frequency</option><option value="average" ${state.sort === 'average' ? 'selected' : ''}>Highest average</option></select></label><label class="trends-check"><input type="checkbox" data-trend-posted ${state.posted ? 'checked' : ''}> Fresh posted lines only</label></div><p class="pr-footnote">Recent change compares the last five games with the five before them. Frequencies compare past results with one current or labeled archived line; they are not a predicted win rate.</p><div class="trends-grid">${rows.slice(0, state.count).map(({ p, games, line, stats: s, change: c }) => `<article class="trend-card"><header>${p.image ? `<img src="${safeUrl(p.image)}" alt="" loading="lazy">` : ''}<div><h3><button data-trend-player="${esc(p.key)}">${esc(p.name)}</button></h3><p>${esc(p.team)} vs ${esc(p.opponent)} · ${esc(p.label)}</p></div></header><div class="trend-metrics"><div><span>${s.n} games · average</span><strong>${num(s.average)}</strong></div><div><span>${line === null ? 'Comparison line' : (state.side === 'over' ? 'Above ' : 'Below ') + num(line)}</span><strong>${s.rate === null ? 'Not posted' : `${s.hits}/${s.n}`}</strong></div><div><span>Last 5 vs prior 5</span><strong class="${c.change > 0 ? 'pr-up' : c.change < 0 ? 'pr-down' : ''}">${c.change === null ? 'Need 10 games' : (c.change > 0 ? '+' : '') + num(c.change)}</strong></div></div>${gameChart(games, line, state.side, true)}<div class="trend-bottom"><span>${esc(bookLabel(p))}${s.pushes ? ' · ' + s.pushes + ' tied' : ''}</span><button class="pr-button" data-trend-player="${esc(p.key)}">Explore trends ↗</button></div></article>`).join('')}</div>${!rows.length ? '<div class="pr-empty"><h3>No history matches this view</h3><p>Try another date, market or player filter.</p></div>' : rows.length > state.count ? `<button class="pr-button trends-more" data-trend-more>Show 30 more players</button>` : ''}`;
  };
  container.addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.trendWindow) { state.window = button.dataset.trendWindow; paint(); } if (button.hasAttribute('data-trend-more')) { state.count += 30; paint(); } if (button.dataset.trendPlayer) { const p = profiles.find(p => p.key === button.dataset.trendPlayer); if (p) open?.(p); } }, { signal: controller.signal });
  container.addEventListener('change', event => { if (event.target.hasAttribute('data-trend-side')) state.side = event.target.value; if (event.target.hasAttribute('data-trend-sort')) state.sort = event.target.value; if (event.target.hasAttribute('data-trend-posted')) state.posted = event.target.checked; paint(); }, { signal: controller.signal });
  paint();
}
