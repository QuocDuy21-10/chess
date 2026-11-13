# Online Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people on two devices play one game: one creates a room and sends an invite link, the other opens it, and a server validates every move, keeps the clocks and brings a player who lost the connection back into the game.

**Architecture:** A separate Node + Socket.IO process in `server/` keeps the rooms in memory. `server/rooms.ts` holds seats, a chess.js position and the clocks and knows nothing about sockets; `server/app.ts` puts Socket.IO in front of it. In the browser, `src/net/online.ts` owns the socket and drives the existing game store, which gains a seat, a `sync` that brings the board to the server's move list, and a `finish` for results only the server knows. The server sends one message, the full room state, after every change, so a move, a reload and a reconnection all take the same path.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, three.js, React Three Fiber, chess.js, Zustand, Vitest, and new here: Socket.IO 4.8 (server and client) on Node 22, which runs the server's TypeScript files directly.

**Spec:** `docs/superpowers/specs/2026-11-12-online-play-design.md`

## Global Constraints

- Installed versions, unchanged: `next@16.4.6`, `react@19.3.0`, `chess.js@1.4.0`, `zustand@5.1.0`, `three@0.187.0`, `vitest@5.1.0`, `tailwindcss@4.3.3`. Node 22.18 or later (22.23.2 on this machine).
- New dependencies: `socket.io` and `socket.io-client`, both 4.8.x. Nothing else. No `tsx`, no `ts-node`, no build step for the server.
- `AGENTS.md`: this Next.js differs from older ones. Before writing any Next.js-specific code that is not copied from this plan, read the matching guide in `node_modules/next/dist/docs/`.
- `chess.js` decides every rule, on both ends, and the server's copy has the last word. Never re-implement move legality.
- Node runs everything in `server/`, and the two files it loads from `src/` (`src/game/result.ts` and `src/net/protocol.ts`), without compiling them. In those files: write `import type` (or an inline `type`) for every type-only import, put `.ts` on every relative import in `server/`, and use no enums, namespaces or constructor parameter properties.
- Every string a player can read goes through `useT()` from `src/ui/i18n.ts`, in English and Vietnamese.
- Time controls: 5, 10 or 30 minutes a side, no increment. At most 1000 rooms. A room with nobody connected for 10 minutes is deleted. Socket.IO's message size limit is 10 kB.
- A local two-player game must behave exactly as it did before this plan.
- Chess rules, animation steps, the sequencer and the fight choreography are not changed by this plan.
- Run every command from the repository root (the folder that contains `docs/`).
- Work on the branch `online-play`. Commit only the paths each task names. Never commit `roadmap.md`, `roadmap-2.md`, `design-3D.md`, `3D-Stylized.md`, `chess.jpeg` or `.vitest/`.

## How to read the code blocks

- A block introduced by **Create** or **Replace … with** is the complete file.
- A `diff` block is the exact change to an existing file, produced by `git diff`. Apply it by hand, or save it to a file and run `git apply <file>`. The diffs apply cleanly when the tasks are done in order.

## What was checked while writing this plan

Tasks 1 to 6 were written into a scratch clone of this branch, one commit per task, with its own copy of `node_modules` plus the two new packages. Every code block below was copied out of those commits by a script, not retyped.

- Checked, at each of the six task commits: `npx tsc --noEmit`, `npx eslint` and `npx vitest run` all pass. Test counts: 59 after Task 1, 67 after Task 2, 77 after Task 3, 84 from Task 4 on. The branch starts at 46.
- Checked: each new test file fails against the commit before it, with the message its "run it to see it fail" step quotes.
- Checked: the tests that open sockets (`server/app.test.ts`, `src/net/online.test.ts`) were run six times in a row without a failure.
- Checked: `npx next build` passes on the final commit, and `node server/index.ts` starts and prints its port with no warning.
- Not checked: nothing was rendered in a browser. The online panel in the menu, the clocks, the connection notices, the pause menu's Resign, the camera standing behind the guest's army, and two real tabs playing each other are untested. Tasks 5 and 6 each have a browser step and Task 7 exists to catch the rest.
- Not checked: a clock running out in a real browser. `server/app.test.ts` watches a 120 ms clock fall on the real server instead.

Three facts read from the installed code and relied on:

- Node 22.23.2 runs `.ts` files directly. In a package without `"type": "module"` it prints a warning and re-parses every file as an ES module; with it, there is no warning. `next build`, `eslint` and `vitest` were all run with `"type": "module"` set and pass.
- `socket.io-client@4.8.4` calls a `socket.timeout(ms).emit(…)` callback with an error when the socket disconnects before the answer arrives (`node_modules/socket.io-client/build/esm/socket.js`, `_clearAcks`). A move sent into a dying connection is therefore reported as lost, not left hanging.
- The Next.js dev server accepts `localhost` and every subdomain of it (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`). That is what makes `http://b.localhost:3000` usable as a second player; see the next section.

## Two players on one computer

A browser's `playerId` lives in `localStorage`, which is shared by every tab on the same origin. Two tabs on `http://localhost:3000` are therefore the same player, and the newer tab takes the seat from the older one. That is the intended behaviour, and it is useless for testing.

For every browser step in this plan, the second player is a tab on **`http://b.localhost:3000`**. Browsers resolve any `*.localhost` name to this machine, it is a different origin with its own `localStorage`, and the page finds the game server at `http://b.localhost:3001` by itself. When an invite link reads `http://localhost:3000/?room=abc`, open `http://b.localhost:3000/?room=abc` in the second tab.

Both servers must be running: `chess-dev` and `chess-server` from `.claude/launch.json` (the second is added in Task 2), or `npm run dev` and `npm run server` in two terminals.

## Deviations from the spec

- **`"type": "module"`:** `package.json` gains it. The spec does not mention it; without it the server prints a warning on every start.
- **The "move just sent" case of `sync`:** the spec lists a fourth case, where the server's list is the local one minus a move not yet acknowledged, and says to do nothing. It is not built. `sync` waits for the move in flight and then compares against the newest list, and by the time the animation ends the server's answer has replaced the stale list. If it has not, the board is rebuilt and the move is played again when the server's next message arrives: a visible stutter, not a wrong position.
- **Refused moves:** the spec says a refused move "syncs again with the last list received". The server also sends `state` after a refused move, because the refusal may be the flag falling, which both players must hear about.
- **`playerId`:** made with `crypto.getRandomValues` (32 hex characters), not `crypto.randomUUID()`. The latter exists only in a secure context, and a phone reaching the development server over the local network is not one.
- **Before the opponent arrives:** the board is locked (`send` is `null` until `started`). The spec gates input only by turn; without this the creator could move in an empty room and be refused.
- **"Menu", not "Pause":** online, the HUD button and the dialog title read "Menu". The clocks keep running behind it, so "Paused" would be false.
- **Leaving a room:** the spec says `leave` calls `newGame()`. `newGame()` does nothing while a move is animating, so `leave` first calls `sync([])`, which waits for that move and empties the board, and then `newGame()`.
- **Join errors:** a `bad-request` answer to `join` (a malformed room id in the address) is shown as "This room no longer exists".
- **`createApp({ timeControls })`:** an option the spec does not have. It lets one test offer a 120 ms clock and watch the server's timer end the game.
- **Menu:** the mode line reads "Mode: Play online" while the online panel is open, and the army choice stays visible there until a room exists.
- **Second player in the same browser:** the spec's browser checks say "two tabs". They are two origins, as the section above explains.

## File Structure

| File | Responsibility |
|---|---|
| `server/rooms.ts` (new) | Rooms, seats, move validation, clocks, results, expiry. No sockets; time is passed in |
| `server/rooms.test.ts` (new) | The room rules, with a clock moved by hand |
| `server/app.ts` (new) | Socket.IO events in, `state` out; payload checks; the flag timers and the sweep |
| `server/app.test.ts` (new) | The real server on a free port and real clients |
| `server/index.ts` (new) | Entry point: `PORT`, `CLIENT_ORIGIN`, `listen` |
| `src/net/protocol.ts` (new) | Event names, payload types, the time controls. Imported by both ends |
| `src/net/online.ts` (new) | The socket, `playerId`, the page address, and the `useOnline` store |
| `src/net/online.test.ts` (new) | This device's side of a game against the real server |
| `src/game/result.ts` (new) | `gameResult(chess)`, moved out of the store so the server uses it too |
| `src/game/types.ts` | `Result` gains `timeout` and `resign` |
| `src/state/store.ts` | `seat`, `send`, `sync`, `finish`, `isLocked`; input gated by seat |
| `src/state/store.test.ts` | New online tests |
| `src/ui/i18n.ts` | `win` table, and the strings for the menu, the HUD and the dialogs |
| `src/ui/MainMenu.tsx` | "Play online": time control, Create room, the waiting screen with the link |
| `src/ui/Game.tsx` | Joins the room named in the address; follows the online status between menu and board |
| `src/ui/Hud.tsx` | Clocks, connection notices; no Undo online; the move field locks off-turn |
| `src/ui/PauseMenu.tsx` | Online: Resign replaces Restart; Main menu only after the game |
| `src/ui/GameOverModal.tsx` | Online: "Main menu" replaces "New game" |
| `src/scene/CameraRig.tsx`, `src/scene/Scene.tsx` | Online, the camera and key light stand behind the seat |
| `package.json`, `package-lock.json` | Two dependencies, `"type": "module"`, the `server` script |
| `tsconfig.json` | `allowImportingTsExtensions` |
| `.claude/launch.json`, `README.md` | The `chess-server` entry; how to run both |

---

### Task 1: Results and the room rules

**Files:**
- Create: `src/game/result.ts`, `src/net/protocol.ts`, `server/rooms.ts`, `server/rooms.test.ts`
- Modify: `src/game/types.ts`, `src/state/store.ts`, `src/ui/i18n.ts`, `tsconfig.json`

**Interfaces:**
- Consumes: `Chess` from `chess.js`; the store's private `gameResult()` (moved by this task).
- Produces:
  - `Result` in `src/game/types.ts` becomes `{ reason: 'checkmate' | 'timeout' | 'resign'; winner: Color } | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' }`.
  - `gameResult(chess: Chess): Result | null` from `src/game/result.ts`.
  - From `src/net/protocol.ts`: `TIME_CONTROLS: number[]` (`[5, 10, 30]`), and the types `RoomState`, `CreateAck`, `JoinAck`, `MoveError`, `MoveAck`, `ClientEvents`, `ServerEvents`.
  - `createRooms(now?: () => number)` from `server/rooms.ts`, returning an object with `create(playerId, color, minutes): string | null`, `join(roomId, playerId): { color: Color } | { error: 'not-found' | 'full' }`, `leave(roomId, color): void`, `move(roomId, color, move): MoveError | null`, `resign(roomId, color): MoveError | null`, `flag(roomId): void`, `deadline(roomId): number | null`, `state(roomId, color): RoomState | null`, `sweep(): string[]`. Also `type Rooms`.
  - In `src/ui/i18n.ts`, `t.win.checkmate(team)`, `t.win.timeout(team)` and `t.win.resign(team)` replace `t.checkmate(team)`.

- [ ] **Step 1: Share the result function and widen `Result`**

The server must end games exactly as the browser does, so the function that reads a result off a chess.js position moves out of the store into a file both can load.

Create `src/game/result.ts`:

```ts
import type { Chess } from 'chess.js';
import type { Result } from './types';

/** How the position on the board ended the game, or null while it goes on. */
export function gameResult(chess: Chess): Result | null {
  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isStalemate()) return { reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
  return null;
}
```

Change `src/game/types.ts`, `src/state/store.ts` and `src/ui/i18n.ts`:

```diff
diff --git a/src/game/types.ts b/src/game/types.ts
index 49776e2..dbcc68f 100644
--- a/src/game/types.ts
+++ b/src/game/types.ts
@@ -19,5 +19,5 @@ export type Step =
 
 /** How a game ended. The interface turns it into words in the player's language. */
 export type Result =
-  | { reason: 'checkmate'; winner: Color }
+  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
   | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
diff --git a/src/state/store.ts b/src/state/store.ts
index 1c70abe..59b33c8 100644
--- a/src/state/store.ts
+++ b/src/state/store.ts
@@ -3,6 +3,7 @@ import { create } from 'zustand';
 import { duck, fadeMusic, play } from '@/audio/audio';
 import { planMove } from '@/game/planMove';
 import { matchesBoard, piecesFromBoard } from '@/game/position';
+import { gameResult } from '@/game/result';
 import { squareToWorld } from '@/game/squares';
 import type { Piece, PromotionPiece, Result } from '@/game/types';
 import { actors } from '@/scene/actors';
@@ -38,15 +39,6 @@ interface GameState {
 // chess.js is the single source of truth for rules and position.
 const chess = new Chess();
 
-function gameResult(): Result | null {
-  if (chess.isCheckmate()) return { reason: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
-  if (chess.isStalemate()) return { reason: 'stalemate' };
-  if (chess.isInsufficientMaterial()) return { reason: 'insufficient' };
-  if (chess.isThreefoldRepetition()) return { reason: 'threefold' };
-  if (chess.isDrawByFiftyMoves()) return { reason: 'fifty' };
-  return null;
-}
-
 const fresh = () => ({
   pieces: piecesFromBoard(chess),
   selected: null,
@@ -122,7 +114,7 @@ export const useGame = create<GameState>((set, get) => ({
       console.error('View out of sync with chess.js after', move.san, '— resyncing');
       set({ pieces: piecesFromBoard(chess) });
     }
-    const result = gameResult();
+    const result = gameResult(chess);
     if (result) {
       play('gameover');
       fadeMusic(0.2, 1500);
diff --git a/src/ui/i18n.ts b/src/ui/i18n.ts
index e3bbdd9..add6070 100644
--- a/src/ui/i18n.ts
+++ b/src/ui/i18n.ts
@@ -7,7 +7,11 @@ const en = {
   toMove: (team: string) => `${team} to move`,
   check: 'Check',
   played: (team: string, san: string) => `${team} played ${san}.`,
-  checkmate: (team: string) => `Checkmate — ${team} wins`,
+  win: {
+    checkmate: (team: string) => `Checkmate — ${team} wins`,
+    timeout: (team: string) => `Time out — ${team} wins`,
+    resign: (team: string) => `Resignation — ${team} wins`,
+  },
   draw: {
     stalemate: 'Draw — stalemate',
     insufficient: 'Draw — insufficient material',
@@ -59,7 +63,11 @@ const vi: Strings = {
   toMove: (team) => `Lượt của ${team}`,
   check: 'Chiếu',
   played: (team, san) => `${team} đi ${san}.`,
-  checkmate: (team) => `Chiếu hết — ${team} thắng`,
+  win: {
+    checkmate: (team) => `Chiếu hết — ${team} thắng`,
+    timeout: (team) => `Hết giờ — ${team} thắng`,
+    resign: (team) => `Đầu hàng — ${team} thắng`,
+  },
   draw: {
     stalemate: 'Hòa — hết nước đi',
     insufficient: 'Hòa — không đủ quân để chiếu hết',
@@ -110,5 +118,5 @@ export function useT(): Strings {
 }
 
 export function resultText(t: Strings, result: Result): string {
-  return result.reason === 'checkmate' ? t.checkmate(t.team[result.winner]) : t.draw[result.reason];
+  return 'winner' in result ? t.win[result.reason](t.team[result.winner]) : t.draw[result.reason];
 }
```

Change `tsconfig.json`, so the server's files may import each other with a `.ts` extension, which Node requires:

```diff
diff --git a/tsconfig.json b/tsconfig.json
index cf9c65d..f88b45b 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -6,6 +6,7 @@
     "skipLibCheck": true,
     "strict": true,
     "noEmit": true,
+    "allowImportingTsExtensions": true,
     "esModuleInterop": true,
     "module": "esnext",
     "moduleResolution": "bundler",
```

- [ ] **Step 2: Check that nothing changed for a local game**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; 46 tests pass.

- [ ] **Step 3: Write down what the two ends say to each other**

Create `src/net/protocol.ts`:

```ts
import type { Color } from 'chess.js';
import type { Result } from '../game/types';

// Everything the browser and the game server say to each other. Both ends import this file.

export const TIME_CONTROLS = [5, 10, 30]; // minutes for each side

/** What one player is told about their room. Sent in full after every change. */
export interface RoomState {
  roomId: string;
  color: Color; // the seat of the player this copy is sent to
  moves: string[]; // every move so far, in coordinate form: "e2e4", "e7e8q"
  started: boolean; // both seats are taken
  clocks: Record<Color, number>; // milliseconds left, as of sending
  result: Result | null;
  opponentOnline: boolean;
}

export type CreateAck = { roomId: string } | { error: 'busy' | 'bad-request' };
export type JoinAck = { ok: true } | { error: 'not-found' | 'full' | 'bad-request' };
export type MoveError = 'not-seated' | 'not-started' | 'over' | 'not-your-turn' | 'illegal' | 'bad-request';
export type MoveAck = { ok: true } | { error: MoveError };

export interface ClientEvents {
  create(payload: { playerId: string; color: Color; minutes: number }, ack: (reply: CreateAck) => void): void;
  join(payload: { roomId: string; playerId: string }, ack: (reply: JoinAck) => void): void;
  move(move: string, ack: (reply: MoveAck) => void): void;
  resign(ack: (reply: MoveAck) => void): void;
}

export interface ServerEvents {
  state(state: RoomState): void;
}
```

- [ ] **Step 4: Write the failing test**

Create `server/rooms.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import { createRooms, type Rooms } from './rooms.ts';

const MINUTE = 60_000;
let time: number; // the server's clock, moved by hand
let rooms: Rooms;

beforeEach(() => {
  time = 1_000_000;
  rooms = createRooms(() => time);
});

/** A five-minute room with both players in it. `ann` made it and plays the first army. */
function started() {
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  rooms.join(id, 'bob');
  return id;
}

test('the creator holds the seat they chose and the guest gets the other', () => {
  const id = rooms.create('ann', 'b', 5)!;
  expect(id).toMatch(/^[\w-]{8}$/);
  expect(rooms.join(id, 'ann')).toEqual({ color: 'b' });
  expect(rooms.state(id, 'b')).toMatchObject({ roomId: id, color: 'b', started: false, moves: [], opponentOnline: false });
  expect(rooms.join(id, 'bob')).toEqual({ color: 'w' });
  expect(rooms.state(id, 'b')).toMatchObject({ started: true, opponentOnline: true });
});

test('a third player is refused, and a returning player gets their own seat back', () => {
  const id = started();
  expect(rooms.join(id, 'cy')).toEqual({ error: 'full' });
  expect(rooms.join(id, 'bob')).toEqual({ color: 'b' });
  expect(rooms.join('nowhere1', 'ann')).toEqual({ error: 'not-found' });
});

test('a move is refused before the guest arrives, out of turn, and when chess.js rejects it', () => {
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  expect(rooms.move(id, 'w', 'e2e4')).toBe('not-started');
  rooms.join(id, 'bob');
  expect(rooms.move(id, 'b', 'e7e5')).toBe('not-your-turn');
  expect(rooms.move(id, 'w', 'e2e5')).toBe('illegal');
  expect(rooms.move('nowhere1', 'w', 'e2e4')).toBe('not-seated');
  expect(rooms.state(id, 'w')?.moves).toEqual([]);
});

test('legal moves are recorded as chess.js spells them', () => {
  const id = started();
  expect(rooms.move(id, 'w', 'e2e4q')).toBeNull(); // the stray promotion letter is dropped
  expect(rooms.move(id, 'b', 'e7e5')).toBeNull();
  expect(rooms.state(id, 'b')?.moves).toEqual(['e2e4', 'e7e5']);
});

test('no clock runs before the guest arrives', () => {
  const id = rooms.create('ann', 'w', 5)!;
  rooms.join(id, 'ann');
  time += MINUTE;
  expect(rooms.deadline(id)).toBeNull();
  rooms.join(id, 'bob');
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE, b: 5 * MINUTE });
  expect(rooms.deadline(id)).toBe(5 * MINUTE);
});

test('the time a move took is charged to the mover, and then the other clock runs', () => {
  const id = started();
  time += 7_000;
  rooms.move(id, 'w', 'e2e4');
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE });
  time += 3_000;
  expect(rooms.state(id, 'w')?.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE - 3_000 });
  expect(rooms.deadline(id)).toBe(5 * MINUTE - 3_000);
});

test('a clock that reaches zero ends the game for the other side', () => {
  const id = started();
  time += 5 * MINUTE - 1;
  rooms.flag(id);
  expect(rooms.state(id, 'w')?.result).toBeNull();
  time += 1;
  rooms.flag(id);
  expect(rooms.state(id, 'w')).toMatchObject({
    result: { reason: 'timeout', winner: 'b' },
    clocks: { w: 0, b: 5 * MINUTE },
  });
  expect(rooms.deadline(id)).toBeNull();
});

test('a move made after the flag fell is refused even if the timer never ran', () => {
  const id = started();
  time += 5 * MINUTE;
  expect(rooms.move(id, 'w', 'e2e4')).toBe('over');
  expect(rooms.state(id, 'b')).toMatchObject({ moves: [], result: { reason: 'timeout', winner: 'b' } });
});

test('resigning gives the game to the other side and stops the clocks', () => {
  const id = started();
  time += 2_000;
  expect(rooms.resign(id, 'b')).toBeNull();
  expect(rooms.state(id, 'w')).toMatchObject({
    result: { reason: 'resign', winner: 'w' },
    clocks: { w: 5 * MINUTE - 2_000, b: 5 * MINUTE },
  });
  time += MINUTE;
  expect(rooms.state(id, 'w')?.clocks.w).toBe(5 * MINUTE - 2_000);
  expect(rooms.resign(id, 'w')).toBe('over');
  expect(rooms.move(id, 'w', 'e2e4')).toBe('over');
});

test('checkmate ends the game and stops the clocks', () => {
  const id = started();
  const moves = [['w', 'f2f3'], ['b', 'e7e5'], ['w', 'g2g4'], ['b', 'd8h4']] as const;
  for (const [color, move] of moves) expect(rooms.move(id, color, move)).toBeNull();
  expect(rooms.state(id, 'w')?.result).toEqual({ reason: 'checkmate', winner: 'b' });
  expect(rooms.deadline(id)).toBeNull();
});

test('each player is told whether the other is connected', () => {
  const id = started();
  rooms.leave(id, 'b');
  expect(rooms.state(id, 'w')?.opponentOnline).toBe(false);
  expect(rooms.state(id, 'b')?.opponentOnline).toBe(true);
  rooms.join(id, 'bob');
  expect(rooms.state(id, 'w')?.opponentOnline).toBe(true);
});

test('a room nobody is connected to is deleted after ten minutes', () => {
  const live = started();
  const abandoned = started();
  const neverEntered = rooms.create('ann', 'w', 5)!;
  rooms.leave(abandoned, 'w');
  rooms.leave(abandoned, 'b');
  time += 10 * MINUTE - 1;
  expect(rooms.sweep()).toEqual([]);
  time += 1;
  expect(rooms.sweep().sort()).toEqual([abandoned, neverEntered].sort());
  expect(rooms.state(abandoned, 'w')).toBeNull();
  expect(rooms.state(live, 'w')).not.toBeNull();
});

test('the server holds at most a thousand rooms', () => {
  for (let i = 0; i < 1000; i++) expect(rooms.create('ann', 'w', 5)).not.toBeNull();
  expect(rooms.create('ann', 'w', 5)).toBeNull();
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run server/rooms.test.ts`
Expected: FAIL with `Cannot find module './rooms.ts'`.

- [ ] **Step 6: Write the room rules**

Create `server/rooms.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { Chess, type Color } from 'chess.js';
import { gameResult } from '../src/game/result.ts';
import type { Result } from '../src/game/types.ts';
import type { MoveError, RoomState } from '../src/net/protocol.ts';

const MAX_ROOMS = 1000;
const IDLE_MS = 10 * 60_000; // how long a room lives with nobody connected to it

interface Room {
  chess: Chess; // the position the server trusts
  moves: string[]; // coordinate form, as chess.js spells them
  seats: Record<Color, string | null>; // the playerId in each seat
  online: Record<Color, boolean>;
  left: Record<Color, number>; // milliseconds on each clock, as of `since`
  since: number | null; // when the running clock started; null while no clock runs
  result: Result | null;
  emptySince: number | null; // when the last player disconnected; null while someone is connected
}

const COLORS: Color[] = ['w', 'b'];
const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** Every room on this server. Knows nothing about sockets. `now` is passed in so tests can move the clock. */
export function createRooms(now: () => number = Date.now) {
  const rooms = new Map<string, Room>();

  /** Ends the game on time if the running clock has reached zero. */
  function checkFlag(room: Room, at: number) {
    const turn = room.chess.turn();
    if (room.since === null || at - room.since < room.left[turn]) return;
    room.left[turn] = 0;
    room.since = null;
    // shortcut: a flag is always a win, even when the winner has no mating material, which the full
    // rules call a draw. Upgrade when games are rated.
    room.result = { reason: 'timeout', winner: other(turn) };
  }

  /** Why nobody can act in this room right now, or null when the game is live. Charges nothing. */
  function closed(room: Room | undefined, at: number): MoveError | null {
    if (!room) return 'not-seated';
    if (!room.seats.w || !room.seats.b) return 'not-started';
    checkFlag(room, at);
    return room.result ? 'over' : null;
  }

  return {
    /** Makes a room with `playerId` in the `color` seat. Returns its id, or null when the server is full. */
    create(playerId: string, color: Color, minutes: number): string | null {
      if (rooms.size >= MAX_ROOMS) return null;
      const id = randomBytes(6).toString('base64url'); // 8 URL-safe characters
      const seats: Room['seats'] = { w: null, b: null };
      seats[color] = playerId;
      const ms = minutes * 60_000;
      rooms.set(id, {
        chess: new Chess(),
        moves: [],
        seats,
        online: { w: false, b: false },
        left: { w: ms, b: ms },
        since: null,
        result: null,
        emptySince: now(),
      });
      return id;
    },

    /** Seats a player: in their own seat if they hold one, otherwise in the free one. Marks them connected. */
    join(roomId: string, playerId: string): { color: Color } | { error: 'not-found' | 'full' } {
      const room = rooms.get(roomId);
      if (!room) return { error: 'not-found' };
      let color = COLORS.find((c) => room.seats[c] === playerId);
      if (!color) {
        color = COLORS.find((c) => room.seats[c] === null);
        if (!color) return { error: 'full' };
        room.seats[color] = playerId;
        room.since = now(); // the second player has arrived: the first army's clock starts
      }
      room.online[color] = true;
      room.emptySince = null;
      return { color };
    },

    /** The player in this seat lost their connection. They keep the seat. */
    leave(roomId: string, color: Color): void {
      const room = rooms.get(roomId);
      if (!room) return;
      room.online[color] = false;
      if (!room.online[other(color)]) room.emptySince = now();
    },

    /** Plays a move for the seat `color`. Returns why it was refused, or null when it was played. */
    move(roomId: string, color: Color, move: string): MoveError | null {
      const room = rooms.get(roomId);
      const at = now();
      const refused = closed(room, at);
      if (!room || refused) return refused;
      if (room.chess.turn() !== color) return 'not-your-turn';
      let played;
      try {
        played = room.chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      } catch {
        return 'illegal';
      }
      room.moves.push(played.lan);
      room.left[color] -= at - room.since!; // a live game always has a running clock
      room.result = gameResult(room.chess);
      room.since = room.result ? null : at; // the other clock starts, unless the move ended the game
      return null;
    },

    /** The seat `color` gives up. */
    resign(roomId: string, color: Color): MoveError | null {
      const room = rooms.get(roomId);
      const at = now();
      const refused = closed(room, at);
      if (!room || refused) return refused;
      room.left[room.chess.turn()] -= at - room.since!;
      room.since = null;
      room.result = { reason: 'resign', winner: other(color) };
      return null;
    },

    /** Ends the game on time if the running clock has reached zero. Called by the server's timer. */
    flag(roomId: string): void {
      const room = rooms.get(roomId);
      if (room) checkFlag(room, now());
    },

    /** Milliseconds until the running clock reaches zero, or null while no clock runs. */
    deadline(roomId: string): number | null {
      const room = rooms.get(roomId);
      if (!room || room.since === null) return null;
      return Math.max(0, room.left[room.chess.turn()] - (now() - room.since));
    },

    /** What the player in the seat `color` is told. Null when the room is gone. */
    state(roomId: string, color: Color): RoomState | null {
      const room = rooms.get(roomId);
      if (!room) return null;
      const clocks = { ...room.left };
      if (room.since !== null) {
        const turn = room.chess.turn();
        clocks[turn] = Math.max(0, clocks[turn] - (now() - room.since));
      }
      return {
        roomId,
        color,
        moves: [...room.moves],
        started: room.seats.w !== null && room.seats.b !== null,
        clocks,
        result: room.result,
        opponentOnline: room.online[other(color)],
      };
    },

    /** Deletes every room nobody has been connected to for ten minutes. Returns their ids. */
    sweep(): string[] {
      const gone: string[] = [];
      for (const [id, room] of rooms) {
        if (room.emptySince === null || now() - room.emptySince < IDLE_MS) continue;
        rooms.delete(id);
        gone.push(id);
      }
      return gone;
    },
  };
}

export type Rooms = ReturnType<typeof createRooms>;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run server/rooms.test.ts`
Expected: 13 tests pass.

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 59 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/game/result.ts src/game/types.ts src/net/protocol.ts src/state/store.ts src/ui/i18n.ts tsconfig.json server/rooms.ts server/rooms.test.ts
git commit -m "feat: add the room logic for online play"
```

---

### Task 2: The game server

**Files:**
- Create: `server/app.ts`, `server/app.test.ts`, `server/index.ts`
- Modify: `package.json`, `package-lock.json`, `.claude/launch.json`, `README.md`

**Interfaces:**
- Consumes: `createRooms` and everything it returns, from Task 1; `TIME_CONTROLS`, `ClientEvents`, `ServerEvents` from `src/net/protocol.ts`.
- Produces:
  - `createApp(options?: { origin?: string; now?: () => number; timeControls?: number[] })` from `server/app.ts`, returning `{ io, listen(port: number): Promise<number>, close(): Promise<void> }`. `listen(0)` picks a free port and resolves with it. `io` is the Socket.IO `Server`; each socket's `data` is `{ roomId?: string; color?: Color }`.
  - `npm run server`: the game server on port 3001, restarting on change.
  - The wire protocol of the spec: `create`, `join`, `move`, `resign` in, each with an acknowledgement; `state` out.

- [ ] **Step 1: Add the two packages, the module type and the script**

Run: `npm install socket.io@^4.8.4 socket.io-client@^4.8.4`

Then change `package.json` so that, with the install's own changes, it differs from before like this:

```diff
diff --git a/package.json b/package.json
index 6a6b8fb..537c6cb 100644
--- a/package.json
+++ b/package.json
@@ -2,8 +2,10 @@
   "name": "combat-chess",
   "version": "0.1.0",
   "private": true,
+  "type": "module",
   "scripts": {
     "dev": "next dev",
+    "server": "node --watch server/index.ts",
     "build": "next build",
     "start": "next start",
     "lint": "eslint",
@@ -16,6 +18,8 @@
     "next": "16.4.6",
     "react": "19.3.0",
     "react-dom": "19.3.0",
+    "socket.io": "^4.8.4",
+    "socket.io-client": "^4.8.4",
     "three": "^0.187.0",
     "zustand": "^5.1.0"
   },
```

`"type": "module"` is what lets Node run `server/index.ts` without re-parsing every file and warning about it.

- [ ] **Step 2: Check that nothing broke when the package became an ES module**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no errors; 59 tests pass.

- [ ] **Step 3: Write the failing test**

Create `server/app.test.ts`:

```ts
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { ClientEvents, CreateAck, JoinAck, MoveAck, RoomState, ServerEvents } from '../src/net/protocol.ts';
import { createApp } from './app.ts';

// The real server on a free port, talked to by real clients.

type Client = Socket<ServerEvents, ClientEvents>;

const ANN = 'ann-player-id';
const BOB = 'bob-player-id';
const SHORT = 0.002; // minutes: a clock of 120 ms, to watch a flag fall
let app: ReturnType<typeof createApp>;
let port: number;
let skew: number; // milliseconds added to the server's clock
const clients: Client[] = [];

beforeEach(async () => {
  skew = 0;
  app = createApp({ now: () => Date.now() + skew, timeControls: [5, SHORT] });
  port = await app.listen(0);
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await app.close();
});

function connect(): Client {
  const client: Client = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  return client;
}

/** The next `state` this client is sent. Ask for it before causing it. */
const nextState = (client: Client) => new Promise<RoomState>((resolve) => client.once('state', resolve));
const create = (client: Client, playerId: string, minutes = 5) =>
  new Promise<CreateAck>((resolve) => client.emit('create', { playerId, color: 'w', minutes }, resolve));
const join = (client: Client, roomId: string, playerId: string) =>
  new Promise<JoinAck>((resolve) => client.emit('join', { roomId, playerId }, resolve));
const move = (client: Client, text: string) =>
  new Promise<MoveAck>((resolve) => client.emit('move', text, resolve));

/** Ann creates a room and plays the first army; Bob joins it. Resolves once both have been told. */
async function startGame(minutes = 5) {
  const ann = connect();
  const bob = connect();
  const made = await create(ann, ANN, minutes);
  if ('error' in made) throw new Error(made.error);
  await Promise.all([nextState(ann), join(ann, made.roomId, ANN)]);
  const [annState, bobState] = await Promise.all([nextState(ann), nextState(bob), join(bob, made.roomId, BOB)]);
  return { ann, bob, roomId: made.roomId, annState, bobState };
}

test('two players create a room, join it and trade moves', async () => {
  const { ann, bob, roomId, annState, bobState } = await startGame();
  expect(annState).toMatchObject({ roomId, color: 'w', started: true, opponentOnline: true, moves: [] });
  expect(bobState).toMatchObject({ roomId, color: 'b', started: true, opponentOnline: true, moves: [] });

  const [ack, seenByAnn, seenByBob] = await Promise.all([move(ann, 'e2e4'), nextState(ann), nextState(bob)]);
  expect(ack).toEqual({ ok: true });
  expect(seenByAnn.moves).toEqual(['e2e4']);
  expect(seenByBob.moves).toEqual(['e2e4']);

  const [, afterReply] = await Promise.all([move(bob, 'e7e5'), nextState(ann)]);
  expect(afterReply.moves).toEqual(['e2e4', 'e7e5']);
  expect(afterReply.clocks.w).toBeLessThanOrEqual(5 * 60_000);
});

test('a move is refused from the wrong seat, from an outsider, and when it is illegal or malformed', async () => {
  const { ann, bob, roomId } = await startGame();
  expect(await move(bob, 'e7e5')).toEqual({ error: 'not-your-turn' });
  expect(await move(ann, 'e2e5')).toEqual({ error: 'illegal' });
  expect(await move(ann, 'castle, please')).toEqual({ error: 'bad-request' });

  const cy = connect();
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
  expect(await join(cy, roomId, 'cy-player-id')).toEqual({ error: 'full' });
  expect(await move(cy, 'e2e4')).toEqual({ error: 'not-seated' });
});

test('malformed requests get an answer and change nothing', async () => {
  const ann = connect();
  expect(await create(ann, ANN, 7)).toEqual({ error: 'bad-request' }); // not a time control
  expect(await create(ann, 'short')).toEqual({ error: 'bad-request' });
  expect(await join(ann, 'not a room', ANN)).toEqual({ error: 'bad-request' });
  expect(await join(ann, 'abcdefgh', ANN)).toEqual({ error: 'not-found' });
  const nothing = await new Promise((resolve) => ann.emit('join', null as never, resolve));
  expect(nothing).toEqual({ error: 'bad-request' });
});

test('a player who drops is reported, and gets the game back on returning', async () => {
  const { ann, bob, roomId } = await startGame();
  await Promise.all([move(ann, 'e2e4'), nextState(ann), nextState(bob)]);

  const dropped = nextState(ann);
  bob.disconnect();
  expect((await dropped).opponentOnline).toBe(false);

  const bobAgain = connect();
  const [back, seenByAnn] = await Promise.all([nextState(bobAgain), nextState(ann), join(bobAgain, roomId, BOB)]);
  expect(back).toMatchObject({ color: 'b', moves: ['e2e4'], started: true });
  expect(seenByAnn.opponentOnline).toBe(true);
});

test('a second tab takes the seat and the first is disconnected', async () => {
  const { ann, bob, roomId } = await startGame();
  const kicked = new Promise<string>((resolve) => ann.once('disconnect', resolve));
  const tab = connect();
  const [state, seenByBob] = await Promise.all([nextState(tab), nextState(bob), join(tab, roomId, ANN)]);
  expect(state.color).toBe('w');
  expect(seenByBob.opponentOnline).toBe(true); // the seat never went offline
  expect(await kicked).toBe('io server disconnect');

  const [ack, afterMove] = await Promise.all([move(tab, 'e2e4'), nextState(bob)]);
  expect(ack).toEqual({ ok: true });
  expect(afterMove.moves).toEqual(['e2e4']);
});

test('the flag falls by itself when a clock runs out', async () => {
  const { ann, bob } = await startGame(SHORT);
  const [seenByAnn, seenByBob] = await Promise.all([nextState(ann), nextState(bob)]);
  expect(seenByAnn.result).toEqual({ reason: 'timeout', winner: 'b' });
  expect(seenByBob).toMatchObject({ result: { reason: 'timeout', winner: 'b' }, clocks: { w: 0 } });
});

test('a move after the time ran out is refused, and both players are told the result', async () => {
  const { ann, bob } = await startGame();
  skew = 5 * 60_000; // the timer has not fired, but the clock has run out
  const [ack, seenByBob] = await Promise.all([move(ann, 'e2e4'), nextState(bob)]);
  expect(ack).toEqual({ error: 'over' });
  expect(seenByBob).toMatchObject({ moves: [], result: { reason: 'timeout', winner: 'b' } });
});

test('resigning ends the game for both players', async () => {
  const { ann, bob } = await startGame();
  const [ack, seenByAnn] = await Promise.all([
    new Promise<MoveAck>((resolve) => bob.emit('resign', resolve)),
    nextState(ann),
  ]);
  expect(ack).toEqual({ ok: true });
  expect(seenByAnn.result).toEqual({ reason: 'resign', winner: 'w' });
});
```

Every helper that waits for a `state` is registered before the action that causes it, and every test waits for all the states an action sends. Keep it that way when adding tests, or they turn flaky.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run server/app.test.ts`
Expected: FAIL with `Cannot find module './app.ts'`.

- [ ] **Step 5: Write the server**

Create `server/app.ts`:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Color } from 'chess.js';
import { Server, type Socket } from 'socket.io';
import { TIME_CONTROLS, type ClientEvents, type ServerEvents } from '../src/net/protocol.ts';
import { createRooms } from './rooms.ts';

// What a well-formed request looks like. Nothing a client sends is used before it passes one of these.
const PLAYER = /^[\w-]{8,64}$/;
const ROOM = /^[\w-]{8}$/;
const MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;
const SWEEP_MS = 60_000;

/** The seat a connection holds. Empty until it joins a room. */
interface Seat {
  roomId?: string;
  color?: Color;
}
type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, Seat>;

interface Options {
  origin?: string; // the only origin allowed to connect; any origin when unset
  now?: () => number;
  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
}

const matches = (value: unknown, pattern: RegExp): value is string =>
  typeof value === 'string' && pattern.test(value);

/** The game server: Socket.IO in front of the rooms. Call `listen` to start it. */
export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
  const http = createServer();
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, Seat>(http, {
    cors: { origin: origin ?? true },
    maxHttpBufferSize: 10_000,
  });
  const rooms = createRooms(now);
  const seated = new Map<string, GameSocket>(); // "roomId:color" → the connection in that seat
  const flags = new Map<string, NodeJS.Timeout>(); // roomId → the timer that ends the game on time

  /** Tells both players where the room stands, and re-arms the timer for the running clock. */
  function broadcast(roomId: string) {
    for (const color of ['w', 'b'] as const) {
      const state = rooms.state(roomId, color);
      if (state) seated.get(`${roomId}:${color}`)?.emit('state', state);
    }
    clearTimeout(flags.get(roomId));
    flags.delete(roomId);
    const ms = rooms.deadline(roomId);
    if (ms === null) return;
    flags.set(
      roomId,
      setTimeout(() => {
        rooms.flag(roomId);
        broadcast(roomId);
      }, ms),
    );
  }

  /** Takes a connection out of its seat. The player keeps the seat and can come back to it. */
  function vacate(socket: GameSocket) {
    const { roomId, color } = socket.data;
    socket.data = {};
    if (!roomId || !color || seated.get(`${roomId}:${color}`) !== socket) return;
    seated.delete(`${roomId}:${color}`);
    rooms.leave(roomId, color);
    broadcast(roomId);
  }

  io.on('connection', (socket) => {
    socket.on('create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { playerId, color, minutes } = Object(payload) as Record<string, unknown>;
      if (
        !matches(playerId, PLAYER) ||
        (color !== 'w' && color !== 'b') ||
        typeof minutes !== 'number' ||
        !timeControls.includes(minutes)
      ) {
        return ack({ error: 'bad-request' });
      }
      const roomId = rooms.create(playerId, color, minutes);
      ack(roomId ? { roomId } : { error: 'busy' });
    });

    socket.on('join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, playerId } = Object(payload) as Record<string, unknown>;
      if (!matches(roomId, ROOM) || !matches(playerId, PLAYER)) return ack({ error: 'bad-request' });
      vacate(socket); // a connection sits in one room at a time
      const seat = rooms.join(roomId, playerId);
      if ('error' in seat) return ack(seat);
      const key = `${roomId}:${seat.color}`;
      const earlier = seated.get(key);
      if (earlier) {
        // The same player in a second tab: the newer connection takes the seat, which never goes offline.
        earlier.data = {};
        earlier.disconnect(true);
      }
      seated.set(key, socket);
      socket.data = { roomId, color: seat.color };
      ack({ ok: true });
      broadcast(roomId);
    });

    socket.on('move', (move, ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, color } = socket.data;
      if (!roomId || !color) return ack({ error: 'not-seated' });
      if (!matches(move, MOVE)) return ack({ error: 'bad-request' });
      const error = rooms.move(roomId, color, move);
      ack(error ? { error } : { ok: true });
      broadcast(roomId); // also after a refusal: the refusal may be the flag falling
    });

    socket.on('resign', (ack) => {
      if (typeof ack !== 'function') return;
      const { roomId, color } = socket.data;
      if (!roomId || !color) return ack({ error: 'not-seated' });
      const error = rooms.resign(roomId, color);
      ack(error ? { error } : { ok: true });
      broadcast(roomId);
    });

    socket.on('disconnect', () => vacate(socket));
  });

  const sweeper = setInterval(() => {
    for (const roomId of rooms.sweep()) {
      clearTimeout(flags.get(roomId));
      flags.delete(roomId);
    }
  }, SWEEP_MS);

  return {
    io,
    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
    listen: (port: number) =>
      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
    /** Stops the timers and closes every connection. */
    close() {
      clearInterval(sweeper);
      for (const timer of flags.values()) clearTimeout(timer);
      return io.close();
    },
  };
}
```

Create `server/index.ts`:

```ts
import { createApp } from './app.ts';

// PORT: where to listen (3001). CLIENT_ORIGIN: the frontend's origin; when unset, any origin may connect.
createApp({ origin: process.env.CLIENT_ORIGIN })
  .listen(Number(process.env.PORT) || 3001)
  .then((port) => console.log(`Game server listening on port ${port}`));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run server`
Expected: 21 tests pass (13 from Task 1, 8 new).

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 67 tests pass.

- [ ] **Step 7: Make it startable, and say how**

Replace `.claude/launch.json` with:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "chess-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 },
    { "name": "chess-server", "runtimeExecutable": "npm", "runtimeArgs": ["run", "server"], "port": 3001 }
  ]
}
```

Add to the end of `README.md`:

````diff
diff --git a/README.md b/README.md
index e215bc4..4002a79 100644
--- a/README.md
+++ b/README.md
@@ -34,3 +34,28 @@ You can check out [the Next.js GitHub repository](https://github.com/vercel/next
 The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.
 
 Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
+
+## Online play
+
+Two players on two devices need the game server as well as the site:
+
+```bash
+npm run dev      # the site, on port 3000
+npm run server   # the game server, on port 3001
+```
+
+| Variable | Read by | Meaning |
+|---|---|---|
+| `PORT` | server | Port to listen on. Default 3001. |
+| `CLIENT_ORIGIN` | server | The site's origin; only it may connect. Unset: any origin. |
+| `NEXT_PUBLIC_SERVER_URL` | site, at build time | The server's address. Unset: port 3001 on the page's own host. |
+
+In production the server runs as `node server/index.ts` (Node 22.18 or later). Rooms are kept in
+memory, so a restart ends every game.
+
+To try both sides on one computer, open the second player at `http://b.localhost:3000`. That is a
+different origin, so the browser keeps a different player id for it. Two tabs on the same origin are the
+same player, and the newer tab takes the seat.
+
+A phone on the same network also needs the computer's address in `allowedDevOrigins` in
+`next.config.ts`, or the development site refuses it.
````

- [ ] **Step 8: Start it once**

Run: `PORT=3987 node server/index.ts`
Expected: one line, `Game server listening on port 3987`, and no warning. Stop it with Ctrl+C.

If Node prints `MODULE_TYPELESS_PACKAGE_JSON`, `"type": "module"` is missing from `package.json`. If it prints `ERR_MODULE_NOT_FOUND` for a file that exists, a relative import is missing its `.ts`. If it prints a syntax error at an `import`, a type-only import is missing the word `type`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json server/app.ts server/app.test.ts server/index.ts .claude/launch.json README.md
git commit -m "feat: add the game server"
```

---

### Task 3: The store follows a server's move list

**Files:**
- Modify: `src/state/store.ts`, `src/state/store.test.ts`

**Interfaces:**
- Consumes: `gameResult` from `src/game/result.ts`; `applyStep`, `piecesFromBoard` from `src/game/position.ts`; `planMove` from `src/game/planMove.ts` (all exist).
- Produces, on `useGame`:
  - `seat: Color | null` — online, the army played on this device; `null` means both are played here. Set from outside with `useGame.setState`.
  - `send: ((move: string) => void) | null` — online, called with a move made on this device in coordinate form (`"e2e4"`, `"b7a8n"`). `null` locks the board.
  - `sync(moves: string[]): Promise<void>` — brings the board to a move list in coordinate form. Resolves when the board matches.
  - `finish(result: Result): void` — ends the game with a given result. Does nothing if there already is one.
  - `submitMove(from, to, promotion?, remote?)` — the new fourth argument marks a move that came from the server, which is not passed to `send`.
  - `undo()` does nothing while `seat` is set.
- Also produces `isLocked(state): boolean` from `src/state/store.ts`: true when there is a seat and either `send` is `null` or it is not that seat's turn.

- [ ] **Step 1: Write the failing tests**

Change `src/state/store.test.ts`:

```diff
diff --git a/src/state/store.test.ts b/src/state/store.test.ts
index 3bd4a90..e849ce6 100644
--- a/src/state/store.test.ts
+++ b/src/state/store.test.ts
@@ -3,7 +3,10 @@ import { useGame } from './store';
 
 const game = () => useGame.getState();
 
-beforeEach(() => game().newGame());
+beforeEach(() => {
+  useGame.setState({ seat: null, send: null });
+  game().newGame();
+});
 
 async function play(...moves: string[]) {
   for (const move of moves) {
@@ -178,3 +181,101 @@ test('undo is ignored while a move is animating or a promotion is being chosen',
   expect(game().phase).toBe('promoting');
   expect(game().history).toHaveLength(8);
 });
+
+// Online: the device holds one seat, and the server's move list decides what the board shows.
+
+test('with a seat, input is taken only on that seat\'s turn', async () => {
+  const send = vi.fn();
+  useGame.setState({ seat: 'b', send });
+  game().select('e2');
+  expect(game().selected).toBeNull();
+  expect(game().submitText('e4')).toBe(false);
+
+  await game().sync(['e2e4']); // the other player's move, from the server
+  expect(game().history).toEqual(['e4']);
+  expect(send).not.toHaveBeenCalled(); // a move from the server is not sent back to it
+
+  expect(game().submitText('e5')).toBe(true);
+  expect(send).toHaveBeenCalledWith('e7e5');
+  await waitForIdle();
+  expect(game().submitText('Nf6')).toBe(false); // the turn has passed
+});
+
+test('with a seat, input is locked while the server is out of reach', () => {
+  useGame.setState({ seat: 'w', send: null });
+  game().select('e2');
+  expect(game().selected).toBeNull();
+  expect(game().submitText('e4')).toBe(false);
+});
+
+test('a promotion made online is sent with its piece', async () => {
+  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
+  const send = vi.fn();
+  useGame.setState({ seat: 'w', send });
+  game().select('b7');
+  game().select('a8');
+  game().choosePromotion('n');
+  await waitForIdle();
+  expect(send).toHaveBeenCalledWith('b7a8n');
+});
+
+test('sync does nothing when the board already matches', async () => {
+  await play('e4', 'e5');
+  const before = game().pieces;
+  await game().sync(['e2e4', 'e7e5']);
+  expect(game().pieces).toBe(before);
+});
+
+test('sync waits for a move in flight, then plays the one new move', async () => {
+  game().select('e2');
+  game().select('e4');
+  expect(game().phase).toBe('animating');
+  await game().sync(['e2e4', 'e7e5']);
+  expect(game().history).toEqual(['e4', 'e5']);
+  expect(game().snapshots).toHaveLength(2); // it went through submitMove, not a rebuild
+  expect(game().phase).toBe('idle');
+});
+
+test('sync rebuilds the board when the lists differ, and keeps every piece id', async () => {
+  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
+  await play('e4', 'e5');
+  await game().sync(['d2d4', 'd7d5', 'c2c4', 'd5c4', 'e2e4', 'b7b5', 'f1c4']);
+  expect(game().history).toEqual(['d4', 'd5', 'c4', 'dxc4', 'e4', 'b5', 'Bxc4']);
+  expect(game().pieces).toHaveLength(30);
+  expect(game().pieces.find((p) => p.square === 'c4')).toMatchObject({ id: 'w-b-f1' });
+  expect(game()).toMatchObject({ phase: 'idle', turn: 'b', lastMove: { from: 'f1', to: 'c4' }, selected: null });
+  // The rebuilt board is the one chess.js holds: the next move plays without the store's resync.
+  await play('bxc4');
+  expect(error).not.toHaveBeenCalled();
+  error.mockRestore();
+});
+
+test('sync rebuilds a finished game with its result', async () => {
+  await game().sync(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
+  expect(game()).toMatchObject({ phase: 'gameOver', result: { reason: 'checkmate', winner: 'b' } });
+});
+
+test('the newest list wins while a sync is waiting', async () => {
+  game().select('e2');
+  game().select('e4');
+  const first = game().sync(['e2e4', 'e7e5']);
+  const second = game().sync(['e2e4', 'e7e5', 'g1f3']);
+  await Promise.all([first, second]);
+  expect(game().history).toEqual(['e4', 'e5', 'Nf3']);
+});
+
+test('a result only the server knows ends the game', () => {
+  game().finish({ reason: 'timeout', winner: 'b' });
+  expect(game()).toMatchObject({ phase: 'gameOver', result: { reason: 'timeout', winner: 'b' } });
+  game().select('e2'); // no input after the game ends
+  expect(game().selected).toBeNull();
+  game().finish({ reason: 'resign', winner: 'w' }); // the first result stands
+  expect(game().result).toEqual({ reason: 'timeout', winner: 'b' });
+});
+
+test('undo does nothing online', async () => {
+  await play('e4');
+  useGame.setState({ seat: 'w', send: vi.fn() });
+  game().undo();
+  expect(game().history).toEqual(['e4']);
+});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/store.test.ts`
Expected: 10 failed, 18 passed. The failures are `game(...).sync is not a function`, `game(...).finish is not a function`, and the assertions of the three tests about input with a seat.

- [ ] **Step 3: Write the implementation**

Replace `src/state/store.ts` with:

```ts
import { Chess, type Color, type Move, type Square } from 'chess.js';
import { create } from 'zustand';
import { duck, fadeMusic, play } from '@/audio/audio';
import { planMove } from '@/game/planMove';
import { applyStep, matchesBoard, piecesFromBoard } from '@/game/position';
import { gameResult } from '@/game/result';
import { squareToWorld } from '@/game/squares';
import type { Piece, PromotionPiece, Result } from '@/game/types';
import { actors } from '@/scene/actors';
import { cameraRig } from '@/scene/cameraHandle';
import { runSteps } from '@/scene/sequencer';
import { CAMERA } from '@/scene/theme';

type Phase = 'idle' | 'animating' | 'promoting' | 'gameOver';

interface GameState {
  pieces: Piece[];
  selected: Square | null;
  targets: Move[]; // legal moves from the selected square
  phase: Phase;
  pendingPromotion: { from: Square; to: Square } | null;
  history: string[]; // SAN
  snapshots: Piece[][]; // `pieces` as they stood before each move; same length as `history`
  lastMove: { from: Square; to: Square } | null;
  turn: Color;
  inCheck: boolean;
  result: Result | null;
  cinematic: boolean; // letterbox bars are showing
  gameId: number; // changes on every new game
  seat: Color | null; // online: the army played on this device. null: both armies are played here
  send: ((move: string) => void) | null; // online: hands a move made here to the server; null while it is out of reach
  select(square: Square | null): void;
  /** `remote` marks a move that came from the server, which is not sent back to it. */
  submitMove(from: Square, to: Square, promotion?: PromotionPiece, remote?: boolean): Promise<void>;
  submitText(text: string): boolean;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  undo(): void;
  newGame(): void;
  /** Online: brings the board to the server's move list, given in coordinate form ("e2e4"). */
  sync(moves: string[]): Promise<void>;
  /** Online: ends the game with a result only the server can know, a flag or a resignation. */
  finish(result: Result): void;
}

/** Online, a device plays one army: on its turn, and only while the server can be reached. */
export const isLocked = (s: Pick<GameState, 'seat' | 'send' | 'turn'>) =>
  s.seat !== null && (!s.send || s.turn !== s.seat);

// chess.js is the single source of truth for rules and position.
const chess = new Chess();

let inFlight: Promise<void> = Promise.resolve(); // the move being animated; already settled when there is none
let latest: string[] = []; // the newest move list the server has sent
let syncing: Promise<void> | null = null; // the sync that is running, if any

const fresh = () => ({
  pieces: piecesFromBoard(chess),
  selected: null,
  targets: [],
  phase: 'idle' as Phase,
  pendingPromotion: null,
  history: [],
  snapshots: [] as Piece[][],
  lastMove: null,
  turn: 'w' as Color,
  inCheck: false,
  result: null as Result | null,
  cinematic: false,
});

export const useGame = create<GameState>((set, get) => ({
  ...fresh(),
  gameId: 0,
  seat: null,
  send: null,

  select(square) {
    if (get().phase !== 'idle' || isLocked(get())) return;
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
    if (moves.length) play('select');
    set(moves.length ? { selected: square, targets: moves } : { selected: null, targets: [] });
  },

  async submitMove(from, to, promotion, remote = false) {
    const { phase } = get();
    if (phase !== 'idle' && phase !== 'promoting') return;
    let move: Move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return; // illegal move: ignore
    }
    // The move is shown at once and sent at the same time; it does not wait for the server's answer.
    if (!remote) get().send?.(move.lan);
    inFlight = animate(move);
    await inFlight;
  },

  submitText(text) {
    if (get().phase !== 'idle' || isLocked(get())) return false;
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
    if (pending && !isLocked(get())) void get().submitMove(pending.from, pending.to, piece);
  },

  cancelPromotion() {
    if (get().phase === 'promoting') set({ phase: 'idle', pendingPromotion: null });
  },

  /** Takes back one move by one side. The board jumps to the earlier position; nothing is animated. */
  undo() {
    const { phase, snapshots, seat } = get();
    if (seat || (phase !== 'idle' && phase !== 'gameOver') || !snapshots.length) return;
    chess.undo();
    if (phase === 'gameOver') fadeMusic(1, 800);
    play('select');
    const last = chess.history({ verbose: true }).at(-1);
    set({
      pieces: snapshots.at(-1)!, // the snapshot keeps every piece id, so no actor is rebuilt needlessly
      snapshots: snapshots.slice(0, -1),
      selected: null,
      targets: [],
      phase: 'idle',
      history: chess.history(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      turn: chess.turn(),
      inCheck: chess.inCheck(),
      result: null,
    });
  },

  newGame() {
    if (get().phase === 'animating') return;
    chess.reset();
    fadeMusic(1, 800);
    set({ ...fresh(), gameId: get().gameId + 1 });
  },

  sync(moves) {
    latest = moves;
    // One sync runs at a time. A list that arrives while it waits replaces the one it will use.
    syncing ??= (async () => {
      try {
        for (;;) {
          await inFlight;
          const local = chess.history({ verbose: true }).map((m) => m.lan);
          const target = latest;
          const agrees = local.every((lan, i) => lan === target[i]);
          if (agrees && target.length === local.length) return;
          if (agrees && target.length === local.length + 1 && get().phase === 'idle') {
            const next = target[local.length];
            const [from, to] = [next.slice(0, 2), next.slice(2, 4)] as Square[];
            await get().submitMove(from, to, next[4] as PromotionPiece | undefined, true);
            if (chess.history().length > local.length) continue; // played; look again for a newer list
          }
          rebuild(target);
          return;
        }
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  },

  finish(result) {
    if (get().result) return;
    play('gameover');
    fadeMusic(0.2, 1500);
    set({ phase: 'gameOver', result, selected: null, targets: [], pendingPromotion: null });
  },
}));

const { getState: get, setState: set } = useGame;

/** Plays a move chess.js has already accepted: runs its steps, then publishes the new position. */
async function animate(move: Move) {
  const steps = planMove(move, get().pieces);
  set({
    phase: 'animating',
    selected: null,
    targets: [],
    pendingPromotion: null,
    snapshots: [...get().snapshots, get().pieces],
  });
  await runSteps(steps, {
    actors,
    getPieces: () => get().pieces,
    setPieces: (pieces) => set({ pieces }),
    sound: play,
    camera: {
      focus(a, b) {
        set({ cinematic: true });
        duck(true);
        return cameraRig.focus(a, b);
      },
      reset() {
        set({ cinematic: false });
        duck(false);
        return cameraRig.reset();
      },
    },
  });
  if (!matchesBoard(get().pieces, chess)) {
    console.error('View out of sync with chess.js after', move.san, '— resyncing');
    set({ pieces: piecesFromBoard(chess) });
  }
  const result = gameResult(chess);
  if (result) {
    play('gameover');
    fadeMusic(0.2, 1500);
    const king = get().pieces.find((p) => p.type === 'k' && p.color === chess.turn());
    if (chess.isCheckmate() && king) {
      // hold on the mated king before the result is announced
      const at = squareToWorld(king.square);
      set({ cinematic: true });
      await cameraRig.focus(at, at, CAMERA.checkmateMs);
      set({ cinematic: false });
      void cameraRig.reset();
    }
  } else if (chess.inCheck()) {
    play('check');
  }
  set({
    phase: result ? 'gameOver' : 'idle',
    history: chess.history(),
    lastMove: { from: move.from, to: move.to },
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    result,
  });
}

/** Puts the board in the position after `moves`, with no animation. Replaying every move keeps each piece's id. */
function rebuild(moves: string[]) {
  chess.reset();
  let pieces = piecesFromBoard(chess);
  let last: Move | undefined;
  for (const lan of moves) {
    last = chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    for (const step of planMove(last, pieces)) pieces = applyStep(pieces, step);
  }
  const result = gameResult(chess);
  set({
    ...fresh(),
    pieces,
    phase: result ? 'gameOver' : 'idle',
    history: chess.history(),
    lastMove: last ? { from: last.from, to: last.to } : null,
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    result,
  });
}
```

What moved, for a reviewer comparing with the old file: the body of `submitMove` after `chess.move` is now the function `animate` at the bottom of the file, unchanged, so that `submitMove` can keep its promise in `inFlight` for `sync` to wait on. `rebuild` is new.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: 28 tests pass.

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 77 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
git commit -m "feat: let the store follow a server's move list"
```

---

### Task 4: The connection

**Files:**
- Create: `src/net/online.ts`, `src/net/online.test.ts`

**Interfaces:**
- Consumes: `useGame` with `seat`, `send`, `sync`, `finish`, `newGame` from Task 3; `useSettings` (`side`) from `src/state/settings.ts`; `createApp` from Task 2 (in the test only); the types of `src/net/protocol.ts`.
- Produces `useOnline` from `src/net/online.ts`, a Zustand hook whose state is:
  - `status: 'off' | 'connecting' | 'waiting' | 'playing'` — `waiting` is in a room whose opponent has not arrived; `playing` holds from then on, including after the game ends.
  - `roomId: string | null`
  - `clocks: { w: number; b: number }` — milliseconds left when the server last spoke; `clocksAt: number` — `performance.now()` at that moment; `running: 'w' | 'b' | null` — whose clock is running.
  - `connected: boolean` — the server has spoken on the current connection; `opponentOnline: boolean`.
  - `error: OnlineError | null`, with `type OnlineError = 'not-found' | 'full' | 'busy' | 'unreachable' | 'replaced'`. Cleared from outside with `useOnline.setState({ error: null })`.
  - `create(minutes: number): void`, `join(roomId: string): void`, `resign(): void`, `leave(): void`.
- Side effects the interface relies on: while in a room `useGame`'s `seat` is this device's colour; `leave()` and every failure set `seat` back to `null`, empty the board and remove `?room` from the address.

- [ ] **Step 1: Write the failing test**

Create `src/net/online.test.ts`:

```ts
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useGame } from '@/state/store';
import { createApp } from '../../server/app.ts';
import { useOnline } from './online';
import type { ClientEvents, CreateAck, RoomState, ServerEvents } from './protocol';

// This device's side of an online game, against the real server. The opponent is a bare socket.

type Client = Socket<ServerEvents, ClientEvents>;

const BOB = 'bob-player-id';
const online = () => useOnline.getState();
const game = () => useGame.getState();
const stored = new Map<string, string>();
const replaceState = vi.fn();
let app: ReturnType<typeof createApp>;
let port: number;
let skew: number; // milliseconds added to the server's clock
let bob: Client;

beforeEach(async () => {
  skew = 0;
  app = createApp({ now: () => Date.now() + skew });
  port = await app.listen(0);
  stored.clear();
  replaceState.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', `http://localhost:${port}`);
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', pathname: '/' });
  vi.stubGlobal('history', { replaceState });
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => stored.get(name) ?? null,
    setItem: (name: string, value: string) => void stored.set(name, value),
  });
  bob = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
});

afterEach(async () => {
  online().leave();
  bob.disconnect();
  await until(() => game().phase !== 'animating');
  await app.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function until(condition: () => boolean) {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 10));
}

const bobJoins = (roomId: string, playerId = BOB) =>
  new Promise((resolve) => bob.emit('join', { roomId, playerId }, resolve));
const bobMoves = (move: string) => new Promise((resolve) => bob.emit('move', move, resolve));

/** This device creates a room and plays the first army; Bob joins it. */
async function startGame() {
  online().create(5);
  await until(() => online().status === 'waiting');
  const roomId = online().roomId!;
  await bobJoins(roomId);
  await until(() => online().status === 'playing');
  return roomId;
}

test('a created room waits for an opponent, then both sides play', async () => {
  online().create(5);
  expect(online().status).toBe('connecting');
  await until(() => online().status === 'waiting');
  const roomId = online().roomId!;
  expect(replaceState).toHaveBeenLastCalledWith(null, '', `?room=${roomId}`);
  expect(game().seat).toBe('w');
  expect(game().submitText('e4')).toBe(false); // nobody to play against yet

  await bobJoins(roomId);
  await until(() => online().status === 'playing');
  expect(online()).toMatchObject({ running: 'w', connected: true, opponentOnline: true });
  expect(online().clocks.w).toBeGreaterThan(299_000);

  // A move made here reaches the opponent.
  const seen = new Promise<RoomState>((resolve) => bob.on('state', (s) => s.moves.length === 1 && resolve(s)));
  expect(game().submitText('e4')).toBe(true);
  expect((await seen).moves).toEqual(['e2e4']);
  await until(() => game().phase === 'idle' && online().running === 'b');
  expect(game().submitText('d4')).toBe(false); // the turn has passed

  // A move made there is played here.
  await bobMoves('e7e5');
  await until(() => game().history.length === 2);
  expect(game().history).toEqual(['e4', 'e5']);
  expect(online().running).toBe('w');

  // A resignation is a result only the server knows.
  bob.emit('resign', () => {});
  await until(() => game().result !== null);
  expect(game().result).toEqual({ reason: 'resign', winner: 'w' });
  expect(online().running).toBeNull();

  online().leave();
  expect(online()).toMatchObject({ status: 'off', roomId: null, error: null });
  expect(game()).toMatchObject({ seat: null, send: null });
  expect(replaceState).toHaveBeenLastCalledWith(null, '', '/');
  await until(() => game().history.length === 0 && game().result === null);
});

test('a room joined from a link gives the free seat', async () => {
  const made = await new Promise<CreateAck>((resolve) =>
    bob.emit('create', { playerId: BOB, color: 'w', minutes: 5 }, resolve),
  );
  if ('error' in made) throw new Error(made.error);
  await bobJoins(made.roomId);

  online().join(made.roomId);
  await until(() => online().status === 'playing');
  expect(game().seat).toBe('b');
  expect(game().submitText('e5')).toBe(false); // the first army moves first

  await bobMoves('e2e4');
  await until(() => game().history.length === 1);
  expect(game().submitText('e5')).toBe(true);
});

test('a room that does not exist returns to the menu with the reason', async () => {
  online().join('abcdefgh');
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', roomId: null, error: 'not-found' });
  expect(game().seat).toBeNull();
});

test('a server that cannot be reached is reported', async () => {
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:9'); // nothing listens there
  online().create(5);
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'unreachable' });
});

test('a refused move puts the board back to what the server has', async () => {
  await startGame();
  skew = 5 * 60_000; // this side's clock has run out, though the server's timer has not fired
  expect(game().submitText('e4')).toBe(true);
  await until(() => game().result !== null);
  expect(game()).toMatchObject({ history: [], result: { reason: 'timeout', winner: 'b' } });
});

test('a dropped connection locks the board, then picks the game up where the server has it', async () => {
  await startGame();
  expect(game().submitText('e4')).toBe(true);
  await until(() => game().phase === 'idle' && online().running === 'b');

  for (const socket of app.io.sockets.sockets.values()) if (socket.data.color === 'w') socket.conn.close();
  await until(() => !online().connected);
  expect(game().send).toBeNull();

  await bobMoves('e7e5'); // played while this device was away
  await until(() => online().connected);
  await until(() => game().history.length === 2);
  expect(game().history).toEqual(['e4', 'e5']);
  expect(game().submitText('Nf3')).toBe(true);
});

test('when the same player joins from another tab, this one returns to the menu', async () => {
  const roomId = await startGame();
  bob.disconnect();
  const tab: Client = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  tab.emit('join', { roomId, playerId: stored.get('chess.player')! }, () => {});
  await until(() => online().error !== null);
  expect(online()).toMatchObject({ status: 'off', error: 'replaced' });
  tab.disconnect();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/net/online.test.ts`
Expected: FAIL with `Cannot find module './online'`.

- [ ] **Step 3: Write the implementation**

Create `src/net/online.ts`:

```ts
import type { Color } from 'chess.js';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import type { ClientEvents, RoomState, ServerEvents } from './protocol';

// The connection to the game server. The interface reads `useOnline`; the board is driven through `useGame`.

export type OnlineError = 'not-found' | 'full' | 'busy' | 'unreachable' | 'replaced';

interface OnlineState {
  status: 'off' | 'connecting' | 'waiting' | 'playing'; // waiting: in a room, the opponent has not arrived
  roomId: string | null;
  clocks: Record<Color, number>; // milliseconds left when the server last spoke
  clocksAt: number; // performance.now() at that moment
  running: Color | null; // whose clock is running, by the server's move list
  connected: boolean; // the server has spoken on the current connection
  opponentOnline: boolean;
  error: OnlineError | null; // why the last room was left, when it was not the player's choice
  create(minutes: number): void;
  join(roomId: string): void;
  resign(): void;
  leave(): void;
}

const ACK_MS = 5000; // how long a move waits for the server's answer before it counts as lost

const idle = {
  status: 'off' as const,
  roomId: null,
  clocks: { w: 0, b: 0 },
  clocksAt: 0,
  running: null,
  connected: false,
  opponentOnline: false,
};

let socket: Socket<ServerEvents, ClientEvents> | null = null;
let moves: string[] = []; // the server's latest list: where the board returns when a move is refused
let visitId: string | undefined; // this browser's id when storage is blocked

/** This browser's identity: a secret between it and the server. Holding it is what proves a seat. */
function playerId(): string {
  try {
    const stored = localStorage.getItem('chess.player');
    if (stored) return stored;
  } catch {
    // storage is blocked: the id lasts for the visit, and a reload cannot reclaim the seat
  }
  // Not crypto.randomUUID(): it needs a secure context, which a phone on the local network does not have.
  visitId ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  try {
    localStorage.setItem('chess.player', visitId);
  } catch {
    // not saved
  }
  return visitId;
}

/** NEXT_PUBLIC_SERVER_URL, or port 3001 on the page's own host so a phone can reach a development server. */
const serverUrl = () => process.env.NEXT_PUBLIC_SERVER_URL ?? `${location.protocol}//${location.hostname}:3001`;

function hangUp() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export const useOnline = create<OnlineState>((set, get) => {
  /** Leaves the room for a fresh local game. `error` says why, when the player did not choose to. */
  function quit(error: OnlineError | null) {
    hangUp();
    moves = [];
    useGame.setState({ seat: null, send: null });
    // newGame() alone does nothing while a move is animating; sync([]) waits for that move first.
    void useGame
      .getState()
      .sync([])
      .then(() => useGame.getState().newGame());
    history.replaceState(null, '', location.pathname);
    set({ ...idle, error });
  }

  /** Hands a move made here to the server. Refused or lost, the board returns to the server's list. */
  function send(move: string) {
    socket?.timeout(ACK_MS).emit('move', move, (lost, reply) => {
      if (lost || 'error' in reply) void useGame.getState().sync(moves);
    });
  }

  function onState(state: RoomState) {
    if (get().status === 'connecting') {
      // The first word from this room: start from a clean board and make the page's address the invite link.
      useGame.getState().newGame();
      history.replaceState(null, '', `?room=${state.roomId}`);
    }
    moves = state.moves;
    useGame.setState({ seat: state.color, send: state.started ? send : null });
    set({
      status: state.started ? 'playing' : 'waiting',
      roomId: state.roomId,
      clocks: state.clocks,
      clocksAt: performance.now(),
      running: state.started && !state.result ? (state.moves.length % 2 ? 'b' : 'w') : null,
      connected: true,
      opponentOnline: state.opponentOnline,
    });
    void useGame
      .getState()
      .sync(state.moves)
      .then(() => {
        // Checkmate and draws are found by chess.js on this side; a flag or a resignation is not.
        if (state.result && get().roomId === state.roomId) useGame.getState().finish(state.result);
      });
  }

  /** Connects and enters `roomId`, or a new room with `minutes` a side when there is none yet. */
  function start(roomId: string | null, minutes: number) {
    hangUp();
    set({ ...idle, status: 'connecting', roomId, error: null });
    const opened: Socket<ServerEvents, ClientEvents> = io(serverUrl());
    socket = opened;
    const enter = (id: string) =>
      opened.emit('join', { roomId: id, playerId: playerId() }, (reply) => {
        if ('error' in reply) quit(reply.error === 'full' ? 'full' : 'not-found');
      });
    // Runs on the first connection and again on every reconnection: joining is how a seat is reclaimed.
    opened.on('connect', () => {
      const id = get().roomId;
      if (id) return void enter(id);
      const color = useSettings.getState().side;
      opened.emit('create', { playerId: playerId(), color, minutes }, (reply) => {
        if ('error' in reply) return quit(reply.error === 'busy' ? 'busy' : 'unreachable');
        set({ roomId: reply.roomId });
        enter(reply.roomId);
      });
    });
    opened.on('connect_error', () => {
      if (get().status === 'connecting') quit('unreachable'); // mid-game, socket.io keeps trying by itself
    });
    opened.on('disconnect', (reason) => {
      set({ connected: false });
      useGame.setState({ send: null }); // locks the board until the server speaks again
      if (reason === 'io server disconnect') quit('replaced'); // the same player joined from another tab
    });
    opened.on('state', onState);
  }

  return {
    ...idle,
    error: null,
    create: (minutes) => start(null, minutes),
    join: (roomId) => start(roomId, 0),
    resign: () => void socket?.emit('resign', () => {}),
    leave: () => quit(null),
  };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/net/online.test.ts`
Expected: 7 tests pass. The reconnection test takes about a second: that is socket.io-client's own delay before it tries again.

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 84 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/net/online.ts src/net/online.test.ts
git commit -m "feat: connect the game to the server"
```

---

### Task 5: Creating and joining a room from the menu

**Files:**
- Modify: `src/ui/i18n.ts`, `src/ui/MainMenu.tsx`, `src/ui/Game.tsx`, `src/scene/CameraRig.tsx`, `src/scene/Scene.tsx`

**Interfaces:**
- Consumes: `useOnline` (`status`, `roomId`, `error`, `create`, `join`, `leave`) from Task 4; `TIME_CONTROLS` from `src/net/protocol.ts`; `useGame`'s `seat` from Task 3.
- Produces, in `src/ui/i18n.ts`: `playOnline`, `timeControl`, `minutes(count)`, `createRoom`, `back`, `connecting`, `waitingOpponent`, `inviteLink`, `copyLink`, `copied`, and `onlineError`, a table keyed by `OnlineError`.
- Produces, in behaviour: `Game.tsx` shows the board when `useOnline`'s status becomes `playing` and the menu when it becomes anything else, and joins the room named by `?room=` when the page loads.

- [ ] **Step 1: Add the strings**

Change `src/ui/i18n.ts`:

```diff
diff --git a/src/ui/i18n.ts b/src/ui/i18n.ts
index add6070..c61a932 100644
--- a/src/ui/i18n.ts
+++ b/src/ui/i18n.ts
@@ -37,6 +37,23 @@ const en = {
     'This game needs WebGL 2, which this browser or device does not provide. You can still follow and enter moves in the panel.',
   mode: 'Mode',
   twoPlayers: 'Two players',
+  playOnline: 'Play online',
+  timeControl: 'Time for each side',
+  minutes: (count: number) => `${count} min`,
+  createRoom: 'Create room',
+  back: 'Back',
+  connecting: 'Connecting…',
+  waitingOpponent: 'Waiting for your opponent',
+  inviteLink: 'Send this link to your opponent',
+  copyLink: 'Copy link',
+  copied: 'Copied',
+  onlineError: {
+    'not-found': 'This room no longer exists.',
+    full: 'This room is full.',
+    busy: 'The server is full. Try again later.',
+    unreachable: 'The game server cannot be reached.',
+    replaced: 'This game was opened in another tab.',
+  },
   sideLabel: 'Army nearest you',
   start: 'Start',
   resume: 'Continue',
@@ -93,6 +110,23 @@ const vi: Strings = {
     'Trò chơi cần WebGL 2 mà trình duyệt hoặc thiết bị này không hỗ trợ. Bạn vẫn có thể theo dõi và nhập nước đi ở bảng bên cạnh.',
   mode: 'Chế độ',
   twoPlayers: 'Hai người chơi',
+  playOnline: 'Chơi online',
+  timeControl: 'Thời gian mỗi bên',
+  minutes: (count) => `${count} phút`,
+  createRoom: 'Tạo phòng',
+  back: 'Quay lại',
+  connecting: 'Đang kết nối…',
+  waitingOpponent: 'Đang chờ đối thủ',
+  inviteLink: 'Gửi link này cho đối thủ',
+  copyLink: 'Sao chép link',
+  copied: 'Đã sao chép',
+  onlineError: {
+    'not-found': 'Phòng này không còn tồn tại.',
+    full: 'Phòng đã đủ người.',
+    busy: 'Máy chủ đang đầy. Hãy thử lại sau.',
+    unreachable: 'Không kết nối được máy chủ trò chơi.',
+    replaced: 'Ván này đã được mở ở một tab khác.',
+  },
   sideLabel: 'Phe đứng gần bạn',
   start: 'Bắt đầu',
   resume: 'Tiếp tục',
```

- [ ] **Step 2: Add the online panel to the menu**

Replace `src/ui/MainMenu.tsx` with:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useOnline } from '@/net/online';
import { TIME_CONTROLS } from '@/net/protocol';
import { TEAM } from '@/scene/theme';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useT } from './i18n';

const primary = 'min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500 disabled:opacity-50';
const secondary = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';
const pressed = 'aria-pressed:border-amber-500 aria-pressed:bg-stone-800';

/** The opening screen: a layer over the dimmed scene. `onPlay` shows the board. */
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const status = useOnline((s) => s.status);
  const failed = useOnline((s) => s.error !== null);
  const [chosen, setChosen] = useState(false); // the player pressed "Play online"
  // The online panel also shows while a room is being set up, and to say why the last one ended.
  const online = chosen || status !== 'off' || failed;

  function start() {
    newGame(); // also plays the fade from black and the camera descent
    onPlay();
  }

  function back() {
    setChosen(false);
    useOnline.setState({ error: null });
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {online ? t.playOnline : t.twoPlayers}
        </p>

        {/* Once a room exists the seat is fixed, so the choice is hidden. */}
        {status === 'off' && (
          <div role="group" aria-labelledby="side-label" className="flex flex-col gap-2">
            <span id="side-label" className="text-sm text-stone-300">
              {t.sideLabel}
            </span>
            <div className="flex gap-2">
              {(['w', 'b'] as const).map((color) => (
                <button
                  key={color}
                  aria-pressed={side === color}
                  disabled={animating} // a fight is using the camera
                  onClick={() => update({ side: color })}
                  className={`${secondary} ${pressed} flex flex-1 items-center justify-center gap-2`}
                >
                  <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
                  {t.team[color]}
                </button>
              ))}
            </div>
          </div>
        )}

        {online ? (
          <OnlinePanel onBack={back} />
        ) : (
          <>
            {inProgress ? (
              <>
                <button autoFocus onClick={onPlay} className={primary}>
                  {t.resume}
                </button>
                <button onClick={start} disabled={animating} className={secondary}>
                  {t.newGame}
                </button>
              </>
            ) : (
              <button autoFocus onClick={start} className={primary}>
                {t.start}
              </button>
            )}
            <button onClick={() => setChosen(true)} className={secondary}>
              {t.playOnline}
            </button>
            <button onClick={onSettings} className={secondary}>
              {t.settings}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Choosing a time and creating a room, then waiting in it with the invite link. */
function OnlinePanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const status = useOnline((s) => s.status);
  const roomId = useOnline((s) => s.roomId);
  const error = useOnline((s) => s.error);
  const create = useOnline((s) => s.create);
  const leave = useOnline((s) => s.leave);
  const animating = useGame((s) => s.phase === 'animating');
  const [minutes, setMinutes] = useState(10);
  const [copied, setCopied] = useState(false);
  const link = useRef<HTMLInputElement>(null);

  if (status === 'connecting') {
    return (
      <>
        <p role="status" className="text-center text-stone-300">
          {t.connecting}
        </p>
        <button autoFocus onClick={leave} className={secondary}>
          {t.cancel}
        </button>
      </>
    );
  }

  if (status === 'waiting' && roomId) {
    const url = `${location.origin}${location.pathname}?room=${roomId}`;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        link.current?.select(); // no clipboard here (an http page, or permission refused): copy by hand
      }
    };
    return (
      <>
        <p role="status" className="text-center text-stone-300">
          {t.waitingOpponent}
        </p>
        <label className="flex flex-col gap-2 text-sm text-stone-300">
          {t.inviteLink}
          <input
            ref={link}
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            className="min-h-11 rounded-lg bg-stone-800 px-3 py-2 text-stone-100"
          />
        </label>
        <button autoFocus onClick={copy} className={primary}>
          {copied ? t.copied : t.copyLink}
        </button>
        <button onClick={leave} className={secondary}>
          {t.cancel}
        </button>
      </>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {t.onlineError[error]}
        </p>
      )}
      <div role="group" aria-labelledby="time-label" className="flex flex-col gap-2">
        <span id="time-label" className="text-sm text-stone-300">
          {t.timeControl}
        </span>
        <div className="flex gap-2">
          {TIME_CONTROLS.map((value) => (
            <button
              key={value}
              aria-pressed={minutes === value}
              onClick={() => setMinutes(value)}
              className={`${secondary} ${pressed} flex-1`}
            >
              {t.minutes(value)}
            </button>
          ))}
        </div>
      </div>
      <button autoFocus onClick={() => create(minutes)} disabled={animating} className={primary}>
        {t.createRoom}
      </button>
      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}
```

- [ ] **Step 3: Join from the address, and let the server decide when the board shows**

Change `src/ui/Game.tsx`:

```diff
diff --git a/src/ui/Game.tsx b/src/ui/Game.tsx
index 26f4724..e5ad368 100644
--- a/src/ui/Game.tsx
+++ b/src/ui/Game.tsx
@@ -3,6 +3,7 @@
 import dynamic from 'next/dynamic';
 import { useEffect, useState } from 'react';
 import { setPaused } from '@/audio/audio';
+import { useOnline } from '@/net/online';
 import { useSettings } from '@/state/settings';
 import { Cinematic } from './Cinematic';
 import { GameOverModal } from './GameOverModal';
@@ -38,6 +39,21 @@ export function Game() {
 
   useEffect(() => setPaused(screen === 'paused'), [screen]);
 
+  // An invite link names its room in the address. Opening it joins that room straight away.
+  useEffect(() => {
+    const room = new URLSearchParams(window.location.search).get('room');
+    if (room) useOnline.getState().join(room);
+  }, []);
+
+  // Online, the server decides when the board shows: once both players are in the room.
+  useEffect(
+    () =>
+      useOnline.subscribe((now, before) => {
+        if (now.status !== before.status) setScreen(now.status === 'playing' ? 'playing' : 'menu');
+      }),
+    [],
+  );
+
   // Escape pauses. An open dialog (promotion, game over, the pause menu itself) handles its own Escape.
   useEffect(() => {
     if (screen !== 'playing') return;
```

The address is read from `window.location` in an effect, not with `useSearchParams`: the installed Next.js documents that hook as changing how the page is prerendered (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`). In development React runs the first effect twice; the second `join` hangs up the first connection, which is harmless.

- [ ] **Step 4: Stand the camera behind the seat**

Change `src/scene/CameraRig.tsx` and `src/scene/Scene.tsx`:

```diff
diff --git a/src/scene/CameraRig.tsx b/src/scene/CameraRig.tsx
index 35d35a2..c2e3716 100644
--- a/src/scene/CameraRig.tsx
+++ b/src/scene/CameraRig.tsx
@@ -16,8 +16,11 @@ export function CameraRig() {
   const camera = useRef<ComponentRef<typeof PerspectiveCamera>>(null!);
   const controls = useRef<ComponentRef<typeof OrbitControls>>(null!);
   const gameId = useGame((s) => s.gameId);
-  // The camera sits behind the army the player chose: on +z for the first army, on -z for the second.
-  const sign = useSettings((s) => (s.side === 'w' ? 1 : -1));
+  // The camera sits behind the player's army: their seat in an online game, otherwise the army chosen in
+  // the menu. That is +z for the first army and -z for the second.
+  const side = useSettings((s) => s.side);
+  const seat = useGame((s) => s.seat);
+  const sign = (seat ?? side) === 'w' ? 1 : -1;
   const settled = useRef(false); // false until the first placement
 
   useEffect(() => {
diff --git a/src/scene/Scene.tsx b/src/scene/Scene.tsx
index de943a8..5897535 100644
--- a/src/scene/Scene.tsx
+++ b/src/scene/Scene.tsx
@@ -28,7 +28,9 @@ function hasWebGL() {
 export default function Scene() {
   const pieces = useGame((s) => s.pieces);
   const select = useGame((s) => s.select);
-  const lightZ = useSettings((s) => (s.side === 'w' ? 6 : -6)); // the key light stays on the camera's side
+  const side = useSettings((s) => s.side);
+  const seat = useGame((s) => s.seat);
+  const lightZ = (seat ?? side) === 'w' ? 6 : -6; // the key light stays on the camera's side
   const [webgl] = useState(hasWebGL);
   const t = useT();
 
```

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 84 tests pass.

- [ ] **Step 6: Check it in the browser**

Start `chess-dev` and `chess-server`. Read "Two players on one computer" above first.

1. Open `http://localhost:3000`. The menu has a "Play online" button under Start. A local game still starts and plays from Start exactly as before; return to the menu through Pause.
2. Press "Play online". The mode line reads "Mode: Play online"; three time buttons show, 10 min pressed; "Create room" and "Back" show. "Back" returns to the first view.
3. Press "Create room". The panel reads "Waiting for your opponent" and shows a link ending in `?room=` and eight characters. The page's own address now ends the same way. "Copy link" changes to "Copied".
4. In a second tab open the same link on `b.localhost`. Both tabs leave the menu for the board. The first tab looks from behind the Amber army, the second from behind the Teal army.
5. In the first tab move a pawn. It walks in both tabs. In the second tab, clicking an Amber piece does nothing; move a Teal pawn and it walks in both.
6. Reload the second tab. It returns to the board in the same position, behind the Teal army.
7. Open `http://b.localhost:3000/?room=zzzzzzzz`. The menu shows "This room no longer exists." and the address loses `?room`.
8. In a third tab, on `http://c.localhost:3000`, open the link of the room from step 3. The menu shows "This room is full."
9. Stop `chess-server`. In a fresh tab press "Play online", then "Create room": after a moment the panel shows "The game server cannot be reached." Start `chess-server` again.
10. Switch the language to Tiếng Việt in Settings and repeat step 2: every string in the panel is Vietnamese.

Expected: all ten hold. The HUD does not show clocks yet; that is Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/ui/i18n.ts src/ui/MainMenu.tsx src/ui/Game.tsx src/scene/CameraRig.tsx src/scene/Scene.tsx
git commit -m "feat: create and join online rooms from the menu"
```

---

### Task 6: Clocks, connection notices, resigning and the end of the game

**Files:**
- Modify: `src/ui/i18n.ts`, `src/ui/Hud.tsx`, `src/ui/PauseMenu.tsx`, `src/ui/GameOverModal.tsx`

**Interfaces:**
- Consumes: `useOnline` (`clocks`, `clocksAt`, `running`, `connected`, `opponentOnline`, `resign`, `leave`) from Task 4; `isLocked` and `useGame`'s `seat` from Task 3; `TEAM` from `src/scene/theme.ts`.
- Produces, in `src/ui/i18n.ts`: `menu`, `you`, `reconnecting`, `opponentOffline`, `resign`, `resignConfirm`.

- [ ] **Step 1: Add the strings**

Change `src/ui/i18n.ts`:

```diff
diff --git a/src/ui/i18n.ts b/src/ui/i18n.ts
index c61a932..81e4072 100644
--- a/src/ui/i18n.ts
+++ b/src/ui/i18n.ts
@@ -24,6 +24,12 @@ const en = {
   moves: 'Moves',
   undo: 'Undo',
   pause: 'Pause',
+  menu: 'Menu',
+  you: 'you',
+  reconnecting: 'Reconnecting…',
+  opponentOffline: 'Opponent disconnected',
+  resign: 'Resign',
+  resignConfirm: 'Resign this game?',
   close: 'Close',
   promoteLabel: 'Choose a piece to promote to',
   promoteTo: 'Promote to',
@@ -97,6 +103,12 @@ const vi: Strings = {
   moves: 'Nước đi',
   undo: 'Đi lại',
   pause: 'Tạm dừng',
+  menu: 'Menu',
+  you: 'bạn',
+  reconnecting: 'Đang kết nối lại…',
+  opponentOffline: 'Đối thủ mất kết nối',
+  resign: 'Đầu hàng',
+  resignConfirm: 'Đầu hàng ván này?',
   close: 'Đóng',
   promoteLabel: 'Chọn quân để phong cấp',
   promoteTo: 'Phong cấp thành',
```

- [ ] **Step 2: Show the clocks and the connection in the HUD**

Change `src/ui/Hud.tsx`:

```diff
diff --git a/src/ui/Hud.tsx b/src/ui/Hud.tsx
index eeee47a..ed9e906 100644
--- a/src/ui/Hud.tsx
+++ b/src/ui/Hud.tsx
@@ -2,7 +2,9 @@
 
 import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
 import { play } from '@/audio/audio';
-import { useGame } from '@/state/store';
+import { useOnline } from '@/net/online';
+import { TEAM } from '@/scene/theme';
+import { isLocked, useGame } from '@/state/store';
 import { resultText, useT } from './i18n';
 import { Modal } from './Modal';
 
@@ -16,10 +18,11 @@ const button =
  */
 export function Hud({ onPause }: { onPause: () => void }) {
   const t = useT();
+  const online = useGame((s) => s.seat !== null);
   const [drawer, setDrawer] = useState(false);
   const pause = (
     <button onClick={onPause} className={button}>
-      {t.pause}
+      {online ? t.menu : t.pause /* an online game cannot be paused: the clocks keep running */}
     </button>
   );
 
@@ -30,6 +33,7 @@ export function Hud({ onPause }: { onPause: () => void }) {
         {pause}
       </div>
       <Status />
+      <Clocks />
       <div className="flex min-h-0 flex-1 flex-col gap-4 portrait:hidden">
         <MoveInput />
         <MoveList />
@@ -63,14 +67,24 @@ function Status() {
   const inCheck = useGame((s) => s.inCheck);
   const latest = useGame((s) => s.history.at(-1));
   const result = useGame((s) => s.result);
+  const seat = useGame((s) => s.seat);
+  const connected = useOnline((s) => s.connected);
+  const opponentOnline = useOnline((s) => s.opponentOnline);
   const mover = t.team[turn === 'w' ? 'b' : 'w']; // who made the latest move
   const outcome = result && resultText(t, result);
+  // Online, while the game is live: say so when either player has lost the server.
+  const trouble = !seat || result ? null : !connected ? t.reconnecting : !opponentOnline ? t.opponentOffline : null;
 
   return (
     <>
       <p className="portrait:min-w-0 portrait:flex-1 landscape:text-lg">
         {outcome ?? t.toMove(t.team[turn])}
         {!result && inCheck && <span className="ml-2 font-semibold text-red-400">{t.check}</span>}
+        {trouble && (
+          <span role="status" className="block text-sm text-amber-300">
+            {trouble}
+          </span>
+        )}
       </p>
       <p aria-live="polite" className="sr-only">
         {latest && t.played(mover, latest)} {outcome}
@@ -79,10 +93,52 @@ function Status() {
   );
 }
 
+/** Online only: both clocks. The server sends a time when something happens; in between, this counts down. */
+function Clocks() {
+  const t = useT();
+  const seat = useGame((s) => s.seat);
+  const clocks = useOnline((s) => s.clocks);
+  const clocksAt = useOnline((s) => s.clocksAt);
+  const running = useOnline((s) => s.running);
+  const [now, setNow] = useState(0);
+  useEffect(() => {
+    if (!running) return;
+    const timer = setInterval(() => setNow(performance.now()), 250);
+    return () => clearInterval(timer);
+  }, [running]);
+  if (!seat) return null;
+
+  return (
+    <div className="flex flex-col gap-1 font-mono portrait:text-sm">
+      {(['w', 'b'] as const).map((color) => {
+        // `now` is older than `clocksAt` until the first tick after a message, hence the floor at zero
+        const elapsed = color === running ? Math.max(0, now - clocksAt) : 0;
+        const seconds = Math.ceil(Math.max(0, clocks[color] - elapsed) / 1000);
+        return (
+          <p
+            key={color}
+            data-running={color === running}
+            className="flex items-center gap-2 rounded px-2 data-[running=true]:bg-amber-600/40 landscape:py-1"
+          >
+            <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
+            <span className="flex-1 font-sans portrait:sr-only">
+              {t.team[color]}
+              {color === seat && ` (${t.you})`}
+            </span>
+            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
+          </p>
+        );
+      })}
+    </div>
+  );
+}
+
 function UndoButton() {
   const t = useT();
   const undo = useGame((s) => s.undo);
   const possible = useGame((s) => (s.phase === 'idle' || s.phase === 'gameOver') && s.history.length > 0);
+  const online = useGame((s) => s.seat !== null);
+  if (online) return null; // a move made online cannot be taken back
   return (
     <button onClick={undo} disabled={!possible} className={button}>
       {t.undo}
@@ -93,14 +149,14 @@ function UndoButton() {
 function MoveInput() {
   const t = useT();
   const id = useId(); // the column and the drawer can both be in the page
-  const phase = useGame((s) => s.phase);
+  const locked = useGame((s) => s.phase !== 'idle' || isLocked(s)); // online: also when it is not this device's turn
   const submitText = useGame((s) => s.submitText);
   const [text, setText] = useState('');
   const [error, setError] = useState('');
 
   function onSubmit(event: FormEvent) {
     event.preventDefault();
-    if (phase !== 'idle') return;
+    if (locked) return;
     if (submitText(text)) {
       setText('');
       setError('');
@@ -120,7 +176,7 @@ function MoveInput() {
           id={id}
           value={text}
           onChange={(event) => setText(event.target.value)}
-          readOnly={phase !== 'idle'} // not disabled: that would drop keyboard focus after every move
+          readOnly={locked} // not disabled: that would drop keyboard focus after every move
           autoComplete="off"
           aria-describedby={error ? `${id}-error` : undefined}
           aria-invalid={error ? true : undefined}
@@ -128,7 +184,7 @@ function MoveInput() {
           className="min-h-11 min-w-0 flex-1 rounded-lg bg-stone-800 px-3 py-2 read-only:opacity-50"
         />
         <button
-          disabled={phase !== 'idle'}
+          disabled={locked}
           className="min-h-11 rounded-lg bg-amber-600 px-3 py-2 font-medium hover:bg-amber-500 disabled:opacity-50"
         >
           {t.move}
```

The clock's "now" is kept in state and set from a timer, not read with `performance.now()` while rendering: the lint rules for React forbid impure calls during render.

- [ ] **Step 3: Resign from the pause menu**

Replace `src/ui/PauseMenu.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { useOnline } from '@/net/online';
import { useGame } from '@/state/store';
import { useT } from './i18n';
import { Modal } from './Modal';

const button = 'min-h-11 rounded-lg border border-stone-600 px-4 py-2 hover:bg-stone-800 disabled:opacity-50';

/**
 * Local game: Resume, Restart, Settings, Main menu. Online the clocks keep running behind it, Restart
 * becomes Resign, and the main menu is offered only once the game is over, where it leaves the room.
 */
export function PauseMenu(props: { onResume: () => void; onSettings: () => void; onMenu: () => void }) {
  const t = useT();
  const hasMoves = useGame((s) => s.history.length > 0);
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const online = useGame((s) => s.seat !== null);
  const over = useGame((s) => s.result !== null);
  const resign = useOnline((s) => s.resign);
  const leave = useOnline((s) => s.leave);
  const [confirming, setConfirming] = useState(false);
  const title = online ? t.menu : t.paused;
  const question = online ? t.resignConfirm : t.restartConfirm;

  function restart() {
    newGame();
    props.onResume();
  }

  function giveUp() {
    resign(); // the server tells both players, and the game-over dialog follows
    props.onResume();
  }

  return (
    <Modal label={title} onCancel={props.onResume}>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="flex min-w-56 flex-col gap-2">
        <button
          autoFocus
          onClick={props.onResume}
          className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
        >
          {t.resume}
        </button>
        {online && over ? null : confirming ? (
          // Neither can be undone, so both ask first: a restart loses the game, a resignation ends it.
          <div role="group" aria-label={question} className="flex items-center gap-2">
            <span className="flex-1">{question}</span>
            <button autoFocus onClick={online ? giveUp : restart} disabled={!online && animating} className={button}>
              {t.yes}
            </button>
            <button onClick={() => setConfirming(false)} className={button}>
              {t.no}
            </button>
          </div>
        ) : online ? (
          <button onClick={() => setConfirming(true)} className={button}>
            {t.resign}
          </button>
        ) : (
          <button onClick={hasMoves ? () => setConfirming(true) : restart} disabled={animating} className={button}>
            {t.restart}
          </button>
        )}
        <button onClick={props.onSettings} className={button}>
          {t.settings}
        </button>
        {(!online || over) && (
          <button onClick={online ? leave : props.onMenu} className={button}>
            {t.mainMenu}
          </button>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Leave from the game-over dialog**

Change `src/ui/GameOverModal.tsx`:

```diff
diff --git a/src/ui/GameOverModal.tsx b/src/ui/GameOverModal.tsx
index cabe8da..71430f1 100644
--- a/src/ui/GameOverModal.tsx
+++ b/src/ui/GameOverModal.tsx
@@ -1,6 +1,7 @@
 'use client';
 
 import { useState } from 'react';
+import { useOnline } from '@/net/online';
 import { useGame } from '@/state/store';
 import { resultText, useT } from './i18n';
 import { Modal } from './Modal';
@@ -16,6 +17,8 @@ function Dialog() {
   const t = useT();
   const result = useGame((s) => s.result);
   const newGame = useGame((s) => s.newGame);
+  const online = useGame((s) => s.seat !== null);
+  const leave = useOnline((s) => s.leave);
   // Closing only hides the dialog so the final position can be studied.
   const [closed, setClosed] = useState(false);
   if (closed || !result) return null;
@@ -25,10 +28,10 @@ function Dialog() {
       <div className="flex flex-wrap gap-2">
         <button
           autoFocus
-          onClick={newGame}
+          onClick={online ? leave : newGame} // online there is no rematch: the room is left
           className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
         >
-          {t.newGame}
+          {online ? t.mainMenu : t.newGame}
         </button>
         <button
           onClick={() => setClosed(true)}
```

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: no type errors, no lint errors, 84 tests pass.

- [ ] **Step 6: Check it in the browser**

With both servers running, start an online game between `localhost` and `b.localhost` as in Task 5, with 5 minutes a side.

1. Both tabs show two clocks in the HUD. Each tab marks its own with "(you)". Amber's is highlighted and counts down; Teal's stands at 5:00.
2. Amber moves. In both tabs Amber's clock stops, Teal's is highlighted and counts down. The two tabs agree to the second.
3. There is no Undo button in either tab. The HUD button reads "Menu", not "Pause". In the tab whose turn it is not, the typed-move field is greyed and takes no text.
4. Play to a capture. The fight plays in both tabs and both move lists agree afterwards.
5. Close the second tab. Within a moment the first shows "Opponent disconnected" under the status line. Open the invite link on `b.localhost` again: the notice goes, and the second tab is in the same position with a clock that kept running while it was away.
6. Stop `chess-server` for a few seconds, then start it. While it is down the tabs show "Reconnecting…". When it is back, both return to the menu with "This room no longer exists.", because the rooms were in the server's memory.
7. Start another game. In one tab press Menu: the dialog is titled "Menu" and offers Continue, Resign and Settings, and no "Main menu". Press Resign, then No: nothing happens. Press Resign, then Yes.
8. Both tabs show the game-over dialog, "Resignation — … wins", naming the other army. Its first button reads "Main menu". "View board" hides it; Menu then offers "Main menu" where Resign was.
9. Press "Main menu". That tab returns to the menu with a fresh board, and its address has no `?room`. A local game started from there has an Undo button and no clocks.
10. At 375×812 the bar under the board shows the status, the two clocks stacked, Moves and Menu, with no sideways scroll.
11. In Tiếng Việt: the notices, "Menu", "Đầu hàng", the question and the result line are Vietnamese.

Expected: all eleven hold.

- [ ] **Step 7: Commit**

```bash
git add src/ui/i18n.ts src/ui/Hud.tsx src/ui/PauseMenu.tsx src/ui/GameOverModal.tsx
git commit -m "feat: show the clocks and let a player resign online"
```

---

### Task 7: The whole thing, end to end

**Files:**
- Modify: only what the checks below show to be wrong, and then this plan, to record the fix.

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new.

- [ ] **Step 1: Run every automated check**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: no type errors, no lint errors, 84 tests pass, and the build ends with the route table listing `/`.

Run: `PORT=3987 node server/index.ts`
Expected: `Game server listening on port 3987`, no warning. Stop it.

- [ ] **Step 2: Play one game to checkmate between two origins**

With both servers running, create a 5-minute room on `localhost` and join it from `b.localhost`. Play the fool's mate: Amber `f3`, Teal `e5`, Amber `g4`, Teal `Qh4`.

Expected: in both tabs the camera holds on Amber's king, then the dialog reads "Checkmate — Teal wins". Both clocks have stopped. "Main menu" leaves from each tab.

- [ ] **Step 3: Play one game with a promotion and typed moves**

In a new room, enter every move in the typed-move field, alternating tabs: `a4`, `b5`, `axb5`, `a6`, `bxa6`, `Bb7`, `axb7`, `Nc6`. Then in Amber's tab click the pawn on b7 and the rook on a8, and choose Knight.

Expected: the chooser opens only in Amber's tab; after the choice both tabs show a knight on a8 and `bxa8=N` in the move list.

- [ ] **Step 4: Check that a local game is untouched**

From the menu press Start. Play a few moves for both sides in one tab, undo one, pause, restart.

Expected: exactly the Phase 3 behaviour. No clocks, the button reads "Pause", Undo works, and nothing is sent: `chess-server`'s log shows no new connection.

- [ ] **Step 5: One pass with the keyboard only**

Reach "Play online", choose a time, create a room, cancel, and go back, using Tab, Shift+Tab, Enter and Escape only.

Expected: focus is always visible and never lands behind the menu.

- [ ] **Step 6: Record what was found**

If any step above needed a code change, make it with its own commit (`fix: …`), then add the fact to "Deviations from the spec" or to the task it belongs to in this file, and commit that as `docs: fold the fixes found during verification into the plan`.

If nothing needed changing, there is nothing to commit.
