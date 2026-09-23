import { BET_STORAGE_KEY, STATUSES, validateBet, betReturns, summarizeBets, readBets, writeBets, betsCsv } from './bet-utils.js';
import { BetLegEditor } from './bet-editor.js';
import { LEG_RESULTS, legState, ticketSettlement, gameKey, refreshTicket } from './bet-legs.js';

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
let tracking=false;
const editor=new BetLegEditor($('#leg-editor'),()=>{if(editor.rows.length>1)field('type').value='parlay';updateForm();});
const safeUrl=url=>/^https:\/\/(site\.api\.espn\.com|statsapi\.mlb\.com)\//.test(url||'')?esc(url):'#';
function legMarkup(leg,index){
  const state=legState(leg),o=leg.observation,actual=o?.actual;
  const threshold=leg.market==='moneyline'?'Moneyline':leg.market==='spread'?'Spread '+(leg.line>0?'+':'')+leg.line:(leg.side==='under'?'Under ':'Over ')+leg.line;
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
  render();
}

function filteredBets() {
  const query = $('#bet-search').value.trim().toLowerCase();
  const sport = $('#sport-filter').value, status = $('#status-filter').value;
  return bets.filter(bet => (!sport || bet.sport === sport || bet.legs?.some(l=>l.sport===sport)) && (!status || bet.status === status) && (!query || `${bet.selection} ${bet.book} ${bet.notes} ${(bet.legs||[]).map(l=>l.label+' '+l.matchup).join(' ')}`.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function render() {
  if (!storageReady) {
    $('#bet-summary').innerHTML = '';
    $('#bet-list').innerHTML = '<div class="bet-empty"><h2>Your saved bets are unavailable</h2><p>Restore access to browser storage and reload to continue.</p></div>';
    $('#bet-count').textContent = 'Storage unavailable';
    $('#export-bets').disabled = true;
    return;
  }
  const total = summarizeBets(bets);
  const cards = [
    ['Net profit / loss', signedMoney(total.profit), 'Settled bets only', tone(total.profit)],
    ['ROI', total.roi === null ? '—' : `${total.roi > 0 ? '+' : ''}${total.roi.toFixed(1)}%`, `${money(total.settledStake)} in settled stakes`, tone(total.roi)],
    ['Record', `${total.won}–${total.lost}`, total.winRate === null ? 'Wins – losses · No decided bets' : `${total.winRate.toFixed(1)}% win rate · Wins / losses only`, ''],
    ['Open stake', money(total.openStake), `${total.open} open ${total.open === 1 ? 'bet' : 'bets'}`, ''],
  ];
  $('#bet-summary').innerHTML = cards.map(([label, value, note, color]) => `<article class="summary-card"><div class="label">${label}</div><div class="summary-value ${color}">${value}</div><div class="summary-note">${note}</div></article>`).join('');
  const visible = filteredBets();
  const hasFilter = !!($('#bet-search').value || $('#sport-filter').value || $('#status-filter').value);
  $('#clear-filters').hidden = !hasFilter;
  $('#bet-count').textContent = `${visible.length} of ${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} · Newest first`;
  $('#export-bets').disabled = !visible.length;
  $('#export-bets').textContent = hasFilter ? '↓ Export filtered CSV' : '↓ Export CSV';
  if (!visible.length) {
    $('#bet-list').innerHTML = bets.length
      ? '<div class="bet-empty"><h2>No matching tickets</h2><p>Try another search or clear your filters to see all your bets.</p><button class="button subtle" data-clear>Clear filters</button></div>'
      : '<div class="bet-empty"><span class="bet-empty-icon" aria-hidden="true">▤</span><h2>Your first ticket starts here</h2><p>Add your stake, ticket odds, and each selection. Connect the legs to games to follow their results automatically.</p><button class="button primary" data-add>＋ Add your first bet</button></div>';
    return;
  }
  $('#bet-list').innerHTML = `<div class="bet-ledger">${visible.map(bet => {
    const result = betReturns(bet),repricing=bet.settlement==='auto'&&ticketSettlement(bet.legs||[]).needsReturn;
    const odds = bet.oddsFormat === 'american' ? `${bet.odds > 0 ? '+' : ''}${bet.odds}` : String(bet.odds);
    const date = new Date(`${bet.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const legs=bet.legs||[];
    return `<article class="bet-ticket"><div class="bet-row"><div class="bet-description"><div class="bet-meta"><span class="sport-tag">${esc([...new Set(legs.map(l=>l.sport))].join(' + ')||bet.sport)}</span><span>· ${bet.type === 'parlay' ? (legs.length?legs.length+'-leg parlay':'Parlay') : 'Single'}</span><span>· ${esc(date)}</span></div><h3 class="bet-selection">${esc(bet.selection)}</h3>${bet.book ? `<p class="bet-book">${esc(bet.book)}</p>` : ''}${bet.notes ? `<details class="bet-notes"><summary>Notes</summary><p>${esc(bet.notes)}</p></details>` : ''}</div><div class="bet-number"><span>${bet.oddsFormat === 'decimal' ? 'Decimal odds' : 'American odds'}</span><strong>${esc(odds)}</strong></div><div class="bet-number"><span>Stake</span><strong>${money(bet.stake)}</strong></div><div class="bet-number"><span>${repricing?'Book payout needed':bet.status === 'open' ? 'To win · net' : 'Profit / loss'}</span><strong class="${bet.status === 'open' ? '' : tone(result.profit)}">${repricing?'—':signedMoney(result.profit ?? result.potentialProfit)}</strong></div><span class="bet-result ${bet.status}">${STATUSES[bet.status]}</span><button class="button subtle" data-edit="${esc(bet.id)}" aria-label="Edit ${esc(bet.selection)}">Edit ticket</button></div>${legs.length?`<div class="ticket-tracking"><div class="leg-summary"><strong>${legs.filter(l=>legState(l)==='won').length} / ${legs.length} legs hit</strong><span>${esc(bet.settlement==='auto'?ticketSettlement(legs).note:'Ticket result set from sportsbook.')}</span></div><ol class="tracked-legs">${legs.map(legMarkup).join('')}</ol></div>`:'<p class="legacy-ticket">Manual ticket · Edit to add and track each selection.</p>'}</article>`;
  }).join('')}</div>`;
}

function clearFilters() {
  $('#bet-search').value = '';
  $('#sport-filter').value = '';
  $('#status-filter').value = '';
  render();
}

function updateForm() {
  const automatic=field('settlement').value==='auto';
  const legs=editor.values();
  if(automatic)field('status').value=ticketSettlement(legs).status;
  field('status').disabled=automatic;
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

function openForm(id) {
  if (!storageReady) return;
  editing = id ? bets.find(bet => bet.id === id) : null;
  if (id && !editing) return;
  form.reset();
  field('date').value = today();
  if (editing) for (const [key, value] of Object.entries(editing)) { if (field(key)) field(key).value = value ?? ''; }
  field('settlement').value=editing?.settlement|| (editing?'manual':'auto');
  editor.reset(editing?.legs||[],field('sport').value,field('date').value);
  if(!editing)editor.add(field('sport').value,field('date').value);
  $('#bet-dialog-title').textContent = editing ? 'Edit your bet' : 'Add a bet';
  $('#delete-bet').hidden = !editing;
  $('#form-error').hidden = true;
  updateForm();
  dialog.showModal();
  field('selection').focus();
}

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

form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const validated = validateBet({...Object.fromEntries(new FormData(form)),status:field('status').value,legs:editor.values()});
    const bet = { ...validated, id: editing?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    mutate(latest => editing ? latest.map(item => item.id === editing.id ? bet : item) : [...latest, bet]);
    dialog.close();
    toast(editing ? 'Bet updated.' : 'Bet saved.');
    refreshLines({all:true});
  } catch (error) {
    $('#form-error').textContent = error.message;
    $('#form-error').hidden = false;
  }
});
form.addEventListener('input', updateForm);
form.addEventListener('change', updateForm);
$('#add-bet').addEventListener('click', () => openForm());
$('#add-leg').addEventListener('click',()=>editor.add(field('sport').value,field('date').value));
$('#close-bet').addEventListener('click', () => dialog.close());
$('#cancel-bet').addEventListener('click', () => dialog.close());
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
  if (button?.dataset.edit) openForm(button.dataset.edit);
});
$('#bet-search').addEventListener('input', render);
$('#sport-filter').addEventListener('change', render);
$('#status-filter').addEventListener('change', render);
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
  if(tracking||!storageReady||document.hidden||dialog.open)return;
  const candidates=bets.filter(b=>b.legs?.some(l=>l.mode==='auto'&&!l.override&&(all||!['won','lost','push','void'].includes(legState(l))||Date.parse(l.date)>Date.now()-3*86400000)));
  const groups=new Map(candidates.flatMap(b=>b.legs.filter(l=>l.mode==='auto'&&!l.override).map(l=>[gameKey(l),l])));
  if(!groups.size){$('#tracking-status').textContent=bets.some(b=>b.legs?.some(l=>l.mode==='auto'))?'No unfinished legs to check. Use Refresh results to recheck earlier games.':'Add connected legs to track game results. Existing manual tickets are preserved.';return;}
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
