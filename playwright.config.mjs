// Browser tests for the public site (e2e/). CI runs every project; locally, set
// PW_CHROMIUM_PATH to reuse an installed Chromium instead of downloading browsers.
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 3190);
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'node server.mjs',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { PORT: String(port), AUTO_SYNC: '0' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}) } },
    ...(chromiumPath ? [] : [
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ]),
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}) } },
  ],
});
