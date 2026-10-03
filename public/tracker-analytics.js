// Tracker analysis for the Advanced tab: bankroll over time, closing line value per bet, and
// results by bet type and by odds range, in dollars or units.
import { betReturns, closingLineValue } from './bet-utils.js?v=4';

export const DISPLAY_KEY = 'vo-tracker-display-v1';

export function readDisplay(storage) {
  try {
    const saved = JSON.parse(storage.getItem(DISPLAY_KEY) || '{}');
    return { units: saved.units === true, unitSize: Number(saved.unitSize) > 0 ? Number(saved.unitSize) : null, bankroll: Number(saved.bankroll) > 0 ? Number(saved.bankroll) : null };
  } catch { return { units: false, unitSize: null, bankroll: null }; }
}
export function writeDisplay(storage, display) {
  storage.setItem(DISPLAY_KEY, JSON.stringify({ units: !!display.units, ...(display.unitSize > 0 ? { unitSize: display.unitSize } : {}), ...(display.bankroll > 0 ? { bankroll: display.bankroll } : {}) }));
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const decimalOdds = bet => bet.oddsFormat === 'decimal' ? bet.odds : bet.odds > 0 ? 1 + bet.odds / 100 : 1 + 100 / Math.abs(bet.odds);

/** Median cash stake, used as the default unit so units work before the user sets one. */
export function defaultUnit(bets) {
  const stakes = bets.filter(bet => !bet.freeBet).map(bet => Number(bet.stake)).filter(value => value > 0).sort((a, b) => a - b);
  if (!stakes.length) return 10;
  const mid = Math.floor(stakes.length / 2);
  return stakes.length % 2 ? stakes[mid] : (stakes[mid - 1] + stakes[mid]) / 2;
}

export function money(value, display, unit) {
  if (display.units) return `${value >= 0 ? '' : '−'}${Math.abs(value / unit).toFixed(2)}u`;
  const text = Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return value < 0 ? `−${text}` : text;
}

/** Group settled tickets and report count, profit, ROI and win rate per group. */
export function groupResults(bets, keyOf) {
  const groups = new Map();
  for (const bet of bets) {
    if (bet.status === 'open') continue;
    const key = keyOf(bet);
    if (!key) continue;
    const row = groups.get(key) || { name: key, count: 0, profit: 0, risked: 0, won: 0, lost: 0 };
    const profit = betReturns(bet).profit || 0;
    row.count += 1; row.profit += profit;
    if (!['push', 'void'].includes(bet.status) && !bet.freeBet) row.risked += Number(bet.stake) || 0;
    if (bet.status === 'won') row.won += 1;
    if (bet.status === 'lost') row.lost += 1;
    groups.set(key, row);
  }
  return [...groups.values()].map(row => ({ ...row, roi: row.risked ? row.profit / row.risked * 100 : null, winRate: row.won + row.lost ? row.won / (row.won + row.lost) * 100 : null }));
}

export function oddsBucket(bet) {
  const decimal = decimalOdds(bet);
  if (!Number.isFinite(decimal)) return null;
  if (decimal < 1.5) return 'Heavy favorites (−200 or shorter)';
  if (decimal < 2) return 'Favorites (−199 to −101)';
  if (decimal < 3) return 'Short underdogs (+100 to +199)';
  return 'Long shots (+200 and longer)';
}

/** Bankroll points: one per settled day, starting from the chosen bankroll. */
export function bankrollSeries(bets, start) {
  const byDay = new Map();
  for (const bet of bets) {
    if (bet.status === 'open') continue;
    byDay.set(bet.date, (byDay.get(bet.date) || 0) + (betReturns(bet).profit || 0));
  }
  let running = start;
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, profit]) => ({ date, value: (running += profit) }));
}

function lineChart(points, { label, format }) {
  if (points.length < 2) return `<p class="ta-empty">${esc(label)} appears once two days of results are settled.</p>`;
  const width = 640, height = 180, pad = 8;
  const values = points.map(point => point.value), min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = index => pad + index / (points.length - 1) * (width - pad * 2);
  const y = value => pad + (1 - (value - min) / span) * (height - pad * 2);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const up = values.at(-1) >= values[0];
  return `<svg class="ta-line${up ? '' : ' is-down'}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: from ${esc(format(values[0]))} to ${esc(format(values.at(-1)))}"><path class="ta-area" d="${path} L${x(points.length - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z"/><path class="ta-stroke" d="${path}"/></svg>
    <div class="ta-axis"><span>${esc(points[0].date)}</span><span>${esc(points.at(-1).date)}</span></div>`;
}

function clvChart(bets) {
  const rows = bets.map(bet => ({ bet, clv: closingLineValue(bet) })).filter(row => Number.isFinite(row.clv)).sort((a, b) => a.bet.date.localeCompare(b.bet.date)).slice(-40);
  if (!rows.length) return '<p class="ta-empty">Add closing odds to your tickets to see closing line value here.</p>';
  const max = Math.max(...rows.map(row => Math.abs(row.clv)), 1);
  const average = rows.reduce((sum, row) => sum + row.clv, 0) / rows.length;
  const beat = rows.filter(row => row.clv > 0).length;
  return `<div class="ta-clv-bars" role="img" aria-label="Closing line value for your last ${rows.length} tickets with closing odds; average ${average.toFixed(2)}%">${rows.map(row => `<i class="${row.clv >= 0 ? 'is-pos' : 'is-neg'}" style="--h:${(Math.abs(row.clv) / max * 50).toFixed(1)}%" title="${esc(row.bet.date)} · ${esc(row.bet.selection)} · ${row.clv >= 0 ? '+' : ''}${row.clv.toFixed(2)}%"></i>`).join('')}<span class="ta-clv-zero"></span></div>
    <p class="ta-note"><strong class="${average >= 0 ? 'is-pos' : 'is-neg'}">${average >= 0 ? '+' : ''}${average.toFixed(2)}% average price CLV</strong> · beat the close on ${beat} of ${rows.length} tickets</p>`;
}

function table(rows, display, unit, emptyText) {
  if (!rows.length) return `<p class="ta-empty">${esc(emptyText)}</p>`;
  return `<table class="ta-table"><thead><tr><th scope="col">Group</th><th scope="col">Bets</th><th scope="col">Win rate</th><th scope="col">ROI</th><th scope="col">Profit</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${esc(row.name)}</th><td>${row.count}</td><td>${row.winRate == null ? '—' : row.winRate.toFixed(0) + '%'}</td><td class="${(row.roi ?? 0) >= 0 ? 'is-pos' : 'is-neg'}">${row.roi == null ? '—' : (row.roi >= 0 ? '+' : '') + row.roi.toFixed(1) + '%'}</td><td class="${row.profit >= 0 ? 'is-pos' : 'is-neg'}">${esc(money(row.profit, display, unit))}</td></tr>`).join('')}</tbody></table>`;
}

export function renderAnalytics(bets, display) {
  const unit = display.unitSize || defaultUnit(bets);
  const start = display.bankroll || 1000;
  const typeRows = groupResults(bets, bet => bet.type === 'parlay' ? 'Parlays' : 'Singles').sort((a, b) => b.profit - a.profit);
  const oddsOrder = ['Heavy favorites (−200 or shorter)', 'Favorites (−199 to −101)', 'Short underdogs (+100 to +199)', 'Long shots (+200 and longer)'];
  const oddsRows = groupResults(bets, oddsBucket).sort((a, b) => oddsOrder.indexOf(a.name) - oddsOrder.indexOf(b.name));
  return `<section class="ta" aria-labelledby="ta-title">
    <header class="ta-head"><h2 id="ta-title">Analysis</h2>
      <div class="ta-controls"><div class="ta-seg" role="group" aria-label="Show amounts in"><button type="button" data-ta-units="false" aria-pressed="${!display.units}">Dollars</button><button type="button" data-ta-units="true" aria-pressed="${display.units}">Units</button></div>
      <label>Unit<input type="number" min="0.01" step="0.01" data-ta-field="unitSize" value="${display.unitSize ?? ''}" placeholder="${unit.toFixed(2)}" inputmode="decimal"></label>
      <label>Starting bankroll<input type="number" min="1" step="1" data-ta-field="bankroll" value="${display.bankroll ?? ''}" placeholder="1000" inputmode="decimal"></label></div></header>
    <div class="ta-grid">
      <article class="ta-card ta-wide"><h3>Bankroll</h3>${lineChart(bankrollSeries(bets, start), { label: 'Bankroll over time', format: value => money(value, display.units ? display : { units: false }, unit) })}</article>
      <article class="ta-card ta-wide"><h3>Closing line value</h3>${clvChart(bets)}</article>
      <article class="ta-card"><h3>By bet type</h3>${table(typeRows, display, unit, 'Settle a ticket to compare singles and parlays.')}</article>
      <article class="ta-card"><h3>By odds range</h3>${table(oddsRows, display, unit, 'Settle a ticket to compare favorites and underdogs.')}</article>
    </div>
  </section>`;
}
