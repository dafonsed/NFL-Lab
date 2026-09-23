const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const num = n => Number.isFinite(n) ? Number(n.toFixed(1)).toLocaleString() : '—';
const pct = n => Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '—';
const lineLabels = { current: 'Pregame line', archived: 'Archived line', in_play: 'In-play line', stale: 'Stale line' };

export function mountSimulationProps(element, { sport, game, date, onData }) {
  let controller, data = null, disposed = false;
  const find = selector => element.querySelector(selector);
  element.innerHTML = `<div class="sim-props-heading"><div><span class="sim-eyebrow">MATCHUP / PLAYER MARKETS</span><h2>Player props</h2><p>Existing player forecasts alongside your game simulation.</p></div><a class="button" data-prop-research href="/${esc(sport)}">Full player research ↗</a></div>
    <div class="sim-prop-controls"><label>Prop market<select data-prop-market disabled><option value="">Loading markets…</option></select></label><label>Team<select data-prop-team><option value="">Both teams</option></select></label><label class="sim-prop-search">Find a player<input data-prop-search type="search" placeholder="Search players" autocomplete="off"></label><button class="button" data-prop-retry>Refresh props</button></div>
    <p class="sim-prop-status" data-prop-status role="status" aria-live="polite">Loading player forecasts and posted lines…</p><div data-prop-list></div><p class="sim-prop-method" data-prop-method>Player forecasts are separate from the game-score draws. More simulation runs do not change player estimates.</p>`;
  const message = text => { find('[data-prop-status]').textContent = text; };
  function render() {
    if (!data) return;
    const query = find('[data-prop-search]').value.trim().toLowerCase(), team = find('[data-prop-team]').value;
    const players = data.players.filter(p => (!team || p.team === team) && (!query || `${p.name} ${p.team} ${p.position}`.toLowerCase().includes(query)));
    message(`${players.length} of ${data.players.length} players · ${data.markets.find(m => m.key === data.market).label}${data.stale ? ' · Source warnings; comparisons paused' : ' · Experimental player forecasts'}`);
    find('[data-prop-list]').innerHTML = (data.warnings.length ? `<details class="sim-prop-warning"><summary>Player data notices (${data.warnings.length})</summary><ul>${data.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '') + (players.length ? `<div class="sim-prop-grid">${players.map(p => `<article class="sim-prop-card"><header><div><h3>${esc(p.name)}</h3><p>${esc(p.team)}${p.position ? ' · ' + esc(p.position) : ''}</p></div><span class="sim-prop-availability${p.status === 'unavailable' ? ' unavailable' : ''}">${esc(p.availability.status)}${p.status === 'stale' ? ' · Cached' : ''}</span></header>
      <div class="sim-prop-numbers"><div><span>${p.pointIsProbability ? 'TD occurrence estimate' : p.status === 'stale' ? 'Cached projection' : 'Projection'}</span><strong>${p.pointIsProbability ? pct(p.point) : num(p.point)}</strong><small>${esc(p.pointIsProbability ? 'Workload-based TD probability' : p.unit)}</small></div><div><span>${p.line ? esc(lineLabels[p.line.status]) : 'Sportsbook line'}</span><strong>${p.line ? num(p.line.value) : '—'}</strong><small>${esc(p.line?.bookmaker || 'Not posted')}</small></div></div>
      ${p.pointIsProbability ? '<p class="sim-prop-range">Over/under below uses historical outcomes, a separate estimate.</p>' : ''}
      <div class="sim-prop-probabilities"><span>Over <b>${pct(p.probability?.over)}</b></span><span>Under <b>${pct(p.probability?.under)}</b></span><span>Push <b>${pct(p.probability?.push)}</b></span></div>
      <p class="sim-prop-range">${p.interval ? `Middle 80%: <b>${num(p.interval[0])}–${num(p.interval[1])}</b> ${esc(p.unit)}` : 'Outcome range unavailable'} · ${p.sampleCount === null ? 'Sample unavailable' : p.sampleCount + ' prior games'}</p>
      ${!p.probability ? `<p class="sim-prop-unposted">${!p.line ? 'No posted line; over/under probabilities unavailable.' : p.line.status !== 'current' ? 'Current pregame comparison unavailable for this line.' : 'Probability comparison unavailable; see model notes.'}</p>` : ''}
      <details><summary>Model notes${p.reasons.length ? ' · ' + p.reasons.length : ''}</summary><p>${esc(p.version || 'Model unavailable')}${p.line?.fetchedAt ? ' · Line retrieved ' + esc(p.line.fetchedAt) : ''}</p><ul>${p.reasons.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details></article>`).join('')}</div>` : `<div class="sim-props-empty">${data.players.length ? 'No players match these filters.' : 'No player forecasts are available for this matchup and market yet. Try another prop market or refresh later.'}</div>`);
  }
  async function load(market = '') {
    controller?.abort(); const current = new AbortController(); controller = current;
    data = null; onData(null); find('[data-prop-list]').replaceChildren(); element.setAttribute('aria-busy', 'true');
    message('Loading player forecasts and posted lines… This can take longer than the game simulation.');
    find('[data-prop-retry]').disabled = true;
    try {
      const response = await fetch('/api/simulation/props?' + new URLSearchParams({ sport, game, date, ...(market ? { market } : {}) }), { signal: current.signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Could not load player props.');
      if (disposed || controller !== current) return;
      data = body;
      find('[data-prop-market]').innerHTML = data.markets.map(m => `<option value="${esc(m.key)}"${m.key === data.market ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
      find('[data-prop-market]').disabled = false;
      const team = find('[data-prop-team]').value, teams = [...new Set(data.players.map(p => p.team).filter(Boolean))].sort();
      find('[data-prop-team]').innerHTML = '<option value="">Both teams</option>' + teams.map(t => `<option value="${esc(t)}"${t === team ? ' selected' : ''}>${esc(t)}</option>`).join('');
      find('[data-prop-method]').textContent = data.method;
      find('[data-prop-research]').href = data.researchUrl;
      onData(data); render();
    } catch (e) { if (!disposed && controller === current && e.name !== 'AbortError') message('Player props unavailable: ' + e.message + ' Use Refresh props to retry.'); }
    finally { if (!disposed && controller === current) { find('[data-prop-retry]').disabled = false; element.setAttribute('aria-busy', 'false'); } }
  }
  find('[data-prop-market]').addEventListener('change', e => load(e.target.value));
  find('[data-prop-team]').addEventListener('change', render);
  find('[data-prop-search]').addEventListener('input', render);
  find('[data-prop-retry]').addEventListener('click', () => load(find('[data-prop-market]').value));
  load();
  return () => { disposed = true; controller?.abort(); };
}
