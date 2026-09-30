import { decimal } from './ev-core.js?v=2';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const currency = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value) : '—';
const signedCurrency = value => Number.isFinite(value) ? `${value >= 0 ? '+' : '−'}${currency(Math.abs(value))}` : '—';
const stakeValue = value => Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, '') : '';
const decimalToAmerican = value => String(value >= 2 ? Math.round((value - 1) * 100) : Math.round(-100 / (value - 1)));
const parseOdds = (value, mode) => {
  const parsed = mode === 'decimal' ? Number(value) : decimal(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : NaN;
};

export function calculateArbitragePreview({ odds, boosts, stakes, balance = true, locked = 0 }) {
  const effective = odds.map((value, index) => value > 1 && Number.isFinite(value) && boosts[index] >= 0 && boosts[index] <= 1000
    ? 1 + (value - 1) * (1 + boosts[index] / 100) : NaN);
  const amounts = stakes.map(Number);
  if (effective.some(value => !Number.isFinite(value)) || amounts.some(value => !Number.isFinite(value) || value < 0) || (balance && !(amounts[locked] > 0))) return null;
  if (balance) amounts[1 - locked] = Math.round(amounts[locked] * effective[locked] / effective[1 - locked] * 100) / 100;
  const totalStake = amounts[0] + amounts[1];
  if (!(totalStake > 0)) return null;
  const payouts = amounts.map((value, index) => value * effective[index]);
  const profits = payouts.map(value => value - totalStake);
  const minimumPayout = Math.min(...payouts);
  const minimumProfit = Math.min(...profits);
  return { amounts, payouts, profits, totalStake, minimumPayout, minimumProfit, roi:minimumProfit / totalStake };
}

export function openArbCalculator({ first, second, stake, flatMultiplier, bankroll, brandMark, trigger }) {
  document.querySelector('#ev-arb-calculator')?.close();
  const quotes = [first, second];
  const initialOdds = quotes.map(quote => decimal(quote.odds));
  const hedgeRatio = initialOdds[0] / initialOdds[1];
  const anchor = Math.min(Number(stake) * Number(flatMultiplier), Number(bankroll) / (1 + hedgeRatio));
  const initialStakes = [anchor, Math.round(anchor * hedgeRatio * 100) / 100];
  const state = { mode:'american', boosts:[0, 0], stakes:[...initialStakes], balance:true, locked:0 };
  const market = `${first.player ? `${first.player} · ` : ''}${first.displayMarket || first.market}`;
  const columns = quotes.map((quote, index) => `<div class="arb-calc-book" id="arb-calc-book-${index}"><span class="arb-calc-book-mark" aria-hidden="true">${brandMark(quote.book)}</span><span><strong>${esc(quote.book)}</strong><small>${esc(quote.side)}${quote.line !== '' && quote.line != null ? ` ${esc(quote.line)}` : ''}</small></span></div>`).join('');
  const fields = (name, content) => `<div class="arb-calc-row"><span class="arb-calc-row-label">${name}</span>${content}</div>`;
  const dialog = document.createElement('dialog');
  dialog.id = 'ev-arb-calculator';
  dialog.className = 'arb-calc-dialog';
  dialog.setAttribute('aria-labelledby', 'arb-calc-title');
  dialog.innerHTML = `<div class="arb-calc-shell">
    <header class="arb-calc-header"><div><span class="arb-calc-kicker">${esc(first.displayEvent || first.event)} · ${esc(first.sport)}</span><h2 id="arb-calc-title">Arbitrage calculator</h2><p>${esc(market)}</p></div><button type="button" class="arb-calc-close" data-arb-calc-close aria-label="Close calculator"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></header>
    <div class="arb-calc-controls"><button type="button" class="arb-calc-balance is-active" data-arb-balance aria-pressed="true"><span class="arb-calc-balance-dot" aria-hidden="true"></span>Auto balance stakes</button><div class="arb-calc-mode" role="group" aria-label="Odds format"><button type="button" data-arb-mode="american" aria-pressed="true">+100</button><button type="button" data-arb-mode="decimal" aria-pressed="false">2.00</button></div></div>
    <div class="arb-calc-grid"><div class="arb-calc-grid-head"><span>Sportsbooks</span>${columns}</div>
      ${fields('Odds', quotes.map((quote, index) => `<label class="arb-calc-input-wrap"><span class="sr-only">${esc(quote.book)} odds</span><input data-arb-odds="${index}" type="number" step="any" inputmode="decimal" value="${esc(Number(quote.odds))}"></label>`).join(''))}
      ${fields('Boost', quotes.map((quote, index) => `<label class="arb-calc-input-wrap arb-calc-percent"><span class="sr-only">${esc(quote.book)} profit boost percentage</span><input data-arb-boost="${index}" type="number" min="0" max="1000" step="0.1" inputmode="decimal" value="0"><span aria-hidden="true">%</span></label>`).join(''))}
      ${fields('Stake', quotes.map((quote, index) => `<div class="arb-calc-stake-wrap"><label class="arb-calc-input-wrap arb-calc-currency"><span aria-hidden="true">$</span><span class="sr-only">${esc(quote.book)} stake in dollars</span><input data-arb-stake="${index}" type="number" min="0" step="0.01" inputmode="decimal" value="${stakeValue(initialStakes[index])}"></label><button type="button" class="arb-calc-lock" data-arb-lock="${index}" aria-label="Balance from ${esc(quote.book)} stake" aria-pressed="${index === 0}" title="Balance from this stake"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></div>`).join(''))}
      ${fields('Payout', quotes.map((_, index) => `<output class="arb-calc-output" data-arb-payout="${index}">—</output>`).join(''))}
      ${fields('Profit if this wins', quotes.map((_, index) => `<output class="arb-calc-output arb-calc-outcome" data-arb-profit="${index}">—</output>`).join(''))}
    </div>
    <p class="arb-calc-error" role="status" data-arb-error hidden></p>
    <div class="arb-calc-summary"><div><span>Total stake</span><strong data-arb-total-stake>—</strong></div><div><span>Minimum payout</span><strong data-arb-total-payout>—</strong></div><div class="arb-calc-summary-profit"><span data-arb-summary-label>Profit either way</span><strong data-arb-total-profit>—</strong><small data-arb-roi>—</small></div></div>
    <footer class="arb-calc-footer"><span>Boost applies to winnings only. Preview from entered prices; check limits and availability.</span><button type="button" data-arb-reset>Reset values</button></footer>
  </div>`;
  document.body.append(dialog);
  const one = selector => dialog.querySelector(selector);
  const all = selector => [...dialog.querySelectorAll(selector)];
  const oddsInputs = all('[data-arb-odds]');
  const boostInputs = all('[data-arb-boost]');
  const stakeInputs = all('[data-arb-stake]');
  const update = (editedStake = null) => {
    const odds = oddsInputs.map(input => parseOdds(input.value, state.mode));
    const boosts = boostInputs.map(input => Number(input.value));
    const result = calculateArbitragePreview({ odds, boosts, stakes:state.stakes, balance:state.balance, locked:state.locked });
    const error = one('[data-arb-error]');
    error.hidden = Boolean(result);
    error.textContent = result ? '' : 'Enter valid odds, boosts, and a stake above zero to calculate this pair.';
    all('[data-arb-lock]').forEach((button, index) => button.setAttribute('aria-pressed', String(state.balance && state.locked === index)));
    one('[data-arb-balance]').setAttribute('aria-pressed', String(state.balance));
    one('[data-arb-balance]').classList.toggle('is-active', state.balance);
    if (result) {
      state.stakes = result.amounts;
      stakeInputs.forEach((input, index) => { if (input !== editedStake) input.value = stakeValue(result.amounts[index]); });
    }
    all('[data-arb-payout]').forEach((output, index) => output.textContent = result ? currency(result.payouts[index]) : '—');
    all('[data-arb-profit]').forEach((output, index) => {
      output.textContent = result ? signedCurrency(result.profits[index]) : '—';
      output.classList.toggle('is-negative', Boolean(result && result.profits[index] < 0));
    });
    one('[data-arb-total-stake]').textContent = result ? currency(result.totalStake) : '—';
    one('[data-arb-total-payout]').textContent = result ? currency(result.minimumPayout) : '—';
    one('[data-arb-total-profit]').textContent = result ? signedCurrency(result.minimumProfit) : '—';
    one('[data-arb-total-profit]').classList.toggle('is-negative', Boolean(result && result.minimumProfit < 0));
    one('[data-arb-summary-label]').textContent = state.balance && result?.minimumProfit >= 0 ? 'Profit either way' : 'Worst case profit';
    one('[data-arb-roi]').textContent = result ? `${(result.roi * 100 >= 0 ? '+' : '')}${(result.roi * 100).toFixed(1)}% ROI` : '—';
  };
  dialog.addEventListener('input', event => {
    const oddsIndex = event.target.dataset.arbOdds;
    const boostIndex = event.target.dataset.arbBoost;
    const stakeIndex = event.target.dataset.arbStake;
    if (oddsIndex !== undefined || boostIndex !== undefined) update();
    if (stakeIndex !== undefined) {
      state.stakes[Number(stakeIndex)] = Number(event.target.value);
      if (state.balance) state.locked = Number(stakeIndex);
      update(event.target);
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-arb-calc-close]')) return dialog.close();
    const mode = event.target.closest('[data-arb-mode]');
    if (mode && mode.dataset.arbMode !== state.mode) {
      const oldOdds = oddsInputs.map((input, index) => parseOdds(input.value, state.mode) || initialOdds[index]);
      state.mode = mode.dataset.arbMode;
      oddsInputs.forEach((input, index) => { input.value = state.mode === 'decimal' ? oldOdds[index].toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : decimalToAmerican(oldOdds[index]); });
      all('[data-arb-mode]').forEach(button => button.setAttribute('aria-pressed', String(button === mode)));
      return update();
    }
    if (event.target.closest('[data-arb-balance]')) { state.balance = !state.balance; return update(); }
    const lock = event.target.closest('[data-arb-lock]');
    if (lock) { state.locked = Number(lock.dataset.arbLock); state.balance = true; return update(); }
    if (event.target.closest('[data-arb-reset]')) {
      state.mode = 'american'; state.boosts = [0, 0]; state.stakes = [...initialStakes]; state.balance = true; state.locked = 0;
      oddsInputs.forEach((input, index) => { input.value = String(Number(quotes[index].odds)); });
      boostInputs.forEach(input => { input.value = '0'; });
      all('[data-arb-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.arbMode === 'american')));
      return update();
    }
  });
  dialog.addEventListener('close', () => { dialog.remove(); trigger?.focus(); }, { once:true });
  dialog.showModal();
  update();
  oddsInputs[0].focus();
}
