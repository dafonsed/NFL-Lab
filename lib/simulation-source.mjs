import { Provider } from './providers.mjs';
import { MlbProvider, MLB_API } from './mlb/provider.mjs';
import { mlbDay, shiftDate } from './mlb/markets.mjs';
import { SPORTS } from './sports/config.mjs';
import { gameInfo } from './sports/normalize.mjs';
import { basketballEvent, mlbEvent } from './sports/events.mjs';
import { GAME_MODEL_VERSION } from './live-game-model.mjs';
import { simulationNflHistory, simulationBasketballHistory, mlbRegulationHistory } from './simulation-history.mjs';
import { readNflRegulation } from './simulation-nfl-data.mjs';
import { simulateGame, simulationOptions, SIMULATION_SPORTS, compareSimulationMarket } from './game-simulation.mjs';
import evidence from './artifacts/simulation-validation.json' with { type: 'json' };
import { kickoffTime } from './game-time.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const receipt = r => ({ url: r.url, fetchedAt: r.fetchedAt, checkedAt: r.checkedAt, sha256: r.sha256, stale: !!r.stale });
const allGames = data => {
  if (!Array.isArray(data.dates)) throw fail('MLB schedule is unavailable.', 503);
  return data.dates.flatMap(d => d.games || []);
};
const code = t => ({ LA: 'LAR', WAS: 'WSH', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR' }[t] || t);

// A suspended final remains attached to its original official date in MLB feeds.
// Its eventual final score must not enter forecasts made before its resumption.
export function simulationMlbHistory(games) {
  const availability = new Map();
  for (const g of games) {
    if (!(g.resumeDate || g.resumeGameDate || g.resumedFrom || g.resumedFromDate)) continue;
    const resumed = g.resumeDate || g.resumeGameDate || g.gameDate;
    const date = typeof resumed === 'string' ? resumed.slice(0, 10) : '';
    const availableAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) ? date + 'T23:59:59.999Z' : 'unknown';
    const id = String(g.gamePk), old = availability.get(id);
    availability.set(id, old === 'unknown' || availableAt === 'unknown' ? 'unknown' : old && old > availableAt ? old : availableAt);
  }
  return mlbRegulationHistory(games).map(g => ({ ...g, ...(availability.has(g.id) ? { availableAt: availability.get(g.id) } : {}) }));
}

export function simulationQuery(input = {}, now = Date.now()) {
  const sport = input.sport || 'nfl', date = input.date || mlbDay(now), game = input.game || '';
  if (!SIMULATION_SPORTS.includes(sport)) throw fail('Choose NFL, NBA, WNBA or MLB for simulation.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < '2005-01-01' || date > '2100-12-31') throw fail('Choose a valid date from 2005 through 2100.');
  if (game && !/^[A-Za-z0-9_-]{1,64}$/.test(game)) throw fail('Invalid game identifier.');
  if (input.publicationMode && !['faithful', 'retrospective'].includes(input.publicationMode)) throw fail('Unknown publication mode.');
  return { sport, date, game, publicationMode: input.publicationMode || 'retrospective', ...simulationOptions(input) };
}

export class SimulationStore {
  constructor({ nflProvider, provider, now = () => Date.now() } = {}) {
    this.nflProvider = nflProvider || new Provider(); this.provider = provider || new MlbProvider(); this.now = now;
  }
  async schedule(q) {
    if (q.sport === 'nfl') {
      const data = await this.nflProvider.load('schedule');
      const games = data.rows.filter(g => g.game_type !== 'PRE').map(g => ({
        id: g.game_id, date: g.gameday, season: Number(g.season), postseason: g.game_type !== 'REG',
        neutralSite: g.location ? g.location === 'Neutral' : null,
        state: g.home_score !== '' && g.home_score != null && g.away_score !== '' && g.away_score != null ? 'post' : Date.parse(kickoffTime(g)) > this.now() ? 'pre' : 'unknown',
        teams: ['away', 'home'].map(side => ({ id: code(g[side + '_team']), abbreviation: code(g[side + '_team']), name: code(g[side + '_team']), homeAway: side }))
      }));
      return { games, rawSchedule: data.rows, history: simulationNflHistory(data.rows), sources: [receipt(data.meta)], stale: !!data.meta.stale };
    }
    const url = q.sport === 'mlb' ? MLB_API + '/schedule?' + new URLSearchParams({ sportId: '1', date: q.date, hydrate: 'team' })
      : ESPN + SPORTS[q.sport].path + '/scoreboard?dates=' + q.date.replaceAll('-', '') + '&limit=100';
    const r = await this.provider.read(url, { ttl: 900000 });
    let games;
    if (q.sport === 'mlb') games = allGames(r.payload).filter(g => ['R', 'F', 'D', 'L', 'W'].includes(g.gameType)).map(g => ({ ...mlbEvent(g), season: Number(g.season), regularSeason: g.gameType === 'R', scheduledInnings: g.scheduledInnings, neutralSite: g.isNeutralSite ?? null, interrupted: /postpone|cancel|suspend/i.test(g.status?.detailedState || '') }));
    else {
      if (!Array.isArray(r.payload.events)) throw fail('Basketball schedule is unavailable.', 503);
      games = r.payload.events.filter(e => [2, 3].includes(Number(e.season?.type || r.payload.season?.type))).map(e => ({ ...basketballEvent(e, q.sport), officialDate: q.date, neutralSite: e.competitions?.[0]?.neutralSite ?? null, interrupted: /postpone|cancel|suspend/i.test((e.competitions?.[0]?.status || e.status)?.type?.name || '') }));
    }
    return { games, sources: [receipt(r)], stale: !!r.stale };
  }
  async catalog(input = {}) {
    const q = simulationQuery(input, this.now()), data = await this.schedule(q);
    // NFL has many empty weekdays. On first entry select the next published game day.
    const dates = [...new Set(data.games.map(g => (g.officialDate || g.date).slice(0, 10)))].sort();
    const date = input.date ? q.date : dates.find(d => d >= q.date) || q.date;
    return { sport: q.sport, date, events: data.games.filter(g => (g.officialDate || g.date).slice(0, 10) === date),
      nearbyDates: dates.filter(d => Math.abs(Date.parse(d) - Date.parse(date)) <= 21 * 86400000), sources: data.sources, stale: data.stale };
  }
  async run(input = {}) {
    const q = simulationQuery(input, this.now());
    if (!q.game) throw fail('Select a matchup to simulate.');
    // Validate all market inputs before any data requests.
    let market;
    if (input.market) {
      market = { type: input.market, line: input.line === undefined ? 0 : Number(input.line), firstOdds: Number(input.firstOdds), secondOdds: Number(input.secondOdds) };
      compareSimulationMarket({ status: 'experimental', probabilities: { home: .5, away: .5, tie: 0 }, total: { pmf: [] }, homeMargin: { pmf: [] } }, market);
    }
    const data = await this.schedule(q), game = data.games.find(g => g.id === q.game && (g.officialDate || g.date).slice(0, 10) === q.date);
    if (!game) throw fail('Matchup not found on this date.', 404);
    let history = data.history || [], stale = data.stale;
    const sources = [...data.sources];
    const get = async url => {
      const r = await this.provider.read(url, { ttl: 3600000 });
      sources.push(receipt(r)); if (r.stale) stale = true;
      return r.payload;
    };
    try {
      if (q.sport === 'nfl' && this.nflProvider.dir) {
        const seasons = data.rawSchedule.filter(g => g.gameday < q.date && g.gameday >= shiftDate(q.date, -449)).map(g => Number(g.season));
        const raw = await readNflRegulation(this.nflProvider.dir, seasons);
        history = simulationNflHistory(data.rawSchedule, raw.index); sources.push(...raw.sources);
      } else if (q.sport === 'mlb') {
        const rows = allGames(await get(MLB_API + '/schedule?' + new URLSearchParams({ sportId: '1', startDate: shiftDate(q.date, -449), endDate: shiftDate(q.date, -1), hydrate: 'linescore' })));
        history = simulationMlbHistory(rows);
      } else if (q.sport !== 'nfl') {
        const year = game.season || Number(q.date.slice(0, 4)), events = [];
        const results = await Promise.allSettled(game.teams.flatMap(team => [year - 1, year].flatMap(season => [2, 3].map(async seasontype => {
          const data = await get(ESPN + SPORTS[q.sport].path + `/teams/${team.id}/schedule?` + new URLSearchParams({ season, seasontype }));
          if (!Array.isArray(data.events)) throw Error('A team schedule is unavailable.');
          events.push(...data.events.map(e => ({ ...e, season: { ...e.season, type: e.season?.type || seasontype } })).filter(e => [2, 3].includes(gameInfo(e).seasonType)));
        }))));
        if (results.some(r => r.status === 'rejected')) stale = true;
        // Schedules often omit quarter linescores. Fetch only earlier OT summaries;
        // ordinary four-period finals already establish a regulation score.
        const summaries = new Map();
        const needs = [...new Map(events.filter(e => e.date?.slice(0, 10) < q.date && e.date?.slice(0, 10) >= shiftDate(q.date, -449)
          && Number((e.competitions?.[0]?.status || e.status)?.period) > 4).map(e => [e.id, e])).values()];
        await Promise.all(needs.map(async e => {
          try { const p = await get(ESPN + SPORTS[q.sport].path + `/summary?event=${e.id}`);
            if (p.header?.id === e.id && p.header?.competitions) summaries.set(e.id, { ...e, competitions: p.header.competitions });
          } catch { /* Missing period evidence excludes this row, never falls back to finals. */ }
        }));
        history = simulationBasketballHistory(events.map(e => summaries.get(e.id) || e));
      }
    } catch { stale = true; }
    const result = simulateGame({ ...q, game, history, stale, sources: sources.sort((a, b) => a.url.localeCompare(b.url)) });
    if (result.game) result.game.officialDate = q.date;
    result.evidence = q.sport === 'nfl' && evidence.version === result.version && evidence.priorVersion === GAME_MODEL_VERSION ? structuredClone(evidence) : { status: 'experimental', phases: {}, limitations: ['No matching chronological evaluation is attached for this sport and engine version.'] };
    if (market && result.status === 'experimental') result.market = compareSimulationMarket(result, market);
    return result;
  }
}
