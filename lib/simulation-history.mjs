// Simulation-only score adapters. Final scores remain untouched for evaluation.
import { nflGameHistory, basketballGameHistory, mlbGameHistory } from './live-game-model.mjs';
import { gameInfo } from './sports/normalize.mjs';

const number = x => x == null || typeof x === 'string' && !x.trim() ? null : Number(x?.value ?? x);
const valid = x => Number.isInteger(x) && x >= 0;
const stamp = (row, homeScore, awayScore, method) => valid(homeScore) && valid(awayScore)
  && homeScore <= row.homeScore && awayScore <= row.awayScore
  ? { ...row, regulation: { homeScore, awayScore, method } } : row;

export function nflRegulationIndex(plays) {
  const groups = new Map();
  for (const p of plays) {
    if (number(p.qtr) !== 4 || number(p.quarter_seconds_remaining) !== 0) continue;
    const old = groups.get(p.game_id);
    if (!old || Number(p.play_id) > Number(old.play_id)) groups.set(p.game_id, p);
  }
  return new Map([...groups].flatMap(([id, p]) => {
    const h = number(p.total_home_score), a = number(p.total_away_score);
    // Only use tied end-of-fourth records for games marked overtime by schedule.
    return valid(h) && h === a ? [[id, { homeScore: h, awayScore: a }]] : [];
  }));
}

export function simulationNflHistory(schedule, regulationIndex = new Map()) {
  const raw = new Map(schedule.map(g => [g.game_id, g]));
  return nflGameHistory(schedule).map(row => {
    const g = raw.get(row.id), ot = number(g.overtime);
    if (ot === 0) return stamp(row, row.homeScore, row.awayScore, 'schedule: no overtime');
    const r = regulationIndex.get(row.id);
    return ot === 1 && r ? stamp(row, r.homeScore, r.awayScore, 'play-by-play: end of quarter 4') : row;
  });
}

export function simulationBasketballHistory(events) {
  return events.map(e => {
    const row = basketballGameHistory([gameInfo(e)])[0], c = e.competitions?.[0];
    const lineCounts = c?.competitors?.map(t => t.linescores?.length);
    const period = number((c?.status || e.status)?.period)
      ?? (lineCounts?.length === 2 && lineCounts[0] === lineCounts[1] ? lineCounts[0] : null);
    if (!row.complete || !Number.isInteger(period) || period < 4) return row;
    const points = side => {
      const t = c.competitors.find(t => t.homeAway === side), lines = t?.linescores;
      if (!Array.isArray(lines) || lines.length !== period) return null;
      const scores = lines.map(l => number(l.value ?? l.displayValue));
      if (!scores.every(valid) || scores.reduce((a, b) => a + b, 0) !== row[side + 'Score']) return null;
      return scores.slice(0, 4).reduce((a, b) => a + b, 0);
    };
    if (period === 4) return stamp(row, row.homeScore, row.awayScore, 'completed four-period game');
    const h = points('home'), a = points('away');
    return h === a ? stamp(row, h, a, 'reconciled quarter linescores: first four periods') : row;
  });
}

export function mlbRegulationHistory(games) {
  return games.flatMap(g => mlbGameHistory([g]).map(row => {
    const innings = g.linescore?.innings;
    if (g.scheduledInnings !== 9 || !row.complete || !Array.isArray(innings) || innings.length < 9) return row;
    if (!innings.every((r, i) => r.num === i + 1)) return row;
    const points = side => {
      const scores = innings.map((r, i) => {
        const n = number(r[side]?.runs);
        // An unplayed bottom ninth is not a zero guessed from a missing feed:
        // accept only the terminal home-winning nine-inning row, reconciled below.
        return n === null && side === 'home' && i === 8 && innings.length === 9 && row.homeScore > row.awayScore ? 0 : n;
      });
      if (!scores.every(valid) || scores.reduce((a, b) => a + b, 0) !== row[side + 'Score']) return null;
      return scores.slice(0, 9).reduce((a, b) => a + b, 0);
    };
    const h = points('home'), a = points('away');
    return innings.length === 9 || h === a ? stamp(row, h, a, 'reconciled inning linescores: first nine innings') : row;
  }));
}

export function regulationPriorRows(rows) {
  return rows.flatMap(row => {
    const r = row.regulation;
    if (!r || typeof r.method !== 'string' || !r.method || !valid(r.homeScore) || !valid(r.awayScore)
      || r.homeScore > row.homeScore || r.awayScore > row.awayScore) return [];
    // All league, offense, allowed-score, venue and variance calculations receive
    // the same regulation values. Never mix final and regulation score bases.
    return [{ ...row, homeScore: r.homeScore, awayScore: r.awayScore }];
  });
}
