// Test fixture: sample workspaces for unit tests only. Never served or loaded by the site.
import { FANTASY_PLATFORMS, PREDICTION_PLATFORMS, isContestPlatform } from '../../public/platform-catalog.js';

// Temporary product-wide showcase. Keep enabled until the owner requests live mode.
export const EV_DEMO_MODE = true;
export const EV_DEMO_STORE = 'sportslab-ev-permanent-demo-v1';
export const EV_DEMO_BETS_STORE = 'sportslab-ev-permanent-demo-bets-v1';

const leagues = [
  ['NFL', 47.5, [
    ['Arizona Cardinals vs Seattle Seahawks','Kyler Murray','ARI','Passing yards',249.5],
    ['Kansas City Chiefs vs Buffalo Bills','Josh Allen','BUF','Passing yards',264.5],
    ['Cincinnati Bengals vs Baltimore Ravens','Ja’Marr Chase','CIN','Receiving yards',84.5]
  ]],
  ['MLB', 8.5, [
    ['New York Yankees vs Boston Red Sox','Aaron Judge','NYY','Total bases',1.5],
    ['Los Angeles Dodgers vs San Diego Padres','Shohei Ohtani','LAD','Total bases',1.5],
    ['Philadelphia Phillies vs Atlanta Braves','Bryce Harper','PHI','Total bases',1.5]
  ]],
  ['NBA', 225.5, [
    ['Los Angeles Lakers vs Golden State Warriors','Stephen Curry','GSW','Points',27.5],
    ['Boston Celtics vs New York Knicks','Jayson Tatum','BOS','Points',26.5],
    ['Denver Nuggets vs Phoenix Suns','Nikola Jokić','DEN','Points',28.5]
  ]],
  ['WNBA', 162.5, [
    ['Indiana Fever vs Chicago Sky','Caitlin Clark','IND','Points',21.5],
    ['Las Vegas Aces vs New York Liberty','A’ja Wilson','LVA','Points',24.5],
    ['Seattle Storm vs Phoenix Mercury','Nneka Ogwumike','SEA','Points',18.5]
  ]],
  ['NHL', 5.5, [
    ['Toronto Maple Leafs vs New York Rangers','Auston Matthews','TOR','Shots on goal',3.5],
    ['Edmonton Oilers vs Vancouver Canucks','Connor McDavid','EDM','Shots on goal',3.5],
    ['Colorado Avalanche vs Dallas Stars','Nathan MacKinnon','COL','Shots on goal',4.5]
  ]],
  ['Soccer', 2.5, [
    ['Arsenal vs Chelsea','Bukayo Saka','ARS','Shots',2.5],
    ['Manchester City vs Liverpool','Erling Haaland','MCI','Shots',3.5],
    ['Inter Miami vs Atlanta United','Lionel Messi','MIA','Shots',3.5]
  ]]
];
// Keep the original books first: their array positions are persisted quote IDs.
const books = ['DraftKings','FanDuel','BetMGM','Caesars','bet365','BetRivers','Fanatics','Hard Rock Bet','theScore Bet','Bally Bet','Desert Diamond Sports'];
const demoPrices = [[120,-140],[-112,-108],[-112,-108],[-112,-108],[-105,-115],[-118,-102],[-110,-110],[-108,-112],[100,-120],[-115,-105],[105,-125]];
const at = (now, minutes = 0) => new Date(now - minutes * 60_000).toISOString();
const date = (now, days = 0) => {
  const value = new Date(now - days * 86_400_000);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
};

export function permanentDemoWorkspace(saved = null, now = Date.now()) {
  const data = { version:1, example:true, demoPermanent:true, demoRevision:1, demoDay:date(now),
    quotes:[], history:[], dfs:[], paytables:{}, contracts:[], contractHistory:[],
    traders:[], trades:[], bets:[], results:[], alerts:[], notifications:[], slips:[] };
  // Add-on state belongs to the user and survives refreshed showcase records.
  if (saved?.suite && typeof saved.suite === 'object' && !Array.isArray(saved.suite)) data.suite = saved.suite;
  const stamp = { source:'example', demo:true };
  for (const [sport, total, events] of leagues) {
    const slug = sport.toLowerCase();
    events.forEach(([event,player,team,prop,line], eventIndex) => {
      const eventId = `demo-${slug}-${eventIndex}`;
      const base = { ...stamp, sport, league:sport, event, eventId, displayEvent:event, period:'full',
        startTime:at(now + (eventIndex + 2) * 3_600_000), displayTime:'Illustrative matchup', ts:at(now) };
      const markets = [
        ['total','Game total',total + eventIndex,'Over','Under'],
        ['spread','Point spread',-3.5,event.split(' vs ')[0],event.split(' vs ')[1]],
        ['prop',`${player} ${prop}`,line,'Over','Under']
      ];
      for (const live of [false,true]) for (const [type,market,threshold,...sides] of markets) {
        const marketId = `${eventId}:${type}:${live ? 'live' : 'pre'}`;
        books.forEach((book,bookIndex) => sides.forEach((side,sideIndex) => {
          const quote = { ...base, id:`${marketId}:${bookIndex}:${sideIndex}`, marketId, market, type,
            player:type === 'prop' ? player : '', playerId:type === 'prop' ? `${eventId}:player` : '',
            displayMarket:type === 'prop' ? prop : market, line:type === 'spread' && sideIndex ? -threshold : threshold,
            side, book, odds:demoPrices[bookIndex][sideIndex],
            outcomes:2, live, exchange:false, liquidity:0 };
          data.quotes.push(quote);
          if (bookIndex < 2) for (const [index,minutes] of [120,45,0].entries()) data.history.push({ ...stamp,
            id:`${quote.id}:history:${index}`, quoteId:quote.id, sport, event, market, side, book, ts:at(now,minutes),
            line:type === 'total' && index < 2 ? threshold - .5 : quote.line,
            odds:index < 2 ? quote.odds + (quote.odds > 0 ? -10 : -5) : quote.odds });
        }));
        if (type === 'total') {
          data.quotes.push({ ...base, id:`${marketId}:middle:over`, marketId, market, type, line:threshold - 1,
            side:'Over', book:'DraftKings', odds:-115, live, outcomes:2 });
          data.quotes.push({ ...base, id:`${marketId}:middle:under`, marketId, market, type, line:threshold + 1,
            side:'Under', book:'FanDuel', odds:105, live, outcomes:2 });
        }
        for (const [sideIndex,side] of sides.entries()) data.quotes.push({ ...base,
          id:`${marketId}:exchange:${sideIndex}`, marketId, market, type,
          player:type === 'prop' ? player : '', playerId:type === 'prop' ? `${eventId}:player` : '',
          displayMarket:type === 'prop' ? prop : market, line:type === 'spread' && sideIndex ? -threshold : threshold,
          side, book:'Sporttrade', odds:sideIndex ? -145 : 140,
          live, outcomes:2, exchange:true, liquidity:sideIndex ? 4100 : 7800 + eventIndex * 650 });
      }
      FANTASY_PLATFORMS.forEach((app,appIndex) => {
        for (const side of ['Over','Under']) data.dfs.push({ ...base,
          id:`${eventId}:dfs:${appIndex}:${side}`, player, playerId:`${eventId}:player`, team,
          market:prop, line, side, app, startLabel:'Demo matchup',
          probability:side === 'Over' ? .58 + (eventIndex + appIndex % 3) * .009 : .42 - (eventIndex + appIndex % 3) * .009 });
      });
      for (let game = 0; game < 12; game++) data.results.push({ ...stamp,
        id:`${eventId}:result:${game}`, sport, player, market:prop, line,
        game:`${slug}-demo-round-${game}`, date:date(now,game * 3),
        result:Math.max(0, Math.round(line + ((game * 7 + eventIndex * 3) % 11 - 5) * (sport === 'NFL' ? 7 : sport === 'NBA' || sport === 'WNBA' ? 2 : .5))) });
    });
    for (const [index,platform] of PREDICTION_PLATFORMS.entries()) {
      const id = `demo-${slug}-contract-${index}`;
      const contract = { ...stamp, id, sport, platform, event:`${events[index % events.length][0]} · home team wins`,
        bid:42 + index * 2, ask:46 + index * 2, last:44 + index * 2, volume:2200 + index * 900, ts:at(now) };
      data.contracts.push(contract);
      for (let step = 0; step < 4; step++) data.contractHistory.push({ ...stamp,
        id:`${id}:history:${step}`, contractId:id, bid:contract.bid - 3 + step, ask:contract.ask - 3 + step,
        volume:contract.volume - (3-step) * 150, ts:at(now,(3-step)*30) });
      data.traders.push({ ...stamp, id:`${id}:position`, name:'Demo portfolio', platform, contractId:id,
        side:index % 2 ? 'No' : 'Yes', quantity:50 + index * 20, entry:38 + index, ts:at(now,75) });
      for (let trade = 0; trade < 2; trade++) data.trades.push({ ...stamp, id:`${id}:trade:${trade}`,
        trader:'Demo portfolio', contractId:id, side:trade ? 'Sell Yes' : 'Buy Yes', quantity:trade ? 10 : 60,
        price:trade ? 43 + index : 38 + index, ts:at(now,trade ? 15 : 75) });
    }
    for (const [index,kind] of ['price','ev','movement','fantasy-new'].entries()) {
      const id = `demo-${slug}-alert-${kind}`;
      data.alerts.push({ ...stamp, id, sport, kind, market:kind === 'movement' ? 'Game total' : '',
        event:'', threshold:kind === 'price' ? 110 : kind === 'ev' ? 3 : kind === 'movement' ? .5 : 55,
        liveOnly:false, enabled:true, seen:[] });
      data.notifications.push({ ...stamp, id:`${id}:notification`, ruleId:id, read:index === 1,
        message:`Demo ${sport}: ${['price improved to +120','positive EV selection found','game total moved by 0.5','new player prop above 55%'][index]}.`, ts:at(now,index*4) });
    }
  }
  for (const app of FANTASY_PLATFORMS.filter(name => !isContestPlatform(name))) {
    data.paytables[app] = { 2:[0,0,3], 3:[0,0,0,5], 4:[0,0,0,0,10], 5:[0,0,0,0,0,20], 6:[0,0,0,0,0,0,30] };
  }
  for (const [sport] of leagues) {
    const picks = data.dfs.filter(pick => pick.sport === sport && pick.app === 'PrizePicks' && pick.side === 'Over').slice(0,3);
    data.slips.push({ ...stamp, id:`demo-${sport}-slip`, app:'PrizePicks', picks, paytable:[0,0,0,5], stake:20, ts:at(now) });
  }
  // Keep edits/additions in the separate demo workspace; restore missing showcase rows.
  if (saved?.demoRevision === data.demoRevision) {
    for (const key of ['quotes','history','dfs','contracts','contractHistory','traders','trades','results','alerts','notifications','slips']) {
      const existing = new Map((Array.isArray(saved[key]) ? saved[key] : []).map(item => [item.id,item]));
      data[key] = data[key].map(item => { const previous = existing.get(item.id); existing.delete(item.id); return saved.demoDay === data.demoDay && previous ? previous : item; }).concat([...existing.values()]);
    }
    data.paytables = { ...data.paytables, ...saved.paytables };
  }
  refreshDemoObservations(data, now);
  return data;
}

export function refreshDemoObservations(state, now = Date.now()) {
  if (!state.demoPermanent) return;
  for (const quote of state.quotes) if (quote.demo) quote.ts = at(now);
}

export function permanentDemoBets(existingSamples, now = Date.now()) {
  const tickets = [...existingSamples];
  for (const [sport,,events] of leagues) for (const [index,status] of ['open','won','lost','push','void','cashed'].entries()) {
    const parlay = index < 3;
    const legs = events.slice(0,parlay ? 3 : 1).map(([matchup,player,,market,line], legIndex) => ({
      id:`demo-${sport}-${index}-leg-${legIndex}`, mode:'manual', sport, league:sport.toLowerCase(),
      date:date(now,index), gameId:'', market:'prop', marketLabel:market, subject:player,
      label:`${player} Over ${line} ${market}`, matchup, side:'over', line,
      override:status === 'won' ? 'won' : status === 'lost' ? (legIndex === 1 ? 'lost' : 'won') : ['push','void'].includes(status) ? status : null,
      observation:{state:status === 'open' ? (legIndex === 0 ? 'won' : 'live') : status === 'cashed' ? 'live' : status,
        actual:Math.max(0,Math.round(line + (status === 'won' || legIndex === 0 ? 3 : -3))),
        checkedAt:at(now), sourceUrl:'', message:'Illustrative demo result.', gameStatus:status === 'open' ? 'Demo in progress' : 'Demo final'}
    }));
    tickets.push({ id:`permanent-demo-${sport}-${index}`, sport, date:date(now,index),
      selection:parlay ? `${sport} three-pick demo parlay` : legs[0].label,
      market:parlay ? 'Player prop parlay' : events[0][3], book:books[index % 4],
      tool:parlay ? 'Parlay builder' : 'Positive EV', tags:['Demo',parlay ? 'Parlay' : 'Player props'],
      notes:'Permanent design demo. No real wager was placed.', type:parlay ? 'parlay' : 'single',
      stake:25, odds:parlay ? 540 : 120, closingOdds:parlay ? 490 : 110, oddsFormat:'american',
      status, settlement:'manual', returnOverride:null, cashout:status === 'cashed' ? 32 : null,
      legs, sample:true, updatedAt:at(now) });
  }
  return tickets;
}
