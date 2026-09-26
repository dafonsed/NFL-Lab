import { simulationQuery } from './simulation-source.mjs';
import { MARKET_CONFIG } from './markets.mjs';
import { MLB_MARKETS } from './mlb/markets.mjs';
import { SPORTS } from './sports/config.mjs';
import { freshPregameQuote } from './pregame-quote.mjs';
import { kickoffTime } from './game-time.mjs';
import { SourceStore } from './source.mjs';
import { MlbStore } from './mlb/source.mjs';
import { SportsStore } from './sports/source.mjs';

const readOnlyCapture = async () => ({ state: 'read_only', message: 'Simulation does not write standard prediction archives.' });
class SimulationNflPlayers extends SourceStore {
  async trackLines() { return []; }
}
class SimulationBasketballPlayers extends SportsStore {
  async capture() { return readOnlyCapture(); }
}
// Reuse unchanged standard forecast calculations, with separate board caches and
// disabled prediction/paper/line-history writes. Raw provider caches may be shared.
export function createSimulationPropStores({ nfl, mlb, sports }) {
  const paper = { capturePaper: readOnlyCapture };
  return {
    nfl: new SimulationNflPlayers({ provider: nfl.provider, dir: nfl.dir, now: nfl.now, props: nfl.props, weather: nfl.weather, availability: nfl.availability, predictions: { capture: readOnlyCapture }, paper }),
    mlb: new MlbStore({ provider: mlb.provider, now: mlb.now, weather: mlb.weather, availability: mlb.availability, paper }),
    sports: new SimulationBasketballPlayers({ provider: sports.provider, now: sports.now, weather: sports.weather }),
  };
}

const fail = (message, status = 400) => Object.assign(Error(message), { status });
const finite = value => Number.isFinite(value) ? value : null;
const unique = values => [...new Set(values.filter(v => typeof v === 'string' && v))];
export function simulationPropMarkets(sport) {
  const markets = sport === 'nfl' ? MARKET_CONFIG : sport === 'mlb' ? MLB_MARKETS : SPORTS[sport]?.markets || {};
  return Object.entries(markets).map(([key, m]) => ({ key, label: m.label, unit: m.unit || m.label.toLowerCase() }));
}

// Adapt existing player forecasts; never infer player outcomes from team scores.
export function simulationPropRows(board, { sport, game, market, now = Date.now(), kickoff }) {
  const config = simulationPropMarkets(sport).find(m => m.key === market);
  const entries = new Map();
  for (const p of [...(board.players || []), ...(board.unavailablePlayers || [])]) {
    if (String(p.gameId) !== String(game)) continue;
    const id = String(p.playerId ?? p.id ?? '');
    if (id) entries.set(id, p);
  }
  return [...entries].map(([id, p]) => {
    const f = p.forecast || {}, availability = f.availability || p.availability || { status: 'Unknown' };
    const usable = ['available', 'experimental'].includes(f.status) && !availability.unavailable;
    const prop = Number.isFinite(p.prop?.line) ? p.prop : null;
    const start = kickoff || p.startTime || board.game?.date;
    const fresh = !!prop && freshPregameQuote(prop, now, start);
    const forecastStale = !!board.stale || !!availability.stale;
    const pointIsProbability = sport === 'nfl' && market === 'any_td';
    const validPoint = Number.isFinite(f.point) && (!pointIsProbability || f.point >= 0 && f.point <= 1);
    const values = f.probability;
    const validProbability = values && ['over', 'under', 'push'].every(k => Number.isFinite(values[k]) && values[k] >= 0 && values[k] <= 1)
      && Math.abs(values.over + values.under + values.push - 1) < .001;
    const probability = usable && validPoint && !forecastStale && fresh && validProbability
      ? { over: values.over, under: values.under, push: values.push } : null;
    const lineStatus = !prop ? 'unposted' : prop.stale ? 'stale' : prop.basis === 'published_archive' ? 'archived' : prop.basis === 'in_play' ? 'in_play' : fresh ? 'current' : 'stale';
    const point = usable && validPoint ? f.point : null;
    const interval = usable && !pointIsProbability && Array.isArray(f.interval) && f.interval.length === 2 && f.interval.every(Number.isFinite) && f.interval[0] <= f.interval[1] ? f.interval : null;
    const reasons = unique([
      ...(f.reasons || []), availability.unavailable ? `Reported ${availability.status}; player forecast withheld.` : '',
      forecastStale ? 'Player inputs or availability are stale; line probabilities are withheld.' : '',
      prop && !fresh ? 'This line is archived, in play or stale; pregame over/under probabilities are withheld.' : '',
      !prop ? 'No posted sportsbook line is available.' : '',
      !usable && !f.reasons?.length ? 'The existing player model has no available forecast.' : '',
      usable && fresh && !validProbability ? 'The player model does not supply a supported probability distribution for this line.' : '',
      usable && !validPoint ? 'The existing player projection is missing or outside its supported range; comparison withheld.' : '',
      pointIsProbability ? 'The TD occurrence estimate comes from projected workload. Over/under uses the existing historical-outcome mapping, so the two estimates can differ; neither is a game-simulation frequency.' : '',
    ]);
    return { id, gameId: String(game), name: p.player || p.name || id, team: p.team || '', position: p.position || '', headshot: p.headshot || null, teamId: p.teamId || null,
      market, marketLabel: config.label, unit: config.unit, status: availability.unavailable ? 'unavailable' : point === null ? 'unavailable' : forecastStale ? 'stale' : 'experimental',
      point, pointIsProbability, interval, probability, sampleCount: finite(f.sampleCount), version: f.version || board.forecastModel?.version || board.model?.version || null,
      availability: { status: availability.status || 'Unknown', unavailable: !!availability.unavailable, stale: !!availability.stale },
      line: prop ? { value: prop.line, bookmaker: prop.bookmaker || 'Book unspecified', status: lineStatus, basis: prop.basis || null, fetchedAt: prop.fetchedAt || null } : null,
      reasons };
  }).sort((a, b) => (a.point === null) - (b.point === null) || (b.point ?? 0) - (a.point ?? 0) || a.name.localeCompare(b.name));
}

export class SimulationPropsStore {
  constructor({ nfl, mlb, sports, now = () => Date.now() }) { this.nfl = nfl; this.mlb = mlb; this.sports = sports; this.now = now; }
  async board(input = {}) {
    const q = simulationQuery(input, this.now()), markets = simulationPropMarkets(q.sport), market = input.market || markets[0].key;
    if (!markets.some(m => m.key === market)) throw fail('Choose a supported player prop market.');
    if (!q.game) throw fail('Select a matchup for player props.');
    let board, kickoff;
    if (q.sport === 'nfl') {
      const { rows } = await this.nfl.provider.load('schedule');
      const game = rows.find(g => g.game_id === q.game && g.gameday === q.date && g.game_type !== 'PRE');
      if (!game) throw fail('Matchup not found on this date.', 404);
      kickoff = kickoffTime(game);
      board = await this.nfl.board({ season: game.season, week: game.week, market, view: 'board' });
    } else if (q.sport === 'mlb') {
      board = await this.mlb.board({ date: q.date, market });
      if (!(board.games || []).some(g => String(g.gameId) === q.game)) throw fail('Matchup not found on this date.', 404);
    } else {
      board = await this.sports.board({ sport: q.sport, date: q.date, game: q.game, market });
      if (String(board.game?.id) !== q.game) throw fail('Matchup not found on this date.', 404);
    }
    const players = simulationPropRows(board, { ...q, market, now: this.now(), kickoff });
    return { sport: q.sport, gameId: q.game, date: q.date, market, markets, players, stale: !!board.stale, fetchedAt: board.fetchedAt || null,
      status: players.length ? 'available' : 'empty', warnings: unique([...(board.warnings || []), ...(board.props?.warnings || []), board.warning, board.props?.error,
        'Historical player boards may use later roster or lineup information. They are not archived forecasts captured before the game and are excluded from game-simulation validation.']),
      method: 'Existing player-model forecasts for this matchup. They are not draws from the game-score simulation, are not constrained to its score, and do not model same-game prop correlations. Simulation count and seed do not change these forecasts.',
      researchUrl: '/' + q.sport + '?' + new URLSearchParams(q.sport === 'nfl' ? { market, season: board.current?.season || '', week: board.current?.week || '' } : { date: q.date, game: q.game, market }) };
  }
}
