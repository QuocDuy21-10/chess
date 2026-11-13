# Computer Opponent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person plays Combat Chess against Stockfish in the browser, at one of four strengths, with or without a clock.

**Architecture:** Stockfish 19 lite single-threaded runs in a Web Worker served from `public/engine/`. A thin UCI wrapper (`engine/uci.ts`) talks to it. A zustand store (`engine/computer.ts`) plays the second seat from outside the game store, the way `net/online.ts` does: it watches `useGame`, asks the engine on the machine's turn, and plays the answer through `sync()`. It also runs the clocks, derived from the store's phase, so animations and pauses are charged to no one. The game store gains `mode` so "online?" checks stop reading `seat !== null`, and Undo takes back a move pair against the machine.

**Tech Stack:** Next.js 16.4.6 (App Router), React 19, zustand 5, chess.js 1.4, Vitest 5, Tailwind 4, Stockfish.js 19.0.1 (`stockfish-19-lite-single`).

**Spec:** `docs/superpowers/specs/2026-11-13-computer-opponent-design.md`

## Global Constraints

- Engine: npm `stockfish` 19.0.1, files `bin/stockfish-19-lite-single.js`, `bin/stockfish-19-lite-single.wasm`, and `Copying.txt`, copied unmodified to `public/engine/`. The package is **not** added to `package.json`.
- No new npm dependencies.
- No `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers.
- Levels: Beginner `skill 0, depth 1, 200 ms`; Easy `skill 3, depth 4, 500 ms`; Medium `skill 8, depth 8, 1000 ms`; Hard `skill 20, 1500 ms`. Minimum think time 400 ms. With a clock the time limit is `min(level limit, time left / 20)`.
- Time choices against the machine: Unlimited (0), 5, 10, 30 minutes a side, no increment.
- Engine start timeout: 15 seconds.
- Every visible string lives in `src/ui/i18n.ts`, English and Vietnamese. The `vi` table is typed `Strings`, so a missing key is a type error.
- Code comments explain *why* in plain sentences, matching the existing files. No `TODO`s.
- `AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js-specific code. The only Next.js feature used here is the `public` folder (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`: files in `public/` are served from `/`).
- Commit after each task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage the untracked files already in the tree (`.vitest/`, `3D-Stylized.md`, `chess.jpeg`, `design-3D.md`, `roadmap*.md`).
- Work on branch `computer-opponent` (already created from `main`; the spec is its first commit).

## File map

| File | Status | Responsibility |
|---|---|---|
| `public/engine/stockfish-19-lite-single.js`, `.wasm`, `Copying.txt` | new | The engine and its licence, unmodified |
| `eslint.config.mjs` | modify | Ignore `public/engine/**` (minified third-party code) |
| `src/engine/clock.ts` (+ test) | new | Pure clock arithmetic in the HUD's shape |
| `src/engine/levels.ts` (+ test) | new | Levels, time choices, the search per level |
| `src/engine/uci.ts` (+ test) | new | One Worker speaking UCI |
| `src/engine/computer.ts` (+ test) | new | `useComputer`: the machine as a second player, its clocks |
| `src/state/store.ts` (+ test) | modify | `mode`, `moveList`, `pliesToUndo`, `undoPlies`, pair Undo |
| `src/state/settings.ts` (+ test) | modify | `computerLevel`, `computerMinutes` |
| `src/net/online.ts` (+ test) | modify | Sets `mode` with the seat |
| `src/ui/Hud.tsx` | modify | `mode` checks, thinking line, computer clocks, Undo rule |
| `src/ui/PauseMenu.tsx`, `src/ui/GameOverModal.tsx` | modify | `mode` checks |
| `src/ui/MainMenu.tsx` | modify | "Play the computer" and `ComputerPanel` |
| `src/ui/Game.tsx` | modify | Board on screen → computer; engine error → menu |
| `src/ui/Settings.tsx` | modify | Engine credit and licence links |
| `src/ui/i18n.ts` | modify | New strings |

---

### Task 1: Ship the engine files and credit them

**Files:**
- Create: `public/engine/stockfish-19-lite-single.js`, `public/engine/stockfish-19-lite-single.wasm`, `public/engine/Copying.txt`
- Modify: `eslint.config.mjs`
- Modify: `src/ui/i18n.ts` (add `engineCredit`, `engineLicense`, `engineSource` to `en` and `vi`)
- Modify: `src/ui/Settings.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the URL `/engine/stockfish-19-lite-single.js` (the `.wasm` is fetched by the script from the same folder); strings `t.engineCredit`, `t.engineLicense`, `t.engineSource`.

- [ ] **Step 1: Copy the three files out of the npm tarball**

Work in a scratch directory, not the repo, so nothing is installed:

```bash
SCRATCH=$(mktemp -d)
(cd "$SCRATCH" && npm pack stockfish@19.0.1 --silent && tar xzf stockfish-19.0.1.tgz)
mkdir -p public/engine
cp "$SCRATCH/package/bin/stockfish-19-lite-single.js" "$SCRATCH/package/bin/stockfish-19-lite-single.wasm" "$SCRATCH/package/Copying.txt" public/engine/
ls -l public/engine
```

Expected: three files, about 28 KB, 1.85 MB and 35 KB. The tarball is 161 MB; the download takes a while.

- [ ] **Step 2: Check the engine runs**

Node treats `.js` under this repo's `"type": "module"` as ESM, so run the copy from the scratch folder:

```bash
(printf 'uci\nisready\nposition startpos moves e2e4\ngo depth 5\n'; sleep 3; echo quit) | node "$SCRATCH/package/bin/stockfish-19-lite-single.js" | grep -E 'uciok|readyok|bestmove'
```

Expected: `uciok`, `readyok`, and a `bestmove` line. Then `rm -rf "$SCRATCH"`.

- [ ] **Step 3: Keep ESLint off the minified engine**

In `eslint.config.mjs`, add `"public/engine/**"` to the `globalIgnores` list:

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Stockfish, minified third-party code shipped as is
    "public/engine/**",
  ]),
```

- [ ] **Step 4: Add the credit strings**

In `src/ui/i18n.ts`, after `done: 'Done',` in `en`:

```ts
  engineCredit: 'Computer opponent: Stockfish, GPL-3.0.',
  engineLicense: 'Licence',
  engineSource: 'Source code',
```

After `done: 'Xong',` in `vi`:

```ts
  engineCredit: 'Máy chơi cờ: Stockfish, giấy phép GPL-3.0.',
  engineLicense: 'Giấy phép',
  engineSource: 'Mã nguồn',
```

- [ ] **Step 5: Show the credit in Settings**

In `src/ui/Settings.tsx`, between the mute button and the Done button:

```tsx
        {/* Stockfish is GPL-3.0: the game serves its licence and says where its source is. */}
        <p className="text-xs text-stone-400">
          {t.engineCredit}{' '}
          <a href="/engine/Copying.txt" target="_blank" className="inline-flex min-h-11 items-center underline">
            {t.engineLicense}
          </a>
          {' · '}
          <a
            href="https://github.com/nmrugg/stockfish.js"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center underline"
          >
            {t.engineSource}
          </a>
        </p>
```

- [ ] **Step 6: Check and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (ESLint does not scan `public/engine/`).

```bash
git add public/engine eslint.config.mjs src/ui/i18n.ts src/ui/Settings.tsx
git commit -m "feat: ship the Stockfish engine and credit it in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Clock arithmetic

**Files:**
- Create: `src/engine/clock.ts`
- Test: `src/engine/clock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ClockState { clocks: Record<Color, number>; clocksAt: number; running: Color | null }`, the same field names `useOnline` exposes and `Hud`'s `Clocks` reads.
  - `newClocks(ms: number, now: number): ClockState`
  - `timeLeft(state: ClockState, color: Color, now: number): number`
  - `runClock(state: ClockState, color: Color | null, now: number): ClockState`
  - `flagged(state: ClockState, now: number): Color | null`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { flagged, newClocks, runClock, timeLeft } from './clock';

const MINUTE = 60_000;

test('new clocks are full and stopped', () => {
  const clocks = newClocks(5 * MINUTE, 100);
  expect(clocks).toEqual({ clocks: { w: 5 * MINUTE, b: 5 * MINUTE }, clocksAt: 100, running: null });
  expect(timeLeft(clocks, 'w', 9_999)).toBe(5 * MINUTE);
});

test('the running clock is charged the time it ran, and only that clock', () => {
  let clocks = runClock(newClocks(5 * MINUTE, 0), 'w', 1_000);
  expect(timeLeft(clocks, 'w', 8_000)).toBe(5 * MINUTE - 7_000);
  expect(timeLeft(clocks, 'b', 8_000)).toBe(5 * MINUTE);

  clocks = runClock(clocks, 'b', 8_000);
  expect(clocks).toEqual({ clocks: { w: 5 * MINUTE - 7_000, b: 5 * MINUTE }, clocksAt: 8_000, running: 'b' });

  clocks = runClock(clocks, null, 11_000);
  expect(clocks.clocks).toEqual({ w: 5 * MINUTE - 7_000, b: 5 * MINUTE - 3_000 });
  expect(timeLeft(clocks, 'b', 99_000)).toBe(5 * MINUTE - 3_000); // stopped: no longer charged
});

test('time left never goes below zero, and only a running clock at zero has flagged', () => {
  const clocks = runClock(newClocks(1_000, 0), 'b', 0);
  expect(flagged(clocks, 999)).toBeNull();
  expect(flagged(clocks, 1_000)).toBe('b');
  expect(timeLeft(clocks, 'b', 5_000)).toBe(0);
  expect(flagged(runClock(clocks, null, 5_000), 6_000)).toBeNull();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/engine/clock.test.ts`
Expected: FAIL, cannot resolve `./clock`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Color } from 'chess.js';

// The clocks of a game against the computer. Pure: the time is passed in, so tests need no waiting.
// The shape is the one the HUD already reads from the online connection.

export interface ClockState {
  clocks: Record<Color, number>; // milliseconds left as of `clocksAt`
  clocksAt: number; // performance.now() when `clocks` was last brought up to date
  running: Color | null;
}

export const newClocks = (ms: number, now: number): ClockState => ({
  clocks: { w: ms, b: ms },
  clocksAt: now,
  running: null,
});

export function timeLeft(state: ClockState, color: Color, now: number): number {
  const used = color === state.running ? now - state.clocksAt : 0;
  return Math.max(0, state.clocks[color] - used);
}

/** Charges the running clock up to `now`, then lets `color` run, or none. */
export function runClock(state: ClockState, color: Color | null, now: number): ClockState {
  return { clocks: { w: timeLeft(state, 'w', now), b: timeLeft(state, 'b', now) }, clocksAt: now, running: color };
}

/** The army whose running clock has reached zero, if any. */
export const flagged = (state: ClockState, now: number): Color | null =>
  state.running && timeLeft(state, state.running, now) === 0 ? state.running : null;
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/engine/clock.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/clock.ts src/engine/clock.test.ts
git commit -m "feat: add clock arithmetic for games against the computer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Levels and time choices

**Files:**
- Create: `src/engine/levels.ts`
- Test: `src/engine/levels.test.ts`

**Interfaces:**
- Consumes: `TIME_CONTROLS` from `@/net/protocol` (`[5, 10, 30]`).
- Produces:
  - `LEVELS = ['beginner', 'easy', 'medium', 'hard'] as const`, `type Level`
  - `COMPUTER_TIMES: number[]`, equal to `[0, 5, 10, 30]` (0 is no clock)
  - `interface Search { skill: number; depth?: number; movetime: number }`
  - `MIN_THINK_MS = 400`
  - `searchFor(level: Level, timeLeft?: number): Search`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { COMPUTER_TIMES, LEVELS, searchFor } from './levels';

test('each level runs its own search, weakest first', () => {
  expect(LEVELS.map((level) => searchFor(level))).toEqual([
    { skill: 0, depth: 1, movetime: 200 },
    { skill: 3, depth: 4, movetime: 500 },
    { skill: 8, depth: 8, movetime: 1000 },
    { skill: 20, movetime: 1500 },
  ]);
});

test('with a clock the machine spends at most a twentieth of its time, and never under 50 ms', () => {
  expect(searchFor('hard', 10 * 60_000).movetime).toBe(1500);
  expect(searchFor('hard', 10_000).movetime).toBe(500);
  expect(searchFor('beginner', 100).movetime).toBe(50);
  expect(searchFor('medium', 10_000)).toMatchObject({ skill: 8, depth: 8 });
});

test('the time choices are no clock and the online ones', () => {
  expect(COMPUTER_TIMES).toEqual([0, 5, 10, 30]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/engine/levels.test.ts`
Expected: FAIL, cannot resolve `./levels`.

- [ ] **Step 3: Write the implementation**

```ts
import { TIME_CONTROLS } from '@/net/protocol';

export const LEVELS = ['beginner', 'easy', 'medium', 'hard'] as const;
export type Level = (typeof LEVELS)[number];

/** Minutes a side against the computer. 0: no clock. */
export const COMPUTER_TIMES = [0, ...TIME_CONTROLS];

export interface Search {
  skill: number; // Stockfish's own weakening, 0 to 20
  depth?: number; // plies; none: the time limit alone stops the search
  movetime: number; // milliseconds
}

// Starting values, tuned by playing. This table is the only place a level's strength is set.
const SEARCH: Record<Level, Search> = {
  beginner: { skill: 0, depth: 1, movetime: 200 },
  easy: { skill: 3, depth: 4, movetime: 500 },
  medium: { skill: 8, depth: 8, movetime: 1000 },
  hard: { skill: 20, movetime: 1500 },
};

/** Every reply waits at least this long from the start of the machine's turn, so it never feels instant. */
export const MIN_THINK_MS = 400;

/** The search for `level`. With a clock it takes at most a twentieth of the time left, so the machine does not flag. */
export function searchFor(level: Level, timeLeft?: number): Search {
  const search = SEARCH[level];
  if (timeLeft === undefined) return search;
  return { ...search, movetime: Math.max(50, Math.min(search.movetime, Math.floor(timeLeft / 20))) };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/engine/levels.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/levels.ts src/engine/levels.test.ts
git commit -m "feat: add the computer's strength levels and time choices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The UCI wrapper

**Files:**
- Create: `src/engine/uci.ts`
- Test: `src/engine/uci.test.ts`

**Interfaces:**
- Consumes: `type Search` from `./levels`.
- Produces:
  - `type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>`
  - `interface Engine { start(): Promise<void>; bestMove(moves: string[], search: Search): Promise<string>; stop(): void }`
  - `createEngine(makeWorker?: () => WorkerLike): Engine`. By default it makes `new Worker('/engine/stockfish-19-lite-single.js')`.

The spec listed `newGame()` (`ucinewgame`) on the engine. It is left out: the command only clears the engine's hash, and sending it while a stale search is still running would need a command queue. The computer runs one search at a time and drops stale answers instead.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { createEngine, type WorkerLike } from './uci';

/** Stands in for the Stockfish worker: records what it is told and answers from a script. */
class FakeWorker {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  posted: string[] = [];
  terminated = false;
  constructor(private answer: (command: string) => string[] = stockfish) {}
  postMessage(command: string) {
    this.posted.push(command);
    for (const line of this.answer(command)) queueMicrotask(() => this.say(line));
  }
  terminate() {
    this.terminated = true;
  }
  say(line: string) {
    this.onmessage?.call(this as never, { data: line } as MessageEvent);
  }
  fail() {
    this.onerror?.call(this as never, {} as ErrorEvent);
  }
}

function stockfish(command: string): string[] {
  if (command === 'uci') return ['id name Stockfish 19', 'uciok'];
  if (command === 'isready') return ['readyok'];
  if (command.startsWith('go')) return ['info depth 1 score cp 20', 'bestmove e7e5 ponder g1f3'];
  return [];
}

function setup(answer?: (command: string) => string[]) {
  const worker = new FakeWorker(answer);
  return { worker, engine: createEngine(() => worker as unknown as WorkerLike) };
}

afterEach(() => void vi.useRealTimers());

test('start speaks UCI until the engine is ready', async () => {
  const { worker, engine } = setup();
  await engine.start();
  expect(worker.posted).toEqual(['uci', 'isready']);
});

test('a search sets the skill, the position and the limits, and answers with the best move', async () => {
  const { worker, engine } = setup();
  await engine.start();
  worker.posted = [];
  await expect(engine.bestMove(['e2e4'], { skill: 3, depth: 4, movetime: 500 })).resolves.toBe('e7e5');
  expect(worker.posted).toEqual([
    'setoption name Skill Level value 3',
    'position startpos moves e2e4',
    'go depth 4 movetime 500',
  ]);
});

test('from the first position there is no move list, and a level without a depth sends only the time', async () => {
  const { worker, engine } = setup();
  await engine.start();
  await engine.bestMove([], { skill: 20, movetime: 1500 });
  expect(worker.posted.slice(-2)).toEqual(['position startpos', 'go movetime 1500']);
});

test('a promotion comes back with its piece', async () => {
  const { engine } = setup((c) => (c.startsWith('go') ? ['bestmove a7a8q'] : stockfish(c)));
  await engine.start();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).resolves.toBe('a7a8q');
});

test('an answer with no move rejects', async () => {
  const { engine } = setup((c) => (c.startsWith('go') ? ['bestmove (none)'] : stockfish(c)));
  await engine.start();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).rejects.toThrow();
});

test('a worker error rejects what is pending', async () => {
  const { worker, engine } = setup((c) => (c.startsWith('go') ? [] : stockfish(c)));
  await engine.start();
  const search = engine.bestMove([], { skill: 0, movetime: 200 });
  worker.fail();
  await expect(search).rejects.toThrow();
});

test('an engine that never gets ready fails after 15 seconds', async () => {
  vi.useFakeTimers();
  const { engine } = setup(() => []);
  const started = expect(engine.start()).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(15_000);
  await started;
});

test('stop terminates the worker and rejects what is pending', async () => {
  const { worker, engine } = setup((c) => (c.startsWith('go') ? [] : stockfish(c)));
  await engine.start();
  const search = engine.bestMove([], { skill: 0, movetime: 200 });
  engine.stop();
  expect(worker.terminated).toBe(true);
  await expect(search).rejects.toThrow();
  await expect(engine.bestMove([], { skill: 0, movetime: 200 })).rejects.toThrow(); // and nothing after
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/engine/uci.test.ts`
Expected: FAIL, cannot resolve `./uci`.

- [ ] **Step 3: Write the implementation**

```ts
import type { Search } from './levels';

// One Stockfish worker, spoken to in UCI: text commands in, text lines out. Knows nothing about the game.

export type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

export interface Engine {
  /** Loads the engine and waits until it is ready. Rejects after 15 seconds. */
  start(): Promise<void>;
  /** The engine's move after `moves` (coordinate form, from the first position), e.g. "e7e5" or "a7a8q". */
  bestMove(moves: string[], search: Search): Promise<string>;
  /** Terminates the worker. Anything pending rejects. */
  stop(): void;
}

const START_MS = 15_000; // a slow download of the 1.2 MB engine fits in this
const MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function createEngine(
  makeWorker: () => WorkerLike = () => new Worker('/engine/stockfish-19-lite-single.js'),
): Engine {
  let worker: WorkerLike | null = null;
  // One request at a time: the line it waits for, and how to settle it.
  let waiting: { prefix: string; resolve: (line: string) => void; reject: (error: Error) => void } | null = null;

  function fail(error: Error) {
    const request = waiting;
    waiting = null;
    request?.reject(error);
  }

  /** Sends `commands`, then resolves with the first line the engine prints that starts with `prefix`. */
  function request(prefix: string, ...commands: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!worker) return reject(new Error('engine stopped'));
      waiting = { prefix, resolve, reject };
      for (const command of commands) worker.postMessage(command);
    });
  }

  function open() {
    const opened = makeWorker();
    opened.onmessage = (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!waiting || !line.startsWith(waiting.prefix)) continue;
        const request = waiting;
        waiting = null;
        request.resolve(line);
      }
    };
    opened.onerror = () => fail(new Error('engine error'));
    worker = opened;
  }

  return {
    async start() {
      open();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('engine timeout')), START_MS);
      });
      try {
        await Promise.race([request('uciok', 'uci').then(() => request('readyok', 'isready')), late]);
      } finally {
        clearTimeout(timer);
      }
    },

    async bestMove(moves, { skill, depth, movetime }) {
      const line = await request(
        'bestmove',
        `setoption name Skill Level value ${skill}`,
        moves.length ? `position startpos moves ${moves.join(' ')}` : 'position startpos',
        `go ${depth ? `depth ${depth} ` : ''}movetime ${movetime}`,
      );
      const move = line.split(' ')[1];
      if (!MOVE.test(move)) throw new Error(`no move in "${line}"`);
      return move;
    },

    stop() {
      worker?.terminate();
      worker = null;
      fail(new Error('engine stopped'));
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/engine/uci.test.ts && npx tsc --noEmit`
Expected: 8 passed; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/uci.ts src/engine/uci.test.ts
git commit -m "feat: talk to the Stockfish worker over UCI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The store learns `mode` and pair Undo

**Files:**
- Modify: `src/state/store.ts`
- Modify: `src/net/online.ts:77` and `:101` (set `mode` with `seat`)
- Modify: `src/ui/Hud.tsx`, `src/ui/PauseMenu.tsx`, `src/ui/GameOverModal.tsx` (online checks read `mode`)
- Test: `src/state/store.test.ts`, `src/net/online.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (all exported from `@/state/store`):
  - `type Mode = 'local' | 'online' | 'computer'`; `GameState.mode: Mode`, initially `'local'`
  - `moveList(): string[]`: the moves so far in coordinate form (`"e2e4"`)
  - `pliesToUndo(length: number, turn: Color, seat: Color): number`
  - `undoPlies(s): number`: how many moves `undo()` would take back now (0: Undo is unavailable). `s` is `Pick<GameState, 'mode' | 'phase' | 'snapshots' | 'turn' | 'seat' | 'result'>`.
  - `undo()` takes back `undoPlies(get())` moves.

- [ ] **Step 1: Write the failing tests**

In `src/state/store.test.ts`, change the import and `beforeEach`:

```ts
import type { Color } from 'chess.js';
import { beforeEach, expect, test, vi } from 'vitest';
import { moveList, pliesToUndo, useGame } from './store';
```

```ts
beforeEach(() => {
  useGame.setState({ seat: null, send: null, mode: 'local' });
  game().newGame();
});
```

Change the existing test `undo does nothing online` so it says it is online:

```ts
test('undo does nothing online', async () => {
  await play('e4');
  useGame.setState({ mode: 'online', seat: 'w', send: vi.fn() });
  game().undo();
  expect(game().history).toEqual(['e4']);
});
```

Append:

```ts
// Against the computer: the player holds one seat, and Undo takes back the machine's reply with the player's move.

test('the move list comes in coordinate form', async () => {
  await play('e4', 'e5', 'Nf3');
  expect(moveList()).toEqual(['e2e4', 'e7e5', 'g1f3']);
});

test.each([
  ['the player to move, after a pair', 4, 'w', 'w', 2],
  ['the player is Black and has not moved yet', 1, 'b', 'b', 0],
  ['nothing played', 0, 'w', 'w', 0],
  ['the machine to move, after the player mated it', 5, 'b', 'w', 1],
])('pliesToUndo: %s', (_name, length, turn, seat, expected) => {
  expect(pliesToUndo(length as number, turn as Color, seat as Color)).toBe(expected);
});

test("against the computer, undo takes back the machine's reply and the player's move", async () => {
  await play('e4', 'e5');
  const before = game().pieces;
  await play('Nf3', 'Nc6');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  game().undo();
  expect(game()).toMatchObject({ history: ['e4', 'e5'], turn: 'w', pieces: before, phase: 'idle' });
  expect(game().snapshots).toHaveLength(2);
});

test('against the computer, undo waits while the machine is to move, and is refused after a flag', async () => {
  await play('e4');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  game().undo(); // the machine is thinking
  expect(game().history).toEqual(['e4']);
  await game().sync(['e2e4', 'e7e5']); // its reply
  game().finish({ reason: 'timeout', winner: 'b' });
  game().undo();
  expect(game().history).toEqual(['e4', 'e5']);
});

test('against the computer, undo after the player mates the machine takes back that one move', async () => {
  await play('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6');
  useGame.setState({ mode: 'computer', seat: 'w', send: vi.fn() });
  await play('Qxf7#');
  expect(game().phase).toBe('gameOver');
  game().undo();
  expect(game()).toMatchObject({ phase: 'idle', turn: 'w', result: null });
  expect(game().history).toHaveLength(6);
});
```

In `src/net/online.test.ts`, in the test `a created room waits for an opponent, then both sides play`, replace `expect(game().seat).toBe('w');` with:

```ts
  expect(game()).toMatchObject({ seat: 'w', mode: 'online' });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/state/store.test.ts src/net/online.test.ts`
Expected: FAIL. `moveList` and `pliesToUndo` are not exported, and `mode` is undefined.

- [ ] **Step 3: Implement the store changes**

In `src/state/store.ts`:

1. Above `interface GameState`, add:

```ts
/** Who plays the other army: this device too, the server, or the computer. */
export type Mode = 'local' | 'online' | 'computer';
```

2. In `GameState`, after `send`:

```ts
  mode: Mode; // set together with `seat` by whoever drives the other army
```

3. Replace the `undo()` doc comment and signature line with:

```ts
  /** Takes back `undoPlies` moves at once. The board jumps to the earlier position; nothing is animated. */
  undo(): void;
```

4. After `isLocked`, add:

```ts
/** Against the computer: how many moves one Undo takes back, so that it is the player's turn again in the
 *  position before their last move. 0 when the player has not moved yet. */
export function pliesToUndo(length: number, turn: Color, seat: Color): number {
  if (turn !== seat) return Math.min(length, 1); // the machine is to move only after the player ended the game
  return length >= 2 ? 2 : 0;
}

/** How many moves Undo would take back now; 0 when it is not available. */
export function undoPlies(s: Pick<GameState, 'mode' | 'phase' | 'snapshots' | 'turn' | 'seat' | 'result'>): number {
  if (s.mode === 'online' || (s.phase !== 'idle' && s.phase !== 'gameOver')) return 0; // a move made online stands
  if (s.mode === 'local' || !s.seat) return Math.min(s.snapshots.length, 1);
  if (s.result?.reason === 'timeout') return 0; // the clock is at zero: taking moves back would not restart it
  if (s.phase === 'idle' && s.turn !== s.seat) return 0; // the machine is thinking
  return pliesToUndo(s.snapshots.length, s.turn, s.seat);
}
```

5. After the line `const chess = new Chess();`, add:

```ts
/** The moves so far in coordinate form ("e2e4", "e7e8q"), as the server and the engine speak them. */
export const moveList = () => chess.history({ verbose: true }).map((m) => m.lan);
```

6. In the store's initial values, after `send: null,`:

```ts
  mode: 'local',
```

7. Replace the body of `undo()`:

```ts
  undo() {
    const n = undoPlies(get());
    if (!n) return;
    const { phase, snapshots } = get();
    for (let i = 0; i < n; i++) chess.undo();
    if (phase === 'gameOver') fadeMusic(1, 800);
    play('select');
    const last = chess.history({ verbose: true }).at(-1);
    set({
      pieces: snapshots.at(-n)!, // the snapshot keeps every piece id, so no actor is rebuilt needlessly
      snapshots: snapshots.slice(0, -n),
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
```

8. In `sync`, replace `const local = chess.history({ verbose: true }).map((m) => m.lan);` with `const local = moveList();`.

- [ ] **Step 4: Set `mode` online**

In `src/net/online.ts`, in `quit`:

```ts
    useGame.setState({ seat: null, send: null, mode: 'local' });
```

In `onState`:

```ts
    useGame.setState({ seat: state.color, send: state.started ? send : null, mode: 'online' });
```

- [ ] **Step 5: Point the interface's online checks at `mode`**

`src/ui/Hud.tsx`:
- In `Hud`: `const online = useGame((s) => s.mode === 'online');`
- In `Status`, replace `const seat = useGame((s) => s.seat);` with `const online = useGame((s) => s.mode === 'online');`, and the `trouble` line with:

```ts
  const trouble = !online || result ? null : !connected ? t.reconnecting : !opponentOnline ? t.opponentOffline : null;
```

- In `Clocks`, add `const mode = useGame((s) => s.mode);` and replace `if (!seat) return null;` with `if (mode !== 'online') return null;`. Task 8 extends this.
- Replace `UndoButton` with:

```tsx
function UndoButton() {
  const t = useT();
  const undo = useGame((s) => s.undo);
  const possible = useGame((s) => undoPlies(s) > 0);
  const online = useGame((s) => s.mode === 'online');
  if (online) return null; // a move made online cannot be taken back
  return (
    <button onClick={undo} disabled={!possible} className={button}>
      {t.undo}
    </button>
  );
}
```

  and change the store import to `import { isLocked, undoPlies, useGame } from '@/state/store';`.

`src/ui/PauseMenu.tsx` and `src/ui/GameOverModal.tsx`: replace `const online = useGame((s) => s.seat !== null);` with `const online = useGame((s) => s.mode === 'online');`.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests pass, including the existing `undo takes back …`, `undo reopens a finished game` and online tests. No type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts src/net/online.ts src/net/online.test.ts src/ui/Hud.tsx src/ui/PauseMenu.tsx src/ui/GameOverModal.tsx
git commit -m "feat: give the store a mode and let Undo take back a move pair

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remember the computer's level and time

**Files:**
- Modify: `src/state/settings.ts`
- Test: `src/state/settings.test.ts`

**Interfaces:**
- Consumes: `LEVELS`, `type Level`, `COMPUTER_TIMES` from `@/engine/levels`.
- Produces: `useSettings` fields `computerLevel: Level` (default `'easy'`) and `computerMinutes: number` (default `0`, no clock).

- [ ] **Step 1: Write the failing test**

In `src/state/settings.test.ts`, extend `DEFAULTS`:

```ts
const DEFAULTS = {
  lang: 'en',
  side: 'w',
  musicVolume: 1,
  sfxVolume: 1,
  muted: false,
  computerLevel: 'easy',
  computerMinutes: 0,
} as const;
```

Append:

```ts
test("the computer's level and time are kept when valid, and fall back otherwise", () => {
  expect(sanitize({ computerLevel: 'hard', computerMinutes: 10 })).toMatchObject({
    computerLevel: 'hard',
    computerMinutes: 10,
  });
  expect(sanitize({ computerLevel: 'grandmaster', computerMinutes: 7 })).toMatchObject({
    computerLevel: 'easy',
    computerMinutes: 0,
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/state/settings.test.ts`
Expected: FAIL. `nothing stored gives the defaults` and the new test both miss the two fields.

- [ ] **Step 3: Implement**

In `src/state/settings.ts`:

```ts
import { COMPUTER_TIMES, LEVELS, type Level } from '@/engine/levels';
```

In `Values`, after `muted`:

```ts
  computerLevel: Level; // the strength last chosen against the computer
  computerMinutes: number; // the time a side last chosen against the computer; 0: no clock
```

In `sanitize`'s returned object, after `muted`:

```ts
    computerLevel: LEVELS.includes(s.computerLevel as Level) ? (s.computerLevel as Level) : 'easy',
    computerMinutes: COMPUTER_TIMES.includes(s.computerMinutes as number) ? (s.computerMinutes as number) : 0,
```

In the `persist` initial state, after `muted: false,`:

```ts
      computerLevel: 'easy',
      computerMinutes: 0,
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/state/settings.test.ts && npx tsc --noEmit`
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/state/settings.ts src/state/settings.test.ts
git commit -m "feat: remember the computer's strength and time control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The computer as a second player

**Files:**
- Create: `src/engine/computer.ts`
- Test: `src/engine/computer.test.ts`

**Interfaces:**
- Consumes:
  - From `@/state/store`: `useGame` (`gameId`, `phase`, `turn`, `seat`, `result`, `history`, `newGame()`, `sync(moves)`, `finish(result)`, `setState({ mode, seat, send })`) and `moveList()`.
  - From `@/state/settings`: `useSettings` (`side`, `computerLevel`, `computerMinutes`).
  - From `./clock`: `ClockState`, `newClocks`, `runClock`, `timeLeft`, `flagged`.
  - From `./levels`: `Level`, `searchFor`, `MIN_THINK_MS`.
  - From `./uci`: `Engine`, `createEngine`.
- Produces `useComputer`, a zustand store with:
  - `active: boolean`, `level: Level`, `minutes: number`, `thinking: boolean`, `onScreen: boolean`, `error: 'engine' | null`
  - `clocks`, `clocksAt`, `running` (`ClockState`)
  - `start(engine?: Engine): Promise<void>`, `stop(error?: 'engine'): void`, `setOnScreen(onScreen: boolean): void`

How the clocks are run: they are not started and stopped by events. After every change to the board or to `onScreen`, `update()` works out which clock should run: the side to move, while the store is `idle` or `promoting`, the engine is ready, the board is on screen, there is a clock, and there is no result. It then switches to that clock. The player's move sets `phase: 'animating'` in the same tick as `send`, so the player's clock stops at the moment of the move, which is what the spec's `onPlayerMove` was for. `send` is therefore a no-op that only unlocks `isLocked`.

**Deviation from the spec:** the machine's first move as Black follows the spec's rule, "when the store is `idle` on the machine's turn". In practice that can be during the camera's descent rather than after it. A pawn walking while the camera lowers needs no extra wait.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useSettings } from '@/state/settings';
import { useGame } from '@/state/store';
import { useComputer } from './computer';
import { MIN_THINK_MS, searchFor } from './levels';
import type { Engine } from './uci';

const game = () => useGame.getState();
const computer = () => useComputer.getState();

/** An engine whose searches wait until the test answers them. */
function fakeEngine() {
  const searches: { moves: string[]; resolve: (move: string) => void; reject: (error: Error) => void }[] = [];
  const engine = {
    start: vi.fn(() => Promise.resolve()),
    bestMove: vi.fn(
      (moves: string[]) => new Promise<string>((resolve, reject) => searches.push({ moves, resolve, reject })),
    ),
    stop: vi.fn(),
  } satisfies Engine;
  return { engine, searches };
}

/** Lets promises and the store's animations run until `condition` holds. */
async function until(condition: () => boolean) {
  for (let i = 0; i < 1000 && !condition(); i++) await Promise.resolve();
  expect(condition()).toBe(true);
}

/** The machine's latest search answers `move`; waits out the minimum think time and the animation. */
async function machinePlays(searches: ReturnType<typeof fakeEngine>['searches'], move: string) {
  const length = game().history.length;
  searches.at(-1)!.resolve(move);
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => game().history.length === length + 1 && game().phase !== 'animating');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  useSettings.setState({ side: 'w', computerLevel: 'easy', computerMinutes: 0 });
  computer().setOnScreen(true);
});

afterEach(async () => {
  computer().stop();
  useComputer.setState({ error: null });
  await until(() => game().mode === 'local' && game().history.length === 0 && game().phase === 'idle');
  vi.useRealTimers();
});

test('the machine answers on its turn, and only then', async () => {
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  expect(game()).toMatchObject({ mode: 'computer', seat: 'w' });
  expect(engine.bestMove).not.toHaveBeenCalled(); // the player has White

  expect(game().submitText('e4')).toBe(true);
  await until(() => searches.length === 1);
  expect(engine.bestMove).toHaveBeenCalledWith(['e2e4'], searchFor('easy'));
  expect(computer().thinking).toBe(true);
  expect(game().submitText('d4')).toBe(false); // locked while the machine thinks

  searches[0].resolve('e7e5');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS - 1);
  expect(game().history).toEqual(['e4']); // never an instant reply
  await vi.advanceTimersByTimeAsync(1);
  await until(() => game().history.length === 2 && game().phase === 'idle');
  expect(game().history).toEqual(['e4', 'e5']);
  expect(computer().thinking).toBe(false);
  expect(engine.bestMove).toHaveBeenCalledTimes(1);
});

test('as Black, the player waits for the machine to open', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  await until(() => searches.length === 1);
  expect(searches[0].moves).toEqual([]);
  await machinePlays(searches, 'e2e4');
  expect(game().history).toEqual(['e4']);
});

test('an answer for a game that was restarted is dropped', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  await until(() => searches.length === 1);
  game().newGame();
  searches[0].resolve('d2d4');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => searches.length === 2); // asked again, for the new game
  expect(game().history).toEqual([]);
  await machinePlays(searches, 'e2e4');
  expect(game().history).toEqual(['e4']);
});

test('nothing is searched or played while the board is off screen', async () => {
  useSettings.setState({ side: 'b' });
  const { engine, searches } = fakeEngine();
  computer().setOnScreen(false);
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(engine.bestMove).not.toHaveBeenCalled();

  computer().setOnScreen(true);
  await until(() => searches.length === 1);
  computer().setOnScreen(false); // paused while the machine thinks
  searches[0].resolve('e2e4');
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  expect(game().history).toEqual([]); // the answer waits

  computer().setOnScreen(true);
  await until(() => game().history.length === 1 && game().phase === 'idle');
  expect(game().history).toEqual(['e4']);
});

test('the clocks run for the side to move, and not during animations or pauses', async () => {
  useSettings.setState({ computerMinutes: 5 });
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  expect(computer()).toMatchObject({ running: 'w', clocks: { w: 300_000, b: 300_000 } });

  await vi.advanceTimersByTimeAsync(7_000);
  game().submitText('e4');
  expect(computer()).toMatchObject({ running: null, clocks: { w: 293_000, b: 300_000 } }); // the fight runs no clock

  await until(() => searches.length === 1);
  expect(computer().running).toBe('b');
  await vi.advanceTimersByTimeAsync(1_000);
  await machinePlays(searches, 'e7e5');
  // charged from the start of its turn to its move: the second waited, plus however far the fake timers ran on
  expect(computer().clocks.b).toBeLessThanOrEqual(299_000);
  expect(computer().clocks.b).toBeGreaterThanOrEqual(299_000 - MIN_THINK_MS);
  expect(computer().running).toBe('w');

  computer().setOnScreen(false);
  expect(computer().running).toBeNull();
  await vi.advanceTimersByTimeAsync(60_000);
  computer().setOnScreen(true);
  expect(computer()).toMatchObject({ running: 'w', clocks: { w: 293_000 } });
});

test('a clock that runs out ends the game for the other side', async () => {
  useSettings.setState({ computerMinutes: 5 });
  const { engine } = fakeEngine();
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(game().result).toEqual({ reason: 'timeout', winner: 'b' });
  expect(computer()).toMatchObject({ running: null, clocks: { w: 0, b: 300_000 } });
});

test('with no clock, none runs', async () => {
  const { engine } = fakeEngine();
  await computer().start(engine);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(computer().running).toBeNull();
  expect(game().result).toBeNull();
});

test('an engine that will not start sends the player back with an error and a fresh local game', async () => {
  const { engine } = fakeEngine();
  engine.start.mockRejectedValue(new Error('no wasm'));
  await computer().start(engine);
  expect(computer()).toMatchObject({ active: false, error: 'engine' });
  expect(game()).toMatchObject({ mode: 'local', seat: null, send: null });
  expect(engine.stop).toHaveBeenCalled();
});

test('a move the board refuses counts as a broken engine', async () => {
  const { engine, searches } = fakeEngine();
  await computer().start(engine);
  game().submitText('e4');
  await until(() => searches.length === 1);
  searches[0].resolve('e2e4'); // e2 is empty now
  await vi.advanceTimersByTimeAsync(MIN_THINK_MS);
  await until(() => computer().error === 'engine');
  await until(() => game().history.length === 0);
});

test('stopping leaves the computer mode and shuts the engine down', async () => {
  const { engine } = fakeEngine();
  await computer().start(engine);
  computer().stop();
  expect(engine.stop).toHaveBeenCalled();
  expect(computer()).toMatchObject({ active: false, error: null, running: null });
  expect(game()).toMatchObject({ mode: 'local', seat: null });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/engine/computer.test.ts`
Expected: FAIL, cannot resolve `./computer`.

- [ ] **Step 3: Write the implementation**

```ts
import { Chess, type Color } from 'chess.js';
import { create } from 'zustand';
import { useSettings } from '@/state/settings';
import { moveList, useGame } from '@/state/store';
import { flagged, newClocks, runClock, timeLeft, type ClockState } from './clock';
import { MIN_THINK_MS, searchFor, type Level } from './levels';
import { createEngine, type Engine } from './uci';

// The computer opponent. Like the online connection, it plays the other army from outside the game store:
// it watches `useGame`, asks the engine on its turn, and plays the answer through `sync`. The interface
// reads `useComputer`.

interface ComputerState extends ClockState {
  active: boolean; // a game against the computer is on
  level: Level;
  minutes: number; // a side; 0: no clock
  thinking: boolean;
  onScreen: boolean; // the board is showing: not paused, not in the menu
  error: 'engine' | null; // why the last game against the computer ended, when the player did not choose to
  /** Starts a game against the computer with the level, time and army chosen in settings. */
  start(engine?: Engine): Promise<void>;
  /** Leaves it for a fresh local game. */
  stop(error?: 'engine'): void;
  setOnScreen(onScreen: boolean): void;
}

let engine: Engine | null = null;
let ready = false; // the engine has answered `isready`
let searchingOn: Engine | null = null; // the engine running a search; each runs one at a time
let reply: { gameId: number; moves: string[] } | null = null; // an answer waiting for the board to be on screen
let gameId = -1; // the store's game the clocks belong to
let flagTimer: ReturnType<typeof setTimeout> | undefined;

const off = { active: false, thinking: false, clocks: { w: 0, b: 0 }, clocksAt: 0, running: null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when `moves` are legal from the first position. Keeps a broken engine from breaking the board. */
function legal(moves: string[]): boolean {
  const chess = new Chess();
  try {
    for (const lan of moves) chess.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] });
    return true;
  } catch {
    return false;
  }
}

export const useComputer = create<ComputerState>((set, get) => {
  /** Whose clock should be running. Animations, pauses, the menu and the engine's download run none. */
  function clockFor(): Color | null {
    const { active, minutes, onScreen } = get();
    const g = useGame.getState();
    if (!active || !ready || !minutes || !onScreen || g.result) return null;
    return g.phase === 'idle' || g.phase === 'promoting' ? g.turn : null;
  }

  function armFlag() {
    clearTimeout(flagTimer);
    const { running } = get();
    if (running) flagTimer = setTimeout(checkFlag, timeLeft(get(), running, performance.now()));
  }

  function checkFlag() {
    const now = performance.now();
    const loser = flagged(get(), now);
    if (!loser) return armFlag();
    set(runClock(get(), null, now));
    useGame.getState().finish({ reason: 'timeout', winner: loser === 'w' ? 'b' : 'w' });
  }

  /** Brings everything up to date with the board: the clocks, a waiting answer, the machine's turn. */
  function update() {
    if (!get().active) return;
    const g = useGame.getState();
    const now = performance.now();
    if (g.gameId !== gameId) {
      gameId = g.gameId; // a new game: Start, Restart or New game
      reply = null;
      set(newClocks(get().minutes * 60_000, now));
    }
    const color = clockFor();
    if (color !== get().running) {
      set(runClock(get(), color, now));
      armFlag();
    }
    if (!get().onScreen) return;
    if (reply) return play();
    if (ready && searchingOn !== engine && g.phase === 'idle' && !g.result && g.turn !== g.seat) void think();
  }

  async function think() {
    const mine = engine!;
    const id = useGame.getState().gameId;
    const moves = moveList();
    const began = performance.now();
    const { level, minutes } = get();
    searchingOn = mine;
    set({ thinking: true });
    let move: string;
    try {
      const left = minutes ? timeLeft(get(), useGame.getState().turn, began) : undefined;
      move = await mine.bestMove(moves, searchFor(level, left));
      await wait(MIN_THINK_MS - (performance.now() - began));
    } catch {
      if (engine === mine) get().stop('engine');
      return;
    } finally {
      if (searchingOn === mine) searchingOn = null;
    }
    if (engine !== mine) return; // stopped meanwhile
    set({ thinking: false });
    reply = { gameId: id, moves: [...moves, move] };
    update();
  }

  function play() {
    const { gameId: id, moves } = reply!;
    reply = null;
    const g = useGame.getState();
    // An answer for a position that is gone (a new game, a flag) is dropped; update() asks again if needed.
    if (id !== g.gameId || g.result || moves.slice(0, -1).join() !== moveList().join()) return update();
    if (!legal(moves)) return get().stop('engine');
    void g.sync(moves);
  }

  /** Shuts the engine and the clocks down, without touching the board. */
  function halt() {
    engine?.stop();
    engine = null;
    ready = false;
    reply = null;
    gameId = -1;
    clearTimeout(flagTimer);
    set(off);
  }

  useGame.subscribe(update);

  return {
    ...off,
    level: 'easy',
    minutes: 0,
    onScreen: false,
    error: null,

    async start(next = createEngine()) {
      halt();
      const { computerLevel: level, computerMinutes: minutes, side } = useSettings.getState();
      engine = next;
      set({ active: true, level, minutes, error: null });
      // Nothing to send: the store's phase stops the player's clock. A function keeps `isLocked` open.
      useGame.setState({ mode: 'computer', seat: side, send: () => {} });
      useGame.getState().newGame(); // a new gameId: update() starts fresh clocks
      try {
        await next.start();
      } catch {
        if (engine === next) get().stop('engine');
        return;
      }
      if (engine !== next) return; // stopped while loading
      ready = true;
      update();
    },

    stop(error) {
      const wasActive = get().active;
      halt();
      set({ error: error ?? null });
      if (!wasActive) return;
      useGame.setState({ mode: 'local', seat: null, send: null });
      // newGame() alone does nothing while a move is animating; sync([]) waits for that move first.
      void useGame
        .getState()
        .sync([])
        .then(() => useGame.getState().newGame());
    },

    setOnScreen(onScreen) {
      set({ onScreen });
      update();
    },
  };
});
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/engine/computer.test.ts`
Expected: 10 passed. If a test hangs on `until(...)`, the usual cause is an animation still running: check that the condition waits for `phase !== 'animating'`.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass. The store tests are unaffected: `useComputer` is not imported there, so its subscription does not exist in that test file.

- [ ] **Step 6: Commit**

```bash
git add src/engine/computer.ts src/engine/computer.test.ts
git commit -m "feat: let the computer play the other army, with clocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Menu, HUD and screens

**Files:**
- Modify: `src/ui/i18n.ts`
- Modify: `src/ui/MainMenu.tsx`
- Modify: `src/ui/Hud.tsx`
- Modify: `src/ui/Game.tsx`

**Interfaces:**
- Consumes: `useComputer` (Task 7); `LEVELS`, `COMPUTER_TIMES` (Task 3); `useSettings` `computerLevel`, `computerMinutes`, `update` (Task 6); `useGame` `mode` (Task 5).
- Produces: the screens the player uses. Nothing else depends on them.

- [ ] **Step 1: Add the strings**

In `src/ui/i18n.ts`, after `playOnline` in `en`:

```ts
  playComputer: 'Play the computer',
  strength: 'Strength',
  level: { beginner: 'Beginner', easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  unlimited: 'Unlimited',
  thinking: 'The computer is thinking…',
  computer: 'computer',
  engineError: 'The chess engine could not be started.',
```

After `playOnline` in `vi`:

```ts
  playComputer: 'Chơi với máy',
  strength: 'Độ mạnh',
  level: { beginner: 'Mới học', easy: 'Dễ', medium: 'Vừa', hard: 'Khó' },
  unlimited: 'Không giới hạn',
  thinking: 'Máy đang nghĩ…',
  computer: 'máy',
  engineError: 'Không khởi động được máy chơi cờ.',
```

- [ ] **Step 2: The main menu**

In `src/ui/MainMenu.tsx`, add the imports:

```ts
import { useComputer } from '@/engine/computer';
import { COMPUTER_TIMES, LEVELS } from '@/engine/levels';
```

Replace the body of `MainMenu`, from the line `const inProgress = …` up to the closing `</div>` of the inner panel, so that it reads:

```tsx
export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const t = useT();
  const side = useSettings((s) => s.side);
  const update = useSettings((s) => s.update);
  const computerOn = useComputer((s) => s.active);
  const computerFailed = useComputer((s) => s.error !== null);
  const stopComputer = useComputer((s) => s.stop);
  // A game against the computer can be resumed even before its first move.
  const inProgress = useGame((s) => s.history.length > 0 || s.result !== null) || computerOn;
  const animating = useGame((s) => s.phase === 'animating');
  const newGame = useGame((s) => s.newGame);
  const status = useOnline((s) => s.status);
  const failed = useOnline((s) => s.error !== null);
  const [panel, setPanel] = useState<'main' | 'online' | 'computer'>('main');
  // The online panel also shows while a room is being set up, and to say why the last one ended.
  const online = panel === 'online' || status !== 'off' || failed;
  // The computer panel also shows to say why the last game against the computer ended.
  const computer = !online && (panel === 'computer' || computerFailed);
  const mode = online ? t.playOnline : computer || computerOn ? t.playComputer : t.twoPlayers;

  /** A new game in the current mode. Also plays the fade from black and the camera descent. */
  function again() {
    newGame();
    onPlay();
  }

  /** A two-player game. Leaving the computer resets the board by itself. */
  function twoPlayers() {
    if (computerOn) stopComputer();
    else newGame();
    onPlay();
  }

  function back() {
    setPanel('main');
    useOnline.setState({ error: null });
    useComputer.setState({ error: null });
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl">
        <h1 className="text-center text-3xl font-bold">{t.title}</h1>
        <p className="text-center text-stone-300">
          {t.mode}: {mode}
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
        ) : computer ? (
          <ComputerPanel onBack={back} onPlay={onPlay} />
        ) : (
          <>
            {inProgress ? (
              <>
                <button autoFocus onClick={onPlay} className={primary}>
                  {t.resume}
                </button>
                <button onClick={again} disabled={animating} className={secondary}>
                  {t.newGame}
                </button>
              </>
            ) : (
              <button autoFocus onClick={twoPlayers} className={primary}>
                {t.start}
              </button>
            )}
            {computerOn && (
              <button onClick={twoPlayers} disabled={animating} className={secondary}>
                {t.twoPlayers}
              </button>
            )}
            <button onClick={() => setPanel('computer')} className={secondary}>
              {t.playComputer}
            </button>
            <button onClick={() => setPanel('online')} className={secondary}>
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
```

In `OnlinePanel`, a room replaces a game against the computer only when it is created, so looking at the panel and going back keeps that game. Change the Create room button's handler:

```tsx
      <button
        autoFocus
        onClick={() => {
          useComputer.getState().stop();
          create(minutes);
        }}
        disabled={animating}
        className={primary}
      >
```

Append the computer panel to the file:

```tsx
/** Choosing the computer's strength and the time, then starting. */
function ComputerPanel({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const t = useT();
  const level = useSettings((s) => s.computerLevel);
  const minutes = useSettings((s) => s.computerMinutes);
  const update = useSettings((s) => s.update);
  const failed = useComputer((s) => s.error !== null);
  const start = useComputer((s) => s.start);
  const animating = useGame((s) => s.phase === 'animating');

  function begin() {
    void start(); // the engine loads behind the camera's descent; the machine moves once it is ready
    onPlay();
  }

  return (
    <>
      {failed && (
        <p role="alert" className="text-sm text-red-400">
          {t.engineError}
        </p>
      )}
      <div role="group" aria-labelledby="level-label" className="flex flex-col gap-2">
        <span id="level-label" className="text-sm text-stone-300">
          {t.strength}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map((value) => (
            <button
              key={value}
              aria-pressed={level === value}
              onClick={() => update({ computerLevel: value })}
              className={`${secondary} ${pressed}`}
            >
              {t.level[value]}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby="computer-time-label" className="flex flex-col gap-2">
        <span id="computer-time-label" className="text-sm text-stone-300">
          {t.timeControl}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {COMPUTER_TIMES.map((value) => (
            <button
              key={value}
              aria-pressed={minutes === value}
              onClick={() => update({ computerMinutes: value })}
              className={`${secondary} ${pressed}`}
            >
              {value ? t.minutes(value) : t.unlimited}
            </button>
          ))}
        </div>
      </div>
      <button autoFocus onClick={begin} disabled={animating} className={primary}>
        {t.start}
      </button>
      <button onClick={onBack} className={secondary}>
        {t.back}
      </button>
    </>
  );
}
```

Remove the now-unused `chosen` state and the old `start` function.

- [ ] **Step 3: The HUD**

In `src/ui/Hud.tsx`, add `import { useComputer } from '@/engine/computer';`.

In `Status`, add `const thinking = useComputer((s) => s.thinking);`, and inside the first `<p>`, after the check `<span>`:

```tsx
        {!result && thinking && (
          <span role="status" className="block text-sm text-stone-300">
            {t.thinking}
          </span>
        )}
```

Replace `Clocks` with:

```tsx
/** Both clocks, online or against the computer. A time is known when something happens; in between, this counts down. */
function Clocks() {
  const t = useT();
  const seat = useGame((s) => s.seat);
  const mode = useGame((s) => s.mode);
  const online = useOnline((s) => s);
  const computer = useComputer((s) => s);
  const { clocks, clocksAt, running } = mode === 'computer' ? computer : online;
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  if (mode === 'local' || (mode === 'computer' && !computer.minutes)) return null;

  return (
    <div className="flex flex-col gap-1 font-mono portrait:text-sm">
      {(['w', 'b'] as const).map((color) => {
        // `now` is older than `clocksAt` until the first tick after a change, hence the floor at zero
        const elapsed = color === running ? Math.max(0, now - clocksAt) : 0;
        const seconds = Math.ceil(Math.max(0, clocks[color] - elapsed) / 1000);
        const who = color === seat ? t.you : mode === 'computer' ? t.computer : null;
        return (
          <p
            key={color}
            data-running={color === running}
            className="flex items-center gap-2 rounded px-2 data-[running=true]:bg-amber-600/40 landscape:py-1"
          >
            <span aria-hidden className="size-3 rounded-full" style={{ background: TEAM[color] }} />
            <span className="flex-1 font-sans portrait:sr-only">
              {t.team[color]}
              {who && ` (${who})`}
            </span>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: The screens**

In `src/ui/Game.tsx`, add `import { useComputer } from '@/engine/computer';` and, after the online status subscription:

```tsx
  // The computer's clocks run, and it plays, only while the board is on screen.
  useEffect(() => {
    useComputer.getState().setOnScreen(screen === 'playing');
  }, [screen]);

  // An engine that fails sends the player to the menu, where the computer panel says so.
  useEffect(
    () =>
      useComputer.subscribe((now, before) => {
        if (now.error && !before.error) setScreen('menu');
      }),
    [],
  );
```

- [ ] **Step 5: Check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/i18n.ts src/ui/MainMenu.tsx src/ui/Hud.tsx src/ui/Game.tsx
git commit -m "feat: play the computer from the menu, with its clocks in the HUD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify in the browser and tune the levels

**Files:**
- Modify (only if tuning is needed): `src/engine/levels.ts` and the matching expectations in `src/engine/levels.test.ts`

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: the build succeeds. `public/engine/*` is copied as static files.

- [ ] **Step 2: Start the dev server and open the game**

Use the preview tool with the `chess-dev` configuration from `.claude/launch.json` (port 3000). The game server (`chess-server`) is not needed.

- [ ] **Step 3: Check the engine loads**

Open Main menu → Play the computer → Hard, Unlimited → Start, playing White.
- In the network log, `/engine/stockfish-19-lite-single.js` and `/engine/stockfish-19-lite-single.wasm` load with status 200, the second as `application/wasm`.
- The console has no errors.

- [ ] **Step 4: Play a game to a result**

Still Hard, play `f3`, then `g4` after the machine's reply. Expected:
- "The computer is thinking…" shows during each machine turn, and the board ignores clicks then.
- The machine mates with `Qh4#` (or another mate) and the game-over dialog says Teal wins.
- Undo in that position takes back the mate and the player's `g4`, and leaves White to move.

- [ ] **Step 5: Play with a clock**

New game → menu → Play the computer → Beginner, 5 min, playing Teal (Black). Expected:
- The machine opens on its own.
- Both clocks show, labelled "(you)" and "(computer)", and only the side to move counts down.
- Clocks are frozen during a capture's fight and while the pause menu is open.
- Undo takes back a pair and leaves the clocks as they were.

Then stop moving and let the player's clock run out, with the board on screen. This takes up to 5 minutes of real time. Expected: "Time out — Amber wins", and Undo is disabled.

- [ ] **Step 6: Tune the levels**

Play about 10 moves against each level. Beginner should drop pieces now and then; Easy should be beatable by a casual player; Hard should not be. If Beginner plays too well, lower its depth (it is already the floor at `skill 0, depth 1`, so raise randomness by keeping `depth 1` and dropping `movetime` to 50). If Medium answers slower than about a second, lower its depth. Change only the `SEARCH` table in `levels.ts` and the first test in `levels.test.ts`, then:

Run: `npx vitest run src/engine/levels.test.ts`
Expected: pass.

- [ ] **Step 7: Check the error path**

In DevTools, block the request URL `/engine/stockfish-19-lite-single.wasm`, then start a game against the computer. Expected: the menu returns with "The chess engine could not be started." Unblock it and Start again: the game plays.

- [ ] **Step 8: Check the other modes are untouched**

- A two-player game: Undo takes back one move; no clocks.
- Settings shows the Stockfish credit line, and the Licence link opens `/engine/Copying.txt`.
- With `chess-server` running, a quick online room still connects. This checks that `mode: 'online'` is set and the HUD shows the online clocks.

- [ ] **Step 9: Final checks and commit**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all four succeed.

If tuning changed anything:

```bash
git add src/engine/levels.ts src/engine/levels.test.ts
git commit -m "chore: tune the computer's levels after playing them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
