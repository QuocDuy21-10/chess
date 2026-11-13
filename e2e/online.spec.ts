import { expect, test, typeMove, watch } from './fixtures.ts';

test('two browsers play online through the real server, and the game reaches the profile', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play online' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.waitForURL(/\?room=/);

  const bobContext = await browser.newContext({ storageState: '.auth/bob.json', reducedMotion: 'reduce' });
  const bob = await bobContext.newPage();
  const bobProblems = watch(bob);
  await bob.goto(page.url()); // the invite link
  await expect(page.getByText('E2E Bob')).toBeVisible();
  await expect(bob.getByText('E2E Ann')).toBeVisible();

  await typeMove(page, 'e4');
  await expect(bob.getByRole('list', { name: 'Moves' }).first()).toContainText('e4');
  await typeMove(bob, 'e5');
  await expect(page.getByRole('list', { name: 'Moves' }).first()).toContainText('e5');

  await bob.getByRole('button', { name: 'Menu' }).click();
  await bob.getByRole('button', { name: 'Resign' }).click();
  await bob.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('dialog', { name: 'Game over' })).toContainText('Resignation — Amber wins');

  // force: on a CI runner the software-rendered scene starves animation frames, so the stability check never passes
  await page.getByRole('button', { name: 'Main menu' }).click({ force: true });
  await page.getByRole('button', { name: 'Play online' }).click({ force: true });
  await page.getByRole('button', { name: 'Profile' }).click({ force: true });
  await expect(page.getByText('Win · E2E Bob').first()).toBeVisible(); // the opponent in the match history
  expect(bobProblems).toEqual([]);
  await bobContext.close();
});
