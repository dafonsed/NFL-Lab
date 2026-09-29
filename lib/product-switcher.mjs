import { icon } from '../public/ui-icons.js';
import { productDashboardUrl, workspaceProduct } from '../public/navigation.js';
const PRODUCT_FEATURES = { trends: 'trends', models: 'models', ev: 'ev-feed' };

// Workspace group selector: the card shows the group the sidebar is listing; picking
// another group opens that product, and the sidebar then lists only its pages.
export function siteProductSwitcher(sport, section, ev = false, features = null, group = null) {
  // The Dashboard is its own destination, not one of the three product workspaces.
  const current = section === 'home' ? null : workspaceProduct(section);
  const options = [
    ['trends', 'Trends', 'Player & team trends', productDashboardUrl('trends', sport), 'trends'],
    ['models', 'Models', 'Projections & research', productDashboardUrl('models', sport), 'research'],
    ['ev', '+EV', 'Odds & opportunities', productDashboardUrl('ev', sport), 'ev'],
  ].filter(([key]) => !Array.isArray(features) || features.includes(PRODUCT_FEATURES[key]));
  const selected = options.find(([key]) => key === group);
  const card = selected ? `<span class="site-product-icon">${icon(selected[4])}</span><span class="site-product-copy"><small>Workspace</small><strong>${selected[1]}</strong></span>` : '<span class="site-product-copy"><strong>Workspaces</strong></span>';
  return `<div class="site-product-switcher${options.length > 1 ? '' : ' is-single'}">
    <a class="${ev ? 'ev-site-brand' : 'site-brand'}" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="36" height="36" alt=""><strong>Visual<span>Odds</span></strong></a>
    ${options.length ? `<button type="button" class="site-product-toggle site-group-toggle" data-group="${group || ''}" aria-label="Choose VisualOdds product" aria-expanded="false" aria-controls="site-product-menu"${options.length > 1 ? '' : ' disabled'}>${card}${options.length > 1 ? icon('chevron') : ''}</button>
    <nav class="site-product-menu" id="site-product-menu" aria-label="VisualOdds products" hidden>${options.map(([key, label, description, href, glyph]) => `<a href="${href}" data-product="${key}"${current === key ? ' aria-current="true"' : ''}${group === key ? ' data-selected' : ''}><span class="site-product-icon">${icon(glyph)}</span><span class="site-product-copy"><strong>${label}</strong><small>${description}</small></span>${group === key ? icon('check', 'site-product-current') : ''}</a>`).join('')}</nav>` : ''}
  </div>`;
}
