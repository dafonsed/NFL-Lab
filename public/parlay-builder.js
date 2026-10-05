// Trends parlay builder: scores every posted line on a slate (lib/parlay-pool.mjs) on its trend
// alone, keeps the sides that meet the member's hit-rate threshold, and picks the legs.
//
// Raw hit rates overstate: on 72,102 past sides (NFL weeks 1–4 of 2026, MLB 20 Jul – 27 Sep 2026;
// scripts/parlay-backtest.mjs), lines that hit 70%+ of their last 10 games went on to hit 66%, not 80%.
// So each side's expected hit rate blends:
//   - the player's last 20 games against this exact line, newer games counting more (a game's
//     weight halves every HALF_LIFE games back);
//   - how often the same side of the same market hit across this slate's other players, counted as
//     BASE_WEIGHT games (small samples lean on it, long ones less).
// That estimate came out calibrated on past slates (70%+ L10 sides: 68% predicted, 66% actual), and
// ranking by it picked better legs than ranking by raw L10 (September games, top tenth: 94% vs 87% hit). Lines far below
// (or for Unders, above) a player's usual output underperformed (58% vs 72%), so they carry a warning.
// No sportsbook price enters the estimate; prices only set the ticket's payout. Legs are taken best
// first, one per player and at most `perGame` per game; with those nested limits greedy picks the
// highest product of chances, i.e. the ticket most likely to hit (legs treated as independent).
export const HALF_LIFE = 8, BASE_WEIGHT = 20, MIN_GAMES = 5, FAR_LINE = 2;
export const PARLAY_DEFAULTS = Object.freeze({ legs: 3, threshold: 70, window: '10', side: 'both', perGame: 1, maxFavorite: -300, markets: [], skipInjured: true, stake: 10 });
// Backtest figures quoted to members (see the header).
export const BACKTEST = Object.freeze({ sides: 72102, hotSides: 16834, hotActual: 0.664, hotEstimate: 0.677, hotTrend: 0.797, topEstimateHit: 0.944, topRawHit: 0.87, farLineSides: 1100, farLineActual: 0.584, normalActual: 0.724 });

export const toDecimal = american => american > 0 ? 1 + american / 100 : 1 + 100 / -american;
export const toAmerican = decimal => decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
export const americanText = odds => odds > 0 ? '+' + odds : String(odds);
const median = values => { const s = [...values].sort((a, b) => a - b), n = s.length; return n ? n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 : null; };
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const playerOf = leg => leg.gameId + ':' + leg.playerId;
const sizeOf = window => window === '20' ? 20 : window === '5' ? 5 : 10;
const outcomeOf = (line, side) => v => (side === 'over' ? v > line : v < line) ? 1 : v === line ? 0.5 : 0;

/** A side's record over the newest `count` games, the way the Trends table counts it (pushes are not hits). */
export function record(games, line, side, count = games.length) {
  const rows = games.slice(0, count), hit = v => side === 'over' ? v > line : v < line;
  const hits = rows.filter(r => hit(r[1])).length, pushes = rows.filter(r => r[1] === line).length;
  return { n: rows.length, hits, pushes, rate: rows.length ? hits / rows.length : null, values: rows.map(r => r[1]) };
}

/** The recency-weighted share of games that went this side's way, and the total weight behind it. */
export function weightedTrend(games, line, side) {
  const outcome = outcomeOf(line, side);
  let weight = 0, hits = 0;
  games.forEach((r, i) => { const w = 0.5 ** (i / HALF_LIFE); weight += w; hits += w * outcome(r[1]); });
  return { rate: weight ? hits / weight : null, weight };
}

/** How often each side of each market went its way across the slate's players: the estimate's anchor. */
export function slateBaseRates(legs) {
  const sums = new Map(), add = (key, rate) => { const s = sums.get(key) || { total: 0, n: 0 }; s.total += rate; s.n++; sums.set(key, s); };
  for (const leg of legs) {
    if (leg.line === null || !Array.isArray(leg.games) || leg.games.length < MIN_GAMES) continue;
    for (const side of ['over', 'under']) { const { rate } = weightedTrend(leg.games, leg.line, side); add(leg.market + ':' + side, rate); add(side, rate); }
  }
  const average = key => { const s = sums.get(key); return s?.n ? s.total / s.n : null; };
  return (market, side) => (sums.get(market + ':' + side)?.n >= 5 ? average(market + ':' + side) : null) ?? average(side) ?? 0.5;
}

/** One side of one line, with every number the explanation uses. Null when the side has no posted price. */
export function evaluateSide(leg, side, { window = '10', base = () => 0.5 } = {}) {
  const price = leg[side], line = leg.line;
  if (price === null || price === undefined || line === null || !Array.isArray(leg.games)) return null;
  const outcome = outcomeOf(line, side), trend = weightedTrend(leg.games, line, side), baseRate = base(leg.market, side);
  const chance = (trend.weight * (trend.rate ?? 0) + BASE_WEIGHT * baseRate) / (trend.weight + BASE_WEIGHT);
  const size = sizeOf(window), recent = record(leg.games, line, side, size);
  const last10 = leg.games.slice(0, 10).map(r => r[1]), mid = median(last10);
  const spread = mid === null ? 0 : median(last10.map(v => Math.abs(v - mid))) * 1.4826;
  const cushion = mid === null ? null : (side === 'over' ? mid - line : line - mid) / Math.max(spread, 0.5, Math.abs(line) * 0.15);
  const last5 = leg.games.slice(0, 5).map(r => r[1]), prior5 = leg.games.slice(5, 10).map(r => r[1]);
  let streak = 0; for (const r of leg.games) { if (outcome(r[1]) === 1) streak++; else break; }
  const venue = leg.home === null || leg.home === undefined ? null : record(leg.games.filter(r => r[2] === (leg.home ? 1 : 0)), line, side);
  return {
    id: leg.id + ':' + side, leg, side, price, decimal: toDecimal(price), line, chance, baseRate, trend: trend.rate, weight: trend.weight,
    size, recent, cushion, farLine: cushion !== null && cushion >= FAR_LINE,
    l5: record(leg.games, line, side, 5), l10: record(leg.games, line, side, 10), l20: record(leg.games, line, side, 20),
    average: mean(recent.values), median: median(recent.values), streak,
    form: last5.length === 5 && prior5.length === 5 ? { last: mean(last5), prior: mean(prior5) } : null,
    h2h: record(leg.games.filter(r => r[3] === 1), line, side), venue
  };
}

/** Every side that meets the member's settings, most likely to hit first. */
export function qualifyingSides(pool, settings = {}, now = Date.now()) {
  const s = { ...PARLAY_DEFAULTS, ...settings }, base = slateBaseRates(pool.legs || []), markets = new Set(s.markets || []);
  const excluded = new Set(s.excluded || []), size = sizeOf(s.window), out = [];
  for (const leg of pool.legs || []) {
    if (!(Date.parse(leg.start) > now) || markets.size && !markets.has(leg.market) || s.skipInjured && leg.concern) continue;
    for (const side of s.side === 'both' ? ['over', 'under'] : [s.side]) {
      const c = evaluateSide(leg, side, { window: s.window, base });
      if (!c || excluded.has(c.id) || c.recent.n < Math.min(MIN_GAMES, size) || c.recent.rate * 100 < s.threshold) continue;
      if (Number.isFinite(s.maxFavorite) && c.price < s.maxFavorite) continue;
      out.push(c);
    }
  }
  return out.sort((a, b) => b.chance - a.chance || b.recent.rate - a.recent.rate || a.id.localeCompare(b.id));
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
    else if (bench.length < 6 && (legs.length >= s.legs || blocked)) bench.push({ ...c, blocked: blocked || { reason: 'rank' } });
  }
  const product = values => values.reduce((a, b) => a * b, 1), decimal = product(legs.map(c => c.decimal));
  const ticket = legs.length ? {
    decimal, american: toAmerican(decimal), payout: s.stake * decimal, profit: s.stake * (decimal - 1),
    chance: product(legs.map(c => c.chance)), trendChance: product(legs.map(c => c.recent.rate)), averageRate: mean(legs.map(c => c.recent.rate)),
    games: new Set(legs.map(c => c.leg.gameId)).size, sameGame: legs.length !== new Set(legs.map(c => c.leg.gameId)).size
  } : null;
  return { settings: s, legs, bench, ticket, qualifying: sides.length, players: new Set(sides.map(c => playerOf(c.leg))).size, games: new Set(sides.map(c => c.leg.gameId)).size, short: legs.length < s.legs };
}

/** Changes that would add legs when too few sides qualify: the smallest threshold drop, then each filter. */
export function relaxations(pool, settings, now = Date.now()) {
  const s = { ...PARLAY_DEFAULTS, ...settings }, count = changes => buildParlay(pool, { ...s, ...changes }, now).legs.length, current = count({}), out = [];
  for (const threshold of [s.threshold - 5, s.threshold - 10, s.threshold - 20].filter(t => t >= 50)) { const n = count({ threshold }); if (n > current) { out.push({ changes: { threshold }, legs: n }); break; } }
  const tries = [[s.perGame !== 'any', { perGame: 'any' }], [Number.isFinite(s.maxFavorite), { maxFavorite: null }], [s.side !== 'both', { side: 'both' }], [s.markets?.length > 0, { markets: [] }], [s.skipInjured, { skipInjured: false }]];
  for (const [applies, changes] of tries) if (applies) { const n = count(changes); if (n > current) out.push({ changes, legs: n }); }
  return out.sort((a, b) => b.legs - a.legs);
}

const fmt = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : Number(value.toFixed(digits)).toLocaleString('en-US');
const pct = value => value === null || !Number.isFinite(value) ? '—' : Math.round(value * 100) + '%';
const Side = side => side === 'over' ? 'Over' : 'Under';
const games = n => n === 1 ? '1 game' : n + ' games';

// Lower-case a market label for a sentence without breaking acronyms: "Receiving yards" → "receiving yards", "RBIs" stays.
const inSentence = label => String(label || '').replace(/\b([A-Z])(?=[a-z])/g, letter => letter.toLowerCase());
const near = (gap, line) => Math.abs(gap) < Math.max(0.1, Math.abs(line) * 0.02);

/**
 * What the leg card shows beyond its record, in three groups: 'good' (why it's in), 'warn' (watch for)
 * and 'info' (short facts shown as chips). It leads with the record; head-to-head and home/away splits
 * appear when they're strong for the pick or cut against it.
 */
export function legReasons(c, { unit = '', label = '' } = {}) {
  const out = [], { leg, side, line } = c, above = side === 'over', toward = gap => above ? gap > 0 : gap < 0;
  const add = (tone, text) => out.push({ tone, text });
  const by = gap => `${fmt(Math.abs(gap))}${unit ? ' ' + unit : ''} ${gap > 0 ? 'over' : 'under'} the line`;
  add('good', `${Side(side)} ${fmt(line)} in ${c.recent.hits} of the last ${c.recent.n}${c.l20.n > c.recent.n ? `, ${c.l20.hits} of the last ${c.l20.n}` : ''}`);
  if (c.h2h.n >= 2 && c.h2h.rate >= 0.75) add('good', `${c.h2h.hits} of ${c.h2h.n} against ${leg.opponent}`);
  // A split only says something when the history has both home and road games.
  if (c.venue && c.venue.n >= 4 && c.venue.n < leg.games.length && c.venue.rate >= Math.max(0.75, c.recent.rate)) add('good', `${c.venue.hits} of ${c.venue.n} ${leg.home ? 'at home' : 'on the road'}`);
  if (c.average !== null) {
    const gap = c.average - line;
    if (near(gap, line)) add('warn', `Averages ${fmt(c.average)}, right at the line`);
    else add(toward(gap) ? 'good' : 'warn', `Averages ${fmt(c.average)}, ${by(gap)}`);
  }
  const misses = c.recent.values.filter(v => above ? v <= line : v >= line);
  if (!misses.length && c.recent.n) add('good', `No misses in the last ${games(c.recent.n)}`);
  if (c.streak >= 3) add('good', `Hit ${c.streak} straight`);
  if (c.form) {
    const change = c.form.last - c.form.prior;
    if (Math.abs(change) >= Math.max(0.5, Math.abs(line) * 0.1)) add((change > 0) === above ? 'good' : 'warn', `${change > 0 ? 'Trending up' : 'Trending down'}: ${fmt(c.form.last)} over the last 5, ${fmt(c.form.prior)} the 5 before`);
  }
  if (c.h2h.n >= 2 && c.h2h.rate < 0.5) add('warn', `${c.h2h.hits} of ${c.h2h.n} against ${leg.opponent}`);
  if (c.venue && c.venue.n >= 4 && c.venue.rate < c.recent.rate - 0.1) add('warn', `${c.venue.hits} of ${c.venue.n} ${leg.home ? 'at home' : 'on the road'}`);
  if (leg.matchup) {
    const relative = leg.matchup.rate / leg.matchup.league - 1;
    if (Math.abs(relative) >= 0.03) add((relative > 0) === above ? 'good' : 'warn', `${leg.opponent} allows ${pct(Math.abs(relative))} ${relative > 0 ? 'more' : 'less'} than average${leg.matchup.unit ? ` (${leg.matchup.unit})` : ''}`);
  }
  if (leg.projection !== null && leg.projection !== undefined) {
    const gap = leg.projection - line;
    if (near(gap, line)) add('info', `Projection ${fmt(leg.projection)}, at the line`);
    else add(toward(gap) ? 'good' : 'warn', `Our projection: ${fmt(leg.projection)}, ${by(gap)}`);
  }
  if (c.farLine) add('warn', `Line set far ${above ? 'below' : 'above'} this player's usual output. Hot ${Side(side)}s like this hit ${pct(BACKTEST.farLineActual)} on past slates, not ${pct(BACKTEST.normalActual)}: the book may expect a different role`);
  if (leg.concern && leg.status) add('warn', `Injury report: ${leg.status}`);
  if (leg.books === 1) add('warn', 'Only one book posts this line');
  if (c.recent.n < c.size) add('warn', `Only ${games(c.recent.n)} of history`);
  if (leg.lineup === 'confirmed') add('good', 'In the confirmed lineup');
  if (c.median !== null) add('info', `Median ${fmt(c.median)}`);
  if (misses.length) { const worst = above ? Math.min(...misses) : Math.max(...misses); add('info', `Worst miss ${fmt(worst)}`); }
  else if (c.recent.values.length) add('info', `${above ? 'Low' : 'High'} ${fmt(above ? Math.min(...c.recent.values) : Math.max(...c.recent.values))}`);
  if (leg.pitcher) add('info', `Faces ${leg.pitcher}`);
  if (leg.books > 1) add('info', `${leg.books} books at ${fmt(line)}`);
  return out;
}

/** The leg's rank and where its expected hit rate comes from, in one line. */
export function legSummary(c, { qualifying = 0, label = '' } = {}) {
  return `#${c.rank} of ${qualifying} qualifying · ${pct(c.chance)} expected: the last ${games(Math.min(c.leg.games.length, 20))} (recent ones weighted) blended with this slate's ${Side(c.side)} rate in ${inSentence(label) || 'this market'} (${pct(c.baseRate)})`;
}
