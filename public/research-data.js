// Shared, display-only research calculations. Forecasts stay with each sport's model.
export const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const median = values => { const sorted = [...values].sort((a, b) => a - b), n = sorted.length; return n ? n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : null; };
export const number = (v, digits = 1) => finite(v) === null ? '—' : Number(Number(v).toFixed(digits)).toLocaleString('en-US');
export const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = u => { try { const url = new URL(u, 'https://sports-lab.invalid'); return url.protocol === 'https:' && !url.username && !url.password ? escape(u) : '#'; } catch { return '#'; } };
const sum = (stats, fields) => { const values = fields.map(k => finite(stats?.[k])); return values.every(v => v !== null) ? values.reduce((a, b) => a + b, 0) : null; };
export const NFL_MARKETS = {
  any_td: { label: 'Touchdowns', fields: ['rushing_tds', 'receiving_tds', 'special_teams_tds'], unit: 'TDs' },
  pass_yds: { label: 'Passing yards', fields: ['passing_yards'] }, pass_tds: { label: 'Passing TDs', fields: ['passing_tds'] },
  rush_yds: { label: 'Rushing yards', fields: ['rushing_yards'] }, rec: { label: 'Receptions', fields: ['receptions'] },
  rec_yds: { label: 'Receiving yards', fields: ['receiving_yards'] }, rush_attempts: { label: 'Rushing attempts', fields: ['carries'] },
  pass_attempts: { label: 'Passing attempts', fields: ['attempts'] }, pass_completions: { label: 'Completions', fields: ['completions'] },
  pass_interceptions: { label: 'Interceptions thrown', fields: ['passing_interceptions'] }, rush_rec_yds: { label: 'Rush + receiving yards', fields: ['rushing_yards', 'receiving_yards'] }
};
export const statNames = { points: 'Points', rebounds: 'Rebounds', assists: 'Assists', minutes: 'Minutes', fieldGoalsAttempted: 'Shot attempts', fieldGoalsMade: 'Field goals', threePointFieldGoalsMade: 'Threes', threePointFieldGoalsAttempted: 'Three-point attempts', freeThrowsAttempted: 'Free-throw attempts', freeThrowsMade: 'Free throws', turnovers: 'Turnovers', steals: 'Steals', blocks: 'Blocks', passing_yards: 'Pass yards', passing_tds: 'Pass TDs', rushing_yards: 'Rush yards', receiving_yards: 'Rec. yards', rushing_tds: 'Rush TDs', receiving_tds: 'Rec. TDs', special_teams_tds: 'Special-teams TDs', carries: 'Carries', targets: 'Targets', receptions: 'Receptions', attempts: 'Pass attempts', completions: 'Completions', snap_pct: 'Snap share', plateAppearances: 'Plate appearances', atBats: 'At-bats', hits: 'Hits', homeRuns: 'Home runs', runs: 'Runs', rbi: 'RBIs', baseOnBalls: 'Walks', strikeOuts: 'Strikeouts', battersFaced: 'Batters faced', outs: 'Outs', earnedRuns: 'Earned runs', totalBases: 'Total bases', shotsTotal: 'Shots on goal', goals: 'Goals', saves: 'Saves', blockedShots: 'Blocked shots', totalShots: 'Shots', shotsOnTarget: 'Shots on target', totalGoals: 'Goals', goalAssists: 'Assists', foulsCommitted: 'Fouls', yellowCards: 'Yellow cards', wonCorners: 'Corners' };
export function marketValue(stats, config, key) {
  if (key === 'singles') { const v = ['hits', 'doubles', 'triples', 'homeRuns'].map(k => finite(stats?.[k])); return v.every(x => x !== null) ? Math.max(0, v[0] - v[1] - v[2] - v[3]) : null; }
  if (key === 'outs' && finite(stats?.outs) === null) { const m = String(stats?.inningsPitched ?? '').match(/^(\d+)(?:\.([012]))?$/); return m ? Number(m[1]) * 3 + Number(m[2] || 0) : null; }
  if (key === 'tb' && finite(stats?.totalBases) === null) { const v = ['hits', 'doubles', 'triples', 'homeRuns'].map(k => finite(stats?.[k])); return v.every(x => x !== null) ? v[0] + v[1] + 2 * v[2] + 3 * v[3] : null; }
  return sum(stats, config.fields || [config.field]);
}
export function researchProfile({ sport, board, player: p, market, history, technical = '' }) {
  const f = p.forecast || {}, config = sport === 'nfl' ? NFL_MARKETS[market] : board.markets[market];
  const allMarkets = sport === 'nfl' ? NFL_MARKETS : board.markets;
  const markets = Object.fromEntries(Object.entries(allMarkets).filter(([key, m]) => sport === 'mlb' ? m.group === p.role : sport === 'nfl' ? p.position === 'QB' || !key.startsWith('pass_') : p.position === 'TEAM' ? m.team : !m.team && (sport === 'nhl' || sport === 'soccer' ? !!m.goalie === ['G', 'GK'].includes(p.position) : true)));
  const target = sport === 'nfl' ? board.lines?.find(g => g.gameId === p.gameId)?.date : sport === 'mlb' ? board.date : board.game?.date;
  const raw = history || (sport === 'nfl' ? p.trendGames || p.forecast?.sample || p.details?.sample || [] : sport === 'mlb' ? p.trendGames || p.logs || [] : f.sample || []);
  const seen = new Set();
  const rows = raw.map(r => {
    const stats = sport === 'nfl' ? r.stats || r : { ...r.stats, ...(finite(r.minutes) === null ? {} : { minutes: finite(r.minutes) }) };
    const computed = marketValue(stats, config, market), value = finite(r.value) ?? computed;
    const game = board.historyGames?.find(g => String(g.id) === String(r.gameId));
    return { ...r, stats, value, opponent: r.opponent || '', date: r.date, url: r.url || r.boxscore || game?.url, parts: (config.fields || []).length > 1 && (config.fields || []).every(k => finite(stats[k]) !== null) && sum(stats, config.fields) === value ? config.fields.map(k => ({ label: statNames[k] || k, value: finite(stats[k]) })) : [] };
  }).filter(r => {
    const id = String(r.gameId || r.date), valid = finite(r.value) !== null && Number.isFinite(Date.parse(r.date)) && (!target || (sport === 'nfl' || sport === 'mlb' ? r.date.slice(0, 10) < target.slice(0, 10) : Date.parse(r.date) < Date.parse(target))) && !seen.has(id);
    if (valid) seen.add(id); return valid;
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.gameId).localeCompare(String(a.gameId), 'en', { numeric: true }));
  const availability = f.availability || p.availability || {}, prop = p.prop && finite(p.prop.line) !== null ? p.prop : null;
  const key = [sport, p.gameId, p.playerId ?? p.id, market].join(':');
  return { sport, key, id: p.id ?? p.playerId, playerId: p.playerId ?? p.id, gameId: p.gameId, name: p.player, team: p.team, opponent: p.opponent, opponentId: p.opponentId, position: p.position, image: p.headshot, market, label: config.label, unit: config.unit || config.label.toLowerCase(), markets, rows, forecast: f, prop, availability, target, displayDate: board.date || target, result: p.result, lineup: p.lineupStatus, battingOrder: p.battingOrder, weather: f.modelContext?.weather || board.weather, context: f.modelContext?.opponent, technical, raw: p, boardMeta: { fetchedAt: board.fetchedAt, current: board.current, game: board.game, methodology: board.methodology, sources: board.sources || board.datasets }, historyNote: sport === 'nfl' ? 'Completed appearances before the selected week; history may cross seasons.' : sport === 'mlb' ? 'Completed appearances before the selected date. Pitching history includes starts only.' : 'Completed appearances from the available box scores before this matchup.' };
}
export function selectGames(profile, { window = '10', venue = 'all' } = {}) {
  let rows = profile.rows.filter(r => venue === 'all' || r.home === (venue === 'home'));
  if (window === 'h2h') rows = rows.filter(r => profile.opponentId && r.opponentId ? String(r.opponentId) === String(profile.opponentId) : r.opponent && r.opponent === profile.opponent);
  else if (window.startsWith('year:')) rows = rows.filter(r => r.date.startsWith(window.slice(5)));
  else if (/^\d+$/.test(window)) rows = rows.slice(0, Number(window));
  return rows;
}
export function summarize(rows, line = null, side = 'over') {
  const values = rows.map(r => finite(r.value)).filter(v => v !== null), n = values.length;
  const threshold = finite(line), over = threshold === null ? null : values.filter(v => v > threshold).length, under = threshold === null ? null : values.filter(v => v < threshold).length, pushes = threshold === null ? null : values.filter(v => v === threshold).length;
  return { n, average: average(values), median: median(values), min: n ? Math.min(...values) : null, max: n ? Math.max(...values) : null, over, under, pushes, hits: side === 'under' ? under : over, rate: n && threshold !== null ? (side === 'under' ? under : over) / n : null };
}
export function recentChange(rows) {
  const last = rows.slice(0, 5), prior = rows.slice(5, 10), a = average(last.map(r => r.value)), b = average(prior.map(r => r.value));
  return { recent: a, previous: b, change: last.length === 5 && prior.length === 5 ? a - b : null, recentCount: last.length, previousCount: prior.length };
}
export function supportingStats(profile, rows, method = 'average') {
  const choices = profile.sport === 'nfl' ? (profile.position === 'QB' ? ['attempts', 'completions', 'passing_yards', 'carries', 'snap_pct'] : ['carries', 'targets', 'receptions', 'rushing_yards', 'receiving_yards', 'snap_pct']) : profile.sport === 'mlb' ? profile.raw.role === 'pitching' ? ['outs', 'strikeOuts', 'battersFaced', 'baseOnBalls', 'earnedRuns'] : ['plateAppearances', 'hits', 'totalBases', 'runs', 'rbi', 'strikeOuts'] : profile.sport === 'nhl' ? ['minutes', 'shotsTotal', 'goals', 'assists', 'hits', 'saves'] : profile.sport === 'soccer' ? ['minutes', 'totalShots', 'shotsOnTarget', 'totalGoals', 'goalAssists', 'foulsCommitted', 'saves'] : ['minutes', 'fieldGoalsAttempted', 'threePointFieldGoalsAttempted', 'freeThrowsAttempted', 'rebounds', 'assists'];
  return choices.map(key => { const values = rows.map(r => finite(r.stats?.[key])).filter(v => v !== null); return { key, label: statNames[key], value: (method === 'median' ? median : average)(values), n: values.length, percent: key === 'snap_pct' }; }).filter(r => r.n);
}
export function forecastSummary(profile) {
  const f = profile.forecast, point = finite(f.point), line = finite(profile.prop?.line);
  if (profile.market === 'any_td' && profile.sport === 'nfl' && finite(profile.raw?.modelScore) !== null && !profile.availability?.unavailable) {
    const chance = profile.raw?.tdProbMethod === 'historical-score-calibration' && finite(profile.raw.tdProb) !== null ? ` The separate historical outcome fit estimates a ${Math.round(profile.raw.tdProb * 100)}% rushing or receiving TD chance, conditional on playing.` : '';
    return { title: `${number(profile.raw.modelScore)}% model strength`, text: `A 0–100 ranking score based on usage, scoring role and matchup.${chance}${f.teammateImpact?.applied ? ' A teammate absence changes the separate experimental workload forecast.' : ''}` };
  }
  if (point === null || f.status === 'unavailable') return { title: 'Projection unavailable', text: profile.availability.unavailable ? `Reported ${profile.availability.status}. A projection will return when participation can be assessed.` : `There is not enough usable information to estimate ${profile.label.toLowerCase()} for this game.` };
  if (profile.market === 'any_td' && profile.sport === 'nfl') return { title: 'Model strength unavailable', text: 'The 0–100 ranking score is unavailable for this player. The separate workload forecast estimates rushing, receiving or special-teams TDs.' };
  const title = `${number(point)} ${profile.label.toLowerCase()} projected`;
  const comparison = line === null ? 'No sportsbook line is available to compare.' : `${number(Math.abs(point - line))} ${profile.unit} ${point > line ? 'above' : point < line ? 'below' : 'from'} the ${number(line)} posted line.`;
  return { title, text: `${comparison}${f.interval?.length === 2 ? ` The model's wider range is ${f.interval.map(v => number(v)).join('–')}; individual games can fall outside it.` : ''}` };
}
export function recordQuote(history, key, quote, now = Date.now()) {
  const line = finite(quote?.line), at = Date.parse(quote?.fetchedAt), book = String(quote?.bookKey || quote?.bookmaker || '');
  if (line === null || !Number.isFinite(at) || at > now + 300000 || !book || quote.stale || !['captured_pregame', 'pregame', 'in_play', 'published_archive'].includes(quote.basis)) return history;
  const id = key + ':' + book, previous = Array.isArray(history[id]) ? history[id].filter(x => finite(x.line) !== null && Number.isFinite(Date.parse(x.at))) : [];
  if (previous.some(x => Date.parse(x.at) === at) || previous.length && at < Date.parse(previous.at(-1).at)) return history;
  const observations = [...previous, { at: new Date(at).toISOString(), line, basis: quote.basis, over: finite(quote.prices?.over?.american), under: finite(quote.prices?.under?.american) }].slice(-80);
  // Retain the player being opened even if other games have newer source timestamps.
  return Object.fromEntries([[id, observations], ...Object.entries(history).filter(([k]) => k !== id)].slice(0, 500));
}
