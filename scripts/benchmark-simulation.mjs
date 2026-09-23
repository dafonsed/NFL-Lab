// CPU benchmark only. Synthetic complete histories exercise each scoring family;
// these timings are not predictive validation or provider/network latency.
import fs from 'node:fs/promises';
import { simulateGame, SIMULATION_VERSION } from '../lib/game-simulation.mjs';
const results = [];
for (const [sport, score] of [['nfl', 24], ['nba', 112], ['wnba', 81], ['mlb', 5]]) {
  const game = { id: 'benchmark', date: '2025-03-01', state: 'pre', postseason: false, regularSeason: true, scheduledInnings: 9, neutralSite: false,
    teams: [{ id: 'A', abbreviation: 'A', homeAway: 'away' }, { id: 'B', abbreviation: 'B', homeAway: 'home' }] };
  const history = Array.from({ length: 40 }, (_, i) => ({ id: String(i), date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    home: i % 2 ? 'A' : 'B', away: i % 2 ? 'B' : 'A', homeScore: score + i % 3, awayScore: score - i % 4, complete: true, regulation: { homeScore: score + i % 3, awayScore: score - i % 4, method: 'synthetic regulation fixture' } }));
  simulateGame({ sport, game, history, simulations: 1000, seed: 'warmup' });
  for (const simulations of [1000, 10000, 50000]) {
    const times = []; let result;
    for (let repeat = 0; repeat < 5; repeat++) {
      const start = performance.now(); result = simulateGame({ sport, game, history, simulations, seed: 'benchmark' }); times.push(performance.now() - start);
    }
    results.push({ sport, simulations, medianMs: times.sort((a, b) => a - b)[2], maximumMs: Math.max(...times), bytes: Buffer.byteLength(JSON.stringify(result)) });
  }
}
const report = { version: SIMULATION_VERSION, node: process.version, platform: process.platform, method: 'Five sequential CPU measurements per sport/count after warmup, with 40 synthetic score-history rows. Excludes networking, props, rendering and concurrent server load.', results };
await fs.mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await fs.writeFile(new URL('../reports/simulation-audit-performance.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
