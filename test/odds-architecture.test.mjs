import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Who owns what (docs/odds-architecture.md): the odds service (lib/odds) prices the feed; the browser
// displays what /api/odds returns and runs calculators only on numbers a member enters. These checks keep
// the boundary from drifting back.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const browserModules = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.js'));
const importsOf = source => [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].map(([, names, from]) => ({ from: from.split('?')[0], names: names.split(',').map(part => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean) }));

test('the browser never loads the pricing engine or fetches odds except through the odds client', () => {
  for (const name of browserModules) {
    const source = read(`public/${name}`);
    assert.ok(!/from\s*['"][^'"]*\/lib\//.test(source), `${name} imports a server module`);
    if (name === 'odds-client.js') continue;
    assert.ok(!/['"`]\/api\/(ev|odds)\//.test(source), `${name} requests odds itself; it should use odds-client.js`);
    assert.ok(!/X-API-Key|EV_TOOL_API|ODDS_API_KEY/.test(source), `${name} mentions a server credential`);
  }
  for (const removed of ['ev-core.js', 'ev-advanced-math.js', 'ev-feed-worker.js', 'ev-feed-normalize.js', 'ev-event-match.js']) assert.equal(existsSync(new URL(`../public/${removed}`, import.meta.url)), false, removed);
});

// Pages that show feed prices display server values. The only formulas they may use are display conversions
// (decimal for sorting and formats) and calculators on a member's own numbers, each allowed here by name.
const FEED_PAGES = ['ev.js', 'ev-suite.js', 'odds-screen.js', 'home.js', 'ev-market-views.js', 'ev-ledger.js', 'ev-fantasy-lab.js', 'ev-operations.js', 'dfs-workspace.js', 'ev-board.js', 'odds-alerts.js', 'landing-live.js', 'line-history.js', 'ev-feed.js', 'ev-mobile.js'];
const PRICING = ['devig', 'fairFromAmerican', 'implied', 'probabilityToAmerican', 'kellyFraction', 'fractionalKellyStake', 'expectedReturn', 'expectedValue', 'computeAdvancedEv', 'consensusPrice', 'marketFairPrice', 'arbitrageRows', 'middleRows', 'holdRows', 'sharpMatches', 'analyzeSnapshot'];
const MEMBER_CALCULATORS = {
  'dfs-workspace.js': ['probabilityToAmerican'],      // fair odds of a DFS estimate the member typed
  'ev-board.js': ['expectedValue'],                    // the member's profit boost on a price
  'ev-suite.js': ['expectedReturn'],                   // a lineup projection the member supplied
  'ev-operations.js': ['kellyFraction'],               // the bankroll calculator's inputs
  'line-history.js': ['implied', 'probabilityToAmerican'], // the chart's implied-probability axis and average line
  'home.js': ['implied'],                              // the research panel: a book's posted price beside the model's chance
};
test('pages that show feed prices compute no fair values, EV, holds or arbitrage', () => {
  for (const page of FEED_PAGES) {
    const used = importsOf(read(`public/${page}`)).flatMap(entry => entry.names), allowed = MEMBER_CALCULATORS[page] || [];
    const pricing = used.filter(name => PRICING.includes(name) && !allowed.includes(name));
    assert.deepEqual(pricing, [], `${page} imports pricing: ${pricing.join(', ')}`);
  }
});

test('each formula has one implementation', () => {
  const sources = [...browserModules.map(name => [`public/${name}`, read(`public/${name}`)]),
    ...['lib/odds/engine.mjs', 'lib/odds/normalize.mjs', 'lib/odds/providers.mjs', 'lib/paper.mjs', 'lib/live-game-model.mjs', 'lib/game-simulation.mjs', 'lib/accounts/alert-mailer.mjs'].map(path => [path, read(path)])];
  const definitions = name => sources.filter(([, source]) => new RegExp(`(function\\s+${name}\\s*\\(|(const|let)\\s+${name}\\s*=)`).test(source)).map(([path]) => path);
  for (const [name, home] of [['devig', 'public/betting-math.js'], ['fairFromAmerican', 'public/betting-math.js'], ['constrainedArb', 'public/betting-math.js'], ['kellyFraction', 'public/betting-math.js'],
    ['breakEven', 'public/betting-math.js'], ['promoConversion', 'public/betting-math.js'], ['performanceSummary', 'public/betting-math.js'], ['decimalToAmerican', 'public/betting-math.js'],
    ['consensusPrice', 'lib/odds/engine.mjs'], ['computeAdvancedEv', 'lib/odds/engine.mjs'], ['marketFairPrice', 'lib/odds/engine.mjs'], ['arbitrageRows', 'lib/odds/engine.mjs'], ['quoteAvailable', 'lib/odds/engine.mjs'], ['marketIdentity', 'public/market-identity.js']]) {
    assert.deepEqual(definitions(name), [home], name);
  }
  // Hand-written American-odds conversions (1 + 100 / odds, 100 / (odds + 100), …) live only in betting-math.js.
  for (const [path, source] of sources) {
    if (path === 'public/betting-math.js') continue;
    assert.ok(!/1\s*\+\s*100\s*\/\s*(-|Math\.abs)|100\s*\/\s*\(\s*\w+\s*\+\s*100\s*\)|-100\s*\/\s*\(\s*\w+\s*-\s*1\s*\)/.test(source), `${path} converts odds by hand`);
  }
});

test('the contract types, the runtime validation and the server agree on one contract id and the sections', async () => {
  const contract = read('lib/odds/contract.d.ts'), { CONTRACT_ID, SECTIONS } = await import('../public/odds-contract.js');
  assert.match(contract, new RegExp(`ContractId = '${CONTRACT_ID.replace('.', '\\.')}'`));
  for (const section of SECTIONS) assert.match(contract, new RegExp(`'${section}'`), section);
  const server = read('server.mjs');
  for (const file of ['odds-client.js', 'odds-contract.js', 'betting-math.js', 'market-identity.js', 'odds-format.js', 'odds-alerts.js', 'sport-names.js']) assert.ok(server.includes(`'${file}'`), `${file} is served`);
  assert.ok(!/'ev-core\.js'|'ev-advanced-math\.js'|'ev-feed-worker\.js'/.test(server), 'removed modules are not served');
  assert.match(read('vercel.json'), /lib\/odds/, 'the engine thread file ships with the function');
});
