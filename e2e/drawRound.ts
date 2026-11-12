/** Shared browser flow for مين برا الرسمة؟ (used by the server and the GitHub Pages suites). */
import { expect, type Page } from '@playwright/test';

/** Number of painted pixels on a canvas. */
export const inked = (page: Page, sel = '[data-testid="draw-canvas"]') =>
  page.locator(sel).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });

/** One line: pen down, move, pen up. */
async function line(page: Page, k: number) {
  const canvas = page.getByTestId('draw-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const y = 0.15 + (k % 6) * 0.13;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.15 + i * 0.05), box.y + box.height * (y + (i % 2) * 0.04));
  await page.mouse.up();
}

/**
 * Plays one full round with 3+ players already in a started outsider-draw game (2 laps):
 * one shared canvas, players draw one line each in turn. Checks the privacy rules on the way.
 */
export async function playDrawRound(players: { page: Page; name: string }[], laps = 2) {
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

  const total = players.length * laps;
  const order: string[] = [];
  for (let t = 0; t < total; t++) {
    // exactly one player has the turn
    const current = await Promise.race(players.map((p) => p.page.getByTestId('your-turn').waitFor({ timeout: 15_000 }).then(() => p)));
    for (const p of players) if (p !== current) await expect(p.page.getByTestId('your-turn')).toHaveCount(0);
    order.push(current.name);
    await line(current.page, t);
    // the line shows up on everybody's copy of the same canvas
    for (const p of players) await expect(p.page.getByTestId('draw-canvas')).toHaveAttribute('data-strokes', String(t + 1), { timeout: 15_000 });
  }
  // random order, repeated each lap; everyone drew
  expect(order.slice(players.length)).toEqual(order.slice(0, players.length));
  expect([...order.slice(0, players.length)].sort()).toEqual(players.map((p) => p.name).sort());
  for (const p of players) await expect.poll(() => inked(p.page)).toBeGreaterThan(300);

  for (const p of players) await p.page.getByTestId('ready-vote').click();
  for (const p of insiders) await p.page.getByRole('button', { name: new RegExp(outsider.name) }).first().click();
  await outsider.page.locator('[data-testid^="vote-"]:not([disabled])').first().click();

  await expect(insiders[0].page.getByText('انكشف! 😱')).toBeVisible({ timeout: 15_000 });
  await expect(outsider.page.getByTestId('guess-option').first()).toBeVisible({ timeout: 15_000 });
  await outsider.page.getByTestId('guess-option').filter({ hasText: new RegExp(`^${word}$`) }).click();
  for (const p of players) await expect(p.page.getByTestId('answer-word')).toHaveText(word, { timeout: 15_000 });
  await expect(insiders[0].page.getByText(`${outsider.name} خمّن: ${word} ✅ +2`)).toBeVisible();
  return { word, outsider, order };
}
