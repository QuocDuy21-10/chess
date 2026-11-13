import { expect, test } from 'vitest';
import { eloDelta } from './elo.ts';

test('equal players: a win is worth half of K, a draw nothing', () => {
  expect(eloDelta(1500, 1500, 0, 1)).toBe(20);
  expect(eloDelta(1500, 1500, 0, 0)).toBe(-20);
  expect(eloDelta(1500, 1500, 0, 0.5)).toBe(0);
});

test('K drops from 40 to 20 after thirty rated games', () => {
  expect(eloDelta(1500, 1500, 29, 1)).toBe(20);
  expect(eloDelta(1500, 1500, 30, 1)).toBe(10);
});

test('an upset moves more than an expected result', () => {
  expect(eloDelta(1300, 1700, 30, 1)).toBe(18); // 20 × (1 − 0.0909)
  expect(eloDelta(1700, 1300, 30, 1)).toBe(2);
  expect(eloDelta(1700, 1300, 30, 0.5)).toBe(-8);
});
