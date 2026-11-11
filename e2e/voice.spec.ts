import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

/** Live remote audio tracks attached by the voice client. */
const remoteTracks = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLMediaElement>('audio[data-voice]')].map((el) => {
      const t = (el.srcObject as MediaStream | null)?.getAudioTracks()[0];
      return { who: el.dataset.voice, state: t?.readyState ?? 'none', muted: t?.muted ?? true };
    }),
  );

test('two players connect to voice through the SFU, hear each other, mute and leave cleanly', async ({ browser }) => {
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)));

  await a.goto('/create');
  await guest(a, 'صوت أ');
  await a.getByTestId('create-submit').click();
  await expect(a).toHaveURL(/\/r\//);
  await b.goto(a.url());
  await guest(b, 'صوت ب');
  await expect(b.getByTestId('players-list').locator('li')).toHaveCount(2);

  // voice is optional: the room already works before anyone joins voice
  for (const p of [a, b]) await p.getByTestId('voice-join').first().click();
  for (const p of [a, b]) await expect(p.getByText('بالصوت (2)').first()).toBeVisible({ timeout: 20_000 });

  // each side receives exactly one live remote audio track (the other player's mic)
  await expect.poll(async () => (await remoteTracks(a)).filter((t) => t.state === 'live').length, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => (await remoteTracks(b)).filter((t) => t.state === 'live').length, { timeout: 20_000 }).toBe(1);

  // the fake mic emits a tone: the other side sees a speaking indicator
  await expect.poll(() => a.locator('[data-testid="players-list"] .animate-pulse-ring').count(), { timeout: 20_000, intervals: [100] }).toBeGreaterThan(0);

  // mute toggles
  await b.getByRole('button', { name: 'مايك' }).first().click();
  await expect(b.getByRole('button', { name: 'مسكّر' }).first()).toBeVisible();
  await b.getByRole('button', { name: 'مسكّر' }).first().click();

  // B leaves voice: A stays connected and its own mic keeps publishing
  await b.getByTestId('voice-leave').first().click();
  await expect(b.getByTestId('voice-join').first()).toBeVisible();
  await expect(a.getByText('بالصوت (1)').first()).toBeVisible({ timeout: 20_000 });
  // B's audio element is cleaned up on A's side (no leaked media elements)
  await expect.poll(() => a.evaluate(() => document.querySelectorAll('audio[data-voice]').length), { timeout: 10_000 }).toBe(0);
  // B rejoins and hears A again (A's track was never stopped)
  await b.getByTestId('voice-join').first().click();
  await expect.poll(async () => (await remoteTracks(b)).filter((t) => t.state === 'live').length, { timeout: 20_000 }).toBe(1);
  expect(errors).toEqual([]);
});
