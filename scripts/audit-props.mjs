// Targeted integration audit for the public totals and new counting-stat markets.
// Requires the local app to be running. ESPN is used only for verification.
import fs from 'node:fs/promises';
import { MARKETS, normalizePlayer } from '../lib/markets.mjs';
const base = `http://127.0.0.1:${process.env.PORT || 3100}`;
const get = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw Error(`${r.status}: ${url}`); return r.json(); };
const board = (market, week = 2) => get(`${base}/api/board?view=board&market=${market}&season=2026&week=${week}`);
const report = { checkedAt: new Date().toISOString(), scope: '2026 weeks 1–3; DET–BUF result spot check', markets: [], weeks: [], comparisons: [] };
const boards = new Map();
for (const market of MARKETS) {
  const b = await board(market); boards.set(market, b);
  report.markets.push({ market, players: b.players.length, lines: b.props.withLine, fanDuel: b.props.fanDuel, warnings: b.props.warnings });
}
for (const week of [1, 3]) {
  const b = await board('rush_attempts', week);
  report.weeks.push({ week, players: b.players.length, lines: b.props.withLine, fanDuel: b.props.fanDuel, statuses: b.players.reduce((o, p) => (o[p.result.status] = (o[p.result.status] || 0) + 1, o), {}) });
}
const event = '401872932', source = `https://www.espn.com/nfl/boxscore/_/gameId/${event}`;
const summary = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event}`);
for (const market of ['pass_yds', 'pass_attempts', 'pass_completions', 'pass_interceptions', 'rush_attempts', 'rec_yds', 'rush_rec_yds']) {
  const players = boards.get(market).players.filter(p => p.gameId === '2026_02_DET_BUF' && p.prop && ['Jared Goff', 'Josh Allen', 'James Cook', 'Amon-Ra St. Brown'].includes(p.player));
  for (const p of players) {
    const box = {};
    for (const team of summary.boxscore.players) for (const group of team.statistics) {
      const matches = group.athletes.filter(a => normalizePlayer(a.athlete.displayName) === normalizePlayer(p.player));
      if (matches.length === 1) box[group.name] = Object.fromEntries(group.labels.map((l, i) => [l, matches[0].stats[i]]));
    }
    const pass = box.passing || {}, rush = box.rushing || {}, rec = box.receiving || {};
    const value = { pass_yds: pass.YDS, pass_attempts: pass['C/ATT']?.split('/')[1], pass_completions: pass['C/ATT']?.split('/')[0], pass_interceptions: pass.INT, rush_attempts: rush.CAR, rec_yds: rec.YDS, rush_rec_yds: rush.YDS != null && rec.YDS != null ? Number(rush.YDS) + Number(rec.YDS) : undefined }[market];
    report.comparisons.push({ player: p.player, market, line: p.prop.line, bookmaker: p.prop.bookmaker, app: p.result.actual, espn: Number.isFinite(Number(value)) ? Number(value) : null, matches: Number.isFinite(Number(value)) && p.result.actual === Number(value), source });
  }
}
await fs.mkdir('reports', { recursive: true });
await fs.writeFile('reports/prop-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, comparisons: { checked: report.comparisons.length, mismatches: report.comparisons.filter(c => !c.matches) } }, null, 2));
if (!report.comparisons.length || report.comparisons.some(c => !c.matches) || report.markets.some(m => m.warnings.length)) process.exitCode = 1;
