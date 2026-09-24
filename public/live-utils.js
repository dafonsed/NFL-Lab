export function compareLiveLine({ projection, quote, snapshot, fetchedAt, stale, paused, now = Date.now() }) {
  if (paused) return { kind: 'paused', text: 'Player paused · injury, benching, or role concern.' };
  if (stale || !Number.isFinite(Date.parse(fetchedAt)) || now - Date.parse(fetchedAt) > 45_000 || now < Date.parse(fetchedAt) - 5000) return { kind: 'paused', text: 'Feed stale · refresh before comparing a line.' };
  if (!projection || !Number.isFinite(projection.projection)) return { kind: 'paused', text: projection?.reasons?.[0] || 'Projection unavailable.' };
  if (!quote || !Number.isFinite(quote.line) || !Number.isFinite(quote.at)) return { kind: 'empty', text: 'Enter the current full-game line to compare.' };
  if (now - quote.at > 60_000 || quote.snapshot !== snapshot || now < quote.at) return { kind: 'expired', text: 'Line needs reconfirmation · game changed or 60 seconds elapsed.' };
  const gap = projection.projection - quote.line;
  return { kind: 'current', gap, text: `${Math.abs(gap).toFixed(1)} ${gap >= 0 ? 'above' : 'below'} your line · projection gap, not a betting edge.` };
}
