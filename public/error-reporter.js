// Sends uncaught front-end errors to /api/client-errors so they show up in the server logs.
// At most 5 reports per page view, duplicates skipped; the query string is never sent.
const sent = new Set();
let budget = 5;
function report(message, source, line, column, stack) {
  const key = `${message}|${source}|${line}`;
  if (!message || budget <= 0 || sent.has(key)) return;
  sent.add(key); budget -= 1;
  const body = JSON.stringify({ message: String(message).slice(0, 300), source: String(source || '').split('?')[0], line, column, stack: String(stack || '').slice(0, 1200), page: location.pathname });
  try {
    if (!navigator.sendBeacon?.('/api/client-errors', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* reporting must never throw */ }
}
addEventListener('error', event => {
  if (!event.message) return; // resource load errors (images etc.) are not script errors
  report(event.message, event.filename, event.lineno, event.colno, event.error?.stack);
});
addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  report(reason?.message || String(reason), reason?.fileName || '', null, null, reason?.stack);
});
