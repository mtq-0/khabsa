import { test } from '@playwright/test';
import { checkMultiCategory } from './categoryCheck.ts';

test('lobby: choose several categories, everyone sees them, and the round uses only those', async ({ browser }) => {
  await checkMultiCategory(browser, { createUrl: '/create', roomUrl: (c) => `/r/${c}` });
});
