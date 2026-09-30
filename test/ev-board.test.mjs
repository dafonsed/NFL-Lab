import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEvBoard, renderEvBoardDetail, boostedOffer, selectionText } from '../public/ev-board.js';

const quote = (extra = {}) => ({ id:'q1', sport:'NFL', league:'NFL', event:'Arizona vs Seattle', market:'Game total', type:'total', line:47.5, side:'Over', book:'FanDuel', odds:140, live:false, ts:new Date().toISOString(), ...extra });
const detail = () => ({
  fairOdds:'+103', vig:'0.9%', canEdit:true,
  columns:[{ name:'FanDuel' }, { name:'DraftKings' }, { name:'BetMGM' }],
  rows:[
    { side:'Over', selection:'Over 47.5', best:'+140', average:'-103', bestMark:'', prices:[{ raw:140, value:'+140', best:true }, { raw:120, value:'+120' }, { raw:-112, value:'-112' }] },
    { side:'Under', selection:'Under 47.5', best:'-102', average:'-116', bestMark:'', prices:[{ raw:-145, value:'-145' }, { raw:-102, value:'-102', best:true }, { raw:-108, value:'-108' }] }
  ]
});
const context = (rows, extra = {}) => ({ rows, live:false, sort:'ev', openId:'', oddsLabel:value => (value > 0 ? '+' : '') + Math.round(value), age:() => 'Just now', stake:() => 160.99, kellyLabel:'¼ Kelly', flags:() => ({}), detail, ...extra });

test('each opportunity row shows edge, bet, price, fair value, probability and stake', () => {
  const html = renderEvBoard(context([{ quote:quote(), fair:.492, ev:.1803 }]));
  assert.match(html, /18\.03%/);
  assert.match(html, /Over 47\.5/);
  assert.match(html, /FanDuel/);
  assert.match(html, /\+140/);
  assert.match(html, /Fair \+103/);
  assert.match(html, /49\.2%/);
  assert.match(html, /\$160\.99/);
  assert.match(html, /data-sort="ev" class="evb-sort is-active"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /evb-detail-row/, 'the price grid stays closed until requested');
});

test('an open row renders the shared bet panel with the selected side and best prices', () => {
  const html = renderEvBoard(context([{ quote:quote(), fair:.492, ev:.1803 }], { openId:'q1' }));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /evb-detail-row evd-row/);
  assert.match(html, /<tr class="is-selected"><th scope="row">Over 47\.5<\/th>/, 'the offered side is highlighted');
  assert.match(html, /<td class="is-best"><strong>\+140<\/strong>/, 'the best price is marked');
  assert.match(html, /<td class=""><strong>\+120<\/strong>/, 'other prices stay neutral');
  assert.match(html, /class="evd-average">-103</, 'average odds per side');
  assert.match(html, /data-evb-boost="q1" data-odds="140" data-fair="0\.492"/, 'the boost field carries the offer and fair value');
  assert.match(html, /data-evb-analysis="q1"/);
  assert.match(html, /data-suite-action="track" data-id="q1"/);
  assert.doesNotMatch(html, /evd-add|data-add="quote"/, 'prices come only from the quote API, so there is no add-price column');
});

test('boosted offers recompute the price and EV', () => {
  const offer = boostedOffer(100, .5, 50);
  assert.equal(offer.american, 150);
  assert.equal(offer.ev.toFixed(4), '0.2500');
  assert.equal(boostedOffer(100, .5, 0), null);
  assert.equal(boostedOffer('x', .5, 10), null);
});

test('missing fair value keeps the boost preview without an EV', () => {
  const offer = boostedOffer(-110, NaN, 20);
  assert.ok(offer.american > 100 / 1.1 && Number.isNaN(offer.ev));
  const html = renderEvBoardDetail(context([]), quote(), NaN);
  assert.match(html, /data-fair="NaN"/);
});

test('spread selections show a signed positive line and props include the player', () => {
  assert.equal(selectionText(quote({ type:'spread', side:'Seattle', line:3.5 })), 'Seattle +3.5');
  assert.equal(selectionText(quote({ type:'prop', player:'Kyler Murray', side:'Over', line:249.5 })), 'Kyler Murray Over 249.5');
});
