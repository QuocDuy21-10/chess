# Separate Backend (Express) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game server becomes its own npm workspace package on Express 5 with Socket.IO attached, shipped as a Docker image apart from the Vercel site, while players see no change at all.

**Architecture:** The repository becomes an npm workspace: `apps/web` (the Next app, moved unchanged), `apps/server` (the game server) and `packages/shared` (the protocol and `gameResult`, which both ends import). In the server, `http.ts` builds the Express app (helmet, `/health`, JSON 404 and 500), `game.ts` holds today's socket handlers unchanged, `app.ts` joins them on one `node:http` server, `config.ts` reads the environment, and `index.ts` is the only file that touches the process. Node strips the TypeScript types itself, so neither the server nor the shared package has a build step.

**Tech Stack:** npm workspaces, Node 22.18+ (type stripping), Express 5.3, helmet 8.3, Socket.IO 4.8, TypeScript 5.9, Vitest 5.1, ESLint 9 with typescript-eslint 8, Docker (`node:22-alpine`). Unchanged: Next.js 16.4.6, React 19.3, chess.js 1.4.

**Spec:** `docs/superpowers/specs/2026-11-13-separate-backend-design.md`

## Global Constraints

- Installed versions, unchanged: `next@16.4.6`, `react@19.3.0`, `chess.js@1.4.0`, `socket.io@4.8.4`, `socket.io-client@4.8.4`, `vitest@5.1.0`, `typescript@5.9.3`, `eslint@9.39.5`. Node 22.18 or later (22.23.2 on this machine).
- New dependencies, and nothing else: `express@^5.3.0` and `helmet@^8.3.0` (server dependencies); `@types/express@^5.0.6`, `@eslint/js@^9` and `typescript-eslint@^8` (server dev dependencies). No `supertest`, `tsx`, `ts-node`, `pino`, `cors`, `concurrently`, and no build step.
- Node runs every file in `apps/server/src` and `packages/shared/src` without compiling it. In those files: write `import type` (or an inline `type`) for every type-only import, put `.ts` on every relative import, and use no enums, namespaces or constructor parameter properties. Their `tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`, so `tsc` refuses a mistake.
- Socket.IO is attached to `createServer(expressApp)`, and `listen` is called on that HTTP server. Never `app.listen()`: it would create a second server Socket.IO is not attached to.
- Nothing a player sees changes: the protocol, the rules, the interface, the clocks and reconnection stay as they are. Every existing test passes with its assertions unchanged; only import lines move.
- `apps/server` imports nothing from `apps/web`. `apps/web` imports server code only in `src/net/online.test.ts`, through `@chess/server/app`.
- `AGENTS.md`: this Next.js differs from older ones. Before writing Next.js-specific code that is not copied from this plan, read the matching guide in `node_modules/next/dist/docs/`.
- Run every command from the repository root (the folder that contains `docs/`) unless a step says otherwise.
- Work on the branch `separate-backend`, created from `main`. Commit only the paths each task names. Never commit `roadmap.md`, `roadmap-2.md`, `design-3D.md`, `3D-Stylized.md`, `chess.jpeg` or `.vitest/`.
- Disk: Tasks 2 and 5 need a few GB free (`npm install`, `next build`, the Docker image). If the disk fills, stop and tell the user before deleting anything.

## How to read the code blocks

- A block introduced by **Create** or **Replace … with** is the complete file.
- A `diff` block is the exact change to an existing file. Paths in its header are the file's path **after** any `git mv` in the same task. Apply it by hand, or save it to a file and run `git apply <file>`. The diffs apply cleanly when the tasks are done in order.
- `package-lock.json` is never shown: `npm install` writes it.

## What was checked while writing this plan

Tasks 1 to 5 were written into a scratch clone of `main` at `786ccf1`, one commit per task. Every code block below was copied out of those commits by a script, not retyped.

- Checked, at each of the five task commits: the tests, `tsc --noEmit` and `eslint` all pass. Test counts: 117 at the start and after Task 1; 117 after Task 2 (web 96, server 21); 121 after Task 3 (server 25); 127 from Task 4 on (server 31).
- Checked: each new test fails before its implementation, with the message its "see it fail" step quotes.
- Checked: on the final commit, the tests that open sockets (`apps/server/src/app.test.ts`, `apps/web/src/net/online.test.ts`) ran three times in a row without a failure.
- Checked: `next build` passes after Task 1, after Task 2 and on the final commit, with no Turbopack warning about the workspace root.
- Checked by hand after Task 4: a bad `PORT`, production without `CLIENT_ORIGIN`, an origin with a trailing slash and a port in use each print one line and exit 1; `SIGTERM` exits 0 at once, also with a client connected.
- Checked after Task 5: the image builds; `/health` answers 200 with `X-Content-Type-Options: nosniff`; an unknown path answers the JSON 404; without `CLIENT_ORIGIN` the container exits 1; `docker stop` ends it at once with exit code 0; it runs as user `node`; `next` is not in the image; its `node_modules` is 15.3 MB. About 1.2 MB of that is packages the web app needs at run time, which the lockfile marks as production, so `npm ci -w` keeps them. Harmless; not worth a more complex Dockerfile.
- Not checked: nothing was rendered in a browser. Task 6 exists for that. Deploying to Vercel with Root Directory `apps/web`, and to a real container host, was not tried.

## File map

| Path | After this plan | Task |
|---|---|---|
| `package.json` | Workspace root only: workspaces and scripts that call into them | 1, 2 |
| `packages/shared/{package.json,tsconfig.json}` | New package `@chess/shared` | 1 |
| `packages/shared/src/protocol.ts` | Moved from `src/net/protocol.ts` | 1 |
| `packages/shared/src/result.ts` | Moved from `src/game/result.ts`, now also owns the `Result` type | 1 |
| `apps/web/**` | Everything the Next app had at the root: `src/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `AGENTS.md`, plus a new `package.json` | 2 |
| `apps/server/{package.json,tsconfig.json,eslint.config.mjs}` | New package `@chess/server` | 2 |
| `apps/server/src/{app,index,rooms}.ts` and tests | Moved from `server/` | 2 |
| `apps/server/src/http.ts`, `http.test.ts` | New: the Express app and its error handler's test | 3 |
| `apps/server/src/game.ts` | New: the socket handlers, moved out of `app.ts` | 3 |
| `apps/server/src/app.ts` | Joins Express, Socket.IO and the game on one HTTP server | 3, 4 |
| `apps/server/src/config.ts`, `config.test.ts` | New: reads and checks the environment | 4 |
| `apps/server/src/index.ts` | Config, `listen`, signals | 4 |
| `apps/server/Dockerfile`, `.dockerignore` | New | 5 |
| `.gitignore`, `README.md` | Updated | 2, 5 |

---

### Task 1: Shared package `@chess/shared`

Move the two files both ends use into a workspace package, while the Next app is still at the root. This is a pure move: no test is written first, because the 117 existing tests are the check that nothing changed.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Move: `src/net/protocol.ts` → `packages/shared/src/protocol.ts`; `src/game/result.ts` → `packages/shared/src/result.ts`
- Modify: `package.json`, `src/game/types.ts`, `src/state/store.ts`, `src/ui/i18n.ts`, `src/net/online.ts`, `src/net/online.test.ts`, `src/ui/MainMenu.tsx`, `src/engine/levels.ts`, `server/app.ts`, `server/app.test.ts`, `server/rooms.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `@chess/shared/protocol` exports exactly what `src/net/protocol.ts` exported (`TIME_CONTROLS`, `RoomState`, `CreateAck`, `JoinAck`, `MoveError`, `MoveAck`, `ClientEvents`, `ServerEvents`). `@chess/shared/result` exports `gameResult(chess: Chess): Result | null` and `type Result`. `src/game/types.ts` no longer exports `Result`.

- [ ] **Step 1: Create the branch**

```bash
git switch -c separate-backend main
```

- [ ] **Step 2: Create the package**

Create `packages/shared/package.json`:

```json
{
  "name": "@chess/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./protocol": "./src/protocol.ts",
    "./result": "./src/result.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "chess.js": "^1.4.0"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Move the two files**

```bash
mkdir -p packages/shared/src
git mv src/net/protocol.ts packages/shared/src/protocol.ts
git mv src/game/result.ts packages/shared/src/result.ts
```

- [ ] **Step 4: Give `result.ts` the `Result` type and point `protocol.ts` at it**

```diff
--- a/packages/shared/src/result.ts
+++ b/packages/shared/src/result.ts
@@ -1,5 +1,9 @@
-import type { Chess } from 'chess.js';
-import type { Result } from './types';
+import type { Chess, Color } from 'chess.js';
+
+/** How a game ended. The interface turns it into words in the player's language. */
+export type Result =
+  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
+  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
 
 /** How the position on the board ended the game, or null while it goes on. */
 export function gameResult(chess: Chess): Result | null {
```

```diff
--- a/packages/shared/src/protocol.ts
+++ b/packages/shared/src/protocol.ts
@@ -1,5 +1,5 @@
 import type { Color } from 'chess.js';
-import type { Result } from '../game/types';
+import type { Result } from './result.ts';
 
 // Everything the browser and the game server say to each other. Both ends import this file.
 
```

```diff
--- a/src/game/types.ts
+++ b/src/game/types.ts
@@ -16,8 +16,3 @@
   | { kind: 'hop'; piece: PieceId; to: Square }
   | { kind: 'combat'; attacker: PieceId; defender: PieceId }
   | { kind: 'promote'; piece: PieceId; to: PromotionPiece };
-
-/** How a game ended. The interface turns it into words in the player's language. */
-export type Result =
-  | { reason: 'checkmate' | 'timeout' | 'resign'; winner: Color }
-  | { reason: 'stalemate' | 'insufficient' | 'threefold' | 'fifty' };
```

`Color` stays imported in `types.ts`: `Piece` still uses it.

- [ ] **Step 5: Point the frontend at the package**

No re-export file is added; each importer changes its own line.

```diff
--- a/src/state/store.ts
+++ b/src/state/store.ts
@@ -1,11 +1,11 @@
+import { gameResult, type Result } from '@chess/shared/result';
 import { Chess, type Color, type Move, type Square } from 'chess.js';
 import { create } from 'zustand';
 import { duck, fadeMusic, play } from '@/audio/audio';
 import { planMove } from '@/game/planMove';
 import { applyStep, matchesBoard, piecesFromBoard } from '@/game/position';
-import { gameResult } from '@/game/result';
 import { squareToWorld } from '@/game/squares';
-import type { Piece, PromotionPiece, Result } from '@/game/types';
+import type { Piece, PromotionPiece } from '@/game/types';
 import { actors } from '@/scene/actors';
 import { cameraRig } from '@/scene/cameraHandle';
 import { runSteps } from '@/scene/sequencer';
```

```diff
--- a/src/ui/i18n.ts
+++ b/src/ui/i18n.ts
@@ -1,4 +1,4 @@
-import type { Result } from '@/game/types';
+import type { Result } from '@chess/shared/result';
 import { useSettings } from '@/state/settings';
 
 const en = {
```

```diff
--- a/src/net/online.ts
+++ b/src/net/online.ts
@@ -1,9 +1,9 @@
+import type { ClientEvents, RoomState, ServerEvents } from '@chess/shared/protocol';
 import type { Color } from 'chess.js';
 import { io, type Socket } from 'socket.io-client';
 import { create } from 'zustand';
 import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
-import type { ClientEvents, RoomState, ServerEvents } from './protocol';
 
 // The connection to the game server. The interface reads `useOnline`; the board is driven through `useGame`.
 
```

```diff
--- a/src/net/online.test.ts
+++ b/src/net/online.test.ts
@@ -1,9 +1,9 @@
+import type { ClientEvents, CreateAck, RoomState, ServerEvents } from '@chess/shared/protocol';
 import { io, type Socket } from 'socket.io-client';
 import { afterEach, beforeEach, expect, test, vi } from 'vitest';
 import { useGame } from '@/state/store';
 import { createApp } from '../../server/app.ts';
 import { useOnline } from './online';
-import type { ClientEvents, CreateAck, RoomState, ServerEvents } from './protocol';
 
 // This device's side of an online game, against the real server. The opponent is a bare socket.
 
```

```diff
--- a/src/ui/MainMenu.tsx
+++ b/src/ui/MainMenu.tsx
@@ -1,10 +1,10 @@
 'use client';
 
+import { TIME_CONTROLS } from '@chess/shared/protocol';
 import { useRef, useState } from 'react';
 import { useComputer } from '@/engine/computer';
 import { COMPUTER_TIMES, LEVELS } from '@/engine/levels';
 import { useOnline } from '@/net/online';
-import { TIME_CONTROLS } from '@/net/protocol';
 import { TEAM } from '@/scene/theme';
 import { useSettings } from '@/state/settings';
 import { useGame } from '@/state/store';
```

```diff
--- a/src/engine/levels.ts
+++ b/src/engine/levels.ts
@@ -1,4 +1,4 @@
-import { TIME_CONTROLS } from '@/net/protocol';
+import { TIME_CONTROLS } from '@chess/shared/protocol';
 
 export const LEVELS = ['beginner', 'easy', 'medium', 'hard'] as const;
 export type Level = (typeof LEVELS)[number];
```

- [ ] **Step 6: Point the server at the package**

In the server, `node:` imports stay first, as they were.

```diff
--- a/server/app.ts
+++ b/server/app.ts
@@ -1,8 +1,8 @@
 import { createServer } from 'node:http';
 import type { AddressInfo } from 'node:net';
+import { TIME_CONTROLS, type ClientEvents, type ServerEvents } from '@chess/shared/protocol';
 import type { Color } from 'chess.js';
 import { Server, type Socket } from 'socket.io';
-import { TIME_CONTROLS, type ClientEvents, type ServerEvents } from '../src/net/protocol.ts';
 import { createRooms } from './rooms.ts';
 
 // What a well-formed request looks like. Nothing a client sends is used before it passes one of these.
```

```diff
--- a/server/rooms.ts
+++ b/server/rooms.ts
@@ -1,8 +1,7 @@
 import { randomBytes } from 'node:crypto';
+import type { MoveError, RoomState } from '@chess/shared/protocol';
+import { gameResult, type Result } from '@chess/shared/result';
 import { Chess, type Color } from 'chess.js';
-import { gameResult } from '../src/game/result.ts';
-import type { Result } from '../src/game/types.ts';
-import type { MoveError, RoomState } from '../src/net/protocol.ts';
 
 const MAX_ROOMS = 1000;
 const IDLE_MS = 10 * 60_000; // how long a room lives with nobody connected to it
```

```diff
--- a/server/app.test.ts
+++ b/server/app.test.ts
@@ -1,6 +1,6 @@
+import type { ClientEvents, CreateAck, JoinAck, MoveAck, RoomState, ServerEvents } from '@chess/shared/protocol';
 import { io, type Socket } from 'socket.io-client';
 import { afterEach, beforeEach, expect, test } from 'vitest';
-import type { ClientEvents, CreateAck, JoinAck, MoveAck, RoomState, ServerEvents } from '../src/net/protocol.ts';
 import { createApp } from './app.ts';
 
 // The real server on a free port, talked to by real clients.
```

- [ ] **Step 7: Make the root a workspace and install**

```diff
--- a/package.json
+++ b/package.json
@@ -3,6 +3,9 @@
   "version": "0.1.0",
   "private": true,
   "type": "module",
+  "workspaces": [
+    "packages/*"
+  ],
   "scripts": {
     "dev": "next dev",
     "server": "node --watch server/index.ts",
@@ -12,6 +15,7 @@
     "test": "vitest run"
   },
   "dependencies": {
+    "@chess/shared": "*",
     "@react-three/drei": "^10.7.9",
     "@react-three/fiber": "^9.8.2",
     "chess.js": "^1.4.0",
```

```bash
npm install
ls -l node_modules/@chess
```

Expected: `shared -> ../../packages/shared`.

- [ ] **Step 8: Check that nothing changed**

```bash
npx vitest run
npx tsc --noEmit
npx eslint
npm run typecheck -w @chess/shared
npx next build
```

Expected: `Test Files  15 passed (15)`, `Tests  117 passed (117)`; `tsc`, `eslint` and the shared type check print no error; `next build` ends with the route table (`○ /`).

```bash
PORT=3999 node server/index.ts
```

Expected: `Game server listening on port 3999`. Stop it with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add packages package.json package-lock.json src server
git commit -m "refactor: move the protocol and game results into @chess/shared"
```

---

### Task 2: Split into `apps/web` and `apps/server`

Move the Next app and the server into their own workspaces, and leave the root as a workspace manifest only. Again a move: the existing tests are the check.

**Files:**
- Move: `src/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `AGENTS.md` → `apps/web/`; `server/{app,app.test,index,rooms,rooms.test}.ts` → `apps/server/src/`
- Create: `apps/web/package.json`, `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/eslint.config.mjs`
- Replace: `package.json`
- Modify: `apps/web/src/net/online.test.ts`, `.gitignore`

**Interfaces:**
- Consumes: `@chess/shared/protocol`, `@chess/shared/result` (Task 1).
- Produces: workspace packages `@chess/web` and `@chess/server`. `@chess/server/app` resolves to `apps/server/src/app.ts` and exports `createApp`. Root scripts: `dev`, `server`, `build`, `test`, `lint`, `typecheck`.

- [ ] **Step 1: Move the files**

Stop any running `npm run dev` or `npm run server` first: they hold `.next` and the old paths.

```bash
mkdir -p apps/web apps/server/src
git mv src public next.config.ts tsconfig.json eslint.config.mjs vitest.config.mts AGENTS.md apps/web/
git mv server/app.ts server/app.test.ts server/index.ts server/rooms.ts server/rooms.test.ts apps/server/src/
rmdir server
rm -rf .next next-env.d.ts tsconfig.tsbuildinfo
```

The last line deletes build output that git ignores; `next build` and `next dev` write it again under `apps/web/`. `.claude/launch.json` needs no change: the root scripts still provide `npm run dev` and `npm run server`.

- [ ] **Step 2: Replace the root `package.json`**

Replace `package.json` with:

```json
{
  "name": "combat-chess",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @chess/web",
    "server": "npm run dev -w @chess/server",
    "build": "npm run build -w @chess/web",
    "test": "npm test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

- [ ] **Step 3: Create the web package**

Create `apps/web/package.json`. It is the old root list minus `socket.io`, plus the two workspace packages and a `typecheck` script:

```json
{
  "name": "@chess/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chess/shared": "*",
    "@react-three/drei": "^10.7.9",
    "@react-three/fiber": "^9.8.2",
    "chess.js": "^1.4.0",
    "next": "16.4.6",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "socket.io-client": "^4.8.4",
    "three": "^0.187.0",
    "zustand": "^5.1.0"
  },
  "devDependencies": {
    "@chess/server": "*",
    "@tailwindcss/turbopack": "4.3.3",
    "@types/node": "^22.20.5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/three": "^0.187.0",
    "eslint": "^9",
    "eslint-config-next": "16.4.6",
    "tailwindcss": "4.3.3",
    "typescript": "^5",
    "vitest": "^5.1.0"
  }
}
```

`@chess/server` is a dev dependency only so that `online.test.ts` can start the real server.

- [ ] **Step 4: Create the server package**

Create `apps/server/package.json`:

```json
{
  "name": "@chess/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.18"
  },
  "exports": {
    "./app": "./src/app.ts"
  },
  "scripts": {
    "dev": "node --watch src/index.ts",
    "start": "node src/index.ts",
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chess/shared": "*",
    "chess.js": "^1.4.0",
    "socket.io": "^4.8.4"
  },
  "devDependencies": {
    "@eslint/js": "^9",
    "@types/node": "^22.20.5",
    "eslint": "^9",
    "socket.io-client": "^4.8.4",
    "typescript": "^5",
    "typescript-eslint": "^8",
    "vitest": "^5.1.0"
  }
}
```

Create `apps/server/tsconfig.json` (Node only: no DOM, no `next` plugin):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

Create `apps/server/eslint.config.mjs`. This is the typescript-eslint quickstart (typescript-eslint.io/getting-started); until now the server was linted by the Next config, which does not fit it:

```js
// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
  files: ['**/*.{js,ts}'],
  extends: [js.configs.recommended, tseslint.configs.recommended],
});
```

The server needs no `vitest.config`: Vitest's defaults (Node environment, `*.test.ts`) fit it.

- [ ] **Step 5: Start the server from the package in the client test**

```diff
--- a/apps/web/src/net/online.test.ts
+++ b/apps/web/src/net/online.test.ts
@@ -1,8 +1,8 @@
+import { createApp } from '@chess/server/app';
 import type { ClientEvents, CreateAck, RoomState, ServerEvents } from '@chess/shared/protocol';
 import { io, type Socket } from 'socket.io-client';
 import { afterEach, beforeEach, expect, test, vi } from 'vitest';
 import { useGame } from '@/state/store';
-import { createApp } from '../../server/app.ts';
 import { useOnline } from './online';
 
 // This device's side of an online game, against the real server. The opponent is a bare socket.
```

- [ ] **Step 6: Ignore build output inside the apps**

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -1,7 +1,7 @@
 # See https://help.github.com/articles/ignoring-files/ for more about ignoring files.
 
 # dependencies
-/node_modules
+node_modules/
 /.pnp
 .pnp.*
 .yarn/*
@@ -14,7 +14,7 @@
 /coverage
 
 # next.js
-/.next/
+.next/
 /out/
 
 # production
```

- [ ] **Step 7: Install**

```bash
npm install
ls -l node_modules/@chess
```

Expected: three links, `server -> ../../apps/server`, `shared -> ../../packages/shared`, `web -> ../../apps/web`.

- [ ] **Step 8: Check everything from the root**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: `npm test` prints two summaries, `@chess/server`: `Test Files  2 passed (2)`, `Tests  21 passed (21)`; `@chess/web`: `Test Files  13 passed (13)`, `Tests  96 passed (96)`. Lint and the three type checks print no error. `npm run build` prints `✓ Compiled successfully` and the route table, with no warning about the Turbopack root.

Check that the server's ESLint really lints the server's files:

```bash
cd apps/server && npx eslint --format json | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).map(f => f.filePath.split('/').pop()).join(' '))"; cd ../..
```

Expected: `eslint.config.mjs app.test.ts app.ts index.ts rooms.test.ts rooms.ts`.

```bash
npm run server
```

Expected: `Game server listening on port 3001`. Stop it with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git status --short | grep -v '^R '
```

Expected: only `.gitignore`, `package.json`, `package-lock.json`, `apps/server/{eslint.config.mjs,package.json,tsconfig.json}`, `apps/web/package.json` and the renamed `online.test.ts`, plus the untracked notes the constraints name.

```bash
git add .gitignore package.json package-lock.json apps
git commit -m "refactor: split the repository into apps/web and apps/server workspaces"
```

---

### Task 3: Express in front of the game server

Put Express on the HTTP server, with helmet, a health check and JSON for every other answer. Move the socket handlers out of `app.ts` into `game.ts` without changing them.

**Files:**
- Create: `apps/server/src/http.ts`, `apps/server/src/http.test.ts`, `apps/server/src/game.ts`
- Replace: `apps/server/src/app.ts`
- Modify: `apps/server/src/app.test.ts`, `apps/server/package.json`

**Interfaces:**
- Consumes: `createRooms` from `apps/server/src/rooms.ts` (unchanged); `TIME_CONTROLS`, `ClientEvents`, `ServerEvents` from `@chess/shared/protocol`.
- Produces:
  - `http.ts`: `createHttpApp(): express.Express`; `onError: ErrorRequestHandler`.
  - `game.ts`: `type GameServer = Server<ClientEvents, ServerEvents, Record<string, never>, Seat>`; `attachGame(io: GameServer, options: { now?: () => number; timeControls: number[] }): { close(): void }`.
  - `app.ts`: `createApp(options?: { origin?: string; now?: () => number; timeControls?: number[] }): { io: GameServer; listen(port: number): Promise<number>; close(): Promise<void> }`, the same shape as before. Task 4 renames `origin` to `origins`.

- [ ] **Step 1: Install Express and helmet**

```bash
npm install express@^5.3.0 helmet@^8.3.0 -w @chess/server
npm install -D @types/express@^5.0.6 -w @chess/server
```

Expected change to `apps/server/package.json`:

```diff
--- a/apps/server/package.json
+++ b/apps/server/package.json
@@ -19,10 +19,13 @@
   "dependencies": {
     "@chess/shared": "*",
     "chess.js": "^1.4.0",
+    "express": "^5.3.0",
+    "helmet": "^8.3.0",
     "socket.io": "^4.8.4"
   },
   "devDependencies": {
     "@eslint/js": "^9",
+    "@types/express": "^5.0.6",
     "@types/node": "^22.20.5",
     "eslint": "^9",
     "socket.io-client": "^4.8.4",
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/server/src/app.test.ts`. The tests use Node's own `fetch` against the real server on port 0; no `supertest`:

```ts

test('the health check answers, and any other path is a JSON 404', async () => {
  const health = await fetch(`http://localhost:${port}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });

  const missing = await fetch(`http://localhost:${port}/nowhere`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ error: 'not-found' });
});

test('HTTP answers carry the security headers and do not name Express', async () => {
  const { headers } = await fetch(`http://localhost:${port}/health`);
  expect(headers.get('x-content-type-options')).toBe('nosniff');
  expect(headers.get('x-powered-by')).toBeNull();
});
```

Create `apps/server/src/http.test.ts`. No route can fail yet, so the error handler is called directly:

```ts
import type { Request, Response } from 'express';
import { expect, test, vi } from 'vitest';
import { onError } from './http.ts';

// No route can fail yet, so the error handler is called directly with a stand-in response.

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test('an error in a handler is logged and answered with a bare 500', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = fakeResponse();
  const error = new Error('ENOENT: /srv/secret.json');
  onError(error, {} as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: 'internal' }); // the message stays on the server
  expect(log).toHaveBeenCalledWith(error);
  log.mockRestore();
});

test('an error after the response has started is left to Express', () => {
  const next = vi.fn();
  const error = new Error('late');
  onError(error, {} as Request, fakeResponse(true) as unknown as Response, next);
  expect(next).toHaveBeenCalledWith(error);
});
```

- [ ] **Step 3: Run them to see them fail**

```bash
npm test -w @chess/server
```

Expected (it takes about 30 seconds, because the HTTP requests hang until they time out):
- `FAIL  src/http.test.ts` with `Error: Cannot find module './http.ts'`.
- `× the health check answers, and any other path is a JSON 404` and `× HTTP answers carry the security headers and do not name Express`, each with `Error: Test timed out in 5000ms.` (an `Error: Hook timed out in 10000ms.` from `afterEach` may follow). Today's HTTP server has no request handler, so the requests never get an answer.
- `Tests  2 failed | 21 passed`.

- [ ] **Step 4: Write the Express app**

Create `apps/server/src/http.ts`:

```ts
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';

/** The HTTP side of the server: security headers, a health check, and JSON for everything else. */
export function createHttpApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // A liveness check for the host's load balancer. It reads no state.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'not-found' });
  });
  app.use(onError);
  return app;
}

/** Logs the error and answers without its details, which may name files or data. */
export const onError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error); // the response has started: only Express can end it
  console.error(error);
  res.status(500).json({ error: 'internal' });
};
```

`app.disable('x-powered-by')` and `helmet()` come from Express's security guide; the `headersSent` check comes from its error-handling guide.

- [ ] **Step 5: Move the socket handlers into `game.ts`**

Start from a copy so the handlers stay byte for byte as they were:

```bash
cp apps/server/src/app.ts apps/server/src/game.ts
```

Then apply this change to `apps/server/src/game.ts`. Everything between the hunks, the `create`, `join`, `move`, `resign` and `disconnect` handlers, the flag timers and the sweep, is untouched:

```diff
--- a/apps/server/src/game.ts
+++ b/apps/server/src/game.ts
@@ -1,8 +1,6 @@
-import { createServer } from 'node:http';
-import type { AddressInfo } from 'node:net';
-import { TIME_CONTROLS, type ClientEvents, type ServerEvents } from '@chess/shared/protocol';
+import type { ClientEvents, ServerEvents } from '@chess/shared/protocol';
 import type { Color } from 'chess.js';
-import { Server, type Socket } from 'socket.io';
+import type { Server, Socket } from 'socket.io';
 import { createRooms } from './rooms.ts';
 
 // What a well-formed request looks like. Nothing a client sends is used before it passes one of these.
@@ -16,24 +14,19 @@
   roomId?: string;
   color?: Color;
 }
+export type GameServer = Server<ClientEvents, ServerEvents, Record<string, never>, Seat>;
 type GameSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, Seat>;
 
 interface Options {
-  origin?: string; // the only origin allowed to connect; any origin when unset
   now?: () => number;
-  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
+  timeControls: number[]; // minutes
 }
 
 const matches = (value: unknown, pattern: RegExp): value is string =>
   typeof value === 'string' && pattern.test(value);
 
-/** The game server: Socket.IO in front of the rooms. Call `listen` to start it. */
-export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
-  const http = createServer();
-  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, Seat>(http, {
-    cors: { origin: origin ?? true },
-    maxHttpBufferSize: 10_000,
-  });
+/** Puts the rooms behind `io`: answers every game event and keeps the flag timers. Call `close` to stop the timers. */
+export function attachGame(io: GameServer, { now, timeControls }: Options) {
   const rooms = createRooms(now);
   const seated = new Map<string, GameSocket>(); // "roomId:color" → the connection in that seat
   const flags = new Map<string, NodeJS.Timeout>(); // roomId → the timer that ends the game on time
@@ -133,15 +126,10 @@
   }, SWEEP_MS);
 
   return {
-    io,
-    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
-    listen: (port: number) =>
-      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
-    /** Stops the timers and closes every connection. */
+    /** Stops the timers. The connections are `io`'s to close. */
     close() {
       clearInterval(sweeper);
       for (const timer of flags.values()) clearTimeout(timer);
-      return io.close();
     },
   };
 }
```

Write `import type` for `ClientEvents` and `ServerEvents`. An inline `import { type A, type B }` would leave an empty `import '@chess/shared/protocol'` behind at run time under `verbatimModuleSyntax`.

- [ ] **Step 6: Join the pieces in `app.ts`**

Replace `apps/server/src/app.ts` with:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TIME_CONTROLS } from '@chess/shared/protocol';
import { Server } from 'socket.io';
import { attachGame, type GameServer } from './game.ts';
import { createHttpApp } from './http.ts';

interface Options {
  origin?: string; // the only origin allowed to connect; any origin when unset
  now?: () => number;
  timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
}

/** The game server: Express for HTTP, Socket.IO on the same port for the game. Call `listen` to start it. */
export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
  // Socket.IO answers /socket.io/ on this server before Express sees the request.
  const http = createServer(createHttpApp());
  const io: GameServer = new Server(http, {
    cors: { origin: origin ?? true },
    maxHttpBufferSize: 10_000,
  });
  const game = attachGame(io, { now, timeControls });

  return {
    io,
    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
    listen: (port: number) =>
      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
    /** Stops the timers and closes every connection and the HTTP server. */
    close() {
      game.close();
      return io.close();
    },
  };
}
```

- [ ] **Step 7: Run the tests to see them pass**

```bash
npm test -w @chess/server
npm run typecheck -w @chess/server
npm run lint -w @chess/server
```

Expected: `Test Files  3 passed (3)`, `Tests  25 passed (25)`; no type or lint error.

Check that only the planned lines of the handlers' file changed:

```bash
diff <(git show HEAD:apps/server/src/app.ts) apps/server/src/game.ts
```

Expected: only the hunks of Step 5 (imports, `GameServer`, `Options`, the function's first lines, and the returned `close`).

- [ ] **Step 8: Commit**

```bash
git add apps/server package-lock.json
git commit -m "feat: put Express in front of the game server, with a health check"
```

---

### Task 4: Startup checks and a clean shutdown

Read and check `PORT`, `CLIENT_ORIGIN` and `NODE_ENV` before listening. Make `listen` fail on a taken port instead of hanging. Close every connection on `SIGTERM`.

**Files:**
- Create: `apps/server/src/config.ts`, `apps/server/src/config.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/app.test.ts`
- Replace: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `createApp` from Task 3.
- Produces:
  - `config.ts`: `interface Config { port: number; origins: string[] | true }`; `loadConfig(env?: NodeJS.ProcessEnv): Config`, which throws an `Error` whose message names the variable.
  - `app.ts`: the option `origin?: string` becomes `origins?: string[] | true` (default `true`, any origin). `listen` rejects with the HTTP server's error, for example `EADDRINUSE`.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/config.test.ts`:

```ts
import { expect, test } from 'vitest';
import { loadConfig } from './config.ts';

test('port 3001 and any origin when nothing is set', () => {
  expect(loadConfig({})).toEqual({ port: 3001, origins: true });
});

test('PORT is read, and refused unless it is a whole number from 1 to 65535', () => {
  expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  for (const bad of ['abc', '0', '65536', '30.5', '-1', ' ', '0x50']) {
    expect(() => loadConfig({ PORT: bad }), bad).toThrow('PORT');
  }
});

test('CLIENT_ORIGIN names one origin or several, separated by commas', () => {
  expect(loadConfig({ CLIENT_ORIGIN: 'https://chess.example.com' }).origins).toEqual(['https://chess.example.com']);
  expect(loadConfig({ CLIENT_ORIGIN: 'https://chess.example.com, http://localhost:3000' }).origins).toEqual([
    'https://chess.example.com',
    'http://localhost:3000',
  ]);
});

test('a CLIENT_ORIGIN entry with a trailing slash, a path or no scheme is refused', () => {
  for (const bad of ['https://chess.example.com/', 'https://chess.example.com/play', 'chess.example.com']) {
    expect(() => loadConfig({ CLIENT_ORIGIN: bad }), bad).toThrow(`CLIENT_ORIGIN entry "${bad}"`);
  }
});

test('in production the server refuses to start without CLIENT_ORIGIN', () => {
  expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('CLIENT_ORIGIN');
  expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: ' , ' })).toThrow('CLIENT_ORIGIN');
  expect(loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://chess.example.com' }).origins).toEqual([
    'https://chess.example.com',
  ]);
});
```

Append to `apps/server/src/app.test.ts`:

```diff
--- a/apps/server/src/app.test.ts
+++ b/apps/server/src/app.test.ts
@@ -157,3 +157,9 @@ test('HTTP answers carry the security headers and do not name Express', async ()
   expect(headers.get('x-content-type-options')).toBe('nosniff');
   expect(headers.get('x-powered-by')).toBeNull();
 });
+
+test('listening on a port that is taken fails instead of hanging', async () => {
+  const second = createApp();
+  await expect(second.listen(port)).rejects.toThrow('EADDRINUSE');
+  await second.close();
+});
```

- [ ] **Step 2: Run them to see them fail**

```bash
npm test -w @chess/server
```

Expected:
- `FAIL  src/config.test.ts` with `Error: Cannot find module './config.ts'`.
- `× listening on a port that is taken fails instead of hanging` with `Error: Test timed out in 5000ms.`, and under `Unhandled Errors`: `Error: listen EADDRINUSE: address already in use`.
- `Tests  1 failed | 25 passed (26)`.

- [ ] **Step 3: Write `config.ts`**

Create `apps/server/src/config.ts`:

```ts
/** The server's settings, read from the environment. */
export interface Config {
  port: number;
  origins: string[] | true; // the sites allowed to connect; true: any site
}

const DEFAULT_PORT = 3001;

/**
 * Reads PORT, CLIENT_ORIGIN and NODE_ENV. Throws, naming the variable, when one is wrong, so a
 * misconfigured server stops at startup instead of refusing every player later.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readPort(env.PORT),
    origins: readOrigins(env.CLIENT_ORIGIN, env.NODE_ENV === 'production'),
  };
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, not "${value}"`);
  }
  return port;
}

function readOrigins(value: string | undefined, production: boolean): string[] | true {
  const origins = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    if (production) throw new Error("CLIENT_ORIGIN must name the site's origin when NODE_ENV is production");
    return true; // development: any page may connect
  }
  const bad = origins.find((origin) => !isOrigin(origin));
  if (bad) throw new Error(`CLIENT_ORIGIN entry "${bad}" is not an origin such as https://chess.example.com`);
  return origins;
}

/** True for a bare origin. A trailing slash or a path would never match the browser's Origin header. */
function isOrigin(text: string): boolean {
  try {
    return new URL(text).origin === text;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Take a list of origins, and reject a taken port, in `app.ts`**

```diff
--- a/apps/server/src/app.ts
+++ b/apps/server/src/app.ts
@@ -6,26 +6,32 @@ import { attachGame, type GameServer } from './game.ts';
 import { createHttpApp } from './http.ts';
 
 interface Options {
-  origin?: string; // the only origin allowed to connect; any origin when unset
+  origins?: string[] | true; // the sites allowed to connect; any site when unset
   now?: () => number;
   timeControls?: number[]; // minutes; tests pass a very short one to watch a flag fall
 }
 
 /** The game server: Express for HTTP, Socket.IO on the same port for the game. Call `listen` to start it. */
-export function createApp({ origin, now, timeControls = TIME_CONTROLS }: Options = {}) {
+export function createApp({ origins = true, now, timeControls = TIME_CONTROLS }: Options = {}) {
   // Socket.IO answers /socket.io/ on this server before Express sees the request.
   const http = createServer(createHttpApp());
   const io: GameServer = new Server(http, {
-    cors: { origin: origin ?? true },
+    cors: { origin: origins },
     maxHttpBufferSize: 10_000,
   });
   const game = attachGame(io, { now, timeControls });
 
   return {
     io,
-    /** Starts listening. Resolves with the port, which matters when `port` is 0. */
+    /** Starts listening. Resolves with the port, which matters when `port` is 0; rejects when it is taken. */
     listen: (port: number) =>
-      new Promise<number>((resolve) => http.listen(port, () => resolve((http.address() as AddressInfo).port))),
+      new Promise<number>((resolve, reject) => {
+        http.once('error', reject);
+        http.listen(port, () => {
+          http.off('error', reject);
+          resolve((http.address() as AddressInfo).port);
+        });
+      }),
     /** Stops the timers and closes every connection and the HTTP server. */
     close() {
       game.close();
```

No caller passed `origin` apart from `index.ts`, which the next step replaces; the tests pass no origin.

- [ ] **Step 5: Rewrite the entry point**

Replace `apps/server/src/index.ts` with:

```ts
import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';

// The only file with side effects on the process: environment, port, signals. See config.ts for the variables.

const CLOSE_MS = 10_000; // how long closing may take before the process ends anyway

/** Prints why the server cannot run and ends the process. */
function fail(error: unknown): never {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  fail(error);
}

const app = createApp({ origins: config.origins });
const port = await app.listen(config.port).catch(fail);
console.log(`Game server listening on port ${port}`);

/** Hosts send SIGTERM before they stop or replace the server: close every connection, then exit. */
function shutdown() {
  setTimeout(() => process.exit(1), CLOSE_MS).unref();
  void app.close().then(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

`io.close()` closes every socket and the HTTP server. Express's guide asks a server to stop taking requests on `SIGTERM`, finish, clean up and exit.

- [ ] **Step 6: Run the tests to see them pass**

```bash
npm test -w @chess/server
npm run typecheck -w @chess/server
npm run lint -w @chess/server
```

Expected: `Test Files  4 passed (4)`, `Tests  31 passed (31)`; no type or lint error.

- [ ] **Step 7: Check the entry point by hand**

```bash
PORT=abc node apps/server/src/index.ts; echo "exit $?"
NODE_ENV=production node apps/server/src/index.ts; echo "exit $?"
CLIENT_ORIGIN=https://x.example.com/ node apps/server/src/index.ts; echo "exit $?"
```

Expected, in order:

```
PORT must be a whole number from 1 to 65535, not "abc"
exit 1
CLIENT_ORIGIN must name the site's origin when NODE_ENV is production
exit 1
CLIENT_ORIGIN entry "https://x.example.com/" is not an origin such as https://chess.example.com
exit 1
```

```bash
PORT=3998 node apps/server/src/index.ts & P=$!; sleep 1.5
curl -s localhost:3998/health; echo
PORT=3998 node apps/server/src/index.ts; echo "exit $?"
kill -TERM $P; wait $P; echo "exit $?"
```

Expected: `Game server listening on port 3998`, `{"status":"ok"}`, then `listen EADDRINUSE: address already in use :::3998` and `exit 1` for the second server, then `exit 0` for the first.

- [ ] **Step 8: Commit**

```bash
git add apps/server
git commit -m "feat: check the server's environment at startup and close cleanly on SIGTERM"
```

---

### Task 5: Docker image and README

Ship the server as an image built from the repository root, and document the new layout.

**Files:**
- Create: `apps/server/Dockerfile`, `.dockerignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: `apps/server/src/index.ts` (Task 4), which reads `PORT`, `CLIENT_ORIGIN` and `NODE_ENV`.
- Produces: an image whose `CMD` is `node apps/server/src/index.ts`, listening on 3001 unless `PORT` says otherwise.

- [ ] **Step 1: Write the Dockerfile**

Create `apps/server/Dockerfile`:

```dockerfile
# The game server. Build it from the repository root, which holds the lockfile and packages/shared:
#   docker build -f apps/server/Dockerfile -t chess-server .
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Manifests first: this layer is reused until a dependency changes. npm ci wants every workspace's
# package.json to match the lockfile, so the web app's comes too, but only the server's tree is installed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @chess/server --omit=dev

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/

USER node
EXPOSE 3001
# Node strips the TypeScript types itself; there is no build step.
CMD ["node", "apps/server/src/index.ts"]
```

Create `.dockerignore` at the repository root:

```
# Only the server's image is built from here. Keep the context small and free of local files.
**/node_modules
**/.next
.git
.vitest
docs
*.md
*.jpeg
apps/web/*
!apps/web/package.json
apps/server/src/**/*.test.ts
```

- [ ] **Step 2: Build and run the image**

```bash
docker build -f apps/server/Dockerfile -t chess-server .
```

Expected: the build ends with `naming to docker.io/library/chess-server:latest done`.

If the build fails with `failed to stat parent: ... snapshots/<n>/fs: no such file or directory` (Docker's build cache can break after the disk fills), ask the user before running `docker builder prune -af`. It deletes only the build cache, not images, containers or volumes.

```bash
docker run --rm chess-server; echo "exit $?"
```

Expected: `CLIENT_ORIGIN must name the site's origin when NODE_ENV is production`, `exit 1`.

```bash
docker run -d --name chess-server-check -p 3001:3001 -e CLIENT_ORIGIN=http://localhost:3000 chess-server
sleep 2; docker logs chess-server-check
curl -si localhost:3001/health | grep -iE "HTTP/|x-content-type|x-powered|status"
curl -s localhost:3001/nope; echo
docker stop chess-server-check; docker inspect chess-server-check --format '{{.State.ExitCode}}'; docker rm chess-server-check
docker run --rm --entrypoint sh chess-server -c 'whoami; ls node_modules/next; du -sh node_modules'
```

Expected: `Game server listening on port 3001`; `HTTP/1.1 200 OK`, `X-Content-Type-Options: nosniff`, `{"status":"ok"}` and no `X-Powered-By`; `{"error":"not-found"}`; `docker stop` returns at once and the exit code is `0`; then `node`, `ls: node_modules/next: No such file or directory`, and about `15M node_modules`.

Stop any `npm run server` first: it holds port 3001.

- [ ] **Step 3: Rewrite the README's online section**

In `README.md`, replace everything from the line `## Online play` to the end of the file with:

````markdown
## Online play

Two players on two devices need the game server as well as the site. The repository is an npm
workspace: the site is `apps/web`, the server is `apps/server`, and the code both ends share is
`packages/shared`. Install once, from the root:

```bash
npm install
npm run dev      # the site, on port 3000
npm run server   # the game server, on port 3001
```

From the root, `npm test`, `npm run lint` and `npm run typecheck` run in every workspace.

| Variable | Read by | Meaning |
|---|---|---|
| `PORT` | server | Port to listen on. Default 3001. |
| `CLIENT_ORIGIN` | server | The site's origin, such as `https://chess.example.com`; separate several with commas. Unset: any origin, except in production, where the server refuses to start. |
| `NODE_ENV` | server | `production` when deployed. The Docker image sets it. |
| `NEXT_PUBLIC_SERVER_URL` | site, at build time | The server's address. Unset: port 3001 on the page's own host. |

To try both sides on one computer, open the second player at `http://b.localhost:3000`. That is a
different origin, so the browser keeps a different player id for it. Two tabs on the same origin are the
same player, and the newer tab takes the seat.

A phone on the same network also needs the computer's address in `allowedDevOrigins` in
`apps/web/next.config.ts`, or the development site refuses it.

### Deploying

The server ships as a Docker image, built from the repository root:

```bash
docker build -f apps/server/Dockerfile -t chess-server .
docker run -p 3001:3001 -e CLIENT_ORIGIN=http://localhost:3000 chess-server
```

Any host that runs a container will do: Render, Koyeb, Fly or a VPS. Hosts may set `PORT` themselves.
Point the host's health check at `GET /health`, which answers `{"status":"ok"}`. On `SIGTERM` the server
closes every connection and exits. Rooms are kept in memory, so a restart or a new deploy ends every
game. Without Docker, run `npm start -w @chess/server` on Node 22.18 or later.

On Vercel, set the project's Root Directory to `apps/web`, and `NEXT_PUBLIC_SERVER_URL` to the server's
public address.
````

- [ ] **Step 4: Commit**

```bash
git add README.md .dockerignore apps/server/Dockerfile
git commit -m "feat: ship the game server as a Docker image, and document the new layout"
```

---

### Task 6: Check it in the browser

Nothing in Tasks 1 to 5 was rendered in a browser. This task plays real games against the new layout. It changes no code unless it finds a bug; a bug found here gets its own fix and commit.

**Files:** none, unless a bug is found.

**Interfaces:**
- Consumes: everything above. `.claude/launch.json` starts `chess-dev` (`npm run dev`, port 3000) and `chess-server` (`npm run server`, port 3001).

- [ ] **Step 1: The whole suite, once more, from the root**

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: server `Tests  31 passed (31)`, web `Tests  96 passed (96)`; no lint or type error; the build prints its route table.

Check the boundary between the two apps:

```bash
grep -rn "apps/web\|from '\.\./\.\./" apps/server/src
grep -rln "@chess/server" apps/web/src
```

Expected: the first prints nothing; the second prints only `apps/web/src/net/online.test.ts`.

- [ ] **Step 2: Start both servers in the preview**

Start `chess-server` and `chess-dev` with `preview_start`. Check `preview_logs` for each: `Game server listening on port 3001`, and Next's `Ready` line with no error.

- [ ] **Step 3: Play online between two origins**

1. In one tab open `http://localhost:3000`; in a second, `http://b.localhost:3000`.
2. In the first, choose "Play online", a time control, create a room, and copy the invite link.
3. Open the link in the second tab, with `localhost` replaced by `b.localhost`. Both tabs reach the board with the camera behind their own army, and both clocks show.
4. Play a few moves including a capture. Both boards and move lists agree.
5. Reload the second tab mid-game. It returns to the same position and seat.
6. Resign in one tab. Both tabs show the result; "Main menu" leaves.

Check `read_console_messages` in both tabs: no errors. Check `read_network_requests`: the Socket.IO requests go to port 3001 and succeed.

- [ ] **Step 4: The games that do not use the server**

1. A local two-player game: a few moves, Undo, a new game.
2. A game against the computer: start one at any strength, play two moves, see the computer answer.

- [ ] **Step 5: Report**

Tell the user what was checked, with a screenshot of the two tabs mid-game. Name anything not checked. The Vercel Root Directory (`apps/web`) and a deploy to a real host are the user's to set up, following the README.
