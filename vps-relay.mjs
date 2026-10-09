// VPS relay for OddsJam - accepts /fetch?path=XXX and proxies through CycleTLS
import http from 'http';
import { URL } from 'url';

let cycleTLS = null;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://oddsjam.com/',
  'Origin': 'https://oddsjam.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Ch-Ua': '"Chromium";v="129", "Google Chrome";v="129"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'User-Agent': UA
};
const OJ_BASE = 'https://oddsjam.com/api/backend/';

async function init() {
  if (cycleTLS) return cycleTLS;
  const { default: initCycleTLS } = await import('cycletls');
  cycleTLS = await initCycleTLS();
  return cycleTLS;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, relay: 'oddsjam-vps' }));
    return;
  }

  if (url.pathname !== '/fetch') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Use /fetch?path=...' }));
    return;
  }

  const path = url.searchParams.get('path');
  if (!path) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing path param' }));
    return;
  }

  try {
    const client = await init();
    const fullUrl = OJ_BASE + path.replace(/^\//, '');
    const response = await client(fullUrl, {
      userAgent: UA,
      headers: { ...BASE_HEADERS },
      timeout: 30
    }, 'get');

    let body = '';
    if (typeof response.body === 'string') body = response.body;
    else if (typeof response.data === 'string') body = response.data;
    else body = JSON.stringify(response.body ?? response.data);

    if (body.includes('Just a moment') || body.includes('challenge-platform')) {
      throw new Error('CF blocked');
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

const PORT = 3101;
server.listen(PORT, '0.0.0.0', () => {
  console.log('OddsJam VPS relay on port ' + PORT);
});
