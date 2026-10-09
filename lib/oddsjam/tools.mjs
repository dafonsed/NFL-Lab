// Betting tools engine — computes EV, arb, DFS edges, sharp money from OddsJam odds data
// Key insight: each row in OddsJam data = ONE side of a market. Row pairs = both sides.
import {
  devig, noVigFairOdds, expectedValue, evPercentage, kelly,
  findArbitrage, americanToImpliedProb, impliedProbToAmerican, americanToDecimal
} from './devig.mjs';
import { SHARP_BOOKS, ACTIVE_DFS_BOOKS, SHARP_DISPLAY_NAME } from './client.mjs';

function extractOdds(row) {
  const result = {};
  if (!row || !row.odds) return result;
  for (const [book, odds] of Object.entries(row.odds)) {
    if (Array.isArray(odds) && odds.length > 0 && typeof odds[0]?.price === 'number') {
      result[book] = odds[0];
    }
  }
  return result;
}


function sharpDisplayName(bookName) {
  return SHARP_DISPLAY_NAME[bookName] || bookName;
}
function findSharpOdds(rowOdds) {
  for (const sharp of SHARP_BOOKS) {
    if (rowOdds[sharp]) return { book: sharp, odd: rowOdds[sharp] };
  }
  return null;
}

function getMatchupName(game, rowA, rowB) {
  const a = getRowLabel(rowA);
  const b = getRowLabel(rowB);
  if (a && b && a !== 'Unknown' && b !== 'Unknown') return a + ' vs ' + b;
  return game.name || game.id || '';
}
function getRowLabel(row) {
  const display = row.display || {};
  const first = Object.values(display)[0];
  if (first) return first.title || first.subtitle || first.team_name || 'Unknown';
  return 'Unknown';
}

// ─── Positive EV Tool ───
export function computePositiveEV(oddsData, options = {}) {
  const {
    minEV = 0.5,
    devigMethod = 'power'
  } = options;

  const results = [];

  for (const game of oddsData) {
    const rows = game.rows || [];
    if (rows.length < 2) continue;

    // Process row pairs (side A + side B)
    for (let i = 0; i < rows.length - 1; i += 2) {
      const rowA = rows[i];
      const rowB = rows[i + 1];

      const oddsA = extractOdds(rowA);
      const oddsB = extractOdds(rowB);

      // Find sharp book for devig
      const sharpA = findSharpOdds(oddsA);
      const sharpB = findSharpOdds(oddsB);
      if (!sharpA || !sharpB) continue;

      // Devig the sharp book pair
      const fair = devig(sharpA.odd.price, sharpB.odd.price, devigMethod);
      if (!fair || fair.prob1 <= 0 || fair.prob2 <= 0) continue;

      const labelA = getRowLabel(rowA);
      const labelB = getRowLabel(rowB);

      // Check every book against fair for side A
      for (const [book, odd] of Object.entries(oddsA)) {
        if (SHARP_BOOKS.includes(book)) continue;
        const ev = evPercentage(odd.price, fair.prob1);
        if (ev >= minEV) {
          results.push({
            gameId: game.id || game.game_id,
            matchup: getMatchupName(game, rowA, rowB) || game.name || game.id || '', sport: (game._sport || '').toUpperCase(),
            book,
            sharpBook: sharpDisplayName(sharpA.book),
            market: odd.market_name || 'moneyline',
            betName: labelA,
            betPoints: odd.bet_points,
            price: odd.price,
            fairPrice: impliedProbToAmerican(fair.prob1),
            fairProb: fair.prob1,
            evPct: ev,
            kellyPct: kelly(odd.price, fair.prob1) * 100
          });
        }
      }

      // Check every book against fair for side B
      for (const [book, odd] of Object.entries(oddsB)) {
        if (SHARP_BOOKS.includes(book)) continue;
        const ev = evPercentage(odd.price, fair.prob2);
        if (ev >= minEV) {
          results.push({
            gameId: game.id || game.game_id,
            matchup: getMatchupName(game, rowA, rowB) || game.name || game.id || '', sport: (game._sport || '').toUpperCase(),
            book,
            sharpBook: sharpDisplayName(sharpB.book),
            market: odd.market_name || 'moneyline',
            betName: labelB,
            betPoints: odd.bet_points,
            price: odd.price,
            fairPrice: impliedProbToAmerican(fair.prob2),
            fairProb: fair.prob2,
            evPct: ev,
            kellyPct: kelly(odd.price, fair.prob2) * 100
          });
        }
      }
    }
  }

  return results.sort((a, b) => b.evPct - a.evPct);
}

// ─── Arbitrage Tool ───
export function computeArbitrage(oddsData, options = {}) {
  const { minProfit = 0.0 } = options;
  const results = [];

  for (const game of oddsData) {
    const rows = game.rows || [];
    if (rows.length < 2) continue;

    for (let i = 0; i < rows.length - 1; i += 2) {
      const rowA = rows[i];
      const rowB = rows[i + 1];

      const oddsA = extractOdds(rowA);
      const oddsB = extractOdds(rowB);

      // Find best odds for each side
      let bestA = null, bestB = null;
      for (const [book, odd] of Object.entries(oddsA)) {
        if (!bestA || americanToDecimal(odd.price) > americanToDecimal(bestA.price)) {
          bestA = { book, ...odd };
        }
      }
      for (const [book, odd] of Object.entries(oddsB)) {
        if (!bestB || americanToDecimal(odd.price) > americanToDecimal(bestB.price)) {
          bestB = { book, ...odd };
        }
      }

      if (!bestA || !bestB) continue;

      const arb = findArbitrage(bestA.price, bestB.price);
      if (arb.isArb && arb.profitPct >= minProfit) {
        results.push({
          gameId: game.id || game.game_id,
          matchup: getMatchupName(game, rowA, rowB) || game.name || game.id || '', sport: (game._sport || '').toUpperCase(),
          market: bestA.market_name || 'moneyline',
          sideA: { book: bestA.book, name: getRowLabel(rowA), price: bestA.price, stakePct: arb.stake1 * 100 },
          sideB: { book: bestB.book, name: getRowLabel(rowB), price: bestB.price, stakePct: arb.stake2 * 100 },
          profitPct: arb.profitPct
        });
      }
    }
  }

  return results.sort((a, b) => b.profitPct - a.profitPct);
}

// ─── DFS Edge Tool ───
// Compares DFS book prices against best non-DFS book prices for the same player prop
export function computeDFSEdges(dfsOddsData, _unused, options = {}) {
  const { minEdge = 0.1 } = options;
  const results = [];

  const DFS_BOOK_NAMES = [
    'PrizePicks', 'Sleeper', 'Underdog Fantasy', 'Underdog', 'Fliff',
    'Betr Picks', 'Dabble', 'ParlayPlay', 'Splash Sports', 'Rebet Props',
    'DraftKings (Pick', 'FD Predicts', 'Chalkboard (Picks)'
  ];

  function isDFSBook(name) {
    return DFS_BOOK_NAMES.some(d => name.includes(d));
  }

  for (const game of dfsOddsData) {
    const rows = game.rows || [];
    if (rows.length < 2) continue;

    const playerId = game.id || game.game_id || '';
    const playerName = playerId.split(':').pop()?.replace(/_/g, ' ') || '';

    for (let ri = 0; ri < rows.length - 1; ri += 2) {
      const overRow = rows[ri];
      const underRow = rows[ri + 1];

      const overOdds = extractOdds(overRow);
      const underOdds = extractOdds(underRow);

      const nonDFSOver = {};
      const dfsOver = {};
      for (const [book, odd] of Object.entries(overOdds)) {
        if (isDFSBook(book)) dfsOver[book] = odd;
        else nonDFSOver[book] = odd;
      }

      const nonDFSUnder = {};
      const dfsUnder = {};
      for (const [book, odd] of Object.entries(underOdds)) {
        if (isDFSBook(book)) dfsUnder[book] = odd;
        else nonDFSUnder[book] = odd;
      }

      const firstOver = Object.values(overOdds)[0];
      const line = firstOver?.bet_points || null;
      const marketName = firstOver?.market_name || 'Player Prop';

      let bestNonDFSOver = null, bestNonDFSOverBook = '';
      for (const [book, odd] of Object.entries(nonDFSOver)) {
        if (!bestNonDFSOver || americanToDecimal(odd.price) > americanToDecimal(bestNonDFSOver.price)) {
          bestNonDFSOver = odd; bestNonDFSOverBook = book;
        }
      }

      let bestNonDFSUnder = null, bestNonDFSUnderBook = '';
      for (const [book, odd] of Object.entries(nonDFSUnder)) {
        if (!bestNonDFSUnder || americanToDecimal(odd.price) > americanToDecimal(bestNonDFSUnder.price)) {
          bestNonDFSUnder = odd; bestNonDFSUnderBook = book;
        }
      }

      if (bestNonDFSOver) {
        const nonDFSProb = americanToImpliedProb(bestNonDFSOver.price);
        for (const [book, odd] of Object.entries(dfsOver)) {
          const dfsProb = americanToImpliedProb(odd.price);
          const edge = Math.abs(dfsProb - nonDFSProb);
          if (edge * 100 >= minEdge) {
            results.push({
              gameId: playerId, player: playerName, dfsBook: book,
              market: marketName, line, side: 'OVER',
              recommendation: dfsProb < nonDFSProb ? 'OVER (DFS value)' : 'OVER (better at book)',
              edgePct: edge * 100, dfsPrice: odd.price,
              bestBookPrice: bestNonDFSOver.price, bestBook: bestNonDFSOverBook,
              fairProb: nonDFSProb
            });
          }
        }
      }

      if (bestNonDFSUnder) {
        const nonDFSProb = americanToImpliedProb(bestNonDFSUnder.price);
        for (const [book, odd] of Object.entries(dfsUnder)) {
          const dfsProb = americanToImpliedProb(odd.price);
          const edge = Math.abs(dfsProb - nonDFSProb);
          if (edge * 100 >= minEdge) {
            results.push({
              gameId: playerId, player: playerName, dfsBook: book,
              market: marketName, line, side: 'UNDER',
              recommendation: dfsProb < nonDFSProb ? 'UNDER (DFS value)' : 'UNDER (better at book)',
              edgePct: edge * 100, dfsPrice: odd.price,
              bestBookPrice: bestNonDFSUnder.price, bestBook: bestNonDFSUnderBook,
              fairProb: nonDFSProb
            });
          }
        }
      }
    }
  }

  return results.sort((a, b) => b.edgePct - a.edgePct);
}

// ─── Sharp Money Tool ───
export function computeSharpMoney(currentOdds, previousOdds, options = {}) {
  const sportOf = options.sport || '';
  const { minMove = 0.5 } = options;
  const results = [];

  for (const game of currentOdds) {
    const prevGame = previousOdds?.find(g => g.id === game.id || g.game_id === game.id);
    if (!prevGame) continue;

    const currentRows = game.rows || [];
    const prevRows = prevGame.rows || [];

    for (let i = 0; i < Math.min(currentRows.length, prevRows.length); i++) {
      const currentOddsByBook = extractOdds(currentRows[i]);
      const prevOddsByBook = extractOdds(prevRows[i]);

      for (const sharpBook of SHARP_BOOKS) {
        const current = currentOddsByBook[sharpBook];
        const prev = prevOddsByBook[sharpBook];
        if (!current || !prev) continue;

        const currentProb = americanToImpliedProb(current.price);
        const prevProb = americanToImpliedProb(prev.price);
        const move = (currentProb - prevProb) * 100;

        if (Math.abs(move) >= minMove) {
          results.push({
            gameId: game.id,
            matchup: (game.rows?.[0] && game.rows?.[1]) ? getMatchupName(game, game.rows[0], game.rows[1]) : game.name || game.id || '', sport: (game._sport || '').toUpperCase(),
            sharpBook: sharpDisplayName(sharpBook),
            betName: getRowLabel(currentRows[i]),
            market: current.market_name || 'moneyline',
            line: current.bet_points,
            previousPrice: prev.price,
            currentPrice: current.price,
            movePct: move,
            direction: move > 0 ? 'STEAM ↑' : 'REVERSE ↓'
          });
        }
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.movePct) - Math.abs(a.movePct));
}

// ─── Odds Screen Formatter ───
export function formatOddsScreen(oddsData, options = {}) {
  const { books = null } = options;
  const formatted = [];

  for (const game of oddsData) {
    const gameEntry = {
      id: game.id || game.game_id,
      name: (game.rows?.[0] && game.rows?.[1]) ? getMatchupName(game, game.rows[0], game.rows[1]) : game.name || game.id || '', sport: (game._sport || '').toUpperCase(),
      rows: []
    };

    for (const row of (game.rows || [])) {
      const oddsByBook = extractOdds(row);
      const rowEntry = {
        display: row.display || {},
        label: getRowLabel(row),
        books: {}
      };

      for (const [book, odd] of Object.entries(oddsByBook)) {
        if (books && !books.includes(book)) continue;
        rowEntry.books[book] = {
          price: odd.price,
          points: odd.bet_points,
          liquidity: odd.liquidity
        };
      }

      gameEntry.rows.push(rowEntry);
    }

    formatted.push(gameEntry);
  }

  return formatted;
}
