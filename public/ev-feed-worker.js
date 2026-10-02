// Downloads, parses and cleans the quote snapshot and the DFS props off the main thread, and prices
// the DFS lines from both against the latest sportsbook quotes. Both downloads are several MB; doing
// this in the page froze scrolling and typing on every refresh. The page receives ready-to-use
// records, and DFS picks only when they changed (see fetchFeed in ev.js).
import { loadAndPrice, createDfsPricer } from './ev-feed-normalize.js?v=20';

const pricer = createDfsPricer();
self.onmessage = async ({ data }) => {
  const result = await loadAndPrice(pricer, data);
  self.postMessage({ id: data.id, ...result });
};
