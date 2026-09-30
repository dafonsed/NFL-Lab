// Email delivery for saved alerts. Alert rules and the quotes they watch live in each user's
// EV workbench document (synced to accountData, kind 'bets'). This job evaluates the rules on the
// server with the same alertMatches() the browser uses, emails new matches once, and records what
// it sent in alertDelivery. It never writes to the user's workbench document.
import { alertMatches } from '../../public/ev-core.js';

const WORKBENCH_KEY = 'sportslab-ev-workbench-v1';
const BASELINE = '__baseline__';
const KIND_LABEL = { 'fantasy-new': 'New fantasy prop', ev: 'EV threshold', movement: 'Line movement', price: 'Price threshold' };

/** The workbench stored inside a 'bets' accountData value (double-encoded JSON), or null. */
export function workbenchFrom(value) {
  try {
    const raw = JSON.parse(value)?.storage?.[WORKBENCH_KEY];
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return state && typeof state === 'object' ? state : null;
  } catch { return null; }
}

/** Current matches for every enabled rule, as { key, line }. */
export function currentMatches(state) {
  const safe = { quotes: state.quotes || [], history: state.history || [], dfs: state.dfs || [] };
  const matches = [];
  for (const rule of state.alerts || []) {
    if (rule.enabled === false) continue;
    let found = [];
    try { found = alertMatches(rule, safe); } catch { continue; }
    for (const match of found) matches.push({ key: `${rule.id}:${match.id}`, line: `${KIND_LABEL[rule.kind] || 'Alert'}: ${match.label}` });
  }
  return matches;
}

export async function runAlertEmails(system, { now = () => new Date(), maxUsers = 1000 } = {}) {
  const { db, mail } = system;
  const rows = await db.selectFrom('accountData').select(['userId', 'value']).where('kind', '=', 'bets').limit(maxUsers).execute();
  let checked = 0, emailed = 0, baselined = 0;
  for (const row of rows) {
    const state = workbenchFrom(row.value);
    if (!state?.alertEmail) continue;
    const user = await db.selectFrom('user').select(['id', 'email', 'name', 'status', 'emailVerified']).where('id', '=', row.userId).executeTakeFirst();
    if (!user || user.status !== 'active' || !user.emailVerified) continue;
    checked += 1;
    const matches = currentMatches(state);
    const sent = new Set((await db.selectFrom('alertDelivery').select('key').where('userId', '=', user.id).execute()).map(item => item.key));
    const stamp = now().toISOString();
    const record = keys => keys.length ? db.insertInto('alertDelivery').values(keys.map(key => ({ userId: user.id, key, sentAt: stamp }))).onConflict(c => c.columns(['userId', 'key']).doNothing()).execute() : null;
    if (!sent.has(BASELINE)) {
      // First run after email alerts are turned on: remember existing matches, send nothing.
      await record([BASELINE, ...matches.map(match => match.key)]);
      baselined += 1;
      continue;
    }
    const fresh = matches.filter(match => !sent.has(match.key));
    if (!fresh.length) continue;
    await record(fresh.map(match => match.key));
    await mail.send({ to: user.email, template: 'alert-matches', data: { name: user.name, url: '/ev?sport=all#line-alerts', lines: fresh.map(match => match.line) }, dedupeKey: `alert-matches:${user.id}:${fresh.map(match => match.key).join('|').slice(0, 180)}` });
    emailed += 1;
  }
  return { checked, emailed, baselined };
}
