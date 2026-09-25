import { decimal, implied, expectedReturn, money, percent, signed, oddsLabel, probabilityToAmerican, fairProbability, fresh, groups, evRows, holdRows, arbitrage, arbitrageRows, middleRows, promoConversion, parlay, fantasySlip, closingLineValue, gradedBet, pearson, sharpMatches, alertMatches, validateWorkspace } from './ev-core.js';
import { exampleWorkspace } from './ev-demo.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const STORE = 'sportslab-ev-workbench-v1';
const TOOLS = [
  ['Markets', 'odds', 'Odds comparison', 'Compare every entered sportsbook price, consensus fair probability and recorded movement.'],
  ['Markets', 'ev-pre', 'Positive EV · pregame', 'Compare each offered price against no-vig consensus from other complete books.'],
  ['Markets', 'ev-live', 'Positive EV · live', 'The same calculation for in-game quotes that are less than 90 seconds old.'],
  ['Markets', 'arb-pre', 'Arbitrage · pregame', 'Find opposing best prices whose combined implied probabilities are below 100%.'],
  ['Markets', 'arb-live', 'Arbitrage · live', 'Calculate stakes from fresh opposing in-game quotes. Recheck the prices before acting.'],
  ['Markets', 'middles', 'Middles', 'Find spread and total line pairs, including live markets, with an interval where both bets win.'],
  ['Markets', 'holds', 'Low holds', 'Compare the best opposing prices and their combined market margin.'],
  ['Builders', 'promo', 'Promo / bonus converter', 'Balance a promotional side with a cash hedge and inspect each outcome.'],
  ['Builders', 'parlay', 'Parlay builder', 'Combine independent legs from one book using consensus estimates for each leg.'],
  ['Research', 'sharp', 'Sharp money / Pro', 'Inspect exchange liquidity, opposing sportsbook prices and price history.'],
  ['Fantasy', 'fantasy', 'Fantasy lines', 'Compare DFS player lines and entered hit probabilities across apps.'],
  ['Fantasy', 'optimizer', 'Fantasy optimizer', 'Rank two-pick combinations using each app’s saved payout rules.'],
  ['Fantasy', 'slip', 'Fantasy slip builder', 'Calculate exact hit-count probabilities and projected payout for your selected slip.'],
  ['Fantasy', 'fantasy-alerts', 'Fantasy alerts', 'Watch for newly entered props and their estimated hit rates.'],
  ['Records', 'prediction', 'Prediction traders', 'Track bid, ask, order book snapshots, traders, positions and trades.'],
  ['Records', 'tracker', 'Bet tracker & CLV', 'Grade entered bets and compare booked odds with the closing price.'],
  ['Records', 'trends', 'Player prop trends', 'Review entered game results, recent hit rates and paired-game correlations.'],
  ['Records', 'line-alerts', 'Movement & price alerts', 'Review price snapshots and manage local threshold alerts.']
];
const toolMeta = Object.fromEntries(TOOLS.map(row => [row[1], row]));
const arrays = ['quotes', 'history', 'dfs', 'contracts', 'contractHistory', 'traders', 'trades', 'bets', 'results', 'alerts', 'notifications', 'slips'];
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE));
    if (parsed?.version === 1) return normalize(parsed);
  } catch { /* Browser storage can be disabled. */ }
  return normalize(exampleWorkspace());
}
function normalize(data) {
  for (const key of arrays) if (!Array.isArray(data[key])) data[key] = [];
  for (const key of ['dfs','contracts','bets','results']) for (const item of data[key]) if (item.source === 'example' && !item.sport) item.sport = 'NFL';
  const quoteIds = new Set(data.quotes.map(x => x.id)), contractIds = new Set(data.contracts.map(x => x.id));
  data.history = data.history.filter(x => quoteIds.has(x.quoteId));
  data.contractHistory = data.contractHistory.filter(x => contractIds.has(x.contractId));
  if (!data.paytables || typeof data.paytables !== 'object' || Array.isArray(data.paytables)) data.paytables = {};
  return data;
}
let state = load();
let active = toolMeta[location.hash.slice(1)] ? location.hash.slice(1) : 'odds';
let search = '';
const initialSport = new URLSearchParams(location.search).get('sport')?.toUpperCase();
let sport = ['NFL','MLB','NBA','WNBA','NHL','SOCCER'].includes(initialSport) ? initialSport === 'SOCCER' ? 'Soccer' : initialSport : 'NFL';
let parlayIds = [], fantasyIds = [], fantasyApp = '', stake = 100, fantasyStake = 10;
let promoInput = { stake: 100, promoOdds: 150, hedgeOdds: -130, kind: 'bonus', boost: 0 };
let trendA = '', trendB = '', traderName = '';
let editing = null;
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const origin = x => x.source === 'example' ? '<span class="ev-status example">Example</span>' : '<span class="ev-status">Manual</span>';
const age = ts => { const n = Date.parse(ts); if (!Number.isFinite(n)) return 'Unknown time'; const s = Math.max(0, Math.floor((Date.now() - n) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const qName = q => `${q.event} · ${q.market}${q.line !== '' && q.line != null ? ' ' + q.line : ''} · ${q.side}`;
const qStatus = q => q.live ? `<span class="ev-status${fresh(q) ? '' : ' stale'}">${fresh(q) ? 'Live entry' : 'Stale live'} · ${age(q.ts)}</span>` : `<span class="ev-caption">Pregame · ${age(q.ts)}</span>`;
const filterText = value => String(value ?? '').toLowerCase().includes(search);
const visible = (item, fields) => (!sport || !item.sport || item.sport === sport) && (!search || fields.some(key => filterText(item[key])));
const quotes = () => state.quotes.filter(q => visible(q, ['event', 'market', 'book', 'side', 'sport']));
const dfs = () => state.dfs.filter(q => visible(q, ['player', 'market', 'app', 'side']));
const fmtLine = line => line === '' || line == null ? '—' : esc(line);
const oddsCell = q => `<strong>${oddsLabel(q.odds)}</strong><small>${esc(q.book)}</small>`;
const button = (label, attributes = '') => `<button type="button" ${attributes}>${label}</button>`;
const empty = (title, body) => `<div class="ev-empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;
const table = (headings, rows) => rows.length ? `<div class="ev-table-wrap"><table class="ev-table"><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
const metric = (label, value, cls = '') => `<div class="ev-metric ${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); $('#ev-notice').textContent = state.example ? 'Example market data. Add or import your own prices; no live feed is connected.' : 'Manual workspace saved in this browser. No market feed is connected.'; }
  catch { $('#ev-notice').textContent = 'Browser storage is unavailable. Export your work before leaving this page.'; }
}
function snapshotQuote(q) { state.history.push({ id: uid(), quoteId: q.id, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: q.source }); }
function evaluateAlerts() {
  for (const rule of state.alerts) {
    if (rule.enabled === false) continue;
    const matched = alertMatches(rule, state);
    const seen = new Set(rule.seen || []);
    for (const match of matched) if (!seen.has(match.id)) {
      state.notifications.unshift({ id: uid(), ruleId: rule.id, message: `${rule.kind === 'fantasy-new' ? 'New fantasy prop' : rule.kind === 'ev' ? 'EV threshold' : rule.kind === 'movement' ? 'Line movement' : 'Price threshold'}: ${match.label}`, ts: now(), read: false });
      seen.add(match.id);
    }
    rule.seen = [...seen];
  }
  state.notifications = state.notifications.slice(0, 300);
}
function commit() { evaluateAlerts(); persist(); render(); }
function renderNav() {
  let category = '';
  $('#ev-tool-nav').innerHTML = TOOLS.map(([group, key, label]) => {
    const heading = group !== category ? `<div class="ev-nav-heading">${group}</div>` : '';
    category = group;
    return heading + `<button type="button" data-tool="${key}" ${key === active ? 'aria-current="page"' : ''}>${esc(label)}</button>`;
  }).join('');
  $('#ev-tool-select').innerHTML = TOOLS.map(([group, key, label]) => `<option value="${key}">${group} / ${label}</option>`).join('');
  $('#ev-tool-select').value = active;
}
function setTool(key) { if (!toolMeta[key]) return; active = key; history.replaceState(null, '', location.pathname + location.search + '#' + key); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function action(label, type, extra = '') { return button(label, `data-add="${type}" ${extra}`); }
function render() {
  renderNav();
  $('#ev-sport').value = sport;
  $('#ev-search').value = search;
  $('#ev-record-count').textContent = `${state.quotes.length} prices · ${state.dfs.length} DFS props · ${state.contracts.length} contracts`;
  $('#ev-title').textContent = toolMeta[active][2];
  $('#ev-description').textContent = toolMeta[active][3];
  const viewActions = {
    odds: action('Add price', 'quote') + (state.example ? button('Remove examples', 'data-remove-examples') : button('Load examples', 'data-load-examples')), 'ev-pre': action('Add price', 'quote'), 'ev-live': action('Add live price', 'quote', 'data-live="true"') + (state.example ? button('Replay live examples', 'data-replay-live') : ''),
    'arb-pre': action('Add price', 'quote'), 'arb-live': action('Add live price', 'quote', 'data-live="true"') + (state.example ? button('Replay live examples', 'data-replay-live') : ''), middles: action('Add price', 'quote') + (state.example ? button('Replay live examples', 'data-replay-live') : ''), holds: action('Add price', 'quote'),
    sharp: action('Add exchange price', 'quote', 'data-exchange="true"') + (state.example ? button('Replay live examples', 'data-replay-live') : ''), fantasy: action('Add DFS prop', 'dfs'), optimizer: action('Add DFS prop', 'dfs'), slip: action('Add DFS prop', 'dfs'),
    'fantasy-alerts': action('New alert', 'alert', 'data-kind="fantasy-new"'), prediction: action('Add contract', 'contract'), tracker: action('Add bet', 'bet'), trends: action('Add result', 'result'), 'line-alerts': action('New alert', 'alert')
  };
  $('#ev-view-actions').innerHTML = viewActions[active] || '';
  const views = { odds: renderOdds, 'ev-pre': () => renderEv(false), 'ev-live': () => renderEv(true), 'arb-pre': () => renderArb(false), 'arb-live': () => renderArb(true), middles: renderMiddles, holds: renderHolds, promo: renderPromo, parlay: renderParlay, sharp: renderSharp, fantasy: renderFantasy, optimizer: renderOptimizer, slip: renderSlip, 'fantasy-alerts': renderFantasyAlerts, prediction: renderPrediction, tracker: renderTracker, trends: renderTrends, 'line-alerts': renderLineAlerts };
  $('#ev-view').innerHTML = views[active]();
}

function renderOdds() {
  const all = quotes(), sets = groups(all), books = [...new Set(all.map(q => q.book))].sort();
  const rows = sets.flatMap(group => {
    const sides = [...new Set(group.map(q => q.side))];
    return sides.map(side => {
      const options = group.filter(q => q.side === side).sort((a, b) => decimal(b.odds) - decimal(a.odds));
      const best = options.find(fresh) || options[0];
      const other = options.map(q => fairProbability(q, group)).filter(Number.isFinite);
      const consensus = other.length ? other.reduce((a, b) => a + b, 0) / other.length : NaN;
      const snapshots = state.history.filter(h => h.quoteId === best.id), prior = snapshots.at(-2);
      return `<tr><td><strong>${esc(best.event)}</strong><small>${esc(best.market)} · ${esc(best.type)} · line ${fmtLine(best.line)}</small></td><td>${esc(side)}<small>${best.live ? 'Live' : 'Pregame'}</small></td>${books.map(book => {
        const q = options.find(x => x.book === book);
        return `<td data-num>${q ? `<button data-edit="quote" data-id="${esc(q.id)}">${oddsLabel(q.odds)}</button><small>${q.live && !fresh(q) ? 'Stale' : age(q.ts)}</small>` : '—'}</td>`;
      }).join('')}<td data-num>${percent(consensus)}<small>${Number.isFinite(consensus) ? oddsLabel(probabilityToAmerican(consensus)) : ''}</small></td><td data-num>${oddsCell(best)}<small>${qStatus(best)}</small></td><td>${prior ? `${oddsLabel(prior.odds)} → ${oddsLabel(best.odds)}` : '—'}</td></tr>`;
    });
  });
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Markets', sets.length)}${metric('Books / exchanges', books.length)}${metric('Live prices', all.filter(q => q.live).length)}${metric('Price snapshots', state.history.length)}</div>${rows.length ? table(['Market', 'Side', ...books.map(esc), 'Consensus fair', 'Best price', 'Movement'], rows) : empty('No matching prices', 'Add a price or change the filters to compare markets.')}<div class="ev-card"><h3>Price ledger</h3><p>Click any price to edit it. Every save records a timestamped snapshot for line movement.</p>${button('View movement and alerts', 'data-tool="line-alerts"')}</div></div>`;
}

function renderEv(live) {
  const rows = evRows(quotes(), live);
  const positives = rows.filter(x => x.ev > 0);
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Priced selections', rows.length)}${metric('Positive EV', positives.length, 'positive')}${metric('Best estimate', rows.length ? signed(rows[0].ev) : '—', rows[0]?.ev > 0 ? 'positive' : '')}${metric('Freshness limit', live ? '90 sec' : 'Pregame')}</div>${live ? '<p class="ev-caption ev-warning">Live entries expire after 90 seconds. Update the price manually to recalculate; no feed is connected.</p>' : ''}${table(['Selection', 'Book price', 'Implied', 'Other books fair', 'EV / $100', 'Action'], rows.map(({quote:q,fair,ev}) => `<tr><td><strong>${esc(qName(q))}</strong><small>${esc(q.sport)} · ${qStatus(q)}</small></td><td>${oddsCell(q)}</td><td data-num>${percent(implied(q.odds))}</td><td data-num>${percent(fair)}</td><td data-num class="${ev > 0 ? 'ev-positive' : 'ev-negative'}">${signed(ev)}<small>${money(100 * ev)}</small></td><td class="ev-actions">${button('Edit', `data-edit="quote" data-id="${esc(q.id)}"`) }${live ? '' : button('Parlay', `data-parlay="${esc(q.id)}"`)}</td></tr>`)) || empty('No comparable markets', 'Enter both sides at two books. EV requires another book with a complete opposing pair.')}<p class="ev-caption">Fair probability averages no-vig pairs from other books at the exact same line. EV = fair probability × decimal payout − 1. It does not include limits, fees or correlated outcomes.</p></div>`;
}

function renderArb(live) {
  const bankroll = Number(stake);
  const opportunities = arbitrageRows(quotes(), live);
  const rows = opportunities.map(x => { const result = arbitrage(x.best, bankroll); return `<tr><td><strong>${esc(x.best[0].event)}</strong><small>${esc(x.best[0].market)} · line ${fmtLine(x.best[0].line)}</small></td>${x.best.map((q, i) => `<td>${esc(q.side)} ${oddsCell(q)}<small>Stake ${money(result.stakes[i])}</small></td>`).join('')}<td data-num class="ev-positive">${money(result.profit)}<small>${signed(result.margin)}</small></td></tr>`; });
  return `<div class="ev-stack"><div class="ev-calculator"><label>Bankroll for one pair<input id="ev-bankroll" type="number" min="1" step="0.01" value="${esc(stake)}"></label><div class="ev-result">Stakes split in proportion to each side’s implied probability. Profit assumes both prices accept the full stakes and the market has two exhaustive outcomes. Stakes shown are rounded to cents.</div></div>${live ? '<p class="ev-caption ev-warning">Only live entries younger than 90 seconds count. Confirm both prices and available limits before placing either side.</p>' : ''}${rows.length ? table(['Market', 'Side A', 'Side B', 'Equalized profit'], rows) : empty('No arbitrage in these entries', 'Add opposing prices at different books with an implied-probability sum below 100%.')}</div>`;
}

function renderMiddles() {
  const rows = [false, true].flatMap(mode => middleRows(quotes(), mode));
  return `<div class="ev-stack"><div class="ev-calculator"><label>Total outlay<input id="ev-bankroll" type="number" min="1" step="0.01" value="${esc(stake)}"></label><div class="ev-result">Stake split equalizes the one-win outcomes. The middle payoff assumes both bets win; exact settlement depends on integer and push rules.</div></div>${rows.length ? table(['Market / window', 'Side A', 'Side B', 'Outcomes'], rows.map(x => { const plan = arbitrage([x.over,x.under], Number(stake)); return `<tr><td><strong>${esc(x.over.event)}</strong><small>${esc(x.over.market)} · ${x.over.live ? 'Live' : 'Pregame'} · ${esc(x.window)}</small></td><td>${esc(x.over.side)} ${fmtLine(x.over.line)} ${oddsCell(x.over)}<small>Stake ${money(plan.stakes[0])}</small></td><td>${esc(x.under.side)} ${fmtLine(x.under.line)} ${oddsCell(x.under)}<small>Stake ${money(plan.stakes[1])}</small></td><td>One wins: <strong class="${plan.profit >= 0 ? 'ev-positive' : 'ev-negative'}">${money(plan.profit)}</strong><small>Both win: ${money(plan.stakes[0] * (decimal(x.over.odds) - 1) + plan.stakes[1] * (decimal(x.under.odds) - 1))}</small></td></tr>`; })) : empty('No middles', 'Add a lower Over and higher Under total, or opposing spread lines with a winning margin window.')}</div>`;
}

function renderHolds() {
  const rows = [false, true].flatMap(mode => holdRows(quotes(), mode));
  return `<div class="ev-stack">${rows.length ? table(['Market', 'Best side A', 'Best side B', 'Hold'], rows.map(x => `<tr><td><strong>${esc(x.best[0].event)}</strong><small>${esc(x.best[0].market)} · ${fmtLine(x.best[0].line)} · ${x.best[0].live ? 'Live' : 'Pregame'}</small></td>${x.best.map(q => `<td>${esc(q.side)} ${oddsCell(q)}</td>`).join('')}<td data-num class="${x.hold < 0 ? 'ev-positive' : ''}">${signed(x.hold)}</td></tr>`)) : empty('No two-sided markets', 'Enter both sides of a market to measure its hold.')}<p class="ev-caption">Hold = implied probability of best side A + implied probability of best side B − 100%. Negative hold is a potential arbitrage before execution constraints.</p></div>`;
}

function renderPromo() {
  const outcome = promoConversion(promoInput);
  const paired = groups(quotes()).flatMap(rows => rows.length >= 2 ? rows.filter(fresh).map(q => ({ q, opposite: rows.filter(x => x.side !== q.side && x.book !== q.book && fresh(x)).sort((a,b) => decimal(b.odds)-decimal(a.odds))[0] })).filter(x => x.opposite) : []).slice(0, 12);
  return `<div class="ev-stack"><div class="ev-calculator"><label>Promotion type<select data-promo="kind"><option value="bonus" ${promoInput.kind === 'bonus' ? 'selected' : ''}>Bonus bet (stake not returned)</option><option value="boost" ${promoInput.kind === 'boost' ? 'selected' : ''}>Odds boost (cash stake)</option></select></label><label>Promo value / cash stake<input data-promo="stake" type="number" min="0.01" step="0.01" value="${esc(promoInput.stake)}"></label><label>Profit boost %<input data-promo="boost" type="number" min="0" step="0.1" value="${esc(promoInput.boost)}"></label><label>Promotion odds (American)<input data-promo="promoOdds" type="number" step="1" value="${esc(promoInput.promoOdds)}"></label><label>Hedge odds (American)<input data-promo="hedgeOdds" type="number" step="1" value="${esc(promoInput.hedgeOdds)}"></label><div class="ev-result">${outcome ? `Hedge <strong>${money(outcome.hedge)}</strong> · Promo side wins: <strong>${money(outcome.ifPromoWins)}</strong> · Hedge side wins: <strong>${money(outcome.ifHedgeWins)}</strong>${promoInput.kind === 'bonus' ? ` · Bonus conversion: <strong>${percent(outcome.conversion)}</strong>` : ''}` : 'Enter a positive stake and valid American odds.'}</div></div><h3 class="ev-section-title">Use entered market prices</h3>${paired.length ? table(['Promotion side', 'Hedge side', 'Use'], paired.map(({q,opposite}) => `<tr><td>${esc(qName(q))}<small>${esc(q.book)} ${oddsLabel(q.odds)}</small></td><td>${esc(opposite.side)}<small>${esc(opposite.book)} ${oddsLabel(opposite.odds)}</small></td><td>${button('Load prices', `data-promo-pair="${esc(q.id)}" data-hedge="${esc(opposite.id)}"`)}</td></tr>`)) : empty('No paired prices', 'Enter both sides of a market to load a hedge.')}</div>`;
}

function renderParlay() {
  const selected = parlayIds.map(id => state.quotes.find(q => q.id === id)).filter(Boolean);
  const legs = selected.map(q => ({ ...q, probability: fairProbability(q, groups(state.quotes).find(g => g.some(x => x.id === q.id)) || []) }));
  const result = parlay(legs);
  const options = evRows(quotes(), false);
  return `<div class="ev-stack"><div class="ev-card"><h3>Selected legs</h3>${selected.length ? `<div class="ev-list">${legs.map(q => `<div class="ev-list-item"><div><strong>${esc(qName(q))}</strong><span> ${esc(q.book)} ${oddsLabel(q.odds)} · Fair ${percent(q.probability)} · Leg EV ${signed(expectedReturn(q.probability, q.odds))}</span></div>${button('Remove', `data-parlay-remove="${esc(q.id)}"`)}</div>`).join('')}</div>` : '<p>Choose legs below. Use one sportsbook and different events for an actionable parlay estimate.</p>'}<div class="ev-card-footer">${result && Number.isFinite(result.ev) && new Set(selected.map(q => q.book)).size === 1 ? `<span class="ev-chip">Combined decimal ${result.payout.toFixed(2)}</span><span class="ev-chip">Fair chance ${percent(result.probability)}</span><span class="ev-chip">EV ${signed(result.ev)}</span>` : '<span class="ev-warning">A total requires complete market pairs, one book and different events.</span>'}</div></div>${options.length ? table(['Available leg', 'Book', 'Fair chance', 'Leg EV', ''], options.map(({quote:q,fair,ev}) => `<tr><td>${esc(qName(q))}</td><td>${esc(q.book)} ${oddsLabel(q.odds)}</td><td data-num>${percent(fair)}</td><td data-num class="${ev > 0 ? 'ev-positive' : ''}">${signed(ev)}</td><td class="ev-actions">${button(parlayIds.includes(q.id) ? 'Remove' : 'Add leg', `data-parlay="${esc(q.id)}"`)}</td></tr>`)) : empty('No eligible legs', 'Enter pregame prices on both sides at two books.') }<p class="ev-caption">Multiplying probabilities assumes independent legs. Same-event combinations are excluded; book parlay rules and repricing can change the actual offer.</p></div>`;
}

function renderSharp() {
  const threshold = Number(localStorage.getItem('sportslab-ev-sharp-min') || 1000);
  const matches = sharpMatches(quotes(), threshold);
  return `<div class="ev-stack"><div class="ev-calculator"><label>Minimum exchange liquidity<input id="ev-sharp-min" type="number" min="0" step="1" value="${threshold}"></label><div class="ev-result">A large exchange offer is paired with the best opposite sportsbook price. A result appears when that price beats the opposite exchange offer. Matching fantasy props show their entered hit estimate.</div></div>${matches.length ? table(['Market', 'Exchange offer', 'Opposite exchange', 'Better sportsbook', 'Fantasy / history'], matches.map(x => { const snapshots = state.history.filter(h => h.quoteId === x.exchange.id); const fantasy = state.dfs.filter(d => d.event === x.exchange.event && String(d.line) === String(x.exchange.line) && `${d.player} ${d.market}`.toLowerCase() === x.exchange.market.toLowerCase() && d.side === x.exchange.side); return `<tr><td><strong>${esc(x.exchange.event)}</strong><small>${esc(x.exchange.market)} · ${fmtLine(x.exchange.line)}</small></td><td>${esc(x.exchange.side)} ${oddsCell(x.exchange)}<small>Available ${money(x.liquidity)}</small></td><td>${x.opposite ? oddsCell(x.opposite) : '—'}</td><td>${esc(x.sportsbook.side)} ${oddsCell(x.sportsbook)}<small>${Number.isFinite(x.improvement) ? `Payout +${percent(x.improvement)}` : 'No exchange benchmark'}</small></td><td>${fantasy.length ? fantasy.map(d => `${esc(d.app)} ${percent(d.probability)}`).join('<br>') : '—'}<small>${snapshots.length} snapshots · ${snapshots.slice(-3).map(h => oddsLabel(h.odds)).join(' → ')}</small></td></tr>`; })) : empty('No better opposite price', 'Enter an exchange offer with liquidity and a better opposite sportsbook price at the same line.') }<div class="ev-card"><h3>Pro history</h3><p>Every edit to an exchange or book price is kept as a timestamped local snapshot. Open Movement & price alerts for the full history.</p>${button('View line history', 'data-tool="line-alerts"')}</div></div>`;
}

function renderFantasy() {
  const rows = dfs().sort((a,b) => a.player.localeCompare(b.player) || a.market.localeCompare(b.market) || a.line-b.line);
  return `<div class="ev-stack">${rows.length ? table(['Player / prop', 'App', 'Pick', 'Est. hit rate', 'Entered', ''], rows.map(x => `<tr><td><strong>${esc(x.player)}</strong><small>${esc(x.market)} · ${fmtLine(x.line)}</small></td><td>${esc(x.app)}</td><td>${esc(x.side)}</td><td data-num>${percent(x.probability)}</td><td>${origin(x)}<small>${age(x.ts)}</small></td><td class="ev-actions">${button('Edit', `data-edit="dfs" data-id="${esc(x.id)}"`)}${button('Slip', `data-fantasy="${esc(x.id)}"`)}</td></tr>`)) : empty('No fantasy props', 'Add a DFS player prop, its app and estimated hit probability.')}<p class="ev-caption">Hit probabilities are manual estimates in this workspace until a calibrated data source is connected. App payout rules are editable in the slip builder.</p></div>`;
}

function renderOptimizer() {
  const rows = dfs();
  const combos = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].app !== rows[j].app || rows[i].player === rows[j].player) continue;
    const rules = state.paytables[rows[i].app]?.['2'];
    if (!Array.isArray(rules) || rules.length !== 3) continue;
    const result = fantasySlip([rows[i],rows[j]], rules);
    if (result) combos.push({ a: rows[i], b: rows[j], ...result });
  }
  combos.sort((a,b) => b.ev-a.ev);
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Eligible combinations', combos.length)}${metric('Best projected EV', combos.length ? signed(combos[0].ev) : '—', combos[0]?.ev > 0 ? 'positive' : '')}${metric('Apps', new Set(rows.map(x => x.app)).size)}${metric('Model', 'Independent')}</div>${combos.length ? table(['App', 'Pick 1', 'Pick 2', 'Full-hit chance', 'Projected EV', ''], combos.map(x => `<tr><td>${esc(x.a.app)}</td><td>${esc(x.a.player)} ${esc(x.a.side)} ${fmtLine(x.a.line)}<small>${percent(x.a.probability)}</small></td><td>${esc(x.b.player)} ${esc(x.b.side)} ${fmtLine(x.b.line)}<small>${percent(x.b.probability)}</small></td><td data-num>${percent(x.dist[2])}</td><td data-num class="${x.ev > 0 ? 'ev-positive' : 'ev-negative'}">${signed(x.ev)}</td><td>${button('Build slip', `data-optimize="${esc(x.a.id)},${esc(x.b.id)}"`)}</td></tr>`)) : empty('No eligible combinations', 'Add at least two picks from the same app and set its two-pick payout rule.') }<p class="ev-caption">Rankings use the saved exact-hit payout table and assume independent picks. They exclude platform limits and fees.</p></div>`;
}

function renderSlip() {
  const apps = [...new Set(dfs().map(x => x.app))];
  if (!fantasyApp || !apps.includes(fantasyApp)) fantasyApp = apps[0] || '';
  const options = dfs().filter(x => x.app === fantasyApp);
  fantasyIds = fantasyIds.filter(id => options.some(x => x.id === id));
  const selected = fantasyIds.map(id => options.find(x => x.id === id)).filter(Boolean);
  const rules = state.paytables[fantasyApp]?.[String(selected.length)] || [];
  const result = selected.length >= 2 && rules.length === selected.length + 1 ? fantasySlip(selected, rules, Number(fantasyStake)) : null;
  return `<div class="ev-stack"><div class="ev-calculator"><label>Fantasy app<select id="ev-fantasy-app">${apps.map(app => `<option value="${esc(app)}" ${app === fantasyApp ? 'selected' : ''}>${esc(app)}</option>`).join('')}</select></label><label>Entry amount<input id="ev-fantasy-stake" type="number" min="0.01" step="0.01" value="${esc(fantasyStake)}"></label><div class="ev-result">${result ? `Expected return <strong>${money(result.payout * fantasyStake)}</strong> · Expected profit <strong>${money(result.expectedProfit)}</strong> · EV <strong>${signed(result.ev)}</strong>` : selected.length < 2 ? 'Select at least two picks from one app to calculate a slip.' : 'Set and save this entry size’s payout rules to calculate a slip.'}</div></div><div class="ev-card"><h3>Selected picks (${selected.length})</h3><div class="ev-chip-row">${selected.map(x => `<span class="ev-chip">${esc(x.player)} ${esc(x.side)} ${fmtLine(x.line)} · ${percent(x.probability)} ${button('×', `data-fantasy="${esc(x.id)}" aria-label="Remove ${esc(x.player)}"`)}</span>`).join('') || '<p>Select picks below.</p>'}</div></div>${selected.length >= 2 ? `<div class="ev-card"><h3>Payout rules · exact hits</h3><p>Enter the total return multiplier for each exact hit count, including returned stake. Zero means no payout.</p><div class="ev-fields">${Array.from({length:selected.length+1},(_,hits) => `<label>${hits} of ${selected.length} hits<input data-pay-hits="${hits}" type="number" min="0" step="0.01" value="${Number(rules[hits] || 0)}"></label>`).join('')}</div><div class="ev-card-footer">${button('Save payout rules', 'id="ev-save-paytable"')}</div>${result ? `<div class="ev-chip-row">${result.dist.map((p,i) => `<span class="ev-chip">${i} hits ${percent(p)} · ${Number(rules[i] || 0)}×</span>`).join('')}</div>` : ''}</div>` : ''}${options.length ? table(['Player', 'Prop', 'Estimate', ''], options.map(x => `<tr><td>${esc(x.player)}</td><td>${esc(x.side)} ${fmtLine(x.line)} ${esc(x.market)}</td><td data-num>${percent(x.probability)}</td><td>${button(fantasyIds.includes(x.id) ? 'Remove' : 'Add pick', `data-fantasy="${esc(x.id)}"`)}</td></tr>`)) : empty('No props at this app', 'Add DFS props to build a slip.')}<p class="ev-caption">The payout distribution uses independent Bernoulli picks. Pushes, ties, correlated picks and app-specific settlement exceptions require manual adjustment to the payout rules.</p></div>`;
}

function renderFantasyAlerts() {
  const rules = state.alerts.filter(x => x.kind === 'fantasy-new');
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack"><div class="ev-card"><h3>New prop watches</h3><p>Newly entered DFS props trigger a local alert when their market and minimum hit rate match.</p>${rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${esc(r.market || 'Any market')}</strong><span> Minimum hit rate ${r.threshold || 0}% · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : '<p>No DFS alert rules yet.</p>'}</div><h3 class="ev-section-title">Alert activity</h3>${renderNotifications(notes)}</div>`;
}

function renderNotifications(notes) {
  return notes.length ? `<div class="ev-list">${notes.map(x => `<div class="ev-list-item"><div><strong>${esc(x.message)}</strong><span> ${new Date(x.ts).toLocaleString()} ${x.read ? '· Read' : '· New'}</span></div>${button('Dismiss', `data-notification-dismiss="${esc(x.id)}"`)}</div>`).join('')}</div>` : empty('No alerts fired', 'Matching new entries will appear here after you add or update data.');
}

function renderPrediction() {
  const contracts = state.contracts.filter(x => visible(x, ['event', 'platform']));
  const contractIds = new Set(contracts.map(x => x.id));
  const names = [...new Set([...state.traders.filter(x => contractIds.has(x.contractId)).map(x => x.name), ...state.trades.filter(x => contractIds.has(x.contractId)).map(x => x.trader)])];
  if (!traderName || !names.includes(traderName)) traderName = names[0] || '';
  const positions = state.traders.filter(x => x.name === traderName && contractIds.has(x.contractId));
  const trades = state.trades.filter(x => x.trader === traderName && contractIds.has(x.contractId));
  return `<div class="ev-stack"><div class="ev-card"><h3>Prediction contracts</h3><p>Bid and ask are cents per $1 of settlement. Each contract edit records an order book snapshot.</p><div class="ev-card-footer">${action('Add contract', 'contract')}${action('Add position', 'trader')}${action('Add trade', 'trade')}</div></div>${contracts.length ? table(['Platform / contract', 'Bid', 'Ask', 'Spread', 'Depth', 'History', ''], contracts.map(c => { const snapshots = state.contractHistory.filter(h => h.contractId === c.id); return `<tr><td><strong>${esc(c.event)}</strong><small>${esc(c.platform)} · ${origin(c)}</small></td><td data-num>${Number(c.bid).toFixed(0)}¢</td><td data-num>${Number(c.ask).toFixed(0)}¢</td><td data-num>${(Number(c.ask)-Number(c.bid)).toFixed(0)}¢</td><td data-num>${Number(c.volume).toLocaleString()} contracts</td><td>${snapshots.length} snapshots<small>${age(c.ts)}</small></td><td class="ev-actions">${button('Edit', `data-edit="contract" data-id="${esc(c.id)}"`)}</td></tr>`; })) : empty('No prediction contracts', 'Add bids, asks and available depth for a market.')}<h3 class="ev-section-title">Order book history</h3>${state.contractHistory.length ? table(['Observed', 'Contract', 'Bid', 'Ask', 'Depth'], state.contractHistory.slice().reverse().slice(0,100).map(h => `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(state.contracts.find(c => c.id === h.contractId)?.event || 'Contract missing')}</td><td data-num>${Number(h.bid)}¢</td><td data-num>${Number(h.ask)}¢</td><td data-num>${Number(h.volume).toLocaleString()}</td></tr>`)) : empty('No order book snapshots', 'Editing a contract will record its bid, ask and depth.')}<div class="ev-calculator"><label>Trader<select id="ev-trader-filter">${names.map(name => `<option value="${esc(name)}" ${name === traderName ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><div class="ev-result">Position mark uses the current executable bid for a Yes holding and 100 − ask for a No holding. It excludes fees and partial fills.</div></div><h3 class="ev-section-title">Positions</h3>${positions.length ? table(['Contract', 'Side', 'Quantity', 'Entry', 'Mark / unrealized P&L', ''], positions.map(p => { const c = state.contracts.find(x => x.id === p.contractId); const mark = c ? p.side === 'No' ? 100 - Number(c.ask) : Number(c.bid) : NaN; const profit = Number.isFinite(mark) ? (mark - Number(p.entry)) * Number(p.quantity) / 100 : NaN; return `<tr><td>${esc(c?.event || 'Contract missing')}</td><td>${esc(p.side)}</td><td data-num>${Number(p.quantity)}</td><td data-num>${Number(p.entry)}¢</td><td data-num class="${profit >= 0 ? 'ev-positive' : 'ev-negative'}">${Number.isFinite(mark) ? mark + '¢' : '—'}<small>${money(profit)}</small></td><td class="ev-actions">${button('Edit', `data-edit="trader" data-id="${esc(p.id)}"`)}</td></tr>`; })) : empty('No positions for this trader', 'Add a position to track mark-to-market value.')}<h3 class="ev-section-title">Trade history</h3>${trades.length ? table(['Time', 'Contract', 'Side', 'Quantity', 'Price', ''], trades.map(t => `<tr><td>${new Date(t.ts).toLocaleString()}</td><td>${esc(state.contracts.find(x => x.id === t.contractId)?.event || 'Contract missing')}</td><td>${esc(t.side)}</td><td data-num>${Number(t.quantity)}</td><td data-num>${Number(t.price)}¢</td><td class="ev-actions">${button('Edit', `data-edit="trade" data-id="${esc(t.id)}"`)}</td></tr>`)) : empty('No trades for this trader', 'Record buys and sells to keep a trade history.')}</div>`;
}

function renderTracker() {
  const rows = state.bets.filter(x => visible(x, ['selection', 'book']));
  const graded = rows.map(gradedBet).filter(Number.isFinite);
  const net = graded.reduce((a,b) => a+b,0);
  const risked = rows.filter(x => Number.isFinite(gradedBet(x))).reduce((a,x) => a+Number(x.stake),0);
  const clvs = rows.map(x => closingLineValue(x.odds,x.closeOdds)).filter(Number.isFinite);
  return `<div class="ev-stack"><div class="ev-metrics">${metric('Tracked bets', rows.length)}${metric('Settled P&L', money(net), net > 0 ? 'positive' : '')}${metric('ROI', risked ? signed(net/risked) : '—')}${metric('Avg. CLV', clvs.length ? signed(clvs.reduce((a,b)=>a+b,0)/clvs.length) : '—')}</div>${rows.length ? table(['Date / selection', 'Book', 'Stake', 'Booked → close', 'CLV', 'Result / P&L', ''], rows.map(b => { const clv = closingLineValue(b.odds,b.closeOdds), profit = gradedBet(b); return `<tr><td><strong>${esc(b.selection)}</strong><small>${esc(b.date)}</small></td><td>${esc(b.book)}</td><td data-num>${money(Number(b.stake))}</td><td>${oddsLabel(b.odds)} → ${b.closeOdds ? oddsLabel(b.closeOdds) : '—'}</td><td data-num class="${clv > 0 ? 'ev-positive' : ''}">${signed(clv)}</td><td>${esc(b.result)}<small>${money(profit)}</small></td><td class="ev-actions">${button('Edit', `data-edit="bet" data-id="${esc(b.id)}"`)}</td></tr>`; })) : empty('No bets tracked here', 'Add a bet and enter its closing price and final result to measure CLV and P&L.')}<p class="ev-caption">CLV = booked decimal odds ÷ closing decimal odds − 1. Compare only the same side, line and settlement rules. Open bets do not count toward ROI.</p></div>`;
}

function renderTrends() {
  const rows = state.results.filter(x => visible(x, ['player', 'market', 'game']));
  const profiles = [...new Set(rows.map(x => `${x.player}|${x.market}|${x.line}`))];
  const options = [...new Set(rows.map(x => x.player + '|' + x.market))];
  if (!options.includes(trendA)) trendA = options[0] || '';
  if (!options.includes(trendB)) trendB = options[1] || '';
  const left = rows.filter(x => x.player + '|' + x.market === trendA);
  const right = rows.filter(x => x.player + '|' + x.market === trendB);
  const paired = left.flatMap(a => right.filter(b => b.game === a.game).map(b => [Number(a.result),Number(b.result)]));
  const correlation = pearson(paired);
  return `<div class="ev-stack">${profiles.length ? table(['Player / prop', 'Last 5', 'Last 10', 'All recorded', 'Results'], profiles.map(key => { const [player,market,line] = key.split('|'); const games = rows.filter(x => `${x.player}|${x.market}|${x.line}` === key).sort((a,b) => b.date.localeCompare(a.date)); const rate = n => percent(games.slice(0,n).filter(x => Number(x.result) > Number(x.line)).length / Math.min(n,games.length)); return `<tr><td><strong>${esc(player)}</strong><small>${esc(market)} · Over ${esc(line)}</small></td><td data-num>${rate(5)}<small>${Math.min(5,games.length)} games</small></td><td data-num>${rate(10)}<small>${Math.min(10,games.length)} games</small></td><td data-num>${rate(games.length)}<small>${games.length} games</small></td><td><div class="ev-mini-bars" aria-label="Recent results">${games.slice(0,10).reverse().map(g => `<i title="${esc(g.game)}: ${esc(g.result)}" style="height:${Math.max(5, Math.min(100, Number(g.result)/Number(g.line)*65))}%"></i>`).join('')}</div></td></tr>`; })) : empty('No player results', 'Add game results to calculate recent hit rates and correlations.')}<div class="ev-card"><h3>Paired-game correlation</h3><div class="ev-fields"><label>First prop<select id="ev-trend-a">${options.map(x => `<option value="${esc(x)}" ${x === trendA ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><label>Second prop<select id="ev-trend-b">${options.map(x => `<option value="${esc(x)}" ${x === trendB ? 'selected' : ''}>${esc(x.replace('|',' · '))}</option>`).join('')}</select></label><div class="ev-result">${Number.isFinite(correlation) ? `Pearson r <strong>${correlation.toFixed(2)}</strong> across ${paired.length} matching game IDs` : `Need at least three matching game IDs with variation in both results. Currently ${paired.length}.`}</div></div></div><p class="ev-caption">Recent hit rates describe entered historical games. They do not estimate a future hit probability; correlation is descriptive and needs aligned game IDs.</p></div>`;
}

function renderLineAlerts() {
  const all = state.history.filter(h => !search || ['event','market','book','side'].some(k => filterText(h[k]))).sort((a,b) => b.ts.localeCompare(a.ts));
  const rules = state.alerts.filter(x => x.kind !== 'fantasy-new');
  const notes = state.notifications.filter(x => rules.some(r => r.id === x.ruleId));
  return `<div class="ev-stack"><div class="ev-card"><h3>Price and EV watches</h3><p>Alerts fire in this browser when a newly saved or imported record meets a threshold. They do not poll sportsbooks.</p><div class="ev-card-footer">${action('New price, EV or movement alert', 'alert')}</div>${rules.length ? `<div class="ev-list">${rules.map(r => `<div class="ev-list-item"><div><strong>${r.kind === 'ev' ? 'EV at least ' + r.threshold + '%' : r.kind === 'movement' ? 'Line change at least ' + r.threshold : 'American price at least ' + oddsLabel(r.threshold)}</strong><span> ${esc(r.sport || 'All sports')} · ${esc(r.event || 'Any event')} · ${esc(r.market || 'Any market')} · ${r.liveOnly ? 'Live only' : 'All'} · ${r.enabled === false ? 'Paused' : 'Active'}</span></div><div>${button('Edit', `data-edit="alert" data-id="${esc(r.id)}"`)} ${button(r.enabled === false ? 'Resume' : 'Pause', `data-alert-toggle="${esc(r.id)}"`)}</div></div>`).join('')}</div>` : '<p>No price watches saved.</p>'}</div><h3 class="ev-section-title">Alert activity</h3>${renderNotifications(notes)}<h3 class="ev-section-title">Recorded line movement</h3>${all.length ? table(['Time', 'Market', 'Book', 'Side', 'Line', 'Price', 'Change'], all.slice(0,200).map(h => { const sequence = state.history.filter(x => x.quoteId === h.quoteId), index = sequence.findIndex(x => x.id === h.id), prior = sequence[index-1]; return `<tr><td>${new Date(h.ts).toLocaleString()}</td><td>${esc(h.event)}<small>${esc(h.market)}</small></td><td>${esc(h.book)}</td><td>${esc(h.side)}</td><td data-num>${fmtLine(h.line)}</td><td data-num>${oddsLabel(h.odds)}</td><td>${prior ? `${oddsLabel(prior.odds)} → ${oddsLabel(h.odds)}${String(prior.line) !== String(h.line) ? ` · line ${fmtLine(prior.line)} → ${fmtLine(h.line)}` : ''}` : 'First entry'}</td></tr>`; })) : empty('No movement recorded', 'Saving a new or edited price creates a timestamped snapshot.')}</div>`;
}

const FIELDS = {
  quote: [
    ['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']], ['event','Event / game','text',true], ['market','Market name','text',true],
    ['type','Market type','select',true,[['game','Two-way game line'],['three-way','Three-way game line'],['spread','Spread'],['total','Total'],['prop','Player prop'],['alternate','Alternate line'],['future','Future']]], ['outcomes','Exhaustive outcomes (multiway)','number',false], ['line','Line','text',false], ['side','Side / selection','text',true],
    ['book','Sportsbook / exchange','text',true], ['odds','American odds','number',true], ['live','In game quote','checkbox',false],
    ['exchange','Exchange offer','checkbox',false], ['liquidity','Available liquidity ($)','number',false], ['ts','Observed at','datetime-local',true]
  ],
  dfs: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['event','Event / game','text',false],['player','Player','text',true],['market','Prop market','text',true],['line','Line','number',true],['side','Pick','select',true,['Over','Under']],['app','Fantasy app','text',true],['probability','Estimated hit probability (0–1)','number',true]],
  contract: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['platform','Platform','text',true],['event','Contract / event','text',true],['bid','Best Yes bid (¢)','number',true],['ask','Best Yes ask (¢)','number',true],['last','Last price (¢)','number',false],['volume','Available depth (contracts)','number',true]],
  trader: [['name','Trader name','text',true],['platform','Platform','text',true],['contractId','Contract','contract',true],['side','Position side','select',true,['Yes','No']],['quantity','Contracts held','number',true],['entry','Entry price (¢)','number',true]],
  trade: [['trader','Trader name','text',true],['contractId','Contract','contract',true],['side','Trade side','select',true,['Buy Yes','Sell Yes','Buy No','Sell No']],['quantity','Quantity','number',true],['price','Price (¢)','number',true],['ts','Executed at','datetime-local',true]],
  bet: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['date','Date placed','date',true],['selection','Selection / exact line','text',true],['book','Sportsbook','text',true],['stake','Stake ($)','number',true],['odds','Booked American odds','number',true],['closeOdds','Closing American odds','number',false],['result','Result','select',true,['open','win','loss','push','void']]],
  result: [['sport','Sport','select',true,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['date','Game date','date',true],['game','Game ID / matchup','text',true],['player','Player','text',true],['market','Prop market','text',true],['line','Prop line','number',true],['result','Recorded result','number',true]],
  alert: [['sport','Sport','select',false,['NFL','MLB','NBA','WNBA','NHL','Soccer']],['kind','Alert type','select',true,[['price','Price at or better'],['ev','Estimated EV at or above'],['movement','Line move at least'],['fantasy-new','New fantasy prop']]],['event','Event contains','text',false],['market','Market contains','text',false],['threshold','Threshold (odds, line points or %)','number',true],['liveOnly','Live quotes only','checkbox',false]]
};
const formTitles = { quote:'market price', dfs:'fantasy prop', contract:'prediction contract', trader:'trader position', trade:'trade', bet:'tracked bet', result:'player result', alert:'alert rule' };
const collection = { quote:'quotes', dfs:'dfs', contract:'contracts', trader:'traders', trade:'trades', bet:'bets', result:'results', alert:'alerts' };
function dateInput(value) { const d = value ? new Date(value) : new Date(); return Number.isFinite(d.getTime()) ? new Date(d.getTime()-d.getTimezoneOffset()*60_000).toISOString().slice(0,16) : ''; }
function fieldMarkup(field, item) {
  const [name,label,type,required,options] = field;
  const value = item[name] ?? '';
  if (type === 'checkbox') return `<label><input name="${name}" type="checkbox" ${value ? 'checked' : ''}>${esc(label)}</label>`;
  if (type === 'select' || type === 'contract') {
    const values = type === 'contract' ? state.contracts.map(c => [c.id, `${c.platform}: ${c.event}`]) : options.map(x => Array.isArray(x) ? x : [x,x]);
    return `<label>${esc(label)}<select name="${name}" ${required ? 'required' : ''}><option value="">${name === 'sport' && !required ? 'All sports' : 'Choose…'}</option>${values.map(([key,text]) => `<option value="${esc(key)}" ${String(value) === String(key) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  }
  const adjusted = type === 'datetime-local' ? dateInput(value) : value;
  const attributes = type === 'number' ? `step="${['odds','closeOdds','threshold'].includes(name) ? '1' : 'any'}"` : '';
  return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(adjusted)}" ${required ? 'required' : ''} ${attributes} ${type === 'text' ? 'maxlength="180"' : ''}></label>`;
}
function openForm(type, id = null, presets = {}) {
  const old = id ? state[collection[type]].find(x => x.id === id) : null;
  const item = { sport: sport || 'NFL', type:'game', side:'Over', live:false, exchange:false, liquidity:0, probability:.5, date:new Date().toISOString().slice(0,10), result:'open', kind:'price', threshold:0, enabled:true, ...old, ts:now(), ...presets };
  editing = { type, id };
  $('#ev-dialog-title').textContent = `${old ? 'Edit' : 'Add'} ${formTitles[type]}`;
  $('#ev-form-fields').innerHTML = `<div class="ev-fields">${FIELDS[type].map(field => fieldMarkup(field,item)).join('')}</div>`;
  $('#ev-form-error').hidden = true;
  $('#ev-delete').hidden = !old;
  $('#ev-dialog').showModal();
  $('#ev-form-fields').querySelector('input:not([type=checkbox]),select')?.focus();
}
function failForm(message) { const node = $('#ev-form-error'); node.textContent = message; node.hidden = false; node.focus(); }
function parseForm() {
  const form = $('#ev-form');
  if (!form.checkValidity()) { form.reportValidity(); return null; }
  const item = {};
  for (const [name,,type] of FIELDS[editing.type]) {
    const field = form.elements[name];
    item[name] = type === 'checkbox' ? field.checked : type === 'number' ? (field.value === '' ? '' : Number(field.value)) : type === 'datetime-local' ? new Date(field.value).toISOString() : field.value.trim();
  }
  if (editing.type === 'quote' && !Number.isFinite(decimal(item.odds))) return failForm('Enter valid American odds: +100 or higher, or −100 or lower.'), null;
  if (editing.type === 'quote' && item.outcomes !== '' && !(Number.isInteger(item.outcomes) && item.outcomes >= 2 && item.outcomes <= 64)) return failForm('Exhaustive outcome count must be a whole number from 2 to 64.'), null;
  if (editing.type === 'quote' && item.exchange && !(Number(item.liquidity) >= 0)) return failForm('Exchange liquidity must be zero or higher.'), null;
  if (editing.type === 'dfs' && !(item.probability >= 0 && item.probability <= 1)) return failForm('Hit probability must be between 0 and 1.'), null;
  if (editing.type === 'contract' && !(item.bid >= 0 && item.ask <= 100 && item.bid <= item.ask && item.volume >= 0)) return failForm('Bid and ask must be between 0 and 100 cents, with bid no higher than ask.'), null;
  if (['trader','trade'].includes(editing.type) && (!(item.quantity > 0) || !((item.entry ?? item.price) >= 0 && (item.entry ?? item.price) <= 100))) return failForm('Enter a positive quantity and a price between 0 and 100 cents.'), null;
  if (editing.type === 'bet' && (!(item.stake > 0) || !Number.isFinite(decimal(item.odds)) || (item.closeOdds !== '' && !Number.isFinite(decimal(item.closeOdds))))) return failForm('Enter a positive stake and valid American odds.'), null;
  if (editing.type === 'alert' && ((item.kind === 'price' && !Number.isFinite(decimal(item.threshold))) || (item.kind === 'movement' && !(item.threshold > 0)) || (['ev','fantasy-new'].includes(item.kind) && !(item.threshold >= 0 && item.threshold <= 100)))) return failForm('Enter valid American odds, a positive line change, or a percentage from 0 to 100.'), null;
  return item;
}
function saveForm(event) {
  event.preventDefault();
  if (!editing) return;
  const item = parseForm();
  if (!item) return;
  const {type,id} = editing, key = collection[type], previous = id ? state[key].find(x => x.id === id) : null;
  const record = { ...previous, ...item, id: id || uid(), source:'manual' };
  if (type === 'dfs' || type === 'contract') record.ts = now();
  if (type === 'alert') {
    record.enabled = previous?.enabled ?? true;
    record.seen = previous?.seen || alertMatches(record, state).map(x => x.id);
  }
  if (id) state[key] = state[key].map(x => x.id === id ? record : x);
  else state[key].push(record);
  if (type === 'quote') snapshotQuote(record);
  if (type === 'contract') state.contractHistory.push({ id:uid(), contractId:record.id, bid:record.bid, ask:record.ask, volume:record.volume, ts:record.ts });
  $('#ev-dialog').close(); editing = null; commit();
}
function deleteRecord() {
  if (!editing?.id || !confirm(`Delete this ${formTitles[editing.type]}?`)) return;
  const {type,id} = editing;
  state[collection[type]] = state[collection[type]].filter(x => x.id !== id);
  if (type === 'quote') state.history = state.history.filter(x => x.quoteId !== id);
  if (type === 'contract') state.contractHistory = state.contractHistory.filter(x => x.contractId !== id);
  $('#ev-dialog').close(); editing = null; commit();
}

$('#ev-tool-nav').addEventListener('click', event => { const key = event.target.closest('[data-tool]')?.dataset.tool; if (key) setTool(key); });
$('#ev-tool-select').addEventListener('change', event => setTool(event.target.value));
$('#ev-sport').addEventListener('change', event => { sport = event.target.value; render(); });
$('#ev-search').addEventListener('input', event => { search = event.target.value.toLowerCase().trim(); render(); });
$('#ev-add-quote').addEventListener('click', () => openForm('quote'));
$('#ev-view-actions').addEventListener('click', event => { const target = event.target.closest('[data-add]'); if (target) openForm(target.dataset.add, null, { live:target.dataset.live === 'true', exchange:target.dataset.exchange === 'true', kind:target.dataset.kind || 'price' }); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-remove-examples]')) return; for (const key of arrays) state[key] = state[key].filter(x => x.source !== 'example'); state.example = false; parlayIds = []; fantasyIds = []; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-load-examples]')) return; const demo = exampleWorkspace(); for (const key of arrays) state[key].push(...demo[key]); state.paytables = { ...demo.paytables, ...state.paytables }; state.example = true; commit(); });
$('#ev-view-actions').addEventListener('click', event => { if (!event.target.closest('[data-replay-live]')) return; for (const quote of state.quotes.filter(q => q.live && q.source === 'example')) { quote.ts = now(); snapshotQuote(quote); } commit(); });
$('#ev-view').addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.tool) return setTool(target.dataset.tool);
  if (target.dataset.add) return openForm(target.dataset.add, null, { kind:target.dataset.kind || 'price' });
  if (target.dataset.edit) return openForm(target.dataset.edit, target.dataset.id);
  if (target.dataset.parlay || target.dataset.parlayRemove) { const id = target.dataset.parlay || target.dataset.parlayRemove; parlayIds = parlayIds.includes(id) ? parlayIds.filter(x => x !== id) : [...parlayIds,id]; return setTool('parlay'); }
  if (target.dataset.fantasy) { const id = target.dataset.fantasy; const item = state.dfs.find(x => x.id === id); if (item && item.app !== fantasyApp) { fantasyApp = item.app; fantasyIds = []; } fantasyIds = fantasyIds.includes(id) ? fantasyIds.filter(x => x !== id) : [...fantasyIds,id]; return setTool('slip'); }
  if (target.dataset.optimize) { fantasyIds = target.dataset.optimize.split(','); fantasyApp = state.dfs.find(x => x.id === fantasyIds[0])?.app || ''; return setTool('slip'); }
  if (target.dataset.promoPair) { const a = state.quotes.find(x => x.id === target.dataset.promoPair), b = state.quotes.find(x => x.id === target.dataset.hedge); if (a && b) { promoInput.promoOdds = a.odds; promoInput.hedgeOdds = b.odds; render(); } return; }
  if (target.dataset.alertToggle) { const rule = state.alerts.find(x => x.id === target.dataset.alertToggle); if (rule) { rule.enabled = rule.enabled === false; commit(); } return; }
  if (target.dataset.notificationDismiss) { state.notifications = state.notifications.filter(x => x.id !== target.dataset.notificationDismiss); return commit(); }
  if (target.id === 'ev-save-paytable') { const inputs = [...$('#ev-view').querySelectorAll('[data-pay-hits]')]; if (!state.paytables[fantasyApp]) state.paytables[fantasyApp] = {}; state.paytables[fantasyApp][String(fantasyIds.length)] = inputs.map(x => Math.max(0, Number(x.value) || 0)); return commit(); }
});
$('#ev-view').addEventListener('change', event => {
  const t = event.target;
  if (t.id === 'ev-bankroll') { stake = Math.max(.01,Number(t.value)||100); render(); }
  else if (t.id === 'ev-sharp-min') { localStorage.setItem('sportslab-ev-sharp-min', String(Math.max(0,Number(t.value)||0))); render(); }
  else if (t.dataset.promo) { promoInput[t.dataset.promo] = t.dataset.promo === 'kind' ? t.value : Number(t.value); render(); }
  else if (t.id === 'ev-fantasy-app') { fantasyApp = t.value; fantasyIds = []; render(); }
  else if (t.id === 'ev-fantasy-stake') { fantasyStake = Math.max(.01,Number(t.value)||10); render(); }
  else if (t.id === 'ev-trader-filter') { traderName = t.value; render(); }
  else if (t.id === 'ev-trend-a') { trendA = t.value; render(); }
  else if (t.id === 'ev-trend-b') { trendB = t.value; render(); }
});
$('#ev-form').addEventListener('submit', saveForm);
$('#ev-close').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-cancel').addEventListener('click', () => $('#ev-dialog').close());
$('#ev-delete').addEventListener('click', deleteRecord);
$('#ev-dialog').addEventListener('close', () => { editing = null; });

$('#ev-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `sportslab-ev-${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#ev-import').addEventListener('click', () => { $('#ev-file').value = ''; $('#ev-import-error').textContent = ''; $('#ev-import-dialog').showModal(); });
$('#ev-import-close').addEventListener('click', () => $('#ev-import-dialog').close());
$('#ev-import-cancel').addEventListener('click', () => $('#ev-import-dialog').close());
$('#ev-import-apply').addEventListener('click', async () => {
  const file = $('#ev-file').files[0];
  if (!file) return $('#ev-import-error').textContent = 'Choose a JSON file first.';
  if (file.size > 5_000_000) return $('#ev-import-error').textContent = 'The file must be under 5 MB.';
  try {
    const data = JSON.parse(await file.text());
    validateWorkspace(data);
    state = normalize(data); evaluateAlerts(); persist(); $('#ev-import-dialog').close(); render();
  } catch (error) { $('#ev-import-error').textContent = error.message; }
});
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (toolMeta[key]) { active = key; render(); } });
setInterval(() => { if (['ev-live','arb-live','odds','sharp','line-alerts'].includes(active) && !document.querySelector('dialog[open]')) render(); }, 15_000);
persist(); render();
