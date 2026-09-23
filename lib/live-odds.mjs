import { numeric } from './sports/normalize.mjs';

const price = value => {
  const n = /^(EVEN|EVS)$/i.test(String(value)) ? 100 : numeric(value);
  return n !== null && Math.abs(n) >= 100 ? n : null;
};
const line = value => numeric(typeof value === 'string' ? value.replace(/^[ou]/i, '') : value);

// Only an explicit `.live` node is an in-play price. ESPN's `.close`, legacy
// moneyLine, spread and overUnder fields can remain pregame after play starts.
export function liveGameOdds(rows, game, receipt) {
  const books = [];
  for (const row of rows || []) {
    const markets = [];
    for (const [key, label, sides] of [['moneyline', 'Moneyline', ['away', 'home']], ['pointSpread', game.sport === 'mlb' ? 'Run line' : 'Spread', ['away', 'home']], ['total', 'Total', ['over', 'under']]]) {
      const selections = sides.flatMap(side => {
        const market = row[key]?.[side];
        const basis = game.state === 'in' ? 'live' : game.state === 'post' ? 'archive' : 'pregame';
        const quote = game.state === 'in' ? market?.live : market?.close || market?.open;
        const odds = price(quote?.odds), threshold = key === 'moneyline' ? null : line(quote?.line);
        if (!quote || odds === null || key !== 'moneyline' && threshold === null || quote.available === false || quote.suspended === true) return [];
        return [{ side, label: game.teams.find(t => t.homeAway === side)?.abbreviation || side, line: threshold, odds, basis }];
      });
      if (selections.length) markets.push({ key, label, selections });
    }
    if (markets.length) books.push({ name: row.provider?.displayName || row.provider?.name || 'Public sportsbook', markets });
  }
  return { books, status: receipt?.stale ? 'stale' : books.length ? 'available' : 'unavailable', fetchedAt: receipt?.fetchedAt || null, sourceAgeMs: receipt?.sourceAgeMs || 0, sourceUrl: receipt?.url || null,
    note: game.state === 'in' ? 'Only prices explicitly marked live by the provider are shown. A missing price may be suspended or unavailable.' : game.state === 'post' ? 'Archived pregame prices. This game has finished.' : 'Pregame prices. Live prices appear when the provider publishes them.',
    regionNote: 'Public US prices; availability and local sportsbook pricing can differ.' };
}

const identity = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function matchMlbOddsEvent(events, game) {
  const matches = (events || []).filter(e => {
    const c = e.competitions?.[0];
    return ['home', 'away'].every(side => identity(c?.competitors?.find(t => t.homeAway === side)?.team?.displayName) === identity(game.teams.find(t => t.homeAway === side)?.name)) && Math.abs(Date.parse(e.date) - Date.parse(game.date)) < 45 * 60_000;
  });
  return matches.length === 1 ? matches[0] : null;
}
