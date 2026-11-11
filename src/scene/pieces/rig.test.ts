import { expect, test } from 'vitest';
import { keys } from './rig';

test('keys interpolates through its keyframes', () => {
  expect(keys(0, 0, 1, 0)).toBe(0);
  expect(keys(0.25, 0, 1, 0)).toBe(0.5);
  expect(keys(0.5, 0, 1, 0)).toBe(1);
  expect(keys(1, 0, 1, 0)).toBe(0);
  expect(keys(1, 0, -1, 2, 5)).toBe(5);
});
