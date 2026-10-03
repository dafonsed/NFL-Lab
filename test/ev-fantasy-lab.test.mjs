import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createEvFantasyLab } from '../public/ev-fantasy-lab.js';

// Feed lines as the DFS pricer sends them: fair probability from sportsbooks at the exact line.
const now = Date.now(), observed = new Date(now - 60_000).toISOString(), kickoff = new Date(now + 86_400_000).toISOString();
const line = (id, extra) => ({id, app:'PrizePicks', sport:'NFL', event:`${id} @ X`, eventId:`NFL:${id} @ x`, player:`Player ${id}`, market:'Receiving Yards', line:40.5, side:'Over', oddsType:'standard', probabilityBooks:['DraftKings'], probabilityMethod:'multiplicative', bookLines:[{book:'DraftKings',over:-120,under:100}], ts:observed, startTime:kickoff, live:false, source:'local-api', ...extra});

// The lab's handlers expect DOM elements; these stubs stand in for the clicked control.
function lab(t, dfs, fantasyLab = {}) {
  const saved = {Element:globalThis.Element, document:globalThis.document, requestAnimationFrame:globalThis.requestAnimationFrame};
  class Control { constructor(dataset, extra = {}) { this.dataset = dataset; Object.assign(this, extra); } closest(selector) { return selector === '[data-evf-action]' && this.dataset.evfAction ? this : null; } }
  globalThis.Element = Control; globalThis.document = {querySelector:()=>null}; globalThis.requestAnimationFrame = () => {};
  t.after(() => { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  const root = {dfs, quotes:[], history:[], paytables:{}, suite:{fantasyLab}};
  const view = createEvFantasyLab({getState:()=>root, save:()=>{}, redraw:()=>{}, navigate:()=>{}});
  const act = (action, id = '') => view.handleEvent({type:'click', target:new Control({evfAction:action, evfId:id}), preventDefault(){}});
  const pick = id => { const target = new Control({evfPick:id}, {checked:true}); view.handleEvent({type:'change', target}); return target; };
  return {view, root, act, pick, html:() => load(view.render())};
}
const builder = $ => $('.evf-panel').filter((_, el) => $(el).find('h3').text() === 'Fantasy slip builder');

test('the optimizer leaves out goblin/demon lines without a multiplier and part-game lines, and scales the table by known multipliers', t => {
  const dfs = [line('g', {oddsType:'goblin', line:.5, probability:.9}), line('part', {period:'part', probability:.95}), line('a', {probability:.6}), line('b', {probability:.58}), line('c', {probability:.56}), line('d', {oddsType:'demon', payoutMultiplier:1.5, probability:.45})];
  const {root, act, html} = lab(t, dfs, {tables:[{id:'t2', app:'PrizePicks', name:'Power 2', size:2, rules:[0,0,3], kind:'fixed'}], builder:{stake:10, tableId:'t2', manualDistribution:'', link:''}});
  act('optimize');
  let $ = html();
  assert.match($('[data-evf-feedback]').text(), /from 4 filtered picks\. Left out 1 goblin\/demon line without a payout multiplier in the feed and 1 part-game line/);
  const rows = builder($).find('table').last().find('tbody tr');
  // Demon 0.45 × 1.5 = 0.675 per leg beats every standard line: 0.45 × 0.6 × 3 × 1.5 = 1.215.
  assert.match(rows.first().text(), /Player d Over 40\.5.*Player a Over 40\.5.*1\.215×.*21\.50%/s);
  assert.doesNotMatch(rows.text(), /Player g|Player part/);
  act('use-suggestion', '0');
  assert.deepEqual([...root.suite.fantasyLab.selected].sort(), ['a', 'd']);
  $ = html();
  assert.match(builder($).find('.evf-metrics').text(), /Slip EV21\.50%/);
  assert.equal(builder($).find('table').first().find('tbody tr').last().find('td').last().text(), '4.5×', 'the 3x row shows the scaled 4.5x');
  act('save-slip');
  assert.deepEqual(root.suite.fantasyLab.slips[0].paytable, [0, 0, 4.5]);
  assert.equal(root.suite.fantasyLab.slips[0].payoutFactor, 1.5);
});

test('a slip with a goblin or demon that has no multiplier is not priced, and part-game lines can\'t be selected', t => {
  const dfs = [line('g', {oddsType:'goblin', line:.5, probability:.9}), line('a', {probability:.6}), line('part', {period:'part'})];
  const {root, pick, html} = lab(t, dfs, {tables:[{id:'t2', app:'PrizePicks', name:'Power 2', size:2, rules:[0,0,3], kind:'fixed'}], builder:{stake:10, tableId:'t2', manualDistribution:'', link:''}});
  pick('g'); pick('a');
  let $ = html();
  assert.equal(builder($).find('.evf-metrics').length, 0, 'no slip EV from the standard table');
  assert.match(builder($).text(), /Goblin and demon picks change the payout; the feed sent no multiplier for Player g Over 0\.5\./);
  const target = pick('part');
  assert.equal(target.checked, false);
  assert.ok(!root.suite.fantasyLab.selected.includes('part'));
  $ = html();
  assert.equal($('[data-evf-feedback]').text(), 'Part-game lines can’t be priced; the feed doesn’t say which period this is.');
});

test('Fantasy watches fire once per feed line whose edge vs the leg break-even clears the threshold', t => {
  const dfs = [line('s1', {probability:.58}), line('s2', {probability:.55}), line('g1', {oddsType:'goblin', line:.5, probability:.75}), line('g2', {oddsType:'goblin', payoutMultiplier:.7, probability:.8}), line('part', {period:'part', probability:.7}), line('push', {line:40, probability:.7})];
  const {root, view} = lab(t, dfs);
  // No chosen table: PrizePicks' published 3-pick 6x, break-even 6^(-1/3) = 55.03%.
  let alerts = view.alertCandidates({threshold:1});
  assert.deepEqual(alerts.map(a => a.id), ['s1', 'g2']);
  assert.equal(alerts[0].key, 'fantasy:s1');
  assert.equal(alerts[0].text, 'PrizePicks: Player s1 Over 40.5 Receiving Yards · fair 58.00% · edge +2.97% vs 55.03% break-even (PrizePicks 3-pick 6×)');
  // Goblin ×0.7: break-even 55.03% / 0.7 = 78.62%, edge +1.38.
  assert.match(alerts[1].text, /fair 80\.00% · edge \+1\.38% vs 78\.62% break-even \(PrizePicks 3-pick 6×, goblin ×0\.7\)/);
  assert.deepEqual(view.alertCandidates({threshold:2}).map(a => a.id), ['s1']);
  root.dfs = root.dfs.map(p => p.id === 's1' ? {...p, ts:new Date(now - 30_000).toISOString()} : p);
  assert.equal(view.alertCandidates({threshold:2})[0].key, 'fantasy:s1', 'a refreshed observation keeps its key');
  // The builder's chosen table for this app sets the break-even: 2-pick 3x needs 57.74%.
  root.suite.fantasyLab.tables = [{id:'t2', app:'PrizePicks', name:'Power 2', size:2, rules:[0,0,3], kind:'fixed'}];
  root.suite.fantasyLab.builder = {stake:10, tableId:'t2', manualDistribution:'', link:''};
  alerts = view.alertCandidates({threshold:0});
  assert.deepEqual(alerts.map(a => a.id), ['s1']);
  assert.match(alerts[0].text, /edge \+0\.26% vs 57\.74% break-even \(PrizePicks Power 2\)/);
});

test('the board shows a feed line\'s edge vs its leg break-even when no per-pick return is supplied', t => {
  const {html} = lab(t, [line('s1', {probability:.58}), line('g1', {oddsType:'goblin', line:.5, probability:.75})]);
  const $ = html(), row = id => $('.evf-table').first().find('tbody tr').filter((_, tr) => $(tr).text().includes(`Player ${id}`));
  assert.match(row('s1').text(), /\+2\.97%Edge vs leg break-even55\.03%PrizePicks 3-pick 6×/);
  assert.match(row('g1').text(), /Goblin: payout multiplier not in the feed/);
});
