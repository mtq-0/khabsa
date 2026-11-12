import { defineConfig } from '@playwright/test';

/**
 * E2E for the GitHub Pages (peer-to-peer) edition. Builds the static site,
 * serves it under /khabsa/ and plays with isolated browser contexts.
 * Uses the public PeerJS signaling server, so it needs internet access.
 * Set PAGES_URL to test an already deployed site instead.
 */
const PORT = 4173;
const deployed = process.env.PAGES_URL;
export default defineConfig({
  testDir: 'e2e',
  testMatch: /pages(-voice)?\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: deployed ?? `http://localhost:${PORT}/khabsa/`,
    locale: 'ar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: deployed
    ? undefined
    : {
        command: `npx vite build --mode pages && node scripts/build-pages-content.ts dist-pages && node scripts/serve-pages.mjs ${PORT}`,
        url: `http://localhost:${PORT}/khabsa/`,
        timeout: 120_000,
        reuseExistingServer: false,
      },
});
