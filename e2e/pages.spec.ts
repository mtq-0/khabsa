import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { playDrawRound } from './drawRound.ts';

async function player(browser: Browser, device: keyof typeof devices | null) {
  const ctx: BrowserContext = await browser.newContext(device ? { ...devices[device], locale: 'ar' } : { viewport: { width: 1366, height: 900 }, locale: 'ar' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

async function gameTab(page: Page) {
  const tab = page.getByRole('tab', { name: /اللعبة/ });
  if (await tab.isVisible()) await tab.click();
}

async function skipUntil(host: Page, done: () => Promise<boolean>, max = 40) {
  for (let i = 0; i < max && !(await done()); i++) {
    const skip = host.getByTestId('host-skip');
    if (await skip.isVisible()) await skip.click();
    else {
      const next = host.getByRole('button', { name: /الجولة الجاية|النتيجة النهائية|السؤال الجاي/ });
      if (await next.isVisible()) await next.click();
    }
    await host.waitForTimeout(500);
  }
}

test('GitHub Pages edition: host in the browser, friends join by link, private roles, chat, reconnect, host refresh', async ({ browser }) => {
  const host = await player(browser, null);
  const p2 = await player(browser, 'Pixel 7');
  const p3 = await player(browser, 'iPhone 13');
  const all = [host, p2, p3];

  await host.page.goto('#/create');
  await guest(host.page, 'أبو سند');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/#\/r\/[A-Z2-9]{6}$/);
  const code = host.page.url().split('/').pop()!;
  // the room is registered on the public signaling server
  await expect(host.page.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 });

  for (const [p, n] of [
    [p2, 'سلمى'],
    [p3, 'زيد'],
  ] as const) {
    await p.page.goto(`#/r/${code}`);
    await guest(p.page, n);
    await gameTab(p.page);
    await expect(p.page.getByTestId('ready-btn')).toBeVisible({ timeout: 45_000 });
  }
  await expect(host.page.getByTestId('players-list').locator('li')).toHaveCount(3);
  await expect(host.page.getByTestId('host-badge')).toContainText('متصلين: 2');
  // regression: the room lobby must fit phone screens (no horizontal overflow / zoom-out)
  for (const p of [p2, p3]) expect(await p.page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth) - screen.width)).toBeLessThanOrEqual(1);

  // chat across peers
  await p2.page.getByRole('tab', { name: /الشات/ }).click();
  await p2.page.getByTestId('chat-input').fill('مرحبا من الموبايل 👋');
  await p2.page.getByTestId('chat-input').press('Enter');
  await expect(host.page.getByTestId('chat-list')).toContainText('مرحبا من الموبايل 👋');
  await gameTab(p2.page);

  // مين برا السالفة: exactly one outsider, word never reaches them
  await host.page.locator('input[type=range]').first().fill('1');
  for (const p of [p2, p3]) await p.page.getByTestId('ready-btn').click();
  await host.page.getByTestId('start-game').click();
  for (const p of all) await expect(p.page.getByTestId('role-card')).toBeVisible();
  const roles = await Promise.all(all.map(async (p) => ((await p.page.getByTestId('role-card').innerText()).includes('إنت برا السالفة!') ? 'out' : 'in')));
  expect(roles.filter((r) => r === 'out')).toHaveLength(1);
  const insiders = all.filter((_, i) => roles[i] === 'in');
  const outsider = all[roles.indexOf('out')];
  const word = await insiders[0].page.getByTestId('secret-word').innerText();
  expect(await insiders[1].page.getByTestId('secret-word').innerText()).toBe(word);
  expect(await outsider.page.content()).not.toContain(word);
  await skipUntil(host.page, () => host.page.getByTestId('results').isVisible());
  for (const p of all) await expect(p.page.getByTestId('results')).toBeVisible();

  // مين برا الرسمة: every player gets an image, only their own
  await host.page.getByTestId('back-to-lobby').click();
  await host.page.getByTestId('select-game-outsider-picture').click();
  for (const p of [p2, p3]) {
    await gameTab(p.page);
    await p.page.getByTestId('ready-btn').click();
  }
  await host.page.getByTestId('start-game').click();
  const srcs: string[] = [];
  for (const p of all) {
    const img = p.page.getByTestId('role-card').locator('img').first();
    await expect(img).toBeVisible();
    srcs.push((await img.getAttribute('src')) ?? '');
  }
  // an illustration (inline) or a real photo (static file on the same site)
  for (const s of srcs) expect(s).toMatch(/^data:image\/svg\+xml;base64,|\/content\/photos\/[a-z0-9-]+\.webp$/);
  for (const p of all) await expect.poll(() => p.page.getByTestId('role-card').locator('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(new Set(srcs).size).toBe(2); // majority share one picture, the outsider has another

  // a guest closes the page and comes back: same seat, same private card
  const before = srcs[1];
  await p2.page.close();
  await expect(host.page.getByTestId('players-list')).toContainText('منقطع', { timeout: 40_000 });
  p2.page = await p2.ctx.newPage();
  await p2.page.goto(`#/r/${code}`);
  await gameTab(p2.page);
  await expect(p2.page.getByTestId('role-card').locator('img').first()).toHaveAttribute('src', before);
  await expect(host.page.getByTestId('players-list').locator('li')).toHaveCount(3);

  // the host refreshes: the room and the running game come back and friends reconnect
  await host.page.reload();
  await gameTab(host.page);
  await expect(host.page.getByTestId('role-card')).toBeVisible({ timeout: 30_000 });
  // …with its picture (regression: pictures were lost from memory on refresh)
  await expect(host.page.getByTestId('role-card').locator('img').first()).toHaveAttribute('src', srcs[0], { timeout: 30_000 });
  await expect(host.page.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 90_000 });
  await expect(host.page.getByTestId('host-badge')).toContainText('متصلين: 2', { timeout: 90_000 });
  await gameTab(p3.page);
  await expect(p3.page.getByTestId('role-card')).toBeVisible();

  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});

test('GitHub Pages edition: wrong or closed room shows a clear message', async ({ browser }) => {
  const { page, ctx } = await player(browser, 'iPhone 13');
  await page.goto('#/r/ZZZZZZ');
  await guest(page, 'تجربة');
  await expect(page.getByTestId('room-error')).toContainText('ما لقينا الغرفة', { timeout: 45_000 });
  await ctx.close();
});

test('GitHub Pages edition: draw & guess strokes travel between peers and guesses score', async ({ browser }) => {
  const host = await player(browser, null);
  const g = await player(browser, null);
  await host.page.goto('#/create?game=draw-guess');
  await guest(host.page, 'رسام');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 });
  const code = host.page.url().split('/').pop()!;
  await g.page.goto(`#/r/${code}`);
  await guest(g.page, 'مخمّن');
  await g.page.getByTestId('ready-btn').click();
  await host.page.locator('input[type=range]').first().fill('1');
  await host.page.getByTestId('start-game').click();
  const drawer = await Promise.race([host, g].map((p) => p.page.getByTestId('draw-choice').first().waitFor({ timeout: 20_000 }).then(() => p)));
  const other = drawer === host ? g : host;
  await drawer.page.getByTestId('draw-choice').first().click();
  const canvas = drawer.page.getByTestId('draw-canvas');
  const box = (await canvas.boundingBox())!;
  await drawer.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await drawer.page.mouse.down();
  for (let i = 1; i <= 20; i++) await drawer.page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.3 + i * 0.02));
  await drawer.page.mouse.up();
  await expect
    .poll(() =>
      other.page.getByTestId('draw-canvas').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(100);
  const secret = (await drawer.page.locator('h2', { hasText: 'ارسم:' }).innerText()).replace('ارسم:', '').trim();
  expect(await other.page.content()).not.toContain(`>${secret}<`);
  await other.page.getByTestId('draw-guess').fill(secret);
  await other.page.getByTestId('draw-guess').press('Enter');
  // with two players the turn ends as soon as the only guesser gets it
  await expect(other.page.locator('h2', { hasText: secret })).toBeVisible();
  await expect(other.page.getByText(/مخمّن \+\d+/)).toBeVisible();
  for (const p of [host, g]) expect(p.errors).toEqual([]);
  for (const p of [host, g]) await p.ctx.close();
});

test('GitHub Pages edition: مين برا الرسمة works between peers', async ({ browser }) => {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const all = await Promise.all([player(browser, null), player(browser, 'Pixel 7'), player(browser, null)]);
  const host = all[0];
  await host.page.goto('#/create?game=outsider-draw');
  await guest(host.page, names[0]);
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 });
  const code = host.page.url().split('/').pop()!;
  for (const [i, p] of all.entries()) {
    if (!i) continue;
    await p.page.goto(`#/r/${code}`);
    await guest(p.page, names[i]);
    await gameTab(p.page);
    await p.page.getByTestId('ready-btn').click({ timeout: 45_000 });
  }
  await host.page.locator('input[type=range]').first().fill('1');
  await host.page.getByTestId('start-game').click();
  for (const p of all) await gameTab(p.page);
  await playDrawRound(all.map((p, i) => ({ page: p.page, name: names[i] })));
  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});
