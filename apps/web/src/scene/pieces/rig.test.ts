import { expect, test } from 'vitest';
import { clipTime, keys } from './rig';

test('keys interpolates through its keyframes', () => {
  expect(keys(0, 0, 1, 0)).toBe(0);
  expect(keys(0.25, 0, 1, 0)).toBe(0.5);
  expect(keys(0.5, 0, 1, 0)).toBe(1);
  expect(keys(1, 0, 1, 0)).toBe(0);
  expect(keys(1, 0, -1, 2, 5)).toBe(5);
});

test('clipTime wraps a looping clip once per unit and clamps a one-shot clip', () => {
  expect(clipTime(0, 2, true)).toBe(0);
  expect(clipTime(1.25, 2, true)).toBe(0.5);
  expect(clipTime(3, 2, true)).toBe(0); // whole cycles land back at the start
  expect(clipTime(0.5, 2, false)).toBe(1);
  expect(clipTime(1.5, 2, false)).toBe(2);
  expect(clipTime(-0.2, 2, false)).toBe(0);
});
