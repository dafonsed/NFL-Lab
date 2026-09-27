import { probabilityToAmerican, fantasySlip, money, oddsLabel, decimal, fresh } from './ev-core.js';
import { teamLogo } from './sports-identity.js';
import { FANTASY_PLATFORMS, SPORTSBOOK_PLATFORMS, canonicalPlatform, platformAsset, isFantasyPlatform, isContestPlatform } from './platform-catalog.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const appName = canonicalPlatform;
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
const brand = name => {
  const asset = platformAsset(name);
  return asset ? `<img class="dfs-brand" src="${asset}" alt="${esc(name)}" width="28" height="28">` : `<span class="dfs-brand-fallback" aria-label="${esc(name)}">${esc(name.slice(0,2))}</span>`;
};
const teamMark = item => {
  const url = teamLogo({sport:String(item.sport || '').toLowerCase(),team:item.team,teamId:item.teamId,teamLogo:item.teamLogo});
  return url ? `<img class="dfs-team-logo" src="${esc(url)}" alt="${esc(item.team || '')}" width="24" height="24" loading="lazy" data-dfs-image>` : '';
};

// A frozen design fixture, not today's schedule, odds or a current roster feed.
export function dfsPreview(app = 'PrizePicks') {
  if (isContestPlatform(app)) return [];
  const rows = [
    ['podziemski','NBA','GSW','Brandin Podziemski','Golden State Warriors vs Memphis Grizzlies','Made Threes',1.5,'Over',.5646,'10:00pm'],
    ['maxey','NBA','PHI','Tyrese Maxey','Philadelphia 76ers vs Orlando Magic','Points',28.5,'Under',.5567,'7:00pm'],
    ['jokic','NBA','DEN','Nikola Jokić','Minnesota Timberwolves vs Denver Nuggets','Assists',9.5,'Under',.5560,'9:30pm'],
    ['tatum','NBA','BOS','Jayson Tatum','Boston Celtics vs New York Knicks','Points + Rebounds + Assists',37.5,'Over',.5555,'7:30pm'],
    ['curry','NBA','GSW','Stephen Curry','Golden State Warriors vs Memphis Grizzlies','Points',26.5,'Over',.5498,'10:00pm'],
    ['banchero','NBA','ORL','Paolo Banchero','Philadelphia 76ers vs Orlando Magic','Rebounds',7.5,'Under',.5410,'7:00pm'],
    ['allen','NFL','BUF','Josh Allen','Buffalo Bills vs Miami Dolphins','Passing Yards',249.5,'Over',.5590,'1:00pm'],
    ['chase','NFL','CIN','Ja’Marr Chase','Cincinnati Bengals vs Baltimore Ravens','Receiving Yards',92.5,'Over',.5470,'1:00pm'],
    ['judge','MLB','NYY','Aaron Judge','New York Yankees vs Boston Red Sox','Total Bases',1.5,'Over',.5520,'7:10pm']
  ];
  const platforms = [...new Set(['PrizePicks','Underdog Fantasy','DraftKings Pick6','Sleeper Picks','ParlayPlay','Dabble','Betr Picks',app])].filter(isDfsPlatform);
  return rows.map(row => {
    const [id,sport,team,player,event,market,line,side,probability,startLabel] = row;
    return {id:`dfs-preview-${id}`,sport,team,player,event,market,line,side,probability,startLabel,app,source:'design-preview',platformLines:platforms.map(name => ({app:name,line,over:{line},under:{line},[side.toLowerCase()]:{line,probability}}))};
  });
}

const previewTypes = [
  [2,'Power',[0,0,3]], [3,'Flex',[0,0,1.25,2.25]], [3,'Power',[0,0,0,5]],
  [4,'Flex',[0,0,0,1.5,5]], [4,'Power',[0,0,0,0,10]],
  [5,'Flex',[0,0,0,.4,2,10]], [5,'Power',[0,0,0,0,0,20]],
  [6,'Flex',[0,0,0,0,.4,2,25]], [6,'Power',[0,0,0,0,0,0,37.5]]
].map(([size,kind,rules]) => ({id:`${size}-${kind.toLowerCase()}`,size,kind,rules}));

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
export function sportsbookOffer(item, quotes = []) {
  if (item.source === 'design-preview') return null;
  const player = normalize(item.player), event = normalize(item.event);
  const marketName = value => {
    const name = normalize(value);
    return name.startsWith(player) ? name.slice(player.length) : name;
  };
  const market = marketName(item.market);
  const hasLine = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  if (!player || !event || !market || !hasLine(item.line)) return null;
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
  return [...latest.values()].sort((a,b) => decimal(b.odds) - decimal(a.odds) || a.book.localeCompare(b.book))[0] || null;
}

export function createDfsWorkspace({getState,redraw,onSave,onConfigure}) {
  let platform = '', filterSport, market = '', query = '', sort = 'probability';
  let previousPreview = null;
  let expanded = '', menuOpen = false, slipType = '3-power', entry = 10, feedback = '';
  const selected = new Set(), hidden = new Set(), excludedPlatforms = new Set();
  const isPreview = () => !getState().dfs.length;
  const allRows = () => isPreview() ? dfsPreview(platform) : getState().dfs.filter(item => isDfsPlatform(item.app));
  const payoutRules = () => {
    const tables = getState().paytables;
    return tables[platform] || Object.entries(tables).find(([name]) => appName(name) === platform)?.[1] || {};
  };
  const types = () => isPreview() && !isContestPlatform(platform) ? previewTypes : Array.from({length:5},(_,i) => ({id:`${i+2}-saved`,size:i+2,kind:'',rules:payoutRules()[String(i+2)] || null}));
  const chosenType = () => types().find(type => type.id === slipType) || types()[1];
  const choices = () => allRows().filter(item => selected.has(item.id));
  const label = item => `${item.player} ${item.side} ${item.line}`;
  const repaint = (selector) => { redraw(); if(selector) document.querySelector(selector)?.focus(); };
  const panelId = item => `dfs-detail-${encodeURIComponent(item.id).replace(/%/g,'_')}`;
  const platformOptions = DFS_PLATFORMS;
  const chosenPlatforms = () => platformOptions.filter(app => !excludedPlatforms.has(app));
  function platformFilters() {
    const count = chosenPlatforms().length;
    if (!platformOptions.length) return '';
    return `<div class="dfs-book-filters" role="group" aria-label="DFS platforms to compare"><div class="dfs-book-filter-heading"><span>DFS platforms</span><span class="dfs-book-count">${count}/${platformOptions.length}</span><button type="button" class="dfs-all-books" data-dfs-all-platforms aria-pressed="${count===platformOptions.length}">All platforms</button></div><div class="dfs-book-chips">${platformOptions.map(app => `<button type="button" class="dfs-book-chip" data-dfs-compare-platform="${esc(app)}" aria-label="Compare ${esc(app)}" aria-pressed="${!excludedPlatforms.has(app)}">${brand(app)}<span>${esc(app)}</span>${icon('check')}</button>`).join('')}</div></div>`;
  }
  const matched = () => allRows().filter(item => appName(item.app) === platform && (!filterSport || item.sport === filterSport) && (!market || item.market === market) && !hidden.has(item.id) && (!query || [item.player,item.event,item.market,item.team].some(text => String(text || '').toLowerCase().includes(query.toLowerCase())))).sort((a,b) => sort === 'player' ? a.player.localeCompare(b.player) : Number(b.probability)-Number(a.probability));
  function estimateColumn(item) {
    const probability = Number(item.probability);
    const valid = validProbability(item.probability);
    const fair = valid ? probabilityToAmerican(probability) : NaN;
    const opposite = item.side === 'Over' ? 'Under' : 'Over';
    return `<div class="dfs-book-column dfs-estimate-column" role="group" aria-label="SportsLab estimate for ${esc(label(item))}" title="SportsLab: this prop's estimated probability and equivalent fair odds."><div class="dfs-book-identity"><img class="dfs-brand" src="/favicon.svg" width="28" height="28" alt="SportsLab"><span class="dfs-book-name">SportsLab estimate</span><small title="Estimated probability for ${esc(item.side)} ${esc(item.line)}">${valid ? percent(probability) : '—'}</small></div><div class="dfs-quote dfs-estimate-quote"><span class="dfs-quote-side">${esc(item.side)} ${esc(item.line)}</span><span>${Number.isFinite(fair) ? oddsLabel(fair) : '—'}</span><small>Fair value</small></div><div class="dfs-quote dfs-estimate-quote" aria-label="No estimate entered for ${esc(opposite)} ${esc(item.line)}"><span class="dfs-quote-side">${esc(opposite)} ${esc(item.line)}</span><span>—</span><small>&nbsp;</small></div></div>`;
  }
  function comparison(item) {
    const names = chosenPlatforms();
    const platforms = selectedComparisonPlatforms(item,allRows(),names);
    const columnCount = platforms.length + 1;
    const upper = item.side.toLowerCase(), lower = upper === 'over' ? 'under' : 'over';
    const line = (platform,side) => {
      const pick = platform[side], label = side === 'over' ? 'Over' : 'Under';
      return `<div class="dfs-quote" aria-label="${esc(platform.app)} ${label} ${pick ? esc(pick.line) : 'unavailable'}"><span>${pick ? esc(pick.line) : '—'}</span><small>${pick ? label+' line' : 'No '+label.toLowerCase()+' line'}</small></div>`;
    };
    const columns = platforms.map((platform,index) => {
      const probability = platform[upper]?.probability;
      return `<div class="dfs-book-column${index<4 ? ` is-grouped${index===0 ? ' group-start' : ''}${index===Math.min(3,platforms.length-1) ? ' group-end' : ''}` : ''}" title="${esc(platform.app)}" data-platform-name="${esc(platform.app)}"><div class="dfs-book-identity">${brand(platform.app)}<span class="dfs-book-name">${esc(platform.app)}</span><small title="Entered estimate for ${esc(item.side)} ${esc(platform.line ?? '')}">${percent(probability)}</small></div>${line(platform,upper)}${line(platform,lower)}</div>`;
    }).join('');
    return `<div class="dfs-comparison" id="${panelId(item)}"><div class="dfs-comparison-toolbar"><span>${isPreview() ? 'Example DFS lines' : 'Entered DFS lines'} <b>${names.length} selected</b></span><button type="button" class="dfs-icon-button" data-dfs-refresh aria-label="Refresh displayed DFS comparison">${icon('refresh')}</button></div><div class="dfs-comparison-track" role="region" tabindex="0" aria-label="DFS platform comparison; scroll horizontally for more books"><div class="dfs-comparison-labels"><span>Platform / est.</span><span>${esc(item.side)} ${esc(item.line)}</span><span>${upper === 'over' ? 'Under' : 'Over'} ${esc(item.line)}</span></div><div class="dfs-book-grid" data-only-estimate="${platforms.length===0}" style="--dfs-book-count:${columnCount}">${estimateColumn(item)}${columns}</div></div>${!platforms.length ? '<p class="dfs-no-prices">Select a DFS platform above to compare lines.</p>' : ''}${!isPreview() ? `<button type="button" class="dfs-edit-prop" data-edit="dfs" data-id="${esc(item.id)}">Edit prop</button>` : ''}</div>`;
  }
  function row(item) {
    const open = expanded === item.id;
    const offer = sportsbookOffer(item,getState().quotes || []);
    return `<article class="dfs-prop${selected.has(item.id) ? ' is-selected' : ''}${open ? ' is-expanded' : ''}"><div class="dfs-prop-summary"><label class="dfs-pick-checkbox"><input type="checkbox" data-dfs-pick="${esc(item.id)}" ${isContestPlatform(platform) ? 'disabled' : ''} aria-label="Select ${esc(label(item))}" ${selected.has(item.id) ? 'checked' : ''}><span>${icon('check')}</span></label><div class="dfs-event"><strong>${esc(item.market)}</strong><span title="${esc(item.event || 'Matchup not entered')}">${esc(item.event || 'Matchup not entered')}</span><small>${isPreview() ? `Example · ${esc(item.startLabel)}` : item.startLabel ? esc(item.startLabel) : 'Time not entered'} · ${esc(item.sport || 'Sport')}</small></div><div class="dfs-selection"><strong>${teamMark(item)}<span>${esc(label(item))}</span></strong><small>Selection</small></div><div class="dfs-offer" title="${offer ? esc(`Best recorded sportsbook price for ${label(item)}${offer.ts ? ` · Observed ${offer.ts}` : ''}`) : 'No matching sportsbook quote recorded for this selection'}"><strong>${offer ? brand(offer.book) : ''}<span>${offer ? oddsLabel(offer.odds) : '—'}</span></strong><small>${offer ? `${offer.source === 'example' ? 'Example · ' : ''}${esc(offer.book)}` : 'No book price'}</small></div><div class="dfs-probability"><strong class="dfs-prob">${percent(item.probability)}</strong><small>Est. probability</small></div><div class="dfs-row-actions"><button type="button" class="dfs-hide dfs-icon-button" data-dfs-hide="${esc(item.id)}" aria-label="Hide ${esc(item.player)} prop">${icon('hide')}</button><button type="button" class="dfs-expand dfs-icon-button" data-dfs-expand="${esc(item.id)}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(item.player)} DFS comparison" aria-expanded="${open}" aria-controls="${panelId(item)}">${icon(open ? 'up' : 'down')}</button></div></div>${open ? comparison(item) : ''}</article>`;
  }
  function slip() {
    if (isContestPlatform(platform)) return `<aside class="dfs-slip-panel dfs-slip-empty"><h2>${esc(platform)}</h2><p>Save player research here and track contest entries in your bet tracker. Contest payouts use standings and scoring rules.</p><a href="/ev/tracker">Open bet tracker</a></aside>`;
    const picks = choices(), type = chosenType();
    const rules = type.rules, complete = picks.length === type.size;
    const result = complete && rules ? fantasySlip(picks,rules,entry) : null;
    const title = `${platform} ${type.size} Pick${type.kind ? ' '+type.kind : ''}`;
    if (!picks.length) return `<aside class="dfs-slip-panel dfs-slip-empty" aria-label="Selected picks"><h2>Add a pick to get started</h2><p>Selections for ${esc(title)} will appear here.</p><div class="dfs-slip-placeholder" aria-hidden="true">${Array.from({length:Math.min(type.size,6)},()=>'<div><i></i><span></span></div>').join('')}</div></aside>`;
    return `<aside class="dfs-slip-panel" aria-label="Selected picks"><div class="dfs-slip-heading"><div><h2>Your picks <span>${picks.length}/${type.size}</span></h2><p>${esc(title)}</p></div><button type="button" data-dfs-clear class="dfs-text-button">Clear</button></div><div class="dfs-selected-picks">${picks.map(item => `<div class="dfs-slip-pick">${teamMark(item)}<div><strong>${esc(item.player)}</strong><span>${esc(item.side)} ${esc(item.line)} ${esc(item.market)}</span><small>${percent(item.probability)} estimated</small></div><button type="button" class="dfs-icon-button" data-dfs-remove="${esc(item.id)}" aria-label="Remove ${esc(item.player)}">${icon('close')}</button></div>`).join('')}</div><div class="dfs-slip-total"><label for="dfs-entry">Entry amount</label><div class="dfs-entry-field"><span>$</span><input id="dfs-entry" type="number" min="1" step="1" value="${entry}" inputmode="decimal" aria-label="Entry amount"></div><dl><div><dt>Full-hit payout</dt><dd>${rules ? `${Number(rules.at(-1))}×` : 'Not entered'}</dd></div><div><dt>Estimated return</dt><dd>${result ? money(result.payout*entry) : '—'}</dd></div><div><dt>Expected profit</dt><dd${result?.expectedProfit > 0 ? ' class="dfs-profit"' : ''}>${result ? money(result.expectedProfit) : '—'}</dd></div></dl><button type="button" class="dfs-save-slip" data-dfs-${rules ? 'save' : 'configure'} ${complete && !isPreview() ? '' : 'disabled'}>${!complete ? picks.length > type.size ? `Remove ${picks.length-type.size} pick${picks.length-type.size > 1 ? 's' : ''}` : `Add ${type.size-picks.length} more pick${type.size-picks.length > 1 ? 's' : ''}` : isPreview() ? 'Example slip' : rules ? 'Save slip' : 'Set payout rules'}</button><p class="dfs-slip-note">${isPreview() ? 'Example lines and payout rules for this design preview.' : 'Saved locally. No entry is placed.'} ${result ? 'Return assumes independent picks.' : ''}</p></div></aside>`;
  }
  function render({initialSport = ''} = {}) {
    const workspace = getState();
    const preview = isPreview();
    if (previousPreview !== null && previousPreview !== preview) {
      platform = appName(workspace.dfs.find(item => isDfsPlatform(item.app))?.app) || 'PrizePicks';
      filterSport = initialSport || (preview ? 'NBA' : '');
      market = ''; query = ''; expanded = ''; feedback = ''; selected.clear(); hidden.clear(); excludedPlatforms.clear();
    }
    previousPreview = preview;
    if (!platform) platform = appName(workspace.dfs.find(item => isDfsPlatform(item.app))?.app) || 'PrizePicks';
    if (filterSport === undefined) filterSport = initialSport || (isPreview() ? 'NBA' : '');
    if (!types().some(type => type.id === slipType)) slipType = types()[1].id;
    const source = allRows(), ids = new Set(source.map(item => item.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    const type = chosenType(), threshold = breakEven(type.rules);
    const platforms = DFS_PLATFORMS;
    const rows = matched();
    const markets = [...new Set(source.filter(item => !filterSport || item.sport === filterSport).map(item => item.market))];
    return `<div class="dfs-workspace"><div class="dfs-controls"><label class="dfs-filter dfs-app-filter"><span>DFS app</span><span class="dfs-app-value">${brand(platform)}<select size="1" id="dfs-platform" aria-label="DFS app">${platforms.map(app => `<option ${app===platform ? 'selected' : ''}>${esc(app)}</option>`).join('')}</select></span></label><div class="dfs-slip-type" ${isContestPlatform(platform) ? 'hidden' : ''}><button type="button" class="dfs-slip-trigger" data-dfs-menu aria-expanded="${menuOpen}" aria-controls="dfs-slip-options"><span>Slip Type<strong>${type.size} Pick ${esc(type.kind)}</strong></span>${icon('down')}</button>${menuOpen ? `<div class="dfs-slip-options" id="dfs-slip-options" role="group" aria-label="Slip types">${types().map(option => { const value = breakEven(option.rules); return `<button type="button" data-dfs-type="${option.id}" aria-pressed="${option.id===slipType}"><span><strong>${option.size} Pick</strong> ${esc(option.kind)}</span><small>Break Even: <b>${value == null ? 'Payout rules needed' : percent(value)}</b></small>${option.id===slipType ? icon('check') : ''}</button>`; }).join('')}<p>${isPreview() ? 'Example payout rules' : 'Uses your saved payout rules'}</p></div>` : ''}</div><label class="dfs-filter"><span>Sport</span><select size="1" id="dfs-sport" aria-label="DFS sport"><option value="">All sports</option>${['NBA','NFL','MLB','WNBA','NHL','Soccer'].map(value=>`<option ${value===filterSport ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="dfs-filter"><span>Market</span><select size="1" id="dfs-market" aria-label="DFS market"><option value="">All markets</option>${markets.map(value=>`<option ${value===market ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label class="dfs-search">${icon('search')}<input id="dfs-search" type="search" placeholder="Search players or teams" value="${esc(query)}" aria-label="Search DFS players or teams"></label></div>${platformFilters()}<div class="dfs-results-toolbar"><span><strong>${rows.length}</strong> props${threshold == null ? '' : ` <span class="dfs-break-even">Break even <b>${percent(threshold)}</b></span>`}</span><div>${hidden.size ? `<button type="button" data-dfs-restore class="dfs-text-button">Show ${hidden.size} hidden</button>` : ''}<label>Sort by <select size="1" id="dfs-sort" aria-label="Sort DFS props"><option value="probability" ${sort==='probability' ? 'selected' : ''}>Probability</option><option value="player" ${sort==='player' ? 'selected' : ''}>Player name</option></select></label><button type="button" class="dfs-text-button" data-add="dfs">Add prop</button></div></div><p class="dfs-feedback" role="status" ${feedback ? '' : 'hidden'}>${esc(feedback)}</p><div class="dfs-layout"><section class="dfs-prop-list" aria-label="DFS player props">${rows.length ? rows.map(row).join('') : '<div class="dfs-empty-results"><h2>No matching props</h2><p>Add player research or try another sport, market or search.</p><button type="button" data-dfs-reset>Clear filters</button></div>'}</section>${slip()}</div><p class="dfs-method-note">${isPreview() ? 'Design preview with illustrative DFS lines and matchups. ' : ''}Main odds show the best matching recorded sportsbook price. Probabilities are entered estimates; SportsLab fair value appears in the expanded comparison. Platform columns show DFS lines and their entered estimates; a dash means unavailable.</p></div>`;
  }
  function click(event) {
    if (menuOpen && !event.target.closest('.dfs-slip-type')) {
      menuOpen = false;
      document.querySelector('#dfs-slip-options')?.remove();
      document.querySelector('[data-dfs-menu]')?.setAttribute('aria-expanded','false');
    }
    const target = event.target.closest('button');
    if (!target) return false;
    if (target.hasAttribute('data-dfs-menu')) { menuOpen = !menuOpen; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsType) { slipType = target.dataset.dfsType; menuOpen = false; feedback = ''; repaint('[data-dfs-menu]'); }
    else if (target.dataset.dfsExpand) { const id=target.dataset.dfsExpand; expanded=expanded===id ? '' : id; repaint(`[data-dfs-expand="${CSS.escape(id)}"]`); }
    else if (target.dataset.dfsHide) { hidden.add(target.dataset.dfsHide); feedback='Prop hidden. Use Show hidden to restore it.'; repaint(); }
    else if (target.hasAttribute('data-dfs-restore')) { hidden.clear(); feedback=''; repaint(); }
    else if (target.dataset.dfsRemove) { selected.delete(target.dataset.dfsRemove); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-clear')) { selected.clear(); feedback=''; repaint(); }
    else if (target.hasAttribute('data-dfs-reset')) { filterSport='';market='';query='';hidden.clear();repaint(); }
    else if (target.hasAttribute('data-dfs-refresh')) { feedback='Comparison refreshed from the available DFS lines.'; repaint('[data-dfs-refresh]'); }
    else if (target.dataset.dfsComparePlatform) { const app=target.dataset.dfsComparePlatform; excludedPlatforms.has(app) ? excludedPlatforms.delete(app) : excludedPlatforms.add(app); repaint(`[data-dfs-compare-platform="${CSS.escape(app)}"]`); }
    else if (target.hasAttribute('data-dfs-all-platforms')) { excludedPlatforms.clear(); repaint('[data-dfs-all-platforms]'); }
    else if (target.hasAttribute('data-dfs-configure')) {
      if (!isPreview() && choices().length === chosenType().size) onConfigure?.(choices());
    }
    else if (target.hasAttribute('data-dfs-save')) {
      const type=chosenType(), picks=choices();
      if (isPreview() || picks.length!==type.size || !type.rules) return true;
      feedback='Slip saved in this workspace.';
      onSave({id:crypto.randomUUID(),app:platform,picks:picks.map(item=>({...item})),paytable:[...type.rules],stake:entry,ts:new Date().toISOString(),source:'manual'});
    } else return false;
    return true;
  }
  function change(event) {
    const target=event.target;
    if (target.dataset.dfsPick) {
      const id=target.dataset.dfsPick, item=allRows().find(row=>row.id===id);
      if (selected.has(id)) { selected.delete(id); feedback=''; }
      else if (choices().some(pick=>normalize(pick.player)===normalize(item.player))) feedback='Choose one prop per player for this slip.';
      else if (selected.size >= chosenType().size) feedback=`This is a ${chosenType().size} pick slip. Remove a pick or choose a larger slip.`;
      else { selected.add(id);feedback=''; }
      repaint(`[data-dfs-pick="${CSS.escape(id)}"]`);
    } else if (target.id==='dfs-platform') {platform=target.value;selected.clear();hidden.clear();expanded='';feedback='';repaint('#dfs-platform');}
    else if (target.id==='dfs-sport') {filterSport=target.value;market='';repaint('#dfs-sport');}
    else if (target.id==='dfs-market') {market=target.value;repaint('#dfs-market');}
    else if (target.id==='dfs-sort') {sort=target.value;repaint('#dfs-sort');}
    else if (target.id==='dfs-entry') {entry=Math.max(1,Number(target.value)||10);repaint('#dfs-entry');}
    else return false;
    return true;
  }
  function input(event) {
    if(event.target.id!=='dfs-search') return false;
    const cursor=event.target.selectionStart;
    query=event.target.value;redraw();
    const node=document.querySelector('#dfs-search');node.focus();node.setSelectionRange(cursor,cursor);
    return true;
  }
  function keydown(event) { if(event.key==='Escape' && menuOpen) {menuOpen=false;repaint('[data-dfs-menu]');return true;}return false; }
  return {render,click,change,input,keydown};
}
