// HTTP routes for OddsJam betting tools — uses Playwright bridge for CF bypass
import { ACTIVE_DFS_BOOKS, DFS_MARKET_MAP } from './client.mjs';
import { ojBridgeFetch, bridgeStatus } from './bridge.mjs';
import {
  computePositiveEV, computeArbitrage, computeDFSEdges,
  computeSharpMoney, formatOddsScreen
} from './tools.mjs';

const SPORT_MAP = {
  nfl: { sport: 'football', league: 'nfl' },
  nba: { sport: 'basketball', league: 'nba' },
  mlb: { sport: 'baseball', league: 'mlb' },
  nhl: { sport: 'hockey', league: 'nhl' },
  cfb: { sport: 'football', league: 'cfb' },
  cbb: { sport: 'basketball', league: 'cbb' }
};

// Cache
const cache = new Map();
const CACHE_TTL = 3 * 1000;
const SHARP_TTL = 2 * 1000;

function getCached(key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttl) return entry.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function fetchOdds(sportKey, marketName, state = '') {
  const mapping = SPORT_MAP[sportKey];
  if (!mapping) return [];
  const path = `oddscreen/v2/game/data?sport=${mapping.sport}&league=${mapping.league}&state=${encodeURIComponent(state)}&market_name=${encodeURIComponent(marketName)}&is_future=0&game_status_filter=All&previous_odds=false&opening_odds=false&override_include_pinny=true`;
  const data = await ojBridgeFetch(path);
  return data?.data || [];
}

async function fetchOddsForSports(sportKeys, marketName, state = '') {
  const allData = [];
  for (const key of sportKeys) {
    try {
      const data = await fetchOdds(key, marketName, state);
      allData.push(...data);
    } catch (err) {
      console.error(`[oddsjam] ${key}/${marketName}: ${err.message}`);
    }
  }
  return allData;
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

export async function handleBettingToolsApi(req, res, url) {
  const path = url.pathname;
  const query = url.searchParams;

  try {
    // ─── Bridge Status ───
    if (path === '/api/oddsjam/status') {
      return json(res, await bridgeStatus());
    }

    // ─── Reference Data ───
    if (path === '/api/oddsjam/sportsbooks') {
      const state = query.get('state') || '';
      const data = await ojBridgeFetch(`sportsbooks?state=${encodeURIComponent(state)}&override_include_pinny=true`);
      return json(res, data);
    }

    if (path === '/api/oddsjam/leagues') {
      return json(res, await ojBridgeFetch('leagues'));
    }

    if (path === '/api/oddsjam/markets') {
      return json(res, await ojBridgeFetch('markets'));
    }

    if (path === '/api/oddsjam/schedule') {
      const now = new Date();
      const after = new Date(now.getTime() - 24 * 3600 * 1000);
      const before = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      return json(res, await ojBridgeFetch(`game?start_date_after=${after.toISOString()}&start_date_before=${before.toISOString()}`));
    }

    if (path === '/api/oddsjam/markets-for-sport') {
      const sportKey = query.get('sport') || 'nfl';
      const mapping = SPORT_MAP[sportKey];
      if (!mapping) return json(res, { error: 'Unknown sport' }, 400);
      return json(res, await ojBridgeFetch(`oddscreen/v2/game/markets?sport=${mapping.sport}&league=${mapping.league}`));
    }

    // ─── Odds Screen ───
    if (path === '/api/oddsjam/odds') {
      const sports = (query.get('sports') || 'nfl,nba,mlb,nhl').split(',');
      const market = query.get('market') || 'moneyline';
      const state = query.get('state') || '';
      const cacheKey = `odds:${sports.join(',')}:${market}:${state}`;

      let data = getCached(cacheKey);
      if (!data) {
        data = await fetchOddsForSports(sports, market, state);
        setCached(cacheKey, data);
      }

      const formatted = formatOddsScreen(data, {
        books: query.get('books') ? query.get('books').split(',') : null
      });

      return json(res, { total: formatted.length, market, sports, data: formatted });
    }

    // ─── Positive EV ───
    if (path === '/api/oddsjam/ev') {
      const sports = (query.get('sports') || 'nfl,nba,mlb,nhl').split(',');
      const market = query.get('market') || 'moneyline';
      const minEV = parseFloat(query.get('min_ev') || '1.0');
      const devigMethod = query.get('devig') || 'power';
      const state = query.get('state') || '';

      const cacheKey = `odds:${sports.join(',')}:${market}:${state}`;
      let oddsData = getCached(cacheKey);
      if (!oddsData) {
        oddsData = await fetchOddsForSports(sports, market, state);
        setCached(cacheKey, oddsData);
      }

      const evBets = computePositiveEV(oddsData, { minEV, devigMethod, sports, markets: [market] });
      return json(res, { total: evBets.length, market, devigMethod, data: evBets });
    }

    // ─── Arbitrage ───
    if (path === '/api/oddsjam/arbitrage') {
      const sports = (query.get('sports') || 'nfl,nba,mlb,nhl').split(',');
      const market = query.get('market') || 'moneyline';
      const minProfit = parseFloat(query.get('min_profit') || '0.1');
      const state = query.get('state') || '';

      const cacheKey = `odds:${sports.join(',')}:${market}:${state}`;
      let oddsData = getCached(cacheKey);
      if (!oddsData) {
        oddsData = await fetchOddsForSports(sports, market, state);
        setCached(cacheKey, oddsData);
      }

      const arbs = computeArbitrage(oddsData, { minProfit });
      return json(res, { total: arbs.length, market, data: arbs });
    }

    // ─── DFS Edge ───
    if (path === '/api/oddsjam/dfs') {
      const sports = (query.get('sports') || 'nfl,nba,mlb').split(',');
      const minEdge = parseFloat(query.get('min_edge') || '0.5');
      const state = query.get('state') || '';

      const results = [];
      for (const sportKey of sports) {
        const dfsMarkets = DFS_MARKET_MAP[sportKey] || {};
        const dfsMarketName = dfsMarkets.prizepicks || dfsMarkets.generic || 'player_fantasy_score';

        const cacheKey = `odds:${sportKey}:${dfsMarketName}:${state}`;
        let dfsData = getCached(cacheKey);
        if (!dfsData) {
          dfsData = await fetchOddsForSports([sportKey], dfsMarketName, state);
          setCached(cacheKey, dfsData);
        }

        const mlCacheKey = `odds:${sportKey}:moneyline:${state}`;
        let mlData = getCached(mlCacheKey);
        if (!mlData) {
          mlData = await fetchOddsForSports([sportKey], 'moneyline', state);
          setCached(mlCacheKey, mlData);
        }

        const edges = computeDFSEdges(mlData, dfsData, { minEdge });
        results.push(...edges);
      }

      return json(res, { total: results.length, data: results.sort((a, b) => b.edgePct - a.edgePct) });
    }

    // ─── Sharp Money ───
    if (path === '/api/oddsjam/sharp-money') {
      const sports = (query.get('sports') || 'nfl,nba,mlb,nhl').split(',');
      const market = query.get('market') || 'moneyline';
      const state = query.get('state') || '';
      const minMove = parseFloat(query.get('min_move') || '0.5');

      const currentKey = `sharp-current:${sports.join(',')}:${market}:${state}`;
      const previousKey = `sharp-previous:${sports.join(',')}:${market}:${state}`;

      let currentOdds = getCached(currentKey, SHARP_TTL);
      if (!currentOdds) {
        currentOdds = await fetchOddsForSports(sports, market, state);
      }

      let previousOdds = cache.get(previousKey)?.data || null;
      setCached(previousKey, currentOdds);
      setCached(currentKey, currentOdds);

      if (!previousOdds) {
        return json(res, { total: 0, message: 'Collecting baseline — poll again in 2 seconds', data: [] });
      }

      const sharpMoves = computeSharpMoney(currentOdds, previousOdds, { minMove });
      return json(res, { total: sharpMoves.length, data: sharpMoves });
    }

    // ─── DFS Books ───
    if (path === '/api/oddsjam/dfs-books') {
      return json(res, { books: ACTIVE_DFS_BOOKS });
    }

    // ─── Market Map ───
    if (path === '/api/oddsjam/market-map') {
      return json(res, DFS_MARKET_MAP);
    }

    return json(res, { error: 'Not found', path }, 404);

  } catch (error) {
    console.error(`[oddsjam] ${path}: ${error.message}`);
    return json(res, { error: error.message }, 502);
  }
}
