// Backtest behind the Trends parlay builder's expected hit rate (public/parlay-builder.js). Rebuilds
// past trends boards, keeps every posted line with a final result, scores each side exactly as the
// builder does (per slate), and reports how raw hit rates and the builder's estimate did. No prices are
// used. Uses the same local caches as the research boards.
//   node scripts/parlay-backtest.mjs [--weeks 2026:1-4] [--from 2026-07-20 --to 2026-09-27 --every 3]
import { SourceStore } from '../lib/source.mjs';
import { MlbStore } from '../lib/mlb/source.mjs';
import { MARKETS } from '../lib/markets.mjs';
import { MLB_MARKETS } from '../lib/mlb/markets.mjs';
import { boardLegs } from '../lib/parlay-pool.mjs';
import { evaluateSide, slateBaseRates } from '../public/parlay-builder.js';

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const [season, weekRange] = arg('weeks', '2026:1-4').split(':'), [firstWeek, lastWeek] = weekRange.split('-').map(Number);
const from = arg('from', '2026-07-20'), to = arg('to', '2026-09-27'), every = Number(arg('every', '3'));

const slates = new Map();
function collect(slate, sport, market, board) {
  const results = new Map(board.players.map(p => [[p.gameId, p.playerId ?? p.id, market].join(':'), p.result]));
  const legs = slates.get(slate) || [];
  for (const leg of boardLegs(sport, market, board, 0)) {
    const result = results.get(leg.id), actual = Number(result?.actual);
    if (result?.actual !== null && result?.actual !== undefined && Number.isFinite(actual)) legs.push({ ...leg, actual });
  }
  slates.set(slate, legs);
}
const nfl = new SourceStore(), mlb = new MlbStore();
for (let week = firstWeek; week <= lastWeek; week++) for (const market of MARKETS) {
  try { collect(`nfl ${season} week ${week}`, 'nfl', market, await nfl.board({ market, view: 'board', season: Number(season), week })); } catch (e) { console.error(`NFL week ${week} ${market}: ${e.message}`); }
}
for (let t = Date.parse(from + 'T12:00Z'); t <= Date.parse(to + 'T12:00Z'); t += every * 86400000) {
  const date = new Date(t).toISOString().slice(0, 10);
  for (const market of Object.keys(MLB_MARKETS)) { try { collect('mlb ' + date, 'mlb', market, await mlb.board({ market, date })); } catch (e) { console.error(`MLB ${date} ${market}: ${e.message}`); } }
}

const sides = [];
for (const legs of slates.values()) {
  const base = slateBaseRates(legs);
  for (const leg of legs) for (const side of ['over', 'under']) {
    if (leg.actual === leg.line) continue;
    const c = evaluateSide(leg, side, { window: '10', base });
    if (c && c.recent.n >= 5) sides.push({ ...c, hit: (side === 'over' ? leg.actual > leg.line : leg.actual < leg.line) ? 1 : 0 });
  }
}
const clip = p => Math.min(0.99, Math.max(0.01, p)), mean = (list, f) => list.reduce((s, r) => s + f(r), 0) / list.length, pct = v => (v * 100).toFixed(1) + '%';
const logLoss = (list, f) => list.reduce((s, r) => s - Math.log(clip(r.hit ? f(r) : 1 - f(r))), 0) / list.length;
console.log(`${slates.size} slates · ${sides.length} sides with 5+ games of history`);
console.log(`log loss (lower is better): raw L10 ${logLoss(sides, r => r.recent.rate).toFixed(4)} · slate base rate ${logLoss(sides, r => r.baseRate).toFixed(4)} · expected hit rate ${logLoss(sides, r => r.chance).toFixed(4)}`);
const hot = sides.filter(r => r.recent.rate >= 0.7);
console.log(`L10 70%+: ${hot.length} sides hit ${pct(mean(hot, r => r.hit))} · expected ${pct(mean(hot, r => r.chance))} · raw ${pct(mean(hot, r => r.recent.rate))}`);
for (let low = 0.2; low < 1; low += 0.1) { const band = sides.filter(r => r.chance >= low && r.chance < low + 0.1); if (band.length) console.log(`  expected ${pct(low)}–${pct(low + 0.1)}: ${band.length} sides, predicted ${pct(mean(band, r => r.chance))}, hit ${pct(mean(band, r => r.hit))}`); }
const far = hot.filter(r => r.farLine), normal = hot.filter(r => r.cushion >= 1 && r.cushion < 2);
console.log(`hot sides with the line far from usual output: ${far.length} hit ${pct(mean(far, r => r.hit))} · ordinary cushion: ${normal.length} hit ${pct(mean(normal, r => r.hit))}`);
const tenth = Math.max(1, Math.round(hot.length / 10));
const byEstimate = [...hot].sort((a, b) => b.chance - a.chance).slice(0, tenth), byRaw = [...hot].sort((a, b) => b.recent.rate - a.recent.rate || b.recent.n - a.recent.n).slice(0, tenth);
console.log(`top tenth of hot sides: by expected hit rate ${pct(mean(byEstimate, r => r.hit))} hit · by raw L10 ${pct(mean(byRaw, r => r.hit))} hit`);
process.exit(0);
