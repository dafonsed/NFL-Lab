import { SPORTS } from './sports/config.mjs';
import { normalizeSummary, numeric } from './sports/normalize.mjs';
import { basketballEvent,mlbEvent } from './sports/events.mjs';
export { basketballEvent,mlbEvent };
import { MLB_MARKETS, statValue } from './mlb/markets.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sum = values => values.reduce((a, b) => a + b, 0);
const mean = values => values.length ? sum(values) / values.length : null;
export const liveMarkets = sport => sport === 'mlb' ? MLB_MARKETS : SPORTS[sport].markets;
export const marketValue = (sport, stats, market) => sport === 'mlb' ? statValue(stats, market) : SPORTS[sport].markets[market].fields.every(k => Number.isInteger(numeric(stats?.[k])) && numeric(stats[k])>=0) ? sum(SPORTS[sport].markets[market].fields.map(k => numeric(stats[k]))) : null;
export function basketballClock(value, quarterMinutes) {
  const text = String(value ?? '');
  let seconds;
  if (/^\d{1,2}:[0-5]\d(?:\.\d+)?$/.test(text)) { const [m, s] = text.split(':').map(Number); seconds = m * 60 + s; }
  else if (/^\d{1,2}(?:\.\d+)?$/.test(text) && Number(text) < 60) seconds = Number(text);
  return Number.isFinite(seconds) && seconds <= quarterMinutes * 60 ? seconds : null;
}
export function normalizeLiveBasketball(data, event, sport) {
  if (String(data.header?.id) !== event.id || data.header?.competitions?.[0]?.competitors?.length !== 2 || !data.boxscore) throw Error('Live box score is incomplete or belongs to another game.');
  const normalized = normalizeSummary(data, sport, event), raw = data.header.competitions[0], status = raw.status || {};
  const last = data.plays?.at(-1), halftime = /halftime/i.test(status.type?.name || '');
  const period = numeric(status.period) ?? numeric(last?.period?.number), clock = status.displayClock ?? last?.clock?.displayValue;
  const duration = SPORTS[sport].duration, seconds = basketballClock(clock, duration / 4);
  const game = { ...event, ...basketballEvent({ ...data.header, date: event.date }, sport), period, clock, halftime,
    remainingSeconds: halftime ? duration * 30 : period >= 1 && period <= 4 && seconds !== null ? (4 - period) * duration * 15 + seconds : null,
    interrupted: /delay|suspend|postpone|cancel/i.test(status.type?.name || ''),
    lastPlay: last ? { id: String(last.id), text: last.text, at: last.wallclock || null } : null };
  const flags = new Map((data.boxscore.players || []).flatMap(t => (t.statistics || []).flatMap(s => (s.athletes || []).map(a => [String(a.athlete?.id), a]))));
  const players = normalized.players.filter(p => /^\d+$/.test(p.id)).map(p => ({ ...p, name: p.player, team: game.teams.find(t => t.id === p.teamId)?.abbreviation,
    liveUnavailable: flags.get(p.id)?.ejected ? 'Ejected' : numeric(p.stats.fouls) >= 6 ? 'Fouled out' : p.scratched && !(p.minutes > 0) ? 'Did not play' : null }));
  const teamStats = normalized.teams.map(t => ({ id: t.id, possessions: ['fieldGoalsAttempted', 'freeThrowsAttempted', 'offensiveRebounds', 'totalTurnovers'].every(k => Number.isFinite(t.stats[k])) ? t.stats.fieldGoalsAttempted + .44 * t.stats.freeThrowsAttempted - t.stats.offensiveRebounds + t.stats.totalTurnovers : null }));
  return { game, players, teamStats };
}

export function normalizeLiveMlb(data, event) {
  const d = data.gameData, live = data.liveData, lines = live?.linescore;
  if (String(data.gamePk) !== event.id || !d?.teams?.home || !d?.teams?.away || !live?.boxscore) throw Error('Live MLB box score is incomplete or belongs to another game.');
  const play = live.plays?.currentPlay || live.plays?.allPlays?.at(-1), pitch = play?.playEvents?.at(-1);
  const game = { ...event, state: d.status?.abstractGameState === 'Final' ? 'post' : d.status?.abstractGameState === 'Live' ? 'in' : 'pre', status: d.status?.detailedState || event.status,
    regularSeason: d.game?.type === 'R', inning: numeric(lines?.currentInning), half: lines?.inningState || lines?.inningHalf, top: typeof lines?.isTopInning === 'boolean' ? lines.isTopInning : null,
    outs: numeric(lines?.outs), balls: numeric(lines?.balls), strikes: numeric(lines?.strikes), scheduledInnings: numeric(lines?.scheduledInnings) || 9,
    interrupted: /delay|suspend|postpone|cancel/i.test(d.status?.detailedState || ''),
    bases: lines?.offense ? ['first', 'second', 'third'].filter(k => lines.offense[k]?.id) : null,
    lastPlay: play ? { id: String(play.about?.atBatIndex) + ':' + String(pitch?.index ?? ''), text: pitch?.details?.description || play.result?.description, at: pitch?.endTime || pitch?.startTime || play.about?.endTime || play.about?.startTime || null } : null,
    teams: ['away', 'home'].map(side => ({ id: String(d.teams[side].id), name: d.teams[side].name, abbreviation: d.teams[side].abbreviation, homeAway: side, score: numeric(lines?.teams?.[side]?.runs) })) };
  const players = [];
  for (const side of ['away', 'home']) {
    const box = live.boxscore.teams?.[side], team = game.teams.find(t => t.homeAway === side);
    for (const row of Object.values(box?.players || {})) {
      if (!row.person?.id) continue;
      const id = String(row.person.id), batting = row.stats?.batting || {}, pitching = row.stats?.pitching || {};
      const hitter = numeric(batting.plateAppearances) !== null && (numeric(batting.plateAppearances) > 0 || box.battingOrder?.map(String).includes(id));
      const pitcher = numeric(pitching.battersFaced) > 0 || numeric(pitching.numberOfPitches) > 0;
      if (!hitter && !pitcher) continue;
      players.push({ id, name: row.person.fullName, teamId: team.id, team: team.abbreviation, side, position: row.position?.abbreviation, stats: { hitting: batting, pitching },
        roles: [hitter && 'hitting', pitcher && 'pitching'].filter(Boolean), inLineup: Array.isArray(box.battingOrder) ? box.battingOrder.map(String).includes(id) : null,
        currentPitcher: row.gameStatus?.isCurrentPitcher === true && String(box.pitchers?.at(-1)) === id, starter: numeric(pitching.gamesStarted) === 1,
        liveUnavailable: row.gameStatus?.isOnBench === true ? 'Removed from game' : null });
    }
  }
  return { game, players };
}

export function basketballPriors(history, game, players) {
  const priors = new Map();
  for (const player of players) {
    const appearances = history.filter(h => h.game.complete && h.game.id !== game.id && Date.parse(h.game.date) < Date.parse(game.date) && Date.parse(game.date) - Date.parse(h.game.date) < 450 * 86400000)
      .sort((a, b) => Date.parse(b.game.date)-Date.parse(a.game.date)).flatMap(h => {
        const p = h.players.find(p => p.id === player.id && p.teamId === player.teamId && p.minutes > 0);
        return p ? [{ ...p, date: h.game.date, gameId: h.game.id }] : [];
      }).slice(0, 15);
    priors.set(player.id, { count: appearances.length, minutes: mean(appearances.slice(0, 5).map(p => p.minutes)), appearances, sample: appearances.map(p => ({ date: p.date, gameId: p.gameId })) });
  }
  return priors;
}

export function basketballWorkloads(players, priors, game, sport) {
  const duration = SPORTS[sport].duration, remaining = game.remainingSeconds / 60, elapsed = duration - remaining, result = new Map();
  if (!Number.isFinite(game.remainingSeconds) || elapsed <= 0) return result;
  for (const p of players) {
    const prior = priors.get(p.id);
    if (!prior || prior.count < 5 || !(p.minutes > 0) || p.liveUnavailable || p.availability?.unavailable) continue;
    const liveWeight = Math.min(.5, elapsed / duration * .5), historicalShare = clamp(prior.minutes / duration, 0, 1), observedShare = clamp(p.minutes / elapsed, 0, 1);
    const share = historicalShare * (1 - liveWeight) + observedShare * liveWeight;
    result.set(p.id, { minutes: remaining * share, liveWeight, historicalShare, observedShare, budgetScale: 1 });
  }
  // At most five player-minutes can be consumed per remaining game minute.
  for (const team of game.teams) {
    const ids = players.filter(p => p.teamId === team.id && result.has(p.id)).map(p => p.id);
    const total = sum(ids.map(id => result.get(id).minutes)), scale = total > remaining * 5 ? remaining * 5 / total : 1;
    for (const id of ids) { const w = result.get(id); w.minutes *= scale; w.budgetScale = scale; }
  }
  return result;
}

const withheld = (current, reason, status = 'withheld') => ({ current, remaining: null, projection: null, status, reasons: [reason] });
function commonReason(game, player, stale) {
  if (game.state === 'post') return 'Final box score. Live comparisons are closed.';
  if (game.state !== 'in') return 'Projections activate after the game starts.';
  if (stale) return 'Live or historical feed unavailable or stale. Refresh before comparing.';
  if (game.interrupted) return 'Game delayed or suspended. Projections paused.';
  if (player.liveUnavailable) return player.liveUnavailable + '. Projection paused.';
  if (player.availability?.unavailable || player.availability?.stale) return 'Player availability requires verification. Projection paused.';
  return null;
}
export function projectBasketball({ sport, game, player, prior, workload, market, stale }) {
  const current = marketValue(sport, player.stats, market), reason = commonReason(game, player, stale);
  if (reason) return withheld(current, reason, game.state === 'post' ? 'final' : 'withheld');
  if (current === null || !(player.minutes > 0)) return withheld(current, 'No complete live statistics and minutes for this player.');
  if (!Number.isFinite(game.remainingSeconds) || game.remainingSeconds>SPORTS[sport].duration*60 || !Number.isInteger(game.period) || game.period < 1 || game.period > 4) return withheld(current, 'A regulation clock is required; overtime is not projected.');
  if (game.remainingSeconds < 120) return withheld(current, 'Final two minutes: rotation and intentional-foul uncertainty.');
  const rows = (prior?.appearances || []).filter(p => marketValue(sport, p.stats, market) !== null);
  if (rows.length < 5 || !workload) return withheld(current, 'At least five earlier appearances with this team and complete market stats are required.');
  if(!Number.isFinite(workload.minutes)||workload.minutes<0||workload.minutes>game.remainingSeconds/60)return withheld(current,'Remaining player minutes are invalid.');
  const elapsed = SPORTS[sport].duration - game.remainingSeconds / 60;
  if (player.minutes > elapsed + 1) return withheld(current, 'Player minutes and game clock are inconsistent.');
  const totalMinutes = sum(rows.map(p => p.minutes));
  const rates = SPORTS[sport].markets[market].fields.map(field => ({ history: sum(rows.map(p => numeric(p.stats[field]))) / totalMinutes, current: numeric(player.stats[field]) / player.minutes }));
  // Bound each component independently so combo props remain additive when
  // they use the same complete sample as their individual component markets.
  const historicalRate = sum(rates.map(r => r.history));
  const liveWeight = player.minutes / (player.minutes + 100), liveRate = sum(rates.map(r => clamp(r.current, 0, r.history * 2)));
  const rate = historicalRate * (1 - liveWeight) + liveRate * liveWeight, remaining = workload.minutes * rate;
  return { current, remaining, projection: current + remaining, status: 'experimental', reasons: [], breakdown: { unit: 'minutes', opportunities: workload.minutes, rate,
    inputs: [['Minutes played', player.minutes], ['Historical minutes / game', prior.minutes], ['Live role weight', workload.liveWeight, 'percent'], ['Live production-rate weight', liveWeight, 'percent'], ['Historical production / minute', historicalRate], ['Live production / minute (bounded)', liveRate], ['Team minute budget scale', workload.budgetScale]] } };
}

export function mlbPriors(people, game, players, completed) {
  const priors = new Map();
  for (const player of players) {
    const person = people.find(p => String(p.id) === player.id), groups = {};
    for (const role of player.roles) {
      const rows = (person?.stats || []).filter(s => s.type?.displayName === 'gameLog' && s.group?.displayName === role).flatMap(s => s.splits || [])
        .filter(r => r.date < game.officialDate && r.date >= new Date(Date.parse(game.officialDate) - 450 * 86400000).toISOString().slice(0, 10) && String(r.game?.gamePk) !== game.id && completed.has(String(r.game?.gamePk)) && (role !== 'pitching' || numeric(r.stat.gamesStarted) === 1))
        .sort((a, b) => b.date.localeCompare(a.date));
      const unique = [...new Map(rows.map(r => [String(r.game.gamePk), r])).values()].slice(0, role === 'pitching' ? 10 : 30);
      groups[role] = { count: unique.length, rows: unique, sample: unique.map(r => ({ date: r.date, gameId: String(r.game.gamePk) })) };
    }
    priors.set(player.id, groups);
  }
  return priors;
}

export function remainingBattingOuts(game, side) {
  if (!Number.isInteger(game.inning) || game.inning < 1 || game.inning > game.scheduledInnings || !Number.isInteger(game.outs) || game.outs < 0 || game.outs > 3 || typeof game.top !== 'boolean') return null;
  const batting = game.top ? 'away' : 'home';
  let completed = (game.inning - 1) * 3;
  if (side === batting) completed += game.outs;
  else if (!game.top) completed += 3;
  if (side === 'home' && game.inning === game.scheduledInnings && !game.top && game.teams.find(t => t.homeAway === 'home')?.score > game.teams.find(t => t.homeAway === 'away')?.score) return 0;
  return Math.max(0, game.scheduledInnings * 3 - completed);
}
export function projectMlb({ game, player, prior, market, stale }) {
  const role = MLB_MARKETS[market].group, stats = player.stats[role], current = statValue(stats, market), reason = commonReason(game, player, stale);
  if (reason) return withheld(current, reason, game.state === 'post' ? 'final' : 'withheld');
  if (current === null) return withheld(current, 'This live statistic is unavailable; missing values are not zero.');
  const outsLeft = remainingBattingOuts(game, role === 'hitting' ? player.side : player.side === 'home' ? 'away' : 'home');
  if (outsLeft === null) return withheld(current, 'A complete regulation inning is required; extra innings are not projected.');
  if (role === 'hitting' && player.inLineup !== true) return withheld(current, 'Player is no longer in the confirmed batting order, or the order is unavailable.');
  if (role === 'pitching' && (!player.currentPitcher || !player.starter)) return withheld(current, 'Only a confirmed starter still pitching can be projected. Removed pitchers and relievers are withheld.');
  const exposure = role === 'hitting' ? 'plateAppearances' : 'battersFaced';
  const rows = (prior?.[role]?.rows || []).filter(r => numeric(r.stat[exposure]) > 0 && statValue(r.stat, market) !== null && (role === 'hitting' || numeric(r.stat.numberOfPitches) > 0 && numeric(r.stat.outs) > 0));
  if (rows.length < (role === 'hitting' ? 5 : 3)) return withheld(current, 'Not enough earlier completed appearances with complete statistics.');
  const used = numeric(stats[exposure]);
  if (!Number.isInteger(used) || used<0) return withheld(current, 'Current workload is unavailable or invalid.');
  const historicalRate = sum(rows.map(r => statValue(r.stat, market))) / sum(rows.map(r => numeric(r.stat[exposure])));
  const liveWeight = used / (used + (role === 'hitting' ? 50 : 100)), liveRate = used ? clamp(current / used, 0, historicalRate * 2) : historicalRate;
  const rate = historicalRate * (1 - liveWeight) + liveRate * liveWeight;
  let opportunities, unit, inputs;
  if (role === 'hitting') {
    // 1.43 PA/out is an explicit league baseline. Equal lineup share deliberately
    // avoids claiming an exact number of future turns from incomplete state.
    opportunities = outsLeft * 1.43 / 9; unit = 'plate appearances';
    inputs = [['Team batting outs remaining', outsLeft], ['Team PA per out baseline', 1.43], ['Lineup share', 1 / 9, 'percent']];
  } else {
    const pitches = numeric(stats.numberOfPitches);
    if (!Number.isInteger(pitches) || pitches<0) return withheld(current, 'Pitch count unavailable or invalid.');
    const budget = clamp(mean(rows.slice(0, 5).map(r => numeric(r.stat.numberOfPitches))), 40, 110);
    const pitchesPerBatter = sum(rows.map(r => numeric(r.stat.numberOfPitches))) / sum(rows.map(r => numeric(r.stat.battersFaced)));
    const outsPerBatter = sum(rows.map(r => numeric(r.stat.outs))) / sum(rows.map(r => numeric(r.stat.battersFaced)));
    if (!(outsPerBatter > 0) || !(pitchesPerBatter > 0)) return withheld(current, 'Historical pitching workload unavailable.');
    opportunities = Math.min(Math.max(0, budget - pitches) / pitchesPerBatter, outsLeft / outsPerBatter); unit = 'batters faced';
    inputs = [['Pitches thrown', pitches], ['Historical pitch budget (40–110)', budget], ['Historical pitches per batter', pitchesPerBatter], ['Opponent batting outs remaining', outsLeft]];
  }
  const remaining = Math.min(opportunities * rate, market === 'outs' ? outsLeft : Infinity);
  return { current, remaining, projection: current + remaining, status: 'experimental', reasons: [], breakdown: { unit, opportunities, rate: market === 'outs' && opportunities > 0 ? remaining / opportunities : rate,
    inputs: [...inputs, ['Historical production per opportunity', historicalRate], ['Live rate weight', liveWeight, 'percent']] } };
}

export function liveMethod(sport) {
  return { version: sport === 'mlb' ? 'live-baseball-v1' : 'live-basketball-v1', formula: 'Projected full-game total = recorded stats + remaining opportunities × blended production rate',
    sections: sport === 'mlb' ? [
      ['Batter opportunities', 'Remaining regulation batting outs × 1.43 plate appearances per out ÷ nine lineup slots. Only players still in the confirmed batting order are projected.'],
      ['Starter workload', 'Mean pitch count over the last five completed starts, bounded to 40–110 pitches, minus pitches already thrown. Historical pitches per batter converts that budget into remaining batters, capped by regulation outs.'],
      ['Production rate', 'Up to 30 earlier batting games or 10 pitching starts. Current production is blended using PA / (PA + 50) or BF / (BF + 100); live rate is capped at twice history. Five batter appearances or three starts are required.'],
      ['Uncertain roles', 'Removed pitchers, relievers, missing lineups, delays and extra innings are withheld. Pitcher removal and an unneeded bottom inning can reduce actual opportunities. Batter order timing, baserunner-specific outcomes and bullpen matchup changes are not modeled.']
    ] : [
      ['Minutes remaining', `A ${SPORTS[sport].duration}-minute regulation game. Historical share uses the last five appearances; current minutes / elapsed game minutes receives up to 50% weight. Remaining minutes across a team cannot exceed five times the remaining clock.`],
      ['Production rate', 'Production per minute from up to 15 earlier appearances with this team. Live weight is minutes / (minutes + 100), with live rate bounded to twice history. At least five complete earlier appearances are required.'],
      ['Game and player status', 'Ejections, six fouls, reported unavailability, missing statistics, stale feeds, overtime and the final two minutes pause projections. Rotation changes and in-game injuries can take time to appear; use Pause player when needed.'],
      ['Recorded means recorded', 'Every recorded statistic is retained in full. A missing field never becomes zero. Combined markets require all their component statistics.']
    ], limits: 'Experimental point estimates, without calibrated live probabilities. Full-game sportsbook settlement may include overtime or extra innings, which these regulation projections exclude. Confirm the line and settlement rules at your sportsbook.' };
}
