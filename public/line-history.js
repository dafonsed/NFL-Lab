// Line History modal: step chart of recorded prices per book for one selection.
// Pure helpers (series building, range clipping, scales, paths, label spreading)
// are exported for tests; openLineHistory() owns the single reusable <dialog>.
import { bookLogo } from './ev-board.js?v=8-source';

const HOUR = 3_600_000;
export const LINE_HISTORY_RANGES = [
  { key:'1h', label:'1 hour', ms:HOUR },
  { key:'6h', label:'6 hours', ms:6 * HOUR },
  { key:'24h', label:'24 hours', ms:24 * HOUR },
  { key:'7d', label:'7 days', ms:7 * 24 * HOUR },
  { key:'all', label:'All', ms:Infinity }
];
// Warm series shades, ordered so neighbours differ in lightness. Colour follows
// the book for the life of the modal; the logos in the pills carry identity.
export const LINE_HISTORY_COLORS = ['#e8a95a', '#f5d98f', '#c9772f', '#f0c36b', '#b8651f', '#dca06e', '#f7c98a', '#a85a24'];
const AVG_COLOR = '#fbeab8';

import { implied as impliedProbability, probabilityToAmerican as probabilityToOdds } from './betting-math.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const toTime = ts => typeof ts === 'number' ? ts : ts instanceof Date ? ts.getTime() : Date.parse(ts);

// The chart places prices on an implied-probability scale (better prices sit higher) and draws the
// books' average; both are display transforms of the recorded prices (betting-math.js conversions).
export { impliedProbability, probabilityToOdds };

// Raw history entries [{book, ts, odds, line}] -> [{book, points:[{ts, odds, line}]}]
// sorted by time, one point per timestamp, repeated prices collapsed.
export function buildLineSeries(entries = [], order = []) {
  const byBook = new Map();
  for (const entry of entries) {
    const ts = toTime(entry?.ts), odds = Number(entry?.odds);
    if (!entry?.book || !Number.isFinite(ts) || !Number.isFinite(impliedProbability(odds))) continue;
    if (!byBook.has(entry.book)) byBook.set(entry.book, []);
    byBook.get(entry.book).push({ ts, odds, line:entry.line ?? '' });
  }
  const rank = book => { const index = order.indexOf(book); return index < 0 ? order.length : index; };
  return [...byBook].sort(([a], [b]) => rank(a) - rank(b)).map(([book, points]) => {
    points.sort((a, b) => a.ts - b.ts);
    const out = [];
    for (const point of points) {
      const last = out.at(-1);
      if (last && last.ts === point.ts) { out[out.length - 1] = point; continue; }
      if (last && last.odds === point.odds && String(last.line) === String(point.line)) continue;
      out.push(point);
    }
    return { book, points:out };
  });
}

// Latest point at or before t.
export function valueAt(points, t) {
  let found;
  for (const point of points) { if (point.ts <= t) found = point; else break; }
  return found;
}

// Visible time window for a range key. "all" starts at the earliest point.
export function rangeWindow(series, key, now) {
  const range = LINE_HISTORY_RANGES.find(item => item.key === key) || LINE_HISTORY_RANGES[2];
  if (Number.isFinite(range.ms)) return { start:now - range.ms, end:now };
  const first = Math.min(...series.flatMap(item => item.points.map(point => point.ts)));
  return { start:Number.isFinite(first) && first < now ? first : now - HOUR, end:now };
}

// Points inside [start, end]: the last earlier price is carried to the left edge
// and the latest price is carried forward to the right edge.
export function clipSeries(points, start, end) {
  const before = valueAt(points, start);
  const inside = points.filter(point => point.ts > start && point.ts <= end);
  if (!before && !inside.length) return [];
  const out = before ? [{ ...before, ts:start, carried:before.ts < start }] : [];
  out.push(...inside);
  const last = out.at(-1);
  if (last.ts < end) out.push({ ...last, ts:end, carried:true });
  return out;
}

// Number of real (not carried) observations in a clipped series.
export const observedCount = points => points.filter(point => !point.carried).length;

// Average implied probability of every started series at each change, as odds.
export function averageLine(seriesPoints) {
  const lists = seriesPoints.filter(points => points.length);
  if (lists.length < 2) return [];
  const times = [...new Set(lists.flatMap(points => points.map(point => point.ts)))].sort((a, b) => a - b);
  const out = [];
  for (const t of times) {
    const values = lists.map(points => valueAt(points, t)).filter(Boolean).map(point => impliedProbability(point.odds));
    const odds = probabilityToOdds(values.reduce((sum, p) => sum + p, 0) / values.length);
    if (!Number.isFinite(odds)) continue;
    if (out.length && out.at(-1).odds === odds && t !== times.at(-1)) continue;
    out.push({ ts:t, odds });
  }
  return out;
}

const niceStep = raw => {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  return steps.find(step => step >= raw * .75) || steps.at(-1);
};

// Y scale by implied probability: better prices (lower probability) sit higher.
export function oddsScale(values, { top, bottom, ticks:count = 5, pad = .1 }) {
  const probs = values.map(impliedProbability).filter(Number.isFinite);
  let lo = probs.length ? Math.min(...probs) : .45, hi = probs.length ? Math.max(...probs) : .55;
  if (hi - lo < .01) { const mid = (hi + lo) / 2; lo = mid - .005; hi = mid + .005; }
  const span = hi - lo;
  lo = Math.max(.0005, lo - span * pad); hi = Math.min(.9995, hi + span * pad);
  const yOfProb = p => top + (p - lo) / (hi - lo) * (bottom - top);
  const y = odds => yOfProb(impliedProbability(odds));
  // Ticks are round American prices: step through a continuous price line that
  // removes the -100..+100 gap (-110 -> -10, +120 -> 20), top (best) first.
  const toU = odds => odds > 0 ? odds - 100 : odds + 100, fromU = u => u >= 0 ? u + 100 : u - 100;
  const uLo = toU(probabilityToOdds(hi)), uHi = toU(probabilityToOdds(lo));
  const step = niceStep((uHi - uLo) / Math.max(1, count));
  const ticks = [];
  for (let u = Math.floor(uHi / step) * step; u >= uLo && ticks.length < 50; u -= step) {
    const odds = fromU(u), p = impliedProbability(odds);
    if (p >= lo && p <= hi) ticks.push({ odds, y:yOfProb(p) });
  }
  return { y, ticks, lo, hi };
}

// Step path: horizontal to the next time, then vertical to the next price.
export function stepPath(points, x, y) {
  if (!points.length) return '';
  const r = value => Math.round(value * 10) / 10;
  let d = `M${r(x(points[0].ts))},${r(y(points[0].odds))}`;
  for (let i = 1; i < points.length; i++) {
    d += `H${r(x(points[i].ts))}`;
    if (points[i].odds !== points[i - 1].odds) d += `V${r(y(points[i].odds))}`;
  }
  return d;
}

// Push label centres apart by at least `gap`, keeping order and staying in [min, max].
export function spreadLabels(ys, gap, min, max) {
  const order = ys.map((y, i) => ({ y:Math.min(max, Math.max(min, y)), i })).sort((a, b) => a.y - b.y || a.i - b.i);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  if (order.length && order.at(-1).y > max) {
    order.at(-1).y = max;
    for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
  }
  if (order.length && order[0].y < min) {
    const fit = order.length > 1 ? Math.min(gap, (max - min) / (order.length - 1)) : 0;
    order.forEach((item, k) => { item.y = min + k * fit; });
  }
  const out = [];
  for (const item of order) out[item.i] = item.y;
  return out;
}

const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080].map(minutes => minutes * 60_000);
// Round local-time tick marks across [start, end], at most `max` of them.
export function timeTicks(start, end, max = 6) {
  const span = end - start;
  if (!(span > 0)) return [];
  const step = TIME_STEPS.find(value => span / value <= max) || TIME_STEPS.at(-1);
  const offset = -new Date(start).getTimezoneOffset() * 60_000;
  const ticks = [];
  for (let t = Math.ceil((start + offset) / step) * step - offset; t <= end; t += step) ticks.push(t);
  return ticks;
}

export function timeLabel(ts, span) {
  const date = new Date(ts);
  if (span >= 36 * HOUR) return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`;
}

export const tooltipTime = ts => new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

// Books to show first: the best current prices, always including the preferred book.
export function defaultBooks(series, preferred = '', count = 5) {
  const ranked = series.filter(item => item.points.length)
    .map(item => ({ book:item.book, p:impliedProbability(item.points.at(-1).odds) }))
    .sort((a, b) => a.p - b.p).map(item => item.book);
  const picked = ranked.slice(0, count);
  if (preferred && ranked.includes(preferred) && !picked.includes(preferred)) picked.splice(Math.max(0, picked.length - 1), 1, preferred);
  return new Set(picked);
}

// Smallest default-eligible range that contains at least one real observation.
export function initialRange(series, now, preferred = '24h') {
  const keys = LINE_HISTORY_RANGES.map(item => item.key), from = Math.max(0, keys.indexOf(preferred));
  for (const key of keys.slice(from)) {
    const { start, end } = rangeWindow(series, key, now);
    if (series.some(item => item.points.some(point => point.ts > start && point.ts <= end))) return key;
  }
  return preferred;
}

/* ---------------------------------------------------------------- modal --- */

let dialog = null, view = null, resizeObserver = null, frame = 0;

const closeIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const chevron = '<svg class="lh-range-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'line-history-dialog';
  dialog.className = 'lh-dialog';
  dialog.setAttribute('aria-labelledby', 'lh-title');
  dialog.setAttribute('aria-describedby', 'lh-subtitle');
  dialog.innerHTML = `<div class="lh-shell">
    <header class="lh-header"><h2 id="lh-title">Line History</h2><p id="lh-subtitle" class="lh-subtitle"></p><button type="button" class="lh-close" data-lh-close aria-label="Close line history">${closeIcon}</button></header>
    <div class="lh-toolbar">
      <div class="lh-range"><button type="button" class="lh-range-btn" data-lh-range-toggle aria-haspopup="listbox" aria-expanded="false" aria-controls="lh-range-menu"><span class="lh-sr">Time range: </span><span data-lh-range-label></span>${chevron}</button>
        <div class="lh-range-menu" id="lh-range-menu" role="listbox" aria-label="Time range" hidden>${LINE_HISTORY_RANGES.map(item => `<button type="button" role="option" aria-selected="false" data-lh-range="${item.key}">${item.label}</button>`).join('')}</div></div>
      <div class="lh-books" role="group" aria-label="Sportsbooks shown on the chart"></div>
    </div>
    <div class="lh-chart" tabindex="0" role="group" aria-roledescription="chart" aria-label="Price history by sportsbook" aria-describedby="lh-keys">
      <svg class="lh-svg" aria-hidden="true" focusable="false"></svg>
      <div class="lh-pills" aria-hidden="true"></div>
      <div class="lh-tooltip" role="presentation" hidden></div>
      <p class="lh-empty" hidden></p>
    </div>
    <footer class="lh-footer"><span class="lh-avg-key" aria-hidden="true"><i></i>AVG</span><span class="lh-caption"></span></footer>
    <p id="lh-keys" class="lh-sr">Use the left and right arrow keys to move between price changes, up and down to switch sportsbook.</p>
    <p class="lh-sr" aria-live="polite" data-lh-live></p>
  </div>`;
  document.body.append(dialog);
  const chart = dialog.querySelector('.lh-chart');
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-lh-close]')) return dialog.close();
    if (event.target.closest('[data-lh-range-toggle]')) return rangeMenu(dialog.querySelector('.lh-range-menu').hidden);
    const range = event.target.closest('[data-lh-range]');
    if (range && view) { view.range = range.dataset.lhRange; view.hover = null; rangeMenu(false, true); syncRange(); return render(); }
    if (!event.target.closest('.lh-range')) rangeMenu(false);
    const book = event.target.closest('[data-lh-book]');
    if (book && view) toggleBook(book.dataset.lhBook);
  });
  dialog.querySelector('.lh-range').addEventListener('keydown', event => {
    const menu = dialog.querySelector('.lh-range-menu'), items = [...menu.querySelectorAll('[role=option]')];
    if (menu.hidden) { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); rangeMenu(true); } return; }
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); rangeMenu(false, event.key === 'Escape'); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1].focus(); }
  });
  dialog.addEventListener('cancel', event => { if (!dialog.querySelector('.lh-range-menu').hidden) { event.preventDefault(); rangeMenu(false, true); } });
  dialog.addEventListener('close', () => {
    resizeObserver?.disconnect();
    cancelAnimationFrame(frame);
    const trigger = view?.trigger;
    view = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll:true });
  });
  chart.addEventListener('pointermove', event => pointerHover(event));
  chart.addEventListener('pointerdown', event => pointerHover(event));
  chart.addEventListener('pointerleave', () => { if (view && document.activeElement !== chart) { view.hover = null; paintHover(); } });
  chart.addEventListener('keydown', keyHover);
  chart.addEventListener('focus', () => { if (view && !view.hover && view.geo?.stops.length) { view.hover = { t:view.geo.stops.at(-1), book:'' }; paintHover(true); } });
  chart.addEventListener('blur', () => { if (view) { view.hover = null; paintHover(); } });
  resizeObserver = null;
  return dialog;
}

/**
 * Open the Line History modal.
 * @param {{title?:string, subtitle?:string, series?:{book:string, points:{ts:number|string, odds:number, line?:any}[]}[],
 *   entries?:{book:string, ts:string|number, odds:number, line?:any}[], books?:string[], selectedBook?:string,
 *   selected?:string[], range?:string, oddsLabel?:(odds:number)=>string, trigger?:HTMLElement, now?:number}} options
 */
export function openLineHistory(options = {}) {
  const el = ensureDialog();
  const oddsLabel = options.oddsLabel || (odds => (odds > 0 ? '+' : '') + Math.round(odds));
  const series = options.series
    ? buildLineSeries(options.series.flatMap(item => item.points.map(point => ({ ...point, book:item.book }))), options.books || options.series.map(item => item.book))
    : buildLineSeries(options.entries || [], options.books || []);
  const latest = Math.max(0, ...series.flatMap(item => item.points.map(point => point.ts)));
  const now = Math.max(Number(options.now) || Date.now(), latest);
  const selected = options.selected ? new Set(options.selected.filter(book => series.some(item => item.book === book))) : defaultBooks(series, options.selectedBook);
  const colors = new Map();
  series.filter(item => selected.has(item.book)).forEach((item, i) => colors.set(item.book, LINE_HISTORY_COLORS[i % LINE_HISTORY_COLORS.length]));
  view = { series, selected, colors, now, oddsLabel, range:options.range || initialRange(series, now), hover:null,
    trigger:options.trigger || document.activeElement, geo:null };
  el.querySelector('#lh-title').textContent = options.title || 'Line History';
  el.querySelector('#lh-subtitle').textContent = options.subtitle || '';
  rangeMenu(false);
  syncRange();
  renderBooks();
  if (!el.open) el.showModal();
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); });
  resizeObserver.observe(el.querySelector('.lh-chart'));
  render();
  el.querySelector('.lh-close').focus({ preventScroll:true });
  return el;
}

function rangeMenu(open, focusToggle = false) {
  const menu = dialog.querySelector('.lh-range-menu'), toggle = dialog.querySelector('[data-lh-range-toggle]');
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) (menu.querySelector('[aria-selected=true]') || menu.querySelector('[role=option]'))?.focus({ preventScroll:true });
  else if (focusToggle) toggle.focus({ preventScroll:true });
}

function syncRange() {
  const range = LINE_HISTORY_RANGES.find(item => item.key === view.range) || LINE_HISTORY_RANGES[2];
  dialog.querySelector('[data-lh-range-label]').textContent = range.label;
  dialog.querySelectorAll('[data-lh-range]').forEach(item => item.setAttribute('aria-selected', String(item.dataset.lhRange === range.key)));
}

function colorFor(book) {
  if (!view.colors.has(book)) {
    const used = new Set([...view.selected].map(name => view.colors.get(name)));
    view.colors.set(book, LINE_HISTORY_COLORS.find(color => !used.has(color)) || LINE_HISTORY_COLORS[view.colors.size % LINE_HISTORY_COLORS.length]);
  }
  return view.colors.get(book);
}

function toggleBook(book) {
  if (view.selected.has(book)) view.selected.delete(book);
  else { colorFor(book); view.selected.add(book); }
  view.hover = null;
  renderBooks();
  render();
  dialog.querySelector(`[data-lh-book="${CSS.escape(book)}"]`)?.focus({ preventScroll:true });
}

function renderBooks() {
  dialog.querySelector('.lh-books').innerHTML = view.series.map(item => {
    const on = view.selected.has(item.book), current = item.points.at(-1);
    return `<button type="button" class="lh-book${on ? ' is-on' : ''}" data-lh-book="${esc(item.book)}" aria-pressed="${on}" aria-label="${esc(item.book)}${current ? `, ${esc(view.oddsLabel(current.odds))}` : ''}" title="${esc(item.book)}">${bookLogo(item.book, 28)}</button>`;
  }).join('');
}

function layout(width, height) {
  const narrow = width < 560;
  const m = { left:narrow ? 44 : 58, right:narrow ? 84 : 112, top:16, bottom:30 };
  return { width, height, narrow, left:m.left, right:width - m.right, top:m.top, bottom:height - m.bottom };
}

function render() {
  if (!view || !dialog?.open) return;
  const chart = dialog.querySelector('.lh-chart'), svg = chart.querySelector('.lh-svg');
  const width = Math.max(260, Math.round(chart.clientWidth)), height = Math.max(200, Math.round(chart.clientHeight));
  const box = layout(width, height);
  const { start, end } = rangeWindow(view.series, view.range, view.now);
  const lines = view.series.filter(item => view.selected.has(item.book))
    .map(item => ({ book:item.book, color:colorFor(item.book), points:clipSeries(item.points, start, end) }))
    .filter(item => item.points.length);
  const empty = chart.querySelector('.lh-empty'), pills = chart.querySelector('.lh-pills');
  const caption = dialog.querySelector('.lh-caption');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width); svg.setAttribute('height', height);
  if (!lines.length) {
    view.geo = null;
    svg.innerHTML = ''; pills.innerHTML = '';
    empty.hidden = false;
    empty.textContent = view.selected.size || !view.series.length ? 'No recorded price changes in this range' : 'Select a sportsbook to show its line';
    dialog.querySelector('.lh-avg-key').hidden = true;
    caption.textContent = '';
    paintHover();
    return;
  }
  const changes = lines.reduce((sum, item) => sum + observedCount(item.points), 0);
  empty.hidden = changes > 0;
  empty.textContent = 'No recorded price changes in this range';
  const average = averageLine(lines.map(item => item.points));
  const scale = oddsScale([...lines, { points:average }].flatMap(item => item.points.map(point => point.odds)), { top:box.top, bottom:box.bottom, ticks:box.height < 320 ? 4 : 6 });
  const x = t => box.left + (t - start) / (end - start) * (box.right - box.left);
  const y = scale.y;
  const span = end - start;
  const xTicks = timeTicks(start, end, Math.max(2, Math.floor((box.right - box.left) / (box.narrow ? 72 : 110))));
  const grid = scale.ticks.map(tick => `<line class="lh-grid" x1="${box.left}" x2="${box.right}" y1="${Math.round(tick.y) + .5}" y2="${Math.round(tick.y) + .5}"/><text class="lh-axis lh-axis-y" x="${box.left - 10}" y="${tick.y}" dy=".32em" text-anchor="end">${esc(view.oddsLabel(tick.odds))}</text>`).join('');
  const times = xTicks.map(t => { const px = x(t); return `<line class="lh-grid lh-grid-x" x1="${Math.round(px) + .5}" x2="${Math.round(px) + .5}" y1="${box.top}" y2="${box.bottom}"/><text class="lh-axis" x="${px}" y="${box.bottom + 19}" text-anchor="middle">${esc(timeLabel(t, span))}</text>`; }).join('');
  const paths = lines.map(item => `<path class="lh-line" d="${stepPath(item.points, x, y)}" stroke="${item.color}"/>`).join('');
  const avg = average.length ? `<path class="lh-avg" d="${stepPath(average, x, y)}" stroke="${AVG_COLOR}"/>` : '';
  const ends = lines.map(item => `<circle class="lh-end" cx="${box.right}" cy="${y(item.points.at(-1).odds)}" r="3.5" fill="${item.color}"/>`).join('');
  svg.innerHTML = `<rect class="lh-plot" x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}"/>${grid}${times}<line class="lh-baseline" x1="${box.left}" x2="${box.right}" y1="${box.bottom + .5}" y2="${box.bottom + .5}"/>${avg}${paths}${ends}
    <g class="lh-hover" visibility="hidden"><line class="lh-cross" y1="${box.top}" y2="${box.bottom}"/><circle class="lh-dot" r="5"/></g>`;
  const pillYs = spreadLabels(lines.map(item => y(item.points.at(-1).odds)), box.narrow ? 24 : 28, box.top + 10, box.bottom - 10);
  pills.innerHTML = lines.map((item, i) => `<span class="lh-pill" style="--lh-color:${item.color};left:${box.right + 10}px;top:${pillYs[i]}px">${bookLogo(item.book, box.narrow ? 14 : 18)}<b>${esc(view.oddsLabel(item.points.at(-1).odds))}</b></span>`).join('');
  dialog.querySelector('.lh-avg-key').hidden = !average.length;
  caption.textContent = `${lines.length} ${lines.length === 1 ? 'book' : 'books'} · ${changes} recorded ${changes === 1 ? 'price' : 'prices'} in range`;
  // Keyboard stops: the range edges plus every price change, at least 4px apart.
  const changesAt = lines.flatMap(item => item.points.filter((point, i) => i && point.odds !== item.points[i - 1].odds).map(point => point.ts));
  const stops = [...new Set([start, ...changesAt, end])].sort((a, b) => a - b)
    .filter((t, i, all) => i === all.length - 1 || x(all[i + 1]) - x(t) >= 4);
  view.geo = { box, start, end, x, y, lines, stops };
  if (view.hover) paintHover();
}

function nearestLine(t, pointerY) {
  const { lines, y } = view.geo;
  const candidates = lines.map(item => ({ item, point:valueAt(item.points, t) })).filter(entry => entry.point);
  if (!candidates.length) return null;
  if (!Number.isFinite(pointerY)) return candidates.find(entry => entry.item.book === view.hover?.book) || candidates[0];
  return candidates.reduce((best, entry) => Math.abs(y(entry.point.odds) - pointerY) < Math.abs(y(best.point.odds) - pointerY) ? entry : best);
}

function pointerHover(event) {
  if (!view?.geo) return;
  const rect = dialog.querySelector('.lh-svg').getBoundingClientRect(), { box, start, end } = view.geo;
  const px = event.clientX - rect.left, py = event.clientY - rect.top;
  if (px < box.left - 4 || px > box.right + 4 || py < box.top - 8 || py > box.bottom + 8) { view.hover = null; return paintHover(); }
  const t = start + Math.min(1, Math.max(0, (px - box.left) / (box.right - box.left))) * (end - start);
  view.hover = { t, book:'', pointerY:py };
  const hit = nearestLine(t, py);
  if (hit) view.hover.book = hit.item.book;
  paintHover();
}

function keyHover(event) {
  if (!view?.geo?.stops.length) return;
  const { stops, lines } = view.geo;
  let t = view.hover?.t ?? stops.at(-1), book = view.hover?.book || '';
  if (event.key === 'ArrowRight') t = stops.find(stop => stop > t + 1) ?? stops.at(-1);
  else if (event.key === 'ArrowLeft') t = stops.findLast(stop => stop < t - 1) ?? stops[0];
  else if (event.key === 'Home') t = stops[0];
  else if (event.key === 'End') t = stops.at(-1);
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const order = lines.map(item => ({ book:item.book, point:valueAt(item.points, t) })).filter(entry => entry.point)
      .sort((a, b) => view.geo.y(a.point.odds) - view.geo.y(b.point.odds));
    const at = Math.max(0, order.findIndex(entry => entry.book === book));
    book = order[(at + (event.key === 'ArrowDown' ? 1 : order.length - 1)) % order.length]?.book || book;
  } else return;
  event.preventDefault();
  view.hover = { t, book };
  paintHover(true);
}

function paintHover(announce = false) {
  if (!dialog) return;
  const svg = dialog.querySelector('.lh-svg'), group = svg.querySelector('.lh-hover'), tip = dialog.querySelector('.lh-tooltip');
  if (!view?.geo || !view.hover) { group?.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
  const { box, x, y } = view.geo, hit = nearestLine(view.hover.t, view.hover.pointerY);
  if (!hit || !group) { group?.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
  view.hover.book = hit.item.book;
  const px = x(view.hover.t), py = y(hit.point.odds);
  const cross = group.querySelector('.lh-cross'), dot = group.querySelector('.lh-dot');
  cross.setAttribute('x1', Math.round(px) + .5); cross.setAttribute('x2', Math.round(px) + .5);
  dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('fill', hit.item.color);
  group.setAttribute('visibility', 'visible');
  const odds = view.oddsLabel(hit.point.odds), line = hit.point.line !== '' && hit.point.line != null ? String(hit.point.line) : '';
  tip.innerHTML = `<time>${esc(tooltipTime(view.hover.t))}</time><span class="lh-tip-row"><span class="lh-tip-logo">${bookLogo(hit.item.book, 20)}</span><span class="lh-tip-book">${esc(hit.item.book)}</span><strong style="color:${hit.item.color}">${esc(odds)}</strong></span>${line ? `<small>Line ${esc(line)}</small>` : ''}`;
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const left = px + 14 + tw > box.right ? px - 14 - tw : px + 14;
  const top = Math.min(box.bottom - th, Math.max(box.top, py - th - 12));
  tip.style.transform = `translate(${Math.max(4, Math.round(left))}px, ${Math.round(top)}px)`;
  if (announce) dialog.querySelector('[data-lh-live]').textContent = `${tooltipTime(view.hover.t)}, ${hit.item.book} ${odds}`;
}
