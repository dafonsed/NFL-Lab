import {requestData} from './product-ui.js';
import { mountSimulationProps } from './simulation-props.js';
import { icon } from './ui-icons.js';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pct = n => Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '—';
const num = n => Number.isFinite(n) ? n.toFixed(1) : '—';
const sport = document.querySelector('.site-header').dataset.siteSport || 'nfl';
const supported = ['nfl', 'nba', 'wnba', 'mlb'].includes(sport);
let controller, result = null, disposeProps, canRun = false;
const empty = $('sim-results').innerHTML;
function status(text, error = false) { $('sim-status').textContent = text; $('sim-status').classList.toggle('error', error); }
function clearResult() { disposeProps?.(); disposeProps = null; result = null; $('sim-results').innerHTML = empty; }
async function request(path, params, signal) {return requestData(path+'?'+new URLSearchParams(params),{signal,timeout:90000});}
function cancel() { controller?.abort(); controller = new AbortController(); return controller; }
function matchupLabel(game, events) {
  const pair = g => ['away', 'home'].map(side => g.teams.find(t => t.homeAway === side).id).join(':');
  const duplicate = events.some(g => g.id !== game.id && pair(g) === pair(game));
  const names = ['away', 'home'].map(side => game.teams.find(t => t.homeAway === side).name).join(' at ');
  const start = duplicate ? new Date(game.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '';
  return names + (duplicate ? ` · ${start}` : '') + (game.state !== 'pre' ? ' · Reconstruction' : '');
}
async function catalog(date) {
  const current = cancel(); canRun = false; clearResult(); $('sim-game').disabled = true; $('sim-run').disabled = true; $('sim-retry').hidden = true;
  $('sim-results').setAttribute('aria-busy', 'false');
  status('Loading matchups from the connected schedule…');
  try {
    const data = await request('/api/simulation/catalog', { sport, ...(date ? { date } : {}) }, current.signal);
    if (current !== controller) return;
    $('sim-date').value = data.date;
    $('sim-game').innerHTML = data.events.length ? data.events.map(g => `<option value="${esc(g.id)}">${esc(matchupLabel(g, data.events))}</option>`).join('') : '<option value="">No games on this date</option>';
    canRun = Boolean(data.events.length && !data.stale);
    const label=$('sim-game').selectedOptions?.[0]?.textContent;if(label&&data.events.length)$('sim-results').innerHTML='<section class="sim-ready"><span class="sim-ready-icon" aria-hidden="true">'+icon('simulation')+'</span><div><h2>'+esc(label)+'</h2><p>Uses earlier scores and opponent strength. Injuries, weather and lineups are not included in the game model.</p><small>Run the simulation to see score distributions and estimated win probabilities.</small></div></section>';
    $('sim-game').disabled = !data.events.length; $('sim-run').disabled = !canRun; $('sim-retry').hidden = !data.stale;
    status(data.stale ? 'The schedule is stale. Select the date again to retry.' : data.events.length ? `${data.events.length} matchup${data.events.length === 1 ? '' : 's'} available · Choose a game and run the model.` : 'No games are scheduled on this date. Choose another game date.', data.stale);
  } catch (e) { if (e.name !== 'AbortError' && current === controller) { $('sim-game').innerHTML = '<option value="">Schedule unavailable</option>'; $('sim-retry').hidden = false; status(e.message + ' Retry the schedule or choose another date.', true); } }
}
function chart(dist, label) {
  if (!dist?.pmf?.length) return `<div class="sim-empty"><h3>${esc(label)} unavailable</h3><p>No distribution was returned for this result. Run the simulation again to retry.</p></div>`;
  const lo = dist.pmf[0].value, hi = dist.pmf.at(-1).value, width = Math.max(1, Math.ceil((hi - lo + 1) / 12));
  const bins = Array.from({ length: Math.ceil((hi - lo + 1) / width) }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width - 1, p: 0 }));
  for (const row of dist.pmf) bins[Math.floor((row.value - lo) / width)].p += row.probability;
  const max = Math.max(...bins.map(b => b.p));
  return `<div class="sim-chart-scroll" role="region" tabindex="0" aria-label="${esc(label)}; scroll horizontally for all ranges"><div class="sim-histogram" role="img" aria-label="${esc(label + ': ' + bins.map(b => `${b.from} to ${b.to}: ${pct(b.p)}`).join('; '))}">${bins.map(b => `<div class="sim-bin" title="${b.from} to ${b.to}: ${pct(b.p)}"><span>${pct(b.p)}</span><i style="height:${Math.round(b.p / max * 120)}px"></i></div>`).join('')}</div><div class="sim-axis"><span>${lo}</span><span>${width}-${sport === 'mlb' ? 'run' : 'point'} bins</span><span>${bins.at(-1).to}</span></div></div><p class="sim-chart-help">Scroll to see all ranges, or open the values below.</p><details class="sim-chart-data"><summary>View distribution values</summary><table><thead><tr><th scope="col">Range</th><th scope="col">Simulated frequency</th></tr></thead><tbody>${bins.map(b=>`<tr><th scope="row">${b.from} to ${b.to}</th><td>${pct(b.p)}</td></tr>`).join('')}</tbody></table></details>`;
}
function render(r) {
  const [away, home] = r.teams, total = r.total, margin = r.homeMargin;
  const regulation = r.outcomeScope === 'regulation-only';
  const scope = regulation ? 'Regulation only · overtime outcomes withheld' : sport === 'mlb' ? 'Approximate full game · walk-off margins unmodeled' : 'Approximate full game';
  const team = t => `<div class="sim-team"><small>${t.side.toUpperCase()}</small><h2>${esc(t.name)}</h2><strong>${pct(t.winProbability)}</strong><p>${regulation ? 'Chance to lead after regulation' : 'Approximate win probability'}</p></div>`;
  const stat = (title, value, note) => `<div class="sim-stat"><span>${title}</span><strong>${value}</strong><small>${note}</small></div>`;
  $('sim-results').innerHTML = `<div class="sim-result-top"><span>${r.simulations.toLocaleString()} SIMULATIONS · ${esc(r.game.officialDate || r.inputs.cutoff)} · ${r.game.state === 'pre' ? 'PREGAME SCENARIOS' : 'HISTORICAL RECONSTRUCTION'}</span><button id="sim-download" class="button">Download result JSON ↓</button></div>
    <p class="sim-scope"><strong>${esc(scope)}</strong></p><section class="sim-outcome" aria-label="Simulation outcome"><div class="sim-matchup">${team(away)}<div class="sim-projection"><small>${regulation ? 'EXPECTED REGULATION SCORE' : 'APPROXIMATE FINAL SCORE'}</small><strong>${num(away.score.mean)} <span class="muted">—</span> ${num(home.score.mean)}</strong><p>${esc(away.label)} away / ${esc(home.label)} home</p></div>${team(home)}</div><div class="sim-prob-bar" aria-hidden="true"><span style="width:${away.winProbability * 100}%"></span><span style="width:${r.probabilities.tie * 100}%"></span><span style="width:${home.winProbability * 100}%"></span></div><div class="sim-prob-labels"><span>${esc(away.label)}</span><span>${regulation ? 'Regulation tie' : 'Tie'} ${pct(r.probabilities.tie)}</span><span>${esc(home.label)}</span></div></section>
    <div class="sim-stats">${stat('Expected total', num(total.mean), `Median ${num(total.median)} · Middle 80%: ${total.p10}–${total.p90}`)}${stat('Home scoring margin', (margin.mean >= 0 ? '+' : '') + num(margin.mean), `Middle 80%: ${margin.p10} to ${margin.p90}`)}${stat(sport === 'mlb' ? 'Extra innings' : 'Overtime', pct(r.probabilities.overtime), regulation ? 'Regulation tie frequency; OT outcome not sampled' : 'Approximate continuation after a regulation tie')}${stat('Monte Carlo precision', '±' + num(100 * Math.sqrt(.25 / r.simulations) * 1.96) + ' pp', 'Worst-case 95% sampling error; excludes model error')}</div>
    <div class="sim-charts"><section class="sim-panel"><h2>Total scoring distribution</h2><p>Both teams combined · Middle 80%: ${total.p10}–${total.p90}</p>${chart(total, 'Total score probabilities')}</section><section class="sim-panel"><h2>${regulation ? 'Regulation margin' : 'Approximate margin'} distribution</h2><p>Negative favors ${esc(away.label)} · Positive favors ${esc(home.label)}</p>${chart(margin, 'Home margin probabilities')}</section></div>
    <section id="sim-player-props" class="sim-player-props" aria-label="Player prop forecasts"></section>
    <details class="sim-details" open><summary>Model assumptions &amp; limitations</summary><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>
    <details class="sim-details"><summary>Historical validation · still experimental</summary>${Object.keys(r.evidence?.phases || {}).length ? `<p>Retrospective chronological NFL diagnostic. Lower Brier score is better. Scores and lead/tie probabilities refer to regulation only. The baseline uses reconstructed 2022 regulation outcomes. The evaluator fits no calibrator or weights; these periods are not a prospectively locked holdout.</p><div class="sim-table-wrap"><table><thead><tr><th>Period</th><th>Games</th><th>Home Brier</th><th>Baseline Brier</th><th>Margin MAE</th></tr></thead><tbody>${Object.entries(r.evidence.phases).map(([phase, m]) => `<tr><td>${m.season} · ${phase === 'finalEvaluation' ? '2025 diagnostic' : phase === 'validation' ? '2024 diagnostic' : '2023 diagnostic'}</td><td>${m.n}</td><td>${m.homeBrier.toFixed(4)}</td><td>${m.baselineHomeBrier.toFixed(4)}</td><td>${num(m.marginMAE)}</td></tr>`).join('')}</tbody></table></div><p>These are retrospective regulation diagnostics, not final-game probabilities, publication-faithful backtests, or untouched holdouts. Better baseline scores do not establish reliable betting predictions.</p>` : ''}<ul>${(r.evidence?.limitations || ['No historical evaluation is attached.']).map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>
    <details class="sim-details"><summary>Inputs, weights &amp; score ranges</summary><p>${esc(r.inputs.method)}</p><div class="sim-table-wrap"><table><thead><tr><th>Input</th>${r.teams.map(t => `<th>${esc(t.label)}</th>`).join('')}</tr></thead><tbody>${[
      ['Earlier games', t => t.inputs.count], ['History / league weight', t => `${pct(t.inputs.historyWeight)} / ${pct(t.inputs.leagueWeight)}`],
      ['Offense contribution (50%)', t => num(t.inputs.contributions.offense)], ['Opponent defense contribution (50%)', t => num(t.inputs.contributions.opponentDefense)],
      ['Venue contribution', t => num(t.inputs.contributions.venue)], ['Bound adjustment', t => num(t.inputs.contributions.clampAdjustment)], ['Scoring baseline before simulation', t => num(t.inputs.expected)],
      ['Median scenario score', t => num(t.score.median)], ['Scenario score: 10th–90th percentile', t => `${t.score.p10}–${t.score.p90}`], ['95% Monte Carlo interval', t => t.monteCarloInterval95.map(pct).join('–')]
    ].map(([label, f]) => `<tr><th>${label}</th>${r.teams.map(t => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>Historical score basis: regulation only · ${r.scoreBasis.included} included · ${r.scoreBasis.excluded.length} excluded · continuation removed from ${r.scoreBasis.continuationRemoved} games.</p><p>${esc(r.inputs.randomness)}</p><p>Recency half-life: ${r.inputs.weights.halfLife} days · Shrinkage: ${r.inputs.weights.shrink} equivalent games · Strict cutoff: ${esc(r.inputs.cutoff)}</p><p>Version: ${esc(r.version)} · Seed: <code>${esc(r.seed)}</code></p><p>Input fingerprint: <code>${esc(r.inputDigest)}</code></p></details>
    <details class="sim-details"><summary>Compare a sportsbook market</summary>${r.marketComparison.available ? '' : `<p><strong>${esc(r.marketComparison.reason)}</strong></p>`}<div ${r.marketComparison.available ? '' : 'hidden'}><p>Enter both prices for the same two-way market. Home spread uses the book’s sign (for example, −3.5). These are manual, unverified quotes. A difference is not a validated betting edge.</p><form id="sim-market" class="sim-controls sim-market"><label>Market<select name="market"><option value="moneyline">Moneyline (home / away)</option><option value="spread">Home spread / away spread</option><option value="total">Total (over / under)</option></select></label><label>Line (spread / total)<input name="line" type="number" step="0.5" min="-1000" max="1000" value="0" required></label><label>Home / over odds<input name="firstOdds" type="number" placeholder="−110" required></label><label>Away / under odds<input name="secondOdds" type="number" placeholder="−110" required></label><button class="button" type="submit">Compare prices</button></form><div id="sim-market-result"></div></div></details>
    <details class="sim-details"><summary>Source receipts &amp; reproducibility</summary><p>Seed <code>${esc(r.seed)}</code> repeats the same runs when the model version and inputs match. Corrected source data can change a later result. Export JSON to keep the full probability distributions and selected history IDs.</p><ul>${r.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(new URL(s.url).hostname)}</a> · Retrieved ${esc(s.fetchedAt)}<br><code>${esc(s.sha256 || '')}</code></li>`).join('')}</ul></details>`;
  $('sim-download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `simulation-${sport}-${r.game.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('sim-market').addEventListener('submit', compare);
  disposeProps = mountSimulationProps($('sim-player-props'), { sport, game: r.game.id, date: r.game.officialDate || r.inputs.cutoff, onData: data => { if (result) result = { ...result, playerProps: data }; } });
}
async function run(event) {
  event?.preventDefault(); if (!canRun || !$('simulation-form').reportValidity()) return; const current = cancel(); clearResult();
  $('sim-run').disabled = true; $('sim-results').setAttribute('aria-busy', 'true'); status('Loading earlier scores and simulating the matchup…');
  const params = { sport, ...Object.fromEntries(new FormData($('simulation-form'))) };
  try {
    const data = await request('/api/simulation/run', params, current.signal);
    if (current !== controller) return;
    if (data.status !== 'experimental') { status(data.warnings.join(' '), true); return; }
    result = data; render(data); status('Simulation complete · Experimental, uncalibrated probabilities.');
  } catch (e) { if (e.name !== 'AbortError' && current === controller) status(e.message, true); }
  finally { if (current === controller) { $('sim-run').disabled = !canRun || !$('sim-game').value; $('sim-results').setAttribute('aria-busy', 'false'); } }
}
async function compare(event) {
  event.preventDefault(); if (!result) return;
  const old = result, current = cancel(), output = $('sim-market-result'), form = event.currentTarget;
  const button = form.querySelector('button'); button.disabled = true; output.textContent = 'Comparing prices…';
  try {
    const data = await request('/api/simulation/run', { sport, date: old.game.officialDate || old.inputs.cutoff, game: old.game.id, simulations: old.simulations, seed: old.seed, ...Object.fromEntries(new FormData(form)) }, current.signal);
    if (current !== controller || result?.inputDigest !== old.inputDigest) return;
    if (!data.market) throw Error(data.warnings.join(' '));
    if (data.inputDigest !== old.inputDigest) throw Error('Source data changed. Run the simulation again before comparing prices.');
    result = { ...result, market: data.market };
    output.innerHTML = `<p>Book overround: ${pct(data.market.overround)} · Push: ${pct(data.market.pushProbability)}</p><div class="sim-table-wrap"><table><thead><tr><th>Side</th><th>Model, excluding pushes</th><th>Implied by price</th><th>Market, vig removed</th><th>Difference</th></tr></thead><tbody>${data.market.selections.map(s => `<tr><td>${esc(s.side)}</td><td>${pct(s.conditionalModelProbability)}</td><td>${pct(s.rawImpliedProbability)}</td><td>${pct(s.noVigMarketProbability)}</td><td>${s.difference === null ? '—' : num(s.difference * 100) + ' pp'}</td></tr>`).join('')}</tbody></table></div><p>${esc(data.market.assumptions)}</p>`;
  } catch (e) { if (e.name !== 'AbortError') output.textContent = e.message; }
  finally { button.disabled = false; }
}
$('simulation-form').addEventListener('submit', run);
$('sim-date').addEventListener('input', () => {
  cancel(); clearResult(); canRun = false;
  $('sim-game').disabled = true; $('sim-run').disabled = true;
  $('sim-results').setAttribute('aria-busy', 'false');
  status('Date changed. Choose a valid date to load its matchups.');
});
$('sim-date').addEventListener('change', () => { if ($('sim-date').checkValidity()) catalog($('sim-date').value); });
$('sim-retry').addEventListener('click', () => catalog($('sim-date').value || undefined));
$('sim-game').addEventListener('change', () => { cancel(); clearResult(); $('sim-run').disabled = !canRun || !$('sim-game').value; $('sim-results').setAttribute('aria-busy', 'false'); status('Matchup changed. Run the simulation to update the results.'); });
for (const id of ['sim-count', 'sim-seed']) $(id).addEventListener('input', () => {
  if (!canRun) return;
  // Editing simulation options must not abort a pending schedule request.
  if (canRun) cancel(); clearResult(); $('sim-results').setAttribute('aria-busy', 'false');
  $('sim-run').disabled = !canRun || !$('sim-game').value || $('sim-game').disabled;
  if (canRun) status('Inputs changed. Run the simulation to update the results.');
});
if (supported) catalog(new URLSearchParams(location.search).get('date'));
else {
  const label = sport === 'soccer' ? 'Soccer' : sport.toUpperCase();
  $('simulation-form').hidden = true;
  document.querySelector('.page-heading p').textContent = 'Choose a supported sport to run a game simulation.';
  document.querySelector('.sim-badge').textContent = 'NOT AVAILABLE';
  document.querySelector('.sim-note').hidden = true;
  document.querySelector('.research-guide')?.setAttribute('hidden', '');
  status('Game simulation is available for NFL, NBA, WNBA and MLB. Select one of those sports above.');
  $('sim-results').innerHTML = `<section class="sim-empty"><h2>${esc(label)} simulation is not available</h2><p>You can still explore ${esc(label)} player research and historical trends.</p><nav class="sim-supported-links" aria-label="Available research"><a class="button primary" href="/${sport}">${esc(label)} research</a><a class="button subtle" href="/${sport}?view=trends">${esc(label)} Trends</a></nav></section>`;
}
