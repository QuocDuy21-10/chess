import { expect, expectWebGL, test } from './fixtures.ts';

test('Vietnamese, once chosen, stays after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Tiếng Việt' }).click();
  await expect(page.getByRole('dialog', { name: 'Cài đặt' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cài đặt' })).toBeVisible();
});

test('a player who muted the game never downloads the music', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('chess.settings', JSON.stringify({ state: { muted: true }, version: 0 })),
  );
  const music: string[] = [];
  page.on('request', (request) => void (request.url().endsWith('/audio/music.mp3') && music.push(request.url())));
  await page.goto('/');
  await expectWebGL(page); // the settings have been read back from storage by now
  await page.getByRole('button', { name: 'Settings' }).click(); // the first gesture: audio unlocks here
  await expect(page.getByRole('button', { name: 'Mute all sound' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  expect(music).toEqual([]);
});
