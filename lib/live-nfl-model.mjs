// Deliberately separate from the pregame rating and its calibrated error pools.
export const LIVE_VERSION = 'live-availability-v2';
export const LIVE_MARKETS = {
  pass_yds: { label: 'Passing yards', field: 'passing_yards', channel: 'pass', unit: 'yards' },
  rush_yds: { label: 'Rushing yards', field: 'rushing_yards', channel: 'rush', unit: 'yards' },
  rec_yds: { label: 'Receiving yards', field: 'receiving_yards', channel: 'target', unit: 'yards' },
  rec: { label: 'Receptions', field: 'receptions', channel: 'target', unit: 'receptions' },
  rush_attempts: { label: 'Rushing attempts', field: 'carries', channel: 'rush', unit: 'carries' },
  pass_attempts: { label: 'Passing attempts', field: 'attempts', channel: 'pass', unit: 'attempts' },
  pass_completions: { label: 'Completions', field: 'completions', channel: 'pass', unit: 'completions' },
  rush_rec_yds: { label: 'Rush + receiving yards', field: null, channel: 'combined', unit: 'yards' },
};
export const finite = x => (typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x)) ? Number(x) : null;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sum = (rows, field) => rows.reduce((n, r) => n + (finite(r[field]) ?? 0), 0);
const opportunity = { pass: 'attempts', rush: 'carries', target: 'targets' };
export const teamCode = t => ({ LA: 'LAR', WAS: 'WSH', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR' }[t] || t);

export const LIVE_METHOD = {
  version: LIVE_VERSION,
  status: 'Experimental · not backtested for in-game accuracy',
  formula: 'Recorded stat + remaining team opportunities × player share × production per opportunity',
  role: 'Use the last 5 completed appearances on this team. Live share weight = min(70%, team opportunities / (team opportunities + 20)) × min(1, elapsed minutes / 15). The historical share gets the balance.',
  efficiency: 'Use up to 10 earlier appearances on this team. Live efficiency weight = min(20%, player opportunities / (player opportunities + 40)); history gets the balance. Current efficiency is capped at 0–2× historical efficiency. Attempts and carries have efficiency 1.',
  pace: '65% historical team plays per game + 35% current pace after 5 elapsed minutes; live pace is bounded to 75–125% of history. Before 5 minutes use history only.',
  mix: 'Pass/run mix blends historical and current dropback share; live weight = min(50%, team plays / (team plays + 30)). Trailing increases the pass share, leading decreases it: deficit / 21 × elapsed-game fraction × 12 percentage points, capped at ±12 points.',
  possession: 'Add 1.5 remaining plays to the team with possession and subtract 1.5 from the opponent, tapering inside 3 minutes. Halftime uses no possession adjustment.',
  excluded: 'ESPN reported-out players and explicitly reported ejections are automatically paused; stale injury feeds also pause projections. Unreported injuries, benching, routes, snap counts, defensive coverage, weather, field position, timeouts and overtime are not modeled. Public injury reports can lag; manual Pause player remains available.',
  limits: 'No projection before kickoff, after final, in overtime, in the final 2 regulation minutes, with fewer than 3 prior appearances, missing statistics, or stale inputs. No trained live probability, confidence interval, EV, or bet recommendation is claimed. Compare only full-game lines; projections exclude possible overtime.',
};

// Schedule completion and kickoff cutoffs prevent the selected game's result
// (or a later game from a corrected weekly file) leaking into the prior.
export function buildLivePriors({ weekly, rosters, schedule, game }) {
  const cutoff = Date.parse(game.date);
  const completed = new Map(schedule.filter(g => g.game_type !== 'PRE' && finite(g.home_score) !== null && finite(g.away_score) !== null && Date.parse(g.gameday + 'T23:59:59Z') < cutoff).map(g => [g.game_id, g]));
  const rows = weekly.filter(r => completed.has(r.game_id) && ['QB', 'RB', 'FB', 'WR', 'TE'].includes(r.position));
  const teamGames = new Map();
  for (const r of rows) {
    const key = `${teamCode(r.team || r.recent_team)}:${r.game_id}`;
    const t = teamGames.get(key) || { gameId: r.game_id, team: teamCode(r.team || r.recent_team), date: completed.get(r.game_id).gameday, attempts: 0, carries: 0, targets: 0, sacks: 0 };
    t.attempts += finite(r.attempts) ?? 0; t.carries += finite(r.carries) ?? 0; t.targets += finite(r.targets) ?? 0; t.sacks += finite(r.sacks_suffered) ?? 0;
    t.plays = t.attempts + t.carries + t.sacks; teamGames.set(key, t);
  }
  const mapping = new Map();
  for (const r of [...rosters].sort((a, b) => Number(a.week || 0) - Number(b.week || 0))) {
    if (r.espn_id && r.gsis_id && Number(r.season) === game.season) mapping.set(String(r.espn_id) + ':' + teamCode(r.team), r);
  }
  const result = new Map();
  for (const [key, roster] of mapping) {
    const team = teamCode(roster.team);
    if (!game.teams.some(t => t.abbreviation === team)) continue;
    const sample = rows.filter(r => r.player_id === roster.gsis_id && teamCode(r.team || r.recent_team) === team).sort((a, b) => completed.get(b.game_id).gameday.localeCompare(completed.get(a.game_id).gameday)).slice(0, 10);
    const recent = sample.slice(0, 5);
    const roleTeams = recent.map(r => teamGames.get(`${team}:${r.game_id}`));
    const recentTeamGames = [...teamGames.values()].filter(t => t.team === team && t.plays > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (!sample.length || !recentTeamGames.length) continue;
    const plays = sum(recentTeamGames, 'plays'), attempts = sum(recentTeamGames, 'attempts'), sacks = sum(recentTeamGames, 'sacks');
    result.set(key, {
      count: recent.length, efficiencyCount: sample.length, gsisId: roster.gsis_id, position: roster.position,
      teamPlays: plays / recentTeamGames.length, passShare: (attempts + sacks) / plays,
      sackRate: sacks / Math.max(1, attempts + sacks), targetRate: clamp(sum(recentTeamGames, 'targets') / Math.max(1, attempts), 0, 1),
      shares: Object.fromEntries(Object.entries(opportunity).map(([k, f]) => [k, clamp(sum(recent, f) / Math.max(1, sum(roleTeams, f)), 0, 1)])),
      efficiency: Object.fromEntries(Object.entries(LIVE_MARKETS).filter(([, m]) => m.field).map(([k, m]) => [k, ['attempts', 'carries'].includes(m.field) ? 1 : Math.max(0, sum(sample, m.field) / Math.max(1, sum(sample, opportunity[m.channel])))])),
      sample: sample.map(r => ({ gameId: r.game_id, date: completed.get(r.game_id).gameday, attempts: finite(r.attempts), carries: finite(r.carries), targets: finite(r.targets), passingYards: finite(r.passing_yards), rushingYards: finite(r.rushing_yards), receivingYards: finite(r.receiving_yards) })),
    });
  }
  return result;
}

export function projectLiveProp({ game, player, team, prior, market, stale = false }) {
  const config = LIVE_MARKETS[market];
  if (!config) throw Error('Unsupported live market');
  const current = market === 'rush_rec_yds'
    ? (finite(player.stats.rushing_yards) !== null && finite(player.stats.receiving_yards) !== null ? finite(player.stats.rushing_yards) + finite(player.stats.receiving_yards) : null)
    : finite(player.stats[config.field]);
  const reasons = [];
  if(player.liveUnavailable||player.availability?.unavailable)reasons.push(`Reported ${player.liveUnavailable||player.availability.status}; future production paused.`);
  if(player.availability?.stale)reasons.push('Current injury report is stale; future production paused.');
  if (game.state !== 'in') reasons.push(game.state === 'post' ? 'Game complete · recorded stats only.' : 'Waiting for kickoff.');
  if (stale) reasons.push('Live feed or historical inputs are stale.');
  if (!Number.isInteger(game.period) || game.period < 1 || game.period > 4) reasons.push('Overtime or regulation period unavailable.');
  if (!Number.isFinite(game.remainingSeconds) || game.remainingSeconds < 120 || game.remainingSeconds > 3600) reasons.push('Final 2 minutes / clock unavailable: late-game usage is not modeled.');
  if (current === null) reasons.push('This player’s current statistic is unavailable; missing is not zero.');
  if (!prior || prior.count < 3) reasons.push('At least 3 earlier appearances on this team are required.');
  if(prior&&(!Number.isFinite(prior.teamPlays)||prior.teamPlays<=0||['passShare','sackRate','targetRate'].some(k=>!Number.isFinite(prior[k])||prior[k]<0||prior[k]>1)||config.channel!=='combined'&&(!Number.isFinite(prior.shares?.[config.channel])||prior.shares[config.channel]<0||prior.shares[config.channel]>1||!Number.isFinite(prior.efficiency?.[market])||prior.efficiency[market]<0)))reasons.push('Historical workload or efficiency inputs are incomplete or invalid.');
  if (!team || !Number.isFinite(team.plays) || team.plays <= 0 || !Number.isFinite(team.attempts) || !Number.isFinite(team.carries) || !Number.isFinite(team.sacks)) reasons.push('Current team workload is incomplete.');
  if (game.teams.some(t => !Number.isFinite(t.score))) reasons.push('Game score unavailable.');
  if (game.teams.length !== 2 || !game.teams.some(t => t.id === player.teamId)) reasons.push('Player team is not matched to this game.');
  if (reasons.length) return { market, current, projection: null, remaining: null, reasons, status: game.state === 'post' ? 'final' : 'withheld' };
  if (market === 'rush_rec_yds') {
    const parts = ['rush_yds', 'rec_yds'].map(m => projectLiveProp({ game, player, team, prior, market: m, stale }));
    if (parts.some(p => p.projection === null)) return { market, current, projection: null, remaining: null, reasons: [...new Set(parts.flatMap(p => p.reasons))], status: 'withheld' };
    const remaining = parts.reduce((s, p) => s + p.remaining, 0);
    return { market, current, remaining, projection: current + remaining, parts, reasons: [], status: 'experimental' };
  }
  const elapsed = (3600 - game.remainingSeconds) / 3600;
  const f = opportunity[config.channel], teamOpp = finite(team[f]), playerOpp = finite(player.stats[f]);
  if (!elapsed || teamOpp === null || playerOpp === null || teamOpp < playerOpp || playerOpp < 0) return { market, current, projection: null, remaining: null, reasons: ['Current player/team opportunities are incomplete or inconsistent.'], status: 'withheld' };
  const liveRoleWeight = Math.min(.7, teamOpp / (teamOpp + 20)) * Math.min(1, elapsed * 4);
  const observedShare = teamOpp > 0 ? playerOpp / teamOpp : 0;
  const share = prior.shares[config.channel] * (1 - liveRoleWeight) + observedShare * liveRoleWeight;
  const paceWeight = elapsed >= 1 / 12 ? .35 : 0;
  const observedPace = clamp(team.plays / elapsed / prior.teamPlays, .75, 1.25);
  const pace = 1 - paceWeight + paceWeight * observedPace;
  const own = game.teams.find(t => t.id === player.teamId), opponent = game.teams.find(t => t.id !== player.teamId);
  const script = clamp((opponent.score - own.score) / 21 * elapsed * .12, -.12, .12);
  const mixWeight = Math.min(.5, team.plays / (team.plays + 30));
  const passShare = clamp(prior.passShare * (1 - mixWeight) + (team.attempts + team.sacks) / team.plays * mixWeight + script, .25, .9);
  const possessionPlays = game.halftime || !game.possession ? 0 : (game.possession === player.teamId ? 1.5 : -1.5) * Math.min(1, game.remainingSeconds / 180);
  const remainingPlays = Math.max(0, prior.teamPlays * (1 - elapsed) * pace + possessionPlays);
  const teamRemainingOpp = remainingPlays * (config.channel === 'rush' ? 1 - passShare : passShare * (1 - prior.sackRate) * (config.channel === 'target' ? prior.targetRate : 1));
  const remainingOpp = teamRemainingOpp * share;
  const countOnly = ['attempts', 'carries'].includes(config.field);
  const liveEfficiencyWeight = countOnly ? 0 : Math.min(.2, playerOpp / (playerOpp + 40));
  const historicalEfficiency = prior.efficiency[market];
  const liveEfficiency = playerOpp ? clamp(current / playerOpp, 0, 2 * historicalEfficiency) : historicalEfficiency;
  const efficiency = historicalEfficiency * (1 - liveEfficiencyWeight) + liveEfficiency * liveEfficiencyWeight;
  const remaining = remainingOpp * efficiency;
  return {
    market, current, remaining, projection: current + remaining, status: 'experimental', reasons: [],
    breakdown: { historicalShare: prior.shares[config.channel], observedShare, share, liveRoleWeight, liveEfficiencyWeight, historicalEfficiency, liveEfficiency, efficiency, paceWeight, observedPace, pace, mixWeight, script, passShare, possessionPlays, remainingPlays, teamRemainingOpp, remainingOpp, channel: f },
  };
}
