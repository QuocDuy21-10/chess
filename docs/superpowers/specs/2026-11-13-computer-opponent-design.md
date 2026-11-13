# 3D Combat Chess — Computer Opponent

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

One person plays Combat Chess against the machine in the browser, at a
strength they choose, with or without a clock.

This is the second of three sub-projects of Phase 4 in `roadmap-2.md`. The
first, online rooms (`2026-11-12-online-play-design.md`), is merged into
`main`. The third, accounts and matchmaking, comes later.

## Decisions already made

| Question | Decision |
|---|---|
| Engine | Stockfish 19 from the npm package `stockfish` 19.0.1 (nmrugg/stockfish.js), the **lite single-threaded** build. |
| Delivery | The build's two files and its licence are copied into `public/engine/` and committed. The npm package (205 MB, all five builds) is not a dependency. |
| Where it runs | In a Web Worker in the browser. No server is needed to play the machine. |
| Strength | Four fixed levels: Beginner, Easy, Medium, Hard. The last choice is remembered. |
| Undo | Allowed. One press takes back the player's last move and the machine's reply. |
| Clocks | Optional: Unlimited, or 5, 10 or 30 minutes a side, no increment. The last choice is remembered. |
| Side | The player plays the army already chosen in the menu ("Army nearest you"). |

### Why this build

| Build | Size (js + wasm) | Threads | Needs COOP/COEP headers |
|---|---|---|---|
| Full | ≈94 MB | yes | yes |
| Full, single-threaded | ≈94 MB | no | no |
| Lite | ≈1.7 MB | yes | yes |
| **Lite, single-threaded** | **28 KB + 1.85 MB (≈1.2 MB gzipped)** | no | **no** |

The multi-threaded builds need `SharedArrayBuffer`, so the whole page would
have to send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. The second header blocks
cross-origin resources that do not opt in, and would put the Socket.IO
connection to port 3001 at risk. At human strength the extra threads buy
nothing. The lite network is weaker than the full one but far stronger than
any player, and the build runs on any static host with no configuration.

### Licence

Stockfish and stockfish.js are GPL-3.0. The engine runs as a separate program
in its own worker and talks to the game only through UCI text messages over
`postMessage`. The game serves the unmodified engine files together with
`Copying.txt` and names where the engine's source can be found. That is our
reading of the obligations, not legal advice. The game's own code is not
changed by this.

## Architecture

```
ui/MainMenu.tsx ──► engine/computer.ts (useComputer) ──► engine/uci.ts ──► Worker: /engine/stockfish-19-lite-single.js
                         │      ▲                              ▲
                         │      └── engine/levels.ts           └── engine/clock.ts (pure)
                         ▼
                 state/store.ts (seat, mode, send, sync, undo, finish)
```

The machine is a second player that drives the store from outside, the way
`net/online.ts` does. Chess rules, animation steps and fight choreography do
not change. The machine's move reaches the board through `sync()`, which
waits for the running animation, plays the move with the usual fight, and
keeps every piece id.

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `public/engine/` (new) | `stockfish-19-lite-single.js`, `stockfish-19-lite-single.wasm`, `Copying.txt`, unmodified from the npm tarball 19.0.1. | — |
| `engine/uci.ts` (new) | Wraps one Worker that speaks UCI: `start()`, `bestMove(moves, search)`, `newGame()`, `stop()`. Knows nothing about the store. Takes a Worker factory so tests pass a fake. | — |
| `engine/levels.ts` (new) | The four levels and the search each one runs: Skill Level, depth and time limits, the minimum think time. | — |
| `engine/clock.ts` (new) | Pure clock arithmetic: start, stop (charge the time used), pause, time left, flag. Time is passed in. | — |
| `engine/computer.ts` (new) | `useComputer`: level, time control, clocks, thinking, error. Starts and stops a game against the machine, asks the engine when it is the machine's turn, runs the clocks. | store, `uci.ts`, `levels.ts`, `clock.ts` |
| `state/store.ts` | Gains `mode`; `undo()` takes back a move pair against the machine; new pure `pliesToUndo`. | — |
| `state/settings.ts` | Gains `computerLevel` and `computerMinutes`, sanitized like the rest. | — |
| `ui/MainMenu.tsx` | "Play the computer" button and a `ComputerPanel`: level, time, Start, Back, error line. | `useComputer` |
| `ui/Hud.tsx` | "Computer is thinking…"; clocks read from the computer when it is playing; Undo follows the new rules; online checks use `mode`. | `useComputer` |
| `ui/PauseMenu.tsx`, `ui/GameOverModal.tsx` | Online checks use `mode`. Against the machine they behave as in a local game. | — |
| `ui/Settings.tsx` | One line naming the engine and its licence, linking to `/engine/Copying.txt` and the stockfish.js source. | — |
| `ui/Game.tsx` | Tells the computer when the board is not on screen (paused or in the menu), so its clocks stop. | `useComputer` |
| `ui/i18n.ts` | New strings, English and Vietnamese. | — |

No new npm dependencies.

## The store

### `mode`

Today several places read `seat !== null` as "this is an online game"
(`Hud`, `PauseMenu`, `GameOverModal`, `undo`). Against the machine the player
also holds one seat, so that reading no longer holds.

The store gains `mode: 'local' | 'online' | 'computer'`, set together with
`seat`:

- `net/online.ts` sets `mode: 'online'` with the seat, and `'local'` when it
  quits.
- `engine/computer.ts` sets `mode: 'computer'` with the seat, and `'local'`
  when it stops.

`seat` keeps its meaning: the army played on this device, `null` for both.
The camera and the key light already stand behind `seat`, so against the
machine they stand behind the player with no change. Every "online?" check
becomes `mode === 'online'`. `isLocked` does not change: it already locks the
board when it is not the seat's turn or when `send` is `null`.

### `send`

Against the machine `send` is the computer's `onPlayerMove`. The store calls
it the moment the player's move is accepted, before the animation, which is
exactly when the player's clock must stop. It is never `null` while a game
against the machine is on, so `isLocked` reduces to "not the player's turn".

### Undo

`undo()` keeps its current behaviour in a local game: one move back. Online
it still does nothing. Against the machine it takes back
`pliesToUndo(historyLength, turn, seat)` moves at once:

```ts
/** Against the machine: how many moves one Undo takes back, so it is the player's turn again
 *  in the position before their last move. 0 when the player has not moved yet. */
export function pliesToUndo(length: number, turn: Color, seat: Color): number
```

- The player to move (the usual case, and after the machine mates the
  player): 2, or 0 when `length < 2` (the player is Black and only the
  machine's first move has been played).
- The machine to move (only after the player mates or stalemates it, since
  otherwise Undo is not offered then): 1.

Undo is offered against the machine only when the store is `idle` on the
player's turn, or `gameOver`, and `pliesToUndo > 0`, and the game did not end
on time. The board jumps back with no animation, as it does today. The
snapshot taken `n` moves ago keeps every piece id. Undo does not touch the
clocks.

## The engine

### `engine/uci.ts`

```ts
type Search = { skill: number; depth?: number; movetime: number };

interface Engine {
  start(): Promise<void>;              // `uci` → `uciok`, then `isready` → `readyok`
  newGame(): Promise<void>;            // `ucinewgame`, `isready` → `readyok`
  bestMove(moves: string[], search: Search): Promise<string>; // "e2e4", "e7e8q"
  stop(): void;                        // terminates the worker; pending promises reject
}

export function createEngine(makeWorker = () => new Worker('/engine/stockfish-19-lite-single.js')): Engine
```

- `bestMove` sends `setoption name Skill Level value <skill>`,
  `position startpos moves <moves…>`, then `go movetime <movetime>` with
  `depth <depth>` added when the level has one, and resolves with the move
  from the next `bestmove` line.
- One search runs at a time. The computer never asks for a second one before
  the first has answered.
- The engine is created when the player presses Start against the machine,
  not before, so a local or online game never downloads it. It lives while
  the computer mode is on and is terminated when that mode stops.
- Failures reject: the worker's `error` event, `bestmove (none)`, a move
  string that is not 4–5 coordinate characters, or no `readyok` within 15
  seconds of `start()` (a slow download of 1.2 MB on a poor connection fits
  in that).

### Levels

| Level | Skill Level | Depth | Time limit |
|---|---|---|---|
| Beginner | 0 | 1 | 200 ms |
| Easy | 3 | 4 | 500 ms |
| Medium | 8 | 8 | 1000 ms |
| Hard | 20 | — | 1500 ms |

These are starting values, tuned by playing during implementation; the table
in `levels.ts` is the only place that changes. Every level also waits at
least 400 ms from the start of its turn before its move is played, so a quick
answer still feels like a reply.

With a clock, the time limit becomes `min(level limit, time left / 20)`, so
the machine does not lose on time by thinking.

## Turn flow

`useComputer` subscribes to the store. Whenever the store is `idle`, has no
result, the board is on screen, and it is the machine's turn, the computer:

1. starts the machine's clock;
2. asks the engine for a move with the current move list (from
   `chess.history`, in coordinate form) and the level's search;
3. when the answer arrives and at least 400 ms have passed, checks that the
   game it was asked for is still the current one (the store's `gameId` and
   the move count are unchanged), stops the machine's clock, and calls
   `sync([...moves, reply])`.

An answer for a game that has since been restarted, left or undone is
dropped. While the machine thinks, the board is locked by `isLocked` and the
status line says "Computer is thinking…".

When the player is Black, the machine's first move follows straight after the
camera's descent, by the same rule.

## Clocks

Only when a time control is chosen; with Unlimited no clock is shown or run.

- They are shown by the existing `Clocks` component in the HUD. It reads the
  same shape (`clocks`, `clocksAt`, `running`) from `useComputer` that it
  reads from `useOnline` online. The labels say "(you)" and "(computer)".
- The player's clock runs while the store is `idle` (or `promoting`) on the
  player's turn. It stops when `send` is called.
- The machine's clock runs from the start of its turn until its move is handed
  to `sync`.
- **Animation time, fights included, is charged to no one.** A clock starts
  only when the store returns to `idle`.
- **Pausing, or going back to the main menu, stops both clocks.** `Game.tsx`
  tells the computer whether the board is on screen. A reply that arrives
  while the board is off screen waits and is played when the player returns.
  No search starts while the board is off screen.
- A timer set to the running clock's time left ends the game with
  `finish({ reason: 'timeout', winner })`. As online, a flag always wins, even
  against a lone king.
- Undo does not change the clocks.

## Menu

```
Combat Chess
Mode: Play the computer
Army nearest you   [Amber] [Teal]

Strength   [Beginner] [Easy] [Medium] [Hard]
Time       [Unlimited] [5 min] [10 min] [30 min]
[        Start        ]
[        Back         ]
```

- The main menu gains "Play the computer" between Start and Play online. It
  opens `ComputerPanel`, which is built like the online panel: the choices,
  Start and Back. The chosen level and time are saved in settings.
- While a game against the machine is in progress, the menu shows Continue and
  New game, as it does for a local game. New game keeps the same level and
  time.
- Starting a two-player game or opening Play online turns the computer mode
  off.
- Restart in the pause menu and New game in the game-over dialog call the
  store's `newGame()` as today. The computer sees the new `gameId`, resets the
  clocks, sends `ucinewgame`, and plays first if the player is Black.

## Errors

- The engine fails to load or answer (old browser, download failure, worker
  error, timeout): the computer mode stops, the player is taken back to the
  menu, and the computer panel shows "The chess engine could not be started."
  Start tries again.
- The engine answers with a move the board refuses: treated the same way.
  `sync` already rebuilds the board from a list it cannot play, so the board
  never shows an illegal position.

## Testing

Unit tests in Vitest, as the project already does:

- `uci.ts` with a fake Worker: the commands sent for a search, reading
  `bestmove`, rejecting on `bestmove (none)`, a worker error, and the start
  timeout.
- `levels.ts`: the search for each level, and the time cap from a clock.
- `clock.ts`: charging the time used, pausing, the time left, the flag.
- `store.ts`: `pliesToUndo` for each case above; `undo()` against the machine
  takes back the pair and keeps piece ids; `mode` gates Undo online.
- `computer.ts` with a fake engine: the machine moves on its turn and only
  then, plays first as Black, drops an answer after New game or after
  leaving, waits while the board is off screen, ends the game on time, and
  falls back to the menu with an error when the engine fails.
- `settings.ts`: the two new fields are sanitized.

Before the work counts as done: `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build`, and a game against the machine played to a
result in the browser, at least once with a clock.

## Out of scope

- Hints, an evaluation bar, move analysis.
- The machine offering or accepting a draw, or resigning.
- Keeping a game against the machine across a page reload.
- An Elo number for each level.
- The multi-threaded or full-size engines.
