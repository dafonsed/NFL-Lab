import { ADMIN_SECTIONS, ADMIN_ROLES } from './admin-catalog.js';
import { createAdminStore } from './admin-store.js';
import { compareAdminValues } from './admin-values.js';
import { icon } from './ui-icons.js';

const root = document.querySelector('#admin-root');
const dialog = document.querySelector('#admin-dialog');
const toast = document.querySelector('#admin-toast');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sectionById = id => ADMIN_SECTIONS.find(section => section.id === id);
const sectionIcons = {overview:'home',users:'players',billing:'tag',sources:'live',events:'calendar',quality:'filter',ev:'ev',arbitrage:'expand',fantasy:'simulation',links:'arrow',grading:'check',clv:'trends',wallets:'picks',lineups:'players',notifications:'live',content:'paper',support:'info',system:'gear',admins:'settings',security:'bookmark',reports:'research'};
const urlFor = id => id === 'overview' ? '/admin-sandbox' : `/admin-sandbox/${id}`;
const statusTone = status => /^(active|healthy|connected|resolved|approved|enabled|completed|published|verified|operational|available|delivered|restored|settled)$/i.test(status) ? 'good' : /error|failed|outage|quarantin|suspend|disabled|rejected|critical|broken/i.test(status) ? 'bad' : /pending|review|degrad|delay|stale|warn|pause|disput|unmatched|open|queued|draft|missing/i.test(status) ? 'warn' : 'neutral';
const badge = status => `<span class="ad-badge ${statusTone(String(status))}"><i></i>${esc(status)}</span>`;
const time = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); };
let storage;
try { storage = window.localStorage; } catch { storage = {getItem(){throw Error('Browser storage is unavailable.');},setItem(){throw Error('Browser storage is unavailable.');}}; }
const store = createAdminStore({storage});
let state = store.getState();
let current = location.pathname.split('/')[2] || 'overview';
let tab = new URL(location.href).searchParams.get('tab') || 'records';
let search = '', statusFilter = '', sortKey = '', descending = false, mobileOpen = false;
let toastTimer, previousFocus;

function notify(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = error ? 'ad-toast visible error' : 'ad-toast visible';
  toastTimer = setTimeout(() => { toast.className = 'ad-toast'; }, 6000);
}
function refreshState() { state = store.getState(); }
function accessible(id) { return store.can(id, 'view'); }
function rows(id = current) { return state.records[id] || []; }
function pending(id) { return state.approvals.filter(item => item.status === 'Pending' && (!id || item.section === id) && accessible(item.section)); }
function navigate(id, nextTab = 'records') {
  if (!sectionById(id)) return;
  current = id; tab = nextTab; search = ''; statusFilter = ''; sortKey = ''; mobileOpen = false;
  history.pushState({}, '', urlFor(id) + (tab === 'records' ? '' : `?tab=${tab}`));
  render();
  document.querySelector('#admin-main')?.focus({preventScroll:true});
  window.scrollTo(0, 0);
}
function sidebar() {
  const groups = [...new Set(ADMIN_SECTIONS.map(section => section.group))];
  return `<aside class="ad-sidebar${mobileOpen ? ' is-open' : ''}" id="admin-sidebar" aria-label="Admin navigation">
    <a class="ad-brand" href="/admin-sandbox" data-section="overview"><img src="/favicon.svg" alt="" width="32" height="32"><span>VisualOdds<small>Administration</small></span><span class="ad-brand-chevron">${icon('chevron')}</span></a>
    <div class="ad-nav-scroll">${groups.map(group => `<nav class="ad-nav-group" aria-label="${esc(group)}"><h2>${esc(group)}</h2>${ADMIN_SECTIONS.filter(section => section.group === group && accessible(section.id)).map(section => `<a href="${urlFor(section.id)}" data-section="${section.id}"${current === section.id ? ' aria-current="page"' : ''}>${icon(sectionIcons[section.id])}<span>${esc(section.label)}</span>${section.id === 'support' ? `<b>${rows('support').filter(row=>!/resolved|closed/i.test(row.status)).length}</b>` : ''}</a>`).join('')}</nav>`).join('')}</div>
    <div class="ad-sidebar-footer"><a href="/research">${icon('arrow')}<span>Back to VisualOdds</span></a><button data-action="sandbox"><span class="ad-avatar">SL</span><span><strong>Local workspace</strong><small>Sample data environment</small></span>${icon('gear')}</button></div>
  </aside>${mobileOpen ? '<button class="ad-backdrop" data-action="close-nav" aria-label="Close navigation"></button>' : ''}`;
}
function render() {
  refreshState();
  const section = sectionById(current) || sectionById('overview');
  if (!sectionById(current)) current = 'overview';
  document.title = `${section.label} · VisualOdds Admin`;
  root.innerHTML = `${sidebar()}<div class="ad-workspace">
    <header class="ad-topbar"><div class="ad-breadcrumb"><button class="ad-mobile-toggle ad-icon-button" data-action="toggle-nav" aria-controls="admin-sidebar" aria-expanded="${mobileOpen}" aria-label="Toggle navigation">${icon('more')}</button><span>Admin workspace</span>${icon('chevron')}<strong>${esc(section.label)}</strong></div><div class="ad-top-actions"><button class="ad-command" data-action="search">${icon('search')}<span>Search admin</span><kbd>Ctrl K</kbd></button><button class="ad-environment" data-action="sandbox"><i></i>Local sandbox</button><label class="ad-role"><span class="ad-sr-only">Sandbox role</span><select id="admin-role" aria-label="Sandbox role">${ADMIN_ROLES.map(role=>`<option${role === state.role ? ' selected' : ''}>${esc(role)}</option>`).join('')}</select></label><span class="ad-avatar top">${esc(state.role.split(' ').map(word=>word[0]).join(''))}</span></div></header>
    <main id="admin-main" tabindex="-1"><div class="ad-preview-boundary"><div><strong>Sandbox preview only</strong><span>These controls edit sample records. They do not operate live accounts, feeds or payments.</span></div><a href="/admin/accounts">Open connected account administration ${icon('arrow')}</a></div>
      ${state.storageError ? `<div class="ad-storage-error" role="alert"><strong>Changes are paused.</strong> ${esc(state.storageError)} <button data-action="reset">Reset sandbox storage</button></div>` : ''}
      <div class="ad-page-heading"><div><div class="ad-heading-context">${current === 'overview' ? 'Your operations, at a glance' : esc(section.group)}</div><h1>${esc(current === 'overview' ? 'Platform overview' : section.label)}</h1><p>${esc(section.description)}</p></div><div class="ad-heading-actions"><button class="ad-button" data-action="export">${icon('download')}Export ${current === 'overview' ? 'summary' : 'CSV'}</button>${current !== 'overview' && store.can(current, 'create') ? '<button class="ad-button primary" data-action="create">'+icon('plus')+'Add record</button>' : '<button class="ad-button primary" data-action="approvals">'+icon('check')+'Review approvals'+(pending().length ? `<span>${pending().length}</span>` : '')+'</button>'}</div></div>
      <div class="ad-page-tabs" role="navigation" aria-label="Page views"><button data-tab="records"${tab === 'records' ? ' aria-current="page"' : ''}>${current === 'overview' ? 'Overview' : 'Records'}</button><button data-tab="approvals"${tab === 'approvals' ? ' aria-current="page"' : ''}>Approvals <span>${pending(current === 'overview' ? undefined : current).length}</span></button><button data-tab="activity"${tab === 'activity' ? ' aria-current="page"' : ''}>Activity log</button><span class="ad-sample-note">${icon('info')}Sample data · saved in this browser</span></div>
      <div id="admin-content">${!accessible(current) ? accessDenied() : tab === 'approvals' ? approvalView() : tab === 'activity' ? auditView() : current === 'overview' ? overview() : recordView(section)}</div>
      <footer class="ad-page-footer"><span>VisualOdds Admin <span class="ad-footer-dot">·</span> Local sandbox</span><span>Customer accounts, payments and live feeds are not connected.</span><button data-action="sandbox">Environment details ${icon('arrow')}</button></footer>
    </main></div>`;
  syncNavigation();
}

function syncNavigation() {
  const mobile = matchMedia('(max-width:760px)').matches;
  const sidebar = document.querySelector('#admin-sidebar');
  sidebar.inert = mobile && !mobileOpen;
  sidebar.setAttribute('aria-hidden', String(mobile && !mobileOpen));
  document.querySelector('.ad-workspace').inert = mobile && mobileOpen;
  document.body.classList.toggle('ad-nav-open', mobile && mobileOpen);
}
function toggleNavigation(open) {
  mobileOpen = open;
  render();
  (open ? document.querySelector('#admin-sidebar [aria-current]') : document.querySelector('[data-action="toggle-nav"]'))?.focus({preventScroll:true});
}
matchMedia('(max-width:760px)').addEventListener('change', syncNavigation);
function accessDenied() { return `<section class="ad-empty"><span>${icon('bookmark')}</span><h2>This area is outside your sandbox role</h2><p>Choose another role in the top bar to explore its permissions.</p><button class="ad-button" data-section="overview">Return to overview</button></section>`; }
function miniLine(values, className = '') {
  const points = values.map((value,index)=>`${index * 100 / (values.length - 1)},${36-value}`).join(' ');
  return `<svg class="ad-miniline ${className}" viewBox="0 0 100 38" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function overview() {
  const sources = accessible('sources') ? rows('sources') : [];
  const healthy = sources.filter(row=>/healthy|connected|active|operational/i.test(row.status));
  const issues = sources.filter(row=>!healthy.includes(row));
  const openSupport = accessible('support') ? rows('support').filter(row=>!/resolved|closed/i.test(row.status)) : [];
  const stats = [
    {label:'Active user accounts',value:accessible('users') ? rows('users').filter(row=>/active/i.test(row.status)).length : '—',detail:'In the sample user directory',glyph:'players',line:[9,11,10,16,14,19,19,24,22,29,28,33],go:'users'},
    {label:'Sources operational',value:sources.length ? `${healthy.length} / ${sources.length}` : '—',detail:issues.length ? `${issues.length} source${issues.length>1?'s':''} need attention` : 'No sources need attention',glyph:'live',line:[27,28,27,27,29,14,18,28,29,28,29,28],go:'sources'},
    {label:'Open support reports',value:accessible('support') ? openSupport.length : '—',detail:'Bugs, billing and grading',glyph:'info',line:[28,26,30,24,25,19,22,15,16,11,13,9],go:'support'},
    {label:'Awaiting approval',value:pending().length,detail:'Changes held for a second reviewer',glyph:'check',line:[9,9,9,9,9,9,9,9,9,9,9,9],go:'approvals'}
  ];
  return `${issues.length ? `<section class="ad-incident"><span class="ad-incident-icon">${icon('live')}</span><div><strong>${issues.length} data source${issues.length>1?'s':''} need attention</strong><p>${esc(issues.map(row=>row.name).join(', '))}. Inspect the sample feed records before restoring coverage.</p></div><button data-section="sources">Investigate ${icon('arrow')}</button></section>` : ''}
    <div class="ad-stats">${stats.map((stat,index)=>`<button class="ad-stat" data-${stat.go === 'approvals' ? 'action="approvals"' : `section="${stat.go}"`}><div class="ad-stat-label">${esc(stat.label)}${icon(stat.glyph)}</div><div class="ad-stat-number">${esc(stat.value)}${miniLine(stat.line,index===1?'cyan':'')}</div><p>${esc(stat.detail)}</p></button>`).join('')}</div>
    ${marketCoverage()}<div class="ad-overview-columns"><section class="ad-panel ad-feed-panel"><header class="ad-panel-heading"><div><h2>Feed control room</h2><p>Source availability and collection health</p></div><button class="ad-text-button" data-section="sources">Manage sources ${icon('arrow')}</button></header><div class="ad-feed-legend"><span><i class="good"></i>Operational</span><span><i class="warn"></i>Needs attention</span><span class="ad-right">Illustrative 60-minute history</span></div><div class="ad-feed-list">${sources.length ? sources.map((source,index)=>`<button class="ad-feed-row" data-record="${esc(source.id)}" data-record-section="sources"><span class="ad-source-logo source-${index%4}">${esc(source.name.slice(0,2).toUpperCase())}</span><span class="ad-feed-name"><strong>${esc(source.name)}</strong><small>${esc(source.sports || source.leagues || source.coverage || 'Sportsbook feed')}</small></span><span class="ad-heartbeat" aria-label="Illustrative feed health history">${Array.from({length:30},(_,i)=>`<i class="${statusTone(source.status) !== 'good' && i>17 && (i+index)%4!==0 ? 'warn' : ''}"></i>`).join('')}</span><span class="ad-feed-status">${badge(source.status)}<small>${esc(source.latency || source.lastUpdate || source.lastSuccess || 'Sample snapshot')}</small></span>${icon('chevron')}</button>`).join('') : '<p class="ad-inline-empty">Source health is outside this role’s view.</p>'}</div><footer class="ad-panel-footer"><span>${icon('info')}Sandbox history is illustrative; no live polling.</span><button data-section="quality">View odds quality</button></footer></section>
    <section class="ad-panel ad-attention"><header class="ad-panel-heading"><div><h2>Needs attention</h2><p>Your operational review queue</p></div><span class="ad-count">${openSupport.length + pending().length}</span></header><div class="ad-attention-list">${openSupport.slice(0,3).map((row,index)=>`<button data-record="${esc(row.id)}" data-record-section="support"><span class="ad-priority priority-${index}">${icon(index===0?'live':index===1?'check':'tag')}</span><span><strong>${esc(row.name)}</strong><small>${esc(row.priority || row.category || row.status)} · ${esc(row.id)}</small></span>${icon('chevron')}</button>`).join('')}<button data-action="approvals"><span class="ad-priority approval">${icon('bookmark')}</span><span><strong>${pending().length ? `${pending().length} change${pending().length>1?'s':''} awaiting approval` : 'No pending approvals'}</strong><small>Sensitive changes require a second reviewer</small></span>${icon('chevron')}</button></div><div class="ad-review-note">${icon('check')}<p>Every sandbox change has a reason and an activity record.</p></div></section></div>
    <div class="ad-overview-columns lower"><section class="ad-panel"><header class="ad-panel-heading"><div><h2>Business pulse</h2><p>Illustrative subscription revenue</p></div><span class="ad-subtle-pill">September · sample</span></header><div class="ad-business-top"><strong>$24,680<span>Sample monthly revenue</span></strong><span class="ad-growth">+12.8%<small>vs. previous sample month</small></span></div><div class="ad-chart"><div class="ad-chart-scale"><span>$30k</span><span>$20k</span><span>$10k</span><span>$0</span></div><svg viewBox="0 0 640 150" role="img" aria-label="Illustrative sample subscription revenue rising through September"><path class="ad-chart-grid" d="M0 10H640M0 52H640M0 94H640M0 136H640"/><path class="ad-chart-area" d="M0 120L23 121 46 110 69 117 92 100 115 106 138 86 161 91 184 94 207 81 230 88 253 70 276 76 299 65 322 70 345 57 368 62 391 45 414 52 437 39 460 47 483 26 506 35 529 23 552 29 575 12 600 18 640 9V146H0Z"/><path class="ad-chart-line" d="M0 120L23 121 46 110 69 117 92 100 115 106 138 86 161 91 184 94 207 81 230 88 253 70 276 76 299 65 322 70 345 57 368 62 391 45 414 52 437 39 460 47 483 26 506 35 529 23 552 29 575 12 600 18 640 9"/></svg><div class="ad-chart-dates"><span>Sep 1</span><span>Sep 7</span><span>Sep 14</span><span>Sep 21</span><span>Sep 30</span></div></div><footer class="ad-panel-footer"><span>Example figures, independent of sandbox records</span><button data-section="billing">Plans & billing ${icon('arrow')}</button></footer></section>
    <section class="ad-panel"><header class="ad-panel-heading"><div><h2>Tool activity</h2><p>Illustrative share of tool sessions</p></div>${icon('research')}</header><div class="ad-tool-bars">${[['Positive EV',42,'ev'],['Arbitrage',27,'arbitrage'],['Fantasy & parlays',18,'fantasy'],['Bet tracker',13,'grading']].map(([name,value,id])=>`<button data-section="${id}"><span>${esc(name)}<strong>${value}%</strong></span><span class="ad-bar-track"><i style="width:${value*2}%"></i></span></button>`).join('')}</div><footer class="ad-panel-footer"><span>Sample usage distribution</span><button data-section="reports">All reports ${icon('arrow')}</button></footer></section></div>
    <section class="ad-panel ad-recent"><header class="ad-panel-heading"><div><h2>Recent admin activity</h2><p>A traceable record of changes in this browser</p></div><button class="ad-text-button" data-tab="activity">View activity log ${icon('arrow')}</button></header>${auditTable(state.audit.filter(item=>accessible(item.section)).slice(0,4))}</section>`;
}
function marketCoverage() {
  const totals=rows('reports').find(record=>record.id==='RPT-02')?.details || {};
  const values=[['activeEvents','Active events','events'],['activeMarkets','Markets','events'],['activeOdds','Odds','quality'],['validEv','Valid +EV plays','ev'],['validArbs','Arbitrages','arbitrage'],['activeAlerts','Alerts','notifications']];
  return `<section class="ad-market-coverage" aria-label="Sample market coverage"><div class="ad-coverage-title"><strong>Market coverage</strong><small>Sample snapshot</small></div>${values.map(([key,label,id])=>`<button data-section="${id}"><strong>${Number.isFinite(totals[key])?Number(totals[key]).toLocaleString():'—'}</strong><span>${label}</span></button>`).join('')}</section>`;
}
function selectedRows() {
  const needle = search.trim().toLowerCase();
  const result = rows().filter(row=>(!statusFilter || row.status === statusFilter) && (!needle || JSON.stringify(row).toLowerCase().includes(needle)));
  if (sortKey) result.sort((a,b)=>compareAdminValues(a[sortKey],b[sortKey],descending));
  return result;
}
function recordView(section) {
  const statuses = [...new Set(rows().map(row=>row.status))];
  return `${current === 'admins' ? permissionsPanel() : current === 'reports' ? reportPanel() : ''}<section class="ad-panel ad-record-panel"><header class="ad-record-toolbar"><label class="ad-search">${icon('search')}<span class="ad-sr-only">Search records</span><input id="admin-record-search" placeholder="${esc(section.searchPlaceholder || 'Search records…')}" value="${esc(search)}" autocomplete="off"></label><div><label class="ad-filter">${icon('filter')}<select id="admin-status-filter" aria-label="Filter by status"><option value="">All statuses</option>${statuses.map(status=>`<option${statusFilter===status?' selected':''}>${esc(status)}</option>`).join('')}</select></label><span class="ad-record-total" id="admin-record-count">${selectedRows().length} records</span></div></header><div id="admin-record-table">${recordTable(section)}</div><footer class="ad-panel-footer"><span>Inspect a record to edit its settings, review evidence or take action.</span><span>Browser-local records</span></footer></section><div class="ad-context-note">${icon('info')}<p>${contextNote(current)}</p></div>`;
}
function contextNote(id) {
  const notes = {admins:'Roles here are simulated personas. Production admin sign-in, two-factor authentication and session revocation require an identity provider.',billing:'Plan and commission changes update sample records after approval. Charges, credits, refunds and payouts require a billing integration.',sources:'Feed controls change the sample source state only. No provider credentials are stored or collection jobs executed.',grading:'Grading requests preserve a reason and require review. No customer bets, bankrolls or settlement totals are changed.',security:'This local activity history demonstrates the workflow. Production requires server-enforced permissions and tamper-resistant audit storage.',notifications:'Templates and delivery rules are drafts. No emails, push messages or Discord notifications are sent.',system:'Replay, backfill and rollback requests are sandbox records. They do not run infrastructure commands.',users:'Sample profiles are independent of customer accounts. Export and deletion requests are recorded locally; support mode does not sign in as another user.',ev:'Engine settings are sandbox configuration records. Publishing a request does not change the live odds calculations.',content:'Publication actions affect sandbox records only. The public website is unchanged.'};
  return notes[id] || 'All changes stay in this browser. External tools, providers and production data are not connected to this sandbox.';
}
function recordTable(section) {
  const records = selectedRows();
  if (!records.length) return `<div class="ad-empty"><span>${icon('search')}</span><h2>${search || statusFilter ? 'No matching records' : 'No records yet'}</h2><p>${search || statusFilter ? 'Try a different search or clear the status filter.' : esc(section.emptyMessage || 'Add a sample record to explore this workflow.')}</p>${search || statusFilter ? '<button class="ad-button" data-action="clear-filters">Clear filters</button>' : ''}</div>`;
  return `<p class="ad-table-hint">Scroll across for more columns. Select a record to view every detail.</p><div class="ad-table-scroll" tabindex="0" role="region" aria-label="Admin records, scroll to view all columns"><table><thead><tr>${section.columns.map(column=>`<th scope="col"${sortKey===column.key ? ` aria-sort="${descending?'descending':'ascending'}"` : ''}><button data-sort="${esc(column.key)}">${esc(column.label)}<span>${sortKey===column.key ? descending?'↓':'↑':'↕'}</span></button></th>`).join('')}<th scope="col"><span class="ad-sr-only">Inspect record</span></th></tr></thead><tbody>${records.map(row=>`<tr>${section.columns.map((column,index)=>`<td>${column.key==='status'?badge(row[column.key]):index===0?`<button class="ad-record-name" data-record="${esc(row.id)}"><strong>${esc(row[column.key])}</strong><small>${esc(row.id)}</small><span class="ad-record-mobile-status">${badge(row.status)}</span></button>`:esc(row[column.key] ?? '—')}</td>`).join('')}<td><button class="ad-icon-button" data-record="${esc(row.id)}" aria-label="Inspect ${esc(row.name)}">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function updateTable() {
  const element = document.querySelector('#admin-record-table');
  if (element) element.innerHTML = recordTable(sectionById(current));
  const count = document.querySelector('#admin-record-count');
  if (count) count.textContent = `${selectedRows().length} records`;
}
function approvalView() {
  const records = state.approvals.filter(item=>(current==='overview'||item.section===current) && accessible(item.section));
  return `<section class="ad-panel"><header class="ad-panel-heading"><div><h2>Change approvals</h2><p>Sensitive edits stay pending until another permitted sandbox persona approves.</p></div>${badge(`${pending(current==='overview'?undefined:current).length} pending`)}</header>${records.length?`<div class="ad-approval-list">${records.map(item=>`<article><div class="ad-approval-icon">${icon(sectionIcons[item.section])}</div><div><h3>${esc(sectionById(item.section)?.label)} <span>/ ${esc(item.action)}</span></h3><p>${esc(item.reason)}</p><small>${esc(item.requestedBy)} requested ${time(item.requestedAt)} · ${esc(item.recordId || 'New record')}</small></div>${badge(item.status)}<button class="ad-button" data-approval="${esc(item.id)}">Review change</button></article>`).join('')}</div>`:`<div class="ad-empty"><span>${icon('check')}</span><h2>No change requests yet</h2><p>Edit a sensitive configuration to create an approval request. It will appear here before it can be applied.</p><button class="ad-button" data-section="ev">Open +EV controls</button></div>`}</section>`;
}
function auditTable(records) {
  return records.length ? `<p class="ad-table-hint">Scroll across for more columns. Select a record to view every detail.</p><div class="ad-table-scroll" tabindex="0" role="region" aria-label="Admin records, scroll to view all columns"><table><thead><tr><th>Action</th><th>Area</th><th>Admin persona</th><th>Reason</th><th>Time</th></tr></thead><tbody>${records.map(item=>`<tr><td><strong>${esc(item.action)}</strong><small class="ad-cell-sub">${esc(item.target)}</small></td><td>${esc(sectionById(item.section)?.label || item.section)}</td><td>${esc(item.actor)}</td><td class="ad-reason-cell">${esc(item.reason)}</td><td class="ad-nowrap">${time(item.at)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="ad-empty compact"><span>${icon('paper')}</span><h2>Your activity log starts here</h2><p>Edit a sample record or request a change to see its audit trail.</p></div>`;
}
function auditView() {
  const records = state.audit.filter(item=>(current==='overview'||item.section===current)&&accessible(item.section));
  return `<section class="ad-panel"><header class="ad-panel-heading"><div><h2>Admin activity</h2><p>Actions, reasons and reviewers recorded in this browser.</p></div><button class="ad-button" data-action="export-audit">${icon('download')}Export audit JSON</button></header>${auditTable(records)}</section>`;
}
function permissionsPanel() {
  const descriptions = {'Owner':'Full sandbox access and approval review','Developer':'Platform operations, configuration and approval review','Data Operator':'Sources, markets, pricing and trading operations','Support':'Customer reports, users and grading requests','Content Editor':'Editorial content and bet link configuration'};
  return `<section class="ad-permissions"><div><h2>Separate responsibilities. Visible changes.</h2><p>Switch the sandbox role above to preview each persona’s access. This is a permissions simulation, not authentication.</p></div><div>${ADMIN_ROLES.map(role=>`<article><span class="ad-avatar">${esc(role.split(' ').map(word=>word[0]).join(''))}</span><span><strong>${esc(role)}</strong><small>${esc(descriptions[role])}</small></span></article>`).join('')}</div></section>`;
}
function reportPanel() {
  return `<section class="ad-report-builder"><div>${icon('download')}<div><h2>Export operational data</h2><p>Download a CSV of the current sandbox records for any area you can view.</p></div></div><label><span class="ad-sr-only">Report dataset</span><select id="admin-report-dataset">${ADMIN_SECTIONS.filter(section=>section.id!=='overview' && accessible(section.id)).map(section=>`<option value="${section.id}">${esc(section.label)}</option>`).join('')}</select></label><button class="ad-button primary" data-action="export-dataset">Download CSV</button></section>`;
}
function showDialog(html, className = '') {
  if (!dialog.open) previousFocus = document.activeElement;
  dialog.className = `ad-dialog ${className}`;
  dialog.innerHTML = html;
  dialog.setAttribute('aria-labelledby', 'admin-dialog-title');
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { dialog.close(); }
dialog.addEventListener('close', () => previousFocus?.isConnected && previousFocus.focus({preventScroll:true}));
const resizeDialog = () => document.documentElement.style.setProperty('--admin-viewport', `${visualViewport?.height || innerHeight}px`);
window.visualViewport?.addEventListener('resize', resizeDialog); resizeDialog();
function dialogHeader(title, description = '') { return `<header class="ad-dialog-header"><div><h2 id="admin-dialog-title">${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div><button type="button" class="ad-icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></header>`; }
dialog.setAttribute('aria-labelledby','admin-dialog-title');
function inspect(sectionId, id) {
  refreshState();
  if (!accessible(sectionId)) return notify('This record is outside your sandbox role.',true);
  const section = sectionById(sectionId), record = rows(sectionId).find(row=>row.id===id);
  if (!record) return notify('This record is no longer available.',true);
  const allKeys = [...new Set(['name','status','requestStatus','lastRequestAction',...section.fields.map(field=>field.key),...section.columns.map(column=>column.key)])];
  showDialog(`${dialogHeader(record.name, `${section.label} · ${record.id}`)}<div class="ad-dialog-body"><div class="ad-inspector-status">${badge(record.status)}<span>Sample record</span></div><dl class="ad-detail-grid">${allKeys.filter(key=>record[key]!==undefined).map(key=>`<div><dt>${esc(section.fields.find(field=>field.key===key)?.label || section.columns.find(column=>column.key===key)?.label || key)}</dt><dd>${esc(record[key])}</dd></div>`).join('')}</dl>${record.details?`<section class="ad-evidence"><h3>Evidence & configuration</h3><dl>${Object.entries(record.details).map(([key,value])=>`<div><dt>${esc(key.replace(/([A-Z])/g,' $1'))}</dt><dd>${esc(typeof value==='object'?JSON.stringify(value):value)}</dd></div>`).join('')}</dl></section>`:''}<div class="ad-dialog-note">${icon('info')}<p>${contextNote(sectionId)}</p></div><h3 class="ad-small-heading">Record activity</h3>${state.audit.filter(item=>item.section===sectionId&&item.target===id).slice(0,4).map(item=>`<div class="ad-record-activity"><strong>${esc(item.action)}</strong><p>${esc(item.reason)}</p><small>${esc(item.actor)} · ${time(item.at)}</small></div>`).join('') || '<p class="ad-muted">No changes to this sample record yet.</p>'}</div><footer class="ad-dialog-footer actions-wrap">${store.can(sectionId,'edit')?`<button class="ad-button primary" data-edit="${esc(id)}" data-record-section="${sectionId}">Edit record</button>`:''}${section.actions.filter(action=>store.canForRecord(sectionId,id,action.id)).map(action=>`<button class="ad-button" data-record-action="${esc(action.id)}" data-id="${esc(id)}" data-record-section="${sectionId}">${esc(action.label)}</button>`).join('')}<button class="ad-button" data-action="close-dialog">Close</button></footer>`,'inspector');
}
function fieldsHtml(section, record = {}) {
  return section.fields.map(field=>`<label class="ad-field${field.type==='textarea'?' full':''}"><span>${esc(field.label)}${field.required?' <b>*</b>':''}</span>${field.type==='select'?`<select name="${esc(field.key)}"${field.required?' required':''}>${!field.required?'<option value="">Select…</option>':''}${(field.options||[]).map(option=>`<option${String(record[field.key])===String(option)?' selected':''}>${esc(option)}</option>`).join('')}</select>`:field.type==='textarea'?`<textarea name="${esc(field.key)}" rows="3"${field.required?' required':''} maxlength="2000">${esc(record[field.key])}</textarea>`:`<input name="${esc(field.key)}" type="${esc(field.type==='integer'?'number':['text','number','date','email','url'].includes(field.type)?field.type:'text')}" value="${esc(record[field.key])}"${field.required?' required':''}${['number','integer'].includes(field.type)?` step="${field.type==='integer'?'1':'any'}"${field.min!==undefined?` min="${esc(field.min)}"`:''}${field.max!==undefined?` max="${esc(field.max)}"`:''}`:' maxlength="300"'}>`}</label>`).join('');
}
function editRecord(sectionId, id) {
  const section = sectionById(sectionId), record = id ? rows(sectionId).find(row=>row.id===id) : null;
  const creating = !id;
  if (!store.can(sectionId,creating?'create':'edit')) return notify('This action is outside your sandbox role.',true);
  showDialog(`<form id="admin-edit-form" data-section-id="${sectionId}"${id?` data-id="${esc(id)}"`:''}>${dialogHeader(creating?`Add ${section.label.toLowerCase()} record`:`Edit ${record.name}`,'Changes are saved only in this browser. Sensitive changes enter the approval queue.')}<div class="ad-dialog-body"><div class="ad-form-grid">${fieldsHtml(section,record || {})}</div><label class="ad-field full ad-change-reason"><span>Reason for change <b>*</b></span><textarea name="changeReason" required minlength="5" maxlength="1000" rows="3" placeholder="Explain what you’re changing and why…"></textarea></label><p class="ad-form-error" role="alert" hidden></p></div><footer class="ad-dialog-footer"><button type="button" class="ad-button" data-action="close-dialog">Cancel</button><button class="ad-button primary" type="submit">${creating?'Create record':'Save changes'}</button></footer></form>`);
}
function actionDialog(sectionId,id,actionId) {
  const section=sectionById(sectionId),record=rows(sectionId).find(row=>row.id===id),action=section.actions.find(item=>item.id===actionId);
  const approvalRequired=store.requiresApproval({section:sectionId,id,action:actionId});
  showDialog(`<form id="admin-action-form" data-section-id="${sectionId}" data-id="${esc(id)}" data-operation="${esc(actionId)}">${dialogHeader(action.label,record.name)}<div class="ad-dialog-body"><p>${action.requestOnly?`This records a sandbox request only. No service will execute it and the record’s lifecycle status stays unchanged.`:action.targetStatus?`The sample record’s status will become “${esc(action.targetStatus)}”.`:'This action will be recorded in the sandbox.'} ${approvalRequired?'A second reviewer must approve this request before it is applied.':''}</p><div class="ad-dialog-note">${icon('info')}<p>${contextNote(sectionId)}</p></div><label class="ad-field"><span>Reason <b>*</b></span><textarea name="changeReason" required minlength="5" maxlength="1000" rows="4" placeholder="Describe the reason for this action…"></textarea></label><p class="ad-form-error" role="alert" hidden></p></div><footer class="ad-dialog-footer"><button type="button" class="ad-button" data-action="close-dialog">Cancel</button><button type="submit" class="ad-button primary">${approvalRequired?'Request change':esc(action.label)}</button></footer></form>`);
}
function approvalDialog(id) {
  const approval=state.approvals.find(item=>item.id===id);
  if (!approval) return;
  const section=sectionById(approval.section),record=rows(approval.section).find(row=>row.id===approval.recordId);
  const action=section.actions.find(item=>item.id===approval.action);
  const values=approval.values && Object.keys(approval.values).length ? approval.values : action?.targetStatus?{[action.requestOnly?'requestStatus':'status']:action.targetStatus}:{};
  const isPending=approval.status==='Pending',same=approval.requestedBy===state.role,canReview=store.can(approval.section,'approve')&&!same;
  showDialog(`<form id="admin-approval-form" data-id="${esc(id)}">${dialogHeader('Review change',`${section.label} · ${approval.recordId || 'New record'}`)}<div class="ad-dialog-body">${badge(approval.status)}<p class="ad-approval-reason">${esc(approval.reason)}</p><p class="ad-muted">Requested by ${esc(approval.requestedBy)} · ${time(approval.requestedAt)}</p><div class="ad-table-scroll" tabindex="0" role="region" aria-label="Requested changes, scroll to view all columns"><table class="ad-diff"><thead><tr><th>Field</th><th>Current value</th><th>Requested value</th></tr></thead><tbody>${Object.entries(values).map(([key,value])=>`<tr><td>${esc(section.fields.find(field=>field.key===key)?.label || key)}</td><td>${esc(record?.[key] ?? '—')}</td><td>${esc(value)}</td></tr>`).join('')}</tbody></table></div>${isPending && canReview?'<label class="ad-field ad-change-reason"><span>Review reason <b>*</b></span><textarea name="changeReason" required minlength="5" maxlength="1000" rows="3" placeholder="Record your review decision…"></textarea></label>':isPending?`<div class="ad-dialog-note">${icon('bookmark')}<p>${same?'You cannot review your own request. Close this dialog and switch to another permitted sandbox role.':'Your current role cannot review this change.'}</p></div>`:`<p class="ad-muted">Reviewed by ${esc(approval.reviewedBy || '—')} ${approval.reviewedAt?time(approval.reviewedAt):''}</p>`}<p class="ad-form-error" role="alert" hidden></p></div><footer class="ad-dialog-footer"><button type="button" class="ad-button" data-action="close-dialog">Close</button>${isPending && canReview?'<button class="ad-button danger" type="submit" name="decision" value="reject">Reject change</button><button class="ad-button primary" type="submit" name="decision" value="approve">Approve change</button>':''}</footer></form>`);
}
function sandboxDialog() {
  showDialog(`${dialogHeader('Local admin sandbox','A reviewable workspace for your full admin operating model.')}<div class="ad-dialog-body"><div class="ad-dialog-note">${icon('info')}<p>All people, feeds, metrics and financial figures are sample data. Changes are saved in this browser on this site address.</p></div><dl class="ad-integration-list">${[['Records, audit & approvals','Browser-local'],['Admin authentication & two-factor','Not connected'],['Customer accounts & subscriptions','Not connected'],['Sportsbook feeds & grading engines','Not connected'],['Billing, affiliates & payouts','Not connected'],['Email, push & Discord delivery','Not connected'],['Infrastructure & production controls','Not connected']].map(([name,status])=>`<div><dt>${name}</dt><dd>${status}</dd></div>`).join('')}</dl><p class="ad-muted">Role switching demonstrates permissions. It is not a security boundary. Do not enter real credentials or sensitive customer data.</p></div><footer class="ad-dialog-footer"><button class="ad-button danger" data-action="reset">Reset sample data</button><button class="ad-button primary" data-action="close-dialog">Done</button></footer>`);
}
function resetDialog() {
  showDialog(`<form id="admin-reset-form">${dialogHeader('Reset this sandbox?','This clears local sample edits, approvals and activity history.')}<div class="ad-dialog-body"><p>Production data and the rest of VisualOdds are unaffected. Export any sandbox records you want to keep first.</p><label class="ad-field"><span>Type RESET to continue</span><input name="confirmation" required pattern="RESET" autocomplete="off"></label><p class="ad-form-error" role="alert" hidden></p></div><footer class="ad-dialog-footer"><button type="button" class="ad-button" data-action="close-dialog">Cancel</button><button type="submit" class="ad-button danger">Reset sandbox</button></footer></form>`);
}
function searchDialog() {
  showDialog(`${dialogHeader('Search admin','Find an area or a sample record by name, ID or email.')}<div class="ad-dialog-body"><label class="ad-search global">${icon('search')}<input id="admin-global-search" aria-label="Search all admin records" placeholder="Search users, feeds, markets, settings…" autocomplete="off"></label><div id="admin-search-results"></div></div>`,'command-dialog');
  updateGlobalSearch(''); document.querySelector('#admin-global-search').focus();
}
function updateGlobalSearch(query) {
  const needle=query.toLowerCase().trim();
  const sections=ADMIN_SECTIONS.filter(section=>accessible(section.id)&&(!needle||`${section.label} ${section.description}`.toLowerCase().includes(needle)));
  const records=needle?ADMIN_SECTIONS.filter(section=>accessible(section.id)).flatMap(section=>rows(section.id).filter(row=>JSON.stringify(row).toLowerCase().includes(needle)).map(record=>({section,record}))).slice(0,15):[];
  document.querySelector('#admin-search-results').innerHTML=`${sections.slice(0,21).map(section=>`<button data-section="${section.id}">${icon(sectionIcons[section.id])}<span><strong>${esc(section.label)}</strong><small>${esc(section.group)}</small></span>${icon('arrow')}</button>`).join('')}${records.map(({section,record})=>`<button data-record="${esc(record.id)}" data-record-section="${section.id}">${icon(sectionIcons[section.id])}<span><strong>${esc(record.name)}</strong><small>${esc(section.label)} · ${esc(record.id)}</small></span>${badge(record.status)}</button>`).join('')}${!sections.length&&!records.length?'<p class="ad-inline-empty">No matching areas or records.</p>':''}`;
}
function download(name,contents,type) {
  const url=URL.createObjectURL(new Blob([contents],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportRecords(id, visible = false) {
  try { download(`sportslab-admin-${id}.csv`,store.exportCsv(id,visible?{ids:selectedRows().map(record=>record.id)}:{}),'text/csv;charset=utf-8');notify(visible?'Visible sandbox records exported.':'Sandbox CSV exported.'); } catch(error){notify(error.message,true);}
}
function exportSummary() {
  const summary=ADMIN_SECTIONS.filter(section=>section.id!=='overview'&&accessible(section.id)).map(section=>({area:section.label,records:rows(section.id).length,pendingApprovals:pending(section.id).length}));
  download('visualodds-admin-summary.csv','"Environment","Area","Records","Pending approvals"\r\n'+summary.map(row=>`"Local sandbox","${row.area.replaceAll('"','""')}",${row.records},${row.pendingApprovals}`).join('\r\n'),'text/csv;charset=utf-8');notify('Sandbox summary exported.');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a');if(!button)return;
  if(button.dataset.section){event.preventDefault();if(dialog.open)closeDialog();return navigate(button.dataset.section);}
  if(button.dataset.tab){return navigate(current,button.dataset.tab);}
  if(button.dataset.record){return inspect(button.dataset.recordSection||current,button.dataset.record);}
  if(button.dataset.edit){return editRecord(button.dataset.recordSection||current,button.dataset.edit);}
  if(button.dataset.recordAction){return actionDialog(button.dataset.recordSection||current,button.dataset.id,button.dataset.recordAction);}
  if(button.dataset.approval){return approvalDialog(button.dataset.approval);}
  if(button.dataset.sort){descending=sortKey===button.dataset.sort?!descending:false;sortKey=button.dataset.sort;updateTable();document.querySelector(`[data-sort="${CSS.escape(sortKey)}"]`)?.focus();return;}
  switch(button.dataset.action){
    case 'toggle-nav':toggleNavigation(!mobileOpen);break;
    case 'close-nav':toggleNavigation(false);break;
    case 'close-dialog':event.preventDefault();closeDialog();break;
    case 'create':editRecord(current);break;
    case 'approvals':navigate('overview','approvals');break;
    case 'sandbox':sandboxDialog();break;
    case 'reset':resetDialog();break;
    case 'search':searchDialog();break;
    case 'clear-filters':search='';statusFilter='';render();break;
    case 'export':current==='overview'?exportSummary():exportRecords(current,tab==='records');break;
    case 'export-dataset':exportRecords(document.querySelector('#admin-report-dataset').value);break;
    case 'export-audit':download('visualodds-admin-audit.json',JSON.stringify(state.audit.filter(item=>(current==='overview'||item.section===current)&&accessible(item.section)),null,2),'application/json');notify('Sandbox audit exported.');break;
  }
});
document.addEventListener('input',event=>{
  if(event.target.id==='admin-record-search'){search=event.target.value;updateTable();}
  if(event.target.id==='admin-global-search')updateGlobalSearch(event.target.value);
});
document.addEventListener('change',event=>{
  if(event.target.id==='admin-status-filter'){statusFilter=event.target.value;updateTable();}
  if(event.target.id==='admin-role'){
    try{store.setRole(event.target.value);if(!accessible(current))current='overview';navigate(current,tab);notify(`Sandbox persona changed to ${store.getState().role}.`);}catch(error){notify(error.message,true);render();}
  }
});
dialog.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;if(!form.reportValidity())return;
  const values=Object.fromEntries(new FormData(form));let result;
  try{
    if(form.id==='admin-edit-form'){
      const reason=values.changeReason;delete values.changeReason;
      sectionById(form.dataset.sectionId).fields.forEach(field=>{if(['number','integer'].includes(field.type)&&values[field.key]!=='')values[field.key]=Number(values[field.key]);});
      result=form.dataset.id?store.perform({section:form.dataset.sectionId,id:form.dataset.id,action:'edit',values,reason}):store.create({section:form.dataset.sectionId,values,reason});
    } else if(form.id==='admin-action-form')result=store.perform({section:form.dataset.sectionId,id:form.dataset.id,action:form.dataset.operation,reason:values.changeReason});
    else if(form.id==='admin-approval-form')result=store.reviewApproval(form.dataset.id,event.submitter?.value,values.changeReason);
    else if(form.id==='admin-reset-form'){if(values.confirmation!=='RESET')return;store.reset();current='overview';tab='records';history.replaceState({},'','/admin-sandbox');}
    closeDialog();render();notify(result?.outcome==='pending'?'Change requested. A second reviewer must approve it.':result?.outcome==='rejected'?'Change rejected. The record is unchanged.':result?.outcome==='requested'?'Sandbox request recorded. No external action was executed.':form.id==='admin-reset-form'?'Sample data reset.':'Sandbox changes saved.');
  }catch(error){const notice=form.querySelector('.ad-form-error');notice.textContent=error.message;notice.hidden=false;}
});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(dialog.open){notify('Finish or cancel the open dialog before starting a search.');}else searchDialog();}
  if(event.key==='Escape'&&mobileOpen){event.preventDefault();toggleNavigation(false);}
  if(event.key==='Tab'&&mobileOpen&&matchMedia('(max-width:760px)').matches){
    const controls=[...document.querySelectorAll('#admin-sidebar a,#admin-sidebar button,.ad-backdrop')];
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
});
window.addEventListener('popstate',()=>{current=location.pathname.split('/')[2]||'overview';tab=new URL(location.href).searchParams.get('tab')||'records';search='';statusFilter='';render();});
window.addEventListener('storage',event=>{if(event.key?.includes('admin'))notify('Sandbox data changed in another tab. Reload before editing.',true);});
render();

