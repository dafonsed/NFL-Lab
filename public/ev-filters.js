// Shared filters for the +EV tools. Pure helpers, so every tool and the tests apply the same rules. Filters
// choose which rows show; they never change a price or a fair value.
import { decimal } from './betting-math.js';
import { name, number, valuePresent as present } from './market-identity.js';

// "Starts" windows use the event start time from the quote feed, not when a price was observed.
export const START_WINDOWS = [['all', 'Any time'], ['soon', 'Next 3 hours'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days']];
export const PERIODS = [['all', 'All games'], ['pregame', 'Pregame'], ['live', 'Live']];
export const MIN_ODDS = [['', 'Any'], ['-300', '-300'], ['-200', '-200'], ['-150', '-150'], ['-110', '-110'], ['100', '+100'], ['150', '+150']];
export const MAX_ODDS = [['', 'Any'], ['150', '+150'], ['200', '+200'], ['300', '+300'], ['500', '+500'], ['1000', '+1000']];
export const MIN_EV = [['', 'Any'], ['0.5', '0.5%'], ['1', '1%'], ['2', '2%'], ['3', '3%'], ['5', '5%']];
export const MIN_WIN_CHANCE = [['', 'Any'], ['20', '20%'], ['35', '35%'], ['50', '50%'], ['65', '65%']];
export const MAX_HOLD = [['', 'Any'], ['1', '1%'], ['2', '2%'], ['3', '3%'], ['5', '5%']];
export const MIN_WINDOW = [['', 'Any'], ['1', '1 pt'], ['2', '2 pts'], ['3', '3 pts']];
export const LEG_EV = [['', 'Any'], ['0', 'Positive'], ['1', '1%'], ['2', '2%']];
// Combined margin of the two middle legs. Alternate-line ladders create thousands of very
// expensive middles, so the default hides pairs costing more than 8%.
export const MAX_COST = [['', 'Any'], ['3', '3%'], ['5', '5%'], ['8', '8%'], ['15', '15%']];

// Per-tool controls for the tools that use the shared filter bar. Keys map to TOOL_FILTER_DEFAULTS.
export const TOOL_FILTERS = {
  middles: ['league', 'market', 'period', 'when', 'minWidth', 'maxCost'],
  holds: ['league', 'market', 'period', 'when', 'maxHold'],
  parlay: ['league', 'market', 'when', 'book', 'legEv', 'maxOdds'],
  promo: ['book', 'market', 'when', 'minOdds'],
};
export const TOOL_FILTER_DEFAULTS = Object.freeze({
  league: '', market: '', period: 'all', when: 'all', book: '',
  minOdds: '', maxOdds: '', minEv: '', minProb: '', maxHold: '', minWidth: '', legEv: '', maxCost: '8',
  // Positive EV keeps its own shortest-price choice so it doesn't change the Promo filter.
  evMinOdds: '',
});
const STORE = 'sportslab-ev-tool-filters-v1';
const DAY = 86_400_000;

/** American odds → decimal (the shared conversion; kept under this name for the filters' callers). */
export const americanToDecimal = decimal;

/**
 * True when the event starts inside the window. Games that already started count toward
 * "Next 3 hours", "Today" and "Next 7 days". Prices without a start time only match "Any time".
 */
export function startsWithin(item, range, now = Date.now()) {
  if (!range || range === 'all') return true;
  const start = Date.parse(item?.startTime);
  if (!Number.isFinite(start)) return false;
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const today = day.getTime(), tomorrow = today + DAY;
  if (range === 'soon') return start <= now + 3 * 3_600_000 && start >= now - 6 * 3_600_000;
  if (range === 'today') return start >= today && start < tomorrow;
  if (range === 'tomorrow') return start >= tomorrow && start < tomorrow + DAY;
  if (range === 'week') return start <= now + 7 * DAY && start >= now - 6 * 3_600_000;
  return true;
}

/** Odds range in American odds, compared by payout so -110 counts as shorter than +100. */
export function oddsWithin(odds, min = '', max = '') {
  const price = americanToDecimal(odds);
  if (!Number.isFinite(price)) return false;
  if (min !== '' && min != null && price < americanToDecimal(min)) return false;
  if (max !== '' && max != null && price > americanToDecimal(max)) return false;
  return true;
}

/** Quote-level filters shared by every tool: league, market type, period, start window, book. */
export function quoteMatches(quote, filters = {}, now = Date.now()) {
  const f = { ...TOOL_FILTER_DEFAULTS, ...filters };
  if (f.league && (quote.league || quote.sport) !== f.league) return false;
  if (f.market && quote.type !== f.market) return false;
  if (f.period === 'live' && !quote.live || f.period === 'pregame' && quote.live) return false;
  if (!startsWithin(quote, f.when, now)) return false;
  if (f.book && quote.book !== f.book) return false;
  return true;
}

/** The member's Scope settings (league, market, side, game state, region, liquidity, odds range). */
export function passesFilters(quote, settings) {
  for (const field of ['league', 'market', 'side']) if (present(settings[field]) && name(settings[field]) !== 'all'
    && name(settings[field]) !== name(field === 'league' ? quote.league || quote.sport : quote[field])) return false;
  if (present(settings.gameStatus) && name(settings.gameStatus) !== 'all') {
    const wanted = name(settings.gameStatus), status = quote.live === true ? 'live' : 'pregame';
    const state = quote.gameState && typeof quote.gameState === 'object' ? quote.gameState : {};
    const inPlay = state.inPlay === true || quote.inPlay === true;
    const stopped = state.stoppage === true || quote.stoppage === true || state.inPlay === false;
    if (!(wanted === status || wanted === 'in' && status === 'live' || wanted === 'pre' && status === 'pregame'
      || wanted === 'in-play' && quote.live === true && inPlay && !stopped || wanted === 'stoppage' && quote.live === true && stopped && !inPlay)) return false;
  }
  if (present(settings.region) && name(settings.region) !== 'all') {
    const regions = Array.isArray(quote.regions) ? quote.regions : [quote.region || quote.state];
    if (!regions.some(region => name(region) === name(settings.region))) return false;
  }
  for (const [field, pass] of [['minOdds', value => number(quote.odds) >= value], ['maxOdds', value => number(quote.odds) <= value], ['minLiquidity', value => value === 0 || value > 0 && number(quote.liquidity) >= value]]) {
    if (present(settings[field]) && (!Number.isFinite(number(settings[field])) || !pass(number(settings[field])))) return false;
  }
  return true;
}

export function readToolFilters(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORE) || 'null');
    if (!saved || typeof saved !== 'object') return { ...TOOL_FILTER_DEFAULTS };
    return Object.fromEntries(Object.entries(TOOL_FILTER_DEFAULTS).map(([key, value]) => [key, typeof saved[key] === 'string' ? saved[key] : value]));
  } catch { return { ...TOOL_FILTER_DEFAULTS }; }
}
export function saveToolFilters(filters, storage = globalThis.localStorage) {
  try { storage?.setItem(STORE, JSON.stringify(filters)); } catch { /* Filters still apply for this visit. */ }
}
/** Count of filters that differ from their defaults, for the "Clear filters" label. */
export function activeFilterCount(filters, keys = Object.keys(TOOL_FILTER_DEFAULTS)) {
  return keys.filter(key => (filters[key] ?? '') !== TOOL_FILTER_DEFAULTS[key]).length;
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const select = (key, label, options, value, title = '') => `<label class="tool-filter"${title ? ` title="${esc(title)}"` : ''}><span>${esc(label)}</span><select data-tool-filter="${key}" aria-label="${esc(label)}">${options.map(([option, text]) => `<option value="${esc(option)}"${String(option) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;

/**
 * Filter bar markup for a tool. `quotes` supplies the leagues and sportsbooks that exist in the feed.
 * Returns '' for tools without shared filters.
 */
export function toolFilterBar(tool, filters, quotes = []) {
  const keys = TOOL_FILTERS[tool];
  if (!keys) return '';
  const leagues = [...new Set(quotes.map(q => q.league || q.sport).filter(Boolean))].sort();
  const books = [...new Set(quotes.map(q => q.book).filter(Boolean))].sort();
  const markets = tool === 'middles' ? [['', 'Totals & spreads'], ['total', 'Totals'], ['spread', 'Spreads']]
    : [['', 'All markets'], ['moneyline', 'Moneyline'], ['spread', 'Spreads'], ['total', 'Totals'], ['prop', 'Player props'], ['alternate', 'Alternates']];
  const controls = {
    league: () => select('league', 'League', [['', 'All leagues'], ...leagues.map(value => [value, value])], filters.league),
    market: () => select('market', 'Market', markets, filters.market),
    period: () => select('period', 'Period', PERIODS, filters.period),
    when: () => select('when', 'Starts', START_WINDOWS, filters.when, 'Event start time. Prices without a start time only show under Any time.'),
    book: () => select('book', tool === 'promo' ? 'Promo book' : 'Sportsbook', [['', tool === 'promo' ? 'Any book' : 'All books'], ...books.map(value => [value, value])], filters.book, tool === 'parlay' ? 'A parlay ticket uses one sportsbook.' : 'The sportsbook offering your promotion.'),
    minOdds: () => select('minOdds', 'Min odds', MIN_ODDS, filters.minOdds, 'Shortest price to include.'),
    maxOdds: () => select('maxOdds', 'Max leg odds', MAX_ODDS, filters.maxOdds),
    maxHold: () => select('maxHold', 'Max hold', MAX_HOLD, filters.maxHold, 'Combined margin of the best price on each side.'),
    minWidth: () => select('minWidth', 'Min window', MIN_WINDOW, filters.minWidth, 'Points between the two lines where both bets win.'),
    legEv: () => select('legEv', 'Leg EV', LEG_EV, filters.legEv),
    maxCost: () => select('maxCost', 'Max cost', MAX_COST, filters.maxCost, 'Combined margin of both bets. Lower means cheaper to try for the middle.'),
  };
  const count = activeFilterCount(filters, keys);
  return `<div class="tool-filter-bar" role="group" aria-label="Filters">${keys.map(key => controls[key]()).join('')}${count ? `<button type="button" class="tool-filter-clear" data-tool-filter-clear>Clear ${count} ${count === 1 ? 'filter' : 'filters'}</button>` : ''}</div>`;
}
