/** Shared browser flow: choosing several categories in the lobby (server and GitHub Pages suites). */
import { expect, type Browser, type Page } from '@playwright/test';

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

export async function checkMultiCategory(browser: Browser, opts: { createUrl: string; roomUrl: (code: string) => string; hostOnline?: (host: Page) => Promise<void> }) {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const P: Page[] = [];
  for (const _ of names) P.push(await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' })).newPage());
  const errors: string[] = [];
  for (const p of P) p.on('pageerror', (e) => errors.push(String(e)));

  const host = P[0];
  await host.goto(opts.createUrl);
  await guest(host, names[0]);
  await host.getByTestId('create-submit').click();
  await expect(host).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  await opts.hostOnline?.(host);
  const code = host.url().split('/').pop()!;
  for (const [i, p] of P.entries()) {
    if (!i) continue;
    await p.goto(opts.roomUrl(code));
    await guest(p, names[i]);
    const tab = p.getByRole('tab', { name: /اللعبة/ });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await expect(p.getByTestId('ready-btn')).toBeVisible({ timeout: 45_000 });
  }

  // default: all categories
  await expect(host.getByTestId('category-count')).toHaveText('الكل');
  // choose two categories; the count follows and the chips show which are on
  await host.getByTestId('cat-food').click();
  await host.getByTestId('cat-animals').click();
  await expect(host.getByTestId('category-count')).toHaveText('2 مختارة');
  await expect(host.getByTestId('cat-food')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.getByTestId('cat-animals')).toHaveAttribute('aria-pressed', 'true');
  await expect(host.getByTestId('cat-any')).toHaveAttribute('aria-pressed', 'false');
  // a third one and then off again
  await host.getByTestId('cat-cars').click();
  await expect(host.getByTestId('category-count')).toHaveText('3 مختارة');
  await host.getByTestId('cat-cars').click();
  await expect(host.getByTestId('category-count')).toHaveText('2 مختارة');
  // the other players see the choice (read-only)
  for (const p of P.slice(1)) {
    const gameTab = p.getByRole('tab', { name: /اللعبة/ });
    if (await gameTab.isVisible().catch(() => false)) await gameTab.click();
    await expect(p.getByTestId('category-summary')).toContainText('أكل', { timeout: 20_000 });
    await expect(p.getByTestId('category-summary')).toContainText('حيوانات');
    await expect(p.getByTestId('category-summary')).not.toContainText('سيارات');
  }

  // play: the secret word's category is one of the two chosen
  for (const p of P.slice(1)) await p.getByTestId('ready-btn').click();
  await host.locator('input[type=range]').first().fill('1');
  await host.getByTestId('start-game').click();
  for (const p of P) await expect(p.getByTestId('role-card')).toBeVisible({ timeout: 20_000 });
  const cats: string[] = [];
  for (const p of P) {
    const text = await p.getByTestId('role-card').innerText();
    const m = text.match(/(?:التصنيف:\s*)?(أكل|حيوانات)/);
    if (m) cats.push(m[1]);
    expect(text).not.toMatch(/سيارات|دول|مدن|أماكن|مهن/);
  }
  expect(cats.length).toBeGreaterThanOrEqual(2);

  expect(errors).toEqual([]);
  for (const p of P) await p.context().close();
}
