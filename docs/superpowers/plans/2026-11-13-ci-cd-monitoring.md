# CI/CD, VPS Deploy, Backups and Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every PR and push to `main` is checked by GitHub Actions; every green push to `main` ships the game server to the owner's VPS after a database backup; the server logs JSON lines and both ends report errors to Sentry.

**Architecture:** One workflow, `.github/workflows/ci.yml`, with three chained jobs (`check` → `image` → `deploy`). The VPS runs `deploy/compose.yml` (server, Postgres 17, Caddy) from `/opt/chess`. Shell scripts in `deploy/` handle deploying, backing up to a private Git repository, and restoring. A small JSON logger, `apps/server/src/log.ts`, replaces `console.*` on the server and forwards errors to Sentry.

**Tech Stack:** GitHub Actions, GHCR, Docker Compose, Caddy 2, Postgres 17, bash, `@sentry/node` 11, `@sentry/nextjs` 11, Vitest 5, Next.js 16.4, Express 5.

**Spec:** `docs/superpowers/specs/2026-11-13-ci-cd-monitoring-design.md`

## Global Constraints

- Work on branch `phase5-s1-ci-cd`. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line.
- The server runs TypeScript by Node's type stripping (Node ≥ 22.18, `erasableSyntaxOnly`): no enums, namespaces or parameter properties. Relative imports end in `.ts`.
- Sentry packages: `@sentry/node@^11.12.0` (server), `@sentry/nextjs@^11.12.0` (site). Errors only: never set `tracesSampleRate`, never add replay. Sentry is off when its DSN is unset or empty.
- Image name: `ghcr.io/quocduy21-10/chess-server` (GHCR wants the owner in lower case).
- Memory limits on the VPS: `postgres` 384m, `server` 384m, `caddy` 128m. Docker logs: `json-file`, `max-size: 10m`, `max-file: 3`.
- GitHub Actions versions: `actions/checkout@v7`, `actions/setup-node@v7`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/build-push-action@v7`. No third-party SSH action.
- Comments: one line, and only for the why the code cannot show.
- Never read `apps/server/.env` or any `.env`: it holds the owner's secrets. The tests load it themselves.
- The server's and the site's tests need Postgres: `npm run db:up -w @chess/server` (Postgres 17 on 127.0.0.1:5432) and `TEST_DATABASE_URL` in `apps/server/.env`. Vitest's global setup migrates the test database before any test file, so even `log.test.ts` needs it up.
- Shell scripts start with `#!/usr/bin/env bash` and `set -euo pipefail`, `cd "$(dirname "$0")"`, and pass `shellcheck`.

## File map

| File | Task | Job |
|---|---|---|
| `apps/server/src/log.ts` | 1 | JSON-lines logger; errors also go to Sentry |
| `apps/server/src/log.test.ts` | 1 | its tests |
| `apps/server/src/{index,app,http,db,game,auth}.ts` | 2 | `log` instead of `console` |
| `apps/server/src/http.test.ts` | 2 | spies on `log.error` instead of `console.error` |
| `apps/server/src/config.ts`, `config.test.ts` | 3 | `SENTRY_DSN` |
| `apps/server/src/index.ts` | 3 | `Sentry.init`, `Sentry.flush` |
| `apps/server/Dockerfile`, `.dockerignore` | 3 | `GIT_SHA` → `SENTRY_RELEASE`; leave out `deploy/`, `.github/` |
| `apps/web/src/instrumentation-client.ts` | 4 | `Sentry.init` in the browser |
| `apps/web/next.config.ts` | 4 | `withSentryConfig` |
| `deploy/compose.yml`, `deploy/Caddyfile`, `deploy/env.example` | 5 | production stack |
| `deploy/backup.sh`, `deploy/restore.sh`, `deploy/deploy.sh` | 5 | backup, restore, deploy |
| `.github/workflows/ci.yml` | 6 | the pipeline |
| `apps/web/package.json` | 6 | `typecheck` runs `next typegen` first (CI has no `next-env.d.ts`) |
| `README.md` | 7 | CI, VPS setup, backups, monitoring |

---

### Task 1: The JSON logger

**Files:**
- Create: `apps/server/src/log.ts`
- Test: `apps/server/src/log.test.ts`
- Modify: `apps/server/package.json`, `package-lock.json` (new dependency)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```ts
  export const log: {
    info(msg: string, fields?: Record<string, unknown>): void;   // console.log, one JSON line
    warn(msg: string, fields?: Record<string, unknown>): void;   // console.log, one JSON line
    error(msg: string, error?: unknown, fields?: Record<string, unknown>): void; // console.error + Sentry.captureException
  };
  ```
  The logger writes through `console.log`/`console.error`, so tests that silence `console.error` (`auth.test.ts`) keep working.

- [ ] **Step 1: Install `@sentry/node` in the server workspace**

Run from the repository root:
```bash
npm install @sentry/node@^11.12.0 -w @chess/server
```
Expected: `apps/server/package.json` lists `"@sentry/node": "^11.12.0"` under `dependencies`; `package-lock.json` changes.

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/log.test.ts`:
```ts
import * as Sentry from '@sentry/node';
import { afterEach, expect, test, vi } from 'vitest';
import { log } from './log.ts';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const out = vi.spyOn(console, 'log').mockImplementation(() => {});
const err = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => vi.clearAllMocks());

/** The JSON object the first call to `spy` wrote. */
const written = (spy: typeof out) => JSON.parse(String(spy.mock.calls[0][0]));

test('info writes one JSON line to stdout: time, level, message, fields', () => {
  log.info('Listening', { port: 3001 });
  expect(out).toHaveBeenCalledTimes(1);
  const entry = written(out);
  expect(entry).toEqual({ time: expect.any(String), level: 'info', msg: 'Listening', port: 3001 });
  expect(new Date(entry.time).toISOString()).toBe(entry.time);
  expect(err).not.toHaveBeenCalled();
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('warn writes to stdout and does not reach Sentry', () => {
  log.warn('Postgres connection lost', { message: 'terminated' });
  expect(written(out)).toMatchObject({ level: 'warn', msg: 'Postgres connection lost', message: 'terminated' });
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('error writes the message and stack to stderr, and sends the error to Sentry', () => {
  const error = new Error('boom');
  log.error('Request failed', error, { roomId: 'abcd1234' });
  expect(out).not.toHaveBeenCalled();
  const entry = written(err);
  expect(entry).toMatchObject({ level: 'error', msg: 'Request failed', roomId: 'abcd1234', error: { message: 'boom' } });
  expect(entry.error.stack).toContain('boom');
  expect(Sentry.captureException).toHaveBeenCalledWith(error, { extra: { msg: 'Request failed', roomId: 'abcd1234' } });
});

test('a pg-style error keeps its code, and anything else is written as text', () => {
  log.error('Cannot migrate the database', Object.assign(new Error(''), { code: 'ECONNREFUSED' }));
  expect(written(err).error).toMatchObject({ message: '', code: 'ECONNREFUSED' });
  err.mockClear();
  log.error('Cannot start', 'PORT must be a whole number');
  expect(written(err).error).toBe('PORT must be a whole number');
});

test('a field that cannot be serialised does not lose the line', () => {
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  log.info('Odd', { loop, ok: 1 });
  expect(written(out)).toMatchObject({ msg: 'Odd', loop: '[unserializable]', ok: 1 });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run (Postgres up, see Global Constraints): `cd apps/server && npx vitest run src/log.test.ts`
Expected: FAIL, `Failed to load url ./log.ts` (or "Cannot find module").

- [ ] **Step 4: Write the logger**

Create `apps/server/src/log.ts`:
```ts
import * as Sentry from '@sentry/node';

// One JSON line per event, so `docker compose logs server | jq` can read the server's output.
// `log.error` also reports to Sentry, which does nothing until index.ts starts it.

type Fields = Record<string, unknown>;

function line(level: 'info' | 'warn' | 'error', msg: string, fields: Fields = {}): string {
  const entry: Fields = { time: new Date().toISOString(), level, msg };
  for (const [key, value] of Object.entries(fields)) {
    try {
      JSON.stringify(value);
      entry[key] = value;
    } catch {
      entry[key] = '[unserializable]'; // a cycle or a BigInt must not cost the whole line
    }
  }
  return JSON.stringify(entry);
}

/** An Error as plain data (`code` is how `pg` and Node name what went wrong); anything else as text. */
function describe(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const { code } = error as { code?: unknown };
  return { message: error.message, stack: error.stack, ...(code === undefined ? {} : { code }) };
}

export const log = {
  info: (msg: string, fields?: Fields) => console.log(line('info', msg, fields)),
  warn: (msg: string, fields?: Fields) => console.log(line('warn', msg, fields)),
  error(msg: string, error?: unknown, fields?: Fields) {
    console.error(line('error', msg, error === undefined ? fields : { ...fields, error: describe(error) }));
    Sentry.captureException(error ?? new Error(msg), { extra: { msg, ...fields } });
  },
};
```

- [ ] **Step 5: Run the test to see it pass**

Run: `cd apps/server && npx vitest run src/log.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Lint and typecheck the server**

Run: `npm run lint -w @chess/server && npm run typecheck -w @chess/server`
Expected: no output from ESLint, no errors from `tsc`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/log.ts apps/server/src/log.test.ts apps/server/package.json package-lock.json
git commit -m "feat: give the server a logger that writes one JSON line per event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Log through `log` everywhere on the server

**Files:**
- Modify: `apps/server/src/index.ts`, `apps/server/src/app.ts:50-61`, `apps/server/src/http.ts:44-55`, `apps/server/src/db.ts:16`, `apps/server/src/game.ts:86`, `apps/server/src/auth.ts:106`
- Test: `apps/server/src/http.test.ts:24-42`

**Interfaces:**
- Consumes: `log` from `./log.ts` (Task 1).
- Produces: `index.ts` keeps a `fail(error, msg?)` that Task 3 extends with `Sentry.flush`.

- [ ] **Step 1: Point the error-handler tests at `log.error`**

In `apps/server/src/http.test.ts`, add the import after the `./http.ts` import:
```ts
import { log } from './log.ts';
```
Replace the first two tests (lines 24-42) with:
```ts
test('an error in a handler is logged and answered with a bare 500', () => {
  const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
  const res = fakeResponse();
  const error = new Error('ENOENT: /srv/secret.json');
  onError(error, {} as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: 'internal' }); // the message stays on the server
  expect(logged).toHaveBeenCalledWith('Request failed', error);
  logged.mockRestore();
});

test("a client's mistake keeps its status and is not logged", () => {
  const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
  const res = fakeResponse();
  onError(Object.assign(new Error('request entity too large'), { status: 413 }), {} as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBe(413);
  expect(res.body).toEqual({ error: 'bad-request' });
  expect(logged).not.toHaveBeenCalled();
  logged.mockRestore();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/server && npx vitest run src/http.test.ts`
Expected: FAIL in the first test: `logged` was not called (`onError` still uses `console.error`).

- [ ] **Step 3: Replace the `console` calls**

`apps/server/src/http.ts`: add `import { log } from './log.ts';` after the `helmet` import, and in `onError` replace `console.error(error);` with:
```ts
  log.error('Request failed', error);
```

`apps/server/src/db.ts`: add `import { log } from './log.ts';` after the `pg` import, and replace the `pool.on('error', …)` line with:
```ts
  pool.on('error', (error) => log.warn('Postgres connection lost', { message: error.message }));
```

`apps/server/src/game.ts`: add `import { log } from './log.ts';` after the `./cookies.ts` import, and replace `console.error('Socket sign-in check failed:', error);` with:
```ts
      log.error('Socket sign-in check failed', error);
```

`apps/server/src/auth.ts`: add `import { log } from './log.ts';` in the import block (keep alphabetical order of local imports), and replace ``console.error(`Sign-in with ${found.name} failed:`, error);`` with:
```ts
      log.error('Sign-in failed', error, { provider: found.name }); // a wrong client secret breaks every sign-in
```

`apps/server/src/app.ts`: add `import { log } from './log.ts';` after the `./http.ts` import, and replace the `onGameOver` body and the sweeper with:
```ts
    onGameOver(record) {
      log.info('Game over', { roomId: record.roomId, ...record.result, moves: record.moves.length });
      const write = saveGame(db, record)
        .catch((error) => log.error('Could not save a game', error, { roomId: record.roomId }))
        .finally(() => saving.delete(write));
      saving.add(write);
    },
  });
  const sweeper = setInterval(() => {
    sessions.sweep().catch((error) => log.error('Session sweep failed', error));
  }, SESSION_SWEEP_MS);
```
(Keep the existing comment `// Not awaited by the game: …` above `onGameOver`.)

`apps/server/src/index.ts`: replace the whole file with:
```ts
import { createApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { connect, migrate } from './db.ts';
import { log } from './log.ts';
import { createProviders } from './providers.ts';

// The only file with side effects on the process: environment, port, signals. See config.ts for the variables.

const CLOSE_MS = 10_000; // how long closing may take before the process ends anyway

/** Logs why the server cannot run and ends the process. */
function fail(error: unknown, msg = 'Cannot start'): never {
  log.error(msg, error);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  fail(error);
}

const { pool, db } = connect(config.databaseUrl);
// An unreachable database stops the server here; the host restarts it. The logged error carries ECONNREFUSED's code.
await migrate(pool).catch((error) => fail(error, 'Cannot migrate the database'));

const app = createApp({
  db,
  providers: createProviders(config.oauth, config.publicUrl),
  origins: config.origins,
  webUrl: config.webUrl,
  secure: config.production,
});
const port = await app.listen(config.port).catch((error) => fail(error));
log.info('Listening', { port });

/** Hosts send SIGTERM before they stop or replace the server: close every connection, then exit. */
function shutdown() {
  log.info('Shutting down');
  setTimeout(() => process.exit(1), CLOSE_MS).unref();
  void app
    .close()
    .then(() => pool.end())
    .then(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
```

- [ ] **Step 4: Check that no `console` call is left in server code**

Run: `grep -rn "console\." apps/server/src --include='*.ts' | grep -v '\.test\.ts' | grep -v 'src/log.ts'`
Expected: no output.

- [ ] **Step 5: Run all the server's tests, lint and typecheck**

Run: `npm test -w @chess/server && npm run lint -w @chess/server && npm run typecheck -w @chess/server`
Expected: every test passes (the `Game over` JSON lines on stdout during `app.test.ts` are expected), no lint or type errors.

- [ ] **Step 6: Run the server once and look at its output**

Run: `npm run server` from the root (uses `apps/server/.env`), wait for the first line, then Ctrl-C.
Expected: `{"time":"…","level":"info","msg":"Listening","port":3001}`, and on Ctrl-C `{"time":"…","level":"info","msg":"Shutting down"}`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src
git commit -m "feat: log the server's events and errors as JSON lines, including every game that ends

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sentry on the server

**Files:**
- Modify: `apps/server/src/config.ts`, `apps/server/src/index.ts`, `apps/server/Dockerfile`, `.dockerignore`
- Test: `apps/server/src/config.test.ts`

**Interfaces:**
- Consumes: `log` (Task 1), `fail(error, msg?)` in `index.ts` (Task 2).
- Produces: `Config.sentryDsn?: string`. The image's `SENTRY_RELEASE` environment variable, set from the build arg `GIT_SHA` (Task 6 passes it).

- [ ] **Step 1: Write the failing config test**

Append to `apps/server/src/config.test.ts`:
```ts
test('SENTRY_DSN is optional: unset or empty turns Sentry off', () => {
  expect(loadConfig({}).sentryDsn).toBeUndefined();
  expect(loadConfig({ SENTRY_DSN: '' }).sentryDsn).toBeUndefined();
  const dsn = 'https://public@o1.ingest.sentry.io/1';
  expect(loadConfig({ SENTRY_DSN: dsn }).sentryDsn).toBe(dsn);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: FAIL on the new test: `expected undefined to be 'https://public@o1.ingest.sentry.io/1'`.

- [ ] **Step 3: Read `SENTRY_DSN` in `config.ts`**

In the `Config` interface, after `oauth`, add:
```ts
  sentryDsn?: string; // unset: no error reports
```
In the doc comment of `loadConfig`, change `…GITHUB_CLIENT_ID and _SECRET,` to `…GITHUB_CLIENT_ID and _SECRET, SENTRY_DSN,`.
In the object `loadConfig` returns, after `oauth: readOAuth(env),`, add:
```ts
    sentryDsn: env.SENTRY_DSN || undefined,
```

- [ ] **Step 4: Run the config tests to see them pass**

Run: `cd apps/server && npx vitest run src/config.test.ts`
Expected: PASS (the first test's `toEqual` ignores the `undefined` property).

- [ ] **Step 5: Start Sentry in `index.ts` and flush before every exit**

Add as the first import of `index.ts` (packages before local files):
```ts
import * as Sentry from '@sentry/node';
```
Add after `const CLOSE_MS = …`:
```ts
const FLUSH_MS = 2_000; // how long to wait for Sentry to send the last errors before exiting
```
Replace `fail` with two exits: the config one cannot have Sentry yet (the DSN is in the config), the later one can:
```ts
/** Logs why the server cannot run, gives Sentry a moment to send it, and ends the process. */
async function fail(error: unknown, msg = 'Cannot start'): Promise<never> {
  log.error(msg, error);
  await Sentry.flush(FLUSH_MS);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  log.error('Cannot start', error); // before Sentry: its DSN is part of the config
  process.exit(1);
}

// Errors only: no tracing. The release (the image's commit) comes from SENTRY_RELEASE.
if (config.sentryDsn) Sentry.init({ dsn: config.sentryDsn, environment: config.production ? 'production' : 'development' });
```
(This replaces the old `fail` and the old `let config … try … catch` block. The two `.catch(… fail …)` calls further down stay as they are; they now return `Promise<never>`, so `port` is still a `number`.)

In `shutdown`, insert the flush before the exit:
```ts
  void app
    .close()
    .then(() => pool.end())
    .then(() => Sentry.flush(FLUSH_MS))
    .then(() => process.exit(0));
```

- [ ] **Step 6: Bake the commit into the image**

In `apps/server/Dockerfile`, between `COPY apps/server/ apps/server/` and `USER node`, add:
```dockerfile
# The commit this image was built from (CI passes it); Sentry tags every error with it.
ARG GIT_SHA=dev
ENV SENTRY_RELEASE=$GIT_SHA
```
In `.dockerignore`, after the `docs` line, add:
```
deploy
.github
```

- [ ] **Step 7: Run all server tests, lint, typecheck, and build the image**

Run:
```bash
npm test -w @chess/server && npm run lint -w @chess/server && npm run typecheck -w @chess/server
docker build -f apps/server/Dockerfile --build-arg GIT_SHA=test -t chess-server:test .
docker run --rm --entrypoint printenv chess-server:test SENTRY_RELEASE
```
Expected: tests pass, no lint/type errors, the build succeeds, and the last command prints `test`.

- [ ] **Step 8: See an error reach Sentry's transport**

Without a real DSN, prove the init path runs: `cd apps/server && SENTRY_DSN=https://public@o1.ingest.sentry.io/1 node --env-file-if-exists=.env src/index.ts`, wait for `Listening`, Ctrl-C.
Expected: `Listening` then `Shutting down`, the process exits within ~2 s (the flush cannot reach the fake DSN but times out). No crash from `Sentry.init`.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/config.test.ts apps/server/src/index.ts apps/server/Dockerfile .dockerignore
git commit -m "feat: report the server's errors to Sentry when SENTRY_DSN is set, tagged with the image's commit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sentry on the site

**Files:**
- Create: `apps/web/src/instrumentation-client.ts`
- Modify: `apps/web/next.config.ts`, `apps/web/package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the site reads `NEXT_PUBLIC_SENTRY_DSN` at build time; `withSentryConfig` reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` from the build environment (Task 7 documents them).

Next 16 runs `src/instrumentation-client.ts` in the browser before the app becomes interactive (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`). There is no unit test: the file is configuration. The build is the test.

- [ ] **Step 1: Record the site's build before the change**

Run: `npm run build -w @chess/web 2>&1 | tail -20 && du -sk apps/web/.next/static/chunks`
Expected: the build succeeds. Note the size in KB that `du` prints (to compare in Step 5).

- [ ] **Step 2: Install `@sentry/nextjs` in the site workspace**

Run: `npm install @sentry/nextjs@^11.12.0 -w @chess/web`
Expected: `apps/web/package.json` lists `"@sentry/nextjs": "^11.12.0"`; no peer-dependency error (its range includes `next ^16`).

- [ ] **Step 3: Start Sentry in the browser**

Create `apps/web/src/instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs';

// Runs in the browser before the game starts. Errors only (WebGL and browser quirks on players' machines):
// no tracing, no session replay. Without NEXT_PUBLIC_SENTRY_DSN, in development and tests, Sentry stays off.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn });
```

- [ ] **Step 4: Wrap the Next config**

In `apps/web/next.config.ts`, add at the top `import { withSentryConfig } from '@sentry/nextjs';` and replace `export default nextConfig;` with:
```ts
// Uploads source maps only when the build has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT (set them on Vercel).
export default withSentryConfig(nextConfig, { silent: !process.env.CI, telemetry: false });
```

- [ ] **Step 5: Build without a DSN and with one**

Run:
```bash
npm run build -w @chess/web 2>&1 | tail -25
NEXT_PUBLIC_SENTRY_DSN=https://public@o1.ingest.sentry.io/1 npm run build -w @chess/web >/dev/null && grep -rl "o1.ingest.sentry.io" apps/web/.next/static | head -1
```
Expected: both builds succeed. A warning that source maps are not uploaded (no auth token) is fine. The `grep` prints one file under `.next/static/chunks/`, so the DSN reached the browser bundle.
If the build prints a warning asking for `onRouterTransitionStart`, add this line to the end of `instrumentation-client.ts` and build again:
```ts
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```
If the build fails because of `withSentryConfig` (Turbopack), revert Step 4 (keep Steps 2-3: errors still arrive, with minified stack traces) and write that down in the commit message.
Run `du -sk apps/web/.next/static/chunks` after the build without the DSN, compare with Step 1, and note the increase in the commit message.

- [ ] **Step 6: Run the site's tests, lint and typecheck**

Run: `npm test -w @chess/web && npm run lint -w @chess/web && npm run typecheck -w @chess/web`
Expected: all pass.

- [ ] **Step 7: Rebuild without the DSN so the local `.next` does not carry it, and commit**

```bash
npm run build -w @chess/web >/dev/null
git add apps/web/src/instrumentation-client.ts apps/web/next.config.ts apps/web/package.json package-lock.json
git commit -m "feat: report the site's errors to Sentry when NEXT_PUBLIC_SENTRY_DSN is set

Static chunks grow from <KB from Step 1> to <KB from Step 5>; write the two numbers measured above.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The production stack and its scripts (`deploy/`)

**Files:**
- Create: `deploy/compose.yml`, `deploy/Caddyfile`, `deploy/env.example`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore.sh`

**Interfaces:**
- Consumes: the image `ghcr.io/quocduy21-10/chess-server:<tag>` (Task 3's Dockerfile; Task 6 publishes it), `GET /health` on port 3001.
- Produces: `deploy/deploy.sh <40-hex sha>` (Task 6 calls it over SSH from `/opt/chess`), `deploy/backup.sh`, `deploy/restore.sh [commit]`. The scripts expect, next to themselves: `.env`, and `backups/` (a clone of the private backup repository).

- [ ] **Step 1: Write the compose file**

Create `deploy/compose.yml`:
```yaml
# The production stack. CI copies this directory to /opt/chess on the VPS and runs deploy.sh there;
# /opt/chess/.env (from env.example) holds the secrets. See README, "Production (VPS)".
name: chess

x-logging: &logging # Docker's own logs, capped: the VPS has 25 GB of disk
  driver: json-file
  options:
    max-size: 10m
    max-file: '3'

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    logging: *logging
    mem_limit: 384m
    environment:
      POSTGRES_USER: chess
      POSTGRES_DB: chess
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'chess', '-d', 'chess']
      interval: 5s
      timeout: 5s
      retries: 10

  server:
    image: ghcr.io/quocduy21-10/chess-server:${IMAGE_TAG:?set IMAGE_TAG (deploy.sh does)}
    restart: unless-stopped
    logging: *logging
    mem_limit: 384m
    env_file: .env
    environment:
      DATABASE_URL: postgres://chess:${POSTGRES_PASSWORD}@postgres:5432/chess
      NODE_OPTIONS: --max-old-space-size=256
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:3001/health']
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 20s
    stop_grace_period: 15s # the server closes every connection within 10 s of SIGTERM

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    logging: *logging
    mem_limit: 128m
    environment:
      API_DOMAIN: ${API_DOMAIN:?set API_DOMAIN in .env}
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - server

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: Write the Caddyfile and the env example**

Create `deploy/Caddyfile` (Caddyfiles indent with tabs):
```
# HTTPS for the game server. Caddy gets and renews the certificate for API_DOMAIN itself
# and passes Socket.IO's WebSocket upgrade through.
{$API_DOMAIN} {
	encode zstd gzip
	reverse_proxy server:3001
	log
}
```

Create `deploy/env.example` (no comments after values: `backup.sh` reads `BACKUP_HEARTBEAT_URL` with `grep`):
```
# Copy to /opt/chess/.env on the VPS, fill it in, and chmod 600 it. Keep comments on lines of their own.

# The server's public name. Its DNS A record points at the VPS.
API_DOMAIN=api.chess.example.com
# openssl rand -hex 24 (hex keeps DATABASE_URL valid)
POSTGRES_PASSWORD=
# The site's origin, and the server's own.
CLIENT_ORIGIN=https://chess.example.com
PUBLIC_URL=https://api.chess.example.com
# At least one OAuth app, with the callback URL https://<API_DOMAIN>/auth/<provider>/callback
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Optional: report errors to Sentry.
SENTRY_DSN=
# Optional: a heartbeat URL that backup.sh pings after every backup.
BACKUP_HEARTBEAT_URL=
# Written by deploy.sh: the image now running.
IMAGE_TAG=
```

- [ ] **Step 3: Write the backup script**

Create `deploy/backup.sh`:
```bash
#!/usr/bin/env bash
# Dumps the database to backups/chess.sql and pushes it to the private backup repository.
# Cron runs it every night and deploy.sh before every deploy. See README, "Backups".
set -euo pipefail
cd "$(dirname "$0")"

# Sessions keep their table but not their rows: sign-in tokens need not survive, and should not leave the server.
docker compose exec -T postgres pg_dump -U chess --clean --if-exists --no-owner \
  --exclude-table-data=sessions chess > backups/chess.sql.tmp
mv backups/chess.sql.tmp backups/chess.sql # only a complete dump replaces the last good one

git -C backups add chess.sql
if ! git -C backups diff --cached --quiet; then
  git -C backups -c user.name=chess-backup -c user.email=backup@localhost \
    commit -q -m "backup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
git -C backups push -q origin HEAD # also pushes a commit an earlier failed push left behind

heartbeat=$(grep -E '^BACKUP_HEARTBEAT_URL=' .env | cut -d= -f2- || true)
if [ -n "$heartbeat" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$heartbeat"
fi
echo "Backup done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```
Note: `pg_dump` 17.6 and later write a random `\restrict` key into every dump, so the file changes, and a commit is made, every night even when no data changed. That is expected; Git stores only the changed line.

- [ ] **Step 4: Write the restore script**

Create `deploy/restore.sh`:
```bash
#!/usr/bin/env bash
# Puts a backup back: ./restore.sh [commit]   (default: the latest; list them with git -C backups log --oneline)
# The database as it was goes to before-restore.sql first, so a restore can itself be undone.
set -euo pipefail
cd "$(dirname "$0")"

commit=${1:-HEAD}
dump=$(mktemp)
trap 'rm -f "$dump"' EXIT
git -C backups show "$commit:chess.sql" > "$dump"

docker compose exec -T postgres pg_dump -U chess --clean --if-exists --no-owner chess > before-restore.sql
docker compose stop server
# One transaction: a failure leaves the database as it was, and the server comes back either way.
if ! docker compose exec -T postgres psql -U chess -d chess -q -v ON_ERROR_STOP=1 --single-transaction < "$dump"; then
  docker compose start server
  echo "Restore failed; nothing was changed." >&2
  exit 1
fi
docker compose start server
echo "Restored $commit. The database as it was is in before-restore.sql."
```

- [ ] **Step 5: Write the deploy script**

Create `deploy/deploy.sh`:
```bash
#!/usr/bin/env bash
# Ships one image: ./deploy.sh <full commit SHA>
# CI runs it over SSH after logging Docker in to ghcr.io; it also works by hand on the VPS, for a rollback.
set -euo pipefail
cd "$(dirname "$0")"
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

sha=${1:-}
if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <40-character commit SHA>" >&2
  exit 2
fi
export IMAGE_TAG=$sha # compose needs a tag even to list the running services

# Back up before the new server starts and migrates. On the very first deploy there is no database yet.
if [ -n "$(docker compose ps --status running -q postgres)" ]; then
  ./backup.sh
else
  echo "Postgres is not running yet: nothing to back up."
fi

# Keep the tag in .env, so docker compose typed by hand later uses this image too. sed -i keeps .env's mode.
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=$sha" >> .env

docker compose pull
docker compose up -d --wait --wait-timeout 120
docker image prune -f
echo "Deployed $sha"
```

- [ ] **Step 6: Make the scripts executable and run shellcheck**

Run:
```bash
chmod +x deploy/*.sh
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable deploy/deploy.sh deploy/backup.sh deploy/restore.sh
```
Expected: no output (exit 0). Fix anything it reports.

- [ ] **Step 7: Check the compose file the way CI will**

Run:
```bash
cp deploy/env.example deploy/.env
IMAGE_TAG=0000000000000000000000000000000000000000 POSTGRES_PASSWORD=ci API_DOMAIN=api.example.com \
  docker compose -f deploy/compose.yml config -q && echo OK
rm deploy/.env
```
Expected: `OK`. (`deploy/.env` is ignored by `.gitignore`'s `.env*` rule; remove it anyway.)

- [ ] **Step 8: Round-trip a backup and a restore against a throwaway stack**

This uses its own project name, so it touches neither the development Postgres nor anything else on the machine. Caddy is not started (no ports 80/443 needed).
```bash
docker build -f apps/server/Dockerfile --build-arg GIT_SHA=local -t ghcr.io/quocduy21-10/chess-server:local .
T=$(mktemp -d) && cp deploy/* "$T"/ && cd "$T"
export COMPOSE_PROJECT_NAME=chess-s1-test
cat > .env <<EOF
API_DOMAIN=localhost
POSTGRES_PASSWORD=$(openssl rand -hex 12)
CLIENT_ORIGIN=http://localhost:3000
PUBLIC_URL=http://localhost:3001
GITHUB_CLIENT_ID=test
GITHUB_CLIENT_SECRET=test
IMAGE_TAG=local
EOF
git init -q --bare remote.git && git clone -q remote.git backups
docker compose up -d --wait postgres server
sql() { docker compose exec -T postgres psql -U chess -d chess -tAc "$1"; }
sql "INSERT INTO users (display_name) VALUES ('Ann')"
sql "INSERT INTO sessions (token_hash, user_id, expires_at) SELECT 'x'::bytea, id, now() + interval '1 day' FROM users"
./backup.sh
git -C remote.git log --oneline            # expect: one "backup <time>" commit
grep -c "Ann" backups/chess.sql            # expect: 1 or more
sql "UPDATE users SET display_name = 'Bob'"
./restore.sh
sql "SELECT display_name FROM users"       # expect: Ann
sql "SELECT count(*) FROM sessions"        # expect: 0
grep -c "Bob" before-restore.sql           # expect: 1 or more
docker compose ps server --format '{{.Status}}'   # expect: Up … (healthy) within ~20 s
./restore.sh deadbeef || echo "refused"    # expect: git error, then "refused"; database unchanged
sql "SELECT display_name FROM users"       # expect: Ann
docker compose down -v && cd - && rm -rf "$T" && unset COMPOSE_PROJECT_NAME
docker image rm ghcr.io/quocduy21-10/chess-server:local
```
Expected: every `expect` holds. If `psql` stops on a `DROP SCHEMA`/`CREATE SCHEMA` line for `public` or `drizzle`, adjust `backup.sh` (for example `--schema=public --schema=drizzle` or dropping `--clean` in favour of a `DROP SCHEMA … CASCADE` preamble in `restore.sh`) and repeat the round trip until it passes.

- [ ] **Step 9: Commit**

```bash
git add deploy
git commit -m "feat: add the VPS stack (server, Postgres, Caddy) with deploy, backup and restore scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `apps/web/package.json` (`typecheck` script)

**Interfaces:**
- Consumes: `npm run lint|typecheck|test|build` at the root; `apps/server/Dockerfile` with build arg `GIT_SHA` (Task 3); `deploy/*` and `deploy/deploy.sh <sha>` (Task 5).
- Produces: GitHub check runs named `check`, `image`, `deploy`; images `ghcr.io/quocduy21-10/chess-server:<sha>` and `:latest`.

- [ ] **Step 1: Let the site's typecheck run on a fresh checkout**

`apps/web/next-env.d.ts` is ignored by Git, so CI does not have it. `next typegen` writes it, and the route types, without a build (`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`). In `apps/web/package.json` change the script to:
```json
    "typecheck": "next typegen && tsc --noEmit"
```
Run: `npm run typecheck -w @chess/web`
Expected: no errors.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:
```yaml
# Checks every pull request and push to main; ships main to the VPS. See README, "Continuous integration".
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      tag:
        description: Full commit SHA of an image in GHCR to deploy (rollback)
        required: true
        type: string

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  # A newer push to a pull request replaces the older run; runs on main queue, so a deploy is never cut off.
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  IMAGE: ghcr.io/quocduy21-10/chess-server

jobs:
  check:
    if: github.event_name != 'workflow_dispatch' # a rollback ships an image that already passed
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: chess
          POSTGRES_PASSWORD: chess
          POSTGRES_DB: chess_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U chess"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      TEST_DATABASE_URL: postgres://chess:chess@localhost:5432/chess_test
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - name: Check the deploy scripts
        run: shellcheck deploy/*.sh
      - name: Check the production compose file
        run: cp deploy/env.example deploy/.env && docker compose -f deploy/compose.yml config -q
        env:
          IMAGE_TAG: '0000000000000000000000000000000000000000'
          POSTGRES_PASSWORD: ci
          API_DOMAIN: api.example.com

  image:
    needs: check
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    env:
      PUSH: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - if: env.PUSH == 'true'
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      # On a pull request the image is built and thrown away, which still catches a broken Dockerfile.
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: apps/server/Dockerfile
          build-args: GIT_SHA=${{ github.sha }}
          push: ${{ env.PUSH == 'true' }}
          tags: |
            ${{ env.IMAGE }}:${{ github.sha }}
            ${{ env.IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: image
    # Runs after image on a push to main, or alone on a manual run from main, where check and image are skipped.
    if: >-
      !cancelled() && !failure() && github.ref == 'refs/heads/main' &&
      (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: deploy
      cancel-in-progress: false
    permissions:
      contents: read
      packages: read
    env:
      SHA: ${{ inputs.tag || github.sha }}
      TARGET: ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }}
    steps:
      - name: Refuse anything but a full commit SHA
        run: '[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "tag must be a 40-character commit SHA" >&2; exit 1; }'
      - uses: actions/checkout@v7
      - name: Trust the VPS and load the key
        env:
          KNOWN_HOSTS: ${{ secrets.VPS_KNOWN_HOSTS }}
          SSH_KEY: ${{ secrets.VPS_SSH_KEY }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          printf '%s\n' "$SSH_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/known_hosts ~/.ssh/id_ed25519
      - name: Copy the stack
        run: scp deploy/* "$TARGET:/opt/chess/"
      - name: Deploy
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        # The token reaches the VPS on stdin, never on a command line, and dies with this job.
        run: |
          printf '%s' "$GHCR_TOKEN" |
            ssh "$TARGET" "docker login ghcr.io -u $GITHUB_ACTOR --password-stdin && /opt/chess/deploy.sh $SHA"
```

- [ ] **Step 3: Lint the workflow**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -color`
Expected: no output (exit 0). actionlint also runs shellcheck on the `run:` blocks; fix anything it reports.

- [ ] **Step 4: Run the whole check locally, as CI will**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml apps/web/package.json
git commit -m "feat: check every pull request in GitHub Actions and ship main to the VPS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Prove it on GitHub (ask the owner first: this pushes and opens a PR)**

After the owner agrees:
```bash
git push -u origin phase5-s1-ci-cd
gh pr create --draft --base main --title "Phase 5, S1: CI/CD, VPS deploy, backups and monitoring" --body-file <(printf '%s\n\n%s\n' "Implements docs/superpowers/specs/2026-11-13-ci-cd-monitoring-design.md." "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
gh pr checks --watch
```
Expected: `check` and `image` pass; `deploy` is skipped (not `main`). If a check fails, read its log (`gh run view --log-failed`), fix, commit, push, and watch again.

---

### Task 7: README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above; names must match: `deploy/*.sh`, `/opt/chess`, `/opt/chess/backups`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `BACKUP_HEARTBEAT_URL`, `API_DOMAIN`, `POSTGRES_PASSWORD`.
- Produces: documentation only.

- [ ] **Step 1: Add the Sentry variables to the variable table**

In the table under "Online play", after the `NEXT_PUBLIC_SERVER_URL` row, add:
```markdown
| `SENTRY_DSN` | server | Optional. A Sentry project's DSN; unset or empty: no error reports. |
| `NEXT_PUBLIC_SENTRY_DSN` | site, at build time | Optional. A Sentry project's DSN for the browser. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | site build | Optional. Upload source maps, for readable stack traces. |
```

- [ ] **Step 2: Point the existing "Deploying" part at the new one**

At the end of the "### Deploying" section, add:
```markdown
The project's own setup, a VPS deployed by GitHub Actions, is described below.
```

- [ ] **Step 3: Append the new sections at the end of the README**

````markdown
## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. `check`: lint, typecheck, the tests against a Postgres service, the site's build, `shellcheck` on
   `deploy/*.sh`, and `docker compose config` on `deploy/compose.yml`.
2. `image`: builds the server's image. On `main` it is pushed to `ghcr.io/quocduy21-10/chess-server`, tagged
   with the commit's SHA and `latest`.
3. `deploy`: on `main` only, ships that image to the VPS (below).

A red `check` stops the other two. The site still deploys through Vercel's Git integration; in the Vercel
project, Settings → Deployment Checks, add the GitHub check `check` so a production deployment waits for it
(see https://vercel.com/docs/deployment-checks).

## Production (VPS)

The server runs on one VPS with Docker Compose: the server, Postgres 17 and Caddy, which gets the HTTPS
certificate itself. `deploy/` holds the stack, and every deploy copies it to `/opt/chess`. The images are built
by GitHub Actions, never on the VPS. Memory limits (384 MB, 384 MB, 128 MB) fit a VPS with 1.5 GB of RAM.

### One-time setup

On the VPS, as root (Ubuntu or Debian):

1. Point a DNS `A` record for the server's name, such as `api.chess.example.com`, at the VPS. The site needs a
   name on the same domain (see "Deploying").
2. Allow only SSH, HTTP and HTTPS:
   `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`
3. Install Docker: `curl -fsSL https://get.docker.com | sh`
4. Create the deploy user and its directory:
   ```bash
   adduser --disabled-password --gecos '' deploy
   usermod -aG docker deploy
   install -d -o deploy -g deploy /opt/chess
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   ```

On your own computer, make the key GitHub Actions will use, and install its public half:

```bash
ssh-keygen -t ed25519 -N '' -C chess-deploy -f chess-deploy
ssh root@<vps> 'cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys' < chess-deploy.pub
ssh-keyscan -t ed25519 <vps>
```

Compare the `ssh-keyscan` line with the VPS's own key (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the
VPS) before trusting it.

On the VPS, as `deploy`:

5. Copy `deploy/env.example` from this repository to `/opt/chess/.env`, fill it in, and `chmod 600 /opt/chess/.env`.
6. Set up backups (next part). The first deploy needs nothing in the database; every later one backs up first.

In GitHub, Settings → Environments → New environment `production`, add these secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS's IP address or name |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | The contents of `chess-deploy` (the private key) |
| `VPS_KNOWN_HOSTS` | The `ssh-keyscan` line you checked |

Register `https://<API_DOMAIN>/auth/<provider>/callback` with each OAuth app. Then push to `main`, or run the
workflow by hand: the first deploy starts Postgres, then the server, which creates the tables.

Until the secrets exist, the `deploy` job fails on every push to `main`; `check` and `image` are unaffected.

### Every deploy

`deploy.sh <sha>` backs up the database, pulls the new image, starts it, waits until `/health` answers, and
removes old images. If the new server never turns healthy, the job fails.

**Rollback:** Actions → CI → Run workflow, on `main`, with the full SHA of an earlier commit (its image is in
GHCR). The scripts and compose file come from the current `main`; only the image is the old one. On the VPS,
`/opt/chess/deploy.sh <sha>` does the same after `docker login ghcr.io` (needed only if the package is private).
Rolling back past a migration that removed or renamed something can leave the old code facing a newer schema:
restore the backup taken before that deploy too (see "Restore").

Useful commands in `/opt/chess`:

```bash
docker compose ps
docker compose logs -f server | jq    # one JSON line per event
docker compose logs caddy             # HTTP access log
```

### Backups

`backup.sh` dumps the database to one plain SQL file, `backups/chess.sql`, and pushes it to a private Git
repository: the Git history keeps every night. The `sessions` table is saved empty: after a restore, everyone
signs in again. It runs every night from cron and before every deploy.

The dump holds players' display names, avatar URLs and Google/GitHub account ids. **Keep the backup repository
private.** GitHub refuses files over 100 MB, far beyond this game's size for a long time.

One-time setup on the VPS, as `deploy`:

1. Create an empty private repository on GitHub, such as `chess-backups`.
2. Make a key that may write to that repository only, and add its public half there (repository → Settings →
   Deploy keys → Allow write access):
   ```bash
   ssh-keygen -t ed25519 -N '' -C chess-backup -f ~/.ssh/chess_backup
   cat ~/.ssh/chess_backup.pub
   ```
3. Clone it into place:
   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts
   GIT_SSH_COMMAND='ssh -i ~/.ssh/chess_backup -o IdentitiesOnly=yes' \
     git clone git@github.com:<you>/chess-backups.git /opt/chess/backups
   git -C /opt/chess/backups config core.sshCommand 'ssh -i ~/.ssh/chess_backup -o IdentitiesOnly=yes'
   ```
4. `crontab -e`, and add:
   ```
   0 3 * * * /opt/chess/backup.sh >> /opt/chess/backup.log 2>&1
   ```

### Restore

```bash
git -C /opt/chess/backups log --oneline   # the backups
/opt/chess/restore.sh                     # the latest
/opt/chess/restore.sh <commit>            # an earlier one
```

`restore.sh` saves the current database to `/opt/chess/before-restore.sql`, stops the server, restores in one
transaction (a failure changes nothing), and starts the server, which applies any newer migrations. To undo a
restore:

```bash
cd /opt/chess && docker compose stop server
docker compose exec -T postgres psql -U chess -d chess -v ON_ERROR_STOP=1 --single-transaction < before-restore.sql
docker compose start server
```

## Monitoring

- **Logs:** the server writes one JSON line per event (`Listening`, `Game over`, errors with their stack);
  Caddy writes the HTTP access log. Docker keeps 30 MB per service.
- **Errors:** create two projects on sentry.io, Node.js and Next.js. Put the first one's DSN in `SENTRY_DSN` in
  `/opt/chess/.env` and run `docker compose up -d` there. On Vercel, set `NEXT_PUBLIC_SENTRY_DSN`, and for readable
  stack traces `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.
- **Uptime:** on a free plan of Better Stack or UptimeRobot, create an HTTP monitor on
  `https://<API_DOMAIN>/health` every minute, and a heartbeat monitor that expects a ping at least every 25 hours;
  put its URL in `BACKUP_HEARTBEAT_URL`. A missing ping means the nightly backup did not finish.
````

- [ ] **Step 4: Check every name in the README against the code**

Run:
```bash
for name in VPS_HOST VPS_USER VPS_SSH_KEY VPS_KNOWN_HOSTS SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN BACKUP_HEARTBEAT_URL API_DOMAIN POSTGRES_PASSWORD; do
  printf '%s: ' "$name"; grep -rl "$name" .github deploy apps/server/src apps/web/src apps/web/next.config.ts 2>/dev/null | tr '\n' ' '; echo
done
```
Expected: every name is found in at least one file.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: explain CI, the VPS setup, backups, restores and monitoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

- Push the README commit to the PR branch and confirm `check` and `image` are still green.
- Report to the owner what was verified (tests, local builds, the backup/restore round trip, the PR's checks) and
  what was not: the first real deploy, which needs their VPS, domain, the backup repository and the four secrets.
