import { expect, test, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { playDrawRound } from './drawRound.ts';
import { PHOTO_PAIRS } from '../src/server/db/seed/photoPairs.ts';

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
  // background music would also create oscillators: switch it off to count effects only
  for (const p of [host, g]) {
    await p.page.getByTestId('music-toggle').click();
    await expect(p.page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');
  }
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

for (const mode of ['normal', 'hard'] as const)
test(`مين برا الصورة (${mode}): real photos are private, then both photos are revealed with their credits`, async ({ browser }) => {
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
  // wait for THIS game's lobby (the previous game's lobby has a "hard" select too)
  await expect(host.page.getByRole('heading', { name: 'مين برا الصورة؟' })).toBeVisible();
  // photos only; the hard mode uses look-alikes (lime/lemon, wolf/husky...)
  await host.page.locator('select:has(option[value="easy"][value="easy"]):has(option[value="normal"])').selectOption(mode);
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
  // the two pictures are labelled with two different things
  const labels = await host.page.locator('p', { hasText: /^صورة (الأغلبية|البرّا): / }).allInnerTexts();
  expect(labels).toHaveLength(2);
  const [la, lb] = labels.map((l) => l.split(': ')[1]);
  expect(la).not.toBe(lb);
  // …and it is a pair of the chosen kind: normal = related things, hard = look-alikes
  const def = PHOTO_PAIRS.find((x) => x[1] === la && x[3] === lb);
  expect(def, `unknown pair ${la} / ${lb}`).toBeTruthy();
  expect(def![5] ?? 'normal').toBe(mode);
  await host.page.screenshot({ path: `test-results/photo-round-end-${mode}.png`, fullPage: true });
  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});

test('background music plays and can be switched off; every press makes a sound unless muted', async ({ browser }) => {
  const p = await player(browser, null);
  await p.page.addInitScript(() => {
    const w = window as unknown as { __osc: number };
    w.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__osc++;
      return orig.call(this);
    };
  });
  const osc = () => p.page.evaluate(() => (window as unknown as { __osc: number }).__osc);
  await p.page.goto('/create');
  await guest(p.page, 'دي جي');
  await p.page.getByTestId('create-submit').click();
  await expect(p.page).toHaveURL(/\/r\//);
  await expect(p.page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'true');

  // music: notes keep coming with nobody touching anything
  await p.page.mouse.click(5, 300); // a gesture on empty space (browsers need one before audio)
  const t0 = await osc();
  await p.page.waitForTimeout(2500);
  expect((await osc()) - t0).toBeGreaterThan(8);

  // music off: silence (after a short fade)
  await p.page.getByTestId('music-toggle').click();
  await expect(p.page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');
  await p.page.waitForTimeout(600);
  const t1 = await osc();
  await p.page.waitForTimeout(2000);
  expect(await osc()).toBe(t1);

  // a press makes a sound
  await p.page.getByTestId('invite-btn').click();
  await expect.poll(osc).toBeGreaterThan(t1);
  await p.page.keyboard.press('Escape');

  // sound off: presses are silent too
  await p.page.getByTestId('sound-toggle').click();
  await expect(p.page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await p.page.waitForTimeout(300);
  const t2 = await osc();
  await p.page.getByTestId('invite-btn').click();
  await p.page.keyboard.press('Escape');
  await p.page.waitForTimeout(800);
  expect(await osc()).toBe(t2);

  // the choices are remembered
  await p.page.reload();
  await expect(p.page.getByTestId('music-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(p.page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(p.errors).toEqual([]);
  await p.ctx.close();
});

test('مين برا الرسمة: one shared canvas, one line each in a random order, vote and guess', async ({ browser }) => {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const all = await Promise.all([player(browser, null), player(browser, 'Pixel 7'), player(browser, null)]);
  await all[0].page.goto('/create?game=outsider-draw');
  await guest(all[0].page, names[0]);
  await all[0].page.getByTestId('create-submit').click();
  await expect(all[0].page).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  const code = all[0].page.url().split('/').pop()!;
  for (const [i, p] of all.entries()) {
    if (!i) continue;
    await p.page.goto(`/r/${code}`);
    await guest(p.page, names[i]);
    await gameTab(p.page);
    await p.page.getByTestId('ready-btn').click();
  }
  await expect(all[0].page.getByText('مين برا الرسمة؟').first()).toBeVisible();
  await all[0].page.locator('input[type=range]').first().fill('1');
  await all[0].page.getByTestId('start-game').click();
  for (const p of all) await gameTab(p.page);
  await playDrawRound(all.map((p, i) => ({ page: p.page, name: names[i] })));
  await all[0].page.screenshot({ path: 'test-results/outsider-draw-round-end.png', fullPage: true });
  await all[0].page.getByRole('button', { name: 'شوف النتيجة النهائية' }).click();
  for (const p of all) await expect(p.page.getByTestId('results')).toBeVisible();
  for (const p of all) expect(p.errors, 'no uncaught page errors').toEqual([]);
  for (const p of all) await p.ctx.close();
});

test('مين برا السالفة: movie words show their TMDB poster to the players who know the word, never to the outsider', async ({ browser }) => {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const all = await Promise.all(names.map(() => player(browser, null)));
  await all[0].page.goto('/create?game=outsider-word');
  await guest(all[0].page, names[0]);
  await all[0].page.getByTestId('create-submit').click();
  await expect(all[0].page).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  const code = all[0].page.url().split('/').pop()!;
  for (const [i, p] of all.entries()) {
    if (!i) continue;
    await p.page.goto(`/r/${code}`);
    await guest(p.page, names[i]);
    await p.page.getByTestId('ready-btn').click();
  }
  await all[0].page.getByTestId('cat-movies').click();
  await all[0].page.locator('input[type=range]').first().fill('1');
  await all[0].page.getByTestId('start-game').click();
  for (const p of all) await expect(p.page.getByTestId('role-card')).toBeVisible();
  const roles = await Promise.all(all.map(async (p) => ((await p.page.getByTestId('role-card').innerText()).includes('إنت برا السالفة!') ? 'out' : 'in')));
  const outsider = all[roles.indexOf('out')];
  for (const [i, p] of all.entries()) {
    const img = p.page.getByTestId('role-card').locator('img');
    if (roles[i] === 'out') {
      await expect(img).toHaveCount(0);
      continue;
    }
    await expect(img.first()).toBeVisible();
    await expect.poll(() => img.first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(100);
    // the picture is shown IN FULL: same proportions as the file (no cropping), and the secret word sits above it
    const fit = await img.first().evaluate((el: HTMLImageElement) => ({ natural: el.naturalWidth / el.naturalHeight, shown: el.clientWidth / el.clientHeight, objectFit: getComputedStyle(el).objectFit }));
    expect(Math.abs(fit.shown - fit.natural) / fit.natural).toBeLessThan(0.03);
    expect(fit.objectFit).toBe('contain');
    const word = await p.page.getByTestId('secret-word').boundingBox();
    const pic = await img.first().boundingBox();
    expect(word!.y).toBeLessThan(pic!.y);
    const src = (await img.first().getAttribute('src'))!;
    expect(src).toMatch(/^\/api\/game-image\//);
    // the signed link only works for its owner, and serves the TMDB poster (a JPEG)
    expect(await p.page.evaluate(async (u) => { const r = await fetch(u); return `${r.status} ${r.headers.get('content-type')}`; }, src)).toBe('200 image/jpeg');
    expect(await outsider.page.evaluate(async (u) => (await fetch(u)).status, src)).toBe(403);
  }
  for (const p of all) expect(p.errors).toEqual([]);
  // TMDB's required attribution is on the site (footer) as soon as posters are in use
  await all[0].page.goto('/');
  await expect(all[0].page.getByText('This product uses the TMDB API').first()).toBeVisible();
  for (const p of all) await p.ctx.close();
});
