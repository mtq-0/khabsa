import { expect, test, type Browser } from '@playwright/test';

async function signUp(browser: Browser, email: string, username: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto('/register');
  await page.getByLabel('الإيميل').fill(email);
  await page.getByLabel('كلمة السر').fill('very-secret-1');
  await page.getByLabel('اسم المستخدم (إنجليزي)').fill(username);
  await page.getByLabel('الاسم الظاهر').fill(name);
  await page.getByRole('button', { name: 'سجّل' }).click();
  await expect(page).toHaveURL(/\/$/);
  return { ctx, page };
}


test('add friends by ID; the invite list shows friends only, not everybody you played with', async ({ browser }) => {
  const host = await signUp(browser, 'fh@example.com', 'fr_host', 'المضيف');
  const pal = await signUp(browser, 'fp@example.com', 'fr_pal', 'الصاحب');
  const rando = await signUp(browser, 'fr@example.com', 'fr_rando', 'الغريب');

  // the room: all three are in it (the host is not friends with anybody yet)
  await host.page.goto('/create');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page).toHaveURL(/\/r\//);
  const roomUrl = host.page.url();
  await rando.page.goto(roomUrl);
  await expect(rando.page.getByTestId('players-list')).toBeVisible();
  await expect(host.page.getByTestId('players-list').locator('li')).toHaveCount(2);

  // nobody is a friend yet: the invite window offers nobody, even though somebody plays in the room
  await host.page.getByTestId('invite-btn').first().click();
  await expect(host.page.getByTestId('no-friends-to-invite')).toBeVisible();
  await expect(host.page.getByTestId('invite-list')).toHaveCount(0);
  await host.page.keyboard.press('Escape');

  // the host adds the pal by ID (with @ and capitals, as people type it)
  await host.page.goto('/friends');
  await expect(host.page.getByTestId('my-id')).toContainText('@fr_host');
  await host.page.getByTestId('friend-id-input').fill(' @FR_Pal ');
  await host.page.getByTestId('friend-id-add').click();
  await expect(host.page.getByText('انبعت طلب الصداقة لـ الصاحب')).toBeVisible();
  // a wrong ID says so
  await host.page.getByTestId('friend-id-input').fill('nobody_here');
  await host.page.getByTestId('friend-id-add').click();
  await expect(host.page.getByText('ما لقينا لاعب بهالـID')).toBeVisible();

  // the pal sees the request and accepts
  await pal.page.goto('/friends');
  await pal.page.getByRole('tab', { name: /الطلبات/ }).click();
  await expect(pal.page.getByText('المضيف').first()).toBeVisible();
  await pal.page.getByRole('button', { name: 'اقبل' }).click();
  await expect(pal.page.getByText('صرتوا أصحاب!')).toBeVisible();

  // back in the room: the friend (who is not in the room yet) is offered, the stranger is not
  await host.page.goto(roomUrl);
  await expect(host.page.getByTestId('players-list')).toBeVisible();
  await host.page.getByTestId('invite-btn').first().click();
  await expect(host.page.getByTestId('invite-row-fr_pal')).toBeVisible();
  await expect(host.page.getByTestId('invite-row-fr_rando')).toHaveCount(0);
  await expect(host.page.getByTestId('invite-list').locator('li')).toHaveCount(1);
  await host.page.getByTestId('invite-row-fr_pal').getByRole('button', { name: 'اعزم' }).click();
  await expect(host.page.getByTestId('invite-row-fr_pal').getByRole('button', { name: 'انبعتت' })).toBeVisible();

  // the pal receives the invitation, the stranger never does
  await pal.page.goto('/friends');
  await pal.page.getByRole('tab', { name: /الدعوات/ }).click();
  await expect(pal.page.getByText('عزمك على')).toBeVisible();
  await rando.page.goto('/friends');
  await rando.page.getByRole('tab', { name: /الدعوات/ }).click();
  await expect(rando.page.getByText('ما في دعوات')).toBeVisible();

  for (const p of [host, pal, rando]) await p.ctx.close();
});
