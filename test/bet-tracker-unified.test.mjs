import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { BET_STORAGE_KEY, readBets, writeBets, validateBet, betReturns } from '../public/bet-utils.js';
import { LEGACY_EV_STORAGE_KEY, migrateLegacyTracker } from '../public/bet-tracker-migration.js';
import { betTrackerUrl, legacyBetTrackerUrl, sportDestination } from '../public/navigation.js';
import { siteHeader, renderSitePage } from '../lib/site-layout.mjs';

const legacyBet = (overrides = {}) => ({ id:'legacy-1', sport:'MLB', date:'2026-09-25', selection:'Away team +1.5', book:'DraftKings', stake:25, odds:115, closeOdds:105, result:'win', source:'manual', ...overrides });
function fixture(records = []) {
  const data = new Map([[LEGACY_EV_STORAGE_KEY, JSON.stringify({ version:1, bets:records, quotes:[{id:'keep-me'}] })]]);
  return { data, getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value) };
}

test('legacy bets join existing tickets once, preserving settlement, closing odds and original workspace', () => {
  const storage=fixture([legacyBet(),legacyBet({id:'loss',result:'loss'}),legacyBet({id:'demo',source:'example'})]);
  const original=storage.getItem(LEGACY_EV_STORAGE_KEY);
  const existing={...validateBet({...legacyBet(),oddsFormat:'american',type:'single',status:'open'}),id:'current-1',updatedAt:'2026-09-25T12:00:00Z'};
  writeBets(storage,[existing]);
  assert.deepEqual(migrateLegacyTracker(storage),{migrated:2,skipped:0});
  const bets=readBets(storage);
  assert.equal(bets.length,3);
  assert.deepEqual(bets[0],existing);
  assert.equal(bets[1].status,'won');
  assert.equal(betReturns(bets[1]).profit,28.75);
  assert.equal(bets[1].closingOdds,105);
  assert.equal(bets[2].status,'lost');
  assert.equal(storage.getItem(LEGACY_EV_STORAGE_KEY),original);
  assert.deepEqual(migrateLegacyTracker(storage),{migrated:0,skipped:0});
  writeBets(storage,[existing]); // A later user deletion must not resurrect imported tickets.
  assert.deepEqual(migrateLegacyTracker(storage),{migrated:0,skipped:0});
  assert.equal(readBets(storage).length,1);
});

test('invalid records remain recoverable and storage failure is atomic and retryable', () => {
  const storage=fixture([legacyBet(),legacyBet({id:'invalid',stake:-1})]);
  const original=storage.getItem(LEGACY_EV_STORAGE_KEY);
  assert.throws(()=>migrateLegacyTracker({...storage,setItem(){throw Error('Quota');}}),/Quota/);
  assert.equal(storage.getItem(BET_STORAGE_KEY),null);
  assert.equal(storage.getItem(LEGACY_EV_STORAGE_KEY),original);
  assert.deepEqual(migrateLegacyTracker(storage),{migrated:1,skipped:1});
  assert.equal(storage.getItem(LEGACY_EV_STORAGE_KEY),original);
  storage.setItem(BET_STORAGE_KEY,'{unreadable');
  assert.throws(()=>migrateLegacyTracker(storage));
  assert.equal(storage.getItem(BET_STORAGE_KEY),'{unreadable');
});

test('dashboard and EV navigation share one tracker route and retain sport context', async () => {
  const template=await fs.readFile(new URL('../public/bets.html',import.meta.url),'utf8');
  for(const sport of ['nfl','mlb','nba','wnba','nhl','soccer']) {
    const destination=betTrackerUrl(sport);
    assert.equal(sportDestination(sport,'bets'),destination);
    const dashboard=load(siteHeader(new URL('https://sportslab.local/'+sport)));
    const ev=load(siteHeader(new URL('https://sportslab.local/ev?sport='+sport)));
    assert.equal(dashboard('.site-product-menu [data-product=ev]').attr('href'),'/ev/dashboard?sport='+sport);
    const overview=load(siteHeader(new URL('https://sportslab.local/ev/dashboard?sport='+sport)));
    assert.equal(overview(`.dashboard-primary-link[href="${destination}"]`).length,1);
    assert.equal(ev(`.dashboard-primary-link[href="${destination}"]`).length,1);
    const tracker=load(renderSitePage(template,new URL(destination,'https://sportslab.local')));
    assert.equal(tracker('.dashboard-primary-nav [aria-current="page"]').text().trim(),'Bet Tracker');
    assert.equal(tracker('body.bets-app.ev-page').length,1);
    assert.equal(tracker('#bet-overview').length,1);
    assert.equal(tracker('#ev-view').length,0);
    assert.equal(tracker('script[src^="/ev.js"]').length,0);
    assert.equal(tracker('.site-tracker').length,0);
  }
  for(const route of ['/bets','/bets/','/bets.html','/ev#tracker']) {
    const url=new URL(route,'https://sportslab.local');url.search='?sport=mlb&test=preserve';
    assert.equal(legacyBetTrackerUrl(url),'/ev/tracker?sport=mlb&test=preserve');
  }
  assert.equal(legacyBetTrackerUrl(new URL('https://sportslab.local/ev#fantasy')),null);
  assert.equal(legacyBetTrackerUrl(new URL('https://sportslab.local/ev/tracker?sport=mlb')),null);
});
