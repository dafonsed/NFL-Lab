// Presentation controls only: changing this line never changes a sportsbook quote.
export const COMPARISON_LINE_GUTTER = 82;

// Shared visual handle for Research, Trends and the homepage demo.
export function comparisonLineHandle(value) {
  const label = Number.isFinite(Number(value)) ? String(Number(value)) : '—';
  return `<rect class="pr-line-hitbox" x="0" y="-22" width="78" height="44" rx="14"/><rect class="pr-line-pill" x="1" y="-17" width="72" height="34" rx="12"/><path class="pr-line-grip" d="M11 -5h.01M17 -5h.01M11 0h.01M17 0h.01M11 5h.01M17 5h.01"/><line class="pr-line-divider" x1="25" x2="25" y1="-8" y2="8"/><text class="pr-line-label" x="49" y="4" text-anchor="middle">${label}</text>`;
}

export function snapComparisonLine(value, min = -100, max = 1000, step = .5) {
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}

export function valueAtChartY(y, { low, high, top, height }) {
  return high - (y - top) / height * (high - low);
}

export function bindComparisonLines(root, { onStart, onPreview, onCommit, onCancel }) {
  const events = new AbortController();
  let drag = null;
  const listen = (type, fn) => root.addEventListener(type, fn, { signal: events.signal });
  const bounds = control => ({ min: Number(control.getAttribute('aria-valuemin')), max: Number(control.getAttribute('aria-valuemax')) });
  const point = (svg, event) => new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  // SVG children do not consistently establish a touch-action region. Cancel
  // the native gesture only on the handle; the chart remains scrollable elsewhere.
  root.addEventListener('touchstart', event => {
    if (event.target.closest('[data-comparison-line]')) event.preventDefault();
  }, { passive: false, signal: events.signal });
  function paint(control, value) {
    const svg = control.ownerSVGElement, { low, high, top, height } = svg.dataset;
    const y = Number(top) + (Number(high) - value) / (Number(high) - Number(low)) * Number(height);
    control.setAttribute('transform', `translate(0 ${y})`);
    control.setAttribute('aria-valuenow', String(value));
    control.setAttribute('aria-valuetext', `${value}, your comparison line`);
    svg.setAttribute('aria-label', svg.getAttribute('aria-label').replace(/; comparison line at .*/, '; comparison line at ' + value));
    control.querySelector('.pr-line-label').textContent = String(value);
    for (const result of svg.querySelectorAll('[data-result]')) {
      const actual = Number(result.dataset.result);
      const status = actual === value ? 'push' : (svg.dataset.side === 'under' ? actual < value : actual > value) ? 'hit' : 'miss';
      for (const bar of result.querySelectorAll('.pr-bar')) bar.setAttribute('class', `pr-bar ${status}`);
    }
  }
  function finish(cancel = false) {
    if (!drag) return;
    const current = drag; drag = null;
    current.control.classList.remove('is-dragging');
    if (current.control.hasPointerCapture?.(current.id)) current.control.releasePointerCapture(current.id);
    if (!current.changed) return;
    if (cancel) onCancel?.(); else onCommit(current.value);
  }
  listen('pointerdown', event => {
    const control = event.target.closest('[data-comparison-line]');
    if (!control || event.button !== 0 || !event.isPrimary || drag) return;
    event.preventDefault(); control.focus({ preventScroll: true });
    const svg = control.ownerSVGElement, p = point(svg, event);
    drag = { control, svg, id: event.pointerId, startY: p.y, start: Number(control.getAttribute('aria-valuenow')), value: Number(control.getAttribute('aria-valuenow')), changed: false };
    onStart?.(); control.setPointerCapture(event.pointerId); control.classList.add('is-dragging');
  });
  listen('pointermove', event => {
    if (!drag || event.pointerId !== drag.id || !drag.control.isConnected) return;
    const p = point(drag.svg, event), geometry = Object.fromEntries(['low','high','top','height'].map(k=>[k,Number(drag.svg.dataset[k])])), { min, max } = bounds(drag.control);
    const value = snapComparisonLine(drag.start + valueAtChartY(p.y, geometry) - valueAtChartY(drag.startY, geometry), min, max);
    if (value === drag.value) return;
    drag.value = value; drag.changed = true; paint(drag.control, value); onPreview?.(value);
  });
  listen('pointerup', event => { if (drag?.id === event.pointerId) finish(); });
  listen('pointercancel', event => { if (drag?.id === event.pointerId) finish(true); });
  listen('lostpointercapture', event => { if (drag?.id === event.pointerId) finish(true); });
  listen('keydown', event => {
    const control = event.target.closest('[data-comparison-line]'); if (!control) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
    const { min, max } = bounds(control), step = event.shiftKey ? 5 : .5, current = Number(control.getAttribute('aria-valuenow'));
    const values = { ArrowUp: current + step, ArrowRight: current + step, ArrowDown: current - step, ArrowLeft: current - step, Home: min, End: max };
    if (!(event.key in values)) return;
    event.preventDefault(); event.stopPropagation(); onCommit(snapComparisonLine(values[event.key], min, max));
  });
  return () => { drag = null; events.abort(); };
}
