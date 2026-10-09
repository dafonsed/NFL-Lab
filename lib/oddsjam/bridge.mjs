// OddsJam bridge — dual mode:
// 1. CycleTLS (Chrome TLS fingerprint) — works locally, on VPS, on dedicated servers
// 2. Direct fetch fallback — works on serverless (Vercel) where Go binaries can't run
let cycleTLS = null;
let initPromise = null;
let mode = 'none';
let requestCount = 0;
let totalBytes = 0;
let directFetchWorks = null;

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

// ─── Direct fetch attempt (no CycleTLS) ───
async function directFetch(path) {
  const url = OJ_BASE + path.replace(/^\//, '');
  const resp = await fetch(url, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(15000)
  });

  const text = await resp.text();

  if (text.includes('Just a moment') || text.includes('challenge-platform')) {
    throw new Error('CF blocked direct fetch');
  }

  if (!resp.ok) {
    throw new Error(`OddsJam API ${resp.status}`);
  }

  return JSON.parse(text);
}

// ─── CycleTLS initialization (may fail on serverless) ───
async function tryInitCycleTLS() {
  try {
    const { default: initCycleTLS } = await import('cycletls');
    const client = await Promise.race([
      initCycleTLS(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('CycleTLS init timeout')), 5000))
    ]);
    mode = 'cycletls';
    return client;
  } catch (err) {
    console.log('[oj-bridge] CycleTLS unavailable (%s) — using direct fetch', err.message.substring(0, 60));
    mode = 'direct';
    return null;
  }
}

async function ensureClient() {
  if (mode === 'cycletls' && cycleTLS) return cycleTLS;
  if (mode === 'direct') return null;
  if (mode !== 'none') return cycleTLS;

  if (initPromise) return initPromise;
  initPromise = tryInitCycleTLS();
  try {
    cycleTLS = await initPromise;
  } finally {
    initPromise = null;
  }
  return cycleTLS;
}


// ─── VPS relay fetch (when direct fails and CycleTLS unavailable) ───
async function vpsRelayFetch(path) {
  const relayBase = process.env.VPS_RELAY_URL || 'http://209.145.53.103:3101';
  const url = relayBase + '/fetch?path=' + encodeURIComponent(path);
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) throw new Error('VPS relay error: ' + resp.status);
  const text = await resp.text();
  if (text.includes('Just a moment') || text.includes('challenge-platform')) {
    throw new Error('CF blocked VPS relay');
  }
  return JSON.parse(text);
}

export async function ojBridgeFetch(path) {
  await ensureClient();
  requestCount++;

  const cleanPath = path.replace(/^\//, '');

  // Strategy 1: CycleTLS (bypasses CF via TLS fingerprint)
  if (mode === 'cycletls' && cycleTLS) {
    try {
      const response = await cycleTLS(OJ_BASE + cleanPath, {
        userAgent: UA,
        headers: { ...BASE_HEADERS },
        timeout: 30
      });

      if (response.status === 200 && response.data) {
        const dataStr = JSON.stringify(response.data);
        totalBytes += dataStr.length;
        return response.data;
      }

      const bodyStr = String(response.data || '');
      if (bodyStr.includes('challenge') || bodyStr.includes('Just a moment')) {
        console.log('[oj-bridge] CycleTLS CF-blocked on %s, trying direct', cleanPath.substring(0, 50));
      } else {
        throw new Error(`OddsJam API ${response.status} on ${cleanPath}`);
      }
    } catch (err) {
      if (!err.message.includes('CF')) {
        console.error('[oj-bridge] CycleTLS error: %s', err.message.substring(0, 80));
      }
    }
  }

  // Strategy 2: Direct fetch (may work on Vercel/AWS IPs)
  // Skip if we already know direct fails and we're in relay mode
  if (mode !== 'vps-relay' || directFetchWorks !== false) {
    try {
      const data = await directFetch(cleanPath);
      totalBytes += JSON.stringify(data).length;
      if (mode === 'none') mode = 'direct';
      directFetchWorks = true;
      return data;
    } catch (err) {
      directFetchWorks = false;
      console.error('[oj-bridge] direct failed, trying VPS relay');
    }
  }

    // Strategy 3: VPS relay (CycleTLS running on the VPS)
    try {
      const relayBase = process.env.VPS_RELAY_URL || 'http://209.145.53.103:3101';
      const relayUrl = relayBase + '/fetch?path=' + encodeURIComponent(cleanPath);
      const relayResp = await fetch(relayUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
      });
      if (!relayResp.ok) throw new Error('VPS relay HTTP ' + relayResp.status);
      const relayText = await relayResp.text();
      if (relayText.includes('Just a moment') || relayText.includes('challenge-platform')) throw new Error('CF blocked VPS relay');
      const relayData = JSON.parse(relayText);
      totalBytes += relayText.length;
      mode = 'vps-relay';
      return relayData;
    } catch (relayErr) {
      console.error('[oj-bridge] VPS relay also failed: ' + relayErr.message);
      throw new Error('All strategies failed for ' + cleanPath.substring(0, 50));
    }
}

export async function bridgeStatus() {
  return {
    active: mode !== 'none',
    client: mode,
    requests: requestCount,
    totalMB: (totalBytes / 1024 / 1024).toFixed(2),
    cfBypass: mode === 'cycletls' ? 'tls-fingerprint' : 'direct-fetch',
    needsProxy: false,
    needsBrowser: false,
    serverless: mode === 'direct'
  };
}

export async function bridgeShutdown() {
  if (cycleTLS) {
    try { await cycleTLS.exit(); } catch {}
    cycleTLS = null;
  }
  mode = 'none';
}
