import {playerPortrait,teamMark} from './sports-identity.js';
import {sportsbookMark} from './product-ui.js';
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

// Scoreboard hero. `model` (optional) adds a win-probability bar once the live model is ready.
export function gameScoreboardHtml(game, sport, status, model = null) {
  if (!game) return '';
  const teams=[...game.teams].sort((a,b)=>a.homeAway==='away'?-1:b.homeAway==='away'?1:0);
  const start=game.date?new Date(game.date):null;
  const date=start&&!Number.isNaN(start.valueOf())?start.toLocaleDateString([],{month:'short',day:'numeric'}):'';
  const clock=start&&!Number.isNaN(start.valueOf())?start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
  const text=String(status||game.status||'Scheduled');
  // A scheduled game already shows its start time in the center block; keep the pill short.
  const label=game.state==='pre'&&(text.length>18||/\d/.test(text))?'Scheduled':text;
  const center=game.state==='pre'?`<strong>${esc(clock)}</strong><span>Start time</span>`:game.state==='in'?`<span class="live-matchup-pulse"><i aria-hidden="true"></i>Live</span><strong class="live-matchup-clock">${esc(text)}</strong>`:`<span class="live-matchup-divider" aria-hidden="true">–</span><span>${esc(text)}</span>`;
  const leader=game.state==='post'&&teams.every(t=>Number.isFinite(t.score))&&teams[0].score!==teams[1].score?(teams[0].score>teams[1].score?0:1):-1;
  const ready=model?.status==='experimental'&&model.teams?.length===2&&model.teams.every(t=>Number.isFinite(t.probability));
  const tie=ready?Math.max(0,1-model.teams[0].probability-model.teams[1].probability):0;
  const bar=ready?`<div class="live-matchup-odds"><div class="live-matchup-odds-labels"><span><b>${percent(model.teams[0].probability)}</b> ${esc(teams[0]?.abbreviation||model.teams[0].label)}</span><small>Live win probability</small><span>${esc(teams[1]?.abbreviation||model.teams[1].label)} <b>${percent(model.teams[1].probability)}</b></span></div><div class="live-matchup-bar" role="img" aria-label="Model win probability: ${esc(teams[0]?.abbreviation||'Away')} ${percent(model.teams[0].probability)}, ${esc(teams[1]?.abbreviation||'Home')} ${percent(model.teams[1].probability)}"><i style="width:${(model.teams[0].probability*100).toFixed(2)}%"></i><i style="width:${(tie*100).toFixed(2)}%"></i><i style="width:${(model.teams[1].probability*100).toFixed(2)}%"></i></div></div>`:'';
  return `<div class="live-matchup-header" data-state="${esc(game.state||'pre')}"><div class="live-matchup-title"><span class="live-matchup-label ${game.state==='in'?'is-live':''}">${esc(label)}</span><span>${esc(date)}</span></div><div class="live-matchup-pair">${teams.map((team,index)=>`${index?`<div class="live-matchup-center">${center}</div>`:''}<div class="live-matchup-side ${index?'is-home':'is-away'}${leader===index?' is-winner':''}">${teamMark({sport,team:team.abbreviation,teamId:team.id})}<div><strong>${esc(team.name||team.abbreviation)}</strong><span>${esc(team.abbreviation)} · ${team.homeAway==='home'?'Home':'Away'}</span></div>${game.state==='pre'?'':`<b class="live-matchup-score">${number(team.score,0)}</b>`}</div>`).join('')}</div>${bar}${game.lastPlay?.text?`<p class="live-matchup-play">${esc(game.lastPlay.text)}</p>`:''}${sport==='mlb'&&game.state==='in'?`<p class="live-matchup-bases">${game.bases===null?'Base state unavailable':game.bases?.length?'On base: '+game.bases.map(esc).join(' · '):'Bases empty'}</p>`:''}</div>`;
}

// Align identical market/line selections across books; alternate lines stay separate.
export function sportsbookMatrixHtml(odds) {
  const books=odds?.books||[],rows=new Map();
  for(const [index,book] of books.entries())for(const market of book.markets||[])for(const selection of market.selections||[]){
    const key=JSON.stringify([market.key,selection.side,selection.line]);
    if(!rows.has(key))rows.set(key,{market,selection,prices:new Map()});
    rows.get(key).prices.set(index,selection.odds);
  }
  if(!books.length)return '<div class="odds-board-empty">No published prices for this matchup.</div>';
  const markets=new Map();for(const row of rows.values()){if(!markets.has(row.market.key))markets.set(row.market.key,[]);markets.get(row.market.key).push(row);}
  return `<div class="odds-market-grid ${books.length>2?'many-books':''}">${[...markets.values()].map(group=>`<section class="odds-market-block"><h3>${esc(group[0].market.label)}</h3><div class="odds-matrix-scroll" role="region" aria-label="${esc(group[0].market.label)} sportsbook prices" tabindex="0"><table class="odds-matrix"><thead><tr><th scope="col">Selection</th>${books.map(book=>`<th scope="col"><span>${sportsbookMark(book.name)}${esc(book.name)}</span></th>`).join('')}</tr></thead><tbody>${group.map(({market,selection:s,prices})=>{
    const line=s.line==null?'':market.key==='pointSpread'?price(s.line):number(s.line);
    const quoted=[...prices.values()].filter(Number.isFinite),best=quoted.length>1?Math.max(...quoted):null;
    return `<tr><th scope="row"><span>${esc(s.label)}</span>${line?`<b>${esc(line)}</b>`:''}</th>${books.map((book,index)=>`<td class="book-price${best!==null&&prices.get(index)===best?' is-best':''}">${Number.isFinite(prices.get(index))?`<span class="odds-quote">${sportsbookMark(book.name)}<strong>${price(prices.get(index))}</strong></span>`:'<span class="odds-missing">—</span>'}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div></section>`).join('')}</div>`;
}

export function finalPlayerHtml(player, forecast, label, metadata = '', history = [], expanded = false) {
  return `<article class="live-card live-final-card" data-live-player="${esc(player.id)}"><div class="live-final-identity live-player-identity">${playerPortrait(player)}<div><h3>${esc(player.name)}</h3><p>${esc(metadata)}</p></div></div><div class="live-final-value"><strong>${number(forecast.current)}</strong><span>${esc(label)} · Final</span></div><details class="live-final-source" data-detail="${esc(player.id)}" ${expanded?'open':''}><summary>Record context</summary>${(forecast.reasons || []).map(r=>`<p>${esc(r)}</p>`).join('')}${history.length?`<p>Earlier games in the model sample: ${history.map(s=>esc(s.date)).join(' · ')}.</p>`:''}</details></article>`;
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
        return `<tr class="${index === 0 ? 'market-start' : ''}"><th scope="row"><small class="game-market-label">${esc(market.label)}</small>${esc(label)}</th><td class="book-price" data-label="Sportsbook">${Number.isFinite(s.odds)?sportsbookMark(book.name):''}${price(s.odds)}</td>${ready ? `<td data-label="Market chance">${percent(e?.marketProbability)}${e?.marketProbability === null ? '<small>Need both sides</small>' : ''}</td><td data-label="Model chance"><span data-game-comparison>${percent(e?.conditionalProbability)}${e?.pushProbability >= .001 ? `<small>Push ${percent(e.pushProbability)}</small>` : ''}</span><span data-game-paused hidden>—</span></td><td class="fair-price" data-label="Model fair odds"><span data-game-comparison>${price(e?.fairOdds)}</span><span data-game-paused hidden>—</span></td><td data-label="Estimated EV"><span data-game-comparison>${evHtml(e?.estimatedEV)}</span><span data-game-paused hidden>—</span></td>` : ''}</tr>`;
      }).join('');
    }).join('')}</tbody></table></div></section>`;
  }).join('');
  return `<div class="live-odds-heading"><h2>Odds comparison</h2><span id="odds-status" class="live-tag"></span></div>
    ${sportsbookMatrixHtml(odds)}
    <details class="live-model-disclosure ${ready?'is-ready':'is-locked'}" open><summary><span class="live-model-title">Live model<small>${ready?'Win probability, fair odds and estimated EV from the current game state':game.state==='post'?'Live estimates close when the game ends':'Win probability, fair odds and estimated EV unlock once play begins'}</small></span><span id="game-model-status" class="live-tag">${ready ? 'Experimental' : 'Available after play begins'}</span></summary>

    <p id="game-model-paused" class="live-warning" ${ready ? 'hidden' : ''}>${esc(model?.reasons?.[0] || 'Waiting for a complete game snapshot and earlier team results.')}</p>
    ${ready ? '' : `<div class="game-model-teams game-model-locked" aria-hidden="true">${[...[...(game.teams||[])].sort((a,b)=>a.homeAway==='away'?-1:1).map(t=>[`${t.abbreviation||t.name||''} to win`,'Model fair moneyline']),['Projected game total','Middle 80% range']].map(([title,note])=>`<article><div class="eyebrow">${esc(title)}</div><strong>—</strong><small>${esc(note)}</small></article>`).join('')}</div>`}
    ${ready ? `<div data-game-model-body>${cards}<p class="game-model-verdict">${esc(model.reasons.at(-1))}</p><details class="game-model-reasons"><summary>Simulation assumptions & inputs</summary><ol>${model.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ol><p><strong>What could change this:</strong> ${esc(model.limits)}</p><p>${esc(model.calibration)} ${number(model.simulations, 0)} simulated finishes. Historical cutoff: before ${esc(model.cutoff)}.</p></details></div>` : ''}
    ${ready&&books?`<details class="game-model-comparisons"><summary>Model probabilities &amp; fair odds</summary>${books}</details>`:''}</details>
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
  if (status) { status.textContent = modelStale ? 'Paused · stale data' : ready ? 'Experimental' : data.game.state==='pre'?'Available after play begins':'Unavailable'; status.classList.toggle('withheld', modelStale || !ready); }
  if (paused) { paused.hidden = ready && !modelStale; if (modelStale) paused.textContent = 'Fair odds paused. Refresh the game data before comparing prices.'; }
  const body = container.querySelector('[data-game-model-body]'); if (body) body.hidden = modelStale;
  const hidden = modelStale || oddsStale || !ready;
  container.querySelectorAll('[data-game-comparison]').forEach(el => { el.hidden = hidden; });
  container.querySelectorAll('[data-game-paused]').forEach(el => { el.hidden = !hidden; });
  const oddsStatus = container.querySelector('#odds-status'), odds = data.odds;
  if (oddsStatus) { oddsStatus.textContent = !odds?.books?.length ? 'Unavailable' : oddsStale ? 'Saved prices' : data.game.state === 'in' ? 'Live prices' : data.game.state === 'post' ? 'Archived pregame' : 'Pregame'; oddsStatus.title=`Last checked ${time(odds?.fetchedAt)}${oddsStale?' · Refresh to update prices':''}`; oddsStatus.classList.toggle('withheld', oddsStale || !odds?.books?.length); }
  container.classList.toggle('is-stale', oddsStale);
}
