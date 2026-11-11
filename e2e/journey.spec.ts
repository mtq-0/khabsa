import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** Each player is an isolated browser context (own cookies/storage) on a different device profile. */
async function player(browser: Browser, device: keyof typeof devices | null): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext(device ? { ...devices[device], locale: 'ar' } : { viewport: { width: 1366, height: 900 }, locale: 'ar' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

/** On mobile the room is split into tabs; make sure the game tab is visible. */
async function gameTab(page: Page) {
  const tab = page.getByRole('tab', { name: /اللعبة/ });
  if (await tab.isVisible()) await tab.click();
}

test('full journey: create, invite link, chat, play مين برا السالفة, reconnect, switch to ارسم وخمّن', async ({ browser }) => {
  const host = await player(browser, null);
  const p2 = await player(browser, 'Pixel 7');
  const p3 = await player(browser, 'iPad Mini');
  const all = [host, p2, p3];

  // 1–3. open site, guest profile, create room
  await host.page.goto('/');
  await expect(host.page.getByRole('heading', { name: /وين الشلّة/ })).toBeVisible();
  await host.page.getByTestId('create-room').click();
  await guest(host.page, 'أبو سند');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  const code = host.page.url().split('/').pop()!;
  await expect(host.page.getByTestId('room-code')).toContainText(code);

  // 4–5. others join from other "devices" via the invitation link
  for (const [p, n] of [
    [p2, 'سلمى'],
    [p3, 'زيد'],
  ] as const) {
    await p.page.goto(`/r/${code}`);
    await guest(p.page, n);
    await gameTab(p.page);
    await expect(p.page.getByTestId('ready-btn')).toBeVisible();
  }
  await expect(host.page.getByTestId('players-list').locator('li')).toHaveCount(3);
  // regression: the room lobby must fit phone screens (no horizontal overflow / zoom-out)
  for (const p of [p2]) expect(await p.page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth) - screen.width)).toBeLessThanOrEqual(1);

  // chat
  await host.page.getByTestId('chat-input').fill('أهلاً يا شلة 👋');
  await host.page.getByTestId('chat-input').press('Enter');
  await p2.page.getByRole('tab', { name: /الشات/ }).click();
  await expect(p2.page.getByTestId('chat-list')).toContainText('أهلاً يا شلة 👋');
  await gameTab(p2.page);

  // lobby: one round, everyone ready, start
  await host.page.locator('input[type=range]').first().fill('1');
  for (const p of [p2, p3]) await p.page.getByTestId('ready-btn').click();
  await expect(host.page.getByTestId('start-game')).toBeEnabled();
  await host.page.getByTestId('start-game').click();

  // 6–7. private role cards
  for (const p of all) {
    await gameTab(p.page);
    await expect(p.page.getByTestId('role-card')).toBeVisible();
  }
  const roles = await Promise.all(all.map(async (p) => ((await p.page.getByTestId('role-card').innerText()).includes('إنت برا السالفة!') ? 'out' : 'in')));
  expect(roles.filter((r) => r === 'out')).toHaveLength(1);
  const insiders = all.filter((_, i) => roles[i] === 'in');
  const outsider = all[roles.indexOf('out')];
  const word = await insiders[0].page.getByTestId('secret-word').innerText();
  expect(await insiders[1].page.getByTestId('secret-word').innerText()).toBe(word);
  expect(await outsider.page.content()).not.toContain(word);

  // 8. gameplay: seen → turns → discuss → vote
  for (const p of all) await p.page.getByTestId('seen-btn').click();
  for (let i = 0; i < 3; i++) {
    const btn = await Promise.race(
      all.map((p) =>
        p.page
          .getByTestId('turn-done')
          .waitFor({ timeout: 8000 })
          .then(() => p.page.getByTestId('turn-done')),
      ),
    );
    await btn.click();
    await host.page.waitForTimeout(300);
  }
  for (const p of all) await p.page.getByTestId('ready-vote').click();

  // 9. secret votes: insiders vote the outsider, outsider votes an insider
  for (const p of insiders) await p.page.getByRole('button', { name: new RegExp((await outsider.page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user.displayName)) as string) }).first().click();
  await outsider.page.locator('[data-testid^="vote-"]:not([disabled])').first().click();

  // 10. reveal + final guess
  await expect(host.page.getByText('انكشف! 😱')).toBeVisible({ timeout: 15_000 });
  await expect(outsider.page.getByTestId('guess-option').first()).toBeVisible({ timeout: 15_000 });
  await outsider.page.getByTestId('guess-option').filter({ hasText: word }).click();
  await expect(host.page.getByText(`الكلمة كانت:`)).toBeVisible();
  await host.page.getByRole('button', { name: 'شوف النتيجة النهائية' }).click();
  for (const p of all) await expect(p.page.getByTestId('results')).toBeVisible();
  await expect(host.page.getByText(/\+\d+ XP/)).toBeVisible({ timeout: 10_000 });

  // 11. another round
  await host.page.getByTestId('rematch').click();
  await expect(p3.page.getByTestId('role-card')).toBeVisible();
  host.page.once('dialog', (d) => void d.accept());
  await host.page.getByRole('button', { name: 'وقّف اللعبة' }).click();
  await expect(host.page.getByTestId('start-game')).toBeVisible();

  // 12–13. disconnect and reconnect a player
  await p3.ctx.setOffline(true);
  await expect(host.page.getByTestId('players-list')).toContainText('منقطع', { timeout: 60_000 });
  await p3.ctx.setOffline(false);
  await expect(host.page.getByTestId('players-list')).not.toContainText('منقطع', { timeout: 60_000 });
  await gameTab(p3.page);
  await expect(p3.page.getByTestId('ready-btn')).toBeVisible();

  // 14. switch games: draw & guess with real canvas strokes
  await host.page.getByTestId('select-game-draw-guess').click();
  await expect(p2.page.getByText('ارسم وخمّن').first()).toBeVisible();
  await host.page.locator('input[type=range]').first().fill('1');
  for (const p of [p2, p3]) await p.page.getByTestId('ready-btn').click();
  await host.page.getByTestId('start-game').click();
  const drawer = await Promise.race(all.map((p) => p.page.getByTestId('draw-choice').first().waitFor({ timeout: 10_000 }).then(() => p)));
  await drawer.page.getByTestId('draw-choice').first().click();
  const canvas = drawer.page.getByTestId('draw-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await drawer.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await drawer.page.mouse.down();
  for (let i = 1; i <= 20; i++) await drawer.page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.3 + i * 0.02));
  await drawer.page.mouse.up();
  const title = await drawer.page.locator('h2', { hasText: 'ارسم:' }).innerText();
  const secret = title.replace('ارسم:', '').trim();
  const guessers = all.filter((p) => p !== drawer);
  // the strokes arrive on the other players' canvases
  await expect
    .poll(
      async () =>
        guessers[0].page.getByTestId('draw-canvas').evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
          return n;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(100);
  expect(await guessers[0].page.content()).not.toContain(`>${secret}<`);
  await gameTab(guessers[0].page);
  await guessers[0].page.getByTestId('draw-guess').fill(secret);
  await guessers[0].page.getByTestId('draw-guess').press('Enter');
  await expect(guessers[0].page.locator('h2', { hasText: 'عرفتها' })).toBeVisible();

  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});

test('error and recovery screens distinguish not-found from invalid input', async ({ browser }) => {
  const { page, ctx } = await player(browser, 'iPhone 13');
  await page.goto('/r/ZZZZZZ');
  await guest(page, 'تجربة');
  await expect(page.getByTestId('room-error')).toContainText('ما لقينا غرفة');
  await page.goto('/join');
  await page.getByTestId('join-code').fill('AB');
  await page.getByTestId('join-submit').click();
  await expect(page.getByRole('alert')).toContainText('6 أحرف');
  await page.goto('/this-does-not-exist');
  await expect(page.getByText('ضعنا بالخبصة!')).toBeVisible();
  await ctx.close();
});

test('pages render without horizontal overflow on mobile', async ({ browser }) => {
  const { page, ctx, errors } = await player(browser, 'iPhone SE');
  await page.goto('/create');
  await guest(page, 'موبايل');
  await expect(page.getByTestId('create-submit')).toBeVisible();
  for (const path of ['/', '/games', '/games/taboo', '/leaderboard', '/achievements', '/play', '/create', '/join', '/settings', '/friends']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('registered user flow and admin dashboard access control', async ({ browser }) => {
  const { page, ctx } = await player(browser, null);
  await page.goto('/register');
  await page.getByLabel('الإيميل').fill('admin@khabsa.test');
  await page.getByLabel('كلمة السر').fill('very-secret-1');
  await page.getByLabel('اسم المستخدم (إنجليزي)').fill('khabsa_admin');
  await page.getByLabel('الاسم الظاهر').fill('الإدارة');
  await page.getByRole('button', { name: 'سجّل' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /لوحة الإدارة/ })).toBeVisible();
  await expect(page.getByText('المستخدمين').first()).toBeVisible();
  await page.goto('/admin/content');
  await expect(page.getByText(/\d+ عنصر/)).toBeVisible();
  await ctx.close();

  const other = await player(browser, null);
  await other.page.goto('/');
  await other.page.goto('/admin');
  await expect(other.page.getByText('هالصفحة للإدارة بس')).toBeVisible();
  await other.ctx.close();
});

test('room lobby fits a phone screen when the host is on a phone (regression: zoomed-out lobby)', async ({ browser }) => {
  const { page, ctx } = await player(browser, 'iPhone 13');
  await page.goto('/create');
  await guest(page, 'مضيف موبايل');
  await page.getByTestId('create-submit').click();
  await expect(page.getByTestId('select-game-taboo')).toBeVisible();
  // the layout viewport must not be wider than the phone (mobile browsers zoom out when it is)
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth) - screen.width);
  expect(overflow).toBeLessThanOrEqual(1);
  await ctx.close();
});

test('sound and visual effects: a correct guess plays sounds, shows +points and confetti; mute stops sounds', async ({ browser }) => {
  const host = await player(browser, null);
  const g = await player(browser, null);
  // count synthesised sounds (oscillators started) without needing speakers
  for (const p of [host, g])
    await p.page.addInitScript(() => {
      (window as unknown as { __sounds: number }).__sounds = 0;
      const orig = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        (window as unknown as { __sounds: number }).__sounds++;
        return orig.call(this);
      };
    });
  const sounds = (p: Page) => p.evaluate(() => (window as unknown as { __sounds: number }).__sounds);
  await host.page.goto('/create?game=draw-guess');
  await guest(host.page, 'رسام');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/\/r\//);
  await g.page.goto(host.page.url());
  await guest(g.page, 'مخمّن');
  await g.page.getByTestId('ready-btn').click();
  await host.page.getByTestId('start-game').click();
  await expect.poll(() => sounds(g.page)).toBeGreaterThan(0); // start jingle
  const drawer = await Promise.race([host, g].map((p) => p.page.getByTestId('draw-choice').first().waitFor({ timeout: 20_000 }).then(() => p)));
  const guesser = drawer === host ? g : host;
  await drawer.page.getByTestId('draw-choice').first().click();
  const secret = (await drawer.page.locator('h2', { hasText: 'ارسم:' }).innerText()).replace('ارسم:', '').trim();
  await guesser.page.getByTestId('draw-guess').fill(secret);
  await guesser.page.getByTestId('draw-guess').press('Enter');
  await expect(guesser.page.getByTestId('confetti').first()).toBeAttached({ timeout: 5000 });
  await expect(guesser.page.getByTestId('fx-float').first()).toContainText('+');

  // mute: no new sounds for the guesser
  await guesser.page.getByTestId('sound-toggle').click();
  await expect(guesser.page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await guesser.page.waitForTimeout(300);
  const before = await sounds(guesser.page);
  await host.page.getByTestId('host-skip').click(); // next phase would normally make a sound
  await guesser.page.waitForTimeout(1500);
  expect(await sounds(guesser.page)).toBe(before);
  await guesser.page.getByTestId('sound-toggle').click();
  await expect(guesser.page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  for (const p of [host, g]) expect(p.errors).toEqual([]);
  for (const p of [host, g]) await p.ctx.close();
});

test('مين برا الرسمة with real photos: private photos, then both photos with their credits', async ({ browser }) => {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const all = await Promise.all(names.map(() => player(browser, null)));
  const [host] = all;
  await host.page.goto('/');
  await host.page.getByTestId('create-room').click();
  await guest(host.page, names[0]);
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  const code = host.page.url().split('/').pop()!;
  for (const [i, p] of all.entries()) {
    if (!i) continue;
    await p.page.goto(`/r/${code}`);
    await guest(p.page, names[i]);
    await expect(p.page.getByTestId('ready-btn')).toBeVisible();
  }
  await host.page.getByTestId('select-game-outsider-picture').click();
  // Jordan only has real photos (Petra, Wadi Rum, …)
  await host.page.locator('select:has(option[value="jordan"])').selectOption('jordan');
  await host.page.locator('input[type=range]').first().fill('1');
  for (const p of all.slice(1)) await p.page.getByTestId('ready-btn').click();
  await expect(host.page.getByTestId('start-game')).toBeEnabled();
  await host.page.getByTestId('start-game').click();

  // each player gets one private photo; the odd one out is the outsider's
  const srcs: string[] = [];
  for (const p of all) {
    const img = p.page.getByTestId('role-card').locator('img').first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(800);
    srcs.push((await img.getAttribute('src')) ?? '');
    // nothing on screen credits (and so names) the photos during play
    await expect(p.page.getByTestId('photo-credit')).toHaveCount(0);
  }
  // links are signed per viewer, so compare the photos themselves
  const digests = await Promise.all(
    all.map((p, i) =>
      p.page.evaluate(async (u) => {
        const buf = await (await fetch(u)).arrayBuffer();
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).join(',');
      }, srcs[i]),
    ),
  );
  expect(new Set(digests).size).toBe(2);
  const outIdx = digests.findIndex((d) => digests.filter((x) => x === d).length === 1);
  expect(outIdx).toBeGreaterThanOrEqual(0);
  const outsider = all[outIdx];
  const insiders = all.filter((_, i) => i !== outIdx);
  // a player cannot open someone else's photo link
  const theirs = await insiders[0].page.evaluate(async (u) => (await fetch(u)).status, srcs[outIdx]);
  expect(theirs).toBe(403);
  const mine = await outsider.page.evaluate(async (u) => {
    const r = await fetch(u);
    return `${r.status} ${r.headers.get('content-type')}`;
  }, srcs[outIdx]);
  expect(mine).toBe('200 image/webp');

  for (const p of all) await p.page.getByTestId('seen-btn').click();
  for (let i = 0; i < 3; i++) {
    const btn = await Promise.race(all.map((p) => p.page.getByTestId('turn-done').waitFor({ timeout: 8000 }).then(() => p.page.getByTestId('turn-done'))));
    await btn.click();
    await host.page.waitForTimeout(300);
  }
  for (const p of all) await p.page.getByTestId('ready-vote').click();
  for (const p of insiders) await p.page.getByRole('button', { name: new RegExp(names[outIdx]) }).first().click();
  await outsider.page.locator('[data-testid^="vote-"]:not([disabled])').first().click();
  await expect(outsider.page.getByTestId('guess-option').first()).toBeVisible({ timeout: 15_000 });
  await outsider.page.getByTestId('guess-option').first().click();

  // round end: both photos for everyone, each with author, licence and a Commons link
  for (const p of all) {
    const credits = p.page.getByTestId('photo-credit');
    await expect(credits).toHaveCount(2, { timeout: 15_000 });
    for (const c of await credits.all()) {
      await expect(c).toContainText(/CC|Public domain/);
      expect(await c.locator('a').first().getAttribute('href')).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  }
  await host.page.screenshot({ path: 'test-results/photo-round-end.png', fullPage: true });
  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});
