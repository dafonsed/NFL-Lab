// Matching a member's alert rules against odds data: comparisons of API values with the member's
// thresholds, no pricing. Shared by the +EV workspace (in the browser, on each price update) and the alert
// email job (lib/accounts/alert-mailer.mjs, on the server), so both fire on the same matches.
import { decimal } from './betting-math.js';
import { oddsLabel, signed } from './odds-format.js';

/** @typedef {import('../lib/odds/contract').Quote} Quote */
/** @typedef {import('../lib/odds/contract').QuotePricing} QuotePricing */
/** @typedef {import('../lib/odds/contract').DfsPick} DfsPick */
/** @typedef {{ kind: string, threshold?: number | string | null, sport?: string, event?: string, market?: string, liveOnly?: boolean }} AlertRule */
/** A price as the workspace holds it: a feed quote, or one the member saved. @typedef {Partial<Quote> & { id: string }} AlertQuote */
/** @typedef {{ id: string, quoteId?: string, seriesId?: string, line?: number | string | null }} HistoryPoint */
/** @typedef {{ quotes?: AlertQuote[], dfs?: Partial<DfsPick>[], history?: HistoryPoint[] }} AlertState */

// A probability that is missing (null, '' or undefined) is unknown, not 0%.
/** @param {unknown} value */
const knownProbability = value => value !== null && value !== undefined && value !== '' && Number(value) >= 0 && Number(value) <= 1;

/**
 * Current matches for one alert rule: [{ id, label }]. A match's id is its selection's stable id (a line
 * move's snapshot for movement rules), so a rule fires when a price newly meets it, not on every rescrape.
 * `state` holds quotes, dfs picks and recorded history; `pricing` is the API's pricing by quote id (EV rules
 * use its EV and plausibility, priced with the member's settings); `available` decides which prices are
 * current and `offered` which books a matched price may be at (the member's state).
 * @param {AlertRule} rule
 * @param {AlertState} state
 * @param {{ pricing?: ReadonlyMap<string, Pick<QuotePricing, 'ev' | 'plausible'>>, available?: (quote: AlertQuote) => boolean, offered?: (quote: AlertQuote) => boolean }} [options]
 * @returns {{ id: string, label: string }[]}
 */
export function alertMatches(rule, state, { pricing = new Map(), available = () => true, offered = () => true } = {}) {
  /** @param {unknown} value */
  const lower = value => String(value ?? '').toLowerCase();
  /** @param {unknown[]} values @param {unknown} text */
  const named = (values, text) => values.some(value => lower(value).includes(lower(text)));
  if (rule.kind === 'fantasy-new') {
    // A goblin or demon line without its multiplier, or a part-game line, has no comparable hit rate.
    /** @param {Partial<DfsPick>} x */
    const market = x => !rule.market || lower(x.market) === lower(rule.market) || lower(x.market).startsWith(lower(rule.market) + ' ');
    return (state.dfs || []).filter(x => knownProbability(x.probability) && x.period !== 'part' && (!['goblin', 'demon'].includes(String(x.oddsType)) || Number(x.payoutMultiplier) > 0)
      && (!rule.sport || x.sport === rule.sport) && (!rule.event || named([x.event], rule.event)) && market(x) && (!rule.liveOnly || x.live)
      && (!Number.isFinite(Number(rule.threshold)) || Number(x.probability) * 100 >= Number(rule.threshold)))
      .map(x => ({ id: String(x.id), label: `${x.player} ${x.side} ${x.line} ${x.market} · ${(Number(x.probability) * 100).toFixed(1)}% fair at ${x.app}` }));
  }
  const quotes = (state.quotes || []).filter(q => available(q) && offered(q) && (!rule.sport || q.sport === rule.sport) && (!rule.event || named([q.displayEvent, q.event], rule.event))
    && (!rule.market || named([q.displayMarket, q.market], rule.market)) && (!rule.liveOnly || q.live));
  /** @param {AlertQuote} q */
  const label = q => `${q.player ? q.player + ' ' : ''}${q.selection || q.side}${q.line !== '' && q.line != null ? ' ' + q.line : ''} ${oddsLabel(q.odds)} · ${q.displayMarket || q.market} · ${q.displayEvent || q.event} at ${q.book}`;
  if (rule.kind === 'price') return quotes.filter(q => decimal(q.odds) >= decimal(rule.threshold)).map(q => ({ id: q.id, label: label(q) }));
  if (rule.kind === 'ev') {
    const threshold = Number(rule.threshold) / 100;
    return quotes.flatMap(q => { const row = pricing.get(q.id); return row && row.plausible && row.ev >= threshold ? [{ id: q.id, label: `${label(q)} · ${signed(row.ev)} EV` }] : []; });
  }
  if (rule.kind === 'movement') {
    // A moved line is a new selection id; its series id follows the book's line (see normalizeFeed).
    /** @type {Map<string, HistoryPoint[]>} */
    const series = new Map();
    for (const item of state.history || []) { const key = item.seriesId || item.quoteId || '', rows = series.get(key); if (rows) rows.push(item); else series.set(key, [item]); }
    return quotes.flatMap(q => {
      const observations = series.get(q.seriesId || q.id) || [];
      if (observations.length < 2) return [];
      const previous = observations[observations.length - 2], current = observations[observations.length - 1], change = Math.abs(Number(current.line) - Number(previous.line));
      return Number.isFinite(change) && change >= Number(rule.threshold) && change > 0 ? [{ id: current.id, label: `${label(q)} · line ${previous.line} → ${current.line}` }] : [];
    });
  }
  return [];
}
