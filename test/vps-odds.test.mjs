import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllTxt, buildVpsSnapshot, vpsOddsConfig } from '../lib/odds/vpsodds.mjs';

const sampleTxt = `=== ODDS DATA ===
Harvested: 2026-10-10T12:00:00.000Z
Endpoints: 2/2
Total Rows: 4

--- [nfl_ml] {"product":"screen","league":"NFL","market":"Moneyline","visible":15} ---
Total: 1 | Showing: 1
{"id":"NFL:GAME:Jacksonville_Jaguars:Philadelphia_Eagles:1791725400:Jacksonville Jaguars","event":"Philadelphia Eagles @ Jacksonville Jaguars","participant":"","start":"2026-10-11T13:30:00.000Z","labels":["Jacksonville Jaguars","Philadelphia Eagles"],"odds":{"FanDuel":[-400,315],"DraftKings":[-410,320],"Hardrock":[-400,300],"BallyBet":[-400,300]}}

--- [nfl_rec_1h] {"product":"screen","league":"NFL","market":"Player Receptions - 1st Half","visible":15} ---
Total: 1 | Showing: 1
{"id":"NFL:GAME:Jacksonville_Jaguars:Philadelphia_Eagles:1791725400:Will Shipley","event":"Philadelphia Eagles @ Jacksonville Jaguars","participant":"Will Shipley","start":"2026-10-11T13:30:00.000Z","labels":["Will Shipley Over 1.5","Will Shipley Under 1.5"],"odds":{"FanDuel":[-115,-115],"DraftKings6":[-122,-122],"DraftKings6 (Alt)":[-99,-99]}}

--- [nfl_tp] {"product":"screen","league":"NFL","market":"Total Points","visible":15} ---
Total: 1 | Showing: 1
{"id":"NFL:GAME:Jacksonville_Jaguars:Philadelphia_Eagles:1791725400:","event":"Philadelphia Eagles @ Jacksonville Jaguars","participant":"","start":"2026-10-11T13:30:00.000Z","labels":["Over 42","Under 42"],"odds":{"BetMGM":[-110,-120],"Caesars":[-108,-112]}}

--- [ufc_ml] {"product":"screen","league":"UFC","market":"Moneyline","visible":15} ---
Total: 1 | Showing: 1
{"id":"UFC:FIGHT:x:y:0:x","event":"X vs Y","participant":"","start":"2026-10-11T13:30:00.000Z","labels":["X","Y"],"odds":{"FanDuel":[-200,170]}}
`;

test('vpsOddsConfig is off unless VPS_ODDS_URL is set, and VPS_ODDS_ENABLED=0 wins', () => {
  assert.equal(vpsOddsConfig({}), null, 'no URL, no source');
  assert.equal(vpsOddsConfig({ VPS_ODDS_URL: 'http://1.2.3.4:9' })?.base?.href, 'http://1.2.3.4:9/');
  assert.equal(vpsOddsConfig({ VPS_ODDS_URL: 'http://1.2.3.4:9', VPS_ODDS_ENABLED: '0' }), null, 'VPS_ODDS_ENABLED=0 turns it off');
  assert.equal(vpsOddsConfig({ VPS_ODDS_URL: 'not a url' }), null, 'bad URL → off');
});

test('parseAllTxt reads the harvest timestamp and section rows, ignoring Total/empty lines', () => {
  const { harvestedAt, sections } = parseAllTxt(sampleTxt);
  assert.equal(harvestedAt, '2026-10-10T12:00:00.000Z');
  assert.equal(sections.length, 4);
  assert.equal(sections[0].key, 'nfl_ml');
  assert.equal(sections[0].query.market, 'Moneyline');
  assert.equal(sections[0].rows.length, 1);
  assert.equal(sections[1].query.market, 'Player Receptions - 1st Half');
});

test('buildVpsSnapshot turns screen rows into feed records: ML/spread/total/prop + period, skipping (Alt) and unknown sports', async () => {
  const fetcher = async () => new Response(sampleTxt, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  const config = { base: new URL('http://127.0.0.1:0') };
  const snapshot = await buildVpsSnapshot(config, fetcher);
  const nflMl = snapshot.quotes.filter(quote => quote.type === 'moneyline' && quote.sport === 'nfl');
  const total = snapshot.quotes.filter(quote => quote.type === 'total');
  const prop = snapshot.quotes.filter(quote => quote.type === 'prop');
  // Four books × two sides = 8 moneyline records.
  assert.equal(nflMl.length, 8, 'eight NFL ML records (4 books × 2 sides)');
  const home = nflMl.find(quote => quote.book === 'FanDuel' && quote.side === 'home');
  assert.equal(home.selection_name, 'Jacksonville Jaguars');
  assert.equal(home.odds, -400);
  assert.equal(home.eventId, 'vps-NFL:GAME:Jacksonville_Jaguars:Philadelphia_Eagles:1791725400');
  // Totals and props carry their line and period.
  assert.equal(total.length, 4);
  assert.equal(total[0].line, 42);
  const halfProp = prop.find(quote => quote.period === '1h' && quote.book === 'FanDuel');
  assert.equal(halfProp.market, 'Receptions');
  assert.equal(halfProp.player, 'Will Shipley');
  // Books translated: Hardrock → Hard Rock Bet, BallyBet → Bally Bet, DraftKings6 → DraftKings Pick6.
  assert.ok(nflMl.some(quote => quote.book === 'Hard Rock Bet'));
  assert.ok(nflMl.some(quote => quote.book === 'Bally Bet'));
  assert.ok(prop.some(quote => quote.book === 'DraftKings Pick6'));
  // (Alt) columns skipped.
  assert.ok(!prop.some(quote => quote.book.includes('(Alt)')));
  // UFC section's rows get dropped (no sport mapping) and counted as dropped.
  assert.ok(snapshot.dropped >= 1);
  assert.ok(!snapshot.quotes.some(quote => quote.sport === 'mma' || quote.sport === 'ufc'));
  // Price filter: an odds pair under 100 American would be dropped. The sample stays within range.
  assert.ok(snapshot.quotes.every(quote => Math.abs(quote.odds) >= 100));
});

test('buildVpsSnapshot rejects non-200 responses', async () => {
  const fetcher = async () => new Response('nope', { status: 503 });
  const config = { base: new URL('http://127.0.0.1:0') };
  await assert.rejects(buildVpsSnapshot(config, fetcher), /HTTP 503/);
});
