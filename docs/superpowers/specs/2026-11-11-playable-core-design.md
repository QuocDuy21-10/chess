# 3D Combat Chess — Sub-project 1: Playable Core

Date: 2026-11-11
Status: awaiting review

## Goal

A 3D stylized chess game in the browser where two players share one screen,
every legal chess move is animated, and every capture plays a short fight
between the two pieces.

This is the first of five sub-projects. It must be fully playable on its own
and leave clean seams for the later ones.

## Originality constraint

The game belongs to the "chess with combat cutscenes" genre. It has its own
piece designs, palette and fight choreography. `roadmap.md`, `design-3D.md`,
`3D-Stylized.md` and `chess.jpeg` are background reading for the technical
approach only. No name, character design, heraldry, palette or signature gag
is taken from an existing game.

## Decisions already made

| Question | Decision |
|---|---|
| Piece assets | Built from primitives in code, animated in code. No `.glb` files. |
| Theme | Medieval fantasy army of our own design. |
| Game mode | Two players on one screen. No computer opponent. |
| Move orchestration | One async sequencer plus a Zustand store. No XState. |

## Stack

- Next.js (App Router), one client-rendered page
- TypeScript, Tailwind CSS
- `three`, `@react-three/fiber`, `@react-three/drei`
- `chess.js` for all rules
- `zustand` for state
- `vitest` for tests

Exact versions are fixed at scaffold time, after confirming that the current
Next.js, React and React Three Fiber releases work together. The `chess.js`
API named below (`moves({ square, verbose: true })`, `move()`, the `flags`
string on a move) is checked against the installed version at the same time.

## Architecture

`chess.js` is the single source of truth for rules and position. The 3D view
is a follower: a move is applied to `chess.js` first, then translated into a
list of animation steps, then played while input is locked.

```
click / typed move
      │
      ▼
   store.submitMove(from, to, promotion?)
      │  chess.move()  → Move (with flags)
      ▼
   planMove(move, pieces) → Step[]          pure, no React, no three
      │
      ▼
   sequencer.run(steps)                     awaits each actor promise
      │  after each step: apply its effect to store.pieces
      ▼
   phase = idle | gameOver
```

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `game/types.ts` | `Piece`, `PieceId`, `Step` | — |
| `game/squares.ts` | Square ↔ world coordinates | — |
| `game/planMove.ts` | `Move` + current pieces → `Step[]` | `chess.js` types |
| `state/store.ts` | Game state and the `submitMove` action | `chess.js`, `planMove`, sequencer |
| `scene/tween.ts` | `tween(ms, onUpdate): Promise<void>`, ticked from one `useFrame` | R3F |
| `scene/actors.ts` | Registry `Map<PieceId, ActorHandle>` | — |
| `scene/sequencer.ts` | Runs `Step[]` in order against actors, applies effects | actors, store |
| `scene/Board.tsx` | Tiles, click handling, highlights | store |
| `scene/Piece.tsx` | One actor per piece: position, facing, clip dispatch | tween, actors |
| `scene/pieces/*.tsx` | Geometry and clips for each of the six types | theme |
| `scene/Scene.tsx` | Canvas, camera, lights | — |
| `scene/theme.ts` | Palette and timing constants | — |
| `ui/Hud.tsx`, `ui/PromotionChooser.tsx`, `ui/GameOverModal.tsx` | DOM interface | store |

`app/page.tsx` mounts the scene and HUD.

### Types

```ts
type PieceId = string;              // from the starting square, e.g. "w-p-e2"; never changes

interface Piece {
  id: PieceId;
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
  square: Square;
}

type Step =
  | { kind: 'walk';    piece: PieceId; to: Square }
  | { kind: 'hop';     piece: PieceId; to: Square }
  | { kind: 'combat';  attacker: PieceId; defender: PieceId }
  | { kind: 'promote'; piece: PieceId; to: 'n' | 'b' | 'r' | 'q' };

interface ActorHandle {
  moveTo(point: Vector3, mode: 'walk' | 'hop'): Promise<void>;
  face(point: Vector3): void;
  play(clip: 'attack' | 'die'): Promise<void>;
}
```

### `planMove` rules

`planMove(move, pieces)` receives the `chess.js` move object and the pieces as
they stood before the move. Steps run strictly in sequence.

| Move | Steps |
|---|---|
| Quiet move, pawn/bishop/rook/queen/king | `walk` to target |
| Quiet move, knight | `hop` to target |
| Capture | `combat` with the piece on the target square, then `walk` to target |
| En passant | `combat` with the pawn beside the target square, then `walk` to target |
| Castling | king `walk` two squares, then rook `hop` over the king |
| Promotion | the quiet or capture steps above, then `promote` |

The rook hops during castling because a straight walk would pass through the
king. This is the one place a rook hops.

### Step execution and effects

| Step | Animation | Effect on `store.pieces` when it finishes |
|---|---|---|
| `walk` | Actor faces the target and moves in a straight line | `square = to` |
| `hop` | Actor moves along an arc | `square = to` |
| `combat` | Attacker moves, by its own locomotion, to a point 0.7 squares short of the defender on the line from its origin; both face each other; attacker plays `attack`; defender plays `die` | defender removed |
| `promote` | Short scale pop, model swaps | `type = to` |

After the last step, a development-only check compares `store.pieces` with
`chess.board()`. On mismatch it logs an error and rebuilds `store.pieces` from
`chess.board()` so the game stays playable.

### Store

```ts
interface GameState {
  pieces: Piece[];
  selected: Square | null;
  targets: Move[];                  // legal moves from the selected square
  phase: 'idle' | 'animating' | 'promoting' | 'gameOver';
  pendingPromotion: { from: Square; to: Square } | null;
  history: string[];                // SAN
  lastMove: { from: Square; to: Square } | null;
  result: string | null;            // e.g. "Checkmate — amber wins"
  select(square: Square | null): void;
  submitMove(from: Square, to: Square, promotion?: PieceSymbol): Promise<void>;
  newGame(): void;
}
```

All input is ignored unless `phase === 'idle'`, except the promotion chooser,
which is the only input accepted while `phase === 'promoting'`.

## Behaviour

### Input

- Click a piece of the side to move: it is selected and its legal targets
  light up.
- Click a legal target: the move is submitted.
- Click another own piece: selection moves to it.
- Click anywhere else: selection clears.
- If the chosen move is a promotion, `phase` becomes `promoting` and the
  chooser appears. Picking a piece submits the move.
- A text field in the HUD accepts a move in SAN (`Nf3`) or coordinate form
  (`g1f3`). It makes the game playable from the keyboard and doubles as a test
  hook. Invalid input shows an inline message and changes nothing.

### Highlights

Selected square, legal targets (dot for a quiet move, ring for a capture),
the last move's two squares, and a tint on a king in check.

### Movement and combat

- Sliding pieces and pawns walk in a straight line; no legal path is blocked.
- The knight hops in an arc.
- Capture choreography is generic in this sub-project: the attacker's clip and
  the defender's clip are chosen by piece type alone.
- Idle pieces play a subtle loop so the board feels alive.

### Timing

Constants in `scene/theme.ts`, tuned by eye:

| Constant | Starting value |
|---|---|
| Walk speed | 3 squares per second, minimum 250 ms |
| Hop duration | 500 ms |
| Attack clip | 700 ms |
| Death clip | 700 ms |
| Promotion pop | 300 ms |

With `prefers-reduced-motion`, all durations are zero: steps apply instantly.

### Game end

After each move the store asks `chess.js` for checkmate, stalemate,
insufficient material, threefold repetition and the fifty-move rule. Any of
them sets `phase = 'gameOver'` and opens the modal with the result and a
"New game" button. There is no special checkmate animation.

### HUD

Side to move, check indicator, move list in SAN, the move text field and a
"New game" button. Moves are announced through an `aria-live` region. The
promotion chooser and game-over modal are keyboard-operable.

## Visual design

### Board

- Square to world: `x = file − 3.5`, `z = 3.5 − rank` with file and rank as
  0–7 indices. The first player's side is nearest the camera.
- 64 rounded tiles on a thick rounded base. Light and dark tiles differ in
  height by 0.02 so the seams catch light.
- Camera: perspective, position `[0, 8.5, 7.5]`, field of view 36°, looking at
  the origin. Orbit is limited to a narrow polar range and a distance of 5–13;
  panning is off. The board never flips.
- Lighting: one ambient light and one shadow-casting directional light.

### Palette

| Role | Colour |
|---|---|
| Light tile | sandstone `#D9C7A3` |
| Dark tile | slate `#3B4252` |
| Board base | walnut `#5B4636` |
| First army (`chess.js` white, moves first) | amber `#D97706` |
| Second army (`chess.js` black) | teal `#0F766E` |
| Armour | steel `#CBD5E1` |
| Trim | gold `#EAB308` |

Each piece takes one `teamColor` prop; armour and trim are shared.

### Pieces

Built from rounded boxes, cylinders and cones, with slightly oversized heads
so they read from the high camera. The first army faces `−z`, the second
`+z`.

| Type | Design | Locomotion | Attack clip | Death clip |
|---|---|---|---|---|
| Pawn | Foot soldier, spear and round shield | Walk with a bob | Spear thrust | Falls backward |
| Knight | Mounted lancer | Hop | Lance lunge | Horse rears, topples sideways |
| Bishop | Hooded cleric with a staff | Gliding walk | Overhead staff strike | Spins and collapses |
| Rook | Wheeled siege tower | Rolls, wheels turning | Rams forward | Tips over, parts scatter |
| Queen | Robed queen with a sceptre | Walk | Sceptre sweep | Crumples |
| King | Robed king with a sword | Walk | Sword slash | — (never captured) |

Six attack clips and five death clips in total.

## Error handling

- WebGL unavailable: the page shows a plain message instead of the canvas.
- Illegal or out-of-turn clicks: ignored.
- Invalid typed move: inline message, no state change.
- Store and `chess.js` out of sync after a move: logged and resynced, as
  described above.

## Testing

Automated, with `vitest`:

1. `planMove` unit tests: quiet move, knight move, capture, en passant,
   king-side castle, queen-side castle, promotion, promotion with capture.
2. Sequencer test with fake actors: steps run in order, each effect lands
   after its animation promise resolves, input stays locked until the end.
3. Replay test: play a recorded game containing every special move through
   `planMove` and the step effects, and assert after each move that
   `store.pieces` matches `chess.board()`.

Manual, in the browser: play a full game to checkmate; exercise both castles,
en passant and each promotion choice; play one game using only the keyboard;
check the reduced-motion setting.

## Done when

- Every legal chess move can be made by click and by typed input.
- Every capture plays the attacker's and defender's clips before the board
  settles.
- Castling, en passant and promotion animate correctly.
- Input is locked during animation and the view never disagrees with
  `chess.js`.
- Checkmate and all draw types end the game with the right message.
- All automated tests pass.

## Out of scope

Computer opponent, undo, clocks, saved games, board flip, camera zoom on
fights, particles, audio, post-processing, `.glb` models, asset CDN,
multiplayer, desktop and mobile packaging.

## Later sub-projects and where they attach

| # | Sub-project | Attaches to |
|---|---|---|
| 2 | Computer opponent (Stockfish in a Web Worker) | Calls `store.submitMove`, like the text field |
| 3 | Combat system: JSON timelines, per-pair matrix, camera zoom, particles, audio | Replaces the generic executor of the `combat` step |
| 4 | Rigged `.glb` models with lazy preloading | Replaces `scene/pieces/*` behind `ActorHandle` |
| 5 | Production deployment and asset CDN | No code seam needed |

Stockfish is GPL-licensed; that needs a decision before sub-project 2 if the
game is to be distributed commercially.
