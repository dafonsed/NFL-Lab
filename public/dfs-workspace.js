import { probabilityToAmerican, fantasySlip, money, oddsLabel, decimal, fresh } from './ev-core.js';
import { teamLogo } from './sports-identity.js';
import { FANTASY_PLATFORMS, SPORTSBOOK_PLATFORMS, canonicalPlatform, platformAsset, isFantasyPlatform, isContestPlatform } from './platform-catalog.js';
import { boardIcon, renderBetPanel } from './ev-board.js?v=5';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const appName = canonicalPlatform;
const SPORT_ORDER = ['NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL','Soccer','Tennis','MMA','Golf'];
const validProbability = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
const percent = value => validProbability(value) ? `${(Number(value) * 100).toFixed(2)}%` : '—';
const icons = {
  down:'<path d="m6 9 6 6 6-6"/>', up:'<path d="m6 15 6-6 6 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
  hide:'<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 21 12a13 13 0 0 1-3.2 4.1M6.2 6.2A14 14 0 0 0 3 12s3 7 9 7a10 10 0 0 0 4-.9"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6.1 7.1A7 7 0 0 1 18 6l2 3M4 15l2 3a7 7 0 0 0 11.9-1.1"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', right:'<path d="m9 6 6 6-6 6"/>', check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.down}</svg>`;
export const DFS_PLATFORMS = FANTASY_PLATFORMS;
export const isDfsPlatform = isFantasyPlatform;

// Each app's published standard payouts: total return per $1 entry, indexed by picks correct.
// PrizePicks Power Play: prizepicks.com/resources/prizepicks-payouts (updated 9 Sep 2026).
// Underdog Standard entries: Underdog help center "Pick'em Standard & Flex Entry Payouts" (Oct 2026).
// Sleeper sets a multiplier per pick, so it has no fixed table. Promotions, state rules, special
// picks and same-game combinations change real payouts; saved tables override these.
const allHit = (size, multiplier) => [...Array(size).fill(0), multiplier];
export const STANDARD_PAYTABLES = Object.freeze({
  PrizePicks: { 2: allHit(2, 3), 3: allHit(3, 6), 4: allHit(4, 10), 5: allHit(5, 20), 6: allHit(6, 37.5) },
  'Underdog Fantasy': { 2: allHit(2, 3.5), 3: allHit(3, 6.5), 4: allHit(4, 12), 5: allHit(5, 20), 6: allHit(6, 35), 7: allHit(7, 65), 8: allHit(8, 120) },
});
/**
 * Payout tables per app and entry size: published standard payouts, then the quote API's tables
 * (GET /site/dfs/payouts), then the member's saved tables on top.
 */
export function withStandardPaytables(saved = {}, api = {}) {
  const tables = Object.fromEntries(Object.entries(STANDARD_PAYTABLES).map(([app, sizes]) => [app, Object.fromEntries(Object.entries(sizes).map(([size, rules]) => [size, [...rules]]))]));
  for (const layer of [api, saved]) for (const [app, sizes] of Object.entries(layer && typeof layer === 'object' ? layer : {})) tables[canonicalPlatform(app)] = { ...(tables[canonicalPlatform(app)] || {}), ...sizes };
  return tables;
}
/** Where a table comes from: 'saved', 'api', 'standard', or '' when there is none. */
export const paytableSource = (saved, app, size, api = {}) => saved?.[app]?.[String(size)] ? 'saved' : api?.[app]?.[String(size)] ? 'api' : STANDARD_PAYTABLES[app]?.[String(size)] ? 'standard' : '';
export const isStandardPaytable = (saved, app, size, api = {}) => paytableSource(saved, app, size, api) === 'standard';
const brand = name => {
  const asset = platformAsset(name);
  return asset ? `<img class="dfs-brand" src="${asset}" alt="${esc(name)}" width="28" height="28">` : `<span class="dfs-brand-fallback" aria-label="${esc(name)}">${esc(name.slice(0,2))}</span>`;
};
const teamMark = item => {
  const url = teamLogo({sport:String(item.sport || '').toLowerCase(),team:item.team,teamId:item.teamId,teamLogo:item.teamLogo});
  return url ? `<img class="dfs-team-logo" src="${esc(url)}" alt="${esc(item.team || '')}" width="24" height="24" loading="lazy" data-dfs-image>` : '';
};


export function breakEven(rules) {
  if (!Array.isArray(rules) || rules.length < 3 || Number(rules.at(-1)) <= 1) return null;
  let low = 0, high = 1;
  for (let i=0;i<48;i++) {
    const probability = (low+high)/2;
    const result = fantasySlip(Array.from({length:rules.length-1},()=>({probability})),rules);
    if (result.payout < 1) low = probability; else high = probability;
  }
  return (low+high)/2;
}

// DFS comparisons come only from DFS props. Sportsbook quotes are a separate market.
export function comparisonPlatforms(item, props = []) {
  if (item.source === 'design-preview' && Array.isArray(item.platformLines)) return item.platformLines.filter(row => isDfsPlatform(row.app));
  const peers = props.filter(q => isDfsPlatform(q.app) && q.sport === item.sport && q.event === item.event && normalize(q.player) === normalize(item.player) && normalize(q.market) === normalize(item.market));
  const pairs = new Map();
  for (const q of peers) {
    if (!['Over','Under'].includes(q.side) || q.line == null || q.line === '' || !Number.isFinite(Number(q.line))) continue;
    const app = appName(q.app);
    const key = JSON.stringify([app,Number(q.line)]);
    const row = pairs.get(key) || {app,line:Number(q.line)};
    const side = q.side.toLowerCase();
    if (!row[side] || (Date.parse(q.ts) || 0) >= (Date.parse(row[side].ts) || 0)) row[side] = {line:Number(q.line),probability:validProbability(q.probability) ? Number(q.probability) : null,ts:q.ts};
    pairs.set(key,row);
  }
  return [...pairs.values()];
}

export function selectedComparisonPlatforms(item, props, names) {
  const lines = comparisonPlatforms(item, props);
  return names.filter(isDfsPlatform).flatMap(app => {
    const matches = lines.filter(row => row.app === app);
    return matches.length ? matches : [{app}];
  });
}

// Use recorded prices for the exact selection; estimated hit rates are never offers.
export function sportsbookOffer(item, quotes = []) { return sportsbookOffers(item, quotes)[0] || null; }
// Latest matching price per sportsbook, best price first.
export function sportsbookOffers(item, quotes = []) {
  if (item.source === 'design-preview') return [];
  const player = normalize(item.player), event = normalize(item.event);
  const marketName = value => {
    const name = normalize(value);
    return name.startsWith(player) ? name.slice(player.length) : name;
  };
  const market = marketName(item.market);
  const hasLine = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  if (!player || !event || !market || !hasLine(item.line)) return [];
  const latest = new Map();
  for (const quote of quotes) {
    const book = [...SPORTSBOOK_PLATFORMS,'Pinnacle'].find(name => name === appName(quote.book));
    const quotePlayer = normalize(quote.player) || (normalize(quote.market) === player + market ? player : '');
    if (!book || quote.exchange || !fresh(quote) || !Number.isFinite(decimal(quote.odds)) ||
        (quote.source === 'example') !== (item.source === 'example') ||
        normalize(quote.sport) !== normalize(item.sport) || normalize(quote.event) !== event ||
        quotePlayer !== player || marketName(quote.market) !== market ||
        !hasLine(quote.line) || Number(quote.line) !== Number(item.line) ||
        normalize(quote.side) !== normalize(item.side) || Boolean(quote.live) !== Boolean(item.live) ||
        normalize(quote.period || 'full') !== normalize(item.period || 'full')) continue;
    const prior = latest.get(book);
    if (!prior || (Date.parse(quote.ts) || 0) >= (Date.parse(prior.ts) || 0)) latest.set(book,{...quote,book});
  }
  return [...latest.values()].sort((a,b) => decimal(b.odds) - decimal(a.odds) || a.book.localeCompare(b.book));
}

export function createDfsWorkspace({getState,redraw,onSave,onConfigure}) {
  // platform: null until set, '' for all apps. A slip is for one app: its first pick's app, else the
  // chosen app, else the app with the most props listed (leadApp).
  let platform = null, filterSport, market = '', query = '', sort = 'probability', slipAppName = '', leadApp = '';
  let previousPreview = null;
  let expanded = '', menuOpen = false, slipType = '3-power', entry = 10, feedback = '';
  let browsePosition = 0;
  // The feed carries tens of thousands of lines (17k NFL PrizePicks props alone); show them in pages.
  const ROW_PAGE = 50;
  let rowLimit = ROW_PAGE;
  const selected = new Set(), hidden = new Set(), excludedPlatforms = new Set();
  const noProps = () => !getState().dfs.length;
  const allRows = () => getState().dfs.filter(item => isDfsPlatform(item.app));
  const slipApp = () => (selected.size && slipAppName) || platform || leadApp || 'PrizePicks';
  // Salary-cap contest apps have no pick'em slip or payouts.
  const contestMode = () => isContestPlatform(slipApp());
  const payoutRules = () => {
    const tables = getState().paytables, app = slipApp();
    return tables[app] || Object.entries(tables).find(([name]) => appName(name) === app)?.[1] || {};
  };
  const types = () => Array.from({length:5},(_,i) => ({id:`${i+2}-saved`,size:i+2,kind:'',rules:payoutRules()[String(i+2)] || null}));
  const chosenType = () => types().find(type => type.id === slipType) || types()[1];
  const choices = () => allRows().filter(item => selected.has(item.id));
  const label = item => `${item.player} ${item.side} ${item.line}`;
  const repaint = (selector) => {
    const before = selector ? document.querySelector(selector)?.getBoundingClientRect?.().top : null;
    redraw();
    if (selector) {
      const control = document.querySelector(selector);
      control?.focus({preventScroll:true});
      const after = control?.getBoundingClientRect?.().top;
      if (Number.isFinite(before) && Number.isFinite(after)) globalThis.window?.scrollBy?.(0,after-before);
    }
  };
  const panelId = item => `dfs-detail-${encodeURIComponent(item.id).replace(/%/g,'_')}`;
  const platformOptions = DFS_PLATFORMS;
  const chosenPlatforms = () => platformOptions.filter(app => !excludedPlatforms.has(app));
  // Platforms to compare: one rail of round logo toggles, like the Positive EV sportsbook bar.
  function platformFilters() {
    const count = chosenPlatforms().length;
    if (!platformOptions.length) return '';
    const logo = app => { const asset = platformAsset(app); return asset ? `<img src="${asset}" alt="" width="26" height="26" decoding="async">` : `<span aria-hidden="true">${esc(app.slice(0,2))}</span>`; };
    return `<div class="dfs-platform-bar" role="group" aria-label="DFS platforms to compare"><p class="dfs-platform-bar-label"><span>Platforms</span><span class="dfs-book-count">${count}/${platformOptions.length}</span></p><div class="dfs-platform-rail">${platformOptions.map(app => { const on = !excludedPlatforms.has(app); return `<button type="button" class="dfs-platform-logo" data-dfs-compare-platform="${esc(app)}" data-platform="${esc(app)}" aria-label="Compare ${esc(app)}" title="${esc(app)}${on ? '' : ' (hidden)'}" aria-pressed="${on}">${logo(app)}</button>`; }).join('')}</div><button type="button" class="dfs-platform-all" data-dfs-all-platforms aria-pressed="${count===platformOptions.length}" title="Compare all platforms">All</button></div>`;
  }
  const matched = () => allRows().filter(item => (!platform || appName(item.app) === platform) && (!filterSport || item.sport === filterSport) && (!market || item.market === market) && !hidden.has(item.id) && (!query || [item.player,item.event,item.market,item.team].some(text => String(text || '').toLowerCase().includes(query.toLowerCase())))).sort((a,b) => sort === 'player' ? a.player.localeCompare(b.player) : Number(b.probability)-Number(a.probability));
  const signed = value => Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(2)}%` : '—';
  const pad = value => String(value).padStart(2,'0');
  const whenLabel = item => {
    const at = Date.parse(item.startTime);
    if (!Number.isFinite(at)) return item.live ? 'Live now' : item.startLabel || (item.source === 'local-api' ? 'Start time not in feed' : 'Time not entered');
    const d = new Date(at), hour = d.getHours();
    return `${item.live ? 'Live · ' : ''}${pad(d.getMonth()+1)}/${pad(d.getDate())} · ${hour % 12 || 12}:${pad(d.getMinutes())}${hour < 12 ? 'am' : 'pm'}`;
  };
  const SPORT_GROUPS = {NFL:'Football',NCAAF:'Football',NBA:'Basketball',WNBA:'Basketball',NCAAB:'Basketball',MLB:'Baseball',NHL:'Hockey',MLS:'Soccer',EPL:'Soccer'};
  const leagueLabel = item => { const league = item.league || item.sport || '', group = SPORT_GROUPS[league] || SPORT_GROUPS[item.sport] || item.sport; return group && group !== league ? `${group} | ${league}` : league; };
  const marketTitle = item => (/^player\b/i.test(item.market) ? item.market : `Player ${item.market}`).replace(/(^|\s)([a-z])/g,(_,space,char) => space+char.toUpperCase());
  const edgeFor = (item, threshold) => validProbability(item.probability) && threshold != null ? Number(item.probability) - threshold : NaN;
  // Estimate vs the slip's break-even: clear edge, within about a point, or below.
  const heat = edge => !Number.isFinite(edge) ? 'none' : edge >= .01 ? 'high' : edge > -.01 ? 'near' : 'low';
  const quotes = () => getState().quotes || [];
  const averagePrice = offers => {
    const values = offers.map(offer => decimal(offer.odds)).filter(Number.isFinite);
    return values.length ? oddsLabel(probabilityToAmerican(values.length / values.reduce((sum,value) => sum+value,0))) : '—';
  };
  const COLUMNS = 5;
  // Expanded row: the shared bet panel with sportsbook prices, then each selected DFS platform's line.
  function comparison(item, threshold) {
    const offers = Object.fromEntries(['Over','Under'].map(side => [side, sportsbookOffers({...item,side},quotes())]));
    const books = [...new Set([...(offers[item.side] || []), ...offers.Over, ...offers.Under].map(offer => offer.book))];
    // With sportsbook prices, only DFS platforms that post this prop follow them; otherwise every selected platform shows.
    const platforms = selectedComparisonPlatforms(item,allRows(),chosenPlatforms()).filter(p => !books.length || p.over || p.under);
    // Over wants the lowest line and Under the highest; only mark a best line when platforms disagree.
    const best = side => {
      const entries = platforms.filter(p => p[side] && Number.isFinite(Number(p[side].line))).map(p => ({app:p.app,line:Number(p[side].line)}));
      if (!entries.length) return null;
      const lines = entries.map(entry => entry.line), target = side === 'over' ? Math.min(...lines) : Math.max(...lines);
      return {...entries.find(entry => entry.line === target), differs:Math.min(...lines) !== Math.max(...lines)};
    };
    const rows = ['Over','Under'].map(side => {
      const key = side.toLowerCase(), list = offers[side], top = best(key);
      const bookCells = books.map(book => { const offer = list.find(entry => entry.book === book); return {value:offer ? oddsLabel(offer.odds) : '—', best:offer === list[0] && Boolean(offer)}; });
      const dfsCells = platforms.map(p => ({value:p[key] ? String(p[key].line) : '—', sub:validProbability(p[key]?.probability) ? `${percent(p[key].probability)} est.` : '', best:!list.length && top?.differs && Number(p[key]?.line) === top.line}));
      return {label:`${item.player} ${side} ${item.line}`, selected:side === item.side, average:averagePrice(list),
        best:list[0] ? {book:list[0].book, value:oddsLabel(list[0].odds)} : top ? {book:top.app, value:String(top.line)} : null, cells:[...bookCells, ...dfsCells]};
    });
    const valid = validProbability(item.probability), fair = valid ? probabilityToAmerican(Number(item.probability)) : NaN;
    const edge = edgeFor(item, threshold), type = chosenType();
    const facts = [`Est. ${percent(item.probability)}`, Number.isFinite(fair) ? `Fair ${oddsLabel(fair)}` : '',
      threshold == null ? 'Payout rules needed for break-even' : `Break-even ${percent(threshold)} (${type.size} Pick${type.kind ? ' '+type.kind : ''})`,
      Number.isFinite(edge) ? `Edge ${signed(edge)}` : ''].filter(Boolean).map(esc).join(' · ');
    const legend = !books.length && !platforms.length ? 'Select a DFS platform above to compare lines.' : `${books.length ? 'Sportsbook columns show American odds. ' : 'No sportsbook price recorded for this line. '}${platforms.length ? 'DFS columns show each platform’s line and entered estimate.' : ''}`;
    const picked = selected.has(item.id), id = esc(item.id);
    return renderBetPanel({ id:panelId(item), colspan:COLUMNS, label:`Price comparison for ${label(item)}`, boosts:[],
      tools:[
        { icon:'hide', label:'Hide prop', attrs:`data-dfs-hide="${id}"` },
        { icon:'trackCircle', label:picked ? 'Remove from slip' : 'Add to slip', pressed:picked, attrs:`data-dfs-toggle-pick="${id}"${isContestPlatform(platform || item.app) ? ' disabled' : ''}` },
        ...([{ icon:'edit', label:'Edit prop', attrs:`data-edit="dfs" data-id="${id}"` }]),
        { icon:'refresh', label:'Refresh comparison', attrs:'data-dfs-refresh' }
      ],
      books:[...books, ...platforms.map(p => p.app)], rows, addAttrs:'data-add="dfs"',
      note:`<span class="dfs-panel-facts">${facts}</span> ${esc(legend)}` });
  }
  // One prop per row: market and event, selection, sharp price, true probability, then round actions.
  function row(item, threshold) {
    const open = expanded === item.id, picked = selected.has(item.id), id = esc(item.id), name = esc(label(item));
    const offer = sportsbookOffer(item,quotes()), edge = edgeFor(item, threshold), league = leagueLabel(item);
    return `<tr class="evb-row dfs-prop${picked ? ' is-selected' : ''}${open ? ' is-open' : ''}" data-dfs-row="${id}">
      <td class="dfs-event-cell"><strong class="dfs-market-title">${esc(marketTitle(item))}</strong><span class="dfs-event-name">${esc(item.event || (item.source === 'local-api' ? 'Matchup not in feed' : 'Matchup not entered'))}</span><small>${esc(whenLabel(item))}${league ? ` · ${esc(league)}` : ''}</small></td>
      <td class="dfs-pick-cell" title="DFS line at ${esc(item.app)}"><strong class="dfs-selection"><span class="dfs-player">${esc(item.player)}</span> <span class="dfs-pick-line">${esc(item.side)} ${esc(item.line)}</span></strong><small>${platform ? 'Selection' : esc(appName(item.app))}</small></td>
      <td class="dfs-offer" title="${offer ? esc(`${item.app} line · best recorded ${offer.book} price${offer.ts ? ` · Observed ${offer.ts}` : ''}`) : 'No matching sportsbook quote recorded for this selection'}"><span class="dfs-sharp">${offer ? brand(offer.book) : ''}<strong>${esc(item.line)} · ${offer ? oddsLabel(offer.odds) : '—'}</strong></span><small>${offer ? `Sharp · ${esc(offer.book)}` : 'No book price'}</small></td>
      <td class="dfs-probability" data-heat="${heat(edge)}"><strong class="dfs-prob">${percent(item.probability)}</strong><small title="No-vig sportsbook probability at the same line">${validProbability(item.probability) ? 'Hit chance' : 'No book odds'}</small>${Number.isFinite(edge) ? `<small class="dfs-vs-be">vs BE ${signed(edge)}</small>` : ''}</td>
      <td class="dfs-actions"><div>
        <button type="button" class="dfs-round dfs-hide" data-dfs-hide="${id}" aria-label="Hide ${esc(item.player)} prop" title="Hide prop">${boardIcon('hide',17)}</button>
        <button type="button" class="dfs-round dfs-pick" data-dfs-pick="${id}" aria-pressed="${picked}" aria-label="${picked ? `Remove ${name} from slip` : `Add ${name} to slip`}" title="${picked ? 'Remove from slip' : 'Add to slip'}" ${isContestPlatform(platform || item.app) ? 'disabled' : ''}>${boardIcon('pin',17)}</button>
        <button type="button" class="dfs-round dfs-expand" data-dfs-expand="${id}" aria-expanded="${open}" aria-controls="${panelId(item)}" aria-label="${open ? 'Hide' : 'Compare'} prices for ${name}" title="Compare prices">${boardIcon('chevron',17)}</button>
      </div></td>
    </tr>${open ? comparison(item, threshold) : ''}`;
  }
  function table(rows, threshold) {
    return `<div class="evb-table-wrap dfs-table-wrap"><table class="evb-table dfs-table" aria-label="${esc(platform || 'All apps')} DFS player props"><thead class="dfs-thead"><tr><th scope="col">Market and event</th><th scope="col">Selection</th><th scope="col">Sharp price</th><th scope="col">Hit chance</th><th scope="col">Actions</th></tr></thead><tbody>${rows.slice(0, rowLimit).map(item => row(item,threshold)).join('')}</tbody></table></div>${rows.length > rowLimit ? `<button type="button" class="dfs-more" data-dfs-more>Show ${Math.min(ROW_PAGE, rows.length - rowLimit)} more · ${(rows.length - rowLimit).toLocaleString()} not shown</button>` : ''}`;
  }
  function togglePick(id) {
    const item = allRows().find(entry => entry.id === id);
    if (!item || isContestPlatform(platform || item.app)) return;
    if (selected.has(id)) { selected.delete(id); feedback=''; }
    else if (selected.size && appName(item.app) !== slipApp()) feedback=`This slip is for ${slipApp()}. Clear it to build a ${appName(item.app)} slip.`;
    else if (choices().some(pick=>normalize(pick.player)===normalize(item.player))) feedback='Choose one prop per player for this slip.';
    else if (selected.size >= chosenType().size) feedback=`This is a ${chosenType().size} pick slip. Remove a pick or choose a larger slip.`;
    else { if (!selected.size) slipAppName = appName(item.app); selected.add(id);feedback=''; }
  }
  function slip() {
    if (contestMode()) return `<aside class="dfs-slip-panel dfs-slip-empty"><h2>${esc(slipApp())}</h2><p>Save player research here and track contest entries in your bet tracker. Contest payouts use standings and scoring rules.</p><a href="/ev/tracker">Open bet tracker</a></aside>`;
    const picks = choices(), type = chosenType();
    const rules = type.rules, complete = picks.length === type.size;
    const result = complete && rules ? fantasySlip(picks,rules,entry) : null;
    const title = `${slipApp()} ${type.size} Pick${type.kind ? ' '+type.kind : ''}`;
    if (!picks.length) return `<aside class="dfs-slip-panel dfs-slip-empty" aria-label="Selected picks"><h2>Add a pick to get started</h2><p>Selections for ${esc(title)} will appear here.</p><div class="dfs-slip-placeholder" aria-hidden="true">${Array.from({length:Math.min(type.size,6)},()=>'<div><i></i><span></span></div>').join('')}</div></aside>`;
    return `<aside class="dfs-slip-panel" aria-label="Selected picks" tabindex="-1"><button type="button" class="dfs-return" data-dfs-return>Back to props</button><div class="dfs-slip-heading"><div><h2>Your picks <span>${picks.length}/${type.size}</span></h2><p>${esc(title)}</p></div><button type="button" data-dfs-clear class="dfs-text-button">Clear</button></div><div class="dfs-selected-picks">${picks.map(item => `<div class="dfs-slip-pick">${teamMark(item)}<div><strong>${esc(item.player)}</strong><span>${esc(item.side)} ${esc(item.line)} ${esc(item.market)}</span><small>${percent(item.probability)} estimated</small></div><button type="button" class="dfs-icon-button evb-icon" data-dfs-remove="${esc(item.id)}" aria-label="Remove ${esc(item.player)}">${icon('close')}</button></div>`).join('')}</div><div class="dfs-slip-total"><label for="dfs-entry">Entry amount</label><div class="dfs-entry-field"><span>$</span><input id="dfs-entry" type="number" min="1" step="0.01" value="${entry}" inputmode="decimal" aria-label="Entry amount"></div><dl><div><dt>Full-hit payout</dt><dd>${rules ? `${Number(rules.at(-1))}×` : 'Not entered'}</dd></div><div><dt>Estimated return</dt><dd>${result ? money(result.payout*entry) : '—'}</dd></div><div><dt>Expected profit</dt><dd${result?.expectedProfit > 0 ? ' class="dfs-profit"' : ''}>${result ? money(result.expectedProfit) : '—'}</dd></div></dl><button type="button" class="dfs-save-slip" data-dfs-${rules ? 'save' : 'configure'} ${complete ? '' : 'disabled'}>${!complete ? picks.length > type.size ? `Remove ${picks.length-type.size} pick${picks.length-type.size > 1 ? 's' : ''}` : `Add ${type.size-picks.length} more pick${type.size-picks.length > 1 ? 's' : ''}` : rules ? 'Save slip' : 'Set payout rules'}</button><p class="dfs-slip-note">${'Saved locally. No entry is placed.'} ${result ? 'Return assumes independent picks.' : ''}</p></div></aside>`;
  }
  function slipDock() {
    if (contestMode()) return '';
    const picks = choices(), type = chosenType();
    if (!picks.length) return '';
    const complete = picks.length === type.size;
    const result = complete && type.rules ? fantasySlip(picks,type.rules,entry) : null;
    return `<div class="dfs-slip-dock" aria-label="Slip summary"><button type="button" data-dfs-review><strong>${picks.length}/${type.size} picks · Review</strong><span>${result ? `${(result.expectedProfit / entry * 100).toFixed(1)}% est. EV` : `${Math.max(0,type.size-picks.length)} more picks needed`}${getState().demoPermanent ? ' · Demo' : ''}</span></button><button type="button" data-dfs-${type.rules ? 'save' : 'configure'} ${complete ? '' : 'disabled'}>${type.rules ? 'Save slip' : 'Set payouts'}</button></div>`;
  }
  function render({initialSport = ''} = {}) {
    const workspace = getState();
    const preview = noProps();
    if (previousPreview !== null && previousPreview !== preview) {
      platform = null;
      filterSport = initialSport || '';
      market = ''; query = ''; expanded = ''; feedback = ''; selected.clear(); hidden.clear(); excludedPlatforms.clear();
    }
    previousPreview = preview;
    if (filterSport === undefined) filterSport = initialSport || '';
    const source = allRows(), ids = new Set(source.map(item => item.id)), appCounts = new Map(), sportSet = new Set();
    for (const item of source) { const app = appName(item.app); appCounts.set(app, (appCounts.get(app) || 0) + 1); if (item.sport) sportSet.add(item.sport); }
    leadApp = [...appCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    if (platform === null) platform = appCounts.size === 1 ? leadApp : '';
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    if (!selected.size) slipAppName = '';
    if (!types().some(type => type.id === slipType)) slipType = types()[1].id;
    // Sports in the feed, the major leagues first; a sport picked from the URL stays listed.
    if (filterSport) sportSet.add(filterSport);
    const sports = [...sportSet].sort((a, b) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const app = slipApp(), payoutFrom = workspace.payoutSource?.(app, chosenType().size);
    const payoutNote = payoutFrom === 'api' ? `${app} payouts from the quote feed` : payoutFrom === 'standard' ? `${app}'s published standard payouts` : payoutFrom === 'saved' ? `Your saved ${app} payouts` : `${app} payout rules needed`;
    const bookProps = quotes().some(q => q.player);
    const type = chosenType(), threshold = breakEven(type.rules);
    const platforms = DFS_PLATFORMS;
    const rows = matched();
    const markets = [...new Set(source.filter(item => !filterSport || item.sport === filterSport).map(item => item.market))];
    const priced = rows.some(item => validProbability(item.probability));
    const hitNote = rows.length && !priced ? `<p class="dfs-feed-note" role="note">${bookProps ? 'No sportsbook odds match these props yet, so hit chances and slip EV are blank.' : 'Hit chance needs sportsbook odds on the same player prop. The quote feed has game lines only right now, so hit chances and slip EV are blank.'} The feed’s own probability is the same on every pick, so it isn’t shown as a hit chance.</p>` : '';
    const topEstimate = Math.max(...rows.map(item => Number(item.probability)).filter(value => validProbability(value)));
    const summary = `<div class="dfs-results-toolbar evb-summary"><p><strong>${rows.length} ${rows.length === 1 ? 'prop' : 'props'}</strong> from ${esc(platform || 'all apps')}${filterSport ? ` · ${esc(filterSport)}` : ''}</p><div class="dfs-summary-side"><dl>${threshold == null ? '' : `<div><dt>Break even</dt><dd class="is-positive">${percent(threshold)}</dd></div>`}<div><dt>Top est.</dt><dd>${Number.isFinite(topEstimate) ? percent(topEstimate) : '—'}</dd></div>${contestMode() ? '' : `<div><dt>Picks</dt><dd>${choices().length}/${type.size}</dd></div>`}</dl>${hidden.size ? `<button type="button" data-dfs-restore class="dfs-text-button">Show ${hidden.size} hidden</button>` : ''}<label class="dfs-sort-label">Sort by <select size="1" id="dfs-sort" aria-label="Sort DFS props"><option value="probability" ${sort==='probability' ? 'selected' : ''}>Probability</option><option value="player" ${sort==='player' ? 'selected' : ''}>Player name</option></select></label><button type="button" class="dfs-text-button" data-add="dfs">Add prop</button></div></div>`;
    return `<div class="dfs-workspace evb-board"><div class="dfs-controls"><label class="dfs-filter dfs-app-filter"><span>DFS app</span><span class="dfs-app-value">${platform ? brand(platform) : ''}<select size="1" id="dfs-platform" aria-label="DFS app"><option value="" ${platform ? '' : 'selected'}>All apps</option>${platforms.map(app => `<option ${app===platform ? 'selected' : ''}>${esc(app)}</option>`).join('')}</select></span></label><div class="dfs-slip-type" ${contestMode() ? 'hidden' : ''}><button type="button" class="dfs-slip-trigger" data-dfs-menu aria-expanded="${menuOpen}" aria-controls="dfs-slip-options"><span>Slip Type<strong>${type.size} Pick${type.kind ? ' '+esc(type.kind) : ''}${type.rules ? ` · ${Number(type.rules.at(-1))}×` : ''}${threshold == null ? '' : ` · BE ${percent(threshold)}`}</strong></span>${icon('down')}</button>${menuOpen ? `<div class="dfs-slip-options" id="dfs-slip-options" role="group" aria-label="Slip types">${types().map(option => { const value = breakEven(option.rules); return `<button type="button" data-dfs-type="${option.id}" aria-pressed="${option.id===slipType}"><span><strong>${option.size} Pick</strong> ${esc(option.kind)}${option.rules ? ` · ${Number(option.rules.at(-1))}×` : ''}</span><small>Break Even: <b>${value == null ? 'Payout rules needed' : percent(value)}</b></small>${option.id===slipType ? icon('check') : ''}</button>`; }).join('')}<p>${esc(payoutNote)}</p></div>` : ''}</div><label class="dfs-filter"><span>Sport</span><select size="1" id="dfs-sport" aria-label="DFS sport"><option value="">All sports</option>${sports.map(value=>`<option ${value===filterSport ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="dfs-filter"><span>Market</span><select size="1" id="dfs-market" aria-label="DFS market"><option value="">All markets</option>${markets.map(value=>`<option ${value===market ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="dfs-search">${icon('search')}<input id="dfs-search" type="search" placeholder="Search players or teams" value="${esc(query)}" aria-label="Search DFS players or teams"></label></div>${platformFilters()}${summary}<p class="dfs-feedback" role="status" ${feedback ? '' : 'hidden'}>${esc(feedback)}</p><div class="dfs-layout"><section class="dfs-prop-list" aria-label="DFS player props">${hitNote}${rows.length ? table(rows, threshold) : preview && workspace.dfsLoading ? '<div class="dfs-empty-results" aria-busy="true"><h2>Loading DFS lines…</h2><p>Reading PrizePicks, Underdog and other pick&#39;em lines from the quote feed.</p></div>' : preview ? '<div class="dfs-empty-results"><h2>No DFS lines in the quote feed yet</h2><p>Picks appear here when the quote feed sends PrizePicks, Underdog, Sleeper or other pick&#39;em lines. You can also add props yourself.</p></div>' : '<div class="dfs-empty-results"><h2>No matching props</h2><p>Add player research or try another sport, market or search.</p><button type="button" data-dfs-reset>Clear filters</button></div>'}</section>${slip()}</div>${slipDock()}<p class="dfs-method-note">Sharp price pairs the DFS line with the best matching recorded sportsbook price for that side. Hit chance is the no-vig sportsbook probability for the same player, market and line, shaded against the selected slip type's break-even (BE) rate; VisualOdds fair value appears in the expanded comparison. Expanded columns show sportsbook odds, then each DFS platform's line and entered estimate; a dash means unavailable.</p></div>`;
  }
  function click(event) {
    if (menuOpen && !event.target.closest('.dfs-slip-type')) {
      menuOpen = false;
      document.querySelector('#dfs-slip-options')?.remove();
      document.querySelector('[data-dfs-menu]')?.setAttribute('aria-expanded','false');
    }
    const target = event.target.closest('button');
    if (!target) {
      // Clicking anywhere on a prop row (outside its controls) opens the platform comparison, like the Positive EV board.
      const rowNode = event.target.closest('.evb-row[data-dfs-row]');
      if (!rowNode || event.target.closest('a,input,select,label,summary')) return false;
      const id = rowNode.dataset.dfsRow;
      expanded = expanded === id ? '' : id;
      repaint(`[data-dfs-expand="${CSS.escape(id)}"]`);
      return true;
    }
    if (target.hasAttribute('data-dfs-review')) {
      browsePosition = globalThis.window?.scrollY || 0;
      const panel = document.querySelector('.dfs-slip-panel');
      panel?.scrollIntoView({block:'start',behavior:'instant'});panel?.focus({preventScroll:true});
    }
    else if (target.hasAttribute('data-dfs-return')) { globalThis.window?.scrollTo?.({top:browsePosition,behavior:'instant'});document.querySelector('[data-dfs-review]')?.focus({preventScroll:true}); }
    else if (target.hasAttribute('data-dfs-menu')) { menuOpen = !menuOpen; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsType) { slipType = target.dataset.dfsType; menuOpen = false; feedback = ''; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsExpand) { const id=target.dataset.dfsExpand; expanded=expanded===id ? '' : id; repaint(`[data-dfs-expand="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsPick) { const id=target.dataset.dfsPick; togglePick(id); repaint(`[data-dfs-pick="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsTogglePick) { const id=target.dataset.dfsTogglePick; togglePick(id); repaint(`[data-dfs-toggle-pick="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsHide) { hidden.add(target.dataset.dfsHide); feedback='Prop hidden. Use Show hidden to restore it.'; repaint(); }
    else if (target.hasAttribute('data-dfs-restore')) { hidden.clear(); feedback=''; repaint(); }
    else if (target.dataset.dfsRemove) { selected.delete(target.dataset.dfsRemove); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-clear')) { selected.clear(); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-more')) { rowLimit += ROW_PAGE; repaint('[data-dfs-more]'); }
    else if (target.hasAttribute('data-dfs-reset')) { filterSport='';market='';query='';hidden.clear();rowLimit=ROW_PAGE;repaint(); }
    else if (target.hasAttribute('data-dfs-refresh')) { feedback='Comparison refreshed from the available DFS lines.'; repaint('[data-dfs-refresh]'); }
    else if (target.dataset.dfsComparePlatform) { const app=target.dataset.dfsComparePlatform; excludedPlatforms.has(app) ? excludedPlatforms.delete(app) : excludedPlatforms.add(app); repaint(`[data-dfs-compare-platform="${CSS.escape(app)}"]`); }
    else if (target.hasAttribute('data-dfs-all-platforms')) { excludedPlatforms.clear(); repaint('[data-dfs-all-platforms]'); }
    else if (target.hasAttribute('data-dfs-configure')) {
      if (choices().length === chosenType().size) onConfigure?.(choices());
    }
    else if (target.hasAttribute('data-dfs-save')) {
      const type=chosenType(), picks=choices();
      if (picks.length!==type.size || !type.rules) return true;
      feedback='Slip saved in this workspace.';
      onSave({id:crypto.randomUUID(),app:slipApp(),picks:picks.map(item=>({...item})),paytable:[...type.rules],stake:entry,ts:new Date().toISOString(),source:'manual'});
    } else return false;
    return true;
  }
  function change(event) {
    const target=event.target;
    if (['dfs-platform','dfs-sport','dfs-market','dfs-sort'].includes(target.id)) rowLimit=ROW_PAGE;
    if (target.id==='dfs-platform') {platform=target.value;slipAppName='';selected.clear();hidden.clear();expanded='';feedback='';repaint('#dfs-platform');}
    else if (target.id==='dfs-sport') {filterSport=target.value;market='';repaint('#dfs-sport');}
    else if (target.id==='dfs-market') {market=target.value;repaint('#dfs-market');}
    else if (target.id==='dfs-sort') {sort=target.value;repaint('#dfs-sort');}
    else if (target.id==='dfs-entry') {const value=Number(target.value);if(!Number.isFinite(value)||value<1){feedback='Enter an entry amount of at least $1.';}else{entry=value;feedback='';}repaint('#dfs-entry');}
    else return false;
    return true;
  }
  function input(event) {
    if(event.target.id!=='dfs-search') return false;
    const cursor=event.target.selectionStart;
    query=event.target.value;rowLimit=ROW_PAGE;redraw();
    const node=document.querySelector('#dfs-search');node.focus();node.setSelectionRange(cursor,cursor);
    return true;
  }
  function keydown(event) { if(event.key==='Escape' && menuOpen) {menuOpen=false;repaint('[data-dfs-menu]');return true;}return false; }
  return {render,click,change,input,keydown};
}
