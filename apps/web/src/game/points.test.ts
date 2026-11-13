import { expect, test } from 'vitest';
import { distance, shortOf } from './points';

test('distance is the straight line between two points', () => {
  expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
});

test('shortOf stops `gap` away from the target, on the side of `from`', () => {
  expect(shortOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, 0.7)).toEqual({ x: 0, y: 0, z: 0.7 });
  const diagonal = shortOf({ x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, Math.SQRT2 / 2);
  expect(diagonal.x).toBeCloseTo(0.5);
  expect(diagonal.z).toBeCloseTo(0.5);
});

test('shortOf a point on the target is the target', () => {
  expect(shortOf({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, 0.7)).toEqual({ x: 1, y: 0, z: 1 });
});
