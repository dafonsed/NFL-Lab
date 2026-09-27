import http from 'node:http';
import { stat } from 'node:fs/promises';

// Preview the same artifact used for the Sportslab Sites deployment.
const entry = new URL('../sites-unified-sync/dist/server/index.js', import.meta.url);
const port = Number(process.env.PORT || 4182);
let loadedAt;
let workerPromise;

async function currentWorker() {
  const { mtimeMs } = await stat(entry);
  if (!workerPromise || loadedAt !== mtimeMs) {
    loadedAt = mtimeMs;
    workerPromise = import(`${entry.href}?build=${mtimeMs}`).then(module => module.default);
  }
  return workerPromise;
}

http.createServer(async (req, res) => {
  try {
    const worker = await currentWorker();
    const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method }));
    const headers = Object.fromEntries(response.headers);
    headers['cache-control'] = 'no-store';
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('The shared site preview is rebuilding. Refresh in a moment.');
    console.error(error.message);
  }
}).listen(port, '127.0.0.1', () => console.log(`Shared Sites preview: http://127.0.0.1:${port}`));
