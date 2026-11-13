import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { CAMERA, COURTYARD } from './theme';

type P = [number, number, number];
// The board's corners and the tallest piece (a king, 1.55) on each back rank.
const BOARD: P[] = [
  [-4.3, 0, 4.3],
  [4.3, 0, 4.3],
  [-4.3, 0, -4.3],
  [4.3, 0, -4.3],
  [-3.5, 1.55, -3.5],
  [3.5, 1.55, -3.5],
  [-3.5, 1.55, 3.5],
  [3.5, 1.55, 3.5],
];

/** Projects points through the home camera of one army (sign 1: the first army, -1: the second). */
function view(aspect: number, sign: 1 | -1) {
  const [x, y, z] = CAMERA.position;
  const [tx, ty, tz] = CAMERA.target;
  const camera = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 100);
  camera.position.set(x, y, z * sign);
  camera.lookAt(tx, ty, tz * sign);
  camera.updateMatrixWorld();
  return (p: P) => new Vector3(...p).project(camera);
}

test('home is within the orbit controls distance limit', () => {
  const [x, y, z] = CAMERA.position;
  const [tx, ty, tz] = CAMERA.target;
  expect(Math.hypot(x - tx, y - ty, z - tz)).toBeLessThanOrEqual(CAMERA.maxDistance);
});

test('at fitAspect the whole board is in frame with a margin, from either side', () => {
  for (const sign of [1, -1] as const) {
    const project = view(CAMERA.fitAspect, sign);
    for (const p of BOARD) {
      const { x, y } = project(p);
      expect(Math.abs(x), `x of ${p}`).toBeLessThanOrEqual(0.95);
      expect(Math.abs(y), `y of ${p}`).toBeLessThanOrEqual(0.95);
    }
  }
});

test('on a wide screen the far wall shows up to the top of its merlons', () => {
  const top = COURTYARD.floorY + COURTYARD.wallHeight + COURTYARD.merlonHeight;
  for (const sign of [1, -1] as const) {
    expect(view(16 / 9, sign)([0, top, -COURTYARD.wallRadius * sign]).y).toBeLessThanOrEqual(1);
  }
});
