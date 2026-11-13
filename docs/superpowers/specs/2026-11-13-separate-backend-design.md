# 3D Combat Chess — Separate Backend (Express)

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

The game server becomes its own package, built on Express 5 with Socket.IO
attached, deployable as a Docker image apart from the Vercel site. Nothing a
player sees changes: rooms, moves, clocks and reconnection behave exactly as
they do today.

This is P1 of three sub-projects that carry out `roadmap-2.md` §6, case B
(online multiplayer). Each later one gets its own spec:

| | Sub-project | Builds on |
|---|---|---|
| **P1** | Separate backend on Express (this spec) | — |
| P2 | PostgreSQL: accounts and match history, REST API | P1 |
| P3 | Redis: rooms that survive a restart, several instances, matchmaking | P1, P2 |

## Where things stand

The server already runs as its own process (`node server/index.ts`, port
3001, `node:http` + Socket.IO). What ties it to the Next app:

- one `package.json` and `node_modules` for both;
- `server/*.ts` imports `../src/net/protocol.ts`, `../src/game/result.ts` and
  `../src/game/types.ts`;
- one `tsconfig.json` with the `next` plugin and the DOM library;
- `src/net/online.test.ts` imports `../../server/app.ts` to test the client
  against the real server.

## Decisions already made

| Question | Decision |
|---|---|
| Scope of this round | P1 only. Behaviour unchanged. |
| Repository | One repo, npm workspaces: `apps/web`, `apps/server`, `packages/shared`. |
| Shared code | `@chess/shared`: `protocol.ts` and `result.ts` (with the `Result` type). Exports raw `.ts`; no build step. |
| Server structure | Express is the HTTP layer; the game core stays as it is. One file per job. |
| Running TypeScript | Node 22.18+ strips types: `node src/index.ts`. `tsc --noEmit` checks types. |
| Deploy | A Dockerfile for `apps/server`. The site stays on Vercel. |
| Client test against the server | `apps/web` lists `@chess/server` as a devDependency; only `online.test.ts` uses it. |

Checked before writing this spec:

- Node 22.23 runs a workspace package's `.ts` through its `node_modules`
  symlink: Node resolves the real path under `packages/`, so the "no type
  stripping in node_modules" rule does not apply.
- Next 16 with Turbopack transpiles workspace packages by itself for the App
  Router (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`).
  No `transpilePackages` entry is needed.
- Socket.IO with Express (socket.io/docs/v4/server-initialization): attach
  the `Server` to `createServer(app)` and call `listen` on that HTTP server.
  `app.listen()` would create a second server Socket.IO is not attached to.
- Express 5.3.0 is current and needs Node 18 or later. The security guide
  asks for `helmet` and `app.disable('x-powered-by')`; the performance guide
  asks for `NODE_ENV=production` and a clean exit on SIGTERM.

## Layout

```
chess/
├── package.json            workspace root only
├── package-lock.json       the one lockfile
├── .dockerignore
├── apps/
│   ├── web/                @chess/web — the Next app, moved here unchanged
│   │   ├── src/ public/
│   │   ├── next.config.ts tsconfig.json eslint.config.mjs vitest.config.mts AGENTS.md
│   │   └── package.json
│   └── server/             @chess/server
│       ├── src/            index, config, app, http, game, rooms, and their tests
│       ├── tsconfig.json eslint.config.mjs Dockerfile
│       └── package.json
├── packages/
│   └── shared/             @chess/shared
│       ├── src/protocol.ts src/result.ts
│       ├── tsconfig.json
│       └── package.json
└── docs/ roadmap*.md README.md
```

Files move with `git mv` so history follows them. Each workspace declares the
packages it imports; npm hoists and dedupes them, so there is one `chess.js`
and the lockfile pins it for both ends.

### Root `package.json`

```json
{
  "name": "combat-chess",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
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

### Workspaces

| Package | Dependencies | Dev dependencies | Scripts |
|---|---|---|---|
| `@chess/web` | today's frontend list minus `socket.io`, plus `@chess/shared` | today's list, plus `@chess/server` | `dev`, `build`, `start`, `lint`, `test`, `typecheck` |
| `@chess/server` | `express@^5.3.0`, `helmet@^8.3.0`, `socket.io@^4.8.4`, `chess.js`, `@chess/shared` | `@types/express@^5`, `@types/node`, `typescript`, `typescript-eslint`, `eslint`, `vitest`, `socket.io-client` | `dev` (`node --watch src/index.ts`), `start` (`node src/index.ts`), `lint`, `test`, `typecheck` |
| `@chess/shared` | `chess.js` | `typescript` | `typecheck` |

`@chess/server` sets `"engines": { "node": ">=22.18" }` and
`"exports": { "./app": "./src/app.ts" }` (for `online.test.ts`).

### TypeScript and lint

- `apps/web/tsconfig.json`: today's file, moved. Its globs now cover only the
  web app.
- `apps/server/tsconfig.json`: Node only. `module`/`moduleResolution`
  `nodenext`, `lib` without DOM, `types: ["node"]`, `noEmit`,
  `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
  (TypeScript 5.9 is installed), `strict`. No `next` plugin.
- `packages/shared/tsconfig.json`: the same compiler options as the server's,
  so the editor and `typecheck` resolve it on its own.
- `apps/server/eslint.config.mjs`: `typescript-eslint` recommended. Today the
  server is linted by the Next config, which does not fit it.

### Other files that change

- `.gitignore`: `/.next/` → `.next/`, `/node_modules` → `node_modules/`, so
  they match inside `apps/*`.
- `AGENTS.md` moves to `apps/web/`, where `next dev` maintains it.

`.claude/launch.json` needs no change: the root scripts still provide
`npm run dev` and `npm run server`.

## `@chess/shared`

| File | Contents | From |
|---|---|---|
| `src/protocol.ts` | events, payloads, `TIME_CONTROLS`, `RoomState`, acks, `MoveError` | `src/net/protocol.ts`, moved whole |
| `src/result.ts` | `gameResult(chess)` and the `Result` type | `src/game/result.ts`, plus `Result` from `src/game/types.ts` |

`package.json`:

```json
{
  "name": "@chess/shared",
  "private": true,
  "type": "module",
  "exports": {
    "./protocol": "./src/protocol.ts",
    "./result": "./src/result.ts"
  },
  "dependencies": { "chess.js": "^1.4.0" }
}
```

Relative imports inside the package spell the `.ts` extension, which Node
requires. `Piece`, `Step`, `PromotionPiece` and `PieceId` stay in
`apps/web/src/game/types.ts`; the server does not use them.

Imports that change (no re-export files are added):

| File | New import |
|---|---|
| `apps/web/src/state/store.ts` | `gameResult`, `Result` from `@chess/shared/result` |
| `apps/web/src/ui/i18n.ts` | `Result` from `@chess/shared/result` |
| `apps/web/src/net/online.ts` | `@chess/shared/protocol` |
| `apps/web/src/net/online.test.ts` | `@chess/shared/protocol`; `createApp` from `@chess/server/app` |
| `apps/web/src/ui/MainMenu.tsx` | `TIME_CONTROLS` from `@chess/shared/protocol` |
| `apps/web/src/engine/levels.ts` | `TIME_CONTROLS` from `@chess/shared/protocol` |
| `apps/server/src/*.ts` | `@chess/shared/protocol`, `@chess/shared/result` in place of `../src/...` |

## Server

```
index.ts ──► config.ts          reads and checks the environment
    │
    └──► app.ts  createApp({ origins, now, timeControls })
            ├── http.ts   createHttpApp()  → Express: helmet, /health, 404, errors
            ├── node:http createServer(expressApp)
            ├── socket.io new Server(httpServer, { cors, maxHttpBufferSize })
            └── game.ts   attachGame(io, { now, timeControls }) → rooms.ts
```

### Units

| Unit | Purpose | Depends on |
|---|---|---|
| `config.ts` (new) | `loadConfig(env)` → `{ port, origins }`. Throws on a bad value. | — |
| `http.ts` (new) | `createHttpApp()` → the Express app. | express, helmet |
| `game.ts` (new) | `attachGame(io, options)` → `{ close }`. Every socket handler, the flag timers and the sweep, moved from today's `app.ts` without change. | `rooms.ts`, shared |
| `app.ts` | `createApp(options)` → `{ io, listen, close }`, as today. Now only wires the pieces together. | `http.ts`, `game.ts`, socket.io |
| `rooms.ts` | Unchanged apart from imports. | chess.js, shared |
| `index.ts` | Entry point: config, `listen`, signals. The only file with process side effects. | `config.ts`, `app.ts` |

`app.ts` keeps the composition so tests can build the whole server on port 0
without touching the environment or process signals.

### `config.ts`

| Variable | Rule |
|---|---|
| `PORT` | Integer 1–65535. Unset: 3001. Anything else: error. |
| `CLIENT_ORIGIN` | Comma-separated origins; spaces around commas are trimmed. Each entry must equal `new URL(entry).origin`, which catches a trailing slash or a path. Unset or empty: any origin, unless `NODE_ENV` is `production`, where it is an error. |

`loadConfig` takes `env` as an argument (default `process.env`) so tests pass
plain objects. `origins` is `string[]`, or `true` for any origin, which is
the shape Socket.IO's `cors.origin` accepts.

### `http.ts`

In order:

1. `app.disable('x-powered-by')`
2. `app.use(helmet())`
3. `GET /health` → `200 {"status":"ok"}`. A liveness check for the host's
   load balancer; it reads no state.
4. Any other path → `404 {"error":"not-found"}`.
5. Error handler → `console.error(err)`, then `500 {"error":"internal"}`. The
   error's message never reaches the client.

Requests under `/socket.io/` never reach Express: engine.io answers them
first on the shared HTTP server.

Socket.IO keeps its own `cors` option. There is no browser-facing REST route
yet, so the `cors` middleware, `express.json()`, `trust proxy` and rate
limiting wait for P2.

### `index.ts`

1. `loadConfig()`. On error: print the message, exit 1.
2. `createApp({ origins })`, then `listen(port)`. `listen` rejects when the
   HTTP server emits `error` (a port in use, for example); `index.ts` prints
   it and exits 1.
3. Print `Game server listening on port <port>`.
4. On `SIGTERM` or `SIGINT`: `close()` (stops the timers; `io.close()` closes
   every socket and the HTTP server), then exit 0. A 10-second timer,
   unref'd, exits 1 if closing hangs.

Rooms are still in memory, so a restart ends every game, as today. P3 fixes
that.

Logging stays on `console` for the three lines above. The Express guide
prefers Pino; it arrives with P2's request traffic.

## Deploy

### Docker

`apps/server/Dockerfile`, built from the repository root because the image
needs the lockfile and `packages/shared`:

```
docker build -f apps/server/Dockerfile -t chess-server .
docker run -p 3001:3001 -e CLIENT_ORIGIN=http://localhost:3000 chess-server
```

Steps:

1. `FROM node:22-alpine`, `ENV NODE_ENV=production`, `WORKDIR /app`.
2. Copy the root `package.json`, `package-lock.json`, and the `package.json`
   of every workspace, so `npm ci` finds them in step with the lockfile.
3. `npm ci -w @chess/server --omit=dev`. This layer is cached until a manifest
   changes.
4. Copy `packages/shared/` and `apps/server/` sources.
5. `USER node`, `EXPOSE 3001`, `CMD ["node", "apps/server/src/index.ts"]`.

`.dockerignore` at the root leaves out `node_modules`, `.next`, `apps/web`
(apart from its `package.json`), `docs`, `.git` and the Markdown notes.

Hosts such as Render and Koyeb set `PORT` themselves and should point their
health check at `/health`.

### Vercel

The project's Root Directory becomes `apps/web`. Vercel installs from the
repository root because it finds the workspaces. `NEXT_PUBLIC_SERVER_URL`
names the server's public address, as today.

### README

The "Online play" section is rewritten: the two dev commands, the variable
table (`PORT`, `CLIENT_ORIGIN`, `NODE_ENV` for the server;
`NEXT_PUBLIC_SERVER_URL` for the site), the Docker commands, `/health`, and
the Vercel Root Directory.

## Error handling

| Situation | Behaviour |
|---|---|
| `PORT` not an integer 1–65535 | Startup prints the reason and exits 1. |
| `NODE_ENV=production` and no `CLIENT_ORIGIN` | Startup prints the reason and exits 1. |
| A `CLIENT_ORIGIN` entry that is not a bare origin | Startup prints the entry and exits 1. |
| Port already in use | `listen` rejects; the error is printed; exit 1. |
| Unknown HTTP path | `404 {"error":"not-found"}`. |
| Exception in an HTTP handler | Logged; `500 {"error":"internal"}`. |
| `SIGTERM` / `SIGINT` | Sockets closed, exit 0; exit 1 after 10 s if closing hangs. |
| Bad socket payloads, refused moves, reconnection | Unchanged. |

## Testing

Automated, with `vitest`. Every existing test moves with its code and passes
with its assertions unchanged, which is the proof that behaviour did not
change.

| What | Where |
|---|---|
| Rooms, seats, moves, clocks, results, expiry (existing) | `apps/server/src/rooms.test.ts` |
| The wire: create, join, moves, reconnect, second tab (existing) | `apps/server/src/app.test.ts` |
| The client store against the real server (existing) | `apps/web/src/net/online.test.ts` |
| The rest of the frontend (existing) | `apps/web/src/**/*.test.ts` |
| `PORT` default and bad values; one and several origins; trailing slash refused; production without `CLIENT_ORIGIN` refused | `apps/server/src/config.test.ts` (new) |
| `GET /health` → 200 JSON; unknown path → 404 JSON; a helmet header present (`X-Content-Type-Options: nosniff`); no `X-Powered-By` | `apps/server/src/app.test.ts`, new cases, using Node's `fetch` against the server on port 0 |

By hand:

- Start the server, send `kill -TERM`, see exit code 0.
- `docker build` and `docker run` as above; `curl localhost:3001/health`
  answers 200.
- Two browsers, `localhost:3000` and `b.localhost:3000`: create a room, join
  it, play a few moves including a capture, reload one side, resign.

## Done when

- From the root, `npm test`, `npm run lint`, `npm run typecheck` and
  `npm run build` pass.
- An online game between two browsers plays as it did before.
- The Docker image builds, starts with `CLIENT_ORIGIN`, and `/health` answers
  200.
- `apps/server` imports nothing from `apps/web`. `apps/web` imports server
  code only in `online.test.ts`, through `@chess/server/app`.
- Local two-player games and games against the computer behave as before.

## To verify during implementation

- `npm ci -w @chess/server --omit=dev` in the image installs the server's
  tree and links `@chess/shared` without complaining about the absent
  `apps/web` sources. Checked by building the image.
- Turbopack picks the repository root (where the lockfile is) as its root and
  serves `@chess/shared` without extra config. Checked by `npm run dev` and
  `npm run build`.

## Out of scope

PostgreSQL, accounts, match history (P2). Redis, several instances, sticky
sessions, matchmaking (P3). CI on GitHub Actions. Deploying to a real host.
Pino, `trust proxy`, rate limiting, the `cors` middleware and
`express.json()` (P2, with the first REST routes). Any change to the
protocol, the rules or the interface.
