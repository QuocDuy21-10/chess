import { expect, test } from 'vitest';
import { tickTweens, tween } from './tween';

test('tween reports progress and resolves after the last tick', async () => {
  const seen: number[] = [];
  let done = false;
  const promise = tween(100, (t) => seen.push(t)).then(() => (done = true));

  tickTweens(50);
  await Promise.resolve();
  expect(seen).toEqual([0.5]);
  expect(done).toBe(false);

  tickTweens(80); // overshoots: clamps to 1
  await promise;
  expect(seen).toEqual([0.5, 1]);

  tickTweens(50); // finished tweens are gone
  expect(seen).toEqual([0.5, 1]);
});

test('zero duration applies the end state at once', async () => {
  const seen: number[] = [];
  await tween(0, (t) => seen.push(t));
  expect(seen).toEqual([1]);
});
