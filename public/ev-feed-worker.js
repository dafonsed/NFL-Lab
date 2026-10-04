// Downloads, parses and cleans the quote snapshot and the DFS props off the main thread, and prices
// the DFS lines from both against the latest sportsbook quotes. Both downloads are several MB; doing
// this in the page froze scrolling and typing on every refresh. The page receives ready-to-use
// records, and DFS picks only when they changed (see fetchFeed in ev.js).
import { loadAndPrice, createDfsPricer } from './ev-feed-normalize.js?v=26';

const pricer = createDfsPricer();
self.onmessage = async ({ data }) => {
  // A failure still answers, so the page reports it instead of waiting out its timeout.
  try { self.postMessage({ id: data.id, ...await loadAndPrice(pricer, data) }); }
  catch (error) { self.postMessage({ id: data.id, ok: false, kind: 'worker', message: String(error?.message || '') }); }
};
