const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value) : '—';
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—';
const readNumber = (input, min = -Infinity, max = Infinity) => {
  const value = Number(input.value);
  const valid = Number.isFinite(value) && value >= min && value <= max;
  input.setAttribute('aria-invalid', String(!valid));
  return valid ? value : NaN;
};
const americanProfit = (odds, stake) => odds > 0 ? stake * odds / 100 : stake * 100 / Math.abs(odds);
const americanImplied = odds => odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
const validAmerican = odds => Number.isFinite(odds) && odds !== 0 && Math.abs(odds) >= 100;

document.querySelectorAll('[data-article-widget="comparison"]').forEach(widget => {
  const inputs = [...widget.querySelectorAll('[data-comparison-price]')];
  const rows = [...widget.querySelectorAll('[data-comparison-row]')];
  const result = widget.querySelector('[data-comparison-result]');
  let bestOnly = false;
  const render = () => {
    const current = inputs.map(input => readNumber(input, -10000, 10000));
    let best = -1;
    current.forEach((odds, i) => {
      inputs[i].setAttribute('aria-invalid', String(!validAmerican(odds)));
      if (validAmerican(odds) && (best < 0 || odds > current[best])) best = i;
    });
    rows.forEach((row, i) => {
      row.dataset.best = String(i === best);
      row.hidden = bestOnly && i !== best;
      const implied = row.querySelector('[data-implied-output]');
      const breakeven = row.querySelector('[data-break-even]');
      implied.textContent = validAmerican(current[i]) ? `Break-even ${percent(americanImplied(current[i]))}` : 'Enter valid odds';
      breakeven.textContent = validAmerican(current[i]) ? percent(americanImplied(current[i])) : '—';
    });
    result.textContent = best < 0 ? 'Enter American odds with an absolute value of at least 100.' : `${inputs[best].getAttribute('aria-label')} is the best sample price at ${current[best] > 0 ? '+' : ''}${current[best]}.`;
  };
  widget.querySelectorAll('[data-detail-mode]').forEach(button => button.addEventListener('click', () => {
    bestOnly = button.dataset.detailMode === 'best';
    widget.querySelectorAll('[data-detail-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  inputs.forEach(input => input.addEventListener('input', render));
  render();
});

document.querySelectorAll('[data-article-widget="ev"]').forEach(widget => {
  const oddsInput = widget.querySelector('[data-ev-odds]');
  const stakeInput = widget.querySelector('[data-ev-stake]');
  const probabilityInput = widget.querySelector('[data-ev-probability]');
  const render = () => {
    const odds = readNumber(oddsInput, -10000, 10000);
    const stake = readNumber(stakeInput, 0.01, 1000000);
    const probability = Number(probabilityInput.value) / 100;
    widget.querySelector('[data-ev-probability-label]').textContent = percent(probability);
    const valid = validAmerican(odds) && Number.isFinite(stake);
    oddsInput.setAttribute('aria-invalid', String(!validAmerican(odds)));
    const profit = valid ? americanProfit(odds, stake) : NaN;
    const ev = valid ? probability * profit - (1 - probability) * stake : NaN;
    widget.querySelector('[data-ev-breakeven]').textContent = valid ? percent(stake / (stake + profit)) : '—';
    widget.querySelector('[data-ev-value]').textContent = money(ev);
    widget.querySelector('[data-ev-profit]').textContent = money(profit);
    widget.querySelector('[data-ev-note]').textContent = valid ? (ev > 0 ? 'The entered estimate is above break-even for these assumptions.' : ev < 0 ? 'The entered estimate is below break-even for these assumptions.' : 'The entered estimate is at break-even for these assumptions.') : 'Use nonzero American odds with an absolute value of at least 100 and a positive stake.';
  };
  [oddsInput, stakeInput, probabilityInput].forEach(input => input.addEventListener('input', render));
  render();
});

document.querySelectorAll('[data-article-widget="pickem"]').forEach(widget => {
  const legsInput = widget.querySelector('[data-pickem-legs]');
  const multiplierInput = widget.querySelector('[data-pickem-multiplier]');
  const stakeInput = widget.querySelector('[data-pickem-stake]');
  const probabilityInput = widget.querySelector('[data-pickem-probability]');
  const render = () => {
    const legs = Number(legsInput.value);
    const multiplier = readNumber(multiplierInput, 1.01, 100);
    const stake = readNumber(stakeInput, 0.01, 1000000);
    const perLeg = Number(probabilityInput.value) / 100;
    const allHit = perLeg ** legs;
    const breakEven = Number.isFinite(multiplier) ? (1 / multiplier) ** (1 / legs) : NaN;
    const ev = Number.isFinite(multiplier) && Number.isFinite(stake) ? allHit * stake * multiplier - stake : NaN;
    widget.querySelector('[data-pickem-probability-label]').textContent = percent(perLeg);
    widget.querySelector('[data-pickem-all-hit]').textContent = percent(allHit);
    widget.querySelector('[data-pickem-breakeven]').textContent = percent(breakEven);
    widget.querySelector('[data-pickem-ev]').textContent = money(ev);
  };
  [legsInput, multiplierInput, stakeInput, probabilityInput].forEach(input => {
    input.addEventListener('input', render);
    input.addEventListener('change', render);
  });
  render();
});

document.querySelectorAll('[data-article-widget="promotion"]').forEach(widget => {
  const faceInput = widget.querySelector('[data-promo-face]');
  const conversionInput = widget.querySelector('[data-promo-conversion]');
  const riskInput = widget.querySelector('[data-promo-risk]');
  const budgetInput = widget.querySelector('[data-promo-budget]');
  const render = () => {
    const face = readNumber(faceInput, 0, 1000000);
    const conversion = readNumber(conversionInput, 0, 100);
    const atRisk = readNumber(riskInput, 0, 1000000);
    const budget = readNumber(budgetInput, 0, 1000000);
    const value = face * conversion / 100;
    const remaining = budget - atRisk;
    widget.querySelector('[data-promo-value]').textContent = money(value);
    widget.querySelector('[data-promo-budget-use]').textContent = Number.isFinite(atRisk) && Number.isFinite(budget) ? `${money(atRisk)} / ${money(budget)}` : '—';
    widget.querySelector('[data-promo-remaining]').textContent = money(remaining);
    widget.querySelector('[data-promo-note]').textContent = !Number.isFinite(face + conversion + atRisk + budget) ? 'Enter nonnegative amounts and a conversion estimate from 0 to 100%.' : remaining < 0 ? 'The qualifying amount is above the budget you entered. Do not use essential funds to cover the difference.' : 'Compare the estimated reward with the qualifying requirement and the offer’s written terms.';
  };
  [faceInput, conversionInput, riskInput, budgetInput].forEach(input => input.addEventListener('input', render));
  render();
});

function approximateFraction(value) {
  let bestN = 1, bestD = 1, error = Infinity;
  for (let denominator = 1; denominator <= 1000; denominator += 1) {
    const numerator = Math.max(1, Math.round(value * denominator));
    const difference = Math.abs(value - numerator / denominator);
    if (difference < error) { bestN = numerator; bestD = denominator; error = difference; }
  }
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const divisor = gcd(bestN, bestD);
  return `${bestN / divisor}/${bestD / divisor}`;
}

document.querySelectorAll('[data-article-widget="contract-converter"]').forEach(widget => {
  const fields = Object.fromEntries([...widget.querySelectorAll('[data-convert]')].map(input => [input.dataset.convert, input]));
  const note = widget.querySelector('[data-converter-note]');
  let editing = false;
  const update = source => {
    if (editing) return;
    editing = true;
    let probability;
    if (source === 'cents') {
      const cents = readNumber(fields.cents, 1, 99);
      probability = cents / 100;
    } else if (source === 'decimal') {
      const decimal = readNumber(fields.decimal, 1.01, 100);
      probability = 1 / decimal;
    } else if (source === 'american') {
      const american = readNumber(fields.american, -10000, 10000);
      probability = validAmerican(american) ? americanImplied(american) : NaN;
    } else {
      const match = fields.fractional.value.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      probability = match && Number(match[1]) > 0 && Number(match[2]) > 0 ? Number(match[2]) / (Number(match[1]) + Number(match[2])) : NaN;
      fields.fractional.setAttribute('aria-invalid', String(!Number.isFinite(probability) || probability <= 0 || probability >= 1));
    }
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      note.textContent = 'Enter a valid price: 1–99 cents, decimal odds above 1, valid American odds, or a positive fraction.';
      editing = false;
      return;
    }
    fields.cents.value = String(Math.max(1, Math.min(99, Math.round(probability * 100))));
    fields.decimal.value = (1 / probability).toFixed(2);
    const american = probability < 0.5 ? Math.round(100 * (1 - probability) / probability) : -Math.round(100 * probability / (1 - probability));
    fields.american.value = String(american === -100 ? 100 : american);
    fields.fractional.value = approximateFraction((1 - probability) / probability);
    for (const [name, field] of Object.entries(fields)) if (name !== source) field.setAttribute('aria-invalid', 'false');
    note.textContent = 'Converted prices are rounded equivalents, not independent forecasts or guaranteed event probabilities.';
    editing = false;
  };
  for (const [name, input] of Object.entries(fields)) input.addEventListener('input', () => update(name));
  update('cents');
});
