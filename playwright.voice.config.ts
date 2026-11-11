import { defineConfig } from '@playwright/test';

/**
 * Voice E2E: runs a local LiveKit SFU in dev mode (devkey/secret) next to the
 * app. Requires the livekit-server binary at .tools/livekit-server (see
 * docs/TESTING.md). Chromium uses a fake microphone that emits a tone.
 */
const PORT = 3334;
export default defineConfig({
  testDir: 'e2e',
  testMatch: /voice\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
    permissions: ['microphone'],
  },
  webServer: [
    {
      command: './.tools/livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1',
      url: 'http://127.0.0.1:7880',
      timeout: 30_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      command: 'node src/server/index.ts',
      url: `http://localhost:${PORT}/api/health`,
      timeout: 60_000,
      env: {
        PORT: String(PORT),
        NODE_ENV: 'production',
        PUBLIC_URL: `http://localhost:${PORT}`,
        SESSION_SECRET: 'voice-secret-voice-secret-voice-secret-xx',
        DATABASE_URL: 'pglite:memory',
        STORAGE_DIR: '.tools/voice-storage',
        IP_RATE_LIMIT_SCALE: '100',
        LIVEKIT_URL: 'ws://127.0.0.1:7880',
        LIVEKIT_API_KEY: 'devkey',
        LIVEKIT_API_SECRET: 'secret',
      },
    },
  ],
});
