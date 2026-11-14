/**
 * Voice chat across browser engines: Chromium (Chrome, Edge, Samsung Internet, Android),
 * Firefox and WebKit (Safari, and every browser on iPhone/iPad) in ONE room, everybody must hear
 * everybody. Needs Firefox and WebKit installed with their system libraries, so it only runs where
 * CROSS_BROWSER=1 is set (the "voice-browsers" job in CI).
 */
import { expect, firefox, test, webkit, type Browser, type BrowserContext, type Page } from '@playwright/test';

test.skip(!process.env.CROSS_BROWSER, 'set CROSS_BROWSER=1 (needs Firefox + WebKit, see CI)');
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  permissions: ['microphone'],
});
test.setTimeout(240_000);

const FIREFOX_PREFS = {
  'media.navigator.streams.fake': true,
  'media.navigator.permission.disabled': true,
  'media.autoplay.default': 0,
  'media.autoplay.block-webaudio': false,
  'media.autoplay.blocking_policy': 0,
};

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}
const inVoice = (page: Page, n: number) => page.getByText(`بالصوت (${n})`).locator('visible=true').first();
const ringOf = (page: Page, who: string) => page.getByTestId('players-list').locator('li', { hasText: who }).locator('[role="img"]').first();

async function context(b: Browser, blockDirect: boolean): Promise<BrowserContext> {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar' });
  await ctx.grantPermissions(['microphone']).catch(() => {}); // not every engine knows this permission
  if (blockDirect) await ctx.addInitScript(() => localStorage.setItem('khabsa:voice:test-block-direct', '1'));
  return ctx;
}

async function play(browser: Browser, baseURL: string, blocked: 'none' | 'firefox' | 'webkit') {
  const ff = await firefox.launch({ firefoxUserPrefs: FIREFOX_PREFS });
  const wk = await webkit.launch();
  const players: { name: string; page: Page }[] = [];
  const errors: string[] = [];
  try {
    const engines: [string, Browser, boolean][] = [
      ['كروم', browser, false],
      ['فايرفوكس', ff, blocked === 'firefox'],
      ['سفاري', wk, blocked === 'webkit'],
    ];
    for (const [name, b, block] of engines) {
      const page = await (await context(b, block)).newPage();
      page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
      players.push({ name, page });
    }
    const [host, ...rest] = players;
    await host.page.goto(baseURL + '/create');
    await guest(host.page, host.name);
    await host.page.getByTestId('create-submit').click();
    await expect(host.page).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
    for (const p of rest) {
      await p.page.goto(host.page.url());
      await guest(p.page, p.name);
    }
    await expect(host.page.getByTestId('players-list').locator('li')).toHaveCount(3, { timeout: 30_000 });
    for (const p of players) {
      await p.page.getByTestId('voice-join').locator('visible=true').first().click();
      // a tap after joining, like a real user: unlocks audio playback in browsers that need it
      await p.page.mouse.click(5, 300);
    }
    for (const p of players) await expect(inVoice(p.page, 3), `${p.name} sees 3 in voice`).toBeVisible({ timeout: 30_000 });
    for (const p of players) {
      const unlock = p.page.getByRole('button', { name: /اكبس لتسمع/ });
      if (await unlock.isVisible().catch(() => false)) await unlock.click();
    }
    // every browser receives the sound of the two others (the ring is measured on received audio)
    for (const me of players)
      for (const other of players)
        if (me !== other) await expect(ringOf(me.page, other.name), `${me.name} hears ${other.name}`).toHaveAttribute('data-speaking', '1', { timeout: 40_000 });
    if (blocked !== 'none') {
      const p = players.find((x) => x.name === (blocked === 'firefox' ? 'فايرفوكس' : 'سفاري'))!;
      await expect(p.page.getByTestId('voice-relay').locator('visible=true').first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally {
    for (const p of players) await p.page.context().close().catch(() => {});
    await ff.close();
    await wk.close();
  }
}

test('Chrome + Firefox + Safari (WebKit) in one room: everybody hears everybody', async ({ browser, baseURL }) => {
  await play(browser, baseURL!, 'none');
});

test('same with Safari (WebKit) on a network that blocks direct connections: it goes through the server and still works', async ({ browser, baseURL }) => {
  await play(browser, baseURL!, 'webkit');
});

test('same with Firefox on a network that blocks direct connections', async ({ browser, baseURL }) => {
  await play(browser, baseURL!, 'firefox');
});
