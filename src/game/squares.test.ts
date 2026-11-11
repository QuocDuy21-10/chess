import { expect, test } from 'vitest';
import { isDark, SQUARES, squareToWorld } from './squares';

test('a1 is front-left, h8 is back-right', () => {
  expect(squareToWorld('a1').toArray()).toEqual([-3.5, 0, 3.5]);
  expect(squareToWorld('h8').toArray()).toEqual([3.5, 0, -3.5]);
  expect(squareToWorld('e4').toArray()).toEqual([0.5, 0, 0.5]);
});

test('64 unique squares, a1 dark, h1 light', () => {
  expect(new Set(SQUARES).size).toBe(64);
  expect(isDark('a1')).toBe(true);
  expect(isDark('h1')).toBe(false);
});
