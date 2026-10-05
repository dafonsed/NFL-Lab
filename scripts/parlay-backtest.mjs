// Backtest behind the Trends parlay builder's estimate (public/parlay-builder.js). Rebuilds past
// trends boards, keeps every posted line with a final result, and reports how raw hit rates, the
// books' no-vig prices and the shipped estimate predicted those results, plus the per-sport price
// calibration to refit PRICE_CALIBRATION from. Uses the same local caches as the research boards.
//   node scripts/parlay-backtest.mjs [--weeks 2026:1-4] [--from 2026-07-20 --to 2026-09-27 --every 3]
import { SourceStore } from '../lib/source.mjs';
import { MlbStore } from '../lib/mlb/source.mjs';
import { MARKETS } from '../lib/markets.mjs';
import { MLB_MARKETS } from '../lib/mlb/markets.mjs';
import { boardLegs } from '../lib/parlay-pool.mjs';
import { evaluateSide, slateMargins } from '../public/parlay-builder.js';

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const [season, weekRange] = arg('weeks', '2026:1-4').split(':'), [firstWeek, lastWeek] = weekRange.split('-').map(Number);
const from = arg('from', '2026-07-20'), to = arg('to', '2026-09-27'), every = Number(arg('every', '3'));

async function collect(sport, market, board, out) {
  const results = new Map(board.players.map(p => [[p.gameId, p.playerId ?? p.id, market].join(':'), p.result]));
  for (const leg of boardLegs(sport, market, board, 0)) {
    const actual = Number(results.get(leg.id)?.actual);
    if (results.get(leg.id)?.actual !== null && Number.isFinite(actual)) out.push({ ...leg, sport, actual });
  }
}
const legs = [];
const nfl = new SourceStore(), mlb = new MlbStore();
for (let week = firstWeek; week <= lastWeek; week++) for (const market of MARKETS) {
  try { await collect('nfl', market, await nfl.board({ market, view: 'board', season: Number(season), week }), legs); } catch (e) { console.error(`NFL week ${week} ${market}: ${e.message}`); }
}
for (let t = Date.parse(from + 'T12:00Z'); t <= Date.parse(to + 'T12:00Z'); t += every * 86400000) {
  const date = new Date(t).toISOString().slice(0, 10);
  await Promise.all(Object.keys(MLB_MARKETS).map(async market => { try { await collect('mlb', market, await mlb.board({ market, date }), legs); } catch (e) { console.error(`MLB ${date} ${market}: ${e.message}`); } }));
}

const rows = [];
for (const sport of ['nfl', 'mlb']) {
  const pool = legs.filter(l => l.sport === sport), margin = slateMargins(pool);
  for (const leg of pool) for (const side of ['over', 'under']) {
    if (leg.actual === leg.line) continue;
    const c = evaluateSide(leg, side, { window: '10', margin, sport });
    if (c && c.recent.n >= 5) rows.push({ ...c, sport, hit: (side === 'over' ? leg.actual > leg.line : leg.actual < leg.line) ? 1 : 0 });
  }
}
const clip = p => Math.min(0.99, Math.max(0.01, p)), logit = p => Math.log(p / (1 - p)), sigmoid = x => 1 / (1 + Math.exp(-x));
const logLoss = (list, f) => list.reduce((s, r) => s - Math.log(clip(r.hit ? f(r) : 1 - f(r))), 0) / list.length;
const mean = (list, f) => list.reduce((s, r) => s + f(r), 0) / list.length;
const roi = list => mean(list, r => r.hit ? r.decimal - 1 : -1);
const pct = v => (v * 100).toFixed(1) + '%';
function calibration(list) {
  let a = 0, b = 1;
  for (let i = 0; i < 100; i++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (const r of list) { const x = logit(clip(r.market)), p = sigmoid(a + b * x), e = r.hit - p, v = p * (1 - p); ga += e; gb += e * x; haa += v; hab += v * x; hbb += v * x * x; }
    const det = haa * hbb - hab * hab, da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
    a += da; b += db; if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return [Number(a.toFixed(3)), Number(b.toFixed(3))];
}
console.log(`${legs.length} lines with results → ${rows.length} sides with 5+ games of history`);
console.log(`log loss (lower is better): raw L10 ${logLoss(rows, r => r.recent.rate).toFixed(4)} · no-vig price ${logLoss(rows, r => r.market).toFixed(4)} · shipped estimate ${logLoss(rows, r => r.chance).toFixed(4)}`);
const hot = rows.filter(r => r.recent.rate >= 0.7), wide = hot.filter(r => r.gap >= 0.3);
console.log(`L10 70%+: ${hot.length} sides hit ${pct(mean(hot, r => r.hit))} · price ${pct(mean(hot, r => r.market))} · trend ${pct(mean(hot, r => r.recent.rate))} · estimate ${pct(mean(hot, r => r.chance))} · flat ROI ${pct(roi(hot))}`);
console.log(`  trend 30+ pts over price: ${wide.length} sides hit ${pct(mean(wide, r => r.hit))} · price ${pct(mean(wide, r => r.market))} · trend ${pct(mean(wide, r => r.recent.rate))}`);
const tenth = Math.max(1, Math.round(hot.length / 10));
const byEstimate = [...hot].sort((a, b) => b.chance * b.decimal - a.chance * a.decimal).slice(0, tenth), byGap = [...hot].sort((a, b) => b.gap - a.gap).slice(0, tenth);
console.log(`  top tenth by estimate: ROI ${pct(roi(byEstimate))} (hit ${pct(mean(byEstimate, r => r.hit))}, estimated ${pct(mean(byEstimate, r => r.chance))}) · by trend minus price: ROI ${pct(roi(byGap))}`);
for (const sport of ['nfl', 'mlb']) for (const twoSided of [true, false]) {
  const list = rows.filter(r => r.sport === sport && r.twoSided === twoSided);
  if (list.length > 500) console.log(`price calibration ${sport} ${twoSided ? 'two' : 'one'}-sided (n ${list.length}): [a, b] = ${JSON.stringify(calibration(list))}`);
}
process.exit(0);
