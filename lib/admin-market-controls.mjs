import { createHash } from 'node:crypto';

// These controls affect only distribution through the local normalized EV bridge.
// They do not pause collection at a sportsbook or affect unrelated research feeds.
export const MARKET_CONTROL_SCOPE = 'ev-local-api';
const fields = ['scope', 'kind', 'key', 'label', 'selector', 'blocked', 'version', 'reason', 'updatedAt', 'updatedBy'];
const fail = (message, status = 400, code = 'MARKET_CONTROL_INVALID') => { throw Object.assign(new Error(message), { status, code }); };
const cleanText = (value, maximum, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail(`Choose a valid ${label}.`);
  return value;
};

export function sourceControlKey(book) {
  return cleanText(book, 120, 'sportsbook').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Matches integrations/ev_tool/api_server.py's match_id, including UTF-8. */
export function eventControlKey({ sport, event }) {
  cleanText(sport, 40, 'sport'); cleanText(event, 240, 'event');
  return createHash('sha256').update(`${sport}|${event}`, 'utf8').digest('hex').slice(0, 16);
}

// A size guard, not a business limit: the provider's snapshot reached 77k quotes (player props
// and exchange contracts) on 2 Oct 2026, so the cap leaves room for growth.
export const MAX_MARKET_QUOTES = 250_000;
export function validateMarketQuotes(value) {
  if (!Array.isArray(value) || value.length > MAX_MARKET_QUOTES) fail('The quote provider returned an unsupported inventory.', 502, 'MARKET_INVENTORY_INVALID');
  const ids = new Set();
  for (const quote of value) {
    if (!quote || typeof quote !== 'object' || Array.isArray(quote)) fail('The quote provider returned an invalid inventory.', 502, 'MARKET_INVENTORY_INVALID');
    const id = typeof quote.id === 'number' && Number.isSafeInteger(quote.id) ? String(quote.id) : quote.id;
    try { cleanText(id, 180, 'quote ID'); sourceControlKey(quote.book); eventControlKey(quote); }
    catch { fail('The quote provider returned an invalid inventory.', 502, 'MARKET_INVENTORY_INVALID'); }
    if (ids.has(id)) fail('The quote provider returned duplicate quote IDs.', 502, 'MARKET_INVENTORY_INVALID');
    ids.add(id);
  }
  return value;
}

function decodeControl(row) {
  const selector = typeof row.selector === 'string' ? JSON.parse(row.selector) : row.selector;
  if (!selector || typeof selector !== 'object' || Array.isArray(selector) || row.scope !== MARKET_CONTROL_SCOPE || !['source', 'event'].includes(row.kind) || ![0, 1, false, true].includes(row.blocked) || !Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Invalid persisted market control.');
  const key = row.kind === 'source' ? sourceControlKey(selector.book) : eventControlKey(selector);
  if (key !== row.key) throw new Error('Invalid persisted market selector.');
  return { ...Object.fromEntries(fields.map(field => [field, row[field]])), selector, blocked: Boolean(row.blocked) };
}

/** No process cache: each response observes the latest committed database rules. */
export async function readMarketControls(db) {
  try {
    return (await db.selectFrom('adminMarketControl').select(fields).where('scope', '=', MARKET_CONTROL_SCOPE).orderBy('kind').orderBy('key').execute()).map(decodeControl);
  } catch {
    fail('Market distribution controls are unavailable. Try again after the service recovers.', 503, 'MARKET_CONTROLS_UNAVAILABLE');
  }
}

export function filterMarketQuotes(quotes, controls = []) {
  validateMarketQuotes(quotes);
  const sources = new Set(), events = new Set();
  for (const control of controls) {
    if (control.scope !== MARKET_CONTROL_SCOPE || !control.blocked) continue;
    (control.kind === 'source' ? sources : events).add(control.key);
  }
  return quotes.filter(quote => !sources.has(sourceControlKey(quote.book)) && !events.has(eventControlKey(quote)));
}

export function buildMarketMatches(quotes) {
  validateMarketQuotes(quotes);
  const matches = new Map();
  for (const quote of quotes) {
    const id = eventControlKey(quote);
    const match = matches.get(id) || { id, sport: quote.sport, event: quote.event, quoteCount: 0 };
    match.quoteCount += 1; matches.set(id, match);
  }
  return [...matches.values()];
}

function inventoryRows(quotes, controls) {
  const rows = new Map();
  for (const quote of quotes) {
    for (const record of [
      { kind: 'source', key: sourceControlKey(quote.book), label: quote.book.trim(), selector: { book: quote.book } },
      { kind: 'event', key: eventControlKey(quote), label: `${quote.sport} · ${quote.event}`, selector: { sport: quote.sport, event: quote.event } },
    ]) {
      const id = `${record.kind}:${record.key}`;
      const row = rows.get(id) || { ...record, quoteCount: 0, blocked: false, version: 0, observed: true };
      row.quoteCount += 1; rows.set(id, row);
    }
  }
  for (const control of controls) {
    const id = `${control.kind}:${control.key}`, current = rows.get(id);
    rows.set(id, { ...control, quoteCount: current?.quoteCount || 0, observed: Boolean(current) });
  }
  const sorted = [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { sources: sorted.filter(row => row.kind === 'source'), events: sorted.filter(row => row.kind === 'event') };
}

/** Raw upstream inventory is for staff inspection; suppression is applied at serving. */
export async function getMarketControlInventory({ db, loadQuotes }) {
  const controls = await readMarketControls(db);
  let quotes = [], inventoryUnavailable = false;
  try { quotes = validateMarketQuotes(await loadQuotes()); }
  catch { inventoryUnavailable = true; }
  return {
    scope: MARKET_CONTROL_SCOPE, ...inventoryRows(quotes, controls), controls,
    inventoryUnavailable, observedQuotes: inventoryUnavailable ? null : quotes.length,
    ...(inventoryUnavailable ? { inventoryError: 'Quote inventory is currently unavailable. Stored distribution controls remain active.' } : {}),
    effect: 'distribution-suppression', upstreamChanged: false,
  };
}

function validateChange(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['kind', 'key', 'blocked', 'expectedVersion', 'reason'].includes(key))) fail('Send a valid market-control change.');
  if (!['source', 'event'].includes(body.kind)) fail('Choose a source or event control.');
  cleanText(body.key, 240, 'control key');
  if (body.kind === 'source' ? sourceControlKey(body.key) !== body.key : !/^[a-f0-9]{16}$/.test(body.key)) fail('Choose a control from the current inventory.');
  if (typeof body.blocked !== 'boolean') fail('Choose whether distribution is suppressed.');
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) fail('Reload the control before changing it.');
  const reason = cleanText(body.reason, 500, 'reason').trim();
  if (reason.length < 8) fail('Enter a reason of 8 to 500 characters.');
  return { ...body, reason };
}

/** HTTP caller must enforce its real staff data permission, MFA, origin, and reauth. */
export async function setMarketControl({ system, actorId, body, loadQuotes }) {
  const values = validateChange(body);
  cleanText(actorId, 200, 'administrator');
  const inventory = await getMarketControlInventory({ db: system.db, loadQuotes });
  const item = [...inventory.sources, ...inventory.events].find(row => row.kind === values.kind && row.key === values.key);
  if (!item) {
    if (inventory.inventoryUnavailable) fail('The quote inventory is unavailable. New controls cannot be added until it recovers.', 503, 'MARKET_INVENTORY_UNAVAILABLE');
    fail('This source or event is not in the current quote inventory.', 404, 'MARKET_CONTROL_NOT_FOUND');
  }
  const control = await system.db.transaction().execute(async tx => {
    const prior = await tx.selectFrom('adminMarketControl').select(fields).where('scope', '=', MARKET_CONTROL_SCOPE).where('kind', '=', values.kind).where('key', '=', values.key).executeTakeFirst();
    const before = prior ? decodeControl(prior) : null;
    if ((before?.version || 0) !== values.expectedVersion) fail('This control changed. Reload it before trying again.', 409, 'MARKET_CONTROL_STALE');
    if (Boolean(before?.blocked) === values.blocked) fail('This distribution control already has that state.', 409, 'MARKET_CONTROL_UNCHANGED');
    const row = {
      scope: MARKET_CONTROL_SCOPE, kind: values.kind, key: values.key, label: item.label,
      selector: JSON.stringify(item.selector), blocked: values.blocked ? 1 : 0,
      version: values.expectedVersion + 1, reason: values.reason,
      updatedAt: new Date().toISOString(), updatedBy: actorId,
    };
    const query = before
      ? tx.updateTable('adminMarketControl').set(row).where('scope', '=', MARKET_CONTROL_SCOPE).where('kind', '=', values.kind).where('key', '=', values.key).where('version', '=', values.expectedVersion)
      : tx.insertInto('adminMarketControl').values(row).onConflict(conflict => conflict.columns(['scope', 'kind', 'key']).doNothing());
    const saved = await query.returning(fields).executeTakeFirst();
    if (!saved) fail('This control changed. Reload it before trying again.', 409, 'MARKET_CONTROL_STALE');
    await system.audit({ actorId, action: `admin.market.${values.kind}.${values.blocked ? 'suppress' : 'restore'}`, detail: {
      scope: MARKET_CONTROL_SCOPE, kind: values.kind, key: values.key, label: item.label,
      blocked: values.blocked, previousBlocked: Boolean(before?.blocked), version: row.version,
      reason: values.reason, effect: 'distribution-suppression', upstreamChanged: false,
    } }, tx);
    return decodeControl(saved);
  });
  return { control, effect: 'distribution-suppression', upstreamChanged: false };
}
