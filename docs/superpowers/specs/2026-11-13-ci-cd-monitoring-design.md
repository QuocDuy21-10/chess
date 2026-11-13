# 3D Combat Chess — CI/CD, Deploy to a VPS, Backups and Monitoring

Date: 2026-11-13
Status: design approved in chat; spec awaiting review

## Goal

Every pull request and every push to `main` is linted, type-checked, tested against Postgres and built.
Every green push to `main` ships the game server to the project's VPS without anyone logging in, after a
backup of the database. The server writes one JSON line per event, errors on both ends reach Sentry, and an
outside monitor raises the alarm when the server or the nightly backup stops. Nothing a player sees changes.

This is S1 of four sub-projects that carry out `roadmap-2.md` §4, Phase 5. Each later one gets its own spec:

| | Sub-project | Builds on |
|---|---|---|
| **S1** | CI/CD, deploy to the VPS, backups, logging and monitoring (this spec) | — |
| S2 | Securing the API and WebSocket: rate limits, Origin check on the handshake, connection caps, CSP | S1 |
| S3 | Tests: chess-rule edge cases, the animation sequencer, Playwright E2E on Chromium, Firefox and WebKit | S1 |
| S4 | Assets: cache headers, music size, loading the engine only when needed, bundle size | S1 |

## Where things stand

- No `.github/workflows`. Tests, lint and typecheck run only on a developer's machine.
- `apps/server/Dockerfile` builds the server from the repository root; nothing publishes it.
- The site deploys on Vercel through Vercel's Git integration (README, "Deploying").
- The server logs with `console.*` in 8 places; there is no error tracking.
- `/health` answers `{"status":"ok"}` and reads no state. `SIGTERM` closes every connection within 10 s.
- The server's tests and `apps/web/src/net/online.test.ts` need `TEST_DATABASE_URL`; `vitest.config` already
  falls back to the environment when there is no `.env` ("CI sets it in the environment").
- Postgres has no backups.

## Decisions already made

| Question | Decision |
|---|---|
| Where the server runs | The owner's VPS: 2 cores, 1.5 GB RAM (+0.5 GB), 25 GB SSD, one IP. |
| What runs there | Docker Compose: `server`, `postgres` (17), `caddy` (HTTPS, WebSocket proxy). |
| Where images are built | In GitHub Actions, never on the VPS (1.5 GB RAM). Pushed to GHCR. |
| How deploys reach the VPS | Plain `ssh`/`scp` from Actions with a pinned host key; no third-party SSH action. |
| The site | Stays on Vercel's Git integration; Actions does not deploy it. |
| Workflow shape | One `ci.yml` with three chained jobs: `check` → `image` → `deploy`. |
| Rollback | `workflow_dispatch` with the SHA of an earlier image. |
| Secrets | Application secrets live only in `/opt/chess/.env` on the VPS. GitHub holds only the SSH details. |
| Logging | A JSON-lines logger of our own (`log.ts`); no logging library. HTTP access logs come from Caddy. |
| Error tracking | Sentry (free plan): `@sentry/node` on the server, `@sentry/nextjs` on the site. Errors only, no tracing or replay. Off without a DSN. |
| Uptime | An outside free monitor (Better Stack or UptimeRobot) on `/health`, and a heartbeat for the backup. No code. |
| Backups | `pg_dump` to one plain `.sql` file, committed and pushed nightly by cron to a private Git repository; also before every deploy. `restore.sh` restores any commit. |

## Layout

```
.github/workflows/ci.yml          new: check → image → deploy
deploy/                           new: copied to /opt/chess on the VPS by every deploy
  compose.yml                     the production stack
  Caddyfile                       HTTPS for API_DOMAIN, proxy to server:3001
  env.example                     the variables /opt/chess/.env must set
  deploy.sh                       backup → pull → up --wait → prune; also runnable by hand
  backup.sh                       pg_dump → commit → push → heartbeat
  restore.sh                      put a backup back
apps/server/src/log.ts            new: the JSON logger
apps/server/src/log.test.ts       new
apps/server/src/index.ts          Sentry.init, log instead of console
apps/server/src/{app,http,db,game,auth}.ts   log instead of console
apps/server/src/config.ts         reads SENTRY_DSN
apps/server/Dockerfile            ARG GIT_SHA → ENV SENTRY_RELEASE
apps/web/src/instrumentation-client.ts       new: Sentry.init in the browser
apps/web/next.config.ts           wrapped in withSentryConfig
.dockerignore                     also leaves out deploy/ and .github/
README.md                         CI, VPS setup, backups and restore, monitoring
```

## CI: `.github/workflows/ci.yml`

Triggers: `pull_request`; `push` to `main`; `workflow_dispatch` with a required input `tag` (the 40-character
SHA of an image already in GHCR). Default permissions `contents: read`. A newer run on the same ref cancels
an older one (`concurrency: ci-${{ github.ref }}`), except the `deploy` job, which has its own group
`deploy` with `cancel-in-progress: false`, so a deploy is never cut off halfway.

### Job `check`

Skipped on `workflow_dispatch` (a rollback ships an image that already passed).

- Service container `postgres:17-alpine`: user and password `chess`, `POSTGRES_DB=chess_test`, health
  check `pg_isready`, port 5432.
- `actions/checkout`, `actions/setup-node` (Node 22, npm cache), `npm ci`.
- `npm run lint`, `npm run typecheck`, `npm test` with
  `TEST_DATABASE_URL=postgres://chess:chess@localhost:5432/chess_test`, `npm run build` (the site).
- `shellcheck deploy/*.sh` (preinstalled on `ubuntu-latest`).
- `docker compose -f deploy/compose.yml config -q` with dummy values for the variables it interpolates,
  so a broken compose file fails here, not on the VPS.

### Job `image`

Needs `check`. Permissions `contents: read`, `packages: write`.

- `docker/setup-buildx-action`; `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN`, only on a push to
  `main`.
- `docker/build-push-action`: context `.`, file `apps/server/Dockerfile`, build arg `GIT_SHA=${{ github.sha }}`,
  cache `type=gha`. Tags `ghcr.io/quocduy21-10/chess-server:<sha>` and `:latest` (GHCR wants the owner in
  lower case). `push` is true only on a push to `main`; on a pull request the image is built and thrown
  away, which still catches a broken Dockerfile.

### Job `deploy`

Runs on a push to `main` after `image`, or alone on `workflow_dispatch` from `main`. Because it needs
`image`, which is skipped on a dispatch, its condition is
`!cancelled() && !failure() && github.ref == 'refs/heads/main' && (push or workflow_dispatch)`.
`environment: production`, so the owner can add required reviewers later without changing the file.
Permissions `contents: read`, `packages: read`.

Secrets (in the `production` environment): `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a private key whose public
half is in the deploy user's `authorized_keys`), `VPS_KNOWN_HOSTS` (the output of `ssh-keyscan` for the host,
checked by the owner). No `StrictHostKeyChecking=no`.

Steps:
1. Write the key and `known_hosts` to `~/.ssh` with mode 600.
2. `scp deploy/* $VPS_USER@$VPS_HOST:/opt/chess/`.
3. Over one `ssh`: log Docker in to `ghcr.io` with `GITHUB_TOKEN` piped to `--password-stdin` (the token dies
   with the job), then run `/opt/chess/deploy.sh <sha>`, where `<sha>` is `github.sha` or the `tag` input.

## The VPS

### `deploy/deploy.sh <sha>`

`set -euo pipefail`; works from its own directory. Refuses a first argument that is not 40 lower-case hex
characters: it reaches a shell over SSH and names an image. Then:

1. If the `postgres` service is running, `./backup.sh`. Any failure stops the deploy before the new server
   starts and runs its migrations. On the very first deploy Postgres is not running yet, so there is nothing
   to back up; the script says so and goes on.
2. Sets `IMAGE_TAG=<sha>` in `.env` (removes the old line, appends the new one), so a later hand-typed
   `docker compose up -d` keeps the same image.
3. `docker compose pull`, then `docker compose up -d --wait --wait-timeout 120`. `--wait` returns only when
   `postgres` and `server` report healthy; otherwise the script, and the job, fail.
4. `docker image prune -f` (25 GB disk).
5. On exit, whatever happened: `docker logout ghcr.io`.

A rollback is the same script with an older SHA. Rolling back across a migration that dropped or renamed
something can leave the old code facing a newer schema; README says to restore the backup taken before that
deploy in that case.

### `deploy/compose.yml`

`name: chess`. Every service has `restart: unless-stopped` and the same logging block, written once as a YAML
anchor: driver `json-file`, `max-size: 10m`, `max-file: 3`.

| Service | Image | Memory limit | Notes |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 384 MB | `POSTGRES_USER=chess`, `POSTGRES_DB=chess`, `POSTGRES_PASSWORD` from `.env`. Volume `pgdata`. No published port. Health check `pg_isready -U chess`. Default settings (`shared_buffers` 128 MB). |
| `server` | `ghcr.io/quocduy21-10/chess-server:${IMAGE_TAG:?}` | 384 MB | `env_file: .env`; `DATABASE_URL=postgres://chess:${POSTGRES_PASSWORD}@postgres:5432/chess`; `NODE_OPTIONS=--max-old-space-size=256`. Starts after `postgres` is healthy. Health check `wget -qO- http://127.0.0.1:3001/health` (busybox, in the alpine image). `stop_grace_period: 15s` (the server's own limit is 10 s). No published port. |
| `caddy` | `caddy:2-alpine` | 128 MB | Ports 80, 443 and 443/udp. Volumes `caddy_data` (certificates) and `caddy_config`; `Caddyfile` mounted read-only. `API_DOMAIN` from `.env`. |

The limits add up to about 900 MB, leaving room for the system and Docker.

### `deploy/Caddyfile`

```
{$API_DOMAIN} {
	encode zstd gzip
	reverse_proxy server:3001
	log
}
```

Caddy obtains and renews the Let's Encrypt certificate, redirects HTTP to HTTPS, passes Socket.IO's WebSocket
upgrade through, and writes one JSON access-log line per request to its stdout.

### `deploy/env.example`

```
API_DOMAIN=api.chess.example.com
POSTGRES_PASSWORD=            # openssl rand -hex 24 (hex keeps DATABASE_URL valid)
CLIENT_ORIGIN=https://chess.example.com
PUBLIC_URL=https://api.chess.example.com
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SENTRY_DSN=                   # optional
BACKUP_HEARTBEAT_URL=         # optional
IMAGE_TAG=                    # written by deploy.sh
```

`NODE_ENV=production` comes from the image.

## Backups

### `deploy/backup.sh`

`set -euo pipefail`; works from its own directory. `backups/` is a clone of the owner's private backup
repository, pushed with a deploy key that may write to that repository only.

1. `docker compose exec -T postgres pg_dump -U chess --clean --if-exists --no-owner --exclude-table-data=sessions chess`
   into `backups/chess.sql.tmp`, then `mv` it over `backups/chess.sql`. A failed dump stops the script and
   leaves the last good file in place.
   - `--clean --if-exists`: the file drops and recreates what it restores.
   - `--exclude-table-data=sessions`: the table is kept, its rows are not. Sign-in tokens are not worth
     keeping and should not leave the server; after a restore everyone signs in again.
2. `git add chess.sql`; if anything changed, commit as `chess-backup <backup@localhost>` with the message
   `backup <UTC time>`, and `git push`. One file, overwritten each time: the Git history is the retention, and
   Git stores each night as a delta of the last.
3. If `.env` sets `BACKUP_HEARTBEAT_URL`, `curl -fsS -m 10 --retry 3` it. The value is read with `grep`, not by
   sourcing `.env`.

Cron, installed once by hand: `0 3 * * * /opt/chess/backup.sh >> /opt/chess/backup.log 2>&1`.

The dump holds players' display names, avatar URLs and Google/GitHub account ids (no e-mail addresses). The
backup repository must be private. GitHub refuses files over 100 MB; at this game's size that is far away,
and README says so.

### `deploy/restore.sh [commit]`

`set -euo pipefail`. Default commit `HEAD` of `backups/`.

1. Dumps the current database to `before-restore.sql` next to the script, so a restore can itself be undone.
2. `git -C backups show <commit>:chess.sql` to a temporary file.
3. `docker compose stop server`.
4. `docker compose exec -T postgres psql -U chess -d chess -v ON_ERROR_STOP=1 --single-transaction` from that
   file: all or nothing.
5. `docker compose start server`. A dump older than the current schema is fine: the server applies the
   missing migrations as it starts.

## Logging: `apps/server/src/log.ts`

```ts
log.info(msg: string, fields?: Record<string, unknown>): void   // stdout
log.warn(msg: string, fields?: Record<string, unknown>): void   // stdout
log.error(msg: string, error?: unknown, fields?: Record<string, unknown>): void  // stderr, and Sentry
```

Each call writes one line: `{"time":"<ISO>","level":"info","msg":"…",…fields}`. `log.error` adds
`"error":{"message","stack","code"}` for an `Error` (`code` when it has one, as `pg` errors do) or
`"error":"<String(value)>"` for anything else, and calls `Sentry.captureException(error, { extra: { msg, ...fields } })`,
which does nothing when Sentry was never started.

The 8 `console.*` calls become:

| Where | Becomes |
|---|---|
| `index.ts` `fail` | `log.error('Cannot start', error)` |
| `index.ts` listening | `log.info('Listening', { port })` |
| `index.ts` shutdown | new: `log.info('Shutting down')` |
| `app.ts` save failed | `log.error('Could not save a game', error, { roomId })` |
| `app.ts` session sweep | `log.error('Session sweep failed', error)` |
| `http.ts` `onError` | `log.error('Request failed', error)` |
| `db.ts` pool error | `log.warn('Postgres connection lost', { message })`: an idle connection dropped; the pool recovers |
| `game.ts` socket sign-in | `log.error('Socket sign-in check failed', error)` |
| `auth.ts` sign-in | `log.error('Sign-in failed', error, { provider })`: a wrong client secret breaks every sign-in |

And one new line where a game ends (`app.ts`, in `onGameOver`):
`log.info('Game over', { roomId, result, reason, moves })`.

## Sentry

### Server (`@sentry/node` 11.x, Node ≥ 22.12)

- `config.ts` reads `SENTRY_DSN` (optional; empty means off) into `config.sentryDsn`.
- `index.ts` calls `Sentry.init({ dsn, environment: NODE_ENV })` right after `loadConfig`, only when there is a
  DSN. No `tracesSampleRate`: errors only. `release` comes from `SENTRY_RELEASE`, which the image sets from
  `GIT_SHA`; the SDK reads it from the environment.
- The SDK reports uncaught exceptions and unhandled rejections itself.
- Before `process.exit` in `shutdown` and in `fail` (when Sentry is on), `await Sentry.flush(2000)`, so the last
  error is not lost.
- Startup errors before `Sentry.init` (a bad variable) only reach the log. The container restarts in a loop,
  and the uptime monitor reports the server down.

### Site (`@sentry/nextjs` 11.x; its peer range includes `next ^16`)

- `apps/web/src/instrumentation-client.ts`: `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN })` when the
  variable is set; no tracing, no replay. The errors worth seeing are WebGL and browser quirks on players'
  machines.
- `next.config.ts` is wrapped in `withSentryConfig`, which uploads source maps only when the build has
  `SENTRY_AUTH_TOKEN` (set on Vercel). Without it the build is unchanged, and stack traces stay minified.

## Monitoring

No code. README explains how to create two monitors on a free plan (Better Stack or UptimeRobot):

1. HTTP, every minute: `https://<API_DOMAIN>/health` must answer 200.
2. Heartbeat: expects a ping from `backup.sh` at least every 25 hours.

`/health` stays a liveness check and still reads no state. If it checked the database, Docker would restart a
healthy server every time Postgres hiccupped, which fixes nothing; database errors reach Sentry instead.

## Configuration

| Variable | Read by | Meaning |
|---|---|---|
| `SENTRY_DSN` | server | Optional. Sentry project DSN; unset or empty: Sentry off. |
| `SENTRY_RELEASE` | server (Sentry SDK) | Set by the image from `GIT_SHA`. |
| `NEXT_PUBLIC_SENTRY_DSN` | site, at build time | Optional. Unset: Sentry off. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | site build | Optional. Upload source maps. |
| `API_DOMAIN`, `POSTGRES_PASSWORD`, `IMAGE_TAG`, `BACKUP_HEARTBEAT_URL` | `deploy/` | See `env.example`. |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` | GitHub `production` environment | SSH to the VPS. |

## README

A new "Production" part replaces the Docker-only "Deploying" text where it overlaps:

- What CI runs, and that a red `check` blocks the image and the deploy.
- One-time VPS setup, as commands: a DNS `A` record for `API_DOMAIN`; firewall 22/80/443; Docker; a
  `deploy` user in the `docker` group; `/opt/chess` and its `.env`; the private backup repository, its deploy key
  (`core.sshCommand` in the clone) and the clone at `/opt/chess/backups`; the crontab line; the four GitHub
  secrets.
- Rollback: run the workflow by hand with an earlier SHA; across a migration, restore too.
- Backup and restore commands, and the privacy note on the dump.
- The two monitors, and the Sentry variables on the VPS and on Vercel.
- If it exists (see "To verify"), Vercel's setting that holds a production deployment until the GitHub
  `check` job passes.

## Error handling

- Any failing step in `check` stops `image` and `deploy`.
- `deploy.sh`: a bad SHA, a failed backup, a failed pull or a server that never turns healthy fails the job;
  the old containers keep running in the first three cases.
- `backup.sh`: a failed dump leaves the last good file; a failed push leaves the commit locally for the next
  run to push; the missing heartbeat raises the alarm.
- `restore.sh`: one transaction, so a failure changes nothing; `before-restore.sql` undoes a success.
- Logging never throws: a field that cannot be serialised becomes `"[unserializable]"`.

## Testing

- `log.test.ts`: the line's shape and level, the stream (stdout or stderr), how an `Error`, a `pg`-style error
  with `code` and a non-error are written, an unserialisable field, and that `log.error` calls
  `Sentry.captureException` (`vi.mock('@sentry/node')`).
- `config.test.ts`: `SENTRY_DSN` read when set, `undefined` when empty.
- Every existing test stays green.
- CI is proven on a real pull request: `check` and `image` (build only) must pass.
- `backup.sh` → `restore.sh` round trip, run by hand against the development Postgres with a throwaway local
  Git remote: create rows, back up, change rows, restore, see the original rows and an empty `sessions`.
- Not verifiable here: the first real deploy, which needs the owner's VPS, domain and secrets.

## Done when

- A pull request runs `check` and `image`, and both pass.
- A push to `main` publishes `ghcr.io/quocduy21-10/chess-server:<sha>` and runs `deploy` (which fails cleanly
  until the owner has set up the VPS and the secrets).
- `deploy/` holds the compose file, Caddyfile, env example and three scripts, all passing `shellcheck` and
  `docker compose config`.
- The backup/restore round trip works locally.
- The server prints only JSON lines, and with a DSN set an error reaches Sentry from both ends.
- README walks the owner from a bare VPS to a running deploy.

## To verify during implementation

- The `deploy` job's `if:` runs on a dispatch even though `check` and `image` are skipped.
- Next 16's `instrumentation-client.ts` location with a `src/` directory, and what `withSentryConfig` 11.x needs
  when there is no server-side Sentry config (read `node_modules/next/dist/docs/` first, per `apps/web/AGENTS.md`).
- `pg_dump --clean --if-exists` output restores into a database that already has the `public` and `drizzle`
  schemas without an error, inside `--single-transaction`.
- That Vercel offers a setting to wait for GitHub checks before promoting to production, and its name.
- `docker compose config` accepts the file with only dummy `IMAGE_TAG`, `POSTGRES_PASSWORD` and `API_DOMAIN`.

## Out of scope

- Rate limits, the WebSocket Origin check, connection caps, CSP (S2).
- Playwright and cross-browser tests (S3).
- Cache headers and asset sizes (S4).
- Metrics, tracing, log shipping, a database readiness check.
- Encrypting backups (`age` can be added to `backup.sh` later), copies outside GitHub.
- Deploying the site from Actions; zero-downtime deploys (rooms live in memory, so a deploy ends games in
  progress, as README already says).
