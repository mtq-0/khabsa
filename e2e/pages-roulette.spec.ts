import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page, name: string) {
  await page.getByLabel('شو اسمك بالخبصة؟').fill(name);
  await page.getByRole('button', { name: 'يلا نلعب!' }).click();
}

test('reveal roulette (Pages edition): the spotlight visits several players, slows down and stops on the outsider', async ({ browser }) => {
  const names = ['أبو سند', 'سلمى', 'زيد', 'ليان'];
  const P: { page: Page; name: string }[] = [];
  for (const name of names) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' });
    P.push({ page: await ctx.newPage(), name });
  }
  const host = P[0].page;
  await host.goto('#/create');
  await guest(host, names[0]);
  await host.getByTestId('create-submit').click();
  await expect(host.getByTestId('host-badge')).toHaveAttribute('data-state', 'online', { timeout: 60_000 });
  const code = host.url().split('/').pop()!;
  for (const p of P.slice(1)) {
    await p.page.goto(`#/r/${code}`);
    await guest(p.page, p.name);
    const tab = p.page.getByRole('tab', { name: /اللعبة/ });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await p.page.getByTestId('ready-btn').click({ timeout: 45_000 });
  }
  await host.getByTestId('start-game').click();
  for (const p of P) await p.page.getByTestId('role-card').waitFor({ timeout: 20_000 });
  const roles = await Promise.all(P.map(async (p) => ((await p.page.getByTestId('role-card').innerText()).includes('إنت برا السالفة') ? 'out' : 'in')));
  const outsider = P[roles.indexOf('out')];
  for (const p of P) await p.page.getByTestId('seen-btn').click();

  // skip through the questions and the discussion until the vote opens
  for (let i = 0; i < 60 && !(await host.getByText(/صوّت سراً/).isVisible().catch(() => false)); i++) {
    const skip = host.getByTestId('host-skip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await host.waitForTimeout(400);
  }
  await expect(host.getByText(/صوّت سراً/)).toBeVisible({ timeout: 30_000 });
  for (const p of P) {
    const target = p.page.locator('[data-testid^="vote-"]:not([disabled])').first();
    await target.click();
  }

  // the roulette appears, starts moving (several different players get the spotlight)
  const roulette = host.getByTestId('roulette');
  await expect(roulette).toHaveAttribute('data-state', 'spinning', { timeout: 20_000 });
  const visits: string[] = [];
  const stamps: number[] = [];
  const t0 = Date.now();
  while ((await roulette.getAttribute('data-state')) === 'spinning' && Date.now() - t0 < 9000) {
    const id = await roulette.locator('[data-active="1"]').getAttribute('data-testid', { timeout: 200 }).catch(() => null);
    if (id && id !== visits.at(-1)) {
      visits.push(id);
      stamps.push(Date.now() - t0);
    }
    await host.waitForTimeout(10);
  }
  await expect(roulette).toHaveAttribute('data-state', 'landed', { timeout: 10_000 });
  expect(new Set(visits).size).toBeGreaterThanOrEqual(3);
  expect(visits.length).toBeGreaterThanOrEqual(10);
  // exactly one winner card, and it belongs to the outsider (its phone shows the outsider card)
  const winners = roulette.locator('[data-winner="1"]');
  await expect(winners).toHaveCount(1);
  const winnerName = (await winners.innerText()).split('\n')[0].trim();
  expect(winnerName).toBe(outsider.name);
  // the gaps between visits grow (fast first, slow at the end)
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  const half = Math.floor(gaps.length / 2);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log('visits', visits.length, 'first-half avg gap', Math.round(avg(gaps.slice(0, half))), 'second-half avg gap', Math.round(avg(gaps.slice(half))));
  expect(avg(gaps.slice(half))).toBeGreaterThan(avg(gaps.slice(0, half)));
  for (const p of P) await p.page.context().close();
});
