import { BET_STORAGE_KEY, STATUSES, validateBet, betReturns, summarizeBets, readBets, writeBets, betsCsv } from './bet-utils.js';

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
  return bets.filter(bet => (!sport || bet.sport === sport) && (!status || bet.status === status) && (!query || `${bet.selection} ${bet.book} ${bet.notes}`.toLowerCase().includes(query)))
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
      : '<div class="bet-empty"><span class="bet-empty-icon" aria-hidden="true">▤</span><h2>Your first ticket starts here</h2><p>Add a bet with the odds and stake you took. Come back to record the result and see how you’re doing.</p><button class="button primary" data-add>＋ Add your first bet</button></div>';
    return;
  }
  $('#bet-list').innerHTML = `<div class="bet-ledger">${visible.map(bet => {
    const result = betReturns(bet);
    const odds = bet.oddsFormat === 'american' ? `${bet.odds > 0 ? '+' : ''}${bet.odds}` : String(bet.odds);
    const date = new Date(`${bet.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `<article class="bet-row"><div class="bet-description"><div class="bet-meta"><span class="sport-tag">${esc(bet.sport)}</span><span>· ${bet.type === 'parlay' ? 'Parlay' : 'Single'}</span><span>· ${esc(date)}</span></div><h3 class="bet-selection">${esc(bet.selection)}</h3>${bet.book ? `<p class="bet-book">${esc(bet.book)}</p>` : ''}${bet.notes ? `<details class="bet-notes"><summary>Notes / legs</summary><p>${esc(bet.notes)}</p></details>` : ''}</div><div class="bet-number"><span>${bet.oddsFormat === 'decimal' ? 'Decimal odds' : 'American odds'}</span><strong>${esc(odds)}</strong></div><div class="bet-number"><span>Stake</span><strong>${money(bet.stake)}</strong></div><div class="bet-number"><span>${bet.status === 'open' ? 'To win · net' : 'Profit / loss'}</span><strong class="${bet.status === 'open' ? '' : tone(result.profit)}">${signedMoney(result.profit ?? result.potentialProfit)}</strong></div><span class="bet-result ${bet.status}">${STATUSES[bet.status]}</span><button class="button subtle" data-edit="${esc(bet.id)}" aria-label="${bet.status === 'open' ? 'Set result for' : 'Edit'} ${esc(bet.selection)}">${bet.status === 'open' ? 'Set result' : 'Edit bet'}</button></article>`;
  }).join('')}</div>`;
}

function clearFilters() {
  $('#bet-search').value = '';
  $('#sport-filter').value = '';
  $('#status-filter').value = '';
  render();
}

function updateForm() {
  const decimal = field('oddsFormat').value === 'decimal';
  field('odds').step = decimal ? 'any' : '1';
  field('odds').placeholder = decimal ? '1.91' : '−110';
  $('#odds-help').textContent = decimal ? 'Enter decimal odds greater than 1.' : 'Use +100 or higher, or −100 or lower.';
  const cashed = field('status').value === 'cashed';
  $('#cashout-field').hidden = !cashed;
  field('cashout').required = cashed;
  field('cashout').disabled = !cashed;
  try {
    const input = Object.fromEntries(new FormData(form));
    // The preview does not require a description to have been typed yet.
    const result = betReturns(validateBet({ ...input, selection: input.selection || 'Preview' }));
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
  $('#bet-dialog-title').textContent = editing ? 'Edit your bet' : 'Add a bet';
  $('#delete-bet').hidden = !editing;
  $('#form-error').hidden = true;
  updateForm();
  dialog.showModal();
  (editing?.status === 'open' ? field('status') : field('selection')).focus();
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
    const validated = validateBet(Object.fromEntries(new FormData(form)));
    const bet = { ...validated, id: editing?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    mutate(latest => editing ? latest.map(item => item.id === editing.id ? bet : item) : [...latest, bet]);
    dialog.close();
    toast(editing ? 'Bet updated.' : 'Bet saved.');
  } catch (error) {
    $('#form-error').textContent = error.message;
    $('#form-error').hidden = false;
  }
});
form.addEventListener('input', updateForm);
form.addEventListener('change', updateForm);
$('#add-bet').addEventListener('click', () => openForm());
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
window.addEventListener('storage', event => { if (event.key === BET_STORAGE_KEY || event.key === null) load(); });
load();
