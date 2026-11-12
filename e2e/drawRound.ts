/** Shared browser flow for مين برا الرسمة؟ (used by the server and the GitHub Pages suites). */
import { expect, type Page } from '@playwright/test';

/** Number of painted pixels on a canvas. */
export const inked = (page: Page, sel: string) =>
  page.locator(sel).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });

async function scribble(page: Page, k: number) {
  const canvas = page.getByTestId('draw-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * (0.2 + k * 0.15));
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * (0.2 + k * 0.15 + (i % 2) * 0.05));
  await page.mouse.up();
}

/**
 * Plays one full round with 3+ players already in a started outsider-draw game.
 * Checks the privacy rules on the way and returns the round's word.
 */
export async function playDrawRound(players: { page: Page; name: string }[]) {
  for (const p of players) await expect(p.page.getByTestId('role-card')).toBeVisible({ timeout: 20_000 });
  const roles = await Promise.all(players.map(async (p) => ((await p.page.getByTestId('role-card').innerText()).includes('إنت برا الرسمة!') ? 'out' : 'in')));
  expect(roles.filter((r) => r === 'out')).toHaveLength(1);
  const outsider = players[roles.indexOf('out')];
  const insiders = players.filter((p) => p !== outsider);
  const word = await insiders[0].page.getByTestId('secret-word').innerText();
  for (const p of insiders) expect(await p.page.getByTestId('secret-word').innerText()).toBe(word);
  expect(await outsider.page.content()).not.toContain(word);

  for (const p of players) await p.page.getByTestId('seen-btn').click();
  for (const p of players) await expect(p.page.getByTestId('draw-canvas')).toBeVisible();

  // everybody draws on their own canvas; nobody else sees it yet
  for (const [i, p] of players.entries()) {
    await scribble(p.page, i);
    expect(await inked(p.page, '[data-testid="draw-canvas"]')).toBeGreaterThan(100);
  }
  for (const p of players) await expect(p.page.getByTestId('gallery')).toHaveCount(0);
  for (const p of players.slice(0, -1)) await p.page.getByTestId('draw-done').click();
  await expect(players[0].page.getByTestId('draw-handed-in')).toBeVisible();
  await expect(players.at(-1)!.page.getByText(`${players.length - 1}/${players.length} خلصوا`)).toBeVisible();
  await players.at(-1)!.page.getByTestId('draw-done').click();

  // the gallery: every drawing, for everyone, actually painted
  for (const p of players) {
    await expect(p.page.getByTestId('gallery')).toBeVisible({ timeout: 15_000 });
    const cards = p.page.locator('[data-testid^="drawing-"] canvas');
    await expect(cards).toHaveCount(players.length);
    for (let i = 0; i < players.length; i++) await expect.poll(() => inked(p.page, `[data-testid^="drawing-"] >> nth=${i} >> canvas`)).toBeGreaterThan(50);
  }

  for (const p of players) await p.page.getByTestId('ready-vote').click();
  for (const p of insiders) await p.page.getByRole('button', { name: new RegExp(outsider.name) }).first().click();
  await outsider.page.locator('[data-testid^="vote-"]:not([disabled])').first().click();

  await expect(insiders[0].page.getByText('انكشف! 😱')).toBeVisible({ timeout: 15_000 });
  await expect(outsider.page.getByTestId('guess-option').first()).toBeVisible({ timeout: 15_000 });
  await outsider.page.getByTestId('guess-option').filter({ hasText: new RegExp(`^${word}$`) }).click();
  for (const p of players) await expect(p.page.getByTestId('answer-word')).toHaveText(word, { timeout: 15_000 });
  await expect(insiders[0].page.getByText(`${outsider.name} خمّن: ${word} ✅ +2`)).toBeVisible();
  return { word, outsider };
}
