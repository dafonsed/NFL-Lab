// OddsJam DFS adapter: fetches the /api/oddsjam/dfs endpoint and maps rows into the
// pick format the display layer expects. No SmartStake data involved.
import { decimal, decimalToAmerican, probabilityToAmerican } from './betting-math.js';

export async function getRelayDfsData({ sport, devigMethod = 'power' } = {}) {
  const sports = sport ? [sport.toLowerCase()] : ['nfl', 'nba', 'mlb'];
  const url = `/api/oddsjam/dfs?sports=${sports.join(',')}&min_edge=0.5`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OddsJam DFS failed: ${response.status}`);
  const body = await response.json();
  const rows = Array.isArray(body.data) ? body.data : [];
  const picks = rows.map(row => {
    const playerName = String(row.player || '');
    const marketLabel = String(row.market || '').replace(/_/g, ' ').replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
    const line = Number(row.line) || 0;
    const side = String(row.side || 'over').toLowerCase();
    const fairProb = Number(row.fairProb);
    const dfsPrice = Number(row.dfsPrice);
    const probability = Number.isFinite(fairProb) && fairProb > 0 && fairProb < 1 ? fairProb : null;
    const dfsOdds = Number.isFinite(dfsPrice) ? dfsPrice : null;
    const calculatedEv = probability != null && dfsOdds != null ? probability * decimal(dfsOdds) - 1 : null;
    return {
      id: `oj-dfs:${playerName}:${marketLabel}:${line}:${side}:${row.dfsBook || ''}`,
      app: row.dfsBook || 'prizepicks', player: playerName, market: marketLabel,
      line, side, event: '', sport: (sport || '').toUpperCase(), league: (sport || '').toUpperCase(),
      matchSport: (sport || '').toLowerCase(), startTime: '', ts: new Date().toISOString(),
      source: 'local-api',
      odds: dfsOdds != null ? dfsOdds : NaN,
      dfsOdds: dfsOdds, customOdds: dfsOdds != null,
      customEv: Number.isFinite(calculatedEv) ? calculatedEv : Number.isFinite(Number(row.edgePct)) ? Number(row.edgePct) / 100 : null,
      probability,
      fairOdds: probability != null && probability > 0 && probability < 1 ? probabilityToAmerican(probability) : null,
      probabilityBooks: [row.bestBook].filter(Boolean), probabilityMethod: devigMethod,
      probabilitySource: 'oddsjam-devig', type: 'prop', alt: false, url: '',
      bookLines: (row.bookLines && row.bookLines.length ? row.bookLines.map(bl => ({ book: bl.book, over: side === 'over' ? bl.price : null, under: side === 'under' ? bl.price : null, line: bl.line })) : row.bestBook ? [{ book: row.bestBook, over: side === 'over' ? row.bestBookPrice : null, under: side === 'under' ? row.bestBookPrice : null }] : []),
      eventId: `oj:${row.gameId || ''}`,
      period: 'full', live: false, exchange: false,
      team: '', recommendation: row.recommendation || '', edgePct: Number(row.edgePct) || 0,
    };
  }).filter(pick => pick.player && pick.market && pick.line > 0);
  return { picks, generatedAt: new Date().toISOString() };
}
