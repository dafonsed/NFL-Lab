// Downloads, parses and cleans the quote snapshot (and, for the DFS tools, the DFS props) off the
// main thread. Both are several MB; doing that in the page froze scrolling and typing on every
// refresh. The page receives ready-to-use records (see fetchFeed in ev.js).
import { loadFeed, loadDfsFeed } from './ev-feed-normalize.js?v=13';

self.onmessage = async ({ data }) => {
  const options = { method: data.method };
  const result = data.kind === 'dfs' ? await loadDfsFeed(data.url, data.syncedAt, data.apps, options) : await loadFeed(data.url, data.syncedAt, options);
  self.postMessage({ id: data.id, ...result });
};
