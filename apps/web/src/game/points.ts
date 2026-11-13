import type { Point } from './types';

// The little vector arithmetic the sequencer needs, on plain points: three.js loads only with the scene.

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The point `gap` away from `target`, on the line toward `from`. */
export function shortOf(target: Point, from: Point, gap: number): Point {
  const length = distance(target, from);
  if (length === 0) return { ...target };
  const k = gap / length;
  return { x: target.x + (from.x - target.x) * k, y: target.y + (from.y - target.y) * k, z: target.z + (from.z - target.z) * k };
}
