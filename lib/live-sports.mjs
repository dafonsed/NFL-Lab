import { createHash } from 'node:crypto';
import { LiveFeed, LIVE_MAX_AGE, liveStale, liveReceipt } from './live-feed.mjs';
import { MlbProvider, MLB_API } from './mlb/provider.mjs';
import { mlbDay, shiftDate } from './mlb/markets.mjs';
import { SPORTS } from './sports/config.mjs';
import { gameInfo, normalizeSummary } from './sports/normalize.mjs';
import { liveGameOdds, matchMlbOddsEvent } from './live-odds.mjs';
import { basketballGameHistory, mlbGameHistory, projectLiveGame } from './live-game-model.mjs';
import { liveMarkets, basketballEvent, mlbEvent, normalizeLiveBasketball, normalizeLiveMlb, basketballPriors, basketballWorkloads, mlbPriors, projectBasketball, projectMlb, liveMethod } from './live-sports-model.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
const fail = message => Object.assign(Error(message), { status: 400 });
export function liveQuery(input = {}, now = Date.now()) {
  const sport = input.sport, date = input.date || mlbDay(now), game = input.game || '';
  if (!['nba', 'wnba', 'mlb'].includes(sport)) throw fail('Choose NBA, WNBA or MLB.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < '2005-01-01' || date > '2100-12-31') throw fail('Choose a valid game date.');
  if (game && !/^\d{6,12}$/.test(game)) throw fail('Choose a valid game.');
  return { sport, date, game, path: sport === 'mlb' ? 'baseball/mlb' : SPORTS[sport].path };
}
const scheduleGames = data => data.dates.flatMap(d => d.games || []);
const validSchedule = data => { if (!Array.isArray(data.dates)) throw Error('Invalid MLB schedule.'); };
const validScoreboard = data => { if (!Array.isArray(data.events)) throw Error('Invalid scoreboard.'); };
const historicalReceipt = r => ({ url: r.url, fetchedAt: r.fetchedAt, stale: r.stale, sha256: r.sha256, error: r.error });

export class LiveSportsStore {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now()); this.feed = new LiveFeed(options);
    this.provider = options.provider || new MlbProvider(options); this.histories = new Map(); this.pendingHistory = new Map(); this.pending = new Map();
  }
  async history(q, game, players) {
    const key = q.sport + ':' + game.id + ':' + players.map(p => p.id).sort().join(','), old = this.histories.get(key);
    if (old && this.now() - old.at < (old.value.stale ? 60_000 : 900_000)) return old.value;
    if (this.pendingHistory.has(key)) return this.pendingHistory.get(key);
    const task = this.loadHistory(q, game, players).then(value => {
      this.histories.set(key, { at: this.now(), value });
      if (this.histories.size > 12) this.histories.delete(this.histories.keys().next().value);
      return value;
    }).finally(() => this.pendingHistory.delete(key));
    this.pendingHistory.set(key, task); return task;
  }
  async loadHistory(q, game, players) {
    const sources = [], warnings = [];
    const get = async (url, ttl = 3_600_000) => { const r = await this.provider.read(url, { ttl }); sources.push(historicalReceipt(r)); return r.payload; };
    if (q.sport === 'mlb') {
      const end = shiftDate(game.officialDate || q.date, -1), start = Number(end.slice(5, 7)) < 6 ? `${Number(end.slice(0, 4)) - 1}-09-01` : shiftDate(end, -120);
      const schedule = await get(MLB_API + '/schedule?' + new URLSearchParams({ sportId: '1', startDate: start, endDate: end })); validSchedule(schedule);
      const gameHistoryStale = sources.some(s => s.stale);
      const completed = new Set(scheduleGames(schedule).filter(g => g.status?.abstractGameState === 'Final' && ['R', 'F', 'D', 'L', 'W'].includes(g.gameType)).map(g => String(g.gamePk)));
      const ids = [...new Set(players.map(p => p.id))].sort(), people = new Map(), tasks = [];
      for (let season = Number(start.slice(0, 4)); season <= Number(end.slice(0, 4)); season++) for (let i = 0; i < ids.length; i += 30) {
        const hydrate = `stats(group=[hitting,pitching],type=[gameLog],season=${season},startDate=${start},endDate=${end},gameType=[R,F,D,L,W],sportId=1,limit=1000)`;
        tasks.push((async () => {
          const data = await get(MLB_API + '/people?' + new URLSearchParams({ personIds: ids.slice(i, i + 30).join(','), hydrate }));
          if (!Array.isArray(data.people)) throw Error('Player histories are incomplete.');
          for (const p of data.people) { const old = people.get(p.id); people.set(p.id, { ...p, stats: [...(old?.stats || []), ...(p.stats || [])] }); }
        })());
      }
      const results = await Promise.allSettled(tasks);
      for (const r of results) if (r.status === 'rejected') warnings.push(r.reason.message);
      return { people: [...people.values()], completed, gameHistory: mlbGameHistory(scheduleGames(schedule)), gameHistoryStale, sources, warnings, stale: sources.some(s => s.stale) || warnings.length > 0 };
    }
    const events = new Map(), year = game.season || Number(q.date.slice(0, 4));
    const schedules = await Promise.allSettled(game.teams.flatMap(team => [year, year - 1].flatMap(season => [2, 3].map(async seasontype => {
      const data = await get(ESPN + q.path + `/teams/${team.id}/schedule?` + new URLSearchParams({ season, seasontype }));
      if (!Array.isArray(data.events)) throw Error('Historical schedule is incomplete.');
      for (const event of data.events) {
        const g = gameInfo(event);
        if (g.complete && g.id !== game.id && g.date < game.date && [2, 3].includes(g.seasonType) && Date.parse(game.date) - Date.parse(g.date) < 450 * 86400000) events.set(g.id, g);
      }
    }))));
    for (const r of schedules) if (r.status === 'rejected') warnings.push(r.reason.message);
    const gameHistoryStale = sources.some(s => s.stale) || warnings.length > 0;
    const chosen = new Map();
    for (const team of game.teams) for (const g of [...events.values()].filter(g => [g.home?.id, g.away?.id].includes(team.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)) chosen.set(g.id, g);
    const history = [], summaries = await Promise.allSettled([...chosen.values()].map(async g => {
      const data = await get(ESPN + q.path + '/summary?event=' + g.id, 86_400_000);
      if (String(data.header?.id) !== g.id || !data.boxscore) throw Error('Historical box score is incomplete.');
      const h = normalizeSummary(data, q.sport, g);
      if (h.game.complete) history.push(h);
    }));
    for (const r of summaries) if (r.status === 'rejected') warnings.push(r.reason.message);
    return { history, gameHistory: basketballGameHistory([...events.values()]), gameHistoryStale, sources, warnings, stale: sources.some(s => s.stale) || warnings.length > 0 };
  }
  async odds(q, game, summary) {
    if (q.sport !== 'mlb') return liveGameOdds(summary.data?.pickcenter || [], game, { ...liveReceipt(summary), stale: liveStale(summary, this.now()) });
    const board = await this.feed.read(ESPN + q.path + '/scoreboard?dates=' + q.date.replaceAll('-', '') + '&limit=100', validScoreboard);
    const event = matchMlbOddsEvent(board.data?.events, game);
    if (!event) return liveGameOdds([], game, { ...liveReceipt(board), stale: liveStale(board, this.now()) });
    const detail = await this.feed.read(ESPN + q.path + '/summary?event=' + event.id, b => { if (String(b.header?.id) !== String(event.id)) throw Error('Odds belong to a different game.'); });
    return liveGameOdds(detail.data?.pickcenter || [], game, { ...liveReceipt(detail), stale: liveStale(detail, this.now()) || liveStale(board, this.now()) });
  }
  async board(input = {}) {
    const q = liveQuery(input, this.now()), key = JSON.stringify(q);
    if (this.pending.has(key)) return this.pending.get(key);
    const task = this.build(q).finally(() => this.pending.delete(key)); this.pending.set(key, task); return task;
  }
  async build(q) {
    const url = q.sport === 'mlb' ? MLB_API + '/schedule?' + new URLSearchParams({ sportId: '1', date: q.date, hydrate: 'team' }) : ESPN + q.path + '/scoreboard?dates=' + q.date.replaceAll('-', '') + '&limit=100';
    const feed = await this.feed.read(url, q.sport === 'mlb' ? validSchedule : validScoreboard);
    const events = (q.sport === 'mlb' ? feed.data ? scheduleGames(feed.data).filter(g => ['R', 'F', 'D', 'L', 'W'].includes(g.gameType)).map(mlbEvent) : [] : (feed.data?.events || []).filter(e => Number(e.season?.type || feed.data.season?.type) !== 1).map(e => basketballEvent(e, q.sport)))
      .filter(g => g.teams.length === 2).sort((a, b) => a.date.localeCompare(b.date));
    const selected = q.game ? events.find(e => e.id === q.game) : events.find(e => e.state === 'in') || events.find(e => e.state === 'pre') || events.at(-1);
    if (q.game && !selected && !feed.stale) throw fail('This game is not on the selected date.');
    const base = { sport: q.sport, date: q.date, events, selected: selected?.id || null, markets: liveMarkets(q.sport), method: liveMethod(q.sport), players: [], sources: [liveReceipt(feed)], historySources: [], warnings: feed.error ? [feed.error] : [], fetchedAt: feed.fetchedAt || null, sourceAgeMs: feed.sourceAgeMs || 0, refreshSeconds: 15, maxAgeSeconds: 45, stale: liveStale(feed, this.now()) };
    if (!selected) return base;
    const normalize = data => q.sport === 'mlb' ? normalizeLiveMlb(data, selected) : normalizeLiveBasketball(data, selected, q.sport);
    const summary = await this.feed.read(q.sport === 'mlb' ? `https://statsapi.mlb.com/api/v1.1/game/${selected.id}/feed/live` : ESPN + q.path + '/summary?event=' + selected.id, normalize);
    base.sources.push(liveReceipt(summary));
    if (!summary.data) return { ...base, game: selected, stale: true, warnings: [...base.warnings, summary.error] };
    const { game, players, teamStats = [] } = normalize(summary.data);
    base.fetchedAt = summary.fetchedAt; base.sourceAgeMs = summary.sourceAgeMs || 0;
    let history = null, injury = null;
    const oddsTask = this.odds(q, game, summary);
    if (game.state === 'in') {
      const tasks = [this.history(q, game, players)];
      if (q.sport !== 'mlb') tasks.push(this.feed.read(ESPN + q.path + '/injuries', b => { if (!Array.isArray(b.injuries)) throw Error('Current injury status unavailable.'); }));
      const results = await Promise.allSettled(tasks);
      if (results[0].status === 'fulfilled') history = results[0].value;
      else base.warnings.push('Historical workload unavailable: ' + results[0].reason.message);
      if (results[1]?.status === 'fulfilled') injury = results[1].value;
    }
    const odds = await oddsTask;
    const lastAt = Date.parse(game.lastPlay?.at), quiet = game.state === 'in' && (!Number.isFinite(lastAt) || this.now() - lastAt > (game.halftime ? 25 * 60_000 : 180_000) || lastAt - this.now() > 60_000);
    const stale = liveStale(feed, this.now()) || liveStale(summary, this.now()) || quiet;
    if (quiet) base.warnings.push('No recent timestamped play. Projections paused until the source catches up.');
    if (summary.error) base.warnings.push(summary.error);
    if (game.state === 'in' && players.length && (!history || history.stale)) base.warnings.push('Historical inputs are incomplete or stale; projections paused.');
    if (history) base.historySources = history.sources;
    if (injury) {
      base.sources.push(liveReceipt(injury));
      const entries = (injury.data?.injuries || []).flatMap(t => t.injuries || []);
      for (const p of players) {
        const report = entries.filter(i => String(i.athlete?.id) === p.id).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0];
        p.availability = { status: report?.status || 'No injury listing', unavailable: /^(out|inactive|suspended|injured reserve)$/i.test(report?.status || ''), stale: liveStale(injury, this.now()) };
      }
      if (liveStale(injury, this.now())) base.warnings.push('Current injury status unavailable; basketball projections paused.');
    }
    const priors = history ? q.sport === 'mlb' ? mlbPriors(history.people, game, players, history.completed) : basketballPriors(history.history, game, players) : new Map();
    const workloads = q.sport === 'mlb' ? null : basketballWorkloads(players, priors, game, q.sport);
    const projected = players.map(p => {
      const prior = priors.get(p.id), markets = Object.keys(base.markets).filter(m => q.sport !== 'mlb' || p.roles.includes(base.markets[m].group));
      const projections = Object.fromEntries(markets.map(m => [m, (q.sport === 'mlb' ? projectMlb : projectBasketball)({ sport: q.sport, game, player: p, prior, workload: workloads?.get(p.id), market: m, stale: stale || !history || history.stale || q.sport !== 'mlb' && !injury })]));
      const sample = q.sport === 'mlb' ? Object.fromEntries(Object.entries(prior || {}).map(([role, v]) => [role, { count: v.count, sample: v.sample }])) : prior ? { count: prior.count, sample: prior.sample } : null;
      return { ...p, prior: sample, projections };
    });
    if (odds.sourceUrl) base.sources.push({ url: odds.sourceUrl, fetchedAt: odds.fetchedAt, stale: odds.status === 'stale', sourceAgeMs: odds.sourceAgeMs });
    // History loads may take long enough to age an otherwise successful live read.
    if (odds.fetchedAt && this.now() - Date.parse(odds.fetchedAt) + odds.sourceAgeMs > LIVE_MAX_AGE) odds.status = 'stale';
    const gameModel = projectLiveGame({ sport: q.sport, game, history: history?.gameHistory || basketballGameHistory((history?.history || []).map(h => h.game)), odds, teamStats,
      stale: stale || liveStale(summary, this.now()) || liveStale(feed, this.now()), historyStale: !history || (history.gameHistoryStale ?? history.stale), now: this.now() });
    return { ...base, game, players: projected, odds, gameModel, stale,
      snapshot: createHash('sha256').update(JSON.stringify({ game, players: projected.map(p => [p.id, p.stats, p.minutes, p.inLineup, p.currentPitcher, p.availability, p.liveUnavailable, p.projections]) })).digest('hex').slice(0, 20) };
  }
}
