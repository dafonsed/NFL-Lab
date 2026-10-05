// Every posted player line on one slate, across all of a sport's markets, with the player's recent
// games for that line's stat: the trends parlay builder's input (public/parlay-builder.js scores and
// picks the legs in the browser, so changing a setting needs no new request). Lines, prices and game
// histories are exactly the Trends boards' (same stores, same researchProfile): the public comparison
// lines, never the +EV odds feed. Only lines still offered before the game starts are included.
import { researchProfile, selectGames, finite, NFL_MARKETS } from '../public/research-data.js';
import { playerContext, playerKey } from '../public/sports-view.js';
import { MARKETS } from './markets.mjs';
import { MLB_MARKETS, mlbDay } from './mlb/markets.mjs';
import { day } from './sports/config.mjs';
import { postedMarkets } from './sports/props.mjs';

export const PARLAY_SPORTS = Object.freeze(['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'soccer']);
const HISTORY = 20;
const TTL = 120_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function settleLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { ok: true, value: await task(items[index]) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  }));
  return results;
}

const code = team => team?.code || team?.abbreviation || team?.name || '';
function gameOf(sport, board, player) {
  if (sport === 'nfl') {
    const line = board.lines?.find(g => g.gameId === player.gameId);
    return line ? { label: `${line.away} @ ${line.home}`, home: player.team === line.home ? true : player.team === line.away ? false : null } : { label: '', home: null };
  }
  const game = sport === 'mlb' ? board.games?.find(g => String(g.gameId) === String(player.gameId)) : board.game;
  return { label: game ? `${code(game.away)} @ ${code(game.home)}` : '', home: typeof player.home === 'boolean' ? player.home : null };
}

/** The parlay legs one trends board offers: posted, unexpired lines of players expected to play. */
export function boardLegs(sport, market, board, now = Date.now()) {
  const legs = [];
  for (const player of board?.players || []) {
    const context = board.scope === 'all' ? playerContext(board, playerKey(player)) : { player, board };
    if (!context) continue;
    const profile = researchProfile({ sport, ...context, market });
    const prop = profile.prop, availability = profile.availability || {};
    if (!prop || prop.stale || availability.unavailable) continue;
    const start = Date.parse(prop.commenceTime || player.startTime || context.board.game?.date);
    if (!(start > now)) continue;
    const over = finite(prop.prices?.over?.american), under = finite(prop.prices?.under?.american);
    if (over === null && under === null) continue;
    const versus = new Set(selectGames(profile, { window: 'h2h' }));
    const game = gameOf(sport, context.board, player), forecast = profile.forecast || {};
    const opponent = forecast.modelContext?.opponent;
    legs.push({
      id: [profile.gameId, profile.playerId, market].join(':'), key: profile.key,
      player: profile.name, playerId: String(profile.playerId), team: profile.team || '', opponent: profile.opponent || '', position: profile.position || '', image: profile.image || null,
      gameId: String(profile.gameId), game: game.label, home: game.home, start: new Date(start).toISOString(),
      market, line: finite(prop.line), book: prop.bookmaker || prop.bookKey || '', books: finite(prop.lineBooks), over, under, fetchedAt: prop.fetchedAt || null,
      projection: forecast.status === 'unavailable' ? null : finite(forecast.point),
      status: availability.status || null, concern: !!availability.concern,
      lineup: sport === 'mlb' ? (player.lineupStatus === 'confirmed' ? 'confirmed' : null) : player.lineupConfirmed && player.starter ? 'starter' : null,
      matchup: opponent?.available && finite(opponent.rate) !== null && finite(opponent.leagueRate) ? { rate: opponent.rate, league: opponent.leagueRate, unit: opponent.unit || '' } : null,
      pitcher: sport === 'mlb' && player.role === 'hitting' ? player.opponentPitcher || null : null,
      // Newest first: [date, value, home (1/0/null), against this opponent (1/0), opponent].
      games: profile.rows.slice(0, HISTORY).map(r => [String(r.date).slice(0, 10), r.value, r.home === true ? 1 : r.home === false ? 0 : null, versus.has(r) ? 1 : 0, r.opponent || ''])
    });
  }
  return legs;
}

function plan(sport, input, { nfl, mlb, sports }, force, now) {
  if (sport === 'nfl') {
    const slate = { season: input.season || '', week: input.week || '' };
    return { slate, tasks: MARKETS.map(market => ({ market, load: () => nfl.board({ market, view: 'board', ...(slate.season && slate.week ? slate : {}) }, force) })) };
  }
  const date = input.date || (sport === 'mlb' ? mlbDay(now) : day(now));
  if (!DATE.test(date)) throw Object.assign(Error('Choose a valid date.'), { status: 400 });
  if (sport === 'mlb') return { slate: { date }, tasks: Object.keys(MLB_MARKETS).map(market => ({ market, load: () => mlb.board({ market, date }, force) })) };
  const markets = postedMarkets(sport);
  if (!markets.length) return { slate: { date }, tasks: [] };
  if (sport === 'wnba') return { slate: { date }, tasks: markets.map(market => ({ market, load: () => sports.board({ sport, date, game: 'all', market }, force) })) };
  // NBA and NHL boards are one game each: every market of every game that hasn't started.
  return { slate: { date }, markets, perGame: true };
}

export function createParlayPool(stores, { now = () => Date.now() } = {}) {
  const cache = new Map(), pending = new Map();
  async function build(sport, input, force) {
    const time = now(), { slate, tasks: planned, markets, perGame } = plan(sport, input, stores, force, time);
    let tasks = planned || [];
    const notes = [];
    if (perGame) {
      const catalog = await stores.sports.catalog({ sport, date: slate.date }, force);
      const games = catalog.games.filter(g => g.state === 'pre' && Date.parse(g.date) > time);
      tasks = games.flatMap(g => markets.map(market => ({ market, load: () => stores.sports.board({ sport, date: slate.date, game: g.id, market }, force) })));
    }
    if (sport === 'soccer') notes.push('The public lines source posts no soccer player props, so there are no lines to build from.');
    const results = await settleLimited(tasks, 4, task => task.load());
    const legs = [], labels = {}, failed = new Set();
    let current = null, weeks = null;
    results.forEach((result, index) => {
      const { market } = tasks[index];
      if (!result.ok) { failed.add(market); return; }
      const board = result.value;
      if (sport === 'nfl') { current ??= board.current || null; weeks ??= (board.weeks || []).slice(0, 30); }
      const found = boardLegs(sport, market, board, time);
      const config = sport === 'nfl' ? NFL_MARKETS[market] : board.markets?.[market];
      if (found.length && config) labels[market] = { label: config.label, unit: config.unit || config.label.toLowerCase() };
      legs.push(...found);
    });
    if (failed.size) notes.push(`Lines for ${[...failed].join(', ')} could not load this time; they are left out.`);
    const unique = [...new Map(legs.map(leg => [leg.id, leg])).values()];
    const games = [...new Map(unique.map(leg => [leg.gameId, { id: leg.gameId, label: leg.game, start: leg.start }])).values()].sort((a, b) => a.start.localeCompare(b.start));
    const times = unique.map(leg => Date.parse(leg.fetchedAt)).filter(Number.isFinite);
    return { sport, slate: sport === 'nfl' && current ? { season: current.season, week: current.week } : slate, weeks, builtAt: new Date(time).toISOString(), linesAt: times.length ? new Date(Math.max(...times)).toISOString() : null, markets: labels, games, legs: unique, notes };
  }
  return async function parlayPool(input = {}, force = false) {
    const sport = input.sport;
    if (!PARLAY_SPORTS.includes(sport)) throw Object.assign(Error('Choose a supported sport.'), { status: 400 });
    const key = JSON.stringify([sport, input.season || '', input.week || '', input.date || '']);
    if (pending.has(key)) return pending.get(key);
    const saved = cache.get(key);
    if (saved && !force && now() - saved.at < TTL) return saved.value;
    const task = build(sport, input, force).then(value => {
      cache.set(key, { at: now(), value });
      if (cache.size > 20) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
}
