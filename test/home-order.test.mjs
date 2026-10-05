import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { sortProfiles } from '../public/player-order.js';
import { finite, selectGames, summarize, recentChange } from '../public/research-data.js';
import { isCurrent } from '../public/odds-contract.js';
import { implied } from '../public/betting-math.js';
import { permanentDemoWorkspace } from './fixtures/ev-preview.js';
import { priced } from './helpers/priced.mjs';

// Exercise the dashboard's real ranking helpers (the pure block in home.js),
// without the DOM and request code around them.
async function helpers() {
  const source = await readFile(new URL('../public/home.js', import.meta.url), 'utf8');
  const block = source.match(/\/\/ <dashboard-data>[^\n]*\n([\s\S]*?)\/\/ <\/dashboard-data>/)?.[1];
  assert.ok(block, 'home.js keeps its pure dashboard-data block');
  const context = vm.createContext({ Intl, Date, Math, Number, String, Set, Map, finite, selectGames, summarize, recentChange, sortProfiles, isCurrent, implied });
  vm.runInContext(block + '\nglobalThis.api = { greeting, topPicks, hotTrends, topEvRows, evSelection, evSummary, normalizeGames, orderGames, americanOdds, dashboardEvRows };', context);
  return context.api;
}

const plain = value => JSON.parse(JSON.stringify(value)); // vm arrays belong to another realm
const profile = (i, extra = {}) => ({ key: 'mlb:g:' + i, name: 'Player ' + i, playerId: i, gameId: 'g', sport: 'mlb', market: 'hits', label: 'Hits', team: 'SEA', opponent: 'NYY', rows: [], forecast: { point: i, probability: { over: i / 40, under: 1 - i / 40 } }, ...extra });

test('best picks rank the entire pool by over chance before taking the top five', async () => {
  const { topPicks } = await helpers();
  const pool = Array.from({ length: 36 }, (_, i) => profile(i, { prop: { line: .5, bookmaker: 'FanDuel', prices: { over: { american: -150 } } } }));
  const picks = topPicks(pool.reverse(), 5);
  assert.deepEqual(plain(picks.map(p => p.profile.playerId)), [35, 34, 33, 32, 31]);
  assert.equal(picks[0].odds, -150);
  assert.ok(Math.abs(picks[0].implied - .6) < 1e-9);
  // Players with a posted line lead; unavailable players are excluded.
  const mixed = [profile(39), profile(20, { prop: { line: .5 } }), profile(38, { availability: { unavailable: true }, prop: { line: .5 } })];
  assert.deepEqual(plain(topPicks(mixed, 5).map(p => p.profile.playerId)), [20, 39]);
});

test('hot trends use the last ten games at the posted line and need five games', async () => {
  const { hotTrends } = await helpers();
  const games = values => values.map((value, i) => ({ value, date: `2026-09-${String(20 - i).padStart(2, '0')}` }));
  const hot = profile(1, { prop: { line: .5 }, rows: games([1, 2, 1, 1, 0, 1, 1, 1, 2, 1, 0, 0]) });
  const cold = profile(2, { prop: { line: .5 }, rows: games([0, 0, 1, 0, 0, 1, 0, 0, 0, 0]) });
  const short = profile(3, { prop: { line: .5 }, rows: games([1, 1, 1]) });
  const rows = hotTrends([cold, short, hot], 5);
  assert.deepEqual(plain(rows.map(r => r.profile.playerId)), [1, 2]);
  assert.equal(rows[0].hits, 9); assert.equal(rows[0].n, 10); assert.equal(rows[0].games.length, 10);
  // Without posted lines, the panel falls back to recent production movers.
  const movers = hotTrends([profile(4, { rows: games([3, 3, 3, 3, 3, 1, 1, 1, 1, 1]) })], 5);
  assert.equal(movers[0].kind, 'mover'); assert.equal(movers[0].change, 2);
});

test('+EV preview shows positive pregame prices and varies books', async () => {
  const { topEvRows, evSummary, evSelection } = await helpers();
  // The +EV rows as /api/odds/ev serves them, priced at the fixture's time.
  const at = Date.parse('2026-09-29T16:00:00Z'), quotes = permanentDemoWorkspace(null, at).quotes.filter(q => q.sport === 'MLB');
  const { snapshot } = priced(quotes, { settings: { pregameMaxAgeSeconds: 86400 }, now: at });
  const rows = snapshot.pricing.map(row => ({ quote: snapshot.quotes.find(quote => quote.id === row.quoteId), ev: row.ev, fair: row.fairProbability }));
  const top = topEvRows(rows, 5), summary = evSummary(rows);
  assert.equal(top.length, 5);
  assert.ok(top.every(r => r.ev > 0 && !r.quote.live));
  assert.ok(top.every((r, i) => !i || top[i - 1].ev >= r.ev), 'sorted by EV');
  assert.ok(new Set(top.map(r => r.quote.book)).size >= 4, 'books vary');
  assert.equal(summary.best, Math.max(...rows.filter(r => !r.quote.live).map(r => r.ev)));
  assert.match(evSelection(top[0].quote).title, /^(Aaron Judge|Shohei Ohtani|Bryce Harper) (Over|Under) 1\.5$/);
});

test('+EV preview rows are titled with the selection and event, never a side code', async () => {
  const { evSelection } = await helpers();
  const base = { event: 'Indianapolis Colts @ Washington Commanders', displayEvent: 'Colts @ Commanders', sport: 'NFL' };
  assert.deepEqual(plain(evSelection({ ...base, type: 'moneyline', side: 'home', selection: 'Washington Commanders', line: '', market: 'moneyline', displayMarket: 'Moneyline' })),
    { title: 'Washington Commanders', detail: 'Moneyline', event: 'Colts @ Commanders' });
  assert.equal(evSelection({ ...base, type: 'spread', side: 'away', selection: 'Indianapolis Colts', line: 3.5 }).title, 'Indianapolis Colts +3.5');
  assert.equal(evSelection({ ...base, type: 'prop', side: 'over', selection: 'Over', player: 'Josh Downs', line: 52.5, displayMarket: 'Receiving Yards' }).title, 'Josh Downs Over 52.5');
});

test('+EV preview hides what the Positive EV page hides: feed-error EV, one-sided game lines, books outside the state', async () => {
  const { dashboardEvRows } = await helpers();
  const now = Date.now(), ts = new Date(now - 60_000).toISOString(), startTime = new Date(now + 86_400_000).toISOString();
  const quote = (book, side, odds) => ({ id: book + side, sport: 'NFL', event: 'A @ B', eventId: 'a@b', market: 'moneyline', marketId: 'moneyline|a@b', type: 'moneyline', side, book, odds, ts, startTime, source: 'local-api' });
  // DraftKings' -110 / -110 coin flip is the only reference. FanDuel's +300 is +100% EV, a feed error rather
  // than a bet; BetMGM's +104 is +4%; Caesars posts +104 without its other side.
  const quotes = [quote('DraftKings', 'home', -110), quote('DraftKings', 'away', -110), quote('FanDuel', 'home', 300), quote('FanDuel', 'away', -450),
    quote('BetMGM', 'home', 104), quote('BetMGM', 'away', -125), quote('Caesars', 'home', 104)];
  const settings = { minSharpBooks: 1, maxVigPercent: 20, devigMethod: 'multiplicative', bookRules: [{ book: 'DraftKings', weight: 1, enabled: true }], pregameMaxAgeSeconds: 900, minEvPercent: 0, maxEvPercent: null };
  const ids = rows => plain(rows.map(row => row.quote.id)).sort();
  // The server prices every quote with a fair value; only the plausible ones are +EV rows.
  const served = priced(quotes, { settings, now }).snapshot, positive = served.pricing.filter(row => row.ev > 0).map(row => row.quoteId).sort();
  assert.deepEqual(positive, ['BetMGMhome', 'Caesarshome', 'FanDuelhome']);
  assert.deepEqual(ids(dashboardEvRows(served, settings, undefined, now)), ['BetMGMhome'], '+4% passes the 10% single-book cap, +100% does not; one-sided Caesars is hidden');
  const own = priced(quotes, { settings: { ...settings, maxEvPercent: 150 }, now }).snapshot;
  assert.deepEqual(ids(dashboardEvRows(own, { ...settings, maxEvPercent: 150 }, undefined, now)), ['BetMGMhome', 'FanDuelhome'], 'a saved maximum replaces the caps');
  assert.deepEqual(ids(dashboardEvRows(own, { ...settings, maxEvPercent: 150 }, book => book !== 'BetMGM', now)), ['FanDuelhome'], 'books outside the member’s state are not offered');
  assert.deepEqual(ids(dashboardEvRows(own, { ...settings, maxEvPercent: 150 }, undefined, now + 3_600_000)), [], 'prices past their expiry time are not shown as current value');
});

test('schedule sources normalize to one game shape with live games first', async () => {
  const { normalizeGames, orderGames } = await helpers();
  const mlb = normalizeGames('mlb', { events: [{ id: '1', date: '2026-09-29T23:00:00Z', state: 'pre', teams: [{ abbreviation: 'NYY', homeAway: 'home', id: '147' }, { abbreviation: 'BOS', homeAway: 'away', id: '111' }] }, { id: '2', date: '2026-09-29T20:00:00Z', state: 'in', status: 'Top 3rd', teams: [{ abbreviation: 'SD', homeAway: 'home', score: 2 }, { abbreviation: 'CHC', homeAway: 'away', score: 1 }] }] });
  assert.deepEqual(plain(orderGames(mlb).map(g => g.id)), ['2', '1']);
  assert.equal(mlb[0].away.code, 'BOS'); assert.equal(mlb[1].home.score, 2);
  const nfl = normalizeGames('nfl', { lines: [{ gameId: 'x', away: 'PIT', home: 'CLE', date: '2026-10-01', latest: { total: 38.5, homeFavoredBy: -2.5 } }] });
  assert.equal(nfl[0].dateOnly, true); assert.equal(nfl[0].spread, -2.5);
  const other = normalizeGames('nhl', { games: [{ id: 'n', startTime: '2026-09-29T21:00Z', state: 'post', away: { code: 'FLA', score: 3 }, home: { code: 'CAR', score: 2 } }] });
  assert.equal(other[0].away.score, 3);
});

test('greeting reflects the local time of day', async () => {
  const { greeting } = await helpers();
  assert.match(greeting(new Date(2026, 8, 29, 9)).text, /^Good morning · Tue, Sep 29$/);
  assert.match(greeting(new Date(2026, 8, 29, 20)).text, /^Good evening/);
});
