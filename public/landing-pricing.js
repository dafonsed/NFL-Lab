const grid = document.querySelector('#home-pricing-grid');
const cycle = document.querySelector('.home-pricing-switch');
const dialog = document.querySelector('#home-pricing-dialog');

if (grid && cycle && dialog) {
  const features = [
    'Trending Insights',
    'Thousands of Props & Games',
    'Advanced Data & Visuals',
    'Odds Comparisons & Line Movement Tracking',
    'Injury Reports',
    'Real Time Betting Alerts',
    'Real Time Odds Movement Charts',
    'EV+ Bet Indicators',
    'Positive EV Power Feed',
    'Sharp Book Odds',
    'Boost Analysis',
    'Middle Betting',
    'Arbitrage Feed',
  ];
  const plans = [
    { name: 'Premium', monthly: 19.99, included: 6, action: 'Preview Premium' },
    { name: 'Premium+', monthly: 29.99, included: 8, action: 'Preview Premium+', featured: true },
    { name: 'Pro', monthly: 79.99, included: 13, action: 'Preview Pro' },
  ];
  const planCard = (plan, index) => `<article class="home-plan${plan.featured ? ' is-featured' : ''}">
    <div class="home-plan-name"><h3>${plan.name}</h3>${plan.featured ? '<span>More research tools</span>' : ''}</div>
    <div class="home-plan-body">
    <div class="home-plan-price"><span>$</span><strong data-plan-price="${index}">${plan.monthly.toFixed(2)}</strong><small>/mo</small></div>
    <p class="home-plan-billing" data-plan-billing="${index}">&nbsp;</p>
    <h4>${index ? `Everything in ${plans[index - 1].name}, plus` : 'Your research essentials'}</h4>
    <ul class="home-plan-features">${features.slice(index ? plans[index - 1].included : 0, plan.included).map(feature => `<li class="is-included"><span aria-hidden="true">✓</span>${feature}</li>`).join('')}</ul>
    <button class="home-plan-action" type="button" data-plan-select="${index}">${plan.action}</button>
    </div>
  </article>`;

  grid.innerHTML = plans.map(planCard).join('');

  cycle.addEventListener('click', () => {
    const annual = cycle.getAttribute('aria-checked') !== 'true';
    cycle.setAttribute('aria-checked', String(annual));
    cycle.setAttribute('aria-label', annual ? 'Show monthly preview prices' : 'Show annual preview prices');
    document.querySelector('[data-cycle-label="monthly"]').classList.toggle('is-active', !annual);
    document.querySelector('[data-cycle-label="annual"]').classList.toggle('is-active', annual);
    plans.forEach((plan, index) => {
      grid.querySelector(`[data-plan-price="${index}"]`).textContent = (plan.monthly * (annual ? 0.83 : 1)).toFixed(2);
      grid.querySelector(`[data-plan-billing="${index}"]`).textContent = annual ? 'Monthly equivalent · billed annually' : '\u00a0';
    });
  });

  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-plan-select]');
    if (button) {
      dialog.querySelector('#plan-dialog-title').textContent = plans[Number(button.dataset.planSelect)].name + ' plan preview';
      dialog.showModal();
    }
  });
  dialog.querySelector('[data-plan-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
