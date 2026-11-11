import { defineConfig } from '@playwright/test';

const PORT = 3333;

export default defineConfig({
  testDir: 'e2e',
  // voice needs a LiveKit server: see playwright.voice.config.ts
  testIgnore: /(voice|pages)\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
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
    },
  },
});
