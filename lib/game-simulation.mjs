import { createHash, randomBytes } from 'node:crypto';
import { buildGamePrior, GAME_MODEL_VERSION, randomGenerator, footballPoints, inningRuns, impliedProbability } from './live-game-model.mjs';
import { devig } from '../public/betting-math.js';
import { regulationPriorRows } from './simulation-history.mjs';
import { nflOvertimeRules, automaticRunnerEligible, skipBottom } from './simulation-rules.mjs';

export const SIMULATION_VERSION = 'pregame-score-simulation-v3';
// Same PRNG namespace; v3 changes score basis and withholds NFL continuation.
export const SIMULATION_RANDOM_VERSION = 'pregame-score-simulation-v1';
export const SIMULATION_SPORTS = ['nfl', 'nba', 'wnba', 'mlb'];
export const SIMULATION_DEFAULTS = Object.freeze({ simulations: 10000, minimum: 1000, maximum: 50000 });
const sides = ['away', 'home'];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const bad = message => Object.assign(Error(message), { status: 400 });
const normal = rng => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10);
const earlier = (row, cutoff) => validDate(row?.date) && row.date.slice(0, 10) < cutoff;

export function simulationOptions(input = {}) {
  const simulations = input.simulations === undefined ? SIMULATION_DEFAULTS.simulations : Number(input.simulations);
  if (!Number.isInteger(simulations) || simulations < 1000 || simulations > 50000) throw bad('Simulation count must be an integer from 1,000 to 50,000.');
  const seed = input.seed === undefined || input.seed === '' ? undefined : input.seed;
  if (seed !== undefined && (typeof seed !== 'string' || seed.length > 128 || /[\x00-\x1f]/.test(seed))) throw bad('Seed must be text of at most 128 characters.');
  return { simulations, seed };
}

export function probabilityInterval(wins, n) {
  if (!n) return null;
  const p = wins / n, z2 = 1.96 ** 2, center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = 1.96 * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n);
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  const q = p => sorted[Math.floor((n - 1) * p)];
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return { mean: mean(values), median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p10: q(.1), p90: q(.9), pmf: [...counts].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count, probability: count / n })) };
}

// These are the existing live model's scoring families and overtime assumptions.
// No player ratings or sportsbook prices enter the team-strength baseline.
function timedGame(sport, prior, postseason, rng) {
  const basketball = sport !== 'nfl';
  const scores = sides.map(side => {
    const t = prior.teams[side];
    return basketball ? Math.max(0, Math.round(t.expected + normal(rng) * Math.sqrt(t.variance))) : footballPoints(t.expected, rng);
  });
  const overtime = scores[0] === scores[1];
  // NFL OT event/clock distributions are not validated. Report regulation only.
  if (overtime && basketball) {
    const fraction = 300 / prior.config.duration;
    for (let ot = 0; ot < 100 && scores[0] === scores[1]; ot++) sides.forEach((side, i) => {
      const t = prior.teams[side];
      scores[i] += Math.max(0, Math.round(t.expected * fraction + normal(rng) * Math.sqrt(t.variance * fraction)));
    });
    if (scores[0] === scores[1]) throw Error('Overtime did not resolve; no result was published.');
  }
  return { scores, overtime };
}

function baseballGame(prior, regularSeason, rng) {
  const scores = [0, 0];
  for (let inning = 1; inning <= 100; inning++) {
    for (let i = 0; i < 2; i++) {
      if (i === 1 && skipBottom(inning, scores[1], scores[0])) return { scores, overtime: inning > 9 };
      let runs = inningRuns(prior.teams[sides[i]].expected / 9, 3, rng);
      if (inning > 9 && regularSeason && rng() < .48) runs++; // Existing runner-on-second approximation.
      scores[i] += inning >= 9 && i === 1 ? Math.min(runs, Math.max(0, scores[0] - scores[1] + 1)) : runs;
    }
    if (inning >= 9 && scores[0] !== scores[1]) return { scores, overtime: inning > 9 };
  }
  throw Error('Extra innings did not resolve; no result was published.');
}

export function simulateGame({ sport, game, history = [], stale = false, sources = [], ...input }) {
  const options = simulationOptions(input), seed = options.seed ?? randomBytes(12).toString('hex');
  const base = { version: SIMULATION_VERSION, randomVersion: SIMULATION_RANDOM_VERSION, priorVersion: GAME_MODEL_VERSION, sport, status: 'withheld', simulations: options.simulations, seed,
    validation: 'experimental', warnings: [], teams: [], sources };
  const pause = warning => ({ ...base, warnings: [warning] });
  if (!SIMULATION_SPORTS.includes(sport)) return pause('Game simulation is available for NFL, NBA, WNBA and MLB. No game-score model is connected for this sport.');
  const targetDate = game?.officialDate || game?.date;
  const cutoff = typeof targetDate === 'string' ? targetDate.slice(0, 10) : '';
  if (typeof game?.id !== 'string' || !game.id || !validDate(targetDate)
    || !Array.isArray(game.teams) || game.teams.length !== 2 || !sides.every(side => game.teams.some(t => t && t.homeAway === side && typeof t.id === 'string' && t.id && (sport !== 'nfl' || typeof t.abbreviation === 'string' && t.abbreviation)))
    || game.teams[0].id === game.teams[1].id || sport === 'nfl' && game.teams[0].abbreviation === game.teams[1].abbreviation) throw bad('A valid date and two distinct home/away teams are required.');
  if (sport === 'nfl' && typeof game.postseason !== 'boolean' || sport === 'mlb' && typeof game.regularSeason !== 'boolean') return pause('Season type is unknown; overtime rules cannot be selected safely.');
  if (sport === 'mlb' && game.scheduledInnings !== 9) return pause('Only confirmed nine-inning MLB schedules are supported.');
  const season = Number(game.season ?? cutoff.slice(0, 4));
  const runner = sport === 'mlb' ? automaticRunnerEligible({ season, regularSeason: game.regularSeason, scheduledInnings: game.scheduledInnings }) : false;
  if (sport === 'mlb' && runner === null) return pause('MLB continuation rules are verified only for nine-inning regular/postseason games from 2005 through 2026.');
  if (input.publicationMode === 'faithful') return pause('Faithful historical replay is unavailable: no immutable row-level pregame snapshots are connected. Unproven inputs are excluded from this mode.');
  if (input.publicationMode && input.publicationMode !== 'retrospective') throw bad('Unknown publication mode.');
  if (game.interrupted) return pause('The selected game is postponed, suspended or cancelled.');
  if (stale) return pause('Schedule or score history is stale or unavailable. Refresh the sources before simulating.');
  if (!Array.isArray(history)) throw bad('Score history must be an array.');
  // A second copy lacking publication metadata must not bypass a known later
  // availability time for the same completed game.
  const unavailableIds = new Set(history.filter(g => g?.complete && earlier(g, cutoff) && g.availableAt != null
    && !(validDate(g.availableAt) && Date.parse(g.availableAt) < Date.parse(cutoff))).map(g => String(g.id)));
  const valid = history.filter(g => g?.complete === true && g.id != null && String(g.id) !== ''
    && typeof g.home === 'string' && typeof g.away === 'string' && g.home && g.away && g.home !== g.away && earlier(g, cutoff)
    && String(g.id) !== String(game.id) && !unavailableIds.has(String(g.id))
    && (g.availableAt == null || validDate(g.availableAt) && Date.parse(g.availableAt) < Date.parse(cutoff))
    && [g.homeScore, g.awayScore].every(v => Number.isInteger(v) && v >= 0 && v <= 1000 && !(sport === 'nfl' && v === 1)));
  const unique = new Map(), conflicts = new Set();
  for (const row of valid) {
    const id = String(row.id), old = unique.get(id);
    if (old && (['home', 'away', 'date', 'homeScore', 'awayScore', 'availableAt'].some(key => old[key] !== row[key])
      || JSON.stringify(old.regulation) !== JSON.stringify(row.regulation))) conflicts.add(id);
    unique.set(id, row);
  }
  const clean = [...unique.values()].filter(g => !conflicts.has(String(g.id))).sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const window = clean.filter(g => Date.parse(cutoff) - Date.parse(g.date) < 450 * 86400000);
  const regulation = regulationPriorRows(window), included = new Set(regulation.map(g => g.id));
  const scoreBasis = { basis: 'regulation', eligible: window.length, included: regulation.length,
    excluded: window.filter(g => !included.has(g.id)).map(g => ({ id: g.id, reason: 'regulation scoring not established' })),
    continuationRemoved: regulation.filter(g => { const original = unique.get(String(g.id)); return original.homeScore !== g.homeScore || original.awayScore !== g.awayScore; }).length };
  const prior = buildGamePrior({ sport, game, history: regulation });
  if (!prior?.available) return { ...pause(`Insufficient regulation-only scores: at least ${prior?.minimumGames || 'several'} verified games per team are required. ${scoreBasis.excluded.length} histories lack regulation evidence.`), scoreBasis, sampleCounts: prior?.teams };
  if (game.neutralSite === true) for (const side of sides) {
    const t = prior.teams[side], opponent = prior.teams[side === 'home' ? 'away' : 'home'];
    t.expected = clamp((t.offense + opponent.defense) / 2, prior.leagueMean * .45, prior.leagueMean * 1.65);
  }
  const warnings = [
    'Experimental probabilities. More runs reduce Monte Carlo noise; they do not establish model accuracy.',
    'Player availability, current lineups, weather and pregame pace are not inputs to this game-score model. Unknown inputs are not treated as confirmed absences or zero effects.',
    'Only verified regulation scores enter the historical prior. Inherited league mean and variance pseudo-observations have no regulation-only training provenance and remain uncalibrated.',
    'Team scores are independent before continuation rules; shared pace and game-script correlation are not modeled. Team histories also contribute to the league prior and are not independent evidence.',
    'Historical feeds can contain later corrections. Date filtering does not prove that every input was published before the original prediction time.',
    sport === 'nfl' ? 'NFL outputs stop at regulation. A tie means overtime would be needed, not a final NFL tie. Final win/tie probabilities, overtime scoring and full-game market comparisons are withheld; no fitted possession/clock model is available.'
      : sport === 'mlb' ? 'Run clustering, automatic-runner scoring and walk-offs are approximate. Walk-off home-run overshoots, starting pitchers and bullpens are not modeled.'
        : 'Rounded score distributions and five-minute overtime continuations do not simulate possessions, lineups or intentional fouls.',
  ];
  if (scoreBasis.excluded.length) warnings.push(`${scoreBasis.excluded.length} earlier games lack reliable regulation scores and were excluded from every prior calculation. Missing overtime histories can create selection bias.`);
  if (sport === 'mlb') warnings.push('MLB totals and margins are aggregate approximations, not event-faithful final-score distributions. Full-game market comparisons are withheld because walk-off home-run margins and batting exposure are unmodeled.');
  if (game.state !== 'pre') warnings.push('Historical pregame reconstruction: selected-game scores and live statistics are excluded. This was not a forecast captured before the game.');
  if (game.neutralSite == null) warnings.push('Neutral-site status is unverified; the scheduled home designation is used.');
  if (conflicts.size) warnings.push(`${conflicts.size} conflicting historical game IDs were excluded.`);
  const accepted = new Set(valid);
  const malformed = history.filter(g => g?.complete && (!validDate(g.date) || earlier(g, cutoff)) && !accepted.has(g)).length;
  if (malformed) warnings.push(`${malformed} historical rows were excluded because their scores, identifiers or availability times were invalid.`);
  const reviewThreshold = { nfl: 80, nba: 200, wnba: 160, mlb: 35 }[sport];
  if (clean.some(g => (Date.parse(cutoff) - Date.parse(g.date)) < 450 * 86400000 && Math.max(g.homeScore, g.awayScore) > reviewThreshold)) warnings.push(`History contains unusually high scores (above ${reviewThreshold} per team). These review thresholds are not sport rules; verify the source before relying on this scenario.`);
  if (sport === 'nba' || sport === 'wnba') warnings.push('The league baseline is estimated from the two teams’ schedule union, not a complete league sample.');
  for (const side of sides) {
    const t = prior.teams[side], days = (Date.parse(cutoff) - Date.parse(t.sample[0].date)) / 86400000;
    if (days > 60) warnings.push(`${t.label}: the latest completed game is ${Math.floor(days)} days old; current team strength may differ.`);
    if (t.count < prior.config.min * 2) warnings.push(`${t.label}: limited sample (${t.count} games); the league prior has substantial influence.`);
    const venue = game.neutralSite === true ? 0 : (side === 'home' ? 1 : -1) * prior.homeAdvantage / 2;
    if (Math.abs(t.expected - (t.offense + prior.teams[side === 'home' ? 'away' : 'home'].defense) / 2 - venue) > 1e-9) warnings.push(`${t.label}: the scoring baseline reached a model bound; inspect the input contributions.`);
  }
  const inputDigest = createHash('sha256').update(JSON.stringify({ sport, game: { id: game.id, cutoff, season, postseason: game.postseason, regularSeason: game.regularSeason, neutralSite: game.neutralSite }, scoreBasis, prior })).digest('hex');
  const rng = randomGenerator(`${SIMULATION_RANDOM_VERSION}:${seed}`), samples = [], n = options.simulations;
  let overtime = 0, homeWins = 0, awayWins = 0, ties = 0;
  for (let i = 0; i < n; i++) {
    const result = sport === 'mlb' ? baseballGame(prior, runner, rng) : timedGame(sport, prior, game.postseason, rng);
    samples.push(result.scores); overtime += Number(result.overtime);
    const [a, h] = result.scores;
    if (h > a) homeWins++; else if (a > h) awayWins++; else ties++;
  }
  const teams = sides.map((side, i) => {
    const t = prior.teams[side], opponent = prior.teams[sides[1 - i]], wins = i ? homeWins : awayWins;
    const venue = game.neutralSite === true ? 0 : (i ? 1 : -1) * prior.homeAdvantage / 2;
    return { id: t.id, side, label: t.label, name: game.teams.find(g => g.homeAway === side).name || t.label,
      winProbability: wins / n, monteCarloInterval95: probabilityInterval(wins, n), score: summary(samples.map(s => s[i])),
      inputs: { expected: t.expected, offense: t.offense, opponentDefense: opponent.defense, scoreVariance: t.variance, count: t.count, historyWeight: t.historyWeight, leagueWeight: 1 - t.historyWeight, sample: t.sample,
        contributions: { offense: t.offense / 2, opponentDefense: opponent.defense / 2, venue, clampAdjustment: t.expected - (t.offense + opponent.defense) / 2 - venue } } };
  });
  return { ...base, status: 'experimental', warnings, teams, game: { id: game.id, date: game.date, state: game.state }, inputDigest,
    scoreBasis, outcomeScope: sport === 'nfl' ? 'regulation-only' : 'approximate-full-game',
    continuation: sport === 'nfl' ? { status: 'withheld', rules: nflOvertimeRules(Number(game.season), game.postseason), finalProbabilities: null }
      : { status: 'approximate', automaticRunner: sport === 'mlb' ? runner : null },
    marketComparison: { available: !['nfl', 'mlb'].includes(sport), reason: sport === 'nfl' ? 'NFL scenarios end at regulation; full-game odds comparisons are withheld.' : sport === 'mlb' ? 'Aggregate walk-off margins are approximate; MLB odds comparisons are withheld.' : null },
    probabilities: { home: homeWins / n, away: awayWins / n, tie: ties / n, overtime: overtime / n },
    total: summary(samples.map(([a, h]) => a + h)), homeMargin: summary(samples.map(([a, h]) => h - a)),
    inputs: { cutoff, leagueMean: prior.leagueMean, homeAdvantage: prior.homeAdvantage, historyGames: prior.historyGames, weights: { ...prior.config },
      method: '50% venue-adjusted team offense + 50% opponent defense, then half the learned home advantage; bounded to 45–165% of league mean. Scores are recency-weighted and shrunk to the league baseline.',
      randomness: 'Team strength stays fixed across runs. Scoring noise is drawn once; no player-rating, odds or second strength adjustment is added.' },
    settlement: sport === 'nfl' ? 'Regulation only. No full-game win probabilities or final ties are estimated.' : 'Approximate full-game scenarios. MLB walk-off margins are not event-faithful. Market settlement must match the output scope.' };
}

// Manual, paired two-way quotes only. Prices are never simulation inputs.
export function compareSimulationMarket(result, { type, line = 0, firstOdds, secondOdds }) {
  if (result.status !== 'experimental') throw bad('Run an available simulation first.');
  if (result.marketComparison?.available === false) throw bad(result.marketComparison.reason);
  if (!['moneyline', 'spread', 'total'].includes(type) || !Number.isFinite(line) || Math.abs(line) > 1000 || type === 'total' && line < 0) throw bad('Invalid market or line.');
  const implied = [firstOdds, secondOdds].map(impliedProbability);
  if (implied.some(p => p === null)) throw bad('Enter two valid American odds prices (at most -100 or at least +100).');
  let first = 0, push = 0;
  if (type === 'moneyline') { first = result.probabilities.home; push = result.probabilities.tie; }
  else for (const row of (type === 'total' ? result.total : result.homeMargin).pmf) {
    const v = type === 'total' ? row.value - line : row.value + line;
    if (v > 0) first += row.probability; else if (v === 0) push += row.probability;
  }
  // Summing discrete probabilities can exceed one by floating-point epsilon.
  push = clamp(push, 0, 1); first = clamp(first, 0, 1 - push);
  const total = implied[0] + implied[1], second = Math.max(0, 1 - first - push), noVig = devig(implied, 'multiplicative');
  return { type, line, source: 'Manually entered paired prices; freshness and book rules are unverified.', overround: total - 1, pushProbability: push,
    assumptions: 'Two-way market; pushes/ties return the stake. Probabilities exclude pushes when compared with proportional no-vig prices. No profitability claim.',
    selections: [first, second].map((p, i) => ({ side: type === 'total' ? i ? 'under' : 'over' : i ? 'away' : 'home', modelProbability: p,
      conditionalModelProbability: push < 1 ? clamp(p / (1 - push), 0, 1) : null, rawImpliedProbability: implied[i], noVigMarketProbability: noVig[i],
      difference: push < 1 ? clamp(p / (1 - push), 0, 1) - noVig[i] : null })) };
}
