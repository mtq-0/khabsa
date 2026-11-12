import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    // unit tests stay offline: no real TMDB posters (tests that need posters use their own list)
    env: { KHABSA_POSTERS_FILE: 'tests/fixtures-no-posters.json' },
  },
});
