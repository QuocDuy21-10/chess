# 3D Combat Chess — Site and Server on One VPS, Behind a Shared Proxy

Date: 2026-11-27
Status: design approved in chat; spec awaiting review

## Goal

`https://chess.duydq.cloud` serves the whole game, site and server, from the owner's VPS. A push to `main`
that passes CI deploys it. The images are small, nothing is built on the VPS, and the other application already
running there keeps working.

This replaces two decisions of `2026-11-13-ci-cd-monitoring-design.md`: the site no longer deploys to Vercel,
and the chess stack no longer owns ports 80 and 443. Backups, restore, logging and monitoring stay as that
spec describes them.

## Where things stand (checked 2026-11-27)

- VPS: Ubuntu 24.04, x86_64, 2 cores, 1.4 GB RAM (about 680 MB available) plus 2 GB swap, 25 GB disk with
  14 GB free after old images of the other application were removed.
- The other application's Compose stack runs there, and its Caddy holds ports 80 and 443.
- `chess.duydq.cloud` has no DNS record yet.
- `main` is red: `online.spec` exceeds its 120 s timeout on Chromium in CI. The cause is not established.
- The GitHub `production` environment has no secrets. Nothing of the chess stack has ever been deployed.
- New piece models are uncommitted in the owner's working tree. CI builds only committed files.

### Measured in a throwaway copy (arm64 Mac)

| | Today | Prototype |
|---|---|---|
| Server image, on disk / download | 464 MB / 111 MB | 197 MB / 54 MB |
| Site | no image | 6.8 MB of static files |
| Idle memory | — | server 76 MB, Postgres 27 MB |

The prototype server migrated an empty database, answered `/health`, `/auth/providers`, `/me` (401) and a
Socket.IO polling handshake that carried an `Origin`, and exited 0 on `SIGTERM`. It warned that
`@sentry/server-runtime-injection` could not be found. The static export built after removing `cacheComponents`
and `partialPrefetching`, within the bundle budget. It has not been opened in a browser, and the site has not
been built inside Docker.

## Decisions

| Question | Decision |
|---|---|
| Where the site runs | On the VPS, as static files |
| Address | One origin, `https://chess.duydq.cloud`, for site and API |
| Ports 80 and 443 | The other application's Caddy stays the edge and forwards this host to the chess stack |
| How releases ship | GitHub Actions builds two images, pushes them to GHCR, and deploys over SSH |
| Server packaging | One esbuild bundle on Alpine with only the `node` binary |
| Site packaging | `caddy:2-alpine` (already on the VPS) with precompressed static files |

## Architecture

```
Internet ──443──> edge Caddy (other stack, TLS)
                    └─ chess.duydq.cloud ── network "edge" ──> web (Caddy + static files)
                                                                └─ /health /auth/* /me /me/* /socket.io/*
                                                                     └──> server:3001 ──> postgres
```

| Service | Image | Memory limit | Networks |
|---|---|---|---|
| `web` | `ghcr.io/quocduy21-10/chess-web:<sha>` | 64 MB | `default`, `edge` (alias `chess-web`) |
| `server` | `ghcr.io/quocduy21-10/chess-server:<sha>` | 192 MB | `default` |
| `postgres` | `postgres:17-alpine` | 192 MB | `default` |

No service publishes a port. `edge` is an external Docker network, created once by hand.

Client addresses: the edge Caddy sets `X-Forwarded-For`; the `web` Caddy trusts private ranges and appends to
it; the server runs with `TRUST_PROXY=2`. Rate limits therefore count the player's own address.

## Changes in this repository

### Site

- `apps/web/next.config.ts`: `output: 'export'`; remove `cacheComponents`, `partialPrefetching` and
  `headers()` (a static export applies none).
- A small script writes the security headers and cache headers as a Caddy snippet at image build, taking the
  CSP from `src/csp.ts`, which stays its only source. It has a test.
- `apps/web/src/net/online.ts`: Socket.IO uses `transports: ['websocket']`. The server refuses a handshake
  without `Origin` (`apps/server/src/app.ts`), and a browser normally sends none on a same-origin polling GET.
  A WebSocket handshake always carries it. The server's check does not change. A network that blocks WebSocket
  cannot play online.
- `apps/web/Dockerfile` (new): the build stage runs `npm ci` and `next build` with the build arguments
  `NEXT_PUBLIC_SERVER_URL` (required) and `NEXT_PUBLIC_SENTRY_DSN` (optional), then compresses text and
  WebAssembly files with gzip and zstd. The final stage is `caddy:2-alpine` with the files, the Caddyfile and
  the generated snippet.
- `apps/web/Caddyfile` (new, replaces `deploy/Caddyfile`): HTTP on :80, `auto_https off`, trusted private
  proxies, the API paths above proxied to `{$SERVER_UPSTREAM:server:3001}`, everything else from the static
  files with `precompressed`, `404.html` for a missing file, JSON access log.

### Server

- `apps/server/Dockerfile`: the build stage installs the server workspace with its development dependencies
  and bundles `src/index.ts` with esbuild (a new explicit devDependency) into `apps/server/dist/index.js`,
  with a source map and an aliased `createRequire` banner (an unaliased one clashes at startup). The final
  stage is Alpine of the same minor version as the build image, pinned in both, with `libstdc++`, the `node`
  binary, the bundle and `drizzle/`, running as an unprivileged user with `--enable-source-maps`.
- `.dockerignore`: let the web sources into the context.
- The Sentry warning is resolved, and an error raised in the bundled image is shown to reach a stand-in DSN.

### `deploy/`

- `compose.yml`: the table above. `server`: `TRUST_PROXY=2`, `NODE_OPTIONS=--max-old-space-size=128`.
  `postgres`: `shared_buffers=64MB`. `web`: health check requests `/health` through itself, so it proves both
  containers; `depends_on` a healthy `server`. Remove the `caddy` service and its volumes.
- `env.example`: drop `API_DOMAIN`; `CLIENT_ORIGIN` and `PUBLIC_URL` are `https://chess.duydq.cloud`.
- `deploy.sh`: after a successful `up --wait`, record the SHA in `last-good`, and remove every `chess-server`
  and `chess-web` image except that one and the one `last-good` held before. A failed deploy removes nothing.
  The existing `docker image prune -f` stays (untagged images only); no other tagged image is removed.
- `backup.sh`, `restore.sh`: unchanged.

### CI (`.github/workflows/ci.yml`)

- First, find why `online.spec` times out on Chromium (from its trace) and fix the cause.
- `check`: unchanged apart from the variables the compose check needs.
- `e2e`: build the `chess-web` image with `NEXT_PUBLIC_SERVER_URL=http://localhost:3000` and run it on port
  3000 with `SERVER_UPSTREAM` pointing at the test server on the host (`TRUST_PROXY=1`). This puts one origin,
  the real headers and the real routing under test. Running e2e locally now needs Docker for the site too.
- `image`: build `chess-server` and `chess-web`, tagged with the commit SHA and `latest`, with a separate build
  cache for each. The site's address comes from the repository variable `SITE_URL`; a push to `main` fails if
  it is unset.
- `deploy`: unchanged.

### README

Replace the Vercel and two-domain instructions with this setup.

## Changes in the other application's repository

Made there, because its deploy updates the files on the VPS from that repository.

- Caddyfile: a `chess.duydq.cloud` site block with `reverse_proxy chess-web:80`.
- Compose: its `caddy` also joins the external network `edge`; memory limit from 32 MB to 64 MB.
- Deploy script: keep the 3 newest images of its backend and remove older ones.

Applying this recreates its Caddy, which interrupts its API for a few seconds. The owner picks the time.

## Order of rollout

1. Code changes here, CI green, pull request.
2. Owner: decide about committing the new piece models; add the DNS `A` record for `chess`; register a GitHub
   OAuth app with the callback `https://chess.duydq.cloud/auth/github/callback` (Google optional); create the
   private backup repository; set the `SITE_URL` variable.
3. With the owner's approval, on the VPS: the `deploy` user (in the `docker` group, so close to root; its key
   is separate and revocable), `/opt/chess`, the `edge` network.
4. Owner: fill `/opt/chess/.env`, add the four `production` secrets, set up the backup deploy key and cron.
5. Deploy the other application's change, after `edge` and the DNS record exist.
6. Owner merges into `main`: first deploy.
7. Acceptance.

## Error handling

- A bad SHA, a failed backup or a failed pull leaves the running containers as they are.
- A new version that never turns healthy fails the job; roll back by running the workflow with an earlier SHA.
- Once Postgres runs, a deploy without a working backup stops. Backups are therefore set up before the first
  deploy.
- The other application's change is undone by reverting it and deploying that repository again.

## Testing

- Existing tests stay green; the header generator has its own.
- e2e on three browsers runs against the real `chess-web` image.
- `shellcheck`, `docker compose config` and `caddy validate`.
- The pruning in `deploy.sh` is exercised against local images, including a failed deploy.
- On the VPS: the client address in the server's rate limiting is the visitor's, a manual backup and a restore
  succeed.

## Done when

- `https://chess.duydq.cloud` loads over HTTPS with the security headers, and sign-in works.
- A game against the computer works, and an online game between two devices works.
- The other application answers as before.
- The server image is about 200 MB and the site image about 110 MB on disk, most of the latter shared with the
  Caddy image already there.
- A push to `main` deploys by itself, and the VPS keeps two versions.

## Out of scope

Zero-downtime deploys (a deploy ends games in progress), a CI limit on image size, a staging environment,
uploading Sentry source maps for the site, and creating the Sentry and uptime-monitor accounts.
