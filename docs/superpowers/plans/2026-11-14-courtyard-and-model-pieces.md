# Castle Courtyard and Pieces from Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the board in a castle courtyard the default view can see, make the teams red and blue, and load pieces from rigged `.glb` models made with Meshy, proven with one pilot pawn while every other type keeps its primitive-built model.

**Architecture:** The courtyard is plain R3F geometry (`Courtyard.tsx`, `Brazier.tsx`, `Banner.tsx`) laid out by a pure, tested `courtyard.ts`; the default camera comes down to 28° and looks at a `CAMERA.target`, checked by a projection test. A manifest (`pieces/models.ts`) lists the types drawn from `.glb` files; `GlbPiece.tsx` loads one with drei's `useGLTF`, recolours magenta texels to the team colour in the material's shader, and implements the existing `Rig` by scrubbing animation clips, so `Piece.tsx`'s actor, the sequencer and `TIMING` do not change. A missing or broken model falls back to the primitive-built one.

**Tech Stack:** Next.js 16.4, React 19.3, three.js 0.187, @react-three/fiber 9.8, @react-three/drei 10.7.9, Vitest 5, Playwright 1.64.1, @gltf-transform/cli 4.5.1, Meshy web app (free plan), Claude in Chrome.

**Spec:** `docs/superpowers/specs/2026-11-13-courtyard-and-model-pieces-design.md`

## Global Constraints

- Branch `courtyard-and-model-pieces` (the spec is already on it). End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Team colours, exactly: `TEAM.w` red `#B91C1C`, `TEAM.b` blue `#1D4ED8`; names `Red`/`Blue` and `Đỏ`/`Xanh`.
- Camera, exactly: `CAMERA.position` `[0, 6.88, 11.58]`, `CAMERA.target` `[0, 0.4, -0.6]`, `CAMERA.fitAspect` 1.45, `maxDistance` 14; the second army mirrors z. Orbit angle limits do not change.
- Courtyard, exactly: flagstones' top at y = −1.1; dais steps 11 × 11 and 13 × 13, 0.3 high; wall radius 12, height 3, merlons 0.5; four towers on the diagonals. Courtyard meshes never take a click and never cast shadows.
- Piece heights in squares: pawn 0.9, knight 1.2, bishop 1.25, rook 1.3, queen 1.4, king 1.55.
- Models: `apps/web/public/models/<piece>-<n>.glb`, ≤ 600 KB each, ≤ 3.5 MB in all; `Cache-Control: public, max-age=31536000, immutable` on `/models/:file*`. Team cloth is painted magenta `#FF00FF`.
- No value import of `three`, `@react-three/*` in `apps/web/src` outside `src/scene/**/*.tsx` and (after Task 2) `src/**/*.test.ts`.
- Originality: the reference picture the owner shared is never a Meshy input; prompts come from the spec's design table.
- The owner signs in to Meshy. Ask the owner before every download, every acceptance of terms, and anything that costs money. Never read any `.env` file.
- The site imports with the `@/` alias and no extensions; Node scripts import with `.ts`. Comments: one line, only the why.
- `npm test -w @chess/web` runs Vitest with a global setup that migrates the test database (`apps/server/vitest.setup.ts`): Postgres must be running, as for the rest of the suite.
- E2E needs a production build first (`npm run build`). Locally Playwright reuses whatever already listens on port 3000 (the owner's `next dev` may be running there); that is fine for these tests.

## File map

| File | Task | Job |
|---|---|---|
| `apps/web/src/scene/theme.ts` | 1, 2, 4 | `PALETTE`, `TEAM`, `CAMERA`, `COURTYARD` |
| `apps/web/src/ui/i18n.ts` | 1, 9 | team names; model credit |
| `apps/web/src/scene/Board.tsx` | 1 | glowing check square |
| `e2e/local.spec.ts`, `e2e/online.spec.ts` | 1, 9 | team names; models load |
| `apps/web/src/scene/CameraRig.tsx`, `apps/web/eslint.config.mjs`, `scene/camera.test.ts` | 2 | camera target; tests may import three |
| `apps/web/src/scene/courtyard.ts`, `courtyard.test.ts` | 3 | seeded layout |
| `apps/web/src/scene/Courtyard.tsx`, `Scene.tsx` | 4, 5, 8 | courtyard, light, fog; preload |
| `apps/web/src/scene/Brazier.tsx`, `Banner.tsx` | 5 | moving parts |
| `apps/web/src/scene/pieces/rig.ts`, `rig.test.ts` | 6 | `clipTime` |
| `apps/web/src/scene/pieces/models.ts`, `models.test.ts` | 6, 7 | manifest, guard |
| `apps/web/next.config.ts`, `apps/web/package.json`, `.gitignore` | 6 | cache header, `models` script, `assets-src/` |
| `apps/web/public/models/pawn-1.glb`, `public/models/CREDITS.md` | 7 | the pilot |
| `apps/web/scripts/merge-clips.ts` | 7 (only if needed) | one file from per-clip downloads |
| `apps/web/src/scene/pieces/GlbPiece.tsx`, `scene/Piece.tsx` | 8 | model pieces, fallback |
| `apps/web/src/ui/Settings.tsx`, `apps/web/bundle-budget.json` | 9 | credit; budget if needed |

---

### Task 1: Red and blue teams, and a check square that glows

**Files:**
- Modify: `apps/web/src/scene/theme.ts:1-19`, `apps/web/src/ui/i18n.ts:6` and `:117`, `apps/web/src/scene/Board.tsx:22-47`
- Test: `e2e/local.spec.ts:11`, `e2e/online.spec.ts:24`

**Interfaces:**
- Produces: `PALETTE.red`, `PALETTE.blue` (replacing `amber`, `teal`); `TEAM = { w: PALETTE.red, b: PALETTE.blue }`.

- [ ] **Step 1: Change the E2E expectations first**

In `e2e/local.spec.ts` line 11:
```ts
  await expect(over).toContainText('Checkmate — Blue wins');
```
In `e2e/online.spec.ts` line 24:
```ts
  await expect(page.getByRole('dialog', { name: 'Game over' })).toContainText('Resignation — Red wins');
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run build && npm run e2e -- --project=chromium local.spec.ts online.spec.ts`
Expected: FAIL — the dialogs still say `Teal wins` / `Amber wins`.

- [ ] **Step 3: Rename the colours and the teams**

In `apps/web/src/scene/theme.ts`, replace the two lines `amber: '#D97706',` and `teal: '#0F766E',` with:
```ts
  red: '#B91C1C',
  blue: '#1D4ED8',
```
and replace the `TEAM` line with:
```ts
export const TEAM = { w: PALETTE.red, b: PALETTE.blue } as const;
```
In `apps/web/src/ui/i18n.ts` line 6: `team: { w: 'Red', b: 'Blue' },` and line 117: `team: { w: 'Đỏ', b: 'Xanh' },`.

- [ ] **Step 4: Make the check square glow**

In `apps/web/src/scene/Board.tsx`, inside `SQUARES.map`, replace the tile's material:
```tsx
            <meshStandardMaterial
              color={color}
              roughness={dark ? 0.85 : 0.5}
              // glows, so a red king does not blend into its own square
              emissive={square === checked ? PALETTE.check : '#000000'}
              emissiveIntensity={square === checked ? 0.6 : 0}
            />
```

- [ ] **Step 5: Run the checks**

Run: `npm run typecheck -w @chess/web && npm run lint -w @chess/web && npm run build && npm run e2e -- --project=chromium local.spec.ts online.spec.ts`
Expected: PASS. `grep -rn "amber\|teal" apps/web/src/scene` prints nothing (Tailwind `amber-*` classes in `ui/` are the interface accent and stay).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/scene/theme.ts apps/web/src/ui/i18n.ts apps/web/src/scene/Board.tsx e2e/local.spec.ts e2e/online.spec.ts
git commit -m "feat: make the teams red and blue, and let the check square glow so a red king stays visible"
```

---

### Task 2: Lower the default view to 28°, so a courtyard wall is in frame

**Files:**
- Modify: `apps/web/src/scene/theme.ts` (`CAMERA`), `apps/web/src/scene/CameraRig.tsx:29-31,85-86`, `apps/web/eslint.config.mjs:10`
- Test: create `apps/web/src/scene/camera.test.ts`

**Interfaces:**
- Produces: `CAMERA.target: [number, number, number]`, `CAMERA.maxDistance: number`, and
  `export const COURTYARD = { floorY: -1.1, wallRadius: 12, wallHeight: 3, merlonHeight: 0.5 } as const` in `theme.ts`.

- [ ] **Step 1: Let tests import three**

In `apps/web/eslint.config.mjs`, the rule's `ignores` becomes:
```js
    ignores: ["src/scene/**/*.tsx", "src/**/*.test.ts"], // tests never ship to the browser
```

- [ ] **Step 2: Write the failing projection test**

Create `apps/web/src/scene/camera.test.ts`:
```ts
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { CAMERA, COURTYARD } from './theme';

type P = [number, number, number];
// The board's corners and the tallest piece (a king, 1.55) on each back rank.
const BOARD: P[] = [[-4.3, 0, 4.3], [4.3, 0, 4.3], [-4.3, 0, -4.3], [4.3, 0, -4.3], [-3.5, 1.55, -3.5], [3.5, 1.55, -3.5], [-3.5, 1.55, 3.5], [3.5, 1.55, 3.5]];

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
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd apps/web && npx vitest run src/scene/camera.test.ts`
Expected: FAIL — `COURTYARD` and `CAMERA.target` do not exist (type error at import, or `undefined is not iterable`).

- [ ] **Step 4: Set the camera and the courtyard's measures**

In `apps/web/src/scene/theme.ts`, replace the `CAMERA` object's first three fields and add `maxDistance`, then add `COURTYARD` after it:
```ts
export const CAMERA = {
  position: [0, 6.88, 11.58] as [number, number, number],
  target: [0, 0.4, -0.6] as [number, number, number], // above and beyond the centre, so the far wall is in frame
  fov: 36,
  fitAspect: 1.45,
  maxDistance: 14,
  focusMs: 400,
  focusAmount: 0.45, // how far the camera travels from home toward a fight
  introMs: 1200,
  introScale: 1.6, // the opening descent starts this many times farther out than home
  checkmateMs: 1200,
};

export const COURTYARD = {
  floorY: -1.1, // the flagstones' top: the dais's two 0.3 steps rise from here to the walnut base's bottom at -0.5
  wallRadius: 12,
  wallHeight: 3,
  merlonHeight: 0.5,
} as const;
```

- [ ] **Step 5: Aim the camera rig at the target**

In `apps/web/src/scene/CameraRig.tsx`, replace `const centre = new Vector3();` with:
```ts
    const [tx, ty, tz] = CAMERA.target;
    const centre = new Vector3(tx, ty, tz * sign);
```
and replace `maxDistance={14}` with `maxDistance={CAMERA.maxDistance}`.

- [ ] **Step 6: Run the tests and look at it**

Run: `cd apps/web && npx vitest run src/scene/camera.test.ts && cd ../.. && npm run typecheck -w @chess/web && npm run lint -w @chess/web`
Expected: PASS (measured while planning: board 0.945 wide and 0.846 tall at `fitAspect`; merlon tops at 0.956).

Then open `http://localhost:3000` in the browser pane, start a two-player game, and take a screenshot for each side (switch the side in the menu). The whole board is in view, nothing is cut at the edges, and the intro descent ends at the new view.

- [ ] **Step 7: Commit**

```bash
git add apps/web/eslint.config.mjs apps/web/src/scene/camera.test.ts apps/web/src/scene/theme.ts apps/web/src/scene/CameraRig.tsx
git commit -m "feat: lower the default view to 28 degrees and aim it past the centre, so the courtyard wall is in frame"
```

---

### Task 3: The courtyard's layout, seeded so every load looks the same

**Files:**
- Create: `apps/web/src/scene/courtyard.ts`
- Test: create `apps/web/src/scene/courtyard.test.ts`

**Interfaces:**
- Consumes: `COURTYARD` from `theme.ts` (Task 2).
- Produces:
  - `export interface Slab { x: number; z: number; w: number; d: number; y: number; shade: number }`
  - `export interface Placement { x: number; z: number; angle: number }`
  - `export function random(seed: number): () => number`
  - `export function flagstones(seed?: number): Slab[]`
  - `export function ring(radius: number, count: number, offset?: number): Placement[]`
  - `export const DAIS_HALF = 6.5`, `export const SLAB = 1.2`, `export const WALL_INNER = COURTYARD.wallRadius - 0.4`
  - `export const noRaycast = () => {}` — given to every mesh that must never take a click (Tasks 4, 5, 8). It lives in
    this plain module so the scene files that use it do not import each other.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/scene/courtyard.test.ts`:
```ts
import { expect, test } from 'vitest';
import { DAIS_HALF, flagstones, random, ring, WALL_INNER } from './courtyard';

test('random is the same sequence for the same seed, in [0, 1)', () => {
  const a = random(7), b = random(7);
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/web && npx vitest run src/scene/courtyard.test.ts`
Expected: FAIL — `Cannot find module './courtyard'`.

- [ ] **Step 3: Write the layout**

Create `apps/web/src/scene/courtyard.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx vitest run src/scene/courtyard.test.ts`
Expected: PASS. If `north` fails on `-0` versus `0` (`Math.sin(0) * 10` is `0`, so it should not), compare with `toBeCloseTo` per field instead.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/scene/courtyard.ts apps/web/src/scene/courtyard.test.ts
git commit -m "feat: lay out the courtyard's flagstones and wall ring, seeded so every load looks the same"
```

---

### Task 4: The courtyard's stone: dais, floor, walls, towers, dusk light and fog

**Files:**
- Create: `apps/web/src/scene/Courtyard.tsx`
- Modify: `apps/web/src/scene/theme.ts` (`PALETTE`), `apps/web/src/scene/Scene.tsx:46-51`

**Interfaces:**
- Consumes: `flagstones`, `ring`, `noRaycast` (Task 3), `COURTYARD`.
- Produces: `export function Courtyard()`; `PALETTE.stone`, `stoneDark`, `earth`, `roof`, `iron`, `flame`, `sun`,
  `skyFill`, and a new `PALETTE.background`.

- [ ] **Step 1: Add the courtyard's colours**

In `apps/web/src/scene/theme.ts`, replace `background: '#1C1917',` with:
```ts
  background: '#3D3142', // dusk; the fog fades the earth beyond the wall into it
  stone: '#8C8279',
  stoneDark: '#5C554E',
  earth: '#3B3026',
  roof: '#4B4F5C',
  iron: '#3F3F46',
  flame: '#FFA040',
  sun: '#FFD9B0',
  skyFill: '#A8B8D8',
```

- [ ] **Step 2: Build the stone**

Create `apps/web/src/scene/Courtyard.tsx`:
```tsx
import { RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { flagstones, noRaycast, ring, type Placement } from './courtyard';
import { COURTYARD, PALETTE } from './theme';

const { floorY, wallRadius: R, wallHeight: H, merlonHeight: M } = COURTYARD;
const SLABS = flagstones();
const WALL = ring(R, 32);
const MERLONS = ring(R, 64);
const TOWERS = ring(R, 4, Math.PI / 4);
const dummy = new Object3D();

function Flagstones() {
  const mesh = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    const color = new Color();
    SLABS.forEach((slab, i) => {
      dummy.position.set(slab.x, floorY + slab.y - 0.05, slab.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(slab.w, 1, slab.d);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
      mesh.current.setColorAt(i, color.set(PALETTE.stone).multiplyScalar(slab.shade));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.instanceColor!.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SLABS.length]} receiveShadow raycast={noRaycast}>
      <boxGeometry args={[1, 0.1, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

/** One box per placement, laid along the wall's circle. */
function RingBoxes({ items, size, y }: { items: Placement[]; size: [number, number, number]; y: number }) {
  const mesh = useRef<InstancedMesh>(null!);
  useLayoutEffect(() => {
    items.forEach(({ x, z, angle }, i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [items, y]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} receiveShadow raycast={noRaycast}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={PALETTE.stone} roughness={0.95} />
    </instancedMesh>
  );
}

/** The castle courtyard around the board. Nothing here takes a click or casts a shadow. */
export function Courtyard() {
  return (
    <group>
      {/* the dais: two steps under the walnut base, whose bottom is at y = -0.5 */}
      <RoundedBox args={[11, 0.3, 11]} radius={0.06} position={[0, -0.65, 0]} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={PALETTE.stone} roughness={0.85} />
      </RoundedBox>
      <RoundedBox args={[13, 0.3, 13]} radius={0.06} position={[0, -0.95, 0]} receiveShadow raycast={noRaycast}>
        <meshStandardMaterial color={PALETTE.stoneDark} roughness={0.9} />
      </RoundedBox>

      {/* grout between the flagstones, then earth beyond the wall that fades into the fog */}
      <mesh rotation-x={-Math.PI / 2} position={[0, floorY - 0.02, 0]} receiveShadow raycast={noRaycast}>
        <circleGeometry args={[R, 48]} />
        <meshStandardMaterial color={PALETTE.stoneDark} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, floorY - 0.04, 0]} raycast={noRaycast}>
        <circleGeometry args={[80, 48]} />
        <meshStandardMaterial color={PALETTE.earth} roughness={1} />
      </mesh>
      <Flagstones />

      <RingBoxes items={WALL} size={[2.45, H, 0.8]} y={floorY + H / 2} />
      <RingBoxes items={MERLONS} size={[0.55, M, 0.8]} y={floorY + H + M / 2} />
      {TOWERS.map(({ x, z }) => (
        <group key={`${x},${z}`} position={[x, floorY, z]}>
          <mesh position={[0, 2.1, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[1.3, 1.4, 4.2, 16]} />
            <meshStandardMaterial color={PALETTE.stone} roughness={0.95} />
          </mesh>
          <mesh position={[0, 5.1, 0]} raycast={noRaycast}>
            <coneGeometry args={[1.65, 1.8, 16]} />
            <meshStandardMaterial color={PALETTE.roof} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Light the scene for dusk and mount the courtyard**

In `apps/web/src/scene/Scene.tsx`, add `import { Courtyard } from './Courtyard';` and replace the background, ambient and directional light lines with:
```tsx
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, 18, 45]} />
      <hemisphereLight args={[PALETTE.skyFill, PALETTE.earth, 0.8]} />
      <directionalLight
        position={[5, 10, lightZ]}
        color={PALETTE.sun}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        // the shadow map covers the board, not the courtyard, so the pieces' shadows stay sharp
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
```
and put `<Courtyard />` on the line before `<Board />`.

- [ ] **Step 4: Check it**

Run: `npm run typecheck -w @chess/web && npm run lint -w @chess/web`
Expected: PASS.

In the browser pane (`http://localhost:3000`), start a game and screenshot each side. Look for: the dais under the board, flagstones to the wall, the whole far wall with merlons, two towers framing the far corners, the earth fading into dusk. Click a piece, then click the flagstones: the piece is deselected. `read_console_messages` shows no errors. If the board looks too dark or too washed out, change only the hemisphere light's intensity (0.6–1.0) and say so in the commit.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/scene/Courtyard.tsx apps/web/src/scene/theme.ts apps/web/src/scene/Scene.tsx
git commit -m "feat: stand the board on a dais in a castle courtyard at dusk, with walls, towers and fog"
```

---

### Task 5: Braziers that flicker and banners that wave

**Files:**
- Create: `apps/web/src/scene/Brazier.tsx`, `apps/web/src/scene/Banner.tsx`
- Modify: `apps/web/src/scene/Courtyard.tsx`

**Interfaces:**
- Consumes: `noRaycast` (Task 3), `reducedMotion` from `./tween`, `TEAM`, `PALETTE`, `COURTYARD`.
- Produces: `export function Brazier({ x, z }: { x: number; z: number })`, `export function Banner({ color, side }: { color: string; side: 1 | -1 })`.

- [ ] **Step 1: The brazier**

Create `apps/web/src/scene/Brazier.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh, PointLight } from 'three';
import { noRaycast } from './courtyard';
import { PALETTE } from './theme';
import { reducedMotion } from './tween';

const LIGHT = 6;

/** A stone bowl with a flame and a warm light, standing on the dais's top step (y = -0.5). */
export function Brazier({ x, z }: { x: number; z: number }) {
  const light = useRef<PointLight>(null!);
  const flame = useRef<Mesh>(null!);
  const still = reducedMotion();
  const phase = x * 3 + z; // so the four braziers do not flicker in step

  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime * 9 + phase;
    const f = 1 + 0.15 * Math.sin(t) + 0.1 * Math.sin(t * 2.3);
    light.current.intensity = LIGHT * f;
    flame.current.scale.y = f;
  });

  return (
    <group position={[x, -0.5, z]}>
      <mesh position={[0, 0.25, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.28, 0.12, 0.5, 10]} />
        <meshStandardMaterial color={PALETTE.iron} metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 0.62, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.2, 0.5, 8]} />
        <meshStandardMaterial color={PALETTE.flame} emissive={PALETTE.flame} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.9, 0]} color={PALETTE.flame} intensity={LIGHT} distance={6} decay={2} />
    </group>
  );
}
```

- [ ] **Step 2: The banner**

Create `apps/web/src/scene/Banner.tsx`:
```tsx
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh, type PlaneGeometry } from 'three';
import { noRaycast } from './courtyard';
import { COURTYARD, PALETTE } from './theme';
import { reducedMotion } from './tween';

const WIDTH = 1.2;
const HEIGHT = 1.8;

/** The team's cloth with our own emblem: two crossed gold spears under a white inverted chevron. */
function emblem(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = g.fillStyle = PALETTE.gold;
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath(); // the shafts
  g.moveTo(30, 170);
  g.lineTo(98, 48);
  g.moveTo(98, 170);
  g.lineTo(30, 48);
  g.stroke();
  for (const x of [30, 98]) {
    g.beginPath(); // a diamond spearhead on each top end
    g.moveTo(x, 22);
    g.lineTo(x + 9, 42);
    g.lineTo(x, 56);
    g.lineTo(x - 9, 42);
    g.fill();
  }
  g.fillStyle = PALETTE.cloth;
  g.beginPath(); // the chevron, point down (canvas y grows downward)
  g.moveTo(14, 112);
  g.lineTo(64, 150);
  g.lineTo(114, 112);
  g.lineTo(114, 134);
  g.lineTo(64, 172);
  g.lineTo(14, 134);
  g.closePath();
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A pole behind one army (side 1: +z, the first army) with its cloth facing the board. */
export function Banner({ color, side }: { color: string; side: 1 | -1 }) {
  const cloth = useRef<Mesh<PlaneGeometry>>(null!);
  const texture = useMemo(() => emblem(color), [color]);
  const flat = useRef<Float32Array | null>(null); // the cloth's resting positions, copied on the first frame
  const still = reducedMotion();

  useFrame(({ clock }) => {
    if (still) return;
    const position = cloth.current.geometry.attributes.position;
    flat.current ??= (position.array as Float32Array).slice();
    for (let i = 0; i < position.count; i++) {
      const x = flat.current[i * 3];
      const y = flat.current[i * 3 + 1];
      const free = (x + WIDTH / 2) / WIDTH; // 0 at the pole, 1 at the free edge
      position.setZ(i, Math.sin(clock.elapsedTime * 2.5 + x * 3 + y) * 0.12 * free);
    }
    position.needsUpdate = true;
    cloth.current.geometry.computeVertexNormals();
  });

  return (
    <group position={[0, COURTYARD.floorY, 8.5 * side]} rotation-y={side === 1 ? Math.PI : 0}>
      <mesh position={[-WIDTH / 2 - 0.05, 2, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.05, 0.06, 4, 8]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.9, 0]} rotation-z={Math.PI / 2} raycast={noRaycast}>
        <cylinderGeometry args={[0.035, 0.035, WIDTH + 0.2, 6]} />
        <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />
      </mesh>
      <mesh ref={cloth} position={[0, 2.95, 0]} raycast={noRaycast}>
        <planeGeometry args={[WIDTH, HEIGHT, 10, 16]} />
        <meshStandardMaterial map={texture} side={DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 3: Place them**

In `apps/web/src/scene/Courtyard.tsx`, add the imports:
```tsx
import { Banner } from './Banner';
import { Brazier } from './Brazier';
import { COURTYARD, PALETTE, TEAM } from './theme';
```
(replacing the existing `theme` import), add after `const TOWERS = …`:
```tsx
const BRAZIERS: [number, number][] = [[5, 5], [-5, 5], [5, -5], [-5, -5]]; // the top step's corners
```
and before the closing `</group>` of `Courtyard`:
```tsx
      {BRAZIERS.map(([x, z]) => (
        <Brazier key={`${x},${z}`} x={x} z={z} />
      ))}
      <Banner color={TEAM.w} side={1} />
      <Banner color={TEAM.b} side={-1} />
```

- [ ] **Step 4: Check it**

Run: `npm run typecheck -w @chess/web && npm run lint -w @chess/web`
Expected: PASS.

In the browser pane: the far banner is the opponent's colour, its emblem upright and readable (spears point up, the chevron points down), and it waves; the far braziers glow and flicker. If the braziers' light is too weak or too strong on the dais, change `LIGHT` only.

Reduced motion: both components skip their `useFrame` work when `still` is true. The browser pane cannot emulate the setting, but Playwright runs with `reducedMotion: 'reduce'` (`e2e/playwright.config.ts`), so Task 9's E2E run renders the courtyard that way with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/scene/Brazier.tsx apps/web/src/scene/Banner.tsx apps/web/src/scene/Courtyard.tsx
git commit -m "feat: add flickering braziers on the dais and a waving banner in each team's colour"
```

---

### Task 6: The models manifest, its guard, `clipTime`, the cache header and the pipeline script

**Files:**
- Create: `apps/web/src/scene/pieces/models.ts`, `apps/web/src/scene/pieces/models.test.ts`
- Modify: `apps/web/src/scene/pieces/rig.ts`, `rig.test.ts`, `apps/web/next.config.ts:19-27`, `apps/web/package.json` (scripts, devDependencies), `.gitignore`

**Interfaces:**
- Produces:
  - `export interface Clips { idle: string; walk: string; attack: string; die: string }`
  - `export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>>` (empty until Task 7)
  - `export const HEIGHT: Record<PieceSymbol, number>`
  - `export function clipTime(value: number, duration: number, loop: boolean): number` in `rig.ts`
  - `npm run models -w @chess/web -- <in.glb> <out.glb>`

- [ ] **Step 1: Write the failing `clipTime` test**

Append to `apps/web/src/scene/pieces/rig.test.ts` (and change its import to `import { clipTime, keys } from './rig';`):
```ts
test('clipTime wraps a looping clip once per unit and clamps a one-shot clip', () => {
  expect(clipTime(0, 2, true)).toBe(0);
  expect(clipTime(1.25, 2, true)).toBe(0.5);
  expect(clipTime(3, 2, true)).toBe(0); // whole cycles land back at the start
  expect(clipTime(0.5, 2, false)).toBe(1);
  expect(clipTime(1.5, 2, false)).toBe(2);
  expect(clipTime(-0.2, 2, false)).toBe(0);
});
```

- [ ] **Step 2: Write the failing manifest guard**

Create `apps/web/src/scene/pieces/models.test.ts`:
```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PieceSymbol } from 'chess.js';
import { expect, test } from 'vitest';
import { MODELS } from './models';

// next.config.ts caches /models/* as immutable for a year, so a changed model gets a new name: <piece>-<n>.glb.
const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url));
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const KB = 1024;

/** The JSON chunk of a binary glTF file: the scene description, without the binary buffers. */
function glbJson(file: Buffer): { animations?: { name?: string }[] } {
  if (file.readUInt32LE(0) !== 0x46546c67) throw new Error('not a binary glTF file');
  if (file.readUInt32LE(16) !== 0x4e4f534a) throw new Error('the first chunk is not JSON');
  return JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
}

/** A minimal binary glTF file holding `json`, to test the reader. */
function glb(json: object): Buffer {
  const text = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  return Buffer.concat([header, chunk]);
}

const listed = Object.entries(MODELS) as [PieceSymbol, NonNullable<(typeof MODELS)[PieceSymbol]>][];
const dir = `${PUBLIC}/models`;
const onDisk = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.glb')) : [];

test('glbJson reads the JSON chunk of a binary glTF file', () => {
  expect(glbJson(glb({ animations: [{ name: 'Walk' }] })).animations?.[0].name).toBe('Walk');
  expect(() => glbJson(Buffer.from('not a model, just text'))).toThrow('not a binary glTF file');
});

test('every listed model is on disk under its versioned name, and every model on disk is listed', () => {
  for (const [type, { url }] of listed) {
    expect(url).toMatch(new RegExp(`^/models/${NAMES[type]}-\\d+\\.glb$`));
    expect(existsSync(PUBLIC + url), url).toBe(true);
  }
  expect([...onDisk].sort()).toEqual(listed.map(([, { url }]) => url.slice('/models/'.length)).sort());
});

test('models stay small: 600 KB each, 3.5 MB in all', () => {
  const sizes = onDisk.map((file) => statSync(`${dir}/${file}`).size);
  sizes.forEach((size, i) => expect(size, onDisk[i]).toBeLessThanOrEqual(600 * KB));
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(3.5 * KB * KB);
});

test('every listed clip is an animation in its file', () => {
  for (const [, { url, clips }] of listed) {
    if (!clips) continue;
    const names = (glbJson(readFileSync(PUBLIC + url)).animations ?? []).map((animation) => animation.name);
    for (const name of Object.values(clips)) expect(names, `${url} has no clip named ${name}`).toContain(name);
  }
});
```

- [ ] **Step 3: Run both to see them fail**

Run: `cd apps/web && npx vitest run src/scene/pieces/rig.test.ts src/scene/pieces/models.test.ts`
Expected: FAIL — `clipTime` is not exported; `./models` cannot be found.

- [ ] **Step 4: Write `clipTime` and the manifest**

Append to `apps/web/src/scene/pieces/rig.ts`:
```ts
/** Where a clip of `duration` seconds stands at `value`: a looping clip wraps every 1, a one-shot clip clamps to 0..1. */
export function clipTime(value: number, duration: number, loop: boolean): number {
  const t = loop ? value - Math.floor(value) : Math.min(Math.max(value, 0), 1);
  return t * duration;
}
```
Create `apps/web/src/scene/pieces/models.ts`:
```ts
import type { PieceSymbol } from 'chess.js';

/** Animation names in a model's file, one for each pose the actor plays. */
export interface Clips {
  idle: string;
  walk: string;
  attack: string;
  die: string;
}

/** Piece types drawn from a .glb model. A type not listed here uses its model built in code. */
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {};

/** A model is scaled to this height, in squares. */
export const HEIGHT: Record<PieceSymbol, number> = { p: 0.9, n: 1.2, b: 1.25, r: 1.3, q: 1.4, k: 1.55 };
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && npx vitest run src/scene/pieces/rig.test.ts src/scene/pieces/models.test.ts`
Expected: PASS (the manifest is empty and `public/models/` does not exist yet).

- [ ] **Step 6: Cache header, ignored sources, and the optimiser**

In `apps/web/next.config.ts`, change the comment above `cacheHeaders` and add the models entry:
```ts
// The engine's and the models' names carry a version and never change in place (engine/files.test.ts,
// scene/pieces/models.test.ts). A changed sound reaches returning players within a week.
const cacheHeaders = [
  { source: "/engine/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  { source: "/models/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
```
(the `/audio/` entry stays as it is).

Append to `.gitignore`, under `# local only`:
```
/apps/web/assets-src/
```

Install the optimiser at an exact version (approved in the spec):
```bash
npm install -D -E @gltf-transform/cli@4.5.1 -w @chess/web
```
Check its flags before using them: `cd apps/web && npx gltf-transform optimize --help`. The script below uses `--compress`, `--texture-compress`, `--texture-size` and `--instance`; if `--help` names any of them differently, use the name it prints.

In `apps/web/package.json` `scripts`, add:
```json
    "models": "sh -c 'gltf-transform optimize \"$0\" \"$1\" --compress meshopt --texture-compress webp --texture-size 512 --instance false'"
```
(`npm run models -w @chess/web -- <in.glb> <out.glb>` passes the two paths as `$0` and `$1`.)

- [ ] **Step 7: Run the checks**

Run: `npm test -w @chess/web && npm run typecheck -w @chess/web && npm run lint -w @chess/web`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/scene/pieces/models.ts apps/web/src/scene/pieces/models.test.ts apps/web/src/scene/pieces/rig.ts apps/web/src/scene/pieces/rig.test.ts apps/web/next.config.ts apps/web/package.json package-lock.json .gitignore
git commit -m "feat: add the piece models manifest, its size and clip guard, and the glTF optimiser script"
```

---

### Task 7: The pilot pawn, made in Meshy

This task is done in the owner's Chrome with Claude in Chrome. Load its tools in one call:
`ToolSearch` with `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__get_page_text`.

**Files:**
- Create: `apps/web/public/models/pawn-1.glb`, `apps/web/public/models/CREDITS.md`
- Create only if Meshy downloads one file per clip: `apps/web/scripts/merge-clips.ts`
- Modify: `apps/web/src/scene/pieces/models.ts`

**Interfaces:**
- Produces: `MODELS.p = { url: '/models/pawn-1.glb', clips: { idle, walk, attack, die } }` with the names found in the file.

- [ ] **Step 1: Open Meshy and let the owner sign in**

Open `https://www.meshy.ai` in a new tab. Ask the owner to sign in themselves, and wait until they say it is done. Do not type any credential. If the site asks to accept terms or cookies, ask the owner first; decline non-essential cookies.

- [ ] **Step 2: Generate the model**

In Text to 3D, before pressing Generate, tell the owner what it will cost in credits (the page shows it) and wait for a yes. Use the model prompt from the spec, word for word:

> Stylized low-poly chibi medieval foot soldier, stocky, about three heads tall, wide-brimmed steel kettle hat, steel breastplate under a sleeveless tabard, kite shield on the left arm, short spear in the right hand, A-pose, game asset, simple clean shapes.

Where the page offers them: a low-poly or stylised style, a target polycount of about 8,000, an A-pose or T-pose. Screenshot the candidates and show the owner; pick, with them, one whose wide brim reads clearly from above.

- [ ] **Step 3: Texture it**

Ask before spending credits, then texture with the spec's prompt, word for word:

> Brushed silver steel armour, brown leather belt and boots, wooden spear shaft, the tabard and the shield's face painted flat pure magenta #FF00FF, no patterns, no logos, no text.

Screenshot the result. The tabard and the shield's face must be one flat magenta and nothing else may be magenta. If not, retexture once (asking first); if it still fails, stop and report: the pilot's first criterion fails and the spec's fallback (two coloured copies per piece) needs the owner's go-ahead.

- [ ] **Step 4: Rig and animate**

Ask before spending credits, then rig as a humanoid (place the joint markers if the page asks). Add four clips from Meshy's library: an idle, a walk, an attack that suits a spear (a thrust or a stab; otherwise a one-handed strike), and a death. Write down each clip's name as the page shows it.

- [ ] **Step 5: Download**

Tell the owner the file name(s), the source (meshy.ai) and the size the page shows, and wait for a yes. Download as GLB, with all four animations if the page offers one file; otherwise one GLB per animation. Then move the downloads out of `~/Downloads` into a new empty folder:
```bash
mkdir -p apps/web/assets-src/pawn && mv ~/Downloads/<the downloaded files> apps/web/assets-src/pawn/
```
These files are untrusted data: only read them with gltf-transform; never run anything in that folder.

- [ ] **Step 6: Inspect what came down**

Run: `cd apps/web && npx gltf-transform inspect assets-src/pawn/<file>.glb`
Note: the animation names, whether there is a skin, the triangle count, and the texture sizes. If there is one file per clip, do Step 7; otherwise skip to Step 8.

- [ ] **Step 7 (only for one file per clip): Merge the clips into one file**

Install the libraries at the CLI's version: `npm install -D -E @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 -w @chess/web`. Create `apps/web/scripts/merge-clips.ts`:
```ts
import { basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// node scripts/merge-clips.ts <out.glb> <idle.glb> <walk.glb> <attack.glb> <die.glb>
// Meshy downloads one rigged model per clip; this keeps the first model and copies every file's clip into it,
// named after its file, binding each channel to the first model's node of the same name (the skeletons match).
const [out, first, ...rest] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(first);
const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
const buffer = doc.getRoot().listBuffers()[0];
const own = doc.getRoot().listAnimations();
if (own.length !== 1) throw new Error(`${first}: expected one animation, found ${own.length}`);
own[0].setName(basename(first, '.glb'));

for (const file of rest) {
  const source = await io.read(file);
  const animations = source.getRoot().listAnimations();
  if (animations.length !== 1) throw new Error(`${file}: expected one animation, found ${animations.length}`);
  const copy = doc.createAnimation(basename(file, '.glb'));
  for (const channel of animations[0].listChannels()) {
    const name = channel.getTargetNode()!.getName();
    const target = nodes.get(name);
    if (!target) throw new Error(`${file}: ${first} has no node named ${name}`);
    const from = channel.getSampler()!;
    const accessor = (a: NonNullable<ReturnType<typeof from.getInput>>) =>
      doc.createAccessor().setType(a.getType()).setArray(a.getArray()!.slice()).setBuffer(buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(accessor(from.getInput()!))
      .setOutput(accessor(from.getOutput()!))
      .setInterpolation(from.getInterpolation());
    copy.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(channel.getTargetPath()).setSampler(sampler));
  }
}
await io.write(out, doc);
```
Rename the downloads to `idle.glb`, `walk.glb`, `attack.glb`, `die.glb`, then run:
`cd apps/web && node scripts/merge-clips.ts assets-src/pawn/pawn.glb assets-src/pawn/idle.glb assets-src/pawn/walk.glb assets-src/pawn/attack.glb assets-src/pawn/die.glb`
and `npx gltf-transform inspect assets-src/pawn/pawn.glb`: four animations named `idle`, `walk`, `attack`, `die`, one skin.

- [ ] **Step 8: Optimise**

Run: `mkdir -p apps/web/public/models && npm run models -w @chess/web -- assets-src/pawn/pawn.glb public/models/pawn-1.glb` (use the downloaded file's name if Step 7 was skipped), then `ls -l apps/web/public/models/pawn-1.glb` and `cd apps/web && npx gltf-transform inspect public/models/pawn-1.glb`.
Expected: at most 614,400 bytes; the skin and all four animations survive. If it is over: re-run with `--texture-size 256`, then with `--simplify-ratio 0.5` added to the `models` script, until it fits (the pilot's third criterion). Note in the commit which settings were needed.

- [ ] **Step 9: Write the credits**

Create `apps/web/public/models/CREDITS.md` (fill in the date of the generation and the clip names actually used):
```markdown
# 3D model credits

The piece models were made with Meshy (meshy.ai) on its free plan and are licensed CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). The game credits them in Settings.

| File | Made | Model prompt | Texture prompt | Clips |
|---|---|---|---|---|
| `pawn-1.glb` | 2026-11-.. | Stylized low-poly chibi medieval foot soldier, stocky, about three heads tall, wide-brimmed steel kettle hat, steel breastplate under a sleeveless tabard, kite shield on the left arm, short spear in the right hand, A-pose, game asset, simple clean shapes. | Brushed silver steel armour, brown leather belt and boots, wooden spear shaft, the tabard and the shield's face painted flat pure magenta #FF00FF, no patterns, no logos, no text. | idle, walk, attack, death (names below) |

Rigged as a humanoid in Meshy; clips from Meshy's animation library. Optimised with:
`npm run models -w @chess/web -- assets-src/pawn/pawn.glb public/models/pawn-1.glb`
(`gltf-transform optimize --compress meshopt --texture-compress webp --texture-size 512 --instance false`, @gltf-transform/cli 4.5.1).
```
Replace `2026-11-..` with the real date and `(names below)` with the four names from Step 6 or 7.

- [ ] **Step 10: Register the pawn**

In `apps/web/src/scene/pieces/models.ts`, set `MODELS` to (with the four names exactly as `inspect` printed them):
```ts
export const MODELS: Partial<Record<PieceSymbol, { url: string; clips?: Clips }>> = {
  p: { url: '/models/pawn-1.glb', clips: { idle: 'idle', walk: 'walk', attack: 'attack', die: 'die' } },
};
```

- [ ] **Step 11: Run the guard**

Run: `cd apps/web && npx vitest run src/scene/pieces/models.test.ts`
Expected: PASS — the file exists, is listed, fits the budget, and has the four clips.

- [ ] **Step 12: Commit**

```bash
git add apps/web/public/models/pawn-1.glb apps/web/public/models/CREDITS.md apps/web/src/scene/pieces/models.ts
git commit -m "feat: add the pilot pawn model, made with Meshy (CC BY 4.0), rigged with four clips"
```
If Step 7 ran, stage `apps/web/scripts/merge-clips.ts apps/web/package.json package-lock.json` too, before the commit.

---

### Task 8: Pieces drawn from models, with the built-in model as fallback

**Files:**
- Create: `apps/web/src/scene/pieces/GlbPiece.tsx`
- Modify: `apps/web/src/scene/Piece.tsx:6-19,94-101`, `apps/web/src/scene/Scene.tsx` (preload)

**Interfaces:**
- Consumes: `MODELS`, `HEIGHT`, `Clips` (Task 6); `clipTime`, `keys`, `PieceModelProps`, `Rig` from `rig.ts`.
- Produces: `export function GlbPiece(props: PieceModelProps & { type: PieceSymbol })`, `export class ModelBoundary`.

- [ ] **Step 1: Write the model piece**

Create `apps/web/src/scene/pieces/GlbPiece.tsx`:
```tsx
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { PieceSymbol } from 'chess.js';
import { Component, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import {
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { noRaycast } from '../courtyard';
import { HEIGHT, MODELS, type Clips } from './models';
import { clipTime, keys, type PieceModelProps } from './rig';

type Clip = keyof Clips;

// Texels whose red and blue are high and green low (the magenta painted in Meshy) take the team's colour,
// at the texel's brightness so the shading baked into the texture survives.
const RECOLOUR = /* glsl */ `
#include <map_fragment>
float keyed = smoothstep(0.15, 0.35, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g);
diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * max(diffuseColor.r, diffuseColor.b), keyed);
`;

const teamMaterials = new Map<Material, Map<string, Material>>();

/** `material` with its magenta replaced by `color`: one copy per material and team, shared by all their pieces. */
function teamMaterial(material: Material, color: string): Material {
  let byColor = teamMaterials.get(material);
  if (!byColor) teamMaterials.set(material, (byColor = new Map()));
  let copy = byColor.get(color);
  if (!copy) {
    copy = material.clone();
    const teamColor = { value: new Color(color) };
    copy.onBeforeCompile = (shader) => {
      shader.uniforms.teamColor = teamColor;
      shader.fragmentShader = `uniform vec3 teamColor;\n${shader.fragmentShader.replace('#include <map_fragment>', RECOLOUR)}`;
    };
    copy.customProgramCacheKey = () => 'team-recolour';
    byColor.set(color, copy);
  }
  return copy;
}

/** Scale and offset that make `scene` `height` tall, standing on y = 0, centred on the square. */
function fit(scene: Object3D, height: number) {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const scale = height / size.y;
  const offset: [number, number, number] = [-(box.min.x + size.x / 2) * scale, -box.min.y * scale, -(box.min.z + size.z / 2) * scale];
  return { scale, offset };
}

/** One action per clip, or null when a clip is missing (the piece then uses whole-model poses). */
function animate(model: Object3D, animations: AnimationClip[], clips: Clips | undefined) {
  if (!clips) return null;
  const mixer = new AnimationMixer(model);
  const actions = {} as Record<Clip, AnimationAction>;
  for (const key of Object.keys(clips) as Clip[]) {
    const clip = animations.find((candidate) => candidate.name === clips[key]);
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    if (key === 'attack' || key === 'die') {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
    actions[key] = action;
  }
  return { mixer, actions };
}

/** Weights `clip` in and every other clip out. */
function only(actions: Record<Clip, AnimationAction>, clip: Clip) {
  for (const key of Object.keys(actions) as Clip[]) actions[key].setEffectiveWeight(key === clip ? 1 : 0);
}

let warned = false;

/** Shows `fallback` (the built-in model) when a model fails to load, so the game stays playable. */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (!warned) console.warn('A piece model failed to load; using the built-in model instead.', error);
    warned = true;
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** A piece drawn from its .glb model (listed in MODELS). Faces +z, like the built-in models. */
export function GlbPiece({ type, color, ref }: PieceModelProps & { type: PieceSymbol }) {
  const entry = MODELS[type]!;
  const gltf = useGLTF(entry.url, false, true);
  const root = useRef<Group>(null!);
  const size = useMemo(() => fit(gltf.scene, HEIGHT[type]), [gltf.scene, type]);

  const model = useMemo(() => {
    const copy = clone(gltf.scene);
    copy.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // a posed skinned mesh leaves its bind-pose bounds
      mesh.raycast = noRaycast; // clicks hit the cylinder below; raycasting a skinned mesh is slow
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => teamMaterial(material, color))
        : teamMaterial(mesh.material, color);
    });
    return copy;
  }, [gltf.scene, color]);

  const anim = useMemo(() => animate(model, gltf.animations, entry.clips), [model, gltf.animations, entry.clips]);
  useEffect(() => () => anim?.mixer.uncacheRoot(model), [anim, model]);

  const posed = useRef(false); // true while the actor holds a clip at a time; otherwise the idle clip plays

  useFrame((_, delta) => {
    if (!anim || posed.current) return;
    only(anim.actions, 'idle');
    anim.actions.idle.paused = false;
    anim.mixer.update(delta);
  });

  useImperativeHandle(ref, () => {
    // Without clips: whole-model poses (a bob, a lunge, a fall backward).
    if (!anim) {
      return {
        stride(phase) {
          root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.05;
        },
        attack(t) {
          root.current.position.z = keys(t, 0, -0.1, 0.3, 0);
        },
        die(t) {
          root.current.rotation.x = -t * (Math.PI / 2);
          root.current.position.y = t * 0.12;
        },
      };
    }
    /** Holds `clip` at `value` (see clipTime), with every other clip weighted out. */
    const hold = (clip: Clip, value: number, loop: boolean) => {
      const action = anim.actions[clip];
      only(anim.actions, clip);
      action.enabled = true;
      action.paused = true;
      action.time = clipTime(value, action.getClip().duration, loop);
      anim.mixer.update(0);
    };
    return {
      stride(phase) {
        posed.current = phase !== 0;
        if (posed.current) hold('walk', phase, true);
      },
      attack(t) {
        posed.current = t < 1; // back to idle at the end
        if (posed.current) hold('attack', t, false);
      },
      die(t) {
        posed.current = true; // the last pose stays until the piece is removed
        hold('die', t, false);
      },
    };
  }, [anim]);

  return (
    <group ref={root}>
      <primitive object={model} scale={size.scale} position={size.offset} />
      {/* the click target: invisible, but the raycaster still hits it */}
      <mesh visible={false} position={[0, HEIGHT[type] / 2, 0]}>
        <cylinderGeometry args={[0.35, 0.35, HEIGHT[type], 8]} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Choose the model in the actor**

In `apps/web/src/scene/Piece.tsx`:
- add the imports `import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';` (replacing the existing `react` import), `import { GlbPiece, ModelBoundary } from './pieces/GlbPiece';` and `import { MODELS } from './pieces/models';`;
- rename `const MODELS = { p: Pawn, … }` to `const BUILT = { p: Pawn, n: Knight, b: Bishop, r: Rook, q: Queen, k: King };`;
- replace `const Model = MODELS[piece.type];` with:
```tsx
  const Built = BUILT[piece.type];
  const color = TEAM[piece.color];
  const built = <Built ref={rig} color={color} />;
```
- replace `<Model ref={rig} color={TEAM[piece.color]} />` with:
```tsx
        {MODELS[piece.type] ? (
          <ModelBoundary fallback={built}>
            <Suspense fallback={built}>
              <GlbPiece type={piece.type} ref={rig} color={color} />
            </Suspense>
          </ModelBoundary>
        ) : (
          built
        )}
```

- [ ] **Step 3: Preload the models with the scene**

In `apps/web/src/scene/Scene.tsx`, add `import { useGLTF } from '@react-three/drei';` and `import { MODELS } from './pieces/models';`, and after the imports:
```tsx
// Fetched as soon as the scene's code loads, so the pieces swap during the opening camera descent.
for (const entry of Object.values(MODELS)) useGLTF.preload(entry.url, false, true);
```

- [ ] **Step 4: Run the checks**

Run: `npm test -w @chess/web && npm run typecheck -w @chess/web && npm run lint -w @chess/web`
Expected: PASS. If TypeScript cannot find `three/addons/utils/SkeletonUtils.js`, import from `three/examples/jsm/utils/SkeletonUtils.js` instead.

- [ ] **Step 5: Look at it, both teams, every pose**

In the browser pane at `http://localhost:3000`, start a two-player game. Screenshot:
1. The opening position: sixteen model pawns, red on one side and blue on the other, standing on their squares, facing the opponent. If they face away from the opponent, add `yaw?: number` to the manifest entry type, set `yaw: Math.PI` on the pawn, and add `rotation-y={entry.yaw ?? 0}` to the `<primitive>`; then screenshot again.
2. Type `e4` and screenshot during the move: the walk clip plays and the pawn arrives at rest in the idle clip.
3. Type `d5`, then `exd5`, screenshotting about 300 ms and 700 ms after pressing Move: the attack clip, then the defender's death clip.
4. Zoom (`computer` `zoom`) on a red and a blue pawn: the tabard and the shield's face are cleanly red or blue, with no magenta fringe and no other part tinted. If a fringe shows, widen the threshold to `smoothstep(0.1, 0.3, …)`; if armour turns red, narrow it to `smoothstep(0.2, 0.4, …)`; say which in the commit.
5. Click a model pawn: it is selected and its moves are marked.
6. Rename `pawn-1.glb` temporarily to break the URL, reload: the built-in pawns appear, one warning in the console, no error. Rename it back.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/scene/pieces/GlbPiece.tsx apps/web/src/scene/Piece.tsx apps/web/src/scene/Scene.tsx apps/web/src/scene/pieces/models.ts
git commit -m "feat: draw pieces from their .glb models, recoloured per team and posed by scrubbing clips, with the built-in model as fallback"
```

---

### Task 9: Credit the models, check they load in E2E, keep the bundle in budget, judge the pilot

**Files:**
- Modify: `apps/web/src/ui/i18n.ts` (en and vi), `apps/web/src/ui/Settings.tsx:74-85`, `e2e/local.spec.ts`
- Modify only if over budget: `apps/web/bundle-budget.json`

**Interfaces:**
- Produces: `modelCredit` in `Strings`.

- [ ] **Step 1: Make the E2E test expect the models**

In `e2e/local.spec.ts`, after the `engine` listener:
```ts
  const models: string[] = [];
  page.on('response', (response) => void (response.url().includes('/models/') && models.push(`${response.status()} ${new URL(response.url()).pathname}`)));
```
and before the final `expect(engine, …)`:
```ts
  expect(models.length, 'the scene loads the piece models').toBeGreaterThan(0);
  expect(models.filter((line) => !line.startsWith('200 ')), 'every model loads').toEqual([]);
```

- [ ] **Step 2: Credit the models in Settings**

In `apps/web/src/ui/i18n.ts`, after `engineLicense` in `en`: `modelCredit: '3D pieces: made with Meshy, CC BY 4.0.',` and in `vi`: `modelCredit: 'Quân cờ 3D: tạo bằng Meshy, giấy phép CC BY 4.0.',`.

In `apps/web/src/ui/Settings.tsx`, after the Stockfish credit's closing `</p>`:
```tsx
        {/* The models are CC BY 4.0, which asks for credit where they are shown. */}
        <p className="text-xs text-stone-400">
          {t.modelCredit}{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline"
          >
            {t.engineLicense}
          </a>
        </p>
```

- [ ] **Step 3: Run everything**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run size -w @chess/web && npm run e2e`
Expected: PASS in all three browsers. If `npm run size` reports `totalKb` over 550, set `totalKb` in `apps/web/bundle-budget.json` to the measured value plus 5 %, rounded up to a multiple of 10, and say so in the commit message (the spec expects about 25 KB for GLTFLoader, the meshopt decoder and SkeletonUtils). `firstLoadKb` must not move: none of this is in the first load.

- [ ] **Step 4: Judge the pilot, with screenshots**

Collect, in the browser pane, the screenshots the spec asks for: the courtyard from both sides; the pilot pawn of each team at rest, walking, attacking and dying (Task 8 Step 5); a red king in check (play `f3 e5 g4 Qh4` as red and blue alternately); the mobile preset (`resize_window` `mobile`, then back to `desktop`). Then write down, for the pull request, each criterion of the spec's pilot section with pass or fail:
1. magenta replaced cleanly;
2. attack and death clips read well at `TIMING.attackMs` (700 ms) and `TIMING.dieMs` (700 ms);
3. `pawn-1.glb` at most 600 KB (give the size).
If any fails, apply the spec's fallback for it only after asking the owner.

- [ ] **Step 5: Commit**

```bash
git add e2e/local.spec.ts apps/web/src/ui/i18n.ts apps/web/src/ui/Settings.tsx apps/web/bundle-budget.json
git commit -m "feat: credit the Meshy models in Settings, and check in E2E that every model loads"
```
