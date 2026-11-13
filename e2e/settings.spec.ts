import { expect, test } from './fixtures.ts';

test('Vietnamese, once chosen, stays after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Tiếng Việt' }).click();
  await expect(page.getByRole('dialog', { name: 'Cài đặt' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cài đặt' })).toBeVisible();
});
