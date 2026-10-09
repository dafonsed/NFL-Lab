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

async function fetchOdds(sportKey, marketName, state = '', options = {}) {
  const mapping = SPORT_MAP[sportKey];
  if (!mapping) return [];
  const previousOdds = options.previousOdds ? 'true' : 'false';
  const path = `oddscreen/v2/game/data?sport=${mapping.sport}&league=${mapping.league}&state=${encodeURIComponent(state)}&market_name=${encodeURIComponent(marketName)}&is_future=0&game_status_filter=All&previous_odds=${previousOdds}&opening_odds=false&override_include_pinny=true`;
  const data = await ojBridgeFetch(path);
  return data?.data || [];
}

async function fetchOddsForSports(sportKeys, marketName, state = '', options = {}) {
  const results = await Promise.allSettled(sportKeys.map(key => fetchOdds(key, marketName, state, options)));
  const allData = [];
  for (const result of results) {
    if (result.status === 'fulfilled') allData.push(...result.value);
    else console.error(`[oddsjam] ${marketName}: ${result.reason?.message || 'fetch failed'}`);
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
      const minEdge = parseFloat(query.get('min_edge') || '0.1');
      const state = query.get('state') || '';

      const DFS_MARKETS_BY_SPORT = {
        nfl: ['Player Passing Yards', 'Player Rushing Yards', 'Player Receiving Yards', 'Player Touchdowns', 'Player Receptions', 'Player Any Time TD'],
        nba: ['Player Points', 'Player Rebounds', 'Player Assists', 'Player Made Threes', 'Player Blocks', 'Player Steals'],
        mlb: ['Player Hits', 'Player Home Runs', 'Player RBIs', 'Player Strikeouts', 'Player Total Bases'],
        nhl: ['Player Shots on Goal', 'Player Points', 'Player Assists']
      };

      const results = [];
      const fetchTasks = [];
      for (const sportKey of sports) {
        const markets = DFS_MARKETS_BY_SPORT[sportKey] || [];
        for (const marketName of markets) {
          const cacheKey = `odds:${sportKey}:${marketName}:${state}`;
          let marketData = getCached(cacheKey);
          if (!marketData) {
            fetchTasks.push(
              fetchOddsForSports([sportKey], marketName, state)
                .then(d => { setCached(cacheKey, d); return { sportKey, marketName, marketData: d }; })
                .catch(() => ({ sportKey, marketName, marketData: [] }))
            );
          } else {
            fetchTasks.push(Promise.resolve({ sportKey, marketName, marketData }));
          }
        }
      }
      const fetched = await Promise.all(fetchTasks);
      for (const { sportKey, marketName, marketData } of fetched) {
          if (!marketData.length) continue;

          const dfsBooks = ACTIVE_DFS_BOOKS.map(b => b.toLowerCase());
          for (const game of marketData) {
            const rows = game.rows || [];
            for (let i = 0; i < rows.length - 1; i += 2) {
              const rowOver = rows[i], rowUnder = rows[i + 1];
              if (!rowOver?.odds || !rowUnder?.odds) continue;

              const displayEntry = rowOver.display?.[marketName] || rowOver.display?.[Object.keys(rowOver.display || {})[0]] || {};
                          const label = displayEntry.subtitle || displayEntry.team_name || displayEntry.player_name || displayEntry.title || '';
              if (!label) continue;

              // Collect DFS and non-DFS prices for both sides
              for (const [sideName, row] of [['OVER', rowOver], ['UNDER', rowUnder]]) {
                const dfsPrices = [], bookPrices = [];
                for (const [bookName, oddsArr] of Object.entries(row.odds || {})) {
                  if (!Array.isArray(oddsArr) || !oddsArr[0]?.price) continue;
                  const odd = oddsArr[0];
                  const isDfs = dfsBooks.some(d => bookName.toLowerCase().includes(d.split(' ')[0].toLowerCase()));
                  if (isDfs) dfsPrices.push({ book: bookName, ...odd });
                  else bookPrices.push({ book: bookName, ...odd });
                }
                if (!dfsPrices.length || !bookPrices.length) continue;

                // Best sportsbook price = fair reference
                const bestBook = bookPrices.reduce((best, cur) => Math.abs(cur.price) < Math.abs(best.price) ? best : cur, bookPrices[0]);
                const fairProb = 1 / (bestBook.price > 0 ? bestBook.price / 100 + 1 : 100 / Math.abs(bestBook.price) + 1);

                for (const dfsOdd of dfsPrices) {
                  const dfsProb = 1 / (dfsOdd.price > 0 ? dfsOdd.price / 100 + 1 : 100 / Math.abs(dfsOdd.price) + 1);
                  const edge = Math.abs(dfsProb - fairProb);
                  if (edge * 100 >= minEdge) {
                    results.push({
                      gameId: game.id, player: label, dfsBook: dfsOdd.book,
                      market: marketName, line: dfsOdd.bet_points, side: sideName,
                      recommendation: dfsProb < fairProb ? `${sideName} (DFS value)` : `${sideName} (better at book)`,
                      edgePct: edge * 100, dfsPrice: dfsOdd.price,
                      bestBookPrice: bestBook.price, bestBook: bestBook.book,
                      fairProb
                    });
                  }
                }
              }
            }
          }
      }

      return json(res, { total: results.length, data: results.sort((a, b) => b.edgePct - a.edgePct) });
    }
// ─── Sharp Money ───
    if (path === '/api/oddsjam/sharp-money') {
      const sports = (query.get('sports') || 'nfl,nba,mlb,nhl').split(',');
      const market = query.get('market') || 'moneyline';
      const state = query.get('state') || '';
      const minMove = parseFloat(query.get('min_move') || '0.5');

      const cacheKey = `sharp-pair:${sports.join(',')}:${market}:${state}`;
      const cachedPair = getCached(cacheKey, SHARP_TTL);
      let currentOdds, previousOdds;
      if (cachedPair) {
        currentOdds = cachedPair.current;
        previousOdds = cachedPair.previous;
      } else {
        const pairs = await Promise.allSettled([
          fetchOddsForSports(sports, market, state, { previousOdds: false }),
          fetchOddsForSports(sports, market, state, { previousOdds: true })
        ]);
        currentOdds = pairs[0].status === 'fulfilled' ? pairs[0].value : [];
        previousOdds = pairs[1].status === 'fulfilled' ? pairs[1].value : [];
        setCached(cacheKey, { current: currentOdds, previous: previousOdds });
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
