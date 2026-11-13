import { expect, test } from 'vitest';
import { DAIS_HALF, flagstones, random, ring, WALL_INNER } from './courtyard';

test('random is the same sequence for the same seed, in [0, 1)', () => {
  const a = random(7);
  const b = random(7);
  const values = Array.from({ length: 50 }, () => a());
  expect(values).toEqual(Array.from({ length: 50 }, () => b()));
  for (const v of values) expect(v >= 0 && v < 1).toBe(true);
});

test('flagstones are the same on every load, around the dais and inside the wall', () => {
  const slabs = flagstones();
  expect(slabs).toEqual(flagstones());
  expect(slabs.length).toBeGreaterThan(100); // 140 with the default seed and a 1.2 grid
  for (const { x, z, w, d } of slabs) {
    expect(Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2), `slab at ${x},${z} under the dais`).toBeGreaterThanOrEqual(DAIS_HALF);
    expect(Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2), `slab at ${x},${z} through the wall`).toBeLessThanOrEqual(WALL_INNER);
  }
});

test('ring spaces points evenly, each turned so a box lies along the circle', () => {
  const [north, east] = ring(10, 4);
  expect(north).toEqual({ x: 0, z: 10, angle: 0 });
  expect(east.x).toBeCloseTo(10);
  expect(east.z).toBeCloseTo(0);
  expect(east.angle).toBeCloseTo(Math.PI / 2);
  expect(ring(10, 4, Math.PI / 4)[0].x).toBeCloseTo(10 * Math.SQRT1_2);
});
