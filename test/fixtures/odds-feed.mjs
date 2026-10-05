// Synthetic quote-feed records for tests and local previews only — never served by the site. Every game is
// "Fixture … @ Fixture …" so these prices can't be mistaken for real ones. Each market is built from a
// chosen fair probability and each book's margin, so consensus, EV and arbitrage have known answers:
//   - Pinnacle prices every market at a 2% margin around the fair price (the sharp reference);
//   - DraftKings, FanDuel, BetMGM and Caesars at 4.5–6% margins;
//   - `edges` puts one book's price above fair on chosen markets (a +EV row);
//   - `arbitrage` sets two books' opposite sides so they sum under 100% (an arbitrage row);
//   - Novig (an exchange) carries liquidity on moneylines (smart money);
//   - PrizePicks lines (pick'em) on the player props.

export const FIXTURE_TEAMS = [['Falcons', 'Saints'], ['Bears', 'Packers'], ['Cowboys', 'Giants'], ['Bills', 'Jets'], ['Chiefs', 'Raiders'], ['Rams', 'Seahawks'], ['Ravens', 'Steelers'], ['Lions', 'Vikings']];
const BOOK_MARGINS = { Pinnacle: 0.02, DraftKings: 0.045, FanDuel: 0.05, BetMGM: 0.055, Caesars: 0.06 };

const american = probability => probability >= 0.5 ? Math.round(-100 * probability / (1 - probability)) : Math.round(100 * (1 - probability) / probability);
// A two-way market at a book: each side's fair probability scaled up by the margin (multiplicative vig).
const priced = (fair, margin) => [american(fair * (1 + margin)), american((1 - fair) * (1 + margin))];

/**
 * Raw upstream records (the quote API's /quotes shape). `now` sets observation and start times.
 * More games than FIXTURE_TEAMS (benchmarks) get numbered teams; `propsPerGame` adds player props.
 * @param {{ now?: number, games?: number, edges?: boolean, arbitrage?: boolean, live?: boolean, propsPerGame?: number }} [options]
 */
export function fixtureRecords({ now = Date.now(), games = 4, edges = true, arbitrage = true, live = true, propsPerGame = 1 } = {}) {
  const records = [], ts = new Date(now - 30_000).toISOString();
  let id = 0;
  const add = record => records.push({ id: `fx-${++id}`, sport: 'nfl', ts, ...record });
  const teams = games <= FIXTURE_TEAMS.length ? FIXTURE_TEAMS.slice(0, games) : Array.from({ length: games }, (_, game) => [`Visitors${game}`, `Hosts${game}`]);
  teams.forEach(([away, home], game) => {
    const event = `Fixture ${away} @ Fixture ${home}`, startTime = new Date(now + (game % 40 + 2) * 3_600_000).toISOString();
    const homeFair = 0.4 + game % 5 * 0.05, totalLine = 41.5 + game % 10, spread = 2.5 + game % 5;
    for (const [book, margin] of Object.entries(BOOK_MARGINS)) {
      let [homeOdds, awayOdds] = priced(homeFair, margin);
      // A soft book above fair on the home moneyline (37% implied against a 40% fair price, about +8% EV); its
      // own two sides still add up to more than 100%, as a real book's do.
      if (edges && game === 0 && book === 'Caesars') { homeOdds = american(homeFair - 0.03); awayOdds = american(1 - homeFair + 0.08); }
      // Two books disagreeing enough for an arbitrage on game 1: DraftKings' home side and FanDuel's away
      // side add up to 98.5%, while each book's own market stays above 100%.
      if (arbitrage && game === 1 && book === 'DraftKings') { homeOdds = american(homeFair - 0.04); awayOdds = american(1 - homeFair + 0.05); }
      if (arbitrage && game === 1 && book === 'FanDuel') { awayOdds = american(1 - homeFair + 0.025); homeOdds = american(homeFair * (1 + margin)); }
      add({ event, startTime, book, market: 'moneyline', type: 'moneyline', side: 'home', selection_name: `Fixture ${home}`, odds: homeOdds });
      add({ event, startTime, book, market: 'moneyline', type: 'moneyline', side: 'away', selection_name: `Fixture ${away}`, odds: awayOdds });
      const [overOdds, underOdds] = priced(0.5, margin);
      add({ event, startTime, book, market: 'total', type: 'total', side: 'over', selection_name: `Over ${totalLine}`, line: totalLine, odds: overOdds });
      add({ event, startTime, book, market: 'total', type: 'total', side: 'under', selection_name: `Under ${totalLine}`, line: totalLine, odds: underOdds });
      // Middles: one book a point higher on the total than the others.
      if (book === 'BetMGM') {
        add({ event, startTime, book, market: 'total', type: 'total', side: 'over', selection_name: `Over ${totalLine + 2}`, line: totalLine + 2, odds: overOdds });
        add({ event, startTime, book, market: 'total', type: 'total', side: 'under', selection_name: `Under ${totalLine + 2}`, line: totalLine + 2, odds: underOdds });
      }
      add({ event, startTime, book, market: 'spread', type: 'spread', side: 'home', selection_name: `Fixture ${home} -${spread}`, line: -spread, odds: priced(0.5, margin)[0] });
      add({ event, startTime, book, market: 'spread', type: 'spread', side: 'away', selection_name: `Fixture ${away} +${spread}`, line: spread, odds: priced(0.5, margin)[1] });
      for (let prop = 0; prop < propsPerGame; prop++) {
        const player = `Fixture Runner ${game + 1}${prop ? `-${prop}` : ''}`, propLine = 60.5 + game % 8 * 5, [propOver, propUnder] = priced(0.52 - prop % 3 * 0.04, margin);
        add({ event, startTime, book, market: 'Rushing Yards', type: 'prop', player, side: 'over', selection_name: `Over ${propLine}`, line: propLine, odds: propOver });
        add({ event, startTime, book, market: 'Rushing Yards', type: 'prop', player, side: 'under', selection_name: `Under ${propLine}`, line: propLine, odds: propUnder });
      }
    }
    // Exchange depth on the moneyline (smart money).
    const [exchangeHome, exchangeAway] = priced(homeFair, 0.01);
    add({ event, startTime, book: 'Novig', exchange: true, liquidity: 2500 + game * 1000, market: 'moneyline', type: 'moneyline', side: 'home', selection_name: `Fixture ${home}`, odds: exchangeHome });
    add({ event, startTime, book: 'Novig', exchange: true, liquidity: 1800, market: 'moneyline', type: 'moneyline', side: 'away', selection_name: `Fixture ${away}`, odds: exchangeAway });
    // A pick'em line on the same prop.
    add({ event, startTime, book: 'PrizePicks', player: `Fixture Runner ${game + 1}`, market: 'Rushing Yards', type: 'prop', side: 'over', line: 60.5 + game % 8 * 5 });
    // An in-play moneyline on the first game.
    if (live && game === 0) {
      const liveStart = new Date(now - 3_600_000).toISOString(), liveEvent = `Fixture Ravens @ Fixture Steelers`, liveTs = new Date(now - 5_000).toISOString();
      for (const [book, margin] of Object.entries(BOOK_MARGINS)) {
        const [homeOdds, awayOdds] = priced(0.55, margin);
        add({ event: liveEvent, startTime: liveStart, ts: liveTs, live: true, book, market: 'moneyline', type: 'moneyline', side: 'home', selection_name: 'Fixture Steelers', odds: homeOdds });
        add({ event: liveEvent, startTime: liveStart, ts: liveTs, live: true, book, market: 'moneyline', type: 'moneyline', side: 'away', selection_name: 'Fixture Ravens', odds: awayOdds });
      }
    }
  });
  return records;
}

/** Payout tables in the quote API's /site/dfs/payouts shape (power play only). */
export const fixturePayouts = () => [{ app: 'PrizePicks', payouts: { 2: { power: { multiplier: 3 } }, 3: { power: { multiplier: 6 } } } }];

/** A fetch stand-in for the quote API: /quotes, /site/dfs/props, /site/dfs/payouts, /site/odds/history, /site/prediction/contracts. */
export function fixtureFetcher(records = fixtureRecords(), { props = [], payouts = fixturePayouts(), history = [], contracts = [], fail = null } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const target = new URL(url);
    calls.push({ path: target.pathname, search: target.search, key: init.headers?.['X-API-Key'] });
    if (fail?.(target)) return new Response(JSON.stringify({ detail: 'down' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const body = target.pathname === '/quotes' ? { quotes: records, complete: true }
      : target.pathname === '/site/dfs/props' ? props
      : target.pathname === '/site/dfs/payouts' ? payouts
      : target.pathname === '/site/odds/history' ? history
      : target.pathname === '/site/prediction/contracts' ? contracts : null;
    return body === null ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  fetcher.calls = calls;
  return fetcher;
}
