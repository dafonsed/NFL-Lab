// Load test for the public site. Usage:
//   npm run test:load                         (against a local server on :3100)
//   LOAD_BASE_URL=https://staging.example npm run test:load
// API paths are rate-limited per IP (240/min), so a single-machine load test should target pages.
// Fails (exit 1) when any path's error rate exceeds 1% or its p99 latency exceeds LOAD_P99_MS.
import autocannon from 'autocannon';

const base = (process.env.LOAD_BASE_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const duration = Number(process.env.LOAD_SECONDS || 15);
const connections = Number(process.env.LOAD_CONNECTIONS || 25);
const p99Limit = Number(process.env.LOAD_P99_MS || 1500);
const paths = (process.env.LOAD_PATHS || '/,/learn,/betting-education,/online-sports-betting/new-york,/sitemap.xml').split(',');

function run(path) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({ url: base + path, duration, connections, headers: { accept: 'text/html,application/json' } }, (error, result) => error ? reject(error) : resolve(result));
    autocannon.track(instance, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
  });
}

let failed = false;
console.log(`Load test: ${base} · ${connections} connections · ${duration}s per path\n`);
for (const path of paths) {
  const result = await run(path);
  const total = result.requests.total || 0;
  const bad = (result.errors || 0) + (result.timeouts || 0) + (result.non2xx || 0);
  const errorRate = total ? bad / total * 100 : 100;
  const p99 = result.latency.p99;
  const ok = errorRate <= 1 && p99 <= p99Limit;
  failed ||= !ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path.padEnd(38)} ${String(Math.round(result.requests.average)).padStart(6)} req/s  p50 ${String(result.latency.p50).padStart(5)} ms  p99 ${String(p99).padStart(5)} ms  errors ${errorRate.toFixed(2)}%`);
}
process.exitCode = failed ? 1 : 0;
