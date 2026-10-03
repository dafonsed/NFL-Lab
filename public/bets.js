import { accountStorage as localStorage, accountReady, accountSyncState } from './account-sync.js';
await accountReady;
import { platformAsset, platformOptions } from './platform-catalog.js';
import { readLimits, writeLimits, limitStatus, limitWarnings } from './bet-limits.js?v=1';
import { renderAnalytics, readDisplay, writeDisplay } from './tracker-analytics.js?v=2';
import { BET_STORAGE_KEY, STATUSES, validateBet, betReturns, closingLineValue, summarizeBets, readBets, writeBets, betsCsv, parseBetsCsv } from './bet-utils.js?v=4';
import { migrateLegacyTracker, LEGACY_EV_STORAGE_KEY } from './bet-tracker-migration.js';
import { betTrackerUrl } from './navigation.js?v=tracker-1';
import { BetLegEditor } from './bet-editor.js';
import { LEG_RESULTS, legState, ticketSettlement, gameKey, refreshTicket, formatLegTarget, validateLeg } from './bet-legs.js';
import { icon } from './ui-icons.js';
import { BetDashboard } from './bet-dashboard-v3.js?v=7';
import { BetSlipImport } from './bet-slip-import.js';
import { inlineBetCard as betComparisonCard, bindInlineComparison as bindComparison } from './bet-inline.js?v=card-click-4';
import { clearLegacyDemoStorage } from './ev-workspace-clean.js?v=1';

// The tracker shows only the member's own tickets; storage that held demo tickets is cleared.
clearLegacyDemoStorage(window.localStorage, null);
const trackerStorage = localStorage;

const $ = selector => document.querySelector(selector);
const form = $('#bet-form');
const dialog = $('#bet-dialog');
const field = name => form.elements.namedItem(name);
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const signedMoney = amount => (amount > 0 ? '+' : '') + money(amount);
const tone = amount => amount > 0 ? 'bet-positive' : amount < 0 ? 'bet-negative' : '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const sportsbookMark = book => {
  const asset = platformAsset(book);
  return asset ? `<img class="tracker-book-logo" src="${asset}" alt="${esc(book)}" width="32" height="32" decoding="async">` : icon('paper');
};
$('#tracker-platforms').innerHTML = platformOptions();
const leagueMark = sport => {
  const name = String(sport || '').toLowerCase();
  return ['nfl','nba','wnba','mlb','nhl'].includes(name)
    ? `<img class="tracker-league-logo" src="/assets/leagues/${name}.png" alt="" width="32" height="32" decoding="async">`
    : icon(name === 'soccer' ? 'soccer' : 'research');
};
const tagColor = name => [...name].reduce((value,letter)=>value+letter.charCodeAt(0),0)%4;
const shortDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month:'numeric', day:'numeric' });
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
let bets = [], editing = null, toastTimer, storageReady = false;
const activeBets = () => bets;
let dirty = false, saving = false, returnFocus = null;
let tracking=false;
const ticketSignatures = new WeakMap();
const ticketPageSize = 40;
let ticketLimit = ticketPageSize, ticketViewKey = '';
let batchingFilters = false;
function resetFilterControls() {
  batchingFilters = true;
  try {
    for (const id of ['sport-filter','status-filter','book-filter','market-filter','tool-filter','tag-filter','ticket-range']) {
      const control = $('#' + id);
      control.value = id === 'ticket-range' ? 'all' : '';
      control.dispatchEvent(new Event('change', { bubbles:true }));
    }
  } finally { batchingFilters = false; }
}
function showTicketComparison(id, trigger, force=false) {
  const bet=bets.find(item=>item.id===id),ticket=document.querySelector('.bet-ticket[data-ticket-id="'+CSS.escape(id)+'"]');
  if(!bet||!ticket)return;
  const disclosure=ticket.querySelector('.bet-ticket-disclosure');
  if(disclosure.open&&!force){disclosure.open=false;ticket.querySelector('.bet-inline-mount')?.remove();return;}
  const leg=bet.legs?.length===1?bet.legs[0]:null,book=bet.book||'Sportsbook';
  const odds=bet.oddsFormat==='american'?(Number(bet.odds)>0?'+':'')+bet.odds:String(bet.odds);
  const model={id:bet.id,book,canEdit:true,market:leg?.market||(bet.type==='parlay'?'Parlay':'Tracked bet'),sport:bet.sport,event:leg?.matchup||bet.selection,time:bet.date,selection:bet.selection,fairLabel:'Booked odds',fairOdds:odds,probabilityLabel:'Est. probability',context:STATUSES[bet.status]+' · '+money(bet.stake)+' stake',note:'This ticket stores your booked odds. A fair probability and other bookmaker prices were not recorded.',columns:[{name:book,line:leg?.line==null?'—':String(leg.line),odds}]};
  ticket.querySelector('.bet-inline-mount')?.remove();const root=document.createElement('div');root.className='bet-inline-mount';root.innerHTML=betComparisonCard(model);ticket.querySelector('.bet-ticket-detail').before(root);disclosure.open=true;
  bindComparison(root,model,{onEdit:()=>openForm(id),onCollapse:()=>{disclosure.open=false;trigger?.focus({preventScroll:true});},onRefresh:()=>showTicketComparison(id,trigger,true)});
}
$('#tracker-filter-template').replaceWith($('#tracker-filter-template').content.cloneNode(true));
// Wide screens keep the filters in a rail beside the bets; narrow screens open them from the toolbar.
const filterRail = matchMedia('(min-width: 1100px)');
const placeFilters = () => { const panel = $('#tracker-filter-panel'); (filterRail.matches ? $('.tracker-filter-rail') : $('.tracker-ledger-toolbar')).append(panel); };
placeFilters(); filterRail.addEventListener('change', placeFilters);
function showTrackerTab(tab) {
  $('.tracker-ledger-section').dataset.tab = tab;
  document.querySelectorAll('[data-tracker-tab]').forEach(button => { const active = button.dataset.trackerTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
}
document.querySelectorAll('[data-tracker-tab]').forEach(button => {
  button.addEventListener('click', () => showTrackerTab(button.dataset.trackerTab));
  button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; const next = button.dataset.trackerTab === 'bets' ? 'advanced' : 'bets'; showTrackerTab(next); document.querySelector(`[data-tracker-tab="${next}"]`).focus(); });
});
document.querySelectorAll('[data-bet-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.betIcon);});
const dashboard=new BetDashboard($('#bet-overview'),{month:today().slice(0,7),onChange:render,kpis:$('#tracker-kpis')});
const slipImport=new BetSlipImport({onDraft:draft=>openForm(null,draft)});
const editor=new BetLegEditor($('#leg-editor'),()=>{if(editor.rows.length>1)field('type').value='parlay';updateForm();});
const safeUrl=url=>/^https:\/\/(site\.api\.espn\.com|statsapi\.mlb\.com)\//.test(url||'')?esc(url):'#';
function legMarkup(leg,index){
  const state=legState(leg),o=leg.observation,actual=o?.actual;
  const threshold=formatLegTarget(leg);
  const progress=Number.isFinite(actual)&&leg.line>0&&!['spread','moneyline'].includes(leg.market)?Math.max(0,Math.min(100,actual/leg.line*100)):null;
  return `<li class="tracked-leg"><div class="leg-index">${index+1}</div><div class="leg-description"><strong>${esc(leg.label)}</strong><small>${esc([leg.sport,leg.matchup,leg.date].filter(Boolean).join(' · '))}</small><span class="leg-line">${esc(threshold)}${Number.isFinite(actual)?' <span>· '+(state==='live'?'Current':'Reported')+':</span> <b>'+actual+'</b>':''}</span>${progress!==null?`<div class="leg-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>`:''}<small>${leg.override?'Result entered manually.':esc(o?.message||'Waiting for a result refresh.')}${o?.checkedAt?' Checked '+esc(new Date(o.checkedAt).toLocaleTimeString()):''}${o?.sourceUrl?` · <a href="${safeUrl(o.sourceUrl)}" target="_blank" rel="noreferrer">Box score ↗</a>`:''}</small></div><span class="bet-result ${state}">${LEG_RESULTS[state]}</span></li>`;
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#bet-toast').textContent = message;
  $('#bet-toast').hidden = false;
  toastTimer = setTimeout(() => { $('#bet-toast').hidden = true; }, 4000);
}

function load() {
  try {
    const notice = $('#tracker-migration-notice');
    try {
      const { migrated, skipped } = migrateLegacyTracker(localStorage);
      notice.textContent = skipped
        ? `${skipped} older EV record(s) need correction before import. The original records remain in your saved EV workspace export.`
        : migrated ? `${migrated} saved bet(s) brought over from EV Tools.` : '';
    } catch {
      notice.textContent = 'Older EV records could not be imported. Your original records are still saved; check browser storage or export them from EV Tools.';
    }
    notice.hidden = !notice.textContent;
    bets = readBets(trackerStorage);
    storageReady = true;
    $('#storage-error').hidden = true;
  } catch {
    storageReady = false;
    $('#storage-error').textContent = 'Saved bets could not be read. Check browser storage permissions and reload. Existing data has not been overwritten.';
    $('#storage-error').hidden = false;
  }
  $('#add-bet').disabled = !storageReady;
  $('#import-slip').disabled = !storageReady;
  // Deep link from onboarding: /bets?add=1 opens the Add Bet form once, then cleans the URL.
  if (storageReady && new URLSearchParams(location.search).get('add') === '1') {
    const clean = new URL(location.href); clean.searchParams.delete('add'); history.replaceState(history.state, '', clean);
    requestAnimationFrame(() => openForm());
  }
  render();
}

function filteredBets(ignoreStatus=false) {
  const query = $('#bet-search').value.trim().toLowerCase();
  const sport = $('#sport-filter').value, status = ignoreStatus?'':$('#status-filter').value,book=$('#book-filter').value;
  const market=$('#market-filter').value,tool=$('#tool-filter').value,tag=$('#tag-filter').value;
  return dashboard.periodBets(activeBets()).filter(bet => (!dashboard.selectedDay||bet.date===dashboard.selectedDay) && ($('#ticket-range').value==='all'||bet.date.startsWith(dashboard.month)) && (!book||(bet.book||'No sportsbook')===book) && (!sport || bet.sport === sport || bet.legs?.some(l=>l.sport===sport)) && (!market||bet.market===market) && (!tool||(bet.tool||'Manual')===tool) && (!tag||bet.tags?.includes(tag)) && (!status || (status === 'settled' ? bet.status !== 'open' : bet.status === status)) && (!query || `${bet.selection} ${bet.book} ${bet.market} ${bet.tool} ${bet.tags?.join(' ')} ${bet.notes} ${(bet.legs||[]).map(l=>l.label+' '+l.matchup).join(' ')}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

const expandedInsights = new Set();
function renderInsights(items) {
  const sections = [
    ['Leagues', 'sport-filter', bet => [bet.sport], 'league', 'research'],
    ['Platforms', 'book-filter', bet => [bet.book || 'No sportsbook'], 'book', 'picks'],
    ['Markets', 'market-filter', bet => bet.market ? [bet.market] : [], 'market', 'performance'],
    ['Your tags', 'tag-filter', bet => bet.tags || [], 'tag', 'tag'],
    ['Sources', 'tool-filter', bet => [bet.tool || 'Manual'], 'tool', 'research']
  ];
  $('#tracker-insights').innerHTML = renderAnalytics(items, readDisplay(trackerStorage)) + sections.map(([title,filter,keys,kind,glyph]) => {
    const groups = new Map();
    for (const bet of items) for (const value of keys(bet)) { if (!groups.has(value)) groups.set(value,[]); groups.get(value).push(bet); }
    const rows = [...groups].map(([name,bets]) => ({name,total:summarizeBets(bets)})).sort((a,b) => b.total.profit-a.total.profit);
    const scale = Math.max(...rows.map(({total}) => Math.abs(total.profit)), 0.01);
    const row = ({name,total}) => {
      const active = $('#'+filter).value === name;
      const mark = kind === 'book' ? sportsbookMark(name) : kind === 'league' ? leagueMark(name) : icon(kind === 'market' ? 'performance' : kind === 'tool' ? 'research' : 'tag');
      return `<button type="button" class="tracker-insight-row" data-summary-filter="${filter}" data-summary-value="${esc(name)}" aria-pressed="${active}" aria-label="${active?'Remove filter for':'Filter tickets by'} ${esc(name)}"><span class="tracker-insight-mark ${kind} mark-${tagColor(name)}" aria-hidden="true">${mark}</span><span class="tracker-insight-name"><strong>${esc(name)}</strong><small>${total.won} won <span>·</span> ${total.lost} lost${total.open?' <span>·</span> '+total.open+' open':''}</small><span class="tracker-insight-bar" aria-hidden="true"><i class="${tone(total.profit)}" style="width:${Math.max(total.profit ? 4 : 0, Math.abs(total.profit) / scale * 100).toFixed(1)}%"></i></span></span><strong class="tracker-insight-profit ${tone(total.profit)}">${signedMoney(total.profit)}</strong><span class="tracker-insight-plus" aria-hidden="true">${icon(active?'check':'plus')}</span></button>`;
    };
    const expanded = expandedInsights.has(kind);
    const collectionName = {tag:'tags',league:'leagues',book:'platforms',market:'markets',tool:'sources'}[kind];
    return `<section class="tracker-insight-section" data-insight-kind="${kind}"><div class="tracker-insight-heading"><span class="bt-icon-tile" aria-hidden="true">${icon(glyph)}</span><h2>${title}<span>${rows.length}</span></h2><span>Net profit</span></div><div class="tracker-insight-card">${rows.length ? rows.slice(0,expanded?rows.length:3).map(row).join('') : '<p class="tracker-insight-empty">Your results will appear here.</p>'}</div>${rows.length>3 ? `<button type="button" class="tracker-insight-toggle" data-insight-toggle="${kind}" aria-expanded="${expanded}">${expanded?'Show fewer '+collectionName:`Show all ${rows.length} ${collectionName}`}${icon('chevron')}</button>` : ''}</section>`;
  }).join('');
}

// Analysis controls: dollars/units switch, unit size and starting bankroll.
$('#tracker-insights').addEventListener('click', event => {
  const button = event.target.closest('[data-ta-units]');
  if (!button) return;
  const display = readDisplay(trackerStorage);
  try { writeDisplay(trackerStorage, { ...display, units: button.dataset.taUnits === 'true' }); } catch { /* storage blocked */ }
  render();
});
$('#tracker-insights').addEventListener('change', event => {
  const input = event.target.closest('[data-ta-field]');
  if (!input) return;
  const display = readDisplay(trackerStorage);
  try { writeDisplay(trackerStorage, { ...display, [input.dataset.taField]: Number(input.value) || null }); } catch { /* storage blocked */ }
  render();
});

// Self-set limits: a status strip above the ledger and a check before new tickets are saved.
function renderLimits() {
  const strip = $('#bet-limits-status');
  if (!strip) return;
  const limits = readLimits(trackerStorage);
  // Limits always measure the account's real tickets, even while example tickets are on screen.
  if (!limits.weeklyStake && !limits.monthlyLoss && !limits.pauseUntil) { strip.hidden = true; strip.innerHTML = ''; return; }
  const status = limitStatus(bets, limits);
  const meter = (label, used, cap, over) => `<div class="bet-limit${over ? ' is-over' : ''}"><span>${label}</span><strong>${money(used)} <small>of ${money(cap)}</small></strong><i style="--fill:${Math.min(100, used / cap * 100).toFixed(1)}%"></i></div>`;
  strip.innerHTML = [
    status.pauseUntil ? `<div class="bet-limit is-break"><span>Break</span><strong>Until ${new Date(status.pauseUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></div>` : '',
    status.weeklyStake ? meter('Staked this week', status.weekStake, status.weeklyStake, status.overWeekly) : '',
    status.monthlyLoss ? meter('Lost this month', status.monthLoss, status.monthlyLoss, status.overMonthly) : '',
  ].join('');
  strip.hidden = false;
}
const limitsDialog = $('#limits-dialog'), limitsForm = $('#limits-form');
$('#open-limits').addEventListener('click', () => {
  const limits = readLimits(trackerStorage);
  limitsForm.elements.weeklyStake.value = limits.weeklyStake ?? '';
  limitsForm.elements.monthlyLoss.value = limits.monthlyLoss ?? '';
  limitsForm.elements.pause.value = limits.pauseUntil && Date.parse(limits.pauseUntil) > Date.now() ? 'keep' : '';
  limitsForm.elements.pause.querySelector('[value=keep]').hidden = limitsForm.elements.pause.value !== 'keep';
  limitsDialog.showModal();
});
$('#cancel-limits').addEventListener('click', () => limitsDialog.close());
limitsForm.addEventListener('submit', event => {
  event.preventDefault();
  const current = readLimits(trackerStorage), pause = limitsForm.elements.pause.value;
  const days = Number(pause);
  try {
    writeLimits(trackerStorage, {
      weeklyStake: Number(limitsForm.elements.weeklyStake.value) || null,
      monthlyLoss: Number(limitsForm.elements.monthlyLoss.value) || null,
      pauseUntil: pause === 'keep' ? current.pauseUntil : days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
    limitsDialog.close(); renderLimits(); toast('Limits saved.');
  } catch { toast('Your limits could not be saved. Check that site storage is allowed.'); }
});
function confirmLimits(bet) {
  const reasons = limitWarnings(bets, readLimits(trackerStorage), bet);
  if (!reasons.length) return Promise.resolve(true);
  const warning = $('#limit-warning-dialog');
  $('#limit-warning-reasons').replaceChildren(...reasons.map(text => Object.assign(document.createElement('li'), { textContent: text })));
  return new Promise(resolve => {
    const finish = value => { warning.close(); $('#limit-continue').onclick = $('#limit-cancel').onclick = null; resolve(value); };
    $('#limit-continue').onclick = () => finish(true);
    $('#limit-cancel').onclick = () => finish(false);
    warning.addEventListener('cancel', () => finish(false), { once: true });
    warning.showModal(); $('#limit-cancel').focus();
  });
}

function render() {
  renderLimits();
  if (batchingFilters) return;
  const selectedSport = $('#sport-filter').value.toLowerCase();
  const target = new URL(betTrackerUrl(selectedSport), location.origin);
  const current = new URL(location.href);
  if (target.searchParams.has('sport')) current.searchParams.set('sport', selectedSport);
  else current.searchParams.delete('sport');
  if (current.search !== location.search) history.replaceState(null, '', current.pathname + current.search + current.hash);
  document.querySelectorAll('.ev-site-header a[href]').forEach(link => {
    const url = new URL(link.href);
    if (!['/ev', '/ev/tracker', '/ev/dashboard'].includes(url.pathname)) return;
    if (selectedSport) url.searchParams.set('sport', selectedSport);
    else if (url.pathname === '/ev') url.searchParams.set('sport', 'all');
    else url.searchParams.delete('sport');
    link.href = url.pathname + url.search + url.hash;
  });
  const shown = activeBets();
  const accountState = accountSyncState();
  const storageLabel = $('.tracker-storage>span');
  const storageDetail = $('.tracker-storage>p');
  storageLabel.textContent = accountState.userId ? 'Account bet records' : 'Saved in this browser';
  storageDetail.textContent = accountState.userId
    ? 'Account changes sync while connected. Export a copy of your tickets whenever you need it.'
    : 'Tickets are saved in this browser. Sign in to sync them to your account, or export a copy.';
  document.body.classList.toggle('tracker-empty', storageReady && !shown.length);
  document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === dashboard.range)));
  $('#tracker-custom-dates').hidden = dashboard.range !== 'custom';
  $('#tracker-period-caption').textContent = dashboard.view === 'calendar' ? 'Monthly calendar' : ({'1w':'Last 7 days','1m':'Last 30 days','1y':'Last 365 days',all:'All-time performance',custom:'Custom date range'})[dashboard.range];
  if (!storageReady) {
    $('#bet-overview').innerHTML = '';
    $('#bet-list').innerHTML = '<div class="bet-empty"><h2>Your saved bets are unavailable</h2><p>Restore access to browser storage and reload to continue.</p></div>';
    $('#bet-count').textContent = 'Storage unavailable';
    $('#export-bets').disabled = true;
    return;
  }
  const hasConnectedLegs = bets.some(bet => bet.legs?.some(leg => leg.mode === 'auto'));
  $('#refresh-lines').hidden = !hasConnectedLegs;
  $('.tracking-bar').hidden = !hasConnectedLegs;
  const calendarFocus=document.activeElement?.getAttribute('data-calendar-day');
  dashboard.render(shown);
  renderInsights(dashboard.periodBets(shown));
  if(calendarFocus)document.querySelector(`[data-calendar-day="${calendarFocus}"]`)?.focus({preventScroll:true});
  for(const [id, values, label] of [
    ['book-filter',shown.map(b=>b.book||'No sportsbook'),'All sportsbooks'],
    ['market-filter',shown.map(b=>b.market).filter(Boolean),'All markets'],
    ['tool-filter',shown.map(b=>b.tool||'Manual'),'All tools'],
    ['tag-filter',shown.flatMap(b=>b.tags||[]),'All tags']
  ]){
    const control=$('#'+id),selected=control.value;
    control.innerHTML=`<option value="">${label}</option>`+[...new Set(values)].sort().map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
    control.value=selected;
  }
  $('#selected-bet-day').hidden=!dashboard.selectedDay;
  $('#selected-bet-day').innerHTML=dashboard.selectedDay?`<span>Tickets placed ${esc(new Date(dashboard.selectedDay+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}))}</span><button class="tracker-button" type="button" data-clear-day>Show the whole month ${icon('close')}</button>`:'';
  const selectedStatus = $('#status-filter').value;
  document.querySelectorAll('[data-ticket-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ticketView === (selectedStatus && selectedStatus !== 'open' ? 'settled' : selectedStatus))));
  const counted=filteredBets(true),openCount=counted.filter(b=>b.status==='open').length;
  const ticketCounts = { all: counted.length, open: openCount, settled: counted.length - openCount };
  document.querySelectorAll('[data-ticket-count]').forEach(element => { element.textContent = ticketCounts[element.dataset.ticketCount]; });
  const expanded=new Set([...document.querySelectorAll('.bet-ticket details[open]')].map(el=>el.closest('[data-ticket-id]').dataset.ticketId+':'+el.className));
  const focusedEdit=document.activeElement?.dataset.edit;
  const viewKey = JSON.stringify([dashboard.range, dashboard.view, dashboard.month, dashboard.selectedDay, dashboard.customStart, dashboard.customEnd,
    ...['bet-search','sport-filter','status-filter','book-filter','market-filter','tool-filter','tag-filter','ticket-range'].map(id => $('#' + id).value)]);
  if (viewKey !== ticketViewKey) { ticketLimit = ticketPageSize; ticketViewKey = viewKey; }
  const matching = filteredBets();
  const visible = matching.slice(0, ticketLimit);
  const hasFilter = !!($('#bet-search').value || $('#sport-filter').value || $('#status-filter').value || $('#book-filter').value || $('#market-filter').value || $('#tool-filter').value || $('#tag-filter').value || dashboard.selectedDay || $('#ticket-range').value==='month');
  $('#clear-filters').hidden = !hasFilter;
  const filterCount = ['book-filter','sport-filter','market-filter','tool-filter','tag-filter','status-filter'].filter(id=>$('#'+id).value).length + Number($('#ticket-range').value === 'month');
  $('#tracker-filter-count').textContent = filterCount;
  $('#tracker-filter-count').hidden = !filterCount;
  $('#tracker-filter-toggle').dataset.filtered = String(filterCount > 0);
  const activeFilters = ['book-filter','sport-filter','market-filter','tool-filter','tag-filter'].filter(id=>$('#'+id).value);
  $('#tracker-active-filters').hidden = !activeFilters.length;
  $('#tracker-active-filters').innerHTML = '<span class="tracker-filter-label">Filtered by</span>' + activeFilters.map(id=>`<button type="button" class="tracker-filter-chip" data-remove-filter="${id}" aria-label="Remove ${esc($('#'+id).value)} filter">${esc($('#'+id).value)}${icon('close')}</button>`).join('') + '<button type="button" class="tracker-reset-filters" data-clear-ticket-filters>Clear filters</button>';
  $('#bet-count').textContent = shown.length ? `${visible.length}${matching.length > visible.length ? ` of ${matching.length}` : ''} ${matching.length === 1 ? 'ticket' : 'tickets'} shown · Newest first` : 'Your tickets will appear here';
  $('#export-bets').disabled = !visible.length;
  $('#export-bets').innerHTML = icon('download')+' Export CSV';
  $('#export-bets').setAttribute('aria-label', 'Export visible tickets as CSV');
  if (!visible.length) {
    $('#bet-list').innerHTML = shown.length
      ? `<div class="bet-empty"><span class="bet-empty-icon" aria-hidden="true">${icon('search')}</span><div class="bet-empty-copy"><h3>No tickets in this view</h3><p>Try another month or clear your filters to see more tickets.</p></div><div class="bet-empty-actions"><button class="tracker-button" data-clear>Show all tickets</button></div></div>`
      : `<div class="bet-empty"><span class="bet-empty-icon" aria-hidden="true">${icon('picks')}</span><div class="bet-empty-copy"><h3>Start with your first ticket</h3><p>Log a bet to see its result in your calendar, profit chart, and activity.</p></div><div class="bet-empty-actions"><button class="tracker-button primary" data-add>${icon('plus')} Add a bet</button><button class="tracker-button" data-import>${icon('paper')} Import screenshot</button></div></div>`;
    return;
  }
  const groups = new Map();
  for (const bet of visible) {
    if (!groups.has(bet.date)) groups.set(bet.date, []);
    groups.get(bet.date).push(bet);
  }
  const ledgerMarkup = `<div class="bet-ledger">${[...groups].map(([date, items]) => {
    const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const settled = items.filter(bet => bet.status !== 'open');
    const dayProfit = settled.reduce((sum, bet) => sum + (betReturns(bet).profit || 0), 0);
    return `<div class="bet-day-group" data-bet-date="${esc(date)}"><div class="bet-day-heading"><h3>${esc(day)}</h3><span class="${tone(dayProfit)}">${settled.length ? signedMoney(dayProfit) : `${items.length} open`}</span></div>${items.map(bet => {
      const result = betReturns(bet), legs = bet.legs || [];
      const repricing = bet.settlement === 'auto' && ticketSettlement(legs).needsReturn;
      const odds = bet.oddsFormat === 'american' ? `${bet.odds > 0 ? '+' : ''}${bet.odds}` : String(bet.odds);
      const net = result.profit ?? result.potentialProfit;
      const book = bet.book || 'No sportsbook';
      const mark = sportsbookMark(bet.book);
      const clv=closingLineValue(bet);
      return `<article class="bet-ticket" data-ticket-id="${esc(bet.id)}"><details class="bet-ticket-disclosure"><summary class="bet-row"><span class="bet-book-mark">${mark}</span><span class="bet-description"><strong class="bet-selection">${bet.market ? `<span class="bet-market-name">${esc(bet.market)}</span> · ` : ''}${esc(bet.selection)}</strong><small>${bet.status === 'won' || bet.status === 'lost' ? '' : `<span class="bet-status-pill is-${esc(bet.status)}">${esc(STATUSES[bet.status])}</span>`}${bet.event ? `<span class="bet-meta-event">${esc(bet.event)}</span><i aria-hidden="true"></i>` : ''}<span class="bet-meta-league">${leagueMark(bet.sport)}${esc(bet.sport)}</span><i aria-hidden="true"></i><span>${esc(shortDay(bet.date))}</span><i aria-hidden="true"></i><span>${esc(book)}</span></small></span><span class="bet-row-result"><strong class="${bet.status === 'open' ? 'pending' : tone(net)}">${repricing ? '—' : signedMoney(net)}</strong><small><span class="bet-result-note">${bet.status === 'open' ? `To win · ${money(bet.stake)} stake` : `${clv === null ? '—' : `${clv > 0 ? '+' : ''}${clv.toFixed(1)}%`} price CLV`}</span><span class="bet-price">${esc(odds)}</span></small></span><span class="bet-row-chevron" aria-hidden="true">${icon('chevron')}</span></summary><div class="bet-ticket-detail ticket-receipt"><dl class="ticket-receipt-grid"><div><dt>Stake</dt><dd>${money(bet.stake)}</dd></div><div><dt>Booked odds <span>${bet.oddsFormat === 'decimal' ? 'Decimal' : 'American'}</span></dt><dd>${esc(odds)}</dd></div><div class="ticket-receipt-return"><dt>${bet.status === 'open' ? 'Potential return' : 'Total returned'}</dt><dd>${repricing ? '—' : money(result.returned ?? result.potentialReturn)}</dd></div><div><dt>Closing line value</dt><dd class="${tone(clv)}">${clv === null ? '—' : `${clv > 0 ? '+' : ''}${clv.toFixed(2)}%`}</dd></div></dl>${bet.notes ? `<div class="ticket-receipt-note"><span>Notes</span><p>${esc(bet.notes)}</p></div>` : ''}${legs.length ? `<div class="ticket-tracking"><p class="leg-summary"><strong>${legs.filter(leg => legState(leg) === 'won').length} / ${legs.length} legs hit</strong><span>${esc(bet.settlement === 'auto' ? ticketSettlement(legs).note : 'Ticket result set from sportsbook.')}</span></p><ol class="tracked-legs">${legs.map(legMarkup).join('')}</ol></div>` : ''}<div class="ticket-receipt-footer"><span class="ticket-receipt-source"><span>Source</span><strong>${esc(bet.tool || 'Manual')}</strong></span>${bet.tags?.length ? `<div class="ticket-receipt-tags" aria-label="Ticket tags">${bet.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>` : ''}${`<button class="ticket-receipt-edit" type="button" data-edit="${esc(bet.id)}" aria-label="Edit ${esc(bet.selection)}">Edit ticket ${icon('chevron')}</button>`}</div></div></details></article>`;
    }).join('')}</div>`;
  }).join('')}</div>`;
  // Reuse unchanged tickets during price/result refreshes and filtering. This
  // keeps native disclosures, focus and scroll anchors attached to their nodes.
  const template = document.createElement('template');
  template.innerHTML = ledgerMarkup;
  const signatures = new Map(visible.map(bet => [bet.id, JSON.stringify(bet)]));
  template.content.querySelectorAll('.bet-ticket').forEach(node => ticketSignatures.set(node, signatures.get(node.dataset.ticketId)));
  template.content.querySelectorAll('.bet-ticket details').forEach(el => { el.open = expanded.has(el.closest('[data-ticket-id]').dataset.ticketId + ':' + el.className); });
  const currentLedger = $('#bet-list .bet-ledger');
  if (!currentLedger) $('#bet-list').replaceChildren(template.content);
  else {
    const reconcile = (parent, children, key) => {
      const existing = new Map([...parent.children].map(node => [key(node), node]));
      let index = 0;
      for (const next of children) {
        const old = existing.get(key(next));
        let node = next;
        if (old) {
          if (next.matches('.bet-day-group')) { reconcile(old, [...next.children], child => child.dataset.ticketId || 'heading'); node = old; }
          else if (next.matches('.bet-ticket') ? ticketSignatures.get(old) === ticketSignatures.get(next) : old.outerHTML === next.outerHTML) node = old;
        }
        if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] || null);
        index++;
      }
      while (parent.children.length > index) parent.lastElementChild.remove();
    };
    reconcile(currentLedger, [...template.content.firstElementChild.children], node => node.dataset.betDate);
  }
  let more = $('#bet-list [data-more-tickets]');
  if (matching.length > visible.length) {
    if (!more) { more = document.createElement('button'); more.type = 'button'; more.className = 'tracker-button tracker-more-tickets'; more.dataset.moreTickets = ''; $('#bet-list').append(more); }
    more.textContent = `Show ${Math.min(ticketPageSize, matching.length - visible.length)} more tickets · ${matching.length - visible.length} remaining`;
  } else more?.remove();
  document.querySelectorAll('.bet-ticket details').forEach(el=>{el.open=expanded.has(el.closest('[data-ticket-id]').dataset.ticketId+':'+el.className);});
  document.querySelectorAll('.bet-ticket-disclosure[open]').forEach(el=>showTicketComparison(el.closest('[data-ticket-id]').dataset.ticketId,el.querySelector('summary'),true));
  if(focusedEdit)[...document.querySelectorAll('[data-edit]')].find(el=>el.dataset.edit===focusedEdit)?.focus({preventScroll:true});
}

function clearFilters() {
  $('#bet-search').value = '';
  resetFilterControls();
  dashboard.selectedDay='';
  render();
}

function updateForm() {
  $('#bet-notes-count').textContent = `${field('notes').value.length}/2000`;
  const automatic=field('settlement').value==='auto';
  const legs=editor.values();
  if(automatic)field('status').value=ticketSettlement(legs).status;
  field('status').disabled=automatic;
  $('#result-help').hidden = !automatic;
  $('#actual-return-field').hidden=automatic||field('status').value!=='won';
  field('returnOverride').disabled=$('#actual-return-field').hidden;
  const decimal = field('oddsFormat').value === 'decimal';
  field('odds').step = decimal ? 'any' : '1';
  field('odds').placeholder = decimal ? '1.91' : '−110';
  $('#odds-help').textContent = decimal ? 'Enter decimal odds greater than 1.' : 'Use +100 or higher, or −100 or lower.';
  const cashed = field('status').value === 'cashed';
  $('#cashout-field').hidden = !cashed;
  field('cashout').required = cashed;
  field('cashout').disabled = !cashed;
  try {
    const input = {...Object.fromEntries(new FormData(form)),status:field('status').value};
    // The preview does not require a description to have been typed yet.
    const result = betReturns(validateBet({ ...input, selection: input.selection || 'Preview',settlement:'manual' }));
    if(automatic&&ticketSettlement(legs).needsReturn){$('#return-preview').textContent=ticketSettlement(legs).note;return;}
    $('#return-preview').innerHTML = input.status === 'open'
      ? `If won: <strong>${money(result.potentialReturn)}</strong> total return · <strong>${signedMoney(result.potentialProfit)}</strong> net profit`
      : `Total return: <strong>${money(result.returned)}</strong> · Net profit / loss: <strong>${signedMoney(result.profit)}</strong>`;
  } catch {
    $('#return-preview').textContent = 'Enter a valid stake and odds' + (cashed ? ', plus the cash-out return' : '') + ' to preview your return.';
  }
}

function openForm(id, draft) {
  if (!storageReady) return;
  editing = id ? bets.find(bet => bet.id === id) : null;
  if (id && !editing) return;
  returnFocus = document.activeElement;
  clearFormErrors();
  form.reset();
  field('date').value = today();
  if (!editing && $('#sport-filter').value) field('sport').value = $('#sport-filter').value;
  field('freeBet').checked = !!editing?.freeBet;
  if (editing) for (const [key, value] of Object.entries(editing)) { if (!field(key)) continue; if (field(key).type === 'checkbox') field(key).checked = value === true; else field(key).value = key === 'tags' ? value.join(', ') : value ?? ''; }
  field('settlement').value=editing?.settlement||'manual';
  editor.reset(editing?.legs||[],field('sport').value,field('date').value);
  $('#ticket-selections').open=!!(editing?.legs?.length||draft?.legs?.length);
  $('#slip-form-review').hidden=!draft;
  if(draft){
    for(const [key,value] of Object.entries(draft.fields))if(field(key)){if(field(key).type==='checkbox')field(key).checked=value===true||value==='on';else field(key).value=value??'';}
    editor.reset(draft.legs.map(leg=>({...leg,id:crypto.randomUUID()})),field('sport').value,field('date').value);
    $('#slip-form-review').innerHTML=`<strong>${icon('paper')} Review your imported ticket</strong><p>Check the stake, combined odds and every selection against your screenshot. Imported selections use manual results until you connect them to a game.</p>${draft.preview?'<details class="imported-slip-source"><summary>View original screenshot</summary><img alt="Original screenshot for checking your ticket" src="'+esc(draft.preview)+'"></details>':''}${draft.issues.length?'<ul>'+draft.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':''}`;
    returnFocus=$('#import-slip');
  }
  $('#bet-dialog-title').textContent = editing ? 'Edit Bet' : 'Add Bet';
  $('#bet-dialog-subtitle').textContent = editing ? 'Update this ticket and its result.' : 'Enter the details from your platform ticket.';
  $('#delete-bet').hidden = !editing;
  $('#form-error').hidden = true;
  updateForm();
  dirty = !!draft;
  dialog.showModal();
  $('.bet-form-body').scrollTop = 0;
  field('selection').focus();
}

function clearFormErrors() {
  form.querySelectorAll('[aria-invalid]').forEach(control => {
    control.removeAttribute('aria-invalid');
    const ids = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => !id.startsWith('ticket-error-'));
    if (ids.length) control.setAttribute('aria-describedby', ids.join(' ')); else control.removeAttribute('aria-describedby');
  });
  form.querySelectorAll('.field-error').forEach(error => error.remove());
  $('#form-error').hidden = true;
}

function showFormError(message, control) {
  $('#form-error').textContent = message;
  $('#form-error').hidden = false;
  if (control && !control.disabled) {
    const error = document.createElement('small');
    error.id = 'ticket-error-' + crypto.randomUUID(); error.className = 'field-error'; error.textContent = message;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    control.after(error); control.focus({preventScroll:true}); control.scrollIntoView({block:'center'});
  } else {
    $('#form-error').focus({preventScroll:true}); $('#form-error').scrollIntoView({block:'center'});
  }
}

function errorControl(message) {
  const ticketField = /closing odds/i.test(message) ? 'closingOdds' : /odds/i.test(message) ? 'odds' : /tags/i.test(message) ? 'tags' : /Stake/.test(message) ? 'stake' : /Cash-out/.test(message) ? 'cashout' : /Actual return/.test(message) ? 'returnOverride' : /bet description/.test(message) ? 'selection' : /bet date/.test(message) ? 'date' : /single needs|parlay needs/.test(message) ? 'type' : null;
  if (ticketField) return field(ticketField);
  for (const leg of editor.values()) {
    try { validateLeg(leg); } catch {
      const group = [...form.querySelectorAll('[data-leg-id]')].find(el => el.dataset.legId === leg.id);
      const connected = leg.mode === 'auto';
      const target = connected && !leg.gameId ? '[data-search-player], [data-field=gameId]' : connected && !leg.market ? '[data-field=market]' : connected && !leg.subjectId ? '[data-search-player], [data-field=subjectId]' : /line|amount/i.test(message) ? '[data-field=line]' : /side|target/i.test(message) ? '[data-field=side]' : /result/i.test(message) ? '[data-field=override]' : '[data-field=label], [data-search-player], [data-field=gameId]';
      return group?.querySelector(target) || group?.querySelector('input,select');
    }
  }
  return null;
}

function requestClose() {
  if (saving) return;
  if (!dirty) { dialog.close(); return; }
  $('#discard-dialog').showModal(); $('#keep-editing').focus();
}
dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
dialog.addEventListener('close', () => {
  dirty = false;
  $('#slip-form-review').innerHTML='';
  const target = returnFocus?.isConnected ? returnFocus : editing ? [...document.querySelectorAll('[data-edit]')].find(el => el.dataset.edit === editing.id) : null;
  (target || $('#add-bet')).focus({preventScroll:true});
});
$('#keep-editing').addEventListener('click', () => $('#discard-dialog').close());
$('#discard-bet').addEventListener('click', () => { $('#discard-dialog').close(); dialog.close(); });
window.addEventListener('beforeunload', event => { if (dialog.open && dirty) { event.preventDefault(); event.returnValue = ''; } });
const resizeDialog = () => document.documentElement.style.setProperty('--bet-viewport', `${window.visualViewport?.height || innerHeight}px`);
window.visualViewport?.addEventListener('resize', resizeDialog); resizeDialog();

// Re-read before each write so another tab's added tickets are preserved.
function mutate(change) {
  const latest = readBets(trackerStorage);
  if (editing) {
    const current = latest.find(bet => bet.id === editing.id);
    if (!current || current.updatedAt !== editing.updatedAt) throw new Error('This bet changed in another tab. Close this form and reopen the latest ticket.');
  }
  const next = change(latest);
  try { writeBets(trackerStorage, next); }
  catch { throw new Error('Your bet could not be saved. Browser storage may be full or blocked. Your form is still here; free storage or enable site storage and retry.'); }
  bets = next;
  render();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || !dialog.open) return;
  clearFormErrors();
  const invalid = [...form.elements].find(control => control.willValidate && !control.checkValidity());
  if (invalid) { showFormError(invalid.validationMessage, invalid); return; }
  const submit = form.querySelector('[type=submit]');
  try {
    const validated = validateBet({...Object.fromEntries(new FormData(form)),status:field('status').value,legs:editor.values()});
    if (!editing && !(await confirmLimits(validated))) return;
    saving = true; submit.disabled = true; submit.textContent = 'Saving…'; form.setAttribute('aria-busy','true');
    await new Promise(resolve => requestAnimationFrame(resolve));
    const bet = { ...validated, id: editing?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    if(!editing){
      dashboard.month=bet.date.slice(0,7);
      dashboard.selectedDay='';
      $('#bet-search').value='';
      resetFilterControls();
    }
    mutate(latest => editing ? latest.map(item => item.id === editing.id ? bet : item) : [...latest, bet]);
    dialog.close();
    toast(editing ? 'Bet updated.' : 'Bet saved.');
    refreshLines({all:true});
  } catch (error) {
    showFormError(error.message, errorControl(error.message));
  } finally {
    saving = false; submit.disabled = false; submit.textContent = 'Save Bet'; form.removeAttribute('aria-busy');
  }
});
form.addEventListener('input', () => { dirty = true; clearFormErrors(); });
form.addEventListener('change', () => { dirty = true; });
form.addEventListener('click', event => { if (event.target.closest('[data-remove], [data-pick-player]')) dirty = true; });
form.addEventListener('input', updateForm);
form.addEventListener('change', updateForm);
$('#add-bet').addEventListener('click', () => openForm());
$('#import-slip').addEventListener('click',()=>slipImport.open());
$('#add-leg').addEventListener('click',()=>{ dirty = true; editor.add(field('sport').value,field('date').value); $('#leg-editor .leg-editor:last-child input, #leg-editor .leg-editor:last-child select')?.focus(); });
$('#ticket-settlement').addEventListener('change', () => {
  if (field('settlement').value === 'auto') {
    $('#ticket-selections').open = true;
    if (!editor.rows.length) editor.add(field('sport').value, field('date').value);
  } else if (editor.rows.length === 1 && !editor.rows[0].label && !editor.rows[0].gameId && !editor.rows[0].subjectId) {
    editor.reset([], field('sport').value, field('date').value);
  }
});
$('#close-bet').addEventListener('click', requestClose);
$('#cancel-bet').addEventListener('click', requestClose);
$('#delete-bet').addEventListener('click', () => {
  $('#delete-description').textContent = editing.selection;
  $('#delete-dialog').showModal();
  $('#cancel-delete').focus();
});
$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click', () => {
  try {
    mutate(latest => latest.filter(item => item.id !== editing.id));
    $('#delete-dialog').close();
    dialog.close();
    toast('Bet deleted.');
  } catch (error) {
    $('#delete-dialog').close();
    $('#form-error').textContent = error.message;
    $('#form-error').hidden = false;
  }
});
$('#bet-list').addEventListener('click', event => {
  if (event.target.closest('[data-more-tickets]')) {
    const firstNewIndex = ticketLimit;
    ticketLimit += ticketPageSize;
    render();
    const firstNew = $('#bet-list').querySelectorAll('.bet-ticket summary')[firstNewIndex];
    firstNew?.focus({preventScroll:true});
    return;
  }
  const ticket = event.target.closest('.bet-ticket-disclosure>summary');
  if (ticket) { event.preventDefault(); return showTicketComparison(ticket.closest('[data-ticket-id]')?.dataset.ticketId, ticket); }
  const button = event.target.closest('button');
  if (button?.hasAttribute('data-add')) openForm();
  if (button?.hasAttribute('data-clear')) clearFilters();
  if (button?.hasAttribute('data-import')) slipImport.open();
  if (button?.dataset.edit) openForm(button.dataset.edit);
});
$('#bet-search').addEventListener('input', render);
$('#tracker-filter-toggle').addEventListener('click', () => {
  const panel = $('#tracker-filter-panel');
  panel.hidden = !panel.hidden;
  $('#tracker-filter-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
$('#tracker-filter-panel').addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  $('#tracker-filter-panel').hidden = true;
  $('#tracker-filter-toggle').setAttribute('aria-expanded', 'false');
  $('#tracker-filter-toggle').focus({preventScroll:true});
});
$('#tracker-active-filters').addEventListener('click', event => {
  if (event.target.closest('[data-clear-ticket-filters]')) { clearFilters(); $('#bet-search').focus({preventScroll:true}); return; }
  const button = event.target.closest('[data-remove-filter]');
  if (!button) return;
  const filter = $('#'+button.dataset.removeFilter);
  filter.value = '';
  filter.dispatchEvent(new Event('change', {bubbles:true}));
  $('#bet-search').focus({preventScroll:true});
});
$('#sport-filter').addEventListener('change', render);
$('#status-filter').addEventListener('change', render);
$('#book-filter').addEventListener('change',render);
$('#market-filter').addEventListener('change',render);
$('#tool-filter').addEventListener('change',render);
$('#tag-filter').addEventListener('change',render);
$('#ticket-range').addEventListener('change',()=>{dashboard.selectedDay='';render();});
$('#tracker-insights').addEventListener('click', event => {
  const toggle = event.target.closest('[data-insight-toggle]');
  if (toggle) {
    const kind = toggle.dataset.insightToggle;
    expandedInsights.has(kind) ? expandedInsights.delete(kind) : expandedInsights.add(kind);
    renderInsights(dashboard.periodBets(activeBets()));
    $('#tracker-insights').querySelector(`[data-insight-toggle="${kind}"]`)?.focus({preventScroll:true});
    return;
  }
  const button = event.target.closest('[data-summary-filter]');
  if (!button) return;
  const control = $('#'+button.dataset.summaryFilter);
  control.value = control.value === button.dataset.summaryValue ? '' : button.dataset.summaryValue;
  render();
  [...$('#tracker-insights').querySelectorAll('[data-summary-filter]')].find(node => node.dataset.summaryFilter === button.dataset.summaryFilter && node.dataset.summaryValue === button.dataset.summaryValue)?.focus({preventScroll:true});
});
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  dashboard.range = button.dataset.range;
  dashboard.view = 'graph';
  dashboard.selectedDay = '';
  render();
}));
for (const id of ['tracker-from','tracker-to']) $('#'+id).addEventListener('change', () => {
  const start = $('#tracker-from'), end = $('#tracker-to');
  const valid = start.checkValidity() && end.checkValidity() && (!start.value || !end.value || start.value <= end.value);
  $('#tracker-date-error').textContent = valid ? '' : 'Choose an end date on or after the start date.';
  if (!valid) return;
  dashboard.customStart = start.value;
  dashboard.customEnd = end.value;
  render();
});
$('#selected-bet-day').addEventListener('click',event=>{if(event.target.closest('[data-clear-day]')){dashboard.selectedDay='';render();}});
document.querySelectorAll('[data-ticket-view]').forEach(button => button.addEventListener('click', () => {
  $('#status-filter').value = button.dataset.ticketView;
  $('#status-filter').dispatchEvent(new Event('change', { bubbles: true }));
}));
$('#clear-filters').addEventListener('click', () => clearFilters());
// CSV import: parse and validate locally, show what will be added, then save in one write.
let pendingImport = [];
const importDialog = $('#import-dialog');
$('#import-bets').addEventListener('click', () => $('#import-bets-file').click());
$('#import-bets-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 2_000_000) { toast('That file is larger than 2 MB. Split it and import the parts.'); return; }
  const { bets: parsed, errors } = parseBetsCsv(await file.text());
  pendingImport = parsed;
  $('#import-summary').textContent = parsed.length
    ? `${parsed.length} ${parsed.length === 1 ? 'ticket is' : 'tickets are'} ready to add from ${file.name}.${errors.length ? ` ${errors.length} ${errors.length === 1 ? 'row was' : 'rows were'} skipped.` : ''}`
    : `No tickets could be read from ${file.name}.`;
  const list = $('#import-errors');
  list.replaceChildren(...errors.slice(0, 6).map(message => Object.assign(document.createElement('li'), { textContent: message })));
  if (errors.length > 6) list.append(Object.assign(document.createElement('li'), { textContent: `…and ${errors.length - 6} more.` }));
  list.hidden = !errors.length;
  $('#confirm-import').hidden = !parsed.length;
  importDialog.showModal();
});
$('#cancel-import').addEventListener('click', () => { pendingImport = []; importDialog.close(); });
$('#confirm-import').addEventListener('click', () => {
  const incoming = pendingImport; pendingImport = [];
  importDialog.close();
  if (!incoming.length) return;
  try {
    mutate(latest => [...latest, ...incoming]);
    toast(`Imported ${incoming.length} ${incoming.length === 1 ? 'ticket' : 'tickets'}.`);
  } catch (error) { toast(error.message); }
});
$('#export-bets').addEventListener('click', () => {
  const visible = filteredBets();
  const url = URL.createObjectURL(new Blob(['\uFEFF', betsCsv(visible)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-bets-${today()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${visible.length} ${visible.length === 1 ? 'bet' : 'bets'}.`);
});
async function refreshLines({all=false}={}){
  if(tracking||!storageReady||document.hidden||dialog.open||slipImport.dialog.open)return;
  const candidates=bets.filter(b=>b.legs?.some(l=>l.mode==='auto'&&!l.override&&(all||!['won','lost','push','void'].includes(legState(l))||Date.parse(l.date)>Date.now()-3*86400000)));
  const groups=new Map(candidates.flatMap(b=>b.legs.filter(l=>l.mode==='auto'&&!l.override).map(l=>[gameKey(l),l])));
  if(!groups.size){$('#tracking-status').textContent='';return;}
  tracking=true;$('#refresh-lines').disabled=true;$('#tracking-status').textContent='Checking '+groups.size+' games…';
  const snapshots=new Map();let failed=0,next=0;const entries=[...groups];
  try{
    await Promise.all(Array.from({length:Math.min(3,entries.length)},async()=>{while(next<entries.length){const [key,leg]=entries[next++];try{const response=await fetch('/api/bets/game?'+new URLSearchParams({sport:leg.sport.toLowerCase(),league:leg.league,date:leg.date,game:leg.gameId}),{signal:AbortSignal.timeout(40000)});const data=await response.json();if(!response.ok)throw Error(data.error);snapshots.set(key,data);if(data.source.stale)failed++;}catch{failed++;}}}));
    // Re-read now, applying results only to the same selections; another tab may
    // have edited or removed tickets while network requests were in flight.
    const latest=readBets(trackerStorage);
    const updated=latest.map(b=>{
      if(!candidates.some(c=>c.id===b.id)||dialog.open&&editing?.id===b.id)return b;
      const refreshed=refreshTicket(b,snapshots);
      // The ticket's edit time is also its sort key. Feed checks already carry
      // their own checkedAt; changing updatedAt would reorder tickets on touch.
      return JSON.stringify(refreshed)!==JSON.stringify(b)?refreshed:b;
    });
    const changed = updated.some((bet, index) => bet !== latest[index]);
    if (changed) {
      const anchor = [...document.querySelectorAll('[data-ticket-id]')].find(node => node.getBoundingClientRect().bottom > 0);
      const anchorId = anchor?.dataset.ticketId, anchorTop = anchor?.getBoundingClientRect().top;
      writeBets(trackerStorage,updated); bets=updated; render();
      const nextAnchor = anchorId && document.querySelector(`[data-ticket-id="${CSS.escape(anchorId)}"]`);
      if (nextAnchor) window.scrollBy(0, nextAnchor.getBoundingClientRect().top - anchorTop);
    }
    $('#tracking-status').textContent=(failed?failed+' game feeds unavailable or stale; prior readings may remain. ':'')+'Checked '+new Date().toLocaleTimeString()+'. Refreshes every minute while visible.';
  }catch(e){$('#tracking-status').textContent='Results could not be saved: '+e.message;}
  finally{tracking=false;$('#refresh-lines').disabled=false;}
}
$('#refresh-lines').addEventListener('click',()=>refreshLines({all:true}));
setInterval(refreshLines,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLines({all:true});});
window.addEventListener('storage', event => { if ([BET_STORAGE_KEY, LEGACY_EV_STORAGE_KEY, null].includes(event.key)) load(); });
const requestedSport = new URLSearchParams(location.search).get('sport');
const sportOption = [...$('#sport-filter').options].find(option => option.value.toLowerCase() === requestedSport?.toLowerCase());
if (sportOption) $('#sport-filter').value = sportOption.value;
document.querySelector('[data-tracker-focus-search]')?.addEventListener('click', () => $('#bet-search').focus());
load();
document.querySelector('.ev-primary-nav [aria-current="page"]')?.scrollIntoView({ block:'nearest', inline:'nearest' });
refreshLines({all:true});
