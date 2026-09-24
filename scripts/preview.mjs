import http from 'node:http';

const worker = (await import(new URL('../dist/server/index.js', import.meta.url).href)).default;
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  try {
    const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error.message);
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
