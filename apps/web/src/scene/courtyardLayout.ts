import { COURTYARD } from './theme';

export interface Slab {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number; // how far the slab's top sits above the floor
  shade: number; // multiplies the stone colour
}

export interface Placement {
  x: number;
  z: number;
  angle: number; // rotation about y that lays a box's x axis along the circle
}

export const DAIS_HALF = 6.5; // the lower step is 13 × 13
export const SLAB = 1.2; // the flagstones' grid pitch
export const WALL_INNER = COURTYARD.wallRadius - 0.4; // the wall is 0.8 thick, centred on its radius

/** Given to meshes that must never take a click, so a click off the board reaches onPointerMissed and deselects. */
export const noRaycast = () => {};

/** mulberry32: a small seeded generator, so the courtyard is the same on every load. */
export function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Slightly uneven flagstones on a grid between the dais and the wall. */
export function flagstones(seed = 7): Slab[] {
  const next = random(seed);
  const slabs: Slab[] = [];
  const reach = Math.floor(COURTYARD.wallRadius / SLAB);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const x = i * SLAB;
      const z = j * SLAB;
      if (Math.max(Math.abs(x), Math.abs(z)) - SLAB / 2 < DAIS_HALF) continue;
      if (Math.hypot(Math.abs(x) + SLAB / 2, Math.abs(z) + SLAB / 2) > WALL_INNER) continue;
      slabs.push({ x, z, w: SLAB - 0.06 - next() * 0.1, d: SLAB - 0.06 - next() * 0.1, y: next() * 0.04, shade: 0.85 + next() * 0.15 });
    }
  }
  return slabs;
}

/** `count` points evenly around a circle of `radius`, starting at +z and turning toward +x. */
export function ring(radius: number, count: number, offset = 0): Placement[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = offset + (i / count) * Math.PI * 2;
    return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, angle };
  });
}
