// Playwright bridge — routes OddsJam API calls through a real browser to bypass CF
// Singleton: one browser instance, one tab, reused for all requests

const PROXY_HOST = process.env.OJ_PROXY_HOST || 'us.proxy.geonode.io';
const PROXY_PORT = process.env.OJ_PROXY_PORT || '9000';
const PROXY_USER = process.env.OJ_PROXY_USER || 'geonode_HDE2pGBACk-type-residential';
const PROXY_PASS = process.env.OJ_PROXY_PASS || '771164ea-5a0b-4d35-a0fe-df6f71016414';

let browser = null;
let page = null;
let initPromise = null;
let lastHealthCheck = 0;
let requestCount = 0;

async function ensureBrowser() {
  if (browser && page) {
    // Health check every 30 seconds
    if (Date.now() - lastHealthCheck > 30000) {
      try {
        await page.evaluate('1 + 1');
        lastHealthCheck = Date.now();
        return page;
      } catch {
        console.log('[oj-bridge] Browser unhealthy, restarting...');
        await cleanup();
      }
    } else {
      return page;
    }
  }

  if (initPromise) return initPromise;
  initPromise = initBrowser();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
  return page;
}

async function initBrowser() {
  const { chromium } = await import('playwright');

  console.log('[oj-bridge] Launching Chromium through proxy...');
  browser = await chromium.launch({
    headless: true,
    proxy: {
      server: `http://${PROXY_HOST}:${PROXY_PORT}`,
      username: PROXY_USER,
      password: PROXY_PASS
    },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  // Remove automation detection signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });

  page = await context.newPage();

  // Navigate to oddsjam.com to clear CF challenge
  console.log('[oj-bridge] Navigating to oddsjam.com for CF clearance...');
  await page.goto('https://oddsjam.com/nfl/screen/moneyline', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  // Wait for CF to clear (check if page has real content, not CF challenge)
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const title = await page.title();
    if (!title.toLowerCase().includes('just a moment')) {
      console.log('[oj-bridge] CF cleared! Page title:', title);
      break;
    }
    if (i === 11) {
      console.log('[oj-bridge] Warning: CF may still be active');
    }
  }

  // Extra wait for API cookies to settle
  await page.waitForTimeout(2000);
  lastHealthCheck = Date.now();
  console.log('[oj-bridge] Browser ready');
  return page;
}

async function cleanup() {
  try {
    if (browser) await browser.close();
  } catch {}
  browser = null;
  page = null;
  lastHealthCheck = 0;
}

// ─── Main bridge function: fetch an OddsJam API path through the browser ───
export async function ojBridgeFetch(path) {
  const activePage = await ensureBrowser();
  requestCount++;

  try {
    const result = await activePage.evaluate(
      async (apiPath) => {
        try {
          const resp = await fetch('/api/backend/' + apiPath, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          });
          const text = await resp.text();

          if (text.includes('Just a moment') || text.includes('challenge-platform')) {
            return { cfBlocked: true, status: 403 };
          }

          if (text.includes("isn't available in your country")) {
            return { geoBlocked: true, status: 403 };
          }

          return { status: resp.status, body: text };
        } catch (err) {
          return { error: err.message, status: 0 };
        }
      },
      path
    );

    if (result.cfBlocked) {
      // CF re-challenged — restart browser and retry once
      console.log('[oj-bridge] CF re-challenge detected, restarting browser...');
      await cleanup();
      const retryPage = await ensureBrowser();
      const retryResult = await retryPage.evaluate(
        async (apiPath) => {
          try {
            const resp = await fetch('/api/backend/' + apiPath, {
              credentials: 'include',
              headers: { 'Accept': 'application/json' }
            });
            const text = await resp.text();
            return { status: resp.status, body: text };
          } catch (err) {
            return { error: err.message, status: 0 };
          }
        },
        path
      );

      if (retryResult.body) {
        try {
          return JSON.parse(retryResult.body);
        } catch {
          return retryResult;
        }
      }
      throw new Error('OddsJam CF challenge could not be cleared');
    }

    if (result.geoBlocked) {
      throw new Error('OddsJam geo-blocked — proxy exit not in US');
    }

    if (result.error) {
      throw new Error(`OddsJam bridge error: ${result.error}`);
    }

    if (result.status !== 200) {
      throw new Error(`OddsJam API ${result.status} on ${path}`);
    }

    return JSON.parse(result.body);
  } catch (error) {
    console.error(`[oj-bridge] Request #${requestCount} failed on ${path}:`, error.message);
    throw error;
  }
}

export async function bridgeStatus() {
  return {
    active: !!(browser && page),
    requests: requestCount,
    lastHealthCheck: lastHealthCheck ? new Date(lastHealthCheck).toISOString() : null
  };
}

export async function bridgeShutdown() {
  await cleanup();
}
