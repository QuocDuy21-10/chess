import { expect, expectWebGL, moveCount, test, typeMove } from './fixtures.ts';

test('two players on one device play to checkmate, and Undo reopens the game', async ({ page }) => {
  await page.goto('/');
  await expectWebGL(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (const move of ['f3', 'e5', 'g4', 'Qh4']) await typeMove(page, move);
  const over = page.getByRole('dialog', { name: 'Game over' });
  await expect(over).toContainText('Checkmate — Teal wins');
  await expect.poll(() => moveCount(page)).toBe(4);
  await over.getByRole('button', { name: 'View board' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(over).toBeHidden();
  await expect.poll(() => moveCount(page)).toBe(3);
});
