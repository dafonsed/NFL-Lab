// Read-only, synthetic data for the loopback UI preview. Never imports stores,
// provider clients, credentials, or user records.
import { DEMO_PLAYERS } from '../public/demo-data.js';
import { NFL_MARKETS, marketValue } from '../public/research-data.js';
import { MLB_MARKETS } from '../lib/mlb/markets.mjs';
import { SPORTS } from '../lib/sports/config.mjs';

const NOTICE = 'Local demo: fictional players, matchups, prices, history and projections. No live data.';
const routes = new Set(['/api/board', '/api/nfl/research', '/api/mlb/board', '/api/mlb/evidence', '/api/sports/catalog', '/api/sports/board']);
const defaults = { nfl: 'rec_yds', mlb: 'hits', nba: 'points', wnba: 'points', nhl: 'shots', soccer: 'shots' };
const availability = { status: 'Demo availability', concern: false, unavailable: false, stale: false, coverage: NOTICE };
const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function demoStats(sport, game, index) {
  const s = game.stats;
  if (sport === 'nfl') return {
    receiving_yards: s.yards, receptions: s.receptions, targets: s.targets,
    passing_yards: s.yards * 3, passing_tds: index % 4, passing_interceptions: index % 2,
    attempts: 25 + s.targets, completions: 15 + s.receptions,
    rushing_yards: Math.round(s.yards / 2), carries: 5 + s.receptions,
    rushing_tds: index % 3 === 0 ? 1 : 0, receiving_tds: index % 4 === 0 ? 1 : 0,
    special_teams_tds: 0, snap_pct: 0.8
  };
  if (sport === 'mlb') return {
    hits: s.hits, totalBases: s.bases, runs: s.runs, rbi: s.runs,
    homeRuns: index % 6 === 0 ? 1 : 0, doubles: index % 4 === 0 ? 1 : 0, triples: 0,
    stolenBases: index % 5 === 0 ? 1 : 0, baseOnBalls: index % 3,
    strikeOuts: 3 + s.hits, outs: 12 + s.hits * 3, earnedRuns: s.runs,
    plateAppearances: 4, atBats: 4, battersFaced: 20 + s.hits
  };
  if (sport === 'nba' || sport === 'wnba') return {
    ...s, minutes: 30, threePointFieldGoalsMade: index % 5,
    fieldGoalsMade: Math.round(s.points / 3), fieldGoalsAttempted: Math.round(s.points / 2),
    freeThrowsMade: index % 5, steals: index % 3, blocks: index % 2, turnovers: index % 4
  };
  if (sport === 'nhl') return {
    ...s, shotsTotal: s.shots, goals: Math.max(0, s.points - s.assists),
    saves: 20 + s.shots, blockedShots: index % 4, hits: index % 5, minutes: 19
  };
  return {
    totalShots: s.shots, shotsOnTarget: s.onTarget, totalGoals: s.goals,
    goalAssists: index % 3 === 0 ? 1 : 0, foulsCommitted: index % 3,
    yellowCards: index % 5 === 0 ? 1 : 0, saves: s.shots + 1, wonCorners: 4 + index % 4, minutes: 80
  };
}

function demoGame(player, index, date, sport) {
  const id = String(990000001 + index);
  return {
    id, gameId: id, date: date + 'T23:00:00Z', startTime: date + 'T23:00:00Z',
    sport, state: 'pre', abstractState: 'Preview', status: 'Demo matchup', seasonType: 2,
    away: { id: 'demo-away-' + index, code: player.team, name: player.team + ' · demo' },
    home: { id: 'demo-home-' + index, code: player.opponent, name: player.opponent + ' · demo' },
    venue: { fullName: 'Demo venue' }, url: '#', gameNumber: 1
  };
}

function demoPlayer(fixture, index, game, date, sport, market, config) {
  const sample = fixture.games.map((entry, offset) => {
    const stats = demoStats(sport, entry, offset);
    return {
      ...stats, stats, gameId: 'demo-history-' + fixture.id + '-' + offset,
      date: shift(date, -(fixture.games.length - offset) * (sport === 'nfl' ? 7 : 2)),
      home: entry.home, team: fixture.team, opponent: entry.opponent,
      value: marketValue(stats, config, market), demo: true
    };
  });
  const values = sample.map(row => row.value).filter(Number.isFinite);
  const point = Number(average(values.slice(-5)).toFixed(2));
  const line = Math.max(0.5, Math.floor(point) + 0.5);
  const over = values.filter(value => value > line).length / values.length;
  const playerId = sport === 'mlb' ? 990001 + index : fixture.id;
  const pitching = sport === 'mlb' && config.group === 'pitching';
  const position = sport === 'nfl' && market.startsWith('pass_') ? 'QB'
    : pitching ? 'P' : config.goalie ? (sport === 'soccer' ? 'GK' : 'G')
    : config.team ? 'TEAM' : fixture.position;
  return {
    id: String(playerId), playerId, player: fixture.name, team: fixture.team,
    opponent: fixture.opponent, opponentId: game.home.id, gameId: game.id, position,
    role: pitching ? 'pitching' : 'hitting', rank: index + 1, demo: true,
    gameState: 'Demo matchup', abstractState: 'Preview', lineupStatus: 'demo',
    modelScore: 65 - index * 5, reason: NOTICE, debt: 0, signatures: {}, availability,
    prop: { line, bookmaker: 'Demo sportsbook', bookKey: 'demo', basis: 'demo', demo: true,
      prices: { over: { american: -110 }, under: { american: -110 } } },
    forecast: { status: 'available', point, sampleCount: sample.length, sample,
      probability: { over, under: 1 - over, push: 0 }, interval: [Math.max(0, point * 0.6), point * 1.4],
      version: 'local-demo', availability, reasons: [NOTICE], warnings: [NOTICE],
      limitations: [NOTICE], validation: NOTICE, intervalLabel: 'Illustrative range',
      gameIds: sample.map(row => row.gameId) },
    trendGames: sample, logs: sample,
    details: { sample, stats: {}, coverage: {}, opponentGames: [], rating: { summary: NOTICE } },
    result: { status: 'pending', actual: null, unit: config.unit || config.label },
    sources: [], sampleOver: { hits: values.filter(value => value > line).length, total: values.length, pushes: 0, line }
  };
}

export function previewResearchData(url) {
  if (!routes.has(url.pathname)) return null;
  const q = url.searchParams;
  const sport = url.pathname.startsWith('/api/mlb/') ? 'mlb'
    : url.pathname.startsWith('/api/sports/') ? q.get('sport') || 'nba' : 'nfl';
  const markets = sport === 'nfl' ? NFL_MARKETS : sport === 'mlb' ? MLB_MARKETS : SPORTS[sport]?.markets;
  const market = q.get('market') || defaults[sport];
  const date = q.get('date') || new Date().toISOString().slice(0, 10);
  if (!markets || !Object.hasOwn(markets, market) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) {
    throw Object.assign(new Error('Choose a supported demo sport, market and date.'), { status: 400 });
  }
  const fixtures = DEMO_PLAYERS.filter(player => player.sport === sport);
  const games = fixtures.map((player, index) => demoGame(player, index, date, sport));
  const fetchedAt = new Date().toISOString();
  if (url.pathname === '/api/sports/catalog') return {
    demo: true, notice: NOTICE, sport, date, league: q.get('league') || sport,
    games, markets, availableDates: [shift(date, -1), date, shift(date, 1)],
    source: { demo: true, fetchedAt, url: '/demo-data.js' }
  };
  const selectedGame = games.find(game => game.id === q.get('game')) || games[0];
  let players = fixtures.map((fixture, index) => demoPlayer(fixture, index, games[index], date, sport, market, markets[market]));
  const allSportsGames = !['nfl', 'mlb'].includes(sport) && q.get('game') === 'all';
  if (!['nfl', 'mlb'].includes(sport) && !allSportsGames) players = players.filter(player => player.gameId === selectedGame.id);
  const current = { season: Number(q.get('season')) || Number(date.slice(0, 4)), week: Number(q.get('week')) || 3 };
  const weather = { status: 'unavailable', note: NOTICE, location: 'Demo venue' };
  const base = {
    demo: true, notice: NOTICE, sport, date, market, markets, players, games,
    current, weeks: [current], view: q.get('view') || 'board', fetchedAt, calculatedAt: fetchedAt,
    notes: [NOTICE], warnings: [NOTICE], methodology: NOTICE, connection: 'demo', stale: false,
    sources: [], datasets: [], extra: [], unavailablePlayers: [], availability, weather,
    model: { version: 'local-demo' }, forecastModel: { version: 'local-demo', status: 'demo' },
    game: selectedGame, historyGames: players.flatMap(player => player.trendGames),
    lines: games.map(game => ({ gameId: game.id, date: game.date, away: game.away.code, home: game.home.code })),
    scope: allSportsGames ? 'all' : 'game', loadedGames: allSportsGames ? games.length : 1, totalGames: games.length,
    matchups: games.map(game => ({ game, availability, weather })),
    validation: { method: NOTICE, n: 0, games: 0, rows: [] }
  };
  if (url.pathname === '/api/nfl/research' || url.pathname === '/api/mlb/evidence') {
    const player = players.find(row => String(row.playerId) === q.get('player') || row.id === q.get('player'));
    if (!player) throw Object.assign(new Error('This demo player is not on the selected board.'), { status: 404 });
    return { demo: true, notice: NOTICE, player, sources: [], methodology: NOTICE, market, selectedDate: date };
  }
  return base;
}
