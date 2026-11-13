import { test } from '@playwright/test';
import { checkThemeToggle } from './themeCheck.ts';

test('GitHub Pages edition: day / night switch works and is remembered (script path under /khabsa/)', async ({ page }) => {
  await page.goto('');
  await checkThemeToggle(page);
});
