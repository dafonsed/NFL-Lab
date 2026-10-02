// Downloads, parses and cleans the quote snapshot (and, for the DFS tools, the DFS props) off the
// main thread. Both are several MB; doing that in the page froze scrolling and typing on every
// refresh. The page receives ready-to-use records (see fetchFeed in ev.js).
import { loadFeed, loadDfsFeed } from './ev-feed-normalize.js?v=4';

self.onmessage = async ({ data }) => {
  const result = data.kind === 'dfs' ? await loadDfsFeed(data.url, data.syncedAt) : await loadFeed(data.url, data.syncedAt);
  self.postMessage({ id: data.id, ...result });
};
