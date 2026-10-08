// Betting Tools — OddsJam Powered Frontend
(function() {
'use strict';

let currentTab = 'ev';
let refreshTimer = null;
let isRefreshing = false;
let allBooks = new Set();

// ─── DOM refs ───
const tabs = document.querySelectorAll('.tab');
const content = document.getElementById('content');
const sportSelect = document.getElementById('sport-select');
const marketSelect = document.getElementById('market-select');
const minEvInput = document.getElementById('min-ev');
const minEdgeInput = document.getElementById('min-edge');
const minProfitInput = document.getElementById('min-profit');
const devigSelect = document.getElementById('devig-select');
const autoRefreshCb = document.getElementById('auto-refresh');
const stat1 = document.getElementById('stat1');
const stat2 = document.getElementById('stat2');
const stat3 = document.getElementById('stat3');
const stat4 = document.getElementById('stat4');
const statTime = document.getElementById('stat-time');
const stat1Label = document.getElementById('stat1-label');
const stat2Label = document.getElementById('stat2-label');
const stat3Label = document.getElementById('stat3-label');
const stat4Label = document.getElementById('stat4-label');

// ─── Tab switching ───
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    updateControlsVisibility();
    refresh();
  });
});

function updateControlsVisibility() {
  const showMap = {
    ev: { market: true, minEv: true, minEdge: false, minProfit: false, devig: true },
    dfs: { market: false, minEv: false, minEdge: true, minProfit: false, devig: true },
    arbitrage: { market: true, minEv: false, minEdge: false, minProfit: true, devig: false },
    sharp: { market: true, minEv: false, minEdge: false, minProfit: false, devig: false },
    odds: { market: true, minEv: false, minEdge: false, minProfit: false, devig: false }
  };
  const show = showMap[currentTab] || {};
  document.getElementById('market-select').parentElement.style.display = show.market ? '' : 'none';
  document.getElementById('min-ev-label').style.display = show.minEv ? '' : 'none';
  document.getElementById('min-edge-label').style.display = show.minEdge ? '' : 'none';
  document.getElementById('min-profit-label').style.display = show.minProfit ? '' : 'none';
  document.getElementById('devig-label').style.display = show.devig ? '' : 'none';
}

// ─── API helpers ───
function getSelectedSports() {
  return Array.from(sportSelect.selectedOptions).map(o => o.value).join(',');
}

async function fetchAPI(path) {
  const resp = await fetch(path);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `API ${resp.status}`);
  }
  return resp.json();
}

// ─── Main refresh ───
window.refresh = async function() {
  if (isRefreshing) return;
  isRefreshing = true;
  content.innerHTML = '<div class="loading">Loading OddsJam data…</div>';

  try {
    const sports = getSelectedSports() || 'nfl,nba,mlb,nhl';
    const market = marketSelect.value;
    let url, data;

    switch (currentTab) {
      case 'ev':
        url = `/api/oddsjam/ev?sports=${sports}&market=${market}&min_ev=${minEvInput.value}&devig=${devigSelect.value}`;
        data = await fetchAPI(url);
        renderEV(data);
        break;

      case 'dfs':
        url = `/api/oddsjam/dfs?sports=${sports}&min_edge=${minEdgeInput.value}`;
        data = await fetchAPI(url);
        renderDFS(data);
        break;

      case 'arbitrage':
        url = `/api/oddsjam/arbitrage?sports=${sports}&market=${market}&min_profit=${minProfitInput.value}`;
        data = await fetchAPI(url);
        renderArbitrage(data);
        break;

      case 'sharp':
        url = `/api/oddsjam/sharp-money?sports=${sports}&market=${market}`;
        data = await fetchAPI(url);
        renderSharpMoney(data);
        break;

      case 'odds':
        url = `/api/oddsjam/odds?sports=${sports}&market=${market}`;
        data = await fetchAPI(url);
        renderOddsScreen(data);
        break;
    }

    statTime.textContent = new Date().toLocaleTimeString();
  } catch (error) {
    content.innerHTML = `<div class="error">⚠️ ${error.message}<br><small>If geo-blocked, configure OJ_PROXY_URL in .env.local</small></div>`;
    stat1.textContent = '—';
    stat2.textContent = '—';
    stat3.textContent = '—';
    stat4.textContent = '—';
  } finally {
    isRefreshing = false;
  }
};

// ─── Renderers ───
function renderEV(data) {
  stat1Label.textContent = 'Bets Found';
  stat2Label.textContent = 'Best EV';
  stat3Label.textContent = 'Avg EV';
  stat4Label.textContent = 'Books';

  const bets = data.data || [];
  stat1.textContent = bets.length;
  stat2.textContent = bets.length > 0 ? bets[0].evPct.toFixed(1) + '%' : '—';
  stat3.textContent = bets.length > 0 ? (bets.reduce((s, b) => s + b.evPct, 0) / bets.length).toFixed(1) + '%' : '—';

  const books = new Set(bets.map(b => b.book));
  stat4.textContent = books.size;

  if (bets.length === 0) {
    content.innerHTML = '<div class="empty">No positive EV bets found above threshold</div>';
    return;
  }

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Matchup</th><th>Market</th><th>Book</th><th>Line</th>
      <th>Odds</th><th>Fair Odds</th><th>EV%</th><th>Kelly%</th><th>Sharp Ref</th>
    </tr></thead><tbody>`;

  for (const bet of bets.slice(0, 200)) {
    const evClass = bet.evPct >= 5 ? 'ev-pos' : bet.evPct >= 2 ? 'price-pos' : '';
    const priceClass = bet.price > 0 ? 'price-pos' : 'price-neg';
    const fairClass = bet.fairPrice > 0 ? 'price-pos' : 'price-neg';
    html += `<tr>
      <td>${bet.matchup || bet.gameId}</td>
      <td><span class="badge gray">${bet.market}</span></td>
      <td><span class="badge blue">${bet.book}</span></td>
      <td>${bet.betName}${bet.betPoints ? ' ' + bet.betPoints : ''}</td>
      <td class="${priceClass}">${bet.price > 0 ? '+' : ''}${bet.price}</td>
      <td class="${fairClass}">${bet.fairPrice > 0 ? '+' : ''}${bet.fairPrice}</td>
      <td class="${evClass}">+${bet.evPct.toFixed(1)}%</td>
      <td>${bet.kellyPct.toFixed(1)}%</td>
      <td>${bet.sharpBook}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function renderDFS(data) {
  stat1Label.textContent = 'DFS Edges';
  stat2Label.textContent = 'Best Edge';
  stat3Label.textContent = 'Avg Edge';
  stat4Label.textContent = 'DFS Books';

  const edges = data.data || [];
  stat1.textContent = edges.length;
  stat2.textContent = edges.length > 0 ? edges[0].edgePct.toFixed(1) + '%' : '—';
  stat3.textContent = edges.length > 0 ? (edges.reduce((s, e) => s + e.edgePct, 0) / edges.length).toFixed(1) + '%' : '—';

  const books = new Set(edges.map(e => e.dfsBook));
  stat4.textContent = books.size;

  if (edges.length === 0) {
    content.innerHTML = '<div class="empty">No DFS edges found — try lowering the minimum edge</div>';
    return;
  }

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Player</th><th>DFS Book</th><th>Market</th><th>Line</th>
      <th>Recommendation</th><th>Edge%</th><th>Fair Prob</th>
    </tr></thead><tbody>`;

  for (const edge of edges.slice(0, 200)) {
    html += `<tr>
      <td>${edge.player}</td>
      <td><span class="badge purple">${edge.dfsBook}</span></td>
      <td>${edge.market}</td>
      <td>${edge.line}</td>
      <td><span class="badge ${edge.recommendation === 'OVER' ? 'green' : 'red'}">${edge.recommendation}</span></td>
      <td class="ev-pos">+${edge.edgePct.toFixed(1)}%</td>
      <td>${(edge.fairProb * 100).toFixed(1)}%</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function renderArbitrage(data) {
  stat1Label.textContent = 'Arbs Found';
  stat2Label.textContent = 'Best Profit';
  stat3Label.textContent = 'Avg Profit';
  stat4Label.textContent = 'Book Pairs';

  const arbs = data.data || [];
  stat1.textContent = arbs.length;
  stat2.textContent = arbs.length > 0 ? arbs[0].profitPct.toFixed(2) + '%' : '—';
  stat3.textContent = arbs.length > 0 ? (arbs.reduce((s, a) => s + a.profitPct, 0) / arbs.length).toFixed(2) + '%' : '—';
  stat4.textContent = new Set(arbs.map(a => `${a.side1.book}/${a.side2.book}`)).size;

  if (arbs.length === 0) {
    content.innerHTML = '<div class="empty">No arbitrage opportunities found</div>';
    return;
  }

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Matchup</th><th>Market</th>
      <th>Side 1</th><th>Odds 1</th><th>Stake 1</th>
      <th>Side 2</th><th>Odds 2</th><th>Stake 2</th>
      <th>Profit%</th>
    </tr></thead><tbody>`;

  for (const arb of arbs) {
    html += `<tr>
      <td>${arb.teamName || arb.gameId}</td>
      <td><span class="badge gray">${arb.market}</span></td>
      <td><span class="badge blue">${arb.sideA.book}</span> ${arb.sideA.name || ''}</td>
      <td class="${arb.sideA.price > 0 ? 'price-pos' : 'price-neg'}">${arb.sideA.price > 0 ? '+' : ''}${arb.sideA.price}</td>
      <td>${arb.sideA.stakePct.toFixed(1)}%</td>
      <td><span class="badge blue">${arb.sideB.book}</span> ${arb.sideB.name || ''}</td>
      <td class="${arb.sideB.price > 0 ? 'price-pos' : 'price-neg'}">${arb.sideB.price > 0 ? '+' : ''}${arb.sideB.price}</td>
      <td>${arb.sideB.stakePct.toFixed(1)}%</td>
      <td class="ev-pos">+${arb.profitPct.toFixed(2)}%</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function renderSharpMoney(data) {
  stat1Label.textContent = 'Sharp Moves';
  stat2Label.textContent = 'Biggest Move';
  stat3Label.textContent = 'Steam ↑';
  stat4Label.textContent = 'Reverse ↓';

  const moves = data.data || [];
  stat1.textContent = moves.length;
  const biggest = moves.length > 0 ? Math.abs(moves[0].movePct) : 0;
  stat2.textContent = moves.length > 0 ? biggest.toFixed(1) + '%' : '—';
  stat3.textContent = moves.filter(m => m.movePct > 0).length;
  stat4.textContent = moves.filter(m => m.movePct < 0).length;

  if (moves.length === 0) {
    content.innerHTML = `<div class="empty">${data.message || 'No sharp moves detected — poll again for line changes'}</div>`;
    return;
  }

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Matchup</th><th>Sharp Book</th><th>Market</th><th>Line</th>
      <th>Prev Odds</th><th>Current</th><th>Move%</th><th>Direction</th>
    </tr></thead><tbody>`;

  for (const move of moves) {
    const moveClass = Math.abs(move.movePct) > 3 ? 'ev-pos' : '';
    html += `<tr>
      <td>${move.matchup || move.gameId}</td>
      <td><span class="badge yellow">${move.sharpBook}</span></td>
      <td>${move.market}</td>
      <td>${move.betName}${move.line ? ' ' + move.line : ''}</td>
      <td>${move.previousPrice > 0 ? '+' : ''}${move.previousPrice}</td>
      <td class="${move.currentPrice > 0 ? 'price-pos' : 'price-neg'}">${move.currentPrice > 0 ? '+' : ''}${move.currentPrice}</td>
      <td class="${moveClass}">${move.movePct > 0 ? '+' : ''}${move.movePct.toFixed(1)}%</td>
      <td><span class="badge ${move.movePct > 0 ? 'green' : 'red'}">${move.direction}</span></td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function renderOddsScreen(data) {
  stat1Label.textContent = 'Games';
  stat2Label.textContent = 'Total Lines';
  stat3Label.textContent = 'Markets';
  stat4Label.textContent = 'Books';

  const games = data.data || [];
  stat1.textContent = games.length;

  let totalLines = 0;
  const books = new Set();
  for (const game of games) {
    for (const row of game.rows) {
      for (const [book, odds] of Object.entries(row.books)) {
        books.add(book);
        totalLines += odds.length;
      }
    }
  }
  stat2.textContent = totalLines;
  stat3.textContent = data.market || '—';
  stat4.textContent = books.size;

  if (games.length === 0) {
    content.innerHTML = '<div class="empty">No games found for selected sports</div>';
    return;
  }

  // Get unique books sorted
  const bookList = Array.from(books).sort();

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Game</th>
      <th>Selection</th>
      ${bookList.slice(0, 20).map(b => `<th class="book-header">${b}</th>`).join('')}
    </tr></thead><tbody>`;

  for (const game of games.slice(0, 30)) {
    for (const row of game.rows.slice(0, 6)) {
      const display = row.display || {};
      const selection = Object.values(display)[0]?.title || Object.values(display)[0]?.subtitle || '';
      html += `<tr>
        <td>${game.name}</td>
        <td>${selection}</td>`;

      for (const book of bookList.slice(0, 20)) {
        const odds = row.books[book];
        if (odds && odds[0]) {
          const price = odds[0].price;
          const cls = price > 0 ? 'odds-cell pos' : price < 0 ? 'odds-cell neg' : 'odds-cell dim';
          html += `<td class="${cls}">${price > 0 ? '+' : ''}${price}</td>`;
        } else {
          html += '<td class="odds-cell dim">—</td>';
        }
      }
      html += '</tr>';
    }
  }

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

// ─── Auto-refresh ───
autoRefreshCb.addEventListener('change', () => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (autoRefreshCb.checked) {
    refreshTimer = setInterval(refresh, 3000);
  }
});

marketSelect.addEventListener('change', refresh);
devigSelect.addEventListener('change', refresh);

// Initial load
updateControlsVisibility();
refresh();
if (autoRefreshCb.checked) {
  refreshTimer = setInterval(refresh, 3000);
}

})();
