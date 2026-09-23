const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (x, digits = 1) => Number.isFinite(x) ? x.toFixed(digits) : '—';
const percent = x => Number.isFinite(x) ? number(x * 100) + '%' : '—';
const price = x => Number.isFinite(x) ? (x > 0 ? '+' : '') + x : '—';
const evHtml = value => {
  if (!Number.isFinite(value)) return '—';
  const percentValue = Number((value * 100).toFixed(1)), profit = Number((value * 100).toFixed(2));
  return `${percentValue > 0 ? '+' : ''}${number(percentValue)}%<small>${profit > 0 ? '+' : profit < 0 ? '−' : ''}$${number(Math.abs(profit), 2)} net / $100</small>`;
};
const time = t => t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'unavailable';
const old = (at, sourceAge = 0, now = Date.now()) => { const age = now - Date.parse(at) + sourceAge; return !Number.isFinite(age) || age > 45000 || age < -5000; };

export function finalPlayerHtml(player, forecast, label, metadata = '', history = [], expanded = false) {
  return `<article class="live-card live-final-card" data-live-player="${esc(player.id)}"><div class="live-final-identity"><h3>${esc(player.name)}</h3><p>${esc(metadata)}</p></div><div class="live-final-value"><strong>${number(forecast.current)}</strong><span>${esc(label)} · Final</span></div><details class="live-final-source" data-detail="${esc(player.id)}" ${expanded?'open':''}><summary>Record context</summary>${(forecast.reasons || []).map(r=>`<p>${esc(r)}</p>`).join('')}${history.length?`<p>Earlier games in the model sample: ${history.map(s=>esc(s.date)).join(' · ')}.</p>`:''}</details></article>`;
}

export function gameOddsFreshness(data, error = '', now = Date.now()) {
  return { modelStale: !!error || !!(data?.gameDataStale ?? data?.stale) || old(data?.fetchedAt, data?.sourceAgeMs, now),
    oddsStale: !!error || data?.odds?.status === 'stale' || old(data?.odds?.fetchedAt, data?.odds?.sourceAgeMs, now) };
}
export function gameOddsHtml(data) {
  const game = data?.game, model = data?.gameModel, odds = data?.odds;
  if (!game) return '';
  const ready = model?.status === 'experimental';
  const cards = ready ? `<div class="game-model-teams">${model.teams.map(t => `<article><div class="eyebrow">${esc(t.label)} TO WIN</div><strong>${percent(t.probability)}</strong><p>Model fair moneyline <b>${price(t.fairOdds)}</b></p><small>Projected score ${number(t.projectedScore)}${t.pushProbability >= .001 ? ` · tie ${percent(t.pushProbability)}` : ''}</small></article>`).join('')}<article class="game-model-total"><div class="eyebrow">PROJECTED GAME TOTAL</div><strong>${number(model.projectedTotal)}</strong><p>Home margin <b>${number(model.homeMargin)}</b></p><small>Middle 80% of totals: ${model.totalRange.map(x => number(x, 0)).join('–')}</small></article></div>` : '';
  const books = (odds?.books || []).map((book, bi) => {
    const comparison = model?.books?.find(b => b.name === book.name);
    return `<section class="game-book"><h3 id="game-book-${bi}">${esc(book.name)}</h3><div class="game-odds-scroll" role="region" tabindex="0" aria-labelledby="game-book-${bi}"><table class="game-odds-table ${ready ? '' : 'game-odds-archive'}"><thead><tr><th scope="col">Market / selection</th><th scope="col">Sportsbook</th>${ready ? '<th scope="col">Market chance</th><th scope="col">Model chance</th><th scope="col">Model fair odds</th><th scope="col">Estimated EV</th>' : ''}</tr></thead><tbody>${book.markets.map(market => {
      const estimates = comparison?.markets.find(m => m.key === market.key);
      return market.selections.map((s, index) => {
        const e = estimates?.selections.find(e => e.side === s.side && e.line === s.line);
        const label = `${s.label}${s.line !== null ? ' ' + (market.key === 'pointSpread' ? price(s.line) : number(s.line)) : ''}`;
        return `<tr class="${index === 0 ? 'market-start' : ''}"><th scope="row"><small class="game-market-label">${esc(market.label)}</small>${esc(label)}</th><td class="book-price" data-label="Sportsbook">${price(s.odds)}</td>${ready ? `<td data-label="Market chance">${percent(e?.marketProbability)}${e?.marketProbability === null ? '<small>Need both sides</small>' : ''}</td><td data-label="Model chance"><span data-game-comparison>${percent(e?.conditionalProbability)}${e?.pushProbability >= .001 ? `<small>Push ${percent(e.pushProbability)}</small>` : ''}</span><span data-game-paused hidden>—</span></td><td class="fair-price" data-label="Model fair odds"><span data-game-comparison>${price(e?.fairOdds)}</span><span data-game-paused hidden>—</span></td><td data-label="Estimated EV"><span data-game-comparison>${evHtml(e?.estimatedEV)}</span><span data-game-paused hidden>—</span></td>` : ''}</tr>`;
      }).join('');
    }).join('')}</tbody></table></div></section>`;
  }).join('');
  return `<div class="live-odds-heading"><div><div class="eyebrow">LIVE GAME MODEL</div><h2>Game odds</h2></div><span id="game-model-status" class="live-tag">${ready ? 'EXPERIMENTAL ESTIMATE' : 'WITHHELD'}</span></div>

    <p id="game-model-paused" class="live-warning" ${ready ? 'hidden' : ''}>${esc(model?.reasons?.[0] || 'Waiting for a complete game snapshot and earlier team results.')}</p>
    ${ready ? `<div data-game-model-body>${cards}<p class="game-model-verdict">${esc(model.reasons.at(-1))}</p><details class="game-model-reasons"><summary>Simulation assumptions & inputs</summary><ol>${model.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ol><p><strong>What could change this:</strong> ${esc(model.limits)}</p><p>${esc(model.calibration)} ${number(model.simulations, 0)} simulated finishes. Historical cutoff: before ${esc(model.cutoff)}.</p></details></div>` : ''}
    <div class="live-odds-heading game-books-heading"><div class="eyebrow">SPORTSBOOK COMPARISON</div><span id="odds-status" class="live-tag"></span></div>
    ${books || `<p>${game.state === 'in' ? 'Live sportsbook prices are unavailable. Model estimates can still appear when game and history data are fresh.' : 'No published prices for this game.'}</p>`}
    <details class="odds-definitions"><summary>How to read odds, probabilities and EV</summary><p class="live-odds-note"><strong>Estimated EV</strong> is the model’s expected net profit or loss as a percentage of your stake at the listed sportsbook price. For example, +5% EV means an estimated +$5 net per $100 wagered over repeated comparable bets; −5% means an estimated $5 loss. EV = win probability × net payout − loss probability × stake; a push returns the stake and contributes $0 profit. It is an estimate, not a guaranteed return.</p>
    <p class="live-odds-note">Market chance removes the bookmaker margin when matching prices for both sides are present. Table probabilities exclude pushes; EV includes their chance and uses the actual sportsbook payout. Model fair prices are capped at ±19900.</p>
    <p class="live-odds-note">${esc(model?.settlement || '')} ${esc(odds?.note || '')} ${esc(odds?.regionNote || '')}${/^https:\/\//.test(odds?.sourceUrl || '') ? ` <a href="${esc(odds.sourceUrl)}" target="_blank" rel="noreferrer">Odds source ↗</a>` : ''}</p></details>`;
}
export function renderGameOdds(container, data) {
  container.hidden = !data?.game;
  const expanded = container.querySelector('.game-model-reasons')?.open;
  const definitions = container.querySelector('.odds-definitions')?.open;
  container.innerHTML = gameOddsHtml(data);
  if (expanded) container.querySelector('.game-model-reasons')?.setAttribute('open', '');
  if (definitions) container.querySelector('.odds-definitions')?.setAttribute('open', '');
}
export function updateGameOdds(container, data, error = '') {
  if (!data?.game) return;
  const { modelStale, oddsStale } = gameOddsFreshness(data, error);
  const ready = data.gameModel?.status === 'experimental', paused = container.querySelector('#game-model-paused'), status = container.querySelector('#game-model-status');
  if (status) { status.textContent = modelStale ? 'PAUSED · STALE DATA' : ready ? 'EXPERIMENTAL ESTIMATE' : 'WITHHELD'; status.classList.toggle('withheld', modelStale || !ready); }
  if (paused) { paused.hidden = ready && !modelStale; if (modelStale) paused.textContent = 'Fair odds paused. Refresh the game data before comparing prices.'; }
  const body = container.querySelector('[data-game-model-body]'); if (body) body.hidden = modelStale;
  const hidden = modelStale || oddsStale || !ready;
  container.querySelectorAll('[data-game-comparison]').forEach(el => { el.hidden = hidden; });
  container.querySelectorAll('[data-game-paused]').forEach(el => { el.hidden = !hidden; });
  const oddsStatus = container.querySelector('#odds-status'), odds = data.odds;
  if (oddsStatus) { oddsStatus.textContent = !odds?.books?.length ? 'UNAVAILABLE' : oddsStale ? 'STALE · refresh prices' : `${data.game.state === 'in' ? 'PROVIDER LIVE' : data.game.state === 'post' ? 'ARCHIVED PREGAME' : 'PREGAME'} · checked ${time(odds.fetchedAt)}`; oddsStatus.classList.toggle('withheld', oddsStale || !odds?.books?.length); }
  container.classList.toggle('is-stale', oddsStale);
}
