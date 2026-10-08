// OddsJam API client — no auth required for these endpoints
const OJ_BASE = 'https://oddsjam.com/api/backend';

// Optional proxy support (use if geo-blocked)
const PROXY_URL = process.env.OJ_PROXY_URL || null;
const PROXY_USER = process.env.OJ_PROXY_USER || null;
const PROXY_PASS = process.env.OJ_PROXY_PASS || null;

function proxyAgent() {
  if (!PROXY_URL) return null;
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(`http://${PROXY_USER}:${PROXY_PASS}@${PROXY_URL}`);
}

async function ojFetch(path, options = {}) {
  const url = `${OJ_BASE}${path}`;
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Referer': 'https://oddsjam.com/',
    'Origin': 'https://oddsjam.com',
    ...options.headers
  };

  const fetchOpts = { headers, ...options };
  const agent = proxyAgent();
  if (agent) fetchOpts.dispatcher = agent;

  const resp = await fetch(url, fetchOpts);
  if (!resp.ok) {
    const text = await resp.text();
    if (text.includes('Just a moment') || text.includes('cloudflare')) {
      throw new Error(`OddsJam CF challenge on ${path} — retry or use proxy`);
    }
    throw new Error(`OddsJam API ${resp.status} on ${path}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

// ─── Reference Data ───
export async function getSportsbooks(state = '') {
  return ojFetch(`/sportsbooks?state=${encodeURIComponent(state)}&override_include_pinny=true`);
}

export async function getLeagues() {
  return ojFetch('/leagues');
}

export async function getMarkets() {
  return ojFetch('/markets');
}

export async function getGameSchedule(daysAhead = 7) {
  const now = new Date();
  const after = new Date(now.getTime() - 24 * 3600 * 1000);
  const before = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);
  return ojFetch(`/game?start_date_after=${after.toISOString()}&start_date_before=${before.toISOString()}`);
}

export async function getDeepLinkBooks() {
  return ojFetch('/deep-link-books?platform=desktop');
}

// ─── Odds Data ───
export async function getOddsScreenData(sport, league, marketName = 'moneyline', options = {}) {
  const params = new URLSearchParams({
    sport,
    league,
    state: options.state || '',
    market_name: marketName,
    is_future: options.isFuture ? '1' : '0',
    game_status_filter: options.gameStatusFilter || 'All',
    previous_odds: options.previousOdds ? 'true' : 'false',
    opening_odds: options.openingOdds ? 'true' : 'false'
  });
  return ojFetch(`/oddscreen/v2/game/data?${params}`);
}

export async function getOddsScreenMarkets(sport, league) {
  return ojFetch(`/oddscreen/v2/game/markets?sport=${sport}&league=${league}`);
}

export async function getStateInfo(stateCode) {
  return ojFetch(`/state/${stateCode}`);
}

export async function getStateSportsbooks(stateCode) {
  return ojFetch(`/sportsbooks?state=${stateCode}`);
}

// ─── DFS-specific market names per sport ───
export const DFS_MARKET_MAP = {
  nfl: {
    prizepicks: 'Player Fantasy Score (PrizePicks)',
    underdog: 'Player Fantasy Score (Underdog)',
    betr: 'Player Fantasy Score (Betr)',
    generic: 'Player Fantasy Score'
  },
  nba: {
    prizepicks: 'Player Points',
    underdog: 'Player Points',
    generic: 'Player Points'
  },
  mlb: {
    prizepicks: 'Player Batting Fantasy Score (PrizePicks)',
    underdog: 'Player Batting Fantasy Score (Underdog)',
    pitching: 'Player Pitching Fantasy Score (Underdog)',
    generic: 'Player Fantasy Score'
  }
};

// ─── Sharp books ───
export const SHARP_BOOKS = ['Pinnacle', 'Pinny', 'bet105', 'bet105.us'];
// bet105 is Pinnacle's US mirror — identical lines, limits, and market making
// When bet105 appears in data, it IS Pinnacle's sharp line
export const SHARP_DISPLAY_NAME = { 'bet105': 'Pinnacle', 'bet105.us': 'Pinnacle', 'Pinnacle': 'Pinnacle', 'Pinny': 'Pinnacle' };
export const EXCLUDED_FROM_SHARP = new Set(SHARP_BOOKS);

// ─── Active DFS books ───
export const ACTIVE_DFS_BOOKS = [
  'PrizePicks (5 or 6 Pick Flex)',
  'DraftKings (Pick 3)',
  'Underdog Fantasy (2 Pick)',
  'Sleeper',
  'Fliff',
  'Fliff Superstars',
  'Betr Picks',
  'Dabble (3 or 5 Pick)',
  'ParlayPlay',
  'Rebet',
  'Rebet Props City',
  'Splash Sports',
  'Chalkboard',
  'Courtside',
  'Dogg House',
  'Novig',
  'Prophet X',
  'Sportzino'
];
