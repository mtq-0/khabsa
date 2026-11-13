import { expect, test } from '@playwright/test';
import { checkMultiCategory } from './categoryCheck.ts';

test('GitHub Pages edition: choose several categories in the lobby and play with them', async ({ browser }) => {
  await checkMultiCategory(browser, {
    createUrl: '#/create',
    roomUrl: (c) => `#/r/${c}`,
    hostOnline: (host) => expect(host.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 }),
  });
});
