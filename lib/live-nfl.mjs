import { createHash } from 'node:crypto';
import { Provider } from './providers.mjs';
import { buildLivePriors, projectLiveProp, LIVE_MARKETS, LIVE_METHOD, finite, teamCode } from './live-nfl-model.mjs';

export const ESPN_LIVE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const LIVE_TTL = 15_000;
export const LIVE_MAX_AGE = 45_000;
const badRequest = message => Object.assign(Error(message), { status: 400 });
const fields = {
  passingYards: 'passing_yards', completions: 'completions', passingAttempts: 'attempts',
  rushingAttempts: 'carries', rushingYards: 'rushing_yards',
  receptions: 'receptions', receivingYards: 'receiving_yards', receivingTargets: 'targets',
};
const categoryFields = { passing: ['attempts', 'completions', 'passing_yards'], rushing: ['carries', 'rushing_yards'], receiving: ['targets', 'receptions', 'receiving_yards'] };
const pair = value => typeof value === 'string' && /^\d+\/\d+$/.test(value) ? value.split('/').map(Number) : [null, null];
export function clockSeconds(clock) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(clock ?? ''));
  return match && Number(match[1]) <= 15 ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function teamsOf(competition) {
  return (competition?.competitors || []).map(c => ({ id: String(c.team?.id || c.id), name: c.team?.displayName || c.team?.abbreviation, abbreviation: teamCode(c.team?.abbreviation), homeAway: c.homeAway, score: finite(c.score?.value ?? c.score), logo: c.team?.logo || c.team?.logos?.[0]?.href }));
}
export function normalizeEvent(event, season) {
  const c = event.competitions?.[0], status = c?.status || event.status || {};
  return { id: String(event.id), date: event.date || c?.date, season: Number(event.season?.year || season), state: status.type?.state || 'unknown', status: status.type?.shortDetail || status.type?.description || 'Status unavailable', teams: teamsOf(c) };
}

export function normalizeSummary(body, event) {
  const competition = body.header?.competitions?.[0];
  if (String(body.header?.id) !== event.id || !competition || competition.competitors?.length !== 2 || !body.boxscore) throw Error('Live box score is incomplete or belongs to another game.');
  const allPlays = [...(body.drives?.previous || []), ...(body.drives?.current ? [body.drives.current] : [])].flatMap(d => d.plays || []);
  const lastPlay = allPlays.sort((a, b) => Number(a.sequenceNumber || a.id) - Number(b.sequenceNumber || b.id)).at(-1);
  const status = competition.status || {}, halftime = /halftime/i.test(status.type?.name || '');
  const period = finite(status.period) ?? finite(lastPlay?.period?.number);
  const clock = halftime ? '0:00' : status.displayClock ?? lastPlay?.clock?.displayValue;
  const seconds = clockSeconds(clock);
  const game = {
    ...event, state: status.type?.state || event.state, status: status.type?.shortDetail || status.type?.description || event.status,
    teams: teamsOf(competition), period, clock, halftime,
    remainingSeconds: halftime ? 1800 : period >= 1 && period <= 4 && seconds !== null ? (4 - period) * 900 + seconds : null,
    possession: halftime || status.type?.state !== 'in' ? null : String(competition.situation?.possession || lastPlay?.end?.team?.id || '') || null,
    lastPlay: lastPlay ? { id: String(lastPlay.id), text: lastPlay.text, at: lastPlay.wallclock || null } : null,
    sourceUrl: `${ESPN_LIVE}/summary?event=${event.id}`,
  };
  const teamStats = (body.boxscore.teams || []).map(t => {
    const stats = Object.fromEntries((t.statistics || []).map(s => [s.name, s.displayValue]));
    const [, attempts] = pair(stats.completionAttempts);
    const sacks = /^\d+-\d+$/.test(stats.sacksYardsLost || '') ? Number(stats.sacksYardsLost.split('-')[0]) : null;
    return { id: String(t.team.id), plays: finite(stats.totalOffensivePlays), attempts, carries: finite(stats.rushingAttempts), sacks, targets: null };
  });
  const players = [];
  for (const t of body.boxscore.players || []) {
    const byId = new Map(), categories = new Map();
    for (const category of t.statistics || []) {
      if (!categoryFields[category.name]) continue;
      const keys = category.keys || [];
      // Never infer zeros from an absent/partial statistics category.
      const mapped = keys.flatMap(k => k === 'completions/passingAttempts' ? ['completions', 'attempts'] : fields[k] ? [fields[k]] : []);
      const complete = categoryFields[category.name].every(f => mapped.includes(f)) && Array.isArray(category.athletes) && category.athletes.length > 0 && category.athletes.every(a => a.stats?.length === keys.length && keys.every((k, i) => k === 'completions/passingAttempts' ? pair(a.stats[i]).every(Number.isFinite) : !fields[k] || finite(a.stats[i]) !== null));
      categories.set(category.name, complete);
      for (const a of category.athletes || []) {
        if (!a.athlete?.id) continue;
        const id = String(a.athlete.id), p = byId.get(id) || { id, name: a.athlete.displayName, teamId: String(t.team.id), team: teamCode(t.team.abbreviation), headshot: a.athlete.headshot?.href, stats: {}, categories: [] };
        p.categories.push(category.name);
        keys.forEach((k, i) => {
          if (k === 'completions/passingAttempts') { const [c, n] = pair(a.stats?.[i]); p.stats.completions = c; p.stats.attempts = n; }
          else if (fields[k]) p.stats[fields[k]] = finite(a.stats?.[i]);
        });
        byId.set(id, p);
      }
      if (category.name === 'receiving' && complete) {
        const team = teamStats.find(s => s.id === String(t.team.id));
        const values = (category.athletes || []).map(a => finite(a.stats?.[keys.indexOf('receivingTargets')]));
        if (team && values.every(Number.isFinite)) team.targets = values.reduce((a, b) => a + b, 0);
      }
    }
    for (const p of byId.values()) {
      // A named offensive participant omitted from a complete category has zero
      // in that category; players absent from the entire box are never invented.
      for (const [category, fs] of Object.entries(categoryFields)) if (!p.categories.includes(category) && categories.get(category)) for (const f of fs) p.stats[f] = 0;
      players.push(p);
    }
  }
  return { game, players, teamStats };
}

export class LiveNflStore {
  constructor({ fetcher = fetch, now = () => Date.now(), provider = new Provider() } = {}) {
    this.fetcher = fetcher; this.now = now; this.provider = provider; this.cache = new Map(); this.pending = new Map(); this.histories = new Map();
  }
  async read(url, validate) {
    if (this.pending.has(url)) return this.pending.get(url);
    const saved = this.cache.get(url), now = this.now();
    if (saved && now - saved.checkedAt < LIVE_TTL) return (saved.sourceAgeMs || 0) + now - Date.parse(saved.fetchedAt) > LIVE_MAX_AGE ? { ...saved, stale: true, error: saved.error || 'Provider cache is too old for live comparisons.' } : saved;
    const task = (async () => {
      try {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
        if (!response.ok) throw Error(`ESPN returned HTTP ${response.status}`);
        const raw = await response.text(), data = JSON.parse(raw);
        validate(data);
        const age = Math.max(0, finite(response.headers.get('age')) ?? 0) * 1000;
        const value = { data, checkedAt: this.now(), fetchedAt: new Date(this.now()).toISOString(), sourceAgeMs: age, stale: age > LIVE_MAX_AGE, sourceUrl: url, sha256: createHash('sha256').update(raw).digest('hex'), error: age > LIVE_MAX_AGE ? 'Provider cache is too old for live comparisons.' : null };
        this.cache.set(url, value);
        if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
        return value;
      } catch (e) {
        const failed = { ...saved, data: saved?.data || null, checkedAt: this.now(), stale: true, error: e.message, sourceUrl: url };
        this.cache.set(url, failed); return failed;
      }
    })().finally(() => this.pending.delete(url));
    this.pending.set(url, task); return task;
  }
  async history(season) {
    const saved = this.histories.get(season);
    if (saved && this.now() - saved.at < 15 * 60_000) return saved.value;
    const datasets = await Promise.all([this.provider.load('schedule', null), this.provider.load('roster', season), this.provider.load('weekly', season, { optional: true }), this.provider.load('weekly', season - 1)]);
    const [schedule, roster, ...weekly] = datasets;
    const value = { schedule: schedule.rows, rosters: roster.rows, weekly: weekly.flatMap(s => s.rows), stale: datasets.some(s => s.meta.stale || s.meta.available === false), sources: datasets.map(s => s.meta) };
    this.histories.set(season, { at: this.now(), value });
    if (this.histories.size > 3) this.histories.delete(this.histories.keys().next().value);
    return value;
  }
  async board(input = {}) {
    if (input.game && !/^\d{6,12}$/.test(input.game)) throw badRequest('Choose a valid ESPN game.');
    if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date)) throw badRequest('Choose a valid game date.');
    const url = ESPN_LIVE + '/scoreboard' + (input.date ? '?dates=' + input.date.replaceAll('-', '') : '');
    const feed = await this.read(url, b => { if (!Array.isArray(b.events)) throw Error('Invalid NFL scoreboard.'); });
    const events = (feed.data?.events || []).filter(e => Number(e.season?.type || feed.data.season?.type) !== 1).map(e => normalizeEvent(e, feed.data.season?.year));
    const selected = input.game ? events.find(e => e.id === input.game) : events.find(e => e.state === 'in') || events.find(e => e.state === 'pre') || events.at(-1);
    if (input.game && !selected && !feed.stale) throw badRequest('This game is not on the selected date or current scoreboard.');
    const receipt = r => ({ url: r.sourceUrl, fetchedAt: r.fetchedAt || null, checkedAt: new Date(r.checkedAt).toISOString(), stale: r.stale, error: r.error || null, sha256: r.sha256 || null });
    const base = { events, selected: selected?.id || null, fetchedAt: feed.fetchedAt || null, refreshSeconds: 15, maxAgeSeconds: 45, markets: LIVE_MARKETS, method: LIVE_METHOD, sources: [receipt(feed)], stale: feed.stale, warnings: feed.error ? [feed.error] : [], players: [] };
    if (!selected) return base;
    const summary = await this.read(`${ESPN_LIVE}/summary?event=${selected.id}`, b => normalizeSummary(b, selected));
    base.sources.push(receipt(summary)); base.fetchedAt = summary.fetchedAt || base.fetchedAt;
    if (!summary.data) return { ...base, game: selected, stale: true, warnings: [...base.warnings, summary.error] };
    const normalized = normalizeSummary(summary.data, selected), game = normalized.game;
    const liveAge = game.lastPlay?.at ? this.now() - Date.parse(game.lastPlay.at) : Infinity;
    const quietFeed = game.state === 'in' && !game.halftime && (!Number.isFinite(liveAge) || liveAge > 180_000);
    let history = null;
    try { history = await this.history(game.season); } catch (e) { base.warnings.push('Historical workload unavailable: ' + e.message); }
    const stale = feed.stale || summary.stale || !history || history.stale || quietFeed;
    if (quietFeed) base.warnings.push('No recent timestamped play in the feed. Projections paused until the source catches up.');
    if (summary.error) base.warnings.push(summary.error);
    if (history?.stale) base.warnings.push('A historical input is stale or unavailable. Projections paused.');
    const priors = history ? buildLivePriors({ ...history, game }) : new Map();
    const players = normalized.players.map(p => {
      const prior = priors.get(p.id + ':' + p.team), team = normalized.teamStats.find(t => t.id === p.teamId);
      const applicable = Object.keys(LIVE_MARKETS).filter(m => m.startsWith('pass_') ? p.categories.includes('passing') || prior?.position === 'QB' : true);
      return { ...p, prior: prior || null, projections: Object.fromEntries(applicable.map(m => [m, projectLiveProp({ game, player: p, team, prior, market: m, stale })])) };
    });
    return { ...base, game, players, teamStats: normalized.teamStats, stale, historySources: history?.sources || [], snapshot: createHash('sha256').update(JSON.stringify({ period: game.period, clock: game.clock, scores: game.teams.map(t => t.score), play: game.lastPlay?.id, stats: players.map(p => [p.id, p.stats]) })).digest('hex').slice(0, 20) };
  }
}
