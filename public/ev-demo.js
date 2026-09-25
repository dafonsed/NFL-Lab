// Every seeded record is hypothetical. The connected feed can supply the same shape later.
export function smartMoneyDemoQuotes() {
  const ts = new Date().toISOString();
  let id = 0;
  const quote = (event, market, type, line, side, book, odds, liquidity = 0, extra = {}) => ({
    id: `smart-demo-${++id}`, sport:'NFL', event, market, type, line, side, book, odds,
    exchange: liquidity > 0, liquidity, live:false, ts, source:'example', ...extra
  });
  const markets = [
    {
      event:'Denver Broncos vs Kansas City Chiefs', market:'Moneyline', type:'moneyline',
      exchange:['Kansas City Chiefs','','Sporttrade',-205,18420], opposite:['Denver Broncos','','ProphetX',195,9100], limit:50000,
      depth:[['ProphetX',-208,11200],['Novig',-210,7200],['BettorEdge',-212,4100],['Sporttrade',-215,1800],['Novig',-218,740]],
      books:[['DraftKings',203,-210],['FanDuel',200,-215],['BetMGM',198,-218],['Caesars',196,-220],['bet365',195,-215],['Fanatics',190,-225]]
    },
    {
      event:'Arizona Cardinals vs San Francisco 49ers', market:'Point spread', type:'spread',
      exchange:['San Francisco 49ers',-9.5,'Sporttrade',106,14200], opposite:['Arizona Cardinals',9.5,'ProphetX',-112,7800], limit:30000,
      depth:[['ProphetX',104,8600],['Novig',102,5200],['BettorEdge',100,2500],['Sporttrade',-102,1200],['Novig',-105,610]],
      books:[['FanDuel',-105,-110],['DraftKings',-108,-112],['BetMGM',-110,-110],['Caesars',-110,-115],['bet365',-112,-108],['Fanatics',-115,-105]]
    },
    {
      event:'Washington Commanders vs Los Angeles Chargers', market:'Point spread', type:'spread',
      exchange:['Washington Commanders',2.5,'Sporttrade',116,9995], opposite:['Los Angeles Chargers',-2.5,'ProphetX',-120,7200], limit:30000,
      depth:[['ProphetX',112,6600],['Novig',111,4100],['BettorEdge',110,2000],['Sporttrade',109,680],['ProphetX',108,420]],
      books:[['DraftKings',-115,110],['FanDuel',-118,108],['BetMGM',-120,106],['Caesars',-120,105],['bet365',-122,104],['Fanatics',-125,102]]
    },
    {
      event:'San Francisco 49ers vs Los Angeles Rams', market:'Matthew Stafford passing yards', type:'prop',
      exchange:['Over',274.5,'Sporttrade',143,9741], opposite:['Under',274.5,'ProphetX',-145,6400],
      depth:[['ProphetX',141,6400],['Novig',139,3900],['BettorEdge',137,2100],['Sporttrade',135,990],['Novig',132,430]],
      books:[['FanDuel',-140,135],['DraftKings',-142,132],['BetMGM',-145,130],['Caesars',-145,128],['BetRivers',-148,125],['bet365',-150,120]]
    },
    {
      event:'New England Patriots vs Buffalo Bills', market:'Josh Allen passing touchdowns', type:'prop',
      exchange:['Over',1.5,'ProphetX',-145,9577], opposite:['Under',1.5,'Sporttrade',130,5300],
      depth:[['Sporttrade',-150,5800],['Novig',-155,3400],['BettorEdge',-160,1800],['ProphetX',-165,890],['Novig',-170,320]],
      books:[['BetMGM',138,-155],['FanDuel',135,-158],['DraftKings',132,-160],['Caesars',130,-155],['Fanatics',128,-154],['BetRivers',125,-153]]
    },
    {
      event:'New England Patriots vs Buffalo Bills', market:'Point spread', type:'spread',
      exchange:['Buffalo Bills',-8,'Sporttrade',109,8608], opposite:['New England Patriots',8,'ProphetX',-110,4900], limit:30000,
      depth:[['ProphetX',107,5900],['Novig',105,3300],['BettorEdge',103,1900],['Sporttrade',101,850],['Novig',100,350]],
      books:[['DraftKings',-105,100],['bet365',-108,-102],['FanDuel',-110,-105],['BetMGM',-112,-108],['Caesars',-115,-110],['Fanatics',-118,-112]]
    }
  ];
  return markets.flatMap(item => [
    quote(item.event,item.market,item.type,item.exchange[1],item.exchange[0],item.exchange[2],item.exchange[3],item.exchange[4],{ limit:item.limit }),
    quote(item.event,item.market,item.type,item.opposite[1],item.opposite[0],item.opposite[2],item.opposite[3],item.opposite[4]),
    ...item.depth.map(([book,odds,liquidity]) => quote(item.event,item.market,item.type,item.exchange[1],item.exchange[0],book,odds,liquidity,{ depthOnly:true })),
    ...item.books.flatMap(([book,oppositeOdds,exchangeOdds]) => [
      quote(item.event,item.market,item.type,item.opposite[1],item.opposite[0],book,oppositeOdds),
      quote(item.event,item.market,item.type,item.exchange[1],item.exchange[0],book,exchangeOdds)
    ])
  ]);
}

export function exampleWorkspace() {
  const now = new Date().toISOString(), day = new Date().toISOString().slice(0, 10);
  let n = 0;
  const quote = (event, market, type, line, side, book, odds, live = false, extra = {}) => ({
    id: 'example-q-' + ++n, sport: 'NFL', event, market, type, line, side, book, odds, live,
    ts: now, source: 'example', ...extra
  });
  const game = 'ARI @ SEA';
  const nfl = { displayEvent: 'ARI @ SEA', displayTime: '4:25pm' };
  const mlb = { sport: 'MLB', displayEvent: 'MIA @ WSH', displayTime: '6:46pm' };
  const quotes = [
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Over', 'ParlayPlay', -130, false, { ...nfl, player: 'Kyler Murray', displayMarket: 'Passing Yards' }),
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Under', 'bet365', 185, false, { ...nfl, player: 'Kyler Murray', displayMarket: 'Passing Yards' }),
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Under', 'FanDuel', 180, false, { ...nfl, player: 'Kyler Murray', displayMarket: 'Passing Yards' }),
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Under', 'BetMGM', 175, false, { ...nfl, player: 'Kyler Murray', displayMarket: 'Passing Yards' }),
    quote(game, 'Marvin Harrison Jr. receiving yards', 'prop', 74.5, 'Over', 'DraftKings', -125, false, { ...nfl, player: 'Marvin Harrison Jr.', displayMarket: 'Receiving Yards' }),
    quote(game, 'Marvin Harrison Jr. receiving yards', 'prop', 74.5, 'Under', 'Caesars', 160, false, { ...nfl, player: 'Marvin Harrison Jr.', displayMarket: 'Receiving Yards' }),
    quote(game, 'Game total', 'total', 44.5, 'Over', 'DraftKings', 115, false, nfl),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'DraftKings', -135, false, nfl),
    quote(game, 'Game total', 'total', 44.5, 'Over', 'FanDuel', -110, false, nfl),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'FanDuel', -110, false, nfl),
    quote(game, 'Game total', 'total', 44.5, 'Over', 'BetMGM', -112, false, nfl),
    quote(game, 'Game total', 'total', 44.5, 'Under', 'BetMGM', -108, false, nfl),
    quote(game, 'Game total', 'alternate', 45.5, 'Over', 'DraftKings', -105, false, nfl),
    quote(game, 'Game total', 'alternate', 45.5, 'Under', 'FanDuel', 102, false, nfl),
    quote(game, 'Game total', 'alternate', 43.5, 'Over', 'BetMGM', -120, false, nfl),
    quote(game, 'Game total', 'alternate', 43.5, 'Under', 'BetMGM', 100, false, nfl),
    quote(game, 'Point spread', 'spread', -3.5, 'Arizona', 'DraftKings', -110, false, nfl),
    quote(game, 'Point spread', 'spread', 3.5, 'Seattle', 'DraftKings', -110, false, nfl),
    quote(game, 'Point spread', 'spread', -3.5, 'Arizona', 'BetMGM', -112, false, nfl),
    quote(game, 'Point spread', 'spread', 3.5, 'Seattle', 'BetMGM', -108, false, nfl),
    quote(game, 'Point spread', 'spread', -4.5, 'Arizona', 'FanDuel', 105, false, nfl),
    quote(game, 'Point spread', 'spread', 4.5, 'Seattle', 'FanDuel', -115, false, nfl),
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Over', 'Sporttrade', 110, false, { ...nfl, player: 'Kyler Murray', exchange: true, liquidity: 2400 }),
    quote(game, 'Kyler Murray passing yards', 'prop', 249.5, 'Under', 'Sporttrade', -120, false, { ...nfl, player: 'Kyler Murray', exchange: true, liquidity: 1900 }),
    quote('Arizona season outlook', 'Arizona reaches playoffs', 'future', '', 'Yes', 'DraftKings', 140),
    quote('Arizona season outlook', 'Arizona reaches playoffs', 'future', '', 'No', 'DraftKings', -170),
    quote('Arizona season outlook', 'Arizona reaches playoffs', 'future', '', 'Yes', 'FanDuel', 135),
    quote('Arizona season outlook', 'Arizona reaches playoffs', 'future', '', 'No', 'FanDuel', -165),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'DraftKings', 112, true, nfl),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'DraftKings', -130, true, nfl),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'FanDuel', -108, true, nfl),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'FanDuel', -108, true, nfl),
    quote(game, 'Live game total', 'total', 41.5, 'Over', 'Sporttrade', 105, true, { ...nfl, exchange: true, liquidity: 3200 }),
    quote(game, 'Live game total', 'total', 41.5, 'Under', 'Sporttrade', -116, true, { ...nfl, exchange: true, liquidity: 1700 }),
    quote(game, 'Live game total', 'alternate', 40.5, 'Over', 'BetMGM', -120, true, nfl),
    quote(game, 'Live game total', 'alternate', 42.5, 'Under', 'FanDuel', 110, true, nfl),
    quote('MIA @ WSH', 'CJ Abrams hits', 'prop', 0.5, 'Over', 'ParlayPlay', -130, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Hits' }),
    quote('MIA @ WSH', 'CJ Abrams hits', 'prop', 0.5, 'Under', 'bet365', 185, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Hits' }),
    quote('MIA @ WSH', 'CJ Abrams hits', 'prop', 0.5, 'Under', 'FanDuel', 180, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Hits' }),
    quote('MIA @ WSH', 'CJ Abrams hits', 'prop', 0.5, 'Under', 'BetMGM', 175, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Hits' }),
    quote('MIA @ WSH', 'CJ Abrams total bases', 'prop', 1.5, 'Over', 'DraftKings', -120, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Total Bases' }),
    quote('MIA @ WSH', 'CJ Abrams total bases', 'prop', 1.5, 'Under', 'Caesars', 150, false, { ...mlb, player: 'CJ Abrams', displayMarket: 'Total Bases' })
  ];
  return {
    version: 1, example: true, quotes,
    history: quotes.map(q => ({ id: 'h-' + q.id, quoteId: q.id, event: q.event, market: q.market, side: q.side, book: q.book, line: q.line, odds: q.odds, ts: q.ts, source: 'example' })),
    dfs: [
      { id: 'example-d-1', sport:'NFL', event: game, player: 'Kyler Murray', market: 'Passing yards', line: 249.5, side: 'Over', app: 'PrizePicks (example)', probability: .56, ts: now, source: 'example' },
      { id: 'example-d-2', sport:'NFL', event: game, player: 'James Conner', market: 'Rushing yards', line: 69.5, side: 'Under', app: 'PrizePicks (example)', probability: .58, ts: now, source: 'example' },
      { id: 'example-d-3', sport:'NFL', event: game, player: 'Marvin Harrison Jr.', market: 'Receiving yards', line: 75.5, side: 'Over', app: 'Underdog (example)', probability: .57, ts: now, source: 'example' },
      { id: 'example-d-4', sport:'NFL', event: game, player: 'Trey McBride', market: 'Receptions', line: 4.5, side: 'Over', app: 'Underdog (example)', probability: .52, ts: now, source: 'example' },
      { id: 'example-d-5', sport:'NFL', event: game, player: 'Kyler Murray', market: 'Passing yards', line: 252.5, side: 'Over', app: 'Underdog (example)', probability: .53, ts: now, source: 'example' }
    ],
    paytables: {
      'PrizePicks (example)': { '2': [0, 0, 3], '3': [0, 0, 0, 5], '4': [0, 0, 0, 0, 10], '5': [0, 0, 0, 0, 0, 20] },
      'Underdog (example)': { '2': [0, 0, 3], '3': [0, 0, 0, 6], '4': [0, 0, 0, 0, 10], '5': [0, 0, 0, 0, 20] }
    },
    contracts: [
      { id: 'example-c-1', sport:'NFL', platform: 'Kalshi (example)', event: 'Example: Team reaches playoffs', bid: 42, ask: 46, last: 44, volume: 2200, ts: now, source: 'example' },
      { id: 'example-c-2', sport:'NFL', platform: 'Polymarket (example)', event: 'Example: Team reaches playoffs', bid: 43, ask: 47, last: 45, volume: 2800, ts: now, source: 'example' }
    ],
    contractHistory: [
      { id:'example-ch-1', contractId:'example-c-1', bid:40, ask:48, volume:1900, ts:new Date(Date.now()-3600_000).toISOString(), source:'example' },
      { id:'example-ch-2', contractId:'example-c-1', bid:42, ask:46, volume:2200, ts:now, source:'example' },
      { id:'example-ch-3', contractId:'example-c-2', bid:41, ask:49, volume:2400, ts:new Date(Date.now()-3600_000).toISOString(), source:'example' },
      { id:'example-ch-4', contractId:'example-c-2', bid:43, ask:47, volume:2800, ts:now, source:'example' }
    ],
    traders: [{ id: 'example-t-1', name: 'Sample trader', platform: 'Kalshi (example)', contractId: 'example-c-1', side: 'Yes', quantity: 50, entry: 40, ts: now, source: 'example' }],
    trades: [{ id: 'example-tr-1', trader: 'Sample trader', contractId: 'example-c-1', side: 'Buy Yes', quantity: 50, price: 40, ts: now, source: 'example' }],
    bets: [{ id: 'example-b-1', sport:'NFL', date: day, selection: 'ARI @ SEA · Game total Over 44.5', book: 'DraftKings', stake: 25, odds: 115, closeOdds: 105, result: 'open', source: 'example' }],
    results: Array.from({ length: 16 }, (_, i) => ({ id: 'example-r-' + i, sport:'NFL', game: 'Sample week ' + (Math.floor(i / 2) + 1), player: i % 2 ? 'James Conner' : 'Kyler Murray', market: i % 2 ? 'Rushing yards' : 'Passing yards', line: i % 2 ? 69.5 : 249.5, result: i % 2 ? 60 + i * 2 + (i % 5) * 4 : 240 + i * 4 - (i % 3) * 6, date: day, source: 'example' })),
    alerts: [], notifications: [], slips: []
  };
}
