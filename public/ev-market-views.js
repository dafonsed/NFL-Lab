import { quoteAvailable, marketIdentity } from './ev-advanced-math.js';
import { decimal, implied, money, oddsLabel } from './ev-core.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const validNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
const number = value => validNumber(value) ? Number(value) : null;
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ');
const stable = value => typeof value === 'string' ? value : JSON.stringify(value);
const identityKey = (quote, line = true) => stable(marketIdentity(quote, line));
const selectionKeyOf = (quote, line = true) => JSON.stringify([identityKey(quote, line), String(quote.side || '').trim().toLowerCase(), line ? number(quote.line) ?? '' : '']);
// Keys stringify each quote's market identity. Smart Money compared every exchange quote with all
// 20k+ quotes and recomputed both keys per comparison (8 s a render), so during a render each
// record's keys are computed once. The cache lives for one render: quotes are replaced, not edited,
// between renders.
let keyCache = null;
function cachedKey(quote, line, slot, compute) {
  if (!keyCache || !quote || typeof quote !== 'object') return compute(quote, line);
  let entry = keyCache.get(quote);
  if (!entry) keyCache.set(quote, entry = {});
  return entry[slot] ??= compute(quote, line);
}
const key = (quote, line = true) => cachedKey(quote, line, line ? 'market' : 'marketFamily', identityKey);
const selectionKey = (quote, line = true) => cachedKey(quote, line, line ? 'selection' : 'family', selectionKeyOf);
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const stamp = value => timestamp(value) === null ? 'Observation time unavailable' : new Date(value).toLocaleString();
const age = value => {
  const time = timestamp(value);
  if (time === null) return 'Time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h ago` : `${Math.floor(seconds / 86400)}d ago`;
};
const sourceLabel = quote => !quote.source || quote.source === 'manual' ? 'Entered' : `Source: ${quote.source}`;
const label = quote => [quote.event, quote.player, quote.market, quote.side, quote.line === '' || quote.line == null ? '' : quote.line, quote.period && quote.period !== 'full' ? quote.period : '', quote.live ? 'Live' : 'Pregame'].filter(value => value !== '').join(' · ');
const gcd = (a,b) => b ? gcd(b,a % b) : a;
const SCREEN_PAGE = 40;
function price(value, format) {
  const payout = decimal(value);
  if (!Number.isFinite(payout)) return '—';
  if (format === 'decimal') return payout.toFixed(3).replace(/0$/, '');
  if (format === 'fractional') {
    const numerator = Math.round((payout - 1) * 1000), divisor = gcd(numerator,1000);
    return `${numerator / divisor}/${1000 / divisor}`;
  }
  return oddsLabel(value);
}
const localDate = (value) => {
  const date = value && timestamp(value) !== null ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};
const empty = text => `<div class="evx-empty"><strong>No matching records</strong><p>${esc(text)}</p></div>`;
const input = (field, text, value, type = 'text', extra = '') => `<label class="evx-field"><span>${esc(text)}</span><input data-evx-field="${field}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (field, text, options, value) => `<label class="evx-field"><span>${esc(text)}</span><select data-evx-field="${field}">${options.map(([id,name]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;

/** Browser-only market views. Prices and history always retain their supplied timestamps. */
export function createEvMarketViews({ getState, save, redraw, navigate, getSettings = () => ({}) }) {
  let draggedBook = '', message = '', editingMarker = '', screenVisible = SCREEN_PAGE;
  const defaults = { query:'', sport:'', league:'', mode:'both', bookOrder:[], hiddenBooks:[], historySelection:'', historyScope:'family', historyQuote:'', historyDfsPick:'', showWalletFills:true, historyMode:'price', historyRange:'24h', historyHiddenBooks:[], historyPage:0, events:[], hiddenExchanges:[], minimumLiquidity:0, minimumMovement:1, signalRange:'6h' };
  function options() {
    const saved = getState().suite?.marketViews;
    const opt = { ...defaults, ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}) };
    for (const field of ['bookOrder','hiddenBooks','historyHiddenBooks','hiddenExchanges']) opt[field] = Array.isArray(opt[field]) ? [...new Set(opt[field].filter(value => typeof value === 'string'))] : [];
    opt.events = Array.isArray(opt.events) ? opt.events.filter(event => event && typeof event === 'object' && typeof event.id === 'string' && typeof event.family === 'string' && typeof event.name === 'string' && timestamp(event.ts) !== null) : [];
    for (const field of ['query','sport','league','historySelection','historyQuote','historyDfsPick']) opt[field] = typeof opt[field] === 'string' ? opt[field] : defaults[field];
    opt.showWalletFills = opt.showWalletFills !== false;
    for (const [field,allowed] of Object.entries({ mode:['both','pregame','live'],historyScope:['family','quote'],historyMode:['price','line'],historyRange:['1h','6h','24h','all'],signalRange:['1h','6h','24h','all'] })) if (!allowed.includes(opt[field])) opt[field] = defaults[field];
    for (const field of ['historyPage','minimumLiquidity','minimumMovement']) opt[field] = Math.max(0,number(opt[field]) ?? defaults[field]);
    opt.historyPage = Math.floor(opt.historyPage);
    return opt;
  }
  function store(patch) {
    const state = getState();
    state.suite ||= {};
    state.suite.marketViews = { ...options(), ...patch };
    save();
  }
  const settings = () => getSettings() || {};
  const format = () => settings().oddsFormat || 'american';
  const rawQuotes = () => Array.isArray(getState().quotes) ? getState().quotes : [];
  let renderLatest = null;
  function latestQuotes() {
    if (keyCache && renderLatest) return renderLatest;
    const latest = new Map();
    for (const quote of rawQuotes()) {
      if (!quote?.book || !quote.event || !quote.market || !quote.side) continue;
      const id = JSON.stringify([selectionKey(quote), quote.book]);
      const previous = latest.get(id);
      if (!previous || (timestamp(quote.ts) ?? -Infinity) >= (timestamp(previous.ts) ?? -Infinity)) latest.set(id, quote);
    }
    const quotes = [...latest.values()];
    if (keyCache) renderLatest = quotes;
    return quotes;
  }
  const available = quote => quoteAvailable(quote, settings()) && Number.isFinite(decimal(quote.odds));
  const booksFor = quotes => {
    const names = [...new Set(quotes.map(quote => quote.book).filter(Boolean))], order = options().bookOrder;
    return [...order.filter(name => names.includes(name)), ...names.filter(name => !order.includes(name)).sort()];
  };
  // Pass the options in when filtering many quotes: options() re-reads and re-validates saved state.
  function matches(quote, opt = options()) {
    const term = opt.query.toLowerCase().trim();
    return (!opt.sport || quote.sport === opt.sport) && (!opt.league || (quote.league || quote.sport) === opt.league)
      && (opt.mode === 'both' || Boolean(quote.live) === (opt.mode === 'live'))
      && (!term || [quote.sport, quote.league, quote.event, quote.homeTeam, quote.awayTeam, quote.team, quote.player, quote.market, quote.side, quote.book, quote.period].some(value => String(value || '').toLowerCase().includes(term)));
  }
  function filters() {
    const opt = options(), quotes = latestQuotes();
    const sports = [...new Set(quotes.map(quote => quote.sport).filter(Boolean))].sort();
    const leagues = [...new Set(quotes.filter(quote => !opt.sport || quote.sport === opt.sport).map(quote => quote.league || quote.sport).filter(Boolean))].sort();
    return `<div class="evx-filters">${input('query','Search markets',opt.query,'search','placeholder="Event, team, player, market or book" autocomplete="off"')}${select('sport','Sport',[['','All sports'],...sports.map(value => [value,value])],opt.sport)}${select('league','League',[['','All leagues'],...leagues.map(value => [value,value])],opt.league)}${select('mode','Game status',[['both','Pregame + live'],['pregame','Pregame'],['live','Live']],opt.mode)}</div>`;
  }
  function context(quote) {
    const game = quote.gameState;
    if (!game || typeof game !== 'object' || Array.isArray(game)) return '';
    const names = { score:'Score', homeScore:'Home', awayScore:'Away', clock:'Clock', period:'Period', status:'Status', inPlay:'In play', stoppage:'Stoppage', down:'Down', distance:'Distance', possession:'Possession', inning:'Inning', count:'Count', balls:'Balls', strikes:'Strikes', outs:'Outs', runners:'Runners', fouls:'Fouls', timeouts:'Timeouts', cards:'Cards', penalties:'Penalties' };
    const details = Object.entries(game).filter(([field,value]) => names[field] && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')).map(([field,value]) => `${names[field]}: ${typeof value === 'boolean' ? value ? 'Yes' : 'No' : value}`);
    return details.length ? `<p class="evx-game-state">${esc(details.join(' · '))}</p>` : '';
  }
  function quoteMeta(quote) {
    const liquidity = number(quote.liquidity), limit = number(quote.maxStake ?? quote.maxBet ?? quote.limit);
    return `<span class="evx-quote-meta">${liquidity !== null && quote.exchange ? `<span>${esc(money(liquidity))} liquidity</span>` : ''}${limit !== null ? `<span>${esc(money(limit))} max stake</span>` : ''}<span title="${esc(stamp(quote.ts))}">${esc(age(quote.ts))}</span><span>${esc(sourceLabel(quote))}</span></span>`;
  }
  function bookControls(books) {
    const opt = options();
    return `<details class="evx-book-settings"><summary>Sportsbook columns <span>${books.filter(book => !opt.hiddenBooks.includes(book)).length} shown</span></summary><p>Drag books to reorder, or use the move buttons. Changes are saved in this browser.</p><div class="evx-book-order">${books.map((book,index) => `<div class="evx-book-option" draggable="true" data-evx-drag-book="${esc(book)}"><label><input type="checkbox" data-evx-book="${esc(book)}"${opt.hiddenBooks.includes(book) ? '' : ' checked'}> ${esc(book)}</label><div><button type="button" data-evx-move="${esc(book)}" data-direction="-1"${index === 0 ? ' disabled' : ''} aria-label="Move ${esc(book)} left">←</button><button type="button" data-evx-move="${esc(book)}" data-direction="1"${index === books.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(book)} right">→</button></div></div>`).join('')}</div><button type="button" data-evx-action="all-books">Show all books</button></details>`;
  }
  function marketScreen() {
    const opt = options(), latest = latestQuotes(), matching = latest.filter(quote => matches(quote,opt)), current = matching.filter(available), books = booksFor(latest);
    const shownBooks = books.filter(book => !opt.hiddenBooks.includes(book)), shown = new Set(shownBooks);
    const families = new Map();
    for (const quote of current) {
      if (!shown.has(quote.book)) continue;
      const id = key(quote);
      if (!families.has(id)) families.set(id,{ quote, selections:new Map() });
      const group = families.get(id), selection = selectionKey(quote);
      if (!group.selections.has(selection)) group.selections.set(selection,[]);
      group.selections.get(selection).push(quote);
    }
    // The full board was 13k market groups (35k rows, 32 MB of HTML) in one render; it pages like the other boards.
    const groups = [...families.values()], visible = Math.min(groups.length,screenVisible);
    const more = groups.length > visible ? `<div class="evx-pagination"><span>${visible} of ${groups.length} markets shown</span><button type="button" data-evx-action="screen-more">Show ${Math.min(SCREEN_PAGE,groups.length - visible)} more markets</button></div>` : '';
    const rows = groups.slice(0,visible).map(group => {
      const quote = group.quote;
      const header = `<tr class="evx-event-row"><th colspan="${shownBooks.length + 1}" scope="rowgroup"><strong>${esc(quote.event)}</strong><span>${esc([quote.sport,quote.league && quote.league !== quote.sport ? quote.league : '',quote.player,quote.market,quote.period || 'Full game',quote.live ? 'Live' : 'Pregame'].filter(Boolean).join(' · '))}</span>${context(quote)}</th></tr>`;
      return '<tbody>' + header + [...group.selections.values()].map(selections => {
        const first = selections[0], best = Math.max(...selections.map(item => decimal(item.odds)));
        return `<tr><th scope="row"><strong>${esc(first.side)}${first.line === '' || first.line == null ? '' : ' ' + esc(first.line)}</strong>${first.player ? `<small>${esc(first.player)}</small>` : ''}</th>${shownBooks.map(book => {
          const item = selections.find(selection => selection.book === book);
          return item ? `<td class="${decimal(item.odds) === best ? 'evx-best' : ''}"><button type="button" data-detail="${esc(item.id)}" aria-label="Open ${esc(label(item))} at ${esc(book)}, ${esc(price(item.odds,format()))}"><strong>${esc(price(item.odds,format()))}</strong>${quoteMeta(item)}</button></td>` : '<td><span class="evx-unavailable" aria-label="No available quote">—</span></td>';
        }).join('')}</tr>`;
      }).join('') + '</tbody>';
    }).join('');
    return `<section class="evx-root" data-evx-view="market-screen"><header class="evx-title"><div><h2>Market screen</h2><p>Compare the same selection and threshold across books.</p></div><span>${current.length} available quotes</span></header>${filters()}${bookControls(books)}<p class="evx-note">${matching.length - current.length} unavailable, suspended, expired or stale records excluded by current quote settings. Prices keep their source timestamps. The best displayed price is highlighted.</p>${rows ? `<div class="evx-table-scroll" role="region" tabindex="0" aria-label="Sportsbook odds comparison"><table class="evx-odds-grid"><thead><tr><th scope="col">Selection</th>${shownBooks.map(book => `<th scope="col">${esc(book)}</th>`).join('')}</tr></thead>${rows}</table></div>${more}` : empty(shownBooks.length ? 'Change your filters or import available quote records.' : 'Select a sportsbook column to show prices.')}<p class="evx-note">Alternate thresholds stay separate. Liquidity, stake limits and game state are shown only when supplied.</p></section>`;
  }
  function historyRecords() {
    const quotes = new Map(rawQuotes().map(quote => [quote.id, quote]));
    const history = Array.isArray(getState().history) ? getState().history : [];
    return history.filter(record => record && timestamp(record.ts) !== null).map(record => ({ ...(quotes.get(record.quoteId) || {}), ...record, quoteId:record.quoteId || record.id })).filter(record => record.event && record.market && record.side && record.book).sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts));
  }
  // Only selections with recorded observations are offered (every feed quote made an 11k-option,
  // 5.7 MB menu), most observations first, then the most recent. A saved selection whose quote is
  // still in the feed stays available. Each family is labelled by its current quote when there is one.
  function historyFamilies(records, keep) {
    const stats = new Map();
    for (const record of records) {
      const id = selectionKey(record,false), entry = stats.get(id);
      if (entry) { entry.count += 1; entry.last = record.ts; } else stats.set(id,{count:1,last:record.ts,record});
    }
    const quotes = new Map();
    for (const quote of rawQuotes()) {
      if (!quote?.event || !quote.market || !quote.side) continue;
      const id = selectionKey(quote,false);
      if ((stats.has(id) || id === keep) && !quotes.has(id)) quotes.set(id,quote);
    }
    const families = new Map([...stats].sort(([,a],[,b]) => b.count - a.count || Date.parse(b.last) - Date.parse(a.last)).map(([id,entry]) => [id,quotes.get(id) || entry.record]));
    if (keep && !families.has(keep) && quotes.has(keep)) families.set(keep,quotes.get(keep));
    return families;
  }
  const within = (ts, range) => range === 'all' || Date.parse(ts) >= Date.now() - ({'1h':1,'6h':6,'24h':24}[range] || 24) * 3600000;
  function sameRecordedFamily(record, reference) {
    if (!record || !reference) return false;
    const sameEntity = (name,id) => record[id] && reference[id] ? normalize(record[id]) === normalize(reference[id]) : normalize(record[name]) === normalize(reference[name]);
    if (normalize(record.sport) !== normalize(reference.sport) || !sameEntity('event','eventId') || !sameEntity('market','marketId') || !sameEntity('player','playerId')) return false;
    const candidate = {...record,side:record.side || record.selection,live:record.phase ? record.phase === 'live' : record.live === true,
      type:record.type || reference.type,eventId:reference.eventId,marketId:reference.marketId,playerId:reference.playerId};
    if (record.league && normalize(record.league) !== normalize(reference.league || reference.sport)) return false;
    candidate.league = reference.league || reference.sport;
    return selectionKey(candidate,false) === selectionKey(reference,false);
  }
  function historyContext(family,records) {
    const state = getState(), opt = options(), operations = state.suite?.operations || {};
    const wallets = Array.isArray(operations.wallets) ? operations.wallets : [];
    const fills = (Array.isArray(operations.entries) ? operations.entries : []).filter(record => record?.kind === 'fill' && timestamp(record.ts) !== null && timestamp(record.ts) <= Date.now() && within(record.ts,opt.historyRange)
      && number(record.quantity) > 0 && number(record.price) !== null && number(record.price) >= 0 && number(record.price) <= 100
      && records.some(reference => sameRecordedFamily(record,reference) && number(record.line) === number(reference.line)))
      .map(record => {
        const wallet = wallets.find(item => item.id === record.walletId);
        return {id:record.id,ts:record.ts,kind:'wallet-fill',name:`${wallet?.name || 'Recorded wallet'}: ${record.fillAction || 'fill'} ${record.quantity} at ${record.price}¢`,
          detail:`${record.selection} ${record.line ?? ''} · ${record.sample || 'Supplied sample'} · Recorded wallet fill`};
      });
    const dfs = (Array.isArray(state.dfs) ? state.dfs : []).filter(pick => pick && typeof pick === 'object').map(pick => ({...pick,...state.suite?.fantasyLab?.annotations?.[pick.id],id:pick.id}))
      .filter(pick => sameRecordedFamily(pick,family) && number(pick.line) !== null && timestamp(pick.ts) !== null
        && Boolean(pick.source === 'example' || pick.demo) === Boolean(family?.source === 'example' || family?.demo));
    return {fills:opt.showWalletFills ? fills : [],allFills:fills,dfs,overlay:dfs.find(pick => pick.id === opt.historyDfsPick)};
  }
  function historyChart(records, events, mode, overlay) {
    const values = records.map(record => mode === 'line' ? number(record.line) : Number.isFinite(decimal(record.odds)) ? decimal(record.odds) : null);
    const data = records.map((record,index) => ({ ...record, value:values[index] })).filter(record => record.value !== null);
    if (!data.length) return empty(`No recorded ${mode === 'line' ? 'numeric lines' : 'prices'} for this selection and interval.`);
    const left = 66, right = 920, top = 28, bottom = 292, times = data.map(record => Date.parse(record.ts));
    const first = Math.min(...times), last = Math.max(...times), from = first === last ? first - 60000 : first, to = first === last ? last + 60000 : last;
    const scaleValues = [...data.map(record => record.value),...(mode === 'line' && overlay ? [Number(overlay.line)] : [])];
    const rawMin = Math.min(...scaleValues), rawMax = Math.max(...scaleValues);
    const padding = Math.max(mode === 'line' ? 0.5 : 0.02,(rawMax - rawMin) * 0.12), low = rawMin - padding, high = rawMax + padding;
    const x = time => left + (time - from) / (to - from) * (right - left), y = value => bottom - (value - low) / (high - low) * (bottom - top);
    const books = [...new Set(data.map(record => record.book))], colors = ['#91d9e6','#e3bf81','#9cb5f6','#baa8d9','#97cba7','#e3a995','#d4d593','#a5c3ce'];
    const series = new Map();
    for (const record of data) {
      const id = JSON.stringify([record.book,mode === 'price' ? number(record.line) : record.quoteId || number(record.line)]);
      if (!series.has(id)) series.set(id,{name:[record.book,record.line !== '' && record.line != null ? `line ${record.line}` : ''].filter(Boolean).join(' · '),points:[]});
      series.get(id).points.push(record);
    }
    const streams = [...series.values()];
    const grid = Array.from({length:5},(_,index) => {
      const value = low + (high - low) * index / 4;
      return `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${esc(value.toFixed(mode === 'line' ? 1 : 2))}</text>`;
    }).join('');
    const traces = streams.map(({name:book,points},index) => {
      return `<g stroke="${colors[index % colors.length]}" fill="${colors[index % colors.length]}">${points.length > 1 ? `<path fill="none" stroke-width="2" d="${points.map((point,i) => `${i ? 'L' : 'M'}${x(Date.parse(point.ts)).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}"/>` : ''}${points.map(point => `<circle cx="${x(Date.parse(point.ts)).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="4"><title>${esc(`${book}: ${mode === 'line' ? point.line : price(point.odds,format())}, ${stamp(point.ts)}`)}</title></circle>`).join('')}</g>`;
    }).join('');
    const markers = events.filter(event => timestamp(event.ts) !== null && Date.parse(event.ts) >= from && Date.parse(event.ts) <= to).map(event => `<g class="evx-event-marker${event.kind === 'wallet-fill' ? ' evx-wallet-marker' : ''}"><line x1="${x(Date.parse(event.ts))}" x2="${x(Date.parse(event.ts))}" y1="${top}" y2="${bottom}"/><circle cx="${x(Date.parse(event.ts))}" cy="${top}" r="5"><title>${esc(`${event.name} · ${stamp(event.ts)} · ${event.kind === 'wallet-fill' ? event.detail : 'User marker'}`)}</title></circle></g>`).join('');
    const threshold = mode === 'line' && overlay ? `<g class="evx-dfs-threshold"><line x1="${left}" x2="${right}" y1="${y(Number(overlay.line))}" y2="${y(Number(overlay.line))}"/><text x="${right - 8}" y="${y(Number(overlay.line)) - 7}" text-anchor="end">${esc(`${overlay.app} · saved line ${overlay.line}`)}</text><title>${esc(`${overlay.app} ${overlay.side} ${overlay.line} · ${stamp(overlay.ts)} · Saved comparison threshold, not historical sportsbook data`)}</title></g>` : '';
    return `<figure class="evx-chart"><svg viewBox="0 0 960 340" role="img" aria-label="${mode === 'line' ? 'Recorded line thresholds' : 'Recorded decimal prices'} across ${books.length} books and ${data.length} observations. Exact values are in the table below."><g class="evx-chart-grid">${grid}</g>${traces}${markers}${threshold}<g class="evx-chart-axis"><text x="${left}" y="325">${esc(new Date(from).toLocaleString())}</text><text x="${right}" y="325" text-anchor="end">${esc(new Date(to).toLocaleString())}</text></g></svg><figcaption><span>${mode === 'line' ? 'Line threshold' : 'Decimal price axis'} · ${data.length} supplied observations</span><span class="evx-legend">${streams.map(({name},index) => `<span style="--evx-series:${colors[index % colors.length]}"><i></i>${esc(name)}</span>`).join('')}</span></figcaption></figure>`;
  }
  function historyView() {
    const opt = options(), all = historyRecords(), families = historyFamilies(all,opt.historySelection);
    const selected = families.has(opt.historySelection) ? opt.historySelection : families.keys().next().value || '';
    const family = families.get(selected);
    const familyRecords = all.filter(record => selectionKey(record,false) === selected);
    const quoteChoices = new Map(familyRecords.filter(record => record.quoteId).map(record => [String(record.quoteId),record]));
    const selectedQuote = quoteChoices.has(opt.historyQuote) ? opt.historyQuote : quoteChoices.keys().next().value || '';
    const quoteOptions = [...quoteChoices].map(([id,record]) => [id,[record.book,record.side,record.line,price(record.odds,format())].filter(value => value !== '' && value != null).join(' · ')]);
    const books = [...new Set(familyRecords.map(record => record.book))].sort();
    const records = familyRecords.filter(record => (opt.historyScope !== 'quote' || String(record.quoteId) === selectedQuote) && !opt.historyHiddenBooks.includes(record.book) && within(record.ts,opt.historyRange));
    const events = opt.events.filter(event => event.family === selected);
    const context = historyContext(family,records);
    const dfsOptions = [['','No Fantasy overlay'],...context.dfs.map(pick => [pick.id,`${pick.app} · ${pick.player || pick.event} ${pick.side} ${pick.line}`])];
    const marker = events.find(event => event.id === editingMarker);
    const pages = Math.max(1,Math.ceil(records.length / 100)), page = Math.min(Math.max(0,opt.historyPage),pages - 1);
    const rows = records.slice().reverse().slice(page * 100,page * 100 + 100);
    const familyOptions = families.size ? [...families].map(([id,quote]) => [id,[quote.sport,quote.event,quote.player,quote.market,quote.side,quote.period || 'Full game',quote.live ? 'Live' : 'Pregame'].filter(Boolean).join(' · ')]) : [['','No recorded observations yet']];
    return `<section class="evx-root" data-evx-view="history"><header class="evx-title"><div><h2>Line history</h2><p>Recorded observations with optional markers you add.</p></div></header><div class="evx-filters">${select('historySelection','Selection across thresholds',familyOptions,selected)}${select('historyScope','History scope',[['family','Selection family'],['quote','Individual quote']],opt.historyScope)}${opt.historyScope === 'quote' ? select('historyQuote','Recorded quote',quoteOptions,selectedQuote) : ''}${select('historyMode','Chart measure',[['price','Price'],['line','Line threshold']],opt.historyMode)}${select('historyRange','Time interval',[['1h','Last hour'],['6h','Last 6 hours'],['24h','Last 24 hours'],['all','All history']],opt.historyRange)}${opt.historyMode === 'line' ? select('historyDfsPick','Saved Fantasy threshold',dfsOptions,context.overlay?.id || '') : ''}</div><label class="evx-inline-check"><input type="checkbox" data-evx-field="showWalletFills"${opt.showWalletFills ? ' checked' : ''}> Show recorded wallet fills (${context.allFills.length})</label>${books.length ? `<fieldset class="evx-checks"><legend>Books on chart</legend>${books.map(book => `<label><input type="checkbox" data-evx-history-book="${esc(book)}"${opt.historyHiddenBooks.includes(book) ? '' : ' checked'}> ${esc(book)}</label>`).join('')}</fieldset>` : ''}<div class="evx-history-stage" data-evx-fullscreen><div class="evx-chart-toolbar"><strong>${esc(family ? [family.market,family.side].filter(Boolean).join(' · ') : 'No selection')}</strong><button type="button" data-evx-action="fullscreen">Toggle fullscreen</button></div>${historyChart(records,[...events,...context.fills],opt.historyMode,context.overlay)}</div>${context.overlay && opt.historyMode === 'line' ? `<p class="evx-note">Fantasy reference: ${esc(context.overlay.app)} ${esc(context.overlay.side)} ${esc(context.overlay.line)}, observed ${esc(stamp(context.overlay.ts))} · ${esc(sourceLabel(context.overlay))}. The dashed threshold is a saved comparison value, not a sportsbook observation.</p>` : ''}${context.fills.length ? `<details class="evx-records"><summary>Recorded wallet fills · ${context.fills.length}</summary><p class="evx-note">Matching sport, event, player, market, period, side and threshold. Vertical markers use supplied fill times; cent-denominated fill prices are not plotted as sportsbook odds.</p><div class="evx-table-scroll" role="region" tabindex="0" aria-label="Recorded wallet fills"><table><thead><tr><th scope="col">Observed</th><th scope="col">Recorded fill</th><th scope="col">Selection and sample</th></tr></thead><tbody>${context.fills.map(fill => `<tr><td>${esc(stamp(fill.ts))}</td><td>${esc(fill.name)}</td><td>${esc(fill.detail)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}<p class="evx-note">Price charts use decimal odds for a consistent axis. Tables use your preferred format. Price series keep alternate thresholds separate. Line series follow individual quote records. Connecting lines join supplied observations; they do not imply continuous coverage.</p><details class="evx-records" open><summary>Recorded observations · ${records.length}</summary>${rows.length ? `<div class="evx-table-scroll" role="region" tabindex="0" aria-label="Recorded price observations"><table><thead><tr><th scope="col">Observed</th><th scope="col">Book</th><th scope="col">Line</th><th scope="col">Price</th><th scope="col">Source</th></tr></thead><tbody>${rows.map(record => `<tr><td>${esc(stamp(record.ts))}</td><td>${esc(record.book)}</td><td>${esc(record.line ?? '—')}</td><td>${esc(price(record.odds,format()))}</td><td>${esc(sourceLabel(record))}</td></tr>`).join('')}</tbody></table></div><div class="evx-pagination"><button type="button" data-evx-action="history-prev"${page === 0 ? ' disabled' : ''}>Previous</button><span>Page ${page + 1} of ${pages}</span><button type="button" data-evx-action="history-next"${page >= pages - 1 ? ' disabled' : ''}>Next</button></div>` : empty('Choose another book or interval, or import timestamped history.')}</details>${family ? `<details class="evx-event-editor"><summary>Market event markers</summary><p>These are your annotations. They do not confirm an official announcement or market event.</p><form data-evx-event-form><input type="hidden" name="id" value="${esc(marker?.id || '')}"><input type="hidden" name="family" value="${esc(selected)}"><label>Event label<input name="name" required maxlength="100" value="${esc(marker?.name || '')}" placeholder="e.g. Lineup announcement"></label><label>Observed time<input name="time" required type="datetime-local" value="${localDate(marker?.ts)}"></label><button type="submit">${marker ? 'Save marker' : 'Add marker'}</button>${marker ? '<button type="button" data-evx-action="cancel-marker">Cancel edit</button>' : ''}</form><ul>${events.map(event => `<li><span><strong>${esc(event.name)}</strong><small>${esc(stamp(event.ts))}</small></span><span class="evx-marker-actions"><button type="button" data-evx-edit-event="${esc(event.id)}" aria-label="Edit marker ${esc(event.name)}">Edit</button><button type="button" data-evx-delete-event="${esc(event.id)}" aria-label="Remove marker ${esc(event.name)}">Remove</button></span></li>`).join('') || '<li>No markers for this selection.</li>'}</ul></details>` : ''}</section>`;
  }
  function smartSignals() {
    const opt = options(), latest = latestQuotes();
    const exchanges = [...new Set(latest.filter(quote => quote.exchange).map(quote => quote.book))].sort();
    const candidates = latest.filter(quote => quote.exchange && !opt.hiddenExchanges.includes(quote.book) && matches(quote,opt) && available(quote));
    // Index once: available quotes in the candidates' selections, and usable history by book and
    // selection. Both keep their original order, so results match the per-candidate scans of every
    // quote and record they replace.
    const bySelection = new Map(), historyBy = new Map(), group = (map,id,item) => { const list = map.get(id); if (list) list.push(item); else map.set(id,[item]); };
    if (candidates.length) {
      const wanted = new Set(candidates.map(quote => selectionKey(quote)));
      for (const quote of latest) if (wanted.has(selectionKey(quote)) && available(quote)) group(bySelection,selectionKey(quote),quote);
      for (const record of historyRecords()) if (Number.isFinite(implied(record.odds)) && within(record.ts,opt.signalRange)) group(historyBy,JSON.stringify([record.book,selectionKey(record)]),record);
    }
    const signals = candidates.map(quote => {
      const liquidity = number(quote.liquidity), id = selectionKey(quote);
      const records = historyBy.get(JSON.stringify([quote.book,id])) || [];
      const byTime = new Map(records.map(record => [Date.parse(record.ts),record]));
      const observations = [...byTime.values()].sort((a,b) => Date.parse(a.ts) - Date.parse(b.ts));
      const first = observations[0], last = observations.at(-1);
      const movement = observations.length > 1 ? (implied(last.odds) - implied(first.odds)) * 100 : null;
      // The first of the highest prices, as the stable sort it replaces picked.
      const better = (bySelection.get(id) || []).reduce((best,other) => other.book !== quote.book && decimal(other.odds) > decimal(quote.odds) && (!best || decimal(other.odds) > decimal(best.odds)) ? other : best,undefined);
      return { quote,liquidity,observations,movement,first,last,better };
    }).filter(signal => signal.liquidity !== null && signal.liquidity >= Number(opt.minimumLiquidity) && signal.movement !== null && Math.abs(signal.movement) >= Number(opt.minimumMovement)).sort((a,b) => Math.abs(b.movement) - Math.abs(a.movement));
    return `<section class="evx-root" data-evx-view="smart-signals"><header class="evx-title"><div><h2>Smart Money signals</h2><p>Observed exchange price changes and better prices for the same selection.</p></div><span>${signals.length} matches</span></header>${filters()}<div class="evx-filters">${input('minimumLiquidity','Minimum available liquidity ($)',opt.minimumLiquidity,'number','min="0" step="1"')}${input('minimumMovement','Minimum probability move (percentage points)',opt.minimumMovement,'number','min="0" max="100" step="0.1"')}${select('signalRange','Movement interval',[['1h','Last hour'],['6h','Last 6 hours'],['24h','Last 24 hours'],['all','All history']],opt.signalRange)}</div><fieldset class="evx-checks"><legend>Exchanges contributing to signals</legend>${exchanges.map(book => `<label><input type="checkbox" data-evx-exchange="${esc(book)}"${opt.hiddenExchanges.includes(book) ? '' : ' checked'}> ${esc(book)}</label>`).join('') || '<p>No exchange quotes supplied.</p>'}</fieldset><p class="evx-note">Signals require at least two recorded observations at the exact same line. Available liquidity is an offer, not evidence of money traded. Price moves do not establish who traded or why.</p><div class="evx-signal-list">${signals.map(signal => {
      const {quote,better,movement,first,last,observations} = signal;
      const fill = number(quote.fillVolume ?? quote.tradedVolume ?? quote.activity?.filledVolume);
      return `<article class="evx-signal"><header><div><span class="evx-kicker">${esc(quote.book)} · ${esc(sourceLabel(quote))}</span><h3>${esc(quote.event)}</h3><p>${esc([quote.player,quote.market,quote.side,quote.line,quote.period || 'Full game'].filter(value => value !== '' && value != null).join(' · '))}</p></div><strong class="evx-movement">${movement > 0 ? '+' : ''}${movement.toFixed(2)} pp<small>Implied probability</small></strong></header>${context(quote)}<dl><div><dt>Recorded movement</dt><dd>${esc(price(first.odds,format()))} → ${esc(price(last.odds,format()))}<small>${observations.length} observations</small></dd></div><div><dt>Current liquidity</dt><dd>${esc(money(signal.liquidity))}<small title="${esc(stamp(quote.ts))}">${esc(age(quote.ts))}</small></dd></div>${fill !== null ? `<div><dt>Reported fill volume</dt><dd>${esc(fill.toLocaleString())}<small>${esc(quote.fillVolumeUnit || quote.volumeUnit || 'Provider units')}</small></dd></div>` : ''}</dl><p class="evx-signal-window">${esc(stamp(first.ts))} → ${esc(stamp(last.ts))}</p><div class="evx-signal-actions"><button type="button" data-detail="${esc(quote.id)}">Compare exchange price ${esc(price(quote.odds,format()))}</button>${better ? `<button type="button" data-detail="${esc(better.id)}" class="evx-primary">${esc(better.book)} ${esc(price(better.odds,format()))} · Better same-side price</button>` : '<span>No better available price for this exact selection.</span>'}</div>${better ? `<p class="evx-note">${esc(better.book)} observed ${esc(age(better.ts))}. Open comparison to pin or track this selection.</p>` : ''}</article>`;
    }).join('') || empty('Supply exchange liquidity and timestamped price history, or lower the movement and liquidity thresholds.')}</div></section>`;
  }
  function render(tool) {
    if (!['market-screen','history','smart-signals'].includes(tool)) return '';
    keyCache = new WeakMap(); renderLatest = null;
    try {
      const content = tool === 'market-screen' ? marketScreen() : tool === 'history' ? historyView() : smartSignals();
      return `${message ? `<p class="evx-feedback" role="status">${esc(message)}</p>` : ''}${content}`;
    } finally { keyCache = null; renderLatest = null; }
  }
  function repaint(field, selection) {
    const details = [...document.querySelectorAll('.evx-root details')].map(item => item.open);
    const focused = document.activeElement;
    const restoreAttribute = ['data-evx-book','data-evx-history-book','data-evx-exchange','data-evx-action'].find(attribute => focused?.hasAttribute(attribute));
    const restoreValue = restoreAttribute ? focused.getAttribute(restoreAttribute) : '';
    redraw();
    document.querySelectorAll('.evx-root details').forEach((item,index) => { if (details[index] !== undefined) item.open = details[index]; });
    if (!field) {
      if (restoreAttribute) document.querySelector(`[${restoreAttribute}="${CSS.escape(restoreValue)}"]`)?.focus({preventScroll:true});
      return;
    }
    const control = document.querySelector(`[data-evx-field="${field}"]`);
    control?.focus({preventScroll:true});
    if (selection !== null && selection !== undefined && ['text','search'].includes(control?.type)) control.setSelectionRange(selection,selection);
  }
  function toggleHidden(field, value, checked) {
    const hidden = new Set(options()[field]);
    checked ? hidden.delete(value) : hidden.add(value);
    store({[field]:[...hidden],historyPage:0});
    repaint();
  }
  function handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (event.type === 'dragstart') {
      const row = target.closest('[data-evx-drag-book]');
      if (!row) return false;
      draggedBook = row.dataset.evxDragBook;
      event.dataTransfer?.setData('text/plain',draggedBook);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      return true;
    }
    if (event.type === 'dragover') {
      if (!draggedBook || !target.closest('[data-evx-drag-book]')) return false;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      return true;
    }
    if (event.type === 'drop') {
      const row = target.closest('[data-evx-drag-book]');
      if (!row || !draggedBook) return false;
      event.preventDefault();
      const books = booksFor(latestQuotes()), from = books.indexOf(draggedBook), to = books.indexOf(row.dataset.evxDragBook);
      draggedBook = '';
      if (from >= 0 && to >= 0 && from !== to) { const [book] = books.splice(from,1); books.splice(to,0,book); store({bookOrder:books}); repaint(); }
      return true;
    }
    if (event.type === 'submit' && target.matches('[data-evx-event-form]')) {
      event.preventDefault();
      if (!target.reportValidity()) return true;
      const form = new FormData(target), name = String(form.get('name') || '').trim().slice(0,100), time = String(form.get('time') || ''), family = String(form.get('family') || '');
      if (!name || timestamp(time) === null || !family) { message = 'Enter a label and valid observation time.'; repaint(); return true; }
      const id = String(form.get('id') || ''), existing = options().events.find(item => item.id === id && item.family === family);
      const marker = {id:existing?.id || crypto.randomUUID(),family,name,ts:new Date(time).toISOString()};
      store({events:existing ? options().events.map(item => item.id === existing.id ? marker : item) : [...options().events,marker]});
      editingMarker = ''; message = 'Your market-event marker was saved.'; repaint(); return true;
    }
    if (event.type === 'input' || event.type === 'change') {
      if (event.type === 'change' && target.matches('[data-evx-book]')) { toggleHidden('hiddenBooks',target.dataset.evxBook,target.checked); return true; }
      if (event.type === 'change' && target.matches('[data-evx-history-book]')) { toggleHidden('historyHiddenBooks',target.dataset.evxHistoryBook,target.checked); return true; }
      if (event.type === 'change' && target.matches('[data-evx-exchange]')) { toggleHidden('hiddenExchanges',target.dataset.evxExchange,target.checked); return true; }
      const field = target.dataset.evxField;
      if (!field) return false;
      if (event.type === 'input' && target.type !== 'search') return true;
      const patch = {[field]:target.value,historyPage:0};
      if (['query','sport','league','mode'].includes(field)) screenVisible = SCREEN_PAGE;
      if (field === 'showWalletFills') patch[field] = target.checked;
      if (field === 'sport') patch.league = '';
      if (['minimumLiquidity','minimumMovement'].includes(field)) {
        if (!target.checkValidity()) return true;
        patch[field] = Math.max(0,Number(target.value) || 0);
      }
      store(patch); message = ''; repaint(field,target.selectionStart); return true;
    }
    if (event.type !== 'click') return false;
    const move = target.closest('[data-evx-move]');
    if (move) {
      const books = booksFor(latestQuotes()), index = books.indexOf(move.dataset.evxMove), next = index + Number(move.dataset.direction);
      if (index >= 0 && next >= 0 && next < books.length) { [books[index],books[next]] = [books[next],books[index]]; store({bookOrder:books}); repaint(); document.querySelector(`[data-evx-move="${CSS.escape(move.dataset.evxMove)}"][data-direction="${move.dataset.direction}"]`)?.focus(); }
      return true;
    }
    const remove = target.closest('[data-evx-delete-event]');
    if (remove) { store({events:options().events.filter(item => item.id !== remove.dataset.evxDeleteEvent)}); editingMarker = ''; message = 'Marker removed.'; repaint(); return true; }
    const edit = target.closest('[data-evx-edit-event]');
    if (edit) { editingMarker = edit.dataset.evxEditEvent; repaint(); const editor = document.querySelector('.evx-event-editor'); if (editor) editor.open = true; editor?.querySelector('[name="name"]')?.focus(); return true; }
    const button = target.closest('[data-evx-action]');
    if (!button) return false;
    const action = button.dataset.evxAction;
    if (action === 'cancel-marker') { editingMarker = ''; repaint(); }
    if (action === 'all-books') { store({hiddenBooks:[]}); repaint(); }
    if (action === 'history-prev' || action === 'history-next') { store({historyPage:Math.max(0,options().historyPage + (action === 'history-prev' ? -1 : 1))}); repaint(); }
    if (action === 'screen-more') { const top = window.scrollY; screenVisible += SCREEN_PAGE; repaint(); window.scrollTo({top,behavior:'instant'}); }
    if (action === 'fullscreen') {
      const stage = button.closest('[data-evx-fullscreen]');
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { message = 'Use Escape to leave fullscreen.'; });
      else if (stage?.requestFullscreen) stage.requestFullscreen().catch(() => { message = 'Fullscreen is unavailable in this browser. The chart remains available below.'; repaint(); });
      else { message = 'Fullscreen is unavailable in this browser.'; repaint(); }
    }
    return true;
  }
  return { render, handleEvent };
}




