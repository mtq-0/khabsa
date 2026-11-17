import { expect, test, type Page } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  permissions: ['microphone'],
});

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}
/** still in voice: the leave button is there and everybody is listed in voice */
async function allInVoice(P: Page[], when: string) {
  for (const p of P) {
    await expect(p.getByTestId('voice-leave').first(), `in voice ${when}`).toBeAttached();
    await expect(p.getByText('بالصوت (3)').first(), `everybody in voice ${when}`).toBeAttached();
  }
}

// the room shows a different voice panel in the lobby and during a game (phones): switching must not drop anybody
for (const vp of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`voice stays on when the game starts and ends (${vp.width}px)`, async ({ browser }) => {
    const P: Page[] = [];
    for (let i = 0; i < 3; i++) P.push(await (await browser.newContext({ viewport: vp, locale: 'ar', permissions: ['microphone'] })).newPage());
    const [a, b, c] = P;
    await a.goto('/create');
    await guest(a, 'أبو سند');
    await a.getByTestId('create-submit').click();
    await expect(a).toHaveURL(/\/r\//);
    for (const [i, p] of [b, c].entries()) {
      await p.goto(a.url());
      await guest(p, `لاعب ${i + 2}`);
    }
    await expect(a.getByTestId('players-list').locator('li')).toHaveCount(3, { timeout: 30_000 });
    for (const p of P) await p.getByTestId('voice-join').locator('visible=true').first().click();
    for (const p of P) await expect(p.getByText('بالصوت (3)').locator('visible=true').first()).toBeVisible({ timeout: 20_000 });
    for (const p of [b, c]) await p.getByTestId('ready-btn').click();
    await a.getByTestId('start-game').click();
    await expect(a.getByTestId('host-skip')).toBeVisible();
    await a.waitForTimeout(2000);
    await allInVoice(P, 'after the game started');
    a.once('dialog', (d) => void d.accept());
    await a.getByRole('button', { name: 'وقّف اللعبة' }).click();
    await expect(a.getByTestId('start-game')).toBeVisible();
    await a.waitForTimeout(2000);
    await allInVoice(P, 'after the game ended');
  });
}
