// Downloads, parses and cleans the quote snapshot off the main thread. The snapshot is several MB
// and cleaning it takes hundreds of milliseconds on a phone; doing that in the page froze scrolling
// and typing on every refresh. The page receives ready-to-use quotes (see syncLocalApi in ev.js).
import { loadFeed } from './ev-feed-normalize.js?v=2';

self.onmessage = async ({ data }) => {
  self.postMessage({ id: data.id, ...(await loadFeed(data.url, data.syncedAt)) });
};
