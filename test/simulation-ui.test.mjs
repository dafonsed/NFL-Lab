import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {requestData} from '../public/product-ui.js';
import { simulateGame } from '../lib/game-simulation.mjs';
import {teamMark} from '../public/sports-identity.js';
import {icon} from '../public/ui-icons.js';

// Execute the actual browser controller with deferred HTTP responses, including
// responses delivered after abort. No network or model-archive writes.
const source = (await fs.readFile(new URL('../public/simulation.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '');
function harness() {
  const elements = new Map(), requests = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: id === 'sim-date' ? '2025-03-01' : id === 'sim-game' ? 'target' : '', disabled: false, valid: true, innerHTML: id === 'sim-results' ? 'empty' : '', listeners: {}, attributes: {},
      get selectedOptions() { const options=[...this.innerHTML.matchAll(/value="([^"]+)"[^>]*>([^<]+)<\/option>/g)];const selected=options.find(option=>option[1]===this.value)||options[0];return selected?[{textContent:selected[2]}]:[]; },
      querySelectorAll() { return []; }, classList: { toggle() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(k, v) { this.attributes[k] = v; }, checkValidity() { return this.valid; }, reportValidity() { return this.valid; } });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { getElementById: get, querySelector: () => ({ dataset: { siteSport: 'nba' } }) },
    setTimeout:(fn,ms)=>setTimeout(fn,ms).unref(),clearTimeout,
    mountSimulationProps: () => () => {}, icon, teamMark, location: { search: '?date=2025-03-01' }, URLSearchParams, AbortController,
    FormData: class { *[Symbol.iterator]() { yield ['date', get('sim-date').value]; yield ['game', get('sim-game').value]; yield ['simulations', '1000']; yield ['seed', 'ui']; } },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve: body => resolve({ ok: true, json: async () => body }), reject })),
  });
  vm.runInContext(requestData.toString()+'\n'+source, context);
  return { get, requests, call: code => vm.runInContext(code, context), fire: (id, type) => get(id).listeners[type]({ preventDefault() {} }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const catalog = stale => ({ date: '2025-03-01', stale, events: [{ id: 'target', state: 'pre', teams: [{ homeAway: 'away', name: 'A' }, { homeAway: 'home', name: 'B' }] }] });
function result() {
  return simulateGame({ sport: 'nba', game: { id: 'target', date: '2025-03-02T03:00:00Z', officialDate: '2025-03-01', state: 'pre', neutralSite: false,
    teams: [{ id: 'A', abbreviation: 'A', homeAway: 'away' }, { id: 'B', abbreviation: 'B', homeAway: 'home' }] },
    history: Array.from({ length: 10 }, (_, i) => ({ id: String(i), date: `2025-02-${10 + i}`, home: 'B', away: 'A', complete: true, homeScore: 110, awayScore: 100,
      regulation: { homeScore: 110, awayScore: 100, method: 'synthetic fixture' } })), simulations: 1000, seed: 'ui' });
}
test('result header uses schedule cutoff instead of a late-game UTC date', () => {
  const h = harness(); h.call('render')(result());
  assert.match(h.get('sim-results').innerHTML, /1,000 runs <i>·<\/i> 2025-03-01/);
  assert.doesNotMatch(h.get('sim-results').innerHTML, /runs <i>·<\/i> 2025-03-02/);
});
test('invalid date clears old results and blocks late in-flight responses', async () => {
  const h = harness(); h.requests[0].resolve(catalog(false)); await flush();
  const pending = h.fire('simulation-form', 'submit'); h.get('sim-results').innerHTML = 'old result';
  h.get('sim-date').value = ''; h.get('sim-date').valid = false; h.fire('sim-date', 'input');
  assert.equal(h.get('sim-results').innerHTML, 'empty'); assert.equal(h.get('sim-run').disabled, true); assert.equal(h.requests[1].signal.aborted, true);
  h.requests[1].resolve(result()); await pending;
  assert.equal(h.get('sim-results').innerHTML, 'empty'); assert.equal(h.get('sim-run').disabled, true);
});
test('seed and count edits neither cancel a pending catalog nor enable stale schedules', async () => {
  const h = harness(); h.fire('sim-seed', 'input'); assert.equal(h.requests[0].signal.aborted, false);
  h.requests[0].resolve(catalog(true)); await flush();
  for (const id of ['sim-count', 'sim-seed']) { h.fire(id, 'input'); assert.equal(h.get('sim-run').disabled, true); }
});
test('older catalog errors cannot replace newer successful selections', async () => {
  const h = harness(); const pending = h.call("catalog('2025-03-02')");
  h.requests[1].resolve(catalog(false)); await pending;
  h.requests[0].reject(Error('old network error')); await flush();
  assert.doesNotMatch(h.get('sim-status').textContent, /old network error/); assert.equal(h.get('sim-run').disabled, false);
});
test('count and seed changes discard earlier run responses', async () => {
  for (const id of ['sim-count', 'sim-seed']) {
    const h = harness(); h.requests[0].resolve(catalog(false)); await flush();
    const pending = h.fire('simulation-form', 'submit'); h.fire(id, 'input');
    h.requests[1].resolve(result()); await pending;
    assert.match(h.get('sim-matchup-preview').innerHTML, /<strong>A<\/strong>/);assert.match(h.get('sim-matchup-preview').innerHTML, /<strong>B<\/strong>/);assert.doesNotMatch(h.get('sim-results').innerHTML,/sim-outcome|Loading matchups/);assert.equal(h.get('sim-run').disabled, false);
  }
});
test('doubleheader options include distinct start times while keeping game IDs', async () => {
  const h = harness(), data = catalog(false), first = { ...data.events[0], id: 'game-one', date: '2026-09-22T17:05:00Z' };
  const second = { ...first, id: 'game-two', date: '2026-09-22T23:05:00Z' };
  h.requests[0].resolve({ ...data, events: [first, second] }); await flush();
  const options = [...h.get('sim-game').innerHTML.matchAll(/value="([^"]+)">([^<]+)</g)];
  assert.equal(options[0][1], 'game-one'); assert.equal(options[1][1], 'game-two');
  assert.notEqual(options[0][2], options[1][2]); assert.match(options[0][2], /Sep/);
});
test('visible schedule retry recovers from a failed catalog', async () => {
  const h = harness(); h.requests[0].reject(Error('schedule offline')); await flush();
  assert.equal(h.get('sim-retry').hidden, false); assert.equal(h.get('sim-run').disabled, true);
  const pending = h.fire('sim-retry', 'click'); h.requests[1].resolve(catalog(false)); await pending;
  assert.equal(h.get('sim-retry').hidden, true); assert.equal(h.get('sim-run').disabled, false);
});

test('unavailable simulation resolves the running state and permits a retry', async () => {
  const h=harness();h.requests[0].resolve(catalog(false));await flush();
  const pending=h.fire('simulation-form','submit');
  h.requests[1].resolve({status:'unavailable',warnings:['Earlier scoring history is missing.']});await pending;
  assert.match(h.get('sim-results').innerHTML,/Simulation unavailable/);
  assert.match(h.get('sim-results').innerHTML,/Earlier scoring history is missing/);
  assert.doesNotMatch(h.get('sim-results').innerHTML,/Running the matchup/);
  assert.equal(h.get('sim-results').attributes['aria-busy'],'false');
  assert.equal(h.get('sim-run').disabled,false);
});

test('changing the matchup shows the selected game instead of leaving a loading placeholder', async () => {
  const h=harness(), data=catalog(false);
  h.requests[0].resolve({...data,events:[...data.events,{id:'other',state:'pre',teams:[{homeAway:'away',name:'C'},{homeAway:'home',name:'D'}]}]});await flush();
  h.get('sim-game').value='other';h.fire('sim-game','change');
  assert.match(h.get('sim-matchup-preview').innerHTML, /<strong>C<\/strong>/);assert.match(h.get('sim-matchup-preview').innerHTML, /<strong>D<\/strong>/);assert.doesNotMatch(h.get('sim-results').innerHTML,/Loading matchups|A at B/);assert.equal(h.get('sim-run').disabled,false);
});
