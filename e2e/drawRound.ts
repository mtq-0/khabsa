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

/** One line: pen down, move, pen up. While the pen is still down, `whileDrawing` runs. */
async function line(page: Page, k: number, whileDrawing?: () => Promise<void>) {
  const canvas = page.getByTestId('draw-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const y = 0.15 + (k % 6) * 0.13;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.15 + i * 0.05), box.y + box.height * (y + (i % 2) * 0.04));
  if (whileDrawing) await whileDrawing();
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
    const others = players.filter((p) => p !== current);
    const before = await Promise.all(others.map((p) => inked(p.page)));
    await line(current.page, t, async () => {
      // live: the others watch the line grow before the pen is lifted
      for (const [i, p] of others.entries()) await expect.poll(() => inked(p.page), { timeout: 5000 }).toBeGreaterThan(before[i] + 100);
      for (const p of others) await expect(p.page.getByTestId('draw-canvas')).toHaveAttribute('data-strokes', String(t));
    });
    // the line shows up on everybody's copy of the same canvas
    for (const p of players) await expect(p.page.getByTestId('draw-canvas')).toHaveAttribute('data-strokes', String(t + 1), { timeout: 15_000 });
  }
  // random but fair: every lap everybody draws once, never the same player twice in a row
  for (let lap = 0; lap < laps; lap++) expect([...order.slice(lap * players.length, (lap + 1) * players.length)].sort()).toEqual(players.map((p) => p.name).sort());
  for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  // the canvas keeps going until EVERYONE is ready: with one player not ready it is still somebody's turn
  for (const p of players.slice(0, -1)) await p.page.getByTestId('ready-vote').click();
  await expect(players[players.length - 1].page.getByTestId('ready-count')).toContainText(`${players.length - 1}/${players.length}`, { timeout: 10_000 });
  await expect(players[0].page.getByTestId('draw-canvas')).toBeVisible();
  for (const p of players) await expect.poll(() => inked(p.page)).toBeGreaterThan(300);

  await players[players.length - 1].page.getByTestId('ready-vote').click();
  for (const p of insiders) await p.page.getByRole('button', { name: new RegExp(outsider.name) }).first().click();
  await outsider.page.locator('[data-testid^="vote-"]:not([disabled])').first().click();

  await expect(insiders[0].page.getByText('انكشف! 😱')).toBeVisible({ timeout: 15_000 });
  await expect(outsider.page.getByTestId('guess-option').first()).toBeVisible({ timeout: 15_000 });
  await outsider.page.getByTestId('guess-option').filter({ hasText: new RegExp(`^${word}$`) }).click();
  for (const p of players) await expect(p.page.getByTestId('answer-word')).toHaveText(word, { timeout: 15_000 });
  await expect(insiders[0].page.getByText(`${outsider.name} خمّن: ${word} ✅ +2`)).toBeVisible();
  return { word, outsider, order };
}
