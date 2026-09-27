import { decimal, fresh, oddsLabel, probabilityToAmerican } from './ev-core.js?v=2';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const chevron = svg('<path d="m8 10 4 4 4-4"/>');
const searchIcon = svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>');
const layers = svg('<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>');
const settingsIcon = svg('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--os-panel)"/><circle cx="15" cy="17" r="3" fill="var(--os-panel)"/>');
const expandIcon = svg('<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6m0 6 6-6"/>');
const normalizedLine = q => q.line === '' || q.line == null ? '' : (q.type === 'spread' || q.type === 'alternate' && !/^(over|under)$/i.test(q.side)) ? Math.abs(Number(q.line)) : Number.isFinite(Number(q.line)) ? Number(q.line) : q.line;

// Lines stay separate: a better payout at a different threshold is not the same bet.
export function buildOddsBoard(records, books, now = Date.now()) {
  const events = new Map();
  for (const q of records) {
    if (!q.event || !q.market || !q.side || !books.includes(q.book) || q.depthOnly || !Number.isFinite(decimal(q.odds))) continue;
    const eventKey = JSON.stringify([q.sport, q.event, Boolean(q.live)]);
    const marketKey = JSON.stringify([q.type, q.market, q.player || '', normalizedLine(q)]);
    if (!events.has(eventKey)) events.set(eventKey, { key:eventKey, first:q, markets:new Map() });
    const event = events.get(eventKey);
    if (!event.markets.has(marketKey)) event.markets.set(marketKey, { key:eventKey + marketKey, first:q, latest:new Map() });
    const market = event.markets.get(marketKey);
    const key = JSON.stringify([q.book, q.side]);
    const prior = market.latest.get(key);
    if (!prior || (Date.parse(q.ts) || 0) >= (Date.parse(prior.ts) || 0)) market.latest.set(key, q);
  }
  return [...events.values()].map(event => ({...event, markets:[...event.markets.values()].map(market => {
    const quotes = [...market.latest.values()];
    const sides = [...new Set(quotes.map(q => q.side))].sort((a,b) => /^(over|yes)$/i.test(a) ? -1 : /^(over|yes)$/i.test(b) ? 1 : a.localeCompare(b));
    return {...market, sides:sides.map(side => {
      const prices = quotes.filter(q => q.side === side);
      const current = prices.filter(q => fresh(q, now));
      const bestDecimal = current.length ? Math.max(...current.map(q => decimal(q.odds))) : null;
      return {side, prices, best:current.find(q => decimal(q.odds) === bestDecimal), bestDecimal, average:current.length ? current.reduce((sum,q) => sum + decimal(q.odds),0) / current.length : null};
    })};
  })}));
}

export function createOddsScreen({ getQuotes, brandMark, onSport, redraw, getSportsbookState = () => '', onAllSportsbooks = () => {} }) {
  let eventFilter = '', marketFilter = '', query = '', format = 'decimal', expanded = false;
  let settingsOpen = false, hiddenBooks = new Set();
  const collapsed = new Set();
  const initializedEvents = new Set();
  let lastGroups = [];
  const price = value => value == null || !Number.isFinite(value) ? '—' : format === 'decimal' ? value.toFixed(2) : oddsLabel(probabilityToAmerican(1 / value));
  const select = (key, label, options, value) => `<label class="os-field"><span class="os-field-label">${label}</span><select id="os-${key}" data-os-filter="${key}" aria-label="${label}">${options.map(([v,text]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const toggle = (key, title, content, cls = '') => `<button type="button" class="os-disclosure ${cls}" data-os-toggle="${esc(key)}" aria-expanded="${!collapsed.has(key)}" aria-label="${collapsed.has(key) ? 'Expand' : 'Collapse'} ${esc(title)}">${chevron}${content}</button>`;
  const quoteButton = (q, best, showBrand = false) => {
    const stale = !fresh(q);
    const line = q.line === '' || q.line == null ? '' : `<small>${esc(q.line)}</small>`;
    return `<button type="button" data-detail="${esc(q.id)}" class="os-price${best && !stale ? ' is-best' : ''}${stale ? ' is-stale' : ''}" title="${esc(q.book)} · ${esc(q.side)} ${esc(q.line)} · ${stale ? 'Stale live price' : q.source === 'example' ? 'Example price' : 'Entered price'}" aria-label="Compare ${esc(q.book)} ${esc(q.side)} ${esc(q.market)} ${esc(q.line)} at ${price(decimal(q.odds))}${stale ? ', stale live price' : ''}">${showBrand ? brandMark(q.book) : ''}<span>${price(decimal(q.odds))}</span>${line}</button>`;
  };
  function render({ sport = '', demo = false } = {}) {
    const all = getQuotes().filter(q => !q.depthOnly);
    const sports = [...new Set(['NFL','MLB','NBA','WNBA','NHL','Soccer',...all.map(q => q.sport).filter(Boolean)])];
    const leagueQuotes = all.filter(q => !sport || !q.sport || q.sport === sport);
    const events = [...new Set(leagueQuotes.map(q => q.event))].sort();
    const markets = [...new Set(leagueQuotes.map(q => q.displayMarket || (q.player ? q.market.replace(q.player,'').trim() : q.market)))].filter(Boolean).sort();
    if (!events.includes(eventFilter)) eventFilter = '';
    if (!markets.includes(marketFilter)) marketFilter = '';
    const availableBooks = [...new Set(leagueQuotes.map(q => q.book).filter(Boolean))];
    const stateFilter = getSportsbookState();
    const allBooksSelected = !stateFilter && availableBooks.every(book => !hiddenBooks.has(book));
    const filtered = leagueQuotes.filter(q => (!eventFilter || q.event === eventFilter) && (!marketFilter || (q.displayMarket || (q.player ? q.market.replace(q.player,'').trim() : q.market)) === marketFilter) && (!query || [q.player,q.event,q.market,q.book].some(value => String(value || '').toLowerCase().includes(query.toLowerCase().trim()))));
    const present = new Set(filtered.map(q => q.book));
    const books = availableBooks.filter(book => present.has(book) && !hiddenBooks.has(book));
    const groups = buildOddsBoard(filtered, books);
    // A full slate stays available without mounting thousands of offscreen cells.
    groups.forEach((event,index) => {
      if (!event.first.demo || initializedEvents.has(event.key)) return;
      initializedEvents.add(event.key);
      if (index > 0 && !eventFilter) collapsed.add(event.key);
    });
    lastGroups = groups.flatMap(event => [event.key, ...event.markets.map(market => market.key)]);
    const colspan = 3 + books.length;
    const rows = groups.map(event => {
      const q = event.first;
      const time = q.displayTime || q.startTime || '';
      const eventRow = `<tr class="os-event"><th colspan="${colspan}" scope="rowgroup">${toggle(event.key, q.event, `<span>${esc(q.demo ? q.event : q.displayEvent || q.event)}</span><small>${esc(time)}</small>${q.demo ? `<small class="os-market-count">${event.markets.length} markets</small>` : ''}${q.live ? '<span class="os-live">Live entry</span>' : ''}`)}</th></tr>`;
      if (collapsed.has(event.key)) return eventRow;
      return eventRow + event.markets.map(market => {
        const q = market.first, title = q.player || q.market;
        const detail = q.player ? q.displayMarket || q.market.replace(q.player,'').trim() : '';
        const threshold = normalizedLine(q);
        const marketRow = `<tr class="os-market"><th colspan="${colspan}" scope="rowgroup">${toggle(market.key, `${title} ${detail} ${threshold}`, `<span>${esc(title)}</span>${layers}<small>${esc(detail)}${threshold !== '' ? `${detail ? ' · ' : ''}${esc(threshold)}` : ''}</small>${q.type === 'alternate' ? '<span class="os-alt">Alt</span>' : ''}`, 'os-market-toggle')}</th></tr>`;
        if (collapsed.has(market.key)) return marketRow;
        return marketRow + market.sides.map((row,index) => `<tr class="os-side${index === market.sides.length - 1 ? ' os-side-last' : ''}"><th scope="row" class="os-side-name">${esc(row.side)}</th><td class="os-best">${row.best ? quoteButton(row.best,true,true) : '<span class="os-dash">—</span>'}</td><td class="os-average" title="Average decimal price from current entries at this exact line">${price(row.average)}</td>${books.map(book => {const q = row.prices.find(p => p.book === book);return `<td>${q ? quoteButton(q,decimal(q.odds) === row.bestDecimal) : '<span class="os-dash">—</span>'}</td>`;}).join('')}</tr>`).join('');
      }).join('');
    }).join('');
    const count = groups.reduce((n,event) => n + event.markets.length,0);
    const samples = filtered.some(q => q.source === 'example');
    return `<section class="os-screen${expanded ? ' os-wide' : ''}" aria-label="Sportsbook odds comparison">
      <div class="os-toolbar">
        <div class="os-settings"><button type="button" class="os-round" data-os-action="settings" aria-expanded="${settingsOpen}" aria-controls="os-settings-panel" aria-label="Odds screen settings">${settingsIcon}</button>
          <div id="os-settings-panel" class="os-settings-panel" ${settingsOpen ? '' : 'hidden'}><strong>Display settings</strong>${select('format','Odds format',[['decimal','Decimal'],['american','American']],format)}<button type="button" class="os-all-books" data-os-action="all-books">All sportsbooks<span>${allBooksSelected ? 'Selected' : 'Show all'}</span></button>${stateFilter ? `<p class="os-book-scope">Filtered to ${esc(stateFilter)}. Choose all sportsbooks to compare across states.</p>` : ''}<fieldset><legend>Sportsbook columns</legend>${availableBooks.length ? availableBooks.map(book => `<label><input type="checkbox" data-os-book="${esc(book)}" ${hiddenBooks.has(book) ? '' : 'checked'}>${brandMark(book)}<span>${esc(book)}</span></label>`).join('') : '<p>Add prices to choose sportsbooks.</p>'}</fieldset></div>
        </div>
        <div class="os-filterbar" role="search" aria-label="Filter odds">
          ${select('sport','League',[['','All leagues'],...sports.map(v => [v,v])],sport)}
          ${select('event','Event',[['','All events'],...events.map(v => [v,v])],eventFilter)}
          ${select('market','Market',[['','All markets'],...markets.map(v => [v,v])],marketFilter)}
          <label class="os-field os-search"><span>Player</span><input id="os-search" type="search" aria-label="Search players or teams" placeholder="Search players or teams" value="${esc(query)}" autocomplete="off"></label>
          <button type="button" class="os-search-button" data-os-action="search" aria-label="Focus player search">${searchIcon}</button>
        </div>
        <button type="button" class="os-round" data-os-action="expand" aria-pressed="${expanded}" aria-label="${expanded ? 'Exit expanded view' : 'Expand odds screen'}">${expandIcon}</button>
      </div>
      <div class="os-board-meta"><span><span class="os-status-dot"></span>${demo ? 'Demo mode' : samples ? 'Example prices' : 'Entered prices'}<span class="os-meta-separator">/</span>${groups.length} ${groups.length === 1 ? 'event' : 'events'}<span class="os-meta-separator">/</span>${count} ${count === 1 ? 'market' : 'markets'}</span><button type="button" data-os-action="reset" class="os-reset">Reset filters</button></div>
      ${groups.length ? `<div class="os-table-wrap" role="region" aria-label="Odds by sportsbook; scroll horizontally for more books" tabindex="0"><table class="os-table"><caption class="os-sr">Sportsbook prices grouped by event, market and line. Best and average use current prices at the same line.</caption><colgroup><col class="os-label-col"><col class="os-best-col"><col class="os-average-col">${books.map(() => '<col class="os-book-col">').join('')}</colgroup><thead><tr><th scope="col"><button type="button" data-os-action="rows" class="os-rows" aria-label="${lastGroups.every(key => collapsed.has(key)) ? 'Expand all rows' : 'Collapse all rows'}">Rows ${chevron}</button></th><th scope="col">Best</th><th scope="col">Avg</th>${books.map(book => `<th scope="col" title="${esc(book)}"><span class="os-book-heading">${brandMark(book)}<span class="os-sr">${esc(book)}</span></span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="os-empty"><div>${layers}</div><h2>${all.length ? 'No matching prices' : 'Your odds board starts here'}</h2><p>${all.length ? 'Try a different market, league or player, or show more sportsbook columns in settings.' : 'Add a price or import your records to compare sportsbooks side by side.'}</p><button type="button" ${all.length ? 'data-os-action="reset"' : 'data-add="quote"'}>${all.length ? 'Clear filters' : 'Add a price'}</button></div>`}
      <p class="os-footnote">${demo ? 'Demo mode · Simulated matchups, rosters and prices. ' : samples ? 'Example data. ' : ''}Best prices are highlighted in green. Prices at different lines are compared separately. ${filtered.some(q => q.live && !fresh(q)) ? 'Faded live prices are stale and excluded from best and average. ' : ''}No live odds feed is connected.</p>
    </section>`;
  }
  function restore(selector) { document.querySelector(selector)?.focus(); }
  function click(event) {
    const target = event.target.closest('[data-os-action],[data-os-toggle]');
    if (!target) return false;
    const key = target.dataset.osToggle;
    if (key) {
      collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
      redraw();
      [...document.querySelectorAll('[data-os-toggle]')].find(node => node.dataset.osToggle === key)?.focus();
      return true;
    }
    const action = target.dataset.osAction;
    if (action === 'search') {restore('#os-search');return true;}
    if (action === 'settings') settingsOpen = !settingsOpen;
    if (action === 'all-books') {hiddenBooks.clear();onAllSportsbooks();}
    if (action === 'expand') expanded = !expanded;
    if (action === 'rows') {const close = !lastGroups.every(key => collapsed.has(key));lastGroups.forEach(key => close ? collapsed.add(key) : collapsed.delete(key));}
    if (action === 'reset') {eventFilter = '';marketFilter = '';query = '';hiddenBooks.clear();collapsed.clear();initializedEvents.clear();}
    redraw();restore(`[data-os-action="${action}"]`);return true;
  }
  function change(event) {
    const target = event.target;
    if (target.dataset.osBook) {
      target.checked ? hiddenBooks.delete(target.dataset.osBook) : hiddenBooks.add(target.dataset.osBook);
      redraw();[...document.querySelectorAll('[data-os-book]')].find(node => node.dataset.osBook === target.dataset.osBook)?.focus();return true;
    }
    const key = target.dataset.osFilter;
    if (!key) return false;
    if (key === 'sport') {eventFilter = '';marketFilter = '';query = '';collapsed.clear();initializedEvents.clear();onSport(target.value);}
    if (key === 'event') {eventFilter = target.value;collapsed.clear();initializedEvents.clear();}
    if (key === 'market') {marketFilter = target.value;collapsed.clear();initializedEvents.clear();}
    if (key === 'format') format = target.value;
    redraw();queueMicrotask(() => restore(`[data-control="os-${key}"] .td-choice-trigger`));return true;
  }
  function input(event) {
    if (event.target.id !== 'os-search') return false;
    const position = event.target.selectionStart;
    query = event.target.value;collapsed.clear();initializedEvents.clear();redraw();
    const field = document.querySelector('#os-search');field?.focus();field?.setSelectionRange(position,position);return true;
  }
  function keydown(event) {
    if (event.key !== 'Escape' || (!expanded && !settingsOpen)) return;
    expanded = false;settingsOpen = false;redraw();restore('[data-os-action="settings"]');
  }
  function refresh() {
    if (settingsOpen || document.activeElement?.closest('.os-screen') || document.querySelector('.os-screen [aria-expanded="true"][aria-haspopup]')) return;
    const board = document.querySelector('.os-table-wrap');
    const left = board?.scrollLeft || 0, top = board?.scrollTop || 0;
    redraw();
    const next = document.querySelector('.os-table-wrap');
    if (next) {next.scrollLeft = left;next.scrollTop = top;}
  }
  return {render,click,change,input,keydown,refresh};
}
