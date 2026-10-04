import { decimal } from './ev-core.js';
import { marketFairPrice, marketIdentity } from './ev-advanced-math.js';
import { boardIcon, bookLogo } from './ev-board.js?v=7';
import { leagueMark, teamLogo } from './sports-identity.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const chevron = svg('<path d="m8 10 4 4 4-4"/>');
const searchIcon = svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>');
const layers = svg('<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>');
const settingsIcon = svg('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--os-panel)"/><circle cx="15" cy="17" r="3" fill="var(--os-panel)"/>');
const expandIcon = svg('<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6m0 6 6-6"/>');
const normalizedLine = q => q.line === '' || q.line == null ? '' : q.type === 'spread' && ['home','away'].includes(q.side) ? (q.side === 'away' ? -Number(q.line) : Number(q.line)) : (q.type === 'spread' || q.type === 'alternate' && !/^(over|under)$/i.test(q.side)) ? Math.abs(Number(q.line)) : Number.isFinite(Number(q.line)) ? Number(q.line) : q.line;
const unavailablePrice = quote => Boolean(quote.suspended) || ['suspended','closed','unavailable'].includes(String(quote.status || '').toLowerCase());
// A posted price is current while it is younger than the member's pregame/live maximum age (15 min /
// 90 s by default) and not suspended. A missing prop line or unknown exchange depth doesn't make it stale.
const maximumAge = (quote, settings) => { const seconds = Number(quote.live ? settings?.liveMaxAgeSeconds : settings?.pregameMaxAgeSeconds); return seconds > 0 ? seconds : quote.live ? 90 : 900; };
// One check per quote per render pass (same timestamp and settings).
const currentCache = new WeakMap();
const currentPrice = (quote, now = Date.now(), settings = {}) => {
  const cached = currentCache.get(quote);
  if (cached && cached[0] === now && cached[1] === settings) return cached[2];
  const observed = Date.parse(quote.ts);
  // A stamp a few seconds ahead is clock skew, as in quoteAvailable.
  const value = !unavailablePrice(quote) && Number.isFinite(observed) && observed <= now + 5000 && now - observed <= maximumAge(quote, settings) * 1000;
  currentCache.set(quote, [now, settings, value]);
  return value;
};
// Exact market identity (line and side coordinate), cached per quote: building it is the costly part.
const identityCache = new WeakMap();
const identity = quote => { let key = identityCache.get(quote); if (key === undefined) { key = marketIdentity(quote); identityCache.set(quote, key); } return key; };
// Best and average skip prices that can't be taken at face value: a side the feed couldn't verify that its
// book doesn't pair with the other side, or a price more than 10 points (implied) longer than the median
// of the other books at the same line (mirrors of one platform count once).
const OUTLIER_POINTS = 0.10;
function junkPrice(q, quotes, now, settings) {
  const same = quotes.filter(o => o !== q && identity(o) === identity(q) && currentPrice(o, now, settings));
  if (q.sideVerified === false && !same.some(o => o.book === q.book && o.side !== q.side)) return true;
  const family = o => String(o.priceFamily || o.book).toLowerCase(), families = new Map();
  for (const o of same) if (o.side === q.side && o.book !== q.book && !families.has(family(o))) families.set(family(o), 1 / decimal(o.odds));
  const implied = [...families.values()].filter(Number.isFinite).sort((a,b) => a - b), middle = implied.length >> 1;
  if (!implied.length) return false;
  const median = implied.length % 2 ? implied[middle] : (implied[middle - 1] + implied[middle]) / 2;
  return median - 1 / decimal(q.odds) > OUTLIER_POINTS;
}
const ODDS_FORMATS = ['american','decimal','fractional'];
// Decimal payout → the member's odds format, written as suite.displayOdds writes it. American comes
// straight from the payout, so even money stays +100.
const formatPrice = (value, format) => {
  if (value == null || !(value > 1)) return '—';
  if (format === 'decimal') return value.toFixed(3);
  if (format === 'fractional') return `${(value - 1).toFixed(2)}/1`;
  const american = value >= 2 ? Math.round((value - 1) * 100) : Math.round(-100 / (value - 1));
  return american > 0 ? `+${american}` : String(american);
};
const marketName = q => q.displayMarket || (q.player ? q.market.replace(q.player,'').trim() : q.market);
// Props compare by the feed's market id (event + normalized stat), so books' names for one stat ("Rec Yards",
// "Receiving Yards") share a row; tabs and the market filter use the stat across games.
const statCache = new WeakMap();
const propStat = q => {
  let stat = statCache.get(q);
  if (stat === undefined) { stat = isProp(q) && /^prop\|/.test(q.marketId || '') ? String(q.marketId).split('|').slice(2).join('|') : ''; statCache.set(q, stat); }
  return stat;
};
const marketGroup = q => propStat(q) ? q.marketId : marketName(q).toLowerCase();
const marketTab = q => propStat(q) ? `prop:${propStat(q)}` : marketName(q);
const trendIcon = svg('<path d="m3 16 5.5-5.5 4 4L21 6"/><path d="M15 6h6v6"/>');
const lockIcon = svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
const MAIN_TYPES = new Set(['moneyline','three-way','spread','total']);
const typeRank = q => ({moneyline:0,'three-way':0,spread:1,total:2,prop:3,alternate:4})[q.type] ?? 5;
const isMain = q => MAIN_TYPES.has(q.type) && !q.player && !q.alt;
const isProp = q => !isMain(q) && q.type !== 'alternate' && (q.type === 'prop' || Boolean(q.player));
// Market tabs: grouped views first, then each market by name. Group values share the market filter.
const ALL_MARKETS = 'group:all';
const isAlternate = q => q.type === 'alternate' || Boolean(q.alt);
const MARKET_GROUPS = [['group:main','Main markets',isMain],['group:props','Player props',isProp],['group:alt','Alternate lines',isAlternate]];
const matchesMarket = (q, value) => {
  if (!value || value === ALL_MARKETS) return true;
  const group = MARKET_GROUPS.find(([key]) => key === value);
  return group ? group[2](q) : marketTab(q) === value;
};
const signedSpread = q => q.type === 'spread' || q.type === 'alternate' && !/^(over|under)$/i.test(q.side);
const lineLabel = q => {
  if (q.line === '' || q.line == null) return '';
  const n = Number(q.line);
  return !Number.isFinite(n) ? String(q.line) : signedSpread(q) && n > 0 ? `+${n}` : String(n);
};
const kickoff = q => {
  const at = Date.parse(q.startTime);
  if (!Number.isFinite(at)) return q.displayTime || '';
  const date = new Date(at);
  return `${date.getMonth() + 1}/${date.getDate()} · ${date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
};
const eventTeams = q => String(q.displayEvent || '').split(/\s+(?:@|vs\.?|v)\s+/i).filter(Boolean);
// Team sides get the team logo (or a code chip); totals and props get a compact side chip.
const sideMark = (q, side) => {
  const team = eventTeams(q).includes(side) || side === q.team ? side : q.player && q.team ? q.team : '';
  if (!team) return `<span class="os-mark is-side" aria-hidden="true">${/^draw$/i.test(side) ? 'X' : esc(String(side).slice(0,1).toUpperCase())}</span>`;
  const logo = teamLogo({sport:String(q.sport || '').toLowerCase(),team});
  return logo ? `<span class="os-mark is-logo" aria-hidden="true"><img src="${esc(logo)}" alt="" width="22" height="22" loading="lazy" decoding="async"></span>` : `<span class="os-mark" aria-hidden="true">${esc(String(team).replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase())}</span>`;
};
const observedAge = value => {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed)) return 'Unknown';
  const seconds = Math.max(0,Math.floor(elapsed / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
};

// Lines stay separate: a better payout at a different threshold is not the same bet.
// `settings` are the member's fair-value settings (price ages).
export function buildOddsBoard(records, books, now = Date.now(), settings = {}) {
  const events = new Map();
  for (const q of records) {
    if (!q.event || !q.market || !q.side || !books.includes(q.book) || q.depthOnly || (!Number.isFinite(decimal(q.odds)) && !unavailablePrice(q))) continue;
    // Books name one game differently; feed quotes share an eventId across books.
    const eventKey = JSON.stringify([q.sport, q.eventId || q.event, Boolean(q.live)]);
    const marketKey = JSON.stringify([q.type, marketGroup(q), q.player || '', normalizedLine(q), q.period || 'full']);
    if (!events.has(eventKey)) events.set(eventKey, { key:eventKey, first:q, start:Infinity, markets:new Map() });
    const event = events.get(eventKey), starts = Date.parse(q.startTime);
    if (starts < event.start) event.start = starts;
    if (!event.markets.has(marketKey)) event.markets.set(marketKey, { key:eventKey + marketKey, first:q, latest:new Map() });
    const market = event.markets.get(marketKey);
    const key = JSON.stringify([q.book, q.side]);
    const prior = market.latest.get(key);
    if (!prior || (Date.parse(q.ts) || 0) >= (Date.parse(prior.ts) || 0)) market.latest.set(key, q);
  }
  return [...events.values()].map(event => ({...event, markets:[...event.markets.values()].map(market => {
    const quotes = [...market.latest.values()];
    // Over/Yes first; team sides follow the event's away @ home order, then alphabetical (Draw last).
    const order = String(market.first.displayEvent || market.first.event || '');
    const position = side => { const fixed = {away:0, home:1, draw:2}[side]; if (fixed != null) return fixed; const index = order.indexOf(side); return index < 0 ? Infinity : index; };
    const sides = [...new Set(quotes.map(q => q.side))].sort((a,b) => /^(over|yes)$/i.test(a) ? -1 : /^(over|yes)$/i.test(b) ? 1 : (position(a) - position(b)) || a.localeCompare(b));
    return {...market, sides:sides.map(side => {
      const prices = quotes.filter(q => q.side === side);
      const offered = prices.filter(q => currentPrice(q, now, settings) && !junkPrice(q, quotes, now, settings));
      const bestDecimal = offered.length ? Math.max(...offered.map(q => decimal(q.odds))) : null;
      return {side, prices, offered, best:offered.find(q => decimal(q.odds) === bestDecimal), bestDecimal, average:offered.length ? offered.reduce((sum,q) => sum + decimal(q.odds),0) / offered.length : null};
    })};
  })}));
}

// getSettings returns the member's +EV settings (suite.settings()): price ages, fair-value method and
// book rules, and the workspace odds format. getQuotes are the prices to show (the member's state
// applied); getReferenceQuotes are every book's prices, which the fair column is priced from.
export function createOddsScreen({ getQuotes, getReferenceQuotes = getQuotes, brandMark, onSport, redraw, storage, defaultFormat = 'american', getSettings = () => ({}), getSportsbookState = () => '', onAllSportsbooks = () => {} }) {
  // marketFilter: null = default tab (Main markets when present), '' = All markets, else a group or market name.
  // chosenFormat is a format picked on this screen; otherwise prices follow the member's workspace odds format.
  let eventFilter = '', marketFilter = null, query = '', chosenFormat = null, expanded = false;
  const memberSettings = () => { try { const value = getSettings(); return value && typeof value === 'object' ? value : {}; } catch { return {}; } };
  const oddsFormat = () => chosenFormat || [memberSettings().oddsFormat, defaultFormat].find(value => ODDS_FORMATS.includes(value)) || 'american';
  // A full slate is thousands of rows; show games in pages.
  const EVENT_PAGE = 25;
  let eventLimit = EVENT_PAGE;
  let settingsOpen = false, hiddenBooks = new Set();
  let bookOrder = [];
  let visibleBookOrder = [];
  try {
    const saved = JSON.parse(storage?.getItem('sportslab-odds-display-v1') || 'null');
    if (saved) {
      // Older saves stored the format with every change, so only an explicit choice overrides the member's.
      if (saved.formatChosen === true && ODDS_FORMATS.includes(saved.format)) chosenFormat = saved.format;
      for (const [key,value] of Object.entries(saved)) if (typeof value === 'string') {
        if (key === 'event') eventFilter = value;
        if (key === 'market') marketFilter = value || null;
        if (key === 'query') query = value;
      }
      hiddenBooks = new Set(Array.isArray(saved.hiddenBooks) ? saved.hiddenBooks.filter(book => typeof book === 'string') : []);
      bookOrder = Array.isArray(saved.bookOrder) ? [...new Set(saved.bookOrder.filter(book => typeof book === 'string'))] : [];
    }
  } catch { /* A damaged preference must never prevent prices from rendering. */ }
  const save = () => { try { storage?.setItem('sportslab-odds-display-v1',JSON.stringify({...(chosenFormat ? {format:chosenFormat,formatChosen:true} : {}),event:eventFilter,market:marketFilter,query,hiddenBooks:[...hiddenBooks],bookOrder})); } catch { /* Current-session controls remain usable. */ } };
  const collapsed = new Set();
  const initializedEvents = new Set();
  let lastGroups = [];
  let lastDataSignature = '', lastSport = '';
  // One clock, settings snapshot and odds format per render pass.
  let renderNow = Date.now(), renderSettings = {}, renderFormat = 'american';
  const dataSignature = (records, now = Date.now(), settings = memberSettings()) => JSON.stringify(records.map(q => [q.id,q.sport,q.event,q.market,q.player,q.period,q.line,q.book,q.side,q.odds,q.status,q.suspended,Boolean(q.live),currentPrice(q, now, settings),q.displayTime,q.startTime,q.limit]));
  const price = value => formatPrice(value, renderFormat);
  const select = (key, label, options, value) => `<label class="os-field"><span class="os-field-label">${label}</span><select id="os-${key}" data-os-filter="${key}" aria-label="${label}">${options.map(([v,text]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  // One grid cell per book: lime outline for the best current price, muted red for the worst.
  const bookCell = (q, row, rowLine) => {
    if (!q) return '<td class="os-book-cell is-missing"><span class="os-px" aria-label="No price">—</span></td>';
    if (unavailablePrice(q)) return `<td class="os-book-cell is-locked" title="${esc(q.book)} · suspended"><span class="os-px">${lockIcon}<span class="os-sr">Suspended</span></span></td>`;
    const stale = !currentPrice(q, renderNow, renderSettings), value = decimal(q.odds);
    const cls = stale ? ' is-stale' : value === row.bestDecimal ? ' is-best' : value === row.worstDecimal ? ' is-worst' : '';
    // Spread sides are grouped by absolute line, so show the signed line when a book differs from the row.
    const line = String(q.line ?? '') !== String(rowLine ?? '') ? `<small>${esc(lineLabel(q))}</small>` : '';
    return `<td class="os-book-cell${cls}"${stale ? '' : ` data-open-quote="${esc(q.id)}"`} title="${esc(q.book)} · ${stale ? q.live ? 'stale live price' : 'Not currently offered' : price(value)}"><span class="os-px">${line}<b>${price(value)}</b></span></td>`;
  };
  // Keep the grid's own scroll position across redraws (collapse, settings, data refresh).
  const redrawKeeping = (resetTop = false) => {
    const wrap = document.querySelector('.os-grid-wrap'), left = wrap?.scrollLeft || 0, top = resetTop ? 0 : wrap?.scrollTop || 0;
    redraw();
    const next = document.querySelector('.os-grid-wrap');
    if (next) {next.scrollLeft = left;next.scrollTop = top;}
  };
  function render({ sport = '' } = {}) {
    const all = getQuotes().filter(q => !q.depthOnly);
    const sports = [...new Set(['NFL','MLB','NBA','WNBA','NHL','Soccer',...all.map(q => q.sport).filter(Boolean)])];
    const leagueQuotes = all.filter(q => !sport || !q.sport || q.sport === sport);
    // Refresh compares only the displayed league, so other sports never force a redraw.
    renderNow = Date.now();renderSettings = memberSettings();renderFormat = oddsFormat();lastSport = sport;lastDataSignature = dataSignature(leagueQuotes, renderNow, renderSettings);
    const eventNames = new Map();
    for (const q of leagueQuotes) { const key = q.eventId || q.event; if (!eventNames.has(key)) eventNames.set(key, q.displayEvent || q.event); }
    const events = [...eventNames.keys()].sort((a,b) => eventNames.get(a).localeCompare(eventNames.get(b)));
    // A prop stat's tab carries the name most books give it.
    const propLabels = new Map();
    for (const q of leagueQuotes) if (propStat(q)) { const key = marketTab(q), counts = propLabels.get(key) || new Map(); counts.set(marketName(q), (counts.get(marketName(q)) || 0) + 1); propLabels.set(key, counts); }
    const tabLabels = new Map([...propLabels].map(([key,counts]) => [key,[...counts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
    const tabLabel = key => tabLabels.get(key) ?? key;
    const markets = [...new Set(leagueQuotes.map(marketTab))].filter(Boolean).sort((a,b) => tabLabel(a).localeCompare(tabLabel(b)));
    if (!events.includes(eventFilter)) eventFilter = '';
    const leagueGroups = MARKET_GROUPS.filter(([,,test]) => leagueQuotes.some(test));
    if (marketFilter && marketFilter !== ALL_MARKETS && !markets.includes(marketFilter) && !leagueGroups.some(([key]) => key === marketFilter)) marketFilter = null;
    const market = marketFilter ?? (leagueGroups.some(([key]) => key === 'group:main') ? 'group:main' : ALL_MARKETS);
    // Tabs list the market groups present for the selected league and event.
    const scopeNames = new Map();
    for (const q of leagueQuotes) if ((!eventFilter || (q.eventId || q.event) === eventFilter) && marketTab(q) && !scopeNames.has(marketTab(q))) scopeNames.set(marketTab(q), q);
    const scoped = [...scopeNames.values()], names = test => [...scopeNames].filter(([,q]) => test(q)).sort(([a,x],[b,y]) => typeRank(x) - typeRank(y) || tabLabel(a).localeCompare(tabLabel(b))).map(([key]) => [key,tabLabel(key)]);
    const tabs = [[ALL_MARKETS,'All markets'],
      ...(scoped.some(isMain) ? [['group:main','Main markets'],...names(isMain)] : []),
      ...(scoped.some(isProp) ? [['group:props','Player props'],...names(isProp)] : []),
      // Alternate lines share market names with main lines, so check every quote, not one per name.
      ...(leagueQuotes.some(q => (!eventFilter || (q.eventId || q.event) === eventFilter) && isAlternate(q)) ? [['group:alt','Alternate lines']] : []),
      ...names(q => !isMain(q) && !isProp(q) && !isAlternate(q))];
    const presentBooks = [...new Set(leagueQuotes.map(q => q.book).filter(Boolean))];
    bookOrder = [...bookOrder,...presentBooks.filter(book => !bookOrder.includes(book))];
    const availableBooks = bookOrder.filter(book => presentBooks.includes(book));
    visibleBookOrder = availableBooks;
    const stateFilter = getSportsbookState();
    const allBooksSelected = !stateFilter && availableBooks.every(book => !hiddenBooks.has(book));
    const filtered = leagueQuotes.filter(q => (!eventFilter || (q.eventId || q.event) === eventFilter) && matchesMarket(q, market) && (!query || [q.player,q.displayEvent,q.event,q.selection,q.market,q.book,q.sport,q.league].some(value => String(value || '').toLowerCase().includes(query.toLowerCase().trim()))));
    const present = new Set(filtered.map(q => q.book));
    const books = availableBooks.filter(book => present.has(book) && !hiddenBooks.has(book));
    // Live games first, then by start time (unknown last).
    const allGroups = buildOddsBoard(filtered, books, renderNow, renderSettings).sort((a,b) => Number(Boolean(b.first.live)) - Number(Boolean(a.first.live)) || a.start - b.start || String(a.first.displayEvent || a.first.event).localeCompare(String(b.first.displayEvent || b.first.event)));
    const groups = allGroups.slice(0, eventLimit);
    // A full slate stays available without mounting thousands of offscreen rows: large demo
    // views (all markets, props) open the first game only; main-market slates open every game.
    // Alternate-line ladders reach 150+ rows per game, so large views open with the first game only.
    const heavy = groups.reduce((n,event) => n + event.markets.reduce((sum,m) => sum + m.sides.length,0),0) > 400;
    groups.forEach((event,index) => {
      if (initializedEvents.has(event.key)) return;
      initializedEvents.add(event.key);
      if (index > 0 && !eventFilter && heavy) collapsed.add(event.key);
    });
    lastGroups = groups.map(event => event.key);
    // One grid: a tbody per game, one row per selection, one column per visible sportsbook.
    // The first cell of each game carries its start time and collapse toggle; later rows leave it
    // blank so every row keeps the same cell count (inline analysis rows span them all).
    const columns = 4 + books.length;
    // Fair value is priced from every current book at the line, as the +EV tools price it: the member's
    // state and hidden columns limit which prices are shown, not the consensus.
    const references = new Map();
    for (const quote of getReferenceQuotes()) {
      if (quote.depthOnly || (sport && quote.sport && quote.sport !== sport) || !currentPrice(quote, renderNow, renderSettings)) continue;
      const key = identity(quote);
      if (!references.has(key)) references.set(key, []);
      references.get(key).push(quote);
    }
    const rows = groups.map(event => {
      const q = event.first;
      const sportKey = String(q.sport || '').toLowerCase();
      const isCollapsed = collapsed.has(event.key);
      const marketCount = `${event.markets.length} ${event.markets.length === 1 ? 'market' : 'markets'}`;
      const league = !sport && q.sport ? `<span class="os-league" title="${esc(q.sport)}">${leagueMark(sportKey) || ''}</span>` : '';
      const heading = `<th scope="rowgroup" class="os-c-time"><div class="os-event-heading"><button type="button" class="os-toggle" data-os-toggle="${esc(event.key)}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${esc(q.event)}" title="${isCollapsed ? 'Show' : 'Hide'} ${esc(marketCount)}">${chevron}</button><span class="os-when">${q.live ? '<span class="os-live-pill">Live</span>' : `<strong>${esc(kickoff(q))}</strong>`}<small title="${esc(q.event)}">${league}${esc(q.displayEvent || q.event)}</small><span class="os-event-count">${esc(marketCount)}</span></span></div></th>`;
      if (isCollapsed) return `<tbody class="os-event-group is-collapsed"><tr class="os-row is-game-start">${heading}<td class="os-collapsed-cell" colspan="${columns - 1}"><button type="button" class="os-collapsed-summary" data-os-toggle="${esc(event.key)}" tabindex="-1"><strong>${esc(q.displayEvent || q.event)}</strong><span>${esc(marketCount)} · Show prices</span></button></td></tr></tbody>`;
      let rowIndex = 0;
      const markets = [...event.markets].sort((a,b) => typeRank(a.first) - typeRank(b.first) || (Number(normalizedLine(a.first)) || 0) - (Number(normalizedLine(b.first)) || 0)).map(market => {
        const q = market.first;
        const marketLabel = [marketName(q),q.period && q.period !== 'full' ? q.displayPeriod || q.period : ''].filter(Boolean).join(' · ');
        const currentQuotes = market.sides.flatMap(row => row.prices.filter(quote => currentPrice(quote, renderNow, renderSettings)));
        const sides = market.sides.map(row => {
          const current = currentQuotes.filter(quote => quote.side === row.side).sort((a,b) => decimal(b.odds) - decimal(a.odds));
          const reference = row.best || row.prices[0], worst = current.length >= 3 ? decimal(current.at(-1).odds) : null;
          // No-vig fair from the member's fair-value settings, as the +EV tools price it: complete current
          // books at this exact line, mirrors once, sharp weights, their devig method. A market missing an
          // outcome (two of a 1X2's three) has none.
          const anchor = row.best || current[0];
          const fair = anchor ? marketFairPrice(anchor, references.get(identity(anchor)) || [], renderSettings).probability : NaN;
          return {...row, current, reference, fair, key:JSON.stringify([market.key,row.side]),
            worstDecimal:worst != null && worst < row.bestDecimal ? worst : null,
            name:reference?.selection || row.side,
            selection:[q.player,reference?.selection || row.side,reference ? lineLabel({...reference,side:row.side}) : ''].filter(Boolean).join(' ')};
        });
        return sides.map((row,sideIndex) => {
          // A row whose only current prices are excluded from best (unverified or outlying) still opens its comparison.
          const best = row.best, target = best || row.current[0], index = rowIndex++;
          const open = target ? ` data-open-quote="${esc(target.id)}"` : '';
          const byBook = new Map(row.prices.map(quote => [quote.book,quote]));
          const time = index === 0 ? heading : '<td class="os-c-time"></td>';
          const averageTitle = `Average of ${row.offered.length} current ${row.offered.length === 1 ? 'price' : 'prices'} at this line${Number.isFinite(row.fair) ? ` · no-vig fair ${price(1 / row.fair)}` : ''}`;
          const tools = `${best && !best.demo ? `<button type="button" class="os-icon" data-suite-action="track" data-id="${esc(best.id)}" aria-label="Track ${esc(row.selection)} at ${esc(best.book)}" title="Track best price">${boardIcon('track',14)}</button>` : ''}${row.reference ? `<button type="button" class="os-icon" data-line-history="${esc(row.reference.id)}" aria-label="Line history for ${esc(row.selection)}" title="Line history">${trendIcon}</button>` : ''}`;
          return `<tr class="os-row${index === 0 ? ' is-game-start' : ''}${sideIndex === 0 && index > 0 ? ' is-market-start' : ''}${target ? '' : ' is-stale'}" data-os-row="${esc(row.key)}">${time}
            <td class="os-selection"${open}><div class="os-sel">${sideMark({...q,displayEvent:q.displayEvent || q.event},row.name)}<span class="os-sel-copy">${target ? `<button type="button" class="os-sel-name" data-detail="${esc(target.id)}" aria-expanded="false" aria-label="Compare prices and analysis for ${esc(row.selection)}">${esc(row.selection)}</button>` : `<strong>${esc(row.selection)}</strong>`}<small>${esc(marketLabel)}${q.live ? ' · <em>Live</em>' : ''}</small></span><span class="os-row-tools">${tools}</span></div></td>
            <td class="os-best-cell"${open}>${best ? `<span class="os-best"><strong>${price(row.bestDecimal)}</strong><span class="os-best-logo" title="${esc(best.book)}">${bookLogo(best.book,18)}</span></span><span class="os-sr"> at ${esc(best.book)}</span>` : `<strong>—</strong><span class="os-sr">${row.current.length ? 'No verified current price' : 'No current price'}</span>`}</td>
            <td class="os-average"${open} title="${esc(averageTitle)}"><strong>${price(row.average)}</strong></td>
            ${books.map(book => bookCell(byBook.get(book), row, row.reference?.line)).join('')}
          </tr>`;
        }).join('');
      }).join('');
      return `<tbody class="os-event-group">${markets}</tbody>`;
    }).join('');
    const newest = filtered.reduce((latest,q) => (Date.parse(q.ts) || 0) > (Date.parse(latest?.ts) || 0) ? q : latest, null);
    const count = groups.reduce((n,event) => n + event.markets.length,0);
    const fromFeed = filtered.some(q => q.source === 'local-api');
    return `<section class="os-screen evb-board${expanded ? ' os-wide' : ''}" aria-label="Sportsbook odds comparison">
      <div class="os-panel">
      <div class="os-toolbar">
        <div class="os-filterbar" role="search" aria-label="Filter odds">
          ${select('sport','League',[['','All leagues'],...sports.map(v => [v,v])],sport)}
          ${select('event','Event',[['','All events'],...events.map(v => [v,eventNames.get(v)])],eventFilter)}
          ${select('market','Market',[[ALL_MARKETS,'All markets'],...leagueGroups.map(([key,label]) => [key,label]),...markets.map(v => [v,tabLabel(v)])],market)}
          <label class="os-field os-search">${searchIcon}<span>Player</span><input id="os-search" type="search" aria-label="Search players, teams, leagues or markets" placeholder="Player, team or market" value="${esc(query)}" autocomplete="off"></label>
        </div>
        <div class="os-toolbar-actions"><div class="os-settings"><button type="button" class="os-round" data-os-action="settings" aria-expanded="${settingsOpen}" aria-controls="os-settings-panel" aria-label="Odds screen settings">${settingsIcon}</button>
          <div id="os-settings-panel" class="os-settings-panel" ${settingsOpen ? '' : 'hidden'}><div class="os-settings-heading"><strong>Display settings</strong><button type="button" data-os-action="settings" aria-label="Close odds settings">Close</button></div>${select('format','Odds format',[['american','American'],['decimal','Decimal'],['fractional','Fractional']],renderFormat)}<button type="button" class="os-all-books" data-os-action="all-books">All sportsbooks<span>${allBooksSelected ? 'Selected' : 'Show all'}</span></button>${stateFilter ? `<p class="os-book-scope">Filtered to ${esc(stateFilter)}. Choose all sportsbooks to compare across states.</p>` : ''}<fieldset><legend>Sportsbook columns</legend>${availableBooks.length ? availableBooks.map((book,index) => `<div class="os-book-option"><label><input type="checkbox" data-os-book="${esc(book)}" ${hiddenBooks.has(book) ? '' : 'checked'}>${brandMark(book)}<span>${esc(book)}</span></label><button type="button" data-os-order="${esc(book)}" data-os-direction="-1" aria-label="Move ${esc(book)} earlier" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-os-order="${esc(book)}" data-os-direction="1" aria-label="Move ${esc(book)} later" ${index === availableBooks.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('') : '<p>Sportsbooks appear here once the quote API syncs.</p>'}</fieldset></div>
        </div><button type="button" class="os-round" data-os-action="expand" aria-pressed="${expanded}" aria-label="${expanded ? 'Exit expanded view' : 'Expand odds screen'}">${expandIcon}</button></div>
      </div>
      ${tabs.length > 2 ? `<div class="os-tabs-wrap"><button type="button" class="os-tabs-scroll" data-os-scroll="-1" aria-label="Scroll market groups left" tabindex="-1" disabled>${chevron}</button><div class="os-tabs" role="toolbar" aria-label="Market groups">${tabs.map(([value,label]) => `<button type="button" class="os-tab" data-os-tab="${esc(value)}" aria-pressed="${value === market}">${esc(label)}</button>`).join('')}</div><button type="button" class="os-tabs-scroll" data-os-scroll="1" aria-label="Scroll market groups right" tabindex="-1">${chevron}</button></div>` : ''}
      <div class="os-board-meta"><p><span class="os-status-dot"></span><strong>${fromFeed ? 'Feed prices' : 'Entered prices'}</strong><span class="os-meta-separator">·</span>${allGroups.length} ${allGroups.length === 1 ? 'event' : 'events'}<span class="os-meta-separator">·</span>${count} ${count === 1 ? 'market' : 'markets'}<span class="os-meta-separator">·</span>${books.length} ${books.length === 1 ? 'book' : 'books'}${newest ? `<span class="os-meta-separator">·</span><span>Updated <span data-os-age="${esc(newest.id)}">${observedAge(newest.ts)}</span></span>` : ''}</p><div class="os-board-actions">${groups.length ? `<button type="button" data-os-action="rows" class="os-rows" aria-label="${lastGroups.every(key => collapsed.has(key)) ? 'Expand all events' : 'Collapse all events'}">${lastGroups.every(key => collapsed.has(key)) ? 'Expand all' : 'Collapse all'} ${chevron}</button>` : ''}<button type="button" data-os-action="reset" class="os-reset">Reset filters</button></div></div>
      </div>
      ${groups.length ? `<div class="os-grid-wrap" tabindex="0" role="region" aria-label="Odds grid. Scroll horizontally to see every sportsbook."><table class="os-grid" style="--os-books:${books.length}" aria-label="Sportsbook prices by game"><thead><tr><th scope="col" class="os-c-time">Time</th><th scope="col" class="os-selection">Team / selection</th><th scope="col" class="os-best-cell">Best odds</th><th scope="col" class="os-average" title="Average of current prices at the same line">Avg odds</th>${books.map(book => `<th scope="col" class="os-book-head" title="${esc(book)}"><span class="os-book-logo">${bookLogo(book,26)}</span><span class="os-sr">${esc(book)}</span></th>`).join('')}</tr></thead>${rows}</table></div>${allGroups.length > groups.length ? `<button type="button" class="os-more" data-os-action="more">Show ${Math.min(EVENT_PAGE, allGroups.length - groups.length)} more games · ${allGroups.length - groups.length} not shown</button>` : ''}` : `<div class="os-empty"><div>${layers}</div><h2>${all.length ? 'No matching prices' : 'Waiting for prices'}</h2><p>${all.length ? 'Try a different market, league or player, or show more sportsbook columns in settings.' : 'The odds board fills in once the quote API syncs.'}</p>${all.length ? '<button type="button" data-os-action="reset">Clear filters</button>' : ''}</div>`}
      <p class="os-footnote">The best price in each row is outlined in lime and the lowest is tinted red; the average uses current books at the same line (hover it for the consensus no-vig fair price). Prices at different lines are compared separately. Click a row or price for the full comparison. ${filtered.some(q => q.live && !unavailablePrice(q) && !currentPrice(q, renderNow, renderSettings)) ? 'Faded live prices are stale and excluded from best and average. ' : ''}${filtered.some(q => !q.live && !unavailablePrice(q) && !currentPrice(q, renderNow, renderSettings)) ? 'Faded pregame prices are not currently offered. ' : ''}${filtered.some(q => q.live) ? '' : 'The feed has no live prices right now.'}</p>
    </section>`;
  }
  function restore(selector) { document.querySelector(selector)?.focus({preventScroll:true}); }
  function click(event) {
    // Line history, price-comparison ([data-detail] / [data-open-quote]) and track controls belong to the host.
    if (event.target.closest('[data-line-history]')) return false;
    const target = event.target.closest('[data-os-action],[data-os-toggle],[data-os-order],[data-os-tab],[data-os-scroll]');
    if (!target) return false;
    if (target.dataset.osScroll) { target.parentElement.querySelector('.os-tabs')?.scrollBy({left:Number(target.dataset.osScroll) * 260,behavior:'smooth'}); return true; }
    if ('osTab' in target.dataset) {
      const value = target.dataset.osTab;
      marketFilter = value;collapsed.clear();initializedEvents.clear();
      save();redrawKeeping(true);
      [...document.querySelectorAll('[data-os-tab]')].find(node => node.dataset.osTab === value)?.focus({preventScroll:true});
      return true;
    }
    if (target.dataset.osOrder) {
      const index = bookOrder.indexOf(target.dataset.osOrder), nextBook = visibleBookOrder[visibleBookOrder.indexOf(target.dataset.osOrder) + Number(target.dataset.osDirection)], next = bookOrder.indexOf(nextBook);
      if (index >= 0 && next >= 0 && next < bookOrder.length) [bookOrder[index],bookOrder[next]] = [bookOrder[next],bookOrder[index]];
      save();redrawKeeping();
      [...document.querySelectorAll('[data-os-order]')].find(node => node.dataset.osOrder === target.dataset.osOrder && node.dataset.osDirection === target.dataset.osDirection)?.focus({preventScroll:true});
      return true;
    }
    const key = target.dataset.osToggle;
    if (key) {
      collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
      redrawKeeping();
      [...document.querySelectorAll('[data-os-toggle]')].find(node => node.dataset.osToggle === key)?.focus({preventScroll:true});
      return true;
    }
    const action = target.dataset.osAction;
    if (action === 'settings') settingsOpen = !settingsOpen;
    if (action === 'all-books') {hiddenBooks.clear();onAllSportsbooks();}
    if (action === 'expand') expanded = !expanded;
    if (action === 'more') { eventLimit += EVENT_PAGE; redrawKeeping(); return true; }
    if (action === 'rows') {const close = !lastGroups.every(key => collapsed.has(key));lastGroups.forEach(key => close ? collapsed.add(key) : collapsed.delete(key));}
    if (action === 'reset') {eventFilter = '';marketFilter = null;query = '';hiddenBooks.clear();collapsed.clear();initializedEvents.clear();eventLimit = EVENT_PAGE;}
    save();redrawKeeping(action === 'reset');restore(`[data-os-action="${action}"]`);return true;
  }
  function change(event) {
    const target = event.target;
    if (target.dataset.osBook) {
      target.checked ? hiddenBooks.delete(target.dataset.osBook) : hiddenBooks.add(target.dataset.osBook);
      save();redrawKeeping();[...document.querySelectorAll('[data-os-book]')].find(node => node.dataset.osBook === target.dataset.osBook)?.focus();return true;
    }
    const key = target.dataset.osFilter;
    if (!key) return false;
    if (key !== 'format') eventLimit = EVENT_PAGE;
    if (key === 'sport') {eventFilter = '';marketFilter = null;query = '';collapsed.clear();initializedEvents.clear();onSport(target.value);}
    if (key === 'event') {eventFilter = target.value;collapsed.clear();initializedEvents.clear();}
    if (key === 'market') {marketFilter = target.value;collapsed.clear();initializedEvents.clear();}
    if (key === 'format' && ODDS_FORMATS.includes(target.value)) chosenFormat = target.value;
    save();redrawKeeping(key !== 'format');queueMicrotask(() => restore(`[data-control="os-${key}"] .td-choice-trigger`));return true;
  }
  function input(event) {
    if (event.target.id !== 'os-search') return false;
    const position = event.target.selectionStart;
    query = event.target.value;collapsed.clear();initializedEvents.clear();eventLimit = EVENT_PAGE;save();redraw();
    const field = document.querySelector('#os-search');field?.focus();field?.setSelectionRange(position,position);return true;
  }
  function keydown(event) {
    if (event.key !== 'Escape' || (!expanded && !settingsOpen)) return;
    expanded = false;settingsOpen = false;redraw();restore('[data-os-action="settings"]');
  }
  function refresh() {
    if (settingsOpen || document.activeElement?.closest('.os-screen') || document.querySelector('.os-screen [aria-expanded="true"][aria-haspopup]')) return;
    const records = getQuotes().filter(q => !q.depthOnly && (!lastSport || !q.sport || q.sport === lastSport));
    // Unchanged prices (or an open inline comparison the user is reading) only refresh ages in place.
    if (dataSignature(records) === lastDataSignature || document.querySelector('.os-screen .bet-inline-mount')) {
      const byId = new Map(records.map(quote => [quote.id,quote]));
      document.querySelectorAll('.os-screen [data-os-age]').forEach(node => {
        const quote = byId.get(node.dataset.osAge);
        if (quote) node.textContent = observedAge(quote.ts);
      });
      return;
    }
    redrawKeeping();
  }
  return {render,click,change,input,keydown,refresh};
}

// Market-group arrows grey out at either end of the strip (tabs render scrolled to the start).
if (typeof document !== 'undefined') document.addEventListener('scroll', event => {
  const tabs = event.target;
  if (!tabs?.matches?.('.os-tabs')) return;
  const wrap = tabs.parentElement;
  wrap.querySelector('[data-os-scroll="-1"]')?.toggleAttribute('disabled', tabs.scrollLeft <= 2);
  wrap.querySelector('[data-os-scroll="1"]')?.toggleAttribute('disabled', tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 2);
}, true);
