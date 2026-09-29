const grid = document.querySelector('#home-pricing-grid');
const cycle = document.querySelector('.home-pricing-switch');
const dialog = document.querySelector('#home-pricing-dialog');

if (grid && cycle && dialog) {
  const labels = {
    research: 'Player and matchup research', trends: 'Player trends and history',
    models: 'Prediction models', simulation: 'Game simulations',
    'odds-screen': 'Shared odds workspace', 'line-movement': 'Entered price movement charts',
    'ev-indicators': 'EV indicators for available prices', 'ev-feed': 'Shared quote-feed workspace',
    arbitrage: 'Arbitrage comparisons', 'smart-money': 'Smart Money workspace',
    fantasy: 'Fantasy tools with entered or example data', boosts: 'Boost analysis', middles: 'Middle calculations',
  };
  const researchFeatures = ['research', 'trends', 'models', 'simulation'];
  let plans = [
    { id: 'premium', name: 'Basic', previewMonthly: 14.99, checkoutEnabled: true, features: researchFeatures, prices: [] },
    { id: 'premium_plus', name: 'Pro', previewMonthly: 24.99, checkoutEnabled: false, unavailableReason: 'Pro plan details are being finalized. Checkout is not available yet.', features: researchFeatures, prices: [] },
    { id: 'pro', name: 'Premium', previewMonthly: 49.99, checkoutEnabled: true, features: [...researchFeatures, 'odds-screen', 'line-movement', 'ev-indicators', 'ev-feed', 'arbitrage', 'smart-money', 'fantasy', 'boosts', 'middles'], prices: [] },
    { id: 'premium_max', name: 'Premium Max', previewMonthly: 99.99, checkoutEnabled: false, unavailableReason: 'Premium Max is previewed at $99.99 per month. Its additional features and checkout are not available yet.', features: [...researchFeatures, 'odds-screen', 'line-movement', 'ev-indicators', 'ev-feed', 'arbitrage', 'smart-money', 'fantasy', 'boosts', 'middles'], prices: [] },
  ];
  let configured = false;
  let premiumVariant = 'pro';
  let dialogTrigger;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const annual = () => cycle.getAttribute('aria-checked') === 'true';
  const selectedPrice = plan => configured && plan.checkoutEnabled && plan.prices?.find(price => price.available && price.interval === (annual() ? 'annual' : 'monthly'));
  const currencyDigits = currency => new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const money = (minor, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** currencyDigits(currency));

  function render() {
    const isAnnual = annual();
    const focusedVariant = grid.contains(document.activeElement) ? document.activeElement.dataset.premiumVariant : null;
    const visiblePlans = [plans[0], plans[1], plans.find(plan => plan.id === premiumVariant)];
    grid.innerHTML = visiblePlans.map((plan, index) => {
      const price = selectedPrice(plan);
      const value = price ? price.amount / 10 ** currencyDigits(price.currency) / (isAnnual ? 12 : 1) : plan.previewMonthly;
      const symbol = price ? new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(part => part.type === 'currency')?.value || price.currency.toUpperCase() : '$';
      const isPremium = index === 2;
      const isMax = plan.id === 'premium_max';
      const features = (plan.features || []).filter(key => labels[key]).map(key => labels[key]);
      const billing = price ? isAnnual ? `${money(price.amount, price.currency)} billed annually` : 'Billed monthly' : isAnnual ? 'Monthly preview shown · annual pricing unavailable' : 'Monthly plan preview · checkout unavailable';
      const heading = isMax ? 'Premium tools shown below · Max benefits coming soon' : isPremium ? 'Research and the complete EV workspace' : plan.id === 'premium_plus' ? 'Player research and modeling' : 'Your research essentials';
      const variants = isPremium ? `<div class="home-plan-variants" role="radiogroup" aria-label="Premium plan options">
        <label><input type="radio" name="premium-variant" value="pro" data-premium-variant="pro" aria-label="Premium"${!isMax ? ' checked' : ''}><span>Standard</span></label>
        <label><input type="radio" name="premium-variant" value="premium_max" data-premium-variant="premium_max" aria-label="Premium Max"${isMax ? ' checked' : ''}><span>Max</span></label>
      </div>` : '';
      return `<article class="home-plan${isPremium ? ' is-featured' : ''}" data-plan-id="${plan.id}" aria-labelledby="home-plan-title-${index}">
        <div class="home-plan-name"><h3 id="home-plan-title-${index}">${escape(plan.name)}</h3>${variants}</div>
        <div class="home-plan-body">
          <div class="home-plan-price"><span>${escape(symbol)}</span><strong data-plan-price="${plan.id}">${value.toFixed(2)}</strong><small>/mo</small></div>
          <p class="home-plan-billing" data-plan-billing="${plan.id}">${escape(billing)}</p>
          <h4>${escape(heading)}</h4>
          <ul class="home-plan-features">${features.map(feature => `<li class="is-included"><span aria-hidden="true">✓</span>${escape(feature)}</li>`).join('')}</ul>
          <button class="home-plan-action" type="button" data-plan-select="${plan.id}">${price ? `Choose ${escape(plan.name)}` : `Preview ${escape(plan.name)}`}</button>
        </div>
      </article>`;
    }).join('');
    if (focusedVariant) grid.querySelector(`[data-premium-variant="${focusedVariant}"]`)?.focus({ preventScroll: true });
    document.querySelector('[data-cycle-label="monthly"]')?.classList.toggle('is-active', !isAnnual);
    document.querySelector('[data-cycle-label="annual"]')?.classList.toggle('is-active', isAnnual);
    cycle.setAttribute('aria-label', isAnnual ? 'Show monthly pricing' : 'Show annual pricing');
    const anyAvailable = visiblePlans.some(plan => selectedPrice(plan));
    const disclaimer = document.querySelector('.home-pricing-disclaimer');
    if (disclaimer) disclaimer.textContent = anyAvailable
      ? 'Available checkout prices are confirmed before purchase. Pro and Premium Max are previews. Automated alert delivery is not connected.'
      : 'Prices shown are plan previews. Checkout is unavailable. Pro and Premium Max details are being finalized; automated alert delivery is not connected.';
    const saving = document.querySelector('.home-pricing-cycle em');
    if (saving) saving.textContent = anyAvailable ? 'Plan pricing' : 'Preview only';
  }

  const heading = document.querySelector('.home-pricing-heading p');
  if (heading) heading.textContent = 'Find your starting point, then choose the Premium option that fits you.';
  const kicker = document.querySelector('.home-pricing-kicker');
  if (kicker) kicker.textContent = 'VisualOdds plans';
  render();

  cycle.addEventListener('click', () => { cycle.setAttribute('aria-checked', String(!annual())); render(); });
  grid.addEventListener('change', event => {
    const choice = event.target.closest('[data-premium-variant]');
    if (!choice || !['pro', 'premium_max'].includes(choice.value)) return;
    premiumVariant = choice.value;
    render();
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-plan-select]');
    if (!button) return;
    const plan = plans.find(candidate => candidate.id === button.dataset.planSelect);
    if (!plan) return;
    if (selectedPrice(plan)) { location.assign('/account#subscription'); return; }
    dialogTrigger = plan.id;
    dialog.querySelector('#plan-dialog-title').textContent = `${plan.name} preview`;
    dialog.querySelector('p').textContent = plan.unavailableReason || (annual()
      ? 'Annual pricing is not available yet. The card shows this plan’s monthly preview. You can manage available plans from your account.'
      : 'This is a plan preview. Checkout is not available yet. Create a free account to save your own research, or explore the example EV workspace.');
    const action = dialog.querySelector('.home-button');
    action.href = '/account#subscription'; action.textContent = 'View account & plans';
    dialog.showModal();
  });
  dialog.querySelector('[data-plan-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => grid.querySelector(`[data-plan-select="${dialogTrigger}"]`)?.focus({ preventScroll: true }));

  // Renamed display labels retain existing billing IDs. Premium Max is only a
  // preview; provider prices remain the source of actual purchasable amounts.
  void fetch('/api/account/billing/plans', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (!Array.isArray(result.plans)) return;
      configured = result.configured === true;
      plans = plans.map(preview => {
        if (preview.id === 'premium_max') return preview;
        const plan = result.plans.find(candidate => candidate.id === preview.id);
        return plan ? { ...preview, ...plan, name: preview.name, previewMonthly: preview.previewMonthly } : preview;
      });
      render();
    }).catch(() => {});
}
