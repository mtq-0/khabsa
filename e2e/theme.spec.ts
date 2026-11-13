import { test } from '@playwright/test';
import { checkThemeToggle } from './themeCheck.ts';

test('day / night switch: night by default, day on tap, remembered after reload, readable text in both', async ({ page }) => {
  await page.goto('/');
  await checkThemeToggle(page);
});
