/** Shared browser flow: peer-to-peer voice with three players (GitHub Pages edition AND the server edition without LiveKit). */
import { expect, type Browser, type Page } from '@playwright/test';

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

/** The (visible) "in voice (n)" label: the room renders one voice panel per layout, only one is shown. */
const inVoice = (page: Page, n: number) => page.getByText(`بالصوت (${n})`).locator('visible=true').first();

/** Remote voice elements with a live track. */
const live = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLMediaElement>('audio[data-voice]')].filter((el) => (el.srcObject as MediaStream | null)?.getAudioTracks()[0]?.readyState === 'live').length);

/**
 * Real sound check: the loudest sample we receive from every other player over a few seconds
 * (the fake microphone plays a tone). A connected-but-silent call shows 0 here.
 */
const heard = (page: Page) =>
  page.evaluate(async () => {
    const els = [...document.querySelectorAll<HTMLMediaElement>('audio[data-voice]')];
    const ac = new AudioContext();
    await ac.resume();
    const peaks: number[] = [];
    await Promise.all(
      els.map(async (el) => {
        const a = ac.createAnalyser();
        a.fftSize = 512;
        ac.createMediaStreamSource(el.srcObject as MediaStream).connect(a);
        const buf = new Uint8Array(512);
        let peak = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 3500) {
          a.getByteTimeDomainData(buf);
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          await new Promise((r) => setTimeout(r, 40));
        }
        peaks.push(peak);
      }),
    );
    await ac.close();
    return peaks;
  });

export async function checkP2pVoice(browser: Browser, opts: { createUrl: string; hostOnline?: (host: Page) => Promise<void>; roomUrl: (host: Page) => string }) {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const P: Page[] = [];
  for (const _ of names) P.push(await (await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar', permissions: ['microphone'] })).newPage());
  const [a, b, c] = P;
  const errors: string[] = [];
  for (const p of P) p.on('pageerror', (e) => errors.push(String(e)));

  await a.goto(opts.createUrl);
  await guest(a, names[0]);
  await a.getByTestId('create-submit').click();
  await expect(a).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  await opts.hostOnline?.(a);
  for (const [i, p] of P.entries()) {
    if (!i) continue;
    await p.goto(opts.roomUrl(a));
    await guest(p, names[i]);
  }
  await expect(a.getByTestId('players-list').locator('li')).toHaveCount(3, { timeout: 60_000 });

  // voice is available (no more "not enabled" message)
  await expect(a.getByText('الصوت مش مفعّل')).toHaveCount(0);

  // A is alone in voice for a while; B joins later: they must connect within a few seconds (not after a long timeout)
  await a.getByTestId('voice-join').locator('visible=true').first().click();
  await expect(inVoice(a, 1)).toBeVisible({ timeout: 30_000 });
  await a.waitForTimeout(5000);
  await b.getByTestId('voice-join').locator('visible=true').first().click();
  await expect(inVoice(a, 2)).toBeVisible({ timeout: 8_000 });
  await expect(inVoice(b, 2)).toBeVisible({ timeout: 8_000 });

  // C joins last, at the same moment as nothing else: everybody ends up with two live tracks
  await c.getByTestId('voice-join').locator('visible=true').first().click();
  for (const p of P) await expect(inVoice(p, 3)).toBeVisible({ timeout: 15_000 });
  for (const p of P) await expect.poll(() => live(p), { timeout: 15_000 }).toBe(2);
  // and all six directions really carry sound
  for (const p of P) {
    const peaks = await heard(p);
    expect(peaks).toHaveLength(2);
    for (const pk of peaks) expect(pk).toBeGreaterThan(20);
  }

  // the green ring: everybody who talks (the fake microphone plays a tone) gets a green circle around their picture
  const ringOf = (page: Page, who: string) => page.getByTestId('players-list').locator('li', { hasText: who }).locator('[role="img"]').first();
  for (const who of names) await expect(ringOf(a, who)).toHaveAttribute('data-speaking', '1', { timeout: 10_000 });
  // green while lit (read in one go: the fake microphone's tone pulses, so the ring comes and goes)
  await expect.poll(() => ringOf(a, names[1]).evaluate((el) => el.getAttribute('data-speaking') === '1' && /rgba?\(34, 197, 94/.test(getComputedStyle(el).boxShadow)), { timeout: 10_000 }).toBe(true);
  // and it follows the volume: a muted player's ring goes out on everybody's screen, and comes back when unmuted
  await b.getByRole('button', { name: 'مايك' }).locator('visible=true').first().click();
  await expect(ringOf(a, names[1])).not.toHaveAttribute('data-speaking', '1', { timeout: 10_000 });
  await expect(ringOf(c, names[1])).not.toHaveAttribute('data-speaking', '1', { timeout: 10_000 });
  await expect(ringOf(a, names[2])).toHaveAttribute('data-speaking', '1'); // the others keep their ring
  await b.getByRole('button', { name: 'مسكّر' }).locator('visible=true').first().click();
  await expect(ringOf(a, names[1])).toHaveAttribute('data-speaking', '1', { timeout: 10_000 });

  // switching tabs on a phone-sized screen must not drop the voice
  // (the three players above use a desktop layout; check the narrow layout with the same page)
  await b.setViewportSize({ width: 390, height: 844 });
  await b.getByRole('tab', { name: /الشات/ }).click();
  await b.getByRole('tab', { name: /اللعبة/ }).click();
  await expect(inVoice(b, 3)).toBeVisible();
  await b.setViewportSize({ width: 1366, height: 900 });

  // B leaves: the others drop to 2 and B's audio is gone
  await b.getByTestId('voice-leave').locator('visible=true').first().click();
  await expect(b.getByTestId('voice-join').locator('visible=true').first()).toBeVisible();
  await expect(inVoice(a, 2)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => live(a), { timeout: 15_000 }).toBe(1);

  // B reloads the page and joins again: connected quickly and sound flows both ways
  await b.reload();
  await expect(b.getByTestId('voice-join').locator('visible=true').first()).toBeVisible({ timeout: 45_000 });
  await b.getByTestId('voice-join').locator('visible=true').first().click();
  for (const p of P) await expect(inVoice(p, 3)).toBeVisible({ timeout: 15_000 });
  for (const p of [a, b]) for (const pk of await heard(p)) expect(pk).toBeGreaterThan(20);
  expect(errors).toEqual([]);
  for (const p of P) await p.context().close();
}

/** loudest sample on the relay output (the audio that came through the server) over ~3 s */
const heardRelay = (page: Page) =>
  page.evaluate(async () => {
    const el = document.querySelector<HTMLMediaElement>('audio[data-voice-relay]');
    if (!el?.srcObject) return -1;
    const ac = new AudioContext();
    await ac.resume();
    const a = ac.createAnalyser();
    a.fftSize = 512;
    ac.createMediaStreamSource(el.srcObject as MediaStream).connect(a);
    const buf = new Uint8Array(512);
    let peak = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      a.getByteTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      await new Promise((r) => setTimeout(r, 40));
    }
    await ac.close();
    return peak;
  });

/**
 * A strict network: player C's browser may not make ANY direct connection (relay-only ICE policy
 * and no TURN), exactly like many phones on mobile data. A and B still talk directly; C must hear
 * them and be heard through the room link (the relay), and the panel says so.
 */
export async function checkRelayVoice(browser: Browser, opts: { createUrl: string; hostOnline?: (host: Page) => Promise<void>; roomUrl: (host: Page) => string }) {
  const names = ['أبو سند', 'سلمى', 'زيد'];
  const P: Page[] = [];
  for (const [i] of names.entries()) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar', permissions: ['microphone'] });
    if (i === 2) await ctx.addInitScript(() => localStorage.setItem('khabsa:voice:test-block-direct', '1'));
    P.push(await ctx.newPage());
  }
  const [a, b, c] = P;
  const errors: string[] = [];
  for (const p of P) p.on('pageerror', (e) => errors.push(String(e)));
  await a.goto(opts.createUrl);
  await guest(a, names[0]);
  await a.getByTestId('create-submit').click();
  await expect(a).toHaveURL(/\/r\/[A-Z2-9]{6}$/);
  await opts.hostOnline?.(a);
  for (const [i, p] of P.entries()) {
    if (!i) continue;
    await p.goto(opts.roomUrl(a));
    await guest(p, names[i]);
  }
  await expect(a.getByTestId('players-list').locator('li')).toHaveCount(3, { timeout: 60_000 });
  for (const p of P) await p.getByTestId('voice-join').locator('visible=true').first().click();
  for (const p of P) await expect(inVoice(p, 3)).toBeVisible({ timeout: 20_000 });

  // A and B connect directly; C cannot, and switches to the relay within the timeout
  await expect(c.getByTestId('voice-relay').locator('visible=true').first()).toBeVisible({ timeout: 25_000 });
  await expect(c.getByTestId('voice-relay').locator('visible=true').first()).toContainText(names[0]);
  await expect(c.getByTestId('voice-relay').locator('visible=true').first()).toContainText(names[1]);
  await expect(a.getByTestId('voice-relay').locator('visible=true').first()).toContainText(names[2], { timeout: 25_000 });

  // everybody hears everybody: the green ring of every OTHER player lights up on each screen
  // (that ring is measured on the audio we receive, so it proves the sound arrived)
  const ringOf = (page: Page, who: string) => page.getByTestId('players-list').locator('li', { hasText: who }).locator('[role="img"]').first();
  for (const [i, p] of P.entries()) for (const [j, who] of names.entries()) if (i !== j) await expect(ringOf(p, who), `${names[i]} hears ${who}`).toHaveAttribute('data-speaking', '1', { timeout: 15_000 });
  // and the relayed sound is real audio, not silence
  expect(await heardRelay(c)).toBeGreaterThan(20);
  expect(await heardRelay(a)).toBeGreaterThan(20);
  // A and B still hear each other directly with full sound (A's call with C is negotiated but carries nothing)
  expect(Math.max(...(await heard(a)))).toBeGreaterThan(20);

  // muting C stops the relay too: C's ring goes out on A's and B's screens, and comes back
  await c.getByRole('button', { name: 'مايك' }).locator('visible=true').first().click();
  await expect(ringOf(a, names[2])).not.toHaveAttribute('data-speaking', '1', { timeout: 10_000 });
  await expect(ringOf(b, names[2])).not.toHaveAttribute('data-speaking', '1', { timeout: 10_000 });
  await c.getByRole('button', { name: 'مسكّر' }).locator('visible=true').first().click();
  await expect(ringOf(a, names[2])).toHaveAttribute('data-speaking', '1', { timeout: 10_000 });

  // C leaves voice: the others drop to two; C joins again and is heard again
  await c.getByTestId('voice-leave').locator('visible=true').first().click();
  await expect(inVoice(a, 2)).toBeVisible({ timeout: 15_000 });
  await c.getByTestId('voice-join').locator('visible=true').first().click();
  await expect(inVoice(a, 3)).toBeVisible({ timeout: 15_000 });
  await expect(ringOf(a, names[2])).toHaveAttribute('data-speaking', '1', { timeout: 25_000 });
  expect(errors).toEqual([]);
  for (const p of P) await p.context().close();
}
