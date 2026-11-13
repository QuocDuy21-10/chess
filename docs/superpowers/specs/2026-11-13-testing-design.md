# 3D Combat Chess — Tests: Chess-Rule Edge Cases, the Animation Sequencer, and E2E in Three Browsers

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

The rules' awkward corners (castling, en passant, promotion, every way a game can end, and the moves that must be
refused) are pinned down by tests on the server, in the site's store and in the animation sequencer, all from
one shared list of games, so the two ends can never quietly disagree. And on every pull request, the real game
(production site, real server, Postgres) is played end to end in Chromium, Firefox and WebKit before anything
can be deployed.

This is S3 of four sub-projects that carry out `roadmap-2.md` §4, Phase 5:

| | Sub-project | Builds on |
|---|---|---|
| S1 | CI/CD, deploy to the VPS, backups, logging and monitoring | — |
| S2 | Securing the API and WebSocket | S1 |
| **S3** | Tests: rule edge cases, the sequencer, Playwright E2E (this spec) | S1, S2 |
| S4 | Assets: cache headers, music size, loading the engine only when needed, bundle size | S1 |

S3 adds a job to S1's workflow, and its E2E runs under S2's CSP, Origin check and rate limits.

## Where things stand

- Vitest in `apps/server` and `apps/web`. `packages/shared` has no tests and no `test` script, so
  `gameResult` (`packages/shared/src/result.ts`), which both ends use to end a game, is untested on its own.
- `planMove.test.ts` (9 cases) covers each special move once; `sequencer.test.ts` (6 cases) runs steps with fake
  actors and checks their order; `store.test.ts` (27 cases) covers selection, typed moves, promotion, undo,
  online sync and the computer; `position.test.ts` checks the view stays equal to chess.js through one game;
  `rooms.test.ts` covers seats, clocks, refusals of out-of-turn and illegal moves, and limits.
- No test plays a castle into or through check, a late en passant, a pinned piece, or a promotion without a
  piece; nothing checks threefold repetition, the fifty-move rule or insufficient material.
- chess.js 1.4 refuses `{ from: 'a7', to: 'a8' }` without `promotion` ("Invalid move"); `rooms.move` turns that
  into `illegal`.
- No browser tests. Moves can be typed in the HUD (`<input>` labelled "Type a move", placeholder `Nf3 / g1f3`),
  so a browser test never has to click the 3D canvas. `tween.ts` skips every tween when
  `prefers-reduced-motion: reduce`, which Playwright can emulate, so captures do not slow a test down.
- CI (`.github/workflows/ci.yml`): `check` → `image` → `deploy`.

## Decisions already made

| Question | Decision |
|---|---|
| Rule tests | One catalog of named games in `@chess/shared/testing`, replayed by `gameResult`, `rooms`, the store and the sequencer; FEN cases for what cannot be reached from the start in a few moves. |
| E2E scope | Offline (two players on one device, the computer, settings) and online (two browsers through the real server and Postgres). |
| E2E sign-in | Sessions created in the database before the tests; OAuth is never used. |
| E2E runner | `@playwright/test` pinned at exactly **1.64.1** (released 2026-10-14; 1.65.0 is eight days old). A new workspace, `e2e/`. |
| E2E in CI | On every pull request and push, a matrix job per browser, in parallel with `check`. `image` needs both. |

## Shared catalog (`packages/shared/src/testing/games.ts`)

Exported as `@chess/shared/testing` (a new entry in `packages/shared/package.json`'s `exports`). Only tests import
it.

```ts
import type { Result } from '../result.ts';

export interface CatalogGame {
  name: string;
  moves: string[]; // coordinate form (e2e4, e7e8n), from the starting position
  result: Result | null; // how the game has ended after the last move, or null while it goes on
}

export const GAMES: CatalogGame[];

export interface Refusal {
  name: string;
  moves: string[]; // played first, all legal
  refused: string; // then this one, which must be refused
}

export const REFUSALS: Refusal[];
```

`GAMES`, one entry each:

| Name | What it covers | Result |
|---|---|---|
| `fools-mate` | the shortest mate | checkmate, black wins |
| `scholars-mate` | a mate that captures | checkmate, white wins |
| `castles` | white castles king-side, black queen-side | null |
| `en-passant` | white takes en passant, later black does | null |
| `underpromotion` | a pawn captures onto the last rank and becomes a knight | null |
| `promotion` | a pawn walks onto the last rank and becomes a queen | null |
| `stalemate` | Sam Loyd's ten-move stalemate | stalemate |
| `threefold` | knights out and back until the position repeats three times | threefold |

`REFUSALS`, one entry each: castling out of check; castling through an attacked square; castling after the king
has moved and come back; en passant one move too late; moving a pinned piece; a pawn onto the last rank with no
promotion piece (`a7a8`-style).

Every sequence is checked against chess.js when the plan is written, and again by the tests below.

## Unit tests (Vitest)

### `packages/shared`

Gains Vitest (as a dev dependency, same major as the other workspaces) and `"test": "vitest run"`, so the root
`npm test` runs it. No database.

`result.test.ts`:

- every `GAMES` entry, replayed on a `new Chess()`, gives `gameResult` equal to its `result` (and `null` before
  the last move);
- from FEN: the fifty-move rule (half-move clock at 99, then a quiet move); insufficient material for K v K,
  K+N v K, K+B v K and K+B v K+B with bishops on one colour, but not with bishops on different colours; a mate
  delivered on the hundredth half-move is a checkmate, not a draw; a check alone is not the end.

### `apps/server` (`rooms.test.ts`)

- Every `GAMES` entry, played by Ann (white) and Bob (black) through `rooms.move`, is accepted move by move;
  `rooms.record` then holds exactly those moves and the catalog's result (games with a null result have no
  record).
- Every `REFUSALS` entry: its `moves` are accepted, then `refused` gets `'illegal'` and the room's moves do not
  change.

### `apps/web` (`store.test.ts`)

- Every `GAMES` entry, typed through `submitText` with the animations awaited, keeps the view equal to chess.js
  after each move (`matchesBoard`) and ends with the catalog's result.
- Every `REFUSALS` entry: `submitText(refused)` returns `false` and changes nothing. (A typed `a7a8` matches no
  move, since chess.js spells promotions `a7a8q`; the chooser opens only when a pawn is moved by clicking, which
  `store.test.ts` already covers.)

### `apps/web` (`sequencer.test.ts`)

With the existing fake actors:

- for every `GAMES` entry and every half-move: `planMove` then `runSteps`; afterwards the pieces equal the
  board chess.js has (`matchesBoard`), and every piece keeps its id;
- order for the special moves: a castle walks the king before the rook hops; en passant fights the pawn beside
  the target square before stepping in; a capture that promotes fights, walks, then promotes, and the promoted
  piece keeps the pawn's id.

## E2E (`e2e/`, new workspace `@chess/e2e`)

### Layout

```
e2e/
  package.json            @chess/e2e: @playwright/test 1.64.1; scripts test (`node seed.ts && playwright test`), report
  playwright.config.ts
  seed.ts                 users, sessions, storage states (run by Node before Playwright)
  fixtures.ts             the page-health fixture
  local.spec.ts
  computer.spec.ts
  settings.spec.ts
  online.spec.ts
```

The root `package.json` gains `"e2e": "npm test -w @chess/e2e"`. `e2e/test-results` and `e2e/playwright-report`
go in `.gitignore`.

### `playwright.config.ts`

- Projects `chromium`, `firefox`, `webkit` (Playwright's own devices: Desktop Chrome, Desktop Firefox, Desktop
  Safari).
- `use`: `baseURL: 'http://localhost:3000'`, `reducedMotion: 'reduce'`, `trace: 'retain-on-failure'`,
  `screenshot: 'only-on-failure'`.
- `retries`: 1 on CI, 0 locally. `workers`: 1 (the specs share one server and database).
- `webServer`, two entries:
  - the game server: `node apps/server/src/index.ts` from the repository root, port 3001, with
    `DATABASE_URL` = `TEST_DATABASE_URL`, `CLIENT_ORIGIN=http://localhost:3000`, and a fake
    `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (needed to start; never called). Health URL
    `http://localhost:3001/health`.
  - the site: `npm run start -w @chess/web`, port 3000, on a production build made beforehand with
    `NEXT_PUBLIC_SERVER_URL=http://localhost:3001` (CI builds it in a step; locally `npm run e2e` expects a build,
    and README says so). So S2's CSP and headers apply.
  - `reuseExistingServer` locally, not on CI.
- `storageState: '.auth/ann.json'` by default, so pages are signed in (a signed-out page's 401 from `/me` would
  show up as a console error in Chromium); the online spec opens Bob's context with `.auth/bob.json`.

### `seed.ts`

Run with Node (type stripping, like the server) before `playwright test`, so it can import the server's own
TypeScript. Reads `TEST_DATABASE_URL`; empties the tables (the server's `truncate`); creates users "E2E Ann" and "E2E Bob";
creates a session for each with the server's own `createSessions`; writes `e2e/.auth/ann.json` and
`e2e/.auth/bob.json` (Playwright storage states holding the `sid` cookie for `localhost`). `e2e/.auth` is
git-ignored.

### `fixtures.ts`

Extends Playwright's `test` with an automatic fixture that, for every page a test opens:

- records `pageerror` events and `console` messages of type `error`;
- records CSP violations (an init script listens for `securitypolicyviolation` and logs them);
- after the test, fails it if anything was recorded, listing what;
- after the page first loads, checks that the page has a `<canvas>` with a WebGL context.

The specs import `test` and `expect` from `./fixtures.ts`.

### Specs

Moves are typed into the HUD's "Type a move" field and submitted with its Move button. Text is matched with the
English strings from `apps/web/src/ui/i18n.ts`.

| Spec | Steps and checks |
|---|---|
| `local.spec.ts` | Start a two-player game; type f3, e5, g4, Qh4; the game-over dialog says "Checkmate — Teal wins" (the armies are Amber and Teal); the move list holds 4 moves; Undo reopens the game (the dialog closes, 3 moves). |
| `computer.spec.ts` | Play the computer at the lowest level; type e4; within 15 s the move list holds 2 moves (Stockfish's WASM ran in this browser). |
| `settings.spec.ts` | Open Settings, choose Tiếng Việt; the menu shows Vietnamese; after a reload it still does. |
| `online.spec.ts` | Ann (her storage state) opens Play online, creates a room and reads the invite link from the address; Bob (his storage state, a second context) opens it; each sees the other's name; Ann plays e4, Bob sees it and plays e5, Ann sees that; Bob resigns; Ann sees "Resignation — Amber wins"; Ann's Profile lists the game. |

### CI (`.github/workflows/ci.yml`)

A new job `e2e`, skipped on `workflow_dispatch` like `check`:

- `strategy.matrix.browser: [chromium, firefox, webkit]`, `fail-fast: false`.
- Service `postgres:17-alpine` as in `check`; `TEST_DATABASE_URL` the same.
- Steps: checkout; setup-node 22 with the npm cache; `npm ci`; `npm run build -w @chess/web` with
  `NEXT_PUBLIC_SERVER_URL=http://localhost:3001`; cache `~/.cache/ms-playwright` keyed on the Playwright version
  and browser; `npx playwright install --with-deps ${{ matrix.browser }}`; `npm run e2e -- --project=${{ matrix.browser }}`;
  on failure, upload `e2e/playwright-report` and `e2e/test-results` as an artifact.
- `image` changes from `needs: check` to `needs: [check, e2e]`.

## Error handling

- A flaky step gets one retry on CI, with a trace kept; a test that passes only on retry is reported as flaky by
  Playwright, and the job still passes.
- The page-health fixture turns any console error, page error or CSP violation into a failure with the
  messages, so a browser-specific breakage cannot pass silently.
- `seed.ts` fails the run with a clear message when `TEST_DATABASE_URL` is missing.

## Testing the tests

- Each new unit test is seen to fail first (TDD), for example by breaking the catalog sequence or the expected
  result, then passes.
- The E2E suite is run locally in all three browsers before the CI job is added, then proven on a pull request:
  three green `e2e` jobs and `image` waiting for them.

## Done when

- `npm test` runs the shared package's tests, and the catalog's games and refusals are replayed by shared,
  server, store and sequencer tests.
- `npm run e2e` passes in Chromium, Firefox and WebKit locally.
- On a pull request, the three `e2e` jobs pass and `image` needs them.
- README explains `npm run e2e` (database up, a production build first) and what the job checks.

## To verify during implementation

- WebGL in headless WebKit on Linux (CI). If the canvas gets no context there, run only the WebKit project
  headed under `xvfb-run` (or with Playwright's GL flags); do not drop the browser.
- Whether the HUD's move field and the game-over dialog are reachable by role and label as named above;
  if not, add an accessible name to the element rather than a test-only id.
- The exact move sequences of the catalog, each checked with chess.js.
- That S2's limits leave room for the suite from one IP. Expected: the whole suite makes a handful of handshakes
  and well under 300 requests a minute per browser. If a limit trips anyway, stop and amend this spec before
  changing any limit.

## Out of scope

- Pixel comparisons of the 3D scene (rendering differs between engines and machines).
- Clicking pieces on the canvas (the store's selection tests cover the logic).
- Real mobile devices, and performance or frame-rate checks (S4).
- Load testing the server.
