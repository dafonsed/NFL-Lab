import test from 'node:test';
import assert from 'node:assert/strict';
import { finite, marketValue, researchProfile, selectGames, summarize, recentChange, supportingStats, forecastSummary, recordQuote } from '../public/research-data.js';
import { nflResearchHistory, mlbResearchHistory, compactNflBoard, opponentResearch } from '../lib/research-history.mjs';
import { siteHeader, siteContext, renderSitePage } from '../lib/site-layout.mjs';
import { load } from 'cheerio';

const sample = Array.from({ length: 20 }, (_, i) => ({ gameId: String(20 - i), date: `2026-09-${String(20 - i).padStart(2, '0')}`, value: 20 - i, home: i % 2 === 0, opponent: i % 3 ? 'NY' : 'LA', opponentId: i % 3 ? '2' : '1', stats: { minutes: 30 + i, points: 20 - i }, parts: [] }));
const profile = { rows: sample, opponent: 'LA', opponentId: '1', sport: 'nba' };
test('history windows filter actual opponents and venues without filling missing games', () => {
  assert.equal(selectGames(profile, { window: '5' }).length, 5);
  assert.equal(selectGames(profile, { window: '20', venue: 'home' }).length, 10);
  assert.ok(selectGames(profile, { window: 'h2h' }).every(r => r.opponentId === '1'));
  assert.equal(selectGames(profile, { window: 'year:2025' }).length, 0);
  assert.equal(selectGames({ ...profile, rows: sample.map(r => ({ ...r, opponent: null, opponentId: null })) }, { window: 'h2h' }).length, 0);
});
test('past-game rates count pushes, preserve real zeroes, and never turn absent lines into zero', () => {
  assert.equal(finite(''), null); assert.equal(finite(null), null); assert.equal(finite(0), 0);
  const rows = [{ value: 0 }, { value: 1 }, { value: 2 }, { value: null }];
  const s = summarize(rows, 1); assert.equal(s.n, 3); assert.equal(s.over, 1); assert.equal(s.under, 1); assert.equal(s.pushes, 1); assert.equal(s.rate, 1 / 3);
  assert.equal(summarize(rows).rate, null); assert.equal(summarize([], 1).average, null);
  assert.equal(summarize(rows, 0).over, 2);
});
test('trend change requires ten appearances and uses two non-overlapping groups', () => {
  assert.equal(recentChange(sample).change, 5);
  assert.equal(recentChange(sample.slice(0, 9)).change, null);
  assert.equal(supportingStats(profile, sample.slice(0, 5), 'median').find(r => r.key === 'minutes').value, 32);
});
test('combined markets require every component and baseball innings use outs, not decimal innings', () => {
  assert.equal(marketValue({ points: 20 }, { fields: ['points', 'assists'] }, 'pa'), null);
  assert.equal(marketValue({ points: 20, assists: 0 }, { fields: ['points', 'assists'] }, 'pa'), 20);
  assert.equal(marketValue({ inningsPitched: '6.1' }, { field: 'outs' }, 'outs'), 19);
  assert.equal(marketValue({ inningsPitched: '6.3' }, { field: 'outs' }, 'outs'), null);
  assert.equal(marketValue({ hits: 4, doubles: 1, triples: 1, homeRuns: 1 }, {}, 'tb'), 10);
});
test('profile excludes selected and future games, deduplicates games, and preserves authoritative recorded TDs', () => {
  const board = { lines: [{ gameId: 'new', date: '2026-09-22' }] };
  const player = { playerId: 'p', player: 'Player', position: 'RB', gameId: 'new', trendGames: [
    { gameId: 'a', date: '2026-09-20', value: 2, stats: { rushing_tds: 1, receiving_tds: 0, special_teams_tds: 0 } },
    { gameId: 'a', date: '2026-09-20', value: 2 }, { gameId: 'new', date: '2026-09-22', value: 99 }, { gameId: 'future', date: '2026-09-25', value: 99 }, { gameId: 'missing', date: '2026-09-19', value: null }
  ] };
  const p = researchProfile({ sport: 'nfl', board, player, market: 'any_td' });
  assert.equal(p.rows.length, 1); assert.equal(p.rows[0].value, 2); assert.deepEqual(p.rows[0].parts, []);
  assert.ok(!p.markets.pass_yds);
});
test('TD summary leads with model strength and labels the separate fitted chance', () => {
  const summary = forecastSummary({ sport: 'nfl', market: 'any_td', forecast: { point: .56, probability: { over: .45 } } });
  assert.match(summary.title, /Model strength unavailable/);
  const score=forecastSummary({sport:'nfl',market:'any_td',raw:{modelScore:83.4,tdProb:.61,tdProbMethod:'historical-score-calibration'},forecast:{point:.56,probability:{over:.45}},availability:{}});
  assert.match(score.title,/83.4% model strength/);assert.match(score.text,/61% rushing or receiving TD chance/);
});
test('quote history separates bookmakers and games, rejects stale/out-of-order quotes, and records genuine flat checks', () => {
  const now = Date.parse('2026-09-22T20:00Z'), quote = { line: 20.5, bookmaker: 'Book A', basis: 'captured_pregame', fetchedAt: '2026-09-22T18:00Z' };
  const a = recordQuote({}, 'nba:game1:player:points', quote, now);
  assert.equal(Object.keys(a).length, 1);
  assert.deepEqual(recordQuote(a, 'nba:game1:player:points', { ...quote, stale: true }, now), a);
  assert.deepEqual(recordQuote(a, 'nba:game1:player:points', { ...quote, fetchedAt: '2026-09-22T17:00Z' }, now), a);
  const b = recordQuote(a, 'nba:game1:player:points', { ...quote, fetchedAt: '2026-09-22T19:00Z' }, now);
  assert.equal(Object.values(b)[0].length, 2); assert.equal(Object.values(a)[0].length, 1);
  assert.equal(Object.keys(recordQuote(b, 'nba:game1:player:points', { ...quote, bookmaker: 'Book B' }, now)).length, 2);
  assert.equal(Object.keys(recordQuote(b, 'nba:game2:player:points', quote, now)).length, 2);
  const full = Object.fromEntries(Array.from({length:500},(_,i)=>['other:'+i,[{at:'2026-09-22T19:00Z',line:1}]]));
  const opened = recordQuote(full,'selected:player',quote,now);
  assert.equal(Object.keys(opened).length,500);assert.equal(opened['selected:player:Book A'][0].line,20.5);
});
test('MLB research history excludes relief appearances, missing fields, selected games, and incomplete games', () => {
  const splits = [1, 2, 3, 4, 5].map(id => ({ game: { gamePk: id }, gameType: 'R', date: id === 5 ? '2026-09-22' : `2026-09-0${id}`, opponent: { id: 8, name: 'Opponent' }, isHome: true, stat: { gamesStarted: id === 2 ? 0 : 1, strikeOuts: id === 3 ? null : 0 } }));
  const person = { stats: [{ type: { displayName: 'gameLog' }, group: { displayName: 'pitching' }, splits }] };
  const rows = mlbResearchHistory(person, new Set([1, 2, 3, 5]), '2026-09-22', 'k', 'pitching', true);
  assert.equal(rows.length, 1); assert.equal(rows[0].value, 0); assert.equal(rows[0].opponentId, 8); assert.equal(rows[0].stats.strikeOuts, 0);
});
test('NFL history excludes nonparticipants, missing records, future games and includes legitimate zeroes', () => {
  const games = [1, 2, 3, 4].map(id => ({ game_id: String(id), gameday: `2026-09-${10 + id}`, complete: true, home_team: 'A', away_team: 'B', plays: [], players: new Map([['p', { team: 'A', offense_snaps: id === 2 ? 0 : 30, statsAvailable: id !== 3, receiving_yards: 0, attempts: 0, carries: 0, targets: 0 }]]) }));
  const rows = nflResearchHistory(games, { playerId: 'p', position: 'WR', gameId: 'selected' }, 'rec_yds', '2026-09-14');
  assert.equal(rows.length, 1); assert.equal(rows[0].value, 0); assert.equal(rows[0].opponent, 'B');
});
test('compact NFL responses leave source models intact and full details available on demand', () => {
  const board = { players: [{ playerId: 'p', details: { sample: [{ targets: 2 }], stats: { targets: 2 }, cheat_code: { internal: true } }, forecast: { point: 3, sample: [{ value: 1 }], inputEffects: [{ detailed: true }] }, trendGames: [{ gameId: 'g', value: 0, stats: { targets: 0 }, url: 'https://example.com' }] }] };
  const compact = compactNflBoard(board);
  assert.equal(compact.players[0].forecast.point, 3); assert.equal(compact.players[0].details.sampleCount, 1); assert.equal(compact.players[0].forecast.sample, undefined);
  assert.equal(board.players[0].forecast.sample.length, 1); assert.equal(board.players[0].trendGames[0].stats.targets, 0);
});
test('opponent tables distinguish team and position-group totals and omit missing stats', () => {
  const history = [{ game: { complete: true }, teams: [{ id: 'opp' }, { id: 'other', stats: { points: 100, assists: 20 } }], players: [{ teamId: 'other', position: 'PG', minutes: 30, stats: { points: 22, assists: 8 } }, { teamId: 'other', position: 'SG', minutes: 30, stats: { points: 18, assists: 4 } }, { teamId: 'other', position: 'C', minutes: 25, stats: { points: 12, assists: null } }] }];
  const d = opponentResearch(history, 'opp', { fields: ['points', 'assists'] }, 'nba');
  assert.equal(d.groups[0].fields[0].average, 100);
  assert.equal(d.groups.find(g => g.key === 'G').fields[0].average, 40);
  assert.equal(d.groups.find(g => g.key === 'C').fields[1].average, null);
});
test('every sport exposes Trends and Dev mode, and changing sport preserves Trends', () => {
  for (const sport of ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']) {
    const url = new URL(`https://example.com/${sport}?view=trends`), $ = load(siteHeader(url));
    assert.equal(siteContext(url).section, 'trends'); assert.equal($('.site-navigation [aria-current]').text(), 'Trends');
    assert.equal($('[data-dev-toggle]').length, 1); assert.ok($('.site-sports a').toArray().every(a => $(a).attr('href').endsWith('?view=trends')));
  }
  const html = renderSitePage('<html><head></head><body><!--site-header--></body></html>', new URL('https://example.com/nfl'));
  assert.ok(html.includes('/site-preferences.js')); assert.ok(html.includes('/player-research.css'));
});
