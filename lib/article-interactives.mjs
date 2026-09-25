const prices = [
  { name: 'Sample book A', value: '-110' },
  { name: 'Sample book B', value: '-105' },
  { name: 'Sample book C', value: '-115' },
];

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function comparisonWidget() {
  return `<section class="article-widget" data-article-widget="comparison" aria-labelledby="comparison-widget-title">
    <div class="article-widget-heading"><span class="article-widget-kicker">INTERACTIVE EXAMPLE · HYPOTHETICAL PRICES</span><h2 id="comparison-widget-title">Compare the same betting line</h2><p>Adjust the sample American odds to see how price changes break-even probability. These are made-up quotes, not live sportsbook odds.</p></div>
    <div class="comparison-controls"><div class="comparison-toolbar"><strong>Sample two-way market</strong><div class="widget-toggle" role="group" aria-label="Comparison rows"><button type="button" data-detail-mode="best" aria-pressed="false">Best price</button><button type="button" data-detail-mode="all" aria-pressed="true">All sample prices</button></div></div>
    <div class="comparison-table" role="table" aria-label="Hypothetical sportsbook odds comparison"><div class="comparison-row comparison-header" role="row"><span role="columnheader">Source</span><span role="columnheader">American odds</span><span role="columnheader">Break-even</span></div>${prices.map((item, index) => `<div class="comparison-row" role="row" data-comparison-row><label for="comparison-price-${index}" role="cell">${item.name}</label><span class="comparison-price-wrap" role="cell"><input id="comparison-price-${index}" type="number" min="-10000" max="10000" step="1" value="${item.value}" data-comparison-price aria-label="${item.name} hypothetical American odds"><span class="comparison-probability" data-implied-output hidden></span></span><span class="comparison-break-even" data-break-even role="cell">—</span></div>`).join('')}</div>
    <p class="widget-result" aria-live="polite" data-comparison-result></p><small>For this example, each quote uses the same event, side, line, and settlement rules. A better price does not establish a better forecast.</small></div>
  </section>`;
}

function expectedValueWidget() {
  return `<section class="article-widget" data-article-widget="ev" aria-labelledby="ev-widget-title">
    <div class="article-widget-heading"><span class="article-widget-kicker">INTERACTIVE EXAMPLE · YOUR INPUTS</span><h2 id="ev-widget-title">Compare odds with your probability estimate</h2><p>Enter a hypothetical American price and probability estimate to calculate break-even probability and expected value for a simple win-or-lose wager.</p></div>
    <div class="widget-input-grid"><label>American odds<input type="number" min="-10000" max="10000" step="1" value="110" data-ev-odds></label><label>Stake amount<input type="number" min="0.01" max="1000000" step="1" value="100" data-ev-stake></label></div>
    <label class="widget-range-label" for="ev-probability">Your estimated chance to win <output data-ev-probability-label>50%</output></label><input id="ev-probability" class="widget-range" type="range" min="1" max="99" value="50" data-ev-probability>
    <div class="widget-results" aria-live="polite"><div><span>Break-even at this price</span><strong data-ev-breakeven>—</strong></div><div><span>Expected value per wager</span><strong data-ev-value>—</strong></div><div><span>Profit if it wins</span><strong data-ev-profit>—</strong></div></div>
    <p class="widget-result" data-ev-note></p><small>Expected value is an average under the probability entered. The calculator does not estimate the true chance, account for pushes or fees, or predict the next result.</small>
  </section>`;
}

function pickemWidget() {
  return `<section class="article-widget" data-article-widget="pickem" aria-labelledby="pickem-widget-title">
    <div class="article-widget-heading"><span class="article-widget-kicker">INTERACTIVE EXAMPLE · GENERIC PAYOUT ASSUMPTIONS</span><h2 id="pickem-widget-title">Estimate an all-legs-hit break-even rate</h2><p>Explore how leg count and a hypothetical gross-return multiplier affect a simple pick’em entry. No operator payout table is used.</p></div>
    <div class="widget-input-grid"><label>Number of legs<select data-pickem-legs><option>2</option><option selected>3</option><option>4</option><option>5</option><option>6</option></select></label><label>Gross return multiplier<input type="number" min="1.01" max="100" step="0.1" value="5" data-pickem-multiplier><small>Includes the original entry amount</small></label><label>Example entry amount<input type="number" min="0.01" max="1000000" step="1" value="10" data-pickem-stake></label></div>
    <label class="widget-range-label" for="pickem-leg-probability">Assumed chance each leg hits <output data-pickem-probability-label>55%</output></label><input id="pickem-leg-probability" class="widget-range" type="range" min="1" max="99" value="55" data-pickem-probability>
    <div class="widget-results" aria-live="polite"><div><span>All legs hit (if independent)</span><strong data-pickem-all-hit>—</strong></div><div><span>Per-leg break-even (if independent)</span><strong data-pickem-breakeven>—</strong></div><div><span>Expected value of example entry</span><strong data-pickem-ev>—</strong></div></div>
    <small>This simplified example assumes equal per-leg probability, independent legs, and an all-or-nothing payout. Correlation, ties, voids, partial payouts, fees, and actual contest rules can change the calculation.</small>
  </section>`;
}

function promotionWidget() {
  return `<section class="article-widget" data-article-widget="promotion" aria-labelledby="promotion-widget-title">
    <div class="article-widget-heading"><span class="article-widget-kicker">INTERACTIVE EXAMPLE · PERSONAL ASSUMPTIONS</span><h2 id="promotion-widget-title">Estimate a promotion’s conditional value</h2><p>Enter the advertised reward, your own estimate of how much you could convert to cash, the qualifying amount at risk, and a discretionary budget.</p></div>
    <div class="widget-input-grid"><label>Advertised reward amount<input type="number" min="0" max="1000000" step="1" value="100" data-promo-face></label><label>Your estimated cash conversion<input type="number" min="0" max="100" step="1" value="60" data-promo-conversion><small>Enter your estimate from 0% to 100%</small></label><label>Qualifying amount at risk<input type="number" min="0" max="1000000" step="1" value="50" data-promo-risk></label><label>Your discretionary budget<input type="number" min="0" max="1000000" step="1" value="100" data-promo-budget></label></div>
    <div class="widget-results" aria-live="polite"><div><span>Estimated cash value</span><strong data-promo-value>—</strong></div><div><span>Qualifying amount / budget</span><strong data-promo-budget-use>—</strong></div><div><span>Budget remaining after qualifying amount</span><strong data-promo-remaining>—</strong></div></div>
    <p class="widget-result" data-promo-note></p><small>This worksheet does not value a live offer or determine whether it is worthwhile. Read eligibility, expiration, odds, playthrough, and withdrawal terms first. Never use essential funds to qualify for a promotion.</small>
  </section>`;
}

export function predictionMarketConverterWidget() {
  return `<section class="article-widget" data-article-widget="contract-converter" aria-labelledby="contract-converter-title">
    <div class="article-widget-heading"><span class="article-widget-kicker">INTERACTIVE CONVERTER · PRICE EQUIVALENTS</span><h2 id="contract-converter-title">Convert a prediction market contract price</h2><p>Enter any one format. The other fields update to equivalent price formats for the same hypothetical contract.</p></div>
    <div class="widget-input-grid converter-grid"><label>Contract price (cents)<input type="number" min="1" max="99" step="1" value="55" data-convert="cents"></label><label>Decimal odds<input type="number" min="1.01" max="100" step="0.01" value="1.82" data-convert="decimal"></label><label>American odds<input type="number" min="-10000" max="10000" step="1" value="-122" data-convert="american"></label><label>Fractional odds<input type="text" value="9/11" inputmode="text" data-convert="fractional"></label></div>
    <p class="widget-result" aria-live="polite" data-converter-note>These are price conversions only.</p><small>Contract prices are not guaranteed probabilities. This conversion excludes fees, bid–ask spread, liquidity, collateral, and resolution risk. Check the market’s current rules.</small>
  </section>`;
}

export function educationInteractiveForSlug(slug) {
  if (slug === 'line-shopping') return comparisonWidget();
  if (slug === 'positive-ev') return expectedValueWidget();
  if (slug === 'pick-em-bet') return pickemWidget();
  if (slug === 'what-are-sports-betting-promos') return promotionWidget();
  if (slug === 'prediction-market-odds-converter') return predictionMarketConverterWidget();
  return '';
}

export function brandInteractiveForSlug(slug) {
  return ['kalshi', 'polymarket'].includes(slug)
    ? `${predictionMarketConverterWidget()}<p class="widget-article-link"><a href="/betting-education/prediction-market-odds-converter">Read the full prediction market odds conversion guide →</a></p>`
    : '';
}
