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
