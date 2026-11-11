# Playable Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3D chess game in the browser where two players share one screen, every legal move is animated, and every capture plays a short fight between the two pieces.

**Architecture:** `chess.js` is the single source of truth. A move is applied to it first, translated by a pure function into a list of animation steps, then played by an async sequencer that awaits each piece's animation promise while a Zustand store keeps input locked. Pieces are built from primitives and animated in code.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, three.js, React Three Fiber, drei, chess.js, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-playable-core-design.md`

## Global Constraints

- Exact versions: `next@16.4.6`, `chess.js@1.4.0`, `zustand@5.1.0`, `three@0.187.0`, `@react-three/fiber@9.8.2`, `@react-three/drei@10.7.9`, `vitest@5.1.0`, `@types/three@0.187.0`. React must satisfy `>=19 <19.4` (React Three Fiber's peer range).
- No other runtime dependencies. In particular: no XState, no audio library, no post-processing, no `.glb` loading.
- Originality: the game has its own piece designs, palette and fight choreography. `roadmap.md`, `design-3D.md`, `3D-Stylized.md` and `chess.jpeg` are background reading for the technical approach only. No name, character design, heraldry, palette or signature gag is taken from an existing game. Do not commit `chess.jpeg`.
- Palette, exactly: light tile `#D9C7A3`, dark tile `#3B4252`, board base `#5B4636`, first army (white, moves first) amber `#D97706`, second army (black) teal `#0F766E`, armour `#CBD5E1`, trim `#EAB308`.
- `chess.js` decides every rule. Never re-implement move legality.
- All input is ignored unless `phase === 'idle'`, except the promotion chooser while `phase === 'promoting'`.
- Piece models face `+z`. Square to world: `x = file − 3.5`, `z = 3.5 − rank` (0–7 indices).
- Run every command from the repository root (the folder that contains `docs/`).
- Commit only the paths each task names. Never `git add -A` without the exclusions shown in Task 1.

## What was checked while writing this plan

The code in Tasks 2–8 was written into a scratch project with the exact versions above before it was pasted here.

- Checked: all 30 tests in this plan pass; every file except `src/ui/Game.tsx` and `src/app/*` passes `tsc --noEmit` (TypeScript 7.0.2).
- Not checked: nothing has been rendered in a browser. Piece proportions, clip feel, camera limits and Tailwind classes are untested and Task 9 exists to catch that. `npm run lint` and `npm run build` have not been run against this code. `src/ui/Game.tsx` and `src/app/*` were not type-checked because the scratch project had no Next.js.

Two facts learned from that run are baked into the code and must not be "fixed":

- `chess.js` 1.4.0 returns `isCapture() === false` for en passant. The code tests `move.captured` instead.
- TypeScript 7 rejects `{ kind: cond ? 'hop' : 'walk', … }` as a `Step`. The code writes the two object literals out.

## Deviations from the spec

- The spec's sync check is "development-only". Here it always runs; it is one cheap comparison per move and it keeps a production game playable if a plan is ever wrong.
- `GameState` gains `turn`, `inCheck`, `submitText`, `choosePromotion` and `cancelPromotion`, which the HUD and chooser need.
- `TIMING` gains `turnMs`, `hopHeight` and `impactAt`; the palette gains wood, cloth, skin and highlight colours.
- The camera also has an azimuth limit, so the board cannot be spun to face away.
- The game-over dialog has a "View board" button so the final position can be studied.

## File Structure

| File | Responsibility |
|---|---|
| `src/game/types.ts` | `Piece`, `PieceId`, `PromotionPiece`, `Step` |
| `src/game/squares.ts` | Square → world position, the 64 squares, dark/light |
| `src/game/position.ts` | Pieces from a `chess.js` board, step effects, sync check |
| `src/game/planMove.ts` | `chess.js` move → `Step[]` |
| `src/scene/theme.ts` | Palette, team colours and names, timing, camera |
| `src/scene/tween.ts` | Promise-returning tweens ticked once per frame |
| `src/scene/actors.ts` | `ActorHandle` and the actor registry |
| `src/scene/sequencer.ts` | Plays `Step[]` against actors, applies effects |
| `src/state/store.ts` | Game state and actions |
| `src/scene/pieces/rig.ts` | `Rig` interface, model props, `keys()` keyframe helper |
| `src/scene/pieces/parts.tsx` | Shared materials and the `Robed` body |
| `src/scene/pieces/{Pawn,Knight,Bishop,Rook,Queen,King}.tsx` | Geometry and clips per piece type |
| `src/scene/Piece.tsx` | `PieceActor`: position, facing, clip dispatch, idle |
| `src/scene/Board.tsx` | Tiles, clicks, highlights, target markers |
| `src/scene/Scene.tsx` | Canvas, camera, lights, WebGL fallback |
| `src/ui/Modal.tsx` | Native modal `<dialog>` wrapper |
| `src/ui/Hud.tsx` | Turn, check, move list, typed move, new game |
| `src/ui/PromotionChooser.tsx` | Promotion dialog |
| `src/ui/GameOverModal.tsx` | Result dialog |
| `src/ui/Game.tsx` | Page layout; loads the scene without SSR |
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | Next.js shell |

Tests sit beside the code they test as `*.test.ts`.

---

### Task 1: Project scaffold

**Files:**
- Create: everything `create-next-app` generates, plus `vitest.config.mts`
- Modify: `package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: a Next.js project where `@/` resolves to `src/`, `npm test` runs Vitest, and all dependencies in Global Constraints are installed

- [ ] **Step 1: Scaffold into a temporary folder and copy it in**

`create-next-app` refuses a folder that already holds other files, so scaffold beside them.

```bash
npx create-next-app@16.4.6 scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --no-agent-feedback --skip-install --yes
```

```bash
cp -R scaffold/. . && rm -rf scaffold
```

```bash
npm pkg set name=combat-chess && npm install
```

If `create-next-app` rejects a flag, run `npx create-next-app@16.4.6 --help` and use the equivalent. The required choices are: TypeScript, Tailwind, ESLint, App Router, `src/` directory, alias `@/*`, npm, no React Compiler, no git init.

- [ ] **Step 2: Install the game's dependencies**

```bash
npm install chess.js@1.4.0 zustand@5.1.0 three@0.187.0 @react-three/fiber@9.8.2 @react-three/drei@10.7.9
```

```bash
npm install -D vitest@5.1.0 @types/three@0.187.0 @types/node@^22
```

```bash
npm ls react
```

Expected: one `react@19.x` below 19.4 and no `ERESOLVE` or `invalid` lines. If React is 19.4 or newer, run `npm install react@19.3.1 react-dom@19.3.1`.

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node' },
});
```

```bash
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 4: Replace the boilerplate shell**

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";
```

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chess',
  description: 'Chess where every capture is a fight.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Replace `src/app/page.tsx` with:

```tsx
export default function Page() {
  return <main className="p-8">Chess</main>;
}
```

```bash
rm -f public/*.svg
```

- [ ] **Step 5: Verify the scaffold**

```bash
grep -n '"@/\*"' tsconfig.json
```

Expected: a line containing `"@/*": ["./src/*"]`.

```bash
npx vitest run --passWithNoTests
```

Expected: "No test files found", exit code 0.

```bash
npm run build
```

Expected: the build completes and lists the `/` route.

- [ ] **Step 6: Commit**

```bash
git add -A -- . ':!chess.jpeg' ':!roadmap.md' ':!design-3D.md' ':!3D-Stylized.md'
```

```bash
git status --short
```

Expected: no line mentions `node_modules`, `.next` or `chess.jpeg`.

```bash
git commit -m "chore: scaffold Next.js app with three, chess.js, zustand and vitest"
```

---

### Task 2: Shared types and board coordinates

**Files:**
- Create: `src/game/types.ts`, `src/game/squares.ts`
- Test: `src/game/squares.test.ts`

**Interfaces:**
- Consumes: `Square`, `Color`, `PieceSymbol` from `chess.js`; `Vector3` from `three`
- Produces:
  - `type PieceId = string`
  - `interface Piece { id: PieceId; type: PieceSymbol; color: Color; square: Square }`
  - `type PromotionPiece = 'n' | 'b' | 'r' | 'q'`
  - `type Step` — `walk` / `hop` (`piece`, `to`), `combat` (`attacker`, `defender`), `promote` (`piece`, `to`)
  - `squareToWorld(square: Square): Vector3` — a new vector on every call
  - `SQUARES: Square[]` — all 64, `a1` first
  - `isDark(square: Square): boolean`

- [ ] **Step 1: Write the types**

Create `src/game/types.ts`:

```ts
import type { Color, PieceSymbol, Square } from 'chess.js';

export type PieceId = string; // from the starting square, e.g. "w-p-e2"; never changes

export interface Piece {
  id: PieceId;
  type: PieceSymbol;
  color: Color;
  square: Square;
}

export type PromotionPiece = 'n' | 'b' | 'r' | 'q';

export type Step =
  | { kind: 'walk'; piece: PieceId; to: Square }
  | { kind: 'hop'; piece: PieceId; to: Square }
  | { kind: 'combat'; attacker: PieceId; defender: PieceId }
  | { kind: 'promote'; piece: PieceId; to: PromotionPiece };
```

- [ ] **Step 2: Write the failing test**

Create `src/game/squares.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/game/squares.test.ts
```

Expected: FAIL, cannot resolve `./squares`.

- [ ] **Step 4: Write the implementation**

Create `src/game/squares.ts`:

```ts
import type { Square } from 'chess.js';
import { Vector3 } from 'three';

// a1 is nearest the camera on the left: x = file - 3.5, z = 3.5 - rank (0-7 indices)
export const squareToWorld = (square: Square): Vector3 =>
  new Vector3(square.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (Number(square[1]) - 1));

export const SQUARES = Array.from(
  { length: 64 },
  (_, i) => `${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}` as Square,
);

// a1 is dark
export const isDark = (square: Square) => (square.charCodeAt(0) - 97 + Number(square[1]) - 1) % 2 === 0;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/game/squares.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/squares.ts src/game/squares.test.ts
```

```bash
git commit -m "feat: add shared game types and board coordinates"
```

---

### Task 3: Move planning and step effects

**Files:**
- Create: `src/game/position.ts`, `src/game/planMove.ts`
- Test: `src/game/planMove.test.ts`, `src/game/position.test.ts`

**Interfaces:**
- Consumes: `Piece`, `PieceId`, `PromotionPiece`, `Step` from `@/game/types` (Task 2); `Chess`, `Move`, `Square` from `chess.js`
- Produces:
  - `piecesFromBoard(chess: Chess): Piece[]` — ids are `${color}-${type}-${square}`, e.g. `w-p-e2`
  - `applyStep(pieces: Piece[], step: Step): Piece[]` — pure; `walk`/`hop` set `square`, `combat` removes the defender, `promote` sets `type`
  - `matchesBoard(pieces: Piece[], chess: Chess): boolean`
  - `planMove(move: Move, pieces: Piece[]): Step[]` — `pieces` is the position **before** the move

Rules `planMove` implements:

| Move | Steps |
|---|---|
| Quiet move, any piece but the knight | `walk` to target |
| Quiet knight move | `hop` to target |
| Capture | `combat` with the piece on the target square, then `walk` to target |
| En passant | `combat` with the pawn beside the target square, then `walk` to target |
| Castling | king `walk`, then rook `hop` |
| Promotion | the steps above, then `promote` |

- [ ] **Step 1: Write the failing tests**

Create `src/game/planMove.test.ts`:

```ts
import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { planMove } from './planMove';
import { piecesFromBoard } from './position';

// Plans one move from a FEN. Piece ids come from the FEN squares, e.g. "w-p-e2".
function plan(fen: string, move: string) {
  const chess = new Chess(fen);
  const pieces = piecesFromBoard(chess);
  return planMove(chess.move(move), pieces);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('quiet move walks', () => {
  expect(plan(START, 'e4')).toEqual([{ kind: 'walk', piece: 'w-p-e2', to: 'e4' }]);
});

test('quiet knight move hops', () => {
  expect(plan(START, 'Nf3')).toEqual([{ kind: 'hop', piece: 'w-n-g1', to: 'f3' }]);
});

test('capture fights, then walks in', () => {
  expect(plan('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')).toEqual([
    { kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-p-e4', to: 'd5' },
  ]);
});

test('knight capture fights, then walks in', () => {
  expect(plan('rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2', 'Nxd5')).toEqual([
    { kind: 'combat', attacker: 'w-n-c3', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-n-c3', to: 'd5' },
  ]);
});

test('en passant fights the pawn beside the target square', () => {
  expect(plan('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', 'exf6')).toEqual([
    { kind: 'combat', attacker: 'w-p-e5', defender: 'b-p-f5' },
    { kind: 'walk', piece: 'w-p-e5', to: 'f6' },
  ]);
});

test('king-side castle: king walks, rook hops', () => {
  expect(plan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')).toEqual([
    { kind: 'walk', piece: 'w-k-e1', to: 'g1' },
    { kind: 'hop', piece: 'w-r-h1', to: 'f1' },
  ]);
});

test('queen-side castle for black', () => {
  expect(plan('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')).toEqual([
    { kind: 'walk', piece: 'b-k-e8', to: 'c8' },
    { kind: 'hop', piece: 'b-r-a8', to: 'd8' },
  ]);
});

test('promotion walks, then promotes', () => {
  expect(plan('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a8=N')).toEqual([
    { kind: 'walk', piece: 'w-p-a7', to: 'a8' },
    { kind: 'promote', piece: 'w-p-a7', to: 'n' },
  ]);
});

test('promotion with capture fights, walks, then promotes', () => {
  expect(plan('1r6/P7/8/8/8/8/8/k6K w - - 0 1', 'axb8=Q')).toEqual([
    { kind: 'combat', attacker: 'w-p-a7', defender: 'b-r-b8' },
    { kind: 'walk', piece: 'w-p-a7', to: 'b8' },
    { kind: 'promote', piece: 'w-p-a7', to: 'q' },
  ]);
});
```

Create `src/game/position.test.ts`:

```ts
import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { planMove } from './planMove';
import { applyStep, matchesBoard, piecesFromBoard } from './position';

test('starting position has 32 pieces with ids from their squares', () => {
  const pieces = piecesFromBoard(new Chess());
  expect(pieces).toHaveLength(32);
  expect(pieces).toContainEqual({ id: 'w-p-e2', type: 'p', color: 'w', square: 'e2' });
});

test('matchesBoard detects a difference', () => {
  const chess = new Chess();
  const pieces = piecesFromBoard(chess);
  expect(matchesBoard(pieces, chess)).toBe(true);
  expect(matchesBoard(pieces.slice(1), chess)).toBe(false);
});

// A game with both castles, en passant, captures and a capture-promotion.
const GAME =
  '1. e4 d5 2. e5 f5 3. exf6 Nc6 4. fxg7 Be6 5. gxh8=Q Qd7 6. Nf3 O-O-O 7. Be2 Nf6 8. O-O Bg7 9. Qxd8+ Kxd8';

test('step effects keep the pieces equal to chess.js through a whole game', () => {
  const chess = new Chess();
  let pieces = piecesFromBoard(chess);
  const sans = GAME.split(' ').filter((token) => !token.endsWith('.'));
  for (const san of sans) {
    const before = pieces;
    const move = chess.move(san);
    pieces = planMove(move, before).reduce(applyStep, before);
    expect(matchesBoard(pieces, chess), `after ${san}`).toBe(true);
  }
  // ids are stable: the e2 pawn promoted on h8 and was later captured on d8 by the king
  expect(pieces.some((p) => p.id === 'w-p-e2')).toBe(false);
  expect(pieces.find((p) => p.id === 'b-k-e8')?.square).toBe('d8');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/game
```

Expected: `planMove.test.ts` and `position.test.ts` FAIL, cannot resolve `./planMove` and `./position`. `squares.test.ts` still passes.

- [ ] **Step 3: Write the implementation**

Create `src/game/position.ts`:

```ts
import type { Chess } from 'chess.js';
import type { Piece, Step } from './types';

export function piecesFromBoard(chess: Chess): Piece[] {
  return chess
    .board()
    .flat()
    .filter((cell) => cell !== null)
    .map(({ square, type, color }) => ({ id: `${color}-${type}-${square}`, type, color, square }));
}

export function applyStep(pieces: Piece[], step: Step): Piece[] {
  switch (step.kind) {
    case 'walk':
    case 'hop':
      return pieces.map((p) => (p.id === step.piece ? { ...p, square: step.to } : p));
    case 'combat':
      return pieces.filter((p) => p.id !== step.defender);
    case 'promote':
      return pieces.map((p) => (p.id === step.piece ? { ...p, type: step.to } : p));
  }
}

const key = (p: Pick<Piece, 'square' | 'color' | 'type'>) => `${p.square}${p.color}${p.type}`;

export function matchesBoard(pieces: Piece[], chess: Chess): boolean {
  return pieces.map(key).sort().join() === piecesFromBoard(chess).map(key).sort().join();
}
```

Create `src/game/planMove.ts`:

```ts
import type { Move, Square } from 'chess.js';
import type { Piece, PieceId, PromotionPiece, Step } from './types';

/** Turns a chess.js move into animation steps. `pieces` is the position before the move. */
export function planMove(move: Move, pieces: Piece[]): Step[] {
  const at = (square: Square): PieceId => {
    const piece = pieces.find((p) => p.square === square);
    if (!piece) throw new Error(`planMove: no piece on ${square}`);
    return piece.id;
  };
  const mover = at(move.from);
  const rank = move.from[1];

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const [rookFrom, rookTo] = move.isKingsideCastle() ? ['h', 'f'] : ['a', 'd'];
    return [
      { kind: 'walk', piece: mover, to: move.to },
      // the rook hops because a straight walk would pass through the king
      { kind: 'hop', piece: at(`${rookFrom}${rank}` as Square), to: `${rookTo}${rank}` as Square },
    ];
  }

  const steps: Step[] = [];
  // `captured` rather than isCapture(): chess.js 1.4 reports isCapture() === false for en passant
  if (move.captured) {
    // en passant: the victim stands beside the target square, on the mover's rank
    const victim = move.isEnPassant() ? (`${move.to[0]}${rank}` as Square) : move.to;
    steps.push({ kind: 'combat', attacker: mover, defender: at(victim) });
    steps.push({ kind: 'walk', piece: mover, to: move.to });
  } else {
    steps.push(
      move.piece === 'n'
        ? { kind: 'hop', piece: mover, to: move.to }
        : { kind: 'walk', piece: mover, to: move.to },
    );
  }
  if (move.promotion) steps.push({ kind: 'promote', piece: mover, to: move.promotion as PromotionPiece });
  return steps;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/game
```

Expected: 14 tests pass across 3 files.

- [ ] **Step 5: Commit**

```bash
git add src/game/position.ts src/game/planMove.ts src/game/planMove.test.ts src/game/position.test.ts
```

```bash
git commit -m "feat: plan chess moves as animation steps"
```

---

### Task 4: Tweens and the sequencer

**Files:**
- Create: `src/scene/theme.ts`, `src/scene/tween.ts`, `src/scene/actors.ts`, `src/scene/sequencer.ts`
- Test: `src/scene/tween.test.ts`, `src/scene/sequencer.test.ts`

**Interfaces:**
- Consumes: `applyStep`, `piecesFromBoard` from `@/game/position`; `squareToWorld` from `@/game/squares`; `Piece`, `PieceId`, `Step` from `@/game/types`
- Produces:
  - `PALETTE`, `TEAM: { w: string; b: string }`, `TEAM_NAME: { w: 'Amber'; b: 'Teal' }`, `TIMING`, `STAND_OFF = 0.7`, `CAMERA`
  - `tween(ms: number, update: (t: number) => void): Promise<void>` — resolves after `update(1)`; applies the end state at once when `ms <= 0` or the user prefers reduced motion
  - `tickTweens(deltaMs: number): void` — call once per frame
  - `interface ActorHandle { moveTo(point: Vector3, mode: 'walk' | 'hop'): Promise<void>; face(point: Vector3): void; play(clip: 'attack' | 'die'): Promise<void> }`
  - `actors: Map<PieceId, ActorHandle>`
  - `runSteps(steps: Step[], deps: SequencerDeps): Promise<void>` where `SequencerDeps = { actors; getPieces(): Piece[]; setPieces(pieces: Piece[]): void; wait?(ms: number): Promise<void> }`

`runSteps` plays steps strictly in order. A step's effect on the pieces lands only after its animation has ended. A step whose actor is not mounted skips the animation and still applies the effect; this is what lets the store be tested without a canvas.

- [ ] **Step 1: Write the theme constants**

Create `src/scene/theme.ts`:

```ts
export const PALETTE = {
  lightTile: '#D9C7A3', // sandstone
  darkTile: '#3B4252', // slate
  base: '#5B4636', // walnut
  amber: '#D97706',
  teal: '#0F766E',
  steel: '#CBD5E1',
  gold: '#EAB308',
  wood: '#7C4A1E',
  cloth: '#F1F5F9',
  skin: '#E8B796',
  selected: '#FDE68A',
  lastMove: '#A3B18A',
  check: '#DC2626',
  marker: '#FDE68A',
  background: '#1C1917',
} as const;

export const TEAM = { w: PALETTE.amber, b: PALETTE.teal } as const;
export const TEAM_NAME = { w: 'Amber', b: 'Teal' } as const;

// Starting values, tuned by eye.
export const TIMING = {
  walkSquaresPerSec: 3,
  walkMinMs: 250,
  hopMs: 500,
  hopHeight: 0.6,
  attackMs: 700,
  impactAt: 0.6, // fraction of the attack clip at which the defender starts to fall
  dieMs: 700,
  promoteMs: 300,
  turnMs: 150,
} as const;

export const STAND_OFF = 0.7; // squares between attacker and defender during a fight

export const CAMERA = { position: [0, 8.5, 7.5] as [number, number, number], fov: 36 };
```

- [ ] **Step 2: Write the failing tests**

Create `src/scene/tween.test.ts`:

```ts
import { expect, test } from 'vitest';
import { tickTweens, tween } from './tween';

test('tween reports progress and resolves after the last tick', async () => {
  const seen: number[] = [];
  let done = false;
  const promise = tween(100, (t) => seen.push(t)).then(() => (done = true));

  tickTweens(50);
  await Promise.resolve();
  expect(seen).toEqual([0.5]);
  expect(done).toBe(false);

  tickTweens(80); // overshoots: clamps to 1
  await promise;
  expect(seen).toEqual([0.5, 1]);

  tickTweens(50); // finished tweens are gone
  expect(seen).toEqual([0.5, 1]);
});

test('zero duration applies the end state at once', async () => {
  const seen: number[] = [];
  await tween(0, (t) => seen.push(t));
  expect(seen).toEqual([1]);
});
```

Create `src/scene/sequencer.test.ts`:

```ts
import { Chess } from 'chess.js';
import { expect, test } from 'vitest';
import { piecesFromBoard } from '@/game/position';
import type { Piece, PieceId, Step } from '@/game/types';
import type { ActorHandle } from './actors';
import { runSteps } from './sequencer';

// Fake actors that record when each animation starts and ends.
function setup(fen: string) {
  const log: string[] = [];
  let pieces: Piece[] = piecesFromBoard(new Chess(fen));
  const actors = new Map<PieceId, ActorHandle>();
  for (const { id } of pieces) {
    const record = async (what: string) => {
      log.push(`${id} ${what} start`);
      await Promise.resolve();
      log.push(`${id} ${what} end`);
    };
    actors.set(id, {
      moveTo: (_point, mode) => record(mode),
      face: () => void log.push(`${id} face`),
      play: (clip) => record(clip),
    });
  }
  const deps = {
    actors,
    getPieces: () => pieces,
    setPieces: (next: Piece[]) => {
      pieces = next;
      log.push('effect');
    },
    wait: () => Promise.resolve(),
  };
  return { log, deps, pieces: () => pieces };
}

test('a capture runs approach, fight, removal, then step-in, in that order', async () => {
  const { log, deps, pieces } = setup('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const steps: Step[] = [
    { kind: 'combat', attacker: 'w-p-e4', defender: 'b-p-d5' },
    { kind: 'walk', piece: 'w-p-e4', to: 'd5' },
  ];

  await runSteps(steps, deps);

  const at = (entry: string) => log.indexOf(entry);
  const effects = log.flatMap((entry, i) => (entry === 'effect' ? [i] : []));
  expect(effects).toHaveLength(2);
  // approach, then face each other, then fight
  expect(log.slice(0, 5)).toEqual([
    'w-p-e4 walk start',
    'w-p-e4 walk end',
    'w-p-e4 face',
    'b-p-d5 face',
    'w-p-e4 attack start',
  ]);
  expect(at('b-p-d5 die start')).toBeGreaterThan(at('w-p-e4 attack start'));
  // the defender is removed only after both clips have ended
  expect(effects[0]).toBeGreaterThan(at('w-p-e4 attack end'));
  expect(effects[0]).toBeGreaterThan(at('b-p-d5 die end'));
  // then the attacker steps in, and its square updates last
  expect(log.slice(effects[0] + 1)).toEqual(['w-p-e4 walk start', 'w-p-e4 walk end', 'effect']);
  expect(pieces().some((p) => p.id === 'b-p-d5')).toBe(false);
  expect(pieces().find((p) => p.id === 'w-p-e4')?.square).toBe('d5');
});

test('a knight approaches its victim by hopping', async () => {
  const { log, deps } = setup('rnbqkbnr/ppp1pppp/8/3p4/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 2');
  await runSteps([{ kind: 'combat', attacker: 'w-n-c3', defender: 'b-p-d5' }], deps);
  expect(log[0]).toBe('w-n-c3 hop start');
});

test('steps still apply their effects when no actor is mounted', async () => {
  const { deps, pieces } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1');
  deps.actors.clear();
  await runSteps(
    [
      { kind: 'walk', piece: 'w-p-a7', to: 'a8' },
      { kind: 'promote', piece: 'w-p-a7', to: 'q' },
    ],
    deps,
  );
  expect(pieces().find((p) => p.id === 'w-p-a7')).toMatchObject({ square: 'a8', type: 'q' });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/scene
```

Expected: both files FAIL, cannot resolve `./tween` and `./sequencer`.

- [ ] **Step 4: Write the implementation**

Create `src/scene/tween.ts`:

```ts
interface Tween {
  elapsed: number;
  ms: number;
  update: (t: number) => void;
  resolve: () => void;
}

const active = new Set<Tween>();

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `update(t)` with t from 0 to 1 over `ms`, driven by tickTweens. Resolves after update(1). */
export function tween(ms: number, update: (t: number) => void): Promise<void> {
  if (ms <= 0 || reducedMotion()) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => active.add({ elapsed: 0, ms, update, resolve }));
}

/** Advance every running tween. Called once per frame from the scene. */
export function tickTweens(deltaMs: number): void {
  for (const tw of active) {
    tw.elapsed += deltaMs;
    const t = Math.min(1, tw.elapsed / tw.ms);
    tw.update(t);
    if (t === 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}
```

Create `src/scene/actors.ts`:

```ts
import type { Vector3 } from 'three';
import type { PieceId } from '@/game/types';

export interface ActorHandle {
  moveTo(point: Vector3, mode: 'walk' | 'hop'): Promise<void>;
  face(point: Vector3): void;
  play(clip: 'attack' | 'die'): Promise<void>;
}

/** Every mounted piece registers itself here so the sequencer can drive it. */
export const actors = new Map<PieceId, ActorHandle>();
```

Create `src/scene/sequencer.ts`:

```ts
import { applyStep } from '@/game/position';
import { squareToWorld } from '@/game/squares';
import type { Piece, PieceId, Step } from '@/game/types';
import type { ActorHandle } from './actors';
import { STAND_OFF, TIMING } from './theme';
import { tween } from './tween';

export interface SequencerDeps {
  actors: Map<PieceId, ActorHandle>;
  getPieces: () => Piece[];
  setPieces: (pieces: Piece[]) => void;
  wait?: (ms: number) => Promise<void>;
}

/** Plays steps one after another. Each step's effect lands after its animation ends. */
export async function runSteps(steps: Step[], deps: SequencerDeps): Promise<void> {
  for (const step of steps) {
    await animate(step, deps);
    deps.setPieces(applyStep(deps.getPieces(), step));
  }
}

async function animate(step: Step, { actors, getPieces, wait = (ms) => tween(ms, () => {}) }: SequencerDeps) {
  if (step.kind === 'walk' || step.kind === 'hop') {
    await actors.get(step.piece)?.moveTo(squareToWorld(step.to), step.kind);
    return;
  }
  if (step.kind === 'combat') {
    const attacker = actors.get(step.attacker);
    const defender = actors.get(step.defender);
    const attackerPiece = getPieces().find((p) => p.id === step.attacker);
    const defenderPiece = getPieces().find((p) => p.id === step.defender);
    if (!attacker || !defender || !attackerPiece || !defenderPiece) return;

    const origin = squareToWorld(attackerPiece.square);
    const target = squareToWorld(defenderPiece.square);
    const standOff = target.clone().add(origin.sub(target).normalize().multiplyScalar(STAND_OFF));

    await attacker.moveTo(standOff, attackerPiece.type === 'n' ? 'hop' : 'walk');
    attacker.face(target);
    defender.face(standOff);
    const attack = attacker.play('attack');
    await wait(TIMING.attackMs * TIMING.impactAt);
    await Promise.all([attack, defender.play('die')]);
  }
  // 'promote' has no sequenced animation: the piece pops when its type changes
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/scene
```

Expected: 5 tests pass across 2 files.

- [ ] **Step 6: Commit**

```bash
git add src/scene/theme.ts src/scene/tween.ts src/scene/actors.ts src/scene/sequencer.ts src/scene/tween.test.ts src/scene/sequencer.test.ts
```

```bash
git commit -m "feat: add tweens and the step sequencer"
```

---

### Task 5: Game store

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: `planMove` (Task 3); `matchesBoard`, `piecesFromBoard` (Task 3); `actors`, `runSteps`, `TEAM_NAME` (Task 4); `Piece`, `PromotionPiece` (Task 2)
- Produces: `useGame`, a Zustand hook whose state is:
  - `pieces: Piece[]`, `selected: Square | null`, `targets: Move[]`
  - `phase: 'idle' | 'animating' | 'promoting' | 'gameOver'`
  - `pendingPromotion: { from: Square; to: Square } | null`
  - `history: string[]` (SAN), `lastMove: { from: Square; to: Square } | null`
  - `turn: Color`, `inCheck: boolean`, `result: string | null`
  - `select(square: Square | null): void`
  - `submitMove(from: Square, to: Square, promotion?: PromotionPiece): Promise<void>`
  - `submitText(text: string): boolean` — SAN (`Nf3`) or coordinates (`g1f3`, `e7e8q`); returns `false` and changes nothing when the text is not a legal move
  - `choosePromotion(piece: PromotionPiece): void`, `cancelPromotion(): void`, `newGame(): void`

Result strings, exactly: `Checkmate — Amber wins`, `Checkmate — Teal wins`, `Draw — stalemate`, `Draw — insufficient material`, `Draw — threefold repetition`, `Draw — fifty-move rule`. The dash is an em dash.

- [ ] **Step 1: Write the failing test**

Create `src/state/store.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest';
import { useGame } from './store';

const game = () => useGame.getState();

beforeEach(() => game().newGame());

async function play(...moves: string[]) {
  for (const move of moves) {
    expect(game().submitText(move), move).toBe(true);
    await waitForIdle();
  }
}

async function waitForIdle() {
  while (game().phase === 'animating') await Promise.resolve();
}

test('selecting a piece lists its legal targets; selecting a target moves it', async () => {
  game().select('e2');
  expect(game().selected).toBe('e2');
  expect(game().targets.map((m) => m.to).sort()).toEqual(['e3', 'e4']);

  game().select('e4');
  expect(game().phase).toBe('animating'); // input is locked while the move plays
  game().select('d7');
  expect(game().selected).toBeNull();

  await waitForIdle();
  expect(game().phase).toBe('idle');
  expect(game().history).toEqual(['e4']);
  expect(game().lastMove).toEqual({ from: 'e2', to: 'e4' });
  expect(game().turn).toBe('b');
  expect(game().pieces.find((p) => p.id === 'w-p-e2')?.square).toBe('e4');
});

test('selecting an empty square or an opponent piece clears the selection', () => {
  game().select('e2');
  game().select('e7');
  expect(game().selected).toBeNull();
  game().select('e2');
  game().select('a5');
  expect(game().selected).toBeNull();
});

test('selecting another own piece moves the selection', () => {
  game().select('e2');
  game().select('g1');
  expect(game().selected).toBe('g1');
});

test('typed moves accept SAN and coordinates, and reject nonsense', async () => {
  await play('e4', 'e7e5', 'Nf3');
  expect(game().history).toEqual(['e4', 'e5', 'Nf3']);
  expect(game().submitText('Ke5')).toBe(false);
  expect(game().history).toHaveLength(3);
});

test('a promotion waits for the chooser', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  expect(game().phase).toBe('promoting');
  expect(game().pendingPromotion).toEqual({ from: 'b7', to: 'a8' });

  game().select('e2'); // ignored while promoting
  expect(game().selected).toBeNull();

  game().choosePromotion('n');
  await waitForIdle();
  expect(game().history.at(-1)).toBe('bxa8=N');
  expect(game().pieces.find((p) => p.square === 'a8')).toMatchObject({ id: 'w-p-a2', type: 'n' });
});

test('cancelling a promotion returns to idle without moving', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  game().cancelPromotion();
  expect(game().phase).toBe('idle');
  expect(game().history).toHaveLength(8);
});

test('checkmate ends the game and names the winner', async () => {
  await play('f3', 'e5', 'g4', 'Qh4#');
  expect(game().phase).toBe('gameOver');
  expect(game().result).toBe('Checkmate — Teal wins');
  expect(game().inCheck).toBe(true);
  game().select('e2'); // no input after the game ends
  expect(game().selected).toBeNull();
});

test('new game resets everything', async () => {
  await play('f3', 'e5', 'g4', 'Qh4');
  game().newGame();
  expect(game()).toMatchObject({ phase: 'idle', history: [], result: null, turn: 'w', lastMove: null });
  expect(game().pieces).toHaveLength(32);
});

test('stalemate is a draw', async () => {
  await play(
    'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6',
    'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
  );
  expect(game().phase).toBe('gameOver');
  expect(game().result).toBe('Draw — stalemate');
});

test('the view never drifts from chess.js through castles, en passant and promotion', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await play(
    'e4', 'd5', 'e5', 'f5', 'exf6', 'Nc6', 'fxg7', 'Be6', 'gxh8=Q', 'Qd7',
    'Nf3', 'O-O-O', 'Be2', 'Nf6', 'O-O', 'Bg7', 'Qxd8+', 'Kxd8',
  );
  expect(error).not.toHaveBeenCalled(); // the store logs an error whenever it has to resync
  expect(game().pieces).toHaveLength(27);
  error.mockRestore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/state
```

Expected: FAIL, cannot resolve `./store`.

- [ ] **Step 3: Write the implementation**

Create `src/state/store.ts`:

```ts
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { create } from 'zustand';
import { planMove } from '@/game/planMove';
import { matchesBoard, piecesFromBoard } from '@/game/position';
import type { Piece, PromotionPiece } from '@/game/types';
import { actors } from '@/scene/actors';
import { runSteps } from '@/scene/sequencer';
import { TEAM_NAME } from '@/scene/theme';

type Phase = 'idle' | 'animating' | 'promoting' | 'gameOver';

interface GameState {
  pieces: Piece[];
  selected: Square | null;
  targets: Move[]; // legal moves from the selected square
  phase: Phase;
  pendingPromotion: { from: Square; to: Square } | null;
  history: string[]; // SAN
  lastMove: { from: Square; to: Square } | null;
  turn: Color;
  inCheck: boolean;
  result: string | null;
  select(square: Square | null): void;
  submitMove(from: Square, to: Square, promotion?: PromotionPiece): Promise<void>;
  submitText(text: string): boolean;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  newGame(): void;
}

// chess.js is the single source of truth for rules and position.
const chess = new Chess();

function gameResult(): string | null {
  if (chess.isCheckmate()) return `Checkmate — ${TEAM_NAME[chess.turn() === 'w' ? 'b' : 'w']} wins`;
  if (chess.isStalemate()) return 'Draw — stalemate';
  if (chess.isInsufficientMaterial()) return 'Draw — insufficient material';
  if (chess.isThreefoldRepetition()) return 'Draw — threefold repetition';
  if (chess.isDrawByFiftyMoves()) return 'Draw — fifty-move rule';
  return null;
}

const fresh = () => ({
  pieces: piecesFromBoard(chess),
  selected: null,
  targets: [],
  phase: 'idle' as Phase,
  pendingPromotion: null,
  history: [],
  lastMove: null,
  turn: 'w' as Color,
  inCheck: false,
  result: null,
});

export const useGame = create<GameState>((set, get) => ({
  ...fresh(),

  select(square) {
    if (get().phase !== 'idle') return;
    const { selected, targets } = get();
    if (square && selected && targets.some((m) => m.to === square)) {
      if (targets.some((m) => m.to === square && m.promotion)) {
        set({ phase: 'promoting', pendingPromotion: { from: selected, to: square }, selected: null, targets: [] });
      } else {
        void get().submitMove(selected, square);
      }
      return;
    }
    // empty squares and the opponent's pieces have no legal moves, so they clear the selection
    const moves = square ? chess.moves({ square, verbose: true }) : [];
    set(moves.length ? { selected: square, targets: moves } : { selected: null, targets: [] });
  },

  async submitMove(from, to, promotion) {
    const { phase } = get();
    if (phase !== 'idle' && phase !== 'promoting') return;
    let move: Move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return; // illegal move: ignore
    }
    const steps = planMove(move, get().pieces);
    set({ phase: 'animating', selected: null, targets: [], pendingPromotion: null });
    await runSteps(steps, { actors, getPieces: () => get().pieces, setPieces: (pieces) => set({ pieces }) });
    if (!matchesBoard(get().pieces, chess)) {
      console.error('View out of sync with chess.js after', move.san, '— resyncing');
      set({ pieces: piecesFromBoard(chess) });
    }
    const result = gameResult();
    set({
      phase: result ? 'gameOver' : 'idle',
      history: chess.history(),
      lastMove: { from, to },
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      result,
    });
  },

  submitText(text) {
    if (get().phase !== 'idle') return false;
    const typed = text.trim();
    const bare = (san: string) => san.replace(/[+#]/g, '');
    const move = chess
      .moves({ verbose: true })
      .find((m) => bare(m.san) === bare(typed) || m.lan === typed.toLowerCase());
    if (!move) return false;
    void get().submitMove(move.from, move.to, move.promotion as PromotionPiece | undefined);
    return true;
  },

  choosePromotion(piece) {
    const pending = get().pendingPromotion;
    if (pending) void get().submitMove(pending.from, pending.to, piece);
  },

  cancelPromotion() {
    if (get().phase === 'promoting') set({ phase: 'idle', pendingPromotion: null });
  },

  newGame() {
    if (get().phase === 'animating') return;
    chess.reset();
    set(fresh());
  },
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run
```

Expected: 29 tests pass across 6 files.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
```

```bash
git commit -m "feat: add the game store"
```

---

### Task 6: Piece models

**Files:**
- Create: `src/scene/pieces/rig.ts`, `src/scene/pieces/parts.tsx`, `src/scene/pieces/Pawn.tsx`, `src/scene/pieces/Knight.tsx`, `src/scene/pieces/Bishop.tsx`, `src/scene/pieces/Rook.tsx`, `src/scene/pieces/Queen.tsx`, `src/scene/pieces/King.tsx`
- Test: `src/scene/pieces/rig.test.ts`

**Interfaces:**
- Consumes: `PALETTE` from `@/scene/theme` (Task 4)
- Produces:
  - `interface Rig { stride(phase: number): void; attack(t: number): void; die(t: number): void }`
  - `interface PieceModelProps { color: string; ref: Ref<Rig> }`
  - `keys(t: number, ...values: number[]): number`
  - Components `Pawn`, `Knight`, `Bishop`, `Rook`, `Queen`, `King`, each taking `PieceModelProps`

Every model faces `+z`, stands on `y = 0`, and exposes a `Rig` through its `ref` (React 19 passes `ref` as an ordinary prop; do not use `forwardRef`). Each `Rig` method sets a pose and nothing else: `attack(1)` and `stride(0)` must be the rest pose.

| Type | Design | Locomotion | Attack | Death |
|---|---|---|---|---|
| Pawn | Foot soldier, spear, round shield | Walk with a bob | Spear thrust | Falls backward |
| Knight | Mounted lancer | Pitches during the hop | Lance lunge | Rears, topples sideways |
| Bishop | Hooded cleric with a staff | Gliding sway | Overhead staff strike | Spins and collapses |
| Rook | Wheeled siege tower | Wheels turn | Rams forward | Tips over, top breaks off |
| Queen | Robed queen with a sceptre | Walk | Sceptre sweep | Crumples |
| King | Robed king with a sword | Walk | Sword slash | None (never captured) |

- [ ] **Step 1: Write the failing test**

Create `src/scene/pieces/rig.test.ts`:

```ts
import { expect, test } from 'vitest';
import { keys } from './rig';

test('keys interpolates through its keyframes', () => {
  expect(keys(0, 0, 1, 0)).toBe(0);
  expect(keys(0.25, 0, 1, 0)).toBe(0.5);
  expect(keys(0.5, 0, 1, 0)).toBe(1);
  expect(keys(1, 0, 1, 0)).toBe(0);
  expect(keys(1, 0, -1, 2, 5)).toBe(5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/scene/pieces
```

Expected: FAIL, cannot resolve `./rig`.

- [ ] **Step 3: Write the rig helper**

Create `src/scene/pieces/rig.ts`:

```ts
import type { Ref } from 'react';

/** What every piece model exposes so the actor can animate it. Each method sets a pose. */
export interface Rig {
  /** Locomotion pose. `phase` grows by 1 per square travelled; 0 is the rest pose. */
  stride(phase: number): void;
  /** Attack pose at progress t (0..1). Must be back at rest when t = 1. */
  attack(t: number): void;
  /** Death pose at progress t (0..1). t = 1 is the final pose; the piece is then removed. */
  die(t: number): void;
}

export interface PieceModelProps {
  color: string;
  ref: Ref<Rig>;
}

/** Linear interpolation through equally spaced keyframes: keys(0.5, 0, 1, 0) === 1. */
export function keys(t: number, ...values: number[]): number {
  const x = Math.min(Math.max(t, 0), 1) * (values.length - 1);
  const i = Math.min(Math.floor(x), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (x - i);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/scene/pieces
```

Expected: 1 test passes.

- [ ] **Step 5: Write the shared parts**

Create `src/scene/pieces/parts.tsx`:

```tsx
import type { ReactNode, Ref } from 'react';
import type { Group } from 'three';
import { PALETTE } from '../theme';

export const Team = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.8} />;
export const Steel = () => <meshStandardMaterial color={PALETTE.steel} metalness={0.7} roughness={0.3} />;
export const Gold = () => <meshStandardMaterial color={PALETTE.gold} metalness={0.8} roughness={0.3} />;
export const Wood = () => <meshStandardMaterial color={PALETTE.wood} roughness={0.9} />;
export const Cloth = () => <meshStandardMaterial color={PALETTE.cloth} roughness={0.9} />;
export const Skin = () => <meshStandardMaterial color={PALETTE.skin} roughness={0.8} />;

/** Shared body for bishop, queen and king: a robe, a collar, a head, a hat slot and one arm. */
export function Robed(props: {
  color: string;
  root: Ref<Group>;
  arm: Ref<Group>;
  height?: number;
  hat: ReactNode;
  held: ReactNode;
}) {
  const h = props.height ?? 1;
  return (
    <group ref={props.root}>
      <group scale={[1, h, 1]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <coneGeometry args={[0.28, 0.7, 10]} />
          <Team color={props.color} />
        </mesh>
        <mesh position={[0, 0.64, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.17, 0.08, 10]} />
          <Cloth />
        </mesh>
      </group>
      <mesh position={[0, 0.8 * h, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 10]} />
        <Skin />
      </mesh>
      <group position={[0, 0.8 * h + 0.13, 0]}>{props.hat}</group>
      <group ref={props.arm} position={[0.27, 0.45 * h, 0.05]}>
        {props.held}
      </group>
    </group>
  );
}
```

- [ ] **Step 6: Write the six models**

Create `src/scene/pieces/Pawn.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Foot soldier with a spear and a round shield. Faces +z. */
export function Pawn({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.06;
      root.current.rotation.z = Math.sin(phase * Math.PI * 2) * 0.06;
    },
    attack(t) {
      // spear thrust: lower the spear forward, jab, recover
      arm.current.rotation.x = keys(t, 0, 1.3, 1.3, 0);
      arm.current.position.z = keys(t, 0, -0.1, 0.3, 0);
    },
    die(t) {
      // falls backward
      root.current.rotation.x = -t * (Math.PI / 2);
      root.current.position.y = t * 0.12;
    },
  }));

  return (
    <group ref={root}>
      <RoundedBox args={[0.34, 0.4, 0.24]} radius={0.05} position={[0, 0.36, 0]} castShadow>
        <Steel />
      </RoundedBox>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <coneGeometry args={[0.06, 0.18, 6]} />
        <Team color={color} />
      </mesh>
      <mesh position={[-0.22, 0.38, 0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 12]} />
        <Team color={color} />
      </mesh>
      <group ref={arm} position={[0.24, 0.4, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 1, 6]} />
          <Wood />
        </mesh>
        <mesh position={[0, 0.77, 0]} castShadow>
          <coneGeometry args={[0.05, 0.16, 4]} />
          <Steel />
        </mesh>
      </group>
    </group>
  );
}
```

Create `src/scene/pieces/Knight.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Mounted lancer. Faces +z. */
export function Knight({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const lance = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // the actor supplies the hop arc; the horse pitches up, then down
      root.current.rotation.x = -Math.sin(phase * Math.PI * 2) * 0.2;
    },
    attack(t) {
      // lance lunge: couch the lance, charge half a step, pull back
      lance.current.rotation.x = keys(t, 0, 1.45, 1.45, 0);
      root.current.position.z = keys(t, 0, -0.1, 0.3, 0);
    },
    die(t) {
      // the horse rears, then topples sideways
      root.current.rotation.x = -keys(t, 0, 0.6, 0.3, 0);
      root.current.rotation.z = keys(t, 0, 0, 0.8, Math.PI / 2);
      root.current.position.y = keys(t, 0, 0.1, 0.15, 0.2);
    },
  }));

  const legs: [number, number][] = [
    [-0.1, 0.22],
    [0.1, 0.22],
    [-0.1, -0.22],
    [0.1, -0.22],
  ];

  return (
    <group ref={root}>
      {legs.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.14, z]} castShadow>
          <boxGeometry args={[0.07, 0.28, 0.07]} />
          <Wood />
        </mesh>
      ))}
      <RoundedBox args={[0.28, 0.26, 0.66]} radius={0.06} position={[0, 0.4, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.3, 0.1, 0.4]} radius={0.03} position={[0, 0.52, -0.02]} castShadow>
        <Team color={color} />
      </RoundedBox>
      <RoundedBox args={[0.14, 0.34, 0.16]} radius={0.04} position={[0, 0.62, 0.32]} rotation={[0.5, 0, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.13, 0.14, 0.3]} radius={0.04} position={[0, 0.78, 0.46]} castShadow>
        <Wood />
      </RoundedBox>
      <RoundedBox args={[0.26, 0.32, 0.2]} radius={0.05} position={[0, 0.74, -0.04]} castShadow>
        <Steel />
      </RoundedBox>
      <mesh position={[0, 1.02, -0.04]} castShadow>
        <sphereGeometry args={[0.14, 12, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0, 1.2, -0.04]} castShadow>
        <coneGeometry args={[0.05, 0.16, 6]} />
        <Team color={color} />
      </mesh>
      <group ref={lance} position={[0.2, 0.72, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.03, 1.3, 6]} />
          <Team color={color} />
        </mesh>
        <mesh position={[0, 1, 0]} castShadow>
          <coneGeometry args={[0.035, 0.14, 6]} />
          <Steel />
        </mesh>
      </group>
    </group>
  );
}
```

Create `src/scene/pieces/Bishop.tsx`:

```tsx
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Hooded cleric with a staff. Faces +z. */
export function Bishop({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // gliding walk: a slow sway, no bounce
      root.current.rotation.z = Math.sin(phase * Math.PI * 2) * 0.04;
    },
    attack(t) {
      // overhead strike: swing the staff back, bring it down, recover
      arm.current.rotation.x = keys(t, 0, -0.9, 1.5, 0);
      arm.current.position.y = 0.45 + keys(t, 0, 0.25, 0, 0);
    },
    die(t) {
      // spins and collapses
      root.current.rotation.y = t * Math.PI * 3;
      root.current.scale.y = 1 - t * 0.8;
    },
  }));

  return (
    <Robed
      color={color}
      root={root}
      arm={arm}
      hat={
        <mesh position={[0, 0.02, -0.02]} castShadow>
          <coneGeometry args={[0.17, 0.3, 10]} />
          <Team color={color} />
        </mesh>
      }
      held={
        <>
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 1.1, 6]} />
            <Wood />
          </mesh>
          <mesh position={[0, 0.7, 0]} castShadow>
            <sphereGeometry args={[0.07, 10, 8]} />
            <Gold />
          </mesh>
        </>
      }
    />
  );
}
```

Create `src/scene/pieces/Rook.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Steel, Team, Wood } from './parts';
import { keys, type PieceModelProps } from './rig';

const WHEELS: [number, number][] = [
  [-0.3, 0.2],
  [0.3, 0.2],
  [-0.3, -0.2],
  [0.3, -0.2],
];
const CRENELS: [number, number][] = [
  [-0.17, 0.17],
  [0.17, 0.17],
  [-0.17, -0.17],
  [0.17, -0.17],
];

/** Wheeled siege tower. Faces +z. */
export function Rook({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const wheels = useRef<Group>(null!);
  const top = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      // rolls: the wheels turn with the distance covered
      for (const wheel of wheels.current.children) wheel.rotation.x = phase * Math.PI * 2;
    },
    attack(t) {
      // rams forward: rock back, slam, recover
      root.current.position.z = keys(t, 0, -0.15, 0.4, 0);
      root.current.rotation.x = keys(t, 0, -0.1, 0.18, 0);
    },
    die(t) {
      // tips over and the top section breaks off
      root.current.rotation.z = keys(t, 0, 0.3, Math.PI / 2);
      root.current.position.y = t * 0.25;
      top.current.position.set(t * 0.2, 0.92 + Math.sin(t * Math.PI) * 0.4, -t * 0.35);
      top.current.rotation.x = -t * 2;
    },
  }));

  return (
    <group ref={root}>
      <group ref={wheels}>
        {WHEELS.map(([x, z]) => (
          // rotation.z lays the cylinder's axis along x, so rotation.x then spins it like a wheel
          <mesh key={`${x},${z}`} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
            <Wood />
          </mesh>
        ))}
      </group>
      <RoundedBox args={[0.5, 0.62, 0.5]} radius={0.04} position={[0, 0.5, 0]} castShadow>
        <Wood />
      </RoundedBox>
      <mesh position={[0, 0.5, 0.26]} castShadow>
        <boxGeometry args={[0.22, 0.44, 0.02]} />
        <Team color={color} />
      </mesh>
      <group ref={top} position={[0, 0.92, 0]}>
        <RoundedBox args={[0.58, 0.14, 0.58]} radius={0.03} castShadow>
          <Team color={color} />
        </RoundedBox>
        {CRENELS.map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, 0.13, z]} castShadow>
            <boxGeometry args={[0.16, 0.12, 0.16]} />
            <Steel />
          </mesh>
        ))}
      </group>
    </group>
  );
}
```

Create `src/scene/pieces/Queen.tsx`:

```tsx
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Team } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Robed queen with a sceptre. Faces +z. */
export function Queen({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.03;
    },
    attack(t) {
      // sceptre sweep: wind up to one side, sweep across, recover
      arm.current.rotation.x = keys(t, 0, 1.2, 1.2, 0);
      arm.current.rotation.y = keys(t, 0, -1.1, 1.1, 0);
    },
    die(t) {
      // crumples
      root.current.scale.y = 1 - t * 0.75;
      root.current.rotation.z = t * 0.35;
    },
  }));

  return (
    <Robed
      color={color}
      root={root}
      arm={arm}
      height={1.15}
      hat={
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.1, 0.12, 8]} />
          <Gold />
        </mesh>
      }
      held={
        <>
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
            <Gold />
          </mesh>
          <mesh position={[0, 0.56, 0]} castShadow>
            <octahedronGeometry args={[0.09]} />
            <Team color={color} />
          </mesh>
        </>
      }
    />
  );
}
```

Create `src/scene/pieces/King.tsx`:

```tsx
import { useImperativeHandle, useRef } from 'react';
import type { Group } from 'three';
import { Gold, Robed, Steel } from './parts';
import { keys, type PieceModelProps } from './rig';

/** Robed king with a sword. Faces +z. */
export function King({ color, ref }: PieceModelProps) {
  const root = useRef<Group>(null!);
  const arm = useRef<Group>(null!);

  useImperativeHandle(ref, () => ({
    stride(phase) {
      root.current.position.y = Math.abs(Math.sin(phase * Math.PI * 2)) * 0.03;
    },
    attack(t) {
      // sword slash: raise, cut down across the body, recover
      arm.current.rotation.x = keys(t, 0, -0.7, 1.5, 0);
      arm.current.rotation.z = keys(t, 0, -0.4, 0.5, 0);
    },
    die() {
      // a king is never captured
    },
  }));

  return (
    <Robed
      color={color}
      root={root}
      arm={arm}
      height={1.25}
      hat={
        <>
          <mesh position={[0, 0.04, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 0.12, 6]} />
            <Gold />
          </mesh>
          <mesh position={[0, 0.16, 0]} castShadow>
            <sphereGeometry args={[0.06, 8, 6]} />
            <Gold />
          </mesh>
        </>
      }
      held={
        <>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.06, 0.7, 0.02]} />
            <Steel />
          </mesh>
          <mesh position={[0, -0.04, 0]} castShadow>
            <boxGeometry args={[0.2, 0.04, 0.04]} />
            <Gold />
          </mesh>
        </>
      }
    />
  );
}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/scene/pieces
```

```bash
git commit -m "feat: add the six code-built piece models"
```

---

### Task 7: Scene, board and piece actors

**Files:**
- Create: `src/scene/Piece.tsx`, `src/scene/Board.tsx`, `src/scene/Scene.tsx`, `src/ui/Game.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 5); `actors`, `ActorHandle`, `tween`, `tickTweens`, `TEAM`, `TIMING`, `PALETTE`, `CAMERA` (Task 4); `Rig` and the six models (Task 6); `squareToWorld`, `SQUARES`, `isDark` (Task 2); `Piece` (Task 2)
- Produces:
  - `PieceActor({ piece }: { piece: Piece })` — registers an `ActorHandle` under `piece.id` while mounted
  - `Board()`
  - `Scene` — default export, client-only
  - `Game()` — the page body

How `PieceActor` behaves:

- It owns its world position imperatively. It never receives a `position` prop.
- When `piece.square` changes it snaps to that square and turns back to its home facing. After an animated move it is already there, so the snap is invisible; it matters on new game and resync.
- `moveTo` turns toward the target, then moves there. `hop` adds a sine arc of height `TIMING.hopHeight`.
- First army (`w`) home facing is `rotation.y = Math.PI`; second army (`b`) is `0`.
- Clicking a piece calls `select(piece.square)`. That one call covers both selecting your own piece and capturing an enemy piece on a highlighted square.

- [ ] **Step 1: Write the piece actor**

Create `src/scene/Piece.tsx`:

```tsx
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Group, Vector3 } from 'three';
import { squareToWorld } from '@/game/squares';
import type { Piece } from '@/game/types';
import { useGame } from '@/state/store';
import { actors, type ActorHandle } from './actors';
import { Bishop } from './pieces/Bishop';
import { King } from './pieces/King';
import { Knight } from './pieces/Knight';
import { Pawn } from './pieces/Pawn';
import { Queen } from './pieces/Queen';
import type { Rig } from './pieces/rig';
import { Rook } from './pieces/Rook';
import { TEAM, TIMING } from './theme';
import { tween } from './tween';

const MODELS = { p: Pawn, n: Knight, b: Bishop, r: Rook, q: Queen, k: King };

/** One piece on the board. Owns its position and facing, and registers itself as an actor. */
export function PieceActor({ piece }: { piece: Piece }) {
  const group = useRef<Group>(null!); // position and facing
  const model = useRef<Group>(null!); // promotion pop and idle breathing
  const rig = useRef<Rig>(null!);
  const select = useGame((s) => s.select);
  const home = piece.color === 'w' ? Math.PI : 0; // models face +z; the first army faces -z

  // The refs are null once the piece is unmounted, so every tween callback guards against that.
  const turnTo = (angle: number) => {
    const from = group.current.rotation.y;
    const delta = Math.atan2(Math.sin(angle - from), Math.cos(angle - from)); // shortest way round
    void tween(TIMING.turnMs, (t) => {
      if (group.current) group.current.rotation.y = from + delta * t;
    });
  };
  const angleTo = (point: Vector3) =>
    Math.atan2(point.x - group.current.position.x, point.z - group.current.position.z);

  useEffect(() => {
    const handle: ActorHandle = {
      face: (point) => turnTo(angleTo(point)),
      async moveTo(point, mode) {
        const from = group.current.position.clone();
        const distance = from.distanceTo(point);
        if (distance < 1e-3) return;
        turnTo(angleTo(point));
        const ms =
          mode === 'hop' ? TIMING.hopMs : Math.max(TIMING.walkMinMs, (distance / TIMING.walkSquaresPerSec) * 1000);
        await tween(ms, (t) => {
          if (!group.current) return;
          group.current.position.lerpVectors(from, point, t);
          if (mode === 'hop') group.current.position.y = Math.sin(t * Math.PI) * TIMING.hopHeight;
          rig.current?.stride(t === 1 ? 0 : t * distance);
        });
      },
      play: (clip) =>
        tween(clip === 'attack' ? TIMING.attackMs : TIMING.dieMs, (t) => rig.current?.[clip](t)),
    };
    actors.set(piece.id, handle);
    return () => void actors.delete(piece.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handle only reads refs
  }, [piece.id]);

  // Snap to the square whenever it changes. After an animated move the piece is already there,
  // so this only shows on a new game or a resync. Then turn back to the home facing.
  useLayoutEffect(() => {
    group.current.position.copy(squareToWorld(piece.square));
    turnTo(home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.square]);

  // Promotion: pop when the type changes (not on first mount).
  const shownType = useRef(piece.type);
  useEffect(() => {
    if (shownType.current === piece.type) return;
    shownType.current = piece.type;
    void tween(TIMING.promoteMs, (t) => model.current?.scale.setScalar(0.4 + 0.6 * t));
  }, [piece.type]);

  // Idle: a slight breathing motion, offset per piece so the ranks do not move in unison.
  const offset = piece.id.charCodeAt(4) * 1.7 + piece.id.charCodeAt(5);
  useFrame(({ clock }) => {
    const m = model.current;
    m.scale.y = m.scale.x * (1 + Math.sin(clock.elapsedTime * 2 + offset) * 0.015);
  });

  const Model = MODELS[piece.type];
  return (
    <group
      ref={group}
      rotation-y={home}
      onClick={(event) => {
        event.stopPropagation();
        select(piece.square);
      }}
    >
      <group ref={model}>
        <Model ref={rig} color={TEAM[piece.color]} />
      </group>
    </group>
  );
}
```

- [ ] **Step 2: Write the board**

Create `src/scene/Board.tsx`:

```tsx
import { RoundedBox } from '@react-three/drei';
import { isDark, SQUARES, squareToWorld } from '@/game/squares';
import { useGame } from '@/state/store';
import { PALETTE } from './theme';

export function Board() {
  const select = useGame((s) => s.select);
  const selected = useGame((s) => s.selected);
  const targets = useGame((s) => s.targets);
  const lastMove = useGame((s) => s.lastMove);
  const checked = useGame((s) =>
    s.inCheck ? (s.pieces.find((p) => p.type === 'k' && p.color === s.turn)?.square ?? null) : null,
  );

  return (
    <group>
      <RoundedBox args={[8.6, 0.4, 8.6]} radius={0.08} position={[0, -0.3, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.base} roughness={0.7} />
      </RoundedBox>

      {SQUARES.map((square) => {
        const { x, z } = squareToWorld(square);
        const dark = isDark(square);
        const color =
          square === checked
            ? PALETTE.check
            : square === selected
              ? PALETTE.selected
              : square === lastMove?.from || square === lastMove?.to
                ? PALETTE.lastMove
                : dark
                  ? PALETTE.darkTile
                  : PALETTE.lightTile;
        return (
          // tile tops sit at y = 0 (light) and y = -0.02 (dark) so the seams catch the light
          <RoundedBox
            key={square}
            args={[0.98, 0.12, 0.98]}
            radius={0.02}
            position={[x, dark ? -0.08 : -0.06, z]}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              select(square);
            }}
          >
            <meshStandardMaterial color={color} roughness={dark ? 0.85 : 0.5} />
          </RoundedBox>
        );
      })}

      {targets.map((move) => {
        const { x, z } = squareToWorld(move.to);
        return (
          // a ring marks a capture, a dot marks a quiet move; promotions list one move per piece
          <mesh key={move.san} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
            {move.captured ? <ringGeometry args={[0.36, 0.44, 24]} /> : <circleGeometry args={[0.14, 20]} />}
            <meshBasicMaterial color={PALETTE.marker} transparent opacity={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}
```

- [ ] **Step 3: Write the scene**

Create `src/scene/Scene.tsx`:

```tsx
'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useState } from 'react';
import { useGame } from '@/state/store';
import { Board } from './Board';
import { PieceActor } from './Piece';
import { CAMERA, PALETTE } from './theme';
import { tickTweens } from './tween';

function TweenTicker() {
  useFrame((_, delta) => tickTweens(delta * 1000));
  return null;
}

function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Loaded with ssr: false, so `document` is always available here. */
export default function Scene() {
  const pieces = useGame((s) => s.pieces);
  const select = useGame((s) => s.select);
  const [webgl] = useState(hasWebGL);

  if (!webgl) {
    return (
      <p role="alert" className="p-8 text-center text-stone-200">
        This game needs WebGL 2, which this browser or device does not provide. You can still follow and
        enter moves in the panel.
      </p>
    );
  }

  return (
    <Canvas shadows camera={CAMERA} onPointerMissed={() => select(null)}>
      <color attach="background" args={[PALETTE.background]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
      <TweenTicker />
      <Board />
      {pieces.map((piece) => (
        <PieceActor key={piece.id} piece={piece} />
      ))}
      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={13}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minAzimuthAngle={-Math.PI / 6}
        maxAzimuthAngle={Math.PI / 6}
      />
    </Canvas>
  );
}
```

- [ ] **Step 4: Write the page body and mount it**

Create `src/ui/Game.tsx`. Task 8 adds the HUD and dialogs to this file.

```tsx
'use client';

import dynamic from 'next/dynamic';

// The 3D scene needs the browser, so it is never rendered on the server.
const Scene = dynamic(() => import('@/scene/Scene'), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-400">Loading the board…</p>,
});

export function Game() {
  return (
    <main className="flex h-dvh flex-col bg-stone-950 md:flex-row">
      <div className="min-h-0 flex-1">
        <Scene />
      </div>
    </main>
  );
}
```

Replace `src/app/page.tsx` with:

```tsx
import { Game } from '@/ui/Game';

export default function Page() {
  return <Game />;
}
```

- [ ] **Step 5: Type-check and test**

```bash
npx tsc --noEmit
```

Expected: no output.

```bash
npx vitest run
```

Expected: 30 tests pass across 7 files.

- [ ] **Step 6: Check it in the browser**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm each of these. Fix what fails before committing.

1. The board shows 64 tiles with `a1` dark at the front left, amber pieces on the near two ranks facing away from the camera, teal on the far two ranks facing the camera.
2. Every piece type is recognisable and stands on its tile, not inside or above it.
3. Clicking the amber `e2` pawn highlights its square and shows dots on `e3` and `e4`. Clicking `e4` walks the pawn there, and the two squares of the move stay tinted.
4. Clicking `g8` then `f6` makes the teal knight hop in an arc.
5. Play `e4`, `d5`, then capture `exd5` by clicking the teal pawn: the amber pawn stops short, both face each other, the spear thrusts, the teal pawn falls and disappears, and the amber pawn steps onto `d5`.
6. Clicking during an animation does nothing.
7. Dragging orbits a little, the wheel zooms, and neither can turn the board around.
8. The browser console shows no errors and no "out of sync" message.

A promotion will lock input at this point because the chooser arrives in Task 8. That is expected.

- [ ] **Step 7: Commit**

```bash
git add src/scene/Piece.tsx src/scene/Board.tsx src/scene/Scene.tsx src/ui/Game.tsx src/app/page.tsx
```

```bash
git commit -m "feat: render the board and animate moves and captures"
```

---

### Task 8: HUD, promotion chooser and game-over dialog

**Files:**
- Create: `src/ui/Modal.tsx`, `src/ui/Hud.tsx`, `src/ui/PromotionChooser.tsx`, `src/ui/GameOverModal.tsx`
- Modify: `src/ui/Game.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 5): `turn`, `inCheck`, `history`, `phase`, `result`, `submitText`, `newGame`, `choosePromotion`, `cancelPromotion`; `TEAM_NAME` (Task 4); `PromotionPiece` (Task 2)
- Produces: `Modal({ label, onCancel, children })`, `Hud()`, `PromotionChooser()`, `GameOverModal()`

Accessibility requirements these files meet, and which must survive any restyling:

- Dialogs are native modal `<dialog>` elements opened with `showModal()`, so the browser traps focus and Escape works. Escape cancels a promotion and hides the game-over dialog.
- The first button in each dialog takes focus.
- Each move and the final result are announced through an `aria-live="polite"` region.
- The move field has a visible label; an invalid move is reported in a `role="alert"` paragraph tied to the field with `aria-describedby`.

- [ ] **Step 1: Write the modal wrapper**

Create `src/ui/Modal.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';

/** A native modal <dialog>: the browser traps focus and reports Escape through onCancel. */
export function Modal(props: { label: string; onCancel: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      aria-label={props.label}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      className="m-auto rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl backdrop:bg-black/50"
    >
      {props.children}
    </dialog>
  );
}
```

- [ ] **Step 2: Write the promotion chooser**

Create `src/ui/PromotionChooser.tsx`:

```tsx
'use client';

import type { PromotionPiece } from '@/game/types';
import { useGame } from '@/state/store';
import { Modal } from './Modal';

const CHOICES: [PromotionPiece, string][] = [
  ['q', 'Queen'],
  ['r', 'Rook'],
  ['b', 'Bishop'],
  ['n', 'Knight'],
];

export function PromotionChooser() {
  const promoting = useGame((s) => s.phase === 'promoting');
  const choose = useGame((s) => s.choosePromotion);
  const cancel = useGame((s) => s.cancelPromotion);
  if (!promoting) return null;

  return (
    <Modal label="Choose a piece to promote to" onCancel={cancel}>
      <h2 className="mb-4 text-lg font-semibold">Promote to</h2>
      <div className="flex gap-2">
        {CHOICES.map(([piece, name], i) => (
          <button
            key={piece}
            autoFocus={i === 0}
            onClick={() => choose(piece)}
            className="rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
          >
            {name}
          </button>
        ))}
        <button onClick={cancel} className="rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Write the game-over dialog**

Create `src/ui/GameOverModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useGame } from '@/state/store';
import { Modal } from './Modal';

export function GameOverModal() {
  const result = useGame((s) => s.result);
  const newGame = useGame((s) => s.newGame);
  // Closing only hides the dialog so the final position can be studied. The key on the inner
  // component resets `closed` for the next game.
  return result ? <Dialog key={result} result={result} newGame={newGame} /> : null;
}

function Dialog({ result, newGame }: { result: string; newGame: () => void }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <Modal label="Game over" onCancel={() => setClosed(true)}>
      <h2 className="mb-4 text-lg font-semibold">{result}</h2>
      <div className="flex gap-2">
        <button autoFocus onClick={newGame} className="rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500">
          New game
        </button>
        <button onClick={() => setClosed(true)} className="rounded-lg px-4 py-2 text-stone-300 hover:bg-stone-800">
          View board
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Write the HUD**

Create `src/ui/Hud.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { TEAM_NAME } from '@/scene/theme';
import { useGame } from '@/state/store';

export function Hud() {
  const turn = useGame((s) => s.turn);
  const inCheck = useGame((s) => s.inCheck);
  const history = useGame((s) => s.history);
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const submitText = useGame((s) => s.submitText);
  const newGame = useGame((s) => s.newGame);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitText(text)) {
      setText('');
      setError('');
    } else {
      setError(`"${text}" is not a legal move here. Try a move like Nf3 or g1f3.`);
    }
  }

  const rows = [];
  for (let i = 0; i < history.length; i += 2) rows.push(history.slice(i, i + 2));
  const mover = TEAM_NAME[turn === 'w' ? 'b' : 'w']; // who made the latest move

  return (
    <aside className="flex w-full flex-col gap-4 bg-stone-900 p-4 text-stone-100 md:w-72">
      <h1 className="text-xl font-bold">Chess</h1>

      <p className="text-lg">
        {result ?? `${TEAM_NAME[turn]} to move`}
        {!result && inCheck && <span className="ml-2 font-semibold text-red-400">Check</span>}
      </p>

      <p aria-live="polite" className="sr-only">
        {history.length > 0 && `${mover} played ${history.at(-1)}.`} {result}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-1">
        <label htmlFor="move" className="text-sm text-stone-300">
          Type a move
        </label>
        <div className="flex gap-2">
          <input
            id="move"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={phase !== 'idle'}
            autoComplete="off"
            aria-describedby={error ? 'move-error' : undefined}
            aria-invalid={error ? true : undefined}
            placeholder="Nf3 or g1f3"
            className="min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 disabled:opacity-50"
          />
          <button
            disabled={phase !== 'idle'}
            className="rounded-lg bg-amber-600 px-3 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
          >
            Move
          </button>
        </div>
        {error && (
          <p id="move-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      <ol aria-label="Moves" className="min-h-24 flex-1 overflow-y-auto font-mono text-sm">
        {rows.map(([first, second], i) => (
          <li key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-2 py-0.5">
            <span className="text-stone-500">{i + 1}.</span>
            <span>{first}</span>
            <span>{second}</span>
          </li>
        ))}
      </ol>

      <button
        onClick={newGame}
        disabled={phase === 'animating'}
        className="rounded-lg border border-stone-600 px-3 py-2 hover:bg-stone-800 disabled:opacity-50"
      >
        New game
      </button>
    </aside>
  );
}
```

- [ ] **Step 5: Mount them**

Replace `src/ui/Game.tsx` with:

```tsx
'use client';

import dynamic from 'next/dynamic';
import { GameOverModal } from './GameOverModal';
import { Hud } from './Hud';
import { PromotionChooser } from './PromotionChooser';

// The 3D scene needs the browser, so it is never rendered on the server.
const Scene = dynamic(() => import('@/scene/Scene'), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-stone-400">Loading the board…</p>,
});

export function Game() {
  return (
    <main className="flex h-dvh flex-col bg-stone-950 md:flex-row">
      <div className="min-h-0 flex-1">
        <Scene />
      </div>
      <Hud />
      <PromotionChooser />
      <GameOverModal />
    </main>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Check it in the browser**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm:

1. The panel shows "Amber to move". After a move it shows "Teal to move" and the move appears in the list.
2. Typing `e4` then Enter plays the move. Typing `Ke5` shows the error message under the field and nothing moves.
3. Type these one at a time: `a4`, `b5`, `axb5`, `a6`, `bxa6`, `Bb7`, `axb7`, `Nc6`. Then click the `b7` pawn and the `a8` rook. The pawn must not move yet; the chooser opens with "Queen" focused. Press Escape: the chooser closes and the pawn can be selected again. Repeat and pick "Knight": the pawn fights the rook, steps onto `a8` and becomes a knight.
4. Start a new game and type `e4`, `e5`, `Bc4`, `Nc6`, `Qh5`, `Nf6`, `Qxf7#`. The dialog says "Checkmate — Amber wins" and the king's square is red. "View board" hides the dialog; the panel still shows the result. "New game" resets the board.
5. The "New game" button and the move field are disabled while a move is animating.

- [ ] **Step 8: Commit**

```bash
git add src/ui
```

```bash
git commit -m "feat: add HUD, promotion chooser and game-over dialog"
```

---

### Task 9: Full verification

**Files:**
- Modify: only what the checks below show to be wrong

**Interfaces:**
- Consumes: the whole application
- Produces: a build that meets every item in the spec's "Done when" list

- [ ] **Step 1: Run the automated checks**

```bash
npm test
```

Expected: 30 tests pass across 7 files.

```bash
npx tsc --noEmit
```

Expected: no output.

```bash
npm run lint
```

Expected: no errors. The two `eslint-disable-next-line react-hooks/exhaustive-deps` comments in `src/scene/Piece.tsx` are intentional: those effects must re-run only when the id or square changes. If lint reports anything else, fix the reported line without changing behaviour and rerun all three commands.

```bash
npm run build
```

Expected: the build completes and lists the `/` route.

- [ ] **Step 2: Play the special moves**

```bash
npm run dev
```

Type each sequence into the move field on a new game and watch the last move.

| Sequence | The last move must show |
|---|---|
| `e4 a6 e5 d5 exd6` | En passant: the amber pawn fights the pawn on `d5` (beside its target), then steps diagonally onto `d6` |
| `e4 e5 Nf3 Nc6 Bc4 Bc5 O-O` | King-side castle: the king walks to `g1`, then the siege tower hops over it to `f1` |
| `e4 e5 Nf3 Nc6 Bc4 Bc5 O-O d6 d3 Be6 Nc3 Qd7 a3 O-O-O` | Queen-side castle for teal: the king walks to `c8`, the tower hops to `d8` |
| `e4 d5 exd5 Qxd5 Nc3 Qxg2 Bxg2` | Four captures in a row: pawn, queen, queen and bishop attack clips; three pawn deaths, then a queen death |
| `Nc3 d5 Nxd5` | The knight hops to the stand-off point, lunges, then steps in |
| `a4 b5 axb5 a6 bxa6 Bb7 axb7 Nc6 bxa8=Q` | Capture-promotion typed in full: fight, step in, the pawn becomes a queen |

After each sequence the browser console must show no errors and no "out of sync" message.

- [ ] **Step 3: Keyboard-only game**

Reload the page and do not touch the mouse. Tab to the move field, play `f3`, `e5`, `g4`, `Qh4#`. The game-over dialog must take focus; Enter on "New game" must start a new game.

- [ ] **Step 4: Reduced motion**

Turn on the operating system's "Reduce motion" setting (or emulate `prefers-reduced-motion: reduce` in the browser's dev tools) and reload. Moves and captures must apply instantly with no animation, and the game must stay fully playable.

- [ ] **Step 5: Judge the look and tune**

Play ten moves at the default camera and answer:

1. Can each of the six piece types be told apart at a glance from the default camera?
2. Does any piece sink into its tile, float above it, or reach into a neighbouring square while idle?
3. Does a walk across the whole board feel neither sluggish nor abrupt?
4. Does the defender start to fall at the moment the attack lands?

Adjust only the numbers in `src/scene/theme.ts` (`TIMING`, `STAND_OFF`) and the geometry numbers inside `src/scene/pieces/*.tsx`. Do not change any interface. Rerun `npm test` and `npx tsc --noEmit` afterwards.

- [ ] **Step 6: Commit**

```bash
git add src
```

```bash
git commit -m "chore: tune timings and proportions after full verification"
```

If Step 1 to Step 5 required no changes, skip this commit.
