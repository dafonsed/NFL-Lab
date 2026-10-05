// Trends parlay builder: scores every posted line on a slate (lib/parlay-pool.mjs) against the
// member's hit-rate threshold, estimates each side's real chance, and picks the legs.
//
// The estimate comes from a backtest on 72,102 past sides (NFL weeks 1–4 of 2026, MLB 20 Jul – 27 Sep
// 2026; scripts/parlay-backtest.mjs). Raw hit rates predicted results far worse than the books' prices
// did: sides that hit 70%+ of their last 10 games went on to hit 66%, against 65% from their no-vig
// prices and 80% from the trend. So each side's chance starts from the price and moves only as far as
// the evidence did:
//   1. the no-vig price, recalibrated per sport (PRICE_CALIBRATION: chance = σ(a + b·logit(price)));
//      MLB favorites hit more often than their no-vig price says, and its one-sided prices overstate;
//   2. plus TREND_WEIGHT × the gap between the player's recent record (last 20 games, a game's weight
//      halving every HALF_LIFE games back) and that price, capped at ±TREND_CAP: a trend far above its
//      price did no better than a modest one (the book usually knows why);
//   3. plus MODEL_WEIGHT × the projection model's gap from the price, capped at ±MODEL_CAP: when the
//      model disagreed with the price by 30+ points, results sided with the price.
// Out of sample (fit on MLB before 1 Sep and NFL weeks 1–2, tested on the 27,549 later sides), flat-betting
// the top tenth of hot sides by this estimate returned +1.2% (noise-level), by raw hit rate +1.0%, and by
// trend-minus-price −6.9%; all hot sides −3.6%. A parlay multiplies the book's margin across legs, so "best value" ranks
// legs by expected return (chance × decimal odds); "most likely" ranks by chance alone. Legs are taken
// greedily, one per player and at most `perGame` per game; with those nested limits greedy maximizes
// the summed log-score, i.e. the ticket's own expected return (or hit chance) under independence.
import { fairFromAmerican } from './ev-advanced-math.js';

// Only MLB's fit held steady between the earlier and later halves of the data; other sports use the price as is.
export const PRICE_CALIBRATION = Object.freeze({ mlb: { two: [0, 1.2], one: [-0.094, 1.104] } });
export const HALF_LIFE = 8, TREND_WEIGHT = 0.2, TREND_CAP = 0.05, MODEL_WEIGHT = 0.1, MODEL_CAP = 0.05, MIN_GAMES = 5, RED_FLAG_GAP = 0.3;
// Backtest figures quoted to members (see the header).
export const BACKTEST = Object.freeze({ sides: 72102, hotSides: 16834, hotActual: 0.663, hotPrice: 0.647, hotTrend: 0.797, wideGapSides: 1903, wideGapActual: 0.505, wideGapPrice: 0.503, wideGapTrend: 0.86, testSides: 27549, hotRoi: -0.036, topEstimateRoi: 0.012, topTrendRoi: -0.069 });
export const PARLAY_DEFAULTS = Object.freeze({ legs: 3, threshold: 70, window: '10', side: 'both', goal: 'value', perGame: 1, maxFavorite: -300, markets: [], skipInjured: true, stake: 10, method: 'multiplicative' });

export const toDecimal = american => american > 0 ? 1 + american / 100 : 1 + 100 / -american;
export const toAmerican = decimal => decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
export const impliedChance = american => american > 0 ? 100 / (american + 100) : -american / (100 - american);
const median = values => { const s = [...values].sort((a, b) => a - b), n = s.length; return n ? n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 : null; };
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const playerOf = leg => leg.gameId + ':' + leg.playerId;

/** The margin to take out of a price posted on one side only: the median overround of this slate's two-sided lines in the same market (else all markets, else 5%). */
export function slateMargins(legs) {
  const overround = leg => leg.over !== null && leg.under !== null ? impliedChance(leg.over) + impliedChance(leg.under) : null;
  const by = new Map(), all = [];
  for (const leg of legs) { const o = overround(leg); if (o === null || !(o > 1 && o < 1.25)) continue; all.push(o); by.set(leg.market, [...(by.get(leg.market) || []), o]); }
  const fallback = median(all) ?? 1.05;
  return market => by.get(market)?.length >= 3 ? median(by.get(market)) : fallback;
}

/** A side's record over the newest `count` games, the way the Trends table counts it (pushes are not hits). */
export function record(games, line, side, count = games.length) {
  const rows = games.slice(0, count), hit = v => side === 'over' ? v > line : v < line;
  const hits = rows.filter(r => hit(r[1])).length, pushes = rows.filter(r => r[1] === line).length;
  return { n: rows.length, hits, pushes, rate: rows.length ? hits / rows.length : null, values: rows.map(r => r[1]) };
}

const logit = p => Math.log(p / (1 - p)), sigmoid = x => 1 / (1 + Math.exp(-x)), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** One side of one line, with every number the explanation uses. Null when the side has no price. */
export function evaluateSide(leg, side, { window = '10', method = 'multiplicative', margin = () => 1.05, sport = '' } = {}) {
  const price = leg[side], other = leg[side === 'over' ? 'under' : 'over'], line = leg.line;
  if (price === null || price === undefined || line === null || !Array.isArray(leg.games)) return null;
  const twoSided = other !== null && other !== undefined;
  const fair = twoSided ? fairFromAmerican([price, other], method).fair[0] : undefined;
  const market = clamp(Number.isFinite(fair) ? fair : impliedChance(price) / margin(leg.market), 0.005, 0.995);
  const calibration = PRICE_CALIBRATION[sport]?.[twoSided ? 'two' : 'one'];
  const priced = calibration ? sigmoid(calibration[0] + calibration[1] * logit(market)) : market;
  const outcome = v => (side === 'over' ? v > line : v < line) ? 1 : v === line ? 0.5 : 0;
  let weight = 0, weightedHits = 0;
  leg.games.forEach((r, i) => { const w = 0.5 ** (i / HALF_LIFE); weight += w; weightedHits += w * outcome(r[1]); });
  const trend = weight ? weightedHits / weight : null, model = Number.isFinite(leg.model?.[side]) ? leg.model[side] : null;
  const trendShift = trend === null ? 0 : TREND_WEIGHT * clamp(trend - priced, -TREND_CAP, TREND_CAP), modelShift = model === null ? 0 : MODEL_WEIGHT * clamp(model - priced, -MODEL_CAP, MODEL_CAP);
  const chance = clamp(priced + trendShift + modelShift, 0.01, 0.99);
  const decimal = toDecimal(price), size = window === '20' ? 20 : window === '5' ? 5 : 10;
  const recent = record(leg.games, line, side, size);
  const last5 = leg.games.slice(0, 5).map(r => r[1]), prior5 = leg.games.slice(5, 10).map(r => r[1]);
  let streak = 0; for (const r of leg.games) { if (outcome(r[1]) === 1) streak++; else break; }
  const venue = leg.home === null || leg.home === undefined ? null : record(leg.games.filter(r => r[2] === (leg.home ? 1 : 0)), line, side);
  return {
    id: leg.id + ':' + side, leg, side, price, decimal, line, market, priced, trend, trendShift, model, modelShift, twoSided, chance, ev: chance * decimal - 1, edge: chance - market,
    size, recent, gap: recent.rate === null ? null : recent.rate - market, l5: record(leg.games, line, side, 5), l10: record(leg.games, line, side, 10), l20: record(leg.games, line, side, 20),
    average: mean(recent.values), median: median(recent.values), streak,
    form: last5.length === 5 && prior5.length === 5 ? { last: mean(last5), prior: mean(prior5) } : null,
    h2h: record(leg.games.filter(r => r[3] === 1), line, side), venue
  };
}

/** Every side that meets the member's settings, best first for their goal. */
export function qualifyingSides(pool, settings = {}, now = Date.now()) {
  const s = { ...PARLAY_DEFAULTS, ...settings }, margin = slateMargins(pool.legs || []), markets = new Set(s.markets || []);
  const excluded = new Set(s.excluded || []), size = s.window === '20' ? 20 : s.window === '5' ? 5 : 10;
  const out = [];
  for (const leg of pool.legs || []) {
    if (!(Date.parse(leg.start) > now) || markets.size && !markets.has(leg.market) || s.skipInjured && leg.concern) continue;
    for (const side of s.side === 'both' ? ['over', 'under'] : [s.side]) {
      const c = evaluateSide(leg, side, { window: s.window, method: s.method, margin, sport: pool.sport });
      if (!c || excluded.has(c.id) || c.recent.n < Math.min(MIN_GAMES, size) || c.recent.rate * 100 < s.threshold) continue;
      if (Number.isFinite(s.maxFavorite) && c.price < s.maxFavorite) continue;
      c.score = s.goal === 'safe' ? Math.log(c.chance) : Math.log(c.chance * c.decimal);
      out.push(c);
    }
  }
  return out.sort((a, b) => b.score - a.score || b.recent.rate - a.recent.rate || b.chance - a.chance || a.id.localeCompare(b.id));
}

/** Picks the legs and prices the ticket. `blocked` says why the next-best sides were left out. */
export function buildParlay(pool, settings = {}, now = Date.now()) {
  const s = { ...PARLAY_DEFAULTS, ...settings }, sides = qualifyingSides(pool, s, now);
  const legs = [], perPlayer = new Map(), perGame = new Map(), bench = [], cap = s.perGame === 'any' ? Infinity : Number(s.perGame) || 1;
  sides.forEach((c, index) => { c.rank = index + 1; });
  for (const c of sides) {
    const player = playerOf(c.leg), game = c.leg.gameId;
    const blocked = perPlayer.has(player) ? { reason: 'player', by: perPlayer.get(player) } : (perGame.get(game) || []).length >= cap ? { reason: 'game', by: perGame.get(game)[0] } : null;
    if (legs.length < s.legs && !blocked) { legs.push(c); perPlayer.set(player, c); perGame.set(game, [...(perGame.get(game) || []), c]); }
    else if (bench.length < 6 && (legs.length >= s.legs || blocked)) bench.push({ ...c, blocked: blocked || { reason: 'score' } });
  }
  const players = new Set(sides.map(c => playerOf(c.leg))).size, games = new Set(sides.map(c => c.leg.gameId)).size;
  const product = values => values.reduce((a, b) => a * b, 1);
  const decimal = product(legs.map(c => c.decimal));
  const ticket = legs.length ? {
    decimal, american: toAmerican(decimal), payout: s.stake * decimal, profit: s.stake * (decimal - 1),
    chance: product(legs.map(c => c.chance)), bookChance: product(legs.map(c => c.market)), trendChance: product(legs.map(c => c.recent.rate)),
    breakEven: 1 / decimal, ev: product(legs.map(c => c.chance * c.decimal)) - 1, sameGame: legs.length !== new Set(legs.map(c => c.leg.gameId)).size
  } : null;
  return { settings: s, legs, bench, ticket, qualifying: sides.length, players, games, short: legs.length < s.legs };
}

/** How many legs other settings would allow, for the "not enough lines" advice. */
export function relaxations(pool, settings, now = Date.now()) {
  const s = { ...PARLAY_DEFAULTS, ...settings }, count = changes => buildParlay(pool, { ...s, ...changes }, now).legs.length, now_ = count({}), out = [];
  // Only changes that add legs; the smallest threshold drop that does.
  for (const threshold of [s.threshold - 5, s.threshold - 10, s.threshold - 20].filter(t => t >= 50)) { const n = count({ threshold }); if (n > now_) { out.push({ changes: { threshold }, legs: n }); break; } }
  const tries = [[s.perGame !== 'any', { perGame: 'any' }], [Number.isFinite(s.maxFavorite), { maxFavorite: null }], [s.side !== 'both', { side: 'both' }], [s.markets?.length > 0, { markets: [] }], [s.skipInjured, { skipInjured: false }]];
  for (const [applies, changes] of tries) if (applies) { const n = count(changes); if (n > now_) out.push({ changes, legs: n }); }
  return out.sort((a, b) => b.legs - a.legs);
}

const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : Number(value.toFixed(digits)).toLocaleString('en-US');
const pct = (value, digits = 0) => value === null || !Number.isFinite(value) ? '—' : (value * 100).toFixed(digits) + '%';
export const americanText = odds => odds > 0 ? '+' + odds : String(odds);
const Side = side => side === 'over' ? 'Over' : 'Under';
const games = n => n === 1 ? '1 game' : n + ' games';

/** Plain-language reasons for one leg: good (supports it), warn (a risk), info. */
export function legReasons(c, { unit = '', label = '' } = {}) {
  const out = [], { leg, side, line } = c, above = side === 'over', diff = c.average === null ? null : c.average - line;
  const add = (tone, text) => out.push({ tone, text });
  add('good', `${Side(side)} ${fmt(line)} in ${c.recent.hits} of the last ${games(c.recent.n)} (${pct(c.recent.rate)})${c.recent.pushes ? `, ${c.recent.pushes} push${c.recent.pushes > 1 ? 'es' : ''}` : ''}.`);
  if (diff !== null) add((above ? diff > 0 : diff < 0) ? 'good' : 'warn', `Averaging ${fmt(c.average)} ${unit} (median ${fmt(c.median)}) in that stretch: ${fmt(Math.abs(diff))} ${above ? (diff >= 0 ? 'above' : 'below') : (diff <= 0 ? 'below' : 'above')} the line.`);
  const misses = c.recent.values.filter(v => above ? v <= line : v >= line);
  if (misses.length) { const worst = above ? Math.min(...misses) : Math.max(...misses); add('info', `Misses in that stretch: ${misses.map(v => fmt(v)).join(', ')} (worst ${fmt(worst)}, ${fmt(Math.abs(worst - line))} ${above ? 'short' : 'over'}).`); }
  else add('good', `No misses in the last ${games(c.recent.n)}; the ${above ? 'lowest' : 'highest'} was ${fmt(above ? Math.min(...c.recent.values) : Math.max(...c.recent.values))}.`);
  if (c.streak >= 3) add('good', `Has hit ${c.streak} straight.`);
  if (c.form) {
    const change = c.form.last - c.form.prior, meaningful = Math.abs(change) >= Math.max(0.5, Math.abs(line) * 0.1);
    if (meaningful) add((change > 0) === above ? 'good' : 'warn', `${change > 0 ? 'Trending up' : 'Trending down'}: last 5 average ${fmt(c.form.last)} vs ${fmt(c.form.prior)} the 5 before.`);
  }
  if (c.h2h.n) add(c.h2h.rate >= 0.5 ? 'good' : 'warn', `Against ${leg.opponent}: ${c.h2h.hits} of ${c.h2h.n} (${c.h2h.values.map(v => fmt(v)).join(', ')}).`);
  if (c.venue && c.venue.n >= 4) add(c.venue.rate >= c.recent.rate - 0.1 ? 'good' : 'warn', `${leg.home ? 'At home' : 'On the road'}: ${c.venue.hits} of ${c.venue.n} in the last 20 games.`);
  if (leg.matchup) {
    const relative = leg.matchup.rate / leg.matchup.league - 1;
    if (Math.abs(relative) >= 0.03) add((relative > 0) === above ? 'good' : 'warn', `${leg.opponent} allows ${pct(Math.abs(relative))} ${relative > 0 ? 'more' : 'less'} than the league average${leg.matchup.unit ? ` (${leg.matchup.unit})` : ''}.`);
  }
  if (leg.pitcher) add('info', `Faces ${leg.pitcher}.`);
  if (leg.projection !== null && leg.projection !== undefined) {
    const gap = leg.projection - line, agrees = above ? gap > 0 : gap < 0;
    add(agrees ? 'good' : 'warn', `Our projection: ${fmt(leg.projection)} ${unit}, ${fmt(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} the line${c.model !== null ? `; the model gives the ${Side(side)} ${pct(c.model)}` : ''}.`);
  }
  const pts = v => { const amount = fmt(Math.abs(v) * 100); return `${v >= 0 ? '+' : '−'}${amount} pt${amount === '1' ? '' : 's'}`; };
  const calibrated = Math.abs(c.priced - c.market) >= 0.005 ? `; on past slates prices like this hit ${pct(c.priced, 1)}` : '';
  const parts = [c.trendShift ? `the trend ${pts(c.trendShift)}` : '', c.model !== null ? `our model ${pts(c.modelShift)}` : ''].filter(Boolean).join(' and ');
  add(c.ev > 0 ? 'good' : c.ev >= -0.05 ? 'info' : 'warn', `${leg.book} ${americanText(c.price)}: ${c.twoSided ? 'no-vig' : 'estimated no-vig (only this side is posted)'} chance ${pct(c.market, 1)}${calibrated}. ${parts ? 'Adding ' + parts + ' gives' : 'Our estimate:'} ${pct(c.chance, 1)}, an expected return of ${c.ev >= 0 ? '+' : ''}${pct(c.ev, 1)} per dollar.`);
  if (c.gap !== null && c.gap >= RED_FLAG_GAP) add('warn', `Red flag: the trend says ${pct(c.recent.rate)} but the price says ${pct(c.market)}. On ${BACKTEST.wideGapSides.toLocaleString('en-US')} past lines where a trend beat its price by 30+ points, they hit ${pct(BACKTEST.wideGapActual)}, right at their prices (${pct(BACKTEST.wideGapPrice)}), nowhere near their trends (${pct(BACKTEST.wideGapTrend)}). The book usually knows something the record doesn't: a role change, a partial-game line, a matchup.`);
  if (leg.books === 1) add('warn', 'Only one book posts this line.');
  else if (leg.books > 1) add('info', `${leg.books} books post ${fmt(line)}.`);
  if (leg.concern && leg.status) add('warn', `Injury report: ${leg.status}.`);
  if (leg.lineup === 'confirmed') add('good', 'In the confirmed lineup.');
  if (c.recent.n < c.size) add('warn', `Only ${games(c.recent.n)} of history for this stat; small samples swing.`);
  return out;
}

/** One sentence on why this side made the ticket. */
export function legSummary(c, { goal = 'value', qualifying = 0 } = {}) {
  const rank = `#${c.rank} of ${qualifying} qualifying line${qualifying === 1 ? '' : 's'}`;
  if (goal === 'safe') return `${rank} by chance to hit: ${pct(c.chance)} by our estimate, on a ${pct(c.recent.rate)} trend priced at ${americanText(c.price)}.`;
  return `${rank} by value: ${pct(c.chance)} to hit at ${americanText(c.price)}, an expected return of ${c.ev >= 0 ? '+' : ''}${pct(c.ev, 1)} per dollar${c.ev < 0 && c.rank === 1 ? '; no qualifying line beats its price, and this one gives up the least' : ''}.`;
}
