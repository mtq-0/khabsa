import { expect, test, type Page } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  permissions: ['microphone'],
});

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

const live = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLMediaElement>('audio[data-voice]')].filter((el) => (el.srcObject as MediaStream | null)?.getAudioTracks()[0]?.readyState === 'live').length);

test('GitHub Pages edition: peer-to-peer voice chat between two players', async ({ browser }) => {
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar', permissions: ['microphone'] })).newPage();
  const b = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar', permissions: ['microphone'] })).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)));

  await a.goto('#/create');
  await guest(a, 'صوت أ');
  await a.getByTestId('create-submit').click();
  await expect(a).toHaveURL(/#\/r\/[A-Z2-9]{6}$/);
  await expect(a.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 });
  await b.goto(a.url());
  await guest(b, 'صوت ب');
  await expect(a.getByTestId('players-list').locator('li')).toHaveCount(2, { timeout: 60_000 });

  // voice is available (no more "not enabled" message)
  await expect(a.getByText('الصوت مش مفعّل')).toHaveCount(0);
  for (const p of [a, b]) await p.getByTestId('voice-join').first().click();
  for (const p of [a, b]) await expect(p.getByText('بالصوت (2)').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => live(a), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => live(b), { timeout: 30_000 }).toBe(1);

  // B leaves: A drops back to 1 in voice and B's audio element is gone
  await b.getByTestId('voice-leave').first().click();
  await expect(b.getByTestId('voice-join').first()).toBeVisible();
  await expect(a.getByText('بالصوت (1)').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => live(a), { timeout: 15_000 }).toBe(0);

  // B can rejoin
  await b.getByTestId('voice-join').first().click();
  await expect(b.getByText('بالصوت (2)').first()).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
