import { defineConfig } from '@playwright/test';

const PORT = 3333;
/** Set LIVE_URL to run the journeys against a deployed server instead of a local one. */
const LIVE = process.env.LIVE_URL;

export default defineConfig({
  testDir: 'e2e',
  // voice needs a LiveKit server: see playwright.voice.config.ts
  testIgnore: /((voice|pages|roulette)\.spec\.ts|pages-theme)/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: LIVE ?? `http://localhost:${PORT}`,
    locale: 'ar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: LIVE ? undefined : {
    command: 'node src/server/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      PUBLIC_URL: `http://localhost:${PORT}`,
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      DATABASE_URL: 'pglite:memory',
      STORAGE_DIR: '.tools/e2e-storage',
      IP_RATE_LIMIT_SCALE: '100',
      ADMIN_EMAILS: 'admin@khabsa.test',
      // every movie word gets the (real) Titanic poster, so a movie round always shows one
      KHABSA_POSTERS_FILE: 'e2e/fixtures/posters.json',
    },
  },
});
