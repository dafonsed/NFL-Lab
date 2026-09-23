import { createHash } from 'node:crypto';
import { numeric } from './sports/normalize.mjs';

export const GAME_MODEL_VERSION = 'live-game-distribution-v1';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sum = xs => xs.reduce((a, b) => a + b, 0);
const config = {
  nfl: { mean: 22, sd: 11, duration: 3600, halfLife: 180, limit: 16, shrink: 6, min: 5 },
  nba: { mean: 112, sd: 13, duration: 2880, halfLife: 90, limit: 30, shrink: 10, min: 8 },
  wnba: { mean: 81, sd: 11, duration: 2400, halfLife: 90, limit: 30, shrink: 10, min: 8 },
  mlb: { mean: 4.5, sd: 3.2, halfLife: 60, limit: 40, shrink: 15, min: 10 },
};
export function impliedProbability(price) {
  return Number.isFinite(price) && Math.abs(price) >= 100 ? price < 0 ? -price / (100 - price) : 100 / (100 + price) : null;
}
export function fairAmerican(probability) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  // Conservative display cap: simulations cannot establish a certain outcome.
  const p = clamp(probability, .005, .995);
  return Math.round(p >= .5 ? -100 * p / (1 - p) : 100 * (1 - p) / p);
}

// A common, point-in-time score schema. Sources must establish completion.
export function nflGameHistory(schedule = []) {
  const code = t => ({ LA: 'LAR', WAS: 'WSH', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR' }[t] || t);
  return schedule.filter(g => g.game_type !== 'PRE').map(g => ({ id: g.game_id, date: g.gameday,
    home: code(g.home_team), away: code(g.away_team), homeScore: numeric(g.home_score), awayScore: numeric(g.away_score),
    complete: numeric(g.home_score) !== null && numeric(g.away_score) !== null }));
}
export function basketballGameHistory(events = []) {
  return events.map(g => ({ id: g.id, date: g.date, home: g.home?.id, away: g.away?.id, homeScore: numeric(g.home?.score), awayScore: numeric(g.away?.score), complete: g.complete }));
}
export function mlbGameHistory(games = []) {
  return games.filter(g => ['R', 'F', 'D', 'L', 'W'].includes(g.gameType)).map(g => ({ id: String(g.gamePk), date: g.officialDate || g.gameDate,
    home: String(g.teams.home.team.id), away: String(g.teams.away.team.id), homeScore: numeric(g.teams.home.score), awayScore: numeric(g.teams.away.score), complete: g.status?.abstractGameState === 'Final' }));
}

export function buildGamePrior({ sport, game, history = [] }) {
  const c = config[sport];
  if (!c) return null;
  // Exclude the entire selected date, including earlier doubleheaders. This is
  // intentionally conservative when source timestamps only contain a date.
  const cutoff = (game.officialDate || game.date || '').slice(0, 10), at = Date.parse(cutoff);
  const rows = [...new Map(history.filter(g => g.complete && String(g.id) !== String(game.id) && g.date?.slice(0, 10) < cutoff
    && at - Date.parse(g.date) < 450 * 86400000 && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore)
    && g.homeScore >= 0 && g.awayScore >= 0 && g.home && g.away && g.home !== g.away).map(g => [String(g.id), g])).values()];
  const weight = g => Math.exp(-Math.LN2 * Math.max(0, at - Date.parse(g.date)) / (c.halfLife * 86400000));
  const mass = sum(rows.map(weight));
  const leagueMean = (c.mean * 40 + sum(rows.map(g => weight(g) * (g.homeScore + g.awayScore) / 2))) / (40 + mass);
  const homeAdvantage = clamp(sum(rows.map(g => weight(g) * (g.homeScore - g.awayScore))) / (mass + 80), -c.mean * .08, c.mean * .08);
  const teams = {};
  for (const side of ['away', 'home']) {
    const team = game.teams.find(t => t.homeAway === side);
    if (!team) return null;
    const id = sport === 'nfl' ? team.abbreviation : team.id;
    const sample = rows.filter(g => g.home === id || g.away === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, c.limit);
    const w = sum(sample.map(weight)), scored = g => g.home === id ? g.homeScore : g.awayScore, allowed = g => g.home === id ? g.awayScore : g.homeScore;
    const venue = g => g.home === id ? homeAdvantage / 2 : -homeAdvantage / 2;
    const offense = (c.shrink * leagueMean + sum(sample.map(g => weight(g) * (scored(g) - venue(g))))) / (c.shrink + w);
    const defense = (c.shrink * leagueMean + sum(sample.map(g => weight(g) * (allowed(g) + venue(g))))) / (c.shrink + w);
    const variance = (c.shrink * c.sd ** 2 + sum(sample.map(g => weight(g) * (scored(g) - venue(g) - offense) ** 2))) / (c.shrink + w);
    teams[side] = { id: team.id, label: team.abbreviation, offense, defense, variance, count: sample.length, historyWeight: w / (w + c.shrink), sample: sample.map(g => ({ id: g.id, date: g.date })) };
  }
  if (Object.values(teams).some(t => t.count < c.min)) return { available: false, teams, minimumGames: c.min };
  for (const side of ['away', 'home']) {
    const t = teams[side], opponent = teams[side === 'home' ? 'away' : 'home'];
    t.expected = clamp((t.offense + opponent.defense) / 2 + (side === 'home' ? 1 : -1) * homeAdvantage / 2, leagueMean * .45, leagueMean * 1.65);
  }
  return { available: true, teams, leagueMean, homeAdvantage, historyGames: rows.length, cutoff, config: c };
}

function randomGenerator(seed) {
  let s = createHash('sha256').update(seed).digest().readUInt32LE();
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const normal = rng => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
function poisson(mean, rng) {
  const end = Math.exp(-Math.max(0, mean)); let p = 1, k = 0;
  do { k++; p *= rng(); } while (p > end && k < 500);
  return k - 1;
}
function footballPoints(mean, rng) {
  let points = 0;
  for (let n = poisson(mean / 5.73, rng); n > 0; n--) { const u = rng(); points += u < .02 ? 2 : u < .32 ? 3 : u < .36 ? 6 : u < .93 ? 7 : 8; }
  return points;
}
function inningRuns(mean, outs, rng) {
  // Geometric runs per out gives a negative-binomial inning, allowing clusters.
  if (!(mean > 0) || outs <= 0) return 0;
  const p = 1 / (1 + mean / 3);
  let runs = 0;
  for (let n = 0; n < outs; n++) runs += Math.floor(Math.log(Math.max(1e-12, rng())) / Math.log(1 - p));
  return runs;
}
function baseballFinish(game, rates, rng) {
  let home = game.teams.find(t => t.homeAway === 'home').score, away = game.teams.find(t => t.homeAway === 'away').score;
  for (let inning = game.inning; inning <= game.scheduledInnings + 20; inning++) {
    for (const side of ['away', 'home']) {
      if (inning === game.inning && !game.top && side === 'away') continue;
      if (inning >= game.scheduledInnings && side === 'home' && home > away) return [away, home];
      const current = inning === game.inning && (game.top ? side === 'away' : side === 'home');
      const outs = current ? 3 - game.outs : 3;
      let runs = inningRuns(rates[side] / 9, outs, rng);
      const bases = current ? game.bases : inning > game.scheduledInnings && game.regularSeason ? ['second'] : [];
      for (const base of bases || []) {
        // Explicit approximation; source base occupancy is retained, never guessed.
        const chance = ({ first: .30, second: .48, third: .70 }[base] || 0) * outs / 3;
        if (rng() < chance) runs++;
      }
      if (side === 'away') away += runs;
      else home += inning >= game.scheduledInnings ? Math.min(runs, Math.max(0, away - home + 1)) : runs;
    }
    if (inning >= game.scheduledInnings && home !== away) return [away, home];
  }
  // Vanishingly rare unresolved extra innings: retain a tie, not an invented win.
  return [away, home];
}
function timedFinish(game, prior, pace, rng) {
  const c = prior.config, fraction = game.remainingSeconds / c.duration;
  const scores = {};
  for (const side of ['away', 'home']) {
    const t = prior.teams[side], current = game.teams.find(g => g.homeAway === side).score;
    const possession = game.sport === 'nfl' && !game.halftime && game.possession ? (game.possession === t.id ? 1 : -1) * Math.min(1, game.remainingSeconds / 600) : 0;
    const remaining = Math.max(0, t.expected * fraction * pace + possession);
    scores[side] = current + (game.sport === 'nfl' ? footballPoints(remaining, rng) : Math.max(0, Math.round(remaining + normal(rng) * Math.sqrt(t.variance * fraction + t.variance * fraction ** 2 / (t.count + c.shrink)))));
  }
  if (scores.home === scores.away) {
    if (game.sport === 'nfl') {
      // Approximate terminal overtime outcomes; do not pretend to model drives.
      const pHome = clamp(.5 + (prior.teams.home.expected - prior.teams.away.expected) / 80, .3, .7);
      if (game.postseason || rng() > .08) scores[rng() < pHome ? 'home' : 'away'] += rng() < .5 ? 3 : 6;
    } else {
      for (let ot = 0; ot < 12 && scores.home === scores.away; ot++) for (const side of ['away', 'home']) {
        const t = prior.teams[side], f = 300 / c.duration;
        scores[side] += Math.max(0, Math.round(t.expected * f * pace + normal(rng) * Math.sqrt(t.variance * f)));
      }
    }
  }
  return [scores.away, scores.home];
}
const quantile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)];
function outcome(samples, key, side, line = 0) {
  let wins = 0, pushes = 0;
  for (const [away, home] of samples) {
    const value = key === 'total' ? (away + home - line) * (side === 'over' ? 1 : -1) : (side === 'home' ? home - away : away - home) + (key === 'pointSpread' ? line : 0);
    if (value > 0) wins++; else if (value === 0) pushes++;
  }
  // Small symmetric smoothing avoids 0/100% claims from a finite simulation.
  const probability = (wins + .5) / (samples.length + 1), pushProbability = pushes / (samples.length + 1);
  const conditionalProbability = probability / (1 - pushProbability);
  return { probability, pushProbability, conditionalProbability, fairOdds: fairAmerican(conditionalProbability) };
}
export function compareGameMarkets(odds, samples) {
  return (odds?.books || []).map(book => ({ name: book.name, markets: book.markets.map(m => {
    const [a, b] = m.selections, paired = m.selections.length === 2 && a.side !== b.side && (m.key === 'moneyline' || (m.key === 'pointSpread' ? a.line === -b.line : a.line === b.line));
    const overround = paired ? sum(m.selections.map(s => impliedProbability(s.odds))) : null;
    return { key: m.key, label: m.label, selections: m.selections.map(s => {
      const estimate = outcome(samples, m.key, s.side, s.line), implied = impliedProbability(s.odds);
      const marketProbability = paired && overround > 0 ? implied / overround : null;
      return { ...s, ...estimate, impliedProbability: implied, marketProbability, probabilityGap: marketProbability === null ? null : estimate.conditionalProbability - marketProbability };
    }) };
  }) }));
}

export function projectLiveGame({ sport, game, history, odds, teamStats = [], stale = false, historyStale = false, now = Date.now(), simulations = 12000 }) {
  const base = { version: GAME_MODEL_VERSION, status: 'withheld', reasons: [], books: [], teams: [], calibration: 'Experimental: live probabilities have not been calibrated against timestamped in-game outcomes.', settlement: 'Full-game estimate with approximate overtime / extra innings; a final tie is treated as a push. Check your book’s settlement rules.' };
  const pause = reason => ({ ...base, reasons: [reason] });
  const c = config[sport];
  if (!c || !game) return pause('Select a supported game.');
  if (game.state !== 'in') return pause(game.state === 'post' ? 'Game finished. Archived prices are not live predictions.' : 'Fair live odds activate after the game starts.');
  if (stale || historyStale) return pause('Live scores or historical inputs are stale or unavailable. Fair odds are paused.');
  if (game.interrupted) return pause('Game delayed or suspended. Fair odds are paused.');
  if (game.teams?.length !== 2 || !['home', 'away'].every(side => game.teams.some(t => t.homeAway === side && Number.isInteger(t.score) && t.score >= 0))) return pause('Both current team scores are required.');
  if (sport === 'mlb') {
    if (!Number.isInteger(game.inning) || game.inning < 1 || game.inning > game.scheduledInnings || game.scheduledInnings !== 9 || !Number.isInteger(game.outs) || game.outs < 0 || game.outs > 2 || typeof game.top !== 'boolean' || !Array.isArray(game.bases)) return pause('A complete regulation inning, outs and base state is required. Inning transitions and extra innings pause estimates.');
  } else if (!Number.isFinite(game.remainingSeconds) || game.remainingSeconds <= 120 || game.remainingSeconds > c.duration || !Number.isInteger(game.period) || game.period < 1 || game.period > 4) return pause('Fair odds pause in the final two minutes, overtime, or when the regulation clock is incomplete.');
  const prior = buildGamePrior({ sport, game, history });
  if (!prior?.available) return pause(`At least ${c.min} earlier completed games per team are required for fair odds.`);
  let pace = 1;
  const elapsed = c.duration ? 1 - game.remainingSeconds / c.duration : 0;
  if (sport !== 'mlb' && elapsed >= .15 && teamStats.length === 2) {
    const exposure = teamStats.map(t => sport === 'nfl' ? t.plays : t.possessions);
    const baseline = sport === 'nfl' ? 64 : sport === 'nba' ? 99 : 80;
    if (exposure.every(x => Number.isFinite(x) && x >= 0)) pace = 1 + .3 * (clamp(sum(exposure) / 2 / elapsed / baseline, .75, 1.25) - 1);
  }
  const rng = randomGenerator(JSON.stringify({ version: base.version, sport, game: { id: game.id, scores: game.teams.map(t => t.score), remaining: game.remainingSeconds, period: game.period, possession: game.possession, halftime: game.halftime, inning: game.inning, top: game.top, outs: game.outs, bases: game.bases }, prior, pace }));
  const n = clamp(Math.floor(simulations) || 12000, 2000, 30000), samples = [];
  for (let i = 0; i < n; i++) samples.push(sport === 'mlb' ? baseballFinish(game, { away: prior.teams.away.expected, home: prior.teams.home.expected }, rng) : timedFinish({ ...game, sport }, prior, pace, rng));
  const margins = samples.map(([a, h]) => h - a), totals = samples.map(([a, h]) => a + h);
  const teams = ['away', 'home'].map((side, index) => ({ ...prior.teams[side], side, projectedScore: sum(samples.map(s => s[index])) / n, ...outcome(samples, 'moneyline', side) }));
  const favorite = [...teams].sort((a, b) => b.probability - a.probability)[0], away = game.teams.find(t => t.homeAway === 'away'), home = game.teams.find(t => t.homeAway === 'home');
  const reasons = [
    `${home.abbreviation} ${home.score}, ${away.abbreviation} ${away.score}. ${sport === 'mlb' ? `${game.top ? 'Top' : 'Bottom'} ${game.inning}, ${game.outs} outs and ${game.bases.length} runner(s) on base.` : `${(game.remainingSeconds / 60).toFixed(1)} regulation minutes remain.`} Recorded scores are kept in every simulation.`,
    ...teams.map(t => `${t.label}: ${t.count} earlier games; venue-adjusted scoring ${t.offense.toFixed(1)} and points/runs allowed ${t.defense.toFixed(1)} per game after shrinkage. Against this opponent, the full-game scoring baseline is ${t.expected.toFixed(1)}. History receives ${Math.round(t.historyWeight * 100)}% weight; the league baseline receives the rest.`),
    sport === 'mlb' ? 'Remaining half-innings are simulated with clustered run scoring, current runners, a skipped bottom ninth when appropriate, and approximate walk-offs / extra innings.' : `Remaining scoring uses team strength × remaining clock × ${pace.toFixed(3)} pace. ${sport === 'nfl' ? 'Possession shifts up to one expected point toward the team with the ball; scoring uses football point increments.' : 'Earlier scoring variance supplies the remaining-score uncertainty; current shooting percentage is not extrapolated.'}`,
    `${favorite.label} wins ${Math.round(favorite.probability * 100)}% of modeled finishes. The middle 80% of simulated totals spans ${quantile(totals, .1)}–${quantile(totals, .9)}; this is a scenario range, not a calibrated confidence interval.`,
  ];
  const oddsAge = now - Date.parse(odds?.fetchedAt) + (odds?.sourceAgeMs || 0);
  const comparable = odds?.status === 'available' && Number.isFinite(oddsAge) && oddsAge >= -5000 && oddsAge <= 45000;
  return { ...base, status: 'experimental', reasons, teams, simulations: n, projectedTotal: sum(totals) / n, homeMargin: sum(margins) / n,
    totalRange: [quantile(totals, .1), quantile(totals, .9)], marginRange: [quantile(margins, .1), quantile(margins, .9)],
    books: comparable ? compareGameMarkets({ ...odds, books: odds.books.map(b => ({ ...b, markets: b.markets.map(m => ({ ...m, selections: m.selections.filter(s => s.basis === 'live') })).filter(m => m.selections.length) })) }, samples) : [],
    comparisonStatus: comparable ? 'available' : 'unavailable', cutoff: prior.cutoff,
    limits: sport === 'mlb' ? 'No batter/pitcher matchup, bullpen availability or weather adjustment. Runner advancement, extra-inning scoring and walk-off margins are approximations; walk-off home-run overshoots are not modeled.' : sport === 'nfl' ? 'No down/distance, field position, timeouts, injury or weather adjustment. Overtime uses a simplified terminal scoring model, not drive sequencing.' : 'No live lineup, injury, timeout or intentional-foul model. Overtime uses five-minute scoring continuations. Final two-minute estimates are withheld.' };
}
