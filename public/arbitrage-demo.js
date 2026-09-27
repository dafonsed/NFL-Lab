// Illustrative fixtures only: these are not schedules or available sportsbook offers.
// Returned separately from the workspace so previews never become saved prices.
const markets = [
  {key:'nfl-total',sport:'NFL',event:'KC @ BUF',market:'Game total',type:'total',line:48.5,sides:['Over','Under'],books:['FanDuel','DraftKings'],odds:[115,-105]},
  {key:'mlb-total',sport:'MLB',event:'NYY @ BOS',market:'Game total',type:'total',line:8.5,sides:['Over','Under'],books:['bet365','BetMGM'],odds:[110,-102]},
  {key:'nba-prop',sport:'NBA',event:'LAL @ GSW',market:'Stephen Curry 3-pointers',displayMarket:'Player 3-pointers',player:'Stephen Curry',type:'prop',line:3.5,sides:['Over','Under'],books:['Caesars','Fanatics'],odds:[130,-120]},
  {key:'nhl-total',sport:'NHL',event:'NYR @ TOR',market:'Game total',type:'total',line:5.5,sides:['Over','Under'],books:['DraftKings','BetRivers'],odds:[125,-115]},
  {key:'wnba-spread',sport:'WNBA',event:'NYL @ LVA',market:'Point spread',type:'spread',line:-3.5,sides:['New York Liberty','Las Vegas Aces'],books:['FanDuel','Caesars'],odds:[105,105]},
  {key:'soccer-total',sport:'Soccer',event:'Arsenal vs Chelsea',market:'Game total',type:'total',line:2.5,sides:['Over','Under'],books:['BetMGM','Hard Rock Bet'],odds:[115,-108]}
];

export function arbitrageDemoQuotes(now = Date.now()) {
  const ts = new Date(now).toISOString();
  return [false,true].flatMap(live => markets.flatMap(market => market.books.flatMap((book, bookIndex) => market.sides.map((side, sideIndex) => ({
    id:`arb-demo-${market.key}-${live ? 'live' : 'pre'}-${bookIndex}-${sideIndex}`,
    sport:market.sport, event:market.event, displayEvent:market.event,
    market:market.market, displayMarket:market.displayMarket || market.market,
    player:market.player, type:market.type,
    line:market.type === 'spread' && sideIndex === 1 ? -market.line : market.line,
    side, book,
    odds:bookIndex === sideIndex ? market.odds[sideIndex] : (bookIndex === 0 ? -155 : -145),
    live, ts, source:'example', demo:true, exchange:false,
    displayTime:live ? 'In-game example' : 'Pregame example'
  })))));
}

export function isArbitrageDemo(records = []) {
  return !records.some(quote => quote.source !== 'example');
}

export function arbitrageWorkspaceQuotes(records = [], now = Date.now()) {
  return isArbitrageDemo(records) ? arbitrageDemoQuotes(now) : records;
}
