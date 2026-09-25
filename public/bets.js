import { BET_STORAGE_KEY, STATUSES, validateBet, betReturns, summarizeBets, readBets, writeBets, betsCsv } from './bet-utils.js';
import { BetLegEditor } from './bet-editor.js';
import { LEG_RESULTS, legState, ticketSettlement, gameKey, refreshTicket, formatLegTarget, validateLeg } from './bet-legs.js';
import { icon } from './ui-icons.js';
import { BetDashboard } from './bet-dashboard-v2.js?v=3';
import { BetSlipImport } from './bet-slip-import.js';
import {sportsbookMark} from './product-ui.js';

const $ = selector => document.querySelector(selector);
const form = $('#bet-form');
const dialog = $('#bet-dialog');
const field = name => form.elements.namedItem(name);
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const signedMoney = amount => (amount > 0 ? '+' : '') + money(amount);
const tone = amount => amount > 0 ? 'bet-positive' : amount < 0 ? 'bet-negative' : '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
let bets = [], editing = null, toastTimer, storageReady = false;
let dirty = false, saving = false, returnFocus = null;
let tracking=false;
document.querySelectorAll('[data-bet-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.betIcon);});
const dashboard=new BetDashboard($('#bet-overview'),{month:today().slice(0,7),onChange:()=>{$('#ticket-range').value='month';render();}});
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
    bets = readBets(localStorage);
    storageReady = true;
    $('#storage-error').hidden = true;
  } catch {
    storageReady = false;
    $('#storage-error').textContent = 'Saved bets could not be read. Check browser storage permissions and reload. Existing data has not been overwritten.';
    $('#storage-error').hidden = false;
  }
  $('#add-bet').disabled = !storageReady;
  $('#import-slip').disabled = !storageReady;
  render();
}

function filteredBets(ignoreStatus=false) {
  const query = $('#bet-search').value.trim().toLowerCase();
  const sport = $('#sport-filter').value, status = ignoreStatus?'':$('#status-filter').value,book=$('#book-filter').value;
  return bets.filter(bet => (!dashboard.selectedDay||bet.date===dashboard.selectedDay) && ($('#ticket-range').value==='all'||bet.date.startsWith(dashboard.month)) && (!book||(bet.book||'No sportsbook')===book) && (!sport || bet.sport === sport || bet.legs?.some(l=>l.sport===sport)) && (!status || (status === 'settled' ? bet.status !== 'open' : bet.status === status)) && (!query || `${bet.selection} ${bet.book} ${bet.notes} ${(bet.legs||[]).map(l=>l.label+' '+l.matchup).join(' ')}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function render() {
  document.body.classList.toggle('tracker-empty', storageReady && !bets.length);
  if (!storageReady) {
    $('#bet-overview').innerHTML = '';
    $('#alltime-bet-summary').textContent='Storage unavailable';
    $('#bet-list').innerHTML = '<div class="bet-empty"><h2>Your saved bets are unavailable</h2><p>Restore access to browser storage and reload to continue.</p></div>';
    $('#bet-count').textContent = 'Storage unavailable';
    $('#export-bets').disabled = true;
    return;
  }
  const total = summarizeBets(bets);
  $('#alltime-bet-summary').innerHTML=`<span>Net profit <strong class="${tone(total.profit)}">${signedMoney(total.profit)}</strong></span><span>ROI <strong>${total.roi===null?'—':total.roi.toFixed(1)+'%'}</strong></span><span>Record <strong>${total.won} wins · ${total.lost} losses</strong></span><span>Open stake <strong>${money(total.openStake)}</strong></span>`;
  const calendarFocus=document.activeElement?.getAttribute('data-calendar-day');
  dashboard.render(bets);
  if(calendarFocus)document.querySelector(`[data-calendar-day="${calendarFocus}"]`)?.focus({preventScroll:true});
  const currentBook=$('#book-filter').value;
  $('#book-filter').innerHTML='<option value="">All books</option>'+[...new Set(bets.map(b=>b.book||'No sportsbook'))].sort().map(book=>`<option value="${esc(book)}">${esc(book)}</option>`).join('');
  $('#book-filter').value=currentBook;
  $('#selected-bet-day').hidden=!dashboard.selectedDay;
  $('#selected-bet-day').innerHTML=dashboard.selectedDay?`<span>Tickets placed ${esc(new Date(dashboard.selectedDay+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}))}</span><button class="tracker-button" type="button" data-clear-day>Show the whole month ${icon('close')}</button>`:'';
  const selectedStatus = $('#status-filter').value;
  document.querySelectorAll('[data-ticket-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ticketView === (selectedStatus && selectedStatus !== 'open' ? 'settled' : selectedStatus))));
  const counted=filteredBets(true),openCount=counted.filter(b=>b.status==='open').length;
  const ticketCounts = { all: counted.length, open: openCount, settled: counted.length - openCount };
  document.querySelectorAll('[data-ticket-count]').forEach(element => { element.textContent = ticketCounts[element.dataset.ticketCount]; });
  const expanded=new Set([...document.querySelectorAll('.bet-ticket details[open]')].map(el=>el.closest('[data-ticket-id]').dataset.ticketId+':'+el.className));
  const focusedEdit=document.activeElement?.dataset.edit;
  const visible = filteredBets();
  const hasFilter = !!($('#bet-search').value || $('#sport-filter').value || $('#status-filter').value || $('#book-filter').value || dashboard.selectedDay || $('#ticket-range').value!=='all');
  $('#clear-filters').hidden = !hasFilter;
  $('#bet-count').textContent = `${visible.length} of ${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} · Newest first`;
  $('#export-bets').disabled = !visible.length;
  $('#export-bets').innerHTML = icon('download')+(hasFilter ? ' Export filtered CSV' : ' Export CSV');
  if (!visible.length) {
    $('#bet-list').innerHTML = bets.length
      ? '<div class="bet-empty"><h2>No tickets in this view</h2><p>Choose another month, change your filters, or view your full record.</p><button class="tracker-button" data-clear>Show all tickets</button></div>'
      : `<div class="bet-empty"><span class="bet-empty-icon" aria-hidden="true">${icon('picks')}</span><h2>No saved tickets yet</h2><p>Add a ticket or import a sportsbook screenshot.</p><div><button class="tracker-button primary" data-add>${icon('plus')} Add a bet</button><button class="tracker-button" data-import>${icon('paper')} Import screenshot</button></div></div>`;
    return;
  }
  $('#bet-list').innerHTML = `<div class="bet-ledger">${visible.map(bet => {
    const result = betReturns(bet),repricing=bet.settlement==='auto'&&ticketSettlement(bet.legs||[]).needsReturn;
    const odds = bet.oddsFormat === 'american' ? `${bet.odds > 0 ? '+' : ''}${bet.odds}` : String(bet.odds);
    const date = new Date(`${bet.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const legs=bet.legs||[];
    return `<article class="bet-ticket" data-ticket-id="${esc(bet.id)}"><div class="bet-row"><div class="bet-description"><div class="bet-meta"><span class="sport-tag">${esc([...new Set(legs.map(l=>l.sport))].join(' + ')||bet.sport)}</span><span>· ${bet.type === 'parlay' ? (legs.length?legs.length+'-leg parlay':'Parlay') : 'Single'}</span><span>· ${esc(date)}</span>${!legs.length?'<span title="Edit ticket to add and track individual selections">· Manual</span>':''}</div><h3 class="bet-selection">${esc(bet.selection)}</h3>${bet.book ? `<p class="bet-book">${esc(bet.book)}</p>` : ''}${bet.notes ? `<details class="bet-notes"><summary>Notes</summary><p>${esc(bet.notes)}</p></details>` : ''}</div><div class="bet-number"><span>${bet.oddsFormat === 'decimal' ? 'Decimal odds' : 'American odds'}</span><strong class="record-price" title="${esc(bet.book||'')}">${sportsbookMark(bet.book)}${esc(odds)}</strong></div><div class="bet-number"><span>Stake</span><strong>${money(bet.stake)}</strong></div><div class="bet-number"><span>${bet.status==='open'?'Potential return':'Total returned'}</span><strong>${repricing?'—':money(result.returned??result.potentialReturn)}</strong></div><div class="bet-number"><span>${repricing?'Book payout needed':bet.status === 'open' ? 'To win · net' : 'Profit / loss'}</span><strong class="${bet.status === 'open' ? '' : tone(result.profit)}">${repricing?'—':signedMoney(result.profit ?? result.potentialProfit)}</strong></div><span class="bet-result ${bet.status}">${STATUSES[bet.status]}</span><button class="button subtle" data-edit="${esc(bet.id)}" aria-label="Edit ${esc(bet.selection)}">Edit ticket</button></div>${legs.length?`<details class="ticket-tracking"><summary class="leg-summary"><strong>${legs.filter(l=>legState(l)==='won').length} / ${legs.length} legs hit</strong><span>${esc(bet.settlement==='auto'?ticketSettlement(legs).note:'Ticket result set from sportsbook.')}</span><span class="ticket-details-action">View selections ${icon('chevron')}</span></summary><ol class="tracked-legs">${legs.map(legMarkup).join('')}</ol></details>`:''}</article>`;
  }).join('')}</div>`;
  document.querySelectorAll('.bet-ticket details').forEach(el=>{el.open=expanded.has(el.closest('[data-ticket-id]').dataset.ticketId+':'+el.className);});
  if(focusedEdit)[...document.querySelectorAll('[data-edit]')].find(el=>el.dataset.edit===focusedEdit)?.focus({preventScroll:true});
}

function clearFilters() {
  $('#bet-search').value = '';
  $('#sport-filter').value = '';
  $('#status-filter').value = '';
  $('#book-filter').value='';$('#ticket-range').value='all';dashboard.selectedDay='';
  render();
}

function updateForm() {
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
  if (editing) for (const [key, value] of Object.entries(editing)) { if (field(key)) field(key).value = value ?? ''; }
  field('settlement').value=editing?.settlement|| (editing?'manual':'auto');
  editor.reset(editing?.legs||[],field('sport').value,field('date').value);
  if(!editing&&!draft)editor.add(field('sport').value,field('date').value);
  $('#slip-form-review').hidden=!draft;
  if(draft){
    for(const [key,value] of Object.entries(draft.fields))if(field(key))field(key).value=value??'';
    editor.reset(draft.legs.map(leg=>({...leg,id:crypto.randomUUID()})),field('sport').value,field('date').value);
    $('#slip-form-review').innerHTML=`<strong>${icon('paper')} Review your imported ticket</strong><p>Check the stake, combined odds and every selection against your screenshot. Imported selections use manual results until you connect them to a game.</p>${draft.preview?'<details class="imported-slip-source"><summary>View original screenshot</summary><img alt="Original screenshot for checking your ticket" src="'+esc(draft.preview)+'"></details>':''}${draft.issues.length?'<ul>'+draft.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul>':''}`;
    returnFocus=$('#import-slip');
  }
  $('#bet-dialog-title').textContent = editing ? 'Edit your bet' : 'Add a bet';
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
  const ticketField = /odds/i.test(message) ? 'odds' : /Stake/.test(message) ? 'stake' : /Cash-out/.test(message) ? 'cashout' : /Actual return/.test(message) ? 'returnOverride' : /bet description/.test(message) ? 'selection' : /bet date/.test(message) ? 'date' : /single needs|parlay needs/.test(message) ? 'type' : null;
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
  const latest = readBets(localStorage);
  if (editing) {
    const current = latest.find(bet => bet.id === editing.id);
    if (!current || current.updatedAt !== editing.updatedAt) throw new Error('This bet changed in another tab. Close this form and reopen the latest ticket.');
  }
  const next = change(latest);
  try { writeBets(localStorage, next); }
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
    saving = true; submit.disabled = true; submit.textContent = 'Saving…'; form.setAttribute('aria-busy','true');
    await new Promise(resolve => requestAnimationFrame(resolve));
    const bet = { ...validated, id: editing?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    if(!editing){dashboard.month=bet.date.slice(0,7);dashboard.selectedDay='';$('#ticket-range').value='month';for(const id of ['bet-search','sport-filter','status-filter','book-filter'])$('#'+id).value='';}
    mutate(latest => editing ? latest.map(item => item.id === editing.id ? bet : item) : [...latest, bet]);
    dialog.close();
    toast(editing ? 'Bet updated.' : 'Bet saved.');
    refreshLines({all:true});
  } catch (error) {
    showFormError(error.message, errorControl(error.message));
  } finally {
    saving = false; submit.disabled = false; submit.textContent = 'Save bet'; form.removeAttribute('aria-busy');
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
  const button = event.target.closest('button');
  if (button?.hasAttribute('data-add')) openForm();
  if (button?.hasAttribute('data-clear')) clearFilters();
  if (button?.hasAttribute('data-import')) slipImport.open();
  if (button?.dataset.edit) openForm(button.dataset.edit);
});
$('#bet-search').addEventListener('input', render);
$('#sport-filter').addEventListener('change', render);
$('#status-filter').addEventListener('change', render);
$('#book-filter').addEventListener('change',render);
$('#ticket-range').addEventListener('change',()=>{dashboard.selectedDay='';render();});
$('#selected-bet-day').addEventListener('click',event=>{if(event.target.closest('[data-clear-day]')){dashboard.selectedDay='';render();}});
document.querySelectorAll('[data-ticket-view]').forEach(button => button.addEventListener('click', () => {
  $('#status-filter').value = button.dataset.ticketView;
  $('#status-filter').dispatchEvent(new Event('change', { bubbles: true }));
}));
$('#clear-filters').addEventListener('click', clearFilters);
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
    const latest=readBets(localStorage);
    const updated=latest.map(b=>{
      if(!candidates.some(c=>c.id===b.id)||dialog.open&&editing?.id===b.id)return b;
      const refreshed=refreshTicket(b,snapshots);
      return JSON.stringify(refreshed)!==JSON.stringify(b)?{...refreshed,updatedAt:new Date().toISOString()}:b;
    });
    writeBets(localStorage,updated);bets=updated;render();
    $('#tracking-status').textContent=(failed?failed+' game feeds unavailable or stale; prior readings may remain. ':'')+'Checked '+new Date().toLocaleTimeString()+'. Refreshes every minute while visible.';
  }catch(e){$('#tracking-status').textContent='Results could not be saved: '+e.message;}
  finally{tracking=false;$('#refresh-lines').disabled=false;}
}
$('#refresh-lines').addEventListener('click',()=>refreshLines({all:true}));
setInterval(refreshLines,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLines({all:true});});
window.addEventListener('storage', event => { if (event.key === BET_STORAGE_KEY || event.key === null) load(); });
load();
refreshLines({all:true});
