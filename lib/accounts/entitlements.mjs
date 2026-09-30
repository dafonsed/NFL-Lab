// Display names/monthly amounts are owner-approved; plan IDs remain unchanged
// for existing subscriptions. Checkout amounts still come from Stripe Price IDs.
const free = ['account', 'bet-tracker', 'saved-filters'];
const premium = [...free, 'research', 'trends', 'models', 'simulation'];
// The legacy premium_plus plan (now displayed as Pro) has no distinct feature
// surface in this repository. Preserve its identifier for existing records,
// but do not sell it or claim unavailable features.
const plus = [...premium];
const pro = [...premium, 'odds-screen', 'line-movement', 'ev-indicators', 'ev-feed', 'arbitrage', 'smart-money', 'fantasy', 'boosts', 'middles'];

export const PLAN_CATALOG = Object.freeze({
  free: Object.freeze({ id: 'free', name: 'Free', rank: 0, previewMonthly: null, checkoutEnabled: false, features: Object.freeze(free) }),
  premium: Object.freeze({ id: 'premium', name: 'Basic', rank: 1, previewMonthly: 14.99, checkoutEnabled: true, features: Object.freeze(premium) }),
  premium_plus: Object.freeze({ id: 'premium_plus', name: 'Pro', rank: 2, previewMonthly: 24.99, checkoutEnabled: false, unavailableReason: 'Plan scope is under review. Pro is not available for purchase.', features: Object.freeze(plus) }),
  pro: Object.freeze({ id: 'pro', name: 'Premium', rank: 3, previewMonthly: 49.99, checkoutEnabled: true, features: Object.freeze(pro) }),
});

function future(value, now) {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function entitlementsFor({ subscription = null, subscriptions = null, grants = [], now = Date.now() } = {}) {
  const at = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  let access = { plan: 'free', features: [...free], source: 'free', expiresAt: null };
  const candidates = [];
  for (const sub of subscriptions || (subscription ? [subscription] : [])) {
    if (!Object.hasOwn(PLAN_CATALOG, sub.plan) || !['active', 'trialing'].includes(sub.status) || Boolean(sub.refunded) || sub.paymentConfirmed === 0) continue;
    const end = sub.status === 'trialing' && sub.trialEnd ? sub.trialEnd : sub.currentPeriodEnd;
    if (!future(end, at)) continue;
    candidates.push({ plan: sub.plan, source: sub.status === 'trialing' ? 'trial' : 'subscription', expiresAt: end });
  }
  for (const grant of grants) {
    // Staff access is deliberately finite. A missing/invalid expiry never means forever.
    if (!Object.hasOwn(PLAN_CATALOG, grant.plan) || grant.revokedAt || !future(grant.expiresAt, at)) continue;
    if (grant.startsAt && future(grant.startsAt, at)) continue;
    candidates.push({ plan: grant.plan, source: 'manual-grant', expiresAt: grant.expiresAt });
  }
  for (const candidate of candidates) {
    const rank = PLAN_CATALOG[candidate.plan].rank;
    if (rank > PLAN_CATALOG[access.plan].rank || (rank === PLAN_CATALOG[access.plan].rank && Date.parse(candidate.expiresAt) > Date.parse(access.expiresAt || '1970-01-01'))) {
      access = { ...candidate, features: [...PLAN_CATALOG[candidate.plan].features] };
    }
  }
  return access;
}

export const DENY_FEATURE = '__deny__';

/** null is public. Unknown API routes fail closed until explicitly reviewed.
 * Auth/account/admin/cron routes must be handled by their own authorization first.
 * URL fragments cannot be trusted: every /ev tool shares the complete quotes payload.
 */
export function requiredFeature(pathname, url = new URL(pathname, 'http://localhost')) {
  const route = pathname.replace(/\/+$/, '') || '/';
  if (route.startsWith('/api/')) {
    if (['/api/health', '/api/landing/research'].includes(route)) return null;
    if (route.startsWith('/api/ev/')) return 'ev-feed';
    if (route === '/api/bets/catalog' || route === '/api/bets/game') return 'bet-tracker';
    if (route.startsWith('/api/simulation/')) return 'simulation';
    if (/^\/api\/(?:nfl|nba|wnba|mlb)\/live$/.test(route)) return 'research';
    if (['/api/paper', '/api/performance', '/api/sports/performance', '/api/sports/catalog', '/api/sports/board', '/api/mlb/board', '/api/mlb/model', '/api/mlb/evidence', '/api/evidence', '/api/catalog', '/api/nfl/research', '/api/board'].includes(route)) return 'research';
    return DENY_FEATURE;
  }
  if (route === '/ev' || route === '/ev.html' || route === '/ev/dashboard') return 'ev-feed';
  if (['/bets', '/bets.html', '/ev/tracker'].includes(route)) return 'bet-tracker';
  if (/^\/(?:simulation|(?:nfl|nba|wnba|mlb|nhl|soccer)\/simulation)$/.test(route) || route === '/simulation.html') return 'simulation';
  if (['/trends', '/models', '/research', '/paper', '/paper.html', '/performance', '/performance.html', '/live', '/live.html', '/live-sports.html', '/index.html', '/sports.html', '/mlb.html', '/home.html', '/trends.html'].includes(route) || /^\/(?:nfl|nba|wnba|mlb|nhl|soccer)(?:\/live)?$/.test(route)) return 'research';
  // All other served routes are the existing static asset allowlist, marketing,
  // education, calculators, or separately authenticated account/admin pages.
  return null;
}
