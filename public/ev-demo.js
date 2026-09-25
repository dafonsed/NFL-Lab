// Every seeded record is hypothetical. The connected feed can supply the same shape later.
export function exampleWorkspace() {
  const now = new Date().toISOString(), day = new Date().toISOString().slice(0, 10);
  let n = 0;
  const quote = (event, market, type, line, side, book, odds, live = false, extra = {}) => ({
    id: 'example-q-' + ++n, sport: 'NFL', event, market, type, line, side, book, odds, live,
    ts: now, source: 'example', ...extra
  });
  const game = 'Example: Arizona vs Seattle';
  const quotes = [
    quote(game, 'Game total', 'total', 44.5, 'Over', 'Book A', 115),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'Book A', -135),
    quote(game, 'Game total', 'total', 44.5, 'Over', 'Book B', -110),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'Book B', -110),
    quote(game, 'Game total', 'total', 44.5, 'Over', 'Book C', -112),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'Book C', -108),
    quote(game, 'Game total', 'alternate', 45.5, 'Over', 'Book A', -105),
    quote(game, 'Game total', 'alternate', 45.5, 'Under', 'Book B', 102),
    quote(game, 'Game total', 'alternate', 43.5, 'Over', 'Book C', -120),
    quote(game, 'Game total', 'alternate', 43.5, 'Under', 'Book C', 100),
    quote(game, 'Point spread', 'spread', -3.5, 'Arizona', 'Book A', -110),
    quote(game, 'Point spread', 'spread', 3.5, 'Seattle', 'Book A', -110),
    quote(game, 'Point spread', 'spread', -4.5, 'Arizona', 'Book B', 105),
    quote(game, 'Point spread', 'spread', 4.5, 'Seattle', 'Book B', -115),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Over', 'Book A', 118),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Under', 'Book A', -140),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Over', 'Book B', -105),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Under', 'Book B', -115),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Over', 'Exchange X', 110, false, { exchange: true, liquidity: 2400 }),
    quote(game, 'Example QB passing yards', 'prop', 249.5, 'Under', 'Exchange X', -120, false, { exchange: true, liquidity: 1900 }),
    quote('Example: Season outlook', 'Arizona reaches playoffs', 'future', '', 'Yes', 'Book A', 140),
    quote('Example: Season outlook', 'Arizona reaches playoffs', 'future', '', 'No', 'Book A', -170),
    quote('Example: Season outlook', 'Arizona reaches playoffs', 'future', '', 'Yes', 'Book B', 135),
    quote('Example: Season outlook', 'Arizona reaches playoffs', 'future', '', 'No', 'Book B', -165),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'Book A', 112, true),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'Book A', -130, true),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'Book B', -108, true),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'Book B', -108, true),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'Exchange X', 105, true, { exchange: true, liquidity: 3200 }),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'Exchange X', -116, true, { exchange: true, liquidity: 1700 }),
    quote(game, 'Live game total', 'alternate', 40.5, 'Over', 'Book C', -120, true),
    quote(game, 'Live game total', 'alternate', 42.5, 'Under', 'Book B', 110, true)
  ];
  return {
    version: 1, example: true, quotes,
    history: quotes.map(q => ({ id: 'h-' + q.id, quoteId: q.id, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: 'example' })),
    dfs: [
      { id: 'example-d-1', event: game, player: 'Example QB', market: 'Passing yards', line: 249.5, side: 'Over', app: 'PrizePicks (example)', probability: .56, ts: now, source: 'example' },
      { id: 'example-d-2', event: game, player: 'Example RB', market: 'Rushing yards', line: 69.5, side: 'Under', app: 'PrizePicks (example)', probability: .58, ts: now, source: 'example' },
      { id: 'example-d-3', event: game, player: 'Example WR', market: 'Receiving yards', line: 75.5, side: 'Over', app: 'Underdog (example)', probability: .57, ts: now, source: 'example' },
      { id: 'example-d-4', event: game, player: 'Example TE', market: 'Receptions', line: 4.5, side: 'Over', app: 'Underdog (example)', probability: .52, ts: now, source: 'example' }
    ],
    paytables: {
      'PrizePicks (example)': { '2': [0, 0, 3], '3': [0, 0, 0, 5], '4': [0, 0, 0, 0, 10], '5': [0, 0, 0, 0, 0, 20] },
      'Underdog (example)': { '2': [0, 0, 3], '3': [0, 0, 0, 6], '4': [0, 0, 0, 0, 10], '5': [0, 0, 0, 0, 20] }
    },
    contracts: [
      { id: 'example-c-1', platform: 'Kalshi (example)', event: 'Example: Team reaches playoffs', bid: 42, ask: 46, last: 44, volume: 2200, ts: now, source: 'example' },
      { id: 'example-c-2', platform: 'Polymarket (example)', event: 'Example: Team reaches playoffs', bid: 43, ask: 47, last: 45, volume: 2800, ts: now, source: 'example' }
    ],
    contractHistory: [
      { id:'example-ch-1', contractId:'example-c-1', bid:40, ask:48, volume:1900, ts:new Date(Date.now()-3600_000).toISOString(), source:'example' },
      { id:'example-ch-2', contractId:'example-c-1', bid:42, ask:46, volume:2200, ts:now, source:'example' },
      { id:'example-ch-3', contractId:'example-c-2', bid:41, ask:49, volume:2400, ts:new Date(Date.now()-3600_000).toISOString(), source:'example' },
      { id:'example-ch-4', contractId:'example-c-2', bid:43, ask:47, volume:2800, ts:now, source:'example' }
    ],
    traders: [{ id: 'example-t-1', name: 'Sample trader', platform: 'Kalshi (example)', contractId: 'example-c-1', side: 'Yes', quantity: 50, entry: 40, ts: now, source: 'example' }],
    trades: [{ id: 'example-tr-1', trader: 'Sample trader', contractId: 'example-c-1', side: 'Buy Yes', quantity: 50, price: 40, ts: now, source: 'example' }],
    bets: [{ id: 'example-b-1', date: day, selection: 'Example: Game total Over 44.5', book: 'Book A', stake: 25, odds: 115, closeOdds: 105, result: 'open', source: 'example' }],
    results: Array.from({ length: 16 }, (_, i) => ({ id: 'example-r-' + i, game: 'Example week ' + (Math.floor(i / 2) + 1), player: i % 2 ? 'Example RB' : 'Example QB', market: i % 2 ? 'Rushing yards' : 'Passing yards', line: i % 2 ? 69.5 : 249.5, result: i % 2 ? 60 + i * 2 + (i % 5) * 4 : 240 + i * 4 - (i % 3) * 6, date: day, source: 'example' })),
    alerts: [], notifications: [], slips: []
  };
}
