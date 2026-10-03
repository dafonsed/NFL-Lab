// Email delivery for saved alerts. Alert rules live in each user's EV workbench document (synced to
// accountData, kind 'bets'); the document never holds feed prices (the page saves quotes: [] and
// history: []), so this job reads the quote feed itself, once per run, as the site serves it (market
// controls applied, cleaned like the page). It evaluates the rules with the same alertMatches() the
// browser uses, with the member's own pricing settings and only the books their state allows, emails
// new matches once, and records what it sent in alertDelivery. It never writes to the user's
// workbench document.
import { alertMatches } from '../../public/ev-core.js';
import { suiteSettings } from '../../public/ev-advanced-math.js';
import { normalizeFeed } from '../../public/ev-feed-normalize.js';
import { sportsbookAvailable, STATE_STORAGE_KEY } from '../../public/sportsbook-availability.js';
import { readEvQuotes } from '../ev-api-proxy.mjs';
import { filterMarketQuotes, readMarketControls } from '../admin-market-controls.mjs';

const WORKBENCH_KEY = 'sportslab-ev-workbench-v1';
const BASELINE = '__baseline__';
const KIND_LABEL = { 'fantasy-new': 'New fantasy prop', ev: 'EV threshold', movement: 'Line movement', price: 'Price threshold' };
// A broad rule can match hundreds of new prices in one run; the email lists the first ones.
const MAX_EMAIL_LINES = 50;

/** The workbench stored inside a 'bets' accountData value (double-encoded JSON), or null. */
export function workbenchFrom(value) {
  try {
    const raw = JSON.parse(value)?.storage?.[WORKBENCH_KEY];
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return state && typeof state === 'object' ? state : null;
  } catch { return null; }
}

/** The member's sportsbook state ('' when unset) from a 'preferences' accountData value. */
export function sportsbookStateFrom(value) {
  try {
    const raw = JSON.parse(value)?.storage?.[STATE_STORAGE_KEY];
    return typeof raw === 'string' ? raw : '';
  } catch { return ''; }
}

// A line-movement rule compares a book's line with the line it showed before; the page records that
// history as it refreshes, but this job sees only the current feed, so movement rules are checked in
// the browser and never emailed (the page says so beside the email switch).
export const EMAILED_RULE_KINDS = Object.freeze(['price', 'ev', 'fantasy-new']);
const enabledRules = state => (Array.isArray(state.alerts) ? state.alerts : []).filter(rule => rule && rule.enabled !== false && EMAILED_RULE_KINDS.includes(rule.kind));
// Price and EV rules read feed prices; new-fantasy-prop rules read the member's saved DFS lines.
const needsQuotes = state => enabledRules(state).some(rule => rule.kind !== 'fantasy-new');

/**
 * Current matches for every emailed rule, as { key, line }. `quotes` are the current feed prices;
 * without them the workbench's own (always empty when saved by the page) quotes are used. As on the
 * page, a match must be at a book available in the member's state, and EV is priced from every book
 * with their saved devig method, reference books and limits.
 */
export function currentMatches(state, quotes, { sportsbookState = '' } = {}) {
  const safe = { quotes: Array.isArray(quotes) ? quotes : (state.quotes || []), history: [], dfs: state.dfs || [], suite: state.suite };
  const options = { settings: suiteSettings(state.suite?.settings), offered: q => sportsbookAvailable(q.book, sportsbookState) };
  const matches = [];
  for (const rule of enabledRules(state)) {
    let found = [];
    try { found = alertMatches(rule, safe, options); } catch { continue; }
    for (const match of found) matches.push({ key: `${rule.id}:${match.id}`, line: `${KIND_LABEL[rule.kind] || 'Alert'}: ${match.label}` });
  }
  return matches;
}

/**
 * The feed as /api/ev/quotes distributes it (suppressed books and events removed), cleaned as the page
 * cleans it: stale, started and mislabeled records dropped, one stable id per selection. Fair values
 * are devigged from the raw two-sided prices by alertMatches, never taken from the feed.
 */
export async function loadAlertQuotes(system, { now = () => new Date(), readQuotes = readEvQuotes } = {}) {
  const inventory = await readQuotes();
  const controls = await readMarketControls(system.db);
  const visible = controls.some(control => control.blocked) ? filterMarketQuotes(inventory, controls) : inventory;
  return normalizeFeed(visible, { syncedAt: now().toISOString(), price: false }).quotes;
}

export async function runAlertEmails(system, { now = () => new Date(), maxUsers = 1000, loadQuotes = () => loadAlertQuotes(system, { now }) } = {}) {
  const { db, mail } = system;
  const rows = await db.selectFrom('accountData').select(['userId', 'value']).where('kind', '=', 'bets').limit(maxUsers).execute();
  const result = { checked: 0, emailed: 0, baselined: 0, skipped: 0, failed: 0 };
  const eligible = [];
  for (const row of rows) {
    const state = workbenchFrom(row.value);
    if (!state?.alertEmail) continue;
    const user = await db.selectFrom('user').select(['id', 'email', 'name', 'status', 'emailVerified']).where('id', '=', row.userId).executeTakeFirst();
    if (!user || user.status !== 'active' || !user.emailVerified) continue;
    const preferences = await db.selectFrom('accountData').select(['value']).where('userId', '=', row.userId).where('kind', '=', 'preferences').executeTakeFirst();
    eligible.push({ state, user, sportsbookState: sportsbookStateFrom(preferences?.value) });
  }
  // One feed read for the whole run, only when a rule needs prices. If it fails, those users wait
  // for the next run: baselining or comparing against an empty feed would later email every match.
  let quotes = null;
  if (eligible.some(({ state }) => needsQuotes(state))) {
    try { quotes = await loadQuotes(); }
    catch (error) { console.error('[alerts] The quote feed is unavailable for this run:', error?.code || error?.message || error); }
  }
  for (const { state, user, sportsbookState } of eligible) {
    if (needsQuotes(state) && !quotes) { result.skipped += 1; continue; }
    // One member's bad rule, document or delivery must not stop everyone else's alerts.
    try {
      result.checked += 1;
      const matches = currentMatches(state, quotes || [], { sportsbookState });
      const sent = new Set((await db.selectFrom('alertDelivery').select('key').where('userId', '=', user.id).execute()).map(item => item.key));
      const stamp = now().toISOString();
      // Keys are recorded before the email is queued, so a failure can drop an email but never repeat one.
      const record = keys => keys.length ? db.insertInto('alertDelivery').values(keys.map(key => ({ userId: user.id, key, sentAt: stamp }))).onConflict(c => c.columns(['userId', 'key']).doNothing()).execute() : null;
      if (!sent.has(BASELINE)) {
        // First run after email alerts are turned on: remember existing matches, send nothing.
        await record([BASELINE, ...matches.map(match => match.key)]);
        result.baselined += 1;
        continue;
      }
      const fresh = matches.filter(match => !sent.has(match.key));
      if (!fresh.length) continue;
      await record(fresh.map(match => match.key));
      const lines = fresh.slice(0, MAX_EMAIL_LINES).map(match => match.line);
      if (fresh.length > MAX_EMAIL_LINES) lines.push(`…and ${fresh.length - MAX_EMAIL_LINES} more. Open your alerts to see them all.`);
      await mail.send({ to: user.email, template: 'alert-matches', data: { name: user.name, url: '/ev?sport=all#line-alerts', lines }, dedupeKey: `alert-matches:${user.id}:${fresh.map(match => match.key).join('|').slice(0, 180)}` });
      result.emailed += 1;
    } catch (error) {
      result.failed += 1;
      console.error('[alerts] Alert check failed for one account:', error?.message || error);
    }
  }
  return result;
}
