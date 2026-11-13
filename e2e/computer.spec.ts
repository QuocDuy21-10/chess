import { expect, moveCount, test, typeMove } from './fixtures.ts';

test('the computer answers a move: Stockfish runs in this browser', async ({ page }) => {
  await page.goto('/');
  const prefetched = page.waitForRequest((request) => request.url().endsWith('/engine/stockfish-19-lite-single.wasm'));
  await page.getByRole('button', { name: 'Play the computer' }).click();
  await prefetched; // before Start: opening the panel warms the cache
  await page.getByRole('button', { name: 'Beginner' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await typeMove(page, 'e4');
  await expect.poll(() => moveCount(page), { timeout: 15_000 }).toBe(2);
});
