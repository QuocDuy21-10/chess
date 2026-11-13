import { expect, test } from 'vitest';
import { isDark, SQUARES, squareToWorld } from './squares';

test('a1 is front-left, h8 is back-right', () => {
  expect(squareToWorld('a1')).toEqual({ x: -3.5, y: 0, z: 3.5 });
  expect(squareToWorld('h8')).toEqual({ x: 3.5, y: 0, z: -3.5 });
  expect(squareToWorld('e4')).toEqual({ x: 0.5, y: 0, z: 0.5 });
});

test('64 unique squares, a1 dark, h1 light', () => {
  expect(new Set(SQUARES).size).toBe(64);
  expect(isDark('a1')).toBe(true);
  expect(isDark('h1')).toBe(false);
});
