import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { SITE_PLATFORMS, SMARTSTAKE_BOOK_COUNT, SMARTSTAKE_SPORTSBOOK_PLATFORMS, SPORTSBOOK_PLATFORMS, FANTASY_PLATFORMS, PREDICTION_PLATFORMS, canonicalPlatform, findPlatform, platformAsset, detectPlatform, platformOptions } from '../public/platform-catalog.js';
import { inlineBookMark } from '../public/bet-inline.js';
import { parseBetSlip } from '../public/bet-slip-parser.js';
import { sportsbookAvailable, sportsbookStatus } from '../public/sportsbook-availability.js';
import { createDfsWorkspace } from '../public/dfs-workspace.js';
import { dfsPreview } from './fixtures/dfs-props.mjs';
import { validateBet, readBets, writeBets } from '../public/bet-utils.js';

test('every requested site has an entry option, comparison logo, receipt identity and local asset', async () => {
  assert.equal(SITE_PLATFORMS.length,29);
  assert.equal(SPORTSBOOK_PLATFORMS.length,11);
  assert.equal(PREDICTION_PLATFORMS.length,6);
  const choices = platformOptions();
  for (const item of SITE_PLATFORMS) {
    assert.ok(choices.includes(`value="${item.name}"`),item.name);
    assert.ok(inlineBookMark(item.label).includes(item.asset),item.label);
    assert.equal(parseBetSlip(`${item.label}\nStake: $10`).fields.book,item.name);
    await access(new URL(`../public${item.asset}`,import.meta.url));
  }
  for (const deferred of ['betPARX','Circa Sports','SuperBook Sports','Betly']) assert.equal(findPlatform(deferred),null);
});

test('aliases keep fantasy products separate and map legacy sportsbook names to state coverage', () => {
  assert.equal(canonicalPlatform(' ESPN BET '),'theScore Bet');
  assert.equal(canonicalPlatform('theScore Bet (formerly ESPN BET)'),'theScore Bet');
  assert.equal(platformAsset('ESPN BET (example)'),platformAsset('theScore Bet'));
  assert.equal(detectPlatform('DraftKings Fantasy\nDraftKings'),'DraftKings Fantasy');
  assert.equal(detectPlatform('FanDuel Fantasy\nFanDuel'),'FanDuel Fantasy');
  assert.equal(sportsbookStatus('DraftKings Sportsbook','AZ'),'available');
  assert.equal(sportsbookStatus('ESPN BET','AZ'),'available');
  assert.equal(sportsbookStatus('DraftKings Fantasy','AZ'),'unverified');
  assert.equal(sportsbookStatus('Kalshi','AZ'),'unverified');
  assert.equal(canonicalPlatform('My custom platform'),'My custom platform');
});

test('relayed sportsbooks remain native and unverified coverage stays selectable', () => {
  assert.equal(SMARTSTAKE_SPORTSBOOK_PLATFORMS.length, SMARTSTAKE_BOOK_COUNT - 1);
  assert.ok(SMARTSTAKE_SPORTSBOOK_PLATFORMS.includes('888sport'));
  assert.ok(SMARTSTAKE_SPORTSBOOK_PLATFORMS.includes('bet99'));
  assert.ok(SMARTSTAKE_SPORTSBOOK_PLATFORMS.includes('sportzino'));
  assert.ok(!SMARTSTAKE_SPORTSBOOK_PLATFORMS.includes('smartstake'));
  assert.equal(sportsbookStatus('888sport','AZ'),'unverified');
  assert.equal(sportsbookAvailable('888sport','AZ'),true);
});

test('platform identities survive tracker validation, save and reload', () => {
  const values = new Map();
  const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const bets = SITE_PLATFORMS.map((item,i) => ({...validateBet({book:item.label,selection:'Manual entry',sport:'Other',type:'single',date:'2026-09-25',stake:10,oddsFormat:'decimal',odds:2,status:'open'}),id:`platform-${i}`,updatedAt:'2026-09-25T12:00:00Z'}));
  writeBets(storage,bets);
  assert.deepEqual(readBets(storage).map(item=>item.book),SITE_PLATFORMS.map(item=>item.name));
});

test('all fantasy apps render manual research; contest DFS has no invented pick’em payouts', () => {
  for (const app of FANTASY_PLATFORMS) {
    const state = {dfs:[{id:'research',app,sport:'NFL',event:'Test',player:'Test Player',market:'Yards',line:10.5,side:'Over',probability:.5}],paytables:{},quotes:[]};
    const view = createDfsWorkspace({getState:()=>state,redraw:()=>{}});
    const html = view.render();
    assert.ok(html.includes(`<option selected>${app}</option>`),app);
    assert.match(html,/Test Player/);
    if (app === 'DraftKings Fantasy' || app === 'FanDuel Fantasy') {
      assert.deepEqual(dfsPreview(app),[]);
      assert.match(html,/Contest payouts use standings/);
      assert.doesNotMatch(html,/Full-hit payout|Expected profit/);
    }
  }
});
