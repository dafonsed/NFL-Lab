// Display formatting for money, fractions and American odds. Formatting only: values arrive computed
// (from /api/odds, or from a calculator in betting-math.js).

// Anything that isn't a finite number shows as "—" (unavailable), never as 0.

/** @param {unknown} n */
export const money = n => typeof n === 'number' && Number.isFinite(n) ? (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2) : '—';
/** A fraction as a percent (0.075 → 7.5%). @param {unknown} n */
export const percent = n => typeof n === 'number' && Number.isFinite(n) ? (100 * n).toFixed(1) + '%' : '—';
/** @param {unknown} n */
export const signed = n => typeof n === 'number' && Number.isFinite(n) ? (n > 0 ? '+' : '') + (100 * n).toFixed(1) + '%' : '—';
/** @param {unknown} odds */
export const oddsLabel = odds => Number(odds) > 0 ? '+' + Number(odds) : String(Number(odds));
