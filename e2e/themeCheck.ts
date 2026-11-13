/** Shared browser flow: the day / night switch (server and GitHub Pages suites). */
import { expect, type Page } from '@playwright/test';

const lum = (rgb: string) => {
  const m = rgb.match(/[\d.]+/g)!.map(Number);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const colors = (page: Page) =>
  page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const h = document.querySelector('h1, h2')!;
    return { bg: body.backgroundColor, text: getComputedStyle(h).color, theme: document.documentElement.dataset.theme ?? '', meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '' };
  });

export async function checkThemeToggle(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const toggle = page.getByTestId('theme-toggle').first();
  await expect(toggle).toBeVisible();

  // night is the default
  let c = await colors(page);
  expect(c.theme).toBe('dark');
  expect(lum(c.bg)).toBeLessThan(0.05);
  expect(contrast(c.text, c.bg)).toBeGreaterThan(7);

  // switch to day: light background, dark readable text, theme-color meta follows
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  c = await colors(page);
  expect(lum(c.bg)).toBeGreaterThan(0.8);
  expect(contrast(c.text, c.bg)).toBeGreaterThan(7);
  expect(c.meta).toBe('#f5f2ff');
  await expect(toggle).toHaveAttribute('aria-label', 'غيّر لوضع الليل');

  // the choice survives a reload, and is applied before the first paint (no dark flash)
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect((await colors(page)).theme).toBe('light');
  await expect(page.getByTestId('theme-toggle').first()).toHaveAttribute('data-theme-now', 'light');

  // and back to night
  await page.getByTestId('theme-toggle').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  c = await colors(page);
  expect(lum(c.bg)).toBeLessThan(0.05);
  expect(errors).toEqual([]);
}
