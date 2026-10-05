import './trends-controls.js';
// The calculator pages run the shared formulas (betting-math.js) on the numbers a reader enters.
import { decimal as decimalOdds, implied as impliedProbability, decimalToAmerican, fractionalOdds, expectedReturn, kellyFraction, devig, constrainedArb, promoConversion, parlay } from './betting-math.js';

const form = document.querySelector('#bet-form');
const search = document.querySelector('#bet-search');

const number = (data, name) => {
  const raw = data.get(name);
  const label = name.replace(/[A-Z]/g, char => ` ${char.toLowerCase()}`).trim();
  if (raw === null || String(raw).trim() === '') throw Error(`Enter a value for ${label}.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw Error(`Enter a valid number for ${label}.`);
  return value;
};
const american = odds => {
  const value = decimalOdds(odds);
  if (!Number.isFinite(value)) throw Error('Enter valid American odds, such as -110 or +125.');
  return value;
};
const implied = odds => { american(odds); return impliedProbability(odds); };
const profit = (stake, odds) => stake * (american(odds) - 1);
// Expected net value of a stake at a win probability.
const expectedNet = (stake, probability, odds) => { american(odds); return stake * expectedReturn(probability, odds); };
const pct = value => `${(value * 100).toFixed(2)}%`;
const money = value => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amerText = decimal => {
  const odds = decimalToAmerican(decimal);
  return Number.isFinite(odds) ? `${odds > 0 ? '+' : ''}${odds}` : 'No finite odds';
};
const result = (title, note, metrics, status = 'neutral') => ({ title, note, metrics, status });
const get = (data, names) => Object.fromEntries(names.map(name => [name, number(data, name)]));
const probabilityInput = p => {
  if (!Number.isFinite(p) || p < 0 || p > 100) throw Error('Probability must be between 0% and 100%.');
  return p / 100;
};
const positive = (value, label) => {
  if (!Number.isFinite(value) || value <= 0) throw Error(`${label} must be greater than zero.`);
  return value;
};

function calculate(kind, formData) {
  if (kind === 'arbitrage') {
    const { oddsA, oddsB, bankroll } = get(formData, ['oddsA', 'oddsB', 'bankroll']);
    positive(bankroll, 'Bankroll');
    const pA = implied(oddsA), pB = implied(oddsB), combined = pA + pB;
    if (combined >= 1) return result('No arbitrage at these prices', `Combined implied probability is ${pct(combined)}. The pair needs to be below 100% to balance a positive return.`, [
      ['Combined implied probability', pct(combined)], ['Break-even gap', pct(1 - combined)], ['Bankroll', money(bankroll)]
    ], 'negative');
    const plan = constrainedArb([{ odds: oddsA }, { odds: oddsB }], bankroll), [stakeA, stakeB] = plan.stakes;
    const payout = Math.min(...plan.payouts), net = plan.minProfit;
    return result('The entered prices form an arbitrage', `Balanced stakes return the same amount whichever outcome wins. This estimate assumes both wagers are accepted and settle alike.`, [
      ['Outcome A stake', money(stakeA)], ['Outcome B stake', money(stakeB)], ['Equal gross return', money(payout)], ['Estimated net profit', money(net)], ['Bankroll return', pct(net / bankroll)]
    ], 'positive');
  }
  if (kind === 'ev') {
    const { stake, odds } = get(formData, ['stake', 'odds']);
    positive(stake, 'Stake');
    const p = probabilityInput(number(formData, 'probability')), pBreak = implied(odds), ev = expectedNet(stake, p, odds);
    return result(ev >= 0 ? 'Positive expected value at this estimate' : 'Negative expected value at this estimate', 'Expected value is a long-run average under your probability estimate, not a prediction for this wager.', [
      ['Expected net value', money(ev)], ['Expected return on stake', pct(ev / stake)], ['Break-even probability', pct(pBreak)], ['Estimated probability edge', `${((p - pBreak) * 100).toFixed(2)} percentage points`], ['Potential net profit', money(profit(stake, odds))]
    ], ev > 0 ? 'positive' : ev < 0 ? 'negative' : 'neutral');
  }
  if (kind === 'parlay' || kind === 'parlaybuilder') {
    const legs = [];
    for (let i = 1; i <= 4; i++) {
      if (!formData.has(`include${i}`)) continue;
      const odds = number(formData, `odds${i}`), probability = probabilityInput(number(formData, `prob${i}`));
      legs.push({ odds, probability, decimal: american(odds) });
    }
    if (!legs.length) throw Error('Select at least one parlay leg.');
    const { stake } = get(formData, ['stake']);
    positive(stake, 'Stake');
    const ticket = legs.length > 1 ? parlay(legs.map((leg, index) => ({ event: index, odds: leg.odds, probability: leg.probability }))) : { payout: legs[0].decimal, probability: legs[0].probability };
    const decimal = ticket.payout, chance = ticket.probability;
    const payout = stake * decimal, ev = stake * (chance * decimal - 1);
    return result('Parlay payout and value estimate', 'Probability and expected value multiply the selected leg estimates and assume the legs are independent.', [
      ['Selections included', `${legs.length}`], ['Combined American odds', amerText(decimal)], ['Combined decimal odds', decimal.toFixed(3)], ['Estimated chance all legs win', pct(chance)], ['Break-even probability', pct(1 / decimal)], ['Gross payout if all win', money(payout)], ['Net profit if all win', money(payout - stake)], ['Estimated expected value', money(ev)]
    ], ev > 0 ? 'positive' : ev < 0 ? 'negative' : 'neutral');
  }
  if (kind === 'freebet') {
    const { token, oddsA, oddsB } = get(formData, ['token', 'oddsA', 'oddsB']);
    positive(token, 'Free bet value');
    american(oddsA); american(oddsB);
    const conversion = promoConversion({ stake: token, promoOdds: oddsA, hedgeOdds: oddsB, kind: 'bonus' }), hedge = conversion.hedge, cashValue = conversion.ifHedgeWins;
    return result('Estimated bonus bet conversion', 'This balances a stake-not-returned free bet against an opposing cash wager in a two-outcome market.', [
      ['Opposing hedge stake', money(hedge)], ['Estimated cash value', money(cashValue)], ['Conversion rate', pct(cashValue / token)], ['Free bet token', money(token)], ['Net if either side wins', money(cashValue)]
    ], 'positive');
  }
  if (kind === 'halfpoint') {
    const { stake, oldOdds, newOdds } = get(formData, ['stake', 'oldOdds', 'newOdds']);
    positive(stake, 'Stake');
    const p0 = probabilityInput(number(formData, 'cover')), p1 = p0 + probabilityInput(number(formData, 'added'));
    if (p1 > 1) throw Error('Current cover probability plus added probability cannot exceed 100%.');
    const ev0 = expectedNet(stake, p0, oldOdds);
    const ev1 = expectedNet(stake, p1, newOdds);
    const delta = ev1 - ev0;
    return result(delta > 0 ? 'The alternate line adds expected value' : delta < 0 ? 'The alternate line reduces expected value' : 'The two estimates are equal', 'The value of the added probability is your input. It varies by sport, market, and number.', [
      ['Current line EV', money(ev0)], ['Half-point line EV', money(ev1)], ['Estimated EV change', money(delta)], ['Alternate line probability', pct(p1)], ['Added cover probability', pct(p1 - p0)]
    ], delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral');
  }
  if (['hold', 'novig', 'vig'].includes(kind)) {
    const { oddsA, oddsB } = get(formData, ['oddsA', 'oddsB']);
    const pA = implied(oddsA), pB = implied(oddsB), overround = pA + pB;
    const [fairA, fairB] = devig([pA, pB], 'multiplicative');
    const label = kind === 'hold' ? 'Estimated market hold' : kind === 'vig' ? 'Estimated sportsbook vig' : 'No-vig fair odds';
    return result(label, 'Proportional no-vig probabilities normalize the two entered sides to 100%.', [
      ['Outcome A raw probability', pct(pA)], ['Outcome B raw probability', pct(pB)], ['Combined implied probability', pct(overround)], ['Estimated overround', pct(overround - 1)], ['Outcome A fair probability', pct(fairA)], ['Outcome B fair probability', pct(fairB)], ['Fair American odds', `${amerText(1 / fairA)} / ${amerText(1 / fairB)}`]
    ], overround < 1 ? 'positive' : overround > 1.08 ? 'negative' : 'neutral');
  }
  if (kind === 'implied' || kind === 'odds') {
    const { odds } = get(formData, ['odds']), decimal = american(odds), p = 1 / decimal;
    const fraction = (fractionalOdds(decimal) || [0, 1]).join('/');
    return result(kind === 'odds' ? 'Converted betting odds' : 'Implied break-even probability', `A $100 stake at these odds has a potential net profit of ${money(profit(100, odds))}. The probability includes market margin.`, [
      ['Implied probability', pct(p)], ['Decimal odds', decimal.toFixed(3)], ['Fractional odds', fraction], ['Profit on $100 stake', money(profit(100, odds))], ['Total return on $100 win', money(100 * decimal)]
    ]);
  }
  if (kind === 'kelly') {
    const { bankroll, odds, fraction } = get(formData, ['bankroll', 'odds', 'fraction']);
    positive(bankroll, 'Bankroll');
    if (fraction < 0 || fraction > 100) throw Error('Kelly fraction must be between 0% and 100%.');
    const p = probabilityInput(number(formData, 'probability')), d = american(odds);
    const full = kellyFraction(p, d), stake = bankroll * full * fraction / 100;
    return result(stake > 0 ? 'Estimated Kelly stake' : 'No positive Kelly stake at this estimate', 'Kelly staking is sensitive to probability error. Fractional Kelly scales down the full-Kelly bankroll share.', [
      ['Full Kelly fraction', pct(full)], ['Selected Kelly fraction', `${fraction}%`], ['Suggested stake', money(stake)], ['Share of bankroll staked', pct(stake / bankroll)], ['Break-even probability', pct(1 / d)]
    ], stake > 0 ? 'positive' : 'negative');
  }
  if (kind === 'spread') {
    const { teamScore, opponentScore, spread, odds, stake } = get(formData, ['teamScore', 'opponentScore', 'spread', 'odds', 'stake']);
    positive(stake, 'Stake');
    american(odds);
    if (!Number.isInteger(teamScore) || !Number.isInteger(opponentScore) || teamScore < 0 || opponentScore < 0) throw Error('Enter non-negative whole-number final scores.');
    const adjusted = teamScore + spread - opponentScore, grade = adjusted > 0 ? 'win' : adjusted < 0 ? 'loss' : 'push';
    const net = grade === 'win' ? profit(stake, odds) : grade === 'loss' ? -stake : 0;
    return result(`Spread bet: ${grade}`, 'This settles one standard point spread ticket. Confirm the sportsbook’s overtime and push rules.', [
      ['Adjusted margin', `${adjusted > 0 ? '+' : ''}${adjusted.toFixed(1)}`], ['Ticket result', grade[0].toUpperCase() + grade.slice(1)], ['Net profit or loss', money(net)], ['Total return', money(grade === 'win' ? stake + net : grade === 'push' ? stake : 0)], ['Spread used', spread > 0 ? `+${spread}` : `${spread}`]
    ], grade === 'win' ? 'positive' : grade === 'loss' ? 'negative' : 'neutral');
  }
  if (kind === 'poisson') {
    const mean = number(formData, 'mean'), k = number(formData, 'threshold'), mode = formData.get('mode');
    if (mean < 0 || mean > 100 || !Number.isInteger(k) || k < 0 || k > 100) throw Error('Use an average from 0 to 100 and a whole-number event count from 0 to 100.');
    const pmf = x => mean === 0 ? (x === 0 ? 1 : 0) : Math.exp(-mean + x * Math.log(mean) - Array.from({ length: x }, (_, i) => Math.log(i + 1)).reduce((a, b) => a + b, 0));
    let chance = 0;
    if (mode === 'exact') chance = pmf(k);
    if (mode === 'atleast') for (let i = k; i <= 250; i++) chance += pmf(i);
    if (mode === 'atmost') for (let i = 0; i <= k; i++) chance += pmf(i);
    const event = mode === 'exact' ? `exactly ${k}` : mode === 'atleast' ? `at least ${k}` : `at most ${k}`;
    return result(`Probability of ${event}`, 'A Poisson distribution assumes a stable average event rate and independent occurrences.', [
      ['Estimated probability', pct(chance)], ['Fair American odds', amerText(1 / chance)], ['Expected average (λ)', mean.toFixed(2)], ['Event threshold', `${k} events`], ['Calculation', mode === 'exact' ? `P(X = ${k})` : mode === 'atleast' ? `P(X ≥ ${k})` : `P(X ≤ ${k})`]
    ]);
  }
  if (kind === 'roundrobin') {
    const odds = [1, 2, 3, 4].map(i => Number(formData.get(`odds${i}`))).filter((_, i) => Number.isFinite(Number(formData.get(`odds${i}`))));
    const size = number(formData, 'legs'), eachStake = number(formData, 'unitStake');
    if (size > odds.length) throw Error('Combination size cannot exceed the number of selections.');
    positive(eachStake, 'Stake per combination');
    odds.forEach(american);
    const combos = [];
    const walk = (start, chosen) => { if (chosen.length === size) { combos.push(chosen); return; } for (let i = start; i < odds.length; i++) walk(i + 1, [...chosen, odds[i]]); };
    walk(0, []);
    const gross = combos.reduce((sum, combo) => sum + eachStake * combo.reduce((d, price) => d * american(price), 1), 0);
    const totalStake = combos.length * eachStake;
    return result(`Round robin creates ${combos.length} wagers`, 'Payout assumes every selection wins. Partial outcomes, pushes, and voids can change settlement.', [
      ['Selections', `${odds.length}`], ['Parlay size', `${size} per combination`], ['Stake per combination', money(eachStake)], ['Total ticket cost', money(totalStake)], ['Gross payout if all win', money(gross)], ['Net profit if all win', money(gross - totalStake)]
    ], 'neutral');
  }
  if (kind === 'lowhold') {
    const { a1, b1, a2, b2 } = get(formData, ['a1', 'b1', 'a2', 'b2']);
    const pA1 = implied(a1), pB1 = implied(b1), pA2 = implied(a2), pB2 = implied(b2);
    const bestA = pA1 <= pA2 ? { odds: a1, prob: pA1, book: 'Book 1' } : { odds: a2, prob: pA2, book: 'Book 2' };
    const bestB = pB1 <= pB2 ? { odds: b1, prob: pB1, book: 'Book 1' } : { odds: b2, prob: pB2, book: 'Book 2' };
    const combined = bestA.prob + bestB.prob;
    return result(`Best prices are ${bestA.book} / ${bestB.book}`, 'The comparison assumes all four prices describe the same two-outcome market.', [
      ['Best outcome A price', `${bestA.odds > 0 ? '+' : ''}${bestA.odds}`], ['Best outcome B price', `${bestB.odds > 0 ? '+' : ''}${bestB.odds}`], ['Best-price combined hold', pct(combined - 1)], ['Book 1 hold', pct(pA1 + pB1 - 1)], ['Book 2 hold', pct(pA2 + pB2 - 1)]
    ], combined < 1 ? 'positive' : 'neutral');
  }
  if (kind === 'middle') {
    const { overLine, underLine, overOdds, underOdds, overStake, underStake } = get(formData, ['overLine', 'underLine', 'overOdds', 'underOdds', 'overStake', 'underStake']);
    if (underLine <= overLine) throw Error('The under line must be higher than the over line to create a middle.');
    positive(overStake, 'Over stake'); positive(underStake, 'Under stake');
    const low = Math.floor(overLine) + 1, high = Math.ceil(underLine) - 1;
    const range = low <= high ? `${low}–${high}` : 'No integer result';
    const bothWin = overStake * (american(overOdds) - 1) + underStake * (american(underOdds) - 1);
    const below = -overStake + profit(underStake, underOdds), above = profit(overStake, overOdds) - underStake;
    return result(low <= high ? `Middle window: ${range} total points` : 'No whole-number middle result', 'A result strictly between both lines wins both tickets. Outside the window one side wins and the other loses, unless a line pushes.', [
      ['Over ticket', `Over ${overLine} at ${overOdds > 0 ? '+' : ''}${overOdds}`], ['Under ticket', `Under ${underLine} at ${underOdds > 0 ? '+' : ''}${underOdds}`], ['Total stake at risk', money(overStake + underStake)], ['Net if both bets win', money(bothWin)], ['Net below the lower line', money(below)], ['Net above the upper line', money(above)]
    ], low <= high ? 'positive' : 'neutral');
  }
  if (kind === 'boosts') {
    const { stake, original, boosted } = get(formData, ['stake', 'original', 'boosted']);
    positive(stake, 'Stake');
    const p = probabilityInput(number(formData, 'probability'));
    const originalProfit = profit(stake, original), boostedProfit = profit(stake, boosted);
    const originalEv = expectedNet(stake, p, original), boostedEv = expectedNet(stake, p, boosted);
    return result('Odds boost comparison', 'Expected value uses your win probability estimate and assumes the full stake qualifies for the promotion.', [
      ['Original net profit on win', money(originalProfit)], ['Boosted net profit on win', money(boostedProfit)], ['Additional profit on win', money(boostedProfit - originalProfit)], ['Original price EV', money(originalEv)], ['Boosted price EV', money(boostedEv)], ['Estimated EV added', money(boostedEv - originalEv)]
    ], boostedEv > originalEv ? 'positive' : 'neutral');
  }
  throw Error('This calculator could not load. Refresh the page and try again.');
}

const primaryMetric = {
  arbitrage: 'Estimated net profit', ev: 'Expected net value', freebet: 'Estimated cash value',
  halfpoint: 'Estimated EV change', hold: 'Estimated overround', novig: 'Fair American odds', vig: 'Estimated overround',
  implied: 'Implied probability', odds: 'Implied probability', kelly: 'Suggested stake',
  parlay: 'Break-even probability', parlaybuilder: 'Break-even probability', spread: 'Net profit or loss',
  poisson: 'Estimated probability', roundrobin: 'Total ticket cost', lowhold: 'Best-price combined hold',
  middle: 'Net if both bets win', boosts: 'Estimated EV added',
};
function metricRow(label, value) {
  const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
  row.className = 'calc-metric-row'; term.textContent = label; detail.textContent = value;
  row.append(term, detail); return row;
}
function outcomeRow(side, raw, fair, odds) {
  const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
  const caption = document.createElement('small'), probability = document.createElement('span'), badge = document.createElement('span');
  row.className = 'calc-metric-row calc-outcome-row'; term.textContent = 'Outcome ' + side;
  caption.textContent = 'American odds ' + (Number(odds) > 0 ? '+' : '') + odds; term.append(caption);
  probability.className = 'calc-probability'; probability.textContent = raw;
  const label = document.createElement('small'); label.textContent = 'Implied'; probability.append(label);
  badge.className = 'calc-pill'; badge.textContent = fair + ' fair';
  badge.setAttribute('aria-label', 'Outcome ' + side + ' fair probability ' + fair);
  detail.append(probability, badge); row.append(term, detail); return row;
}
function show(outcome, initial = false) {
  const box = document.querySelector('.bet-result'), kind = form.dataset.tool;
  box.className = 'bet-result is-' + outcome.status;
  document.querySelector('#bet-result-status').textContent = initial ? 'Example inputs' : 'Results updated';
  document.querySelector('#bet-result-title').textContent = outcome.title;
  document.querySelector('#bet-result-note').textContent = outcome.metrics.length ? 'Manual example. ' + outcome.note : outcome.note;
  const primary = outcome.metrics.find(([label]) => label === primaryMetric[kind]) || outcome.metrics[0];
  document.querySelector('#bet-summary-label').textContent = primary?.[0] || outcome.title;
  if (primary && ['arbitrage', 'lowhold', 'middle'].includes(kind)) {
    const context = document.createElement('small');
    context.textContent = outcome.title;
    document.querySelector('#bet-summary-label').append(context);
  }
  document.querySelector('#bet-summary-value').textContent = primary?.[1] || '—';
  const list = document.querySelector('#bet-result-values'), extra = document.querySelector('#bet-result-extra');
  extra.replaceChildren(); extra.hidden = true;
  const twoWay = ['hold', 'novig', 'vig'].includes(kind) && outcome.metrics.length;
  if (twoWay) {
    const metrics = new Map(outcome.metrics), inputs = new FormData(form);
    list.replaceChildren(...['A', 'B'].map(side => outcomeRow(side, metrics.get('Outcome ' + side + ' raw probability'), metrics.get('Outcome ' + side + ' fair probability'), inputs.get('odds' + side))));
    const supplemental = outcome.metrics.filter(([label]) => ['Combined implied probability', 'Estimated overround', 'Fair American odds'].includes(label) && label !== primary[0]);
    extra.replaceChildren(...supplemental.map(([label, value]) => metricRow(label, value))); extra.hidden = false;
  } else {
    list.replaceChildren(...outcome.metrics.filter(metric => metric !== primary).map(([label, value]) => metricRow(label, value)));
  }
  list.hidden = !list.children.length;
  // Only signed value or profit summaries use gain/loss colors; probability is neutral.
  const valueMetric = /\b(?:value|profit|ev|return)\b/i.test(primary?.[0] || '');
  document.querySelector('#bet-summary-value').dataset.tone = valueMetric ? outcome.status : 'neutral';
}
function showError(error) {
  show(result('Check the entered values', error.message, [], 'negative'));
  document.querySelector('#bet-result-status').textContent = 'Needs attention';
}

if (form) {
  const refresh = event => {
    if (event) event.preventDefault();
    try { show(calculate(form.dataset.tool, new FormData(form))); } catch (error) { showError(error); }
  };
  form.addEventListener('submit', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('input', refresh);
  form.addEventListener('reset', () => setTimeout(refresh));
  refresh();
}

if (search) {
  const cards = [...document.querySelectorAll('.bet-link-card')];
  const count = document.querySelector('#bet-search-count');
  const empty = document.querySelector('#bet-search-empty');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) { const match = card.textContent.toLocaleLowerCase().includes(query); card.hidden = !match; if (match) visible++; }
    for (const group of document.querySelectorAll('.bet-hub-group')) group.hidden = !group.querySelector('.bet-link-card:not([hidden])');
    count.textContent = `${visible} ${visible === 1 ? 'result' : 'results'}`;
    empty.hidden = visible !== 0;
  });
}
