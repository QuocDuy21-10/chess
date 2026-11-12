# 3D Combat Chess — Online Play

Date: 2026-11-12
Status: design approved in chat; spec awaiting review

## Goal

Two people on two devices play one game. One creates a room and sends an
invite link; the other opens it. A server validates every move, keeps the
clocks, and brings a player who lost the connection back into the game.

This is the first of three sub-projects of Phase 4 in `roadmap-2.md`. The
other two, each with its own spec, are the computer opponent (Stockfish) and
accounts with matchmaking.

## Decisions already made

| Question | Decision |
|---|---|
| Order of Phase 4 | Three sub-projects; online rooms first. |
| Clocks | Yes. The server keeps them. |
| Server | A separate Node + Socket.IO process in `server/` of this repo. Rooms live in memory. |
| Identity | No accounts yet. Each browser keeps a random `playerId`. |
| Time controls | 5, 10 or 30 minutes a side, no increment. The creator chooses. |
| Sides | The creator plays the army chosen in the menu; the guest gets the other. |
| Pages | Still one page. The invite link is `/?room=<id>`. |
| Rules | chess.js on both ends, same version. The server's copy decides. |

## Architecture

```
Browser A ─┐                         ┌─ server/index.ts   reads PORT and CLIENT_ORIGIN, listens
           ├─ src/net/online.ts ────►├─ server/app.ts     Socket.IO wiring, payload checks, flag timers
Browser B ─┘   (socket.io-client)    └─ server/rooms.ts   rooms, seats, chess.js, clocks; no sockets
                    │
                    ▼
            state/store.ts  ──►  chess.js, sequencer (unchanged)
```

Chess rules, animation steps and fight choreography do not change. A move
that arrives from the server goes through the same `submitMove` as a move
made on this device.

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `server/rooms.ts` (new) | Rooms, seats, move validation, clocks, results, expiry. Time is passed in, so tests need no real waiting. | chess.js, `game/result.ts` |
| `server/app.ts` (new) | Turns socket events into `rooms` calls and sends `state`. Checks every payload. Owns the flag timers and the sweep. | socket.io, `rooms.ts` |
| `server/index.ts` (new) | Entry point: environment, `listen`. | `app.ts` |
| `src/net/protocol.ts` (new) | Event names, payload types, the list of time controls. Shared by both ends. | — |
| `src/net/online.ts` (new) | The socket, `playerId`, the URL, and the `useOnline` store the interface reads. | socket.io-client, store |
| `src/game/result.ts` (new) | `gameResult(chess)`, moved out of the store so the server uses the same function. | chess.js |
| `state/store.ts` | `seat`, `send`, `sync`, `finish`; input is gated by seat. | — |
| `ui/MainMenu.tsx` | "Play online": time control, create, waiting screen with the link. | `useOnline` |
| `ui/Hud.tsx` | Clocks and connection lines; no Undo online. | `useOnline` |
| `ui/PauseMenu.tsx` | Online: Resign replaces Restart. | `useOnline` |
| `ui/GameOverModal.tsx` | Online: "Main menu" replaces "New game". | `useOnline` |
| `ui/Game.tsx` | Joins a room named in the URL; follows the online status between menu and board. | `useOnline` |
| `ui/i18n.ts`, `game/types.ts` | New strings; `Result` gains `timeout` and `resign`. | — |
| `scene/CameraRig.tsx` | Online, the camera stands behind the player's seat. | store |

New dependencies: `socket.io` and `socket.io-client` (both 4.8.x). Nothing
else. The server runs as `node server/index.ts`: Node 22.18 and later run
TypeScript files directly, which was checked on this machine (22.23.2). That
requires `import type` for every type-only import and a `.ts` extension on
every relative import in `server/` and in the files it loads from `src/`;
`tsconfig.json` gains `allowImportingTsExtensions`.

## Identity and seats

- On first use a browser makes a `playerId` with `crypto.randomUUID()` and
  keeps it in `localStorage['chess.player']`. If storage is blocked the id
  lasts for the visit, and a reload cannot reclaim the seat.
- The `playerId` is a secret between that browser and the server. It is never
  sent to the other player. Holding it is what proves a seat is yours.
- A room id is 8 URL-safe characters from `crypto.randomBytes(6)`.
- A room has two seats, `w` and `b`. `create` reserves the creator's seat.
  The first other `playerId` to join takes the free seat. Anyone after that
  gets `full`. There are no spectators.

## Protocol

Client to server. Every event has an acknowledgement.

| Event | Payload | Acknowledgement |
|---|---|---|
| `create` | `{ playerId, color, minutes }` | `{ roomId }` or `{ error: 'busy' \| 'bad-request' }` |
| `join` | `{ roomId, playerId }` | `{ ok: true }` or `{ error: 'not-found' \| 'full' \| 'bad-request' }` |
| `move` | a move in coordinate form, `"e2e4"` or `"e7e8q"` | `{ ok: true }` or `{ error: 'not-seated' \| 'not-started' \| 'over' \| 'not-your-turn' \| 'illegal' \| 'bad-request' }` |
| `resign` | none | `{ ok: true }` or `{ error: 'not-seated' \| 'not-started' \| 'over' }` |

`create` only makes the room. The creator then sends `join` like everyone
else, so first entry, a reload and a reconnect are one code path.

Server to client: one event.

```ts
interface RoomState {
  roomId: string;
  color: 'w' | 'b';                 // the seat of the player this copy is sent to
  moves: string[];                  // every move so far, in coordinate form
  started: boolean;                 // both seats are taken
  clocks: { w: number; b: number }; // milliseconds left, as of sending
  result: Result | null;
  opponentOnline: boolean;
}
```

The server sends the full `state` to both players after every change: a
join, a move, a resignation, a flag, a connection or a disconnection. There
is no separate "a move was made" event.

### What the server checks on `move`

1. The socket has joined a room and holds a seat.
2. Both seats are taken and the game has no result.
3. It is that seat's turn.
4. The mover's clock has not run out. If it has, the game ends on time and the
   move is refused.
5. The move is legal in the server's own chess.js.

Every payload is checked for type and shape before use: `playerId` and
`roomId` against a pattern, `color` against `w`/`b`, `minutes` against the
three time controls, the move against `/^[a-h][1-8][a-h][1-8][nbrq]?$/`.
Socket.IO's message size limit is lowered to 10 kB.

## Clocks

- Each side starts with the chosen minutes. There is no increment.
- The first army's clock starts when the second player joins.
- The server stores, per room, the time left for each side and the moment the
  running clock started. On a move it subtracts the elapsed time from the
  mover and starts the other clock.
- A timer in `app.ts` fires when the running clock would reach zero, ends the
  game as `{ reason: 'timeout', winner }` and sends `state`. `rooms.ts` also
  checks the flag itself on every move, so a late timer cannot let a move
  through.
- The clock runs while a player is disconnected. A player who never returns
  loses on time; there is no separate abandonment rule.
- The client only displays. It counts down from the last `clocks` it received
  for the side whose turn it is by the server's move list, and stops when
  there is a result.

Known limit: the clock runs during the fight animation, about 3 seconds for
each capture, because input is locked until the animation ends. Both sides pay
the same. If it proves annoying, the server can credit the receiving side a
fixed amount per capture; that is not built now.

A flag when the opponent has no mating material is scored as a win, not as the
draw the full rules give. chess.js has no ready test for one side's material.

## Client

### Store

```ts
seat: Color | null;                    // null: both sides are played on this device
send: ((move: string) => void) | null; // set by net/online.ts while in a room
sync(moves: string[]): Promise<void>;  // bring the board to the server's move list
finish(result: Result): void;          // a result only the server can know: timeout, resign
```

- With a seat, `select`, `submitText` and `choosePromotion` do nothing unless
  it is that seat's turn.
- A move made here is applied and animated at once, then passed to `send`.
  It is not held back for the server's answer.
- `submitMove` records the promise of the move in flight. `sync` waits for it,
  then compares the server's list with the local one:

| Server list compared with local | Action |
|---|---|
| Same | Nothing. |
| Local plus one move | Play that move through `submitMove`, animated. |
| Local minus the move just sent, not yet acknowledged | Nothing; the server has not processed it yet. |
| Anything else | Rebuild: reset chess.js, replay every move through `planMove` and `applyStep` with no animation, set the board. Piece ids stay stable because they are carried through the replay. |

- While a `sync` is waiting, a newer list replaces the one it will use. A tab
  that was in the background therefore catches up in one rebuild.
- A refused move clears the "just sent" marker and syncs again with the last
  list received, which rebuilds the board without that move.
- After a `sync`, if the server's `state` has a result and the store has none,
  `finish` sets it, plays `gameover` and fades the music, as a checkmate does.
  Checkmate and draws are still found locally by chess.js; the server reports
  the same thing.
- `undo` does nothing while there is a seat.

### `useOnline`

```ts
status: 'off' | 'connecting' | 'waiting' | 'playing'; // waiting: in a room, opponent not there yet
roomId: string | null;
clocks: { w: number; b: number };
clocksAt: number;            // performance.now() when `clocks` arrived
running: Color | null;       // whose clock is running, from the server's move list
connected: boolean;
opponentOnline: boolean;
error: 'not-found' | 'full' | 'busy' | 'unreachable' | 'replaced' | null;
create(minutes: number): void;
join(roomId: string): void;
resign(): void;
leave(): void;
```

- The socket is created on the first `create` or `join` and closed by `leave`.
  A player who never plays online never connects.
- The server address is `NEXT_PUBLIC_SERVER_URL`. When it is unset the client
  uses port 3001 on the page's own host, so a phone on the same network can
  reach a development server.
- `create` and `join` set the status to `connecting`. The first `state` for a
  room calls `newGame()` (reset, fade, camera descent), sets `seat` and
  `send`, and puts `?room` in the URL. The status is `waiting` while `started`
  is false and `playing` from then on, including after the game has ended.
- `leave` closes the socket, clears `seat` and `send`, calls `newGame()`,
  removes `?room` from the URL and sets the status to `off`.
- The URL is read from `window.location` in an effect and written with
  `history.replaceState`, which the installed Next.js documents for this use.
  `useSearchParams` is not used; it would change how the page is prerendered.

### Screens

**Main menu.** A "Play online" button under Start opens a panel in place of
the menu's buttons:

| Status | Panel |
|---|---|
| `off` | Time control (three buttons), "Create room", "Back". An error from the last attempt, if any. |
| `connecting` | "Connecting…", "Cancel". |
| `waiting` | "Waiting for your opponent", the invite link in a read-only field, "Copy link", "Cancel". |

"Copy link" uses `navigator.clipboard`; if that fails the field's text is
selected so it can be copied by hand. "Create room" is disabled while a move
is animating, as "New game" is.

`Game.tsx` shows the board when the status becomes `playing` and the menu when
it becomes anything else. Opening an invite link joins on load and goes
straight to the board once the state arrives.

**HUD.** Online it shows both clocks as `mm:ss`, the player's own marked
"(you)" and the running one highlighted. A line reads "Reconnecting…" while
the socket is down, or "Opponent disconnected" while the other seat is
offline. Undo is not shown. In the portrait bar the clocks take Undo's place.

**Pause menu.** Online, while the game is live, Restart is replaced by Resign,
which asks "Resign this game?" first, and "Main menu" is not shown. Once the
game is over "Main menu" is shown and leaves the room. The clocks do not stop
while the menu is open.

**Game over.** `Result` becomes:

```ts
type Result =
  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
```

The dialog reads "Time out — Teal wins" or "Resignation — Amber wins". Online,
its first button is "Main menu" (leave the room) instead of "New game".

**Camera.** Online, `CameraRig` stands behind `seat`. The persisted `side`
setting is not changed.

All new text goes through `useT()` in English and Vietnamese.

## Reconnecting

- socket.io-client reconnects by itself. On every `connect` the client sends
  `join` again; the server puts that socket back in the seat and sends
  `state`; `sync` does the rest.
- A reload does the same from `?room` in the URL and the stored `playerId`.
- When a second tab joins with the same `playerId`, it takes the seat. The
  server disconnects the first tab's socket; that tab leaves to the menu with
  "This game was opened in another tab".
- When a socket drops, the server marks the seat offline and sends `state` to
  the other player.

## Server lifetime and limits

- A room with no connected player for 10 minutes is deleted, whatever its
  state. A sweep runs every minute.
- At most 1000 rooms exist at once; `create` then answers `busy`.
- Rooms are in memory. A server restart ends every game; clients get
  `not-found` on their next `join` and return to the menu.
- `CLIENT_ORIGIN` set: only that origin may connect. Unset, for development:
  any origin. The server holds no cookies or sessions, so the origin check is
  not what protects a seat; the `playerId` is.

## Error handling

| Situation | Behaviour |
|---|---|
| Server unreachable on create or join | Status returns to `off` with `unreachable`; the menu shows it. |
| Link to a room that does not exist | Menu with "This room no longer exists"; `?room` is removed. |
| Link to a full room | Menu with "This room is full". |
| Move refused by the server | The board is rebuilt from the server's list. |
| Connection lost mid-game | "Reconnecting…"; input is locked until `state` arrives. |
| `localStorage` blocked | Play works for the visit; a reload cannot rejoin. |
| Malformed payload | The acknowledgement is `bad-request`; nothing else happens. |

## Running it

| | Command | Environment |
|---|---|---|
| Server, development | `npm run server` (`node --watch server/index.ts`) | `PORT` (3001) |
| Server, production | `node server/index.ts` | `PORT`, `CLIENT_ORIGIN` |
| Frontend | unchanged | `NEXT_PUBLIC_SERVER_URL`, read at build time |

`.claude/launch.json` gains a `chess-server` entry so the preview can start
both.

## Testing

Automated, with `vitest`:

| What | How |
|---|---|
| Seats: creator's seat, guest gets the other, third player is refused, same `playerId` gets its seat back | `server/rooms.test.ts` |
| Moves: an outsider, the wrong turn, an illegal move, a move before the guest arrives and a move after the result are refused | `server/rooms.test.ts` |
| Clocks: elapsed time is charged to the mover; the flag ends the game; a move after the flag is refused | `server/rooms.test.ts` with an injected clock |
| Resign, checkmate and stalemate results | `server/rooms.test.ts` |
| Expiry and the room limit | `server/rooms.test.ts` |
| The wire: create, join, a few moves, a refused move, drop and reconnect, a second tab taking the seat | `server/app.test.ts`: the real server on a free port and two `socket.io-client`s |
| Input gated by seat; `sync` in each of its four cases; piece ids unchanged after a rebuild; `finish` | `store.test.ts` |

In the browser preview, with two tabs:

- Create a room, copy the link, join from the second tab; both reach the
  board with the camera behind their own army.
- Play through a capture and a promotion; both boards and move lists agree.
- Reload one tab mid-game; it returns to the same position and seat.
- Stop and restart the server process mid-wait; the tab returns to the menu
  with a message.
- Resign; both tabs show the result; "Main menu" leaves.
- Both languages; the portrait bar at 375×812.

Not checked in the browser: a clock running out in real time. That is covered
by the injected-clock tests.

## Done when

- A room can be created, joined from a link, and played to checkmate, a draw,
  a flag or a resignation, with both boards in agreement throughout.
- The server refuses moves from anyone but the player to move and any move
  chess.js rejects.
- Both clocks count down and a flag ends the game.
- A dropped connection or a reload returns the player to the game.
- Local two-player games behave exactly as before.
- All automated tests, lint and the type check pass, and `node
  server/index.ts` starts.

## Out of scope

The computer opponent, accounts, matchmaking and ratings (the next two
sub-projects). Rematch in the same room, draw offers, spectators, chat,
increments, premoves. Redis and more than one server instance. Deploying the
server to a host. Rate limiting and the rest of the Phase 5 hardening.
Compensating the clock for animation time.
