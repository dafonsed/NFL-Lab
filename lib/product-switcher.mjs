import { icon } from '../public/ui-icons.js';
import { productDashboardUrl, workspaceProduct } from '../public/navigation.js';

export function siteProductSwitcher(sport, section, ev = false) {
  const current = workspaceProduct(section);
  const options = [
    ['trends', 'Trends', 'Player & team trends', productDashboardUrl('trends', sport), 'trends'],
    ['models', 'Models', 'Projections & research', productDashboardUrl('models', sport), 'research'],
    ['ev', '+EV', 'Odds & opportunities', productDashboardUrl('ev', sport), 'ev'],
  ];
  return `<div class="site-product-switcher">
    <a class="${ev ? 'ev-site-brand' : 'site-brand'}" href="/" aria-label="SportsLab home"><img src="/favicon.svg" width="36" height="36" alt=""><strong>SPORTSLAB</strong></a>
    <button type="button" class="site-product-toggle" aria-label="Choose SportsLab product" aria-expanded="false" aria-controls="site-product-menu">${icon('chevron')}</button>
    <nav class="site-product-menu" id="site-product-menu" aria-label="SportsLab products" hidden>${options.map(([key, label, description, href, glyph]) => `<a href="${href}" data-product="${key}"${current === key ? ' aria-current="true"' : ''}><span class="site-product-icon">${icon(glyph)}</span><span class="site-product-copy"><strong>${label}</strong><small>${description}</small></span>${current === key ? icon('check', 'site-product-current') : ''}</a>`).join('')}</nav>
  </div>`;
}
