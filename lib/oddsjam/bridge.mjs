// OddsJam direct connection — CycleTLS with Chrome TLS fingerprint
// Bypasses Cloudflare without browser, proxy, or Playwright
let cycleTLS = null;
let initPromise = null;
let requestCount = 0;
let totalBytes = 0;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://oddsjam.com/',
  'Origin': 'https://oddsjam.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
};

const OJ_BASE = 'https://oddsjam.com/api/backend/';

async function ensureClient() {
  if (cycleTLS) return cycleTLS;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { default: initCycleTLS } = await import('cycletls');
    cycleTLS = await initCycleTLS();
    console.log('[oj-bridge] CycleTLS ready — direct CF-free connection');
    return cycleTLS;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
  return cycleTLS;
}

export async function ojBridgeFetch(path) {
  const client = await ensureClient();
  requestCount++;

  try {
    const response = await client(OJ_BASE + path.replace(/^\//, ''), {
      userAgent: UA,
      headers: { ...BASE_HEADERS },
      timeout: 30
    });

    if (response.status !== 200) {
      const bodyStr = String(response.data || '');
      if (bodyStr.includes('Just a moment') || bodyStr.includes('challenge')) {
        throw new Error(`OddsJam CF challenge on ${path} (unexpected with CycleTLS)`);
      }
      throw new Error(`OddsJam API ${response.status} on ${path}`);
    }

    const dataStr = JSON.stringify(response.data || {});
    totalBytes += dataStr.length;
    return response.data;

  } catch (error) {
    console.error(`[oj-bridge] #${requestCount} ${path}: ${error.message}`);
    throw error;
  }
}

export async function bridgeStatus() {
  return {
    active: !!cycleTLS,
    client: 'cycletls',
    requests: requestCount,
    totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    cfBypass: 'tls-fingerprint',
    needsProxy: false,
    needsBrowser: false
  };
}

export async function bridgeShutdown() {
  if (cycleTLS) {
    try { await cycleTLS.exit(); } catch {}
    cycleTLS = null;
  }
}
